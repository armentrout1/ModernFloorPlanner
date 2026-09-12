import { spawn } from 'node:child_process';
import { createAccountsFixture } from '../tests/accounts/runtime.mjs';
const fixture = await createAccountsFixture(); let app;
try {
  app = await fixture.startApp();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js','test','--config=playwright.autosave.config.ts','--reporter=line',...process.argv.slice(2)],
      { cwd:process.cwd(),env:fixture.env,stdio:'inherit',windowsHide:true });
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(Error('Autosave HTTPS/browser/SQL suite failed')));
  });
} finally { if(app)await app.stop();await fixture.cleanup(); }