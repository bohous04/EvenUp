/**
 * Resolve the payable account for a creditor (FR-7.1, spec 2026-07-09 §4).
 *
 * The linked user's account-level CZ bank account wins; the legacy per-member
 * `BankDetail` remains as a fallback. Extracted from the settlement router so
 * that debt reminders and the on-screen QR agree on who gets paid — a reminder
 * that names a different payee than the button is worse than no reminder.
 */
import { czAccountToIban } from '@evenup/core';
import type { SecretBox } from '../crypto/secret-box.js';

export interface PayeeMember {
  readonly displayName: string;
  readonly bankDetail: {
    readonly ibanEncrypted: string;
    readonly recipientName: string | null;
    readonly variableSymbol: string | null;
  } | null;
  readonly user: {
    readonly name: string | null;
    readonly bankAccountEncrypted: string | null;
  } | null;
}

export interface ResolvedPayee {
  readonly iban: string;
  readonly recipientName: string;
  readonly variableSymbol?: string;
}

/**
 * `null` when the creditor has saved no payable account — settle in cash or
 * manually (FR-7.4). Throws only if stored ciphertext is corrupt.
 */
export function resolvePayee(
  member: PayeeMember,
  secretBox: SecretBox,
  variableSymbol?: string,
): ResolvedPayee | null {
  // `czAccountToIban` yields null for an unparseable account, in which case we
  // fall through to BankDetail rather than reporting the creditor unpayable.
  const userIban = member.user?.bankAccountEncrypted
    ? czAccountToIban(secretBox.decrypt(member.user.bankAccountEncrypted))
    : null;
  if (userIban) {
    return {
      iban: userIban,
      recipientName: member.user?.name ?? member.displayName,
      variableSymbol,
    };
  }
  if (member.bankDetail) {
    return {
      iban: secretBox.decrypt(member.bankDetail.ibanEncrypted),
      recipientName: member.bankDetail.recipientName ?? member.displayName,
      variableSymbol: member.bankDetail.variableSymbol ?? variableSymbol,
    };
  }
  return null;
}
