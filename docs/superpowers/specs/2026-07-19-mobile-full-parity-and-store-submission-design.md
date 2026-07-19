# Mobile full parity + store submission — Design

> **Status:** Draft for review — 2026-07-19
> **Scope:** PRD Phase 3. Bring `apps/mobile` (Expo / React Native) to **full feature parity**
> with `apps/web`, and produce a complete **App Store + Google Play submission package**.
> **Platforms:** iOS **and** Android. **Apple state:** Developer account exists, no App Store
> Connect app record yet — code/metadata/assets are prepped; the account/app-record steps are
> documented for the user to perform.

---

## 1. Goal & context

The web app (`apps/web`, Next.js) is feature-complete. The mobile app (`apps/mobile`, Expo) is a
thin skeleton: 7 screens (~1,000 LOC) covering auth, a groups list, a minimal group screen
(equal-split-only expense, cash mark-paid), and a receipt scan screen that produces a `receiptId`
but has **no UI to consume it**. The iOS native project and EAS config exist but with placeholder
store IDs and a placeholder icon.

"Cloning the web app" is almost entirely **presentation work**: new RN screens that call
**already-existing** tRPC procedures. The three shared packages guarantee correctness parity:

- `@evenup/core` — pure money math (splits, debt minimization, SPAYD, FX) in integer minor units.
- `@evenup/api` — the tRPC `AppRouter` type + server logic (14 routers, ~60 procedures).
- `@evenup/i18n` — shared, typed CZ/EN catalog (~394 flat dotted keys). CZ is default. Most keys
  the mobile screens need **already exist** (they were built for web).

### 1.1 tRPC surface the mobile app must reach

| Router | Procedures | Mobile today |
|---|---|---|
| `group` | create, list, get, update, archive | list, create, get |
| `member` | add, list, update, remove, setBankDetail | add |
| `transaction` | createExpense, recordTransfer, updateExpense, updateTransfer, list, setRecurrence, materializeDue, importCsv, delete | createExpense, recordTransfer |
| `balance` | get, memberBreakdown, nextPayer | get |
| `settlement` | generateSpayd | — |
| `invite` | create, preview, claim | — |
| `user` | me, getBankAccount, updateSettings, updateProfile, setAvatar, clearAvatar, setBankAccount, clearBankAccount, setOpenRouterKey, clearOpenRouterKey, exportData, deleteAccount | — |
| `ocr` | scan | scan |
| `fx` | resolve, latest, setManual | — |
| `stats` | byCategory | — |
| `activity` | list | — |
| `admin` | listUsers, setVip, setAdmin, setDisabled, deleteUser, getInstanceConfig, setInstanceOpenRouterKey, clearInstanceOpenRouterKey, setInstanceOcrModel, listErrors | — |
| `category` | list, create, update, remove | — |
| `notification` | getSettings, setEnabled, getGroupMute, setGroupMute | — |

Almost every gap is a screen, not an endpoint.

---

## 2. Architecture

No architectural change. The Expo app remains a thin client over tRPC + Better Auth (Expo client,
tokens in `SecureStore`), reusing `@evenup/core` and `@evenup/i18n`.

**What gets added at the app layer:**

1. **UI kit** (`src/ui/`) — a small set of RN primitives so screens stop inlining `StyleSheet`.
   `Screen`, `Button`, `Card`, `Input`, `AmountInput`, `Chip`, `SegmentedControl`, `ListItem`,
   `BottomSheet`, `Field`/`Label`. Mirrors the web `components/ui.tsx` API where practical.
2. **Theming** — extend `theme.ts` into light/dark token sets driven by `useColorScheme()`
   (`app.config.ts` already sets `userInterfaceStyle: 'automatic'`).
3. **Locale** — persist `setLocale` to `SecureStore`; detect the device locale on first launch
   (`expo-localization`), falling back to CZ. (Currently in-memory only.)
4. **Navigation** — replace the flat `Stack` with an expo-router **tab layout**: Groups / Activity
   / Settings; add-expense and scan as modal routes. Deep links: `evenup://invite/[token]`
   (claim), plus the existing OAuth callback scheme.

### 2.1 Isolation & file boundaries

Each screen stays small and focused; shared logic (split-editor state, chip-assignment reducer,
FX resolution) lives in `src/lib/` as pure, testable modules mirroring the web `lib/` helpers
(`assign-all`, `expand-items`, `move-item`, `amount-input`, `receipt-page`) — reuse those from
`@evenup/core`/web where they are already platform-agnostic; port the rest.

---

## 3. Epic decomposition

Full parity is too large for one implementation plan. It is split into epics, each getting its own
`writing-plans` plan → implement → verify cycle. **E0 blocks E1–E7.** E8 (store prep) can start its
non-screenshot parts early but its screenshots depend on finished screens.

### E0 — Foundation
UI kit, light/dark theming, locale persistence + device detection, tab navigation shell, deep-link
routing. **Acceptance:** existing screens re-skinned onto the kit with no behavior regression; tabs
render; dark mode legible; locale survives relaunch; `evenup://invite/<token>` opens a claim route.

### E1 — Auth parity
Sign-up with Google + Apple; email-verification pending screen; reset-password screen; invite
deep-link claim (`invite.preview`/`invite.claim`) letting a signed-in user claim a virtual member.
**Acceptance:** a new user can sign up (email/Google/Apple), verify, reset password, and claim an
invited member end-to-end.

### E2 — Groups & members
Group detail as tabs (Balances / Expenses / Members / Activity). Member CRUD: add with color +
default share + role; edit; deactivate/remove; bank IBAN (`member.setBankDetail`). Group settings
(rename, base currency, simplify-debts toggle, archive/restore). Invite create + native share sheet.
**Acceptance:** full member lifecycle and group settings match web; invite link shareable.

### E3 — Expenses (largest)
Full add/edit expense form: all 5 split types (equal / exact / shares / percentage / itemized),
multi-payer with per-payer amounts (validated to sum to total), category picker, date, currency +
FX override/lock (`fx.resolve`/`fx.setManual`), note, receipt attach. Transaction list with
edit/delete; recurrence (`setRecurrence`); income + transfer entry. **Acceptance:** every split type
computes shares identically to web (same `@evenup/core`), payer-sum validation enforced, edit/delete
logged.

### E4 — OCR itemized chip-assignment
Consume `ocr.scan` into an itemized editor: each item shown with colored member chips; tap toggles
who shares it; edit/merge/split/delete items; allocate tax/tip proportionally or to members;
reconcile `sum(items)` vs total; save as itemized expense. Receipt viewer + multi-page import.
On-device Apple Vision path already spiked. **Acceptance:** scan → assign via chips → save produces a
correct itemized expense; manual fallback always available (FR-5.6).

### E5 — Settlements
SPAYD QR rendering (`settlement.generateSpayd` → `react-native-qrcode-svg` + `react-native-svg`);
settle sheet with method cash/bank/qr; edit-transfer sheet; next-round card (`balance.nextPayer`);
member breakdown sheet (`balance.memberBreakdown`). **Acceptance:** QR scans in a CZ banking app for
a creditor with an IBAN; cash/manual settle always available (FR-7.4); balances update immediately.

### E6 — Settings & account
Profile (name/avatar), locale switch (persisted), security 2FA/TOTP (Better Auth `twoFactor`),
connected accounts (Apple/Google link), BYO OpenRouter key, bank account (IBAN), notification prefs,
GDPR export/delete. Plus category manager, spend stats (`stats.byCategory`), CSV import
(`transaction.importCsv`), and the admin dashboard (`admin.*`, gated to admins). **Acceptance:**
every settings surface on web has a working mobile equivalent.

### E7 — Push notifications
Register the Expo push token on sign-in, persist server-side, deliver foreground/background, tap →
deep-link to the relevant group/transaction, honor per-group mute + global opt-out. **Acceptance:**
an expense affecting you / a settlement request / a debt reminder pushes and deep-links; mute works.

### E8 — Store submission prep (both platforms)
- **Assets:** branded 1024px app icon, Android adaptive icon, splash — replace the single
  placeholder PNG. (Generated, brand blue `#2563eb`.)
- **Config:** `app.config.ts` — version/buildNumber source, permission usage strings (already
  present), `ios.infoPlist.ITSAppUsesNonExemptEncryption=false` (standard HTTPS only → export-
  compliance exempt), associated domains for universal links, config plugins audit.
- **App Store Connect** (`docs/store/app-store/`): metadata copy (name, subtitle, promotional text,
  description, keywords, support + marketing + privacy-policy URLs), primary/secondary category
  (Finance / Utilities), screenshots for 6.7"/6.5"/5.5" iPhone + 12.9" iPad, App Privacy
  questionnaire answers, `PrivacyInfo.xcprivacy` review, age rating answers, Sign in with Apple
  (already), export compliance, `eas.json` submit block with `ascAppId` placeholder + exact steps.
- **Google Play** (`docs/store/play/`): title, short + full description, screenshots, feature
  graphic, content-rating (IARC) questionnaire answers, **Data Safety** form answers, target API
  level note, privacy-policy URL, internal-testing track via `eas submit`.
- **`docs/store/SUBMISSION.md`:** a single checklist covering exactly what the user must do
  (create the ASC app record, generate an App Store Connect API key, create the Play app, run
  `eas build` + `eas submit`), with everything else pre-filled.

**Acceptance:** a reader can go from "account, no app record" to "Submitted for Review" on both
stores by following `SUBMISSION.md`; no code placeholders remain except the store IDs that only
exist after the user creates the records.

### Cross-cutting — tests, a11y, dark mode
Per epic: React Native Testing Library component tests (forms, chip assignment, split editors,
amount input), expanded Maestro critical-flow E2E, a11y labels + "color-not-alone" chips (initials
+ label), dark-mode verification. Matches the PRD Definition of Done (§10.3).

---

## 4. Dependencies to add (mobile)

- `expo-localization` — device locale detection.
- `react-native-svg` + `react-native-qrcode-svg` — SPAYD QR rendering (E5).
- `@better-auth/expo` twoFactor client wiring (E6) — Better Auth already present.
- (Sheets) prefer a light in-house `BottomSheet` over a heavy gesture lib unless a real need
  emerges; revisit in E0.

All added via `expo install` to keep native versions aligned; icon/splash via config, no extra runtime deps.

---

## 5. Testing strategy (per PRD §10)

- Reuse `@evenup/core` unit tests (already ≥95%); no money math is re-implemented on mobile.
- Component tests (RN Testing Library) for the chip-assignment reducer, split editors, amount input.
- Maestro E2E: extend `.maestro/critical-flow.yaml` to cover create group → add members → add
  expense (each split type, mocked) → OCR chip assign (mocked) → balances → SPAYD/mark-settled →
  language switch.
- No live OpenRouter/FX in CI — mocked, matching the web suite.

---

## 6. Sequencing & delivery

E0 → (E1, E2 in parallel) → E3 → E4 → E5 → E6 → E7, with E8 asset/config/copy work started early
and screenshots captured once screens are final. Each epic is independently shippable behind the
same app and leaves `main` green (typecheck + lint + tests) before the next begins.

## 7. Non-goals (this round)

- Real-time sync / offline write-sync (PRD defers; optimistic + refetch only).
- Actually running `eas build`/`eas submit` (requires the user's Apple/Play credentials) — prepared
  and documented, not executed.
- Any change to web or backend behavior beyond additive fixes needed for a mobile client.
