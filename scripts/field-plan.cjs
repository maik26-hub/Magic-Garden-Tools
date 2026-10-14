'use strict';
module.exports = function applyFieldPlan(src, fieldSource) {
  function replace(a,b,name){const parts=src.split(a);if(parts.length!==2)throw Error(`Field plan ${name}: ${parts.length-1} anchors`);src=parts[0]+b+parts[1];}
  function section(a,b,replacement,name){const start=src.indexOf(a),end=src.indexOf(b,start);if(start<0||end<0)throw Error('Field plan '+name);src=src.slice(0,start)+replacement+'\n\n  '+src.slice(end);}
  replace('  let compactMenu = null;',fieldSource+'\n  let compactMenu = null;\n  let fieldGrid = null;','inline');
  section('// ===== Feldwahl:', '// ===== Eigene Spielanbindung', `// ===== Eindeutige Feldrollen: Grau ignorieren, Grün Pflanzen, Blau Eier =====
  const fieldPlan = createFieldPlan(localStorage);
  function selectedSlots(mode) { return new Set(fieldPlan.indices(mode)); }`, 'state');
  replace('    const chosen = selectedSlots();','    const chosen = selectedSlots("plant");','harvest plots');
  // Guard every plot-bound command immediately before sending. An in-flight
  // command already accepted by the server cannot be undone by recoloring.
  replace('      const generation = bridge.generation;',`      const plotTypes = {HarvestCrop:'plant', PlantSeed:'plant', WaterPlant:'plant', GrowEgg:'egg', HatchEgg:'egg'};
      const needed = plotTypes[command.type] || (command.type === 'LogItem' && command.target?.kind === 'growSlot' ? 'plant' : null);
      const plot = command.type === 'LogItem' ? command.target?.slot : command.slot;
      if (needed && fieldPlan.get(plot) !== needed) {
        const error = new Error('Feldrolle geändert – Aktion ausgelassen'); error.code = 'field_role_changed';
        return reject(error);
      }
      const generation = bridge.generation;`, 'wire guard');
  replace('  async function handleError(error, target) {\n    const msg',`  async function handleError(error, target) {
    if (error?.code === 'field_role_changed') return;
    const msg`,'role skip');
  section('function repaintFields() {', 'function createPanel() {', `function repaintFields() {
    fieldGrid?.refresh();
    updatePanel();
  }`, 'grid implementation');
  section('const hint = document.createElement("small");\n    hint.textContent = "Feld anklicken', 'body.appendChild(fields);',`fieldCount.hidden = true;
    fieldGrid = mountFieldGrid(fields, fieldPlan, () => updatePanel());`, 'mount');
  replace('    if (fieldCount) fieldCount.textContent = `Ausgewählt: ${selectedSlots().size} / 200`;',
    '    if (fieldCount) { const c = fieldPlan.counts(); fieldCount.textContent = `Pflanzen: ${c.plant} · Eier: ${c.egg} · Ignoriert: ${c.none}`; }','counts');
  replace('heldId:bridge.heldId,selected:[...selectedSlots()].sort((a,b)=>a-b)',
    'heldId:bridge.heldId,selected:[...selectedSlots()].sort((a,b)=>a-b),fieldModes:fieldPlan.snapshot()','snapshot');
  replace('setNumberPreference, automation,','setNumberPreference, automation, fieldPlan,','API');
  replace('      selectedFieldCount: selectedSlots().size,','      selectedFieldCount: selectedSlots().size,\n      fieldRoles: fieldPlan.counts(),','diagnostics');
  return src;
};
