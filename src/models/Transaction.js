import { query } from '../config/database.js';

/**
 * Modelo de Transacción para encapsular las consultas a PostgreSQL.
 */
class Transaction {
    /**
     * Crea una nueva transacción en la base de datos.
     * @param {Object} params - Parámetros de la transacción.
     * @param {string} params.transactionId - ID único de la transacción.
     * @param {string} params.type - Tipo de transacción ('ARS_TO_BRL' o 'BRL_TO_ARS').
     * @param {number} params.amountSource - Monto en la moneda de origen.
     * @param {string} params.currencySource - Moneda de origen ('ARS' o 'BRL').
     * @param {string} params.currencyTarget - Moneda de destino ('BRL' o 'ARS').
     * @param {string} [params.clientPixKey] - Clave PIX del cliente.
     * @param {string} [params.clientPixKeyType] - Tipo de clave PIX.
     * @param {string} [params.clientCbuCvu] - CBU/CVU del cliente.
     * @param {Object} params.fxRateSnapshot - Snapshot de las tasas de conversión.
     * @param {number} params.marginApplied - Margen aplicado.
     * @returns {Promise<Object>} La transacción creada.
     */
    static async create({ transactionId, type, amountSource, currencySource, currencyTarget, clientPixKey, clientPixKeyType, clientCbuCvu, fxRateSnapshot, marginApplied }) {
        const sql = `
            INSERT INTO transactions (
                transaction_id, type, status, amount_source, currency_source, 
                currency_target, client_pix_key, client_pix_key_type, client_cbu_cvu, 
                fx_rate_snapshot, margin_applied, created_at, updated_at
            ) VALUES (
                $1, $2, 'PENDING_PAYMENT', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
            ) RETURNING *;
        `;
        const values = [
            transactionId, type, amountSource, currencySource, currencyTarget,
            clientPixKey, clientPixKeyType, clientCbuCvu, JSON.stringify(fxRateSnapshot), marginApplied
        ];
        
        try {
            const result = await query(sql, values);
            return result.rows[0];
        } catch (error) {
            console.error('[TransactionModel] Error al crear la transacción:', error);
            throw error;
        }
    }

    /**
     * Busca una transacción por su ID.
     * @param {string} transactionId - El ID de la transacción.
     * @returns {Promise<Object|null>} La transacción o null si no existe.
     */
    static async findByTransactionId(transactionId) {
        const sql = `SELECT * FROM transactions WHERE transaction_id = $1;`;
        try {
            const result = await query(sql, [transactionId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('[TransactionModel] Error al buscar por transactionId:', error);
            throw error;
        }
    }

    /**
     * Actualiza el estado de una transacción y otros campos opcionales.
     * @param {string} transactionId - El ID de la transacción.
     * @param {string} newStatus - El nuevo estado.
     * @param {Object} [additionalFields={}] - Campos adicionales a actualizar (amount_usdt, amount_target, binance_order_id, mp_payment_id, error_details).
     * @returns {Promise<Object>} La transacción actualizada.
     */
    static async updateStatus(transactionId, newStatus, additionalFields = {}) {
        let sql = `UPDATE transactions SET status = $1, updated_at = NOW()`;
        const values = [newStatus];
        let index = 2;

        const allowedFields = ['amount_usdt', 'amount_target', 'binance_order_id', 'mp_payment_id', 'mp_pix_qr_code', 'error_details'];
        
        for (const [key, value] of Object.entries(additionalFields)) {
            if (allowedFields.includes(key)) {
                sql += `, ${key} = $${index}`;
                values.push(typeof value === 'object' ? JSON.stringify(value) : value);
                index++;
            }
        }

        sql += ` WHERE transaction_id = $${index} RETURNING *;`;
        values.push(transactionId);

        try {
            const result = await query(sql, values);
            return result.rows[0];
        } catch (error) {
            console.error('[TransactionModel] Error al actualizar estado:', error);
            throw error;
        }
    }

    /**
     * Busca una transacción por su ID de pago en Mercado Pago.
     * @param {string} mpPaymentId - El ID de pago de Mercado Pago.
     * @returns {Promise<Object|null>} La transacción o null si no existe.
     */
    static async findByMpPaymentId(mpPaymentId) {
        const sql = `SELECT * FROM transactions WHERE mp_payment_id = $1;`;
        try {
            const result = await query(sql, [mpPaymentId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('[TransactionModel] Error al buscar por mpPaymentId:', error);
            throw error;
        }
    }

    /**
     * Verifica si una transacción existe. Útil para checks de idempotencia.
     * @param {string} transactionId - El ID de la transacción.
     * @returns {Promise<boolean>} True si existe, false en caso contrario.
     */
    static async existsByTransactionId(transactionId) {
        const sql = `SELECT 1 FROM transactions WHERE transaction_id = $1;`;
        try {
            const result = await query(sql, [transactionId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('[TransactionModel] Error al verificar existencia:', error);
            throw error;
        }
    }
}

export default Transaction;
