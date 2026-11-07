# Onboarding and saved-plans release results

Date: 2026-11-06

Repository: `armentrout1/ModernFloorPlanner`

Status: **DEPLOYED / LIVE-VERIFIED**

Owning tracker: [issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4)

Implementation commit: `4f5845d75a602142439cc13cb8ff308eea210946`

Production deployment: `dpl_Gv6dmHCqKUeC2untNKM9UEa6C8Ri`

Canonical URL: `https://modern-floor-planner.vercel.app`

## Product result

- A first authenticated user names the first workspace explicitly. The application no longer silently creates **My Workspace**.
- A returning user with exactly one authorized workspace resumes it automatically after the server verifies the current Supabase principal and membership.
- **My Plans** is the focused saved-plan surface. It supports creating, opening, renaming, duplicating and deleting authorized plans without introducing a separate dashboard.
- The editor remembers the most recently opened authorized plan per verified principal and workspace. It can resume that plan after refresh only when there is no local draft to replace.
- The editable plan title reports honest local, unsaved, saving, saved, required and retryable-error states.
- Guest drafts remain local and separate. Signing in does not upload or assign them, and a workspace or account change cannot reuse stale private context.
- Deleting the currently open server plan detaches the local editor from that server record but does not discard the local drawing.

## Security and data boundaries

The browser's recent-plan preference is a convenience pointer, not authority. Every session, workspace and plan operation is revalidated by the existing server-side Supabase identity, membership, role and resource-ownership checks. A remembered identifier cannot grant access. No schema migration, production data rewrite or guest-draft upload was part of this release.

## Verification

- TypeScript/application check: PASS.
- Production application build: PASS.
- Unit and integration suite: **726/726 PASS**.
- Changed account and saved-plan browser coverage: **75/75 PASS**.
- Full browser regression suite: **213/213 PASS** in 15.8 minutes, including authentication, sign-out/refresh, workspace onboarding, save/open/duplicate behavior, geometry, calculations and responsive layouts.
- Whitespace/diff check: PASS.

The separate disposable PostgreSQL/HTTPS account suite did not start because `MFP_TEST_DATABASE_URL` and `MFP_TEST_DATA_DIRECTORY` were not configured. No live or unknown database was substituted, and this document does not claim that external fixture run.

## Production acceptance

The release was built as a Vercel production artifact, deployed first without changing the canonical alias, route- and asset-smoked, then promoted. After promotion:

- `/`, `/quick-room` and `/physical-draft` returned `200`;
- the current JavaScript, lazy command-palette and CSS assets returned `200` with the correct content types;
- `/api/auth/session` returned `200` with an anonymous, sanitized session response on the trusted canonical host;
- the bounded Vercel warning/error scan for the new deployment returned no entries and no runtime error clusters.

The temporary unaliased candidate hostname correctly failed the auth-session host check because only the canonical application origin is trusted. The same endpoint passed immediately after canonical promotion.

## Rollback reference

The immediately previous production deployment is `dpl_7UvNV8WwCffApkFkfAMLq6Q9hUyj`. Ordinary Vercel rollback or a Git revert of implementation commit `4f5845d75a602142439cc13cb8ff308eea210946` remains available; no force-push or destructive database action is required.
