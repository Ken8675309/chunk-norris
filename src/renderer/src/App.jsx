import React, { useState, useEffect } from 'react'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import IngestTab from './components/IngestTab'
import QueueTab from './components/QueueTab'
import LibraryTab from './components/LibraryTab'
import ConfigTab from './components/ConfigTab'
import DiagnosticsTab from './components/DiagnosticsTab'
import './styles/app.css'

const TABS = ['ingest', 'queue', 'library', 'config', 'diagnostics']

export default function App() {
  const [activeTab, setActiveTab] = useState('ingest')
  const [services, setServices] = useState({ qdrant: false, ollama: false, openwebui: false })
  const [queueCount, setQueueCount] = useState(0)
  const [stats, setStats] = useState({ vectors: 0, documents: 0 })

  // Poll services every 5 seconds
  useEffect(() => {
    async function pollServices() {
      try {
        const [qRes, oRes] = await Promise.allSettled([
          window.api.qdrantStatus(),
          window.api.ollamaStatus()
        ])
        const qdrant  = qRes.status === 'fulfilled' ? qRes.value.running : false
        const ollama  = oRes.status === 'fulfilled' ? oRes.value.running : false

        let openwebui = false
        try {
          const r = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(2000) })
          openwebui = r.ok
        } catch {}

        setServices({ qdrant, ollama, openwebui })
      } catch {}
    }

    async function pollStats() {
      try {
        const qdrantStats = await window.api.qdrantStats()
        const libData = await window.api.listDocuments(0, 1)
        setStats({
          vectors: qdrantStats.totalVectors || 0,
          documents: libData.total || 0
        })
      } catch {}
    }

    async function pollQueue() {
      try {
        const jobs = await window.api.listJobs()
        const active = jobs.filter(j => j.status === 'queued' || j.status === 'processing').length
        setQueueCount(active)
      } catch {}
    }

    pollServices()
    pollStats()
    pollQueue()

    const svcInterval = setInterval(pollServices, 5000)
    const statsInterval = setInterval(pollStats, 10000)
    const queueInterval = setInterval(pollQueue, 2000)

    return () => {
      clearInterval(svcInterval)
      clearInterval(statsInterval)
      clearInterval(queueInterval)
    }
  }, [])

  const renderTab = () => {
    switch (activeTab) {
      case 'ingest':      return <IngestTab />
      case 'queue':       return <QueueTab />
      case 'library':     return <LibraryTab />
      case 'config':      return <ConfigTab />
      case 'diagnostics': return <DiagnosticsTab services={services} />
      default:            return null
    }
  }

  return (
    <div className="app-root">
      <Topbar services={services} />
      <div className="app-body">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          queueCount={queueCount}
          stats={stats}
        />
        <main className="app-main">
          {renderTab()}
        </main>
      </div>
    </div>
  )
}
