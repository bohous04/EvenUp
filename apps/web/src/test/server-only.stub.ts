/**
 * `server-only` throws on import unless Next.js activates the `react-server`
 * export condition. Under vitest it does not, so we alias the package to this
 * no-op module. See apps/web/vitest.config.ts.
 */
export {};
