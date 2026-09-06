# Modern Floor Planner

A room-first measurement and quantity application: enter room dimensions and openings, select the work, and see a synchronized sketch with explainable quantities.

## Build from the roadmap

Start with the [executable build roadmap](docs/BUILD_ROADMAP.md), then the [September 6 source audit and research](docs/RESEARCH_AND_AUDIT_2026-09-06.md). M1 implementation and recorded verification are tracked in [MFP-M1 / issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2).

Current planning baseline: `876968e78d7070775e7924f33a3164ba20905d42`. Roadmap publication does not mean its milestones are implemented, tested or deployed. The historical app is being improved incrementally, not replaced wholesale.

Contributors: read [AGENTS.md](AGENTS.md), [ECOSYSTEM.md](ECOSYSTEM.md), the [My Way workflow](docs/ecosystem/MY_WAY_WORKFLOW.md) and [product ecosystem mapping](docs/ecosystem/PRODUCT_ROADMAP.md). Read [opening behavior documentation](DOORS_AND_WINDOWS.md) before changing doors/windows. Verify the existing checkout and preserve unpublished local work.

Existing stack: React/TypeScript/Vite frontend; Express/PostgreSQL/Drizzle backend. M1 local checks are documented below. The owner confirmed the app is not hosted yet; Vercel setup and a real database binding remain future work.

Modern Floor Planner owns geometry and quantities. FixDoneNow coordinates jobs; LedgerLine owns financial estimates; ProjectRoll owns media. Standalone use must remain independent.

## Reproducible M1 checks

Use Node **20.20.2** (`.nvmrc`; npm 10.8.2 used for verification). The historical
Replit configuration specifies Node 20. Tests also run on Node 24.11.1.

```sh
npm ci
npm test
npm run check
npm run build
npx playwright install chromium
npm run test:browser
```

`npm test` runs pure calculation/recovery and real HTTP route regression tests.
`npm run test:browser` builds the app, starts a disposable server on
`127.0.0.1:4173`, runs Chromium acceptance, and stops that server. It uses the
real API handlers with in-memory storage; it never connects to a database.
No staging environment is required. Local failure traces/screenshots appear
in `test-results/`; the HTML report is in `playwright-report/`.

For the actual app, the existing `npm run dev` / `npm run start` commands use
PostgreSQL through `DATABASE_URL` and the existing port 5000 configuration.
Production start retains the host's POSIX command syntax. The app is not hosted yet. When first deployment is assigned, configure credentials
through the approved host's secret settings, not committed files. Do not run
`db:push` as part of M1 verification. The current routes have no authenticated
workspace scope; **do not onboard customers or partners** until the M4 gate passes.

Read [M1 results and release limits](docs/MFP_M1_RESULTS.md) before interpreting
local tests as deployment or real-database evidence.
