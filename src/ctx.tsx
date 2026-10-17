import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import type { Index, VersionIndex } from './packet'
import { versionAt } from './packet'
import type { State, User, WPEvent } from './model'
import { reduce, can, usersFrom } from './model'
import { computeEffective, Effective } from './effective'
import { runChecks, varianceFlags, CheckResult } from './checks'
import { append, getEvents, subscribe } from './store'
import { AREAS, areaOfLine } from './areas'
import { hash, uid } from './format'

export interface Toast { id: string; text: string; kind?: 'ok' | 'error' | 'info'; undo?: () => void }

export interface Ctx {
  ix: Index
  s: State
  vix: VersionIndex
  eff: Effective
  checks: CheckResult[]
  variances: ReturnType<typeof varianceFlags>
  users: User[]
  user: User
  setUserId: (id: string) => void
  clock: string
  setClock: (c: string) => void
  route: string
  go: (r: string) => void
  inspect: string | null
  setInspect: (r: string | null) => void
  emit: (type: string, payload: any, opts?: { action?: string; batch?: string; quiet?: boolean }) => WPEvent | null
  emitMany: (list: { type: string; payload: any }[], opts?: { action?: string; batch?: string }) => WPEvent[]
  toast: (t: Omit<Toast, 'id'>) => void
  toasts: Toast[]
  dismiss: (id: string) => void
  can: (action: string) => boolean
  frozen: boolean
  userName: (id: string) => string
}

const C = createContext<Ctx>(null as any)
export const useCtx = () => useContext(C)

const DEFAULT_CLOCK = '2026-07-08T15:00:00Z'

function readHash() {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function Provider({ ix, children }: { ix: Index; children: React.ReactNode }) {
  const [events, setEvents] = useState<WPEvent[]>(() => getEvents().slice())
  const users = useMemo(() => usersFrom(ix), [ix])
  const [userId, setUserIdRaw] = useState<string>(() => localStorage.getItem('wp.user') || 'st-01')
  const [clock, setClockRaw] = useState<string>(() => localStorage.getItem('wp.clock') || DEFAULT_CLOCK)
  const [route, setRoute] = useState(readHash())
  const [inspect, setInspect] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => { const un = subscribe(ev => setEvents(ev.slice())); return () => { un() } }, [])
  useEffect(() => {
    const f = () => setRoute(readHash())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const user = users.find(u => u.id === userId) || users[0]
  const setUserId = (id: string) => { localStorage.setItem('wp.user', id); setUserIdRaw(id); setInspect(null) }
  const setClock = (c: string) => { localStorage.setItem('wp.clock', c); setClockRaw(c) }
  const go = (r: string) => { window.location.hash = r }

  const s = useMemo(() => reduce(ix, events), [ix, events])
  const vix = useMemo(() => versionAt(ix, clock), [ix, clock])
  const eff = useMemo(() => computeEffective(ix, vix, s), [ix, vix, s])
  const checks = useMemo(() => runChecks(ix, s, eff, clock), [ix, s, eff, clock])
  const variances = useMemo(() => varianceFlags(ix, eff, s.standards), [ix, eff, s.standards])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('t')
    setToasts(ts => [...ts.slice(-3), { ...t, id }])
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), t.undo ? 9000 : 4500)
  }, [])

  const mk = (type: string, payload: any, batch?: string): WPEvent => ({
    id: uid('ev'), type, actor: user.id, at: new Date().toISOString(), seasonAt: clock, batch, payload,
  })

  const emit: Ctx['emit'] = (type, payload, opts = {}) => {
    if (opts.action && !can(user, opts.action)) {
      toast({ text: `${user.name} (${user.role.replace(/_/g, ' ')}) is not allowed to do that.`, kind: 'error' })
      return null
    }
    const e = mk(type, payload, opts.batch)
    append([e])
    return e
  }
  const emitMany: Ctx['emitMany'] = (list, opts = {}) => {
    if (opts.action && !can(user, opts.action)) {
      toast({ text: `${user.name} is not allowed to do that.`, kind: 'error' })
      return []
    }
    const batch = opts.batch || uid('b')
    const evs = list.map((x, i) => ({ ...mk(x.type, x.payload, batch), at: new Date(Date.now() + i).toISOString() }))
    append(evs)
    return evs
  }

  const userName = (id: string) => users.find(u => u.id === id)?.name || id

  const value: Ctx = {
    ix, s, vix, eff, checks, variances, users, user, setUserId, clock, setClock, route, go, inspect, setInspect,
    emit, emitMany, toast, toasts, dismiss: id => setToasts(ts => ts.filter(x => x.id !== id)),
    can: a => can(user, a), frozen: !!s.filing.frozen, userName,
  }
  ;(window as any).__wp = value // handy for scripted demos and tests
  return <C.Provider value={value}>{children}</C.Provider>
}

// ---------- Derived helpers used across views ----------

export function areaLines(ctx: Ctx, areaId: string): string[] {
  return ctx.vix.order.filter(k => areaOfLine(k) === areaId && !/^F8949\.[A-K]\.(X|M|N|C)\d/.test(k))
}

export function areaFingerprint(ctx: Ctx, areaId: string) {
  const keys = ctx.vix.order.filter(k => areaOfLine(k) === areaId)
  const lines: Record<string, any> = {}
  for (const k of keys) lines[k] = ctx.eff.lines.get(k)?.value
  const adjs = [...ctx.s.adjustments.values()].filter(a => areaOfLine(a.lineKey) === areaId && a.status === 'active' && !a.rejected).map(a => `${a.id}:${a.delta}`).sort()
  const findings: Record<string, string> = {}
  for (const c of ctx.checks.filter(c => c.area === areaId)) findings[c.id] = c.status
  const snapshot = { version: ctx.vix.v.version, lines, adjustments: adjs, findings }
  return { fingerprint: hash(JSON.stringify(snapshot)), snapshot }
}

export function signoffState(ctx: Ctx, areaId: string) {
  const fp = areaFingerprint(ctx, areaId)
  const levels = ['preparer', 'reviewer', 'partner'] as const
  const out: Record<string, { so?: any; stale: boolean; changes: string[] }> = {}
  for (const lv of levels) {
    const so = [...ctx.s.signoffs].reverse().find(x => x.area === areaId && x.level === lv && !x.revoked)
    let changes: string[] = []
    if (so && so.fingerprint !== fp.fingerprint) {
      const a = so.snapshot || {}, b = fp.snapshot
      if (a.version !== b.version) changes.push(`engine recomputed ${a.version} → ${b.version}`)
      for (const k of Object.keys(b.lines)) if (a.lines && a.lines[k] !== b.lines[k] && typeof b.lines[k] === 'number') changes.push(`${k}: ${a.lines[k] ?? '—'} → ${b.lines[k]}`)
      const aa = new Set<string>(a.adjustments || []), bb = new Set<string>(b.adjustments)
      for (const x of bb) if (!aa.has(x)) changes.push(`new adjustment ${String(x).split(':')[0]}`)
      for (const x of aa) if (!bb.has(x)) changes.push(`adjustment removed ${String(x).split(':')[0]}`)
      for (const [k, v] of Object.entries(b.findings)) if (a.findings && a.findings[k] !== v) changes.push(`finding ${k}: ${a.findings[k] || 'new'} → ${v}`)
      if (!changes.length) changes = ['content changed']
    }
    out[lv] = { so, stale: !!so && so.fingerprint !== fp.fingerprint, changes }
  }
  return { ...out, fp }
}

export function findingState(ctx: Ctx, c: CheckResult) {
  const st = ctx.s.findingStatus.get(c.id)
  if (c.status === 'pass') return { label: 'Resolved', tone: 'ok', open: false }
  if (st?.status === 'accepted') return { label: 'Accepted as is', tone: 'muted', open: false }
  if (st?.status === 'not_applicable') return { label: 'Not applicable', tone: 'muted', open: false }
  if (c.status === 'judgment') return { label: 'Needs judgment', tone: 'warn', open: true }
  return { label: 'Open', tone: 'bad', open: true }
}

export function blockers(ctx: Ctx) {
  const out: { kind: string; text: string; go?: string; ref?: string }[] = []
  for (const c of ctx.checks) {
    const st = findingState(ctx, c)
    if (st.open) out.push({ kind: 'finding', text: c.title, go: `/findings?f=${c.id}` })
  }
  for (const n of ctx.s.notes.values()) if (n.blocking && n.status !== 'resolved') out.push({ kind: 'review note', text: n.subject, go: `/people?n=${n.id}` })
  for (const v of ctx.variances) {
    const explained = [...ctx.s.notes.values()].some(n => n.kind === 'variance' && n.refs.includes(v.key))
    if (!explained) out.push({ kind: 'variance', text: `Unexplained change vs 2024: ${v.label}`, go: '/schedules/summary', ref: v.key })
  }
  for (const a of ctx.s.adjustments.values()) {
    if (a.status !== 'active' || a.rejected) continue
    const e = ctx.eff.effects.get(a.id)
    const big = e && (Math.abs(e.fed) > 1000 || Math.abs(e.ca) > 1000)
    if (big && !a.approvals.some(x => x.level === 'partner')) out.push({ kind: 'approval', text: `Partner approval needed: ${a.lineKey} (${a.reason.slice(0, 60)}…)`, go: '/changes' })
  }
  for (const ar of AREAS) {
    const so = signoffState(ctx, ar.id)
    for (const lv of ['preparer', 'reviewer'] as const) {
      const x = (so as any)[lv]
      if (!x.so) out.push({ kind: 'sign-off', text: `${ar.short}: ${lv} sign-off missing`, go: `/area/${ar.id}` })
      else if (x.stale) out.push({ kind: 'sign-off', text: `${ar.short}: ${lv} sign-off reopened (${x.changes.length} change${x.changes.length > 1 ? 's' : ''})`, go: `/area/${ar.id}` })
    }
  }
  const partner = [...ctx.s.signoffs].reverse().find(x => x.area === '_return' && x.level === 'partner' && !x.revoked)
  if (!partner) out.push({ kind: 'sign-off', text: 'Partner sign-off on the return', go: '/filing' })
  return out
}
