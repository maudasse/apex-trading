import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import Rules from './pages/Rules';
import History from './pages/History';
import CopyTrading from './pages/CopyTrading';
import { createWebSocket } from './services/api';
import './App.css';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'positions', label: 'Positions', icon: '◈' },
  { id: 'rules', label: 'SL/TP Rules', icon: '◎' },
  { id: 'copytrading', label: 'Copy Trading', icon: '⇄' },
  { id: 'history', label: 'History', icon: '◷' },
];

function DiamondLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Diamond outline — shifted right to give sparkle room on left */}
      <polygon
        points="22,34 7,16 22,4 37,16"
        stroke="var(--accent)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Sparkle — vertical, positioned top-left of diamond */}
      <line x1="9" y1="1" x2="9" y2="8" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Sparkle — horizontal */}
      <line x1="6" y1="4" x2="12" y2="4" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Sparkle glow dot */}
      <circle cx="9" cy="4" r="1" fill="var(--accent)" opacity="0.9"/>
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [positions, setPositions] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setNotifications(n => [...n, { id, msg, type }]);
    setTimeout(() => setNotifications(n => n.filter(x => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const ws = createWebSocket((message) => {
      if (message.type === 'POSITIONS_UPDATE') {
        setPositions(message.data);
      } else if (message.type === 'POSITION_MODIFIED') {
        const { symbol, platform, sl, tp } = message.data;
        addNotification(`${symbol} (${platform.toUpperCase()}) → SL: ${sl} | TP: ${tp}`, 'success');
      } else if (message.type === 'TRADE_COPIED') {
        const { symbol, type, followerAccount } = message.data;
        addNotification(`Copied ${symbol} ${type} → ${followerAccount}`, 'copy');
      }
    });

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);

    return () => ws.close();
  }, [addNotification]);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard positions={positions} />;
      case 'positions': return <Positions positions={positions} />;
      case 'rules': return <Rules />;
      case 'copytrading': return <CopyTrading />;
      case 'history': return <History />;
      default: return <Dashboard positions={positions} />;
    }
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-mark">
            <DiamondLogo />
          </span>
          <div>
            <div className="logo-title">MAUDE</div>
            <div className="logo-sub">Trading Automation</div>
          </div>
        </div>

        <div className="ws-badge" data-connected={wsConnected}>
          <span className="ws-dot" />
          {wsConnected ? 'Live' : 'Connecting...'}
        </div>

        <ul className="nav-list">
          {NAV.map(({ id, label, icon }) => (
            <li key={id}>
              <button
                className={`nav-item ${page === id ? 'active' : ''}`}
                onClick={() => setPage(id)}
              >
                <span className="nav-icon">{icon}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="footer-note">MT4 + MT5 Connected</div>
          <div className="footer-note">via MetaApi Cloud</div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main">
        <div className="page-content">
          {renderPage()}
        </div>
      </main>

      {/* Notifications */}
      <div className="notifications">
        {notifications.map(({ id, msg, type }) => (
          <div key={id} className={`notification notification--${type}`}>
            <span className="notif-icon">
              {type === 'success' ? '✓' : type === 'copy' ? '⇄' : 'ℹ'}
            </span>
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
}
