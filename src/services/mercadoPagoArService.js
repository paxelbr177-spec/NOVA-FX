import axios from 'axios';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Servicio de integración con Mercado Pago Argentina API
 * Maneja transferencias salientes (desembolsos a CBU/CVU) y cobros en Pesos Argentinos (ARS).
 */
class MercadoPagoArService {
  constructor() {
    this.accessToken = process.env.MP_AR_ACCESS_TOKEN || config.mpArAccessToken;
    this.webhookSecret = process.env.MP_AR_WEBHOOK_SECRET || config.mpArWebhookSecret;
    this.baseUrl = 'https://api.mercadopago.com';
  }

  /**
   * Realiza una solicitud HTTP a la API de Mercado Pago Argentina
   * @private
   */
  async #makeRequest(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.accessToken || process.env.MP_AR_ACCESS_TOKEN;

    if (!token) {
      throw new Error('[MercadoPagoArService] MP_AR_ACCESS_TOKEN no está configurada.');
    }

    try {
      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data,
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const errorData = error.response?.data || error.message;
      logger.error(`[MercadoPagoArService] Error en petición a ${endpoint}: ${JSON.stringify(errorData)}`);
      throw new Error(`Error en Mercado Pago AR API (${endpoint}): ${JSON.stringify(errorData)}`);
    }
  }

  /**
   * Crea una transferencia saliente (desembolso) en ARS a un CBU/CVU destino en Argentina
   * @param {Object} params
   * @param {number} params.amount - Monto en ARS a transferir
   * @param {string} params.cbuCvu - CBU/CVU de 22 dígitos del cliente
   * @param {string} params.description - Concepto o referencia de la transferencia
   * @param {string} params.externalReference - ID de transacción interno (TXN-...)
   * @returns {Promise<Object>} Respuesta del desembolso
   */
  async createArsDisbursement({ amount, cbuCvu, description, externalReference }) {
    try {
      const payload = {
        transaction_amount: Number(amount.toFixed(2)),
        description: description || `Desembolso FX ${externalReference}`,
        payment_method_id: 'account_money',
        external_reference: externalReference,
        payer: {
          entity_type: 'individual',
          type: 'customer'
        },
        additional_info: {
          cbu_cvu: cbuCvu
        }
      };

      const result = await this.#makeRequest('POST', '/v1/payments', payload);
      logger.info(`[MercadoPagoArService] Desembolso ARS creado exitosamente (${amount} ARS a CBU ${cbuCvu}): ID ${result.id}`);
      return result;
    } catch (error) {
      logger.error(`[MercadoPagoArService] Error al crear desembolso ARS (${externalReference}): ${error.message}`);
      throw error;
    }
  }

  /**
   * Genera una preferencia de pago en ARS (Mercado Pago Argentina)
   * Crea un checkout link donde el cliente puede pagar via transferencia, QR, o tarjeta.
   * @param {Object} params
   * @param {number} params.amount - Monto en ARS a cobrar
   * @param {string} params.description - Descripción del concepto
   * @param {string} params.externalReference - ID de transacción interno
   * @param {string} params.payerEmail - Email del pagador (opcional)
   * @returns {Promise<Object>} Objeto con init_point (URL checkout), id de preferencia
   */
  async createArsPayment({ amount, description, externalReference, payerEmail }) {
    const payload = {
      items: [
        {
          title: description || `Cambio FX ${externalReference}`,
          quantity: 1,
          unit_price: Number(amount.toFixed(2)),
          currency_id: 'ARS'
        }
      ],
      external_reference: externalReference,
      notification_url: `${process.env.RENDER_EXTERNAL_URL || 'https://nova-fx.onrender.com'}/api/v1/webhooks/mercadopago-ar`,
      back_urls: {
        success: `${process.env.FRONTEND_URL || 'https://paxelbr177-spec.github.io/NOVA-FX'}?tx=${externalReference}&status=success`,
        failure: `${process.env.FRONTEND_URL || 'https://paxelbr177-spec.github.io/NOVA-FX'}?tx=${externalReference}&status=failure`,
        pending: `${process.env.FRONTEND_URL || 'https://paxelbr177-spec.github.io/NOVA-FX'}?tx=${externalReference}&status=pending`
      },
      auto_return: 'approved'
    };

    if (payerEmail) {
      payload.payer = { email: payerEmail };
    }

    const result = await this.#makeRequest('POST', '/checkout/preferences', payload);
    
    logger.info(`[MercadoPagoArService] Preferencia de pago ARS creada: ${result.id} (${amount} ARS)`);
    
    return {
      preferenceId: result.id,
      initPoint: result.init_point,           // URL del checkout de producción
      sandboxInitPoint: result.sandbox_init_point, // URL del checkout sandbox
      amount: amount,
      externalReference
    };
  }

  /**
   * Verifica la firma del Webhook de Mercado Pago Argentina usando HMAC-SHA256
   */
  verifyWebhookSignature(xSignature, xRequestId, dataId) {
    if (!xSignature || !xRequestId || !dataId) return false;
    const secret = this.webhookSecret || process.env.MP_AR_WEBHOOK_SECRET;
    if (!secret) return true; // Si no hay secret configurado en dev, aceptar

    try {
      const parts = xSignature.split(',');
      let ts = '', hash = '';
      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') hash = value;
      }

      if (!ts || !hash) return false;
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const computedHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

      const signatureBuffer = Buffer.from(hash);
      const computedBuffer = Buffer.from(computedHash);

      return signatureBuffer.length === computedBuffer.length && crypto.timingSafeEqual(signatureBuffer, computedBuffer);
    } catch (error) {
      logger.error(`[MercadoPagoArService] Error al verificar firma webhook: ${error.message}`);
      return false;
    }
  }
}

export default new MercadoPagoArService();
