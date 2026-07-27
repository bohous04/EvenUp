import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig's `"jsx": "preserve"` is for Next's own compiler; Vite/esbuild
  // needs an explicit mode or it falls back to the classic transform (which
  // needs `React` in scope). Only the new .tsx component test exercises this.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      // `server-only` throws when imported outside a React Server Component.
      'server-only': fileURLToPath(new URL('./src/test/server-only.stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
