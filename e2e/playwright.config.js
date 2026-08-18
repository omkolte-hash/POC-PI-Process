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
    baseURL: 'http://127.0.0.1:8813',
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // Serves the project root (one level up from this e2e/ folder), not e2e/ itself —
    // that's where index.html and everything the app fetches (sample-data/, js/, _ds/) live.
    command: 'python3 -m http.server 8813 --directory ..',
    url: 'http://127.0.0.1:8813/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
});
