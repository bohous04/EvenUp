# Universal / App Links (invite + reset deep links)

`app.config.ts` declares:

- iOS: `associatedDomains: ['applinks:evenup.cz']`
- Android: an `intentFilter` with `autoVerify` for `https://evenup.cz/invite`

For the OS to open the app on an `https://evenup.cz/invite/<token>` link
(instead of the browser), the domain must serve two well-known files. Until they
exist, links open the web app — which still works; universal links are a
convenience, not a blocker for store submission.

## iOS — apple-app-site-association

Served at `https://evenup.cz/.well-known/apple-app-site-association`
(Content-Type `application/json`, **no** `.json` extension, no redirects).
**Already implemented** in `apps/web`: the locale middleware excludes all of
`/.well-known` (`src/middleware.ts`), a `next.config.mjs` `beforeFiles` rewrite
maps the path onto `src/app/api/wellknown/apple-app-site-association/route.ts`,
and that route composes the payload:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "M7DTH7N466.company.lnrt.evenup",
        "paths": ["/invite/*", "/reset-password*"]
      }
    ]
  }
}
```

`appID` is `<TEAMID>.<BUNDLEID>` composed from `env.apple` (`APPLE_TEAM_ID` /
`APPLE_BUNDLE_ID`; the team id has a hardcoded fallback so local dev still
serves a well-formed file). The route handler — not a `public/.well-known/`
static file — is deliberate: the extensionless name would be served from
`public/` as `application/octet-stream` (mime lookup is by extension), which
Apple rejects, while the handler pins `application/json` and is unit-tested.
Covered end-to-end by `apps/web/e2e/well-known.spec.ts`.

## Android — assetlinks.json

Not yet served (needs the Play app-signing SHA-256, only available after the
first Android upload). Serve at `https://evenup.cz/.well-known/assetlinks.json`
by adding one more `beforeFiles` rewrite + route, mirroring the Apple file:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "company.lnrt.evenup",
      "sha256_cert_fingerprints": ["<SHA256 of the Play app-signing cert>"]
    }
  }
]
```

Get the fingerprint from Play Console → _App integrity → App signing_ after the
first upload, or from EAS: `eas credentials` → Android → the SHA-256.

## Serving from the web app (Next.js)

Add these as static routes in `apps/web` (e.g. under `public/.well-known/` or an
app-router `route.ts`) so Coolify serves them at the domain root. The reset-token
screen (`apps/mobile/app/reset-password.tsx`) and the invite screen
(`apps/mobile/app/invite/[token].tsx`) are already wired to receive the params.
