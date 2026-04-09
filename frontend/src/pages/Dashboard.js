import React, { useState, useEffect } from 'react';
import { getAccountInfo, getBotStats } from '../services/api';

async function fetchAllAccounts() {
  const res = await fetch('/api/accounts');
  const json = await res.json();
  return json.success ? json.data : [];
}

async function deployAll() {
  const res = await fetch('/api/accounts/deploy-all', { method: 'POST' });
  return res.json();
}

async function undeployAll() {
  const res = await fetch('/api/accounts/undeploy-all', { method: 'POST' });
  return res.json();
}

function AccountCard({ accountKey, platform, label }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAccountInfo(accountKey)
      .then(setInfo)
      .catch(e => setError(e.message));
  }, [accountKey]);

  const borderColor = platform === 'mt4' ? 'var(--yellow)' : 'var(--accent2)';

  if (error) return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span className={`badge badge-${platform}`}>{platform}</span>
      </div>
      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8 }}>Not connected</div>
    </div>
  );

  if (!info) return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="stat-label">{label}</div>
      <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 8 }}>Connecting...</div>
    </div>
  );

  const pnlColor = (info.profit || 0) >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        <span className={`badge badge-${platform}`}>{platform}</span>
      </div>
      <div className="stat-value" style={{ fontSize: 22, marginBottom: 8 }}>
        ${info.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap' }}>
        <span>Equity: <span style={{ color: 'var(--text)' }}>${info.equity?.toFixed(2)}</span></span>
        <span>P&L: <span style={{ color: pnlColor }}>${info.profit?.toFixed(2) ?? '0.00'}</span></span>
        {info.leverage && <span>1:{info.leverage}</span>}
        {info.currency && <span>{info.currency}</span>}
      </div>
    </div>
  );
}

export default function Dashboard({ positions }) {
  const [accounts, setAccounts] = useState([]);
  const [botStats, setBotStats] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [undeploying, setUndeploying] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  useEffect(() => {
    fetchAllAccounts().then(setAccounts).catch(console.error);
  }, []);

  useEffect(() => {
    getBotStats().then(setBotStats).catch(() => {});
    const interval = setInterval(() => getBotStats().then(setBotStats).catch(() => {}), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDeployAll = async () => {
    setDeploying(true);
    setActionMsg(null);
    try {
      await deployAll();
      setActionMsg({ text: 'All accounts deployed ✓ — billing started', type: 'success' });
    } catch (e) {
      setActionMsg({ text: 'Failed to deploy: ' + e.message, type: 'error' });
    } finally {
      setDeploying(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const handleUndeployAll = async () => {
    setUndeploying(true);
    setActionMsg(null);
    try {
      await undeployAll();
      setActionMsg({ text: 'All accounts undeployed ✓ — billing stopped', type: 'success' });
    } catch (e) {
      setActionMsg({ text: 'Failed to undeploy: ' + e.message, type: 'error' });
    } finally {
      setUndeploying(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const totalPnL = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const buyCount = positions.filter(p => p.type === 'POSITION_TYPE_BUY').length;
  const sellCount = positions.filter(p => p.type === 'POSITION_TYPE_SELL').length;

  const accountGridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${Math.min(accounts.length || 1, 3)}, 1fr)`,
    gap: 16,
    marginBottom: 28,
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            Real-time overview — {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
          </div>
        </div>

        {/* Deploy / Undeploy Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleDeployAll}
            disabled={deploying}
            style={{ fontSize: 12 }}
          >
            {deploying ? 'Deploying...' : '▶ Deploy All'}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleUndeployAll}
            disabled={undeploying}
            style={{ fontSize: 12 }}
          >
            {undeploying ? 'Stopping...' : '■ Undeploy All'}
          </button>
        </div>
      </div>

      {/* Action Message */}
      {actionMsg && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 'var(--radius)',
          marginBottom: 20,
          fontSize: 12,
          background: actionMsg.type === 'success' ? 'var(--green-dim)' : 'var(--red-dim)',
          color: actionMsg.type === 'success' ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${actionMsg.type === 'success' ? 'rgba(0,212,170,0.3)' : 'rgba(255,71,87,0.3)'}`,
        }}>
          {actionMsg.text}
        </div>
      )}

      {/* Account Cards */}
      {accounts.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 28 }}>Loading accounts...</div>
      ) : (
        <div style={accountGridStyle}>
          {accounts.map(({ key, platform, label }) => (
            <AccountCard key={key} accountKey={key} platform={platform} label={label} />
          ))}
        </div>
      )}

      {/* Stats Row */}
      <div className="section grid-4">
        <div className="stat-card">
          <div className="stat-label">Open Positions</div>
          <div className="stat-value accent">{positions.length}</div>
          <div className="stat-sub">{buyCount} buy · {sellCount} sell</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Floating P&L</div>
          <div className={`stat-value ${totalPnL >= 0 ? 'green' : 'red'}`}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </div>
          <div className="stat-sub">Across all accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Bot Status</div>
          <div className="stat-value" style={{ fontSize: 18, color: botStats?.running ? 'var(--green)' : 'var(--text3)' }}>
            {botStats?.running ? '● ACTIVE' : '○ STOPPED'}
          </div>
          <div className="stat-sub">{botStats?.totalModified ?? 0} modifications made</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Bot Run</div>
          <div className="stat-value" style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
            {botStats?.lastRun ? new Date(botStats.lastRun).toLocaleTimeString() : '—'}
          </div>
          <div className="stat-sub">Polls every 1 second</div>
        </div>
      </div>

      {/* Active Positions Table */}
      <div className="section">
        <div className="card-title">Active Positions</div>
        {positions.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div className="empty-text">No open positions</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Account</th>
                  <th>Platform</th>
                  <th>Type</th>
                  <th>Volume</th>
                  <th>Open Price</th>
                  <th>Current</th>
                  <th>Stop Loss</th>
                  <th>Take Profit</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => {
                  const isBuy = p.type === 'POSITION_TYPE_BUY';
                  return (
                    <tr key={`${p.accountKey}-${p.id}`}>
                      <td style={{ fontWeight: 500 }}>{p.symbol}</td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>{p.accountLabel || p.accountKey}</td>
                      <td><span className={`badge badge-${p.platform}`}>{p.platform}</span></td>
                      <td><span className={`badge badge-${isBuy ? 'buy' : 'sell'}`}>{isBuy ? 'BUY' : 'SELL'}</span></td>
                      <td>{p.volume}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{p.openPrice}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{p.currentPrice}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                        {p.stopLoss || <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                        {p.takeProfit || <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td className={p.profit >= 0 ? 'profit' : 'loss'}>
                        {p.profit >= 0 ? '+' : ''}${p.profit?.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
