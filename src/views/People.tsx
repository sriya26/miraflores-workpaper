import React, { useEffect, useState } from 'react'
import { useCtx } from '../ctx'
import { Badge, Ref, Refs, Tabs, Who, Avatar, Empty } from '../ui'
import { NoteModal, AttachButton } from './Modals'
import { AttachmentRow } from './Inspector'
import { AREAS, BUDGET_LABEL } from '../areas'
import { date, ago } from '../format'
import { feedFor } from '../App'

export function People({ focus, tab: t0 }: { focus?: string; tab?: string }) {
  const ctx = useCtx()
  const [tab, setTab] = useState(t0 || 'notes')
  useEffect(() => { if (focus) setTab('notes') }, [focus])
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Notes, questions & assignments</h1><p>Questions to the client or colleagues become evidence when answered. Review notes can block filing.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'notes', label: 'Threads' }, { id: 'work', label: 'Assignments & deadlines' }, { id: 'time', label: 'Time vs budget' }, { id: 'log', label: 'Activity log' }]} />
      {tab === 'notes' && <Threads focus={focus} />}
      {tab === 'work' && <Work />}
      {tab === 'time' && <Time />}
      {tab === 'log' && <Log />}
    </div>
  )
}

function Threads({ focus }: { focus?: string }) {
  const ctx = useCtx()
  const [filter, setFilter] = useState('open')
  const [sel, setSel] = useState<string | undefined>(focus)
  const [newOpen, setNewOpen] = useState(false)
  useEffect(() => { if (focus) setSel(focus) }, [focus])
  const notes = [...ctx.s.notes.values()].sort((a, b) => (a.at < b.at ? 1 : -1))
  const list = notes.filter(n => filter === 'all' ? true : filter === 'open' ? n.status !== 'resolved' : filter === 'mine' ? n.to === ctx.user.id || n.by === ctx.user.id : filter === 'client' ? n.kind === 'client_question' : filter === 'blocking' ? n.blocking && n.status !== 'resolved' : true)
  const n = sel ? ctx.s.notes.get(sel) : list[0]
  return (
    <div className="grid" style={{ gridTemplateColumns: '360px minmax(0,1fr)' }}>
      <div className="card" style={{ alignSelf: 'start' }}>
        <div className="card-head">
          <select value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="blocking">Blocking filing</option><option value="mine">Mine</option><option value="client">Client questions</option><option value="all">All</option></select>
          <span className="spacer" />
          {(ctx.can('note') || ctx.can('question_client')) && <button className="btn sm primary" onClick={() => setNewOpen(true)}>+ New</button>}
        </div>
        {list.map(x => (
          <div key={x.id} className={'feed-item'} style={{ padding: '10px 14px', cursor: 'pointer', background: n?.id === x.id ? 'var(--accent-soft)' : undefined }} onClick={() => setSel(x.id)}>
            <Avatar id={x.by} name={ctx.userName(x.by)} size={22} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row"><b className="small ellipsis grow">{x.subject}</b>{x.blocking && x.status !== 'resolved' && <Badge tone="bad">blocks</Badge>}</div>
              <div className="tiny muted">{x.kind.replace('_', ' ')} · to {x.to === 'client' ? 'client' : x.to ? ctx.userName(x.to) : 'team'} · {ago(x.at)} · {x.replies.length} repl{x.replies.length === 1 ? 'y' : 'ies'}</div>
            </div>
            <Badge tone={x.status === 'resolved' ? 'ok' : x.status === 'answered' ? 'info' : 'warn'}>{x.status}</Badge>
          </div>
        ))}
        {!list.length && <Empty>No threads.</Empty>}
      </div>
      {n ? <Thread id={n.id} /> : <div className="card"><Empty>Select a thread.</Empty></div>}
      {newOpen && <NoteModal onClose={() => setNewOpen(false)} />}
    </div>
  )
}

export function Thread({ id, client }: { id: string; client?: boolean }) {
  const ctx = useCtx()
  const n = ctx.s.notes.get(id)!
  const [reply, setReply] = useState('')
  const [atts, setAtts] = useState<string[]>([])
  return (
    <div className="card">
      <div className="card-head">
        <div className="grow"><h3>{n.subject}</h3><div className="tiny muted">{n.kind.replace('_', ' ')} · {n.blocking ? 'blocks filing · ' : ''}{n.due ? `due ${date(n.due)} · ` : ''}to {n.to === 'client' ? 'the client' : n.to ? ctx.userName(n.to) : 'team'}</div></div>
        <Badge tone={n.status === 'resolved' ? 'ok' : n.status === 'answered' ? 'info' : 'warn'}>{n.status}</Badge>
      </div>
      <div className="card-body">
        <div className="feed-item"><Avatar id={n.by} name={ctx.userName(n.by)} /><div className="grow"><Who id={n.by} at={n.at} /><div className="mt8" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>{n.refs.length > 0 && !client && <div className="mt8"><Refs refs={n.refs.filter(r => !r.startsWith('area:'))} /></div>}</div></div>
        {n.replies.map(r => (
          <div key={r.id} className="feed-item"><Avatar id={r.by} name={ctx.userName(r.by)} /><div className="grow"><Who id={r.by} at={r.at} /><div className="mt8" style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>{r.attachments.map(a => <AttachmentRow key={a} id={a} />)}</div></div>
        ))}
        {n.resolvedBy && <div className="callout ok small mt8">Resolved by {ctx.userName(n.resolvedBy.by)}{n.resolvedBy.note ? `: ${n.resolvedBy.note}` : ''}</div>}
        {n.status !== 'resolved' && ctx.can('reply') && (
          <div className="mt12">
            <textarea placeholder={client ? 'Your answer' : 'Reply'} value={reply} onChange={e => setReply(e.target.value)} />
            {atts.length > 0 && <div className="mt8">{atts.map(a => <AttachmentRow key={a} id={a} />)}</div>}
            <div className="row mt8 wrap">
              <AttachButton refs={[id, ...n.refs]} label="Attach file" onDone={a => setAtts([...atts, a])} />
              <span className="spacer" />
              {!client && ctx.can('resolve_note') && <button className="btn" onClick={() => { ctx.emit('note.resolve', { noteId: id, note: reply }); setReply('') }}>Resolve{reply ? ' with comment' : ''}</button>}
              <button className="btn primary" disabled={!reply.trim() && !atts.length} onClick={() => { ctx.emit('note.reply', { noteId: id, body: reply, attachments: atts }, { action: 'reply' }); setReply(''); setAtts([]) }}>Send</button>
            </div>
            {n.kind === 'client_question' && !client && <div className="tiny muted mt8">The client's answer and uploads are attached to {n.refs.join(', ') || 'this thread'} as evidence.</div>}
          </div>
        )}
        {n.status === 'resolved' && !client && ctx.can('resolve_note') && <button className="btn sm ghost mt8" onClick={() => ctx.emit('note.reopen', { noteId: id })}>Reopen</button>}
      </div>
    </div>
  )
}

function Work() {
  const ctx = useCtx()
  const staff = ctx.users.filter(u => ['preparer', 'reviewer', 'partner'].includes(u.role))
  const start = ctx.ix.p.firm.assignment_at_start
  return (
    <div className="grid g-side">
      <div className="card">
        <div className="card-head"><h3 className="grow">Assignments</h3>{!ctx.can('assign') && <span className="small muted">reviewers, partners and the administrator can reassign</span>}</div>
        <table className="t">
          <thead><tr><th>Area</th><th>Preparer</th><th>Reviewer</th><th>Due</th></tr></thead>
          <tbody>
            {AREAS.map(a => {
              const as = ctx.s.assignments.get(a.id) || {}
              const sel = (field: 'preparer' | 'reviewer', def: string) => (
                <select disabled={!ctx.can('assign')} value={as[field] || def} onChange={e => ctx.emit('assign', { area: a.id, assignment: { [field]: e.target.value } }, { action: 'assign' })}>
                  {staff.filter(u => field === 'reviewer' ? u.role !== 'preparer' : true).map(u => <option key={u.id} value={u.id}>{u.name}{u.clearance ? '' : ' (masked)'}</option>)}
                </select>
              )
              return <tr key={a.id}><td>{a.name}</td><td>{sel('preparer', start.preparer)}</td><td>{sel('reviewer', start.reviewer)}</td><td><input type="date" disabled={!ctx.can('assign')} value={as.due || ''} onChange={e => ctx.emit('assign', { area: a.id, assignment: { due: e.target.value } }, { action: 'assign' })} /></td></tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="card pad">
        <h4 className="mb8">Deadlines</h4>
        {ctx.ix.p.firm.deadlines.map((d: any) => {
          const past = d.date < ctx.clock.slice(0, 10)
          return <div key={d.what} className="feed-item"><Badge tone={past ? 'muted' : 'warn'}>{date(d.date)}</Badge><span className="grow small" style={{ textDecoration: past ? 'line-through' : undefined }}>{d.what}</span></div>
        })}
      </div>
    </div>
  )
}

function Time() {
  const ctx = useCtx()
  const budget = ctx.ix.p.firm.budget_hours as Record<string, number>
  const byBudget = new Map<string, number>()
  for (const t of ctx.s.time) {
    const a = AREAS.find(x => x.id === t.area)
    const key = a?.budget || (t.area === '_partner' ? 'partner_review' : t.area)
    byBudget.set(key, (byBudget.get(key) || 0) + t.hours)
  }
  const totB = Object.values(budget).reduce((a, b) => a + b, 0)
  const totA = [...byBudget.values()].reduce((a, b) => a + b, 0)
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">Time against budget</h3><span className="small">{totA.toFixed(1)}h of {totB}h · fixed fee 4,800</span></div>
      <table className="t">
        <thead><tr><th>Budget area</th><th className="num">Budget</th><th className="num">Actual</th><th style={{ width: '40%' }}></th></tr></thead>
        <tbody>
          {Object.entries(budget).map(([k, b]) => { const a = byBudget.get(k) || 0; return <tr key={k}><td>{BUDGET_LABEL[k] || k}</td><td className="num">{b}h</td><td className="num">{a.toFixed(1)}h</td><td><div className="meter"><span className={a > b ? 'bad' : 'info'} style={{ width: `${Math.min(100, (a / b) * 100)}%` }} /></div></td></tr> })}
        </tbody>
      </table>
      {ctx.can('time') && <div className="row" style={{ padding: 12 }}><span className="small muted">Log partner review:</span><button className="btn sm" onClick={() => ctx.emit('time', { area: '_partner', hours: 0.5, note: 'partner review' }, { action: 'time' })}>+0.5h</button></div>}
    </div>
  )
}

function Log() {
  const ctx = useCtx()
  const feed = feedFor(ctx)
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">Everything that happened in the workpaper</h3><span className="small muted">{ctx.s.events.length} events · append-only</span></div>
      <div className="card-body">
        {feed.map((f, i) => <div key={i} className="feed-item" style={{ cursor: f.go ? 'pointer' : undefined }} onClick={() => f.go && ctx.go(f.go)}><Avatar id={f.who} name={ctx.userName(f.who)} size={22} /><div className="grow small"><b>{ctx.userName(f.who)}</b> {f.text}</div><span className="tiny muted nowrap">{new Date(f.at).toLocaleString()}</span></div>)}
        {!feed.length && <Empty>No activity yet.</Empty>}
      </div>
    </div>
  )
}
