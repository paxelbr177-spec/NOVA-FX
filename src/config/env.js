import dotenv from 'dotenv';

// Cargar variables de entorno desde .env
dotenv.config();

/**
 * Valida las variables de entorno requeridas.
 * En producción, lanza un error si faltan variables críticas.
 */
const validateEnv = () => {
    const requiredVars = ['BINANCE_API_KEY', 'BINANCE_SECRET_KEY', 'MP_BR_ACCESS_TOKEN', 'DATABASE_URL'];
    const missingVars = requiredVars.filter((v) => !process.env[v]);

    if (process.env.NODE_ENV === 'production' && missingVars.length > 0) {
        throw new Error(`Faltan variables de entorno críticas en producción: ${missingVars.join(', ')}`);
    }
};

validateEnv();

/**
 * Configuración global de la aplicación.
 * @type {Readonly<Object>}
 */
export const config = Object.freeze({
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    fxMarginPercentage: parseFloat(process.env.FX_MARGIN_PERCENTAGE || '0.02'),
    binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
    binanceApiKey: process.env.BINANCE_API_KEY,
    binanceSecretKey: process.env.BINANCE_SECRET_KEY,
    mpBrAccessToken: process.env.MP_BR_ACCESS_TOKEN,
    mpWebhookSecret: process.env.MP_WEBHOOK_SECRET,
    mpArAccessToken: process.env.MP_AR_ACCESS_TOKEN,
    mpArWebhookSecret: process.env.MP_AR_WEBHOOK_SECRET,
    webhookSecret: process.env.WEBHOOK_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
});

export default config;
