import crypto from 'node:crypto';
import binanceService from './binanceService.js';
import criptoyaService from './criptoyaService.js';
import mercadoPagoArService from './mercadoPagoArService.js';
import mercadoPagoBrService from './mercadoPagoBrService.js';
import alertService from './alertService.js';
import Transaction from '../models/Transaction.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

class ExchangeEngine {

    /**
     * Obtiene cotización usando precios reales de CriptoYa (Satoshi Tango/Belo/Fiwind)
     * con la comisión del 2% aplicada. Si CriptoYa falla, usa Binance como fallback.
     *
     * ARS→BRL: el cliente paga ARS, recibe BRL.
     *   - Usamos bestBuy.price (el más barato para COMPRAR BRL en el mercado)
     *   - Le cobramos al cliente bestBuy.price * (1 + margin) ARS por cada BRL
     *   - amountTarget = amountARS / (bestBuy.price * (1 + margin))
     *
     * BRL→ARS: el cliente paga BRL, recibe ARS.
     *   - Usamos bestSell.price (el mejor precio para VENDER BRL en el mercado)
     *   - Le damos al cliente bestSell.price * (1 - margin) ARS por cada BRL
     *   - amountTarget = amountBRL * (bestSell.price * (1 - margin))
     */
    async getQuote(type, amount) {
        const margin = config.fxMarginPercentage; // 0.02 = 2%
        let rateSource = 'criptoya';
        let bestBuyPrice = null;
        let bestSellPrice = null;
        let bestBuyPlatform = null;
        let bestSellPlatform = null;
        let criptoyaRates = {};

        // 1. Intentar obtener tasas reales de CriptoYa
        try {
            const ratesData = await criptoyaService.getRealRates();
            if (ratesData.bestBuy?.price && ratesData.bestSell?.price) {
                bestBuyPrice = ratesData.bestBuy.price;
                bestBuyPlatform = ratesData.bestBuy.platform;
                bestSellPrice = ratesData.bestSell.price;
                bestSellPlatform = ratesData.bestSell.platform;
                criptoyaRates = ratesData.rates;
                logger.info(`[ExchangeEngine] CriptoYa rates: bestBuy=${bestBuyPlatform}@${bestBuyPrice}, bestSell=${bestSellPlatform}@${bestSellPrice}`);
            } else {
                throw new Error('CriptoYa no devolvió tasas válidas');
            }
        } catch (criptoyaError) {
            logger.warn(`[ExchangeEngine] CriptoYa no disponible, usando Binance fallback: ${criptoyaError.message}`);
            rateSource = 'binance_fallback';

            // Fallback: calcular tasa cruzada desde Binance
            let askUsdtArs, bidUsdtArs, askUsdtBrl, bidUsdtBrl;
            try {
                const usdtArsBook = await binanceService.getBestOrderBook('USDTARS');
                const usdtBrlBook = await binanceService.getBestOrderBook('USDTBRL');
                askUsdtArs = usdtArsBook.askPrice;
                bidUsdtArs = usdtArsBook.bidPrice;
                askUsdtBrl = usdtBrlBook.askPrice;
                bidUsdtBrl = usdtBrlBook.bidPrice;
            } catch (binanceError) {
                logger.warn(`[ExchangeEngine] Binance también falló, usando hardcoded: ${binanceError.message}`);
                rateSource = 'hardcoded_fallback';
                askUsdtArs = 1575.80;
                bidUsdtArs = 1574.70;
                askUsdtBrl = 5.1022;
                bidUsdtBrl = 5.1021;
            }

            // Tasa cruzada: ARS por 1 BRL
            bestBuyPrice = parseFloat((askUsdtArs / bidUsdtBrl).toFixed(2));
            bestSellPrice = parseFloat((bidUsdtArs / askUsdtBrl).toFixed(2));
            bestBuyPlatform = 'binance_cross';
            bestSellPlatform = 'binance_cross';
        }

        // 2. Calcular cotización con comisión
        let amountTarget, currencySource, currencyTarget, clientRate;

        if (type === 'ARS_TO_BRL') {
            currencySource = 'ARS';
            currencyTarget = 'BRL';
            // Tasa al cliente: más cara que nuestro costo (sumamos comisión)
            clientRate = bestBuyPrice * (1 + margin);
            amountTarget = amount / clientRate;
        } else if (type === 'BRL_TO_ARS') {
            currencySource = 'BRL';
            currencyTarget = 'ARS';
            // Tasa al cliente: menos ARS de lo que recibimos (restamos comisión)
            clientRate = bestSellPrice * (1 - margin);
            amountTarget = amount * clientRate;
        } else {
            throw new Error('Tipo de intercambio no soportado. Use ARS_TO_BRL o BRL_TO_ARS.');
        }

        const rateSnapshot = {
            source: rateSource,
            bestBuyPrice,
            bestBuyPlatform,
            bestSellPrice,
            bestSellPlatform,
            clientRate: parseFloat(clientRate.toFixed(2)),
            criptoyaRates,
            timestamp: Date.now()
        };

        return {
            amountSource: amount,
            currencySource,
            amountTarget: parseFloat(amountTarget.toFixed(2)),
            currencyTarget,
            clientRate: parseFloat(clientRate.toFixed(2)),
            rateSnapshot,
            marginApplied: margin,
            expiresAt: new Date(Date.now() + 30000).toISOString()
        };
    }

    async initiateArsToBlr({ amountARS, clientPixKey, clientPixKeyType, clientName, clientEmail, clientPhone }) {
        try {
            const transactionId = `TXN-${Date.now()}-${crypto.randomUUID()}`;
            const quote = await this.getQuote('ARS_TO_BRL', amountARS);

            await Transaction.create({
                transactionId,
                type: 'ARS_TO_BRL',
                amountSource: quote.amountSource,
                currencySource: quote.currencySource,
                amountTarget: quote.amountTarget,
                currencyTarget: quote.currencyTarget,
                clientPixKey,
                clientPixKeyType,
                clientName,
                clientEmail,
                clientPhone,
                fxRateSnapshot: quote.rateSnapshot,
                marginApplied: quote.marginApplied
            });

            // Generate MP Argentina checkout preference
            let arsPayment = { checkoutUrl: null, preferenceId: null };
            try {
                const pref = await mercadoPagoArService.createPreference({
                    amount: amountARS,
                    description: `NOVA FX - ${amountARS} ARS → BRL (${transactionId.substring(0,18)})`,
                    externalReference: transactionId,
                    payerEmail: clientEmail
                });
                arsPayment = {
                    preferenceId: pref.preferenceId,
                    checkoutUrl: pref.initPoint,
                    sandboxUrl: pref.sandboxInitPoint
                };
                await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT', {
                    mp_ar_preference_id: pref.preferenceId
                });
            } catch (mpError) {
                logger.warn(`[ExchangeEngine] MP AR preference failed, using static deposit: ${mpError.message}`);
                await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT');
            }

            logger.info(`[ExchangeEngine] Flujo A iniciado: ${transactionId}`);

            return {
                transactionId,
                type: 'ARS_TO_BRL',
                status: 'PENDING_PAYMENT',
                amountSource: amountARS,
                currencySource: 'ARS',
                amountTarget: quote.amountTarget,
                currencyTarget: 'BRL',
                clientName,
                clientEmail,
                clientPhone,
                arsPayment,
                quote
            };
        } catch (error) {
            logger.error(`[ExchangeEngine] Error en initiateArsToBlr: ${error.message}`);
            throw error;
        }
    }

    async initiateBrlToArs({ amountBRL, clientCbuCvu, payerEmail, clientName, clientPhone }) {
        try {
            const transactionId = `TXN-${Date.now()}-${crypto.randomUUID()}`;
            const quote = await this.getQuote('BRL_TO_ARS', amountBRL);

            await Transaction.create({
                transactionId,
                type: 'BRL_TO_ARS',
                amountSource: quote.amountSource,
                currencySource: quote.currencySource,
                amountTarget: quote.amountTarget,
                currencyTarget: quote.currencyTarget,
                clientCbuCvu,
                clientName,
                clientEmail: payerEmail,
                clientPhone,
                fxRateSnapshot: quote.rateSnapshot,
                marginApplied: quote.marginApplied
            });

            // Generate MP Brasil PIX payment
            let pixPayment = { paymentId: null, qrCode: '', qrCodeBase64: '', ticketUrl: '' };
            try {
                const pix = await mercadoPagoBrService.createPixPayment({
                    amount: amountBRL,
                    description: `NOVA FX - R$${amountBRL} BRL → ARS (${transactionId.substring(0,18)})`,
                    externalReference: transactionId,
                    payerEmail: payerEmail
                });
                pixPayment = pix;
                await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT', {
                    mp_payment_id: pix.paymentId,
                    mp_pix_qr_code: pix.qrCode
                });
            } catch (mpError) {
                logger.warn(`[ExchangeEngine] MP BR PIX failed: ${mpError.message}`);
                await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT');
            }

            logger.info(`[ExchangeEngine] Flujo B iniciado: ${transactionId}`);

            return {
                transactionId,
                type: 'BRL_TO_ARS',
                status: 'PENDING_PAYMENT',
                amountSource: amountBRL,
                currencySource: 'BRL',
                amountTarget: quote.amountTarget,
                currencyTarget: 'ARS',
                pixPayment,
                quote
            };
        } catch (error) {
            logger.error(`[ExchangeEngine] Error en initiateBrlToArs: ${error.message}`);
            throw error;
        }
    }
}

export default new ExchangeEngine();
