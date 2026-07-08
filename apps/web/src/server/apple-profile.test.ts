import { describe, expect, it } from 'vitest';
import { appleDisplayName } from './apple-profile.js';

describe('appleDisplayName', () => {
  it('prefers the name Apple supplied', () => {
    expect(appleDisplayName({ name: 'Alice Smith', email: 'alice@example.com' })).toBe('Alice Smith');
  });

  it('trims surrounding whitespace', () => {
    expect(appleDisplayName({ name: '  Alice Smith  ', email: null })).toBe('Alice Smith');
  });

  it('falls back to the email local-part when Apple omits the name', () => {
    expect(appleDisplayName({ name: '', email: 'alice@example.com' })).toBe('alice');
  });

  it('falls back for a whitespace-only name', () => {
    expect(appleDisplayName({ name: '   ', email: 'alice@example.com' })).toBe('alice');
  });

  it('handles a null name', () => {
    expect(appleDisplayName({ name: null, email: 'alice@example.com' })).toBe('alice');
  });

  it('uses the relay local-part for a hidden-email user', () => {
    expect(appleDisplayName({ name: '', email: 'x7k2m9p4qz@privaterelay.appleid.com' })).toBe('x7k2m9p4qz');
  });

  it('never returns an empty string when both name and email are missing', () => {
    expect(appleDisplayName({ name: '', email: '' })).toBe('EvenUp user');
    expect(appleDisplayName({})).toBe('EvenUp user');
  });

  it('never returns an empty string for a malformed email', () => {
    expect(appleDisplayName({ name: '', email: '@example.com' })).toBe('EvenUp user');
  });
});
