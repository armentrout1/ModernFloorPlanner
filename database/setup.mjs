import { readFile } from 'node:fs/promises';

export const migrationFiles = ['0001_workspace_authorization.sql', '0002_oidc_sessions_accounts.sql',
  '0003_physical_plans.sql', '0004_physical_project_lifecycle.sql'];
const identifier = value => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error('Invalid setup identifier');
  return value;
};
function parameters(options) {
  const values = { schema_name: identifier(options.schemaName), object_owner: identifier(options.ownerRole), runtime_role: identifier(options.runtimeRole) };
  if (!/^mfp_[a-z0-9_]{1,59}$/.test(values.object_owner) || !/^mfp_[a-z0-9_]{1,59}$/.test(values.runtime_role)) throw new Error('Dedicated mfp_ roles are required');
  if (options.databaseName !== undefined) values.database_name = identifier(options.databaseName);
  return values;
}
async function executeFile(client, name, options) {
  const values = parameters(options);
  let sql = await readFile(new URL(name, import.meta.url), 'utf8');
  // Only these validated identifier variables exist; no URL/password is substituted into SQL.
  sql = sql.replace(/:(["'])(schema_name|object_owner|runtime_role|database_name)\1/g, (_, quote, key) => quote + values[key] + quote);
  if (typeof client.reserve !== 'function') throw new Error('Setup requires a reservable direct administrative connection');
  const connection = await client.reserve();
  try { await connection.unsafe(sql); }
  finally {
    try { await connection.unsafe('ROLLBACK; RESET ROLE; RESET search_path'); }
    finally { connection.release(); }
  }
}
export async function applyBootstrap(client, options) { await executeFile(client, 'bootstrap.sql', options); }
export async function applyHardening(client, options) { await executeFile(client, 'harden.sql', options); }
export async function applyDatabaseRestrictions(client, options) {
  if (!options.databaseName) throw new Error('Explicit dedicated database name is required');
  await executeFile(client, 'restrict-database.sql', options);
}
export async function applyMigrations(client, options) {
  const values = parameters(options);
  if (typeof client.reserve !== 'function') throw new Error('Migrations require a reservable direct administrative connection');
  const connection = await client.reserve();
  // Each historical file owns BEGIN/COMMIT. Do not pretend an outer transaction makes all four atomic.
  try {
    await connection.unsafe(`SET ROLE "${values.object_owner}"; SET search_path TO "${values.schema_name}", pg_catalog`);
    for (const name of migrationFiles) {
      try { await connection.unsafe(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')); }
      catch (error) { await connection.unsafe('ROLLBACK'); throw error; }
    }
  } finally {
    try { await connection.unsafe('ROLLBACK; RESET ROLE; RESET search_path'); }
    finally { connection.release(); }
  }
}
export async function applyProviderSchema(client, options) {
  await applyBootstrap(client, options);
  await applyMigrations(client, options);
  await applyHardening(client, options);
}
