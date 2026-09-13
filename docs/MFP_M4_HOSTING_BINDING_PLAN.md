# M4 protected owner-hosting plan

> Historical planning record retained: its original “adapter not started/unimplemented” statements describe the source-reviewed plan below. The later bounded adapter implementation and actual verification are recorded in [M4 Vercel adapter results](MFP_M4_VERCEL_ADAPTER_RESULTS.md) and the current canonical roadmap. Live bindings, owner protection, provider compatibility and hosted acceptance remain unverified. This notice does not rewrite the historical plan or claim deployment.

Date: 2026-09-12 (America/Chicago). Scope: issue #4, configuration and binding planning only.
Status: **PLAN COMPLETE / SOURCE-REVIEWED; NOT DEPLOYED.** The adapter, live bindings and hosted acceptance remain unimplemented/unverified. This record supports the canonical BUILD_ROADMAP; it is not another roadmap.
Entry main/origin/main: 4c57b285442384d23204a75e48e6058e2c493d46.

## Decision and observed bindings

Keep React/Vite, Express, the existing physical document and server-owned workspace authorization. Use one Vercel project for static client files and the Express API. Recommend a **dedicated Supabase PostgreSQL project** for Modern Floor Planner. The owner proposed Supabase and then Railway for the database; this is a recommendation, not a claim that a particular project, cost or credential was approved. Supabase Auth is the compatible OIDC-provider candidate described below, not an already configured login.

Read-only checks found one connected Vercel team with ten projects and no project linked to armentrout1/ModernFloorPlanner. Local .vercel/project.json, vercel.json, .env, .env.local and .env.production are absent. The connected Supabase inventory contains seven projects, none clearly named Modern Floor Planner; a generically named project cannot be assigned to this product by inference. No project data, credentials, tables or owner browser tabs were inspected. No Railway project binding was verified. This does not establish that no project exists in another account.

| Database option | Fit for this application | Decision |
| --- | --- | --- |
| Supabase PostgreSQL | Existing PostgreSQL drivers can remain. Its transaction pooler suits Vercel, with explicit driver settings and restricted Data API exposure. Auth is available, with the OIDC qualifications below. | Recommended dedicated product project; exact project/region/plan and Auth acceptance remain unresolved. |
| Railway PostgreSQL | Also compatible with the existing SQL model. Vercel requires an external TCP endpoint, TLS validation and an instance connection budget; its PostgreSQL service does not itself provide application sign-in. | Viable alternative if the owner prefers it; do not configure a second database alongside Supabase. |

Railway documents public TCP access and related network egress; no claim about which option is cheapest is made without selecting service sizes and usage. No service or paid option is purchased. [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)

## Selected hosting design

Use the Vercel **Express** preset, Node 24.x, repository root, production branch main. Retain the existing Node 24.21.0/npm 11.19.0 local pins. Vercel controls the hosted patch release; record its actual runtime later.

1. Extract shared Express middleware/route composition from server/index.ts into a module used by both entry points. A recognized root app.ts directly imports Express and exports the fully initialized app; it must not import the current listener IIFE or start a second listener. Keep server/index.ts and npm start for standalone/local use. Include the root entry in TypeScript checks. Initialization failures remain sanitized and fail closed.
2. Add a separate hosting build that builds the same Vite client and copies only generated dist/public client files into the hosting public directory. No repository docs, server bundles, secrets or evidence become static assets. Preserve the existing standalone dist layout and build/start path. Do not configure a static-only output directory that drops Express. Vercel serves public assets through its CDN and does not use express.static for this purpose. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
3. Use explicit SPA route rules for /, /quick-room, /physical-draft and /account/callback. Preserve query parameters on the last route because it consumes the sanitized auth result. GET/HEAD behavior and rejected unsupported methods must be tested in the generated artifact; do not assume a broad rewrite preserves methods. /api and /api/** retain their complete paths and reach Express, including /api/auth/callback. Unknown APIs remain JSON 404; missing assets remain 404. No universal rewrite that returns SPA HTML for APIs, missing files or arbitrary POSTs. [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json)
4. Keep browser API requests relative to the same canonical HTTPS origin. No cross-origin API or partner proxy is added. Preserve private no-store headers, error sanitization, the 4 MB physical request parser and current account/workspace/context checks. Measure report/export output and largest supported request envelopes against Vercel's standard 4.5 MB function request/response limit before release; do not silently truncate or narrow supported data. [Function limits](https://vercel.com/docs/functions/limitations#request-body-size)

This is a selected design, not tested Vercel packaging. It does not use experimental Services, introduce Next.js, or require staging or preview deployment.

## Owner-only deployment boundary

Before the first future authorized deployment, configure **Vercel Authentication, All Deployments**, then verify its effective scope on the production domain, generated deployment URLs, branch aliases and any custom domain. Standard Protection alone leaves the production domain public. Vercel's September 9, 2026 announcement makes All Deployments protection available free on every plan; verify the target project's setting rather than assuming the team's Pro plan supplies it. [Protection scope](https://vercel.com/docs/deployment-protection#all-deployments), [announcement](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)

All Deployments authenticates permitted Vercel users; it is only owner-only after project/team permissions, access groups, individual grants, share links and bypass paths establish Aaron as the only permitted early user. Inspect that exact project's access before publishing. Do not alter access to other products. The platform gate must cover HTML, assets, direct deep links and every API method. If the required owner-only scope cannot be established, do not publish.

Keep the OIDC callback on the same protected canonical origin. The returning browser must retain its Vercel protection cookie. Prove this with the chosen provider; do not assume a server callback can bypass protection. Do not make callback-domain exceptions or put bypass secrets into URLs/client code. Retain the application's separate M4 authorization: a Vercel login is not a principal, workspace or plan permission. [Vercel Authentication access](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)

## HTTPS/session compatibility

Current server/accounts.ts explicitly sets express-session proxy:false. The cookie is Secure, HttpOnly, SameSite=Lax, Path=/, with a __Host- name and an eight-hour absolute lifetime. A hosted proxy can deliver internal HTTP while the user uses HTTPS, so merely enabling Express trust proxy would not resolve this explicit session setting. [Express session proxy](https://expressjs.com/en/resources/middleware/session/#proxy), [Vercel forwarded protocol](https://vercel.com/docs/headers/request-headers#x-forwarded-proto)

The adapter must select its trust policy through a server-owned Vercel entry/composition option, never a request header or query parameter. The standalone listener retains direct-TLS behavior. In the hosted entry, accept only the platform's verified forwarded HTTPS contract and the exact configured canonical host; reject missing, conflicting or forged/untrusted protocol/host inputs before auth. Wire express-session to that verified policy. Do not set global proxy trust or weaken Secure cookies to make a login appear to work. Confirm Vercel's header overwrite behavior in the actual runtime; an X-Forwarded-Proto header on an ordinary local request is not proof of HTTPS.

Preserve exact MFP_APP_ORIGIN, the exact callback suffix, CSRF Origin + X-MFP-Request checks, context generation, SID rotation, no-store responses and sanitized callback redirects. Required isolated tests cover trusted forwarded HTTPS, spoofed headers against standalone HTTP, missing/invalid host/protocol, OIDC callback/SID continuity, logout, old-tab denial and unchanged direct-TLS fixtures. Live edge behavior remains a release gate even after those tests pass.

## Supabase database contract

Recommended application connection: the selected project's **Supavisor transaction pooler**, with its exact dashboard-provided endpoint/user/database and verified TLS certificate/hostname. Do not derive a connection URL from another product or blindly append pooler options. Existing drivers remain Postgres.js/Drizzle plus node-postgres through connect-pg-simple. Supavisor transaction mode requires **prepare:false** for Postgres.js; it is not set today. Session-store queries must remain unnamed. The application uses transaction-scoped advisory locks, which must be exercised through the selected pooler; no session-scoped state may be assumed across transactions. [Connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)

Current pools allow ten application plus five session connections per warm instance. Plan a provider-specific bounded configuration, initially one connection per pool per instance, and measure parallel account/save behavior before increasing it. Two pools are intentional and must both be budgeted: with N active instances this starting configuration can use approximately 2N client connections, plus administration/maintenance. Provider client slots and active database connections are different limits. Match the eventual function/database region, preserve bounded connection/idle timeouts and account for idle serverless resources. Do not imply this cap alone prevents all scale-related exhaustion.

Use verified TLS for both drivers, with the correct provider CA chain and hostname validation; do not use rejectUnauthorized:false. Confirm the installed drivers' URL/SSL precedence instead of relying on a string parameter alone. Supabase SSL-enforcement changes can reboot the database and are a separately authorized live operation. [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)

**Direct Data API access is a separate security surface.** Existing migrations create unqualified application/session tables and have no RLS or grants hardening. They are not safe to apply to a Supabase project's default exposed schema on an assumption that Express guards that API. Selected design: disable the Data API for this dedicated, server-only persistence project; additionally prepare/test explicit restrictive grants/default privileges and RLS for any exposed tables. The runtime database role receives only the table/sequence permissions needed by the existing server, without superuser or BYPASSRLS authority. Test that runtime SQL still works; do not map external subjects to application principal IDs with a guessed auth.uid policy. No anon/authenticated role may read session tables, saved plans, immutable revisions or receipts outside Express. No service-role/secret key belongs in the browser. [Data API controls](https://supabase.com/docs/guides/api/securing-your-api)

Before live setup, verify the baseline users/floor_plans schema expected by migration 0001. The current four additive migrations are not a complete empty-database bootstrap. Prepare a separately reviewed empty-database bootstrap and provider privilege setup, preserving existing 0001–0004 and their immutable history. Never use db:push or startup to improvise this. Use a separately authorized direct administrative connection for setup; keep it outside the runtime environment. No SQL is created or applied in this planning task.

Choose backup retention, session/context expiry cleanup and restore verification before real work is stored. Current session pruning is disabled; expiration denies access but does not remove expired rows. Retention must preserve immutable revision and idempotency receipts. No cron, cleanup or destructive rollback is added here.

## Supabase sign-in compatibility

Retain the current openid-client Authorization Code + S256 PKCE + state/nonce flow and server-owned PostgreSQL sessions. Supabase's **OAuth 2.1 server** supports OIDC discovery, confidential client authentication and ID tokens, so it is the candidate integration. It is currently **beta** and requires enabling that feature, registering an exact client/callback, asymmetric signing keys, and a login/authorization-consent UI. Ordinary Supabase Auth keys are not replacements for our OIDC client ID/secret. This is not a configuration-only promise. [OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [flows and OIDC](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)

The proposed issuer is the selected project's HTTPS /auth/v1 issuer, matched exactly to discovery. Select confidential client_secret_basic with a server-only client secret, request openid as today, keep S256 and nonce, and require asymmetric JWKS verification. Keep dynamic client registration disabled. Build a bounded product login/consent flow only when separately assigned; validate authorization_id server-side with Supabase's supported APIs, require an authenticated provider user, and use only the returned validated redirect, with explicit approve/deny behavior. Avoid a loop where the Supabase login page itself requires the MFP session that it is establishing. Provider tokens must never become plan/workspace authorization headers.

The provider's public endpoints also need owner access restrictions during early use: disable public/anonymous registration and configure the selected client/login policy for the approved owner identity. Do not derive authorization from email or user-editable metadata. Continue exact issuer/subject provisioning into existing application principals, explicit workspace creation/selection and current memberships. Application logout/revocation guarantees remain those already documented; provider-side deletion or logout is not claimed to instantly revoke an existing MFP session. Live sign-in, callback, expiry and owner denial must be proved before release.

The owner's database preference does not settle acceptance of the OAuth-server beta or identify an existing Supabase project. These are explicit binding decisions before enabling Auth. If that path is declined, revise this one plan before implementing a different identity adapter; do not silently replace the completed M4A protocol or build parallel account systems.

The current Supabase changelog was checked, including the changing Data API defaults and hosted versus self-hosted Auth differences. No self-hosted configuration change is imported into this hosted plan. [Changelog](https://supabase.com/changelog.md)

## Server-only configuration matrix

Names below already exist unless expressly labeled proposed. Values are placeholders; none were fetched or written.

| Key / setting | Contract |
| --- | --- |
| DATABASE_URL | Verified MFP-only runtime database role at the selected pooler. Secret; no browser prefix. |
| MFP_OIDC_ISSUER | Exact HTTPS issuer matching discovery, without .well-known path or guessed tenant. |
| MFP_OIDC_CLIENT_ID | Registered confidential OAuth client for this product. Not a Supabase publishable key. |
| MFP_OIDC_CLIENT_AUTH_METHOD | Proposed binding client_secret_basic; must match registration. |
| MFP_OIDC_CLIENT_SECRET | Registered client secret, server-only. Not a service_role key. |
| MFP_APP_ORIGIN | Exact canonical HTTPS origin, no trailing slash/path. Do not infer from Host headers. |
| MFP_OIDC_CALLBACK_URI | Exactly MFP_APP_ORIGIN + /api/auth/callback, registered without wildcards. |
| MFP_SESSION_SECRET | Stable secret across instances/redeploys; at least 32 random bytes in the existing validated base64url format. |
| HOST / PORT | Existing standalone listener settings; the Vercel handler does not open its own listener. |
| Provider pool/TLS controls | Proposed typed server configuration, not implemented environment variables. No undocumented magic flags. |
| Administrative database connection | Future controlled migration tooling only; never injected into the app or frontend build. |
| Supabase public URL/key | Only if needed by the separately assigned login/consent UI; publishable key only, with Data API restrictions verified first. |

Vercel project/region/canonical domain, Supabase project/region/plan, exact runtime role, provider client, owner identity and backup/retention policy remain unbound. No environment files, keys, service creation, domain changes or deployment are part of this task.

## Single next implementation task

**#4 Vercel Express adapter and trusted HTTPS acceptance — READY / NOT STARTED.** This is one local package: shared app composition, recognized entry, client-only CDN packaging, explicit SPA/API routes and the narrowly scoped session/proxy policy above. It does not need live credentials to begin.

Acceptance for that package:

- Existing standalone development/production and no-binding fail-closed behavior remain intact; no listener or development dependency is loaded by the hosted handler.
- Check built host artifact routing for all four page paths, callback query preservation, known/missing assets, unknown APIs, request methods, and no private files/secrets in the static output. Include a cold handler initialization test and repeated requests.
- Use isolated HTTPS/proxy/issuer fixtures for secure cookie creation, rotation and callback continuity. Forged headers against standalone mode must not create a secure session. Retain CSRF/workspace/old-tab denial cases and raw draft recovery.
- Run fresh applicable unit/runtime/account integration checks, npm run check, npm run build and focused browser acceptance against that changed source. Run broader existing integration coverage where shared route/session composition can affect saved plans. Record exact counts/failures; do not reuse this plan as execution evidence.
- Preserve owner tabs and existing review origins. No protected page reload, draft migration or live database operation. No Supabase login UI, new SQL migration, billing or M5 expansion in this first adapter slice.

After that package, the unresolved provider-specific pool/TLS/privilege/bootstrap and Supabase Auth work must be separately bounded before any live binding. Deployment still requires explicit authorization plus a concrete target and rollback reference. Before the first authorized hosted release: establish all-surface owner protection first; verify migrations/binding using permitted records; prove owner save/reload across instance restart and anonymous/cross-workspace denial; check report limits; record deployed SHA/provider identifiers without secrets. Retain production-first delivery with no mandatory staging/preview workflow.

## Checks and publication evidence

Current fresh check: **330/330 application/configuration/test source hashes MATCH** the final runtime manifest, with zero mismatches. [Sanitized check receipt](evidence/m4-hosting-plan/source-and-binding-check.json). Documentation-only work does not restart the app or rerun its full test suite. The preserved runtime record reports 688 unit, 192 main browser, five runtime and all thirteen final command groups passing; those are historical unchanged-source results, not a fresh hosting pass. [Runtime results](MFP_M4_RUNTIME_READINESS_RESULTS.md)

Working/staged documentation whitespace, local-link checks, scope checks and ordinary GitHub publication are recorded in the #4 receipt after the containing documentation commit is confirmed. There is no new implementation commit in this planning slice. Previous runtime implementation cf2bdc0c9c662d5cf56abf8a5fca7ba2e945c7d5 and documentation 4c57b285442384d23204a75e48e6058e2c493d46 remain intact. Broad #4 stays OPEN; #9/#10 stay open, #2 remains unreleased, M5 remains NOT STARTED.

Owner tabs/storage, local and Quick Rooms drafts, stash, archived work and source originals remain untouched. The existing local review process is not restarted or advertised as a hosted deployment. No live database query, migration, service provisioning, external customer notification or other product change occurred. **NOT DEPLOYED.**
