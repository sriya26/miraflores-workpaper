// Packet loading and indexing. The packet is loaded exactly as delivered and never mutated;
// everything the workpaper adds lives in the event log (store.ts).

export type Money = number

export interface Position { x0: number; y0: number; x1: number; y1: number }

export interface ExtractedValue {
  id: string
  document_id: string
  page: number
  field: string
  label: string
  value: any
  value_type: string
  text_as_read: string
  position: Position
  confidence: number
}

export interface Doc {
  id: string
  title: string
  document_type: string
  issuer: string
  belongs_to: string
  tax_year: number
  received_at: string
  uploaded_by: string
  file_name: string
  page_count: number
  pages: { page: number; printed_content: string }[]
  marked_corrected?: boolean
  extraction: { status: string; values: number; reason: string | null }
}

export interface Line {
  key: string
  jurisdiction: 'federal' | 'california'
  form: string
  line: string
  label: string
  value: any
  rule: string
  inputs?: string[]
  sources?: string[]
  note?: string
}

export interface ReturnVersion {
  version: string
  computed_at: string
  trigger: string
  documents_used: string[]
  documents_superseded: string[]
  summary: { federal: Record<string, number>; california: Record<string, number> }
  tax_effect_rates: Record<string, { federal_per_dollar: number; california_per_dollar: number }>
  carryovers_out: any
  assets: any[]
  diagnostics: { code: string; severity: string; message: string; refs: string[] }[]
  changes_from_previous: { key: string; change: string; old?: any; new?: any }[]
  lines: Line[]
}

export interface Packet {
  packet: any
  readme: any
  household: any
  documents: Doc[]
  extracted_values: ExtractedValue[]
  client: { questionnaire: any[]; messages: any[]; call_notes: any[] }
  firm: any
  prior_years: any
  tax_agency_records: any
  timeline: any[]
  engine_reference: any
  return_versions: ReturnVersion[]
  what_if: any
  planning_reference_2026: any
  post_filing_rates: any
  fx_rates: any
}

export interface VersionIndex {
  v: ReturnVersion
  lines: Map<string, Line>
  order: string[]
  // parents[k] = lines that list k as an input, with the sign k carries in that parent
  parents: Map<string, { key: string; sign: number }[]>
  linear: Set<string> // lines whose value is a signed sum of their inputs (R-SUM / R-CARRY that foot)
  footing: Map<string, { ok: boolean; computed: number; signs: number[] }>
  // reverse source index: ref -> line keys that cite it
  citedBy: Map<string, string[]>
}

export interface Index {
  p: Packet
  docs: Map<string, Doc>
  evs: Map<string, ExtractedValue>
  evsByDoc: Map<string, ExtractedValue[]>
  versions: Map<string, VersionIndex>
  qa: Map<string, any>
  msgs: Map<string, any>
  calls: Map<string, any>
  staff: Map<string, any>
  people: Map<string, any>
  timeline: Map<string, any>
  priorLines: Record<string, number>
}

function num(v: any): v is number { return typeof v === 'number' && isFinite(v) }

function inferSigns(target: number, vals: number[]): number[] | null {
  const n = vals.length
  if (n === 0) return null
  if (n > 14) {
    const s = vals.reduce((a, b) => a + b, 0)
    return Math.abs(s - target) <= Math.max(1.01, n * 0.01) ? vals.map(() => 1) : null
  }
  // prefer patterns with fewer negatives
  const combos: number[][] = []
  for (let m = 0; m < 1 << n; m++) combos.push(vals.map((_, i) => (m >> i) & 1 ? -1 : 1))
  combos.sort((a, b) => a.filter(x => x < 0).length - b.filter(x => x < 0).length)
  for (const signs of combos) {
    let s = 0
    for (let i = 0; i < n; i++) s += signs[i] * vals[i]
    if (Math.abs(s - target) <= 1.01) return signs
  }
  return null
}

function indexVersion(v: ReturnVersion): VersionIndex {
  const lines = new Map<string, Line>()
  for (const l of v.lines) lines.set(l.key, l)
  const parents = new Map<string, { key: string; sign: number }[]>()
  const linear = new Set<string>()
  const footing = new Map<string, { ok: boolean; computed: number; signs: number[] }>()
  const citedBy = new Map<string, string[]>()
  for (const l of v.lines) {
    for (const s of l.sources || []) {
      const base = s.startsWith('timeline:') ? s : s
      if (!citedBy.has(base)) citedBy.set(base, [])
      citedBy.get(base)!.push(l.key)
    }
    const ins = l.inputs || []
    if ((l.rule === 'R-SUM' || l.rule === 'R-CARRY') && ins.length && num(l.value)) {
      const vals = ins.map(k => lines.get(k)?.value)
      if (vals.every(num)) {
        const signs = inferSigns(l.value, vals as number[])
        const computed = signs ? (vals as number[]).reduce((a, x, i) => a + x * signs[i], 0) : (vals as number[]).reduce((a, b) => a + b, 0)
        footing.set(l.key, { ok: !!signs, computed, signs: signs || ins.map(() => 1) })
        linear.add(l.key)
        ins.forEach((k, i) => {
          if (!parents.has(k)) parents.set(k, [])
          parents.get(k)!.push({ key: l.key, sign: signs ? signs[i] : 1 })
        })
      }
    } else if (ins.length) {
      // non-linear rule: record dependency (sign unknown) so we can mark "needs recompute"
      ins.forEach(k => {
        if (!parents.has(k)) parents.set(k, [])
        parents.get(k)!.push({ key: l.key, sign: 0 })
      })
    }
  }
  return { v, lines, order: v.lines.map(l => l.key), parents, linear, footing, citedBy }
}

export function buildIndex(p: Packet): Index {
  const docs = new Map(p.documents.map(d => [d.id, d]))
  const evs = new Map(p.extracted_values.map(e => [e.id, e]))
  const evsByDoc = new Map<string, ExtractedValue[]>()
  for (const e of p.extracted_values) {
    if (!evsByDoc.has(e.document_id)) evsByDoc.set(e.document_id, [])
    evsByDoc.get(e.document_id)!.push(e)
  }
  const versions = new Map(p.return_versions.map(v => [v.version, indexVersion(v)]))
  return {
    p, docs, evs, evsByDoc, versions,
    qa: new Map(p.client.questionnaire.map(q => [q.id, q])),
    msgs: new Map(p.client.messages.map(m => [m.id, m])),
    calls: new Map(p.client.call_notes.map(c => [c.id, c])),
    staff: new Map(p.firm.staff.map((s: any) => [s.id, s])),
    people: new Map(p.household.people.map((s: any) => [s.id, s])),
    timeline: new Map(p.timeline.map(t => [t.id, t])),
    priorLines: p.prior_years.return_2024.lines,
  }
}

export async function loadPacket(url = '/packet.json'): Promise<Packet> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Could not load packet (${r.status})`)
  return r.json()
}

// JSON Pointer (RFC 6901)
export function jsonPointer(root: any, ptr: string): any {
  if (ptr === '' || ptr === '/') return root
  const parts = ptr.replace(/^\//, '').split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur = root
  for (const part of parts) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}

export function versionAt(ix: Index, clock: string): VersionIndex {
  let best: VersionIndex | null = null
  for (const v of ix.versions.values()) if (v.v.computed_at <= clock) best = v
  return best || ix.versions.get('v1')!
}
