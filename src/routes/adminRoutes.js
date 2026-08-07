import express from 'express';
import { verifyAdminPin, getAdminStats, getAdminTransactions, updateAdminTransactionStatus } from '../controllers/adminController.js';

const router = express.Router();

// Aplicar middleware de PIN de seguridad a todas las rutas admin
router.use(verifyAdminPin);

// Rutas de administración
router.get('/stats', getAdminStats);
router.get('/transactions', getAdminTransactions);
router.patch('/transactions/:transactionId', updateAdminTransactionStatus);

export default router;
