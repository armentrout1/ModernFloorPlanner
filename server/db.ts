import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';
export type Database = PostgresJsDatabase<typeof schema>;
export class DatabaseConfigurationError extends Error {
  constructor() { super('Database binding is not configured'); this.name = 'DatabaseConfigurationError'; }
}
function explicitConnectionString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new DatabaseConfigurationError();
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2) throw new Error();
  } catch { throw new DatabaseConfigurationError(); }
  return value;
}
/** Import never connects or falls back to ambient PostgreSQL defaults. */
export function createDatabase(connectionString: string) {
  const client = postgres(explicitConnectionString(connectionString), { max: 10, connect_timeout: 10, idle_timeout: 20 });
  return { db: drizzle(client, { schema }), client };
}
let connection: ReturnType<typeof createDatabase> | undefined;
export function getDatabase(): Database {
  if (!connection) connection = createDatabase(explicitConnectionString(process.env.DATABASE_URL));
  return connection.db;
}
