# Notification spine — design

**Date:** 2026-07-09
**Status:** approved
**Requirements:** FR-11.1, FR-11.2 (notifications), FR-12.1 (recurring auto-create + notify),
PRD §9.6 (observability), §14 (success metric: % of debts settled)

## Problem

EvenUp never tells anyone anything. The PRD requires notifications for expenses that affect you,
settlement events, and debt reminders (FR-11.1), with per-group mute and a global opt-out
(FR-11.2). None of it exists:

- `apps/mobile/src/lib/notifications.ts` exports `registerForPushNotifications()`. Nothing calls it.
  There is no `PushToken` model, no preferences table, no sender. The schema contains zero
  occurrences of "notif", "device", or "push".
- `transaction.materializeDue` is a `protectedProcedure`, so recurring expenses only come into
  existence when a signed-in user happens to invoke it. **Nothing invokes it** — not the web app,
  not mobile. FR-12.1 promises "auto-create + notify"; today it does neither.
- The PRD's headline success metric is "% of group debts that get marked settled", and the app has
  no mechanism to remind anyone that they owe money.

## Scope

This spec covers **Spec A** of a two-part effort. Spec B (live shared split session, realtime) will
subscribe to the domain-event seam introduced here.

**In scope:** domain-event seam, notification preferences, delivery records, an email channel, a
cron endpoint, digests, debt reminders, two immediate-lane events, and moving recurring
materialization onto the cron.

**Out of scope:** Expo push, web push, in-app notification centre, `expense.updated` events.

### Why email only

- **Web push is expensive here.** `apps/web/public/sw.js` is a *kill-switch* service worker: EvenUp
  shipped a caching worker, hit stale-asset bugs across deploys, and replaced it with one that
  purges caches and unregisters itself. New visitors register no worker at all. Web push needs a
  persistent registered worker, so adding it means reversing a deliberate retreat.
- **Expo push is not provisioned.** `apps/mobile/app.config.ts` falls back to an all-zeros
  `EAS_PROJECT_ID`. Tokens cannot be minted against a placeholder.
- **Email already works.** `apps/web/src/server/email.ts` resolves Resend → SMTP → console, and
  `.env.example` already walks self-hosters through configuring it for auth. Every account has a
  verified address.

The spine is channel-agnostic. Email is the only adapter built; the `NotificationChannel` port is
shaped so push drops in without re-architecture.

### Why email is not push

FR-11.1 mandates push notifications *on mobile* for added/edited expenses. Email has a spam cliff
that push does not: six people at dinner adding twenty expenses would generate ~100 emails under
per-event delivery. Email therefore gets **digests**, not per-event mail. Note also that FR-11.1's
"edited expense" describes an event that cannot occur — the transaction router has no `update`
procedure, so expenses cannot be edited at all. We emit no `expense.updated`.

## Architecture

### Dependency direction

`packages/api` owns the logic and declares ports. `apps/web` supplies the transports. This mirrors
`cleanupExpiredReceipts({ prisma, objectStore, retentionDays, now })` exactly — the existing cron
service takes its side-effecting dependencies as injected ports, and the route handler provides
them. It is also forced: `server/email.ts` imports `server-only` and can never be imported from
`packages/api`.

```ts
// packages/api/src/notifications/types.ts
export interface NotifiableUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly locale: string;
}

export type NotificationPayload =
  | { kind: 'digest'; groupId; groupName; items: DigestItem[]; netMinorUnits; currency }
  | { kind: 'reminder'; groupId; groupName; creditorName; amountMinorUnits; currency; spayd? }
  | { kind: 'settlement.received'; groupId; groupName; payerName; amountMinorUnits; currency }
  | { kind: 'group.added'; groupId; groupName; actorName };

export interface NotificationChannel {
  readonly id: 'email' | 'push' | 'webpush';
  supports(user: NotifiableUser): boolean;
  send(user: NotifiableUser, payload: NotificationPayload): Promise<void>;
}
```

`packages/api` never renders HTML. It emits a **structured payload**; the channel renders it in the
recipient's `User.locale` from the `packages/i18n` catalogs (FR-10.4). Tests inject a
`FakeChannel` that captures payloads, so no live email is sent in CI — the same discipline the OCR
adapter uses with recorded fixtures.

Pure logic lives in `packages/core/src/notification/`, where the ≥95% coverage gate and fast-check
property tests already apply: digest-due arithmetic, activity coalescing, reminder thresholds, and
idempotency-key construction. Core never reads the wall clock; `now` is always passed in.

### Event layer: `ActivityLog` + lazy recipients

`logActivity(prisma, groupId, actorId, action, payload)` in
`packages/api/src/services/activity.ts` is already the single funnel every mutation calls. It stays
the event source of truth, and becomes the seam Spec B's realtime channel subscribes to.

We deliberately do **not** add a `NotificationEvent` table. The three things we send have different
shapes:

| Producer | Source | Recipients resolved |
|---|---|---|
| Digest | `ActivityLog` since watermark | at digest time (batch — nobody is waiting) |
| Immediate | mutation, inline | at mutation time |
| Reminder | `getGroupBalances` | at cron time; never touches the event log |

A per-`(event, recipient)` outbox would serve only the first, duplicate a table we already have, and
add a recipient-resolution query to the hot mutation path. One `NotificationDelivery` table serves
all three.

### Data model

```prisma
model User {
  notificationsEnabled Boolean @default(true)   // global opt-out (FR-11.2)
}

model NotificationPreference {
  id           String    @id @default(cuid())
  userId       String
  groupId      String
  muted        Boolean   @default(false)        // per-group mute (FR-11.2)
  lastDigestAt DateTime?                        // digest watermark
  @@unique([userId, groupId])
}

model NotificationDelivery {
  id             String    @id @default(cuid())
  userId         String
  kind           String    // digest | reminder | settlement.received | group.added
  channel        String    // email
  idempotencyKey String    @unique
  status         String    // pending | sent | failed
  attempts       Int       @default(0)
  sentAt         DateTime?
  error          String?
  createdAt      DateTime  @default(now())
}
```

`NotificationPreference` rows are created lazily; absence means defaults (unmuted, never digested).

`idempotencyKey` is the entire reliability story. `digest:<userId>:<groupId>:<windowStartMs>` means
a cron that crashes mid-run and is retried cannot double-send: the unique constraint rejects the
second insert.

**Rejected alternative:** putting `muted` and `lastDigestAt` on `Member`, which is already the
(user, group) edge. `Member` has no unique constraint on `(groupId, userId)`, and exists for virtual
members who can never receive anything — the columns would be dead on most rows.

### Recipients

Only members with `Member.userId != null`. Virtual members have no account and no address; they are
structurally unreachable. Never the actor — you are not mailed about your own expense.

"Affects you" for the digest means you are a `TransactionPayer` or a `TransactionSplit` participant
on that transaction, resolved through your linked `Member`. Group-level events (`member.added`,
`category.created`, `group.updated`) go to every linked member: low-volume, genuinely group news.

## Data flow

### Cron

`POST /api/cron/notifications`, guarded by the same timing-safe `Bearer $CRON_SECRET` comparison as
`receipt-cleanup`, scheduled externally (Coolify scheduled tasks). Three phases, **in order**:

1. **Materialize** due recurring transactions across all non-archived groups, writing their
   `ActivityLog` rows. (`materializeDue` lifted out of the tRPC router into a shared service; the
   procedure remains as a thin delegating wrapper, since `integration.test.ts` calls it.)
2. **Digest** — for each user whose `lastDigestAt` is older than the digest interval, read
   `ActivityLog` since the watermark, filter to what affects them, send, advance the watermark.
3. **Remind** — for each non-archived group, call `getGroupBalances`; for each linked member owing
   more than the threshold, send a reminder with the SPAYD QR payload when the creditor has an IBAN.

Phase 1 precedes phase 2 so today's rent expense lands in today's digest, not tomorrow's. The
scheduler stays dumb: run hourly, let each user's interval decide whether they are due.

Defaults: digest every 24h, reminders every 168h (weekly), reminder threshold 5000 minor units
(50.00 in base currency), all overridable by env.

### Immediate lane

Exactly two events send synchronously, after their mutation commits:

- `settlement.received` — someone recorded a transfer paying **you**.
- `group.added` — you were added to a group.

Each writes a `pending` delivery row and attempts the send inline. Failure is not propagated to the
mutation's caller; the next cron pass sweeps `pending` and `failed` rows and retries. Immediates get
reliability without introducing a queue.

## Error handling

- Send failure marks the delivery `failed`, increments `attempts`, and stores a truncated `error`.
  The cron retries rows with `attempts < 3`, then leaves them dead for inspection.
- The delivery row is written `pending` *before* the send, and flipped to `sent` after. A crash
  between the two leaves a `pending` row that the next sweep retries; the unique `idempotencyKey`
  makes that retry safe.
- The digest watermark advances **only** after a successful send.
- Self-hosters with no email provider hit `email.ts`'s console fallback, which logs instead of
  throwing. The cron reports success; nothing crashes.
- Cron is not tRPC, so the `ErrorLog` middleware does not apply. Failures are `console.error`'d,
  matching `receipt-cleanup`.
- A notification failure must never fail the mutation that triggered it. The immediate lane catches
  and swallows, logging to `console.error`.

## Testing

- **`packages/core`** — unit + property tests for `isDigestDue`, `coalesceDigest`,
  `reminderPayments`, and the idempotency-key builders. Subject to the existing ≥95% gate.
- **`packages/api`** — integration tests against ephemeral Postgres, injecting a `FakeChannel`:
  digest selects only affecting rows; the actor is never notified; unlinked members are never
  notified; `muted` and `notificationsEnabled: false` suppress; a duplicate idempotency key blocks a
  second send; a failed send increments `attempts` and is retried; the watermark does not advance on
  failure.
- **No live email in CI**, mirroring the OCR recorded-fixture rule.
- **E2E** — cron is not a user journey; assert instead that the settings toggles persist.

## UI surface

- `apps/web/src/app/settings/page.tsx` gains a notifications section: the global `notificationsEnabled`
  switch.
- Group settings gain a per-group mute.
- All strings in `packages/i18n` catalogs, CZ + EN (FR-10.4).

## Follow-ups (not this spec)

- `expense.updated` events, once the transaction router grows an `update` procedure.
- Expo push channel + `PushToken` model, once an EAS project is provisioned.
- Spec B: live shared split session, subscribing to the `logActivity` seam.
