/** Somogy-only coordination. This module does not change the shared viewer. */
const LEGACY_PART_BYTES = 8 * 1024 * 1024;
const NEW_PART_BYTES = 1966080;
const FILM_KINDS = ['photo_video','model_tour','gemini_1','gemini_2','gemini_3','argon_d'];
function partsError(code) { return Object.assign(new Error(code), {code}); }
function abortCheck(signal) { if (signal?.aborted) throw partsError('ABORTED'); }
export function validateFilmParts(source) {
  if (!source || source.transport!=='lossless-parts' || source.mime_type!=='video/mp4'
      || !FILM_KINDS.includes(source.kind) || !Number.isSafeInteger(source.bytes) || source.bytes<=0
      || !/^[a-f0-9]{64}$/.test(source.sha256) || (![LEGACY_PART_BYTES,NEW_PART_BYTES].includes(source.part_bytes))
      || !['','media/'].includes(source.parts_directory||'')
      || (source.part_bytes===NEW_PART_BYTES && (!['photo_video','argon_d'].includes(source.kind) || source.parts_directory!=='media/'))
      || !Array.isArray(source.parts) || source.parts.length!==Math.ceil(source.bytes/source.part_bytes)) {
    throw partsError('INVALID_MANIFEST');
  }
  for (let i=0;i<source.parts.length;i++) {
    const part=source.parts[i];
    const expected=`${source.parts_directory||''}film-${source.kind.replaceAll('_','-')}-${source.sha256.slice(0,12)}-${String(i+1).padStart(2,'0')}.bin`;
    if (part.part_index!==i+1 || part.file!==expected || part.bytes!==Math.min(source.part_bytes,source.bytes-i*source.part_bytes)
        || !/^[a-f0-9]{64}$/.test(part.sha256)) throw partsError('INVALID_PART_ORDER');
  }
  return source;
}
async function digestHex(bytes) {
  if (!globalThis.crypto?.subtle) throw partsError('SECURE_CONTEXT_REQUIRED');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function assembleFilmParts(source,{fetcher=globalThis.fetch,signal,onProgress=()=>{}}={}) {
  validateFilmParts(source); abortCheck(signal);
  let joined=null,offset=0;
  onProgress({phase:'loading',loaded:0,total:source.bytes});
  for (const part of source.parts) {
    abortCheck(signal);
    const response=await fetcher(part.file,{signal,cache:'no-cache'});
    if (!response.ok) throw partsError('MISSING_PART');
    joined??=new Uint8Array(source.bytes);
    const start=offset;
    if (response.body?.getReader) {
      const reader=response.body.getReader();
      try {
        while (true) {
          abortCheck(signal);
          const {done,value}=await reader.read();
          if (done) break;
          if (offset+value.byteLength>start+part.bytes) throw partsError('PART_LENGTH');
          joined.set(value,offset); offset+=value.byteLength;
          onProgress({phase:'loading',loaded:offset,total:source.bytes});
        }
      } catch(error) { await reader.cancel().catch(()=>{});throw error; }
      finally { reader.releaseLock(); }
    } else {
      const bytes=new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength!==part.bytes) throw partsError('PART_LENGTH');
      joined.set(bytes,offset);offset+=bytes.byteLength;
      onProgress({phase:'loading',loaded:offset,total:source.bytes});
    }
    if (offset-start!==part.bytes) throw partsError('PART_LENGTH');
    if (await digestHex(joined.subarray(start,offset))!==part.sha256) throw partsError('PART_SHA');
  }
  abortCheck(signal);
  if (offset!==source.bytes) throw partsError('MOVIE_LENGTH');
  onProgress({phase:'verifying',loaded:offset,total:source.bytes});
  if (await digestHex(joined)!==source.sha256) throw partsError('MOVIE_SHA');
  abortCheck(signal);
  return joined;
}

function bindFilmPartControls() {
  const videos=new Map(Array.from(document.querySelectorAll('video[data-somogy-film]'),video=>[video.dataset.somogyFilm,video]));
  const states=new Map();
  let configPromise;
  const number=new Intl.NumberFormat('hu-HU',{maximumFractionDigits:1});
  const getConfig=async()=>{
    configPromise??=fetch('media-config.json').then(async response=>{
      if (!response.ok) throw partsError('MISSING_CONFIG');
      const config=await response.json();
      if (config.schema_version!==1 || config.property_id!==document.body.dataset.propertyId
          || Object.keys(config.films||{}).sort().join('|')!==[...FILM_KINDS].sort().join('|')) throw partsError('INVALID_MANIFEST');
      return config;
    }).catch(error=>{configPromise=null;throw error;});
    return configPromise;
  };
  for (const button of document.querySelectorAll('[data-load-film]')) {
    const kind=button.dataset.loadFilm,video=videos.get(kind);
    const cancel=document.querySelector(`[data-cancel-film="${kind}"]`);
    const progress=document.querySelector(`[data-film-progress="${kind}"]`);
    const status=document.querySelector(`[data-film-load-status="${kind}"]`);
    const download=document.querySelector(`[data-download-film="${kind}"]`);
    const state={controller:null,url:null,loading:false,source:null};states.set(kind,state);
    const clearSource=()=>{
      video.pause();video.removeAttribute('src');video.load();video.controls=false;
      video.dataset.sourceVerified='false';delete video.dataset.verifiedSha256;
      if (state.url) URL.revokeObjectURL(state.url);
      state.url=null;download.disabled=true;
    };
    cancel.addEventListener('click',()=>state.controller?.abort());
    button.addEventListener('click',async()=>{
      if (state.loading) return;
      state.loading=true;button.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;
      clearSource();state.controller=new AbortController();status.textContent='A teljes minőségű film betöltése folyamatban…';
      try {
        const config=await getConfig();const source=config.films[kind];
        if (source.kind!==kind) throw partsError('INVALID_MANIFEST');
        const bytes=await assembleFilmParts(source,{signal:state.controller.signal,onProgress:({phase,loaded,total})=>{
          progress.max=total;progress.value=loaded;
          status.textContent=phase==='verifying'?'A betöltött film ellenőrzése…':`Betöltés: ${number.format(loaded/1e6)} / ${number.format(total/1e6)} MB`;
        }});
        state.url=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));state.source=source;
        video.src=state.url;video.controls=true;video.load();
        video.dataset.sourceVerified='true';video.dataset.verifiedSha256=source.sha256;
        download.disabled=false;button.textContent='Film újratöltése';
        status.textContent='A film betöltve. Indítsd el a lejátszón; az eredeti kép- és hangminőség megmaradt.';
        // No play() call, seeking or playback-rate assignment: the next native
        // HTML5 play action is the user's gesture and is handled by coordination.
      } catch(error) {
        clearSource();button.textContent='Betöltés újrapróbálása';
        if (error.code==='ABORTED'||error.name==='AbortError') status.textContent='Betöltés megszakítva. Újraindíthatod.';
        else if (['PART_SHA','MOVIE_SHA','PART_LENGTH','MOVIE_LENGTH','INVALID_PART_ORDER','INVALID_MANIFEST'].includes(error.code)) status.textContent='A film adatai nem egyeznek. A lejátszás nem indult el; próbáld újra.';
        else if (error.code==='SECURE_CONTEXT_REQUIRED') status.textContent='Az ellenőrzött filmhez biztonságos kapcsolat szükséges. Nyisd meg a honlap HTTPS-címét.';
        else status.textContent='A film most nem tölthető be. Ellenőrizd a kapcsolatot, majd próbáld újra.';
      } finally {state.loading=false;state.controller=null;button.disabled=false;cancel.hidden=true;}
    });
    download.addEventListener('click',()=>{
      if (!state.url||!state.source||video.dataset.sourceVerified!=='true') return;
      const link=document.createElement('a');link.href=state.url;link.download=state.source.download_filename;
      document.body.append(link);link.click();link.remove();
    });
    video.addEventListener('error',()=>{
      if (state.url&&video.error) status.textContent='A film adatai betöltődtek, de a böngésző nem tudja lejátszani. A teljes MP4 letölthető.';
    });
    state.clearSource=clearSource;state.button=button;state.status=status;
  }
  window.addEventListener('pagehide',()=>{
    for (const state of states.values()) {
      state.controller?.abort();state.clearSource();
      state.button.textContent='Film betöltése';state.status.textContent='A teljes minőségű film újra betölthető.';
    }
  });
}

export function bindExclusivePlayers(players, lifecycle) {
  const list = Array.from(players);
  const ids = new Set(list.map(player => player.id));
  if (list.length !== 6 || ids.size !== 6 || list.some(player => !player.id)) {
    throw new Error('A bemutató hat külön filmlejátszót igényel.');
  }
  const bindings = [];
  for (const active of list) {
    const stopOthers = () => {
      for (const other of list) if (other !== active && !other.paused) other.pause();
    };
    active.addEventListener('play', stopOthers);
    active.addEventListener('playing', stopOthers);
    bindings.push([active, 'play', stopOthers], [active, 'playing', stopOthers]);
  }
  const stopAll = () => {
    for (const player of list) if (!player.paused) player.pause();
  };
  if (lifecycle) {
    lifecycle.addEventListener('pagehide', stopAll);
    bindings.push([lifecycle, 'pagehide', stopAll]);
  }
  return () => {
    for (const [target, event, handler] of bindings) target.removeEventListener(event, handler);
  };
}

if (typeof document !== 'undefined' && document.body?.dataset.somogyPlayers==='six-film-presentation-v3') {
  const start = () => {
    bindExclusivePlayers(document.querySelectorAll('video[data-somogy-film]'), window);
    bindFilmPartControls();
    const button = document.querySelector('#download-model');
    const status = document.querySelector('#model-download-status');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = 'A 3D-modell letöltése készül…';
      let objectUrl;
      try {
        const response = await fetch('viewer-config.json');
        if (!response.ok) throw new Error('Nézetadatok nem érhetők el');
        const config = await response.json();
        if (config.property_id !== document.body.dataset.propertyId) throw new Error('Eltérő bemutató');
        const names = config.model.parts;
        if (!Array.isArray(names) || !names.length) throw new Error('Hiányos modell');
        const chunks = [];
        for (const name of names) {
          if (!/^model-[a-f0-9]{12}-\d{2,}\.bin$/.test(name)) throw new Error('Hibás modellrész');
          const part = await fetch(name);
          if (!part.ok) throw new Error('Modellrész nem érhető el');
          chunks.push(await part.arrayBuffer());
        }
        const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        if (length !== config.model.bytes) throw new Error('Hiányos modell');
        const joined = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { joined.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
        const digest = await crypto.subtle.digest('SHA-256', joined);
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actual !== config.model.sha256) throw new Error('A letöltött modell sérült');
        objectUrl = URL.createObjectURL(new Blob([joined], {type:'model/gltf-binary'}));
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = [config.property_id, 'glb'].join('.');
        document.body.append(link); link.click(); link.remove();
        status.textContent = 'A modell letöltése elindult.';
      } catch {
        status.textContent = 'A modell most nem tölthető le. A körbejáró film külön letölthető.';
      } finally {
        if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        button.disabled = false;
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
}
