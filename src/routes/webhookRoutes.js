import { Router } from 'express';
import { handleKoyweWebhook, handleArsDepositWebhook } from '../controllers/webhookController.js';
import { validateGenericWebhook } from '../middlewares/hmacValidation.js';

const router = Router();

// POST /api/v1/webhooks/koywe -> Webhook de Koywe (reemplaza MP)
router.post('/koywe', handleKoyweWebhook);

// POST /api/v1/webhooks/ars-deposit -> Webhook Genérico Depósito ARS
router.post('/ars-deposit', validateGenericWebhook, handleArsDepositWebhook);

export default router;
