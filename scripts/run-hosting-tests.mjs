import { spawn } from 'node:child_process';
import { createHostingFixture } from '../tests/hosting/runtime.mjs';
const modes = process.argv.slice(2);
if (modes.length > 1 || modes.some(mode => !['--protocol-only', '--browser-only'].includes(mode)))
  throw new Error('Supported options: --protocol-only or --browser-only');
const run = (args, env, restartHosted) => new Promise((done, reject) => {
  const child = spawn(process.execPath, args, { env, cwd: process.cwd(), stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  child.on('message', async message => {
    if (message?.type !== 'MFP_TEST_RESTART_HOSTED' || typeof message.id !== 'string') return;
    try { await restartHosted(); child.send({ type: 'MFP_TEST_RESTARTED', id: message.id, ok: true }); }
    catch { child.send({ type: 'MFP_TEST_RESTARTED', id: message.id, ok: false }); }
  });
  child.once('error', () => reject(new Error('Hosting acceptance runner failed to start.')));
  child.once('exit', code => code === 0 ? done() : reject(new Error('Hosting acceptance failed.')));
});
const fixture = await createHostingFixture();
try {
  if (!modes.includes('--browser-only'))
    await run(['--import', 'tsx', '--test', '--test-isolation=none', '--test-concurrency=1', 'tests/hosting/proxy-protocol.test.ts'], fixture.env, fixture.restartHosted);
  if (!modes.includes('--protocol-only'))
    await run(['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.hosting.config.ts', '--reporter=line'], fixture.env, fixture.restartHosted);
} finally { await fixture.cleanup(); }
