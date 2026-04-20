import { spawn } from 'child_process'
import { join } from 'path'
import { readFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'

function getScriptsDir() {
  if (is.dev) return join(process.cwd(), 'resources', 'scripts')
  return join(process.resourcesPath, 'scripts')
}

export function extractText(filePath, format) {
  return new Promise((resolve, reject) => {
    if (format === 'txt' || format === 'md') {
      try {
        const text = readFileSync(filePath, 'utf8')
        resolve({ text, metadata: {} })
      } catch (err) {
        reject(err)
      }
      return
    }

    const scriptPath = join(getScriptsDir(), 'extract_text.py')
    const py = spawn('python3', [scriptPath, filePath, '--format', format])

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Text extraction failed (${format}): ${stderr.slice(-500)}`))
        return
      }
      try {
        const jsonStart = stdout.indexOf('{')
        const result = JSON.parse(stdout.slice(jsonStart))
        resolve(result)
      } catch (err) {
        reject(new Error(`Parse error from extract_text.py: ${err.message}`))
      }
    })

    py.on('error', (err) => {
      reject(new Error(`python3 not found: ${err.message}`))
    })
  })
}

export function getFileFormat(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  const formatMap = {
    pdf: 'pdf', epub: 'epub', docx: 'docx',
    odt: 'odt', txt: 'txt', md: 'md'
  }
  return formatMap[ext] || 'txt'
}
