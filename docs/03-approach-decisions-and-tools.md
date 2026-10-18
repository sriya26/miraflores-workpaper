# Approach, key decisions and tools

## Approach

1. **Read the packet before designing anything.** I read every document's printed content against the extracted values and every engine line against its sources. That produced the error list first and shaped the design. Most errors are disagreements between two sources: two documents, a document and a client answer, or this year and last year. So the core feature had to be "put the two sources next to each other".
2. **Define the record before the screens:** an immutable packet, plus an append-only event log, plus a pure `reduce`. Everything else (history, undo, "since I last looked", stale sign-offs, freeze and amend, multi-user merge) falls out of that.
3. **Write the checks as code, then test them.** `tests/checks.test.ts` runs every check on the delivered packet, applies every proposed fix, and asserts that each finding with a fix turns green.
4. **Build the screens around the reviewer's path:** Overview → Findings → Area → line Inspector → source page → sign-off → filing.

## Key decisions and tradeoffs

| Decision | Why | Tradeoff |
|---|---|---|
| **Event sourcing** instead of mutable records | Nothing is lost. History, undo, version compare, sign-off staleness and amendments are all queries over the log. Merging concurrent edits is a union by event id, so there are no conflicts. | State is recomputed on every change. That's fine at this scale (~150 events, 3,000 values) but needs snapshots at firm scale. |
| **Can't rerun the engine, so propagate linearly and estimate tax by rates** | Honest about what is known. Signed sums update exactly (signs inferred by re-footing). Non-linear lines are flagged "recompute", not invented. Tax uses the packet's own per-dollar rates or what-if results. | The bottom line is an estimate until the engine reruns. Threshold crossings (the SALT cap) are handled case by case. |
| **Independent checks compare to the workpaper value, and find data by type, not ID** | A fixed finding disappears by itself, and a regression reappears. The core checks (stock-comp basis, 1099-K overlap, duplicate interest, FX year, mileage duplicates, vehicle donations, dependent SSNs, W-2s) locate documents by form type and field name, so they run on any client's packet; a test proves it by renumbering every ID. | About half the checks still encode facts specific to this household (e.g. the call-note percentages, the Meridian page 32). A production system would make every check a reusable rule the firm can extend. |
| **Simulated documents built from extracted fields**, plus a positions overlay | Clearly shows the exact field. `pageSource()` is the seam for real scans. | The packet's positions are synthetic, so the overlay doesn't align with the text. The form view is the default for that reason. |
| **Sign-offs as fingerprints** | "Reopens when what was signed changes" becomes exact, and shows the diff. | Any change in an area reopens it. That's intentionally strict. |
| **Permissions enforced in the write path** (`can()` on every emit) | Roles are real, not just hidden buttons. "No self-review" is enforced on sign-off. | The prototype trusts the browser. A production system enforces on the server. |
| **Static SPA + optional shared store** | Runs from a link with zero setup. Saves to the browser and syncs across tabs. With an Upstash/Vercel KV env var, `/api/events` makes it multi-user. | Without KV, each browser has its own copy. Export/import of the event log is provided. |
| **Season clock** | The packet is a timeline. Replaying it shows late documents, version changes, the extension and the e-file rejection in context. | Human events use real time. The season time is stored alongside them. |
| **No AI calls inside the app** | Every number must be explainable and reproducible. The checks are deterministic. | An LLM could draft dispositions, variance explanations and client questions. It's a natural next step, with human sign-off. |

## What I'd do next

Server-side enforcement and auth; firm-configurable checks; engine re-run on demand with adjustments as inputs; real document images; a proper Form 8949 / 1040-X export; snapshotted state for firm-wide status.

## Tools used, including AI

- **Claude Code** (Anthropic's coding agent, running in a cloud session) was the main tool. It read the PDF and the 1.9 MB packet, analyzed the data with Python scripts to find the errors (comparing extracted values to printed text, re-footing sums, comparing pages trip by trip, reconciling broker lots), wrote the React/TypeScript app, the checks and the tests, drove a headless browser (Playwright/Chromium) to test the full preparer → reviewer → partner → client → e-file flow and screenshot every page, and drafted these documents.
- **Stack:** React 18, TypeScript, Vite; Vitest for the checks test; Playwright for end-to-end smoke tests; optional Vercel serverless function plus Upstash Redis for shared state.
- **Human role:** framing the problem, choosing the design, pushing back on a cluttered first UI (it was redesigned to a calmer, task-first layout), reviewing the errors and judgments, and the walkthrough video.
