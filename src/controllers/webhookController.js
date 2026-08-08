import mercadoPagoArService from '../services/mercadoPagoArService.js';
import mercadoPagoBrService from '../services/mercadoPagoBrService.js';
import Transaction from '../models/Transaction.js';
import exchangeEngine from '../services/exchangeEngine.js';
import { logger } from '../utils/logger.js';

/**
 * Webhook de Mercado Pago Argentina (ARS payments via checkout)
 */
export const handleMercadoPagoArWebhook = async (req, res) => {
    try {
        res.status(200).send('OK');

        const { type, data } = req.body;
        if (type !== 'payment' || !data?.id) return;

        const paymentId = String(data.id);
        logger.info(`[Webhook MP AR] Notificación recibida: payment ${paymentId}`);

        const paymentInfo = await mercadoPagoArService.getPaymentInfo(paymentId);
        if (paymentInfo.status !== 'approved') {
            logger.info(`[Webhook MP AR] Pago ${paymentId} no aprobado (status: ${paymentInfo.status})`);
            return;
        }

        const externalRef = paymentInfo.external_reference;
        if (!externalRef) return;

        const tx = await Transaction.findByTransactionId(externalRef);
        if (!tx || tx.status !== 'PENDING_PAYMENT') {
            logger.warn(`[Webhook MP AR] TX ${externalRef} no apta (status: ${tx?.status})`);
            return;
        }

        await Transaction.updateStatus(externalRef, 'PAYMENT_RECEIVED', {
            mp_payment_id: paymentId
        });

        logger.info(`[Webhook MP AR] ✅ Pago ARS confirmado para TX ${externalRef}`);
    } catch (error) {
        logger.error(`[Webhook MP AR] Error: ${error.message}`);
    }
};

/**
 * Webhook de Mercado Pago Brasil (BRL PIX payments)
 */
export const handleMercadoPagoBrWebhook = async (req, res) => {
    try {
        res.status(200).send('OK');

        const { type, data } = req.body;
        if (type !== 'payment' || !data?.id) return;

        const paymentId = String(data.id);
        logger.info(`[Webhook MP BR] Notificación recibida: payment ${paymentId}`);

        const paymentInfo = await mercadoPagoBrService.getPaymentInfo(paymentId);
        if (paymentInfo.status !== 'approved') {
            logger.info(`[Webhook MP BR] Pago ${paymentId} no aprobado (status: ${paymentInfo.status})`);
            return;
        }

        const externalRef = paymentInfo.external_reference;
        if (!externalRef) return;

        const tx = await Transaction.findByTransactionId(externalRef);
        if (!tx || tx.status !== 'PENDING_PAYMENT') {
            logger.warn(`[Webhook MP BR] TX ${externalRef} no apta (status: ${tx?.status})`);
            return;
        }

        await Transaction.updateStatus(externalRef, 'PAYMENT_RECEIVED', {
            mp_payment_id: paymentId
        });

        logger.info(`[Webhook MP BR] ✅ Pago BRL/PIX confirmado para TX ${externalRef}`);
    } catch (error) {
        logger.error(`[Webhook MP BR] Error: ${error.message}`);
    }
};
