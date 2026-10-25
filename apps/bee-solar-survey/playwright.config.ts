import { defineConfig, devices } from '@playwright/test'

// Runs against the production build (`npm run build` first) so the service
// worker, precache and lazy chunks are exercised exactly as surveyors get them.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    acceptDownloads: true,
    locale: 'he-IL',
    ...devices['Pixel 7'],
    // Pixel 7 preset is Chromium-based; keep it on the bundled Chromium.
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
