// The workpaper's own data model: an append-only event log of human acts, and the state
// derived from it. Nothing is ever overwritten - an adjustment is reverted by a later event,
// a sign-off is revoked by a later event, and a filed return is a frozen sequence number.

import type { Index } from './packet'

export type RoleId =
  | 'preparer' | 'reviewer' | 'partner' | 'firm_administrator' | 'quality_reviewer' | 'client' | 'examiner'

export interface User {
  id: string
  name: string
  role: RoleId
  credential?: string | null
  clearance: boolean
  note?: string
  activeFrom?: string // staff start date; before it the user has no access
}

export interface WPEvent {
  id: string
  seq?: number
  type: string
  actor: string
  at: string // real wall-clock time
  seasonAt: string // the replay clock when the act happened
  batch?: string
  payload: any
}

export type VerificationType =
  | 'agreed_to_source_document' | 'recalculated' | 'confirmed_with_client' | 'agreed_to_prior_year'
  | 'agreed_to_third_party_record' | string

export interface Verification {
  ref: string
  type: VerificationType
  note: string
  evidence: string[]
  by: string
  at: string
  eventId: string
  value?: any // value at time of verification - if the value later changes, the verification is stale
}

export type Category =
  | 'wages' | 'interest' | 'schc_profit' | 'stcg' | 'ltcg' | 'ordinary_income' | 'adjustment' | 'salt'
  | 'itemized' | 'ca_source_income' | 'credit' | 'payment' | 'none' | 'custom'

export interface Adjustment {
  id: string
  lineKey: string
  baseVersion: string
  original: number
  delta: number
  fedCategory: Category
  caCategory: Category
  customFed?: number
  customCa?: number
  reason: string
  evidence: string[]
  checkId?: string
  whatIf?: string
  by: string
  at: string
  batch?: string
  status: 'active' | 'reverted'
  approvals: { by: string; at: string; level: string }[]
  rejected?: { by: string; at: string; reason: string }
  revertedBy?: { by: string; at: string; reason: string }
  amendment?: number // set when made after the return was frozen
}

export interface Note {
  id: string
  kind: 'review' | 'question' | 'comment' | 'variance' | 'client_question'
  to?: string // user id or 'client'
  subject: string
  body: string
  refs: string[]
  blocking: boolean
  by: string
  at: string
  due?: string
  replies: { id: string; by: string; at: string; body: string; attachments: string[] }[]
  status: 'open' | 'answered' | 'resolved'
  resolvedBy?: { by: string; at: string; note: string }
}

export interface Decision {
  id: string
  kind: 'judgment' | 'election' | 'due_diligence' | 'penalty' | 'disposition' | 'scope'
  topic: string
  conclusion: string
  authority: string
  refs: string[]
  by: string
  at: string
  checkId?: string
  superseded?: boolean
}

export interface Signoff {
  id: string
  area: string
  level: 'preparer' | 'reviewer' | 'partner'
  by: string
  at: string
  fingerprint: string
  snapshot: Record<string, any>
  revoked?: { by: string; at: string; reason: string }
}

export interface Attachment {
  id: string
  name: string
  mime: string
  size: number
  dataUrl?: string
  text?: string
  refs: string[]
  by: string
  at: string
}

export interface State {
  events: WPEvent[]
  verifications: Map<string, Verification>
  verificationHistory: Verification[]
  adjustments: Map<string, Adjustment>
  notes: Map<string, Note>
  decisions: Map<string, Decision>
  signoffs: Signoff[]
  attachments: Map<string, Attachment>
  links: { id: string; from: string; to: string; why: string; by: string; at: string }[]
  dispositions: Map<string, { status: string; reason: string; by: string; at: string }>
  findingStatus: Map<string, { status: 'open' | 'accepted' | 'resolved' | 'not_applicable'; note: string; by: string; at: string }>
  corrections: Map<string, { ref: string; value: any; reason: string; by: string; at: string }>
  time: { id: string; by: string; area: string; hours: number; note: string; at: string }[]
  assignments: Map<string, { preparer?: string; reviewer?: string; due?: string }>
  standards: any
  accessLog: { by: string; ref: string; what: string; at: string }[]
  steps: Map<string, { done: boolean; by: string; at: string; note: string }>
  seen: Map<string, string> // user -> ISO time last looked
  filing: {
    extension?: any
    approval?: { by: string; at: string; fingerprint: string; pins?: any }
    submissions: { id: string; at: string; seasonAt: string; jurisdiction: string; status: string; errors: any[]; by: string }[]
    frozen?: { at: string; seasonAt: string; seq: number; by: string; snapshot: any }
    amendments: { n: number; at: string; by: string; reason: string }[]
    payments: { at: string; seasonAt: string; jurisdiction: string; amount: number; kind: string; by: string }[]
  }
  rollforward?: { at: string; by: string }
}

export function emptyState(ix: Index): State {
  return {
    events: [],
    verifications: new Map(),
    verificationHistory: [],
    adjustments: new Map(),
    notes: new Map(),
    decisions: new Map(),
    signoffs: [],
    attachments: new Map(),
    links: [],
    dispositions: new Map(),
    findingStatus: new Map(),
    corrections: new Map(),
    time: [],
    assignments: new Map(),
    standards: JSON.parse(JSON.stringify(ix.p.firm.starter_standards)),
    accessLog: [],
    steps: new Map(),
    seen: new Map(),
    filing: { submissions: [], amendments: [], payments: [] },
  }
}

export function reduce(ix: Index, events: WPEvent[]): State {
  const s = emptyState(ix)
  s.events = events
  for (const e of events) apply(s, e)
  return s
}

function apply(s: State, e: WPEvent) {
  const p = e.payload || {}
  const amendment = s.filing.frozen ? s.filing.amendments.length || undefined : undefined
  switch (e.type) {
    case 'verify': {
      const v: Verification = { ref: p.ref, type: p.type, note: p.note || '', evidence: p.evidence || [], by: e.actor, at: e.at, eventId: e.id, value: p.value }
      s.verifications.set(p.ref, v)
      s.verificationHistory.push(v)
      break
    }
    case 'unverify':
      s.verifications.delete(p.ref)
      break
    case 'adjust': {
      s.adjustments.set(p.id, {
        id: p.id, lineKey: p.lineKey, baseVersion: p.baseVersion, original: p.original, delta: p.delta,
        fedCategory: p.fedCategory, caCategory: p.caCategory ?? p.fedCategory, customFed: p.customFed, customCa: p.customCa,
        reason: p.reason, evidence: p.evidence || [], checkId: p.checkId, whatIf: p.whatIf,
        by: e.actor, at: e.at, batch: e.batch, status: 'active', approvals: [], amendment,
      })
      break
    }
    case 'adjust.revert': {
      const a = s.adjustments.get(p.id)
      if (a) { a.status = 'reverted'; a.revertedBy = { by: e.actor, at: e.at, reason: p.reason || '' } }
      break
    }
    case 'adjust.restore': {
      const a = s.adjustments.get(p.id)
      if (a) { a.status = 'active'; a.revertedBy = undefined }
      break
    }
    case 'adjust.approve': {
      const a = s.adjustments.get(p.id)
      if (a) { a.approvals.push({ by: e.actor, at: e.at, level: p.level }); a.rejected = undefined }
      break
    }
    case 'adjust.reject': {
      const a = s.adjustments.get(p.id)
      if (a) a.rejected = { by: e.actor, at: e.at, reason: p.reason || '' }
      break
    }
    case 'note.create':
      s.notes.set(p.id, {
        id: p.id, kind: p.kind, to: p.to, subject: p.subject, body: p.body, refs: p.refs || [], blocking: !!p.blocking,
        by: e.actor, at: e.at, due: p.due, replies: [], status: 'open',
      })
      break
    case 'note.reply': {
      const n = s.notes.get(p.noteId)
      if (n) {
        n.replies.push({ id: e.id, by: e.actor, at: e.at, body: p.body, attachments: p.attachments || [] })
        if (n.kind === 'client_question' || n.kind === 'question') { if (n.by !== e.actor) n.status = 'answered' }
      }
      break
    }
    case 'note.resolve': {
      const n = s.notes.get(p.noteId)
      if (n) { n.status = 'resolved'; n.resolvedBy = { by: e.actor, at: e.at, note: p.note || '' } }
      break
    }
    case 'note.reopen': {
      const n = s.notes.get(p.noteId)
      if (n) { n.status = 'open'; n.resolvedBy = undefined }
      break
    }
    case 'decision':
      if (p.supersedes) { const old = s.decisions.get(p.supersedes); if (old) old.superseded = true }
      s.decisions.set(p.id, { id: p.id, kind: p.kind, topic: p.topic, conclusion: p.conclusion, authority: p.authority || '', refs: p.refs || [], by: e.actor, at: e.at, checkId: p.checkId })
      break
    case 'signoff':
      s.signoffs.push({ id: e.id, area: p.area, level: p.level, by: e.actor, at: e.at, fingerprint: p.fingerprint, snapshot: p.snapshot || {} })
      break
    case 'signoff.revoke': {
      const so = s.signoffs.find(x => x.id === p.id)
      if (so) so.revoked = { by: e.actor, at: e.at, reason: p.reason || '' }
      break
    }
    case 'attach':
      s.attachments.set(p.id, { id: p.id, name: p.name, mime: p.mime, size: p.size, dataUrl: p.dataUrl, text: p.text, refs: p.refs || [], by: e.actor, at: e.at })
      break
    case 'link':
      s.links.push({ id: e.id, from: p.from, to: p.to, why: p.why || '', by: e.actor, at: e.at })
      break
    case 'disposition':
      s.dispositions.set(p.docId, { status: p.status, reason: p.reason, by: e.actor, at: e.at })
      break
    case 'finding.status':
      s.findingStatus.set(p.checkId, { status: p.status, note: p.note || '', by: e.actor, at: e.at })
      break
    case 'correct':
      s.corrections.set(p.ref, { ref: p.ref, value: p.value, reason: p.reason, by: e.actor, at: e.at })
      break
    case 'time':
      s.time.push({ id: e.id, by: e.actor, area: p.area, hours: p.hours, note: p.note || '', at: e.at })
      break
    case 'assign':
      s.assignments.set(p.area, { ...(s.assignments.get(p.area) || {}), ...p.assignment })
      break
    case 'standards.update':
      s.standards = p.standards
      break
    case 'access':
      s.accessLog.push({ by: e.actor, ref: p.ref, what: p.what, at: e.at })
      break
    case 'step':
      s.steps.set(p.step, { done: p.done, by: e.actor, at: e.at, note: p.note || '' })
      break
    case 'seen':
      s.seen.set(e.actor, p.at || e.at)
      break
    case 'filing.extension':
      s.filing.extension = { ...p, by: e.actor, at: e.at, seasonAt: e.seasonAt }
      break
    case 'filing.approve':
      s.filing.approval = { by: e.actor, at: e.at, fingerprint: p.fingerprint, pins: p.pins }
      break
    case 'filing.approval.void':
      s.filing.approval = undefined
      break
    case 'filing.submit':
      s.filing.submissions.push({ id: p.id, at: e.at, seasonAt: e.seasonAt, jurisdiction: p.jurisdiction, status: p.status, errors: p.errors || [], by: e.actor })
      break
    case 'filing.freeze':
      s.filing.frozen = { at: e.at, seasonAt: e.seasonAt, seq: s.events.indexOf(e), by: e.actor, snapshot: p.snapshot }
      break
    case 'filing.amend':
      s.filing.amendments.push({ n: s.filing.amendments.length + 1, at: e.at, by: e.actor, reason: p.reason })
      break
    case 'filing.payment':
      s.filing.payments.push({ at: e.at, seasonAt: e.seasonAt, jurisdiction: p.jurisdiction, amount: p.amount, kind: p.kind, by: e.actor })
      break
    case 'rollforward':
      s.rollforward = { at: e.at, by: e.actor }
      break
  }
}

export function usersFrom(ix: Index): User[] {
  const staff: User[] = ix.p.firm.staff.map((s: any) => ({
    id: s.id, name: s.name, role: s.role as RoleId, credential: s.credential, clearance: !!s.sensitive_data_clearance, note: s.note, activeFrom: s.active_from,
  }))
  const clients: User[] = ix.p.firm.client_users.map((c: any) => ({ id: c.id, name: c.name, role: 'client' as RoleId, clearance: true }))
  return [...staff, ...clients, { id: 'irs-01', name: 'IRS examiner (Letter 566)', role: 'examiner', clearance: false, note: 'Read-only access to the filed record.' }]
}

export const ROLE_LABEL: Record<RoleId, string> = {
  preparer: 'Preparer',
  reviewer: 'Reviewer',
  partner: 'Partner',
  firm_administrator: 'Firm administrator',
  quality_reviewer: 'Quality reviewer',
  client: 'Client',
  examiner: 'IRS examiner',
}

export function staffActive(u: User, clock?: string): boolean {
  return !u.activeFrom || !clock || clock.slice(0, 10) >= u.activeFrom
}

// Enforced permissions. Every write goes through `can` in the store, not just the UI.
// Staff who haven't started yet (at the season clock) can look but not act or reveal.
export function can(u: User, action: string, clock?: string): boolean {
  if (!staffActive(u, clock) && action !== 'view_internal') return false
  const r = u.role
  const staffWork = r === 'preparer' || r === 'reviewer' || r === 'partner'
  switch (action) {
    case 'verify': case 'adjust': case 'decide': case 'disposition': case 'correct': case 'link': return staffWork
    case 'approve_adjustment': return r === 'partner' || r === 'reviewer'
    case 'approve_adjustment_partner': return r === 'partner'
    case 'note': return staffWork || r === 'quality_reviewer'
    case 'question_client': return staffWork
    case 'reply': return r !== 'examiner'
    case 'resolve_note': return staffWork || r === 'quality_reviewer'
    case 'attach': return r !== 'examiner'
    case 'signoff.preparer': return r === 'preparer' || r === 'reviewer' || r === 'partner'
    case 'signoff.reviewer': return r === 'reviewer' || r === 'partner'
    case 'signoff.partner': return r === 'partner'
    case 'standards': return r === 'firm_administrator'
    case 'assign': return r === 'firm_administrator' || r === 'partner' || r === 'reviewer'
    case 'time': return staffWork || r === 'quality_reviewer'
    case 'extension': return staffWork
    case 'submit': return r === 'partner'
    case 'client_approve': return r === 'client'
    case 'amend': return r === 'partner' || r === 'reviewer' || r === 'preparer'
    case 'payment': return staffWork || r === 'client'
    case 'view_internal': return r !== 'client' && r !== 'examiner'
    case 'view_sensitive': return u.clearance && r !== 'examiner'
    case 'step': return staffWork
    case 'rollforward': return staffWork
    case 'replay': return r !== 'client' && r !== 'examiner'
    default: return false
  }
}
