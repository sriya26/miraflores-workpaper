// A scripted morning of work so a reviewer can see the review flow without clicking through
// every fix. It is just events - the same ones the UI emits - attributed to the real staff.
// It deliberately leaves things open (judgments, partner approvals, a blocking review note).

import type { Ctx } from './ctx'
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
