/* Конструктор демо tut.menu. Каждый шаг меняет дизайн, превью (настоящее меню в iframe) обновляется сразу.
   Дизайн можно смешивать: тема задаёт всё сразу, а цвета, шрифты, форму и стиль карточек
   можно взять из любой другой темы. */
(function () {
  const T = window.TMThemes;
  // Шрифты всех тем — чтобы образцы на шаге «Шрифты» показывались своими шрифтами
  const fl = document.createElement('link');
  fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=' + Object.values(T.FONTS).map((f) => f.gf).join('&family=') + '&display=swap';
  document.head.appendChild(fl);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const KINDS = [
    ['restaurant', 'Ресторан'], ['cafe', 'Кафе'], ['coffee', 'Кофейня'], ['lounge', 'Лаунж / кальянная'], ['bar', 'Бар'],
    ['sushi', 'Суши'], ['pizza', 'Пиццерия'], ['fastfood', 'Фастфуд'], ['bakery', 'Кондитерская'], ['canteen', 'Столовая']
  ];

  const S = {
    mode: 'quick',
    info: { owner: '', name: '', phone: '', city: 'Уральск', kind: '' },
    logo: '',
    design: { theme: 'graf' },
    welcome: true,
    welcomeBg: 'photo',
    blocks: { promos: true, lunch: true, stories: false }
  };
  try { const saved = JSON.parse(sessionStorage.getItem('tm_build') || 'null'); if (saved) Object.assign(S, saved); } catch {}
  const save = () => { try { sessionStorage.setItem('tm_build', JSON.stringify(S)); } catch {} };

  const STEPS = {
    info: { title: 'Расскажите о заведении', quick: true },
    logo: { title: 'Логотип', quick: true },
    theme: { title: 'Выберите дизайн', quick: true },
    welcome: { title: 'Приветственный экран' },
    colors: { title: 'Цвета' },
    fonts: { title: 'Шрифты' },
    layout: { title: 'Карточки и кнопки' },
    blocks: { title: 'Что показать в меню' },
    done: { title: 'Готово', quick: true }
  };
  const order = () => Object.keys(STEPS).filter((k) => S.mode === 'full' || STEPS[k].quick);
  let cur = 0;

  /* ---------- превью ---------- */
  const pv = $('#pv');
  let screen = '#/menu';
  try { sessionStorage.setItem('menu_lang_asked_v1', '1'); localStorage.setItem('menu_tip_tap_v1', '1'); } catch {}
  pv.src = '/demo/preview?preview=1' + screen;
  let ready = false;
  pv.addEventListener('load', () => { ready = true; setTimeout(push, 400); });
  function push() {
    if (!ready || !pv.contentWindow) return;
    pv.contentWindow.postMessage({
      type: 'tm-design',
      design: Object.assign({}, S.design, { welcome: S.welcome, welcomeBg: S.welcomeBg }),
      name: S.info.name || 'Ваше заведение',
      logo: S.logo,
      blocks: S.blocks,
      screen
    }, location.origin);
  }
  function setScreen(sc) {
    screen = sc;
    document.querySelectorAll('[data-screen]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.screen === sc)));
    push();
  }
  document.querySelectorAll('[data-screen]').forEach((b) => b.addEventListener('click', () => setScreen(b.dataset.screen)));
  $('#peek').addEventListener('click', () => { $('#stage').classList.add('is-open'); push(); });
  $('#peekClose').addEventListener('click', () => $('#stage').classList.remove('is-open'));

  /* ---------- шаги ---------- */
  const wrap = $('#stepWrap');
  function setDesign(patch) { Object.assign(S.design, patch); save(); push(); render(); }
  function pressed(v) { return `aria-pressed="${v ? 'true' : 'false'}"`; }
  function resolved() { return T.resolve(S.design); }

  function themesSorted() {
    const ids = Object.keys(T.THEMES);
    const k = S.info.kind;
    return k ? ids.sort((a, b) => (T.THEMES[b].kinds.includes(k) ? 1 : 0) - (T.THEMES[a].kinds.includes(k) ? 1 : 0)) : ids;
  }

  const VIEWS = {
    info() {
      const i = S.info;
      return `<div class="step"><h1>Расскажите о заведении</h1>
        <p class="sub">Соберём демо с вашим названием. По этим данным мы свяжемся, когда захотите подключить.</p>
        <div class="fields">
          <div class="field"><label for="fOwner">Ваше имя</label><input id="fOwner" data-f="owner" autocomplete="name" value="${esc(i.owner)}"></div>
          <div class="field"><label for="fName">Название заведения</label><input id="fName" data-f="name" value="${esc(i.name)}" placeholder="Например, Бариста на Достык"></div>
          <div class="field"><label for="fPhone">Телефон / WhatsApp</label><input id="fPhone" data-f="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(i.phone)}" placeholder="+7 7__ ___ __ __"></div>
          <div class="field"><label for="fCity">Город</label><input id="fCity" data-f="city" value="${esc(i.city)}"></div>
        </div>
        <p class="label">Тип заведения</p>
        <div class="chips">${KINDS.map(([k, n]) => `<button type="button" class="chip" data-kind="${k}" ${pressed(i.kind === k)}>${n}</button>`).join('')}</div>
      </div>`;
    },
    logo() {
      return `<div class="step"><h1>Логотип</h1>
        <p class="sub">PNG с прозрачным фоном выглядит лучше всего. Можно пропустить: тогда в шапке будет название.</p>
        <label class="drop" for="fLogo">
          ${S.logo ? `<img src="${S.logo}" alt="Ваш логотип">` : ''}
          <b>${S.logo ? 'Заменить логотип' : 'Загрузить логотип'}</b>
          <small>PNG, JPG или SVG, до 5 МБ</small>
        </label>
        <input id="fLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
        ${S.logo ? '<button type="button" class="chip" data-logo-clear style="margin-top:12px">Убрать логотип</button>' : ''}
      </div>`;
    },
    theme() {
      const cur = S.design.theme;
      return `<div class="step"><h1>Выберите дизайн</h1>
        <p class="sub">Готовые темы под ваш тип заведения. Потом любую деталь можно взять из другой темы: цвета от одной, шрифты от другой.</p>
        <div class="themes">${themesSorted().map((id) => {
          const t = T.THEMES[id];
          const fit = S.info.kind && t.kinds.includes(S.info.kind);
          return `<button type="button" class="theme" data-theme="${id}" ${pressed(cur === id)}>
            <img src="themes/${id}.webp" alt="" loading="lazy">
            <b>${t.name}</b>${fit ? '<span class="tag">Подходит вам</span>' : ''}<small>${t.note}</small></button>`;
        }).join('')}</div>
        <button type="button" class="dice" data-dice>Удиви меня</button>
      </div>`;
    },
    welcome() {
      return `<div class="step"><h1>Приветственный экран</h1>
        <p class="sub">Первое, что видит гость после QR: логотип, фото или видео заведения и кнопка «Меню».</p>
        <div class="toggles">
          <button type="button" class="tg" data-welcome ${pressed(S.welcome)}><span><b>Показывать приветствие</b><small>Если выключить, меню откроется сразу</small></span><i></i></button>
        </div>
        ${S.welcome ? `<p class="label">Фон</p><div class="chips">
          <button type="button" class="chip" data-wbg="photo" ${pressed(S.welcomeBg === 'photo')}>Фото заведения</button>
          <button type="button" class="chip" data-wbg="color" ${pressed(S.welcomeBg === 'color')}>Цвет темы</button>
        </div><p class="sub" style="font-size:14px">Своё фото или видео загрузим при подключении.</p>` : ''}
      </div>`;
    },
    colors() {
      const r = resolved();
      return `<div class="step"><h1>Цвета</h1>
        <p class="sub">Возьмите палитру любой темы или задайте свой фирменный цвет кнопок.</p>
        <div class="pals" style="margin-top:18px">${Object.entries(T.PALETTES).map(([id, p]) => `
          <button type="button" class="pal" data-pal="${id}" ${pressed(r.palette === id && !r.accent)}>
            <span class="pal__sw"><span style="background:${p.bg}"></span><span style="background:${p.surface}"></span><span style="background:${p.accent}"></span><span style="background:${p.text}"></span></span>
            <b>${p.name}</b></button>`).join('')}</div>
        <div class="custom"><input type="color" id="fAccent" value="${r.accent || T.PALETTES[r.palette].accent}" aria-label="Свой цвет кнопок"><span>Свой цвет кнопок и акцентов${r.accent ? ` · <button type="button" class="chip" data-accent-clear>Сбросить</button>` : ''}</span></div>
      </div>`;
    },
    fonts() {
      const r = resolved();
      return `<div class="step"><h1>Шрифты</h1>
        <p class="sub">Все поддерживают казахские буквы.</p>
        <div class="fontlist" style="margin-top:18px">${Object.entries(T.FONTS).map(([id, f]) => `
          <button type="button" class="fontopt" data-font="${id}" ${pressed(r.fonts === id)}>
            <span class="fontopt__d" style="font-family:'${f.display}';font-weight:${f.dw};text-transform:${f.upper ? 'uppercase' : 'none'}">Салаттар</span>
            <span class="fontopt__b">${f.name}</span></button>`).join('')}</div>
      </div>`;
    },
    layout() {
      const r = resolved();
      const row = (key, dict) => `<div class="chips">${Object.entries(dict).map(([id, n]) => `<button type="button" class="chip" data-set="${key}" data-v="${id}" ${pressed(r[key] === (typeof n === 'string' ? id : id))}>${typeof n === 'string' ? n : n.name}</button>`).join('')}</div>`;
      return `<div class="step"><h1>Карточки и кнопки</h1>
        <p class="sub">Смешивайте как угодно: всё сразу видно справа.</p>
        <p class="label">Раскладка блюд</p>${row('layout', T.LAYOUTS)}
        <p class="label">Карточки блюд</p>${row('cards', T.CARDS)}
        <p class="label">Разделы меню</p>${row('cats', T.CATS)}
        <p class="label">Углы кнопок и фото</p>${row('shape', T.SHAPES)}
      </div>`;
    },
    blocks() {
      const b = S.blocks;
      const tg = (k, t, s) => `<button type="button" class="tg" data-block="${k}" ${pressed(b[k])}><span><b>${t}</b><small>${s}</small></span><i></i></button>`;
      return `<div class="step"><h1>Что показать в меню</h1>
        <p class="sub">Всё можно включить позже в админке.</p>
        <div class="toggles">
          ${tg('promos', 'Акции и баннеры', 'Наверху меню: скидки, новинки, видео')}
          ${tg('lunch', 'Бизнес-ланч', 'Меню ланча на каждый день недели')}
          ${tg('stories', 'Сторис', 'Квадратики с видео, как в Инстаграме')}
        </div>
      </div>`;
    },
    done() {
      const r = resolved(), i = S.info;
      return `<div class="step"><h1>Ваше демо почти готово</h1>
        <p class="sub">Нажмите «Получить ссылку»: демо с вашим названием откроется по своей ссылке и проживёт 3 дня.</p>
        <dl class="done-card">
          <dt>Заведение</dt><dd>${esc(i.name || '—')}, ${esc(i.city || '')}</dd>
          <dt>Дизайн</dt><dd>${T.THEMES[r.theme].name} · цвета «${T.PALETTES[r.palette].name}» · шрифт «${T.FONTS[r.fonts].name}»</dd>
          <dt>Карточки</dt><dd>${T.LAYOUTS[r.layout]}, ${T.CARDS[r.cards].toLowerCase()}, разделы «${T.CATS[r.cats].toLowerCase()}»</dd>
        </dl>
        <p class="sub" id="doneMsg" style="font-size:14px"></p>
      </div>`;
    }
  };

  function render() {
    const steps = order();
    if (cur >= steps.length) cur = steps.length - 1;
    const id = steps[cur];
    $('#steps').innerHTML = steps.map((_, k) => `<i class="${k < cur ? 'done' : k === cur ? 'cur' : ''}"></i>`).join('');
    wrap.innerHTML = VIEWS[id]();
    $('#back').disabled = cur === 0;
    $('#next').textContent = id === 'done' ? 'Получить ссылку' : 'Далее';
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  }

  function validInfo() {
    const i = S.info;
    const digits = (i.phone || '').replace(/\D/g, '');
    const bad = [];
    if (!i.owner.trim()) bad.push('owner');
    if (!i.name.trim()) bad.push('name');
    if (digits.length < 11) bad.push('phone');
    document.querySelectorAll('.field').forEach((f) => f.classList.toggle('err', bad.includes(f.querySelector('[data-f]')?.dataset.f)));
    return !bad.length;
  }

  /* ---------- события ---------- */
  wrap.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (f) { S.info[f] = e.target.value; save(); if (f === 'name') push(); }
    if (e.target.id === 'fAccent') { S.design.accent = e.target.value; save(); push(); }
  });
  wrap.addEventListener('change', (e) => {
    if (e.target.id === 'fAccent') render();
    if (e.target.id === 'fLogo' && e.target.files[0]) readLogo(e.target.files[0]);
  });
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.kind) {
      S.info.kind = d.kind;
      // тема по типу заведения, пока гость сам не выбрал другую
      const fit = Object.keys(T.THEMES).find((id) => T.THEMES[id].kinds.includes(d.kind));
      if (fit && !S.themePicked) S.design = { theme: fit };
      save(); push(); render();
    } else if (d.theme) { S.themePicked = true; S.design = { theme: d.theme }; save(); push(); render(); }
    else if ('dice' in d) {
      const keys = (o) => Object.keys(o);
      const rnd = (a) => a[Math.floor(Math.random() * a.length)];
      const base = rnd(keys(T.THEMES));
      S.themePicked = true;
      S.design = { theme: base, palette: rnd(keys(T.PALETTES)), fonts: rnd(keys(T.FONTS)), shape: rnd(keys(T.SHAPES)), cats: rnd(keys(T.CATS)), cards: rnd(keys(T.CARDS)) };
      save(); push(); render();
    }
    else if (d.pal) setDesign({ palette: d.pal, accent: '' });
    else if ('accentClear' in d) setDesign({ accent: '' });
    else if (d.font) setDesign({ fonts: d.font });
    else if (d.set) setDesign({ [d.set]: d.v });
    else if ('welcome' in d) { S.welcome = !S.welcome; save(); setScreen('#/'); render(); }
    else if (d.wbg) { S.welcomeBg = d.wbg; save(); setScreen('#/'); render(); }
    else if (d.block) { S.blocks[d.block] = !S.blocks[d.block]; save(); setScreen('#/menu'); render(); }
    else if ('logoClear' in d) { S.logo = ''; save(); push(); render(); }
  });

  function readLogo(file) {
    if (file.size > 5 * 1024 * 1024) { alertMsg('Файл больше 5 МБ'); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      S.logo = c.toDataURL('image/png');
      URL.revokeObjectURL(url); save(); push(); render();
    };
    img.src = url;
  }
  function alertMsg(t) { const m = document.createElement('p'); m.className = 'sub'; m.textContent = t; wrap.querySelector('.step').append(m); }

  $('#next').addEventListener('click', async () => {
    const id = order()[cur];
    if (id === 'info' && !validInfo()) return;
    if (id === 'done') { await createDemo(); return; }
    cur++; render(); wrap.scrollIntoView({ block: 'start' });
    const nid = order()[cur];
    setScreen(nid === 'welcome' ? '#/' : '#/menu');
  });
  $('#back').addEventListener('click', () => { if (cur > 0) { cur--; render(); } });
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    const id = order()[cur];
    S.mode = b.dataset.mode; save();
    cur = Math.max(0, order().indexOf(id)); render();
  }));

  async function createDemo() {
    const msg = $('#doneMsg');
    const btn = $('#next');
    btn.disabled = true; msg.textContent = 'Собираем демо…';
    try {
      const res = await fetch('/api/demo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ info: S.info, logo: S.logo, design: Object.assign({}, S.design, { welcome: S.welcome, welcomeBg: S.welcomeBg }), blocks: S.blocks })
      });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error || 'error');
      location.href = j.url;
    } catch (e) {
      msg.textContent = 'Не получилось создать демо. Попробуйте ещё раз через минуту.';
      btn.disabled = false;
    }
  }

  render();
})();
