import binanceService from './src/services/binanceService.js';

async function testConnection() {
  console.log('--------------------------------------------------');
  console.log('🧪 Probando conexión en vivo con Binance API...');
  console.log('--------------------------------------------------');

  try {
    const usdtArs = await binanceService.getTickerPrice('USDTARS');
    console.log(`✅ Ticker USDT/ARS: ${usdtArs.price} ARS (Timestamp: ${new Date(usdtArs.timestamp).toLocaleTimeString()})`);

    const usdtBrl = await binanceService.getTickerPrice('USDTBRL');
    console.log(`✅ Ticker USDT/BRL: ${usdtBrl.price} BRL (Timestamp: ${new Date(usdtBrl.timestamp).toLocaleTimeString()})`);

    const usdtArsBook = await binanceService.getBestOrderBook('USDTARS');
    console.log(`📊 Order Book USDT/ARS -> Compra (Bid): ${usdtArsBook.bidPrice} | Venta (Ask): ${usdtArsBook.askPrice}`);

    const usdtBrlBook = await binanceService.getBestOrderBook('USDTBRL');
    console.log(`📊 Order Book USDT/BRL -> Compra (Bid): ${usdtBrlBook.bidPrice} | Venta (Ask): ${usdtBrlBook.askPrice}`);

    // Cálculo del tipo de cambio cruzado implícito ARS/BRL
    const crossRate = usdtArsBook.bidPrice / usdtBrlBook.askPrice;
    console.log(`🔀 Tipo de cambio cruzado directo (1 BRL en ARS): ~${crossRate.toFixed(2)} ARS`);

    console.log('--------------------------------------------------');
    console.log('🎉 Conexión con Binance API exitosa!');
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Error probando Binance API:', error.message);
  }
}

testConnection();
