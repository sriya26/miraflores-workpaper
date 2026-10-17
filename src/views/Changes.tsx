import React, { useMemo, useState } from 'react'
import { useCtx } from '../ctx'
import { Badge, Ref, Tabs, Empty, Who, Delta } from '../ui'
import { AdjustmentCard } from './Inspector'
import { money, signed, val, date } from '../format'
import { computeEffective, isActive } from '../effective'
import { areaOfLine, AREA_BY_ID } from '../areas'
import { useAdjust } from './Modals'

export function Changes({ tab: t0 }: { tab?: string }) {
  const [tab, setTab] = useState(t0 || 'ledger')
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Adjustments & versions</h1><p>Nothing is overwritten. Every change keeps the original, who made it, why, its tax effect and its approvals. Compare any two versions, or try a what-if without committing it.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'ledger', label: 'Adjustment ledger' }, { id: 'compare', label: 'Compare versions' }, { id: 'whatif', label: 'What-ifs' }]} />
      {tab === 'ledger' && <Ledger />}
      {tab === 'compare' && <Compare />}
      {tab === 'whatif' && <WhatIf />}
    </div>
  )
}

function Ledger() {
  const ctx = useCtx()
  const [filter, setFilter] = useState('active')
  const all = [...ctx.s.adjustments.values()].sort((a, b) => (a.at < b.at ? 1 : -1))
  const pending = all.filter(a => {
    if (!isActive(a)) return false
    const e = ctx.eff.effects.get(a.id)
    return e && (Math.abs(e.fed) > 1000 || Math.abs(e.ca) > 1000) && !a.approvals.some(x => x.level === 'partner')
  })
  const list = filter === 'active' ? all.filter(isActive) : filter === 'pending' ? pending : filter === 'reverted' ? all.filter(a => a.status === 'reverted' || a.rejected) : all
  const batches = new Map<string, typeof list>()
  for (const a of list) { const b = a.batch || a.id; if (!batches.has(b)) batches.set(b, []); batches.get(b)!.push(a) }
  const t = ctx.eff.total
  const approveAll = () => {
    const ids = pending.filter(a => a.by !== ctx.user.id).map(a => ({ type: 'adjust.approve', payload: { id: a.id, level: 'partner' } }))
    ctx.emitMany(ids, { action: 'approve_adjustment_partner' })
  }
  return (
    <>
      <div className="grid g4 mb16">
        <div className="card pad stat"><div className="lbl">Active adjustments</div><div className="big">{all.filter(isActive).length}</div></div>
        <div className="card pad stat"><div className="lbl">Federal tax / balance effect</div><div className="big">{signed(t.fed)} <span className="small muted">/ {signed(t.fed + t.fedBalance)}</span></div></div>
        <div className="card pad stat"><div className="lbl">California tax / balance effect</div><div className="big">{signed(t.ca)} <span className="small muted">/ {signed(t.ca + t.caBalance)}</span></div></div>
        <div className="card pad stat"><div className="lbl">Awaiting partner</div><div className="big" style={{ color: pending.length ? 'var(--warn)' : undefined }}>{pending.length}</div></div>
      </div>
      <div className="row mb12">
        <div className="pill-toggle">{[['active', 'Active'], ['pending', `Awaiting partner (${pending.length})`], ['reverted', 'Reverted / rejected'], ['all', 'All']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <span className="spacer" />
        {ctx.user.role === 'partner' && pending.length > 0 && <button className="btn primary sm" onClick={approveAll}>Approve all {pending.filter(a => a.by !== ctx.user.id).length} as partner</button>}
      </div>
      {[...batches.entries()].map(([b, adjs]) => (
        <div key={b} className="mb12">
          {adjs.length > 1 && (
            <div className="row small mb8"><b>Batch of {adjs.length}</b><span className="muted">· {ctx.userName(adjs[0].by)} · {new Date(adjs[0].at).toLocaleString()}</span><span className="spacer" />
              {ctx.can('adjust') && adjs.some(isActive) && <button className="btn sm ghost" onClick={() => {
                const evs = ctx.emitMany(adjs.filter(isActive).map(a => ({ type: 'adjust.revert', payload: { id: a.id, reason: 'Batch undo' } })), { action: 'adjust' })
                ctx.toast({ text: `Reverted ${evs.length} adjustments`, undo: () => ctx.emitMany(evs.map(e => ({ type: 'adjust.restore', payload: { id: e.payload.id } })), { action: 'adjust' }) })
              }}>Undo whole batch</button>}
            </div>
          )}
          {adjs.map(a => <AdjustmentCard key={a.id} id={a.id} />)}
        </div>
      ))}
      {!list.length && <Empty>No adjustments {filter !== 'all' ? `(${filter})` : ''}. Apply a fix from Findings, or open any line and choose Adjust.</Empty>}
    </>
  )
}

type VerKey = string // 'v1' | 'v2' | 'v3' | 'wp' | 'filed'

function Compare() {
  const ctx = useCtx()
  const opts: { id: VerKey; label: string }[] = [
    ...[...ctx.ix.versions.values()].map(v => ({ id: v.v.version, label: `Engine ${v.v.version} · ${date(v.v.computed_at)}` })),
    { id: 'wp', label: 'Workpaper (now)' },
    ...(ctx.s.filing.frozen ? [{ id: 'filed', label: `As filed · ${date(ctx.s.filing.frozen.seasonAt)}` }] : []),
  ]
  const [a, setA] = useState<VerKey>(ctx.vix.v.version)
  const [b, setB] = useState<VerKey>('wp')
  const [onlyChanged, setOnly] = useState(true)
  const view = (k: VerKey) => {
    if (k === 'wp') return { lines: new Map([...ctx.eff.lines].map(([key, l]) => [key, l.value])), summary: ctx.eff.summary }
    if (k === 'filed') { const f = ctx.s.filing.frozen!.snapshot; return { lines: new Map(Object.entries(f.lines)), summary: f.summary } }
    const v = ctx.ix.versions.get(k)!
    return { lines: new Map(v.v.lines.map(l => [l.key, l.value])), summary: v.v.summary }
  }
  const A = view(a), B = view(b)
  const keys = [...new Set([...A.lines.keys(), ...B.lines.keys()])].filter(k => !/^F8949\.[A-K]\.X/.test(k))
  const diffs = keys.filter(k => A.lines.get(k) !== B.lines.get(k))
  const shown = onlyChanged ? diffs : keys
  const rows: [string, string, string][] = [['Federal AGI', 'federal', 'agi'], ['Federal total tax', 'federal', 'total_tax'], ['Federal payments', 'federal', 'payments'], ['Federal balance due', 'federal', 'balance_due'], ['CA AGI', 'california', 'ca_agi'], ['CA total tax', 'california', 'total_tax'], ['CA payments', 'california', 'payments'], ['CA balance due', 'california', 'balance_due']]
  return (
    <>
      <div className="row mb12">
        <select value={a} onChange={e => setA(e.target.value)}>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <span>→</span>
        <select value={b} onChange={e => setB(e.target.value)}>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <span className="spacer" />
        <label className="row small"><input type="checkbox" checked={onlyChanged} onChange={e => setOnly(e.target.checked)} /> changed lines only ({diffs.length})</label>
      </div>
      <div className="grid g-side">
        <div className="card">
          <table className="t">
            <thead><tr><th>Line</th><th className="num">{opts.find(o => o.id === a)?.label}</th><th className="num">{opts.find(o => o.id === b)?.label}</th><th className="num">Change</th></tr></thead>
            <tbody>
              {shown.slice(0, 400).map(k => {
                const x = A.lines.get(k), y = B.lines.get(k)
                return (
                  <tr key={k} className="click" onClick={() => ctx.setInspect(k)}>
                    <td><span className="mono tiny muted">{k}</span> <span className="small">{ctx.vix.lines.get(k)?.label || ''}</span></td>
                    <td className="num">{x === undefined ? <span className="muted">—</span> : val(x)}</td>
                    <td className="num">{y === undefined ? <span className="muted">—</span> : val(y)}</td>
                    <td className="num">{typeof x === 'number' && typeof y === 'number' ? <Delta v={y - x} cents={!Number.isInteger(y - x)} /> : x === undefined ? <Badge tone="info">added</Badge> : y === undefined ? <Badge tone="muted">removed</Badge> : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shown.length > 400 && <div className="empty small">{shown.length - 400} more…</div>}
        </div>
        <div className="col gap12">
          <div className="card pad">
            <h4 className="mb8">Summary</h4>
            <table className="t small"><tbody>
              {rows.map(([lbl, j, f]) => { const x = (A.summary as any)[j][f], y = (B.summary as any)[j][f]; return <tr key={lbl}><td>{lbl}</td><td className="num">{money(x)}</td><td className="num">{money(y)}</td><td className="num"><Delta v={y - x} tax={/tax|balance/.test(f)} /></td></tr> })}
            </tbody></table>
          </div>
          {ctx.ix.versions.get(b)?.v.trigger && <div className="card pad small"><h4 className="mb8">Why {b} ran</h4>{ctx.ix.versions.get(b)!.v.trigger}<div className="mt8">Documents added: {ctx.ix.versions.get(b)!.v.documents_used.filter(d => !(ctx.ix.versions.get(a)?.v.documents_used || []).includes(d)).map(d => <Ref key={d} r={d} />)}</div>{ctx.ix.versions.get(b)!.v.documents_superseded.length > 0 && <div className="mt8">Superseded: {ctx.ix.versions.get(b)!.v.documents_superseded.map(d => <Ref key={d} r={d} />)}</div>}</div>}
          <StaleAdjustments />
        </div>
      </div>
    </>
  )
}

function StaleAdjustments() {
  const ctx = useCtx()
  const stale = [...ctx.s.adjustments.values()].filter(a => isActive(a) && a.baseVersion !== ctx.vix.v.version)
  if (!stale.length) return null
  return (
    <div className="card pad">
      <h4 className="mb8">Adjustments made on an older version</h4>
      <div className="small muted mb8">The engine recomputed since these were recorded. Each is kept and carried forward; confirm it still applies.</div>
      {stale.map(a => { const v = ctx.ix.versions.get(a.baseVersion)!.lines.get(a.lineKey)?.value, n = ctx.vix.lines.get(a.lineKey)?.value; return <div key={a.id} className="row small" style={{ padding: '3px 0' }}><Ref r={a.lineKey} /><span className="grow muted">{a.baseVersion}: {val(v)} → {ctx.vix.v.version}: {val(n)}</span>{v !== n && <Badge tone="warn">engine value moved</Badge>}</div> })}
    </div>
  )
}

function WhatIf() {
  const ctx = useCtx()
  const adjust = useAdjust()
  const alts = ctx.ix.p.what_if.alternatives
  const active = [...ctx.s.adjustments.values()].filter(isActive)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [alt, setAlt] = useState<Set<string>>(new Set())
  const sandbox = useMemo(() => computeEffective(ctx.ix, ctx.vix, ctx.s, { include: a => !excluded.has(a.id) }), [excluded, ctx.s, ctx.vix])
  const altFed = alts.filter((x: any) => alt.has(x.id)).reduce((s: number, x: any) => s + x.federal.total_tax_change + (x.federal.penalty_change || 0), 0)
  const altCa = alts.filter((x: any) => alt.has(x.id)).reduce((s: number, x: any) => s + x.california.total_tax_change, 0)
  const fedBal = sandbox.summary.federal.balance_due + altFed, caBal = sandbox.summary.california.balance_due + altCa
  return (
    <div className="grid g-side">
      <div className="col gap12">
        <div className="card">
          <div className="card-head"><h3 className="grow">Engine alternatives</h3><span className="small muted">computed by the engine on {alts[0]?.base_version}</span></div>
          <table className="t">
            <thead><tr><th style={{ width: 30 }}></th><th>Alternative</th><th className="num">Federal</th><th className="num">California</th><th></th></tr></thead>
            <tbody>
              {alts.map((x: any) => {
                const adopted = active.some(a => a.whatIf === x.id)
                return (
                  <tr key={x.id}>
                    <td><input type="checkbox" checked={alt.has(x.id)} disabled={adopted} onChange={e => { const n = new Set(alt); e.target.checked ? n.add(x.id) : n.delete(x.id); setAlt(n) }} /></td>
                    <td><div className="small">{x.description}</div><div className="tiny muted">{x.changed_lines.length} lines change{x.federal.penalty_change ? ` · penalty ${signed(x.federal.penalty_change)}` : ''}</div></td>
                    <td className="num"><Delta v={x.federal.total_tax_change} tax /></td>
                    <td className="num"><Delta v={x.california.total_tax_change} tax /></td>
                    <td>{adopted ? <Badge tone="ok">adopted</Badge> : ctx.can('adjust') && x.changed_lines.length > 0 && <button className="btn sm" onClick={() => {
                      const first = x.changed_lines[0]
                      adjust([{ lineKey: first.key, delta: (first.new ?? 0) - (first.old ?? 0), fedCategory: 'custom', caCategory: 'custom', customFed: x.federal.total_tax_change, customCa: x.california.total_tax_change, whatIf: x.id, reason: `Adopt engine alternative: ${x.description}`, evidence: [] }], 'Adopted what-if')
                    }}>Adopt</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="grow">Try without your adjustments</h3><span className="small muted">untick to see the return without it — nothing is saved</span></div>
          <div className="card-body">
            {active.map(a => { const e = ctx.eff.effects.get(a.id)!; return (
              <label key={a.id} className="row small" style={{ padding: '4px 0' }}>
                <input type="checkbox" checked={!excluded.has(a.id)} onChange={ev => { const n = new Set(excluded); ev.target.checked ? n.delete(a.id) : n.add(a.id); setExcluded(n) }} />
                <span className="mono" style={{ width: 120 }}>{a.lineKey}</span><span className="grow ellipsis">{a.reason}</span>
                <span className="num" style={{ width: 70 }}>{signed(e.fed + e.fedBalance)}</span><span className="num" style={{ width: 60 }}>{signed(e.ca + e.caBalance)}</span>
              </label>
            ) })}
            {!active.length && <div className="small muted">No adjustments yet.</div>}
          </div>
        </div>
      </div>
      <div className="card pad" style={{ alignSelf: 'start', position: 'sticky', top: 12 }}>
        <h4 className="mb8">Scenario</h4>
        <div className="kv small">
          <div>Federal balance</div><div className="num"><b>{money(fedBal)}</b> <span className="muted">(now {money(ctx.eff.summary.federal.balance_due)})</span></div>
          <div>California balance</div><div className="num"><b>{money(caBal)}</b> <span className="muted">(now {money(ctx.eff.summary.california.balance_due)})</span></div>
          <div>Difference</div><div className="num">federal <Delta tax v={fedBal - ctx.eff.summary.federal.balance_due} /> · CA <Delta tax v={caBal - ctx.eff.summary.california.balance_due} /></div>
        </div>
        <div className="tiny muted mt12">Parentheses = refund. Alternatives use the engine's own results; your adjustments use per-dollar rates.</div>
        {(excluded.size > 0 || alt.size > 0) && <button className="btn sm mt12" onClick={() => { setExcluded(new Set()); setAlt(new Set()) }}>Reset scenario</button>}
      </div>
    </div>
  )
}
