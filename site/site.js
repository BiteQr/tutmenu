/* tut.menu — лендинг: языки, живой AI-поиск на реальных ответах Типа Граф, админка-пример, появление блоков. */
(function () {
  // Номер WhatsApp отдела продаж (только цифры, с 7). ЗАМЕНИТЬ перед запуском.
  const WA_PHONE = '';

  const T = {
    kk: {
      navGuest: 'Қонаққа', navOwner: 'Иесіне', navExample: 'Мысал', navPrice: 'Баға', navFaq: 'Сұрақтар', navCta: 'Демо жинау',
      heroTitle: 'Кафе мен мейрамханаларға арналған ақылды QR-мәзір',
      heroLead: 'Қонақ QR-ды сканерлеп, тағамды бірнеше секундта табады: өз тілінде, суретімен және ақылды іздеумен. Бағалар мен стоп-парақты өзіңіз телефоннан өзгертесіз.',
      heroCta: '2 минутта өз демоңызды жинаңыз', heroLink: 'Тірі мәзірді ашу',
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
      o2t: 'Статистика', o2p: 'Қонақтар нені ашады, нені іздейді және себетке нені салады, күн мен сағат бойынша.',
      o3t: 'Сторис, акциялар, бизнес-ланч', o3p: 'Бейне мен акциялар мәзірдің жоғарғы жағында, Инстаграмдағыдай. Аптаның әр күнгі ланчы өзі ауысады.',
      o4t: 'Өз доменіңіз бен стиліңіз', o4p: 'Мәзір сіздің мекенжайыңызда, tipagraf.kz сияқты, логотипіңізбен, түстеріңізбен және қаріптеріңізбен.',
      o5t: 'Күтусіз тапсырыс', o5p: 'Қонақ себетте тапсырыс жинап, экранды даяшыға көрсетеді немесе WhatsApp-қа жібереді.',
      adminNote: 'Бағаны өзгертіңіз немесе тағамды өшіріңіз: админкада осылай көрінеді.',
      exTitle: 'Тірі мысал: Типа Граф, Орал',
      exLead: 'tut.menu-дағы алғашқы мейрамхана. Бұл нағыз мәзір, оны қонақтар күн сайын пайдаланады. Камераны QR-ға бағыттаңыз немесе tipagraf.kz ашыңыз.',
      cap1: 'Мекеме бейнесімен сәлемдесу', cap2: 'Акциялар, бизнес-ланч және іздеу', cap3: 'Суреті мен сипаттамасы бар тағам',
      priceTitle: 'Бір баға, бәрі кіреді', pricePer: 'жылына, айына шамамен 20 000 ₸', priceCta: 'Демоны тегін жинау',
      p1: 'Үш тілдегі мәзір және ақылды іздеу', p2: '«Бұны бірге алады», себет және «Даяшыға көрсету»', p3: 'Телефоннан админка: бағалар, стоп-парақ, суреттер', p4: 'Сторис, акциялар және күн сайынғы бизнес-ланч', p5: 'Статистика: нені қарайды, нені іздейді', p6: 'Сіздің доменіңіз, логотипіңіз және дизайныңыз', p7: 'Мәзіріңізді PDF немесе сурет бойынша өзіміз көшіреміз', p8: 'WhatsApp арқылы қолдау',
      faqTitle: 'Жиі қойылатын сұрақтар',
      q1: 'Kaspi QR-мен жұмыс істей ме?', a1: 'Мәзір төлемге кедергі келтірмейді: қонақ әдеттегідей Kaspi QR немесе терминал арқылы төлейді. Мәзірге Kaspi төлем сілтемеңіз бар батырма қоса аламыз.',
      q2: 'iiko-мен интеграция бар ма?', a2: 'Қазір мәзір біздің админкада жүргізіледі, баға он секундта өзгереді. iiko-мен синхрондауды мекемеңізге қарай талқылаймыз.',
      q3: 'Іске қосуды қанша күту керек?', a3: 'Демо 2 минутта жиналады. Тағамдарыңыз бар дайын мәзірді әдетте 1–2 күнде іске қосамыз.',
      q4: 'Мәзірді кім толтырады?', a4: 'Біз. PDF, қағаз мәзірдің суретін немесе кестені жіберіңіз, тағамдарды, бағаларды және сипаттамаларды өзіміз көшіреміз. Кейін админкада түзетесіз.',
      q5: 'Қонаққа қосымша жүктеу керек пе?', a5: 'Жоқ. Мәзір QR-код арқылы браузерде ашылады, ештеңе орнатудың қажеті жоқ.',
      q6: 'Өз доменімде бола ма?', a6: 'Иә, tipagraf.kz сияқты. Доменіңіз әлі болмаса, қайдан сатып алуға болатынын айтып, өзіміз қосамыз.',
      finalTitle: 'Мәзіріңізді 2 минутта жинаңыз',
      finalLead: 'Дизайнды таңдап, логотипті жүктеңіз де, атауыңыз бар демо сілтемесін алыңыз. Тегін және қоңыраусыз.',
      finalCta: 'Демо жинау', finalWa: 'WhatsApp-қа жазу',
      footLine: 'Қазақстандағы кафе мен мейрамханаларға арналған ақылды QR-мәзір'
    },
    en: {
      navGuest: 'Guests', navOwner: 'Owners', navExample: 'Example', navPrice: 'Price', navFaq: 'FAQ', navCta: 'Build a demo',
      heroTitle: 'A smart QR menu for cafés and restaurants',
      heroLead: 'Guests scan the QR code and find a dish in seconds: in their language, with photos and smart search. You change prices and sold-out items yourself, from your phone.',
      heroCta: 'Build your demo in 2 minutes', heroLink: 'Open a live menu',
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
      o2t: 'Statistics', o2p: 'What guests open, search for and add to the cart, by day and hour.',
      o3t: 'Stories, offers, business lunch', o3p: 'Videos and offers at the top of the menu, like Instagram. The lunch for each weekday switches by itself.',
      o4t: 'Your domain and your style', o4p: 'The menu lives at your address, like tipagraf.kz, with your logo, colours and fonts.',
      o5t: 'Ordering without waiting', o5p: 'Guests build an order in the cart and show the screen to the waiter or send it via WhatsApp.',
      adminNote: 'Change a price or switch a dish off: this is how it looks in the admin.',
      exTitle: 'Live example: Tipa Graf, Uralsk',
      exLead: 'The first restaurant on tut.menu. A real menu that guests use every day. Point your camera at the QR code or open tipagraf.kz.',
      cap1: 'Welcome screen with the venue video', cap2: 'Offers, business lunch and search', cap3: 'A dish with photo and description',
      priceTitle: 'One price, everything included', pricePer: 'per year, about 20,000 ₸ a month', priceCta: 'Build a free demo',
      p1: 'Menu in three languages with smart search', p2: '“Goes well with”, cart and “Show the waiter”', p3: 'Admin from your phone: prices, sold-out, photos', p4: 'Stories, offers and daily business lunch', p5: 'Statistics: what guests view and search', p6: 'Your domain, logo and design', p7: 'We move your menu over from a PDF or photo', p8: 'Support via WhatsApp',
      faqTitle: 'Questions',
      q1: 'Does it work with Kaspi QR?', a1: 'The menu doesn’t get in the way of payment: guests pay as usual, with Kaspi QR or a terminal. We can add a button with your Kaspi payment link.',
      q2: 'Is there an iiko integration?', a2: 'For now the menu is managed in our admin, a price changes in ten seconds. We discuss iiko sync for each venue.',
      q3: 'How long until launch?', a3: 'A demo takes 2 minutes. A finished menu with your dishes usually goes live in 1–2 days.',
      q4: 'Who fills in the menu?', a4: 'We do. Send a PDF, a photo of your paper menu or a spreadsheet, and we’ll move the dishes, prices and descriptions. Then you edit in the admin.',
      q5: 'Do guests need to install an app?', a5: 'No. The menu opens in the browser from the QR code, nothing to install.',
      q6: 'Can it be on my own domain?', a6: 'Yes, like tipagraf.kz. If you don’t have a domain yet, we’ll tell you where to buy one and connect it for you.',
      finalTitle: 'Build your menu in 2 minutes',
      finalLead: 'Pick a design, upload your logo and get a demo link with your venue’s name. Free, no calls.',
      finalCta: 'Build a demo', finalWa: 'Message us on WhatsApp',
      footLine: 'A smart QR menu for cafés and restaurants in Kazakhstan'
    }
  };

  const nodes = [...document.querySelectorAll('[data-t]')];
  const RU = {};
  nodes.forEach((n) => { RU[n.dataset.t] = n.textContent; });
  T.ru = RU;
  const HTML_LANG = { ru: 'ru', kk: 'kk', en: 'en' };

  function setLang(l) {
    const d = T[l] || RU;
    nodes.forEach((n) => { const v = d[n.dataset.t]; if (v) n.textContent = v; });
    document.documentElement.lang = HTML_LANG[l];
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    try { localStorage.setItem('tm_lang', l); } catch {}
    updateWa(l);
  }
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  function updateWa(l) {
    const a = document.getElementById('waLink');
    if (!a) return;
    const text = { ru: 'Здравствуйте! Хочу QR-меню tut.menu для своего заведения.', kk: 'Сәлеметсіз бе! Мекемеме tut.menu QR-мәзірін қалаймын.', en: 'Hello! I’d like a tut.menu QR menu for my venue.' }[l] || '';
    a.href = WA_PHONE ? `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(text)}` : '#build';
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

  /* ---------- появление частей секций ---------- */
  const targets = document.querySelectorAll('section h2, .point, .ask, .guest__phone, .shot, .feats > div, .admin, .example__head > *, .example__phones figure, .price__grid, .faq details, .final > *');
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
