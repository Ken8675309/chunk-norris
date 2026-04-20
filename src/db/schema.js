import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const DB_DIR = join(homedir(), 'chunk-norris')
const DB_PATH = join(DB_DIR, 'chunk-norris.sqlite')

let db = null

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDatabase() {
  mkdirSync(DB_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path   TEXT NOT NULL,
      file_name   TEXT NOT NULL,
      file_type   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'queued',
      progress    INTEGER DEFAULT 0,
      status_msg  TEXT DEFAULT '',
      error_msg   TEXT DEFAULT '',
      chunks_created INTEGER DEFAULT 0,
      visual_analysis INTEGER DEFAULT 1,
      pid         INTEGER DEFAULT NULL,
      date_added  TEXT NOT NULL DEFAULT (datetime('now')),
      date_completed TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      source_file TEXT NOT NULL UNIQUE,
      file_type   TEXT NOT NULL,
      format      TEXT,
      chunks      INTEGER DEFAULT 0,
      date_indexed TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migrations — safe to re-run (errors ignored)
  try { db.exec(`ALTER TABLE jobs ADD COLUMN pid INTEGER DEFAULT NULL`) } catch {}

  // Seed defaults
  const defaults = {
    whisper_model: 'large-v3',
    embedding_model: 'nomic-embed-text',
    vision_model: 'llava:13b',
    keyframe_interval: '45',
    chunk_size: '500',
    chunk_overlap: '80',
    visual_analysis_default: 'true',
    qdrant_host: 'localhost',
    qdrant_port: '6333',
    collection_name: 'knowledge_base',
    transcripts_path: join(homedir(), 'chunk-norris', 'transcripts'),
    keep_transcripts: 'true',
    delete_source_after_index: 'false',
    ollama_host: 'localhost',
    ollama_port: '11434'
  }

  const insert = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
  for (const [k, v] of Object.entries(defaults)) {
    insert.run(k, v)
  }

  return db
}
