# Miraflores workpaper — Okafor-Lindqvist 2025

A web-native tax workpaper for one complex household: click any number to see where it came from, how it was built, who checked it and what's still open.

- **Core idea & data model:** [docs/01-core-idea-and-data-model.md](docs/01-core-idea-and-data-model.md)
- **Errors found and how they surfaced:** [docs/02-errors-found.md](docs/02-errors-found.md)
- **Approach, decisions, tools:** [docs/03-approach-decisions-and-tools.md](docs/03-approach-decisions-and-tools.md)
- **Video script:** [docs/04-video-walkthrough-script.md](docs/04-video-walkthrough-script.md)

## Try it

**Live:** https://miraflores-workpaper-one.vercel.app/ — shared by everyone with the link (work syncs within a few seconds).

- Switch people with the name menu (top right): preparer, reviewer, partner, a preparer without clearance, the firm administrator, the quality reviewer, both clients and the IRS examiner.
- **Load a morning of demo work** (Overview) adds a realistic review in progress.
- **Fast-forward the review (demo)** (Review & filing) does the remaining staff work, attributed per person, so the partner sign-off, client 8879, e-file (including the rejection if Theo's SSN isn't corrected), freeze and amendment can be shown quickly.
- **Reset to the packet as delivered** (bottom of the Overview) clears all work for everyone.
- The season clock (top bar) replays the packet's timeline, up to the 2028 IRS letter.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # runs every independent check on the packet and applies every proposed fix
npm run build      # production build in dist/
```

The packet is served unchanged from `public/packet.json`. Use the role switcher (top right) to work as the preparer, reviewer, partner, a preparer without clearance, the firm administrator, the quality reviewer, either client, or the IRS examiner. The season clock (top bar) replays the packet's timeline.

## Deploy to Vercel

Either:

1. Push this folder to a GitHub repository, then in Vercel choose **Add New → Project → Import** that repo. Vercel detects Vite (`vercel.json` sets `npm run build` → `dist`). Deploy.
2. Or from this folder: `npx vercel deploy --prod` (log in when prompted).

**Optional multi-user sync:** in the Vercel project add the **Upstash Redis** (Vercel KV) integration. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`, and `api/events.js` then shares one event log across everyone using the link. Without it, work is saved in each browser (localStorage) and synced across tabs; Firm → Data lets you export or import the event log.

## Layout

```
public/packet.json        the packet, as delivered
src/packet.ts             indexing; sign inference and re-footing of sum lines
src/model.ts              event types, reducer, roles and permissions
src/effective.ts          workpaper return = engine + adjustments; tax effects
src/checks.ts             independent checks (the error list)
src/refs.ts               one resolver for every reference; sensitive-data masking
src/store.ts              event log persistence, cross-tab and optional server sync
src/views/*               Overview, Findings, Area, Inspector, Documents, Schedules,
                          Adjustments & versions, People, Filing, Firm, Timeline, Client, Examiner
api/events.js             optional shared event store (Vercel + Upstash)
tests/checks.test.ts      every check against the packet; fixes turn findings green
```
