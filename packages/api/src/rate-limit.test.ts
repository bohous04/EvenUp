import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('createRateLimiter', () => {
  it('allows up to max in a window, then blocks, then refills', () => {
    let t = 1_000;
    const limiter = createRateLimiter({ max: 2, windowMs: 1_000, now: () => t });
    expect(limiter.check('u1')).toBe(true);
    expect(limiter.check('u1')).toBe(true);
    expect(limiter.check('u1')).toBe(false); // 3rd within window
    t += 1_001; // window passed
    expect(limiter.check('u1')).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => 0 });
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('b')).toBe(true);
    expect(limiter.check('a')).toBe(false);
  });
});
