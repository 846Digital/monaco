/* MONACO · real store content, local interactions, progressive motion. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = name => `<svg aria-hidden="true"><use href="#icon-${name}"/></svg>`;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storage = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  };
  let products = [], videos = [], filter = 'all', query = '', sort = 'curated', visibleLimit = 12, toastTimer, cleanupMotion;
  const money = value => `${Number(value).toLocaleString('ru-RU')} ₽`;
  const priceHTML = product => product.price ? `<strong>${money(product.price)}</strong>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ''}` : 'Цена — у менеджера';
  const publicationDate = value => value ? new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) : '';
  const saved = storage.get('monaco-selection', []);
  const selected = new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
  let size = storage.get('monaco-size', '');
  if (typeof size !== 'string') size = '';
  const returnFocus = new WeakMap();

  function toast(message, isError = false) {
    const node = $('#toast');
    clearTimeout(toastTimer);
    node.hidden = false;
    $('span', node).textContent = message;
    $('use', node).setAttribute('href', isError ? '#icon-close' : '#icon-check');
    toastTimer = setTimeout(() => { node.hidden = true; }, 3000);
  }

  function updateSelection() {
    const persisted = storage.set('monaco-selection', [...selected]);
    $$('[data-selection-count]').forEach(el => { el.textContent = selected.size; });
    $$('[data-save]').forEach(el => {
      const active = selected.has(el.dataset.save);
      el.setAttribute('aria-pressed', String(active));
      if (el.classList.contains('product-save')) {
        const product = products.find(p => p.id === el.dataset.save);
        el.setAttribute('aria-label', `${active ? 'Убрать из выбранного' : 'Сохранить'}: ${product?.title || 'вещь'}`);
      } else {
        el.innerHTML = `<span>${active ? 'Убрать из выбранного' : 'Добавить в выбранное'}</span>${icon(active ? 'check' : 'heart')}`;
      }
    });
    return persisted;
  }

  function toggleSelection(id) {
    if (!products.some(p => p.id === id)) return;
    const active = selected.has(id);
    if (active) selected.delete(id); else selected.add(id);
    const persisted = updateSelection();
    if (!persisted) toast('Выбор сохранён на время этой страницы');
    else toast(active ? 'Вещь убрана из выбранного' : 'Вещь в выбранном. Собирай свой образ.');
  }

  function productCard(product, index) {
    const p = Object.fromEntries(Object.entries(product).map(([k,v]) => [k, typeof v === 'string' ? escapeHTML(v) : v]));
    const isSelected = selected.has(product.id);
    return `<article class="product-card" data-category="${p.category}">
      <button class="product-photo" data-product="${p.id}" aria-label="Подробнее: ${p.title}">
        <img src="${p.image}" alt="${p.alt}" width="720" height="1280" loading="lazy" decoding="async">
        <span class="product-number">${product.sale ? 'SALE' : 'M / ' + String(index + 1).padStart(2, '0')}</span>
        <span class="product-open">Рассмотреть поближе ${icon('arrow')}</span>
      </button>
      <button class="product-save" data-save="${p.id}" aria-label="${isSelected ? 'Убрать из выбранного' : 'Сохранить'}: ${p.title}" aria-pressed="${isSelected}">${icon('heart')}</button>
      <div class="product-info"><span>${p.label}</span><h3><button class="product-title" data-product="${p.id}">${p.title}</button></h3><p class="product-price">${priceHTML(product)}</p>${p.video ? `<button class="product-play" data-play="${p.id}">${icon('play')} СМОТРЕТЬ В ДВИЖЕНИИ</button>` : ''}</div>
    </article>`;
  }

  function renderProducts({toTop = false} = {}) {
    const scrollToToolbar = () => {
      const top = window.scrollY + $('.collection-toolbar').getBoundingClientRect().top - 100;
      window.scrollTo({top:Math.max(0,top),behavior:'instant'});
    };
    if (toTop) scrollToToolbar();
    const found = products.filter(p => (filter === 'all' || p.category === filter) && `${p.title} ${p.description} ${p.sourceCaption} ${p.label}`.toLocaleLowerCase('ru').includes(query));
    if (sort !== 'curated') found.sort((a,b) => {
      if (a.price == null) return b.price == null ? 0 : 1;
      if (b.price == null) return -1;
      return sort === 'price-asc' ? a.price-b.price : b.price-a.price;
    });
    $('#product-grid').innerHTML = found.slice(0,visibleLimit).map(p => productCard(p, products.indexOf(p))).join('');
    $('#show-more').hidden = found.length <= visibleLimit;
    $('#catalog-result').textContent = `В подборке: ${found.length}`;
    $('#empty-results').hidden = found.length > 0;
    $('#product-grid').hidden = found.length === 0;
    $$('[data-filter]').forEach(el => {
      const active = el.dataset.filter === filter;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    });
    if (window.ScrollTrigger) ScrollTrigger.refresh();
    if (toTop) scrollToToolbar();
  }

  function closeDialog(dialog) {
    if (dialog?.open) {
      if (dialog.id === 'video-dialog') $('#reel-video').pause();
      dialog.close();
    }
  }

  function openDialog(id, trigger = document.activeElement) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    $$('dialog[open]').filter(d => !(id === 'video-dialog' && d.id === 'product-dialog')).forEach(d => { d.dataset.switching = 'true'; d.close(); });
    returnFocus.set(dialog, trigger);
    if (id === 'selection-dialog') renderSelection();
    dialog.showModal();
    document.body.classList.add('dialog-open');
    requestAnimationFrame(() => {
      const first = $('[data-close]', dialog) || $('button,a,input', dialog);
      first?.focus({preventScroll:true});
    });
  }

  function openProduct(id, trigger) {
    const p = products.find(p => p.id === id);
    if (!p) return;
    const gallery = p.gallery || [p.image];
    const thumbs = gallery.length > 1 ? `<div class="detail-thumbs" role="group" aria-label="Фотографии вещи">${gallery.map((src,i) => `<button data-gallery-src="${escapeHTML(src)}" aria-label="Фото ${i+1} из ${gallery.length}" aria-pressed="${i===0}"><img src="${escapeHTML(src)}" alt="" width="60" height="75"></button>`).join('')}</div>` : '';
    $('#product-detail').innerHTML = `<div class="detail-grid"><div class="detail-media"><img class="detail-photo" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.alt)}" width="720" height="1280">${thumbs}${p.video ? `<button class="detail-video-button" data-play="${p.id}">${icon('play')} Смотреть примерку</button>` : ''}</div><div class="detail-copy"><span class="eyebrow">MONACO / ${escapeHTML(p.label)}</span><h2 id="product-title">${escapeHTML(p.title)}</h2><div class="detail-price">${priceHTML(p)}</div><p>${escapeHTML(p.description)}</p>${p.sizes ? `<p class="detail-sizes">Размеры в публикации: <strong>${escapeHTML(p.sizes)}</strong></p>` : ''}<p class="detail-note">${p.price ? `Цена из публикации${p.sourceDate ? ' от '+publicationDate(p.sourceDate) : ''}. ` : ''}Наличие, актуальную цену, состав и замеры уточни у менеджера.</p><div class="detail-actions"><a class="button button-dark" href="https://t.me/Manager_Monaco_smr" target="_blank" rel="noopener noreferrer"><span>Спросить в Telegram</span>${icon('arrow')}</a><button class="button button-outline" data-save="${p.id}" aria-pressed="${selected.has(p.id)}"><span>${selected.has(p.id) ? 'Убрать из выбранного' : 'Добавить в выбранное'}</span>${icon(selected.has(p.id) ? 'check' : 'heart')}</button></div><a class="detail-source" href="${escapeHTML(p.source)}" target="_blank" rel="noopener noreferrer">Оригинальная публикация ${icon('arrow')}</a><details class="source-caption"><summary>Что пишет магазин</summary><p>${escapeHTML(p.sourceCaption)}</p></details></div></div>`;
    openDialog('product-dialog', trigger);
  }

  async function playVideo(id, trigger) {
    const video = videos.find(v => v.id === id);
    if (!video) { toast('Видео не загрузилось. Открой Instagram магазина.', true); return; }
    const player = $('#reel-video');
    player.pause();
    player.src = video.src;
    player.poster = video.poster;
    player.defaultPlaybackRate = video.id === 'post-07' ? .75 : 1;
    player.playbackRate = player.defaultPlaybackRate;
    player.muted = false;
    $('#video-title').textContent = video.title;
    $('#video-description').textContent = video.title;
    $('#video-source').href = video.url;
    openDialog('video-dialog', trigger);
    try { await player.play(); } catch { /* Native controls remain available. */ }
  }

  function createMessage() {
    const picked = products.filter(p => selected.has(p.id));
    return `Здравствуйте, MONACO! Заинтересовали эти вещи:\n\n${picked.map((p,i) => `${i+1}. ${p.title}${p.price ? ' — '+money(p.price)+' в публикации' : ''}\n${p.source}`).join('\n\n')}${size.trim() ? `\n\nМой размер / пожелания: ${size.trim()}` : ''}\n\nПодскажите, пожалуйста, актуальные цены, замеры и наличие.`;
  }

  function renderSelection() {
    const picked = products.filter(p => selected.has(p.id));
    const content = $('#selection-content');
    if (!picked.length) {
      content.innerHTML = `<div class="selection-empty">${icon('heart')}<h3>Здесь будет<br>твой следующий образ.</h3><p>Нажимай на сердечко у понравившихся вещей. Собери подборку и уточни детали у магазина одним сообщением.</p><button class="button button-dark" data-browse><span>Посмотреть вещи</span>${icon('arrow')}</button></div>`;
      return;
    }
    content.innerHTML = `<div class="selection-items">${picked.map(p => `<article class="selection-row"><img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.alt)}" width="75" height="100"><div class="selection-row-copy">${escapeHTML(p.title)}<small>${p.price ? money(p.price)+' в публикации' : 'Цена — у менеджера'}</small></div><button class="selection-remove" data-remove="${p.id}" aria-label="Убрать: ${escapeHTML(p.title)}">${icon('close')}</button></article>`).join('')}</div><div class="request-form"><label for="request-size">Твой размер или пожелания <span>Необязательно. Например: L, рост 182, люблю свободную посадку.</span><input id="request-size" maxlength="200" placeholder="Размер, рост, пожелания" value="${escapeHTML(size)}"></label><label for="request-message">Сообщение для магазина <textarea id="request-message" readonly>${escapeHTML(createMessage())}</textarea></label><div class="request-actions"><button class="button button-dark" id="copy-message"><span>Скопировать сообщение</span>${icon('right')}</button><a class="button button-outline" href="https://t.me/Manager_Monaco_smr" target="_blank" rel="noopener noreferrer"><span>Открыть Telegram</span>${icon('arrow')}</a></div><p class="request-note">Скопируй сообщение и вставь его в чат менеджера. Цена, размер и наличие уточняются в переписке. Покупка оформляется лично с магазином.</p></div>`;
    $('#request-size').addEventListener('input', event => {
      size = event.target.value;
      storage.set('monaco-size', size);
      $('#request-message').value = createMessage();
    });
    $('#copy-message').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const label = $('span', button);
      label.textContent = 'Копируем…';
      let success = false;
      try {
        if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText($('#request-message').value); success = true; }
      } catch { /* Try selected-text fallback. */ }
      if (!success) {
        const field = $('#request-message');
        field.focus({preventScroll:true}); field.select();
        try { success = document.execCommand('copy'); } catch { success = false; }
      }
      button.disabled = false;
      button.removeAttribute('aria-busy');
      label.textContent = success ? 'Сообщение скопировано' : 'Скопировать сообщение';
      toast(success ? 'Готово. Вставь сообщение в чат менеджера.' : 'Выдели текст сообщения и скопируй вручную.', !success);
    });
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button,a');
    if (!target) return;
    if (target.dataset.open) openDialog(target.dataset.open, target);
    if (target.hasAttribute('data-close')) closeDialog(target.closest('dialog'));
    if (target.dataset.product) openProduct(target.dataset.product, target);
    if (target.dataset.save) toggleSelection(target.dataset.save);
    if (target.dataset.play) playVideo(target.dataset.play, target);
    if (target.dataset.gallerySrc) {
      $('.detail-photo').src = target.dataset.gallerySrc;
      $$('[data-gallery-src]').forEach(button => button.setAttribute('aria-pressed',String(button===target)));
    }
    if (target.dataset.filter) { filter = target.dataset.filter; visibleLimit = 12; renderProducts({toTop:true}); }
    if (target.dataset.remove) {
      const rows = $$('[data-remove]');
      const index = rows.indexOf(target);
      selected.delete(target.dataset.remove);
      updateSelection(); renderSelection();
      ($$('[data-remove]')[Math.min(index, selected.size - 1)] || $('[data-browse]') || $('#selection-dialog [data-close]'))?.focus({preventScroll:true});
      toast('Вещь убрана из выбранного');
    }
    if (target.hasAttribute('data-browse') || target.dataset.categoryLink) {
      closeDialog(target.closest('dialog'));
      if (target.dataset.categoryLink) { filter = target.dataset.categoryLink; query = ''; visibleLimit = 12; $('#collection-search').value = ''; renderProducts(); }
      document.getElementById('collection').scrollIntoView({behavior:reducedMotion.matches ? 'instant' : 'smooth'});
    }
    if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#')) {
      const hash = target.getAttribute('href');
      const destination = document.getElementById(hash.slice(1));
      if (destination) {
        event.preventDefault();
        closeDialog(target.closest('dialog'));
        // A pinned element has a viewport position; its spacer retains the document position.
        const anchor = destination.parentElement.classList.contains('pin-spacer') ? destination.parentElement : destination;
        const top = anchor.getBoundingClientRect().top + window.scrollY - (hash === '#home' ? 0 : 92);
        history.pushState(null,'',hash);
        if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1;
        destination.focus({preventScroll:true});
        window.scrollTo({top:Math.max(0,top),behavior:reducedMotion.matches ? 'instant' : 'smooth'});
      }
    }
  });

  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'video-dialog') { const player = $('#reel-video'); player.pause(); player.removeAttribute('src'); player.load(); }
      if (!$('dialog[open]')) document.body.classList.remove('dialog-open');
      if (dialog.dataset.switching) { delete dialog.dataset.switching; return; }
      const previous = returnFocus.get(dialog);
      if (previous?.isConnected && !previous.closest('dialog:not([open])')) previous.focus({preventScroll:true});
      else $('.menu-trigger')?.focus({preventScroll:true});
    });
  });

  $('#collection-search').addEventListener('input', event => { query = event.target.value.trim().toLocaleLowerCase('ru'); visibleLimit = 12; renderProducts({toTop:true}); });
  $('#catalog-sort').addEventListener('change', event => { sort = event.target.value; visibleLimit = 12; renderProducts({toTop:true}); });
  $('#show-more').addEventListener('click', () => { const previous = visibleLimit; visibleLimit += 12; renderProducts(); if ($('#show-more').hidden) $$('.product-photo')[previous]?.focus({preventScroll:true}); });
  $('#reset-filters').addEventListener('click', () => { filter = 'all'; query = ''; visibleLimit = 12; $('#collection-search').value = ''; renderProducts({toTop:true}); $('#collection-search').focus({preventScroll:true}); });
  $('#year').textContent = new Date().getFullYear();

  function initHeroSequence() {
    if (navigator.connection?.saveData) return () => {};
    let stopped = false, frames = [], lastFrame, lastWidth, lastHeight;
    const canvas = $('#hero-canvas');
    const context = canvas.getContext('2d', {alpha:false});
    if (!context) return () => {};
    const playhead = {progress:0};
    const dimensions = {width:0,height:0,background:''};
    const measure = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      dimensions.width = Math.round(canvas.parentElement.clientWidth * ratio);
      dimensions.height = Math.round(canvas.parentElement.clientHeight * ratio);
      dimensions.background = getComputedStyle(canvas.parentElement).backgroundColor;
      draw();
    };
    function draw() {
      if (stopped || !dimensions.width || !dimensions.height) return;
      const target = Math.round(playhead.progress * (frames.length - 1));
      let nearest = null;
      for (let distance = 0; distance < frames.length; distance++) {
        nearest = frames[target-distance] || frames[target+distance];
        if (nearest) break;
      }
      if (!nearest) return;
      const {width,height} = dimensions;
      if (lastFrame === nearest && lastWidth === width && lastHeight === height) return;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const scale = Math.max(width/nearest.naturalWidth,height/nearest.naturalHeight);
      const w = nearest.naturalWidth*scale, h = nearest.naturalHeight*scale;
      context.fillStyle = dimensions.background;
      context.fillRect(0,0,width,height);
      context.drawImage(nearest,(width-w)/2,(height-h)*.3,w,h);
      lastFrame = nearest; lastWidth = width; lastHeight = height;
      canvas.hidden = false;
    }
    // Create this pin synchronously so later sections include its scroll spacing.
    const sequence = gsap.to(playhead, {progress:1,ease:'none',onUpdate:draw,scrollTrigger:{
      id:'hero-sequence',trigger:'.hero',start:'top top',
      end:() => `+=${Math.round(Math.max(window.innerHeight * 1.8,1500))}`,
      pin:true,scrub:1.6,anticipatePin:1,refreshPriority:1,onRefresh:measure
    }});
    gsap.set(canvas, {opacity:0});
    measure();
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch('data/hero-sequence.json', {signal:controller.signal});
        if (stopped) return;
        if (!response.ok) throw new Error('Hero sequence unavailable');
        const manifest = await response.json();
        if (!Array.isArray(manifest.frames) || !manifest.frames.length || manifest.frames.length > 100) throw new Error('Invalid hero sequence');
        frames = new Array(manifest.frames.length);
        let next = 0;
        const worker = async () => {
          while (!stopped && next < manifest.frames.length) {
            const index = next++;
            const image = new Image();
            image.src = manifest.frames[index];
            try { await image.decode(); if (!stopped) frames[index] = image; } catch { /* Keep the nearest available frame. */ }
          }
        };
        await Promise.allSettled(Array.from({length:4},worker));
        if (stopped) return;
        if (!frames.some(Boolean)) throw new Error('No decoded hero frames');
        draw();
        gsap.to(canvas, {opacity:1,duration:.9,ease:'power1.out'});
      } catch {
        if (!stopped) {
          sequence.scrollTrigger?.kill(); sequence.kill();
          canvas.hidden = true;
          ScrollTrigger.refresh();
        }
      }
    })();
    window.addEventListener('resize', measure, {passive:true});
    return () => {
      stopped = true; controller.abort(); sequence.scrollTrigger?.kill(); sequence.kill();
      gsap.killTweensOf(canvas); canvas.hidden = true; canvas.style.removeProperty('opacity');
      frames = []; window.removeEventListener('resize',measure);
    };
  }

  function initMotion() {
    cleanupMotion?.();
    const header = $('#site-header');
    const updateHeader = () => header.classList.toggle('is-fixed', window.scrollY > 106);
    window.addEventListener('scroll', updateHeader, {passive:true});
    updateHeader();
    cleanupMotion = () => window.removeEventListener('scroll',updateHeader);
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const entrance = gsap.timeline({defaults:{ease:'power3.out',duration:.9}});
      entrance.from('.hero-image-wrap', {scale:1.035,duration:2.2}, 0)
        .from('.hero h1>span', {y:24,autoAlpha:0,stagger:.1,duration:1.1}, .1)
        .from('.hero-kicker,.hero-cta', {autoAlpha:0,y:16,stagger:.12,duration:.7}, .5);
      gsap.to('.reading-progress i', {scaleX:1,ease:'none',scrollTrigger:{trigger:document.documentElement,start:'top top',end:'max',scrub:true}});
      gsap.to('.footer-tape', {xPercent:-12,ease:'none',scrollTrigger:{trigger:'.site-footer',start:'top bottom',end:'bottom bottom',scrub:1.2}});
    });

    media.add('(min-width: 960px) and (min-height: 740px) and (prefers-reduced-motion: no-preference)', () => initHeroSequence());

    media.add('(min-width: 960px) and (prefers-reduced-motion: no-preference)', () => {
      const track = $('.story-track');
      const stage = $('.story-stage');
      $('.style-story').classList.add('is-scroll-story');
      const slideDistance = () => track.scrollWidth - stage.clientWidth;
      const updateStory = progress => {
        $('.story-current').textContent = String(Math.round(progress * 2) + 1).padStart(2,'0');
        gsap.set('.story-progress i', {scaleX:(1 + progress * 2) / 3});
      };
      gsap.fromTo(track, {x:0}, {x:() => -slideDistance(),ease:'none',onUpdate:function() {
        updateStory(this.progress());
      },scrollTrigger:{id:'style-story',trigger:'.style-story',start:() => `top ${getComputedStyle(document.documentElement).getPropertyValue('--header-height').trim()}`,end:'bottom bottom',scrub:1,invalidateOnRefresh:true,onRefresh:self => updateStory(self.animation?.progress() || 0)}});
      const words = $('.intro-muted');
      gsap.fromTo(words, {color:'var(--color-muted)'}, {color:'var(--color-ink)',ease:'none',scrollTrigger:{trigger:'.intro',start:'top 60%',end:'bottom 65%',scrub:1}});
      return () => { $('.style-story').classList.remove('is-scroll-story'); };
    });

    media.add('(max-width: 959px), (prefers-reduced-motion: reduce)', () => {
      const track = $('.story-track');
      const update = () => {
        const progress = track.scrollWidth > track.clientWidth ? track.scrollLeft / (track.scrollWidth - track.clientWidth) : 0;
        $('.story-current').textContent = String(Math.min(3,Math.round(progress*2) + 1)).padStart(2,'0');
        $('.story-progress i').style.transform = `scaleX(${(1 + progress * 2) / 3})`;
      };
      track.addEventListener('scroll', update, {passive:true});
      update();
      return () => track.removeEventListener('scroll', update);
    });
    // Image boxes reserve their dimensions; loading them does not change the page layout.
    cleanupMotion = () => { media.revert(); window.removeEventListener('scroll',updateHeader); };
    document.fonts.ready.then(() => ScrollTrigger.refresh(true));
  }

  window.addEventListener('pagehide', () => cleanupMotion?.());
  window.addEventListener('pageshow', event => { if (event.persisted) initMotion(); });

  async function init() {
    const loader = $('#load-screen');
    const hasLoaded = sessionStorageSafe();
    if (!hasLoaded && !reducedMotion.matches) loader.hidden = false;
    let completed = 0;
    const progress = () => {
      completed += 1;
      const pct = Math.round(completed / 3 * 100);
      $('#load-percent').textContent = `${pct}%`;
      $('.load-line i').style.transform = `scaleX(${pct / 100})`;
    };
    const heroImage = $('.hero-image');
    const heroReady = heroImage.complete ? Promise.resolve() : new Promise(resolve => { heroImage.addEventListener('load',resolve,{once:true}); heroImage.addEventListener('error',resolve,{once:true}); });
    const content = (async () => {
      try {
        const response = await fetch('data/catalog.json');
        if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.products) || !Array.isArray(data.videos)) throw new Error('Invalid catalog');
        products = data.products; videos = data.videos;
        for (const id of selected) if (!products.some(p => p.id === id)) selected.delete(id);
        $('[data-product-total]').textContent = products.length;
        renderProducts(); updateSelection();
        if ($('#selection-dialog').open) renderSelection();
      } catch {
        $('#product-grid').innerHTML = '<p>Подборка сейчас не загрузилась. <a class="text-link" href="https://t.me/monaco_samara63" target="_blank" rel="noopener noreferrer">Посмотреть вещи в Telegram ↗</a></p>';
        $('#product-grid').setAttribute('role','status');
        $$('[data-filter]').forEach(button => { button.disabled = true; });
        $('#collection-search').disabled = true;
        $('#catalog-sort').disabled = true;
      }
    })();
    const ready = Promise.allSettled([content.then(progress), document.fonts.ready.then(progress), heroReady.then(progress)]);
    await Promise.race([ready,new Promise(resolve => setTimeout(resolve,2200))]);
    await content;
    if (!loader.hidden && window.gsap) {
      await new Promise(resolve => gsap.to(loader, {yPercent:-100,duration:.7,ease:'power3.inOut',onComplete:resolve}));
    }
    loader.hidden = true;
    initMotion();
  }

  function sessionStorageSafe() {
    try { const loaded = sessionStorage.getItem('monaco-intro') === 'seen'; sessionStorage.setItem('monaco-intro','seen'); return loaded; } catch { return true; }
  }

  init();
})();
