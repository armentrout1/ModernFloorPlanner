# M4 live Supabase and Vercel binding record

Date: 2026-11-04

Repository: `armentrout1/ModernFloorPlanner`

Status: **PROVIDER RESOURCES CREATED / PARTIALLY BOUND / NOT DEPLOYED**

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

The selected serverless runtime endpoint is the shared transaction pooler:

- Host: `aws-0-us-east-2.pooler.supabase.com`
- Port: `6543`
- Database: `postgres`
- User: `postgres.frryprsnfzlghhmwpmos`
- Required connection mode: `transaction`
- Required TLS parameter: `sslmode=require`; the application strengthens hosted TLS to certificate and hostname verification

The database password is intentionally absent. If it contains reserved URI characters, it must be percent-encoded before it is embedded in `DATABASE_URL`.

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
| `DATABASE_URL` | Secret | Production | Configured; value remains concealed |
| `MFP_OIDC_CLIENT_ID` | Server | Production | Pending confidential OAuth client |
| `MFP_OIDC_CLIENT_AUTH_METHOD` | Server | Production | Pending confidential OAuth client |
| `MFP_OIDC_CLIENT_SECRET` | Secret | Production | Pending confidential OAuth client |
| `MFP_APP_ORIGIN` | Server | Production | Pending canonical HTTPS origin |
| `MFP_OIDC_CALLBACK_URI` | Server | Production | Pending canonical callback |
| `MFP_SESSION_SECRET` | Secret | Production | Configured; generated securely and concealed |

The public client uses only the publishable key. A Supabase secret key or legacy service-role key must never be exposed through a `VITE_` variable.

## Remaining release gates

1. Enable and review the Supabase OAuth server prerequisites, asymmetric signing, owner-only registration policy, and confidential client.
2. Select the canonical HTTPS origin and exact callback URI, then bind the remaining OIDC variables.
3. Apply the reviewed empty-database bootstrap, migrations, grants, Data API restrictions, and RLS controls through the approved administrative path.
4. Establish owner-only protection across every Vercel deployment surface.
5. Link the intended Git repository only when the release/deployment step is explicitly authorized.
6. Prove real owner approval, denial, callback, session, persistence, restart, and non-owner-denial journeys before release.

Supabase dashboard ownership is operational metadata only. Runtime identity remains the verified issuer-plus-subject pair and workspace membership; neither an email address nor organization name grants application access.
