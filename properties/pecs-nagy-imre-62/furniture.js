const panel = document.querySelector('#furnishing-panel');
const choices = document.querySelector('#furnishing-choices');
const products = document.querySelector('#furnishing-products');
const status = document.querySelector('#furnishing-status');
const totals = document.querySelector('#furnishing-comparison');
let data, available = new Set(['original']), current = 'original';
const shortNames={original:'Eredeti',bedroom:'Hálószoba',office_guest:'Dolgozó és vendégszoba'};
document.querySelectorAll('a[href="#berendezes"]').forEach(link=>link.addEventListener('click',()=>{document.querySelector('#berendezes').open=true;}));
const money = n => new Intl.NumberFormat('hu-HU',{style:'currency',currency:'HUF',maximumFractionDigits:0}).format(n);
function el(tag, text, className) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function dimensions(value) {
  if(typeof value==='string')return value;
  if(!value||typeof value!=='object')return '';
  if(['width_cm','depth_cm','height_cm'].every(key=>Number.isFinite(value[key])))return `${value.width_cm} × ${value.depth_cm} × ${value.height_cm} cm (szélesség × mélység × magasság)`;
  if(Number.isFinite(value.height_cm))return `Magasság: ${value.height_cm} cm`;
  return '';
}
function readerNote(value) {
  return String(value).replace('JS/címfüggő','címtől függ').replace('betét/ajtó nélkül modellezendő','betét és ajtó nélkül szerepel a tervben').replace(/Nem kell a 3D-be modellezni\.?/g,'').trim();
}
function sum(variant) {
  const items=variant.items||[],known=items.filter(i=>Number.isFinite(i.unit_price_huf)&&Number.isInteger(i.quantity)&&i.quantity>0);
  return {amount:known.reduce((n,i)=>n+i.unit_price_huf*i.quantity,0),complete:known.length===items.length,count:items.reduce((n,i)=>n+(i.quantity||0),0)};
}
function selection(id, announce=true) {
  if(!data)return;
  const variant=data.variants.find(v=>v.id===id);if(!variant)return;
  current=id;
  choices.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.variant===id)));
  products.replaceChildren();
  products.append(el('h3',variant.name),el('p',variant.description||'', 'furnishing-description'));
  if(id==='original')products.append(el('p','Nincs hozzáadott virtuális bútor. Az eredeti fotókkal alá nem támasztott szobarészletek továbbra is jelölt közelítések.','subtle'));
  else {
    const table=document.createElement('table');table.className='product-table';
    const caption=el('caption','Magyarországi beszerzési lehetőségek');table.append(caption);
    const head=document.createElement('thead'),hr=document.createElement('tr');
    for(const title of ['Termék','Darab','Egységár','Összeg']){const th=el('th',title);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
    const body=document.createElement('tbody');
    for(const item of variant.items||[]) {
      const row=document.createElement('tr'),description=document.createElement('td');
      const link=el('a',item.name);const url=new URL(item.url);
      if(url.protocol!=='https:')throw new Error('A terméklink nem HTTPS');
      link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';description.append(link);
      description.append(el('small',item.retailer||''));
      if(dimensions(item.dimensions))description.append(el('small',dimensions(item.dimensions)));
      if(item.notes?.length)description.append(el('small',item.notes.map(readerNote).join(' ')));
      if(item.delivery_note)description.append(el('small',readerNote(item.delivery_note),'delivery-note'));
      row.append(description,el('td',String(item.quantity)),el('td',Number.isFinite(item.unit_price_huf)?money(item.unit_price_huf):'Nem ismert'),el('td',Number.isFinite(item.unit_price_huf)?money(item.unit_price_huf*item.quantity):'—'));
      body.append(row);
    }
    table.append(body);const scroll=el('div',undefined,'table-scroll');scroll.append(table);products.append(scroll);
    const total=sum(variant);products.append(el('p',`${total.complete?'Termékek összege':'Ismert termékárak részösszege'}: ${money(total.amount)}`,'furnishing-total'));
    products.append(el('p','A szállítás és az esetleges összeszerelés díja külön fizetendő, az összeg nem tartalmazza. A készlet és az ár a kereskedő oldalán ellenőrizendő.','subtle'));
    for(const note of variant.notes||[])products.append(el('p',note,'subtle'));
  }
  const applies=available.has(id);
  status.textContent=id==='original'?'Eredeti modellállapot — nincs hozzáadott virtuális berendezés.':applies?'Virtuális berendezési ötlet: a bútorok nem részei a hirdetett lakásnak.':'A terméklista megtekinthető; a hozzá tartozó modellváltozat betöltés után érhető el.';
  if(announce)document.dispatchEvent(new CustomEvent('otthoniv:furnishing-select',{detail:{id}}));
}
document.addEventListener('otthoniv:model-ready',event=>{
  available=new Set(['original',...(event.detail?.stylingVariants||[])]);
  if(data)selection(current,true);
});
document.addEventListener('otthoniv:furnishing-unavailable',()=>{
  status.textContent='Ehhez a berendezési ötlethez nincs betöltött modellváltozat. A terméklista tájékoztató; a térben az eredeti állapot látszik.';
});
try {
  const response=await fetch('furniture-options.json');
  if(!response.ok)throw new Error('A berendezési adatok még nem érkeztek meg');
  data=await response.json();
  if(data.property_id!==document.body.dataset.propertyId||data.currency!=='HUF'||!Array.isArray(data.variants))throw new Error('Hiányos berendezési adat');
  const names=new Set();
  for(const variant of data.variants){
    if(!variant.id||names.has(variant.id)||!variant.name||!Array.isArray(variant.items))throw new Error('Hibás berendezési változat');names.add(variant.id);
    for(const item of variant.items)if(!item.name||!item.url||!Number.isInteger(item.quantity)||item.quantity<1||!Number.isFinite(item.unit_price_huf)||item.unit_price_huf<0)throw new Error('Hiányos ár vagy termék');
  }
  choices.replaceChildren(...data.variants.map(variant=>{
    const button=el('button',shortNames[variant.id]||variant.name);button.type='button';button.dataset.variant=variant.id;button.setAttribute('aria-pressed',String(variant.id==='original'));
    button.addEventListener('click',()=>selection(variant.id));return button;
  }));
  const comparison=document.createElement('div');comparison.className='furnishing-cost-cards';
  for(const variant of data.variants.filter(v=>v.id!=='original')) {
    const total=sum(variant),card=el('div');card.append(el('p',variant.name),el('strong',money(total.amount)),el('small',`${total.count} db termék · szállítás nélkül`));comparison.append(card);
  }
  totals.replaceChildren(comparison);
  if(data.comparison_note)totals.append(el('p',data.comparison_note,'furnishing-description'));
  const date=new Date(data.checked_at),dateText=Number.isNaN(date.valueOf())?data.checked_at:new Intl.DateTimeFormat('hu-HU',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Budapest'}).format(date);
  document.querySelector('#furnishing-date').textContent=`Árak ellenőrizve: ${dateText}. ${data.disclosure||'Az árak és készletek változhatnak.'}`;
  selection('original',false);
  panel.dataset.ready='true';
} catch(error) {
  panel.dataset.ready='false';status.textContent='A virtuális berendezési ötletek és a magyarországi beszerzési lista előkészítés alatt állnak.';
  products.replaceChildren();totals.replaceChildren();
}
