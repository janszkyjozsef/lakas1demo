const configResponse=await fetch('viewer-config.json');
if(!configResponse.ok)throw Error('A lakás nézetadatai nem érhetők el');
const config=await configResponse.json();
if(document.body.dataset.propertyId!==config.property_id)throw Error('Eltérő ingatlanazonosító');
const vendorBase=new URL('./',import.meta.url);
async function modelTransportUrl(){
 const paths=config.model.parts||[config.model.file];
 const parts=await Promise.all(paths.map(async name=>{const r=await fetch(name,{cache:'force-cache'});if(!r.ok)throw Error('A modell nem érhető el');return r.arrayBuffer();}));
 return URL.createObjectURL(new Blob(parts,{type:'model/gltf-binary'}));
}
const $=s=>document.querySelector(s);
const stat={version:1,modelReady:false,modelError:null,meshCount:0,draws:0,view:0,activeHotspot:null,autoRotate:false,photoCount:0,filter:'all',reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches};
let photos=[],filtered=[],current=0;
function gallery(filter='all'){
 stat.filter=filter;filtered=photos.filter((p,i)=>filter==='all'||p.group===filter);
 $('#gallery').replaceChildren(...filtered.map((p,i)=>{
  const b=document.createElement('button');b.className='gallery-card';b.setAttribute('aria-label',`${p.label}, nagyítás`);
  const img=document.createElement('img');img.src=p.file;img.alt=p.label+' · '+p.disclosure;img.width=p.width;img.height=p.height;img.loading='lazy';
  const caption=document.createElement('span');caption.textContent=`${String(p.index).padStart(2,'0')} / ${p.label}`;b.append(img,caption);b.addEventListener('click',()=>openPhoto(i));return b;
 }));
}
function showPhoto(i){current=(i+filtered.length)%filtered.length;const p=filtered[current];$('#lightbox-img').src=p.file;$('#lightbox-img').alt=p.label+' · '+p.disclosure;$('#lightbox-caption').textContent=`${current+1} / ${filtered.length} — ${p.label} · ${p.disclosure} · ${p.width} × ${p.height} px`;}
function openPhoto(i){showPhoto(i);$('#lightbox').showModal();$('#close-lightbox').focus();}
$('#close-lightbox').addEventListener('click',()=>$('#lightbox').close());
$('#prev-photo').addEventListener('click',()=>showPhoto(current-1));$('#next-photo').addEventListener('click',()=>showPhoto(current+1));
$('#lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();showPhoto(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();showPhoto(current-1);}});
$('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox'))$('#lightbox').close();});
let touchX=0;$('#lightbox-img').addEventListener('touchstart',e=>touchX=e.changedTouches[0].clientX,{passive:true});$('#lightbox-img').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>45)showPhoto(current+(dx<0?1:-1));},{passive:true});
const video=$('#property-video');
video.src=config.photo_video.file;video.poster=config.photo_video.poster;video.dataset.format='native-photo';video.load();
const tourVideo=$('#tour-video');
[video,tourVideo].forEach(v=>v.addEventListener('play',()=>[video,tourVideo].forEach(other=>{if(other!==v)other.pause();})));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(q=>q.classList.toggle('selected',q===b));gallery(b.dataset.filter);}));
fetch('photos.json').then(r=>{if(!r.ok)throw Error('Forrásjegyzék nem elérhető');return r.json();}).then(p=>{photos=p;stat.photoCount=p.length;gallery();}).catch(()=>{$('#gallery').textContent='A galéria nem töltődött be. Próbáld újratölteni az oldalt.';});

let THREE,renderer,scene,camera,controls,composer,modelBounds,modelRoot,visible=true,renderQueued=false;
const stage=$('#viewport'),status=$('#model-status');
const views=config.views;
const points=config.poi||[];
let hiddenLevels=new Set();
const originalNodeVisibility=new WeakMap();
const floorById=new Map((config.floors||[]).map(f=>[f.id,f]));
const floorByNodeName=new Map();
for(const floor of floorById.values()){
 if(!Array.isArray(floor.node_names))throw Error('Hiányos szintadatok');
 for(const name of floor.node_names){
  if(floorByNodeName.has(name)&&floorByNodeName.get(name)!==floor.id)throw Error('Eltérő szinthez sorolt modellrész');
  floorByNodeName.set(name,floor.id);
 }
}
function applyLevelVisibility(selected){
 const hidden=selected.hide_levels||[];
 if(!Array.isArray(hidden)||hidden.some(id=>!floorById.has(id)))throw Error('Ismeretlen szintnézet');
 hiddenLevels=new Set(hidden);
 if(modelRoot)modelRoot.traverse(node=>{
  if(!originalNodeVisibility.has(node))originalNodeVisibility.set(node,node.visible);
  const level=floorById.has(node.userData?.level_id)?node.userData.level_id:floorByNodeName.get(node.name);
  node.visible=originalNodeVisibility.get(node)&&!hiddenLevels.has(level);
 });
}
function levelDisclosure(selected){
 const hidden=selected.hide_levels||[];
 return hidden.length?' Az áttekintéshez elrejtett részek: '+hidden.map(id=>floorById.get(id).name).join(', ')+'.':'';
}

function sync(){if(!camera)return;stat.camera=camera.position.toArray();stat.target=controls.target.toArray();}
function mark(){const enabled=$('#show-markers').checked;document.querySelectorAll('.hotspot').forEach((b,i)=>{const v=new THREE.Vector3(...points[i].position).project(camera);const ok=enabled&&!hiddenLevels.has(points[i].level_id)&&v.z>-1&&v.z<1&&Math.abs(v.x)<.94&&Math.abs(v.y)<.92;b.hidden=!ok;b.style.left=(v.x*.5+.5)*stage.clientWidth+'px';b.style.top=(-v.y*.5+.5)*stage.clientHeight+'px';});}
function draw(){renderQueued=false;if(!renderer||!visible||document.hidden)return;if(composer)composer.render();else renderer.render(scene,camera);stat.draws++;sync();mark();}
function invalidate(){if(!renderQueued){renderQueued=true;requestAnimationFrame(draw);}}
function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;const selected=stat.activeHotspot!==null?points[stat.activeHotspot]:views[stat.view];const selectedFov=selected.fov||views[stat.view]?.fov||58;const referenceAspect=selected.reference_aspect||(camera.aspect<1?1.35:camera.aspect);const fittedFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(selectedFov)/2)*Math.max(1,referenceAspect/camera.aspect)));camera.fov=stat.view===0&&stat.activeHotspot===null?(camera.aspect<1?55:43):Math.min(112,fittedFov);camera.updateProjectionMatrix();
 if(stat.view===0&&stat.activeHotspot===null&&modelBounds){
  const sphere=modelBounds.getBoundingSphere(new THREE.Sphere());
  const vertical=THREE.MathUtils.degToRad(camera.fov);
  const horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect);
  const distance=sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.08;
  const direction=new THREE.Vector3(...views[0].p).sub(new THREE.Vector3(...views[0].t)).normalize();
  camera.position.copy(sphere.center).addScaledVector(direction,distance);controls.target.copy(sphere.center);controls.update();
 }
 if(composer)composer.setSize(w,h);invalidate();}
function setCamera(p,t){camera.position.fromArray(p);controls.target.fromArray(t);controls.update();invalidate();sync();}
function revealModel(){if(matchMedia('(max-width:760px)').matches)stage.scrollIntoView({block:'start',behavior:'auto'});}
function chooseView(i){stat.view=i;stat.activeHotspot=null;applyLevelVisibility(views[i]);setCamera(views[i].p,views[i].t);resize();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.view)===i));$('#detail-content').replaceChildren();const h=document.createElement('h3');h.textContent=views[i].name;const p=document.createElement('p');p.textContent='Húzd el a modellt, vagy válassz egy részletet. Minden méret szemléltető feltételezés.'+levelDisclosure(views[i]);$('#detail-content').append(h,p);revealModel();}
function choosePoint(i){const point=points[i];applyLevelVisibility(point);stat.activeHotspot=i;stat.view=point.view_index??1;setCamera(point.p,point.t);resize();$('#detail-content').replaceChildren();const h=document.createElement('h3');h.textContent=point.title;const p=document.createElement('p');p.textContent=point.text+levelDisclosure(point);$('#detail-content').append(h,p);document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('selected'));revealModel();}
function zoom(f){const delta=camera.position.clone().sub(controls.target);delta.multiplyScalar(f);const distance=delta.length();if(distance<controls.minDistance||distance>controls.maxDistance)return;camera.position.copy(controls.target).add(delta);controls.update();sync();invalidate();}
function rotate(a){const v=camera.position.clone().sub(controls.target);v.applyAxisAngle(new THREE.Vector3(0,1,0),a);camera.position.copy(controls.target).add(v);controls.update();sync();invalidate();}
$('#start-model').addEventListener('click',async()=>{
 const start=$('#start-model');start.disabled=true;start.textContent='Modell betöltése…';status.textContent='A szemléltető lakásmodell betöltése folyamatban.';
 try{
  THREE=await import('three');const {OrbitControls}=await import(new URL('vendor__examples__jsm__controls__OrbitControls.js',vendorBase).href);const {GLTFLoader}=await import(new URL('vendor__examples__jsm__loaders__GLTFLoader.js',vendorBase).href);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#e2e5e3');camera=new THREE.PerspectiveCamera(43,1,.05,150);
  scene.add(new THREE.HemisphereLight(0xf5f8ff,0x6c665e,1.35));const key=new THREE.DirectionalLight(0xfff8ef,2.7);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=8;key.shadow.camera.bottom=-8;key.shadow.bias=-.0002;key.shadow.normalBias=.015;scene.add(key);const fill=new THREE.DirectionalLight(0xe4edff,.7);fill.position.set(-7,5,-5);scene.add(fill);
  const loader=new GLTFLoader();const started=performance.now();const modelUrl=await modelTransportUrl();const gltf=await loader.loadAsync(modelUrl);URL.revokeObjectURL(modelUrl);stat.loadMilliseconds=Math.round(performance.now()-started);gltf.scene.traverse(o=>{if(o.isMesh){stat.meshCount++;o.castShadow=!o.material.transparent;o.receiveShadow=true;stat.triangles=(stat.triangles||0)+(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;if(o.material.normalMap)stat.normalMappedMeshes=(stat.normalMappedMeshes||0)+1;if(o.material.map){stat.texturedMeshes=(stat.texturedMeshes||0)+1;o.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}});scene.add(gltf.scene);modelRoot=gltf.scene;
  modelBounds=new THREE.Box3().setFromObject(modelRoot);const size=modelBounds.getSize(new THREE.Vector3());const center=modelBounds.getCenter(new THREE.Vector3());
  const span=Math.max(size.x,size.y,size.z)*.7;
  key.position.copy(center).add(new THREE.Vector3(-span,span*1.4,span));key.target.position.copy(center);scene.add(key.target);
  Object.assign(key.shadow.camera,{left:-span,right:span,top:span,bottom:-span,far:span*5});key.shadow.camera.updateProjectionMatrix();
  camera.far=Math.max(150,span*10);camera.updateProjectionMatrix();
  const envScene=new THREE.Scene();envScene.background=new THREE.Color('#9b9fa3');
  for(const [p,scale,strength] of [[[0,7,0],[10,.1,8],3.0],[[-6,3,0],[.1,6,7],1.8],[[4,4,-3],[.1,5,6],2.0]]){const light=new THREE.Mesh(new THREE.BoxGeometry(...scale),new THREE.MeshBasicMaterial({color:new THREE.Color(1,.98,.94).multiplyScalar(strength)}));light.position.fromArray(p);envScene.add(light);}
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(envScene,.04).texture;scene.environmentIntensity=.38;pmrem.dispose();envScene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  const {EffectComposer}=await import(new URL('vendor__examples__jsm__postprocessing__EffectComposer.js',vendorBase).href);
  const {RenderPass}=await import(new URL('vendor__examples__jsm__postprocessing__RenderPass.js',vendorBase).href);
  const {SSAOPass}=await import(new URL('vendor__examples__jsm__postprocessing__SSAOPass.js',vendorBase).href);
  const {OutputPass}=await import(new URL('vendor__examples__jsm__postprocessing__OutputPass.js',vendorBase).href);
  const target=new THREE.WebGLRenderTarget(stage.clientWidth,stage.clientHeight,{type:THREE.HalfFloatType,samples:4});composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));const ao=new SSAOPass(scene,camera,stage.clientWidth,stage.clientHeight,16);ao.kernelRadius=.45;ao.minDistance=.001;ao.maxDistance=.08;composer.addPass(ao);composer.addPass(new OutputPass());stat.ambientOcclusion=true;stat.antialiasSamples=4;

  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.autoRotate=false;controls.minDistance=.40;controls.maxDistance=Math.max(42,modelBounds.getSize(new THREE.Vector3()).length()*5);controls.maxPolarAngle=Math.PI*.49;controls.enablePan=true;controls.addEventListener('change',()=>{sync();invalidate();});
  stage.prepend(renderer.domElement);$('#model-poster').hidden=true;start.hidden=true;$('#hotspots').hidden=false;$('#zoom-controls').hidden=false;document.querySelectorAll('[data-view],[data-hotspot],#reset-model,#show-markers').forEach(b=>b.disabled=false);
  $('#hotspots').replaceChildren(...points.map((p,i)=>{const b=document.createElement('button');b.className='hotspot';b.textContent=i+1;b.setAttribute('aria-label',p.title);b.addEventListener('click',()=>choosePoint(i));return b;}));
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stat.modelReady=false;stat.modelError='WebGL context lost';$('#model-poster').hidden=false;renderer.domElement.hidden=true;status.textContent='A 3D megjelenítése megszakadt. Az állókép látható; az oldal újratöltésével indítható újra.';});
  new ResizeObserver(resize).observe(stage);new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible)invalidate();},{threshold:0}).observe(stage);document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidate();});
  chooseView(0);resize();stat.modelReady=true;status.textContent='A frissített 3D betöltődött. Forgatható és közelíthető. Fotók alapján készült szemléltető térmodell, nem hiteles felmérés.';
 }catch(e){stat.modelError=String(e.message||e);stat.modelReady=false;status.textContent='A 3D ebben a böngészőben nem indult el. Az állókép megmaradt; a körbejáró film külön megnyitható.';start.textContent='3D betöltése sikertelen';start.hidden=false;$('#model-poster').hidden=false;}
});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>chooseView(Number(b.dataset.view))));document.querySelectorAll('[data-hotspot]').forEach(b=>b.addEventListener('click',()=>choosePoint(Number(b.dataset.hotspot))));$('#reset-model').addEventListener('click',()=>chooseView(0));$('#show-markers').addEventListener('change',()=>{mark();invalidate();});$('#zoom-in').addEventListener('click',()=>zoom(.84));$('#zoom-out').addEventListener('click',()=>zoom(1.19));
stage.addEventListener('keydown',e=>{if(!stat.modelReady||e.target!==stage)return;switch(e.key){case'ArrowLeft':e.preventDefault();rotate(.12);break;case'ArrowRight':e.preventDefault();rotate(-.12);break;case'ArrowUp':case'+':case'=':e.preventDefault();zoom(.88);break;case'ArrowDown':case'-':e.preventDefault();zoom(1.14);break;case'Home':e.preventDefault();chooseView(0);break;}});

$('#fullscreen-model').addEventListener('click',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();resize();});
