# M4 Supabase owner identity entry — implementation results

Date: 2026-11-04

Issue: [#4](https://github.com/armentrout1/ModernFloorPlanner/issues/4)

Implementation: `ab2a64ad3f635fe996763796fd75c8466316106f`

Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT BOUND and NOT DEPLOYED**

## Delivered boundary

Modern Floor Planner now contains the product-owned login and consent entry required by Supabase Auth's OAuth 2.1 server. The exact `/oauth/consent` route is separate from the editor shell, account controls and drawing state. It lazy-loads the pinned `@supabase/supabase-js` 2.119.0 client only when the authorization route is opened.

The route:

- accepts one bounded opaque `authorization_id` and rejects missing, repeated or URL-shaped values;
- fails closed when the public Supabase binding is absent or malformed;
- permits password sign-in only for an already provisioned Supabase user and offers no public signup;
- verifies the provider session with `getUser()` before reading consent details;
- requires the consent response to match the verified user ID and email, the original authorization ID, the exact same-origin HTTPS `/api/auth/callback`, and only the `openid` scope;
- displays the requesting application, verified account, requested permission and return origin before approval;
- uses explicit Approve, Deny and Use another account actions;
- validates Supabase's returned redirect before browser navigation; and
- never treats a provider token or email as a Modern Floor Planner workspace permission.

Supabase authentication remains the identity provider only. The existing server-side Authorization Code + S256 PKCE + state/nonce callback, PostgreSQL session, principal provisioning, workspace selection, membership and resource checks remain authoritative.

The old third-party Replit badge loader was removed after browser verification showed that it made an unrelated external request from the credential screen. An owner password page now makes no third-party request when the provider is unbound.

## UX placement

The consent experience is intentionally not another editor panel, modal or toolbar item. Supabase sends the browser to `/oauth/consent?authorization_id=...` only while sign-in is in progress. The normal editor, Quick Rooms and Physical Draft surfaces remain unchanged. Mobile scrolling is enabled only for this standalone route, and ordinary editor overscroll behavior is preserved.

This prevents authentication state from competing with drawing tools, calculator inputs, save/load controls or recovery dialogs. The ordinary application bundle also does not download the Supabase SDK until the provider route is requested.

## Configuration contract

No credentials or environment files were created. A future authorized binding must set the following values with separate Preview/Production scope as appropriate.

| Setting | Location and rule |
| --- | --- |
| `VITE_SUPABASE_URL` | Public Config value. Exact `https://<20-character-project-ref>.supabase.co` origin only. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Config value. Modern `sb_publishable_...` key only. It is intentionally browser-visible; service-role, secret and legacy JWT keys are rejected. |
| `MFP_OIDC_ISSUER` | Server Config value: exact selected project issuer, expected to be `https://<project-ref>.supabase.co/auth/v1`. |
| `MFP_OIDC_CLIENT_ID` | Server Config value from the registered confidential Modern Floor Planner OAuth client. It is not the publishable key. |
| `MFP_OIDC_CLIENT_AUTH_METHOD` | Server Config value `client_secret_basic`, matching the registered client. |
| `MFP_OIDC_CLIENT_SECRET` | Server Secret value. Never browser-prefixed or committed. |
| `MFP_APP_ORIGIN` | Exact canonical HTTPS Modern Floor Planner origin. |
| `MFP_OIDC_CALLBACK_URI` | Exactly `<MFP_APP_ORIGIN>/api/auth/callback`, registered without wildcards. |
| `MFP_SESSION_SECRET` | Stable server Secret value in the existing validated format. |
| `DATABASE_URL` and database TLS/pool values | Server Secrets/Config for the separately approved dedicated product database binding. |

`VITE_*` values are compiled into browser assets and therefore cannot be Secrets. All private OIDC, session and database values remain server-only. Production secrets must not be copied into Preview or local development merely for convenience.

The selected Supabase project must additionally have:

1. OAuth 2.1 server explicitly enabled with its beta status accepted;
2. `/oauth/consent` configured as the authorization path;
3. asymmetric signing keys enabled for OIDC ID tokens;
4. one confidential Modern Floor Planner client with the exact callback above;
5. dynamic client registration disabled;
6. public signup/anonymous registration disabled for the owner-only phase; and
7. the approved owner account created through a controlled Supabase administrative path.

These requirements follow the current [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started). The connected inventory contained no clearly dedicated Modern Floor Planner project, so no existing generic project was repurposed.

## Verification report

**Story:** the existing MFP sign-in action starts the server-owned OIDC flow, Supabase authenticates the owner and sends an opaque authorization request to the isolated consent page, the page explicitly approves or denies it, and only a validated same-origin redirect may reach the existing callback and workspace authorization.

| Boundary | Status | Evidence |
| --- | --- | --- |
| Consent UI and fail-closed state | PASS | Full Playwright suite **194/194 PASS**, including unbound and malformed-request consent cases. |
| Supabase SDK contract | PASS locally | Exact installed 2.119.0 methods/types checked; five focused controller/configuration tests PASS. |
| Existing editor/calculator UX | PASS | The same **194/194** browser run covers editor, Physical Draft, calculator, exports, recovery and responsive behavior. |
| Unit/domain/server behavior | PASS | `npm test`: **720/720 PASS**. |
| Type boundary | PASS | `npm run check`. |
| Standalone production build | PASS | `npm run build`; Supabase page emitted as a separate 237.78 kB lazy chunk. Existing main-chunk warning remains. |
| Hosted source build | PASS | `npm run build:vercel`; seven compiled client assets published locally. |
| Packaging policy | PASS with documented skip | `npm run test:hosting:packaging`: **5 PASS, 1 SKIP** because no isolated `MFP_VERCEL_ARTIFACT_ROOT` was provided. |
| Live Supabase login/callback | NOT RUN | No product project, OAuth client, owner credential, canonical origin or deployment was created. |
| Database-backed account/hosting suites | PREFLIGHT STOP | Both runners required explicit loopback-only `MFP_TEST_DATABASE_URL` plus verified `MFP_TEST_DATA_DIRECTORY`; no safe fixture was supplied, so they touched no unknown database. |

`npm audit --omit=dev` reports six production dependency advisories (two moderate, three high and one critical) in existing Express-related dependency paths. None names a Supabase package. Reachability and remediation must be reviewed before a live release; no unrelated blanket dependency update was folded into this phase.

## Remaining live gates

The code slice is complete, but it cannot legitimately prove a real sign-in until the owner authorizes creation or selection of a dedicated Supabase project and a protected Vercel target. The next bounded phase is **live provider binding and owner acceptance**, not customer onboarding:

1. approve the dedicated Supabase project, region/plan and the target Vercel project/domain;
2. configure owner-only Supabase Auth and register the confidential OAuth client;
3. place public Config and private Secret values in their correct environments;
4. establish Vercel Authentication for all deployment surfaces before exposing the provider entry;
5. bind the dedicated PostgreSQL runtime only through the separately reviewed bootstrap/grant path;
6. run the real HTTPS flow: sign in, approve, callback, session persistence, expiry/logout, denial and non-owner denial;
7. supply a verified disposable local PostgreSQL fixture and rerun the protected account/hosting suites; and
8. review the current dependency advisories and existing bundle warning before deployment authorization.

No Supabase project, database, OAuth client, user, Vercel environment value, domain, paid resource or deployment was created in this implementation phase. No customer may be onboarded from this local result.
