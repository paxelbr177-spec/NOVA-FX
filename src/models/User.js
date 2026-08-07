import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const memoryUserStore = new Map();

class User {
    static async createOrUpdate({ name, email, phone }) {
        const fallbackObj = {
            id: `USR-${Date.now()}`,
            name,
            email: email.toLowerCase(),
            phone,
            created_at: new Date()
        };

        memoryUserStore.set(email.toLowerCase(), fallbackObj);

        const sql = `
            INSERT INTO users (name, email, phone, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (email) 
            DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
            RETURNING *;
        `;
        const values = [name, email.toLowerCase(), phone];

        try {
            const result = await query(sql, values);
            if (result && result.rows && result.rows[0]) {
                memoryUserStore.set(email.toLowerCase(), result.rows[0]);
                return result.rows[0];
            }
        } catch (error) {
            logger.warn(`[UserModel] Guardando usuario en memoria (${error.message})`);
        }
        return fallbackObj;
    }

    static async findAll() {
        try {
            const sql = `SELECT * FROM users ORDER BY created_at DESC LIMIT 500;`;
            const result = await query(sql, []);
            if (result && result.rows) {
                const dbMap = new Map(result.rows.map(u => [u.email.toLowerCase(), u]));
                for (const [email, user] of memoryUserStore.entries()) {
                    if (!dbMap.has(email)) dbMap.set(email, user);
                }
                return Array.from(dbMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        } catch (error) {
            logger.warn(`[UserModel] Leyendo usuarios de memoria (${error.message})`);
        }
        return Array.from(memoryUserStore.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
}

export default User;
