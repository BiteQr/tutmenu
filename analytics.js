/* =========================================================
   ANALYTICS
   Своя статистика (посещения, воронка, топ блюд/категорий, заказы,
   время на сайте) — работает ВСЕГДА, без каких-либо настроек,
   и видна в /admin на вкладке «Статистика».

   Яндекс.Метрика — отдельная, необязательная надстройка поверх:
   включается в config.js → YM_ID, если нужны Вебвизор и карта кликов.
   Если YM_ID пустой — просто не подключается, на свою статистику это
   никак не влияет.

   Что считается «просмотром страницы» (SPA на хэш-роутинге):
     /welcome  — главный экран
     /menu     — меню
     /cart     — корзина

   ВАЖНО: этот файл НИКОГДА не должен ронять остальной сайт — поэтому
   App.hit/App.track определяются первым делом как безопасные заглушки,
   а настоящая логика подключается следом и, если где-то споткнётся,
   просто останется на заглушках, а не обрушит App.hit/App.track для
   всего остального кода (app.js, menu.js и т.д. их вызывают без проверки).
   ========================================================= */
window.App = window.App || {};
window.App.hit = window.App.hit || function () {};
window.App.track = window.App.track || function () {};

(function (App) {
  try {
    const C = window.APP_CONFIG;

    /** crypto.randomUUID работает только в безопасном контексте (https или localhost).
     *  Если сайт на мгновение открыт по http (например, SSL ещё не выпустился для
     *  только что подключённого домена) — этой функции попросту нет. Свой запасной
     *  генератор работает всегда, независимо от протокола. */
    function randomId() {
      if (window.crypto && typeof crypto.randomUUID === 'function') {
        try { return crypto.randomUUID(); } catch { /* падаем в запасной вариант ниже */ }
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    /* ---------- сессия: один визит гостя = один session_id ---------- */
    const SESSION_KEY = 'menu_session_id_v1';
    let sessionId;
    try {
      sessionId = sessionStorage.getItem(SESSION_KEY);
      if (!sessionId) { sessionId = randomId(); sessionStorage.setItem(SESSION_KEY, sessionId); }
    } catch { sessionId = randomId(); } // приватный режим браузера — просто не переживёт перезагрузку, не страшно
    const sessionStart = Date.now();

    /* ---------- отправка события в свою базу ---------- */
    function sendEvent(payload) {
      try {
        const body = JSON.stringify({ restaurantId: App.restaurantId, sessionId, ...payload });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
        } else {
          fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
        }
      } catch { /* аналитика никогда не должна ломать сайт */ }
    }

    /** Название блюда/категории/акции по id — берём из уже загруженных данных меню,
     *  чтобы в отчётах было «Эспрессо», а не голый числовой id */
    function lookupTitle(kind, id) {
      if (!App.data || id == null) return '';
      const list = kind === 'category' ? App.data.categories : kind === 'promo' ? App.data.promos : App.data.menuItems;
      const row = (list || []).find((x) => String(x.id) === String(id));
      return row ? (row.title_ru || '') : '';
    }

    /** Виртуальный переход между экранами приложения */
    App.hit = (path) => {
      try {
        const clean = String(path || '').replace(/^\//, '');
        sendEvent({ type: 'hit', path: clean });
        if (window.__ymId) { try { window.ym(window.__ymId, 'hit', location.origin + '/' + clean); } catch { /* ignore */ } }
      } catch { /* ignore */ }
    };

    /** Цель: добавил в корзину / открыл категорию / открыл акцию / оформил заказ */
    App.track = (goal, params = {}) => {
      try {
        const extra = { type: goal };
        if (goal === 'add_to_cart') { extra.refId = params.id; extra.refTitle = params.title || lookupTitle('item', params.id); }
        else if (goal === 'view_promo') { extra.refId = params.id; extra.refTitle = lookupTitle('promo', params.id); }
        else if (goal === 'view_category') { extra.refId = params.id; extra.refTitle = lookupTitle('category', params.id); }
        else if (goal === 'order_placed') { extra.value = params.total; }
        sendEvent(extra);
        if (window.__ymId) { try { window.ym(window.__ymId, 'reachGoal', goal, params); } catch { /* ignore */ } }
      } catch { /* ignore */ }
    };

    /** Сколько времени гость провёл на сайте — шлём один раз, при уходе со страницы */
    let endSent = false;
    function sendSessionEnd() {
      if (endSent) return;
      endSent = true;
      const seconds = Math.round((Date.now() - sessionStart) / 1000);
      if (seconds >= 1) sendEvent({ type: 'session_end', value: seconds });
    }
    window.addEventListener('pagehide', sendSessionEnd);
    document.addEventListener('visibilitychange', () => { if (document.hidden) sendSessionEnd(); });

    /* ---------- Яндекс.Метрика — опционально, поверх своей статистики ---------- */
    const YM_ID = C && C.YM_ID;
    if (YM_ID) {
      window.__ymId = YM_ID;
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (let j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
        k = e.createElement(t); a = e.getElementsByTagName(t)[0];
        k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

      window.ym(YM_ID, 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true,
        trackHash: true
      });
    }
  } catch (err) {
    // Что бы тут ни пошло не так — App.hit/App.track уже определены выше как безопасные
    // заглушки, так что остальной сайт продолжит работать, просто без своей статистики.
    console.warn('[analytics] не удалось запустить:', err);
  }
})(window.App);
