/**
 * Clase para errores operacionales personalizados de la aplicación.
 * Útil para lanzar errores controlados con código HTTP específico.
 */
export class AppError extends Error {
  /**
   * Crea una instancia de AppError.
   * @param {string} message - Mensaje descriptivo del error.
   * @param {number} statusCode - Código de estado HTTP.
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware para manejar solicitudes a rutas que no existen en la API.
 * 
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @param {import('express').NextFunction} next - Función next de Express.
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Recurso no encontrado',
    path: req.originalUrl
  });
};

/**
 * Middleware global para la captura y respuesta unificada de errores en Express.
 * 
 * @param {Error|AppError} err - El error capturado.
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @param {import('express').NextFunction} next - Función next de Express.
 */
export const globalErrorHandler = (err, req, res, next) => {
  console.error('[ErrorHandler] Error capturado:', err.stack || err);

  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  let message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(isDevelopment && { stack: err.stack })
  });
};
