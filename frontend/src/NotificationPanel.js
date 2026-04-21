import React, { useRef, useEffect } from 'react';

const TYPE_CONFIG = {
  success: { icon: '✓', label: 'SL/TP SET', color: 'var(--yellow)', dim: 'var(--yellow-dim)' },
  copy:    { icon: '⇄', label: 'COPIED',    color: 'var(--accent)', dim: 'var(--accent-dim)' },
  info:    { icon: 'ℹ', label: 'INFO',      color: 'var(--text2)',  dim: 'var(--panel2)' },
};

function NotifItem({ notif, onDismiss }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
  const age = Date.now() - notif.timestamp;
  const timeStr = age < 60000
    ? `${Math.floor(age / 1000)}s ago`
    : new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="notif-item" data-type={notif.type}>
      <div className="notif-item-header">
        <span className="notif-badge" style={{ color: cfg.color, background: cfg.dim }}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="notif-time">{timeStr}</span>
        <button className="notif-dismiss" onClick={() => onDismiss(notif.id)}>✕</button>
      </div>
      <div className="notif-msg">{notif.msg}</div>
    </div>
  );
}

export default function NotificationPanel({ notifications, onDismiss, onClearAll }) {
  const bottomRef = useRef(null);

  // Auto-scroll to latest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notifications.length]);

  return (
    <aside className="notif-panel">
      <div className="notif-panel-header">
        <div className="notif-panel-title">
          <span className="notif-panel-dot" />
          Activity
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="notif-count">{notifications.length}</span>
          {notifications.length > 0 && (
            <button className="notif-clear-btn" onClick={onClearAll}>Clear</button>
          )}
        </div>
      </div>

      <div className="notif-panel-body">
        {notifications.length === 0 ? (
          <div className="notif-empty">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.3, marginBottom: 8 }}>
              <circle cx="16" cy="16" r="13" stroke="var(--yellow)" strokeWidth="1.8"/>
              <circle cx="16" cy="16" r="7" stroke="var(--yellow)" strokeWidth="1.5"/>
              <circle cx="16" cy="16" r="2" fill="var(--yellow)" opacity="0.5"/>
            </svg>
            <div>Waiting for events...</div>
          </div>
        ) : (
          <>
            {notifications.map(n => (
              <NotifItem key={n.id} notif={n} onDismiss={onDismiss} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </aside>
  );
}
