import React, { useState, useEffect } from 'react';

async function fetchCopyTrading() {
  const res = await fetch('https://apex-trading-production-43d0.up.railway.app/api/copytrading');
  const json = await res.json();
  return json.data;
}

async function fetchAccounts() {
  const res = await fetch('https://apex-trading-production-43d0.up.railway.app/api/copytrading/accounts');
  const json = await res.json();
  return json.data;
}

async function updateConfig(updates) {
  const res = await fetch('https://apex-trading-production-43d0.up.railway.app/api/copytrading/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const json = await res.json();
  return json.data;
}

async function toggleCopyTrading(enabled) {
  const res = await fetch('https://apex-trading-production-43d0.up.railway.app/api/copytrading/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const json = await res.json();
  return json.data;
}

export default function CopyTrading() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localConfig, setLocalConfig] = useState(null);

  const load = async () => {
    const [ct, acc] = await Promise.all([fetchCopyTrading(), fetchAccounts()]);
    setData(ct);
    setAccounts(acc);
    if (!localConfig) setLocalConfig(ct.config);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateConfig(localConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const toggle = async () => {
    const newEnabled = !localConfig.enabled;
    setLocalConfig(c => ({ ...c, enabled: newEnabled }));
    await toggleCopyTrading(newEnabled);
    load();
  };

  const update = (key, value) => setLocalConfig(c => ({ ...c, [key]: value }));

  // Follower helpers
  const addFollower = () => {
    const available = accounts.filter(a =>
      a.key !== localConfig.masterAccountKey &&
      !localConfig.followers?.some(f => f.accountKey === a.key)
    );
    if (!available.length) return;
    const newFollower = { accountKey: available[0].key, lotSize: 0.01, enabled: true };
    update('followers', [...(localConfig.followers || []), newFollower]);
  };

  const updateFollower = (index, key, value) => {
    const followers = [...(localConfig.followers || [])];
    followers[index] = { ...followers[index], [key]: value };
    update('followers', followers);
  };

  const removeFollower = (index) => {
    const followers = [...(localConfig.followers || [])];
    followers.splice(index, 1);
    update('followers', followers);
  };

  if (!data || !localConfig) return (
    <div style={{ color: 'var(--text3)', padding: 40 }}>Loading copy trading...</div>
  );

  const followers = localConfig.followers || [];
  const isConfigured = localConfig.masterAccountKey && followers.length > 0;
  const masterAccount = accounts.find(a => a.key === localConfig.masterAccountKey);
  const availableFollowers = accounts.filter(a => a.key !== localConfig.masterAccountKey);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Copy Trading</div>
        <div className="page-subtitle">Mirror trades from master to multiple follower accounts</div>
      </div>

      {/* Status Banner */}
      <div className="section" style={{
        padding: '16px 20px',
        background: localConfig.enabled && isConfigured ? 'rgba(0,212,170,0.08)' : 'var(--panel)',
        border: `1px solid ${localConfig.enabled && isConfigured ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 600,
            color: localConfig.enabled && isConfigured ? 'var(--accent)' : 'var(--text)',
          }}>
            {localConfig.enabled && isConfigured
              ? `● Active — ${followers.filter(f => f.enabled !== false).length} follower(s)`
              : localConfig.enabled && !isConfigured
              ? '⚠ Enabled but not configured'
              : '○ Copy Trading Disabled'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {isConfigured
              ? `Master: ${masterAccount?.label} → ${followers.map(f => {
                  const acc = accounts.find(a => a.key === f.accountKey);
                  return `${acc?.label || f.accountKey} (${f.lotSize} lots)`;
                }).join(', ')}`
              : 'Configure master and followers below'}
          </div>
        </div>
        <div
          className="toggle-wrap"
          onClick={isConfigured ? toggle : undefined}
          style={{ opacity: isConfigured ? 1 : 0.4, cursor: isConfigured ? 'pointer' : 'not-allowed' }}
        >
          <div className={`toggle ${localConfig.enabled ? 'on' : ''}`} />
          <span className="toggle-label">{localConfig.enabled ? 'ON' : 'OFF'}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="section grid-3">
        <div className="stat-card">
          <div className="stat-label">Trades Copied</div>
          <div className="stat-value accent">{data.totalCopied ?? 0}</div>
          <div className="stat-sub">Since last restart</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Trades Closed</div>
          <div className="stat-value">{data.totalClosed ?? 0}</div>
          <div className="stat-sub">Follower closures</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Mirrors</div>
          <div className="stat-value" style={{ color: 'var(--accent2)' }}>
            {Object.keys(data.config?.copiedTrades || {}).length}
          </div>
          <div className="stat-sub">Currently open</div>
        </div>
      </div>

      {/* Configuration */}
      <div className="section card">
        <div className="card-title">Configuration</div>

        {/* Master Account */}
        <div style={{
          padding: 16,
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          borderTop: '3px solid var(--accent)',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            ★ Master Account
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Select Master</label>
              <select
                value={localConfig.masterAccountKey}
                onChange={e => update('masterAccountKey', e.target.value)}
              >
                <option value="">— Select account —</option>
                {accounts.map(a => (
                  <option key={a.key} value={a.key}>
                    {a.label} ({a.platform.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className="toggle-wrap" onClick={() => update('copySlTp', !localConfig.copySlTp)} style={{ cursor: 'pointer' }}>
                <div className={`toggle ${localConfig.copySlTp ? 'on' : ''}`} />
                <div>
                  <div className="toggle-label">Copy SL & TP from master</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                    If off, bot rules apply instead
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Followers */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              ◎ Follower Accounts ({followers.length})
            </div>
            {availableFollowers.length > followers.length && (
              <button className="btn btn-primary" onClick={addFollower} style={{ padding: '4px 12px', fontSize: 11 }}>
                + Add Follower
              </button>
            )}
          </div>

          {followers.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: 12, padding: '16px', textAlign: 'center', background: 'var(--bg3)', borderRadius: 'var(--radius)' }}>
              No followers added yet — click "Add Follower" to start
            </div>
          )}

          {followers.map((follower, index) => {
            const followerAccount = accounts.find(a => a.key === follower.accountKey);
            return (
              <div key={index} style={{
                padding: 16,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                marginBottom: 8,
                borderLeft: `3px solid ${follower.enabled !== false ? 'var(--accent2)' : 'var(--border2)'}`,
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  {/* Account selector */}
                  <div className="field" style={{ flex: 2, minWidth: 160 }}>
                    <label>Follower Account</label>
                    <select
                      value={follower.accountKey}
                      onChange={e => updateFollower(index, 'accountKey', e.target.value)}
                    >
                      {accounts
                        .filter(a => a.key !== localConfig.masterAccountKey)
                        .map(a => (
                          <option key={a.key} value={a.key}>
                            {a.label} ({a.platform.toUpperCase()})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Lot size */}
                  <div className="field" style={{ flex: 1, minWidth: 100 }}>
                    <label>Lot Size</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={follower.lotSize}
                      onChange={e => updateFollower(index, 'lotSize', parseFloat(e.target.value))}
                    />
                  </div>

                  {/* Enable toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                    <div
                      className="toggle-wrap"
                      onClick={() => updateFollower(index, 'enabled', follower.enabled === false ? true : false)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={`toggle ${follower.enabled !== false ? 'on' : ''}`} />
                      <span className="toggle-label" style={{ fontSize: 11 }}>
                        {follower.enabled !== false ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    className="btn btn-danger"
                    onClick={() => removeFollower(index)}
                    style={{ padding: '6px 12px', fontSize: 11, marginBottom: 2 }}
                  >
                    Remove
                  </button>
                </div>

                {/* Symbol Map */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Symbol Map — broker uses different names? (e.g. US500.c → US500.raw)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {Object.entries(follower.symbolMap || {}).map(([from, to], mapIndex) => (
                      <div key={mapIndex} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', width: 120 }}
                          value={from}
                          placeholder="Master symbol"
                          onChange={e => {
                            const newMap = { ...follower.symbolMap };
                            delete newMap[from];
                            newMap[e.target.value] = to;
                            updateFollower(index, 'symbolMap', newMap);
                          }}
                        />
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>→</span>
                        <input
                          style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 8px', width: 120 }}
                          value={to}
                          placeholder="Broker symbol"
                          onChange={e => {
                            const newMap = { ...follower.symbolMap, [from]: e.target.value };
                            updateFollower(index, 'symbolMap', newMap);
                          }}
                        />
                        <button
                          onClick={() => {
                            const newMap = { ...follower.symbolMap };
                            delete newMap[from];
                            updateFollower(index, 'symbolMap', newMap);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newMap = { ...(follower.symbolMap || {}), '': '' };
                        updateFollower(index, 'symbolMap', newMap);
                      }}
                      style={{ background: 'none', border: '1px dashed var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: '4px 10px', width: 'fit-content', marginTop: 2 }}
                    >
                      + Add Symbol
                    </button>
                  </div>
                </div>

                {followerAccount && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
                    {followerAccount.label} · Every master trade will be copied at {follower.lotSize} lots
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Configuration'}
        </button>
      </div>

      {/* Active Mirrors */}
      {Object.keys(data.config?.copiedTrades || {}).length > 0 && (
        <div className="section card">
          <div className="card-title">Active Mirrors</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Master Position</th>
                  <th>Follower Account</th>
                  <th>Follower Position</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.config.copiedTrades).map(([masterId, followerMap]) =>
                  Object.entries(followerMap).map(([followerKey, followerId]) => {
                    const acc = accounts.find(a => a.key === followerKey);
                    return (
                      <tr key={`${masterId}-${followerKey}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{masterId}</td>
                        <td>{acc?.label || followerKey}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{followerId}</td>
                        <td><span className="badge badge-buy">Active</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors */}
      {data.errors?.length > 0 && (
        <div className="section card">
          <div className="card-title" style={{ color: 'var(--red)' }}>Recent Errors</div>
          {data.errors.slice(-5).reverse().map((e, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'var(--red-dim)', borderRadius: 'var(--radius)', marginBottom: 6, fontSize: 11 }}>
              <span style={{ color: 'var(--text3)', marginRight: 10 }}>{new Date(e.time).toLocaleTimeString()}</span>
              <span style={{ color: 'var(--red)' }}>{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
