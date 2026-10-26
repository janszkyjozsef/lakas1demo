/** Progressive filtering over statically rendered catalog cards. */
export const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hu-HU').trim().replace(/\s+/g,' ');
export function matchesCard(card,query,type){const tokens=normalizeSearch(query).split(' ').filter(Boolean);return(type==='all'||card.type===type)&&tokens.every(token=>normalizeSearch(card.search).includes(token));}
export function filterItems(items,query='',type='all'){return items.filter(item=>matchesCard(item,query,type));}
function init(){
 const grid=document.querySelector('#property-grid');if(!grid)return;
 const cards=Array.from(grid.querySelectorAll('[data-property-id]'));
 const search=document.querySelector('#property-search'),filters=Array.from(document.querySelectorAll('[data-filter-type]')),controls=document.querySelector('#catalog-controls'),status=document.querySelector('#catalog-status'),empty=document.querySelector('#empty-state'),reset=document.querySelector('#reset-filters');
 let selected='all';controls.hidden=false;
 const update=()=>{
  let count=0;for(const node of cards){const shown=matchesCard({type:node.dataset.propertyType,search:node.dataset.search},search.value,selected);node.hidden=!shown;if(shown)count++;}
  status.textContent=`${count} / ${cards.length} bemutató`;empty.hidden=count!==0;reset.hidden=selected==='all'&&!search.value.trim();
  for(const button of filters)button.setAttribute('aria-pressed',String(button.dataset.filterType===selected));
 };
 search.addEventListener('input',update);
 for(const button of filters)button.addEventListener('click',()=>{selected=button.dataset.filterType;update();});
 const resetAll=()=>{selected='all';search.value='';update();search.focus();};
 reset.addEventListener('click',resetAll);document.querySelector('#empty-reset').addEventListener('click',resetAll);
 document.querySelector('#search-form').addEventListener('submit',event=>event.preventDefault());
 update();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
