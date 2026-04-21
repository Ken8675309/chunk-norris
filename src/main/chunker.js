const PYTHON = '/home/ken/chunk-norris/.venv/bin/python'

const MAX_WORDS_BEFORE_SPLIT = 350

// Split a single oversized chunk into pieces of at most MAX_WORDS_BEFORE_SPLIT words,
// breaking only at whitespace boundaries.
function hardSplit(chunk) {
  const words = chunk.split(/\s+/).filter(Boolean)
  if (words.length <= MAX_WORDS_BEFORE_SPLIT) return [chunk]
  const pieces = []
  for (let i = 0; i < words.length; i += MAX_WORDS_BEFORE_SPLIT) {
    pieces.push(words.slice(i, i + MAX_WORDS_BEFORE_SPLIT).join(' '))
  }
  return pieces
}

export function semanticChunk(text, chunkSize = 350, overlap = 80) {
  const sentences = splitIntoSentences(text)
  const chunks = []
  let currentWords = []
  let currentSentences = []

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean)

    if (currentWords.length + words.length > chunkSize && currentWords.length > 0) {
      chunks.push(currentSentences.join(' ').trim())

      // Overlap: keep last N words worth of sentences
      const overlapSentences = []
      let overlapCount = 0
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const w = currentSentences[i].split(/\s+/).filter(Boolean).length
        if (overlapCount + w <= overlap) {
          overlapSentences.unshift(currentSentences[i])
          overlapCount += w
        } else break
      }

      currentSentences = [...overlapSentences, sentence]
      currentWords = currentSentences.join(' ').split(/\s+/).filter(Boolean)
    } else {
      currentSentences.push(sentence)
      currentWords.push(...words)
    }
  }

  if (currentSentences.length > 0) {
    chunks.push(currentSentences.join(' ').trim())
  }

  return chunks.filter(c => c.length > 20)
}

function splitIntoSentences(text) {
  // Split on sentence boundaries while preserving them
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split(/(?<=[.!?])\s+(?=[A-Z"'])|(?<=\n\n)/)
    .map(s => s.trim())
    .filter(Boolean)
}

export async function embedText(text, model, ollamaHost, ollamaPort) {
  const base = `http://${ollamaHost}:${ollamaPort}`
  const res = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
    signal: AbortSignal.timeout(30000)
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Ollama embed error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error(`Invalid embedding response: ${JSON.stringify(data)}`)
  }
  return data.embedding
}

export async function embedChunks(chunks, model, ollamaHost, ollamaPort, onProgress) {
  const safe = chunks.flatMap(hardSplit)
  console.log(`[chunker] Embedding ${safe.length} chunks (model: ${model}, host: ${ollamaHost}:${ollamaPort})`)
  const results = []
  for (let i = 0; i < safe.length; i++) {
    try {
      const embedding = await embedText(safe[i], model, ollamaHost, ollamaPort)
      results.push({ text: safe[i], embedding })
    } catch (err) {
      console.error(`[chunker] Embed failed on chunk ${i}/${safe.length}: ${err.message}`)
      throw err
    }
    if (onProgress) onProgress(Math.round(((i + 1) / safe.length) * 100))
  }
  console.log(`[chunker] Embedded ${results.length}/${safe.length} chunks successfully`)
  return results
}
