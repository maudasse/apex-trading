const MetaApi = require('metaapi.cloud-sdk').default;
const { SynchronizationListener } = require('metaapi.cloud-sdk');

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
    this.registry = {}; // accountKey -> { account, connection, rpcConnection, platform, label, key }
    this.positionsCache = {}; // accountKey -> Map<positionId, position>
    this.accountInfoCache = {}; // accountKey -> accountInfo
    this.initialized = false;
    this.onPositionUpdate = null; // callback(accountKey, positions)
    this.onNewPosition = null;    // callback(accountKey, position)
    this.onPositionClosed = null; // callback(accountKey, positionId)
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

      // Streaming connection — uses 0 CPU credits
      const connection = account.getStreamingConnection();

      // Position listener — must extend SynchronizationListener for SDK v27+
      const self = this;
      class PositionListener extends SynchronizationListener {
        async onPositionUpdated(instanceIndex, pos) {
          if (!self.positionsCache[key]) self.positionsCache[key] = new Map();
          const enriched = { ...pos, accountKey: key, platform, accountLabel: label };
          self.positionsCache[key].set(pos.id, enriched);
          if (self.onPositionUpdate) self.onPositionUpdate(key, self.getPositionsFromCache(key));
          if (global.broadcast) {
            global.broadcast({ type: 'POSITIONS_UPDATE', data: self.getAllPositionsFromCache() });
          }
        }
        async onPositionRemoved(instanceIndex, positionId) {
          if (self.positionsCache[key]) {
            self.positionsCache[key].delete(positionId);
          }
          if (self.onPositionClosed) self.onPositionClosed(key, positionId);
          if (global.broadcast) {
            global.broadcast({ type: 'POSITIONS_UPDATE', data: self.getAllPositionsFromCache() });
          }
        }
        async onConnected(instanceIndex, replicas) {
          console.log(`[MetaApi] "${label}" streaming connected ✓`);
        }
        async onDisconnected(instanceIndex) {
          console.warn(`[MetaApi] "${label}" streaming disconnected — will auto-reconnect`);
        }
        async onAccountInformationUpdated(instanceIndex, info) {
          self.accountInfoCache[key] = { ...info, accountKey: key, platform, label };
        }
      }
      const listener = new PositionListener();

      connection.addSynchronizationListener(listener);
      await connection.connect();
      await connection.waitSynchronized();

      // Also keep an RPC connection for write operations (modifyPosition, createOrder, closePosition)
      const rpcConnection = account.getRPCConnection();
      await rpcConnection.connect();
      await rpcConnection.waitSynchronized();

      // Seed positions cache from initial state
      this.positionsCache[key] = new Map();
      const initialPositions = connection.terminalState.positions || [];
      for (const pos of initialPositions) {
        this.positionsCache[key].set(pos.id, { ...pos, accountKey: key, platform, accountLabel: label });
      }

      // Seed account info cache
      if (connection.terminalState.accountInformation) {
        this.accountInfoCache[key] = { ...connection.terminalState.accountInformation, accountKey: key, platform, label };
      }

      this.registry[key] = { account, connection, rpcConnection, platform, label, key };
      console.log(`[MetaApi] "${label}" ready ✓ (${initialPositions.length} positions loaded)`);

    } catch (err) {
      console.error(`[MetaApi] Failed to connect "${label}":`, err.message);
    }
  }

  // ── Cache accessors ──────────────────────────────────────────────
  getPositionsFromCache(accountKey) {
    const cache = this.positionsCache[accountKey];
    if (!cache) return [];
    return Array.from(cache.values());
  }

  getAllPositionsFromCache() {
    const all = [];
    for (const key of Object.keys(this.positionsCache)) {
      all.push(...this.getPositionsFromCache(key));
    }
    return all;
  }

  // ── RPC connection for writes ────────────────────────────────────
  getRpcConnection(accountKey) { return this.registry[accountKey]?.rpcConnection || null; }
  getConnection(accountKey) { return this.registry[accountKey]?.rpcConnection || null; } // backwards compat
  getAccountKeys() { return Object.keys(this.registry); }
  getAccountMeta(accountKey) { return this.registry[accountKey] || null; }
  getAllAccountMeta() {
    return Object.values(this.registry).map(({ account, connection, rpcConnection, ...meta }) => meta);
  }

  // ── Account info ─────────────────────────────────────────────────
  async getAccountInfo(accountKey) {
    // Use cache if available (updated via streaming)
    if (this.accountInfoCache[accountKey]) return this.accountInfoCache[accountKey];
    // Fall back to RPC
    const conn = this.getRpcConnection(accountKey);
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

  // ── Positions — serve from cache (no API call, no credits) ───────
  async getPositions(accountKey) {
    return this.getPositionsFromCache(accountKey);
  }

  async getAllPositions() {
    return this.getAllPositionsFromCache();
  }

  // ── Write operations — use RPC connection ────────────────────────
  async modifyPosition(accountKey, positionId, stopLoss, takeProfit) {
    const conn = this.getRpcConnection(accountKey);
    if (!conn) throw new Error(`No connection for "${accountKey}"`);
    const result = await conn.modifyPosition(positionId, stopLoss, takeProfit);
    const meta = this.getAccountMeta(accountKey);
    console.log(`[MetaApi] Modified ${positionId} on "${meta.label}": SL=${stopLoss}, TP=${takeProfit}`);
    return result;
  }

  // ── History — RPC (only called on demand, not in a loop) ─────────
  async getHistory(accountKey, daysBack = 7) {
    const conn = this.getRpcConnection(accountKey);
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
