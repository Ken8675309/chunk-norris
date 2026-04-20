import { join, extname } from 'path'
import { writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { transcribeAudio, extractAudioFromVideo, getVideoDuration } from './whisper.js'
import { extractKeyframes, describeKeyframe, cleanupFrames } from './vision.js'
import { extractText, getFileFormat } from './document.js'
import { semanticChunk, embedChunks } from './chunker.js'
import { upsertVectors } from './qdrant.js'
import { updateJobProgress, updateJobStatus, completeJob } from '../db/queries.js'

const AUDIO_EXTS = new Set(['mp3', 'm4a', 'm4b', 'wav', 'flac', 'ogg', 'aac'])
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm'])
const DOC_EXTS   = new Set(['pdf', 'epub', 'docx', 'odt', 'txt', 'md'])

export async function ingestFile(job, settings) {
  const { id, file_path, file_name } = job
  const ext = extname(file_name).slice(1).toLowerCase()

  try {
    updateJobStatus(id, 'processing')

    let chunksCreated = 0
    if (AUDIO_EXTS.has(ext)) {
      chunksCreated = await ingestAudio(id, file_path, file_name, settings)
    } else if (VIDEO_EXTS.has(ext)) {
      chunksCreated = await ingestVideo(id, file_path, file_name, settings, job.visual_analysis)
    } else if (DOC_EXTS.has(ext)) {
      chunksCreated = await ingestDocument(id, file_path, file_name, ext, settings)
    } else {
      throw new Error(`Unsupported file type: .${ext}`)
    }

    completeJob(id, chunksCreated)
  } catch (err) {
    console.error(`[ingestor] Error processing ${file_name}:`, err)
    updateJobStatus(id, 'error', err.message)
  }
}

async function ingestAudio(jobId, filePath, fileName, settings) {
  const title = fileName.replace(/\.[^.]+$/, '')

  updateJobProgress(jobId, 5, 'Transcribing audio...')
  const result = await transcribeAudio(filePath, settings.whisper_model, (pct) => {
    updateJobProgress(jobId, 5 + Math.floor(pct * 0.5), 'Transcribing...')
  })

  const transcript = result.text || ''
  if (settings.keep_transcripts) saveTranscript(fileName, transcript, settings)

  updateJobProgress(jobId, 60, 'Chunking...')
  const chunks = semanticChunk(transcript, settings.chunk_size, settings.chunk_overlap)

  updateJobProgress(jobId, 65, 'Embedding...')
  const embedded = await embedChunks(
    chunks,
    settings.embedding_model,
    settings.ollama_host,
    settings.ollama_port,
    (pct) => updateJobProgress(jobId, 65 + Math.floor(pct * 0.3), 'Embedding...')
  )

  updateJobProgress(jobId, 95, 'Upserting to Qdrant...')
  const points = embedded.map((e, i) => ({
    id: randomUUID(),
    vector: e.embedding,
    payload: {
      title,
      source_file: filePath,
      type: 'audio',
      duration: result.duration || 0,
      chunk_index: i,
      chunk_total: chunks.length,
      text: e.text,
      date_added: new Date().toISOString()
    }
  }))
  await upsertVectors(points)
  return points.length
}

async function ingestVideo(jobId, filePath, fileName, settings, visualAnalysis) {
  const title = fileName.replace(/\.[^.]+$/, '')
  const duration = await getVideoDuration(filePath)
  const tmpWav = join(tmpdir(), `cn_audio_${Date.now()}.wav`)

  updateJobProgress(jobId, 5, 'Extracting audio...')
  await extractAudioFromVideo(filePath, tmpWav)

  updateJobProgress(jobId, 15, 'Transcribing...')
  const result = await transcribeAudio(tmpWav, settings.whisper_model, (pct) => {
    updateJobProgress(jobId, 15 + Math.floor(pct * 0.35), 'Transcribing...')
  })

  let transcript = result.text || ''
  let hasVisualAnalysis = false

  if (visualAnalysis) {
    updateJobProgress(jobId, 55, 'Extracting keyframes...')
    try {
      const { dir, frames } = await extractKeyframes(filePath, settings.keyframe_interval)
      const descriptions = []

      for (let i = 0; i < frames.length; i++) {
        updateJobProgress(
          jobId,
          55 + Math.floor((i / frames.length) * 15),
          `Analyzing frame ${i + 1}/${frames.length}...`
        )
        try {
          const desc = await describeKeyframe(
            frames[i].path,
            frames[i].timestamp,
            settings.vision_model,
            settings.ollama_host,
            settings.ollama_port
          )
          descriptions.push(`[Visual at ${desc.timeStr}]: ${desc.description}`)
        } catch (err) {
          console.warn(`[vision] Frame ${i} failed:`, err.message)
        }
      }

      cleanupFrames(dir)
      if (descriptions.length > 0) {
        transcript = interleaveVisuals(transcript, descriptions, result.segments || [])
        hasVisualAnalysis = true
      }
    } catch (err) {
      console.warn('[vision] Keyframe extraction failed:', err.message)
    }
  }

  if (settings.keep_transcripts) saveTranscript(fileName, transcript, settings)

  updateJobProgress(jobId, 72, 'Chunking...')
  const chunks = semanticChunk(transcript, settings.chunk_size, settings.chunk_overlap)

  updateJobProgress(jobId, 76, 'Embedding...')
  const embedded = await embedChunks(
    chunks,
    settings.embedding_model,
    settings.ollama_host,
    settings.ollama_port,
    (pct) => updateJobProgress(jobId, 76 + Math.floor(pct * 0.2), 'Embedding...')
  )

  try { unlinkSync(tmpWav) } catch {}

  updateJobProgress(jobId, 96, 'Upserting to Qdrant...')
  const points = embedded.map((e, i) => ({
    id: randomUUID(),
    vector: e.embedding,
    payload: {
      title,
      source_file: filePath,
      type: 'video',
      duration,
      has_visual_analysis: hasVisualAnalysis,
      chunk_index: i,
      chunk_total: chunks.length,
      text: e.text,
      date_added: new Date().toISOString()
    }
  }))
  await upsertVectors(points)
  return points.length
}

async function ingestDocument(jobId, filePath, fileName, format, settings) {
  const title = fileName.replace(/\.[^.]+$/, '')

  updateJobProgress(jobId, 5, 'Extracting text...')
  const { text, metadata } = await extractText(filePath, format)

  updateJobProgress(jobId, 40, 'Chunking...')
  const chunks = semanticChunk(text, settings.chunk_size, settings.chunk_overlap)

  updateJobProgress(jobId, 45, 'Embedding...')
  const embedded = await embedChunks(
    chunks,
    settings.embedding_model,
    settings.ollama_host,
    settings.ollama_port,
    (pct) => updateJobProgress(jobId, 45 + Math.floor(pct * 0.5), 'Embedding...')
  )

  updateJobProgress(jobId, 95, 'Upserting to Qdrant...')
  const points = embedded.map((e, i) => ({
    id: randomUUID(),
    vector: e.embedding,
    payload: {
      title: metadata.title || title,
      author: metadata.author || '',
      source_file: filePath,
      type: 'document',
      format,
      pages: metadata.pages || 0,
      chapters: metadata.chapters || 0,
      chunk_index: i,
      chunk_total: chunks.length,
      text: e.text,
      date_added: new Date().toISOString()
    }
  }))
  await upsertVectors(points)
  return points.length
}

function saveTranscript(fileName, text, settings) {
  const transcriptDir = settings.transcripts_path.replace('~', homedir())
  mkdirSync(transcriptDir, { recursive: true })
  const outFile = join(transcriptDir, fileName.replace(/\.[^.]+$/, '') + '.txt')
  writeFileSync(outFile, text, 'utf8')
}

function interleaveVisuals(transcript, visualDescs, segments) {
  if (segments.length === 0) return transcript + '\n\n' + visualDescs.join('\n')
  let enriched = transcript
  for (const desc of visualDescs) {
    enriched += '\n' + desc
  }
  return enriched
}
