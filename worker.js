/* =========================================================
   ОБЩИЕ ХЕЛПЕРЫ
   ========================================================= */

/** JSON.parse без страховки — одно повреждённое блюдо уронит выдачу всего меню разом.
 *  При ошибке блюдо просто остаётся без вариаций, а не валит весь запрос. */
function safeVariants(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

/** Простой ограничитель запросов с одного IP (счётчик в кэше ближайшего сервера Cloudflare).
 *  Не идеально точный, но не даёт одному человеку завалить базу заказами/событиями
 *  или сжечь дневной лимит ИИ-поиска за минуту. */
async function tooMany(request, name, limit, windowSec, keyOverride) {
  try {
    const ip = keyOverride || request.headers.get('CF-Connecting-IP') || 'x';
    const slot = Math.floor(Date.now() / 1000 / windowSec);
    const key = new Request(`https://rl.local/${name}/${encodeURIComponent(ip)}/${slot}`);
    const cache = caches.default;
    const hit = await cache.match(key);
    const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= limit) return true;
    await cache.put(key, new Response(String(n + 1), { headers: { 'cache-control': `max-age=${windowSec}` } }));
  } catch { /* ограничитель не должен ломать сайт */ }
  return false;
}
const slowDown = () => json({ error: 'rate_limited', message: 'Слишком много запросов, попробуйте через пару минут' }, { status: 429 });

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
/* Проверяем подпись входа Cloudflare Access (JWT), а не только заголовок с почтой.
   Заголовку можно верить лишь там, где Access точно включён; подпись же подделать нельзя —
   так админка защищена и на новом домене (tutmenu.kz), и на служебных адресах, даже если
   на них забыли настроить Access. */
const ACCESS_TEAM = 'https://tutmenu.cloudflareaccess.com';
const ACCESS_AUD = '3f40c8676c65b8559c6139766333d5206b321b1a9076340216d362aa2d87ea25';
let accessKeys = null, accessKeysAt = 0;
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function accessCerts(force) {
  if (!force && accessKeys && Date.now() - accessKeysAt < 3600e3) return accessKeys;
  const r = await fetch(`${ACCESS_TEAM}/cdn-cgi/access/certs`);
  const j = await r.json();
  accessKeys = j.keys || []; accessKeysAt = Date.now();
  return accessKeys;
}
export async function verifyAccessJwt(token, now = Date.now(), getKeys = accessCerts) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return '';
  let head, pay;
  try { head = JSON.parse(new TextDecoder().decode(b64url(parts[0]))); pay = JSON.parse(new TextDecoder().decode(b64url(parts[1]))); } catch { return ''; }
  if (head.alg !== 'RS256') return '';
  let keys = await getKeys(false);
  let jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk) { keys = await getKeys(true); jwk = keys.find((k) => k.kid === head.kid); }
  if (!jwk) return '';
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return '';
  const aud = Array.isArray(pay.aud) ? pay.aud : [pay.aud];
  if (!aud.includes(ACCESS_AUD) || pay.iss !== ACCESS_TEAM) return '';
  if (!pay.exp || pay.exp * 1000 < now) return '';
  return String(pay.email || '').trim().toLowerCase();
}
async function accessEmail(request) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  if (!jwt) return '';
  try { return await verifyAccessJwt(jwt); } catch { return ''; }
}

/**
 * Проверка доступа к конкретному ресторану.
 * owner  — видит и правит любого клиента.
 * editor — только свой restaurant_id (slug).
 */
export async function authorize(env, request, slug) {
  // Запрос из кабинета владельца (/cabinet/api): права только на свои заведения, никогда не owner
  const cab = CAB.get(request);
  if (cab) return cab.slugs.includes(slug) ? { ok: true, email: cab.email, role: 'editor', cabinet: true } : { ok: false, status: 403, error: 'wrong_restaurant' };
  const email = await accessEmail(request);
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
    serviceFee: Math.max(0, Math.min(50, Number(restaurant.service_fee) || 0)),
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

  // Оплата просрочена: в отсрочке гостям — небольшая плашка, после — «меню временно недоступно»
  const bill = billingState(restaurant);
  if (bill && bill.state === 'grace') settings.billing = { state: 'grace', slug, offAt: bill.offAt, offIn: bill.offIn };
  if (bill && bill.state === 'off') settings.demo = { slug, trial: true, billing: true, expiresAt: bill.due, expired: true, restaurant: restaurant.name };

  // Пробный период: плашка с остатком дней (видит только создатель), после — «меню недоступно».
  // Пока своих блюд нет, гостям показываем пример меню в дизайне заведения.
  if (restaurant.plan === 'trial') {
    const until = restaurant.trial_until || '';
    settings.demo = { slug, trial: true, expiresAt: until, expired: !!until && Date.parse(until) <= Date.now(), restaurant: restaurant.name };
    // Пример — только пока своих блюд нет совсем (выключенные кухней блюда тоже свои)
    const own = payload.menuItems.length || (await env.DB.prepare('SELECT 1 FROM menu_items WHERE restaurant_id = ?1 LIMIT 1').bind(slug).first());
    if (!own) {
      const tpl = await demoTemplate(env, request);
      const ts = tpl.settings || {};
      for (const k of ['tagline_ru', 'tagline_kk', 'tagline_en', 'bgImage', 'bgVideo', 'hoursFrom', 'hoursTo']) if (!settings[k]) settings[k] = ts[k] || '';
      const bl = (settings.design && settings.design.blocks) || {};
      if (!settings.lunch && bl.lunch !== false) settings.lunch = ts.lunch || null;
      payload.categories = tpl.categories || []; payload.sections = tpl.sections || []; payload.menuItems = tpl.menuItems || [];
      if (!payload.promos.length && bl.promos !== false) payload.promos = tpl.promos || [];
      if (!payload.buttons.length) payload.buttons = tpl.buttons || [];
      settings.example = true;
    }
  }

  // Фото и видео — с отдельного адреса хранилища (если настроен): такие запросы не идут через наш сервер
  // и не тратят лимит запросов Workers. Ссылки в базе не меняем — только в ответе.
  const cdn = await filesOrigin(env);
  if (cdn) {
    const own = [url.hostname, restaurant.domain].filter(Boolean).map((h) => h.replace(/[.]/g, '\\.')).join('|');
    const re = new RegExp(`"(?:https?://(?:[a-z0-9.-]+\\.workers\\.dev${own ? '|' + own : ''}))?/files/`, 'gi');
    return new Response(JSON.stringify(payload).replace(re, `"${cdn}/`), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=20' } });
  }
  return json(payload, { headers: { 'cache-control': 'public, max-age=20' } });
}

/** Адрес хранилища фото (R2 со своим поддоменом), например https://cdn.tutmenu.kz. Пусто — отдаём через /files/. */
let filesOriginCache = null, filesOriginAt = 0;
async function filesOrigin(env) {
  if (filesOriginCache !== null && Date.now() - filesOriginAt < 300e3) return filesOriginCache;
  const v = String(env.FILES_ORIGIN || await cfg(env, 'files_origin') || '').trim().replace(/\/+$/, '');
  filesOriginCache = /^https:\/\/[a-z0-9.-]+$/i.test(v) ? v : ''; filesOriginAt = Date.now();
  return filesOriginCache;
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
const AI_DAILY_CAP = 300; // вызовов ИИ на одно заведение в сутки (у Типа Граф сейчас ~3–10)
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

  // Компактное меню: раздел один раз заголовком, строки «id|блюдо|цена|описание до 70 знаков».
  // Так запрос к ИИ примерно вдвое короче — и вдвое дешевле.
  let lastSec = null;
  const menuText = rows.map((r) => {
    const d = String(r.description_ru || '').replace(/\s+/g, ' ').trim();
    const head = r.sec !== lastSec ? `## ${r.sec}\n` : ''; lastSec = r.sec;
    return `${head}${r.id}|${r.title_ru}|${Math.round(r.price || 0)}|${d.length > 70 ? d.slice(0, 68) + '…' : d}`;
  }).join('\n');

  const cache = caches.default;
  const AI_PROMPT_VERSION = 'v3'; // поменяли инструкции — старые ответы из кэша не берём
  const cacheKey = new Request(`https://ai-search.cache/${AI_PROMPT_VERSION}/${slug}/${lang}/${await sha256(menuText + '\n#' + q.toLowerCase())}`);
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-ai-cache': 'hit' } });
  // Потолок на заведение в сутки — чтобы один бот или шутник не сжёг бюджет ИИ всей сети
  if (await tooMany(request, 'ai-day', AI_DAILY_CAP, 86400, slug)) return json({ error: 'ai_limit' }, { status: 429 });

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

MENU (grouped by \"## section\"; each line: id|dish|price in tenge|description):
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
    const email = await accessEmail(request);
    if (!email) return json({ error: 'no_access_email' }, { status: 401 });
    const me = await env.DB.prepare('SELECT restaurant_id, role FROM admin_users WHERE email = ?').bind(email).first();
    if (!me) return json({ error: 'not_registered', email });
    const restaurants = me.role === 'owner'
      ? (await env.DB.prepare('SELECT slug, name, active, domain, plan FROM restaurants ORDER BY (domain IS NULL), name').all()).results
      : (await env.DB.prepare('SELECT slug, name, active FROM restaurants WHERE slug = ?').bind(me.restaurant_id).all()).results;
    return json({ email, role: me.role, restaurants });
  }

  if (section === 'restaurants') {
    const cab = CAB.get(request);
    const me = cab ? { role: 'editor', restaurant_id: null }
      : await env.DB.prepare('SELECT restaurant_id, role FROM admin_users WHERE email = ?').bind(await accessEmail(request)).first();
    if (!me) return json({ error: 'not_registered' }, { status: 403 });

    const qSlug = normId(url.searchParams.get('restaurant'));
    const mine = (sl) => me.role === 'owner' || (cab ? cab.slugs.includes(sl) : me.restaurant_id === sl);

    if (method === 'GET') {
      if (qSlug) {
        // Один ресторан — владелец или его собственный редактор
        if (!mine(qSlug)) return json({ error: 'forbidden' }, { status: 403 });
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
      if (!mine(qSlug)) return json({ error: 'forbidden' }, { status: 403 });
      const b = await request.json();
      // Из кабинета нельзя менять домен и включение — это делает только владелец сервиса
      if (cab) { delete b.domain; delete b.active; delete b.editorEmails; }
      const cols = ['domain', 'active', 'name', 'tagline_ru', 'tagline_kk', 'tagline_en',
                    'whatsapp', 'theme', 'accent_color', 'logo_welcome', 'logo_header', 'bg_image', 'bg_video',
                    'notice_ru', 'notice_kk', 'notice_en', 'hours_from', 'hours_to', 'item_layout', 'lang_style', 'lang_color', 'lunch', 'order_mode', 'promo_style', 'service_fee']
        .filter((c) => c in b);
      if (cols.includes('service_fee')) b.service_fee = Math.max(0, Math.min(50, Math.round(Number(String(b.service_fee).replace(',', '.')) || 0)));
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
  const canonical = rest.domain ? `${origin}/` : `${origin}/${encodeURIComponent(rest.slug)}`;
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

/** Дизайн и блоки из конструктора: только известные ключи и короткие значения */
function cleanDesign(body) {
  const d = body.design || {};
  const design = {};
  for (const k of ['theme', 'style', 'palette', 'fonts', 'welcomeBg', 'welcomeStyle']) if (typeof d[k] === 'string' && /^[a-z]{2,12}$/.test(d[k])) design[k] = d[k];
  if (typeof d.accent === 'string' && /^#[0-9a-f]{6}$/i.test(d.accent)) design.accent = d.accent;
  if (['logo', 'logoname', 'name'].includes(d.brand)) design.brand = d.brand;
  if (d.welcome === false) design.welcome = false;
  const b = body.blocks || {};
  const blocks = { promos: b.promos !== false, lunch: b.lunch !== false, stories: b.stories === true };
  return { design, blocks };
}
async function saveDemoLogo(env, slug, dataUrl, prefix) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[2].length >= 2_000_000) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  // Пробное заведение хранит файлы в своей папке (как оплаченное): после оплаты ничего не переносим
  const key = `${prefix || `demos/${slug}/`}logo-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: `image/${m[1]}` } });
  return `/files/${key}`;
}

/** Изменение своего демо из конструктора: по ключу, который выдан создателю */
async function handleDemoUpdate(request, env, slug) {
  const row = await env.DB.prepare('SELECT edit_key, expires_at, logo, converted_to FROM demos WHERE slug = ?1').bind(slug).first();
  if (!row) return json({ error: 'not_found' }, { status: 404 });
  const key = request.headers.get('x-edit-key') || '';
  if (!row.edit_key || key !== row.edit_key) return json({ error: 'forbidden' }, { status: 403 });
  if (Date.parse(row.expires_at) <= Date.now()) return json({ error: 'expired', message: 'Демо истекло' }, { status: 410 });
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_json' }, { status: 400 }); }
  const { design, blocks } = cleanDesign(body);
  const name = String((body.info || {}).name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  let logo = row.logo || '';
  const conv = row.converted_to || '';
  if (body.logo === '') logo = '';
  else if (String(body.logo || '').startsWith('data:')) logo = (await saveDemoLogo(env, slug, body.logo, conv ? `${conv}/` : '')) || logo;
  await env.DB.prepare('UPDATE demos SET design = ?2, blocks = ?3, logo = ?4, restaurant_name = COALESCE(NULLIF(?5, \'\'), restaurant_name) WHERE slug = ?1')
    .bind(slug, JSON.stringify(design), JSON.stringify(blocks), logo, name).run();
  if (conv) {
    await env.DB.prepare("UPDATE restaurants SET design = ?2, logo_welcome = ?3, logo_header = ?3, name = COALESCE(NULLIF(?4, ''), name) WHERE slug = ?1 AND plan = 'trial'")
      .bind(conv, JSON.stringify(Object.assign({}, design, { blocks })), logo, name).run();
    return json({ ok: true, url: `/${conv}` });
  }
  return json({ ok: true, url: `/demo/${slug}` });
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

  const { design, blocks } = cleanDesign(body);

  // Демо — это сразу настоящее заведение на пробном периоде: адрес tutmenu.kz/<название>,
  // свой кабинет, а после оплаты меню просто остаётся (ничего не переносим)
  const slug = await uniqueSlug(env, name);
  const logo = (await saveDemoLogo(env, slug, body.logo, `${slug}/`)) || '';
  const editKey = randHex(16);
  const now = new Date();
  const until = new Date(now.getTime() + TRIAL_MS).toISOString();
  const wa = phone.replace(/\D/g, '').replace(/^8/, '7');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO restaurants (slug, active, name, whatsapp, theme, logo_welcome, logo_header, design, plan, trial_until)
      VALUES (?1, 1, ?2, ?3, 'modern', ?4, ?4, ?5, 'trial', ?6)`)
      .bind(slug, name, wa, logo, JSON.stringify(Object.assign({}, design, { blocks })), until),
    env.DB.prepare(`INSERT INTO demos (slug, owner_name, restaurant_name, phone, city, kind, logo, design, blocks, ip, created_at, expires_at, views, status, edit_key, converted_to)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 'new', ?13, ?1)`)
      .bind(slug, owner, name, phone, city, kind, logo, JSON.stringify(design), JSON.stringify(blocks), ip,
        now.toISOString(), until, editKey)
  ]);
  const email = normEmail(info.email);
  const mr = await env.DB.prepare('INSERT INTO cabinet_members (slug, role, name, email, phone, created_at) VALUES (?1, \'owner\', ?2, ?3, ?4, ?5)')
    .bind(slug, owner, EMAIL_RE.test(email) ? email : '', normPhone(phone), now.toISOString()).run();
  const token = await cabNewSession(env, { memberId: mr.meta.last_row_id });
  const origin = new URL(request.url).origin;
  const T = (k) => k ? k : '—';
  ctx.waitUntil(tgNotify(env, [
    '🆕 Новое демо tut.menu',
    `${name}${kind ? ' · ' + (KIND_NAMES[kind] || kind) : ''}${city ? ', ' + city : ''}`,
    `${owner} · ${phone}`,
    `Дизайн: ${T(design.theme)} / ${T(design.style)} / ${T(design.palette)} / ${T(design.fonts)}`,
    `${origin}/${slug}`,
    `WhatsApp: https://wa.me/${wa}`
  ].join('\n')));
  return json({ ok: true, slug, url: `/${slug}`, cabinet: '/cabinet', editKey }, { headers: { 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
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
  const email = await accessEmail(request);
  if (!email) return { ok: false, status: 401, error: 'no_access_email' };
  const row = await env.DB.prepare('SELECT role FROM admin_users WHERE email = ?').bind(email).first();
  if (!row || row.role !== 'owner') return { ok: false, status: 403, error: 'owner_only' };
  return { ok: true, email };
}
/* ---------- Оплата платящих заведений ----------
   paid_until — дата следующей оплаты (ставит владелец сервиса в «Платформе»).
   После неё 5 дней отсрочки: владельцу — плашка в кабинете и письмо каждый день, гостям —
   небольшая плашка без слов об оплате. Потом меню отключается до оплаты. Пусто — без срока. */
const GRACE_DAYS = 5;
function billingState(r, now = Date.now()) {
  if (!r || r.plan !== 'paid' || !r.paid_until) return null;
  const due = Date.parse(r.paid_until);
  if (!due) return null;
  const day = 864e5;
  const offAt = due + GRACE_DAYS * day;
  if (now < due) return { state: 'ok', daysLeft: Math.ceil((due - now) / day), due: r.paid_until };
  if (now < offAt) return { state: 'grace', overdue: Math.max(1, Math.ceil((now - due) / day)), offIn: Math.ceil((offAt - now) / day), offAt: new Date(offAt).toISOString(), due: r.paid_until };
  return { state: 'off', overdue: Math.ceil((now - due) / day), due: r.paid_until };
}
const fmtDateRu = (iso) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`; };

/** Пульт платформы для владельца сервиса: все заведения с цифрами за 7 дней и сводка */
async function handlePlatformApi(request, env) {
  const own = await ownerOnly(env, request);
  if (!own.ok) return json({ error: own.error }, { status: own.status });
  const since = new Date(Date.now() - 7 * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const sinceIso = new Date(Date.now() - 7 * 864e5).toISOString();
  const [rs, leads7, leadsAll] = await Promise.all([
    env.DB.prepare(`SELECT r.slug, r.name, r.domain, r.active, r.plan, r.trial_until, r.paid_until, r.created_at, r.logo_header,
        (SELECT COUNT(*) FROM menu_items m WHERE m.restaurant_id = r.slug) items,
        (SELECT COUNT(DISTINCT e.session_id) FROM events e WHERE e.restaurant_id = r.slug AND e.created_at >= ?1) guests7,
        (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.slug AND o.created_at >= ?1) orders7,
        (SELECT COUNT(*) FROM cabinet_members c WHERE c.slug = r.slug AND c.removed_at IS NULL) team,
        (SELECT d.slug FROM demos d WHERE d.converted_to = r.slug LIMIT 1) lead_slug,
        (SELECT d.phone FROM demos d WHERE d.converted_to = r.slug LIMIT 1) phone
      FROM restaurants r ORDER BY r.created_at DESC`).bind(since).all(),
    env.DB.prepare('SELECT COUNT(*) n FROM demos WHERE created_at >= ?1').bind(sinceIso).first(),
    env.DB.prepare('SELECT COUNT(*) n FROM demos').first()
  ]);
  return json({ restaurants: rs.results.map((r) => ({ ...r, billing: billingState(r) })), leads7: leads7.n, leadsAll: leadsAll.n, graceDays: GRACE_DAYS });
}
/** POST /admin/api/platform/<slug>/paid-until {date: 'YYYY-MM-DD' | ''} — дата следующей оплаты */
async function handlePlatformPaidUntil(request, env, slug) {
  const own = await ownerOnly(env, request);
  if (!own.ok) return json({ error: own.error }, { status: own.status });
  const b = await request.json().catch(() => ({}));
  const date = String(b.date || '');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad_date', message: 'Неверная дата' }, { status: 400 });
  // Срок — конец выбранного дня по Уральску (UTC+5)
  const iso = date ? new Date(Date.parse(date + 'T23:59:59+05:00')).toISOString() : '';
  const r = await env.DB.prepare("UPDATE restaurants SET paid_until = ?2 WHERE slug = ?1 AND plan = 'paid'").bind(slug, iso).run();
  if (!r.meta.changes) return json({ error: 'not_paid', message: 'Дату оплаты можно поставить только платящему заведению' }, { status: 400 });
  return json({ ok: true, paid_until: iso });
}

async function handleLeadsApi(request, env, slug, action) {
  const auth = await ownerOnly(env, request);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
  const method = request.method;
  if (!slug && method === 'GET') {
    const r = await env.DB.prepare(`SELECT d.slug, d.owner_name, d.restaurant_name, d.phone, d.city, d.kind, d.design, d.created_at, d.expires_at, d.views, d.last_view_at, d.status, d.note, d.deleted_at,
        d.converted_to, r.plan, r.trial_until, (SELECT COUNT(*) FROM menu_items m WHERE m.restaurant_id = d.converted_to) items,
        (SELECT GROUP_CONCAT(CASE WHEN c.email <> '' THEN c.email WHEN c.tg_id <> '' THEN c.name || ' (Telegram)' ELSE c.name END, ', ') FROM cabinet_members c WHERE c.slug = d.converted_to AND c.removed_at IS NULL) emails
      FROM demos d LEFT JOIN restaurants r ON r.slug = d.converted_to ORDER BY d.created_at DESC LIMIT 500`).all();
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
    // «Восстановим за минуту»: демо снова живёт 3 дня, пробное заведение — ещё 7 дней
    const d = await env.DB.prepare('SELECT converted_to FROM demos WHERE slug = ?1').bind(slug).first();
    const until = new Date(Date.now() + (d && d.converted_to ? TRIAL_MS : DEMO_TTL_MS)).toISOString();
    await env.DB.prepare('UPDATE demos SET expires_at = ?2, deleted_at = NULL WHERE slug = ?1').bind(slug, until).run();
    if (d && d.converted_to) await env.DB.prepare("UPDATE restaurants SET trial_until = ?2 WHERE slug = ?1 AND plan = 'trial'").bind(d.converted_to, until).run();
    return json({ ok: true });
  }
  if (slug && method === 'POST' && action === 'activate') {
    // Оплатили: меню остаётся навсегда, плашка пробного периода исчезает
    const d = await env.DB.prepare('SELECT converted_to FROM demos WHERE slug = ?1').bind(slug).first();
    if (!d || !d.converted_to) return json({ error: 'not_trial', message: 'Это старое демо без своего меню' }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare("UPDATE restaurants SET plan = 'paid', trial_until = '', paid_until = ?2 WHERE slug = ?1").bind(d.converted_to, new Date(Date.now() + 365 * 864e5).toISOString()),
      env.DB.prepare("UPDATE demos SET status = 'paid' WHERE slug = ?1").bind(slug)
    ]);
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, { status: 404 });
}

/** Раз в час: у истёкших демо удаляем файлы (логотип) в R2. Запись остаётся — это лид в админке;
 *  по старой ссылке открывается «Демо истекло». */
/** Утренний отчёт: сколько гостей было вчера и насколько мы близки к бесплатным лимитам Cloudflare.
 *  Точные числа запросов видит только панель Cloudflare; здесь — оценка по нашей статистике
 *  (замер: один гость ≈ 80 запросов через сервер, если фото идут через /files, и ≈ 8 — если через CDN). */
/** Каждый день в 9:17 по Уральску: письма владельцам за 7/3/1 день до оплаты и каждый день отсрочки,
 *  и сводка владельцу сервиса в Telegram */
async function billingReminders(env) {
  const rs = (await env.DB.prepare("SELECT slug, name, domain, plan, paid_until FROM restaurants WHERE plan = 'paid' AND paid_until <> ''").all()).results;
  const lines = [];
  for (const r of rs) {
    const b = billingState(r);
    if (!b) continue;
    const url = r.domain ? `https://${r.domain}` : `https://tutmenu.kz/${r.slug}`;
    let subject = '', text = '';
    if (b.state === 'ok' && [7, 3, 1].includes(b.daysLeft)) {
      subject = `tut.menu: оплата меню «${r.name}» через ${b.daysLeft} дн.`;
      text = `Здравствуйте!\n\nНапоминаем: оплата электронного меню «${r.name}» (${url}) — до ${fmtDateRu(b.due)}.\nЧтобы оплатить, напишите нам в WhatsApp: https://wa.me/77064150958\n\nКоманда tut.menu`;
      lines.push(`⏰ ${r.name}: оплата через ${b.daysLeft} дн. (${fmtDateRu(b.due)})`);
    } else if (b.state === 'grace') {
      subject = `tut.menu: оплата меню «${r.name}» просрочена`;
      text = `Здравствуйте!\n\nСрок оплаты электронного меню «${r.name}» (${url}) истёк ${fmtDateRu(b.due)}.\nМеню продолжит работать ещё ${b.offIn} дн. — до ${fmtDateRu(b.offAt)}, после этого гости его не увидят.\nОплатить: https://wa.me/77064150958\n\nВсё, что вы настроили, сохранится. Команда tut.menu`;
      lines.push(`⚠️ ${r.name}: просрочено ${b.overdue} дн., отключится через ${b.offIn} дн.`);
    } else if (b.state === 'off' && b.overdue === GRACE_DAYS + 1) {
      lines.push(`⛔ ${r.name}: меню отключено за неуплату`);
    }
    if (!subject) continue;
    const emails = (await env.DB.prepare("SELECT DISTINCT email FROM cabinet_members WHERE slug = ?1 AND removed_at IS NULL AND email <> '' AND role IN ('owner', 'senior')").bind(r.slug).all()).results.map((x) => x.email);
    for (const e of emails) await sendMail(env, e, subject, text);
  }
  if (lines.length) await tgNotify(env, ['💳 Оплаты tut.menu', ...lines].join('\n'));
}

async function usageReport(env) {
  try {
    const rows = (await env.DB.prepare(
      `SELECT restaurant_id r, COUNT(DISTINCT session_id) s, SUM(type = 'ai_search') ai
         FROM events WHERE created_at >= datetime('now', '-1 day') GROUP BY restaurant_id ORDER BY s DESC`
    ).all()).results || [];
    const sessions = rows.reduce((a, r) => a + r.s, 0), ai = rows.reduce((a, r) => a + (r.ai || 0), 0);
    const perGuest = (await filesOrigin(env)) ? 8 : 80;
    const req = sessions * perGuest, reqPct = Math.round(req / 1000);            // от 100 тыс./сутки
    const aiPct = Math.round(ai * 100 / 100);                                     // ≈100 вызовов/сутки бесплатно
    const warn = reqPct >= 60 || aiPct >= 60;
    const top = rows.slice(0, 5).map((r) => `• ${r.r}: ${r.s} гостей${r.ai ? `, ИИ ${r.ai}` : ''}`).join('\n');
    if (!warn && new Date().getUTCDay() !== 1) return;                            // без проблем — только по понедельникам
    await tgNotify(env, `${warn ? '⚠️ Пора на платный план Cloudflare ($5/мес)\n\n' : '📊 Еженедельный расход\n\n'}` +
      `За сутки: ${sessions} гостей в ${rows.length} заведениях\n` +
      `Запросы: ~${req.toLocaleString('ru-RU')} из 100 000 бесплатных (${reqPct}%)\n` +
      `ИИ-поиск: ${ai} вызовов, ~${aiPct}% бесплатного лимита\n\n${top}`);
  } catch { /* отчёт не должен ломать крон */ }
}

async function cleanupDemos(env) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare("SELECT slug, logo FROM demos WHERE expires_at <= ?1 AND deleted_at IS NULL AND COALESCE(converted_to, '') = '' LIMIT 200").bind(now).all();
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
  // Файлы приложения грузим от корня (/styles.css, /app.js). <base href="/"> не используем:
  // с ним ссылки вида href="#/menu" уводили бы со страницы демо на главную.
  const html = (await res.text())
    .replace(/(\s(?:src|href)=")(?![a-z]+:|\/|#)([^"]+)"/gi, '$1/$2"')
    .replace('<head>', '<head><meta name="robots" content="noindex">');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}


/* =========================================================
   КАБИНЕТ ВЛАДЕЛЬЦА ЗАВЕДЕНИЯ (/cabinet)
   Та же админка, но вход не через Cloudflare Access (там 50 бесплатных мест), а свой.
   У заведения есть команда (cabinet_members): владелец, менеджеры, «стоп-лист» (кухня/бар).
   Сессия (cookie tm_cab) указывает на сотрудника и/или его email и Telegram — из них
   собираются все заведения и роли человека. Способы входа:
   • сразу после демо — сессия на этом телефоне;
   • QR-код на компьютере, подтверждение с телефона (как WhatsApp Web);
   • «Войти через Telegram» (OpenID, без переписки с ботом), с сопоставлением по номеру;
   • код на email (письма через Resend, секрет RESEND_KEY);
   • ссылка-приглашение от владельца (одноразовая, 24 часа).
   ========================================================= */
const TRIAL_MS = 7 * 24 * 3600 * 1000;
const CAB_COOKIE = 'tm_cab';
const CAB_TTL_MS = 90 * 24 * 3600 * 1000;
const CAB = new WeakMap();
const RESERVED_SLUGS = new Set(['admin', 'api', 'cabinet', 'demo', 'files', 'media', 'ar', 'site', 'build', 'img', 'themes', 'welcomes',
  'login', 'logout', 'www', 'menu', 'help', 'price', 'about', 'terms', 'privacy', 'tutmenu', 'tut-menu', 'kabinet', 'blog', 'support']);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
// senior — старший менеджер: всё как у владельца, кроме назначения владельцев и действий с ними
const ROLES = ['owner', 'senior', 'manager', 'stop'];
const ROLE_RANK = { owner: 4, senior: 3, manager: 2, stop: 1 };
const CAN_TEAM = new Set(['owner', 'senior']);

function randHex(bytes) { return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function sha256hex(str) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? m[1] : '';
}
function cabCookie(token, maxAgeSec) { return `${CAB_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(maxAgeSec)}; HttpOnly; Secure; SameSite=Lax`; }
const normEmail = (v) => String(v || '').trim().toLowerCase().slice(0, 254);
const normPhone = (v) => String(v || '').replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7').slice(0, 15);
const nowIso = () => new Date().toISOString();

/** Адрес заведения: «Кофейня Арман» → kofeynya-arman (если занят — kofeynya-arman-2) */
async function uniqueSlug(env, name) {
  let base = String(name || '').toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36).replace(/-+$/, '');
  if (base.length < 2 || RESERVED_SLUGS.has(base)) base = (base ? base + '-' : '') + 'menu';
  for (let i = 1; i < 60; i++) {
    const cand = i === 1 ? base : `${base}-${i}`;
    const taken = await env.DB.prepare('SELECT 1 FROM restaurants WHERE slug = ?1 UNION SELECT 1 FROM demos WHERE slug = ?1').bind(cand).first();
    if (!taken) return cand;
  }
  return `${base}-${randHex(2)}`;
}

/* ---------- сессии ---------- */
async function cabNewSession(env, { email = '', slug = '', memberId = 0, tgId = '' }) {
  const token = randHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO cabinet_sessions (token_hash, email, slug, member_id, tg_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(await sha256hex(token), email, slug, memberId || 0, tgId, new Date(now).toISOString(), new Date(now + CAB_TTL_MS).toISOString()).run();
  return token;
}
/** Все записи сотрудника, которые принадлежат этой сессии: по id, email или Telegram */
async function cabMembers(env, row) {
  const r = await env.DB.prepare(`SELECT * FROM cabinet_members WHERE removed_at IS NULL AND (
      id = ?1 OR (?2 <> '' AND email = ?2) OR (?3 <> '' AND tg_id = ?3))`).bind(row.member_id || -1, row.email || '', row.tg_id || '').all();
  return r.results;
}
async function cabSession(env, request) {
  const token = getCookie(request, CAB_COOKIE);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256hex(token);
  const row = await env.DB.prepare('SELECT * FROM cabinet_sessions WHERE token_hash = ?1').bind(hash).first();
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  const members = await cabMembers(env, row);
  const roles = {};
  for (const m of members) if (!roles[m.slug] || ROLE_RANK[m.role] > ROLE_RANK[roles[m.slug]]) roles[m.slug] = m.role;
  // Самые первые сессии (до команды) указывали только на заведение — это его владелец
  if (row.slug && !roles[row.slug] && !row.member_id) roles[row.slug] = 'owner';
  return { hash, row, email: row.email || '', tgId: row.tg_id || '', memberId: row.member_id || 0, members, roles, slugs: Object.keys(roles) };
}

/* ---------- почта ---------- */
async function mailCfg(env) {
  // Ключ чистим от пробелов и переносов строк, которые часто попадают при вставке
  const key = String(env.RESEND_KEY || await cfg(env, 'resend_key') || '').replace(/\s+/g, '');
  return key ? { key, from: String(env.MAIL_FROM || await cfg(env, 'mail_from') || 'tut.menu <hello@tutmenu.kz>').trim() } : null;
}
async function sendMail(env, to, subject, text) {
  const m = await mailCfg(env);
  if (!m) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${m.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: m.from, to: [to], subject, text })
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (r.ok) return true;
  // Причину отказа Resend сохраняем (без ключа), чтобы показать в кабинете и понять, что чинить
  const why = (await r.text().catch(() => '')).slice(0, 300);
  console.log('resend error', r.status, why);
  sendMail.lastError = `${r.status} ${(() => { try { return JSON.parse(why).message || why; } catch { return why; } })()}`.trim();
  return false;
}
async function cabSendCode(env, email) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  await env.DB.prepare('INSERT OR REPLACE INTO cabinet_codes (email, code_hash, expires_at, tries) VALUES (?1, ?2, ?3, 0)')
    .bind(email, await sha256hex(email + ':' + code), new Date(Date.now() + 10 * 60e3).toISOString()).run();
  return sendMail(env, email, `Код входа в tut.menu: ${code}`,
    `Ваш код для входа в кабинет tut.menu: ${code}\n\nКод действует 10 минут. Если вы его не запрашивали, просто удалите это письмо.`);
}
async function cabCheckCode(env, email, code) {
  const row = await env.DB.prepare('SELECT code_hash, expires_at, tries FROM cabinet_codes WHERE email = ?1').bind(email).first();
  if (!row || Date.parse(row.expires_at) <= Date.now() || row.tries >= 5) return false;
  const ok = row.code_hash === await sha256hex(email + ':' + String(code || '').replace(/\D/g, ''));
  await env.DB.prepare(ok ? 'DELETE FROM cabinet_codes WHERE email = ?1' : 'UPDATE cabinet_codes SET tries = tries + 1 WHERE email = ?1').bind(email).run();
  return ok;
}

/* ---------- Вход через Telegram (OpenID Connect, oauth.telegram.org) ----------
   Бот @tutmenu_bot — только «вывеска» входа: писать ему и нажимать «Старт» не нужно.
   Client ID = номер бота (начало токена), Client Secret — из @BotFather → Login Widget
   (секрет TG_CLIENT_SECRET в Cloudflare или tg_client_secret в app_config). */
async function tgLoginCfg(env) {
  const secret = env.TG_CLIENT_SECRET || await cfg(env, 'tg_client_secret');
  if (!secret) return null;
  const id = String(env.TG_CLIENT_ID || await cfg(env, 'tg_client_id') || String(env.TG_TOKEN || await cfg(env, 'tg_token') || '').split(':')[0]).trim();
  return /^\d{5,15}$/.test(id) ? { id, secret } : null;
}
let tgKeys = null, tgKeysAt = 0;
async function tgJwks(force) {
  if (!force && tgKeys && Date.now() - tgKeysAt < 3600e3) return tgKeys;
  const r = await fetch('https://oauth.telegram.org/.well-known/jwks.json');
  tgKeys = ((await r.json()) || {}).keys || []; tgKeysAt = Date.now();
  return tgKeys;
}
async function verifyTgIdToken(token, clientId) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  let head, pay;
  try { head = JSON.parse(new TextDecoder().decode(b64url(parts[0]))); pay = JSON.parse(new TextDecoder().decode(b64url(parts[1]))); } catch { return null; }
  if (head.alg !== 'RS256') return null;
  let jwk = (await tgJwks(false)).find((k) => k.kid === head.kid);
  if (!jwk) jwk = (await tgJwks(true)).find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok || pay.iss !== 'https://oauth.telegram.org') return null;
  const aud = Array.isArray(pay.aud) ? pay.aud.map(String) : [String(pay.aud)];
  if (!aud.includes(String(clientId)) || !pay.exp || pay.exp * 1000 < Date.now()) return null;
  return pay;
}
const b64urlStr = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function handleTgLogin(request, env, p) {
  const url = new URL(request.url);
  const back = (q) => Response.redirect(`${url.origin}/cabinet${q ? '?' + q : ''}`, 302);
  const tg = await tgLoginCfg(env);
  if (!tg) return back('tgerr=off');
  const redirectUri = `${url.origin}/cabinet/tg/callback`;
  if (p === '/cabinet/tg/start') {
    if (await tooMany(request, 'cab-tg', 20, 600)) return back('tgerr=limit');
    const mode = url.searchParams.get('mode') === 'link' ? 'link' : 'login';
    const s = mode === 'link' ? await cabSession(env, request) : null;
    if (mode === 'link' && !s) return back('tgerr=nosession');
    const state = randHex(16), verifier = randHex(32);
    const challenge = b64urlStr(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    await env.DB.prepare('INSERT INTO cabinet_oauth (state, verifier, mode, session_hash, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(state, verifier, mode, s ? s.hash : '', new Date(Date.now() + 10 * 60e3).toISOString()).run();
    const q = new URLSearchParams({ client_id: tg.id, redirect_uri: redirectUri, response_type: 'code', scope: 'openid profile phone', state, code_challenge: challenge, code_challenge_method: 'S256' });
    return Response.redirect('https://oauth.telegram.org/auth?' + q.toString().replace(/\+/g, '%20'), 302);
  }
  // /cabinet/tg/callback
  const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '';
  if (!/^[0-9a-f]{32}$/.test(state)) return back('tgerr=state');
  const st = await env.DB.prepare('SELECT * FROM cabinet_oauth WHERE state = ?1').bind(state).first();
  await env.DB.prepare('DELETE FROM cabinet_oauth WHERE state = ?1 OR expires_at < ?2').bind(state, nowIso()).run();
  if (!st || Date.parse(st.expires_at) <= Date.now()) return back('tgerr=state');
  if (!code) return back('tgerr=cancel');
  const tr = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + btoa(`${tg.id}:${tg.secret}`) },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: tg.id, code_verifier: st.verifier }).toString()
  }).catch(() => null);
  const tj = tr && tr.ok ? await tr.json().catch(() => null) : null;
  const claims = tj && await verifyTgIdToken(tj.id_token, tg.id).catch(() => null);
  if (!claims) return back('tgerr=token');
  const tgId = String(claims.id || claims.sub || '').slice(0, 40);
  const phone = normPhone(claims.phone_number);
  if (!tgId) return back('tgerr=token');

  if (st.mode === 'link') {
    // Привязка Telegram к уже открытому кабинету: этот Telegram становится входом для всех заведений сессии
    const srow = await env.DB.prepare('SELECT * FROM cabinet_sessions WHERE token_hash = ?1').bind(st.session_hash).first();
    if (!srow) return back('tgerr=nosession');
    const ms = await cabMembers(env, srow);
    await env.DB.batch([
      ...ms.map((m) => env.DB.prepare('UPDATE cabinet_members SET tg_id = ?2 WHERE id = ?1').bind(m.id, tgId)),
      env.DB.prepare('UPDATE cabinet_sessions SET tg_id = ?2 WHERE token_hash = ?1').bind(st.session_hash, tgId)
    ]);
    return back('tg=linked');
  }
  // Вход: по привязанному Telegram, иначе по номеру телефона, который подтвердил сам Telegram
  let found = await env.DB.prepare('SELECT id FROM cabinet_members WHERE removed_at IS NULL AND tg_id = ?1 LIMIT 1').bind(tgId).first();
  if (!found && phone.length >= 10) {
    const byPhone = (await env.DB.prepare("SELECT id FROM cabinet_members WHERE removed_at IS NULL AND phone = ?1 AND tg_id = ''").bind(phone).all()).results;
    if (byPhone.length) {
      await env.DB.batch(byPhone.map((m) => env.DB.prepare('UPDATE cabinet_members SET tg_id = ?2 WHERE id = ?1').bind(m.id, tgId)));
      found = byPhone[0];
    }
  }
  if (!found) return back('tgerr=nomember');
  const token = await cabNewSession(env, { tgId });
  return new Response(null, { status: 302, headers: { location: `${url.origin}/cabinet`, 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
}

/* ---------- Вход через кнопку Telegram (классический Login Widget, /setdomain в @BotFather) ----------
   Включается app_config.tg_widget = '1' после того, как домен сайта привязан к боту.
   Подпись проверяем по токену бота: secret = SHA256(token), hash = HMAC-SHA256(строка данных, secret).
   Номер телефона виджет не передаёт — поэтому Telegram сначала привязывается в кабинете. */
async function tgWidgetCfg(env) {
  if (String(env.TG_WIDGET || await cfg(env, 'tg_widget') || '') !== '1') return null;
  const token = env.TG_TOKEN || await cfg(env, 'tg_token');
  const bot = String(env.TG_BOT || await cfg(env, 'tg_bot') || '').replace(/^@/, '');
  return token && /^[A-Za-z0-9_]{5,40}$/.test(bot) ? { token, bot } : null;
}
async function verifyTgWidget(params, token) {
  const hash = params.get('hash') || '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const dcs = [...params.keys()].filter((k) => k !== 'hash').sort().map((k) => `${k}=${params.get(k)}`).join('\n');
  const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dcs)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (sig !== hash) return null;
  const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
  if (!(age >= -300 && age < 86400)) return null;
  return /^\d{1,20}$/.test(params.get('id') || '') ? params.get('id') : null;
}
async function handleTgWidget(request, env, mode) {
  const url = new URL(request.url);
  const back = (q) => Response.redirect(`${url.origin}/cabinet${q ? '?' + q : ''}`, 302);
  const w = await tgWidgetCfg(env);
  if (!w) return back('tgerr=off');
  if (await tooMany(request, 'cab-tgw', 20, 600)) return back('tgerr=limit');
  const tgId = await verifyTgWidget(url.searchParams, w.token);
  if (!tgId) return back('tgerr=token');
  if (mode === 'link') {
    const s = await cabSession(env, request);
    if (!s || !s.slugs.length) return back('tgerr=nosession');
    await env.DB.batch([
      ...s.members.map((m) => env.DB.prepare('UPDATE cabinet_members SET tg_id = ?2 WHERE id = ?1').bind(m.id, tgId)),
      env.DB.prepare('UPDATE cabinet_sessions SET tg_id = ?2 WHERE token_hash = ?1').bind(s.hash, tgId)
    ]);
    return back('tg=linked');
  }
  const found = await env.DB.prepare('SELECT id FROM cabinet_members WHERE removed_at IS NULL AND tg_id = ?1 LIMIT 1').bind(tgId).first();
  if (!found) return back('tgerr=nomember');
  const token = await cabNewSession(env, { tgId });
  return new Response(null, { status: 302, headers: { location: `${url.origin}/cabinet`, 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
}
/** Что показать на странице: кнопку-виджет (имя бота) или ссылку OpenID */
async function tgFlags(env) {
  const oidc = !!(await tgLoginCfg(env));
  const w = oidc ? null : await tgWidgetCfg(env);
  return { tg: oidc || !!w, tgBot: w ? w.bot : '' };
}

/* ---------- что разрешено ролям ---------- */
// owner и senior — всё (senior не трогает владельцев); manager — меню, фото, акции, бизнес-ланч, статистика (без настроек и команды);
// stop — только включать/выключать блюда (кухня, бар)
const MANAGER_SECTIONS = new Set(['categories', 'sections', 'menu-items', 'badges', 'promos', 'upload', 'import-menu', 'ar-cutout']);

async function handleCabinetApi(request, env, p) {
  const method = request.method;
  const sub = p.slice('/cabinet/api'.length) || '/';
  // Защита от подделки запросов с чужих сайтов: все изменения — только из нашей страницы
  if (method !== 'GET' && method !== 'HEAD' && request.headers.get('x-tm') !== '1') return json({ error: 'forbidden' }, { status: 403 });
  const readBody = async () => { try { return await request.json(); } catch { return {}; } };

  /* --- вход без сессии --- */
  if (sub === '/login/start' && method === 'POST') {
    if (await tooMany(request, 'cab-login', 8, 600)) return slowDown();
    const email = normEmail((await readBody()).email);
    if (!EMAIL_RE.test(email)) return json({ error: 'bad_email', message: 'Проверьте email' }, { status: 400 });
    if (!(await mailCfg(env))) return json({ error: 'mail_off', message: 'Вход по почте скоро заработает. Войдите через Telegram или по QR с телефона.' }, { status: 503 });
    if (await tooMany(request, 'cab-mail', 3, 600, email)) return slowDown();
    const known = await env.DB.prepare('SELECT 1 FROM cabinet_members WHERE removed_at IS NULL AND email = ?1 LIMIT 1').bind(email).first();
    if (known) await cabSendCode(env, email);
    return json({ ok: true });   // одинаковый ответ: по нему нельзя узнать, есть ли такой email
  }
  if (sub === '/login/verify' && method === 'POST') {
    if (await tooMany(request, 'cab-verify', 10, 600)) return slowDown();
    const b = await readBody();
    const email = normEmail(b.email);
    if (!EMAIL_RE.test(email) || !(await cabCheckCode(env, email, b.code))) return json({ error: 'bad_code', message: 'Неверный или просроченный код' }, { status: 400 });
    const token = await cabNewSession(env, { email });
    return json({ ok: true }, { headers: { 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
  }
  // QR: компьютер просит вход, телефон с открытым кабинетом подтверждает
  if (sub === '/qr/new' && method === 'POST') {
    if (await tooMany(request, 'cab-qr', 30, 600)) return slowDown();
    const id = randHex(16), secret = randHex(24);
    await env.DB.prepare('INSERT INTO cabinet_qr (id_hash, secret_hash, approved_by, expires_at) VALUES (?1, ?2, \'\', ?3)')
      .bind(await sha256hex(id), await sha256hex(secret), new Date(Date.now() + 5 * 60e3).toISOString()).run();
    return json({ id, secret, ttl: 300 });
  }
  if (sub === '/qr/poll' && method === 'POST') {
    if (await tooMany(request, 'cab-qrpoll', 400, 600)) return slowDown();
    const b = await readBody();
    if (!/^[0-9a-f]{32}$/.test(b.id || '') || !/^[0-9a-f]{48}$/.test(b.secret || '')) return json({ status: 'expired' });
    const idh = await sha256hex(b.id);
    const q = await env.DB.prepare('SELECT * FROM cabinet_qr WHERE id_hash = ?1').bind(idh).first();
    if (!q || q.secret_hash !== await sha256hex(b.secret) || Date.parse(q.expires_at) <= Date.now()) return json({ status: 'expired' });
    if (!q.approved_by) return json({ status: 'pending' });
    const src = await env.DB.prepare('SELECT * FROM cabinet_sessions WHERE token_hash = ?1').bind(q.approved_by).first();
    await env.DB.prepare('DELETE FROM cabinet_qr WHERE id_hash = ?1 OR expires_at < ?2').bind(idh, nowIso()).run();
    if (!src || Date.parse(src.expires_at) <= Date.now()) return json({ status: 'expired' });
    const token = await cabNewSession(env, { email: src.email, slug: src.slug, memberId: src.member_id, tgId: src.tg_id });
    return json({ status: 'ok' }, { headers: { 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
  }
  // Приглашение в команду: что за заведение и роль (до входа)
  if ((sub === '/invite/info' || sub === '/invite/accept') && method === 'POST') {
    if (await tooMany(request, 'cab-invite', 20, 600)) return slowDown();
    const b = await readBody();
    if (!/^[0-9a-f]{48}$/.test(b.token || '')) return json({ error: 'bad_invite', message: 'Ссылка-приглашение неверная' }, { status: 400 });
    const th = await sha256hex(b.token);
    const inv = await env.DB.prepare('SELECT i.*, r.name FROM cabinet_invites i JOIN restaurants r ON r.slug = i.slug WHERE i.token_hash = ?1').bind(th).first();
    if (!inv || inv.used_at || Date.parse(inv.expires_at) <= Date.now()) return json({ error: 'bad_invite', message: 'Приглашение уже использовано или истекло. Попросите новое.' }, { status: 410 });
    if (sub === '/invite/info') return json({ restaurant: inv.name, role: inv.role });
    const name = String(b.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
    if (!name) return json({ error: 'no_name', message: 'Напишите своё имя' }, { status: 400 });
    // Если человек уже вошёл (например, работает в другом заведении) — добавляем к его входу
    const cur = await cabSession(env, request);
    const r = await env.DB.prepare('INSERT INTO cabinet_members (slug, role, name, email, tg_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(inv.slug, inv.role, name, cur ? cur.email : '', cur ? cur.tgId : '', nowIso()).run();
    await env.DB.prepare('UPDATE cabinet_invites SET used_at = ?2 WHERE token_hash = ?1').bind(th, nowIso()).run();
    const mid = r.meta.last_row_id;
    if (cur && !cur.email && !cur.tgId) {
      // Сессия «только этот телефон» без email/Telegram: даём новую сессию на нового сотрудника
      const token = await cabNewSession(env, { memberId: mid });
      return json({ ok: true, slug: inv.slug }, { headers: { 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
    }
    if (cur) return json({ ok: true, slug: inv.slug });
    const token = await cabNewSession(env, { memberId: mid });
    return json({ ok: true, slug: inv.slug }, { headers: { 'set-cookie': cabCookie(token, CAB_TTL_MS / 1000) } });
  }
  if (sub === '/logout' && method === 'POST') {
    const s0 = await cabSession(env, request);
    if (s0) await env.DB.prepare('DELETE FROM cabinet_sessions WHERE token_hash = ?1').bind(s0.hash).run();
    return json({ ok: true }, { headers: { 'set-cookie': cabCookie('', 0) } });
  }

  const s = await cabSession(env, request);
  if (!s || !s.slugs.length) return json({ error: 'no_session', mail: !!(await mailCfg(env)), ...(await tgFlags(env)) }, { status: 401 });

  if (sub === '/me' && method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT slug, name, active, plan, trial_until, paid_until, domain FROM restaurants WHERE slug IN (${s.slugs.map(() => '?').join(',')}) ORDER BY name`).bind(...s.slugs).all()).results;
    const me = s.members[0] || {};
    return json({
      email: s.email || s.members.map((m) => m.email).find(Boolean) || '',
      telegram: !!(s.tgId || s.members.some((m) => m.tg_id)),
      name: me.name || '', role: 'editor', cabinet: true,
      mail: !!(await mailCfg(env)), ...(await tgFlags(env)),
      restaurants: rows.map((r) => ({ ...r, myRole: s.roles[r.slug], billing: billingState(r) }))
    });
  }
  if (sub === '/qr/approve' && method === 'POST') {
    const b = await readBody();
    if (!/^[0-9a-f]{32}$/.test(b.id || '')) return json({ error: 'bad_qr', message: 'QR-код устарел, обновите страницу на компьютере' }, { status: 400 });
    const r = await env.DB.prepare("UPDATE cabinet_qr SET approved_by = ?2 WHERE id_hash = ?1 AND approved_by = '' AND expires_at > ?3")
      .bind(await sha256hex(b.id), s.hash, nowIso()).run();
    if (!r.meta.changes) return json({ error: 'bad_qr', message: 'QR-код устарел, обновите страницу на компьютере' }, { status: 410 });
    return json({ ok: true });
  }
  // Привязать email ко всем своим записям в командах (чтобы входить с любого устройства)
  if (sub === '/email/start' && method === 'POST') {
    if (await tooMany(request, 'cab-login', 8, 600)) return slowDown();
    const email = normEmail((await readBody()).email);
    if (!EMAIL_RE.test(email)) return json({ error: 'bad_email', message: 'Проверьте email' }, { status: 400 });
    if (await tooMany(request, 'cab-mail', 3, 600, email)) return slowDown();
    if (!(await cabSendCode(env, email))) return json({ error: 'mail_off', message: `Не получилось отправить письмо (почтовый сервис ответил: ${sendMail.lastError || 'нет ответа'})` }, { status: 503 });
    return json({ ok: true });
  }
  if (sub === '/email/verify' && method === 'POST') {
    if (await tooMany(request, 'cab-verify', 10, 600)) return slowDown();
    const b = await readBody();
    const email = normEmail(b.email);
    if (!EMAIL_RE.test(email) || !(await cabCheckCode(env, email, b.code))) return json({ error: 'bad_code', message: 'Неверный или просроченный код' }, { status: 400 });
    await env.DB.batch([
      ...s.members.map((m) => env.DB.prepare('UPDATE cabinet_members SET email = ?2 WHERE id = ?1').bind(m.id, email)),
      env.DB.prepare('UPDATE cabinet_sessions SET email = ?2 WHERE token_hash = ?1').bind(s.hash, email)
    ]);
    return json({ ok: true, email });
  }

  const segments = sub.split('/').filter(Boolean);
  const url = new URL(request.url);
  const qSlug = normId(url.searchParams.get('restaurant'));
  const myRole = s.roles[qSlug] || '';

  /* --- команда заведения (только владелец) --- */
  if (segments[0] === 'team') {
    if (!CAN_TEAM.has(myRole)) return json({ error: 'owner_only', message: 'Команду меняют владелец и старший менеджер' }, { status: 403 });
    const ownerOnly = () => json({ error: 'owner_only', message: 'Владельцев назначает и меняет только владелец' }, { status: 403 });
    if (segments.length === 1 && method === 'GET') {
      const r = await env.DB.prepare('SELECT id, role, name, email, tg_id, phone, created_at FROM cabinet_members WHERE slug = ?1 AND removed_at IS NULL ORDER BY id').bind(qSlug).all();
      const mine = new Set(s.members.map((m) => m.id));
      return json({ items: r.results.map((m) => ({ id: m.id, role: m.role, name: m.name, email: m.email, telegram: !!m.tg_id, phone: m.phone ? '+' + m.phone : '', me: mine.has(m.id) })) });
    }
    if (segments[1] === 'invite' && method === 'POST') {
      if (await tooMany(request, 'cab-inv', 30, 3600)) return slowDown();
      const role = (await readBody()).role;
      if (!ROLES.includes(role)) return json({ error: 'bad_role' }, { status: 400 });
      if (role === 'owner' && myRole !== 'owner') return ownerOnly();
      const token = randHex(24);
      await env.DB.prepare('INSERT INTO cabinet_invites (token_hash, slug, role, created_by, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(await sha256hex(token), qSlug, role, (s.members.find((m) => m.slug === qSlug) || {}).id || 0, nowIso(), new Date(Date.now() + 24 * 3600e3).toISOString()).run();
      return json({ ok: true, url: `${url.origin}/cabinet?invite=${token}` });
    }
    const mid = Number(segments[1]);
    const target = mid && await env.DB.prepare('SELECT * FROM cabinet_members WHERE id = ?1 AND slug = ?2 AND removed_at IS NULL').bind(mid, qSlug).first();
    if (!target) return json({ error: 'not_found' }, { status: 404 });
    const owners = (await env.DB.prepare("SELECT COUNT(*) n FROM cabinet_members WHERE slug = ?1 AND role = 'owner' AND removed_at IS NULL").bind(qSlug).first()).n;
    if (segments[2] === 'role' && method === 'POST') {
      const role = (await readBody()).role;
      if (!ROLES.includes(role)) return json({ error: 'bad_role' }, { status: 400 });
      if ((target.role === 'owner' || role === 'owner') && myRole !== 'owner') return ownerOnly();
      if (target.role === 'owner' && role !== 'owner' && owners <= 1) return json({ error: 'last_owner', message: 'Нужен хотя бы один владелец' }, { status: 400 });
      await env.DB.prepare('UPDATE cabinet_members SET role = ?2 WHERE id = ?1').bind(mid, role).run();
      return json({ ok: true });
    }
    if (segments[2] === 'remove' && method === 'POST') {
      if (target.role === 'owner' && myRole !== 'owner') return ownerOnly();
      if (target.role === 'owner' && owners <= 1) return json({ error: 'last_owner', message: 'Нельзя убрать единственного владельца' }, { status: 400 });
      await env.DB.prepare('UPDATE cabinet_members SET removed_at = ?2 WHERE id = ?1').bind(mid, nowIso()).run();
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, { status: 404 });
  }

  // Остальное — обработчики админки, но только для своих заведений и по правам роли
  if (!segments.length || ['tg', 'leads', 'me'].includes(segments[0])) return json({ error: 'forbidden' }, { status: 403 });
  if (!myRole) return json({ error: 'wrong_restaurant' }, { status: 403 });
  const write = method !== 'GET' && method !== 'HEAD';
  let body = null;
  if (write && !CAN_TEAM.has(myRole)) {
    const deny = () => json({ error: 'role', message: 'Недостаточно прав для этого действия' }, { status: 403 });
    if (myRole === 'stop') {
      // Кухня/бар: только PUT /menu-items/<id> с полем active
      if (!(segments[0] === 'menu-items' && method === 'PUT' && /^\d+$/.test(segments[1] || '') && segments.length === 2)) return deny();
      const b = await readBody();
      if (!Object.keys(b).length || Object.keys(b).some((k) => k !== 'active')) return deny();
      body = JSON.stringify({ active: b.active });
    } else if (segments[0] === 'restaurants') {
      // Менеджер в настройках может менять только бизнес-ланч
      if (method !== 'PUT') return deny();
      const b = await readBody();
      if (!('lunch' in b)) return deny();
      body = JSON.stringify({ lunch: b.lunch });
    } else if (!MANAGER_SECTIONS.has(segments[0])) return deny();
  }
  const target = new URL(request.url);
  target.pathname = '/admin/api' + sub;
  const req2 = body !== null ? new Request(target.toString(), { method, headers: request.headers, body }) : new Request(target.toString(), request);
  CAB.set(req2, { email: s.email, slugs: s.slugs, role: myRole });
  if (sub === '/upload' && method === 'POST') return handleUpload(req2, env);
  if (sub === '/import-menu' && method === 'POST') return (await tooMany(request, 'cab-import', 60, 3600)) ? slowDown() : handleImportMenu(req2, env);
  if (sub === '/ar-cutout' && method === 'POST') return handleArCutout(req2, env);
  return handleAdminApi(req2, env, segments);
}

/** Меню заведения по адресу tutmenu.kz/<slug> */
async function serveRestaurantPage(request, env, url, rest) {
  const u = new URL(url);
  u.pathname = '/';
  u.search = '?r=' + encodeURIComponent(rest.slug);
  const page = await serveIndexWithSeo(new Request(u.toString(), request), env, u);
  const extra = `<meta name="tm-r" content="${escHtml(rest.slug)}">${rest.plan === 'trial' ? '<meta name="robots" content="noindex">' : ''}`;
  const out = new HTMLRewriter().on('head', { element(el) { el.prepend(extra, { html: true }); } }).transform(page);
  const res = new Response(out.body, out);
  res.headers.set('cache-control', 'no-store');
  return res;
}

/* ---------- Маршрутизация ---------- */
const handler = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupDemos(env));
    if (new Date().getUTCHours() === 4) { ctx.waitUntil(usageReport(env)); ctx.waitUntil(billingReminders(env)); }   // 9:17 по Уральску
  },
  /* Обёртка: базовые заголовки безопасности на все ответы */
  async fetch(request, env, ctx) {
    const res = await handler.route(request, env, ctx);
    if (!res || res.status === 101) return res;
    const out = new Response(res.body, res);
    const h = out.headers;
    h.set('x-content-type-options', 'nosniff');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    const ct = h.get('content-type') || '';
    if (ct.includes('text/html')) h.set('x-frame-options', 'SAMEORIGIN');
    // Загруженные файлы никогда не исполняются как страница (защита от SVG/HTML со скриптом)
    if (new URL(request.url).pathname.startsWith('/files/')) h.set('content-security-policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    return out;
  },
  async route(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;
    // Только защищённое соединение: http:// → https:// (локальная проверка на localhost не трогается)
    if (url.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    try {
      if (p === '/api/menu' && method === 'GET') {
        const did = (url.searchParams.get('id') || '').toLowerCase();
        if (did.startsWith('demo:')) return await handleDemoMenu(request, env, did.slice(5).replace(/[^a-z0-9-]/g, ''));
        return await handleMenu(request, env);
      }
      if (p === '/api/demo' && method === 'POST') return (await tooMany(request, 'demo', 10, 600)) ? slowDown() : await handleDemoCreate(request, env, ctx);
      if (/^\/api\/demo\/[a-z0-9-]{1,64}$/.test(p) && method === 'PUT') return (await tooMany(request, 'demoput', 60, 600)) ? slowDown() : await handleDemoUpdate(request, env, p.split('/')[3]);
      if (p === '/api/orders' && method === 'POST') return (await tooMany(request, 'orders', 15, 600)) ? slowDown() : await handleOrders(request, env);
      if (p === '/api/track' && method === 'POST') return (await tooMany(request, 'track', 600, 600)) ? json({ ok: false }, { status: 429 }) : await handleTrack(request, env);
      if (p === '/api/ai-search' && method === 'POST') return (await tooMany(request, 'ai', 30, 600)) ? slowDown() : await handleAiSearch(request, env, ctx);
      if (p.startsWith('/cabinet/api/')) return await handleCabinetApi(request, env, p);
      if ((p === '/cabinet/tg/start' || p === '/cabinet/tg/callback') && method === 'GET') return await handleTgLogin(request, env, p);
      if ((p === '/cabinet/tg/widget/login' || p === '/cabinet/tg/widget/link') && method === 'GET') return await handleTgWidget(request, env, p.split('/').pop());
      if (p === '/admin/api/upload' && method === 'POST') return await handleUpload(request, env);
      if (p === '/admin/api/import-menu' && method === 'POST') return await handleImportMenu(request, env);
      if (p === '/admin/api/ar-cutout' && method === 'POST') return await handleArCutout(request, env);
      if (p.startsWith('/ar/') && (method === 'GET' || method === 'HEAD')) return await handleArGlb(request, env, ctx, p.slice(4));
      if (p === '/admin/api/tg' || p.startsWith('/admin/api/tg/')) {
        return await handleTgApi(request, env, p.split('/')[4] || '');
      }
      if (p === '/admin/api/platform' && method === 'GET') return await handlePlatformApi(request, env);
      { const m = p.match(/^\/admin\/api\/platform\/([a-z0-9-]{1,64})\/paid-until$/); if (m && method === 'POST') return await handlePlatformPaidUntil(request, env, m[1]); }
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
      // Подробности ошибки — только в админке; гостям не показываем внутренности сервера
      console.error(err);
      return json({ error: 'server_error', message: p.startsWith('/admin/api/') ? String(err) : 'Ошибка сервера' }, { status: 500 });
    }

    // Демо из конструктора — только на продающем домене (и workers.dev для проверки)
    // Один адрес для клиентов: www и старый workers.dev → tutmenu.kz (админка, API и файлы на workers.dev остаются)
    if (method === 'GET' || method === 'HEAD') {
      if (url.hostname === 'www.tutmenu.kz') return Response.redirect('https://tutmenu.kz' + p + url.search, 301);
      if (url.hostname.endsWith('.workers.dev') && env.DEV_SALES !== '1'
        && (/^\/(site|demo)(\/|$)/.test(p) || /^\/[a-z0-9][a-z0-9-]{1,40}\/?$/.test(p)) && !/^\/(admin|api|files|media|cabinet)(\/|$)/.test(p)) {
        return Response.redirect('https://tutmenu.kz' + p + url.search, 302);
      }
    }
    // DEV_SALES — только для локальной проверки (wrangler dev на localhost), в бою не задан
    const salesish = SALES_HOSTS.has(url.hostname) || url.hostname.endsWith('.workers.dev') || env.DEV_SALES === '1';
    if (/^\/demo\/[a-z0-9-]{1,64}\/?$/i.test(p) && salesish && (method === 'GET' || method === 'HEAD')) {
      return await serveDemoPage(request, env);
    }
    // Кабинет владельца: та же страница админки, без Cloudflare Access
    if ((p === '/cabinet' || p === '/cabinet/') && (method === 'GET' || method === 'HEAD')) {
      const page = await env.ASSETS.fetch(new Request(new URL('/admin/index.html', url).toString()));
      const res = new Response(page.body, page);
      res.headers.set('cache-control', 'no-store');
      res.headers.set('x-robots-tag', 'noindex');
      return res;
    }
    // Меню заведения по адресу tutmenu.kz/<название>
    const pm = p.match(/^\/([a-z0-9][a-z0-9-]{1,40})(\/?)$/);
    if (pm && salesish && !RESERVED_SLUGS.has(pm[1]) && (method === 'GET' || method === 'HEAD')) {
      const rest = await env.DB.prepare('SELECT slug, plan FROM restaurants WHERE slug = ?1 AND active = 1').bind(pm[1]).first().catch(() => null);
      if (rest) {
        if (pm[2]) return Response.redirect(url.origin + '/' + rest.slug + url.search, 301);
        return await serveRestaurantPage(request, env, url, rest);
      }
    }

    // Лендинг tut.menu живёт только на своём домене: на сайтах клиентов (tipagraf.kz и др.) папки /site нет
    if (/^\/site(\/|$)/.test(p) && !salesish) {
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
export default handler;
