import crypto from 'node:crypto';
import binanceService from './binanceService.js';
import mercadoPagoArService from './mercadoPagoArService.js';
import mercadoPagoBrService from './mercadoPagoBrService.js';
import alertService from './alertService.js';
import Transaction from '../models/Transaction.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

class ExchangeEngine {

    async getQuote(type, amount) {
        let askUsdtArs, bidUsdtArs, askUsdtBrl, bidUsdtBrl;
        let usingFallback = false;

        try {
            const usdtArsBook = await binanceService.getBestOrderBook('USDTARS');
            const usdtBrlBook = await binanceService.getBestOrderBook('USDTBRL');
            askUsdtArs = usdtArsBook.askPrice;
            bidUsdtArs = usdtArsBook.bidPrice;
            askUsdtBrl = usdtBrlBook.askPrice;
            bidUsdtBrl = usdtBrlBook.bidPrice;
        } catch (binanceError) {
            logger.warn(`[ExchangeEngine] Binance API no disponible, usando cotizaciones fallback: ${binanceError.message}`);
            usingFallback = true;
            askUsdtArs = 1575.80;
            bidUsdtArs = 1574.70;
            askUsdtBrl = 5.1022;
            bidUsdtBrl = 5.1021;
        }

        let amountUSDT, amountTarget, currencySource, currencyTarget;
        const fxRateSnapshot = { askUsdtArs, bidUsdtArs, askUsdtBrl, bidUsdtBrl, timestamp: Date.now(), isFallback: usingFallback };
        const margin = config.fxMarginPercentage;

        if (type === 'ARS_TO_BRL') {
            currencySource = 'ARS';
            currencyTarget = 'BRL';
            amountUSDT = amount / askUsdtArs;
            amountTarget = amountUSDT * bidUsdtBrl;
        } else if (type === 'BRL_TO_ARS') {
            currencySource = 'BRL';
            currencyTarget = 'ARS';
            amountUSDT = amount / askUsdtBrl;
            amountTarget = amountUSDT * bidUsdtArs;
        } else {
            throw new Error('Tipo de intercambio no soportado. Use ARS_TO_BRL o BRL_TO_ARS.');
        }

        const marginAmount = amountTarget * margin;
        amountTarget = amountTarget - marginAmount;

        return {
            amountSource: amount,
            currencySource,
            amountTarget: parseFloat(amountTarget.toFixed(2)),
            currencyTarget,
            amountUsdtEstimate: parseFloat(amountUSDT.toFixed(8)),
            rateSnapshot: fxRateSnapshot,
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
