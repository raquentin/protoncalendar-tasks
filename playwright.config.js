// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mock',
      testDir: 'tests/mock',
      fullyParallel: true,
      use: { browserName: 'chromium', headless: true },
    },
    {
      // needs `npm run auth`
      name: 'live',
      testDir: 'tests/live',
      workers: 1,
      timeout: 90_000,
    },
  ],
});
