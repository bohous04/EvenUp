# Google Play Console — listing & form answers

Ready-to-paste copy and questionnaire answers for the EvenUp Android listing.

## Store listing

| Field | Value |
|---|---|
| **App name** | EvenUp |
| **Short description** (≤80) | Split group expenses, scan receipts, settle up with a QR code. Free, no ads. |
| **Category** | Finance |
| **Tags** | Expenses, Budgeting |
| **Email** | misalenert@gmail.com |
| **Website** | https://evenup.lnrt.cz |
| **Privacy Policy** | https://evenup.lnrt.cz/privacy |

## Full description (≤4000 chars)

```
EvenUp (dlužníček) splits shared group expenses — on a trip, in a shared flat, or
at an event — and always shows the minimal set of payments needed to settle up.

• Add people to a group in seconds; no account required for participants.
• Split equally, by exact amounts, shares, percentages, or per item.
• Scan a receipt and assign each item to people by tapping colored initials.
• Generate a Czech QR payment (SPAYD) and pay with one scan in your bank app.
• Record settlements in cash, by bank transfer, or via QR.
• Czech and English, with locale-aware number and currency formatting.

EvenUp never moves money — it records who owes whom and builds a payment QR you
pay yourself. Free, no ads, no subscriptions, open source.
```

## Data safety form

- **Does your app collect or share user data?** Yes (collect), **No sharing**
  with third parties for their own use. (Receipt images go to OpenRouter as a
  *service provider* using the user's own key — declare as processing, not
  third-party sharing.)
- **Is all data encrypted in transit?** Yes (HTTPS/TLS).
- **Can users request deletion?** Yes (Settings → Delete account).

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Email address | Yes | No | No | Account management |
| Name | Yes | No | Yes | App functionality |
| Photos (receipts) | Yes | No | Yes | App functionality (OCR) |
| Financial info (IBAN) | Yes | No | Yes | App functionality (QR payment) |
| App activity (expenses) | Yes | No | No | App functionality |

No advertising or analytics SDKs. No location, contacts, or device identifiers
collected. IBAN and API keys encrypted at rest.

## Content rating (IARC questionnaire)

Category **Utility, Productivity, Communication, or Other**. Answer **No** to all
violence / sexual / language / controlled-substance / gambling questions →
rating **Everyone / PEGI 3**.

## Target audience & content

- Target age group: **18+** (a finance/expenses tool; avoids the "designed for
  families" program and its extra requirements).
- Ads: **No**.
- Contains a login: **Yes** — provide the reviewer demo account (see SUBMISSION.md §7).

## App content declarations

- **Government app:** No. **Financial features:** it is a personal-finance/expense
  tracker that **does not** provide banking, lending, or money transmission — it
  generates a payment QR the user pays in their own bank app. Declare accordingly
  if the "Financial features" section appears.
- **Data deletion URL / in-app path:** Settings → Delete account (GDPR export +
  delete are both in-app).
