const fs = require('fs');
const path = require('path');
const metaApiService = require('./metaApiService');

const CONFIG_FILE = path.join(__dirname, '../../data/copyConfig.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {}
  return { enabled: false, masterAccountKey: null, followers: [], copySlTp: true };
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

      // Filter out any positions that are themselves copies
      const realMasterPositions = masterPositions.filter(p =>
        !p.comment?.startsWith('Copy of')
      );

      // Build a map of master positions by symbol+type for easy lookup
      const masterMap = {};
      for (const p of realMasterPositions) {
        masterMap[p.id] = p;
      }

      // For each follower, compare their positions to master
      for (const follower of activeFollowers) {
        try {
          const followerConn = metaApiService.getConnection(follower.accountKey);
          if (!followerConn) continue;

          // Get follower's current positions
          const followerPositions = await metaApiService.getPositions(follower.accountKey);

          // Build map of what the follower has, keyed by the master position ID in the comment
          const followerCopyMap = {}; // masterPositionId -> follower position
          for (const fp of followerPositions) {
            const match = fp.comment?.match(/^Copy of (\S+)/);
            if (match) {
              followerCopyMap[match[1]] = fp;
            }
          }

          // 1. Open missing trades (master has it, follower doesn't)
          for (const [masterId, masterPos] of Object.entries(masterMap)) {
            if (followerCopyMap[masterId]) continue; // already copied
            await this.copyTrade(masterPos, follower, config);
          }

          // 2. Close extra trades (follower has a copy but master closed it)
          for (const [masterId, followerPos] of Object.entries(followerCopyMap)) {
            if (masterMap[masterId]) continue; // master still has it
            await this.closeTrade(followerPos.id, follower.accountKey);
          }

          // 3. Sync SL/TP if enabled
          if (config.copySlTp) {
            for (const [masterId, masterPos] of Object.entries(masterMap)) {
              const followerPos = followerCopyMap[masterId];
              if (!followerPos) continue;
              if (masterPos.stopLoss !== followerPos.stopLoss || masterPos.takeProfit !== followerPos.takeProfit) {
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

  async copyTrade(masterPosition, follower, config) {
    try {
      const conn = metaApiService.getConnection(follower.accountKey);
      if (!conn) throw new Error(`Follower ${follower.accountKey} not connected`);

      const isBuy = masterPosition.type === 'POSITION_TYPE_BUY';
      const comment = `Copy of ${masterPosition.id}`;

      const result = await conn.createMarketBuyOrder(
        masterPosition.symbol,
        follower.lotSize,
        config.copySlTp && masterPosition.stopLoss ? masterPosition.stopLoss : undefined,
        config.copySlTp && masterPosition.takeProfit ? masterPosition.takeProfit : undefined,
        { comment }
      );

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
