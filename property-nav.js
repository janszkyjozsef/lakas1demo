(() => {
  const nav = document.querySelector('.site-browser[data-property]');
  if (!nav) return;
  const script = document.currentScript;
  const root = new URL('.', script.src);
  const localURL = path => {
    const u = new URL(path, root);
    if (u.origin !== root.origin || !u.pathname.startsWith(root.pathname)) throw Error('Invalid catalogue path');
    return u.href;
  };
  fetch(new URL('catalog.json', root), {cache:'no-cache'})
    .then(r => {if (!r.ok) throw Error('Catalogue unavailable'); return r.json();})
    .then(data => {
      const list = data.properties;
      if (!Array.isArray(list) || !list.length) return;
      const index = list.findIndex(p => p.id === nav.dataset.property);
      if (index < 0) return;
      const menu = document.createElement('ul');
      menu.className = 'site-browser-menu';
      list.forEach(p => {
        const li = document.createElement('li'), a = document.createElement('a');
        a.href = localURL(p.url); a.textContent = p.title + ' · ' + p.location;
        if (p.id === nav.dataset.property) a.setAttribute('aria-current','page');
        li.append(a); menu.append(li);
      });
      nav.querySelector('.site-browser-menu').replaceWith(menu);
      nav.querySelector('.site-browser-count').textContent = `OTTHONOK · ${index+1} / ${list.length}`;
      for (const [rel, offset] of [['prev',-1],['next',1]]) {
        const p = list[(index + offset + list.length) % list.length];
        const a = nav.querySelector(`[rel="${rel}"]`);
        a.href = localURL(p.url);
        a.setAttribute('aria-label', (rel === 'prev' ? 'Előző otthon: ' : 'Következő otthon: ') + p.title);
      }
    }).catch(() => { /* The generated HTML remains a complete navigation fallback. */ });
})();
