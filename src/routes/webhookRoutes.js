import { Router } from 'express';
import { handleMercadoPagoArWebhook, handleMercadoPagoBrWebhook } from '../controllers/webhookController.js';

const router = Router();

router.post('/mercadopago-ar', handleMercadoPagoArWebhook);
router.post('/mercadopago-br', handleMercadoPagoBrWebhook);

export default router;
