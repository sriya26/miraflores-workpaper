import { test, expect } from 'vitest'
import fs from 'fs'
import { buildIndex, versionAt } from '../src/packet'
import { reduce } from '../src/model'
import { computeEffective } from '../src/effective'
import { runChecks } from '../src/checks'

const packet = JSON.parse(fs.readFileSync('public/packet.json', 'utf8'))
const ix = buildIndex(packet)
const clock = '2026-07-05T00:00:00Z'

test('checks find the errors and fixes turn them green', () => {
  let s = reduce(ix, [])
  const vix = versionAt(ix, clock)
  let eff = computeEffective(ix, vix, s)
  const res = runChecks(ix, s, eff, clock)
  for (const r of res) console.log(r.status.padEnd(8), r.id.padEnd(24), r.title, r.suggestions.length ? `[${r.suggestions.length} fix]` : '')
  // apply all suggestions, twice: some limits (SEP) move only after other fixes land
  const evs: any[] = []
  let i = 0
  for (let pass = 0; pass < 2; pass++) for (const r of (pass === 0 ? res : runChecks(ix, (s = reduce(ix, evs)), (eff = computeEffective(ix, vix, s)), clock))) if (r.status !== 'pass') for (const sg of r.suggestions) {
    const base = eff.lines.get(sg.lineKey)?.value ?? 0
    const delta = sg.delta ?? (sg.newValue! - base)
    evs.push({ id: 'e' + i++, type: 'adjust', actor: 'st-01', at: '2026-07-05T00:00:' + String(i).padStart(2, '0') + 'Z', seasonAt: clock, payload: { id: 'adj' + i, lineKey: sg.lineKey, baseVersion: 'v3', original: base, delta, fedCategory: sg.fedCategory, caCategory: sg.caCategory ?? sg.fedCategory, customFed: sg.customFed, customCa: sg.customCa, whatIf: sg.whatIf, reason: sg.reason, evidence: sg.evidence, checkId: r.id } })
  }
  s = reduce(ix, evs)
  eff = computeEffective(ix, vix, s)
  for (const a of eff.activeAdjustments) { const e = eff.effects.get(a.id)!; console.log(a.lineKey.padEnd(18), String(Math.round(a.delta)).padStart(8), 'fed', String(e.fed).padStart(7), 'ca', String(e.ca).padStart(6), 'bal', e.fedBalance, e.caBalance, '|', e.detail) }
  console.log('TOTAL', eff.total, eff.summary)
  // the return's own lines agree with the bottom line
  expect(eff.lines.get('F1040.37')!.value).toBeCloseTo(eff.summary.federal.balance_due, 0)
  expect(eff.lines.get('F540NR.97')!.value).toBeCloseTo(-eff.summary.california.balance_due, 0)
  const res2 = runChecks(ix, s, eff, clock)
  for (const r of res2) if (r.status === 'fail') console.log('STILL FAIL', r.id, r.expected, r.actual)
  expect(res2.filter(r => r.status === 'fail' && r.suggestions.length).length).toBe(0)
})
