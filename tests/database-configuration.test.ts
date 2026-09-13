import test from 'node:test';
import assert from 'node:assert/strict';
import { rootCertificates, type PeerCertificate, type ConnectionOptions } from 'node:tls';
import pg from 'pg';
import postgres from 'postgres';
import {
  DatabaseConfigurationError, readDatabaseConfiguration, toPostgresOptions, toSessionPoolOptions,
} from '../server/databaseConfiguration';
import { createDatabase, DatabaseConfigurationError as DatabaseError } from '../server/db';
import { readAuthConfiguration } from '../server/authConfiguration';

const local = 'postgres://fixture@127.0.0.1/fixture_database';
const remote = 'postgresql://fixture:p%40ss%3Aword@database.example:6543/fixture_database';
const verified = () => readDatabaseConfiguration(remote, {});

test('database URL is decoded once into explicit database credentials and a numeric port', () => {
  const config = verified();
  assert.equal(config.host, 'database.example'); assert.equal(config.port, 6543);
  assert.equal(config.user, 'fixture'); assert.equal(config.password, 'p@ss:word');
  assert.equal(config.database, 'fixture_database'); assert.ok(config.tls);
  assert.equal(readDatabaseConfiguration(local, {}).port, 5432);
  assert.equal(readDatabaseConfiguration('postgres://fixture:%20p%40ss%20@database.example/fixture', {}).password, ' p@ss ');
});

test('only exact loopback hosts default to plaintext; other hosts require verified TLS', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(readDatabaseConfiguration(`postgres://fixture@${host}/fixture`, {}).tls, false);
  }
  for (const host of ['database.example', 'localhost.example', '127.0.0.2', '127.1']) {
    assert.ok(readDatabaseConfiguration(`postgres://fixture@${host}/fixture`, {}).tls);
    assert.throws(() => readDatabaseConfiguration(`postgres://fixture@${host}/fixture?sslmode=disable`, {}), DatabaseConfigurationError);
  }
});

test('sslmode=require and verify-full both verify the configured hostname in both drivers', () => {
  for (const mode of ['require', 'verify-full']) {
    const config = readDatabaseConfiguration(`${remote}?sslmode=${mode}`, {});
    for (const ssl of [toPostgresOptions(config).ssl, toSessionPoolOptions(config).ssl] as ConnectionOptions[]) {
      assert.equal(ssl.rejectUnauthorized, true); assert.equal(ssl.servername, 'database.example');
      assert.equal(ssl.checkServerIdentity!('ignored.driver.example', { subjectaltname: 'DNS:database.example' } as PeerCertificate), undefined);
      assert.equal(ssl.checkServerIdentity!('database.example', { subjectaltname: 'DNS:other.example' } as PeerCertificate)?.code, 'ERR_TLS_CERT_ALTNAME_INVALID');
    }
  }
});

test('TLS can be explicitly enabled for loopback and verifies IP certificate identity', () => {
  const config = readDatabaseConfiguration(`${local}?sslmode=verify-full`, {});
  const ssl = toSessionPoolOptions(config).ssl as ConnectionOptions;
  assert.equal(ssl.servername, undefined);
  assert.equal(ssl.checkServerIdentity!('ignored', { subjectaltname: 'IP Address:127.0.0.1' } as PeerCertificate), undefined);
  assert.equal(ssl.checkServerIdentity!('ignored', { subjectaltname: 'DNS:localhost' } as PeerCertificate)?.code, 'ERR_TLS_CERT_ALTNAME_INVALID');
});

test('custom PEM trust is validated and applied identically without accepting certificate paths', () => {
  const ca = rootCertificates[0];
  const config = readDatabaseConfiguration(`${remote}?sslmode=require`, { MFP_DATABASE_CA_CERT: ca });
  assert.equal((toPostgresOptions(config).ssl as ConnectionOptions).ca, ca);
  assert.equal((toSessionPoolOptions(config).ssl as ConnectionOptions).ca, ca);
  for (const value of ['', 'C:/secret/ca.pem', '-----BEGIN CERTIFICATE-----bad-----END CERTIFICATE-----', `${ca}unexpected`])
    assert.throws(() => readDatabaseConfiguration(remote, { MFP_DATABASE_CA_CERT: value }), DatabaseConfigurationError);
  assert.throws(() => readDatabaseConfiguration(local, { MFP_DATABASE_CA_CERT: ca }), DatabaseConfigurationError);
});

test('verified TLS refuses the global verification bypass instead of silently weakening transport', () => {
  assert.throws(() => readDatabaseConfiguration(remote, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), DatabaseConfigurationError);
  assert.throws(() => readDatabaseConfiguration(`${local}?sslmode=verify-full`, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), DatabaseConfigurationError);
  assert.equal(readDatabaseConfiguration(local, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }).tls, false);
});

test('all unsupported, duplicate, conflicting, and downgrade URL parameters fail closed', () => {
  for (const query of [
    'sslmode=prefer', 'sslmode=allow', 'sslmode=no-verify', 'sslmode=verify-ca', 'sslmode=',
    'sslmode=require&sslmode=verify-full', 'sslmode=require&sslmode=require',
    'sslmode=require&ssl=false', 'ssl=true', 'host=other.example', 'port=1234', 'user=other',
    'password=secret', 'database=other', 'sslrootcert=C%3A%2Fsecret.pem', 'sslcert=secret.pem',
    'options=-c%20search_path=evil', 'application_name=arbitrary', 'SSLmode=require',
  ]) assert.throws(() => readDatabaseConfiguration(`${remote}?${query}`, {}), DatabaseConfigurationError, query);
});

test('missing or ambiguous binding fields fail without secret details in errors', () => {
  for (const value of [undefined, '', ' ', 'https://fixture:synthetic-secret@host/db', 'postgres://host/db',
    'postgres://fixture@host/', 'postgres://fixture@host/one/two', 'postgres://fixture@host/db#fragment',
    'postgres://fixture:bad%XX@host/db', 'postgres://fixture@host:0/db', 'postgres://fixture@host:65536/db',
    'postgres://fixture@one,two/db', 'postgres://fixture@%2Ftmp/db', ' postgres://fixture@host/db']) {
    assert.throws(() => readDatabaseConfiguration(value, {}), (error: unknown) => {
      assert.ok(error instanceof DatabaseConfigurationError);
      assert.equal(error.message, 'Database binding is not configured or is invalid');
      assert.equal(error.cause, undefined); return true;
    });
  }
});

test('serverless defaults limit each driver pool and transaction mode disables named preparation', () => {
  const standalone = readDatabaseConfiguration(local, {});
  assert.equal(standalone.mode, 'direct'); assert.equal(standalone.appMax, 10); assert.equal(standalone.sessionMax, 5);
  assert.equal(toPostgresOptions(standalone).prepare, true);
  const hosted = readDatabaseConfiguration(remote, { VERCEL: '1' });
  assert.equal(hosted.mode, 'transaction');
  assert.equal(toPostgresOptions(hosted).prepare, false);
  assert.equal(toPostgresOptions(hosted).max, 1); assert.equal(toSessionPoolOptions(hosted).max, 1);
  assert.equal('name' in toSessionPoolOptions(hosted), false);
});

test('explicit pool limits and connection mode are bounded and never guessed from provider hostnames', () => {
  const config = readDatabaseConfiguration(remote, { VERCEL: '1', MFP_DATABASE_CONNECTION_MODE: 'direct', MFP_DATABASE_APP_MAX: '2', MFP_DATABASE_SESSION_MAX: '3' });
  assert.equal(config.mode, 'direct'); assert.equal(config.appMax, 2); assert.equal(config.sessionMax, 3);
  assert.equal(readDatabaseConfiguration(remote, { MFP_DATABASE_CONNECTION_MODE: 'transaction' }).mode, 'transaction');
  for (const key of ['MFP_DATABASE_APP_MAX', 'MFP_DATABASE_SESSION_MAX']) {
    for (const value of ['', '0', '-1', '21', '1.5', '1e1', '01', ' 1', 'Infinity', 'NaN'])
      assert.throws(() => readDatabaseConfiguration(local, { [key]: value }), DatabaseConfigurationError);
  }
  for (const value of ['', 'session', 'TRANSACTION', ' direct '])
    assert.throws(() => readDatabaseConfiguration(local, { MFP_DATABASE_CONNECTION_MODE: value }), DatabaseConfigurationError);
});

test('installed drivers retain explicit endpoint, database, empty password, SSL, and pool settings despite PG environment', async () => {
  const patches = { PGHOST: 'ambient.invalid', PGPORT: '1', PGUSER: 'ambient', PGUSERNAME: 'ambient', PGDATABASE: 'ambient', PGPASSWORD: 'ambient', PGSSLMODE: 'no-verify', PGSSL: 'prefer', PGMAX: '99', PGPREPARE: 'true' };
  const saved = Object.fromEntries(Object.keys(patches).map(key => [key, process.env[key]]));
  Object.assign(process.env, patches);
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    const config = readDatabaseConfiguration(`${local}?sslmode=verify-full`, { MFP_DATABASE_CONNECTION_MODE: 'transaction' });
    const pgOptions = toSessionPoolOptions(config);
    assert.equal('connectionString' in pgOptions, false);
    const client = new pg.Client(pgOptions);
    assert.equal(client.host, '127.0.0.1'); assert.equal(client.port, 5432);
    assert.equal(client.user, 'fixture'); assert.equal(client.database, 'fixture_database');
    assert.equal(typeof client.password, 'function'); assert.equal(await (client.password as () => string)(), '');
    assert.equal((client.ssl as ConnectionOptions).rejectUnauthorized, true);
    sql = postgres(toPostgresOptions(config));
    assert.deepEqual(sql.options.host, ['127.0.0.1']); assert.deepEqual(sql.options.port, [5432]);
    assert.equal(sql.options.user, 'fixture'); assert.equal(sql.options.database, 'fixture_database');
    assert.equal(await (sql.options.pass as unknown as () => string)(), '');
    assert.equal(sql.options.prepare, false); assert.equal(sql.options.max, 10);
    assert.equal((sql.options.ssl as ConnectionOptions).rejectUnauthorized, true);
  } finally {
    await sql?.end();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('installed Postgres.js preserves literal IPv6 rather than splitting it as host:port', async () => {
  const sql = postgres(toPostgresOptions(readDatabaseConfiguration('postgres://fixture@[::1]:55488/fixture', {})));
  try { assert.deepEqual(sql.options.host, ['::1']); assert.deepEqual(sql.options.port, [55488]); }
  finally { await sql.end(); }
});

test('createDatabase keeps the explicit binding interface and public error class', async () => {
  assert.equal(DatabaseError, DatabaseConfigurationError);
  for (const value of ['', 'postgres://localhost/', 'https://example.com/db', undefined])
    assert.throws(() => createDatabase(value as string), DatabaseConfigurationError);
  const result = createDatabase(local);
  try { assert.equal(result.client.options.database, 'fixture_database'); assert.ok(result.db); }
  finally { await result.client.end(); }
});

test('invalid transport configuration makes trusted account configuration unavailable', () => {
  const env = {
    MFP_OIDC_ISSUER: 'https://identity.example', MFP_OIDC_CLIENT_ID: 'fixture', MFP_OIDC_CLIENT_AUTH_METHOD: 'none',
    MFP_APP_ORIGIN: 'https://app.example', MFP_OIDC_CALLBACK_URI: 'https://app.example/api/auth/callback',
    MFP_SESSION_SECRET: 'a'.repeat(43), DATABASE_URL: local,
  };
  assert.equal(readAuthConfiguration(env)?.database.host, '127.0.0.1');
  for (const patch of [{ MFP_DATABASE_CONNECTION_MODE: 'invalid' }, { MFP_DATABASE_SESSION_MAX: '0' },
    { DATABASE_URL: `${remote}?sslmode=disable` }, { MFP_DATABASE_CA_CERT: 'invalid' }])
    assert.equal(readAuthConfiguration({ ...env, ...patch }), null);
});
