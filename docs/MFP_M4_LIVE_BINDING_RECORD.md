# M4 live Supabase and Vercel binding record

Date: 2026-11-05

Repository: `armentrout1/ModernFloorPlanner`

Status: **LIVE PROVIDER BINDING COMPLETE / DATABASE HARDENED / NOT DEPLOYED**

This record captures the approved live-provider setup without storing passwords, private keys, session secrets, or the owner's personal email address in the public repository. The exact owner email is recorded only in the ignored local operator note `docs/MFP_SUPABASE_OWNER.local.md`.

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
- Git connection: not connected
- Deployment/domain: none

No deployment was created by this binding step.

## Environment-variable status

| Variable | Visibility | Target | Status |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser-public | Development, Preview, Production | Configured |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-public | Development, Preview, Production | Configured |
| `MFP_OIDC_ISSUER` | Server | Production | Configured |
| `MFP_DATABASE_CONNECTION_MODE` | Server | Production | Configured as `transaction` |
| `MFP_DATABASE_APP_MAX` | Server | Production | Configured as `1` |
| `MFP_DATABASE_SESSION_MAX` | Server | Production | Configured as `1` |
| `DATABASE_URL` | Secret | Production | Configured with restricted `mfp_app` transaction-pooler login; value remains concealed |
| `MFP_OIDC_CLIENT_ID` | Server | Production | Configured |
| `MFP_OIDC_CLIENT_AUTH_METHOD` | Server | Production | Configured |
| `MFP_OIDC_CLIENT_SECRET` | Secret | Production | Configured; value remains concealed |
| `MFP_APP_ORIGIN` | Server | Production | Configured |
| `MFP_OIDC_CALLBACK_URI` | Server | Production | Configured |
| `MFP_SESSION_SECRET` | Secret | Production | Configured; generated securely and concealed |

The public client uses only the publishable key. A Supabase secret key or legacy service-role key must never be exposed through a `VITE_` variable.

## Live acceptance completed

On 2026-11-05 the reviewed empty-database bootstrap boundary was completed against the live Supabase project. Direct catalog verification confirmed exact object ownership, role memberships, grants, forced RLS, zero application rows and no residual temporary owner membership. A login using the restricted role passed through both the direct endpoint and the shared transaction pooler. Vercel's encrypted Production `DATABASE_URL` was then replaced with the restricted pooled login. No password was printed or committed, and the clipboard was cleared by the bootstrap runner.

Supabase Auth, the confidential OAuth client, the controlled owner user, the trusted origin/callback variables and Vercel All Deployments protection are configured. This records provider configuration, not a deployed or customer-ready application.

The connected Supabase advisor API denied this operator connection permission, so no dashboard-advisor result is claimed. The direct PostgreSQL catalog, privilege, RLS and login checks above are the authoritative acceptance evidence for this binding.

## Remaining release gates

1. Link the intended Git repository and create the first production deployment only when that release step is explicitly authorized.
2. Prove real owner approval, denial, callback, session, persistence, instance-restart and non-owner-denial journeys against the deployed revision.
3. Record the deployed SHA, provider deployment ID/domain and focused production smoke result.
4. Review backup/recovery behavior and the already recorded dependency advisories before customer onboarding.

Supabase dashboard ownership is operational metadata only. Runtime identity remains the verified issuer-plus-subject pair and workspace membership; neither an email address nor organization name grants application access.
