import { ipcMain, dialog } from 'electron'
import { extname } from 'path'

const PYTHON = '/home/ken/chunk-norris/.venv/bin/python'
import { getSettings, setSetting, addJob, listJobs, cancelJob, retryJob, clearDoneJobs,
         listDocuments, searchDocuments, deleteDocument } from '../db/queries.js'
import { isQdrantRunning, getQdrantStats, deleteBySourceFile } from './qdrant.js'
import { ingestFile } from './ingestor.js'

let processingQueue = false

export function registerIpcHandlers() {
  // ---- SETTINGS ----
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_, key, value) => {
    setSetting(key, value)
    return getSettings()
  })

  // ---- INGEST ----
  ipcMain.handle('ingest:add-files', async (event, options = {}) => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'SELECT FILES TO INGEST',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Supported', extensions: ['mp3','m4a','m4b','wav','flac','ogg','aac','mp4','mkv','mov','avi','webm','pdf','epub','docx','odt','txt','md'] },
        { name: 'Audio', extensions: ['mp3','m4a','m4b','wav','flac','ogg','aac'] },
        { name: 'Video', extensions: ['mp4','mkv','mov','avi','webm'] },
        { name: 'Documents', extensions: ['pdf','epub','docx','odt','txt','md'] }
      ]
    })
    if (!filePaths || filePaths.length === 0) return []

    const added = []
    for (const fp of filePaths) {
      const fn = fp.split('/').pop().split('\\').pop()
      const ext = extname(fn).slice(1).toLowerCase()
      const job = addJob(fp, fn, ext, options.visualAnalysis ?? true)
      added.push(job)
    }
    processQueue()
    return added
  })

  ipcMain.handle('ingest:drop-files', async (event, filePaths, options = {}) => {
    const added = []
    for (const fp of filePaths) {
      const fn = fp.split('/').pop().split('\\').pop()
      const ext = extname(fn).slice(1).toLowerCase()
      const job = addJob(fp, fn, ext, options.visualAnalysis ?? true)
      added.push(job)
    }
    processQueue()
    return added
  })

  // ---- QUEUE ----
  ipcMain.handle('queue:list', () => listJobs())
  ipcMain.handle('queue:cancel', (_, id) => cancelJob(id))
  ipcMain.handle('queue:retry', (_, id) => {
    retryJob(id)
    processQueue()
  })
  ipcMain.handle('queue:clear-done', () => clearDoneJobs())

  // ---- QDRANT ----
  ipcMain.handle('qdrant:status', async () => {
    const running = await isQdrantRunning()
    return { running }
  })
  ipcMain.handle('qdrant:stats', () => getQdrantStats())

  // ---- OLLAMA ----
  ipcMain.handle('ollama:status', async () => {
    const s = getSettings()
    try {
      const res = await fetch(`http://${s.ollama_host}:${s.ollama_port}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      })
      return { running: res.ok }
    } catch {
      return { running: false }
    }
  })
  ipcMain.handle('ollama:models', async () => {
    const s = getSettings()
    try {
      const res = await fetch(`http://${s.ollama_host}:${s.ollama_port}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!res.ok) return { models: [] }
      const data = await res.json()
      return { models: (data.models || []).map(m => m.name) }
    } catch {
      return { models: [] }
    }
  })

  // ---- LIBRARY ----
  ipcMain.handle('library:list', (_, page = 0, limit = 50) => listDocuments(page, limit))
  ipcMain.handle('library:search', (_, query) => searchDocuments(query))
  ipcMain.handle('library:delete', async (_, sourceFile) => {
    deleteDocument(sourceFile)
    await deleteBySourceFile(sourceFile)
    return true
  })

  // ---- DIAGNOSTICS ----
  ipcMain.handle('diagnostics:system-info', async () => {
    const { default: os } = await import('os')
    const s = getSettings()

    let qdrantStatus = false
    let ollamaStatus = false
    let openwebuiStatus = false

    try {
      const r = await fetch(`http://${s.qdrant_host}:${s.qdrant_port}/healthz`, { signal: AbortSignal.timeout(3000) })
      qdrantStatus = r.ok
    } catch {}
    try {
      const r = await fetch(`http://${s.ollama_host}:${s.ollama_port}/api/tags`, { signal: AbortSignal.timeout(3000) })
      ollamaStatus = r.ok
    } catch {}
    try {
      const r = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(3000) })
      openwebuiStatus = r.ok
    } catch {}

    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      services: { qdrant: qdrantStatus, ollama: ollamaStatus, openwebui: openwebuiStatus }
    }
  })
}

async function processQueue() {
  if (processingQueue) return
  processingQueue = true

  try {
    while (true) {
      const jobs = listJobs()
      const nextJob = jobs.find(j => j.status === 'queued')
      if (!nextJob) break

      const settings = getSettings()
      await ingestFile(nextJob, settings)
    }
  } finally {
    processingQueue = false
  }
}
