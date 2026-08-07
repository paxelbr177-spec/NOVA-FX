import exchangeEngine from '../services/exchangeEngine.js';
import mercadoPagoService from '../services/mercadoPagoService.js';
import mercadoPagoArService from '../services/mercadoPagoArService.js';
import Transaction from '../models/Transaction.js';
import { logger } from '../utils/logger.js';

/**
 * @description Procesa webhooks provenientes de Mercado Pago Brasil
 */
export const handleMercadoPagoWebhook = async (req, res, next) => {
    res.status(200).send('OK');

    try {
        const { action, data, type } = req.body;
        
        if (action === 'payment.updated' || type === 'payment') {
            const paymentId = data?.id;
            if (!paymentId) return;

            const paymentData = await mercadoPagoService.getPaymentStatus(String(paymentId));
            
            if (paymentData.status === 'approved') {
                const existingTx = await Transaction.findByMpPaymentId(String(paymentId));
                if (existingTx && existingTx.status !== 'PENDING_PAYMENT') {
                    logger.info(`[WebhookController] Pago MP Brasil ${paymentId} ya estaba procesado (status: ${existingTx.status}).`);
                    return;
                }

                await exchangeEngine.processBrlPayment(String(paymentId));
            }
        }
    } catch (error) {
        logger.error(`[WebhookController] Error procesando webhook de MP Brasil: ${error.message}`);
    }
};

/**
 * @description Procesa webhooks provenientes de Mercado Pago Argentina
 */
export const handleMercadoPagoArWebhook = async (req, res, next) => {
    res.status(200).send('OK');

    try {
        const { action, data, type } = req.body;
        
        if (action === 'payment.updated' || type === 'payment') {
            const paymentId = data?.id;
            if (!paymentId) return;

            // Si viene external_reference con transactionId (TXN-...)
            const externalRef = req.body?.external_reference || data?.external_reference;
            if (externalRef && externalRef.startsWith('TXN-')) {
                const existingTx = await Transaction.findByTransactionId(externalRef);
                if (existingTx && existingTx.status === 'PENDING_PAYMENT') {
                    logger.info(`[WebhookController] Depósito ARS (MP Argentina ${paymentId}) confirmado para TX ${externalRef}`);
                    await exchangeEngine.processArsDeposit(externalRef);
                }
            }
        }
    } catch (error) {
        logger.error(`[WebhookController] Error procesando webhook de MP Argentina: ${error.message}`);
    }
};

/**
 * @description Procesa webhooks genéricos de confirmación de depósito en ARS
 */
export const handleArsDepositWebhook = async (req, res, next) => {
    res.status(200).send('OK');

    try {
        const { transactionId } = req.body;
        
        if (!transactionId) return;

        const transaction = await Transaction.findByTransactionId(transactionId);
        if (!transaction) {
            logger.warn(`[WebhookController] Transacción ${transactionId} no encontrada para depósito ARS.`);
            return;
        }

        if (transaction.status !== 'PENDING_PAYMENT') {
            logger.info(`[WebhookController] Transacción ARS ${transactionId} ya fue procesada. Estado actual: ${transaction.status}`);
            return;
        }

        await exchangeEngine.processArsDeposit(transactionId);
    } catch (error) {
        logger.error(`[WebhookController] Error procesando webhook de ARS: ${error.message}`);
    }
};
