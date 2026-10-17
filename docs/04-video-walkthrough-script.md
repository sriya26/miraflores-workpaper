# Video walkthrough script (about 8 minutes)

Before recording: open the app, click **Reset to packet as delivered** (Overview, Team card) if needed, and keep a second tab ready.

**1. The idea (0:00–0:45), on the Overview page**
"A workpaper has to answer four things about every number: where it came from, how it was built, who checked it, and what's still open. So the core interaction is: click any number and it explains itself. This is the packet exactly as delivered. Nobody has touched it, and there are already 25 open findings. Those come from independent checks that read the documents and agency records and recompute what the return should say. They never trust the engine."

**2. A finding, end to end (0:45–2:15)**
- Findings → **RSU sales taxed with zero basis**. Expected vs actual, evidence chips. Click `ev-0066` to open the Corvane supplemental statement with the field outlined. "Same shares, same dates; the engine didn't match the lot IDs, so the vest value is taxed twice. 15,500 of federal tax."
- **Apply fix.** Point out the toast with Undo, and that the bottom line in the header moves.
- Open the Business area → **Gross receipts** → Inspector: engine vs workpaper, formula tree, "came from" (every 1099 with confidence), "what was done to it".

**3. Documents (2:15–3:00)**
- Documents → D23 mileage log → page 3: red banner, "a second scan of page 2". Toggle **Form / Positions**. "Positions is how a real scan would be overlaid. `pageSource()` is the seam where real PDFs plug in."
- Back in the Documents index: "every document shows where it landed, or needs a reason."

**4. Load demo work, and the review (3:00–4:45)**
- Overview → **Load demo work** (Priya's verifications and fixes, Daniel's review notes). The bottom line shows engine owe 4,220 → workpaper refund.
- Findings: a new one has appeared, **SEP deduction above the limit**. "It only exists because the Schedule C fixes changed the profit. Checks re-run against the workpaper, not the engine."
- Switch role to **Daniel (reviewer)**: an area → sign off. Then switch to Priya and change a line: the sign-off shows **reopened** with the exact change.
- Switch to **Marcus** (no clearance): SSNs masked, no reveal. Switch to **Helen (partner)** → Adjustments → **Approve all**. Firm → Sensitive data log.

**5. Changes and what-ifs (4:45–5:30)**
Adjustments & versions → Compare **v2 → v3**, then **v3 → Workpaper**. What-ifs: tick the Section 179 alternative and untick an adjustment to see the scenario without saving anything.

**6. Filing and after (5:30–7:00)**
Review & filing: the blockers list and the required steps (automatic vs manual). Partner sign-off → switch to **Ngozi (client)** → Review & sign. If Theo's SSN isn't corrected, transmit gets **rejected R0000-504-02**. Fix it, transmit again → accepted → **frozen**. Show the banner, "Start amendment", the client copy and the Letter 566 package. Switch to **IRS examiner**: only the response package.

**7. Technical decisions (7:00–8:00)**
- The packet is immutable plus an append-only event log, and state is a pure reduce. That gives history, undo, sign-off fingerprints, freeze and amend, and conflict-free multi-user merging.
- The engine can't rerun, so linear propagation uses inferred signs, non-linear lines are flagged, and tax is estimated with the engine's own rates. That's the honest tradeoff.
- Tradeoffs: permissions are enforced client-side in the prototype; checks are hand-written; the shared store is optional (Vercel KV).
- How AI was used: Claude Code analyzed the data, wrote the code and tests, and drove a headless browser; I directed the design and reviewed every finding.
