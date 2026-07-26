/**
 * The four legal documents — terms, privacy policy, withdrawal/complaints and
 * contact — in both locales.
 *
 * **A sibling of `marketing.ts`, re-exported through it.** These belong to the
 * same namespace (one `tMarketing`, one `MarketingKey`, one set of public
 * pages) but not in the same file: they are four times the length of the
 * landing copy, they change on a different cadence and for different reasons
 * (a legal review, a new processor, a changed retention period — never an A/B
 * test of a headline), and a reviewer reading the privacy policy should not
 * have to scroll past hero variants to find it. `marketing.ts` spreads both
 * halves into `marketingCs`/`marketingEn`, so the compile-time key-parity
 * guarantee and every call site are unchanged.
 *
 * **Every factual claim here was checked against the code, not against a
 * summary.** A privacy policy that misdescribes the system is a false
 * statement to users and to a supervisory authority, so the sources are worth
 * naming:
 *
 * | Claim | Verified in |
 * |---|---|
 * | OCR goes to OpenRouter, single instance key | `api/src/routers/ocr.ts`, `api/src/ocr/openrouter-adapter.ts` |
 * | A scan is refused without explicit consent | `api/src/routers/ocr.ts` (the `ocrConsentAt` gate) |
 * | Receipt photos expire, default 30 days | `api/src/config/retention.ts`, `api/src/services/receipt-cleanup.ts` |
 * | Photo storage follows the subscription, not the funding bucket | `api/src/billing/entitlement.ts` (`mayStoreImage`) |
 * | Allowance first, then credits | `api/src/billing/entitlement.ts` |
 * | Expired sessions (with their IP address) are purged | `api/src/services/session-cleanup.ts`, `web/src/app/api/cron/receipt-cleanup/route.ts` |
 * | Deletion leaves shared groups' receipts, photos and OCR results in place | `api/src/services/account.ts` — keys are collected only when `others === 0` |
 * | Credits never expire | `schema.prisma` `User.creditBalance` |
 * | A failed scan refunds the credit | `api/src/routers/ocr.ts` → `refundCredit` |
 * | Cancellation is the Stripe portal | `api/src/routers/billing.ts` `portal` |
 * | The credit-pack withdrawal waiver | `api/src/routers/billing.ts` `checkoutCredits` |
 * | The subscription opens with a free trial of `{trialDays}` | `api/src/billing/prices.ts` `TRIAL_PERIOD_DAYS`, passed to Stripe by `buildSubscriptionCheckoutParams` |
 * | The trial is granted once per customer | `api/src/routers/billing.ts` `hasEverSubscribed` — counts terminal subscriptions too |
 * | A trialing subscription is full VIP, not a reduced one | `api/src/billing/entitlement.ts` `USABLE_SUBSCRIPTION_STATUSES` |
 * | No immediate-performance consent is asked for the subscription | `api/src/routers/billing.ts` `checkoutSubscription` — unlike `checkoutCredits` |
 * | evenup.cz mails via Seznam SMTP as noreply@evenup.cz | `web/src/server/email.ts` + the domain-email migration record |
 * | Deletion keeps PURCHASE + Subscription rows | `api/src/services/account.ts` |
 * | Those rows are pseudonymized, NOT anonymous | same file — `stripeEventId` resolves to a Stripe Customer |
 * | A solo group's receipt photos leave storage with the account | same file — keys collected before the cascade |
 *
 * The places the copy is deliberately *less* specific than the code are the
 * ones a self-hoster configures: object storage, hosting and — since
 * `email.ts` prefers Resend whenever `RESEND_API_KEY` is set — the mail
 * provider. The policy names the category (which GDPR Art. 13(1)(e) permits)
 * and scopes the concrete provider to evenup.cz, rather than hardcoding one
 * the self-hosting instructions contradict.
 *
 * Three things the copy must NOT say, and does not:
 * - that retained billing rows are anonymous (they are not — see above);
 * - that a user can delete a group. They cannot: `routers/group.ts` exposes
 *   create/list/get/update/archive, and `archive` only stamps `archivedAt`.
 *   The only `group.delete` in the repo is account deletion, for solo groups.
 *   Offering an erasure route that does not exist is an Art. 12/13 misstatement;
 * - that deleting an expense removes the recognised items. It cascades
 *   `ReceiptItem`, but `Transaction.receiptId` is `onDelete: SetNull` on the
 *   transaction side, so the `Receipt` row survives with `rawJson` — a second,
 *   complete copy of the OCR result.
 *
 * Czech is the original. It is written as native legal-register Czech — plain
 * where plain is allowed, precise where precision is the point — and the
 * English is its counterpart, not the other way round. Czech typography per
 * `marketing.ts`: a spaced en dash `–`, never an em dash.
 */

export const legalCs = {
  /* ------------------------------------------------------------- shared */

  // Shown on all four pages until LEGAL_REVIEWED=true is set at build time.
  'legal.draft.title': 'Pracovní znění – čeká na právní kontrolu',
  'legal.draft.body':
    'Tento dokument je koncept sepsaný podle toho, jak aplikace skutečně funguje. Neprošel kontrolou advokáta a není právní radou. Než spustíme skutečné platby, necháme ho posoudit.',

  'legal.effective': 'Znění ze dne {date}',

  'legal.nav.terms': 'Obchodní podmínky',
  'legal.nav.privacy': 'Ochrana osobních údajů',
  'legal.nav.refunds': 'Odstoupení a reklamace',
  'legal.nav.contact': 'Kontakt',
  'legal.nav.title': 'Právní informace',

  'legal.entity.name': 'Název',
  'legal.entity.ico': 'IČO',
  'legal.entity.address': 'Sídlo',
  'legal.entity.email': 'E-mail',
  'legal.entity.missing.title': 'Údaje o provozovateli nejsou vyplněny',
  'legal.entity.missing.body':
    'Název, IČO a sídlo se načítají z proměnných prostředí LEGAL_ENTITY_NAME, LEGAL_ENTITY_ICO a LEGAL_ENTITY_ADDRESS a musí být nastaveny ještě před sestavením aplikace. Dokud chybí, nesplňuje tato stránka ani informační povinnost vůči spotřebiteli, ani povinnost podle čl. 13 GDPR.',

  'legal.email.cta': 'Napsat na support@evenup.cz',

  /* -------------------------------------------------------------- terms */

  'legal.terms.title': 'Obchodní podmínky',
  'legal.terms.meta.title': 'Obchodní podmínky – dlužníček',
  'legal.terms.meta.description':
    'Podmínky používání dlužníčka: co je zdarma, jak funguje předplatné a balíčky skenů, jak se předplatné ruší a jaká máte práva.',
  'legal.terms.intro':
    'Tyto podmínky upravují používání služby dlužníček na evenup.cz. Používáním služby s nimi souhlasíte. Je-li něco nejasné, napište nám – rádi to vysvětlíme.',

  'legal.terms.s1.h': 'Kdo službu provozuje',
  'legal.terms.s1.p1':
    'Provozovatelem služby je subjekt uvedený níže. Ve všem, co se těchto podmínek týká, nás kontaktujte na uvedené adrese.',

  'legal.terms.s2.h': 'Co dlužníček dělá',
  'legal.terms.s2.p1':
    'Dlužníček eviduje, kdo ve skupině co zaplatil, a spočítá nejmenší počet plateb, kterými se všichni vyrovnají. Umí přečíst účtenku z fotky, přepočítat cizí měnu kurzem ke dni útraty a připravit QR kód podle českého standardu QR Platba.',
  'legal.terms.s2.p2':
    'Dlužníček sám žádné peníze neposílá ani nedrží. Nejsme banka ani platební instituce. QR kód je jen předvyplněný podklad pro vaši banku – platbu zadáváte a potvrzujete vy. Výsledky výpočtů jsou informativní a nenahrazují účetnictví ani daňové poradenství.',

  'legal.terms.s3.h': 'Účet',
  'legal.terms.s3.p1':
    'K vedení vlastní skupiny potřebujete účet. Zakládá se e-mailem a heslem, nebo přes Google či Apple, pokud jsou na dané instanci zapnuté. Uvádějte pravdivé údaje a přihlašovací údaje nikomu nesdělujte.',
  'legal.terms.s3.p2': 'Služba není určena osobám mladším 15 let.',
  'legal.terms.s3.p3':
    'Členy skupiny můžete přidat i bez účtu, jenom jménem. Přidáváte-li někoho jménem, které ho identifikuje, dejte mu o tom vědět – ostatní členové uvidí jeho jméno i částky, které na něj připadají.',
  'legal.terms.s3.p4':
    'Účet můžeme zablokovat nebo zrušit, pokud službu používáte v rozporu s těmito podmínkami nebo se zákonem.',

  'legal.terms.s4.h': 'Co je zdarma a co se platí',
  'legal.terms.s4.p1':
    'Skupiny, útraty, vyrovnání dluhů, QR platby i členové bez účtu jsou zdarma a bez limitu. Platí se jenom skenování účtenek.',
  // `{scans}` is `VIP_SCANS_PER_PERIOD`, exactly as in `marketing.ts`, and the
  // same Czech caveat applies: the genitive plural („150 skenů“) is right for
  // every value the product currently uses, but breaks for one whose final
  // digit is 2, 3 or 4 (excluding 12–14) — 122 would render „122 skenů“ where
  // Czech needs „122 skeny“. Move this string to `plural()` if that ever
  // happens. `{days}` is deliberately phrased to avoid the trap: see `s7.li1`.
  'legal.terms.s4.li1':
    'Předplatné VIP: {scans} skenů účtenek za každé zúčtovací období. Fotky naskenovaných účtenek zůstávají uložené, ať se k nim můžete vrátit; po {days} dnech od naskenování je smažeme.',
  'legal.terms.s4.li2':
    'Balíček skenů: jednorázový nákup bez předplatného. Zakoupené skeny nevyprší.',
  'legal.terms.s4.p2':
    'Skeny se čerpají v tomto pořadí: nejprve limit z předplatného, a teprve když ho vyčerpáte, ubírají se skeny zakoupené v balíčku. Nevyčerpaný limit z předplatného se do dalšího období nepřevádí; zakoupené skeny zůstávají, dokud je nevyužijete.',
  // Ukládání fotky se řídí předplatným, ne tím, z čeho je sken zaplacený
  // (`entitlement.ts`, `mayStoreImage`). Předplatiteli, který vyčerpá limit,
  // se tedy ukládá dál – dřívější znění tvrdilo opak a bralo mu uprostřed
  // období výhodu, kterou si zaplatil.
  'legal.terms.s4.p3':
    'Ukládání fotek patří k předplatnému: dokud vám předplatné běží, ukládáme fotku ke každému skenu – i k tomu, který se po vyčerpání limitu hradí z balíčku. Nemáte-li předplatné, sken z balíčku fotku neukládá a zůstanou jen rozpoznané položky u výdaje.',
  // The refund fires only for `consume === 'CREDIT'` (`ocr.ts`), so this is
  // about a pack-funded scan — a failed VIP-allowance scan is not returned.
  'legal.terms.s4.p4':
    'Když se nepovede sken hrazený z balíčku, automaticky vám ho vrátíme zpět mezi zbývající skeny a účtenku můžete zapsat ručně.',
  'legal.terms.s4.p5':
    'Na instanci, kterou si provozujete sami a která nemá napojení na Stripe, se placené funkce vůbec nenabízejí a skenování není nijak omezené.',

  'legal.terms.s5.h': 'Ceny a platby',
  'legal.terms.s5.p1':
    'Ceny najdete v ceníku na hlavní stránce. Na českých stránkách platíte v korunách, na anglických v eurech.',
  'legal.terms.s5.p2':
    'Platby zpracovává Stripe. Údaje o platební kartě zadáváte přímo u něj a k nám se nedostanou. Rozhodující je částka, kterou vám Stripe ukáže v okamžiku placení.',
  'legal.terms.s5.p3':
    'Balíček skenů je jednorázová platba. Předplatné se automaticky obnovuje na další období, dokud ho nezrušíte.',
  // `{trialDays}` je `TRIAL_PERIOD_DAYS` z `billing/prices.ts` – totéž číslo,
  // které `checkoutSubscription` posílá Stripu jako `trial_period_days`.
  // Nikoli `{days}`: ten v celém tomto souboru znamená retenci fotek a
  // `LegalDocument` ho dosazuje do každého klíče. Tvar „{trialDays}denní“ je
  // navíc mluvnicky správný pro každou hodnotu, na rozdíl od genitivu.
  //
  // „až po jeho skončení“ je den 8 při sedmidenním zkušebním období. Konkrétní
  // číslo dne tu schválně není: plynulo by z aritmetiky nad konstantou a při
  // její změně by tiše přestalo platit.
  //
  // Důsledně „zkušební období“, nikdy „zkušební lhůta“. Lhůta je v pojetí
  // občanského zákoníku doba, v níž je třeba uplatnit právo, a podle § 607 se
  // prodlužuje, končí-li v sobotu, v neděli nebo ve svátek – to by posunulo
  // den první platby. Ve zkušebním období není třeba dělat nic, takže je to
  // doba, ne lhůta.
  'legal.terms.s5.p4':
    'Předplatné VIP začíná {trialDays}denním zkušebním obdobím zdarma. Údaje o platební kartě zadáváte hned při objednávce, ale po dobu zkušebního období vám neúčtujeme nic – první platbu strhneme až po jeho skončení, a jen tehdy, pokud jste předplatné do té doby nezrušili.',
  // Vynucuje to `checkoutSubscription`: zkušební období dostane jen ten, kdo u
  // nás dosud žádné předplatné neměl, včetně už zrušeného (`hasEverSubscribed`
  // v `routers/billing.ts`). Bez této věty by podmínky nabízely zkušební
  // období, které část zákazníků při objednávce nedostane.
  'legal.terms.s5.p5':
    'Zkušební období nabízíme jednou. Měli-li jste u nás předplatné VIP už dřív, další si objednáváte rovnou jako placené.',

  'legal.terms.s6.h': 'Zrušení předplatného',
  'legal.terms.s6.p1':
    'Předplatné zrušíte kdykoli v aplikaci tlačítkem „Spravovat předplatné“, které vás přesměruje do zákaznického portálu Stripe. Zrušení se projeví ke konci právě zaplaceného období – do té doby vám předplatné běží dál.',
  // Pojmenováno `p1b` po vzoru `legal.privacy.s8.p3b`: patří k `p1`, ale
  // přečíslovat kvůli tomu `p2` by znamenalo sáhnout na klíč, na který se
  // odkazuje stránka i druhý dokument.
  'legal.terms.s6.p1b':
    'Zrušíte-li předplatné během zkušebního období, poběží do jeho posledního dne a pak skončí – nic vám neúčtujeme.',
  'legal.terms.s6.p2':
    'Zrušení předplatného není odstoupení od smlouvy. Odstoupení a reklamace řeší samostatný dokument.',

  'legal.terms.s7.h': 'Odstoupení od smlouvy',
  'legal.terms.s7.p1':
    'Jste-li spotřebitel, máte zpravidla 14 dnů na odstoupení od smlouvy uzavřené na dálku. U balíčku skenů toto právo zaniká, jakmile při placení odsouhlasíte okamžité dodání. Podrobnosti jsou v dokumentu o odstoupení a reklamacích.',

  'legal.terms.s8.h': 'Skenování účtenek',
  'legal.terms.s8.p1':
    'Fotku nebo PDF účtenky odesíláme poskytovateli umělé inteligence, který z ní přečte položky. Bez vašeho výslovného souhlasu se sken nespustí; souhlas kdykoli odvoláte v Nastavení.',
  'legal.terms.s8.p2':
    'Rozpoznání je automatické a nemusí být přesné. Vždy si zkontrolujte položky i celkovou částku, než účtenku uložíte. Za škodu způsobenou tím, že jste uložili nesprávně rozpoznanou účtenku, neodpovídáme.',
  'legal.terms.s8.p3': 'Nahrávejte jen účtenky ke své vlastní útratě a nic, co sdílet nesmíte.',

  'legal.terms.s9.h': 'Pravidla používání',
  'legal.terms.s9.li1':
    'Nenarušujte provoz služby, neobcházejte limity a nepřistupujte k ní automatizovaně nad rámec běžného používání.',
  'legal.terms.s9.li2':
    'Nenahrávejte nezákonný obsah ani osobní údaje jiných lidí, které nemáte důvod sdílet.',
  'legal.terms.s9.li3': 'Nepoužívejte službu k jednání, které poškodí ostatní uživatele nebo nás.',

  'legal.terms.s10.h': 'Dostupnost služby',
  'legal.terms.s10.p1':
    'Snažíme se, aby služba běžela bez výpadků, ale nepřetržitý provoz nezaručujeme. Kvůli údržbě, aktualizaci nebo výpadku poskytovatelů může být dočasně nedostupná. Nemohli-li jste kvůli delšímu výpadku využít placenou funkci, napište nám – vyřešíme to individuálně.',

  'legal.terms.s11.h': 'Odpovědnost',
  'legal.terms.s11.p1':
    'Službu poskytujeme tak, jak je. Neodpovídáme za rozhodnutí, která na základě jejích výpočtů uděláte, ani za vypořádání mezi vámi a ostatními členy skupiny – peníze si posíláte sami a mimo službu.',
  'legal.terms.s11.p2':
    'Tím neomezujeme svou odpovědnost tam, kde to zákon nedovoluje – zejména odpovědnost za újmu způsobenou úmyslně nebo z hrubé nedbalosti, ani práva spotřebitele z vadného plnění.',

  'legal.terms.s12.h': 'Otevřený zdrojový kód',
  'legal.terms.s12.p1':
    'Dlužníček je open source pod licencí MIT. Licence se vztahuje na zdrojový kód, tyto podmínky na službu provozovanou na evenup.cz. Provozujete-li si vlastní instanci, jste jejím provozovatelem vy a tyto podmínky se na ni nevztahují.',

  'legal.terms.s13.h': 'Změny podmínek',
  'legal.terms.s13.p1':
    'Podmínky můžeme změnit – například když přibude funkce nebo se změní ceny. Podstatnou změnu oznámíme e-mailem nebo v aplikaci s předstihem. Pokud se změnou nesouhlasíte, můžete předplatné zrušit a účet smazat.',

  'legal.terms.s14.h': 'Rozhodné právo a řešení sporů',
  'legal.terms.s14.p1':
    'Smluvní vztah se řídí českým právem, zejména občanským zákoníkem a zákonem o ochraně spotřebitele. Tím nejsou dotčena práva, která vám jako spotřebiteli dává právní řád státu vašeho obvyklého bydliště.',
  'legal.terms.s14.p2':
    'Spor se pokusíme vyřešit dohodou – napište nám. Jste-li spotřebitel, můžete se obrátit na Českou obchodní inspekci, která je subjektem mimosoudního řešení spotřebitelských sporů (www.coi.cz).',

  /* ------------------------------------------------------------ privacy */

  'legal.privacy.title': 'Zásady ochrany osobních údajů',
  'legal.privacy.meta.title': 'Ochrana osobních údajů – dlužníček',
  'legal.privacy.meta.description':
    'Jaké údaje dlužníček zpracovává, komu je předává, jak dlouho je uchovává a co se s nimi stane, když smažete účet.',
  'legal.privacy.intro':
    'Tady najdete, jaké údaje o vás dlužníček zpracovává, proč, komu je předává a jak dlouho je uchovává. Sepsali jsme to podle toho, co aplikace opravdu dělá – ne podle vzoru.',

  'legal.privacy.s1.h': 'Kdo je správce',
  'legal.privacy.s1.p1': 'Správcem osobních údajů je provozovatel služby:',
  'legal.privacy.s1.p2':
    'Pověřence pro ochranu osobních údajů jsme nejmenovali. Ve všem, co se osobních údajů týká, se obracejte na uvedený e-mail.',

  'legal.privacy.s2.h': 'Jaké údaje zpracováváme',
  'legal.privacy.s2.p1': 'Zpracováváme jenom to, co aplikace ke svému chodu potřebuje.',
  'legal.privacy.s2.li1':
    'Účet: e-mail, jméno, jazyk, výchozí měna a případně profilová fotka. Heslo uchováváme jen jako otisk (hash), ne v čitelné podobě. Účel: vedení účtu a přihlášení. Právní základ: plnění smlouvy. Uchováváme po dobu trvání účtu.',
  'legal.privacy.s2.li2':
    'Přihlášení: záznam o relaci včetně IP adresy a údajů o prohlížeči. Účel: udržet vás přihlášené a rozpoznat zneužití. Právní základ: oprávněný zájem na bezpečnosti. Záznam uchováváme po dobu platnosti relace, nejpozději do smazání účtu.',
  // Skupinu NELZE smazat: `group.ts` nabízí create/list/get/update/archive a
  // nic víc, `group.delete` volá jedině `services/account.ts` při mazání účtu,
  // a jen u skupin, kde je uživatel sám. Text proto nesmí slibovat smazání
  // skupiny jako cestu k výmazu (čl. 12/13 GDPR).
  'legal.privacy.s2.li3':
    'Skupiny a útraty: názvy skupin, jména členů, částky, měny, kategorie, poznámky a historie změn. Účel: vlastní fungování aplikace. Právní základ: plnění smlouvy. Uchováváme, dokud jednotlivé záznamy nesmažete. Skupinu lze archivovat, ne smazat; skupiny, ve kterých jste sami, zanikají se smazáním účtu.',
  'legal.privacy.s2.li4':
    'Bankovní spojení: číslo účtu nebo IBAN, který si uložíte pro QR platbu. Ukládáme ho zašifrované (AES-256-GCM). Účel: předvyplnění QR platby. Právní základ: plnění smlouvy. Mažeme ho spolu s účtem.',
  // Mazání výdaje bere jen `ReceiptItem` (kaskáda). `Transaction.receiptId` má
  // `onDelete: SetNull` na straně transakce, takže řádek `Receipt` přežije i
  // s `rawJson` – tedy s druhou kopií celého výsledku rozpoznání. Text to říká
  // nahlas; slíbit opak by byl nepravdivý údaj o rozsahu zpracování.
  'legal.privacy.s2.li5':
    'Účtenky: fotka nebo PDF účtenky a údaje z ní přečtené – obchodník, položky, částky, datum. Fotku automaticky mažeme po {days} dnech od naskenování. Rozpoznané položky zůstávají u výdaje, dokud výdaj nesmažete; smazáním výdaje ale nezaniká samotný záznam o účtence – druhá kopie výsledku rozpoznání u něj zůstává a mizí až spolu se skupinou. Právní základ: pro odeslání ke zpracování souhlas, pro uložení výsledku plnění smlouvy.',
  'legal.privacy.s2.li6':
    'Platby: identifikátor zákazníka u Stripu, stav předplatného, zůstatek skenů a záznamy o jejich nákupu a čerpání. Účel: zpřístupnění placených funkcí a účetnictví. Právní základ: plnění smlouvy a plnění právní povinnosti.',
  'legal.privacy.s2.li7':
    'Souhlas se skenováním: datum a čas, kdy jste ho udělili. Účel: doložit, že souhlas existoval. Právní základ: plnění právní povinnosti.',
  'legal.privacy.s2.li8':
    'E-maily: adresa příjemce a obsah zprávy u ověření e-mailu, obnovení hesla a oznámení o dění ve skupině. Do oznámení záměrně nedáváme bankovní spojení.',
  // Zmírněno oproti dřívějšímu „vstupy požadavku do nich neukládáme“, což bylo
  // pravdivé zvykem, ne konstrukcí: `trpc.ts` předává do `services/error-log.ts`
  // `error.message` (a text příčiny) bez filtru. Vlastní chybová hlášení
  // routerů jsou psaná ručně a nic ze vstupu neobsahují, ale text neočekávané
  // chyby přichází z Prismy, úložiště nebo poskytovatele OCR a ten do něj může
  // vložit hodnotu, na které selhal. Slíbit v zásadách jistotu, kterou kód
  // nevynucuje, je horší než popsat skutečný stav.
  'legal.privacy.s2.li9':
    'Chybové záznamy: kód a text chyby, název volané funkce a identifikátor uživatele, kterému se chyba stala. Hesla ani šifrovací klíče do nich neukládáme a vstupy požadavku do nich záměrně nezapisujeme; text neočekávané chyby ale přebíráme od systému, který ji vyvolal, a ten může výjimečně obsahovat útržek zpracovávaných dat. Účel: hledání závad.',

  'legal.privacy.s3.h': 'Cookies',
  'legal.privacy.s3.p1':
    'Používáme jenom nezbytné cookies: přihlašovací cookie, která vás udrží přihlášené, a při přihlášení přes Google nebo Apple krátkodobou cookie, která ochrání přesměrování. Žádnou analytiku ani reklamní a sledovací skripty nemáme, a proto nezobrazujeme cookie lištu – nebylo by co odsouhlasit.',
  // Tady „upozornění“ znamená nápovědu k možnému duplicitnímu členovi, ne
  // notifikaci – proto se nemění na „oznámení“ jako jinde v dokumentu.
  'legal.privacy.s3.p2':
    'V úložišti prohlížeče si aplikace pamatuje jedinou drobnost z ovládání: která upozornění na možné duplicitní členy jste zavřeli. Nikam se neodesílá.',

  'legal.privacy.s4.h': 'Komu údaje předáváme',
  'legal.privacy.s4.p1':
    'Údaje neprodáváme. Předáváme je jen zpracovatelům, bez kterých by služba nefungovala:',
  'legal.privacy.s4.li1':
    'OpenRouter – fotka nebo PDF účtenky a pokyn k jejímu přečtení. OpenRouter je směrovač: požadavek posílá dál poskytovateli konkrétního modelu, takže do zpracování vstupují další zpracovatelé a zpracování může probíhat mimo Evropskou unii.',
  'legal.privacy.s4.li2':
    'Stripe – e-mail, identifikátor zákazníka a údaje o platbě a předplatném. Platební kartu zadáváte přímo u Stripu.',
  // Hedged like `li4` a `li6`: `web/src/server/email.ts` sahá nejprve po
  // Resendu, když je nastavený RESEND_API_KEY, a teprve pak po SMTP. Bez této
  // výhrady by si samostatný provozovatel vykreslil zásady se zpracovatelem,
  // kterého vůbec nepoužívá.
  //
  // Druhá výhrada, „v současné době“, míří jinam: přepnutí evenup.cz ze
  // Seznamu na Resend je jediná proměnná prostředí, nikoli změna kódu. Věta
  // bez ní tvrdí o provozu něco, co může přestat platit bez jediného commitu –
  // a nikdo by si nevšiml, že se tím zásady staly nepravdivými. Aktuální
  // seznam zpracovatelů slibuje `s4.p3` na vyžádání.
  'legal.privacy.s4.li3':
    'Poskytovatel e-mailu – adresa příjemce a obsah zprávy. Na evenup.cz v současné době odesíláme e-maily z adresy noreply@evenup.cz přes SMTP server Seznam.cz (Email Profi); instance provozovaná někým jiným může použít jiného poskytovatele.',
  'legal.privacy.s4.li4':
    'Poskytovatel objektového úložiště – fotky účtenek. Úložiště je kompatibilní s S3; u instance, kterou si provozujete sami, jde o úložiště jejího provozovatele.',
  'legal.privacy.s4.li5':
    'Poskytovatel serverového hostingu – provozuje server s aplikací a databází.',
  'legal.privacy.s4.li6':
    'Google a Apple – jen když se rozhodnete přihlásit jejich účtem. Dostanou informaci o přihlášení; my od nich dostaneme identifikátor, e-mail a jméno.',
  'legal.privacy.s4.p2':
    'Kurzy měn přebíráme z veřejné služby Frankfurter. Posíláme jí jen dvojici měn a datum, nikdy nic o vás.',
  'legal.privacy.s4.p3':
    'Aktuální seznam zpracovatelů včetně konkrétních poskytovatelů úložiště a hostingu vám na vyžádání pošleme.',

  'legal.privacy.s5.h': 'Předávání mimo Evropskou unii',
  'legal.privacy.s5.p1':
    'Fotka účtenky může být zpracována mimo EU – OpenRouter i poskytovatelé modelů působí i ve Spojených státech. Právním základem tohoto předání je váš výslovný souhlas podle čl. 49 odst. 1 písm. a) GDPR. Proto se bez souhlasu sken vůbec nespustí a proto vás na to upozorňujeme dříve, než fotku odešleme.',
  'legal.privacy.s5.p2':
    'Údaje o platbě předáváme Stripu, protože bez toho platbu nelze provést; jde o předání nezbytné pro splnění smlouvy podle čl. 49 odst. 1 písm. b) GDPR.',

  'legal.privacy.s6.h': 'Účtenky a citlivé údaje',
  'legal.privacy.s6.p1':
    'Účtenka toho o vás prozradí víc, než se zdá: kde a kdy jste byli, co jste kupovali, někdy i poslední čtyřčíslí karty. Nákup v lékárně může vypovídat o zdravotním stavu, a to je zvláštní kategorie osobních údajů podle čl. 9 GDPR.',
  'legal.privacy.s6.p2':
    'Proto sken nespustíme, dokud výslovně nesouhlasíte. Souhlas udělujete jednou a kdykoli ho odvoláte v Nastavení. Odvolání zastaví další skenování; už uložené výdaje a účtenky odvoláním nezmizí – smažete je jednotlivě, nebo smazáním účtu.',
  'legal.privacy.s6.p3':
    'Nechcete-li účtenky posílat vůbec, zapisujte položky ručně. Aplikace je bez skenování plně použitelná.',

  'legal.privacy.s7.h': 'Jak dlouho údaje uchováváme',
  // „po {days} dnech“ (lokál), ne „{days} dnů“ (genitiv): RECEIPT_RETENTION_DAYS
  // je nastavitelné proměnnou prostředí, takže hodnoty jako 2, 3 nebo 4 jsou
  // reálné a „2 dnů“ je špatně. Lokál plurálu sedí pro každou hodnotu ≥ 2;
  // rozbije se jedině na 1 („po 1 dnech“ místo „po 1 dni“). Kdyby taková
  // retence měla přijít, musí se řetězec přepsat na `plural()`.
  'legal.privacy.s7.li1':
    'Fotky účtenek: po {days} dnech od naskenování je pravidelná úloha smaže z úložiště.',
  'legal.privacy.s7.li2':
    'Údaje o účtu, skupinách a útratách: dokud je nesmažete, nebo dokud nesmažete účet. Co ve sdílených skupinách zůstává ostatním, popisuje následující oddíl.',
  // Období nevyjadřujeme počtem dnů schválně. Relace vyprší podle nastavení
  // přihlašovací knihovny (dnes výchozích sedm dnů) a `session-cleanup.ts`
  // maže řádky, kterým `expiresAt` uplynul; úlohu spouští denní cron
  // (`api/cron/receipt-cleanup`). Konkrétní číslo by tedy bylo tvrzení o
  // výchozí hodnotě knihovny, které se může změnit bez zásahu do těchto
  // zásad. Takto je věta pravdivá konstrukcí, ne shodou okolností.
  'legal.privacy.s7.li3':
    'Záznamy o přihlášení včetně IP adresy a údajů o prohlížeči: jakmile relace vyprší, smaže záznam pravidelná úloha; smažete-li účet, zaniknou s ním i relace dosud platné.',
  'legal.privacy.s7.li4':
    'Záznamy o zaplacených nákupech a o předplatném: po dobu, kterou vyžadují české účetní a daňové předpisy, i když účet mezitím smažete.',
  'legal.privacy.s7.li5':
    'Záznamy o odeslaných oznámeních: dokud nesmažete účet, pak zanikají s ním.',
  'legal.privacy.s7.li6':
    'Chybové záznamy: uchováváme je pro hledání závad; při smazání účtu z nich odpojíme vaši totožnost.',

  'legal.privacy.s8.h': 'Co se stane, když smažete účet',
  'legal.privacy.s8.p1': 'Účet smažete sami v Nastavení. Smazání proběhne hned a je nevratné.',
  'legal.privacy.s8.p2':
    'Smažeme profil a přihlašovací údaje, propojení s Googlem či Apple, uložené bankovní spojení, nastavení oznámení, souhlas se skenováním i záznamy o čerpání skenů. Skupiny, ve kterých jste byli sami, smažeme celé včetně účtenek a jejich fotek v úložišti.',
  // Smazání účtu sbírá klíče k fotkám jen u skupin, kde je uživatel sám
  // (`account.ts`, podmínka `others === 0`). Ve sdílené skupině tedy přežívá
  // řádek `Receipt` i s `rawJson` – celým výsledkem rozpoznání – a fotka mizí
  // až v běžné retenční lhůtě. Dřívější znění mluvilo jen o útratách a
  // rozdělení a účtenky nezmiňovalo vůbec; mlčení o nich je u žádosti o výmaz
  // to nejhorší možné.
  'legal.privacy.s8.p3':
    'Ve sdílených skupinách zůstává to, co patří ostatním: útraty a rozdělení, které se vás týkaly, ostatní členové dál uvidí. Vaše členství deaktivujeme a odpojíme od účtu a bankovní spojení smažeme, ale jméno, pod kterým jste ve skupině vystupovali, ostatním zůstane – bez něj by jejich vyrovnání nedávalo smysl.',
  'legal.privacy.s8.p3b':
    'Ve sdílené skupině zůstávají i účtenky, které jste do ní naskenovali: záznam o účtence i výsledek jejího rozpoznání jsou podkladem k útratám ostatních, a proto zanikají teprve se skupinou. Fotku smaže pravidelná úloha po {days} dnech od naskenování stejně jako u kterékoli jiné účtenky – smazání účtu ji neodstraní dřív.',
  'legal.privacy.s8.p4':
    'Nesmažeme záznamy o zaplacených nákupech a o předplatném. Jejich uchování nám ukládají účetní a daňové předpisy a čl. 17 odst. 3 písm. b) GDPR nám to umožňuje i tehdy, když požádáte o výmaz.',
  'legal.privacy.s8.p5':
    'Buďme přesní: tyto záznamy sice odpojíme od vašeho účtu, ale anonymní nejsou. Zůstává v nich identifikátor platby a předplatného ze Stripu a podle něj lze v systému Stripe dohledat zákazníka, u kterého je veden váš e-mail. Jde tedy o pseudonymizaci, ne o anonymizaci: stále to jsou osobní údaje a stále je jako osobní údaje chráníme. Uchováváme je proto, že to ukládá zákon – ne proto, že by přestaly být vaše.',

  'legal.privacy.s9.h': 'Vaše práva',
  'legal.privacy.s9.li1':
    'Přístup k údajům a jejich kopie. Kompletní export si stáhnete v Nastavení jedním klepnutím.',
  'legal.privacy.s9.li2': 'Oprava nepřesných údajů.',
  'legal.privacy.s9.li3':
    'Výmaz. Účet smažete v Nastavení; co zůstává a proč, popisuje předchozí oddíl.',
  'legal.privacy.s9.li4':
    'Omezení zpracování a námitka proti zpracování založenému na oprávněném zájmu.',
  'legal.privacy.s9.li5': 'Přenositelnost – export je ve strojově čitelném formátu.',
  'legal.privacy.s9.li6':
    'Odvolání souhlasu se skenováním účtenek, kdykoli a bez následků pro zbytek aplikace.',
  'legal.privacy.s9.p1':
    'Napište nám a ozveme se nejpozději do jednoho měsíce. Nejste-li s vyřízením spokojeni, můžete podat stížnost u Úřadu pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7, www.uoou.gov.cz.',

  'legal.privacy.s10.h': 'Zabezpečení',
  'legal.privacy.s10.li1': 'Spojení s aplikací je vždy šifrované (HTTPS).',
  'legal.privacy.s10.li2':
    'Hesla ukládáme jen jako otisk. Bankovní spojení a klíč ke skenování šifrujeme algoritmem AES-256-GCM.',
  'legal.privacy.s10.li3':
    'K údajům skupiny se dostane jen její člen; oprávnění se ověřuje u každého požadavku.',
  'legal.privacy.s10.li4': 'Můžete si zapnout dvoufázové ověření (TOTP).',
  'legal.privacy.s10.li5':
    'Do oznámení ani chybových záznamů se záměrně nedostane nic, co je šifrované – například bankovní spojení z QR platby.',

  'legal.privacy.s11.h': 'Děti',
  'legal.privacy.s11.p1':
    'Služba není určena osobám mladším 15 let a jejich údaje vědomě nezpracováváme.',

  'legal.privacy.s12.h': 'Změny těchto zásad',
  'legal.privacy.s12.p1':
    'Zásady upravíme, když se změní to, co aplikace dělá. Podstatnou změnu oznámíme e-mailem nebo v aplikaci. Vždy platí znění zveřejněné na této stránce.',

  /* ------------------------------------------------------------ refunds */

  'legal.refunds.title': 'Odstoupení od smlouvy a reklamace',
  'legal.refunds.meta.title': 'Odstoupení a reklamace – dlužníček',
  'legal.refunds.meta.description':
    'Kdy můžete od nákupu odstoupit, proč právo na odstoupení u balíčku skenů zaniká a jak reklamovat, když něco nefunguje.',
  'legal.refunds.intro':
    'Tento dokument popisuje, kdy můžete od nákupu odstoupit, kdy to už nejde a jak si stěžovat, když něco nefunguje. Týká se spotřebitelů – tedy lidí, kteří nenakupují v rámci podnikání.',

  'legal.refunds.s1.h': '14 dnů na rozmyšlenou',
  'legal.refunds.s1.p1':
    'Jako spotřebitel máte u smlouvy uzavřené na dálku právo odstoupit do 14 dnů ode dne jejího uzavření, a to bez udání důvodu. U nás se to týká předplatného VIP i balíčku skenů – s výhradou popsanou hned v dalším oddílu.',

  'legal.refunds.s2.h': 'Balíček skenů: kdy právo na odstoupení zaniká',
  'legal.refunds.s2.p1':
    'Zakoupené skeny jsou digitální obsah, který se připíše okamžitě. Než vás pošleme k platbě, musíte proto zaškrtnout toto prohlášení:',
  // The body between the quotation marks is `vip.credits.ack` in `cs.ts`,
  // verbatim: this is the operative consent wording the customer actually
  // ticks, so it is quoted, not paraphrased. Only the marks are ours — and
  // Czech closes with U+201C, not an ASCII straight quote.
  'legal.refunds.s2.quote':
    '„Souhlasím, aby skeny byly dodány ihned, a beru na vědomí, že tím ztrácím právo na odstoupení od smlouvy do 14 dnů.“',
  'legal.refunds.s2.p2':
    'Bez zaškrtnutí nákup vůbec nezahájíme. Zaškrtnutím výslovně žádáte, abychom začali plnit před uplynutím čtrnáctidenní lhůty, a berete na vědomí, že tím právo na odstoupení podle § 1837 občanského zákoníku zaniká. Datum a čas tohoto souhlasu si ukládáme k záznamu o nákupu.',
  'legal.refunds.s2.p3':
    'Právo na odstoupení tedy u balíčku skenů zaniká okamžikem, kdy se skeny připíšou. Nefunguje-li něco, jak má, nejde o odstoupení, ale o reklamaci – tu můžete uplatnit vždy.',

  'legal.refunds.s3.h': 'Předplatné VIP',
  'legal.refunds.s3.p1':
    'U předplatného souhlas s okamžitým plněním nevyžadujeme, takže vám právo odstoupit do 14 dnů od uzavření smlouvy zůstává. Odstoupíte-li v této lhůtě, vrátíme vám cenu za právě zaplacené období.',
  'legal.refunds.s3.p2':
    'Předplatné se automaticky obnovuje na další období. Chcete-li se obnovení vyhnout, zrušte ho dříve, než období skončí.',
  'legal.refunds.s3.p3':
    'Předplatné začíná {trialDays}denním zkušebním obdobím zdarma. Zrušíte-li ho v jeho průběhu, neplatíte nic – není tedy co vracet.',
  // Tohle je jádro věci a nesmí se to změkčit.
  //
  // Čtrnáctidenní lhůta k odstoupení (§ 1829 občanského zákoníku, směrnice
  // 2011/83/EU) běží od uzavření smlouvy, ne od první platby. Objednávka den 0
  // → konec zkušebního období den 7 → první platba den 8, tedy uvnitř lhůty.
  // Spotřebitel, který odstoupí desátý den, má na vrácení této platby nárok.
  // Kdyby text naznačil opak – že zkušební období lhůtu k odstoupení posouvá
  // nebo zkracuje –, byl by to nepravdivý údaj o zákonném právu, a takové
  // ujednání je navíc samo o sobě neplatné.
  //
  // Vědomě tu nestojí „ani ji nespotřebovává“: při sedmidenním zkušebním
  // období sedm ze čtrnácti dnů uplyne, což hned další věta potvrzuje. Stejně
  // vědomě tu není ani aritmetika („po skončení vám zbývá 7 dní“) – ta by
  // přestala platit pro jakoukoli hodnotu `TRIAL_PERIOD_DAYS` od 14 výš.
  'legal.refunds.s3.p4':
    'Zkušební období nemá na čtrnáctidenní lhůtu k odstoupení žádný vliv – nezkracuje ji ani neodkládá její začátek. Lhůta k odstoupení běží ode dne uzavření smlouvy, tedy ode dne objednávky, ne ode dne první platby. Protože první platbu strháváme až po skončení zkušebního období, spadá i tato platba ještě do čtrnáctidenní lhůty k odstoupení.',
  // Žádná srážka, a to schválně. Poměrná část ceny podle § 1834 přichází
  // v úvahu jen tam, kde plnění začalo na výslovnou žádost spotřebitele – a tu
  // u předplatného nevybíráme, jak říká `p1` o dvě věty výš a jak to dělá
  // `checkoutSubscription` (na rozdíl od `checkoutCredits` po ničem takovém
  // nesahá). Bez takové žádosti spotřebitel podle čl. 14 odst. 4 písm. a) bodu
  // ii) směrnice 2011/83/EU nehradí nic. Srážka by navíc odporovala `p1`, kde
  // slibujeme cenu za právě zaplacené období zpátky bez výhrad – a je to věta,
  // kterou nám zákazník ocituje. Nic v repozitáři ostatně poměrnou část
  // nepočítá; jediné `refund*` je `refundCredit`, což vrací sken po
  // nepovedeném OCR.
  'legal.refunds.s3.p5':
    'Odstoupíte-li od smlouvy po první platbě a ještě ve čtrnáctidenní lhůtě, peníze vám vrátíme.',

  'legal.refunds.s4.h': 'Zrušení předplatného není odstoupení',
  'legal.refunds.s4.p1':
    'Zrušení ukončí jenom další obnovování. Do konce právě zaplaceného období vám VIP běží dál a poměrnou část ceny nevracíme. Zrušíte ho v aplikaci tlačítkem „Spravovat předplatné“, které vás přesměruje do zákaznického portálu Stripe.',

  'legal.refunds.s5.h': 'Jak odstoupit',
  'legal.refunds.s5.p1':
    'Stačí nám napsat. Uveďte e-mail, kterým jste se registrovali, co jste koupili a kdy. Formulář nepotřebujete, ale může vám pomoci toto znění:',
  // Uvozovky jsou tu proto, že je má i `s2.quote` (kde jsou navíc doslovným
  // přepisem zaškrtávacího prohlášení z aplikace) a obojí se vykresluje stejným
  // blockquotem – jinak by jedna citace uvozovky měla a druhá ne.
  'legal.refunds.s5.quote':
    '„Oznamuji, že odstupuji od smlouvy o poskytnutí služby dlužníček uzavřené dne (datum nákupu), e-mail účtu (vaše adresa). Žádám o vrácení zaplacené částky.“',
  'legal.refunds.s5.p2':
    'Peníze vrátíme do 14 dnů od doručení odstoupení, a to stejným způsobem, jakým jste platili – tedy zpět přes Stripe na kartu nebo účet, ze kterého platba přišla.',

  'legal.refunds.s6.h': 'Když něco nefunguje',
  'legal.refunds.s6.p1':
    'Nepovedený sken hrazený z balíčku se vám automaticky vrátí zpět, hlásit ho nemusíte. Když se ale sken nedaří opakovaně, placená funkce není dostupná nebo se vám něco strhlo omylem, napište nám.',
  'legal.refunds.s6.p2':
    'Reklamaci vyřídíme nejpozději do 30 dnů od jejího uplatnění a o výsledku vás vyrozumíme.',
  'legal.refunds.s6.p3':
    'Rozpoznání účtenky je automatické a nemusí být vždy přesné. Nepřesně přečtená položka sama o sobě není vada služby – proto vás aplikace nechá položky před uložením zkontrolovat a opravit.',

  'legal.refunds.s7.h': 'Nevyčerpané skeny',
  'legal.refunds.s7.p1':
    'Zakoupené skeny nevyprší a zůstávají na účtu, dokud je nevyužijete nebo dokud účet nesmažete. Po zániku práva na odstoupení je zpětně neproplácíme.',

  'legal.refunds.s8.h': 'Mimosoudní řešení sporů',
  'legal.refunds.s8.p1':
    'Nedohodneme-li se, můžete se jako spotřebitel obrátit na Českou obchodní inspekci, která je subjektem mimosoudního řešení spotřebitelských sporů (www.coi.cz). Řízení je pro spotřebitele bezplatné a návrh podáte nejpozději do jednoho roku ode dne, kdy jste u nás své právo uplatnili poprvé.',

  /* ------------------------------------------------------------ contact */

  'legal.contact.title': 'Kontakt',
  'legal.contact.meta.title': 'Kontakt – dlužníček',
  'legal.contact.meta.description':
    'Kontaktní údaje provozovatele dlužníčka, adresa pro dotazy, reklamace a žádosti podle GDPR a příslušné dozorové úřady.',
  'legal.contact.intro': 'Napište nám. Odpovídáme česky i anglicky.',

  'legal.contact.s1.h': 'Provozovatel',

  'legal.contact.s2.h': 'E-mail',
  'legal.contact.s2.p1':
    'Na support@evenup.cz řešíme všechno: dotazy k aplikaci, platby, reklamace, odstoupení od smlouvy i žádosti podle GDPR.',
  'legal.contact.s2.p2':
    'Automatické e-maily – ověření adresy, obnovení hesla, oznámení o dění ve skupině – chodí z adresy noreply@evenup.cz. Na tu neodpovídejte, nikdo ji nečte.',

  'legal.contact.s3.h': 'Osobní údaje',
  'legal.contact.s3.p1':
    'Žádosti o přístup, opravu nebo výmaz vyřizujeme na stejné adrese a ozveme se nejpozději do jednoho měsíce. Export dat i smazání účtu zvládnete sami v Nastavení. Dozorovým úřadem je Úřad pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7, www.uoou.gov.cz.',

  'legal.contact.s4.h': 'Spotřebitelské spory',
  'legal.contact.s4.p1':
    'Mimosoudní řešení spotřebitelských sporů vede Česká obchodní inspekce, www.coi.cz.',

  'legal.contact.s5.h': 'Právní dokumenty',
} as const;

export type LegalKey = keyof typeof legalCs;
/** Every locale must provide exactly these keys, each mapping to a string. */
export type LegalMessages = Record<LegalKey, string>;

export const legalEn: LegalMessages = {
  /* ------------------------------------------------------------- shared */

  'legal.draft.title': 'Draft — pending qualified legal review',
  'legal.draft.body':
    'This document is a draft written against how the application actually behaves. It has not been reviewed by a qualified lawyer and is not legal advice. It will be reviewed before live payments are switched on.',

  'legal.effective': 'Version of {date}',

  'legal.nav.terms': 'Terms of service',
  'legal.nav.privacy': 'Privacy policy',
  'legal.nav.refunds': 'Withdrawal and complaints',
  'legal.nav.contact': 'Contact',
  'legal.nav.title': 'Legal',

  'legal.entity.name': 'Business name',
  'legal.entity.ico': 'Company number (IČO)',
  'legal.entity.address': 'Registered address',
  'legal.entity.email': 'Email',
  'legal.entity.missing.title': 'Operator details are not configured',
  'legal.entity.missing.body':
    'The business name, company number and registered address are read from the LEGAL_ENTITY_NAME, LEGAL_ENTITY_ICO and LEGAL_ENTITY_ADDRESS environment variables, which must be set before the application is built. Until they are, this page satisfies neither consumer-information law nor GDPR Art. 13.',

  'legal.email.cta': 'Email support@evenup.cz',

  /* -------------------------------------------------------------- terms */

  'legal.terms.title': 'Terms of service',
  'legal.terms.meta.title': 'Terms of service — EvenUp',
  'legal.terms.meta.description':
    'The terms for using EvenUp: what is free, how the subscription and scan packs work, how to cancel, and what your rights are.',
  'legal.terms.intro':
    'These terms govern your use of EvenUp at evenup.cz. By using the service you agree to them. If anything is unclear, write to us — we are happy to explain.',

  'legal.terms.s1.h': 'Who operates the service',
  'legal.terms.s1.p1':
    'The service is operated by the operator identified below. For anything concerning these terms, contact us at the address given.',

  'legal.terms.s2.h': 'What EvenUp does',
  'legal.terms.s2.p1':
    'EvenUp records who paid for what within a group and works out the smallest number of payments that settles everyone. It can read a receipt from a photo, convert foreign currency at the rate for the date of the expense, and prepare a code in the Czech QR Platba standard.',
  'legal.terms.s2.p2':
    'EvenUp never sends or holds money itself. We are not a bank or a payment institution. The QR code is only a pre-filled instruction for your bank — you enter and confirm the payment yourself. The calculations are informational and are not a substitute for accounting or tax advice.',

  'legal.terms.s3.h': 'Your account',
  'legal.terms.s3.p1':
    'You need an account to run a group of your own. You create one with an email address and password, or through Google or Apple where the instance has them enabled. Give accurate details and keep your credentials to yourself.',
  'legal.terms.s3.p2': 'The service is not intended for anyone under 15.',
  'legal.terms.s3.p3':
    'You can add group members without an account, by name alone. If you add someone under a name that identifies them, tell them — their name and the amounts falling to them are visible to the other members.',
  'legal.terms.s3.p4':
    'We may suspend or close an account used in breach of these terms or of the law.',

  'legal.terms.s4.h': 'What is free and what is paid',
  'legal.terms.s4.p1':
    'Groups, expenses, debt settlement, QR payments and members without accounts are free and unlimited. You only pay for scanning receipts.',
  'legal.terms.s4.li1':
    'VIP subscription: {scans} receipt scans per billing period. Photos of scanned receipts stay saved so you can look back at them; {days} days after the scan we delete them.',
  'legal.terms.s4.li2':
    'Scan pack: a one-off purchase with no subscription. Purchased scans do not expire.',
  'legal.terms.s4.p2':
    'Scans are used in this order: the subscription allowance first, and only once it is exhausted do purchased scans come off a pack. Unused allowance does not carry into the next period; purchased scans stay until you use them.',
  'legal.terms.s4.p3':
    'Storing photos belongs to the subscription: while yours is running we store a photo for every scan — including one paid for from a pack after the allowance runs out. Without a subscription, a scan paid for from a pack stores no photo, and only the recognised line items stay with the expense.',
  'legal.terms.s4.p4':
    'If a scan paid for from a pack fails, it is returned to your scan balance automatically and you can enter the receipt by hand.',
  'legal.terms.s4.p5':
    'On an instance you run yourself with no Stripe connection, paid features are never offered and scanning is not metered at all.',

  'legal.terms.s5.h': 'Prices and payment',
  'legal.terms.s5.p1':
    'Prices are listed on the home page. Czech pages are priced in korunas, English pages in euros.',
  'legal.terms.s5.p2':
    'Payments are handled by Stripe. Card details go straight to Stripe and never reach us. The amount that governs is the one Stripe shows you at the moment of payment.',
  'legal.terms.s5.p3':
    'A scan pack is a single payment. A subscription renews automatically for a further period until you cancel it.',
  'legal.terms.s5.p4':
    'A VIP subscription starts with a {trialDays}-day free trial. You enter your card details when you order, but nothing is charged for the duration of the trial — the first payment is taken once it ends, and only if you have not cancelled by then.',
  'legal.terms.s5.p5':
    'The trial is offered once. If you have had a VIP subscription with us before, your next one starts as a paid subscription straight away.',

  'legal.terms.s6.h': 'Cancelling a subscription',
  'legal.terms.s6.p1':
    'You can cancel at any time in the app with the Manage subscription button, which takes you to the Stripe customer portal. Cancellation takes effect at the end of the period you have already paid for — until then the subscription keeps running.',
  'legal.terms.s6.p1b':
    'If you cancel during the free trial, the subscription ends when the trial does and nothing is charged.',
  'legal.terms.s6.p2':
    'Cancelling is not the same as withdrawing from the contract. Withdrawal and complaints are covered by a separate document.',

  'legal.terms.s7.h': 'Withdrawal from the contract',
  'legal.terms.s7.p1':
    'As a consumer you generally have 14 days to withdraw from a distance contract. For a scan pack that right is lost once you agree to immediate delivery at checkout. The details are in the withdrawal and complaints document.',

  'legal.terms.s8.h': 'Scanning receipts',
  'legal.terms.s8.p1':
    'We send the photo or PDF of a receipt to an AI provider that reads the line items from it. No scan runs without your explicit consent, and you can withdraw that consent at any time in Settings.',
  'legal.terms.s8.p2':
    'Recognition is automatic and may be wrong. Always check the items and the total before you save a receipt. We are not liable for loss caused by saving a receipt that was read incorrectly.',
  'legal.terms.s8.p3':
    'Only upload receipts for your own spending, and nothing you are not allowed to share.',

  'legal.terms.s9.h': 'Rules of use',
  'legal.terms.s9.li1':
    'Do not disrupt the service, circumvent its limits, or access it automatically beyond ordinary use.',
  'legal.terms.s9.li2':
    'Do not upload unlawful content, or other people’s personal data you have no reason to share.',
  'legal.terms.s9.li3': 'Do not use the service in ways that harm other users or us.',

  'legal.terms.s10.h': 'Availability',
  'legal.terms.s10.p1':
    'We try to keep the service running at all times, but we do not guarantee uninterrupted operation. Maintenance, updates or an outage at a provider can make it temporarily unavailable. If a longer outage stopped you using a paid feature, write to us and we will sort it out individually.',

  'legal.terms.s11.h': 'Liability',
  'legal.terms.s11.p1':
    'The service is provided as is. We are not responsible for the decisions you make on the basis of its calculations, nor for the settlement between you and the other members of a group — you send the money yourselves, outside the service.',
  'legal.terms.s11.p2':
    'None of this limits our liability where the law does not allow it to be limited — in particular liability for harm caused intentionally or by gross negligence, and consumer rights arising from defective performance.',

  'legal.terms.s12.h': 'Open source',
  'legal.terms.s12.p1':
    'EvenUp is open source under the MIT licence. The licence covers the source code; these terms cover the service operated at evenup.cz. If you run your own instance, you are its operator and these terms do not apply to it.',

  'legal.terms.s13.h': 'Changes to these terms',
  'legal.terms.s13.p1':
    'We may change these terms — when a feature is added or prices change, for example. We will announce a material change by email or in the app, in advance. If you do not agree with it, you can cancel your subscription and delete your account.',

  'legal.terms.s14.h': 'Governing law and disputes',
  'legal.terms.s14.p1':
    'The relationship is governed by Czech law, in particular the Civil Code and the Consumer Protection Act. This does not affect the rights the law of your country of habitual residence gives you as a consumer.',
  'legal.terms.s14.p2':
    'We will try to settle any dispute by agreement — just write to us. As a consumer you may also turn to the Czech Trade Inspection Authority, which is the competent body for out-of-court resolution of consumer disputes (www.coi.cz).',

  /* ------------------------------------------------------------ privacy */

  'legal.privacy.title': 'Privacy policy',
  'legal.privacy.meta.title': 'Privacy policy — EvenUp',
  'legal.privacy.meta.description':
    'What data EvenUp processes, who it is passed to, how long it is kept, and what happens to it when you delete your account.',
  'legal.privacy.intro':
    'This page sets out what data EvenUp processes about you, why, who it goes to and how long we keep it. It is written against what the application actually does — not from a template.',

  'legal.privacy.s1.h': 'Who the controller is',
  'legal.privacy.s1.p1': 'The controller of your personal data is the operator of the service:',
  'legal.privacy.s1.p2':
    'We have not appointed a data protection officer. For anything concerning personal data, write to the address above.',

  'legal.privacy.s2.h': 'What data we process',
  'legal.privacy.s2.p1': 'We process only what the application needs in order to work.',
  'legal.privacy.s2.li1':
    'Account: email address, name, language, default currency and, if you set one, a profile photo. Passwords are stored only as a hash, never in readable form. Purpose: running your account and signing you in. Legal basis: performance of the contract. Kept for as long as the account exists.',
  'legal.privacy.s2.li2':
    'Sign-in: a session record including your IP address and browser details. Purpose: keeping you signed in and spotting misuse. Legal basis: our legitimate interest in security. The record lasts as long as the session is valid, and at the latest ends when you delete your account.',
  'legal.privacy.s2.li3':
    'Groups and expenses: group names, member names, amounts, currencies, categories, notes and the change history. Purpose: the application itself. Legal basis: performance of the contract. Kept until you delete the individual records. A group can be archived but not deleted; groups where you are the only member go when you delete the account.',
  'legal.privacy.s2.li4':
    'Bank details: the account number or IBAN you save for QR payments. Stored encrypted (AES-256-GCM). Purpose: pre-filling a QR payment. Legal basis: performance of the contract. Deleted with your account.',
  'legal.privacy.s2.li5':
    'Receipts: the photo or PDF of a receipt and the data read from it — merchant, line items, amounts, date. The photo is deleted automatically {days} days after the scan. The recognised items stay with the expense until you delete the expense; deleting it does not remove the receipt record itself, though — a second copy of the recognition result stays with that record and goes only with the group. Legal basis: consent for sending it to be read, performance of the contract for storing the result.',
  'legal.privacy.s2.li6':
    'Payments: your Stripe customer identifier, subscription status, scan balance and the records of scans bought and used. Purpose: unlocking paid features and accounting. Legal basis: performance of the contract and compliance with a legal obligation.',
  'legal.privacy.s2.li7':
    'Scanning consent: the date and time you gave it. Purpose: being able to demonstrate that consent existed. Legal basis: compliance with a legal obligation.',
  'legal.privacy.s2.li8':
    'Email: the recipient address and message content for email verification, password resets and notifications about group activity. Notifications deliberately never carry bank details.',
  'legal.privacy.s2.li9':
    'Error records: the error code and text, the name of the operation called, and the identifier of the user it happened to. Passwords and encryption keys are never written to them, and we deliberately do not write request inputs into them; the text of an unexpected error, though, is taken from whatever system raised it, and that can occasionally carry a fragment of the data being processed. Purpose: fixing faults.',

  'legal.privacy.s3.h': 'Cookies',
  'legal.privacy.s3.p1':
    'We use strictly necessary cookies only: a sign-in cookie that keeps you logged in, and — when you sign in with Google or Apple — a short-lived cookie that protects the redirect. There is no analytics, advertising or tracking script anywhere in the app, which is why there is no cookie banner: there would be nothing to consent to.',
  'legal.privacy.s3.p2':
    'Your browser’s local storage holds one interface detail: which duplicate-member hints you have dismissed. It is never sent anywhere.',

  'legal.privacy.s4.h': 'Who we pass data to',
  'legal.privacy.s4.p1':
    'We do not sell data. We pass it only to processors without which the service would not work:',
  'legal.privacy.s4.li1':
    'OpenRouter — the photo or PDF of the receipt and the instruction to read it. OpenRouter is a router: it forwards the request to the provider of the particular model, so further processors are engaged beyond it and processing may take place outside the European Union.',
  'legal.privacy.s4.li2':
    'Stripe — your email address, customer identifier and payment and subscription details. Card details go straight to Stripe.',
  'legal.privacy.s4.li3':
    'An email provider — the recipient address and message content. On evenup.cz we currently send mail from noreply@evenup.cz through the SMTP server of Seznam.cz (Email Profi); an instance run by somebody else may use a different provider.',
  'legal.privacy.s4.li4':
    'An object storage provider — receipt photos. The storage is S3-compatible; on an instance you run yourself it is that operator’s own storage.',
  'legal.privacy.s4.li5':
    'A server hosting provider — runs the machine hosting the application and the database.',
  'legal.privacy.s4.li6':
    'Google and Apple — only if you choose to sign in with their account. They learn that you signed in; we receive an identifier, email address and name.',
  'legal.privacy.s4.p2':
    'Exchange rates come from the public Frankfurter service. We send it a currency pair and a date, never anything about you.',
  'legal.privacy.s4.p3':
    'We will send you the current list of processors, including the specific storage and hosting providers, on request.',

  'legal.privacy.s5.h': 'Transfers outside the European Union',
  'legal.privacy.s5.p1':
    'A receipt photo may be processed outside the EU — OpenRouter and the model providers operate in the United States among other places. The legal basis for that transfer is your explicit consent under GDPR Art. 49(1)(a). That is why no scan runs without consent, and why we tell you before the photo is sent.',
  'legal.privacy.s5.p2':
    'Payment data goes to Stripe because a payment cannot be made otherwise; that is a transfer necessary for performance of the contract under GDPR Art. 49(1)(b).',

  'legal.privacy.s6.h': 'Receipts and sensitive data',
  'legal.privacy.s6.p1':
    'A receipt reveals more than it looks like it does: where you were and when, what you bought, sometimes the last four digits of a card. A pharmacy purchase can say something about your health, which is a special category of personal data under GDPR Art. 9.',
  'legal.privacy.s6.p2':
    'That is why no scan runs until you explicitly agree. You give consent once and can withdraw it at any time in Settings. Withdrawal stops further scanning; it does not remove expenses and receipts already saved — delete those individually, or by deleting the account.',
  'legal.privacy.s6.p3':
    'If you would rather not send receipts at all, enter the items by hand. The application is fully usable without scanning.',

  'legal.privacy.s7.h': 'How long we keep data',
  'legal.privacy.s7.li1':
    'Receipt photos: {days} days after the scan a scheduled job deletes them from storage.',
  'legal.privacy.s7.li2':
    'Account, group and expense data: until you delete it, or until you delete the account. What stays with the other members of a shared group is set out in the next section.',
  'legal.privacy.s7.li3':
    'Sign-in records, including your IP address and browser details: once a session expires a scheduled job deletes the record; if you delete your account, any still-valid sessions go with it.',
  'legal.privacy.s7.li4':
    'Records of completed purchases and subscriptions: for as long as Czech accounting and tax law requires, even if you delete the account in the meantime.',
  'legal.privacy.s7.li5':
    'Records of notifications sent: until you delete the account, at which point they go with it.',
  'legal.privacy.s7.li6':
    'Error records: kept for fault-finding; deleting your account detaches your identity from them.',

  'legal.privacy.s8.h': 'What happens when you delete your account',
  'legal.privacy.s8.p1':
    'You delete the account yourself in Settings. It takes effect immediately and cannot be undone.',
  'legal.privacy.s8.p2':
    'We delete your profile and credentials, any Google or Apple link, saved bank details, notification settings, your scanning consent and the records of scans used. Groups where you were the only member are deleted entirely — receipts included, and their photos removed from storage.',
  'legal.privacy.s8.p3':
    'In shared groups, what belongs to the others stays: the expenses and splits that involved you remain visible to them. Your membership is deactivated and detached from the account and your bank details are deleted, but the name you appeared under in the group remains — without it their settlement would stop making sense.',
  'legal.privacy.s8.p3b':
    'Receipts you scanned into a shared group stay as well: the receipt record and the result of reading it are the evidence behind the other members’ expenses, so they go only when the group does. The scheduled job deletes the photo {days} days after the scan, exactly as it does for any other receipt — deleting your account does not remove it any sooner.',
  'legal.privacy.s8.p4':
    'We do not delete the records of completed purchases and subscriptions. Accounting and tax law requires us to keep them, and GDPR Art. 17(3)(b) permits that even against a request for erasure.',
  'legal.privacy.s8.p5':
    'To be precise: those records are detached from your account, but they are not anonymous. They keep the Stripe payment and subscription identifiers, and in Stripe those resolve to a customer record holding your email address. This is pseudonymisation, not anonymisation: they remain personal data and we keep protecting them as personal data. We hold them because the law requires it — not because they have stopped being yours.',

  'legal.privacy.s9.h': 'Your rights',
  'legal.privacy.s9.li1':
    'Access to your data and a copy of it. A complete export is one click away in Settings.',
  'legal.privacy.s9.li2': 'Rectification of inaccurate data.',
  'legal.privacy.s9.li3':
    'Erasure. You delete the account in Settings; what stays and why is set out in the previous section.',
  'legal.privacy.s9.li4':
    'Restriction of processing, and objection to processing based on legitimate interest.',
  'legal.privacy.s9.li5': 'Portability — the export is in a machine-readable format.',
  'legal.privacy.s9.li6':
    'Withdrawal of your consent to receipt scanning, at any time and with no consequences for the rest of the app.',
  'legal.privacy.s9.p1':
    'Write to us and we will respond within one month at the latest. If you are not satisfied with how we handled it, you can complain to the Czech Office for Personal Data Protection, Pplk. Sochora 27, 170 00 Prague 7, www.uoou.gov.cz.',

  'legal.privacy.s10.h': 'Security',
  'legal.privacy.s10.li1': 'Connections to the application are always encrypted (HTTPS).',
  'legal.privacy.s10.li2':
    'Passwords are stored only as a hash. Bank details and the scanning key are encrypted with AES-256-GCM.',
  'legal.privacy.s10.li3':
    'Only a member can reach a group’s data; the check runs on every request.',
  'legal.privacy.s10.li4': 'You can turn on two-factor authentication (TOTP).',
  'legal.privacy.s10.li5':
    'Anything encrypted at rest is deliberately kept out of notifications and error records — a bank account from a QR payment, for instance.',

  'legal.privacy.s11.h': 'Children',
  'legal.privacy.s11.p1':
    'The service is not intended for anyone under 15 and we do not knowingly process their data.',

  'legal.privacy.s12.h': 'Changes to this policy',
  'legal.privacy.s12.p1':
    'We will update this policy when what the application does changes. We will announce a material change by email or in the app. The version published on this page is always the one in force.',

  /* ------------------------------------------------------------ refunds */

  'legal.refunds.title': 'Withdrawal and complaints',
  'legal.refunds.meta.title': 'Withdrawal and complaints — EvenUp',
  'legal.refunds.meta.description':
    'When you can withdraw from a purchase, why the right is lost for a scan pack, and how to complain when something does not work.',
  'legal.refunds.intro':
    'This document sets out when you can withdraw from a purchase, when you no longer can, and how to complain when something does not work. It applies to consumers — people not buying in the course of a business.',

  'legal.refunds.s1.h': '14 days to change your mind',
  'legal.refunds.s1.p1':
    'As a consumer you have the right to withdraw from a distance contract within 14 days of concluding it, without giving a reason. Here that covers both the VIP subscription and a scan pack — subject to the exception in the next section.',

  'legal.refunds.s2.h': 'Scan packs: when the right to withdraw is lost',
  'legal.refunds.s2.p1':
    'Purchased scans are digital content credited immediately. That is why, before we send you to pay, you have to tick this statement:',
  'legal.refunds.s2.quote':
    '“I agree the scans are delivered immediately, and I understand this means I lose my right to withdraw within 14 days.”',
  'legal.refunds.s2.p2':
    'Without the tick the purchase does not start at all. By ticking it you expressly ask us to begin performance before the 14-day period expires and acknowledge that the right to withdraw under § 1837 of the Czech Civil Code is thereby lost. We store the date and time of that consent alongside the purchase record.',
  'legal.refunds.s2.p3':
    'So for a scan pack the right to withdraw ends the moment the scans are credited. If something does not work as it should, that is not withdrawal but a complaint — and the right to complain always stands.',

  'legal.refunds.s3.h': 'The VIP subscription',
  'legal.refunds.s3.p1':
    'We do not ask for immediate-performance consent for the subscription, so your right to withdraw within 14 days of concluding the contract stays intact. If you withdraw within that period, we return the price of the period you have paid for.',
  'legal.refunds.s3.p2':
    'The subscription renews automatically for a further period. If you want to avoid a renewal, cancel before the period ends.',
  'legal.refunds.s3.p3':
    'The subscription starts with a {trialDays}-day free trial. Cancel during it and you pay nothing, so there is nothing to refund.',
  'legal.refunds.s3.p4':
    'The trial has no effect on the 14-day withdrawal period — it does not shorten it or delay its start. The withdrawal period runs from the day the contract is concluded, that is the day you order, not the day of the first payment. Because we take the first payment only after the trial ends, that payment still falls inside it.',
  'legal.refunds.s3.p5':
    'If you withdraw after the first payment and still within the 14 days, we refund it.',

  'legal.refunds.s4.h': 'Cancelling is not withdrawing',
  'legal.refunds.s4.p1':
    'Cancelling only stops further renewals. VIP keeps running to the end of the period you have already paid for, and we do not refund a proportionate part of it. You cancel in the app with the Manage subscription button, which takes you to the Stripe customer portal.',

  'legal.refunds.s5.h': 'How to withdraw',
  'legal.refunds.s5.p1':
    'Just write to us. Give the email address you registered with, what you bought and when. No form is required, but this wording may help:',
  'legal.refunds.s5.quote':
    '“I hereby give notice that I withdraw from the contract for the supply of the EvenUp service concluded on (date of purchase), account email (your address). I request a refund of the amount paid.”',
  'legal.refunds.s5.p2':
    'We return the money within 14 days of receiving your withdrawal, by the same means you paid — that is, back through Stripe to the card or account the payment came from.',

  'legal.refunds.s6.h': 'When something does not work',
  'legal.refunds.s6.p1':
    'A failed scan paid for from a pack is returned to your scan balance automatically; you do not need to report it. But if scans keep failing, a paid feature is unavailable, or you were charged by mistake, write to us.',
  'legal.refunds.s6.p2':
    'We will deal with a complaint within 30 days of it being made and let you know the outcome.',
  'legal.refunds.s6.p3':
    'Receipt recognition is automatic and will not always be accurate. A misread line item is not in itself a defect in the service — which is why the app always lets you check and correct the items before saving.',

  'legal.refunds.s7.h': 'Unused scans',
  'legal.refunds.s7.p1':
    'Purchased scans do not expire and stay on your account until you use them or delete the account. Once the right to withdraw has lapsed, we do not buy them back.',

  'legal.refunds.s8.h': 'Out-of-court dispute resolution',
  'legal.refunds.s8.p1':
    'If we cannot agree, as a consumer you may turn to the Czech Trade Inspection Authority, which is the competent body for out-of-court resolution of consumer disputes (www.coi.cz). The procedure is free for consumers and you may file within one year of first raising the matter with us.',

  /* ------------------------------------------------------------ contact */

  'legal.contact.title': 'Contact',
  'legal.contact.meta.title': 'Contact — EvenUp',
  'legal.contact.meta.description':
    'Contact details for the operator of EvenUp, the address for questions, complaints and GDPR requests, and the relevant supervisory authorities.',
  'legal.contact.intro': 'Write to us. We answer in Czech and in English.',

  'legal.contact.s1.h': 'Operator',

  'legal.contact.s2.h': 'Email',
  'legal.contact.s2.p1':
    'support@evenup.cz handles everything: questions about the app, payments, complaints, withdrawal from a contract and GDPR requests.',
  'legal.contact.s2.p2':
    'Automated email — address verification, password resets, notifications about group activity — comes from noreply@evenup.cz. Do not reply to it; nobody reads that mailbox.',

  'legal.contact.s3.h': 'Personal data',
  'legal.contact.s3.p1':
    'Requests for access, rectification or erasure are handled at the same address and we respond within one month at the latest. You can also export your data and delete your account yourself in Settings. The supervisory authority is the Czech Office for Personal Data Protection, Pplk. Sochora 27, 170 00 Prague 7, www.uoou.gov.cz.',

  'legal.contact.s4.h': 'Consumer disputes',
  'legal.contact.s4.p1':
    'Out-of-court resolution of consumer disputes is run by the Czech Trade Inspection Authority, www.coi.cz.',

  'legal.contact.s5.h': 'Legal documents',
};
