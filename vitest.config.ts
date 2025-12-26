import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'src/__tests__/**', 'src/cli.ts', 'src/ui/**'],
      // TODO: Increase thresholds to 80% once test coverage improves
      // Current baseline is ~40%, setting thresholds at 30% to provide buffer
      thresholds: {
        lines: 30,
        branches: 25,
        functions: 30,
        statements: 30,
      },
    },
    testTimeout: 10000,
  },
});
