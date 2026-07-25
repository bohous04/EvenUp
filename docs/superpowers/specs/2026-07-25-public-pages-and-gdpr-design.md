# Public pages, locale routing and GDPR

**Date:** 2026-07-25
**Scope:** Spec 2 of 2. Locale URL routing, the marketing landing page, the VIP
pricing page, the legal pages, and the data-protection work across the app.
**Depends on:** the price model and entitlement rules in
`2026-07-25-billing-and-metering-design.md` (Spec 1), which this spec amends.

## Context

The app has no public surface. `/` renders `<SignIn/>` when logged out and
`<GroupsDashboard/>` when logged in (`apps/web/src/app/page.tsx:22`).

Localisation is **client-only**: `I18nProvider` holds the locale in React state
hydrated from `localStorage` inside a `useEffect`
(`apps/web/src/lib/i18n.tsx:28-34`), and the root layout hardcodes `lang="cs"`
(`apps/web/src/app/layout.tsx:39`). The server therefore always renders Czech and
English appears only after hydration. That is acceptable behind a login and
disqualifying for a page whose purpose is acquisition: crawlers see one language
and users see a flash of the wrong one.

`@evenup/i18n` exposes `t(locale, key)` as a pure function
(`packages/i18n/src/translate.ts:26`), so server components can translate
directly. The existing client provider needs no refactor.

### GDPR posture already in place

| Capability | Location |
|---|---|
| Right to erasure | `packages/api/src/services/account.ts:10` |
| Right to access / portability | `packages/api/src/routers/user.ts:162` |
| Both reachable by users | `apps/web/src/app/settings/page.tsx:134-143,438-440` |
| Receipt-image retention and purge | `packages/api/src/services/receipt-cleanup.ts` |
| Error logs exclude request inputs and secrets | `schema.prisma:77` |
| Notification payloads minimised by design | `schema.prisma:488` |
| No analytics, tracking or third-party scripts | verified by search — zero hits |

The last row has a practical consequence: with only strictly-necessary session
cookies and no tracking, **no cookie consent banner is required**. One should not
be added.

## Decisions

| Decision | Choice |
|---|---|
| Locale URLs | Czech unprefixed (`/groups`), English prefixed (`/en/groups`) |
| Root URL | Czech landing page directly; `/en` for English |
| Routing scope | the whole app, not only marketing pages |
| Dashboard | moves from `/` to `/groups` |
| Visual direction | bolder marketing treatment, sharing the existing brand palette |
| Legal pages | terms, privacy, refunds, contact — both locales |
| OCR lawful basis | explicit one-time opt-in, recorded and revocable |
| Cookie banner | none — no non-essential cookies exist |

Choosing Czech as the *unprefixed default* resolves what would otherwise have
been a conflict: prefixing every route would have invalidated the
`/invite/<token>` links already in circulation
(`apps/web/src/components/group-detail.tsx:59`). As the default locale they keep
working unchanged.

## Routing

Middleware maps requests onto a `[locale]` segment without changing what users
see:

| Request | Behaviour |
|---|---|
| `/groups/123` | internal rewrite to `/cs/groups/123`; URL unchanged |
| `/en/groups/123` | passes through |
| `/cs/groups/123` | **redirect** to `/groups/123` — one canonical URL per page |

**The matcher must exclude `/api/*`, `/_next/*`, `manifest.webmanifest`, the
service worker and static assets.** Rewriting `/api/auth/*` or `/api/trpc/*`
breaks authentication and every tRPC call. This is the highest-risk line in the
change and needs a test asserting API paths are untouched.

Route groups separate the two rendering models:

```
app/[locale]/(marketing)/   server-rendered, statically generated, no app chrome
app/[locale]/(app)/         existing Providers + Header + ServiceWorker
app/[locale]/layout.tsx     <html lang={locale}> — replaces the hardcoded "cs"
```

`generateStaticParams` returns both locales so marketing pages are static.

## Translation on the server

Marketing pages are server components calling `t(locale, key)` directly. The app
keeps `I18nProvider` untouched. Two mechanisms, cleanly separated by route group,
rather than one mechanism stretched to cover both.

Marketing and legal copy live in a new catalog namespace so they do not bloat the
app catalogs.

## Pages

- **Landing** (`/`, `/en`) — hero on the debt-minimisation hook ("settle in the
  fewest payments", which is the genuinely differentiating claim), key features,
  pricing, FAQ, closing call to action.
- **VIP / pricing** (`/vip`, `/en/vip`) — benefits and the buttons that open
  Stripe Checkout. Prices come from Spec 1 configuration and are formatted with
  the existing locale-aware `formatCurrency`; `cs` renders CZK, `en` renders EUR.
- **Legal** — terms, privacy, refunds, contact, in both locales.

Slugs are identical across locales (`/vip`, `/en/vip`). Localised slugs are
better for search but need a slug map; they can be added later without rework.

### The dashboard moves to `/groups`

`/` becomes the landing page for everyone — static, cacheable and indexable —
with a "go to the app" affordance shown when a session exists. Redirecting
signed-in users away from `/` would defeat static caching of the page whose only
job is acquisition.

This changes established muscle memory for existing users and should be called
out in release notes.

## SEO

`generateMetadata` per page and locale, emitting canonical URLs and `hreflang`
alternates (`cs` ↔ `en` ↔ `x-default`), plus `sitemap.ts` and `robots.ts`.
OpenGraph images already exist at the app root.

## Data protection

### Processors and recipients

Determined by inspecting outbound calls in the codebase; the privacy policy must
name these and not a plausible-looking list.

| Recipient | Data | Note |
|---|---|---|
| OpenRouter | receipt images | routes onward to model providers; see below |
| Stripe | email, billing and payment metadata | new in Spec 1 |
| Seznam (Email Profi SMTP) | recipient address, message content | **not Resend** — the app now sends via Seznam |
| Object storage (S3/MinIO) | receipt images, 30-day retention | self-hosted or provider-dependent |
| Google / Apple | OAuth identifiers | only if the user chooses social sign-in |
| Frankfurter | — | FX rates only; no personal data |

### Receipt OCR: explicit opt-in

Receipt images are the sharpest exposure in the product. A receipt can reveal
**special-category data under Art. 9** — a pharmacy purchase discloses health
information — and also carries location, timestamps and often a card's last four
digits. OpenRouter is a router, so the sub-processor chain extends beyond it and
may leave the EU.

Therefore:

- A **one-time explicit consent** before the first scan, stating plainly that the
  image is sent to an AI provider that may be outside the EU. Stored as a
  timestamped field on `User`, **revocable** from settings, and required before
  `ocr.scan` will proceed.
- Revoking consent stops future scans; it does not retroactively delete expenses
  already created, which the user can delete individually.
- Model pinning plus OpenRouter's **no-training / zero-retention** account
  settings, so less data persists downstream. This is configuration, not code,
  but belongs in the deployment checklist.

### Erasure must become selective

`deleteUserAccount` currently deletes everything. Once payments exist, Czech
accounting law requires retaining invoices and payment records, and that
obligation **overrides the right to erasure** for those specific records
(GDPR Art. 17(3)(b)).

Erasure therefore becomes: purge personal data, retain the minimum billing record
in a form no longer linked to an identifiable person beyond what the law
requires. Getting this wrong breaks the law in one direction or the other, so it
needs explicit tests. **This amends Spec 1.**

### Other changes

- `Session.ipAddress` and `Session.userAgent` (`schema.prisma:98-99`) have no
  stated retention. Add a purge of expired sessions and document the period.
- `exportData` extends to cover subscription state, the scan ledger and the OCR
  consent record.
- The privacy policy states retention periods per category rather than a single
  vague sentence.

### Explicitly out of scope

These are organisational, not code, and cannot be completed here:

- Signed **data processing agreements** with Stripe, OpenRouter and Seznam.
- An **Art. 30 record of processing**. The small-organisation exemption likely
  does not apply once Art. 9 data may be processed.
- A **breach notification procedure**.
- **Legal review of the terms and privacy policy before taking payment.** The
  drafts produced here are structured starting points written against the actual
  system behaviour; they are not a substitute for qualified advice.

## Testing

- Middleware: rewrite, canonical redirect, and an explicit assertion that
  `/api/*` is never rewritten.
- Metadata: canonical and `hreflang` correctness for every marketing page in
  both locales.
- Server rendering: marketing pages return fully translated HTML for `en`
  **before** hydration — this is the regression the whole routing change exists
  to prevent.
- OCR consent: `ocr.scan` refuses without consent; revocation takes effect.
- Selective erasure: personal data is gone, the required billing record remains,
  and the retained record carries no unnecessary identifiers.
- Playwright coverage of both locales end to end.

## Success criteria

- `evenup.cz` serves the Czech landing page as static HTML; `evenup.cz/en` serves
  English, both correct in view-source without JavaScript.
- Existing `/invite/<token>` links continue to resolve.
- `/cs/...` redirects to the unprefixed equivalent; `/api/...` is untouched.
- Pricing shows CZK on Czech pages and EUR on English pages.
- A user cannot scan a receipt without having given OCR consent, and can revoke.
- Account deletion removes personal data while retaining legally required billing
  records.
- No cookie banner exists, because no non-essential cookie exists.

## Open items

- Legal review of terms, privacy policy and refund policy before live payments.
- Whether the landing page uses real product screenshots, which would need to be
  produced and localised.
- Localised slugs deferred.
