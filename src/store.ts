// Event log persistence and sync.
//  - Every act is appended to the log (localStorage) and broadcast to other tabs.
//  - If the deployment has a shared store (/api/events backed by Upstash/Vercel KV), events are
//    pushed there and pulled every few seconds so several people work on one file at once.
//  - Logs merge by event id (append-only, so merges never conflict); order is by time then id.

import type { WPEvent } from './model'

const KEY = 'wp.okafor-lindqvist-2025.events.v1'
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('wp-sync') : null

type Listener = (events: WPEvent[]) => void
let events: WPEvent[] = []
const listeners = new Set<Listener>()
let remote: 'unknown' | 'on' | 'off' = 'unknown'
let pending: WPEvent[] = []

function sortEvents(list: WPEvent[]) {
  list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1))
  list.forEach((e, i) => (e.seq = i + 1))
  return list
}

function load(): WPEvent[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(events))
  } catch (e) {
    console.warn('Could not persist events', e)
  }
}

function emit() {
  for (const l of listeners) l(events)
}

function merge(incoming: WPEvent[]): boolean {
  const ids = new Set(events.map(e => e.id))
  const add = incoming.filter(e => !ids.has(e.id))
  if (!add.length) return false
  events = sortEvents([...events, ...add])
  save()
  return true
}

export function initStore() {
  events = sortEvents(load())
  chan?.addEventListener('message', ev => {
    const msg = ev.data
    if (msg?.type === 'events' && merge(msg.events)) emit()
    if (msg?.type === 'reset') { events = []; save(); emit() }
  })
  window.addEventListener('storage', e => {
    if (e.key === KEY) { events = sortEvents(load()); emit() }
  })
  probeRemote()
}

async function probeRemote() {
  try {
    const r = await fetch('/api/events?since=0')
    if (!r.ok) throw new Error(String(r.status))
    const data = await r.json()
    if (!data.enabled) { remote = 'off'; return }
    remote = 'on'
    const local = events.slice()
    if (merge(data.events || [])) emit()
    // push anything we have that the server doesn't
    const serverIds = new Set((data.events || []).map((e: WPEvent) => e.id))
    const missing = local.filter(e => !serverIds.has(e.id))
    if (missing.length) await push(missing)
    setInterval(pull, 4000)
  } catch {
    remote = 'off'
  }
}

async function pull() {
  try {
    const r = await fetch('/api/events?since=0')
    const data = await r.json()
    if (data.reset && events.length && !(data.events || []).length) { events = []; save(); emit(); return }
    if (merge(data.events || [])) emit()
  } catch { /* offline: keep working locally */ }
}

async function push(list: WPEvent[]) {
  if (remote !== 'on') return
  pending.push(...list)
  const batch = pending
  pending = []
  try {
    await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: batch }) })
  } catch {
    pending.unshift(...batch)
  }
}

export function remoteStatus() { return remote }

export function getEvents() { return events }

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function append(list: WPEvent[]) {
  if (!list.length) return
  merge(list)
  chan?.postMessage({ type: 'events', events: list })
  push(list)
  emit()
}

export async function resetAll() {
  events = []
  save()
  chan?.postMessage({ type: 'reset' })
  if (remote === 'on') { try { await fetch('/api/events', { method: 'DELETE' }) } catch { /* ignore */ } }
  emit()
}

export function exportLog(): string {
  return JSON.stringify({ format: 'miraflores-workpaper-events', version: 1, exported: new Date().toISOString(), events }, null, 2)
}

export function importLog(json: string) {
  const data = JSON.parse(json)
  const list: WPEvent[] = data.events || data
  append(list)
}
