const express = require('express');
const router = express.Router();
const metaApiService = require('../services/metaApiService');

// GET /api/accounts — List all connected accounts with metadata
router.get('/', (req, res) => {
  const accounts = metaApiService.getAllAccountMeta();
  res.json({ success: true, data: accounts });
});

// GET /api/accounts/info — Balance, equity, P&L for ALL accounts
router.get('/info', async (req, res) => {
  try {
    const info = await metaApiService.getAllAccountInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/accounts/:accountKey/info — Info for a specific account
router.get('/:accountKey/info', async (req, res) => {
  try {
    const info = await metaApiService.getAccountInfo(req.params.accountKey);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts/deploy-all — Deploy all accounts (start billing)
router.post('/deploy-all', async (req, res) => {
  const results = [];
  const keys = metaApiService.getAccountKeys();
  for (const key of keys) {
    try {
      const meta = metaApiService.getAccountMeta(key);
      await meta.account.deploy();
      results.push({ key, status: 'deployed' });
      console.log(`[Accounts] Deployed "${meta.label}"`);
    } catch (err) {
      results.push({ key, status: 'error', error: err.message });
    }
  }
  res.json({ success: true, data: results });
});

// POST /api/accounts/undeploy-all — Undeploy all accounts (stop billing)
router.post('/undeploy-all', async (req, res) => {
  const results = [];
  const keys = metaApiService.getAccountKeys();
  for (const key of keys) {
    try {
      const meta = metaApiService.getAccountMeta(key);
      await meta.account.undeploy();
      results.push({ key, status: 'undeployed' });
      console.log(`[Accounts] Undeployed "${meta.label}"`);
    } catch (err) {
      results.push({ key, status: 'error', error: err.message });
    }
  }
  res.json({ success: true, data: results });
});

// POST /api/accounts/:accountKey/deploy — Deploy single account
router.post('/:accountKey/deploy', async (req, res) => {
  try {
    const meta = metaApiService.getAccountMeta(req.params.accountKey);
    if (!meta) return res.status(404).json({ success: false, error: 'Account not found' });
    await meta.account.deploy();
    res.json({ success: true, message: `"${meta.label}" deployed` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts/:accountKey/undeploy — Undeploy single account
router.post('/:accountKey/undeploy', async (req, res) => {
  try {
    const meta = metaApiService.getAccountMeta(req.params.accountKey);
    if (!meta) return res.status(404).json({ success: false, error: 'Account not found' });
    await meta.account.undeploy();
    res.json({ success: true, message: `"${meta.label}" undeployed` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
