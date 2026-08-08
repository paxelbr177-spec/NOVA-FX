import bitsoService from './src/services/bitsoService.js';

async function test() {
    try {
        console.log("Testing verifyDeposit...");
        // This should return null if no funding of 999 BRL exists in the last hour
        const result = await bitsoService.verifyDeposit('brl', 999);
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
