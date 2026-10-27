import { ipcMain, dialog, shell } from 'electron'
import { extname } from 'path'
import { homedir } from 'os'
import { statSync } from 'fs'
import { spawn } from 'child_process'

function getGpus() {
  return new Promise((resolve) => {
    const cp = spawn('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
      '--format=csv,noheader,nounits'
    ])
    let out = ''
    cp.stdout.on('data', d => { out += d })
    cp.on('error', () => resolve([]))
    cp.on('close', (code) => {
      if (code !== 0) return resolve([])
      const gpus = out.trim().split('\n').filter(Boolean).map(line => {
        const [name, util, memUsed, memTotal, temp] = line.split(',').map(s => s.trim())
        return {
          vendor: 'NVIDIA',
          name,
          utilPct: Number(util),
          memUsedMB: Number(memUsed),
          memTotalMB: Number(memTotal),
          tempC: Number(temp)
        }
      })
      resolve(gpus)
    })
  })
}

const PYTHON = '/home/ken/chunk-norris/.venv/bin/python'
import { getSettings, setSetting, addJob, listJobs, cancelJob, retryJob, clearDoneJobs,
         resetJob, deleteJob, clearErroredJobs,
         listDocuments, searchDocuments, deleteDocument } from '../db/queries.js'
import { isQdrantRunning, getQdrantStats, deleteBySourceFile } from './qdrant.js'
import { ingestFile } from './ingestor.js'

let processingQueue = false
let processingStartedAt = 0
let lastProcessingJobId = null

export function startQueueIfIdle() {
  if (!processingQueue) processQueue()
}

export function registerIpcHandlers() {
  // Poll every 10s — catches jobs queued while processor is busy and watchdog stuck flag
  setInterval(() => {
    const jobs = listJobs()
    const queued = jobs.filter(j => j.status === 'queued')
    const processing = jobs.filter(j => j.status === 'processing')

    // Watchdog: processingQueue stuck `true` but DB shows no in-flight job for >2 min
    if (processingQueue && processing.length === 0 && processingStartedAt > 0) {
      const stuckMs = Date.now() - processingStartedAt
      if (stuckMs > 120000) {
        console.warn(`[queue] WATCHDOG: processingQueue stuck for ${Math.floor(stuckMs/1000)}s with no active DB job — force-resetting`)
        processingQueue = false
        processingStartedAt = 0
      }
    }

    if (queued.length > 0 && !processingQueue) {
      console.log(`[queue] poller: ${queued.length} queued, starting processor`)
      processQueue()
    } else if (queued.length > 0 && processingQueue) {
      console.log(`[queue] poller: ${queued.length} queued, processor busy on job ${lastProcessingJobId ?? '?'}`)
    }
  }, 10000)
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
  ipcMain.handle('queue:start', () => {
    console.log('[queue] manual start triggered')
    if (processingQueue) {
      console.warn('[queue] manual start: processor flag stuck true — force-resetting')
      processingQueue = false
      processingStartedAt = 0
      lastProcessingJobId = null
    }
    processQueue()
  })
  ipcMain.handle('queue:cancel', (_, id) => {
    const pid = cancelJob(id)
    if (pid) {
      try { process.kill(pid, 'SIGTERM') } catch {}
    }
  })
  ipcMain.handle('queue:retry', (_, id) => {
    retryJob(id)
    processQueue()
  })
  ipcMain.handle('queue:reset-job', (_, id) => {
    const pid = resetJob(id)
    if (pid) {
      console.log(`[queue] reset-job: killing pid ${pid}`)
      try { process.kill(pid, 'SIGTERM') } catch {}
    }
    // Give the killed process a moment to exit, then re-check the queue
    setTimeout(() => { if (!processingQueue) processQueue() }, 1500)
  })
  ipcMain.handle('queue:delete-job', (_, id) => deleteJob(id))
  ipcMain.handle('queue:clear-errors', () => clearErroredJobs())
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

  // ---- TRANSCRIPTS ----
  ipcMain.handle('transcripts:open-folder', () => {
    const s = getSettings()
    const dir = s.transcripts_path.replace(/^~/, homedir())
    return shell.openPath(dir)
  })
  ipcMain.handle('transcripts:open-file', (_, filePath) => shell.openPath(filePath))
  ipcMain.handle('transcripts:file-info', (_, filePath) => {
    if (!filePath) return null
    try {
      const stat = statSync(filePath)
      return { size: stat.size, exists: true }
    } catch {
      return { size: 0, exists: false }
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

    const gpus = await getGpus()

    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      gpus,
      services: { qdrant: qdrantStatus, ollama: ollamaStatus, openwebui: openwebuiStatus }
    }
  })
}

async function processQueue() {
  if (processingQueue) {
    console.log('[queue] processQueue called but already running — skip')
    return
  }
  processingQueue = true
  processingStartedAt = Date.now()
  console.log('[queue] processor started')

  try {
    while (true) {
      const jobs = listJobs()
      const nextJob = jobs.find(j => j.status === 'queued')
      if (!nextJob) {
        console.log('[queue] processor: no more queued jobs, exiting')
        break
      }

      lastProcessingJobId = nextJob.id
      console.log(`[queue] picked job #${nextJob.id} (${nextJob.file_name})`)
      const settings = getSettings()
      try {
        await ingestFile(nextJob, settings)
      } catch (err) {
        // ingestFile already catches internally; this is belt-and-suspenders
        console.error(`[queue] uncaught error on job #${nextJob.id}:`, err)
      }
      lastProcessingJobId = null
    }
  } finally {
    processingQueue = false
    processingStartedAt = 0
    lastProcessingJobId = null
    console.log('[queue] processor stopped')
  }
}
