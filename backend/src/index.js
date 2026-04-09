require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');

const metaApiService = require('./services/metaApiService');
const botService = require('./services/botService');
const copyTradingService = require('./services/copyTradingService');

const tradesRouter = require('./routes/trades');
const rulesRouter = require('./routes/rules');
const accountsRouter = require('./routes/accounts');
const copyTradingRouter = require('./routes/copytrading');

const app = express();
const httpServer = createServer(app);

// ── WebSocket Server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
global.wssClients = new Set();

wss.on('connection', (ws) => {
  global.wssClients.add(ws);
  console.log(`[WS] Client connected. Total: ${global.wssClients.size}`);
  ws.on('close', () => {
    global.wssClients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${global.wssClients.size}`);
  });
});

global.broadcast = (data) => {
  const msg = JSON.stringify(data);
  for (const client of global.wssClients) {
    if (client.readyState === 1) client.send(msg);
  }
};

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/trades', tradesRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/copytrading', copyTradingRouter);

const path = require('path');
app.use(express.static(path.join(__dirname, '../../../frontend/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/build', 'index.html'));
});

// ── Boot ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function boot() {
  try {
    console.log('[Boot] Initializing MetaApi connections...');
    await metaApiService.initialize();
    console.log('[Boot] MetaApi initialized ✓');

    console.log('[Boot] Starting auto SL/TP bot...');
    await botService.start();
    console.log('[Boot] Bot started ✓');

    console.log('[Boot] Starting copy trading service...');
    copyTradingService.start();
    console.log('[Boot] Copy trading service ready ✓');

    httpServer.listen(PORT, () => {
      console.log(`\n🚀 Server running at http://localhost:${PORT}`);
      console.log(`📡 WebSocket ready at ws://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Boot] Failed to start:', err.message);
    process.exit(1);
  }
}

boot();
