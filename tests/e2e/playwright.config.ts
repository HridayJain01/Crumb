import { defineConfig, devices } from '@playwright/test';

/*
 * End-to-end tests run the real PWA against the Firebase emulators and the API in mock mode
 * (no cloud, no AI credits). `pnpm test:e2e` starts the emulators; Playwright starts the
 * API and the web app, or reuses ones already running locally. CI tests the production
 * bundle (code-split chunks, service worker), built with the emulator config; locally the
 * Vite dev server keeps the loop fast.
 */

const WEB_URL = 'http://127.0.0.1:5173';
const API_URL = 'http://127.0.0.1:8787';
const ci = Boolean(process.env.CI);
const web = ci
  ? 'pnpm --filter @crumb/web build --mode development && pnpm --filter @crumb/web preview --host 127.0.0.1 --port 5173 --strictPort'
  : 'pnpm --filter @crumb/web dev --host 127.0.0.1 --port 5173 --strictPort';

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: WEB_URL,
    geolocation: { latitude: 19.076, longitude: 72.8777 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Use a preinstalled Chromium when the bundled revision isn't downloaded.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: 'pnpm --filter @crumb/api dev',
      cwd: '../..',
      url: `${API_URL}/api/health`,
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: web,
      cwd: '../..',
      url: WEB_URL,
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
