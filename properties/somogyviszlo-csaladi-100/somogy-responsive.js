// Lightweight gallery renditions; the lightbox always retains full masters.
const source=document.getElementById('responsive-image-map');
const rows=source?JSON.parse(source.textContent):[];
const byFile=new Map(rows.map(row=>[row.file,row]));
const gallery=document.getElementById('gallery');
const sizes='(max-width:650px) calc((100vw - 56px) / 2), (max-width:1440px) calc((100vw - 164px) / 3), 426px';
function applyPreviews(){
  for(const img of gallery.querySelectorAll('img')){
    const file=new URL(img.getAttribute('src'),location.href).pathname.split('/').pop();
    const row=byFile.get(file);
    if(!row)continue;
    const set=`${row.preview} ${row.width}w, ${row.file} ${row.full_width}w`;
    if(img.getAttribute('srcset')!==set)img.setAttribute('srcset',set);
    if(img.getAttribute('sizes')!==sizes)img.setAttribute('sizes',sizes);
  }
}
if(gallery&&rows.length){
  applyPreviews();
  new MutationObserver(applyPreviews).observe(gallery,{childList:true,subtree:true});
}
