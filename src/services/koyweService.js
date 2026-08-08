import axios from 'axios';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

class KoyweService {
    constructor() {
        this.apiKey = process.env.KOYWE_API_KEY || 'api_cf6e2cb7-49ea-4666-a220-fdaa3e6c970a';
        this.secret = process.env.KOYWE_SECRET || '43fbd0417d8e5fe3322b2bfc2cf5e1757195daee9b0ddbf1ac2c2310ca8e3073';
        this.orgId = process.env.KOYWE_ORG_ID || 'org3_91b7fc1b-4f4d-4d8d-9992-d115bd50e885';
        this.merchantId = process.env.KOYWE_MERCHANT_ID || 'mrc_80efbb44-df5f-45bd-b704-b0d20cfd3a5b';
        // Usar API de producción
        this.baseUrl = 'https://api.koywe.com/api/v1';
        this.token = null;
        this.tokenExpiresAt = null;
    }

    async authenticate() {
        if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 60000) {
            return this.token;
        }

        try {
            const response = await axios.post(`${this.baseUrl}/auth/sign-in`, {
                apiKey: this.apiKey,
                secret: this.secret
            });
            this.token = response.data.token;
            // Token usually expires in 1 hour
            this.tokenExpiresAt = Date.now() + 3500 * 1000;
            logger.info('[KoyweService] ✅ Autenticado exitosamente en Koywe.');
            return this.token;
        } catch (error) {
            logger.error(`[KoyweService] ❌ Error autenticando: ${error.response?.data?.message || error.message}`);
            throw error;
        }
    }

    async #makeRequest(method, endpoint, payload = null) {
        const token = await this.authenticate();
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios({
                method,
                url,
                headers,
                data: payload,
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            const errorData = error.response?.data || error.message;
            logger.error(`[KoyweService] Error en petición a ${endpoint}: ${JSON.stringify(errorData)}`);
            throw error;
        }
    }

    /**
     * Flujo BRL -> ARS (Cobro en PIX Brasil)
     * Crea una orden PAYIN en BRL. Koywe generará el PIX.
     */
    async createPixPayin({ amountBrl, externalReference, clientEmail }) {
        const endpoint = `/organizations/${this.orgId}/merchants/${this.merchantId}/orders`;
        
        const payload = {
            type: "PAYIN",
            originCurrencySymbol: "BRL",
            amountIn: Number(amountBrl),
            externalId: externalReference,
            paymentMethod: "PIX",
            customer: {
                email: clientEmail || "cliente@brasil.com"
            }
        };

        const result = await this.#makeRequest('POST', endpoint, payload);
        logger.info(`[KoyweService] ✅ Orden PIX creada: ${result.orderId}`);
        return result;
    }

    /**
     * Flujo BRL -> ARS (Desembolso a CBU Argentina)
     * Crea una orden PAYOUT en ARS hacia el CBU del cliente.
     */
    async createArsPayout({ amountArs, cbuCvu, externalReference }) {
        const endpoint = `/organizations/${this.orgId}/merchants/${this.merchantId}/orders`;
        
        const payload = {
            type: "PAYOUT",
            originCurrencySymbol: "ARS", // Assuming Koywe converts internal balance to ARS
            destinationCurrencySymbol: "ARS",
            amountIn: Number(amountArs),
            destinationAccountId: cbuCvu,
            externalId: externalReference,
            description: `Desembolso FX ${externalReference}`
        };

        const result = await this.#makeRequest('POST', endpoint, payload);
        logger.info(`[KoyweService] ✅ Orden de Payout ARS creada: ${result.orderId}`);
        return result;
    }

    /**
     * Obtiene el estado de una orden en Koywe
     */
    async getOrderStatus(orderId) {
        const endpoint = `/organizations/${this.orgId}/merchants/${this.merchantId}/orders/${orderId}`;
        return await this.#makeRequest('GET', endpoint);
    }
}

export default new KoyweService();
