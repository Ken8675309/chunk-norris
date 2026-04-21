import React, { useState, useEffect, useCallback } from 'react'

const TYPE_ICONS = {
  audio: '♪', video: '▶', document: '⬛'
}
const TYPE_COLORS = {
  audio: 'var(--cn-accent)',
  video: 'var(--cn-accent2)',
  document: 'var(--cn-amber)'
}

export default function LibraryTab() {
  const [docs, setDocs]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [query, setQuery]       = useState('')
  const [searching, setSearching] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [transcriptSizes, setTranscriptSizes] = useState({})

  const PAGE_SIZE = 50

  const loadDocs = useCallback(async () => {
    try {
      const res = await window.api.listDocuments(page, PAGE_SIZE)
      setDocs(res.documents)
      setTotal(res.total)
      fetchTranscriptSizes(res.documents)
    } catch (err) {
      console.error(err)
    }
  }, [page])

  useEffect(() => {
    if (!searching) loadDocs()
  }, [loadDocs, searching])

  const fetchTranscriptSizes = async (documents) => {
    const sizes = {}
    await Promise.all(
      documents
        .filter(d => d.transcript_path)
        .map(async d => {
          try {
            const info = await window.api.transcriptFileInfo(d.transcript_path)
            sizes[d.id] = info
          } catch {}
        })
    )
    setTranscriptSizes(prev => ({ ...prev, ...sizes }))
  }

  const handleSearch = async (q) => {
    setQuery(q)
    if (!q.trim()) {
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      const res = await window.api.searchDocuments(q)
      setDocs(res)
      fetchTranscriptSizes(res)
    } catch {}
  }

  const handleDelete = async (sourceFile) => {
    try {
      await window.api.deleteDocument(sourceFile)
      setConfirmDelete(null)
      loadDocs()
    } catch (err) {
      console.error(err)
    }
  }

  const handleViewTranscript = async (transcriptPath) => {
    try { await window.api.openTranscript(transcriptPath) } catch {}
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="tab-container">
      <div className="tab-header">
        <div>
          <div className="tab-title">◈ KNOWLEDGE LIBRARY</div>
          <div className="tab-subtitle">
            {total} INDEXED DOCUMENT{total !== 1 ? 'S' : ''}
          </div>
        </div>
      </div>

      <div className="library-search-bar">
        <input
          type="text"
          className="cn-input"
          placeholder="SEARCH DOCUMENTS..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {searching && (
          <button
            className="cn-btn"
            onClick={() => { setQuery(''); setSearching(false) }}
          >
            CLEAR
          </button>
        )}
      </div>

      {docs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">◈</div>
          <div className="empty-state-text">
            {searching ? 'NO RESULTS FOUND' : 'KNOWLEDGE BASE IS EMPTY'}
          </div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--cn-dim)' }}>
            {!searching && 'Ingest files to build your knowledge base'}
          </div>
        </div>
      )}

      <div>
        {docs.map(doc => {
          const tInfo = transcriptSizes[doc.id]
          const hasTranscript = doc.transcript_path && tInfo?.exists
          return (
            <div key={doc.id} className="library-item" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div
                className="library-item-icon"
                style={{ color: TYPE_COLORS[doc.file_type] || 'var(--cn-dim)' }}
              >
                {TYPE_ICONS[doc.file_type] || '◈'}
              </div>
              <div className="library-item-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="library-item-title cn-truncate" title={doc.source_file}>
                  {doc.title}
                </div>
                <div className="library-item-meta">
                  <span className={`cn-badge cn-badge-${doc.file_type === 'audio' ? 'cyan' : doc.file_type === 'video' ? 'purple' : 'amber'}`} style={{ marginRight: '8px' }}>
                    {doc.file_type?.toUpperCase()}
                  </span>
                  {doc.format && <span style={{ marginRight: '8px' }}>{doc.format.toUpperCase()}</span>}
                  <span>{formatDate(doc.date_indexed)}</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px', fontSize: '10px', color: 'var(--cn-dim)', letterSpacing: '0.08em' }}>
                  <span><span style={{ color: 'var(--cn-green)' }}>{doc.chunks}</span> CHUNKS</span>
                  {doc.word_count > 0 && (
                    <span><span style={{ color: 'var(--cn-green)' }}>{formatNumber(doc.word_count)}</span> WORDS</span>
                  )}
                  {hasTranscript && tInfo.size > 0 && (
                    <span><span style={{ color: 'var(--cn-dim)' }}>{formatBytes(tInfo.size)}</span> TRANSCRIPT</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {hasTranscript && (
                  <button
                    className="cn-btn"
                    style={{ fontSize: '9px', padding: '3px 8px' }}
                    onClick={() => handleViewTranscript(doc.transcript_path)}
                  >
                    TRANSCRIPT ↗
                  </button>
                )}
                {confirmDelete === doc.source_file ? (
                  <>
                    <button
                      className="cn-btn cn-btn-red"
                      style={{ fontSize: '9px', padding: '3px 8px' }}
                      onClick={() => handleDelete(doc.source_file)}
                    >
                      CONFIRM
                    </button>
                    <button
                      className="cn-btn"
                      style={{ fontSize: '9px', padding: '3px 8px' }}
                      onClick={() => setConfirmDelete(null)}
                    >
                      CANCEL
                    </button>
                  </>
                ) : (
                  <button
                    className="cn-btn cn-btn-red"
                    style={{ fontSize: '9px', padding: '3px 8px' }}
                    onClick={() => setConfirmDelete(doc.source_file)}
                  >
                    DELETE
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!searching && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
          <button
            className="cn-btn"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ◀ PREV
          </button>
          <span style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--cn-dim)', letterSpacing: '0.1em' }}>
            PAGE {page + 1} / {totalPages}
          </span>
          <button
            className="cn-btn"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            NEXT ▶
          </button>
        </div>
      )}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return iso }
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function formatBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB'
  return b + ' B'
}
