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
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
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
           'description_ru', 'description_kk', 'description_en', 'price', 'variants', 'recommendations', 'badge_ids']
  },
  'promos': {
    table: 'promos',
    cols: ['sort', 'active', 'image', 'title_ru', 'title_kk', 'title_en',
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
    logoWelcome: restaurant.logo_welcome, logoHeader: restaurant.logo_header,
    bgImage: restaurant.bg_image, bgVideo: restaurant.bg_video,
    notice_ru: restaurant.notice_ru || '', notice_kk: restaurant.notice_kk || '', notice_en: restaurant.notice_en || '',
    hoursFrom: restaurant.hours_from || '', hoursTo: restaurant.hours_to || ''
  };

  const payload = {
    settings,
    buttons: buttons.results.map((r) => ({
      id: String(r.id), type: r.type, style: r.style,
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en, url: r.url
    })),
    promos: promos.results.map((r) => ({
      id: String(r.id), image: r.image,
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en,
      description_ru: r.description_ru, description_kk: r.description_kk, description_en: r.description_en,
      itemId: r.item_id ? String(r.item_id) : ''
    })),
    categories: categories.results.map((r) => ({
      id: String(r.id), image: r.image,
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en
    })),
    sections: sections.results.map((r) => ({
      id: String(r.id), categoryId: r.category_id ? String(r.category_id) : '',
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en,
      subtitle_ru: r.subtitle_ru, subtitle_kk: r.subtitle_kk, subtitle_en: r.subtitle_en
    })),
    menuItems: items.results.map((r) => ({
      id: String(r.id), sectionId: r.section_id ? String(r.section_id) : '', image: r.image,
      title_ru: r.title_ru, title_kk: r.title_kk, title_en: r.title_en,
      description_ru: r.description_ru, description_kk: r.description_kk, description_en: r.description_en,
      price: r.price || 0,
      variants: safeVariants(r.variants),
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
async function handleOrders(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const slug = normId(body.restaurantId);
  if (!slug) return json({ ok: false, error: 'no_restaurant' }, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO orders (restaurant_id, text, total, lang, status) VALUES (?, ?, ?, ?, 'new')`
  ).bind(slug, String(body.text || '').slice(0, 5000), Number(body.total) || 0, String(body.lang || '')).run();

  return json({ ok: true });
}

/* ---------- POST /api/track — публично, своя аналитика без Яндекс.Метрики ----------
   Тело: { restaurantId, sessionId, type, path?, refId?, refTitle?, value? }
   type: hit | add_to_cart | view_promo | view_category | order_placed | session_end */
const EVENT_TYPES = new Set(['hit', 'add_to_cart', 'view_promo', 'view_category', 'order_placed', 'session_end']);

async function handleTrack(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false }, { status: 400 }); } // тихо — гостю ошибка аналитики не важна

  const slug = normId(body.restaurantId);
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

    const [sessions, hits, addToCart, categories, orders, duration] = await Promise.all([
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
                    'notice_ru', 'notice_kk', 'notice_en', 'hours_from', 'hours_to']
        .filter((c) => c in b);
      // Домен чистим тем же способом, что и при поиске по hostname (без https://, www., слэша) —
      // иначе вписанный "с запасом" адрес не совпадёт с реальным при заходе на сайт
      if (cols.includes('domain')) b.domain = normId(b.domain.replace(/^https?:\/\//i, '')) || null;
      if (cols.length) {
        const set = cols.map((c) => `${c} = ?`).join(', ');
        await env.DB.prepare(`UPDATE restaurants SET ${set} WHERE slug = ?`).bind(...cols.map((c) => toSql(b[c])), qSlug).run();
      }
      // Назначить/сменить редактора может только владелец, даже если остальные поля правит сам ресторан
      if (me.role === 'owner' && typeof b.editorEmail === 'string' && b.editorEmail.trim()) {
        await env.DB.prepare('INSERT OR REPLACE INTO admin_users (email, restaurant_id, role) VALUES (?, ?, ?)')
          .bind(b.editorEmail.trim().toLowerCase(), qSlug, 'editor').run();
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

  return json({ ok: true, url: `${url.origin}/files/${key}` });
}

/* ---------- GET /files/<slug>/<файл> — публично ---------- */
async function handleFiles(env, segments) {
  const key = segments.join('/');
  if (!key) return new Response('Not found', { status: 404 });
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
}

/* ---------- Маршрутизация ---------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;

    try {
      if (p === '/api/menu' && method === 'GET') return await handleMenu(request, env);
      if (p === '/api/orders' && method === 'POST') return await handleOrders(request, env);
      if (p === '/api/track' && method === 'POST') return await handleTrack(request, env);
      if (p === '/admin/api/upload' && method === 'POST') return await handleUpload(request, env);
      if (p.startsWith('/admin/api/')) {
        const segments = p.slice('/admin/api/'.length).split('/').filter(Boolean);
        return await handleAdminApi(request, env, segments);
      }
      if (p.startsWith('/files/')) {
        const segments = p.slice('/files/'.length).split('/').filter(Boolean);
        return await handleFiles(env, segments);
      }
    } catch (err) {
      return json({ error: 'server_error', message: String(err) }, { status: 500 });
    }

    // Всё остальное — статичные файлы сайта (index.html, css, js, картинки-заглушки)
    return env.ASSETS.fetch(request);
  }
};
