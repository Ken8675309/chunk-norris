import { exec, execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getSettings } from '../db/queries.js'

const STORAGE_PATH = join(homedir(), 'chunk-norris', 'qdrant_storage')

export async function checkQdrant() {
  mkdirSync(STORAGE_PATH, { recursive: true })
  const running = await isQdrantRunning()
  if (!running) {
    await startQdrantDocker()
  } else {
    await ensureCollection()
  }
}

export async function isQdrantRunning() {
  try {
    const s = getSettings()
    const res = await fetch(`http://${s.qdrant_host}:${s.qdrant_port}/healthz`, {
      signal: AbortSignal.timeout(3000)
    })
    return res.ok
  } catch {
    return false
  }
}

async function startQdrantDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' })
  } catch {
    console.error('[qdrant] Docker not found — cannot auto-start Qdrant')
    return
  }

  const s = getSettings()

  try {
    execSync('docker inspect qdrant --format="{{.State.Status}}"', { stdio: 'ignore' })
    exec('docker start qdrant', (err) => {
      if (err) console.error('[qdrant] Failed to start existing container:', err.message)
      else setTimeout(() => ensureCollection(), 3000)
    })
  } catch {
    const cmd = [
      'docker run -d --name qdrant',
      `-p ${s.qdrant_port}:6333 -p 6334:6334`,
      `-v "${STORAGE_PATH}:/qdrant/storage"`,
      'qdrant/qdrant'
    ].join(' ')

    exec(cmd, (err) => {
      if (err) console.error('[qdrant] Failed to start Qdrant container:', err.message)
      else setTimeout(() => ensureCollection(), 5000)
    })
  }
}

export async function ensureCollection() {
  try {
    const s = getSettings()
    const base = `http://${s.qdrant_host}:${s.qdrant_port}`
    const colName = s.collection_name

    const checkRes = await fetch(`${base}/collections/${colName}`, {
      signal: AbortSignal.timeout(5000)
    })

    if (checkRes.status === 404) {
      await fetch(`${base}/collections/${colName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vectors: { size: 768, distance: 'Cosine' } }),
        signal: AbortSignal.timeout(10000)
      })
      console.log(`[qdrant] Created collection: ${colName}`)
    }
  } catch (err) {
    console.error('[qdrant] ensureCollection error:', err.message)
  }
}

export async function getQdrantStats() {
  try {
    const s = getSettings()
    const base = `http://${s.qdrant_host}:${s.qdrant_port}`

    const colRes = await fetch(`${base}/collections`, { signal: AbortSignal.timeout(5000) })
    const colData = await colRes.json()

    const stats = { collections: [], totalVectors: 0, status: 'green' }

    for (const col of (colData.result?.collections || [])) {
      const infoRes = await fetch(`${base}/collections/${col.name}`, {
        signal: AbortSignal.timeout(5000)
      })
      const info = await infoRes.json()
      const count = info.result?.points_count ?? info.result?.vectors_count ?? 0
      stats.collections.push({ name: col.name, vectors: count })
      stats.totalVectors += count
    }

    return stats
  } catch (err) {
    return { collections: [], totalVectors: 0, status: 'red', error: err.message }
  }
}

export async function upsertVectors(points) {
  const s = getSettings()
  const base = `http://${s.qdrant_host}:${s.qdrant_port}`

  await ensureCollection()
  console.log(`[qdrant] Upserting ${points.length} vectors to collection '${s.collection_name}'`)

  const res = await fetch(`${base}/collections/${s.collection_name}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(60000)
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[qdrant] Upsert failed: ${res.status} ${body}`)
    throw new Error(`Qdrant upsert failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  console.log(`[qdrant] Upsert result: ${JSON.stringify(data.result)}`)
  return data
}

export async function deleteBySourceFile(sourceFile) {
  const s = getSettings()
  const base = `http://${s.qdrant_host}:${s.qdrant_port}`

  await fetch(`${base}/collections/${s.collection_name}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: {
        must: [{ key: 'source_file', match: { value: sourceFile } }]
      }
    }),
    signal: AbortSignal.timeout(10000)
  })
}
