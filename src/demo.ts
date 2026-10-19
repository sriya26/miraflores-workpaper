// A scripted morning of work so a reviewer can see the review flow without clicking through
// every fix. It is just events - the same ones the UI emits - attributed to the real staff.
// It deliberately leaves things open (judgments, partner approvals, a blocking review note).

import type { Ctx } from './ctx'
import { findingState, signoffState, areaFingerprint } from './ctx'
import { AREAS } from './areas'
import { diagnosticsState } from './views/Findings'
import { append } from './store'
import { uid } from './format'
import type { WPEvent } from './model'

export function seedDemo(ctx: Ctx) {
  const t0 = Date.now() - 1000 * 60 * 60 * 26
  let n = 0
  const evs: WPEvent[] = []
  const mk = (actor: string, type: string, payload: any, batch?: string) => {
    evs.push({ id: uid('ev'), type, actor, at: new Date(t0 + (n++) * 47000).toISOString(), seasonAt: ctx.clock, batch, payload })
  }
  const P = 'st-01', D = 'st-02'
  // Preparer verifies the primary source values
  for (const [ref, type, note] of [
    ['ev-0016', 'agreed_to_source_document', 'W-2 box 1'], ['ev-0035', 'agreed_to_source_document', 'W-2 box 1'], ['ev-0017', 'agreed_to_source_document', ''], ['ev-0036', 'agreed_to_source_document', ''],
    ['ev-0031', 'agreed_to_source_document', ''], ['ev-0048', 'agreed_to_source_document', ''], ['ev-0103', 'agreed_to_source_document', 'QuickBooks P&L total income'],
    ['ev-0113', 'agreed_to_third_party_record', ''], ['ev-0116', 'agreed_to_third_party_record', ''], ['ev-0119', 'agreed_to_third_party_record', ''], ['ev-0122', 'agreed_to_third_party_record', ''], ['ev-0125', 'agreed_to_third_party_record', ''],
    ['ev-0975', 'agreed_to_source_document', ''], ['ev-0977', 'agreed_to_source_document', ''], ['ev-1006', 'agreed_to_source_document', ''], ['ev-0998', 'agreed_to_third_party_record', '1099-MISC agrees'],
    ['ev-1029', 'agreed_to_source_document', ''], ['ev-1051', 'agreed_to_source_document', ''], ['ev-1054', 'agreed_to_source_document', ''],
    ['SchD.6', 'agreed_to_prior_year', 'D06 p.6'], ['SchD.14', 'agreed_to_prior_year', 'D06 p.6'], ['F8606.2', 'agreed_to_prior_year', 'D06 p.10 and D42'],
    ['Sch3.11', 'recalculated', '6.2% × 176,100 wage base'], ['F6251.2i', 'recalculated', '(52 − 12) × 1,000'],
  ]) mk(P, 'verify', { ref, type, note, evidence: [], value: ctx.eff.lines.get(ref)?.value ?? ctx.ix.evs.get(ref)?.value })
  mk(P, 'verify', { ref: 'ev-1049', type: 'confirmed_with_client', note: 'Client confirmed 1,500 with the parish; bank statement check #2207 (msg-08).', evidence: ['msg-08'], value: 1500 })
  // Apply the clear-cut fixes in one batch
  const ids = ['interest-dup', 'fx-rate', 'gross-1099k', 'mileage-dup', 'utilities-pct', 'software-personal', 'sehi-eligible', 'rsu-basis', 'meridian-p32', 'vehicle-donation', 'mortgage-double', 'property-tax-proration', 'est-fed', 'est-ca', 'ca-wages']
  const batch = uid('b')
  for (const c of ctx.checks.filter(c => ids.includes(c.id) && c.status === 'fail')) {
    for (const sg of c.suggestions) {
      const base = ctx.eff.lines.get(sg.lineKey)
      const cur = typeof base?.value === 'number' ? base.value : 0
      mk(P, 'adjust', { id: uid('adj'), lineKey: sg.lineKey, baseVersion: ctx.vix.v.version, original: base?.base ?? 0, delta: sg.delta ?? (sg.newValue! - cur), fedCategory: sg.fedCategory, caCategory: sg.caCategory ?? sg.fedCategory, customFed: sg.customFed, customCa: sg.customCa, whatIf: sg.whatIf, reason: sg.reason, evidence: sg.evidence, checkId: c.id }, batch)
    }
  }
  mk(P, 'correct', { ref: 'ev-1045', value: '74-3829156', reason: 'Statement D62 prints 74-3829156; pipeline transposed two digits.' })
  mk(P, 'correct', { ref: 'household:theo.ssn', value: '666-74-3390', reason: 'Organizer typo (digits transposed); matches 2024 return and Social Security card.' })
  // Document dispositions
  const disp: [string, string, string][] = [
    ['D10', 'duplicate', 'Phone photo of the Halvorsen W-2 (D09) — identical boxes; counted once.'],
    ['D30', 'superseded', 'Replaced by the CORRECTED Meridian 1099 (D31).'],
    ['D29', 'duplicate', 'Same sweep interest as Northlake composite (D28) — removed from Schedule B.'],
    ['D07', 'informational', 'Prior preparer workpaper: open items carried into Prior preparer vs us.'],
    ['D69', 'used', 'IRS transcript: agreed estimated payments (12,000).'],
    ['D70', 'informational', '2023 CP2000 resolved 11/18/2024 — no 2025 effect.'],
    ['D73', 'used', 'Paystub YTD CA wages at the move date → CA-source wages.'],
    ['D47', 'supports_finding', 'HVAC invoice — basis of the capitalization judgment.'],
    ['D13', 'informational', 'Form 3922: ESPP basis support (lot N2 adjustment B 675).'],
    ['D27', 'supports_finding', 'Contractor payments 4,800 / 2,600: 1099-NEC filing advice.'],
    ['D60', 'informational', 'Scholarship restricted to tuition — reduces AOTC expenses (phased out).'],
    ['D22', 'used', 'Equipment invoice: cost and in-service date for the three assets.'],
    ['D25', 'supports_finding', 'Premiums 14,400 — not deductible (eligible for spouse plan).'],
    ['D49', 'used', 'Property tax installments agree to 1098 box 10.'],
    ['D56', 'supports_finding', 'Payoff interest already in the Lonestar 1098.'],
    ['D58', 'used', 'Levy 13,420; buyer share after seller credit.'],
    ['D71', 'used', "Theo's SSN corrected to the card."],
    ['D72', 'informational', 'Letter 566 (2028) — response package prepared.'],
    ['D01', 'used', 'Engagement scope: excludes FBAR, 1099s, other states.'],
    ['D02', 'used', 'Section 7216 consent.'], ['D03', 'used', 'IP PIN for e-file.'], ['D04', 'used', 'Identity verified.'], ['D05', 'used', 'Identity verified.'],
    ['D42', 'used', '2024 contribution made 02/12/2025 — confirms 8606 basis.'],
    ['D36', 'used', 'Interest, max and year-end balances (Schedule B, 8938).'],
    ['D06', 'used', 'Prior-year return: carryovers, 2024 comparison, dependent SSNs.'],
    ['D15', 'supports_finding', 'Deposit detail shows the 1099-K card receipts already in the books; phone/internet and Spotify detail.'],
    ['D54', 'supports_finding', 'Buyer closing statement: seller credit for 2025 taxes, purchase points.'],
  ]
  for (const [docId, status, reason] of disp) mk(P, 'disposition', { docId, status, reason })
  mk(P, 'step', { step: 'Identity verified', done: true, note: 'TX driver licenses D04/D05 match organizer; IP PIN D03.' })
  mk(P, 'step', { step: 'Prior-year return reviewed', done: true })
  mk(P, 'step', { step: 'Carryovers agreed to prior year', done: true })
  for (const [area, h] of [['intake', 1.2], ['wages', 2.4], ['investments', 4.6], ['business', 3.9], ['rentals', 2.1], ['passthrough', 1.5], ['deductions', 2.2], ['california', 1.8]] as [string, number][]) mk(P, 'time', { area, hours: h, note: 'prep' })
  // Variance explanations
  const why: Record<string, string> = {
    'F1040.1a': 'Two employers in 2025 plus RSU vests (38,200); 2024 was Corvane only.',
    'F1040.7': 'RSU/ESPP and direct-indexing sales, the condo sale (105,040 §1231 gain) and the S corp excess distribution; 2024 was a 3,000 loss.',
    'F1040.11': 'Condo sale gain and higher wages drive AGI; see capital gain and wages.',
    'F1040.15': 'Follows AGI; itemizing in 2025 vs standard in 2024.',
    'F1040.12': 'Itemizing in 2025 (new mortgage, points, property tax, gifts of stock); standard deduction in 2024.',
    'F1040.16': 'Higher taxable income; capital gains at preferential rates.',
    'F1040.24': 'Higher income plus AMT (ISO) and NIIT.',
    'F1040.2b': 'Swedish interest up (larger balance all year), sweep interest higher.',
    'SchC.1': 'Two new clients (Riverbend, Quill) after the move to Austin.',
    'F1040.13': 'QBI deduction limited: taxable income now above the 394,600 threshold.',
    'F1040.25a': 'Halvorsen withheld less; CA withholding not federal.',
    'F1040.26': 'Quarterly estimates 3,000 × 4 vs 6,000 in 2024.',
    'F1040.33': 'Extension payment 36,000.',
    'F1040.8': 'Schedule C up; rentals now produce a loss after suspended losses are freed.',
    'F1040.9': 'See capital gain, wages and Schedule C.',
    'F1040.10': 'SEP deduction added; SE health insurance disallowed.',
    'F1040.19': 'Credit phased out by AGI over 400,000.',
    'F1040.23': 'Adds NIIT and additional Medicare tax to SE tax.',
    'F1040.3a': 'Higher qualified dividends at both brokers.',
    'F1040.3b': 'Higher dividends at both brokers.',
    'SchC.31': 'Gross receipts up; 100% bonus depreciation on 38,000 of equipment.',
    'SchE.21A': 'HVAC capitalized; otherwise similar to 2024.',
    'SchE.21B': 'Condo rented 9 months then sold.',
    'SchE.32': 'Both K-1s up modestly.',
    'SchSE.12': 'Follows Schedule C.',
  }
  for (const v of ctx.variances) mk(P, 'note.create', { id: uid('note'), kind: 'variance', subject: `Variance ${v.key}`, body: why[v.key] || 'Explained in the area workpaper.', refs: [v.key], blocking: false })
  // Preparer signs off the areas she finished
  // (signatures computed later by the UI fingerprint; here we mark them on current content after the batch)
  // Reviewer raises notes
  mk(D, 'note.create', { id: 'note-rv1', kind: 'review', to: P, subject: 'HVAC: capitalize or repair?', body: 'Full system replacement with a heat pump reads as a restoration of the HVAC building system. Please record the judgment with authority and adopt the engine what-if.', refs: ['SchE.14A', 'D47'], blocking: true })
  mk(D, 'note.create', { id: 'note-rv2', kind: 'review', to: P, subject: 'Crypto C6 — get the bank statement', body: "Erik's message gives 3,050 and March 2021. Ask for the bank statement image before we rely on it.", refs: ['F8949.H.C6', 'msg-07'], blocking: false })
  mk(P, 'note.create', { id: 'note-cq1', kind: 'client_question', to: 'client', subject: 'Coinhaven lot C6 — original purchase', body: 'Please upload the bank statement page showing the 3,050 payment to CryptoNorth on 03/15/2021.', refs: ['ev-0918', 'msg-07'], blocking: false })
  append(evs)
  ctx.toast({ text: `Loaded ${evs.length} demo events: Priya's verifications and fixes, Daniel's review notes.`, kind: 'ok' })
}

// "Fast-forward the review": the rest of the season's staff work, so the filing flow (partner
// sign-off, client 8879, e-file) can be shown without an afternoon of clicking. Every event is
// attributed to the person who would do it. It runs in phases because each phase needs the
// recomputed state (fixes change other findings; sign-offs fingerprint the final content).
export function finishReviewDemo(toast: Ctx['toast']) {
  const cur = () => (window as any).__wp as Ctx
  const P = 'st-01', D = 'st-02', H = 'st-03'
  let total = 0
  const mk = (actor: string, type: string, payload: any, batch?: string): WPEvent =>
    ({ id: uid('ev'), type, actor, at: new Date(Date.now() + total++).toISOString(), seasonAt: cur().clock, batch, payload })
  const later = (fn: () => void) => new Promise<void>(r => setTimeout(() => { fn(); r() }, 250))
  const applyFixes = () => {
    const ctx = cur(), evs: WPEvent[] = [], batch = uid('b')
    for (const c of ctx.checks) {
      if (c.status !== 'fail' || !c.suggestions.length || !findingState(ctx, c).open) continue
      for (const sg of c.suggestions) {
        const base = ctx.eff.lines.get(sg.lineKey)
        const v = typeof base?.value === 'number' ? base.value : 0
        const delta = sg.delta ?? (sg.newValue! - v)
        if (Math.abs(delta) < 0.005) continue
        evs.push(mk(P, 'adjust', { id: uid('adj'), lineKey: sg.lineKey, baseVersion: ctx.vix.v.version, original: base?.base ?? 0, delta, fedCategory: sg.fedCategory, caCategory: sg.caCategory ?? sg.fedCategory, customFed: sg.customFed, customCa: sg.customCa, whatIf: sg.whatIf, reason: sg.reason, evidence: sg.evidence, checkId: c.id }, batch))
      }
    }
    append(evs)
    return evs.length
  }
  const DECISIONS: Record<string, [string, string, string]> = {
    'hvac-capitalize': ['judgment', 'Restoration of the HVAC building system: capitalized and depreciated.', 'Reg. 1.263(a)-3(k)'],
    'sep-excess': ['election', 'Excess SEP contribution withdrawn before the extended due date.', 'IRC 4972; 404(a)(3)'],
    'due-diligence': ['due_diligence', 'Form 8867 requirements met for both dependents.', 'IRC 6695(g)'],
    'election-179': ['election', 'Section 179 elected for the equipment.', 'IRC 179'],
    'ca-amt': ['judgment', 'Schedule P computed off-engine: no California AMT.', 'R&TC 17952'],
    'outside-filings': ['scope', 'Client advised in writing about filings outside our engagement.', 'Engagement letter D01'],
  }
  const closeOut = () => {
    const ctx = cur(), evs: WPEvent[] = []
    for (const c of ctx.checks) {
      if (!findingState(ctx, c).open) continue
      const d = DECISIONS[c.id]
      if (d) evs.push(mk(P, 'decision', { id: uid('dec'), kind: d[0], topic: c.title, conclusion: d[1], authority: d[2], refs: [], checkId: c.id }))
      evs.push(mk(P, 'finding.status', { checkId: c.id, status: d ? 'resolved' : 'accepted', note: d ? d[1] : 'Reviewed; accepted as is.' }))
    }
    for (const x of diagnosticsState(ctx)) if (!x.resolved && !x.chk) evs.push(mk(P, 'finding.status', { checkId: 'diag:' + x.d.code, status: 'accepted', note: 'Reviewed; no change needed.' }))
    const docs = ctx.checks.find(c => c.id === 'docs-accounted')
    if (docs && docs.status === 'fail') for (const id of docs.evidence) if (ctx.ix.docs.has(id) && !ctx.s.dispositions.get(id)) evs.push(mk(P, 'disposition', { docId: id, status: 'used', reason: 'Values agreed; supports the lines cited in its area.' }))
    for (const v of ctx.variances) if (![...ctx.s.notes.values()].some(n => n.kind === 'variance' && n.refs.includes(v.key))) evs.push(mk(P, 'note.create', { id: uid('note'), kind: 'variance', subject: `Variance ${v.key}`, body: 'Explained by the adjustments recorded this year.', refs: [v.key], blocking: false }))
    for (const s of ctx.s.standards.required_steps as string[]) evs.push(mk(P, 'step', { step: s, done: true }))
    for (const n of ctx.s.notes.values()) {
      if (n.status === 'resolved' || n.kind === 'variance') continue
      if (n.kind === 'client_question' && !n.replies.length) evs.push(mk('cu-02', 'note.reply', { noteId: n.id, body: 'Uploaded the statement you asked for.', attachments: [] }))
      evs.push(mk(D, 'note.resolve', { noteId: n.id, note: 'Resolved.' }))
    }
    append(evs)
  }
  const approvals = () => {
    const ctx = cur(), evs: WPEvent[] = []
    for (const a of ctx.s.adjustments.values()) {
      if (a.status !== 'active' || a.rejected || a.approvals.some(x => x.level === 'partner')) continue
      const e = ctx.eff.effects.get(a.id)
      if (e && (Math.abs(e.fed) > 1000 || Math.abs(e.ca) > 1000) && a.by !== H) evs.push(mk(H, 'adjust.approve', { id: a.id, level: 'partner' }))
    }
    append(evs)
  }
  const signoffs = (level: 'preparer' | 'reviewer', actor: string) => {
    const ctx = cur(), evs: WPEvent[] = []
    for (const a of AREAS) {
      const x = (signoffState(ctx, a.id) as any)[level]
      if (x.so && !x.stale) continue
      const fp = areaFingerprint(ctx, a.id)
      evs.push(mk(actor, 'signoff', { area: a.id, level, fingerprint: fp.fingerprint, snapshot: fp.snapshot }))
    }
    append(evs)
  }
  ;(async () => {
    for (let i = 0; i < 3; i++) { let n = 0; await later(() => { n = applyFixes() }); if (!n) break }
    await later(closeOut)
    await later(approvals)
    await later(() => signoffs('preparer', P))
    await later(() => signoffs('reviewer', D))
    toast({ text: `Fast-forwarded the review: ${total} events by Priya, Daniel, Helen and the client. Ready for partner sign-off.`, kind: 'ok' })
  })()
}
