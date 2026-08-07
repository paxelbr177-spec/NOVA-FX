import { Router } from 'express';
import { getQuote, createTransaction, getTransactionStatus } from '../controllers/exchangeController.js';

const router = Router();

// GET /api/v1/exchange/quote -> getQuote
router.get('/quote', getQuote);

// POST /api/v1/exchange/transactions -> createTransaction
router.post('/transactions', createTransaction);

// GET /api/v1/exchange/transactions/:transactionId -> getTransactionStatus
router.get('/transactions/:transactionId', getTransactionStatus);

export default router;
