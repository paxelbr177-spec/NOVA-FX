import axios from 'axios';
import { logger } from '../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtsotmbqnlahoumvjtsh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_xRu6TN6N4j675ueZBcDJlQ_H0Y9VpIi';

/**
 * Cliente de integración HTTPS directo con la API REST de Supabase.
 * Evita cualquier problema de autenticación por puerto TCP/Contraseña.
 */
class SupabaseClient {
    constructor() {
        this.baseUrl = `${SUPABASE_URL}/rest/v1`;
        this.headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    }

    /**
     * Inserta o actualiza un usuario en la tabla 'users' de Supabase vía HTTPS REST
     */
    async insertUser({ name, email, phone }) {
        try {
            const url = `${this.baseUrl}/users`;
            const payload = {
                name,
                email: email.toLowerCase(),
                phone
            };

            const res = await axios.post(url, payload, {
                headers: {
                    ...this.headers,
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                },
                timeout: 5000
            });

            logger.info(`[SupabaseClient] ✅ Usuario ${email} guardado en Supabase REST API`);
            return res.data[0] || payload;
        } catch (error) {
            const errData = error.response?.data || error.message;
            logger.warn(`[SupabaseClient] Alerta guardando usuario vía REST API: ${JSON.stringify(errData)}`);
            return null;
        }
    }

    /**
     * Inserta una transacción en la tabla 'transactions' de Supabase vía HTTPS REST
     */
    async insertTransaction(txData) {
        try {
            const url = `${this.baseUrl}/transactions`;
            const res = await axios.post(url, txData, {
                headers: this.headers,
                timeout: 5000
            });
            logger.info(`[SupabaseClient] ✅ Transacción ${txData.transaction_id} guardada en Supabase REST API`);
            return res.data[0] || txData;
        } catch (error) {
            const errData = error.response?.data || error.message;
            logger.warn(`[SupabaseClient] Alerta guardando transacción vía REST API: ${JSON.stringify(errData)}`);
            return null;
        }
    }

    /**
     * Obtiene usuarios de la tabla 'users' vía HTTPS REST
     */
    async getUsers() {
        try {
            const url = `${this.baseUrl}/users?select=*&order=created_at.desc&limit=500`;
            const res = await axios.get(url, { headers: this.headers, timeout: 5000 });
            return res.data || [];
        } catch (error) {
            logger.warn(`[SupabaseClient] Alerta obteniendo usuarios de Supabase: ${error.message}`);
            return [];
        }
    }

    /**
     * Obtiene transacciones de la tabla 'transactions' vía HTTPS REST
     */
    async getTransactions() {
        try {
            const url = `${this.baseUrl}/transactions?select=*&order=created_at.desc&limit=200`;
            const res = await axios.get(url, { headers: this.headers, timeout: 5000 });
            return res.data || [];
        } catch (error) {
            logger.warn(`[SupabaseClient] Alerta obteniendo transacciones de Supabase: ${error.message}`);
            return [];
        }
    }
}

export default new SupabaseClient();
