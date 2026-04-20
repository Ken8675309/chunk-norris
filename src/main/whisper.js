import { spawn } from 'child_process'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const PYTHON = '/home/ken/chunk-norris/.venv/bin/python'

const spawnEnv = {
  ...process.env,
  CUDA_VISIBLE_DEVICES: '',
  HIP_VISIBLE_DEVICES: '',
}

function getScriptsDir() {
  if (is.dev) return join(process.cwd(), 'resources', 'scripts')
  return join(process.resourcesPath, 'scripts')
}

export function transcribeAudio(audioPath, model = 'large-v3', onProgress, onPid) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(getScriptsDir(), 'transcribe.py')
    const py = spawn(PYTHON, [scriptPath, audioPath, '--model', model], { env: spawnEnv })
    if (onPid) onPid(py.pid)

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      const lines = text.split('\n').filter(Boolean)
      for (const line of lines) {
        if (line.startsWith('PROGRESS:') && onProgress) {
          const pct = parseFloat(line.replace('PROGRESS:', '').trim())
          if (!isNaN(pct)) onProgress(pct)
        }
      }
    })

    py.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Whisper exited ${code}: ${stderr.slice(-500)}`))
        return
      }

      try {
        const jsonStart = stdout.indexOf('{')
        const result = JSON.parse(stdout.slice(jsonStart))
        resolve(result)
      } catch (err) {
        reject(new Error(`Failed to parse Whisper output: ${err.message}\n${stdout.slice(-300)}`))
      }
    })

    py.on('error', (err) => {
      reject(new Error(`Failed to spawn Python (${PYTHON}): ${err.message}`))
    })
  })
}

export function extractAudioFromVideo(videoPath, outputWav) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', videoPath,
      '-ar', '16000', '-ac', '1', '-f', 'wav',
      outputWav
    ]
    const ff = spawn('ffmpeg', args)
    let stderr = ''
    ff.stderr.on('data', (d) => { stderr += d.toString() })
    ff.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg error: ${stderr.slice(-300)}`))
      else resolve(outputWav)
    })
    ff.on('error', (err) => reject(new Error(`ffmpeg not found: ${err.message}`)))
  })
}

export function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const ff = spawn('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_format', videoPath
    ])
    let out = ''
    ff.stdout.on('data', (d) => { out += d.toString() })
    ff.on('close', () => {
      try {
        const data = JSON.parse(out)
        resolve(parseFloat(data.format?.duration || 0))
      } catch {
        resolve(0)
      }
    })
    ff.on('error', () => resolve(0))
  })
}
