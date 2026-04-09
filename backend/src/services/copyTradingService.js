const metaApiService = require('./metaApiService');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../data/copytrading.json');

/**
 * Config structure:
 * {
 *   enabled: true,
 *   masterAccountKey: 'mt5',
 *   copySlTp: true,
 *   followers: [
 *     { accountKey: 'mt5_2', lotSize: 0.05, enabled: true },
 *     { accountKey: 'mt5_3', lotSize: 0.01, enabled: true },
 *   ],
 *   copiedTrades: {
 *     masterPositionId: {
 *       mt5_2: followerPositionId,
 *       mt5_3: followerPositionId,
 *     }
 *   }
 * }
 */
const DEFAULT_CONFIG = {
  enabled: false,
  masterAccountKey: '',
  copySlTp: true,
  followers: [], // [{ accountKey, lotSize, enabled }]
  copiedTrades: {}, // masterPositionId -> { followerKey: followerPositionId }
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    // Migrate old single-follower format
    if (config.followerAccountKey && !config.followers) {
      config.followers = [{
        accountKey: config.followerAccountKey,
        lotSize: config.fixedLotSize || 0.01,
        enabled: true,
      }];
      delete config.followerAccountKey;
      delete config.fixedLotSize;
      saveConfig(config);
    }
    return config;
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

class CopyTradingService {
  constructor() {
    this.running = false;
    this.intervalHandle = null;
    this.lastMasterPositions = {};
    this.stats = {
      totalCopied: 0,
      totalClosed: 0,
      errors: [],
      lastRun: null,
    };
  }

  start() {
    const config = loadConfig();
    if (!config.enabled) return;
    if (!config.masterAccountKey || !config.followers?.length) {
      console.log('[CopyTrading] Not fully configured — skipping');
      return;
    }
    if (this.running) return;

    this.running = true;
    const followerKeys = config.followers.map(f => f.accountKey).join(', ');
    console.log(`[CopyTrading] Started — Master: ${config.masterAccountKey} → Followers: ${followerKeys}`);
    this.tick();
    this.intervalHandle = setInterval(() => this.tick(), 5000);
  }

  stop() {
    this.running = false;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    console.log('[CopyTrading] Stopped');
  }

  restart() {
    this.stop();
    setTimeout(() => this.start(), 500);
  }

  async tick() {
    const config = loadConfig();
    if (!config.enabled || !config.followers?.length) return;

    this.stats.lastRun = new Date().toISOString();

    const activeFollowers = config.followers.filter(f => f.enabled !== false);
    if (!activeFollowers.length) return;

    try {
      const masterPositions = await metaApiService.getPositions(config.masterAccountKey);
      const masterMap = {};
      for (const p of masterPositions) masterMap[p.id] = p;

      // ── Detect NEW trades ────────────────────────────────────────────────
      for (const [id, position] of Object.entries(masterMap)) {
        const alreadyCopied = config.copiedTrades[id];
        for (const follower of activeFollowers) {
          // Skip if already copied to this follower
          if (alreadyCopied?.[follower.accountKey]) continue;
          if (!this.lastMasterPositions[id] && !alreadyCopied?.[follower.accountKey]) {
  await this.copyTrade(position, follower, config);
}
        }
      }

      // ── Detect CLOSED trades ─────────────────────────────────────────────
      for (const [masterId, followerMap] of Object.entries(config.copiedTrades)) {
        if (!masterMap[masterId]) {
          for (const [followerKey, followerId] of Object.entries(followerMap)) {
            await this.closeTrade(followerId, followerKey);
          }
          delete config.copiedTrades[masterId];
          saveConfig(config);
        }
      }

      // ── Sync SL/TP changes ───────────────────────────────────────────────
      if (config.copySlTp) {
        for (const [masterId, followerMap] of Object.entries(config.copiedTrades)) {
          const masterPos = masterMap[masterId];
          if (!masterPos) continue;
          for (const [followerKey, followerId] of Object.entries(followerMap)) {
            await this.syncSlTp(masterPos, followerId, followerKey);
          }
        }
      }

      this.lastMasterPositions = masterMap;

      if (global.broadcast) {
        global.broadcast({ type: 'COPY_TRADING_UPDATE', data: this.getStats() });
      }

    } catch (err) {
      console.error('[CopyTrading] Tick error:', err.message);
      this.stats.errors.push({ time: new Date().toISOString(), message: err.message });
      if (this.stats.errors.length > 20) this.stats.errors.shift();
    }
  }

  async copyTrade(masterPosition, follower, config) {
    try {
      const conn = metaApiService.getConnection(follower.accountKey);
      if (!conn) throw new Error(`Follower ${follower.accountKey} not connected`);

      const isBuy = masterPosition.type === 'POSITION_TYPE_BUY';

      const result = await conn.createMarketBuyOrder(
        masterPosition.symbol,
        follower.lotSize,
        config.copySlTp && masterPosition.stopLoss ? masterPosition.stopLoss : undefined,
        config.copySlTp && masterPosition.takeProfit ? masterPosition.takeProfit : undefined,
        { comment: `Copy of ${masterPosition.id}` }
      );

      if (result?.orderId || result?.positionId) {
        const followerId = result.positionId || result.orderId;

        if (!config.copiedTrades[masterPosition.id]) {
          config.copiedTrades[masterPosition.id] = {};
        }
        config.copiedTrades[masterPosition.id][follower.accountKey] = followerId;
        saveConfig(config);
        this.stats.totalCopied++;

        console.log(`[CopyTrading] ✓ Copied ${masterPosition.symbol} ${isBuy ? 'BUY' : 'SELL'} → ${follower.accountKey} (${follower.lotSize} lots)`);

        if (global.broadcast) {
          global.broadcast({
            type: 'TRADE_COPIED',
            data: {
              symbol: masterPosition.symbol,
              type: isBuy ? 'BUY' : 'SELL',
              volume: follower.lotSize,
              followerAccount: follower.accountKey,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    } catch (err) {
      console.error(`[CopyTrading] Failed to copy to ${follower.accountKey}:`, err.message);
      this.stats.errors.push({ time: new Date().toISOString(), message: err.message });
    }
  }

  async closeTrade(followerId, followerAccountKey) {
    try {
      const conn = metaApiService.getConnection(followerAccountKey);
      if (!conn) return;
      await conn.closePosition(followerId);
      this.stats.totalClosed++;
      console.log(`[CopyTrading] ✓ Closed follower position ${followerId} on ${followerAccountKey}`);
    } catch (err) {
      console.error(`[CopyTrading] Failed to close ${followerId}:`, err.message);
    }
  }

  async syncSlTp(masterPosition, followerId, followerAccountKey) {
    try {
      if (!masterPosition.stopLoss && !masterPosition.takeProfit) return;
      await metaApiService.modifyPosition(
        followerAccountKey,
        followerId,
        masterPosition.stopLoss,
        masterPosition.takeProfit
      );
    } catch (err) {
      // Silently skip — position may already be closed
    }
  }

  getConfig() {
    return loadConfig();
  }

  updateConfig(updates) {
    const config = loadConfig();
    const newConfig = { ...config, ...updates };
    saveConfig(newConfig);
    if (updates.enabled !== undefined || updates.masterAccountKey || updates.followers) {
      this.restart();
    }
    return newConfig;
  }

  getStats() {
    return {
      ...this.stats,
      running: this.running,
      config: loadConfig(),
    };
  }
}

module.exports = new CopyTradingService();
