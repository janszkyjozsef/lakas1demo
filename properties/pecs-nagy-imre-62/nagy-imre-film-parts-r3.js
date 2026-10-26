/** One-property, one-film loader. No shared model/viewer changes. */
export const PROPERTY_ID='pecs-nagy-imre-62';
export const PART_BYTES=1966080;
const fail=code=>Object.assign(new Error(code),{code});
const checkAbort=signal=>{if(signal?.aborted)throw fail('ABORTED');};
export async function sha256(bytes){
 if(!globalThis.crypto?.subtle)throw fail('SECURE_CONTEXT_REQUIRED');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateManifest(m){
 if(!m||m.schema_version!==1||m.property_id!==PROPERTY_ID||m.kind!=='model_tour'||m.transport!=='lossless-parts'||m.mime_type!=='video/mp4'||m.part_bytes!==PART_BYTES||!Number.isSafeInteger(m.bytes)||m.bytes<=0||!/^[a-f0-9]{64}$/.test(m.sha256)||!Array.isArray(m.parts)||m.parts.length!==Math.ceil(m.bytes/PART_BYTES))throw fail('INVALID_MANIFEST');
 m.parts.forEach((p,i)=>{
  const name=`media/film-model-tour-${m.sha256.slice(0,12)}-${String(i+1).padStart(2,'0')}.bin`;
  if(p.part_index!==i+1||p.file!==name||p.bytes!==Math.min(PART_BYTES,m.bytes-i*PART_BYTES)||!/^[a-f0-9]{64}$/.test(p.sha256))throw fail('INVALID_PART_ORDER');
 });return m;
}
export async function assembleFilmParts(m,{fetcher=globalThis.fetch,signal,onProgress=()=>{}}={}){
 validateManifest(m);checkAbort(signal);let joined=null,offset=0;
 onProgress({phase:'loading',loaded:0,total:m.bytes});
 for(const p of m.parts){
  checkAbort(signal);const res=await fetcher(p.file,{signal,cache:'no-cache'});if(!res.ok)throw fail('MISSING_PART');
  joined??=new Uint8Array(m.bytes);const start=offset;
  if(res.body?.getReader){const reader=res.body.getReader();try{while(true){checkAbort(signal);const {done,value}=await reader.read();if(done)break;if(offset+value.byteLength>start+p.bytes)throw fail('PART_LENGTH');joined.set(value,offset);offset+=value.byteLength;onProgress({phase:'loading',loaded:offset,total:m.bytes});}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}
  else{const data=new Uint8Array(await res.arrayBuffer());if(data.length!==p.bytes)throw fail('PART_LENGTH');joined.set(data,offset);offset+=data.length;onProgress({phase:'loading',loaded:offset,total:m.bytes});}
  if(offset-start!==p.bytes)throw fail('PART_LENGTH');if(await sha256(joined.subarray(start,offset))!==p.sha256)throw fail('PART_SHA');
 }
 checkAbort(signal);if(offset!==m.bytes)throw fail('MOVIE_LENGTH');onProgress({phase:'verifying',loaded:offset,total:m.bytes});if(await sha256(joined)!==m.sha256)throw fail('MOVIE_SHA');checkAbort(signal);return joined;
}
function bind(){
 if(document.body.dataset.propertyId!==PROPERTY_ID)return;
 const box=document.querySelector('#nagy-imre-film');if(!box)return;
 const video=box.querySelector('video'),load=box.querySelector('[data-film-load]'),cancel=box.querySelector('[data-film-cancel]'),download=box.querySelector('[data-film-download]'),progress=box.querySelector('progress'),status=box.querySelector('[role=status]');
 let controller=null,url=null,busy=false;const number=new Intl.NumberFormat('hu-HU',{maximumFractionDigits:1});
 const clear=()=>{video.pause();video.removeAttribute('src');video.load();video.controls=false;video.dataset.sourceVerified='false';delete video.dataset.verifiedSha256;download.disabled=true;if(url)URL.revokeObjectURL(url);url=null;};
 load.addEventListener('click',async()=>{
  if(busy)return;busy=true;load.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;clear();controller=new AbortController();
  status.textContent='A teljes film betöltése folyamatban…';
  try{
   const res=await fetch('film-config-r3.json',{signal:controller.signal,cache:'no-cache'});if(!res.ok)throw fail('MISSING_MANIFEST');const m=validateManifest(await res.json());
   const bytes=await assembleFilmParts(m,{signal:controller.signal,onProgress:({phase,loaded,total})=>{progress.max=total;progress.value=loaded;status.textContent=phase==='verifying'?'A betöltött film ellenőrzése…':`Betöltés: ${number.format(loaded/1e6)} / ${number.format(total/1e6)} MB`;}});
   url=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));video.src=url;video.muted=true;video.controls=true;video.load();video.dataset.sourceVerified='true';video.dataset.verifiedSha256=m.sha256;download.disabled=false;load.textContent='Film újratöltése';status.textContent='A film betöltve. Indítsd el a lejátszón.';
  }catch(e){clear();load.textContent='Betöltés újrapróbálása';status.textContent=e.code==='ABORTED'||e.name==='AbortError'?'A betöltés megszakítva. Újraindíthatod.':e.code==='SECURE_CONTEXT_REQUIRED'?'Nyisd meg az oldal biztonságos HTTPS-címét.':e instanceof RangeError?'A filmhez most nincs elegendő böngészőmemória. Zárj be más lapokat, majd próbáld újra.':'A film nem tölthető be vagy az adatai nem egyeznek. Próbáld újra.';}
  finally{busy=false;controller=null;load.disabled=false;cancel.hidden=true;}
 });
 cancel.addEventListener('click',()=>controller?.abort());
 download.addEventListener('click',()=>{if(!url||video.dataset.sourceVerified!=='true')return;const a=document.createElement('a');a.href=url;a.download='Nagy_Imre_3D_1080p.mp4';document.body.append(a);a.click();a.remove();});
 video.addEventListener('error',()=>{if(url&&video.error)status.textContent='A film betöltődött, de a böngésző nem tudja lejátszani. A teljes MP4 letölthető.';});
 window.addEventListener('pagehide',()=>{controller?.abort();clear();load.textContent='Film betöltése';status.textContent='A teljes film újra betölthető.';});
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();}
