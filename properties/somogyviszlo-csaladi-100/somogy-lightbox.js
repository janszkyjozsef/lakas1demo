// Full-resolution gallery detail controls. The model and shared viewer stay unchanged.
const dialog = document.getElementById('lightbox');
const image = document.getElementById('lightbox-img');
const stage = document.getElementById('lightbox-stage');
const canvas = document.getElementById('lightbox-canvas');
const plus = document.getElementById('photo-zoom-in');
const minus = document.getElementById('photo-zoom-out');
const fit = document.getElementById('photo-zoom-fit');
const status = document.getElementById('photo-zoom-status');

if (dialog && image && stage && canvas && plus && minus && fit && status) {
  const steps = [1, 1.5, 2, 3, 4];
  let step = 0;
  let drag = null;
  function layout(reset = false) {
    if (!dialog.open || !image.naturalWidth || !stage.clientWidth || !stage.clientHeight) return;
    const old = image.getBoundingClientRect();
    const area = stage.getBoundingClientRect();
    const focusX = old.width ? Math.max(0, Math.min(1, (area.left + stage.clientWidth / 2 - old.left) / old.width)) : .5;
    const focusY = old.height ? Math.max(0, Math.min(1, (area.top + stage.clientHeight / 2 - old.top) / old.height)) : .5;
    const ratio = Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
    const width = image.naturalWidth * ratio * steps[step];
    const height = image.naturalHeight * ratio * steps[step];
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    canvas.style.width = `${Math.max(stage.clientWidth, width)}px`;
    canvas.style.height = `${Math.max(stage.clientHeight, height)}px`;
    if (reset) {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    } else {
      const current = image.getBoundingClientRect();
      stage.scrollLeft += current.left + focusX * width - area.left - stage.clientWidth / 2;
      stage.scrollTop += current.top + focusY * height - area.top - stage.clientHeight / 2;
    }
    plus.disabled = step === steps.length - 1;
    minus.disabled = step === 0;
    status.textContent = `${Math.round(steps[step] * 100)}%`;
    stage.dataset.zoom = String(steps[step]);
    stage.classList.toggle('photo-can-pan', step > 0);
  }
  function reset() { step = 0; drag = null; layout(true); }
  function change(delta) { step = Math.max(0, Math.min(steps.length - 1, step + delta)); layout(); }
  plus.addEventListener('click', () => change(1));
  minus.addEventListener('click', () => change(-1));
  fit.addEventListener('click', reset);
  image.draggable = false;
  image.addEventListener('load', reset);
  dialog.addEventListener('close', reset);
  new MutationObserver(records => {
    if (records.some(r => r.attributeName === 'open') && dialog.open) reset();
  }).observe(dialog, {attributes: true, attributeFilter: ['open']});
  new MutationObserver(reset).observe(image, {attributes: true, attributeFilter: ['src']});
  let stageSize = '';
  new ResizeObserver(() => {
    const rect = stage.getBoundingClientRect();
    const size = `${rect.width}:${rect.height}`;
    if (size !== stageSize) { stageSize = size; layout(true); }
  }).observe(stage, {box: 'border-box'});
  dialog.addEventListener('keydown', event => {
    if (['+', '=', 'Add'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); change(1); }
    else if (['-', '_', 'Subtract'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); change(-1); }
    else if (event.key === '0') { event.preventDefault(); event.stopPropagation(); reset(); }
  });
  stage.addEventListener('keydown', event => {
    if (step > 0 && event.key.startsWith('Arrow')) event.stopPropagation();
  });
  // A zoomed image should pan instead of triggering the retained photo-swipe navigation.
  for (const type of ['touchstart', 'touchend']) {
    stage.addEventListener(type, event => { if (step > 0) event.stopPropagation(); }, {capture: true, passive: true});
  }
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || step === 0) return;
    event.preventDefault();
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop};
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    stage.scrollLeft = drag.left + drag.x - event.clientX;
    stage.scrollTop = drag.top + drag.y - event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, () => { drag = null; });
  if (dialog.open && image.complete) reset();
}
