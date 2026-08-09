import express from 'express';
import { verifyAdminPin, getAdminStats, getAdminTransactions, updateAdminTransactionStatus, getAdminUsers, toggleOperatingStatus } from '../controllers/adminController.js';

const router = express.Router();

// Aplicar middleware de PIN de seguridad a todas las rutas admin
router.use(verifyAdminPin);

// Rutas de administración
router.get('/stats', getAdminStats);
router.get('/transactions', getAdminTransactions);
router.get('/users', getAdminUsers);
router.patch('/transactions/:transactionId', updateAdminTransactionStatus);
router.post('/operating-status', toggleOperatingStatus);

export default router;
