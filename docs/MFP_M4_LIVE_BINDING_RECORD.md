# M4 live Supabase and Vercel binding record

Date: 2026-11-05

Repository: `armentrout1/ModernFloorPlanner`

Status: **LIVE PROVIDER BINDING COMPLETE / DATABASE HARDENED / NATIVE AUTH MIGRATION READY FOR DEPLOYMENT**

This record captures the approved live-provider setup without storing passwords, private keys, session secrets, or the owner's personal email address in the public repository. The exact owner email is recorded only in the ignored local operator note `docs/MFP_SUPABASE_OWNER.local.md`.

## Native Supabase Auth migration — 2026-11-05

The application no longer uses Supabase's beta OAuth-server/client redirect, `/oauth/consent`, `/api/auth/callback`, PKCE correlation rows, or `openid-client`. The Account dialog now provides email/password sign-in, sign-up, email confirmation, password recovery, and **Continue as guest (local only)**.

The security boundary is:

1. the browser sends the password only to Supabase Auth using the public project URL and publishable key;
2. the browser sends the returned short-lived access token once to same-origin `/api/auth/login`;
3. the application server independently calls Supabase `getUser(token)` and accepts only its verified user UUID;
4. the application rotates its existing opaque HttpOnly, Secure, SameSite=Lax session under the durable browser-context lock; and
5. the Supabase token is cleared from the temporary browser client and is never stored in an application session or application table.

Email, user metadata, organization ownership and the Supabase dashboard account are not application authorization rules. Workspace authorization remains the application principal, active membership, explicitly selected workspace and current MFP session context. Local guest drafts remain separate and are not uploaded on sign-in.

Required Supabase Auth URL configuration for production is the exact site URL `https://modern-floor-planner.vercel.app` plus redirects `https://modern-floor-planner.vercel.app/account/confirm` and `https://modern-floor-planner.vercel.app/account/reset-password`.

Local verification for this migration: TypeScript PASS; production build PASS; unit suite **720/720 PASS**; focused account-choice browser test **1/1 PASS**. The disposable PostgreSQL/HTTPS acceptance suite stopped at its mandatory preflight because `MFP_TEST_DATABASE_URL` and `MFP_TEST_DATA_DIRECTORY` were not supplied; no live database was substituted.

## Supabase resource

- Organization: `Armenrout1` (dashboard spelling)
- Plan: Free, `$0/month` at creation
- Project: `Modern Floor Planner`
- Project reference: `frryprsnfzlghhmwpmos`
- Project URL: `https://frryprsnfzlghhmwpmos.supabase.co`
- Region: East US (Ohio), `us-east-2`
- Compute: Nano
- Observed status: Healthy
- Owner account: privately recorded in the ignored local operator note; it is not an application authorization rule
- Application tables: 14 expected tables, all empty at binding completion
- Application-table security: RLS enabled and forced on all 14 tables

The selected serverless runtime endpoint is the shared transaction pooler:

- Host: `aws-0-us-east-2.pooler.supabase.com`
- Port: `6543`
- Database: `postgres`
- User: `mfp_app.frryprsnfzlghhmwpmos`
- Required connection mode: `transaction`
- Required TLS parameter: `sslmode=require`; the application strengthens hosted TLS to certificate and hostname verification

The administrative database password and generated application password are intentionally absent. The administrative credential remains owner-managed. The generated `mfp_app` credential exists only in the encrypted Vercel Production `DATABASE_URL`; it was not written to the repository or operator note.

The live role boundary is:

- `mfp_object_owner`: NOLOGIN owner of the 14 application tables;
- `mfp_runtime`: NOLOGIN exact runtime permission role; and
- `mfp_app`: LOGIN role inheriting only `mfp_runtime`.

Supabase's provider-managed admin-only role memberships were retained. They cannot inherit or `SET ROLE` into the application roles. The temporary explicit owner membership needed for default-privilege hardening was revoked immediately after the transaction completed. `mfp_app` cannot create database objects, cannot create temporary tables, owns no application objects and cannot assume the owner role.

## Vercel resource

- Team: `DblA's projects` (`dblas-projects`)
- Project: `modern-floor-planner`
- Project ID: `prj_4rthmvnwq1ue49voEAT7YdClueiB`
- Node.js runtime: `24.x`
- Serverless region: `cle1`
- Git repository: `armentrout1/ModernFloorPlanner`
- Canonical production domain: `https://modern-floor-planner.vercel.app`
- Production deployment before the native-auth migration: `dpl_684M2MQv39xjMeZN4HCHyhnXePjh`, commit `1f574154e29e3a7f37caeee35ef5819b2af4636b`

The original binding step created no deployment; the production deployment above was created later and is recorded here so the current operational state is not mistaken for the earlier checkpoint.

## Environment-variable status

| Variable | Visibility | Target | Status |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser-public | Development, Preview, Production | Configured |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-public | Development, Preview, Production | Configured |
| `MFP_OIDC_ISSUER` | Server | Production | Obsolete; remove after the native-auth deployment is verified |
| `MFP_DATABASE_CONNECTION_MODE` | Server | Production | Configured as `transaction` |
| `MFP_DATABASE_APP_MAX` | Server | Production | Configured as `1` |
| `MFP_DATABASE_SESSION_MAX` | Server | Production | Configured as `1` |
| `DATABASE_URL` | Secret | Production | Configured with restricted `mfp_app` transaction-pooler login; value remains concealed |
| `MFP_OIDC_CLIENT_ID` | Server | Production | Obsolete; remove after the native-auth deployment is verified |
| `MFP_OIDC_CLIENT_AUTH_METHOD` | Server | Production | Obsolete; remove after the native-auth deployment is verified |
| `MFP_OIDC_CLIENT_SECRET` | Secret | Production | Obsolete; keep concealed and remove after verified deployment |
| `MFP_APP_ORIGIN` | Server | Production | Configured |
| `MFP_OIDC_CALLBACK_URI` | Server | Production | Obsolete; remove after the native-auth deployment is verified |
| `MFP_SESSION_SECRET` | Secret | Production | Configured; generated securely and concealed |

The public client uses only the publishable key. A Supabase secret key or legacy service-role key must never be exposed through a `VITE_` variable.

## Live acceptance completed

On 2026-11-05 the reviewed empty-database bootstrap boundary was completed against the live Supabase project. Direct catalog verification confirmed exact object ownership, role memberships, grants, forced RLS, zero application rows and no residual temporary owner membership. A login using the restricted role passed through both the direct endpoint and the shared transaction pooler. Vercel's encrypted Production `DATABASE_URL` was then replaced with the restricted pooled login. No password was printed or committed, and the clipboard was cleared by the bootstrap runner.

Supabase Auth, the controlled owner user, trusted application origin, restricted database binding and Vercel deployment protection are configured. The former confidential OAuth client is no longer an application dependency and its variables are scheduled for removal after native-auth production acceptance.

The connected Supabase advisor API denied this operator connection permission, so no dashboard-advisor result is claimed. The direct PostgreSQL catalog, privilege, RLS and login checks above are the authoritative acceptance evidence for this binding.

## Remaining release gates

1. Deploy the native-auth migration and record its SHA plus Vercel deployment ID.
2. Prove real owner sign-in, sign-out, refresh, password-recovery entry and local guest journeys against the canonical domain.
3. Remove the obsolete `MFP_OIDC_*` Production variables only after that smoke passes.
4. Review backup/recovery behavior and the already recorded dependency advisories before customer onboarding.

Supabase dashboard ownership is operational metadata only. Runtime identity remains the verified issuer-plus-subject pair and workspace membership; neither an email address nor organization name grants application access.
