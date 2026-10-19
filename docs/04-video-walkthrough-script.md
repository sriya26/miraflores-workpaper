# Video walkthrough script

The submitted video follows this script: a short intro on camera, a screen walkthrough with voiceover, and the technical decisions and tradeoffs on camera at the end.



---

## INTRO: on camera, before the video (about 20 s)
> Hi, I'm Sriya. For the Miraflores case study I built a web-native tax workpaper for the Okafor-Lindqvist 2025 return.
> The core idea: click any number and it explains itself — where it came from, how it was built, who checked it, and what's still open.

---

## PART 1: the main story

**0:00–0:40 · Overview.** On screen: the household headline, "Owe 4,220 / Refund 8,256", the "How this works" guide, then the list scrolls to "Next for you".
> This is the packet exactly as delivered; the app never changes it.
> The household is the headline: Ngozi and Erik, married filing jointly, moved from California to Texas in July, two dependents, and a design business.
> The engine says they owe 4,220 federally and get 8,256 back from California.
> A new hire gets a short guide for their role, and "Next for you" is their queue: 26 findings already.

**0:40–1:08 · Findings, Apply fix.** On screen: the Findings list, the "Stock-comp sales taxed with zero basis" finding opens, Apply fix, and the top numbers change.
> Every finding comes from a check that reads the documents and the IRS and FTB records itself. It never trusts the engine.
> Here the stock sales were reported with zero basis, so the vest value is taxed twice.
> Apply fix records an adjustment with who, why and the tax effect. The original is kept, and the totals at the top update live.

**1:08–1:33 · Trace a number.** On screen: the Wages area; the W-2 wages line is clicked and the side panel scrolls.
> The return is reviewed by area. Click any number and it explains itself:
> the exact field on each W-2 it came from, how it was built, its value in every engine run and last year, and what was done to it.

**1:33–1:43 · Documents.** On screen: the Documents list, "Not accounted for" tab.
> From the other direction, every document must land on the return or carry a reason it didn't.

**1:43–2:10 · Mileage log.** On screen: page 3 of the mileage log with a red banner, then the Positions view.
> Page 3 of the mileage log is a second scan of page 2, so those miles were counted twice. A check caught it.
> These pages are rebuilt from the JSON. One function supplies the page, so real scans can replace them later.

**2:10–2:28 · Reset and load demo work.** On screen: the Overview resets to "Owe 4,220", then demo work loads and both results become refunds.
> Now a team at work. I start clean and load a scripted morning: Priya's fixes and Daniel's review notes. Both results flip to refunds.

**2:28–2:53 · Daniel signs off.** On screen: switch to Daniel Ortiz; his "Next for you"; the Wages area; Sign off as reviewer.
> Switching to Daniel, the reviewer: his queue is different. He reviews Wages and signs off.

**2:53–3:13 · The sign-off reopens.** On screen: back as Priya; Adjust a wages line by 100; the strip shows "reopened" with what changed.
> Back as Priya, I change a line he signed. His sign-off reopens by itself and lists exactly what changed. A sign-off is a fingerprint of what was signed.

**3:13–3:38 · Marcus and Sam.** On screen: Marcus on Intake with masked SSNs; then Sam with a read-only banner.
> Marcus has no sensitive-data clearance, so SSNs stay masked with no reveal.
> Sam doesn't start until January 2027, so for now the workpaper is read-only for him.

**3:38–3:48 · Adjustments & partner approval.** On screen: Helen on Adjustments & versions; Approve all.
> Helen, the partner, sees every adjustment with its approvals and effect, and approves the large ones.

**3:48–4:08 · Compare versions, what-ifs.** On screen: the Compare versions table, then What-ifs.
> Compare versions shows what changed between engine runs, like the late K-1. What-ifs let you test changes without saving anything.

**4:08–4:23 · Records.** On screen: Schedules: Return vs last year, Depreciation, Sales detail, Prior preparer vs us.
> All the records a CPA expects: last year versus this year, depreciation by asset, sales, and what the prior preparer did versus what we changed.

**4:23–4:48 · Filing, fast-forward, partner sign-off.** On screen: Review & filing; "Fast-forward the review"; the blockers clear; Partner sign-off.
> Review & filing lists everything holding the return. For the demo I fast-forward the rest of the review; each step is still attributed to the person who'd do it.
> Nothing is holding it now, so Helen signs as partner.

**4:48–5:13 · Client signs.** On screen: Ngozi's client view; Review & sign; PIN; Approve & sign; the "Signed" banner.
> The client gets a simple view. Ngozi reviews the result and signs Form 8879. Her signature binds to this exact return.

**5:13–5:38 · E-filed and frozen.** On screen: Helen transmits; accepted; the purple "Return frozen" banner.
> Helen transmits. Federal and California are accepted, and the return is frozen. Any change now goes on top as an amendment.

**5:38–6:00 · IRS letter years later.** On screen: the clock moves to 2028; the IRS examiner sees the response package.
> The season clock replays the timeline. In 2028 an IRS letter arrives, and the examiner sees only a self-contained response package.

---

## PART 2: everything else in the brief

**6:00–6:05 · Clean start.** On screen: the Overview back to "Owe 4,220".
> Now a quick tour of everything else the brief asks for, starting again from the clean packet.

**6:05–6:23 · Many items at once, with undo.** On screen: "Select all with a fix", "Apply selected fixes", the totals jump, then Undo.
> Select every finding with a proposed fix and apply them in one batch. The totals change, and one click undoes the whole batch.

**6:23–6:45 · Verify, link, attach.** On screen: the wages line; Verify with a note; "+ link" to the 2024 return; a bank statement attached.
> Each number records how it was verified and by whom. It can be linked to related items, like last year's return, and any file can be attached as evidence.

**6:45–6:58 · Judgment call.** On screen: the HVAC finding; the "Record a judgment call" form; Record.
> Judgment calls, elections, due diligence and penalty decisions are recorded with the reasoning and the authority, and they close the finding.

**6:58–7:30 · Question to the client becomes evidence.** On screen: "Ask client for the bank statement"; Erik's view where he replies; back as Priya, the answered thread.
> A question goes to the client. Erik answers in his own simple view, and his answer becomes evidence on the thread.

**7:30–7:53 · Review note blocks filing, plus notifications.** On screen: Daniel writes a review note; Review & filing lists it as holding the return; Priya opens the bell.
> Daniel raises a review note that blocks filing until it's resolved. Priya sees it under "since you last looked".

**7:53–8:13 · Assignments, time, activity, search.** On screen: the Assignments & deadlines, Time vs budget and Activity log tabs; search.
> Each area has an owner and a deadline. Time is tracked against the firm's budget, every action is in the activity log, and search finds anything.
> [Several people can work at once: everyone with the link sees the same live workpaper.]

**8:13–8:28 · More records.** On screen: State split, Books to tax, Sales detail, Carryovers, Basis by year.
> The California–Texas split, books to taxable income, all 302 sales, carryovers, and basis year by year.

**8:28–8:48 · Sensitive data and firm settings.** On screen: an SSN revealed on Intake; Firm settings; the Sensitive data log entry.
> Revealing an SSN is logged. Firm settings hold the standards, roles and the log of who viewed what.

**8:48–9:13 · Extension, then sign.** On screen: Helen on Review & filing, the Extension card, fast-forward, partner sign-off, Ngozi signs.
> The extension was filed in April with a 36,000 payment. The team finishes the review, Helen signs, and Ngozi signs.

**9:13–9:28 · E-file rejected.** On screen: Transmit, then a red **rejected** box: Theo's SSN doesn't match.
> But the IRS rejects it: Theo's SSN doesn't match their records. The rejection is kept as part of the record.

**9:28–9:43 · Fix the SSN.** On screen: Priya on Findings; "Theo's SSN doesn't match"; Reopen; "Correct to 666-74-3390".
> Priya corrects Theo's SSN to match last year's return and his card.

**9:43–10:08 · Re-sign and sign again.** On screen: Helen's sign-off matrix shows Intake reopened; fast-forward; Re-sign; Ngozi signs again.
> The correction reopens the Intake sign-off and voids the earlier approvals, because they no longer match the return. The team re-signs and Ngozi signs again.

**10:08–10:23 · Accepted.** On screen: Transmit; federal and California accepted; frozen.
> Transmitted again, and this time it's accepted.

**10:23–10:28 · Client copy.** On screen: the client copy summary.
> The client gets their own copy.

**10:28–10:45 · Amendment, roll forward, 2026 plan.** On screen: "Amendment 1" started; Roll forward to 2026; the 2026 plan.
> An amendment goes on top of the frozen return. Everything rolls forward to 2026 with its history, along with next year's plan.

---

## CLOSING: on camera, after the video (about 1 min)
> A few decisions behind this:
> **The packet is never changed.** Every action is an event in an append-only log, and the screen is computed from the packet plus the log. That gives history, undo, sign-offs that reopen, freeze and amend, and several people working at once.
> **The engine can't be rerun.** So changes are pushed up through the line formulas, complex lines are flagged "recompute" instead of guessed, and tax is estimated with the engine's own per-dollar rates. That's the honest tradeoff.
> **Nothing about the client is hardcoded.** The profile, the document grouping and the core checks come from the packet by form type and field name.
> **Limitations:** permissions are enforced in the browser, about half the checks still encode this household's specifics, and the shared store is simple.
> **How I used AI:** Claude Code analysed the data and wrote the code and tests. I directed the design, pushed back on the UI, and checked every finding.
> Thanks for watching. The link, the docs and the errors I found are in my email.
