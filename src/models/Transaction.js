import { query } from '../config/database.js';
import supabaseClient from '../config/supabaseClient.js';

/**
 * Modelo de Transacción para encapsular las consultas a PostgreSQL / Supabase.
 */
const memoryStore = new Map();

class Transaction {
    static async create({ transactionId, type, amountSource, currencySource, currencyTarget, clientPixKey, clientPixKeyType, clientCbuCvu, clientName, clientEmail, clientPhone, fxRateSnapshot, marginApplied }) {
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
            client_name: clientName || null,
            client_email: clientEmail || null,
            client_phone: clientPhone || null,
            fx_rate_snapshot: fxRateSnapshot,
            margin_applied: marginApplied,
            created_at: new Date(),
            updated_at: new Date()
        };

        memoryStore.set(transactionId, fallbackObj);

        // Insertar vía Supabase REST API
        try {
            await supabaseClient.insertTransaction(fallbackObj);
        } catch (e) {}

        const sql = `
            INSERT INTO transactions (
                transaction_id, type, status, amount_source, currency_source, 
                currency_target, client_pix_key, client_pix_key_type, client_cbu_cvu, 
                client_name, client_email, client_phone,
                fx_rate_snapshot, margin_applied, created_at, updated_at
            ) VALUES (
                $1, $2, 'PENDING_PAYMENT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
            ) RETURNING *;
        `;
        const values = [
            transactionId, type, amountSource, currencySource, currencyTarget,
            clientPixKey, clientPixKeyType, clientCbuCvu,
            clientName || null, clientEmail || null, clientPhone || null,
            JSON.stringify(fxRateSnapshot), marginApplied
        ];

        try {
            const result = await query(sql, values);
            if (result && result.rows && result.rows[0]) {
                memoryStore.set(transactionId, result.rows[0]);
                return result.rows[0];
            }
        } catch (error) {}

        return fallbackObj;
    }

    static async findAll() {
        try {
            const supabaseTxList = await supabaseClient.getTransactions();
            if (supabaseTxList && supabaseTxList.length > 0) {
                for (const t of supabaseTxList) {
                    memoryStore.set(t.transaction_id, t);
                }
            }
        } catch (e) {}
        try {
            const sql = `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200;`;
            const result = await query(sql, []);
            if (result && result.rows) {
                // Fusionar memoria y BD evitando duplicados
                const dbMap = new Map(result.rows.map(r => [r.transaction_id, r]));
                for (const [id, tx] of memoryStore.entries()) {
                    if (!dbMap.has(id)) dbMap.set(id, tx);
                }
                return Array.from(dbMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        } catch (error) {
            console.warn('[TransactionModel] Leyendo transacciones de memoria:', error.message);
        }
        return Array.from(memoryStore.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
        const allowedFields = ['amount_usdt', 'amount_target', 'binance_order_id', 'mp_payment_id', 'mp_pix_qr_code', 'mp_ar_preference_id', 'client_name', 'client_email', 'client_phone', 'error_details'];
        
        let tx = memoryStore.get(transactionId) || { transaction_id: transactionId };
        tx.status = newStatus;
        tx.updated_at = new Date();
        Object.assign(tx, additionalFields);
        memoryStore.set(transactionId, tx);

        // Actualizar vía Supabase REST API
        try {
            await supabaseClient.updateTransaction(transactionId, {
                status: newStatus,
                ...additionalFields
            });
        } catch (e) {}

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
