import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/cli.ts', 'src/ui/**', 'src/**/*.test.ts', 'tests/**/*.test.ts'],
    },
    testTimeout: 30000, // Increased for integration tests
    hookTimeout: 30000, // For beforeAll/afterAll in integration tests
    // Run integration test files sequentially to avoid port conflicts
    // (each file starts its own server on the same port)
    fileParallelism: false,
  },
});
