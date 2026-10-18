import React, { useState } from 'react'
import { useCtx, blockers, findingState } from '../ctx'
import { Badge, Tabs, Avatar, Field, Empty } from '../ui'
import { ROLE_LABEL, can } from '../model'
import { date } from '../format'
import { exportLog, importLog } from '../store'

const ACTIONS = ['verify', 'adjust', 'approve_adjustment_partner', 'signoff.preparer', 'signoff.reviewer', 'signoff.partner', 'question_client', 'submit', 'standards', 'view_sensitive', 'client_approve']

export function Firm({ tab: t0 }: { tab?: string }) {
  const [tab, setTab] = useState(t0 || 'standards')
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Firm</h1><p>Standards every engagement runs on, who can do what, who looked at sensitive data, and status across the firm.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'standards', label: 'Standards' }, { id: 'roles', label: 'Staff & roles' }, { id: 'access', label: 'Sensitive data log' }, { id: 'status', label: 'Engagement status' }, { id: 'data', label: 'Data & retention' }]} />
      {tab === 'standards' && <Standards />}
      {tab === 'roles' && <Roles />}
      {tab === 'access' && <Access />}
      {tab === 'status' && <Status />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

function Standards() {
  const ctx = useCtx()
  const st = ctx.s.standards
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(st)))
  const [newStep, setNewStep] = useState('')
  const [newRule, setNewRule] = useState('')
  const edit = ctx.can('standards')
  const save = () => ctx.emit('standards.update', { standards: draft }, { action: 'standards' }) && ctx.toast({ text: 'Firm standards updated — every engagement now uses them.', kind: 'ok' })
  return (
    <div className="grid g2">
      <div className="card pad">
        <h3 className="mb12">Variance review</h3>
        <div className="row gap12">
          <Field label="Flag if change over (%)"><input disabled={!edit} type="number" value={draft.variance_review.flag_if_change_over_percent} onChange={e => setDraft({ ...draft, variance_review: { ...draft.variance_review, flag_if_change_over_percent: +e.target.value } })} /></Field>
          <Field label="and over amount"><input disabled={!edit} type="number" value={draft.variance_review.and_over_amount} onChange={e => setDraft({ ...draft, variance_review: { ...draft.variance_review, and_over_amount: +e.target.value } })} /></Field>
        </div>
        <div className="small muted">Currently {ctx.variances.length} lines flagged on this return.</div>
        <h3 className="mt16 mb8">Verification types</h3>
        {draft.verification_types.map((v: string) => <Badge key={v}>{v.replace(/_/g, ' ')}</Badge>)}
        <h3 className="mt16 mb8">Review levels</h3>
        {draft.review_levels.map((v: string) => <Badge key={v} tone="info">{v}</Badge>)}
      </div>
      <div className="card pad">
        <h3 className="mb8">Rules</h3>
        {draft.rules.map((r: string, i: number) => <div key={i} className="row small" style={{ padding: '4px 0' }}><span className="grow">• {r}</span>{edit && <button className="icon-btn tiny" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_: any, j: number) => j !== i) })}>✕</button>}</div>)}
        {edit && <div className="row mt8"><input className="grow" value={newRule} onChange={e => setNewRule(e.target.value)} placeholder="Add a rule" /><button className="btn sm" onClick={() => { if (newRule) { setDraft({ ...draft, rules: [...draft.rules, newRule] }); setNewRule('') } }}>Add</button></div>}
        <h3 className="mt16 mb8">Required steps before filing</h3>
        {draft.required_steps.map((r: string, i: number) => <div key={i} className="row small" style={{ padding: '3px 0' }}><span className="muted" style={{ width: 22 }}>{i + 1}.</span><span className="grow">{r}</span>{edit && <button className="icon-btn tiny" onClick={() => setDraft({ ...draft, required_steps: draft.required_steps.filter((_: any, j: number) => j !== i) })}>✕</button>}</div>)}
        {edit && <div className="row mt8"><input className="grow" value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="Add a required step" /><button className="btn sm" onClick={() => { if (newStep) { setDraft({ ...draft, required_steps: [...draft.required_steps, newStep] }); setNewStep('') } }}>Add</button></div>}
      </div>
      <div style={{ gridColumn: '1 / -1' }} className="row">
        {edit ? <button className="btn primary" onClick={save}>Save standards</button> : <span className="small muted">Only the firm administrator (Jo Kimura) can change standards. Switch role to edit.</span>}
      </div>
    </div>
  )
}

function Roles() {
  const ctx = useCtx()
  return (
    <div className="card">
      <table className="t">
        <thead><tr><th>Person</th><th>Role</th><th>Clearance</th>{ACTIONS.map(a => <th key={a} className="tiny" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 120 }}>{a.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>
          {ctx.users.map(u => (
            <tr key={u.id}>
              <td><span className="row"><Avatar id={u.id} name={u.name} size={22} />{u.name}</span>{u.note && <div className="tiny muted">{u.note}</div>}</td>
              <td className="small">{ROLE_LABEL[u.role]}{u.credential ? `, ${u.credential}` : ''}</td>
              <td>{u.clearance ? <Badge tone="ok">yes</Badge> : <Badge tone="warn">masked</Badge>}</td>
              {ACTIONS.map(a => <td key={a} style={{ textAlign: 'center' }}>{can(u, a) ? '●' : <span className="muted">·</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tiny muted" style={{ padding: 12 }}>Also enforced: nobody reviews or signs off on work they prepared or adjusted; adjustments with a tax effect over 1,000 need the partner; Sam Adeyemi (quality reviewer) starts 01/04/2027.</div>
    </div>
  )
}

function Access() {
  const ctx = useCtx()
  const log = [...ctx.s.accessLog].reverse()
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">Every unmasked view of sensitive data</h3><span className="small muted">SSNs, bank and account numbers, IP PINs</span></div>
      <table className="t">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th></tr></thead>
        <tbody>{log.map((l, i) => <tr key={i}><td className="small">{new Date(l.at).toLocaleString()}</td><td>{ctx.userName(l.by)}</td><td className="small">{l.what}</td><td className="mono tiny">{l.ref}</td></tr>)}</tbody>
      </table>
      {!log.length && <Empty>No unmasked views yet. Everything sensitive is masked until a cleared person reveals it.</Empty>}
    </div>
  )
}

function Status() {
  const ctx = useCtx()
  const bl = blockers(ctx)
  const open = ctx.checks.filter(c => findingState(ctx, c).open).length
  const hours = ctx.s.time.reduce((a, t) => a + t.hours, 0)
  const budget = Object.values(ctx.ix.p.firm.budget_hours as Record<string, number>).reduce((a, b) => a + b, 0)
  const stage = ctx.s.filing.frozen ? 'Filed' : ctx.s.filing.approval ? 'Client signed' : [...ctx.s.signoffs].some(s => s.area === '_return') ? 'Partner signed' : ctx.s.signoffs.length ? 'In review' : ctx.s.events.length ? 'In preparation' : 'Not started'
  return (
    <div className="card">
      <table className="t">
        <thead><tr><th>Client</th><th>Return</th><th>Stage</th><th>Due</th><th className="num">Open findings</th><th className="num">Blockers</th><th className="num">Hours</th><th>Team</th></tr></thead>
        <tbody>
          <tr className="click" onClick={() => ctx.go('/')}>
            <td>{ctx.profile.shortName} <span className="tiny muted">{ctx.profile.clientId}</span></td><td>2025 1040 + 540NR</td><td><Badge tone="info">{stage}</Badge></td><td>{date('2026-10-15')} (extended)</td>
            <td className="num">{open}</td><td className="num">{bl.length}</td><td className="num">{hours.toFixed(1)} / {budget}</td>
            <td className="row gap4">{['st-01', 'st-02', 'st-03'].map(id => <Avatar key={id} id={id} name={ctx.userName(id)} size={20} />)}</td>
          </tr>
        </tbody>
      </table>
      <div className="tiny muted" style={{ padding: 12 }}>One engagement in this prototype; the status board is per-engagement state the firm view aggregates.</div>
    </div>
  )
}

function DataTab() {
  const ctx = useCtx()
  return (
    <div className="grid g2">
      <div className="card pad">
        <h3 className="mb8">Export / import the workpaper</h3>
        <p className="small ink2">The workpaper is the packet (read-only input) plus an append-only event log. Export the log to archive it with the return or move it to another machine; importing merges by event id.</p>
        <div className="row">
          <button className="btn" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportLog()], { type: 'application/json' })); a.download = 'okafor-lindqvist-2025-workpaper-events.json'; a.click() }}>Export event log</button>
          <label className="btn" style={{ cursor: 'pointer' }}>Import<input type="file" accept=".json" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) { importLog(await f.text()); ctx.toast({ text: 'Imported', kind: 'ok' }) } }} /></label>
        </div>
      </div>
      <div className="card pad">
        <h3 className="mb8">Retention</h3>
        <p className="small ink2">Firm rule: records retained 7 years after filing, then destroyed. {ctx.s.filing.frozen ? <>Filed {date(ctx.s.filing.frozen.seasonAt)} → destroy after <b>{date(new Date(+new Date(ctx.s.filing.frozen.seasonAt) + 7 * 365.25 * 86400000).toISOString())}</b>.</> : 'Retention clock starts at filing.'} The 2028 examination falls inside the window.</p>
      </div>
    </div>
  )
}
