# Video walkthrough script (about 8 minutes)

Before recording: open the link. If you've clicked around before, scroll to the bottom of the Overview and click **Reset to the packet as delivered**. Keep a second browser tab open on the same link (to show side-by-side work).

**1. The idea (0:00–0:45), on the Overview**
"A workpaper has to answer four things about every number: where it came from, how it was built, who checked it, and what's still open. So the core interaction is: click any number and it explains itself.
This is the packet exactly as delivered. The household is the headline: Ngozi and Erik, married filing jointly, moved from California to Texas mid-year, two dependents. The engine says they owe 4,220 federally. And there are already 26 open findings. They come from independent checks that read the documents and the IRS and FTB records directly and recompute what the return should say. They never trust the engine."

**2. A finding, end to end (0:45–2:15)**
- Findings → click **RSU sales taxed with zero basis** to expand it. Show expected vs actual and the evidence. Click `ev-0066` to open the Corvane supplemental statement with the field outlined.
  "Same shares, same dates; the engine didn't match the lot IDs, so the vest value is taxed twice. That's about 15,500 of federal tax."
- **Apply fix.** Point out the Undo in the toast, and the federal number in the top bar moving.
- The return → Business → click **Gross receipts**. The side panel shows the engine value vs the workpaper value, how it was built, every document it came from with confidence, and what was done to it.

**3. Documents (2:15–3:00)**
- Documents → **Vehicle mileage log** → page 3: the red banner says it's a second scan of page 2.
- Toggle **Form / Positions**. "Positions is how a real scan would be overlaid. One function supplies the page, and that's where real PDFs plug in."
- Back on the Documents list: "every document shows where it landed on the return, or needs a reason."

**4. Demo work and the review (3:00–4:45)**
- Reset, then on the Overview click **Load a morning of demo work** (Priya's verifications and fixes, Daniel's review notes). The top numbers flip from "owe 4,220" to a refund, with "The engine said…" underneath.
- "Next for you" changes per person. Show the two review notes from Daniel.
- Findings: point out **SEP deduction above the limit**. "It only appeared after the Schedule C fixes changed the profit. Checks re-run against the corrected return, not the engine."
- Switch to **Daniel (reviewer)** → an area → **Sign off**. Switch back to Priya, change a line in that area, and show the sign-off now says **reopened** with exactly what changed.
- Switch to **Marcus** (no clearance): SSNs stay masked with no reveal. Switch to **Helen (partner)** → More → Adjustments & versions → **Approve all**. More → Firm settings → Sensitive data log.

**5. Changes and what-ifs (4:45–5:30)**
More → Adjustments & versions → **Compare versions**: v2 → v3 (what the late K-1 changed), then v3 → Workpaper. **What-ifs**: tick the Section 179 alternative and untick one adjustment to see the result without saving anything.

**6. Filing and after (5:30–7:00)**
- Review & filing: what's holding the return, and the required steps (automatic vs manual).
- Partner sign-off → switch to **Ngozi (client)** → Review & sign.
- If Theo's SSN isn't corrected, transmitting gets **rejected (R0000-504-02)**. Fix it, transmit again → accepted → **frozen**.
- Show the frozen banner, "Start amendment", the client copy and the Letter 566 response package. Switch to **IRS examiner**: they see only the response package.
- Mention: "The packet's timeline assumes a federal balance due after filing. With the corrections this return is a refund. I trust the corrections, and here's why…"

**7. Technical decisions (7:00–8:00)**
- The packet is never changed; every action is an event in an append-only log, and the screen is computed from both. That gives history, undo, sign-offs that reopen, freeze and amend, and conflict-free multi-user merging.
- The engine can't be rerun, so totals update by inferred plus/minus signs, complex lines are flagged "recompute", and tax is estimated with the engine's own per-dollar rates. That's the honest tradeoff.
- Built for one household, but nothing about the client is hardcoded: the profile and document grouping come from the packet, and the core checks match by form type and field name. A test renumbers every ID and the same findings appear.
- Limitations: permissions are enforced in the browser, about half the checks still encode this household's specifics, and the shared store is optional (Upstash on Vercel).
- How AI was used: Claude Code analyzed the data, wrote the code and tests, and drove a headless browser; I directed the design, pushed back on the UI, and reviewed every finding.
