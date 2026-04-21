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

  // Also persist to Railway env variable via Railway API so it survives restarts
  try {
    const projectId = process.env.RAILWAY_PROJECT_ID;
    const serviceId = process.env.RAILWAY_SERVICE_ID;
    const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
    const apiToken = process.env.RAILWAY_API_TOKEN;

    if (projectId && serviceId && environmentId && apiToken) {
      const configStr = JSON.stringify(config);
      const query = `
        mutation {
          variableUpsert(input: {
            projectId: "${projectId}",
            serviceId: "${serviceId}",
            environmentId: "${environmentId}",
            name: "COPY_TRADING_CONFIG",
            value: ${JSON.stringify(configStr)}
          })
        }
      `;
      await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ query }),
      });
      console.log('[CopyTrading] Config saved to Railway env variable');
    }
  } catch (e) {
    // Non-fatal — file is still saved, just won't survive a full restart
    console.warn('[CopyTrading] Could not save to Railway env variable:', e.message);
  }
}

class CopyTradingService {
  constructor() {
    this.running = false;
    this.intervalHandle = null;
    // Tracks copies currently in-flight so a slow tick doesn't duplicate them.
    // Key format: "followerAccountKey:masterPositionId"
    this.pendingCopies = new Set();
    this.stats = { totalCopied: 0, totalClosed: 0, errors: [], lastRun: null };
    // Debounce: prevent tick() from firing more than once per 2 seconds
    this._tickDebounceHandle = null;
    this._tickInProgress = false;
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
    console.log(`[CopyTrading] Started (streaming) — Master: ${config.masterAccountKey} → Followers: ${followerKeys}`);

    // React to master position updates via streaming — no polling needed
    const self = this;
    metaApiService.onPositionUpdate = (accountKey, positions) => {
      const cfg = loadConfig();
      if (!cfg.enabled) return;
      if (accountKey === cfg.masterAccountKey) {
        self.debouncedTick();
      }
    };
    metaApiService.onPositionClosed = (accountKey, positionId) => {
      const cfg = loadConfig();
      if (!cfg.enabled) return;
      if (accountKey === cfg.masterAccountKey) {
        self.debouncedTick();
      }
    };

    // Run once on start to sync current state
    this.debouncedTick();
  }

  stop() {
    this.running = false;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.pendingCopies.clear();
    metaApiService.onPositionUpdate = null;
    metaApiService.onPositionClosed = null;
    console.log('[CopyTrading] Stopped');
  }

  restart() {
    this.stop();
    setTimeout(() => this.start(), 500);
  }


  debouncedTick() {
    // Cancel any pending tick — we only want to run once the stream settles
    if (this._tickDebounceHandle) clearTimeout(this._tickDebounceHandle);
    // If a tick is already running, schedule one more after it finishes
    if (this._tickInProgress) return;
    this._tickDebounceHandle = setTimeout(() => {
      this._tickDebounceHandle = null;
      this._tickInProgress = true;
      this.tick().finally(() => { this._tickInProgress = false; });
    }, 500); // wait 500ms for the stream to settle before acting
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

      // Global symbol map — maps master symbol to broker-specific symbol
      // Priority: follower.symbolMap (per-follower) > SYMBOL_MAP (global)
      const SYMBOL_MAP = {
        // Add new broker symbol mappings here as needed
        // Format: "masterSymbol": "brokerSymbol"
      };

      // Translate symbol if follower has a symbol map defined
      // e.g. follower.symbolMap = { "US500.c": "US500.raw" }
      const symbol = (follower.symbolMap && follower.symbolMap[masterPosition.symbol])
        ? follower.symbolMap[masterPosition.symbol]
        : (SYMBOL_MAP[masterPosition.symbol] || masterPosition.symbol);

      const comment = `Copy of ${masterPosition.id}`;
      const sl = config.copySlTp && masterPosition.stopLoss ? masterPosition.stopLoss : undefined;
      const tp = config.copySlTp && masterPosition.takeProfit ? masterPosition.takeProfit : undefined;

      // FIX: use the correct order direction — previously always called createMarketBuyOrder
      const result = isBuy
        ? await conn.createMarketBuyOrder(symbol, lotSize, sl, tp, { comment })
        : await conn.createMarketSellOrder(symbol, lotSize, sl, tp, { comment });

      // Log the comment that actually landed on the broker so we can catch truncation issues
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
