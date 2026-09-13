import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';
import { readDatabaseConfiguration, toPostgresOptions } from './databaseConfiguration';
export { DatabaseConfigurationError } from './databaseConfiguration';
export type Database = PostgresJsDatabase<typeof schema>;

/** Import never connects or falls back to ambient PostgreSQL credentials. */
export function createDatabase(connectionString: string) {
  const configuration = readDatabaseConfiguration(connectionString);
  const client = postgres(toPostgresOptions(configuration));
  return { db: drizzle(client, { schema }), client };
}
let connection: ReturnType<typeof createDatabase> | undefined;
export function getDatabase(): Database {
  if (!connection) connection = createDatabase(process.env.DATABASE_URL as string);
  return connection.db;
}
