import React, { useState } from 'react'
import { useCtx } from '../ctx'
import { Badge, Tabs, Field, Empty } from '../ui'
import { Thread } from './People'
import { AttachButton } from './Modals'
import { AttachmentRow } from './Inspector'
import { returnFingerprint, ClientCopy } from './Filing'
import { money, date } from '../format'

export function ClientPortal() {
  const ctx = useCtx()
  const [tab, setTab] = useState('todo')
  const qs = [...ctx.s.notes.values()].filter(n => n.kind === 'client_question')
  const open = qs.filter(n => n.status === 'open')
  return (
    <div className="client-shell">
      <h1>Hi {ctx.user.name.split(' ')[0]} — your 2025 taxes</h1>
      <p className="ink2">Miraflores is preparing your federal and California returns. Here's what we need from you and where things stand.</p>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'todo', label: `Questions for you${open.length ? ` (${open.length})` : ''}` }, { id: 'docs', label: 'Your documents' }, { id: 'sign', label: 'Review & sign' }]} />
      {tab === 'todo' && (
        <div className="col gap12">
          {qs.map(n => <Thread key={n.id} id={n.id} client />)}
          {!qs.length && <Empty>No questions right now. We'll let you know here if we need anything.</Empty>}
        </div>
      )}
      {tab === 'docs' && <ClientDocs />}
      {tab === 'sign' && <Sign />}
    </div>
  )
}

function ClientDocs() {
  const ctx = useCtx()
  const mine = [...ctx.s.attachments.values()].filter(a => a.by === ctx.user.id)
  const docs = ctx.ix.p.documents.filter(d => d.uploaded_by === 'client' && d.received_at <= ctx.clock)
  return (
    <div className="card pad">
      <div className="row mb12"><h3 className="grow">Upload something</h3><AttachButton refs={['client-upload']} label="Upload a document" /></div>
      {mine.map(a => <AttachmentRow key={a.id} id={a.id} />)}
      <h4 className="mt16 mb8">Received from you ({docs.length})</h4>
      {docs.map(d => <div key={d.id} className="row small" style={{ padding: '3px 0' }}><span className="grow">{d.title}</span><span className="muted">{date(d.received_at)}</span></div>)}
    </div>
  )
}

function Sign() {
  const ctx = useCtx()
  const rfp = returnFingerprint(ctx)
  const partner = [...ctx.s.signoffs].reverse().find(x => x.area === '_return' && x.level === 'partner' && !x.revoked)
  const ready = partner && partner.fingerprint === rfp
  const ap = ctx.s.filing.approval
  const current = ap && ap.fingerprint === rfp
  const [pin, setPin] = useState('')
  const [agree, setAgree] = useState(false)
  const [copy, setCopy] = useState(false)
  const s = ctx.eff.summary
  if (!ready) return <div className="card pad"><Empty>Your return isn't ready for your review yet. Your preparer will let you know.</Empty></div>
  return (
    <div className="card pad">
      <h3>Your 2025 return is ready</h3>
      <div className="grid g2 mt12">
        <div className="stat"><div className="lbl">Federal</div><div className="big">{s.federal.balance_due > 0 ? `You owe ${money(s.federal.balance_due)}` : `Refund ${money(-s.federal.balance_due)}`}</div></div>
        <div className="stat"><div className="lbl">California</div><div className="big">{s.california.balance_due > 0 ? `You owe ${money(s.california.balance_due)}` : `Refund ${money(-s.california.balance_due)}`}</div></div>
      </div>
      <button className="btn sm mt12" onClick={() => setCopy(true)}>See the full summary</button>
      <div className="divider" />
      {current ? <div className="callout ok">Signed on {new Date(ap!.at).toLocaleString()}. Thank you — we'll file and let you know when it's accepted.</div> : (
        <>
          {ap && !current && <div className="callout warn small mb12">Your return changed after you signed. Please review and sign again.</div>}
          <Field label="Form 8879 — IRS e-file signature authorization" hint="Enter a five-digit PIN of your choice. It serves as your signature.">
            <input value={pin} maxLength={5} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 120 }} />
          </Field>
          <label className="row small mb12"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I've reviewed the return and, under penalties of perjury, declare it true, correct and complete to the best of my knowledge.</label>
          <button className="btn primary" disabled={pin.length !== 5 || !agree} onClick={() => ctx.emit('filing.approve', { fingerprint: rfp, pins: { [ctx.user.id]: '•••••' } }, { action: 'client_approve' })}>Approve & sign</button>
        </>
      )}
      {copy && <ClientCopy onClose={() => setCopy(false)} />}
    </div>
  )
}
