import { describe, it, expect } from 'vitest';
import { authErrorMessage } from './auth-errors';

const t = (k: string) => k; // identity: assert on the KEY chosen

describe('authErrorMessage', () => {
  it('maps invalid password codes', () => {
    expect(authErrorMessage('INVALID_PASSWORD', t as never)).toBe('security.error.invalidPassword');
    expect(authErrorMessage('CREDENTIAL_ACCOUNT_NOT_FOUND', t as never)).toBe(
      'security.error.invalidPassword',
    );
  });
  it('maps invalid/expired 2FA and backup codes', () => {
    expect(authErrorMessage('INVALID_CODE', t as never)).toBe('security.error.invalidCode');
    expect(authErrorMessage('INVALID_BACKUP_CODE', t as never)).toBe('security.error.invalidCode');
    expect(authErrorMessage('OTP_HAS_EXPIRED', t as never)).toBe('security.error.invalidCode');
  });
  it('falls back to generic for unknown/undefined', () => {
    expect(authErrorMessage(undefined, t as never)).toBe('security.error.generic');
    expect(authErrorMessage('WHATEVER', t as never)).toBe('security.error.generic');
  });
});
