/* =========================================================
   WELCOME SCREEN — фон (видео/фото), логотип, кнопки из JSON
   ========================================================= */
(function (App) {
  const { $, esc, safeUrl, lockScroll } = App.utils;
  const I18n = App.I18n;
  const root = $('#welcome');

  function renderBackground(s) {
    const imgEl = $('.welcome__img', root);
    const video = $('.welcome__video', root);

    if (s.bgImage) {
      imgEl.src = safeUrl(s.bgImage);
      imgEl.hidden = false;
      imgEl.onerror = () => { imgEl.hidden = true; };
    } else {
      imgEl.hidden = true;
    }

    const src = safeUrl(s.bgVideo);
    if (src && video.getAttribute('src') !== src) {
      video.src = src;
      if (s.bgImage) video.poster = safeUrl(s.bgImage);
      video.hidden = false;
      tryPlay();
    } else if (!src) {
      video.hidden = true;
    }
  }

  /** Запуск видео. Если браузер не дал (энергосбережение, фон) — показываем фото вместо видео */
  function tryPlay() {
    const video = $('.welcome__video', root);
    if (!video.getAttribute('src') || root.hidden) return;
    video.muted = true;                       // без звука браузеры разрешают автоплей
    video.hidden = false;
    const p = video.play();
    if (p && p.catch) p.catch(() => { video.hidden = true; });
  }

  // Телефон ставит видео на паузу, когда вкладка уходит в фон.
  // При возвращении на вкладку / из кэша / на главный экран — запускаем снова.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
  window.addEventListener('pageshow', tryPlay);
  window.addEventListener('focus', tryPlay);
  window.addEventListener('hashchange', () => setTimeout(tryPlay, 50));
  // Если автоплей заблокирован — видео стартует от первого касания экрана
  document.addEventListener('touchstart', tryPlay, { passive: true });

  function renderLogo(s) {
    const center = $('.welcome__center', root);
    const logo = s.logoWelcome || s.logo;
    const old = $('.welcome__name', center);
    if (old) old.remove();

    const imgEl = $('.welcome__logo', center);
    if (logo) {
      imgEl.src = safeUrl(logo);
      imgEl.alt = s.name || '';
      imgEl.hidden = false;
    } else {
      imgEl.hidden = true;
      imgEl.insertAdjacentHTML('afterend', `<h1 class="welcome__name">${esc(s.name || '')}</h1>`);
    }
    $('.welcome__tagline', center).textContent = I18n.f(s, 'tagline');
  }

  function renderLangs() {
    $('.welcome__langs', root).innerHTML = I18n.langs.map((l) =>
      `<button type="button" data-lang="${l}" class="${l === I18n.lang ? 'is-active' : ''}">${I18n.WELCOME[l]}</button>`
    ).join('');
  }

  /** href для кнопки по её типу */
  function hrefOf(b) {
    const url = String(b.url ?? '').trim();
    switch (b.type) {
      case 'menu': return '#/menu';
      case 'tel': return 'tel:' + url.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
      default: return safeUrl(url) || '#';
    }
  }

  function renderButtons(buttons) {
    // Если «половинчатых» кнопок нечётное число — последняя растягивается на всю ширину
    const half = buttons.filter((b) => !['primary', 'wide', 'text'].includes(b.style));
    const lastHalf = half.length % 2 ? half[half.length - 1] : null;

    $('.welcome__buttons', root).innerHTML = buttons.map((b) => {
      const style = ['primary', 'wide', 'text'].includes(b.style) ? b.style : (b === lastHalf ? 'wide' : 'outline');
      const external = b.type === 'link' && /^https?:/i.test(b.url || '');
      const attrs = [
        `class="wbtn wbtn--${style}"`,
        `href="${esc(hrefOf(b))}"`,
        external ? 'target="_blank" rel="noopener"' : '',
        b.type === 'menu' && b.url ? `data-open-cat="${esc(b.url)}"` : ''
      ].join(' ');
      return `<a ${attrs}>${esc(I18n.f(b, 'title'))}</a>`;
    }).join('');
  }

  /** Простой хэш текста — чтобы попап показался заново, если владелец поменяет текст уведомления */
  function simpleHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /** Всплывающее уведомление с кнопкой «Согласен(-на)» — показывается в момент перехода
   *  в меню (клик по кнопке «Меню» или по категории), не на самом Welcome-экране.
   *  Один раз на устройство; показывается заново только если владелец изменит текст.
   *  Если текст пустой — не показывается вообще. */
  function maybeShowNotice() {
    if (document.querySelector('.notice-overlay')) return; // уже показан — не задваиваем
    if (!App.data || !App.data.settings) return;

    const text = I18n.f(App.data.settings, 'notice');
    if (!text) return;

    const key = `menu_notice_seen_v1:${App.restaurantId}:${simpleHash(text)}`;
    let seen = null;
    try { seen = localStorage.getItem(key); } catch { /* приватный режим — покажем заново в следующий раз, не страшно */ }
    if (seen) return;

    const el = document.createElement('div');
    el.className = 'notice-overlay';
    el.innerHTML = `
      <div class="overlay__panel">
        <div class="promo-full__body">
          <p class="notice__text">${esc(text)}</p>
          <button type="button" class="notice-overlay__btn" data-notice-agree>${esc(I18n.t('noticeAgree'))}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-open'));
    lockScroll('notice', true);

    el.querySelector('[data-notice-agree]').onclick = () => {
      try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
      el.remove();
      lockScroll('notice', false);
    };
  }

  /** Сейчас в рабочих часах заведения (по часам гостя — считаем, что гость в том же городе) */
  function isOpenNow(from, to) {
    if (!from || !to) return true; // часы не заданы — фичу не показываем вообще
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return true; // на случай кривого ввода — лучше ничего не показать, чем наврать
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = fh * 60 + fm, end = th * 60 + tm;
    if (start === end) return true; // круглосуточно
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end); // учитываем работу за полночь
  }

  function renderHours(s) {
    const center = $('.welcome__center', root);
    const old = $('.welcome__hours', center);
    if (old) old.remove();
    if (isOpenNow(s.hoursFrom, s.hoursTo)) return;
    const el = document.createElement('p');
    el.className = 'welcome__hours';
    el.textContent = I18n.t('closedNow').replace('{time}', s.hoursFrom);
    $('.welcome__tagline', center).insertAdjacentElement('afterend', el);
  }

  function render(data) {
    const s = data.settings;
    renderBackground(s);
    renderLogo(s);
    renderLangs();
    renderHours(s);
    renderButtons(data.buttons);
  }

  // Делегирование событий
  root.addEventListener('click', (e) => {
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) { I18n.set(langBtn.dataset.lang); return; }

    const catLink = e.target.closest('[data-open-cat]');
    if (catLink) App.pendingCategory = catLink.dataset.openCat; // меню откроется на этой категории

    // Любая кнопка, ведущая в меню (основная «Меню» или категория) — показываем уведомление
    // чуть позже, уже после того как экран меню откроется, а не одновременно с кликом.
    const menuLink = e.target.closest('a[href="#/menu"]');
    if (menuLink) setTimeout(maybeShowNotice, 400);
  });

  App.Welcome = { render };
})(window.App);
