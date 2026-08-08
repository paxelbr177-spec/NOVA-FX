import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

class MercadoPagoArService {
    constructor() {
        this.accessToken = config.mpArAccessToken || '';
        this.baseUrl = 'https://api.mercadopago.com';
    }

    async createPreference({ amount, description, externalReference, payerEmail }) {
        try {
            const payload = {
                items: [{
                    title: description || `Cambio FX ${externalReference}`,
                    quantity: 1,
                    unit_price: Number(amount.toFixed(2)),
                    currency_id: 'ARS'
                }],
                external_reference: externalReference,
                notification_url: `${process.env.RENDER_EXTERNAL_URL || 'https://nova-fx.onrender.com'}/api/v1/webhooks/mercadopago-ar`,
                back_urls: {
                    success: `${process.env.FRONTEND_URL || 'https://nova-fx.onrender.com'}?tx=${externalReference}&status=success`,
                    failure: `${process.env.FRONTEND_URL || 'https://nova-fx.onrender.com'}?tx=${externalReference}&status=failure`,
                    pending: `${process.env.FRONTEND_URL || 'https://nova-fx.onrender.com'}?tx=${externalReference}&status=pending`
                },
                auto_return: 'approved'
            };
            if (payerEmail) payload.payer = { email: payerEmail };

            const res = await axios.post(`${this.baseUrl}/checkout/preferences`, payload, {
                headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });

            logger.info(`[MercadoPagoAR] Preferencia creada: ${res.data.id} ($${amount} ARS)`);
            return {
                preferenceId: res.data.id,
                initPoint: res.data.init_point,
                sandboxInitPoint: res.data.sandbox_init_point
            };
        } catch (error) {
            const errData = error.response?.data || error.message;
            logger.error(`[MercadoPagoAR] Error creando preferencia: ${JSON.stringify(errData)}`);
            throw new Error(`Error MercadoPago AR: ${JSON.stringify(errData)}`);
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
            logger.error(`[MercadoPagoAR] Error obteniendo pago ${paymentId}: ${error.message}`);
            throw error;
        }
    }
}

export default new MercadoPagoArService();
