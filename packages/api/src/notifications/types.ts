/**
 * Notification ports (PRD §4.11).
 *
 * `packages/api` decides *what* to say and *to whom*; it never renders HTML and
 * never talks to a mail server. It emits a structured payload and hands it to a
 * `NotificationChannel` supplied by the host app — the same dependency
 * inversion `cleanupExpiredReceipts` uses for its `ObjectStore`. It is also
 * forced: `apps/web/src/server/email.ts` imports `server-only` and can never be
 * imported from here.
 *
 * Tests inject a channel that captures payloads, so no mail is ever sent in CI.
 */
/**
 * A coalesced activity line. `lastAt` is an ISO string, not a `Date`: payloads
 * are persisted as JSON on `NotificationDelivery` so a failed send can be
 * retried verbatim, and a round-trip through JSON would silently turn a `Date`
 * into a string anyway. Making that explicit here keeps the retry path and the
 * first-attempt path on exactly the same type.
 */
export interface DigestEntry {
  readonly action: string;
  readonly count: number;
  readonly lastAt: string;
}

export interface NotifiableUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  /** `User.locale` — the channel renders in this language (FR-10.1). */
  readonly locale: string;
}

/** "Here is what happened in this group since we last wrote to you." */
export interface DigestNotification {
  readonly kind: 'digest';
  readonly groupId: string;
  readonly groupName: string;
  readonly items: readonly DigestEntry[];
  /** Recipient's net position in the group's base currency; negative = owes. */
  readonly netMinorUnits: number;
  readonly currency: string;
}

/** "You owe Petr 1 240 Kč." Scheduled, computed from balances, not from events. */
export interface ReminderNotification {
  readonly kind: 'reminder';
  readonly groupId: string;
  readonly groupName: string;
  readonly creditorName: string;
  readonly amountMinorUnits: number;
  readonly currency: string;
  /** SPAYD ("QR Platba") string when the creditor has a payable account (FR-7.1). */
  readonly spayd: string | null;
}

/** "Petr marked 1 240 Kč as paid to you." Sent immediately, not digested. */
export interface SettlementReceivedNotification {
  readonly kind: 'settlement.received';
  readonly groupId: string;
  readonly groupName: string;
  readonly payerName: string;
  readonly amountMinorUnits: number;
  readonly currency: string;
}

export type NotificationPayload =
  | DigestNotification
  | ReminderNotification
  | SettlementReceivedNotification;

export interface NotificationChannel {
  readonly id: 'email' | 'push' | 'webpush';
  /** Whether this channel can reach the user at all (e.g. has an address/token). */
  supports(user: NotifiableUser): boolean;
  send(user: NotifiableUser, payload: NotificationPayload): Promise<void>;
}

/** Tunables, threaded through from the host's environment. */
export interface NotificationConfig {
  readonly digestIntervalHours: number;
  readonly reminderIntervalHours: number;
  readonly reminderThresholdMinorUnits: number;
  /** A delivery is abandoned after this many failed attempts. */
  readonly maxAttempts: number;
}
