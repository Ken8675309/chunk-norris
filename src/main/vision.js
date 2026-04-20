import { spawn } from 'child_process'
import { join } from 'path'
import { mkdirSync, readdirSync, unlinkSync, rmdirSync } from 'fs'
import { tmpdir } from 'os'

export async function extractKeyframes(videoPath, intervalSecs = 45, outputDir = null) {
  const dir = outputDir || join(tmpdir(), `cn_frames_${Date.now()}`)
  mkdirSync(dir, { recursive: true })

  await new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', videoPath,
      '-vf', `fps=1/${intervalSecs}`,
      '-frame_pts', '1',
      join(dir, 'frame_%06d.jpg')
    ]
    const ff = spawn('ffmpeg', args)
    let stderr = ''
    ff.stderr.on('data', (d) => { stderr += d.toString() })
    ff.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg keyframe error: ${stderr.slice(-300)}`))
      else resolve()
    })
    ff.on('error', (err) => reject(new Error(`ffmpeg not found: ${err.message}`)))
  })

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map((f, i) => ({
      path: join(dir, f),
      timestamp: i * intervalSecs
    }))

  return { dir, frames: files }
}

export async function describeKeyframe(imagePath, timestamp, model, ollamaHost, ollamaPort) {
  const base = `http://${ollamaHost}:${ollamaPort}`
  const { readFileSync } = await import('fs')
  const imageData = readFileSync(imagePath).toString('base64')

  const timeStr = formatTimestamp(timestamp)
  const prompt = `You are analyzing a video frame at timestamp ${timeStr}. Describe what is shown on screen in 1-2 concise sentences. Focus on: people, text, diagrams, actions, or key visual elements. Be specific and factual.`

  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [imageData],
      stream: false
    }),
    signal: AbortSignal.timeout(60000)
  })

  if (!res.ok) throw new Error(`Ollama vision error: ${res.status}`)
  const data = await res.json()
  return { timestamp, timeStr, description: data.response?.trim() || '' }
}

export function cleanupFrames(dir) {
  try {
    const files = readdirSync(dir)
    for (const f of files) {
      try { unlinkSync(join(dir, f)) } catch {}
    }
    rmdirSync(dir)
  } catch {}
}

export function formatTimestamp(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
