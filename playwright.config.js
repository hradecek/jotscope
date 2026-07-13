const { defineConfig } = require('@playwright/test');

// The suite loads the unpacked extension into a single persistent Chromium
// context (see tests/popup.spec.js), so tests run serially in one worker.
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
});
