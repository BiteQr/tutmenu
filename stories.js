/* =========================================================
   STORIES — акции в виде квадратиков (как в 2ГИС) с видео внутри.
   Тап — видео на весь экран, полоски прогресса сверху, тап слева/справа —
   предыдущая/следующая, удержание — пауза, свайп вниз — закрыть.
   Включается настройкой заведения promoStyle = 'stories'.
   ========================================================= */
(function (App) {
  const { $, $$, esc, safeUrl, store, lockScroll, swipeClose, haptic } = App.utils;
  const I18n = App.I18n;
  const SEEN_KEY = 'menu_stories_seen_v1';

  let promos = [];
  let viewer = null;
  let idx = 0;
  let raf = 0;
  let muted = true;
  let holding = false;
  let onGoto = null;

  const seen = () => { try { return new Set(store.get(SEEN_KEY, [])); } catch { return new Set(); } };
  function markSeen(id) {
    const s = seen(); s.add(String(id));
    try { store.set(SEEN_KEY, [...s].slice(-50)); } catch {}
    const tile = $(`.story[data-story-id="${CSS.escape(String(id))}"]`);
    if (tile) tile.classList.add('is-seen');
  }

  /** Квадратики в ленте над поиском */
  function tilesHTML(list) {
    promos = list;
    const s = seen();
    return list.map((p, i) => {
      const title = I18n.f(p, 'title') || '';
      const media = p.video
        ? `<video src="${esc(safeUrl(p.video))}"${p.image ? ` poster="${esc(safeUrl(p.image))}"` : ''} autoplay muted loop playsinline preload="metadata"></video>`
        : (p.image ? `<img src="${esc(safeUrl(p.image))}" alt="" loading="${i < 4 ? 'eager' : 'lazy'}">` : '');
      return `<button type="button" class="story${s.has(String(p.id)) ? ' is-seen' : ''}" data-story="${i}" data-story-id="${esc(String(p.id))}" aria-label="${esc(title)}">
          <span class="story__media">${media}</span>
          <span class="story__title">${esc(title.trim())}</span>
        </button>`;
    }).join('');
  }

  /* ---------- полноэкранный просмотр ---------- */
  const SOUND_ON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>';
  const SOUND_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';

  function build() {
    viewer = document.createElement('div');
    viewer.className = 'sv';
    viewer.hidden = true;
    viewer.innerHTML = `
      <div class="sv__bg"></div>
      <div class="sv__card" role="dialog" aria-modal="true">
        <div class="sv__stage"></div>
        <div class="sv__top">
          <div class="sv__bars"></div>
          <div class="sv__head">
            <span class="sv__title"></span>
            <button type="button" class="sv__btn" data-sv="sound" aria-label="Sound">${SOUND_OFF}</button>
            <button type="button" class="sv__btn" data-sv="close" aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
        </div>
        <div class="sv__tap sv__tap--prev" data-sv="prev"></div>
        <div class="sv__tap sv__tap--next" data-sv="next"></div>
        <div class="sv__foot"></div>
      </div>`;
    document.body.append(viewer);

    const card = $('.sv__card', viewer);
    viewer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sv]');
      if (!b) return;
      const a = b.dataset.sv;
      if (a === 'close') close();
      else if (a === 'next') go(idx + 1);
      else if (a === 'prev') go(idx - 1);
      else if (a === 'sound') {
        muted = !muted;
        const v = $('video', viewer); if (v) { v.muted = muted; if (!muted) v.play().catch(() => {}); }
        b.innerHTML = muted ? SOUND_OFF : SOUND_ON;
      } else if (a === 'goto') {
        const id = b.dataset.item;
        close();
        if (onGoto) setTimeout(() => onGoto(id), 260);
      }
    });
    // Удержание — пауза (как в Instagram)
    let holdT = 0;
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sv__btn, .sv__goto')) return;
      holdT = setTimeout(() => { holding = true; viewer.classList.add('is-hold'); const v = $('video', viewer); if (v) v.pause(); }, 220);
    });
    let px = 0, py = 0;
    card.addEventListener('pointerdown', (e) => { px = e.clientX; py = e.clientY; }, true);
    card.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 10) clearTimeout(holdT); });
    const release = (e) => {
      clearTimeout(holdT);
      if (!holding) return;
      holding = false; card.dataset.justHeld = '1'; viewer.classList.remove('is-hold');
      const v = $('video', viewer); if (v) v.play().catch(() => {});
      if (e) { e.preventDefault(); e.stopPropagation(); }
    };
    card.addEventListener('pointerup', release, true);
    card.addEventListener('pointercancel', () => release());
    // Тап после удержания не должен листать
    card.addEventListener('click', (e) => { if (card.dataset.justHeld) { e.stopPropagation(); delete card.dataset.justHeld; } }, true);

    swipeClose(card, { axes: ['y'], backdrop: $('.sv__bg', viewer), onClose: () => close(true) });
    document.addEventListener('keydown', (e) => {
      if (viewer.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
    });
  }

  function barsHTML() {
    return promos.map((_, i) => `<span class="sv__bar"><i style="transform:scaleX(${i < idx ? 1 : 0})"></i></span>`).join('');
  }

  function show(i) {
    idx = i;
    const p = promos[i];
    cancelAnimationFrame(raf);
    const old = $('video', viewer); if (old) old.pause();
    $('.sv__bars', viewer).innerHTML = barsHTML();
    $('.sv__title', viewer).textContent = (I18n.f(p, 'title') || '').trim();
    const stage = $('.sv__stage', viewer);
    const desc = I18n.f(p, 'description');
    const item = p.itemId ? App.Cart.getItem(String(p.itemId)) : null;
    $('.sv__foot', viewer).innerHTML = `
      ${desc ? `<p class="sv__desc">${esc(desc)}</p>` : ''}
      ${item ? `<button type="button" class="sv__goto" data-sv="goto" data-item="${esc(item.id)}">${esc(I18n.f(p, 'button') || I18n.t('viewDish'))}</button>` : ''}`;
    $('.sv__btn[data-sv="sound"]', viewer).hidden = !p.video;
    markSeen(p.id);
    App.track && App.track('view_promo', { id: p.id });

    if (p.video) {
      stage.innerHTML = `
        <video class="sv__blur" src="${esc(safeUrl(p.video))}" muted playsinline preload="auto" aria-hidden="true"></video>
        <video class="sv__video" src="${esc(safeUrl(p.video))}"${p.image ? ` poster="${esc(safeUrl(p.image))}"` : ''} playsinline preload="auto"></video>`;
      const v = $('.sv__video', stage);
      const blur = $('.sv__blur', stage);
      v.muted = muted;
      // вертикальное видео — на весь экран, горизонтальное — целиком по центру на размытом фоне
      v.addEventListener('loadedmetadata', () => {
        const vertical = v.videoHeight >= v.videoWidth;
        stage.classList.toggle('is-vertical', vertical);
      });
      v.addEventListener('play', () => { blur.currentTime = v.currentTime; blur.play().catch(() => {}); });
      v.addEventListener('pause', () => blur.pause());
      v.addEventListener('ended', () => go(idx + 1));
      v.play().catch(() => { v.muted = true; muted = true; v.play().catch(() => {}); $('.sv__btn[data-sv="sound"]', viewer).innerHTML = SOUND_OFF; });
      tickVideo(v);
    } else {
      stage.innerHTML = p.image ? `<img class="sv__img" src="${esc(safeUrl(p.image))}" alt="">` : '';
      tickTimer(5000);
    }
  }

  function bar() { return $$('.sv__bar i', viewer)[idx]; }
  function tickVideo(v) {
    const step = () => {
      const b = bar();
      if (b && v.duration) b.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function tickTimer(ms) {
    let last = performance.now(), passed = 0;
    const step = (now) => {
      if (!holding) passed += now - last;
      last = now;
      const b = bar(); if (b) b.style.transform = `scaleX(${Math.min(1, passed / ms)})`;
      if (passed >= ms) { go(idx + 1); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function go(i) {
    if (i < 0) { show(0); return; }
    if (i >= promos.length) { close(); return; }
    haptic(5);
    show(i);
  }

  function open(i, fromEl, gotoFn) {
    if (!promos[i]) return;
    onGoto = gotoFn;
    if (!viewer) build();
    viewer.hidden = false;
    lockScroll('stories', true);
    // пауза квадратиков в ленте, пока смотрим полноэкранное
    $$('.story video').forEach((v) => v.pause());
    show(i);
    const card = $('.sv__card', viewer);
    const r = fromEl && fromEl.getBoundingClientRect();
    requestAnimationFrame(() => {
      viewer.classList.add('is-open');
      if (r && card.animate) {
        const W = window.innerWidth, H = window.innerHeight;
        card.animate([
          { transform: `translate(${r.left + r.width / 2 - W / 2}px, ${r.top + r.height / 2 - H / 2}px) scale(${r.width / W}, ${r.height / H})`, borderRadius: '40px', opacity: 0.6 },
          { transform: 'none', borderRadius: '0px', opacity: 1 }
        ], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' });
      }
    });
  }

  function close(fromSwipe) {
    if (!viewer || viewer.hidden) return;
    cancelAnimationFrame(raf);
    $$('video', viewer).forEach((v) => v.pause());
    viewer.classList.remove('is-open');
    lockScroll('stories', false);
    setTimeout(() => {
      viewer.hidden = true;
      $('.sv__stage', viewer).innerHTML = '';
      $$('.story video').forEach((v) => v.play().catch(() => {}));
    }, fromSwipe ? 0 : 250);
  }

  App.Stories = { tilesHTML, open, close };
})(window.App);
