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
 * The same compile-time key-parity guarantee as the app catalogs: `marketingEn`
 * is typed `MarketingMessages`, so a missing or extra key is a type error.
 */
export const marketingCs = {
  'marketing.meta.title': 'dlužníček — vyrovnejte se na co nejmíň převodů',
  'marketing.meta.description':
    'Zapište, kdo co zaplatil, a dlužníček spočítá nejmenší počet plateb, kterými se celá skupina vyrovná. Účtenky z fotky, QR platba, víc měn, členové i bez účtu.',

  'marketing.nav.features': 'Funkce',
  'marketing.nav.pricing': 'Ceník',
  'marketing.nav.faq': 'Časté otázky',

  'marketing.hero.title': 'Vyrovnejte se na co nejmíň převodů',
  'marketing.hero.subtitle':
    'Chata, dovolená, spolubydlící. Zapíšete, kdo co zaplatil, a dlužníček dluhy propojí a navrhne nejkratší cestu, jak je vynulovat. Místo osmi plateb pošlete dvě.',
  'marketing.hero.ctaPrimary': 'Začít zdarma',
  'marketing.hero.ctaSignIn': 'Přihlásit se',
  'marketing.hero.ctaApp': 'Přejít do aplikace',

  'marketing.features.title': 'Proč dlužníček',
  'marketing.feature.debts.title': 'Vyrovnání na minimum převodů',
  'marketing.feature.debts.body':
    'Když si sedm lidí dluží navzájem, nemusí posílat dvacet plateb. Dlužníček dluhy sečte proti sobě a navrhne nejkratší sadu převodů, která je vynuluje — obvykle jen pár plateb.',
  'marketing.feature.ocr.title': 'Účtenka z fotky',
  'marketing.feature.ocr.body':
    'Vyfoťte účtenku a položky se přepíšou samy, včetně cen. Zbývá jen naklikat, kdo si co dal — a dělit se dá i po položkách, ne jen rovným dílem.',
  'marketing.feature.qr.title': 'QR platba do banky',
  'marketing.feature.qr.body':
    'Ke každému navrženému převodu patří QR kód podle českého standardu QR Platba. Protistrana ho načte v bankovní aplikaci a má předvyplněný účet, částku i zprávu pro příjemce.',
  'marketing.feature.currency.title': 'Víc měn v jedné skupině',
  'marketing.feature.currency.body':
    'Zaplaťte v eurech, zapište v korunách. Kurz se stáhne k datu výdaje a skupina si drží jednu základní měnu, ve které všechno sedí.',
  'marketing.feature.guests.title': 'Lidi i bez účtu',
  'marketing.feature.guests.body':
    'Kvůli jedné chatě si účet nikdo zakládat nechce. Člena přidáte jménem a dělíte s ním hned; když se zaregistruje později, jen ho propojíte.',

  'marketing.pricing.title': 'Ceník',
  'marketing.pricing.subtitle':
    'Dělení útraty je zdarma a bez limitu. Platí se jen za čtení účtenek.',
  'marketing.pricing.free.title': 'Základ',
  'marketing.pricing.free.price': 'Zdarma',
  'marketing.pricing.free.body':
    'Neomezené skupiny, výdaje, vyrovnání i QR platby. Bez reklam a bez zkušební doby.',
  'marketing.pricing.vip.title': 'VIP',
  'marketing.pricing.vip.period': 'měsíčně',
  'marketing.pricing.vip.body':
    '150 skenů účtenek měsíčně a uložené fotky účtenek k pozdějšímu nahlédnutí. Zrušíte kdykoli.',
  'marketing.pricing.packs.title': 'Balíčky skenů',
  'marketing.pricing.packs.body':
    'Skenujete jen občas? Kupte si balíček bez předplatného. Skeny nevyprší.',
  // 2, 5 and 10 — every pack size takes the Czech genitive plural after
  // "balíček", so one template covers all three ("balíček 2 skenů").
  'marketing.pricing.packs.item': 'Balíček {scans} skenů',
  'marketing.pricing.note': 'Platbu zpracovává Stripe. Předplatné zrušíte kdykoli v aplikaci.',
  'marketing.pricing.cta': 'Vyzkoušet zdarma',

  'marketing.faq.title': 'Časté otázky',
  'marketing.faq.q1': 'Je dlužníček zdarma?',
  'marketing.faq.a1':
    'Dělení útraty, vyrovnání i QR platby jsou zdarma a bez limitu. Platí se jen za skenování účtenek — buď měsíčním VIP, nebo jednorázovým balíčkem skenů.',
  'marketing.faq.q2': 'Musí si všichni ve skupině založit účet?',
  'marketing.faq.a2':
    'Nemusí. Členy přidáte jménem a dělíte s nimi hned. Účet potřebuje jen ten, kdo chce do skupiny sám nahlížet.',
  'marketing.faq.q3': 'Jak funguje QR platba?',
  'marketing.faq.a3':
    'U každého navrženého převodu najdete QR kód podle českého standardu QR Platba. Číslo účtu, částka i zpráva pro příjemce jsou v něm předvyplněné, takže v bance stačí potvrdit.',
  'marketing.faq.q4': 'Můžu si dlužníčka provozovat sám?',
  'marketing.faq.a4':
    'Ano. Dlužníček je open source a dá se hostovat na vlastním serveru. Bez klíče ke Stripe se placené funkce prostě nenabízejí a zbytek aplikace funguje dál.',

  'marketing.cta.title': 'Příště se vyrovnáte dvěma platbami',
  'marketing.cta.body': 'Založte skupinu, přidejte lidi a zapište první útratu. Zabere to minutu.',
  'marketing.cta.button': 'Založit skupinu',

  'marketing.footer.tagline': 'Open source dělení nákladů ve skupině.',
  'marketing.footer.source': 'Zdrojový kód',
} as const;

export type MarketingKey = keyof typeof marketingCs;
/** Every locale must provide exactly these keys, each mapping to a string. */
export type MarketingMessages = Record<MarketingKey, string>;

export const marketingEn: MarketingMessages = {
  'marketing.meta.title': 'EvenUp — settle up in the fewest payments',
  'marketing.meta.description':
    'Log who paid for what and EvenUp works out the smallest set of payments that clears the whole group. Receipts from a photo, Czech QR payments, several currencies, members without accounts.',

  'marketing.nav.features': 'Features',
  'marketing.nav.pricing': 'Pricing',
  'marketing.nav.faq': 'FAQ',

  'marketing.hero.title': 'Settle up in the fewest payments',
  'marketing.hero.subtitle':
    'A cabin weekend, a holiday, a flatshare. Log who paid for what and EvenUp nets the debts against each other, then proposes the shortest way to clear them. Two transfers instead of eight.',
  'marketing.hero.ctaPrimary': 'Start for free',
  'marketing.hero.ctaSignIn': 'Sign in',
  'marketing.hero.ctaApp': 'Open the app',

  'marketing.features.title': 'Why EvenUp',
  'marketing.feature.debts.title': 'Settlement in the fewest transfers',
  'marketing.feature.debts.body':
    'When seven people owe each other, nobody needs to send twenty payments. EvenUp nets the debts against each other and proposes the shortest set of transfers that clears them — usually just a couple.',
  'marketing.feature.ocr.title': 'Receipts from a photo',
  'marketing.feature.ocr.body':
    'Photograph a receipt and the line items are transcribed for you, prices included. All that is left is tapping who had what — you can split item by item, not only down the middle.',
  'marketing.feature.qr.title': 'QR payments straight into your bank',
  'marketing.feature.qr.body':
    'Every proposed transfer comes with a code in the Czech QR Platba standard. Scan it in your banking app and the account number, amount and payment message are already filled in.',
  'marketing.feature.currency.title': 'Several currencies in one group',
  'marketing.feature.currency.body':
    'Pay in euros, record in korunas. The rate is fetched for the date of the expense and the group keeps one base currency that everything adds up in.',
  'marketing.feature.guests.title': 'People without accounts',
  'marketing.feature.guests.body':
    'Nobody signs up for one weekend away. Add a member by name and split with them straight away; if they register later, you just link the two together.',

  'marketing.pricing.title': 'Pricing',
  'marketing.pricing.subtitle':
    'Splitting is free and unlimited. You only pay for reading receipts.',
  'marketing.pricing.free.title': 'Core',
  'marketing.pricing.free.price': 'Free',
  'marketing.pricing.free.body':
    'Unlimited groups, expenses, settlements and QR payments. No ads, no trial period.',
  'marketing.pricing.vip.title': 'VIP',
  'marketing.pricing.vip.period': 'per month',
  'marketing.pricing.vip.body':
    '150 receipt scans a month and receipt photos kept so you can look back at them. Cancel any time.',
  'marketing.pricing.packs.title': 'Scan packs',
  'marketing.pricing.packs.body':
    'Only scan now and then? Buy a pack instead of subscribing. Scans do not expire.',
  'marketing.pricing.packs.item': 'Pack of {scans} scans',
  'marketing.pricing.note':
    'Payments are handled by Stripe. Cancel your subscription any time in the app.',
  'marketing.pricing.cta': 'Try it free',

  'marketing.faq.title': 'Frequently asked questions',
  'marketing.faq.q1': 'Is EvenUp free?',
  'marketing.faq.a1':
    'Splitting, settling and QR payments are free and unlimited. You only pay for scanning receipts — either with a monthly VIP subscription or a one-off pack of scans.',
  'marketing.faq.q2': 'Does everyone in the group need an account?',
  'marketing.faq.a2':
    'No. Add members by name and split with them right away. An account is only needed by someone who wants to open the group themselves.',
  'marketing.faq.q3': 'How does the QR payment work?',
  'marketing.faq.a3':
    'Every proposed transfer carries a code in the Czech QR Platba standard. The account number, amount and payment message are pre-filled, so in your banking app you only confirm it.',
  'marketing.faq.q4': 'Can I run it myself?',
  'marketing.faq.a4':
    'Yes. EvenUp is open source and can run on your own server. Without a Stripe key the paid features are simply never offered and the rest of the app keeps working.',

  'marketing.cta.title': 'Next time, two payments and you are done',
  'marketing.cta.body':
    'Create a group, add the people, log the first expense. It takes about a minute.',
  'marketing.cta.button': 'Create a group',

  'marketing.footer.tagline': 'Open-source group expense splitting.',
  'marketing.footer.source': 'Source code',
};
