(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const local = value => {
    const u = new URL(value, base);
    if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) throw Error('Hibás erőforrás-útvonal');
    return u.href;
  };
  function loadPageImage(img, url, ready, failure) {
    // A hidden lazy image may never request its bytes. Fetch eagerly before
    // revealing it; both gallery thumbnails and the closed-dialog image use this.
    img.loading = 'eager';
    img.decoding = 'async';
    const loaded = () => {if (img.src === url && img.complete && img.naturalWidth > 0) ready();};
    img.onload = loaded;
    img.onerror = () => {if (img.src === url) failure();};
    img.src = url;
    // Cached resources can already be complete when the handler is installed.
    loaded();
  }
  const planDescriptions = {
    garage: 'Dupla garázs, háztartási helyiség és lépcső. A garázs benne van a hirdetett 134 m² összterületben.',
    ground: 'Előszoba, külön WC, amerikai konyhás nappali és terasz – két lakószint közötti lépcsőkapcsolattal.',
    upper: 'Három szoba, fürdő-WC, közlekedő és erkély. A jobb alsó szoba forráson szereplő külső ajtókapcsolata tisztázandó.'
  };
  const tabs = [...document.querySelectorAll('[data-plan]')];
  const setPlan = id => {
    if (!Object.hasOwn(planDescriptions, id)) return;
    tabs.forEach(b => { const selected = b.dataset.plan === id; b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; });
    for (const panel of document.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.id !== `plan-${id}`;
    document.querySelector('#plan-description').textContent = planDescriptions[id];
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => setPlan(b.dataset.plan));
    b.addEventListener('keydown', e => {
      const offset = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!offset && !['Home','End'].includes(e.key)) return;
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + offset + tabs.length) % tabs.length;
      setPlan(tabs[next].dataset.plan); tabs[next].focus();
    });
  });
  const shopping = document.querySelector('#berendezesi-lista');
  document.querySelectorAll('a[href="#berendezesi-lista"]').forEach(link => link.addEventListener('click', () => { shopping.open = true; }));
  if (location.hash === '#berendezesi-lista') shopping.open = true;
  const dialog = document.querySelector('#image-dialog');
  let lastImageButton = null;
  document.querySelector('#close-image').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; lastImageButton?.focus(); });
  dialog.addEventListener('click', e => { if (e.target === dialog && e.clientY > 0) {const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();} });
  const films = [];
  async function addFilm(entry) {
    if (!entry.ready || !entry.src || !entry.title) return;
    const article = document.createElement('article'); article.className = 'film-card';
    const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.muted = true; video.defaultMuted = true; video.src = local(entry.src); video.setAttribute('aria-label', entry.title);
    if (entry.poster) video.poster = local(entry.poster);
    const title = document.createElement('h3'); title.textContent = entry.title;
    const note = document.createElement('p'); note.textContent = entry.description || 'A tervezett épület szemléltető bemutatója, nem helyszíni felvétel.';
    const bottom = document.createElement('div'); bottom.className = 'film-bottom';
    const sound = document.createElement('button'); sound.type = 'button'; sound.textContent = 'Hang be'; sound.setAttribute('aria-pressed','false');
    const syncSound = () => {const audible = !video.muted && video.volume > 0; sound.textContent = audible ? 'Hang ki' : 'Hang be'; sound.setAttribute('aria-pressed',String(audible));};
    sound.addEventListener('click', () => {const silent = video.muted || video.volume === 0; if (silent && video.volume === 0) video.volume = 1; video.muted = !silent; syncSound();});
    video.addEventListener('volumechange',syncSound); syncSound();
    const download = document.createElement('a'); download.href = local(entry.src); download.download = ''; download.textContent = 'Film letöltése ↓';
    video.addEventListener('play', () => films.forEach(other => {if (other !== video) other.pause();}));
    films.push(video); bottom.append(sound,download); article.append(video,title,note,bottom); document.querySelector('#film-list').append(article);
    document.querySelector('#filmek').hidden = false;
  }
  fetch(new URL('site-config.json', base), {cache:'no-cache'}).then(r => {if (!r.ok) throw Error('Az oldal adatainak betöltése nem sikerült'); return r.json();}).then(config => {
    if (config.property_id !== 'pecs-donatus-134') throw Error('Eltérő ingatlan adatjegyzéke');
    for (const entry of config.images || []) {
      if (!entry.ready || !entry.src || !entry.id) continue;
      for (const img of document.querySelectorAll('[data-image-key]')) {
        if (img.dataset.imageKey !== entry.id) continue;
        loadPageImage(img, local(entry.src), () => {
          img.hidden = false; document.querySelector(`[data-placeholder-for="${img.id}"]`)?.setAttribute('hidden','');
          const button = img.closest('[data-open-image]'); if (button) button.disabled = false;
        }, () => {img.hidden = true; const button = img.closest('[data-open-image]'); if (button) button.disabled = true; const note = document.querySelector(`[data-placeholder-for="${img.id}"]`); if (note) {note.hidden = false; note.textContent = 'A kép most nem tölthető be.';} });
      }
      for (const button of document.querySelectorAll('[data-open-image]')) {
        if (button.dataset.openImage !== entry.id) continue;
        button.addEventListener('click', () => {
          lastImageButton = button; const image = document.querySelector('#dialog-image'); const imageStatus = document.querySelector('#dialog-image-status');
          image.hidden = true; image.alt = button.querySelector('img').alt; imageStatus.hidden = false; imageStatus.textContent = 'A kép betöltése…';
          document.querySelector('#image-dialog-title').textContent = entry.caption; document.querySelector('#download-image').href = local(entry.src); document.body.style.overflow = 'hidden'; dialog.showModal();
          loadPageImage(image, local(entry.src), () => {image.hidden = false; imageStatus.hidden = true;}, () => {image.hidden = true; imageStatus.hidden = false; imageStatus.textContent = 'A kép most nem tölthető be. Zárd be az ablakot, és próbáld újra.';});
        });
      }
    }
    for (const entry of config.films || []) addFilm(entry).catch(() => {});
    const downloads = document.querySelector('#model-downloads');
    if (config.model?.ready) {
      document.querySelector('#download-glb').href = local('export.glb');
      document.querySelector('#download-blend').href = local('donatus-134.blend');
      downloads.hidden = false;
    }
    if (config.model?.ready) import('./viewer.js?v=c36c78a8232d04ca').then(module => module.initializeViewer(local(config.model.config))).catch(() => {document.querySelector('#model-cover-message').textContent = 'A térmodell most nem tölthető be. Próbáld újra később.';});
  }).catch(() => { document.querySelector('#model-status').textContent = 'Az oldal adatai most nem érhetők el. Az összefoglaló és a vázlatok továbbra is olvashatók.'; });
})();
