/* Native command shapes verified against public game build 1517.
 * Original implementation. The caller owns the only execution loop. */
function createAutomationCore(env) {
  'use strict';
  const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  const KEY='magic_garden_automation_v15', LEDGER='magic_garden_purchase_budget_v15', RECEIPTS='magic_garden_action_receipts_v15', AUTO_MARKS='magic_garden_own_crop_favorites_v16';
  const names={favorite:'Wertschutz / Favoriten',journal:'Journal',feed:'Pets füttern',trough:'Futtertrog',claims:'Quest-Belohnungen',hatch:'Eier ausbrüten',plant:'Nachpflanzen',eggs:'Eier nachlegen',water:'Gießen',storage:'Lager',teams:'Wetter-Petteams',buy:'Shop-Einkauf',petSell:'Pet Auto-Sell',ghostCapture:'Auto Ghost Capture',ariesSync:'Aries-Teams aktualisieren'};
  const defaults={enabled:false,harvest:true,cropSell:true,favorite:false,journal:false,feed:false,trough:false,claims:false,hatch:false,plant:false,eggs:false,water:false,storage:false,teams:false,buy:false,petSell:false,ghostCapture:false,ariesSync:false,petSellEggs:[],petSellPerSession:0,teamBuilder:false,autoTeams:false,hatchTeamKey:'',sellTeamKey:'',petSellTeamKey:'',idleTeamKey:'',ariesManagedTeams:[],seedSpecies:'',eggPlaceMode:'all',eggPlaceAllowed:[],eggHatchMode:'all',eggHatchAllowed:[],hungerPercent:30,foodMaxValue:1000,troughItems:5,toolReserve:2,waterMinSeconds:600,keepValue:0,keepSpecies:[],minHarvestSize:0,minHarvestValue:0,wantedMutations:[],pauseWeather:[],buyRules:[],teamRules:[],actionIntervalMs:900};
  const arr=v=>Array.isArray(v)?v:[],num=v=>typeof v==='number'&&Number.isFinite(v),str=v=>typeof v==='string'&&v.length>0&&v.length<120,obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const cleanList=v=>[...new Set(arr(v).filter(str))].slice(0,40);
  const bounded=(v,f,min,max)=>num(v)?Math.min(max,Math.max(min,Math.round(v))):f;
  function read(key,fallback){try{const v=JSON.parse(env.storage.getItem(key));return v==null?fallback:v;}catch{return fallback;}}
  function write(key,value){try{env.storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  function normalize(input){
    const v=obj(input)?input:{},out={...defaults};
    for(const key of ['enabled',...Object.keys(names)])out[key]=v[key]===true;
    out.seedSpecies=str(v.seedSpecies)?v.seedSpecies:'';
    // Migration: V15.2.1 hatte genau einen gewaehlen Eiertyp. Dessen
    // Erlaubnis darf beim Update nicht ungefragt auf ALLE Eier erweitert werden.
    // Frische Nutzer koennen dagegen direkt "Alle Eier im Inventar" waehlen.
    const legacyEgg = str(v.eggId) ? v.eggId : '';
    const hadLegacyEggSetting = Object.hasOwn(v,'eggId');
    out.eggPlaceMode = v.eggPlaceMode === 'selected' ? 'selected'
      : v.eggPlaceMode === 'all' ? 'all'
      : hadLegacyEggSetting ? 'selected' : 'all';
    out.eggPlaceAllowed = cleanList(
      Array.isArray(v.eggPlaceAllowed) ? v.eggPlaceAllowed
        : legacyEgg ? [legacyEgg] : []
    );
    // Bisher oeffnete der Bot alle reifen Eier auf blauen Feldern.
    out.eggHatchMode = v.eggHatchMode === 'selected' ? 'selected' : 'all';
    out.eggHatchAllowed = cleanList(v.eggHatchAllowed);
    for(const key of ['keepSpecies','wantedMutations','pauseWeather','petSellEggs'])out[key]=cleanList(v[key]);
    out.petSellPerSession=0; // legacy session limit retired
    out.teamBuilder=v.teamBuilder===true;out.autoTeams=v.autoTeams===true;out.harvest=v.harvest!==false;out.cropSell=v.cropSell!==false;
    for(const key of ['hatchTeamKey','sellTeamKey','petSellTeamKey','idleTeamKey'])out[key]=typeof v[key]==='string'&&v[key].length<500?v[key]:'';
    const goals=new Set(['sellCrops','afk','hatchQuality','hatchSpeed','plantGrowth','cropQuality','xp','sellPets']);
    out.ariesManagedTeams=arr(v.ariesManagedTeams)
      .filter(r=>obj(r)&&str(r.teamId)&&goals.has(r.goal))
      .slice(0,16).map(r=>({teamId:r.teamId,goal:r.goal}));
    const ranges={hungerPercent:[1,90],foodMaxValue:[1,1e9],troughItems:[0,50],toolReserve:[0,99],waterMinSeconds:[30,86400],keepValue:[0,1e12],minHarvestSize:[0,100],minHarvestValue:[0,1e12],actionIntervalMs:[500,10000]};
    for(const [key,limits]of Object.entries(ranges))out[key]=bounded(v[key],defaults[key],...limits);
    const shops=['seed','egg','tool','decor','rain','dawn','amber','snow','thunder','apology'];
    out.buyRules=arr(v.buyRules).filter(r=>obj(r)&&['Seed','Egg','Tool','Decor'].includes(r.type)&&str(r.id)&&(r.shop==null||r.shop==='auto'||shops.includes(r.shop))).slice(0,30).map(r=>({type:r.type,id:r.id,shop:shops.includes(r.shop)?r.shop:'auto',maxOwned:bounded(r.maxOwned,10,1,10000)}));
    out.teamRules=arr(v.teamRules).filter(r=>obj(r)&&str(r.weather)&&str(r.teamId)).slice(0,15).map(r=>({weather:r.weather,teamId:r.teamId}));return out;
  }
  let config=normalize(read(KEY,{})),catalogs={},catalogMessage='Warte auf Spielkataloge',loading=false,nextCatalogAt=0,catalogFailures=0,lastActionAt=-Infinity,busy=false,lastModule='',runGeneration=0;
  const petAdvisor=(typeof createPetAdvisor==='function' ? createPetAdvisor : require('./pet-advisor.js').createPetAdvisor)();
  const petPolicy=(typeof createPetAutomationPolicy==='function'
    ? createPetAutomationPolicy : require('./pet-automation.js').createPetAutomationPolicy)();
  const Ghost=typeof createGhostCapture==='function'?createGhostCapture:require('./ghost-capture.js').createGhostCapture;
  const ghosts=Ghost();let lastGhostAt=-Infinity;
  const counts=Object.fromEntries(Object.keys(names).map(k=>[k,0])),reasons={},outcomes={},events=[],receipts=new Map();
  const V16=typeof createV16Controller==='function'?createV16Controller:require('./v16-controller.js').createV16Controller;
  const v16=V16({...env,config:()=>config,catalogs:()=>catalogs,rawSend:env.send});
  for(const r of arr(read(RECEIPTS,[])).slice(-200))if(obj(r)&&typeof r.key==='string'&&r.key.length<400&&num(r.until)&&r.until>env.now()&&typeof r.fp==='string')receipts.set(r.key,r);
  const now=()=>env.now();
  function event(module,message){events.push({at:now(),module,message});if(events.length>40)events.shift();}
  function persistReceipts(){
    for(const [key,r]of receipts)if(r.until<=now())receipts.delete(key);
    while(receipts.size>200){const removable=[...receipts].find(([,r])=>r.kind!=='favorite');if(!removable)return false;receipts.delete(removable[0]);}
    return write(RECEIPTS,[...receipts.values()]);
  }
  function configure(patch){const candidate=normalize({...config,...patch});if(!write(KEY,candidate))throw new Error('Einstellungen konnten nicht gespeichert werden');config=candidate;runGeneration++;return clone(config);}
  function snapshot(){const s=env.snapshot();if(!s||!str(s.actor)||!obj(s.own)||!obj(s.game)||!obj(s.garden)||!obj(s.inventory)||!Array.isArray(s.inventory.items)||!Array.isArray(s.inventory.favoritedItemIds))return null;return s;}
  function plots(s, mode) {
    if (!Array.isArray(s.fieldModes) || s.fieldModes.length !== 200) return [];
    return s.fieldModes.flatMap((m, id) => m === mode ? [id] : []);
  }
  function itemKey(i){if(!obj(i))return '';if(['Produce','Plant','Pet'].includes(i.itemType))return str(i.id)?i.id:'';if(i.itemType==='Seed')return i.species||'';if(i.itemType==='Egg')return i.eggId||'';if(i.itemType==='Tool')return i.id||i.toolId||'';if(i.itemType==='Decor')return i.decorId||'';return '';}
  function kindId(i){return i.species||i.eggId||i.toolId||i.decorId||i.petSpecies||'';}
  function quantity(i){return Number.isInteger(i?.quantity)&&i.quantity>=0?i.quantity:(['Produce','Pet','Plant'].includes(i?.itemType)?1:0);}
  function total(s,type,id,withStorage=false){const list=withStorage?[...s.inventory.items,...arr(s.inventory.storages).flatMap(st=>arr(st.items))]:s.inventory.items;return list.filter(i=>i?.itemType===type&&kindId(i)===id).reduce((sum,i)=>sum+quantity(i),0);}
  function catalogFor(type,id){if(type==='Seed')return catalogs.plants?.[id]?.seed;return catalogs[{Egg:'eggs',Tool:'tools',Decor:'decor'}[type]]?.[id];}
  function extractCatalogs(exports) {
    const identify = typeof identifyNativeCatalogs === 'function'
      ? identifyNativeCatalogs : require('./catalog-source.js').identifyNativeCatalogs;
    return identify(exports);
  }
  async function loadCatalogs(force = false) {
    if (loading || (!force && now() < nextCatalogAt)) return;
    loading = true;
    catalogMessage = Object.keys(catalogs).length ? 'Spielkataloge werden ergänzt …' : 'Spielkataloge werden geladen …';
    try {
      const exports = await env.loadCatalogs();
      const found = extractCatalogs(exports);
      catalogs = {...catalogs, ...found};
      const keys = Object.keys(catalogs);
      const names = {plants:'Pflanzen',eggs:'Eier',pets:'Pets',tools:'Werkzeuge',decor:'Dekoration',mutations:'Mutationen',abilities:'Fähigkeiten'};
      const all = ['plants','eggs','pets','tools','decor','mutations','abilities'].every(key=>!!catalogs[key]);
      catalogMessage = keys.length ? 'Geladen: ' + keys.map(k=>names[k]||k).join(', ') : 'Suche aktuelle Spielkataloge – automatischer Neuversuch';
      catalogFailures = all ? 0 : Math.min(catalogFailures + 1, 3);
      nextCatalogAt = now() + (all ? 300000 : [2000,2000,5000,10000][catalogFailures]);
    } catch {
      catalogFailures = Math.min(catalogFailures + 1, 3);
      catalogMessage = 'Spielkatalog noch nicht erreichbar – automatischer Neuversuch';
      nextCatalogAt = now() + [2000,2000,5000,10000][catalogFailures];
    } finally {
      loading = false;
      try { env.onCatalogsChanged?.(); } catch { /* UI must not break catalog recovery */ }
    }
  }
  function produceValue(i){const crop=catalogs.plants?.[i?.species]?.crop;if(!crop||!num(crop.baseSellPrice)||!num(crop.maxSizeMultiplier)||!num(i.size)||!Array.isArray(i.mutations))return null;let growth=1,additive=1,seenGrowth=false;for(const id of new Set(i.mutations)){const m=catalogs.mutations?.[id];if(!m||!num(m.coinMultiplier))return null;if(m.group==='Growth'){if(seenGrowth)return null;growth=m.coinMultiplier;seenGrowth=true;}else additive+=m.coinMultiplier-1;}const size=1+(crop.maxSizeMultiplier-1)*(Math.min(100,Math.max(50,i.size))-50)/50;return Math.round(crop.baseSellPrice*size*growth*additive);}
  function nativeFavorite(s,i){return s.inventory.favoritedItemIds.includes(itemKey(i));}
  // Policy and native favorites are deliberately separate: game favorites are
  // persistent, while keep rules can change without a reload. Never infer that
  // a pre-existing native favorite was created by this AutoFarm.
  function ruleKeep(i){
    if(config.keepSpecies.includes(i.species))return true;
    if(config.keepValue>0){const v=produceValue(i);return v===null||v>=config.keepValue;}
    return false;
  }
  function keepItem(s,i){return nativeFavorite(s,i)||env.protected({},i)||ruleKeep(i);}
  const markOwner=s=>String(s?.ownerKey||s?.actor||'');
  const markKey=(s,i)=>markOwner(s)+'|'+i.id;
  function marks(){const value=read(AUTO_MARKS,{});return obj(value)?value:{};}
  function updateMark(s,i,stage){
    const ledger=marks(),key=markKey(s,i);
    if(!str(key)||(!Object.hasOwn(ledger,key)&&Object.keys(ledger).length>=600))return false;
    if(stage===null)delete ledger[key];else ledger[key]={state:stage};
    return write(AUTO_MARKS,ledger);
  }
  function managed(s){
    const ledger=marks(),owner=markOwner(s)+'|';
    const present=new Map(s.inventory.items.filter(i=>i?.itemType==='Produce'&&str(i.id)).map(i=>[markKey(s,i),i]));
    let changed=false;
    for(const [key,entry] of Object.entries(ledger)){
      if(!key.startsWith(owner))continue;
      const item=present.get(key);
      if(!item||!obj(entry)){delete ledger[key];changed=true;continue;}
      const favored=nativeFavorite(s,item);
      if(entry.state==='pendingAck'&&favored){
        entry.state='owned';changed=true;
        receipts.delete(s.actor+'|favorite:clear:'+item.id);
      }else if((entry.state==='owned'||entry.state==='clearing')&&!favored){
        delete ledger[key];changed=true;
        receipts.delete(s.actor+'|favorite:set:'+item.id);
      }
    }
    // Treat storage failures as a safety failure: no release without proof.
    if(changed&&(!write(AUTO_MARKS,ledger)||!persistReceipts()))return {};
    return ledger;
  }
  function needsFavoriteCleanup(s){
    if(!config.cropSell)return false;
    const ledger=managed(s);
    return s.inventory.items.some(i=>i?.itemType==='Produce'&&str(i.id)&&
      ledger[markKey(s,i)]?.state==='owned'&&nativeFavorite(s,i)&&
      !ruleKeep(i)&&!env.protected({},i));
  }
  function ordinaryFood(s,i){const v=produceValue(i);return i?.itemType==='Produce'&&str(i.id)&&Array.isArray(i.mutations)&&!i.mutations.length&&!keepItem(s,i)&&v!==null&&v>0&&v<=config.foodMaxValue;}
  function sortedFood(s){return s.inventory.items.filter(i=>ordinaryFood(s,i)).sort((a,b)=>produceValue(a)-produceValue(b));}
  function weather(s){return typeof s.game.weather==='string'?s.game.weather:s.game.weatherWindow?.weatherId||'Normal';}
  function harvestAllowed(plant,crop){if(!config.enabled)return true;const s=snapshot();if(!s)return false;if(config.pauseWeather.includes(weather(s)))return false;if(config.journal&&total(s,'Tool','Camera')>0&&journalNeed(s,{...crop,species:crop.species||plant.species},'produce'))return false;if(config.minHarvestSize>0&&(!num(crop.size)||crop.size<config.minHarvestSize))return false;if(config.wantedMutations.length&&!arr(crop.mutations).some(m=>config.wantedMutations.includes(m)))return false;if(config.minHarvestValue>0){const v=produceValue({...crop,species:crop.species||plant.species});if(v===null||v<config.minHarvestValue)return false;}return true;}
  function journalNeed(s,i,category){const species=category==='pets'?i.petSpecies:i.species,record=s.own.journal?.[category];if(!obj(record)||!str(species)||!Array.isArray(i.mutations))return false;const variants=i.mutations.length?i.mutations.filter(m=>catalogs.mutations?.[m]):['Normal'];if(category==='produce'&&i.size===100)variants.push('Max Weight');const logged=arr(record[species]?.variantsLogged).map(v=>v.variant);return variants.some(v=>!logged.includes(v));}
  function saleAllowed(){if(!config.cropSell)return false;if(!config.enabled)return true;const s=snapshot();if(!s)return false;if(needsFavoriteCleanup(s)){reasons.sell='Alte automatische Favoriten werden nach Regelwechsel freigegeben';return false;}const produce=s.inventory.items.filter(i=>i?.itemType==='Produce'&&!nativeFavorite(s,i));if(produce.some(i=>keepItem(s,i))){reasons.sell='Warte auf Wertschutz: Auto-Favoriten einschalten oder Regeln anpassen';return false;}if(config.journal&&total(s,'Tool','Camera')>0&&produce.some(i=>journalNeed(s,i,'produce'))){reasons.sell='Warte auf Journal-Eintrag';return false;}if(config.feed){const food=sortedFood(s),hungry=arr(s.own.petSlots).some(p=>{const c=catalogs.pets?.[p?.petSpecies],max=c?.coinsToFullyReplenishHunger??c?.maxHunger;return num(max)&&num(p?.hunger)&&p.hunger/max*100<config.hungerPercent&&food.some(i=>arr(c.diet).includes(i.species));});if(hungry){reasons.sell='Füttern hat Vorrang';return false;}}reasons.sell='Bereit';return true;}
  function allowed(key,fp){const r=receipts.get(key);if(!r||r.until<=now())return true;if(r.status==='pending'||r.status==='uncertain')return false;return r.fp!==fp&&now()>=r.after;}
  function job(module,key,fp,command,effect,cooldown=1500){const s=snapshot(),scoped=(s?.actor||'')+'|'+key;if(!allowed(scoped,fp)){reasons[module]='Warte auf Bestätigung / Änderung';return null;}return {module,key:scoped,fp,command,effect,cooldown};}
  function planFavorite(s){
    const ledger=managed(s);
    // Remove ONLY the marks that this AutoFarm provably created. This check
    // examines the entire CURRENT bag on every planner tick, not just items
    // harvested since protection was turned on. A manual favorite is never
    // claimed or switched off.
    if(config.cropSell)for(const i of s.inventory.items){
      if(i?.itemType!=='Produce'||!str(i.id)||!nativeFavorite(s,i))continue;
      if(ledger[markKey(s,i)]?.state!=='owned'||ruleKeep(i)||env.protected({},i))continue;
      const j=job('favorite','favorite:clear:'+i.id,'favorited',
        {type:'ToggleLockItem',itemId:i.id},n=>!n.inventory.favoritedItemIds.includes(i.id),600000);
      if(j){j.favoriteOp='clear';j.favoriteId=i.id;}return j;
    }
    if(!config.favorite)return null;
    for(const i of s.inventory.items){
      if(i?.itemType!=='Produce'||!str(i.id)||nativeFavorite(s,i)||!ruleKeep(i))continue;
      // Do not create new locks for a crop that is independently protected.
      if(env.protected({},i))continue;
      const j=job('favorite','favorite:set:'+i.id,'unstarred',
        {type:'ToggleLockItem',itemId:i.id},n=>n.inventory.favoritedItemIds.includes(i.id),600000);
      if(j){j.favoriteOp='set';j.favoriteId=i.id;}return j;
    }
    return null;
  }
  function planJournal(s){
    if(total(s,'Tool','Camera')<1){reasons.journal='Camera im Inventar fehlt';return null;}const record=JSON.stringify(s.own.journal||{});
    for(const i of s.inventory.items){const category=i?.itemType==='Produce'?'produce':i?.itemType==='Pet'?'pets':null;if(category&&str(i.id)&&journalNeed(s,i,category))return job('journal','journal:item:'+i.id,record,{type:'LogItem',target:{kind:'inventoryItem',itemId:i.id}},n=>!journalNeed(n,i,category),5000);}
    for(const p of arr(s.own.petSlots))if(str(p?.id)&&journalNeed(s,p,'pets'))return job('journal','journal:pet:'+p.id,record,{type:'LogItem',target:{kind:'petSlot',petId:p.id}},n=>!journalNeed(n,p,'pets'),5000);
    for(const tile of plots(s,'plant')){const p=s.garden[tile];if(p?.objectType!=='plant')continue;for(const c of arr(p.slots)){const i={...c,species:c.species||p.species};if(Number.isInteger(c.slotId)&&num(c.endTime)&&c.endTime<=s.serverNow&&journalNeed(s,i,'produce'))return job('journal','journal:crop:'+tile+':'+c.slotId,record,{type:'LogItem',target:{kind:'growSlot',slot:tile,slotsIndex:c.slotId}},n=>!journalNeed(n,i,'produce'),5000);}}return null;
  }
  function planFeed(s){const food=sortedFood(s);if(!catalogs.pets||!catalogs.plants){reasons.feed='Pet-/Pflanzenkatalog fehlt';return null;}for(const p of arr(s.own.petSlots).slice().sort((a,b)=>(a?.hunger||0)-(b?.hunger||0))){const c=catalogs.pets[p?.petSpecies],max=c?.coinsToFullyReplenishHunger??c?.maxHunger;if(!str(p?.id)||!num(p.hunger)||!num(max)||max<=0||p.hunger/max*100>=config.hungerPercent)continue;const i=food.find(i=>arr(c.diet).includes(i.species));if(!i){reasons.feed='Kein freigegebenes, passendes Futter';continue;}return job('feed','feed:'+p.id,p.hunger+':'+i.id,{type:'FeedPet',petItemId:p.id,cropItemId:i.id},n=>!n.inventory.items.some(x=>x?.id===i.id),5000);}return null;}
  function storageFor(s,id){return arr(s.inventory.storages).find(st=>st?.decorId===id&&Array.isArray(st.items));}
  function planTrough(s){const st=storageFor(s,'FeedingTrough');if(!st||!num(st.capacitySlots)){reasons.trough='Futtertrog / Kapazität fehlt';return null;}if(st.items.length>=Math.min(st.capacitySlots,config.troughItems))return null;const diets=arr(s.own.petSlots).flatMap(p=>arr(catalogs.pets?.[p?.petSpecies]?.diet)),i=sortedFood(s).find(i=>diets.includes(i.species));if(!i)return null;return job('trough','trough:'+i.id,String(st.items.length),{type:'MoveItem',from:'inventory',to:'FeedingTrough',itemId:i.id,quantity:1},n=>!n.inventory.items.some(x=>x?.id===i.id),2000);}
  function planClaims(s){const d=s.own.dailyQuests;if(!obj(d)||!str(d.dayUTC)||!Array.isArray(d.quests)){reasons.claims='Noch keine Tagesquest-Daten';return null;}for(const q of d.quests)if(str(q?.instanceId)&&num(q.completedAt)&&q.claimedAt===null)return job('claims','quest:'+q.instanceId,d.dayUTC,{type:'ClaimDailyQuestReward',instanceId:q.instanceId,acceptPartial:false},n=>num(n.own.dailyQuests?.quests?.find(x=>x.instanceId===q.instanceId)?.claimedAt),2000);if(d.quests.length&&d.bonusClaimedAt===null&&d.quests.every(q=>num(q.completedAt)&&num(q.claimedAt)))return job('claims','questbonus:'+d.dayUTC,d.dayUTC,{type:'ClaimDailyQuestBonus',acceptPartial:false},n=>num(n.own.dailyQuests?.bonusClaimedAt),2000);return null;}
  function eggIsAllowed(id,mode,allowed) {
    return mode === 'all' || (str(id) && allowed.includes(id));
  }
  function planHatch(s){
    if(s.inventory.items.length>=98){reasons.hatch='Mindestens zwei freie Inventarplätze benötigt';return null;}
    if(config.eggHatchMode==='selected'&&!config.eggHatchAllowed.length){
      reasons.hatch='Keine Eier zum Ausbrüten ausgewählt';return null;
    }
    for(const tile of plots(s,'egg')){
      const e=s.garden[tile];
      if(e?.objectType!=='egg'||!num(e.maturedAt)||e.maturedAt>s.serverNow)continue;
      if(!eggIsAllowed(e.eggId,config.eggHatchMode,config.eggHatchAllowed))continue;
      return job('hatch','hatch:'+tile,e.eggId+':'+e.plantedAt,
        {type:'HatchEgg',slot:tile},
        n=>n.garden[tile]?.objectType!=='egg'||n.garden[tile]?.plantedAt!==e.plantedAt,5000);
    }
    return null;
  }
  function getStack(s,type,id){return s.inventory.items.find(i=>i?.itemType===type&&kindId(i)===id&&quantity(i)>0&&!nativeFavorite(s,i));}
  function retrieveStack(s,type,id,reserve=0){if(s.inventory.items.length>=99)return null;const storageId={Seed:'SeedSilo',Tool:'ToolShack'}[type],st=storageFor(s,storageId),i=arr(st?.items).find(i=>i?.itemType===type&&kindId(i)===id&&quantity(i)>reserve&&!nativeFavorite(s,i));return i?{item:i,storageId,qty:1}:null;}
  function planPlant(s){const species=config.seedSpecies;if(!species){reasons.plant='Saatgut auswählen';return null;}const tile=plots(s,'plant').find(t=>s.garden[t]==null);if(tile===undefined)return null;const seed=getStack(s,'Seed',species);if(!seed){const st=retrieveStack(s,'Seed',species);if(!st){reasons.plant='Kein freigegebenes Saatgut';return null;}return job('plant','retrieve:seed:'+species,String(quantity(st.item)),{type:'MoveItem',from:st.storageId,to:'inventory',itemId:itemKey(st.item),quantity:1},n=>total(n,'Seed',species)>0,2000);}return job('plant','plant:'+tile,species+':'+quantity(seed),{type:'PlantSeed',slot:tile,species},n=>n.garden[tile]?.objectType==='plant',2500);}
  function planEggs(s){
    const tile=plots(s,'egg').find(t=>s.garden[t]==null);
    if(tile===undefined)return null;
    if(config.eggPlaceMode==='selected'&&!config.eggPlaceAllowed.length){
      reasons.eggs='Keine Eier zum Platzieren ausgewählt';return null;
    }
    // Alle berechtigten Eiertypen DIREKT aus dem Inventar verwenden. Die
    // Reihenfolge folgt den echten Stapeln im Inventar; ausverkaufte Stapel
    // werden uebersprungen. Favorisierte Eier bleiben unangetastet.
    const egg=s.inventory.items.find(i=>
      i?.itemType==='Egg'&&str(i.eggId)&&quantity(i)>0&&!nativeFavorite(s,i)&&!env.protected({},i)&&
      eggIsAllowed(i.eggId,config.eggPlaceMode,config.eggPlaceAllowed));
    if(!egg){
      reasons.eggs='Kein erlaubtes, verfügbares Ei im Inventar';return null;
    }
    const id=egg.eggId;
    return job('eggs','growegg:'+tile,id+':'+quantity(egg),
      {type:'GrowEgg',slot:tile,eggId:id},
      n=>n.garden[tile]?.objectType==='egg',3000);
  }
  function planWater(s){const can=getStack(s,'Tool','WateringCan');if(!can||quantity(can)<=config.toolReserve){reasons.water='Gießkannen-Reserve erreicht';return null;}for(const tile of plots(s,'plant')){const p=s.garden[tile];if(p?.objectType!=='plant'||arr(p.slots).some(c=>env.protected(p,c)))continue;const times=arr(p.slots).map(c=>c.endTime).filter(num);if(!times.length||Math.min(...times)-s.serverNow<config.waterMinSeconds*1000)continue;return job('water','water:'+tile,String(p.plantedAt),{type:'WaterPlant',slot:tile},n=>total(n,'Tool','WateringCan')<quantity(can),300000);}return null;}
  function planStorage(s){for(const i of s.inventory.items){const type=i?.itemType,id=kindId(i),key=itemKey(i),to={Seed:'SeedSilo',Tool:'ToolShack',Decor:'DecorShed'}[type];if(!to||!str(key)||nativeFavorite(s,i)||i.remainingActiveSeconds>0)continue;if(type==='Seed'&&config.plant&&id===config.seedSpecies)continue;if(type==='Tool'&&['Camera','WateringCan'].includes(id))continue;if(s.heldId===key)continue;const st=storageFor(s,to),same=arr(st?.items).find(x=>x?.itemType===type&&itemKey(x)===key);if(!same||quantity(i)<=0)continue;const limit=catalogFor(type,id)?.maxInventoryQuantity,qty=num(limit)?Math.min(quantity(i),Math.max(0,limit-quantity(same))):quantity(i);if(qty<=0)continue;return job('storage','store:'+key,quantity(i)+':'+quantity(same),{type:'MoveItem',from:'inventory',to,itemId:key,quantity:qty},n=>total(n,type,id)<total(s,type,id),3000);}return null;}
  function planTeams(s){const r=config.teamRules.find(r=>r.weather===weather(s));if(!r){reasons.teams='Keine Regel für aktuelles Wetter';return null;}const team=arr(s.own.petTeams).find(t=>t?.id===r.teamId),ids=arr(team?.members).map(m=>m.petId).filter(str).sort();if(!team||!ids.length)return null;const active=arr(s.own.petSlots).map(p=>p.id).filter(str).sort();if(JSON.stringify(ids)===JSON.stringify(active))return null;if(s.inventory.items.length>=95){reasons.teams='Inventar zu voll für Teamwechsel';return null;}return job('teams','team:'+r.teamId,weather(s)+':'+active.join(','),{type:'ApplyPetTeam',teamId:r.teamId},n=>JSON.stringify(arr(n.own.petSlots).map(p=>p.id).sort())===JSON.stringify(ids),60000);}
  function ledger(s){const day=new Date(s.serverNow).toISOString().slice(0,10),key=LEDGER+':'+day,stored=read(key,{spent:0,counts:{},inflight:null});if(!obj(stored)||!num(stored.spent)||stored.spent<0||!obj(stored.counts))return null;return {key,day,data:stored};}
  function planPetSell(s) {
    const proposed=v16.salePreview();
    if(!proposed.pet){reasons.petSell=proposed.why;return null;}
    const pet=proposed.pet;
    if(proposed.source==='Pet Hutch'){
      // Never send SellPet against a pet that is still in storage.
      // The next planning tick rechecks the *entire* portfolio after the
      // server has confirmed this precise Pet moved into the bag.
      return job('petSell','retrievepet:'+pet.id,pet.id+':'+pet.targetScale,
        {type:'MoveItem',from:'PetHutch',to:'inventory',itemId:pet.id,quantity:1},
        n=>arr(n.inventory?.items).some(i=>i?.id===pet.id&&i.itemType==='Pet')&&
          !arr(n.inventory?.storages).some(st=>st?.decorId==='PetHutch'&&arr(st.items).some(i=>i?.id===pet.id)),600000);
    }
    return job('petSell','sellpet:'+pet.id,pet.id+':'+pet.targetScale,
      {type:'SellPet',itemId:pet.id},n=>!arr(n.inventory?.items).some(i=>i?.id===pet.id),600000);
  }
  function planGhost(s){
    const p=ghosts.propose(s);reasons.ghostCapture=p.why;
    if(!p.command||now()-lastGhostAt<10000)return null;
    const j=job('ghostCapture','ghost:'+p.command.ghostInstanceId,p.command.ghostInstanceId,p.command,n=>ghosts.confirmed(p,n),10000);
    if(j)j.ghostPlan=p;return j;
  }
  function planAriesSync(s) {
    const service=env.ariesService?.()||null;
    const report=petAdvisor.analyze(s,catalogs,'afk');
    const proposed=petPolicy.recommendAriesUpdate(s,report,config,service);
    if(!proposed.plan){reasons.ariesSync=proposed.why;return null;}
    const p=proposed.plan;
    const normalized=p.slots.filter(Boolean);
    const j=job('ariesSync','aries:'+p.id,normalized.join('|'),
      {type:'SyncSavedAriesTeam',teamId:p.id,petIds:normalized},
      ()=>{const latest=petPolicy.ariesTeams(env.ariesService?.()||null).find(t=>t.id===p.id);
        return !!latest&&JSON.stringify(latest.slots.filter(Boolean))===JSON.stringify(normalized);},
      60000);
    if(j)j.ariesPlan=p;
    return j;
  }
  function planBuy(s){
    if(!config.buyRules.length){reasons.buy='Artikel auswählen und Kaufregel speichern';return null;}
    if(!num(s.own.coinsCount)||s.inventory.items.length>=98){reasons.buy='Coins / Inventarplatz nicht sicher';return null;}
    if(!obj(s.own.shopPurchases)){reasons.buy='Kaufzähler noch nicht geladen';return null;}
    const budget=ledger(s);if(!budget){reasons.buy='Kaufstatus beschädigt – Käufe pausiert';return null;}
    if(budget.data.inflight){const p=budget.data.inflight,observed=s.own.shopPurchases?.[p.shop];if(observed?.restockId===p.restockId&&num(observed?.purchases?.[p.id])&&observed.purchases[p.id]>p.beforeCount){budget.data.inflight=null;if(!write(budget.key,budget.data))return null;}else{reasons.buy='Vorheriger Kauf noch nicht im Spielzustand bestätigt';return null;}}
    const purchaseRules=config.buyRules.flatMap(rule=>rule.shop!=='auto'?[rule]:Object.keys(s.game.shops||{}).map(shop=>({...rule,shop})));
    for(const r of purchaseRules){
      const shop=s.game.shops?.[r.shop];if(!shop||!Array.isArray(shop.inventory)||!str(shop.restockId)||!num(shop.deadlineMs)||shop.deadlineMs<=s.serverNow){reasons.buy='Shopdaten fehlen oder Auffüllung abwarten';continue;}
      const stock=shop.inventory.find(i=>i?.itemType===r.type&&kindId(i)===r.id),catalog=catalogFor(r.type,r.id),price=catalog?.coinPrice;
      if(!stock){reasons.buy='Ausgewählter Artikel momentan nicht im Shop';continue;}if(!num(price)||price<0||!num(stock.initialStock)){reasons.buy='Coin-Preis oder Bestand noch unbekannt';continue;}
      if(!Array.isArray(catalog.eligibleShops)||!catalog.eligibleShops.includes(r.shop))continue;
      if(catalog.isOneTimePurchase&&total(s,r.type,r.id,true)>0)continue;
      if(total(s,r.type,r.id,true)>=r.maxOwned){reasons.buy='Gewünschter Bestand bereits erreicht';continue;}
      if(num(catalog.maxInventoryQuantity)&&total(s,r.type,r.id)>=catalog.maxInventoryQuantity)continue;
      const bought=s.own.shopPurchases[r.shop],purchased=bought?.restockId===shop.restockId?bought.purchases?.[r.id]:0;
      if(purchased!==undefined&&!num(purchased))continue;
      if(stock.initialStock-(purchased||0)<=0){reasons.buy='Ausverkauft – wartet auf nächste Auffüllung';continue;}
      const token=r.shop+':'+shop.restockId+':'+r.type+':'+r.id;
      // Target holdings, not a hidden restock quota, stop further purchases.
      if(s.own.coinsCount<price){reasons.buy='Nicht genug Coins für diesen Artikel';continue;}
      const item={itemType:r.type,[{Seed:'species',Egg:'eggId',Tool:'toolId',Decor:'decorId'}[r.type]]:r.id};
      const j=job('buy','buy:'+token,String(purchased||0),{type:'PurchaseShopItem',shop:r.shop,viewMode:'list',item,quantity:1},n=>{const p=n.own.shopPurchases?.[r.shop];return p?.restockId===shop.restockId&&(p.purchases?.[r.id]||0)>(purchased||0);},5000);
      if(j)j.purchase={key:budget.key,token,price,coins:s.own.coinsCount,shop:r.shop,restockId:shop.restockId,id:r.id,beforeCount:purchased||0};return j;
    }return null;
  }
  const planners={favorite:planFavorite,journal:planJournal,feed:planFeed,trough:planTrough,claims:planClaims,hatch:planHatch,plant:planPlant,eggs:planEggs,water:planWater,storage:planStorage,teams:planTeams,buy:planBuy,petSell:planPetSell,ariesSync:planAriesSync,ghostCapture:planGhost};
  function candidates(s){const output=[];for(const [module,plan]of Object.entries(planners)){
    // Releasing stale AUTO favorites is housekeeping for Crop Auto-Sell even
    // when new automatic favorite creation was switched off.
    if(!config[module]&&!(module==='favorite'&&needsFavoriteCleanup(s))){reasons[module]='Aus';continue;}
    reasons[module]='Nichts zu tun';try{const j=plan(s);if(j){reasons[module]='Bereit';output.push(j);}}
    catch{reasons[module]='Unerwartete Spieldaten – ausgelassen';}
  }return output;}
  function selectedJob(s){const all=candidates(s),urgent=all.find(j=>['favorite','claims','feed'].includes(j.module));const priority={plantSeeds:'plant',growEggs:'eggs',hatchEggs:'hatch',waterPlants:'water',feedPets:'feed',logJournal:'journal',buySeeds:'buy',buyEggs:'buy',buyDecor:'buy'};const goals=arr(s.own.dailyQuests?.quests).filter(q=>q?.claimedAt===null&&q?.completedAt===null).map(q=>priority[q.objective?.kind]).filter(Boolean);const questAction=all.find(j=>goals.includes(j.module)&&j.module!==lastModule);return urgent||questAction||all.find(j=>j.module!==lastModule)||all[0]||null;}
  async function execute(candidate,s){
    if(!env.running()||!config.enabled)return false;
    const fresh=snapshot();if(!fresh||fresh.actor!==s.actor||fresh.generation!==s.generation)return false;
    const latest=planners[candidate.module](fresh);if(!latest||latest.key!==candidate.key||JSON.stringify(latest.command)!==JSON.stringify(candidate.command))return false;
    const record={key:latest.key,kind:latest.module,fp:latest.fp,status:'pending',until:['favorite','petSell','ghostCapture'].includes(latest.module)?Number.MAX_SAFE_INTEGER:now()+600000,after:now()+latest.cooldown};
    receipts.set(latest.key,record);
    if(!persistReceipts()){receipts.delete(latest.key);reasons[latest.module]='Speicher voll – Aktion gesperrt';return false;}
    if(latest.purchase){const b=ledger(fresh);if(!b)return false;const p=latest.purchase;if(b.key!==p.key||b.data.inflight||fresh.own.coinsCount<p.price)return false;b.data.spent+=p.price;b.data.counts[p.token]=(b.data.counts[p.token]||0)+1;b.data.inflight={shop:p.shop,restockId:p.restockId,id:p.id,beforeCount:p.beforeCount,coinsBefore:fresh.own.coinsCount,price:p.price};if(!write(b.key,b.data)){reasons.buy='Kaufstatus nicht speicherbar – Kauf pausiert';return false;}}
    // Store intent before sending a toggle. A timeout must never turn into an
    // untracked mark we later unlock without proof of a successful response.
    if(latest.favoriteOp==='set'&&!updateMark(fresh,{id:latest.favoriteId},'sent')){
      receipts.delete(latest.key);persistReceipts();reasons.favorite='Favoritenprotokoll nicht speicherbar';return false;
    }
    if(latest.favoriteOp==='clear'&&!updateMark(fresh,{id:latest.favoriteId},'clearing')){
      receipts.delete(latest.key);persistReceipts();reasons.favorite='Freigabeprotokoll nicht speicherbar';return false;
    }
    lastActionAt=now();lastModule=latest.module;if(latest.module==='ghostCapture')lastGhostAt=now();
    try{const response=latest.module==='ariesSync' 
      ? await env.updateAriesTeam?.(latest.ariesPlan)
      : await v16.send(latest.command,{validate:n=>{
        if(!config[latest.module]&&!(latest.module==='favorite'&&latest.favoriteOp==='clear'&&config.cropSell))return false;
        if(latest.module==='ghostCapture')return JSON.stringify(ghosts.propose(n).command)===JSON.stringify(latest.command);
        if(!['HatchEgg','SellPet','PhotographGhost'].includes(latest.command.type)&&
           !(latest.command.type==='MoveItem'&&latest.command.from==='PetHutch'))return true;
        const held=receipts.get(latest.key);receipts.delete(latest.key);
        try{const check=planners[latest.module](n);return !!check&&check.key===latest.key;}
        finally{if(held)receipts.set(latest.key,held);}
      }});
      if(response?.ok!==true)throw new Error('Aktion nicht bestätigt');
      if(latest.ghostPlan&&!ghosts.confirmed(latest.ghostPlan,snapshot()))throw new Error('Ghost-Fang noch nicht im Server-State bestätigt');
      counts[latest.module]++;record.status='confirmed';record.until=['favorite','petSell','ghostCapture'].includes(latest.module)?Number.MAX_SAFE_INTEGER:now()+600000;event(latest.module,'Bestätigt');reasons[latest.module]='Bestätigt; warte auf Zustandsänderung';if(latest.module==='favorite'){
        record.after=now()+600000;
        if(latest.favoriteOp==='set'){
          // Server acknowledged the toggle. Only this mark can later be
          // unstarred by rule changes; unrelated manual favorites stay put.
          const updated=snapshot();const live=updated?.inventory?.favoritedItemIds?.includes(latest.favoriteId);
          updateMark(fresh,{id:latest.favoriteId},live?'owned':'pendingAck');
          if(live)receipts.delete(fresh.actor+'|favorite:clear:'+latest.favoriteId);
        }
        if(latest.favoriteOp==='clear'){
          const updated=snapshot();if(updated&&!updated.inventory.favoritedItemIds.includes(latest.favoriteId)){
            updateMark(fresh,{id:latest.favoriteId},null);
            receipts.delete(fresh.actor+'|favorite:set:'+latest.favoriteId);
          }
        }
      }
      if(latest.effect&&!['favorite','petSell','ghostCapture'].includes(latest.module)){const updated=snapshot();if(updated&&latest.effect(updated))record.until=Math.max(record.after,now()+500);}}
    catch(error){
      if(latest.favoriteOp==='set')updateMark(fresh,{id:latest.favoriteId},'uncertain');
      if(error?.notSent===true||error?.definite===true&&latest.module==='petSell'){receipts.delete(latest.key);}
      record.status='uncertain';record.until=['favorite','petSell','ghostCapture'].includes(latest.module)?Number.MAX_SAFE_INTEGER:now()+600000;
      reasons[latest.module]=String(error?.message||'Aktion nicht bestätigt').slice(0,150);
      event(latest.module,reasons[latest.module]);
    }
    outcomes[latest.module]={text:reasons[latest.module],until:now()+15000};
    persistReceipts();return true;
  }
  async function step(){if(!config.enabled||!env.running()||busy)return false;void loadCatalogs();if(now()-lastActionAt<config.actionIntervalMs)return false;const s=snapshot();if(!s)return false;
    if((config.teamBuilder||config.autoTeams)&&await v16.tick())return true;
    const candidate=selectedJob(s);if(!candidate)return false;busy=true;const generation=runGeneration;try{if(candidate.module==='buy'){if(typeof env.withPurchaseLock!=='function'){reasons.buy='Browser-Kaufsperre nicht verfügbar';return false;}return await env.withPurchaseLock(s.actor,async()=>generation===runGeneration&&env.running()?execute(candidate,s):false);}return await execute(candidate,s);}finally{busy=false;}}
  function preview(){const s=snapshot();return s?candidates(s).map(j=>({module:j.module,action:j.command.type})):[];}
  function status(){const s=snapshot(),b=s?ledger(s):null;return {enabled:config.enabled,busy,catalogs:catalogMessage,weather:s?weather(s):'unbekannt',spentToday:b?.data.spent??0,catalogSource:env.catalogDiagnostics?.()||null,queue:preview(),modules:Object.entries(names).map(([id,label])=>({id,label,on:config[id],confirmed:counts[id],status:outcomes[id]?.until>now()?outcomes[id].text:(reasons[id]||'Warte')})),sell:reasons.sell||'',teamAutomation:(()=>{const t=v16.state();return {ready:t.ready,message:t.why,saved:t.plans.filter(p=>p.saved).length,pending:t.plans.filter(p=>p.pending).length,notice:t.notice,action:t.action};})(),quests:arr(s?.own.dailyQuests?.quests).map(q=>({kind:q.objective?.kind||'unknown',progress:q.progress,target:q.objective?.target,claimed:num(q.claimedAt)})),events:events.slice(-10)};}
  // Human-readable menus retain native IDs internally. Missing catalogs never
  // become free-text inputs or guessed purchase commands.
  function menuChoices() {
    const s = snapshot();
    const human = value => String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g,' ').trim();
    const shopNames = {seed:'Saatgutladen',egg:'Eierladen',tool:'Werkzeugladen',decor:'Dekoladen',rain:'Regen-Shop',dawn:'Morgenrot-Shop',amber:'Bernsteinmond-Shop',snow:'Frost-Shop',thunder:'Gewitter-Shop',apology:'Entschädigungs-Shop'};
    const weatherNames = {Normal:'Kein Spezialwetter',Rain:'Regen',Frost:'Frost',Thunderstorm:'Gewitter',Dawn:'Morgenrot',AmberMoon:'Bernsteinmond'};
    const catalogList = (type, source) => {
      // Owned seeds/eggs can be used without a price catalog. Keep their real
      // native identifiers, not invented defaults. Shop-only entries can be
      // shown now, but purchases still require a verified native coin price.
      const entries = new Map(Object.entries(source || {}));
      const inventory = s ? [...s.inventory.items, ...arr(s.inventory.storages).flatMap(st=>arr(st.items))] : [];
      const shopItems = s ? Object.values(s.game.shops||{}).flatMap(sh=>arr(sh?.inventory)) : [];
      const placedEggs = type === 'Egg' && s
        ? Object.values(s.garden||{}).filter(tile=>tile?.objectType==='egg')
          .map(tile=>({itemType:'Egg',eggId:tile.eggId}))
        : [];
      for (const item of [...inventory,...shopItems,...placedEggs]) {
        const id=kindId(item||{});
        if(item?.itemType===type && str(id) && !entries.has(id)) entries.set(id,null);
      }
      return [...entries].map(([id, record]) => {
        const c = type === 'Seed' ? record?.seed : record;
        const knownShops = arr(c?.eligibleShops).filter(x=>Object.hasOwn(shopNames,x));
        const observedShops = s ? Object.entries(s.game.shops||{}).filter(([key,sh])=>Object.hasOwn(shopNames,key)&&arr(sh?.inventory).some(i=>i?.itemType===type&&kindId(i)===id)).map(([key])=>key) : [];
        const shops = c ? knownShops : observedShops;
        return {id, name: record?.name || c?.name || human(id), price:num(c?.coinPrice)?c.coinPrice:null,
          catalogReady:!!c, shops, owned:s?total(s,type,id,true):null,
          inventoryCount:s?total(s,type,id,false):null,
          stock: shops.map(shopId=>{
            const sh=s?.game.shops?.[shopId], row=arr(sh?.inventory).find(i=>i?.itemType===type&&kindId(i)===id);
            const purchased=s?.own.shopPurchases?.[shopId];
            const used=purchased?.restockId===sh?.restockId ? purchased?.purchases?.[id]||0 : 0;
            return {shop:shopId,available:sh&&num(sh.deadlineMs)&&sh.deadlineMs>s.serverNow&&num(row?.initialStock)&&num(used)?Math.max(0,row.initialStock-used):0};
          })};
      }).sort((a,b)=>a.name.localeCompare(b.name,'de'));
    };
    const weatherIds = [...new Set([...Object.keys(weatherNames),...(s?[weather(s)]:[]),...arr(s?.game.weatherForecast).map(w=>w?.weatherId).filter(str)])];
    const eggChoices=catalogList('Egg',catalogs.eggs);
    const ownedPets=s?[...arr(s.own.petSlots),...s.inventory.items,
      ...arr(s.inventory.storages).flatMap(storage=>arr(storage?.items))]
      .filter(p=>p?.itemType==='Pet'||arr(s.own.petSlots).includes(p)): [];
    const eggSources=[...new Set(ownedPets.map(p=>p?.sourceEggId).filter(str))];
    const eggOrigins=[...eggChoices,...eggSources
      .filter(id=>!eggChoices.some(e=>e.id===id))
      .map(id=>({id,name:human(id)}))];
    const petSellOriginChoices=eggOrigins.map(e=>({...e,
      name:e.name+' · '+ownedPets.filter(p=>p.sourceEggId===e.id).length+' eigene Pets'}));
    return {
      seeds:catalogList('Seed',catalogs.plants), eggs:eggChoices,
      eggFilterChoices:eggChoices.map(e=>({...e,
        name:e.name+' · '+(e.inventoryCount??0)+' im Inventar'})),
      petSellOriginChoices,
      tools:catalogList('Tool',catalogs.tools), decor:catalogList('Decor',catalogs.decor),
      mutations:Object.entries(catalogs.mutations||{}).map(([id,m])=>({id,name:m.name||human(id)})).sort((a,b)=>a.name.localeCompare(b.name,'de')),
      weather:weatherIds.map(id=>({id,name:weatherNames[id]||human(id)})),
      shops:Object.entries(shopNames).map(([id,name])=>({id,name})),
      pets:arr(s?.own.petTeams).filter(t=>str(t?.id)).map(t=>({id:t.id,name:t.name||'Unbenanntes Team'})),
      fields:s?{plant:plots(s,'plant').length,egg:plots(s,'egg').length}:null
    };
  }
  return {menuChoices,configure,getConfig:()=>clone(config),step,preview,status,loadCatalogs,harvestAllowed,saleAllowed,produceValue,petGoals:petAdvisor.goals,analyzePets:goal=>petAdvisor.analyze(snapshot(),catalogs,goal),ariesTeams:()=>petPolicy.ariesTeams(env.ariesService?.()||null),petSellProposal:()=>v16.salePreview(),teamState:()=>v16.state(),requestTeam:key=>v16.requestTeam(key),dispatch:(cmd,opt)=>v16.send(cmd,opt),resetCounters(){for(const k of Object.keys(counts))counts[k]=0;events.length=0;},stop(){runGeneration++;},catalogs:()=>catalogs,choices(){const s=snapshot();return {seeds:Object.keys(catalogs.plants||{}),eggs:Object.keys(catalogs.eggs||{}),tools:Object.keys(catalogs.tools||{}),decor:Object.keys(catalogs.decor||{}),pets:arr(s?.own.petTeams).map(t=>({id:t.id,name:t.name||'Team'}))};}};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createAutomationCore};
