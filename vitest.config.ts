import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      // Fiber extractor tests need DOM
      ['tests/api/03-fiber-extractor.spec.ts', 'jsdom'],
    ],
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Include only unit-testable modules.
      // Chrome Extension UI files (inspect.ts, toolbar.ts, changesPanel.ts, etc.)
      // require a real browser runtime and are covered by E2E tests instead.
      include: [
        'server/src/**/*.ts',
        'extension/src/content/changes.ts',
        'extension/src/content/fiber.ts',
        'extension/src/content/requestHistory.ts',
      ],
      exclude: ['**/node_modules/**', '**/dist/**', 'server/src/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
