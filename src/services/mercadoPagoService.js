import axios from 'axios';
import crypto from 'node:crypto';

/**
 * Servicio para integrarse con la API de Mercado Pago Brasil.
 */
class MercadoPagoService {
    constructor() {
        this.accessToken = process.env.MP_BR_ACCESS_TOKEN;
        this.webhookSecret = process.env.MP_WEBHOOK_SECRET;
        this.baseUrl = 'https://api.mercadopago.com';
    }

    /**
     * Realiza una solicitud HTTP a la API de Mercado Pago.
     * @private
     * @param {string} method - Método HTTP.
     * @param {string} endpoint - Endpoint de la API.
     * @param {Object} [data] - Cuerpo de la solicitud.
     * @returns {Promise<Object>} Datos de respuesta.
     */
    async #makeRequest(method, endpoint, data = null) {
        const token = process.env.MP_BR_ACCESS_TOKEN || this.accessToken;
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        if (method.toUpperCase() === 'POST') {
            headers['X-Idempotency-Key'] = data?.external_reference || crypto.randomUUID();
        }

        const reqConfig = {
            method,
            url,
            headers,
            data
        };

        try {
            const response = await axios(reqConfig);
            return response.data;
        } catch (error) {
            const errorData = error.response?.data || error.message;
            console.error(`[MercadoPagoService] Error en petición a ${endpoint}:`, JSON.stringify(errorData));
            throw new Error(`Error en Mercado Pago BR API (${endpoint}): ${JSON.stringify(errorData)}`);
        }
    }

    /**
     * Crea un pago PIX para recibir fondos en Brasil.
     * @param {Object} params - Parámetros de la orden.
     * @param {number} params.amount - Monto a cobrar.
     * @param {string} params.description - Descripción del cobro.
     * @param {string} params.externalReference - ID de referencia interno.
     * @param {string} params.payerEmail - Email del pagador.
     * @returns {Promise<Object>} Datos del pago generado.
     */
    async createPixPayment({ amount, description, externalReference, payerEmail }) {
        const expirationDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const payload = {
            transaction_amount: Number(amount),
            description: description,
            payment_method_id: 'pix',
            external_reference: externalReference,
            date_of_expiration: expirationDate,
            payer: {
                email: (payerEmail && payerEmail.includes('@')) ? payerEmail : 'cliente@brasil.com'
            }
        };

        const result = await this.#makeRequest('POST', '/v1/payments', payload);
        
        return {
            paymentId: result.id,
            qrCode: result.point_of_interaction?.transaction_data?.qr_code,
            qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
            ticketUrl: result.point_of_interaction?.transaction_data?.ticket_url
        };
    }

    /**
     * Obtiene el estado de un pago.
     * @param {string} paymentId - ID del pago en Mercado Pago.
     * @returns {Promise<Object>} Objeto completo del pago.
     */
    async getPaymentStatus(paymentId) {
        return await this.#makeRequest('GET', `/v1/payments/${paymentId}`);
    }

    /**
     * Crea un desembolso/pago vía PIX hacia una cuenta de cliente.
     * @param {Object} params - Parámetros del desembolso.
     * @param {number} params.amount - Monto a enviar.
     * @param {string} params.pixKey - Clave PIX destino.
     * @param {string} params.pixKeyType - Tipo de clave PIX.
     * @param {string} params.description - Descripción de la transferencia.
     * @param {string} params.externalReference - ID de referencia interno.
     * @returns {Promise<Object>} Resultado del pago.
     */
    async createPixDisbursement({ amount, pixKey, pixKeyType, description, externalReference }) {
        const payload = {
            transaction_amount: Number(amount),
            description: description,
            payment_method_id: 'pix',
            external_reference: externalReference,
            payer: {
                entity_type: 'individual',
                type: 'customer'
            },
            additional_info: {
                pix_key: pixKey,
                pix_key_type: pixKeyType
            }
        };

        return await this.#makeRequest('POST', '/v1/payments', payload);
    }

    /**
     * Verifica la firma del Webhook de Mercado Pago usando HMAC-SHA256.
     * @param {string} xSignature - Header x-signature.
     * @param {string} xRequestId - Header x-request-id.
     * @param {string} dataId - El ID del recurso notificado en el body (data.id).
     * @returns {Promise<boolean>} True si la firma es válida.
     */
    async verifyWebhookSignature(xSignature, xRequestId, dataId) {
        if (!xSignature || !xRequestId || !dataId) return false;

        try {
            const parts = xSignature.split(',');
            let ts = '';
            let hash = '';

            for (const part of parts) {
                const [key, value] = part.split('=');
                if (key === 'ts') ts = value;
                if (key === 'v1') hash = value;
            }

            if (!ts || !hash) return false;

            const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
            
            const hmac = crypto.createHmac('sha256', this.webhookSecret);
            hmac.update(manifest);
            const computedHash = hmac.digest('hex');

            return computedHash === hash;
        } catch (error) {
            console.error('[MercadoPagoService] Error validando firma:', error);
            return false;
        }
    }
}

export default new MercadoPagoService();
