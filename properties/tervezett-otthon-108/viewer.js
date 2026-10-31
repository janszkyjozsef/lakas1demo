import * as THREE from 'three';
import {OrbitControls} from './vendor/vendor__examples__jsm__controls__OrbitControls.js';
import {GLTFLoader} from './vendor/vendor__examples__jsm__loaders__GLTFLoader.js';

const canvas=document.querySelector('#view'),stage=document.querySelector('#stage');
const status=document.querySelector('#status');
const wallButton=document.querySelector('#walls'),furnitureButton=document.querySelector('#furniture'),reset=document.querySelector('#reset');
try {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e4e9e3');
  const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(12.06,11.74,8.3);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene.add(new THREE.HemisphereLight(0xffffff,0x6d776f,1.05));
  const light=new THREE.DirectionalLight(0xffffff,1.15);light.position.set(4,14,8);scene.add(light);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(4.5,.8,-3.8);controls.minDistance=3;controls.maxDistance=32;controls.maxPolarAngle=Math.PI*.49;controls.update();
  const groups={walls:[],furnishing:[]}; const guestButton=document.querySelector('#guest'),officeButton=document.querySelector('#office'); let variant='guest';
  const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;
    // Keep the same horizontal field of view on portrait displays.
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(20))*Math.max(1,1.25/camera.aspect)));
    camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(stage);resize();
  new GLTFLoader().load('./draft12-private.glb',gltf=>{
    scene.add(gltf.scene);
    gltf.scene.traverse(o=>{const g=o.userData?.viewer_group;if(o.isMesh&&groups[g])groups[g].push(o);});
    if(groups.walls.length!==64||groups.furnishing.length!==151){status.textContent='A modell csoportjai nem egyeznek a próbaadattal.';return;}
    const mountedPrefixes=['Konyha felső bútor','Felsőszekrény előlap','Zuhany fali rúd','Zuhany összekötő kar','Zuhany fej','Étkező lámpa','Külön WC kézmosó'];
    // GLTFLoader normalizes spaces in node names to underscores.
    const mounted=object=>mountedPrefixes.some(prefix=>object.name.replaceAll('_',' ').startsWith(prefix));
    function syncVisibility(){
      const walls=wallButton.getAttribute('aria-pressed')==='true';
      const furniture=furnitureButton.getAttribute('aria-pressed')==='true';
      for(const object of groups.walls)object.visible=walls;
      for(const object of groups.furnishing)object.visible=furniture&&(!mounted(object)||walls)&&(!object.userData.variant||object.userData.variant===variant);
    }
    const toggle=(button,label)=>button.addEventListener('click',()=>{
      const visible=button.getAttribute('aria-pressed')!=='true';
      button.setAttribute('aria-pressed',String(visible));button.textContent=label+(visible?' elrejtése':' megjelenítése');
      syncVisibility();
    });
    toggle(wallButton,'Falak');toggle(furnitureButton,'Bútorok');
    for(const [button,name] of [[guestButton,'guest'],[officeButton,'office']]) button.addEventListener('click',()=>{variant=name;guestButton.setAttribute('aria-pressed',String(name==='guest'));officeButton.setAttribute('aria-pressed',String(name==='office'));stage.dataset.variant=name;document.querySelectorAll('[data-shopping]').forEach(el=>{el.hidden=el.dataset.shopping!==name;});syncVisibility();});
    syncVisibility();stage.dataset.variant=variant;
    reset.addEventListener('click',()=>{camera.position.set(12.06,11.74,8.3);controls.target.set(4.5,.8,-3.8);controls.update();});
    wallButton.disabled=furnitureButton.disabled=reset.disabled=guestButton.disabled=officeButton.disabled=false;
    status.textContent='A 12-es próbamodell betöltődött. Forgatható, a falak kapcsolhatók, és két szobaváltozat kipróbálható.';
    stage.dataset.loaded='true';stage.dataset.wallCount=groups.walls.length;stage.dataset.furnitureCount=groups.furnishing.length;
  },undefined,()=>{status.textContent='A 12-es próbamodellt nem sikerült betölteni.';});
  function frame(){controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
} catch(e) {status.textContent='A 3D megjelenítés nem elérhető ebben a böngészőben.';console.error(e);}
