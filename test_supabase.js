import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtsotmbqnlahoumvjtsh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_xRu6TN6N4j675ueZBcDJlQ_H0Y9VpIi';

const baseUrl = `${SUPABASE_URL}/rest/v1`;
const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=representation'
};

async function testInsert() {
    try {
        console.log(`Connecting to: ${baseUrl}/users`);
        const res = await axios.post(`${baseUrl}/users`, {
            name: 'Test REST API User',
            email: `test_rest_${Date.now()}@test.com`,
            phone: '123456789'
        }, { headers, timeout: 5000 });
        
        console.log('✅ Success:', res.data);
    } catch (error) {
        console.error('❌ Error data:', error.response?.data);
        console.error('❌ Error message:', error.message);
    }
}

testInsert();
