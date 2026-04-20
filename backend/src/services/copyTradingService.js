const fs = require('fs');
const path = require('path');
const metaApiService = require('./metaApiService');

const CONFIG_FILE = path.join(__dirname, '../../data/copyConfig.json');
const DEFAULT_CONFIG = { enabled: false, masterAccountKey: null, followers: [], copySlTp: true };

function loadConfig() {
  // 1. Try the local file first (fastest, used during normal operation)
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (parsed && parsed.followers) return parsed;
    }
  } catch (e) {}

  // 2. Fall back to env variable (survives Railway restarts)
  try {
    if (process.env.COPY_TRADING_CONFIG) {
      const parsed = JSON.parse(process.env.COPY_TRADING_CONFIG);
      if (parsed && parsed.followers) {
        // Restore the file so subsequent reads are fast
        saveConfigToFile(parsed);
        console.log('[CopyTrading] Config restored from environment variable');
        return parsed;
      }
    }
  } catch (e) {}

  return DEFAULT_CONFIG;
}

function saveConfigToFile(config) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('[CopyTrading] Failed to write config file:', e.message);
  }
}

async function saveConfig(config) {
  // Always save to file
  saveConfigToFile(config);

  // Config is persisted to file only — Railway env var is set manually to avoid redeploy loops
}

class CopyTradingService {
  constructor() {
    this.running = false;
    this.intervalHandle = null;
    // Tracks copies currently in-flight so a slow tick doesn't duplicate them.
    // Key format: "followerAccountKey:masterPositionId"
    this.pendingCopies = new Set();
    this.stats = { totalCopied: 0, totalClosed: 0, errors: [], lastRun: null };
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
    this.pendingCopies.clear();
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
      // Get master positions
      const masterPositions = await metaApiService.getPositions(config.masterAccountKey);

      // Exclude any positions that are themselves copies (safety net)
      const realMasterPositions = masterPositions.filter(p =>
        !p.comment?.startsWith('Copy of')
      );

      // Map master positions by their ID for O(1) lookup
      const masterMap = {};
      for (const p of realMasterPositions) {
        masterMap[p.id] = p;
      }

      // Sync each active follower against the master
      for (const follower of activeFollowers) {
        try {
          const followerConn = metaApiService.getConnection(follower.accountKey);
          if (!followerConn) {
            console.warn(`[CopyTrading] Follower ${follower.accountKey} not connected — skipping`);
            continue;
          }

          // Validate lotSize up front so we never send undefined/0 to the broker
          const lotSize = follower.lotSize ?? follower.volume ?? 0;
          if (!lotSize || lotSize <= 0) {
            console.warn(`[CopyTrading] Follower ${follower.accountKey} has no lotSize — skipping`);
            continue;
          }

          // Get follower's current positions
          const followerPositions = await metaApiService.getPositions(follower.accountKey);

          // Build a map of copies the follower already has, keyed by master position ID
          // extracted from the comment "Copy of <masterPositionId>"
          const followerCopyMap = {}; // masterPositionId -> follower position
          for (const fp of followerPositions) {
            const match = fp.comment?.match(/^Copy of (\S+)/);
            if (match) {
              followerCopyMap[match[1]] = fp;
            }
          }

          // 1. Open trades the master has but the follower doesn't
          for (const [masterId, masterPos] of Object.entries(masterMap)) {
            if (followerCopyMap[masterId]) continue; // already copied

            // Guard against duplicate copies while a previous order is still in-flight
            const pendingKey = `${follower.accountKey}:${masterId}`;
            if (this.pendingCopies.has(pendingKey)) continue;

            this.pendingCopies.add(pendingKey);
            try {
              await this.copyTrade(masterPos, follower, config, lotSize);
            } finally {
              this.pendingCopies.delete(pendingKey);
            }
          }

          // 2. Close trades the follower copied but the master has since closed
          for (const [masterId, followerPos] of Object.entries(followerCopyMap)) {
            if (masterMap[masterId]) continue; // master still has it
            await this.closeTrade(followerPos.id, follower.accountKey);
          }

          // 3. Sync SL/TP if enabled
          if (config.copySlTp) {
            for (const [masterId, masterPos] of Object.entries(masterMap)) {
              const followerPos = followerCopyMap[masterId];
              if (!followerPos) continue;
              if (
                masterPos.stopLoss !== followerPos.stopLoss ||
                masterPos.takeProfit !== followerPos.takeProfit
              ) {
                await this.syncSlTp(masterPos, followerPos.id, follower.accountKey);
              }
            }
          }

        } catch (err) {
          console.error(`[CopyTrading] Error processing follower ${follower.accountKey}:`, err.message);
          this.stats.errors.push({ time: new Date().toISOString(), message: err.message });
          if (this.stats.errors.length > 20) this.stats.errors.shift();
        }
      }

    } catch (err) {
      console.error('[CopyTrading] Tick error:', err.message);
      this.stats.errors.push({ time: new Date().toISOString(), message: err.message });
      if (this.stats.errors.length > 20) this.stats.errors.shift();
    }

    if (global.broadcast) {
      global.broadcast({ type: 'COPY_TRADING_UPDATE', data: this.getStats() });
    }
  }

  async copyTrade(masterPosition, follower, config, lotSize) {
    try {
      const conn = metaApiService.getConnection(follower.accountKey);
      if (!conn) throw new Error(`Follower ${follower.accountKey} not connected`);

      const isBuy = masterPosition.type === 'POSITION_TYPE_BUY';

      // FIX: use explicit string check so empty string values don't fall through
      // follower.symbolMap = { "US500.c": "US500.raw" }
      console.log(`[CopyTrading] Follower config for ${follower.accountKey}:`, JSON.stringify(follower));
      const mappedSymbol = follower.symbolMap?.[masterPosition.symbol];
      const symbol = (mappedSymbol && mappedSymbol.trim())
        ? mappedSymbol.trim()
        : masterPosition.symbol;

      if (symbol !== masterPosition.symbol) {
        console.log(`[CopyTrading] Symbol mapped: ${masterPosition.symbol} → ${symbol} for ${follower.accountKey}`);
      }

      const comment = `Copy of ${masterPosition.id}`;
      const sl = config.copySlTp && masterPosition.stopLoss ? masterPosition.stopLoss : undefined;
      const tp = config.copySlTp && masterPosition.takeProfit ? masterPosition.takeProfit : undefined;

      const result = isBuy
        ? await conn.createMarketBuyOrder(symbol, lotSize, sl, tp, { comment })
        : await conn.createMarketSellOrder(symbol, lotSize, sl, tp, { comment });

      console.log(
        `[CopyTrading] ✓ Copied ${masterPosition.symbol}${symbol !== masterPosition.symbol ? ` → ${symbol}` : ''} ${isBuy ? 'BUY' : 'SELL'} → ${follower.accountKey}` +
        ` (${lotSize} lots) | result comment: "${result?.comment ?? 'MISSING — broker may have dropped it'}"`
      );

      this.stats.totalCopied++;

      if (global.broadcast) {
        global.broadcast({
          type: 'TRADE_COPIED',
          data: {
            symbol: masterPosition.symbol,
            type: isBuy ? 'BUY' : 'SELL',
            volume: lotSize,
            followerAccount: follower.accountKey,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err) {
      console.error(`[CopyTrading] Failed to copy trade to ${follower.accountKey}:`, err.message);
      this.stats.errors.push({ time: new Date().toISOString(), message: err.message });
      if (this.stats.errors.length > 20) this.stats.errors.shift();
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

  async updateConfig(updates) {
    const config = loadConfig();
    // Strip empty symbolMap entries before saving
    if (updates.followers) {
      updates.followers = updates.followers.map(f => ({
        ...f,
        symbolMap: Object.fromEntries(
          Object.entries(f.symbolMap || {}).filter(([k, v]) => k.trim() && v.trim())
        ),
      }));
    }
    const newConfig = { ...config, ...updates };
    await saveConfig(newConfig);
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
