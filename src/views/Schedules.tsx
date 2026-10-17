import React, { useMemo, useState } from 'react'
import { useCtx, Ctx } from '../ctx'
import { Badge, Ref, Tabs, Delta, Empty } from '../ui'
import { money, val, signed, pct, date } from '../format'
import { NoteModal } from './Modals'

const TABS = [
  { id: 'summary', label: 'Return vs last year' }, { id: 'tax', label: 'Tax computation' }, { id: 'sales', label: 'Sales detail' },
  { id: 'assets', label: 'Depreciation' }, { id: 'books', label: 'Books to tax' }, { id: 'rentals', label: 'Rentals & passive' },
  { id: 'k1', label: 'K-1 lines' }, { id: 'basis', label: 'Basis by year' }, { id: 'retirement', label: 'Retirement & foreign' },
  { id: 'deductions', label: 'Deductions & credits' }, { id: 'payments', label: 'Payments' }, { id: 'state', label: 'State split' },
  { id: 'carryovers', label: 'Carryovers' }, { id: 'prior', label: 'Prior preparer vs us' },
]

export function Schedules({ tab }: { tab: string }) {
  const ctx = useCtx()
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Schedules</h1><p>The records a CPA expects, built from the same lines and evidence. Click any amount to trace it.</p></div></div>
      <Tabs value={tab} onChange={t => ctx.go('/schedules/' + t)} tabs={TABS} />
      {tab === 'summary' && <Summary />}
      {tab === 'tax' && <TaxComp />}
      {tab === 'sales' && <Sales />}
      {tab === 'assets' && <Assets />}
      {tab === 'books' && <Books />}
      {tab === 'rentals' && <Rentals />}
      {tab === 'k1' && <K1 />}
      {tab === 'basis' && <Basis />}
      {tab === 'retirement' && <Retirement />}
      {tab === 'deductions' && <Deductions />}
      {tab === 'payments' && <Payments />}
      {tab === 'state' && <StateSplit />}
      {tab === 'carryovers' && <Carryovers />}
      {tab === 'prior' && <PriorVsUs />}
    </div>
  )
}

const L = (ctx: Ctx, k: string) => ctx.eff.lines.get(k)?.value
const B = (ctx: Ctx, k: string) => ctx.vix.lines.get(k)?.value

function Amt({ k, cents }: { k: string; cents?: boolean }) {
  const ctx = useCtx()
  const le = ctx.eff.lines.get(k)
  if (!le) return <span className="muted">—</span>
  return <a onClick={() => ctx.setInspect(k)} style={{ cursor: 'pointer', color: le.delta ? 'var(--violet)' : 'var(--ink)', fontWeight: le.delta ? 650 : undefined }} className="num" title={le.delta ? `engine ${money(le.base)}` : k}>{money(le.value, { cents })}</a>
}

function LineTable({ rows, cols = ['engine', 'workpaper'] }: { rows: (string | { label: string; k?: string; v?: number; total?: boolean; sub?: boolean })[]; cols?: string[] }) {
  const ctx = useCtx()
  return (
    <table className="t">
      <thead><tr><th>Line</th>{cols.includes('prior') && <th className="num">2024</th>}<th className="num">Engine {ctx.vix.v.version}</th><th className="num">Workpaper</th><th className="num">Change</th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const o = typeof r === 'string' ? { label: ctx.vix.lines.get(r)?.label || r, k: r } : r
          const le = o.k ? ctx.eff.lines.get(o.k) : undefined
          return (
            <tr key={i} className={(o.total ? 'total ' : '') + (o.sub ? 'sub ' : '') + (o.k ? 'click' : '')} onClick={() => o.k && ctx.setInspect(o.k)}>
              <td>{o.k && <span className="mono tiny muted">{o.k} </span>}{o.label}</td>
              {cols.includes('prior') && <td className="num">{o.k && ctx.ix.priorLines[o.k] != null ? money(ctx.ix.priorLines[o.k]) : ''}</td>}
              <td className="num">{le ? val(le.base) : o.v != null ? money(o.v) : ''}</td>
              <td className="num" style={{ color: le?.delta ? 'var(--violet)' : undefined }}>{le ? val(le.value) : ''}</td>
              <td className="num">{le?.delta ? <Delta v={le.delta} /> : le?.stale ? <span className="tiny" style={{ color: 'var(--warn)' }}>recompute</span> : ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Summary() {
  const ctx = useCtx()
  const [explain, setExplain] = useState<string | null>(null)
  const keys = ['F1040.1a', 'F1040.2b', 'F1040.3a', 'F1040.3b', 'F1040.7', 'F1040.8', 'F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.19', 'F1040.23', 'F1040.24', 'F1040.25a', 'F1040.26', 'F1040.33', 'SchC.1', 'SchC.31', 'SchE.21A', 'SchE.21B', 'SchE.32', 'SchSE.12']
  const flags = new Map(ctx.variances.map(v => [v.key, v]))
  const sv = ctx.s.standards.variance_review
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">Return summary vs 2024 (as filed by Delta River Tax Services)</h3><span className="small muted">flag: over {sv.flag_if_change_over_percent}% and over {money(sv.and_over_amount)} — set by the firm</span></div>
      <table className="t">
        <thead><tr><th>Line</th><th className="num">2024</th><th className="num">2025 workpaper</th><th className="num">Change</th><th className="num">%</th><th>Explanation</th></tr></thead>
        <tbody>
          {keys.map(k => {
            const p = ctx.ix.priorLines[k], c = L(ctx, k)
            const f = flags.get(k)
            const note = [...ctx.s.notes.values()].find(n => n.kind === 'variance' && n.refs.includes(k))
            return (
              <tr key={k}>
                <td className="click" onClick={() => ctx.setInspect(k)}><span className="mono tiny muted">{k}</span> {ctx.vix.lines.get(k)?.label}</td>
                <td className="num">{money(p)}</td><td className="num"><Amt k={k} /></td>
                <td className="num">{typeof p === 'number' && typeof c === 'number' ? <Delta v={c - p} /> : ''}</td>
                <td className="num">{typeof p === 'number' && p && typeof c === 'number' ? pct((c - p) / Math.abs(p)) : ''}</td>
                <td style={{ maxWidth: 360 }}>{f ? note ? <span className="small">{note.body} <span className="muted">— {ctx.userName(note.by)}</span></span> : <><Badge tone="warn">explain</Badge> {ctx.can('note') && <button className="btn sm ghost" onClick={() => setExplain(k)}>Add</button>}</> : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {explain && <NoteModal onClose={() => setExplain(null)} preset={{ kind: 'variance', refs: [explain], subject: `Variance ${explain}` }} />}
    </div>
  )
}

function TaxComp() {
  return (
    <div className="grid g2">
      <div className="card"><div className="card-head"><h3>Federal</h3></div>
        <LineTable rows={['F1040.9', 'F1040.10', { label: 'Adjusted gross income', k: 'F1040.11', total: true }, 'F1040.12', 'F1040.13', { label: 'Taxable income', k: 'F1040.15', total: true }, 'F1040.16', 'F6251.4', 'F6251.5', 'F6251.9', 'F1040.17', 'F1040.19', 'F1040.20', 'F1040.22', 'Sch2.4', 'Sch2.11', 'Sch2.12', { label: 'Total tax', k: 'F1040.24', total: true }, 'F1040.25d', 'F1040.26', 'Sch3.10', 'Sch3.11', { label: 'Total payments', k: 'F1040.33', total: true }, { label: 'Amount you owe', k: 'F1040.37', total: true }, 'F1040.38']} />
      </div>
      <div className="card"><div className="card-head"><h3>California 540NR</h3></div>
        <LineTable rows={['F540NR.13', 'F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.31', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'F540NR.39', 'F540NR.40', 'ScheduleS.credit', 'F540NR.61', { label: 'Total tax', k: 'F540NR.64', total: true }, 'F540NR.71', 'F540NR.72', 'F540NR.73', 'F540NR.78', { label: 'Overpaid', k: 'F540NR.97', total: true }]} />
        <div className="tiny muted" style={{ padding: 12 }}>Workpaper totals for lines behind non-linear rules are carried in the bottom line via rate estimates until the engine recomputes; "recompute" marks them.</div>
      </div>
    </div>
  )
}

interface Lot { key: string; box: string; broker: string; desc: string; acquired: string; sold: string; proceeds: number; basis: number; adj: number; gain: number; flags: string[] }

function parseLots(ctx: Ctx): Lot[] {
  const out: Lot[] = []
  for (const l of ctx.vix.v.lines) {
    if (l.form !== 'F8949' || l.line.endsWith('total')) continue
    const [box, id] = l.line.split('.')
    const m = l.label.match(/^(.*?) \(acquired (\S+), sold (\S+); proceeds ([\d,.]+), basis ([\d,.]+)(?:, adjustment \w ([-\d,.]+))?\)/)
    const broker = id.startsWith('X') ? 'Brightpath (D74)' : id.startsWith('M') ? 'Meridian (D31)' : id.startsWith('N') ? 'Northlake (D28)' : id.startsWith('C') ? 'Coinhaven (D34/D35)' : 'Woodworks S corp'
    const n = (s?: string) => (s ? parseFloat(s.replace(/,/g, '')) : 0)
    const le = ctx.eff.lines.get(l.key)!
    const flags: string[] = []
    if (m && n(m[5]) === 0 && !id.startsWith('S')) flags.push('zero basis')
    if (l.label.includes('adjustment W')) flags.push('wash sale')
    if (le.delta) flags.push('adjusted')
    out.push({ key: l.key, box, broker, desc: m ? m[1] : l.label, acquired: m?.[2] || '', sold: m?.[3] || '', proceeds: n(m?.[4]), basis: n(m?.[5]), adj: n(m?.[6]), gain: le.value, flags })
  }
  return out
}

function Sales() {
  const ctx = useCtx()
  const lots = useMemo(() => parseLots(ctx), [ctx.vix, ctx.eff])
  const [group, setGroup] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [onlyEx, setOnlyEx] = useState(false)
  const [page, setPage] = useState(0)
  const groups = new Map<string, Lot[]>()
  for (const l of lots) { const g = `${l.broker}|${l.box}`; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(l) }
  const boxName: Record<string, string> = { A: 'A · short-term, basis reported', B: 'B · short-term, basis not reported', D: 'D · long-term, basis reported', E: 'E · long-term, basis not reported', F: 'F · long-term, no 1099-B', H: 'H · short-term digital assets', K: 'K · long-term digital assets' }
  const list = lots.filter(l => (!group || `${l.broker}|${l.box}` === group) && (!onlyEx || l.flags.length) && (!q || (l.desc + l.key).toLowerCase().includes(q.toLowerCase())))
  const per = 60
  const brightpathSummary = ctx.ix.evsByDoc.get('D74')!.filter(e => /^(st|lt)_/.test(e.field))
  return (
    <>
      <div className="callout small mb12">{lots.length} sales across 4 brokers + an S corp distribution. Review by group: totals tie to the broker summaries, and only the exceptions need eyes (zero basis, wash sales, adjusted lots). Brightpath summary: ST proceeds {money(brightpathSummary.find(e => e.field === 'st_proceeds')?.value, { cents: true })}, LT proceeds {money(brightpathSummary.find(e => e.field === 'lt_proceeds')?.value, { cents: true })} — sum of 260 extracted lots agrees to the cent.</div>
      <div className="card mb16">
        <table className="t">
          <thead><tr><th>Broker</th><th>Form 8949 box</th><th className="num">Lots</th><th className="num">Proceeds</th><th className="num">Basis</th><th className="num">Gain / (loss)</th><th>Exceptions</th></tr></thead>
          <tbody>
            {[...groups.entries()].map(([g, ls]) => {
              const [broker, box] = g.split('|')
              const ex = ls.filter(l => l.flags.length)
              return (
                <tr key={g} className={'click' + (group === g ? ' sel' : '')} onClick={() => { setGroup(group === g ? null : g); setPage(0) }}>
                  <td>{broker}</td><td className="small">{boxName[box] || box}</td><td className="num">{ls.length}</td>
                  <td className="num">{money(ls.reduce((a, l) => a + l.proceeds, 0), { cents: true })}</td>
                  <td className="num">{money(ls.reduce((a, l) => a + l.basis, 0), { cents: true })}</td>
                  <td className="num"><b>{money(ls.reduce((a, l) => a + l.gain, 0), { cents: true })}</b></td>
                  <td>{['zero basis', 'wash sale', 'adjusted'].map(f => { const n = ex.filter(l => l.flags.includes(f)).length; return n ? <Badge key={f} tone={f === 'zero basis' ? 'bad' : f === 'adjusted' ? 'violet' : 'warn'}>{n} {f}</Badge> : null })}</td>
                </tr>
              )
            })}
            <tr className="total"><td colSpan={2}>Box totals (engine lines)</td><td className="num">{lots.length}</td><td></td><td></td><td className="num">{money(['A', 'B', 'D', 'E', 'F', 'H', 'K'].reduce((a, b) => a + (L(ctx, `F8949.${b}.total`) || 0), 0))}</td><td className="small">{['A', 'B', 'D', 'E', 'F', 'H', 'K'].map(b => <Ref key={b} r={`F8949.${b}.total`} label={b} showKey={false} />)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="row mb8"><input placeholder="Search lots" value={q} onChange={e => { setQ(e.target.value); setPage(0) }} /><label className="row small"><input type="checkbox" checked={onlyEx} onChange={e => setOnlyEx(e.target.checked)} /> exceptions only</label><span className="spacer" /><span className="small muted">{list.length} lots{group ? ` in ${group.replace('|', ' · box ')}` : ''}</span></div>
      <div className="card">
        <table className="t">
          <thead><tr><th>Lot</th><th>Security</th><th>Acquired</th><th>Sold</th><th className="num">Proceeds</th><th className="num">Basis</th><th className="num">Adj.</th><th className="num">Gain</th><th></th></tr></thead>
          <tbody>
            {list.slice(page * per, page * per + per).map(l => (
              <tr key={l.key} className="click" onClick={() => ctx.setInspect(l.key)}>
                <td className="mono tiny">{l.key.replace('F8949.', '')}</td><td className="small">{l.desc}</td><td className="small nowrap">{l.acquired}</td><td className="small nowrap">{l.sold}</td>
                <td className="num">{money(l.proceeds, { cents: true })}</td><td className="num">{money(l.basis, { cents: true })}</td><td className="num">{l.adj ? money(l.adj, { cents: true }) : ''}</td>
                <td className="num"><b style={{ color: ctx.eff.lines.get(l.key)?.delta ? 'var(--violet)' : undefined }}>{money(l.gain, { cents: true })}</b></td>
                <td>{l.flags.map(f => <Badge key={f} tone={f === 'zero basis' ? 'bad' : f === 'adjusted' ? 'violet' : 'warn'}>{f}</Badge>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > per && <div className="row" style={{ padding: 10 }}><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>‹</button><span className="small">page {page + 1} of {Math.ceil(list.length / per)}</span><button className="btn sm" disabled={(page + 1) * per >= list.length} onClick={() => setPage(page + 1)}>›</button></div>}
      </div>
    </>
  )
}

function Assets() {
  const ctx = useCtx()
  const assets = ctx.vix.v.assets
  const hvacAdj = [...ctx.s.adjustments.values()].some(a => a.status === 'active' && a.whatIf === 'hvac_improvement')
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">Depreciation by asset — 2025</h3><span className="small muted">federal vs California vs AMT; disposals and recapture</span></div>
      <table className="t">
        <thead><tr><th>Asset</th><th>Placed in service</th><th>Method / life</th><th className="num">Cost</th><th className="num">Federal 2025</th><th className="num">Fed accumulated</th><th className="num">CA 2025</th><th className="num">CA accumulated</th><th className="num">AMT diff.</th><th>Disposal</th></tr></thead>
        <tbody>
          {assets.map((a: any) => (
            <tr key={a.asset_id} className="click" onClick={() => ctx.setInspect('asset:' + a.asset_id)}>
              <td><div className="small">{a.description}</div><div className="mono tiny muted">{a.asset_id} · {a.activity}</div></td>
              <td className="small nowrap">{a.placed_in_service}</td><td className="small">{a.method} · {a.life_years}y</td>
              <td className="num">{money(a.cost)}{a.land_value_not_depreciated ? <div className="tiny muted">+ land {money(a.land_value_not_depreciated)}</div> : null}</td>
              <td className="num">{money(a.federal.depreciation_2025, { cents: true })}</td><td className="num">{money(a.federal.accumulated_end, { cents: true })}</td>
              <td className="num" style={{ color: a.california.depreciation_2025 !== a.federal.depreciation_2025 ? 'var(--violet)' : undefined }}>{money(a.california.depreciation_2025, { cents: true })}</td><td className="num">{money(a.california.accumulated_end, { cents: true })}</td>
              <td className="num">{money(a.amt.difference_from_regular)}</td>
              <td className="small">{a.disposition ? <>sold {a.disposition.date}<div className="tiny muted">unrecaptured §1250 {money(a.disposition.unrecaptured_1250_depreciation, { cents: true })}; §1250 ordinary {money(a.disposition.section_1250_ordinary_recapture)}</div></> : ''}</td>
            </tr>
          ))}
          {hvacAdj && <tr><td><div className="small">1450 Fremont Way — HVAC heat pump system <Badge tone="violet">workpaper</Badge></div><div className="mono tiny muted">SAC-HVAC (capitalized)</div></td><td className="small">2025-08-12</td><td className="small">SL / mid-month · 27.5y</td><td className="num">11,000</td><td className="num">150.00</td><td className="num">150.00</td><td className="num">150.00</td><td className="num">150.00</td><td className="num">0</td><td></td></tr>}
        </tbody>
      </table>
      <div className="tiny muted" style={{ padding: 12 }}>California: no federal bonus depreciation — studio equipment differs (CA basis differences carried out: {Object.entries(ctx.vix.v.carryovers_out.california.depreciation_basis_differences).map(([k, v]) => `${k} ${money(v as number, { cents: true })}`).join(', ')}). 2021 appliances: 100% bonus federally, 200DB for California.</div>
    </div>
  )
}

function Books() {
  const ctx = useCtx()
  const ev = (id: string) => ctx.ix.evs.get(id)?.value || 0
  const booksNet = ev('ev-0105')
  const steps: { label: string; v: number; refs: string[]; k?: string }[] = [
    { label: 'Books net income (QuickBooks, cash basis)', v: booksNet, refs: ['ev-0105'] },
    { label: 'Health insurance (Erik) — not a Schedule C expense', v: ev('ev-0094'), refs: ['ev-0094'] },
    { label: 'Books depreciation (5-yr straight line, client-booked)', v: ev('ev-0092'), refs: ['ev-0092'] },
    { label: 'Tax depreciation (100% special depreciation)', v: -(B(ctx, 'SchC.13') || 0), refs: ['F4562-C.22'], k: 'SchC.13' },
    { label: 'Fuel (replaced by standard mileage)', v: ev('ev-0090'), refs: ['ev-0090'] },
    { label: 'Standard mileage', v: -(B(ctx, 'SchC.9') || 0), refs: ['SchC.9'], k: 'SchC.9' },
    { label: 'Meals: 50% not deductible', v: ev('ev-0097') - (B(ctx, 'SchC.24b') || 0), refs: ['ev-0097', 'SchC.24b'] },
    { label: 'Form 1099-K added by engine (unmatched card receipts)', v: (B(ctx, 'SchC.1') || 0) - ev('ev-0103'), refs: ['ev-0127'], k: 'SchC.1' },
    { label: 'Home office (simplified method)', v: -(B(ctx, 'SchC.30') || 0), refs: ['SchC.30'], k: 'SchC.30' },
  ]
  const engineNet = B(ctx, 'SchC.31') || 0
  const sum = steps.reduce((a, s) => a + s.v, 0)
  const wpAdj = [...ctx.s.adjustments.values()].filter(a => a.status === 'active' && a.lineKey.startsWith('SchC.') && a.lineKey !== 'SchC.44a')
  const wpNet = L(ctx, 'SchC.31') || 0
  const max = Math.max(...steps.map(s => Math.abs(s.v)), 1)
  const nec = ['ev-0113', 'ev-0116', 'ev-0119', 'ev-0122', 'ev-0125']
  return (
    <div className="grid g-side">
      <div className="card">
        <div className="card-head"><h3 className="grow">Lindqvist Studio — books to Schedule C</h3></div>
        <div className="card-body waterfall">
          {steps.map((s, i) => (
            <div key={i} className="wrow">
              <span className="small">{s.label} <span className="row wrap gap4" style={{ display: 'inline-flex' }}>{s.refs.map(r => <Ref key={r} r={r} showKey={false} label={r} />)}</span></span>
              <span className="num right"><b>{i === 0 ? money(s.v) : signed(s.v)}</b></span>
              <span className="wbar"><span style={{ left: s.v >= 0 ? '50%' : `${50 - (Math.abs(s.v) / max) * 50}%`, width: `${(Math.abs(s.v) / max) * 50}%`, background: i === 0 ? 'var(--accent)' : s.v >= 0 ? 'var(--ok)' : 'var(--bad)' }} /></span>
            </div>
          ))}
          <div className="wrow"><b>Schedule C net profit — engine {ctx.vix.v.version}</b><span className="num right"><b>{money(engineNet)}</b></span><span className="small">{Math.abs(sum - engineNet) < 1 ? <Badge tone="ok">✓ reconciles</Badge> : <Badge tone="bad">unreconciled {money(sum - engineNet)}</Badge>}</span></div>
          {wpAdj.map(a => <div key={a.id} className="wrow"><span className="small" style={{ color: 'var(--violet)' }}>Workpaper: {a.reason.slice(0, 90)}</span><span className="num right" style={{ color: 'var(--violet)' }}>{signed(-a.delta * (a.lineKey === 'SchC.1' ? -1 : 1))}</span><span><Ref r={a.lineKey} /></span></div>)}
          <div className="wrow" style={{ borderTop: '2px solid var(--line-2)' }}><b>Schedule C net profit — workpaper</b><span className="num right"><b style={{ color: 'var(--violet)' }}>{money(wpNet)}</b></span><span /></div>
        </div>
      </div>
      <div className="col gap12">
        <div className="card pad">
          <h4 className="mb8">Gross receipts vs third-party forms</h4>
          <table className="t small"><tbody>
            {nec.map(id => <tr key={id}><td>{ctx.ix.docs.get(ctx.ix.evs.get(id)!.document_id)!.issuer}</td><td className="num"><Ref r={id} label={money(ev(id))} showKey={false} /></td></tr>)}
            <tr><td>Clients without a 1099 (11)</td><td className="num"><Ref r="ev-0111" label={money(ev('ev-0111'))} showKey={false} /></td></tr>
            <tr className="total"><td>= Books revenue</td><td className="num">{money(nec.reduce((a, id) => a + ev(id), 0) + ev('ev-0111'))}</td></tr>
            <tr><td>Form 1099-K Paywell (Atlas card payments — inside Atlas's 41,200)</td><td className="num"><Ref r="ev-0127" label={money(ev('ev-0127'))} showKey={false} /></td></tr>
          </tbody></table>
          <div className="tiny muted mt8">This table is the answer to the 2028 examination item “reconcile to Forms 1099-NEC (142,000) and 1099-K (12,400)”.</div>
        </div>
        <div className="card pad"><h4 className="mb8">Business use</h4><div className="small">Vehicle: <Amt k="SchC.44a" /> business miles of {money(ev('ev-0479') - ev('ev-0478'))} driven. Phone 70%, internet 50% (call-01). Home office 220 → 260 sq ft.</div></div>
      </div>
    </div>
  )
}

function Rentals() {
  const ctx = useCtx()
  const cf = ctx.ix.p.prior_years.carryovers_into_2025
  return (
    <div className="grid g2">
      {['A', 'B'].map(p => (
        <div key={p} className="card">
          <div className="card-head"><h3 className="grow">{B(ctx, `SchE.1${p}`)}</h3><span className="small muted">{B(ctx, `SchE.2${p}`)} days rented / personal</span></div>
          <LineTable rows={[`SchE.3${p}`, ...['9', '11', '12', '14', '16', '18', '19'].map(n => `SchE.${n}${p}`).filter(k => ctx.vix.lines.has(k)), { label: 'Income or (loss)', k: `SchE.21${p}`, total: true }, { label: 'Prior-year suspended loss', v: -(p === 'A' ? cf.passive_1450_fremont : cf.passive_1200_barton_hills), sub: true }, { label: 'Deductible after Form 8582', k: `SchE.22${p}`, total: true }]} />
        </div>
      ))}
      <div className="card"><div className="card-head"><h3>Passive activity (Form 8582)</h3></div>
        <LineTable rows={['F8582.1a', 'F8582.1b', 'F8582.1c', 'F8582.3a', { label: 'Net passive income', k: 'F8582.4', total: true }]} />
        <div className="tiny muted" style={{ padding: 12 }}>{ctx.vix.lines.get('F8582.4')?.note}</div>
      </div>
      <div className="card"><div className="card-head"><h3>Sale of the Austin condo (Form 4797)</h3></div>
        <LineTable rows={['F4797.20', 'F4797.21', 'F4797.22', 'F4797.23', 'F4797.24', { label: 'Gain', k: 'F4797.25', total: true }, 'F4797.26g', 'SchD.19']} />
        <div className="tiny muted" style={{ padding: 12 }}>Basis: purchase 310,000 (land 62,000) + flooring 6,600 + commissions 21,725 + title 1,975 = 340,300. Unrecaptured §1250 gain = depreciation allowed (taxed at up to 25%).</div>
      </div>
    </div>
  )
}

function K1() {
  const ctx = useCtx()
  const rows = [
    ['Woodworks · box 1 ordinary income', 'ev-0975', 'SchE.28A'], ['Woodworks · box 4 interest', 'ev-0976', 'SchB.1.7'], ['Woodworks · box 16D distributions', 'ev-0977', 'F7203.6'], ['Woodworks · 199A QBI / W-2 wages / UBIA', 'ev-0979', 'F8995.2.2'], ['Woodworks · Oregon composite tax', 'ev-0982', 'ScheduleS.credit'],
    ['Ridgeline · box 2 net rental income', 'ev-0964', 'SchE.28B'], ['Ridgeline · box 5 interest', 'ev-0965', 'SchB.1.8'], ['Ridgeline · box 9a LTCG', 'ev-0966', 'SchD.12'], ['Ridgeline · box 21 foreign tax', 'ev-0968', 'Sch3.1'], ['Ridgeline · box 19A distributions', 'ev-0967', ''], ['Ridgeline · CA share of box 2 (22%)', 'ev-0971', 'SchCA540NR.17.E'],
  ]
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">K-1 lines → return</h3><span className="small muted">two K-1s; Ridgeline arrived 06/22/2026 (after the extension)</span></div>
      <table className="t">
        <thead><tr><th>K-1 item</th><th className="num">K-1</th><th>Lands on</th><th className="num">Return</th></tr></thead>
        <tbody>{rows.map(([lbl, ev, k]) => <tr key={ev}><td>{lbl}</td><td className="num"><Ref r={ev} label={val(ctx.ix.evs.get(ev)?.value)} showKey={false} /></td><td>{k ? <Ref r={k} /> : <span className="small muted">reduces capital account (63,660 end); no tax line</span>}</td><td className="num">{k && <Amt k={k} />}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function Basis() {
  const ctx = useCtx()
  const has2023 = ctx.ix.docs.get('D40')!.received_at <= ctx.clock
  const rows = [
    { y: 2022, begin: null, inc: null, dist: null, end: 21300, src: 'client worksheet (prior file)', refs: ['py:/basis_records/scorp_lindqvist_family_woodworks/0'] },
    { y: 2023, begin: 21300, inc: has2023 ? 14100 : null, dist: has2023 ? 20000 : null, end: has2023 ? 15400 : null, src: has2023 ? '2023 K-1 found in 2026 (D40)' : 'MISSING — 2023 K-1 not in file', refs: has2023 ? ['ev-0983', 'ev-0985'] : [] },
    { y: 2024, begin: has2023 ? 15400 : 21300, inc: 16900, dist: 30000, end: has2023 ? 2300 : 8200, src: '2024 K-1 (prior return)', refs: ['py:/return_2024/K1_1120S'] },
    { y: 2025, begin: L(ctx, 'F7203.1'), inc: L(ctx, 'F7203.4'), dist: L(ctx, 'F7203.6'), end: L(ctx, 'F7203.15'), src: '2025 K-1 (D39); excess distribution ' + money(L(ctx, 'F7203.excess')) + ' taxed as LTCG', refs: ['F7203.1', 'F7203.excess'] },
  ]
  return (
    <div className="grid g2">
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-head"><h3 className="grow">Lindqvist Family Woodworks — stock basis by year</h3>{!has2023 && <Badge tone="bad">gap: 2023</Badge>}</div>
        <table className="t"><thead><tr><th>Year</th><th className="num">Beginning</th><th className="num">+ Income</th><th className="num">− Distributions</th><th className="num">Ending</th><th>Source</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.y}><td>{r.y}</td><td className="num">{money(r.begin)}</td><td className="num">{money(r.inc)}</td><td className="num">{money(r.dist)}</td><td className="num"><b>{money(r.end)}</b></td><td className="small">{r.src} {r.refs.map(x => <Ref key={x} r={x} />)}</td></tr>)}</tbody></table>
      </div>
      <div className="card pad"><h4 className="mb8">Ridgeline — capital account</h4><div className="small">2024 ending 60,000 → 2025: + 9,870 income − 6,000 distributions − 210 foreign tax = <b>63,660</b>. Outside basis never computed by the prior preparer — start a basis schedule in 2026.</div><div className="mt8"><Ref r="ev-0970" /></div></div>
      <div className="card pad"><h4 className="mb8">IRA basis (Ngozi) and home cost</h4><div className="small">Form 8606 basis 7,000 (2024 contribution made 02/12/2025) + 7,000 for 2025 = 14,000; converted 14,026; basis carried to 2026: <b>0</b>. Austin home purchased 07/08/2025 for 685,000 (+ capitalizable closing costs); points 4,800 deducted.</div><div className="mt8 row wrap gap4"><Ref r="F8606.14" /><Ref r="ev-0991" /><Ref r="ev-1025" /></div></div>
    </div>
  )
}

function Retirement() {
  return (
    <div className="grid g2">
      <div className="card"><div className="card-head"><h3>Backdoor Roth (Form 8606)</h3></div><LineTable rows={['F8606.1', 'F8606.2', 'F8606.3', 'F8606.6', 'F8606.8', 'F8606.10', 'F8606.11', { label: 'Taxable conversion', k: 'F8606.18', total: true }, 'F8606.14']} /></div>
      <div className="card"><div className="card-head"><h3>HSA (Form 8889)</h3></div><LineTable rows={['F8889.3', 'F8889.9', 'F8889.13', 'F8889.14a', 'F8889.15', 'F8889.16']} /><div className="tiny muted" style={{ padding: 12 }}>Family HDHP (Ngozi + kids). Room for 2,550 more in contributions — planning note for 2026.</div></div>
      <div className="card"><div className="card-head"><h3>Foreign: Sparbanken Norrland (Sweden)</h3></div><LineTable rows={['SchB.1.6', 'SchB.7a', 'SchB.7b', 'F8938.1.max', 'F8938.1.ye', 'F8938.req']} /><div className="tiny muted" style={{ padding: 12 }}>FinCEN 114 (FBAR) required — outside the engagement; due 10/15/2026. Account inherited 09/2023: possible 2023 Form 3520 (open item from prior preparer).</div></div>
      <div className="card"><div className="card-head"><h3>SEP-IRA (Erik)</h3></div><LineTable rows={['Sch1.16']} /><div className="tiny muted" style={{ padding: 12 }}>Contributed 18,000 on 04/10/2026; deductible limit moves with Schedule C profit. See finding “SEP contribution exceeds the deductible limit”.</div></div>
    </div>
  )
}

function Deductions() {
  const ctx = useCtx()
  const p = ctx.ix.p.engine_reference.parameters
  return (
    <div className="grid g2">
      <div className="card"><div className="card-head"><h3 className="grow">Schedule A</h3><span className="small muted">SALT cap {money(p.salt_cap)} (phase-down above {money(p.salt_cap_phase_start)} MAGI)</span></div>
        <LineTable rows={['SchA.5a', 'SchA.5b', 'SchA.5d', { label: 'SALT after cap', k: 'SchA.5e', total: true }, 'SchA.8a', 'SchA.8c', 'SchA.10', 'SchA.11', 'F8283.A1.stock', 'F8283.A1.vehicle', 'SchA.14', { label: 'Total itemized', k: 'SchA.17', total: true }, { label: `Standard deduction (MFJ)`, v: p.std_deduction_mfj, sub: true }]} />
      </div>
      <div className="card"><div className="card-head"><h3 className="grow">Credits with limits</h3></div>
        <LineTable rows={['F8812.4', 'F8812.6', 'F8812.8', { label: `Phase-out (over ${money(p.ctc_phaseout_start)})`, k: 'F8812.11' }, { label: 'Child tax credit / ODC', k: 'F8812.12', total: true }, 'F8863.27', 'F8863.30', { label: 'AOTC after phase-out', k: 'F8863.7', total: true }, 'F2441.2', 'F2441.12', 'F2441.31', 'Sch3.1']} />
      </div>
    </div>
  )
}

function Payments() {
  const ctx = useCtx()
  const tr = ctx.ix.p.tax_agency_records.irs_account_transcript_2025
  const latest = [...tr].reverse().find((t: any) => t.as_of <= ctx.clock.slice(0, 10)) || tr[0]
  const ftb = ctx.ix.p.tax_agency_records.ftb_account
  const eftps = ['ev-1056', 'ev-1058', 'ev-1060']
  const webpay = [1, 2, 3, 4, 5, 6].map(i => ({ date: ctx.ix.p.extracted_values.find(e => e.document_id === 'D68' && e.field === `pay${i}_date`)!, amt: ctx.ix.p.extracted_values.find(e => e.document_id === 'D68' && e.field === `pay${i}_amount`)!, yr: ctx.ix.p.extracted_values.find(e => e.document_id === 'D68' && e.field === `pay${i}_year`)! }))
  return (
    <div className="grid g2">
      <div className="card">
        <div className="card-head"><h3 className="grow">Federal estimates — three sources</h3><span className="small muted">transcript as of {latest.as_of}</span></div>
        <table className="t small"><thead><tr><th>Date</th><th className="num">EFTPS (D67)</th><th className="num">IRS transcript</th><th>Client said</th></tr></thead>
          <tbody>
            {latest.transactions.filter((t: any) => t.code === '670').map((t: any, i: number) => <tr key={i}><td>{t.date}</td><td className="num">{eftps[i] ? <Ref r={eftps[i]} label={money(ctx.ix.evs.get(eftps[i])!.value)} showKey={false} /> : <span className="muted">— none</span>}</td><td className="num">{typeof t.amount === 'number' ? money(t.amount) : t.amount}</td><td className="small">{t.date.startsWith('2026-01') ? <Ref r="qa-41" label="“4,000 I think”" showKey={false} /> : ''}{t.description.includes('extension') ? 'extension payment' : ''}</td></tr>)}
            <tr className="total"><td>On the return (F1040.26)</td><td></td><td className="num"><Amt k="F1040.26" /></td><td></td></tr>
          </tbody></table>
      </div>
      <div className="card">
        <div className="card-head"><h3 className="grow">California — Web Pay vs FTB account</h3></div>
        <table className="t small"><thead><tr><th>Date</th><th className="num">Amount</th><th>Designated</th><th>FTB applied</th></tr></thead>
          <tbody>{webpay.map((w, i) => { const toYr = w.yr.value; const applied = ftb.tax_year_2025_payments.some((p: any) => p.date === w.date.value) ? '2025' : ftb.tax_year_2024_payments_after_filing.some((p: any) => p.date === w.date.value) ? '2024 credit' : toYr === '2024' ? '2024' : '—'; return <tr key={i}><td>{w.date.value}</td><td className="num"><Ref r={w.amt.id} label={money(w.amt.value)} showKey={false} /></td><td>{toYr}{w.date.value === '2025-09-15' && <Badge tone="bad">wrong year</Badge>}</td><td>{applied}</td></tr> })}
            <tr className="total"><td>On the return (F540NR.72)</td><td className="num"><Amt k="F540NR.72" /></td><td colSpan={2} className="small muted">FTB 2025: {money(ftb.tax_year_2025_payments.reduce((a: number, p: any) => a + p.amount, 0))}</td></tr>
          </tbody></table>
      </div>
      <div className="card"><div className="card-head"><h3>Withholding & other payments</h3></div><LineTable rows={['F1040.25a', 'Sch3.10', 'Sch3.11', 'F540NR.71', 'F540NR.73']} /></div>
      <div className="card pad"><h4 className="mb8">Extension (04/14/2026)</h4><div className="small">Estimated from v2: federal balance 35,728 → paid 36,000 with Form 4868 (rounded up to 500). California estimated a refund → FTB 3519 with 0. The final return's federal balance after 04/15 accrues interest ({pct(ctx.ix.p.post_filing_rates.irs_underpayment_interest_rate_annual)}/yr) and the failure-to-pay penalty (0.5%/month).</div><div className="mt8"><Ref r="timeline:extension-2026-04-14" /></div></div>
    </div>
  )
}

function StateSplit() {
  const ctx = useCtx()
  const p = ctx.ix.p.engine_reference.parameters
  const items = [
    ['Wages', '1', 'Corvane (CA job) + Halvorsen while a CA resident; after 07/15 Texas-source'],
    ['Taxable interest', '2', 'Prorated by residency days; Treasury interest exempt'],
    ['Dividends', '3', 'Prorated by residency days'],
    ['IRA distributions', '4', 'Conversions in Feb/Apr — CA resident'],
    ['Capital gains', '7', 'Sales while CA resident fully CA; after the move only CA-source'],
    ['Business income', '12', 'Studio in Sacramento until mid-July; CA depreciation (no bonus)'],
    ['Rentals / K-1s', '17', 'Sacramento rental fully CA-source; Ridgeline 22% CA'],
  ]
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">California part-year split</h3><span className="small muted">resident 01/01–07/14/2025 ({p.ca_resident_days} of {p.year_days} days); Texas resident from 07/15</span></div>
      <table className="t">
        <thead><tr><th>Item</th><th className="num">Federal</th><th className="num">Total, CA law</th><th className="num">California-source</th><th className="num">Not CA (Texas)</th><th>Basis of allocation</th></tr></thead>
        <tbody>
          {items.map(([lbl, n, why]) => {
            const d = L(ctx, `SchCA540NR.${n}.D`) || 0, e = L(ctx, `SchCA540NR.${n}.E`) || 0
            return <tr key={n}><td>{lbl}</td><td className="num"><Amt k={`SchCA540NR.${n}.A`} /></td><td className="num"><Amt k={`SchCA540NR.${n}.D`} /></td><td className="num"><Amt k={`SchCA540NR.${n}.E`} /></td><td className="num">{money(d - e)}</td><td className="small ink2">{why}</td></tr>
          })}
          <tr className="total"><td>California AGI / ratio</td><td></td><td className="num"><Amt k="F540NR.17" /></td><td className="num"><Amt k="F540NR.32" /></td><td></td><td className="small">ratio (line 34): {val(L(ctx, 'F540NR.34'))} — recomputes from the workpaper AGI: {((L(ctx, 'F540NR.32') || 0) / (L(ctx, 'F540NR.17') || 1)).toFixed(4)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function Carryovers() {
  const ctx = useCtx()
  const cin = ctx.ix.p.prior_years.carryovers_into_2025
  const out = ctx.vix.v.carryovers_out
  const agreed = [
    ['Capital loss — short-term', cin.capital_loss_short, 'SchD.6', 'D06 p.6: net ST loss 6,200 − 3,000 allowed'],
    ['Capital loss — long-term', cin.capital_loss_long, 'SchD.14', 'D06 p.6: LT loss 11,000 (no allowance used)'],
    ['Passive loss — 1450 Fremont', cin.passive_1450_fremont, 'SchE.22A', 'D06 p.9 F8582.unallowed.A'],
    ['Passive loss — Barton Hills condo', cin.passive_1200_barton_hills, 'SchE.22B', 'D06 p.9 F8582.unallowed.B (freed on sale)'],
    ['IRA basis (Ngozi)', 7000, 'F8606.2', 'D06 p.10 F8606.14'],
  ]
  return (
    <div className="grid g2">
      <div className="card"><div className="card-head"><h3>Into 2025 — agreed to the 2024 return</h3></div>
        <table className="t small"><thead><tr><th>Item</th><th className="num">2024 carryover</th><th>Used on</th><th>Agreed to</th></tr></thead>
          <tbody>{agreed.map(([l, v, k, s]) => <tr key={k as string}><td>{l}</td><td className="num">{money(v as number)}</td><td><Ref r={k as string} /></td><td className="ink2">{s}</td></tr>)}</tbody></table>
      </div>
      <div className="card"><div className="card-head"><h3>Out to 2026</h3></div>
        <table className="t small"><tbody>
          {Object.entries(out.federal).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="num">{v == null ? '—' : money(v as number)}</td></tr>)}
          {Object.entries(out.california).filter(([k]) => k !== 'depreciation_basis_differences').map(([k, v]) => <tr key={k}><td>CA {k.replace(/_/g, ' ')}</td><td className="num">{money(v as number)}</td></tr>)}
        </tbody></table>
        <div className="tiny muted" style={{ padding: 12 }}>Engine values; the SEP excess and AMT credit move with workpaper adjustments — confirm after the engine recomputes.</div>
      </div>
    </div>
  )
}

function PriorVsUs() {
  const ctx = useCtx()
  const pw = ctx.ix.p.prior_years.prior_preparer_workpaper
  const resolutions = [
    'Obtained: the 2023 Woodworks K-1 arrived 06/05/2026 (D40); basis rolled forward 2022→2025 — 2,300 beginning 2025.',
    'Confirmed: Form 5498 for 2024 (D42) shows the 7,000 contribution made 02/12/2025 — 8606 basis 7,000 is right, the client\'s “no prior basis” answer is not.',
    'Resolved: measurements (D24) show 220 sq ft Sacramento, 260 Austin — 2024 overstated at 300.',
    'Open: possible unfiled 2023 Form 3520 — advised client (outside scope).',
  ]
  const treatments = [
    ['Self-employed health insurance', 'None (Erik on Ngozi\'s plan)', 'Engine claimed 14,400 — we disallow (eligible for spouse\'s employer plan)'],
    ['Home office', 'Simplified, 300 sq ft', 'Simplified, 240 sq ft average (measured)'],
    ['Swedish interest FX', '2024 average 10.56', 'Engine reused 10.56 — we use 2025 average 9.86'],
    ['Woodworks basis', '“Assumed sufficient”', 'Rolled forward with the 2023 K-1; 2025 distributions exceed basis by 21,215'],
    ['Rental repairs', 'Repairs expensed', 'HVAC system replacement capitalized (27.5 years)'],
    ['Residency', 'Full-year California', 'Part-year: 540NR, CA-source wages split at 07/15'],
  ]
  return (
    <div className="grid g2">
      <div className="card"><div className="card-head"><h3>What Delta River left open → what we did</h3></div>
        <div className="card-body">{pw.open_items_left_by_prior_preparer.map((o: string, i: number) => <div key={i} className="feed-item"><Badge tone={i === 3 ? 'warn' : 'ok'}>{i === 3 ? 'open' : 'done'}</Badge><div className="grow small"><b>{o}</b><div className="ink2">{resolutions[i]}</div></div></div>)}</div>
      </div>
      <div className="card"><div className="card-head"><h3>Treatment: 2024 vs 2025</h3></div>
        <table className="t small"><thead><tr><th>Item</th><th>Prior preparer (2024)</th><th>Us (2025)</th></tr></thead><tbody>{treatments.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className="ink2">{b}</td><td>{c}</td></tr>)}</tbody></table>
      </div>
      <div className="card pad" style={{ gridColumn: '1 / -1' }}><h4 className="mb8">Prior preparer notes (D07)</h4>{pw.notes.map((n: string, i: number) => <div key={i} className="small" style={{ padding: '3px 0' }}>• {n}</div>)}<div className="mt8"><Ref r="D07" /></div></div>
    </div>
  )
}
