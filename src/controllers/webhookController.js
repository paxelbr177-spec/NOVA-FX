import exchangeEngine from '../services/exchangeEngine.js';
import mercadoPagoService from '../services/mercadoPagoService.js';
import mercadoPagoArService from '../services/mercadoPagoArService.js';
import Transaction from '../models/Transaction.js';
import { logger } from '../utils/logger.js';

import koyweService from '../services/koyweService.js';

/**
 * @description Procesa webhooks provenientes de Koywe
 */
export const handleKoyweWebhook = async (req, res, next) => {
    res.status(200).send('OK');

    try {
        const payload = req.body || {};
        // Koywe suele enviar { orderId, externalId, status, type, ... }
        const orderId = payload.orderId || payload.id;
        const externalId = payload.externalId;
        const status = payload.status;
        
        logger.info(`[WebhookController] Webhook Koywe recibido (Order ID: ${orderId}, Ext ID: ${externalId}, Status: ${status})`);

        if (!orderId) return;

        // Si la orden no está en un estado exitoso, ignoramos
        if (status !== 'PROCESSED' && status !== 'COMPLETED' && status !== 'SUCCESS') {
            return;
        }

        const existingTx = await Transaction.findByMpPaymentId(String(orderId)) || await Transaction.findByTransactionId(String(externalId));
        if (existingTx && existingTx.status === 'PENDING_PAYMENT') {
            if (existingTx.type === 'BRL_TO_ARS') {
                logger.info(`[WebhookController] Pago Koywe BRL (PIX) confirmado para TX ${existingTx.transaction_id}`);
                await exchangeEngine.processBrlPayment(String(orderId));
            } else if (existingTx.type === 'ARS_TO_BRL') {
                logger.info(`[WebhookController] Pago Koywe ARS confirmado para TX ${existingTx.transaction_id}`);
                await exchangeEngine.processArsDeposit(String(externalId) || String(orderId));
            }
        }
    } catch (error) {
        logger.error(`[WebhookController] Error procesando webhook de Koywe: ${error.message}`);
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
