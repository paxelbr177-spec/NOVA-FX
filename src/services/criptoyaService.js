import axios from 'axios';
import { logger } from '../utils/logger.js';

let cachedRates = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

class CriptoYaService {
    async getRealRates() {
        const now = Date.now();
        if (cachedRates && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return cachedRates;
        }

        try {
            const res = await axios.get('https://criptoya.com/api/real', { timeout: 8000 });
            const data = res.data;

            const platforms = ['satoshitango', 'belo', 'fiwind'];
            const rates = {};

            for (const p of platforms) {
                if (data[p]) {
                    rates[p] = {
                        buy: data[p].totalAsk || data[p].ask || null,   // Price to BUY BRL (pay ARS)
                        sell: data[p].totalBid || data[p].bid || null,  // Price to SELL BRL (receive ARS)
                        timestamp: data[p].time ? data[p].time * 1000 : now
                    };
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
                bestBuy,   // cheapest to buy BRL
                bestSell,  // best price to sell BRL
                updatedAt: new Date().toISOString()
            };
            cacheTimestamp = now;

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
