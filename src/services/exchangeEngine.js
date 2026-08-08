import crypto from 'node:crypto';
import binanceService from './binanceService.js';
import koyweService from './koyweService.js';
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
        let askUsdtArs, bidUsdtArs, askUsdtBrl, bidUsdtBrl;
        let usingFallback = false;

        try {
            // Intentar obtener precios reales de Binance (Book Ticker para mejor precio)
            const usdtArsBook = await binanceService.getBestOrderBook('USDTARS');
            const usdtBrlBook = await binanceService.getBestOrderBook('USDTBRL');

            askUsdtArs = usdtArsBook.askPrice;
            bidUsdtArs = usdtArsBook.bidPrice;
            askUsdtBrl = usdtBrlBook.askPrice;
            bidUsdtBrl = usdtBrlBook.bidPrice;
        } catch (binanceError) {
            // Fallback: usar cotizaciones de referencia si Binance no responde
            logger.warn(`[ExchangeEngine] Binance API no disponible, usando cotizaciones fallback: ${binanceError.message}`);
            usingFallback = true;
            askUsdtArs = 1575.80;
            bidUsdtArs = 1574.70;
            askUsdtBrl = 5.1022;
            bidUsdtBrl = 5.1021;
        }

        let amountUSDT, amountTarget, currencySource, currencyTarget;
        const fxRateSnapshot = { askUsdtArs, bidUsdtArs, askUsdtBrl, bidUsdtBrl, timestamp: Date.now(), isFallback: usingFallback };
        const margin = config.fxMarginPercentage; // ej: 0.02 = 2%

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
            expiresAt: new Date(Date.now() + 30000).toISOString()
        };
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
    async initiateArsToBlr({ amountARS, clientPixKey, clientPixKeyType, clientName, clientEmail, clientPhone }) {
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
                clientName,
                clientEmail,
                clientPhone,
                fxRateSnapshot: quote.rateSnapshot,
                marginApplied: quote.marginApplied
            });

            // Generar PAYIN en ARS via Koywe
            const arsPayin = await koyweService.createArsPayin({
                amountArs: amountARS,
                externalReference: transactionId,
                clientEmail: clientEmail
            });

            await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT', {
                koywe_order_id: arsPayin.orderId
            });

            logger.info(`[ExchangeEngine] Flujo A iniciado: ${transactionId} (Koywe Order: ${arsPayin.orderId})`);

            return {
                transactionId: tx.transaction_id || transactionId,
                type: 'ARS_TO_BRL',
                status: 'PENDING_PAYMENT',
                amountSource: amountARS,
                currencySource: 'ARS',
                amountTarget: quote.amountTarget,
                currencyTarget: 'BRL',
                clientName,
                clientEmail,
                clientPhone,
                arsPayment: {
                    koyweOrderId: arsPayin.orderId,
                    checkoutUrl: arsPayin.paymentUrl || arsPayin.paymentLink || '#', // URL de pago si Koywe devuelve una
                    cbu: arsPayin.paymentDetails?.cbu || null,
                    alias: arsPayin.paymentDetails?.alias || null,
                    amount: amountARS
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
     * @param {string} [params.clientName] - Nombre del cliente.
     * @param {string} [params.clientPhone] - WhatsApp del cliente.
     * @returns {Promise<Object>} Detalles de la transacción con código PIX (QR / Copia e Cola).
     */
    async initiateBrlToArs({ amountBRL, clientCbuCvu, payerEmail, clientName, clientPhone }) {
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
                clientName,
                clientEmail: payerEmail,
                clientPhone,
                fxRateSnapshot: quote.rateSnapshot,
                marginApplied: quote.marginApplied
            });

            // Generar PIX QR via Koywe
            const payin = await koyweService.createPixPayin({
                amountBrl: amountBRL,
                externalReference: transactionId,
                clientEmail: payerEmail
            });

            // Actualizar transacción con datos del pago PIX de Koywe
            tx = await Transaction.updateStatus(transactionId, 'PENDING_PAYMENT', {
                koywe_order_id: String(payin.orderId),
                mp_pix_qr_code: payin.paymentDetails?.qrCode || payin.paymentDetails?.pixCopiaECola
            });

            logger.info(`[ExchangeEngine] Flujo B iniciado: ${transactionId} (Koywe Order: ${payin.orderId})`);

            return {
                transactionId: tx.transaction_id || transactionId,
                type: 'BRL_TO_ARS',
                status: 'PENDING_PAYMENT',
                amountSource: amountBRL,
                currencySource: 'BRL',
                amountTarget: quote.amountTarget,
                currencyTarget: 'ARS',
                pixPayment: {
                    paymentId: payin.orderId,
                    qrCode: payin.paymentDetails?.qrCode || payin.paymentDetails?.pixCopiaECola || 'QR_NOT_PROVIDED_YET',
                    qrCodeBase64: payin.paymentDetails?.qrCodeBase64 || null
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
    async processArsDeposit(transactionId, actualAmountPaid = null) {
        let tx = null;
        try {
            tx = await Transaction.findByTransactionId(transactionId);
            if (!tx || tx.status !== 'PENDING_PAYMENT') {
                logger.warn(`[ExchangeEngine] processArsDeposit: TX ${transactionId} no apta (status: ${tx?.status})`);
                return;
            }

            let amountToProcess = parseFloat(tx.amount_source);
            
            // ── Estado: PAYMENT_RECEIVED ──
            tx = await Transaction.updateStatus(transactionId, 'PAYMENT_RECEIVED');
            logger.info(`[ExchangeEngine] [${transactionId}] Depósito ARS confirmado ($${amountToProcess} ARS).`);

            // Calcular monto objetivo con margen
            const rateSnapshot = typeof tx.fx_rate_snapshot === 'string' ? JSON.parse(tx.fx_rate_snapshot) : tx.fx_rate_snapshot;
            // Cálculo directo fiat-a-fiat (ARS -> BRL)
            const amountUsdtEstimate = amountToProcess / (rateSnapshot.askUsdtArs || 1575.80);
            const amountTargetGross = amountUsdtEstimate * (rateSnapshot.bidUsdtBrl || 5.10);
            const margin = amountTargetGross * parseFloat(tx.margin_applied);
            const amountTarget = parseFloat((amountTargetGross - margin).toFixed(2));

            // ── Estado: DISBURSING_FIAT ──
            tx = await Transaction.updateStatus(transactionId, 'DISBURSING_FIAT', {
                amount_target: amountTarget
            });

            logger.info(`[ExchangeEngine] [${transactionId}] Emitiendo orden Koywe PAYOUT BRL: ${amountTarget}`);

            // Paso: Desembolso PIX al cliente via Koywe
            const payout = await koyweService.createPixPayout({
                amountBrl: amountTarget,
                pixKey: tx.client_pix_key,
                externalReference: transactionId
            });

            // ── Estado: COMPLETED ──
            tx = await Transaction.updateStatus(transactionId, 'COMPLETED', {
                koywe_payout_order_id: payout.orderId
            });
            logger.info(`[ExchangeEngine] [${transactionId}] ✅ Transacción ARS→BRL COMPLETADA y PAYOUT enviado`);
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
    async processBrlPayment(orderIdOrTxId) {
        let tx = null;
        try {
            // Buscamos por koywe_order_id o transaction_id
            tx = await Transaction.findByMpPaymentId(orderIdOrTxId) || await Transaction.findByTransactionId(orderIdOrTxId);
            if (!tx || tx.status !== 'PENDING_PAYMENT') {
                logger.warn(`[ExchangeEngine] processBrlPayment: TX no apta (status: ${tx?.status})`);
                return;
            }

            const transactionId = tx.transaction_id;

            // ── Estado: PAYMENT_RECEIVED ──
            tx = await Transaction.updateStatus(transactionId, 'PAYMENT_RECEIVED');
            logger.info(`[ExchangeEngine] [${transactionId}] Pago PIX BRL confirmado. Calculando Payout ARS...`);

            // Calcular ARS target con márgenes
            const rateSnapshot = typeof tx.fx_rate_snapshot === 'string' ? JSON.parse(tx.fx_rate_snapshot) : (tx.fx_rate_snapshot || { askUsdtArs: 1575.80, askUsdtBrl: 5.1022 });
            const amountUsdt = parseFloat((tx.amount_source / (rateSnapshot.askUsdtBrl || 5.1022)).toFixed(8));
            const amountArsGross = amountUsdt * (rateSnapshot.askUsdtArs || 1575.80);
            const margin = amountArsGross * parseFloat(tx.margin_applied || 0.02);
            const amountTarget = parseFloat((amountArsGross - margin).toFixed(2));

            // ── Estado: DISBURSING_FIAT ──
            tx = await Transaction.updateStatus(transactionId, 'DISBURSING_FIAT', {
                amount_target: amountTarget
            });

            logger.info(`[ExchangeEngine] [${transactionId}] Emitiendo orden Koywe PAYOUT ARS: ${amountTarget} al CBU: ${tx.client_cbu_cvu}`);

            // Paso: Desembolso ARS al CBU/CVU del cliente vía Koywe
            const payout = await koyweService.createArsPayout({
                amountArs: amountTarget,
                cbuCvu: tx.client_cbu_cvu,
                externalReference: transactionId
            });

            // ── Estado: COMPLETED ──
            tx = await Transaction.updateStatus(transactionId, 'COMPLETED', {
                koywe_payout_order_id: payout.orderId
            });
            logger.info(`[ExchangeEngine] [${transactionId}] ✅ Transacción BRL→ARS COMPLETADA y PAYOUT enviado`);
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
