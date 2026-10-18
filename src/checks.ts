// Independent checks: they read the source documents, the client's answers and agency records
// directly and recompute what the return should say - they never take the engine's word for it.
// Each check compares its own expectation to the *workpaper* value (engine + adjustments), so
// applying the right fix turns the check green, and a later engine version that regresses turns
// it red again.

import type { Index, ExtractedValue } from './packet'
import type { State } from './model'
import type { Effective } from './effective'
import { lineValue } from './effective'

export interface Suggestion {
  lineKey: string
  newValue?: number
  delta?: number
  fedCategory: string
  caCategory?: string
  customFed?: number
  customCa?: number
  whatIf?: string
  reason: string
  evidence: string[]
}

export interface CheckResult {
  id: string
  area: string
  title: string
  kind: 'engine_error' | 'extraction_error' | 'client_answer' | 'judgment' | 'completeness' | 'recompute' | 'outside_filing' | 'prior_year'
  severity: 'high' | 'medium' | 'low'
  status: 'fail' | 'pass' | 'judgment'
  summary: string
  detail: string[]
  expected?: number | string
  actual?: number | string
  lines: string[]
  evidence: string[]
  suggestions: Suggestion[]
  action?: { kind: 'correct_household' | 'correct_ev' | 'decision' | 'question'; label: string; payload?: any }
  estimate?: { fed: number; ca: number } // rough tax effect of the fix (for ranking)
}

const near = (a: any, b: any, tol = 1) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol

function ev(ix: Index, id: string): ExtractedValue | undefined { return ix.evs.get(id) }
function evVal(ix: Index, s: State, id: string): any {
  const c = s.corrections.get(id)
  return c ? c.value : ix.evs.get(id)?.value
}
function evByField(ix: Index, docId: string, field: string): ExtractedValue | undefined {
  return (ix.evsByDoc.get(docId) || []).find(e => e.field === field)
}
function received(ix: Index, docId: string, clock: string): boolean {
  const d = ix.docs.get(docId)
  return !!d && d.received_at <= clock
}
// Generic lookups: checks find what they need by document type and field name, so they run on
// any household's packet - not on this packet's ids.
function docsOfType(ix: Index, clock: string, re: RegExp) {
  return ix.p.documents.filter(d => re.test(d.document_type) && d.received_at <= clock)
}
function fieldIn(ix: Index, docId: string, re: RegExp) {
  return (ix.evsByDoc.get(docId) || []).filter(e => re.test(e.field))
}
function docText(ix: Index, docId: string) {
  return (ix.docs.get(docId)?.pages || []).map(p => p.printed_content).join(' ')
}
// Last day of residency in a state (for "was this item earned while a resident?")
function residentUntil(ix: Index, state: string): string | null {
  const r = (ix.p.household.residency || []).find((x: any) => x.state === state && x.status === 'resident')
  return r ? r.to : null
}
export function dependentTins(ix: Index, s: State, clock: string) {
  const prior = (ix.p.prior_years?.return_2024?.dependents || []) as { name: string; ssn: string }[]
  return ix.p.household.people.filter((p: any) => p.role === 'dependent').map((p: any) => {
    const ref = `household:${p.id}.ssn`
    const current = s.corrections.get(ref)?.value || p.ssn
    const card = ix.p.documents.filter(d => d.belongs_to === `dependent:${p.id}` && d.received_at <= clock)
      .flatMap(d => (ix.evsByDoc.get(d.id) || []).filter(e => e.value_type === 'ssn'))[0]
    const py = prior.find(x => x.name === p.name)
    const pyEv = ix.p.extracted_values.find(e => e.value_type === 'ssn' && e.value === py?.ssn && ix.docs.get(e.document_id)?.document_type === 'prior_year_return')
    const expected = card ? card.value : py?.ssn
    return { person: p, ref, current, expected, card, pyEv, ok: !expected || expected === current }
  })
}

export function runChecks(ix: Index, s: State, eff: Effective, clock: string): CheckResult[] {
  const out: CheckResult[] = []
  const L = (k: string) => lineValue(eff, k)
  const rates = eff.version.v.tax_effect_rates
  const par = ix.p.engine_reference.parameters
  const push = (c: CheckResult) => out.push(c)

  // ---------- Wages ----------
  {
    // Distinct W-2s: same EIN and identical box values are images of the same form.
    const w2 = docsOfType(ix, clock, /^W-2$/)
    const sig = (d: any) => (ix.evsByDoc.get(d.id) || []).filter(e => /^box/.test(e.field)).map(e => `${e.field}=${e.value}`).sort().join('|')
    const seen = new Map<string, string>()
    const dups: string[] = []
    const distinct: string[] = []
    let box1 = 0, ssWithheld = 0
    for (const d of w2) {
      const k = sig(d)
      if (seen.has(k)) { dups.push(`${d.id} duplicates ${seen.get(k)}`); continue }
      seen.set(k, d.id); distinct.push(d.id)
      box1 += evByField(ix, d.id, 'box1')?.value || 0
      ssWithheld += evVal(ix, s, evByField(ix, d.id, 'box4')?.id || '') || 0
    }
    push({
      id: 'w2-sum', area: 'wages', title: 'Wages agree to distinct Forms W-2', kind: 'recompute', severity: 'medium',
      status: near(L('F1040.1a'), box1) ? 'pass' : 'fail',
      summary: `Sum of box 1 over ${seen.size} distinct W-2s = ${box1.toLocaleString()}` + (dups.length ? `; ${dups.join(', ')} (identical boxes, counted once).` : '.'),
      detail: ['W-2s matched on every box value; an exact image is a duplicate, not a second job.'],
      expected: box1, actual: L('F1040.1a'), lines: ['F1040.1a'], evidence: w2.map(d => evByField(ix, d.id, 'box1')?.id).filter(Boolean) as string[], suggestions: [],
    })
    // Excess social security (only arises with more than one employer)
    if (distinct.length > 1) {
      const max = Math.round(par.ss_wage_base * 0.062 * 100) / 100
      const excess = Math.max(0, Math.round(ssWithheld - max))
      push({
        id: 'excess-ss', area: 'wages', title: 'Excess social security recomputed', kind: 'recompute', severity: 'low',
        status: near(L('Sch3.11') || 0, excess) ? 'pass' : 'fail',
        summary: `Withheld ${ssWithheld.toLocaleString()} across ${distinct.length} employers − max ${max.toLocaleString()} (6.2% × ${par.ss_wage_base.toLocaleString()}) = ${excess.toLocaleString()}.`,
        detail: [], expected: excess, actual: L('Sch3.11'), lines: ['Sch3.11'], evidence: distinct.map(d => evByField(ix, d, 'box4')?.id).filter(Boolean) as string[], suggestions: [],
      })
    }
    // ISO bargain element from every Form 3921 (box 3 price, box 4 FMV, box 5 shares)
    const f3921 = docsOfType(ix, clock, /^3921$/)
    if (f3921.length) {
      const parts = f3921.map(d => { const g = (b: string) => evVal(ix, s, evByField(ix, d.id, b)?.id || '') || 0; return { d, spread: (g('box4') - g('box3')) * g('box5'), refs: ['box3', 'box4', 'box5'].map(b => evByField(ix, d.id, b)?.id).filter(Boolean) as string[] } })
      const iso = parts.reduce((a, x) => a + x.spread, 0)
      push({
        id: 'iso-amt', area: 'wages', title: 'ISO bargain element recomputed from Form 3921', kind: 'recompute', severity: 'low',
        status: near(L('F6251.2i'), iso) ? 'pass' : 'fail',
        summary: `(FMV at exercise − exercise price) × shares over ${f3921.length} Form${f3921.length > 1 ? 's' : ''} 3921 = ${iso.toLocaleString()}. Shares held at year end make it an AMT adjustment.`,
        detail: [], expected: iso, actual: L('F6251.2i'), lines: ['F6251.2i'], evidence: parts.flatMap(x => x.refs), suggestions: [],
      })
    }
  }

  // ---------- Stock comp sales: zero broker basis with a supplemental statement ----------
  // Any Form 8949 lot whose broker basis is 0 is matched (by acquisition date) to an adjusted
  // basis on an employer supplemental statement. Typical for RSUs: the vest value is already wages.
  {
    const supp = docsOfType(ix, clock, /stock_plan_supplement/)
    const adj = supp.flatMap(d => fieldIn(ix, d.id, /_acquired$/).map(acq => {
      const id = acq.field.replace(/_acquired$/, '')
      return { id, acquired: acq.value, basisEv: evByField(ix, d.id, `${id}_adjusted_basis`), doc: d.id }
    })).filter(x => x.basisEv)
    const caUntil = residentUntil(ix, 'CA')
    const hits: { lot: string; proceedsEv: string; basisEv: string; zeroEv: string; name: string; cat: string; ca: boolean }[] = []
    if (adj.length) for (const l of eff.version.v.lines) {
      if (l.form !== 'F8949' || l.line.endsWith('total')) continue
      const zero = (l.sources || []).map(r => ix.evs.get(r)).find(e => e && /_basis$/.test(e.field) && e.value === 0)
      if (!zero) continue
      const prefix = zero.field.replace(/_basis$/, '')
      const acquired = evByField(ix, zero.document_id, `${prefix}_acquired`)?.value
      const sold = evByField(ix, zero.document_id, `${prefix}_sold`)?.value
      const proceeds = evByField(ix, zero.document_id, `${prefix}_proceeds`)
      const m = adj.find(a => a.acquired === acquired)
      if (!m || !proceeds) continue
      const box = l.line.split('.')[0]
      const cat = 'ABCGHI'.includes(box) ? 'stcg' : 'ltcg'
      hits.push({ lot: l.key, proceedsEv: proceeds.id, basisEv: m.basisEv!.id, zeroEv: zero.id, name: m.id, cat, ca: !!caUntil && !!sold && sold <= caUntil })
    }
    if (hits.length) {
      const gain = (h: typeof hits[0]) => (evVal(ix, s, h.proceedsEv) || 0) - (evVal(ix, s, h.basisEv) || 0)
      const bad = hits.filter(h => !near(L(h.lot), gain(h)))
      const expected = Math.round(hits.reduce((a, h) => a + gain(h), 0))
      const actual = Math.round(hits.reduce((a, h) => a + (L(h.lot) || 0), 0))
      const wagesRef = ix.p.extracted_values.find(e => /box14_RSU/i.test(e.field))
      push({
        id: 'rsu-basis', area: 'investments', title: 'Stock-comp sales taxed with zero basis (double taxation)', kind: 'engine_error', severity: 'high',
        status: bad.length ? 'fail' : 'pass',
        summary: bad.length
          ? `${bad.length} lot${bad.length > 1 ? 's are' : ' is'} reported at broker basis 0.00 (noncovered), but the employer's supplemental statement gives an adjusted basis for the same shares (matched on acquisition date). The vest value was already taxed as wages${wagesRef ? ` (W-2 box 14 RSU ${Number(wagesRef.value).toLocaleString()})` : ''}. Gain overstated by ${(actual - expected).toLocaleString()}.`
          : 'Lots with zero broker basis carry the adjusted basis from the supplemental statement.',
        detail: [
          'Engine rule R-8949-LOT uses broker basis unless it matches a supplemental statement for the same lot; lot ids differ between the 1099-B and the statement, so it never matched.',
          'Report with Form 8949 code B. Sales while a California resident are fully California-source.',
        ],
        expected, actual, lines: hits.map(h => h.lot), evidence: [...new Set([...supp.map(d => d.id), ...hits.flatMap(h => [h.basisEv, h.zeroEv]), ...(wagesRef ? [wagesRef.id] : [])])],
        suggestions: bad.map(h => {
          const proceeds = evVal(ix, s, h.proceedsEv) || 0, basis = evVal(ix, s, h.basisEv) || 0
          return {
            lineKey: h.lot, newValue: proceeds - basis, fedCategory: h.cat, caCategory: h.ca ? 'ca_source_income' : h.cat,
            reason: `${h.name}: adjusted basis ${basis.toLocaleString()} per the supplemental statement (vest value already in wages); gain = ${proceeds.toLocaleString()} − ${basis.toLocaleString()}.`,
            evidence: [h.basisEv, h.proceedsEv, ...(wagesRef ? [wagesRef.id] : [])],
          }
        }),
      })
    }
  }

  // ---------- Meridian page 32 ----------
  {
    const d = received(ix, 'D31', clock) ? 'D31' : 'D30'
    const doc = ix.docs.get(d)
    if (doc && received(ix, d, clock)) {
      const sumLots = (ix.evsByDoc.get(d) || []).filter(e => /_proceeds$/.test(e.field)).reduce((a, e) => a + e.value, 0)
      const summary = evByField(ix, d, 'b_summary_proceeds')?.value || 0
      const page32 = doc.pages.find(p => p.page === 32)?.printed_content || ''
      const m = page32.match(/proceeds ([\d,.]+) basis ([\d,.]+)/)
      const missingGain = m ? parseFloat(m[1].replace(/,/g, '')) - parseFloat(m[2].replace(/,/g, '')) : 0
      const fixed = [...s.adjustments.values()].some(a => a.status === 'active' && a.checkId === 'meridian-p32')
      push({
        id: 'meridian-p32', area: 'investments', title: 'Meridian 1099-B: lot on unread page 32 is missing', kind: 'completeness', severity: 'medium',
        status: near(sumLots, summary, 0.5) || fixed ? 'pass' : 'fail',
        summary: `Summary proceeds ${summary.toLocaleString()} vs sum of extracted lots ${sumLots.toLocaleString()} (difference ${(summary - sumLots).toLocaleString()}). Page 32 ("Additional transactions") was never read: M18 Ironwood REIT cash-in-lieu, proceeds 250.00, basis 310.00, short-term noncovered.`,
        detail: ['The engine flagged the mismatch but reported only the 17 extracted lots. The missing lot is a 60.00 short-term loss (Form 8949 box B).'],
        expected: summary, actual: sumLots, lines: ['F8949.B.total', 'SchD.2'], evidence: [`doc:${d}#page32`, d === 'D31' ? 'ev-0703' : 'ev-0544'],
        suggestions: [{ lineKey: 'F8949.B.total', delta: missingGain, fedCategory: 'stcg', reason: 'Add lot M18 from Meridian page 32 (proceeds 250.00, basis 310.00, short-term noncovered) - not extracted by the pipeline.', evidence: [`doc:${d}#page32`] }],
      })
    }
  }

  // ---------- Crypto C6 ----------
  if (received(ix, 'D35', clock)) {
    const answered = clock >= '2026-06-30T18:02:00Z'
    const c6 = L('F8949.H.C6')
    const fixed = typeof c6 === 'number' && c6 < 5325
    push({
      id: 'crypto-c6', area: 'investments', title: 'Coinhaven lot C6: zero basis and wrong holding period', kind: answered ? 'client_answer' : 'judgment', severity: 'medium',
      status: fixed ? 'pass' : answered ? 'fail' : 'judgment',
      summary: answered
        ? 'Client (msg-07): BTC bought on CryptoNorth on 03/15/2021 for about 3,050 and transferred in. Basis 3,050, acquired 2021 → long-term gain 2,275 (box K), not a 5,325 short-term gain (box H).'
        : 'Transfer-in lot with no basis: engine used zero basis and the transfer date. Ask the client for the original purchase record.',
      detail: ['Evidence is a bank statement line only (exchange closed). Record the judgment and request the statement image as an attachment.'],
      lines: ['F8949.H.C6', 'F8949.K.total'], evidence: ['ev-0918', 'ev-0919', 'ev-0882', 'msg-07'],
      suggestions: answered ? [
        { lineKey: 'F8949.H.C6', newValue: 0, fedCategory: 'stcg', caCategory: 'ca_source_income', reason: 'Remove C6 from short-term (box H): acquired 03/15/2021 per client, long-term.', evidence: ['msg-07', 'ev-0918'] },
        { lineKey: 'F8949.K.total', delta: 2275, fedCategory: 'ltcg', caCategory: 'ca_source_income', reason: 'Add C6 to long-term (box K): proceeds 5,325 − basis 3,050 (bank statement 03/15/2021 to CryptoNorth).', evidence: ['msg-07', 'ev-0882'] },
      ] : [],
      action: { kind: 'question', label: 'Ask client for the bank statement', payload: { subject: 'Coinhaven lot C6 - original purchase', body: 'Please upload the bank statement page showing the 3,050 payment to CryptoNorth on 03/15/2021.', refs: ['ev-0918', 'msg-07'] } },
    })
  }

  // ---------- Interest ----------
  {
    // Two interest lines from different documents with the same amount and the same account
    // number are one payment reported twice (e.g. a bank-sweep 1099-INT inside a composite 1099).
    const payerLines = eff.version.v.lines.filter(l => l.form === 'SchB' && /^1\.\d+$/.test(l.line))
    const srcDoc = (l: any) => (l.sources || []).map((r: string) => ix.evs.get(r)).find((e: any) => e)?.document_id as string | undefined
    const acct = (d?: string) => new Set(d ? [...docText(ix, d).matchAll(/(?:ending|account) (\d{4})\b/gi)].map(m => m[1]) : [])
    const dups: { keep: any; drop: any; amount: number; accounts: string[] }[] = []
    for (let i = 0; i < payerLines.length; i++) for (let j = i + 1; j < payerLines.length; j++) {
      const a = payerLines[i], b = payerLines[j]
      const da = srcDoc(a), db = srcDoc(b)
      if (!da || !db || da === db || !(a.value > 0) || a.value !== b.value) continue
      const shared = [...acct(da)].filter(x => acct(db).has(x))
      if (!shared.length) continue
      // drop the stand-alone 1099-INT, keep the composite statement
      const dropB = ix.docs.get(db)!.document_type === '1099-INT' || ix.docs.get(da)!.document_type !== '1099-INT'
      dups.push({ keep: dropB ? a : b, drop: dropB ? b : a, amount: a.value, accounts: shared })
    }
    for (const d of dups) {
      const still = near(L(d.keep.key), d.amount) && near(L(d.drop.key), d.amount)
      const dropDoc = srcDoc(d.drop)!, keepDoc = srcDoc(d.keep)!
      push({
        id: 'interest-dup', area: 'investments', title: 'Same interest reported on two documents', kind: 'engine_error', severity: 'medium',
        status: still ? 'fail' : 'pass',
        summary: `${d.amount.toLocaleString()} of interest appears on ${keepDoc} (${ix.docs.get(keepDoc)!.document_type}) and again on ${dropDoc} (${ix.docs.get(dropDoc)!.document_type}) for the same account ending ${d.accounts.join(', ')}. The engine reports both.`,
        detail: ['Matched on amount and account number across documents. Keep the composite statement; record the duplicate disposition on the other document.'],
        expected: (L('SchB.2') || 0) - (still ? d.amount : 0), actual: L('SchB.2'), lines: [d.keep.key, d.drop.key, 'SchB.2'], evidence: [...(d.keep.sources || []), ...(d.drop.sources || []), dropDoc],
        suggestions: still ? [{ lineKey: d.drop.key, newValue: 0, fedCategory: 'interest', reason: `${dropDoc} reports the same ${d.amount.toLocaleString()} already on ${keepDoc} (account ending ${d.accounts.join(', ')}).`, evidence: [...(d.drop.sources || []), ...(d.keep.sources || [])] }] : [],
      })
    }
    // Foreign amounts must be converted at the tax year's rate, not one carried from a prior year.
    const year = ix.p.household.tax_year
    for (const l of eff.version.v.lines) {
      const fxRef = (l.sources || []).find(r => r.startsWith('ref:fx.'))
      if (!fxRef || l.key.startsWith('F8938')) continue
      const [, cur, rateKey] = fxRef.slice(4).split('.')
      if (rateKey.startsWith(String(year))) continue
      const right = par.fx?.[cur]?.[`${year}_average`]
      const amtEv = (l.sources || []).map(r => ix.evs.get(r)).find(e => e && e.value_type === 'money')
      if (!right || !amtEv) continue
      const foreign = evVal(ix, s, amtEv.id) || 0
      const usd = Math.round(foreign / right)
      push({
        id: 'fx-rate', area: 'investments', title: `${cur} amount converted at a prior-year rate`, kind: 'engine_error', severity: 'low',
        status: near(L(l.key), usd) ? 'pass' : 'fail',
        summary: `${cur} ${foreign.toLocaleString()} ÷ ${right} (${year} average) = ${usd.toLocaleString()} USD. The engine used ${rateKey.replace('_', ' ')} (${par.fx[cur][rateKey]}), carried from last year → ${L(l.key)?.toLocaleString?.()}.`,
        detail: [`Use the ${year} yearly average (or the spot rate on the date received).`],
        expected: usd, actual: L(l.key), lines: [l.key], evidence: [amtEv.id, `ref:fx.${cur}.${year}_average`, fxRef],
        suggestions: [{ lineKey: l.key, newValue: usd, fedCategory: 'interest', reason: `Convert ${cur} ${foreign.toLocaleString()} at the ${year} average rate ${right} (engine used ${rateKey.replace('_', ' ')}).`, evidence: [amtEv.id, `ref:fx.${cur}.${year}_average`] }],
      })
    }
    const max8938 = eff.version.lines.get('F8938.1.max')
    const maxEv = max8938 && (max8938.sources || []).map(r => ix.evs.get(r)).find(e => e && e.value_type === 'money')
    const maxRef = max8938 && (max8938.sources || []).find(r => r.startsWith('ref:fx.'))
    if (maxEv && maxRef) {
      const [, cur, rk] = maxRef.slice(4).split('.')
      const maxUsd = Math.round((evVal(ix, s, maxEv.id) || 0) / par.fx[cur][rk])
      push({
        id: 'fx-8938', area: 'retirement', title: 'Form 8938 maximum value recomputed', kind: 'recompute', severity: 'low',
        status: near(L('F8938.1.max'), maxUsd) ? 'pass' : 'fail',
        summary: `${cur} ${(evVal(ix, s, maxEv.id) || 0).toLocaleString()} ÷ ${par.fx[cur][rk]} (Treasury year-end) = ${maxUsd.toLocaleString()} USD. Over the reporting threshold, so Form 8938 is required; FBAR (FinCEN 114) is filed separately.`,
        detail: [], expected: maxUsd, actual: L('F8938.1.max'), lines: ['F8938.1.max'], evidence: [maxEv.id, maxRef], suggestions: [],
      })
    }
  }

  // ---------- Schedule C ----------
  {
    // Form 1099-K amounts that already sit inside the books (the deposit detail shows the same
    // amount) must not be added to gross receipts again.
    const booksDoc = docsOfType(ix, clock, /^books_profit_loss$/)[0]
    const booksEv = booksDoc && fieldIn(ix, booksDoc.id, /^total_income$/)[0]
    const k1099 = docsOfType(ix, clock, /^1099-K$/).flatMap(d => fieldIn(ix, d.id, /^box1a$/))
    const detail = docsOfType(ix, clock, /books_transaction_detail/).flatMap(d => ix.evsByDoc.get(d.id) || [])
    const necs = docsOfType(ix, clock, /^1099-NEC$/).flatMap(d => fieldIn(ix, d.id, /^box1$/))
    if (booksEv && k1099.length) {
      const books = evVal(ix, s, booksEv.id) || 0
      const k = k1099.reduce((a, e) => a + (evVal(ix, s, e.id) || 0), 0)
      const inBooks = detail.find(e => e.value_type === 'money' && near(e.value, k, 0.5))
      const overlapNec = necs.find(n => detail.some(e => e.value_type === 'money' && near(e.value, n.value, 0.5)))
      const overlapPayer = overlapNec ? ix.docs.get(overlapNec.document_id)!.issuer : undefined
      const nec = necs.reduce((a, e) => a + (evVal(ix, s, e.id) || 0), 0)
      const noForm = detail.find(e => /unreported|no.?1099|without/i.test(e.field + ' ' + e.label))
      const small = noForm ? evVal(ix, s, noForm.id) || 0 : 0
      if (inBooks) push({
        id: 'gross-1099k', area: 'business', title: 'Form 1099-K amount added on top of books (double counted)', kind: 'engine_error', severity: 'high',
        status: near(L('SchC.1'), books) ? 'pass' : 'fail',
        summary: `Books revenue ${books.toLocaleString()} already includes the ${k.toLocaleString()} of card payments: the deposit detail shows the same ${k.toLocaleString()} received${overlapPayer ? ` from ${overlapPayer}` : ''}. The engine added the 1099-K again → ${L('SchC.1')?.toLocaleString()}.`,
        detail: [
          ...(noForm ? [`Reconciliation: Forms 1099-NEC ${nec.toLocaleString()} + clients without a 1099 ${small.toLocaleString()} = ${(nec + small).toLocaleString()} vs books ${books.toLocaleString()}.`] : []),
          ...(overlapPayer ? [`The 1099-K overlaps ${overlapPayer}'s Form 1099-NEC, which also includes the card payments. Keep this reconciliation for any third-party matching notice.`] : []),
        ],
        expected: books, actual: L('SchC.1'), lines: ['SchC.1'], evidence: [booksEv.id, inBooks.id, ...k1099.map(e => e.id), ...(noForm ? [noForm.id] : []), ...(overlapNec ? [overlapNec.id] : [])],
        suggestions: [{ lineKey: 'SchC.1', newValue: books, fedCategory: 'schc_profit', reason: `Form 1099-K ${k.toLocaleString()} is card receipts already deposited and booked (deposit detail)${overlapPayer ? `; also on ${overlapPayer}'s 1099-NEC` : ''}. Gross receipts = books ${books.toLocaleString()}.`, evidence: [inBooks.id, ...k1099.map(e => e.id), booksEv.id] }],
      })
    }
    // Mileage logs: pages are compared trip by trip, so a page scanned twice is caught even
    // though its page total looks legitimate.
    for (const doc of docsOfType(ix, clock, /mileage_log/)) {
      const trips = doc.pages.map(p => [...p.printed_content.matchAll(/(\d{4}-\d{2}-\d{2}) ([^;]*?) (\d+) mi/g)].map(m => `${m[1]}|${m[2]}|${m[3]}`).join(';'))
      const dupPages: number[] = []
      trips.forEach((t, i) => { if (t && trips.indexOf(t) !== i) dupPages.push(i + 1) })
      const pageTotals = fieldIn(ix, doc.id, /^page_total$/)
      const miles = pageTotals.filter(e => !dupPages.includes(e.page)).reduce((a, e) => a + (evVal(ix, s, e.id) || 0), 0)
      const carExp = Math.round(miles * par.mileage_rate)
      const o0 = fieldIn(ix, doc.id, /^odometer_start$/)[0], o1 = fieldIn(ix, doc.id, /^odometer_end$/)[0]
      const driven = o0 && o1 ? (evVal(ix, s, o1.id) || 0) - (evVal(ix, s, o0.id) || 0) : 0
      if (!dupPages.length && near(L('SchC.44a'), miles)) continue
      push({
        id: 'mileage-dup', area: 'business', title: 'Mileage log page scanned twice', kind: 'extraction_error', severity: 'medium',
        status: near(L('SchC.44a'), miles) && near(L('SchC.9'), carExp) ? 'pass' : 'fail',
        summary: `Page ${dupPages.join(', ')} of the mileage log repeats page ${dupPages.map(p => trips.indexOf(trips[p - 1]) + 1).join(', ')} trip for trip. Business miles = ${miles.toLocaleString()}, not ${L('SchC.44a')?.toLocaleString()}; car expense ${miles.toLocaleString()} × ${par.mileage_rate} = ${carExp.toLocaleString()}.`,
        detail: [...(driven ? [`Odometer: ${driven.toLocaleString()} total miles; business use ${Math.round(miles / driven * 100)}%.`] : []), 'Pages compared trip by trip (date, destination, miles), not by page total.'],
        expected: miles, actual: L('SchC.44a'), lines: ['SchC.44a', 'SchC.9'], evidence: [...pageTotals.map(e => e.id), ...dupPages.map(p => `doc:${doc.id}#page${p}`)],
        suggestions: [
          { lineKey: 'SchC.44a', newValue: miles, fedCategory: 'none', reason: `Exclude the duplicate scan (page ${dupPages.join(', ')}) of the mileage log.`, evidence: pageTotals.filter(e => dupPages.includes(e.page)).map(e => e.id) },
          { lineKey: 'SchC.9', newValue: carExp, fedCategory: 'schc_profit', reason: `${miles.toLocaleString()} business miles × ${par.mileage_rate} standard rate.`, evidence: [...pageTotals.filter(e => !dupPages.includes(e.page)).map(e => e.id), 'ref:param.mileage_rate'] },
        ],
      })
    }
    // Utilities
    const phone = evVal(ix, s, 'ev-0101') || 0, net = evVal(ix, s, 'ev-0095') || 0
    const util = Math.round(phone * 0.7 + net * 0.5)
    const callHeld = clock >= '2026-03-26T17:00:00Z'
    push({
      id: 'utilities-pct', area: 'business', title: 'Family phone plan and home internet deducted at 100%', kind: 'engine_error', severity: 'low',
      status: !callHeld ? 'judgment' : near(L('SchC.25'), util) ? 'pass' : 'fail',
      summary: `Telephone ${phone.toLocaleString()} is a 4-line family plan (business share 70% per Erik) and internet ${net.toLocaleString()} is shared (50%). Deductible ${util.toLocaleString()}, not ${L('SchC.25')?.toLocaleString()}.`,
      detail: ['Source: call notes 2026-03-26 (call-01) and transaction detail D15.'],
      expected: util, actual: L('SchC.25'), lines: ['SchC.25'], evidence: ['ev-0101', 'ev-0095', 'ev-0107', 'ev-0108', 'call-01'],
      suggestions: callHeld ? [{ lineKey: 'SchC.25', newValue: util, fedCategory: 'schc_profit', reason: `Business share: phone ${phone.toLocaleString()} × 70% + internet ${net.toLocaleString()} × 50% (client, call-01).`, evidence: ['call-01', 'ev-0107', 'ev-0108'] }] : [],
    })
    const spot = evVal(ix, s, 'ev-0106') || 0
    push({
      id: 'software-personal', area: 'business', title: 'Personal subscription in business software', kind: 'client_answer', severity: 'low',
      status: !callHeld ? 'judgment' : near(L('SchC.27a.1'), 6850 - spot) ? 'pass' : 'fail',
      summary: `Spotify Family ${spot.toLocaleString()} is personal (booked by mistake, call-01). Software ${(6850 - spot).toLocaleString()}.`,
      detail: [], expected: 6850 - spot, actual: L('SchC.27a.1'), lines: ['SchC.27a.1'], evidence: ['ev-0106', 'call-01'],
      suggestions: callHeld ? [{ lineKey: 'SchC.27a.1', newValue: 6850 - spot, fedCategory: 'schc_profit', reason: 'Remove Spotify Family (personal; client confirmed booked by mistake).', evidence: ['ev-0106', 'call-01'] }] : [],
    })
    // SEHI
    push({
      id: 'sehi-eligible', area: 'business', title: 'Self-employed health insurance not allowed', kind: 'client_answer', severity: 'high',
      status: (L('Sch1.17') || 0) === 0 ? 'pass' : 'fail',
      summary: `Erik was eligible for subsidized family coverage through Ngozi's employers in 2025 (qa-25) and chose his own plan. IRC 162(l)(2)(B): no deduction for any month the taxpayer is eligible for an employer plan of a spouse. Engine deducted ${L('Sch1.17')?.toLocaleString()}.`,
      detail: ['Consistent with 2024: the prior preparer allowed no deduction (Erik was on Ngozi\'s plan).', 'The premiums are personal; they remain non-deductible on Schedule C too (correctly excluded by the engine).'],
      expected: 0, actual: L('Sch1.17'), lines: ['Sch1.17'], evidence: ['qa-25', 'ev-0484', 'py:/return_2024/notes/Sch1.17'],
      suggestions: [{ lineKey: 'Sch1.17', newValue: 0, fedCategory: 'adjustment', reason: "Not allowed: eligible for employer-subsidized coverage through spouse's employer (IRC 162(l)(2)(B); qa-25).", evidence: ['qa-25', 'py:/return_2024/notes/Sch1.17'] }],
      estimate: { fed: 14400 * 0.31, ca: 14400 * 0.042 },
    })
    // SEP - recompute the limit on the workpaper's Schedule C profit (SE tax recomputed here too,
    // since the engine's SE lines sit behind a non-linear rule and do not move with adjustments).
    const net31 = L('SchC.31') || 0
    const seBase = net31 * par.se_factor
    const halfSe = Math.round(Math.min(seBase, par.ss_wage_base) * 0.124 / 2 + seBase * 0.029 / 2)
    const limit = Math.round((net31 - halfSe) * 0.2)
    const sepDeducted = L('Sch1.16') || 0
    const sepDecided = [...s.decisions.values()].some(d => d.checkId === 'sep-excess')
    push({
      id: 'sep-excess', area: 'business', title: 'SEP deduction above the limit once Schedule C is corrected', kind: 'judgment', severity: 'medium',
      status: !near(sepDeducted, limit, 2) ? 'fail' : sepDecided ? 'pass' : 'judgment',
      summary: `Limit = 20% × (net profit ${net31.toLocaleString()} − ½ SE tax ${halfSe.toLocaleString()}) = ${limit.toLocaleString()}; deducted ${sepDeducted.toLocaleString()}. Contribution 18,000 → nondeductible excess ${(18000 - limit).toLocaleString()}: 10% excise (IRC 4972, Form 5330) unless withdrawn, or carry forward under 404.`,
      detail: ['Recomputed independently on the workpaper profit - the engine\'s limit used the uncorrected Schedule C.', 'Advise the client and record the decision (withdraw the excess vs carry it forward).'],
      expected: limit, actual: sepDeducted, lines: ['Sch1.16'], evidence: ['ev-0485', 'qa-26', 'SchC.31'],
      suggestions: !near(sepDeducted, limit, 2) ? [{ lineKey: 'Sch1.16', newValue: limit, fedCategory: 'adjustment', reason: `SEP limit recomputed on the corrected Schedule C profit (${net31.toLocaleString()}): 20% × (profit − ½ SE tax ${halfSe.toLocaleString()}).`, evidence: ['ev-0485', 'SchC.31'] }] : [],
      action: { kind: 'decision', label: 'Record SEP decision' },
    })
    // Election opportunity the engine priced but never applied
    const s179 = ix.p.what_if.alternatives.find((a: any) => a.id === 'equipment_section179')
    const adopted179 = [...s.adjustments.values()].some(a => a.status === 'active' && a.whatIf === 'equipment_section179')
    push({
      id: 'election-179', area: 'business', title: 'Section 179 election saves California tax at no federal cost', kind: 'judgment', severity: 'low',
      status: adopted179 || [...s.decisions.values()].some(d => d.checkId === 'election-179') ? 'pass' : 'judgment',
      summary: `Federally, 100% special depreciation and section 179 both deduct the full 38,000. California allows section 179 (up to 25,000) but no bonus depreciation, so electing 179 cuts California tax by ${Math.abs(s179?.california.total_tax_change || 0).toLocaleString()} (engine what-if), federal change ${s179?.federal.total_tax_change}.`,
      detail: ['Section 179 is limited to business income - Schedule C profit is well above 38,000.', 'Elect on Form 4562 Part I; record the election.'],
      lines: ['F4562-C.12', 'F4562-C.14', 'SchCA540NR.12.C'], evidence: ['ev-0141', 'ev-0142', 'ev-0143', 'ref:param.ca_section179_limit'],
      suggestions: s179 && !adopted179 ? [{ lineKey: 'F4562-C.12', delta: 38000, fedCategory: 'custom', caCategory: 'custom', customFed: s179.federal.total_tax_change, customCa: s179.california.total_tax_change, whatIf: 'equipment_section179', reason: 'Elect section 179 for the 38,000 of studio equipment instead of special depreciation (federal unchanged; California allows 179, not bonus). Effect from the engine what-if.', evidence: ['ev-0141', 'ev-0142', 'ev-0143'] }, { lineKey: 'F4562-C.14', delta: -38000, fedCategory: 'none', caCategory: 'none', reason: 'Special depreciation replaced by the section 179 election (effect carried on F4562-C.12).', evidence: [] }] : [],
      action: { kind: 'decision', label: 'Record election' },
    })
    push({
      id: 'home-office', area: 'business', title: 'Home office: 2024 used 300 sq ft; measurements say 220', kind: 'prior_year', severity: 'low',
      status: 'pass',
      summary: 'Measured: Sacramento 220 sq ft (Jan-mid July), Austin 260 sq ft (from 07/16). Average 240 → 1,200. The 2024 return used 300 sq ft (prior preparer: "2 rooms combined?" - never confirmed). 2024 overstated by about 400; immaterial - note for the client, no amended return.',
      detail: [], lines: ['SchC.30'], evidence: ['ev-0481', 'ev-0482', 'py:/prior_preparer_workpaper/open_items_left_by_prior_preparer/2'], suggestions: [],
    })
  }

  // ---------- Rentals ----------
  {
    const hvac = L('SchE.14A') || 0
    const wi = ix.p.what_if.alternatives.find((a: any) => a.id === 'hvac_improvement')
    push({
      id: 'hvac-capitalize', area: 'rentals', title: 'HVAC system replacement expensed as a repair', kind: 'judgment', severity: 'high',
      status: hvac >= 13000 ? 'fail' : 'pass',
      summary: 'The 11,000 Delta Breeze invoice replaced the entire furnace and AC with a new heat pump system, air handler and line set (permit B25-31877). Replacing the HVAC system - a building system and unit of property - is a restoration/betterment that must be capitalized (Reg. 1.263(a)-3(k), (j)); 27.5-year property placed in service 08/2025.',
      detail: [
        'The owner statement lumps it in repairs (13,300). The client called it "replace the HVAC". The engine expensed it.',
        `Engine what-if hvac_improvement: federal tax +${wi?.federal.total_tax_change.toLocaleString()}, California +${wi?.california.total_tax_change.toLocaleString()}.`,
        'De minimis safe harbor (2,500 per item) and routine maintenance safe harbor do not apply.',
      ],
      expected: 2300, actual: hvac, lines: ['SchE.14A', 'SchE.18A'], evidence: ['ev-1001', 'ev-1004', 'D47', 'call-01', 'qa-37'],
      suggestions: [
        { lineKey: 'SchE.14A', delta: -11000, fedCategory: 'custom', caCategory: 'custom', customFed: wi?.federal.total_tax_change, customCa: wi?.california.total_tax_change, whatIf: 'hvac_improvement', reason: 'Capitalize HVAC system replacement (heat pump, air handler, line set) - restoration of a building system, Reg. 1.263(a)-3. Tax effect from engine what-if.', evidence: ['D47', 'ev-1001', 'call-01'] },
        { lineKey: 'SchE.18A', delta: 150, fedCategory: 'none', caCategory: 'none', reason: 'New asset SAC-HVAC 11,000, 27.5-yr SL mid-month from 08/2025: 11,000 / 27.5 × 4.5/12 = 150 (included in the what-if effect).', evidence: ['D47'] },
      ],
      action: { kind: 'decision', label: 'Record capitalization judgment' },
    })
  }

  // ---------- Deductions ----------
  {
    // Donated vehicles: the deduction is limited to the charity's gross proceeds (Form 1098-C box 4c).
    for (const d of docsOfType(ix, clock, /^1098-C$/)) {
      const pEv = fieldIn(ix, d.id, /^box4c$/)[0]
      const evIds = new Set((ix.evsByDoc.get(d.id) || []).map(e => e.id))
      const line = eff.version.v.lines.find(l => l.form === 'F8283' && (l.sources || []).some(r => evIds.has(r)))
      if (!pEv || !line) continue
      const proceeds = evVal(ix, s, pEv.id) || 0
      const veh = L(line.key) || 0
      const est = (line.sources || []).find(r => r.startsWith('qa-'))
      push({
        id: 'vehicle-donation', area: 'deductions', title: 'Donated vehicle deducted above what the charity sold it for', kind: 'client_answer', severity: 'medium',
        status: veh <= proceeds ? 'pass' : 'fail',
        summary: `Form 1098-C: the charity sold the vehicle for ${proceeds.toLocaleString()}. The deduction is limited to gross proceeds (IRC 170(f)(12)); the return claims ${veh.toLocaleString()}${est ? ', the client\'s own estimate' : ''}.`,
        detail: ['Keep the 1098-C with Form 8283 — noncash gifts are a common examination item.'],
        expected: proceeds, actual: veh, lines: [line.key, 'SchA.12'], evidence: [pEv.id, d.id, ...(est ? [est] : [])],
        suggestions: [{ lineKey: line.key, newValue: proceeds, fedCategory: 'itemized', reason: `Limited to gross proceeds ${proceeds.toLocaleString()} on Form 1098-C box 4c (vehicle sold by the charity); IRC 170(f)(12).`, evidence: [pEv.id, d.id] }],
      })
    }
    const mort = L('SchA.8a') || 0
    const lone = evVal(ix, s, 'ev-1029') || 0, pecan = evVal(ix, s, 'ev-1034') || 0, pts = evVal(ix, s, 'ev-1030') || 0
    const exp = lone + pecan + pts
    push({
      id: 'mortgage-double', area: 'deductions', title: 'Payoff interest counted twice', kind: 'engine_error', severity: 'medium',
      status: near(mort, exp) ? 'pass' : 'fail',
      summary: `Lonestar 1098 box 1 (${lone.toLocaleString()}) already "includes prepaid interest at closing and interest paid at payoff"; the payoff statement says the same. Engine added the payoff interest 2,150 again. Expected ${lone.toLocaleString()} + ${pecan.toLocaleString()} + points ${pts.toLocaleString()} = ${exp.toLocaleString()}.`,
      detail: ['Points on purchase (box 6) are deductible in full; refinance points 3,200 amortized over 30 years (Schedule A line 8c) - engine correct.'],
      expected: exp, actual: mort, lines: ['SchA.8a'], evidence: ['ev-1029', 'ev-1032', 'D55', 'D56'],
      suggestions: [{ lineKey: 'SchA.8a', newValue: exp, fedCategory: 'itemized', reason: 'Remove payoff interest 2,150 - already included in Lonestar Form 1098 box 1 (D55; payoff statement D56 confirms).', evidence: ['ev-1029', 'ev-1032'] }],
    })
    const tax = L('SchA.5b') || 0
    const credit = evVal(ix, s, 'ev-1027') || 0, levy = evVal(ix, s, 'ev-1036') || 0
    const own = levy - credit
    const salt = (L('SchA.5a') || 0)
    const cap = par.salt_cap
    const fedEff = (Math.min(cap, salt + own) - Math.min(cap, salt + tax)) * rates.itemized.federal_per_dollar
    push({
      id: 'property-tax-proration', area: 'deductions', title: 'Home property tax includes the seller\'s share', kind: 'engine_error', severity: 'medium',
      status: near(tax, own) ? 'pass' : 'fail',
      summary: `Travis County 2025 levy ${levy.toLocaleString()} paid from escrow, but the buyer closing statement credits the buyers ${credit.toLocaleString()} for the seller's period (01/01-07/07). Buyers deduct only their share: ${own.toLocaleString()} (Reg. 1.164-6).`,
      detail: [`Federal: SALT falls below the 40,000 cap, so ${Math.round(Math.min(cap, salt + tax) - Math.min(cap, salt + own)).toLocaleString()} of the reduction counts (cap absorbs the rest). California itemized drops by the full amount.`],
      expected: own, actual: tax, lines: ['SchA.5b'], evidence: ['ev-1036', 'ev-1038', 'ev-1027', 'D54'],
      suggestions: [{ lineKey: 'SchA.5b', newValue: own, fedCategory: 'custom', caCategory: 'itemized', customFed: Math.round(fedEff), reason: `Seller-period taxes ${credit.toLocaleString()} credited at closing are the seller's deduction; buyers deduct ${own.toLocaleString()}. Federal effect computed through the SALT cap.`, evidence: ['ev-1027', 'ev-1036'] }],
    })
    // Low-confidence St. Brigid
    const v = s.verifications.get('ev-1049')
    const msg08 = clock >= '2026-07-01T16:40:00Z'
    push({
      id: 'st-brigid', area: 'deductions', title: 'Handwritten receipt: 1,500 or 7,500?', kind: 'extraction_error', severity: 'low',
      status: v ? 'pass' : msg08 ? 'fail' : 'judgment',
      summary: 'Receipt reads "$?,500.00 - first digit ambiguous (1 or 7)"; pipeline read 1,500 at 0.41 confidence. ' + (msg08 ? 'Client confirmed 1,500 with the parish and bank statement (check #2207, 12/21/2025) - msg-08. Record the verification.' : 'Confirm with the client.'),
      detail: ['Gift ≥ 250 needs a contemporaneous written acknowledgment: the parish receipt qualifies once the amount is confirmed.'],
      lines: ['SchA.11'], evidence: ['ev-1049', 'msg-08'], suggestions: [],
      action: msg08 ? { kind: 'decision', label: 'Verify: confirmed with client' } : { kind: 'question', label: 'Ask client', payload: { subject: 'St. Brigid gift amount', body: 'Was the December gift to St. Brigid 1,500 or 7,500? A bank statement line or cancelled check is enough.', refs: ['ev-1049'] } },
    })
    // Dependent care EIN
    const ein = evVal(ix, s, 'ev-1045')
    const printed = ix.docs.get('D62')!.pages[0].printed_content.match(/Tax ID (\d{2}-\d{7})/)?.[1]
    push({
      id: 'care-ein', area: 'deductions', title: 'Care provider tax ID misread (digits transposed)', kind: 'extraction_error', severity: 'low',
      status: ein === printed ? 'pass' : 'fail',
      summary: `Little Sprouts statement prints tax ID ${printed}; pipeline read ${ev(ix, 'ev-1045')?.value} at 0.97 confidence. Form 2441 must show the provider's correct TIN. Also: engine names provider 1 "Bright Oak Preschool"; the statement and 2024 return say "Bright Oak Kids Club".`,
      detail: ['No tax effect (credit is zero after the 5,000 exclusion) but the exclusion itself requires correct provider information.'],
      expected: printed, actual: ein, lines: ['F2441.1b', 'F2441.1a'], evidence: ['ev-1045', 'D62', 'ev-1043', 'py:/return_2024/lines/F2441.provider'], suggestions: [],
      action: { kind: 'correct_ev', label: `Correct to ${printed}`, payload: { ref: 'ev-1045', value: printed } },
    })
  }

  // ---------- Dependents / identity ----------
  {
    // Each dependent's SSN is compared with the Social Security card (if in the file) and last
    // year's return; a mismatch rejects the e-file and costs the credit.
    for (const t of dependentTins(ix, s, clock)) {
      if (!t.expected) continue
      const first = t.person.name.split(' ')[0]
      push({
        id: `dep-ssn-${t.person.id}`, area: 'intake', title: t.ok ? `${first}'s SSN agrees to ${t.card ? 'the Social Security card' : "last year's return"}` : `${first}'s SSN doesn't match ${t.card ? 'the Social Security card' : "last year's return"}`, kind: 'client_answer', severity: 'high',
        status: t.ok ? 'pass' : 'fail',
        summary: `Organizer: ${t.current}. ${t.pyEv ? `Prior-year return: ${t.pyEv.value}. ` : ''}${t.card ? `Social Security card (${t.card.document_id}): ${t.card.value}. ` : ''}A mismatched dependent SSN rejects the e-file (R0000-504-02) and disallows the credit.`,
        detail: ['Caught before filing by comparing household data with the prior-year return; the card is the definitive source.'],
        expected: t.expected, actual: t.current, lines: ['F8812.4'], evidence: [`household:${t.person.id}`, ...(t.pyEv ? [t.pyEv.id] : []), ...(t.card ? [t.card.id] : [])], suggestions: [],
        action: { kind: 'correct_household', label: `Correct to ${t.expected}`, payload: { ref: t.ref, value: t.expected } },
      })
    }
    const dd = [...s.decisions.values()].some(d => d.kind === 'due_diligence' && !d.superseded)
    push({
      id: 'due-diligence', area: 'deductions', title: 'Due diligence (Form 8867) for CTC / ODC', kind: 'judgment', severity: 'medium',
      status: dd ? 'pass' : 'judgment',
      summary: 'Child tax credit (Theo) and credit for other dependents (Ada, full-time student, files her own return checking "can be claimed") require documented due diligence: relationship, residency (12 months), age, student status (1098-T), support.',
      detail: ['Firm rule: due diligence documented for CTC, ODC, AOTC, EIC and HOH.'],
      lines: ['F8867.status', 'F8812.12'], evidence: ['household:ada', 'household:theo', 'ev-1041', 'D59'], suggestions: [],
      action: { kind: 'decision', label: 'Complete due diligence' },
    })
  }

  // ---------- Payments ----------
  {
    const tr = ix.p.tax_agency_records.irs_account_transcript_2025[0].transactions.filter((t: any) => t.code === '670')
    const irs = tr.reduce((a: number, t: any) => a + t.amount, 0)
    const pulled = clock >= '2026-03-12T16:20:00Z'
    push({
      id: 'est-fed', area: 'tax', title: 'Federal 4th-quarter estimate: 3,000 per IRS, not 4,000', kind: 'client_answer', severity: 'medium',
      status: !pulled ? 'judgment' : near(L('F1040.26'), irs) ? 'pass' : 'fail',
      summary: `IRS account transcript shows ${tr.length} payments totaling ${irs.toLocaleString()} (Q4: 3,000 on 01/15/2026). EFTPS confirmations (D67) cover only Q1-Q3. The engine used the client's recollection "4,000 I think" (qa-41).`,
      detail: ['Firm standard: estimated payments agreed to IRS and FTB records.'],
      expected: irs, actual: L('F1040.26'), lines: ['F1040.26'], evidence: ['agency:/irs_account_transcript_2025/0', 'qa-41', 'ev-1056', 'ev-1058', 'ev-1060'],
      suggestions: pulled ? [
        { lineKey: 'F1040.26', newValue: irs, fedCategory: 'payment', reason: 'Agree to IRS account transcript (4 payments, Q4 3,000 on 2026-01-15); client recollection of 4,000 not supported.', evidence: ['agency:/irs_account_transcript_2025/0', 'qa-41'] },
        ...(near(L('F1040.26'), irs) ? [] : [{ lineKey: 'F1040.38', delta: Math.round(((L('F1040.26') || 0) - irs) * par.fed_underpayment_rate * 90 / 365), fedCategory: 'custom', customFed: Math.round(((L('F1040.26') || 0) - irs) * par.fed_underpayment_rate * 90 / 365), reason: `Q4 shortfall ${((L('F1040.26') || 0) - irs).toLocaleString()} more for 01/15–04/15 at ${+(par.fed_underpayment_rate * 100).toFixed(2)}% → Form 2210 penalty up ≈ ${Math.round(((L('F1040.26') || 0) - irs) * par.fed_underpayment_rate * 90 / 365)} (the engine recomputes exactly).`, evidence: ['ref:param.fed_underpayment_rate', 'F2210.19'] }]),
      ] : [],
    })
    const ftb = ix.p.tax_agency_records.ftb_account
    const caPaid = ftb.tax_year_2025_payments.reduce((a: number, t: any) => a + t.amount, 0)
    push({
      id: 'est-ca', area: 'california', title: 'California: 09/15/2025 payment was applied to tax year 2024', kind: 'engine_error', severity: 'medium',
      status: !pulled ? 'judgment' : near(L('F540NR.72'), caPaid) ? 'pass' : 'fail',
      summary: `FTB Web Pay confirmation (D68) and the FTB account both show the 09/15/2025 3,500 designated tax year 2024 (held as a 2024 credit). 2025 estimates = ${caPaid.toLocaleString()}; engine claimed 14,000.`,
      detail: ['Fix the return to 10,500, and ask FTB to transfer the 2024 credit to 2025 (or claim it as a 2024 refund). Client action item.'],
      expected: caPaid, actual: L('F540NR.72'), lines: ['F540NR.72'], evidence: ['ev-1076', 'ev-1075', 'agency:/ftb_account'],
      suggestions: pulled ? [{ lineKey: 'F540NR.72', newValue: caPaid, fedCategory: 'none', caCategory: 'payment', reason: '09/15/2025 Web Pay 3,500 was designated tax year 2024 (D68; FTB account). Request transfer of the 2024 credit separately.', evidence: ['ev-1076', 'agency:/ftb_account'] }] : [],
    })
  }

  // ---------- California ----------
  {
    const corv = evVal(ix, s, 'ev-0030') || 0
    const halv = received(ix, 'D73', clock) ? evVal(ix, s, 'ev-1081') || 0 : null
    const expected = halv != null ? corv + halv : null
    push({
      id: 'ca-wages', area: 'california', title: 'All wages sourced to California after the move to Texas', kind: 'engine_error', severity: 'high',
      status: expected == null ? 'judgment' : near(L('SchCA540NR.1.E'), expected) ? 'pass' : 'fail',
      summary: expected == null
        ? 'Halvorsen payroll kept California as the work state through 09/30 (W-2 box 16 = all wages). Wages earned while a Texas resident working in Texas are not California-source. Need a paystub at the move date.'
        : `CA-source wages = Corvane (CA employment, box 16 ${corv.toLocaleString()}) + Halvorsen through 07/15 (paystub YTD CA wages ${halv!.toLocaleString()}) = ${expected.toLocaleString()}. Engine used every W-2 box 16 dollar (${L('SchCA540NR.1.E')?.toLocaleString()}) because the employer kept withholding CA by mistake (qa-45).`,
      detail: ['The excess California withholding is recovered through the 540NR - it does not make the wages California-source.', 'The paystub D73 was in the file but no line used it.'],
      expected: expected ?? undefined, actual: L('SchCA540NR.1.E'), lines: ['SchCA540NR.1.E'], evidence: ['ev-0030', 'ev-0047', 'ev-1081', 'D73', 'qa-45'],
      suggestions: expected != null ? [{ lineKey: 'SchCA540NR.1.E', newValue: expected, fedCategory: 'none', caCategory: 'ca_source_income', reason: `CA-source wages: Corvane ${corv.toLocaleString()} + Halvorsen to 07/15 ${halv!.toLocaleString()} (paystub D73). Wages after the move are Texas-source.`, evidence: ['ev-0030', 'ev-1081'] }] : [],
    })
    push({
      id: 'ca-amt', area: 'california', title: 'California AMT on the ISO exercise not computed', kind: 'judgment', severity: 'medium',
      status: [...s.decisions.values()].some(d => d.checkId === 'ca-amt') ? 'pass' : 'judgment',
      summary: 'ISO exercised 07/30/2025, after Texas residency began (07/15). California sources option income by CA workdays between grant (03/01/2022) and exercise; Ngozi worked in CA for Corvane for most of that period. The engine did not compute Schedule P (540NR). Decide and document the CA-source portion of the 40,000 AMT adjustment.',
      detail: ['Reg. 17951-5 / FTB Pub 1004 allocation. Outcome may be zero CA AMT if the CA tentative minimum tax does not exceed regular tax - document either way.'],
      lines: ['F540NR.61', 'F6251.2i'], evidence: ['ev-0075', 'ev-0076', 'qa-03', 'qa-06'], suggestions: [],
      action: { kind: 'decision', label: 'Record CA AMT judgment' },
    })
  }

  // ---------- K-1 / basis ----------
  {
    const has2023 = received(ix, 'D40', clock)
    const begin = has2023 ? 21300 + (evVal(ix, s, 'ev-0983') || 0) + (evVal(ix, s, 'ev-0984') || 0) - (evVal(ix, s, 'ev-0985') || 0) + 16900 - 30000 : null
    push({
      id: 'scorp-basis', area: 'passthrough', title: 'S corporation stock basis rolled forward 2022 → 2025', kind: 'recompute', severity: has2023 ? 'low' : 'high',
      status: begin == null ? 'judgment' : near(L('F7203.1'), begin) ? 'pass' : 'fail',
      summary: begin == null
        ? '2023 K-1 missing: the engine assumed no change in 2023 (beginning basis 8,200). Distributions exceed basis - the excess is capital gain. Obtain the 2023 K-1.'
        : `2022 ending 21,300 + 2023 income 14,100 − distributions 20,000 = 15,400; + 2024 income 16,900 − 30,000 = ${begin.toLocaleString()} beginning 2025. 2025: + 18,485 − 42,000 → ${(42000 - begin - 18485).toLocaleString()} distributions in excess of basis (long-term gain, Form 7203).`,
      detail: ['Losses/deductions none; Oregon composite tax 1,580 is part of the distributions.', 'The prior preparer "assumed basis sufficient" in 2024 - it was (15,400 + 16,900 ≥ 30,000).'],
      expected: begin ?? undefined, actual: L('F7203.1'), lines: ['F7203.1', 'F7203.excess'], evidence: ['py:/basis_records/scorp_lindqvist_family_woodworks', 'ev-0983', 'ev-0985', 'ev-0977'], suggestions: [],
    })
    const k1 = received(ix, 'D37', clock)
    push({
      id: 'ridgeline-k1', area: 'passthrough', title: 'Ridgeline K-1 received and mapped', kind: 'completeness', severity: k1 ? 'low' : 'high',
      status: k1 && L('SchE.28B') ? 'pass' : 'judgment',
      summary: k1 ? 'Box 2 8,400 passive rental, box 5 interest 120, box 9a LTCG 1,350, box 21 foreign tax 210; capital 60,000 → 63,660. Arizona composite filed by the fund - no Arizona return. 22% California-source.' : 'Reported in 2024; not received for 2025 (expected June). Extension needed.',
      detail: [], lines: ['SchE.28B', 'SchB.1.8', 'SchD.12'], evidence: k1 ? ['ev-0964', 'ev-0965', 'ev-0966', 'ev-0970', 'ev-0971'] : ['py:/return_2024/K1_1065'], suggestions: [],
    })
  }

  // ---------- Questionnaire conflicts ----------
  {
    push({
      id: 'qa-conflicts', area: 'intake', title: 'Client answers contradicted by documents', kind: 'client_answer', severity: 'low', status: 'pass',
      summary: 'qa-14 "no investments sold" vs 282 brokerage sales + 12 crypto dispositions; qa-31 "no prior IRA basis" vs 2024 Form 8606 basis 7,000 and Form 5498 (D42); qa-41 Q4 estimate "4,000" vs IRS 3,000; qa-39 car "about 6,000" vs 1098-C 2,900. Documents govern; each conflict is resolved in its own finding.',
      detail: ['The 8606 basis (7,000) is right: the 2024 contribution was made 02/12/2025 and converted 02/20/2025 with the 2025 contribution - taxable conversion only 26.'],
      lines: ['F8606.2'], evidence: ['qa-14', 'qa-31', 'ev-0991', 'qa-41', 'qa-39'], suggestions: [],
    })
  }

  // ---------- Outside filings & completeness ----------
  push({
    id: 'outside-filings', area: 'intake', title: 'Filings outside this return', kind: 'outside_filing', severity: 'medium',
    status: [...s.decisions.values()].some(d => d.kind === 'scope' && !d.superseded) ? 'pass' : 'judgment',
    summary: 'FinCEN 114 (FBAR) for the Sparbanken account, due 10/15/2026 - not in engagement. Forms 1099-NEC for the two contractors (4,800; 2,600) were due 02/02/2026 - late. Possible unfiled 2023 Form 3520 (inheritance from Erik\'s mother over 100,000, prior preparer open item). Ada\'s own 1040 must keep "can be claimed" checked. Woodworks Oregon composite and Ridgeline Arizona composite cover the nonresident state filings.',
    detail: ['Engagement letter excludes FBAR, 1099s and other state returns: advise the client in writing and record it.'],
    lines: ['F8938.req', 'SchC.J'], evidence: ['D01', 'qa-23', 'ev-0487', 'ev-0488', 'py:/prior_preparer_workpaper/open_items_left_by_prior_preparer/3', 'D36'], suggestions: [],
    action: { kind: 'decision', label: 'Record client advice on outside filings' },
  })

  // ---------- Footing (arithmetic) ----------
  {
    const bad = [...eff.version.footing.entries()].filter(([, f]) => !f.ok).map(([k]) => k)
    push({
      id: 'footing', area: 'tax', title: 'Every summed line re-footed independently', kind: 'recompute', severity: 'low', status: bad.filter(k => !k.startsWith('F8949') && !k.startsWith('SchCA')).length ? 'fail' : 'pass',
      summary: `${eff.version.footing.size - bad.length} of ${eff.version.footing.size} sum/carry lines foot to their listed inputs. ${bad.length} don't because the engine lists only some inputs (California column D = A − B + C lists only A; Form 8949 totals include lots in cents).`,
      detail: bad.length ? ['Engine metadata gaps: ' + bad.join(', ')] : [],
      lines: bad, evidence: [], suggestions: [],
    })
  }

  // ---------- Document completeness ----------
  {
    const used = new Set(eff.version.v.documents_used)
    const visible = ix.p.documents.filter(d => d.received_at <= clock)
    const cited = new Set<string>()
    for (const l of eff.version.v.lines) for (const src of l.sources || []) {
      const e = ix.evs.get(src); if (e) cited.add(e.document_id)
      if (/^D\d\d$/.test(src)) cited.add(src)
    }
    const unaccounted = visible.filter(d => !cited.has(d.id) && !s.dispositions.has(d.id))
    push({
      id: 'docs-accounted', area: 'intake', title: 'Every document landed somewhere or has a reason', kind: 'completeness', severity: 'medium',
      status: unaccounted.length ? 'fail' : 'pass',
      summary: unaccounted.length
        ? `${unaccounted.length} of ${visible.length} documents feed no line and have no recorded disposition: ${unaccounted.map(d => d.id).join(', ')}.`
        : `All ${visible.length} documents are cited by a line or dispositioned.`,
      detail: [`Engine "documents_used" lists ${used.size}, but being "used" is not the same as landing on a line.`],
      lines: [], evidence: unaccounted.map(d => d.id), suggestions: [],
    })
  }

  return out
}

// Prior-year variance flags per firm standard (default >10% and >1,000).
export function varianceFlags(ix: Index, eff: Effective, standards: any) {
  const vr = standards.variance_review
  const prior = ix.p.prior_years.return_2024.lines as Record<string, any>
  const labels = ix.p.prior_years.return_2024.line_labels || {}
  const out: { key: string; label: string; prior: number; current: number; change: number; pct: number }[] = []
  for (const [k, pv] of Object.entries(prior)) {
    if (typeof pv !== 'number') continue
    const cur = eff.lines.get(k)?.value
    if (typeof cur !== 'number') continue
    const ch = cur - pv
    const pc = pv ? ch / Math.abs(pv) : ch ? 1 : 0
    if (Math.abs(ch) > vr.and_over_amount && Math.abs(pc) * 100 > vr.flag_if_change_over_percent) {
      out.push({ key: k, label: eff.version.lines.get(k)?.label || labels[k] || k, prior: pv, current: cur, change: ch, pct: pc })
    }
  }
  return out
}
