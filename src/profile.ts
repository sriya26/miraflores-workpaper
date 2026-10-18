// Everything the UI says about "who is this client" comes from the packet, not from code, so
// the same workpaper opens any household's packet.

import type { Index } from './packet'
import { areaOfLine } from './areas'

export interface Profile {
  clientId: string
  taxYear: number
  names: string // "Ngozi Okafor & Erik Lindqvist"
  shortName: string // "Okafor-Lindqvist"
  filingStatus: string // "Married filing jointly"
  filingCode: string // "MFJ"
  moves: { from: string; to: string; date: string }[]
  dependents: { name: string; first: string; age: number; student: boolean; note?: string }[]
  businessName?: string
  partYearStates: string[]
}

const STATUS: Record<string, [string, string]> = {
  married_filing_jointly: ['Married filing jointly', 'MFJ'],
  married_filing_separately: ['Married filing separately', 'MFS'],
  single: ['Single', 'S'],
  head_of_household: ['Head of household', 'HOH'],
  qualifying_surviving_spouse: ['Qualifying surviving spouse', 'QSS'],
}

const STATE_NAME: Record<string, string> = { CA: 'California', TX: 'Texas', NY: 'New York', OR: 'Oregon', AZ: 'Arizona', NV: 'Nevada', WA: 'Washington', FL: 'Florida' }
export const stateName = (s: string) => STATE_NAME[s] || s

export function buildProfile(ix: Index): Profile {
  const h = ix.p.household
  const year = h.tax_year
  const tp = h.people.find((p: any) => p.role === 'taxpayer')
  const sp = h.people.find((p: any) => p.role === 'spouse')
  const last = (n: string) => n.split(' ').slice(-1)[0]
  const names = sp ? `${tp.name} & ${sp.name}` : tp.name
  const fromPacket = String(ix.p.packet.name || '').split(' household')[0]
  const shortName = fromPacket || (sp ? `${last(tp.name)}-${last(sp.name)}` : last(tp.name))
  const res = [...(h.residency || [])].sort((a: any, b: any) => (a.from < b.from ? -1 : 1))
  const moves = res.slice(1).map((r: any, i: number) => ({ from: stateName(res[i].state), to: stateName(r.state), date: r.from }))
  const yearEnd = new Date(`${year}-12-31T00:00:00Z`)
  const dependents = h.people.filter((p: any) => p.role === 'dependent').map((p: any) => {
    const dob = new Date(p.dob + 'T00:00:00Z')
    let age = yearEnd.getUTCFullYear() - dob.getUTCFullYear()
    if (yearEnd < new Date(Date.UTC(yearEnd.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()))) age--
    return { name: p.name, first: p.name.split(' ')[0], age, student: !!p.full_time_student, note: p.note }
  })
  const books = ix.p.documents.find(d => d.document_type === 'books_profit_loss')
  const businessName = books ? books.title.split(' - ')[0] : undefined
  const partYearStates = res.length > 1 ? res.filter((r: any) => r.status === 'resident').map((r: any) => r.state) : []
  const [filingStatus, filingCode] = STATUS[h.filing_status] || [h.filing_status, h.filing_status]
  return { clientId: ix.p.packet.client_id, taxYear: year, names, shortName, filingStatus, filingCode, moves, dependents, businessName, partYearStates }
}

// Which area a document belongs to is decided by the data: where its values land on the return.
// Documents that land nowhere fall back to the findings that cite them, then to their type.
const TYPE_AREA: [RegExp, string][] = [
  [/^(W-2|stock_plan_supplement|3921|3922)$/, 'wages'],
  [/^(1099-composite|1099-INT|1099-DIV|1099-B|1099-DA|transaction_export)$/, 'investments'],
  // 1098s, property-tax bills, insurance and contribution statements: no type rule - they belong
  // wherever the property or plan is (rental vs home, business vs personal), so they follow their values.
  [/^(books_|1099-NEC|1099-K|mileage_log)/, 'business'],
  [/^(rental_|closing_statement_seller|1099-S$)/, 'rentals'],
  [/^K-1/, 'passthrough'],
  [/^(1099-R|5498|1099-SA|5498-SA|foreign_bank_statement)$/, 'retirement'],
  [/^(1098-T|1098-C|donation_receipt|dependent_care_statement|closing_statement_buyer|payoff_statement)$/, 'deductions'],
  [/^(irs_transcript|irs_notice)$/, 'tax'],
  [/^(prior_year_return|prior_workpaper|engagement_letter|consent_7216|identity_document|irs_ip_pin_notice)$/, 'intake'],
]

export function documentAreas(ix: Index, checks?: { area: string; evidence: string[] }[]): Map<string, string> {
  const out = new Map<string, string>()
  const latest = [...ix.versions.values()].slice(-1)[0]
  for (const d of ix.p.documents) {
    // 1. A standard tax form belongs to its natural area (W-2 → wages, 1099-K → business…).
    let area: string | undefined = TYPE_AREA.find(([re]) => re.test(d.document_type))?.[1]
    // 2. Anything else (invoices, letters, payment confirmations, notes) goes where its values land.
    if (!area) {
      const votes = new Map<string, number>()
      const vote = (a: string) => votes.set(a, (votes.get(a) || 0) + 1)
      for (const e of ix.evsByDoc.get(d.id) || []) for (const k of latest.citedBy.get(e.id) || []) vote(areaOfLine(k))
      for (const k of latest.citedBy.get(d.id) || []) vote(areaOfLine(k))
      area = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    }
    // 3. Documents that land nowhere follow the finding that cites them.
    if (!area && checks) {
      const evIds = new Set((ix.evsByDoc.get(d.id) || []).map(e => e.id))
      area = checks.find(c => c.evidence.some(r => r === d.id || r.startsWith(`doc:${d.id}#`) || evIds.has(r)))?.area
    }
    out.set(d.id, area || 'intake')
  }
  return out
}
