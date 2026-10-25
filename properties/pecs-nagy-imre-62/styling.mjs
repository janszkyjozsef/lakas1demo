// Independent, exclusive virtual furnishing roots. Never changes architecture.
// Construct before the common wall controller captures visibility baselines.
export function createStylingController(root,{propertyId,mapping={}}={}) {
  if(root.userData?.property_id!==propertyId)throw new Error('Eltérő berendezési ingatlanazonosító');
  const records=new Map();
  for(const [id,name] of Object.entries(mapping)) {
    if(id==='original')throw new Error('Az eredeti állapotnak nem lehet virtuális bútorcsoportja');
    const matches=[];root.traverse(node=>{if(node.name===name)matches.push(node);});
    if(matches.length!==1||matches[0].userData?.styling_variant!==id)throw new Error('Eltérő virtuális berendezési csoport');
    const node=matches[0];
    for(let parent=node;parent;parent=parent.parent)if(['walls','roof'].includes(parent.userData?.otthoniv_visibility))throw new Error('Virtuális bútor fal- vagy mennyezetcsoportban');
    records.set(id,node);
  }
  const roots=new Set(records.values());
  for(const node of roots)for(let parent=node.parent;parent;parent=parent.parent)if(roots.has(parent))throw new Error('Egymásba ágyazott berendezési változatok');
  // The authoring default may hide a selectable root. All children keep their own
  // baseline; only the selectable root is normalized before first render.
  for(const node of roots)node.visible=true;
  let selected='original';
  function apply({hiddenLevels=[]}={}) {
    const hidden=new Set(hiddenLevels);
    for(const [id,node] of records) {
      let blocked=false;
      for(let parent=node;parent;parent=parent.parent)if(hidden.has(parent.userData?.level_id))blocked=true;
      node.visible=id===selected&&!blocked;
    }
  }
  function select(id,snapshot) {
    if(id!=='original'&&!records.has(id))throw new Error('Ismeretlen berendezési változat');
    selected=id;apply(snapshot);
  }
  return Object.freeze({select,apply,ids:()=>[...records.keys()],snapshot:()=>({selected})});
}
