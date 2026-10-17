import React, { useState } from 'react'
import { useCtx, areaLines, signoffState, findingState, areaFingerprint } from '../ctx'
import { Badge, Ref, Who, Empty, Delta, Avatar } from '../ui'
import { AREA_BY_ID, AREAS } from '../areas'
import { val, money, signed, date } from '../format'
import { FindingCard, estimateFix } from './Findings'
import { areaStats } from './Overview'
import { NoteModal } from './Modals'
import { VerifyControl } from './Inspector'

const LINKS: Record<string, { to: string; label: string }[]> = {
  business: [{ to: '/schedules/books', label: 'Books → Schedule C reconciliation' }, { to: '/schedules/assets', label: 'Depreciation by asset' }],
  investments: [{ to: '/schedules/sales', label: 'Sales detail (302 lots)' }],
  rentals: [{ to: '/schedules/rentals', label: 'Rentals & passive losses' }, { to: '/schedules/assets', label: 'Depreciation by asset' }],
  passthrough: [{ to: '/schedules/basis', label: 'Basis by year' }, { to: '/schedules/k1', label: 'K-1 lines' }],
  california: [{ to: '/schedules/state', label: 'State split (CA / TX)' }],
  tax: [{ to: '/schedules/tax', label: 'Tax computation' }, { to: '/schedules/payments', label: 'Payments vs agency records' }],
  deductions: [{ to: '/schedules/deductions', label: 'Deductions & credits with limits' }],
  retirement: [{ to: '/schedules/retirement', label: 'Retirement & foreign items' }],
  intake: [{ to: '/schedules/prior', label: 'Prior preparer vs us' }, { to: '/schedules/carryovers', label: 'Carryovers' }],
  wages: [{ to: '/schedules/sales', label: 'Stock comp sales' }],
}

export function AreaView({ id }: { id: string }) {
  const ctx = useCtx()
  const area = AREA_BY_ID.get(id)
  const [note, setNote] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  if (!area) return <div className="page"><Empty>Unknown area.</Empty></div>
  const keys = areaLines(ctx, id)
  const st = areaStats(ctx, id)
  const so = signoffState(ctx, id) as any
  const checks = ctx.checks.filter(c => c.area === id)
  const openChecks = checks.filter(c => findingState(ctx, c).open)
  const byForm = new Map<string, string[]>()
  for (const k of keys) { const f = k.split('.')[0]; if (!byForm.has(f)) byForm.set(f, []); byForm.get(f)!.push(k) }
  const assign = ctx.s.assignments.get(id)
  const preparer = assign?.preparer || ctx.ix.p.firm.assignment_at_start.preparer
  const reviewer = assign?.reviewer || ctx.ix.p.firm.assignment_at_start.reviewer
  const budget = area.budget ? ctx.ix.p.firm.budget_hours[area.budget] : undefined
  const notes = [...ctx.s.notes.values()].filter(n => n.refs.some(r => keys.includes(r) || area.docs.includes(r)) || n.refs.includes('area:' + id))
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="small muted">The return / {area.short}</div>
          <h1>{area.name}</h1>
          <p>{area.blurb}</p>
        </div>
        <div className="row">
          <span className="row small"><Avatar id={preparer} name={ctx.userName(preparer)} size={22} /> {ctx.userName(preparer)}</span>
          <span className="row small"><Avatar id={reviewer} name={ctx.userName(reviewer)} size={22} /> {ctx.userName(reviewer)}</span>
          {ctx.can('note') && <button className="btn" onClick={() => setNote(true)}>✎ Review note</button>}
        </div>
      </div>
      <div className="grid g-side">
        <div className="col gap16">
          {openChecks.length > 0 && (
            <div>
              <h4 className="mb8">Open findings</h4>
              {openChecks.map(c => <FindingCard key={c.id} c={c} st={findingState(ctx, c)} est={estimateFix(ctx, c)} compact />)}
            </div>
          )}
          <div className="card">
            <div className="card-head"><h3 className="grow">Lines</h3><span className="small muted">click any line to see where it came from and how it was built</span></div>
            <div className="ltree">
              <div className="lrow" style={{ cursor: 'default', background: 'var(--panel-2)', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}><span>LINE</span><span className="right">WORKPAPER</span><span className="right">CHANGE</span><span className="right">STATUS</span></div>
              {[...byForm.entries()].map(([form, ks]) => (
                <React.Fragment key={form}>
                  <div style={{ padding: '8px 10px 4px', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.05em' }}>{form}</div>
                  {ks.map(k => <LineRow key={k} k={k} sel={sel === k} onClick={() => { setSel(k); ctx.setInspect(k) }} />)}
                </React.Fragment>
              ))}
            </div>
          </div>
          {checks.filter(c => !findingState(ctx, c).open).length > 0 && (
            <div className="card pad">
              <h4 className="mb8">Checks that passed</h4>
              {checks.filter(c => !findingState(ctx, c).open).map(c => <div key={c.id} className="row small" style={{ padding: '3px 0' }}><span className="dot ok" /><a href={`#/findings?f=${c.id}`} className="grow">{c.title}</a><span className="tiny muted ellipsis" style={{ maxWidth: 300 }}>{c.kind === 'recompute' ? 'recomputed independently' : findingState(ctx, c).label}</span></div>)}
            </div>
          )}
        </div>
        <div className="col gap16">
          <SignoffPanel area={id} so={so} openCount={openChecks.length} />
          <div className="card pad">
            <h4 className="mb8">Documents</h4>
            {area.docs.map(d => { const doc = ctx.ix.docs.get(d)!; return <div key={d} className="row small" style={{ padding: '2px 0', opacity: doc.received_at > ctx.clock ? 0.4 : 1 }}><Badge>{d}</Badge><a href={`#/doc/${d}`} className="grow ellipsis">{doc.title}</a></div> })}
            {(LINKS[id] || []).length > 0 && <><div className="divider" /><h4 className="mb8">Schedules</h4>{LINKS[id].map(l => <div key={l.to}><a href={'#' + l.to} className="small">{l.label} →</a></div>)}</>}
          </div>
          <TimeCard area={id} budget={budget} hours={st.hours} />
          {notes.length > 0 && (
            <div className="card pad">
              <h4 className="mb8">Notes</h4>
              {notes.map(n => <a key={n.id} href={`#/people?n=${n.id}`} className="feed-item" style={{ color: 'var(--ink)' }}><Badge tone={n.status === 'resolved' ? 'ok' : n.blocking ? 'bad' : 'warn'}>{n.status}</Badge><span className="grow small">{n.subject}</span></a>)}
            </div>
          )}
        </div>
      </div>
      {note && <NoteModal onClose={() => setNote(false)} preset={{ kind: 'review', refs: ['area:' + id], subject: `${area.short}: ` }} />}
    </div>
  )
}

function LineRow({ k, sel, onClick }: { k: string; sel: boolean; onClick: () => void }) {
  const ctx = useCtx()
  const line = ctx.vix.lines.get(k)!
  const le = ctx.eff.lines.get(k)!
  const v = ctx.s.verifications.get(k)
  const srcs = (line.sources || []).filter(s => s.startsWith('ev-'))
  const srcVerified = srcs.filter(s => ctx.s.verifications.has(s)).length
  const finding = ctx.checks.find(c => c.lines.includes(k) && findingState(ctx, c).open)
  const vr = ctx.variances.find(x => x.key === k)
  return (
    <div className={'lrow' + (sel ? ' sel' : '')} onClick={onClick}>
      <div className="ellipsis"><span className="lk">{line.line}</span>{line.label}</div>
      <div className="lv">{le.delta !== 0 && <span className="strike tiny" style={{ marginRight: 6 }}>{val(le.base)}</span>}<span style={{ color: le.delta ? 'var(--violet)' : undefined }}>{val(le.value)}</span></div>
      <div className="ld">{le.delta ? <Delta v={le.delta} /> : le.stale ? <span className="tiny" style={{ color: 'var(--warn)' }}>recompute</span> : ''}</div>
      <div className="right row gap4" style={{ justifyContent: 'flex-end' }}>
        {finding && <span title={finding.title}><Badge tone="bad">⚑</Badge></span>}
        {vr && <span title={`Changed ${signed(vr.change)} vs 2024`}><Badge tone="warn">YoY</Badge></span>}
        {v ? <Badge tone="ok">✓</Badge> : srcs.length ? <span className="tiny muted">{srcVerified}/{srcs.length}</span> : null}
      </div>
    </div>
  )
}

function SignoffPanel({ area, so, openCount }: { area: string; so: any; openCount: number }) {
  const ctx = useCtx()
  const levels = ['preparer', 'reviewer', 'partner'] as const
  const sign = (level: string) => {
    const fp = areaFingerprint(ctx, area)
    // firm rule: no one reviews their own work
    if (level !== 'preparer') {
      const prep = so.preparer.so
      if (prep && prep.by === ctx.user.id) { ctx.toast({ text: 'Firm rule: you may not review or sign off on work you prepared.', kind: 'error' }); return }
      const ownAdj = [...ctx.s.adjustments.values()].some(a => a.status === 'active' && a.by === ctx.user.id && AREA_BY_ID.get(area) && fp.snapshot.adjustments.some((x: string) => x.startsWith(a.id)))
      if (ownAdj) { ctx.toast({ text: 'Firm rule: you made adjustments in this area, so someone else must review it.', kind: 'error' }); return }
    }
    if (openCount && level !== 'preparer') { if (!confirm(`${openCount} findings are still open in this area. Sign off anyway?`)) return }
    ctx.emit('signoff', { area, level, fingerprint: fp.fingerprint, snapshot: fp.snapshot }, { action: `signoff.${level}` })
  }
  return (
    <div className="card pad">
      <h4 className="mb8">Sign-offs</h4>
      <div className="tiny muted mb8">A sign-off covers this area's lines, adjustments and findings exactly as they are now. If anything it covers changes, it reopens and shows what changed.</div>
      {levels.map(lv => {
        const x = so[lv]
        return (
          <div key={lv} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <div className="row">
              <b className="small" style={{ width: 70, textTransform: 'capitalize' }}>{lv}</b>
              {x.so ? <span className="grow"><Who id={x.so.by} at={x.so.at} /></span> : <span className="grow small muted">not signed</span>}
              {x.so && !x.stale && <Badge tone="ok">✓ current</Badge>}
              {x.stale && <Badge tone="warn">⟳ reopened</Badge>}
            </div>
            {x.stale && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 88, color: 'var(--warn)' }}>{x.changes.slice(0, 6).map((c: string, i: number) => <li key={i}>{c}</li>)}{x.changes.length > 6 && <li>+{x.changes.length - 6} more</li>}</ul>}
            <div className="row mt8" style={{ paddingLeft: 78 }}>
              {ctx.can(`signoff.${lv}`) && (!x.so || x.stale) && <button className="btn sm primary" onClick={() => sign(lv)}>{x.stale ? 'Re-sign' : 'Sign off'}</button>}
              {x.so && x.so.by === ctx.user.id && <button className="btn sm ghost" onClick={() => ctx.emit('signoff.revoke', { id: x.so.id, reason: 'withdrawn' })}>Withdraw</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TimeCard({ area, budget, hours }: { area: string; budget?: number; hours: number }) {
  const ctx = useCtx()
  const [h, setH] = useState('0.5')
  const entries = ctx.s.time.filter(t => t.area === area)
  return (
    <div className="card pad">
      <div className="row"><h4 className="grow">Time</h4><span className="small"><b>{hours.toFixed(1)}h</b>{budget != null && <span className="muted"> of {budget}h budget</span>}</span></div>
      {budget != null && <div className="meter mt8"><span className={hours > budget ? 'bad' : 'info'} style={{ width: `${Math.min(100, (hours / budget) * 100)}%` }} /></div>}
      {entries.slice(-4).map(t => <div key={t.id} className="row tiny muted mt8"><span className="grow">{ctx.userName(t.by)} · {t.note || 'work'}</span><span>{t.hours}h</span></div>)}
      {ctx.can('time') && <div className="row mt8"><input value={h} onChange={e => setH(e.target.value)} style={{ width: 60 }} /><span className="small muted">hours</span><button className="btn sm" onClick={() => { const n = parseFloat(h); if (n > 0) ctx.emit('time', { area, hours: n, note: '' }, { action: 'time' }) }}>Log</button></div>}
    </div>
  )
}
