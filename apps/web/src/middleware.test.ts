import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function req(path: string) {
  return new NextRequest(new URL(`https://evenup.cz${path}`));
}

describe('locale middleware', () => {
  it('rewrites an unprefixed path to the Czech segment without changing the URL', () => {
    const res = middleware(req('/groups/123'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/cs/groups/123');
  });

  it('passes /en through untouched', () => {
    const res = middleware(req('/en/groups/123'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/en/groups/123');
  });

  it('redirects an explicit /cs prefix to the canonical unprefixed URL', () => {
    const res = middleware(req('/cs/groups/123'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toContain('/groups/123');
  });

  it('NEVER touches /api — rewriting it breaks auth and every tRPC call', () => {
    const res = middleware(req('/api/trpc/user.me'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('leaves the service worker and manifest alone', () => {
    for (const p of ['/manifest.webmanifest', '/sw.js']) {
      expect(middleware(req(p)).headers.get('x-middleware-rewrite')).toBeNull();
    }
  });

  it('leaves /.well-known alone so Apple can fetch universal-links files', () => {
    // The locale rewrite would send /.well-known/apple-app-site-association to
    // the [locale] catch-all and 404 it — Apple's CDN then rejects the domain
    // and invite links stop opening the app.
    const res = middleware(req('/.well-known/apple-app-site-association'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('preserves the query string through a rewrite', () => {
    const res = middleware(req('/invite/tok?ref=x'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('ref=x');
  });

  it('preserves the query string through the /cs redirect too', () => {
    // The rewrite branch sets `url.search` explicitly; the redirect branch
    // relies on `clone()` carrying `search` implicitly. Cover both so a
    // future cleanup can't silently drop the query string on invite links
    // already in circulation.
    const res = middleware(req('/cs/invite/tok?ref=x&a=b'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toContain('ref=x&a=b');
  });

  it('is case-insensitive about static file extensions', () => {
    // A case-sensitive check would rewrite this to /cs/Icon.PNG and 404 it.
    expect(middleware(req('/Icon.PNG')).headers.get('x-middleware-rewrite')).toBeNull();
  });
});
