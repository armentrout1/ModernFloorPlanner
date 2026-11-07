import { createDatabaseBackup } from './database-backup-lib.mjs';

const databaseUrl = process.env.MFP_BACKUP_DATABASE_URL;
const outputDirectory = process.env.MFP_BACKUP_OUTPUT_DIRECTORY;

if (!databaseUrl || !outputDirectory) {
  throw new Error('Set MFP_BACKUP_DATABASE_URL and MFP_BACKUP_OUTPUT_DIRECTORY explicitly. DATABASE_URL is never used as a fallback.');
}

const result = await createDatabaseBackup({ databaseUrl, outputDirectory });
console.log(`Backup verified: ${result.backupPath}`);
console.log(`Manifest: ${result.manifestPath}`);
console.log(`SHA-256: ${result.digest}`);
