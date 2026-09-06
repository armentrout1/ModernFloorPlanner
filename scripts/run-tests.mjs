import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Expand files explicitly: Windows shells and Node 20 do not expand test globs.
const tests = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.ts')).sort().map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
