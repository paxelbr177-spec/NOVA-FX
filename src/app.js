import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import { initDatabase } from './config/database.js';
import { logger } from './utils/logger.js';
import exchangeRoutes from './routes/exchangeRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/errorHandler.js';

const app = express();

// Middlewares
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(cors());

// Servir la interfaz web estática
app.use(express.static('public'));

// Parseo de JSON manteniendo rawBody para la validación de firmas de webhooks
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// Montar rutas
app.use('/api/v1/exchange', exchangeRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Manejadores de errores globales
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Inicializar y arrancar servidor
const startServer = async () => {
    try {
        await initDatabase();
        
        const PORT = config.port || 3000;
        app.listen(PORT, () => {
            logger.info(`[App] Servidor corriendo en el puerto ${PORT} en modo ${config.nodeEnv}`);
        });
    } catch (error) {
        logger.error(`[App] Error al inicializar: ${error.message}`);
        process.exit(1);
    }
};

startServer();
