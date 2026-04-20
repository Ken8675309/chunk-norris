# CHUNK NORRIS
### Knowledge Ingestion System — LCARS Edition

> "Chuck Norris doesn't search the web. The web searches Chuck Norris."
> Chunk Norris roundhouse kicks your files into a vector database.

A cross-platform Electron + React desktop app that processes audio, video, and documents into a Qdrant vector database for RAG pipelines. Built with a Star Trek LCARS aesthetic.

---

## FEATURES

- **Audio ingestion** — Whisper large-v3 transcription → semantic chunking → vector embedding
- **Video ingestion** — Audio transcription + optional LLaVA keyframe visual analysis
- **Document ingestion** — PDF, EPUB, DOCX, ODT, TXT, Markdown
- **Qdrant auto-start** — Launches Docker container automatically if Qdrant isn't running
- **Local SQLite queue** — Persistent job queue with retry/cancel, survives restarts
- **Live status bar** — Polls Qdrant, Ollama, Open WebUI every 5 seconds
- **LCARS dark theme** — Star Trek computer terminal aesthetic throughout

---

## PREREQUISITES

### 1. Docker (for Qdrant auto-start)

**Linux:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in
```

**macOS:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

**Windows:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Ollama

Install from [ollama.ai](https://ollama.ai):

```bash
# Linux/macOS
curl -fsSL https://ollama.ai/install.sh | sh

# Pull required models
ollama pull nomic-embed-text   # Embeddings (768d)
ollama pull llava:13b          # Vision (for video keyframes)
```

### 3. Python 3.8+

Python 3.8 or newer is required. Install dependencies:

```bash
pip3 install faster-whisper pymupdf ebooklib beautifulsoup4 python-docx odfpy qdrant-client

# Or use the bundled setup script:
python3 resources/scripts/setup_deps.py
```

### 4. ffmpeg (for audio/video processing)

**Linux:**
```bash
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

---

## INSTALLATION & RUNNING

### Development

```bash
# Install Node dependencies
npm install

# Start in dev mode (hot reload)
npm run dev
```

### Packaged App

```bash
# Build for current platform
npm run package

# Platform-specific
npm run package:linux   # AppImage + .deb
npm run package:win     # NSIS installer
npm run package:mac     # .dmg
```

Packaged apps are in the `dist/` directory.

---

## FIRST RUN

1. Launch the app — it will attempt to start Qdrant via Docker automatically
2. Check the **DIAGNOSTICS** tab to verify all services are online
3. If Qdrant/Ollama show red, follow the setup steps above
4. Drop files on the **INGEST** tab to start processing

The `knowledge_base` collection in Qdrant is created automatically (768 dimensions, cosine distance) on first run.

---

## DATA DIRECTORIES

All data is stored under `~/chunk-norris/`:

```
~/chunk-norris/
├── chunk-norris.sqlite      # Job queue + settings
├── transcripts/             # Saved audio/video transcripts
└── qdrant_storage/          # Qdrant vector data (Docker volume)
```

---

## CONNECTING OPEN WEBUI TO QDRANT

Open WebUI can query your Qdrant knowledge base directly.

1. Install Open WebUI:
   ```bash
   docker run -d -p 3000:8080 \
     -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
     -v open-webui:/app/backend/data \
     --name open-webui \
     ghcr.io/open-webui/open-webui:main
   ```

2. In Open WebUI → Settings → Documents → Vector Database:
   - Set **Qdrant URL**: `http://localhost:6333`
   - Set **Collection**: `knowledge_base`

3. Enable RAG in your chat sessions to query the indexed knowledge base.

---

## PIPELINE DETAILS

### Audio Pipeline
```
File → faster-whisper → transcript → semantic chunks → nomic-embed-text → Qdrant
```
Metadata stored: `title, source_file, type, duration, chunk_index, chunk_total, timestamp, date_added`

### Video Pipeline
```
File → ffmpeg (audio extract) → faster-whisper → transcript
     → ffmpeg (keyframes) → LLaVA vision → descriptions
     → merge → semantic chunks → embed → Qdrant
```

### Document Pipeline
```
PDF    → pymupdf → text
EPUB   → ebooklib + bs4 → text
DOCX   → python-docx → text
ODT    → odfpy → text
TXT/MD → direct read
       → semantic chunks → embed → Qdrant
```

---

## CONFIGURATION

All settings are saved in the local SQLite database and editable in the **CONFIG** tab:

| Setting | Default | Description |
|---------|---------|-------------|
| `whisper_model` | `large-v3` | Whisper model size |
| `embedding_model` | `nomic-embed-text` | Ollama embedding model |
| `vision_model` | `llava:13b` | LLaVA model for keyframes |
| `keyframe_interval` | `45` | Seconds between video keyframes |
| `chunk_size` | `500` | Words per chunk |
| `chunk_overlap` | `80` | Overlap words between chunks |
| `qdrant_host` | `localhost` | Qdrant host |
| `qdrant_port` | `6333` | Qdrant port |
| `collection_name` | `knowledge_base` | Qdrant collection |
| `ollama_host` | `localhost` | Ollama host |
| `ollama_port` | `11434` | Ollama port |

---

## TECH STACK

- **Electron** — Cross-platform desktop shell
- **React + Vite** — Renderer UI (no framework, pure CSS)
- **electron-vite** — Build tooling
- **electron-builder** — Packaging (AppImage, deb, NSIS, dmg)
- **better-sqlite3** — Local job queue and settings
- **Python** — faster-whisper, pymupdf, ebooklib, python-docx, odfpy
- **Qdrant** — Vector database (auto-started via Docker)
- **Ollama** — Local LLM inference (embeddings + vision)

---

## THEME COLORS

```css
--cn-bg:      #0a0e1a   /* Deep space background */
--cn-panel:   #0d1220   /* Panel background */
--cn-border:  #1a3a5c   /* Panel borders */
--cn-accent:  #00b4d8   /* Cyan — primary accent */
--cn-accent2: #7b2fff   /* Purple — secondary accent */
--cn-green:   #00ff9f   /* Glowing stats */
--cn-amber:   #ffb703   /* Warnings / stardate */
--cn-red:     #ff4d6d   /* Errors / danger */
```

---

*CHUNK NORRIS does not endorse or facilitate unauthorized access to systems. All processing is local. No data leaves your machine.*
