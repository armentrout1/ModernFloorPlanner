import { defineConfig } from '@playwright/test';
if (!process.env.MFP_ACCOUNTS_APP_ORIGIN || !process.env.MFP_ACCOUNTS_SPKI) throw Error('Run through the isolated HTTPS account fixture.');
export default defineConfig({
  testDir: './tests/accounts', testMatch: 'account-sessions.spec.ts', fullyParallel: false,
  workers: 1, retries: 0, timeout: 90_000, reporter: [['line']],
  outputDir: './test-results-accounts',
  use: { baseURL: process.env.MFP_ACCOUNTS_APP_ORIGIN, viewport: { width: 1600, height: 1100 },
    ignoreHTTPSErrors: false, trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: { args: ['--ignore-certificate-errors-spki-list=' + process.env.MFP_ACCOUNTS_SPKI] } },
});
