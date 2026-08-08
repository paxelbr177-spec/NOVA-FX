import exchangeEngine from '../services/exchangeEngine.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

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
        const { type, amount, clientPixKey, clientPixKeyType, clientCbuCvu, payerEmail, clientName, clientEmail, clientPhone } = req.body;

        if (!type || (type !== 'ARS_TO_BRL' && type !== 'BRL_TO_ARS')) {
            return res.status(400).json({ success: false, error: 'Tipo de cambio inválido.' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, error: 'El monto debe ser un número mayor a 0.' });
        }

        let transaction;
        const quote = await exchangeEngine.getQuote(type, numAmount > 0 ? numAmount : 100000);
        const liveSnapshot = quote.rateSnapshot;

        if (type === 'ARS_TO_BRL') {
            const minLimitARS = 1; // Límite removido para pruebas
            if (numAmount < minLimitARS) {
                return res.status(400).json({ success: false, error: `El monto mínimo de cambio es $${minLimitARS.toLocaleString('es-AR')} ARS (~1 USD).` });
            }
            if (!clientPixKey || !clientPixKeyType) {
                return res.status(400).json({ success: false, error: 'Faltan datos de PIX (clientPixKey, clientPixKeyType) para ARS_TO_BRL.' });
            }
            transaction = await exchangeEngine.initiateArsToBlr({
                amountARS: numAmount,
                clientPixKey,
                clientPixKeyType,
                clientName,
                clientEmail,
                clientPhone
            });
        } else {
            const minLimitBRL = 1; // Límite removido para pruebas
            if (numAmount < minLimitBRL) {
                return res.status(400).json({ success: false, error: `El monto mínimo de cambio es R$ ${minLimitBRL.toFixed(2)} BRL (~1 USD).` });
            }
            if (!clientCbuCvu || (!payerEmail && !clientEmail)) {
                return res.status(400).json({ success: false, error: 'Faltan datos bancarios para BRL_TO_ARS.' });
            }
            transaction = await exchangeEngine.initiateBrlToArs({
                amountBRL: numAmount,
                clientCbuCvu,
                payerEmail: payerEmail || clientEmail,
                clientName,
                clientPhone
            });
        }

        return res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
};

/**
 * Registra o actualiza el perfil de un usuario cliente
 */
export const registerUser = async (req, res, next) => {
    try {
        const { name, email, phone } = req.body;
        if (!name || !email || !phone) {
            return res.status(400).json({ success: false, error: 'Nombre, Email y WhatsApp son obligatorios.' });
        }

        const user = await User.createOrUpdate({ name, email, phone });
        return res.status(200).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
};

import bitsoService from '../services/bitsoService.js';

/**
 * @description Obtiene el estado de una transacción existente
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const getTransactionStatus = async (req, res, next) => {
    try {
        const { transactionId } = req.params;

        let transaction = await Transaction.findByTransactionId(transactionId);

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transacción no encontrada.' });
        }

        // Si está pendiente de pago, consultamos Bitso para ver si ya entró el fondeo
        if (transaction.status === 'PENDING_PAYMENT') {
            const currency = transaction.currency_source.toLowerCase(); // 'ars' o 'brl'
            const amount = parseFloat(transaction.amount_source);
            
            const deposit = await bitsoService.verifyDeposit(currency, amount);
            
            if (deposit) {
                // Depósito encontrado, actualizamos a PROCESSING
                await Transaction.updateStatus(transactionId, 'PROCESSING', {
                    bitso_funding_id: deposit.fid,
                    bitso_funding_details: JSON.stringify(deposit)
                });
                // Refrescar transacción
                transaction = await Transaction.findByTransactionId(transactionId);
            }
        }

        return res.status(200).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
};
