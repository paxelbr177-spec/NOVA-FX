# Sistema de Cambio de Divisas ARS ↔ BRL

Sistema de backend en Node.js/Express para facilitar el intercambio de divisas entre Pesos Argentinos (ARS) y Reales Brasileños (BRL) utilizando la API de Binance Spot y la API de Mercado Pago Brasil (PIX).

## Arquitectura
- **Backend:** Node.js + Express
- **Base de Datos:** PostgreSQL (pg)
- **Integraciones:**
  - API de Binance Spot (para conversión de cripto USDTARS y USDTBRL)
  - API de Mercado Pago Brasil (para generación de códigos QR PIX y envíos/disbursements PIX)
  - Telegram Bot API (para alertas de emergencia)
- **Patrones:** Arquitectura en capas (Routes, Controllers, Services, Models), State Machine para las transacciones.

## Prerrequisitos
- Node.js 20+
- PostgreSQL
- Cuentas en Binance, Mercado Pago Brasil y Telegram.

## Instalación

1. Clona el repositorio:
   ```bash
   git clone <repo-url>
   cd ars-brl-fx-backend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   Copia el archivo `.env.example` a `.env` y ajusta los valores.
   ```bash
   cp .env.example .env
   ```

4. Inicia la aplicación:
   ```bash
   npm start
   ```

## Endpoints de la API

| Método | Endpoint | Descripción |
| --- | --- | --- |
| GET | `/health` | Verificación de estado de la aplicación. |
| GET | `/api/v1/exchange/quote` | Obtiene la cotización actual para ARS_TO_BRL o BRL_TO_ARS. |
| POST | `/api/v1/exchange/transactions` | Crea una nueva transacción de cambio. |
| GET | `/api/v1/exchange/transactions/:id` | Consulta el estado de una transacción. |
| POST | `/api/v1/webhooks/mercadopago` | Webhook para actualizaciones de pago desde Mercado Pago. |
| POST | `/api/v1/webhooks/ars-deposit` | Webhook para confirmar depósitos en pesos (ARS). |

## Diagrama de Estados de Transacciones

```
PENDING_PAYMENT → PAYMENT_RECEIVED → CONVERTING_CRYPTO → DISBURSING_FIAT → COMPLETED
                                                                          \→ FAILED_NEEDS_REVIEW
```

## Variables de Entorno (Referencia)
- `PORT`: Puerto en el que corre la API.
- `NODE_ENV`: Entorno (`development` o `production`).
- `DATABASE_URL`: URL de conexión a PostgreSQL.
- `BINANCE_BASE_URL`: URL de la API de Binance.
- `BINANCE_API_KEY`: API Key de Binance.
- `BINANCE_SECRET_KEY`: Secret Key de Binance.
- `MP_BR_ACCESS_TOKEN`: Access Token de Mercado Pago.
- `MP_WEBHOOK_SECRET`: Secret para validar webhooks de Mercado Pago.
- `WEBHOOK_SECRET`: Secret genérico para webhooks internos.
- `FX_MARGIN_PERCENTAGE`: Porcentaje de margen de comisión (ej: `2`).
- `TELEGRAM_BOT_TOKEN`: Token para alertas de bot de Telegram.
- `TELEGRAM_CHAT_ID`: ID del chat de Telegram para notificaciones.

## Licencia
ISC
