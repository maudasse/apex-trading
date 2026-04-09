const express = require('express');
const router = express.Router();
const metaApiService = require('../services/metaApiService');
const botService = require('../services/botService');

// GET /api/trades/positions - All open positions
router.get('/positions', async (req, res) => {
  try {
    const positions = await metaApiService.getAllPositions();
    res.json({ success: true, data: positions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trades/positions/:platform - Positions for specific platform
router.get('/positions/:platform', async (req, res) => {
  try {
    const positions = await metaApiService.getPositions(req.params.platform);
    res.json({ success: true, data: positions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trades/modify - Manually modify a position
router.post('/modify', async (req, res) => {
  const { platform, positionId, stopLoss, takeProfit } = req.body;
  if (!platform || !positionId) {
    return res.status(400).json({ success: false, error: 'platform and positionId required' });
  }
  try {
    const result = await metaApiService.modifyPosition(platform, positionId, stopLoss, takeProfit);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trades/history - Trade history (optionally filtered by account)
router.get('/history', async (req, res) => {
  const daysBack = parseInt(req.query.days || '7');
  const accountKey = req.query.account;
  try {
    const history = accountKey
      ? await metaApiService.getHistory(accountKey, daysBack)
      : await metaApiService.getAllHistory(daysBack);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trades/bot/stats - Bot statistics
router.get('/bot/stats', (req, res) => {
  res.json({ success: true, data: botService.getStats() });
});

// POST /api/trades/bot/toggle - Start/stop bot
router.post('/bot/toggle', (req, res) => {
  const { enabled } = req.body;
  if (enabled) {
    botService.start();
  } else {
    botService.stop();
  }
  res.json({ success: true, running: botService.getStats().running });
});

module.exports = router;
