# M4 database compatibility, bootstrap and runtime privilege results

Date: 2026-09-12 (America/Chicago). Scope: the bounded local database-readiness package under [issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4).

Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** All 18 fresh integration command groups PASS. Broad issue #4 remains OPEN. All seven separate post-integration groups also PASS against the archive of the committed implementation. [Verification and preservation receipt](evidence/m4-database-readiness/verification.json). It is an evidence record; [BUILD_ROADMAP](BUILD_ROADMAP.md) remains the single roadmap.

Entry main/origin/main: `1e2cbe5e327ec04e55b69c192508939b5b404097`. The prior [Vercel adapter results](MFP_M4_VERCEL_ADAPTER_RESULTS.md) and [hosting binding plan](MFP_M4_HOSTING_BINDING_PLAN.md) remain historical records. The adapter's earlier “database task not started” statements do not describe this newly authorized package. No previous verification count is presented as a fresh pass for changed source.

## Bounded implementation

One server-only parser supplies explicit host, numeric port, user, password, database and TLS options to the existing Postgres.js application connection and node-postgres session pool. Neither driver receives a raw connection string to reinterpret. This avoids node-postgres's documented behavior in which connection-string SSL parameters replace the separately supplied SSL object. [node-postgres SSL configuration](https://node-postgres.com/features/ssl) The application retains React/Vite/Express, the existing OIDC/session design, server-side workspace authorization, document schemas, quantities, saved revision/lifecycle behavior and recovery. Existing migration files 0001–0004 are preserved rather than rewritten.

Database transport and role permissions are separate from deployment or owner identity. This package does not provision a provider, apply SQL to live data, introduce an account engine, create customer accounts, change the physical document, or activate M5.

## Explicit connection contract

| Setting | Implemented meaning |
| --- | --- |
| `DATABASE_URL` | Explicit `postgres:` or `postgresql:` URL with host, user and database; port defaults to 5432. Credentials are decoded once. An omitted password is explicitly empty, without borrowing `PGPASSWORD` or a pgpass file. Encoded leading/trailing password spaces remain significant. |
| `MFP_DATABASE_CONNECTION_MODE` | `direct` or `transaction`; omitted defaults to `transaction` when `VERCEL=1`, otherwise `direct`. The value is explicit configuration, not inferred from a Supabase/Railway hostname or port. |
| `MFP_DATABASE_APP_MAX` | Integer 1–20. Default 1 in the Vercel environment and 10 for standalone compatibility. Bounds the Postgres.js pool per application instance. |
| `MFP_DATABASE_SESSION_MAX` | Integer 1–20. Default 1 in the Vercel environment and 5 for standalone compatibility. Separately bounds node-postgres sessions per application instance. |
| `MFP_DATABASE_CA_CERT` | Optional PEM certificate bundle, validated before either pool is created. Literal file paths, empty/malformed bundles and a CA combined with plaintext mode are rejected. No CA file or secret is fetched automatically. |

The only accepted URL query parameter is a single `sslmode`. `require` and `verify-full` both deliberately select full certificate and configured-hostname verification. This strengthens PostgreSQL clients' sometimes weaker interpretation of `require`; it never means “encrypt without checking identity.” Duplicate SSL parameters, conflicting options, unsupported parameters and downgrade modes fail closed. Host/user overrides, connection options and certificate-file query parameters are not accepted.

Without `sslmode`, only the exact loopback hosts `localhost`, `127.0.0.1` and `::1` use plaintext for existing local fixtures. Every other hostname/address defaults to verified TLS. Explicit `sslmode=disable` is accepted only for those exact loopback hosts. Loopback TLS can be requested with `sslmode=verify-full`. Verified connections explicitly set `rejectUnauthorized: true` and `checkServerIdentity` against the configured hostname/address. DNS connections send that hostname as SNI `servername`; literal IP connections omit SNI while retaining explicit certificate-IP identity verification, avoiding Node's IP-SNI deprecation warning. A verified configuration is rejected when `NODE_TLS_REJECT_UNAUTHORIZED=0`; no permissive retry or plaintext fallback is installed. Provider certificate chain and actual hostname acceptance remain subject to live verification.

Both adapters provide explicit endpoint, authentication and database fields, so ambient `PGHOST`, `PGPORT`, `PGUSER`, `PGUSERNAME`, `PGDATABASE` and `PGPASSWORD` do not supply missing identity. Explicit password callbacks also preserve a deliberately empty password. This is not a promise to neutralize every PostgreSQL diagnostic/metadata environment variable. Postgres.js receives host/port arrays to retain IPv6 literals rather than splitting them as `host:port`.

Transaction mode disables Postgres.js named prepared statements with `prepare: false`. Supabase recommends transaction pooling for serverless clients, small application pools and disabled prepared statements; direct connections remain the documented choice for migrations and backup sessions. [Supabase connection methods and client configuration](https://supabase.com/docs/guides/database/connecting-to-postgres) The session store retains its existing unnamed queries, `mfp_sessions` table, `createTableIfMissing: false` and disabled periodic pruning. Existing transaction boundaries and authorization locks are retained. Application and session pool caps are per process/instance, not a fleet-wide budget: plan for both pools multiplied by active instances, provider pooler limits and separately budgeted administration. No universal safe provider connection count is claimed.

Invalid database settings cause trusted authentication configuration to be unavailable before the session pool is constructed. Existing sanitized unavailable/denied API responses remain; no unauthenticated plan fallback or client-visible connection diagnostic is added. `createDatabase(url)` and the exported `DatabaseConfigurationError` remain compatible with current callers.

## Empty database and least privilege

The administrative setup files are separate from application startup. They operate on an explicitly named, dedicated application schema and roles. The running application still uses `public`; the helper's schema argument supports isolated setup tests and does not add arbitrary custom-schema support to application queries. Bootstrap supplies only the legacy base tables needed before unchanged migrations 0001–0004; it does not assign legacy ownership, copy owner drafts, upgrade snapshots, or backfill customers. An existing application schema must not be erased or silently reused.

The selected role design separates a restricted non-login object owner from a restricted non-login runtime permission role. The separately supplied application login inherits only the runtime role, owns no application objects and must not be able to assume the owner or unrelated privileged roles. Runtime grants support existing authenticated application/session operations; immutable revisions and receipts receive only the operations they need. Principals and external identities require the existing `FOR SHARE` authorization lock, so their narrowly granted `UPDATE(status)` permission is paired with an UPDATE policy whose check rejects actual changes. PostgreSQL requires UPDATE privilege on at least one column for `FOR SHARE`; its UPDATE policy applies `USING` to the locked rows and `WITH CHECK` to actual changed rows. This is tested as a lock-permission requirement, not an invitation to alter identities from the runtime. [PostgreSQL SELECT privileges](https://www.postgresql.org/docs/current/sql-select.html), [PostgreSQL policy semantics](https://www.postgresql.org/docs/current/sql-createpolicy.html)

RLS and grants keep direct Data API identities away from application tables; runtime policies still trust the application server to enforce principal/workspace membership. They are not new per-customer JWT policies and do not replace existing M4 authorization. Legacy password scaffolding remains inaccessible to the application runtime. Saved-history trigger behavior must remain intact. Provider Data API exposure and platform role membership require separate live checks even after local SQL acceptance. Supabase documents grants and RLS as separate controls and warns that default grants can expose new tables or functions. [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

The final setup source has the reviewed guards. `bootstrap.sql` refuses existing relations and non-extension application functions/types, preserving existing state. `harden.sql` requires the expected fourteen tables, legacy sequences, restricted dedicated owner/runtime roles, the invoker history function and all three correctly attached/enabled immutable-history triggers. Unexpected application functions, existing column ACLs or application RLS policies fail preflight. It checks runtime descendants and other memberships even where inheritance is disabled, so an ability to `SET ROLE` is not mistaken for harmless membership. The object owner must be dedicated to the target schema/database before its global default privileges are changed.

| Application objects | Runtime grants and limits |
| --- | --- |
| `users`, `users_id_seq` | No runtime grants; historical password rows remain inert. |
| `floor_plans` | SELECT, INSERT, UPDATE, DELETE; only USAGE on `floor_plans_id_seq`, not `setval`. Existing server authorization still denies unowned legacy records. |
| `application_principals`, `external_identities` | SELECT and INSERT. Only `UPDATE(status)` is granted for existing authorization row locks; `USING (true) WITH CHECK (false)` permits those locks while denying actual identity changes. |
| `workspaces`, `workspace_memberships`, `auth_browser_contexts`, `oidc_login_transactions`, `physical_plans` | SELECT, INSERT, UPDATE. |
| `mfp_sessions` | SELECT, INSERT, UPDATE, DELETE for existing session-store get/upsert/touch/destroy. |
| `workspace_creation_receipts`, `physical_plan_revisions`, `physical_save_receipts`, `physical_lifecycle_receipts` | SELECT and INSERT only; no runtime UPDATE/DELETE. The three existing physical-history triggers additionally preserve immutable records. |

All fourteen tables have enabled and forced RLS. The setup revokes the application table/sequence/function grants and schema CREATE access from PUBLIC, known Data API identities (`anon`, `authenticated`, `service_role`, `authenticator` when present), runtime permission roles and runtime logins before exact runtime regrant. Global and schema-specific default table, sequence and function privileges are removed for the dedicated object owner. New objects require separately reviewed grants/RLS; no trigger-function EXECUTE, table ownership, privilege management or blanket application schema DDL is granted to runtime. This is application-role hardening, not proof that every future provider extension or externally added grant is safe.

`restrict-database.sql` is a separately approved database-wide step requiring an exact current `database_name` and runtime role. It revokes CREATE and TEMPORARY on that dedicated database from PUBLIC and relevant API/runtime identities and grants runtime CONNECT. It deliberately is not hidden in schema hardening or `applyProviderSchema`: that helper runs bootstrap, migrations and hardening only. Denial of temporary DDL depends on applying the separate database restriction; that step can affect all consumers of a database and must never be applied implicitly to a shared or unidentified database.

The programmatic setup requires a Postgres.js client exposing `reserve()`. Each step uses a reserved direct administrative connection and rolls back any open transaction, resets role/search path and releases that same connection afterward. All four migrations retain one reserved connection despite a multi-connection administrative pool and concurrent callers. Administrative setup must use the direct database endpoint; these session operations are not supported through transaction pooling. The scripts do not create live roles, change ownership of another application, disable provider services or perform a live migration. [Operator sequence and recovery](../database/README.md) is the supporting setup contract.

Each unchanged migration owns its own transaction. The entire four-file sequence is not one atomic migration. A failure preserves successful earlier migrations and must leave runtime use disabled. Do not blindly rerun bootstrap or all four migrations on a partially initialized schema. Record the exact completed boundary, inspect preserved objects/ownership, and follow the reviewed administrative recovery steps. Setup cannot restore data it never backed up. No destructive “clean start,” automatic reset or automatic live migration is part of this package.

## Verification record

Known focused candidate evidence: **18/18 PASS** for `tests/database-configuration.test.ts` plus existing `tests/auth-configuration.test.ts` (14 new configuration cases, four existing auth cases), followed by TypeScript PASS on the candidate. Cases inspect both installed drivers without opening a network connection, strict TLS/hostname options, CA validation, IPv6, explicit credentials under hostile ambient `PG*` values, encoded password whitespace, invalid settings and fail-closed auth. These targeted results are separate from the completed fresh final integration sequence. All 18 fresh command groups PASS for this server/database-only package: install, unit, typecheck, standalone build, hosting build, offline CLI artifact, provider privileges, actual TLS/transaction-pooler transport, packaging, hosted protocol/browser, runtime, authorization SQL, account SQL, account HTTPS/browser, physical SQL, physical HTTPS/browser, journal and Autosave. Actual counts are recorded below. The unchanged drawing UI is not receiving a fresh unfiltered 192-case run in this package; the earlier 192/192 pass is historical unchanged-client evidence only, with no changes to client/shared source in the verified 19-path package.

| Fresh verification group | Current recorded result |
| --- | --- |
| `npm ci` | PASS |
| `npm test` | **707/707 PASS** |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `npm run build:vercel` | PASS |
| Official offline Vercel CLI artifact build | PASS, **7.751 seconds** |
| `npm run test:database:privileges` | **12/12 PASS** |
| `npm run test:database:transport` | **6/6 PASS** |
| `node --test tests/hosting/packaging.test.mjs` | **6/6 PASS** |
| `node scripts/run-hosting-tests.mjs` | **7/7 protocol + 2/2 browser PASS** |
| `npm run test:runtime` | **5/5 PASS** |
| `npm run test:authorization:db` | **15/15 PASS** |
| `npm run test:accounts:db` | **20/20 PASS** |
| `npm run test:accounts` | **32/32 HTTPS + 8/8 browser PASS** |
| `npm run test:physical:db` | **42/42 PASS** |
| `npm run test:physical` | **37/37 HTTPS + 24/24 browser PASS**, command duration **84.106 seconds** |
| `npm run test:journal` | **17/17 PASS**, command duration **4.820 seconds** |
| `npm run test:autosave` | **15/15 PASS**, command duration **89.519 seconds** |

Every one of these 18 commands exited 0 in the same completed source-frozen sequence, totaling **307.579 seconds**. The prior incomplete attempt remains separate below. The official CLI artifact was built with Vercel CLI 59.11.7 on Node 24.21.0; one Express/Node24 function and all six static assets match the current generated handler/client hashes. The six packaging cases passed against that actual output. [Current artifact identity](evidence/m4-database-readiness/current-artifact-summary.json). This is local build evidence, not a deployed CDN or live provider check.

| Source, scope and publication check | Current recorded result |
| --- | --- |
| Frozen source at the start of final verification | **358 files**, digest `dd4382035e070aa12689449b346820ac459d3aff6793818cf1f8a995c993a98d`; **19 changed paths**. |
| Unfiltered main drawing-UI Playwright suite | Not rerun for this server/database-only package. Prior 192/192 is historical evidence. No client/shared file is changed in the verified 19-path package. |
| Source equality after final verification and integration | All **358 hashes MATCH** after final verification, in canonical integration and in the isolated archive of implementation commit `71047c89b94a968a31e8b2c9130f84b6b6ee6897`. |
| Separate smoke of actual integrated/committed source | All **7 groups PASS**: fresh install, standalone build, hosting build, **5/5 runtime**, **7/7 hosted protocol + 2/2 browser**, **12/12 privileges**, **6/6 real transport**. All **358 source hashes MATCH before and after**. |
| Working/staged implementation `git diff --check` | PASS. Containing documentation commit records its own whitespace/link checks. |

The real-transport application fixture uses `tests/accounts/app-server.ts` via tsx with normal application `registerRoutes` and middleware, a fixture-only HTTPS listener and compiled client assets. It is not the compiled server entry. Separate standalone runtime and offline-artifact/hosting checks verify the compiled entry. Do not merge these distinct evidence claims.

## Candidate attempts retained separately

These are development attempts and focused retries, not pieces to add together as the fresh final result:

| Candidate attempt/review | Actual result and bounded correction |
| --- | --- |
| Configuration/auth focused run | 18/18 PASS, followed by candidate TypeScript PASS. The final IP-SNI adjustment below is covered by the completed fresh sequence. |
| Initial privilege fixture | The first owner-scope guard incorrectly treated internal TOAST ownership as another application schema; the guard was corrected without changing application ownership. |
| Second privilege fixture | A synthetic lifecycle test called the existing API with an incorrect argument shape. The fixture call was corrected to the actual contract. |
| Privilege candidate before added regressions | 10/10 PASS; retained as an earlier targeted result. |
| Final privilege candidate | **12/12 PASS in 3478.3961 ms** after reserved-session concurrency and partial-migration preservation regressions were added. The four historical migration files are byte-identical in the candidate source receipt. This is still separate from the fresh integration sequence. |
| Transport fixture networking | Docker's internal-only bridge prevented the needed localhost published-port access. The isolated fixture switched to a dedicated ordinary bridge while published ports remained bound to `127.0.0.1`. No provider endpoint was used. |
| Transport readiness | Reusing a Postgres.js readiness connection stalled; `pg_isready` could also observe the initialization server before final readiness (57P03). The fixture now uses bounded external node-postgres TLS readiness probes. |
| Transport fixture module/configuration | CommonJS `pg` named `Pool` import was corrected to the default import. PgBouncer's missing client-TLS CA setting was replaced with the explicit generated fixture CA path. |
| Transport candidate attempt 8 | **6/6 PASS in 1.94056 seconds**, exit 0. Attempts 1–7 remain in preserved candidate logs. Owned fixture containers, network and processes were removed; the local test image remains cached. |
| First attempted final sequence | Install, 707 unit cases, typecheck and both builds passed, then the external offline-CLI helper failed because Windows `NODE_OPTIONS` path backslashes were not handled correctly. Only the helper outside frozen application/test source was corrected; the 358-file digest remained unchanged. A targeted offline build then passed in about eight seconds. The entire 18-group sequence was restarted; these partial results are not merged into that new final run. |
| Final source IP-SNI correction | SNI `servername` was removed for IP addresses to avoid Node's deprecation warning while retaining explicit `checkServerIdentity(configuredIP, certificate)` and chain verification. DNS SNI remains. The completed fresh frozen-source run passes with this correction. |
| Read-only hardening review | Reserved direct sessions, non-extension function/type empty-schema guards, enabled history-trigger checks and global/default/direct privilege safeguards were added before final verification. Database-wide CREATE/TEMP restrictions remain a visibly separate operation. |

The actual local transport uses PostgreSQL **17.11** (Debian `17.11-1.pgdg12+2`) and PgBouncer **1.25.2** (`1.25.2-1.pgdg12+1`). The pinned base image digest is `sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0`. The candidate tests assert actual node-postgres socket encryption and PostgreSQL backend TLS, with restricted-role SQL through the actual transaction pooler. These are real local protocol/driver checks; PgBouncer is not Supabase Supavisor, and this evidence does not validate a live managed provider.

Original candidate receipt references retained in local work evidence: `provider-privileges-candidate.log`, `provider-setup-source-check.json`, and `candidate-transport-1.log` through `candidate-transport-8.log`. The completed fresh sequence is recorded above; the earlier attempt logs remain preserved rather than overwritten or combined into its counts.

## Integration, publication and preservation

Implementation commit: **`71047c89b94a968a31e8b2c9130f84b6b6ee6897`**. It contains exactly the 19 verified implementation/configuration/setup/test paths. Canonical integrated source and a separate archive of that actual commit match all 358 frozen hashes. Working and staged implementation whitespace pass. Documentation/evidence publication is the **containing commit**; a GitHub receipt is added to #4 only after ordinary non-force push and remote containment are confirmed. No future documentation SHA or premature GitHub synchronization is asserted here.

The separate seven-group post-integration sequence passes from the archive of that committed source: fresh install, both builds, **5/5 runtime**, **7/7 hosted protocol + 2/2 browser**, **12/12 privileges** and **6/6 actual TLS/pooler transport**. All **358 source hashes match before and after**. Every one of the **18 artifacts** produced by that fresh committed-source build matches the corresponding final tested artifact. Two older candidate chunks remain archived and unused; they are not counted as current build output or removed from preserved work. [Actual source, counts and artifact comparison](evidence/m4-database-readiness/verification.json).

The committed evidence set contains **31 sanitized files** (about **212 KB**), including source/artifact manifests, selected logs and the inspected synthetic saved-plan screenshot. It contains no owner sketch or live provider credentials. The containing documentation commit records its own whitespace/link checks; its exact SHA and remote synchronization belong in the #4 publication receipt after push.

Preservation receipt: all **11 existing canonical `dist` files retain their hashes**, stash and the original archive are unchanged, and owner browser interactions are **zero**. Existing PID **2616** on port **5194** was not operated, stopped or restarted. Owner tabs/storage/sketches, raw Quick Rooms input, saved snapshots and source originals remain protected. The disposable test sessions are separate and contain no previous owner drafts. No new persistent review address is advertised. The verified disposable PostgreSQL fixture was stopped; no owned test containers, networks or fixture ports remain. The local test image stays cached. Deployment, live database operation and provider binding remain unverified.

## Remaining provider and release gates

Dedicated Supabase PostgreSQL remains the recommended database direction from the retained hosting plan. Railway remains an owner-proposed alternative, not a second active binding. Exact provider/project/region, credentials and canonical origin remain unresolved. No live provider inspection, query, SQL application, paid provisioning or backup/restore test is represented by isolated evidence.

Before an authorized live binding: verify the exact provider endpoint and TLS chain/hostname, connection-mode compatibility, both pool budgets, dedicated login/owner grants, Data API restrictions and role memberships, supported extensions/schema, backup retention and recovery procedure. Check actual Supabase transaction pooling separately from a local protocol-compatible pooler. Verify real persistence and denial across process replacement against permitted test records; an offline pass cannot establish those operational facts.

Owner-only All Deployments protection across production/generated/custom URLs, managed HTTPS header behavior, exact callback/session continuity, allowed origin, owner sign-in, deployed revision and request/report-size acceptance remain outstanding. The current hosting plan records a Vercel 4.5 MB request/response-body boundary; no truncation or new upload limit is introduced here. The fresh install still reports **four moderate advisory entries**, and the existing client chunk-size warning remains. The previously recorded development-only advisory scope is retained; this package does not claim a new production-only audit or remove those known tooling findings. Customer onboarding and M5 remain unstarted.

## Single next bounded task

**#4 identity-provider and owner sign-in/consent entry gate — NOT STARTED.** Confirm one identity-provider approach compatible with the existing OIDC client and the owner's hosting direction. Recheck the current Supabase OAuth-server/beta, asymmetric signing, exact confidential-client registration and login/consent requirements identified in the hosting plan; accepting Supabase PostgreSQL does not accept or configure that separate identity product. Produce one compatible flow, owner decisions/requirements, and a bounded isolated implementation slice before live provisioning or deployment. Retain the current account/session engine and workspace authorization. Broad #4 stays OPEN; this package does not begin M5.
