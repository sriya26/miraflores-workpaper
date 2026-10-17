import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { buildIndex, loadPacket, Index } from './packet'
import { initStore } from './store'
import { Provider } from './ctx'
import { App } from './App'

function Boot() {
  const [ix, setIx] = useState<Index | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    initStore()
    loadPacket().then(p => setIx(buildIndex(p))).catch(e => setErr(String(e)))
  }, [])
  if (err) return <div className="empty">Could not load the packet: {err}</div>
  if (!ix) return <div className="empty" style={{ paddingTop: '30vh' }}>Loading the Okafor-Lindqvist packet…</div>
  return <Provider ix={ix}><App /></Provider>
}

createRoot(document.getElementById('root')!).render(<Boot />)
