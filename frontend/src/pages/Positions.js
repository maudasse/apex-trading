import React, { useState } from 'react';
import { modifyPosition } from '../services/api';

function EditModal({ position, onClose, onSaved }) {
  const [sl, setSl] = useState(position.stopLoss || '');
  const [tp, setTp] = useState(position.takeProfit || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await modifyPosition(
        position.platform,
        position.id,
        sl ? parseFloat(sl) : null,
        tp ? parseFloat(tp) : null
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border2)',
        borderRadius: 12,
        padding: 28,
        width: 360,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
              Modify Position
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
              {position.symbol} · {position.platform.toUpperCase()}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div className="field">
            <label>Stop Loss</label>
            <input type="number" step="0.00001" value={sl} onChange={e => setSl(e.target.value)} placeholder="e.g. 1.08000" />
          </div>
          <div className="field">
            <label>Take Profit</label>
            <input type="number" step="0.00001" value={tp} onChange={e => setTp(e.target.value)} placeholder="e.g. 1.10000" />
          </div>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--yellow)',
              background: 'var(--yellow)',
              color: '#080c10',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Positions({ positions }) {
  const [editingPosition, setEditingPosition] = useState(null);
  const [filter, setFilter] = useState('all');

  const filtered = positions.filter(p => {
    if (filter === 'mt4') return p.platform === 'mt4';
    if (filter === 'mt5') return p.platform === 'mt5';
    if (filter === 'buy') return p.type === 'POSITION_TYPE_BUY';
    if (filter === 'sell') return p.type === 'POSITION_TYPE_SELL';
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Open Positions</div>
        <div className="page-subtitle">Manage SL/TP on individual trades</div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'mt4', 'mt5', 'buy', 'sell'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              border: `1px solid ${filter === f ? 'rgba(255,211,42,0.4)' : 'var(--border2)'}`,
              background: filter === f ? 'var(--yellow-dim)' : 'var(--panel2)',
              color: filter === f ? 'var(--yellow)' : 'var(--text2)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 11, lineHeight: '32px' }}>
          {filtered.length} position{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.4 }}>
              <circle cx="16" cy="16" r="13" stroke="var(--yellow)" strokeWidth="1.8"/>
              <circle cx="16" cy="16" r="7" stroke="var(--yellow)" strokeWidth="1.5"/>
              <circle cx="16" cy="16" r="4" stroke="var(--red)" strokeWidth="1.2"/>
              <circle cx="16" cy="16" r="2" fill="var(--red)"/>
              <line x1="16" y1="1" x2="16" y2="7" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="16" y1="25" x2="16" y2="31" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="1" y1="16" x2="7" y2="16" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="25" y1="16" x2="31" y2="16" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="empty-text">No positions to display</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Platform</th>
                <th>Type</th>
                <th>Volume</th>
                <th>Open Price</th>
                <th>Current Price</th>
                <th>Stop Loss</th>
                <th>Take Profit</th>
                <th>Swap</th>
                <th>P&L</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isBuy = p.type === 'POSITION_TYPE_BUY';
                return (
                  <tr key={`${p.platform}-${p.id}`}>
                    <td style={{ fontWeight: 600 }}>{p.symbol}</td>
                    <td><span className={`badge badge-${p.platform}`}>{p.platform}</span></td>
                    <td><span className={`badge badge-${isBuy ? 'buy' : 'sell'}`}>{isBuy ? 'BUY' : 'SELL'}</span></td>
                    <td>{p.volume}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{p.openPrice}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{p.currentPrice}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                      {p.stopLoss || <span style={{ color: 'var(--text3)' }}>Not set</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>
                      {p.takeProfit || <span style={{ color: 'var(--text3)' }}>Not set</span>}
                    </td>
                    <td style={{ color: 'var(--text3)' }}>{p.swap?.toFixed(2) ?? '0.00'}</td>
                    <td className={p.profit >= 0 ? 'profit' : 'loss'}>
                      {p.profit >= 0 ? '+' : ''}${p.profit?.toFixed(2)}
                    </td>
                    <td>
                      <button className="btn" onClick={() => setEditingPosition(p)} style={{ padding: '4px 10px', fontSize: 11 }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingPosition && (
        <EditModal
          position={editingPosition}
          onClose={() => setEditingPosition(null)}
          onSaved={() => setEditingPosition(null)}
        />
      )}
    </div>
  );
}
