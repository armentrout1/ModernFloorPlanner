# Modern Floor Planner

A room-first measurement and quantity application: enter room dimensions and openings, select the work, and see a synchronized sketch with explainable quantities.

## Build from the roadmap

Start with the [executable build roadmap](docs/BUILD_ROADMAP.md), then the [September 6 source audit and research](docs/RESEARCH_AND_AUDIT_2026-09-06.md). The first prepared implementation task is [MFP-M1 / issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2).

Current planning baseline: `876968e78d7070775e7924f33a3164ba20905d42`. Roadmap publication does not mean its milestones are implemented, tested or deployed. The historical app is being improved incrementally, not replaced wholesale.

Contributors: read [AGENTS.md](AGENTS.md), [ECOSYSTEM.md](ECOSYSTEM.md), the [My Way workflow](docs/ecosystem/MY_WAY_WORKFLOW.md) and [product ecosystem mapping](docs/ecosystem/PRODUCT_ROADMAP.md). Read [opening behavior documentation](DOORS_AND_WINDOWS.md) before changing doors/windows. Verify the existing checkout and preserve unpublished local work.

Existing stack: React/TypeScript/Vite frontend; Express/PostgreSQL/Drizzle backend. Runtime installation, environment and production-binding instructions must be verified in M1; this documentation update makes no new deployment claim.

Modern Floor Planner owns geometry and quantities. FixDoneNow coordinates jobs; LedgerLine owns financial estimates; ProjectRoll owns media. Standalone use must remain independent.
