import { describe, expect, test } from 'vitest';
import { isUniqueViolation } from './notification-delivery.js';

/**
 * Regression: the unique-key collision that carries the at-most-once guarantee
 * used to be detected with `err instanceof Prisma.PrismaClientKnownRequestError`.
 * Under Next's bundler the thrown error comes from a different copy of
 * `@prisma/client` than this module imports, so `instanceof` is false and the
 * collision escaped as a 500 on the second cron run. Integration tests share one
 * module realm and could never catch it. Detection must be structural.
 */
describe('isUniqueViolation', () => {
  test('recognizes a P2002 that fails every instanceof check', () => {
    const foreignRealmError = { code: 'P2002', meta: { target: ['idempotencyKey'] } };
    expect(foreignRealmError instanceof Error).toBe(false);
    expect(isUniqueViolation(foreignRealmError)).toBe(true);
  });

  test('recognizes a P2002 carried on a real Error', () => {
    const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    expect(isUniqueViolation(err)).toBe(true);
  });

  test('does not swallow other Prisma errors', () => {
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false); // record not found
    expect(isUniqueViolation({ code: 'P1001' })).toBe(false); // cannot reach database
  });

  test('does not swallow ordinary failures', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});
