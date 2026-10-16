import { defineConfig, devices } from '@playwright/test'

const port = 4173

// Browser tests run against the production build, served by `vite preview`
// with the live site's headers (see vite.config.ts).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Google Chrome, not Playwright's own Chromium: Chromium can't play
    // H.264 (MP4) video, which most real videos and the test video are.
    // GitHub's Ubuntu runners have Chrome installed already.
    channel: 'chrome',
  },
  projects: [
    {
      name: 'light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
      grepInvert: /@engine/,
    },
    {
      name: 'dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
      grepInvert: /@engine/,
    },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grepInvert: /@engine/ },
    // The heavy conversions (FFmpeg, LibreOffice), tagged @engine, run once,
    // after the rest. Alongside them, other tests slowed into time-outs.
    // So running one spec file runs the rest first: add --no-deps to skip.
    // (`npx playwright test e2e/word-to-pdf.spec.ts --no-deps`)
    {
      name: 'engines',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
      grep: /@engine/,
      dependencies: ['light', 'dark', 'phone'],
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
