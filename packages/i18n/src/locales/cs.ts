/**
 * Czech message catalog — the **default** language and the source-of-truth shape.
 * Every other locale must provide exactly these keys. (FR-10.1)
 *
 * Placeholders use `{name}` syntax and are filled by the `t()` interpolator.
 */
export const cs = {
  'app.name': 'dlužníček',
  'app.tagline': 'Spravedlivé dělení nákladů ve skupině',

  'common.save': 'Uložit',
  'common.saved': 'Uloženo',
  'common.cancel': 'Zrušit',
  'common.delete': 'Smazat',
  'common.edit': 'Upravit',
  'common.add': 'Přidat',
  'common.back': 'Zpět',
  'common.confirm': 'Potvrdit',
  'common.loading': 'Načítání…',
  'common.retry': 'Zkusit znovu',
  'common.search': 'Hledat',
  'common.required': 'Povinné',
  'common.optional': 'Nepovinné',
  'common.total': 'Celkem',
  'common.or': 'nebo',
  'common.showAll': 'Zobrazit vše',
  'common.language': 'Jazyk',
  'transactions.showMore': 'Zobrazit další transakce',
  'settings.apiKey': 'API klíč',
  'qr.alt': 'QR platba',

  // Server (tRPC) error messages — matched to the English thrown text and
  // localized in the tRPC errorFormatter so the client shows them translated.
  'errors.authRequired': 'Vyžadováno přihlášení',
  'errors.adminRequired': 'Vyžadován administrátorský přístup',
  'errors.groupNotFound': 'Skupina nenalezena',
  'errors.notGroupMember': 'Nejste členem této skupiny',
  'errors.categoryNotFound': 'Kategorie nenalezena',
  'errors.categoryExists': 'Kategorie s tímto názvem už existuje',
  'errors.cannotChangeOwnAdmin': 'Nemůžete změnit svůj vlastní administrátorský status.',
  'errors.cannotDisableOwn': 'Nemůžete deaktivovat svůj vlastní účet.',
  'errors.cannotDeleteOwnHere': 'Svůj účet zde nelze smazat; použijte nastavení.',
  'errors.memberNotFound': 'Člen nenalezen',
  'errors.invalidIban': 'Neplatný IBAN',
  'errors.recipientNoIban': 'Příjemce nemá uložený IBAN; vyrovnejte hotově nebo ručně.',
  'errors.tooManyScans': 'Příliš mnoho skenování účtenek; chvíli počkejte a zkuste to znovu.',
  'errors.noSharedKey': 'Není nastaven sdílený OpenRouter klíč; požádejte administrátora.',
  'errors.noScansRemaining': 'Nemáte žádné skeny. Předplaťte si VIP nebo dokupte kredit.',
  'errors.ocrConsentRequired':
    'Skenování účtenek vyžaduje váš souhlas s odesláním obrázku našemu poskytovateli OCR.',
  'errors.inviteNotFound': 'Pozvánka nenalezena',
  'errors.inviteExpired': 'Platnost pozvánky vypršela',
  'errors.inviteLimitReached': 'Byl dosažen limit použití pozvánky',
  'errors.memberAlreadyClaimed': 'Tento člen už byl obsazen',
  'errors.invalidAccountNumber': 'Neplatné číslo účtu',
  'errors.unknownCategory': 'Neznámá kategorie',
  'errors.addMembersBeforeImport': 'Před importem přidejte členy',
  'errors.payerNotMember': 'Plátce není členem skupiny',
  'errors.payersTotalMismatch': 'Součet plateb neodpovídá celkové částce.',
  'errors.billingNotConfigured': 'Platby nejsou na této instanci nastavené.',
  'errors.acknowledgeImmediate': 'Potvrďte okamžité dodání a pokračujte.',
  'errors.unknownPack': 'Neznámý balíček kreditů.',
  'errors.subscriptionExists': 'Předplatné už máte, spravujte ho v zákaznickém portálu.',

  'auth.continueGoogle': 'Pokračovat přes Google',
  'auth.continueApple': 'Pokračovat přes Apple',
  'auth.email': 'Email',
  'auth.password': 'Heslo',
  'auth.signInBtn': 'Přihlásit se',
  'auth.signUpLink': 'Nemáte účet? Zaregistrujte se',
  'auth.forgotLink': 'Zapomenuté heslo?',
  'auth.showPassword': 'Zobrazit heslo',
  'auth.hidePassword': 'Skrýt heslo',
  'auth.err.invalidCredentials': 'Nesprávný e-mail nebo heslo.',
  'auth.err.unverified': 'Nejdřív si ověřte e-mail — zkontrolujte schránku.',
  'auth.signUpTitle': 'Vytvořte si účet',
  'auth.name': 'Jméno',
  'auth.signUpBtn': 'Zaregistrovat se',
  'auth.haveAccount': 'Už máte účet? Přihlaste se',
  'auth.verifySent': 'Zkontrolujte schránku a ověřte e-mail.',
  'auth.err.emailInUse': 'Tento e-mail už je registrovaný.',
  'auth.forgotTitle': 'Obnovit heslo',
  'auth.forgotBtn': 'Poslat odkaz',
  'auth.forgotSent': 'Pokud e-mail existuje, poslali jsme odkaz.',
  'auth.resetTitle': 'Nastavte nové heslo',
  'auth.newPassword': 'Nové heslo',
  'auth.resetBtn': 'Nastavit heslo',
  'auth.resetDone': 'Heslo změněno — můžete se přihlásit.',
  'auth.err.resetToken': 'Odkaz je neplatný nebo vypršel.',
  'auth.verifyTitle': 'Ověřte e-mail',
  'auth.verifyBody': 'Poslali jsme odkaz na {email}. Klepnutím dokončíte.',
  'auth.resend': 'Poslat znovu',
  'auth.resent': 'Odesláno.',

  'nav.groups': 'Skupiny',
  'nav.activity': 'Historie',
  'nav.transactions': 'Transakce',
  'nav.settings': 'Nastavení',
  'nav.admin': 'Správa',
  // The header's route to the purchase page. Nothing in the app linked there
  // before, so the only way to pay was to type the address.
  'nav.vip': 'VIP',
  'nav.signOut': 'Odhlásit se',
  'vip.badge': 'VIP',
  'vip.title': 'EvenUp VIP',
  // Distinct from `vip.title` (the page's own `<h1>`) so the subscription
  // card doesn't repeat the page heading verbatim — see settings.page's
  // `profile.title` vs `nav.settings` for the same pattern.
  'vip.subscription.title': 'Předplatné VIP',
  'vip.subtitle': 'Skenujte účtenky, my je přečteme za vás.',
  'vip.benefit.scans': '150 skenů účtenek měsíčně',
  // `{days}` je RECEIPT_RETENTION_DAYS ze `config/retention.ts`, stejné číslo,
  // jaké uvádějí obchodní podmínky i zásady ochrany osobních údajů – bez něj
  // panel sliboval uložení bez konce, zatímco úklidová úloha fotky maže.
  // „po {days} dnech“ (lokál), ne „{days} dnů“ (genitiv): retence je
  // nastavitelná, takže hodnoty 2, 3 a 4 jsou reálné a „2 dnů“ je špatně.
  // Stejná úvaha jako u `legal.privacy.s7.li1`.
  'vip.benefit.storage': 'Fotky účtenek zůstanou uložené – po {days} dnech je smažeme',
  'vip.benefit.cancel': 'Zrušíte kdykoli',
  'vip.subscribe': 'Předplatit VIP',
  // Nabídka pro toho, kdo u nás předplatné ještě nikdy neměl; `trialEligible`
  // z `billing.summary` rozhoduje, který z těch dvou popisků tlačítko dostane.
  //
  // `{trialDays}` je `TRIAL_PERIOD_DAYS` z `billing/prices.ts` – tedy přesně
  // to číslo, které checkout pošle Stripu jako `trial_period_days`, aby
  // tlačítko nemohlo slíbit jiné zkušební období, než jaké se doopravdy
  // založí.
  //
  // Záměrně `{trialDays}`, ne `{days}`: `{days}` po celém katalogu i v
  // právních dokumentech znamená retenci fotek účtenek a `LegalDocument`
  // dosazuje jednu a tutéž hodnotu do každého klíče. Dvě různá čísla pod
  // jedním jménem by se dřív nebo později prohodila.
  //
  // Genitiv „{trialDays} dní“ sedí pro 5 a víc – tedy i pro dnešních 7 –, ale
  // rozbije se na 2, 3 a 4 („3 dní“ místo „3 dny“), stejně jako u
  // `marketing.pricing.vip.body`. Zkrátí-li se zkušební období pod pět dnů,
  // musí se řetězec přepsat na `plural()`. Věty níž se tomu vyhýbají lokálem
  // („po {trialDays} dnech“), který je správný pro každou hodnotu ≥ 2.
  'vip.trial.subscribe': 'Vyzkoušet {trialDays} dní zdarma',
  // Kartu Stripe vyžaduje i ve zkušebním období, takže to musí zaznít dřív,
  // než člověk klikne – jinak je to nemilé překvapení až v checkoutu.
  //
  // „Pokud … zrušíte“, ne „Zrušíte-li“: `-li` je rejstřík právních dokumentů,
  // kdežto tenhle katalog i sousední `vip.subscription.trialing` používají
  // „Pokud“. Dva řetězce na jednom panelu se nemají lišit.
  'vip.trial.note':
    'Kartu zadáte hned, ale platit začnete až po {trialDays} dnech. Pokud předplatné do té doby zrušíte, nestrhneme vám nic.',
  'vip.manage': 'Spravovat předplatné',
  'vip.balance': 'Zbývá skenů: {count}',
  'vip.credits.title': 'Nebo si dokupte jednotlivé skeny',
  'vip.credits.pack': '{scans} skenů',
  // Displayed price of the subscription; `{price}` is already formatted for
  // the locale by `formatCurrency`, so no currency symbol belongs in here.
  'vip.price.month': '{price} měsíčně',
  'vip.credits.buy': 'Koupit',
  'vip.credits.ack':
    'Souhlasím, aby skeny byly dodány ihned, a beru na vědomí, že tím ztrácím právo na odstoupení od smlouvy do 14 dnů.',
  'vip.disabled': 'Placené funkce nejsou na této instanci zapnuté.',
  // Replaces the Subscribe button when no VIP price is configured for the
  // request's currency — `STRIPE_PRICE_{CZK,EUR}_VIP` is a separate variable
  // per currency, so a partially-configured instance really does hit this.
  'vip.subscription.unavailable': 'Předplatné teď není k dispozici. Skeny si můžete dokoupit níž.',
  // `past_due` / `unpaid` / `incomplete`: the subscription exists but its
  // payment failed. Offering "Subscribe" here would sell a second one.
  'vip.subscription.paymentProblem':
    'Platba předplatného neprošla. Zkontrolujte si kartu v zákaznickém portálu, jinak vám VIP zanikne.',
  // Stav `trialing`. `{date}` je `currentPeriodEnd` – Stripe po dobu zkušebního
  // období nastavuje období předplatného právě na ni, takže je to zároveň den
  // první platby. Zdravý stav jako `active`, ale zákazník potřebuje vidět,
  // kdy mu začneme účtovat; bez data by se zkušební období nedalo uhlídat.
  // `{date}` jde přes `formatDate` (`Intl`, cs-CZ), který vrací „2. srpna 2026“
  // – genitiv, tedy tvar, kterým se v češtině určuje den i bez předložky.
  //
  // Ne „běží do {date}“: „do 2. srpna“ se čte včetně toho dne, takže věta
  // „a ten den vám strhneme platbu“ na to zněla jako protimluv. „Končí {date}“
  // pojmenuje týž den bez té dvojznačnosti.
  'vip.subscription.trialing':
    'Zkušební období končí {date}. Pokud předplatné do té doby nezrušíte, ten den vám strhneme první platbu.',
  'vip.checkout.success': 'Zaplaceno, díky. Skeny se připíšou během chviličky.',
  'vip.checkout.cancelled': 'Platbu jste zrušili. Nic jsme vám nestrhli.',
  'vip.signedOut': 'Přihlaste se a můžete si předplatit VIP nebo dokoupit skeny.',
  'admin.instanceKey': 'Sdílený OpenRouter klíč',
  'admin.instanceKey.desc': 'Používají ho VIP uživatelé pro skenování účtenek.',
  'admin.ocrModel': 'OCR model',
  'admin.users': 'Uživatelé',
  'admin.errors': 'Chyby',
  'admin.col.vip': 'VIP',
  'admin.col.admin': 'Správce',
  'admin.col.joined': 'Registrace',
  'admin.col.disabled': 'Zablokován',
  'admin.col.credits': 'Kredity',
  'admin.col.actions': 'Akce',
  'admin.delete.confirm': 'Opravdu smazat uživatele {email}? Tuto akci nelze vzít zpět.',
  'admin.you': '(vy)',
  'admin.errors.empty': 'Zatím žádné chyby.',
  'admin.loadMore': 'Načíst další',
  'admin.grantCredits': 'Přidat kredity',
  'admin.grantCredits.placeholder': 'Skeny',
  'admin.grantCredits.granted': 'Kredity přidány.',

  'locale.czech': 'Čeština',
  'locale.english': 'Angličtina',

  'group.create': 'Vytvořit skupinu',
  'group.name': 'Název skupiny',
  'group.baseCurrency': 'Základní měna',
  'group.template': 'Šablona',
  'group.template.trip': 'Výlet',
  'group.template.household': 'Domácnost',
  'group.template.couple': 'Pár',
  'group.template.event': 'Událost',
  'group.template.other': 'Jiné',
  'group.members': 'Členové',
  'group.spentTotal': 'Utraceno {total}',
  'group.menu': 'Možnosti skupiny',
  'group.simplifyDebts': 'Zjednodušit dluhy',
  'group.archive': 'Archivovat skupinu',
  'group.archived': 'Archivováno',
  'group.empty': 'Zatím žádné skupiny. Vytvořte první!',
  'group.categories': 'Kategorie',
  // Plural forms for the transaction count on the group card (Intl.PluralRules).
  'group.transactions.one': '{count} transakce',
  'group.transactions.few': '{count} transakce',
  'group.transactions.many': '{count} transakce',
  'group.transactions.other': '{count} transakcí',

  'member.add': 'Přidat člena',
  'member.name': 'Jméno',
  'member.defaultShare': 'Výchozí podíl',
  'member.role.admin': 'Správce',
  'member.role.member': 'Člen',
  'member.deactivate': 'Deaktivovat',
  'member.iban': 'IBAN (pro QR platbu)',
  'member.connected': 'Připojeno',
  'member.notConnected': 'Zatím bez účtu',

  'merge.title': 'Sloučit členy',
  'merge.bannerQuestion':
    '{newcomer} se přidal(a), ale {placeholder} je pořád nepřevzatý. Je to stejný člověk?',
  'merge.bannerConfirm': 'Sloučit',
  'merge.bannerDismiss': 'Není',
  'merge.action': 'Sloučit do…',
  'merge.summary': 'Přesune se {count} transakcí a zůstatek {amount} na {target}.',
  'merge.resulting': '{target} pak bude mít zůstatek {amount}.',
  'merge.willDelete': '{source} bude smazán(a).',
  'merge.blocked': 'Nejdřív vyřeš převod mezi těmito členy: {titles}',
  'merge.confirm': 'Sloučit',
  'merge.cancel': 'Zrušit',

  'invite.create': 'Vytvořit pozvánku',
  'invite.link': 'Odkaz na pozvánku',
  'invite.claim': 'Převzít profil člena',
  'invite.joinAsNew': 'Nejsem v seznamu (Vytvořit nového uživatele)',
  'invite.expired': 'Pozvánka vypršela',
  'invite.copy': 'Kopírovat odkaz',
  'invite.copied': 'Zkopírováno',
  'invite.share': 'Sdílet',
  'invite.pickYourName': 'Najdi se v seznamu',
  'invite.thisIsMe': 'To jsem já',
  'invite.notOnList': 'Nejsem v seznamu',
  'invite.confirmNewTitle': 'Opravdu tu nikdo z nich nejsi ty?',
  'invite.confirmNewBody':
    'Když si založíš nový účet, dluhy zůstanou přiřazené původnímu jménu a nikdo je za tebe nepřevezme.',
  'invite.confirmNewCta': 'Přesto založit nový účet',
  'invite.confirmBack': 'Zpět k seznamu',
  'invite.owes': 'dluží {amount}',
  'invite.isOwed': 'má dostat {amount}',
  'invite.settled': 'vyrovnáno',

  'expense.add': 'Přidat výdaj',
  'expense.edit': 'Upravit výdaj',
  'expense.delete': 'Smazat výdaj',
  'expense.deleteConfirm': 'Opravdu smazat tuto transakci?',
  'transfer.edit': 'Upravit platbu',
  'transfer.delete': 'Smazat platbu',
  'expense.title': 'Název',
  'expense.amount': 'Částka',
  'expense.currency': 'Měna',
  'expense.date': 'Datum',
  'expense.category': 'Kategorie',
  'expense.note': 'Poznámka',
  'expense.paidBy': 'Zaplatil(a)',
  'expense.splitBetween': 'Rozdělit mezi',
  'expense.selectAll': 'Vybrat vše',
  'expense.selectNone': 'Zrušit výběr',
  'expense.income': 'Příjem',
  'expense.transfer': 'Převod',

  'csv.import': 'Import CSV',

  'expense.recurring': 'Opakovat',
  'recurrence.none': 'Ne',
  'recurrence.daily': 'Denně',
  'recurrence.weekly': 'Týdně',
  'recurrence.monthly': 'Měsíčně',
  'recurrence.yearly': 'Ročně',

  'stats.spendByCategory': 'Výdaje podle kategorií',
  'category.groceries': 'Potraviny',
  'category.restaurant': 'Restaurace',
  'category.transport': 'Doprava',
  'category.accommodation': 'Ubytování',
  'category.entertainment': 'Zábava',
  'category.shopping': 'Nákupy',
  'category.utilities': 'Energie',
  'category.health': 'Zdraví',
  'category.travel': 'Cestování',
  'category.other': 'Ostatní',
  'category.custom.add': 'Přidat kategorii',
  'category.custom.name': 'Název kategorie',
  'category.custom.icon': 'Ikona',
  'category.custom.deleteConfirm':
    'Opravdu smazat kategorii? Její výdaje se přesunou do „Ostatní“.',
  'category.custom.duplicate': 'Kategorie s tímto názvem už existuje.',
  'category.custom.empty': 'Zatím žádné vlastní kategorie.',

  'split.equal': 'Rovným dílem',
  'split.exact': 'Přesné částky',
  'split.shares': 'Podíly',
  'split.percentage': 'Procenta',
  'split.itemized': 'Po položkách',
  'split.sumMismatch': 'Součet musí odpovídat celkové částce',
  'split.percentMismatch': 'Procenta musí dát dohromady 100 %',

  'balance.title': 'Zůstatky',
  'balance.owes': '{debtor} dluží {creditor} {amount}',
  'balance.isOwed': '{member} má dostat {amount}',
  'balance.settledUp': 'Všechno je vyrovnáno',
  'balance.suggestedPayments': 'Navrhované platby',
  'balance.breakdown.spent': 'Útrata',
  'balance.breakdown.paid': 'Zaplaceno',
  'balance.breakdown.balance': 'Zůstatek',
  'balance.breakdown.filterAll': 'Vše',
  'balance.breakdown.filterPaid': 'Zaplaceno',
  'balance.breakdown.filterShare': 'Podíl',
  'balance.breakdown.paidRow': 'zaplaceno',
  'balance.breakdown.shareRow': 'podíl',
  'balance.breakdown.settlement': 'vyrovnání',
  'balance.breakdown.shared': 'společné (DPH, zaokrouhlení, nepřiřazené)',
  'balance.breakdown.empty': 'Nic tady není',
  'nextRound.title': 'Rundu platí {names}',
  'nextRound.titleBehind': 'Nejvíc pozadu: {names}',
  'nextRound.reason': 'Skluz {amount}',
  'nextRound.reasonEach': 'Skluz {amount} každý',
  'nextRound.runnerUp': 'Pak {names} ({amount})',
  'nextRound.square': 'Jste vyrovnaní — další rundu může vzít kdokoli.',

  'settle.title': 'Vyrovnat',
  'settle.markPaid': 'Označit jako zaplaceno',
  'settle.method.cash': 'Hotově',
  'settle.method.bank': 'Bankovním převodem',
  'settle.method.qr': 'QR platbou',
  'settle.qrCode': 'QR platba',
  'settle.noIban': 'Příjemce nemá uložený IBAN — zaplaťte hotově nebo ručně',

  'ocr.scan': 'Naskenovat účtenku',
  'ocr.fromGallery': 'Vybrat z galerie',
  'ocr.uploading': 'Nahrávání…',
  'ocr.processing': 'Zpracování účtenky…',
  'ocr.assignItems': 'Přiřaďte položky členům',
  'ocr.unassigned': 'Nepřiřazeno',
  'ocr.receiptTitle': 'Účtenka',
  'ocr.lowConfidence': 'Nízká jistota rozpoznání — zkontrolujte položky',
  'ocr.failed': 'Rozpoznání selhalo. Zadejte položky ručně.',
  'ocr.buyScans': 'Dokoupit skeny',
  'ocr.addItem': 'Přidat položku',
  'ocr.itemName': 'Název položky',
  'ocr.perPerson': 'Na osobu',
  'ocr.importPdf': 'Importovat PDF',
  'ocr.pagesSelected': 'Vybrané stránky',
  'ocr.removePage': 'Odebrat stránku',
  'ocr.moveUp': 'Posunout nahoru',
  'ocr.moveDown': 'Posunout dolů',
  'ocr.scanPages': 'Rozpoznat účtenku',
  'ocr.pdfTooLarge': 'PDF je příliš velké (max 10 MB).',
  'ocr.tooManyPages': 'Maximálně 10 stránek.',
  'ocr.receiptTotal': 'Celkem na účtence',
  'ocr.totalMismatch': 'Položky nesedí na celkovou částku z účtenky.',
  'ocr.difference': 'Rozdíl',
  'ocr.reconcile': 'Dorovnat na částku z účtenky',
  'ocr.reconcileItem': 'Dorovnání',
  'ocr.itemNeedsPrice': 'Každá položka musí mít cenu — doplňte ji u zvýrazněných.',
  'ocr.assignAll': 'Přiřadit ke všem položkám',
  'ocr.totalMatches': 'Položky sedí na částku z účtenky',

  'ocr.consent.title': 'Souhlas se skenováním účtenek',
  'ocr.consent.body':
    'Fotku účtenky odešleme poskytovateli umělé inteligence, který ji přečte. Zpracování může probíhat mimo EU. Účtenka může prozradit citlivé údaje — třeba nákup v lékárně. Souhlas můžete kdykoli odvolat v Nastavení.',
  'ocr.consent.accept': 'Souhlasím, naskenovat',
  'ocr.consent.cancel': 'Zrušit',

  'receipt.view': 'Zobrazit účtenku',
  'receipt.viewCount': 'Zobrazit účtenku ({count})',
  'receipt.prev': 'Předchozí',
  'receipt.next': 'Další',
  'receipt.openOriginal': 'Otevřít originál',
  'receipt.pageOf': 'Stránka {n} z {total}',
  'receipt.close': 'Zavřít',

  'fx.rate': 'Směnný kurz',
  'fx.override': 'Vlastní kurz',
  'fx.locked': 'Uzamčený kurz',
  'fx.stale': 'Kurz z mezipaměti (může být neaktuální)',

  'activity.created': '{actor} vytvořil(a) {item}',
  'activity.edited': '{actor} upravil(a) {item}',
  'activity.deleted': '{actor} smazal(a) {item}',
  'activity.settled': '{actor} vyrovnal(a) platbu {amount}',
  'activity.merged': '{actor} sloučil(a) {from} do {into}',
  'activity.filterByType': 'Filtrovat podle typu',

  'activityType.group.created': 'Skupina vytvořena',
  'activityType.member.added': 'Člen přidán',
  'activityType.member.merged': 'Člen sloučen',
  'activityType.member.updated': 'Člen upraven',
  'activityType.expense.created': 'Výdaj přidán',
  'activityType.expenses.imported': 'Výdaje importovány',
  'activityType.settlement.recorded': 'Platba zaznamenána',
  'activityType.transaction.updated': 'Transakce upravena',
  'activityType.transaction.deleted': 'Transakce smazána',
  'activityType.group.updated': 'Skupina upravena',
  'activityType.group.archived': 'Skupina archivována',
  'activityType.group.restored': 'Skupina obnovena',
  'activityType.category.created': 'Kategorie vytvořena',
  'activityType.category.updated': 'Kategorie upravena',
  'activityType.category.deleted': 'Kategorie smazána',

  'error.generic': 'Něco se pokazilo. Zkuste to prosím znovu.',
  'error.notFound': 'Nenalezeno',
  'error.unauthorized': 'Nemáte oprávnění',

  'settings.data.title': 'Vaše data (GDPR)',
  'settings.data.export': 'Exportovat moje data',
  'settings.data.delete': 'Smazat účet',
  'settings.data.deleteConfirm': 'Opravdu smazat účet? Tuto akci nelze vzít zpět.',

  'settings.ocrConsent.title': 'Skenování účtenek',
  'settings.ocrConsent.granted': 'Souhlas udělen {date}',
  'settings.ocrConsent.notGranted': 'Souhlas zatím neudělen',
  'settings.ocrConsent.revoke': 'Odvolat souhlas',

  'profile.title': 'Profil',
  'profile.nickname': 'Přezdívka',
  'profile.nicknameHint': 'Změna se projeví ve všech vašich skupinách.',
  'profile.bankAccount': 'Číslo účtu',
  'profile.bankAccountHint': 'Použije se pro QR platby ve všech vašich skupinách.',
  'profile.bankAccountInvalid': 'Neplatné číslo účtu. Zkontrolujte formát 19-2000145399/0800.',
  'profile.photo': 'Profilová fotka',
  'profile.photoHint': 'Nahrajte vlastní fotku, která nahradí monogram ve všech vašich skupinách.',
  'profile.uploadPhoto': 'Nahrát fotku',
  'profile.removePhoto': 'Odebrat fotku',
  'profile.photoTooLarge': 'Obrázek je příliš velký. Zkuste menší.',
  'profile.hidePhoto': 'Používat barvu místo fotky',
  'profile.hidePhotoHint':
    'Všude se místo profilové fotky zobrazí vaše iniciály na barevném pozadí.',

  // Notifications (FR-11.1/FR-11.2)
  'activityType.member.joined': 'Člen se připojil',

  'notify.cta.openGroup': 'Otevřít skupinu',
  'notify.footer': 'Nechcete tyto e-maily? Vypněte je v Nastavení.',
  'notify.digest.subject': 'Novinky ve skupině {group}',
  'notify.digest.title': 'Co je nového ve skupině {group}',
  'notify.digest.line': '{count}× {what}',
  'notify.digest.youOwe': 'Aktuálně dlužíte {amount}.',
  'notify.digest.youAreOwed': 'Aktuálně vám dluží {amount}.',
  'notify.digest.settled': 'Máte vyrovnáno.',
  'notify.reminder.subject': 'Připomínka dluhu — {group}',
  'notify.reminder.title': 'Nevyrovnaný dluh ve skupině {group}',
  'notify.reminder.body': 'Dlužíte {amount} — {creditor}.',
  'notify.reminder.qrHint': 'Ve skupině najdete QR platbu pro rychlé zaplacení.',
  'notify.settlement.subject': '{payer} vám poslal(a) platbu',
  'notify.settlement.title': 'Platba zaznamenána',
  'notify.settlement.body': '{payer} označil(a) platbu {amount} ve skupině {group} jako odeslanou.',

  'settings.notifications.title': 'Oznámení',
  'settings.notifications.enabled': 'Posílat e-mailová oznámení',
  'settings.notifications.hint':
    'Souhrn aktivity a připomínky nevyrovnaných dluhů. Vypnutím umlčíte vše.',
  'settings.notifications.saved': 'Nastavení oznámení uloženo.',
  'group.notifications.mute': 'Ztlumit oznámení pro tuto skupinu',

  // Security settings
  'security.title': 'Zabezpečení',
  'security.password.title': 'Heslo',
  'security.password.change': 'Změnit heslo',
  'security.password.current': 'Současné heslo',
  'security.password.new': 'Nové heslo',
  'security.password.changed': 'Heslo změněno',
  'security.password.setVia':
    'Přihlašujete se přes Google/Apple. Nastavte si heslo, abyste se mohli přihlásit i e-mailem.',
  'security.password.sendSetLink': 'Poslat odkaz pro nastavení hesla',
  'security.password.setLinkSent': 'Zkontrolujte e-mail s odkazem.',
  'security.linked.title': 'Způsoby přihlášení',
  'security.linked.password': 'E-mail + heslo',
  'security.linked.link': 'Propojit',
  'security.linked.unlink': 'Odpojit',
  'security.linked.connected': 'Propojeno',
  'security.linked.lastMethod': 'Nemůžete odebrat svůj jediný způsob přihlášení.',
  'security.2fa.title': 'Dvoufázové ověření',
  'security.2fa.on': 'Zapnuto',
  'security.2fa.off': 'Vypnuto',
  'security.2fa.enable': 'Zapnout 2FA',
  'security.2fa.disable': 'Vypnout 2FA',
  'security.2fa.needPassword': 'Pro zapnutí 2FA si nejprve nastavte heslo.',
  'security.2fa.scan': 'Naskenujte v aplikaci autentikátoru a zadejte 6místný kód.',
  'security.2fa.secret': 'Nebo zadejte tento klíč ručně',
  'security.2fa.code': '6místný kód',
  'security.2fa.confirm': 'Potvrdit',
  'security.2fa.backupTitle': 'Záložní kódy',
  'security.2fa.backupHint': 'Uložte si je bezpečně. Každý funguje jednou.',
  'security.2fa.download': 'Stáhnout',
  'security.2fa.done': 'Hotovo',
  'security.2fa.trustDevice': 'Důvěřovat tomuto zařízení',
  'security.2fa.useBackup': 'Použít záložní kód',
  'security.2fa.usePassword': 'Zpět',
  'security.error.generic': 'Něco se nepovedlo. Zkuste to znovu.',
  'security.error.invalidPassword': 'Nesprávné heslo.',
  'security.error.invalidCode': 'Neplatný nebo vypršelý kód.',

  'notFound.title': 'Stránka nenalezena',
  'notFound.body': 'Tahle adresa nikam nevede. Zkuste to od začátku.',
  'notFound.home': 'Zpět na úvod',
} as const;

export type MessageKey = keyof typeof cs;
/** Every locale must provide exactly these keys, each mapping to a string. */
export type Messages = Record<MessageKey, string>;
