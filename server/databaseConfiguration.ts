import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { checkServerIdentity, type ConnectionOptions } from 'node:tls';
import type { PoolConfig } from 'pg';
import type postgres from 'postgres';

export class DatabaseConfigurationError extends Error {
  constructor() { super('Database binding is not configured or is invalid'); this.name = 'DatabaseConfigurationError'; }
}

/** Server-only values. Never return this configuration, its URLs, or driver errors to clients. */
export interface DatabaseConfiguration {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly mode: 'direct' | 'transaction';
  readonly appMax: number;
  readonly sessionMax: number;
  readonly tls: false | Readonly<{ servername: string; rejectUnauthorized: true; ca?: string }>;
}

const invalid = (): never => { throw new DatabaseConfigurationError(); };
const clean = (value: string, max = 4096) => value.length <= max && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const loopback = new Set(['localhost', '127.0.0.1', '::1']);

function poolLimit(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^(?:[1-9]|1[0-9]|20)$/.test(value)) return invalid();
  return Number(value);
}

function certificateBundle(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value.trim() || value.length > 131072) return invalid();
  const certificates = value.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!certificates?.length || value.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) return invalid();
  for (const certificate of certificates) new X509Certificate(certificate);
  return value;
}

/** Parse once; neither driver receives a connection string or a second SSL/query interpretation. */
export function readDatabaseConfiguration(value: unknown, env: NodeJS.ProcessEnv = process.env): DatabaseConfiguration {
  try {
    if (typeof value !== 'string' || !value || !clean(value)) return invalid();
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || !url.hostname || !url.username) return invalid();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // No socket paths, multihost syntax, percent-encoded host, or ambiguous colon forms.
    if (!clean(host, 253) || (!isIP(host) && !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host))) return invalid();
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!user || !database || !clean(user) || password.length > 4096 || /[\u0000-\u001f\u007f]/.test(password) || !clean(database) || database.includes('/')) return invalid();
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return invalid();
    const query = [...url.searchParams];
    if (query.length > 1 || query.some(([key]) => key !== 'sslmode')) return invalid();
    const sslmode = url.searchParams.get('sslmode');
    if (sslmode !== null && !['require', 'verify-full', 'disable'].includes(sslmode)) return invalid();
    const plain = sslmode === 'disable' || (sslmode === null && loopback.has(host));
    if (plain && !loopback.has(host)) return invalid();
    const ca = certificateBundle(env.MFP_DATABASE_CA_CERT);
    if ((plain && ca !== undefined) || (!plain && env.NODE_TLS_REJECT_UNAUTHORIZED === '0')) return invalid();
    const hosted = env.VERCEL === '1';
    const mode = env.MFP_DATABASE_CONNECTION_MODE ?? (hosted ? 'transaction' : 'direct');
    if (mode !== 'direct' && mode !== 'transaction') return invalid();
    return Object.freeze({
      host, port, user, password, database, mode,
      appMax: poolLimit(env.MFP_DATABASE_APP_MAX, hosted ? 1 : 10),
      sessionMax: poolLimit(env.MFP_DATABASE_SESSION_MAX, hosted ? 1 : 5),
      // sslmode=require deliberately means verified TLS here, never encryption without verification.
      tls: plain ? false : Object.freeze({ servername: host, rejectUnauthorized: true as const, ...(ca === undefined ? {} : { ca }) }),
    });
  } catch { throw new DatabaseConfigurationError(); }
}

function tlsOptions(configuration: DatabaseConfiguration): false | ConnectionOptions {
  if (!configuration.tls) return false;
  return {
    ...configuration.tls,
    // SNI carries DNS names only; explicit identity verification below still checks IP certificates.
    servername: isIP(configuration.host) ? undefined : configuration.host,
    // Verify the configured host even if a driver or IP socket supplies a different TLS default.
    checkServerIdentity: (_servername, certificate) => checkServerIdentity(configuration.host, certificate),
  };
}

export function toPostgresOptions(configuration: DatabaseConfiguration): postgres.Options<{}> {
  return {
    // Postgres.js supports host/port arrays, while its Options type narrows BaseOptions incorrectly.
    // Arrays prevent its host:port splitter from corrupting a literal IPv6 host.
    host: [configuration.host] as unknown as string,
    port: [configuration.port] as unknown as number,
    user: configuration.user, database: configuration.database,
    // A callback remains explicit when the password is empty; no PGPASSWORD fallback.
    password: () => configuration.password,
    ssl: tlsOptions(configuration),
    max: configuration.appMax, prepare: configuration.mode !== 'transaction',
    connect_timeout: 10, idle_timeout: 20,
  };
}

export function toSessionPoolOptions(configuration: DatabaseConfiguration): PoolConfig {
  return {
    host: configuration.host, port: configuration.port,
    user: configuration.user, database: configuration.database,
    // Also bypasses node-postgres's pgpass fallback for an intentionally empty password.
    password: () => configuration.password,
    ssl: tlsOptions(configuration),
    max: configuration.sessionMax, connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000,
  };
}
