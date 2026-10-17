// One resolver for every kind of reference in the packet and the workpaper. Anything that can be
// cited (a value on a page, a client answer, a prior-year line, an agency record, a note, an
// attachment) is a string ref, so evidence can point at anything and anything can be linked.

import type { Index } from './packet'
import { jsonPointer } from './packet'
import type { State } from './model'
import { val } from './format'

export interface RefInfo {
  ref: string
  kind: 'value' | 'document' | 'page' | 'line' | 'answer' | 'message' | 'call' | 'prior' | 'agency' | 'asset' | 'person' | 'param' | 'timeline' | 'note' | 'attachment' | 'adjustment' | 'decision' | 'check' | 'unknown'
  label: string
  sub?: string
  value?: any
  docId?: string
  page?: number
  evId?: string
}

export function resolve(ix: Index, ref: string, s?: State, versionLines?: Map<string, any>): RefInfo {
  if (/^ev-\d+$/.test(ref)) {
    const e = ix.evs.get(ref)
    if (!e) return { ref, kind: 'unknown', label: ref }
    const d = ix.docs.get(e.document_id)
    return { ref, kind: 'value', label: e.label, sub: `${e.document_id} p.${e.page} · ${d?.issuer || ''}`, value: s?.corrections.get(ref)?.value ?? e.value, docId: e.document_id, page: e.page, evId: ref }
  }
  if (/^D\d\d$/.test(ref)) {
    const d = ix.docs.get(ref)
    return { ref, kind: 'document', label: d ? d.title : ref, sub: d ? `${d.id} · ${d.page_count} p.` : '', docId: ref }
  }
  let m = ref.match(/^doc:(D\d\d)#page(\d+)$/)
  if (m) {
    const d = ix.docs.get(m[1])
    return { ref, kind: 'page', label: `${d?.title || m[1]} — page ${m[2]}`, sub: 'page not extracted by the pipeline', docId: m[1], page: +m[2] }
  }
  if (/^qa-\d+$/.test(ref)) {
    const q = ix.qa.get(ref)
    return { ref, kind: 'answer', label: q ? q.question : ref, sub: q ? `“${q.answer}” — ${q.answered_by}` : '', value: q?.answer }
  }
  if (/^msg-\d+$/.test(ref)) {
    const q = ix.msgs.get(ref)
    return { ref, kind: 'message', label: q ? `Message from ${q.from}` : ref, sub: q?.text, value: q?.text }
  }
  if (/^call-\d+$/.test(ref)) {
    const c = ix.calls.get(ref)
    return { ref, kind: 'call', label: c ? `Call notes ${c.date.slice(0, 10)}` : ref, sub: c?.participants?.join(', ') }
  }
  if (ref.startsWith('py:')) {
    const v = jsonPointer(ix.p.prior_years, ref.slice(3))
    return { ref, kind: 'prior', label: 'Prior year · ' + ref.slice(4).replace(/\//g, ' › '), sub: typeof v === 'object' ? undefined : val(v), value: v }
  }
  if (ref.startsWith('agency:')) {
    const v = jsonPointer(ix.p.tax_agency_records, ref.slice(7))
    return { ref, kind: 'agency', label: 'Agency record · ' + ref.slice(8).replace(/\//g, ' › '), value: v }
  }
  if (ref.startsWith('asset:')) {
    const id = ref.slice(6)
    const a = ix.p.prior_years.asset_records.find((x: any) => x.asset_id === id) || ix.versions.get('v3')!.v.assets.find((x: any) => x.asset_id === id)
    return { ref, kind: 'asset', label: a ? a.description : id, sub: a ? `cost ${val(a.cost)} · ${a.method}` : '' }
  }
  if (ref.startsWith('household:')) {
    const id = ref.slice(10).split('.')[0]
    const p = ix.people.get(id)
    return { ref, kind: 'person', label: p ? p.name : id, sub: p ? `${p.role}${p.relationship ? ' · ' + p.relationship : ''}` : '' }
  }
  if (ref.startsWith('ref:')) {
    const path = ref.slice(4)
    let v: any
    if (path.startsWith('param.')) v = ix.p.engine_reference.parameters[path.slice(6)]
    else if (path.startsWith('fx.')) { const [, cur, rate] = path.split('.'); v = ix.p.engine_reference.parameters.fx?.[cur]?.[rate] }
    return { ref, kind: 'param', label: 'Engine parameter · ' + path, sub: typeof v === 'object' ? 'table' : val(v), value: v }
  }
  if (ref.startsWith('timeline:')) {
    const t = ix.timeline.get(ref.slice(9))
    return { ref, kind: 'timeline', label: t ? t.event.replace(/_/g, ' ') : ref, sub: t ? `${t.at.slice(0, 10)}${t.detail ? ' · ' + t.detail : ''}` : '' }
  }
  if (s) {
    if (s.notes.has(ref)) { const n = s.notes.get(ref)!; return { ref, kind: 'note', label: n.subject, sub: n.body } }
    if (s.attachments.has(ref)) { const a = s.attachments.get(ref)!; return { ref, kind: 'attachment', label: a.name, sub: `${Math.round(a.size / 1024)} KB` } }
    if (s.adjustments.has(ref)) { const a = s.adjustments.get(ref)!; return { ref, kind: 'adjustment', label: `Adjustment ${a.lineKey}`, sub: a.reason } }
    if (s.decisions.has(ref)) { const d = s.decisions.get(ref)!; return { ref, kind: 'decision', label: d.topic, sub: d.conclusion } }
  }
  if (ref.startsWith('chk:')) return { ref, kind: 'check', label: 'Check ' + ref.slice(4) }
  if (/^[A-Za-z0-9-]+\.[\w.\-/]+$/.test(ref)) {
    const l = versionLines?.get(ref) || ix.versions.get('v3')!.lines.get(ref)
    return { ref, kind: 'line', label: l ? l.label : ref, sub: ref, value: l?.value }
  }
  return { ref, kind: 'unknown', label: ref }
}

export const KIND_ICON: Record<string, string> = {
  value: '◉', document: '▤', page: '▢', line: '∑', answer: '?', message: '✉', call: '☏', prior: '↶',
  agency: '⚑', asset: '▣', person: '☺', param: '⚙', timeline: '◷', note: '✎', attachment: '⎘', adjustment: 'Δ', decision: '⚖', check: '✓', unknown: '·',
}

// Sensitive data masking (firm rule: SSNs, bank and account numbers and IP PINs).
export function maskText(text: string, ix: Index): string {
  let t = text.replace(/\b(\d{3})-(\d{2})-(\d{4})\b/g, '•••-••-$3')
  const h = ix.p.household
  const secrets = [
    ...h.people.map((p: any) => p.ip_pin).filter(Boolean),
    h.bank_account_for_refund_or_payment.account,
    h.bank_account_for_refund_or_payment.routing,
  ]
  for (const sct of secrets) t = t.split(sct).join('••••' + String(sct).slice(-2))
  t = t.replace(/SE\d{2}( \d{4}){5}/g, m => 'SE•• •••• •••• •••• •••• ' + m.slice(-4))
  return t
}

export function isSensitiveType(t: string) {
  return t === 'ssn' || t === 'account_number'
}
