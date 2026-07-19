# Universal / App Links (invite + reset deep links)

`app.config.ts` declares:
- iOS: `associatedDomains: ['applinks:evenup.lnrt.cz']`
- Android: an `intentFilter` with `autoVerify` for `https://evenup.lnrt.cz/invite`

For the OS to open the app on an `https://evenup.lnrt.cz/invite/<token>` link
(instead of the browser), the domain must serve two well-known files. Until they
exist, links open the web app — which still works; universal links are a
convenience, not a blocker for store submission.

## iOS — apple-app-site-association

Serve at `https://evenup.lnrt.cz/.well-known/apple-app-site-association`
(Content-Type `application/json`, **no** `.json` extension, no redirects):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<TEAMID>.company.lnrt.evenup",
        "paths": ["/invite/*", "/reset-password*"]
      }
    ]
  }
}
```

Replace `<TEAMID>` with your Apple Team ID.

## Android — assetlinks.json

Serve at `https://evenup.lnrt.cz/.well-known/assetlinks.json`:

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

Get the fingerprint from Play Console → *App integrity → App signing* after the
first upload, or from EAS: `eas credentials` → Android → the SHA-256.

## Serving from the web app (Next.js)

Add these as static routes in `apps/web` (e.g. under `public/.well-known/` or an
app-router `route.ts`) so Coolify serves them at the domain root. The reset-token
screen (`apps/mobile/app/reset-password.tsx`) and the invite screen
(`apps/mobile/app/invite/[token].tsx`) are already wired to receive the params.
