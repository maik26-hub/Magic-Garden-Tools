function mountAutomationUI(parent, engine, document) {
  const root=document.createElement('details'); root.id='mg15-automation'; root.open=true;
  root.style.cssText='border-top:1px solid #355342;margin-top:12px;padding-top:10px';
  const summary=document.createElement('summary');summary.textContent='Automationszentrale · V15';
  summary.style.cssText='font-weight:bold;cursor:pointer';root.appendChild(summary);
  const note=document.createElement('p');note.textContent='Neue Aktionen sind zunächst aus. Module einzeln freigeben. Käufe benötigen Auswahlliste, Preislimit, Tagesbudget und Coin-Reserve. Keine Credits, Trades oder Pet-Verkäufe.';
  note.style.cssText='font-size:11px;line-height:1.5;color:#a8b9ae';root.appendChild(note);
  const alert=document.createElement('p');alert.style.cssText='font-size:11px;color:#f3bf8e';root.appendChild(alert);
  const inputs=new Map(),selectors=[],pickers=[],status=document.createElement('pre');
  status.style.cssText='font:11px monospace;white-space:pre-wrap;line-height:1.5';
  const style='background:#20372a;color:#e9fff1;border:1px solid #456052;border-radius:5px;padding:5px;max-width:175px';
  const config=()=>engine.getConfig();
  function save(patch){try{engine.configure(patch);alert.textContent='Gespeichert';refresh();}catch(e){alert.textContent=e.message;}}
  function row(label,element,where=root){element.setAttribute('aria-label',label);const r=document.createElement(element.tagName==='DETAILS'?'div':'label');r.className='mg-option-row';r.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0;font-size:12px';const text=document.createElement('span');text.textContent=label;r.append(text,element);where.appendChild(r);return r;}
  function check(label,key,where=root){const input=document.createElement('input');input.type='checkbox';input.checked=config()[key];input.addEventListener('change',()=>save({[key]:input.checked}));inputs.set(key,input);row(label,input,where);}
  function number(label,key,min,max,where=root){const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step='1';input.value=config()[key];input.style.cssText=style+';width:115px';input.addEventListener('change',()=>{const n=Number(input.value);if(Number.isFinite(n))save({[key]:n});});inputs.set(key,input);row(label,input,where);return input;}
  function list(label,key,kind,where=root){
    const picker=createChoiceMenu(document,{
      label,placeholder:{plants:'Pflanzen wählen',mutations:'Mutationen wählen',weather:'Wetter wählen'}[kind],
      read:()=>config()[key],onChange:next=>{engine.configure({[key]:next});alert.textContent='Gespeichert';},
      choices:()=>automationChoiceOptions(engine,kind)
    });
    picker.root.dataset.preference=key;
    pickers.push(picker);row(label,picker.root,where);
  }
  function section(label){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=label;s.style.cursor='pointer';d.appendChild(s);d.style.cssText='margin:10px 0;padding:8px 0;border-top:1px solid #355342';root.appendChild(d);return d;}
  function button(text,fn,where=root){const b=document.createElement('button');b.type='button';b.textContent=text;b.style.cssText=style+';cursor:pointer;margin:4px 4px 4px 0';b.addEventListener('click',fn);where.appendChild(b);return b;}
  function select(label,key,choiceKey,where=root){const input=document.createElement('select');input.style.cssText=style;row(label,input,where);selectors.push({input,key,choiceKey});input.addEventListener('change',()=>save({[key]:input.value}));return input;}
  check('Automationszentrale aktiv','enabled');
  button('Sicherer Autopilot',()=>save({enabled:true,favorite:true,claims:true,journal:true,feed:true,hatch:true,storage:true}));
  button('Neue Module aus',()=>save({enabled:false}));
  const preset=document.createElement('small');preset.textContent='Preset: Wertschutz, Journal, Füttern, fertige Eier, Quest-Belohnungen und bestehende Lagerstapel. Kein Einkauf, Nachpflanzen oder Werkzeugverbrauch.';root.appendChild(preset);
  const farming=section('Pflanzen, Eier & Gießen');
  check('Leere gewählte Felder bepflanzen','plant',farming);select('Saatgut','seedSpecies','seeds',farming);
  check('Reife Eier ausbrüten','hatch',farming);check('Eier automatisch nachlegen','eggs',farming);select('Ei','eggId','eggs',farming);
  number('Letzte Auswahlfelder für Eier','eggPlots',0,20,farming);
  check('Wachsende Pflanzen gießen','water',farming);number('Gießen ab Restzeit (Sek.)','waterMinSeconds',30,86400,farming);number('Gießkannen-Reserve','toolReserve',0,99,farming);
  const protection=section('Erntefilter & Wertschutz');
  check('Wertvolle Produkte favorisieren','favorite',protection);number('Favorisieren ab Basiswert (0 = aus)','keepValue',0,1e12,protection);
  list('Diese Pflanzenarten behalten','keepSpecies','plants',protection);number('Ernten ab Größe (0 = alle)','minHarvestSize',0,100,protection);
  number('Ernten ab Basiswert (0 = alle)','minHarvestValue',0,1e12,protection);list('Nur diese Mutationen ernten','wantedMutations','mutations',protection);list('Bei diesem Wetter Ernte pausieren','pauseWeather','weather',protection);
  const hints=document.createElement('small');hints.textContent='Native Sperren und der vorhandene Mutations-/Max-Größen-Schutz haben immer Vorrang. Favoriten werden nie automatisch entsperrt. Basiswert ist ohne Verkaufs-/Freundesbonus.';protection.appendChild(hints);
  const pets=section('Pets, Futter & Lager');check('Aktive Pets automatisch füttern','feed',pets);number('Füttern unter Hungerfüllstand (%)','hungerPercent',1,90,pets);number('Maximaler Futter-Basiswert','foodMaxValue',1,1e9,pets);
  check('Futtertrog nachfüllen','trough',pets);number('Ziel: Futter im Trog','troughItems',0,50,pets);check('Bestehende Lagerstapel auffüllen','storage',pets);
  const quests=section('Journal & tägliche Quests');check('Neue Journalvarianten fotografieren','journal',quests);check('Fertige Belohnungen abholen','claims',quests);
  const qnote=document.createElement('small');qnote.textContent='Camera benötigt. Questbelohnungen werden nicht teilweise verworfen. Quests werden nicht blind durch Einkäufe oder Umgraben erzwungen.';quests.appendChild(qnote);
  const teams=section('Wetterabhängige Petteams');check('Vorhandene Teams wechseln','teams',teams);
  const weatherInput=document.createElement('select');weatherInput.style.cssText=style;row('Wetter',weatherInput,teams);
  const teamSelect=document.createElement('select');teamSelect.style.cssText=style;row('Gespeichertes Team',teamSelect,teams);
  const teamList=document.createElement('div');teams.appendChild(teamList);
  button('Teamregel speichern',()=>{if(weatherInput.value.trim()&&teamSelect.value)save({teamRules:[...config().teamRules.filter(r=>r.weather!==weatherInput.value.trim()),{weather:weatherInput.value.trim(),teamId:teamSelect.value}]});},teams);
  const shop=section('Shops: Coin-Käufe mit Budget');check('Auto-Buy freigeben','buy',shop);number('Tagesbudget (0 = keine Käufe)','dailyBudget',0,1e12,shop);number('Coin-Mindestreserve','coinReserve',0,1e12,shop);
  const buyType=document.createElement('select');for(const type of ['Seed','Egg','Tool','Decor'])buyType.add(new Option(type,type));buyType.style.cssText=style;row('Artikeltyp',buyType,shop);
  const buyId=document.createElement('select');buyId.style.cssText=style;row('Artikel',buyId,shop);
  const shopId=document.createElement('select');for(const type of ['seed','egg','tool','decor','rain','dawn','amber','snow','thunder','apology'])shopId.add(new Option(type,type));shopId.style.cssText=style;row('Shop',shopId,shop);
  function ruleNumber(label,value){const n=document.createElement('input');n.type='number';n.min='0';n.value=value;n.style.cssText=style+';width:110px';row(label,n,shop);return n;}
  const maxPrice=ruleNumber('Maximaler Stückpreis',0),perRestock=ruleNumber('Maximal pro Restock',1),maxOwned=ruleNumber('Zielbestand inkl. Lager',10);
  const buyList=document.createElement('div');shop.appendChild(buyList);
  button('Kaufregel hinzufügen',()=>{if(!buyId.value||!Number.isFinite(Number(maxPrice.value))||Number(maxPrice.value)<0){alert.textContent='Artikel und Preislimit fehlen';return;}const r={type:buyType.value,id:buyId.value,shop:shopId.value,maxPrice:Number(maxPrice.value),perRestock:Number(perRestock.value),maxOwned:Number(maxOwned.value)};save({buyRules:[...config().buyRules.filter(x=>!(x.type===r.type&&x.id===r.id&&x.shop===r.shop)),r]});},shop);
  const budgetNote=document.createElement('small');budgetNote.textContent='Nur Coins, nie Credits. Ausgaben werden VOR dem Senden reserviert, auch bei unbekannter Antwort. Tagesbudget überlebt F5 und Session-Reset. Ohne Browser-Kaufsperre oder verifizierten Preis keine Käufe.';shop.appendChild(budgetNote);
  const diagnostics=section('Diagnose & Aktionsplan');diagnostics.appendChild(status);const preview=document.createElement('pre');preview.style.cssText=status.style.cssText;diagnostics.appendChild(preview);
  button('Plan prüfen (sendet nichts)',()=>{preview.textContent=engine.preview().map(x=>x.module+': '+x.action).join('\n')||'Keine ausführbare Aktion / Spieldaten noch nicht bereit';},diagnostics);
  button('Status kopieren',async()=>{try{if(!navigator.clipboard?.writeText)throw Error('Clipboard fehlt');await navigator.clipboard.writeText(JSON.stringify(engine.status(),null,2));alert.textContent='Status kopiert';}catch{alert.textContent='Kopieren im Browser nicht erlaubt';}},diagnostics);
  parent.appendChild(root);let lastSignature='';
  function options(input,values,current){
    const rows=values.map(x=>typeof x==='string'?{id:x,name:x.replace(/([a-z0-9])([A-Z])/g,'$1 $2')}:x);
    if(current&&!rows.some(x=>x.id===current))rows.push({id:current,name:current+' (gespeichert)'});
    const sig=JSON.stringify(rows);
    if(input.dataset.options!==sig){input.dataset.options=sig;input.textContent='';input.add(new Option(rows.length?'Bitte wählen':'Warte auf Spielkatalog …',''));for(const value of rows)input.add(new Option(value.name,value.id));}
    if(input.value!==(current||''))input.value=current||'';
  }
  function refresh(){
    const c=config(),choices=engine.choices(),info=engine.status();
    for(const [key,input]of inputs){if(document.activeElement===input)continue;if(input.type==='checkbox')input.checked=c[key];else input.value=Array.isArray(c[key])?c[key].join(', '):c[key];}
    for(const s of selectors)options(s.input,s.choiceKey==='seeds'?automationChoiceOptions(engine,'plants'):(choices[s.choiceKey]||[]),c[s.key]);
    for(const picker of pickers)picker.refresh();
    options(weatherInput,automationChoiceOptions(engine,'weather'),weatherInput.value);
    options(teamSelect,choices.pets,teamSelect.value);options(buyId,choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[buyType.value]]||[],buyId.value);
    status.textContent='Kataloge: '+info.catalogs+'\nWetter: '+info.weather+'\nReservierte Ausgaben heute: '+info.spentToday.toLocaleString('de-DE')+' / '+info.budget.toLocaleString('de-DE')+'\n'+info.modules.filter(m=>m.on).map(m=>m.label+': '+m.confirmed+' · '+m.status).join('\n')+(info.sell?'\nVerkauf: '+info.sell:'');
    const sig=JSON.stringify([c.buyRules,c.teamRules]);if(sig!==lastSignature){lastSignature=sig;buyList.textContent='';teamList.textContent='';c.buyRules.forEach((r,i)=>button(r.id+' @ '+r.shop+' ×'+r.perRestock+' · Entfernen',()=>save({buyRules:config().buyRules.filter((_,j)=>i!==j)}),buyList));c.teamRules.forEach((r,i)=>button(r.weather+' → '+(choices.pets.find(t=>t.id===r.teamId)?.name||'Team')+' · Entfernen',()=>save({teamRules:config().teamRules.filter((_,j)=>i!==j)}),teamList));}
  }
  buyType.addEventListener('change',()=>{shopId.value={Seed:'seed',Egg:'egg',Tool:'tool',Decor:'decor'}[buyType.value];buyId.dataset.options='';refresh();});refresh();return {refresh,root};
}
if (typeof module !== 'undefined' && module.exports) module.exports={mountAutomationUI};
