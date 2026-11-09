import * as THREE from 'three';
import {OrbitControls} from './vendor/vendor__examples__jsm__controls__OrbitControls.js';
import {GLTFLoader} from './vendor/vendor__examples__jsm__loaders__GLTFLoader.js';

export async function startViewer(){
 const canvas=document.querySelector('#model-canvas'),stage=document.querySelector('#model-stage'),status=document.querySelector('#model-status');
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'})}catch(e){throw Error('WebGL nem elérhető',{cause:e})}
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setClearColor(0xe1e3da);renderer.shadowMap.enabled=false;
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xfff7e6,0x9fa697,2.5));const sun=new THREE.DirectionalLight(0xfff5df,2.1);sun.position.set(-4,9,5);scene.add(sun);const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(5,6,-5);scene.add(fill);
 const camera=new THREE.PerspectiveCamera(45,1,.035,100);const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=false;orbit.minPolarAngle=.12;orbit.maxPolarAngle=Math.PI*.49;orbit.minDistance=1.1;orbit.maxDistance=24;orbit.enablePan=true;
 const loader=new GLTFLoader();const gltf=await loader.loadAsync('assets/model.glb');const model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
 let meta={};try{const r=await fetch('assets/model-meta.json',{cache:'no-store'});if(r.ok)meta=await r.json()}catch{}
 const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const wallNodes=[],windowNodes=[],ceilingNodes=[],walkCollision=[],furnitureBoxes=[],wallRoots=[],lintelNodes=[];
 model.traverse(o=>{if(o.name==='WALLS')wallRoots.push({node:o,position:o.position.clone(),scale:o.scale.clone()})});
 model.traverse(o=>{
  if(!o.isMesh)return;
  o.castShadow=false;o.receiveShadow=false;
  const ancestry=[];for(let n=o;n&&n!==scene;n=n.parent)ancestry.push(n.name||'');const names=ancestry.join(' ');
  if(/(^|\s)(walls?|wall_|fal|architecture_wall)/i.test(names))wallNodes.push(o);
  if(/lintel/i.test(names))lintelNodes.push(o);
  if(/(^|\s)windows?($|\s|_)/i.test(names))windowNodes.push(o);
  if(/ceiling|mennyezet|roof/i.test(names))ceilingNodes.push(o);
  // Collision uses source geometry, including hidden architectural walls. Ground/ceiling are excluded.
  if(!/floor|ground|ceiling|roof|baseplate|talapzat|lamp|light|curtain/i.test(names)){
   walkCollision.push(o);
   if(!/(^|\s)(walls?|wall_|fal|architecture_wall)/i.test(names)){
    const b=new THREE.Box3().setFromObject(o);
    if(b.max.y>.20&&b.min.y<1.5&&b.max.x>b.min.x&&b.max.z>b.min.z)furnitureBoxes.push(b);
   }
  }
  for(const material of(Array.isArray(o.material)?o.material:[o.material])){if(material?.map){material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())}}
 });
 const controls={orbit:document.querySelector('#orbit-mode'),walk:document.querySelector('#walk-mode'),room:document.querySelector('#room-select'),walls:document.querySelector('#toggle-walls'),ceiling:document.querySelector('#toggle-ceiling'),reset:document.querySelector('#reset-camera')};
 const walkPad=document.querySelector('#walk-pad');let mode='orbit',overviewActive=true,wallsVisible=true,ceilingVisible=false,active=true,expanded=false,dirty=true,yaw=0,pitch=0;
 let animation=0,lastTime=0;const keys=new Set(),touchKeys=new Set();const pointer={active:false,x:0,y:0,id:null};const ray=new THREE.Raycaster();
 const floorY=Number(meta.floorY??(meta.unit_scale_m?0:bounds.min.y));const eyeHeight=Number(meta.eyeHeight??meta.eye_height_m??1.55);let walkStart=meta.walkStart||meta.walk_start||(meta.spawn_gltf?{position:meta.spawn_gltf,target:meta.spawn_target_gltf}:null);
 if(Array.isArray(walkStart))walkStart={position:walkStart,target:[center.x,floorY+eyeHeight,center.z]};
 const walkReady=!!walkStart&&Array.isArray(walkStart.position);
 function setStatus(text){status.textContent=text}
 function render(){if(!renderer||!active)return;renderer.render(scene,camera);canvas.dataset.cameraPosition=JSON.stringify(camera.position.toArray().map(n=>+n.toFixed(4)));canvas.dataset.mode=mode;canvas.dataset.wallsVisible=String(wallsVisible);canvas.dataset.ceilingVisible=String(ceilingVisible);canvas.dataset.wallHeightFactor=String((mode==='orbit'&&overviewActive)?0.3:1);dirty=false}
 function requestRender(){dirty=true;if(!animation)animation=requestAnimationFrame(tick)}
 function tick(time){animation=0;const dt=Math.min((time-lastTime)/1000||0,.04);lastTime=time;if(mode==='walk'&&(keys.size||touchKeys.size))move(dt);if(dirty)render();if(mode==='walk'&&(keys.size||touchKeys.size))animation=requestAnimationFrame(tick)}
 function resize(){const r=stage.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);const pixelBudget=innerWidth<720?2200000:4400000;renderer.setPixelRatio(Math.max(1,Math.min(2,Math.sqrt(pixelBudget/(w*h)))));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(mode==='orbit'&&overviewActive)frameOverview();requestRender()}
 function visibility(){const cutaway=mode==='orbit'&&overviewActive;for(const o of wallNodes)o.visible=wallsVisible;for(const o of windowNodes)o.visible=wallsVisible&&!cutaway;for(const o of lintelNodes)o.visible=wallsVisible&&!cutaway;for(const root of wallRoots){root.node.position.copy(root.position);root.node.scale.copy(root.scale);if(cutaway){root.node.position.y=floorY+(root.position.y-floorY)*.3;root.node.scale.y*=.3}}model.updateMatrixWorld(true);for(const o of ceilingNodes)o.visible=ceilingVisible;controls.walls.textContent=wallsVisible?'Falak elrejtése':'Falak megjelenítése';controls.walls.setAttribute('aria-pressed',String(wallsVisible));controls.ceiling.textContent=ceilingVisible?'Mennyezet elrejtése':'Mennyezet megjelenítése';controls.ceiling.setAttribute('aria-pressed',String(ceilingVisible));requestRender()}
 function setOrbitView(view){
  overviewActive=!view||view.id==='overview';visibility();
  if(!view||view.id==='overview'){frameOverview();return}
  if(view?.position&&view?.target){camera.position.fromArray(view.position);orbit.target.fromArray(view.target)}camera.fov=view?.lens_mm?THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2*Math.atan(18/(view.lens_mm*camera.aspect))),38,80):45;camera.updateProjectionMatrix();orbit.update();requestRender();
 }
 function frameOverview(){
  // Fit the visible authored geometry, not camera/light positions or the full hidden-wall box.
  const points=[];model.updateMatrixWorld(true);model.traverseVisible(o=>{if(!o.isMesh||!o.geometry)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;if(!b)return;for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld))});if(!points.length)return;
  const back=new THREE.Vector3(9-2.4,11-.45,-12+3.7).normalize(),right=new THREE.Vector3().crossVectors(camera.up,back).normalize(),vertical=new THREE.Vector3().crossVectors(back,right).normalize();const projected=points.map(p=>[p.dot(right),p.dot(vertical),p.dot(back)]);const ext=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];for(const p of projected)for(let i=0;i<3;i++){ext[i][0]=Math.min(ext[i][0],p[i]);ext[i][1]=Math.max(ext[i][1],p[i])}
  let cx=(ext[0][0]+ext[0][1])/2,cy=(ext[1][0]+ext[1][1])/2;const cz=(ext[2][0]+ext[2][1])/2;camera.fov=42;const aspect=Math.max(.2,stage.clientWidth/stage.clientHeight);camera.aspect=aspect;camera.updateProjectionMatrix();const tv=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),th=tv*aspect,fill=.80;let distance=1,minX=0,maxX=0,minY=0,maxY=0;
  for(let k=0;k<8;k++){distance=.5;for(const[x,y,z]of projected)distance=Math.max(distance,z-cz+.1,z-cz+Math.abs(x-cx)/(th*fill),z-cz+Math.abs(y-cy)/(tv*fill));minX=minY=Infinity;maxX=maxY=-Infinity;for(const[x,y,z]of projected){const depth=distance-(z-cz),px=(x-cx)/(depth*th),py=(y-cy)/(depth*tv);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py)}if(k<7){cx+=(minX+maxX)*.5*distance*th;cy+=(minY+maxY)*.5*distance*tv}}
  orbit.target.copy(right.multiplyScalar(cx).addScaledVector(vertical,cy).addScaledVector(back,cz));camera.position.copy(orbit.target).addScaledVector(back,distance);orbit.update();canvas.dataset.overviewFit=JSON.stringify({width:+((maxX-minX)/2).toFixed(3),height:+((maxY-minY)/2).toFixed(3),points:points.length});requestRender();
 }
 function orientWalk(target){const p=camera.position;if(target){const d=new THREE.Vector3().fromArray(target).sub(p);yaw=Math.atan2(-d.x,-d.z);pitch=Math.atan2(d.y,Math.hypot(d.x,d.z))}camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0);requestRender()}
 function enterWalk(view=walkStart){
  if(!view?.position)return;
  const entering=mode!=='walk';mode='walk';overviewActive=false;orbit.enabled=false;camera.fov=view.id==='wc'?76:65;camera.updateProjectionMatrix();camera.position.fromArray(view.position);if(!Number.isFinite(camera.position.y))camera.position.y=floorY+eyeHeight;orientWalk(view.target);if(entering){if(!wallsChosen)wallsVisible=true;if(!ceilingChosen)ceilingVisible=true}visibility();walkPad.hidden=false;controls.walk.setAttribute('aria-pressed','true');controls.orbit.setAttribute('aria-pressed','false');setStatus('Bejárás: húzással nézz körül, nyilakkal vagy az iránygombokkal mozogj. A közlekedés a szemléltető modell határaihoz igazodik.');canvas.focus({preventScroll:true});
 }
 function enterOrbit(){mode='orbit';keys.clear();touchKeys.clear();orbit.enabled=true;walkPad.hidden=true;controls.room.value='overview';if(!ceilingChosen)ceilingVisible=false;controls.walk.setAttribute('aria-pressed','false');controls.orbit.setAttribute('aria-pressed','true');setOrbitView();setStatus('A térmodell betöltődött. Forgasd el, válassz helyiséget, vagy válts bejárásra.');}
 const labels={overview:'Teljes lakás',entry:'Előtér',kitchen:'Konyha',dining:'Étkező',bedroom:'Hálószoba',smallroom:'Külön kis helyiség',bathroom:'Fürdőszoba',wc:'Külön WC',floorplan:'Felülnézet'};
 const views=(Array.isArray(meta.viewpoints_gltf)?meta.viewpoints_gltf:Array.isArray(meta.views)?meta.views:Object.entries(meta.views||{}).map(([id,v])=>({id,...v}))).filter(v=>v.id!=='overview').map(v=>({...v,label:v.label||labels[v.id]||v.id,walk:v.walk||(meta.safe_walk_viewpoints_gltf||[]).find(w=>w.id===v.id)}));
 for(const [i,v] of views.entries()){const op=document.createElement('option');op.value=v.id||String(i);op.textContent=v.label||v.name||`Helyiség ${i+1}`;controls.room.append(op)}
 controls.room.addEventListener('change',()=>{const v=views.find((v,i)=>(v.id||String(i))===controls.room.value);if(mode==='walk'){const walkView=v?.walk||v?.walkView;if(walkView)enterWalk(walkView);else if(!v)enterWalk();else setStatus('Ehhez a nézethez nincs ellenőrzött bejárási kezdőpont. Az áttekintő nézetben megnyitható.')}else setOrbitView(v)});
 let wallsChosen=false,ceilingChosen=false;
 controls.orbit.addEventListener('click',enterOrbit);controls.walk.addEventListener('click',()=>enterWalk());controls.walls.addEventListener('click',()=>{wallsChosen=true;wallsVisible=!wallsVisible;visibility()});controls.ceiling.addEventListener('click',()=>{ceilingChosen=true;ceilingVisible=!ceilingVisible;visibility()});controls.reset.addEventListener('click',()=>{controls.room.value='overview';mode==='walk'?enterWalk():setOrbitView()});orbit.addEventListener('change',requestRender);
 function blocked(start,delta){const len=delta.length();if(len<1e-7)return false;const next=start.clone().add(delta),radius=Number(meta.capsule_radius_m??.18);for(const b of furnitureBoxes){const x=THREE.MathUtils.clamp(next.x,b.min.x,b.max.x),z=THREE.MathUtils.clamp(next.z,b.min.z,b.max.z);if((next.x-x)**2+(next.z-z)**2<radius**2)return true}const dir=delta.clone().normalize();for(const height of[.28,.72,1.05,1.5]){ray.set(new THREE.Vector3(start.x,floorY+height,start.z),dir);ray.near=0;ray.far=len+radius;if(ray.intersectObjects(walkCollision,false).length)return true}return false}
 function withinFloor(p){const r=meta.overall_floor_bounds_gltf;if(r)return p.x>r.minX+.18&&p.x<r.maxX-.18&&p.z>r.minZ+.18&&p.z<r.maxZ-.18;return p.x>bounds.min.x+.2&&p.x<bounds.max.x-.2&&p.z>bounds.min.z+.2&&p.z<bounds.max.z-.2}
 function move(dt,forcedAction){let f=0,r=0;const all=forcedAction?new Set([forcedAction]):new Set([...keys,...touchKeys]);if(all.has('forward'))f++;if(all.has('back'))f--;if(all.has('right'))r++;if(all.has('left'))r--;if(!f&&!r)return;const norm=Math.hypot(f,r);f/=norm;r/=norm;const speed=1.45*dt;const delta=new THREE.Vector3((-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed,0,(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed);const px=camera.position.clone().add(new THREE.Vector3(delta.x,0,0));if(withinFloor(px)&&!blocked(camera.position,new THREE.Vector3(delta.x,0,0)))camera.position.x=px.x;const pz=camera.position.clone().add(new THREE.Vector3(0,0,delta.z));if(withinFloor(pz)&&!blocked(camera.position,new THREE.Vector3(0,0,delta.z)))camera.position.z=pz.z;requestRender()}
 const keymap={w:'forward',W:'forward',ArrowUp:'forward',s:'back',S:'back',ArrowDown:'back',a:'left',A:'left',ArrowLeft:'left',d:'right',D:'right',ArrowRight:'right'};
 canvas.addEventListener('keydown',e=>{if(mode!=='walk')return;if(['q','Q','e','E'].includes(e.key)){e.preventDefault();yaw+=e.key.toLowerCase()==='q'?.16:-.16;orientWalk();return}if(!keymap[e.key])return;e.preventDefault();keys.add(keymap[e.key]);requestRender()});canvas.addEventListener('keyup',e=>{if(keymap[e.key])keys.delete(keymap[e.key])});canvas.addEventListener('blur',()=>keys.clear());window.addEventListener('blur',()=>{keys.clear();touchKeys.clear()});
 for(const b of walkPad.querySelectorAll('[data-move]')){
  const press={timer:0,held:false,cancelled:false};
  b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);press.held=false;press.cancelled=false;clearTimeout(press.timer);press.timer=setTimeout(()=>{press.held=true;touchKeys.add(b.dataset.move);requestRender()},150)});
  b.addEventListener('pointerup',()=>{clearTimeout(press.timer);touchKeys.delete(b.dataset.move)});
  b.addEventListener('pointercancel',()=>{clearTimeout(press.timer);touchKeys.delete(b.dataset.move);press.cancelled=true});
  b.addEventListener('lostpointercapture',()=>{clearTimeout(press.timer);touchKeys.delete(b.dataset.move)});
  // A short tap or keyboard activation advances one checked step. Holding starts continuous motion.
  b.addEventListener('click',()=>{if(mode!=='walk'||press.cancelled){press.cancelled=false;return}if(press.held){press.held=false;return}move(.12,b.dataset.move)});
 }
 canvas.addEventListener('pointerdown',e=>{if(mode!=='walk')return;pointer.active=true;pointer.x=e.clientX;pointer.y=e.clientY;pointer.id=e.pointerId;canvas.setPointerCapture(e.pointerId)});
 canvas.addEventListener('pointermove',e=>{if(mode!=='walk'||!pointer.active||e.pointerId!==pointer.id)return;yaw-=(e.clientX-pointer.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-pointer.y)*.004,-1.18,1.18);pointer.x=e.clientX;pointer.y=e.clientY;orientWalk()});for(const ev of['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>pointer.active=false);
 const expand=document.querySelector('#expand-model');let bodyOverflow='',placeholder=null,inertStates=[],returnFocus=null;
 function toggleExpand(){
  expanded=!expanded;
  if(expanded){
   returnFocus=document.activeElement;bodyOverflow=document.body.style.overflow;placeholder=document.createComment('Model return position');stage.parentNode.insertBefore(placeholder,stage);document.body.append(stage);
   inertStates=[...document.body.children].filter(n=>n!==stage).map(n=>[n,n.inert]);for(const[n]of inertStates)n.inert=true;
   document.body.style.overflow='hidden';stage.classList.add('is-expanded');stage.setAttribute('role','dialog');stage.setAttribute('aria-modal','true');stage.setAttribute('aria-label','Nagyított lakásmodell');expand.textContent='×';expand.setAttribute('aria-label','Kilépés a nagyított modellből');canvas.focus({preventScroll:true});
  }else{
   stage.classList.remove('is-expanded');stage.removeAttribute('role');stage.removeAttribute('aria-modal');stage.removeAttribute('aria-label');placeholder?.replaceWith(stage);placeholder=null;for(const[n,inert]of inertStates)if(n.isConnected)n.inert=inert;inertStates=[];document.body.style.overflow=bodyOverflow;expand.textContent='⛶';expand.setAttribute('aria-label','A modell nagyítása');(returnFocus?.isConnected?returnFocus:expand).focus({preventScroll:true});
  }
  expand.setAttribute('aria-expanded',String(expanded));resize();
 }
 expand.addEventListener('click',toggleExpand);document.addEventListener('keydown',e=>{if(!expanded)return;if(e.key==='Escape'){e.preventDefault();toggleExpand()}else if(e.key==='Tab'){const nodes=[...stage.querySelectorAll('button:not([disabled]),canvas')].filter(n=>n.offsetParent!==null);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
 const observer=new IntersectionObserver(entries=>{active=entries[0]?.isIntersecting!==false;if(active)requestRender();else{keys.clear();touchKeys.clear()}},{threshold:0});observer.observe(stage);document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();touchKeys.clear()}else requestRender()});new ResizeObserver(resize).observe(stage);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setStatus('A 3D-kapcsolat megszakadt. Az oldal újratöltése után a modell újraindítható.');keys.clear();touchKeys.clear()});
 document.querySelector('#model-start').hidden=true;canvas.hidden=false;expand.hidden=false;for(const c of Object.values(controls))c.disabled=false;controls.walk.disabled=!walkReady;controls.walls.disabled=wallNodes.length===0;controls.ceiling.disabled=ceilingNodes.length===0;document.querySelector('#model-download').hidden=false;
 visibility();setOrbitView(meta.overview||(meta.viewpoints_gltf||[]).find(v=>v.id==='overview'));resize();setStatus(walkReady?'A térmodell betöltődött. Forgasd el, válassz helyiséget, vagy válts bejárásra.':'A térmodell betöltődött. A bejárási kezdőpont ellenőrzése még folyamatban; az áttekintő nézet használható.');
 // Read-only diagnostics support final acceptance without substituting for visual inspection.
 window.komloViewer={getState:()=>({loaded:true,mode,wallsVisible,ceilingVisible,wallCount:wallNodes.length,ceilingCount:ceilingNodes.length,walkReady,camera:camera.position.toArray(),modelBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},renderSize:{width:canvas.width,height:canvas.height}})};
}
