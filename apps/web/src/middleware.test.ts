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

  it('preserves the query string through a rewrite', () => {
    const res = middleware(req('/invite/tok?ref=x'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('ref=x');
  });
});
