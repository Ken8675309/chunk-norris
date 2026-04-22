import React, { useState, useEffect } from 'react'

const STATUS_CONFIG = {
  queued:     { badge: 'cn-badge-dim',    label: 'QUEUED' },
  processing: { badge: 'cn-badge-cyan',   label: 'PROCESSING' },
  done:       { badge: 'cn-badge-green',  label: 'DONE' },
  error:      { badge: 'cn-badge-red',    label: 'ERROR' },
  canceled:   { badge: 'cn-badge-dim',    label: 'CANCELED' },
}

const TYPE_ICONS = {
  mp3: '♪', m4a: '♪', m4b: '♪', wav: '♪', flac: '♪', ogg: '♪', aac: '♪',
  mp4: '▶', mkv: '▶', mov: '▶', avi: '▶', webm: '▶',
  pdf: '⬛', epub: '◈', docx: '☰', odt: '☰', txt: '☰', md: '☰'
}

const STUCK_THRESHOLD_MS = 10 * 60 * 1000

function isStuck(job) {
  if (job.status !== 'processing') return false
  const ref = job.date_started || job.date_added
  return Date.now() - new Date(ref).getTime() > STUCK_THRESHOLD_MS
}

export default function QueueTab() {
  const [jobs, setJobs] = useState([])
  const [starting, setStarting] = useState(false)

  const load = async () => {
    try { setJobs(await window.api.listJobs()) } catch {}
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 1500)
    return () => clearInterval(t)
  }, [])

  const handleCancel      = async (id) => { await window.api.cancelJob(id) }
  const handleRetry       = async (id) => { await window.api.retryJob(id) }
  const handleReset       = async (id) => { await window.api.resetJob(id) }
  const handleDelete      = async (id) => { await window.api.deleteJob(id) }
  const handleClearDone   = async ()   => { await window.api.clearDoneJobs(); load() }
  const handleClearErrors = async ()   => { await window.api.clearErrors(); load() }
  const handleStartQueue  = async ()   => {
    setStarting(true)
    await window.api.startQueue()
    setTimeout(() => setStarting(false), 3000)
  }

  const active   = jobs.filter(j => j.status === 'processing')
  const queued   = jobs.filter(j => j.status === 'queued')
  const done     = jobs.filter(j => j.status === 'done')
  const errored  = jobs.filter(j => j.status === 'error')
  const canceled = jobs.filter(j => j.status === 'canceled')

  const callbacks = { onCancel: handleCancel, onRetry: handleRetry,
                      onReset: handleReset, onDelete: handleDelete,
                      onProcessNow: handleStartQueue, starting }

  return (
    <div className="tab-container">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div className="tab-title">⚙ JOB QUEUE</div>
          <div className="tab-subtitle">REAL-TIME PIPELINE STATUS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'ACTIVE',   count: active.length,   color: 'var(--cn-accent)' },
            { label: 'QUEUED',   count: queued.length,   color: 'var(--cn-dim)' },
            { label: 'DONE',     count: done.length,     color: 'var(--cn-green)' },
            { label: 'ERRORS',   count: errored.length,  color: 'var(--cn-red)' },
            { label: 'CANCELED', count: canceled.length, color: 'var(--cn-dim)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '4px 10px', border: '1px solid var(--cn-border)', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '16px', color: s.color, textShadow: s.color === 'var(--cn-green)' ? 'var(--cn-glow-green)' : undefined }}>
                {s.count}
              </div>
              <div style={{ fontSize: '8px', letterSpacing: '0.15em', color: 'var(--cn-dim)' }}>{s.label}</div>
            </div>
          ))}
          {queued.length > 0 && active.length === 0 && (
            <button
              className="cn-btn"
              style={{ fontSize: '10px', padding: '4px 14px', borderColor: 'var(--cn-green)', color: starting ? 'var(--cn-dim)' : 'var(--cn-green)', textShadow: starting ? 'none' : 'var(--cn-glow-green)' }}
              onClick={handleStartQueue}
              disabled={starting}
            >
              {starting ? '◌ STARTING...' : '▶ START QUEUE'}
            </button>
          )}
          {(errored.length > 0 || canceled.length > 0) && (
            <button
              className="cn-btn cn-btn-red"
              style={{ fontSize: '10px', padding: '4px 12px', borderColor: 'var(--cn-border)', color: 'var(--cn-dim)' }}
              onClick={handleClearErrors}
            >
              CLEAR ERRORS
            </button>
          )}
          {done.length > 0 && (
            <button
              className="cn-btn"
              style={{ fontSize: '10px', padding: '4px 12px', borderColor: 'var(--cn-border)', color: 'var(--cn-dim)' }}
              onClick={handleClearDone}
            >
              CLEAR DONE
            </button>
          )}
        </div>
      </div>

      {jobs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">⚙</div>
          <div className="empty-state-text">NO JOBS IN QUEUE</div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--cn-dim)' }}>
            Drop files in the INGEST tab to begin processing
          </div>
        </div>
      )}

      {active.length > 0 && (
        <Section label="PROCESSING NOW">
          {active.map(j => <JobItem key={j.id} job={j} {...callbacks} />)}
        </Section>
      )}
      {queued.length > 0 && (
        <Section label="WAITING">
          {queued.map(j => <JobItem key={j.id} job={j} {...callbacks} />)}
        </Section>
      )}
      {errored.length > 0 && (
        <Section label="ERRORS">
          {errored.map(j => <JobItem key={j.id} job={j} {...callbacks} />)}
        </Section>
      )}
      {canceled.length > 0 && (
        <Section label="CANCELED">
          {canceled.map(j => <JobItem key={j.id} job={j} {...callbacks} />)}
        </Section>
      )}
      {done.length > 0 && (
        <Section label="COMPLETED">
          {done.map(j => <JobItem key={j.id} job={j} {...callbacks} />)}
        </Section>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      {children}
    </div>
  )
}

function JobItem({ job, onCancel, onRetry, onReset, onDelete, onProcessNow, starting }) {
  const stuck    = isStuck(job)
  const cfg      = stuck ? { badge: 'cn-badge-amber', label: 'STUCK' }
                         : (STATUS_CONFIG[job.status] || STATUS_CONFIG.queued)
  const icon     = TYPE_ICONS[job.file_type] || '◈'
  const isActive   = job.status === 'processing'
  const isDone     = job.status === 'done'
  const isError    = job.status === 'error'
  const isQueued   = job.status === 'queued'
  const isCanceled = job.status === 'canceled'
  const removable  = isDone || isError || isCanceled

  const borderColor = isActive ? (stuck ? 'var(--cn-amber)' : 'var(--cn-accent)')
                    : isDone   ? 'var(--cn-green)'
                    : isError  ? 'var(--cn-red)'
                    : 'var(--cn-border)'

  return (
    <div className="queue-item" style={{ borderLeftColor: borderColor, borderLeftWidth: '3px', marginBottom: '8px' }}>
      <div className="queue-item-header">
        <span style={{ fontSize: '16px', color: 'var(--cn-dim)' }}>{icon}</span>
        <div className="queue-item-name cn-truncate" title={job.file_path}>
          {job.file_name}
        </div>
        <span className={`cn-badge ${cfg.badge}`}>{cfg.label}</span>

        {/* STUCK → Reset */}
        {stuck && (
          <Btn variant="amber" onClick={() => onReset(job.id)}>RESET</Btn>
        )}
        {/* QUEUED → Process Now + Cancel */}
        {isQueued && (
          <>
            <Btn variant={starting ? 'muted' : 'green'} onClick={onProcessNow} disabled={starting}>
              {starting ? 'STARTING...' : 'PROCESS NOW'}
            </Btn>
            <Btn variant="red" onClick={() => onCancel(job.id)}>CANCEL</Btn>
          </>
        )}
        {/* Active-not-stuck → Cancel */}
        {isActive && !stuck && (
          <Btn variant="red" onClick={() => onCancel(job.id)}>CANCEL</Btn>
        )}
        {/* ERROR → Retry */}
        {isError && (
          <Btn variant="amber" onClick={() => onRetry(job.id)}>RETRY</Btn>
        )}
        {/* DONE / ERROR / CANCELED → Remove */}
        {removable && (
          <Btn variant="muted" onClick={() => onDelete(job.id)}>REMOVE</Btn>
        )}
      </div>

      {isActive && (
        <>
          <div className="cn-progress-track">
            <div className="cn-progress-fill" style={{ width: `${job.progress || 0}%` }} />
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
      {(isError || isCanceled) && job.error_msg && (
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

function Btn({ variant, onClick, children, disabled = false }) {
  const styles = {
    green: { borderColor: 'var(--cn-green)', color: 'var(--cn-green)', textShadow: 'var(--cn-glow-green)' },
    amber: { borderColor: 'var(--cn-amber)', color: 'var(--cn-amber)' },
    red:   { borderColor: 'var(--cn-red)',   color: 'var(--cn-red)' },
    muted: { borderColor: 'var(--cn-border)', color: 'var(--cn-dim)' },
  }
  return (
    <button
      className="cn-btn"
      style={{ fontSize: '9px', padding: '2px 8px', opacity: disabled ? 0.5 : 1, ...(styles[variant] || {}) }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return iso }
}
