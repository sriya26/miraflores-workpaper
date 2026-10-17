import React, { useEffect, useRef, useState } from 'react'
import { useCtx } from './ctx'
import { resolve, KIND_ICON, maskText } from './refs'
import { initials, money, signed } from './format'

const AV_COLORS = ['#2f5bd3', '#6b3fd1', '#1d7a4a', '#b45309', '#be185d', '#0e7490', '#475569', '#7c2d12']
export function Avatar({ id, name, size = 26 }: { id: string; name: string; size?: number }) {
  const i = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length
  return <span className="avatar" title={name} style={{ background: AV_COLORS[i], width: size, height: size, fontSize: size * 0.42 }}>{initials(name)}</span>
}

export function Badge({ tone = '', children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>
}

export function Ref({ r, label, showKey = true }: { r: string; label?: string; showKey?: boolean }) {
  const ctx = useCtx()
  const info = resolve(ctx.ix, r, ctx.s, ctx.vix.lines)
  const text = label || info.label
  const masked = maskText(text, ctx.ix)
  return (
    <span className="chip" onClick={e => { e.stopPropagation(); ctx.setInspect(r) }} title={info.sub ? `${info.label}\n${info.sub}` : info.label}>
      <span className="ico">{KIND_ICON[info.kind]}</span>
      {showKey && <span className="k">{r.length > 28 ? r.slice(0, 26) + '…' : r}</span>}
      <span className="ellipsis" style={{ maxWidth: 220 }}>{masked}</span>
    </span>
  )
}

export function Refs({ refs, max = 8 }: { refs: string[]; max?: number }) {
  const [all, setAll] = useState(false)
  const list = all ? refs : refs.slice(0, max)
  return (
    <span className="row wrap gap4">
      {list.map(r => <Ref key={r} r={r} />)}
      {refs.length > max && !all && <button className="btn sm ghost" onClick={() => setAll(true)}>+{refs.length - max} more</button>}
    </span>
  )
}

export function Money({ v, cents, className = '' }: { v: any; cents?: boolean; className?: string }) {
  return <span className={'num ' + className}>{money(v, { cents })}</span>
}

// Line changes are shown neutrally (a lower expense is not "good" or "bad" by itself); pass
// tax to color a change in tax or balance due (red = costs the client more).
export function Delta({ v, cents = false, tax = false }: { v: number; cents?: boolean; tax?: boolean }) {
  if (!v) return <span className="muted">—</span>
  if (!tax) return <span className="num" style={{ color: 'var(--violet)' }}>{signed(v, cents)}</span>
  return <span className={'num ' + (v > 0 ? 'delta-pos' : 'delta-neg')}>{signed(v, cents)}</span>
}

export function Modal({ title, onClose, children, foot, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { width: 'min(900px, 96vw)' } : undefined}>
        <div className="modal-head"><h2 className="grow">{title}</h2><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{hint && <div className="hint">{hint}</div>}</div>
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: React.ReactNode }[]; value: string; onChange: (id: string) => void }) {
  return <div className="tabs">{tabs.map(t => <button key={t.id} className={'tab' + (t.id === value ? ' active' : '')} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
}

export function Meter({ parts }: { parts: { v: number; tone: string }[] }) {
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1
  return <div className="meter">{parts.map((p, i) => <span key={i} className={p.tone} style={{ width: `${(p.v / tot) * 100}%` }} />)}</div>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Popover({ button, children, align = 'right' }: { button: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {button(open, () => setOpen(o => !o))}
      {open && <div className="pop" style={align === 'left' ? { left: 0, right: 'auto' } : undefined}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function Who({ id, at }: { id: string; at?: string }) {
  const ctx = useCtx()
  return (
    <span className="row gap4 small ink2"><Avatar id={id} name={ctx.userName(id)} size={18} />{ctx.userName(id)}{at && <span className="muted">· {new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}</span>
  )
}

// Sensitive values are masked for everyone by default. Cleared staff can reveal them; every
// reveal is written to the access log (firm rule). Staff without clearance cannot reveal.
export function Sensitive({ text, refName }: { text: string; refName: string }) {
  const ctx = useCtx()
  const [shown, setShown] = useState(false)
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(false), 30000); return () => clearTimeout(t) }, [shown])
  const masked = maskText(text, ctx.ix)
  if (masked === text) return <>{text}</>
  return (
    <span className="row gap4" style={{ display: 'inline-flex' }}>
      <span className="mono">{shown ? text : masked}</span>
      {ctx.can('view_sensitive')
        ? !shown && <button className="btn sm ghost" title="Reveal (logged)" onClick={() => { ctx.emit('access', { ref: refName, what: 'revealed sensitive value' }); setShown(true) }}>👁 reveal</button>
        : <span className="badge muted" title="No sensitive-data clearance">masked</span>}
    </span>
  )
}

export function statusTone(st: string) {
  return st === 'pass' ? 'ok' : st === 'judgment' ? 'warn' : st === 'fail' ? 'bad' : 'muted'
}
