# Billing & metering: paid VIP subscription + prepaid scan credits

**Date:** 2026-07-25
**Scope:** Spec 1 of 2. Entitlement model, credit ledger, Stripe integration,
removal of per-user BYO OpenRouter keys.
**Out of scope:** the public landing page, the VIP/pricing page, locale URL
routing and the privacy/terms pages — those are Spec 2
(`2026-07-25-public-pages-and-gdpr-design.md`), which consumes the price model
defined here.
**Amended by Spec 2:** the "Consumer law and data protection" section below was
added after that spec's data-protection review, and changes the Checkout flow and
account deletion.

## Context

OCR receipt scanning is currently **bring-your-own-key**: `ocr.scan` resolves an
OpenRouter key from the user's own encrypted key, else from the shared instance
key if the user is a VIP, else refuses (`packages/api/src/routers/ocr.ts:57-81`).
`User.isVip` is a boolean granted by hand from `/admin`
(`packages/db/prisma/schema.prisma:42`). There is no billing of any kind.

The hosted instance is moving to paid scanning. The project stays **MIT and
self-hostable**: billing code ships in the repo but is inert without Stripe keys.

### The billing unit

One `ocr.scan` call accepts 1–10 pages and issues a **single** model request
(`ocr.ts:10,84`), producing one receipt and one expense. The billing unit is
therefore **one scan = one receipt import**, regardless of page count.

Cost sanity check at `google/gemini-2.5-flash`: ten pages is roughly 20k input
tokens, about **0.15 CZK**. Against a 10 CZK scan that is ~1.5% cost. A VIP
exhausting all 150 scans at ten pages each costs roughly **22 CZK against 50 CZK**
of subscription revenue — thin at the ceiling, but positive. Per-page billing is
not worth the complexity.

## Decisions

| Decision               | Choice                                                    |
| ---------------------- | --------------------------------------------------------- |
| VIP allowance          | 150 scans per billing period                              |
| At the 150 cap         | fall through to purchased credits                         |
| Existing `isVip` users | grandfathered as free lifetime VIP, uncapped              |
| Credit expiry          | never                                                     |
| Credit purchase        | fixed packs                                               |
| Primary currency       | CZK; EUR set to round numbers, not FX-converted           |
| Tax                    | non-VAT-registered business with IČO — no VAT on invoices |
| BYO keys               | removed for users; instance key remains, admin-only       |

### Concerns raised and accepted

- **The price points make credits look bad.** VIP is 50 CZK for 150 scans while
  5 scans cost the same 50 CZK — a 30× difference in value at one price point,
  which a pricing page makes obvious. Credits remain justifiable as a
  no-commitment option for rare users. Raised before approval and accepted as
  specified. Mitigated by making **every price configuration rather than code**,
  so retuning needs no deploy.
- **Dropping `User.openRouterKeyEncrypted` is destructive.** Existing users' keys
  are deleted and not recoverable. They are useless once the feature is gone.
  Raised before approval and accepted.

## Entitlement

A single function decides whether a scan may proceed and what it consumes. It is
the only place this question is answered, and it is pure enough to unit-test
exhaustively.

```
resolveScanEntitlement(user, subscription, now) ->
  | { allow: true,  consume: 'NONE',       mayStoreImage: true  }  // billing off, or comp VIP
  | { allow: true,  consume: 'VIP_SCAN',   mayStoreImage: true  }
  | { allow: true,  consume: 'CREDIT',     mayStoreImage: false }
  | { allow: false, reason:  'NO_ENTITLEMENT' }
```

`mayStoreImage` carries the receipt-photo rule (see below) so that
`ocr.ts:102` stops reading `user.isVip` directly.

Evaluation order:

1. **Billing disabled** — no `STRIPE_SECRET_KEY` → allow, consume nothing.
   This is what keeps self-hosting working unchanged.
2. **`user.isVip`** — the comp override → allow, consume nothing. Uncapped by
   choice; the population is small and hand-picked. Also the mechanism for
   comping testers.
3. **Active subscription** and VIP scans used this period `< 150` → `VIP_SCAN`.
4. **`creditBalance > 0`** → `CREDIT`.
5. Otherwise deny, with a message pointing at the pricing page.

Step 3 falling through to step 4 _is_ the "fall back to credits at the cap"
behaviour; it needs no special casing.

## Schema

```prisma
// on User
stripeCustomerId String? @unique
creditBalance    Int     @default(0)   // scans; never expires

model Subscription {
  id                   String   @id @default(cuid())
  userId               String
  stripeSubscriptionId String   @unique
  status               String              // active | past_due | canceled | ...
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean  @default(false)
  @@index([userId])
}

model ScanLedger {                          // append-only
  id             String   @id @default(cuid())
  userId         String
  delta          Int                        // +N purchase/grant, -1 scan
  reason         LedgerReason               // PURCHASE VIP_SCAN CREDIT_SCAN REFUND ADMIN_GRANT
  stripeEventId  String?  @unique           // idempotency for webhook replays
  receiptId      String?
  createdAt      DateTime @default(now())
  @@index([userId, createdAt])
  @@index([userId, reason, createdAt])
}
```

`creditBalance` is denormalised for a cheap pre-scan check, but **every mutation
writes a ledger row inside the same transaction**, so the balance is always
reconstructible and any drift is detectable.

**VIP usage is counted from the ledger** (`reason = VIP_SCAN` within
`[currentPeriodStart, currentPeriodEnd)`) rather than held in a counter that a
monthly job resets. There is no reset to get wrong, and period boundaries follow
Stripe's own dates.

## Charging semantics

Credits are **reserved before** the OpenRouter call via a conditional update
(`UPDATE ... SET creditBalance = creditBalance - 1 WHERE id = ? AND creditBalance > 0`),
and **refunded** if the scan throws.

The alternative — charging only on success — allows concurrent scans to pass the
same check and overdraw a single credit. Reserve-first costs one extra write and
removes the race.

**Known gap:** if the process dies between a failed scan and its refund, the user
loses one credit. Rare, bounded at ~10 CZK, and recoverable via an admin grant.
Full atomicity is not worth the complexity here.

VIP scans are recorded after a successful scan (no reservation): overdrawing the
150 cap by a scan or two under concurrency costs cents and has no user-visible
consequence.

## Stripe

**Hosted Checkout Sessions** — `mode: 'subscription'` for VIP, `mode: 'payment'`
for credit packs — so no card data reaches the application. **Customer Portal**
handles cancellation and card updates, which removes a whole surface from scope.

Webhook at `/api/stripe/webhook`:

| Event                                           | Effect                             |
| ----------------------------------------------- | ---------------------------------- |
| `checkout.session.completed` (payment)          | credit the pack, ledger `PURCHASE` |
| `checkout.session.completed` (subscription)     | upsert `Subscription`              |
| `customer.subscription.created/updated/deleted` | sync status and period             |
| `invoice.paid`                                  | roll the period forward            |
| `invoice.payment_failed`                        | mark `past_due`                    |

Two non-negotiables:

- **Signature verification against the raw body.** The App Router handler must
  read `req.text()`; verifying a re-serialised body fails, and skipping
  verification makes the endpoint forgeable. This is the single highest-risk line
  in the feature.
- **Idempotency via `ScanLedger.stripeEventId`.** Stripe retries; a replayed
  event must not double-credit. The unique constraint enforces this at the
  database rather than in application logic.

## Consumer law and data protection

Added after the data-protection review in Spec 2
(`2026-07-25-public-pages-and-gdpr-design.md`). These are not policy-page
concerns; each one changes code in this spec.

### The 14-day withdrawal right changes Checkout

EU distance selling gives consumers 14 days to withdraw from a purchase. Credits
are consumed immediately, so without further action a customer could spend their
credits and still demand a refund, and there would be no defence.

The remedy is to obtain, at Checkout, **express consent to immediate performance
together with an acknowledgement that the withdrawal right is thereby lost**. In
practice this is a required checkbox before the credit-pack Checkout Session is
created, with the consent recorded against the purchase.

Consequences:

- Credit-pack purchases record a consent flag and timestamp alongside the
  `PURCHASE` ledger row.
- The subscription flow is unaffected in the same way — a subscription is not
  immediately consumed — but cancellation terms still belong in the terms page.
- Refunds remain possible at your discretion; this concerns what may be
  _demanded_, not what may be _granted_.

### Erasure becomes selective

`deleteUserAccount` (`packages/api/src/services/account.ts:10`) currently deletes
everything belonging to a user. Once payments exist, Czech accounting law
requires invoices and payment records to be retained, and that obligation
**overrides the right to erasure** for exactly those records
(GDPR Art. 17(3)(b)).

Deletion therefore splits in two: purge personal data as it does today, but
retain the minimum billing record with its local `userId` nulled. Both halves need
tests — the failure modes are symmetrical and both are legal violations.

**This is pseudonymization, not anonymization**, and the distinction matters: the
retained rows keep `stripeEventId` and `stripeSubscriptionId`, which resolve via
Stripe to a Customer record holding the person's email and name. The data remains
personal data under GDPR; it is retained lawfully under Art. 17(3)(b), not because
it has ceased to identify anyone. Anything written for users or regulators must not
claim otherwise.

### Stripe is a new processor

- Stripe must be named in the privacy policy as a recipient of email and billing
  metadata.
- `exportData` (`packages/api/src/routers/user.ts:162`) extends to include
  subscription state and the scan ledger, or the export stops being complete the
  moment billing ships.

## Pricing configuration

Launch values. Held as configuration (Stripe price IDs in env or
`InstanceConfig`), never hardcoded, so they can be retuned without a deploy.

| Product                  | CZK | EUR |
| ------------------------ | --- | --- |
| VIP subscription / month | 50  | 2   |
| 2 scans                  | 20  | 1   |
| 5 scans                  | 50  | 2   |
| 10 scans                 | 100 | 4   |

Currency follows the user's locale: `cs` → CZK, `en` → EUR. EUR values are chosen
for roundness, not converted, so they drift from the CZK equivalent by design.

## BYO key removal

The three-way key resolution in `ocr.ts:60-81` collapses to one path: the
instance key from `InstanceConfig`, set only from `/admin`. This is a net
deletion of code.

- Remove the per-user OpenRouter key UI from settings.
- Drop `User.openRouterKeyEncrypted` (destructive — see "Concerns" above).
- Keep `InstanceConfig.openRouterKeyEncrypted` and its admin UI. For
  self-hosters this is the documented way to enable OCR.
- Keep `User.ocrModel` — per-user model choice is independent of key ownership.

Self-hosted behaviour with no Stripe keys: any authenticated user may scan using
the instance key. Identical to today minus BYO keys.

## Admin

`/admin` gains: view a user's subscription status and credit balance, grant
credits (writes `ADMIN_GRANT`), and toggle the comp `isVip` flag. Granting
credits is the manual remedy for the refund gap above.

## Testing

- **Entitlement** is a pure function — exhaustive unit tests across the matrix of
  billing-disabled / comp-VIP / subscription state / period boundary / credit
  balance. This is where correctness actually lives.
- **Ledger invariants**: balance equals the sum of deltas after arbitrary
  sequences; concurrent reservations never drive the balance negative.
- **Webhooks** against recorded Stripe fixtures, including a **replayed event**
  asserting no double-credit, and a **bad signature** asserting rejection.
- **Scan flow** integration tests: reservation on failure is refunded; VIP
  falls through to credits at the cap.
- **Withdrawal consent**: a credit-pack Checkout Session cannot be created
  without the immediate-performance acknowledgement, and the consent is recorded
  against the purchase.
- **Selective erasure**: after account deletion, personal data is gone _and_ the
  legally required billing record remains, carrying no identifiers beyond what
  the retention obligation requires. Both directions asserted.

## Success criteria

- A user with no entitlement is refused with a message pointing at pricing.
- Buying a pack credits exactly the purchased scans; a replayed webhook credits
  nothing further.
- Subscribing grants 150 scans per period; the 151st consumes a credit; with no
  credits it is refused.
- A failed scan leaves the balance unchanged.
- Comp `isVip` users scan without limit and without Stripe involvement.
- With `STRIPE_SECRET_KEY` unset, scanning behaves exactly as it does today for a
  self-hoster with an instance key configured.
- Cancellation through the Customer Portal is reflected in the app.
- Credits cannot be bought without acknowledging immediate performance.
- Deleting an account leaves the required billing record and nothing else.
- `exportData` includes subscription state and the scan ledger.

## Receipt-image storage

`isVip` currently gates **two** privileges, not one: using the shared OCR key,
and storing the receipt photo for later viewing (`ocr.ts:102`, and the field
comment at `schema.prisma:42`). Splitting "VIP" into a comp flag and a paid
subscription leaves the second undefined, so it is defined here.

**Storage is subscription-scoped.** A stored receipt image requires either an
active subscription or the comp `isVip` flag. A scan paid for with a credit
produces the expense and its line items but no retained photo.

This is deliberate product design as much as cost control: it gives the
subscription a benefit that is not merely "more of the same", which partially
answers the pricing-gap concern above — credits are no longer strictly-worse VIP,
they are a different thing.

Implementation note: the storage condition in `ocr.ts:102` becomes a property of
the resolved entitlement rather than a direct `user.isVip` read, so the rule lives
in one place with the rest of the entitlement logic.

## Open items

- Launch price points stand as specified despite the flagged VIP/credit value
  gap. Revisit after real usage data.
- Czech-compliant invoicing with IČO is deferred until after launch; Stripe's
  automatic receipts cover the interim.
- Whether the 150 cap should be visible in the UI as a progress indicator or only
  surfaced when approached.
