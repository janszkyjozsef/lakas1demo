// Dedicated accepted photo-film sound control; existing five-player coordination remains unchanged.
const video=document.getElementById('property-video');
const button=document.getElementById('somogy-photo-v2-sound');
const status=document.getElementById('somogy-photo-v2-sound-status');
if(video&&button&&status){
 video.muted=true;
 const reflect=()=>{const on=!video.muted&&video.volume>0;button.textContent=on?'Hang kikapcsolása':'Hang bekapcsolása';button.setAttribute('aria-pressed',String(on));status.textContent=on?'A zene be van kapcsolva.':'A lejátszó néma. A zene külön bekapcsolható.';};
 button.addEventListener('click',()=>{if(video.muted||video.volume===0){video.volume=.7;video.muted=false;}else video.muted=true;reflect();});
 video.addEventListener('volumechange',reflect);reflect();
}
