import { spawn } from 'node:child_process';
import { createAccountsFixture } from '../tests/accounts/runtime.mjs';
const selection = process.argv.slice(2);
if (selection.some(value => !['--protocol-only', '--browser-only'].includes(value))) throw new Error('Supported options: --protocol-only or --browser-only');
if (selection.length > 1) throw new Error('Select only one account suite mode');
const run = (args, label, env) => new Promise((resolve, reject) => {
  console.log(`Running separate ${label} suite (synthetic HTTPS and PostgreSQL).`);
  const process_ = spawn(process.execPath, args, { env, cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
  process_.on('error', () => reject(new Error(`${label} runner failed to start`)));
  process_.on('exit', code => code === 0 ? resolve() : reject(new Error(`${label} suite failed`)));
});
if (!selection.includes('--browser-only')) {
  const fixture = await createAccountsFixture();
  try { await run(['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/persistence/physical-http.test.ts'], 'physical persistence HTTP/SQL', fixture.env); }
  finally { await fixture.cleanup(); }
}
if (!selection.includes('--protocol-only')) {
  const fixture = await createAccountsFixture(); let app;
  try {
    app = await fixture.startApp();
    await run(['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.physical.config.ts', '--reporter=line'], 'physical Save/Open browser', fixture.env);
  } finally { if (app) await app.stop(); await fixture.cleanup(); }
}