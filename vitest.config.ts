import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/__tests__/**', 'src/cli.ts', 'src/ui/**', 'tests/**/*.test.ts'],
      // Coverage thresholds - set to current baseline
      // Target: Increase to 50%+ as coverage improves
      thresholds: {
        lines: 35,
        branches: 30,
        functions: 35,
        statements: 35,
      },
    },
    testTimeout: 30000, // Increased for integration tests
    hookTimeout: 30000, // For beforeAll/afterAll in integration tests
    // Run integration test files sequentially to avoid port conflicts
    // (each file starts its own server on the same port)
    fileParallelism: false,
  },
});
