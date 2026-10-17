import React from 'react'
import { useCtx, Ctx } from '../ctx'
import { Badge, Ref, Who } from '../ui'
import { money, val, date } from '../format'
import { maskText } from '../refs'

interface PkgItem {
  title: string
  question: string
  answer: string
  lines: { key: string; label: string; filed: any; engine: any }[]
  evidence: { ref: string; text: string }[]
  adjustments: { line: string; from: number; to: number; reason: string; by: string; at: string; approvals: string[] }[]
  verifications: { ref: string; type: string; by: string; at: string }[]
  decisions: { topic: string; conclusion: string; authority: string; by: string }[]
  table?: { label: string; amount: number; ref?: string }[]
}

export interface Package { notice: any; filed: any; preparer: string; items: PkgItem[]; generated: string; efile: any[] }

export function buildResponsePackage(ctx: Ctx): Package {
  const notice = ctx.ix.p.tax_agency_records.notices.find((n: any) => n.id === 'N-2025-L566')
  const snap = ctx.s.filing.frozen?.snapshot
  const filedVal = (k: string) => snap ? snap.lines[k] : ctx.eff.lines.get(k)?.value
  const ev = (id: string) => { const e = ctx.ix.evs.get(id)!; return { ref: id, text: `${e.document_id} p.${e.page} — ${e.label}: ${val(e.value)} (printed “${maskText(e.text_as_read, ctx.ix)}”)` } }
  const doc = (id: string) => ({ ref: id, text: `${id} — ${ctx.ix.docs.get(id)!.title}` })
  const adjFor = (keys: string[]) => [...ctx.s.adjustments.values()].filter(a => a.status === 'active' && keys.includes(a.lineKey)).map(a => ({ line: a.lineKey, from: a.original, to: a.original + a.delta, reason: a.reason, by: ctx.userName(a.by), at: a.at, approvals: a.approvals.map(x => `${x.level}: ${ctx.userName(x.by)}`) }))
  const verFor = (refs: string[]) => refs.map(r => ctx.s.verifications.get(r)).filter(Boolean).map(v => ({ ref: v!.ref, type: v!.type, by: ctx.userName(v!.by), at: v!.at }))
  const decFor = (words: string[]) => [...ctx.s.decisions.values()].filter(d => words.some(w => (d.topic + d.conclusion).toLowerCase().includes(w))).map(d => ({ topic: d.topic, conclusion: d.conclusion, authority: d.authority, by: ctx.userName(d.by) }))
  const line = (k: string) => ({ key: k, label: ctx.vix.lines.get(k)?.label || k, filed: filedVal(k), engine: ctx.vix.lines.get(k)?.value })
  const nonCashKeys = ['F8283.A1.stock', 'F8283.A1.vehicle', 'SchA.12']
  const grKeys = ['SchC.1']
  const e = (id: string) => ctx.ix.evs.get(id)!.value
  return {
    notice, filed: snap?.summary || ctx.eff.summary, preparer: 'Helen Strand, CPA (PTIN P00876543), Miraflores, EFIN 731504', generated: new Date().toISOString(),
    efile: ctx.s.filing.submissions,
    items: [
      {
        title: 'Noncash charitable contributions (Schedule A line 12, Form 8283)',
        question: notice.items_under_examination[0],
        answer: `Two noncash gifts totaling ${money(filedVal('SchA.12'))}. (1) 200 shares of Northlake Total Market Index Fund to the Austin Community Foundation donor-advised fund on 12/05/2025, held since 04/2019 (long-term), valued at the high/low average 72.50 = 14,500 per the acknowledgment; publicly traded securities need no qualified appraisal; Form 8283 Section A. (2) 2012 Subaru Outback to Lone Star Kids Auto Donation on 08/20/2025: the charity sold it on 09/09/2025 for 2,900 (Form 1098-C box 4c); deduction limited to gross proceeds under IRC 170(f)(12) — the client's 6,000 estimate was not used.`,
        lines: nonCashKeys.map(line),
        evidence: [ev('ev-1050'), ev('ev-1051'), ev('ev-1052'), ev('ev-1053'), ev('ev-1054'), ev('ev-1055'), doc('D65'), doc('D66')],
        adjustments: adjFor(nonCashKeys), verifications: verFor(['ev-1051', 'ev-1054', 'F8283.A1.stock', 'F8283.A1.vehicle']), decisions: decFor(['vehicle', 'donation', 'charit']),
      },
      {
        title: 'Schedule C gross receipts reconciliation',
        question: notice.items_under_examination[1],
        answer: `Gross receipts ${money(filedVal('SchC.1'))} equal the books. The Form 1099-K (12,400) reports Atlas Outdoor Gear's card payments, which Atlas also included in its 41,200 Form 1099-NEC; they were deposited once and booked once. Third-party forms therefore overstate receipts by 12,400.`,
        lines: grKeys.map(line),
        table: [
          { label: 'Fennimore Brewing Co. — 1099-NEC', amount: e('ev-0113'), ref: 'ev-0113' },
          { label: 'Atlas Outdoor Gear — 1099-NEC (includes 12,400 by card)', amount: e('ev-0116'), ref: 'ev-0116' },
          { label: 'Sable & Finch Architects — 1099-NEC', amount: e('ev-0119'), ref: 'ev-0119' },
          { label: 'Riverbend Credit Union — 1099-NEC', amount: e('ev-0122'), ref: 'ev-0122' },
          { label: 'Quill Media Group — 1099-NEC', amount: e('ev-0125'), ref: 'ev-0125' },
          { label: 'Eleven clients that issued no 1099', amount: e('ev-0111'), ref: 'ev-0111' },
          { label: '= Books revenue (QuickBooks P&L)', amount: e('ev-0103'), ref: 'ev-0103' },
          { label: 'Form 1099-K Paywell — same Atlas payments, not additional', amount: e('ev-0127'), ref: 'ev-0127' },
        ],
        evidence: [ev('ev-0103'), ev('ev-0109'), ev('ev-0110'), ev('ev-0127'), doc('D14'), doc('D15'), doc('D17'), doc('D21')],
        adjustments: adjFor(grKeys), verifications: verFor(['ev-0103', 'ev-0127', 'ev-0116', 'SchC.1']), decisions: decFor(['gross receipts', '1099-k']),
      },
    ],
  }
}

export function ResponsePackage({ pkg }: { pkg: Package }) {
  const ctx = useCtx()
  const download = () => {
    const html = packageHtml(pkg)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    a.download = 'okafor-lindqvist-2025-letter566-response.html'
    a.click()
  }
  return (
    <div>
      <div className="callout mb12 small">
        <b>{pkg.notice.type}</b> dated {date(pkg.notice.dated)}, response due {date(pkg.notice.response_due)}. Filed return: AGI {money(pkg.filed.federal.agi)}, total tax {money(pkg.filed.federal.total_tax)}. Representative: {pkg.preparer}.
        {!ctx.s.filing.frozen && <div className="mt8"><Badge tone="warn">draft</Badge> Return not yet filed in this workpaper — package reflects the current workpaper.</div>}
      </div>
      {pkg.items.map((it, i) => (
        <div key={i} className="card pad mb12">
          <h3>{i + 1}. {it.title}</h3>
          <p className="small muted">IRS: “{it.question}”</p>
          <p className="small">{it.answer}</p>
          <table className="t small mb8"><thead><tr><th>Line</th><th className="num">As filed</th></tr></thead><tbody>{it.lines.map(l => <tr key={l.key}><td><Ref r={l.key} /> {l.label}</td><td className="num">{val(l.filed)}</td></tr>)}</tbody></table>
          {it.table && <table className="t small mb8"><tbody>{it.table.map(r => <tr key={r.label}><td>{r.label}</td><td className="num">{r.ref ? <Ref r={r.ref} label={money(r.amount)} showKey={false} /> : money(r.amount)}</td></tr>)}</tbody></table>}
          <h4 className="mt8 mb8">Evidence</h4>
          {it.evidence.map(x => <div key={x.ref} className="row small" style={{ padding: '2px 0' }}><Ref r={x.ref} /><span className="muted ellipsis">{x.text}</span></div>)}
          {it.adjustments.length > 0 && <><h4 className="mt8 mb8">What the preparer changed</h4>{it.adjustments.map((a, j) => <div key={j} className="small">• {a.line}: {money(a.from)} → {money(a.to)} — {a.reason} ({a.by}{a.approvals.length ? '; ' + a.approvals.join(', ') : ''})</div>)}</>}
          {it.verifications.length > 0 && <><h4 className="mt8 mb8">Verified</h4>{it.verifications.map((v, j) => <div key={j} className="small">• {v.ref}: {v.type.replace(/_/g, ' ')} — {v.by}</div>)}</>}
          {it.decisions.length > 0 && <><h4 className="mt8 mb8">Judgments</h4>{it.decisions.map((d, j) => <div key={j} className="small">• {d.topic}: {d.conclusion} <span className="muted">Authority: {d.authority}</span></div>)}</>}
        </div>
      ))}
      <button className="btn primary" onClick={download}>Download self-contained package (HTML)</button>
    </div>
  )
}

function esc(s: any) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]) }

function packageHtml(pkg: Package) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Letter 566 response — Okafor-Lindqvist 2025</title><style>body{font:14px/1.5 Georgia,serif;max-width:820px;margin:40px auto;padding:0 20px;color:#222}h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #ccc;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums}.m{color:#666;font-size:12px}</style></head><body>
<h1>Response to ${esc(pkg.notice.type)} — tax year 2025</h1>
<p>Taxpayers: Ngozi Okafor and Erik Lindqvist (MFJ). Notice dated ${esc(pkg.notice.dated)}; response due ${esc(pkg.notice.response_due)}.<br>Representative: ${esc(pkg.preparer)}.<br>Return as filed: AGI ${money(pkg.filed.federal.agi)}; total tax ${money(pkg.filed.federal.total_tax)}.</p>
${pkg.items.map((it, i) => `<h2>${i + 1}. ${esc(it.title)}</h2><p class="m">Item under examination: ${esc(it.question)}</p><p>${esc(it.answer)}</p>
<table><tr><th>Line</th><th>As filed</th></tr>${it.lines.map(l => `<tr><td>${esc(l.key)} ${esc(l.label)}</td><td class="n">${esc(val(l.filed))}</td></tr>`).join('')}</table>
${it.table ? `<table>${it.table.map(r => `<tr><td>${esc(r.label)}</td><td class="n">${money(r.amount)}</td></tr>`).join('')}</table>` : ''}
<p><b>Source documents</b></p><ul>${it.evidence.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>
${it.adjustments.length ? `<p><b>Preparer adjustments</b></p><ul>${it.adjustments.map(a => `<li>${esc(a.line)}: ${money(a.from)} → ${money(a.to)} — ${esc(a.reason)} (${esc(a.by)}, ${esc(a.at.slice(0, 10))})</li>`).join('')}</ul>` : ''}
${it.verifications.length ? `<p><b>Verification</b></p><ul>${it.verifications.map(v => `<li>${esc(v.ref)}: ${esc(v.type)} — ${esc(v.by)}</li>`).join('')}</ul>` : ''}
${it.decisions.length ? `<p><b>Judgments and authority</b></p><ul>${it.decisions.map(d => `<li>${esc(d.topic)}: ${esc(d.conclusion)} (${esc(d.authority)})</li>`).join('')}</ul>` : ''}`).join('')}
<p class="m">Generated ${esc(pkg.generated)} from the Miraflores workpaper event log. E-file: ${pkg.efile.map(s => `${esc(s.jurisdiction)} ${esc(s.status)} ${esc(s.seasonAt.slice(0, 10))}`).join('; ') || 'n/a'}.</p></body></html>`
}

export function ExaminerView() {
  const ctx = useCtx()
  const pkg = buildResponsePackage(ctx)
  const visible = ctx.clock >= '2028-01-26T00:00:00Z'
  return (
    <div className="client-shell">
      <h1>IRS correspondence examination — 2025 Form 1040</h1>
      <p className="ink2">Read-only. You see the filed record the representative furnished in response to Letter 566 — nothing internal to the firm.</p>
      {!visible && <div className="callout warn mb12 small">Season clock is {date(ctx.clock)}; the letter is dated 01/20/2028. Showing the package as it would be produced.</div>}
      <ResponsePackage pkg={pkg} />
    </div>
  )
}
