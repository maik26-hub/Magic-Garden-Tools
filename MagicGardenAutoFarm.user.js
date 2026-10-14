// ==UserScript==
// @name         Magic Garden AutoFarm
// @namespace    mg-autofarm-local
// @version      15.4.0
// @updateURL   https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js
// @downloadURL https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js
// @description  V15.4.0: opt-in safe Pet Auto-Sell and Aries saved-team sync
// @match        https://magicgarden.gg/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// ==/UserScript==

(() => {
  "use strict";
  const window = typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis.window;

/** Dedicated updater transport.
 * Tampermonkey GM_xmlhttpRequest bypasses the game's connect-src/CORS limits.
 * The fetch fallback is for non-Tampermonkey environments and offline tests.
 * Neither path runs, evaluates, or imports the remote userscript.
 */
async function fetchReleaseSource(url, options = {}) {
  const gm = options.gmRequest;
  const fetchImpl = options.fetchImpl;
  const timeoutMs = options.timeoutMs || 10000;
  const now = typeof options.now === 'function' ? options.now() : Date.now();
  const requestURL = url + (url.includes('?') ? '&' : '?') + 'check=' + now;
  let gmError = null;
  if (typeof gm === 'function') {
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        const done = (error, value) => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve(value);
        };
        try {
          gm({
            method: 'GET',
            url: requestURL,
            anonymous: true,
            timeout: timeoutMs,
            onload: response => {
              if (response?.status !== 200 ||
                  typeof response.responseText !== 'string') {
                done(new Error('Updater HTTP ' + (response?.status ?? 'unbekannt')));
              } else {
                done(null, response.responseText);
              }
            },
            onerror: () => done(new Error('Updater-Netzwerkfehler')),
            ontimeout: () => done(new Error('Updater-Timeout')),
            onabort: () => done(new Error('Updater abgebrochen'))
          });
        } catch (error) {
          done(error);
        }
      });
    } catch (error) {
      // The secondary fetch is useful with userscript managers where GM
      // permission is unavailable; failure stays neutral in the UI.
      gmError = error;
    }
  }
  if (typeof fetchImpl !== 'function') throw gmError || new Error('Updater-Transport fehlt');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(requestURL, {
      cache: 'no-store', credentials: 'omit', mode: 'cors',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Updater HTTP ' + response.status);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}



/** Own-game catalog discovery. No pinned chunk name, external catalogs or eval.
 * Resource observation starts at document-start; missing timing entries are
 * recovered from the page's module scripts/preloads and their ESM dependencies.
 */
function identifyNativeCatalogs(exports) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const out = {}, seen = new Set();
  function inspect(value, depth) {
    if (!object(value) || seen.has(value) || seen.size >= 8192) return;
    seen.add(value);
    const before = Object.keys(out).length;
    if (object(value.Carrot?.seed) && finite(value.Carrot?.crop?.baseSellPrice)) out.plants = value;
    if (Array.isArray(value.Worm?.diet) && (finite(value.Worm.coinsToFullyReplenishHunger) || finite(value.Worm.maxHunger))) out.pets = value;
    if (finite(value.CommonEgg?.secondsToHatch) && (finite(value.CommonEgg.coinPrice) || object(value.CommonEgg.faunaSpawnWeights))) out.eggs = value;
    if (finite(value.WateringCan?.coinPrice) && object(value.Camera)) out.tools = value;
    if (finite(value.Gold?.coinMultiplier) && typeof value.Gold.group === 'string' && object(value.Wet)) out.mutations = value;
    if (object(value.SeedSilo) && object(value.FeedingTrough) && finite(value.FeedingTrough.coinPrice)) out.decor = value;
    // Native ability metadata is optional; unavailable values are never guessed.
    if (object(value.SellBoostI) && object(value.EggGrowthBoost) &&
      (finite(value.SellBoostI.baseProbability) || object(value.SellBoostI.baseParameters)))
      out.abilities = value;
    if (Object.keys(out).length > before) return;
    // Module namespaces can export hundreds of symbols. Do not stop before
    // late alphabetically-named catalog exports or recurse into catalog rows.
    // Module namespaces, default-export containers, and canonical category maps.
    if (depth < 2) {
      for (const child of Object.values(value).slice(0, depth === 0 ? 4096 : 128)) {
        if (object(child)) inspect(child, depth + 1);
      }
    }
  }
  inspect(exports, 0);
  return out;
}

function createNativeCatalogSource(env) {
  'use strict';
  const limit = { urls: 192, sourceBytes: 4 * 1024 * 1024, totalBytes: 24 * 1024 * 1024, readsPerPass: 12, fetchMs: 5000, importMs: 6000 };
  const now = env.now || (() => Date.now());
  const resources = new Map(), imported = new Map(), catalogData = {};
  let observer = null, flight = null, totalBytes = 0, release = '', issue = '', stopped = false;
  const groups = ['plants', 'pets', 'eggs', 'tools', 'mutations', 'decor'];
  const full = () => groups.every(group => catalogData[group]);
  function context() {
    try {
      const page = new URL(env.pageURL());
      let current = String(env.release?.() || '');
      if (!/^\d+$/.test(current)) current = '';
      return { page, current };
    } catch { return null; }
  }
  function normalize(value, base) {
    const c = context();
    if (!c || typeof value !== 'string' || value.length > 1500) return null;
    try {
      let reference = value;
      // Vite dependency arrays use "assets/X.js" relative to the release root,
      // whereas ordinary static imports use "./X.js" relative to the module.
      if (base && /^assets\//.test(reference)) reference = '../' + reference;
      const url = new URL(reference, base || c.page.href);
      if (url.origin !== c.page.origin || !/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      if (!/^\/(?:version\/\d+\/)?assets\/[A-Za-z0-9_./-]+\.m?js$/.test(url.pathname)) return null;
      const version = url.pathname.match(/^\/version\/(\d+)\//)?.[1];
      if (version && c.current && version !== c.current) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }
  function remember(value, base, discovered = false) {
    const url = normalize(value, base);
    if (!url || resources.has(url) || resources.size >= limit.urls) return;
    resources.set(url, { url, read: false, retryAt: 0, candidate: false, discovered });
  }
  function collect() {
    const c = context();
    if (!c) return;
    if (c.current && release && c.current !== release) {
      resources.clear(); imported.clear();
      for (const key of Object.keys(catalogData)) delete catalogData[key];
      totalBytes = 0;
    }
    if (c.current) release = c.current;
    try { for (const e of env.performance?.getEntriesByType?.('resource') || []) remember(e.name); } catch { /* timing buffer may be unavailable */ }
    try {
      for (const node of env.document?.querySelectorAll?.('script[src],link[rel~="modulepreload"][href]') || []) {
        remember(node.src || node.href || node.getAttribute?.('src') || node.getAttribute?.('href'));
      }
    } catch { /* document may not be ready at document-start */ }
  }
  function references(text, base) {
    // Read references, never execute/rewrite source. Accept only own asset URLs.
    const rx = /["'`]((?:\.{1,2}\/|\/version\/\d+\/assets\/|\/assets\/|assets\/)[^"'`\s]+\.m?js(?:\?[^"'`\s]*)?)["'`]/g;
    for (const match of text.matchAll(rx)) remember(match[1], base, true);
  }
  function containsCatalogData(text) {
    const signals = [
      /\bbaseSellPrice\b/.test(text) && /\bmaxSizeMultiplier\b/.test(text),
      /\bsecondsToHatch\b/.test(text) && /\bfaunaSpawnWeights\b/.test(text),
      /\bcoinsToFullyReplenishHunger\b/.test(text) && /\bdiet\b/.test(text),
      /\bcoinMultiplier\b/.test(text) && /\bGrowth\b/.test(text),
      /\bWateringCan\b/.test(text) && /\bcoinPrice\b/.test(text),
      /\bFeedingTrough\b/.test(text) && /\bcoinPrice\b/.test(text),
      /\bSellBoostI\b/.test(text) && /\bEggGrowthBoost\b/.test(text)
    ];
    return signals.some(Boolean) && /\bexport\b/.test(text);
  }
  function priority(item) {
    // Hints only. A new/renamed bundle is still found through source markers.
    if (item.candidate) return 0;
    if (/BakedRoundedRect|catalog|Catalog|[Pp]lants|[Ee]ggs/.test(item.url)) return 1;
    if (/\/Boot-|\/index-|\/bootScreen-|\/QuinoaCanvas-|\/main-/.test(item.url)) return 2;
    return item.discovered ? 3 : 4;
  }
  async function boundedText(response) {
    if (!response.ok) throw new Error('Katalog-Datei vorübergehend nicht erreichbar');
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > limit.sourceBytes) throw new Error('Katalog-Datei überschreitet Leselimit');
    // Bound streamed reads as well as decompressed bodies.
    if (response.body?.getReader && typeof TextDecoder === 'function') {
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let bytes = 0, text = '';
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit.sourceBytes) { await reader.cancel(); throw new Error('Katalog-Datei überschreitet Leselimit'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
      } finally { reader.releaseLock(); }
    }
    const text = await response.text();
    if (text.length > limit.sourceBytes) throw new Error('Katalog-Datei überschreitet Leselimit');
    return text;
  }
  async function readModule(item) {
    let timer = null;
    const controller = new AbortController();
    try {
      // The race bounds stalled streams too. Never add credentials or use the
      // WebSocket URL (which contains private room/auth data) as a fetch target.
      return await Promise.race([
        (async () => {
          const response = await env.fetch(item.url, { credentials: 'omit', mode: 'same-origin', cache: 'force-cache', signal: controller.signal, redirect: 'error' });
          if (response.url && normalize(response.url) !== item.url) throw new Error('Unerwartete Katalog-Weiterleitung');
          return boundedText(response);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Katalogabruf dauert zu lange')); }, env.fetchTimeoutMs || limit.fetchMs); })
      ]);
    } finally { if (timer !== null) clearTimeout(timer); }
  }
  async function importCatalog(item) {
    let promise = imported.get(item.url);
    if (!promise) {
      const requestRelease = release;
      promise = Promise.resolve().then(() => env.importModule(item.url)).then(exports => {
        if (requestRelease === release && !stopped) Object.assign(catalogData, identifyNativeCatalogs(exports));
        return exports;
      });
      // No duplicated imports while a prior asynchronous module is pending.
      imported.set(item.url, promise);
      promise.catch(() => { if (imported.get(item.url) === promise) imported.delete(item.url); });
    }
    let timer = null;
    try {
      await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Spielmodul noch nicht bereit')), env.importTimeoutMs || limit.importMs); })]);
    } finally { if (timer !== null) clearTimeout(timer); }
  }
  async function pass() {
    collect();
    if (full()) return { ...catalogData };
    const started = now();
    let reads = 0;
    while (!stopped && !full() && reads < limit.readsPerPass && now() - started < 10000) {
      const item = [...resources.values()].filter(i => (!i.read || i.candidate) && i.retryAt <= now() && normalize(i.url)).sort((a,b) => priority(a) - priority(b))[0];
      if (!item) break;
      try {
        if (!item.read) {
          if (totalBytes >= limit.totalBytes) { issue = 'Katalogsuche begrenzt; auf weitere Spieldaten warten'; break; }
          const text = await readModule(item); reads++;
          totalBytes += text.length; item.read = true;
          references(text, item.url);
          item.candidate = containsCatalogData(text);
        }
        if (item.candidate) {
          await importCatalog(item);
          item.candidate = false;
        }
        issue = '';
      } catch (error) {
        item.retryAt = now() + 10000;
        reads++;
        issue = String(error?.message || 'Katalogquelle noch nicht bereit').slice(0, 120);
      }
    }
    if (full()) issue = '';
    return { ...catalogData };
  }
  function load() {
    if (stopped) return Promise.resolve({ ...catalogData });
    if (!flight) flight = pass().finally(() => { flight = null; });
    return flight;
  }
  function diagnostics() { return { release, ready: Object.keys(catalogData), resources: resources.size, issue, loading: !!flight }; }
  function dispose() { stopped = true; observer?.disconnect(); }
  try {
    if (typeof env.PerformanceObserver === 'function') {
      observer = new env.PerformanceObserver(list => { for (const entry of list.getEntries()) remember(entry.name); });
      observer.observe({ type: 'resource', buffered: true });
    }
  } catch { observer = null; }
  collect();
  return { load, diagnostics, dispose };
}


/* Read-only Pet Advisor. No commands, no pet sales, no cross-player data.
 * Profile scores are heuristic comparisons, not exact coin/XP predictions.
 * All calculations use the pet's OWN rolled abilities, current XP and max potential.
 */
function createPetAdvisor() {
  'use strict';
  const goals = [
    {id:'sellCrops',name:'Pflanzen verkaufen',description:'Sell Boost und Crop Refund'},
    {id:'afk',name:'AFK / passives Farming',description:'Coin Finder, Hunger und passives XP'},
    {id:'hatchQuality',name:'Bessere Pet-Hatches',description:'Max Strength, Mutation, Double Hatch und Start-XP'},
    {id:'hatchSpeed',name:'Eier schneller ausbrüten',description:'Egg Growth Boost'},
    {id:'plantGrowth',name:'Pflanzenwachstum',description:'Plant Growth Boost'},
    {id:'cropQuality',name:'Größe & Mutationen',description:'Crop Size, Mutation Boost und Granter'},
    {id:'xp',name:'Pets leveln',description:'XP Boost und Hunger-Unterstützung'},
    {id:'sellPets',name:'Pets verkaufen / Magic Dust',description:'Dust Boost und Pet Refund'}
  ];
  const groupWeights = {
    sellCrops:{sellBoost:12,cropRefund:6,doubleHarvest:4,coinFinder:2},
    afk:{coinFinder:9,hungerBoost:7,hungerRestore:6,petXp:4,seedFinder:3,plantGrowth:2},
    hatchQuality:{maxStrength:12,petMutation:10,doubleHatch:10,hatchXp:6,petRefund:1},
    hatchSpeed:{eggGrowth:15,petXp:1,hungerBoost:2},
    plantGrowth:{plantGrowth:15,cropSize:3,weatherMutation:2},
    cropQuality:{cropSize:12,weatherMutation:11,granter:9,plantGrowth:4},
    xp:{petXp:12,hungerRestore:5,hungerBoost:4,hatchXp:2},
    sellPets:{dustBoost:15,petRefund:4}
  };
  const patterns = [
    [/^(?:Snowy|Dawn|Thunder)?CoinFinder/i,'coinFinder'],
    [/^SellBoost/i,'sellBoost'],[/^ProduceRefund$/i,'cropRefund'],
    [/^DoubleHarvest$/i,'doubleHarvest'],[/^DustBoost$/i,'dustBoost'],
    [/^PetRefund/i,'petRefund'],[/^DoubleHatch/i,'doubleHatch'],
    [/^PetHatchSizeBoost/i,'maxStrength'],[/^PetMutationBoost/i,'petMutation'],
    [/^PetAgeBoost/i,'hatchXp'],[/^(?:Snowy|Thunder|Amber)?EggGrowthBoost/i,'eggGrowth'],
    [/^(?:Snowy|Dawn|Amber|Thunder)?PlantGrowthBoost/i,'plantGrowth'],
    [/^(?:Snowy)?(?:ProduceScaleBoost|CropSizeBoost)/i,'cropSize'],
    [/^(?:Snowy|Dawn|Thunder|Amber)?(?:ProduceMutationBoost|CropMutationBoost)|^DawnBoost$|^AmberMoonBoost$|^ThunderBoost$/i,'weatherMutation'],
    [/Granter$|^RainDance$/,'granter'],
    [/^(?:Snowy|Dawn|Thunder|Amber)?(?:PetXpBoost|DawnXpBoost|ThunderXpBoost|AmberXpBoost)/i,'petXp'],
    [/^HungerBoost|^SnowyHungerBoost/i,'hungerBoost'],
    [/^HungerRestore|^SnowyHungerRestore/i,'hungerRestore'],
    [/^SeedFinder/i,'seedFinder']
  ];
  const conditionByAbility = [
    [/^Snowy|^Snow|^Frost/i,['Snow','Winter','Frost']],
    [/^Dawn/i,['Dawn']], [/^Amber/i,['AmberMoon','Amber']],
    [/^Thunder/i,['Thunderstorm','Thunder']]
  ];
  const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const arr=x=>Array.isArray(x)?x:[];
  const text=x=>typeof x==='string'&&x.length<120?x:'';
  const human=x=>String(x||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ');
  const abilityGroup=id=>patterns.find(([rx])=>rx.test(id))?.[1]||'other';
  const conditional=id=>conditionByAbility.find(([rx])=>rx.test(id))?.[1]||null;
  const permittedWeather=(id,weather)=>{
    const allowed=conditional(id);
    return !allowed||allowed.includes(weather);
  };
  function strength(pet,info) {
    if(!isObject(info)||!finite(info.maxScale)||info.maxScale<=1||
       !finite(info.hoursToMature)||info.hoursToMature<=0||
       !finite(pet.targetScale)||!finite(pet.xp)||pet.xp<0)return null;
    const max=Math.floor(((pet.targetScale-1)/(info.maxScale-1))*20+80);
    if(!Number.isFinite(max)||max<80||max>100)return null;
    const perLevel=Math.floor(3600*info.hoursToMature/30);
    if(perLevel<1)return null;
    const grown=Math.min(30,Math.floor(pet.xp/perLevel));
    const current=max-30+grown;
    return {current,max,base:max-30,progress:grown,stepsRemaining:30-grown,
      xpPerLevel:perLevel,xpToNext:grown===30?0:perLevel-(pet.xp%perLevel)};
  }
  function gather(s) {
    const own=s?.own,inv=s?.inventory;
    if(!isObject(own)||!isObject(inv)||!Array.isArray(inv.items))return [];
    const seen=new Set(),pets=[];
    const add=(items,place)=>{
      for(const item of arr(items)){
        if(!isObject(item)||!text(item.id)||!text(item.petSpecies)||
          seen.has(item.id))continue;
        if(place!=='Aktiv'&&item.itemType!=='Pet')continue;
        seen.add(item.id);
        pets.push({...item,location:place});
      }
    };
    add(own.petSlots,'Aktiv');
    add(inv.items,'Inventar');
    for(const storage of arr(inv.storages)){
      if(storage?.decorId==='PetHutch')add(storage.items,'Pet Hutch');
    }
    return pets;
  }
  function profile(pet,petCatalog,abilityCatalog,goal,weather) {
    const metrics=strength(pet,petCatalog?.[pet.petSpecies]);
    const abilities=arr(pet.abilities).filter(text);
    const weights=groupWeights[goal]||groupWeights.afk;
    const scoreAt=value=>{
      let score=0;
      const highlights=[];
      for(const id of abilities){
        const group=abilityGroup(id),weight=weights[group]||0;
        if(!weight)continue;
        const allowed=permittedWeather(id,weather);
        const strengthFactor=value===null?0:value/100;
        // Tier factor is a planning heuristic, never an asserted game formula.
        const tier=/IV$/.test(id)?1.6:/III$/.test(id)?1.35:/II(?:_NEW)?$/.test(id)?1.15:1;
        const contribution=allowed?weight*strengthFactor*tier:0;
        score+=contribution;
        const detail=abilityCatalog?.[id];
        const baseChance=finite(detail?.baseProbability)?detail.baseProbability:null;
        const chance=baseChance===null||value===null?null:Math.round(baseChance*value)/100;
        highlights.push({id,name:text(detail?.name)||human(id),group,activeInWeather:allowed,
          strength: value,approxChancePercent:chance,weight:contribution});
      }
      return {score:Math.round(score*100)/100,highlights};
    };
    const now=scoreAt(metrics?.current??null);
    const future=scoreAt(metrics?.max??null);
    return {now,future,metrics,abilities,abilityNames:abilities.map(id=>text(abilityCatalog?.[id]?.name)||human(id)),
      rated:!!metrics&&abilities.length>0&&abilities.some(id=>Boolean(weights[abilityGroup(id)]))};
  }
  function protectedReasons(pet,s) {
    const reasons=[];
    const favored=arr(s?.inventory?.favoritedItemIds);
    if(favored.includes(pet.id))reasons.push('Favorit');
    if(pet.locked||pet.isLocked||pet.protected||pet.isProtected)reasons.push('Gesperrt');
    if(pet.location==='Aktiv')reasons.push('Aktives Pet');
    if(pet.location==='Pet Hutch')reasons.push('Im Pet Hutch');
    const teams=arr(s?.own?.petTeams);
    if(teams.some(t=>arr(t?.members).some(m=>m?.petId===pet.id)))reasons.push('Gespeichertes Team');
    if(arr(pet.mutations).length)reasons.push('Mutation');
    const journal=s?.own?.journal?.pets?.[pet.petSpecies];
    if(!isObject(journal)||!Array.isArray(journal.abilitiesLogged)||
      !Array.isArray(journal.variantsLogged))reasons.push('Journal noch unvollständig/unklar');
    else {
      const logged=new Set(journal.abilitiesLogged.map(x=>x?.ability));
      if(arr(pet.abilities).some(a=>!logged.has(a)))reasons.push('Ungesehene Fähigkeit');
      const variants=new Set(journal.variantsLogged.map(x=>x?.variant));
      if(!variants.has('Normal'))reasons.push('Normalvariante im Journal fehlt');
    }
    return reasons;
  }
  // Long-term keep decisions are NOT based on species, rarity, current
  // level, or the egg the pet came from. Evaluate max-level ability coverage
  // across ALL farming team roles. Seasonal abilities get their matching
  // weather when projecting long-term value so Frost pets are never labelled
  // useless just because it is currently sunny.
  const weathers=['Normal','Frost','Dawn','AmberMoon','Thunderstorm'];
  const tierFactor=id=>/IV$/.test(id)?1.6:/III$/.test(id)?1.35:/II(?:_NEW)?$/.test(id)?1.15:1;
  const abilityFamily=id=>id.replace(/(?:IV|III|II|I)(?:_NEW)?$/,'');
  function maxAbilities(pet){
    const result=new Map();
    if(!pet.metrics||!pet.abilities.length)return null;
    for(const id of pet.abilities){
      if(abilityGroup(id)==='other')return null;
      const weather=(conditional(id)||['Normal']).join('/');
      const key=abilityFamily(id)+'@'+weather;
      const power=tierFactor(id)*pet.metrics.max/100;
      result.set(key,Math.max(result.get(key)||0,power));
    }
    return result;
  }
  function dominates(other,candidate){
    if(other.id===candidate.id||!other.metrics||!candidate.metrics)return false;
    const wanted=maxAbilities(candidate),offered=maxAbilities(other);
    if(!wanted?.size||!offered?.size)return false;
    let stronger=false;
    for(const [ability,power] of wanted){
      const better=offered.get(ability);
      if(better===undefined||better+0.000001<power)return false;
      if(better>power+0.000001)stronger=true;
    }
    // An otherwise equal extra ability is a genuine portfolio advantage.
    // Equal max-level duplicates beyond the three reserved team slots are
    // also redundant, so they may be *reviewed* (never automatically sold).
    if([...offered.keys()].some(key=>!wanted.has(key)))stronger=true;
    return stronger || offered.size===wanted.size;
  }
  function portfolio(profiles,catalogs){
    const perGoal={},reserved=new Set(),bestRoles=new Map();
    for(const goal of goals){
      const candidates=profiles.map(p=>{
        // Score at all relevant weather states; long-term retain is based on
        // the BEST valid condition, not only today's active weather.
        const projected=weathers.map(weather=>
          profile({petSpecies:p.species,targetScale:p.targetScale,
            xp:p.xp,abilities:p.abilities},catalogs.pets,catalogs.abilities,goal.id,weather));
        const best=projected.reduce((a,b)=>
          b.future.score>a.future.score?b:a);
        return {pet:p,potential:best.future.score};
      }).filter(x=>x.pet.metrics&&x.potential>0)
        .sort((a,b)=>b.potential-a.potential||
          b.pet.metrics.current-a.pet.metrics.current||
          a.pet.id.localeCompare(b.pet.id));
      const selected=candidates.slice(0,3);
      perGoal[goal.id]=selected.map(x=>({id:x.pet.id,maxLevelScore:x.potential}));
      for(const x of selected){
        reserved.add(x.pet.id);
        const earlier=bestRoles.get(x.pet.id);
        if(!earlier||x.potential>earlier.score)
          bestRoles.set(x.pet.id,{goal:goal.id,name:goal.name,score:x.potential});
      }
    }
    return {perGoal,reserved,bestRoles};
  }
  function analyze(snapshot,catalogs={},goal='afk') {
    const profiles=[];
    const pets=gather(snapshot);
    const weather=text(snapshot?.game?.weather)||text(snapshot?.game?.weatherWindow?.weatherId)||'Normal';
    const actualGoal=groupWeights[goal]?goal:'afk';
    const teamRefs=new Set(arr(snapshot?.own?.petTeams).flatMap(t=>arr(t?.members).map(m=>m?.petId)));
    for(const pet of pets){
      const report=profile(pet,catalogs.pets,catalogs.abilities,actualGoal,weather);
      const reasons=protectedReasons(pet,snapshot);
      profiles.push({id:pet.id,name:text(pet.name)||text(catalogs.pets?.[pet.petSpecies]?.name)||human(pet.petSpecies),
        species:pet.petSpecies,location:pet.location,sourceEggId:text(pet.sourceEggId)||null,
        targetScale:pet.targetScale,xp:pet.xp,
        mutations:arr(pet.mutations).filter(text),abilities:report.abilities,
        abilityNames:report.abilityNames,now:report.now,future:report.future,metrics:report.metrics,
        rated:report.rated,hunger:finite(pet.hunger)?pet.hunger:null,
        teamMember:teamRefs.has(pet.id),protected:reasons.length>0,protection:reasons
      });
    }
    // Team suggestions can prioritize performance TODAY; the retain/sell
    // decision instead prioritizes fully matured strength in every role.
    const eligible=profiles.filter(p=>p.rated).sort((a,b)=>
      b.future.score-a.future.score||b.now.score-a.now.score||
      a.name.localeCompare(b.name,'de'));
    const recommendations=eligible.slice(0,3);
    const teamPlan=portfolio(profiles,catalogs);
    const decisions=[],reviews=[];
    for(const candidate of profiles){
      const reserve=teamPlan.reserved.has(candidate.id);
      const primary=teamPlan.bestRoles.get(candidate.id)||null;
      const unknown=!candidate.metrics||!candidate.abilities.length||
        candidate.abilities.some(id=>abilityGroup(id)==='other');
      const hardProtection=candidate.protection.filter(reason=>
        reason!=='Journal noch unvollständig/unklar'&&
        reason!=='Ungesehene Fähigkeit'&&
        reason!=='Normalvariante im Journal fehlt');
      const peer=profiles.filter(p=>teamPlan.reserved.has(p.id))
        .find(p=>dominates(p,candidate));
      let kind,reason;
      if(reserve){
        kind='keep';reason='Eines der besten Max-Level-Pets für '+
          (primary?.name||'ein Spezialteam');
      }else if(hardProtection.length){
        kind='keep';reason='Behalten: '+hardProtection.join(', ');
      }else if(unknown){
        kind='review';reason='Max-Level oder individuelle Boosts unklar – nicht automatisch aussortieren';
      }else if(peer){
        kind='review';reason='Max-Level/Boosts werden von '+peer.name+
          ' abgedeckt. Manuell prüfen, bevor du das Pet verkaufst.';
        reviews.push({id:candidate.id,name:candidate.name,reason,
          comparedTo:peer.id,blockedBy:candidate.protection.slice()});
      }else{
        kind='keep';reason='Keine bessere Abdeckung seiner Fähigkeiten in den Spezialteams';
      }
      candidate.decision=kind;
      candidate.decisionReason=reason;
      candidate.bestRole=primary;
      candidate.dominatedBy=peer?.id||null;
      candidate.sellCandidate=kind==='review'&&!!peer;
      candidate.autoSellAllowed=false; // Never send unverified pet-sale commands.
      decisions.push({id:candidate.id,name:candidate.name,kind,reason,
        dominatedBy:peer?.id||null,protected:candidate.protected,
        suggestedSell:!!peer,autoSellAllowed:false});
    }
    return {goal:actualGoal,goalName:goals.find(g=>g.id===actualGoal).name,weather,
      count:profiles.length,locations:{
        active:profiles.filter(x=>x.location==='Aktiv').length,
        inventory:profiles.filter(x=>x.location==='Inventar').length,
        hutch:profiles.filter(x=>x.location==='Pet Hutch').length
      },
      profiles,recommendations:recommendations.map(p=>p.id),
      teamPlans:teamPlan.perGoal,decisions,
      retained:decisions.filter(d=>d.kind==='keep').length,
      pendingReview:decisions.filter(d=>d.kind==='review').length,
      reviews,readOnly:true,coverage:profiles.filter(x=>x.rated).length,
      notice:'Behalten nach Max-Level und individuellen Boosts über alle Teamziele. Verkaufsvorschläge nur manuell – kein Pet-Auto-Sell aktiv.'
    };
  }
  return {goals,analyze,abilityGroup,strength};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPetAdvisor};

/** Optional Aries integration and conservative Pet Sell plan.
 * No external Aries code is copied. Aries currently exposes *saved* teams
 * through QWS_PetsService, not Team Builder suggestions. AutoFarm may manage
 * only an explicitly opted-in saved team using its own role recommendations.
 */
function createPetAutomationPolicy() {
  'use strict';
  const arr=x=>Array.isArray(x)?x:[];
  const str=x=>typeof x==='string'&&x.length>0&&x.length<120;
  const normalizeId=x=>typeof x==='string'?x.toLowerCase():'';
  function ariesTeams(service) {
    if(!service||typeof service.getTeams!=='function')return [];
    try {
      const rows=service.getTeams();
      if(!Array.isArray(rows))return [];
      return rows.filter(t=>t&&str(t.id)&&Array.isArray(t.slots)).slice(0,100).map(t=>({
        id:t.id,name:str(t.name)?t.name:'Unbenanntes Aries-Team',
        slots:t.slots.slice(0,3).map(x=>str(x)?x:null),
        serverId:str(t.serverId)?t.serverId:null
      }));
    } catch {return [];}
  }
  function reservedAriesPetIds(service) {
    return new Set(ariesTeams(service).flatMap(t=>t.slots.filter(str).map(normalizeId)));
  }
  function eligibleSell(s,report,config,service,protectedItem) {
    if(!config.petSell||!config.petSellEggs?.length||!s?.inventory?.items)return {pet:null,why:'Kein Pet-Verkauf ohne Schalter und Herkunftsei-Auswahl'};
    if(!report||!Array.isArray(report.profiles)||!Array.isArray(report.decisions))return {pet:null,why:'Pet-Analyse nicht bereit'};
    const protectedAries=reservedAriesPetIds(service);
    const nativeTeams=new Set(arr(s.own?.petTeams).flatMap(t=>arr(t?.members).map(m=>normalizeId(m?.petId)).filter(Boolean)));
    const active=new Set(arr(s.own?.petSlots).map(p=>normalizeId(p?.id)).filter(Boolean));
    const favorites=new Set(arr(s.inventory.favoritedItemIds).map(normalizeId));
    const reportById=new Map(report.profiles.map(p=>[normalizeId(p.id),p]));
    const decisions=new Map(report.decisions.map(d=>[normalizeId(d.id),d]));
    for(const item of s.inventory.items){
      if(item?.itemType!=='Pet'||!str(item.id)||!str(item.petSpecies))continue;
      const id=normalizeId(item.id),profile=reportById.get(id),decision=decisions.get(id);
      if(!profile||!decision||decision.autoSellAllowed===true||decision.kind!=='review'||!profile.sellCandidate)continue;
      if(profile.location!=='Inventar'||profile.protected||profile.protection?.length)continue;
      if(!str(profile.sourceEggId)||!config.petSellEggs.includes(profile.sourceEggId)||profile.sourceEggId!==item.sourceEggId)continue;
      if(!Array.isArray(item.abilities)||!item.abilities.length||item.abilities.some(a=>!str(a)))continue;
      if(!Array.isArray(item.mutations)||item.mutations.length||!Number.isFinite(item.xp)||!Number.isFinite(item.targetScale))continue;
      if(favorites.has(id)||active.has(id)||nativeTeams.has(id)||protectedAries.has(id))continue;
      if(item.locked||item.isLocked||item.protected||item.isProtected||protectedItem?.({},item))continue;
      if(s.heldId===item.id)continue;
      const parent=reportById.get(normalizeId(profile.dominatedBy));
      if(!parent||!parent.metrics||!profile.metrics||parent.id===item.id)continue;
      // The advisor has proved this exact *boost set* is covered by a pet
      // retained for a purpose-built team; this excludes "weak" only by level.
      if(!Object.values(report.teamPlans||{}).some(list=>arr(list).some(m=>normalizeId(m.id)===normalizeId(parent.id))))continue;
      return {pet:item,why:'Max-Level-Boosts von einem reservierten Pet abgedeckt'};
    }
    return {pet:null,why:'Keine sicher übertroffenen, freigegebenen Inventar-Pets'};
  }
  function recommendAriesUpdate(s,report,config,service) {
    if(!config.ariesSync)return {plan:null,why:'Aries-Sync aus'};
    if(!service||typeof service.saveTeam!=='function'||typeof service.isTeamSyncEnabled!=='function'||
      !service.isTeamSyncEnabled())return {plan:null,why:'Aries Team-Service/Synchronisierung nicht bereit'};
    const teams=ariesTeams(service);
    if(!teams.length)return {plan:null,why:'Keine gespeicherten Aries-Teams'};
    if(!Array.isArray(report?.profiles)||!report?.teamPlans)return {plan:null,why:'Pet-Analyse nicht bereit'};
    const owned=new Map(report.profiles.map(p=>[normalizeId(p.id),p.id]));
    const goals=new Set(['sellCrops','afk','hatchQuality','hatchSpeed','plantGrowth','cropQuality','xp','sellPets']);
    for(const rule of arr(config.ariesManagedTeams)){
      if(!str(rule?.teamId)||!goals.has(rule.goal))continue;
      const current=teams.find(t=>t.id===rule.teamId);
      if(!current)continue;
      // Require a server-linked team to ensure Aries actually syncs this
      // template into the game instead of only changing local storage.
      if(!current.serverId)continue;
      const desired=arr(report.teamPlans[rule.goal]).slice(0,3).map(p=>owned.get(normalizeId(p.id))).filter(Boolean);
      if(!desired.length||new Set(desired.map(normalizeId)).size!==desired.length)continue;
      const currentMembers=current.slots.filter(Boolean).map(normalizeId);
      if(JSON.stringify(currentMembers)===JSON.stringify(desired.map(normalizeId)))continue;
      if(desired.some(id=>!owned.has(normalizeId(id))))continue;
      return {plan:{id:current.id,name:current.name,goal:rule.goal,slots:[...desired,...Array(Math.max(0,3-desired.length)).fill(null)],before:current.slots},why:'Aries-Team kann mit eigenen Max-STR-Pets verbessert werden'};
    }
    return {plan:null,why:'Aries-Teams bereits passend oder keine geeigneten eigenen Pets'};
  }
  return {ariesTeams,reservedAriesPetIds,eligibleSell,recommendAriesUpdate};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPetAutomationPolicy};

/* Native command shapes verified against public game build 1517.
 * Original implementation. The caller owns the only execution loop. */
function createAutomationCore(env) {
  'use strict';
  const KEY='magic_garden_automation_v15', LEDGER='magic_garden_purchase_budget_v15', RECEIPTS='magic_garden_action_receipts_v15';
  const names={favorite:'Wertschutz / Favoriten',journal:'Journal',feed:'Pets füttern',trough:'Futtertrog',claims:'Quest-Belohnungen',hatch:'Eier ausbrüten',plant:'Nachpflanzen',eggs:'Eier nachlegen',water:'Gießen',storage:'Lager',teams:'Wetter-Petteams',buy:'Shop-Einkauf',petSell:'Pet Auto-Sell',ariesSync:'Aries-Teams aktualisieren'};
  const defaults={enabled:false,favorite:false,journal:false,feed:false,trough:false,claims:false,hatch:false,plant:false,eggs:false,water:false,storage:false,teams:false,buy:false,petSell:false,ariesSync:false,petSellEggs:[],petSellPerSession:5,ariesManagedTeams:[],seedSpecies:'',eggPlaceMode:'all',eggPlaceAllowed:[],eggHatchMode:'all',eggHatchAllowed:[],hungerPercent:30,foodMaxValue:1000,troughItems:5,toolReserve:2,waterMinSeconds:600,keepValue:0,keepSpecies:[],minHarvestSize:0,minHarvestValue:0,wantedMutations:[],pauseWeather:[],buyRules:[],teamRules:[],actionIntervalMs:900};
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
    out.petSellPerSession=bounded(v.petSellPerSession,5,1,20);
    const goals=new Set(['sellCrops','afk','hatchQuality','hatchSpeed','plantGrowth','cropQuality','xp','sellPets']);
    out.ariesManagedTeams=arr(v.ariesManagedTeams)
      .filter(r=>obj(r)&&str(r.teamId)&&goals.has(r.goal))
      .slice(0,16).map(r=>({teamId:r.teamId,goal:r.goal}));
    const ranges={hungerPercent:[1,90],foodMaxValue:[1,1e9],troughItems:[0,50],toolReserve:[0,99],waterMinSeconds:[30,86400],keepValue:[0,1e12],minHarvestSize:[0,100],minHarvestValue:[0,1e12],actionIntervalMs:[500,10000]};
    for(const [key,limits]of Object.entries(ranges))out[key]=bounded(v[key],defaults[key],...limits);
    const shops=['seed','egg','tool','decor','rain','dawn','amber','snow','thunder','apology'];
    out.buyRules=arr(v.buyRules).filter(r=>obj(r)&&['Seed','Egg','Tool','Decor'].includes(r.type)&&str(r.id)&&shops.includes(r.shop)).slice(0,30).map(r=>({type:r.type,id:r.id,shop:r.shop,maxPrice:bounded(r.maxPrice,0,0,1e12),perRestock:bounded(r.perRestock,1,1,100),maxOwned:bounded(r.maxOwned,10,1,10000)}));
    out.teamRules=arr(v.teamRules).filter(r=>obj(r)&&str(r.weather)&&str(r.teamId)).slice(0,15).map(r=>({weather:r.weather,teamId:r.teamId}));return out;
  }
  let config=normalize(read(KEY,{})),catalogs={},catalogMessage='Warte auf Spielkataloge',loading=false,nextCatalogAt=0,catalogFailures=0,lastActionAt=-Infinity,busy=false,lastModule='',runGeneration=0;
  const petAdvisor=(typeof createPetAdvisor==='function' ? createPetAdvisor : require('./pet-advisor.js').createPetAdvisor)();
  const petPolicy=(typeof createPetAutomationPolicy==='function'
    ? createPetAutomationPolicy : require('./pet-automation.js').createPetAutomationPolicy)();
  const counts=Object.fromEntries(Object.keys(names).map(k=>[k,0])),reasons={},events=[],receipts=new Map();
  for(const r of arr(read(RECEIPTS,[])).slice(-200))if(obj(r)&&typeof r.key==='string'&&r.key.length<400&&num(r.until)&&r.until>env.now()&&typeof r.fp==='string')receipts.set(r.key,r);
  const now=()=>env.now();
  function event(module,message){events.push({at:now(),module,message});if(events.length>40)events.shift();}
  function persistReceipts(){
    for(const [key,r]of receipts)if(r.until<=now())receipts.delete(key);
    while(receipts.size>200){const removable=[...receipts].find(([,r])=>r.kind!=='favorite');if(!removable)return false;receipts.delete(removable[0]);}
    return write(RECEIPTS,[...receipts.values()]);
  }
  function configure(patch){const candidate=normalize({...config,...patch});if(!write(KEY,candidate))throw new Error('Einstellungen konnten nicht gespeichert werden');config=candidate;runGeneration++;return structuredClone(config);}
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
      const names = {plants:'Pflanzen',eggs:'Eier',pets:'Pets',tools:'Werkzeuge',decor:'Dekoration',mutations:'Mutationen'};
      const all = ['plants','eggs','pets','tools','decor','mutations'].every(key=>!!catalogs[key]);
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
  function keepItem(s,i){if(nativeFavorite(s,i)||env.protected({},i))return true;if(config.keepSpecies.includes(i.species))return true;if(config.keepValue>0){const v=produceValue(i);return v===null||v>=config.keepValue;}return false;}
  function ordinaryFood(s,i){const v=produceValue(i);return i?.itemType==='Produce'&&str(i.id)&&Array.isArray(i.mutations)&&!i.mutations.length&&!keepItem(s,i)&&v!==null&&v>0&&v<=config.foodMaxValue;}
  function sortedFood(s){return s.inventory.items.filter(i=>ordinaryFood(s,i)).sort((a,b)=>produceValue(a)-produceValue(b));}
  function weather(s){return typeof s.game.weather==='string'?s.game.weather:s.game.weatherWindow?.weatherId||'Normal';}
  function harvestAllowed(plant,crop){if(!config.enabled)return true;const s=snapshot();if(!s)return false;if(config.pauseWeather.includes(weather(s)))return false;if(config.journal&&total(s,'Tool','Camera')>0&&journalNeed(s,{...crop,species:crop.species||plant.species},'produce'))return false;if(config.minHarvestSize>0&&(!num(crop.size)||crop.size<config.minHarvestSize))return false;if(config.wantedMutations.length&&!arr(crop.mutations).some(m=>config.wantedMutations.includes(m)))return false;if(config.minHarvestValue>0){const v=produceValue({...crop,species:crop.species||plant.species});if(v===null||v<config.minHarvestValue)return false;}return true;}
  function journalNeed(s,i,category){const species=category==='pets'?i.petSpecies:i.species,record=s.own.journal?.[category];if(!obj(record)||!str(species)||!Array.isArray(i.mutations))return false;const variants=i.mutations.length?i.mutations.filter(m=>catalogs.mutations?.[m]):['Normal'];if(category==='produce'&&i.size===100)variants.push('Max Weight');const logged=arr(record[species]?.variantsLogged).map(v=>v.variant);return variants.some(v=>!logged.includes(v));}
  function saleAllowed(){if(!config.enabled)return true;const s=snapshot();if(!s)return false;const produce=s.inventory.items.filter(i=>i?.itemType==='Produce'&&!nativeFavorite(s,i));if(produce.some(i=>keepItem(s,i))){reasons.sell='Warte auf Wertschutz: Auto-Favoriten einschalten oder Regeln anpassen';return false;}if(config.journal&&total(s,'Tool','Camera')>0&&produce.some(i=>journalNeed(s,i,'produce'))){reasons.sell='Warte auf Journal-Eintrag';return false;}if(config.feed){const food=sortedFood(s),hungry=arr(s.own.petSlots).some(p=>{const c=catalogs.pets?.[p?.petSpecies],max=c?.coinsToFullyReplenishHunger??c?.maxHunger;return num(max)&&num(p?.hunger)&&p.hunger/max*100<config.hungerPercent&&food.some(i=>arr(c.diet).includes(i.species));});if(hungry){reasons.sell='Füttern hat Vorrang';return false;}}reasons.sell='Bereit';return true;}
  function allowed(key,fp){const r=receipts.get(key);if(!r||r.until<=now())return true;if(r.status==='pending'||r.status==='uncertain')return false;return r.fp!==fp&&now()>=r.after;}
  function job(module,key,fp,command,effect,cooldown=1500){const s=snapshot(),scoped=(s?.actor||'')+'|'+key;if(!allowed(scoped,fp)){reasons[module]='Warte auf Bestätigung / Änderung';return null;}return {module,key:scoped,fp,command,effect,cooldown};}
  function planFavorite(s){for(const i of s.inventory.items)if(i?.itemType==='Produce'&&str(i.id)&&!nativeFavorite(s,i)&&keepItem(s,i))return job('favorite','favorite:'+i.id,'unstarred',{type:'ToggleLockItem',itemId:i.id},n=>n.inventory.favoritedItemIds.includes(i.id),600000);return null;}
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
    if(counts.petSell>=config.petSellPerSession){
      reasons.petSell='Sicherheitslimit pro Sitzung erreicht';return null;
    }
    const service=env.ariesService?.()||null;
    const report=petAdvisor.analyze(s,catalogs,'sellPets');
    const proposed=petPolicy.eligibleSell(s,report,config,service,env.protected);
    if(!proposed.pet){reasons.petSell=proposed.why;return null;}
    const id=proposed.pet.id;
    const j=job('petSell','sellpet:'+id,
      [id,proposed.pet.xp,proposed.pet.targetScale,arr(proposed.pet.abilities).join('|')].join(':'),
      {type:'SellPet',itemId:id},
      next=>!arr(next.inventory?.items).some(i=>i?.itemType==='Pet'&&i.id===id),
      600000);
    if(j)j.petSellId=id;
    return j;
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
    for(const r of config.buyRules){
      const shop=s.game.shops?.[r.shop];if(!shop||!Array.isArray(shop.inventory)||!str(shop.restockId)||!num(shop.deadlineMs)||shop.deadlineMs<=s.serverNow)continue;
      const stock=shop.inventory.find(i=>i?.itemType===r.type&&kindId(i)===r.id),catalog=catalogFor(r.type,r.id),price=catalog?.coinPrice;
      if(!stock||!num(price)||price<0||!num(stock.initialStock)||price>r.maxPrice)continue;
      if(!Array.isArray(catalog.eligibleShops)||!catalog.eligibleShops.includes(r.shop))continue;
      if(catalog.isOneTimePurchase&&total(s,r.type,r.id,true)>0)continue;
      if(total(s,r.type,r.id,true)>=r.maxOwned)continue;
      if(num(catalog.maxInventoryQuantity)&&total(s,r.type,r.id)>=catalog.maxInventoryQuantity)continue;
      const bought=s.own.shopPurchases[r.shop],purchased=bought?.restockId===shop.restockId?bought.purchases?.[r.id]:0;
      if(purchased!==undefined&&!num(purchased))continue;
      if(stock.initialStock-(purchased||0)<=0)continue;
      const token=r.shop+':'+shop.restockId+':'+r.type+':'+r.id;
      if((budget.data.counts[token]||0)>=r.perRestock)continue;
      if(s.own.coinsCount<price){reasons.buy='Nicht genug Coins für diesen Artikel';continue;}
      const item={itemType:r.type,[{Seed:'species',Egg:'eggId',Tool:'toolId',Decor:'decorId'}[r.type]]:r.id};
      const j=job('buy','buy:'+token,String(purchased||0),{type:'PurchaseShopItem',shop:r.shop,viewMode:'list',item,quantity:1},n=>{const p=n.own.shopPurchases?.[r.shop];return p?.restockId===shop.restockId&&(p.purchases?.[r.id]||0)>(purchased||0);},5000);
      if(j)j.purchase={key:budget.key,token,price,coins:s.own.coinsCount,shop:r.shop,restockId:shop.restockId,id:r.id,beforeCount:purchased||0};return j;
    }return null;
  }
  const planners={favorite:planFavorite,journal:planJournal,feed:planFeed,trough:planTrough,claims:planClaims,hatch:planHatch,plant:planPlant,eggs:planEggs,water:planWater,storage:planStorage,teams:planTeams,buy:planBuy,petSell:planPetSell,ariesSync:planAriesSync};
  function candidates(s){const output=[];for(const [module,plan]of Object.entries(planners)){if(!config[module]){reasons[module]='Aus';continue;}reasons[module]='Nichts zu tun';try{const j=plan(s);if(j){reasons[module]='Bereit';output.push(j);}}catch{reasons[module]='Unerwartete Spieldaten – ausgelassen';}}return output;}
  function selectedJob(s){const all=candidates(s),urgent=all.find(j=>['favorite','claims','feed'].includes(j.module));const priority={plantSeeds:'plant',growEggs:'eggs',hatchEggs:'hatch',waterPlants:'water',feedPets:'feed',logJournal:'journal',buySeeds:'buy',buyEggs:'buy',buyDecor:'buy'};const goals=arr(s.own.dailyQuests?.quests).filter(q=>q?.claimedAt===null&&q?.completedAt===null).map(q=>priority[q.objective?.kind]).filter(Boolean);const questAction=all.find(j=>goals.includes(j.module)&&j.module!==lastModule);return urgent||questAction||all.find(j=>j.module!==lastModule)||all[0]||null;}
  async function execute(candidate,s){
    if(!env.running()||!config.enabled)return false;
    const fresh=snapshot();if(!fresh||fresh.actor!==s.actor||fresh.generation!==s.generation)return false;
    const latest=planners[candidate.module](fresh);if(!latest||latest.key!==candidate.key||JSON.stringify(latest.command)!==JSON.stringify(candidate.command))return false;
    const record={key:latest.key,kind:latest.module,fp:latest.fp,status:'pending',until:latest.module==='favorite'?Number.MAX_SAFE_INTEGER:now()+600000,after:now()+latest.cooldown};
    receipts.set(latest.key,record);
    if(!persistReceipts()){receipts.delete(latest.key);reasons[latest.module]='Speicher voll – Aktion gesperrt';return false;}
    if(latest.purchase){const b=ledger(fresh);if(!b)return false;const p=latest.purchase;if(b.key!==p.key||b.data.inflight||fresh.own.coinsCount<p.price)return false;b.data.spent+=p.price;b.data.counts[p.token]=(b.data.counts[p.token]||0)+1;b.data.inflight={shop:p.shop,restockId:p.restockId,id:p.id,beforeCount:p.beforeCount,coinsBefore:fresh.own.coinsCount,price:p.price};if(!write(b.key,b.data)){reasons.buy='Kaufstatus nicht speicherbar – Kauf pausiert';return false;}}
    lastActionAt=now();lastModule=latest.module;
    try{const response=latest.module==='ariesSync'
      ? await env.updateAriesTeam?.(latest.ariesPlan)
      : await env.send(latest.command);
      if(response?.ok!==true)throw new Error('Aktion nicht bestätigt');
      counts[latest.module]++;record.status='confirmed';record.until=latest.module==='favorite'?Number.MAX_SAFE_INTEGER:now()+600000;event(latest.module,'Bestätigt');reasons[latest.module]='Bestätigt; warte auf Zustandsänderung';if(latest.module==='favorite')record.after=now()+600000;if(latest.effect&&latest.module!=='favorite'){const updated=snapshot();if(updated&&latest.effect(updated))record.until=Math.max(record.after,now()+500);}}
    catch(error){
      // SellPet has no guaranteed command acknowledgement. The game's own
      // inventory is the only confirmation; never turn a timeout into a retry.
      const after=snapshot();
      const observedPetGone=latest.module==='petSell'&&after&&
        after.actor===fresh.actor&&after.generation===fresh.generation&&latest.effect?.(after);
      if(observedPetGone){
        counts.petSell++;record.status='confirmed';record.until=now()+600000;
        reasons.petSell='Pet im Inventar nicht mehr vorhanden – als verkauft beobachtet';
        event('petSell','Pet nicht mehr im Inventar');
      }else{
        record.status='uncertain';
        record.until=latest.module==='favorite'?Number.MAX_SAFE_INTEGER:now()+600000;
        reasons[latest.module]=latest.module==='favorite'?'Unklar – Favoriten-Toggle wird nicht wiederholt':'Nicht bestätigt – 10 Minuten kein Wiederholen';
        event(latest.module,'Abgelehnt / unbekannt; geschützt pausiert');
      }
    }
    persistReceipts();return true;
  }
  async function step(){if(!config.enabled||!env.running()||busy)return false;void loadCatalogs();if(now()-lastActionAt<config.actionIntervalMs)return false;const s=snapshot();if(!s)return false;const candidate=selectedJob(s);if(!candidate)return false;busy=true;const generation=runGeneration;try{if(candidate.module==='buy'){if(typeof env.withPurchaseLock!=='function'){reasons.buy='Browser-Kaufsperre nicht verfügbar';return false;}return await env.withPurchaseLock(s.actor,async()=>generation===runGeneration&&env.running()?execute(candidate,s):false);}return await execute(candidate,s);}finally{busy=false;}}
  function preview(){const s=snapshot();return s?candidates(s).map(j=>({module:j.module,action:j.command.type})):[];}
  function status(){const s=snapshot(),b=s?ledger(s):null;return {enabled:config.enabled,busy,catalogs:catalogMessage,weather:s?weather(s):'unbekannt',spentToday:b?.data.spent??0,catalogSource:env.catalogDiagnostics?.()||null,queue:preview(),modules:Object.entries(names).map(([id,label])=>({id,label,on:config[id],confirmed:counts[id],status:reasons[id]||'Warte'})),sell:reasons.sell||'',quests:arr(s?.own.dailyQuests?.quests).map(q=>({kind:q.objective?.kind||'unknown',progress:q.progress,target:q.objective?.target,claimed:num(q.claimedAt)})),events:events.slice(-10)};}
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
  return {menuChoices,configure,getConfig:()=>structuredClone(config),step,preview,status,loadCatalogs,harvestAllowed,saleAllowed,produceValue,petGoals:petAdvisor.goals,analyzePets:goal=>petAdvisor.analyze(snapshot(),catalogs,goal),ariesTeams:()=>petPolicy.ariesTeams(env.ariesService?.()||null),petSellProposal:()=>{const s=snapshot();return s?petPolicy.eligibleSell(s,petAdvisor.analyze(s,catalogs,'sellPets'),config,env.ariesService?.()||null,env.protected):{pet:null,why:'Spieldaten fehlen'};},resetCounters(){for(const k of Object.keys(counts))counts[k]=0;events.length=0;},stop(){runGeneration++;},catalogs:()=>catalogs,choices(){const s=snapshot();return {seeds:Object.keys(catalogs.plants||{}),eggs:Object.keys(catalogs.eggs||{}),tools:Object.keys(catalogs.tools||{}),decor:Object.keys(catalogs.decor||{}),pets:arr(s?.own.petTeams).map(t=>({id:t.id,name:t.name||'Team'}))};}};
}


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
  function explain(text,where){const n=document.createElement('p');n.className='mg-choice-note';n.textContent=text;where.appendChild(n);return n;}
  check('Automationszentrale aktiv','enabled');
  button('Sicherer Autopilot',()=>save({enabled:true,favorite:true,claims:true,journal:true,feed:true,hatch:true,storage:true}));
  button('Neue Module aus',()=>save({enabled:false}));
  const preset=document.createElement('small');preset.textContent='Preset: Wertschutz, Journal, Füttern, fertige Eier, Quest-Belohnungen und bestehende Lagerstapel. Kein Einkauf, Nachpflanzen oder Werkzeugverbrauch.';root.appendChild(preset);
  const farming=section('Pflanzen, Eier & Gießen');
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
  const fieldInfo=explain('Eierfelder in „Felder“ blau markieren. Grau wird ignoriert.',farming);
  check('Pflanzen auf grünen Feldern gießen','water',farming);number('Nur gießen ab Restzeit (Sek.)','waterMinSeconds',30,86400,farming);number('Gießkannen übrig lassen','toolReserve',0,99,farming);
  dependent.push(['seedSpecies','plant'],['eggPlaceMode','eggs'],['eggHatchMode','hatch'],['waterMinSeconds','water'],['toolReserve','water']);
  const protection=section('Erntefilter & Wertschutz');
  check('Wertvolle Produkte favorisieren','favorite',protection);number('Favorisieren ab Basiswert (0 = aus)','keepValue',0,1e12,protection);
  list('Diese Pflanzenarten behalten','keepSpecies',protection);number('Ernten ab Größe (0 = alle)','minHarvestSize',0,100,protection);
  number('Ernten ab Basiswert (0 = alle)','minHarvestValue',0,1e12,protection);list('Nur diese Mutationen ernten','wantedMutations',protection);list('Bei diesem Wetter Ernte pausieren','pauseWeather',protection);
  const hints=document.createElement('small');hints.textContent='Native Sperren und der vorhandene Mutations-/Max-Größen-Schutz haben immer Vorrang. Favoriten werden nie automatisch entsperrt. Basiswert ist ohne Verkaufs-/Freundesbonus.';protection.appendChild(hints);
  const pets=section('Pets, Futter & Lager');check('Aktive Pets automatisch füttern','feed',pets);number('Füttern unter Hungerfüllstand (%)','hungerPercent',1,90,pets);number('Maximaler Futter-Basiswert','foodMaxValue',1,1e9,pets);

  check('Futtertrog nachfüllen','trough',pets);number('Ziel: Futter im Trog','troughItems',0,50,pets);check('Bestehende Lagerstapel auffüllen','storage',pets);
  // Smart Pet Advisor: observation only. Never sell, move, swap or unlock pets
  // through this panel until actual server commands and protection are verified.
  const advisorPanel=document.createElement('details');advisorPanel.className='mg-pet-advisor';advisorPanel.open=true;
  const advisorHeading=document.createElement('summary');advisorHeading.textContent='Pet-Manager · Max-Level & Boosts';
  advisorPanel.appendChild(advisorHeading);
  const advisorGoal=document.createElement('select');advisorGoal.style.cssText=style;
  advisorGoal.setAttribute('aria-label','Welches Pet-Team optimieren?');
  for(const goal of engine.petGoals||[]){
    const option=document.createElement('option');option.value=goal.id;option.textContent=goal.name;advisorGoal.appendChild(option);
  }
  advisorGoal.value='afk';
  row('Welches Pet-Team optimieren?',advisorGoal,advisorPanel).classList.add('mg-wide-choice');
  const advisorText=document.createElement('div');advisorText.className='mg-pet-advisor-results';
  advisorPanel.appendChild(advisorText);
  explain('Der Bot entscheidet nach Max-Level-Potenzial und tatsächlich vorhandenen Boosts über alle Spezialteams – nicht nach Tierart oder Seltenheit. Noch keine automatischen Pet-Verkäufe.',advisorPanel);
  pets.appendChild(advisorPanel);
  let lastPetSignature='';
  function refreshPetAdvisor(){
    // No repeated DOM redraws in other tabs: selection/search focus remains.
    if(pets.closest('.mg-menu-view')?.hidden)return;
    const report=engine.analyzePets?.(advisorGoal.value);
    if(!report)return;
    const signature=JSON.stringify(report);
    if(signature===lastPetSignature)return;
    lastPetSignature=signature;advisorText.replaceChildren();
    const make=(tag,text)=>{
      const el=document.createElement(tag);el.textContent=text;return el;
    };
    advisorText.appendChild(make('p',
      'Pets: '+report.count+' · Aktiv: '+report.locations.active+
      ' · Inventar: '+report.locations.inventory+' · Pet Hutch: '+report.locations.hutch+
      ' · Wetter: '+report.weather));
    advisorText.appendChild(make('h4','Behalten oder aussortieren?'));
    if(!report.count){
      advisorText.appendChild(make('p','Noch keine eigenen Pet-Daten. Warte auf den Spielzustand.'));
      return;
    }
    advisorText.appendChild(make('p',
      'Bewertbar: '+report.coverage+'/'+report.count+
      ' · Behalten: '+report.retained+
      ' · Prüfen: '+report.pendingReview+
      ' · Fehlende XP/Boost-Daten werden nicht geraten.'));
    const decisions=document.createElement('details');
    decisions.className='mg-pet-advisor-decisions';decisions.open=true;
    decisions.appendChild(make('summary',
      'Max-Level-Entscheidungen für '+report.profiles.length+' Pets'));
    // Unklare oder gegenüber besseren Boosts schwächere Pets zuerst zeigen.
    const ordered=[...report.profiles].sort((a,b)=>
      (a.decision==='review'?0:1)-(b.decision==='review'?0:1)||
      a.name.localeCompare(b.name,'de'));
    for(const pet of ordered){
      const item=make('article','');item.className='mg-pet-decision';
      item.dataset.petDecision=pet.decision;
      const verdict=pet.decision==='keep'?'Behalten':'Prüfen';
      item.appendChild(make('strong',
        verdict+' · '+pet.name+' · '+pet.location));
      item.appendChild(make('div',pet.metrics
        ? 'Aktuell STR '+pet.metrics.current+' · Auf Max-Level STR '+pet.metrics.max+
          ' (Level '+pet.metrics.progress+'/30)'
        : 'Max-Level unbekannt'));
      item.appendChild(make('div',
        'Boosts: '+(pet.abilityNames.join(', ')||'unbekannt')));
      item.appendChild(make('small',pet.decisionReason||'Noch keine Entscheidung'));
      if(pet.dominatedBy)
        item.appendChild(make('small',
          'Aussortier-Vorschlag, kein Auto-Sell. '+(pet.protection.length?
          'Verkaufsschutz: '+pet.protection.join(', '):'Manuelle Prüfung erforderlich.')));
      decisions.appendChild(item);
    }
    advisorText.appendChild(decisions);
    const recommended=new Set(report.recommendations);
    advisorText.appendChild(make('h4','Empfohlenes Team für '+report.goalName));
    const chosen=report.profiles.filter(p=>recommended.has(p.id))
      .sort((a,b)=>b.now.score-a.now.score);
    if(!chosen.length)advisorText.appendChild(make('p',
      'Noch keine belastbare Empfehlung. Pet-Katalog und echte individuelle Fähigkeiten abwarten.'));
    for(const pet of chosen){
      const card=make('article','');card.className='mg-pet-advisor-card';
      card.appendChild(make('strong',pet.name+' · '+pet.location));
      card.appendChild(make('div',pet.metrics
        ? 'STR '+pet.metrics.current+'/'+pet.metrics.max+' · Stufe '+pet.metrics.progress+'/30'
        : 'Stärke unklar – Katalog- oder XP-Wert fehlt'));
      card.appendChild(make('div',
        'Relative Bewertung: jetzt '+pet.now.score+
        ' · bei Max STR '+pet.future.score));
      card.appendChild(make('small',pet.now.highlights.map(b=>
        b.name+(b.activeInWeather?'':' (nur bei passendem Wetter)')).join(', ') ||
        'Keine passende Fähigkeit erkannt'));
      advisorText.appendChild(card);
    }
    const inventory=document.createElement('details');
    inventory.className='mg-pet-advisor-list';inventory.appendChild(make('summary','Alle Pets vergleichen ('+report.profiles.length+')'));
    for(const pet of report.profiles){
      const p=make('p',pet.name+' · '+pet.location+' · '+
        (pet.metrics?'STR '+pet.metrics.current+'/'+pet.metrics.max:'STR ?')+
        ' · '+(pet.abilityNames.join(', ')||'Fähigkeiten unbekannt')+
        (pet.protection.length?' · Geschützt: '+pet.protection.join(', '):''));
      inventory.appendChild(p);
    }
    advisorText.appendChild(inventory);
    advisorText.appendChild(make('p',
      'Schwächere, durch bessere Max-Level-Boosts abgedeckte Pets: '+report.reviews.length+
      ' · Keine automatische Verkaufsfreigabe.'));
  }
  advisorGoal.addEventListener('change',()=>{lastPetSignature='';refreshPetAdvisor();});

  // Opt-in Pet Auto-Sell. Only safely dominated *inventory* pets with a
  // specifically allowed source egg are eligible. Never bulk-sell by rarity.
  const petSellUI=document.createElement('details');petSellUI.className='mg-pet-autosell';petSellUI.open=true;
  const petSellHead=document.createElement('summary');petSellHead.textContent='Pet Auto-Sell · sichere Duplikate';
  petSellUI.appendChild(petSellHead);
  check('Pet Auto-Sell einschalten','petSell',petSellUI);
  const petSellEggFilter=pickers.multi(petSellUI,
    'Nur Pets aus diesen Eiern verkaufen','petSellEggs','petSellOriginChoices');
  number('Maximal Pets pro Sitzung','petSellPerSession',1,20,petSellUI);
  const petSellPreview=explain('Wird geladen …',petSellUI);
  explain('Nur nachweisbar schwächere Pets mit abgedeckten Max-Level-Boosts. Aktive, gesperrte, favorisierte, mutierte, in Teams/Pet Hutch benutzte Pets und unbekannte Ei-Herkunft bleiben geschützt. Leere Eier-Auswahl = kein Verkauf. Keine automatischen Pet-Verkäufe ohne Aktivierung.',petSellUI);
  pets.appendChild(petSellUI);

  // Aries exposes saved teams through QWS_PetsService, but NOT the Team
  // Builder's unsaved suggestions. Users must explicitly opt in a saved
  // Aries team + goal. Our own local advisor supplies max-STR candidates.
  const ariesUI=document.createElement('details');ariesUI.className='mg-aries-team-sync';
  ariesUI.open=true;ariesUI.appendChild((()=>{const n=document.createElement('summary');n.textContent='Aries-Teams automatisch aktualisieren';return n;})());
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
  const ariesInfo=explain('Warte auf Arie’s Mod …',ariesUI);
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
    const proposed=engine.petSellProposal?.();
    petSellPreview.textContent=c.petSell
      ? (proposed?.pet
        ? 'Nächster sicherer Kandidat: '+(proposed.pet.name||proposed.pet.petSpecies)+
          ' · Herkunft: '+proposed.pet.sourceEggId+
          ' · '+proposed.why
        : 'Verkauf wartet: '+(proposed?.why||'Spieldaten fehlen'))
      : 'Pet Auto-Sell ist AUS. Nur die Vorschau ist aktiv.';
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
        const desc=document.createElement('p');desc.textContent=`${choices.shops.find(x=>x.id===r.shop)?.name||pickers.human(r.shop)} · bis ${r.maxPrice.toLocaleString('de-DE')} Coins · ${r.perRestock} pro Restock · Ziel ${r.maxOwned}`;card.appendChild(desc);
        button('Bearbeiten',()=>editRule(r),card);button('Entfernen',()=>save({buyRules:config().buyRules.filter((_,j)=>i!==j)}),card);buyList.appendChild(card);
      });
      c.teamRules.forEach((r,i)=>button((choices.weather.find(w=>w.id===r.weather)?.name||pickers.human(r.weather))+' → '+(choices.pets.find(t=>t.id===r.teamId)?.name||'Gespeichertes Team')+' · Entfernen',()=>save({teamRules:config().teamRules.filter((_,j)=>i!==j)}),teamList));
    }
  }
  buyType.addEventListener('change',()=>{buyId.value='';buyId.dataset.options='';shopId.value='';refreshBuy(engine.menuChoices());});
  refresh();return {refresh,root,alert,views:{automation:root,farming,protection,pets,journal:quests,teams,shop,diagnostics}};

}


  let automation = null;
/** Presentation only: reuses live controls; never sends a command or enables a module. */
function mountCompactMenu(ui) {
  'use strict';
  const { document: doc, panel, body, header, headline, toggle, grip, controls,
    startButton, stopButton, resetButton, settings, toggles, protectionToggles,
    tools, fields, updateStatus, updateControls, copyButton, diagnosticStatus,
    automationUI: auto, version, storage } = ui;
  const pageKey = 'magic_garden_ui_section_v15';
  const icons = {
    overview: '<path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
    fields: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    farming: '<path d="M12 21v-9M12 16C5 16 3 12 3 6c6 0 9 3 9 8M12 12c0-6 3-9 9-9 0 6-3 9-9 9"/>',
    pets: '<ellipse cx="6" cy="7" rx="2" ry="3"/><ellipse cx="18" cy="7" rx="2" ry="3"/><ellipse cx="3" cy="13" rx="1.5" ry="2"/><ellipse cx="21" cy="13" rx="1.5" ry="2"/><path d="M7 15c2-6 8-6 10 0 5 7-1 7-5 5-4 2-10 2-5-5Z"/>',
    shop: '<path d="M5 8h14l2 13H3L5 8ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    protection: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    journal: '<path d="M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1v15M6 8h2M16 8h2"/>',
    teams: '<circle cx="9" cy="9" r="4"/><path d="M9 1v2M1 9h2M3 3l2 2M15 3l-2 2M18 6v2M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0-1 6Z"/>',
    automation: '<path d="M12 3v3M10 3h4"/><rect x="3" y="6" width="18" height="14" rx="4"/><path d="M7 12h1M16 12h1M8 16h8"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><rect x="7" y="4" width="3" height="4" rx="1"/><rect x="15" y="10" width="3" height="4" rx="1"/><rect x="8" y="16" width="3" height="4" rx="1"/>',
    updates: '<path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M21 21v-5h-5"/>',
    diagnostics: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    grip: '<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>',
  };
  function svg(name) {
    const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '1.8');
    el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true'); el.setAttribute('focusable', 'false');
    // Fixed, local SVG paths only. No data from the game enters innerHTML.
    el.innerHTML = icons[name] || icons.overview; return el;
  }
  function node(tag, cls, text) {
    const el = doc.createElement(tag); if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text; return el;
  }
  function text(el, value) { const next = String(value ?? ''); if (el.textContent !== next) el.textContent = next; }
  const style = node('style'); style.id = 'mg-compact-menu-style';
  style.textContent = `
#mg-autofarm-v13.mg-compact {--mg-bg:#29251f;--mg-surface:#363129;--mg-raised:#403930;--mg-line:#51483c;--mg-text:#f3ecdc;--mg-muted:#c1b49f;--mg-accent:#a6c494;--mg-focus:#e4c28a;display:flex;flex-direction:column;width:320px!important;max-width:calc(100vw - 16px)!important;overflow:hidden!important;padding:0!important;background:var(--mg-bg)!important;color:var(--mg-text)!important;border:2px solid var(--mg-line)!important;border-radius:20px!important;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif!important;box-shadow:0 12px 36px #0005!important;color-scheme:dark;isolation:isolate}
#mg-autofarm-v13.mg-compact *,#mg-autofarm-v13.mg-compact *::before,#mg-autofarm-v13.mg-compact *::after {box-sizing:border-box}
#mg-autofarm-v13.mg-compact [hidden] {display:none!important}
#mg-autofarm-v13.mg-compact svg {width:22px;height:22px;display:block;flex:none;pointer-events:none}
#mg-autofarm-v13 .mg-menu-header {position:relative;z-index:3;flex:0 0 auto;min-height:52px;padding:10px 12px!important;background:var(--mg-bg);gap:8px!important;border-bottom:1px solid var(--mg-line)}
#mg-autofarm-v13.mg-collapsed .mg-menu-header {border-bottom:0}
#mg-autofarm-v13 .mg-menu-grip {width:12px!important;margin:0!important;color:var(--mg-muted)!important;flex:none}
#mg-autofarm-v13 .mg-menu-grip svg {width:12px;height:20px}
#mg-autofarm-v13 .mg-menu-title {font:700 14px/1.2 system-ui,sans-serif!important;min-width:0;flex:1;display:flex;align-items:center;gap:7px;white-space:nowrap}
#mg-autofarm-v13 .mg-dot {width:7px;height:7px;border-radius:50%;background:#a79c8c;display:inline-block;flex:none}
#mg-autofarm-v13[data-running="true"] .mg-dot {background:#a4ca91;box-shadow:0 0 0 3px #a4ca9110}
#mg-autofarm-v13.mg-compact a.mg-version {font:600 10px/1.3 ui-monospace,monospace!important;color:var(--mg-accent)!important;padding:4px 7px!important;border-radius:10px!important;background:#354032!important;border:1px solid transparent!important;flex:none;white-space:nowrap;text-decoration:none!important;box-shadow:none!important}
#mg-autofarm-v13.mg-compact a.mg-version[data-update="available"] {color:#ffe5e5!important;background:#922d30!important;border-color:#e7666a!important;box-shadow:0 0 0 2px #e7666a23!important;animation:mg-update-flash 2.2s ease-in-out infinite}
@keyframes mg-update-flash {50%{border-color:#ffd0d0;box-shadow:0 0 0 4px #e7666a16}}
@media (prefers-reduced-motion:reduce) {#mg-autofarm-v13.mg-compact a.mg-version {animation:none!important}}
#mg-autofarm-v13.mg-compact button,#mg-autofarm-v13.mg-compact a {font:600 12px/1.3 system-ui,sans-serif!important;color:var(--mg-text)!important;background:var(--mg-surface)!important;border:1px solid var(--mg-line)!important;border-radius:10px!important;min-width:0;padding:8px!important;cursor:pointer;box-shadow:0 2px 0 #19161155;transition:background .12s ease,border-color .12s ease;text-decoration:none}
#mg-autofarm-v13.mg-compact button:hover,#mg-autofarm-v13.mg-compact a:hover {background:var(--mg-raised)!important;border-color:#8a795f!important}
#mg-autofarm-v13.mg-compact button:disabled {cursor:default;opacity:.45}
#mg-autofarm-v13.mg-compact :is(button,a,input,select,summary):focus-visible {outline:2px solid var(--mg-focus)!important;outline-offset:2px}
#mg-autofarm-v13.mg-compact .mg-menu-toggle {flex:none!important;width:28px;height:28px;padding:4px!important;border:0!important;box-shadow:none;margin:0!important}
#mg-autofarm-v13 .mg-menu-toggle svg {width:18px;height:18px;transform:rotate(180deg)}
#mg-autofarm-v13.mg-collapsed .mg-menu-toggle svg {transform:none}
#mg-autofarm-v13 .mg-menu-body {display:flex;flex-direction:column;flex:0 1 auto;min-height:0;overflow:hidden}
#mg-autofarm-v13 .mg-menu-controls {flex:0 0 auto;display:flex;align-items:center;gap:7px!important;padding:10px 12px 8px;margin:0!important}
#mg-autofarm-v13 .mg-menu-controls button {display:flex;justify-content:center;align-items:center;gap:5px;padding:7px!important}
#mg-autofarm-v13 .mg-menu-controls svg {width:14px;height:14px}
#mg-autofarm-v13 .mg-menu-controls .mg-start {color:#d9ecd1!important;background:#3b4b34!important;border-color:#536848!important}
#mg-autofarm-v13 .mg-hotkey {flex:none;color:var(--mg-muted);font:10px ui-monospace,monospace;padding-left:3px}
#mg-autofarm-v13 .mg-menu-location {display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:0 12px 8px}
#mg-autofarm-v13.mg-compact .mg-back {flex:none;width:28px;height:28px;padding:4px!important;background:transparent!important;box-shadow:none}
#mg-autofarm-v13 .mg-back svg {width:18px;height:18px}
#mg-autofarm-v13 .mg-location-title {font-size:13px;font-weight:650;margin:0;outline:none}
#mg-autofarm-v13 .mg-menu-scroll {overflow-y:auto;overflow-x:hidden;min-height:0;flex:0 1 auto;overscroll-behavior-y:contain;padding:2px 12px 14px;scrollbar-width:thin;scrollbar-color:#746651 transparent;scroll-padding:10px}
#mg-autofarm-v13 .mg-menu-scroll::-webkit-scrollbar {width:5px}
#mg-autofarm-v13 .mg-menu-scroll::-webkit-scrollbar-thumb {background:#746651;border-radius:6px}
#mg-autofarm-v13 .mg-home-metrics {display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:8px;margin:1px 0 12px}
#mg-autofarm-v13 .mg-metric-label {font-size:10px;color:var(--mg-muted);display:block;margin-bottom:2px}
#mg-autofarm-v13 .mg-metric-value {font:650 13px/1.3 ui-monospace,monospace;overflow-wrap:anywhere}
#mg-autofarm-v13 .mg-menu-nav {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
#mg-autofarm-v13.mg-compact .mg-shortcut {min-height:65px;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border-radius:15px!important;border-color:transparent!important;padding:9px 3px!important;color:#e1d1b4!important;box-shadow:0 3px 0 #504638;position:relative}
#mg-autofarm-v13 .mg-shortcut span {font-size:10px;font-weight:550;line-height:1.2;letter-spacing:.01em}
#mg-autofarm-v13 .mg-shortcut[data-new="true"]::after {content:"";position:absolute;right:10px;top:8px;width:6px;height:6px;border-radius:50%;background:var(--mg-accent)}
#mg-autofarm-v13 .mg-home-state {color:var(--mg-muted);font-size:10px;margin:12px 0 0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
#mg-autofarm-v13 .mg-menu-view {min-width:0}
#mg-autofarm-v13.mg-compact .mg-menu-view > div,#mg-autofarm-v13.mg-compact .mg-menu-view > details {border:0!important;padding:0!important;margin-top:0!important}
#mg-autofarm-v13 .mg-auto-section > summary,#mg-autofarm-v13 .mg-auto-intro > h3 {display:none}
#mg-autofarm-v13.mg-compact label {font-size:12px!important;line-height:1.5!important;gap:10px!important;margin:11px 0!important;white-space:normal}
#mg-autofarm-v13.mg-compact label > span {min-width:0;flex:1;overflow-wrap:break-word;color:var(--mg-text)}
#mg-autofarm-v13.mg-compact input:not([type="checkbox"]),#mg-autofarm-v13.mg-compact select {width:112px!important;max-width:44%!important;min-width:0;flex:0 0 auto;min-height:31px;border:1px solid #695c49!important;border-radius:8px!important;padding:5px 7px!important;background:#211e19!important;color:var(--mg-text)!important;font:12px/1.3 system-ui,sans-serif!important}
#mg-autofarm-v13.mg-compact input[type="checkbox"] {accent-color:#a6c494;width:15px;height:15px;flex:none;cursor:pointer}
#mg-autofarm-v13.mg-compact p,#mg-autofarm-v13.mg-compact small {font:11px/1.6 system-ui,sans-serif!important;color:var(--mg-muted)!important;overflow-wrap:anywhere}
#mg-autofarm-v13.mg-compact small {display:block;margin:10px 0}
#mg-autofarm-v13.mg-compact pre {font:11px/1.6 ui-monospace,monospace!important;color:var(--mg-muted);overflow-wrap:anywhere;white-space:pre-wrap}
#mg-autofarm-v13 .mg-feedback {margin:0!important;padding:0 12px 7px;flex:none;font-size:10px!important;color:var(--mg-accent)!important;max-height:54px;overflow:auto}
#mg-autofarm-v13 .mg-feedback:empty {display:none}
#mg-autofarm-v13 .mg-stat-row {display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #51483c77;padding:8px 0;font-size:12px}
#mg-autofarm-v13 .mg-stat-row span {color:var(--mg-muted)}
#mg-autofarm-v13 .mg-stat-row strong {font-weight:550;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;max-width:65%}
#mg-autofarm-v13.mg-compact [data-mg-field] {padding:0!important;aspect-ratio:1;border-radius:5px!important;font:9px system-ui,sans-serif!important;background:#332e27!important;color:#cebea6!important;box-shadow:none;touch-action:none}
#mg-autofarm-v13.mg-compact [data-mg-field][aria-pressed="true"] {background:#506046!important;color:#edf4e7!important;border-color:#819271!important}
#mg-autofarm-v13.mg-compact [data-mg-field]:hover {border-color:#b5ab88!important}
#mg-autofarm-v13 .mg-version-note {color:var(--mg-muted);font-size:11px;margin:8px 0}
#mg-autofarm-v13 #mg13-status {font-size:12px;margin:4px 0 12px!important}
#mg-autofarm-v13.mg-compact #mg15-automation {border:0!important;padding:0!important;margin:0!important}
@media (max-width:360px) {#mg-autofarm-v13 .mg-menu-nav {gap:7px} #mg-autofarm-v13 .mg-menu-title {font-size:12px!important} #mg-autofarm-v13 .mg-version {font-size:9px} }
@media (prefers-reduced-motion:reduce) {#mg-autofarm-v13.mg-compact * {transition:none!important}}
`;
  doc.head.appendChild(style);
  panel.classList.add('mg-compact'); panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Magic Garden AutoFarm');
  header.classList.add('mg-menu-header'); headline.classList.add('mg-menu-title');
  grip.classList.add('mg-menu-grip'); grip.replaceChildren(svg('grip'));
  const dot = node('span', 'mg-dot'); const label = node('span', '', 'AutoFarm');
  headline.replaceChildren(dot, label);
  // Clickable even when the update service is unreachable: Tampermonkey can
  // still install from the official repo via its normal .user.js handler.
  const badge = node('a', 'mg-version', 'v' + version);
  badge.href = 'https://github.com/maik26-hub/Magic-Garden-Tools/raw/main/MagicGardenAutoFarm.user.js';
  badge.target = '_blank'; badge.rel = 'noopener noreferrer';
  badge.dataset.update = 'checking';
  badge.setAttribute('aria-label', 'AutoFarm v' + version + ' – Update-Installation öffnen');
  badge.title = 'Version v' + version + ' · Klicken zum Aktualisieren';
  header.insertBefore(badge, toggle);
  toggle.classList.add('mg-menu-toggle'); toggle.replaceChildren(svg('chevron'));
  toggle.setAttribute('aria-controls', 'mg-menu-body');
  body.id = 'mg-menu-body'; body.classList.add('mg-menu-body');
  controls.classList.add('mg-menu-controls');
  startButton.classList.add('mg-start'); stopButton.classList.add('mg-stop');
  startButton.replaceChildren(svg('play'), doc.createTextNode('Start'));
  stopButton.replaceChildren(svg('stop'), doc.createTextNode('Stop'));
  startButton.setAttribute('aria-label', 'AutoFarm starten'); stopButton.setAttribute('aria-label', 'AutoFarm stoppen');
  controls.appendChild(node('span', 'mg-hotkey', 'F8'));
  const breadcrumb = node('div', 'mg-menu-location');
  const back = node('button', 'mg-back'); back.type = 'button'; back.appendChild(svg('back'));
  back.title = 'Zur Übersicht'; back.setAttribute('aria-label', 'Zur Übersicht');
  const pageTitle = node('h2', 'mg-location-title', ''); pageTitle.tabIndex = -1;
  breadcrumb.append(back, pageTitle);
  const scroll = node('div', 'mg-menu-scroll'); scroll.id = 'mg-menu-scroll';
  const home = node('section', 'mg-menu-view'); home.dataset.view = 'home'; home.setAttribute('aria-label', 'Startübersicht');
  const metricStrip = node('div', 'mg-home-metrics'); const metricValues = {};
  for (const [key, title] of [['harvested', 'Geerntet'], ['coins', 'Coins'], ['runtime', 'Laufzeit']]) {
    const card = node('div'); const val = node('strong', 'mg-metric-value', '0');
    card.append(node('span', 'mg-metric-label', title), val); metricValues[key] = val; metricStrip.appendChild(card);
  }
  const nav = node('nav', 'mg-menu-nav'); nav.setAttribute('aria-label', 'AutoFarm Bereiche');
  const homeState = node('p', 'mg-home-state', 'Warte auf Spiel');
  home.append(metricStrip, nav, homeState);
  const overview = node('div');
  const statDefinitions = [['runtime', 'Laufzeit'], ['harvested', 'Geerntet'], ['coins', 'Verdiente Coins'], ['sold', 'Verkäufe'],
    ['fields', 'Gewählte Felder'], ['produce', 'Verkaufbare Items'], ['delay', 'Erntepause'], ['errors', 'Fehler'], ['rejected', 'Ablehnungen'], ['protected', 'Schutz-Skips']];
  const statValues = {};
  for (const [key, title] of statDefinitions) {
    const row = node('div', 'mg-stat-row'); const val = node('strong', '', '0');
    row.append(node('span', '', title), val); statValues[key] = val; overview.appendChild(row);
  }
  const legacyStatus = panel.querySelector('#mg13-status'); const legacyStats = panel.querySelector('#mg13-stats');
  if (legacyStatus) overview.prepend(legacyStatus);
  resetButton.textContent = 'Session zurücksetzen'; resetButton.style.marginTop = '12px'; overview.appendChild(resetButton);
  const diagnostics = auto.views.diagnostics; if (legacyStats) {
    const details = node('details'); details.append(node('summary', '', 'Verbindung & vollständiger Status'), legacyStats); diagnostics.appendChild(details);
  }
  diagnostics.append(copyButton, diagnosticStatus);
  // All original controls are MOVED, not copied, so their handlers and focus state survive.
  auto.views.protection.prepend(protectionToggles);
  const settingsView = node('div'); settingsView.append(settings, toggles);
  const descriptors = [
    ['overview', 'Übersicht', overview], ['fields', 'Felder', fields], ['farming', 'Pflanzen', auto.views.farming],
    ['pets', 'Pets & Futter', auto.views.pets], ['shop', 'Einkauf', auto.views.shop], ['protection', 'Schutz', auto.views.protection],
    ['journal', 'Journal', auto.views.journal], ['teams', 'Wetter', auto.views.teams], ['automation', 'Autopilot', auto.views.automation],
    ['settings', 'Einstellungen', settingsView], ['diagnostics', 'Diagnose', diagnostics],
  ];
  const views = new Map([['home', home]]); const shortcuts = new Map();
  scroll.appendChild(home);
  for (const [key, title, content] of descriptors) {
    const view = node('section', 'mg-menu-view'); view.dataset.view = key; view.id = 'mg-view-' + key;
    view.setAttribute('aria-label', title); view.hidden = true;
    if (content.tagName === 'DETAILS') { content.open = true; content.classList.add('mg-auto-section'); }
    view.appendChild(content); scroll.appendChild(view); views.set(key, view);
    const button = node('button', 'mg-shortcut'); button.type = 'button'; button.dataset.section = key;
    button.title = title; button.setAttribute('aria-label', title); button.setAttribute('aria-controls', view.id);
    button.append(svg(key), node('span', '', title));
    button.addEventListener('click', () => show(key, true)); nav.appendChild(button); shortcuts.set(key, button);
  }
  // Replace the old single long sheet by an anchored title, anchored actions, and one scroller.
  // The title is deliberately NOT a descendant of the scrolling container.
  body.replaceChildren(controls, breadcrumb, scroll, auto.alert);
  auto.alert.className = 'mg-feedback'; auto.alert.setAttribute('role', 'status'); auto.alert.setAttribute('aria-live', 'polite');
  tools.remove(); // Empty legacy wrapper: update and diagnostic controls are already relocated.
  let current = 'home'; const positions = new Map();
  function show(key, moveFocus = false) {
    if (!views.has(key)) key = 'home';
    const previous = current; positions.set(current, scroll.scrollTop); current = key;
    for (const [name, view] of views) view.hidden = name !== key;
    breadcrumb.hidden = key === 'home'; text(pageTitle, descriptors.find(d => d[0] === key)?.[1] || 'Übersicht');
    scroll.scrollTop = positions.get(key) || 0;
    try { storage.setItem(pageKey, key); } catch { /* UI still works without storage. */ }
    if (moveFocus) {
      if (key === 'home') shortcuts.get(previous)?.focus({preventScroll: true});
      else back.focus({preventScroll: true});
    }
  }
  back.addEventListener('click', () => show('home', true));
  body.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target.closest('input,select,textarea,[contenteditable="true"]') || current === 'home') return;
    event.stopPropagation(); show('home', true);
  });
  nav.addEventListener('keydown', event => {
    const deltas = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3};
    if (!(event.key in deltas)) return;
    const items = [...shortcuts.values()]; const index = items.indexOf(doc.activeElement); if (index < 0) return;
    event.preventDefault(); items[(index + deltas[event.key] + items.length) % items.length].focus();
  });
  function setCollapsed(value) {
    panel.classList.toggle('mg-collapsed', value); toggle.setAttribute('aria-expanded', String(!value));
    const title = value ? 'Menü ausklappen' : 'Menü einklappen'; toggle.setAttribute('aria-label', title); toggle.title = title;
  }
  function refresh(data) {
    panel.dataset.running = String(data.running);
    const stateLabel = data.running ? 'Aktiv' : data.busy ? 'Stoppt …' : 'Gestoppt';
    dot.title = stateLabel; headline.setAttribute('aria-label', 'AutoFarm – ' + stateLabel); headline.title = stateLabel;
    text(label, data.running ? 'AutoFarm · Aktiv' : data.busy ? 'AutoFarm · Stoppt' : 'AutoFarm');
    for (const [key, el] of Object.entries(metricValues)) text(el, key === 'coins' ? data.coinsCompact : data[key]);
    metricValues.coins.title = data.coins;
    for (const [key, el] of Object.entries(statValues)) text(el, data[key]);
    text(homeState, data.connection); startButton.disabled = data.running || data.busy; stopButton.disabled = !data.running;
    badge.dataset.update = data.update ? 'available' : 'current';
    const description = data.update
      ? 'Update verfügbar: v' + data.update + ' – Klicken zum Installieren'
      : 'Installiert: v' + version + ' – Klicken zum Prüfen/Installieren in Tampermonkey';
    badge.title = description; badge.setAttribute('aria-label', description);
  }
  let saved = 'home'; try { saved = storage.getItem(pageKey) || 'home'; } catch { /* use home */ }
  show(saved); setCollapsed(ui.collapsed);
  return {refresh, setCollapsed, show, scroll, header, views};
}


  let automationUI = null;
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


  let compactMenu = null;
  let fieldGrid = null;

  // V14: offizielle Aktualisierung der bisherigen V13-AutoFarm ueber denselben
  // Tampermonkey-Namen, Namespace und GitHub-URL (keine zweite Installation).
  // QPM, Garden Companion und Arie's Mod sind fuer diese AutoFarm nicht noetig.
  // WICHTIG: Nur selbst gematchte Spieler-Slots verwenden. Bei fehlenden Daten NICHT ernten.
  if (window.MGAutoFarmV13) return;
  if (window.MGAutoFarmV12 || window.MGAutoFarmV11) {
    console.warn("[MG V13] Bitte alte AutoFarm-Skripte deaktivieren und neu laden.");
    return;
  }

  const KEYS = {
    selection: "magic_garden_selected_tiles_v1",      // kompatibel mit V11/V12
    collapsed: "magic_garden_v11_ui_collapsed",          // kompatibel mit V11/V12
    prefs: "magic_garden_v13_preferences",
    resume: "magic_garden_v13_should_resume",           // sessionStorage: pro Tab
    timer: "magic_garden_v13_elapsed_ms",               // sessionStorage
    reloads: "magic_garden_v13_reload_history",         // sessionStorage
    lastReloadReason: "magic_garden_v14_last_reload_reason",
    panelPosition: "magic_garden_v13_panel_position"   // localStorage
  };

  const cfg = {
    scanMs: 500,
    hiddenScanMs: 1500,           // Browser darf Hintergrund-Timer weiter drosseln
    sellThreshold: 40,
    sellEveryMs: 2000,
    commandTimeoutMs: 6000,
    harvestedSlotCooldownMs: 5000,
    failedSlotCooldownMs: 60000,
    rejectedSlotCooldownMs: 10 * 60000,
    rejectionBurstThreshold: 3,
    rejectionBurstPauseMs: 30000,
    protectedSlotCooldownMs: 30 * 60000,
    antiAfkEveryMs: 50 * 1000,
    antiAfkOnlyAfterNoRealInputMs: 45 * 1000,
    // AFK-Impulse im eigenen Takt, statt vom Ernte-Loop abzuhaengen.
    afkWatchdogMs: 10 * 1000,
    offlineReloadAfterMs: 90 * 1000,
    reloadLimit: 3,
    reloadWindowMs: 15 * 60000,
    breakerAfterErrors: 8,
    breakerMs: 60 * 1000,
    adaptive: {
      initialMs: 100,
      minMs: 75,
      maxMs: 1000,
      speedUpMs: 5,
      slowDownMs: 50,
      fastResponseMs: 350,
      slowResponseMs: 900,
      successesToSpeedUp: 5
    }
  };

  function readJSON(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key));
      return value == null ? fallback : value;
    } catch { return fallback; }
  }
  function readValue(storage, key, fallback = null) {
    try { return storage.getItem(key) ?? fallback; }
    catch { return fallback; }
  }
  function storeValue(storage, key, value) {
    try { storage.setItem(key, value); }
    catch (e) { console.warn("[MG V13] Speichern fehlgeschlagen:", e.message); }
  }
  function storeJSON(storage, key, value) {
    storeValue(storage, key, JSON.stringify(value));
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const VERSION = "15.4.0";
  const UPDATE_URL = "https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js";
  const NUMBER_FIELDS = Object.freeze({
    sellThreshold: { min: 5, max: 200, step: 1 },
    sellIntervalMs: { min: 500, max: 30000, step: 500 },
    minHarvestDelayMs: { min: 50, max: 1000, step: 5 },
    maxHarvestDelayMs: { min: 100, max: 3000, step: 5 },
    stallAfterMs: { min: 30000, max: 300000, step: 1000 }
  });
  function validatedNumber(input, fallback, bounds) {
    const value = Number(input);
    if (!Number.isFinite(value)) return fallback;
    return Math.round(clamp(value, bounds.min, bounds.max) / bounds.step) * bounds.step;
  }
  const savedPrefs = readJSON(localStorage, KEYS.prefs, {});
  const prefs = {
    antiAfk: savedPrefs.antiAfk === true,
    autoReload: savedPrefs.autoReload === true,
    adaptive: savedPrefs.adaptive !== false,
    selfHealing: savedPrefs.selfHealing !== false,
    protectMutations: savedPrefs.protectMutations !== false,
    protectMaxSize: savedPrefs.protectMaxSize !== false,
    sellThreshold: validatedNumber(savedPrefs.sellThreshold, cfg.sellThreshold, NUMBER_FIELDS.sellThreshold),
    sellIntervalMs: validatedNumber(savedPrefs.sellIntervalMs, cfg.sellEveryMs, NUMBER_FIELDS.sellIntervalMs),
    minHarvestDelayMs: validatedNumber(savedPrefs.minHarvestDelayMs, cfg.adaptive.minMs, NUMBER_FIELDS.minHarvestDelayMs),
    maxHarvestDelayMs: validatedNumber(savedPrefs.maxHarvestDelayMs, cfg.adaptive.maxMs, NUMBER_FIELDS.maxHarvestDelayMs),
    stallAfterMs: validatedNumber(savedPrefs.stallAfterMs, 90000, NUMBER_FIELDS.stallAfterMs)
  };
  prefs.minHarvestDelayMs = Math.min(prefs.minHarvestDelayMs, prefs.maxHarvestDelayMs);
  const persistPrefs = () => storeJSON(localStorage, KEYS.prefs, prefs);
  function setNumberPreference(key, input) {
    const limits = NUMBER_FIELDS[key];
    if (!limits) throw new Error("Unbekannte Einstellung");
    prefs[key] = validatedNumber(input, prefs[key], limits);
    if (prefs.minHarvestDelayMs > prefs.maxHarvestDelayMs) {
      if (key === "minHarvestDelayMs") prefs.maxHarvestDelayMs = prefs.minHarvestDelayMs;
      else prefs.minHarvestDelayMs = prefs.maxHarvestDelayMs;
    }
    state.currentDelay = clamp(state.currentDelay, prefs.minHarvestDelayMs, prefs.maxHarvestDelayMs);
    persistPrefs();
    updatePanel();
    return prefs[key];
  }

  const state = {
    running: false,
    busy: false,
    harvested: 0,
    sold: 0,
    coins: 0,
    errors: 0,
    protectedSkips: 0,
    rejectedHarvests: 0,
    rejectionStreak: 0,
    lastRejection: "",
    lastError: "",
    cooldowns: new Map(),
    currentDelay: cfg.adaptive.initialMs,
    lastResponseMs: 0,
    averageResponseMs: 0,
    successStreak: 0,
    speedAdjustments: 0,
    consecutiveErrors: 0,
    breakerUntil: 0,
    connection: "Warte auf Spiel",
    connectedOnce: false,
    offlineSince: null,
    notReadySince: null,
    reloadLimitReached: false,
    lastReloadReason: readValue(sessionStorage, KEYS.lastReloadReason, "") || "",
    reconnects: 0,
    lastOnline: null,
    hidden: typeof document !== "undefined" ? document.hidden : false,
    lastRealInput: Date.now(),
    antiAfkTicks: 0,
    lastAntiAfk: null,
    antiAfkStatus: "Nicht aktiviert",
    lastActivityAt: null,
    lastLoopAt: null,
    wakeLagMs: 0,
    autoResumed: false,
    reloadRequested: false,
    lastHarvestAt: null,
    ripeSince: null,
    lastSelfHealAt: null,
    selfHealAttempts: 0,
    selfHealChecks: 0,
    sessionEpoch: 0
  };

  // ===== Laufzeit: Start/Stop; nach F5 im selben Tab fortsetzen =====
  let elapsedMs = Number(readValue(sessionStorage, KEYS.timer, "0")) || 0;
  let timerStartAt = null;
  const runtimeMs = () => elapsedMs + (timerStartAt === null ? 0 : Date.now() - timerStartAt);
  function startTimer() {
    if (timerStartAt === null) timerStartAt = Date.now();
  }
  function persistTimer() {
    storeValue(sessionStorage, KEYS.timer, String(Math.max(0, Math.round(runtimeMs()))));
  }
  function stopTimer() {
    if (timerStartAt !== null) {
      elapsedMs = runtimeMs();
      timerStartAt = null;
    }
    persistTimer();
  }
  // Timer kann im laufenden Betrieb zurueckgesetzt werden, ohne den Bot anzuhalten.
  // Ein erneuter Start/F5 setzt anschliessend bei 00:00:00 an.
  function resetTimer() {
    elapsedMs = 0;
    if (timerStartAt !== null) timerStartAt = Date.now();
    persistTimer();
    updatePanel();
    return formatTime(runtimeMs());
  }
  // Nur lokale Session-Zaehler; keine Aenderung am Coin-Kontostand im Spiel.
  // Der Farming-Loop und der Pflanzenschutz werden nicht zurueckgesetzt.
  function resetSession() {
    state.sessionEpoch++;
    automation?.resetCounters();
    resetTimer();
    for (const key of [
      "harvested", "sold", "coins", "errors", "protectedSkips", "rejectedHarvests",
      "reconnects", "antiAfkTicks", "selfHealChecks", "speedAdjustments",
      "lastResponseMs", "averageResponseMs"
    ]) state[key] = 0;
    state.lastError = "";
    state.lastRejection = "";
    state.rejectionStreak = 0;
    state.successStreak = 0;
    state.lastHarvestAt = null;
    state.ripeSince = null;
    state.lastSelfHealAt = null;
    state.selfHealAttempts = 0;
    updatePanel();
    console.info("[MG V13.2.1] Session zurueckgesetzt; AutoFarm bleibt aktiv.");
    return {
      laufzeit: formatTime(runtimeMs()),
      geerntet: state.harvested,
      verkaeufe: state.sold,
      coins: state.coins
    };
  }
  function formatTime(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(n => String(n).padStart(2, "0")).join(":");
  }
  window.addEventListener("pagehide", persistTimer);

  // ===== Eindeutige Feldrollen: Grau ignorieren, Grün Pflanzen, Blau Eier =====
  const fieldPlan = createFieldPlan(localStorage);
  function selectedSlots(mode) { return new Set(fieldPlan.indices(mode)); }

  // ===== Eigene Spielanbindung (keine Dritt-Scripts) =====
  // Die Schnittstelle MagicCircle_RoomConnection gehoert zum Spiel.
  // Daten stammen ausschliesslich aus dessen subscribeToPatches + Welcome.
  const bridge = {
    socket: null, connection: null, unsubscribe: null, playerId: null,
    lastFullState: null, garden: null, inventory: null,
    sequence: -1, frontier: -1, lastSnapshotAt: 0, observedSockets: 0,
    own: null, game: null, actor: null, heldId: '', generation: 0,
    welcomed: false, cancelPending: null, serverOffset: 0
  };

  const seenSockets = new WeakSet();
  function serverNow() { return Date.now() + bridge.serverOffset; }
  function readFrontier() {
    if (!bridge.welcomed || window.MagicCircle_RoomConnection?.currentWebSocket !== bridge.socket) return bridge.frontier;
    const value = Number(window.MagicCircle_RoomConnection
      ?.lastDistributedRoomPublication?.executedCommandSequence);
    if (Number.isInteger(value) && value >= 0) {
      bridge.frontier = Math.max(bridge.frontier, value);
    }
    return bridge.frontier;
  }

  function chooseOwnSlot(full) {
    if (!full || typeof full !== "object") return;
    bridge.lastFullState = full;
    const id = bridge.playerId || full.selfPlayerId ||
      full.data?.selfPlayerId || full.child?.data?.selfPlayerId;
    const slots = full.child?.data?.userSlots;
    if (!id || !Array.isArray(slots)) {
      bridge.garden = null;
      bridge.inventory = null;
      return;
    }
    let own = slots.find(slot => slot && (
      slot.userId === id || slot.playerId === id || slot.data?.playerId === id
    ));
    if (!own) {
      const databaseId = full.data?.players?.find(p => p?.id === id)?.databaseUserId;
      if (databaseId) own = slots.find(slot => slot?.data?.databaseUserId === databaseId ||
        slot?.data?.userId === databaseId);
    }
    // Bei unklarer Zuordnung lieber warten als versehentlich einen anderen Garten ernten.
    bridge.own = own?.data || null;
    bridge.game = full.child?.data || null;
    bridge.actor = own ? id : null;
    bridge.heldId = typeof own?.heldItem === 'string' ? own.heldItem :
      own?.heldItem?.id || own?.heldItem?.toolId || own?.heldItem?.species || '';
    bridge.garden = own?.data?.garden?.tileObjects || null;
    bridge.inventory = own?.data?.inventory || null;
    if (bridge.garden && bridge.inventory) bridge.lastSnapshotAt = Date.now();
  }

  function observeSocket(ws) {
    if (!ws || ws === bridge.socket || seenSockets.has(ws)) return;
    if (!String(ws.url || "").includes("/api/rooms/")) return;
    seenSockets.add(ws);
    if (bridge.cancelPending) bridge.cancelPending();
    bridge.socket = ws;
    bridge.generation++;
    bridge.own = null; bridge.game = null; bridge.actor = null;
    bridge.welcomed = false;
    bridge.serverOffset = 0;
    bridge.sequence = -1;
    bridge.frontier = -1;
    bridge.playerId = null;
    bridge.garden = null;
    bridge.inventory = null;
    bridge.lastFullState = null;
    bridge.lastSnapshotAt = 0;
    bridge.observedSockets++;
    ws.addEventListener("close", () => {
      // Ein altes Socket darf die neue Verbindung NICHT als offline markieren.
      if (bridge.socket !== ws) return;
      if (bridge.cancelPending) bridge.cancelPending();
      bridge.welcomed = false;
      bridge.own = null; bridge.game = null; bridge.actor = null;
      bridge.garden = null;
      bridge.inventory = null;
      bridge.lastFullState = null;
      bridge.sequence = -1;
      bridge.frontier = -1;
      bridge.lastSnapshotAt = 0;
      if (state.running) {
        if (state.offlineSince === null) state.offlineSince = Date.now();
        if (state.notReadySince === null) state.notReadySince = Date.now();
        state.connection = "WebSocket getrennt – warte auf Reconnect";
      }
    });
    // Der Serverzaehler gehoert zu jeder Verbindung separat.
    ws.addEventListener("message", event => {
      if (bridge.socket !== ws) return;
      const data = event.data;
      if (typeof data !== "string") return;
      const timeMatch = data.match(/"publishedAtServerMs"\s*:\s*(\d{12,16})/);
      if (timeMatch) {
        const offset = Number(timeMatch[1]) - Date.now();
        if (Number.isFinite(offset) && Math.abs(offset) < 86400000) bridge.serverOffset = offset;
      }
      if (data.includes('"selfPlayerId"') && data.includes('"executedCommandSequence"')) {
        try {
          const msg = JSON.parse(data);
          const seq = Number(msg?.executedCommandSequence);
          if (typeof msg?.selfPlayerId === "string") {
            bridge.playerId = msg.selfPlayerId;
            bridge.welcomed = true;
            chooseOwnSlot(bridge.lastFullState);
          }
          if (Number.isInteger(seq) && seq >= 0) {
            bridge.sequence = seq + 1;
            bridge.frontier = seq;
          }
        } catch { /* Kein Welcome-Frame */ }
      }
      if (bridge.frontier < 0) {
        const key = '"executedCommandSequence":';
        const at = data.indexOf(key);
        if (at >= 0) {
          const fragment = data.slice(at + key.length, at + key.length + 16);
          const digits = fragment.match(/^\d+/)?.[0];
          if (digits) bridge.frontier = Number(digits);
        }
      }
      if (data.length < 20000 && data.includes('"invalid_sequence"')) {
        try {
          const frame = JSON.parse(data);
          if (frame?.type === "QuinoaCommandResult" && frame.code === "invalid_sequence") {
            readFrontier();
            if (bridge.frontier >= 0) bridge.sequence = bridge.frontier + 1;
          }
        } catch { /* Unlesbare Nachricht */ }
      }
    });

    // EIN gemeinsamer Sequenzzaehler fuer Spielaktionen und eigene Befehle.
    // Alle Befehle laufen weiterhin ueber den normalen Socket des Spiels.
    const nativeSend = ws.send;
    ws.send = function(payload) {
      if (bridge.socket !== ws) return nativeSend.call(this, payload);
      if (typeof payload !== "string" || !payload.includes('"QuinoaCommand"')) {
        return nativeSend.call(this, payload);
      }
      let frame;
      try { frame = JSON.parse(payload); }
      catch { return nativeSend.call(this, payload); }
      if (frame?.type !== "QuinoaCommand") return nativeSend.call(this, payload);
      readFrontier();
      if (bridge.sequence <= 0) {
        const incoming = Number(frame.commandSequence);
        if (Number.isInteger(incoming) && incoming > 0) bridge.sequence = incoming;
      }
      if (bridge.sequence <= 0 && bridge.frontier >= 0) {
        bridge.sequence = bridge.frontier + 1;
      }
      if (bridge.sequence <= 0) return nativeSend.call(this, payload);
      const next = Math.max(bridge.sequence, bridge.frontier + 1);
      bridge.sequence = next + 1;
      frame.commandSequence = next;
      return nativeSend.call(this, JSON.stringify(frame));
    };
  }

  function installStandaloneHook() {
    const Native = window.WebSocket;
    if (typeof Native !== "function") return;
    function GameSocket(...args) {
      const socket = new Native(...args);
      if (String(args[0] ?? "").includes("/api/rooms/")) observeSocket(socket);
      return socket;
    }
    Object.setPrototypeOf(GameSocket, Native);
    GameSocket.prototype = Native.prototype;
    window.WebSocket = GameSocket;
  }
  installStandaloneHook();

  function watchGameConnection() {
    const connection = window.MagicCircle_RoomConnection;
    if (!connection) return;
    if (connection.currentWebSocket && connection.currentWebSocket !== bridge.socket) {
      observeSocket(connection.currentWebSocket);
    }
    if (bridge.connection === connection && bridge.subscribed) return;
    if (typeof bridge.unsubscribe === "function") {
      try { bridge.unsubscribe(); } catch {}
    }
    bridge.connection = connection;
    bridge.unsubscribe = null;
    bridge.subscribed = false;
    if (typeof connection.subscribeToPatches === "function") {
      try {
        bridge.unsubscribe = connection.subscribeToPatches((_patches, full) => {
          if (bridge.connection === connection && connection.currentWebSocket === bridge.socket) chooseOwnSlot(full);
        });
        bridge.subscribed = true;
      } catch (err) {
        console.warn("[MG Standalone] Spielzustand noch nicht bereit:", err?.message);
      }
    }
  }
  watchGameConnection();
  setInterval(watchGameConnection, 300);

  function getSocket() {
    watchGameConnection();
    const ws = bridge.socket;
    return ws && ws.readyState === 1 ? ws : null;
  }
  function getInventory() {
    return bridge.inventory;
  }
  function getProduce() {
    const inv = getInventory();
    // Ohne verifizierte Favoritenliste KEIN Auto-Sell riskieren.
    if (!Array.isArray(inv?.favoritedItemIds)) return [];
    const favorites = new Set(inv.favoritedItemIds);
    return (inv.items || []).filter(item =>
      item?.itemType === "Produce" &&
      typeof item.id === "string" && !favorites.has(item.id)
    );
  }
  function isMarkedProtected(plant, crop) {
    if ([crop?.locked, crop?.protected, crop?.isProtected,
         crop?.preserved, crop?.isPreserved, plant?.locked,
         plant?.protected, plant?.isProtected, plant?.preserved,
         plant?.isPreserved].some(v => v === true)) return true;
    // Standalone-Sicherheit: Mutationen/Max-Size standardmaessig schonen.
    if (prefs.protectMutations && Array.isArray(crop?.mutations) &&
        crop.mutations.length > 0) return true;
    if (prefs.protectMaxSize && Number(crop?.size) >= 100) return true;
    return false;
  }
  function findReadyCrop() {
    const tiles = bridge.garden;
    if (!tiles) return null;
    const chosen = selectedSlots("plant");
    const now = Date.now();
    for (const [id, plant] of Object.entries(tiles)) {
      const tile = Number(id);
      if (!chosen.has(tile) || plant?.objectType !== "plant") continue;
      for (const crop of plant.slots || []) {
        if (!Number.isInteger(crop?.slotId)) continue;
        if (!Number.isFinite(crop?.endTime) || crop.endTime > serverNow()) continue;
        const key = `${tile}:${crop.slotId}`;
        if ((state.cooldowns.get(key) || 0) > now) continue;
        if (isMarkedProtected(plant, crop)) {
          state.cooldowns.set(key, now + cfg.protectedSlotCooldownMs);
          state.protectedSkips++;
          continue;
        }
        if (automation && !automation.harvestAllowed(plant, crop)) continue;
        return { tile, slotsIndex: crop.slotId, key };
      }
    }
    return null;
  }

  // ===== Adaptives Tempo: nur bestätigte Ernteantworten messen =====
  function adjustSpeed(responseMs, successful, protectedError = false) {
    if (!protectedError) {
      state.lastResponseMs = Math.round(responseMs);
      state.averageResponseMs = state.averageResponseMs === 0
        ? responseMs : state.averageResponseMs * 0.8 + responseMs * 0.2;
    }
    if (!prefs.adaptive || protectedError) return;
    const a = cfg.adaptive;
    const before = state.currentDelay;
    if (!successful) {
      state.successStreak = 0;
      state.currentDelay = Math.min(prefs.maxHarvestDelayMs, before + a.slowDownMs * 2);
    } else if (responseMs >= a.slowResponseMs) {
      state.successStreak = 0;
      state.currentDelay = Math.min(prefs.maxHarvestDelayMs, before + a.slowDownMs);
    } else if (responseMs <= a.fastResponseMs) {
      if (++state.successStreak >= a.successesToSpeedUp) {
        state.currentDelay = Math.max(prefs.minHarvestDelayMs, before - a.speedUpMs);
        state.successStreak = 0;
      }
    } else {
      state.successStreak = 0;
    }
    if (state.currentDelay !== before) state.speedAdjustments++;
  }

  // "rejected" bedeutet nur: HarvestCrop wurde abgelehnt.
  // Es ist KEIN Beweis fuer Server-Lag oder geschuetzte Pflanzen.
  function isHarvestRejected(error) {
    return error?.commandType === "HarvestCrop" &&
      error?.code === "rejected";
  }
  function errorText(error) {
    return String(error?.message || error || "Unbekannter Fehler").slice(0, 350);
  }
  function looksProtected(error) {
    return /protect|preserv|blocked|refus|gesch[uü]tz|gesperrt|schutz|forbidden/i
      .test(errorText(error));
  }
  function isNetworkError(error) {
    return /socket|websocket|disconnect|netzwerk|network|timeout|offline|closed/i
      .test(errorText(error));
  }

  // ===== WebSocket-Befehle – eigene Sequenzierung über die Spielverbindung =====
  function sendCommand(command) {
    return new Promise((resolve, reject) => {
      const ws = getSocket();
      if (!ws) return reject(new Error("WebSocket nicht verbunden"));
      if (bridge.cancelPending) return reject(new Error("Eine Spielaktion wartet bereits auf Antwort"));
      const plotTypes = {HarvestCrop:'plant', PlantSeed:'plant', WaterPlant:'plant', GrowEgg:'egg', HatchEgg:'egg'};
      const needed = plotTypes[command.type] || (command.type === 'LogItem' && command.target?.kind === 'growSlot' ? 'plant' : null);
      const plot = command.type === 'LogItem' ? command.target?.slot : command.slot;
      if (needed && fieldPlan.get(plot) !== needed) {
        const error = new Error('Feldrolle geändert – Aktion ausgelassen'); error.code = 'field_role_changed';
        return reject(error);
      }
      const generation = bridge.generation;
      const requestId = crypto.randomUUID();
      const sentAt = performance.now();
      let finished = false;
      let timeout;
      const cancel = () => {
        const err = new Error('WebSocket ersetzt oder getrennt; Ausgang der Aktion unbekannt');
        err.code = 'connection_changed'; err.commandType = command.type;
        finish(err);
      };
      bridge.cancelPending = cancel;

      function finish(err, result) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        ws.removeEventListener("message", onMessage);
        if (bridge.cancelPending === cancel) bridge.cancelPending = null;
        if (command.type === "HarvestCrop" &&
            (!err || (!isHarvestRejected(err) && !looksProtected(err)))) {
          // Harte Ablehnungen sind kein Signal fuer eine zu kurze Erntepause.
          adjustSpeed(performance.now() - sentAt, !err, false);
        }
        if (err) reject(err);
        else {
          state.lastActivityAt = Date.now();
          resolve(result);
        }
      }
      function onMessage(event) {
        if (bridge.socket !== ws || bridge.generation !== generation) return cancel();
        if (typeof event.data !== "string") return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type !== "QuinoaCommandResult" || msg.requestId !== requestId) return;
        if (msg.ok !== true) {
          const code = typeof msg.code === "string" ? msg.code :
            typeof msg.error?.code === "string" ? msg.error.code : "";
          const kind = typeof msg.commandType === "string" ? msg.commandType : command.type;
          const reason = code || (typeof msg.reason === "string" ? msg.reason :
            typeof msg.error === "string" ? msg.error : "unbekannt");
          // Keine requestId oder Rohdaten in Logs/Diagnosen kopieren.
          const error = new Error(`${kind}: ${String(reason).slice(0, 100)}`);
          error.code = code;
          error.commandType = kind;
          return finish(error);
        }
        finish(null, msg);
      }
      ws.addEventListener("message", onMessage);
      timeout = setTimeout(() => finish(new Error("Server-Timeout")), cfg.commandTimeoutMs);
      try {
        // Nur explizit implementierte native Spielbefehle; keine Dev-/Credits-/Trade-Aktionen.
        // Der Standalone-Schutz prüft jede Zielpflanze, bevor wir senden.
        ws.send(JSON.stringify({
          scopePath: ["Room", "Quinoa"],
          type: "QuinoaCommand", requestId, commandSequence: 0, command
        }));
      } catch (error) { finish(error); }
    });
  }
  async function harvest(target) {
    const epoch = state.sessionEpoch;
    const result = await sendCommand({
      type: "HarvestCrop", slot: target.tile, slotsIndex: target.slotsIndex,
      cropItemId: crypto.randomUUID()
    });
    if (epoch === state.sessionEpoch) {
      state.harvested += result.itemGains?.length || 1;
    }
    // Bestaetigte Ernte weiterhin im Cooldown respektieren – selbst bei Reset.
    state.cooldowns.set(target.key, Date.now() + cfg.harvestedSlotCooldownMs);
    state.lastHarvestAt = Date.now();
    state.rejectionStreak = 0;
    state.ripeSince = null;
    state.lastSelfHealAt = null;
    state.selfHealAttempts = 0;
  }
  async function sell() {
    const epoch = state.sessionEpoch;
    const result = await sendCommand({ type: "SellAllCrops" });
    if (epoch !== state.sessionEpoch) return;
    state.sold++;
    state.coins += Number(result.currencyGains?.coins) || 0;
  }

  // ===== Anti-AFK, vorsichtig und ehrlich: kein "echtes" Benutzerevent =====
  // Synthetic Mouse/PointerEvents haben isTrusted=false. Der Server kann
  // diese ignorieren. Es gibt keine gesicherte Magic-Garden-AFK-API.
  function recordRealInput(event) {
    if (event.isTrusted) state.lastRealInput = Date.now();
  }
  for (const type of ["pointerdown", "pointermove", "keydown", "wheel"]) {
    window.addEventListener(type, recordRealInput, { capture: true, passive: true });
  }
  function antiAfkPulse() {
    if (!state.running || !prefs.antiAfk) {
      state.antiAfkStatus = "Aus";
      return false;
    }
    if (!getSocket()) {
      state.antiAfkStatus = "Warte auf Verbindung";
      return false;
    }
    const now = Date.now();
    if (now - state.lastRealInput < cfg.antiAfkOnlyAfterNoRealInputMs) {
      state.antiAfkStatus = "Echte Eingabe erkannt";
      return false;
    }
    if (state.lastAntiAfk !== null &&
        now - state.lastAntiAfk < cfg.antiAfkEveryMs) return false;
    const target = document.querySelector("canvas") || document.body;
    if (!target) {
      state.antiAfkStatus = "Keine Spielflaeche gefunden";
      return false;
    }
    try {
      const rect = target.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      // Nur synthetische Bewegung, keine Klicks oder spielverandernden Befehle.
      // isTrusted=false: weder Browser noch Server muessen sie akzeptieren.
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, pointerType: "mouse", clientX: x, clientY: y
        }));
      }
      target.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true, clientX: x, clientY: y
      }));
      state.antiAfkTicks++;
      state.lastAntiAfk = now;
      state.antiAfkStatus = "Impuls gesendet (Wirkung unbestaetigt)";
      return true;
    } catch (error) {
      state.antiAfkStatus = "Impuls konnte nicht gesendet werden";
      console.warn("[MG Standalone] AFK-Impuls fehlgeschlagen:", error?.message);
      return false;
    }
  }

  // ===== Hintergrundbetrieb / Sichtbarkeit =====
  document.addEventListener("visibilitychange", () => {
    state.hidden = document.hidden;
    updatePanel();
  });
  window.addEventListener("focus", updatePanel);
  function scanDelay() {
    return document.hidden ? cfg.hiddenScanMs : cfg.scanMs;
  }
  async function waitTick(ms) {
    const before = Date.now();
    await sleep(document.hidden ? Math.max(ms, 1000) : ms);
    state.wakeLagMs = Math.max(0, Date.now() - before - (document.hidden ? Math.max(ms, 1000) : ms));
  }

  // ===== Wiederverbindung: zuerst immer den nativen Reconnect abwarten =====
  // Erfolg des Impulses heisst NICHT, dass das Spiel den AFK-Kick verhindert.
  // Watchdog unabhaengig vom Farm-Loop: bei Hidden-Tabs kann der Browser den
  // Intervall trotzdem verlangsamen.
  function watchdogTick() {
    if (!state.running) return;
    antiAfkPulse();
    checkReloadReadiness();
  }
  setInterval(watchdogTick, cfg.afkWatchdogMs);

  function readyForFarming() {
    const ws = getSocket();
    return !!(ws && bridge.garden && bridge.inventory &&
      (bridge.sequence > 0 || readFrontier() >= 0));
  }

  function checkReloadReadiness() {
    if (!state.running) return;
    if (readyForFarming()) {
      state.notReadySince = null;
      state.reloadLimitReached = false;
      return;
    }
    const now = Date.now();
    if (state.notReadySince === null) state.notReadySince = now;
    if (prefs.autoReload && state.connectedOnce &&
        now - state.notReadySince >= cfg.offlineReloadAfterMs) {
      controlledReload("Verbindung oder eigener Garten nach Reconnect nicht bereit");
    }
  }

  function reloadBudgetAvailable() {
    const now = Date.now();
    const recent = readJSON(sessionStorage, KEYS.reloads, [])
      .filter(t => Number.isFinite(t) && t > now - cfg.reloadWindowMs);
    storeJSON(sessionStorage, KEYS.reloads, recent);
    return recent.length < cfg.reloadLimit;
  }
  function controlledReload(reason = "Verbindung nicht bereit") {
    if (!prefs.autoReload || !state.running || !state.connectedOnce ||
        state.reloadRequested || readyForFarming()) return false;
    // Bei echter Netzunterbrechung auf das Netzwerk warten statt Reload-Spam.
    if (navigator.onLine === false) {
      state.connection = "Netzwerk offline – warte";
      return false;
    }
    if (!reloadBudgetAvailable()) {
      state.reloadLimitReached = true;
      state.connection = "Reload-Limit erreicht – warte";
      return false;
    }
    const history = readJSON(sessionStorage, KEYS.reloads, []);
    history.push(Date.now());
    storeJSON(sessionStorage, KEYS.reloads, history);
    persistTimer();
    storeValue(sessionStorage, KEYS.resume, "1");
    state.lastReloadReason = reason;
    storeValue(sessionStorage, KEYS.lastReloadReason, reason);
    state.connection = "Neuladen für Reconnect …";
    console.warn("[MG Standalone] Auto-Neuladen nach langem Verbindungsverlust.");
    state.reloadRequested = true;
    try {
      location.reload();
      return true;
    } catch (error) {
      state.reloadRequested = false;
      state.connection = "Auto-Neuladen fehlgeschlagen";
      console.warn("[MG Standalone] Reload fehlgeschlagen:", error?.message);
      return false;
    }
  }
  let lastWs = null;
  async function ensureReady() {
    const ws = getSocket();
    const snapshot = bridge.garden;
    const commandReady = bridge.sequence > 0 || readFrontier() >= 0;
    if (!ws || !snapshot || !commandReady || !bridge.inventory) {
      if (!ws) {
        if (state.offlineSince === null) state.offlineSince = Date.now();
        state.connection = "Verbindung verloren – warte …";
      } else {
        state.connection = !snapshot ? "Warte auf eigene Garten-Daten" :
          !bridge.inventory ? "Warte auf Inventar" : "Warte auf Befehlssequenz";
      }
      // Nach 90s kontinuierlich fehlender Bereitschaft darf der Watchdog laden.
      checkReloadReadiness();
      if (state.reloadLimitReached) state.connection = "Reload-Limit erreicht – warte";
      await waitTick(Math.min(10000, Math.max(1500,
        state.offlineSince ? Math.floor((Date.now() - state.offlineSince) / 10) : 1500)));
      return false;
    }
    if (state.offlineSince !== null) state.reconnects++;
    state.reloadRequested = false;
    state.offlineSince = null;
    state.notReadySince = null;
    state.reloadLimitReached = false;
    state.connectedOnce = true;
    state.connection = "Verbunden";
    state.lastOnline = Date.now();
    if (ws !== lastWs) lastWs = ws;
    return true;
  }

  // ===== Fehler-Recovery: Schutz respektieren, backoff, Circuit Breaker =====
  async function handleError(error, target) {
    if (error?.code === 'field_role_changed') return;
    const msg = errorText(error);
    const rejectedCrop = !!target && isHarvestRejected(error);
    const protectedCrop = !!target && !rejectedCrop && looksProtected(error);

    if (rejectedCrop) {
      // Ablehnung ist nicht automatisch ein Verbindungs- oder Geschwindigkeitsfehler.
      // Den Ernte-Slot in Ruhe lassen und NICHT den Pflanzenschutz umgehen.
      state.rejectedHarvests++;
      state.rejectionStreak++;
      state.lastRejection = msg;
      state.cooldowns.set(target.key, Date.now() + cfg.rejectedSlotCooldownMs);
      state.consecutiveErrors = 0;
      if (state.rejectionStreak >= cfg.rejectionBurstThreshold) {
        state.breakerUntil = Math.max(state.breakerUntil,
          Date.now() + cfg.rejectionBurstPauseMs);
        state.connection = "Ernten abgelehnt – Sicherheitspause";
        state.rejectionStreak = 0;
        console.warn("[MG V13.2.3] Mehrere Ernten abgelehnt – 30s Sicherheitspause. Pflanzenschutz bleibt aktiv.");
      } else if (state.rejectedHarvests <= 3 || state.rejectedHarvests % 10 === 0) {
        console.info("[MG V13.2.3] Ernte abgelehnt – Slot wird 10 Minuten ausgelassen (Zaehler: " +
          state.rejectedHarvests + ").");
      }
      await waitTick(350);
      return;
    }

    state.errors++;
    state.lastError = msg;
    if (target) {
      state.cooldowns.set(target.key, Date.now() +
        (protectedCrop ? cfg.protectedSlotCooldownMs : cfg.failedSlotCooldownMs));
    }
    if (protectedCrop) {
      state.protectedSkips++;
      state.consecutiveErrors = 0;
      console.info("[MG Standalone] Geschützte Pflanze übersprungen (eigener Pflanzenschutz).");
      await waitTick(250);
      return;
    }
    if (isNetworkError(error)) {
      // Erst prüfen, ob ein neuer WebSocket erscheint. Kein eigener WS-Neuaufbau.
      if (!getSocket() && state.offlineSince === null) state.offlineSince = Date.now();
    }
    state.consecutiveErrors++;
    console.warn("[MG V13] Fehler:", msg);
    if (state.consecutiveErrors >= cfg.breakerAfterErrors) {
      state.breakerUntil = Date.now() + cfg.breakerMs;
      state.consecutiveErrors = 0;
      state.connection = "Sicherheitspause nach Fehlern";
      console.warn("[MG V13] 60 Sekunden Sicherheitspause.");
    }
    await waitTick(Math.min(15000, 1000 * 2 ** Math.min(state.consecutiveErrors, 4)));
  }

  // ===== Self-Healing: nur bei ANHALTEND erntebereiten, ungeschuetzten Pflanzen =====
  // Geschuetzte Pflanzen und aktive Cooldowns zaehlen nicht als Stau.
  // Der erste Eingriff ist eine Sicherheitspause; erst ein zweiter Stau darf
  // den bestehenden, begrenzten Reload-Weg benutzen (wenn aktiviert).
  function checkSelfHealing(target) {
    if (!prefs.selfHealing || !target) {
      state.ripeSince = null;
      state.selfHealAttempts = 0;
      return false;
    }
    const now = Date.now();
    if (state.ripeSince === null) state.ripeSince = now;
    if (now - state.ripeSince < prefs.stallAfterMs) return false;
    if (state.lastSelfHealAt !== null &&
        now - state.lastSelfHealAt < prefs.stallAfterMs) return false;

    state.lastSelfHealAt = now;
    state.selfHealAttempts++;
    state.selfHealChecks++;

    // Nur ABGELAUFENE Cooldowns bereinigen. Pflanzenschutz bleibt intakt.
    for (const [key, until] of state.cooldowns) {
      if (until <= now) state.cooldowns.delete(key);
    }
    state.successStreak = 0;
    state.currentDelay = Math.min(prefs.maxHarvestDelayMs,
      Math.max(state.currentDelay, cfg.adaptive.initialMs + 50));

    // Kein Seiten-Reload bei gesundem Socket: langes Wachstum, geschuetzte
    // Pflanzen oder normale Wartezeiten duerfen KEINEN Reload ausloesen.
    // Nur der Verbindungs-Watchdog entscheidet ueber Auto-Neuladen.
    state.connection = "Self-Healing: kurze Sicherheitspause";
    state.breakerUntil = Math.max(state.breakerUntil, now + 3000);
    console.warn("[MG V13.2] Erntestau erkannt: pruefe Verbindung/Status, pausiere kurz.");
    return true;
  }

  // ===== Steuerung; genau ein Befehl gleichzeitig =====
  async function loop() {
    if (state.busy) return;
    state.busy = true;
    let lastSellCheck = 0;
    try {
      while (state.running) {
        state.lastLoopAt = Date.now();
        let attempted = null;
        try {
          if (!(await ensureReady())) continue;
          if (!state.running) break;
          if (Date.now() < state.breakerUntil) {
            state.connection = "Sicherheitspause";
            await waitTick(Math.min(2000, state.breakerUntil - Date.now()));
            continue;
          }
          state.connection = "Verbunden";
          if (automation && await automation.step()) {
            await waitTick(250);
            continue;
          }
          if (Date.now() - lastSellCheck >= prefs.sellIntervalMs) {
            lastSellCheck = Date.now();
            if (getProduce().length >= prefs.sellThreshold && (!automation || automation.saleAllowed())) {
              await sell();
              state.consecutiveErrors = 0;
              await waitTick(500);
              continue;
            }
          }
          attempted = findReadyCrop();
          if (!attempted) {
            checkSelfHealing(null);
            await waitTick(scanDelay());
            continue;
          }
          if (checkSelfHealing(attempted)) {
            await waitTick(500);
            continue;
          }
          await harvest(attempted);
          state.consecutiveErrors = 0;
          await waitTick(prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs);
        } catch (error) {
          await handleError(error, attempted);
        }
      }
    } finally {
      state.busy = false;
      stopTimer();
      updatePanel();
    }
  }

  function start({ auto = false } = {}) {
    if (state.running || state.busy) return;
    state.running = true;
    state.autoResumed = auto;
    state.consecutiveErrors = 0;
    state.breakerUntil = 0;
    state.reloadRequested = false;
    state.lastRealInput = Date.now();
    state.antiAfkStatus = prefs.antiAfk ? "Warte auf Inaktivitaet" : "Aus";
    storeValue(sessionStorage, KEYS.resume, "1");
    startTimer();
    updatePanel();
    void loop();
    console.log(`[MG V13] ${auto ? "Auto-Resume" : "Start"} aktiviert.`);
  }
  function stop() {
    state.running = false;
    automation?.stop();
    storeValue(sessionStorage, KEYS.resume, "0");
    stopTimer();
    state.antiAfkStatus = "Gestoppt";
    updatePanel();
    console.log("[MG Standalone] Stop angefordert.");
  }
  function onHotkey(event) {
    if (event.code !== "F8" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
    event.preventDefault();
    if (state.running) stop();
    else start();
  }
  window.addEventListener("keydown", onHotkey, true);

  // ===== V14 Hauptkanal: Versionswechsel von V13 ueber denselben GitHub-Pfad =====
  // Name, Namespace und URL muessen mit dem Original V13.2.3 uebereinstimmen,
  // damit Tampermonkey die vorhandene Installation aktualisiert statt dupliziert.
  // Die separate Standalone-Beta hat einen eigenen, unabhaengigen Update-Kanal.
  const updateInfo = { checkedAt: 0, status: "Noch nicht geprueft", newer: null };
  let updateRunning = false;
  function parseMainRelease(source) {
    const header = String(source).match(/^\/\/ ==UserScript==\s*\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m)?.[1];
    if (!header) return null;
    if (!/^\/\/\s*@namespace\s+mg-autofarm-local\s*$/m.test(header)) return null;
    if (!/^\/\/\s*@name\s+Magic Garden AutoFarm\s*$/m.test(header)) return null;
    // Versionsnummer ausschließlich aus dem validierten Userscript-Header.
    return header.match(/^\/\/\s*@version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1] || null;
  }
  function compareVersions(a, b) {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    }
    return 0;
  }
  async function checkForUpdate(force = false) {
    if (updateRunning || (!force && Date.now() - updateInfo.checkedAt < 30 * 60000)) {
      return { ...updateInfo };
    }
    updateRunning = true;
    try {
      const source = await fetchReleaseSource(UPDATE_URL, {
        gmRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null,
        fetchImpl: fetch, timeoutMs: 10000
      });
      const remote = parseMainRelease(source);
      if (!remote) throw new Error("Keine gueltige AutoFarm-Version");
      const comparison = compareVersions(remote, VERSION);
      updateInfo.newer = comparison > 0 ? remote : null;
      updateInfo.status = comparison > 0
        ? "Update verfuegbar: V" + remote
        : comparison < 0
          ? "Server-Version aelter (deine V" + VERSION + ")"
          : "Aktuell: V" + VERSION;
    } catch (error) {
      updateInfo.status = "Update-Check fehlgeschlagen (Verbindung/Release)";
      updateInfo.newer = null;
    } finally {
      updateInfo.checkedAt = Date.now();
      updateRunning = false;
      updatePanel();
    }
    return { ...updateInfo, url: UPDATE_URL };
  }

  // ===== Diagnose OHNE IDs, Chat, Koordinaten, Inventarinhalte oder Token =====
  function getDiagnostics() {
    const tiles = bridge.garden;
    const errorKind = !state.lastError ? "none" :
      looksProtected(state.lastError) ? "protected" :
      isNetworkError(state.lastError) ? "connection" : "other";
    return {
      tool: "Magic Garden AutoFarm",
      version: VERSION,
      timestamp: new Date().toISOString(),
      running: state.running,
      connection: state.connection,
      socketOpen: !!getSocket(),
      snapshotAvailable: !!tiles,
      snapshotTileCount: tiles ? Object.keys(tiles).length : 0,
      nativeSocketObserved: bridge.observedSockets > 0,
      gameStateSubscribed: !!bridge.connection,
      nativeSequenceReady: bridge.sequence > 0,
      antiAfkEnabled: prefs.antiAfk,
      antiAfkPulseCount: state.antiAfkTicks,
      antiAfkStatus: state.antiAfkStatus,
      autoReloadEnabled: prefs.autoReload,
      autoReloadLimitReached: state.reloadLimitReached,
      autoReloadAttemptsLast15m: readJSON(sessionStorage, KEYS.reloads, []).filter(t =>
        Number.isFinite(t) && t > Date.now() - cfg.reloadWindowMs).length,
      lastAutoReloadReason: state.lastReloadReason,
      tabHidden: !!document.hidden,
      selectedFieldCount: selectedSlots().size,
      fieldRoles: fieldPlan.counts(),
      readyProduceCount: getProduce().length,
      harvestedCount: state.harvested,
      salesCount: state.sold,
      errorCount: state.errors,
      rejectedHarvestCount: state.rejectedHarvests,
      errorCategory: errorKind,
      protectedSkipCount: state.protectedSkips,
      reconnectCount: state.reconnects,
      selfHealingChecks: state.selfHealChecks,
      adaptiveDelayMs: prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs,
      averageServerResponseMs: Math.round(state.averageResponseMs),
      runtimeSeconds: Math.floor(runtimeMs() / 1000),
      automation: automation?.status() || null
    };
  }
  async function copyDiagnostics() {
    const report = JSON.stringify(getDiagnostics(), null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API fehlt");
      await navigator.clipboard.writeText(report);
      if (diagnosticStatus) diagnosticStatus.textContent = "Diagnose kopiert (ohne private Spieldaten).";
    } catch {
      console.info("[MG V13.2] Diagnose zum Kopieren:\n" + report);
      if (diagnosticStatus) diagnosticStatus.textContent = "Kopieren gesperrt: Diagnose steht in der Konsole.";
    }
  }

  // ===== Bedienoberfläche =====
  let panel = null;
  let body = null;
  let fieldCount = null;
  let headline = null;
  let updateStatus = null;
  let updateLink = null;
  let diagnosticStatus = null;
  const fieldButtons = [];
  let collapsed = readValue(localStorage, KEYS.collapsed) === "true";

  // ===== V13.1: Menue via Titelleiste ziehen, Position nach F5 behalten =====
  function positionPanel(left, top, persist = true) {
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - bounds.width - 8);
    // Die Titelleiste soll sichtbar bleiben. Ist das Panel tiefer platziert,
    // wird der scrollbare Inhalt verkleinert statt die Bewegung zu blockieren.
    const maxY = Math.max(8, window.innerHeight - (collapsed ? 68 : 220));
    const x = clamp(Math.round(left), 8, maxX);
    const y = clamp(Math.round(top), 8, maxY);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    panel.style.maxHeight = `${Math.min(Math.floor(window.innerHeight * 0.85),
      Math.max(52, window.innerHeight - y - 8))}px`;
    if (persist) storeJSON(localStorage, KEYS.panelPosition, { left: x, top: y });
  }

  function installPanelDragging(header) {
    header.style.cursor = "grab";
    header.style.userSelect = "none";
    header.style.touchAction = "none";
    header.title = "Hier ziehen, um das Menue zu verschieben";
    let drag = null;

    header.addEventListener("pointerdown", event => {
      // Plus/Minus bleibt ein normaler Button und startet keinen Drag.
      if (event.button !== 0 || event.isPrimary === false ||
          event.target?.closest?.("button, a, [role=button]")) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      header.style.cursor = "grabbing";
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    header.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      positionPanel(
        drag.left + event.clientX - drag.clientX,
        drag.top + event.clientY - drag.clientY,
        false
      );
      event.preventDefault();
    });

    function finishDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      header.style.cursor = "grab";
      const rect = panel.getBoundingClientRect();
      positionPanel(rect.left, rect.top, true);
      if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
    }
    header.addEventListener("pointerup", finishDrag);
    header.addEventListener("pointercancel", finishDrag);
    header.addEventListener("lostpointercapture", finishDrag);
  }

  function btn(label, callback) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.style.cssText = "flex:1;min-width:0;padding:9px 5px;background:#294b38;color:#fff;border:1px solid #456052;border-radius:7px;cursor:pointer;font:12px Arial,sans-serif";
    el.addEventListener("click", callback);
    return el;
  }
  function checkbox(label, checked, onChange) {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;margin:8px 0";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => { onChange(input.checked); persistPrefs(); updatePanel(); });
    const text = document.createElement("span");
    text.textContent = label;
    row.append(input, text);
    return row;
  }
  function updatePanel() {
    if (!panel) return;
    automationUI?.refresh();
    const status = panel.querySelector("#mg13-status");
    const stats = panel.querySelector("#mg13-stats");
    if (status) status.textContent = state.running ? "🟢 Aktiv" : state.busy ? "🟡 Stoppt …" : "🔴 Gestoppt";
    if (!compactMenu && headline) headline.textContent = state.running ? "🌱 AutoFarm V15 · Aktiv" : "🌱 Magic Garden V15";
    if (stats) stats.textContent =
      `Felder: ${selectedSlots().size} / 200\n` +
      `Geerntet: ${state.harvested}\n` +
      `Verkäufe: ${state.sold}\n` +
      `Coins: ${state.coins.toLocaleString("de-DE")}\n` +
      `Verkaufbare Items: ${getProduce().length}\n` +
      `Fehler: ${state.errors}  ·  Ablehnungen: ${state.rejectedHarvests}\n` +
      `Schutz-Skips: ${state.protectedSkips}\n` +
      `⏱ Laufzeit: ${formatTime(runtimeMs())}\n` +
      `⚡ Erntepause: ${prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs} ms\n` +
      `📡 Antwort: ${state.lastResponseMs} ms (Ø ${Math.round(state.averageResponseMs)} ms)\n` +
      `🔌 ${state.connection}\n` +
      `🧩 Standalone: Socket ${getSocket() ? "bereit" : "fehlt"}, Daten ${bridge.garden ? "bereit" : "fehlen"}, Sequenz ${bridge.sequence > 0 ? "bereit" : "warte"}\n` +
      `🔁 Reconnects: ${state.reconnects}\n` +
      `🖥 Tab: ${document.hidden ? "Hintergrund (gedrosselt möglich)" : "Sichtbar"}\n` +
      `🛡 Anti-AFK-Impulse: ${state.antiAfkTicks} (nicht garantiert)\n` +
      `💤 AFK: ${state.antiAfkStatus}\n` +
      `🔁 Auto-Neuladen: ${prefs.autoReload ? "An" : "Aus"}${state.reloadLimitReached ? " (Limit erreicht)" : ""}\n` +
      `🩺 Self-Healing: ${prefs.selfHealing ? "An" : "Aus"} (${state.selfHealChecks} Prüfungen)\n` +
      `⌨ F8 = Start / Stop`;
    if (fieldCount) { const c = fieldPlan.counts(); fieldCount.textContent = `Pflanzen: ${c.plant} · Eier: ${c.egg} · Ignoriert: ${c.none}`; }
    if (updateStatus) updateStatus.textContent = updateInfo.status;
    if (updateLink) updateLink.style.display = updateInfo.newer ? "inline-block" : "none";
    compactMenu?.refresh({
      running: state.running, busy: state.busy, connection: state.connection,
      harvested: state.harvested.toLocaleString("de-DE"),
      coins: state.coins.toLocaleString("de-DE"),
      coinsCompact: new Intl.NumberFormat("de-DE", {notation:"compact", maximumFractionDigits:1}).format(state.coins),
      sold: state.sold, runtime: formatTime(runtimeMs()), fields: selectedSlots().size + " / 200",
      produce: getProduce().length, delay: (prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs) + " ms",
      errors: state.errors, rejected: state.rejectedHarvests, protected: state.protectedSkips,
      update: updateInfo.newer
    });
  }
  function repaintFields() {
    fieldGrid?.refresh();
    updatePanel();
  }

  function createPanel() {
    if (panel || !document.body) return;
    panel = document.createElement("div");
    panel.id = "mg-autofarm-v13";
    panel.style.cssText = "position:fixed;top:80px;right:20px;width:350px;max-width:calc(100vw - 40px);max-height:85vh;overflow-y:auto;box-sizing:border-box;padding:15px;background:#101c17;color:#e9fff1;border:1px solid #3a7856;border-radius:14px;z-index:2147483647;font:13px Arial,sans-serif;box-shadow:0 8px 30px #0009";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px";
    headline = document.createElement("strong");
    headline.textContent = "🌱 Magic Garden V15";
    headline.style.fontSize = "16px";
    const toggle = btn(collapsed ? "+" : "−", () => {
      collapsed = !collapsed;
      storeValue(localStorage, KEYS.collapsed, String(collapsed));
      body.style.display = collapsed ? "none" : "";
      if (compactMenu) compactMenu.setCollapsed(collapsed);
      else toggle.textContent = collapsed ? "+" : "−";
      // Nach Ein-/Ausklappen pruefen, dass das Panel im Bildschirm bleibt.
      if (panel.style.left) {
        const rect = panel.getBoundingClientRect();
        positionPanel(rect.left, rect.top);
      }
    });
    toggle.style.cssText += ";flex:none;padding:5px 12px;font-size:18px";
    header.append(headline, toggle);
    const grip = document.createElement("span");
    grip.textContent = "⠿";
    grip.title = "Zum Verschieben an der Titelleiste ziehen";
    grip.style.cssText = "color:#81d4a0;font-size:20px;margin-right:6px;pointer-events:none";
    header.insertBefore(grip, headline);
    installPanelDragging(header);
    panel.appendChild(header);

    body = document.createElement("div");
    body.style.display = collapsed ? "none" : "";
    body.innerHTML = '<div id="mg13-status" style="margin:12px 0">🔴 Gestoppt</div>' +
      '<pre id="mg13-stats" style="font:12px monospace;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere"></pre>';

    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:8px;margin:10px 0 14px";
    const startBtn = btn("▶ Start", () => start());
    startBtn.style.background = "#237c49";
    const stopBtn = btn("■ Stop", stop);
    stopBtn.style.background = "#a93232";
    controls.append(startBtn, stopBtn);
    body.appendChild(controls);
    const resetButton = btn("↺ Session zurücksetzen (Zeit + Zähler)", resetSession);
    resetButton.title = "Setzt Laufzeit, verdiente Coins, Ernten, Verkäufe und Fehlerzähler zurück. Die Farm läuft weiter.";
    resetButton.style.cssText += ";display:block;width:100%;margin:-3px 0 14px";
    body.appendChild(resetButton);

    const toggles = document.createElement("div");
    toggles.style.cssText = "border-top:1px solid #355342;padding:10px 0";
    toggles.append(
      checkbox("Adaptive Geschwindigkeit", prefs.adaptive, v => { prefs.adaptive = v; }),
      checkbox("Self-Healing bei Erntestau", prefs.selfHealing, v => { prefs.selfHealing = v; }),
      checkbox("Anti-AFK-Impulse (experimentell)", prefs.antiAfk, v => { prefs.antiAfk = v; }),
      checkbox("Auto-Neuladen bei längerem Offline", prefs.autoReload, v => { prefs.autoReload = v; })
    );
    const standaloneToggles = document.createElement("div");
    standaloneToggles.style.cssText = "border-top:1px solid #355342;padding:9px 0";
    standaloneToggles.append(
      checkbox("Mutierte Ernten schützen (Standalone)", prefs.protectMutations,
        v => { prefs.protectMutations = v; }),
      checkbox("Pflanzen mit Größe 100 schützen", prefs.protectMaxSize,
        v => { prefs.protectMaxSize = v; })
    );
    toggles.appendChild(standaloneToggles);
    const note = document.createElement("small");
    note.textContent = "V14: Anti-AFK-Impulse sind kuenstliche Mausbewegungen (kein garantierter Kick-Schutz). Auto-Neuladen erst nach 90s fehlender Spielbereitschaft, maximal 3-mal in 15 Minuten.";
    note.style.cssText = "color:#a8b9ae;display:block;line-height:1.4;margin-top:5px";
    toggles.appendChild(note);
    body.appendChild(toggles);
    automationUI = mountAutomationUI(body, automation, document);

    const settingsPanel = document.createElement("div");
    settingsPanel.style.cssText = "border-top:1px solid #355342;padding:12px 0";
    const settingsTitle = document.createElement("strong");
    settingsTitle.textContent = "⚙ Einstellungen (automatisch gespeichert)";
    settingsPanel.appendChild(settingsTitle);
    function numberControl(label, key, factor = 1) {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;margin:9px 0;font-size:12px";
      const text = document.createElement("span");
      text.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(NUMBER_FIELDS[key].min / factor);
      input.max = String(NUMBER_FIELDS[key].max / factor);
      input.step = String(NUMBER_FIELDS[key].step / factor);
      input.value = String(prefs[key] / factor);
      input.style.cssText = "width:88px;padding:5px;color:#e9fff1;background:#20372a;border:1px solid #456052;border-radius:5px";
      input.addEventListener("change", () => {
        input.value = String(setNumberPreference(key, Number(input.value) * factor) / factor);
      });
      row.append(text, input);
      return row;
    }
    settingsPanel.append(
      numberControl("Auto-Sell ab Items", "sellThreshold"),
      numberControl("Verkaufscheck (Sek.)", "sellIntervalMs", 1000),
      numberControl("Min. Erntepause (ms)", "minHarvestDelayMs"),
      numberControl("Max. Erntepause (ms)", "maxHarvestDelayMs"),
      numberControl("Self-Healing nach (Sek.)", "stallAfterMs", 1000)
    );
    body.appendChild(settingsPanel);

    const tools = document.createElement("div");
    tools.style.cssText = "border-top:1px solid #355342;padding:12px 0";
    const updateHeading = document.createElement("strong");
    updateHeading.textContent = "🔄 GitHub-Update";
    updateStatus = document.createElement("div");
    updateStatus.style.cssText = "margin:8px 0;color:#a8b9ae;font-size:12px";
    updateStatus.textContent = updateInfo.status;
    const updateControls = document.createElement("div");
    updateControls.style.cssText = "display:flex;gap:8px;align-items:center";
    // Update check runs on a timer. The sticky version badge opens install.
    updateLink = document.createElement("a");
    updateLink.href = UPDATE_URL;
    updateLink.target = "_blank";
    updateLink.rel = "noopener noreferrer";
    updateLink.textContent = "Installieren";
    updateLink.style.cssText = "display:none;color:#91efb4;font-size:12px";
    updateControls.appendChild(updateLink);
    diagnosticStatus = document.createElement("div");
    diagnosticStatus.style.cssText = "font-size:11px;color:#a8b9ae;margin:6px 0";
    const copyButton = btn("📋 Diagnose kopieren (datensparsam)", () => { void copyDiagnostics(); });
    tools.append(updateHeading, updateStatus, updateControls, copyButton, diagnosticStatus);
    copyButton.style.marginTop = "10px";
    body.appendChild(tools);

    const fields = document.createElement("div");
    fields.style.cssText = "border-top:1px solid #355342;padding-top:12px";
    const fieldTitle = document.createElement("strong");
    fieldTitle.textContent = "🌿 Feldauswahl";
    fields.appendChild(fieldTitle);
    fieldCount = document.createElement("div");
    fieldCount.style.marginTop = "8px";
    fields.appendChild(fieldCount);
    fieldCount.hidden = true;
    fieldGrid = mountFieldGrid(fields, fieldPlan, () => updatePanel());

  body.appendChild(fields);
    panel.appendChild(body);
    compactMenu = mountCompactMenu({
      document, panel, body, header, headline, toggle, grip, controls,
      startButton: startBtn, stopButton: stopBtn, resetButton,
      settings: settingsPanel, toggles, protectionToggles: standaloneToggles,
      tools, fields, updateStatus, updateControls, copyButton, diagnosticStatus,
      automationUI, version: VERSION, storage: localStorage, collapsed
    });
    document.body.appendChild(panel);
    const savedPosition = readJSON(localStorage, KEYS.panelPosition, null);
    if (Number.isFinite(savedPosition?.left) && Number.isFinite(savedPosition?.top)) {
      positionPanel(savedPosition.left, savedPosition.top, false);
    } else {
      const initial = panel.getBoundingClientRect();
      positionPanel(initial.left, initial.top, false);
    }
    window.addEventListener("resize", () => {
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      // Bei Groessenaenderung den verschobenen Header erreichbar halten.
      if (panel.style.left) positionPanel(rect.left, rect.top);
    });
    repaintFields();
    setInterval(updatePanel, 1000);
    // Status einmal beim Laden prüfen; danach nur auf Knopfdruck bzw. spaeter pro Sitzung.
    setTimeout(() => { void checkForUpdate(false); }, 2000);
    setInterval(() => { void checkForUpdate(false); }, 30 * 60000);
  }

  // ===== Own-game catalogs: observe early, recover from bootstrap imports =====
  const nativeCatalogSource = createNativeCatalogSource({
    document, performance,
    PerformanceObserver: typeof PerformanceObserver === 'function' ? PerformanceObserver : null,
    pageURL: () => location.href,
    release: () => document.querySelector?.('meta[name="magiccircle-release"]')?.content ||
      window.MagicCircle_RoomConnection?.currentWebSocket?.url?.match(/\/version\/(\d+)\//)?.[1] || '',
    fetch: (...args) => fetch(...args),
    importModule: url => import(url)
  });
  async function loadNativeAutomationCatalogs() { return nativeCatalogSource.load(); }
  automation = createAutomationCore({
    storage: localStorage,
    now: () => Date.now(),
    running: () => state.running && !state.reloadRequested,
    protected: isMarkedProtected,
    send: sendCommand,
    snapshot: () => {
      if (!getSocket() || !bridge.garden || !bridge.own || !bridge.game || !bridge.actor) return null;
      return {actor:bridge.actor,own:bridge.own,game:bridge.game,garden:bridge.garden,
        inventory:bridge.inventory,generation:bridge.generation,serverNow:serverNow(),
        heldId:bridge.heldId,selected:[...selectedSlots()].sort((a,b)=>a-b),fieldModes:fieldPlan.snapshot()};
    },
    loadCatalogs: loadNativeAutomationCatalogs,
    catalogDiagnostics: () => nativeCatalogSource.diagnostics(),
    onCatalogsChanged: () => automationUI?.refresh(),
    ariesService: () => {
      const svc=window.QWS_PetsService;
      return svc&&typeof svc.getTeams==='function'?svc:null;
    },
    updateAriesTeam: async plan => {
      const svc=window.QWS_PetsService;
      if(!svc||!svc.isTeamSyncEnabled?.()||typeof svc.saveTeam!=='function'||
        typeof svc.getTeams!=='function')return {ok:false};
      const before=svc.getTeams().find(t=>t.id===plan.id);
      if(!before||!before.serverId||
        JSON.stringify(before.slots?.slice(0,3))!==JSON.stringify(plan.before.slice(0,3)))return {ok:false};
      const updated=svc.saveTeam({id:plan.id,slots:plan.slots});
      const after=svc.getTeams().find(t=>t.id===plan.id);
      return {ok:!!updated&&!!after&&
        JSON.stringify(after.slots?.slice(0,3))===JSON.stringify(plan.slots)};
    },
    withPurchaseLock: (actor, fn) => typeof navigator.locks?.request === 'function'
      ? navigator.locks.request('magic-garden-autofarm-purchases',{ifAvailable:true}, lock => lock ? fn() : false)
      : Promise.resolve(false)
  });
  setTimeout(() => { void automation.loadCatalogs(); }, 2500);

  // ===== Konsole =====
  window.MGAutoFarmV13 = {
    state, cfg, prefs, start, stop, resetTimer, resetSession, selectedSlots, getDiagnostics, checkForUpdate, setNumberPreference, automation, fieldPlan,
    status() {
      const details = {
        Aktiv: state.running,
        Verbunden: !!getSocket(),
        Verbindung: state.connection,
        Hintergrund: document.hidden,
        Felder: selectedSlots().size,
        Geerntet: state.harvested,
        Verkaeufe: state.sold,
        Coins: state.coins,
        Laufzeit: formatTime(runtimeMs()),
        ErntepauseMs: prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs,
        LetzteAntwortMs: state.lastResponseMs,
        AntiAFKImpulse: state.antiAfkTicks,
        Reconnects: state.reconnects,
        SchutzUebersprungen: state.protectedSkips,
        Fehler: state.errors,
        ErntenAbgelehnt: state.rejectedHarvests,
        SelfHealingPruefungen: state.selfHealChecks,
        LetzterFehler: state.lastError
      };
      console.table(details);
      return details;
    }
  };

  if (document.body) createPanel();
  else document.addEventListener("DOMContentLoaded", createPanel, { once: true });

  // Auto-Resume: nur wenn in diesem Tab beim Reload vorher aktiv.
  if (readValue(sessionStorage, KEYS.resume) === "1") {
    start({ auto: true });
  }
  console.log("✅ Magic Garden AutoFarm V15.4.0 geladen (Automationszentrale, ohne Fremdskripte).");
})();
