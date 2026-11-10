const photos=[
 ['Konyha és étkező','Saját helyiség · hossznézet'],['A társasház kívülről','Közös épület · nem a lakás belső tere'],['A közös lépcsőház','Közös épületrész'],['Külön WC','Saját helyiség'],['A konyhától a szobák felé','Saját helyiségek kapcsolata'],['Külön kis helyiség','A hirdetésben dolgozó/gardrób/tároló célra említve'],['Konyhabútor és gépek','Saját helyiség'],['Zuhany és burkolatok','Saját fürdőszoba'],['A szoba franciaerkélye','Saját helyiség · nincs használható terasz'],['Szoba és konyhai átjáró','Saját helyiségek kapcsolata']
].map(([title,caption],i)=>({title,caption,src:`assets/photos/${String(i+1).padStart(2,'0')}.jpg`}));
const grid=document.querySelector('#photo-grid');
for(const [i,p]of photos.entries()){
 const figure=document.createElement('figure');figure.className='photo-card';
 const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',p.title+' — fotó nagyítása');
 const img=new Image();img.src=p.src;img.alt=p.title;img.width=1200;img.height=800;img.loading='lazy';button.append(img);button.addEventListener('click',()=>showPhoto(i));
 const caption=document.createElement('figcaption');const title=document.createElement('strong');title.textContent=`${String(i+1).padStart(2,'0')} / ${p.title}`;const detail=document.createElement('span');detail.textContent=p.caption+' · MI-vel retusált fotó';caption.append(title,detail);figure.append(button,caption);grid.append(figure);
}
const dialog=document.querySelector('#photo-dialog');let selectedPhoto=0,lastPhotoTrigger;
function showPhoto(i){selectedPhoto=(i+photos.length)%photos.length;const p=photos[selectedPhoto];dialog.querySelector('img').src=p.src;dialog.querySelector('img').alt=p.title;dialog.querySelector('p').textContent=p.title+' · '+p.caption+' · MI-vel retusált fotó';document.querySelector('#photo-count').textContent=`${selectedPhoto+1} / ${photos.length}`;if(!dialog.open){lastPhotoTrigger=document.activeElement;dialog.showModal();}}
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>lastPhotoTrigger?.focus());
document.querySelector('#photo-prev').addEventListener('click',()=>showPhoto(selectedPhoto-1));document.querySelector('#photo-next').addEventListener('click',()=>showPhoto(selectedPhoto+1));dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();showPhoto(selectedPhoto-1)}if(e.key==='ArrowRight'){e.preventDefault();showPhoto(selectedPhoto+1)}});
dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()});
for(const img of document.images)img.addEventListener('error',()=>{if(img.closest('dialog'))return;img.hidden=true;const fallback=document.createElement('span');fallback.className='failed-photo';fallback.textContent='A fotó előkészítés alatt.';img.after(fallback)},{once:true});
// Keep a single soundtrack active when switching between the two films.
for(const video of document.querySelectorAll('video'))video.addEventListener('play',()=>{for(const other of document.querySelectorAll('video'))if(other!==video)other.pause()});
// A draft never exposes a broken player as a finished film. Root flips readiness only after media QA.
fetch('assets/media-state.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(state=>{
 for(const card of document.querySelectorAll('[data-film]')){
  const ready=state.films?.[card.dataset.film]===true;
  const video=card.querySelector('video');video.hidden=!ready;card.querySelector('.media-pending').hidden=ready;card.querySelector('.video-file').hidden=!ready;
  // Only an accepted, present film may request metadata; never autoplay or load a pending film.
  if(ready){video.preload='metadata';video.load()}
 }
}).catch(()=>{for(const card of document.querySelectorAll('[data-film]')){card.querySelector('video').hidden=true;card.querySelector('.media-pending').hidden=false;card.querySelector('.video-file').hidden=true}});
document.querySelector('#load-model').addEventListener('click',async()=>{
 const button=document.querySelector('#load-model');button.disabled=true;button.textContent='A modell betöltése…';
 try{const {startViewer}=await import('./viewer.js');await startViewer()}catch(error){console.error(error);button.disabled=false;button.textContent='Betöltés újra';document.querySelector('#model-status').textContent='A modell most nem tölthető be. A fotók és az alaprajz továbbra is megtekinthetők.';}
});
