import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { applyBootstrap, applyMigrations, applyHardening, applyDatabaseRestrictions } from '../../database/setup.mjs';

/** No fallback to application DATABASE_URL. Verify live local server identity before creating anything. */
export async function createProviderFixture(options: { harden?: boolean; migrations?: boolean; adminMax?: number } = {}) {
  const supplied = process.env.MFP_TEST_DATABASE_URL, directory = process.env.MFP_TEST_DATA_DIRECTORY;
  assert.ok(supplied && directory, 'Explicit verified disposable PostgreSQL configuration is required');
  const url = new URL(supplied);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', '[::1]', '::1'].includes(url.hostname));
  assert.match(url.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/);
  assert.equal(decodeURIComponent(url.username), 'mfp_test'); assert.equal(url.search, '');
  const normalized = (value: string) => resolve(value).replaceAll('\\', '/').toLowerCase();
  const control = postgres(supplied, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
  const suffix = randomBytes(8).toString('hex');
  const databaseName = `mfp_provider_${suffix}_test`, ownerRole = `mfp_owner_${suffix}`,
    runtimeRole = `mfp_permissions_${suffix}`, loginRole = `mfp_login_${suffix}`;
  const schemaName = 'public', createdRoles: string[] = [];
  let createdDatabase = false, databaseOid: number | undefined;
  let admin: ReturnType<typeof postgres> | undefined, runtime: ReturnType<typeof postgres> | undefined;
  const cleanup = async () => {
    if (runtime) { await runtime.end(); runtime = undefined; }
    if (admin) { await admin.end(); admin = undefined; }
    if (createdDatabase) {
      const [current] = await control`select oid, pg_get_userbyid(datdba) as owner from pg_database where datname=${databaseName}`;
      assert.equal(current?.oid, databaseOid); assert.equal(current?.owner, 'mfp_test');
      await control.unsafe(`DROP DATABASE "${databaseName}"`); createdDatabase = false;
    }
    for (const name of [...createdRoles].reverse()) await control.unsafe(`DROP ROLE "${name}"`);
    createdRoles.length = 0;
    await control.end();
  };
  try {
    const [actual] = await control`select current_database() as database, current_user as username,
      current_setting('data_directory') as directory, host(inet_server_addr()) as address`;
    assert.equal(actual.database, url.pathname.slice(1)); assert.equal(actual.username, 'mfp_test');
    assert.ok(['127.0.0.1', '::1'].includes(actual.address)); assert.equal(normalized(actual.directory), normalized(directory));
    for (const name of [ownerRole, runtimeRole, loginRole]) {
      await control.unsafe(`CREATE ROLE "${name}" ${name===loginRole ? 'LOGIN INHERIT' : 'NOLOGIN NOINHERIT'} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
      createdRoles.push(name);
    }
    await control.unsafe(`GRANT "${runtimeRole}" TO "${loginRole}"`);
    const password = randomBytes(32).toString('hex');
    await control.unsafe(`ALTER ROLE "${loginRole}" PASSWORD '${password}'`);
    // The known disposable cluster may have API-role fixtures already; never alter those roles.
    for (const name of ['anon','authenticated','service_role']) {
      if (!(await control`select 1 from pg_roles where rolname=${name}`).length) {
        await control.unsafe(`CREATE ROLE "${name}" NOLOGIN NOSUPERUSER ${name==='service_role' ? 'BYPASSRLS' : 'NOBYPASSRLS'} NOCREATEDB NOCREATEROLE NOREPLICATION`);
        createdRoles.push(name);
      }
    }
    await control.unsafe(`CREATE DATABASE "${databaseName}"`); createdDatabase = true;
    [{ oid: databaseOid }] = await control`select oid from pg_database where datname=${databaseName}`;
    const adminAddress = new URL(supplied); adminAddress.pathname='/'+databaseName;
    const runtimeAddress = new URL(adminAddress); runtimeAddress.username=loginRole; runtimeAddress.password=password;
    admin = postgres(adminAddress.toString(), { max: options.adminMax ?? 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
    await admin.unsafe(`GRANT USAGE, CREATE ON SCHEMA public TO "${ownerRole}"`);
    const setup = { schemaName, ownerRole, runtimeRole, databaseName };
    await applyBootstrap(admin, setup);
    if (options.migrations !== false) await applyMigrations(admin, setup);
    if (options.harden !== false && options.migrations !== false) { await applyHardening(admin, setup); await applyDatabaseRestrictions(admin, setup); }
    runtime = postgres(runtimeAddress.toString(), { max: 4, prepare: false, connect_timeout: 5, onnotice: () => {} });
    return { admin, runtime, adminUrl: adminAddress.toString(), runtimeUrl: runtimeAddress.toString(),
      databaseName, schemaName, ownerRole, runtimeRole, loginRole, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
