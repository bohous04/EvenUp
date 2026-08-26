import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('apple-app-site-association route', () => {
  it('declares the mobile app for the invite and reset-password paths', async () => {
    const res = await GET();
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = await res.json();
    expect(body.applinks.apps).toEqual([]);
    // appID is composed from env.apple (see route.ts); assert the shape so a
    // broken composition (e.g. "undefined.…") fails here rather than silently
    // dead-ending universal links.
    expect(body.applinks.details).toHaveLength(1);
    const detail = body.applinks.details[0];
    expect(detail.appID).toMatch(/^[A-Z0-9]{10}\./);
    expect(detail.appID.endsWith('.company.lnrt.evenup')).toBe(true);
    expect(detail.paths).toEqual(['/invite/*', '/reset-password*']);
  });
});
