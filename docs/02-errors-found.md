# Errors found, and how the design surfaced them

Every item below is a live **check** in `src/checks.ts`. Each one reads the source documents, client answers or agency records directly and compares its own expected value with the **workpaper** value. Each appears on the Findings page, on its area, on the document page, and as a ⚑ on the line. Most carry a proposed adjustment (one click, undoable, with evidence prefilled). Tax effects use the engine's v3 per-dollar rates or its own what-if results. Positive numbers raise tax.

**Net effect of all fixes:** federal moves from **4,220 owed (engine v3) to about 3,770 refunded**. The California refund grows from **8,256 to about 11,626**.

## Engine errors (the engine read the right numbers but did the wrong thing)

| # | Error | Evidence | Fix | Federal | CA |
|---|---|---|---|---|---|
| 1 | **RSU sales taxed at zero basis.** Three Corvane lots (N1, N3, N4) reported with basis 0 (noncovered). The vest value was already in W-2 wages, so it was taxed twice. The supplemental statement was not matched (lot IDs differ). | D11 (ev-0066/68/70), D28, W-2 box 14 RSU 38,200 | Basis 19,100 / 19,100 / 9,420 | −15,536 | −2,764 |
| 2 | **1099-K added on top of the books.** 12,400 of card payments were already booked, and were already inside Atlas's 41,200 1099-NEC. | D15 deposit detail, D17, D21 | Gross receipts 163,700 → 151,300 | −4,402 | −384 |
| 3 | **Northlake interest counted twice.** The bank-sweep interest on the composite (D28) and the separate Northlake Bank 1099-INT (D29) are the same 1,840. D29 says so. | ev-0492, ev-0538 | Remove SchB.1.2 | −640 | −127 |
| 4 | **Swedish interest converted at the 2024 rate** (10.56, carried from last year) instead of the 2025 average (9.86) | ev-0960, engine fx table | 1,747 → 1,871 | +43 | +9 |
| 5 | **All wages sourced to California after the move.** Halvorsen payroll kept California as the work state through 09/30 (qa-45). Wages earned as a Texas resident are not CA-source. The paystub at the move date (D73) was in the file but no line used it. | ev-0030, D73 ev-1081 | CA wages 218,400 → 129,569 | — | −5,685 |
| 6 | **Payoff interest counted twice.** Lonestar's 1098 already includes interest paid at payoff, and the payoff statement says so. | D55, D56 | SchA.8a −2,150 | +559 | +103 |
| 7 | **Home property tax includes the seller's share.** The buyer closing statement credits the buyers 6,912 for 01/01–07/07. | D54 ev-1027, D57/D58 | 13,420 → 6,508 (through the SALT cap) | +1,462 | +332 |
| 8 | **California estimate applied to the wrong year.** The 09/15/2025 Web Pay payment was designated tax year 2024 and is held by FTB as a 2024 credit. | D68 ev-1076, FTB account | CA estimates 14,000 → 10,500, and ask FTB to transfer | — | +3,500 balance |
| 9 | **Family phone plan and home internet deducted at 100%** (client: 70% / 50%) | D15, call-01 | 3,480 → 2,172 | +464 | +41 |

## Extraction errors (the pipeline misread the document)

| # | Error | How it surfaced | Fix | Federal | CA |
|---|---|---|---|---|---|
| 10 | **Mileage log page 3 is a second scan of page 2.** It says so and repeats the same trips. Page totals were summed: 11,800 miles instead of 8,100. | Check compares pages trip by trip; banner on the document page | Miles 8,100; car expense 8,260 → 5,670 | +919 | +80 |
| 11 | **Meridian page 32 never read.** Summary proceeds 71,965 vs lots 71,715. The missing lot M18 (cash in lieu) is a 60 short-term loss. | Summary-vs-detail check; `doc:D31#page32` | Add the lot | −21 | −2 |
| 12 | **Care provider EIN digits transposed** (74-3829516 read, 74-3829156 printed; confidence 0.97). The engine also renamed "Bright Oak Kids Club" to "Preschool". | Value-vs-printed-text check | Correct the reading (original kept) | — | — |
| 13 | **Handwritten receipt "$?,500"** read as 1,500 at 0.41 confidence | Low-confidence flag; resolved by recording `confirmed_with_client` (msg-08 + check #2207) | Verification | — | — |

## Client answers that were wrong (documents govern)

| # | Error | Evidence | Fix | Federal | CA |
|---|---|---|---|---|---|
| 14 | **Self-employed health insurance deducted** although Erik was eligible for subsidized coverage through Ngozi's employers (IRC 162(l)(2)(B)). The prior preparer allowed none. | qa-25, 2024 note | Sch1.17 14,400 → 0 | +4,464 | +605 |
| 15 | **Car donation at Blue Book** ("about 6,000"). The charity sold it for 2,900, and the deduction is limited to gross proceeds (170(f)(12)). | D66 box 4c, qa-39 | 6,000 → 2,900 | +806 | +149 |
| 16 | **Q4 federal estimate "4,000 I think".** The IRS transcript shows 3,000 on 01/15/2026, and EFTPS covers Q1–Q3 only. | Transcript, qa-41 | 13,000 → 12,000 (+≈17 penalty) | +1,017 balance | — |
| 17 | **Theo's SSN typed wrong in the organizer** (…3309). The 2024 return and his card say …3390. Caught before filing. Left unfixed, the e-file is rejected with R0000-504-02, as the packet's timeline shows. | ev-0012, D71 | Correct the household record | — | — |
| 18 | **Coinhaven lot C6** at zero basis and the transfer-in date. The client says bought 03/15/2021 for 3,050, so it is a long-term gain of 2,275, not a short-term gain of 5,325. Judgment; bank statement requested. | msg-07, ev-0918/0919 | Move to box K | −1,312 | −195 |
| — | Other conflicts resolved by documents: "no investments sold" (qa-14 vs 282 sales); "no prior IRA basis" (qa-31). The 2024 Form 8606 and 5498 show 7,000, so the engine's 26 taxable is right. | | | | |

## Judgment calls the engine got wrong or left open

| # | Item | Treatment | Federal | CA |
|---|---|---|---|---|
| 19 | **HVAC system replacement expensed as a repair** (11,000). It is a full heat-pump replacement, so capitalize it as 27.5-year property (Reg. 1.263(a)-3). | Engine what-if `hvac_improvement` | +3,633 | +896 |
| 20 | **SEP limit** uses the uncorrected Schedule C profit. Recomputed: 13,674 (excess 4,326, so an excise-tax exposure). This finding only appears after the Schedule C fixes land. | Advise withdrawal; record decision | +477 | +65 |
| 21 | **Section 179 election** saves California tax at no federal cost. The engine priced it but never applied it. | Engine what-if `equipment_section179` | 0 | −1,050 |
| 22 | **California AMT on the ISO exercise** not computed (exercised after the move; grant-to-exercise mostly CA workdays) | Recorded judgment and authority | — | — |
| 23 | **Due diligence (Form 8867)** for CTC/ODC not done | Decision record | — | — |

## Completeness and outside filings

- **Documents with no landing place:** at the review date, 16 of the 72 documents received feed no line (e.g. D10 the duplicate W-2, D30 superseded, D73 the paystub, D47 the HVAC invoice). Each gets a recorded disposition, so the "All documents accounted for" step is automatic.
- **Outside filings identified:** FBAR (due 10/15/2026), late 2025 Forms 1099-NEC for two contractors, a possible unfiled 2023 Form 3520 (prior preparer's open item), and Ada's own return keeping "can be claimed". The Oregon and Arizona composites cover the state filings.
- **Prior preparer:** 2024 home office used 300 sq ft against measured 220 (immaterial, noted). S corp basis was "assumed sufficient". With the late 2023 K-1 the roll-forward is 21,300 → 15,400 → 2,300, and 2025 distributions exceed basis by 21,215.
- **Independent recomputes that agreed with the engine:** W-2 totals (D10 duplicate counted once), excess social security, the ISO AMT adjustment, Form 8938 values, S corp basis, footing of 128/133 sum lines (the 5 that don't foot are engine metadata gaps, listed), Brightpath's 260 lots tie to its summary to the cent, and books → Schedule C reconciles to the dollar.

## How the design surfaced them

1. **Checks run continuously against the workpaper value**, not the engine's. Fixing a line clears its finding. A later engine run that regresses reopens it. The SEP finding appears only after the Schedule C fixes, because it depends on them.
2. **Every finding shows expected vs actual, the lines, the evidence chips and the fix.** Clicking evidence opens the page with the field outlined.
3. **The document index shows where each document landed.** "Not on any line" is a status that needs a reason, which is how D73 (paystub) and D29 (duplicate interest) stood out.
4. **Agency records sit beside client statements** (three-way payment tables), so a "4,000 I think" can't silently become a payment.
5. **Cross-year comparison is built in.** Theo's SSN, the SEHI treatment and the home office all came from comparing 2025 against the 2024 return and the prior preparer's file.
