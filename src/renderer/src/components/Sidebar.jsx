import React from 'react'

const NAV_ITEMS = [
  { id: 'ingest',      icon: '⬇', label: 'INGEST' },
  { id: 'queue',       icon: '⚙', label: 'QUEUE' },
  { id: 'library',     icon: '◈', label: 'LIBRARY' },
  { id: 'config',      icon: '⚛', label: 'CONFIG' },
  { id: 'diagnostics', icon: '◉', label: 'DIAGNOSTICS' },
]

export default function Sidebar({ activeTab, onTabChange, queueCount, stats }) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'queue' && queueCount > 0 && (
              <span className="sidebar-badge">{queueCount}</span>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-stats">
        <div className="sidebar-stats-title">SYSTEM STATS</div>
        <div className="sidebar-stat-grid">
          <div className="sidebar-stat">
            <div className="sidebar-stat-num">
              {formatNumber(stats.vectors)}
            </div>
            <div className="sidebar-stat-label">VECTORS</div>
          </div>
          <div className="sidebar-stat">
            <div className="sidebar-stat-num">
              {formatNumber(stats.documents)}
            </div>
            <div className="sidebar-stat-label">DOCS</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}
