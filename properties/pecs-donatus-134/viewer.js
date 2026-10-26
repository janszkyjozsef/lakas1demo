import * as THREE from 'three';
import {OrbitControls} from './vendor/vendor__examples__jsm__controls__OrbitControls.js';
import {GLTFLoader} from './vendor/vendor__examples__jsm__loaders__GLTFLoader.js';

const PROPERTY_ID = 'pecs-donatus-134';
const LEVELS = ['all','garage','ground','upper'];
const labels = {all:'Teljes térséma',garage:'Garázsszint',ground:'Földszint',upper:'Emelet'};
// Fit actual visible world-space vertices in the authored viewing direction.
// Only the camera changes: source geometry, visibility and close-view targets do not.
function fitVisiblePoints(points, direction, up, aspect, fov, fill = .82) {
  if (!points.length || !(aspect > 0)) return null;
  const back = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up,back).normalize();
  if (right.lengthSq() < .5) right.set(1,0,0);
  const vertical = new THREE.Vector3().crossVectors(back,right).normalize();
  const projected = points.map(p => [p.dot(right),p.dot(vertical),p.dot(back)]);
  const bounds = [[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
  for (const p of projected) for (let i=0;i<3;i++) {bounds[i][0]=Math.min(bounds[i][0],p[i]);bounds[i][1]=Math.max(bounds[i][1],p[i]);}
  let cx=(bounds[0][0]+bounds[0][1])/2,cy=(bounds[1][0]+bounds[1][1])/2;
  const cz=(bounds[2][0]+bounds[2][1])/2;
  const tanV=Math.tan(THREE.MathUtils.degToRad(fov)/2),tanH=tanV*aspect;
  let distance=0,minX,maxX,minY,maxY;
  // Centre the perspective projection, then solve all four safe-frustum inequalities.
  for (let iteration=0;iteration<12;iteration++) {
    distance=0;
    for (const [x,y,z] of projected) distance=Math.max(distance,z-cz+.15,z-cz+Math.abs(x-cx)/(tanH*fill),z-cz+Math.abs(y-cy)/(tanV*fill));
    minX=minY=Infinity;maxX=maxY=-Infinity;
    for (const [x,y,z] of projected) {
      const depth=distance-(z-cz),px=(x-cx)/(depth*tanH),py=(y-cy)/(depth*tanV);
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    }
    if (iteration<11) {cx+=(minX+maxX)*.5*distance*tanH;cy+=(minY+maxY)*.5*distance*tanV;}
  }
  const target=right.clone().multiplyScalar(cx).addScaledVector(vertical,cy).addScaledVector(back,cz);
  return {target,position:target.clone().addScaledVector(back,distance),fillX:(maxX-minX)/2,fillY:(maxY-minY)/2,pointCount:points.length};
}

// Supersample large desktop canvases, bounded by render-target area and device limits.
function chooseRenderRatio(width,height,nativeRatio,desktop,maxSize = 8192) {
  // Even DPR1 mobile gets fine edge coverage; the pixel budget remains the hard cap.
  const desired = 2;
  const budget = desktop ? 4500000 : 2400000;
  return Math.max(1,Math.min(desired,Math.sqrt(budget/(width*height)),maxSize/width,maxSize/height));
}

// Native fullscreen when available, otherwise an accessible viewport-only enlargement.
function configureExpandedView(stage,button,canvas,onResize) {
  let viewport = false,placeholder = null,saved = null,returnFocus = null,busy = false;
  const expanded = () => viewport || document.fullscreenElement === stage;
  function sync() {
    const active = expanded();
    button.setAttribute('aria-pressed',String(active));
    const label = active ? 'Kilépés a nagyított nézetből (Esc)' : 'Modell nagyítása';
    button.setAttribute('aria-label',label); button.title = label; button.textContent = active ? '×' : '⛶';
    stage.dataset.fullscreenMode = viewport ? 'viewport' : (active ? 'native' : 'none');
    requestAnimationFrame(onResize);
  }
  function restoreFocus() {const node = returnFocus?.isConnected ? returnFocus : button;node.focus({preventScroll:true});returnFocus = null;}
  function openViewport() {
    if (viewport) return;
    const body = document.body,html = document.documentElement;
    saved = {bodyStyle:body.style.cssText,overflow:html.style.overflow,scrollBehavior:html.style.scrollBehavior,x:window.scrollX,y:window.scrollY,role:stage.getAttribute('role'),modal:stage.getAttribute('aria-modal'),inert:[]};
    placeholder = document.createComment('model viewport return point');stage.parentNode.insertBefore(placeholder,stage);body.append(stage);
    for (const child of body.children) if (child !== stage) {saved.inert.push([child,child.inert]);child.inert = true;}
    body.style.position = 'fixed';body.style.top = `${-saved.y}px`;body.style.left = `${-saved.x}px`;body.style.width = '100%';body.style.overflow = 'hidden';html.style.overflow = 'hidden';
    viewport = true;stage.classList.add('is-viewport-expanded');stage.setAttribute('role','dialog');stage.setAttribute('aria-modal','true');sync();button.focus({preventScroll:true});
  }
  function closeViewport() {
    if (!viewport) return;
    viewport = false;stage.classList.remove('is-viewport-expanded');
    if (placeholder?.parentNode) {placeholder.parentNode.insertBefore(stage,placeholder);placeholder.remove();}
    for (const [node,inert] of saved.inert) node.inert = inert;
    for (const [name,value] of [['role',saved.role],['aria-modal',saved.modal]]) if (value === null) stage.removeAttribute(name);else stage.setAttribute(name,value);
    document.body.style.cssText = saved.bodyStyle;document.documentElement.style.overflow = saved.overflow;
    document.documentElement.style.scrollBehavior = 'auto';window.scrollTo(saved.x,saved.y);document.documentElement.style.scrollBehavior = saved.scrollBehavior;
    saved = null;placeholder = null;sync();restoreFocus();
  }
  button.addEventListener('click',async () => {
    if (busy) return;
    if (viewport) {closeViewport();return;}
    if (document.fullscreenElement === stage) {try {await document.exitFullscreen();} catch {} sync();return;}
    returnFocus = document.activeElement;busy = true;
    try {
      if (typeof stage.requestFullscreen !== 'function') openViewport();
      else {try {await stage.requestFullscreen();} catch {openViewport();} if (!expanded()) openViewport();}
    } finally {busy = false;sync();}
  });
  document.addEventListener('fullscreenchange',() => {sync();if (!expanded() && returnFocus) restoreFocus();});
  document.addEventListener('keydown',event => {
    if (!viewport) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();closeViewport();return;}
    if (event.key === 'Tab') {
      const items = [...stage.querySelectorAll('button:not([disabled]),canvas[tabindex],a[href],select:not([disabled])')].filter(node => !node.hidden);
      if (!items.length) return;
      const first = items[0],last = items[items.length-1];
      if (event.shiftKey && (document.activeElement === first || !stage.contains(document.activeElement))) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !stage.contains(document.activeElement))) {event.preventDefault();first.focus();}
    }
  });
  sync();
}

export async function initializeViewer(configURL) {
  const canvas = document.querySelector('#model-canvas');
  const stage = document.querySelector('#model-stage');
  const status = document.querySelector('#model-status');
  const cover = document.querySelector('#model-cover');
  const coverMessage = document.querySelector('#model-cover-message');
  const loadButton = document.querySelector('#load-model');
  const base = new URL('.', document.baseURI);
  const local = path => {
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw Error('Érvénytelen modellútvonal');
    return url.href;
  };
  const message = (text, state = 'info') => {status.textContent = text; status.dataset.state = state;};
  const response = await fetch(configURL, {cache:'no-store'});
  if (!response.ok) throw Error('A modell adatjegyzéke nem tölthető be');
  const config = await response.json();
  if (config.property_id !== PROPERTY_ID || config.ready === false) throw Error('A modell nem ellenőrzött vagy eltérő ingatlanhoz tartozik');
  const modelEntry = config.model;
  const parts = modelEntry?.files || modelEntry?.parts;
  if (!Array.isArray(parts) || !parts.length || !Number.isSafeInteger(modelEntry.bytes) || !/^[a-f0-9]{64}$/.test(modelEntry.sha256 || '')) throw Error('Hiányos modelljegyzék');
  const views = (config.views || []).filter(v => LEVELS.includes(v.level_id) && [v.p,v.t].every(a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)) && Number.isFinite(v.fov) && v.fov > 5 && v.fov < 120);
  if (!LEVELS.every(level => views.some(v => v.level_id === level))) throw Error('Hiányos szintenkénti kamerajegyzék');
  const state = {level:'ground',walls:true,roof:false,furnishing:false,view:views.find(v => v.level_id === 'ground').id};
  let renderer, scene, camera, controls, model, entries = [], frame = 0, loaded = false, hasFurniture = false;
  let resizeViewer = () => {};
  const select = document.querySelector('#model-view');
  const stageSize = () => ({width:Math.max(1,stage.clientWidth),height:Math.max(1,stage.clientHeight)});
  function schedule() {if (!frame && loaded) frame = requestAnimationFrame(draw);}
  function draw() {frame = 0; const moving = controls.update(); renderer.render(scene,camera); if (moving) schedule();}
  function lens(view) {
    const size = stageSize(); camera.aspect = size.width / size.height;
    // Keep the authored vertical lens; fit distance rather than widening a portrait lens.
    camera.fov = view.fov; camera.updateProjectionMatrix();
  }
  function currentView() {return views.find(v => v.id === state.view) || views.find(v => v.level_id === state.level);}
  function visiblePoints() {
    const points = [], vertex = new THREE.Vector3(); model.updateMatrixWorld(true);
    model.traverseVisible(object => {
      if (!object.isMesh) return;
      const position = object.geometry?.attributes.position; if (!position) return;
      for (let i = 0; i < position.count; i++) points.push(vertex.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld).clone());
    });
    return points;
  }
  function fitOverview(view, direction) {
    const fit = fitVisiblePoints(visiblePoints(),direction,camera.up,camera.aspect,camera.fov,.82);
    if (!fit) return;
    controls.target.copy(fit.target); camera.position.copy(fit.position);
    stage.dataset.fitFillX = fit.fillX.toFixed(4); stage.dataset.fitFillY = fit.fillY.toFixed(4);
    stage.dataset.fitVisibleVertices = String(fit.pointCount); stage.dataset.fitMode = 'visible-mesh-82';
  }
  function applyCamera(preserveDirection = false) {
    const v = currentView();
    const offset = camera.position.clone().sub(controls.target);
    const direction = preserveDirection && offset.lengthSq() > .001 ? offset.normalize() : new THREE.Vector3().fromArray(v.p).sub(new THREE.Vector3().fromArray(v.t)).normalize();
    lens(v);
    if (v.id === 'kitchen_detail' || v.framing === 'detail') {
      // Detail views keep their authored near camera and target on every aspect ratio.
      if (!preserveDirection) {camera.position.fromArray(v.p); controls.target.fromArray(v.t);}
      stage.dataset.fitMode = 'authored-detail';
    } else fitOverview(v,direction);
    controls.update(); schedule();
  }
  function syncUI() {
    document.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.level === state.level)));
    for (const [key,id] of [['walls','toggle-walls'],['roof','toggle-roof'],['furnishing','toggle-furnishing']]) {
      const button = document.getElementById(id); button.setAttribute('aria-pressed',String(state[key]));
      button.querySelector('.toggle-state').textContent = key === 'furnishing' ? (state[key] ? 'Bekapcsolva' : 'Kikapcsolva') : (state[key] ? 'Látható' : 'Rejtve');
    }
    stage.dataset.level = state.level; stage.dataset.wallsVisible = String(state.walls); stage.dataset.roofVisible = String(state.roof); stage.dataset.furnishingVisible = String(state.furnishing);
  }
  function updateSelect() {
    select.replaceChildren();
    for (const view of views.filter(v => v.level_id === state.level)) {const option = document.createElement('option'); option.value = view.id; option.textContent = view.name || labels[state.level]; select.append(option);}
    select.value = state.view;
  }
  function composeVisibility() {
    for (const entry of entries) {
      const levelVisible = state.level === 'all' || (entry.levelLinks ? entry.levelLinks.includes(state.level) : !entry.level || entry.level === state.level);
      entry.object.visible = entry.baseline && levelVisible && (!entry.wall || state.walls) && (!entry.roof || state.roof) && (!entry.concept || state.furnishing);
    }
    syncUI(); schedule();
  }
  function readSemantics(root) {
    const foundLevels = new Set(); let propertyTagged = false;
    root.traverse(object => {
      const chain = []; for (let n = object; n && n !== scene; n = n.parent) chain.push(n.userData || {});
      for (const data of chain) {
        if (data.property_id && data.property_id !== PROPERTY_ID) throw Error('Eltérő ingatlanazonosító a modellben');
        if (data.property_id === PROPERTY_ID) propertyTagged = true;
      }
      const ownLevel = chain.find(data => data.level_id)?.level_id || null;
      const levelLinks = chain.find(data => Array.isArray(data.level_links))?.level_links || null;
      if (levelLinks && (!levelLinks.length || levelLinks.some(level => !['garage','ground','upper'].includes(level)))) throw Error('Érvénytelen lépcső-szintkapcsolat');
      if (ownLevel) {if (!LEVELS.includes(ownLevel) || ownLevel === 'all') throw Error('Érvénytelen szintcímke'); foundLevels.add(ownLevel);}
      const group = key => chain.some(data => data.otthoniv_visibility === key || data.visibility_group === key);
      const concept = chain.some(data => data.styling_variant === 'concept');
      if (concept) hasFurniture = true;
      entries.push({object,baseline:object.visible,level:ownLevel,levelLinks,wall:group('walls'),roof:group('roof'),concept});
      if (object.isMesh) {object.castShadow = true; object.receiveShadow = true;}
    });
    if (!propertyTagged || !['garage','ground','upper'].every(level => foundLevels.has(level))) throw Error('Hiányos modellazonosítás vagy szintcímkézés');
  }
  async function load() {
    loadButton.disabled = true; coverMessage.textContent = 'A térmodell betöltése…';
    let objectURL;
    try {
      const buffers = [];
      for (let i = 0; i < parts.length; i++) {
        coverMessage.textContent = `A térmodell előkészítése: ${i+1} / ${parts.length}.`;
        const part = await fetch(local(parts[i]),{cache:'no-store'}); if (!part.ok) throw Error('Modellfájl nem érhető el'); buffers.push(await part.arrayBuffer());
      }
      const blob = new Blob(buffers,{type:'model/gltf-binary'});
      if (blob.size !== modelEntry.bytes || !crypto.subtle) throw Error('Hiányos modell vagy nem támogatott ellenőrzés');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2,'0')).join('');
      if (hash !== modelEntry.sha256) throw Error('A modell ellenőrzőösszege nem egyezik');
      renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'default'});
      renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#e9ece2');
      camera = new THREE.PerspectiveCamera(45,1,0.05,300);
      controls = new OrbitControls(camera,canvas); controls.enableDamping = true; controls.dampingFactor = .085; controls.minDistance = 1.3; controls.maxDistance = 100; controls.maxPolarAngle = Math.PI * .94;
      controls.addEventListener('change',schedule);
      scene.add(new THREE.HemisphereLight(0xfffbed,0x899180,2.3));
      const sun = new THREE.DirectionalLight(0xfff9e8,3.2); sun.position.set(14,24,18); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22; sun.shadow.camera.near = .5; sun.shadow.camera.far = 90; sun.shadow.normalBias = .035; scene.add(sun);
      objectURL = URL.createObjectURL(blob); const gltf = await new GLTFLoader().loadAsync(objectURL); model = gltf.scene; scene.add(model); readSemantics(model);
      loaded = true; stage.dataset.modelSha256 = hash; stage.dataset.ready = 'true';
      let previousWidth = 0, previousHeight = 0, previousRatio = 0;
      const resize = () => {
        if (!loaded || stage.clientWidth < 1 || stage.clientHeight < 1) return;
        const size = stageSize();
        const desktop = matchMedia('(min-width: 900px)').matches && size.width >= 700;
        const ratio = chooseRenderRatio(size.width,size.height,devicePixelRatio || 1,desktop,renderer.capabilities.maxTextureSize);
        if (size.width === previousWidth && size.height === previousHeight && ratio === previousRatio) return;
        previousWidth = size.width; previousHeight = size.height; previousRatio = ratio;
        renderer.setPixelRatio(ratio); renderer.setSize(size.width,size.height,false);
        stage.dataset.renderProfile = 'bounded-ssaa-v2-mobile'; stage.dataset.renderRatio = ratio.toFixed(4);
        stage.dataset.renderBuffer = `${canvas.width}x${canvas.height}`;
        stage.dataset.shadowProfile = 'baseline-all-mesh-casting';
        applyCamera(true);
      };
      resizeViewer = resize; new ResizeObserver(resize).observe(stage); resize(); updateSelect(); composeVisibility(); applyCamera();
      document.querySelectorAll('[data-level],#model-view,#toggle-walls,#toggle-roof,#model-reset,#model-zoom-in,#model-zoom-out,#model-fullscreen').forEach(b => b.disabled = false);
      document.querySelector('#toggle-furnishing').disabled = !hasFurniture;
      cover.hidden = true; message('A tervmodell betöltődött. Válassz szintet, vagy forgasd a képet.');
    } catch (error) {
      loaded = false; stage.dataset.ready = 'false'; loadButton.disabled = false; loadButton.textContent = 'Újrapróbálás'; coverMessage.textContent = 'A modell most nem tölthető be. A tervvázlatok lent továbbra is megnyithatók.';
      message(error.message || 'A modell betöltése sikertelen.','error'); controls?.dispose(); renderer?.dispose(); entries = [];
    } finally {if (objectURL) URL.revokeObjectURL(objectURL);}
  }
  document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click',() => {
    if (!loaded) return; state.level = button.dataset.level; state.view = views.find(v => v.level_id === state.level).id; updateSelect(); composeVisibility(); applyCamera();
  }));
  select.addEventListener('change',() => {if (loaded) {state.view = select.value; applyCamera(); syncUI();}});
  for (const key of ['walls','roof','furnishing']) document.querySelector(`#toggle-${key}`).addEventListener('click',() => {if (loaded) {state[key] = !state[key]; composeVisibility();}});
  document.querySelector('#model-reset').addEventListener('click',() => {if (loaded) applyCamera();});
  for (const [id,factor] of [['model-zoom-in',.83],['model-zoom-out',1.2]]) document.getElementById(id).addEventListener('click',() => {
    if (!loaded) return; const offset = camera.position.clone().sub(controls.target); const next = THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance); offset.setLength(next); camera.position.copy(controls.target).add(offset); controls.update(); schedule();
  });
  configureExpandedView(stage,document.querySelector('#model-fullscreen'),canvas,() => {resizeViewer();schedule();});
  canvas.addEventListener('webglcontextlost',event => {event.preventDefault(); message('A 3D-megjelenítés átmenetileg szünetel.','error');});
  canvas.addEventListener('webglcontextrestored',() => {message('A 3D-megjelenítés helyreállt.'); schedule();});
  loadButton.addEventListener('click',load); loadButton.hidden = false; coverMessage.textContent = 'Nyisd meg a tervalapú modellt, és fedezd fel külön a három szintet.'; message('A modell megnyitásra kész.');
}
