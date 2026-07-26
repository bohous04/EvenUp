# Public Pages, Locale Routing and GDPR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public marketing surface (landing, pricing, legal) with real per-language URLs, and close the three release blockers that currently make the billing branch unshippable.

**Architecture:** Czech stays the unprefixed default (`/groups`) and English moves under `/en`, via a middleware rewrite onto an `app/[locale]/` segment — so every `/invite/<token>` link already in circulation keeps working. Marketing pages are server components calling the existing pure `t(locale, key)`, statically generated; the signed-in app keeps its client `I18nProvider` untouched.

**Tech Stack:** Next.js App Router, React, Tailwind v4, tRPC, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-25-public-pages-and-gdpr-design.md`

## Why the task order is what it is

Tasks 1 and 2 are **release blockers** inherited from the billing branch's final review. Until they land, `feat/billing-and-metering` cannot ship at all:

1. The OCR consent gate has no UI, and `user.me` doesn't expose `ocrConsentAt`. Every existing user is blocked from scanning and is shown *"Recognition failed. Enter the items manually"* — because `ocr-scan.tsx:170-175` handles `PRECONDITION_FAILED` and `PAYMENT_REQUIRED` but not the `FORBIDDEN` the consent gate throws.
2. `/vip` does not exist, yet `packages/api/src/routers/billing.ts` sends every checkout success, cancel and portal return there. Every purchase ends on a 404. The billing router has **zero client callers**.

Neither needs the locale routing, because Czech is the unprefixed default — `/vip` is a valid Czech URL on day one and gains `/en/vip` for free in Task 3. So they go first.

## Global Constraints

- **All user-facing strings go through `@evenup/i18n`**, added to BOTH `packages/i18n/src/locales/cs.ts` and `en.ts`. Czech is `DEFAULT_LOCALE`. A key in one catalog and not the other is a bug.
- **Any English error message thrown from a router must EXACTLY match its `errors.*` value in `en.ts`**, and must not duplicate another `errors.*` English value — `packages/api/src/trpc.ts` builds a reverse map from English text to keys, and a duplicate silently breaks localisation.
- **Do NOT run repo-wide `pnpm format`.** `main` is not prettier-clean, so it rewrites ~14 unrelated files. Format only files you touched: `pnpm exec prettier --write <paths>`.
- **Money is integer minor units.** Prices come from Spec 1's configuration; nothing here hardcodes an amount.
- **Billing must stay inert without `STRIPE_SECRET_KEY`** — a self-hosted instance must keep working. Any new UI must degrade gracefully when `billing.summary` reports `billingEnabled: false`.
- **The privacy policy must not claim anonymity.** Retained billing rows keep `stripeEventId`/`stripeSubscriptionId`, which resolve via Stripe to a Customer holding the person's email. That is pseudonymization, retained lawfully under GDPR Art. 17(3)(b).
- **No cookie consent banner.** The app sets only strictly-necessary session cookies and carries no analytics or third-party scripts. Adding one would be wrong, not cautious.
- Prettier, `pnpm typecheck` (6/6) and `pnpm lint` (6/6) must all pass.

## Test environment (devbox)

```bash
docker start evenup-testpg 2>/dev/null || docker run -d --name evenup-testpg \
  -e POSTGRES_PASSWORD=evenup -e POSTGRES_USER=evenup -e POSTGRES_DB=evenup \
  -p 5442:5432 postgres:16-alpine
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' evenup-testpg
```

Connect by **container IP**, not localhost:

```bash
export DATABASE_URL=postgresql://evenup:evenup@172.17.0.10:5432/evenup
pnpm --filter @evenup/db exec prisma migrate deploy
pnpm --filter @evenup/db exec prisma generate   # skipping this fails ten API test files
```

Do **not** `source .env` — it trips a zsh parse error. Export vars individually.

**`prisma migrate dev` does not work here.** It tries to reset the shared database (non-standard migration folder names break shadow-DB history replay) then dies with exit 130 for want of a TTY. Use `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url <scratch db> --script`, write the migration folder by hand, then `prisma migrate deploy`.

Playwright: `PLAYWRIGHT_BROWSERS_PATH` is preset to a root-owned path, so `playwright install` exits 0 while silently failing. Override it: `PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright pnpm exec playwright install chromium`, and run `--project=chromium`.

**Baseline: core 262, i18n 31, web 70, api 243; typecheck 6/6; lint 6/6.**

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/components/ocr-consent-dialog.tsx` | one-time consent prompt before first scan |
| `apps/web/src/app/vip/page.tsx` | pricing + purchase entry points (Czech, unprefixed) |
| `apps/web/src/middleware.ts` | locale rewrite/redirect; **must exclude `/api`** |
| `apps/web/src/app/[locale]/(marketing)/` | server-rendered, statically generated public pages |
| `apps/web/src/app/[locale]/(app)/` | existing client app, moved under the segment |
| `packages/i18n/src/locales/marketing.ts` | marketing + legal copy, kept out of the app catalogs |
| `packages/api/src/services/session-cleanup.ts` | expired-session purge (GDPR retention) |

---

### Task 1: OCR consent UI — RELEASE BLOCKER

**Files:**
- Modify: `packages/api/src/routers/user.ts:14-27` (add `ocrConsentAt` to the `me` select)
- Create: `apps/web/src/components/ocr-consent-dialog.tsx`
- Modify: `apps/web/src/components/ocr-scan.tsx:170-175`
- Modify: `apps/web/src/app/settings/page.tsx` (revoke control in the Data section, ~line 375)
- Modify: `packages/i18n/src/locales/cs.ts`, `en.ts`
- Test: `packages/api/src/routers/user-profile.test.ts`, `apps/web/src/components/ocr-consent-dialog.test.tsx`

**Interfaces:**
- Consumes: `user.setOcrConsent({ granted: boolean })` (already exists, Spec 1 Task 6).
- Produces: `me.ocrConsentAt: Date | null` on the `user.me` payload.

- [ ] **Step 1: Write the failing API test**

Add to `packages/api/src/routers/user-profile.test.ts`:

```ts
it('exposes ocrConsentAt on me so the client can prompt for consent', async () => {
  const u = await createTestUser('consent@example.com');
  const before = await makeCaller(u).user.me();
  expect(before.ocrConsentAt).toBeNull();

  await makeCaller(u).user.setOcrConsent({ granted: true });
  const after = await makeCaller(u).user.me();
  expect(after.ocrConsentAt).toBeInstanceOf(Date);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @evenup/api test user-profile`
Expected: FAIL — `ocrConsentAt` is undefined on the `me` payload.

- [ ] **Step 3: Add the field to the `me` select**

In `packages/api/src/routers/user.ts`, inside the `me` procedure's `select` block, after `isVip: true,`:

```ts
        // Needed by the client to decide whether to prompt for OCR consent.
        // A timestamp, not a boolean, so support can see when it was given.
        ocrConsentAt: true,
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @evenup/api test user-profile`
Expected: PASS.

- [ ] **Step 5: Add the i18n strings**

To `packages/i18n/src/locales/cs.ts`:

```ts
  'ocr.consent.title': 'Souhlas se skenováním účtenek',
  'ocr.consent.body':
    'Fotku účtenky odešleme poskytovateli umělé inteligence, který ji přečte. Zpracování může probíhat mimo EU. Účtenka může prozradit citlivé údaje — třeba nákup v lékárně. Souhlas můžete kdykoli odvolat v Nastavení.',
  'ocr.consent.accept': 'Souhlasím, naskenovat',
  'ocr.consent.cancel': 'Zrušit',
  'settings.ocrConsent.title': 'Skenování účtenek',
  'settings.ocrConsent.granted': 'Souhlas udělen {date}',
  'settings.ocrConsent.notGranted': 'Souhlas zatím neudělen',
  'settings.ocrConsent.revoke': 'Odvolat souhlas',
```

To `packages/i18n/src/locales/en.ts`:

```ts
  'ocr.consent.title': 'Consent to receipt scanning',
  'ocr.consent.body':
    'We send the receipt photo to an AI provider that reads it. Processing may take place outside the EU. A receipt can reveal sensitive information — a pharmacy purchase, for example. You can withdraw consent at any time in Settings.',
  'ocr.consent.accept': 'Agree and scan',
  'ocr.consent.cancel': 'Cancel',
  'settings.ocrConsent.title': 'Receipt scanning',
  'settings.ocrConsent.granted': 'Consent given {date}',
  'settings.ocrConsent.notGranted': 'Consent not given yet',
  'settings.ocrConsent.revoke': 'Withdraw consent',
```

- [ ] **Step 6: Create the consent dialog**

Create `apps/web/src/components/ocr-consent-dialog.tsx`:

```tsx
'use client';
import { useI18n } from '@/lib/i18n';

/**
 * One-time consent before a receipt image is sent to the OCR provider.
 * Opt-in rather than implied because a receipt can disclose special-category
 * data under GDPR Art. 9 (a pharmacy purchase reveals health information) and
 * the image leaves the EU. Revocable from Settings.
 */
export function OcrConsentDialog({
  onAccept,
  onCancel,
  pending,
}: {
  onAccept: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-consent-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <h2 id="ocr-consent-title" className="text-lg font-bold">
          {t('ocr.consent.title')}
        </h2>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{t('ocr.consent.body')}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-zinc-300 px-4 py-2 font-medium dark:border-zinc-700"
          >
            {t('ocr.consent.cancel')}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {t('ocr.consent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the failing component test**

Create `apps/web/src/components/ocr-consent-dialog.test.tsx`, following the render/provider pattern used by the existing tests in `apps/web/src/components/`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrConsentDialog } from './ocr-consent-dialog';
import { Providers } from './providers';

function renderDialog(props: Partial<Parameters<typeof OcrConsentDialog>[0]> = {}) {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  render(
    <Providers>
      <OcrConsentDialog onAccept={onAccept} onCancel={onCancel} pending={false} {...props} />
    </Providers>,
  );
  return { onAccept, onCancel };
}

describe('OcrConsentDialog', () => {
  it('names the risk instead of asking for blank consent', () => {
    renderDialog();
    // The user must be told the image leaves the EU and can be sensitive —
    // consent to an unexplained action is not informed consent.
    expect(screen.getByRole('dialog')).toHaveTextContent(/EU/i);
  });

  it('calls onAccept when the user agrees', async () => {
    const { onAccept } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /agree|souhlas/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('disables accept while the mutation is in flight', () => {
    renderDialog({ pending: true });
    expect(screen.getByRole('button', { name: /agree|souhlas/i })).toBeDisabled();
  });
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @evenup/web test ocr-consent-dialog`
Expected: PASS — 3 tests.

- [ ] **Step 9: Wire the dialog into the scan flow**

In `apps/web/src/components/ocr-scan.tsx`:

Import the dialog and the session query, hold `const [consentPrompt, setConsentPrompt] = useState<null | (() => void)>(null);`, and before triggering a file input, check `me.data?.ocrConsentAt`. If null, store the pending action in `consentPrompt` and render `<OcrConsentDialog>`; on accept, call the `user.setOcrConsent` mutation with `{ granted: true }`, invalidate `user.me`, then run the stored action.

Also extend the error branch so the consent refusal is readable — currently `FORBIDDEN` falls through to the generic message:

```tsx
    onError: (e) =>
      setError(
        e.data?.code === 'PRECONDITION_FAILED' ||
          e.data?.code === 'PAYMENT_REQUIRED' ||
          // The consent gate throws FORBIDDEN. Without this branch the user is
          // told "Recognition failed. Enter the items manually", which is a lie
          // and gives them no way to fix it.
          e.data?.code === 'FORBIDDEN'
          ? e.message
          : t('ocr.failed'),
      ),
```

- [ ] **Step 10: Add the revoke control to Settings**

In `apps/web/src/app/settings/page.tsx`, inside the Data section (near the existing export/delete buttons at ~line 375), add a block showing `settings.ocrConsent.granted` (with the formatted date) or `settings.ocrConsent.notGranted`, plus a revoke button calling `setOcrConsent({ granted: false })` and invalidating `user.me`. Follow the existing button styling in that file.

- [ ] **Step 11: Verify everything**

Run: `pnpm --filter @evenup/api test && pnpm --filter @evenup/web test && pnpm typecheck && pnpm lint`
Expected: api 244+, web 73+, typecheck 6/6, lint 6/6.

- [ ] **Step 12: Commit**

```bash
pnpm exec prettier --write apps/web/src/components/ocr-consent-dialog.tsx \
  apps/web/src/components/ocr-consent-dialog.test.tsx apps/web/src/components/ocr-scan.tsx \
  apps/web/src/app/settings/page.tsx packages/api/src/routers/user.ts \
  packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git add -u && git add apps/web/src/components/ocr-consent-dialog.tsx apps/web/src/components/ocr-consent-dialog.test.tsx
git commit -m "feat(ocr): consent dialog, revoke control and readable refusal"
```

---

### Task 2: `/vip` pricing page — RELEASE BLOCKER

**Files:**
- Create: `apps/web/src/app/vip/page.tsx`
- Create: `apps/web/src/components/vip-pricing.tsx`
- Modify: `packages/i18n/src/locales/cs.ts`, `en.ts`
- Test: `apps/web/src/components/vip-pricing.test.tsx`

**Interfaces:**
- Consumes: `billing.summary` → `{ billingEnabled, creditBalance, isVip, subscription, currency, packs: {id, scans, priceId}[] }`; `billing.checkoutSubscription()`, `billing.checkoutCredits({ packId, acknowledgeImmediate })`, `billing.portal()` — each returning `{ url }`.
- Produces: the `/vip` route that `BILLING_RETURN_URL` targets.

- [ ] **Step 1: Add the i18n strings**

`cs.ts`:

```ts
  'vip.title': 'EvenUp VIP',
  'vip.subtitle': 'Skenujte účtenky, my je přečteme za vás.',
  'vip.benefit.scans': '150 skenů účtenek měsíčně',
  'vip.benefit.storage': 'Uložené fotky účtenek k pozdějšímu nahlédnutí',
  'vip.benefit.cancel': 'Zrušíte kdykoli',
  'vip.subscribe': 'Předplatit VIP',
  'vip.manage': 'Spravovat předplatné',
  'vip.balance': 'Zbývá skenů: {count}',
  'vip.credits.title': 'Nebo si dokupte jednotlivé skeny',
  'vip.credits.pack': '{scans} skenů',
  'vip.credits.buy': 'Koupit',
  'vip.credits.ack':
    'Souhlasím, aby skeny byly dodány ihned, a beru na vědomí, že tím ztrácím právo na odstoupení od smlouvy do 14 dnů.',
  'vip.disabled': 'Placené funkce nejsou na této instanci zapnuté.',
```

`en.ts`:

```ts
  'vip.title': 'EvenUp VIP',
  'vip.subtitle': 'Photograph a receipt; we read it for you.',
  'vip.benefit.scans': '150 receipt scans a month',
  'vip.benefit.storage': 'Receipt photos kept so you can look back at them',
  'vip.benefit.cancel': 'Cancel any time',
  'vip.subscribe': 'Subscribe to VIP',
  'vip.manage': 'Manage subscription',
  'vip.balance': 'Scans remaining: {count}',
  'vip.credits.title': 'Or buy scans one pack at a time',
  'vip.credits.pack': '{scans} scans',
  'vip.credits.buy': 'Buy',
  'vip.credits.ack':
    'I agree the scans are delivered immediately, and I understand this means I lose my right to withdraw within 14 days.',
  'vip.disabled': 'Paid features are not enabled on this instance.',
```

The withdrawal acknowledgement wording is **legally load-bearing** — it is the express consent to immediate performance that makes the purchase non-refundable once consumed. Do not soften it.

- [ ] **Step 2: Write the failing component test**

Create `apps/web/src/components/vip-pricing.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VipPricing } from './vip-pricing';
import { Providers } from './providers';

const summary = {
  billingEnabled: true,
  creditBalance: 3,
  isVip: false,
  subscription: null,
  currency: 'CZK' as const,
  packs: [{ id: 'pack5', scans: 5, priceId: 'price_x' }],
};

function renderPricing(over: Partial<typeof summary> = {}) {
  render(
    <Providers>
      <VipPricing summary={{ ...summary, ...over }} onSubscribe={() => {}} onBuy={() => {}} onPortal={() => {}} />
    </Providers>,
  );
}

describe('VipPricing', () => {
  it('keeps Buy disabled until the withdrawal right is acknowledged', async () => {
    renderPricing();
    const buy = screen.getByRole('button', { name: /buy|koupit/i });
    expect(buy).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(buy).toBeEnabled();
  });

  it('shows the current credit balance', () => {
    renderPricing();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('degrades gracefully when billing is disabled (self-hosting)', () => {
    renderPricing({ billingEnabled: false, packs: [] });
    expect(screen.queryByRole('button', { name: /subscribe|předplatit/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @evenup/web test vip-pricing`
Expected: FAIL — cannot resolve `./vip-pricing`.

- [ ] **Step 4: Implement `VipPricing`**

Create `apps/web/src/components/vip-pricing.tsx` as a presentational client component taking `summary`, `onSubscribe`, `onBuy(packId)` and `onPortal` as props (so it is testable without tRPC). It must:

- render the three benefit lines and the credit balance;
- render one row per pack with a Buy button;
- render a single checkbox bound to local state, and keep **every** Buy button `disabled` until it is checked — this is the withdrawal acknowledgement and the server rejects the checkout without it;
- render Subscribe when there is no active subscription, and Manage (portal) when there is;
- render `vip.disabled` and no purchase controls when `billingEnabled` is false.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @evenup/web test vip-pricing`
Expected: PASS — 3 tests.

- [ ] **Step 6: Create the route**

Create `apps/web/src/app/vip/page.tsx` — a client page that calls `trpc.billing.summary.useQuery()`, renders `<VipPricing>`, and wires the three callbacks to `checkoutSubscription`, `checkoutCredits({ packId, acknowledgeImmediate: true })` and `portal`, each doing `window.location.href = res.url` on success.

Pass `acknowledgeImmediate: true` only because the checkbox gates the button; the server independently rejects a false value, so the two agree.

- [ ] **Step 7: Verify**

Run: `pnpm --filter @evenup/web test && pnpm typecheck && pnpm lint`
Expected: web 76+, typecheck 6/6, lint 6/6.

- [ ] **Step 8: Commit**

```bash
pnpm exec prettier --write apps/web/src/app/vip/page.tsx apps/web/src/components/vip-pricing.tsx \
  apps/web/src/components/vip-pricing.test.tsx packages/i18n/src/locales/cs.ts packages/i18n/src/locales/en.ts
git add -A apps/web/src/app/vip apps/web/src/components/vip-pricing.tsx \
  apps/web/src/components/vip-pricing.test.tsx packages/i18n
git commit -m "feat(billing): /vip pricing page with withdrawal acknowledgement"
```

---

### Task 3: Locale middleware and the `[locale]` segment

**Files:**
- Create: `apps/web/src/middleware.ts`
- Move: every route under `apps/web/src/app/` into `apps/web/src/app/[locale]/(app)/` (except `api/`)
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Test: `apps/web/src/middleware.test.ts`

**Interfaces:**
- Produces: `/x` serves Czech, `/en/x` serves English, `/cs/x` redirects to `/x`.

- [ ] **Step 1: Write the failing middleware test**

Create `apps/web/src/middleware.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function req(path: string) {
  return new NextRequest(new URL(`https://evenup.cz${path}`));
}

describe('locale middleware', () => {
  it('rewrites an unprefixed path to the Czech segment without changing the URL', () => {
    const res = middleware(req('/groups/123'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/cs/groups/123');
  });

  it('passes /en through untouched', () => {
    const res = middleware(req('/en/groups/123'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/en/groups/123');
  });

  it('redirects an explicit /cs prefix to the canonical unprefixed URL', () => {
    const res = middleware(req('/cs/groups/123'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toContain('/groups/123');
  });

  it('NEVER touches /api — rewriting it breaks auth and every tRPC call', () => {
    const res = middleware(req('/api/trpc/user.me'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('leaves the service worker and manifest alone', () => {
    for (const p of ['/manifest.webmanifest', '/sw.js']) {
      expect(middleware(req(p)).headers.get('x-middleware-rewrite')).toBeNull();
    }
  });

  it('preserves the query string through a rewrite', () => {
    const res = middleware(req('/invite/tok?ref=x'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('ref=x');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @evenup/web test middleware`
Expected: FAIL — cannot resolve `./middleware`.

- [ ] **Step 3: Implement the middleware**

Create `apps/web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

const LOCALES = ['cs', 'en'] as const;
const DEFAULT_LOCALE = 'cs';

/**
 * Czech is the unprefixed default (`/groups`); English lives under `/en`.
 * Keeping Czech unprefixed is what lets the `/invite/<token>` links already in
 * circulation keep working unchanged.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // One canonical URL per page: the explicit default prefix redirects away.
  if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(`/${DEFAULT_LOCALE}`.length) || '/';
    return NextResponse.redirect(url, 308);
  }

  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  const url = req.nextUrl.clone();
  url.pathname = hasLocale ? pathname : `/${DEFAULT_LOCALE}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

/**
 * Everything the middleware must NOT touch. Rewriting `/api/auth/*` or
 * `/api/trpc/*` breaks authentication and every tRPC call — this matcher is the
 * highest-risk line in the routing change.
 */
export const config = {
  matcher: ['/((?!api|_next|sw\\.js|manifest\\.webmanifest|.*\\.[a-z0-9]+$).*)'],
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @evenup/web test middleware`
Expected: PASS — 6 tests.

- [ ] **Step 5: Move the routes under the segment**

`git mv` every directory in `apps/web/src/app/` except `api/`, `globals.css`, `layout.tsx`, `icon.svg` and the opengraph/twitter image files into `apps/web/src/app/[locale]/(app)/`. Create `apps/web/src/app/[locale]/layout.tsx` that reads `params.locale`, sets `<html lang={locale}>` (replacing the hardcoded `lang="cs"` at `apps/web/src/app/layout.tsx:39`) and returns both locales from `generateStaticParams`.

Keep `apps/web/src/app/vip/page.tsx` from Task 2 by moving it to `apps/web/src/app/[locale]/(marketing)/vip/page.tsx` — it keeps working at `/vip` and gains `/en/vip`.

- [ ] **Step 6: Verify nothing broke**

Run: `pnpm --filter @evenup/web test && pnpm typecheck && pnpm lint && pnpm --filter @evenup/web build`
Expected: all green. The build is the real check — a misplaced route only fails there.

Then confirm the invite path still resolves, since that is the regression this design exists to prevent:

Run: `pnpm --filter @evenup/web test middleware`
Expected: the `/invite/tok?ref=x` case passes.

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write apps/web/src/middleware.ts apps/web/src/middleware.test.ts
git add -A apps/web/src
git commit -m "feat(web): locale routing with czech unprefixed and english under /en"
```

---

### Task 4: Marketing catalog and the landing page

**Files:**
- Create: `packages/i18n/src/locales/marketing.ts`
- Modify: `packages/i18n/src/index.ts` (export it)
- Create: `apps/web/src/app/[locale]/(marketing)/layout.tsx`, `page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/groups/page.tsx` (the dashboard's new home)
- Test: `apps/web/e2e/landing.spec.ts`

- [ ] **Step 1: Create the marketing catalog**

Create `packages/i18n/src/locales/marketing.ts` exporting `marketingCs` and `marketingEn` objects with matching keys, kept separate so marketing copy does not bloat the app catalogs. Cover: hero title and subtitle, five feature headings and blurbs (debt minimisation, receipt OCR, QR platba, multi-currency, members without accounts), four FAQ question/answer pairs, and the closing call to action.

Lead the hero on debt minimisation — *"settle in the fewest payments"* — because that is the genuinely differentiating claim, not "split expenses".

- [ ] **Step 2: Write the failing e2e test**

Create `apps/web/e2e/landing.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('serves the Czech landing page server-side at the root', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
});

test('serves English at /en with the right lang attribute', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('renders translated copy WITHOUT javascript — this is the whole point', async ({ browser }) => {
  // If this fails, crawlers see one language and users see a flash of the
  // wrong one, which is exactly what the routing change exists to prevent.
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/en');
  await expect(page.locator('h1')).toBeVisible();
  await ctx.close();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright pnpm --filter @evenup/web exec playwright test landing --project=chromium`
Expected: FAIL — the root still renders the sign-in screen.

- [ ] **Step 4: Build the landing page**

Create the marketing layout (own header/footer, no app chrome, no `ServiceWorker`) and `page.tsx` as **server components** calling `t(locale, key)` directly from `@evenup/i18n` — no `I18nProvider`, no `'use client'`. Sections: hero, features, pricing (reading Spec 1's price config), FAQ, CTA. Show a "go to the app" link when a session cookie is present, but keep the page statically renderable.

- [ ] **Step 5: Give the dashboard a home**

Create `apps/web/src/app/[locale]/(app)/groups/page.tsx` rendering `<GroupsDashboard />`, and update the header/logo links and any post-sign-in redirect to point at `/groups` instead of `/`.

- [ ] **Step 6: Run the e2e**

Run: `PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright pnpm --filter @evenup/web exec playwright test landing --project=chromium`
Expected: PASS — 3 tests. (`next build` must run first; the webServer starts `next start`.)

- [ ] **Step 7: Commit**

```bash
pnpm exec prettier --write packages/i18n/src/locales/marketing.ts packages/i18n/src/index.ts apps/web/src/app apps/web/e2e/landing.spec.ts
git add -A packages/i18n apps/web
git commit -m "feat(web): server-rendered bilingual landing page; dashboard moves to /groups"
```

---

### Task 5: Legal pages

**Files:**
- Create: `apps/web/src/app/[locale]/(marketing)/{terms,privacy,refunds,contact}/page.tsx`
- Modify: `packages/i18n/src/locales/marketing.ts`

- [ ] **Step 1: Write the copy**

Add four documents to the marketing catalog, in both languages, written against **actual system behaviour**:

- **Terms** — the 150-scan monthly allowance, credits never expiring, fall-through from allowance to credits, cancellation via the Stripe portal.
- **Privacy** — the real processors: **OpenRouter** (receipt images, may leave the EU, may reveal special-category data), **Stripe** (email and billing metadata), **Seznam Email Profi** (transactional mail — *not* Resend; the app sends via Seznam), object storage (receipt images, 30-day retention), Google/Apple only if social sign-in is used. State retention per category. State that account deletion retains payment records under GDPR Art. 17(3)(b) and that those records are **pseudonymized, not anonymous**, because the Stripe identifiers still resolve to a Customer holding the person's email.
- **Refunds** — the 14-day withdrawal right, and that it is lost for credits once the customer consents to immediate performance at checkout.
- **Contact** — business name, IČO, registered address, `support@evenup.cz`.

⚠️ **These drafts are structured starting points written against real behaviour, not legal advice.** They must be reviewed by someone qualified before live payments. Say so in the task's commit message.

- [ ] **Step 2: Build the pages**

Four server components rendering their document from the catalog, sharing one prose layout.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @evenup/web build && pnpm --filter @evenup/web test && pnpm typecheck && pnpm lint`
Expected: all green; all four routes build in both locales.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src/app packages/i18n
git commit -m "feat(web): terms, privacy, refunds and contact pages

Drafted against actual system behaviour, including the real processor list
and the pseudonymized-not-anonymous retention position. NOT legal advice —
requires qualified review before live payments are enabled."
```

---

### Task 6: SEO metadata, sitemap and robots

**Files:**
- Modify: each `(marketing)` `page.tsx` (add `generateMetadata`)
- Create: `apps/web/src/app/sitemap.ts`, `apps/web/src/app/robots.ts`
- Test: `apps/web/e2e/seo.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `apps/web/e2e/seo.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('root and /en cross-reference each other with hreflang', async ({ page }) => {
  await page.goto('/');
  const cs = page.locator('link[rel="alternate"][hreflang="cs"]');
  const en = page.locator('link[rel="alternate"][hreflang="en"]');
  await expect(cs).toHaveCount(1);
  await expect(en).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});

test('sitemap lists both locales and robots points at it', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const body = await sitemap.text();
  expect(body).toContain('/en');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright pnpm --filter @evenup/web exec playwright test seo --project=chromium`
Expected: FAIL — no alternates, no sitemap.

- [ ] **Step 3: Implement**

Add `generateMetadata({ params })` to each marketing page emitting `alternates: { canonical, languages: { cs, en, 'x-default' } }` plus a localised title and description. Create `sitemap.ts` listing every marketing route in both locales, and `robots.ts` allowing crawling and naming the sitemap. Base the absolute URLs on `BETTER_AUTH_URL`, as `layout.tsx` already does for `metadataBase`.

- [ ] **Step 4: Run it to verify it passes**

Run: `PLAYWRIGHT_BROWSERS_PATH=/home/dev/.cache/ms-playwright pnpm --filter @evenup/web exec playwright test seo --project=chromium`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): hreflang alternates, sitemap and robots for both locales"
```

---

### Task 7: Session retention purge

**Files:**
- Create: `packages/api/src/services/session-cleanup.ts`
- Test: `packages/api/src/services/session-cleanup.test.ts`
- Modify: `apps/web/src/app/api/cron/receipt-cleanup/route.ts` (or a sibling cron route)

**Interfaces:**
- Produces: `purgeExpiredSessions(prisma, now): Promise<{ deleted: number }>`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/services/session-cleanup.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestUser, testPrisma, resetDb } from '../test/harness.js';
import { purgeExpiredSessions } from './session-cleanup.js';

describe('purgeExpiredSessions', () => {
  beforeEach(resetDb);

  it('deletes expired sessions and keeps live ones', async () => {
    const u = await createTestUser('a@example.com');
    const now = new Date('2026-07-26T00:00:00Z');
    await testPrisma.session.createMany({
      data: [
        { userId: u.id, token: 'old', expiresAt: new Date('2026-07-01T00:00:00Z'),
          ipAddress: '1.2.3.4', userAgent: 'x' },
        { userId: u.id, token: 'live', expiresAt: new Date('2026-08-01T00:00:00Z') },
      ],
    });

    const { deleted } = await purgeExpiredSessions(testPrisma, now);

    expect(deleted).toBe(1);
    const left = await testPrisma.session.findMany();
    expect(left).toHaveLength(1);
    expect(left[0].token).toBe('live');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @evenup/api test session-cleanup`
Expected: FAIL — cannot resolve `./session-cleanup.js`.

- [ ] **Step 3: Implement**

Create `packages/api/src/services/session-cleanup.ts`:

```ts
/**
 * Expired sessions carry personal data — `Session.ipAddress` and
 * `Session.userAgent` — with no reason to keep them once the session is dead.
 * GDPR storage limitation says delete them; nothing else does.
 */
import type { PrismaClient } from '@evenup/db';

export async function purgeExpiredSessions(
  prisma: PrismaClient,
  now: Date,
): Promise<{ deleted: number }> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return { deleted: count };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @evenup/api test session-cleanup`
Expected: PASS.

- [ ] **Step 5: Call it from the cron route**

Invoke `purgeExpiredSessions` alongside the existing receipt cleanup in the cron handler, guarded by the same `CRON_SECRET` bearer check, and include its count in the response.

- [ ] **Step 6: Commit**

```bash
pnpm exec prettier --write packages/api/src/services/session-cleanup.ts packages/api/src/services/session-cleanup.test.ts
git add -A packages/api apps/web/src/app/api/cron
git commit -m "feat(gdpr): purge expired sessions and their ip/user-agent data"
```

---

## Deployment checklist

- Set `BILLING_RETURN_URL=https://evenup.cz` — it currently defaults to `http://localhost:3000` and bypasses the fail-fast env module, so forgetting it sends paying customers to localhost with no startup error.
- Create the Stripe products and prices in **both** CZK and EUR; register the webhook at `https://evenup.cz/api/stripe/webhook`.
- Enable OpenRouter **no-training / zero-retention** and pin the model.
- Have the terms, privacy and refund pages reviewed before enabling live payments — Stripe also requires them present.
- Coolify's env API updates **by key, not row id**; check for duplicate rows before trusting an update.
- `docs/SELF_HOSTING.md` should state that billing is optional and inert without `STRIPE_SECRET_KEY`.
