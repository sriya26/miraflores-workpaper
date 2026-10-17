import React from 'react'
import { useCtx } from '../ctx'
import { Badge, Ref } from '../ui'
import { date } from '../format'

export function TimelineView() {
  const ctx = useCtx()
  const items: { at: string; kind: string; text: string; refs: string[]; actor?: string }[] = []
  for (const t of ctx.ix.p.timeline) items.push({ at: t.at, kind: t.event, text: (t.detail || t.event.replace(/_/g, ' ')), refs: (t.refs || []).filter((r: string) => !/^v\d$/.test(r)), actor: t.actor })
  for (const d of ctx.ix.p.documents) if (!ctx.ix.p.timeline.some(t => (t.refs || []).includes(d.id))) items.push({ at: d.received_at, kind: 'document_received', text: d.title, refs: [d.id] })
  for (const m of ctx.ix.p.client.messages) items.push({ at: m.sent_at, kind: 'client_message', text: `${m.from}: ${m.text}`, refs: [m.id] })
  for (const v of ctx.ix.p.return_versions) items.push({ at: v.computed_at, kind: 'return_computed', text: `Engine ${v.version}: ${v.trigger}`, refs: [] })
  items.sort((a, b) => (a.at < b.at ? -1 : 1))
  const dedup = items.filter((x, i) => !(x.kind === 'client_message' && items.some((y, j) => j !== i && y.kind === 'client_message' && y.refs[0] === x.refs[0] && j < i)))
  const first = +new Date('2026-01-01'), last = +new Date('2028-02-28')
  const pos = (at: string) => ((+new Date(at) - first) / (last - first)) * 100
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Season timeline</h1><p>Replay the season. Click any moment to set the clock: documents, engine versions and agency events appear as they arrived; your work is never hidden.</p></div><div className="clock">◷ <b>{date(ctx.clock)}</b></div></div>
      <div className="card pad mb16">
        <div className="timeline-track">
          {dedup.map((x, i) => <div key={i} className={'tick' + (x.at <= ctx.clock ? ' past' : '')} style={{ left: `${pos(x.at)}%`, height: x.kind === 'return_computed' ? 26 : 18, top: x.kind === 'return_computed' ? 4 : 8, background: x.kind === 'return_computed' ? 'var(--violet)' : undefined }} title={`${x.at.slice(0, 10)} ${x.text}`} onClick={() => ctx.setClock(x.at)} />)}
          <div className="now" style={{ left: `${pos(ctx.clock)}%` }} />
        </div>
        <div className="row tiny muted"><span>Jan 2026</span><span className="spacer" /><span>Oct 2026 (extended due)</span><span className="spacer" /><span>Jan 2028 (IRS letter)</span></div>
      </div>
      <div className="card">
        {dedup.map((x, i) => (
          <div key={i} className="feed-item" style={{ padding: '9px 16px', opacity: x.at <= ctx.clock ? 1 : 0.45 }}>
            <span className="mono tiny" style={{ width: 92 }}>{x.at.slice(0, 10)}</span>
            <Badge tone={x.kind === 'return_computed' ? 'violet' : x.kind.startsWith('efile_rejected') ? 'bad' : x.kind.startsWith('efile') ? 'ok' : x.kind === 'notice_received' ? 'warn' : 'muted'}>{x.kind.replace(/_/g, ' ')}</Badge>
            <span className="grow small">{x.text}{x.actor && <span className="muted"> — {ctx.userName(x.actor)}</span>}</span>
            <span className="row gap4">{x.refs.slice(0, 3).map(r => <Ref key={r} r={r} showKey={false} label={r} />)}</span>
            <button className="btn sm ghost" onClick={() => ctx.setClock(x.at)}>set clock</button>
          </div>
        ))}
      </div>
    </div>
  )
}
