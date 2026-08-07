import axios from 'axios';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Servicio de integración con Binance API (Spot Trading Engine)
 * Maneja la firma HMAC-SHA256 de peticiones privadas, consulta de cotizaciones en tiempo real
 * y ejecución de órdenes de mercado Spot para pares como USDTARS y USDTBRL.
 */
class BinanceService {
  constructor() {
    this.baseUrl = process.env.BINANCE_BASE_URL || 'https://api.binance.com';
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.secretKey = process.env.BINANCE_SECRET_KEY || '';
  }

  /**
   * Genera la firma criptográfica HMAC-SHA256 requerida por la API privada de Binance
   * @param {string} queryString - Cadena de parámetros de la URL
   * @returns {string} Firma hexadecimal
   */
  #generateSignature(queryString) {
    if (!this.secretKey) {
      throw new Error('[BinanceService] BINANCE_SECRET_KEY no está configurada.');
    }
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Obtiene la cotización Spot actual en tiempo real para un par dado (ej: 'USDTARS', 'USDTBRL')
   * @param {string} symbol - Par de trading (ej: USDTARS, USDTBRL)
   * @returns {Promise<{ symbol: string, price: number, timestamp: number }>}
   */
  async getTickerPrice(symbol) {
    try {
      const cleanSymbol = symbol.toUpperCase().replace('/', '');
      const response = await axios.get(`${this.baseUrl}/api/v3/ticker/price`, {
        params: { symbol: cleanSymbol },
        timeout: 5000
      });

      return {
        symbol: response.data.symbol,
        price: parseFloat(response.data.price),
        timestamp: Date.now()
      };
    } catch (error) {
      const errorData = error.response?.data || error.message;
      console.error(`[BinanceService] Error al obtener precio ticker para ${symbol}:`, errorData);
      throw new Error(`Error en Binance API (ticker/price): ${JSON.stringify(errorData)}`);
    }
  }

  /**
   * Obtiene la mejor oferta de compra/venta (Book Ticker) en tiempo real
   * @param {string} symbol - Par de trading (ej: USDTARS, USDTBRL)
   * @returns {Promise<{ symbol: string, bidPrice: number, bidQty: number, askPrice: number, askQty: number }>}
   */
  async getBestOrderBook(symbol) {
    try {
      const cleanSymbol = symbol.toUpperCase().replace('/', '');
      const response = await axios.get(`${this.baseUrl}/api/v3/ticker/bookTicker`, {
        params: { symbol: cleanSymbol },
        timeout: 5000
      });

      return {
        symbol: response.data.symbol,
        bidPrice: parseFloat(response.data.bidPrice), // Mejor comprador (Precio al que venderías)
        bidQty: parseFloat(response.data.bidQty),
        askPrice: parseFloat(response.data.askPrice), // Mejor vendedor (Precio al que comprarías)
        askQty: parseFloat(response.data.askQty)
      };
    } catch (error) {
      const errorData = error.response?.data || error.message;
      console.error(`[BinanceService] Error al obtener bookTicker para ${symbol}:`, errorData);
      throw new Error(`Error en Binance API (bookTicker): ${JSON.stringify(errorData)}`);
    }
  }

  /**
   * Ejecuta una orden de mercado Spot en Binance (BUY o SELL)
   * @param {Object} options
   * @param {string} options.symbol - Par de negociación (ej: 'USDTARS', 'USDTBRL')
   * @param {'BUY' | 'SELL'} options.side - Tipo de operación
   * @param {number} [options.quantity] - Cantidad del activo base (ej: USDT a comprar/vender)
   * @param {number} [options.quoteOrderQty] - Cantidad del activo cotizado (ej: ARS a gastar para comprar USDT)
   * @param {boolean} [options.isTest=false] - Si es true, valida la orden en Binance sin ejecutarla en el libro real (/api/v3/order/test)
   * @returns {Promise<Object>} Respuesta de Binance con detalles de ejecución
   */
  async executeSpotMarketOrder({ symbol, side, quantity, quoteOrderQty, isTest = false }) {
    try {
      if (!this.apiKey) {
        throw new Error('[BinanceService] BINANCE_API_KEY no está configurada.');
      }

      const cleanSymbol = symbol.toUpperCase().replace('/', '');
      const cleanSide = side.toUpperCase();

      if (!['BUY', 'SELL'].includes(cleanSide)) {
        throw new Error(`[BinanceService] Lado de orden inválido: ${side}. Debe ser 'BUY' o 'SELL'.`);
      }

      if (!quantity && !quoteOrderQty) {
        throw new Error('[BinanceService] Debe especificar "quantity" (activo base) o "quoteOrderQty" (activo cotización).');
      }

      const timestamp = Date.now();
      const params = {
        symbol: cleanSymbol,
        side: cleanSide,
        type: 'MARKET',
        recvWindow: 6000,
        timestamp
      };

      if (quantity) {
        params.quantity = quantity.toFixed(2);
      } else if (quoteOrderQty) {
        params.quoteOrderQty = quoteOrderQty.toFixed(2);
      }

      // Convertir parámetros a QueryString formateada correctamente
      const queryString = Object.keys(params)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');

      const signature = this.#generateSignature(queryString);
      const fullUrl = `${this.baseUrl}/api/v3/order${isTest ? '/test' : ''}?${queryString}&signature=${signature}`;

      const response = await axios.post(
        fullUrl,
        {},
        {
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      console.log(`[BinanceService] Orden de mercado Spot ejecutada exitosamente (${cleanSide} ${cleanSymbol}):`, response.data);
      return response.data;
    } catch (error) {
      const errorData = error.response?.data || error.message;
      console.error(`[BinanceService] Error al ejecutar orden Spot MARKET (${side} ${symbol}):`, errorData);
      throw new Error(`Error al ejecutar orden en Binance: ${JSON.stringify(errorData)}`);
    }
  }
}

export default new BinanceService();
