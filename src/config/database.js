import pg from 'pg';
import { config } from './env.js';

// Logger importado de forma diferida para evitar dependencia circular con env.js
let _logger = null;
const getLogger = async () => {
    if (!_logger) {
        const mod = await import('../utils/logger.js');
        _logger = mod.logger || mod.default;
    }
    return _logger;
};

const { Pool } = pg;
const isCloudDb = config.databaseUrl && (config.databaseUrl.includes('supabase') || config.databaseUrl.includes('pooler') || config.nodeEnv === 'production');

/**
 * Pool de conexiones a PostgreSQL.
 */
export const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: isCloudDb ? { rejectUnauthorized: false } : false
});

// Manejo de errores en clientes inactivos del pool
pool.on('error', async (err) => {
    const logger = await getLogger();
    logger.error(`[Database] Error inesperado en cliente inactivo de base de datos: ${err.message}`);
    process.exit(-1);
});

/**
 * Ejecuta una consulta SQL en la base de datos.
 * @param {string} text - Consulta SQL.
 * @param {Array<any>} [params] - Parámetros de la consulta.
 * @returns {Promise<pg.QueryResult<any>>} Resultado de la consulta.
 */
export const query = (text, params) => {
    return pool.query(text, params);
};

/**
 * Inicializa la base de datos, creando la tabla de transacciones si no existe.
 * @returns {Promise<void>}
 */
export const initDatabase = async () => {
    try {
        const createTableText = `
            CREATE TABLE IF NOT EXISTS transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                transaction_id VARCHAR(64) UNIQUE NOT NULL,
                type VARCHAR(10) NOT NULL CHECK (type IN ('ARS_TO_BRL', 'BRL_TO_ARS')),
                status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',
                amount_source DECIMAL(18,2) NOT NULL,
                currency_source VARCHAR(5) NOT NULL,
                amount_usdt DECIMAL(18,8),
                amount_target DECIMAL(18,2),
                currency_target VARCHAR(5) NOT NULL,
                fx_rate_snapshot JSONB,
                margin_applied DECIMAL(6,4) DEFAULT 0.02,
                client_pix_key VARCHAR(255),
                client_pix_key_type VARCHAR(10),
                client_cbu_cvu VARCHAR(22),
                mp_payment_id VARCHAR(64),
                mp_pix_qr_code TEXT,
                binance_order_id VARCHAR(64),
                binance_order_response JSONB,
                error_details TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
            CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
        `;
        
        await pool.query(createTableText);
        const logger = await getLogger();
        logger.info('[Database] Base de datos inicializada correctamente (tabla transactions e índices).');
    } catch (error) {
        const logger = await getLogger();
        logger.error(`[Database] ⚠️ Alerta de conexión a PostgreSQL (${error.message}). El servidor continúa ejecutándose.`);
    }
};

export default { pool, query, initDatabase };
