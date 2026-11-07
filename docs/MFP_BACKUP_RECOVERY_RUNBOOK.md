# Modern Floor Planner backup and recovery runbook

Date: 2026-11-07

Status: **LOGICAL BACKUP COMMAND IMPLEMENTED / DISPOSABLE FULL-RESTORE REHEARSAL PASSED / FIRST PRODUCTION EXPORT STILL AN OPERATOR STEP**

Provider: Supabase project `frryprsnfzlghhmwpmos` in organization `Armenrout1` (dashboard spelling). This document intentionally contains no password, database URL, token, private key or owner email address.

## What this protects

The repository command creates a PostgreSQL custom-format logical dump, validates its catalog, and writes a SHA-256 checksum plus a nonsecret JSON manifest. It preserves application schema, data, indexes, constraints, functions, triggers, row-level-security policies, object owners and object privileges.

This is the zero-additional-cost recovery path for the current Supabase Free project. Do not assume provider daily restore points or point-in-time recovery are available on that plan. Logical exports are not PITR: changes made after an export cannot be reconstructed from that export. Recheck the current [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) before changing the plan or making a recovery promise.

PostgreSQL dumps do not contain role definitions or database-level grants. A recovery target must already have the reviewed MFP roles, and the database-level restriction step must be reapplied and verified before application traffic is allowed.

## Safe operating rules

- Never put a database password, connection URL, dump, manifest containing secrets, or restored customer data in Git.
- Use a direct administrative connection obtained for the specific backup operation. The application's restricted pooled `DATABASE_URL` is not a backup credential.
- `db:backup` deliberately reads only `MFP_BACKUP_DATABASE_URL`; it never falls back to `DATABASE_URL`.
- The output directory is mandatory and must be outside this repository.
- Keep the `.dump`, `.manifest.json` and `.sha256` files together. Copy the set to an encrypted off-device or off-site location.
- Create an export before every schema migration and before any authorized destructive data operation. During a supervised pilot, also create one weekly. Rehearse a restore at least monthly and after a PostgreSQL major-version/tooling change.
- A dump is not accepted merely because `pg_dump` exited successfully. Its catalog, checksum and a restore into an isolated target must pass.

## Create a backup

Install a supported PostgreSQL client whose `pg_dump` major version is the same as or newer than the server. In a private PowerShell session, set the values without placing them in a committed file:

```powershell
$env:MFP_BACKUP_DATABASE_URL = '<temporary direct administrative PostgreSQL URL>'
$env:MFP_BACKUP_OUTPUT_DIRECTORY = 'D:\Modern Floor Planner Backups'
$env:MFP_PG_BIN = 'C:\Program Files\PostgreSQL\17\bin' # optional when tools are already on PATH
npm run db:backup
Remove-Item Env:MFP_BACKUP_DATABASE_URL
```

The command prints only the output paths and SHA-256 digest, never the supplied URL. A successful run produces:

- `<database>-<timestamp>-<random>.dump`
- the matching `.dump.manifest.json`
- the matching `.dump.sha256`

Confirm the three files exist in the external destination, copy them to the approved encrypted secondary location, and record the date/operator/storage location without recording credentials.

## Recovery procedure

1. Declare the recovery incident and stop application writes. Preserve the damaged database; do not restore over it.
2. Select the newest approved dump whose checksum and retention record are intact. Verify the SHA-256 value and run `pg_restore --list <dump>`.
3. Create a separate empty recovery database. Verify its provider, project, host, database name and responsible operator before any restore command.
4. Provision/review the required dedicated owner, runtime and login roles. Do not map application objects to `anon`, `authenticated`, `service_role` or a broad administrator.
5. Restore with `pg_restore --exit-on-error --single-transaction`. Resolve ownership only through an explicit reviewed role-mapping plan; do not silently discard the authorization model.
6. Reapply the reviewed database-level restrictions from `database/restrict-database.sql`; role definitions and database ACLs are outside a per-database `pg_dump`.
7. Compare table row counts and the application-schema fingerprint: tables, indexes, constraints, policies, forced RLS, triggers, owners and effective runtime privileges.
8. Run `test:database:privileges`, `test:authorization:db`, `test:accounts:db`, `test:physical:db` and the account/browser acceptance against the isolated recovery target. Confirm the restricted login cannot read `users`, create objects or bypass workspace ownership.
9. Have the owner open a representative saved plan and verify name, geometry, quantities, current revision and save history. Never use customer records for ad hoc enumeration.
10. Only after review, bind a non-production deployment to the recovery target, smoke it, then authorize a controlled production cutover. Keep the former target available for rollback until acceptance is signed off.

## Automated disposable rehearsal

`npm run test:backup-restore` is guarded by `MFP_TEST_DATABASE_URL` and `MFP_TEST_DATA_DIRECTORY`. It accepts only the known loopback `mfp_test` disposable cluster, creates unique source and restore databases, seeds a representative principal/workspace/saved plan, performs a real custom-format dump and restore, compares data plus the security/schema fingerprint, tests the restored restricted runtime login, and removes only its generated databases and temporary backup files.

The 2026-11-07 rehearsal passed with:

- 14/14 application tables restored with matching row counts;
- 14/14 tables still using enabled and forced RLS;
- all indexes, constraints, policies, triggers, owners and effective runtime table privileges matching the source;
- the representative current plan/revision JSON and identifiers matching exactly;
- immutable saved-history enforcement still rejecting a revision rewrite;
- the restricted restored login able to read authorized application data but denied legacy `users` data and DDL.

This proves the procedure against a fully migrated disposable database. It does **not** claim that a production dump has been downloaded, copied off-site, or restored. The first production export requires the temporary direct administrative credential and approved external storage at execution time.
