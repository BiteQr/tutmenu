/* =========================================================
   ТЕМЫ tut.menu — премиальные дизайны, которые можно смешивать.
   Дизайн = { theme, style, palette, fonts, accent? }:
   • style — устройство страницы (как стоят блюда: бумажная карта, галерея, журнал…);
   • palette — цвета; • fonts — пара шрифтов; • accent — свой фирменный цвет.
   Тема — готовое сочетание; любую часть можно взять из другой темы.
   Файл общий: меню (index.html) и конструктор демо.
   ========================================================= */
(function (root) {
  /* Устройство страницы. layout — базовая сетка приложения, остальное делает themes.css */
  const STYLES = {
    classic:  { name: 'Классика', note: 'Наш основной дизайн, как у Типа Граф: фото 2 в ряд, разделы-капсулы', layout: 'grid' },
    carte:    { name: 'Карта',    note: 'Как бумажное меню дорогого ресторана: текст, цены с точками, без лишнего', layout: 'list' },
    gallery:  { name: 'Галерея',  note: 'Каждое блюдо — большое фото на всю ширину', layout: 'grid' },
    editorial:{ name: 'Журнал',   note: 'Фото и текст чередуются, крупные заголовки', layout: 'list' },
    showcase: { name: 'Витрина',  note: 'Разделы листаются вбок, как витрина', layout: 'grid' },
    minimal:  { name: 'Минимал',  note: 'Две колонки, много воздуха, тонкий шрифт', layout: 'grid' },
    lounge:   { name: 'Лаунж',    note: 'Строки с круглыми фото, для бара и кальянной', layout: 'list' }
  };

  /* Палитры: фон, текст, вторичный, плашки, акцент, текст на акценте */
  const PALETTES = {
    classic:  { name: 'Классика',       bg: '#ffffff', text: '#1c1c1e', muted: '#8a8a8f', surface: '#f2f2f5', surface2: '#e8e8ed', accent: '#4d1d15', onAccent: '#ffffff', dark: false },
    ivory:    { name: 'Слоновая кость', bg: '#f5f0e6', text: '#1d1a15', muted: '#7a7163', surface: '#ebe4d6', surface2: '#e0d7c5', accent: '#1d1a15', onAccent: '#f5f0e6', dark: false },
    noir:     { name: 'Нуар',           bg: '#0d0d0c', text: '#efe8dc', muted: '#9b9386', surface: '#191816', surface2: '#24221f', accent: '#c9a467', onAccent: '#0d0d0c', dark: true },
    bordeaux: { name: 'Бордо',          bg: '#2b0f14', text: '#f4e7dc', muted: '#c2a59b', surface: '#3a1820', surface2: '#47212a', accent: '#e9c48a', onAccent: '#2b0f14', dark: true },
    olive:    { name: 'Олива',          bg: '#eeefe6', text: '#1f281c', muted: '#6c7564', surface: '#e2e5d6', surface2: '#d5d9c6', accent: '#3d5537', onAccent: '#f4f5ee', dark: false },
    navy:     { name: 'Ночь',           bg: '#0f1626', text: '#eee9df', muted: '#9aa1b0', surface: '#182136', surface2: '#212c44', accent: '#d8b779', onAccent: '#0f1626', dark: true },
    blanc:    { name: 'Белый',          bg: '#ffffff', text: '#111111', muted: '#8a8a86', surface: '#f3f2ef', surface2: '#e9e7e2', accent: '#111111', onAccent: '#ffffff', dark: false }
  };

  /* Пары шрифтов — все с казахскими буквами (кириллица-расширенная) */
  const FONTS = {
    classic:   { name: 'Классика',  display: 'Montserrat',         body: '',           dw: 800, italic: false, upper: false, track: '0', gf: 'Montserrat:wght@600;700;800' },
    cormorant: { name: 'Гарамон',   display: 'Cormorant Garamond', body: 'Manrope',    dw: 600, italic: true,  upper: false, track: '0', gf: 'Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Manrope:wght@400;500;600;700' },
    prata:     { name: 'Прата',     display: 'Prata',              body: 'Montserrat', dw: 400, italic: false, upper: false, track: '0', gf: 'Prata&family=Montserrat:wght@400;500;600' },
    forum:     { name: 'Форум',     display: 'Forum',              body: 'Raleway',    dw: 400, italic: false, upper: true,  track: '.08em', gf: 'Forum&family=Raleway:wght@400;500;600' },
    spectral:  { name: 'Спектрал',  display: 'Spectral',           body: 'Golos Text', dw: 300, italic: false, upper: false, track: '-.01em', gf: 'Spectral:ital,wght@0,300;0,400;1,300&family=Golos+Text:wght@400;500;600' },
    lora:      { name: 'Лора',      display: 'Lora',               body: 'Inter',      dw: 500, italic: true,  upper: false, track: '0', gf: 'Lora:ital,wght@0,500;1,500&family=Inter:wght@400;500;600' },
    unbounded: { name: 'Модерн',    display: 'Unbounded',          body: 'Onest',      dw: 500, italic: false, upper: false, track: '-.01em', gf: 'Unbounded:wght@400;500&family=Onest:wght@400;500;600' }
  };

  /* Готовые темы */
  const THEMES = {
    classic:   { name: 'Классика', note: 'Наш основной дизайн, как у Типа Граф',      kinds: ['restaurant', 'cafe', 'lounge', 'coffee', 'pizza', 'fastfood', 'canteen', 'bar', 'sushi', 'bakery'], style: 'classic', palette: 'classic', fonts: 'classic' },
    carte:     { name: 'Карта',   note: 'Бумажная карта ресторана, цены с точками',   kinds: ['restaurant', 'bar'],             style: 'carte',     palette: 'ivory',    fonts: 'cormorant' },
    gallery:   { name: 'Галерея', note: 'Большие фото на чёрном, как в дорогом журнале', kinds: ['restaurant', 'sushi', 'lounge'], style: 'gallery',   palette: 'noir',     fonts: 'prata' },
    editorial: { name: 'Журнал',  note: 'Фото и текст чередуются, тёплая олива',      kinds: ['cafe', 'bakery', 'coffee'],       style: 'editorial', palette: 'olive',    fonts: 'lora' },
    showcase:  { name: 'Витрина', note: 'Разделы листаются вбок, чистый белый',       kinds: ['coffee', 'pizza', 'fastfood', 'canteen'], style: 'showcase', palette: 'blanc', fonts: 'forum' },
    minimal:   { name: 'Минимал', note: 'Две колонки, воздух, ночной синий',          kinds: ['sushi', 'cafe'],                  style: 'minimal',   palette: 'navy',     fonts: 'spectral' },
    lounge:    { name: 'Лаунж',   note: 'Бордо и золото, круглые фото строками',      kinds: ['lounge', 'bar'],                  style: 'lounge',    palette: 'bordeaux', fonts: 'unbounded' }
  };

  /* Вид приветственного экрана — смешивается с любой темой */
  const WELCOMES = {
    classic:  { name: 'Классика',     note: 'Фото или видео на весь экран, логотип по центру — как у Типа Граф' },
    taplink:  { name: 'Таплинк',      note: 'Логотип в круге, название и кнопки-ссылки столбиком' },
    split:    { name: 'Сплит',        note: 'Фото сверху, логотип в круге на стыке, кнопки ниже' },
    card:     { name: 'Карточка',     note: 'Фото фоном, внизу карточка с названием и кнопками' },
    poster:   { name: 'Постер',       note: 'Крупное название поверх фото, как афиша' },
    typo:     { name: 'Типографика',  note: 'Без фото: огромное название на цвете бренда' }
  };

  const pick = (obj, k, def) => (k && obj[k] ? k : def);
  const HEX = /^#[0-9a-f]{6}$/i;

  function resolve(design) {
    const d = design || {};
    const themeId = pick(THEMES, d.theme, 'classic');
    const t = THEMES[themeId];
    const style = pick(STYLES, d.style, t.style);
    return {
      theme: themeId, style,
      palette: pick(PALETTES, d.palette, t.palette),
      fonts: pick(FONTS, d.fonts, t.fonts),
      layout: STYLES[style].layout,
      accent: HEX.test(d.accent || '') ? d.accent : ''
    };
  }

  function contrastOn(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.6 ? '#111111' : '#ffffff';
  }

  const loaded = new Set();
  function loadFonts(doc, key) {
    if (loaded.has(key)) return;
    loaded.add(key);
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${FONTS[key].gf}&display=swap`;
    doc.head.appendChild(l);
  }

  function apply(design, doc) {
    doc = doc || document;
    const r = resolve(design);
    const p = PALETTES[r.palette], f = FONTS[r.fonts];
    const accent = r.accent || p.accent;
    const onAccent = r.accent ? contrastOn(r.accent) : p.onAccent;
    const el = doc.documentElement;
    const set = (k, v) => el.style.setProperty(k, v);
    set('--bg', p.bg); set('--text', p.text); set('--muted', p.muted); set('--muted-2', p.muted);
    set('--surface', p.surface); set('--surface-2', p.surface2);
    set('--line', p.dark ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.1)');
    set('--dark', accent); set('--on-dark', onAccent);
    set('--panel', p.dark ? p.surface : '#ffffff');
    // Классический шрифт — системный, как в основном дизайне; иначе — пара шрифтов темы
    if (f.body) set('--font', `'${f.body}', -apple-system, 'Segoe UI', Roboto, sans-serif`); else el.style.removeProperty('--font');
    set('--font-display', f.body ? `'${f.display}', Georgia, serif` : `"Montserrat", var(--font)`);
    set('--display-weight', String(f.dw));
    set('--display-case', f.upper ? 'uppercase' : 'none');
    set('--display-track', f.track);
    set('--display-style', f.italic ? 'italic' : 'normal');
    // «Классика» — основной дизайн приложения: только цвета и шрифт, без премиальных переделок раскладки
    if (r.style === 'classic') delete el.dataset.design; else el.dataset.design = '1';
    el.dataset.mode = p.dark ? 'dark' : 'light';
    el.dataset.style = r.style;
    el.dataset.palette = r.palette;
    el.dataset.welcome = pick(WELCOMES, (design || {}).welcomeStyle, 'classic');
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg);
    loadFonts(doc, r.fonts);
    return r;
  }

  root.TMThemes = { STYLES, PALETTES, FONTS, THEMES, WELCOMES, resolve, apply, contrastOn };
})(typeof window !== 'undefined' ? window : globalThis);
