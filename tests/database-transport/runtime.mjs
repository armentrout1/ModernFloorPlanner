import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import postgres from 'postgres';
import pg from 'pg';
const { Pool } = pg;
import { createDatabaseTls } from './tls.mjs';
import { createFixtureTls } from '../accounts/tls-fixture.mjs';
import { startFixtureProcess } from '../accounts/runtime.mjs';
import { applyProviderSchema, applyDatabaseRestrictions } from '../../database/setup.mjs';

const image = 'mfp-database-readiness:pg17-pgbouncer1.25.2';
const label = 'mfp.database.fixture';
const ports = [['127.0.0.1', 55489], ['127.0.0.1', 55490], ['127.0.0.2', 54450], ['127.0.0.3', 54451]];
const docker = args => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds));
async function available() {
  for (const [host, port] of ports) await new Promise((done, reject) => {
    const server = createServer(); server.once('error', () => reject(new Error('Database fixture port is occupied; no existing process was stopped')));
    server.listen({ host, port, exclusive: true }, () => server.close(done));
  });
}

/** Own only fresh labeled containers/network and ephemeral certificates, never a live DB URL. */
export async function createTransportFixture() {
  await available();
  docker(['build', '--tag', image, '--file', 'tests/database-transport/Dockerfile', 'tests/database-transport']);
  const imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}']);
  const id = randomUUID().replaceAll('-', ''); const network = 'mfp-db-' + id;
  const pgName = network + '-postgres', poolName = network + '-pooler';
  const resources = []; const children = []; let networkCreated = false; let sql; let appTls;
  const tls = createDatabaseTls();
  const adminPassword = randomBytes(24).toString('base64url'); const runtimePassword = randomBytes(24).toString('base64url');
  const database = 'mfp_transport_test';
  const url = (user, password, port, name = database) => `postgres://${user}:${password}@localhost:${port}/${name}?sslmode=verify-full`;
  const adminUrl = url('mfp_fixture_admin', adminPassword, 55489);
  const runtimeUrl = url('mfp_runtime', runtimePassword, 55490);
  const ca = readFileSync(tls.file('ca.pem'), 'utf8');
  const start = async (file, env, ready) => {
    const owned = await startFixtureProcess(file, env, ready); let stopped = false;
    const handle = { child: owned.child, stop: async () => {
      if (stopped || owned.child.exitCode !== null || owned.child.signalCode !== null) return;
      stopped = true; await owned.stop();
    } }; children.push(handle); return handle;
  };
  const cleanup = async () => {
    for (const child of children.reverse()) await child.stop();
    await sql?.end({ timeout: 2 });
    for (const name of resources.reverse()) {
      assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "' + label + '"}}', name]), id);
      docker(['rm', '--force', name]);
    }
    if (networkCreated) {
      assert.equal(docker(['network', 'inspect', '--format', '{{index .Labels "' + label + '"}}', network]), id);
      docker(['network', 'rm', network]);
    }
    appTls?.cleanup(); tls.cleanup();
  };
  try {
    writeFileSync(tls.file('admin-password'), adminPassword);
    writeFileSync(tls.file('pg_hba.conf'), 'local all all trust\nhostssl all all all scram-sha-256\nhostnossl all all all reject\n');
    writeFileSync(tls.file('userlist.txt'), `"mfp_fixture_admin" "${adminPassword}"\n"mfp_runtime" "${runtimePassword}"\n`);
    writeFileSync(tls.file('pgbouncer.ini'), `[databases]\n${database} = host=mfp-postgres port=5432 dbname=${database}\n[pgbouncer]\nlisten_addr=0.0.0.0\nlisten_port=6432\nunix_socket_dir=/tmp\nauth_type=scram-sha-256\nauth_file=/fixture/userlist.txt\nadmin_users=mfp_fixture_admin\npool_mode=transaction\nmax_prepared_statements=0\ndefault_pool_size=2\nmax_client_conn=20\nserver_reset_query=DISCARD ALL\nserver_reset_query_always=1\nclient_tls_sslmode=require\nclient_tls_ca_file=/fixture/ca.pem\nclient_tls_cert_file=/tmp/mfp-tls/server.pem\nclient_tls_key_file=/tmp/mfp-tls/server-key.pem\nserver_tls_sslmode=verify-full\nserver_tls_ca_file=/fixture/ca.pem\nlog_connections=0\nlog_disconnections=0\nlog_pooler_errors=0\n`);
    docker(['network', 'create', '--label', label + '=' + id, network]); networkCreated = true;
    const common = ['--detach', '--network', network, '--label', label + '=' + id, '--mount', 'type=bind,source=' + tls.directory + ',target=/fixture,readonly'];
    const certs = 'mkdir -p /tmp/mfp-tls; cp /fixture/server.pem /fixture/server-key.pem /tmp/mfp-tls/; chown -R postgres:postgres /tmp/mfp-tls; chmod 600 /tmp/mfp-tls/server-key.pem; ';
    docker(['run', '--name', pgName, ...common, '--network-alias', 'mfp-postgres', '--publish', '127.0.0.1:55489:5432', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m',
      '--env', 'POSTGRES_USER=mfp_fixture_admin', '--env', 'POSTGRES_DB=' + database, '--env', 'POSTGRES_PASSWORD_FILE=/fixture/admin-password',
      '--entrypoint', '/bin/bash', image, '-ec', certs + 'exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/mfp-tls/server.pem -c ssl_key_file=/tmp/mfp-tls/server-key.pem -c hba_file=/fixture/pg_hba.conf -c log_statement=none']);
    resources.push(pgName); console.log('Transport fixture: owned PostgreSQL container started.');
    // The admin setup uses verified TLS too; credentials and query bodies are never logged.
    sql = postgres({ host: 'localhost', port: 55489, user: 'mfp_fixture_admin', password: adminPassword, database,
      ssl: { ca, rejectUnauthorized: true, servername: 'localhost' }, max: 1, prepare: false, connect_timeout: 2, onnotice: () => {} });
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const probe = new Pool({ host: 'localhost', port: 55489, user: 'mfp_fixture_admin', password: adminPassword, database,
        ssl: { ca, rejectUnauthorized: true, servername: 'localhost' }, max: 1, connectionTimeoutMillis: 1500, query_timeout: 2000 });
      try { await probe.query('select 1'); ready = true; break; }
      catch { await wait(200); } finally { await probe.end(); }
    }
    assert.ok(ready, 'Fresh TLS PostgreSQL external listener did not become ready');
    const [identity] = await sql`select current_database() as database,current_user as username,current_setting('data_directory') as directory,version() as version`;
    assert.equal(identity.database, database); assert.equal(identity.username, 'mfp_fixture_admin'); assert.equal(identity.directory, '/var/lib/postgresql/data');
    await sql.unsafe(`create role mfp_object_owner nologin; create role mfp_runtime_permissions nologin; create role mfp_runtime login password '${runtimePassword}'; grant mfp_runtime_permissions to mfp_runtime; create role anon nologin; create role authenticated nologin; create role service_role nologin; grant usage,create on schema public to mfp_object_owner;`);
    await applyProviderSchema(sql, { schemaName: 'public', ownerRole: 'mfp_object_owner', runtimeRole: 'mfp_runtime_permissions' });
    await applyDatabaseRestrictions(sql, { schemaName: 'public', ownerRole: 'mfp_object_owner', runtimeRole: 'mfp_runtime_permissions', databaseName: database });
    docker(['run', '--name', poolName, ...common, '--publish', '127.0.0.1:55490:6432', '--entrypoint', '/bin/bash', image, '-ec', certs + 'exec gosu postgres pgbouncer /fixture/pgbouncer.ini']); resources.push(poolName);
    console.log('Transport fixture: exact provider SQL applied; transaction pooler started.');
    appTls = createFixtureTls();
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MFP_|PG|DATABASE_URL$|VERCEL|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|NODE_TLS_REJECT_UNAUTHORIZED$)/i.test(key)));
    Object.assign(env, { NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: appTls.ca,
      MFP_ACCOUNTS_APP_ORIGIN: 'https://127.0.0.2:54450', MFP_ACCOUNTS_ISSUER_ORIGIN: 'https://127.0.0.3:54451',
      MFP_ACCOUNTS_TLS_KEY: appTls.key, MFP_ACCOUNTS_TLS_CERT: appTls.cert, MFP_ACCOUNTS_SPKI: appTls.spki,
      MFP_ACCOUNTS_CONTROL_SECRET: randomBytes(32).toString('base64url'), MFP_APP_ORIGIN: 'https://127.0.0.2:54450',
      MFP_OIDC_ISSUER: 'https://127.0.0.3:54451', MFP_OIDC_CALLBACK_URI: 'https://127.0.0.2:54450/api/auth/callback',
      MFP_OIDC_CLIENT_ID: 'mfp-database-transport-client', MFP_OIDC_CLIENT_AUTH_METHOD: 'client_secret_basic',
      MFP_OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'), MFP_SESSION_SECRET: randomBytes(48).toString('base64url'),
      DATABASE_URL: runtimeUrl, MFP_DATABASE_CONNECTION_MODE: 'transaction', MFP_DATABASE_APP_MAX: '1', MFP_DATABASE_SESSION_MAX: '1', MFP_DATABASE_CA_CERT: ca,
      MFP_TRANSPORT_ADMIN_URL: adminUrl, MFP_TRANSPORT_DIRECT_URL: url('mfp_runtime', runtimePassword, 55489),
      MFP_TRANSPORT_POOL_ADMIN_URL: url('mfp_fixture_admin', adminPassword, 55490, 'pgbouncer'), MFP_TRANSPORT_WRONG_CA: readFileSync(tls.file('wrong-ca.pem'), 'utf8') });
    await start('tests/accounts/issuer.ts', env, 'MFP_TEST_ISSUER_READY');
    let app;
    const startApp = async () => { app = await start('tests/accounts/app-server.ts', env, 'MFP_TEST_APP_READY'); };
    await startApp();
    const versions = { imageId, postgres: identity.version, pgbouncer: docker(['exec', poolName, 'pgbouncer', '--version']).split('\n')[0], base: 'postgres@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0' };
    return { env, cleanup, versions, restartApp: async () => { await app.stop(); await startApp(); } };
  } catch (error) {
    const sanitize = value => String(value).replaceAll(adminPassword, '[synthetic-secret]').replaceAll(runtimePassword, '[synthetic-secret]');
    console.error('Transport fixture stage failure: ' + sanitize(error?.message ?? error));
    for (const name of resources) {
      try {
        const logs = spawnSync('docker', ['logs', '--tail', '25', name], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
        const lines = ((logs.stdout ?? '') + (logs.stderr ?? '')).split('\n').filter(line => /FATAL|ERROR|cannot|failed|invalid|Permission denied/i.test(line));
        for (const line of lines) console.error(sanitize(line));
      } catch { /* Preserve the original failure; cleanup still owns every resource. */ }
    }
    await cleanup(); throw error;
  }
}
