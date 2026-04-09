const fs = require('fs');
const path = require('path');

const RULES_FILE = path.join(__dirname, '../../data/rules.json');

// Ensure data directory exists
const dataDir = path.dirname(RULES_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Default rules structure
const DEFAULT_RULES = {
  global: {
    enabled: true,
    stopLossPips: 50,
    takeProfitPips: 100,
    riskRewardRatio: 2,
    mode: 'pips', // 'pips' | 'ratio' | 'price'
    trailingStop: false,
    trailingStopPips: 30,
    breakeven: false,
    breakevenTriggerPips: 30,
  },
  symbols: {}, // per-symbol overrides: { 'EURUSD': { stopLossPips: 40, ... } }
};

function load() {
  if (!fs.existsSync(RULES_FILE)) {
    save(DEFAULT_RULES);
    return DEFAULT_RULES;
  }
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
}

function save(rules) {
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

function getRules() {
  return load();
}

function updateGlobal(updates) {
  const rules = load();
  rules.global = { ...rules.global, ...updates };
  save(rules);
  return rules;
}

function setSymbolRule(symbol, overrides) {
  const rules = load();
  rules.symbols[symbol] = { ...rules.symbols[symbol], ...overrides };
  save(rules);
  return rules;
}

function deleteSymbolRule(symbol) {
  const rules = load();
  delete rules.symbols[symbol];
  save(rules);
  return rules;
}

// Get effective rule for a symbol (symbol override > global)
function getRuleForSymbol(symbol) {
  const rules = load();
  const symbolRule = rules.symbols[symbol] || {};
  return { ...rules.global, ...symbolRule };
}

module.exports = { getRules, updateGlobal, setSymbolRule, deleteSymbolRule, getRuleForSymbol };
