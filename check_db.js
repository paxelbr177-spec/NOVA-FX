import axios from 'axios';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtsotmbqnlahoumvjtsh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_xRu6TN6N4j675ueZBcDJlQ_H0Y9VpIi';

const baseUrl = `${SUPABASE_URL}/rest/v1`;
const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

async function checkTransactions() {
    try {
        console.log(`Fetching transactions...`);
        const res = await axios.get(`${baseUrl}/transactions?select=*&order=created_at.desc&limit=5`, { headers, timeout: 5000 });
        
        console.log('✅ Recent transactions:');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (error) {
        console.error('❌ Error data:', error.response?.data);
        console.error('❌ Error message:', error.message);
    }
}

checkTransactions();
