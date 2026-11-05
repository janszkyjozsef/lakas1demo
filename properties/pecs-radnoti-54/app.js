(() => {
 const options=Array.from(document.querySelectorAll('[data-option]'));
 const sets=Array.from(document.querySelectorAll('[data-products]'));
 const empty=document.querySelector('#product-empty');
 const map={living:'nappali',office:'halo',original:null};
 function show(id){const selected=map[id]??null;options.forEach(b=>{const active=b.dataset.option===selected;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});sets.forEach(p=>p.hidden=p.dataset.products!==selected);empty.hidden=selected!==null;}
 document.addEventListener('otthoniv-variant',event=>{const id=event.detail.id;show(id);const room=id==='living'?'erkely':id==='office'?'masik':null;if(room)document.querySelector(`[data-room="${room}"]`)?.click();});
 options.forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.option==='nappali'?'living':'office';show(id);const viewerButton=document.querySelector(`[data-variant="${id}"]`);if(viewerButton&&!viewerButton.disabled)viewerButton.click();}));
})();
