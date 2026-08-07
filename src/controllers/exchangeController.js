import exchangeEngine from '../services/exchangeEngine.js';
import Transaction from '../models/Transaction.js';

/**
 * @description Obtiene una cotización para un tipo de cambio y monto
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getQuote = async (req, res, next) => {
    try {
        const { type, amount } = req.query;

        if (!type || (type !== 'ARS_TO_BRL' && type !== 'BRL_TO_ARS')) {
            return res.status(400).json({ success: false, error: 'Tipo de cambio inválido. Debe ser ARS_TO_BRL o BRL_TO_ARS.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'El monto debe ser un número mayor a 0.' });
        }

        const quoteResult = await exchangeEngine.getQuote(type, numAmount);

        return res.status(200).json({ success: true, data: quoteResult });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Crea una nueva transacción de cambio
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const createTransaction = async (req, res, next) => {
    try {
        const { type, amount, clientPixKey, clientPixKeyType, clientCbuCvu, payerEmail } = req.body;

        if (!type || (type !== 'ARS_TO_BRL' && type !== 'BRL_TO_ARS')) {
            return res.status(400).json({ success: false, error: 'Tipo de cambio inválido.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'El monto debe ser un número mayor a 0.' });
        }

        let transaction;

        if (type === 'ARS_TO_BRL') {
            if (!clientPixKey || !clientPixKeyType) {
                return res.status(400).json({ success: false, error: 'Faltan datos de PIX (clientPixKey, clientPixKeyType) para ARS_TO_BRL.' });
            }
            transaction = await exchangeEngine.initiateArsToBlr({
                amountARS: numAmount,
                clientPixKey,
                clientPixKeyType
            });
        } else {
            if (!clientCbuCvu || !payerEmail) {
                return res.status(400).json({ success: false, error: 'Faltan datos bancarios (clientCbuCvu, payerEmail) para BRL_TO_ARS.' });
            }
            transaction = await exchangeEngine.initiateBrlToArs({
                amountBRL: numAmount,
                clientCbuCvu,
                payerEmail
            });
        }

        return res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
};

/**
 * @description Obtiene el estado de una transacción existente
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getTransactionStatus = async (req, res, next) => {
    try {
        const { transactionId } = req.params;

        const transaction = await Transaction.findByTransactionId(transactionId);

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transacción no encontrada.' });
        }

        return res.status(200).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
};
