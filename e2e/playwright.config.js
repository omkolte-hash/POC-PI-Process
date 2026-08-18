import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Runs against the deployed GitHub Pages site, not a local server — keep the trailing
    // slash: relative navigations/fetches (e.g. `page.goto('index.html')`) resolve against
    // this as a directory. Without it they'd drop the /POC-PI-Process/ path segment entirely.
    baseURL: 'https://omkolte-hash.github.io/POC-PI-Process/',
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
});
