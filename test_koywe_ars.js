import koyweService from './src/services/koyweService.js';

async function test() {
    try {
        console.log("Testing createPixPayin from module...");
        const result = await koyweService.createPixPayin({
            amountBrl: 10,
            externalReference: "TEST_PIX_PAYIN_" + Date.now(),
            clientEmail: "test@brasil.com"
        });
        console.log("SUCCESS PIX PAYIN:", result);
    } catch (e) {
        console.error("ERROR:", e.response?.data || e.message);
    }
}
test();
