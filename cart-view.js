/* =========================================================
   CART VIEW — экран «Ваш заказ», рекомендации, отправка заказа
   ========================================================= */
(function (App) {
  const C = window.APP_CONFIG;
  const { $, esc, money, img, toast, lockScroll } = App.utils;
  const I18n = App.I18n;
  const Cart = App.Cart;

  const root = $('#cart');
  const body = $('.cart__body', root);
  const orderBtn = $('.order-btn', root);

  const MINUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  const PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const CROSS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /** Рекомендации: объединяем recommendations всех позиций, исключаем то, что уже в корзине.
   *  Исключение — блюда, добавленные прямо из этого ряда: они остаются на месте со счётчиком «− 1 +»,
   *  чтобы гость видел, что добавил и сколько, а не терял карточку. */
  const pinned = new Set();
  function getRecommendations(lines) {
    const inCart = new Set(lines.map((l) => l.item.id));
    const ids = [];
    lines.forEach((l) => l.item.recommendations.forEach((id) => {
      if ((!inCart.has(id) || pinned.has(id)) && !ids.includes(id) && Cart.getItem(id)) ids.push(id);
    }));
    pinned.forEach((id) => { if (!ids.includes(id) && Cart.getItem(id)) ids.push(id); });
    return ids.slice(0, 12).map(Cart.getItem);
  }
  /** Сколько штук этого блюда в корзине (все вариации вместе) */
  const qtyOf = (id) => Cart.lines().filter((l) => l.item.id === id).reduce((n, l) => n + l.qty, 0);
  /** «−» у рекомендации: убираем по одной из последней добавленной вариации */
  function decItem(id) {
    const ls = Cart.lines().filter((l) => l.item.id === id);
    if (ls.length) Cart.dec(ls[ls.length - 1].key);
  }

  const minPrice = (it) => (it.variants.length ? Math.min(...it.variants.map((v) => v.price)) : it.price);

  function lineHTML(l) {
    const title = I18n.f(l.item, 'title');
    const variant = l.variant ? (l.variant.label || I18n.t('byDefault')) : I18n.t('byDefault');
    return `
      <div class="citem">
        ${img(l.item.image, 'citem__img', title)}
        <div class="citem__body">
          <div class="citem__top">
            <h3 class="citem__title">${esc(title)}</h3>
            <button type="button" class="citem__remove" data-remove="${esc(l.key)}" aria-label="${esc(I18n.t('remove'))}">${CROSS}</button>
          </div>
          <p class="citem__variant">• ${esc(variant)}</p>
          <div class="citem__row">
            <div class="qty">
              <button type="button" data-dec="${esc(l.key)}" aria-label="−">${MINUS}</button>
              <span>${l.qty}</span>
              <button type="button" data-inc="${esc(l.key)}" aria-label="+">${PLUS}</button>
            </div>
            <span class="citem__sum">${money(l.sum)}</span>
          </div>
        </div>
      </div>`;
  }

  function recHTML(it) {
    const title = I18n.f(it, 'title');
    const prefix = it.variants.length > 1 ? I18n.t('from') + ' ' : '';
    const q = qtyOf(it.id);
    return `
      <div class="rec${q ? ' is-added' : ''}" data-rec="${esc(it.id)}" role="button" tabindex="0">
        ${img(it.image, 'rec__img', title)}
        <span class="rec__title">${esc(title)}</span>
        ${q ? `<span class="rec__added">${esc(I18n.t('recAdded'))}</span>
          <span class="rec__step">
            <button type="button" data-rec-dec="${esc(it.id)}" aria-label="−">${MINUS}</button>
            <b>${q}</b>
            <button type="button" data-rec-inc="${esc(it.id)}" aria-label="+">${PLUS}</button>
          </span>`
        : `<span class="rec__price">${esc(prefix)}${money(minPrice(it))}</span>`}
      </div>`;
  }

  const waiterMode = () => App.data?.settings?.orderMode === 'waiter';
  function render() {
    I18n.applyStatic();
    // «Показать официанту» вместо заказа в WhatsApp — режим задаётся в админке для каждого ресторана
    orderBtn.textContent = I18n.t(waiterMode() ? 'showWaiter' : 'order');
    const fb = $('.fallback-link', root); if (fb) fb.hidden = waiterMode();
    const lines = Cart.lines();
    orderBtn.disabled = lines.length === 0;
    $('.cart__foot', root).hidden = lines.length === 0;

    if (!lines.length) {
      body.innerHTML = `
        <div class="cart__empty">
          <p>${esc(I18n.t('emptyCart'))}</p>
          <button type="button" data-action="close-cart">${esc(I18n.t('toMenu'))}</button>
        </div>`;
      return;
    }

    const recs = getRecommendations(lines);
    body.innerHTML = `
      ${lines.map(lineHTML).join('')}
      <div class="totals">
        <div class="totals__row totals__row--muted"><span>${esc(I18n.t('positions'))}</span><span>${Cart.count()}</span></div>
        <div class="totals__row"><span>${esc(I18n.t('total'))}</span><strong>${money(Cart.total())}</strong></div>
      </div>
      ${recs.length ? `
        <h3 class="recs__title">${esc(I18n.t('addToOrder'))}</h3>
        <div class="hscroll recs">${recs.map(recHTML).join('')}</div>` : ''}`;
  }

  /* ---------- открытие / закрытие (вызывается роутером) ---------- */
  function open() {
    pinned.clear();
    render();
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    lockScroll('cart', true);
  }
  function close() {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    lockScroll('cart', false);
  }

  /* ---------- заказ ---------- */
  function buildOrderText(lines) {
    const rows = lines.map((l, i) => {
      const v = l.variant && l.variant.label ? ` (${l.variant.label})` : '';
      return `${i + 1}. ${I18n.f(l.item, 'title')}${v} × ${l.qty} — ${money(l.sum)}`;
    });
    return `${I18n.t('orderMsgTitle')}:\n${rows.join('\n')}\n\n${I18n.t('total')}: ${money(Cart.total())}`;
  }

  /** "77001234567" → "+7 700 123 45 67" — только для показа гостю, не для ссылок */
  function formatPhone(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.length !== 11) return digits ? '+' + d : '';
    return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
  }

  /** Запасной вариант, если WhatsApp не открылся или не установлен: копируем текст заказа
   *  в буфер обмена, чтобы гость мог вставить его в любой мессенджер или отправить сам. */
  async function copyOrderFallback() {
    const lines = Cart.lines();
    if (!lines.length) return;
    const text = buildOrderText(lines);
    const phone = String(App.data?.settings?.whatsapp || C.WHATSAPP || '');
    try {
      await navigator.clipboard.writeText(text);
      toast(phone ? I18n.t('orderCopied').replace('{phone}', formatPhone(phone)) : I18n.t('orderCopiedNoPhone'));
    } catch {
      toast(I18n.t('copyFailed'));
    }
  }

  /* ---------- «Показать официанту»: крупный список заказа на весь экран ---------- */
  let waiterEl = null;
  function showWaiter() {
    const lines = Cart.lines();
    if (!lines.length) return;
    App.track('show_waiter', { total: Cart.total(), count: Cart.count() });
    if (!waiterEl) {
      waiterEl = document.createElement('div');
      waiterEl.className = 'waiter';
      waiterEl.setAttribute('role', 'dialog');
      waiterEl.setAttribute('aria-modal', 'true');
      document.body.appendChild(waiterEl);
      waiterEl.addEventListener('click', (e) => {
        const a = e.target.closest('[data-w]')?.dataset.w;
        if (a === 'edit') hideWaiter();
        if (a === 'done') {
          const ls = Cart.lines();
          // В историю заказов админки — как и раньше, только без WhatsApp
          fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            restaurantId: App.restaurantId, lang: I18n.lang, total: Cart.total(), text: buildOrderText(ls) + '\n\n(показан официанту)',
            items: ls.map((l) => ({ id: l.item.id, title: I18n.f(l.item, 'title'), variant: l.variant?.label || '', qty: l.qty, price: l.price }))
          }) }).catch(() => {});
          App.track('order_placed', { total: Cart.total(), count: Cart.count() });
          Cart.clear(); hideWaiter(); toast(I18n.t('waiterThanks')); App.go('#/menu');
        }
      });
    }
    const s = App.data?.settings || {};
    const logo = s.logoHeader;
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    waiterEl.innerHTML = `
      <div class="waiter__panel">
        <div class="waiter__head">
          ${logo ? `<img class="waiter__logo" src="${esc(logo)}" alt="">` : ''}
          <div class="waiter__hint">${esc(I18n.t('waiterHint'))}</div>
        </div>
        <h2 class="waiter__title">${esc(I18n.t('waiterTitle'))} <span>${esc(time)}</span></h2>
        <ol class="waiter__list">
          ${lines.map((l) => `<li>
            <b class="waiter__qty">${l.qty}×</b>
            <span class="waiter__name">${esc(I18n.f(l.item, 'title'))}${l.variant && l.variant.label ? `<small>${esc(l.variant.label)}</small>` : ''}</span>
            <span class="waiter__sum">${money(l.sum)}</span>
          </li>`).join('')}
        </ol>
        <div class="waiter__total"><span>${esc(I18n.t('positions'))}: ${Cart.count()}</span><strong>${money(Cart.total())}</strong></div>
        <p class="waiter__note">${esc(I18n.t('waiterNote'))}</p>
      </div>
      <div class="waiter__foot">
        <button type="button" class="waiter__edit" data-w="edit">${esc(I18n.t('waiterEdit'))}</button>
        <button type="button" class="waiter__done" data-w="done">${esc(I18n.t('waiterDone'))}</button>
      </div>`;
    requestAnimationFrame(() => waiterEl.classList.add('is-open'));
    lockScroll('waiter', true);
  }
  function hideWaiter() { if (!waiterEl) return; waiterEl.classList.remove('is-open'); lockScroll('waiter', false); }

  async function order() {
    if (waiterMode()) { showWaiter(); return; }
    const lines = Cart.lines();
    if (!lines.length) return;
    App.track('order_placed', { total: Cart.total(), count: Cart.count() });
    const text = buildOrderText(lines);
    const phone = String(App.data?.settings?.whatsapp || C.WHATSAPP || '').replace(/\D/g, '');

    // WhatsApp открываем синхронно в обработчике клика — иначе браузер заблокирует окно.
    // Это основной канал заказа, он не зависит от бэкенда.
    if (phone) {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      const w = window.open(url, '_blank');
      if (!w) location.href = url;
    }

    // Запись в базу — для истории заказов в админке. Не блокирует UX: если бэкенд
    // временно недоступен, заказ в WhatsApp уже ушёл, гостю ошибку не показываем.
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        restaurantId: App.restaurantId,
        lang: I18n.lang,
        total: Cart.total(),
        text,
        items: lines.map((l) => ({ id: l.item.id, title: I18n.f(l.item, 'title'), variant: l.variant?.label || '', qty: l.qty, price: l.price }))
      })
    }).catch((e) => console.warn('[order] не записалось в базу:', e));

    Cart.clear();
    toast(I18n.t('orderSent'));
    App.go('#/menu');
  }

  /* ---------- события ---------- */
  root.addEventListener('click', (e) => {
    const t = e.target;
    const act = t.closest('[data-action]')?.dataset.action;
    if (act === 'close-cart') { App.back('#/menu'); return; }
    if (act === 'order') { order(); return; }
    if (act === 'copy-order') { copyOrderFallback(); return; }

    const inc = t.closest('[data-inc]'); if (inc) { Cart.inc(inc.dataset.inc); return; }
    const dec = t.closest('[data-dec]'); if (dec) { Cart.dec(dec.dataset.dec); return; }
    const rm = t.closest('[data-remove]'); if (rm) { Cart.remove(rm.dataset.remove); return; }
    const rdec = t.closest('[data-rec-dec]'); if (rdec) { decItem(rdec.dataset.recDec); return; }
    const rinc = t.closest('[data-rec-inc]'); if (rinc) { pinned.add(rinc.dataset.recInc); App.Menu.handleAdd(rinc.dataset.recInc); return; }
    const rec = t.closest('[data-rec]'); if (rec && !rec.classList.contains('is-added')) { pinned.add(rec.dataset.rec); App.Menu.handleAdd(rec.dataset.rec); }
  });

  Cart.subscribe(() => { if (root.classList.contains('is-open')) render(); });

  App.CartView = { open, close, render };
})(window.App);
