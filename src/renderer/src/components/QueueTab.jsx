import React, { useState, useEffect } from 'react'

const STATUS_CONFIG = {
  queued:     { badge: 'cn-badge-dim',    label: 'QUEUED' },
  processing: { badge: 'cn-badge-cyan',   label: 'PROCESSING' },
  done:       { badge: 'cn-badge-green',  label: 'DONE' },
  error:      { badge: 'cn-badge-red',    label: 'ERROR' }
}

const TYPE_ICONS = {
  mp3: '♪', m4a: '♪', m4b: '♪', wav: '♪', flac: '♪', ogg: '♪', aac: '♪',
  mp4: '▶', mkv: '▶', mov: '▶', avi: '▶', webm: '▶',
  pdf: '⬛', epub: '◈', docx: '☰', odt: '☰', txt: '☰', md: '☰'
}

export default function QueueTab() {
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await window.api.listJobs()
        setJobs(data)
      } catch {}
    }
    load()
    const t = setInterval(load, 1500)
    return () => clearInterval(t)
  }, [])

  const handleCancel = async (id) => {
    await window.api.cancelJob(id)
  }

  const handleRetry = async (id) => {
    await window.api.retryJob(id)
  }

  const handleClearDone = async () => {
    await window.api.clearDoneJobs()
  }

  const active  = jobs.filter(j => j.status === 'processing')
  const queued  = jobs.filter(j => j.status === 'queued')
  const done    = jobs.filter(j => j.status === 'done')
  const errored = jobs.filter(j => j.status === 'error')

  const hasAny = jobs.length > 0

  return (
    <div className="tab-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div className="tab-title">⚙ JOB QUEUE</div>
          <div className="tab-subtitle">REAL-TIME PIPELINE STATUS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {[
            { label: 'ACTIVE', count: active.length, color: 'var(--cn-accent)' },
            { label: 'QUEUED', count: queued.length, color: 'var(--cn-dim)' },
            { label: 'DONE',   count: done.length,   color: 'var(--cn-green)' },
            { label: 'ERRORS', count: errored.length, color: 'var(--cn-red)' }
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '4px 10px', border: '1px solid var(--cn-border)', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '16px', color: s.color, textShadow: s.color === 'var(--cn-green)' ? 'var(--cn-glow-green)' : undefined }}>
                {s.count}
              </div>
              <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: 'var(--cn-dim)' }}>
                {s.label}
              </div>
            </div>
          ))}
          {done.length > 0 && (
            <button className="cn-btn cn-btn-dim" style={{ fontSize: '10px', padding: '4px 12px' }} onClick={handleClearDone}>
              CLEAR DONE
            </button>
          )}
        </div>
      </div>

      {!hasAny && (
        <div className="empty-state">
          <div className="empty-state-icon">⚙</div>
          <div className="empty-state-text">NO JOBS IN QUEUE</div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--cn-dim)' }}>
            Drop files in the INGEST tab to begin processing
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <div className="section-label">PROCESSING NOW</div>
          {active.map(job => <JobItem key={job.id} job={job} onCancel={handleCancel} onRetry={handleRetry} />)}
        </div>
      )}

      {queued.length > 0 && (
        <div>
          <div className="section-label">WAITING</div>
          {queued.map(job => <JobItem key={job.id} job={job} onCancel={handleCancel} onRetry={handleRetry} />)}
        </div>
      )}

      {errored.length > 0 && (
        <div>
          <div className="section-label">ERRORS</div>
          {errored.map(job => <JobItem key={job.id} job={job} onCancel={handleCancel} onRetry={handleRetry} />)}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <div className="section-label">COMPLETED</div>
          {done.map(job => <JobItem key={job.id} job={job} onCancel={handleCancel} onRetry={handleRetry} />)}
        </div>
      )}
    </div>
  )
}

function JobItem({ job, onCancel, onRetry }) {
  const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued
  const icon = TYPE_ICONS[job.file_type] || '◈'
  const isActive = job.status === 'processing'
  const isDone = job.status === 'done'
  const isError = job.status === 'error'
  const isQueued = job.status === 'queued'

  return (
    <div className="queue-item" style={{ borderLeftColor: isActive ? 'var(--cn-accent)' : isDone ? 'var(--cn-green)' : isError ? 'var(--cn-red)' : 'var(--cn-border)', borderLeftWidth: '3px' }}>
      <div className="queue-item-header">
        <span style={{ fontSize: '16px', color: 'var(--cn-dim)' }}>{icon}</span>
        <div className="queue-item-name cn-truncate" title={job.file_path}>
          {job.file_name}
        </div>
        <span className={`cn-badge ${cfg.badge}`}>{cfg.label}</span>
        {(isQueued || isActive) && (
          <button
            className="cn-btn cn-btn-red"
            style={{ fontSize: '9px', padding: '2px 8px' }}
            onClick={() => onCancel(job.id)}
          >
            CANCEL
          </button>
        )}
        {isError && (
          <button
            className="cn-btn cn-btn-amber"
            style={{ fontSize: '9px', padding: '2px 8px' }}
            onClick={() => onRetry(job.id)}
          >
            RETRY
          </button>
        )}
      </div>

      {isActive && (
        <>
          <div className="cn-progress-track">
            <div
              className="cn-progress-fill"
              style={{ width: `${job.progress || 0}%` }}
            />
          </div>
          <div className="queue-item-status-msg">
            {job.status_msg || 'INITIALIZING...'} — {job.progress || 0}%
          </div>
        </>
      )}

      {isDone && (
        <div className="cn-progress-track">
          <div className="cn-progress-fill cn-progress-fill-green" style={{ width: '100%' }} />
        </div>
      )}

      {isError && job.error_msg && (
        <div style={{ fontSize: '10px', color: 'var(--cn-red)', marginTop: '6px', letterSpacing: '0.05em' }}>
          ⚠ {job.error_msg}
        </div>
      )}

      <div className="queue-item-meta">
        <span>TYPE: {job.file_type?.toUpperCase()}</span>
        {isDone && <span style={{ color: 'var(--cn-green)' }}>CHUNKS: {job.chunks_created}</span>}
        <span>ADDED: {formatDate(job.date_added)}</span>
        {isDone && job.date_completed && <span>COMPLETED: {formatDate(job.date_completed)}</span>}
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return iso
  }
}
