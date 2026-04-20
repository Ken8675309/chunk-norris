import React, { useState, useEffect } from 'react'

function getStardate() {
  const now = new Date()
  const year = now.getFullYear()
  const start = new Date(year, 0, 0)
  const diff = now - start
  const oneDay = 86400000
  const dayOfYear = Math.floor(diff / oneDay)
  return `STARDATE ${year}.${String(dayOfYear).padStart(3, '0')}`
}

export default function Topbar({ services }) {
  const [stardate, setStardate] = useState(getStardate())

  useEffect(() => {
    const t = setInterval(() => setStardate(getStardate()), 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <polygon
            points="14,2 26,22 2,22"
            fill="none"
            stroke="#00b4d8"
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 4px #00b4d8)' }}
          />
          <circle cx="14" cy="15" r="3" fill="#00b4d8" style={{ filter: 'drop-shadow(0 0 4px #00b4d8)' }} />
        </svg>
        <div>
          <div className="topbar-logo-text">CHUNK NORRIS</div>
          <div className="topbar-logo-sub">KNOWLEDGE INGESTION SYSTEM v1.0</div>
        </div>
      </div>

      <div className="topbar-divider" />

      <div className="topbar-stardate">{stardate}</div>

      <div className="topbar-services">
        <ServicePill label="QDRANT" active={services.qdrant} />
        <ServicePill label="OLLAMA" active={services.ollama} />
        <ServicePill label="OPEN WEBUI" active={services.openwebui} amber />
      </div>

      <div className="topbar-pulse" />
    </header>
  )
}

function ServicePill({ label, active, amber }) {
  let dotClass = 'cn-dot-dim'
  if (active) dotClass = amber ? 'cn-dot-amber' : 'cn-dot-green'

  return (
    <div className="topbar-service">
      <span className={`cn-dot ${dotClass}`} />
      {label}
    </div>
  )
}
