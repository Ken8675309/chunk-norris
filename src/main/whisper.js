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

const PROGRESS_WATCHDOG_MS = 5 * 60 * 1000  // 5 min no output → kill

export function transcribeAudio(audioPath, model = 'large-v3', onProgress, onPid, checkpointDir = null) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(getScriptsDir(), 'transcribe.py')
    const args = [scriptPath, audioPath, '--model', model]
    if (checkpointDir) args.push('--checkpoint-dir', checkpointDir)

    const py = spawn(PYTHON, args, { env: spawnEnv })
    if (onPid) onPid(py.pid)

    let stdout = ''
    let stderr = ''
    let settled = false

    const settle = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(watchdogTimer)
      fn()
    }

    // Watchdog: if no PROGRESS line arrives for 5 minutes, kill subprocess.
    // The checkpoint file will be intact so retry resumes from last save.
    let watchdogTimer = setTimeout(() => {
      console.error('[whisper] No progress for 5 minutes — killing stuck subprocess')
      try { py.kill('SIGTERM') } catch {}
      settle(() => reject(new Error(
        'Whisper stuck: no progress for 5 minutes. Checkpoint preserved — retry will resume from last save point.'
      )))
    }, PROGRESS_WATCHDOG_MS)

    const resetWatchdog = () => {
      clearTimeout(watchdogTimer)
      watchdogTimer = setTimeout(() => {
        console.error('[whisper] No progress for 5 minutes — killing stuck subprocess')
        try { py.kill('SIGTERM') } catch {}
        settle(() => reject(new Error(
          'Whisper stuck: no progress for 5 minutes. Checkpoint preserved — retry will resume from last save point.'
        )))
      }, PROGRESS_WATCHDOG_MS)
    }

    py.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      const lines = text.split('\n').filter(Boolean)
      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          resetWatchdog()
          if (onProgress) {
            const pct = parseFloat(line.replace('PROGRESS:', '').trim())
            if (!isNaN(pct)) onProgress(pct)
          }
        }
      }
    })

    py.stderr.on('data', (data) => { stderr += data.toString() })

    py.on('close', (code) => {
      settle(() => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Whisper exited ${code}: ${stderr.slice(-500)}`))
          return
        }
        if (code === null) return  // killed by watchdog, already rejected
        try {
          const jsonStart = stdout.indexOf('{')
          const result = JSON.parse(stdout.slice(jsonStart))
          resolve(result)
        } catch (err) {
          reject(new Error(`Failed to parse Whisper output: ${err.message}\n${stdout.slice(-300)}`))
        }
      })
    })

    py.on('error', (err) => {
      settle(() => reject(new Error(`Failed to spawn Python (${PYTHON}): ${err.message}`)))
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
