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
  'marketing.nav.label': 'Hlavní navigace',

  'marketing.hero.titleLead': 'Rozpočítejte výlet.',
  'marketing.hero.title': 'Dva dluhy se zruší.',
  'marketing.hero.titleAccent': 'Nikdo nikoho nehoní.',
  'marketing.hero.subtitle':
    'Zapište, kdo co platil. Dlužníček vzájemné dluhy vyruší, takže se celý výlet vyrovná co nejmenším počtem plateb.',
  'marketing.hero.ctaPrimary': 'Začít zdarma',
  'marketing.hero.ctaSecondary': 'Jak to funguje',
  'marketing.hero.ctaSignIn': 'Přihlásit se',
  'marketing.hero.ctaApp': 'Přejít do aplikace',
  'marketing.hero.invited': 'Pozvali vás do skupiny?',
  'marketing.hero.invitedLink': 'Otevřete ji',
  'marketing.hero.panel.aria':
    'Ukázka z aplikace: čtyři přátelé zapsali na horách čtyři útraty, z nichž by jiné aplikace udělaly 8 dluhů. Dlužníček je navzájem vyruší: Ondra pošle Evě {amount} a Filip s Klárou neplatí nic. Místo osmi plateb jedna.',
  'marketing.hero.panel.naive': 'Útrata po útratě',
  'marketing.hero.panel.debts': '4 útraty, {count} dluhů',
  'marketing.hero.panel.netted': 'S\u00a0Dlužníčkem',
  'marketing.hero.panel.naiveCount': '{count} plateb',
  'marketing.hero.panel.nettedCount': '1 platba',
  'marketing.hero.panel.dates': '12.–15. února',
  'marketing.hero.panel.square': 'neplatí nic',

  'marketing.demo.before': '2 platby',
  'marketing.demo.net': 'vyrušíme je proti sobě',
  'marketing.demo.after': '1 platba',
  'marketing.demo.names': 'Jirka, Petr a Honza',
  'marketing.demo.unit': 'platba',
  'marketing.how.app.group': 'Chata v Tatrách',
  'marketing.how.app.balances': 'Zůstatky',
  'marketing.how.app.payments': 'Platby',
  'marketing.how.app.settled': 'Vyrovnáno',
  'marketing.how.app.debt1': 'Jirka dluží Petrovi',
  'marketing.how.app.debt2': 'Petr dluží Honzovi',
  'marketing.how.app.result': 'Jirka pošle Honzovi',
  'marketing.how.app.markPaid': 'Zaplaceno',
  'marketing.how.title': 'Méně plateb, ať je vás kolik chce.',
  'marketing.how.body':
    'Jirka dluží Petrovi a Petr Honzovi, takže Jirka pošle peníze rovnou Honzovi a Petr neplatí nic.',

  'marketing.features.title': 'Sedmnáct dluhů.',
  'marketing.features.titleAfter': 'Pět plateb.',

  'marketing.shots.title': 'Zapíšete jednou. Zůstatky se pohnou všem.',
  'marketing.shots.lede':
    'Částka, název a kdo platil. Dlužníček to rozdělí a zůstatky celé skupiny sedí dřív, než se okno zavře.',
  'marketing.shots.groupCaption':
    'Zůstatky skupiny po chatě za {amount}: Lucii přibylo {gain}, každému dalšímu ubylo {share}. Lucie a Martin jsou v plusu, Pavel, Tomáš a Kateřina v minusu.',
  'marketing.shots.expenseCaption':
    'Nový výdaj Chata Štrbské Pleso za 1 280 Kč, který zaplatila Lucie a dělí se rovným dílem mezi pět lidí po 256 Kč.',
  'marketing.feature.debts.body':
    'Sedm lidí, týden na horách, sedmnáct dluhů mezi nimi. Dlužníček je navzájem započítá na co nejméně převodů, které vyrovnají všechny.',
  'marketing.feature.debts.short': 'Započteno na co nejméně převodů.',
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

  'marketing.fx.debts.before': '17 dluhů',
  'marketing.fx.debts.after': '5 plateb',
  'marketing.fx.debts.group': 'Krkonoše · 7 lidí',
  'marketing.fx.debts.total': 'Celkem se přesune',
  'marketing.fx.debts.via': 'QR na účet {account}',
  'marketing.fx.debts.paid': 'Zaplaceno',
  'marketing.fx.debts.progress': 'Zaplaceno {paid} z {count}',
  'marketing.fx.ocr.place': 'Hospoda U Rozvědčíka',
  'marketing.fx.ocr.item1': 'Svíčková ×2',
  'marketing.fx.ocr.item2': 'Smažený sýr',
  'marketing.fx.ocr.item3': 'Pivo 0,5 l ×6',
  'marketing.fx.ocr.item4': 'Kofola',
  'marketing.fx.ocr.total': 'Celkem',
  'marketing.fx.ocr.read': 'Položky načtené z fotky: {count}',
  'marketing.fx.qr.to': 'Příjemce',
  'marketing.fx.qr.account': 'Účet',
  'marketing.fx.qr.amount': 'Částka',
  'marketing.fx.qr.message': 'Zpráva',
  'marketing.fx.qr.note': 'Chata Krkonoše',
  'marketing.fx.cur.paid': 'Zaplaceno',
  'marketing.fx.cur.what': 'Večeře ve Vídni',
  'marketing.fx.cur.rate': '1 EUR = {rate} Kč · kurz ke dni výdaje',
  'marketing.fx.cur.group': 'Ve skupině',
  'marketing.fx.guests.you': 'Vy',
  'marketing.fx.guests.linked': 'Propojený účet',
  'marketing.fx.guests.guest': 'Jen jméno',
  'marketing.fx.guests.granny': 'Babička',
  'marketing.fx.guests.add': 'Přidat jménem',

  'marketing.pricing.title': 'Dělení je zdarma. Platí se jen skenování.',
  'marketing.pricing.free.title': 'Základní',
  'marketing.pricing.free.price': 'Zdarma',
  // Head of the price list, beside the title: the whole model in a sentence.
  'marketing.pricing.lede':
    'Skupiny, útraty i vyrovnání nestojí nic a nikdy stát nebudou. Platíte jen za to, že vám dlužníček přečte účtenky.',
  'marketing.pricing.free.body': 'Zdarma napořád, ne jen na zkoušku.',
  // What the free plan includes, as label/value rows — the same hairline rows
  // as the scan packs beside it, so all three columns end in a ruled list.
  'marketing.pricing.free.groups': 'Skupiny a útraty',
  'marketing.pricing.free.groupsValue': 'Neomezeně',
  'marketing.pricing.free.settle': 'Vyrovnání QR platbou',
  'marketing.pricing.free.settleValue': 'V ceně',
  'marketing.pricing.free.ads': 'Reklamy',
  'marketing.pricing.free.adsValue': 'Žádné',
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
  // Zkušební období. `{trialDays}` je `TRIAL_PERIOD_DAYS` z `billing/prices.ts`,
  // tedy totéž číslo, které checkout posílá Stripu – ceník nemůže nabízet
  // období, které předplatné doopravdy nedostane.
  //
  // „Zkušební období“, ne „zkušební lhůta“: lhůta je doba k uplatnění práva
  // a podle § 607 občanského zákoníku se prodlužuje, končí-li ve svátek nebo
  // o víkendu – tedy by posouvala den první platby. Stejné slovo je i v obou
  // právních dokumentech.
  //
  // Jiný zástupný symbol než sousední `{days}` schválně: `{days}` znamená
  // všude v tomto jmenném prostoru retenci fotek a `LegalDocument` ji dosazuje
  // do každého klíče najednou. Dvě různá čísla pod jedním jménem by se dřív
  // nebo později prohodila – a ceník by lhal o obojím.
  //
  // Tvar „{trialDays}denní“ je správný pro každou hodnotu (7denní, 3denní,
  // 14denní), takže tady genitivní past nehrozí; „po {trialDays} dnech“ je
  // lokál a sedí pro každou hodnotu ≥ 2.
  //
  // Že se kartou platí předem, musí být v ceníku vidět: „zkušební období
  // zdarma“ bez té věty čte většina lidí jako „nic nezadávám“. Sloveso
  // „strhneme“ je tu schválně stejné jako v aplikaci (`vip.trial.note`)
  // i v podmínkách – ceník má mluvit stejnou řečí jako zbytek produktu.
  'marketing.pricing.vip.trial':
    '{trialDays}denní zkušební období zdarma. Kartu zadáte hned, strhneme z ní až po {trialDays} dnech – a jen když nezrušíte.',
  'marketing.pricing.packs.title': 'Balíčky skenů',
  'marketing.pricing.packs.body':
    'Skenujete jen občas? Kupte si balíček bez předplatného. Skeny nevyprší.',
  // 2, 5 and 10 — every pack size takes the Czech genitive plural after
  // "balíček", so one template covers all three ("balíček 2 skenů"). A pack of
  // *one* would read „Balíček 1 skenů"; if `PACK_SIZES` ever gains a 1, this
  // string has to become a `plural()` call rather than a template.
  'marketing.pricing.packs.item': 'Balíček {scans} skenů',
  // Prefix to the cheapest pack's price in the price row („od 20 Kč"). The
  // amount itself comes from `display-prices.ts` via `formatCurrency`.
  'marketing.pricing.packs.from': 'od',
  // The VIP trial drawn as a two-point timeline: what you pay today, and on
  // which day the first payment comes. Purely visual; the sentence in
  // `marketing.pricing.vip.trial` carries the same facts for screen readers.
  'marketing.pricing.vip.today': 'Dnes',
  // „Po 7 dnech“, ne „7. den“: první platba přichází až po uplynutí celého
  // zkušebního období (osmý den sedmidenního), jak říká i `vip.trial`.
  'marketing.pricing.vip.day': 'Po {trialDays} dnech',
  // The receipt photo beside the price list. The caption names the unit every
  // plan is priced in — one receipt costs one scan — so the picture explains
  // the table rather than decorating it.
  // The receipt beside the price list is drawn in HTML, not photographed: a
  // till slip from a weekend at a cottage that the scan reads top to bottom.
  // Item names are copy; their amounts are formatted by `formatCurrency`.
  'marketing.pricing.scan.alt':
    'Účtenka z potravin za 5 položek; sken z ní přečte celkovou částku. Jedna účtenka je jeden sken.',
  'marketing.pricing.scan.caption': '1 účtenka = 1 sken',
  'marketing.pricing.scan.shop': 'Potraviny U Lesa',
  'marketing.pricing.scan.when': 'Sobota 18:42 · pokladna 2',
  'marketing.pricing.scan.item1': 'Chléb kmínový',
  'marketing.pricing.scan.item2': 'Eidam 30 %',
  'marketing.pricing.scan.item3': 'Pivo 6 × 0,5 l',
  'marketing.pricing.scan.item4': 'Špekáčky',
  'marketing.pricing.scan.item5': 'Dřevo na oheň',
  'marketing.pricing.scan.total': 'Celkem',
  'marketing.pricing.scan.thanks': 'Děkujeme za nákup',
  'marketing.pricing.note': 'Platby zpracovává Stripe. Předplatné zrušíte kdykoli v aplikaci.',
  // Míří na `/sign-up`, ne do checkoutu (`page.tsx`). Dokud v témže bloku
  // nestála nabídka zkušebního období, četlo se dřívější „Vyzkoušet zdarma“
  // neutrálně; vedle „{trialDays}denní zkušební období zdarma“ a tlačítka
  // „Předplatit VIP“ ale slibuje spuštění zkušebního období a dodá účet
  // zdarma. Popisek proto říká, co odkaz doopravdy udělá.
  'marketing.pricing.cta': 'Založit účet zdarma',
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

  'marketing.cta.title': 'Příští výlet vyrovnáte dvěma platbami.',
  'marketing.cta.body': 'Založte skupinu, přidejte lidi a zapište první útratu. Zabere to minutu.',
  'marketing.cta.button': 'Začít zdarma',
  'marketing.cta.note': 'Dělení, vyrovnání i QR platby zdarma.',
  'marketing.cta.group': 'Páteční večeře',
  'marketing.cta.cardLabel': 'Ukázka z aplikace: skupina Páteční večeře vyrovnaná dvěma platbami.',

  'marketing.footer.tagline': 'Dělení útraty ve skupině. Open source.',
  'marketing.footer.source': 'Zdrojový kód',
  'marketing.footer.product': 'Produkt',
  'marketing.faq.more': 'Další otázku nám napište',
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
  'marketing.nav.label': 'Main',

  'marketing.hero.titleLead': 'Split the trip.',
  'marketing.hero.title': 'Two debts cancel out.',
  'marketing.hero.titleAccent': 'Nobody chases anybody.',
  'marketing.hero.subtitle':
    'Log who paid for what. EvenUp nets every debt against the others, so the whole trip settles in the fewest payments possible.',
  'marketing.hero.ctaPrimary': 'Start for free',
  'marketing.hero.ctaSecondary': 'See how it works',
  'marketing.hero.ctaSignIn': 'Sign in',
  'marketing.hero.ctaApp': 'Open the app',
  'marketing.hero.invited': 'Invited to a group?',
  'marketing.hero.invitedLink': 'Open it',
  'marketing.hero.panel.aria':
    'From the app: four friends logged four expenses on a mountain trip, which other apps would turn into 8 separate debts. EvenUp nets them off: Andy sends {amount} to Eve, and Phil and Clara pay nothing. One payment instead of eight.',
  'marketing.hero.panel.naive': 'Expense by expense',
  'marketing.hero.panel.debts': '4 expenses, {count} debts',
  'marketing.hero.panel.netted': 'With EvenUp',
  'marketing.hero.panel.naiveCount': '{count} payments',
  'marketing.hero.panel.nettedCount': '1 payment',
  'marketing.hero.panel.dates': 'Feb 12–15',
  'marketing.hero.panel.square': 'pays nothing',

  'marketing.demo.before': '2 payments',
  'marketing.demo.net': 'net them off',
  'marketing.demo.after': '1 payment',
  'marketing.demo.names': 'Jake, Peter and Henry',
  'marketing.demo.unit': 'payment',
  'marketing.how.app.group': 'Lake District cabin',
  'marketing.how.app.balances': 'Balances',
  'marketing.how.app.payments': 'Payments',
  'marketing.how.app.settled': 'Settled',
  'marketing.how.app.debt1': 'Jake owes Peter',
  'marketing.how.app.debt2': 'Peter owes Henry',
  'marketing.how.app.result': 'Jake pays Henry',
  'marketing.how.app.markPaid': 'Mark paid',
  'marketing.how.title': 'Fewer payments, however many of you there are.',
  'marketing.how.body':
    'Jake owes Peter and Peter owes Henry, so Jake pays Henry and Peter pays nothing.',

  'marketing.features.title': 'Seventeen debts.',
  'marketing.features.titleAfter': 'Five payments.',

  'marketing.shots.title': 'Add it once. Every balance moves.',
  'marketing.shots.lede':
    'An amount, a name and who paid. EvenUp splits it, and the whole group’s balances are right before the sheet closes.',
  'marketing.shots.groupCaption':
    'The group’s balances after the {amount} chalet: Lucy is up {gain}, everyone else down {share}. Lucy and Martin are in credit; Paul, Tom and Kate owe.',
  'marketing.shots.expenseCaption':
    'A new expense, the chalet in the Alps for 1,280 CZK, paid by Lucy and split equally between five people at 256 CZK each.',
  'marketing.feature.debts.body':
    'Seven people, a week in the mountains, seventeen debts between them. EvenUp nets them against each other into the fewest transfers that settle everyone.',
  'marketing.feature.debts.short': 'Netted down to the fewest transfers.',
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

  'marketing.fx.debts.before': '17 debts',
  'marketing.fx.debts.after': '5 payments',
  'marketing.fx.debts.group': 'Alps · 7 people',
  'marketing.fx.debts.total': 'Moves in total',
  'marketing.fx.debts.via': 'QR to {account}',
  'marketing.fx.debts.paid': 'Paid',
  'marketing.fx.debts.progress': '{paid} of {count} paid',
  'marketing.fx.ocr.place': 'The Old Pub',
  'marketing.fx.ocr.item1': 'Roast beef ×2',
  'marketing.fx.ocr.item2': 'Fried cheese',
  'marketing.fx.ocr.item3': 'Beer 0.5 l ×6',
  'marketing.fx.ocr.item4': 'Cola',
  'marketing.fx.ocr.total': 'Total',
  'marketing.fx.ocr.read': '{count} items read from the photo',
  'marketing.fx.qr.to': 'To',
  'marketing.fx.qr.account': 'Account',
  'marketing.fx.qr.amount': 'Amount',
  'marketing.fx.qr.message': 'Message',
  'marketing.fx.qr.note': 'Mountain cottage',
  'marketing.fx.cur.paid': 'Paid',
  'marketing.fx.cur.what': 'Dinner in Vienna',
  'marketing.fx.cur.rate': '1 EUR = {rate} CZK · rate on the day',
  'marketing.fx.cur.group': 'In the group',
  'marketing.fx.guests.you': 'You',
  'marketing.fx.guests.linked': 'Linked account',
  'marketing.fx.guests.guest': 'Name only',
  'marketing.fx.guests.granny': 'Grandma',
  'marketing.fx.guests.add': 'Add by name',

  'marketing.pricing.title': 'Splitting is free. Only scanning is paid.',
  'marketing.pricing.free.title': 'Core',
  'marketing.pricing.free.price': 'Free',
  'marketing.pricing.lede':
    'Groups, expenses and settling up cost nothing, and never will. You only pay for EvenUp to read your receipts.',
  'marketing.pricing.free.body': 'Free for good, not just for a trial.',
  'marketing.pricing.free.groups': 'Groups and expenses',
  'marketing.pricing.free.groupsValue': 'Unlimited',
  'marketing.pricing.free.settle': 'Settle up by QR payment',
  'marketing.pricing.free.settleValue': 'Included',
  'marketing.pricing.free.ads': 'Ads',
  'marketing.pricing.free.adsValue': 'None',
  'marketing.pricing.vip.title': 'VIP',
  'marketing.pricing.vip.period': 'per month',
  'marketing.pricing.vip.body':
    '{scans} receipt scans a month. The photos stay saved, and {days} days after the scan we delete them. Cancel any time.',
  'marketing.pricing.vip.trial':
    'A {trialDays}-day free trial. Your card goes in up front; the first charge comes after {trialDays} days, and only if you have not cancelled.',
  'marketing.pricing.packs.title': 'Scan packs',
  'marketing.pricing.packs.body':
    'Only scan now and then? Buy a pack instead of subscribing. Scans do not expire.',
  'marketing.pricing.packs.item': 'Pack of {scans} scans',
  'marketing.pricing.packs.from': 'from',
  'marketing.pricing.vip.today': 'Today',
  'marketing.pricing.vip.day': 'After {trialDays} days',
  'marketing.pricing.scan.alt':
    'A five-item grocery receipt; the scan reads its total. One receipt is one scan.',
  'marketing.pricing.scan.caption': '1 receipt = 1 scan',
  'marketing.pricing.scan.shop': 'Potraviny U Lesa',
  'marketing.pricing.scan.when': 'Saturday 18:42 · till 2',
  'marketing.pricing.scan.item1': 'Rye bread',
  'marketing.pricing.scan.item2': 'Edam cheese',
  'marketing.pricing.scan.item3': 'Beer 6 × 0.5 l',
  'marketing.pricing.scan.item4': 'Sausages',
  'marketing.pricing.scan.item5': 'Firewood',
  'marketing.pricing.scan.total': 'Total',
  'marketing.pricing.scan.thanks': 'Thank you',
  'marketing.pricing.note':
    'Payments are handled by Stripe. Cancel your subscription any time in the app.',
  'marketing.pricing.cta': 'Create a free account',
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

  'marketing.cta.title': 'Settle the next trip in two payments.',
  'marketing.cta.body':
    'Create a group, add the people, log the first expense. It takes about a minute.',
  'marketing.cta.button': 'Start for free',
  'marketing.cta.note': 'Splitting, settling and QR payments are free.',
  'marketing.cta.group': 'Friday dinner',
  'marketing.cta.cardLabel': 'From the app: the Friday dinner group, settled with two payments.',

  'marketing.footer.tagline': 'Group expense splitting. Open source.',
  'marketing.footer.source': 'Source code',
  'marketing.footer.product': 'Product',
  'marketing.faq.more': 'Ask us anything else',
};

export const marketingEn: MarketingMessages = { ...marketingOnlyEn, ...legalEn };
