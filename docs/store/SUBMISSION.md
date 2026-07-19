# EvenUp — App Store & Google Play submission checklist

This is the end-to-end runbook to take the Expo app from source to **Submitted for
Review** on both stores. Everything that can be prepared in the repo already is
(config, metadata copy, privacy answers); the steps below are the account/portal
actions only you can perform, plus the two build+submit commands.

> **State assumed:** Apple Developer Program membership **exists**; the App Store
> Connect app **record does not exist yet**. Google Play Console account status is
> unknown — steps included for creating the app there too.

---

## 0. One-time prerequisites

- [ ] Install the EAS CLI: `npm i -g eas-cli` and `eas login`.
- [ ] Confirm the bundle/package id in `apps/mobile/app.config.ts`:
      **`company.lnrt.evenup`** (iOS `bundleIdentifier` + Android `package`).
- [ ] Create an EAS project and copy its id into `EAS_PROJECT_ID`
      (`eas init` from `apps/mobile/`), or set `extra.eas.projectId` directly.
- [ ] Set the production API URL for release builds:
      `EXPO_PUBLIC_API_URL=https://evenup.lnrt.cz` (see §4).

## 1. Branded assets (done in repo)

- [x] App icon `apps/mobile/assets/icon.png` (1024×1024, no alpha for iOS).
- [x] Android adaptive icon foreground + `#2563eb` background (in `app.config.ts`).
- [x] Splash uses the icon on the brand-blue background.
> If you replace the icon, keep it 1024×1024 PNG, square, no transparency (Apple
> rejects alpha in the marketing icon).

## 2. Apple — create the App Store Connect record

1. [ ] appstoreconnect.apple.com → **My Apps → + → New App**.
2. [ ] Platform **iOS**, Name **EvenUp**, Primary language **Czech**,
       Bundle ID **company.lnrt.evenup**, SKU `evenup-ios`.
3. [ ] Copy the **Apple ID (ascAppId)** shown on the app's App Information page.
4. [ ] Fill the listing from [`app-store/metadata.md`](./app-store/metadata.md)
       (name, subtitle, description, keywords, promotional text, URLs, category).
5. [ ] Answer **App Privacy** using [`app-store/metadata.md` §Privacy](./app-store/metadata.md).
6. [ ] Set **Age rating** answers (all "None" → **4+**), see the same file.
7. [ ] Export compliance is pre-answered in `app.config.ts`
       (`ITSAppUsesNonExemptEncryption=false`) — no per-build prompt.
8. [ ] **Sign in with Apple** is already enabled (`usesAppleSignIn`), which
       satisfies Apple's "must offer Apple sign-in when you offer other social
       logins" guideline.

## 3. Google Play — create the app

1. [ ] play.google.com/console → **Create app**. Name **EvenUp**, default
       language **Czech**, App, Free.
2. [ ] Fill **Main store listing** from [`play/metadata.md`](./play/metadata.md).
3. [ ] Complete **Data safety** from [`play/metadata.md` §Data safety](./play/metadata.md).
4. [ ] Complete **Content rating** (IARC questionnaire answers in the same file → **Everyone**).
5. [ ] Set **App category** = Finance, add the privacy-policy URL.
6. [ ] Create an **Internal testing** track (add your tester emails).

## 4. Configure EAS submit

`apps/mobile/eas.json` already has a `submit.production` block. Fill in:

- [ ] iOS: `appleId` = your Apple ID email; `ascAppId` = the id from §2.3;
      `appleTeamId` = your 10-char Team ID (developer.apple.com → Membership).
      Prefer an **App Store Connect API key** (`ascApiKeyPath`/`-Id`/`-IssuerId`)
      for non-interactive CI submits.
- [ ] Android: create a Google Play **service account** JSON with the
      *Release manager* role, save it outside the repo, and point
      `serviceAccountKeyPath` at it (or pass `--service-account-key-path`).

## 5. Build

From `apps/mobile/`:

```bash
# iOS (App Store distribution)
EXPO_PUBLIC_API_URL=https://evenup.lnrt.cz eas build --platform ios --profile production

# Android (AAB for Play)
EXPO_PUBLIC_API_URL=https://evenup.lnrt.cz eas build --platform android --profile production
```

EAS handles iOS signing (creates the distribution cert + provisioning profile on
first run) and Android app signing (managed keystore).

## 6. Submit

```bash
eas submit --platform ios --profile production      # → TestFlight, then promote to review
eas submit --platform android --profile production  # → Play internal testing track
```

## 7. Final review gates (manual, in the portals)

- [ ] iOS: attach at least one screenshot per required device size (see
      [`screenshots.md`](./screenshots.md)); add the demo account note (below);
      then **Add for Review → Submit**.
- [ ] Android: upload the AAB to the track, complete the **release**, roll out to
      internal testing, then promote toward production when ready.

### Reviewer demo account (both stores)

Reviewers can't create virtual members without an account. Provide a seeded
login in the review notes:
- Email: `review@evenup.lnrt.cz` · Password: *(set one and record it here)*
- Or note: "Tap Sign up → any email; email verification is required — use the
  magic link, or set `AUTH_DEV_ECHO` on a staging instance for the reviewer."

## 8. Nice-to-haves not blocking submission

- Universal links need an **apple-app-site-association** file served at
  `https://evenup.lnrt.cz/.well-known/apple-app-site-association` and an Android
  **assetlinks.json** — see [`universal-links.md`](./universal-links.md).
- Push delivery needs a backend endpoint to store the Expo token + an Expo push
  sender (the web app is email-only today) — the client half is already wired.
