import React, { useEffect, useMemo, useState } from 'react'
import { useCtx, findingState, Ctx } from '../ctx'
import { Badge, Ref, Refs, Tabs, Empty, Who } from '../ui'
import type { CheckResult } from '../checks'
import { AREA_BY_ID, AREAS } from '../areas'
import { money, val, signed } from '../format'
import { useAdjust, DecisionModal, NoteModal } from './Modals'
import { adjustmentEffect } from '../effective'

export const KIND_LABEL: Record<string, string> = {
  engine_error: 'Engine error', extraction_error: 'Extraction error', client_answer: 'Client answer', judgment: 'Judgment call',
  completeness: 'Completeness', recompute: 'Independent recompute', outside_filing: 'Outside filing', prior_year: 'Prior year',
}

export const DIAG_MAP: Record<string, string> = {
  DIGITAL_ASSET_BASIS_MISSING: 'crypto-c6', BROKER_SUMMARY_DETAIL_MISMATCH: 'meridian-p32', QUESTIONNAIRE_SALES_CONFLICT: 'qa-conflicts',
  LOW_CONFIDENCE_READ: 'st-brigid', FORM_1099_FILING: 'outside-filings', FBAR_OUTSIDE_RETURN: 'outside-filings', DUE_DILIGENCE_REQUIRED: 'due-diligence',
  CA_AMT_NOT_COMPUTED: 'ca-amt', HOME_OFFICE_AREA_CHANGE: 'home-office', SCORP_BASIS_INCOMPLETE: 'scorp-basis', K1_EXPECTED_NOT_RECEIVED: 'ridgeline-k1',
}

export function diagnosticsState(ctx: Ctx) {
  return ctx.vix.v.diagnostics.map(d => {
    const chk = DIAG_MAP[d.code] ? ctx.checks.find(c => c.id === DIAG_MAP[d.code]) : undefined
    const ack = ctx.s.findingStatus.get('diag:' + d.code)
    const resolved = chk ? !findingState(ctx, chk).open : !!ack
    return { d, chk, ack, resolved }
  })
}

export function estimateFix(ctx: Ctx, c: CheckResult) {
  let fed = 0, ca = 0
  for (const sg of c.suggestions) {
    const base = ctx.eff.lines.get(sg.lineKey)?.value ?? 0
    const delta = sg.delta ?? ((sg.newValue ?? 0) - base)
    const e = adjustmentEffect(ctx.vix, { id: 'x', lineKey: sg.lineKey, baseVersion: '', original: base, delta, fedCategory: sg.fedCategory as any, caCategory: (sg.caCategory ?? sg.fedCategory) as any, customFed: sg.customFed, customCa: sg.customCa, reason: '', evidence: [], by: '', at: '', status: 'active', approvals: [] })
    fed += e.fed + e.fedBalance; ca += e.ca + e.caBalance
  }
  return { fed, ca }
}

export function Findings({ focus }: { focus?: string }) {
  const ctx = useCtx()
  const [tab, setTab] = useState('open')
  const [area, setArea] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const adjust = useAdjust()
  useEffect(() => { if (focus) { setTab('all'); setTimeout(() => document.getElementById('f-' + focus)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) } }, [focus])
  const rows = ctx.checks.map(c => ({ c, st: findingState(ctx, c), est: estimateFix(ctx, c) }))
  const sevRank = { high: 0, medium: 1, low: 2 } as any
  const filtered = rows
    .filter(r => !area || r.c.area === area)
    .filter(r => tab === 'all' ? true : tab === 'open' ? r.st.open : tab === 'resolved' ? !r.st.open : tab === 'fixable' ? r.st.open && r.c.suggestions.length > 0 : tab === 'judgment' ? r.c.status === 'judgment' : true)
    .sort((a, b) => (Number(b.st.open) - Number(a.st.open)) || sevRank[a.c.severity] - sevRank[b.c.severity] || Math.abs(b.est.fed + b.est.ca) - Math.abs(a.est.fed + a.est.ca))
  const fixable = rows.filter(r => r.st.open && r.c.suggestions.length)
  const openCount = rows.filter(r => r.st.open).length
  const totalEst = fixable.reduce((a, r) => ({ fed: a.fed + r.est.fed, ca: a.ca + r.est.ca }), { fed: 0, ca: 0 })
  const applySel = () => {
    const list = rows.filter(r => sel.has(r.c.id) && r.st.open).flatMap(r => r.c.suggestions.map(s => ({ ...s, checkId: r.c.id })))
    adjust(list, `Applied fixes for ${sel.size} finding${sel.size > 1 ? 's' : ''}`)
    setSel(new Set())
  }
  const diags = diagnosticsState(ctx)
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Findings</h1>
          <p>Independent checks read the source documents, client answers and agency records and recompute what the return should say. They don't trust the engine. A finding clears itself when the workpaper value matches.</p>
        </div>
      </div>
      <div className="grid g4 mb16">
        <div className="card pad stat"><div className="lbl">Open findings</div><div className="big" style={{ color: openCount ? 'var(--bad)' : 'var(--ok)' }}>{openCount}</div></div>
        <div className="card pad stat"><div className="lbl">With a proposed fix</div><div className="big">{fixable.length}</div></div>
        <div className="card pad stat"><div className="lbl">Federal effect of all fixes</div><div className="big">{signed(Math.round(totalEst.fed))}</div></div>
        <div className="card pad stat"><div className="lbl">California effect of all fixes</div><div className="big">{signed(Math.round(totalEst.ca))}</div></div>
      </div>
      <div className="row mb8">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: `Open (${openCount})` }, { id: 'fixable', label: `Fix proposed (${fixable.length})` }, { id: 'judgment', label: 'Needs judgment' }, { id: 'resolved', label: 'Resolved' }, { id: 'all', label: 'All' }]} />
        <span className="spacer" />
        <select value={area} onChange={e => setArea(e.target.value)}><option value="">All areas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.short}</option>)}</select>
      </div>
      {ctx.can('adjust') && fixable.length > 0 && (
        <div className="callout row mb12">
          <label className="row small"><input type="checkbox" checked={sel.size > 0 && fixable.every(r => sel.has(r.c.id))} onChange={e => setSel(e.target.checked ? new Set(fixable.map(r => r.c.id)) : new Set())} /> Select all with a fix</label>
          <span className="spacer" />
          <span className="small muted">{sel.size} selected</span>
          <button className="btn primary sm" disabled={!sel.size} onClick={applySel}>Apply selected fixes</button>
          <span className="tiny muted">one batch · undo in one click</span>
        </div>
      )}
      {filtered.map(({ c, st, est }) => <FindingCard key={c.id} c={c} st={st} est={est} selected={sel.has(c.id)} onSelect={v => { const n = new Set(sel); v ? n.add(c.id) : n.delete(c.id); setSel(n) }} focus={focus === c.id} />)}
      {!filtered.length && <Empty>Nothing here.</Empty>}
      <div className="card mt24">
        <div className="card-head"><h3 className="grow">Engine diagnostics ({ctx.vix.v.version})</h3><span className="small muted">each one must be resolved or acknowledged</span></div>
        <table className="t">
          <tbody>
            {diags.map(({ d, chk, ack, resolved }) => (
              <tr key={d.code}>
                <td style={{ width: 24 }}><span className={`dot ${resolved ? 'ok' : d.severity === 'warning' ? 'warn' : 'muted'}`} /></td>
                <td><div className="mono tiny muted">{d.code}</div><div className="small">{d.message}</div></td>
                <td className="small" style={{ width: 260 }}>
                  {chk ? <a href={`#/findings?f=${chk.id}`}>→ {chk.title}</a> : ack ? <span className="muted">Acknowledged by {ctx.userName(ack.by)}: {ack.note}</span> :
                    ctx.can('decide') && <button className="btn sm" onClick={() => { const n = prompt('Acknowledge — note why no action is needed:', d.code === 'AOTC_PHASED_OUT' ? 'MAGI 445k far above 180k phase-out; no credit.' : d.code === 'AMT_CREDIT_CARRYFORWARD' ? 'Minimum tax credit carried to 2026 (Form 8801) - added to next-year plan.' : ''); if (n) ctx.emit('finding.status', { checkId: 'diag:' + d.code, status: 'accepted', note: n }) }}>Acknowledge</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function FindingCard({ c, st, est, selected, onSelect, focus, compact }: { c: CheckResult; st: any; est: { fed: number; ca: number }; selected?: boolean; onSelect?: (v: boolean) => void; focus?: boolean; compact?: boolean }) {
  const ctx = useCtx()
  const [open, setOpen] = useState(!compact || focus)
  const [dec, setDec] = useState(false)
  const [q, setQ] = useState(false)
  const adjust = useAdjust()
  const area = AREA_BY_ID.get(c.area)
  const fs = ctx.s.findingStatus.get(c.id)
  const linkedAdj = [...ctx.s.adjustments.values()].filter(a => a.checkId === c.id && a.status === 'active')
  const doAction = () => {
    const a = c.action!
    if (a.kind === 'correct_household' || a.kind === 'correct_ev') {
      const ev = ctx.emit('correct', { ref: a.payload.ref, value: a.payload.value, reason: c.summary.slice(0, 200) }, { action: 'correct' })
      if (ev) ctx.toast({ text: `Corrected ${a.payload.ref}`, kind: 'ok' })
    } else if (a.kind === 'question') setQ(true)
    else if (a.kind === 'decision') {
      if (c.id === 'st-brigid') { ctx.emit('verify', { ref: 'ev-1049', type: 'confirmed_with_client', note: 'Client confirmed 1,500 with parish by phone; bank statement check #2207 12/21/2025 (msg-08).', evidence: ['msg-08'], value: 1500 }, { action: 'verify' }); return }
      setDec(true)
    }
  }
  return (
    <div id={'f-' + c.id} className={'finding' + (focus ? ' sel' : '')} style={{ display: 'flex', gap: 12 }}>
      <div className={`sev ${st.open ? c.severity : 'low'}`} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row">
          {onSelect && st.open && c.suggestions.length > 0 && ctx.can('adjust') && <input type="checkbox" checked={!!selected} onChange={e => onSelect(e.target.checked)} />}
          <h3 className="grow" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>{c.title}</h3>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <div className="row wrap gap4 mt8">
          <Badge>{KIND_LABEL[c.kind]}</Badge>
          {area && <a href={`#/area/${area.id}`}><Badge tone="info">{area.short}</Badge></a>}
          <Badge tone={c.severity === 'high' ? 'bad' : c.severity === 'medium' ? 'warn' : 'muted'}>{c.severity}</Badge>
          {(Math.round(est.fed) !== 0 || Math.round(est.ca) !== 0) && st.open && <span className="small muted">fix: federal <b>{signed(Math.round(est.fed))}</b> · CA <b>{signed(Math.round(est.ca))}</b></span>}
        </div>
        {open && (
          <>
            <p className="small" style={{ margin: '10px 0 6px' }}>{c.summary}</p>
            {c.detail.map((d, i) => <p key={i} className="small ink2" style={{ margin: '4px 0' }}>{d}</p>)}
            {c.expected !== undefined && c.actual !== undefined && c.status !== 'pass' && (
              <div className="row gap16 small mt8"><span>Expected <b className="num">{val(c.expected)}</b></span><span>Return says <b className="num">{val(c.actual)}</b></span></div>
            )}
            {c.lines.length > 0 && <div className="row wrap gap4 mt8"><span className="tiny muted">Lines</span>{c.lines.slice(0, 8).map(l => <Ref key={l} r={l} />)}</div>}
            {c.evidence.length > 0 && <div className="row wrap gap4 mt8"><span className="tiny muted">Evidence</span><Refs refs={c.evidence} max={6} /></div>}
            {st.open && c.suggestions.length > 0 && (
              <div className="callout mt12">
                <div className="row"><b className="small">Proposed fix</b><span className="spacer" />{ctx.can('adjust') && <button className="btn sm primary" onClick={() => adjust(c.suggestions.map(s => ({ ...s, checkId: c.id })), c.title)}>Apply fix</button>}</div>
                {c.suggestions.map((s, i) => {
                  const base = ctx.eff.lines.get(s.lineKey)?.value
                  return <div key={i} className="small mt8"><span className="mono">{s.lineKey}</span> {money(base)} → <b>{money(s.newValue ?? (base ?? 0) + (s.delta ?? 0))}</b> — {s.reason}</div>
                })}
              </div>
            )}
            {linkedAdj.length > 0 && <div className="small mt8 muted">Fixed by {linkedAdj.map(a => <Ref key={a.id} r={a.lineKey} />)} — {ctx.userName(linkedAdj[0].by)}</div>}
            {fs && <div className="small mt8 muted">{fs.status.replace('_', ' ')} by {ctx.userName(fs.by)}{fs.note ? `: ${fs.note}` : ''}</div>}
            <div className="row mt12 wrap gap4">
              {st.open && c.action && ctx.can(c.action.kind === 'question' ? 'question_client' : c.action.kind === 'decision' ? 'decide' : 'correct') && <button className="btn sm" onClick={doAction}>{c.action.label}</button>}
              {st.open && ctx.can('decide') && <button className="btn sm ghost" onClick={() => { const n = prompt('Accept as is — reason (recorded):'); if (n) ctx.emit('finding.status', { checkId: c.id, status: 'accepted', note: n }) }}>Accept as is</button>}
              {!st.open && fs && ctx.can('decide') && <button className="btn sm ghost" onClick={() => ctx.emit('finding.status', { checkId: c.id, status: 'open', note: 'Reopened' })}>Reopen</button>}
              {ctx.can('note') && <button className="btn sm ghost" onClick={() => setQ(true)}>✎ Note</button>}
            </div>
          </>
        )}
      </div>
      {dec && <DecisionModal onClose={() => setDec(false)} preset={decisionPreset(c)} />}
      {q && <NoteModal onClose={() => setQ(false)} preset={c.action?.kind === 'question' ? { kind: 'client_question', ...c.action.payload } : { kind: 'review', refs: [...c.lines.slice(0, 2), ...c.evidence.slice(0, 2)], subject: c.title }} />}
    </div>
  )
}

function decisionPreset(c: CheckResult) {
  const base = { refs: c.evidence.slice(0, 6), checkId: c.id }
  switch (c.id) {
    case 'hvac-capitalize': return { ...base, kind: 'judgment', topic: 'HVAC replacement at 1450 Fremont Way: capitalize', conclusion: 'Full replacement of the furnace/AC with a new heat pump system, air handler and line set restores and betters the HVAC building system (a separate unit of property). Capitalize 11,000 as 27.5-year residential rental property placed in service 08/12/2025. Not routine maintenance; exceeds de minimis.', authority: 'Reg. 1.263(a)-3(e)(2)(ii)(B), (j), (k); Reg. 1.263(a)-1(f)' }
    case 'sep-excess': return { ...base, kind: 'election', topic: 'Excess SEP contribution', conclusion: 'Contribution 18,000 exceeds the 2025 deductible limit recomputed after Schedule C adjustments. Advise client to withdraw the excess before the extended due date to avoid the 10% section 4972 excise tax; otherwise carry forward the nondeductible amount.', authority: 'IRC 404(a)(3), 404(h), 4972; Pub. 560' }
    case 'due-diligence': return { ...base, kind: 'due_diligence', topic: 'Form 8867 — CTC (Theo) and ODC (Ada)', conclusion: 'Theo: son, age 8, lived with taxpayers 12 months, SSN verified to card (D71). Ada: daughter, age 19, full-time student at UC Davis (1098-T box 8), lived with taxpayers (school is temporary absence), does not provide over half her support (W-2 4,100), files her own return marked "can be claimed". Knowledge requirement met; no inconsistent information.', authority: 'IRC 6695(g); Reg. 1.6695-2; Form 8867 instructions' }
    case 'ca-amt': return { ...base, kind: 'judgment', topic: 'California AMT on the 2025 ISO exercise', conclusion: 'ISO granted 03/01/2022 and exercised 07/30/2025. California sources the bargain element by CA workdays between grant and exercise; Ngozi worked in California for the whole period except 07/15–07/30/2025. Compute Schedule P (540NR) with the CA-source share (~99%) of the 40,000 adjustment and compare CA TMT with regular tax.', authority: 'R&TC 17952; FTB Pub. 1004; Reg. 17951-5' }
    case 'outside-filings': return { ...base, kind: 'scope', topic: 'Filings outside this engagement', conclusion: 'Advised client in writing: (1) file FinCEN 114 for Sparbanken by 10/15/2026; (2) file late 2025 Forms 1099-NEC for Quintero (4,800) and Patel (2,600) - penalty exposure; (3) consult on possible unfiled 2023 Form 3520 for the inheritance (penalty relief / reasonable cause); (4) Ada keeps "can be claimed" on her own return. Not within engagement scope (D01).', authority: 'Engagement letter D01; 31 CFR 1010.350; IRC 6041A, 6039F; Circular 230 §10.21' }
    case 'election-179': return { ...base, kind: 'election', topic: 'Section 179 election — studio equipment', conclusion: 'Elect section 179 for the printer, camera system and workstation (38,000). Same federal deduction as special depreciation; California conforms to 179 (25,000 limit) but not to bonus, lowering California tax.', authority: 'IRC 179; R&TC 17255; Form 4562 Part I' }
    default: return { ...base, kind: 'judgment', topic: c.title, conclusion: '', authority: '' }
  }
}
