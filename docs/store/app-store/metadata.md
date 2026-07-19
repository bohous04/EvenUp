# App Store Connect — listing & review answers

Ready-to-paste copy for the EvenUp iOS listing. Czech is the primary language;
English is provided as a secondary localization.

## App information

| Field | Value |
|---|---|
| **Name** | EvenUp |
| **Subtitle** (CZ) | Rozúčtování výdajů ve skupině |
| **Subtitle** (EN) | Split group expenses fairly |
| **Bundle ID** | company.lnrt.evenup |
| **SKU** | evenup-ios |
| **Primary category** | Finance |
| **Secondary category** | Utilities |
| **Price** | Free |

## Promotional text (≤170 chars)

- **CZ:** Rozdělte společné útraty, naskenujte účtenku a vyrovnejte dluhy jedním QR kódem. Zdarma, bez reklam.
- **EN:** Split shared costs, scan a receipt, and settle up with one QR code. Free, no ads, open source.

## Description

**CZ**
```
EvenUp (dlužníček) je jednoduchá aplikace pro rozúčtování společných výdajů —
na výletě, ve sdíleném bytě nebo na akci.

• Přidejte lidi do skupiny během pár sekund — účet nepotřebují.
• Zadejte výdaj a rozdělte ho rovným dílem, přesnými částkami, podíly, procenty
  nebo po položkách.
• Vyfoťte účtenku a přiřaďte položky lidem klepnutím na barevné iniciály.
• Aplikace spočítá minimální počet plateb, aby se všichni vyrovnali.
• Vygenerujte QR platbu (SPAYD) a zaplaťte jedním skenem v bankovní aplikaci.
• Přepínejte mezi češtinou a angličtinou.

Zdarma. Žádné reklamy, žádné předplatné. Otevřený zdrojový kód.
```

**EN**
```
EvenUp is a clean, fast app for splitting shared group expenses — on a trip, in
a shared flat, or at an event.

• Add people to a group in seconds — no account required for them.
• Record an expense and split it equally, by exact amounts, shares, percentages,
  or per item.
• Photograph a receipt and assign each item to people by tapping colored initials.
• The app computes the minimal set of payments so everyone settles up.
• Generate a Czech QR payment (SPAYD) and pay with one scan in your banking app.
• Switch between Czech and English.

Free. No ads, no subscriptions. Open source.
```

## Keywords (≤100 chars, comma-separated, no spaces)

```
split,expenses,group,bill,receipt,ocr,debt,settle,QR,SPAYD,roommates,trip,dlužníček,rozúčtování
```

## URLs

| Field | Value |
|---|---|
| **Support URL** | https://evenup.lnrt.cz |
| **Marketing URL** | https://evenup.lnrt.cz |
| **Privacy Policy URL** | https://evenup.lnrt.cz/privacy *(publish a page before submitting)* |

## App Privacy (data collection questionnaire)

Answer **"Yes, we collect data"**. Declare only what the app actually stores:

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App Functionality (account) |
| Name | Yes | Yes | No | App Functionality |
| Photos (receipts) | Yes* | Yes | No | App Functionality (OCR) |
| Payment info (IBAN) | Yes | Yes | No | App Functionality (QR payment string) |
| User ID | Yes | Yes | No | App Functionality |

\* Receipt images are sent to OpenRouter for OCR using the **user's own API key**
and are **optionally auto-deleted** after extraction (instance/user setting). No
data is used for tracking; no advertising identifiers; no third-party analytics.
IBAN and the OpenRouter key are **encrypted at rest** (AES-GCM). Set **"Data is
NOT used to track you"** and do not list any Data Used to Track You.

## Age rating

All content questions → **None**. Result: **4+**. Not "kids category".

## Export compliance

Declared in `app.config.ts` as `ITSAppUsesNonExemptEncryption = false` (standard
HTTPS/TLS only). No CCATS or year-end self-classification report needed.

## Review notes (paste into "Notes")

```
EvenUp never moves money — it only records who owes whom and generates a Czech
SPAYD QR string the user pays in their own bank app (see FR-7 / risk R4).

Receipt OCR uses the user's own OpenRouter API key (Settings → OpenRouter API
key). To exercise OCR without a key, skip the scan and use "Add item" to enter
items manually — manual entry is always available.

Sign in with Apple is supported. Demo account: <fill in email + password>.
```
