import { getDb } from './schema.js'

// ---- SETTINGS ----

export function getSettings() {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const { key, value } of rows) {
    if (value === 'true') settings[key] = true
    else if (value === 'false') settings[key] = false
    else if (/^\d+$/.test(value)) settings[key] = parseInt(value, 10)
    else settings[key] = value
  }
  return settings
}

export function setSetting(key, value) {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
}

// ---- JOBS ----

export function addJob(filePath, fileName, fileType, visualAnalysis = true) {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO jobs (file_path, file_name, file_type, status, visual_analysis)
    VALUES (?, ?, ?, 'queued', ?)
  `).run(filePath, fileName, fileType, visualAnalysis ? 1 : 0)

  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid)
}

export function listJobs(limit = 200) {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM jobs ORDER BY date_added DESC LIMIT ?
  `).all(limit)
}

export function updateJobProgress(id, progress, statusMsg = '') {
  const db = getDb()
  db.prepare('UPDATE jobs SET progress = ?, status_msg = ? WHERE id = ?').run(progress, statusMsg, id)
}

export function updateJobStatus(id, status, errorMsg = '') {
  const db = getDb()
  db.prepare('UPDATE jobs SET status = ?, error_msg = ? WHERE id = ?').run(status, errorMsg, id)
}

export function completeJob(id, chunksCreated) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs SET status = 'done', progress = 100, chunks_created = ?, date_completed = datetime('now')
    WHERE id = ?
  `).run(chunksCreated, id)

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
  if (job) {
    db.prepare(`
      INSERT OR REPLACE INTO documents (title, source_file, file_type, format, chunks)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      job.file_name.replace(/\.[^.]+$/, ''),
      job.file_path,
      job.file_type,
      job.file_type,
      chunksCreated
    )
  }
}

export function cancelJob(id) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs SET status = 'error', error_msg = 'Cancelled by user'
    WHERE id = ? AND status = 'queued'
  `).run(id)
}

export function retryJob(id) {
  const db = getDb()
  db.prepare(`
    UPDATE jobs SET status = 'queued', progress = 0, error_msg = '', status_msg = ''
    WHERE id = ? AND status = 'error'
  `).run(id)
}

export function clearDoneJobs() {
  const db = getDb()
  db.prepare("DELETE FROM jobs WHERE status = 'done'").run()
}

// ---- DOCUMENTS ----

export function listDocuments(page = 0, limit = 50) {
  const db = getDb()
  const offset = page * limit
  const rows = db.prepare(`
    SELECT * FROM documents ORDER BY date_indexed DESC LIMIT ? OFFSET ?
  `).all(limit, offset)
  const total = db.prepare('SELECT COUNT(*) as count FROM documents').get()
  return { documents: rows, total: total.count, page, limit }
}

export function searchDocuments(query) {
  const db = getDb()
  const like = `%${query}%`
  return db.prepare(`
    SELECT * FROM documents
    WHERE title LIKE ? OR source_file LIKE ?
    ORDER BY date_indexed DESC LIMIT 100
  `).all(like, like)
}

export function deleteDocument(sourceFile) {
  const db = getDb()
  db.prepare('DELETE FROM documents WHERE source_file = ?').run(sourceFile)
}
