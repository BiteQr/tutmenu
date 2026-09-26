/* =========================================================
   API — загрузка и нормализация данных
   Источник: собственный бэкенд на Cloudflare (Pages Functions + D1),
   эндпоинт /api/menu на этом же домене. Если он недоступен (например,
   открыли index.html локально без Cloudflare) — используются MOCK_DATA.
   Стратегия: мгновенно показываем кэш из localStorage, в фоне тянем свежие данные.

   Мультиарендность: один и тот же бэкенд обслуживает НЕСКОЛЬКО ресторанов.
   Кто есть кто, сайт определяет сам:
     ?r=slug в ссылке  →  используем slug
     иначе             →  используем свой домен (location.hostname)
   ========================================================= */
(function (App) {
  const C = window.APP_CONFIG;
  const { store } = App.utils;

  /** slug из ?r=... или собственный домен сайта — им сайт представляется бэкенду */
  const restaurantId = (new URLSearchParams(location.search).get('r') || location.hostname)
    .toLowerCase().replace(/^www\./, '');
  App.restaurantId = restaurantId;
  const cacheKey = `${C.DATA_CACHE_KEY}:${restaurantId}`;

  /* ---------- нормализация (терпима к разным форматам: и «чистый» бэкенд, и mock-данные) ---------- */
  const toNum = (v) => {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v ?? '').replace(/[\s\u00a0]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const toList = (v) => {
    if (Array.isArray(v)) return v.map(String);
    if (v == null || v === '') return [];
    return String(v).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  };

  /** "30 мл:850 | 60 мл:950" → [{label:'30 мл', price:850}, ...] (плюс просто пропускает уже готовый массив) */
  const parseVariants = (v) => {
    if (Array.isArray(v)) {
      return v.map((x) => ({ label: String(x.label ?? ''), price: toNum(x.price) }))
              .filter((x) => x.label || x.price);
    }
    if (!v) return [];
    return String(v).split(/\||\n/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const i = s.lastIndexOf(':');
      return i < 0 ? { label: '', price: toNum(s) } : { label: s.slice(0, i).trim(), price: toNum(s.slice(i + 1)) };
    });
  };

  const isActive = (r) => !(r.active === false || /^(false|0|нет|no)$/i.test(String(r.active ?? '').trim()));

  const list = (arr, needId = true) => (Array.isArray(arr) ? arr : [])
    .filter((r) => r && isActive(r) && (!needId || (r.id !== undefined && r.id !== '')))
    .map((r) => ({ ...r, id: String(r.id ?? '') }))
    .sort((a, b) => toNum(a.sort) - toNum(b.sort));

  function normalize(raw = {}) {
    return {
      settings: raw.settings || {},
      buttons: list(raw.buttons, false),
      promos: list(raw.promos, false),
      categories: list(raw.categories),
      sections: list(raw.sections).map((s) => ({ ...s, categoryId: String(s.categoryId ?? '') })),
      menuItems: list(raw.menuItems).map((i) => ({
        ...i,
        sectionId: String(i.sectionId ?? ''),
        price: toNum(i.price),
        variants: parseVariants(i.variants),
        recommendations: toList(i.recommendations)
      }))
    };
  }

  async function fetchRemote() {
    const params = new URLSearchParams({ id: restaurantId, t: Date.now() });
    const res = await fetch(`/api/menu?${params}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.message || json.error);
    return json;
  }

  /**
   * @param {(data) => void} onFresh — вызывается, если в фоне пришли НОВЫЕ данные
   */
  async function load(onFresh) {
    const cached = store.get(cacheKey);
    const fresh = fetchRemote().then((raw) => {
      const changed = JSON.stringify(raw) !== JSON.stringify(cached);
      store.set(cacheKey, raw);
      return { data: normalize(raw), changed };
    });

    if (cached) {
      fresh.then((r) => r.changed && onFresh && onFresh(r.data)).catch((e) => console.warn('[menu] refresh failed', e));
      return normalize(cached);
    }

    try {
      return (await fresh).data;
    } catch (err) {
      console.warn('[menu] бэкенд недоступен, показываю demo-данные:', err);
      return normalize(window.MOCK_DATA);
    }
  }

  App.API = { load, normalize };
})(window.App);
