# Core idea and data model

## The idea: a return you can interrogate, not a spreadsheet you re-check

A workpaper answers four questions about any number: **where did it come from, how was it built, who checked it, and what is still open.** So the product is built around one interaction: **click any number and it explains itself.** You see its inputs (re-added by the workpaper, not taken from the engine), the exact field on the source page, every version and adjustment, and who verified it. From any document you can trace up to every line it landed on, or to the reason it landed nowhere.

The work is organized by **area** (wages, investments, business, rentals, K-1s, California…), each with findings, lines, documents, sign-offs and an assignee. Findings come from **independent checks** that read the documents, client answers and IRS/FTB records and recompute what the return should say. A finding clears when the workpaper agrees and reappears if a later engine run regresses. The engine is treated as a fast junior: useful, often right, never trusted.

## The data model: an immutable packet plus an append-only event log

```
Packet (read-only, exactly as delivered)
  documents → pages → extracted values · return versions v1..v3 → lines (rule, inputs, sources)
  client answers/messages · prior years · agency records · firm · timeline

Event log (nothing is overwritten)
  {id, type, actor, at, seasonAt, payload}
  verify · adjust · correct · disposition · note · decision · signoff · filing.* · access …

State = reduce(packet, events)
Workpaper return = engine version at the clock + active adjustments
```

- **Everything is a reference.** One resolver turns `ev-0123`, `D47`, `qa-25`, `household:theo`, a line key or a note into something you can open, so anything can be evidence for anything.
- **Adjustments keep the original.** A delta is pushed up through every line that is a signed sum of its inputs; the signs are inferred by re-footing, which verifies 128 of 133 sum lines. Non-linear lines are flagged "recompute", not guessed. Tax effect is the change at the category's driver line × the engine's own per-dollar rate.
- **Sign-offs are fingerprints.** When anything a sign-off covers changes, it reopens and shows exactly what changed. The partner sign-off and the client's 8879 bind to the whole return.
- **Time is a dimension.** A season clock replays when documents, engine runs and agency letters arrived. Filing freezes a snapshot, and amendments are recorded on top of it.
- **Roles are enforced, not hidden.** Every write goes through `can(user, action)`. Nobody reviews their own work, sensitive values are masked and each reveal is logged, and staff who haven't started yet are read-only. The client and the IRS examiner see only their own screens.
- **Runs on any packet.** The household, the document grouping and the core checks are derived from the packet by form type and field name. A test renumbers every ID and the same findings appear.

- 
