import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/cli.ts', 'src/ui/**', 'src/**/*.test.ts'],
    },
    testTimeout: 10000,
  },
});
