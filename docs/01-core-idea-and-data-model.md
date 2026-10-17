# Core idea and data model

## The idea: a return you can interrogate, not a spreadsheet you re-check

A workpaper exists to answer four questions about any number: **where did it come from, how was it built, who checked it, and what is still open.** So the product starts from a single interaction: **click any number and it explains itself.**

- **Trace down.** The line's formula tree, the inputs it was summed from (re-added by the workpaper, not taken from the engine), and the exact field on the exact page of the source document.
- **Trace up.** From any document, see every line it landed on. If it landed nowhere, see the recorded reason: duplicate, superseded, informational, or "needs a disposition".
- **History.** Its value in v1/v2/v3, in the 2024 return, every adjustment with who/why/tax effect, every verification, note and decision.

Around that, the workpaper is organized the way a reviewer thinks: by **area** (wages, investments, the business, rentals, K-1s, California, and so on). Each area has findings, lines, documents, sign-offs, time and an assignee. Findings come from **independent checks** that read the documents, client answers and IRS/FTB records directly and recompute what the return should say. A finding clears itself when the workpaper's value matches, and reappears if a later engine run regresses.

The engine is treated as a fast junior: useful, often right, never trusted.

## The data model: an immutable packet plus an append-only event log

```
Packet (read-only, loaded exactly as delivered)
  documents ─ pages ─ extracted values (ev-NNNN: field, text read, position, confidence)
  return_versions v1..v3 ─ lines (key, rule, inputs[], sources[]) ─ diagnostics, assets, rates
  client answers / messages / calls · prior years · agency records · firm · timeline

Event log (everything the workpaper adds; nothing is ever overwritten)
  {id, type, actor, at, seasonAt, batch?, payload}
  verify · adjust · adjust.revert/approve/reject · correct · disposition · note.create/reply/resolve
  decision · signoff/revoke · attach · link · time · assign · step · standards.update · access
  filing.extension/approve/submit/freeze/amend/payment · seen

State = reduce(packet, events)              // pure function, recomputed on every change
Workpaper return = engine version at the clock + active adjustments
```

**Everything is a reference.** One resolver turns any string into a navigable thing: `ev-0123`, `D47`, `doc:D30#page32`, `qa-25`, `msg-07`, `py:/return_2024/...`, `agency:/...`, `asset:SAC-BLDG`, `household:theo`, `ref:fx.SEK.2025_average`, a line key, or a workpaper note/attachment/adjustment. Evidence, links and citations all use the same refs, so anything can be evidence for anything.

**Adjustments keep the original.** Each one stores the line, base version, original value, delta, reason, evidence, and federal and California tax categories. Deltas are pushed up through every line that is a signed sum of its inputs. The signs are inferred by re-footing, so 128 of 133 sum lines verify. Lines behind non-linear rules are flagged "recompute" rather than guessed. Tax effect = the change that reaches the category's driver line × the version's per-dollar rate, or the engine's own what-if result. Effects over 1,000 need the partner.

**Sign-offs are fingerprints.** A sign-off stores a hash and snapshot of its area: line values, active adjustments and finding states. When anything it covers changes, it shows as reopened, with a list of exactly what changed. The partner's return sign-off and the client's Form 8879 bind to a fingerprint of the whole return. Change anything after the client signs and the approval is void.

**Time is a dimension.** A season clock replays the packet: documents, engine versions and agency events appear when they arrived. Filing freezes a snapshot. Later events are tagged as an amendment on top, and "as filed" stays comparable to everything else.

**Roles are enforced, not hidden.** Every write goes through `can(user, action)`. Nobody reviews work they prepared or adjusted. Sensitive values are masked for everyone, and cleared staff can reveal them, with every reveal written to the access log. The client sees only their questions, uploads and the approval screen. The IRS examiner sees only the response package.

**Simulated documents are swappable.** The viewer asks `pageSource(doc, page)` for a page and draws highlights in the pipeline's normalized coordinates. Today it returns a page rebuilt from the JSON (a form view, plus a "Positions" overlay view). A real scan would return `{kind: 'image' | 'pdf', url}` and the same boxes would land on it.
