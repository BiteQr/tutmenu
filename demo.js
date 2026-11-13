/* =========================================================
   ДЕМО tut.menu (страница /demo/<slug>): плашка с таймером, напоминание при каждом заходе,
   экран «Демо истекло». Работает, только когда сервер прислал settings.demo.
   ========================================================= */
(function (App) {
  const WA = '77064150958';
  let started = false;

  function left(ms) {
    const h = Math.max(0, Math.floor(ms / 3600000));
    const d = Math.floor(h / 24), hh = h % 24;
    const dw = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней');
    const hw = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'час' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'часа' : 'часов');
    if (d > 0) return `${d} ${dw(d)} ${hh} ${hw(hh)}`;
    if (h > 0) return `${h} ${hw(h)}`;
    const m = Math.max(1, Math.floor(ms / 60000));
    return `${m} мин`;
  }
  function waLink(name) {
    const text = `Здравствуйте! Хочу подключить меню tut.menu для «${name}». Моё демо: ${location.origin}${location.pathname}`;
    return `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function show(demo, name) {
    const restaurant = demo.restaurant || name || 'ваше заведение';
    // Данные могли прийти сначала из кэша (демо ещё живое), а потом свежие (уже истекло)
    if (demo.expired && !document.querySelector('.demo-dead')) {
      document.querySelectorAll('.demo-bar, .demo-pop').forEach((n) => n.remove());
      started = true;
      const el = document.createElement('div');
      el.className = 'demo-dead';
      el.innerHTML = `<div class="demo-dead__card">
          <p class="demo-dead__brand">tut<span>.</span>menu</p>
          <h1>Демо «${esc(restaurant)}» истекло</h1>
          <p>Напишите нам — восстановим его за минуту, со всеми вашими настройками.</p>
          <a class="demo-btn" href="${waLink(restaurant)}" target="_blank" rel="noopener">Написать в WhatsApp</a>
        </div>`;
      document.body.append(el);
      document.documentElement.classList.add('demo-is-dead');
      return;
    }
    if (started || demo.expired) return;
    started = true;

    const end = Date.parse(demo.expiresAt);
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML = `<span class="demo-bar__t">Демо исчезнет через <b data-left>${left(end - Date.now())}</b> — успейте подключить</span>
      <a class="demo-bar__btn" href="${waLink(restaurant)}" target="_blank" rel="noopener">Подключить</a>`;
    document.body.prepend(bar);
    document.documentElement.dataset.demo = '1';
    setInterval(() => { const b = bar.querySelector('[data-left]'); if (b) b.textContent = left(end - Date.now()); }, 30000);

    // Напоминание при каждом заходе (закрывается крестиком)
    setTimeout(() => {
      const pop = document.createElement('div');
      pop.className = 'demo-pop';
      pop.innerHTML = `<div class="demo-pop__card" role="dialog" aria-modal="true" aria-label="Демо">
          <button type="button" class="demo-pop__x" aria-label="Закрыть">×</button>
          <p class="demo-pop__big">Успейте подключить, пока демо не истекло</p>
          <p>Это меню «${esc(restaurant)}» в выбранном вами дизайне. Через <b>${left(end - Date.now())}</b> ссылка перестанет работать.</p>
          <a class="demo-btn" href="${waLink(restaurant)}" target="_blank" rel="noopener">Подключить в WhatsApp</a>
          <button type="button" class="demo-pop__later">Посмотрю меню</button>
        </div>`;
      document.body.append(pop);
      const close = () => pop.remove();
      pop.addEventListener('click', (e) => { if (e.target === pop || e.target.closest('.demo-pop__x, .demo-pop__later')) close(); });
    }, 2500);
  }

  App.Demo = { show };
})(window.App = window.App || {});
