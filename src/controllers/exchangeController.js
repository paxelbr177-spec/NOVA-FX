import exchangeEngine from '../services/exchangeEngine.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { isSystemOpen, getOperatingStatus } from '../utils/operatingHours.js';

export const getOperatingStatusHandler = (req, res) => {
    return res.status(200).json({
        success: true,
        data: getOperatingStatus()
    });
};

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
        const operatingStatus = getOperatingStatus();

        return res.status(200).json({
            success: true,
            data: {
                ...quoteResult,
                operatingStatus
            }
        });
    } catch (error) {
        next(error);
    }
};

export const createTransaction = async (req, res, next) => {
    try {
        // Verificar si el servicio está en horario de atención (08:00 a 23:00 hs)
        if (!isSystemOpen()) {
            const statusInfo = getOperatingStatus();
            return res.status(403).json({
                success: false,
                isClosed: true,
                error: 'Servicio cerrado fuera del horario de atención (08:00 a 23:00 hs). Las transacciones se reanudarán a las 08:00 AM.',
                operatingStatus: statusInfo
            });
        }

        const { type, amount, clientPixKey, clientPixKeyType, clientCbuCvu, payerEmail, clientName, clientEmail, clientPhone } = req.body;
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
                amountARS: numAmount, clientPixKey, clientPixKeyType, clientName, clientEmail, clientPhone
            });
        } else {
            if (!clientCbuCvu || (!payerEmail && !clientEmail)) {
                return res.status(400).json({ success: false, error: 'Faltan datos bancarios para BRL_TO_ARS.' });
            }
            transaction = await exchangeEngine.initiateBrlToArs({
                amountBRL: numAmount, clientCbuCvu, payerEmail: payerEmail || clientEmail, clientName, clientPhone
            });
        }
        return res.status(201).json({ success: true, data: transaction });
    } catch (error) {
        next(error);
    }
};

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
