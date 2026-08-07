import crypto from 'crypto';

/**
 * Genera un ID de transacción único.
 * Utiliza un UUID con prefijo 'TXN-' y un segmento de tiempo.
 * @returns {string} ID de transacción único.
 */
export const generateTransactionId = () => {
    const timestamp = Date.now();
    return `TXN-${timestamp}-${crypto.randomUUID()}`;
};

/**
 * Crea una firma HMAC-SHA256 para un payload dado.
 * @param {string} payload - El contenido a firmar (usualmente string JSON).
 * @param {string} secret - La clave secreta para HMAC.
 * @returns {string} La firma generada en formato hexadecimal.
 */
export const createHmacSignature = (payload, secret) => {
    return crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
};

/**
 * Verifica una firma HMAC-SHA256 usando comparación segura contra ataques de tiempo.
 * @param {string} payload - El contenido firmado.
 * @param {string} signature - La firma proporcionada en hexadecimal.
 * @param {string} secret - La clave secreta.
 * @returns {boolean} True si la firma es válida, false en caso contrario.
 */
export const verifyHmacSignature = (payload, signature, secret) => {
    try {
        const expectedSignature = createHmacSignature(payload, secret);
        
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const signatureBuffer = Buffer.from(signature, 'hex');

        if (expectedBuffer.length !== signatureBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch (error) {
        return false;
    }
};

export default {
    generateTransactionId,
    createHmacSignature,
    verifyHmacSignature
};
