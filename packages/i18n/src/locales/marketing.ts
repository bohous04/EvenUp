/**
 * Marketing copy for the public landing page — a **separate namespace** from
 * the app catalogs (`cs.ts` / `en.ts`) on purpose: this text is long-form
 * marketing prose that only `app/[locale]/(marketing)` ever renders, and
 * folding it into the app catalogs would grow every page's message payload
 * for copy the app itself never shows.
 *
 * Czech is the original, not a translation: the product is Czech-first
 * (`app.name` is literally `dlužníček` in `cs.ts`), so `marketingCs` is
 * written as native copy and `marketingEn` is its English counterpart, each
 * naming the product the way that locale does.
 *
 * Two conventions the Czech copy holds to, because a native reviewer found
 * both broken here:
 *
 * - **One word per concept.** *platba* for what a person sends (never *převod*
 *   unless a literal bank transfer is meant), *útrata* for what the group
 *   spends (*výdaj* is reserved for the in-app object name), *sken* for what
 *   is metered and paid for.
 * - **Czech typography.** A spaced en dash `–` (ČSN 01 6910), never the
 *   English em dash `—`, and no bureaucratic register: the brand is a
 *   diminutive, so „k pozdějšímu nahlédnutí" fights its own name.
 *
 * The same compile-time key-parity guarantee as the app catalogs: `marketingEn`
 * is typed `MarketingMessages`, so a missing or extra key is a type error.
 *
 * The four legal documents (terms, privacy, withdrawal, contact) are part of
 * this same namespace but live in `legal.ts` and are spread in below. They are
 * several times the length of everything here, they change for entirely
 * different reasons — a legal review, a new processor, a changed retention
 * period — and nobody reviewing a privacy policy should have to scroll through
 * hero variants to reach it. Splitting the file changes nothing for callers:
 * one `tMarketing`, one `MarketingKey`, and the same parity guarantee, which
 * now applies to each half independently as well as to the whole.
 */
import { legalCs, legalEn } from './legal.js';

const marketingOnlyCs = {
  'marketing.meta.title': 'dlužníček – vyrovnejte se pár platbami',
  'marketing.meta.description':
    'Zapište, kdo co zaplatil, a dlužníček spočítá nejmenší počet plateb, kterými se celá skupina vyrovná. Účtenky z fotky, QR platba, více měn, členové i bez účtu.',
  // Alt text for the social-share image (`opengraph-image.png` /
  // `twitter-image.png`), per locale — the file convention's own
  // `opengraph-image.alt.txt` is English-only, so the Czech landing page needs
  // its own description rather than inheriting that one.
  'marketing.meta.ogImageAlt':
    'dlužníček – open source dělení útraty ve skupině, spočítá nejmenší počet plateb, kterými se všichni vyrovnají.',

  'marketing.nav.features': 'Funkce',
  'marketing.nav.pricing': 'Ceník',
  'marketing.nav.faq': 'Časté otázky',

  'marketing.hero.title': 'Místo osmi plateb pošlete dvě',
  'marketing.hero.subtitle':
    'Chata, dovolená, spolubydlení. Zapíšete, kdo co zaplatil, a dlužníček spočítá, kdo má komu kolik poslat, aby byli všichni vyrovnaní.',
  'marketing.hero.ctaPrimary': 'Začít zdarma',
  'marketing.hero.ctaSignIn': 'Přihlásit se',
  'marketing.hero.ctaApp': 'Přejít do aplikace',

  'marketing.features.title': 'Proč dlužníček?',
  'marketing.feature.debts.title': 'Co nejméně plateb',
  'marketing.feature.debts.body':
    'Když si sedm lidí dluží navzájem, nemusí posílat dvacet plateb. Dlužníček dluhy proti sobě vyruší a najde nejmenší počet plateb, které je vynulují – obvykle stačí pár.',
  'marketing.feature.ocr.title': 'Účtenka z fotky',
  'marketing.feature.ocr.body':
    'Vyfoťte účtenku a položky se přepíšou samy, včetně cen. Zbývá jen naklikat, kdo si co dal – a dělit se dá i po položkách, ne jen rovným dílem.',
  'marketing.feature.qr.title': 'QR platba rovnou v bankovní aplikaci',
  'marketing.feature.qr.body':
    'Ke každé navržené platbě patří QR kód podle českého standardu QR Platba. Stačí ho načíst v bankovní aplikaci – číslo účtu, částka i zpráva pro příjemce jsou předvyplněné.',
  'marketing.feature.currency.title': 'Více měn v jedné skupině',
  'marketing.feature.currency.body':
    'Zaplaťte v eurech, zapište v korunách. Kurz doplníme podle data výdaje. Skupina má jednu hlavní měnu, ve které vidíte konečný výsledek.',
  'marketing.feature.guests.title': 'Účet nepotřebují všichni',
  'marketing.feature.guests.body':
    'Kvůli jedné chatě si účet nikdo zakládat nechce. Člena přidáte jenom jménem a hned se s ním můžete dělit o útratu; když se zaregistruje později, jen ho spárujete s jeho účtem.',

  'marketing.pricing.title': 'Ceník',
  'marketing.pricing.subtitle':
    'Dělení útraty je zdarma a bez limitu. Platí se jen za skenování účtenek.',
  'marketing.pricing.free.title': 'Základní',
  'marketing.pricing.free.price': 'Zdarma',
  'marketing.pricing.free.body':
    'Neomezené skupiny, útraty, vyrovnání i QR platby. Bez reklam. Zdarma napořád, ne jen na zkoušku.',
  'marketing.pricing.vip.title': 'VIP',
  'marketing.pricing.vip.period': 'měsíčně',
  // `{scans}` is `VIP_SCANS_PER_PERIOD` — the constant that actually gates a
  // scan — so the advertised allowance cannot drift from the enforced one. Its
  // genitive plural („150 skenů") is right for every value the product
  // currently uses, but not for every possible one: it breaks for a value
  // whose final digit is 2, 3 or 4 (excluding 12–14) — a
  // `VIP_SCANS_PER_PERIOD` of 122 would render „122 skenů" where Czech needs
  // „122 skeny". If the constant ever moves to such a value, this string has
  // to become a `plural()` call rather than a template.
  //
  // `{days}` is the configured receipt retention (`config/retention.ts`), the
  // same number the terms and the privacy policy quote. Without it the price
  // list advertised storage with no end date while the cleanup job deleted the
  // photos on schedule. Phrased „po {days} dnech" (locative) rather than
  // „{days} dnů" (genitive) for the reason set out beside
  // `legal.privacy.s7.li1`: the retention is configurable, so 2, 3 and 4 are
  // real values and „2 dnů" is wrong.
  'marketing.pricing.vip.body':
    '{scans} skenů účtenek měsíčně. Fotky zůstanou uložené a po {days} dnech od naskenování je smažeme. Zrušíte kdykoli.',
  'marketing.pricing.packs.title': 'Balíčky skenů',
  'marketing.pricing.packs.body':
    'Skenujete jen občas? Kupte si balíček bez předplatného. Skeny nevyprší.',
  // 2, 5 and 10 — every pack size takes the Czech genitive plural after
  // "balíček", so one template covers all three ("balíček 2 skenů"). A pack of
  // *one* would read „Balíček 1 skenů"; if `PACK_SIZES` ever gains a 1, this
  // string has to become a `plural()` call rather than a template.
  'marketing.pricing.packs.item': 'Balíček {scans} skenů',
  'marketing.pricing.note': 'Platby zpracovává Stripe. Předplatné zrušíte kdykoli v aplikaci.',
  'marketing.pricing.cta': 'Vyzkoušet zdarma',
  // The price list's second CTA, pointing at `/vip` — the only route to
  // checkout in the whole product. Until it existed nothing linked there and a
  // customer had to type the address to pay.
  'marketing.pricing.ctaVip': 'Předplatit VIP',

  'marketing.faq.title': 'Časté otázky',
  'marketing.faq.q1': 'Je dlužníček zdarma?',
  'marketing.faq.a1':
    'Dělení útraty, vyrovnání i QR platby jsou zdarma a bez limitu. Platí se jen za skenování účtenek – buď měsíčním VIP, nebo jednorázovým balíčkem skenů.',
  'marketing.faq.q2': 'Musí si všichni ve skupině založit účet?',
  'marketing.faq.a2':
    'Nemusí. Členy přidáte jenom jménem a hned se s nimi můžete dělit o útratu. Účet potřebuje jen ten, kdo si chce skupinu sám otevřít.',
  'marketing.faq.q3': 'Jak funguje QR platba?',
  'marketing.faq.a3':
    'U každé navržené platby najdete QR kód podle českého standardu QR Platba. Číslo účtu, částka i zpráva pro příjemce jsou v něm předvyplněné, takže v bankovní aplikaci stačí platbu potvrdit.',
  'marketing.faq.q4': 'Můžu si dlužníčka rozjet na vlastním serveru?',
  'marketing.faq.a4':
    'Ano, dlužníček je open source. Bez napojení na Stripe se placené funkce prostě nenabízejí a zbytek aplikace funguje dál.',

  'marketing.cta.title': 'Příště se vyrovnáte dvěma platbami',
  'marketing.cta.body': 'Založte skupinu, přidejte lidi a zapište první útratu. Zabere to minutu.',
  'marketing.cta.button': 'Založit skupinu',

  'marketing.footer.tagline': 'Dělení útraty ve skupině. Open source.',
  'marketing.footer.source': 'Zdrojový kód',
} as const;

/** Marketing copy and the legal documents, as one public-pages namespace. */
export const marketingCs = { ...marketingOnlyCs, ...legalCs } as const;

export type MarketingKey = keyof typeof marketingCs;
/** Every locale must provide exactly these keys, each mapping to a string. */
export type MarketingMessages = Record<MarketingKey, string>;

/**
 * Typed against the Czech marketing half only — `legalEn` carries its own
 * parity guarantee against `legalCs` — so a key missing from either half is
 * still a compile error, and the error points at the file that is missing it.
 */
const marketingOnlyEn: Record<keyof typeof marketingOnlyCs, string> = {
  'marketing.meta.title': 'EvenUp — settle up in a couple of payments',
  'marketing.meta.description':
    'Log who paid for what and EvenUp works out the smallest number of payments that clears the whole group. Receipts from a photo, Czech QR payments, several currencies, members without accounts.',
  'marketing.meta.ogImageAlt':
    "EvenUp — open-source group expense splitter that settles everyone's debts in the fewest payments.",

  'marketing.nav.features': 'Features',
  'marketing.nav.pricing': 'Pricing',
  'marketing.nav.faq': 'FAQ',

  'marketing.hero.title': 'Send two payments instead of eight',
  'marketing.hero.subtitle':
    'A cabin weekend, a holiday, a flatshare. Log who paid for what and EvenUp works out who owes whom how much, so everyone ends up square.',
  'marketing.hero.ctaPrimary': 'Start for free',
  'marketing.hero.ctaSignIn': 'Sign in',
  'marketing.hero.ctaApp': 'Open the app',

  'marketing.features.title': 'Why EvenUp?',
  'marketing.feature.debts.title': 'The fewest payments possible',
  'marketing.feature.debts.body':
    'When seven people owe each other, nobody needs to send twenty payments. EvenUp nets the debts against each other and finds the smallest number of payments that clears them — usually just a couple.',
  'marketing.feature.ocr.title': 'Receipts from a photo',
  'marketing.feature.ocr.body':
    'Photograph a receipt and the line items are transcribed for you, prices included. All that is left is tapping who had what — you can split item by item, not only down the middle.',
  'marketing.feature.qr.title': 'QR payments straight in your banking app',
  'marketing.feature.qr.body':
    'Every proposed payment comes with a code in the Czech QR Platba standard. Just scan it in your banking app — the account number, amount and payment message are already filled in.',
  'marketing.feature.currency.title': 'Several currencies in one group',
  'marketing.feature.currency.body':
    'Pay in euros, record in korunas. We fill in the rate for the date of the expense, and the group has one main currency that you see the final result in.',
  'marketing.feature.guests.title': 'Not everyone needs an account',
  'marketing.feature.guests.body':
    'Nobody signs up for one weekend away. Just add a member by name and split with them straight away; if they register later, you link the name to their account.',

  'marketing.pricing.title': 'Pricing',
  'marketing.pricing.subtitle':
    'Splitting is free and unlimited. You only pay for scanning receipts.',
  'marketing.pricing.free.title': 'Core',
  'marketing.pricing.free.price': 'Free',
  'marketing.pricing.free.body':
    'Unlimited groups, expenses, settlements and QR payments. No ads. Free for good, not just for a trial.',
  'marketing.pricing.vip.title': 'VIP',
  'marketing.pricing.vip.period': 'per month',
  'marketing.pricing.vip.body':
    '{scans} receipt scans a month. The photos stay saved, and {days} days after the scan we delete them. Cancel any time.',
  'marketing.pricing.packs.title': 'Scan packs',
  'marketing.pricing.packs.body':
    'Only scan now and then? Buy a pack instead of subscribing. Scans do not expire.',
  'marketing.pricing.packs.item': 'Pack of {scans} scans',
  'marketing.pricing.note':
    'Payments are handled by Stripe. Cancel your subscription any time in the app.',
  'marketing.pricing.cta': 'Try it free',
  'marketing.pricing.ctaVip': 'Subscribe to VIP',

  'marketing.faq.title': 'Frequently asked questions',
  'marketing.faq.q1': 'Is EvenUp free?',
  'marketing.faq.a1':
    'Splitting, settling and QR payments are free and unlimited. You only pay for scanning receipts — either with a monthly VIP subscription or a one-off pack of scans.',
  'marketing.faq.q2': 'Does everyone in the group need an account?',
  'marketing.faq.a2':
    'No. Just add members by name and split with them straight away. An account is only needed by someone who wants to open the group themselves.',
  'marketing.faq.q3': 'How does the QR payment work?',
  'marketing.faq.a3':
    'Every proposed payment carries a code in the Czech QR Platba standard. The account number, amount and payment message are pre-filled, so in your banking app you only confirm the payment.',
  'marketing.faq.q4': 'Can I run it on my own server?',
  'marketing.faq.a4':
    'Yes, EvenUp is open source. Without a Stripe connection the paid features are simply never offered and the rest of the app keeps working.',

  'marketing.cta.title': 'Next time, two payments and you are done',
  'marketing.cta.body':
    'Create a group, add the people, log the first expense. It takes about a minute.',
  'marketing.cta.button': 'Create a group',

  'marketing.footer.tagline': 'Group expense splitting. Open source.',
  'marketing.footer.source': 'Source code',
};

export const marketingEn: MarketingMessages = { ...marketingOnlyEn, ...legalEn };
