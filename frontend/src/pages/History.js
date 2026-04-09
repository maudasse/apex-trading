import React, { useState, useEffect } from 'react';

async function fetchAccounts() {
  const res = await fetch('/api/accounts');
  const json = await res.json();
  return json.success ? json.data : [];
}

async function fetchHistory(accountKey, days) {
  const res = await fetch(`/api/trades/history?days=${days}&account=${accountKey}`);
  const json = await res.json();
  return json.success ? json.data : [];
}

export default function History() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [history, setHistory] = useState([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    fetchAccounts().then(acc => {
      setAccounts(acc);
      if (acc.length > 0) setSelectedAccount(acc[0].key);
    });
  }, []);

  // Load history when account or days changes
  useEffect(() => {
    if (!selectedAccount) return;
    setLoading(true);
    fetchHistory(selectedAccount, days)
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedAccount, days]);

  const totalProfit = history.reduce((sum, d) => sum + (d.profit || 0), 0);
  const currentAccount = accounts.find(a => a.key === selectedAccount);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">History</div>
        <div className="page-subtitle">Closed deals per account</div>
      </div>

      {/* Account Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {accounts.map(acc => (
          <button
            key={acc.key}
            className={`btn ${selectedAccount === acc.key ? 'btn-primary' : ''}`}
            onClick={() => setSelectedAccount(acc.key)}
            style={{ padding: '8px 16px' }}
          >
            <span className={`badge badge-${acc.platform}`} style={{ marginRight: 8 }}>
              {acc.platform}
            </span>
            {acc.label}
          </button>
        ))}
      </div>

      {/* Period + Summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {[1, 7, 14, 30].map(d => (
          <button
            key={d}
            className={`btn ${days === d ? 'btn-primary' : ''}`}
            onClick={() => setDays(d)}
            style={{ padding: '6px 14px', fontSize: 11 }}
          >
            {d === 1 ? 'Today' : `${d}D`}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text2)' }}>
          {currentAccount?.label} · Total P&L:{' '}
          <span className={totalProfit >= 0 ? 'profit' : 'loss'}>
            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
          </span>
        </div>
      </div>

      {/* History Table */}
      {loading ? (
        <div style={{ color: 'var(--text3)', padding: 40, textAlign: 'center' }}>
          Loading history...
        </div>
      ) : history.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◷</div>
          <div className="empty-text">No trade history for this period</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Volume</th>
                <th>Price</th>
                <th>Commission</th>
                <th>Swap</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 200).map((deal, i) => {
                const isBuy = deal.type === 'DEAL_TYPE_BUY';
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--text3)', fontSize: 11 }}>
                      {deal.time ? new Date(deal.time).toLocaleString() : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{deal.symbol || '—'}</td>
                    <td>
                      {deal.symbol && (
                        <span className={`badge badge-${isBuy ? 'buy' : 'sell'}`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                      )}
                    </td>
                    <td>{deal.volume || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{deal.price || '—'}</td>
                    <td style={{ color: (deal.commission || 0) < 0 ? 'var(--red)' : 'var(--text3)' }}>
                      {deal.commission?.toFixed(2) ?? '0.00'}
                    </td>
                    <td style={{ color: 'var(--text3)' }}>{deal.swap?.toFixed(2) ?? '0.00'}</td>
                    <td className={(deal.profit || 0) >= 0 ? 'profit' : 'loss'}>
                      {(deal.profit || 0) >= 0 ? '+' : ''}${(deal.profit || 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
