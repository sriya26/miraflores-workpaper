import React, { useEffect, useMemo, useState } from 'react'
import { useCtx } from '../ctx'
import { Badge, Ref, Tabs, Sensitive, Empty } from '../ui'
import type { Doc, ExtractedValue } from '../packet'
import { maskText, isSensitiveType } from '../refs'
import { date, val } from '../format'
import { DocMeta, docUsage, VerifyControl, AttachmentRow } from './Inspector'
import { AttachButton } from './Modals'
import { AREAS } from '../areas'

// ----- Page source abstraction -----
// The viewer asks for a page source and draws highlight boxes in normalized page coordinates
// (fractions from the top-left, as the pipeline reports them). Today every page is simulated
// from printed_content; a real scan would return { kind: 'image' | 'pdf', url } and the same
// overlay boxes would land on it unchanged.
export type PageSource = { kind: 'simulated'; text: string } | { kind: 'image'; url: string } | { kind: 'pdf'; url: string; page: number }

export function pageSource(doc: Doc, page: number): PageSource {
  const p = doc.pages.find(x => x.page === page)
  return { kind: 'simulated', text: p ? p.printed_content : '' }
}

function highlightText(text: string, needle?: string) {
  if (!needle || needle.length < 2) return [text]
  const i = text.indexOf(needle)
  if (i < 0) return [text]
  return [text.slice(0, i), <mark key="m" className="textmatch">{needle}</mark>, text.slice(i + needle.length)]
}

type Group = { key: string; cols: string[]; rows: Map<string, Map<string, ExtractedValue>> }

function layoutFields(evs: ExtractedValue[]) {
  const sorted = [...evs].sort((a, b) => a.position.y0 - b.position.y0 || a.position.x0 - b.position.x0)
  const byPrefix = new Map<string, ExtractedValue[]>()
  for (const e of sorted) {
    const m = e.field.match(/^([A-Za-z]+[-]?\d+)_(.+)$/)
    if (m) { if (!byPrefix.has(m[1])) byPrefix.set(m[1], []); byPrefix.get(m[1])!.push(e) }
  }
  const grouped = new Set<string>()
  let table: Group | null = null
  if (byPrefix.size >= 3) {
    const cols: string[] = []
    const rows = new Map<string, Map<string, ExtractedValue>>()
    const order = [...byPrefix.keys()].sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0))
    for (const k of order) {
      const r = new Map<string, ExtractedValue>()
      for (const e of byPrefix.get(k)!) { const c = e.field.slice(k.length + 1); if (!cols.includes(c)) cols.push(c); r.set(c, e); grouped.add(e.id) }
      rows.set(k, r)
    }
    table = { key: 'lots', cols, rows }
  }
  return { fields: sorted.filter(e => !grouped.has(e.id)), table }
}

export function DocPage({ doc, page, hl, small, onPick, reveal, mode = 'form' }: { doc: Doc; page: number; hl?: string; small?: boolean; onPick?: (id: string) => void; reveal?: boolean; mode?: 'form' | 'positions' }) {
  const ctx = useCtx()
  const src = pageSource(doc, page)
  const evs = (ctx.ix.evsByDoc.get(doc.id) || []).filter(e => e.page === page)
  const text = src.kind === 'simulated' ? (reveal ? src.text : maskText(src.text, ctx.ix)) : ''
  const show = (e: ExtractedValue) => {
    const t = e.text_as_read === '' ? '(blank)' : e.text_as_read
    return isSensitiveType(e.value_type) && !reveal ? maskText(t, ctx.ix) : t
  }
  const pick = (id: string) => (onPick ? onPick(id) : ctx.setInspect(id))
  const cls = (e: ExtractedValue) => 'fcell' + (e.id === hl ? ' on' : '') + (e.confidence < 0.8 ? ' low' : '')
  const { fields, table } = useMemo(() => layoutFields(evs), [doc.id, page])
  useEffect(() => { if (hl && !small) document.getElementById('fc-' + hl)?.scrollIntoView({ block: 'nearest' }) }, [hl, page])
  const corrected = (e: ExtractedValue) => ctx.s.corrections.get(e.id)
  if (mode === 'positions' || !evs.length) {
    // Overlay mode: what a real scan would look like - the printed page with each extracted value
    // boxed at the pipeline's reported coordinates.
    return (
      <div className="docpage" style={small ? { fontSize: 10 } : undefined}>
        <div className="doc-hdr"><span>{doc.issuer}</span><span>{doc.file_name}</span></div>
        {doc.marked_corrected && <div className="stamp">CORRECTED</div>}
        <div className="paper" style={{ fontSize: small ? 9 : text.length > 1400 ? 10.5 : 12.5, lineHeight: 1.55, overflowY: 'auto' }}>{highlightText(text, hl && ctx.ix.evs.get(hl) && !isSensitiveType(ctx.ix.evs.get(hl)!.value_type) ? ctx.ix.evs.get(hl)!.text_as_read : undefined)}</div>
        {evs.map(e => (
          <div key={e.id} className={'hlbox' + (e.id === hl ? ' on' : '') + (e.confidence < 0.8 ? ' low' : '')} title={`${e.label}: ${show(e)}`} onClick={() => pick(e.id)}
            style={{ left: `${e.position.x0 * 100}%`, top: `${e.position.y0 * 100}%`, width: `${(e.position.x1 - e.position.x0) * 100}%`, height: `${(e.position.y1 - e.position.y0) * 100}%`, opacity: hl && e.id !== hl ? 0.3 : 1 }}>
            {e.id === hl && !small && <span className="tag">{e.field}</span>}
          </div>
        ))}
        <div className="doc-ftr"><span>{doc.id} · {evs.length ? 'positions as reported by the pipeline' : 'not extracted — printed text'}</span><span>page {page} of {doc.page_count}</span></div>
      </div>
    )
  }
  return (
    <div className="docpage form" style={small ? { fontSize: 10 } : undefined}>
      <div className="doc-hdr"><span>{doc.issuer}</span><span>{doc.file_name}</span></div>
      {doc.marked_corrected && <div className="stamp">CORRECTED</div>}
      <div className="formbody">
        <div className="ftitle">{doc.title}</div>
        <div className="fgrid">
          {fields.map(e => (
            <div key={e.id} id={'fc-' + e.id} className={cls(e)} onClick={() => pick(e.id)} title={`${e.field} · ${Math.round(e.confidence * 100)}%`}>
              <div className="flabel">{e.label}</div>
              <div className="fval">{show(e)}{corrected(e) && <span className="fcorr"> → {String(corrected(e)!.value)}</span>}</div>
              {e.id === hl && !small && <span className="tag">{e.field}</span>}
            </div>
          ))}
        </div>
        {table && (
          <table className="ftable">
            <thead><tr><th></th>{table.cols.map(c => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
            <tbody>
              {[...table.rows.entries()].map(([k, r]) => (
                <tr key={k}>
                  <td className="fk">{k}</td>
                  {table.cols.map(c => { const e = r.get(c); return <td key={c}>{e ? <span id={'fc-' + e.id} className={cls(e)} onClick={() => pick(e.id)}>{show(e)}{e.id === hl && !small && <span className="tag">{e.field}</span>}</span> : ''}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="doc-ftr"><span>{doc.id} · simulated from packet data</span><span>page {page} of {doc.page_count}</span></div>
    </div>
  )
}

export function Transcript({ doc, page, hl, reveal }: { doc: Doc; page: number; hl?: string; reveal?: boolean }) {
  const ctx = useCtx()
  const src = pageSource(doc, page)
  if (src.kind !== 'simulated') return null
  const focus = hl ? ctx.ix.evs.get(hl) : undefined
  const text = reveal ? src.text : maskText(src.text, ctx.ix)
  return (
    <div className="card pad mt12">
      <h4 className="mb8">Printed on this page (transcript){focus && !isSensitiveType(focus.value_type) && text.includes(focus.text_as_read) ? ' — selected value highlighted' : ''}</h4>
      <div style={{ font: '13px/1.6 Georgia, serif', whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto' }}>{highlightText(text, focus && !isSensitiveType(focus.value_type) ? focus.text_as_read : undefined)}</div>
    </div>
  )
}

export function DocumentView({ id, page, hl }: { id: string; page: number; hl?: string }) {
  const ctx = useCtx()
  const doc = ctx.ix.docs.get(id)
  const [pick, setPick] = useState<string | undefined>(hl)
  const [reveal, setReveal] = useState(false)
  const [filter, setFilter] = useState('')
  const [mode, setMode] = useState<'form' | 'positions'>('form')
  if (!doc) return <div className="page"><Empty>No document {id}</Empty></div>
  const notYet = doc.received_at > ctx.clock
  const pg = Math.min(Math.max(1, page), doc.page_count)
  const evs = (ctx.ix.evsByDoc.get(id) || []).filter(e => e.page === pg)
  const focusId = pick && evs.some(e => e.id === pick) ? pick : hl
  const setPage = (p: number) => ctx.go(`/doc/${id}?p=${p}`)
  const shown = evs.filter(e => !filter || (e.label + e.field + String(e.value)).toLowerCase().includes(filter.toLowerCase()))
  const atts = [...ctx.s.attachments.values()].filter(a => a.refs.includes(id))
  const hasSensitive = doc.pages.some(p => maskText(p.printed_content, ctx.ix) !== p.printed_content)
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div className="grow">
          <div className="small muted"><a href="#/docs">Documents</a> / {doc.id}</div>
          <h1>{doc.title}</h1>
          <p>{doc.issuer} · received {date(doc.received_at)} · {doc.page_count} page{doc.page_count > 1 ? 's' : ''} · extraction {doc.extraction.status}</p>
        </div>
        {notYet && <Badge tone="warn">not yet received at {date(ctx.clock)}</Badge>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px', alignItems: 'start' }}>
        <div>
          <div className="row mb12">
            <button className="btn sm" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>‹ Prev</button>
            <select value={pg} onChange={e => setPage(+e.target.value)}>{doc.pages.map(p => <option key={p.page} value={p.page}>Page {p.page}</option>)}</select>
            <button className="btn sm" disabled={pg >= doc.page_count} onClick={() => setPage(pg + 1)}>Next ›</button>
            <span className="spacer" />
            {evs.length > 0 && <div className="pill-toggle" title="Form: the page rebuilt from extracted fields. Positions: the printed text with each value boxed where the pipeline reported it — how a real scan would be overlaid."><button className={mode === 'form' ? 'on' : ''} onClick={() => setMode('form')}>Form</button><button className={mode === 'positions' ? 'on' : ''} onClick={() => setMode('positions')}>Positions</button></div>}
            {hasSensitive && (ctx.can('view_sensitive')
              ? <button className="btn sm" onClick={() => { if (!reveal) ctx.emit('access', { ref: id, what: `unmasked document page ${pg}` }); setReveal(!reveal) }}>{reveal ? 'Mask sensitive data' : '👁 Unmask (logged)'}</button>
              : <Badge tone="muted">sensitive data masked</Badge>)}
          </div>
          {ctx.checks.filter(c => c.status === 'fail' && (c.evidence.some(r => r.startsWith(`doc:${id}#page`)) ? c.evidence.includes(`doc:${id}#page${pg}`) : c.evidence.some(r => r === id || evs.some(e => e.id === r)))).map(c => (
            <div key={c.id} className="callout bad small mb12 row"><span className="grow"><b>Finding on this page:</b> {c.title}</span><a href={`#/findings?f=${c.id}`}>Open →</a></div>
          ))}
          <DocPage doc={doc} page={pg} hl={focusId} onPick={setPick} reveal={reveal} mode={mode} />
          {evs.length > 0 && <Transcript doc={doc} page={pg} hl={focusId} reveal={reveal} />}
          {doc.extraction.status !== 'extracted' && <div className="callout warn small mt12">Pipeline: {doc.extraction.reason || doc.extraction.status}</div>}
        </div>
        <div className="col gap12" style={{ position: 'sticky', top: 12 }}>
          <div className="card">
            <div className="card-head"><h3 className="grow">Values on this page</h3><span className="muted small">{evs.length}</span></div>
            {evs.length > 8 && <div style={{ padding: '8px 12px 0' }}><input placeholder="Filter values" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '100%' }} /></div>}
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {shown.slice(0, 200).map(e => <EvRow key={e.id} e={e} on={e.id === focusId} onClick={() => setPick(e.id)} />)}
              {!evs.length && <div className="empty small">No values extracted from this page{doc.extraction.status === 'partial' ? ' — page not read by the pipeline' : ''}.</div>}
            </div>
          </div>
          {focusId && <FocusCard id={focusId} />}
          <div className="card pad"><DocMeta id={id} /><div className="sect"><h4>Attachments & notes</h4>{atts.map(a => <AttachmentRow key={a.id} id={a.id} />)}{ctx.can('attach') && <div className="row gap4 wrap"><AttachButton refs={[id]} /></div>}</div></div>
        </div>
      </div>
    </div>
  )
}

function EvRow({ e, on, onClick }: { e: ExtractedValue; on: boolean; onClick: () => void }) {
  const ctx = useCtx()
  const lines = ctx.vix.citedBy.get(e.id) || []
  const v = ctx.s.verifications.get(e.id)
  const corr = ctx.s.corrections.get(e.id)
  return (
    <div className="lrow" style={{ gridTemplateColumns: '1fr auto auto', background: on ? 'var(--accent-soft)' : undefined }} onClick={onClick}>
      <div style={{ minWidth: 0 }}>
        <div className="ellipsis small">{e.label}</div>
        <div className="tiny muted">{lines.length ? `→ ${lines.slice(0, 3).join(', ')}${lines.length > 3 ? '…' : ''}` : 'not on any line'}</div>
      </div>
      <div className="num small" style={{ fontWeight: 600 }}>{isSensitiveType(e.value_type) ? maskText(String(e.value), ctx.ix) : val(corr ? corr.value : e.value)}{corr && <span className="badge violet" style={{ marginLeft: 4 }}>fixed</span>}</div>
      <div className="row gap4">{e.confidence < 0.9 && <Badge tone="bad">{Math.round(e.confidence * 100)}%</Badge>}{v && <Badge tone="ok">✓</Badge>}</div>
    </div>
  )
}

function FocusCard({ id }: { id: string }) {
  const ctx = useCtx()
  const e = ctx.ix.evs.get(id)!
  const lines = ctx.vix.citedBy.get(id) || []
  return (
    <div className="card pad">
      <div className="row"><h3 className="grow">{e.label}</h3><button className="btn sm ghost" onClick={() => ctx.setInspect(id)}>Inspect ›</button></div>
      <div className="kv mt8 small">
        <div>Value</div><div><b>{isSensitiveType(e.value_type) ? <Sensitive text={String(e.value)} refName={id} /> : val(e.value)}</b></div>
        <div>Read as</div><div>“{isSensitiveType(e.value_type) ? maskText(e.text_as_read, ctx.ix) : e.text_as_read}”</div>
        <div>Field</div><div className="mono">{e.field}</div>
        <div>Confidence</div><div>{Math.round(e.confidence * 100)}%</div>
      </div>
      <div className="mt8 row wrap gap4">{lines.map(k => <Ref key={k} r={k} />)}{!lines.length && <span className="small muted">Not used on the return.</span>}</div>
      <div className="mt8"><VerifyControl r={id} value={e.value} /></div>
    </div>
  )
}

export function Documents() {
  const ctx = useCtx()
  const [tab, setTab] = useState('all')
  const [area, setArea] = useState('')
  const rows = useMemo(() => ctx.ix.p.documents.map(d => {
    const u = docUsage(ctx, d.id)
    const evs = u.evs
    const verified = evs.filter(e => ctx.s.verifications.has(e.id)).length
    let status: { label: string; tone: string }
    if (d.received_at > ctx.clock) status = { label: 'not yet received', tone: 'muted' }
    else if (u.superseded) status = { label: 'superseded', tone: 'muted' }
    else if (u.lines.length) status = { label: `on ${u.lines.length} line${u.lines.length > 1 ? 's' : ''}`, tone: 'ok' }
    else if (u.disp) status = { label: u.disp.status.replace(/_/g, ' '), tone: 'info' }
    else status = { label: 'not on any line', tone: 'warn' }
    const areaId = ctx.docAreas.get(d.id) || ''
    return { d, u, verified, status, areaId }
  }), [ctx.s, ctx.vix, ctx.clock, ctx.checks])
  const filtered = rows.filter(r => (!area || r.areaId === area) && (
    tab === 'all' ? true :
    tab === 'open' ? r.status.tone === 'warn' :
    tab === 'findings' ? r.u.checks.some(c => c.status !== 'pass') :
    tab === 'late' ? r.d.received_at > '2026-03-02T22:15:00Z' : true))
  const received = rows.filter(r => r.d.received_at <= ctx.clock)
  const landed = received.filter(r => r.status.tone === 'ok').length
  const disp = received.filter(r => r.status.tone === 'info' || r.status.label === 'superseded').length
  const open = received.filter(r => r.status.tone === 'warn').length
  const workAtts = [...ctx.s.attachments.values()]
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>Documents</h1><p>Every document and where it landed on the return — or why it didn't.</p></div>
      </div>
      <p className="ink2 mb16" style={{ marginTop: -8 }}>
        {received.length} of {rows.length} received · <b style={{ color: 'var(--ok)' }}>{landed} on the return</b> · {disp} accounted for with a reason · {open ? <b style={{ color: 'var(--warn)' }}>{open} need a reason</b> : 'none unaccounted for'}
      </p>
      <div className="row mb8">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: `Not accounted for (${open})` }, { id: 'findings', label: 'With open findings' }, { id: 'late', label: 'Arrived late' }]} />
        <span className="spacer" />
        <select value={area} onChange={e => setArea(e.target.value)}><option value="">All areas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}</select>
      </div>
      <div className="card">
        <table className="t">
          <thead><tr><th>Doc</th><th>Title</th><th>Received</th><th>Read</th><th>Where it landed</th><th className="num">Verified</th><th></th></tr></thead>
          <tbody>
            {filtered.map(({ d, u, verified, status }) => (
              <tr key={d.id} className="click" onClick={() => ctx.go(`/doc/${d.id}`)} style={{ opacity: d.received_at > ctx.clock ? 0.45 : 1 }}>
                <td className="mono">{d.id}</td>
                <td>{d.title}</td>
                <td className="nowrap small">{date(d.received_at)}</td>
                <td className="small" style={{ color: d.extraction.status === 'extracted' ? 'var(--ink-3)' : 'var(--warn)' }}>{d.extraction.status === 'extracted' ? `${d.extraction.values} value${d.extraction.values === 1 ? '' : 's'}` : d.extraction.status.replace('_', ' ')}</td>
                <td className="small"><span style={{ color: status.tone === 'ok' ? 'var(--ink-2)' : status.tone === 'warn' ? 'var(--warn)' : 'var(--ink-3)' }}>{status.label}</span>{u.disp && <div className="tiny muted ellipsis" style={{ maxWidth: 240 }}>{u.disp.reason}</div>}</td>
                <td className="num small">{u.evs.length ? `${verified}/${u.evs.length}` : '—'}</td>
                <td>{u.checks.some(c => c.status !== 'pass') && <span className="mark bad" title={u.checks.filter(c => c.status !== 'pass').map(c => c.title).join('\n')} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {workAtts.length > 0 && (
        <div className="card mt16">
          <div className="card-head"><h3>Evidence added in the workpaper</h3></div>
          <div className="card-body">{workAtts.map(a => <div key={a.id} className="row"><div className="grow"><AttachmentRow id={a.id} /></div><span className="row gap4">{a.refs.map(r => <Ref key={r} r={r} />)}</span></div>)}</div>
        </div>
      )}
    </div>
  )
}
