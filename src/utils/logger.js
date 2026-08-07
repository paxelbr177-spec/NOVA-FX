import winston from 'winston';
import { config } from '../config/env.js';

const { combine, timestamp, printf, colorize } = winston.format;

/**
 * Formato de log personalizado.
 */
const customFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
});

/**
 * Instancia de logger de Winston.
 */
const winstonLogger = winston.createLogger({
    level: config.nodeEnv === 'development' ? 'debug' : 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        colorize(),
        customFormat
    ),
    transports: [
        new winston.transports.Console()
    ]
});

/**
 * Objeto logger exportado con métodos estandarizados.
 */
export const logger = {
    /**
     * Registra un mensaje de información.
     * @param {string} message - Mensaje a registrar.
     */
    info: (message) => winstonLogger.info(message),
    
    /**
     * Registra un mensaje de error.
     * @param {string} message - Mensaje de error.
     */
    error: (message) => winstonLogger.error(message),
    
    /**
     * Registra un mensaje de advertencia.
     * @param {string} message - Mensaje de advertencia.
     */
    warn: (message) => winstonLogger.warn(message),
    
    /**
     * Registra un mensaje de depuración.
     * @param {string} message - Mensaje de depuración.
     */
    debug: (message) => winstonLogger.debug(message)
};

export default logger;
