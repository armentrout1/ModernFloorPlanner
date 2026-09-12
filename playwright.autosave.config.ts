import { defineConfig } from '@playwright/test';
if (!process.env.MFP_ACCOUNTS_APP_ORIGIN || !process.env.MFP_ACCOUNTS_SPKI) throw Error('Run through isolated HTTPS fixture.');
export default defineConfig({
  testDir:'./tests/autosave',testMatch:'*.spec.ts',fullyParallel:false,workers:1,retries:0,timeout:90_000,
  outputDir:'./test-results-autosave',reporter:[['line']],
  use:{actionTimeout:10_000,baseURL:process.env.MFP_ACCOUNTS_APP_ORIGIN,viewport:{width:1600,height:1100},
    ignoreHTTPSErrors:false,trace:'off',video:'off',screenshot:'off',
    launchOptions:{args:['--ignore-certificate-errors-spki-list='+process.env.MFP_ACCOUNTS_SPKI]}},
});