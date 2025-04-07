import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';

// Create a PostgreSQL client
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

// Create a Drizzle ORM instance
export const db = drizzle(client, { schema });