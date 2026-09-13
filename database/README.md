# Explicit database setup

These are operator-run setup artifacts for an approved, dedicated Modern Floor Planner database. They are not application startup migrations and do not authorize live execution. Supabase and Railway live configuration remain unverified. The existing `migrations/0001` through `0004` files remain unchanged.

The application currently uses the `public` schema. The helper accepts another schema for isolated setup testing; this does not add custom-schema support to the running application. Use a direct administrative PostgreSQL connection for setup, never a transaction-pooler endpoint.

## Roles and preconditions

Create a dedicated `mfp_` object-owner role and a separate `mfp_` runtime-permissions role, both `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`. Neither role may belong to another role. The restricted application login inherits only the runtime-permissions role, owns no objects, and must not be able to assume the object owner. Do not grant it a provider administrator, Data API, or migration role.

The owner must be dedicated to this database and schema: hardening checks for other owned application objects and database ownership. Revoking global default privileges for this owner is intentional. These scripts do not create roles, reassign an existing schema, or take ownership from another application. Supply credentials through an approved secret mechanism such as a configured `PGSERVICE`; never put passwords in commands or committed files.

## Ordered operator steps

1. Verify the approved target database, direct connection, roles, and an empty target schema. Grant the object owner `USAGE, CREATE` on that schema through the approved administrator. Bootstrap refuses existing application relations, functions, and types.
2. Run `bootstrap.sql` with `ON_ERROR_STOP`, `schema_name=public`, and the explicit `object_owner`. It creates only the original empty `users` and `floor_plans` tables. No identities, memberships, or customer rows are seeded.
3. In a reserved direct session, set the role to the object owner and `search_path` to `public, pg_catalog`; run `0001_workspace_authorization.sql`, `0002_oidc_sessions_accounts.sql`, `0003_physical_plans.sql`, and `0004_physical_project_lifecycle.sql` in that order. Each historical file owns its transaction. Reset the role and search path afterward, including on failure.
4. Run `harden.sql` with the same `schema_name`, `object_owner`, and the explicit `runtime_role`. It validates the expected objects and role relationships before applying grants and RLS.
5. Separately approve and run `restrict-database.sql` with the exact current `database_name` and `runtime_role` for this dedicated product database. This database-wide step revokes inherited `CREATE` and `TEMPORARY` from `PUBLIC`, existing API roles, and the runtime roles, then grants runtime `CONNECT`. It is deliberately not hidden inside schema hardening. Without this step, temporary DDL is not claimed to be denied.

Example bootstrap invocation, using an already configured connection service:

```text
psql --no-password --set=ON_ERROR_STOP=1 --set=schema_name=public --set=object_owner=mfp_object_owner --file=database/bootstrap.sql
```

`setup.mjs` exports `applyBootstrap`, `applyMigrations`, `applyHardening`, and the separately invoked `applyDatabaseRestrictions`. `applyProviderSchema` runs only the first three. Pass an administrative postgres-js client with `reserve()` and `{ schemaName, ownerRole, runtimeRole }`; the database restriction also requires `databaseName`. Every step holds a reserved connection and rolls back any open transaction, resets role/search path, and releases that same connection afterward. The migration sequence holds one connection even when the supplied pool has multiple connections and concurrent callers.

This sequence is not atomic across files. If a later migration fails, earlier committed steps remain. Preserve the resulting database state and inspect the error and completed steps before choosing an authorized continuation. Do not automatically rerun bootstrap, drop objects, reassign ownership, or treat cleanup of a disposable test fixture as a production rollback procedure.

## Runtime permission contract

All 14 application tables have enabled and forced RLS. These policies constrain server SQL operations; they are not tenant policies. Express still resolves the trusted identity and checks workspace membership for each operation. No `auth.uid()` mapping, browser SQL access, or `SECURITY DEFINER` bypass is introduced.

| Objects | Runtime permissions |
| --- | --- |
| `users`, `users_id_seq` | None; historical password rows remain inert. |
| `floor_plans` | Select, insert, update, delete; usage of its serial sequence only. |
| `application_principals`, `external_identities` | Select and insert; update privilege only on `status` for row locks, with a policy that refuses updated rows. |
| `workspaces`, `workspace_memberships`, `auth_browser_contexts`, `oidc_login_transactions`, `physical_plans` | Select, insert, update. |
| `mfp_sessions` | Select, insert, update, delete for connect-pg-simple. |
| `workspace_creation_receipts`, `physical_plan_revisions`, `physical_save_receipts`, `physical_lifecycle_receipts` | Select and insert only. |

The identity update policy uses `USING (true)` for the existing `FOR SHARE` checks and `WITH CHECK (false)` to deny mutation. Immutable history retains the existing enabled trigger protections. Runtime receives no execute grant on the trigger function, table ownership, sequence `setval`, permanent schema DDL, truncate, or privilege-management authority. Existing unowned legacy sketches remain unowned and inaccessible through authorized application reads; no ownership is inferred.

Hardening revokes application table, sequence, and function privileges from `PUBLIC`, existing `anon`, `authenticated`, `service_role`, and `authenticator` roles, plus runtime logins before exact regrant. Existing column grants or application RLS policies cause a preflight failure instead of being silently combined with the new rules. Global and schema-specific default table, sequence, and function grants for the dedicated owner are revoked too. Future objects require their own reviewed grants and RLS. Provider Data API exposure settings and any additional provider-specific privileges remain a separate live verification gate.

## Disposable verification

`npm run test:database:privileges` requires both `MFP_TEST_DATABASE_URL` and `MFP_TEST_DATA_DIRECTORY`; it never falls back to the application's `DATABASE_URL`. The fixture checks the loopback address, disposable database/user names, and actual PostgreSQL data directory before creating a uniquely named test database and roles. Cleanup removes only those recorded fixture objects after verifying database identity. The tests exercise real account, legacy sketch, physical revision/lifecycle, session-store, denied privilege, and setup-recovery operations. They do not provision or validate a live Supabase or Railway project.
