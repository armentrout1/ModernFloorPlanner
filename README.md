# Modern Floor Planner

A room-first measurement and quantity application: enter room dimensions and openings, select the work, and use the synchronized physical sketch and explainable quantities. React/TypeScript/Vite remains the frontend; Express, PostgreSQL and Drizzle remain the backend.

## Current build and roadmap

Use the [canonical build roadmap](docs/BUILD_ROADMAP.md) for the current assigned task and release gates. Local physical editing, quantities, building-layout tools, authorized saved revisions, recovery, reports and project lifecycle have recorded implementation evidence. The bounded [issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4) runtime work is complete locally; its [results](docs/MFP_M4_RUNTIME_READINESS_RESULTS.md) retain the verification. The [owner-hosting plan](docs/MFP_M4_HOSTING_BINDING_PLAN.md) now selects compatible Vercel packaging and recommends dedicated Supabase PostgreSQL, with provider decisions and live gates explicit. The bounded Vercel Express adapter is complete and verified locally; [adapter results](docs/MFP_M4_VERCEL_ADAPTER_RESULTS.md) record the actual verification and remaining gates. The next bounded task after publication is database provider compatibility, empty-database bootstrap and grants, which has not started.

**NOT DEPLOYED.** Live identity-provider/client registration, trusted HTTPS origin and production PostgreSQL binding remain unverified. Local acceptance is not deployment or permission to onboard customers. The broad hosting/readiness issue remains open after its bounded runtime work.

Contributors must read [AGENTS.md](AGENTS.md), [ECOSYSTEM.md](ECOSYSTEM.md), the [My Way workflow](docs/ecosystem/MY_WAY_WORKFLOW.md) and [product ecosystem mapping](docs/ecosystem/PRODUCT_ROADMAP.md). Read [opening behavior](DOORS_AND_WINDOWS.md) before changing doors/windows. Verify the actual checkout, branch, remote, working tree and other writers; preserve unpublished work, owner tabs/drafts/storage, stash and archives. Use isolated test sessions rather than the owner's open sketches or protected review origins.

Modern Floor Planner owns geometry and quantities. FixDoneNow coordinates jobs; LedgerLine owns financial estimates; ProjectRoll owns media. Standalone use remains independent.

## Runtime and reproducible checks

Use **Node 24.21.0** from `.nvmrc` and **npm 11.19.0** from `packageManager`. `package.json` declares Node `24.x` and npm `11.x`. The runtime receipt and current dependency/check results are in [runtime readiness results](docs/MFP_M4_RUNTIME_READINESS_RESULTS.md). Use the committed lockfile with `npm ci`.

```sh
node --version
npm --version
npm ci
npm test
npm run check
npm run build
npx playwright install chromium
npx playwright test --reporter=line
npm run test:runtime
```

`npm run test:browser` is the convenience command that builds before running the main Playwright suite. It starts isolated fixture/parity/denial servers on ports 4173–4175 and stops them afterward; it does not reuse an existing server. Traces/screenshots are written to `test-results/` and the HTML report to `playwright-report/`. The dedicated account, physical-persistence, journal and Autosave suites have separate commands and isolated configuration; see their recorded results before treating a main-browser pass as a full integration pass. Database suites require an explicitly verified disposable local test database, never live/customer records.

`npm run test:runtime` exercises actual compiled `npm start`, static assets/direct links and fail-closed API behavior on its own loopback listener. Run it after building. A separate production-only dependency installation is also part of the bounded readiness verification; current evidence belongs in the result record. No mandatory staging environment is introduced.

## Run locally

`npm run dev` serves the Express application with Vite development middleware. `npm run dev:frontend` serves only Vite at `127.0.0.1:5173`; it does not stand in for the authenticated Express/API composition. Avoid launching either on an occupied or protected owner-review origin.

The application accepts `HOST` and `PORT`. Defaults are `0.0.0.0` and `5000`; use loopback explicitly for a local session. Invalid listener settings exit instead of silently selecting another port. For example, after choosing an unused local port:

PowerShell:

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '5000'
npm run dev
```

POSIX shell:

```sh
HOST=127.0.0.1 PORT=5000 npm run dev
```

For the compiled application, build first and then run `npm start` with the same listener settings:

```sh
npm run build
npm start
```

`npm start` uses a portable Node entry point that sets production mode before importing the compiled server; it does not require POSIX environment-assignment syntax. Production static serving is separate from Vite's development imports. The built app serves `/`, `/physical-draft` and `/quick-room` directly; API routes are evaluated before the single-page fallback, and absent scripts/styles return 404. Startup does not apply database migrations.

## Vercel adapter build and acceptance

The dedicated hosted entry exports Express without starting the standalone listener. `npm run build:vercel` compiles that handler and builds the existing Vite client for CDN packaging; the standalone `npm run build` / `npm start` path remains separate. Generated `app.js`, `public` and their ownership records are build outputs, not alternative source files. A build refuses to overwrite unmanaged or edited generated output.

```sh
npm run build:vercel
npm run test:hosting:packaging
npm run test:hosting
```

The packaging suite's actual-artifact case requires `MFP_VERCEL_ARTIFACT_ROOT` pointing to an isolated generated Vercel artifact. Without it that case is skipped, so a plain packaging run is not full artifact acceptance. The hosting integration suite requires the verified disposable PostgreSQL fixture and uses isolated HTTPS/proxy/OIDC/browser sessions; it must not use owner tabs or live credentials. See the [adapter record](docs/MFP_M4_VERCEL_ADAPTER_RESULTS.md) for the offline production-target CLI build and exact command-group results.

The hosted policy requires the exact configured HTTPS origin and platform environment indicator, rejects ambiguous host/protocol metadata before sessions, and is enabled only by the hosted entry. Standalone forwarding headers do not enable proxy trust. Neither local packaging nor simulated HTTPS proves live Vercel header sanitization or owner-only protection. The [historical binding plan](docs/MFP_M4_HOSTING_BINDING_PLAN.md) records the remaining provider, deployment-protection and real callback requirements. No deployment command is part of these local checks.

## Authentication and persistence boundaries

The normal application can display local-draft editing without a configured identity provider. In that state, the session reports unavailable and protected saved-plan APIs fail closed; a local page or known plan ID grants no account access. Current account/workspace/member checks, append-only revisions, export authorization, archive/restore and explicit recovery are documented in [M4A account results](docs/MFP_M4A_SESSIONS_ACCOUNTS_RESULTS.md), [M4B Save/Open results](docs/MFP_M4B_SAVE_OPEN_RESULTS.md) and [M4C lifecycle results](docs/MFP_M4C_PROJECT_LIFECYCLE_RESULTS.md).

Account persistence requires approved server-side `DATABASE_URL` and the complete validated OIDC/session configuration, including issuer/client, trusted HTTPS application origin/callback and session secret. Use the established server configuration boundary and approved secret handling; do not put credentials in client code or committed files. Database access is explicit and does not fall back to ambient PostgreSQL defaults. Do not run `db:push` or apply migration files against a live/unidentified database as part of local startup or this readiness task. Real provider/host/database setup and customer onboarding remain separate release work.

## Historical references

The original planning baseline was `876968e78d7070775e7924f33a3164ba20905d42`; see the [September 6 audit](docs/RESEARCH_AND_AUDIT_2026-09-06.md) and [M1 results](docs/MFP_M1_RESULTS.md). Earlier checks used Node 20.20.2/npm 10.8.2, and historical `.replit` metadata still names Node 20. Those records are historical, not the current `.nvmrc`/`packageManager` contract or a verified deployment binding. The earlier M1 finding of unscoped routes predates the recorded M4 authorization work and must not be read as current runtime behavior.

The additive measurement boundary began in `shared/domain` and `shared/compatibility/legacyDocument.ts`; [M2A results](docs/MFP_M2A_RESULTS.md) describe that initial adapter. Later engine, selected-quantity, shared physical-document and saved snapshot behavior is recorded in the canonical roadmap. Old “future work” statements in milestone reports preserve their original dates; they do not override current completed checkpoints.
