/* =========================================================
   ANALYTICS — Яндекс.Метрика (необязательно, включается в config.js → YM_ID)
   Пока YM_ID пустой, все вызовы ничего не делают — сайт работает как обычно.

   Что считается «просмотром страницы» (важно для SPA на хэш-роутинге):
     /welcome  — главный экран
     /menu     — меню
     /cart     — корзина

   Дополнительные цели (Яндекс.Метрика → Цели → создать вручную с такими же именами,
   тип «JavaScript-событие», чтобы видеть конверсию, а не только сырые события):
     add_to_cart   — нажатие «+» на блюде (id, title)
     view_category — клик по категории (id)
     view_promo    — открытие акции (id)
     order_placed  — нажатие «Заказать» (total, count)
   ========================================================= */
window.App = window.App || {};

(function (App) {
  const C = window.APP_CONFIG;
  const ID = C.YM_ID;

  if (!ID) {
    App.track = () => {};
    App.hit = () => {};
    return;
  }

  /* Официальный сниппет счётчика (без изменений, кроме форматирования) */
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (let j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

  window.ym(ID, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
    trackHash: true          // без этого хэш-переходы (#/menu, #/cart) не считаются
  });

  /** Виртуальный переход между экранами приложения */
  App.hit = (path) => { try { window.ym(ID, 'hit', location.origin + path); } catch (err) { /* ignore */ } };

  /** Цель: событие вроде «добавил в корзину» или «оформил заказ» */
  App.track = (goal, params) => { try { window.ym(ID, 'reachGoal', goal, params); } catch (err) { /* ignore */ } };
})(window.App);
