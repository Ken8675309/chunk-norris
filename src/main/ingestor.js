import { join, extname } from 'path'
import { writeFileSync, mkdirSync, statSync, unlinkSync, readFileSync, existsSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { randomUUID } from 'crypto'

const PYTHON = '/home/ken/chunk-norris/.venv/bin/python'
import { transcribeAudio, extractAudioFromVideo, getVideoDuration } from './whisper.js'
import { extractKeyframes, describeKeyframe, cleanupFrames } from './vision.js'
import { extractText, getFileFormat } from './document.js'
import { semanticChunk, embedChunks } from './chunker.js'
import { upsertVectors } from './qdrant.js'
import { updateJobProgress, updateJobStatus, completeJob, setJobPid } from '../db/queries.js'

const AUDIO_EXTS = new Set(['mp3', 'm4a', 'm4b', 'wav', 'flac', 'ogg', 'aac'])
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm'])
const DOC_EXTS   = new Set(['pdf', 'epub', 'docx', 'odt', 'txt', 'md'])

// ── Transcript subfolder routing ────────────────────────────────────────────

function transcriptSubdir(type, combined = false) {
  if (combined) return 'combined'
  if (AUDIO_EXTS.has(type)) return 'audio'
  if (VIDEO_EXTS.has(type)) return 'video'
  return 'documents'
}

function transcriptsRoot(settings) {
  return settings.transcripts_path.replace(/^~/, homedir())
}

function ensureTranscriptDirs(settings) {
  const root = transcriptsRoot(settings)
  for (const sub of ['audio', 'video', 'documents', 'combined']) {
    mkdirSync(join(root, sub), { recursive: true })
  }
  return root
}

// ── Timestamp formatting ─────────────────────────────────────────────────────

function fmtTimestamp(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Transcript builders ───────────────────────────────────────────────────────

function buildTimestampedTranscript(segments) {
  return segments
    .map(seg => `[${fmtTimestamp(seg.start)}] ${seg.text.trim()}`)
    .join('\n')
}

function buildCleanTranscript(segments) {
  if (segments.length === 0) return ''
  const paragraphs = []
  let current = []

  for (let i = 0; i < segments.length; i++) {
    current.push(segments[i].text.trim())
    const nextGap = i + 1 < segments.length
      ? segments[i + 1].start - segments[i].end
      : 999
    // New paragraph on long pause (>3s) or every 12 segments
    if (nextGap > 3 || current.length >= 12) {
      paragraphs.push(current.join(' '))
      current = []
    }
  }
  if (current.length) paragraphs.push(current.join(' '))
  return paragraphs.join('\n\n')
}

function buildDocumentClean(text) {
  // Normalize double-newlines into clean paragraph breaks
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Save transcripts, return { cleanPath, wordCount } ───────────────────────

function saveTranscripts(baseName, ext, settings, {
  segments = null,
  rawText = null,
  subdir = null,
  saveTimestamped = true,
  saveClean = true,
}) {
  const root = ensureTranscriptDirs(settings)
  const folder = subdir || transcriptSubdir(ext)
  const stem = baseName.replace(/\.[^.]+$/, '')
  let cleanPath = null
  let wordCount = 0

  // Build text content
  const tsText = (segments && segments.length > 0)
    ? buildTimestampedTranscript(segments)
    : (rawText || '')

  const cleanText = (segments && segments.length > 0)
    ? buildCleanTranscript(segments)
    : buildDocumentClean(rawText || '')

  wordCount = cleanText.split(/\s+/).filter(Boolean).length

  if (saveTimestamped && tsText) {
    writeFileSync(join(root, folder, `${stem}.txt`), tsText, 'utf8')
  }
  if (saveClean && cleanText) {
    cleanPath = join(root, folder, `${stem}_clean.txt`)
    writeFileSync(cleanPath, cleanText, 'utf8')
  }

  return { cleanPath, wordCount }
}

// ── Pipeline functions ────────────────────────────────────────────────────────

export async function ingestFile(job, settings) {
  const { id, file_path, file_name } = job
  const ext = extname(file_name).slice(1).toLowerCase()

  try {
    updateJobStatus(id, 'processing')

    let result
    if (AUDIO_EXTS.has(ext)) {
      result = await ingestAudio(id, file_path, file_name, ext, settings)
    } else if (VIDEO_EXTS.has(ext)) {
      result = await ingestVideo(id, file_path, file_name, ext, settings, job.visual_analysis)
    } else if (DOC_EXTS.has(ext)) {
      result = await ingestDocument(id, file_path, file_name, ext, settings)
    } else {
      throw new Error(`Unsupported file type: .${ext}`)
    }

    completeJob(id, result.chunksCreated, result.transcriptPath, result.wordCount)
  } catch (err) {
    console.error(`[ingestor] Error processing ${file_name}:`, err)
    updateJobStatus(id, 'error', err.message)
  }
}

async function ingestAudio(jobId, filePath, fileName, ext, settings) {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const cachedCleanPath = join(transcriptsRoot(settings), 'audio', `${stem}_clean.txt`)
  const hasCachedTranscript = existsSync(cachedCleanPath)

  let transcriptText
  let cleanPath = null
  let wordCount = 0

  if (hasCachedTranscript) {
    console.log(`[ingestor] Found cached transcript for ${fileName}, skipping Whisper`)
    updateJobProgress(jobId, 55, 'Using cached transcript...')
    transcriptText = readFileSync(cachedCleanPath, 'utf8')
    cleanPath = cachedCleanPath
    wordCount = transcriptText.split(/\s+/).filter(Boolean).length
  } else {
    updateJobProgress(jobId, 5, 'Transcribing audio...')
    const result = await transcribeAudio(
      filePath,
      settings.whisper_model,
      (pct) => updateJobProgress(jobId, 5 + Math.floor(pct * 0.5), 'Transcribing...'),
      (pid) => setJobPid(jobId, pid)
    )
    transcriptText = result.text || ''

    if (settings.keep_transcripts) {
      const saved = saveTranscripts(fileName, ext, settings, {
        segments: result.segments || [],
        rawText: transcriptText,
        saveTimestamped: settings.save_timestamped_transcript !== false,
        saveClean: settings.save_clean_transcript !== false,
      })
      cleanPath = saved.cleanPath
      wordCount = saved.wordCount
    }
  }

  updateJobProgress(jobId, 60, 'Chunking...')
  const chunks = semanticChunk(transcriptText, settings.chunk_size, settings.chunk_overlap)

  updateJobProgress(jobId, 65, 'Embedding...')
  const embedded = await embedChunks(
    chunks, settings.embedding_model, settings.ollama_host, settings.ollama_port,
    (pct) => updateJobProgress(jobId, 65 + Math.floor(pct * 0.3), 'Embedding...')
  )

  updateJobProgress(jobId, 95, 'Upserting to Qdrant...')
  const title = stem
  const points = embedded.map((e, i) => ({
    id: randomUUID(),
    vector: e.embedding,
    payload: {
      title, source_file: filePath, type: 'audio',
      chunk_index: i, chunk_total: chunks.length,
      text: e.text, date_added: new Date().toISOString()
    }
  }))
  await upsertVectors(points)
  console.log(`[ingestor] ${fileName}: upserted ${points.length} vectors`)
  return { chunksCreated: points.length, transcriptPath: cleanPath, wordCount }
}

async function ingestVideo(jobId, filePath, fileName, ext, settings, visualAnalysis) {
  const duration = await getVideoDuration(filePath)
  const tmpWav = join(tmpdir(), `cn_audio_${Date.now()}.wav`)

  updateJobProgress(jobId, 5, 'Extracting audio...')
  await extractAudioFromVideo(filePath, tmpWav)

  updateJobProgress(jobId, 15, 'Transcribing...')
  const result = await transcribeAudio(
    tmpWav, settings.whisper_model,
    (pct) => updateJobProgress(jobId, 15 + Math.floor(pct * 0.35), 'Transcribing...'),
    (pid) => setJobPid(jobId, pid)
  )

  let segments = result.segments || []
  let hasVisualAnalysis = false
  let visualDescs = []

  if (visualAnalysis) {
    updateJobProgress(jobId, 55, 'Extracting keyframes...')
    try {
      const { dir, frames } = await extractKeyframes(filePath, settings.keyframe_interval)
      for (let i = 0; i < frames.length; i++) {
        updateJobProgress(jobId, 55 + Math.floor((i / frames.length) * 15), `Analyzing frame ${i + 1}/${frames.length}...`)
        try {
          const desc = await describeKeyframe(frames[i].path, frames[i].timestamp, settings.vision_model, settings.ollama_host, settings.ollama_port)
          visualDescs.push(`[Visual at ${desc.timeStr}]: ${desc.description}`)
        } catch (err) { console.warn(`[vision] Frame ${i} failed:`, err.message) }
      }
      cleanupFrames(dir)
      if (visualDescs.length > 0) hasVisualAnalysis = true
    } catch (err) { console.warn('[vision] Keyframe extraction failed:', err.message) }
  }

  const subdir = hasVisualAnalysis ? 'combined' : 'video'
  const fullText = [result.text || '', ...visualDescs].join('\n')

  const { cleanPath, wordCount } = settings.keep_transcripts
    ? saveTranscripts(fileName, ext, settings, {
        segments,
        rawText: fullText,
        subdir,
        saveTimestamped: settings.save_timestamped_transcript !== false,
        saveClean: settings.save_clean_transcript !== false,
      })
    : { cleanPath: null, wordCount: 0 }

  try { unlinkSync(tmpWav) } catch {}

  updateJobProgress(jobId, 72, 'Chunking...')
  const chunks = semanticChunk(fullText, settings.chunk_size, settings.chunk_overlap)

  updateJobProgress(jobId, 76, 'Embedding...')
  const embedded = await embedChunks(
    chunks, settings.embedding_model, settings.ollama_host, settings.ollama_port,
    (pct) => updateJobProgress(jobId, 76 + Math.floor(pct * 0.2), 'Embedding...')
  )

  updateJobProgress(jobId, 96, 'Upserting to Qdrant...')
  const title = fileName.replace(/\.[^.]+$/, '')
  const points = embedded.map((e, i) => ({
    id: randomUUID(),
    vector: e.embedding,
    payload: {
      title, source_file: filePath, type: 'video',
      duration, has_visual_analysis: hasVisualAnalysis,
      chunk_index: i, chunk_total: chunks.length,
      text: e.text, date_added: new Date().toISOString()
    }
  }))
  await upsertVectors(points)
  return { chunksCreated: points.length, transcriptPath: cleanPath, wordCount }
}

async function ingestDocument(jobId, filePath, fileName, format, settings) {
  updateJobProgress(jobId, 5, 'Extracting text...')
  const { text, metadata } = await extractText(filePath, format)

  const { cleanPath, wordCount } = settings.keep_transcripts
    ? saveTranscripts(fileName, format, settings, {
        rawText: text,
        subdir: 'documents',
        saveTimestamped: false,
        saveClean: settings.save_clean_transcript !== false,
      })
    : { cleanPath: null, wordCount: 0 }

  updateJobProgress(jobId, 40, 'Chunking...')
  const chunks = semanticChunk(text, settings.chunk_size, settings.chunk_overlap)

  updateJobProgress(jobId, 45, 'Embedding...')
  const embedded = await embedChunks(
    chunks, settings.embedding_model, settings.ollama_host, settings.ollama_port,
    (pct) => updateJobProgress(jobId, 45 + Math.floor(pct * 0.5), 'Embedding...')
  )

  updateJobProgress(jobId, 95, 'Upserting to Qdrant...')
  const title = metadata.title || fileName.replace(/\.[^.]+$/, '')
  const points = embedded.map((e, i) => ({
    id: randomUUID(),
    vector: e.embedding,
    payload: {
      title, author: metadata.author || '',
      source_file: filePath, type: 'document',
      format, pages: metadata.pages || 0, chapters: metadata.chapters || 0,
      chunk_index: i, chunk_total: chunks.length,
      text: e.text, date_added: new Date().toISOString()
    }
  }))
  await upsertVectors(points)
  return { chunksCreated: points.length, transcriptPath: cleanPath, wordCount }
}
