import {createVisibilityController} from './visibility.mjs';
import {createStylingController} from './styling.mjs';

const $ = selector => document.querySelector(selector);
const stage = $('#viewport'), status = $('#model-status'), start = $('#start-model');
const vendorBase = new URL('../../shared/', import.meta.url);
let config, THREE, renderer, composer, scene, camera, controls, model, visibility, modelBlob;
let activeView = 0, ready = false, loading = false, pendingFrame = false, inViewport = true;
let showCeiling = false, roofRoots = [], roofNames = new Set();
let bounds, resizeObserver;
let stylingController, requestedStyling = 'original';

function invalidate() {
  if (pendingFrame || !ready || !inViewport || document.hidden) return;
  pendingFrame = true;
  requestAnimationFrame(() => {
    pendingFrame = false;
    if (ready && renderer) { if(composer)composer.render(); else renderer.render(scene, camera); }
  });
}
function setStatus(text) { status.textContent = text; }
function snapshotToUI(snapshot) {
  stage.dataset.wallMode = snapshot.wallMode;
  stage.dataset.ceilingVisible = String(showCeiling);
  const wallsHidden=snapshot.wallMode==='hidden';
  $('#toggle-walls').textContent=wallsHidden?'Falak mutatása':'Falak elrejtése';
  $('#toggle-walls').setAttribute('aria-pressed',String(wallsHidden));
  applyStyling(snapshot);
  updateDescription();
  invalidate();
}
function applyStyling(snapshot = visibility?.snapshot()) {
  const selected = stylingController?.ids().includes(requestedStyling) ? requestedStyling : 'original';
  stylingController?.select(selected,snapshot);
  stage.dataset.furnishingVariant=selected;
  if(ready)invalidate();
}
document.addEventListener('otthoniv:furnishing-select',event=>{
  const id=event.detail?.id;
  if(typeof id!=='string')return;
  requestedStyling=id;
  if(ready){
    applyStyling();
    if(id!=='original'&&!stylingController.ids().includes(id))document.dispatchEvent(new CustomEvent('otthoniv:furnishing-unavailable'));
    else if(id!=='original'){
      const index=config.views.findIndex(view=>view.id===(config.furnishing_view_id||'room'));
      if(index>=0)chooseView(index);
    }
  }
});
function updateDescription() {
  if (!config) return;
  const view = config.views[activeView];
  $('#view-title').textContent = view.name;
  const mode = visibility?.snapshot().wallMode || 'shown';
  const walls = {shown:'A falak láthatók.', hidden:'A falak és hozzájuk tartozó elemek elrejtve.', auto:'A falak a választott nézet kivágását követik.'}[mode];
  $('#view-description').textContent = `${view.description || ''} ${walls} A mennyezet ${showCeiling ? 'látható' : 'elrejtve'}.`.trim();
}
function applyVisibility() {
  const view = config.views[activeView];
  const hideNodes = (view.hide_nodes || []).filter(name => !roofNames.has(name));
  if (!showCeiling) hideNodes.push(...roofRoots);
  visibility.setView({hide_levels:view.hide_levels || [], hide_nodes:[...new Set(hideNodes)]});
}
function setCameraForView() {
  const view = config.views[activeView];
  camera.position.fromArray(view.p);
  controls.target.fromArray(view.t);
  const aspect = stage.clientWidth / Math.max(stage.clientHeight, 1);
  const baseFov = view.fov || 45;
  camera.fov = Math.min(88, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * Math.max(1, (view.reference_aspect || 1.45) / aspect))));
  camera.aspect = aspect; camera.updateProjectionMatrix();
  if (view.overview || activeView === 0) {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const direction = camera.position.clone().sub(controls.target).normalize();
    const vertical = THREE.MathUtils.degToRad(camera.fov), horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const distance = sphere.radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.08;
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
  }
  controls.update();
}
function chooseView(index) {
  if (!ready) return;
  activeView = index;
  applyVisibility();
  setCameraForView();
  $('#view-select').value=String(index);
  stage.dataset.view = config.views[index].id;
  updateDescription(); invalidate();
}
function resize() {
  if (!renderer || !stage.clientWidth || !stage.clientHeight) return;
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  composer?.setSize(stage.clientWidth, stage.clientHeight);
  camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
  if (ready) setCameraForView();
  invalidate();
}
async function loadModel() {
  if (modelBlob) return modelBlob;
  const parts = [];
  for (const [index, file] of config.model.files.entries()) {
    setStatus(`A modell betöltése: ${index + 1} / ${config.model.files.length}. A nagy felbontású részletek előkészítése…`);
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Modellrész nem érhető el (${response.status})`);
    parts.push(await response.arrayBuffer());
  }
  const blob = new Blob(parts, {type:'model/gltf-binary'});
  if (blob.size !== config.model.bytes) throw new Error('Hiányos modelladat');
  if (!globalThis.crypto?.subtle) throw new Error('A modell ellenőrzéséhez HTTPS vagy helyi kiszolgáló szükséges');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== config.model.sha256) throw new Error('A modell ellenőrzőösszege eltér');
  modelBlob = blob;
  stage.dataset.modelSha256 = hash;
  return blob;
}
function readSemantics(root) {
  const candidates = [];
  root.traverse(node => { if (node.userData.property_id) candidates.push(node); });
  if (!candidates.length || candidates.some(node => node.userData.property_id !== config.property_id)) throw new Error('A modell ingatlanazonosítója hiányzik vagy eltér');
  // The loader's technical scene wrapper may not carry the Blender property root's extras.
  if (!root.userData.property_id) root.userData.property_id = config.property_id;
  function visit(node, inherited = 'permanent') {
    const group = node.userData.otthoniv_visibility || inherited;
    if (group === 'roof') {
      if (!node.name) throw new Error('Névtelen mennyezeti elem');
      roofNames.add(node.name);
      if (inherited !== 'roof') roofRoots.push(node.name);
    }
    for (const child of node.children) visit(child, group);
  }
  visit(root);
  if (!roofRoots.length) throw new Error('Hiányzik a külön mennyezetcsoport');
  stylingController=createStylingController(root,{propertyId:config.property_id,mapping:config.styling_groups||{}});
}
function setReadyUI() {
  $('#model-cover').hidden = true;
  $('#model-tools').hidden = false;
  $('#view-select').disabled=false;
  $('#toggle-walls').disabled = false;
  $('#download-model').disabled = false;
  stage.dataset.ready = 'true';
}
async function startModel() {
  if (loading || ready || !config?.ready) return;
  loading = true; start.disabled = true; start.textContent = 'Modell betöltése…';
  let objectUrl;
  try {
    THREE = await import('three');
    const [{OrbitControls},{GLTFLoader}] = await Promise.all([
      import(new URL('vendor__examples__jsm__controls__OrbitControls.js', vendorBase)),
      import(new URL('vendor__examples__jsm__loaders__GLTFLoader.js', vendorBase))
    ]);
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:false, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#e0e5de');
    camera = new THREE.PerspectiveCamera(45, 1, .03, 200);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.minDistance = .45; controls.maxDistance = 55;
    controls.maxPolarAngle = Math.PI * .49; controls.addEventListener('change', invalidate);
    scene.add(new THREE.HemisphereLight(0xf9fcff, 0x9b937f, 2));
    const key = new THREE.DirectionalLight(0xfff6e6, 3); key.position.set(-6, 13, 8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00015; key.shadow.normalBias = .025;
    Object.assign(key.shadow.camera, {left:-14, right:14, top:14, bottom:-14, near:.1, far:45}); scene.add(key);
    const fill = new THREE.DirectionalLight(0xebf4ff, 1.0); fill.position.set(7, 6, -9); scene.add(fill);
    const blob = await loadModel(); objectUrl = URL.createObjectURL(blob);
    const gltf = await new GLTFLoader().loadAsync(objectUrl);
    model = gltf.scene; readSemantics(model);
    let triangles = 0, meshes = 0;
    model.traverse(node => { if (node.isMesh) {
      meshes++; triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      node.castShadow = !materials.some(material => material.transparent); node.receiveShadow = true;
      for (const material of materials) if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }});
    stage.dataset.meshes = String(meshes); stage.dataset.triangles = String(triangles);
    scene.add(model); bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3()); key.target.position.copy(center); scene.add(key.target);
    // Only procedural lighting is shared; geometry and textures come from this property's GLB.
    const env = new THREE.Scene(); env.background = new THREE.Color('#b4b8ae');
    for (const [position,size,intensity] of [[[0,8,0],[14,.1,10],2.5],[[-7,4,0],[.1,7,10],1.8],[[7,3,-5],[.1,6,7],1.5]]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({color:new THREE.Color(1,.98,.94).multiplyScalar(intensity)})); panel.position.fromArray(position); env.add(panel);
    }
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(env,0).texture; scene.environmentIntensity = .30;
    pmrem.dispose(); env.traverse(node => { if (node.isMesh) {node.geometry.dispose(); node.material.dispose();} });
    // Subtle contact shading aids small details without changing the exported geometry.
    if (matchMedia('(min-width:761px)').matches) {
      const [{EffectComposer},{RenderPass},{SSAOPass},{OutputPass}] = await Promise.all([
        import(new URL('vendor__examples__jsm__postprocessing__EffectComposer.js',vendorBase)),
        import(new URL('vendor__examples__jsm__postprocessing__RenderPass.js',vendorBase)),
        import(new URL('vendor__examples__jsm__postprocessing__SSAOPass.js',vendorBase)),
        import(new URL('vendor__examples__jsm__postprocessing__OutputPass.js',vendorBase))
      ]);
      composer = new EffectComposer(renderer,new THREE.WebGLRenderTarget(stage.clientWidth,stage.clientHeight,{type:THREE.HalfFloatType,samples:2}));
      composer.addPass(new RenderPass(scene,camera));
      const ao = new SSAOPass(scene,camera,stage.clientWidth,stage.clientHeight,16);
      ao.kernelRadius=.22;ao.minDistance=.001;ao.maxDistance=.06;composer.addPass(ao);composer.addPass(new OutputPass());
      stage.dataset.ambientOcclusion='true';
    } else stage.dataset.ambientOcclusion='false';
    stage.prepend(renderer.domElement);
    visibility = createVisibilityController(model, {propertyId:config.property_id, onChange:snapshotToUI});
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); ready = false; stage.dataset.ready = 'false'; stage.dataset.error = 'webglcontextlost';
      setStatus('A 3D megjelenítése megszakadt. Az oldal újratöltésével indítható újra; a fotógaléria továbbra is megtekinthető.');
      $('#view-select').disabled=true;
      $('#toggle-walls').disabled = true;
    });
    ready = true; resize(); chooseView(0); setReadyUI();
    applyStyling();document.dispatchEvent(new CustomEvent('otthoniv:model-ready',{detail:{stylingVariants:stylingController.ids()}}));
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
    new IntersectionObserver(entries => {inViewport = entries[0].isIntersecting; if(inViewport)invalidate();}).observe(stage);
    document.addEventListener('visibilitychange', invalidate);
    setStatus('A térmodell betöltődött. Forgasd el, válassz helyiséget vagy próbálj ki egy berendezést.');
    invalidate();
  } catch(error) {
    ready = false; stage.dataset.ready = 'false'; stage.dataset.error = error.message;
    renderer?.domElement.remove(); renderer?.dispose(); controls?.dispose(); composer?.dispose(); composer=null;
    roofRoots=[];roofNames=new Set();stylingController=undefined;
    setStatus(`A térmodell most nem tölthető be. ${error.message}. A fényképek és az alaprajz továbbra is megtekinthetők.`);
    start.textContent = 'Újrapróbálás'; start.disabled = false;
  } finally { loading = false; if(objectUrl) URL.revokeObjectURL(objectUrl); }
}
function zoom(multiplier) {
  if (!ready) return;
  const delta = camera.position.clone().sub(controls.target).multiplyScalar(multiplier);
  if (delta.length() < controls.minDistance || delta.length() > controls.maxDistance) return;
  camera.position.copy(controls.target).add(delta); controls.update(); invalidate();
}
$('#zoom-in').addEventListener('click', () => zoom(.82)); $('#zoom-out').addEventListener('click', () => zoom(1.22));
$('#reset-model').addEventListener('click', () => chooseView(0));
$('#view-select').addEventListener('change',event=>chooseView(Number(event.target.value)));
$('#toggle-walls').addEventListener('click',()=>{if(!ready)return;visibility.setWallMode(visibility.snapshot().wallMode==='hidden'?'shown':'hidden');});
$('#fullscreen-model').addEventListener('click', async () => {
  try { if(document.fullscreenElement)await document.exitFullscreen(); else await stage.requestFullscreen(); }
  catch { setStatus('A teljes képernyő nem érhető el. A modell az oldalon továbbra is használható.'); }
});
stage.addEventListener('keydown', event => {
  if(!ready || event.target !== stage) return;
  if(['+','=','ArrowUp'].includes(event.key)){event.preventDefault();zoom(.86);}
  else if(['-','ArrowDown'].includes(event.key)){event.preventDefault();zoom(1.16);}
  else if(event.key==='Home'){event.preventDefault();chooseView(0);}
  else if(['ArrowLeft','ArrowRight'].includes(event.key)){
    event.preventDefault();const delta=camera.position.clone().sub(controls.target); delta.applyAxisAngle(new THREE.Vector3(0,1,0),event.key==='ArrowLeft'?.12:-.12);camera.position.copy(controls.target).add(delta);controls.update();invalidate();
  }
});
$('#download-model').addEventListener('click', async () => {
  if(!modelBlob)return;
  const url=URL.createObjectURL(modelBlob), link=document.createElement('a');link.href=url;link.download='pecs-nagy-imre-62.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
start.addEventListener('click', startModel);
try {
  const response = await fetch('viewer-config.json?v=privacy-20261026');
  if (!response.ok) throw new Error('A nézetadatok nem érhetők el');
  config = await response.json();
  if (config.property_id !== document.body.dataset.propertyId) throw new Error('Eltérő ingatlanazonosító');
  if (!config.ready) {start.disabled=true;start.textContent='A modell még készül';setStatus('Előkészítési példány: a részletes modell még nincs integrálva.');}
  else {
    if (!Array.isArray(config.views) || !config.views.length || config.views.some(v=>!Array.isArray(v.p)||!Array.isArray(v.t)||v.p.length!==3||v.t.length!==3||[...v.p,...v.t].some(n=>!Number.isFinite(n)))) throw new Error('Hiányos kameranézetek');
    if (!config.model.files?.length || !config.model.bytes || !/^[0-9a-f]{64}$/.test(config.model.sha256)) throw new Error('Hiányos modelljegyzék');
    $('#model-size').textContent = `${(config.model.bytes/1048576).toFixed(1)} MB · letöltés csak gombnyomásra`;
    $('#view-select').replaceChildren(...config.views.map((view,index)=>{
      const option=document.createElement('option');option.value=String(index);option.textContent=view.name;return option;
    }));
    updateDescription();
  }
} catch(error) {
  start.disabled=true;start.textContent='A modell nem érhető el';stage.dataset.error=error.message;setStatus(`${error.message}. A fényképek és az alaprajz továbbra is megtekinthetők.`);
}
