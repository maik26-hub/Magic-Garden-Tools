/** Explicit plot roles. Storage uses native tile indexes; no server actions here. */
function createFieldPlan(storage) {
  'use strict';
  const key = 'magic_garden_field_roles_v1';
  const legacyKey = 'magic_garden_selected_tiles_v1';
  const validId = id => Number.isInteger(id) && id >= 0 && id < 200;
  const validMode = mode => ['none', 'plant', 'egg'].includes(mode);
  const tileId = (side, i) => ['left','right'].includes(side) && Number.isInteger(i) && i >= 0 && i < 100
    ? Math.floor(i / 10) * 20 + i % 10 + (side === 'right' ? 10 : 0) : -1;
  let modes = Array(200).fill('none'), migrated = false, notice = '';
  function decode(raw) {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.modes) || data.modes.length !== 200 || !data.modes.every(validMode)) throw Error('Ungültiger Feldplan');
    return data.modes.slice();
  }
  function persist() {
    try {
      storage.setItem(key, JSON.stringify({version: 1, modes}));
      // A downgrade must not accidentally harvest blue egg fields.
      const legacy = {left: [], right: []};
      for (const side of ['left','right']) for (let i=0; i<100; i++) if (get(tileId(side,i)) === 'plant') legacy[side].push(i);
      storage.setItem(legacyKey, JSON.stringify(legacy));
      return true;
    } catch { notice = 'Feldplan nur für diesen Tab geändert: Speichern nicht möglich.'; return false; }
  }
  try {
    const raw = storage.getItem(key);
    if (raw !== null) modes = decode(raw);
    else {
      const old = JSON.parse(storage.getItem(legacyKey) || '{}');
      for (const side of ['left','right']) for (const value of Array.isArray(old?.[side]) ? old[side] : []) {
        const id = tileId(side, Number(value));
        if (validId(id)) modes[id] = 'plant';
      }
      migrated = modes.some(m => m === 'plant');
      if (migrated) notice = 'Bisher ausgewählte Felder sind grün. Eierfelder bitte blau markieren.';
      persist();
    }
  } catch { notice = 'Gespeicherter Feldplan unlesbar. Zur Sicherheit sind alle Felder grau.'; }
  function get(id) { return validId(id) ? modes[id] : 'none'; }
  function set(id, mode) {
    if (!validId(id) || !validMode(mode)) return false;
    const changed = modes[id] !== mode; modes[id] = mode; if (changed && migrated) notice = ''; return changed;
  }
  function next(id) { return {none:'plant',plant:'egg',egg:'none'}[get(id)]; }
  function indices(mode) { return modes.flatMap((m,i) => (mode ? m === mode : m !== 'none') ? [i] : []); }
  function counts() { return {plant:indices('plant').length,egg:indices('egg').length,none:indices('none').length}; }
  function reload(raw) { try { modes = decode(raw); notice = ''; return true; } catch { return false; } }
  return {key, get, set, next, tileId, indices, counts, persist, reload,
    snapshot:()=>modes.slice(), notice:()=>notice, migrated};
}

/** Grey -> plants -> eggs click cycle, plus explicit brushes for drag painting. */
function mountFieldGrid(container, plan, onChange) {
  'use strict';
  const doc = container.ownerDocument, win = doc.defaultView;
  const labels = {none:'Ignorieren',plant:'Pflanzen',egg:'Eier'};
  const symbols = {none:'–',plant:'P',egg:'E'};
  const colors = {none:'#514d47',plant:'#416f43',egg:'#355f92'};
  const buttons = new Map(), brushes = new Map();
  let brush = 'cycle', stroke = null;
  function el(tag, cls, text) { const n=doc.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  const style = el('style');
  style.textContent = `
#mg-autofarm-v13 .mg-field-brushes {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0}
#mg-autofarm-v13 .mg-field-brushes button {display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px!important}
#mg-autofarm-v13 .mg-field-brushes [aria-pressed="true"] {outline:2px solid var(--mg-focus);outline-offset:-2px}
#mg-autofarm-v13 .mg-field-swatch {width:10px;height:10px;border-radius:3px;display:inline-block;flex:none}
#mg-autofarm-v13 .mg-field-help,#mg-autofarm-v13 .mg-field-notice {font-size:11px;color:var(--mg-muted);line-height:1.5;margin:7px 0}
#mg-autofarm-v13 .mg-field-counts {font-size:11px;font-weight:600;line-height:1.6;padding:7px 0}
#mg-autofarm-v13.mg-compact [data-mg-field] {position:relative;line-height:1!important;background:#514d47!important;color:#fff!important;border-color:#69645b!important}
#mg-autofarm-v13.mg-compact [data-mg-field][data-mode="plant"] {background:#416f43!important;border-color:#88aa72!important}
#mg-autofarm-v13.mg-compact [data-mg-field][data-mode="egg"] {background:#355f92!important;border-color:#87b5df!important}
#mg-autofarm-v13 [data-mg-field] small {position:absolute;right:1px;bottom:0;font-size:6px!important;line-height:1!important;color:#fff!important;pointer-events:none}
#mg-autofarm-v13 .mg-field-grid {display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px;touch-action:none}
#mg-autofarm-v13 .mg-field-side {font-size:12px;font-weight:650;margin:10px 0 6px}
#mg-autofarm-v13 .mg-field-actions {display:flex;gap:6px;margin:10px 0}
`;
  container.appendChild(style);
  const toolbar=el('div','mg-field-brushes');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Feldfarbe wählen');
  for(const mode of ['cycle','plant','egg','none']){
    const b=el('button');b.type='button';b.dataset.fieldBrush=mode;
    if(mode!=='cycle'){const dot=el('span','mg-field-swatch');dot.style.background=colors[mode];b.appendChild(dot);}
    b.appendChild(doc.createTextNode(mode==='cycle'?'Farben wechseln':labels[mode]));
    b.setAttribute('aria-label',mode==='cycle'?'Farben durchwechseln':labels[mode]+' malen');
    b.addEventListener('click',()=>{brush=mode;refresh();});brushes.set(mode,b);toolbar.appendChild(b);
  }
  container.appendChild(toolbar);
  const help=el('p','mg-field-help');container.appendChild(help);
  const counts=el('div','mg-field-counts');counts.setAttribute('aria-live','polite');container.insertBefore(counts,toolbar);
  const notice=el('p','mg-field-notice');container.appendChild(notice);
  function display(id){
    const b=buttons.get(id),m=plan.get(id); if(!b)return;
    b.dataset.mode=m;b.setAttribute('aria-pressed',String(m!=='none'));
    b.setAttribute('aria-label',b.dataset.location+' – '+labels[m]);b.title=b.getAttribute('aria-label');
    b.querySelector('small').textContent=symbols[m];
  }
  function notify(){plan.persist();refresh();onChange();}
  for(const side of ['left','right']){
    container.appendChild(el('div','mg-field-side',side==='left'?'Linke Gartenhälfte':'Rechte Gartenhälfte'));
    const grid=el('div','mg-field-grid');grid.setAttribute('aria-label',side==='left'?'Linke Gartenhälfte':'Rechte Gartenhälfte');
    for(let i=0;i<100;i++){
      const id=plan.tileId(side,i),b=el('button');b.type='button';
      b.dataset.mgField='1';b.dataset.side=side;b.dataset.index=String(i);b.dataset.tile=String(id);
      b.dataset.location=`${side==='left'?'Links':'Rechts'}: Reihe ${Math.floor(i/10)+1}, Spalte ${i%10+1}`;
      b.append(doc.createTextNode(String(i+1)),el('small'));
      b.addEventListener('click',event=>{if(event.detail!==0)return;plan.set(id,brush==='cycle'?plan.next(id):brush);notify();});
      buttons.set(id,b);display(id);grid.appendChild(b);
    }
    container.appendChild(grid);
  }
  const actions=el('div','mg-field-actions');
  for(const [label,side]of [['Links füllen','left'],['Rechts füllen','right']]){
    const b=el('button','',label);b.type='button';b.addEventListener('click',()=>{
      const mode=brush==='cycle'?'plant':brush;
      for(let i=0;i<100;i++)plan.set(plan.tileId(side,i),mode);notify();
    });actions.appendChild(b);
  }
  const clear=el('button','','Alles grau');clear.type='button';clear.addEventListener('click',()=>{for(let i=0;i<200;i++)plan.set(i,'none');notify();});actions.appendChild(clear);container.appendChild(actions);
  function hit(target){const b=target?.closest?.('[data-mg-field]');return b&&container.contains(b)?Number(b.dataset.tile):null;}
  function paint(id){if(id===null||!stroke||stroke.seen.has(id))return;stroke.seen.add(id);if(plan.set(id,stroke.mode)){stroke.changed=true;display(id);updateCounts();}}
  function paintLine(x,y){if(!stroke)return;const old=stroke.last,steps=Math.min(350,Math.max(1,Math.ceil(Math.hypot(x-old.x,y-old.y)/6)));for(let i=1;i<=steps;i++)paint(hit(doc.elementFromPoint(old.x+(x-old.x)*i/steps,old.y+(y-old.y)*i/steps)));stroke.last={x,y};}
  function finish(event){if(!stroke||(event?.pointerId!=null&&event.pointerId!==stroke.id))return;if(event?.type==='pointerup')paintLine(event.clientX,event.clientY);const s=stroke;stroke=null;try{if(container.hasPointerCapture?.(s.id))container.releasePointerCapture(s.id);}catch{}if(s.changed)notify();}
  container.addEventListener('pointerdown',event=>{if(stroke||event.button!==0||event.isPrimary===false)return;const id=hit(event.target);if(id===null)return;stroke={id:event.pointerId,mode:brush==='cycle'?plan.next(id):brush,seen:new Set(),last:{x:event.clientX,y:event.clientY},changed:false};paint(id);try{container.setPointerCapture?.(event.pointerId);}catch{}event.preventDefault();});
  container.addEventListener('pointermove',event=>{if(!stroke||event.pointerId!==stroke.id)return;paintLine(event.clientX,event.clientY);event.preventDefault();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(type,finish);
  win.addEventListener('pointerup',finish);win.addEventListener('blur',()=>finish());
  win.addEventListener('storage',event=>{if(event.key===plan.key&&plan.reload(event.newValue)){refresh();onChange();}});
  function updateCounts(){const c=plan.counts();counts.textContent=`Grün ${c.plant} · Blau ${c.egg} · Grau ${c.none}`;}
  function refresh(){
    for(const id of buttons.keys())display(id);for(const [mode,b]of brushes)b.setAttribute('aria-pressed',String(brush===mode));
    help.textContent=brush==='cycle'?'Klick: Grau → Grün → Blau → Grau. Beim Ziehen gilt die Farbe des Startfelds.':`${labels[brush]}: Klicken oder gedrückt halten und über Felder ziehen.`;
    updateCounts();notice.textContent=plan.notice();notice.hidden=!notice.textContent;
  }
  refresh();return {refresh,counts};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createFieldPlan,mountFieldGrid};
