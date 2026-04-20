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

  const PAGE_SIZE = 50

  const loadDocs = useCallback(async () => {
    try {
      const res = await window.api.listDocuments(page, PAGE_SIZE)
      setDocs(res.documents)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    }
  }, [page])

  useEffect(() => {
    if (!searching) loadDocs()
  }, [loadDocs, searching])

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
        {docs.map(doc => (
          <div key={doc.id} className="library-item">
            <div
              className="library-item-icon"
              style={{ color: TYPE_COLORS[doc.file_type] || 'var(--cn-dim)' }}
            >
              {TYPE_ICONS[doc.file_type] || '◈'}
            </div>
            <div className="library-item-info">
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
            </div>
            <div className="library-item-chunks">
              <div style={{ fontSize: '16px', textShadow: 'var(--cn-glow-green)' }}>
                {doc.chunks}
              </div>
              <div style={{ fontSize: '8px', color: 'var(--cn-dim)', letterSpacing: '0.1em' }}>
                CHUNKS
              </div>
            </div>
            {confirmDelete === doc.source_file ? (
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
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
              </div>
            ) : (
              <button
                className="cn-btn cn-btn-red"
                style={{ fontSize: '9px', padding: '3px 8px', flexShrink: 0 }}
                onClick={() => setConfirmDelete(doc.source_file)}
              >
                DELETE
              </button>
            )}
          </div>
        ))}
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
