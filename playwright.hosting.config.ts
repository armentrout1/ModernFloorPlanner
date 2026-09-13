import { defineConfig } from '@playwright/test';
if (process.env.MFP_ACCOUNTS_APP_ORIGIN !== 'https://127.0.0.2:54440' || !process.env.MFP_ACCOUNTS_SPKI)
  throw new Error('Run through the separate guarded hosting fixture.');
export default defineConfig({
  testDir: './tests/hosting', testMatch: 'hosted-account.spec.ts', fullyParallel: false,
  workers: 1, retries: 0, timeout: 90_000, reporter: [['line']], outputDir: './test-results-hosting',
  use: { baseURL: process.env.MFP_ACCOUNTS_APP_ORIGIN, viewport: { width: 1600, height: 1100 },
    ignoreHTTPSErrors: false, trace: 'off', video: 'off', screenshot: 'off',
    launchOptions: { args: ['--ignore-certificate-errors-spki-list=' + process.env.MFP_ACCOUNTS_SPKI] } },
});
