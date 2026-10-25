const gallery = document.querySelector('#gallery');
const dialog = document.querySelector('#lightbox');
const image = document.querySelector('#lightbox-img');
let photos = [], filtered = [], current = 0, opener = null, request = 0;

function showPhoto(index) {
  if (!filtered.length) return;
  current = (index + filtered.length) % filtered.length;
  const photo = filtered[current];
  const thisRequest = ++request;
  image.src = photo.file;
  image.alt = `${photo.label} — MI-vel retusált hirdetésfotó`;
  document.querySelector('#lightbox-caption').textContent = photo.label;
  document.querySelector('#lightbox-counter').textContent = `${current + 1} / ${filtered.length}`;
  document.querySelector('#original-link').href = photo.original;
  document.querySelector('#full-photo-link').href = photo.file;
  document.querySelector('.lightbox-disclosure').textContent = photo.disclosure;
  image.onerror = () => { if (thisRequest === request) document.querySelector('#lightbox-caption').textContent = `${photo.label} — a kép nem töltődött be`; };
  document.querySelector('#lightbox-stage').scrollTo(0, 0);
}
function openPhoto(index, button) {
  opener = button;
  showPhoto(index);
  dialog.showModal();
  document.querySelector('#close-lightbox').focus();
}
function setFilter(group) {
  filtered = photos.filter(p => group === 'all' || p.group === group);
  for (const button of gallery.querySelectorAll('[data-photo]')) {
    const photo = photos.find(p => p.index === Number(button.dataset.photo));
    button.hidden = !filtered.includes(photo);
  }
  for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === group));
}
document.querySelector('#close-lightbox').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => opener?.focus());
document.querySelector('#prev-photo').addEventListener('click', () => showPhoto(current - 1));
document.querySelector('#next-photo').addEventListener('click', () => showPhoto(current + 1));
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(current - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(current + 1); }
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
let startX = 0, startY = 0;
image.addEventListener('touchstart', event => { startX = event.changedTouches[0].clientX; startY = event.changedTouches[0].clientY; }, {passive:true});
image.addEventListener('touchend', event => {
  const dx = event.changedTouches[0].clientX - startX, dy = event.changedTouches[0].clientY - startY;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) showPhoto(current + (dx < 0 ? 1 : -1));
}, {passive:true});
try {
  const response = await fetch('photos.json');
  if (!response.ok) throw new Error('Hiányzik a képjegyzék');
  photos = await response.json();
  filtered = [...photos];
  for (const button of gallery.querySelectorAll('[data-photo]')) {
    button.addEventListener('click', () => {
      const index = filtered.findIndex(p => p.index === Number(button.dataset.photo));
      if (index >= 0) openPhoto(index, button);
    });
  }
  for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => setFilter(button.dataset.filter));
} catch (error) {
  const note = document.createElement('p'); note.className = 'error-message';
  note.textContent = 'A nagyított galéria nem érhető el. Az eredeti képek a forrásoknál külön megnyithatók.';
  gallery.after(note);
  for (const button of gallery.querySelectorAll('button')) button.disabled = true;
}
