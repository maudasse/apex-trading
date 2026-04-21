import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import Rules from './pages/Rules';
import History from './pages/History';
import CopyTrading from './pages/CopyTrading';
import { createWebSocket } from './services/api';
import './App.css';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'positions', label: 'Positions' },
  { id: 'rules', label: 'SL/TP Rules' },
  { id: 'copytrading', label: 'Copy Trading' },
  { id: 'history', label: 'History' },
];

function MiniCrosshair({ active }) {
  const color = active ? 'var(--yellow)' : 'var(--text3)';
  const red = active ? 'var(--red)' : 'var(--text3)';
  return (
    <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="2.5"/>
      <circle cx="16" cy="16" r="7" stroke={color} strokeWidth="2"/>
      <circle cx="16" cy="16" r="4" stroke={red} strokeWidth="2"/>
      <circle cx="16" cy="16" r="2" fill={red}/>
      <line x1="16" y1="1" x2="16" y2="7" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="16" y1="25" x2="16" y2="31" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="1" y1="16" x2="7" y2="16" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="25" y1="16" x2="31" y2="16" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function CrosshairLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer circle */}
      <circle cx="16" cy="16" r="13" stroke="var(--yellow)" strokeWidth="1.8"/>
      {/* Inner circle */}
      <circle cx="16" cy="16" r="7" stroke="var(--yellow)" strokeWidth="1.5"/>
      {/* Center ring — red */}
      <circle cx="16" cy="16" r="4" stroke="var(--red)" strokeWidth="1.2"/>
      {/* Center dot — red */}
      <circle cx="16" cy="16" r="2" fill="var(--red)"/>
      {/* Crosshair — top */}
      <line x1="16" y1="1" x2="16" y2="7" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Crosshair — bottom */}
      <line x1="16" y1="25" x2="16" y2="31" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Crosshair — left */}
      <line x1="1" y1="16" x2="7" y2="16" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Crosshair — right */}
      <line x1="25" y1="16" x2="31" y2="16" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round"/>
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
            <CrosshairLogo />
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
          {NAV.map(({ id, label }) => (
            <li key={id}>
              <button
                className={`nav-item ${page === id ? 'active' : ''}`}
                onClick={() => setPage(id)}
              >
                <span className="nav-icon"><MiniCrosshair active={page === id} /></span>
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
