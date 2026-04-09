import React, { useState, useEffect } from 'react';
import { getRules, updateGlobalRules, setSymbolRule, deleteSymbolRule } from '../services/api';

export default function Rules() {
  const [rules, setRules] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newSymbolPips, setNewSymbolPips] = useState({ stopLossPips: 50, takeProfitPips: 100 });

  const load = () => getRules().then(setRules).catch(console.error);

  useEffect(() => { load(); }, []);

  const saveGlobal = async () => {
    setSaving(true);
    try {
      await updateGlobalRules(rules.global);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const addSymbol = async () => {
    if (!newSymbol) return;
    await setSymbolRule(newSymbol.toUpperCase(), newSymbolPips);
    setNewSymbol('');
    load();
  };

  const removeSymbol = async (symbol) => {
    await deleteSymbolRule(symbol);
    load();
  };

  const updateGlobal = (key, value) => {
    setRules(r => ({ ...r, global: { ...r.global, [key]: value } }));
  };

  if (!rules) return <div style={{ color: 'var(--text3)', padding: 40 }}>Loading rules...</div>;

  const g = rules.global;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">SL/TP Rules</div>
        <div className="page-subtitle">Configure automatic stop loss & take profit</div>
      </div>

      {/* Global Toggle */}
      <div className="section card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Automation</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              When enabled, the bot auto-applies SL/TP to all new positions
            </div>
          </div>
          <div className="toggle-wrap" onClick={() => updateGlobal('enabled', !g.enabled)}>
            <div className={`toggle ${g.enabled ? 'on' : ''}`} />
            <span className="toggle-label">{g.enabled ? 'Active' : 'Disabled'}</span>
          </div>
        </div>
      </div>

      {/* Global Rules */}
      <div className="section card">
        <div className="card-title">Global Rules</div>

        {/* Mode Selector */}
        <div className="field" style={{ marginBottom: 20 }}>
          <label>SL/TP Mode</label>
          <select value={g.mode} onChange={e => updateGlobal('mode', e.target.value)}>
            <option value="pips">Fixed Pips — set SL and TP in pips from entry</option>
            <option value="ratio">Risk/Reward Ratio — set TP based on existing SL</option>
          </select>
        </div>

        <div className="grid-3" style={{ gap: 16, marginBottom: 20 }}>
          {g.mode === 'pips' && (
            <>
              <div className="field">
                <label>Stop Loss (pips)</label>
                <input
                  type="number"
                  value={g.stopLossPips}
                  onChange={e => updateGlobal('stopLossPips', parseFloat(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Take Profit (pips)</label>
                <input
                  type="number"
                  value={g.takeProfitPips}
                  onChange={e => updateGlobal('takeProfitPips', parseFloat(e.target.value))}
                />
              </div>
            </>
          )}
          {g.mode === 'ratio' && (
            <div className="field">
              <label>Risk:Reward Ratio</label>
              <input
                type="number"
                step="0.5"
                value={g.riskRewardRatio}
                onChange={e => updateGlobal('riskRewardRatio', parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Advanced: Trailing Stop */}
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 20,
          marginBottom: 20,
        }}>
          <div style={{ marginBottom: 16 }}>
            <div className="toggle-wrap" onClick={() => updateGlobal('trailingStop', !g.trailingStop)}>
              <div className={`toggle ${g.trailingStop ? 'on' : ''}`} />
              <span className="toggle-label">Trailing Stop Loss</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginLeft: 50 }}>
              Automatically move SL in profit direction as price moves
            </div>
          </div>

          {g.trailingStop && (
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Trailing Distance (pips)</label>
              <input
                type="number"
                value={g.trailingStopPips}
                onChange={e => updateGlobal('trailingStopPips', parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Advanced: Breakeven */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="toggle-wrap" onClick={() => updateGlobal('breakeven', !g.breakeven)}>
              <div className={`toggle ${g.breakeven ? 'on' : ''}`} />
              <span className="toggle-label">Breakeven</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginLeft: 50 }}>
              Move SL to entry price when trade is in profit by X pips
            </div>
          </div>

          {g.breakeven && (
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Trigger at (pips profit)</label>
              <input
                type="number"
                value={g.breakevenTriggerPips}
                onChange={e => updateGlobal('breakevenTriggerPips', parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={saveGlobal} disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Global Rules'}
        </button>
      </div>

      {/* Per-Symbol Rules */}
      <div className="section card">
        <div className="card-title">Per-Symbol Overrides</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
          Symbol-specific rules override global settings for that symbol
        </div>

        {Object.keys(rules.symbols).length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20 }}>
            No symbol overrides set — all symbols use global rules
          </div>
        )}

        {Object.entries(rules.symbols).map(([symbol, rule]) => (
          <div key={symbol} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 16px',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            marginBottom: 8,
          }}>
            <div style={{ fontWeight: 600, minWidth: 80 }}>{symbol}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              SL: {rule.stopLossPips ?? 'inherit'} pips ·
              TP: {rule.takeProfitPips ?? 'inherit'} pips
            </div>
            <button
              className="btn btn-danger"
              onClick={() => removeSymbol(symbol)}
              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
            >
              Remove
            </button>
          </div>
        ))}

        {/* Add Symbol */}
        <div style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}>
          <div className="field" style={{ minWidth: 120 }}>
            <label>Symbol</label>
            <input
              value={newSymbol}
              onChange={e => setNewSymbol(e.target.value)}
              placeholder="EURUSD"
            />
          </div>
          <div className="field" style={{ minWidth: 120 }}>
            <label>SL (pips)</label>
            <input
              type="number"
              value={newSymbolPips.stopLossPips}
              onChange={e => setNewSymbolPips(p => ({ ...p, stopLossPips: +e.target.value }))}
            />
          </div>
          <div className="field" style={{ minWidth: 120 }}>
            <label>TP (pips)</label>
            <input
              type="number"
              value={newSymbolPips.takeProfitPips}
              onChange={e => setNewSymbolPips(p => ({ ...p, takeProfitPips: +e.target.value }))}
            />
          </div>
          <button className="btn btn-primary" onClick={addSymbol} style={{ height: 38 }}>
            + Add Symbol
          </button>
        </div>
      </div>
    </div>
  );
}
