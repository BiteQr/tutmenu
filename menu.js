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
    fabTop: $('.fab-top', root),
    fabCart: $('.fab-cart', root),
    promoModal: $('#promoModal'),
    variantSheet: $('#variantSheet')
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
    els.langCur.textContent = I18n.SHORT[I18n.lang];
    els.langList.innerHTML = I18n.langs.map((l) =>
      `<button type="button" role="menuitem" data-lang="${l}" class="${l === I18n.lang ? 'is-active' : ''}">
         <span>${I18n.FULL[l]}</span><span>${I18n.SHORT[l]}</span>
       </button>`).join('');
  }

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

    const tree = data.categories.map((cat) => ({
      cat,
      sections: data.sections.filter((s) => s.categoryId === cat.id && withItems(s))
    })).filter((g) => g.sections.length);

    // Разделы без категории — в конец
    const orphans = data.sections.filter((s) => !catIds.has(s.categoryId) && withItems(s));
    if (orphans.length) tree.push({ cat: null, sections: orphans });

    return { tree, itemsBySec };
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
    const { tree, itemsBySec } = buildTree();

    els.cats.hidden = tree.filter((g) => g.cat).length < 2;
    els.cats.innerHTML = tree.filter((g) => g.cat).map(({ cat }) =>
      `<button type="button" class="cat" data-cat="${esc(cat.id)}">
         ${photoHTML(cat.image, 'cat__img', I18n.f(cat, 'title'), true)}
         <span class="cat__title">${esc(I18n.f(cat, 'title'))}</span>
       </button>`).join('');

    els.pills.innerHTML = tree.flatMap((g) => g.sections).map((s) =>
      `<button type="button" class="pill" data-sec="${esc(s.id)}">${esc(I18n.f(s, 'title'))}</button>`
    ).join('');

    els.sections.innerHTML = tree.map((g) =>
      g.sections.map((s) => {
        const sub = I18n.f(s, 'subtitle');
        return `
          <section class="section" id="sec-${esc(s.id)}" data-sec="${esc(s.id)}" data-cat="${esc(g.cat ? g.cat.id : '')}">
            <h2 class="section__title">${esc(I18n.f(s, 'title'))}</h2>
            ${sub ? `<p class="section__sub">${esc(sub)}</p>` : ''}
            <div class="items">${itemsBySec.get(s.id).map((it) => itemHTML(it, I18n.f(s, 'title'))).join('')}</div>
          </section>`;
      }).join('')
    ).join('');

    sectionEls = $$('.section', els.sections);
    activeSec = activeCat = null;
    applySearch();
    updateBadges();
    onScroll();
  }

  function render(d) {
    data = d;
    els.sections.dataset.itemLayout = d.settings.itemLayout || 'list';
    renderHeader();
    renderPromos();
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

    const el = document.createElement('div');
    el.className = 'lang-overlay';
    el.innerHTML = `
      <div class="overlay__panel">
        <div class="lang-overlay__body">
          <div class="lang-overlay__icon">🌐</div>
          ${I18n.langs.map((l) => `<button type="button" class="lang-overlay__btn" data-pick-lang="${l}">${esc(I18n.FULL[l])}</button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-open'));

    el.querySelectorAll('[data-pick-lang]').forEach((btn) => {
      btn.onclick = () => {
        try { sessionStorage.setItem(LANG_PROMPT_KEY, '1'); } catch { /* ignore */ }
        I18n.set(btn.dataset.pickLang);
        el.remove();
        App.Welcome.maybeShowNotice(); // уведомление — уже на выбранном языке
      };
    });
    return true;
  }

  // Срабатывает в момент, когда экран меню РЕАЛЬНО становится видимым — неважно,
  // пришёл ли гость по клику, кнопке «назад» в браузере или прямой ссылке на #/menu.
  // Сначала язык (если ещё не спрашивали), потом уведомление владельца — по очереди, не друг на друге.
  new MutationObserver(() => {
    if (root.hidden) return;
    if (!maybeShowLangPrompt()) App.Welcome.maybeShowNotice();
  })
    .observe(root, { attributes: true, attributeFilter: ['hidden'] });

  /* ---------------------------------------------------------
     СКРОЛЛ: навигация и scroll-spy
     --------------------------------------------------------- */
  const stickyOffset = () => els.topbar.offsetHeight + els.pills.offsetHeight + 8;

  function scrollToEl(el, smooth = true) {
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

  function setActive(secEl) {
    const secId = secEl ? secEl.dataset.sec : null;
    const catId = secEl ? secEl.dataset.cat : null;

    if (secId !== activeSec) {
      activeSec = secId;
      $$('.pill', els.pills).forEach((p) => p.classList.toggle('is-active', p.dataset.sec === secId));
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

    els.notFound.hidden = found > 0;
    els.notFound.textContent = I18n.t('notFound');
    activeSec = null;
    onScroll();
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

  function openItemDetail(it) {
    const modal = getItemDetailModal();
    const title = I18n.f(it, 'title');
    const desc = I18n.f(it, 'description');
    const hasVariants = it.variants.length > 0;
    markTipSeen(); // гость сам нашёл, что блюдо открывается — подсказка больше не нужна

    $('.overlay__content', modal).innerHTML = `
      ${photoHTML(it.image, 'item-detail__img', title, true)}
      <div class="promo-full__body">
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
    $('.overlay__panel', modal).scrollTop = 0;
    overlay.open(modal);
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
      first.before(tip);
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
  function toggleLangList(force) {
    const open = force ?? els.langList.hidden;
    els.langList.hidden = !open;
    els.langBtn.setAttribute('aria-expanded', String(open));
  }

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

    const promo = t.closest('[data-promo]');
    if (promo) { openPromo(+promo.dataset.promo); return; }

    const cat = t.closest('[data-cat].cat');
    if (cat) { goToCategory(cat.dataset.cat); return; }

    const pill = t.closest('.pill');
    if (pill) { goToSection(pill.dataset.sec); return; }

    const add = t.closest('[data-add]');
    if (add) { handleAdd(add.dataset.add, add); return; }

    // Тап по самой карточке блюда (не по кнопке «+») — открыть подробности,
    // как уже открываются акции. Кнопка «+» перехватывается чуть выше и сюда не доходит.
    const itemCard = t.closest('.item');
    if (itemCard) {
      const id = itemCard.id.replace(/^item-/, '');
      const it = Cart.getItem(id);
      if (it) openItemDetail(it);
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
  els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.search.blur(); });

  Cart.subscribe(() => {
    updateBadges();
    bump(els.fabCart);
  });

  App.Menu = { render, handleAdd, goToCategory, goToItem, onScroll };
})(window.App);
