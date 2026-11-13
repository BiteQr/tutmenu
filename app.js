/* =========================================================
   APP — загрузка данных, hash-роутер, смена языка
   Маршруты:  #/  → Welcome   |   #/menu → Меню   |   #/cart → Корзина поверх меню
   (hash-роутинг работает на GitHub Pages без настройки 404)
   ========================================================= */
(function (App) {
  const { $, overlay } = App.utils;
  const I18n = App.I18n;

  const screens = { welcome: $('#welcome'), menu: $('#menu') };
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let current = null;
  let previous = null;

  const parse = () => (location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || '');

  App.go = (hash) => {
    if (location.hash === hash || (hash === '#/' && !location.hash)) route();
    else location.hash = hash;
  };

  /** «Назад» внутри приложения: history.back(), если пришли из fallback-экрана, иначе прямой переход */
  App.back = (fallback) => {
    const target = fallback.replace(/^#\/?/, '').split(/[?/]/)[0] || '';
    if (previous === target) history.back();
    else location.replace(fallback);
  };

  function route() {
    const r = parse();
    const next = ['menu', 'cart'].includes(r) ? r : '';
    const wasWelcome = current === '' || current === null;

    overlay.closeAll();
    screens.welcome.hidden = next !== '';
    screens.menu.hidden = next === '';
    themeMeta.setAttribute('content', next === '' ? '#0e0e10' : '#ffffff');

    if (next === 'cart') App.CartView.open(); else App.CartView.close();
    App.hit('/' + (next || 'welcome'));

    if (next !== '' && wasWelcome) {
      window.scrollTo(0, 0);
      if (App.pendingCategory) {
        const cat = App.pendingCategory;
        App.pendingCategory = null;
        requestAnimationFrame(() => App.Menu.goToCategory(cat));
      }
    }
    if (next === 'menu') App.Menu.onScroll();

    previous = current;
    current = next;
  }

  const VALID_PRESETS = ['modern', 'premium', 'friendly', 'bold'];

  /** Пресет оформления (цвет/шрифт/скругления) + опциональный акцентный цвет клиента */
  function applyTheme(s) {
    // Новый движок тем (дизайн из конструктора): цвета, шрифты, форма, стиль категорий и карточек
    let design = s.design;
    if (typeof design === 'string') { try { design = JSON.parse(design); } catch { design = null; } }
    if (design && typeof design === 'object' && window.TMThemes) {
      const r = window.TMThemes.apply(design);
      s.itemLayout = r.layout;
      document.documentElement.dataset.welcomeBg = design.welcomeBg === 'color' ? 'color' : 'photo';
      // Без приветствия меню открывается сразу
      if (design.welcome === false && (!location.hash || location.hash === '#/' || location.hash === '#')) location.replace('#/menu');
      return;
    }
    const preset = VALID_PRESETS.includes(s.theme) ? s.theme : 'modern';
    document.documentElement.dataset.preset = preset;

    const accent = String(s.accentColor || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--dark', accent);
    else document.documentElement.style.removeProperty('--dark');

    // Выбор языка: стиль (card / dark / sheet) и свой цвет карточки; цвет текста — по яркости фона
    const root = document.documentElement;
    root.dataset.langStyle = ['card', 'dark', 'sheet'].includes(s.langStyle) ? s.langStyle : 'card';
    const lc = String(s.langColor || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(lc)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(lc.slice(i, i + 2), 16) / 255);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const dark = lum < 0.55;
      root.style.setProperty('--lang-bg', lc);
      root.style.setProperty('--lang-fg', dark ? '#f6efe4' : '#1c1c1e');
      root.style.setProperty('--lang-check', dark ? '#e9c98f' : 'var(--dark)');
    } else ['--lang-bg', '--lang-fg', '--lang-check'].forEach((v) => root.style.removeProperty(v));
  }

  /* Живое превью в конструкторе демо: страница меню в iframe получает дизайн и название
     от конструктора (того же сайта) и сразу перерисовывается. Работает только с ?preview=1. */
  const isPreview = /[?&]preview=1/.test(location.search);
  if (isPreview) {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'tm-design' || !App.data) return;
      const s = App.data.settings;
      s.design = e.data.design;
      if (e.data.name) s.name = e.data.name;
      if ('logo' in e.data) { s.logoHeader = e.data.logo || ''; s.logoWelcome = e.data.logo || ''; }
      if (e.data.blocks) {
        App.data.promos = e.data.blocks.promos === false ? [] : (App.data._promos || App.data.promos);
        s.lunch = e.data.blocks.lunch === false ? null : (App.data._lunch || s.lunch);
      }
      applyData(App.data);
      if (e.data.screen && location.hash !== e.data.screen) location.hash = e.data.screen;
    });
  }

  function applyData(data) {
    if (data._promos === undefined) { data._promos = data.promos; data._lunch = data.settings.lunch; }
    App.data = data;
    if (data.settings.name) document.title = data.settings.name;
    applyTheme(data.settings);
    App.Cart.setMenu(data.menuItems);
    App.Welcome.render(data);
    App.Menu.render(data);
    App.CartView.render();
  }

  function showError(err) {
    console.error(err);
    const box = $('.loader__error');
    $('.loader__spinner').hidden = true;
    box.hidden = false;
    box.innerHTML = `${I18n.t('loadError')}<br><button type="button">${I18n.t('retry')}</button>`;
    box.querySelector('button').onclick = () => location.reload();
  }

  async function init() {
    I18n.applyStatic();
    try {
      const data = await App.API.load((fresh) => applyData(fresh)); // фоновое обновление
      applyData(data);
    } catch (err) {
      showError(err);
      return;
    }

    I18n.onChange(() => {
      const y = window.scrollY;
      applyData(App.data);
      window.scrollTo(0, y);
    });

    window.addEventListener('hashchange', route);
    route();
    $('#loader').classList.add('is-done');
  }

  init();
})(window.App);
