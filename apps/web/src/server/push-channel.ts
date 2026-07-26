/**
 * The Expo push transport for the notification spine (PRD §4.11).
 *
 * Sibling of `notification-channel.ts` — same structured payload, same copy,
 * different wire. It deliberately reuses that module's `render()` so a change to
 * the wording lands on email and push together instead of drifting apart.
 *
 * The spine already guarantees at-most-once per (user, kind, channel) via
 * `NotificationDelivery.idempotencyKey`, so this file only has to talk to Expo
 * and be honest about failure: a throw marks the delivery `failed` and the next
 * cron pass retries it.
 */
import 'server-only';
import type { NotifiableUser, NotificationChannel, NotificationPayload } from '@evenup/api';
import { prisma } from '@evenup/db';
import { t, type Locale } from '@evenup/i18n';
import { activityLabel, localeOf, render } from './notification-channel.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo caps a single request at 100 messages. */
const BATCH_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  /** Read by the mobile tap listener to deep-link into the group. */
  data: { groupId: string };
}

/**
 * The push body, deliberately **without monetary amounts**.
 *
 * A push preview renders on the lock screen of a phone lying on a table; email
 * does not. The figure stays out of the preview and lives in the app — the
 * titles come from the shared `render()` so wording still can't drift, and the
 * digest's own activity lines ("3× Expense added") carry no amounts anyway.
 */
function pushBody(payload: NotificationPayload, locale: Locale): string {
  switch (payload.kind) {
    case 'digest':
      // Rebuilt from the payload rather than filtered out of render()'s output:
      // its digest lines are followed by a blank separator and the balance, and
      // picking those apart by string matching would break the first time the
      // wording changed.
      return payload.items
        .map((item) =>
          t(locale, 'notify.digest.line', {
            count: item.count,
            what: activityLabel(locale, item.action),
          }),
        )
        .join(' ');
    case 'reminder':
      return t(locale, 'notify.push.reminder', { creditor: payload.creditorName });
    case 'settlement.received':
      return t(locale, 'notify.push.settlement', {
        payer: payload.payerName,
        group: payload.groupName,
      });
  }
}

function toMessages(user: NotifiableUser, payload: NotificationPayload): ExpoMessage[] {
  const locale = localeOf(user);
  // Only the title comes from the shared renderer — the body is amount-free.
  const { subject } = render(payload, locale);
  const body = pushBody(payload, locale);

  return user.pushTokens.map((token) => ({
    to: token,
    title: subject,
    body,
    sound: 'default',
    data: { groupId: payload.groupId },
  }));
}

/**
 * Delete tokens Expo reports as `DeviceNotRegistered` — the app was uninstalled
 * or the token rotated. Left in place they fail on every future run, burning all
 * three delivery attempts each time.
 */
async function pruneDeadTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
}

/**
 * Expo embeds the offending token in some ticket messages (`MessageRateExceeded`
 * notably). Delivery errors are persisted on `NotificationDelivery.error` and
 * logged, so strip it — a device identifier has no business in either.
 */
function redactTokens(message: string): string {
  return message.replace(/Ex(ponent)?PushToken\[[^\]]*\]/g, 'ExponentPushToken[redacted]');
}

async function sendBatch(messages: ExpoMessage[]): Promise<void> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    throw new Error(`Expo push failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: ExpoTicket[] };
  const tickets = json.data ?? [];

  const dead: string[] = [];
  const failures: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status !== 'error') return;
    const token = messages[i]?.to;
    if (ticket.details?.error === 'DeviceNotRegistered') {
      if (token) dead.push(token);
      return;
    }
    failures.push(ticket.message ?? ticket.details?.error ?? 'unknown');
  });

  await pruneDeadTokens(dead);

  // A dead device is not a delivery failure — the user simply has one fewer
  // device. Only genuine transport errors should fail (and so retry) the send.
  if (failures.length > 0) {
    throw new Error(
      `Expo push rejected ${failures.length} message(s): ${redactTokens(failures[0]!)}`,
    );
  }
}

/** Reachable iff at least one device has registered a token for this user. */
export const pushChannel: NotificationChannel = {
  id: 'push',
  supports: (user) => user.pushTokens.length > 0,
  send: async (user, payload) => {
    const messages = toMessages(user, payload);
    if (messages.length === 0) return;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      await sendBatch(messages.slice(i, i + BATCH_SIZE));
    }
  },
};
