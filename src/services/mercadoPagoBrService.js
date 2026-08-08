import axios from 'axios';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

class MercadoPagoBrService {
    constructor() {
        this.accessToken = config.mpBrAccessToken || '';
        this.baseUrl = 'https://api.mercadopago.com';
    }

    async createPixPayment({ amount, description, externalReference, payerEmail }) {
        try {
            const idempotencyKey = crypto.randomUUID();
            const payload = {
                transaction_amount: Number(amount.toFixed(2)),
                description: description || `Cambio FX ${externalReference}`,
                payment_method_id: 'pix',
                external_reference: externalReference,
                notification_url: `${process.env.RENDER_EXTERNAL_URL || 'https://nova-fx.onrender.com'}/api/v1/webhooks/mercadopago-br`,
                payer: {
                    email: payerEmail || 'cliente@novafx.com'
                }
            };

            const res = await axios.post(`${this.baseUrl}/v1/payments`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': idempotencyKey
                },
                timeout: 15000
            });

            const pixData = res.data.point_of_interaction?.transaction_data || {};
            logger.info(`[MercadoPagoBR] Pago PIX creado: ${res.data.id} (R$${amount})`);

            return {
                paymentId: String(res.data.id),
                qrCode: pixData.qr_code || '',
                qrCodeBase64: pixData.qr_code_base64 || '',
                ticketUrl: pixData.ticket_url || '',
                expiresAt: res.data.date_of_expiration || null
            };
        } catch (error) {
            const errData = error.response?.data || error.message;
            logger.error(`[MercadoPagoBR] Error creando pago PIX: ${JSON.stringify(errData)}`);
            throw new Error(`Error MercadoPago BR: ${JSON.stringify(errData)}`);
        }
    }

    async getPaymentInfo(paymentId) {
        try {
            const res = await axios.get(`${this.baseUrl}/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
                timeout: 10000
            });
            return res.data;
        } catch (error) {
            logger.error(`[MercadoPagoBR] Error obteniendo pago ${paymentId}: ${error.message}`);
            throw error;
        }
    }
}

export default new MercadoPagoBrService();
