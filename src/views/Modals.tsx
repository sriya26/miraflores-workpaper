import React, { useMemo, useState } from 'react'
import { useCtx } from '../ctx'
import { Modal, Field, Ref, Badge } from '../ui'
import { CATEGORIES, defaultCategory, areaOfLine } from '../areas'
import { adjustmentEffect } from '../effective'
import { money, signed, uid } from '../format'
import type { Adjustment } from '../model'
import type { Suggestion } from '../checks'

export function useAdjust() {
  const ctx = useCtx()
  // Turns suggestions into adjustment events as one batch, with undo.
  return (sugs: (Suggestion & { checkId?: string })[], label = 'Adjustment') => {
    if (ctx.frozen && !ctx.s.filing.amendments.length) {
      ctx.toast({ text: 'The return is frozen at filing. Start an amendment on the Filing page first.', kind: 'error' })
      return
    }
    const batch = uid('b')
    const list = sugs.map(sg => {
      const base = ctx.eff.lines.get(sg.lineKey)
      const cur = typeof base?.value === 'number' ? base.value : 0
      const delta = sg.delta ?? (sg.newValue! - cur)
      return {
        type: 'adjust',
        payload: {
          id: uid('adj'), lineKey: sg.lineKey, baseVersion: ctx.vix.v.version, original: typeof base?.base === 'number' ? base.base : 0, delta,
          fedCategory: sg.fedCategory, caCategory: sg.caCategory ?? sg.fedCategory, customFed: sg.customFed, customCa: sg.customCa, whatIf: sg.whatIf,
          reason: sg.reason, evidence: sg.evidence, checkId: sg.checkId,
        },
      }
    }).filter(x => Math.abs(x.payload.delta) > 0.004)
    if (!list.length) { ctx.toast({ text: 'Nothing to change — already at the expected value.' }); return }
    const evs = ctx.emitMany(list, { action: 'adjust', batch })
    if (evs.length) ctx.toast({
      text: `${label}: ${evs.length} change${evs.length > 1 ? 's' : ''} recorded.`, kind: 'ok',
      undo: () => ctx.emitMany(evs.map(e => ({ type: 'adjust.revert', payload: { id: e.payload.id, reason: 'Undo' } })), { action: 'adjust' }),
    })
  }
}

export function AdjustModal({ lineKey, onClose, preset }: { lineKey: string; onClose: () => void; preset?: Partial<Suggestion> }) {
  const ctx = useCtx()
  const le = ctx.eff.lines.get(lineKey)
  const line = ctx.vix.lines.get(lineKey)
  const cur = typeof le?.value === 'number' ? le.value : 0
  const [mode, setMode] = useState<'value' | 'delta'>(preset?.delta != null ? 'delta' : 'value')
  const [amount, setAmount] = useState<string>(preset?.newValue != null ? String(preset.newValue) : preset?.delta != null ? String(preset.delta) : String(cur))
  const isCa = line?.jurisdiction === 'california'
  const dc = (preset?.fedCategory as any) || defaultCategory(lineKey)
  const [fedCat, setFedCat] = useState<string>(isCa ? 'none' : dc)
  const [caCat, setCaCat] = useState<string>((preset?.caCategory as any) || dc)
  const [customFed, setCustomFed] = useState<string>(String(preset?.customFed ?? ''))
  const [customCa, setCustomCa] = useState<string>(String(preset?.customCa ?? ''))
  const [reason, setReason] = useState(preset?.reason || '')
  const [evidence, setEvidence] = useState<string[]>(preset?.evidence || line?.sources || [])
  const [evIn, setEvIn] = useState('')
  const adjust = useAdjust()
  const delta = mode === 'value' ? (parseFloat(amount.replace(/,/g, '')) || 0) - cur : parseFloat(amount.replace(/,/g, '')) || 0
  const temp: Adjustment = {
    id: 'tmp', lineKey, baseVersion: ctx.vix.v.version, original: cur, delta, fedCategory: fedCat as any, caCategory: caCat as any,
    customFed: parseFloat(customFed) || 0, customCa: parseFloat(customCa) || 0, reason, evidence, by: ctx.user.id, at: '', status: 'active', approvals: [],
  }
  const eff = useMemo(() => adjustmentEffect(ctx.vix, temp), [delta, fedCat, caCat, customFed, customCa])
  const needsPartner = Math.abs(eff.fed) > 1000 || Math.abs(eff.ca) > 1000
  const missing = Math.abs(delta) <= 0.004 ? 'Enter a change to record.' : reason.trim().length < 3 ? 'Write why (required) to record.' : ''
  const ok = !missing
  const submit = () => {
    adjust([{ lineKey, delta, fedCategory: fedCat, caCategory: caCat, customFed: temp.customFed, customCa: temp.customCa, whatIf: preset?.whatIf, reason, evidence }], `Adjusted ${lineKey}`)
    onClose()
  }
  return (
    <Modal title={<>Adjust <span className="mono">{lineKey}</span></>} onClose={onClose}
      foot={<><span className="small muted grow">{missing || 'The original stays: this records who, why and the tax effect.'}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ok} onClick={submit}>Record adjustment</button></>}>
      <div className="small ink2 mb12">{line?.label}</div>
      <div className="row gap12 mb12">
        <div className="stat"><div className="lbl">Engine {ctx.vix.v.version}</div><div className="big">{money(le?.base)}</div></div>
        {le && le.delta !== 0 && <div className="stat"><div className="lbl">Workpaper now</div><div className="big">{money(cur)}</div></div>}
        <div className="stat"><div className="lbl">After this change</div><div className="big">{money(cur + delta)}</div></div>
      </div>
      <div className="row gap12">
        <Field label="Change by">
          <div className="pill-toggle"><button className={mode === 'value' ? 'on' : ''} onClick={() => { setMode('value'); setAmount(String(cur + delta)) }}>New value</button><button className={mode === 'delta' ? 'on' : ''} onClick={() => { setMode('delta'); setAmount(String(delta)) }}>Amount (±)</button></div>
        </Field>
        <Field label={mode === 'value' ? 'New value' : 'Change (±)'}><input value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 160 }} className="num" /></Field>
        <div className="small muted">Δ {signed(delta)}</div>
      </div>
      <div className="row gap12">
        {!isCa && <Field label="Federal tax effect category"><select value={fedCat} onChange={e => setFedCat(e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
        <Field label="California category"><select value={caCat} onChange={e => setCaCat(e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      </div>
      {(fedCat === 'custom' || caCat === 'custom') && (
        <div className="row gap12">
          {fedCat === 'custom' && <Field label="Federal tax change (manual or engine what-if)"><input value={customFed} onChange={e => setCustomFed(e.target.value)} /></Field>}
          {caCat === 'custom' && <Field label="California tax change"><input value={customCa} onChange={e => setCustomCa(e.target.value)} /></Field>}
        </div>
      )}
      <div className="callout mb12">
        <div className="row"><b>Tax effect</b><span className="spacer" />federal <b className="num">{signed(eff.fed + eff.fedBalance)}</b> · California <b className="num">{signed(eff.ca + eff.caBalance)}</b></div>
        <div className="tiny muted mt8">{eff.detail || 'No rate applies.'} Rates are measured at {ctx.vix.v.version}; large changes can cross thresholds - the engine recomputes on the next run.</div>
        {needsPartner && <div className="mt8"><Badge tone="warn">Needs partner sign-off</Badge> <span className="tiny">firm rule: tax effect over 1,000</span></div>}
      </div>
      <Field label="Why (required)"><textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="What is wrong, what the source says, and the authority if it's a judgment." /></Field>
      <Field label="Evidence" hint="Any reference: ev-0123, D47, qa-25, msg-07, py:/…, agency:/…, or an attachment id.">
        <div className="row wrap gap4">{evidence.map(r => <span key={r} className="row gap4"><Ref r={r} /><button className="icon-btn tiny" onClick={() => setEvidence(evidence.filter(x => x !== r))}>✕</button></span>)}</div>
        <div className="row mt8"><input value={evIn} onChange={e => setEvIn(e.target.value)} placeholder="Add a reference" className="grow" onKeyDown={e => { if (e.key === 'Enter' && evIn.trim()) { setEvidence([...evidence, evIn.trim()]); setEvIn('') } }} /><button className="btn sm" onClick={() => { if (evIn.trim()) { setEvidence([...evidence, evIn.trim()]); setEvIn('') } }}>Add</button></div>
      </Field>
      <div className="tiny muted">Area: {areaOfLine(lineKey)} · base version {ctx.vix.v.version}{ctx.frozen ? ` · amendment ${ctx.s.filing.amendments.length}` : ''}</div>
    </Modal>
  )
}

export function NoteModal({ onClose, preset }: { onClose: () => void; preset?: { kind?: string; refs?: string[]; subject?: string; body?: string; to?: string; blocking?: boolean } }) {
  const ctx = useCtx()
  const [kind, setKind] = useState(preset?.kind || 'review')
  const [to, setTo] = useState(preset?.to || (kind === 'client_question' ? 'client' : 'st-01'))
  const [subject, setSubject] = useState(preset?.subject || '')
  const [body, setBody] = useState(preset?.body || '')
  const [blocking, setBlocking] = useState(preset?.blocking ?? kind === 'review')
  const [due, setDue] = useState('')
  const refs = preset?.refs || []
  const submit = () => {
    const action = kind === 'client_question' ? 'question_client' : 'note'
    const e = ctx.emit('note.create', { id: uid('note'), kind, to, subject, body, refs, blocking: kind === 'review' ? blocking : false, due: due || undefined }, { action })
    if (e) ctx.toast({ text: kind === 'client_question' ? 'Question sent to the client portal.' : 'Note created.', kind: 'ok' })
    onClose()
  }
  const staff = ctx.users.filter(u => !['client', 'examiner'].includes(u.role))
  return (
    <Modal title="New note or question" onClose={onClose} foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!subject.trim()} onClick={submit}>Send</button></>}>
      <Field label="Type">
        <div className="pill-toggle">
          {[['review', 'Review note'], ['question', 'Question to colleague'], ['client_question', 'Question to client'], ['variance', 'Variance explanation'], ['comment', 'Comment']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); if (k === 'client_question') setTo('client'); else if (to === 'client') setTo('st-01'); setBlocking(k === 'review') }}>{l}</button>)}
        </div>
      </Field>
      {kind !== 'client_question' && kind !== 'variance' && kind !== 'comment' && (
        <Field label="To"><select value={to} onChange={e => setTo(e.target.value)}>{staff.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, ' ')}</option>)}</select></Field>
      )}
      <Field label="Subject"><input value={subject} onChange={e => setSubject(e.target.value)} /></Field>
      <Field label="Details"><textarea value={body} onChange={e => setBody(e.target.value)} /></Field>
      {refs.length > 0 && <Field label="About"><div className="row wrap gap4">{refs.map(r => <Ref key={r} r={r} />)}</div></Field>}
      <div className="row gap12">
        {kind === 'review' && <label className="row small"><input type="checkbox" checked={blocking} onChange={e => setBlocking(e.target.checked)} /> Blocks filing until resolved</label>}
        <Field label="Due (optional)"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      </div>
      {kind === 'client_question' && <div className="callout info small">The client sees this in their portal. Their answer and any upload become evidence you can cite.</div>}
    </Modal>
  )
}

export function DecisionModal({ onClose, preset }: { onClose: () => void; preset?: { kind?: string; topic?: string; conclusion?: string; authority?: string; refs?: string[]; checkId?: string } }) {
  const ctx = useCtx()
  const [kind, setKind] = useState(preset?.kind || 'judgment')
  const [topic, setTopic] = useState(preset?.topic || '')
  const [conclusion, setConclusion] = useState(preset?.conclusion || '')
  const [authority, setAuthority] = useState(preset?.authority || '')
  const refs = preset?.refs || []
  const ok = topic.trim() && conclusion.trim() && authority.trim()
  const submit = () => {
    const e = ctx.emit('decision', { id: uid('dec'), kind, topic, conclusion, authority, refs, checkId: preset?.checkId }, { action: 'decide' })
    if (e) {
      if (preset?.checkId) ctx.emit('finding.status', { checkId: preset.checkId, status: 'resolved', note: conclusion })
      ctx.toast({ text: 'Decision recorded.', kind: 'ok' })
    }
    onClose()
  }
  return (
    <Modal title="Record a judgment call" onClose={onClose} foot={<><span className="small muted grow">Firm rule: every judgment call records the authority relied on.</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ok} onClick={submit}>Record</button></>}>
      <Field label="Kind">
        <div className="pill-toggle">{[['judgment', 'Judgment'], ['election', 'Election'], ['due_diligence', 'Due diligence'], ['penalty', 'Penalty'], ['scope', 'Scope / outside filing']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      </Field>
      <Field label="Topic"><input value={topic} onChange={e => setTopic(e.target.value)} /></Field>
      <Field label="Conclusion and reasoning"><textarea value={conclusion} onChange={e => setConclusion(e.target.value)} style={{ minHeight: 100 }} /></Field>
      <Field label="Authority relied on (required)"><input value={authority} onChange={e => setAuthority(e.target.value)} placeholder="e.g. Reg. 1.263(a)-3(k); IRC 162(l)(2)(B); Form 8867 instructions" /></Field>
      {refs.length > 0 && <Field label="Evidence"><div className="row wrap gap4">{refs.map(r => <Ref key={r} r={r} />)}</div></Field>}
    </Modal>
  )
}

export function readFileAsAttachment(file: File): Promise<{ name: string; mime: string; size: number; dataUrl?: string; text?: string }> {
  return new Promise(resolve => {
    const r = new FileReader()
    const isText = /^text\/|json|csv/.test(file.type)
    r.onload = () => {
      const res = r.result as string
      if (isText) resolve({ name: file.name, mime: file.type || 'text/plain', size: file.size, text: res.slice(0, 200000) })
      else resolve({ name: file.name, mime: file.type, size: file.size, dataUrl: file.size < 1_500_000 ? res : undefined })
    }
    if (isText) r.readAsText(file)
    else r.readAsDataURL(file)
  })
}

export function AttachButton({ refs, label = 'Attach evidence', onDone }: { refs: string[]; label?: string; onDone?: (id: string) => void }) {
  const ctx = useCtx()
  const [noteOpen, setNoteOpen] = useState(false)
  const [text, setText] = useState('')
  return (
    <>
      <label className="btn sm" style={{ cursor: 'pointer' }}>
        ⎘ {label}
        <input type="file" style={{ display: 'none' }} onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          const a = await readFileAsAttachment(f)
          const id = uid('att')
          const ev = ctx.emit('attach', { id, ...a, refs }, { action: 'attach' })
          if (ev) { ctx.toast({ text: `Attached ${a.name}${a.dataUrl || a.text ? '' : ' (metadata only — file over 1.5 MB)'}`, kind: 'ok' }); onDone?.(id) }
          e.target.value = ''
        }} />
      </label>
      <button className="btn sm" onClick={() => setNoteOpen(true)}>✎ Add note as evidence</button>
      {noteOpen && (
        <Modal title="Note as evidence" onClose={() => setNoteOpen(false)} foot={<button className="btn primary" disabled={!text.trim()} onClick={() => {
          const id = uid('att')
          ctx.emit('attach', { id, name: `Note — ${text.slice(0, 40)}`, mime: 'text/plain', size: text.length, text, refs }, { action: 'attach' })
          onDone?.(id); setNoteOpen(false)
        }}>Save</button>}>
          <Field label="Text (memo of a call, email, observation)"><textarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 140 }} /></Field>
        </Modal>
      )}
    </>
  )
}
