import { spawn } from 'node:child_process';
import { createTransportFixture } from '../tests/database-transport/runtime.mjs';
let fixture;
try {
  fixture = await createTransportFixture();
  console.log('Isolated database transport versions: ' + JSON.stringify(fixture.versions));
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-isolation=none', '--test-concurrency=1', 'tests/database-transport/transport.test.ts'],
      { cwd: process.cwd(), env: fixture.env, windowsHide: true, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    child.on('message', async message => {
      if (message?.type !== 'MFP_TRANSPORT_RESTART' || typeof message.id !== 'string') return;
      try { await fixture.restartApp(); child.send({ type: 'MFP_TRANSPORT_RESTARTED', id: message.id, ok: true }); }
      catch { child.send({ type: 'MFP_TRANSPORT_RESTARTED', id: message.id, ok: false }); }
    });
    child.once('error', () => reject(new Error('Transport test process could not start')));
    child.once('exit', code => code === 0 ? done() : reject(new Error('Database transport acceptance failed')));
  });
} catch (error) { console.error('Database transport fixture/test failed: ' + (error?.code ?? error?.name ?? 'unknown')); if (/^(Fixture |Unable to start fixture:|Isolated HTTPS)/.test(error?.message ?? '')) console.error(error.message); process.exitCode = 1; }
finally { if (fixture) await fixture.cleanup(); }
