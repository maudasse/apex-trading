const BASE = 'https://apex-trading-production-43d0.up.railway.app/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

// ── Accounts ──────────────────────────────────────────────────────────────
export const getAccounts = () => request('/accounts');
export const getAccountInfo = (platform) => request(`/accounts/${platform}/info`);

// ── Trades ────────────────────────────────────────────────────────────────
export const getPositions = () => request('/trades/positions');
export const getHistory = (days = 7) => request(`/trades/history?days=${days}`);
export const modifyPosition = (platform, positionId, stopLoss, takeProfit) =>
  request('/trades/modify', {
    method: 'POST',
    body: JSON.stringify({ platform, positionId, stopLoss, takeProfit }),
  });
export const getBotStats = () => request('/trades/bot/stats');
export const toggleBot = (enabled) =>
  request('/trades/bot/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });

// ── Rules ─────────────────────────────────────────────────────────────────
export const getRules = () => request('/rules');
export const updateGlobalRules = (rules) =>
  request('/rules/global', { method: 'PUT', body: JSON.stringify(rules) });
export const setSymbolRule = (symbol, rule) =>
  request(`/rules/symbol/${symbol}`, { method: 'PUT', body: JSON.stringify(rule) });
export const deleteSymbolRule = (symbol) =>
  request(`/rules/symbol/${symbol}`, { method: 'DELETE' });

// ── WebSocket ─────────────────────────────────────────────────────────────
export function createWebSocket(onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = 'wss://apex-trading-production-43d0.up.railway.app';
const ws = new WebSocket(wsUrl);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  ws.onerror = (e) => console.error('[WS] Error:', e);
  return ws;
}
