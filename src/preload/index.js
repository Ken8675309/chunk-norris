import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Ingest
  addFiles: (options) => ipcRenderer.invoke('ingest:add-files', options),
  dropFiles: (filePaths, options) => ipcRenderer.invoke('ingest:drop-files', filePaths, options),

  // Queue
  listJobs: () => ipcRenderer.invoke('queue:list'),
  cancelJob: (id) => ipcRenderer.invoke('queue:cancel', id),
  retryJob: (id) => ipcRenderer.invoke('queue:retry', id),
  clearDoneJobs: () => ipcRenderer.invoke('queue:clear-done'),

  // Qdrant
  qdrantStatus: () => ipcRenderer.invoke('qdrant:status'),
  qdrantStats: () => ipcRenderer.invoke('qdrant:stats'),

  // Ollama
  ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
  ollamaModels: () => ipcRenderer.invoke('ollama:models'),

  // Library
  listDocuments: (page, limit) => ipcRenderer.invoke('library:list', page, limit),
  searchDocuments: (query) => ipcRenderer.invoke('library:search', query),
  deleteDocument: (sourceFile) => ipcRenderer.invoke('library:delete', sourceFile),

  // Diagnostics
  systemInfo: () => ipcRenderer.invoke('diagnostics:system-info')
})
