import * as THREE from 'three';
import {OrbitControls} from './vendor/vendor__examples__jsm__controls__OrbitControls.js';
import {GLTFLoader} from './vendor/vendor__examples__jsm__loaders__GLTFLoader.js';

const stage=document.querySelector('#stage'), canvas=document.querySelector('#canvas');
const status=document.querySelector('#status'), wallsButton=document.querySelector('#walls');
const overview=document.querySelector('#overview'), viewControls=document.querySelector('#views');
const zoomIn=document.querySelector('#zoom-in'),zoomOut=document.querySelector('#zoom-out'),touchRotate=document.querySelector('#touch-rotate');
const variantsContainer=document.querySelector('#variants');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
try {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e8ebe7');
  const camera=new THREE.PerspectiveCamera(38,1,.01,1000);let baseFov=38;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene.add(new THREE.HemisphereLight('#fffefa','#8d998a',2.0));
  const light=new THREE.DirectionalLight('#fff8ea',2.0);light.position.set(-5,12,8);scene.add(light);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.08;controls.enableZoom=false;
  controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.08;
  const coarsePointer=matchMedia('(pointer: coarse)');let touchRotation=false;
  function syncTouch(){touchRotate.hidden=!coarsePointer.matches;controls.enabled=!coarsePointer.matches||touchRotation;canvas.style.touchAction=coarsePointer.matches&&!touchRotation?'pan-y':'none';}
  coarsePointer.addEventListener('change',()=>{touchRotation=false;touchRotate.setAttribute('aria-pressed','false');touchRotate.textContent='Érintéses forgatás bekapcsolása';syncTouch();});
  touchRotate.addEventListener('click',()=>{touchRotation=!touchRotation;touchRotate.setAttribute('aria-pressed',String(touchRotation));touchRotate.textContent=touchRotation?'Érintéses forgatás kikapcsolása':'Érintéses forgatás bekapcsolása';syncTouch();status.textContent=touchRotation?'A forgatás bekapcsolva. Az oldalgörgetéshez kapcsold ki.':'Az oldalgörgetés bekapcsolva.';});syncTouch();
  const updateFov=()=>{camera.fov=Math.min(115,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov)/2)/Math.min(camera.aspect,1))));camera.updateProjectionMatrix();};
  const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;updateFov()};
  new ResizeObserver(resize).observe(stage);resize();
  let transition=null,home=null,resetHome=null;const up=new THREE.Vector3(0,1,0);
  function fit(box){const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const radius=Math.max(size.x,size.y,size.z,.1);const direction=new THREE.Vector3(1.1,.9,1.5).normalize();return {target:center,position:center.clone().addScaledVector(direction,radius*1.8)};}
  function move(view){stage.dataset.moving='true';transition={start:performance.now(),duration:reduced.matches?0:900,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),fromFov:baseFov,toPosition:view.position.clone(),toTarget:view.target.clone(),toFov:view.fov||38};}
  function zoom(factor){if(!home)return;transition=null;stage.dataset.moving='false';const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();}
  zoomIn.addEventListener('click',()=>zoom(.86));zoomOut.addEventListener('click',()=>zoom(1/.86));
  controls.addEventListener('start',()=>{transition=null;stage.dataset.moving='false'});
  canvas.addEventListener('keydown',event=>{
    if(!home)return;
    let handled=true;const offset=camera.position.clone().sub(controls.target);
    switch(event.key){
      case 'ArrowLeft':offset.applyAxisAngle(up,.12);break;
      case 'ArrowRight':offset.applyAxisAngle(up,-.12);break;
      case 'ArrowUp':{const s=new THREE.Spherical().setFromVector3(offset);s.phi=Math.max(.1,s.phi-.1);offset.setFromSpherical(s);break;}
      case 'ArrowDown':{const s=new THREE.Spherical().setFromVector3(offset);s.phi=Math.min(Math.PI*.49,s.phi+.1);offset.setFromSpherical(s);break;}
      case '+':case '=':offset.multiplyScalar(.9);break;
      case '-':case '_':offset.multiplyScalar(1.1);break;
      case 'Home':resetHome?.();event.preventDefault();return;
      default:handled=false;
    }
    if(handled){transition=null;stage.dataset.moving='false';const length=THREE.MathUtils.clamp(offset.length(),controls.minDistance,controls.maxDistance);offset.setLength(length);camera.position.copy(controls.target).add(offset);controls.update();event.preventDefault();}
  });
  const frame=now=>{if(transition){const u=transition.duration?Math.min(1,(now-transition.start)/transition.duration):1,t=u*u*(3-2*u);camera.position.lerpVectors(transition.fromPosition,transition.toPosition,t);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,t);baseFov=THREE.MathUtils.lerp(transition.fromFov,transition.toFov,t);updateFov();if(u===1){transition=null;stage.dataset.moving='false';}}controls.update();renderer.render(scene,camera);requestAnimationFrame(frame)};requestAnimationFrame(frame);
  const configResponse=await fetch('./viewer/config.json?v=7335e6f7');if(!configResponse.ok)throw new Error('missing configuration');
  const config=await configResponse.json();
  if(typeof config.notice==='string')document.querySelector('#notice').textContent=config.notice;
  if(!config.modelUrl||!config.metadata?.wallKey||!config.metadata?.wallValue||!config.metadata?.roomKey||!Array.isArray(config.rooms))throw new Error('invalid configuration');
  const ids=new Set(config.rooms.map(r=>r.id));if(ids.size!==config.rooms.length||config.rooms.some(r=>typeof r.id!=='string'||typeof r.label!=='string'))throw new Error('invalid room list');
  const gltf=await new GLTFLoader().loadAsync(config.modelUrl),root=gltf.scene;scene.add(root);
  const meta=(node,key)=>{for(let p=node;p&&p!==root.parent;p=p.parent)if(Object.hasOwn(p.userData,key))return p.userData[key];return undefined;};
  const hiddenGroups=new Set(config.hiddenGroupValues||[]);
  const meshes=[];root.updateMatrixWorld(true);root.traverse(o=>{if(o.isMesh){const group=meta(o,config.metadata.wallKey);const attached=config.metadata.wallAttachedKey?meta(o,config.metadata.wallAttachedKey):undefined;meshes.push({object:o,wall:group===config.metadata.wallValue,attached,group,room:meta(o,config.metadata.roomKey),initial:o.visible});if(hiddenGroups.has(group))o.visible=false;}});
  if(!meshes.length)throw new Error('no meshes');
  const fullBox=new THREE.Box3().setFromObject(root);if(fullBox.isEmpty())throw new Error('empty model');
  const roomBoxes=new Map(config.rooms.map(r=>[r.id,new THREE.Box3()]));
  for(const item of meshes)if(roomBoxes.has(item.room))roomBoxes.get(item.room).union(new THREE.Box3().setFromObject(item.object));
  const untagged=meshes.filter(m=>!ids.has(m.room)).length;
  const isolate=config.isolateRooms===true&&untagged===0;
  const variants=Array.isArray(config.variants)?config.variants:[];
  const optionalGroups=new Set(variants.flatMap(v=>Array.isArray(v.groups)?v.groups:[]));
  const safeVariants=variants.filter(v=>typeof v.id==='string'&&typeof v.label==='string'&&Array.isArray(v.groups)&&v.groups.every(g=>hiddenGroups.has(g)));
  let selectedGroups=new Set(),wallsVisible=true,active='all',activeVariant=config.defaultVariant||null;
  const synchronize=()=>{for(const m of meshes){const baseVisible=hiddenGroups.has(m.group)?selectedGroups.has(m.group):m.initial;m.object.visible=baseVisible&&(!(m.wall||m.attached===true)||wallsVisible)&&(!isolate||active==='all'||m.room===active);}};
  const wallCount=meshes.filter(m=>m.wall).length;
  const attachmentUnknown=config.requireWallAttachmentMetadata===true?meshes.filter(m=>!m.wall&&(!hiddenGroups.has(m.group)||optionalGroups.has(m.group))&&typeof m.attached!=='boolean').length:0;
  wallsButton.disabled=wallCount===0||attachmentUnknown>0;wallsButton.setAttribute('aria-pressed','false');
  wallsButton.addEventListener('click',()=>{wallsVisible=!wallsVisible;synchronize();wallsButton.setAttribute('aria-pressed',String(!wallsVisible));wallsButton.textContent=wallsVisible?'Falak elrejtése':'Falak megjelenítése';const room=config.rooms.find(r=>r.id===active);if(room){const preset=roomPreset(room);if(preset)move(preset);}status.textContent=`A falak ${wallsVisible?'láthatók':'rejtve vannak'}.`;});
  if(safeVariants.length){variantsContainer.hidden=false;const variantButtons=[];for(const variant of safeVariants){const b=document.createElement('button');b.type='button';b.textContent=variant.label;b.dataset.variant=variant.id;b.disabled=variant.groups.some(group=>!meshes.some(m=>m.group===group));b.setAttribute('aria-pressed',String(variant.id===config.defaultVariant));b.addEventListener('click',()=>{activeVariant=variant.id;document.dispatchEvent(new CustomEvent('otthoniv-variant',{detail:{id:variant.id}}));selectedGroups=new Set(variant.groups);variantButtons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));synchronize();const room=config.rooms.find(r=>r.id===active);if(room){const preset=roomPreset(room);if(preset)move(preset);}status.textContent=`${variant.label}. A falak ${wallsVisible?'láthatók':'rejtve vannak'}.`;});variantsContainer.append(b);variantButtons.push(b);if(variant.id===config.defaultVariant&&!b.disabled)selectedGroups=new Set(variant.groups);}}
  const allButtons=[overview];
  function select(id,box,label,button,preset){active=id;synchronize();allButtons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));move(preset||fit(box));status.textContent=`${label}. A falak ${wallsVisible?'láthatók':'rejtve vannak'}.`;}
  function isVector(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
  function roomPreset(room){const variant=room.variantViews?.[activeVariant];const raw=wallsVisible?(variant||room):(variant?.openView||room.openView||variant||room);const fov=Number.isFinite(raw.fov)&&raw.fov>=25&&raw.fov<=110?raw.fov:38;return isVector(raw.position)&&isVector(raw.target)?{position:new THREE.Vector3(...raw.position),target:new THREE.Vector3(...raw.target),fov}:null;}
  for(const room of config.rooms){const b=document.createElement('button');b.type='button';b.textContent=room.label;b.dataset.room=room.id;b.disabled=!roomPreset(room)&&roomBoxes.get(room.id).isEmpty();b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>select(room.id,roomBoxes.get(room.id),room.label,b,roomPreset(room)));viewControls.insertBefore(b,wallsButton);allButtons.push(b);}
  home=fit(fullBox);camera.position.copy(home.position);controls.target.copy(home.target);
  const scale=Math.max(fullBox.getSize(new THREE.Vector3()).length(),.1);controls.minDistance=scale*.1;controls.maxDistance=scale*8;camera.near=scale*.001;camera.far=scale*40;camera.updateProjectionMatrix();controls.update();
  overview.disabled=false;zoomIn.disabled=zoomOut.disabled=touchRotate.disabled=false;overview.setAttribute('aria-pressed','true');resetHome=()=>select('all',fullBox,'Összkép',overview);overview.addEventListener('click',resetHome);
  synchronize();stage.dataset.loaded='true';stage.dataset.wallCount=String(wallCount);stage.dataset.attachedCount=String(meshes.filter(m=>m.attached===true).length);stage.dataset.hiddenGroupCount=String(meshes.filter(m=>hiddenGroups.has(m.group)).length);stage.dataset.untaggedCount=String(untagged);stage.dataset.attachmentUnknown=String(attachmentUnknown);stage.dataset.isolation=String(isolate);
  status.textContent=`${config.loadedMessage||'A szemléltető modell betöltődött.'}${wallCount?'':' Falakhoz nem található azonosított csoport.'}${attachmentUnknown?' A falak biztonságos elrejtése még nem érhető el.':''}${config.isolateRooms&&!isolate?' A helyiségek elkülönítése nem kapcsolható be, mert hiányos a csoportozás.':''}`;
}catch(error){status.textContent='A modell nem tölthető be vagy a beállítás hiányos. Próbáld újra később.';console.error(error);}
