import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';
import { getOperatingStatus, setManualOverride } from '../utils/operatingHours.js';

/**
 * PIN de seguridad del Administrador
 */
const ADMIN_PIN = process.env.ADMIN_PIN || '058907';

/**
 * Middleware para validar el PIN de Administrador
 */
export const verifyAdminPin = (req, res, next) => {
    const pin = req.headers['x-admin-pin'] || req.query.pin;
    if (pin !== ADMIN_PIN) {
        return res.status(401).json({ success: false, error: 'PIN de Administrador inválido o no proporcionado.' });
    }
    next();
};

/**
 * Cambia manualmente el estado operativo (abierto/cerrado/automático)
 */
export const toggleOperatingStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const newStatus = setManualOverride(status);
        logger.info(`[AdminController] Estado operativo modificado manualmente a: ${status}`);
        return res.status(200).json({ success: true, data: newStatus });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene las estadísticas generales (KPIs) para el Dashboard Admin
 */
export const getAdminStats = async (req, res, next) => {
    try {
        const transactions = await Transaction.findAll();

        let totalVolumeArs = 0;
        let totalVolumeBrl = 0;
        let totalCommissionArs = 0;
        let completedCount = 0;
        let pendingCount = 0;
        let needsReviewCount = 0;
        let refundedCount = 0;

        for (const tx of transactions) {
            const amountSrc = parseFloat(tx.amount_source || 0);
            const status = tx.status;

            if (tx.type === 'ARS_TO_BRL') {
                totalVolumeArs += amountSrc;
                if (status === 'COMPLETED') {
                    totalCommissionArs += amountSrc * parseFloat(tx.margin_applied || 0.02);
                }
            } else if (tx.type === 'BRL_TO_ARS') {
                totalVolumeBrl += amountSrc;
                if (status === 'COMPLETED') {
                    const snap = typeof tx.fx_rate_snapshot === 'string' ? JSON.parse(tx.fx_rate_snapshot) : tx.fx_rate_snapshot;
                    const arsEquiv = amountSrc * (snap?.askUsdtArs || 1575.80) / (snap?.askUsdtBrl || 5.1022);
                    totalCommissionArs += arsEquiv * parseFloat(tx.margin_applied || 0.02);
                }
            }

            if (status === 'COMPLETED') completedCount++;
            else if (status === 'PENDING_PAYMENT' || status === 'PAYMENT_RECEIVED' || status === 'CONVERTING_CRYPTO' || status === 'DISBURSING_FIAT') pendingCount++;
            else if (status === 'FAILED_NEEDS_REVIEW') needsReviewCount++;
            else if (status === 'REFUNDED' || status === 'RESOLVED') refundedCount++;
        }

        return res.status(200).json({
            success: true,
            data: {
                totalVolumeArs: parseFloat(totalVolumeArs.toFixed(2)),
                totalVolumeBrl: parseFloat(totalVolumeBrl.toFixed(2)),
                totalCommissionArs: parseFloat(totalCommissionArs.toFixed(2)),
                totalTransactions: transactions.length,
                completedCount,
                pendingCount,
                needsReviewCount,
                refundedCount,
                operatingStatus: getOperatingStatus()
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene el listado completo de transacciones para el Admin
 */
export const getAdminTransactions = async (req, res, next) => {
    try {
        const transactions = await Transaction.findAll();
        return res.status(200).json({
            success: true,
            data: transactions
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Actualiza el estado de una transacción desde el panel de Admin
 */
export const updateAdminTransactionStatus = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        const { status, note } = req.body;

        const allowedStatuses = ['COMPLETED', 'FAILED_NEEDS_REVIEW', 'REFUNDED', 'RESOLVED', 'PENDING_PAYMENT'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Estado no válido.' });
        }

        const updated = await Transaction.updateStatus(transactionId, status, { error_details: note || `Actualizado por Admin a ${status}` });
        logger.info(`[AdminController] Transacción ${transactionId} actualizada a estado ${status}`);

        return res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtiene el listado completo de usuarios registrados para el Admin
 */
export const getAdminUsers = async (req, res, next) => {
    try {
        const users = await User.findAll();
        return res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        next(error);
    }
};
