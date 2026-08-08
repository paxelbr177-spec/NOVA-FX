import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger.js';

class BitsoService {
    constructor() {
        this.apiKey = process.env.BITSO_KEY || 'BmXxmivSWJ';
        this.apiSecret = process.env.BITSO_SECRET || '4313809dfddfb0322374aa8628d824d0';
        this.baseUrl = 'https://api.bitso.com';
    }

    #generateSignature(method, path, payload = '') {
        const nonce = new Date().getTime();
        const data = nonce + method + path + payload;
        const signature = crypto
            .createHmac('sha256', this.apiSecret)
            .update(data)
            .digest('hex');
        
        return {
            nonce,
            authHeader: `Bitso ${this.apiKey}:${nonce}:${signature}`
        };
    }

    async #makeRequest(method, path, payload = null) {
        const payloadString = payload ? JSON.stringify(payload) : '';
        const { authHeader } = this.#generateSignature(method, path, payloadString);

        const config = {
            method,
            url: `${this.baseUrl}${path}`,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        if (payload) {
            config.data = payloadString;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            logger.error(`[BitsoService] Error en ${method} ${path}: ${error.response?.data?.error?.message || error.message}`);
            throw error;
        }
    }

    /**
     * Verifica si existe un depósito reciente que coincida con la moneda y monto esperado.
     * Busca depósitos en los últimos 30 minutos.
     * @param {string} currency - 'brl' o 'ars'
     * @param {number} amount - Monto exacto esperado
     * @returns {Object|null} - Datos del depósito si se encontró, null en caso contrario
     */
    async verifyDeposit(currency, amount) {
        try {
            // Obtener fundings recientes
            // limit=20 es el default, es suficiente para 2-3 transacciones por día
            const response = await this.#makeRequest('GET', '/v3/fundings/');
            if (!response.success) {
                logger.error('[BitsoService] Error obteniendo fundings: API no retornó success');
                return null;
            }

            const fundings = response.payload;
            
            // Convertir la moneda a formato Bitso (minúsculas)
            const expectedCurrency = currency.toLowerCase();
            
            // Ventana de tiempo: 60 minutos (ms)
            const timeWindow = 60 * 60 * 1000; 
            const now = new Date().getTime();

            for (const funding of fundings) {
                // Verificar si es un fondeo completado de la moneda correcta
                if (funding.status === 'complete' && funding.currency === expectedCurrency) {
                    const fundingDate = new Date(funding.created_at).getTime();
                    
                    // Si está dentro de la ventana de tiempo
                    if (now - fundingDate <= timeWindow) {
                        const fundingAmount = parseFloat(funding.amount);
                        const targetAmount = parseFloat(amount);
                        
                        // Si el monto coincide exactamente
                        if (fundingAmount === targetAmount) {
                            return funding;
                        }
                    }
                }
            }
            return null; // No se encontró un fondeo que coincida
        } catch (error) {
            logger.error(`[BitsoService] Excepción verificando depósito: ${error.message}`);
            return null;
        }
    }
}

export default new BitsoService();
