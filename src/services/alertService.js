import axios from 'axios';

/**
 * Servicio para envío de alertas a través de Telegram.
 */
class AlertService {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    }

    /**
     * Envía un mensaje a Telegram. Fire-and-forget.
     * @param {string} message - El mensaje a enviar en formato HTML.
     */
    async sendTelegramAlert(message) {
        if (!this.token || !this.chatId) {
            console.warn('[AlertService] Token o Chat ID de Telegram no configurados.');
            return;
        }

        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('[AlertService] Error enviando alerta de Telegram:', error.message);
        }
    }

    /**
     * Notifica una transacción fallida.
     * @param {Object} transaction - Objeto con detalles de la transacción.
     * @param {Error|string} errorDetails - Detalles del error ocurrido.
     */
    async notifyFailedTransaction(transaction, errorDetails) {
        const message = `
🚨 <b>TRANSACCIÓN FALLIDA - REVISIÓN MANUAL REQUERIDA</b> 🚨

<b>ID:</b> <code>${transaction?.transaction_id || 'N/A'}</code>
<b>Tipo:</b> ${transaction?.type || 'N/A'}
<b>Monto Origen:</b> ${transaction?.amount_source || 'N/A'} ${transaction?.currency_source || ''}

<b>Error:</b>
<pre>${typeof errorDetails === 'object' ? errorDetails.message : errorDetails}</pre>

<b>Fecha:</b> ${new Date().toISOString()}
`;
        await this.sendTelegramAlert(message);
    }

    /**
     * Notifica una transacción exitosa brevemente.
     * @param {Object} transaction - Objeto de transacción.
     */
    async notifySuccessfulTransaction(transaction) {
        const message = `
✅ <b>TRANSACCIÓN EXITOSA</b>

<b>ID:</b> <code>${transaction.transaction_id}</code>
<b>Tipo:</b> ${transaction.type}
<b>Monto Origen:</b> ${transaction.amount_source} ${transaction.currency_source}
<b>Monto Destino:</b> ${transaction.amount_target} ${transaction.currency_target}
`;
        await this.sendTelegramAlert(message);
    }
}

export default new AlertService();
