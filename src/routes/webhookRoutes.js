import { Router } from 'express';
import { handleMercadoPagoWebhook, handleMercadoPagoArWebhook, handleArsDepositWebhook } from '../controllers/webhookController.js';
import { validateMercadoPagoWebhook, validateGenericWebhook } from '../middlewares/hmacValidation.js';

const router = Router();

// POST /api/v1/webhooks/mercadopago -> Mercado Pago Brasil Webhook
router.post('/mercadopago', validateMercadoPagoWebhook, handleMercadoPagoWebhook);

// POST /api/v1/webhooks/mercadopago-ar -> Mercado Pago Argentina Webhook
router.post('/mercadopago-ar', handleMercadoPagoArWebhook);

// POST /api/v1/webhooks/ars-deposit -> Webhook Genérico Depósito ARS
router.post('/ars-deposit', validateGenericWebhook, handleArsDepositWebhook);

export default router;
