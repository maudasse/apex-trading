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
app.use(cors({ origin: ['https://apex-trading-three.vercel.app', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/trades', tradesRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/copytrading', copyTradingRouter);

// ── Restart Services ───────────────────────────────────────────────────────
app.post('/api/restart', async (req, res) => {
  console.log('[Restart] Restarting all services...');
  try {
    botService.stop();
    copyTradingService.stop();
    await metaApiService.initialize();
    await botService.start();
    copyTradingService.start();
    console.log('[Restart] All services restarted ✓');
    res.json({ success: true, message: 'Services restarted successfully' });
  } catch (err) {
    console.error('[Restart] Failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── Railway Restart ───────────────────────────────────────────────────────
app.post('/api/railway-restart', async (req, res) => {
  try {
    const serviceId = process.env.RAILWAY_SERVICE_ID;
    const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
    const apiToken = process.env.RAILWAY_API_TOKEN;
    if (!serviceId || !environmentId || !apiToken) {
      return res.status(400).json({ success: false, error: 'Missing Railway env vars' });
    }
    const query = `mutation { serviceInstanceRedeploy(serviceId: "${serviceId}", environmentId: "${environmentId}") }`;
    await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
      body: JSON.stringify({ query }),
    });
    res.json({ success: true, message: 'Railway restart triggered' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────────
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
