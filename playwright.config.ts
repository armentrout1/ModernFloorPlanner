import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [{ command: 'npx tsx tests/fixture-server.ts', url: 'http://127.0.0.1:4173',
    reuseExistingServer: false, timeout: 30_000 },
    { command: 'npx tsx tests/parity-server.ts', url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: false, timeout: 30_000 },
    { command: 'npx tsx tests/production-denial-server.ts', url: 'http://127.0.0.1:4175',
      reuseExistingServer: false, timeout: 30_000 }],
});
