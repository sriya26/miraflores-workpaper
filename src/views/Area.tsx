import React, { useState } from 'react'
import { useCtx, areaLines, signoffState, findingState, areaFingerprint } from '../ctx'
import { Badge, Ref, Who, Empty, Delta, Avatar } from '../ui'
import { AREA_BY_ID, AREAS } from '../areas'
import { val, money, signed, date } from '../format'
import { estimateFix } from './Findings'
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
  const openChecks = ctx.checks.filter(c => c.area === id && findingState(ctx, c).open)
  const passed = ctx.checks.filter(c => c.area === id && !findingState(ctx, c).open)
  const byForm = new Map<string, string[]>()
  for (const k of keys) { const f = k.split('.')[0]; if (!byForm.has(f)) byForm.set(f, []); byForm.get(f)!.push(k) }
  const assign = ctx.s.assignments.get(id)
  const preparer = assign?.preparer || ctx.ix.p.firm.assignment_at_start.preparer
  const reviewer = assign?.reviewer || ctx.ix.p.firm.assignment_at_start.reviewer
  const budget = area.budget ? ctx.ix.p.firm.budget_hours[area.budget] : undefined
  const notes = [...ctx.s.notes.values()].filter(n => n.kind !== 'variance' && (n.refs.some(r => keys.includes(r) || area.docs.includes(r)) || n.refs.includes('area:' + id)))
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="small muted">{ctx.userName(preparer)} prepares · {ctx.userName(reviewer)} reviews{budget != null ? ` · ${st.hours.toFixed(1)} of ${budget}h` : ''}</div>
          <h1 style={{ marginTop: 6 }}>{area.name}</h1>
          <p>{area.blurb}</p>
        </div>
        {ctx.can('note') && <button className="btn sm" onClick={() => setNote(true)}>Add review note</button>}
      </div>

      <SignoffStrip area={id} so={so} openCount={openChecks.length} />

      {openChecks.length > 0 && (
        <>
          <div className="section-title">To resolve</div>
          <div className="todo">
            {openChecks.map(c => {
              const est = estimateFix(ctx, c)
              const eff = Math.round(est.fed) || Math.round(est.ca) ? `fix changes tax ${signed(Math.round(est.fed))} federal, ${signed(Math.round(est.ca))} CA` : findingState(ctx, c).label
              return <a key={c.id} href={`#/findings?f=${c.id}`}><span className="mark bad" style={{ alignSelf: 'center' }} /><span className="grow">{c.title}</span><span className="sub">{eff}</span></a>
            })}
          </div>
        </>
      )}

      <div className="section-title">Lines<span className="muted" style={{ fontWeight: 400 }}>click a line to see where it came from</span></div>
      <div className="card ltree">
        {[...byForm.entries()].map(([form, ks]) => (
          <React.Fragment key={form}>
            <div style={{ padding: '12px 14px 4px', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>{FORM_NAME[form] || form}</div>
            {ks.map(k => <LineRow key={k} k={k} sel={sel === k} onClick={() => { setSel(k); ctx.setInspect(k) }} />)}
          </React.Fragment>
        ))}
      </div>

      <div className="section-title">Source documents</div>
      <div className="small" style={{ lineHeight: 1.9 }}>
        {area.docs.map((d, i) => { const doc = ctx.ix.docs.get(d)!; return <React.Fragment key={d}>{i > 0 && <span className="muted"> · </span>}<a href={`#/doc/${d}`} style={{ opacity: doc.received_at > ctx.clock ? 0.4 : 1 }}>{doc.title.replace(/^2025 /, '')}</a></React.Fragment> })}
      </div>
      {(LINKS[id] || []).length > 0 && <div className="small mt12">{LINKS[id].map((l, i) => <React.Fragment key={l.to}>{i > 0 && <span className="muted"> · </span>}<a href={'#' + l.to}>{l.label} →</a></React.Fragment>)}</div>}

      {notes.length > 0 && (
        <>
          <div className="section-title">Notes</div>
          {notes.map(n => <div key={n.id} className="small" style={{ padding: '5px 0' }}><a href={`#/people?n=${n.id}`}>{n.subject}</a> <span className="muted">· {ctx.userName(n.by)} · {n.status}</span></div>)}
        </>
      )}

      {passed.length > 0 && (
        <>
          <div className="section-title">Checks that passed</div>
          <div className="small muted" style={{ lineHeight: 1.9 }}>{passed.map((c, i) => <React.Fragment key={c.id}>{i > 0 && ' · '}<a href={`#/findings?f=${c.id}`} style={{ color: 'var(--ink-2)' }}>{c.title}</a></React.Fragment>)}</div>
        </>
      )}

      {ctx.can('time') && <TimeLine area={id} />}
      {note && <NoteModal onClose={() => setNote(false)} preset={{ kind: 'review', refs: ['area:' + id], subject: `${area.short}: ` }} />}
    </div>
  )
}

const FORM_NAME: Record<string, string> = {
  F1040: 'Form 1040', Sch1: 'Schedule 1', Sch2: 'Schedule 2', Sch3: 'Schedule 3', SchA: 'Schedule A', SchB: 'Schedule B', SchC: 'Schedule C', SchD: 'Schedule D', SchE: 'Schedule E', SchSE: 'Schedule SE',
  F8949: 'Form 8949 totals', F4797: 'Form 4797', 'F4562-C': 'Form 4562 (business)', 'F4562-E': 'Form 4562 (rentals)', F8582: 'Form 8582', F6251: 'Form 6251 (AMT)', F8959: 'Form 8959', F8960: 'Form 8960',
  F8995: 'Form 8995-A (QBI)', F8812: 'Schedule 8812', F8863: 'Form 8863', F2441: 'Form 2441', F8889: 'Form 8889 (HSA)', F8606: 'Form 8606', F8283: 'Form 8283', F7203: 'Form 7203', F8938: 'Form 8938', F2210: 'Form 2210', F8867: 'Form 8867',
  SchCA540NR: 'Schedule CA (540NR)', F540NR: 'Form 540NR', ScheduleS: 'Schedule S', FTB3885A: 'FTB 3885A', FTB5805: 'FTB 5805',
}

function LineRow({ k, sel, onClick }: { k: string; sel: boolean; onClick: () => void }) {
  const ctx = useCtx()
  const line = ctx.vix.lines.get(k)!
  const le = ctx.eff.lines.get(k)!
  const v = ctx.s.verifications.get(k)
  const srcs = (line.sources || []).filter(s => s.startsWith('ev-'))
  const allVerified = srcs.length > 0 && srcs.every(s => ctx.s.verifications.has(s))
  const finding = ctx.checks.find(c => c.lines.includes(k) && findingState(ctx, c).open)
  return (
    <div className={'lrow' + (sel ? ' sel' : '')} onClick={onClick} style={{ gridTemplateColumns: '1fr 150px 24px' }}>
      <div className="ellipsis"><span className="lk">{line.line}</span>{line.label}</div>
      <div className="lv">
        {le.delta !== 0 && <span className="strike tiny" style={{ marginRight: 8 }}>{val(le.base)}</span>}
        <span style={{ color: le.delta ? 'var(--violet)' : undefined, fontWeight: le.delta ? 650 : 500 }}>{val(le.value)}</span>
      </div>
      <div className="right" title={finding ? finding.title : v || allVerified ? 'Verified' : ''}>{finding ? <span className="mark bad" /> : v || allVerified ? <span className="mark ok" /> : null}</div>
    </div>
  )
}

function SignoffStrip({ area, so, openCount }: { area: string; so: any; openCount: number }) {
  const ctx = useCtx()
  const sign = (level: string) => {
    const fp = areaFingerprint(ctx, area)
    if (level !== 'preparer') {
      const prep = so.preparer.so
      if (prep && prep.by === ctx.user.id) { ctx.toast({ text: 'Firm rule: you may not review or sign off on work you prepared.', kind: 'error' }); return }
      const ownAdj = [...ctx.s.adjustments.values()].some(a => a.status === 'active' && a.by === ctx.user.id && fp.snapshot.adjustments.some((x: string) => x.startsWith(a.id)))
      if (ownAdj) { ctx.toast({ text: 'Firm rule: you made adjustments in this area, so someone else must review it.', kind: 'error' }); return }
    }
    if (openCount && level !== 'preparer') { if (!confirm(`${openCount} findings are still open in this area. Sign off anyway?`)) return }
    ctx.emit('signoff', { area, level, fingerprint: fp.fingerprint, snapshot: fp.snapshot }, { action: `signoff.${level}` })
  }
  const levels = ['preparer', 'reviewer', 'partner'] as const
  const stale = levels.map(l => so[l]).find((x: any) => x.stale)
  return (
    <div className="card" style={{ padding: '12px 18px' }}>
      <div className="row wrap gap24">
        {levels.map(lv => {
          const x = so[lv]
          return (
            <div key={lv} className="row gap4 small">
              <span className="muted" style={{ textTransform: 'capitalize' }}>{lv}</span>
              {x.so ? <span style={{ color: x.stale ? 'var(--warn)' : 'var(--ok)' }}>{x.stale ? 'reopened' : '✓ ' + ctx.userName(x.so.by).split(' ')[0]}</span> : <span className="muted">—</span>}
              {ctx.can(`signoff.${lv}`) && (!x.so || x.stale) && <button className="btn sm" onClick={() => sign(lv)}>{x.stale ? 'Re-sign' : 'Sign off'}</button>}
              {x.so && !x.stale && x.so.by === ctx.user.id && <button className="btn sm ghost" onClick={() => ctx.emit('signoff.revoke', { id: x.so.id, reason: 'withdrawn' })}>Withdraw</button>}
            </div>
          )
        })}
      </div>
      {stale && <div className="small mt8" style={{ color: 'var(--warn)' }}>Changed since sign-off: {stale.changes.slice(0, 4).join('; ')}{stale.changes.length > 4 ? ` (+${stale.changes.length - 4} more)` : ''}</div>}
    </div>
  )
}

function TimeLine({ area }: { area: string }) {
  const ctx = useCtx()
  const [h, setH] = useState('0.5')
  return (
    <div className="row small mt24 muted">
      Log time on this area
      <input value={h} onChange={e => setH(e.target.value)} style={{ width: 56, padding: '3px 6px' }} /> h
      <button className="btn sm ghost" onClick={() => { const n = parseFloat(h); if (n > 0) { ctx.emit('time', { area, hours: n, note: '' }, { action: 'time' }); ctx.toast({ text: `Logged ${n}h`, kind: 'ok' }) } }}>Log</button>
    </div>
  )
}
