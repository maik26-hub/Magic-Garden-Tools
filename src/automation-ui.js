function mountAutomationUI(parent, engine, document) {
  const root=document.createElement('section'); root.id='mg15-automation'; root.className='mg-auto-intro';
  root.style.cssText='border-top:1px solid #355342;margin-top:12px;padding-top:10px';
  const summary=document.createElement('h3');summary.textContent='Automationen · V16.3';
  summary.style.cssText='font-weight:bold;cursor:pointer';root.appendChild(summary);
  const note=document.createElement('p');note.textContent='Neue Aktionen sind zunächst aus. Module einzeln freigeben. Käufe benötigen nur deine Kaufregeln und genügend Coins. Keine Credits, Trades oder Pet-Verkäufe.';
  note.className='mg-choice-note';note.textContent='Jede Funktion bleibt separat schaltbar. Favoriten, Mutationen, gesperrte Gegenstände und benötigte Team-Pets sind geschützt. Testbuild: kein Live-Test auf deinem Konto.';
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
  const HELP={
    'Pet Auto-Sell einschalten':'Prüft ALLE eigenen Pets in Inventar, aktiven Slots und Pet Hutch gegen sämtliche benötigten Teams. Erst wenn alle Max-STR-Fähigkeiten durch reservierte bessere Pets abgedeckt sind und das Herkunftsei erlaubt ist, wird das Pet verkauft. Favoriten, Mutationen und manuelle Teams sind geschützt.',
    'Wertvolle Produkte favorisieren':'Alte vom Bot gesetzte Favoriten werden nach einer geänderten Schutzregel automatisch freigegeben. Von dir manuell favorisierte Crops bleiben geschützt. Änderungen wirken ohne F5.',
    'Pflanzen verkaufen':'Berücksichtigt auch alte Crops nach einer Regeländerung. Vom Bot selbst gesetzte alte Favoriten werden nur bei überprüfbarer Herkunft wieder freigegeben. Manuelle Favoriten bleiben geschützt.',
    'Effekt-Teams automatisch speichern':'Speichert Einzelteams sowie Kombis pro Aktion (z. B. Max-STR + Hatch-XP + Double Hatch). Ein Pet mit mehreren Boosts hilft jedem dieser Ziele. AFK-Varianten berücksichtigen Hunger-Unterstützung. Änderungen behalten dieselbe Team-ID.',
    'Passendes Team vor Aktionen einsetzen':'Wechselt erst nach bestätigter Speicherung. Die Aktion wartet auf die echten Teammitglieder; danach Rückkehr zum vorherigen Team.',
    'Leere grüne Felder bepflanzen':'Nur grüne, leere Plätze und vorhandenes ausgewähltes Saatgut. Kauft selbst nichts.',
    'Leere blaue Felder mit Eiern füllen':'Nur freie blaue Felder. Alle vorhandenen oder die separat freigegebenen Eiertypen verwenden.',
    'Reife Eier auf blauen Feldern öffnen':'Öffnet nur erlaubte, reife Eier auf blauen Feldern. Platzieren und Öffnen haben getrennte Filter.',
    'Aktive Pets automatisch füttern':'Nur passende, günstige, nicht favorisierte oder mutierte Früchte füttern.',
    'Auto-Buy freigeben':'Kauft die ausgewählten Artikel bis zum Zielbestand mit Coins. Keine Credits und keine Käufe für nicht ausgewählte Artikel.',
    'Nur gießen ab Restzeit (Sek.)':'Das ist die verbleibende Wachstumszeit, kein Wiederholungsintervall.',
    'Gießkannen übrig lassen':'Diese Anzahl Gießkannen wird nicht verbraucht.'
  };
  function row(label,element,where=root){element.setAttribute('aria-label',label);const r=document.createElement('label');r.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0;font-size:12px';const text=document.createElement('span');text.textContent=label;r.append(text,element);if(HELP[label]){const info=document.createElement('button');info.type='button';info.className='mg-info';info.textContent='i';info.dataset.info=HELP[label];info.setAttribute('aria-label','Info: '+label);r.appendChild(info);}where.appendChild(r);return r;}
  function check(label,key,where=root){const input=document.createElement('input');input.type='checkbox';input.checked=config()[key];input.addEventListener('change',()=>save({[key]:input.checked}));input.dataset.mgSetting=key;inputs.set(key,input);row(label,input,where);}
  function number(label,key,min,max,where=root){const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step='1';input.value=config()[key];input.style.cssText=style+';width:115px';input.addEventListener('change',()=>{const n=Number(input.value);if(Number.isFinite(n))save({[key]:n});});input.dataset.mgSetting=key;inputs.set(key,input);row(label,input,where);return input;}
  function list(label,key,where=root){return pickers.multi(where,label,key,{keepSpecies:'seeds',wantedMutations:'mutations',pauseWeather:'weather'}[key]);}
  function section(label){const d=document.createElement('details'),s=document.createElement('summary');d.open=true;d.className='mg-auto-section';s.textContent=label;s.style.cursor='pointer';d.appendChild(s);d.style.cssText='margin:10px 0;padding:8px 0;border-top:1px solid #355342';root.appendChild(d);return d;}
  function button(text,fn,where=root){const b=document.createElement('button');b.type='button';b.textContent=text;b.style.cssText=style+';cursor:pointer;margin:4px 4px 4px 0';b.addEventListener('click',fn);where.appendChild(b);return b;}
  function select(label,key,choiceKey,where=root){const input=document.createElement('select');input.style.cssText=style;row(label,input,where).classList.add('mg-wide-choice');input.dataset.mgSetting=key;selectors.push({input,key,choiceKey});input.addEventListener('change',()=>save({[key]:input.value}));return input;}
  function eggModeSelect(label,key,options,where) {
    const input=document.createElement('select');input.style.cssText=style;
    input.dataset.mgSetting=key;
    for(const [value,name] of options){const option=document.createElement('option');option.value=value;option.textContent=name;input.appendChild(option);}
    input.value=config()[key];
    input.addEventListener('change',()=>save({[key]:input.value}));
    inputs.set(key,input);
    row(label,input,where).classList.add('mg-wide-choice');
    return input;
  }
  function explain(text,where){
    const last=where.lastElementChild;
    if(last?.tagName==='LABEL'&&last.querySelector('.mg-info')){const old=last.querySelector('.mg-info');old.dataset.info=text;return old;}
    const n=document.createElement('button');n.type='button';n.className='mg-info';n.dataset.info=text;n.textContent='i';n.setAttribute('aria-label','Weitere Informationen');
    const summary=where.querySelector(':scope > summary');
    (last?.tagName==='LABEL'?last:summary||where).appendChild(n);return n;
  }
  function live(text,where){const p=document.createElement('p');p.className='mg-live-status';p.dataset.liveStatus='1';p.textContent=text;where.appendChild(p);return p;}

  live('Funktionen einzeln einschalten. Start/Stop gilt für alle.',root);
  const farming=section('Pflanzen, Eier & Gießen');
  check('Pflanzen ernten','harvest',farming);check('Pflanzen verkaufen','cropSell',farming);
  check('Leere grüne Felder bepflanzen','plant',farming);select('Saatgut','seedSpecies','seeds',farming);
  explain('Grün = Pflanzen. Nutzt vorhandene Samen; dieser Schalter kauft nichts.',farming);
  check('Reife Eier auf blauen Feldern öffnen','hatch',farming);
  eggModeSelect('Welche Eier ausbrüten?','eggHatchMode',[
    ['all','Alle reifen Eier auf blauen Feldern'],
    ['selected','Nur ausgewählte Eiertypen']
  ],farming);
  const hatchFilter=pickers.multi(farming,'Eiertypen zum Ausbrüten','eggHatchAllowed','eggFilterChoices');
  check('Leere blaue Felder mit Eiern füllen','eggs',farming);
  eggModeSelect('Welche Eier platzieren?','eggPlaceMode',[
    ['all','Alle verfügbaren Eier im Inventar'],
    ['selected','Nur ausgewählte Eiertypen']
  ],farming);
  const placementFilter=pickers.multi(farming,'Eiertypen zum Platzieren','eggPlaceAllowed','eggFilterChoices');
  explain('Platzieren und Ausbrüten haben eigene Filter. Blaue Felder aus „Felder“ verwenden. Favorisierte Eier werden nicht platziert.',farming);
  const fieldInfo=live('Eierfelder in „Felder“ blau markieren. Grau wird ignoriert.',farming);
  check('Pflanzen auf grünen Feldern gießen','water',farming);number('Nur gießen ab Restzeit (Sek.)','waterMinSeconds',30,86400,farming);number('Gießkannen übrig lassen','toolReserve',0,99,farming);
  dependent.push(['hungerPercent','feed'],['foodMaxValue','feed'],['troughItems','trough'],['seedSpecies','plant'],['eggPlaceMode','eggs'],['eggHatchMode','hatch'],['waterMinSeconds','water'],['toolReserve','water']);
  const protection=section('Erntefilter & Wertschutz');
  check('Wertvolle Produkte favorisieren','favorite',protection);number('Favorisieren ab Basiswert (0 = aus)','keepValue',0,1e12,protection);
  list('Diese Pflanzenarten behalten','keepSpecies',protection);number('Ernten ab Größe (0 = alle)','minHarvestSize',0,100,protection);
  number('Ernten ab Basiswert (0 = alle)','minHarvestValue',0,1e12,protection);list('Nur diese Mutationen ernten','wantedMutations',protection);list('Bei diesem Wetter Ernte pausieren','pauseWeather',protection);
  explain('Aktuelle Regeln gelten sofort auch für bereits geerntete Crops. Ausschließlich nachweislich vom Bot gesetzte Favoriten werden bei Regeländerung freigegeben. Manuell favorisierte oder anderweitig gesperrte Ernten bleiben geschützt. Der Basiswert enthält keine Verkaufs- oder Freundesboni.',protection);
  const pets=section('Pets, Futter & Lager');check('Aktive Pets automatisch füttern','feed',pets);number('Füttern unter Hungerfüllstand (%)','hungerPercent',1,90,pets);number('Maximaler Futter-Basiswert','foodMaxValue',1,1e9,pets);

  check('Futtertrog nachfüllen','trough',pets);number('Ziel: Futter im Trog','troughItems',0,50,pets);check('Bestehende Lagerstapel auffüllen','storage',pets);
  const manager=document.createElement('details');manager.open=true;manager.className='mg-team-manager';
  const mh=document.createElement('summary');mh.textContent='Pet-Manager 2.0';manager.appendChild(mh);pets.appendChild(manager);
  check('Effekt-Teams automatisch speichern','teamBuilder',manager);
  explain('Einzelteams pro Fähigkeit, zusätzlich Hatch-/Verkaufs-Kombis und AFK-Mischteams. Die gleichen Pets können mehrere Boost-Ziele gleichzeitig erfüllen. Nur automatisch angelegte Team-IDs werden aktualisiert.',manager);
  check('Passendes Team vor Aktionen einsetzen','autoTeams',manager);
  explain('Vor Eieröffnen/Pflanzenverkauf/Pet-Verkauf einsetzen und anschließend das vorige Team wiederherstellen. Ein unbestätigter Teamwechsel blockiert die zugehörige Aktion. Keine Teamwechsel ohne Freigabe.',manager);
  const rolePicks={};
  for(const [key,label]of [['hatchTeamKey','Team zum Eieröffnen'],['sellTeamKey','Team zum Pflanzenverkauf'],['petSellTeamKey','Team zum Pet-Verkauf'],['idleTeamKey','AFK-Team in Wartezeiten']]){
    const pick=document.createElement('select');pick.style.cssText=style;pick.dataset.mgSetting=key;
    row(label,pick,manager).classList.add('mg-wide-choice');rolePicks[key]=pick;
    pick.addEventListener('change',()=>save({[key]:pick.value}));
  }
  const managerStatus=live('Warte auf eigene Pet-Daten',manager);
  const teamCards=document.createElement('div');teamCards.className='mg-team-list';manager.appendChild(teamCards);
  const decisionView=document.createElement('details');const ds=document.createElement('summary');ds.textContent='Behalten / Verkaufskandidaten';decisionView.appendChild(ds);
  const decisionRows=document.createElement('div');decisionView.appendChild(decisionRows);manager.appendChild(decisionView);
  let lastPetSignature='';
  function refreshPetAdvisor(){
    const report=engine.teamState(),c=config();
    const all=report.proposals||[];
    for(const [key,pick]of Object.entries(rolePicks)){
      const trigger={hatchTeamKey:'hatchEgg',sellTeamKey:'sellAllCrops',petSellTeamKey:'sellPet'}[key];
      const list=all.filter(t=>key==='idleTeamKey'?t.mode==='afk':t.mode==='active'&&!t.weather&&t.trigger===trigger);
      pickers.options(pick,list.map(t=>({id:t.key,name:t.name})),c[key],key==='idleTeamKey'?'Kein automatisches AFK-Team':'Passendes Effekt-Team automatisch');
      pick.closest('label').hidden=!c.autoTeams;
    }
    managerStatus.textContent=(c.teamBuilder?report.why:'Team-Speicherung ausgeschaltet')+(report.notice?' · '+report.notice:'');
    const signature=JSON.stringify([report.plans,report.decisions]);if(signature===lastPetSignature)return;
    lastPetSignature=signature;teamCards.replaceChildren();decisionRows.replaceChildren();
    for(const t of report.plans||[]){
      const card=document.createElement('article');card.className='mg-team-card';card.dataset.effectTeam=t.key;
      const label=document.createElement('strong');label.textContent=t.name;card.appendChild(label);
      live((t.details||[]).map(p=>p.name+' (Max STR '+p.max+')').join(' + '),card);
      if(t.combo)live('Kombi: '+(t.contributions||[]).filter(c=>c.pets.length).map(c=>c.label).join(' + '),card);
      live(t.stale?'Pets fehlen – Vorlage behalten':t.paused?'Manuell geändert – geschützt':t.saved?'Im Spiel gespeichert':t.pending?'Speicherung noch unbestätigt':'Lokal gespeichert · Spiel-Sync wartet',card);
      if(t.error)live(t.error,card);
      explain(t.note||'Eigene Effekt-Team-Vorlage.',card);
      const b=button('Einsetzen',()=>{alert.textContent=engine.requestTeam(t.key)?'Team vorgemerkt – AutoFarm starten':'Team derzeit nicht verfügbar';},card);
      b.disabled=t.stale||t.paused;teamCards.appendChild(card);
    }
    for(const d of report.decisions||[]){
      const p=document.createElement('p');p.className='mg-live-status';
      const member=all.flatMap(t=>t.details||[]).find(p=>p.id===d.id);
      p.textContent=(d.kind==='keep'?'Behalten':d.kind==='surplus'?'Verkaufskandidat':'Prüfen')+' · '+(d.name||member?.name||'Inventar-Pet')+' · '+d.reason;decisionRows.appendChild(p);
    }
  }

  // Opt-in Pet Auto-Sell. Only safely dominated inventory/Hutch pets with a
  // specifically allowed source egg are eligible. Never bulk-sell by rarity.
  const petSellUI=document.createElement('details');petSellUI.className='mg-pet-autosell';petSellUI.open=true;
  const petSellHead=document.createElement('summary');petSellHead.textContent='Pet Auto-Sell · sichere Duplikate';
  petSellUI.appendChild(petSellHead);
  check('Pet Auto-Sell einschalten','petSell',petSellUI);
  const petSellEggFilter=pickers.multi(petSellUI,
    'Nur Pets aus diesen Eiern verkaufen','petSellEggs','petSellOriginChoices');

  const petSellPreview=live('Wird geladen …',petSellUI);
  explain('Nur nachweisbar schwächere Pets mit abgedeckten Max-Level-Boosts. Aktive, gesperrte, favorisierte, mutierte, in Teams benötigte Pets und unbekannte Ei-Herkunft bleiben geschützt. Leere Eier-Auswahl = kein Verkauf. Keine automatischen Pet-Verkäufe ohne Aktivierung.',petSellUI);
  pets.insertBefore(petSellUI,manager);

  // Aries exposes saved teams through QWS_PetsService, but NOT the Team
  // Builder's unsaved suggestions. Users must explicitly opt in a saved
  // Aries team + goal. Our own local advisor supplies max-STR candidates.
  const ariesUI=document.createElement('details');ariesUI.className='mg-aries-team-sync';
  ariesUI.open=false;ariesUI.appendChild((()=>{const n=document.createElement('summary');n.textContent='Aries-Teams automatisch aktualisieren';return n;})());
  check('Aries-Team-Sync einschalten','ariesSync',ariesUI);
  const ariesTeamPick=document.createElement('select');ariesTeamPick.style.cssText=style;
  row('Gespeichertes Aries-Team',ariesTeamPick,ariesUI).classList.add('mg-wide-choice');
  const ariesGoalPick=document.createElement('select');ariesGoalPick.style.cssText=style;
  row('Optimieren für',ariesGoalPick,ariesUI).classList.add('mg-wide-choice');
  for(const goal of engine.petGoals||[]){
    const option=document.createElement('option');option.value=goal.id;option.textContent=goal.name;
    ariesGoalPick.appendChild(option);
  }
  const ariesManagedList=document.createElement('div');ariesUI.appendChild(ariesManagedList);
  const ariesInfo=live('Warte auf Arie’s Mod …',ariesUI);
  button('Dieses Aries-Team verwalten',()=>{
    if(!ariesTeamPick.value||!ariesGoalPick.value){alert.textContent='Team und Ziel auswählen';return;}
    const rows=config().ariesManagedTeams.filter(t=>t.teamId!==ariesTeamPick.value);
    save({ariesManagedTeams:[...rows,{teamId:ariesTeamPick.value,goal:ariesGoalPick.value}]});
  },ariesUI);
  explain('Aries muss installiert sein und seine Team-Synchronisierung aktiviert haben. Nur ausdrücklich registrierte gespeicherte Teams werden geändert. Unsere Max-STR-Bewertung wählt neue Mitglieder; Aries’ interne Team-Builder-Vorschläge sind derzeit nicht öffentlich zugänglich.',ariesUI);
  pets.appendChild(ariesUI);
  let lastAriesSig='';
  function refreshPetAutomation(){
    const c=config(),ariesTeams=engine.ariesTeams?.()||[];
    petSellEggFilter.hidden=!c.petSell;
    const proposed=engine.petSellProposal?.();
    petSellPreview.textContent=c.petSell
      ? (proposed?.pet
        ? 'Nächster sicherer Kandidat: '+(proposed.pet.name||proposed.pet.petSpecies)+
          ' · '+(proposed.source==='Pet Hutch'?'Pet Hutch → Inventar → Verkauf':'Inventar → Verkauf')+
          ' · Herkunft: '+proposed.pet.sourceEggId+
          ' · '+proposed.why
        : 'Verkauf wartet: '+(proposed?.why||'Spieldaten fehlen'))
      : 'Pet Auto-Sell ist ausgeschaltet.';
    const info=engine.status().modules.find(m=>m.id==='petSell');
    if(c.petSell&&info?.status&&/bestätigt|Fehler|Verkauf|erneut|unbestätigt/i.test(info.status))petSellPreview.textContent=info.status;
    pickers.options(ariesTeamPick,
      ariesTeams.map(t=>({id:t.id,name:t.name+(t.serverId?'':' · nicht mit Spiel synchronisiert')})),
      ariesTeamPick.value,'Aries-Team wählen');
    ariesInfo.textContent=ariesTeams.length
      ? ariesTeams.length+' gespeicherte Aries-Teams erkannt. Nur Teams mit aktivem Spiel-Sync lassen sich automatisch aktualisieren.'
      : 'Aries-Team-Service noch nicht gefunden. Installiere/aktiviere Arie’s Mod.';
    const signature=JSON.stringify([c.ariesManagedTeams,ariesTeams]);
    if(signature===lastAriesSig)return;
    lastAriesSig=signature;ariesManagedList.replaceChildren();
    for(const rule of c.ariesManagedTeams){
      const card=document.createElement('div');card.className='mg-buy-rule';
      const team=ariesTeams.find(t=>t.id===rule.teamId);
      const goal=(engine.petGoals||[]).find(g=>g.id===rule.goal);
      const label=document.createElement('p');
      label.textContent=(team?.name||'Gespeichertes Aries-Team derzeit nicht verfügbar')+
        ' → '+(goal?.name||rule.goal);
      card.appendChild(label);
      button('Verwaltung entfernen',()=>save({
        ariesManagedTeams:config().ariesManagedTeams.filter(r=>r.teamId!==rule.teamId)
      }),card);ariesManagedList.appendChild(card);
    }
  }
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
  const itemInfo=live('Artikel werden geladen …',shop);
  const maxOwned=document.createElement('input');maxOwned.type='number';maxOwned.min='1';maxOwned.max='10000';maxOwned.value='10';maxOwned.style.cssText=style;
  row('Gewünschter Gesamtbestand',maxOwned,shop);
  const buyList=document.createElement('div');shop.appendChild(buyList);
  const addRule=button('Kaufregel speichern',()=>{
    const choices=engine.menuChoices(),item=chosenItem(choices),quantity=Number(maxOwned.value);
    if(!item||!Number.isInteger(quantity)||quantity<1||quantity>10000){alert.textContent='Artikel und gültigen Zielbestand wählen';return;}
    if(config().buyRules.length>=30&&!config().buyRules.some(r=>r.type===buyType.value&&r.id===item.id)){alert.textContent='Maximal 30 Artikel';return;}
    const rule={type:buyType.value,id:item.id,shop:'auto',maxOwned:quantity};
    save({buyRules:[...config().buyRules.filter(r=>!(r.type===rule.type&&r.id===rule.id)),rule]});
  },shop);
  explain('Artikel und Zielbestand auswählen. Gekauft wird nur mit Coins zum verifizierten aktuellen Spielpreis, nie mit Credits. Inventar und Lager zählen zum Ziel. Ohne Preis oder passenden Shop wartet Auto-Buy. Kein Tagesbudget oder Mindestrest.',shop);
  button('Spieldaten neu laden',()=>{void engine.loadCatalogs(true);},shop);
  function chosenItem(choices){return (choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[buyType.value]]||[]).find(x=>x.id===buyId.value);}
  function refreshBuy(choices){
    const records=choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[buyType.value]]||[];
    pickers.options(buyId,records.map(r=>({...r,name:r.name+(Number.isFinite(r.price)?' · '+r.price.toLocaleString('de-DE')+' Coins':' · Preis noch unbekannt')})),buyId.value,'Artikel wählen',false);
    const item=chosenItem(choices);itemInfo.textContent=item?`${item.owned??'–'} im Besitz · ${item.stock.reduce((a,s)=>a+s.available,0)} verfügbar`:'Artikel auswählen';
    addRule.disabled=!item;
  }
  function editRule(rule){const choices=engine.menuChoices();buyType.value=rule.type;pickers.options(buyId,choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[rule.type]]||[],rule.id);maxOwned.value=rule.maxOwned;refreshBuy(choices);}
  buyId.addEventListener('change',()=>refreshBuy(engine.menuChoices()));
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
    hatchFilter.hidden=!c.hatch||c.eggHatchMode!=='selected';
    placementFilter.hidden=!c.eggs||c.eggPlaceMode!=='selected';
    fieldInfo.textContent=choices.fields?`Felder: ${choices.fields.plant} grün für Pflanzen · ${choices.fields.egg} blau für Eier. Grau wird ignoriert.`:'Felder in „Felder“ grün oder blau markieren. Grau wird ignoriert.';
    pickers.refresh(choices);pickers.options(weatherInput,choices.weather,weatherInput.value,'Wetter wählen');pickers.options(teamSelect,choices.pets,teamSelect.value,'Team wählen');refreshBuy(choices);
    refreshPetAdvisor();
    refreshPetAutomation();
    status.textContent='Kataloge: '+info.catalogs+'\nWetter: '+(choices.weather.find(w=>w.id===info.weather)?.name||info.weather)+'\nKäufe heute: '+info.spentToday.toLocaleString('de-DE')+' Coins'+'\n'+info.modules.filter(m=>m.on).map(m=>m.label+': '+m.confirmed+' · '+m.status).join('\n')+(info.sell?'\nVerkauf: '+info.sell:'');
    const sig=JSON.stringify([c.buyRules,c.teamRules,choices.seeds.map(x=>[x.id,x.name]),choices.eggs.map(x=>[x.id,x.name]),choices.tools.map(x=>[x.id,x.name]),choices.decor.map(x=>[x.id,x.name]),choices.pets]);
    if(sig!==lastSignature){
      lastSignature=sig;buyList.textContent='';teamList.textContent='';
      c.buyRules.forEach((r,i)=>{
        const item=(choices[{Seed:'seeds',Egg:'eggs',Tool:'tools',Decor:'decor'}[r.type]]||[]).find(x=>x.id===r.id),card=document.createElement('div');card.className='mg-buy-rule';
        const name=document.createElement('strong');name.textContent=item?.name||pickers.human(r.id)+' (gespeichert)';card.appendChild(name);
        const desc=document.createElement('p');desc.textContent=`Ziel: ${r.maxOwned} · im Besitz: ${item?.owned??'–'}`;card.appendChild(desc);
        button('Bearbeiten',()=>editRule(r),card);button('Entfernen',()=>save({buyRules:config().buyRules.filter((_,j)=>i!==j)}),card);buyList.appendChild(card);
      });
      c.teamRules.forEach((r,i)=>button((choices.weather.find(w=>w.id===r.weather)?.name||pickers.human(r.weather))+' → '+(choices.pets.find(t=>t.id===r.teamId)?.name||'Gespeichertes Team')+' · Entfernen',()=>save({teamRules:config().teamRules.filter((_,j)=>i!==j)}),teamList));
    }
  }
  buyType.addEventListener('change',()=>{buyId.value='';buyId.dataset.options='';refreshBuy(engine.menuChoices());});
  refresh();return {refresh,root,alert,views:{automation:root,farming,protection,pets,journal:quests,teams,shop,diagnostics}};

}
if (typeof module !== 'undefined' && module.exports) module.exports={mountAutomationUI};
