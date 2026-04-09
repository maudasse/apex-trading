const express = require('express');
const router = express.Router();
const rulesStore = require('../services/rulesStore');

// GET /api/rules - Get all rules
router.get('/', (req, res) => {
  res.json({ success: true, data: rulesStore.getRules() });
});

// PUT /api/rules/global - Update global rules
router.put('/global', (req, res) => {
  try {
    const rules = rulesStore.updateGlobal(req.body);
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/rules/symbol/:symbol - Set per-symbol rule
router.put('/symbol/:symbol', (req, res) => {
  try {
    const rules = rulesStore.setSymbolRule(req.params.symbol, req.body);
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/rules/symbol/:symbol - Remove per-symbol rule
router.delete('/symbol/:symbol', (req, res) => {
  try {
    const rules = rulesStore.deleteSymbolRule(req.params.symbol);
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
