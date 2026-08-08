import { Router } from 'express';
import criptoyaService from '../services/criptoyaService.js';

const router = Router();

router.get('/real', async (req, res) => {
    try {
        const rates = await criptoyaService.getRealRates();
        return res.status(200).json({ success: true, data: rates });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
