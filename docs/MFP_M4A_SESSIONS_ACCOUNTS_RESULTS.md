# M4A OIDC sessions and account controls

Assigned slice: issue #20. Entry main: 967d9e7f6f04a35c755a9943fae0155b840fabfb. The completed #19 authorization foundation and M3 physical-document work remain intact.

## Verification status

OIDC/session/account implementation: COMPLETE / PRODUCER_VERIFIED locally.
Live identity provider: NOT SELECTED / NOT CONFIGURED.
Production database binding: NOT VERIFIED.
Deployment: NOT DEPLOYED.

## Server contract

The normal Express composition mounts the actual configured OpenID Connect Authorization Code client, not an injected user object. openid-client 6.8.8 performs discovery from the one configured issuer, code exchange with S256 PKCE, mandatory state/nonce, issuer/audience/expiry checks, and explicitly enabled JWKS signature verification. Applicable authorized-party checks also apply. Only the openid scope is requested. Provider tokens are not returned to the browser, retained for refresh, or used as workspace authority. Account display uses the verified subject; email never links identities.

Trusted server configuration is MFP_OIDC_ISSUER, MFP_OIDC_CLIENT_ID, MFP_OIDC_CLIENT_AUTH_METHOD (none, client_secret_basic or client_secret_post), applicable MFP_OIDC_CLIENT_SECRET, exact HTTPS MFP_APP_ORIGIN, MFP_OIDC_CALLBACK_URI equal to that origin plus /api/auth/callback, MFP_SESSION_SECRET (at least 32 bytes encoded as base64url), and an explicit DATABASE_URL. Request Host, forwarded headers, query parameters and old fixture flags cannot provide this configuration. Incomplete/invalid configuration fails closed while local editing remains usable. Discovery outages are retryable and sanitized.

GET /api/auth/session reports a sanitized identity, explicit workspace/role, permitted memberships, noncredential context version and expiry. POST /api/auth/login starts a transaction and returns the provider redirect; GET /api/auth/callback consumes that transaction once and redirects to a local result route with no code/state/token. The client removes the sanitized result query from the visible URL. Return targets are only /, /physical-draft and /quick-room. Both configured and unconfigured callback responses suppress referrers.

Each login has its own random state, nonce and PKCE verifier, bound to a PostgreSQL browser context and hashed session ID. Transactions expire after five minutes. Starting a newer login invalidates older outstanding attempts; at most ten starts per browser context are permitted in five minutes. Callback consumption is atomic. After token verification, current transaction/context/principal validation and SID regeneration occur under the same context-row lock, before the authenticated session binding is committed. An older exchange cannot destroy a newer pending attempt's session. Completed/cancelled/superseded transactions clear nonce/verifier values.

express-session 1.19.0 and connect-pg-simple 10.0.0 store session state in PostgreSQL. The browser receives an opaque signed __Host-mfp-session cookie: Secure, HttpOnly, Path=/, SameSite=Lax, no Domain. Anonymous context/cookie life is 30 minutes; authenticated cookie life is eight hours without rolling renewal. PostgreSQL independently enforces a 30-minute idle timeout and eight-hour absolute timeout. Routine old responses do not renew an old SID over a newer login. Session context and pending transactions survive application process recreation. No insecure-cookie fallback, automatic table creation or proxy-header trust is enabled. Expiry is enforced on access; scheduled retention/pruning of expired session/context/login rows is not implemented in this slice and remains an operational readiness item before live use.

POST /api/auth/logout revokes the context and pending transactions before destroying the stored session and clearing the cookie. Current principal/identity status is checked on access. This is application-local logout: provider administrative revocation/global logout is not instantly observed. Without a separately implemented provider revocation signal, the application session requires fresh OIDC authentication by its absolute expiry; application revocation and workspace-membership changes take effect on subsequent authorized access. Existing transactions that acquired authorization locks may finish before revocation commits; queued/subsequent operations deny.

All application mutations, including login/logout/workspace selection/creation, require the exact configured Origin and X-MFP-Request: 1. Account and protected record operations additionally carry X-MFP-Context, a noncredential context version. Legacy record operations carry explicit X-MFP-Workspace-Id and match the server-held selected workspace. Neither header grants authority. Session binding is rechecked inside the existing scoped SQL transaction before workspace, principal and membership locks. Old-tab operations cannot execute under another person's newly changed cookie. The OIDC callback alone uses its external validated transaction instead of application CSRF headers. Private responses remain no-store; errors/logs exclude credentials, provider errors, session identifiers and saved drawings.

## Workspaces and additive migration

Migration0002 adds session storage, authoritative browser contexts, one-use OIDC transactions and workspace-creation receipts after0001. No automatic migration, legacy ownership assignment or password activation occurs. All applied SQL in this assignment is confined to verified disposable PostgreSQL fixtures.

Exact issuer+subject provisioning is repeat-safe and never reactivates a revoked identity. GET /api/workspaces lists active memberships for the verified principal only. POST /api/auth/workspace explicitly selects or clears a verified workspace; no first workspace is selected automatically. A restored selection is rechecked against current server membership. POST /api/workspaces is an explicit creation action when no workspace is selected: new workspace, owner membership and idempotency receipt commit atomically, with five fresh workspaces/hour/principal. Retries return the same currently accessible workspace, reject changed input and never recreate revoked membership or claim unowned legacy plans. Selection remains a separate user action. Owner/editor/viewer and all #19 scoped CRUD/admin restrictions remain.

## Draft and account transitions

Unassigned local-only drafts, workspace-associated browser work and private server records are kept in separate working contexts. Sign-in performs no automatic upload, assignment or merge. Physical schema5, IDs, levels/stairs/zones, raw measurements, pending opening/waste fields, evidence and snapshots retain their existing interpretation. Full physical cloud saving remains M4B and does not use the room-only legacy endpoint.

Intentional redirect, sign-out and workspace changes require a successful recovery checkpoint and read-back. Failed recovery retains memory and explains the limitation before leaving. Pending fields are retained as text rather than committed by unmount. Physical stores/history remain separate in memory for same-page context switches. Redirect/reload retains current document/raw evidence and begins an empty Undo/Redo session, preserving the prior explicit recovery boundary.

A monotonically changing client generation cancels/invalidates old requests and verifies responses again after body consumption. Account actions retain the initiating context across preflight revalidation. Private caches are namespaced by verified principal/workspace and cleared on invalidation. Workspace private records cannot load into the unassigned draft context. Logout/expiry/lost membership hides prior working data without relabeling it as another user's. Matching server verification and explicit resumption protect recovered bound registries; an unchanged context suspended only for this page's focus check can resume after verification. Cross-tab notifications contain no tokens or drawing contents and prompt server revalidation; they are not identity authority. Focus, visibility, expiry and protected actions revalidate current access.

These are application UI/recovery protections, not encrypted device isolation. Plaintext local recovery remains readable to someone controlling the same browser/device profile. Separate profiles are appropriate on shared devices. No destructive global browser-storage clear is used.

## Verification and publication

Implementation commit: `c79e458a634131f9e25ed0e4b0bb7497fc07d7ae`. The normal publication and final documentation SHA/remote convergence are recorded in [issue #20](https://github.com/armentrout1/ModernFloorPlanner/issues/20). This record is not deployment evidence.

| Command | Actual result | Seconds |
| --- | --- | ---: |
| `npm ci` | PASS; 26 advisory findings retained for #4 | 10.156 |
| `npm test` | 551/551; zero failed/skipped | 4.938 |
| `npm run check` | PASS | 6.619 |
| `npm run build` | PASS; existing data/chunk warnings | 4.624 |
| `npx playwright test --reporter=line` | 180/180; zero failed/skipped/retries | 515.537 |
| `npm run test:authorization:db` | 15/15 separate PostgreSQL checks | 4.583 |
| `npm run test:accounts:db` | 20/20 separate PostgreSQL checks | 1.373 |
| `npm run test:accounts` | 32/32 OIDC/HTTP plus 8/8 browser, separate fixtures | 33.697 |

Working-tree and staged implementation `git diff --check`: PASS. All 276 integrated application/configuration/test/migration hashes match the final isolated source, digest `3dfeac0a8ee915fe805167044e002e12d0c9e1845911bce0a4ff28c26f055be2` (CRLF normalized to LF for text; binary unchanged). The full sequence above ran after the last application/test correction; preliminary targeted passes are not combined into these counts. Node 20.20.2, npm 10.8.2, Playwright 1.55.1, PostgreSQL 17.5 and Vite 5.4.14 were used. Clean install reports 26 advisories (2 low, 10 moderate, 14 high); stale Browserslist data and the large bundle warning remain #4 release-readiness work. No blanket dependency update occurred.

The first complete browser attempt had 174 passes / 6 failures. Five repeated fixture loads auto-dismissed the existing replacement prompt after newly preserved local recovery; the helpers now explicitly assert/accept that prompt and prove the intended loaded record. One physical-layout case exposed persisted presentation state changing fresh-page defaults; presentation is now kept only in context-local memory. Its original raw-field/document/history assertions are unchanged. The accepted full run above follows those changes; the earlier logs, traces, source and preliminary account failures remain archived locally.

Separate supplemental real HTTPS phone smoke: 1/1 PASS, 7.635 seconds. This directly verifies quota-blocked logout and workspace selection issue no transition POST and retain pending input; the eight-case suite separately proves quota-blocked sign-in. Separate integrated normal-composition review smoke: 1/1 PASS. It verifies current draft/opening/waste/recovery, unavailable Account, denied legacy Save/Load without field loss, seven forged API requests, zero page errors and no account cookie. These subassertions are not counted as extra browser cases.

Safe fresh review: [physical editor](http://127.0.0.4:5188/physical-draft). This separate address contains none of the owner's previous drafts. Authentication is deliberately unconfigured there; the real OIDC proof uses only the separately trusted HTTPS issuer fixtures. The verified 5187 listener/launcher were stopped immediately before integration after PID/command/actual-CWD checks; they were not restarted. Owner tabs/storage, stash and the original roadmap archive were untouched.

[Source/check/artifact manifest](evidence/MFP_M4A_SESSIONS_ACCOUNTS_2026-09-09.json) and sanitized logs/images under `docs/evidence/m4a-sessions-2026-09-09/` preserve the evidence. Screenshots: [integrated local drawing](evidence/m4a-sessions-2026-09-09/canonical-sessions-local-draft.png), [unconfigured account](evidence/m4a-sessions-2026-09-09/canonical-sessions-account-unavailable.png), [recovered fields](evidence/m4a-sessions-2026-09-09/canonical-sessions-local-recovery.png), [steady phone account](evidence/m4a-sessions-2026-09-09/account-steady-phone.png), [phone recovery failure](evidence/m4a-sessions-2026-09-09/account-quota-transition-phone.png).


The separate test issuer provides discovery/JWKS, real authorization redirects, one-use PKCE-bound codes and controlled failures. Normal production composition handles every app callback/session. Per-suite synthetic PostgreSQL databases and separate isolated Chromium contexts prevent owner-data/cookie access. The application and issuer use different loopback hosts. Ephemeral CA trust is scoped to Node test children; Chromium pins only the generated fixture certificate. A process without this trust rejects the certificate. No machine-wide trust or global TLS-verification disablement is used. Test certificates, keys, provider credentials and cookies are never published; authentication traces are disabled and screenshots use synthetic data.

## Remaining connection inputs and next boundary

To connect a live service, supply the chosen provider's exact issuer and registered client ID/authentication method/credential; register the exact HTTPS callback; establish the trusted application origin and verified HTTPS/proxy termination; securely supply the session secret; verify the intended production PostgreSQL binding; and separately authorize/review the additive migrations and deployment. Provider support, real callback registration, session persistence, logout and denial smoke must then be verified on that approved binding. Local issuer tests do not certify a live provider or deployed authorization.

M4A's live connection gate remains open. M4B is full versioned physical-document saving/revisions/conflicts; M4C is authorized exports and remaining project management. Neither started here. #9/#10 remain open, #2 unreleased, #4 PROPOSED, CRM separate. No paid provisioning, customer onboarding, deployment, live migration or new drawing feature occurred.

Maintainer references checked for this implementation: [openid-client discovery](https://github.com/panva/openid-client/blob/main/docs/functions/discovery.md), [authorization code grant](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), [explicit JWS verification](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md), [Express session middleware](https://expressjs.com/en/resources/middleware/session/), [PostgreSQL session store](https://github.com/voxpelli/node-connect-pg-simple).
