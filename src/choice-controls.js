/** Accessible catalog menus. Search text is never sent as an item identifier. */
function createChoiceControls(doc, save, getConfig) {
  'use strict';
  const normalize = text => String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const human = id => String(id||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ');
  const multiMenus = [];
  function options(select, choices, current, empty='Bitte wählen', unavailable=true) {
    const records = choices.slice();
    if(current&&!records.some(v=>v.id===current)&&unavailable)records.push({id:current,name:human(current)+' (gespeichert, derzeit nicht verfügbar)',unavailable:true});
    const signature=JSON.stringify(records.map(r=>[r.id,r.name,r.unavailable]));
    if(select.dataset.options!==signature){
      select.dataset.options=signature;select.replaceChildren();
      const blank=doc.createElement('option');blank.value='';blank.textContent=choices.length?empty:'Warte auf Spieldaten …';select.appendChild(blank);
      for(const r of records){const o=doc.createElement('option');o.value=r.id;o.textContent=r.name;o.disabled=!!r.unavailable;select.appendChild(o);}
    }
    // Updating loaded catalogs must not reset a user's selected value.
    if(select.value!==(current||''))select.value=current||'';
    select.disabled=choices.length===0;
  }
  function multi(parent,label,key,choiceKey){
    const wrap=doc.createElement('div');wrap.className='mg-choice-picker';wrap.dataset.choice=key;
    const title=doc.createElement('p');title.className='mg-choice-label';title.textContent=label;
    const details=doc.createElement('details');details.className='mg-choice-menu';
    const summary=doc.createElement('summary');summary.setAttribute('aria-label',label+' auswählen');summary.setAttribute('aria-expanded','false');details.appendChild(summary);
    details.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(details.open)));
    const search=doc.createElement('input');search.type='search';search.placeholder='Nach Namen suchen …';search.setAttribute('aria-label',label+' durchsuchen');
    const list=doc.createElement('div');list.className='mg-choice-list';list.setAttribute('role','group');list.setAttribute('aria-label',label);
    const hint=doc.createElement('small');hint.className='mg-choice-hint';
    const clear=doc.createElement('button');clear.type='button';clear.textContent='Auswahl leeren';clear.addEventListener('click',()=>save({[key]:[]}));
    details.append(search,list,hint,clear);wrap.append(title,details);parent.appendChild(wrap);
    let rows=new Map(),available=[];
    function filter(){let shown=0;const q=normalize(search.value);for(const {row,record}of rows.values()){row.hidden=!!q&&!normalize(record.name).includes(q);if(!row.hidden)shown++;}hint.textContent=available.length?(shown?`${shown} Einträge · Mehrfachauswahl, maximal 40`:'Kein Treffer für diesen Namen.'):'Warte auf Spielkatalog. Gespeicherte Auswahl bleibt erhalten.';}
    function refresh(catalogs){
      available=catalogs[choiceKey]||[];const selected=getConfig()[key]||[];
      const all=[...available];for(const id of selected)if(!all.some(r=>r.id===id))all.push({id,name:human(id)+' (gespeichert)',unavailable:true});
      const keep=new Set(all.map(r=>r.id));for(const [id,r]of rows)if(!keep.has(id)){r.row.remove();rows.delete(id);}
      for(const record of all){let r=rows.get(record.id);if(!r){const row=doc.createElement('label');row.className='mg-choice-option';const cb=doc.createElement('input');cb.type='checkbox';cb.value=record.id;cb.dataset.choiceItem=key;const text=doc.createElement('span');row.append(cb,text);list.appendChild(row);r={row,cb,text,record};rows.set(record.id,r);cb.addEventListener('change',()=>{const ids=new Set(getConfig()[key]||[]);if(cb.checked&&ids.size<40)ids.add(cb.value);else ids.delete(cb.value);save({[key]:[...ids]});});}
        r.record=record;r.text.textContent=record.name;r.cb.checked=selected.includes(record.id);r.cb.disabled=!r.cb.checked&&(selected.length>=40||!!record.unavailable);r.cb.setAttribute('aria-label',record.name);
      }
      summary.textContent=selected.length?`${selected.length} ausgewählt · Ändern`:'Auswählen …';clear.disabled=!selected.length;filter();
    }
    search.addEventListener('input',filter);
    details.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();details.open=false;summary.focus();}});
    multiMenus.push({refresh});return wrap;
  }
  function installStyles(parent){const style=doc.createElement('style');style.textContent=`
#mg-autofarm-v13 .mg-choice-picker {margin:12px 0}
#mg-autofarm-v13 .mg-choice-label {font-size:12px;margin:0 0 6px;color:var(--mg-text)}
#mg-autofarm-v13 .mg-choice-menu {padding:8px;border:1px solid var(--mg-line);border-radius:10px;background:#211e19}
#mg-autofarm-v13 .mg-choice-menu > summary {display:list-item!important;color:var(--mg-text);cursor:pointer;font-size:12px;padding:1px 0}
#mg-autofarm-v13.mg-compact .mg-choice-menu input[type="search"] {display:block;width:100%!important;max-width:100%!important;margin:8px 0;flex:none}
#mg-autofarm-v13 .mg-choice-list {max-height:190px;overflow-y:auto;overscroll-behavior:contain;padding:2px 3px}
#mg-autofarm-v13.mg-compact .mg-choice-option:not([hidden]) {display:flex;align-items:center;margin:6px 0!important;gap:8px!important;font-size:12px!important}
#mg-autofarm-v13 .mg-choice-option span {overflow-wrap:anywhere}
#mg-autofarm-v13 .mg-choice-hint,#mg-autofarm-v13 .mg-choice-note {display:block;font-size:11px;line-height:1.5;color:var(--mg-muted);margin:6px 0}
#mg-autofarm-v13 .mg-buy-rule {border:1px solid var(--mg-line);border-radius:9px;padding:8px;margin-top:8px;font-size:12px;overflow-wrap:anywhere}
#mg-autofarm-v13 .mg-buy-rule p {margin:4px 0;color:var(--mg-muted);font-size:11px}
#mg-autofarm-v13 .mg-buy-rule button {font-size:11px!important}
#mg-autofarm-v13.mg-compact .mg-wide-choice:not([hidden]) {display:block!important;margin:9px 0!important}
#mg-autofarm-v13.mg-compact .mg-wide-choice > select {display:block;max-width:100%!important;width:100%!important;margin-top:5px}
`;parent.appendChild(style);}
  return {multi,options,installStyles,human,refresh:choices=>multiMenus.forEach(m=>m.refresh(choices))};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createChoiceControls};
