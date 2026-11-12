/* =========================================================
   UTILS — общие хелперы. Всё складываем в window.App
   ========================================================= */
window.App = window.App || {};

(function (App) {
  const C = window.APP_CONFIG;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Экранирование — все данные из таблицы вставляем только через esc() */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  /** Защита от javascript:/data: ссылок из таблицы */
  const safeUrl = (url) => {
    const u = String(url ?? '').trim();
    if (/^(javascript|vbscript):/i.test(u)) return '';
    if (/^data:/i.test(u) && !/^data:image\//i.test(u)) return '';
    return u;
  };

  const money = (n) =>
    Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/\s/g, '\u00a0') + '\u00a0' + C.CURRENCY;

  const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

  const debounce = (fn, ms = 150) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  /** localStorage с защитой от ошибок (приватный режим, переполнение) */
  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
    },
    remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
  };

  /** Заглушка, если картинка не загрузилась */
  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f2f2f5"/>' +
    '<circle cx="50" cy="52" r="20" fill="none" stroke="#c7c7cc" stroke-width="3"/>' +
    '<circle cx="50" cy="52" r="11" fill="none" stroke="#d8d8dd" stroke-width="2"/>' +
    '<path d="M24 30v14M28 30v14M26 44v26M76 30c-4 4-4 14 0 18v22" stroke="#c7c7cc" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'
  );

  /** <img> с lazy-load и фолбэком */
  const img = (src, cls, alt = '', eager = false) =>
    `<img class="${cls}" src="${esc(safeUrl(src) || PLACEHOLDER)}" alt="${esc(alt)}" data-fb ` +
    `${eager ? '' : 'loading="lazy"'} decoding="async">`;

  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-fb') && !t.dataset.failed) {
      t.dataset.failed = '1';
      t.src = PLACEHOLDER;
    }
  }, true);

  /** Toast-уведомление */
  let toastTimer;
  const toast = (text) => {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 1800);
  };

  /** Перезапуск CSS-анимации */
  const bump = (el, cls = 'bump') => {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  /** Блокировка скролла body (для модалок и корзины) */
  const locks = new Set();
  const lockScroll = (id, on) => {
    on ? locks.add(id) : locks.delete(id);
    document.body.classList.toggle('is-locked', locks.size > 0);
  };

  /** Универсальные оверлеи (модалка акции, выбор варианта) */
  const overlay = {
    open(el) {
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('is-open'));
      lockScroll(el.id, true);
    },
    close(el) {
      if (!el || el.hidden) return;
      el.classList.remove('is-open');
      lockScroll(el.id, false);
      setTimeout(() => { el.hidden = true; }, 250);
    },
    closeAll() { $$('.overlay:not([hidden])').forEach(overlay.close); }
  };

  /** Лёгкая вибрация при нажатии.
   *  Android и др.: navigator.vibrate. iPhone (Safari не умеет vibrate): клик по скрытому
   *  системному переключателю <input switch> даёт родной «тик» Taptic Engine (iOS 18+). */
  let hapticLabel = null;
  const haptic = (ms = 8) => {
    try {
      if (typeof navigator.vibrate === 'function') { navigator.vibrate(ms); return; }
      if (!hapticLabel) {
        const box = document.createElement('div');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;z-index:-1';
        box.innerHTML = '<input type="checkbox" switch id="hapticSwitch" tabindex="-1"><label for="hapticSwitch"></label>';
        box.addEventListener('click', (e) => e.stopPropagation());
        document.body.append(box);
        hapticLabel = box.querySelector('label');
      }
      hapticLabel.click();
    } catch {}
  };

  // Вибрация на любые нажимаемые элементы меню
  const TAPPABLE = 'button, a[href], [role="button"], .item, .pill, .rec-card, [data-open-rec], select';
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.(TAPPABLE);
    if (el && !el.disabled) haptic();
  }, true);


  /** Закрытие свайпом (как в iOS): тянем окно вниз (когда оно прокручено к началу) или вправо.
   *  el — что двигаем; scroller — что прокручивается внутри (вниз тянем только с самого верха);
   *  axes — 'y' и/или 'x'; ignore — селектор областей, где горизонтальный жест не наш (ленты с прокруткой);
   *  backdrop — что затемнять (необязательно); onClose(axis) — закрыть по-настоящему. */
  function swipeClose(el, { scroller, axes = ['y'], ignore, backdrop, onClose, enabled }) {
    let x0 = 0, y0 = 0, t0 = 0, axis = null, d = 0, active = false, skipX = false;
    const reset = () => {
      el.style.transition = ''; el.style.transform = ''; el.style.borderRadius = ''; el.style.boxShadow = '';
      if (backdrop) { backdrop.style.transition = ''; backdrop.style.opacity = ''; }
    };
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || (enabled && !enabled())) { active = false; return; }
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); axis = null; d = 0; active = true;
      skipX = !!(ignore && e.target.closest && e.target.closest(ignore));
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!active) return;
      const t = e.touches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const top = !scroller || scroller.scrollTop <= 0;
        if (axes.includes('y') && Math.abs(dy) > Math.abs(dx) && dy > 0 && top) axis = 'y';
        else if (axes.includes('x') && !skipX && Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0) axis = 'x';
        else { active = false; return; }
        el.style.transition = 'none';
        if (backdrop) backdrop.style.transition = 'none';
      }
      e.preventDefault();
      d = Math.max(0, axis === 'y' ? dy : dx);
      const k = axis === 'y' ? Math.min(1, d / 600) : 0;
      el.style.transform = axis === 'y' ? `translateY(${d}px) scale(${1 - k * 0.12})` : `translateX(${d}px)`;
      if (axis === 'y') el.style.borderRadius = '24px'; else el.style.boxShadow = '-12px 0 30px rgba(0,0,0,.18)';
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - d / 500));
    }, { passive: false });
    const end = () => {
      if (!active || !axis) { active = false; return; }
      active = false;
      const v = d / Math.max(1, Date.now() - t0);
      const size = axis === 'y' ? window.innerHeight : window.innerWidth;
      if (d > Math.min(140, size * 0.28) || (v > 0.5 && d > 40)) {
        el.style.transition = 'transform .25s ease-in, opacity .25s';
        el.style.transform = axis === 'y' ? `translateY(${size}px)` : `translateX(${size}px)`;
        if (backdrop) { backdrop.style.transition = 'opacity .25s'; backdrop.style.opacity = '0'; }
        haptic(6);
        setTimeout(() => { onClose(axis); setTimeout(reset, 380); }, 200);
      } else {
        el.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1)';
        el.style.transform = '';
        if (backdrop) { backdrop.style.transition = 'opacity .3s'; backdrop.style.opacity = ''; }
        setTimeout(reset, 320);
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  App.utils = { $, $$, esc, safeUrl, money, norm, debounce, store, img, toast, bump, lockScroll, overlay, haptic, swipeClose, PLACEHOLDER };
})(window.App);
