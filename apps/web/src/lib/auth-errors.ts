import type { MessageKey } from '@evenup/i18n';

/** Map a Better Auth error code to a localized message key + translate it. */
export function authErrorMessage(code: string | undefined, t: (key: MessageKey) => string): string {
  switch (code) {
    case 'INVALID_PASSWORD':
    case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
      return t('security.error.invalidPassword');
    case 'INVALID_CODE':
    case 'INVALID_BACKUP_CODE':
    case 'OTP_HAS_EXPIRED':
      return t('security.error.invalidCode');
    default:
      return t('security.error.generic');
  }
}
