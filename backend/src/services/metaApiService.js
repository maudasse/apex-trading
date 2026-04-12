const MetaApi = require('metaapi.cloud-sdk').default;

function parseAccountsFromEnv() {
  const accounts = [];
  const env = process.env;
  const pattern = /^(MT[45])_ACCOUNT_ID(_\d+)?$/;
  for (const key of Object.keys(env)) {
    const match = key.match(pattern);
    if (!match) continue;
    const id = env[key];
    if (!id || id.startsWith('your_')) continue;
    const platformPrefix = match[1].toLowerCase();
    const suffix = match[2] || '';
    const accountKey = `${platformPrefix}${suffix}`;
    const nameKey = `${match[1]}_ACCOUNT_NAME${suffix}`;
    const label = env[nameKey] || `${match[1]}${suffix ? ` (${suffix.replace('_', '')})` : ''}`;
    accounts.push({ key: accountKey, id, platform: platformPrefix, label });
  }
  return accounts;
}

class MetaApiService {
  constructor() {
    this.api = null;
    this.registry = {};
    this.initialized = false;
  }

  async initialize() {
    if (!process.env.META_API_TOKEN) throw new Error('META_API_TOKEN is not set in .env');
    this.api = new MetaApi(process.env.META_API_TOKEN, {
  domain: 'agiliumtrade.agiliumtrade.ai'
});
    const accountDefs = parseAccountsFromEnv();
    if (accountDefs.length === 0) throw new Error('No valid account IDs found in .env.');
    console.log(`[MetaApi] Found ${accountDefs.length} account(s) in .env`);
    for (const def of accountDefs) await this._connectAccount(def);
    this.initialized = true;
  }

  async _connectAccount({ key, id, platform, label }) {
    try {
      console.log(`[MetaApi] Connecting "${label}" (${key})...`);
      const account = await this.api.metatraderAccountApi.getAccount(id);
      await account.waitConnected();
      const connection = account.getRPCConnection();
      await connection.connect();
      await connection.waitSynchronized();
      this.registry[key] = { account, connection, platform, label, key };
      console.log(`[MetaApi] "${label}" connected ✓`);
    } catch (err) {
      console.error(`[MetaApi] Failed to connect "${label}":`, err.message);
    }
  }

  getConnection(accountKey) { return this.registry[accountKey]?.connection || null; }
  getAccountKeys() { return Object.keys(this.registry); }
  getAccountMeta(accountKey) { return this.registry[accountKey] || null; }
  getAllAccountMeta() {
    return Object.values(this.registry).map(({ account, connection, ...meta }) => meta);
  }

  async getAccountInfo(accountKey) {
    const conn = this.getConnection(accountKey);
    if (!conn) throw new Error(`No connection for "${accountKey}"`);
    const info = await conn.getAccountInformation();
    const meta = this.getAccountMeta(accountKey);
    return { ...info, accountKey, platform: meta.platform, label: meta.label };
  }

  async getAllAccountInfo() {
    const results = [];
    for (const key of this.getAccountKeys()) {
      try { results.push(await this.getAccountInfo(key)); }
      catch (err) { console.error(`[MetaApi] Error fetching info for ${key}:`, err.message); }
    }
    return results;
  }

  async getPositions(accountKey) {
    const conn = this.getConnection(accountKey);
    if (!conn) throw new Error(`No connection for "${accountKey}"`);
    const meta = this.getAccountMeta(accountKey);
    const positions = await conn.getPositions();
    return positions.map(p => ({ ...p, accountKey, platform: meta.platform, accountLabel: meta.label }));
  }

  async getAllPositions() {
    const results = [];
    for (const key of this.getAccountKeys()) {
      try { results.push(...await this.getPositions(key)); }
      catch (err) { console.error(`[MetaApi] Error fetching positions for ${key}:`, err.message); }
    }
    return results;
  }

  async modifyPosition(accountKey, positionId, stopLoss, takeProfit) {
    const conn = this.getConnection(accountKey);
    if (!conn) throw new Error(`No connection for "${accountKey}"`);
    const result = await conn.modifyPosition(positionId, stopLoss, takeProfit);
    const meta = this.getAccountMeta(accountKey);
    console.log(`[MetaApi] Modified ${positionId} on "${meta.label}": SL=${stopLoss}, TP=${takeProfit}`);
    return result;
  }

  async getHistory(accountKey, daysBack = 7) {
    const conn = this.getConnection(accountKey);
    if (!conn) throw new Error(`No connection for "${accountKey}"`);
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - daysBack);
    const meta = this.getAccountMeta(accountKey);
    const raw = await conn.getDealsByTimeRange(startTime, new Date());
    const history = Array.isArray(raw) ? raw : (raw?.deals || []);
    return history.map(d => ({ ...d, accountKey, platform: meta.platform, accountLabel: meta.label }));
  }

  async getAllHistory(daysBack = 7) {
    const results = [];
    for (const key of this.getAccountKeys()) {
      try { results.push(...await this.getHistory(key, daysBack)); }
      catch (err) { console.error(`[MetaApi] Error fetching history for ${key}:`, err.message); }
    }
    return results.sort((a, b) => new Date(b.time) - new Date(a.time));
  }
}

module.exports = new MetaApiService();
