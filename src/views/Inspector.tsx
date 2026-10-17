import React, { useState } from 'react'
import { useCtx, Ctx } from '../ctx'
import { Badge, Ref, Refs, Who, Delta, Sensitive, Empty } from '../ui'
import { resolve, maskText, isSensitiveType } from '../refs'
import { money, val, date, signed, pct, uid } from '../format'
import { areaOfLine, AREA_BY_ID } from '../areas'
import { AdjustModal, NoteModal, AttachButton } from './Modals'
import { DocPage } from './Documents'
import { findingState } from '../ctx'

export function Inspector({ refId }: { refId: string }) {
  const ctx = useCtx()
  const info = resolve(ctx.ix, refId, ctx.s, ctx.vix.lines)
  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tiny muted mono">{refId}</div>
          <h2 style={{ marginTop: 2 }}>{maskText(info.label, ctx.ix)}</h2>
          {info.sub && info.kind !== 'line' && <div className="small ink2 mt8">{maskText(info.sub, ctx.ix)}</div>}
        </div>
        <button className="icon-btn" onClick={() => ctx.setInspect(null)} title="Close (Esc)">✕</button>
      </div>
      <div className="drawer-body">
        {info.kind === 'line' && <LineInspector k={refId} />}
        {info.kind === 'value' && <ValueInspector id={refId} />}
        {(info.kind === 'document' || info.kind === 'page') && <DocInspector id={info.docId!} page={info.page} />}
        {!['line', 'value', 'document', 'page'].includes(info.kind) && <GenericInspector r={refId} />}
      </div>
    </aside>
  )
}

function LineInspector({ k }: { k: string }) {
  const ctx = useCtx()
  const line = ctx.vix.lines.get(k)
  const le = ctx.eff.lines.get(k)
  const [adj, setAdj] = useState(false)
  const [note, setNote] = useState(false)
  if (!line) return <Empty>Line {k} is not in {ctx.vix.v.version}.</Empty>
  const rule = ctx.ix.p.engine_reference.rules[line.rule]
  const prior = ctx.ix.priorLines[k]
  const adjs = [...ctx.s.adjustments.values()].filter(a => a.lineKey === k)
  const via = (le?.via || []).map(id => ctx.s.adjustments.get(id)!).filter(Boolean)
  const footing = ctx.vix.footing.get(k)
  const findings = ctx.checks.filter(c => c.lines.includes(k))
  const area = AREA_BY_ID.get(areaOfLine(k))
  const history = [...ctx.ix.versions.values()].map(v => ({ v: v.v.version, at: v.v.computed_at, val: v.lines.get(k)?.value }))
  const vr = ctx.variances.find(v => v.key === k)
  return (
    <>
      <div className="row gap12 wrap">
        <div className="stat"><div className="lbl">Engine {ctx.vix.v.version}</div><div className="big">{val(line.value)}</div></div>
        {le && le.delta !== 0 && <><div className="muted" style={{ fontSize: 20 }}>→</div><div className="stat"><div className="lbl">Workpaper</div><div className="big" style={{ color: 'var(--violet)' }}>{val(le.value)}</div></div><div className="stat"><div className="lbl">Change</div><div className="big"><Delta v={le.delta} /></div></div></>}
        <span className="spacer" />
        <div className="col" style={{ alignItems: 'flex-end' }}>
          <Badge tone={line.jurisdiction === 'federal' ? 'info' : 'violet'}>{line.jurisdiction}</Badge>
          {area && <a className="small" href={`#/area/${area.id}`}>{area.short} →</a>}
        </div>
      </div>
      {le?.stale && <div className="callout warn mt12 small">An input changed through a non-linear rule ({line.rule}). The engine must recompute this line; the tax effect is carried by the adjustment's rate estimate.</div>}
      {line.note && <div className="callout mt12 small">Engine note: {line.note}</div>}
      <div className="row mt12 wrap gap4">
        {ctx.can('adjust') && typeof line.value === 'number' && <button className="btn primary sm" onClick={() => setAdj(true)}>Δ Adjust</button>}
        {ctx.can('note') && <button className="btn sm" onClick={() => setNote(true)}>✎ Note / question</button>}
        <VerifyControl r={k} value={le?.value} />
      </div>

      <div className="sect">
        <h4>How it was built</h4>
        <div className="small"><span className="mono">{line.rule}</span> — {rule}</div>
        {footing && (
          <div className="small mt8">{footing.ok ? <Badge tone="ok">✓ re-footed</Badge> : <Badge tone="warn">inputs incomplete</Badge>} <span className="muted">independent sum of listed inputs = {money(footing.computed)}</span></div>
        )}
        {(line.inputs || []).length > 0 && <div className="mt8"><Formula k={k} depth={0} /></div>}
      </div>

      {(line.sources || []).length > 0 && (
        <div className="sect">
          <h4>Came from</h4>
          <div className="col gap4">
            {line.sources!.map(src => <SourceRow key={src} r={src} />)}
          </div>
        </div>
      )}

      {(adjs.length > 0 || via.length > 0) && (
        <div className="sect">
          <h4>What was done to it</h4>
          {adjs.map(a => <AdjustmentCard key={a.id} id={a.id} />)}
          {via.length > 0 && <div className="small muted mt8">Also changed by flow-through from: {via.map(a => <Ref key={a.id} r={a.lineKey} />)}</div>}
        </div>
      )}

      <div className="sect">
        <h4>Across versions and years</h4>
        <table className="t small">
          <tbody>
            <tr><td>2024 as filed</td><td className="num">{prior != null ? val(prior) : '—'}</td><td className="muted">{prior != null ? <Ref r={`py:/return_2024/lines/${k.replace(/\//g, '~1')}`} label="prior return" showKey={false} /> : 'not on 2024 return'}</td></tr>
            {history.map(h => <tr key={h.v}><td>{h.v} · {date(h.at)}</td><td className="num">{val(h.val)}</td><td>{h.v === ctx.vix.v.version ? <Badge tone="info">current</Badge> : ''}</td></tr>)}
          </tbody>
        </table>
        {vr && <div className="callout warn small mt8">Change vs 2024: {signed(vr.change)} ({pct(vr.pct)}). Firm standard flags changes over {ctx.s.standards.variance_review.flag_if_change_over_percent}% and {money(ctx.s.standards.variance_review.and_over_amount)}. <VarianceExplain k={k} /></div>}
      </div>

      {findings.length > 0 && (
        <div className="sect">
          <h4>Findings on this line</h4>
          {findings.map(c => { const st = findingState(ctx, c); return <div key={c.id} className="row small" style={{ padding: '4px 0' }}><span className={`dot ${st.tone}`} /><a href={`#/findings?f=${c.id}`} className="grow">{c.title}</a><Badge tone={st.tone}>{st.label}</Badge></div> })}
        </div>
      )}

      <RelatedNotes r={k} />
      <LinksBox r={k} />
      <EvidenceBox r={k} />
      {adj && <AdjustModal lineKey={k} onClose={() => setAdj(false)} />}
      {note && <NoteModal onClose={() => setNote(false)} preset={{ refs: [k], subject: `${k} ${line.label}` }} />}
    </>
  )
}

function Formula({ k, depth, sign = 1 }: { k: string; depth: number; sign?: number }) {
  const ctx = useCtx()
  const line = ctx.vix.lines.get(k)
  const f = ctx.vix.footing.get(k)
  const [open, setOpen] = useState(depth < 1)
  if (!line) return null
  const ins = line.inputs || []
  const le = ctx.eff.lines.get(k)
  return (
    <div>
      <div className="fnode">
        {ins.length ? <button className="toggle" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button> : <span style={{ width: 16 }} />}
        {depth > 0 && <span className="op">{sign < 0 ? '−' : '+'}</span>}
        <a onClick={() => ctx.setInspect(k)} style={{ cursor: 'pointer' }} className="ellipsis"><span className="mono tiny muted">{k}</span> {line.label}</a>
        <span className="v">{val(le?.value ?? line.value)}{le && le.delta ? <span className="tiny" style={{ color: 'var(--violet)' }}> ({signed(le.delta)})</span> : ''}</span>
      </div>
      {open && ins.length > 0 && (
        <div className="ftree">
          {ins.slice(0, 40).map((x, i) => <Formula key={x} k={x} depth={depth + 1} sign={f ? f.signs[i] : 1} />)}
          {ins.length > 40 && <div className="small muted">+{ins.length - 40} more inputs (see Schedules → Sales)</div>}
          {!f && <div className="tiny muted">Non-linear rule — combined by {line.rule}</div>}
          {(line.sources || []).length > 0 && depth > 0 && <div className="row wrap gap4" style={{ padding: '2px 0 4px 24px' }}>{line.sources!.slice(0, 4).map(s => <Ref key={s} r={s} />)}</div>}
        </div>
      )}
    </div>
  )
}

function SourceRow({ r }: { r: string }) {
  const ctx = useCtx()
  const info = resolve(ctx.ix, r, ctx.s)
  if (info.kind === 'value') {
    const e = ctx.ix.evs.get(r)!
    const corr = ctx.s.corrections.get(r)
    const v = ctx.s.verifications.get(r)
    return (
      <div className="row small" style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 8 }}>
        <span className="grow" style={{ minWidth: 0 }}>
          <a onClick={() => ctx.go(`/doc/${e.document_id}?p=${e.page}&hl=${e.id}`)} style={{ cursor: 'pointer' }}><b>{e.document_id}</b> p.{e.page}</a> · {e.label}
          <div className="tiny muted">read “{maskText(e.text_as_read, ctx.ix) || '(blank)'}” · field <span className="mono">{e.field}</span></div>
        </span>
        <span className="num"><b>{isSensitiveType(e.value_type) ? maskText(String(e.value), ctx.ix) : val(corr ? corr.value : e.value)}</b></span>
        <Badge tone={e.confidence < 0.8 ? 'bad' : e.confidence < 0.95 ? 'warn' : 'muted'} title="Pipeline confidence">{Math.round(e.confidence * 100)}%</Badge>
        {v && <Badge tone="ok" title={v.type}>✓</Badge>}
        <button className="btn sm ghost" onClick={() => ctx.setInspect(r)}>›</button>
      </div>
    )
  }
  return <div className="row small"><Ref r={r} />{info.sub && <span className="muted ellipsis">{maskText(String(info.sub), ctx.ix)}</span>}</div>
}

export function AdjustmentCard({ id }: { id: string }) {
  const ctx = useCtx()
  const a = ctx.s.adjustments.get(id)!
  const e = ctx.eff.effects.get(id)
  const needsPartner = e && (Math.abs(e.fed) > 1000 || Math.abs(e.ca) > 1000)
  const partnerOk = a.approvals.some(x => x.level === 'partner')
  const reviewed = a.approvals.some(x => x.level === 'reviewer')
  return (
    <div className="finding" style={{ opacity: a.status === 'reverted' ? 0.55 : 1 }}>
      <div className="row">
        <b className="mono small">{a.lineKey}</b>
        <span className="num"><span className="strike">{money(a.original)}</span> → <b>{money(a.original + a.delta)}</b></span>
        <Delta v={a.delta} />
        <span className="spacer" />
        {a.status === 'reverted' ? <Badge tone="muted">reverted</Badge> : a.rejected ? <Badge tone="bad">rejected</Badge> : needsPartner && !partnerOk ? <Badge tone="warn">awaiting partner</Badge> : partnerOk ? <Badge tone="ok">partner approved</Badge> : reviewed ? <Badge tone="ok">reviewed</Badge> : <Badge tone="info">recorded</Badge>}
      </div>
      <div className="small mt8">{a.reason}</div>
      {e && a.status === 'active' && <div className="tiny muted mt8">Tax effect: federal <b>{signed(e.fed + e.fedBalance)}</b>, California <b>{signed(e.ca + e.caBalance)}</b> — {e.detail}</div>}
      {a.evidence.length > 0 && <div className="mt8"><Refs refs={a.evidence} max={5} /></div>}
      <div className="row mt8 wrap">
        <Who id={a.by} at={a.at} />
        {a.approvals.map((x, i) => <span key={i} className="tiny muted">· {x.level} ✓ {ctx.userName(x.by)}</span>)}
        {a.amendment ? <Badge tone="violet">amendment {a.amendment}</Badge> : null}
        {a.baseVersion !== ctx.vix.v.version && a.status === 'active' && <Badge tone="warn" title="The engine recomputed since this adjustment - confirm it still applies">made on {a.baseVersion}</Badge>}
        <span className="spacer" />
        {a.status === 'active' && !a.rejected && ctx.can('approve_adjustment') && a.by !== ctx.user.id && !a.approvals.some(x => x.by === ctx.user.id) && (
          <button className="btn sm" onClick={() => ctx.emit('adjust.approve', { id, level: ctx.user.role === 'partner' ? 'partner' : 'reviewer' }, { action: 'approve_adjustment' })}>Approve as {ctx.user.role}</button>
        )}
        {a.status === 'active' && ctx.can('approve_adjustment') && a.by !== ctx.user.id && !a.rejected && (
          <button className="btn sm danger" onClick={() => { const r = prompt('Why reject?'); if (r) ctx.emit('adjust.reject', { id, reason: r }, { action: 'approve_adjustment' }) }}>Reject</button>
        )}
        {a.status === 'active' && ctx.can('adjust') && <button className="btn sm ghost" onClick={() => {
          ctx.emit('adjust.revert', { id, reason: 'Reverted' }, { action: 'adjust' })
          ctx.toast({ text: `Reverted ${a.lineKey}`, undo: () => ctx.emit('adjust.restore', { id }, { action: 'adjust' }) })
        }}>Revert</button>}
        {a.status === 'reverted' && ctx.can('adjust') && <button className="btn sm ghost" onClick={() => ctx.emit('adjust.restore', { id }, { action: 'adjust' })}>Restore</button>}
      </div>
      {a.rejected && <div className="callout bad small mt8">Rejected by {ctx.userName(a.rejected.by)}: {a.rejected.reason}</div>}
    </div>
  )
}

export function VerifyControl({ r, value, compact }: { r: string; value?: any; compact?: boolean }) {
  const ctx = useCtx()
  const v = ctx.s.verifications.get(r)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(ctx.s.standards.verification_types[0])
  const [note, setNote] = useState('')
  const stale = v && v.value !== undefined && value !== undefined && v.value !== value
  if (v && !open) return (
    <span className="row gap4">
      <Badge tone={stale ? 'warn' : 'ok'} title={`${v.type} by ${ctx.userName(v.by)}${v.note ? ': ' + v.note : ''}`}>{stale ? '⟳ verified value changed' : '✓ ' + v.type.replace(/_/g, ' ')}</Badge>
      {!compact && <span className="tiny muted">{ctx.userName(v.by)}</span>}
      {ctx.can('verify') && <button className="btn sm ghost" onClick={() => setOpen(true)}>{stale ? 're-verify' : 'edit'}</button>}
    </span>
  )
  if (!ctx.can('verify')) return v ? null : <Badge tone="muted">not verified</Badge>
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>✓ Verify</button>
  return (
    <div className="callout" style={{ width: '100%' }}>
      <div className="row wrap">
        <select value={type} onChange={e => setType(e.target.value)}>{ctx.s.standards.verification_types.map((t: string) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select>
        <input className="grow" placeholder="How (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn sm primary" onClick={() => {
          const ev = ctx.emit('verify', { ref: r, type, note, value, evidence: [] }, { action: 'verify' })
          if (ev) ctx.toast({ text: `Verified ${r}`, kind: 'ok', undo: () => ctx.emit('unverify', { ref: r }, { action: 'verify' }) })
          setOpen(false)
        }}>Save</button>
        {v && <button className="btn sm ghost" onClick={() => { ctx.emit('unverify', { ref: r }, { action: 'verify' }); setOpen(false) }}>Remove</button>}
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

function VarianceExplain({ k }: { k: string }) {
  const ctx = useCtx()
  const n = [...ctx.s.notes.values()].find(n => n.kind === 'variance' && n.refs.includes(k))
  const [open, setOpen] = useState(false)
  if (n) return <div className="mt8" style={{ color: 'var(--ink-2)' }}><b>Explained:</b> {n.body} <span className="muted">— {ctx.userName(n.by)}</span></div>
  if (!ctx.can('note')) return null
  return <>{' '}<button className="btn sm" onClick={() => setOpen(true)}>Explain</button>{open && <NoteModal onClose={() => setOpen(false)} preset={{ kind: 'variance', refs: [k], subject: `Variance ${k}` }} />}</>
}

function RelatedNotes({ r }: { r: string }) {
  const ctx = useCtx()
  const notes = [...ctx.s.notes.values()].filter(n => n.refs.includes(r) && (ctx.can('view_internal') || n.kind === 'client_question'))
  const decisions = [...ctx.s.decisions.values()].filter(d => d.refs.includes(r))
  if (!notes.length && !decisions.length) return null
  return (
    <div className="sect">
      <h4>Notes & decisions</h4>
      {notes.map(n => <div key={n.id} className="feed-item" style={{ cursor: 'pointer' }} onClick={() => ctx.go(`/people?n=${n.id}`)}><Badge tone={n.status === 'resolved' ? 'ok' : n.blocking ? 'bad' : 'warn'}>{n.kind.replace('_', ' ')}</Badge><div className="grow"><b>{n.subject}</b><div className="small ink2">{n.body}</div>{n.replies.map(rp => <div key={rp.id} className="small mt8">↳ <b>{ctx.userName(rp.by)}:</b> {rp.body}</div>)}</div></div>)}
      {decisions.map(d => <div key={d.id} className="feed-item"><Badge tone="violet">{d.kind.replace('_', ' ')}</Badge><div className="grow"><b>{d.topic}</b><div className="small">{d.conclusion}</div><div className="tiny muted">Authority: {d.authority}</div></div></div>)}
    </div>
  )
}

function LinksBox({ r }: { r: string }) {
  const ctx = useCtx()
  const links = ctx.s.links.filter(l => l.from === r || l.to === r)
  const [to, setTo] = useState('')
  const [why, setWhy] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <div className="sect">
      <h4>Linked items {ctx.can('link') && <button className="btn sm ghost" onClick={() => setOpen(!open)}>+ link</button>}</h4>
      {links.map(l => <div key={l.id} className="row small" style={{ padding: '3px 0' }}><Ref r={l.from === r ? l.to : l.from} /><span className="muted grow">{l.why}</span></div>)}
      {!links.length && !open && <div className="tiny muted">Link this to anything: another line, a prior-year record, a related return, an attachment.</div>}
      {open && <div className="row mt8"><input placeholder="ref, e.g. py:/return_2024/K1_1120S" value={to} onChange={e => setTo(e.target.value)} className="grow" /><input placeholder="why" value={why} onChange={e => setWhy(e.target.value)} /><button className="btn sm primary" onClick={() => { if (to) ctx.emit('link', { from: r, to, why }, { action: 'link' }); setTo(''); setWhy(''); setOpen(false) }}>Link</button></div>}
    </div>
  )
}

function EvidenceBox({ r }: { r: string }) {
  const ctx = useCtx()
  const atts = [...ctx.s.attachments.values()].filter(a => a.refs.includes(r))
  return (
    <div className="sect">
      <h4>Attached evidence</h4>
      {atts.map(a => <AttachmentRow key={a.id} id={a.id} />)}
      {ctx.can('attach') && <div className="row gap4 wrap"><AttachButton refs={[r]} /></div>}
    </div>
  )
}

export function AttachmentRow({ id }: { id: string }) {
  const ctx = useCtx()
  const a = ctx.s.attachments.get(id)
  if (!a) return null
  return (
    <div className="row small" style={{ padding: '4px 0' }}>
      <span>⎘</span>
      {a.dataUrl ? <a href={a.dataUrl} download={a.name} className="grow ellipsis">{a.name}</a> : <span className="grow ellipsis" title={a.text}>{a.name}</span>}
      <span className="muted tiny">{Math.max(1, Math.round(a.size / 1024))} KB</span>
      <Who id={a.by} at={a.at} />
    </div>
  )
}

function ValueInspector({ id }: { id: string }) {
  const ctx = useCtx()
  const e = ctx.ix.evs.get(id)!
  const doc = ctx.ix.docs.get(e.document_id)!
  const corr = ctx.s.corrections.get(id)
  const [fix, setFix] = useState(false)
  const [nv, setNv] = useState(String(e.value ?? ''))
  const [why, setWhy] = useState('')
  const landed: { v: string; key: string; label: string }[] = []
  for (const v of ctx.ix.versions.values()) for (const k of v.citedBy.get(id) || []) landed.push({ v: v.v.version, key: k, label: v.lines.get(k)!.label })
  const cur = landed.filter(x => x.v === ctx.vix.v.version)
  const sens = isSensitiveType(e.value_type)
  return (
    <>
      <div className="row gap12">
        <div className="stat"><div className="lbl">Extracted value</div><div className="big">{sens ? <Sensitive text={String(e.value)} refName={id} /> : val(e.value)}</div></div>
        {corr && <><div className="muted" style={{ fontSize: 20 }}>→</div><div className="stat"><div className="lbl">Corrected</div><div className="big" style={{ color: 'var(--violet)' }}>{val(corr.value)}</div></div></>}
        <span className="spacer" />
        <Badge tone={e.confidence < 0.8 ? 'bad' : e.confidence < 0.95 ? 'warn' : 'ok'}>confidence {Math.round(e.confidence * 100)}%</Badge>
      </div>
      <div className="kv mt12">
        <div>Field</div><div className="mono">{e.field}</div>
        <div>Printed / read</div><div>“{sens ? maskText(e.text_as_read, ctx.ix) : e.text_as_read || '(blank)'}”</div>
        <div>Type</div><div>{e.value_type}</div>
        <div>Document</div><div><a href={`#/doc/${doc.id}?p=${e.page}&hl=${id}`}>{doc.id} · {doc.title}</a></div>
        <div>Location</div><div>page {e.page}, box ({e.position.x0.toFixed(2)}, {e.position.y0.toFixed(2)}) – ({e.position.x1.toFixed(2)}, {e.position.y1.toFixed(2)})</div>
      </div>
      <div className="row mt12 wrap gap4">
        <VerifyControl r={id} value={corr ? corr.value : e.value} />
        {ctx.can('correct') && <button className="btn sm" onClick={() => setFix(!fix)}>Correct the reading</button>}
      </div>
      {corr && <div className="callout small mt8">Corrected by {ctx.userName(corr.by)}: {corr.reason}</div>}
      {fix && <div className="callout mt8"><div className="row"><input value={nv} onChange={x => setNv(x.target.value)} /><input className="grow" placeholder="Reason (what the page shows)" value={why} onChange={x => setWhy(x.target.value)} /><button className="btn sm primary" disabled={!why} onClick={() => { const v = typeof e.value === 'number' ? parseFloat(nv.replace(/,/g, '')) : nv; ctx.emit('correct', { ref: id, value: v, reason: why }, { action: 'correct' }); setFix(false) }}>Save</button></div><div className="tiny muted mt8">The original reading is kept. Lines that use this value are flagged for the engine to recompute.</div></div>}
      <div className="sect">
        <h4>Where it landed</h4>
        {cur.length ? cur.map(x => <div key={x.key} className="row small" style={{ padding: '3px 0' }}><Ref r={x.key} /><span className="num grow right">{val(ctx.eff.lines.get(x.key)?.value)}</span></div>) : <div className="small muted">Not used by any line in {ctx.vix.v.version}.{ctx.checks.find(c => c.evidence.includes(id)) ? ' Referenced by a finding.' : ''}</div>}
        {landed.filter(x => x.v !== ctx.vix.v.version).length > 0 && <div className="tiny muted mt8">Earlier versions: {[...new Set(landed.filter(x => x.v !== ctx.vix.v.version).map(x => `${x.v} ${x.key}`))].join(', ')}</div>}
      </div>
      <div className="sect">
        <h4>On the page</h4>
        <div style={{ maxWidth: 420 }}><DocPage doc={doc} page={e.page} hl={id} small /></div>
      </div>
      <RelatedNotes r={id} />
      <EvidenceBox r={id} />
    </>
  )
}

function DocInspector({ id, page }: { id: string; page?: number }) {
  const ctx = useCtx()
  const doc = ctx.ix.docs.get(id)!
  return (
    <>
      <DocMeta id={id} />
      <div className="row mt12"><a className="btn sm primary" href={`#/doc/${id}${page ? `?p=${page}` : ''}`} onClick={() => ctx.setInspect(null)}>Open document</a></div>
      <div className="sect"><h4>{page ? `Page ${page}` : 'First page'}</h4><div style={{ maxWidth: 420 }}><DocPage doc={doc} page={page || 1} small /></div></div>
      <RelatedNotes r={id} />
      <EvidenceBox r={id} />
    </>
  )
}

export function docUsage(ctx: Ctx, id: string) {
  const evs = ctx.ix.evsByDoc.get(id) || []
  const lines = new Set<string>()
  for (const e of evs) for (const k of ctx.vix.citedBy.get(e.id) || []) lines.add(k)
  for (const k of ctx.vix.citedBy.get(id) || []) lines.add(k)
  const superseded = ctx.vix.v.documents_superseded.includes(id)
  const used = ctx.vix.v.documents_used.includes(id)
  const disp = ctx.s.dispositions.get(id)
  const checks = ctx.checks.filter(c => c.evidence.some(r => r === id || r.startsWith(`doc:${id}`) || evs.some(e => e.id === r)))
  return { evs, lines: [...lines], superseded, used, disp, checks }
}

export function DocMeta({ id }: { id: string }) {
  const ctx = useCtx()
  const d = ctx.ix.docs.get(id)!
  const u = docUsage(ctx, id)
  const [disp, setDisp] = useState(false)
  const [status, setStatus] = useState(u.disp?.status || 'informational')
  const [reason, setReason] = useState(u.disp?.reason || '')
  return (
    <>
      <div className="kv">
        <div>Issuer</div><div>{d.issuer}</div>
        <div>Belongs to</div><div>{d.belongs_to}</div>
        <div>Received</div><div>{date(d.received_at)} · uploaded by {d.uploaded_by}</div>
        <div>File</div><div className="mono">{d.file_name}</div>
        <div>Extraction</div><div>{d.extraction.status} · {d.extraction.values} values{d.extraction.reason ? ` — ${d.extraction.reason}` : ''}</div>
        {d.marked_corrected && <><div>Issuer mark</div><div><Badge tone="warn">CORRECTED</Badge></div></>}
      </div>
      <div className="sect">
        <h4>Where it landed</h4>
        {u.superseded && <div className="callout warn small mb8">Superseded in {ctx.vix.v.version} (replaced by a corrected document) — not used.</div>}
        {u.lines.length ? <div className="row wrap gap4">{u.lines.slice(0, 30).map(k => <Ref key={k} r={k} />)}{u.lines.length > 30 && <span className="small muted">+{u.lines.length - 30} lines</span>}</div> : <div className="small muted">No line cites this document in {ctx.vix.v.version}.</div>}
        {u.checks.length > 0 && <div className="mt8 small">Findings: {u.checks.map(c => <a key={c.id} href={`#/findings?f=${c.id}`} style={{ marginRight: 8 }}>{c.title}</a>)}</div>}
        {u.disp && <div className="callout small mt8"><b>Disposition:</b> {u.disp.status.replace(/_/g, ' ')} — {u.disp.reason} <span className="muted">({ctx.userName(u.disp.by)})</span></div>}
        {ctx.can('disposition') && <button className="btn sm mt8" onClick={() => setDisp(!disp)}>{u.disp ? 'Change disposition' : 'Record why / how used'}</button>}
        {disp && (
          <div className="callout mt8">
            <div className="row wrap"><select value={status} onChange={e => setStatus(e.target.value)}>{['used', 'duplicate', 'superseded', 'informational', 'supports_finding', 'outside_scope', 'not_relevant'].map(s => <option key={s}>{s}</option>)}</select><input className="grow" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} /><button className="btn sm primary" disabled={!reason} onClick={() => { ctx.emit('disposition', { docId: id, status, reason }, { action: 'disposition' }); setDisp(false) }}>Save</button></div>
          </div>
        )}
      </div>
    </>
  )
}

function GenericInspector({ r }: { r: string }) {
  const ctx = useCtx()
  const info = resolve(ctx.ix, r, ctx.s)
  const cited: string[] = []
  for (const [k, list] of ctx.vix.citedBy) if (k === r) cited.push(...list)
  const inChecks = ctx.checks.filter(c => c.evidence.includes(r))
  const inAdj = [...ctx.s.adjustments.values()].filter(a => a.evidence.includes(r))
  let body: React.ReactNode = null
  if (info.kind === 'answer') { const q = ctx.ix.qa.get(r); body = <div className="callout"><div className="small muted">{q.question}</div><div className="mt8" style={{ fontSize: 15 }}>“{q.answer}”</div><div className="tiny muted mt8">{q.answered_by} · {date(q.answered_at)} · client organizer</div></div> }
  if (info.kind === 'message') { const m = ctx.ix.msgs.get(r); body = <div className="callout"><div style={{ fontSize: 15 }}>“{m.text}”</div><div className="tiny muted mt8">{m.from} → {m.to} · {date(m.sent_at)}</div></div> }
  if (info.kind === 'call') { const c = ctx.ix.calls.get(r); body = <div className="callout"><div className="tiny muted mb8">{c.participants.join(', ')} · {date(c.date)}</div><ul style={{ margin: 0, paddingLeft: 18 }}>{c.notes.map((n: string, i: number) => <li key={i} className="small">{n}</li>)}</ul></div> }
  if (info.kind === 'person') {
    const p = ctx.ix.people.get(r.slice(10).split('.')[0])
    const corr = ctx.s.corrections.get(`household:${p.id}.ssn`)
    body = <div className="kv">{Object.entries(p).filter(([k]) => k !== 'id').map(([k, v]) => <React.Fragment key={k}><div>{k.replace(/_/g, ' ')}</div><div>{k === 'ssn' || k === 'ip_pin' ? <><Sensitive text={String(corr && k === 'ssn' ? corr.value : v)} refName={`household:${p.id}.${k}`} />{corr && k === 'ssn' && <Badge tone="violet">corrected</Badge>}</> : String(v)}</div></React.Fragment>)}</div>
  }
  if (info.kind === 'prior' || info.kind === 'agency' || info.kind === 'param' || info.kind === 'asset') {
    const v = info.value ?? (info.kind === 'asset' ? (ctx.ix.p.prior_years.asset_records.find((x: any) => 'asset:' + x.asset_id === r) || ctx.vix.v.assets.find((x: any) => 'asset:' + x.asset_id === r)) : undefined)
    body = typeof v === 'object' && v !== null ? <pre className="mono callout" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{JSON.stringify(v, null, 2)}</pre> : <div className="stat"><div className="big">{val(v)}</div></div>
  }
  if (info.kind === 'timeline') { const t = ctx.ix.timeline.get(r.slice(9)); body = <pre className="mono callout" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(t, null, 2)}</pre> }
  if (info.kind === 'attachment') { body = <><AttachmentRow id={r} />{ctx.s.attachments.get(r)?.text && <pre className="callout small" style={{ whiteSpace: 'pre-wrap' }}>{ctx.s.attachments.get(r)!.text}</pre>}</> }
  if (info.kind === 'adjustment') body = <AdjustmentCard id={r} />
  return (
    <>
      {body}
      {(cited.length > 0 || inChecks.length > 0 || inAdj.length > 0) && (
        <div className="sect">
          <h4>Used as evidence</h4>
          <div className="row wrap gap4">{cited.map(k => <Ref key={k} r={k} />)}</div>
          {inChecks.map(c => <div key={c.id} className="small mt8">Finding: <a href={`#/findings?f=${c.id}`}>{c.title}</a></div>)}
          {inAdj.map(a => <div key={a.id} className="small mt8">Adjustment: <Ref r={a.lineKey} /> {a.reason.slice(0, 80)}</div>)}
        </div>
      )}
      <RelatedNotes r={r} />
      <LinksBox r={r} />
      <EvidenceBox r={r} />
    </>
  )
}
