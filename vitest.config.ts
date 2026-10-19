import { defineConfig } from 'vitest/config'

// Unit tests for the logic: tools' lib/ code, the registry, the engine's
// error sorting and the build plugin. Browser tests are in e2e/ (Playwright).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
    environment: 'node',
    // Where qpdf's engine is, for the PDF password code.
    setupFiles: ['./vitest.setup.ts'],
  },
})
