import React, { useState, useEffect } from 'react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n || 0)
}

export default function DiagnosticsTab({ services }) {
  const [sysInfo, setSysInfo] = useState(null)
  const [qdrantStats, setQdrantStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setRefreshing(true)
    try {
      const [info, stats] = await Promise.allSettled([
        window.api.systemInfo(),
        window.api.qdrantStats()
      ])
      if (info.status === 'fulfilled') setSysInfo(info.value)
      if (stats.status === 'fulfilled') setQdrantStats(stats.value)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="tab-container">
        <div style={{ color: 'var(--cn-dim)', letterSpacing: '0.15em', padding: '24px' }}>
          RUNNING DIAGNOSTICS...
        </div>
      </div>
    )
  }

  const memPct = sysInfo ? Math.round((1 - sysInfo.freeMem / sysInfo.totalMem) * 100) : 0

  return (
    <div className="tab-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <div className="tab-title">◉ DIAGNOSTICS</div>
          <div className="tab-subtitle">SYSTEM STATUS & CONNECTION TESTS</div>
        </div>
        <button
          className="cn-btn"
          onClick={load}
          disabled={refreshing}
          style={{ marginLeft: 'auto' }}
        >
          {refreshing ? 'SCANNING...' : 'REFRESH'}
        </button>
      </div>

      {/* Services */}
      <div className="cn-panel" style={{ padding: '14px' }}>
        <div className="config-section-title">SERVICE STATUS</div>
        <ServiceRow
          name="QDRANT VECTOR DATABASE"
          url={`localhost:${sysInfo ? '6333' : '6333'}`}
          active={services.qdrant}
          info={services.qdrant ? 'OPERATIONAL' : 'OFFLINE — Auto-start via Docker on app launch'}
        />
        <ServiceRow
          name="OLLAMA INFERENCE SERVER"
          url="localhost:11434"
          active={services.ollama}
          info={services.ollama ? 'OPERATIONAL' : 'OFFLINE — Install from ollama.ai'}
        />
        <ServiceRow
          name="OPEN WEBUI"
          url="localhost:3000"
          active={services.openwebui}
          amber
          info={services.openwebui ? 'RUNNING' : 'OFFLINE — Optional UI for querying'}
        />
      </div>

      {/* Qdrant Stats */}
      {qdrantStats && (
        <div className="cn-panel" style={{ padding: '14px' }}>
          <div className="config-section-title">QDRANT COLLECTION STATS</div>
          {qdrantStats.collections.length === 0 ? (
            <div style={{ color: 'var(--cn-dim)', fontSize: '11px', letterSpacing: '0.1em' }}>
              NO COLLECTIONS FOUND
            </div>
          ) : (
            <>
              <div className="stats-row" style={{ marginBottom: '14px' }}>
                <div className="stat-card">
                  <div className="stat-card-value">{formatNumber(qdrantStats.totalVectors)}</div>
                  <div className="stat-card-label">TOTAL VECTORS</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-value">{qdrantStats.collections.length}</div>
                  <div className="stat-card-label">COLLECTIONS</div>
                </div>
              </div>
              <table className="cn-table">
                <thead>
                  <tr>
                    <th>COLLECTION</th>
                    <th>VECTORS</th>
                  </tr>
                </thead>
                <tbody>
                  {qdrantStats.collections.map(c => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td style={{ color: 'var(--cn-green)', textShadow: 'var(--cn-glow-green)' }}>
                        {formatNumber(c.vectors)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* System Info */}
      {sysInfo && (
        <div className="cn-panel" style={{ padding: '14px' }}>
          <div className="config-section-title">SYSTEM INFORMATION</div>
          <div className="diag-sysinfo">
            <SysInfoItem k="PLATFORM" v={`${sysInfo.platform} (${sysInfo.arch})`} />
            <SysInfoItem k="CPU CORES" v={sysInfo.cpus} />
            <SysInfoItem k="TOTAL MEMORY" v={formatBytes(sysInfo.totalMem)} />
            <SysInfoItem k="FREE MEMORY" v={`${formatBytes(sysInfo.freeMem)} (${100 - memPct}% free)`} />
            <SysInfoItem k="NODE VERSION" v={`v${sysInfo.nodeVersion}`} />
            <SysInfoItem k="ELECTRON VERSION" v={`v${sysInfo.electronVersion}`} />
          </div>
          <div style={{ marginTop: '12px' }}>
            <div className="cn-label">MEMORY USAGE</div>
            <div className="cn-progress-track" style={{ height: '8px' }}>
              <div
                className="cn-progress-fill"
                style={{
                  width: `${memPct}%`,
                  background: memPct > 85 ? 'var(--cn-red)' : memPct > 70 ? 'var(--cn-amber)' : undefined
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '9px', color: 'var(--cn-dim)', letterSpacing: '0.1em' }}>0%</span>
              <span style={{ fontSize: '9px', color: 'var(--cn-dim)', letterSpacing: '0.1em' }}>{memPct}% USED</span>
              <span style={{ fontSize: '9px', color: 'var(--cn-dim)', letterSpacing: '0.1em' }}>100%</span>
            </div>
          </div>
        </div>
      )}

      {/* Python deps */}
      <div className="cn-panel" style={{ padding: '14px' }}>
        <div className="config-section-title">PYTHON DEPENDENCIES</div>
        <div style={{ color: 'var(--cn-dim)', fontSize: '11px', letterSpacing: '0.08em', lineHeight: '2' }}>
          {[
            'faster-whisper',
            'pymupdf',
            'ebooklib',
            'beautifulsoup4',
            'python-docx',
            'odfpy',
            'qdrant-client'
          ].map(pkg => (
            <div key={pkg} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="cn-dot cn-dot-dim" />
              <span style={{ color: 'var(--cn-text)' }}>{pkg}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '12px' }}>
          <div className="cn-label">INSTALL COMMAND</div>
          <div style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--cn-border)',
            padding: '8px 12px',
            fontSize: '11px',
            color: 'var(--cn-green)',
            letterSpacing: '0.05em',
            fontFamily: 'var(--cn-font)'
          }}>
            pip3 install faster-whisper pymupdf ebooklib beautifulsoup4 python-docx odfpy qdrant-client
          </div>
        </div>
      </div>
    </div>
  )
}

function ServiceRow({ name, url, active, amber, info }) {
  const dotClass = active ? (amber ? 'cn-dot-amber' : 'cn-dot-green') : 'cn-dot-red'
  return (
    <div className="diag-service">
      <span className={`cn-dot ${dotClass}`} />
      <div className="diag-service-name">{name}</div>
      <div className="diag-service-info">{url}</div>
      <span
        className={`cn-badge ${active ? (amber ? 'cn-badge-amber' : 'cn-badge-green') : 'cn-badge-red'}`}
        style={{ flexShrink: 0 }}
      >
        {active ? (amber ? 'RUNNING' : 'ONLINE') : 'OFFLINE'}
      </span>
    </div>
  )
}

function SysInfoItem({ k, v }) {
  return (
    <div className="diag-sysinfo-item">
      <div className="diag-sysinfo-key">{k}</div>
      <div className="diag-sysinfo-val">{v}</div>
    </div>
  )
}
