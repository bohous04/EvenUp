import { describe, expect, it } from 'vitest';
import { localizedPath } from './locale-path';

describe('localizedPath', () => {
  it('prefixes /en for English', () => {
    expect(localizedPath('/groups', 'en')).toBe('/en/groups');
    expect(localizedPath('/', 'en')).toBe('/en');
  });

  it('strips the /en prefix for Czech, the unprefixed default', () => {
    expect(localizedPath('/en/groups', 'cs')).toBe('/groups');
    expect(localizedPath('/en', 'cs')).toBe('/');
  });

  it('is idempotent — switching to the locale you are already in changes nothing', () => {
    expect(localizedPath('/en/groups', 'en')).toBe('/en/groups');
    expect(localizedPath('/groups', 'cs')).toBe('/groups');
  });

  it('does not mistake a path merely starting with "en" for the locale prefix', () => {
    expect(localizedPath('/enterprise', 'en')).toBe('/en/enterprise');
    expect(localizedPath('/enterprise', 'cs')).toBe('/enterprise');
  });

  it('preserves deep paths, including invite tokens already in circulation', () => {
    expect(localizedPath('/invite/AbCdEf-_0123456789xyz', 'en')).toBe(
      '/en/invite/AbCdEf-_0123456789xyz',
    );
    expect(localizedPath('/en/groups/clx123abc', 'cs')).toBe('/groups/clx123abc');
  });
});
