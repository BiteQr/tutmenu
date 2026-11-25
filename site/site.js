/* tut.menu — лендинг: языки, живой AI-поиск на реальных ответах Типа Граф, админка-пример, появление блоков. */
(function () {
  // Номер WhatsApp отдела продаж (только цифры, с 7). ЗАМЕНИТЬ перед запуском.
  const WA_PHONE = '77064150958';

  const T = {
    kk: {
      navStats: 'Аналитика',
      stTitle: 'Қонақтар нені қарайтыны, нені алатыны және нені өткізіп жіберетіні көрінеді', stLead: 'Қағаз мәзір үнсіз. tut.menu қай тағамдарды ашатынын, қайсысына тапсырыс беретінін және қайсысын қарап өтіп кететінін көрсетеді — суретті, бағаны және позицияларды болжаммен емес, цифрмен өзгертуіңіз үшін.',
      stDash: 'Статистика', stDemo: 'есеп үлгісі', st7: '7 күн', st30: '30 күн', stC1: 'қазір мәзірде', stC2: 'қонақ мәзірді ашты', stC3: 'себетке қосты', stC4: 'минут мәзірде (орташа)',
      stDishes: 'Қай тағамдарды ашады', stColDish: 'Тағам', stColV: '👁 Ашты', stColA: '🛒 Алды', stColC: 'Алады',
      stWeak: 'Қарайды, бірақ алмайды', stWeakDish: 'Бұқтырылған қозы жауырыны', stWeakHint: 'Мүмкін, суретті немесе бағаны өзгерткен жөн', stSrc: 'Себетке қайдан қосады',
      sp1t: 'Хиттер өзі жиналады', sp1p: 'Ең жиі ашатын және тапсырыс беретін тағамдар бойынша. Ештеңе баптаудың қажеті жоқ.',
      sp2t: 'Шерту емес, қонақтар саналады', sp2p: 'Бір қонақ тағамды бес рет ашты — бұл бір қаралым. Цифрларға сенуге болады.',
      sp3t: '30 секунд сайын жаңарады', sp3p: 'Тікелей телефоннан, админкада, бөлек сервистерсіз қараңыз.',
      navWhy: 'Не үшін', navSteps: 'Іске қосу',
      heroLead: 'Қонақ QR-ды сканерлеп, тағамды өз тілінде бірнеше секундта табады. Мәзір тапсырысқа не қосуға болатынын өзі ұсынады, ал бағалар мен стоп-парақты телефоннан бір минутта өзгертесіз.',
      heroKicker: 'Қазақстандағы кафе мен мейрамханаларға арналған QR-мәзір',
      heroTitle1: 'Өзі сататын', heroTitle2: 'мәзір',
      heroCta: 'Демоны тегін жинау', heroPrice: 'Бюджетіңізге сай баға',
      trust1: '7 күн тегін', trust2: 'Мәзірді өзіміз көшіреміз', trust3: '1–2 күнде іске қосу',
      fA1: 'Хиттер', fA2: 'ең көп тапсырыс беретіні', fB2: '3 тілдегі мәзір', fC1: 'Баға жаңартылды', fC2: 'Шакшука', fD1: '«жеңіл бірдеңе»', fD2: 'ЖИ 3 тағам таңдады',
      whyTitle: 'Қағаз мәзір ақшаңызды байқатпай жоғалтады',
      w1p: 'Баға өсті — мәзірді қайта басу керек', w1t: 'Баға мен стоп-парақты 10 секундта өзгертесіз', w1d: 'Телефоннан, админкада. Қонақтар жаңасын бірден көреді. Баспахана да, қолмен сызылған баға да жоқ.',
      w2p: 'Даяшы сусын ұсынуды ұмытты', w2t: 'Мәзір өзі қосымша сатады', w2d: 'Әр тағамның астында «Бұны бірге алады», жоғарыда — ең көп тапсырыс берілетін Хиттер. Орташа чек көндірусіз өседі.',
      w3p: 'Қонақ құрамын сұрау үшін күтеді', w3t: 'Сурет, құрам және ақылды іздеу', w3d: 'Қонақ «етсіз» немесе «сыраға не алуға болады» деп жазады да, лайық тағамдарды суретімен бірден көреді. Тезірек шешеді, көбірек тапсырыс береді.',
      w4p: 'Барлық қонақ орысша оқымайды', w4t: 'Қазақша, орысша, ағылшынша', w4d: 'Тіл бір батырмамен ауысады: атаулар, сипаттамалар және іздеу. Туристер мен қазақтілді қонақтар өзін үйдегідей сезінеді.',
      o2t: 'Тағамдар бойынша статистика', o2p: 'Қай тағамдарды ашады, нені алады, нені қарап, бірақ тапсырыс бермейді. Суретті немесе бағаны қай жерде түзеткен жөн екені көрінеді.',
      o6t: 'Хиттер', o6p: '1, 2, 3 нөмірлері бар «ең көп тапсырыс беретіні» лентасы тапсырыстар мен қаралымдар бойынша өзі жиналады. Немесе тағамдарды қолмен таңдаңыз.',
      stepsTitle: '1–2 күнде іске қосу, сіздің әурешіліксіз',
      s1t: 'Демоны жинаңыз', s1p: '2 минут: дизайнды таңдап, логотипті жүктеңіз де, өз мәзіріңіздің сілтемесін алыңыз.',
      s2t: 'Мәзірді біз көшіреміз', s2p: 'PDF, қағаз мәзірдің суретін немесе кестені жіберіңіз. Тағамдарды, бағаларды және сипаттамаларды өзіміз енгіземіз.',
      s3t: 'QR үстелге — болды', s3p: 'Басып шығаруға дайын QR-кодтар береміз. Әрі қарай мәзірді өзіңіз өзгертесіз, біз WhatsApp-та байланыстамыз.',
      moveT: 'Басқа сервисте онлайн-мәзіріңіз бар ма?', moveP: 'Сілтемені жіберіңіз — бәрін бірнеше минутта көшіреміз: санаттар, үш тілдегі тағамдар, бағалар және суреттер. Ештеңені қайта басудың қажеті жоқ.',
      priceTitle: 'Баға — бюджетіңізге сай', priceLead: 'Сізді тарифке сыйғызбаймыз. Айына қанша салуға дайын екеніңізді айтыңыз — дәл сізде өзін ақтайтын мәзір жинаймыз.',
      budgetQ: 'Айына қанша салуға дайынсыз?', b1: '10 000 ₸ дейін', b1s: 'бастысынан бастау', b2: '10–20 000 ₸', b2s: 'өз мекенжайыңыз бен стиліңіз', b3: '20 000 ₸ бастап', b3s: 'бәрі дайын күйде', b0: 'Әзірге білмеймін', b0s: 'кеңес береміз',
      nameL: 'Мекеменің атауы', nameP: 'Мысалы, Asia Town', budgetCta: 'WhatsApp-та ұсыныс алу', budgetNote: 'Бюджетіңізге не сыятынын жазамыз. Немесе алдымен', budgetDemo: 'демоны тегін жинаңыз',
      priceBoth: 'Кез келген бюджетте', p2: '«Бұны бірге алады», Хиттер, себет және «Даяшыға көрсету»', p5: 'Статистика: нені қарайды, нені алады, нені іздейді', p7: 'Мәзіріңізді өзіміз көшіреміз: PDF, сурет немесе сілтеме арқылы',
      q0: 'Бұл қанша тұрады?', a0: 'Сізге не керек екеніне байланысты: біздің мекенжайдағы мәзірден бастап өз доменіңіз бен толық дизайнға дейін. WhatsApp-та бюджетіңізді айтыңыз — соған сай нұсқа ұсынамыз. Алғашқы 7 күн тегін.',
      q7: 'Біз басқа QR-мәзірді қолданамыз', a7: 'Мәзіріңіздің сілтемесін жіберіңіз — санаттарды, үш тілдегі тағамдарды, бағалар мен суреттерді көшіреміз. Қонақтарға тек жаңа QR-ды сканерлеу қалады.',
      finalTitle: 'Өз мәзіріңізді 2 минуттан кейін көріңіз', finalCta: 'Демоны тегін жинау', stickyCta: 'Демоны тегін жинау',
      navGuest: 'Қонаққа', navOwner: 'Иесіне', navExample: 'Мысал', navPrice: 'Баға', navFaq: 'Сұрақтар', navCta: 'Демо жинау',
      heroTitle: 'Кафе мен мейрамханаларға арналған ақылды QR-мәзір',
      
      heroLink: 'Тірі мәзірді ашу',
      made: 'Оралда жасалған. Бүкіл Қазақстан бойынша жұмыс істейміз.',
      tentHint: 'Камераны бағыттаңыз',
      guestTitle: 'Қонақ не тапсырыс беретінін өзі табады',
      g1t: 'Қарапайым сөзбен ақылды іздеу',
      g1p: 'Қонақ «жеңіл бірдеңе» немесе «сыраға не алуға болады» деп жазады, ал мәзір сіздің картаңыздан тағамдарды таңдап, неге сәйкес келетінін түсіндіреді.',
      askLabel: 'Басыңыз, бұл Типа Граф мәзірінің нақты жауаптары (орысша):',
      g2t: 'Әр тағамның астында «Бұны бірге алады»',
      g2p: 'Салатты ашты да, оған не қоса алатынын көрді: шарап, нан себеті, стейк. Бір түртумен қосады. Даяшыға көндірудің қажеті жоқ.',
      g3t: 'Қазақша, орысша, ағылшынша',
      g3p: 'Тіл бір батырмамен ауысады: атаулар, сипаттамалар және іздеу. Әр қонақ мәзірді өзіне ыңғайлы тілде оқиды.',
      ownerTitle: 'Мәзірді өзіңіз бір минутта өзгертесіз',
      o1t: 'Бағалар және стоп-парақ', o1p: 'Тағам таусылды немесе баға өсті: телефоннан админкада түзеттіңіз, қонақтар бірден көреді. Қайта басып шығарусыз.',
      
      o3t: 'Сторис, акциялар, бизнес-ланч', o3p: 'Бейне мен акциялар мәзірдің жоғарғы жағында, Инстаграмдағыдай. Аптаның әр күнгі ланчы өзі ауысады.',
      o4t: 'Өз доменіңіз бен стиліңіз', o4p: 'Мәзір сіздің мекенжайыңызда, tipagraf.kz сияқты, логотипіңізбен, түстеріңізбен және қаріптеріңізбен.',
      o5t: 'Күтусіз тапсырыс', o5p: 'Қонақ себетте тапсырыс жинап, экранды даяшыға көрсетеді немесе WhatsApp-қа жібереді.',
      adminNote: 'Бағаны өзгертіңіз немесе тағамды өшіріңіз: админкада осылай көрінеді.',
      exTitle: 'Тірі мысал: Типа Граф, Орал',
      exLead: 'tut.menu-дағы алғашқы мейрамхана. Бұл нағыз мәзір, оны қонақтар күн сайын пайдаланады. Камераны QR-ға бағыттаңыз немесе tipagraf.kz ашыңыз.',
      cap1: 'Мекеме бейнесімен сәлемдесу', cap2: 'Акциялар, бизнес-ланч және іздеу', cap3: 'Суреті мен сипаттамасы бар тағам',
      pricePer: 'жылына, айына шамамен 20 000 ₸', planAName: 'Біздің мекенжайда', planBName: 'Өз доменіңізде', planAPer: 'жылына, айына шамамен 12 000 ₸', planBNote: 'Доменді өзіңіз сатып аласыз, қосуды біз жасаймыз', priceTrial: '7 күн тегін, карта қажет емес', planSlug: 'сіздің-кафе', priceCta: 'Демоны тегін жинау',
      p1: 'Үш тілдегі мәзір және ақылды іздеу', p3: 'Телефоннан админка: бағалар, стоп-парақ, суреттер', p4: 'Сторис, акциялар және күн сайынғы бизнес-ланч', p6: 'Мекемеңізге арналған логотип және дизайн', p8: 'WhatsApp арқылы қолдау',
      faqTitle: 'Жиі қойылатын сұрақтар',
      q1: 'Kaspi QR-мен жұмыс істей ме?', a1: 'Мәзір төлемге кедергі келтірмейді: қонақ әдеттегідей Kaspi QR немесе терминал арқылы төлейді. Мәзірге Kaspi төлем сілтемеңіз бар батырма қоса аламыз.',
      q2: 'iiko-мен интеграция бар ма?', a2: 'Қазір мәзір біздің админкада жүргізіледі, баға он секундта өзгереді. iiko-мен синхрондауды мекемеңізге қарай талқылаймыз.',
      q3: 'Іске қосуды қанша күту керек?', a3: 'Демо 2 минутта жиналады. Тағамдарыңыз бар дайын мәзірді әдетте 1–2 күнде іске қосамыз.',
      q4: 'Мәзірді кім толтырады?', a4: 'Біз. PDF, қағаз мәзірдің суретін немесе кестені жіберіңіз, тағамдарды, бағаларды және сипаттамаларды өзіміз көшіреміз. Кейін админкада түзетесіз.',
      q5: 'Қонаққа қосымша жүктеу керек пе?', a5: 'Жоқ. Мәзір QR-код арқылы браузерде ашылады, ештеңе орнатудың қажеті жоқ.',
      q6: 'Өз доменімде бола ма?', a6: 'Иә, tipagraf.kz сияқты. Доменіңіз әлі болмаса, қайдан сатып алуға болатынын айтып, өзіміз қосамыз.',
      
      finalLead: 'Дизайнды таңдап, логотипті жүктеңіз де, атауыңыз бар демо сілтемесін алыңыз. Тегін және қоңыраусыз.',
      finalWa: 'WhatsApp-қа жазу',
      footLine: 'Қазақстандағы кафе мен мейрамханаларға арналған ақылды QR-мәзір'
    },
    en: {
      navStats: 'Analytics',
      stTitle: 'See what guests view, order and skip', stLead: 'A paper menu tells you nothing. tut.menu shows which dishes get opened, which get ordered and which get viewed and skipped, so you change photos, prices and items by the numbers, not by guesswork.',
      stDash: 'Analytics', stDemo: 'sample report', st7: '7 days', st30: '30 days', stC1: 'in the menu now', stC2: 'guests opened the menu', stC3: 'added to cart', stC4: 'min in the menu on average',
      stDishes: 'Which dishes get opened', stColDish: 'Dish', stColV: '👁 Opened', stColA: '🛒 Ordered', stColC: 'Take rate',
      stWeak: 'Viewed but not ordered', stWeakDish: 'Braised lamb shoulder', stWeakHint: 'Maybe it’s time to change the photo or the price', stSrc: 'Where add-to-cart comes from',
      sp1t: 'Hits build themselves', sp1p: 'From what guests open and order most. Nothing to set up.',
      sp2t: 'Guests, not clicks', sp2p: 'One guest opening a dish five times counts as one view. Numbers you can trust.',
      sp3t: 'Updates every 30 seconds', sp3p: 'Check it right from your phone, in the admin panel, no extra services.',
      navWhy: 'Why', navSteps: 'Launch',
      heroLead: 'Guests scan the QR and find a dish in seconds, in their own language. The menu suggests what to add to the order, and you change prices and sold-out items from your phone in a minute.',
      heroKicker: 'QR menus for cafés and restaurants in Kazakhstan',
      heroTitle1: 'A menu that', heroTitle2: 'sells by itself',
      heroCta: 'Build a free demo', heroPrice: 'Pricing for your budget',
      trust1: '7 days free', trust2: 'We move your menu for you', trust3: 'Live in 1–2 days',
      fA1: 'Hits', fA2: 'most ordered', fB2: 'menu in 3 languages', fC1: 'Price updated', fC2: 'Shakshuka', fD1: '“something light”', fD2: 'AI picked 3 dishes',
      whyTitle: 'A paper menu quietly loses you money',
      w1p: 'Prices went up, time to reprint', w1t: 'Change prices and sold-out items in 10 seconds', w1d: 'From your phone, in the admin panel. Guests see it instantly. No printers, no prices crossed out by hand.',
      w2p: 'The waiter forgot to offer a drink', w2t: 'The menu upsells on its own', w2d: '“Goes well with” under every dish and Hits at the top show what people order most. The average bill grows without pushy selling.',
      w3p: 'Guests wait to ask about ingredients', w3t: 'Photos, ingredients and smart search', w3d: 'A guest types “no meat” or “something for beer” and sees matching dishes with photos. They decide faster and order more.',
      w4p: 'Not every guest reads Russian', w4t: 'Kazakh, Russian, English', w4d: 'One button switches names, descriptions and search. Tourists and Kazakh-speaking guests feel at home.',
      o2t: 'Dish analytics', o2p: 'Which dishes get opened, which get ordered, and which get looked at but skipped. You see where to fix a photo or a price.',
      o6t: 'Hits', o6p: 'A numbered “most ordered” strip builds itself from orders and views. Or pick the dishes yourself.',
      stepsTitle: 'Live in 1–2 days, without the hassle',
      s1t: 'Build a demo', s1p: '2 minutes: choose a design, upload your logo and get a link to your menu.',
      s2t: 'We move your menu', s2p: 'Send a PDF, photos of your paper menu or a spreadsheet. We enter the dishes, prices and descriptions ourselves.',
      s3t: 'QR on the tables, done', s3p: 'We give you print-ready QR codes. Then you edit the menu yourself, and we’re on WhatsApp.',
      moveT: 'Already have an online menu elsewhere?', moveP: 'Send us the link and we’ll move everything in minutes: categories, dishes in three languages, prices and photos. Nothing to retype.',
      priceTitle: 'Pricing that fits your budget', priceLead: 'We don’t squeeze you into a plan. Tell us what you’re ready to spend per month and we’ll build a menu that pays off for you.',
      budgetQ: 'What’s your monthly budget?', b1: 'up to 10,000 ₸', b1s: 'start with the essentials', b2: '10–20,000 ₸', b2s: 'your own address and style', b3: '20,000 ₸+', b3s: 'fully done for you', b0: 'Not sure yet', b0s: 'we’ll advise',
      nameL: 'Venue name', nameP: 'e.g. Asia Town', budgetCta: 'Get an offer on WhatsApp', budgetNote: 'We’ll tell you what fits your budget. Or first', budgetDemo: 'build a free demo',
      priceBoth: 'In any budget', p2: '“Goes well with”, Hits, cart and “Show the waiter”', p5: 'Analytics: what guests view, order and search for', p7: 'We move your menu for you: from a PDF, photos or a link',
      q0: 'How much does it cost?', a0: 'It depends on what you need: from a menu on our address to your own domain and a fully custom design. Tell us your budget on WhatsApp and we’ll offer an option that fits. The first 7 days are free.',
      q7: 'We already use another QR menu', a7: 'Send us the link to your menu and we’ll move the categories, dishes in three languages, prices and photos. Guests just scan the new QR.',
      finalTitle: 'See your own menu in 2 minutes', finalCta: 'Build a free demo', stickyCta: 'Build a free demo',
      navGuest: 'Guests', navOwner: 'Owners', navExample: 'Example', navPrice: 'Price', navFaq: 'FAQ', navCta: 'Build a demo',
      heroTitle: 'A smart QR menu for cafés and restaurants',
      
      heroLink: 'Open a live menu',
      made: 'Made in Uralsk. Working across Kazakhstan.',
      tentHint: 'Point your camera',
      guestTitle: 'Guests find what to order on their own',
      g1t: 'Smart search in plain words',
      g1p: 'A guest types “something light” or “what goes with beer”, and the menu picks dishes from your list and explains why they fit.',
      askLabel: 'Tap one: these are real answers from the Tipa Graf menu (in Russian):',
      g2t: '“Goes well with” under every dish',
      g2p: 'Open a salad and see what people order with it: wine, a bread basket, a steak. Added in one tap. No upselling needed from the waiter.',
      g3t: 'Kazakh, Russian, English',
      g3p: 'One button switches the language: names, descriptions and search. Every guest reads the menu the way they prefer.',
      ownerTitle: 'You change the menu in a minute',
      o1t: 'Prices and sold-out items', o1p: 'A dish ran out or a price went up: fix it in the admin from your phone, guests see it at once. No reprinting.',
      
      o3t: 'Stories, offers, business lunch', o3p: 'Videos and offers at the top of the menu, like Instagram. The lunch for each weekday switches by itself.',
      o4t: 'Your domain and your style', o4p: 'The menu lives at your address, like tipagraf.kz, with your logo, colours and fonts.',
      o5t: 'Ordering without waiting', o5p: 'Guests build an order in the cart and show the screen to the waiter or send it via WhatsApp.',
      adminNote: 'Change a price or switch a dish off: this is how it looks in the admin.',
      exTitle: 'Live example: Tipa Graf, Uralsk',
      exLead: 'The first restaurant on tut.menu. A real menu that guests use every day. Point your camera at the QR code or open tipagraf.kz.',
      cap1: 'Welcome screen with the venue video', cap2: 'Offers, business lunch and search', cap3: 'A dish with photo and description',
      pricePer: 'per year, about 20,000 ₸ a month', planAName: 'On our address', planBName: 'On your own domain', planAPer: 'per year, about 12,000 ₸ a month', planBNote: 'You buy the domain, we connect it', priceTrial: '7 days free, no card needed', planSlug: 'your-cafe', priceCta: 'Build a free demo',
      p1: 'Menu in three languages with smart search', p3: 'Admin from your phone: prices, sold-out, photos', p4: 'Stories, offers and daily business lunch', p6: 'Logo and design made for your venue', p8: 'Support via WhatsApp',
      faqTitle: 'Questions',
      q1: 'Does it work with Kaspi QR?', a1: 'The menu doesn’t get in the way of payment: guests pay as usual, with Kaspi QR or a terminal. We can add a button with your Kaspi payment link.',
      q2: 'Is there an iiko integration?', a2: 'For now the menu is managed in our admin, a price changes in ten seconds. We discuss iiko sync for each venue.',
      q3: 'How long until launch?', a3: 'A demo takes 2 minutes. A finished menu with your dishes usually goes live in 1–2 days.',
      q4: 'Who fills in the menu?', a4: 'We do. Send a PDF, a photo of your paper menu or a spreadsheet, and we’ll move the dishes, prices and descriptions. Then you edit in the admin.',
      q5: 'Do guests need to install an app?', a5: 'No. The menu opens in the browser from the QR code, nothing to install.',
      q6: 'Can it be on my own domain?', a6: 'Yes, like tipagraf.kz. If you don’t have a domain yet, we’ll tell you where to buy one and connect it for you.',
      
      finalLead: 'Pick a design, upload your logo and get a demo link with your venue’s name. Free, no calls.',
      finalWa: 'Message us on WhatsApp',
      footLine: 'A smart QR menu for cafés and restaurants in Kazakhstan'
    }
  };

  const nodes = [...document.querySelectorAll('[data-t]')];
  const RU = {};
  nodes.forEach((n) => { RU[n.dataset.t] = n.textContent; });
  T.ru = RU;
  const HTML_LANG = { ru: 'ru', kk: 'kk', en: 'en' };

  // Подсказки в полях ввода (placeholder) — тоже на трёх языках
  const phs = [...document.querySelectorAll('[data-tp]')];
  phs.forEach((n) => { RU[n.dataset.tp] = n.placeholder; });
  let LANG = 'ru';

  function setLang(l) {
    const d = T[l] || RU;
    LANG = l;
    nodes.forEach((n) => { const v = d[n.dataset.t]; if (v) n.textContent = v; });
    phs.forEach((n) => { const v = d[n.dataset.tp]; if (v) n.placeholder = v; });
    renderOffer(false);
    if (typeof renderStats === 'function') renderStats(false);
    document.documentElement.lang = HTML_LANG[l];
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    try { localStorage.setItem('tm_lang', l); } catch {}
    updateWa(l);
  }
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  function updateWa(l) {
    const text = { ru: 'Здравствуйте! Хочу QR-меню tut.menu для своего заведения.', kk: 'Сәлеметсіз бе! Мекемеме tut.menu QR-мәзірін қалаймын.', en: 'Hello! I’d like a tut.menu QR menu for my venue.' }[l] || '';
    ['waLink', 'stickyWa'].forEach((id) => { const a = document.getElementById(id); if (a) a.href = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(text)}`; });
    updateBudgetWa();
  }

  /* ---------- Цена под бюджет: выбор бюджета → что получите → заявка в WhatsApp с бюджетом и названием ---------- */
  const OFFERS = {
    ru: {
      1: { tag: '', title: 'Меню на нашем адресе', list: ['Адрес tutmenu.kz/ваше-кафе', 'Готовый дизайн в цветах заведения', 'Все функции меню и админка с телефона', 'Перенесём меню по PDF, фото или ссылке'] },
      2: { tag: 'Оптимально', title: 'Меню на вашем домене', list: ['Свой адрес, как tipagraf.kz', 'Дизайн под ваш бренд: логотип, цвета, шрифты', 'Перенос меню и фото — наша работа', 'Сторис, акции, бизнес-ланч и Хиты'] },
      3: { tag: 'Под ключ', title: 'Всё сделаем за вас', list: ['Свой домен и дизайн под бренд', 'Наполним меню: описания на трёх языках и фото', 'Настроим акции, сторис и бизнес-ланч', 'Обновляем меню по вашему сообщению в WhatsApp'] },
      0: { tag: '', title: 'Подберём вариант вместе', list: ['Расскажите о заведении и что для вас важно', 'Предложим 2–3 варианта под разные бюджеты', 'Покажем демо с вашим логотипом бесплатно'] },
      label: { 1: 'до 10 000 ₸', 2: '10–20 000 ₸', 3: 'от 20 000 ₸', 0: 'пока не знаю' },
      msg: (name, b) => `Здравствуйте! Хочу QR-меню tut.menu.${name ? ` Заведение: ${name}.` : ''} Бюджет в месяц: ${b}.`
    },
    kk: {
      1: { tag: '', title: 'Біздің мекенжайдағы мәзір', list: ['tutmenu.kz/сіздің-кафе мекенжайы', 'Мекеме түстеріндегі дайын дизайн', 'Мәзірдің барлық мүмкіндіктері және телефоннан админка', 'Мәзірді PDF, сурет немесе сілтеме арқылы көшіреміз'] },
      2: { tag: 'Оңтайлы', title: 'Өз доменіңіздегі мәзір', list: ['tipagraf.kz сияқты өз мекенжайыңыз', 'Брендіңізге сай дизайн: логотип, түстер, қаріптер', 'Мәзір мен суреттерді көшіру — біздің жұмыс', 'Сторис, акциялар, бизнес-ланч және Хиттер'] },
      3: { tag: 'Дайын күйде', title: 'Бәрін сіз үшін жасаймыз', list: ['Өз домен және брендке сай дизайн', 'Мәзірді толтырамыз: үш тілде сипаттама және суреттер', 'Акцияларды, сторис пен бизнес-ланчты баптаймыз', 'Мәзірді WhatsApp-тағы хабарламаңыз бойынша жаңартамыз'] },
      0: { tag: '', title: 'Нұсқаны бірге таңдаймыз', list: ['Мекеме туралы және сізге не маңызды екенін айтыңыз', 'Әртүрлі бюджетке 2–3 нұсқа ұсынамыз', 'Логотипіңіз бар демоны тегін көрсетеміз'] },
      label: { 1: '10 000 ₸ дейін', 2: '10–20 000 ₸', 3: '20 000 ₸ бастап', 0: 'әзірге білмеймін' },
      msg: (name, b) => `Сәлеметсіз бе! tut.menu QR-мәзірін қалаймын.${name ? ` Мекеме: ${name}.` : ''} Айлық бюджет: ${b}.`
    },
    en: {
      1: { tag: '', title: 'A menu on our address', list: ['Address tutmenu.kz/your-cafe', 'Ready-made design in your venue’s colours', 'Every menu feature and a phone-friendly admin panel', 'We move your menu from a PDF, photos or a link'] },
      2: { tag: 'Best value', title: 'A menu on your own domain', list: ['Your own address, like tipagraf.kz', 'Design for your brand: logo, colours, fonts', 'Moving the menu and photos is on us', 'Stories, promos, business lunch and Hits'] },
      3: { tag: 'Done for you', title: 'We do everything', list: ['Your own domain and a branded design', 'We fill the menu: descriptions in three languages and photos', 'We set up promos, stories and business lunch', 'We update the menu when you message us on WhatsApp'] },
      0: { tag: '', title: 'Let’s find the right option', list: ['Tell us about your venue and what matters to you', 'We’ll suggest 2–3 options for different budgets', 'We’ll show a free demo with your logo'] },
      label: { 1: 'up to 10,000 ₸', 2: '10–20,000 ₸', 3: '20,000 ₸+', 0: 'not sure yet' },
      msg: (name, b) => `Hello! I’d like a tut.menu QR menu.${name ? ` Venue: ${name}.` : ''} Monthly budget: ${b}.`
    }
  };
  let budget = '2';
  const offerEl = document.querySelector('.offer');
  function renderOffer(anim) {
    const O = (OFFERS[LANG] || OFFERS.ru)[budget];
    if (!O || !offerEl) return;
    document.getElementById('offerTag').textContent = O.tag;
    document.getElementById('offerTitle').textContent = O.title;
    document.getElementById('offerList').innerHTML = O.list.map((x) => `<li>${x}</li>`).join('');
    if (anim) { offerEl.classList.remove('swap'); void offerEl.offsetWidth; offerEl.classList.add('swap'); }
    updateBudgetWa();
  }
  function updateBudgetWa() {
    const a = document.getElementById('budgetWa');
    if (!a) return;
    const O = OFFERS[LANG] || OFFERS.ru;
    const name = (document.getElementById('venueName') || {}).value || '';
    a.href = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(O.msg(name.trim().slice(0, 80), O.label[budget]))}`;
  }
  document.querySelectorAll('.bopt').forEach((b) => b.addEventListener('click', () => {
    budget = b.dataset.b;
    document.querySelectorAll('.bopt').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
    renderOffer(true);
  }));
  const vn = document.getElementById('venueName');
  if (vn) vn.addEventListener('input', updateBudgetWa);

  /* ---------- Липкая кнопка на телефоне: появляется после первого экрана, прячется у финала ---------- */
  const sticky = document.getElementById('sticky');
  if (sticky) {
    const hero = document.querySelector('.hero'), fin = document.querySelector('.final');
    let pastHero = false, atFinal = false;
    const upd = () => { const on = pastHero && !atFinal; sticky.classList.toggle('on', on); sticky.setAttribute('aria-hidden', String(!on)); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; upd(); }).observe(hero);
      new IntersectionObserver(([e]) => { atFinal = e.isIntersecting; upd(); }).observe(fin);
    }
  }

  /* ---------- живой AI-поиск: настоящие ответы меню Типа Граф ---------- */
  const qEl = document.getElementById('liveQ');
  const msgEl = document.getElementById('liveMsg');
  const listEl = document.getElementById('liveList');
  let demo = null, typing = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₸';

  function render(i) {
    if (!demo) return;
    const g = demo[i];
    clearInterval(typing);
    listEl.innerHTML = '';
    msgEl.textContent = '';
    const done = () => {
      msgEl.textContent = g.msg;
      listEl.innerHTML = g.items.map((it) => `<li><img src="${it.img}" alt="" width="64" height="64"><div><b>${it.t}</b><small>${it.why}</small><i>${money(it.p)}</i></div></li>`).join('');
      [...listEl.children].forEach((li, k) => setTimeout(() => li.classList.add('in'), reduce ? 0 : 90 * k + 60));
    };
    if (reduce) { qEl.textContent = g.q; done(); return; }
    let n = 0;
    qEl.textContent = '';
    typing = setInterval(() => {
      n++; qEl.textContent = g.q.slice(0, n);
      if (n >= g.q.length) { clearInterval(typing); setTimeout(done, 280); }
    }, 38);
  }
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-active', x === c));
    render(+c.dataset.q);
  }));
  fetch('ai-demo.json').then((r) => r.json()).then((d) => { demo = d; render(0); }).catch(() => {});

  /* ---------- админка-пример: цена и «в наличии» ---------- */
  const saved = document.getElementById('adminSaved');
  let st = 0;
  const flash = () => { saved.classList.add('on'); clearTimeout(st); st = setTimeout(() => saved.classList.remove('on'), 1400); };
  document.querySelectorAll('.admin__price input').forEach((inp) => inp.addEventListener('change', () => {
    const v = parseInt(inp.value.replace(/\D/g, ''), 10);
    inp.value = isNaN(v) ? '' : v.toLocaleString('ru-RU').replace(/ /g, ' ');
    flash();
  }));
  document.querySelectorAll('.tog').forEach((t) => {
    const li = t.closest('li');
    li.classList.toggle('off', !t.classList.contains('is-on'));
    t.addEventListener('click', () => {
      const on = !t.classList.contains('is-on');
      t.classList.toggle('is-on', on); t.setAttribute('aria-pressed', String(on));
      li.classList.toggle('off', !on); flash();
    });
  });

  /* ---------- Аналитика: пример отчёта (как вкладка «Статистика» в админке) ---------- */
  const STAT_DISHES = {
    ru: ['Бургер с курицей', 'Пицца пепперони', 'Салат с баклажанами и страчателлой', 'Томлёная лопатка ягнёнка', 'Удон с креветкой', 'Чизкейк'],
    kk: ['Тауық бургері', 'Пепперони пиццасы', 'Баклажан мен страчателла салаты', 'Бұқтырылған қозы жауырыны', 'Асшаян қосылған удон', 'Чизкейк'],
    en: ['Chicken burger', 'Pepperoni pizza', 'Aubergine & stracciatella salad', 'Braised lamb shoulder', 'Udon with prawns', 'Cheesecake']
  };
  const STAT = {
    7: { c2: 1284, c3: 731, c4: 4.2, d: [[142, 61], [118, 47], [96, 38], [88, 9], [74, 29], [51, 12]], src: [41, 34, 15, 10] },
    30: { c2: 5310, c3: 2988, c4: 4.5, d: [[598, 251], [487, 201], [402, 160], [355, 41], [311, 118], [214, 52]], src: [39, 36, 14, 11] }
  };
  const SRC_NAMES = {
    ru: ['📋 Список меню', '🔥 Хиты', '✨ ИИ-подбор', '🤝 «С этим берут»'],
    kk: ['📋 Мәзір тізімі', '🔥 Хиттер', '✨ ЖИ таңдауы', '🤝 «Бұны бірге алады»'],
    en: ['📋 Menu list', '🔥 Hits', '✨ AI picks', '🤝 “Goes well with”']
  };
  const WEAK_TXT = { ru: (v, a, c) => `открыли ${v} · взяли ${a} (${c}%)`, kk: (v, a, c) => `ашты ${v} · алды ${a} (${c}%)`, en: (v, a, c) => `opened ${v} · ordered ${a} (${c}%)` };
  let statP = 7, statShown = false;
  const fmt = (n) => (n % 1 ? n.toFixed(1).replace('.', LANG === 'en' ? '.' : ',') : Math.round(n).toLocaleString(LANG === 'en' ? 'en-US' : 'ru-RU')).replace(/[  ]/g, ' ');
  function countTo(el, to, anim) {
    if (!anim || reduce) { el.textContent = fmt(to); el.dataset.v = to; return; }
    const from = parseFloat(el.dataset.v || 0), t0 = performance.now(), dur = 900;
    el.dataset.v = to;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e; el.textContent = fmt(to % 1 ? Math.round(v * 10) / 10 : Math.round(v)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function renderStats(anim) {
    const rows = document.getElementById('stRows');
    if (!rows) return;
    const D = STAT[statP], names = STAT_DISHES[LANG] || STAT_DISHES.ru;
    document.querySelectorAll('[data-n]').forEach((el) => countTo(el, D[el.dataset.n], anim && statShown));
    const max = Math.max(...D.d.map((x) => x[0]));
    rows.innerHTML = D.d.map(([v, a], i) => { const c = Math.round(a / v * 100); return `
      <div class="drow${c < 15 ? ' is-weak' : ''}"><span class="dname"><b>${names[i]}</b><i data-w="${Math.round(v / max * 100)}"></i></span>
      <span>${fmt(v)}</span><span>${fmt(a)}</span><span class="${c >= 35 ? 'good' : c < 15 ? 'bad' : ''}">${c}%</span></div>`; }).join('');
    const wk = D.d[3];
    document.getElementById('stWeak').textContent = (WEAK_TXT[LANG] || WEAK_TXT.ru)(fmt(wk[0]), fmt(wk[1]), Math.round(wk[1] / wk[0] * 100));
    const cols = ['#1f4bff', '#ff7a1a', '#1fa855', '#8b5cf6'], sn = SRC_NAMES[LANG] || SRC_NAMES.ru;
    document.getElementById('stSrc').innerHTML = D.src.map((p, i) => `<div class="dsrc__row"><b>${sn[i]}</b><em>${p}%</em><span class="dsrc__bar"><i data-w="${p * 2}" style="background:${cols[i]}"></i></span></div>`).join('');
    const fill = () => document.querySelectorAll('#stats [data-w]').forEach((x) => { x.style.width = Math.min(100, +x.dataset.w) + '%'; });
    if (statShown) requestAnimationFrame(() => requestAnimationFrame(fill));
  }
  document.querySelectorAll('.dash__period button').forEach((b) => b.addEventListener('click', () => {
    statP = +b.dataset.p;
    document.querySelectorAll('.dash__period button').forEach((x) => x.classList.toggle('is-on', x === b));
    renderStats(true);
  }));
  const dash = document.querySelector('.dash');
  if (dash) {
    const show = () => { if (statShown) return; statShown = true; renderStats(true); };
    if ('IntersectionObserver' in window && !reduce) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { show(); o.disconnect(); } }, { threshold: .25 }).observe(dash);
    else show();
    // «сейчас в меню» — живой счётчик
    const live = document.getElementById('stLive');
    let n = 7;
    if (!reduce) setInterval(() => { n = Math.max(3, Math.min(14, n + (Math.random() < .5 ? -1 : 1))); live.textContent = n; }, 3200);
  }

  /* ---------- появление частей секций ---------- */
  const targets = document.querySelectorAll('section h2, .stats__head p, .dash, .stats__points li, .why__card, .steps__list li, .move, .budget, .price__head p, .point, .ask, .guest__phone, .shot, .feats > div, .admin, .example__head > *, .example__phones figure, .price__grid, .faq details, .final > *');
  if (!reduce && 'IntersectionObserver' in window) {
    targets.forEach((el) => el.classList.add('rv'));
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const sib = [...e.target.parentElement.children].filter((x) => x.classList.contains('rv'));
      const k = Math.max(0, sib.indexOf(e.target));
      setTimeout(() => e.target.classList.add('in'), Math.min(k, 5) * 75);
      io.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el) => io.observe(el));
  }

  let start = 'ru';
  try { start = localStorage.getItem('tm_lang') || (navigator.language || '').slice(0, 2); } catch {}
  setLang(T[start] ? start : 'ru');
})();
