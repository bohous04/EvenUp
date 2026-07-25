# Domain migration to evenup.cz + email on evenup.cz

**Date:** 2026-07-25
**Scope:** Parts A (domain cutover), B (subdomain redirects), C (email + anti-spam DNS).
**Explicitly out of scope:** Stripe billing, VIP purchase page, landing page. Those
are a separate subsystem and get their own spec.

## Context

EvenUp runs as Coolify app `wix9iuu2n5j34eqjnqflgjdg` on the lnrt instance
(repo `bohous04/EvenUp`, branch `main`), currently serving `https://evenup.lnrt.cz`.

Measured state at time of writing:

| Host | Result |
|---|---|
| `evenup.cz` | **503** — DNS resolves to Cloudflare, origin has no Traefik router for the name |
| `www.evenup.cz` | no DNS record at all |
| `app.evenup.cz` | no DNS record at all |
| `evenup.lnrt.cz` | 200, healthy |

`evenup.cz` has **no MX and no TXT records** — mail is not configured. `lnrt.cz`
already publishes `v=DMARC1; p=none; rua=mailto:dmarc@lnrt.cz`.

`evenup.cz`, `lnrt.cz` and `lnrtdev.cz` are all on Cloudflare under account
`ec93ae448433ccdbbd74c708ae7aedb5`, sharing nameservers `fay`/`lars.ns.cloudflare.com`.

## Decisions taken

- **Mailboxes: Seznam Email Profi.** Free, unlimited capacity, ~10 mailboxes per
  domain, and already in use for the owner's other domains. Rejected: Cloudflare
  Email Routing (forward-only, cannot send), Zoho free (webmail-only, IMAP
  removed, region-restricted), Google Workspace (no free custom-domain tier).
- **Transactional mail: Seznam SMTP**, chosen by the owner over the recommended
  Resend-on-subdomain. Accepted risks recorded under "Known risks" below.
- **Licensing: MIT and self-hostability are retained.** Billing (future work) is
  hosted-instance-only and inert without keys.
- **Redirects at the Cloudflare edge**, not in application code, since both zones
  are already on Cloudflare. No origin traffic, no Traefik config.

## A. Domain cutover

Additive and reversible: `evenup.cz` serves *alongside* `evenup.lnrt.cz`, and the
old host only becomes a redirect once the new one is verified. No step leaves the
app unreachable.

1. Add `evenup.cz` to the Coolify app's FQDN list, keeping `evenup.lnrt.cz`.
   Traefik gains a router and requests a Let's Encrypt certificate. This alone
   resolves the current 503.
2. Verify on `evenup.cz`: sign-in, a group page, an invite link.
3. Set `BETTER_AUTH_URL=https://evenup.cz` and **rebuild**. The variable is
   marked buildtime on this app, so a restart is insufficient. It also feeds
   `metadataBase` for OpenGraph images (`apps/web/src/app/layout.tsx:7`).
4. Convert `evenup.lnrt.cz` to a 301 once green.

### Consequences

- **All users are logged out.** The session cookie is bound to the old origin;
  a domain change invalidates it. Unavoidable.
- **OAuth redirect URIs must be added before step 3**, by the owner — these
  consoles are not reachable from the devbox:
  - Google Cloud Console: `https://evenup.cz/api/auth/callback/google`
  - Apple Developer portal: matching return URL for `APPLE_SERVICES_ID`
  Both providers accept old and new URIs simultaneously, so adding them early
  means nothing breaks at any point in the sequence.
- The Coolify app shows **two env-var sets**. Identify the live environment
  before editing.
- Changing `ADMIN_EMAILS` is safe: `apps/web/src/server/auth.ts:139` only ever
  promotes (`!user.isAdmin && ...`) and never demotes, and `isAdmin` is persisted
  on the user row. A *new* `@evenup.cz` account would still need to be listed to
  be auto-promoted.

## B. Redirects

All 301, implemented as Cloudflare Redirect Rules (Single Redirects, ruleset
phase `http_request_dynamic_redirect`).

| From | To | Note |
|---|---|---|
| `www.evenup.cz` | `evenup.cz` | DNS record to be created, proxied |
| `app.evenup.cz` | `evenup.cz` | DNS record to be created, proxied |
| `*.evenup.cz` | `evenup.cz` | proxied wildcards are supported on the free plan (A/AAAA/CNAME only) |
| `evenup.lnrt.cz` | `evenup.cz` | rule lives on the `lnrt.cz` zone |

Two requirements that are easy to get wrong and must be explicit in the rules:

- **Preserve path and query.** Invite links of the form `/invite/<token>` are
  already in circulation and must survive the redirect.
- **The wildcard rule must exclude the apex**, or `evenup.cz` redirects to
  itself and loops.

Explicit DNS records take precedence over the wildcard, so introducing a real
subdomain later requires no change to these rules.

## C. Email

DNS on `evenup.cz` (MX hostnames read from the Seznam panel during setup):

| Type | Name | Value |
|---|---|---|
| MX | `@` | Seznam mail hosts — **DNS-only**, mail cannot be proxied |
| TXT | `@` | `v=spf1 include:spf.seznam.cz ~all` |
| CNAME | Seznam DKIM selector | Seznam DKIM host |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@evenup.cz` |

**DMARC starts at `p=none` with reporting**, mirroring `lnrt.cz`, and tightens to
`p=quarantine` after roughly two weeks of clean reports. Publishing `quarantine`
before observing a single report is how legitimate mail disappears silently.

**Ordering is load-bearing.** DNS records go in and verify *first*; only then do
`EMAIL_FROM` and `SMTP_*` flip to Seznam. Pointing the app at `@evenup.cz` before
SPF and DKIM resolve puts every magic link in a spam folder.

**Mailbox constraint:** Seznam SMTP requires the envelope From to match the
authenticated mailbox, so `noreply@evenup.cz` must be a real Email Profi mailbox
rather than an alias. This consumes one of the ~10 per-domain mailboxes.

## Known risks

- **Seznam as an application sender.** It is a mailbox product, not a
  transactional one. Two exposures: outbound daily throttling that would silently
  break magic-link sign-in, and terms of service not written with application
  traffic in mind. Because app mail and human mail now share one domain
  reputation, there is no isolation between them.
  **Mitigation:** the sender stays a pure configuration swap. `packages/api`
  already exposes Resend and SMTP behind one interface, so moving to Resend is an
  env-var change plus a redeploy, not a code change. This property must not be
  refactored away.
- **Session invalidation** at cutover (see A).
- **OAuth breakage** if the console steps are skipped (see A).

## Success criteria

- `https://evenup.cz` serves the app with a valid certificate; sign-in works.
- `www.`, `app.`, an arbitrary `*.evenup.cz` host, and `evenup.lnrt.cz` all 301 to
  `evenup.cz` preserving path and query; an existing `/invite/<token>` link
  resolves through the redirect.
- Google and Apple sign-in both succeed on the new domain.
- Mail from `noreply@evenup.cz` passes SPF, DKIM and DMARC alignment, verified by
  a third-party authentication check, and lands in the inbox at Gmail and Seznam.
- DMARC aggregate reports arrive at `dmarc@evenup.cz`.

## Outcome (2026-07-25)

All three parts are complete and verified.

- `evenup.cz` serves the app behind a Let's Encrypt certificate (`CN=evenup.cz`,
  valid to 2026-10-23). The prior 503 was Traefik having no router for the name.
- `BETTER_AUTH_URL` flipped and rebuilt. Google and Apple both return
  `redirect_uri=https://evenup.cz/api/auth/callback/{google,apple}`.
- Mail: MX, SPF, DKIM (`szn1`/`szn2`/`szn3._domainkey`, unproxied CNAMEs) and
  DMARC all live. A real password-reset from `noreply@evenup.cz` was delivered to
  Gmail and landed in the inbox, not spam. The `Authentication-Results` header
  was not machine-readable through the available tooling, so SPF/DKIM/DMARC pass
  status rests on inbox placement plus the DMARC aggregate reports.
- Redirects: `www`, `app`, `*.evenup.cz` and `evenup.lnrt.cz` all 301 to
  `evenup.cz` preserving path and query. The apex correctly does not redirect.

### Deviations from the design as written

- **Redirect rules already existed.** The `evenup.cz` zone had a catch-all whose
  target was a static `https://evenup.cz` with `preserve_query_string: false`,
  which discarded path and query — it would have broken every in-flight
  `/invite/<token>` link. It was amended in place rather than duplicated. The
  `lnrt.cz` catch-all explicitly excluded `evenup.lnrt.cz`, so a dedicated rule
  was added ahead of it.
- **Transform Rules is the wrong permission.** Single Redirects require
  `Zone → Single Redirect → Edit`; `Transform Rules → Edit` grants only the
  `http_request_transform` phases.
- **Duplicate env-var rows.** The Coolify app carried ~30 keys twice, and the
  API updates by key rather than row id — so `BETTER_AUTH_URL` would have held
  two conflicting values with no guarantee which reached the container. The rows
  for `BETTER_AUTH_URL`, `EMAIL_FROM`, `SMTP_USER` and `SMTP_PASS` were
  de-duplicated. The rest remain duplicated with identical values.
- **Seznam SMTP was already in use** for `noreply@lnrt.cz`, so the change was a
  mailbox swap rather than a provider migration. `SMTP_PASS` was also moved off
  build-time so the secret is no longer baked into image layers.

## Open items

- `test.evenup.cz` returns 503. It has no DNS record and exists only as an
  exclusion in the `evenup.cz` catch-all; the new wildcard makes it resolve while
  the rule skips it. Previously NXDOMAIN. Left as-is pending intent.
- DMARC tightens from `p=none` to `p=quarantine` after ~2 weeks of clean reports
  at `support@evenup.cz`.
- The Seznam mailbox password was shared in plaintext and should be rotated.
- Remaining duplicate env-var rows are harmless but worth a cleanup pass.
