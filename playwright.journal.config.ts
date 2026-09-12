import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/journal',testMatch:'*.spec.ts',fullyParallel:false,workers:1,retries:0,timeout:30000,
  reporter:'line',use:{baseURL:'http://127.0.0.1:4176',trace:'retain-on-failure'},
  webServer:{command:'npx tsx tests/journal/server.ts',url:'http://127.0.0.1:4176',reuseExistingServer:false,timeout:30000}});
