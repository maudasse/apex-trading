const metaApiService = require('./metaApiService');
const rulesStore = require('./rulesStore');

const processedPositions = new Map(); // positionId -> { sl, tp, breakevenApplied }
const failedPositions = new Set();    // positions that returned "not found"

class BotService {
  constructor() {
    this.running = false;
    this.stats = { totalModified: 0, lastRun: null, errors: [] };
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('[Bot] ⚡ Streaming bot started — reacting to position events instantly');

    // Hook into metaApiService position updates
    metaApiService.onPositionUpdate = (accountKey, positions) => {
      if (!this.running) return;
      const rules = rulesStore.getRules();
      if (!rules.global.enabled) return;
      this.stats.lastRun = new Date().toISOString();
      // Process all positions for this account
      for (const position of positions) {
        this.processPosition(position, rules).catch(err => {
          console.error('[Bot] Error processing position:', err.message);
        });
      }
      // Broadcast updated positions to frontend
      if (global.broadcast) {
        global.broadcast({ type: 'POSITIONS_UPDATE', data: metaApiService.getAllPositionsFromCache() });
      }
    };

    metaApiService.onPositionClosed = (accountKey, positionId) => {
      processedPositions.delete(positionId);
      failedPositions.delete(positionId);
    };

    // Process all currently open positions on startup
    const rules = rulesStore.getRules();
    if (rules.global.enabled) {
      const positions = metaApiService.getAllPositionsFromCache();
      for (const position of positions) {
        await this.processPosition(position, rules);
      }
    }

    // Broadcast initial state
    if (global.broadcast) {
      global.broadcast({ type: 'POSITIONS_UPDATE', data: metaApiService.getAllPositionsFromCache() });
    }
  }

  stop() {
    this.running = false;
    metaApiService.onPositionUpdate = null;
    metaApiService.onPositionClosed = null;
    console.log('[Bot] Bot stopped');
  }

  async processPosition(position, rules) {
    if (failedPositions.has(position.id)) return;

    const rule = rulesStore.getRuleForSymbol(position.symbol);
    if (!rule.enabled) return;

    const { sl, tp } = this.calculateSLTP(position, rule);
    if (sl === null && tp === null) return;

    const prev = processedPositions.get(position.id);
    const tolerance = 0.01;
    const slAlreadySet = position.stopLoss && Math.abs(position.stopLoss - sl) < tolerance;
    const tpAlreadySet = position.takeProfit && Math.abs(position.takeProfit - tp) < tolerance;
    if (slAlreadySet && tpAlreadySet) return;

    if (prev && rule.trailingStop) {
      const newSL = this.calculateTrailingSL(position, rule, prev.sl);
      if (newSL) {
        const isBuy = position.type === 'POSITION_TYPE_BUY';
        if ((isBuy && newSL > prev.sl) || (!isBuy && newSL < prev.sl)) {
          return this.applyModification(position, newSL, prev.tp || tp);
        }
      }
    }

    if (rule.breakeven && !prev?.breakevenApplied) {
      const breakevenSL = this.calculateBreakeven(position, rule);
      if (breakevenSL !== null) {
        await this.applyModification(position, breakevenSL, prev?.tp || tp);
        processedPositions.set(position.id, { sl: breakevenSL, tp, breakevenApplied: true });
        return;
      }
    }

    if (!prev || !slAlreadySet || !tpAlreadySet) {
      await this.applyModification(position, sl, tp);
      processedPositions.set(position.id, { sl, tp, breakevenApplied: false });
    }
  }

  calculateSLTP(position, rule) {
    const isBuy = position.type === 'POSITION_TYPE_BUY';
    const digits = this.getDigits(position.symbol);
    const pipSize = this.getPipSize(position.symbol);
    let sl = null, tp = null;

    if (rule.mode === 'pips') {
      const slDistance = rule.stopLossPips * pipSize;
      const tpDistance = rule.takeProfitPips * pipSize;
      sl = isBuy ? position.openPrice - slDistance : position.openPrice + slDistance;
      tp = isBuy ? position.openPrice + tpDistance : position.openPrice - tpDistance;
    } else if (rule.mode === 'ratio') {
      if (position.stopLoss) {
        const slDistance = Math.abs(position.openPrice - position.stopLoss);
        tp = isBuy
          ? position.openPrice + slDistance * rule.riskRewardRatio
          : position.openPrice - slDistance * rule.riskRewardRatio;
        sl = position.stopLoss;
      } else {
        const slDistance = rule.stopLossPips * pipSize;
        sl = isBuy ? position.openPrice - slDistance : position.openPrice + slDistance;
        tp = isBuy
          ? position.openPrice + slDistance * rule.riskRewardRatio
          : position.openPrice - slDistance * rule.riskRewardRatio;
      }
    }

    return {
      sl: sl ? parseFloat(sl.toFixed(digits)) : null,
      tp: tp ? parseFloat(tp.toFixed(digits)) : null,
    };
  }

  calculateTrailingSL(position, rule, currentSL) {
    const isBuy = position.type === 'POSITION_TYPE_BUY';
    const digits = this.getDigits(position.symbol);
    const trailDistance = rule.trailingStopPips * this.getPipSize(position.symbol);
    const price = position.currentPrice;
    if (isBuy) {
      const newSL = parseFloat((price - trailDistance).toFixed(digits));
      return newSL > (currentSL || 0) ? newSL : null;
    } else {
      const newSL = parseFloat((price + trailDistance).toFixed(digits));
      return newSL < (currentSL || Infinity) ? newSL : null;
    }
  }

  calculateBreakeven(position, rule) {
    const isBuy = position.type === 'POSITION_TYPE_BUY';
    const digits = this.getDigits(position.symbol);
    const pipSize = this.getPipSize(position.symbol);
    const price = position.currentPrice;
    const entry = position.openPrice;
    const profitPips = isBuy ? (price - entry) / pipSize : (entry - price) / pipSize;
    if (profitPips >= rule.breakevenTriggerPips) return parseFloat(entry.toFixed(digits));
    return null;
  }

  async applyModification(position, sl, tp) {
    try {
      await metaApiService.modifyPosition(position.accountKey, position.id, sl, tp);
      this.stats.totalModified++;
      if (global.broadcast) {
        global.broadcast({
          type: 'POSITION_MODIFIED',
          data: {
            positionId: position.id,
            symbol: position.symbol,
            platform: position.platform,
            sl,
            tp,
            timestamp: new Date().toISOString(),
          },
        });
      }
      console.log(`[Bot] ⚡ ${position.symbol} (${position.accountKey}) → SL: ${sl}, TP: ${tp}`);
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('position not found')) {
        failedPositions.add(position.id);
        processedPositions.delete(position.id);
        console.warn(`[Bot] Position ${position.id} not found on broker — removing from tracking`);
      } else {
        console.error(`[Bot] Failed to modify ${position.id}:`, msg);
        this.stats.errors.push({ time: new Date().toISOString(), message: msg });
        if (this.stats.errors.length > 50) this.stats.errors.shift();
      }
    }
  }

  getPipSize(symbol) {
    const sym = symbol.toUpperCase();
    if (['US500', 'SPX', 'US30', 'DOW', 'NAS100', 'NDX', 'UK100', 'GER40'].some(i => sym.includes(i))) return 1;
    if (sym.includes('XAU') || sym.includes('XAG')) return 0.1;
    if (sym.includes('JPY')) return 0.01;
    return 0.0001;
  }

  getDigits(symbol) {
    const sym = symbol.toUpperCase();
    if (['US500', 'SPX', 'US30', 'DOW', 'NAS100', 'NDX', 'UK100', 'GER40'].some(i => sym.includes(i))) return 2;
    if (sym.includes('XAU') || sym.includes('XAG')) return 2;
    if (sym.includes('JPY')) return 3;
    return 5;
  }

  getStats() { return { ...this.stats, running: this.running }; }
}

module.exports = new BotService();
