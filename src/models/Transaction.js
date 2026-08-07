import { query } from '../config/database.js';

/**
 * Modelo de Transacción para encapsular las consultas a PostgreSQL.
 */
const memoryStore = new Map();

class Transaction {
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
        
        const fallbackObj = {
            transaction_id: transactionId,
            type,
            status: 'PENDING_PAYMENT',
            amount_source: amountSource,
            currency_source: currencySource,
            currency_target: currencyTarget,
            client_pix_key: clientPixKey,
            client_pix_key_type: clientPixKeyType,
            client_cbu_cvu: clientCbuCvu,
            fx_rate_snapshot: fxRateSnapshot,
            margin_applied: marginApplied,
            created_at: new Date(),
            updated_at: new Date()
        };

        memoryStore.set(transactionId, fallbackObj);

        try {
            const result = await query(sql, values);
            if (result && result.rows && result.rows[0]) {
                memoryStore.set(transactionId, result.rows[0]);
                return result.rows[0];
            }
        } catch (error) {
            console.warn('[TransactionModel] Alerta BD, guardando en memoria:', error.message);
        }
        return fallbackObj;
    }

    static async findByTransactionId(transactionId) {
        try {
            const sql = `SELECT * FROM transactions WHERE transaction_id = $1;`;
            const result = await query(sql, [transactionId]);
            if (result && result.rows && result.rows[0]) return result.rows[0];
        } catch (error) {
            console.warn('[TransactionModel] Buscando en memoria:', error.message);
        }
        return memoryStore.get(transactionId) || null;
    }

    static async updateStatus(transactionId, newStatus, additionalFields = {}) {
        const allowedFields = ['amount_usdt', 'amount_target', 'binance_order_id', 'mp_payment_id', 'mp_pix_qr_code', 'mp_ar_preference_id', 'error_details'];
        
        let tx = memoryStore.get(transactionId) || { transaction_id: transactionId };
        tx.status = newStatus;
        tx.updated_at = new Date();
        Object.assign(tx, additionalFields);
        memoryStore.set(transactionId, tx);

        try {
            let sql = `UPDATE transactions SET status = $1, updated_at = NOW()`;
            const values = [newStatus];
            let index = 2;

            for (const [key, value] of Object.entries(additionalFields)) {
                if (allowedFields.includes(key)) {
                    sql += `, ${key} = $${index}`;
                    values.push(typeof value === 'object' ? JSON.stringify(value) : value);
                    index++;
                }
            }

            sql += ` WHERE transaction_id = $${index} RETURNING *;`;
            values.push(transactionId);

            const result = await query(sql, values);
            if (result && result.rows && result.rows[0]) {
                return result.rows[0];
            }
        } catch (error) {
            console.warn('[TransactionModel] Actualizando en memoria por error de BD:', error.message);
        }

        return tx;
    }

    /**
     * Busca una transacción por su ID de pago en Mercado Pago.
     * @param {string} mpPaymentId - El ID de pago de Mercado Pago.
     * @returns {Promise<Object|null>} La transacción o null si no existe.
     */
    static async findByMpPaymentId(mpPaymentId) {
        try {
            const sql = `SELECT * FROM transactions WHERE mp_payment_id = $1;`;
            const result = await query(sql, [mpPaymentId]);
            if (result && result.rows && result.rows[0]) return result.rows[0];
        } catch (error) {
            console.warn('[TransactionModel] Buscando por mpPaymentId en memoria:', error.message);
        }

        for (const tx of memoryStore.values()) {
            if (String(tx.mp_payment_id) === String(mpPaymentId)) {
                return tx;
            }
        }
        return null;
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
