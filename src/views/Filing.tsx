import React, { useMemo, useState } from 'react'
import { useCtx, blockers, signoffState, areaFingerprint, findingState, Ctx } from '../ctx'
import { Badge, Ref, Who, Modal, Field, Empty, Avatar } from '../ui'
import { AREAS } from '../areas'
import { money, date, dateTime, hash, uid, signed, pct } from '../format'
import { diagnosticsState } from './Findings'
import { buildResponsePackage, ResponsePackage } from './Examiner'

export function returnFingerprint(ctx: Ctx) {
  const parts = AREAS.map(a => areaFingerprint(ctx, a.id).fingerprint).join('|')
  const sum = JSON.stringify(ctx.eff.summary)
  const theo = ctx.s.corrections.get('household:theo.ssn')?.value || ''
  return hash(parts + sum + theo)
}

export function requiredSteps(ctx: Ctx) {
  const chk = (id: string) => { const c = ctx.checks.find(x => x.id === id); return c ? !findingState(ctx, c).open : false }
  const manual = (k: string) => ctx.s.steps.get(k)?.done || false
  const diags = diagnosticsState(ctx)
  const explained = ctx.variances.every(v => [...ctx.s.notes.values()].some(n => n.kind === 'variance' && n.refs.includes(v.key)))
  const so = AREAS.map(a => signoffState(ctx, a.id) as any)
  const rfp = returnFingerprint(ctx)
  const partner = [...ctx.s.signoffs].reverse().find(x => x.area === '_return' && x.level === 'partner' && !x.revoked)
  const approval = ctx.s.filing.approval
  const auto = {
    'Engagement letter and consents signed': { done: ['D01', 'D02'].every(d => ctx.ix.docs.get(d)!.received_at <= ctx.clock), how: 'D01 and D02 signed 01/12/2026', manual: false },
    'Identity verified': { done: manual('Identity verified'), how: 'Driver licenses D04/D05; IP PIN notice D03', manual: true },
    'Prior-year return reviewed': { done: manual('Prior-year return reviewed'), how: 'D06, D07 and the prior preparer\'s open items', manual: true },
    'All documents accounted for': { done: chk('docs-accounted'), how: 'every document on a line or dispositioned', manual: false },
    'Prior-year variances explained': { done: explained, how: `${ctx.variances.length} changes over the firm threshold`, manual: false },
    'Carryovers agreed to prior year': { done: manual('Carryovers agreed to prior year'), how: 'Schedules → Carryovers', manual: true },
    'Estimated payments agreed to IRS and FTB records': { done: chk('est-fed') && chk('est-ca'), how: 'IRS transcript and FTB account', manual: false },
    'Due diligence completed': { done: chk('due-diligence'), how: 'Form 8867 decision recorded', manual: false },
    'Diagnostics resolved': { done: diags.every(d => d.resolved), how: `${diags.filter(d => d.resolved).length}/${diags.length} engine diagnostics`, manual: false },
    'Reviewer sign-off': { done: so.every(x => x.reviewer.so && !x.reviewer.stale), how: `${so.filter(x => x.reviewer.so && !x.reviewer.stale).length}/${AREAS.length} areas`, manual: false },
    'Partner sign-off': { done: !!partner && partner.fingerprint === rfp, how: partner ? (partner.fingerprint === rfp ? `by ${ctx.userName(partner.by)}` : 'reopened — the return changed after signing') : 'not signed', manual: false },
    'Client approval and e-file authorization': { done: !!approval && approval.fingerprint === rfp, how: approval ? (approval.fingerprint === rfp ? `Form 8879 signed by ${ctx.userName(approval.by)}` : 'void — the return changed after the client approved') : 'not yet', manual: false },
  } as Record<string, { done: boolean; how: string; manual: boolean }>
  return (ctx.s.standards.required_steps as string[]).map(s => ({ step: s, ...(auto[s] || { done: manual(s), how: 'firm-added step', manual: true }) }))
}

export function Filing() {
  const ctx = useCtx()
  const bl = useMemo(() => blockers(ctx), [ctx.s, ctx.eff, ctx.checks, ctx.variances])
  const steps = requiredSteps(ctx)
  const rfp = returnFingerprint(ctx)
  const partnerSo = [...ctx.s.signoffs].reverse().find(x => x.area === '_return' && x.level === 'partner' && !x.revoked)
  const approval = ctx.s.filing.approval
  const approvalCurrent = !!approval && approval.fingerprint === rfp
  const subs = ctx.s.filing.submissions
  const accepted = subs.find(s => s.jurisdiction === 'federal' && s.status === 'accepted')
  const caAccepted = subs.find(s => s.jurisdiction === 'california' && s.status === 'accepted')
  const ext = ctx.ix.timeline.get('extension-2026-04-14')
  const extFiled = ctx.clock >= ext.at
  const [pkg, setPkg] = useState(false)
  const [copy, setCopy] = useState(false)
  const stepsLeft = steps.filter(s => !s.done && !['Client approval and e-file authorization', 'Partner sign-off'].includes(s.step))
  const readyForPartner = bl.filter(b => !(b.kind === 'sign-off' && b.text.includes('Partner'))).length === 0
  const submit = () => {
    const theo = ctx.s.corrections.get('household:theo.ssn')?.value || ctx.ix.people.get('theo').ssn
    const ssa = ctx.ix.evs.get('ev-1080')!.value // the SSA record of Theo's number (matches his card)
    const ok = theo === ssa
    const id = uid('sub')
    ctx.emit('filing.submit', { id, jurisdiction: 'federal', status: ok ? 'accepted' : 'rejected', errors: ok ? [] : [{ code: 'R0000-504-02', message: "Dependent's taxpayer identification number and name control must match the e-file database (dependent 2: Theo Lindqvist-Okafor)." }] }, { action: 'submit' })
    ctx.emit('filing.submit', { id: uid('sub'), jurisdiction: 'california', status: ok ? 'accepted' : 'not_transmitted', errors: ok ? [] : [{ code: 'STATE-HOLD', message: 'State return held because the federal return was rejected.' }] }, { action: 'submit' })
    if (ok) {
      ctx.emit('filing.freeze', { snapshot: { lines: Object.fromEntries([...ctx.eff.lines].map(([k, v]) => [k, v.value])), summary: ctx.eff.summary, fingerprint: rfp, adjustments: ctx.eff.activeAdjustments.map(a => a.id), version: ctx.vix.v.version } }, { action: 'submit' })
      ctx.toast({ text: 'Federal and California accepted. The return is frozen as filed.', kind: 'ok' })
    } else ctx.toast({ text: 'Federal e-file REJECTED: R0000-504-02 (dependent SSN). California held.', kind: 'error' })
  }
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1>Review & filing</h1><p>Filing is gated: open findings, blocking review notes, unexplained variances, missing approvals and stale sign-offs all hold it. After acceptance the return freezes; later changes become an amendment on top.</p></div></div>
      <div className="grid g-side">
        <div className="col gap16">
          <div className="card">
            <div className="card-head"><h3 className="grow">What's holding the return</h3>{bl.length ? <Badge tone="bad">{bl.length}</Badge> : <Badge tone="ok">nothing</Badge>}</div>
            <div className="card-body">
              {bl.map((b, i) => <a key={i} href={'#' + (b.go || '/filing')} className="feed-item" style={{ color: 'var(--ink)' }}><Badge tone="muted">{b.kind}</Badge><span className="grow small">{b.text}</span><span className="muted">›</span></a>)}
              {!bl.length && <div className="callout ok">Every finding is resolved, every note closed, every area signed and current.</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="grow">Required steps (firm standard)</h3><span className="small muted">{steps.filter(s => s.done).length}/{steps.length}</span></div>
            <table className="t">
              <tbody>
                {steps.map(s => (
                  <tr key={s.step}>
                    <td style={{ width: 28 }}>{s.done ? <span style={{ color: 'var(--ok)' }}>✓</span> : <span className="muted">○</span>}</td>
                    <td><div className="small"><b>{s.step}</b></div><div className="tiny muted">{s.how}{s.manual && ctx.s.steps.get(s.step)?.done ? ` · ${ctx.userName(ctx.s.steps.get(s.step)!.by)}` : ''}</div></td>
                    <td style={{ width: 120 }}>{s.manual && ctx.can('step') && <button className="btn sm" onClick={() => ctx.emit('step', { step: s.step, done: !s.done }, { action: 'step' })}>{s.done ? 'Undo' : 'Mark done'}</button>}{!s.manual && <span className="tiny muted">automatic</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="grow">Sign-off matrix</h3></div>
            <table className="t small">
              <thead><tr><th>Area</th><th>Preparer</th><th>Reviewer</th><th>Partner</th></tr></thead>
              <tbody>
                {AREAS.map(a => { const so = signoffState(ctx, a.id) as any; const c = (x: any) => !x.so ? <span className="muted">—</span> : x.stale ? <Badge tone="warn" title={x.changes.join('\n')}>⟳ reopened</Badge> : <span className="row gap4"><Avatar id={x.so.by} name={ctx.userName(x.so.by)} size={18} />✓</span>; return <tr key={a.id} className="click" onClick={() => ctx.go(`/area/${a.id}`)}><td>{a.name}</td><td>{c(so.preparer)}</td><td>{c(so.reviewer)}</td><td>{c(so.partner)}</td></tr> })}
                <tr className="total"><td>The return as a whole</td><td colSpan={2} className="small muted">covers every area + the bottom line + dependents</td><td>{partnerSo ? partnerSo.fingerprint === rfp ? <Badge tone="ok">✓ {ctx.userName(partnerSo.by)}</Badge> : <Badge tone="warn">⟳ reopened</Badge> : ctx.can('signoff.partner') ? <button className="btn sm primary" disabled={!readyForPartner} title={readyForPartner ? '' : 'Clear the blockers first'} onClick={() => ctx.emit('signoff', { area: '_return', level: 'partner', fingerprint: rfp, snapshot: { summary: ctx.eff.summary } }, { action: 'signoff.partner' })}>Partner sign-off</button> : <span className="muted">—</span>}{partnerSo && partnerSo.fingerprint !== rfp && ctx.can('signoff.partner') && <button className="btn sm" disabled={!readyForPartner} onClick={() => ctx.emit('signoff', { area: '_return', level: 'partner', fingerprint: rfp, snapshot: { summary: ctx.eff.summary } }, { action: 'signoff.partner' })}>Re-sign</button>}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="col gap16">
          <Step n={1} title="Extension" done={extFiled || !!ctx.s.filing.extension}>
            {extFiled ? <div className="small">Filed {date(ext.at)} by {ctx.userName(ext.actor)}: Form 4868 with <b>36,000</b>, FTB 3519 with 0 (estimated from v2: {money(ctx.ix.p.what_if.extension.federal.estimated_balance)} federal balance, CA refund). <Ref r="timeline:extension-2026-04-14" /></div> : <div className="small muted">Due 04/15/2026. The engine estimate (v2) would be {money(ctx.ix.p.what_if.extension.federal.estimated_balance)} federal.</div>}
          </Step>
          <Step n={2} title="Client approval & Form 8879" done={approvalCurrent}>
            {approval ? (approvalCurrent ? <div className="small">Approved and signed by {ctx.userName(approval.by)} on {dateTime(approval.at)} — matches the current return.</div> : <div className="callout warn small">The client approved a different version (the return changed since). Ask them to re-approve.</div>) : <div className="small muted">The client reviews the summary in their portal and signs with their PIN. Approval binds to this exact return; any later change voids it.</div>}
            <div className="row mt8"><button className="btn sm" onClick={() => setCopy(true)}>Preview client copy</button>{!partnerSo && <span className="tiny muted">partner sign-off first</span>}</div>
          </Step>
          <Step n={3} title="E-file" done={!!accepted}>
            {subs.map(s => <div key={s.id} className="row small" style={{ padding: '3px 0' }}><Badge tone={s.status === 'accepted' ? 'ok' : s.status === 'rejected' ? 'bad' : 'muted'}>{s.status}</Badge><span>{s.jurisdiction}</span><span className="muted grow">{date(s.seasonAt)}</span>{s.errors.map((e: any) => <span key={e.code} className="tiny" title={e.message}>{e.code}</span>)}</div>)}
            {subs.filter(s => s.status === 'rejected').slice(-1).map(s => <div key={s.id} className="callout bad small mt8">{s.errors[0]?.message} → Fix: correct Theo's SSN (finding “Theo's SSN…”) and resubmit. The rejection is part of the record.</div>)}
            {!accepted && ctx.can('submit') && <button className="btn primary sm mt8" disabled={!approvalCurrent || !partnerSo || partnerSo.fingerprint !== rfp} onClick={submit}>Transmit federal + California</button>}
            {!accepted && !ctx.can('submit') && <div className="tiny muted mt8">Only the signing partner (Helen Strand, PTIN P00876543) transmits.</div>}
            {ctx.clock >= '2026-07-13T17:04:00Z' && <div className="tiny muted mt8">Packet replay: the scripted season shows a federal rejection on 07/13 (R0000-504-02) and acceptance on 07/14. <Ref r="agency:/efile" /></div>}
          </Step>
          <Step n={4} title="Frozen as filed" done={!!ctx.s.filing.frozen}>
            {ctx.s.filing.frozen ? <>
              <div className="small">Frozen {dateTime(ctx.s.filing.frozen.at)} — federal balance {money(ctx.s.filing.frozen.snapshot.summary.federal.balance_due)}, California {money(ctx.s.filing.frozen.snapshot.summary.california.balance_due)}.</div>
              <PostFiling />
              {ctx.can('amend') && <button className="btn sm mt8" onClick={() => { const r = prompt('Reason for amendment (Form 1040-X / 540X)?'); if (r) ctx.emit('filing.amend', { reason: r }, { action: 'amend' }) }}>Start amendment</button>}
              {ctx.s.filing.amendments.map(a => <div key={a.n} className="small mt8"><Badge tone="violet">Amendment {a.n}</Badge> {a.reason} — {ctx.userName(a.by)}</div>)}
            </> : <div className="small muted">On acceptance the return is snapshotted. Everything after is recorded on top as an amendment; the filed version is always available in Compare.</div>}
          </Step>
          <Step n={5} title="After filing" done={false}>
            <div className="col gap4">
              <button className="btn sm" onClick={() => setCopy(true)}>Client copy (print / PDF)</button>
              <button className="btn sm" onClick={() => setPkg(true)}>Notice response package (Letter 566)</button>
              <a className="btn sm" href="#/filing" onClick={e => { e.preventDefault(); downloadRollforward(ctx) }}>Roll forward to 2026 (download)</a>
            </div>
            <NextYear />
          </Step>
        </div>
      </div>
      {copy && <ClientCopy onClose={() => setCopy(false)} />}
      {pkg && <Modal title="Letter 566 response package" onClose={() => setPkg(false)} wide><ResponsePackage pkg={buildResponsePackage(ctx)} /></Modal>}
    </div>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="card pad">
      <div className="row mb8"><span className="avatar" style={{ background: done ? 'var(--ok)' : 'var(--line-2)', color: done ? '#fff' : 'var(--ink-2)' }}>{done ? '✓' : n}</span><h3 className="grow">{title}</h3></div>
      {children}
    </div>
  )
}

function monthsBetween(a: string, b: string) {
  return Math.max(0, (+new Date(b) - +new Date(a)) / (30.4375 * 86400000))
}

function PostFiling() {
  const ctx = useCtx()
  const f = ctx.s.filing.frozen!
  const bal = f.snapshot.summary.federal.balance_due
  const r = ctx.ix.p.post_filing_rates
  const payDate = ctx.s.filing.payments.find(p => p.jurisdiction === 'federal')?.seasonAt || ctx.clock
  const days = Math.max(0, (+new Date(payDate) - +new Date('2026-04-15T00:00:00Z')) / 86400000)
  const interest = bal > 0 ? bal * r.irs_underpayment_interest_rate_annual * days / 365 : 0
  const ftp = bal > 0 ? bal * r.irs_failure_to_pay_penalty_per_month * Math.ceil(monthsBetween('2026-04-15T00:00:00Z', payDate)) : 0
  const paid = ctx.s.filing.payments.find(p => p.jurisdiction === 'federal')
  return (
    <div className="callout small mt8">
      {bal > 0 ? <>
        Federal balance {money(bal)} paid after 04/15 — the extension extended time to file, not to pay. Estimated interest {money(Math.round(interest))} and failure-to-pay penalty {money(Math.round(ftp))} through {date(payDate)} (IRS computes; transcript codes 196/276).
        {!paid && ctx.can('payment') && <div className="mt8"><button className="btn sm" onClick={() => ctx.emit('filing.payment', { jurisdiction: 'federal', amount: bal, kind: 'direct debit' }, { action: 'payment' })}>Record payment</button></div>}
        {paid && <div className="mt8">Paid {money(paid.amount)} on {date(paid.seasonAt)}.</div>}
      </> : <>Federal refund of {money(-bal)} by direct deposit. The 36,000 extension payment exceeded the final tax.</>}
      <div className="mt8">California: {f.snapshot.summary.california.balance_due < 0 ? `refund ${money(-f.snapshot.summary.california.balance_due)}` : `balance ${money(f.snapshot.summary.california.balance_due)}`}. Client action: ask FTB to move the 3,500 2024 credit.</div>
    </div>
  )
}

function NextYear() {
  const ctx = useCtx()
  const tax = ctx.eff.summary.federal.total_tax
  const safe = Math.ceil(tax * 1.1 / 4 / 50) * 50
  const plan = ctx.ix.p.planning_reference_2026
  return (
    <div className="mt12 small">
      <h4 className="mb8">2026 plan</h4>
      <div>Federal estimates: 110% of 2025 tax ({money(tax)}) = <b>{money(safe)}</b> per quarter on {plan.federal_estimate_due_dates.map((d: string) => d.slice(5)).join(', ')}.</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {plan.known_2026_changes_for_this_household.map((x: string) => <li key={x}>{x}</li>)}
        <li>Withdraw or carry the excess SEP; start a Ridgeline outside-basis schedule; HSA room 2,550; Halvorsen payroll must stop CA withholding.</li>
      </ul>
    </div>
  )
}

export function downloadRollforward(ctx: Ctx) {
  const data = {
    format: 'miraflores-rollforward', from_tax_year: 2025, to_tax_year: 2026, client: ctx.ix.p.packet.client_id, created: new Date().toISOString(),
    filed: ctx.s.filing.frozen?.snapshot.summary || null,
    carryovers: ctx.vix.v.carryovers_out,
    basis: ctx.ix.p.prior_years.basis_records,
    assets: ctx.vix.v.assets,
    adjustments_made: ctx.eff.activeAdjustments.map(a => ({ line: a.lineKey, delta: a.delta, reason: a.reason, by: a.by, at: a.at })),
    decisions: [...ctx.s.decisions.values()],
    open_items: [...ctx.s.notes.values()].filter(n => n.status !== 'resolved').map(n => ({ subject: n.subject, body: n.body })),
    outside_filings: ctx.checks.find(c => c.id === 'outside-filings')?.summary,
    planning: ctx.ix.p.planning_reference_2026,
    history: ctx.s.events,
  }
  ctx.emit('rollforward', {}, { action: 'rollforward' })
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'okafor-lindqvist-2026-rollforward.json'; a.click()
}

export function ClientCopy({ onClose }: { onClose: () => void }) {
  const ctx = useCtx()
  const s = ctx.s.filing.frozen?.snapshot.summary || ctx.eff.summary
  const p = ctx.ix.priorLines
  return (
    <Modal title="Client copy — 2025 return summary" onClose={onClose} wide foot={<><span className="small muted grow">Sensitive numbers are masked on the client copy.</span><button className="btn" onClick={() => window.print()}>Print / save PDF</button><button className="btn primary" onClick={onClose}>Close</button></>}>
      <div className="small">
        <p><b>Ngozi Okafor & Erik Lindqvist</b> — married filing jointly · Form 1040 and California Form 540NR (part-year resident to 07/14/2025). Prepared by Miraflores; signed by Helen Strand, CPA.</p>
        <table className="t"><thead><tr><th></th><th className="num">2024</th><th className="num">2025</th></tr></thead><tbody>
          <tr><td>Adjusted gross income</td><td className="num">{money(p['F1040.11'])}</td><td className="num">{money(s.federal.agi)}</td></tr>
          <tr><td>Federal total tax</td><td className="num">{money(p['F1040.24'])}</td><td className="num">{money(s.federal.total_tax)}</td></tr>
          <tr><td>Federal payments</td><td className="num">{money(p['F1040.33'])}</td><td className="num">{money(s.federal.payments)}</td></tr>
          <tr className="total"><td>Federal {s.federal.balance_due > 0 ? 'amount you owe' : 'refund'}</td><td className="num">refund {money(p['F1040.34'])}</td><td className="num">{money(Math.abs(s.federal.balance_due))}</td></tr>
          <tr><td>California total tax</td><td className="num">{money(p['CA540.64'])}</td><td className="num">{money(s.california.total_tax)}</td></tr>
          <tr className="total"><td>California {s.california.balance_due > 0 ? 'amount you owe' : 'refund'}</td><td className="num">owed {money(p['CA540.111'])}</td><td className="num">{money(Math.abs(s.california.balance_due))}</td></tr>
        </tbody></table>
        <h4 className="mt16 mb8">What changed from what you told us</h4>
        <ul>
          <li>Your car donation is limited to what the charity sold it for (2,900), not the Blue Book value.</li>
          <li>Erik's health insurance isn't deductible because he could have been on Ngozi's employer plan.</li>
          <li>The 4th-quarter federal estimate was 3,000 (IRS records), and the 09/15/2025 California payment was applied to 2024 — ask FTB to move it.</li>
          <li>The HVAC replacement at Fremont Way is depreciated over 27.5 years rather than deducted at once.</li>
        </ul>
        <h4 className="mt16 mb8">You still need to</h4>
        <ul>
          <li>File FinCEN Form 114 (FBAR) for the Sparbanken account by 10/15/2026.</li>
          <li>File 2025 Forms 1099-NEC for Mara Quintero and Dev Patel (late).</li>
          <li>Talk to us about a possible 2023 Form 3520 for the inheritance.</li>
          <li>Withdraw the excess SEP contribution before the extended due date.</li>
        </ul>
        <p className="tiny muted">Bank account for refund/payment: {ctx.ix.p.household.bank_account_for_refund_or_payment.bank} ••••{ctx.ix.p.household.bank_account_for_refund_or_payment.account.slice(-4)}.</p>
      </div>
    </Modal>
  )
}
