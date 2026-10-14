function mountAutomationUI(parent, engine, document) {
  const root=document.createElement('section'); root.id='mg15-automation'; root.className='mg-auto-intro';
  root.style.cssText='border-top:1px solid #355342;margin-top:12px;padding-top:10px';
  const summary=document.createElement('h3');summary.textContent='Automationszentrale · V15';
  summary.style.cssText='font-weight:bold;cursor:pointer';root.appendChild(summary);
  const note=document.createElement('p');note.textContent='Neue Aktionen sind zunächst aus. Module einzeln freigeben. Käufe benötigen nur deine Kaufregeln und genügend Coins. Keine Credits, Trades oder Pet-Verkäufe.';
  note.style.cssText='font-size:11px;line-height:1.5;color:#a8b9ae';root.appendChild(note);
  const alert=document.createElement('p');alert.style.cssText='font-size:11px;color:#f3bf8e';root.appendChild(alert);
  const inputs=new Map(),selectors=[],status=document.createElement('pre');
  status.style.cssText='font:11px monospace;white-space:pre-wrap;line-height:1.5';
  const style='background:#20372a;color:#e9fff1;border:1px solid #456052;border-radius:5px;padding:5px;max-width:175px';
  const config=()=>engine.getConfig();
  function save(patch){try{engine.configure(patch);alert.textContent='Gespeichert';refresh();}catch(e){alert.textContent=e.message;}}
  const pickers=createChoiceControls(document,save,config);
  pickers.installStyles(root);
  const dependent=[];
  function row(label,element,where=root){element.setAttribute('aria-label',label);const r=document.createElement('label');r.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0;font-size:12px';const text=document.createElement('span');text.textContent=label;r.append(text,element);where.appendChild(r);return r;}
  function check(label,key,where=root){const input=document.createElement('input');input.type='checkbox';input.checked=config()[key];input.addEventListener('change',()=>save({[key]:input.checked}));input.dataset.mgSetting=key;inputs.set(key,input);row(label,input,where);}
  function number(label,key,min,max,where=root){const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step='1';input.value=config()[key];input.style.cssText=style+';width:115px';input.addEventListener('change',()=>{const n=Number(input.value);if(Number.isFinite(n))save({[key]:n});});input.dataset.mgSetting=key;inputs.set(key,input);row(label,input,where);return input;}
  function list(label,key,where=root){return pickers.multi(where,label,key,{keepSpecies:'seeds',wantedMutations:'mutations',pauseWeather:'weather'}[key]);}
  function section(label){const d=document.createElement('details'),s=document.createElement('summary');d.open=true;d.className='mg-auto-section';s.textContent=label;s.style.cursor='pointer';d.appendChild(s);d.style.cssText='margin:10px 0;padding:8px 0;border-top:1px solid #355342';root.appendChild(d);return d;}
  function button(text,fn,where=root){const b=document.createElement('button');b.type='button';b.textContent=text;b.style.cssText=style+';cursor:pointer;margin:4px 4px 4px 0';b.addEventListener('click',fn);where.appendChild(b);return b;}
  function select(label,key,choiceKey,where=root){const input=document.createElement('select');input.style.cssText=style;row(label,input,where).classList.add('mg-wide-choice');input.dataset.mgSetting=key;selectors.push({input,key,choiceKey});input.addEventListener('change',()=>save({[key]:input.value}));return input;}
  function explain(text,where){const n=document.createElement('p');n.className='mg-choice-note';n.textContent=text;where.appendChild(n);return n;}
  check('Automationszentrale aktiv','enabled');
  button('Sicherer Autopilot',()=>save({enabled:true,favorite:true,claims:true,journal:true,feed:true,hatch:true,storage:true}));
  button('Neue Module aus',()=>save({enabled:false}));
  const preset=document.createElement('small');preset.textContent='Preset: Wertschutz, Journal, Füttern, fertige Eier, Quest-Belohnungen und bestehende Lagerstapel. Kein Einkauf, Nachpflanzen oder Werkzeugverbrauch.';root.appendChild(preset);
  const farming=section('Pflanzen, Eier & Gießen');
  check('Leere grüne Felder bepflanzen','plant',farming);select('Saatgut','seedSpecies','seeds',farming);
  explain('Grün = Pflanzen. Nutzt vorhandene Samen; dieser Schalter kauft nichts.',farming);
  check('Reife Eier auf blauen Feldern öffnen','hatch',farming);check('Leere blaue Felder mit Eiern füllen','eggs',farming);select('Ei','eggId','eggs',farming);
  const fieldInfo=explain('Eierfelder in „Felder“ blau markieren. Grau wird ignoriert.',farming);
  check('Pflanzen auf grünen Feldern gießen','water',farming);number('Nur gießen ab Restzeit (Sek.)','waterMinSeconds',30,86400,farming);number('Gießkannen übrig lassen','toolReserve',0,99,farming);
  dependent.push(['seedSpecies','plant'],['eggId','eggs'],['waterMinSeconds','water'],['toolReserve','water']);
  const protection=section('Erntefilter & Wertschutz');
  check('Wertvolle Produkte favorisieren','favorite',protection);number('Favorisieren ab Basiswert (0 = aus)','keepValue',0,1e12,protection);
  list('Diese Pflanzenarten behalten','keepSpecies',protection);number('Ernten ab Größe (0 = alle)','minHarvestSize',0,100,protection);
  number('Ernten ab Basiswert (0 = alle)','minHarvestValue',0,1e12,protection);list('Nur diese Mutationen ernten','wantedMutations',protection);list('Bei diesem Wetter Ernte pausieren','pauseWeather',protection);
  const hints=document.createElement('small');hints.textContent='Native Sperren und der vorhandene Mutations-/Max-Größen-Schutz haben immer Vorrang. Favoriten werden nie automatisch entsperrt. Basiswert ist ohne Verkaufs-/Freundesbonus.';protection.appendChild(hints);
  const pets=section('Pets, Futter & Lager');check('Aktive Pets automatisch füttern','feed',pets);number('Füttern unter Hungerfüllstand (%)','hungerPercent',1,90,pets);number('Maximaler Futter-Basiswert','foodMaxValue',1,1e9,pets);
  check('Futtertrog nachfüllen','trough',pets);number('Ziel: Futter im Trog','troughItems',0,50,pets);check('Bestehende Lagerstapel auffüllen','storage',pets);
  const quests=section('Journal & tägliche Quests');check('Neue Journalvarianten fotografieren','journal',quests);check('Fertige Belohnungen abholen','claims',quests);
  const qnote=document.createElement('small');qnote.textContent='Camera benötigt. Questbelohnungen werden nicht teilweise verworfen. Quests werden nicht blind durch Einkäufe oder Umgraben erzwungen.';quests.appendChild(qnote);
  const teams=section('Wetterabhängige Petteams');check('Vorhandene Teams wechseln','teams',teams);
  const weatherInput=document.createElement('select');weatherInput.style.cssText=style;weatherInput.dataset.mgChoice='teamWeather';row('Bei diesem Wetter',weatherInput,teams).classList.add('mg-wide-choice');
  const teamSelect=document.createElement('select');teamSelect.style.cssText=style;row('Gespeichertes Team',teamSelect,teams).classList.add('mg-wide-choice');
  const teamList=document.createElement('div');teams.appendChild(teamList);
  button('Teamregel speichern',()=>{if(weatherInput.value.trim()&&teamSelect.value)save({teamRules:[...config().teamRules.filter(r=>r.weather!==weatherInput.value.trim()),{weather:weatherInput.value.trim(),teamId:teamSelect.value}]});},teams);
  const shop=section('Shops: ausgewählte Artikel kaufen');check('Auto-Buy freigeben','buy',shop);
  const buyType=document.createElement('select');
  const typeNames={Seed:'Saatgut',Egg:'Eier',Tool:'Werkzeuge',Decor:'Dekoration'};
  for(const [type,name] of Object.entries(typeNames))buyType.add(new Option(name,type));
  buyType.style.cssText=style;buyType.dataset.mgChoice='buyType';row('Was kaufen?',buyType,shop).classList.add('mg-wide-choice');
  const buyId=document.createElement('select');buyId.style.cssText=style;buyId.dataset.mgChoice='buyItem';row('Artikel auswählen',buyId,shop).classList.add('mg-wide-choice');
  const shopId=document.createElement('select');shopId.style.cssText=style;row('In diesem Shop',shopId,shop).classList.add('mg-wide-choice');
  const itemInfo=explain('Artikel werden aus Spiel und Inventar geladen …',shop);
  button('Spieldaten neu laden',()=>{ void engine.loadCatalogs(true); },shop);
  function ruleNumber(label,value){const n=document.createElement('input');n.type='number';n.min='0';n.value=value;n.style.cssText=style+';width:110px';row(label,n,shop);return n;}
  const maxPrice=ruleNumber('Höchstens Coins pro Stück',0),perRestock=ruleNumber('Maximal pro Restock',1),maxOwned=ruleNumber('Gewünschter Gesamtbestand',10);
  const buyList=document.createElement('div');shop.appendChild(buyList);
  const addRule=button('Kaufregel speichern',()=>{
    const choices=engine.menuChoices(),item=(choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[buyType.value]]||[]).find(x=>x.id===buyId.value);
    if(!item||!item.shops.includes(shopId.value)||!Number.isFinite(item.price)||!Number.isFinite(Number(maxPrice.value))||Number(maxPrice.value)<0){alert.textContent='Bitte einen verfügbaren Artikel und ein Preislimit auswählen.';return;}
    if(config().buyRules.length>=30&&!config().buyRules.some(x=>x.type===buyType.value&&x.id===buyId.value&&x.shop===shopId.value)){alert.textContent='Maximal 30 Kaufregeln. Erst eine alte Regel entfernen.';return;}
    const r={type:buyType.value,id:item.id,shop:shopId.value,maxPrice:Number(maxPrice.value),perRestock:Number(perRestock.value),maxOwned:Number(maxOwned.value)};
    save({buyRules:[...config().buyRules.filter(x=>!(x.type===r.type&&x.id===r.id&&x.shop===r.shop)),r]});
  },shop);
  explain('Die Liste enthält alle im Spielkatalog bekannten Artikel, nicht nur deinen Besitz. Auch ausverkaufte Artikel können vorgemerkt werden. Eine Kaufregel schaltet Auto-Buy nicht von selbst ein.',shop);
  explain('Kauft deine ausgewählten Artikel, solange genügend Coins da sind. Kein Tagesbudget und keine Mindestreserve. Preislimit, Zielbestand und Restock-Menge bleiben aktiv; Credits werden nie ausgegeben.',shop);
  function chosenItem(choices){return (choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[buyType.value]]||[]).find(x=>x.id===buyId.value);}
  function refreshBuy(choices,selectionChanged=false){
    const records=choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[buyType.value]]||[];
    const items=records.map(r=>({...r,name:r.name+(Number.isFinite(r.price)?' · '+r.price.toLocaleString('de-DE')+' Coins':r.catalogReady?' · nicht mit Coins kaufbar':' · Preis lädt …'),unavailable:!!r.catalogReady&&(!Number.isFinite(r.price)||!r.shops.length)}));
    pickers.options(buyId,items,buyId.value,'Bitte wählen',false);
    const item=chosenItem(choices),shops=(choices.shops||[]).filter(s=>item?.shops.includes(s.id));
    const chosenShop=shops.some(s=>s.id===shopId.value)?shopId.value:shops[0]?.id||'';
    pickers.options(shopId,shops,chosenShop,'Shop wählen',false);
    if(selectionChanged&&item&&Number.isFinite(item.price))maxPrice.value=String(item.price);
    const stock=item?.stock.find(s=>s.shop===shopId.value)?.available;
    itemInfo.textContent=item?`${item.name}: ${item.owned??'–'} im Besitz · ${stock??0} im Shop. ${stock===0?'Wartet beim Kaufen auf Nachschub.':''}`:records.length?'Artikel wählen; der bekannte Coin-Preis wird als Preislimit vorgeschlagen.':'Spielkataloge werden automatisch gesucht. Vorhandene Eier und Samen findest du bereits unter Pflanzen.';
    addRule.disabled=!item||!Number.isFinite(item.price)||!shops.length;
  }
  function editRule(r){const choices=engine.menuChoices();buyType.value=r.type;buyId.dataset.options='';pickers.options(buyId,choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[r.type]]||[],r.id);refreshBuy(choices);shopId.value=r.shop;maxPrice.value=r.maxPrice;perRestock.value=r.perRestock;maxOwned.value=r.maxOwned;buyType.focus();alert.textContent='Regel bearbeiten und anschließend speichern.';}
  buyId.addEventListener('change',()=>{refreshBuy(engine.menuChoices(),true);});
  shopId.addEventListener('change',()=>refreshBuy(engine.menuChoices()));
  const diagnostics=document.createElement('div');diagnostics.appendChild(status);root.appendChild(diagnostics);const preview=document.createElement('pre');preview.style.cssText=status.style.cssText;diagnostics.appendChild(preview);
  button('Plan prüfen (sendet nichts)',()=>{preview.textContent=engine.preview().map(x=>x.module+': '+x.action).join('\n')||'Keine ausführbare Aktion / Spieldaten noch nicht bereit';},diagnostics);
  button('Status kopieren',async()=>{try {await navigator.clipboard.writeText(JSON.stringify(engine.status(),null,2));alert.textContent='Status kopiert';}catch{alert.textContent='Kopieren im Browser nicht erlaubt';}},diagnostics);
  parent.appendChild(root);let lastSignature='';
  function refresh(){
    void engine.loadCatalogs();
    const c=config(),choices=engine.menuChoices(),info=engine.status();
    for(const [key,input]of inputs){if(document.activeElement===input)continue;if(input.type==='checkbox')input.checked=c[key];else input.value=Array.isArray(c[key])?c[key].join(', '):c[key];}
    for(const s of selectors)pickers.options(s.input,choices[s.choiceKey]||[],c[s.key]);
    for(const [key,toggle]of dependent){const item=inputs.get(key)||selectors.find(s=>s.key===key)?.input;if(item)item.closest('label').hidden=!c[toggle];}
    fieldInfo.textContent=choices.fields?`Felder: ${choices.fields.plant} grün für Pflanzen · ${choices.fields.egg} blau für Eier. Grau wird ignoriert.`:'Felder in „Felder“ grün oder blau markieren. Grau wird ignoriert.';
    pickers.refresh(choices);pickers.options(weatherInput,choices.weather,weatherInput.value,'Wetter wählen');pickers.options(teamSelect,choices.pets,teamSelect.value,'Team wählen');refreshBuy(choices);
    status.textContent='Kataloge: '+info.catalogs+'\nWetter: '+(choices.weather.find(w=>w.id===info.weather)?.name||info.weather)+'\nKäufe heute: '+info.spentToday.toLocaleString('de-DE')+' Coins'+'\n'+info.modules.filter(m=>m.on).map(m=>m.label+': '+m.confirmed+' · '+m.status).join('\n')+(info.sell?'\nVerkauf: '+info.sell:'');
    const sig=JSON.stringify([c.buyRules,c.teamRules,choices.seeds.map(x=>[x.id,x.name]),choices.eggs.map(x=>[x.id,x.name]),choices.tools.map(x=>[x.id,x.name]),choices.decor.map(x=>[x.id,x.name]),choices.pets]);
    if(sig!==lastSignature){
      lastSignature=sig;buyList.textContent='';teamList.textContent='';
      c.buyRules.forEach((r,i)=>{
        const item=(choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[r.type]]||[]).find(x=>x.id===r.id),card=document.createElement('div');card.className='mg-buy-rule';
        const name=document.createElement('strong');name.textContent=item?.name||pickers.human(r.id)+' (gespeichert)';card.appendChild(name);
        const desc=document.createElement('p');desc.textContent=`${choices.shops.find(x=>x.id===r.shop)?.name||pickers.human(r.shop)} · bis ${r.maxPrice.toLocaleString('de-DE')} Coins · ${r.perRestock} pro Restock · Ziel ${r.maxOwned}`;card.appendChild(desc);
        button('Bearbeiten',()=>editRule(r),card);button('Entfernen',()=>save({buyRules:config().buyRules.filter((_,j)=>i!==j)}),card);buyList.appendChild(card);
      });
      c.teamRules.forEach((r,i)=>button((choices.weather.find(w=>w.id===r.weather)?.name||pickers.human(r.weather))+' → '+(choices.pets.find(t=>t.id===r.teamId)?.name||'Gespeichertes Team')+' · Entfernen',()=>save({teamRules:config().teamRules.filter((_,j)=>i!==j)}),teamList));
    }
  }
  buyType.addEventListener('change',()=>{buyId.value='';buyId.dataset.options='';shopId.value='';refreshBuy(engine.menuChoices());});
  refresh();return {refresh,root,alert,views:{automation:root,farming,protection,pets,journal:quests,teams,shop,diagnostics}};

}
if (typeof module !== 'undefined' && module.exports) module.exports={mountAutomationUI};
