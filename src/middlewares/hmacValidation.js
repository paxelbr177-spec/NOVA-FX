import crypto from 'node:crypto';
import config from '../config/env.js';

/**
 * Middleware para validar la firma (signature) del webhook de Mercado Pago.
 * Verifica que el evento provenga realmente de Mercado Pago mediante HMAC-SHA256.
 * 
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @param {import('express').NextFunction} next - Función next de Express.
 */
export const validateMercadoPagoWebhook = (req, res, next) => {
  try {
    const signatureHeader = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    if (!signatureHeader || !xRequestId) {
      console.error('[HMACValidation] Faltan cabeceras x-signature o x-request-id de Mercado Pago');
      return res.status(401).json({ success: false, error: 'Cabeceras de firma faltantes' });
    }

    // El formato de signatureHeader es: ts=<timestamp>,v1=<hash>
    const parts = signatureHeader.split(',');
    let ts, v1;
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 'ts') ts = value;
      if (key === 'v1') v1 = value;
    }

    if (!ts || !v1) {
      console.error('[HMACValidation] Formato de cabecera x-signature inválido');
      return res.status(401).json({ success: false, error: 'Formato de firma inválido' });
    }

    const dataId = req.query?.id || req.body?.data?.id;
    if (!dataId) {
      console.error('[HMACValidation] No se pudo extraer data.id del payload de MP');
      return res.status(401).json({ success: false, error: 'Falta ID de datos para validación' });
    }

    const validationString = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    
    const hmac = crypto.createHmac('sha256', config.mpWebhookSecret);
    const computedHash = hmac.update(validationString).digest('hex');

    const signatureBuffer = Buffer.from(v1);
    const computedBuffer = Buffer.from(computedHash);

    if (signatureBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
      console.error('[HMACValidation] La validación HMAC de Mercado Pago falló');
      return res.status(401).json({ success: false, error: 'No autorizado: Firma inválida' });
    }

    next();
  } catch (error) {
    console.error('[HMACValidation] Error procesando firma de MP:', error);
    return res.status(500).json({ success: false, error: 'Error interno validando webhook' });
  }
};

/**
 * Middleware para validar webhooks genéricos.
 * 
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @param {import('express').NextFunction} next - Función next de Express.
 */
export const validateGenericWebhook = (req, res, next) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    
    if (!signature) {
      console.error('[HMACValidation] Falta la cabecera x-webhook-signature');
      return res.status(401).json({ success: false, error: 'Firma faltante' });
    }

    if (!req.rawBody) {
      console.error('[HMACValidation] req.rawBody no disponible. Asegúrese de configurar verify en express.json()');
      return res.status(500).json({ success: false, error: 'Error de configuración interna del webhook' });
    }

    const hmac = crypto.createHmac('sha256', config.webhookSecret);
    const computedHash = hmac.update(req.rawBody).digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const computedBuffer = Buffer.from(computedHash);

    if (signatureBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
      console.error('[HMACValidation] La validación HMAC genérica falló');
      return res.status(401).json({ success: false, error: 'No autorizado: Firma genérica inválida' });
    }

    next();
  } catch (error) {
    console.error('[HMACValidation] Error procesando firma genérica:', error);
    return res.status(500).json({ success: false, error: 'Error interno validando webhook genérico' });
  }
};
