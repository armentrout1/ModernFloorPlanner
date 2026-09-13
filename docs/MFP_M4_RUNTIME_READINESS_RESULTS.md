# M4 runtime and dependency readiness — verification record

Assigned bounded slice: [issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4), runtime/dependency readiness only.
Entry canonical main: `ed24d88b13b485d5ff538bf580aeec34dc2b2adb`.
Record date: **2026-09-12**.
Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED**.
Implementation commit: `cf2bdc0c9c662d5cf56abf8a5fca7ba2e945c7d5`.
Documentation publication: **the commit containing this record; the GitHub receipt is recorded in #4 after ordinary push and remote confirmation**. Publication is not assumed by this local record.
Final frozen source: **330 files**, digest `24f5aeb137ed5f6bbdb1e47734af04552b621e7fe9c98ab3b575148243957445`; **13 changed implementation/configuration/test paths**. All **13 fresh final command groups PASS** and all **330 source hashes MATCH** after the sequence. The exact 13-path package is integrated and committed with all **330 hashes MATCH**; separate canonical install/build, **5/5 runtime** and **5/5 normal-review smoke** PASS. All **11 canonical compiled files MATCH** the tested build.

The owner assigned a bounded runtime and dependency-readiness build after local M4C project lifecycle. The implementation completed a fresh full verification in an isolated source copy and was integrated unchanged. Implementation `cf2bdc0c9c662d5cf56abf8a5fca7ba2e945c7d5` retains that exact tested source; separate canonical verification passes. Normal GitHub publication is established by the later issue receipt, and no deployment is claimed. The canonical roadmap remains the only product sequence. No application framework rebuild, hosting configuration, provider registration, paid provisioning, live database change, migration application to production, customer onboarding or M5 work is included. The broad #4 issue remains open for its unresolved release gates.

Prior lifecycle implementation `4a3a321e23726ac13ad20185f5a17429af0ae601` and documentation `ed24d88b13b485d5ff538bf580aeec34dc2b2adb` remain the entry history. Their [results](MFP_M4C_PROJECT_LIFECYCLE_RESULTS.md) and earlier captured-document/account/export evidence are preserved; the earlier Node 20 and lifecycle test counts are not current runtime-build passes. Owner tabs, drafts, storage, protected review origin 5193, stash, archives and source originals remain untouched by isolated testing.

## Runtime pin and provenance

The selected runtime is **Node 24.21.0**, npm **11.19.0**. `.nvmrc` supplies the exact Node version; package engines declare Node `24.x` and npm `11.x`; `packageManager` declares `npm@11.19.0`. The portable Windows x64 archive was verified against the official [Node release SHA-256 manifest](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt): `node-v24.21.0-win-x64.zip`, SHA-256 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`. This verifies the downloaded runtime artifact; the fresh full compatibility checks on that runtime pass as recorded below.

No machine-wide runtime replacement is claimed. Historical Node 20 checks and `.replit` metadata remain historical, not a verified hosted configuration. The README now distinguishes the project pin, current local behavior and old audit statements.

## Scoped dependency work

The scoped updates preserve React/Vite/Express/Drizzle and the physical document/API contracts. The frozen lockfile resolves Vite **6.4.3**, Express **4.22.2**, Drizzle ORM **0.45.2**, Drizzle Kit **0.31.10**, drizzle-zod **0.7.0**, direct esbuild **0.25.0**, tsx **4.23.13**, PostCSS **8.5.28**, ws **8.21.3** and the Vite React plugin **4.7.0**. An Express-scoped override resolves the actual runtime `qs` node to **6.16.0**, compatible with body-parser 1.20.8. `tailwindcss-animate` and the Replit theme JSON plugin are development/build dependencies. No incompatible forced dependency fix or framework replacement is introduced.

The baseline audit contains **26 affected entries** (14 high, 10 moderate, 2 low). The final frozen-source install/audit reports **four moderate affected entries**, with zero high, low or critical findings. A separate `npm ci --omit=dev` installation added **307 packages / 308 audited** and its production-only audit reported **zero vulnerabilities**. This is an audit result for that dependency installation, not a guarantee of zero defects or a production deployment.

**Known tooling-only residual:** the four entries trace one [esbuild development-server advisory, GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), through `drizzle-kit@0.31.10` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → nested `esbuild@0.18.20`. All four lock nodes are development-only. The advisory concerns permissive development-server CORS. Independent installed-source review found core-utils using `transform`/`transformSync`, not `serve`/`context`; production server source imports neither Kit nor esbuild. Retain the residual as a build/migration-tool exception and do not expose that vulnerable serve API. npm's proposed fix downgrades Kit to 0.18.1 across the supported setup, so no force fix was applied. The direct build esbuild is patched at 0.25.0; the nested tooling copy remains explicitly unresolved.

| Dependency / audit evidence | Current recorded result |
| --- | --- |
| Frozen direct/overridden versions | Exact versions above; lockfile is in the 330-file frozen source |
| Before full audit | 26 affected entries: 14 high / 10 moderate / 2 low |
| Final full audit and fresh install | Four moderate affected entries, one nested tooling advisory; no high/critical/low |
| Separate production-only install/audit | 307 packages installed / 308 audited; zero vulnerabilities |
| Production-only actual compiled startup | **5/5 PASS** with Vite, React plugin, tsx and esbuild absent |
| Final full-tree audit receipt | Four moderate affected entries; zero high, critical and low |


## Portable startup and static/API behavior

The implemented `npm start` uses `scripts/start-production.mjs`, a Node entry point that sets production mode before importing `dist/index.js`. It works without POSIX-only inline environment assignment. Production static serving moves into a module without Vite development imports; development middleware remains a conditional import, with esbuild code splitting retaining the separate compiled module. Listener startup removes `reusePort` for portable behavior. The production-only dependency test confirms compiled startup without Vite, its React plugin, tsx or esbuild installed at runtime.

`HOST`/`PORT` have explicit defaults (`0.0.0.0` / `5000`) and validated values. The README uses loopback for local examples. Invalid settings exit with sanitized errors rather than falling back silently; listener failure exits observably with a sanitized error. Startup itself performs no migration. The local static shell does not require live database/provider configuration, and protected API access remains unavailable until complete validated configuration exists.

Built assets and direct SPA links work while API routes retain priority. Missing assets and non-GET page requests return 404 rather than successful SPA HTML. Unknown API routes retain JSON 404, protected APIs fail closed without bindings, and malformed JSON errors remain sanitized. The five runtime cases passed in earlier attempts and separately against the production-only installation. The third fresh full sequence independently passed all five runtime cases; earlier attempts remain separate. Eleven compiled files in the production-only installation match the tested build. A separate development smoke also passed 5/5 checks: development HTML/source entry, Vite client, React transform under Node 24, unavailable protected APIs without bindings and Vite rejection of a synthetic external Host header. Its owned test listener was cleaned up. These checks do not establish hosting or a live authentication/database binding.

## Fresh verification

The **third fresh 13-group sequence completed with every group exiting 0** against the final frozen 330-file source after the test-only race repair. All **330 source hashes MATCH** after the run. Both earlier attempts remain incomplete; none of their passes or targeted repeats are combined into this fresh full result. The external receipt parser was corrected to read Unicode Node test summaries; that correction changed no application/test source or recorded test outcome.

| Command or evidence | Actual current result |
| --- | --- |
| Node/npm version and official runtime hash | Node 24.21.0 / npm 11.19.0; official archive SHA verified |
| `npm ci` | PASS; 519 packages installed / 520 audited; four moderate findings |
| `npm test` | **688/688 PASS** |
| `npm run check` | PASS |
| `npm run build` | PASS; existing large-chunk warning retained |
| `npx playwright test --reporter=line` | **192/192 PASS**, unfiltered main browser; 547.596 seconds |
| `npm run test:authorization:db` | **15/15 PASS** |
| `npm run test:accounts:db` | **20/20 PASS** |
| `npm run test:accounts` | **32/32 HTTPS + 8/8 browser PASS** |
| `npm run test:physical:db` | **42/42 PASS** |
| `npm run test:physical` | **37/37 HTTPS + 24/24 browser PASS** |
| `npm run test:journal` | **17/17 browser PASS** |
| `npm run test:autosave` | **15/15 PASS**; 90.496 seconds |
| `npm run test:runtime` | **5/5 PASS** |
| Separate `npm ci --omit=dev` installation and production-only startup suite | **Install PASS; audit zero; 5/5 startup cases PASS**; Vite/React plugin/tsx/esbuild absent |
| Final dependency audit and remaining findings | Four moderate tooling-only entries; zero high/critical/low; separate production-only audit zero |
| Working/staged whitespace | **PASS across the 13 implementation paths**; documentation checks are recorded with publication |
| Exact tested / integrated / committed source equality | **330/330 MATCH** in integrated and committed source |
| Separate canonical install/build/runtime and fresh-origin smoke | **Install/build PASS; 5/5 runtime PASS; 11/11 compiled files MATCH; 5/5 normal-review smoke PASS** |
| Documentation/publication receipt | Commit containing this record; #4 receipt after ordinary push and remote confirmation |

**Historical attempts:** the first full attempt passed 688 unit, typecheck, build and five runtime cases but authorization SQL passed only **14/15** because the upgraded ORM wraps database errors. Its browser run was cancelled; that attempt is not a full pass. Candidate authorization/account SQL then passed **15/15** and **20/20**. A separate physical SQL attempt passed **41/42**: the synthetic lifecycle-failure assertion read the outer ORM error instead of its cause. Three SQL test files now inspect the Drizzle cause and preserve exact PostgreSQL SQLSTATE checks (`23505`, `23514`, `23503`) plus injected messages and `P0001`. This adapts tests to error wrapping without changing application behavior or weakening the expected database failures. The initial attempt and candidate failure logs remain separate from the completed fresh final sequence.

**Second incomplete attempt and bounded test repair:** the second attempt passed **37 physical HTTPS cases** but only **23/24 persistence browser cases**. The late-list-response acceptance case armed its delayed route before the automatic post-archive refresh settled, then waited on a disabled Refresh control. Its main browser run was also cancelled, so this attempt is not a full pass. The narrow `tests/persistence/project-lifecycle.spec.ts` repair waits for the archived row to leave the active list, loading to finish and Refresh to become enabled before arming the route; both delayed gates are released unconditionally and promise waits are bounded. Original behavioral assertions remain intact. The targeted repeat passed **3/3 in 11.2 seconds**. No application behavior changed for this repair. The completed third sequence used the final digest above and independently passed every group, rather than combining either failed attempt with targeted results.

Database integration checks use only the verified disposable local PostgreSQL cluster and synthetic records. No new schema/migration is required by this runtime slice. Existing migrations may be exercised there for compatibility, never applied to a live database. Owner browser tabs/storage and old review origins are excluded from all test flows.

## Integration and publication

The exact **13-path** package was integrated into canonical `main` after current root/remote/branch/upstream, working-tree and writer checks. Only the verified old Modern Floor Planner **PID 37160 on 5193** was stopped before integration; that origin was not restarted. Owner tabs were not inspected, reloaded, closed or operated. Drafts/storage, independent work, stash, archives and source originals remain preserved.

Implementation **`cf2bdc0c9c662d5cf56abf8a5fca7ba2e945c7d5`** contains the unchanged tested package. All **330 integrated and committed source hashes MATCH** the final frozen digest; working/staged Git whitespace checks pass for the implementation. The separate canonical `npm ci` and build pass, **5/5 runtime checks pass**, and all **11 compiled files match the tested build byte for byte**. The committed-source and integrated-build receipts record this equality. The full isolated sequence is reused on unchanged source; these canonical checks are additional acceptance, not a second full sequence.

The new review is the **actual compiled application**, running Node 24 with `node scripts/start-production.mjs` as **PID 2616** from the verified canonical working directory. Its address is **[http://127.0.0.10:5194/physical-draft](http://127.0.0.10:5194/physical-draft)**. It is not a helper health server and does not contain previous owner drafts. A fresh isolated headless session passes **5/5 normal-review smoke checks**:

1. The exact canonical build and its static assets are served.
2. Normal unconfigured authentication reports unavailable and issues no session cookie.
3. Protected APIs fail closed rather than exposing saved data.
4. The unfinished synthetic height text **`9 ft -`** remains intact.
5. Zero page errors and zero browser API mutations; no owner origins visited.

The sanitized screenshot was visually inspected. Local compiled startup and synthetic smoke do not verify live provider/database or hosted routing. The earlier protected review origin stays stopped and the fresh review address does not transfer storage or sketches.

The documentation publication is **the commit containing this record**. The [#4](https://github.com/armentrout1/ModernFloorPlanner/issues/4) receipt records ordinary non-force push, implementation/documentation presence on GitHub main, documentation whitespace, synchronization and any remaining working-tree changes after remote confirmation. This local record does not invent a documentation SHA or claim that remote receipt already exists. No reset, force push, unrelated integration or safeguard bypass is included. The bounded runtime/dependency slice is **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED**; broad **issue #4 remains OPEN** for its remaining hosting/provider/origin/database gates.

## Remaining release gates and next bounded task

**NOT DEPLOYED.** Live identity-provider/client registration, trusted HTTPS origin/callback, hosting/static/API deployment configuration, permitted production PostgreSQL identity/persistence, legacy saved-plan ownership and actual production release smoke remain unresolved. Current isolation/synthetic tests do not establish those live bindings or customer readiness.

After runtime/dependency publication, the single next task is **#4 protected owner-hosting configuration and binding plan**: confirm Vercel entry/static/API routing, trusted HTTPS/OIDC configuration and an allowed PostgreSQL provider. It remains separately assigned and **NOT STARTED**. Owner configuration and explicit authority are required before live provider/host/database actions. This plan does not itself authorize paid provisioning, live migrations, deployment, onboarding or M5. The broad #4 issue remains open until its remaining permitted gates are actually resolved.
