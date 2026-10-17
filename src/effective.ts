// The workpaper return = engine output (latest version at the replay clock) + the workpaper's
// active adjustments. We cannot rerun the engine, so:
//  - line values: an adjustment's delta is pushed up through every line that is a signed sum of
//    its inputs (signs inferred and footed independently in packet.ts). Lines behind a non-linear
//    rule (tax tables, phase-outs) are flagged "needs recompute" instead of being guessed.
//  - tax: the delta that reaches the category's driver line x the version's tax_effect_rates.

import type { Index, VersionIndex } from './packet'
import type { Adjustment, State } from './model'
import { CATEGORIES } from './areas'

export interface LineEff {
  key: string
  base: any
  value: any
  delta: number
  adjIds: string[] // adjustments made directly on this line
  via: string[] // adjustments that flowed into this line
  stale: boolean // depends on a changed line through a non-linear rule
}

export interface Effect { fed: number; ca: number; fedBalance: number; caBalance: number; detail: string }

export interface Effective {
  version: VersionIndex
  lines: Map<string, LineEff>
  effects: Map<string, Effect>
  total: Effect
  summary: { federal: Record<string, number>; california: Record<string, number> }
  activeAdjustments: Adjustment[]
}

const DRIVER = new Map(CATEGORIES.filter(c => c.driver).map(c => [c.id, c.driver!]))

export function propagate(vix: VersionIndex, key: string, delta: number): { deltas: Map<string, number>; stale: Set<string> } {
  const deltas = new Map<string, number>()
  const stale = new Set<string>()
  const queue: [string, number][] = [[key, delta]]
  deltas.set(key, delta)
  let guard = 0
  while (queue.length && guard++ < 5000) {
    const [k, d] = queue.shift()!
    for (const par of vix.parents.get(k) || []) {
      if (par.sign === 0 || !vix.linear.has(par.key)) {
        markStale(vix, par.key, stale)
        continue
      }
      const pd = d * par.sign
      deltas.set(par.key, (deltas.get(par.key) || 0) + pd)
      queue.push([par.key, pd])
    }
  }
  return { deltas, stale }
}

function markStale(vix: VersionIndex, key: string, stale: Set<string>) {
  if (stale.has(key)) return
  stale.add(key)
  for (const par of vix.parents.get(key) || []) markStale(vix, par.key, stale)
}

export function adjustmentEffect(vix: VersionIndex, a: Adjustment): Effect {
  const line = vix.lines.get(a.lineKey)
  const isCa = line ? line.jurisdiction === 'california' : a.lineKey.startsWith('SchCA') || a.lineKey.startsWith('F540') || a.lineKey.startsWith('FTB')
  const rates = vix.v.tax_effect_rates
  const { deltas } = propagate(vix, a.lineKey, a.delta)
  const atDriver = (cat: string) => {
    const drv = DRIVER.get(cat)
    if (drv && deltas.has(drv)) return deltas.get(drv)!
    return a.delta
  }
  let fed = 0, ca = 0, fedBalance = 0, caBalance = 0
  const parts: string[] = []
  // federal
  if (!isCa) {
    const c = a.fedCategory
    if (c === 'custom') fed = a.customFed || 0
    else if (c === 'payment') fedBalance = -a.delta
    else if (c === 'credit') fed = -a.delta
    else if (c !== 'none' && c !== 'ca_source_income' && rates[c]) {
      const d = atDriver(c)
      fed = d * rates[c].federal_per_dollar
      parts.push(`federal ${Math.round(d).toLocaleString()} × ${rates[c].federal_per_dollar} (${c})`)
    }
  }
  // california
  {
    const c = a.caCategory
    if (c === 'custom') ca = a.customCa || 0
    else if (c === 'payment') { if (isCa) caBalance = -a.delta }
    else if (c === 'credit') { if (isCa) ca = -a.delta }
    else if (c === 'ca_source_income') {
      ca = a.delta * rates.ca_source_income.california_per_dollar
      parts.push(`California-source ${Math.round(a.delta).toLocaleString()} × ${rates.ca_source_income.california_per_dollar}`)
    } else if (c !== 'none' && rates[c]) {
      const d = atDriver(c)
      ca = d * rates[c].california_per_dollar
      parts.push(`California ${Math.round(d).toLocaleString()} × ${rates[c].california_per_dollar} (${c})`)
    }
  }
  if (a.fedCategory === 'custom' || a.caCategory === 'custom') parts.push(a.whatIf ? `engine what-if “${a.whatIf}”` : 'effect entered by hand')
  return { fed: Math.round(fed), ca: Math.round(ca), fedBalance: Math.round(fedBalance), caBalance: Math.round(caBalance), detail: parts.join('; ') }
}

export function isActive(a: Adjustment): boolean {
  return a.status === 'active' && !a.rejected
}

export function computeEffective(ix: Index, vix: VersionIndex, s: State, opts: { upToSeq?: number; include?: (a: Adjustment) => boolean } = {}): Effective {
  const lines = new Map<string, LineEff>()
  for (const l of vix.v.lines) lines.set(l.key, { key: l.key, base: l.value, value: l.value, delta: 0, adjIds: [], via: [], stale: false })
  const effects = new Map<string, Effect>()
  const total: Effect = { fed: 0, ca: 0, fedBalance: 0, caBalance: 0, detail: '' }
  const active = [...s.adjustments.values()].filter(a => isActive(a) && (!opts.include || opts.include(a)))
  for (const a of active) {
    if (!lines.has(a.lineKey)) {
      lines.set(a.lineKey, { key: a.lineKey, base: 0, value: 0, delta: 0, adjIds: [], via: [], stale: false })
    }
    lines.get(a.lineKey)!.adjIds.push(a.id)
    const { deltas, stale } = propagate(vix, a.lineKey, a.delta)
    for (const [k, d] of deltas) {
      const le = lines.get(k)
      if (!le || typeof le.base !== 'number') continue
      le.delta += d
      le.value = le.base + le.delta
      if (k !== a.lineKey) le.via.push(a.id)
    }
    for (const k of stale) { const le = lines.get(k); if (le) le.stale = true }
    const e = adjustmentEffect(vix, a)
    effects.set(a.id, e)
    total.fed += e.fed; total.ca += e.ca; total.fedBalance += e.fedBalance; total.caBalance += e.caBalance
  }
  const sf = vix.v.summary.federal, sc = vix.v.summary.california
  const fedAgiDelta = lines.get('F1040.11')?.delta || 0
  const caAgiDelta = lines.get('F540NR.32')?.delta || 0
  const summary = {
    federal: {
      ...sf,
      agi: sf.agi + fedAgiDelta,
      taxable_income: sf.taxable_income + (lines.get('F1040.15')?.delta || 0),
      total_tax: sf.total_tax + total.fed,
      payments: sf.payments - total.fedBalance,
      balance_due: sf.balance_due + total.fed + total.fedBalance,
    },
    california: {
      ...sc,
      total_agi: sc.total_agi + (lines.get('F540NR.17')?.delta || 0),
      ca_agi: sc.ca_agi + caAgiDelta,
      total_tax: sc.total_tax + total.ca,
      payments: sc.payments - total.caBalance,
      balance_due: sc.balance_due + total.ca + total.caBalance,
    },
  }
  return { version: vix, lines, effects, total, summary, activeAdjustments: active }
}

// Effective value of any line, accounting for corrections to extracted values that feed it is
// out of scope: corrections are recorded on the extracted value and surfaced as findings.
export function lineValue(eff: Effective, key: string): any {
  return eff.lines.get(key)?.value
}
