/* =========================================================
   ТЕМЫ tut.menu — готовые дизайны и их «детали», которые можно смешивать.
   Дизайн ресторана = { theme, palette, fonts, shape, cats, cards, layout, accent? }.
   Тема — это просто готовый набор деталей; любую деталь можно взять из другой темы.
   Файл общий: его подключают и меню (index.html), и конструктор демо.
   ========================================================= */
(function (root) {
  /* Палитры: фон, текст, вторичный текст, плашки, акцент, текст на акценте, тёмная ли */
  const PALETTES = {
    graf:   { name: 'Граф',    bg: '#17110f', text: '#f3e9dc', muted: '#b9a994', surface: '#251b17', surface2: '#30241f', accent: '#c29a5b', onAccent: '#17110f', dark: true },
    barista:{ name: 'Бариста', bg: '#f7f1e8', text: '#2b1d14', muted: '#8a7562', surface: '#ece2d3', surface2: '#e2d4c0', accent: '#6b4226', onAccent: '#fff8ef', dark: false },
    lounge: { name: 'Лаунж',   bg: '#0e0e13', text: '#f2f2f7', muted: '#9b9bab', surface: '#1b1b24', surface2: '#25252f', accent: '#5ff2c0', onAccent: '#0e0e13', dark: true },
    sakura: { name: 'Сакура',  bg: '#ffffff', text: '#161616', muted: '#8b8580', surface: '#f5f1ee', surface2: '#ebe5e0', accent: '#d7263d', onAccent: '#ffffff', dark: false },
    napoli: { name: 'Наполи',  bg: '#f3e6d0', text: '#2a1a10', muted: '#86705a', surface: '#e9d6b6', surface2: '#dfc8a2', accent: '#c8381f', onAccent: '#fff6ea', dark: false },
    street: { name: 'Стрит',   bg: '#fffbe8', text: '#111111', muted: '#6d6a5c', surface: '#fff0a3', surface2: '#ffe56b', accent: '#111111', onAccent: '#ffd60a', dark: false }
  };

  /* Пары шрифтов (все с кириллицей и казахскими буквами) */
  const FONTS = {
    graf:    { name: 'Классика',  display: 'Cormorant Garamond', body: 'Manrope',  dw: 700, upper: false, gf: 'Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;500;600;700' },
    barista: { name: 'Мягкий',    display: 'Nunito',             body: 'Nunito',   dw: 800, upper: false, gf: 'Nunito:wght@400;600;700;800' },
    lounge:  { name: 'Неон',      display: 'Unbounded',          body: 'Inter',    dw: 600, upper: false, gf: 'Unbounded:wght@500;600&family=Inter:wght@400;500;600;700' },
    sakura:  { name: 'Минимал',   display: 'Montserrat',         body: 'Inter',    dw: 500, upper: true,  gf: 'Montserrat:wght@500;600&family=Inter:wght@400;500;600;700' },
    napoli:  { name: 'Плакат',    display: 'Oswald',             body: 'Roboto',   dw: 600, upper: true,  gf: 'Oswald:wght@500;600&family=Roboto:wght@400;500;700' },
    street:  { name: 'Жирный',    display: 'Russo One',          body: 'Rubik',    dw: 400, upper: true,  gf: 'Russo+One&family=Rubik:wght@400;500;600;700' }
  };

  /* Форма: скругления кнопок и карточек */
  const SHAPES = {
    sharp:   { name: 'Острые',     s: 2,  m: 3,  l: 4,  xl: 6,  pill: 4 },
    rounded: { name: 'Скруглённые', s: 10, m: 14, l: 18, xl: 24, pill: 999 },
    soft:    { name: 'Мягкие',     s: 16, m: 22, l: 26, xl: 30, pill: 999 }
  };

  /* Стиль категорий и карточек блюд */
  const CATS = { pills: 'Таблетки', underline: 'Подчёркивание', boxed: 'Плитки' };
  const CARDS = { flat: 'Плоские', soft: 'На подложке', outline: 'С рамкой' };
  const LAYOUTS = { grid: 'Сетка', list: 'Список' };

  /* Готовые темы = набор деталей */
  const THEMES = {
    graf:    { name: 'Граф',    note: 'Тёмный премиум: ресторан, лаунж', kinds: ['restaurant', 'lounge'],      palette: 'graf',    fonts: 'graf',    shape: 'sharp',   cats: 'underline', cards: 'flat',    layout: 'grid' },
    barista: { name: 'Бариста', note: 'Светлая кофейня, тёплые тона',    kinds: ['coffee', 'bakery'],          palette: 'barista', fonts: 'barista', shape: 'soft',    cats: 'pills',     cards: 'soft',    layout: 'grid' },
    lounge:  { name: 'Лаунж',   note: 'Ночь, неон, кальянная или бар',   kinds: ['lounge', 'bar'],             palette: 'lounge',  fonts: 'lounge',  shape: 'rounded', cats: 'pills',     cards: 'outline', layout: 'grid' },
    sakura:  { name: 'Сакура',  note: 'Белый минимализм: суши, азия',    kinds: ['sushi', 'restaurant'],       palette: 'sakura',  fonts: 'sakura',  shape: 'sharp',   cats: 'underline', cards: 'flat',    layout: 'list' },
    napoli:  { name: 'Наполи',  note: 'Крафт и красный: пицца, паста',   kinds: ['pizza', 'cafe'],             palette: 'napoli',  fonts: 'napoli',  shape: 'rounded', cats: 'boxed',     cards: 'soft',    layout: 'grid' },
    street:  { name: 'Стрит',   note: 'Жёлтый и чёрный: фастфуд, бургеры', kinds: ['fastfood', 'canteen'],     palette: 'street',  fonts: 'street',  shape: 'soft',    cats: 'boxed',     cards: 'outline', layout: 'grid' }
  };

  const pick = (obj, k, def) => (k && obj[k] ? k : def);
  const HEX = /^#[0-9a-f]{6}$/i;

  /** Собирает полный дизайн: тема даёт значения по умолчанию, явные детали их перекрывают */
  function resolve(design) {
    const d = design || {};
    const t = THEMES[pick(THEMES, d.theme, 'graf')];
    return {
      theme: pick(THEMES, d.theme, 'graf'),
      palette: pick(PALETTES, d.palette, t.palette),
      fonts: pick(FONTS, d.fonts, t.fonts),
      shape: pick(SHAPES, d.shape, t.shape),
      cats: pick(CATS, d.cats, t.cats),
      cards: pick(CARDS, d.cards, t.cards),
      layout: pick(LAYOUTS, d.layout, t.layout),
      accent: HEX.test(d.accent || '') ? d.accent : ''
    };
  }

  function contrastOn(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.6 ? '#111111' : '#ffffff';
  }

  const loadedFonts = new Set();
  function loadFonts(doc, key) {
    if (loadedFonts.has(key)) return;
    loadedFonts.add(key);
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${FONTS[key].gf}&display=swap`;
    doc.head.appendChild(l);
  }

  /** Применяет дизайн к странице меню: CSS-переменные + data-атрибуты для стилей категорий и карточек */
  function apply(design, doc) {
    doc = doc || document;
    const r = resolve(design);
    const p = PALETTES[r.palette], f = FONTS[r.fonts], s = SHAPES[r.shape];
    const accent = r.accent || p.accent;
    const onAccent = r.accent ? contrastOn(r.accent) : p.onAccent;
    const el = doc.documentElement;
    const set = (k, v) => el.style.setProperty(k, v);
    set('--bg', p.bg); set('--text', p.text); set('--muted', p.muted); set('--muted-2', p.muted);
    set('--surface', p.surface); set('--surface-2', p.surface2);
    set('--line', p.dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.09)');
    set('--dark', accent); set('--on-dark', onAccent);
    set('--panel', p.dark ? p.surface : '#ffffff');
    set('--font', `'${f.body}', -apple-system, 'Segoe UI', Roboto, sans-serif`);
    set('--font-display', `'${f.display}', '${f.body}', sans-serif`);
    set('--display-weight', String(f.dw));
    set('--display-case', f.upper ? 'uppercase' : 'none');
    set('--r-s', s.s + 'px'); set('--r', s.m + 'px'); set('--r-l', s.l + 'px'); set('--r-xl', s.xl + 'px'); set('--pill', s.pill + 'px');
    el.dataset.design = '1';
    el.dataset.mode = p.dark ? 'dark' : 'light';
    el.dataset.cats = r.cats;
    el.dataset.cards = r.cards;
    el.dataset.palette = r.palette;
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg);
    loadFonts(doc, r.fonts);
    return r;
  }

  root.TMThemes = { PALETTES, FONTS, SHAPES, CATS, CARDS, LAYOUTS, THEMES, resolve, apply, contrastOn };
})(typeof window !== 'undefined' ? window : globalThis);
