import React, { useMemo } from 'react'
import { useCtx, blockers, findingState, signoffState, Ctx } from '../ctx'
import { AREAS, areaOfLine } from '../areas'
import { money, date, ago } from '../format'
import { feedFor } from '../App'
import { seedDemo } from '../demo'
import { resetAll } from '../store'

export function areaStats(ctx: Ctx, areaId: string) {
  const checks = ctx.checks.filter(c => c.area === areaId)
  const open = checks.filter(c => findingState(ctx, c).open)
  const keys = ctx.vix.order.filter(k => areaOfLine(k) === areaId)
  const srcRefs = new Set<string>()
  for (const k of keys) for (const s of ctx.vix.lines.get(k)!.sources || []) if (s.startsWith('ev-')) srcRefs.add(s)
  const verified = [...srcRefs].filter(r => ctx.s.verifications.has(r)).length + keys.filter(k => ctx.s.verifications.has(k)).length
  const total = srcRefs.size + keys.filter(k => !(ctx.vix.lines.get(k)!.sources || []).length && ctx.vix.lines.get(k)!.rule !== 'R-SUM' && ctx.vix.lines.get(k)!.rule !== 'R-CARRY').length
  const adjs = [...ctx.s.adjustments.values()].filter(a => a.status === 'active' && areaOfLine(a.lineKey) === areaId)
  const so = signoffState(ctx, areaId) as any
  const hours = ctx.s.time.filter(t => t.area === areaId).reduce((a, t) => a + t.hours, 0)
  return { checks, open, keys, verified, total: Math.max(total, verified), adjs, so, hours }
}

// Plain-language status for an area, from the reader's point of view.
export function areaStatus(ctx: Ctx, id: string): { text: string; tone: '' | 'bad' | 'ok' | 'warn' } {
  const st = areaStats(ctx, id)
  if (st.open.length) return { text: `${st.open.length} to resolve`, tone: 'bad' }
  if (st.so.reviewer.stale || st.so.preparer.stale) return { text: 'Changed after sign-off', tone: 'warn' }
  if (st.so.reviewer.so) return { text: 'Reviewed', tone: 'ok' }
  if (st.so.preparer.so) return { text: 'Ready for review', tone: '' }
  return { text: 'Ready to sign off', tone: '' }
}

function nextSteps(ctx: Ctx) {
  const r = ctx.user.role
  const out: { text: string; sub?: string; go: string }[] = []
  const open = ctx.checks.filter(c => findingState(ctx, c).open)
  if (r === 'partner') {
    const pend = [...ctx.s.adjustments.values()].filter(a => {
      const e = ctx.eff.effects.get(a.id)
      return a.status === 'active' && !a.rejected && e && (Math.abs(e.fed) > 1000 || Math.abs(e.ca) > 1000) && !a.approvals.some(x => x.level === 'partner')
    })
    if (pend.length) out.push({ text: `Approve ${pend.length} adjustment${pend.length > 1 ? 's' : ''} over 1,000 of tax`, sub: 'Firm rule: partner sign-off on large changes', go: '/changes' })
  }
  for (const n of ctx.s.notes.values()) if (n.status !== 'resolved' && n.to === ctx.user.id) out.push({ text: n.subject, sub: `${n.kind === 'review' ? 'Review note' : 'Question'} from ${ctx.userName(n.by)}`, go: `/people?n=${n.id}` })
  if (r === 'preparer' || r === 'partner' || r === 'reviewer') {
    for (const c of open.filter(c => c.severity === 'high').slice(0, 4)) out.push({ text: c.title, sub: 'Finding', go: `/findings?f=${c.id}` })
    if (open.length > 4) out.push({ text: `${open.length - Math.min(4, open.filter(c => c.severity === 'high').length)} more findings`, sub: 'See all findings', go: '/findings' })
  }
  const bl = blockers(ctx).filter(b => b.kind !== 'finding' && b.kind !== 'approval')
  for (const b of bl.slice(0, 3)) out.push({ text: b.text.charAt(0).toUpperCase() + b.text.slice(1), sub: 'Before filing', go: b.go || '/filing' })
  return out.slice(0, 7)
}

export function Overview() {
  const ctx = useCtx()
  const steps = useMemo(() => nextSteps(ctx), [ctx.s, ctx.eff, ctx.checks, ctx.user])
  const since = ctx.s.seen.get(ctx.user.id)
  const feed = feedFor(ctx, since, true).filter(f => !f.mine).slice(0, 5)
  const e = ctx.eff.summary, b = ctx.vix.v.summary
  const days = Math.ceil((+new Date('2026-10-15T23:59:00Z') - +new Date(ctx.clock)) / 86400000)
  const filed = ctx.s.filing.submissions.some(x => x.status === 'accepted' && x.jurisdiction === 'federal')
  const empty = ctx.s.events.length === 0
  const amt = (v: number) => (v > 0 ? 'Owe ' : 'Refund ') + money(Math.abs(v))
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <div className="small muted">Ngozi Okafor & Erik Lindqvist · married filing jointly · moved California → Texas July 15, 2025</div>
          <h1 style={{ marginTop: 6 }}>2025 return</h1>
          <p>{filed ? 'Filed and accepted.' : days > 0 ? `${days} days to the extended deadline (Oct 15, 2026).` : 'Past the extended deadline.'} Latest engine run {ctx.vix.v.version}, {date(ctx.vix.v.computed_at)}.</p>
        </div>
      </div>

      {empty && (
        <div className="row small mb16" style={{ color: 'var(--ink-3)' }}>
          <span className="grow">This is the packet as delivered — nobody has worked on it yet.</span>
          <button className="btn sm" onClick={() => seedDemo(ctx)}>Load a morning of demo work</button>
        </div>
      )}

      <div className="hero">
        {(['federal', 'california'] as const).map(j => {
          const now = e[j].balance_due, eng = b[j].balance_due
          return (
            <div key={j}>
              <div className="lbl">{j === 'federal' ? 'Federal' : 'California'}</div>
              <div className="big">{amt(now)}</div>
              <div className="was">{now !== eng ? <>The engine said {amt(eng).toLowerCase()}. <a href="#/changes">What changed</a></> : 'As computed by the engine — no adjustments yet.'}</div>
            </div>
          )
        })}
      </div>

      <div className="section-title">Next for you{steps.length > 0 && <span className="muted" style={{ fontWeight: 400 }}>{ctx.user.name}</span>}</div>
      {steps.length ? (
        <div className="todo">
          {steps.map((s, i) => <a key={i} href={'#' + s.go}><span className="n">{i + 1}</span><span className="grow">{s.text}</span><span className="sub">{s.sub}</span></a>)}
        </div>
      ) : <div className="small muted">Nothing waiting on you.</div>}

      <div className="section-title">The return<span className="spacer" /><a className="small" href="#/filing" style={{ fontWeight: 400 }}>Filing checklist →</a></div>
      <table className="plain-table">
        <tbody>
          {AREAS.map(a => {
            const st = areaStatus(ctx, a.id)
            return (
              <tr key={a.id} onClick={() => ctx.go(`/area/${a.id}`)}>
                <td>{a.name}</td>
                <td className="r" style={{ color: st.tone === 'bad' ? 'var(--bad)' : st.tone === 'ok' ? 'var(--ok)' : st.tone === 'warn' ? 'var(--warn)' : undefined }}>{st.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {feed.length > 0 && (
        <>
          <div className="section-title">Since you last looked<span className="spacer" /><button className="btn sm ghost" onClick={() => ctx.emit('seen', { at: new Date().toISOString() })}>Mark seen</button></div>
          {feed.map((f, i) => (
            <div key={i} className="small" style={{ padding: '6px 0', cursor: f.go ? 'pointer' : undefined }} onClick={() => f.go && ctx.go(f.go)}>
              <b>{ctx.userName(f.who)}</b> <span className="ink2">{f.text}</span> <span className="muted">· {ago(f.at)}</span>
            </div>
          ))}
        </>
      )}

      {!empty && <div className="mt24"><button className="btn sm ghost" onClick={() => { if (confirm('Erase all workpaper activity and return to the packet as delivered?')) resetAll() }}>Reset to the packet as delivered</button></div>}
    </div>
  )
}
