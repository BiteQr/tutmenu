/* =========================================================
   MENU PAGE — акции, поиск, категории, пилюли разделов, блюда
   ========================================================= */
(function (App) {
  const C = window.APP_CONFIG;
  const { $, $$, esc, money, norm, debounce, img, toast, bump, overlay, safeUrl } = App.utils;
  const I18n = App.I18n;
  const Cart = App.Cart;

  const root = $('#menu');
  const main = $('.menu__main', root);
  const els = {
    topbar: $('.topbar', root),
    logo: $('.topbar__logo', root),
    brand: $('.topbar__brand', root),
    langBtn: $('.lang__btn', root),
    langCur: $('.lang__current', root),
    langList: $('.lang__list', root),
    promos: $('#promos'),
    search: $('#searchInput'),
    searchClear: $('[data-action="clear-search"]', root),
    cats: $('#cats'),
    pills: $('#pills'),
    sections: $('#sections'),
    notFound: $('#notFound'),
    aiPick: $('#aiPick'),
    searchBar: $('#searchBar'),
    fabTop: $('.fab-top', root),
    fabCart: $('.fab-cart', root),
    promoModal: $('#promoModal'),
    variantSheet: $('#variantSheet'),
    lunch: $('#lunch'),
    lunchSheet: $('#lunchSheet')
  };

  let data = null;
  let sectionEls = [];          // DOM-узлы разделов в порядке отображения
  let activeSec = null;
  let activeCat = null;
  let spyLockUntil = 0;         // пауза scroll-spy во время программного скролла

  /* ---------------------------------------------------------
     RENDER: шапка
     --------------------------------------------------------- */
  function renderHeader() {
    const s = data.settings;
    const logo = s.logoHeader || s.logo;
    const oldName = $('.topbar__name', els.brand);
    if (oldName) oldName.remove();
    if (logo) {
      els.logo.src = safeUrl(logo);
      els.logo.alt = s.name || '';
      els.logo.hidden = false;
    } else {
      els.logo.hidden = true;
      els.brand.insertAdjacentHTML('beforeend', `<span class="topbar__name">${esc(s.name || '')}</span>`);
    }
    els.langBtn.innerHTML = `${FLAG[I18n.lang] || ''}<span class="lang__current">${I18n.SHORT[I18n.lang]}</span>${CHEV}`;
    els.langList.innerHTML = `<div class="lang__title">${esc(I18n.t('chooseLang'))}</div>` + I18n.langs.map((l, i) =>
      `<button type="button" role="menuitemradio" aria-checked="${l === I18n.lang}" data-lang="${l}" class="lang__opt${l === I18n.lang ? ' is-active' : ''}" style="--i:${i}">
         ${FLAG[l] || ''}<span class="lang__name"><b>${I18n.FULL[l]}</b>${SUB[l] !== I18n.FULL[l] ? `<small>${SUB[l]}</small>` : ''}</span>${CHECK}
       </button>`).join('');
  }

  /** Круглые флажки для выбора языка (простые SVG, без внешних картинок) */
  const FLAG = {
    ru: '<svg class="flag" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="fc-ru"><circle cx="12" cy="12" r="12"/></clipPath></defs><g clip-path="url(#fc-ru)"><rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#1c57a7"/><rect y="16" width="24" height="8" fill="#d52b1e"/></g></svg>',
    kk: '<svg class="flag" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#00afca"/><g fill="#fec50c"><circle cx="12" cy="10.5" r="3.2"/>' +
      Array.from({ length: 12 }, (_, i) => `<rect x="11.55" y="4.4" width=".9" height="1.6" rx=".3" transform="rotate(${i * 30} 12 10.5)"/>`).join('') +
      '<path d="M7.2 15.2c1.6.9 3.2 1.3 4.8 1.3s3.2-.4 4.8-1.3c-.5 1.2-2.4 2.2-4.8 2.2s-4.3-1-4.8-2.2z"/></g></svg>',
    en: '<svg class="flag" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="fc-en"><circle cx="12" cy="12" r="12"/></clipPath></defs><g clip-path="url(#fc-en)"><rect width="24" height="24" fill="#012169"/><path d="M0 0l24 24M24 0L0 24" stroke="#fff" stroke-width="4.4"/><path d="M0 0l24 24M24 0L0 24" stroke="#c8102e" stroke-width="1.6"/><path d="M12 0v24M0 12h24" stroke="#fff" stroke-width="6"/><path d="M12 0v24M0 12h24" stroke="#c8102e" stroke-width="3.4"/></g></svg>'
  };
  const CHECK = '<svg class="lang__check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const CHEV = '<svg class="lang__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const SUB = { ru: 'Russian', kk: 'Kazakh', en: 'English' };

  /* ---------------------------------------------------------
     RENDER: акции
     --------------------------------------------------------- */
  /** Акция — фото ИЛИ горизонтальное видео (с автовоспроизведением, без звука,
   *  как и на главном экране). Если задано видео — показываем его, иначе фото/заглушку. */
  function promoMediaHTML(p, cls, eager) {
    if (p.video) {
      const posterAttr = p.image ? ` poster="${esc(safeUrl(p.image))}"` : '';
      return `<video class="${cls}" src="${esc(safeUrl(p.video))}"${posterAttr} autoplay muted loop playsinline preload="metadata"></video>`;
    }
    return photoHTML(p.image, cls, I18n.f(p, 'title'), eager);
  }

  // Если видео акции не может проиграться на этом телефоне (старый формат, нет кодека) —
  // вместо чёрного прямоугольника показываем обложку (или заглушку). 'error' у <video>
  // не всплывает, поэтому ловим на этапе погружения.
  document.addEventListener('error', (e) => {
    const v = e.target;
    if (!v || v.tagName !== 'VIDEO' || v.dataset.failed) return;
    if (!v.closest('#promos, #promoModal')) return;
    v.dataset.failed = '1';
    const tmp = document.createElement('div');
    tmp.innerHTML = photoHTML(v.getAttribute('poster') || '', v.className, '', true);
    if (tmp.firstElementChild) v.replaceWith(tmp.firstElementChild);
  }, true);

  function renderPromos() {
    els.promos.hidden = !data.promos.length;
    els.promos.innerHTML = data.promos.map((p, i) =>
      `<button type="button" class="promo" data-promo="${i}" aria-label="${esc(I18n.f(p, 'title'))}">
         ${promoMediaHTML(p, '', i < 2)}
       </button>`).join('');
  }

  let hintShown = false;
  /** Лёгкая подсказка при первом входе: лента акций слегка сдвигается
      и возвращается — показывает, что её можно скроллить.
      Двигаем через transform, а не реальный scrollLeft: у ленты
      включён scroll-snap (CSS), и мандаторный снэп мгновенно "съедает"
      любой маленький программный scrollTo, так что настоящий скролл
      для такой короткой подсказки ненадёжен в разных браузерах. */
  function hintPromosScroll() {
    if (hintShown || !data.promos || data.promos.length < 2) return;
    hintShown = true;
    const row = els.promos;
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (row.hidden) return;
        row.style.transition = 'transform .45s cubic-bezier(.22,.9,.3,1)';
        row.style.transform = 'translateX(-22px)';
        setTimeout(() => {
          row.style.transform = 'translateX(0)';
          setTimeout(() => { row.style.transition = ''; row.style.transform = ''; }, 480);
        }, 480);
      }, 650);
    });
  }

  function openPromo(i) {
    const p = data.promos[i];
    if (!p) return;
    App.track('view_promo', { id: p.id });
    const item = p.itemId ? Cart.getItem(String(p.itemId)) : null;
    const title = I18n.f(p, 'title');
    const desc = I18n.f(p, 'description');
    $('.overlay__content', els.promoModal).innerHTML = `
      ${promoMediaHTML(p, 'promo-full__img', true)}
      <div class="promo-full__body">
        ${title ? `<h3 class="promo-full__title">${esc(title)}</h3>` : ''}
        ${desc ? `<p class="promo-full__desc">${esc(desc)}</p>` : ''}
        ${item ? `<button type="button" class="promo-full__btn" data-goto-item="${esc(item.id)}">${esc(I18n.f(p, 'button') || I18n.t('viewDish'))}</button>` : ''}
      </div>`;
    overlay.open(els.promoModal);
  }

  /* ---------------------------------------------------------
     RENDER: категории + пилюли + разделы
     --------------------------------------------------------- */
  /** Группируем: категория → разделы → блюда. Пустые разделы не показываем. */
  function buildTree() {
    const itemsBySec = new Map();
    data.menuItems.forEach((it) => {
      if (!itemsBySec.has(it.sectionId)) itemsBySec.set(it.sectionId, []);
      itemsBySec.get(it.sectionId).push(it);
    });

    const withItems = (s) => (itemsBySec.get(s.id) || []).length > 0;
    const catIds = new Set(data.categories.map((c) => c.id));

    // Карточки категорий — в порядке вкладки «Категории» (только те, где есть блюда)
    const tree = data.categories.map((cat) => ({
      cat,
      sections: data.sections.filter((s) => s.categoryId === cat.id && withItems(s))
    })).filter((g) => g.sections.length);

    // Разделы (ленточка и сами блюда) — ровно в порядке вкладки «Разделы» в админке,
    // независимо от категории. Так, например, «Детское меню» можно поставить среди
    // основных разделов, а карточку категории «Детское меню» — после «Барного».
    // Нажатие на карточку категории всё равно ведёт к её первому разделу, где бы он ни стоял.
    const ordered = data.sections
      .filter(withItems)
      .map((s) => ({ s, catId: catIds.has(s.categoryId) ? s.categoryId : '' }));

    return { tree, ordered, itemsBySec };
  }

  function variantHTML(v) {
    const price = `<span>${money(v.price)}</span>`;
    const label = `<span>${esc(v.label)}</span>`;
    const dots = '<span class="variant__dots"></span>';
    if (!v.label) return `<div class="variant">${price}</div>`;
    return `<div class="variant">${C.VARIANT_ORDER === 'label-first' ? label + dots + price : price + dots + label}</div>`;
  }

  /** Плашки меток (Хит продаж, Веган, Острое…) на карточке блюда.
   *  Фон и цвет текста — независимые поля из админки. Если задан только фон
   *  (старые метки, созданные до появления отдельного цвета текста) — ведём
   *  себя как раньше: лёгкий тон фона + тот же цвет на тексте. */
  /** Фото блюда/категории — если фото не загружено, показываем свою заглушку
   *  (иконка на фоне из палитры темы), а не пустое место. Ничего не грузится
   *  извне — не может сломаться или не отрисоваться. */
  function photoHTML(src, cls, alt, eager) {
    if (src) return img(src, cls, alt, eager);
    return `<div class="${cls} img-ph" aria-hidden="true">🍽</div>`;
  }

  function badgeStyle(b) {
    if (b.color && b.textColor) return `background:${esc(b.color)};color:${esc(b.textColor)};`;
    if (b.color) return `background:${esc(b.color)}1f;color:${esc(b.color)};`;
    return '';
  }

  function badgesHTML(badges) {
    if (!badges || !badges.length) return '';
    return `<div class="item-badges">${badges.map((b) =>
      `<span class="item-badge" style="${badgeStyle(b)}">${b.icon ? esc(b.icon) + ' ' : ''}${esc(I18n.f(b, 'title'))}</span>`
    ).join('')}</div>`;
  }

  function itemHTML(it, secTitle = '') {
    const title = I18n.f(it, 'title');
    const desc = I18n.f(it, 'description');
    const hasVariants = it.variants.length > 0;
    // Ищем по названию (на всех языках), описанию и названию раздела («пицца» найдёт весь раздел)
    const searchStr = norm(`${title} ${desc} ${it.title_ru || ''} ${it.title_en || ''} ${it.title_kk || ''} ${secTitle}`);

    return `
      <article class="item" id="item-${esc(it.id)}" data-search="${esc(searchStr)}">
        ${photoHTML(it.image, 'item__img', title)}
        <div class="item__body">
          ${badgesHTML(it.badges)}
          <h3 class="item__title">${esc(title)}</h3>
          ${desc ? `<p class="item__desc">${esc(desc)}</p>` : ''}
          <span class="item__more">${esc(I18n.t('more'))}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
          ${hasVariants ? `<div class="variants">${it.variants.map(variantHTML).join('')}</div>` : ''}
          <div class="item__foot">
            ${!hasVariants && it.price ? `<span class="item__price">${money(it.price)}</span>` : ''}
            <button type="button" class="add-btn" data-add="${esc(it.id)}" aria-label="+ ${esc(title)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
      </article>`;
  }

  function renderBody() {
    const { tree, ordered, itemsBySec } = buildTree();

    els.cats.hidden = tree.filter((g) => g.cat).length < 2;
    els.cats.innerHTML = tree.filter((g) => g.cat).map(({ cat }) =>
      `<button type="button" class="cat" data-cat="${esc(cat.id)}">
         ${photoHTML(cat.image, 'cat__img', I18n.f(cat, 'title'), true)}
         <span class="cat__title">${esc(I18n.f(cat, 'title'))}</span>
       </button>`).join('');

    els.pills.innerHTML = ordered.map(({ s }) =>
      `<button type="button" class="pill" data-sec="${esc(s.id)}"><span>${esc(I18n.f(s, 'title'))}</span></button>`
    ).join('') + '<span class="pills__ind" aria-hidden="true"></span>';
    pillInd = null; // новая разметка — капсулу ставим заново без анимации

    // Одна строка над списком блюд: фото — для ориентира (только если в меню есть фото)
    const hasPhotos = data.menuItems.some((it) => it.image);
    const photoNote = hasPhotos
      ? `<p class="menu-photo-note"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>${esc(I18n.t('photoNote'))}</span></p>` : '';

    els.sections.innerHTML = photoNote + ordered.map(({ s, catId }) => {
        const sub = I18n.f(s, 'subtitle');
        return `
          <section class="section" id="sec-${esc(s.id)}" data-sec="${esc(s.id)}" data-cat="${esc(catId)}">
            <h2 class="section__title">${esc(I18n.f(s, 'title'))}</h2>
            ${sub ? `<p class="section__sub">${esc(sub)}</p>` : ''}
            <div class="items">${itemsBySec.get(s.id).map((it) => itemHTML(it, I18n.f(s, 'title'))).join('')}</div>
          </section>`;
      }).join('');

    sectionEls = $$('.section', els.sections);
    observeReveal();
    activeSec = activeCat = null;
    applySearch();
    updateBadges();
    onScroll();
  }

  /* ---------------------------------------------------------
     БИЗНЕС-ЛАНЧ: карточка «сегодня / завтра» над поиском + меню недели.
     Настройка в админке: settings.lunch = {
       enabled, price, from:'12:00', to:'15:00', days:[1..5],
       start:'2026-11-02' (понедельник недели 1),
       weeks:[ { '1':[{c:'Салат',n:'Ачик-чук'},…], '2':[…] }, … ] }
     Недели крутятся по кругу от даты start.
     --------------------------------------------------------- */
  const LUNCH_DAY = 864e5;
  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  function lunchCfg() {
    const L = data && data.settings && data.settings.lunch;
    if (!L || !L.enabled || !Array.isArray(L.weeks) || !L.weeks.length) return null;
    return L;
  }
  /** Неделя ротации для даты */
  function lunchWeekFor(L, date) {
    const st = new Date(String(L.start || '') + 'T00:00:00');
    if (isNaN(st)) return L.weeks[0];
    const mon = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const diff = Math.round((mon(date) - mon(st)) / (7 * LUNCH_DAY));
    const n = L.weeks.length;
    return L.weeks[((diff % n) + n) % n];
  }
  const lunchItems = (L, date) => (lunchWeekFor(L, date) || {})[String(date.getDay())] || [];
  /** Какой день показывать: сегодня (до конца ланча) или ближайший следующий */
  function lunchTarget(L, now) {
    const days = (L.days && L.days.length ? L.days : [1, 2, 3, 4, 5]).map(Number);
    const to = hm(L.to) ?? 15 * 60, from = hm(L.from) ?? 12 * 60;
    const mins = now.getHours() * 60 + now.getMinutes();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (!days.includes(d.getDay())) continue;
      if (i === 0 && mins >= to) continue;
      if (!lunchItems(L, d).length) continue;
      const state = i === 0 ? (mins >= from ? 'live' : 'soon') : 'next';
      return { date: d, offset: i, state };
    }
    return null;
  }
  function lunchFill(str, o) { return str.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? ''); }
  function lunchRows(items) {
    return items.map((x) => `<li><small>${esc(I18n.f(x, 'c') || x.c || '')}</small><b>${esc(I18n.f(x, 'n') || x.n || '')}</b></li>`).join('');
  }
  function renderLunch() {
    const L = lunchCfg();
    if (!L) { els.lunch.hidden = true; els.lunch.innerHTML = ''; return; }
    const tg = lunchTarget(L, new Date());
    if (!tg) { els.lunch.hidden = true; return; }
    const lc = String(L.color || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(lc)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(lc.slice(i, i + 2), 16) / 255);
      const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
      els.lunch.style.setProperty('--lunch-bg', lc);
      els.lunch.style.setProperty('--lunch-fg', dark ? '#f6efe4' : '#1c1c1e');
      els.lunch.classList.toggle('is-dark', dark);
    } else { els.lunch.style.removeProperty('--lunch-bg'); els.lunch.style.removeProperty('--lunch-fg'); els.lunch.classList.remove('is-dark'); }
    const full = I18n.t('lunchDaysFull'), tab = I18n.t('lunchDaysTab');
    const when = tg.offset === 0 ? I18n.t('lunchToday')
      : tg.offset === 1 ? I18n.t('lunchTomorrow')
      : lunchFill(I18n.t('lunchOn'), { day: full[tg.date.getDay()] });
    const status = tg.state === 'live'
      ? `<span class="lunch__badge is-live"><i></i>${esc(lunchFill(I18n.t('lunchLive'), { to: L.to || '15:00' }))}</span>`
      : `<span class="lunch__badge">${esc(tg.state === 'soon' ? lunchFill(I18n.t('lunchSoon'), { from: L.from || '12:00' }) : when)}</span>`;
    els.lunch.innerHTML = `
      <button type="button" class="lunch__card lunch__card--row" data-lunch-open aria-label="${esc(I18n.t('lunchWeek'))}">
        <span class="lunch__name">${esc(L.title || I18n.t('lunchTitle'))}</span>
        ${status}
        <span class="lunch__price">${esc(money(L.price))}</span>
        <svg class="lunch__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    els.lunch.hidden = false;
  }
  function openLunchWeek(dayIdx) {
    const L = lunchCfg(); if (!L) return;
    const tg = lunchTarget(L, new Date());
    const base = tg ? tg.date : new Date();
    const days = (L.days && L.days.length ? L.days : [1, 2, 3, 4, 5]).map(Number);
    const mon = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
    const dates = days.map((d) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + ((d + 6) % 7)));
    const sel = dayIdx ?? (tg ? tg.date.getDay() : days[0]);
    const tab = I18n.t('lunchDaysTab');
    const today = new Date().getDay();
    const cur = dates.find((d) => d.getDay() === sel) || dates[0];
    $('.overlay__content', els.lunchSheet).innerHTML = `
      <div class="lunch-week">
        <h3 class="lunch-week__title">${esc(L.title || I18n.t('lunchTitle'))}</h3>
        <p class="lunch-week__sub">${esc(L.from || '12:00')}–${esc(L.to || '15:00')} · ${esc(money(L.price))}</p>
        <div class="lunch-week__tabs" role="tablist">${dates.map((d) => `
          <button type="button" role="tab" data-lunch-day="${d.getDay()}" class="lunch-week__tab${d.getDay() === sel ? ' is-active' : ''}${d.getDay() === today ? ' is-today' : ''}" aria-selected="${d.getDay() === sel}">
            <b>${esc(tab[d.getDay()])}</b><small>${d.getDate()}</small>
          </button>`).join('')}</div>
        <ul class="lunch__list lunch-week__list">${lunchRows(lunchItems(L, cur))}</ul>
        ${L.note ? `<p class="lunch-week__note">${esc(I18n.f(L, 'note') || L.note)}</p>` : ''}
      </div>`;
    if (els.lunchSheet.hidden) { App.track && App.track('view_lunch', {}); overlay.open(els.lunchSheet); }
  }
  els.lunchSheet.addEventListener('click', (e) => {
    const t = e.target;
    if (t === els.lunchSheet || t.closest('[data-action="close-overlay"]')) { overlay.close(els.lunchSheet); return; }
    const d = t.closest('[data-lunch-day]');
    if (d) openLunchWeek(+d.dataset.lunchDay);
  });

  function render(d) {
    data = d;
    els.sections.dataset.itemLayout = d.settings.itemLayout || 'list';
    renderHeader();
    renderPromos();
    renderLunch();
    renderBody();
    I18n.applyStatic();
    hintPromosScroll();
  }

  /* ---------------------------------------------------------
     ВЫБОР ЯЗЫКА ПРИ ВХОДЕ В МЕНЮ
     Один раз за визит (не при каждом возврате на экран меню в рамках
     одной сессии) — гость явно выбирает язык до того, как увидит блюда.
     --------------------------------------------------------- */
  const LANG_PROMPT_KEY = 'menu_lang_asked_v1';
  let langPromptDone = false;

  /** true — если окно выбора языка сейчас показано (тогда уведомление покажем после выбора языка) */
  function maybeShowLangPrompt() {
    if (langPromptDone) return false;
    let asked = null;
    try { asked = sessionStorage.getItem(LANG_PROMPT_KEY); } catch { /* приватный режим — просто спросим ещё раз, не страшно */ }
    if (asked) { langPromptDone = true; return false; }
    langPromptDone = true;

    const st = App.data?.settings || {};
    const dark = document.documentElement.dataset.langStyle === 'dark' || /^#/.test(getComputedStyle(document.documentElement).getPropertyValue('--lang-fg').trim()) && getComputedStyle(document.documentElement).getPropertyValue('--lang-fg').trim().toLowerCase() !== '#1c1c1e';
    const logo = dark ? (st.logoWelcome || st.logoHeader) : (st.logoHeader || st.logoWelcome);
    const ARROW = '<svg class="lang-overlay__go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    const el = document.createElement('div');
    el.className = 'lang-overlay' + (dark ? ' is-dark' : '');
    el.innerHTML = `
      <div class="lang-overlay__panel" role="dialog" aria-modal="true" aria-label="Language">
        ${logo ? `<img class="lang-overlay__logo" src="${esc(safeUrl(logo))}" alt="${esc(st.name || '')}">` : `<div class="lang-overlay__name">${esc(st.name || '')}</div>`}
        <div class="lang-overlay__title"><b>Тілді таңдаңыз</b><span>Выберите язык · Choose language</span></div>
        <div class="lang-overlay__list">
          ${I18n.langs.map((l, i) => `<button type="button" class="lang-overlay__btn" data-pick-lang="${l}" style="--i:${i}">
            ${FLAG[l] || ''}<span class="lang-overlay__lbl"><b>${esc(I18n.FULL[l])}</b>${SUB[l] !== I18n.FULL[l] ? `<small>${SUB[l]}</small>` : ''}</span>${ARROW}${CHECK}
          </button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));

    el.querySelectorAll('[data-pick-lang]').forEach((btn) => {
      btn.onclick = () => {
        if (el.classList.contains('is-closing')) return;
        try { sessionStorage.setItem(LANG_PROMPT_KEY, '1'); } catch { /* ignore */ }
        btn.classList.add('is-picked');
        I18n.set(btn.dataset.pickLang);
        // короткая галочка на выбранном языке, потом окно плавно уходит
        setTimeout(() => el.classList.add('is-closing'), 260);
        setTimeout(() => { el.remove(); App.Welcome.maybeShowNotice(); }, 560); // уведомление — уже на выбранном языке
      };
    });
    return true;
  }

  // Срабатывает в момент, когда экран меню РЕАЛЬНО становится видимым — неважно,
  // пришёл ли гость по клику, кнопке «назад» в браузере или прямой ссылке на #/menu.
  // Сначала язык (если ещё не спрашивали), потом уведомление владельца — по очереди, не друг на друге.
  new MutationObserver(() => {
    if (root.hidden) return;
    if (revealPending) observeReveal();
    requestAnimationFrame(() => movePillInd(true));
    if (!maybeShowLangPrompt()) App.Welcome.maybeShowNotice();
  })
    .observe(root, { attributes: true, attributeFilter: ['hidden'] });

  /* ---------------------------------------------------------
     СКРОЛЛ: навигация и scroll-spy
     --------------------------------------------------------- */
  const stickyOffset = () => els.topbar.offsetHeight + els.searchBar.offsetHeight + els.pills.offsetHeight + 8;

  function scrollToEl(el, smooth = true) {
    // прыжок к разделу: карточки цели и следующего раздела показываем сразу, без ожидания проявления
    const sec = el.closest ? (el.closest('.section') || el) : el;
    [sec, sec && sec.nextElementSibling].forEach((x) => x && $$('.reveal', x).concat(x.classList && x.classList.contains('reveal') ? [x] : []).forEach((r) => r.classList.add('is-in')));
    const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
    spyLockUntil = Date.now() + 900;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  /** Горизонтально подкрутить ленту, чтобы элемент был виден */
  function centerInRow(row, el) {
    if (!row || !el) return;
    const left = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  /* ---------------------------------------------------------
     АНИМАЦИИ: «капсула» активного раздела, появление при прокрутке, полёт в корзину
     --------------------------------------------------------- */
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pillInd = null;

  /** Тёмная капсула переезжает под активный раздел как капля:
   *  передний край убегает вперёд, задний догоняет, капля вытягивается и слегка сплющивается,
   *  потом собирается на новом месте с небольшим пружинящим «бульком». */
  let pillAnim = null;
  function movePillInd(instant) {
    const ind = $('.pills__ind', els.pills);
    const pill = $('.pill.is-active:not([hidden])', els.pills);
    if (!ind) return;
    if (!pill) { ind.style.opacity = '0'; return; }
    const first = pillInd !== ind;           // первая установка — без анимации
    pillInd = ind;
    const x1 = pill.offsetLeft, y = pill.offsetTop, w1 = pill.offsetWidth, h = pill.offsetHeight;
    // где капля сейчас (в том числе посреди предыдущего перелёта)
    let x0 = x1, w0 = w1;
    if (!first) {
      const cs = getComputedStyle(ind);
      const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
      x0 = m.m41; w0 = parseFloat(cs.width) || w1;
    }
    if (pillAnim) { pillAnim.cancel(); pillAnim = null; }
    ind.style.opacity = '1';
    ind.style.width = w1 + 'px';
    ind.style.height = h + 'px';
    ind.style.transform = `translate(${x1}px, ${y}px)`;
    if (first || instant || reduceMotion || !ind.animate || Math.abs(x1 - x0) < 2) return;

    const right = x1 > x0;
    const left0 = x0, right0 = x0 + w0, left1 = x1, right1 = x1 + w1;
    // середина пути: капля растянута от «хвоста» до «головы»
    const midL = right ? left0 + (left1 - left0) * 0.12 : left1;
    const midR = right ? right1 : right0 - (right0 - right1) * 0.12;
    const over = right ? 5 : -5;              // лёгкий перелёт вперёд
    const T = (x, w, sy, sx = 1) => ({ transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})`, width: w + 'px' });
    pillAnim = ind.animate([
      { ...T(left0, w0, 1), offset: 0 },
      { ...T(midL, midR - midL, 0.78), offset: 0.42, easing: 'cubic-bezier(.4,0,.2,1)' },
      { ...T(left1 + over, w1 - Math.abs(over) * 0.4, 1.1, 1.03), offset: 0.74, easing: 'cubic-bezier(.3,.6,.3,1)' },
      { ...T(left1 - over * 0.3, w1, 0.96), offset: 0.88 },
      { ...T(left1, w1, 1), offset: 1 }
    ], { duration: 620, easing: 'cubic-bezier(.3,.7,.2,1)' });
    pillAnim.onfinish = () => { pillAnim = null; };
  }
  window.addEventListener('resize', () => movePillInd(true));

  /** Заголовки разделов и карточки мягко проявляются снизу при первой прокрутке до них */
  let revealObs = null, revealPending = false;
  function observeReveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    if (root.hidden) { revealPending = true; return; } // меню ещё не на экране — запустим при показе
    revealPending = false;
    if (revealObs) revealObs.disconnect();
    revealObs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        revealObs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    const vh = window.innerHeight;
    $$('.section__title, .item', els.sections).forEach((el, i) => {
      if (el.getBoundingClientRect().top < vh) return; // то, что уже на экране, не прячем
      el.classList.add('reveal');
      if (el.classList.contains('item')) el.style.setProperty('--reveal-delay', ((i % 2) * 70) + 'ms');
      revealObs.observe(el);
    });
  }

  /** Фото блюда «улетает» в корзину */
  function flyToCart(sourceBtn) {
    if (reduceMotion || !sourceBtn || !sourceBtn.isConnected) return;
    const card = sourceBtn.closest('.item, .ai-card, .rec-card, .item-detail-overlay');
    const img = card && $('img', card);
    if (!img) return;
    const from = img.getBoundingClientRect();
    if (!from.width) return;
    requestAnimationFrame(() => {
      const to = els.fabCart.getBoundingClientRect();
      const tx = to.width ? to.left + to.width / 2 : window.innerWidth - 60;
      const ty = to.width ? to.top + to.height / 2 : window.innerHeight - 60;
      const size = Math.min(from.width, from.height, 120);
      const ghost = img.cloneNode();
      ghost.className = 'fly-ghost';
      Object.assign(ghost.style, { left: (from.left + from.width / 2 - size / 2) + 'px', top: (from.top + from.height / 2 - size / 2) + 'px', width: size + 'px', height: size + 'px' });
      document.body.appendChild(ghost);
      const dx = tx - (from.left + from.width / 2), dy = ty - (from.top + from.height / 2);
      const anim = ghost.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(.6)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: 0.6 }
      ], { duration: 650, easing: 'cubic-bezier(.45,0,.2,1)' });
      anim.onfinish = () => { ghost.remove(); bump(els.fabCart); };
    });
  }

  function setActive(secEl) {
    const secId = secEl ? secEl.dataset.sec : null;
    const catId = secEl ? secEl.dataset.cat : null;

    if (secId !== activeSec) {
      activeSec = secId;
      $$('.pill', els.pills).forEach((p) => p.classList.toggle('is-active', p.dataset.sec === secId));
      movePillInd();
      centerInRow(els.pills, $(`.pill.is-active`, els.pills));
    }
    if (catId !== activeCat) {
      activeCat = catId;
      $$('.cat', els.cats).forEach((c) => c.classList.toggle('is-active', c.dataset.cat === catId));
      centerInRow(els.cats, $('.cat.is-active', els.cats));
    }
  }

  function onScroll() {
    if (root.hidden) return;
    els.fabTop.classList.toggle('is-hidden', window.scrollY < 500);
    if (Date.now() < spyLockUntil) return;

    const visible = sectionEls.filter((s) => !s.hidden);
    const offset = stickyOffset() + 24;
    let current = visible[0] || null;
    for (const s of visible) {
      if (s.getBoundingClientRect().top - offset <= 0) current = s; else break;
    }
    // В самом низу страницы — активен последний раздел
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && visible.length) {
      current = visible[visible.length - 1];
    }
    setActive(current);
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });

  function goToSection(secId) {
    const el = document.getElementById('sec-' + secId);
    if (!el) return;
    setActive(el);
    scrollToEl(el);
  }

  function goToCategory(catId) {
    const el = sectionEls.find((s) => s.dataset.cat === catId && !s.hidden);
    if (!el) return;
    setActive(el);
    scrollToEl(el);
    App.track('view_category', { id: catId });
  }

  function goToItem(id) {
    if (els.search.value) { els.search.value = ''; applySearch(); }
    const el = document.getElementById('item-' + id);
    if (!el) return;
    scrollToEl(el);
    bump(el, 'flash');
  }

  /* ---------------------------------------------------------
     ПОИСК
     --------------------------------------------------------- */
  function applySearch() {
    const q = norm(els.search.value);
    els.searchClear.hidden = !q;
    main.classList.toggle('is-searching', !!q);

    let found = 0;
    sectionEls.forEach((sec) => {
      let secFound = 0;
      $$('.item', sec).forEach((it) => {
        const ok = !q || it.dataset.search.includes(q);
        it.hidden = !ok;
        if (ok) secFound++;
      });
      sec.hidden = secFound === 0;
      found += secFound;
      const pill = $(`.pill[data-sec="${CSS.escape(sec.dataset.sec)}"]`, els.pills);
      if (pill) pill.hidden = sec.hidden;
    });
    movePillInd(true);

    els.notFound.hidden = found > 0;
    els.notFound.textContent = I18n.t('notFound');
    updateAiPick(found);
    activeSec = null;
    onScroll();
  }


  /* ---------------------------------------------------------
     УМНЫЙ ПОИСК: гость пишет словами («хочу жирное, но не слишком»),
     ИИ на сервере подбирает 3–5 блюд из меню (/api/ai-search)
     --------------------------------------------------------- */
  const SPARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
  const ai = { q: '', status: 'idle', data: null, seq: 0 };
  const curLang = () => document.documentElement.lang || 'ru';

  /** Показываем кнопку «Подобрать с ИИ», когда гость пишет фразу (2+ слова) или обычный поиск ничего не нашёл */
  function updateAiPick(found) {
    const raw = els.search.value.replace(/\s+/g, ' ').trim();
    const words = raw.split(' ').filter(Boolean).length;
    // Поле в фокусе и пустое — учим: «напишите и нажмите ✨», плюс примеры, которые сразу запускают подбор
    if (!raw && document.activeElement === els.search) { ai.status = 'hint'; ai.q = ''; renderAiPick(); return; }
    if (raw.length < 3 || (words < 2 && found > 0)) { ai.status = 'idle'; ai.q = ''; els.aiPick.hidden = true; return; }
    if (ai.q === raw && ai.status !== 'idle') { renderAiPick(); return; } // уже показаны результаты/загрузка по этой фразе
    ai.status = 'offer'; ai.q = raw; ai.data = null;
    renderAiPick();
  }

  function renderAiPick() {
    const box = els.aiPick;
    box.hidden = false;
    // Пока ИИ подбирает или уже подобрал — «Ничего не нашлось» под подборкой только путает
    if (ai.status === 'offer' || ai.status === 'loading' || ai.status === 'done') els.notFound.hidden = true;
    if (ai.status === 'hint') {
      const ex = I18n.t('aiExamples');
      box.innerHTML = `
        <div class="ai-pick__panel ai-pick__hint">
          <div class="ai-pick__head"><span class="ai-pick__icon">${SPARK}</span><span>${esc(I18n.t('aiFocusHint'))}</span></div>
          <div class="ai-chips"><span class="ai-chips__label">${esc(I18n.t('aiTry'))}</span>${(Array.isArray(ex) ? ex : []).map((x) =>
            `<button type="button" class="ai-chip" data-ai-example="${esc(x)}">«${esc(x)}»</button>`).join('')}</div>
        </div>`;
      return;
    }
    if (ai.status === 'offer') {
      box.innerHTML = `
        <button type="button" class="ai-pick__offer" data-action="ai-pick">
          <span class="ai-pick__icon">${SPARK}</span>
          <span class="ai-pick__text"><b>${esc(I18n.t('aiPickBtn'))}</b><small>${esc(I18n.t('aiPressHint'))}</small></span>
          <svg class="ai-pick__go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>`;
      return;
    }
    if (ai.status === 'loading') {
      box.innerHTML = `
        <div class="ai-pick__panel is-loading">
          <div class="ai-pick__head"><span class="ai-pick__icon">${SPARK}</span><span>${esc(I18n.t('aiLoading'))}</span></div>
          ${'<div class="ai-card ai-card--skeleton"><span></span><i></i></div>'.repeat(3)}
        </div>`;
      return;
    }
    if (ai.status === 'error' || ai.status === 'empty') {
      const msg = ai.status === 'error' ? I18n.t('aiError') : (ai.data?.message || I18n.t('aiEmpty'));
      box.innerHTML = `<div class="ai-pick__panel"><div class="ai-pick__head"><span class="ai-pick__icon">${SPARK}</span><span>${esc(msg)}</span></div></div>`;
      return;
    }
    // done
    const cards = ai.data.items.map(({ id, reason }) => {
      const it = Cart.getItem(id);
      if (!it) return '';
      const title = I18n.f(it, 'title');
      const price = it.variants.length ? it.variants[0].price : it.price;
      return `
        <div class="ai-card" data-ai-open="${esc(it.id)}">
          ${photoHTML(it.image, 'ai-card__img', title)}
          <div class="ai-card__body">
            <div class="ai-card__title">${esc(title)}</div>
            ${reason ? `<div class="ai-card__reason">${esc(reason)}</div>` : ''}
            ${price ? `<div class="ai-card__price">${money(price)}</div>` : ''}
          </div>
          <button type="button" class="add-btn ai-card__add" data-add="${esc(it.id)}" aria-label="+ ${esc(title)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>`;
    }).join('');
    box.innerHTML = `
      <div class="ai-pick__panel">
        <div class="ai-pick__head">
          <span class="ai-pick__icon">${SPARK}</span>
          <span><b>${esc(I18n.t('aiTitle'))}</b>${ai.data.message ? `<small>${esc(ai.data.message)}</small>` : ''}</span>
        </div>
        ${cards}
        <p class="ai-pick__note">${esc(I18n.t('aiNote'))}</p>
      </div>`;
  }

  async function runAiPick() {
    const q = els.search.value.replace(/\s+/g, ' ').trim();
    if (q.length < 3) return;
    const my = ++ai.seq;
    ai.q = q; ai.status = 'loading'; ai.data = null;
    renderAiPick();
    App.track('ai_search', { q });
    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurantId: App.restaurantId, q, lang: curLang() })
      });
      const data = await res.json();
      if (my !== ai.seq || ai.q !== q) return; // гость уже поменял запрос
      if (!res.ok) throw new Error(data.error || res.status);
      ai.data = data;
      ai.status = (data.items || []).some((x) => Cart.getItem(x.id)) ? 'done' : 'empty';
    } catch {
      if (my !== ai.seq) return;
      ai.status = 'error';
    }
    renderAiPick();
  }

  /* ---------------------------------------------------------
     ДОБАВЛЕНИЕ В КОРЗИНУ (общий обработчик, используется и корзиной)
     --------------------------------------------------------- */
  function handleAdd(id, sourceBtn) {
    const item = Cart.getItem(id);
    if (!item) return;
    if (item.variants.length > 1) { openVariantSheet(item); return; }
    Cart.add(id, item.variants.length === 1 ? 0 : -1);
    bump(sourceBtn);
    flyToCart(sourceBtn);
    toast(I18n.t('added'));
    App.track('add_to_cart', { id: item.id, title: I18n.f(item, 'title') });
  }

  function openVariantSheet(item) {
    const title = I18n.f(item, 'title');
    $('.overlay__content', els.variantSheet).innerHTML = `
      <div class="sheet__head">
        <h3 class="sheet__title">${esc(title)}</h3>
        <p class="sheet__sub">${esc(I18n.t('chooseVariant'))}</p>
      </div>
      <div class="sheet__list">
        ${item.variants.map((v, i) => `
          <button type="button" class="sheet__opt" data-pick="${esc(item.id)}" data-v="${i}">
            <span>${esc(v.label || I18n.t('byDefault'))}</span>
            <span class="variant__dots"></span>
            <span>${money(v.price)}</span>
          </button>`).join('')}
      </div>`;
    overlay.open(els.variantSheet);
  }

  /** Карточка блюда открывается подробно — как уже устроено у акций (openPromo) и выбора
   *  варианта: то же самое всплывающее окно снизу, те же классы, никакого нового UI с нуля.
   *  Модалка создаётся один раз при первом открытии и дальше переиспользуется. */
  let itemDetailModal = null;
  function getItemDetailModal() {
    if (itemDetailModal) return itemDetailModal;
    itemDetailModal = document.createElement('div');
    itemDetailModal.id = 'itemDetailModal';
    // item-detail-overlay — вторым классом: .overlay нужен, чтобы попадать под общую
    // уборку модалок (overlay.closeAll() при навигации/Esc), а item-detail-overlay —
    // свои правила (по центру экрана, а не шторкой снизу, как у акций).
    itemDetailModal.className = 'overlay item-detail-overlay';
    itemDetailModal.hidden = true;
    itemDetailModal.innerHTML = `
      <div class="overlay__panel">
        <button type="button" class="overlay__close item-detail__close" data-action="close-overlay" aria-label="Закрыть">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="overlay__content"></div>
      </div>`;
    document.body.appendChild(itemDetailModal);

    itemDetailModal.addEventListener('click', (e) => {
      const t = e.target;
      if (t === itemDetailModal || t.closest('[data-action="close-overlay"]')) { overlay.close(itemDetailModal); return; }

      const ar = t.closest('[data-ar]');
      if (ar) { openArViewer(byId(ar.dataset.ar)); return; }
      const sp = t.closest('[data-spin]');
      if (sp) { openSpinViewer(byId(sp.dataset.spin)); return; }

      const pick = t.closest('[data-detail-pick]');
      if (pick) {
        Cart.add(pick.dataset.detailPick, +pick.dataset.v);
        overlay.close(itemDetailModal);
        toast(I18n.t('added'));
        bump($(`.add-btn[data-add="${CSS.escape(pick.dataset.detailPick)}"]`, els.sections));
        App.track('add_to_cart', { id: pick.dataset.detailPick });
        return;
      }
      const addBtn = t.closest('[data-detail-add]');
      if (addBtn) {
        overlay.close(itemDetailModal);
        handleAdd(addBtn.dataset.detailAdd, $(`.add-btn[data-add="${CSS.escape(addBtn.dataset.detailAdd)}"]`, els.sections));
        return;
      }
      // «С этим берут»: «+» — сразу в заказ, тап по карточке — открыть то блюдо
      const recAdd = t.closest('[data-rec-add]');
      if (recAdd) {
        const rec = Cart.getItem(recAdd.dataset.recAdd);
        if (rec && rec.variants.length) { overlay.close(itemDetailModal); handleAdd(rec.id, null); return; }
        handleAdd(recAdd.dataset.recAdd, recAdd);
        return;
      }
      const recOpen = t.closest('[data-open-rec]');
      if (recOpen) {
        const rec = Cart.getItem(recOpen.dataset.openRec);
        if (rec) openItemDetail(rec);
      }
    });
    return itemDetailModal;
  }

  /** «С этим берут» — блюда из поля «Рекомендации» в админке, маленькими карточками в ряд.
   *  Нажал на карточку — открывается то блюдо, на «+» — сразу в заказ. */
  function recsHTML(it) {
    const recs = (it.recommendations || []).map((id) => Cart.getItem(id)).filter(Boolean).slice(0, 8);
    if (!recs.length) return '';
    return `
      <div class="detail-recs">
        <h4 class="detail-recs__title">${esc(I18n.t('pairsWith'))}</h4>
        <div class="detail-recs__row">
          ${recs.map((r) => `
            <div class="rec-card" data-open-rec="${esc(r.id)}">
              ${photoHTML(r.image, 'rec-card__img', I18n.f(r, 'title'))}
              <div class="rec-card__title">${esc(I18n.f(r, 'title'))}</div>
              <div class="rec-card__foot">
                <span class="rec-card__price">${r.variants.length ? `${esc(I18n.t('from'))} ${money(Math.min(...r.variants.map((v) => v.price)))}` : money(r.price)}</span>
                <button type="button" class="rec-card__add" data-rec-add="${esc(r.id)}" aria-label="+ ${esc(I18n.f(r, 'title'))}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
     AR «НА СТОЛЕ» и 360°
     arImage — вырезанное фото блюда; /ar/<id>.glb собирает из него 3D-плоскость в натуральную величину.
     <model-viewer> (Google) открывает её в камере: iPhone — Quick Look, Android — Scene Viewer/WebXR.
     spin — 8–36 фото по кругу, гость крутит пальцем.
     --------------------------------------------------------- */
  const MV_SRC = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
  let mvLoading = null;
  function loadModelViewer() {
    if (window.customElements && customElements.get('model-viewer')) return Promise.resolve();
    if (!mvLoading) mvLoading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.type = 'module'; s.src = MV_SRC;
      s.onload = () => customElements.whenDefined('model-viewer').then(res); s.onerror = rej;
      document.head.appendChild(s);
    });
    return mvLoading;
  }
  const byId = (id) => (data.menuItems || []).find((x) => String(x.id) === String(id));
  function viewBtnsHTML(it) {
    const b = [];
    if (it.arImage) b.push(`<button type="button" class="view-btn" data-ar="${esc(it.id)}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>${esc(I18n.t('arBtn'))}</button>`);
    if (it.spin && it.spin.length >= 4) b.push(`<button type="button" class="view-btn" data-spin="${esc(it.id)}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>360°</button>`);
    return b.length ? `<div class="view-btns">${b.join('')}</div>` : '';
  }
  let viewerEl = null;
  function getViewer() {
    if (viewerEl) return viewerEl;
    viewerEl = document.createElement('div');
    viewerEl.className = 'overlay viewer-overlay';
    viewerEl.hidden = true;
    viewerEl.innerHTML = `<div class="overlay__panel viewer"><button type="button" class="overlay__close" data-action="close-overlay" aria-label="Закрыть"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="overlay__content"></div></div>`;
    document.body.appendChild(viewerEl);
    viewerEl.addEventListener('click', (e) => {
      if (e.target === viewerEl || e.target.closest('[data-action="close-overlay"]')) { $('.overlay__content', viewerEl).innerHTML = ''; overlay.close(viewerEl); }
    });
    return viewerEl;
  }
  async function openArViewer(it) {
    if (!it || !it.arImage) return;
    const v = getViewer(); const box = $('.overlay__content', v);
    const title = I18n.f(it, 'title');
    box.innerHTML = `<div class="viewer__stage"><div class="viewer__loading">${esc(I18n.t('arLoading'))}</div></div>
      <div class="viewer__body"><h3>${esc(title)}</h3><p>${esc(I18n.t('arHint'))}</p></div>`;
    overlay.open(v);
    App.track('view_ar', { id: it.id, title: I18n.f(it, 'title') });
    try { await loadModelViewer(); } catch { $('.viewer__loading', box).textContent = I18n.t('arError'); return; }
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', new URL(`/ar/${encodeURIComponent(it.id)}.glb`, location.href).href);
    mv.setAttribute('alt', title);
    mv.setAttribute('ar', ''); mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look'); mv.setAttribute('ar-scale', 'fixed');
    mv.setAttribute('camera-controls', ''); mv.setAttribute('touch-action', 'pan-y');
    mv.setAttribute('shadow-intensity', '1'); mv.setAttribute('exposure', '1');
    // «Стоит» — плоская фигура: сбоку она тонкая как лист, поэтому крутить даём только спереди
    if (it.arMode === 'stand') { mv.setAttribute('min-camera-orbit', '-45deg 50deg auto'); mv.setAttribute('max-camera-orbit', '45deg 95deg auto'); }
    // 'relief' — объём восстановлен по одному фото: сзади и сбоку модели нет, поэтому смотрим примерно с той же стороны, что и камера
    else if (it.arMode === 'relief') { mv.setAttribute('camera-orbit', '0deg 42deg auto'); mv.setAttribute('min-camera-orbit', '-55deg 15deg auto'); mv.setAttribute('max-camera-orbit', '55deg 68deg auto'); }
    else mv.setAttribute('auto-rotate', '');
    mv.setAttribute('camera-orbit', it.arMode === 'stand' ? '0deg 80deg auto' : '0deg 55deg auto');
    mv.setAttribute('interaction-prompt', 'none');
    mv.innerHTML = `<button slot="ar-button" class="viewer__ar">${esc(I18n.t('arPlace'))}</button>`;
    const stage = $('.viewer__stage', box); stage.innerHTML = ''; stage.appendChild(mv);
    mv.addEventListener('load', () => { if (!mv.canActivateAR) { const n = document.createElement('div'); n.className = 'viewer__note'; n.textContent = I18n.t('arNoAr'); stage.appendChild(n); } });
  }
  function openSpinViewer(it) {
    if (!it || !it.spin || !it.spin.length) return;
    const v = getViewer(); const box = $('.overlay__content', v);
    const frames = it.spin;
    box.innerHTML = `<div class="viewer__stage viewer__stage--spin">${frames.map((src, i) => `<img src="${esc(src)}" alt="" draggable="false" ${i ? 'hidden' : ''}>`).join('')}<div class="viewer__drag"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 12H3m0 0 3-3m-3 3 3 3M16 12h5m0 0-3-3m3 3-3 3"/></svg>${esc(I18n.t('spinHint'))}</div></div>
      <div class="viewer__body"><h3>${esc(I18n.f(it, 'title'))}</h3></div>`;
    overlay.open(v);
    App.track('view_ar', { id: it.id, title: I18n.f(it, 'title') + ' · 360' });
    const stage = $('.viewer__stage', box); const imgs = [...stage.querySelectorAll('img')];
    let cur = 0, startX = 0, startF = 0, drag = false, auto = 0, t0 = 0;
    const show = (f) => { const n = ((Math.round(f) % frames.length) + frames.length) % frames.length; if (n === cur) return; imgs[cur].hidden = true; imgs[n].hidden = false; cur = n; };
    // Подсказка-вращение один раз, пока гость не потянул сам
    const spinHint = (ts) => { if (drag || !stage.isConnected) return; if (!t0) t0 = ts; const k = (ts - t0) / 1800; if (k < 1) { show(Math.sin(k * Math.PI) * frames.length / 4); auto = requestAnimationFrame(spinHint); } else show(0); };
    auto = requestAnimationFrame(spinHint);
    stage.addEventListener('pointerdown', (e) => { drag = true; cancelAnimationFrame(auto); startX = e.clientX; startF = cur; stage.setPointerCapture(e.pointerId); stage.classList.add('is-drag'); });
    stage.addEventListener('pointermove', (e) => { if (drag) show(startF - (e.clientX - startX) / (stage.clientWidth / frames.length / 1.4)); });
    const end = () => { drag = false; stage.classList.remove('is-drag'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  }

  function openItemDetail(it, origin) {
    const modal = getItemDetailModal();
    const title = I18n.f(it, 'title');
    const desc = I18n.f(it, 'description');
    const hasVariants = it.variants.length > 0;
    markTipSeen(); // гость сам нашёл, что блюдо открывается — подсказка больше не нужна

    $('.overlay__content', modal).innerHTML = `
      <div class="item-detail__media">${photoHTML(it.image, 'item-detail__img', title, true)}${viewBtnsHTML(it)}</div>
      ${it.image ? `<p class="dish-photo-note"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>${esc(I18n.t('photoNote'))}</span></p>` : ''}
      <div class="promo-full__body${it.image ? ' promo-full__body--after-note' : ''}">
        ${badgesHTML(it.badges)}
        <h3 class="promo-full__title">${esc(title)}</h3>
        ${desc ? `<p class="promo-full__desc">${esc(desc)}</p>` : ''}
        ${hasVariants ? `
          <div class="sheet__list" style="padding:0;margin-top:18px;">
            ${it.variants.map((v, i) => `
              <button type="button" class="sheet__opt" data-detail-pick="${esc(it.id)}" data-v="${i}">
                <span>${esc(v.label || I18n.t('byDefault'))}</span>
                <span class="variant__dots"></span>
                <span>${money(v.price)}</span>
              </button>`).join('')}
          </div>` : `
          <button type="button" class="item-detail__add" data-detail-add="${esc(it.id)}">
            <span>${esc(I18n.t('addWithPrice'))}</span>
            ${it.price ? `<span class="item-detail__add-price">${money(it.price)}</span>` : ''}
          </button>`}
        ${recsHTML(it)}
      </div>`;
    const panel = $('.overlay__panel', modal);
    panel.scrollTop = 0;
    const wasOpen = !modal.hidden;
    overlay.open(modal);
    animateDetailOpen(modal, panel, origin, wasOpen);
  }

  /** Открытие карточки: окно «вырастает» из фото блюда, на котором нажали, потом текст поднимается снизу */
  function animateDetailOpen(modal, panel, origin, wasOpen) {
    if (reduceMotion || !panel.animate) return;
    const body = $('.promo-full__body', modal);
    const photo = $('.item-detail__img', modal);
    const ease = 'cubic-bezier(.2,.9,.25,1)';
    const srcEl = origin && $('.item__img, .ai-card__img, .rec-card img, img', origin);
    const src = srcEl ? srcEl.getBoundingClientRect() : null;
    requestAnimationFrame(() => {
      const dst = panel.getBoundingClientRect();
      if (src && src.width && dst.width && !wasOpen) {
        const k = src.width / dst.width;
        panel.animate([
          { transformOrigin: '0 0', transform: `translate(${src.left - dst.left}px, ${src.top - dst.top}px) scale(${k})`, opacity: 0.85 },
          { transformOrigin: '0 0', transform: 'none', opacity: 1 }
        ], { duration: 460, easing: ease });
        photo && photo.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 700, easing: ease });
      } else {
        // открыли из рекомендации внутри окна — мягкая смена содержимого
        panel.animate([{ opacity: 0.4, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: ease });
      }
      if (body) [...body.children].forEach((el, i) => el.animate(
        [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 160 + Math.min(i, 5) * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    });
  }

  /* ---------------------------------------------------------
     ПОДСКАЗКА «НАЖМИТЕ НА БЛЮДО»
     Один раз на устройство: пузырь над первым блюдом. Ждём, пока гость закроет
     окна выбора языка и уведомления, чтобы не наслаивать одно на другое.
     Исчезает по кнопке «Понятно» или как только гость сам открыл любое блюдо.
     --------------------------------------------------------- */
  const TIP_KEY = 'menu_tip_tap_v1';
  let tipTimer = 0;
  function tipSeen() { try { return !!localStorage.getItem(TIP_KEY); } catch { return true; } }
  function markTipSeen() {
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* ignore */ }
    clearInterval(tipTimer);
    $('.tip-tap', root)?.remove();
  }
  function scheduleTip() {
    if (tipSeen() || tipTimer) return;
    let tries = 0;
    tipTimer = setInterval(() => {
      if (++tries > 60 || tipSeen()) { clearInterval(tipTimer); return; }
      if (root.hidden) return;
      const blocked = document.querySelector('.overlay.is-open, .notice-overlay, .lang-overlay');
      if (blocked) return;
      // первое блюдо, которое сейчас видно на экране
      const first = $$('.item', els.sections).find((el) => {
        const r = el.getBoundingClientRect();
        return r.top > 80 && r.top < innerHeight * 0.7;
      });
      if (!first) return;
      clearInterval(tipTimer);
      const tip = document.createElement('div');
      tip.className = 'tip-tap';
      tip.innerHTML = `
        <span class="tip-tap__icon">👆</span>
        <span class="tip-tap__text">${esc(I18n.t('tipTap'))}</span>
        <button type="button" class="tip-tap__ok">${esc(I18n.t('tipOk'))}</button>`;
      // Ставим над всем списком раздела, а не внутрь него — иначе в виде «по 2 в ряд»
      // подсказка заняла бы место одной из клеток сетки и сломала раскладку.
      (first.closest('.items') || first).before(tip);
      requestAnimationFrame(() => tip.classList.add('is-shown'));
      tip.querySelector('.tip-tap__ok').onclick = (e) => { e.stopPropagation(); markTipSeen(); };
    }, 700);
  }
  new MutationObserver(() => { if (!root.hidden) setTimeout(scheduleTip, 1200); })
    .observe(root, { attributes: true, attributeFilter: ['hidden'] });

  /** Бейджи количества на кнопках «+» и плавающая кнопка корзины */
  function updateBadges() {
    $$('.add-btn', els.sections).forEach((btn) => {
      const q = Cart.qtyOf(btn.dataset.add);
      btn.classList.toggle('is-in', q > 0);
      if (q > 0) btn.textContent = q;
      else if (!btn.querySelector('svg')) {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
      }
    });

    const count = Cart.count();
    els.fabCart.classList.toggle('is-hidden', count === 0);
    $('.fab-cart__sum', els.fabCart).textContent = money(Cart.total());
    $('.fab-cart__count', els.fabCart).textContent = count;
  }

  /* ---------------------------------------------------------
     СОБЫТИЯ
     --------------------------------------------------------- */
  let langCloseTimer = null;
  function toggleLangList(force) {
    const isOpen = els.langList.classList.contains('is-open');
    const open = force ?? !isOpen;
    if (open === isOpen) return;
    clearTimeout(langCloseTimer);
    els.langBtn.setAttribute('aria-expanded', String(open));
    const wrap = root.querySelector('.lang');
    wrap.classList.toggle('is-open', open);
    const sheet = document.documentElement.dataset.langStyle === 'sheet';
    if (open) {
      // шторка снизу: шапка с размытием фона «запирает» fixed-элементы, поэтому выносим список на уровень страницы
      if (sheet) {
        if (!langBackdrop) {
          langBackdrop = document.createElement('div');
          langBackdrop.className = 'lang-backdrop';
          langBackdrop.addEventListener('click', () => toggleLangList(false));
        }
        document.body.append(langBackdrop, els.langList);
        requestAnimationFrame(() => langBackdrop.classList.add('is-open'));
      }
      els.langList.hidden = false;
      requestAnimationFrame(() => els.langList.classList.add('is-open'));
    } else {
      els.langList.classList.remove('is-open');
      if (langBackdrop) langBackdrop.classList.remove('is-open');
      langCloseTimer = setTimeout(() => {
        els.langList.hidden = true;
        if (els.langList.parentNode !== wrap) wrap.append(els.langList);
        if (langBackdrop) langBackdrop.remove();
      }, sheet ? 380 : 220); // даём доиграть анимации закрытия
    }
  }
  let langBackdrop = null;
  // выбор языка — прямо на списке, чтобы работало и когда шторка вынесена из меню
  els.langList.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-lang]');
    if (!opt) return;
    e.stopPropagation();
    I18n.set(opt.dataset.lang);
    toggleLangList(false);
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    const act = t.closest('[data-action]')?.dataset.action;

    if (act === 'toggle-lang') { toggleLangList(); return; }
    if (!t.closest('.lang')) toggleLangList(false);

    const lang = t.closest('[data-lang]');
    if (lang) { I18n.set(lang.dataset.lang); toggleLangList(false); return; }

    if (act === 'go-welcome') { App.back('#/'); return; }
    if (act === 'to-top') { e.preventDefault(); spyLockUntil = 0; window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (act === 'open-cart') { App.go('#/cart'); return; }
    if (act === 'clear-search') { els.search.value = ''; applySearch(); els.search.focus(); return; }
    if (act === 'ai-pick') { els.search.blur(); runAiPick(); return; }
    const aiEx = t.closest('[data-ai-example]');
    if (aiEx) { els.search.value = aiEx.dataset.aiExample; els.search.blur(); applySearch(); runAiPick(); return; }

    if (t.closest('[data-lunch-open]')) { openLunchWeek(); return; }

    const promo = t.closest('[data-promo]');
    if (promo) { openPromo(+promo.dataset.promo); return; }

    const cat = t.closest('[data-cat].cat');
    if (cat) { goToCategory(cat.dataset.cat); return; }

    const pill = t.closest('.pill');
    if (pill) { goToSection(pill.dataset.sec); return; }

    const add = t.closest('[data-add]');
    if (add) { handleAdd(add.dataset.add, add); return; }

    const aiCard = t.closest('[data-ai-open]');
    if (aiCard) { const it = Cart.getItem(aiCard.dataset.aiOpen); if (it) openItemDetail(it, aiCard); return; }

    // Тап по самой карточке блюда (не по кнопке «+») — открыть подробности,
    // как уже открываются акции. Кнопка «+» перехватывается чуть выше и сюда не доходит.
    const itemCard = t.closest('.item');
    if (itemCard) {
      const id = itemCard.id.replace(/^item-/, '');
      const it = Cart.getItem(id);
      if (it) openItemDetail(it, itemCard);
    }
  });

  /** Останавливаем видео акции при закрытии модалки — иначе оно крутится в фоне */
  function pausePromoVideo() {
    const v = $('video', els.promoModal);
    if (v) v.pause();
  }

  // Модалки живут вне #menu
  [els.promoModal, els.variantSheet].forEach((ov) => {
    ov.addEventListener('click', (e) => {
      const t = e.target;
      if (t === ov || t.closest('[data-action="close-overlay"]')) { pausePromoVideo(); overlay.close(ov); return; }

      const goto = t.closest('[data-goto-item]');
      if (goto) {
        pausePromoVideo();
        overlay.close(ov);
        App.go('#/menu');
        setTimeout(() => goToItem(goto.dataset.gotoItem), 260);
        return;
      }

      const pick = t.closest('[data-pick]');
      if (pick) {
        Cart.add(pick.dataset.pick, +pick.dataset.v);
        overlay.close(ov);
        toast(I18n.t('added'));
        bump($(`.add-btn[data-add="${CSS.escape(pick.dataset.pick)}"]`, els.sections));
        App.track('add_to_cart', { id: pick.dataset.pick });
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { pausePromoVideo(); overlay.closeAll(); toggleLangList(false); }
  });

  els.search.addEventListener('input', debounce(applySearch, 120));
  // Поиск «липкий»: гость может начать поиск из середины меню. Подсказка и подборка живут прямо под полем,
  // поэтому при фокусе подкручиваем страницу так, чтобы они были видны.
  els.search.addEventListener('focus', () => {
    // естественное место строки поиска — сразу под акциями (сама строка «липкая», поэтому меряем по блоку выше)
    const top = els.promos.getBoundingClientRect().bottom + window.scrollY - els.topbar.offsetHeight;
    if (window.scrollY > top + 4) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (!els.search.value.trim()) updateAiPick(0);
  });
  els.search.addEventListener('blur', () => {
    // задержка — чтобы успел сработать тап по примеру
    setTimeout(() => { if (ai.status === 'hint' && document.activeElement !== els.search) { ai.status = 'idle'; els.aiPick.hidden = true; } }, 250);
  });
  els.search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    els.search.blur();
    if (ai.status === 'offer') runAiPick(); // Enter на фразе — сразу спрашиваем ИИ
  });

  Cart.subscribe(() => {
    updateBadges();
    bump(els.fabCart);
  });

  App.Menu = { render, handleAdd, goToCategory, goToItem, onScroll };
})(window.App);
