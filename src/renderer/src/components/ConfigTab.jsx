import React, { useState, useEffect } from 'react'

export default function ConfigTab() {
  const [settings, setSettings] = useState(null)
  const [models, setModels]     = useState([])
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.ollamaModels().then(r => setModels(r.models || []))
  }, [])

  const update = (key, value) => {
    setSettings(s => ({ ...s, [key]: value }))
  }

  const save = async () => {
    if (!settings) return
    for (const [k, v] of Object.entries(settings)) {
      await window.api.setSetting(k, v)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!settings) {
    return (
      <div className="tab-container">
        <div style={{ color: 'var(--cn-dim)', letterSpacing: '0.15em', padding: '24px' }}>
          LOADING CONFIGURATION...
        </div>
      </div>
    )
  }

  return (
    <div className="tab-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <div className="tab-title">⚛ CONFIGURATION</div>
          <div className="tab-subtitle">MODEL SETTINGS, QDRANT CONFIG, STORAGE PATHS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saved && (
            <span style={{ fontSize: '11px', color: 'var(--cn-green)', letterSpacing: '0.12em', textShadow: 'var(--cn-glow-green)' }}>
              ✓ SAVED
            </span>
          )}
          <button className="cn-btn cn-btn-green" onClick={save}>
            SAVE ALL
          </button>
        </div>
      </div>

      {/* Models */}
      <div className="config-section">
        <div className="config-section-title">MODEL CONFIGURATION</div>
        <div className="config-grid">
          <div className="option-field">
            <label className="cn-label">WHISPER MODEL</label>
            <select
              className="cn-select"
              value={settings.whisper_model}
              onChange={e => update('whisper_model', e.target.value)}
            >
              {['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="option-field">
            <label className="cn-label">EMBEDDING MODEL</label>
            <ModelSelect
              value={settings.embedding_model}
              models={models}
              defaults={['nomic-embed-text', 'mxbai-embed-large', 'all-minilm']}
              onChange={v => update('embedding_model', v)}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">VISION MODEL (LLAVA)</label>
            <ModelSelect
              value={settings.vision_model}
              models={models}
              defaults={['llava:13b', 'llava:7b', 'llava-phi3', 'bakllava']}
              onChange={v => update('vision_model', v)}
            />
          </div>
        </div>
      </div>

      {/* Chunking */}
      <div className="config-section">
        <div className="config-section-title">CHUNKING SETTINGS</div>
        <div className="config-grid">
          <div className="option-field">
            <label className="cn-label">CHUNK SIZE (WORDS)</label>
            <input
              type="number"
              className="cn-input"
              value={settings.chunk_size}
              min={100}
              max={2000}
              onChange={e => update('chunk_size', Number(e.target.value))}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">CHUNK OVERLAP (WORDS)</label>
            <input
              type="number"
              className="cn-input"
              value={settings.chunk_overlap}
              min={0}
              max={400}
              onChange={e => update('chunk_overlap', Number(e.target.value))}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">KEYFRAME INTERVAL (SEC)</label>
            <input
              type="number"
              className="cn-input"
              value={settings.keyframe_interval}
              min={5}
              max={300}
              onChange={e => update('keyframe_interval', Number(e.target.value))}
            />
          </div>
        </div>

        <hr className="cn-divider" />

        <ToggleRow
          label="VISUAL ANALYSIS DEFAULT"
          desc="Enable LLaVA keyframe analysis for video by default"
          checked={settings.visual_analysis_default !== false}
          onChange={v => update('visual_analysis_default', v)}
        />
      </div>

      {/* Qdrant */}
      <div className="config-section">
        <div className="config-section-title">QDRANT DATABASE</div>
        <div className="config-grid">
          <div className="option-field">
            <label className="cn-label">HOST</label>
            <input
              type="text"
              className="cn-input"
              value={settings.qdrant_host}
              onChange={e => update('qdrant_host', e.target.value)}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">PORT</label>
            <input
              type="number"
              className="cn-input"
              value={settings.qdrant_port}
              onChange={e => update('qdrant_port', Number(e.target.value))}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">COLLECTION NAME</label>
            <input
              type="text"
              className="cn-input"
              value={settings.collection_name}
              onChange={e => update('collection_name', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Ollama */}
      <div className="config-section">
        <div className="config-section-title">OLLAMA SERVICE</div>
        <div className="config-grid">
          <div className="option-field">
            <label className="cn-label">HOST</label>
            <input
              type="text"
              className="cn-input"
              value={settings.ollama_host}
              onChange={e => update('ollama_host', e.target.value)}
            />
          </div>
          <div className="option-field">
            <label className="cn-label">PORT</label>
            <input
              type="number"
              className="cn-input"
              value={settings.ollama_port}
              onChange={e => update('ollama_port', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Storage */}
      <div className="config-section">
        <div className="config-section-title">STORAGE</div>
        <div className="option-field">
          <label className="cn-label">TRANSCRIPTS PATH</label>
          <input
            type="text"
            className="cn-input"
            value={settings.transcripts_path}
            onChange={e => update('transcripts_path', e.target.value)}
          />
        </div>
        <hr className="cn-divider" />
        <ToggleRow
          label="KEEP TRANSCRIPTS"
          desc="Save generated transcripts to disk after indexing"
          checked={settings.keep_transcripts !== false}
          onChange={v => update('keep_transcripts', v)}
        />
        <ToggleRow
          label="DELETE SOURCE AFTER INDEXING"
          desc="Remove original file after successful vector indexing"
          checked={settings.delete_source_after_index === true}
          onChange={v => update('delete_source_after_index', v)}
        />
      </div>
    </div>
  )
}

function ModelSelect({ value, models, defaults, onChange }) {
  const allOptions = [...new Set([...defaults, ...models])]
  return (
    <select className="cn-select" value={value} onChange={e => onChange(e.target.value)}>
      {allOptions.map(m => (
        <option key={m} value={m}>{m}{models.includes(m) ? ' ✓' : ''}</option>
      ))}
    </select>
  )
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1 }}>
        <div className="toggle-row-label">{label}</div>
        {desc && <div className="toggle-row-desc">{desc}</div>}
      </div>
      <input
        type="checkbox"
        className="cn-toggle"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
    </div>
  )
}
