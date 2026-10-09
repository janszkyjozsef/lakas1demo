async function modelTransportUrl(){
 const parts=await Promise.all(["model_part_01.bin", "model_part_02.bin", "model_part_03.bin"].map(async name=>{const r=await fetch(name);if(!r.ok)throw new Error('A modell egy része nem érhető el');return r.arrayBuffer();}));
 return URL.createObjectURL(new Blob(parts,{type:'model/gltf-binary'}));
}
const $=s=>document.querySelector(s);
const stat=window.__demo={version:4.2,modelReady:false,modelError:null,meshCount:0,draws:0,view:0,activeHotspot:null,autoRotate:false,photoCount:0,filter:'all',reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches};
let photos=[],filtered=[],current=0;
const groups=['living','living','living','bedroom','bedroom','bath','kitchen','kitchen','kitchen','plan'];
function gallery(filter='all'){
 stat.filter=filter;filtered=photos.filter((p,i)=>filter==='all'||groups[i]===filter);
 $('#gallery').replaceChildren(...filtered.map((p,i)=>{
  const b=document.createElement('button');b.className='gallery-card';b.setAttribute('aria-label',`${p.label}, nagyítás`);
  const img=document.createElement('img');img.src=p.file;img.alt=p.label+' · digitálisan rendezett fotó';img.width=p.width;img.height=p.height;img.loading='lazy';
  const caption=document.createElement('span');caption.textContent=`${String(p.index).padStart(2,'0')} / ${p.label}`;b.append(img,caption);b.addEventListener('click',()=>openPhoto(i));return b;
 }));
}
function showPhoto(i){current=(i+filtered.length)%filtered.length;const p=filtered[current];$('#lightbox-img').src=p.file;$('#lightbox-img').alt=p.label+' · digitálisan rendezett fotó';$('#lightbox-caption').textContent=`${current+1} / ${filtered.length} — ${p.label} · ${p.width} × ${p.height} px`;}
function openPhoto(i){showPhoto(i);$('#lightbox').showModal();$('#close-lightbox').focus();}
$('#close-lightbox').addEventListener('click',()=>$('#lightbox').close());
$('#prev-photo').addEventListener('click',()=>showPhoto(current-1));$('#next-photo').addEventListener('click',()=>showPhoto(current+1));
$('#lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();showPhoto(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();showPhoto(current-1);}});
$('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox'))$('#lightbox').close();});
let touchX=0;$('#lightbox-img').addEventListener('touchstart',e=>touchX=e.changedTouches[0].clientX,{passive:true});$('#lightbox-img').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>45)showPhoto(current+(dx<0?1:-1));},{passive:true});
const video=$('#property-video');
video.src='media__egyetemvaros_rendezett_36s.mp4';video.poster='media__poster_v4.jpg';video.dataset.format='native-photo';video.load();
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(q=>q.classList.toggle('selected',q===b));gallery(b.dataset.filter);}));
fetch('photos.json').then(r=>{if(!r.ok)throw Error('Forrásjegyzék nem elérhető');return r.json();}).then(p=>{photos=p;stat.photoCount=p.length;gallery();}).catch(()=>{$('#gallery').textContent='A galéria nem töltődött be. Az eredeti képek az originals mappában megnyithatók.';});

let THREE,renderer,scene,camera,controls,composer,visible=true,renderQueued=false;
const stage=$('#viewport'),status=$('#model-status');
const views=[{"p": [8, 9.3, 10.5], "t": [0, 0.65, 0], "name": "Teljes lakás"}, {"p": [-1.75, 2.8, 3.45], "t": [-3.28, 0.9, -0.45], "name": "Nappali közelről"}, {"p": [-0.77, 1.79, -0.73], "t": [1.2, 1.23, -1.99], "name": "Konyha közelről"}, {"p": [3.63, 2.05, 1.35], "t": [3.5, 0.7, -1.28], "name": "Hálószoba"}, {"p": [2.45, 2.5, 2.05], "t": [1.16, 1.04, 0.15], "name": "Fürdőszoba"}];
const points=[{"title": "Nappali — textilek és bútorok", "position": [-3.82, 0.8, -0.1], "p": [-2.53, 1.38, 0.55], "t": [-3.78, 0.63, -0.05], "text": "Elpakolt ágynemű, szabad kanapé és tiszta asztalok. A kárpit besüppedései, varrásai, szegélyei, a könyvek lapjai és a tárolódobozok részletei külön modellezettek."}, {"title": "Konyha — anyagok és gépek", "position": [1.03, 1.3, -1.97], "p": [-0.55, 1.75, -0.85], "t": [1.9, 1.13, -1.82], "text": "Üres pultok és szabad padló, porszívó és edényhalom nélkül. Valóban mélyített, egytálcás mosogató, csaptelep, két főzőzóna, készülékkezelők, fogantyúrögzítések és bútorlábak."}, {"title": "Hálószoba — ágy és tárolás", "position": [3.53, 0.75, -1.05], "p": [3.55, 1.4, 0], "t": [3.53, 0.83, -1.45], "text": "Bevetett ágy igazított geometrikus mintájú paplannal, visszahajtott felső szegéllyel és két rendezett bézs párnával. Finom szövés, varrások, ágylábak, függönyredők és radiátorszelep."}, {"title": "Fürdő — üveg és szerelvények", "position": [1.32, 1.04, 0.45], "p": [2.2, 1.85, 1.38], "t": [1.32, 1.12, 0.03], "text": "Elpakolt tisztálkodószerek és tiszta mosógéptető. Zuhanyajtó-görgők, tömítések, króm szerelvények, gégecső, zuhanyfej-fúvókák és mosdótúlfolyó. A nem látható méretek feltételezések."}, {"title": "Terek kapcsolata", "position": [0.6, 0.35, 1.98], "p": [4.9, 8.3, 9.3], "t": [0.4, 0.4, 0.75], "text": "Az alaprajz szerinti átjárók a metszett falakon is nyitottak. A háló ajtaja tokhoz és pántokhoz kapcsolódik. A méretek szemléltetők; a külön WC-hez nem volt fotó."}];
function sync(){if(!camera)return;stat.camera=camera.position.toArray();stat.target=controls.target.toArray();}
function mark(){const enabled=$('#show-markers').checked;document.querySelectorAll('.hotspot').forEach((b,i)=>{const v=new THREE.Vector3(...points[i].position).project(camera);const ok=enabled&&v.z>-1&&v.z<1&&Math.abs(v.x)<.94&&Math.abs(v.y)<.92;b.hidden=!ok;b.style.left=(v.x*.5+.5)*stage.clientWidth+'px';b.style.top=(-v.y*.5+.5)*stage.clientHeight+'px';});}
function draw(){renderQueued=false;if(!renderer||!visible||document.hidden)return;if(composer)composer.render();else renderer.render(scene,camera);stat.draws++;sync();mark();}
function invalidate(){if(!renderQueued){renderQueued=true;requestAnimationFrame(draw);}}
function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=stat.view===0?(camera.aspect<1?55:43):(camera.aspect<1?69:58);camera.updateProjectionMatrix();if(composer)composer.setSize(w,h);invalidate();}
function setCamera(p,t){camera.position.fromArray(p);controls.target.fromArray(t);controls.update();invalidate();sync();}
function chooseView(i){stat.view=i;stat.activeHotspot=null;setCamera(views[i].p,views[i].t);resize();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.view)===i));$('#detail-content').replaceChildren();const h=document.createElement('h3');h.textContent=views[i].name;const p=document.createElement('p');p.textContent='Húzd el a modellt, vagy válassz egy részletet. Minden méret szemléltető feltételezés.';$('#detail-content').append(h,p);}
function choosePoint(i){const point=points[i];stat.activeHotspot=i;stat.view=i<4?i+1:0;setCamera(point.p,point.t);resize();$('#detail-content').replaceChildren();const h=document.createElement('h3');h.textContent=point.title;const p=document.createElement('p');p.textContent=point.text;$('#detail-content').append(h,p);document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('selected'));}
function zoom(f){const delta=camera.position.clone().sub(controls.target);delta.multiplyScalar(f);const distance=delta.length();if(distance<controls.minDistance||distance>controls.maxDistance)return;camera.position.copy(controls.target).add(delta);controls.update();sync();invalidate();}
function rotate(a){const v=camera.position.clone().sub(controls.target);v.applyAxisAngle(new THREE.Vector3(0,1,0),a);camera.position.copy(controls.target).add(v);controls.update();sync();invalidate();}
$('#start-model').addEventListener('click',async()=>{
 const start=$('#start-model');start.disabled=true;start.textContent='Modell betöltése…';status.textContent='A szemléltető lakásmodell betöltése folyamatban.';
 try{
  THREE=await import('three');const {OrbitControls}=await import('./vendor__examples__jsm__controls__OrbitControls.js');const {GLTFLoader}=await import('./vendor__examples__jsm__loaders__GLTFLoader.js');
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#e2e5e3');camera=new THREE.PerspectiveCamera(43,1,.05,150);
  scene.add(new THREE.HemisphereLight(0xf5f8ff,0x6c665e,1.35));const key=new THREE.DirectionalLight(0xfff8ef,2.7);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=8;key.shadow.camera.bottom=-8;key.shadow.bias=-.0002;key.shadow.normalBias=.015;scene.add(key);const fill=new THREE.DirectionalLight(0xe4edff,.7);fill.position.set(-7,5,-5);scene.add(fill);
  const loader=new GLTFLoader();const started=performance.now();const gltf=await loader.loadAsync(await modelTransportUrl());stat.loadMilliseconds=Math.round(performance.now()-started);gltf.scene.traverse(o=>{if(o.isMesh){stat.meshCount++;o.castShadow=!o.material.transparent;o.receiveShadow=true;stat.triangles=(stat.triangles||0)+(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;if(o.material.normalMap)stat.normalMappedMeshes=(stat.normalMappedMeshes||0)+1;if(o.material.map){stat.texturedMeshes=(stat.texturedMeshes||0)+1;o.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}});scene.add(gltf.scene);
  const envScene=new THREE.Scene();envScene.background=new THREE.Color('#9b9fa3');
  for(const [p,scale,strength] of [[[0,7,0],[10,.1,8],3.0],[[-6,3,0],[.1,6,7],1.8],[[4,4,-3],[.1,5,6],2.0]]){const light=new THREE.Mesh(new THREE.BoxGeometry(...scale),new THREE.MeshBasicMaterial({color:new THREE.Color(1,.98,.94).multiplyScalar(strength)}));light.position.fromArray(p);envScene.add(light);}
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(envScene,.08).texture;scene.environmentIntensity=.38;pmrem.dispose();envScene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  const {EffectComposer}=await import('./vendor__examples__jsm__postprocessing__EffectComposer.js');
  const {RenderPass}=await import('./vendor__examples__jsm__postprocessing__RenderPass.js');
  const {SSAOPass}=await import('./vendor__examples__jsm__postprocessing__SSAOPass.js');
  const {OutputPass}=await import('./vendor__examples__jsm__postprocessing__OutputPass.js');
  const target=new THREE.WebGLRenderTarget(stage.clientWidth,stage.clientHeight,{type:THREE.HalfFloatType,samples:4});composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));const ao=new SSAOPass(scene,camera,stage.clientWidth,stage.clientHeight,16);ao.kernelRadius=.45;ao.minDistance=.001;ao.maxDistance=.08;composer.addPass(ao);composer.addPass(new OutputPass());stat.ambientOcclusion=true;stat.antialiasSamples=4;

  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.autoRotate=false;controls.minDistance=.40;controls.maxDistance=42;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=true;controls.addEventListener('change',()=>{sync();invalidate();});
  stage.prepend(renderer.domElement);$('#model-poster').hidden=true;start.hidden=true;$('#hotspots').hidden=false;$('#zoom-controls').hidden=false;document.querySelectorAll('[data-view],[data-hotspot],#reset-model,#show-markers').forEach(b=>b.disabled=false);
  $('#hotspots').replaceChildren(...points.map((p,i)=>{const b=document.createElement('button');b.className='hotspot';b.textContent=i+1;b.setAttribute('aria-label',p.title);b.addEventListener('click',()=>choosePoint(i));return b;}));
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stat.modelReady=false;stat.modelError='WebGL context lost';$('#model-poster').hidden=false;renderer.domElement.hidden=true;status.textContent='A 3D megjelenítése megszakadt. Az állókép látható; az oldal újratöltésével indítható újra.';});
  new ResizeObserver(resize).observe(stage);new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible)invalidate();},{threshold:0}).observe(stage);document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidate();});
  chooseView(0);resize();stat.modelReady=true;status.textContent='A 3D betöltődött. Forgatható és közelíthető. Fotók alapján készült szemléltető térmodell, nem hiteles felmérés.';
 }catch(e){stat.modelError=String(e.message||e);stat.modelReady=false;status.textContent='A 3D nem indult el. A saját renderelt állókép megmaradt. Helyi HTTP-kiszolgálás és WebGL-képes böngésző szükséges.';start.textContent='3D betöltése sikertelen';start.hidden=false;$('#model-poster').hidden=false;}
});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>chooseView(Number(b.dataset.view))));document.querySelectorAll('[data-hotspot]').forEach(b=>b.addEventListener('click',()=>choosePoint(Number(b.dataset.hotspot))));$('#reset-model').addEventListener('click',()=>chooseView(0));$('#show-markers').addEventListener('change',()=>{mark();invalidate();});$('#zoom-in').addEventListener('click',()=>zoom(.84));$('#zoom-out').addEventListener('click',()=>zoom(1.19));
stage.addEventListener('keydown',e=>{if(!stat.modelReady||e.target!==stage)return;switch(e.key){case'ArrowLeft':e.preventDefault();rotate(.12);break;case'ArrowRight':e.preventDefault();rotate(-.12);break;case'ArrowUp':case'+':case'=':e.preventDefault();zoom(.88);break;case'ArrowDown':case'-':e.preventDefault();zoom(1.14);break;case'Home':e.preventDefault();chooseView(0);break;}});

window.__reviewCamera=(p,t)=>{stat.view=1;setCamera(p,t);resize();};
$('#fullscreen-model').addEventListener('click',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();resize();});
