import axios from 'axios';
import { logger } from '../utils/logger.js';

let cachedRates = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

const PLATFORMS = ['satoshitango', 'belo', 'fiwind'];
const BASE_URL = 'https://criptoya.com/api';

class CriptoYaService {
    /**
     * Obtiene las cotizaciones ARS/BRL calculadas via tasa cruzada USDT.
     * Para cada plataforma consulta USDT/ARS y USDT/BRL, luego:
     *   - Precio para COMPRAR BRL (pagás ARS) = askUsdtArs / bidUsdtBrl
     *   - Precio para VENDER BRL (recibís ARS) = bidUsdtArs / askUsdtBrl
     */
    async getRealRates() {
        const now = Date.now();
        if (cachedRates && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return cachedRates;
        }

        try {
            // Fetch all USDT/ARS and USDT/BRL rates in parallel
            const requests = [];
            for (const p of PLATFORMS) {
                requests.push(
                    axios.get(`${BASE_URL}/${p}/usdt/ars/1`, { timeout: 8000 }).catch(() => null),
                    axios.get(`${BASE_URL}/${p}/usdt/brl/1`, { timeout: 8000 }).catch(() => null)
                );
            }
            const responses = await Promise.all(requests);

            const rates = {};
            for (let i = 0; i < PLATFORMS.length; i++) {
                const arsRes = responses[i * 2];
                const brlRes = responses[i * 2 + 1];
                const name = PLATFORMS[i];

                if (arsRes?.data && brlRes?.data) {
                    const askArs = arsRes.data.totalAsk || arsRes.data.ask;
                    const bidArs = arsRes.data.totalBid || arsRes.data.bid;
                    const askBrl = brlRes.data.totalAsk || brlRes.data.ask;
                    const bidBrl = brlRes.data.totalBid || brlRes.data.bid;

                    if (askArs && bidBrl) {
                        // Para COMPRAR BRL: comprás USDT con ARS (askArs), vendés USDT por BRL (bidBrl)
                        // Tasa efectiva = askArs / bidBrl (cuántos ARS por 1 BRL)
                        const buyRate = parseFloat((askArs / bidBrl).toFixed(2));

                        // Para VENDER BRL: comprás USDT con BRL (askBrl), vendés USDT por ARS (bidArs)
                        // Tasa efectiva = bidArs / askBrl (cuántos ARS recibís por 1 BRL)
                        const sellRate = (bidArs && askBrl) ? parseFloat((bidArs / askBrl).toFixed(2)) : null;

                        rates[name] = {
                            buy: buyRate,
                            sell: sellRate,
                            usdtArs: { ask: askArs, bid: bidArs },
                            usdtBrl: { ask: askBrl, bid: bidBrl },
                            timestamp: (arsRes.data.time || brlRes.data.time) * 1000
                        };
                    }
                }
            }

            // Find best options
            let bestBuy = { platform: null, price: Infinity };
            let bestSell = { platform: null, price: 0 };

            for (const [name, rate] of Object.entries(rates)) {
                if (rate.buy && rate.buy < bestBuy.price) {
                    bestBuy = { platform: name, price: rate.buy };
                }
                if (rate.sell && rate.sell > bestSell.price) {
                    bestSell = { platform: name, price: rate.sell };
                }
            }

            cachedRates = {
                rates,
                bestBuy,
                bestSell,
                updatedAt: new Date().toISOString()
            };
            cacheTimestamp = now;

            logger.info(`[CriptoYaService] Cotizaciones actualizadas: bestBuy=${bestBuy.platform}@${bestBuy.price}, bestSell=${bestSell.platform}@${bestSell.price}`);
            return cachedRates;
        } catch (error) {
            logger.warn(`[CriptoYaService] Error obteniendo cotizaciones: ${error.message}`);
            if (cachedRates) return cachedRates;
            return {
                rates: {},
                bestBuy: { platform: null, price: null },
                bestSell: { platform: null, price: null },
                updatedAt: new Date().toISOString(),
                error: 'No se pudieron obtener cotizaciones'
            };
        }
    }
}

export default new CriptoYaService();
