# M4 Vercel adapter and trusted HTTPS results

Date: 2026-09-12 (America/Chicago). Scope: the bounded local Vercel Express adapter package under issue #4.

Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** Broad issue #4 remains OPEN. This record describes implementation and verification; the canonical BUILD_ROADMAP remains the single roadmap.

Entry main/origin/main: `90fd95560fe3d9ea214bbf33f68ed5b33ba2d528`. The prior [hosting binding plan](MFP_M4_HOSTING_BINDING_PLAN.md) is retained as the historical source-reviewed design. Its “adapter not started” statements describe that earlier checkpoint, not the implementation recorded here. The preserved source archive and earlier runtime evidence remain intact.

## Delivered scope

The candidate retains React/Vite, Express, the existing physical document, saved revisions and workspace authorization. It adds a recognized root `app.ts` and extracts common API composition into `server/app.ts`. The hosted entry exports the initialized Express app without starting a listener or installing a Vite or disk-based SPA fallback. It explicitly selects Express production mode without requiring an undocumented hosted `NODE_ENV` default. The standalone entry retains its own listener, development setup and production static serving.

The dedicated `build:vercel` command builds the client and compiles the hosted application graph into a generated root `app.js`, with package dependencies left external for Vercel tracing. The original TypeScript remains authoritative. The Express builder selects the generated JavaScript entry; it does not need to repeatedly compile the full TypeScript graph. Only the generated client files enter the CDN `public` directory. Server code, documentation, evidence and private files remain outside it. Generated-file ownership records prevent a rebuild from overwriting unmanaged or edited `public` files or an edited `app.js`; symbolic links and unsupported output files are rejected. The existing standalone `dist` layout and build/start commands remain available.

The checked-in Vercel configuration selects the Express framework and provides explicit GET/HEAD SPA routes for `/`, `/quick-room`, `/physical-draft` and `/account/callback`. Unsupported methods for those routes receive 405. The SPA rule does not absorb API paths or missing assets. The generated artifact is checked for the filesystem route and the Express path-preserving catchall. Browser APIs remain relative to the same origin; no partner proxy or cross-origin API is added.

## HTTPS and session contract

Only server composition can opt into the hosted policy. The dedicated entry requires the server-side Vercel environment indicator and an exact configured HTTPS application origin. Before JSON parsing, routes or session processing, the guard requires single, nonambiguous Host, X-Forwarded-Host and HTTPS X-Forwarded-Proto values matching that origin and rejects a competing Forwarded header. Missing configuration fails closed. `express-session` accepts the guarded protocol only for that configured application instance. Ordinary standalone composition retains `proxy: false`, even if a request spoofs forwarding headers or the environment contains the Vercel flag. Global Express proxy trust is not enabled.

This is an entry-owned managed-ingress contract, not authentication based on a header or environment flag. Headers visible inside the adapter can be reconstructed or normalized; their raw-header count does not establish what an outside client originally sent. No fixed loopback peer address is assumed for the managed runtime. Actual Vercel edge overwrite/deduplication and transport behavior remain **NOT VERIFIED** until an explicitly authorized hosted check. The local proxy fixture cannot establish those facts. [Vercel request headers](https://vercel.com/docs/headers/request-headers)

Secure, HttpOnly, SameSite=Lax, Path=/ session cookies retain their existing `__Host-` name and lifetime. The existing OIDC state/nonce/PKCE flow, SID rotation, exact callback/origin, CSRF request checks, context generation, logout and old-context denial remain the application security boundary. Private API responses remain no-store and sanitized. Neither a platform login nor a successful HTTPS header check confers workspace access.

## Local artifact evidence and its limits

Vercel CLI **59.11.7**, running with Node **24.21.0**, produced a local build artifact for the **production target**. The compiled-entry log records successful completion, one traced function and six generated client assets. The top-level artifact metadata identifies the Vite 6.4.3 client build; the function metadata identifies Express 4.22.2, nodejs24.x and the app.js handler. Both are present; this is not a static-only application. This is local production-target packaging, not a preview or production deployment. No deployment, remote linking or provider provisioning is represented by that output.

The artifact acceptance test reads the generated configuration and function metadata, checks the actual Node 24 Express handler, inspects the static-file inventory, verifies SPA/API route separation and imports the traced handler cold. It checks that import does not start a listener, explicitly sets Express production mode even without NODE_ENV, handles repeated requests, retains unavailable-auth/denied-save behavior without bindings, and returns sanitized API/missing-asset errors. Routing metadata checks and a locally invoked function are evidence about the built artifact; they are not a substitute for executing Vercel's CDN and managed ingress.

The separate HTTPS/proxy/OIDC fixtures use disposable local SQL and synthetic identities. Their assertions cover secure-cookie continuity, callback replay rejection, SID rotation, saved revision/export authorization, a cold hosted-handler replacement with a pending login, CSRF/stale contexts and logout denial. Browser cases exercise sign-in while preserving an unapplied anonymous field exactly, no automatic upload, explicit save/reopen through SQL, and loss of access after logout. Only isolated test contexts are used; owner tabs and their storage are not test fixtures.

## Candidate attempts retained as history

These are separate candidate runs, not a combined final-suite pass:

| Recorded attempt | Actual result and correction |
| --- | --- |
| Initial candidate TypeScript check | Failed with TS1378 because the included root entry uses top-level await without an adequate target. The candidate now includes `app.ts` and targets ES2022. The fresh final check is recorded below. |
| Candidate standalone build | Passed; the existing client chunk-size warning remains. This is an earlier candidate build, not the final build receipt. |
| Initial hosted protocol run | 6 passed, 1 failed. The new test expected logout 204, while the existing API returns 200. The assertion was corrected to the existing contract; logout behavior was not changed to satisfy the test. |
| Second hosted protocol/browser attempt | Protocol 7/7 passed. Browser 1/2 passed: the cookie-rotation case examined cookies before the Account panel had completed its anonymous-session request. The fixture now opens Account and waits for Sign in to become enabled before recording the original cookie. |
| Targeted hosted browser retry | 2/2 passed after that wait; retained separately from the final full run. |
| Targeted hosting-policy tests | 5/5 passed. This targeted count is not added to final totals twice. |
| First offline CLI attempt | Built the six client files and reached TypeScript compilation; its recorded log contains no completed-build receipt. It is not reported as a successful artifact build. |
| Compiled-entry offline CLI build | Completed successfully using generated `app.js` with the Express builder. The preceding TypeScript-only attempt remains recorded. |
| Candidate artifact acceptance | Initially 5/6 passed; the cold-handler request received 400 instead of the expected 200. The fixture now uses Node HTTP requests to send the intended canonical Host header, rather than relying on fetch to retain that override. The corrected targeted artifact run passed 6/6. The fresh final artifact result is recorded separately below. |

Independent review also removed two unverified compatibility assumptions before the final run: a fixed managed-runtime loopback peer address and a requirement that the host supply NODE_ENV=production. The guard remains explicit; Express production mode is selected by the entry. Static ownership checks were extended to the output parent and metadata files. No prior failure is relabeled as a final pass.

The initial dependency install recorded 519 packages added, 520 audited and four moderate findings. The previous runtime record explains the retained development-tool advisory. This adapter record does not claim a fresh zero-vulnerability audit or change that prior exception; the final installation receipt is recorded below.

## Fresh final integration verification

Frozen final source: **344 files**, digest a85430f8660676bada4438d7590712f99c05a19681b9e3d65d1b91b64eaacbb0; **19 implementation paths changed**. All **344 source hashes MATCH** after the full sequence and canonical integration.

All 16 fresh final command groups PASS, including **192/192 main browser cases in 536.613 seconds**. Results below come from the current fresh sequence, with the main-browser outcome shown separately. Candidate counts above are not combined with these results. The packaging command must run with the actual generated artifact supplied; a skipped artifact case is not a full artifact pass.

| Command / group | Final actual result |
| --- | --- |
| `npm ci` | PASS, exit 0; four existing moderate audit findings |
| `npm test` | PASS, 693/693 |
| `npm run check` | PASS |
| `npm run build` | PASS; existing client chunk-size warning |
| `npm run build:vercel` | PASS |
| `npx playwright test --reporter=line` | PASS, 192/192; 536.613 seconds |
| `node --test tests/hosting/packaging.test.mjs` | PASS, 6/6; actual artifact supplied, zero skipped |
| `node scripts/run-hosting-tests.mjs` | PASS, 7/7 protocol HTTPS + 2/2 browser |
| `npm run test:runtime` | PASS, 5/5 |
| `npm run test:authorization:db` | PASS, 15/15 SQL |
| `npm run test:accounts:db` | PASS, 20/20 SQL |
| `npm run test:accounts` | PASS, 32/32 HTTPS + 8/8 browser |
| `npm run test:physical:db` | PASS, 42/42 SQL |
| `npm run test:physical` | PASS, 37/37 HTTPS + 24/24 browser |
| `npm run test:journal` | PASS, 17/17 browser |
| `npm run test:autosave` | PASS, 15/15 integration |
| Working-tree and staged Git whitespace checks | PASS for the 19-path implementation commit; documentation checks recorded with the containing publication |

Separate development smoke on the frozen source passed **5/5**: frontend HTML, Vite client, transformed React entry, unavailable protected APIs without bindings and rejection of a synthetic external Host. The disposable listener was cleaned up. This result is separate from the final sixteen groups. [Development receipt](evidence/m4-vercel-adapter/development-smoke.json).

[Artifact identity and acceptance receipt](evidence/m4-vercel-adapter/artifact-summary.json): generated handler and all six client files match their packaged copies. Builder versions were Express 7.0.2, Node 12.0.1 and build-utils 14.9.1; the offline build blocked network access, used settings-only fixtures without project/organization identities or provider credentials, and skipped installation only because the isolated locked dependencies were already installed. The TypeScript-only tracing attempt was deliberately stopped while CPU-active; it is INCOMPLETE_STOPPED, not a pass.

Canonical integration: **344 source hashes MATCH**; the exact 19-path implementation is committed. Working-tree and staged implementation whitespace checks PASS. A fresh archive of the actual canonical implementation commit matches all **344** source files before and after the separate post-integration checks. Those **five command groups PASS**: fresh `npm ci`, standalone build, hosting build, **5/5 runtime** and **7/7 hosted protocol + 2/2 browser**. All **18 generated files** match the frozen tested output: the hosted handler, six public client files and eleven standalone dist files. [Verification and integration receipts](evidence/m4-vercel-adapter/verification.json), [source manifest](evidence/m4-vercel-adapter/final-source.json).

That smoke ran in an isolated committed-source archive, not by rewriting the canonical dependency/build directories or operating on an owner tab. All eleven prior canonical dist files remain unchanged; this result does not claim that an old review origin now serves the new adapter. No new persistent review address is advertised. The verified disposable PostgreSQL fixture was stopped after the checks. Stash and original-archive hashes remain unchanged. The synthetic [hosted saved-plan screenshot](evidence/m4-vercel-adapter/hosted-saved-plan.png) records fixture data only.

Implementation commit: **f3360d25ee0791ebe569c055e9003e1894a69c65**. Documentation commit: **the commit containing this finalized record**. The issue #4 publication receipt records its SHA, GitHub main containment and local/remote synchronization after ordinary non-force push and confirmation. No existing implementation commit or historical source is rewritten by this record.

## Compatibility and remaining release gates

- **Not deployed.** No hosted domain, project linkage, TLS termination, real OIDC provider, managed function restart or provider database binding has been verified. Isolated fixture origins contain synthetic test data, not the owner's previous drafts; no new persistent review origin is claimed.
- Before a future authorized deployment, verify the exact product project and canonical origin, All Deployments protection and owner access across HTML, assets, aliases and API methods. The Vercel environment indicator depends on system-variable exposure; the project must supply it. Platform protection remains separate from application principal/workspace authorization.
- Verify the live ingress headers and secure session/callback behavior rather than inferring them from the local adapter. Supabase OAuth-server beta selection, its confidential client and bounded login/consent UI remain separate work described by the historical binding plan.
- The official Vercel limit currently remains **4.5 MB for request and response bodies**. The documented large-function beta concerns bundle size; no 100 MB payload promise is made. The existing 4 MB physical JSON parser remains unchanged. Largest supported request envelopes and rendered quantity/drawing reports still need measured hosted-limit acceptance before release; do not silently truncate them. [Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size)
- Provider transaction pooling, verified TLS for both SQL drivers, bounded instance connection budgets, empty-database bootstrap, runtime privileges and Data API exposure controls remain unimplemented in this adapter package. No database migration or live data operation is part of this work.
- Existing bundle-size and recorded development-tool audit warnings remain explicit. No framework rebuild, object schema, billing, partner integration or M5 work is included.

## Single next bounded task

**Issue #4: database provider compatibility, empty-database bootstrap and grants — NOT STARTED.** Treat this as one local, reviewable assignment for the selected provider contract: both drivers' pool/TLS behavior, transaction-pooler compatibility, a separately reviewed empty-database bootstrap preserving existing migration history, and least-privilege runtime/Data API grant rules. Verify it with disposable tests. Do not apply it to a live database or provision a provider as an implied next step.

The wider hosting/provider/authentication release gates remain open after this adapter slice. Owner tabs, independent drafts, Quick Rooms state, stash, archives and source originals remain protected. **NOT DEPLOYED.**
