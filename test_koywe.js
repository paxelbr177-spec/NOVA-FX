import axios from 'axios';

const KOYWE_API_KEY = 'api_cf6e2cb7-49ea-4666-a220-fdaa3e6c970a';
const KOYWE_SECRET = '43fbd0417d8e5fe3322b2bfc2cf5e1757195daee9b0ddbf1ac2c2310ca8e3073';
const KOYWE_URL = 'https://api.koywe.com/api/v1';

async function testKoywe() {
    try {
        console.log('Authenticating with Koywe...');
        
        // Let's try standard Bearer/Basic Auth or check if they have a /auth/sign-in endpoint
        const response = await axios.post(`${KOYWE_URL}/auth/sign-in`, {
            apiKey: KOYWE_API_KEY,
            secret: KOYWE_SECRET
        });
        
        console.log('✅ Auth Success:', response.data);
    } catch (error) {
        console.error('❌ Auth Error data:', error.response?.data);
        console.error('❌ Auth Error status:', error.response?.status);
    }
}

testKoywe();
