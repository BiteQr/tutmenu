/* =========================================================
   ОБЩИЕ ХЕЛПЕРЫ
   ========================================================= */

/** JSON.parse без страховки — одно повреждённое блюдо уронит выдачу всего меню разом.
 *  При ошибке блюдо просто остаётся без вариаций, а не валит весь запрос. */
function safeVariants(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    // По умолчанию — без кэша: /admin/api/* отдаёт живые данные для редактирования,
    // устаревший ответ там цены не имеет, а вредит (ровно это и ловили: в базе
    // уже верно, а форма показывает старое). Публичному /api/menu этот дефолт
    // переопределяется ниже его собственным явным cache-control.
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

/** slug из ?id=... или из hostname: убираем www. и завершающий слэш */
function normId(v) {
  return String(v || '').trim().toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
}

/**
 * Email человека, вошедшего через Cloudflare Access.
 * Этому заголовку можно доверять: Access подставляет его САМ на входе
 * в Cloudflare и вырезает любой такой же заголовок, присланный клиентом
 * напрямую — подделать его нельзя, если путь (/admin/*) защищён в Zero Trust.
 */
function accessEmail(request) {
  return (request.headers.get('Cf-Access-Authenticated-User-Email') || '').trim().toLowerCase();
}

/**
 * Проверка доступа к конкретному ресторану.
 * owner  — видит и правит любого клиента.
 * editor — только свой restaurant_id (slug).
 */
export async function authorize(env, request, slug) {
  const email = accessEmail(request);
  if (!email) return { ok: false, status: 401, error: 'no_access_email' };

  const row = await env.DB.prepare('SELECT restaurant_id, role FROM admin_users WHERE email = ?')
    .bind(email).first();
  if (!row) return { ok: false, status: 403, error: 'not_registered' };
  if (row.role === 'owner') return { ok: true, email, role: 'owner' };
  if (row.restaurant_id === slug) return { ok: true, email, role: 'editor' };
  return { ok: false, status: 403, error: 'wrong_restaurant' };
}

/* =========================================================
   ЕДИНЫЙ WORKER — раздаёт сайт (статику) и обслуживает весь API.
   Один файл, без подпапок — чтобы не зависеть от того, как именно
   GitHub сохраняет структуру при загрузке файлов через браузер.
   ========================================================= */

/** D1/SQLite не умеет напрямую привязывать JS true/false как параметр — превращаем в 1/0.
 *  Без этого падает КАЖДОЕ сохранение чекбокса "Показывать" в любой форме админки. */
/** Бизнес-ланч хранится JSON-строкой в restaurants.lunch; битый JSON — просто нет ланча */
function parseLunch(v) {
  if (!v) return null;
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; }
}

function toSql(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  return v;
}

const FK_COLUMNS = {
  sections: ['category_id'],
  'menu-items': ['section_id'],
  promos: ['item_id']
};
function normalizeFK(section, body) {
  const cols = FK_COLUMNS[section] || [];
  const out = { ...body };
  // Важно: трогаем поле, только если клиент его реально прислал (например, выбрал "— нет —").
  // Если поля вообще нет в body (частичное сохранение — скажем, только badge_ids или active),
  // ни в коем случае не добавляем его — иначе затрём привязку к разделу/категории/блюду при любом частичном PUT.
  cols.forEach((c) => { if (c in out && out[c] === '') out[c] = null; });
  return out;
}

const ADMIN_TABLES = {
  'categories': {
    table: 'categories',
    cols: ['sort', 'active', 'image', 'title_ru', 'title_kk', 'title_en']
  },
  'sections': {
    table: 'sections',
    cols: ['category_id', 'sort', 'active', 'title_ru', 'title_kk', 'title_en', 'subtitle_ru', 'subtitle_kk', 'subtitle_en']
  },
  'menu-items': {
    table: 'menu_items',
    cols: ['section_id', 'sort', 'active', 'image', 'title_ru', 'title_kk', 'title_en',
           'description_ru', 'description_kk', 'description_en', 'price', 'variants', 'recommendations', 'badge_ids',
           'ar_image', 'ar_mode', 'ar_size', 'spin']
  },
  'promos': {
    table: 'promos',
    cols: ['sort', 'active', 'image', 'video', 'story_video', 'title_ru', 'title_kk', 'title_en',
           'description_ru', 'description_kk', 'description_en', 'item_id']
  },
  'buttons': {
    table: 'buttons',
    cols: ['sort', 'active', 'type', 'style', 'title_ru', 'title_kk', 'title_en', 'url']
  },
  'badges': {
    table: 'badges',
    cols: ['sort', 'active', 'icon', 'color', 'text_color', 'title_ru', 'title_kk', 'title_en']
  }
};

/* ---------- GET /api/menu?id=... — публично ---------- */
async function handleMenu(request, env) {
  const url = new URL(request.url);
  const id = normId(url.searchParams.get('id') || url.hostname);
  if (!id) return json({ error: 'no_id', message: 'Не передан параметр id' }, { status: 400 });

  const restaurant = await env.DB.prepare(
    'SELECT * FROM restaurants WHERE (slug = ?1 OR domain = ?1) AND active = 1'
  ).bind(id).first();

  if (!restaurant) {
    return json({ error: 'not_found', message: `Ресторан "${id}" не найден или выключен` }, { status: 404 });
  }

  const slug = restaurant.slug;
  // Старые фото сохранены с полным адресом *.workers.dev/files/... — отдаём их гостю как /files/...,
  // чтобы грузились с того же домена, что и само меню (и попадали в кэш этого домена).
  const reqHost = new URL(request.url).host.toLowerCase();
  const ownDomain = String(restaurant.domain || '').toLowerCase();
  const lu = (u) => {
    if (!u || typeof u !== 'string') return u || '';
    const m = u.match(/^https?:\/\/([^/]+)(\/files\/.*)$/i);
    if (!m) return u;
    const host = m[1].toLowerCase();
    return (host.endsWith('.workers.dev') || host === reqHost || host === ownDomain) ? m[2] : u;
  };
  // Сторис из Инстаграма (то, что выкладываем через Metricool): видны на сайте сутки после публикации.
  const nowIso = new Date().toISOString();
  const siteStories = await env.DB.prepare(
    'SELECT * FROM site_stories WHERE restaurant_id = ?1 AND active = 1 AND publish_at <= ?2 AND expires_at > ?2 ORDER BY publish_at DESC LIMIT 10'
  ).bind(slug, nowIso).all().then((r) => r.results).catch(() => []);
  const [buttons, promos, categories, sections, items, badges] = await Promise.all([
    env.DB.prepare('SELECT * FROM buttons WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all(),
    env.DB.prepare('SELECT * FROM promos WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all(),
    env.DB.prepare('SELECT * FROM categories WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all(),
    env.DB.prepare('SELECT * FROM sections WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all(),
    env.DB.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all(),
    env.DB.prepare('SELECT * FROM badges WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all()
  ]);
  const badgeMap = new Map(badges.results.map((b) => [String(b.id), b]));

  const settings = {
    name: restaurant.name,
    tagline_ru: restaurant.tagline_ru, tagline_kk: restaurant.tagline_kk, tagline_en: restaurant.tagline_en,
    whatsapp: restaurant.whatsapp,
    theme: restaurant.theme,
    accentColor: restaurant.accent_color,
    logoWelcome: lu(restaurant.logo_welcome), logoHeader: lu(restaurant.logo_header),
    bgImage: lu(restaurant.bg_image), bgVideo: lu(restaurant.bg_video),
    notice_ru: restaurant.notice_ru || '', notice_kk: restaurant.notice_kk || '', notice_en: restaurant.notice_en || '',
    hoursFrom: restaurant.hours_from || '', hoursTo: restaurant.hours_to || '',
    itemLayout: restaurant.item_layout || 'list',
    langStyle: restaurant.lang_style || 'card', langColor: restaurant.lang_color || '',
    orderMode: restaurant.order_mode === 'waiter' ? 'waiter' : 'whatsapp',
    promoStyle: restaurant.promo_style === 'stories' ? 'stories' : 'banner',
    design: (() => { try { return restaurant.design ? JSON.parse(restaurant.design) : null; } catch { return null; } })(),
    lunch: parseLunch(restaurant.lunch)
  };

  const payload = {
    settings,
    buttons: buttons.results.map((r) => ({
      id: String(r.id), type: r.type, style: r.style,
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en, url: r.url
    })),
    promos: promos.results.map((r) => ({
      id: String(r.id), image: lu(r.image), video: lu(r.video), storyVideo: lu(r.story_video || ''),
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en,
      description_ru: r.description_ru, description_kk: r.description_kk, description_en: r.description_en,
      itemId: r.item_id ? String(r.item_id) : ''
    })),
    stories: siteStories.map((r) => {
      const media = lu(r.media);
      const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(media);
      return {
        id: 's' + r.id, image: isVideo ? '' : media, video: isVideo ? media : '',
        title_ru: r.title_ru || '', title_kk: r.title_kk || '', title_en: r.title_en || '',
        description_ru: '', description_kk: '', description_en: '', itemId: ''
      };
    }),
    categories: categories.results.map((r) => ({
      id: String(r.id), image: lu(r.image),
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en
    })),
    sections: sections.results.map((r) => ({
      id: String(r.id), categoryId: r.category_id ? String(r.category_id) : '',
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en,
      subtitle_ru: r.subtitle_ru, subtitle_kk: r.subtitle_kk, subtitle_en: r.subtitle_en
    })),
    menuItems: items.results.map((r) => ({
      id: String(r.id), sectionId: r.section_id ? String(r.section_id) : '', image: lu(r.image),
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en,
      description_ru: r.description_ru, description_kk: r.description_kk, description_en: r.description_en,
      price: r.price || 0,
      variants: safeVariants(r.variants),
      arImage: lu(r.ar_image || ''), arMode: r.ar_mode || '', arSize: Number(r.ar_size) || 0,
      spin: safeVariants(r.spin).map(lu).filter(Boolean).slice(0, 36),
      recommendations: r.recommendations ? r.recommendations.split(',').map((s) => s.trim()).filter(Boolean) : [],
      badges: (r.badge_ids || '').split(',').map((s) => s.trim()).filter(Boolean)
        .map((bid) => badgeMap.get(bid))
        .filter(Boolean)
        .map((b) => ({
          id: String(b.id), title_ru: b.title_ru, title_kk: b.title_kk, title_en: b.title_en,
          icon: b.icon, color: b.color, textColor: b.text_color
        }))
    }))
  };

  return json(payload, { headers: { 'cache-control': 'public, max-age=20' } });
}

/* ---------- POST /api/orders — публично ---------- */
/** Гость может прислать и slug («tipagraf»), и домен («tipagraf.kz», если меню открыто по своему домену).
 *  Статистика и заказы всегда пишутся под slug — иначе админка их не видит. Неизвестные — отбрасываем. */
async function resolveSlug(env, raw) {
  const id = normId(raw);
  if (!id) return '';
  const row = await env.DB.prepare('SELECT slug FROM restaurants WHERE slug = ?1 OR domain = ?1 LIMIT 1').bind(id).first();
  return row ? row.slug : '';
}

async function handleOrders(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const slug = await resolveSlug(env, body.restaurantId);
  if (!slug) return json({ ok: false, error: 'no_restaurant' }, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO orders (restaurant_id, text, total, lang, status) VALUES (?, ?, ?, ?, 'new')`
  ).bind(slug, String(body.text || '').slice(0, 5000), Number(body.total) || 0, String(body.lang || '')).run();

  return json({ ok: true });
}

/* ---------- POST /api/ai-search — «умный поиск»: гость пишет словами, ИИ подбирает блюда ----------
   Тело: { restaurantId, q, lang }  →  { items: [{ id, reason }], message }
   Модель: Gemma 4 на Workers AI (бесплатно до 10 000 нейронов в день). Повторные запросы — из кэша. */
const AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const AI_LANG_NAME = { ru: 'Russian', kk: 'Kazakh', en: 'English' };

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleAiSearch(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, { status: 400 }); }
  const slug = await resolveSlug(env, body.restaurantId);
  const q = String(body.q || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const lang = AI_LANG_NAME[body.lang] ? body.lang : 'ru';
  if (!slug) return json({ error: 'no_restaurant' }, { status: 400 });
  if (q.length < 3) return json({ error: 'too_short' }, { status: 400 });
  if (!env.AI) return json({ error: 'ai_unavailable' }, { status: 503 });

  const rows = (await env.DB.prepare(
    `SELECT i.id, i.title_ru, i.description_ru, i.price, s.title_ru AS sec
       FROM menu_items i JOIN sections s ON s.id = i.section_id AND s.active = 1
      WHERE i.restaurant_id = ? AND i.active = 1 ORDER BY s.sort, i.sort`
  ).bind(slug).all()).results;
  if (!rows.length) return json({ items: [], message: '' });

  // Компактный список: id | раздел | название | цена | короткое описание
  const menuText = rows.map((r) => {
    const d = String(r.description_ru || '').replace(/\s+/g, ' ').trim();
    return `${r.id} | ${r.sec} | ${r.title_ru} | ${Math.round(r.price || 0)} ₸ | ${d.length > 110 ? d.slice(0, 107) + '…' : d}`;
  }).join('\n');

  const cache = caches.default;
  const AI_PROMPT_VERSION = 'v2'; // поменяли инструкции — старые ответы из кэша не берём
  const cacheKey = new Request(`https://ai-search.cache/${AI_PROMPT_VERSION}/${slug}/${lang}/${await sha256(menuText + '\n#' + q.toLowerCase())}`);
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-ai-cache': 'hit' } });

  const system = `You are a friendly waiter at a restaurant. A guest describes in their own words what they feel like eating or drinking.
Pick 3 to 5 items from the MENU below that best match the request.
Rules:
- Use ONLY ids from the MENU. Never invent dishes.
- Respect every constraint (e.g. "not too fatty", "no meat", "not spicy", budget, "for two", "with beer"). If the guest asks for food, do not suggest drinks unless they ask; if they ask for a drink, suggest drinks.
- "Something WITH / FOR a drink" (e.g. "something sweet with coffee", "snacks for beer") means FOOD that goes with that drink — do not suggest the drink itself.
- Never suggest alcohol unless the guest clearly asks for alcohol.
- You may combine a main dish with a side when it clearly helps.
- For each item write one short reason (max 12 words) in ${AI_LANG_NAME[lang]}, explaining why it fits this request. Do not repeat the dish name.
- Never promise anything about allergens or dietary safety.
- "message": one short friendly sentence in ${AI_LANG_NAME[lang]} introducing the picks (max 15 words).
- If the request is not about food or drinks, return an empty "items" list and a polite "message" in ${AI_LANG_NAME[lang]}.
Answer with JSON only: {"message": "...", "items": [{"id": 123, "reason": "..."}]}

MENU (id | section | dish | price | description):
${menuText}`;

  let out;
  try {
    out = await env.AI.run(AI_MODEL, {
      messages: [{ role: 'system', content: system }, { role: 'user', content: q }],
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
      temperature: 0.3,
    });
  } catch (err) {
    return json({ error: 'ai_failed', message: String(err).slice(0, 200) }, { status: 502 });
  }

  const text = out?.choices?.[0]?.message?.content ?? out?.response ?? '';
  let parsed = null;
  try { parsed = typeof text === 'object' ? text : JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] || ''); } catch { /* ниже — пустой ответ */ }
  const valid = new Set(rows.map((r) => String(r.id)));
  const seen = new Set();
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .map((x) => ({ id: String(x?.id ?? ''), reason: String(x?.reason || '').slice(0, 160) }))
    .filter((x) => valid.has(x.id) && !seen.has(x.id) && seen.add(x.id))
    .slice(0, 5);
  const result = JSON.stringify({ items, message: String(parsed?.message || '').slice(0, 200), usage: out?.usage || null });

  if (items.length) {
    ctx.waitUntil(cache.put(cacheKey, new Response(result, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'max-age=86400' } })));
  }
  return new Response(result, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/* ---------- POST /api/track — публично, своя аналитика без Яндекс.Метрики ----------
   Тело: { restaurantId, sessionId, type, path?, refId?, refTitle?, value? }
   type: hit | add_to_cart | view_promo | view_category | order_placed | session_end */
const EVENT_TYPES = new Set(['hit', 'add_to_cart', 'view_promo', 'view_category', 'order_placed', 'session_end', 'ai_search', 'view_lunch', 'view_ar', 'show_waiter']);

async function handleTrack(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false }, { status: 400 }); } // тихо — гостю ошибка аналитики не важна

  const slug = await resolveSlug(env, body.restaurantId);
  const sessionId = String(body.sessionId || '').slice(0, 64);
  const type = String(body.type || '');
  if (!slug || !sessionId || !EVENT_TYPES.has(type)) return json({ ok: false }, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO events (restaurant_id, session_id, type, path, ref_id, ref_title, value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    slug, sessionId, type,
    String(body.path || '').slice(0, 32),
    String(body.refId || '').slice(0, 64),
    String(body.refTitle || '').slice(0, 200),
    Number(body.value) || 0
  ).run();

  return json({ ok: true });
}

/* ---------- /admin/api/* — требует входа через Cloudflare Access ---------- */
async function handleAdminApi(request, env, segments) {
  const [section, idStr] = segments;
  const method = request.method;
  const url = new URL(request.url);

  if (section === 'stats') {
    const url2 = new URL(request.url);
    const slug = normId(url2.searchParams.get('restaurant'));
    if (!slug) return json({ error: 'no_restaurant' }, { status: 400 });
    const auth = await authorize(env, request, slug);
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    const days = Math.min(90, Math.max(1, Number(url2.searchParams.get('days')) || 7));
    const since = `datetime('now', '-${days} days')`;

    const [online, sessions, hits, addToCart, categories, orders, duration] = await Promise.all([
      // «Сейчас на сайте» — гости, от которых было любое действие за последние 5 минут
      env.DB.prepare(`SELECT COUNT(DISTINCT session_id) n FROM events WHERE restaurant_id=? AND type<>'session_end' AND created_at >= datetime('now', '-5 minutes')`).bind(slug).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT session_id) n FROM events WHERE restaurant_id=? AND created_at >= ${since}`).bind(slug).first(),
      env.DB.prepare(`SELECT path, COUNT(DISTINCT session_id) n FROM events WHERE restaurant_id=? AND type='hit' AND created_at >= ${since} GROUP BY path`).bind(slug).all(),
      env.DB.prepare(`SELECT ref_title title, COUNT(*) n FROM events WHERE restaurant_id=? AND type='add_to_cart' AND created_at >= ${since} GROUP BY ref_title ORDER BY n DESC LIMIT 8`).bind(slug).all(),
      env.DB.prepare(`SELECT ref_title title, COUNT(*) n FROM events WHERE restaurant_id=? AND type='view_category' AND created_at >= ${since} GROUP BY ref_title ORDER BY n DESC LIMIT 8`).bind(slug).all(),
      env.DB.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) revenue FROM orders WHERE restaurant_id=? AND created_at >= ${since}`).bind(slug).first(),
      env.DB.prepare(`SELECT AVG(value) sec FROM events WHERE restaurant_id=? AND type='session_end' AND value > 0 AND created_at >= ${since}`).bind(slug).first()
    ]);

    const hitMap = Object.fromEntries(hits.results.map((r) => [r.path, r.n]));
    return json({
      days,
      online: online.n || 0,
      sessions: sessions.n || 0,
      funnel: { welcome: hitMap.welcome || 0, menu: hitMap.menu || 0, cart: hitMap.cart || 0 },
      topAddedToCart: addToCart.results,
      topCategories: categories.results,
      orders: { count: orders.n || 0, revenue: orders.revenue || 0 },
      avgSeconds: duration.sec ? Math.round(duration.sec) : null
    });
  }

  if (section === 'me') {
    const email = accessEmail(request);
    if (!email) return json({ error: 'no_access_email' }, { status: 401 });
    const me = await env.DB.prepare('SELECT restaurant_id, role FROM admin_users WHERE email = ?').bind(email).first();
    if (!me) return json({ error: 'not_registered', email });
    const restaurants = me.role === 'owner'
      ? (await env.DB.prepare('SELECT slug, name, active FROM restaurants ORDER BY name').all()).results
      : (await env.DB.prepare('SELECT slug, name, active FROM restaurants WHERE slug = ?').bind(me.restaurant_id).all()).results;
    return json({ email, role: me.role, restaurants });
  }

  if (section === 'restaurants') {
    const email = accessEmail(request);
    const me = await env.DB.prepare('SELECT restaurant_id, role FROM admin_users WHERE email = ?').bind(email).first();
    if (!me) return json({ error: 'not_registered' }, { status: 403 });

    const qSlug = normId(url.searchParams.get('restaurant'));

    if (method === 'GET') {
      if (qSlug) {
        // Один ресторан — владелец или его собственный редактор
        if (me.role !== 'owner' && me.restaurant_id !== qSlug) return json({ error: 'forbidden' }, { status: 403 });
        const row = await env.DB.prepare('SELECT * FROM restaurants WHERE slug = ?').bind(qSlug).first();
        if (!row) return json({ error: 'not_found' }, { status: 404 });
        if (me.role === 'owner') {
          const editors = await env.DB.prepare("SELECT email FROM admin_users WHERE restaurant_id = ? AND role = 'editor'").bind(qSlug).all();
          row.editorEmails = editors.results.map((r) => r.email);
        }
        return json({ restaurant: row });
      }
      if (me.role !== 'owner') return json({ error: 'owner_only' }, { status: 403 });
      const rows = await env.DB.prepare('SELECT * FROM restaurants ORDER BY name').all();
      return json({ restaurants: rows.results });
    }

    if (method === 'POST') {
      if (me.role !== 'owner') return json({ error: 'owner_only' }, { status: 403 });
      const b = await request.json();
      const slug = normId(b.slug);
      if (!slug) return json({ error: 'no_slug' }, { status: 400 });
      const exists = await env.DB.prepare('SELECT 1 FROM restaurants WHERE slug = ?').bind(slug).first();
      if (exists) return json({ error: 'slug_taken' }, { status: 409 });
      await env.DB.prepare(
        `INSERT INTO restaurants (slug, domain, active, name, tagline_ru, whatsapp, theme, accent_color)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`
      ).bind(slug, normId(String(b.domain || '').replace(/^https?:\/\//i, '')) || null, b.name || slug, b.tagline_ru || '', b.whatsapp || '', b.theme || 'modern', b.accentColor || '').run();
      if (b.editorEmail) {
        await env.DB.prepare('INSERT OR REPLACE INTO admin_users (email, restaurant_id, role) VALUES (?, ?, ?)')
          .bind(String(b.editorEmail).trim().toLowerCase(), slug, 'editor').run();
      }
      return json({ ok: true, slug });
    }

    if (method === 'PUT') {
      if (!qSlug) return json({ error: 'no_slug' }, { status: 400 });
      if (me.role !== 'owner' && me.restaurant_id !== qSlug) return json({ error: 'forbidden' }, { status: 403 });
      const b = await request.json();
      const cols = ['domain', 'active', 'name', 'tagline_ru', 'tagline_kk', 'tagline_en',
                    'whatsapp', 'theme', 'accent_color', 'logo_welcome', 'logo_header', 'bg_image', 'bg_video',
                    'notice_ru', 'notice_kk', 'notice_en', 'hours_from', 'hours_to', 'item_layout', 'lang_style', 'lang_color', 'lunch', 'order_mode', 'promo_style']
        .filter((c) => c in b);
      if (cols.includes('lunch')) {
        const v = b.lunch == null || b.lunch === '' ? null : (typeof b.lunch === 'string' ? b.lunch : JSON.stringify(b.lunch));
        if (v && (v.length > 60000 || !parseLunch(v))) return json({ error: 'bad_lunch' }, { status: 400 });
        b.lunch = v;
      }
      // Домен чистим тем же способом, что и при поиске по hostname (без https://, www., слэша) —
      // иначе вписанный "с запасом" адрес не совпадёт с реальным при заходе на сайт
      if (cols.includes('domain')) b.domain = normId(b.domain.replace(/^https?:\/\//i, '')) || null;
      if (cols.length) {
        const set = cols.map((c) => `${c} = ?`).join(', ');
        await env.DB.prepare(`UPDATE restaurants SET ${set} WHERE slug = ?`).bind(...cols.map((c) => toSql(b[c])), qSlug).run();
      }
      // Управлять списком редакторов может только владелец, даже если остальные поля правит сам ресторан.
      // editorEmails — это ВЕСЬ желаемый список целиком (не один добавляемый email): у ресторана
      // может быть несколько редакторов разом, поэтому проще каждый раз полностью заменить набор
      // editor-записей этого ресторана на присланный, чем вычислять разницу построчно.
      // Пустой массив — это осознанное «убрать всех».
      if (me.role === 'owner' && Array.isArray(b.editorEmails)) {
        await env.DB.prepare("DELETE FROM admin_users WHERE restaurant_id = ? AND role = 'editor'").bind(qSlug).run();
        const emails = [...new Set(b.editorEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
        for (const email of emails) {
          await env.DB.prepare('INSERT OR REPLACE INTO admin_users (email, restaurant_id, role) VALUES (?, ?, ?)')
            .bind(email, qSlug, 'editor').run();
        }
      }
      return json({ ok: true });
    }
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const def = ADMIN_TABLES[section];
  if (!def) return json({ error: 'not_found' }, { status: 404 });

  const slug = normId(url.searchParams.get('restaurant'));
  if (!slug) return json({ error: 'no_restaurant' }, { status: 400 });

  const auth = await authorize(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  if (method === 'GET') {
    const rows = await env.DB.prepare(`SELECT * FROM ${def.table} WHERE restaurant_id = ? ORDER BY sort`).bind(slug).all();
    let items = rows.results;
    if (section === 'menu-items') {
      // variants/recommendations/badge_ids хранятся в базе как строка (JSON / список через запятую) —
      // тем же способом их превращает в объект и публичный /api/menu
      items = items.map((r) => ({
        ...r,
        variants: safeVariants(r.variants),
        recommendations: r.recommendations ? r.recommendations.split(',').map((s) => s.trim()).filter(Boolean) : [],
        badgeIds: r.badge_ids ? r.badge_ids.split(',').map((s) => s.trim()).filter(Boolean) : []
      }));
    }
    return json({ items });
  }
  if (method === 'POST') {
    const body = normalizeFK(section, await request.json());
    const cols = def.cols.filter((c) => c in body);
    const placeholders = cols.map(() => '?').join(',');
    const res = await env.DB.prepare(
      `INSERT INTO ${def.table} (restaurant_id${cols.length ? ', ' + cols.join(', ') : ''}) VALUES (?${cols.length ? ', ' + placeholders : ''})`
    ).bind(slug, ...cols.map((c) => toSql(body[c]))).run();
    return json({ ok: true, id: res.meta.last_row_id });
  }

  // PUT /admin/api/<таблица>/reorder { ids: [...] } — новый порядок после перетаскивания в админке.
  // Одним batch-запросом проставляем sort = 10, 20, 30… в присланной последовательности, чтобы
  // порядок сохранялся целиком и сразу, а не N отдельными запросами (половина могла бы не дойти).
  if (idStr === 'reorder' && method === 'PUT') {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return json({ error: 'no_ids' }, { status: 400 });
    const stmts = ids.map((rid, i) =>
      env.DB.prepare(`UPDATE ${def.table} SET sort = ? WHERE id = ? AND restaurant_id = ?`).bind((i + 1) * 10, Number(rid), slug));
    await env.DB.batch(stmts);
    return json({ ok: true });
  }

  const id = Number(idStr);
  if (!id) return json({ error: 'no_id' }, { status: 400 });

  if (method === 'PUT') {
    const body = normalizeFK(section, await request.json());
    const cols = def.cols.filter((c) => c in body);
    if (!cols.length) return json({ ok: true });
    const set = cols.map((c) => `${c} = ?`).join(', ');
    await env.DB.prepare(`UPDATE ${def.table} SET ${set} WHERE id = ? AND restaurant_id = ?`)
      .bind(...cols.map((c) => toSql(body[c])), id, slug).run();
    return json({ ok: true });
  }
  if (method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM ${def.table} WHERE id = ? AND restaurant_id = ?`).bind(id, slug).run();
    return json({ ok: true });
  }
  return json({ error: 'method_not_allowed' }, { status: 405 });
}

/* ---------- POST /admin/api/import-menu?restaurant=slug — AI читает страницу меню ----------
   Тело: { image: 'data:image/jpeg;base64,…', page: 1 }. Одна страница за запрос — браузер шлёт их по очереди,
   поэтому большой PDF не упирается в лимиты одного запроса. Ничего не сохраняет: только возвращает
   найденные позиции, а в меню их добавляет админка после проверки человеком. */
const IMPORT_MAX_IMAGE = 6 * 1024 * 1024;
async function handleImportMenu(request, env) {
  const url = new URL(request.url);
  const slug = normId(url.searchParams.get('restaurant'));
  if (!slug) return json({ error: 'no_restaurant' }, { status: 400 });
  const auth = await authorize(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
  if (!env.AI) return json({ error: 'ai_unavailable' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, { status: 400 }); }
  const image = String(body.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) return json({ error: 'bad_image' }, { status: 400 });
  if (image.length > IMPORT_MAX_IMAGE * 1.37) return json({ error: 'too_large' }, { status: 413 });

  const system = `You read restaurant menu pages (photos or scans, usually Russian/Kazakh/English) and extract every dish or drink as JSON.
Rules:
- Extract ONLY what is printed on the page. Never invent dishes, prices or descriptions.
- "section": the heading the item belongs to on the page (e.g. "Салаты", "Горячие блюда", "Коктейли"). If the page has no heading above an item, reuse the last heading; if none at all, use "".
- "title": dish name exactly as printed, normal capitalization (not ALL CAPS).
- "description": ingredients/composition text if printed, else "". Do not include weight or price here.
- "weight": portion size as printed (e.g. "250 г", "0,5 л", "30 мл"), else "".
- "price": number in tenge without spaces (e.g. 3500). If several sizes/prices are printed for one item, put the smallest in "price" and list all in "variants" as [{"label": "0,3 л", "price": 1200}, ...]; else "variants": [].
- "alcohol": true for alcoholic drinks, else false.
- "confidence": "high" if name and price are clearly readable, "low" if anything is cut off, blurry or guessed.
- Ignore phone numbers, addresses, slogans, service charge notes, page numbers.
Answer with JSON only: {"items":[{"section":"","title":"","description":"","weight":"","price":0,"variants":[],"alcohol":false,"confidence":"high"}]}`;

  let out;
  try {
    out = await env.AI.run(AI_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'text', text: 'Extract all menu items from this page.' },
          { type: 'image_url', image_url: { url: image } }
        ] }
      ],
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'json_object' },
      max_completion_tokens: 6000,
      temperature: 0.1,
    });
  } catch (err) {
    return json({ error: 'ai_failed', message: String(err).slice(0, 300) }, { status: 502 });
  }
  const text = out?.choices?.[0]?.message?.content ?? out?.response ?? '';
  let parsed = null;
  try { parsed = typeof text === 'object' ? text : JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] || ''); } catch { /* ниже */ }
  const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n) : 0; };
  const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const items = (Array.isArray(parsed?.items) ? parsed.items : []).map((x) => ({
    section: str(x?.section, 80),
    title: str(x?.title, 160),
    description: str(x?.description, 600),
    weight: str(x?.weight, 40),
    price: num(x?.price),
    variants: (Array.isArray(x?.variants) ? x.variants : []).map((v) => ({ label: str(v?.label, 40), price: num(v?.price) })).filter((v) => v.label && v.price).slice(0, 8),
    alcohol: !!x?.alcohol,
    confidence: x?.confidence === 'low' || !num(x?.price) ? 'low' : 'high'
  })).filter((x) => x.title).slice(0, 200);
  return json({ page: Number(body.page) || 1, items, usage: out?.usage || null, raw: items.length ? undefined : String(text).slice(0, 500) });
}

/* =========================================================
   AR «БЛЮДО НА СТОЛЕ»
   1) POST /admin/api/ar-cutout?restaurant=slug { image: '/files/…' } — вырезаем блюдо из фото
      (Cloudflare Images, segment=foreground → PNG с прозрачным фоном) и кладём в R2.
   2) GET /ar/<id>.glb — из вырезки собираем простую 3D-сцену: фото-плоскость в натуральную величину.
      ar_mode: 'flat' — лежит на столе (фото сверху), 'stand' — стоит (фото сбоку: напитки, бургеры).
      Гость открывает её через <model-viewer>: iPhone (Quick Look) и Android (Scene Viewer) — без приложений.
   ========================================================= */
async function handleArCutout(request, env) {
  const url = new URL(request.url);
  const slug = normId(url.searchParams.get('restaurant'));
  if (!slug) return json({ error: 'no_restaurant' }, { status: 400 });
  const auth = await authorize(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
  if (!env.IMAGES) return json({ error: 'images_unavailable', message: 'Не подключены Cloudflare Images' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const m = String(body.image || '').match(/\/files\/(.+)$/);
  if (!m) return json({ error: 'bad_image', message: 'Сначала загрузите фото блюда' }, { status: 400 });
  const key = decodeURIComponent(m[1]);
  if (!key.startsWith(slug + '/')) return json({ error: 'forbidden' }, { status: 403 });
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: 'not_found' }, { status: 404 });
  let png;
  try {
    const res = await env.IMAGES.input(obj.body)
      .transform({ segment: 'foreground', width: 1024, height: 1024, fit: 'scale-down' })
      .output({ format: 'image/png' });
    png = await res.response().arrayBuffer();
  } catch (err) {
    return json({ error: 'cutout_failed', message: String(err).slice(0, 200) }, { status: 502 });
  }
  const outKey = `${slug}/ar-${crypto.randomUUID()}.png`;
  await env.BUCKET.put(outKey, png, { httpMetadata: { contentType: 'image/png' } });
  return json({ ok: true, url: `/files/${outKey}` });
}

function pngSize(buf) {
  const v = new DataView(buf);
  if (v.getUint32(0) !== 0x89504e47) return null;
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** Минимальный GLB: одна текстурированная плоскость, свет не влияет (KHR_materials_unlit) — цвета как на фото */
function buildPlaneGlb(png, { w, h }, mode, sizeCm) {
  const W = Math.max(0.05, Math.min(1.2, (sizeCm || (mode === 'stand' ? 12 : 26)) / 100));
  const H = W * h / w;
  const pos = mode === 'stand'
    ? [-W / 2, 0, 0,  W / 2, 0, 0,  W / 2, H, 0,  -W / 2, H, 0]
    : [-W / 2, 0.003, H / 2,  W / 2, 0.003, H / 2,  W / 2, 0.003, -H / 2,  -W / 2, 0.003, -H / 2];
  const nrm = mode === 'stand' ? [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1] : [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  const idx = [0, 1, 2, 0, 2, 3];
  const f32 = (a) => new Uint8Array(new Float32Array(a).buffer);
  const parts = [f32(pos), f32(nrm), f32(uv), new Uint8Array(new Uint16Array(idx).buffer), new Uint8Array(png)];
  const views = []; let off = 0; const chunks = [];
  parts.forEach((p, i) => {
    const pad = (4 - (p.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: off, byteLength: p.length, ...(i < 3 ? { target: 34962 } : i === 3 ? { target: 34963 } : {}) });
    chunks.push(p, new Uint8Array(pad)); off += p.length + pad;
  });
  const bin = new Uint8Array(off); let o = 0; chunks.forEach((c) => { bin.set(c, o); o += c.length; });
  const gltf = {
    asset: { version: '2.0', generator: 'tut.menu' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
                  alphaMode: 'BLEND', doubleSided: true, extensions: { KHR_materials_unlit: {} } }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987 }],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [Math.min(...pos.filter((_, i) => i % 3 === 0)), Math.min(...pos.filter((_, i) => i % 3 === 1)), Math.min(...pos.filter((_, i) => i % 3 === 2))], max: [Math.max(...pos.filter((_, i) => i % 3 === 0)), Math.max(...pos.filter((_, i) => i % 3 === 1)), Math.max(...pos.filter((_, i) => i % 3 === 2))] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' }
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: views
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jsonBytes.length + jpad).fill(0x20); t.set(jsonBytes); jsonBytes = t; }
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
  const b0 = 20 + jsonBytes.length;
  dv.setUint32(b0, bin.length, true); dv.setUint32(b0 + 4, 0x004e4942, true); out.set(bin, b0 + 8);
  return out;
}

async function handleArGlb(request, env, ctx, idStr) {
  const id = Number(String(idStr).replace(/\.glb$/i, ''));
  if (!id) return new Response('Not found', { status: 404 });
  const row = await env.DB.prepare('SELECT ar_image, ar_mode, ar_size FROM menu_items WHERE id = ? AND active = 1').bind(id).first();
  // Вырезка лежит либо в R2 (/files/… — сделана из админки), либо в файлах сайта (/media/ar/… — подготовлена заранее)
  const src = row ? String(row.ar_image || '') : '';
  // Готовая 3D-модель (рельеф по фото или модель из сервиса) — отдаём как есть
  if (/^\/media\/ar\/[\w.-]+\.glb$/.test(src)) {
    const r = await env.ASSETS.fetch(new URL(src, request.url));
    if (!r.ok) return new Response('Not found', { status: 404 });
    return new Response(r.body, { headers: { 'content-type': 'model/gltf-binary', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } });
  }
  const m = src.match(/\/files\/(.+)$/);
  const asset = src.match(/^\/media\/ar\/[\w.-]+\.png$/);
  if (!m && !asset) return new Response('Not found', { status: 404 });
  const mode = row.ar_mode === 'stand' ? 'stand' : 'flat';
  const size = Number(row.ar_size) || 0;
  const cache = caches.default;
  const cacheKey = new Request(`https://ar.cache/${id}/${encodeURIComponent(src)}/${mode}/${size}.glb`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  let png;
  if (m) {
    const obj = await env.BUCKET.get(decodeURIComponent(m[1]));
    if (!obj) return new Response('Not found', { status: 404 });
    png = await obj.arrayBuffer();
  } else {
    const r = await env.ASSETS.fetch(new URL(src, request.url));
    if (!r.ok) return new Response('Not found', { status: 404 });
    png = await r.arrayBuffer();
  }
  const dim = pngSize(png);
  if (!dim) return new Response('Bad image', { status: 415 });
  const glb = buildPlaneGlb(png, dim, mode, size);
  const res = new Response(glb, { headers: { 'content-type': 'model/gltf-binary', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

/* ---------- POST /admin/api/upload — фото/видео в R2 ---------- */
const MAX_BYTES_IMAGE = 20 * 1024 * 1024;
const MAX_BYTES_VIDEO = 60 * 1024 * 1024;

async function handleUpload(request, env) {
  const url = new URL(request.url);
  const slug = normId(url.searchParams.get('restaurant'));
  if (!slug) return json({ error: 'no_restaurant' }, { status: 400 });

  const auth = await authorize(env, request, slug);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no_file' }, { status: 400 });

  const isVideo = /^video\//.test(file.type);
  const isImage = /^image\//.test(file.type);
  if (!isVideo && !isImage) return json({ error: 'bad_type', message: 'Можно загружать только фото или видео' }, { status: 415 });

  const limit = isVideo ? MAX_BYTES_VIDEO : MAX_BYTES_IMAGE;
  if (file.size > limit) return json({ error: 'too_large', message: `Файл больше ${Math.round(limit / 1024 / 1024)} МБ` }, { status: 413 });

  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `${slug}/${crypto.randomUUID()}.${ext}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  // Ссылка без домена: фото открывается с того же адреса, что и меню (tipagraf.kz и т.п.),
  // без лишнего соединения с отдельным *.workers.dev — это заметно быстрее на телефоне.
  return json({ ok: true, url: `/files/${key}` });
}

/* ---------- GET /files/<slug>/<файл> — публично ---------- */
// Файлы лежат в R2 в Европе. Чтобы гость в Уральске не ждал каждый раз дорогу туда и обратно,
// кладём ответ в кэш ближайшего к нему сервера Cloudflare (Cache API) — следующие гости
// получают фото оттуда. Видео браузеры просят кусками (Range) — отдаём куски напрямую из R2,
// иначе Safari на iPhone может вообще не проиграть ролик.
async function handleFiles(request, env, ctx, segments) {
  const key = segments.join('/');
  if (!key) return new Response('Not found', { status: 404 });

  // Диагностика: /files/...?info=1 — размер, тип и какой кодек внутри (для разбора «видео не играет»).
  // Файлы и так публичные, тут только их техническое описание.
  if (new URL(request.url).searchParams.has('info')) {
    const head = await env.BUCKET.head(key);
    if (!head) return json({ error: 'not_found' }, { status: 404 });
    const take = Math.min(head.size, 2 * 1024 * 1024);
    const first = new Uint8Array(await (await env.BUCKET.get(key, { range: { offset: 0, length: take } })).arrayBuffer());
    const lastOff = Math.max(0, head.size - take);
    const last = new Uint8Array(await (await env.BUCKET.get(key, { range: { offset: lastOff, length: head.size - lastOff } })).arrayBuffer());
    const str = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
    const a = str(first), z = str(last);
    const has = (t) => a.includes(t) || z.includes(t);
    // Самопроверка ответа на запрос куском (так видео запрашивает iPhone): ?info=1&range=bytes=0-1
    const rt = new URL(request.url).searchParams.get('range');
    let rangeTest = null;
    if (rt) {
      const r = await handleFiles(new Request(new URL(request.url).origin + '/files/' + key, { headers: { range: rt } }), env, ctx, segments);
      rangeTest = { status: r.status, bodyBytes: (await r.arrayBuffer()).byteLength, headers: Object.fromEntries(r.headers) };
    }
    return json({
      rangeTest,
      size: head.size, contentType: head.httpMetadata?.contentType || '', uploaded: head.uploaded,
      ftypBrand: a.slice(8, 12), firstBoxes: [...a.slice(0, 64).matchAll(/(ftyp|moov|moof|mdat|free|wide|EBML)/g)].map((m) => m[0]),
      moovAt: a.includes('moov') ? 'start' : z.includes('moov') ? 'end' : 'unknown',
      fragmented: has('moof'), avc1: has('avc1'), hvc1: has('hvc1') || has('hev1'), vp09: has('vp09'), av01: has('av01'),
      webm: a.startsWith('\x1a\x45\xdf\xa3'), mp4a: has('mp4a'), opus: has('Opus') || has('opus')
    });
  }

  // Запрос куском (Range) — так видео грузит Safari на iPhone, и без правильного ответа 206
  // он видео не проигрывает вовсе. Разбираем заголовок сами и сами считаем границы.
  const range = request.headers.get('range');
  const rm = range && range.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (rm && (rm[1] !== '' || rm[2] !== '')) {
    let r2range;
    if (rm[1] === '') r2range = { suffix: Number(rm[2]) };                          // bytes=-500
    else if (rm[2] === '') r2range = { offset: Number(rm[1]) };                     // bytes=100-
    else r2range = { offset: Number(rm[1]), length: Number(rm[2]) - Number(rm[1]) + 1 }; // bytes=0-1
    const meta = await env.BUCKET.head(key);
    if (!meta) return new Response('Not found', { status: 404 });
    const size = meta.size;
    let start, endByte;
    if ('suffix' in r2range) { start = Math.max(0, size - r2range.suffix); endByte = size - 1; }
    else { start = r2range.offset; endByte = r2range.length ? Math.min(size - 1, start + r2range.length - 1) : size - 1; }
    if (!(start >= 0) || start >= size || endByte < start) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    const length = endByte - start + 1;
    const obj = await env.BUCKET.get(key, { range: { offset: start, length } });
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('content-range', `bytes ${start}-${endByte}/${size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + '/files/' + key);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('content-length', String(obj.size));
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const res = new Response(obj.body, { headers });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

/* ---------- /media/*.mp4 — статичное видео с поддержкой Range ---------- */
async function serveMediaWithRange(request, env, url) {
  const asset = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
  if (!asset.ok) return asset;
  const buf = await asset.arrayBuffer();
  const size = buf.byteLength;
  const headers = new Headers({
    'content-type': asset.headers.get('content-type') || 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=86400',
  });
  const etag = asset.headers.get('etag'); if (etag) headers.set('etag', etag);
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get('range') || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    headers.set('content-length', String(size));
    return new Response(request.method === 'HEAD' ? null : buf, { status: 200, headers });
  }
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(request.method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers });
}

/* ---------- SEO: главная страница с данными ресторана для поисковиков ----------
   Меню рисуется скриптом, поэтому поисковики без JS видели только «Меню». Здесь сервер
   сам вписывает в index.html название, описание, превью для соцсетей, разметку Restaurant
   и текстовую версию меню (<noscript>) — под тот ресторан, чей это домен. */
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function seoRestaurant(env, url) {
  const id = normId(url.searchParams.get('r') || url.hostname);
  return env.DB.prepare('SELECT * FROM restaurants WHERE (slug = ?1 OR domain = ?1) AND active = 1').bind(id).first();
}

function seoUrls(rest, url) {
  const origin = rest.domain ? `https://${rest.domain}` : url.origin;
  const canonical = rest.domain ? `${origin}/` : `${origin}/?r=${encodeURIComponent(rest.slug)}`;
  const abs = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    u = u.replace(/^https?:\/\/[^/]+\.workers\.dev(?=\/)/i, origin);
    return u.startsWith('/') ? origin + u : u;
  };
  return { origin, canonical, abs };
}

async function serveIndexWithSeo(request, env, url) {
  const page = await env.ASSETS.fetch(new Request(new URL('/', url).toString(), { headers: request.headers }));
  if (!page.ok || !(page.headers.get('content-type') || '').includes('text/html')) return page;
  const rest = await seoRestaurant(env, url).catch(() => null);
  if (!rest) return page;

  const slug = rest.slug;
  const [sections, items] = await Promise.all([
    env.DB.prepare('SELECT id, title_ru FROM sections WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all(),
    env.DB.prepare('SELECT section_id, title_ru, description_ru, price FROM menu_items WHERE restaurant_id = ? AND active = 1 ORDER BY sort').bind(slug).all()
  ]);
  const { canonical, abs } = seoUrls(rest, url);
  const name = rest.name || slug;
  const title = rest.seo_title || `${name} — онлайн-меню${rest.tagline_ru ? ' · ' + rest.tagline_ru : ''}`;
  const desc = rest.seo_description || `Онлайн-меню ${name}: блюда с фото, описаниями и ценами на казахском, русском и английском.`;
  const image = abs(rest.bg_image) || abs(rest.logo_welcome);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Restaurant', name, url: canonical, description: desc,
    ...(image ? { image } : {}), hasMenu: canonical, acceptsReservations: true
  };
  const head = `
    <meta name="description" content="${escHtml(desc)}">
    <link rel="canonical" href="${escHtml(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escHtml(name)}">
    <meta property="og:title" content="${escHtml(title)}">
    <meta property="og:description" content="${escHtml(desc)}">
    <meta property="og:url" content="${escHtml(canonical)}">
    <meta property="og:locale" content="ru_RU">
    ${image ? `<meta property="og:image" content="${escHtml(image)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;

  const bySec = new Map();
  for (const it of items.results) {
    const k = String(it.section_id);
    if (!bySec.has(k)) bySec.set(k, []);
    bySec.get(k).push(it);
  }
  const money = (v) => Math.round(Number(v) || 0).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + ' ₸';
  const menuHtml = sections.results.filter((sec) => bySec.has(String(sec.id))).map((sec) => `
      <h2>${escHtml(sec.title_ru)}</h2>
      <ul>${bySec.get(String(sec.id)).map((it) => `<li>${escHtml(it.title_ru)}${it.price ? ' — ' + money(it.price) : ''}${it.description_ru ? '. ' + escHtml(String(it.description_ru).slice(0, 160)) : ''}</li>`).join('')}</ul>`).join('');
  const noscript = `<noscript><main class="seo-menu"><h1>${escHtml(title)}</h1><p>${escHtml(desc)}</p>${menuHtml}</main></noscript>`;

  const out = new HTMLRewriter()
    .on('html', { element(el) { el.setAttribute('lang', 'ru'); } })
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('head', { element(el) { el.append(head, { html: true }); } })
    .on('body', { element(el) { el.prepend(noscript, { html: true }); } })
    .transform(page);
  const res = new Response(out.body, out);
  res.headers.set('cache-control', 'public, max-age=60');
  return res;
}

async function serveRobots(env, url) {
  const rest = await seoRestaurant(env, url).catch(() => null);
  const { origin } = rest ? seoUrls(rest, url) : { origin: url.origin };
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function serveSitemap(env, url) {
  const rest = await seoRestaurant(env, url).catch(() => null);
  if (!rest) return new Response('Not found', { status: 404 });
  const { canonical } = seoUrls(rest, url);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escHtml(canonical)}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

const SALES_HOSTS = new Set(['tutmenu.kz', 'www.tutmenu.kz']);


/* =========================================================
   ДЕМО ИЗ КОНСТРУКТОРА (tutmenu.kz/demo/<slug>)
   Тестовое меню (media/demo/template.json) в дизайне клиента: название, логотип, тема.
   Каждое демо — лид в таблице demos; живёт 3 суток.
   ========================================================= */
const DEMO_TTL_MS = 72 * 3600 * 1000;
const DEMO_LIMIT_PER_IP = 5;          // демо с одного IP за сутки

async function demoTemplate(env, request) {
  const res = await env.ASSETS.fetch(new Request(new URL('/media/demo/template.json', request.url)));
  return res.json();
}

const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',ә:'a',ғ:'g',қ:'k',ң:'n',ө:'o',ұ:'u',ү:'u',һ:'h',і:'i' };
function demoSlugFrom(name) {
  const base = String(name || '').toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'menu';
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${base}-${rnd}`;
}

async function handleDemoMenu(request, env, slug) {
  const data = await demoTemplate(env, request);
  if (slug === 'preview') return json(data, { headers: { 'cache-control': 'no-store' } });
  const row = await env.DB.prepare('SELECT * FROM demos WHERE slug = ?1').bind(slug).first();
  if (!row) return json({ error: 'not_found', message: 'Демо не найдено' }, { status: 404 });
  const expired = Date.parse(row.expires_at) <= Date.now();
  let design = {}, blocks = {};
  try { design = JSON.parse(row.design || '{}'); } catch {}
  try { blocks = JSON.parse(row.blocks || '{}'); } catch {}
  const s = data.settings;
  s.name = row.restaurant_name || s.name;
  s.design = design;
  if (row.logo) { s.logoHeader = row.logo; s.logoWelcome = row.logo; }
  if (blocks.promos === false) data.promos = [];
  if (blocks.lunch === false) s.lunch = null;
  s.demo = { slug, expiresAt: row.expires_at, expired, restaurant: row.restaurant_name };
  if (!expired) {
    await env.DB.prepare("UPDATE demos SET views = views + 1, last_view_at = ?2 WHERE slug = ?1")
      .bind(slug, new Date().toISOString()).run().catch(() => {});
  }
  return json(data, { headers: { 'cache-control': 'no-store' } });
}

async function handleDemoCreate(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, { status: 400 }); }
  const info = body.info || {};
  const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const owner = clean(info.owner, 60), name = clean(info.name, 60), city = clean(info.city, 40), kind = clean(info.kind, 20);
  const phone = clean(info.phone, 24);
  if (!owner || !name || phone.replace(/\D/g, '').length < 11) return json({ error: 'fields', message: 'Заполните имя, название и телефон' }, { status: 400 });

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM demos WHERE ip = ?1 AND created_at > ?2').bind(ip, dayAgo).first();
  if (cnt && cnt.n >= DEMO_LIMIT_PER_IP) return json({ error: 'limit', message: 'Слишком много демо за сутки' }, { status: 429 });

  // Дизайн: только известные ключи и короткие значения
  const d = body.design || {};
  const design = {};
  for (const k of ['theme', 'style', 'palette', 'fonts', 'welcomeBg']) if (typeof d[k] === 'string' && /^[a-z]{2,12}$/.test(d[k])) design[k] = d[k];
  if (typeof d.accent === 'string' && /^#[0-9a-f]{6}$/i.test(d.accent)) design.accent = d.accent;
  if (d.welcome === false) design.welcome = false;
  const b = body.blocks || {};
  const blocks = { promos: b.promos !== false, lunch: b.lunch !== false, stories: b.stories === true };

  const slug = demoSlugFrom(name);
  // Логотип приходит из конструктора уже уменьшенным (PNG data URL) — кладём в R2
  let logo = '';
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.logo || ''));
  if (m && m[2].length < 2_000_000) {
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const key = `demos/${slug}/logo.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: `image/${m[1]}` } });
    logo = `/files/${key}`;
  }
  const now = new Date();
  await env.DB.prepare(`INSERT INTO demos (slug, owner_name, restaurant_name, phone, city, kind, logo, design, blocks, ip, created_at, expires_at, views, status)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 'new')`)
    .bind(slug, owner, name, phone, city, kind, logo, JSON.stringify(design), JSON.stringify(blocks), ip,
      now.toISOString(), new Date(now.getTime() + DEMO_TTL_MS).toISOString()).run();
  const origin = new URL(request.url).origin;
  const T = (k) => k ? k : '—';
  ctx.waitUntil(tgNotify(env, [
    '🆕 Новое демо tut.menu',
    `${name}${kind ? ' · ' + (KIND_NAMES[kind] || kind) : ''}${city ? ', ' + city : ''}`,
    `${owner} · ${phone}`,
    `Дизайн: ${T(design.theme)} / ${T(design.style)} / ${T(design.palette)} / ${T(design.fonts)}`,
    `${origin}/demo/${slug}`,
    `WhatsApp: https://wa.me/${phone.replace(/\D/g, '').replace(/^8/, '7')}`
  ].join('\n')));
  return json({ ok: true, slug, url: `/demo/${slug}` });
}

/* ---------- Telegram: уведомления о новых демо (бот @tutmenu_bot) ----------
   Секреты задаются в Cloudflare: TG_TOKEN (токен бота) и TG_CHAT_ID (куда слать). */
// Токен и чат берутся из секретов Cloudflare, а если их нет — из app_config (владелец вводит в админке сам)
async function cfg(env, key) {
  const r = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?1').bind(key).first().catch(() => null);
  return r ? r.value : '';
}
async function setCfg(env, key, value) {
  await env.DB.prepare('INSERT INTO app_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}
async function tgCreds(env) {
  return { token: env.TG_TOKEN || await cfg(env, 'tg_token'), chat: env.TG_CHAT_ID || await cfg(env, 'tg_chat_id') };
}
async function tgCall(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {})
  });
  return r.json().catch(() => ({ ok: false }));
}
async function tgNotify(env, text) {
  try {
    const { token, chat } = await tgCreds(env);
    if (!token || !chat) return;
    await tgCall(token, 'sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
  } catch { /* уведомление не должно ломать создание демо */ }
}

/** Настройка Telegram из админки (только владелец). Токен назад в браузер не отдаём никогда. */
async function handleTgApi(request, env, action) {
  const auth = await ownerOnly(env, request);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
  const method = request.method;
  const { token, chat } = await tgCreds(env);
  if (!action && method === 'GET') {
    return json({ tokenSet: !!token, chatSet: !!chat, chatName: await cfg(env, 'tg_chat_name'), bot: await cfg(env, 'tg_bot') });
  }
  if (!action && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const t = String(b.token || '').trim();
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(t)) return json({ error: 'bad_token', message: 'Это не похоже на токен бота' }, { status: 400 });
    const me = await tgCall(t, 'getMe');
    if (!me.ok) return json({ error: 'bad_token', message: 'Telegram не принял токен' }, { status: 400 });
    await setCfg(env, 'tg_token', t);
    await setCfg(env, 'tg_bot', '@' + me.result.username);
    return json({ ok: true, bot: '@' + me.result.username });
  }
  if (action === 'find-chat' && method === 'POST') {
    if (!token) return json({ error: 'no_token' }, { status: 400 });
    const up = await tgCall(token, 'getUpdates', { limit: 50 });
    const msgs = (up.result || []).map((u) => u.message).filter((m) => m && m.chat && m.chat.type === 'private' && /^\/start/.test(m.text || ''));
    const last = msgs[msgs.length - 1];
    if (!last) return json({ error: 'no_start', message: 'Бот ещё не получил /start. Напишите ему /start и нажмите снова.' }, { status: 404 });
    const name = [last.chat.first_name, last.chat.last_name].filter(Boolean).join(' ') + (last.chat.username ? ` (@${last.chat.username})` : '');
    await setCfg(env, 'tg_chat_id', String(last.chat.id));
    await setCfg(env, 'tg_chat_name', name);
    await tgCall(token, 'sendMessage', { chat_id: last.chat.id, text: '✅ Готово! Сюда будут приходить новые демо tut.menu.' });
    return json({ ok: true, chatName: name });
  }
  if (action === 'test' && method === 'POST') {
    if (!token || !chat) return json({ error: 'not_ready' }, { status: 400 });
    const r = await tgCall(token, 'sendMessage', { chat_id: chat, text: '🔔 Проверка: уведомления tut.menu работают.' });
    return json({ ok: !!r.ok });
  }
  return json({ error: 'not_found' }, { status: 404 });
}
const KIND_NAMES = { restaurant: 'Ресторан', cafe: 'Кафе', coffee: 'Кофейня', lounge: 'Лаунж/кальянная', bar: 'Бар', sushi: 'Суши', pizza: 'Пиццерия', fastfood: 'Фастфуд', bakery: 'Кондитерская', canteen: 'Столовая' };

/* ---------- Лиды (демо) в админке — только владелец tut.menu ---------- */
async function ownerOnly(env, request) {
  const email = accessEmail(request);
  if (!email) return { ok: false, status: 401, error: 'no_access_email' };
  const row = await env.DB.prepare('SELECT role FROM admin_users WHERE email = ?').bind(email).first();
  if (!row || row.role !== 'owner') return { ok: false, status: 403, error: 'owner_only' };
  return { ok: true, email };
}
async function handleLeadsApi(request, env, slug, action) {
  const auth = await ownerOnly(env, request);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
  const method = request.method;
  if (!slug && method === 'GET') {
    const r = await env.DB.prepare('SELECT slug, owner_name, restaurant_name, phone, city, kind, design, created_at, expires_at, views, last_view_at, status, note, deleted_at FROM demos ORDER BY created_at DESC LIMIT 500').all();
    return json({ items: r.results });
  }
  if (slug && method === 'PUT' && !action) {
    const b = await request.json().catch(() => ({}));
    const status = ['new', 'contacted', 'paid', 'declined'].includes(b.status) ? b.status : null;
    const note = typeof b.note === 'string' ? b.note.slice(0, 1000) : null;
    await env.DB.prepare('UPDATE demos SET status = COALESCE(?2, status), note = COALESCE(?3, note) WHERE slug = ?1').bind(slug, status, note).run();
    return json({ ok: true });
  }
  if (slug && method === 'POST' && action === 'extend') {
    // «Восстановим за минуту»: демо снова живёт 3 дня
    await env.DB.prepare('UPDATE demos SET expires_at = ?2, deleted_at = NULL WHERE slug = ?1')
      .bind(slug, new Date(Date.now() + DEMO_TTL_MS).toISOString()).run();
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, { status: 404 });
}

/** Раз в час: у истёкших демо удаляем файлы (логотип) в R2. Запись остаётся — это лид в админке;
 *  по старой ссылке открывается «Демо истекло». */
async function cleanupDemos(env) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare('SELECT slug, logo FROM demos WHERE expires_at <= ?1 AND deleted_at IS NULL LIMIT 200').bind(now).all();
  for (const d of r.results) {
    const list = await env.BUCKET.list({ prefix: `demos/${d.slug}/` });
    for (const o of list.objects) await env.BUCKET.delete(o.key);
    await env.DB.prepare("UPDATE demos SET deleted_at = ?2, logo = '' WHERE slug = ?1").bind(d.slug, now).run();
  }
  return r.results.length;
}

/** Страница демо: то же приложение меню, с <base href="/">, чтобы файлы грузились от корня */
async function serveDemoPage(request, env) {
  const res = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  const html = (await res.text()).replace('<head>', '<head><base href="/"><meta name="robots" content="noindex">');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

/* ---------- Маршрутизация ---------- */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupDemos(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;

    try {
      if (p === '/api/menu' && method === 'GET') {
        const did = (url.searchParams.get('id') || '').toLowerCase();
        if (did.startsWith('demo:')) return await handleDemoMenu(request, env, did.slice(5).replace(/[^a-z0-9-]/g, ''));
        return await handleMenu(request, env);
      }
      if (p === '/api/demo' && method === 'POST') return await handleDemoCreate(request, env, ctx);
      if (p === '/api/orders' && method === 'POST') return await handleOrders(request, env);
      if (p === '/api/track' && method === 'POST') return await handleTrack(request, env);
      if (p === '/api/ai-search' && method === 'POST') return await handleAiSearch(request, env, ctx);
      if (p === '/admin/api/upload' && method === 'POST') return await handleUpload(request, env);
      if (p === '/admin/api/import-menu' && method === 'POST') return await handleImportMenu(request, env);
      if (p === '/admin/api/ar-cutout' && method === 'POST') return await handleArCutout(request, env);
      if (p.startsWith('/ar/') && (method === 'GET' || method === 'HEAD')) return await handleArGlb(request, env, ctx, p.slice(4));
      if (p === '/admin/api/tg' || p.startsWith('/admin/api/tg/')) {
        return await handleTgApi(request, env, p.split('/')[4] || '');
      }
      if (p.startsWith('/admin/api/leads')) {
        const [, , , , slug, action] = p.split('/');
        return await handleLeadsApi(request, env, (slug || '').replace(/[^a-z0-9-]/g, ''), action);
      }
      if (p.startsWith('/admin/api/')) {
        const segments = p.slice('/admin/api/'.length).split('/').filter(Boolean);
        return await handleAdminApi(request, env, segments);
      }
      if (p.startsWith('/files/') && (method === 'GET' || method === 'HEAD')) {
        const segments = p.slice('/files/'.length).split('/').filter(Boolean);
        return await handleFiles(request, env, ctx, segments);
      }
    } catch (err) {
      return json({ error: 'server_error', message: String(err) }, { status: 500 });
    }

    // Демо из конструктора — только на продающем домене (и workers.dev для проверки)
    const salesish = SALES_HOSTS.has(url.hostname) || url.hostname.endsWith('.workers.dev');
    if (/^\/demo\/[a-z0-9-]{1,64}\/?$/i.test(p) && salesish && (method === 'GET' || method === 'HEAD')) {
      return await serveDemoPage(request, env);
    }

    // Лендинг tut.menu живёт только на своём домене: на сайтах клиентов (tipagraf.kz и др.) папки /site нет
    if (/^\/site(\/|$)/.test(p) && !SALES_HOSTS.has(url.hostname) && !url.hostname.endsWith('.workers.dev')) {
      return new Response('Not found', { status: 404 });
    }

    // Продающий сайт tut.menu: tutmenu.kz отдаёт лендинг из папки /site (www → без www)
    if (SALES_HOSTS.has(url.hostname) && (method === 'GET' || method === 'HEAD')
        && !/^\/(api|files|media|admin|demo)(\/|$)/.test(p)) {
      if (url.hostname.startsWith('www.')) {
        url.hostname = url.hostname.slice(4);
        return Response.redirect(url.toString(), 301);
      }
      const target = new URL(url);
      target.pathname = '/site' + (p === '/' ? '/' : p);
      const r = await env.ASSETS.fetch(new Request(target.toString(), request));
      // Файлы меню (styles.css, app.js, themes.js…) для демо и конструктора лежат в корне
      if (r.status === 404 && p !== '/') return env.ASSETS.fetch(request);
      return r;
    }

    // Всё остальное — статичные файлы сайта (index.html, css, js, картинки-заглушки).
    // Саму страницу /admin отдаём БЕЗ кэша: это инструмент, которым пользуются
    // с разных устройств, и застрявшая в кэше телефона старая версия после
    // каждого обновления файла — больше не должна быть возможна в принципе.
    // Главная — с SEO-данными ресторана; robots.txt и sitemap.xml — под домен ресторана
    if (method === 'GET' || method === 'HEAD') {
      try {
        if (p === '/' || p === '/index.html') return await serveIndexWithSeo(request, env, url);
        if (p === '/robots.txt') return await serveRobots(env, url);
        if (p === '/sitemap.xml') return await serveSitemap(env, url);
      } catch (err) { /* при любой ошибке отдаём обычную страницу ниже */ }
    }

    // Видео из файлов сайта: iPhone требует ответы на Range-запросы (206), а статика их не отдаёт
    if (p.startsWith('/media/') && /\.(mp4|mov|webm)$/i.test(p) && (method === 'GET' || method === 'HEAD')) {
      return await serveMediaWithRange(request, env, url);
    }

    const res = await env.ASSETS.fetch(request);
    if (p === '/admin' || p === '/admin/' || p === '/admin/index.html') {
      const noCache = new Response(res.body, res);
      noCache.headers.set('cache-control', 'no-store');
      return noCache;
    }
    return res;
  }
};
