import supabaseClient from '../config/supabaseClient.js';
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

        // Guardar en Supabase vía HTTPS REST API directa
        try {
            const saved = await supabaseClient.insertUser({ name, email, phone });
            if (saved) {
                memoryUserStore.set(email.toLowerCase(), saved);
            }
        } catch (e) {
            logger.warn(`[User] Supabase REST API exception: ${e.message}`);
        }

        // También intentar en PostgreSQL pool si está activo
        const sql = `
            INSERT INTO users (name, email, phone, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (email) 
            DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
            RETURNING *;
        `;
        try {
            const result = await query(sql, [name, email.toLowerCase(), phone]);
            if (result && result.rows && result.rows[0]) {
                memoryUserStore.set(email.toLowerCase(), result.rows[0]);
            }
        } catch (error) {}

        return memoryUserStore.get(email.toLowerCase()) || fallbackObj;
    }

    static async findAll() {
        try {
            const supabaseUsers = await supabaseClient.getUsers();
            if (supabaseUsers && supabaseUsers.length > 0) {
                for (const u of supabaseUsers) {
                    memoryUserStore.set(u.email.toLowerCase(), u);
                }
            }
        } catch (e) {}

        return Array.from(memoryUserStore.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
}

export default User;
