import { test, expect } from '@playwright/test';

/**
 * Universal links glue: Apple's CDN fetches /.well-known/apple-app-site-
 * association verbatim, so the whole chain must hold end-to-end — the locale
 * middleware leaves the path alone, the next.config beforeFiles rewrite maps
 * it onto the API route, and the route answers with JSON. Unit tests cover
 * the middleware and the handler separately (see src/middleware.test.ts and
 * the route's own test); this is the assertion that the rewrite itself
 * survives Next upgrades and matcher edits.
 */
test('serves the Apple universal-links file as JSON', async ({ request }) => {
  const res = await request.get('/.well-known/apple-app-site-association');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  const body = await res.json();
  expect(body.applinks.details[0].appID).toContain('company.lnrt.evenup');
  expect(body.applinks.details[0].paths).toEqual(['/invite/*', '/reset-password*']);
});
