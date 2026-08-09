/**
 * Control del horario de atención de NOVA FX
 * Horario oficial: 08:00 AM a 23:00 PM (GMT-3 / Hora Argentina y Brasil)
 */

let manualOverride = null; // null = automático por horario, 'OPEN' = forzado abierto, 'CLOSED' = forzado cerrado

/**
 * Indica si el sistema está abierto para recibir nuevas transacciones
 * @returns {boolean}
 */
export const isSystemOpen = () => {
    if (manualOverride === 'OPEN') return true;
    if (manualOverride === 'CLOSED') return false;

    // Calcular la hora actual en zona horaria ART/BRT (UTC-3)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const localHour = (utcHour - 3 + 24) % 24;

    // Abierto desde las 08:00 (inclusive) hasta las 22:59:59 (hora 22 es la última abierta).
    // A las 23:00 hs se cierra.
    return localHour >= 8 && localHour < 23;
};

/**
 * Obtiene información detallada del estado operativo del servicio
 * @returns {Object}
 */
export const getOperatingStatus = () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const localHour = (utcHour - 3 + 24) % 24;
    const localMinutes = now.getUTCMinutes();
    const isOpen = isSystemOpen();

    return {
        isOpen,
        operatingHours: '08:00 a 23:00 hs (ART/BRT)',
        currentTime: `${String(localHour).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')} hs`,
        timezone: 'ART/BRT (UTC-3)',
        manualOverride,
        message: isOpen
            ? 'Servicio activo. Procesando operaciones normalmente.'
            : 'Fuera de horario de atención. El servicio reanudará la recepción de órdenes a las 08:00 AM.'
    };
};

/**
 * Establece una invalidación manual del estado operativo
 * @param {string|null} status - 'OPEN', 'CLOSED' o null ('AUTO')
 */
export const setManualOverride = (status) => {
    if (status === 'AUTO' || status === 'auto') {
        manualOverride = null;
    } else if (status === 'OPEN' || status === 'CLOSED') {
        manualOverride = status;
    } else if (status === null) {
        manualOverride = null;
    } else {
        throw new Error('Estado de invalidación no válido. Use "OPEN", "CLOSED" o "AUTO".');
    }
    return getOperatingStatus();
};
