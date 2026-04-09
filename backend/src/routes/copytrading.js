const express = require('express');
const router = express.Router();
const copyTradingService = require('../services/copyTradingService');
const metaApiService = require('../services/metaApiService');

// GET /api/copytrading — Get config and stats
router.get('/', (req, res) => {
  res.json({ success: true, data: copyTradingService.getStats() });
});

// PUT /api/copytrading/config — Update config
router.put('/config', (req, res) => {
  try {
    const config = copyTradingService.updateConfig(req.body);
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/copytrading/toggle — Enable or disable
router.post('/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    const config = copyTradingService.updateConfig({ enabled });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/copytrading/accounts — List available accounts for selection
router.get('/accounts', (req, res) => {
  const accounts = metaApiService.getAllAccountMeta();
  res.json({ success: true, data: accounts });
});

module.exports = router;
