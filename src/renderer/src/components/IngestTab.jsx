import React, { useState, useEffect, useRef } from 'react'

const FILE_TYPE_LABELS = {
  audio: 'AUDIO (MP3, M4A, WAV, FLAC, OGG, AAC)',
  video: 'VIDEO (MP4, MKV, MOV, AVI, WEBM)',
  document: 'DOCUMENT (PDF, EPUB, DOCX, ODT, TXT, MD)'
}

export default function IngestTab() {
  const [settings, setSettings] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [visualAnalysis, setVisualAnalysis] = useState(true)
  const [chunkSize, setChunkSize] = useState(500)
  const [chunkOverlap, setChunkOverlap] = useState(80)
  const [keyframeInterval, setKeyframeInterval] = useState(45)
  const [status, setStatus] = useState(null)
  const dropRef = useRef(null)

  useEffect(() => {
    window.api.getSettings().then(s => {
      setSettings(s)
      setVisualAnalysis(s.visual_analysis_default !== false)
      setChunkSize(s.chunk_size || 500)
      setChunkOverlap(s.chunk_overlap || 80)
      setKeyframeInterval(s.keyframe_interval || 45)
    })
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = () => setDragging(false)

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).map(f => f.path)
    if (files.length === 0) return
    try {
      const added = await window.api.dropFiles(files, { visualAnalysis })
      setStatus(`QUEUED ${added.length} FILE${added.length !== 1 ? 'S' : ''} FOR PROCESSING`)
      setTimeout(() => setStatus(null), 4000)
    } catch (err) {
      setStatus(`ERROR: ${err.message}`)
    }
  }

  const handleBrowse = async () => {
    try {
      const added = await window.api.addFiles({ visualAnalysis })
      if (added && added.length > 0) {
        setStatus(`QUEUED ${added.length} FILE${added.length !== 1 ? 'S' : ''} FOR PROCESSING`)
        setTimeout(() => setStatus(null), 4000)
      }
    } catch (err) {
      setStatus(`ERROR: ${err.message}`)
    }
  }

  const saveChunkSettings = async () => {
    await Promise.all([
      window.api.setSetting('chunk_size', chunkSize),
      window.api.setSetting('chunk_overlap', chunkOverlap),
      window.api.setSetting('keyframe_interval', keyframeInterval),
      window.api.setSetting('visual_analysis_default', visualAnalysis)
    ])
    setStatus('SETTINGS SAVED')
    setTimeout(() => setStatus(null), 2000)
  }

  return (
    <div className="tab-container">
      <div className="tab-header">
        <div>
          <div className="tab-title">⬇ INGEST FILES</div>
          <div className="tab-subtitle">ADD AUDIO, VIDEO, OR DOCUMENTS TO THE KNOWLEDGE BASE</div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        ref={dropRef}
        className={`dropzone ${dragging ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowse}
      >
        <div className="dropzone-corner tl" />
        <div className="dropzone-corner tr" />
        <div className="dropzone-corner bl" />
        <div className="dropzone-corner br" />
        <div className="dropzone-icon">⬇</div>
        <div className="dropzone-text">DROP FILES OR CLICK TO BROWSE</div>
        <div className="dropzone-sub">
          AUDIO · VIDEO · PDF · EPUB · DOCX · ODT · TXT · MD
        </div>
      </div>

      {status && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(0,180,216,0.1)',
          border: '1px solid var(--cn-accent)',
          color: 'var(--cn-accent)',
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase'
        }}>
          {status}
        </div>
      )}

      {/* Options */}
      <div className="cn-panel" style={{ padding: '14px' }}>
        <div className="config-section-title">PROCESSING OPTIONS</div>

        <div className="toggle-row">
          <div>
            <div className="toggle-row-label">VISUAL ANALYSIS</div>
            <div className="toggle-row-desc">Extract & describe keyframes using LLaVA vision model (video only)</div>
          </div>
          <input
            type="checkbox"
            className="cn-toggle"
            checked={visualAnalysis}
            onChange={e => setVisualAnalysis(e.target.checked)}
          />
        </div>

        <hr className="cn-divider" />

        <div className="options-grid-3">
          <div className="option-field">
            <label className="cn-label">CHUNK SIZE (WORDS)</label>
            <input
              type="number"
              className="cn-input"
              value={chunkSize}
              min={100}
              max={2000}
              onChange={e => setChunkSize(Number(e.target.value))}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">CHUNK OVERLAP (WORDS)</label>
            <input
              type="number"
              className="cn-input"
              value={chunkOverlap}
              min={0}
              max={400}
              onChange={e => setChunkOverlap(Number(e.target.value))}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">KEYFRAME INTERVAL (SEC)</label>
            <input
              type="number"
              className="cn-input"
              value={keyframeInterval}
              min={5}
              max={300}
              onChange={e => setKeyframeInterval(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="cn-btn" onClick={saveChunkSettings}>
            SAVE DEFAULTS
          </button>
        </div>
      </div>

      {/* Supported formats */}
      <div className="cn-panel" style={{ padding: '14px' }}>
        <div className="config-section-title">SUPPORTED FORMATS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Object.entries(FILE_TYPE_LABELS).map(([type, label]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`cn-badge cn-badge-${type === 'audio' ? 'cyan' : type === 'video' ? 'purple' : 'amber'}`}>
                {type.toUpperCase()}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--cn-dim)', letterSpacing: '0.08em' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
