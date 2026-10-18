import { test, expect } from 'vitest'
import fs from 'fs'
import { buildIndex, versionAt } from '../src/packet'
import { reduce } from '../src/model'
import { computeEffective } from '../src/effective'
import { runChecks } from '../src/checks'
import { buildProfile, documentAreas } from '../src/profile'

// The generic checks look things up by document type and field name. Renumber every extracted
// value id (as another client's packet would have) and they must reach the same conclusions.
const raw = fs.readFileSync('public/packet.json', 'utf8')
const renumbered = raw.replace(/"ev-(\d{4})"/g, (_, n) => `"ev-${String(9000 + +n).padStart(5, '0')}"`)
const clock = '2026-07-08T15:00:00Z'
const GENERIC = ['w2-sum', 'excess-ss', 'iso-amt', 'rsu-basis', 'interest-dup', 'fx-rate', 'fx-8938', 'gross-1099k', 'mileage-dup', 'vehicle-donation', 'dep-ssn-theo', 'dep-ssn-ada']

function run(json: string) {
  const ix = buildIndex(JSON.parse(json))
  const s = reduce(ix, [])
  const eff = computeEffective(ix, versionAt(ix, clock), s)
  return { ix, checks: runChecks(ix, s, eff, clock) }
}

test('generic checks do not depend on packet ids', () => {
  const a = run(raw), b = run(renumbered)
  expect(b.ix.evs.has('ev-0066')).toBe(false)
  for (const id of GENERIC) {
    const x = a.checks.find(c => c.id === id), y = b.checks.find(c => c.id === id)
    expect(y, id).toBeTruthy()
    expect([id, y!.status, y!.expected, y!.actual, y!.suggestions.map(s => [s.lineKey, s.newValue ?? s.delta])])
      .toEqual([id, x!.status, x!.expected, x!.actual, x!.suggestions.map(s => [s.lineKey, s.newValue ?? s.delta])])
  }
})

test('household profile and document areas come from the packet', () => {
  const ix = buildIndex(JSON.parse(raw))
  const p = buildProfile(ix)
  expect(p.names).toBe('Ngozi Okafor & Erik Lindqvist')
  expect(p.filingStatus).toBe('Married filing jointly')
  expect(p.moves).toEqual([{ from: 'California', to: 'Texas', date: '2025-07-15' }])
  expect(p.dependents.map(d => [d.first, d.age])).toEqual([['Ada', 19], ['Theo', 8]])
  const areas = documentAreas(ix)
  expect(areas.get('D08')).toBe('wages')     // W-2
  expect(areas.get('D21')).toBe('business')  // 1099-K
  expect(areas.get('D46')).toBe('rentals')   // owner statement
  expect(areas.get('D39')).toBe('passthrough')
})
