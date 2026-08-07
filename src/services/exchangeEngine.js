import crypto from 'node:crypto';
import binanceService from './binanceService.js';
import mercadoPagoService from './mercadoPagoService.js';
import mercadoPagoArService from './mercadoPagoArService.js';
import alertService from './alertService.js';
import Transaction from '../models/Transaction.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Motor de Intercambio que orquesta los flujos completos de conversión de divisas.
 * Coordina Binance (motor cripto), Mercado Pago (pasarela PIX) y la base de datos.
 */
class ExchangeEngine {

    /**
     * Obtiene una cotización en tiempo real para un intercambio.
     * @param {'ARS_TO_BRL' | 'BRL_TO_ARS'} type - Tipo de conversión.
     * @param {number} amount - Monto en la moneda de origen.
     * @returns {Promise<Object>} Datos completos de la cotización.
     */
    async getQuote(type, amount) {
        try {
            // Obtener precios reales de Binance (Book Ticker para mejor precio)
            const usdtArsBook = await binanceService.getBestOrderBook('USDTARS');
            const usdtBrlBook = await binanceService.getBestOrderBook('USDTBRL');

            const askUsdtArs = usdtArsBook.askPrice; // Precio al que comprarías USDT pagando ARS
            const bidUsdtArs = usdtArsBook.bidPrice; // Precio al que venderías USDT recibiendo ARS
            const askUsdtBrl = usdtBrlBook.askPrice; // Precio al que comprarías USDT pagando BRL
            const bidUsdtBrl = usdtBrlBook.bidPrice; // Precio al que venderías USDT recibiendo BRL

            let amountUSDT, amountTarget, currencySource, currencyTarget;
            const fxRateSnapshot = { askUsdtArs, bidUsdtArs, askUsdtBrl, bidUsdtBrl, timestamp: Date.now() };
            const margin = config.fxMarginPercentage; // ej: 0.02 = 2%

            if (type === 'ARS_TO_BRL') {
                currencySource = 'ARS';
                currencyTarget = 'BRL';
                // Comprar USDT con ARS (al ask price) → Vender USDT por BRL (al bid price)
                amountUSDT = amount / askUsdtArs;
                amountTarget = amountUSDT * bidUsdtBrl;
            } else if (type === 'BRL_TO_ARS') {
                currencySource = 'BRL';
                currencyTarget = 'ARS';
                // Comprar USDT con BRL (al ask price) → Vender USDT por ARS (al bid price)
                amountUSDT = amount / askUsdtBrl;
                amountTarget = amountUSDT * bidUsdtArs;
            } else {
                throw new Error('Tipo de intercambio no soportado. Use ARS_TO_BRL o BRL_TO_ARS.');
            }

            // Aplicar margen de comisión (restar del monto destino)
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
                expiresAt: new Date(Date.now() + 30000).toISOString() // 30 segundos de validez
            };

        } catch (error) {
            logger.error(`[ExchangeEngine] Error al obtener cotización (${type}, ${amount}): ${error.message}`);
            throw error;
        }
    }

    /**
     * Inicia el Flujo A: ARS → BRL.
     * Registra la transacción y devuelve instrucciones de depósito.
     * @param {Object} params
     * @param {number} params.amountARS - Monto en Pesos Argentinos a enviar.
     * @param {string} params.clientPixKey - Chave PIX destino del cliente.
     * @param {string} params.clientPixKeyType - Tipo de clave PIX (CPF, EMAIL, PHONE, EVP).
     * @returns {Promise<Object>} Detalles de la transacción con instrucciones de depósito.
     */
    async initiateArsToBlr({ amountARS, clientPixKey, clientPixKeyType }) {
        try {
            const transactionId = `TXN-${Date.now()}-${crypto.randomUUID()}`;
            const quote = await this.getQuote('ARS_TO_BRL', amountARS);

            const tx = await Transaction.create({
                transactionId,
                type: 'ARS_TO_BRL',
                amountSource: quote.amountSource,
                currencySource: quote.currencySource,
                currencyTarget: quote.currencyTarget,
                clientPixKey,
                clientPixKeyType,
                fxRateSnapshot: quote.rateSnapshot,
                marginApplied: quote.marginApplied
            });

            logger.info(`[ExchangeEngine] Flujo A iniciado: ${transactionId} (${amountARS} ARS → BRL)`);

            return {
                transactionId: tx.transaction_id,
                status: tx.status,
                depositInstructions: {
                    // CBU/CVU de recaudación de la empresa (configurar en producción)
                    cbu: '0000003100000000000000',
                    alias: 'empresa.ars.fx',
                    amount: amountARS,
                    reference: transactionId
                },
                quote
            };
        } catch (error) {
            logger.error(`[ExchangeEngine] Error en initiateArsToBlr: ${error.message}`);
            throw error;
        }
    }

    /**
     * Inicia el Flujo B: BRL → ARS.
     * Genera un código PIX dinámico vía Mercado Pago y registra la transacción.
     * @param {Object} params
     * @param {number} params.amountBRL - Monto en Reales Brasileños a enviar.
     * @param {string} params.clientCbuCvu - CBU/CVU destino del cliente en Argentina.
     * @param {string} params.payerEmail - Email del pagador (requerido por Mercado Pago).
     * @returns {Promise<Object>} Detalles de la transacción con código PIX (QR / Copia e Cola).
     */
    async initiateBrlToArs({ amountBRL, clientCbuCvu, payerEmail }) {
        try {
            const transactionId = `TXN-${Date.now()}-${crypto.randomUUID()}`;
            const quote = await this.getQuote('BRL_TO_ARS', amountBRL);

            let tx = await Transaction.create({
                transactionId,
                type: 'BRL_TO_ARS',
                amountSource: quote.amountSource,
                currencySource: quote.currencySource,
                currencyTarget: quote.currencyTarget,
                clientCbuCvu,
                fxRateSnapshot: quote.rateSnapshot,
                marginApplied: quote.marginApplied
            });

            // Generar PIX QR via Mercado Pago Brasil
            const payment = await mercadoPagoService.createPixPayment({
                amount: amountBRL,
                description: `Transferencia FX ${transactionId}`,
                externalReference: transactionId,
                payerEmail: payerEmail
            });

            // Actualizar transacción con datos del pago PIX
            tx = await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT', {
                mp_payment_id: String(payment.paymentId),
                mp_pix_qr_code: payment.qrCode
            });

            logger.info(`[ExchangeEngine] Flujo B iniciado: ${transactionId} (${amountBRL} BRL → ARS, MP Payment: ${payment.paymentId})`);

            return {
                transactionId: tx.transaction_id,
                status: tx.status,
                pixPayment: {
                    paymentId: payment.paymentId,
                    qrCode: payment.qrCode,           // Copia e Cola string
                    qrCodeBase64: payment.qrCodeBase64, // Para renderizar QR en frontend
                    ticketUrl: payment.ticketUrl
                },
                quote
            };
        } catch (error) {
            logger.error(`[ExchangeEngine] Error en initiateBrlToArs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Procesa la confirmación de depósito ARS (Flujo A - pasos 4 a 6).
     * Ejecuta: PAYMENT_RECEIVED → CONVERTING_CRYPTO → DISBURSING_FIAT → COMPLETED
     * @param {string} transactionId - ID único de la transacción.
     */
    async processArsDeposit(transactionId) {
        let tx = null;
        try {
            tx = await Transaction.findByTransactionId(transactionId);
            if (!tx || tx.status !== 'PENDING_PAYMENT') {
                logger.warn(`[ExchangeEngine] processArsDeposit: TX ${transactionId} no apta (status: ${tx?.status})`);
                return;
            }

            // ── Estado: PAYMENT_RECEIVED ──
            tx = await Transaction.updateStatus(transactionId, 'PAYMENT_RECEIVED');
            logger.info(`[ExchangeEngine] [${transactionId}] Depósito ARS confirmado. Iniciando conversión cripto...`);

            // ── Estado: CONVERTING_CRYPTO ──
            tx = await Transaction.updateStatus(transactionId, 'CONVERTING_CRYPTO');

            // Paso 4: Comprar USDT con ARS en Binance (orden de mercado)
            const binanceOrder = await binanceService.executeSpotMarketOrder({
                symbol: 'USDTARS',
                side: 'BUY',
                quoteOrderQty: parseFloat(tx.amount_source) // Gastar esta cantidad de ARS
            });

            // Calcular USDT recibidos y BRL objetivo con margen
            const amountUsdt = parseFloat(binanceOrder.executedQty || binanceOrder.origQty);
            const rateSnapshot = typeof tx.fx_rate_snapshot === 'string' ? JSON.parse(tx.fx_rate_snapshot) : tx.fx_rate_snapshot;
            const amountTargetGross = amountUsdt * rateSnapshot.bidUsdtBrl;
            const margin = amountTargetGross * parseFloat(tx.margin_applied);
            const amountTarget = parseFloat((amountTargetGross - margin).toFixed(2));

            // ── Estado: DISBURSING_FIAT ──
            tx = await Transaction.updateStatus(transactionId, 'DISBURSING_FIAT', {
                amount_usdt: amountUsdt,
                amount_target: amountTarget,
                binance_order_id: String(binanceOrder.orderId)
            });

            logger.info(`[ExchangeEngine] [${transactionId}] Conversión completada: ${amountUsdt} USDT. Desembolsando ${amountTarget} BRL...`);

            // Paso 6: Desembolso PIX al cliente
            await mercadoPagoService.createPixDisbursement({
                amount: amountTarget,
                pixKey: tx.client_pix_key,
                pixKeyType: tx.client_pix_key_type,
                description: `Desembolso FX ${transactionId}`,
                externalReference: transactionId
            });

            // ── Estado: COMPLETED ──
            tx = await Transaction.updateStatus(transactionId, 'COMPLETED');
            logger.info(`[ExchangeEngine] [${transactionId}] ✅ Transacción ARS→BRL COMPLETADA`);
            await alertService.notifySuccessfulTransaction(tx);

        } catch (error) {
            logger.error(`[ExchangeEngine] Error en processArsDeposit (${transactionId}): ${error.message}`);
            if (tx) {
                await Transaction.updateStatus(tx.transaction_id, 'FAILED_NEEDS_REVIEW', {
                    error_details: error.message
                });
                await alertService.notifyFailedTransaction(tx, error);
            }
        }
    }

    /**
     * Procesa la confirmación de pago PIX en BRL (Flujo B - pasos 4 a 5).
     * Ejecuta: PAYMENT_RECEIVED → CONVERTING_CRYPTO → DISBURSING_FIAT → COMPLETED
     * @param {string} mpPaymentId - ID del pago de Mercado Pago.
     */
    async processBrlPayment(mpPaymentId) {
        let tx = null;
        try {
            tx = await Transaction.findByMpPaymentId(mpPaymentId);
            if (!tx || tx.status !== 'PENDING_PAYMENT') {
                logger.warn(`[ExchangeEngine] processBrlPayment: TX con MP ${mpPaymentId} no apta (status: ${tx?.status})`);
                return;
            }

            const transactionId = tx.transaction_id;

            // ── Estado: PAYMENT_RECEIVED ──
            tx = await Transaction.updateStatus(transactionId, 'PAYMENT_RECEIVED');
            logger.info(`[ExchangeEngine] [${transactionId}] Pago PIX BRL confirmado (MP: ${mpPaymentId}). Iniciando conversión cripto...`);

            // ── Estado: CONVERTING_CRYPTO ──
            tx = await Transaction.updateStatus(transactionId, 'CONVERTING_CRYPTO');

            // Paso 4a: Comprar USDT con BRL en Binance
            const binanceOrderBrl = await binanceService.executeSpotMarketOrder({
                symbol: 'USDTBRL',
                side: 'BUY',
                quoteOrderQty: parseFloat(tx.amount_source) // Gastar esta cantidad de BRL
            });

            const amountUsdt = parseFloat(binanceOrderBrl.executedQty || binanceOrderBrl.origQty);

            // Paso 4b: Vender USDT por ARS en Binance
            const binanceOrderArs = await binanceService.executeSpotMarketOrder({
                symbol: 'USDTARS',
                side: 'SELL',
                quantity: amountUsdt // Vender esta cantidad de USDT
            });

            // Calcular monto ARS con margen
            const amountArsGross = parseFloat(binanceOrderArs.cummulativeQuoteQty || (amountUsdt * (typeof tx.fx_rate_snapshot === 'string' ? JSON.parse(tx.fx_rate_snapshot) : tx.fx_rate_snapshot).bidUsdtArs));
            const margin = amountArsGross * parseFloat(tx.margin_applied);
            const amountTarget = parseFloat((amountArsGross - margin).toFixed(2));

            // ── Estado: DISBURSING_FIAT ──
            tx = await Transaction.updateStatus(transactionId, 'DISBURSING_FIAT', {
                amount_usdt: amountUsdt,
                amount_target: amountTarget,
                binance_order_id: `${binanceOrderBrl.orderId},${binanceOrderArs.orderId}`
            });

            logger.info(`[ExchangeEngine] [${transactionId}] Conversión completada: ${amountUsdt} USDT → ${amountTarget} ARS. Desembolsando a CBU/CVU: ${tx.client_cbu_cvu}`);

            // Paso 5: Desembolso ARS al CBU/CVU del cliente vía Mercado Pago Argentina
            await mercadoPagoArService.createArsDisbursement({
                amount: amountTarget,
                cbuCvu: tx.client_cbu_cvu,
                description: `Desembolso FX ${transactionId}`,
                externalReference: transactionId
            });

            // ── Estado: COMPLETED ──
            tx = await Transaction.updateStatus(transactionId, 'COMPLETED');
            logger.info(`[ExchangeEngine] [${transactionId}] ✅ Transacción BRL→ARS COMPLETADA`);
            await alertService.notifySuccessfulTransaction(tx);

        } catch (error) {
            logger.error(`[ExchangeEngine] Error en processBrlPayment (MP: ${mpPaymentId}): ${error.message}`);
            if (tx) {
                await Transaction.updateStatus(tx.transaction_id, 'FAILED_NEEDS_REVIEW', {
                    error_details: error.message
                });
                await alertService.notifyFailedTransaction(tx, error);
            }
        }
    }
}

export default new ExchangeEngine();
