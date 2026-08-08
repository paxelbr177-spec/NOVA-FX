import axios from 'axios';

const KOYWE_API_KEY = 'api_cf6e2cb7-49ea-4666-a220-fdaa3e6c970a';
const KOYWE_SECRET = '43fbd0417d8e5fe3322b2bfc2cf5e1757195daee9b0ddbf1ac2c2310ca8e3073';
const KOYWE_URL = 'https://api.koywe.com/api/v1';

async function fetchIds() {
    try {
        console.log('Authenticating...');
        const authRes = await axios.post(`${KOYWE_URL}/auth/sign-in`, {
            apiKey: KOYWE_API_KEY,
            secret: KOYWE_SECRET
        });
        
        const token = authRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const orgId = 'org3_91b7fc1b-4f4d-4d8d-9992-d115bd50e885';
            const res = await axios.get(`${KOYWE_URL}/organizations/${orgId}/merchants`, { headers });
            const merchants = res.data;
            merchants.forEach(m => {
                console.log(`✅ Merchant ID:`, m.id);
                console.log(`✅ Merchant Name:`, m.name);
            });
        } catch (err) {
            console.log(`❌ Failed:`, err.message);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fetchIds();
