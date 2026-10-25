// Blender custom properties are preserved as glTF extras / Three.js userData.
// Construct only after the entire model has loaded; rebuild after replacing it.
export function createVisibilityController(root, { propertyId, onChange = () => {} } = {}) {
  if (!propertyId || root.userData?.property_id !== propertyId) {
    throw new Error('Eltérő vagy hiányzó ingatlanazonosító');
  }
  const modes = new Set(['shown', 'hidden', 'auto']);
  const groups = new Set(['walls', 'roof', 'permanent']);
  const records = [], byName = new Map(), levels = new Set();
  function collect(node, inherited = { group: 'permanent', level: null }) {
    const data = node.userData || {};
    const group = data.otthoniv_visibility ?? inherited.group;
    const level = data.level_id ?? inherited.level;
    if (!groups.has(group)) throw new Error(`Ismeretlen láthatósági csoport: ${group}`);
    if (inherited.group !== 'permanent' && group !== inherited.group) {
      throw new Error(`Eltérő csoport a rejtendő szülő alatt: ${node.name}`);
    }
    if (inherited.level && level !== inherited.level) {
      throw new Error(`Eltérő szint a szülő alatt: ${node.name}`);
    }
    if (node.name) {
      if (byName.has(node.name)) throw new Error(`Nem egyedi modellnév: ${node.name}`);
      byName.set(node.name, node);
    }
    if (level) levels.add(level);
    records.push({node, group, level, baseline: node.visible});
    for (const child of node.children || []) collect(child, {group, level});
  }
  collect(root);
  let wallMode = 'shown';
  let hiddenLevels = new Set(), hiddenNodes = new Set();
  function apply() {
    for (const {node, group, level, baseline} of records) {
      const manualWall = group === 'walls' && wallMode !== 'auto';
      const hiddenByView = hiddenNodes.has(node.name) && !manualWall;
      node.visible = baseline && !hiddenLevels.has(level) && !hiddenByView
        && !(group === 'walls' && wallMode === 'hidden');
    }
    onChange(snapshot());
  }
  function snapshot() {
    return {wallMode, hiddenLevels: [...hiddenLevels], hiddenNodes: [...hiddenNodes]};
  }
  function setWallMode(mode) {
    if (!modes.has(mode)) throw new Error(`Ismeretlen falállapot: ${mode}`);
    wallMode = mode;
    apply();
  }
  function setView({hide_levels = [], hide_nodes = []} = {}) {
    if (!Array.isArray(hide_levels) || hide_levels.some(id => !levels.has(id))) {
      throw new Error('Ismeretlen szintnézet');
    }
    if (!Array.isArray(hide_nodes) || hide_nodes.some(name => !byName.has(name))) {
      throw new Error('Ismeretlen nézetbeli modellrész');
    }
    // A neutral parent containing walls would silently override "walls shown".
    // Cutaway views must address semantic wall/roof groups, not mixed containers.
    for (const name of hide_nodes) {
      const target = byName.get(name);
      const entry = records.find(record => record.node === target);
      if (entry.group === 'permanent') {
        throw new Error(`A nézet csak falat vagy tetőt rejthet el: ${name}`);
      }
    }
    hiddenLevels = new Set(hide_levels);
    hiddenNodes = new Set(hide_nodes);
    apply();
  }
  apply();
  return Object.freeze({setWallMode, setView, snapshot});
}

// Real native radios provide keyboard support and persist across camera changes.
export function mountWallControls(container, controller, {onChange = () => {}} = {}) {
  const doc = container.ownerDocument;
  const fieldset = doc.createElement('fieldset');
  fieldset.className = 'wall-controls';
  const legend = doc.createElement('legend');
  legend.textContent = 'Falak';
  fieldset.append(legend);
  const name = `walls-${globalThis.crypto.randomUUID()}`;
  for (const [value, text] of [['shown', 'Láthatók'], ['hidden', 'Elrejtve'], ['auto', 'Nézet szerint']]) {
    const label = doc.createElement('label');
    const input = doc.createElement('input');
    input.type = 'radio'; input.name = name; input.value = value;
    input.checked = controller.snapshot().wallMode === value;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      controller.setWallMode(value);
      onChange(controller.snapshot());
    });
    label.append(input, doc.createTextNode(text));
    fieldset.append(label);
  }
  container.append(fieldset);
  return fieldset;
}
