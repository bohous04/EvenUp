import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one ephemeral Postgres; run serially to avoid
    // cross-test data races on the reset.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/test/**', 'src/**/*.types.ts'],
      // PRD §10.2 asks for "overall project ≥ 80% lines/branches". This is the
      // layer where that is both measurable and enforced: unlike apps/web,
      // every `src/**/*.ts` file here is in the denominator, so the number
      // reflects the code rather than the subset the unit tests happen to
      // import. At the time of writing this sits at ~91% statements / ~84%
      // branches, so 80 is a floor that catches regression without turning
      // every PR red.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
