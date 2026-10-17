import React, { useEffect, useMemo, useState } from 'react'
import { useCtx, blockers, findingState, signoffState } from './ctx'
import { Avatar, Badge, Popover, Modal } from './ui'
import { ROLE_LABEL } from './model'
import { AREAS } from './areas'
import { money, date, dateTime, ago } from './format'
import { resolve, maskText } from './refs'
import { Inspector } from './views/Inspector'
import { Overview } from './views/Overview'
import { AreaView } from './views/Area'
import { Documents, DocumentView } from './views/Documents'
import { Findings } from './views/Findings'
import { Changes } from './views/Changes'
import { Schedules } from './views/Schedules'
import { People } from './views/People'
import { Filing } from './views/Filing'
import { Firm } from './views/Firm'
import { TimelineView } from './views/Timeline'
import { ClientPortal } from './views/Client'
import { ExaminerView } from './views/Examiner'
import { remoteStatus } from './store'

export function App() {
  const ctx = useCtx()
  const { route, user } = ctx
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) }
      if (e.key === 'Escape') ctx.setInspect(null)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  if (user.role === 'client') return <Frame onSearch={() => {}} minimal><ClientPortal /></Frame>
  if (user.role === 'examiner') return <Frame onSearch={() => {}} minimal><ExaminerView /></Frame>

  const [path, query] = route.split('?')
  const q = new URLSearchParams(query || '')
  const parts = path.split('/').filter(Boolean)
  let view: React.ReactNode
  switch (parts[0]) {
    case undefined: view = <Overview />; break
    case 'area': view = <AreaView id={parts[1]} />; break
    case 'docs': view = <Documents />; break
    case 'doc': view = <DocumentView id={parts[1]} page={+(q.get('p') || 1)} hl={q.get('hl') || undefined} />; break
    case 'findings': view = <Findings focus={q.get('f') || undefined} />; break
    case 'changes': view = <Changes tab={q.get('t') || undefined} />; break
    case 'schedules': view = <Schedules tab={parts[1] || 'summary'} />; break
    case 'people': view = <People focus={q.get('n') || undefined} tab={q.get('t') || undefined} />; break
    case 'filing': view = <Filing />; break
    case 'firm': view = <Firm tab={q.get('t') || undefined} />; break
    case 'timeline': view = <TimelineView />; break
    default: view = <Overview />
  }
  return (
    <Frame onSearch={() => setSearchOpen(true)}>
      {view}
      {searchOpen && <Search onClose={() => setSearchOpen(false)} />}
    </Frame>
  )
}

function Frame({ children, onSearch, minimal }: { children: React.ReactNode; onSearch: () => void; minimal?: boolean }) {
  const ctx = useCtx()
  return (
    <div className="shell" style={minimal ? { gridTemplateColumns: '1fr' } : undefined}>
      <TopBar onSearch={onSearch} minimal={minimal} />
      {!minimal && <Sidebar />}
      <main className="main">
        {ctx.frozen && <FrozenBanner />}
        {children}
      </main>
      {ctx.inspect && <Inspector refId={ctx.inspect} />}
      <Toasts />
    </div>
  )
}

function FrozenBanner() {
  const ctx = useCtx()
  const f = ctx.s.filing.frozen!
  const am = ctx.s.filing.amendments.length
  return (
    <div className="frozen-banner">
      🔒 Return frozen at filing on {date(f.seasonAt)} by {ctx.userName(f.by)}. {am ? `Amendment ${am} in progress — changes are recorded on top of the filed return.` : 'Changes now require starting an amendment.'}
      <span className="spacer" />
      <a href="#/filing">Filing record →</a>
    </div>
  )
}

function TopBar({ onSearch, minimal }: { onSearch: () => void; minimal?: boolean }) {
  const ctx = useCtx()
  const { eff } = ctx
  const fed = eff.summary.federal.balance_due, ca = eff.summary.california.balance_due
  const engFed = ctx.vix.v.summary.federal.balance_due, engCa = ctx.vix.v.summary.california.balance_due
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>Okafor-Lindqvist<small>2025 · MFJ · CL-20417</small></div>
      </div>
      {!minimal && (
        <div className="search" onClick={onSearch}>
          <span className="s-ico">⌕</span>
          <input readOnly placeholder="Search lines, documents, values, notes…" />
          <span className="kbd" style={{ position: 'absolute', right: 8, top: 8 }}>⌘K</span>
        </div>
      )}
      <span className="spacer" />
      {ctx.user.role !== 'client' && ctx.user.role !== 'examiner' && (
        <div className="bottomline" onClick={() => ctx.go('/changes?t=compare')} title="Engine result vs workpaper result">
          <div><div className="lbl">Federal</div><div className="amt">{fed > 0 ? 'Owe ' : 'Refund '}{money(Math.abs(fed))}</div></div>
          <div><div className="lbl">California</div><div className="amt">{ca > 0 ? 'Owe ' : 'Refund '}{money(Math.abs(ca))}</div></div>
          {(fed !== engFed || ca !== engCa) && <Badge tone="violet" title="Engine numbers before workpaper adjustments">engine {ctx.vix.v.version}: {engFed > 0 ? 'owe' : 'refund'} {money(Math.abs(engFed))} / {engCa > 0 ? 'owe' : 'refund'} {money(Math.abs(engCa))}</Badge>}
        </div>
      )}
      {ctx.can('replay') && <ClockControl />}
      {!minimal && <Notifications />}
      <RoleSwitcher />
    </header>
  )
}

const CLOCK_MARKS = [
  { at: '2026-03-04T12:00:00Z', label: 'v1 computed' },
  { at: '2026-03-19T12:00:00Z', label: 'v2 (corrected 1099)' },
  { at: '2026-04-14T18:00:00Z', label: 'Extension day' },
  { at: '2026-06-23T12:00:00Z', label: 'v3 (late K-1)' },
  { at: '2026-07-08T15:00:00Z', label: 'Review week' },
  { at: '2026-07-13T18:00:00Z', label: 'E-file day' },
  { at: '2026-08-21T15:00:00Z', label: 'Refund issued' },
  { at: '2027-01-15T16:00:00Z', label: 'Next year starts' },
  { at: '2028-01-26T16:00:00Z', label: 'IRS letter' },
]

function ClockControl() {
  const ctx = useCtx()
  return (
    <Popover button={(_, t) => <div className="clock" onClick={t} title="Replay the season: the packet is shown as it stood on this date"><span>◷</span><b>{date(ctx.clock)}</b><span className="muted tiny">{ctx.vix.v.version}</span></div>}>
      {close => (
        <div style={{ padding: 12, width: 320 }}>
          <h4 className="mb8">Season clock</h4>
          <p className="small muted" style={{ marginTop: 0 }}>Documents, engine versions and agency events appear as they arrived. Your work is never hidden.</p>
          <div className="col gap4">
            {CLOCK_MARKS.map(m => (
              <button key={m.at} className={'nav-item' + (ctx.clock === m.at ? ' active' : '')} onClick={() => { ctx.setClock(m.at); close() }}>
                <span className="mono tiny" style={{ width: 86 }}>{m.at.slice(0, 10)}</span>{m.label}
              </button>
            ))}
          </div>
          <div className="divider" />
          <input type="datetime-local" value={ctx.clock.slice(0, 16)} onChange={e => e.target.value && ctx.setClock(new Date(e.target.value + ':00Z').toISOString())} style={{ width: '100%' }} />
        </div>
      )}
    </Popover>
  )
}

function RoleSwitcher() {
  const ctx = useCtx()
  const u = ctx.user
  return (
    <Popover button={(_, t) => (
      <button className="row" onClick={t} style={{ border: '1px solid var(--line)', background: 'var(--panel)', borderRadius: 99, padding: '3px 10px 3px 3px', cursor: 'pointer' }}>
        <Avatar id={u.id} name={u.name} />
        <span style={{ textAlign: 'left', lineHeight: 1.15 }}><b className="small">{u.name}</b><br /><span className="tiny muted">{ROLE_LABEL[u.role]}{u.credential ? ', ' + u.credential : ''}</span></span>
        <span className="muted">▾</span>
      </button>
    )}>
      {close => (
        <div style={{ padding: 8, width: 330 }}>
          <h4 style={{ margin: '4px 8px 8px' }}>Work as…</h4>
          {ctx.users.map(x => (
            <button key={x.id} className={'nav-item' + (x.id === u.id ? ' active' : '')} onClick={() => { ctx.setUserId(x.id); ctx.go(x.role === 'client' || x.role === 'examiner' ? '/' : ctx.route); close() }}>
              <Avatar id={x.id} name={x.name} size={22} />
              <span className="grow" style={{ lineHeight: 1.2 }}>{x.name}<br /><span className="tiny muted">{ROLE_LABEL[x.role]}{x.clearance ? '' : ' · no sensitive-data clearance'}</span></span>
            </button>
          ))}
          <p className="tiny muted" style={{ margin: '8px' }}>Permissions are enforced on every action, not just hidden in the UI.</p>
        </div>
      )}
    </Popover>
  )
}

export function feedFor(ctx: ReturnType<typeof useCtx>, since?: string, quiet = false) {
  const items: { at: string; who: string; text: string; go?: string; mine?: boolean }[] = []
  const batchSeen = new Map<string, number>()
  for (const e of ctx.s.events) {
    if (since && e.at <= since) continue
    if (e.type === 'seen' || e.type === 'access') continue
    if (quiet && (e.type === 'verify' || e.type === 'time' || e.type === 'disposition' || (e.type === 'note.create' && e.payload?.kind === 'variance'))) continue
    // collapse a batch (e.g. "apply selected fixes") into one line
    if (e.batch && batchSeen.has(e.batch) && e.type === 'adjust') {
      const it = items[batchSeen.get(e.batch)!]
      const n = (parseInt((it.text.match(/^(\d+) adjustments/) || [])[1]) || 1) + 1
      it.text = `${n} adjustments in one batch`
      continue
    }
    if (e.batch && e.type === 'adjust') batchSeen.set(e.batch, items.length)
    const p = e.payload || {}
    let text = ''
    let go: string | undefined
    switch (e.type) {
      case 'adjust': text = `adjusted ${p.lineKey} by ${money(p.delta)}: ${p.reason}`; go = '/changes'; break
      case 'adjust.revert': text = `reverted an adjustment`; go = '/changes'; break
      case 'adjust.approve': text = `approved an adjustment (${p.level})`; go = '/changes'; break
      case 'verify': text = `verified ${p.ref} (${String(p.type).replace(/_/g, ' ')})`; break
      case 'note.create': text = `${p.kind === 'review' ? 'raised a review note' : p.kind === 'client_question' ? 'asked the client' : 'wrote'}: ${p.subject}`; go = `/people?n=${p.id}`; break
      case 'note.reply': text = `replied on a thread`; go = `/people?n=${p.noteId}`; break
      case 'note.resolve': text = `resolved a note`; go = `/people?n=${p.noteId}`; break
      case 'signoff': text = `signed off ${p.area === '_return' ? 'the return' : p.area} as ${p.level}`; go = p.area === '_return' ? '/filing' : `/area/${p.area}`; break
      case 'signoff.revoke': text = `withdrew a sign-off`; break
      case 'decision': text = `recorded a ${p.kind.replace(/_/g, ' ')}: ${p.topic}`; break
      case 'disposition': text = `dispositioned ${p.docId}: ${p.status}`; go = `/doc/${p.docId}`; break
      case 'attach': text = `attached ${p.name}`; break
      case 'correct': text = `corrected ${p.ref} → ${p.value}`; break
      case 'finding.status': text = `marked finding ${p.checkId} ${p.status}`; go = `/findings?f=${p.checkId}`; break
      case 'filing.submit': text = `e-filed (${p.jurisdiction}): ${p.status}`; go = '/filing'; break
      case 'filing.approve': text = `approved the return and signed Form 8879`; go = '/filing'; break
      case 'filing.freeze': text = `froze the return at filing`; go = '/filing'; break
      case 'filing.extension': text = `filed the extension`; go = '/filing'; break
      case 'standards.update': text = `updated firm standards`; go = '/firm'; break
      case 'time': text = `logged ${p.hours}h on ${p.area}`; break
      default: text = e.type.replace(/\./g, ' ')
    }
    items.push({ at: e.at, who: e.actor, text, go, mine: e.actor === ctx.user.id })
  }
  return items.reverse()
}

function Notifications() {
  const ctx = useCtx()
  const since = ctx.s.seen.get(ctx.user.id)
  const feed = feedFor(ctx, since, true).filter(f => !f.mine)
  const mine = [...ctx.s.notes.values()].filter(n => n.status !== 'resolved' && (n.to === ctx.user.id || (n.to === ctx.user.role)))
  const count = feed.length + mine.length
  return (
    <Popover button={(_, t) => <button className="icon-btn" onClick={t} style={{ position: 'relative', fontSize: 17 }} title="What changed since I last looked">🔔{count > 0 && <span className="badge bad" style={{ position: 'absolute', top: -2, right: -6, padding: '0 5px', fontSize: 10 }}>{count}</span>}</button>}>
      {close => (
        <div style={{ width: 380, maxHeight: 460, overflowY: 'auto' }}>
          <div className="card-head"><h3 className="grow">Since you last looked</h3><button className="btn sm" onClick={() => { ctx.emit('seen', { at: new Date().toISOString() }); close() }}>Mark all seen</button></div>
          <div style={{ padding: '4px 14px 10px' }}>
            {mine.map(n => <div key={n.id} className="feed-item" style={{ cursor: 'pointer' }} onClick={() => { ctx.go(`/people?n=${n.id}`); close() }}><Badge tone="warn">for you</Badge><span className="grow">{n.subject}</span></div>)}
            {feed.slice(0, 30).map((f, i) => (
              <div key={i} className="feed-item" style={{ cursor: f.go ? 'pointer' : undefined }} onClick={() => { if (f.go) { ctx.go(f.go); close() } }}>
                <Avatar id={f.who} name={ctx.userName(f.who)} size={20} />
                <div className="grow"><b>{ctx.userName(f.who)}</b> {f.text}<div className="tiny muted">{ago(f.at)}</div></div>
              </div>
            ))}
            {!count && <div className="empty small">Nothing new since {since ? dateTime(since) : 'you started'}.</div>}
          </div>
        </div>
      )}
    </Popover>
  )
}

function Sidebar() {
  const ctx = useCtx()
  const path = ctx.route.split('?')[0]
  const openFindings = ctx.checks.filter(c => findingState(ctx, c).open).length
  const openNotes = [...ctx.s.notes.values()].filter(n => n.status !== 'resolved').length
  const bl = useMemo(() => blockers(ctx), [ctx.s, ctx.eff, ctx.checks])
  const Item = ({ to, ico, label, count, bad }: any) => (
    <a className={'nav-item' + (path === to || (to !== '/' && path.startsWith(to)) ? ' active' : '')} href={'#' + to}>
      <span className="ico">{ico}</span>{label}{count != null && count > 0 && <span className={'count' + (bad ? ' bad' : '')}>{count}</span>}
    </a>
  )
  return (
    <nav className="sidebar">
      <Item to="/" ico="◎" label="Overview" />
      <Item to="/findings" ico="⚑" label="Findings" count={openFindings} bad />
      <Item to="/filing" ico="✈" label="Review & filing" count={bl.length} />
      <div className="nav-sec">The return</div>
      {AREAS.map(a => {
        const st = signoffState(ctx, a.id) as any
        const open = ctx.checks.filter(c => c.area === a.id && findingState(ctx, c).open).length
        const tone = open ? 'bad' : st.reviewer.so && !st.reviewer.stale ? 'ok' : st.preparer.so && !st.preparer.stale ? 'info' : st.preparer.stale || st.reviewer.stale ? 'warn' : 'muted'
        return (
          <a key={a.id} className={'nav-item' + (path === `/area/${a.id}` ? ' active' : '')} href={`#/area/${a.id}`}>
            <span className="ico"><span className={`dot ${tone}`} /></span>{a.short}{open > 0 && <span className="count bad">{open}</span>}
          </a>
        )
      })}
      <div className="nav-sec">Evidence & detail</div>
      <Item to="/docs" ico="▤" label="Documents" />
      <Item to="/schedules" ico="▦" label="Schedules" />
      <Item to="/changes" ico="Δ" label="Adjustments & versions" count={[...ctx.s.adjustments.values()].filter(a => a.status === 'active').length} />
      <div className="nav-sec">People</div>
      <Item to="/people" ico="✎" label="Notes & questions" count={openNotes} />
      <Item to="/timeline" ico="◷" label="Season timeline" />
      <Item to="/firm" ico="⚙" label="Firm" />
      <div className="nav-sec">Sync</div>
      <div className="tiny muted" style={{ padding: '0 10px' }}>
        {remoteStatus() === 'on' ? '● Shared store connected — edits sync to everyone.' : '● Saved in this browser; open another tab to work side by side.'}
      </div>
    </nav>
  )
}

function Toasts() {
  const ctx = useCtx()
  return (
    <div className="toasts">
      {ctx.toasts.map(t => (
        <div key={t.id} className={'toast ' + (t.kind || '')}>
          <span className="grow">{t.text}</span>
          {t.undo && <button onClick={() => { t.undo!(); ctx.dismiss(t.id) }}>Undo</button>}
          <button onClick={() => ctx.dismiss(t.id)} style={{ border: 0 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

function Search({ onClose }: { onClose: () => void }) {
  const ctx = useCtx()
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const out: { ref?: string; go?: string; label: string; sub: string; kind: string }[] = []
    const numQ = t.replace(/[,$]/g, '')
    for (const l of ctx.vix.v.lines) {
      const v = ctx.eff.lines.get(l.key)?.value
      if (l.key.toLowerCase().includes(t) || l.label.toLowerCase().includes(t) || (numQ.length > 2 && String(v).includes(numQ))) out.push({ ref: l.key, label: l.label, sub: `${l.key} · ${typeof v === 'number' ? money(v) : v}`, kind: 'Line' })
    }
    for (const d of ctx.ix.p.documents) if (d.id.toLowerCase() === t || d.title.toLowerCase().includes(t) || d.issuer.toLowerCase().includes(t)) out.push({ go: `/doc/${d.id}`, label: d.title, sub: d.id, kind: 'Document' })
    for (const e of ctx.ix.p.extracted_values) {
      if (out.length > 120) break
      if (e.id === t || e.label.toLowerCase().includes(t) || (numQ.length > 2 && String(e.value).includes(numQ))) out.push({ ref: e.id, label: e.label, sub: `${e.id} · ${e.document_id} · ${maskText(String(e.value), ctx.ix)}`, kind: 'Value' })
    }
    for (const qa of ctx.ix.p.client.questionnaire) if ((qa.question + qa.answer).toLowerCase().includes(t)) out.push({ ref: qa.id, label: qa.question, sub: qa.answer, kind: 'Client answer' })
    for (const m of ctx.ix.p.client.messages) if (m.text.toLowerCase().includes(t)) out.push({ ref: m.id, label: m.text, sub: m.from, kind: 'Message' })
    for (const n of ctx.s.notes.values()) if ((n.subject + n.body).toLowerCase().includes(t)) out.push({ go: `/people?n=${n.id}`, label: n.subject, sub: n.body, kind: 'Note' })
    for (const c of ctx.checks) if ((c.title + c.summary).toLowerCase().includes(t)) out.push({ go: `/findings?f=${c.id}`, label: c.title, sub: c.area, kind: 'Finding' })
    return out.slice(0, 60)
  }, [q])
  return (
    <Modal title="Search the workpaper" onClose={onClose} wide>
      <input autoFocus placeholder="Try “1099-K”, “SchC.1”, “19,240”, “Theo”, “HVAC”…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', fontSize: 15, padding: 10 }} />
      <div style={{ maxHeight: '55vh', overflowY: 'auto', marginTop: 10 }}>
        {results.map((r, i) => (
          <div key={i} className="feed-item" style={{ cursor: 'pointer' }} onClick={() => { if (r.ref) ctx.setInspect(r.ref); if (r.go) ctx.go(r.go); onClose() }}>
            <Badge>{r.kind}</Badge>
            <div className="grow"><div className="ellipsis">{r.label}</div><div className="tiny muted ellipsis">{r.sub}</div></div>
          </div>
        ))}
        {q.length >= 2 && !results.length && <div className="empty">No matches.</div>}
      </div>
    </Modal>
  )
}
