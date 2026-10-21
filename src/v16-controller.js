/* V16 coordination. All destructive operations still share the existing game
 * command pipe. Preview methods send nothing. No external mod is required.
 */
function createV16Controller(env) {
  'use strict';
  const load=(name,global)=>global||require('./'+name+'.js');
  const Builder=typeof createEffectTeamBuilder==='function'?createEffectTeamBuilder:require('./effect-teams.js').createEffectTeamBuilder;
  const Registry=typeof createTeamRegistry==='function'?createTeamRegistry:require('./team-registry.js').createTeamRegistry;
  const Actions=typeof createTeamActions==='function'?createTeamActions:require('./team-actions.js').createTeamActions;
  const builder=Builder();let cached=null,sig='',lastBuild=0,lastWork=0,lastSync=0,queued=null,notice='';
  const arr=x=>Array.isArray(x)?x:[], lc=x=>String(x||'').toLowerCase();
  const registry=Registry({storage:env.storage,uuid:env.uuid||(()=>globalThis.crypto.randomUUID()),now:env.now,snapshot:env.snapshot,send:env.rawSend});
  const roles={HatchEgg:['hatchTeamKey','hatchEgg',['Combohatch','PetHatchSizeBoost','DoubleHatch','PetMutationBoost','PetAgeBoost']],
    SellAllCrops:['sellTeamKey','sellAllCrops',['CombocropSale','SellBoost','ProduceRefund']],
    SellPet:['petSellTeamKey','sellPet',['CombopetSale','DustBoost','PetRefund']]};
  function refresh(force=false){
    const s=env.snapshot();if(!s)return null;
    if(!force&&cached&&env.now()-lastBuild<1500)return cached;
    const next=builder.signature(s,env.catalogs());lastBuild=env.now();
    if(next!==sig||!cached){
      const previous=registry.list(s);cached=builder.build(s,env.catalogs(),previous);sig=next;
    }
    if(env.config().teamBuilder&&cached.ready)registry.update(s,cached.plans);
    return cached;
  }
  function choose(command,s){
    const config=env.config();if(!config.autoTeams)return null;
    const spec=roles[command.type];if(!spec)return null;
    const data=refresh();if(!config.teamBuilder||!data?.ready){notice='Teamwechsel wartet auf aktivierten Team-Builder und Fähigkeiten';return null;}
    const [setting,trigger,priority]=spec;
    if(config[setting]){
      const t=data.plans.find(t=>t.key===config[setting]&&!t.weather&&t.trigger===trigger&&t.mode==='active');
      if(!t)throw Error('Ausgewähltes Aktionsteam momentan nicht verfügbar');return t;
    }
    for(const family of priority){const t=data.plans.find(t=>t.family===family&&t.trigger===trigger&&!t.weather&&t.mode==='active'&&t.known);if(t)return t;}
    notice='Kein passendes Effekt-Team – Aktion ohne Wechsel';return null;
  }
  const actions=Actions({snapshot:env.snapshot,sendRaw:env.rawSend,running:env.running,choose,registry});
  function protection(p,s,plan){
    const id=lc(p.id),isPet=x=>lc((x?.slot||x)?.id)===id;
    if(arr(s.inventory.favoritedItemIds).some(x=>lc(x)===id))return 'Favorit';
    if(p.locked||p.isLocked||p.protected||p.isProtected||env.protected?.({},p))return 'Gesperrt/geschützt';
    if(!Array.isArray(p.mutations))return 'Mutationsdaten fehlen';
    if(p.mutations.length)return 'Mutiertes Pet';
    if(arr(s.own.petSlots).some(isPet))return 'Aktives Team';
    if(arr(s.inventory.storages).some(st=>st?.decorId!=='PetHutch'&&arr(st.items).some(isPet)))return 'Pet liegt in einem anderen Lager';
    if(arr(s.own.petTeams).some(t=>arr(t.members).some(m=>lc(m.petId)===id)))return 'Gespeichertes Team';
    const aries=env.ariesService?.();
    if(aries){try{
      const teams=aries.getTeams();if(!Array.isArray(teams))return 'Aries-Teamdaten unklar';
      if(teams.some(t=>arr(t.slots).some(x=>lc(x)===id)))return 'Gespeichertes Aries-Team';
    }catch{return 'Aries-Teamdaten unklar';}}
    if(arr(plan?.reserved).includes(id)||registry.protectedIds(s).includes(id))return 'Effekt-/AFK-Team benötigt dieses Pet';
    if(lc(s.heldId)===id)return 'Pet gerade ausgewählt';
    return '';
  }
  let validatingAttempt=null;
  function salePreview(){
    const c=env.config(),s=env.snapshot();
    if(!s)return {pet:null,why:'Eigene Spieldaten fehlen',rows:[]};
    if(!c.petSell)return {pet:null,why:'Pet Auto-Sell ist ausgeschaltet',rows:[]};
    if(!arr(c.petSellEggs).length)return {pet:null,why:'Keine Ei-Gruppe zum Pet-Verkauf ausgewählt',rows:[]};
    if(!Array.isArray(s.own.petSlots)||!Array.isArray(s.own.petTeams)||!Array.isArray(s.inventory.storages))
      return {pet:null,why:'Aktive Pets, Teams oder Lagerdaten fehlen',rows:[]};
    if(!Array.isArray(s.inventory.items)||!Array.isArray(s.inventory.favoritedItemIds)||
      s.inventory.storages.some(st=>!st||typeof st.decorId!=='string'||!Array.isArray(st.items))||
      s.inventory.storages.filter(st=>st.decorId==='PetHutch').length>1||
      s.own.petTeams.some(t=>!t||!Array.isArray(t.members)||t.members.some(m=>typeof m?.petId!=='string')))
      return {pet:null,why:'Inventar-/Hutch-/Team-Zuordnung unvollständig',rows:[]};
    const plan=refresh(true);if(!plan?.ready)return {pet:null,why:plan?.message||'Pet- und Fähigkeitenkatalog fehlen',rows:[]};
    const rows=[];let selected=null,selectedSource=null;
    const hutch=s.inventory.storages.filter(st=>st?.decorId==='PetHutch');
    // Prefer surplus bag pets, then retrieve the weakest surplus Hutch pet.
    // Inventory and Hutch are *one* owned portfolio, not independent pools.
    const candidates=[...s.inventory.items.map(p=>({raw:p,source:'Inventar'})),
      ...hutch.flatMap(st=>arr(st.items).map(p=>({raw:p,source:'Pet Hutch'})))];
    const maxById=new Map(plan.owned.map(p=>[lc(p.id),p.metrics?.max??Number.POSITIVE_INFINITY]));
    candidates.sort((a,b)=>Number(a.source==='Pet Hutch')-Number(b.source==='Pet Hutch')||
      (maxById.get(lc(a.raw?.id))??Infinity)-(maxById.get(lc(b.raw?.id))??Infinity));
    const locations=new Map();
    for(const {raw} of candidates)if(raw?.itemType==='Pet'&&typeof raw.id==='string')
      locations.set(lc(raw.id),(locations.get(lc(raw.id))||0)+1);
    for(const {raw,source} of candidates){
      const p=raw?.itemType==='Pet'?{...raw,...(raw.data||{}),id:raw.id,itemType:raw.itemType}:null;if(!p||typeof p.id!=='string')continue;
      let why=protection(raw,s,plan)||protection(p,s,plan);
      if(!why&&raw.data?.id&&lc(raw.data.id)!==lc(raw.id))why='Widersprüchliche Pet-ID';
      if(!why&&(!Array.isArray(p.abilities)||!p.abilities.length||p.abilities.some(a=>typeof a!=='string')||
        !Number.isFinite(p.xp)||!Number.isFinite(p.targetScale)))why='Pet-Metadaten unvollständig';
      if(!why&&locations.get(lc(p.id))!==1)why='Pet-ID ist mehrfach vorhanden – Verkauf gesperrt';
      if(!why&&source==='Pet Hutch'&&s.inventory.items.length>=98)
        why='Inventar fast voll – kein Platz zum Herausnehmen';
      if(!why&&!p.sourceEggId)why='Herkunftsei fehlt – wird nicht geraten';
      if(!why&&!c.petSellEggs.includes(p.sourceEggId))why='Ei-Gruppe nicht freigegeben';
      const ledger=attempts(),attempt=ledger?.[(s.ownerKey||s.actor)+'|'+(source==='Pet Hutch'?'retrieve:':'sell:')+lc(p.id)];
      if(!why&&!ledger)why='Pet-Aktionsprotokoll beschädigt – Verkauf gesperrt';
      if(!why&&attempt&&validatingAttempt!==((s.ownerKey||s.actor)+'|'+(source==='Pet Hutch'?'retrieve:':'sell:')+lc(p.id))&&(attempt.state!=='rejected'||attempt.until>env.now()))
        why=attempt.state==='rejected'?'Serverablehnung – vorsichtige Wiederholung frühestens nach 30 Sekunden':'Pet-Aktion bereits versucht; Ergebnis abwarten, kein Duplikat';
      const d=plan.decisions.find(d=>lc(d.id)===lc(p.id));
      if(!why&&d?.kind!=='surplus')why=d?.reason||'Boostvergleich unklar';
      if(!why){
        const backups=arr(d?.replacements).length?d.replacements:[d?.replacement];
        if(!backups.length||backups.some(id=>!id||!plan.reserved.includes(lc(id))||
          !plan.owned.some(x=>lc(x.id)===lc(id))))
          why='Mindestens ein Ersatz-Pet gehört nicht mehr zum aktuellen Team-Bestand';
      }
      const row={id:p.id,name:p.name||p.petSpecies||'Pet',source,
        maxStrength:maxById.get(lc(p.id))??null,eligible:!why,reason:why||d.reason};rows.push(row);
      if(!why&&!selected){selected=p;selectedSource=source;}
    }
    return {pet:selected,source:selectedSource,
      why:selected?(selectedSource==='Pet Hutch'?'Zuerst sicher aus Pet Hutch holen · ':'')+rows.find(r=>r.id===selected.id).reason:
      rows.length?rows[0].reason:'Keine Pets im Inventar oder Pet Hutch',rows};
  }
  const SOLD_KEY='magic_garden_v16_pet_attempts';
  function attempts(){try{const v=JSON.parse(env.storage.getItem(SOLD_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
  function saveAttempts(v){try{env.storage.setItem(SOLD_KEY,JSON.stringify(v));return true;}catch{return false;}}
  async function send(command,options={}){
    const retrieving=command.type==='MoveItem'&&command.from==='PetHutch'&&
      command.to==='inventory'&&command.quantity===1&&typeof command.itemId==='string';
    const selling=command.type==='SellPet';
    if(command.type==='PhotographGhost'){
      if(typeof env.withPetLock!=='function')throw Error('Ghost-Aktion benötigt Browser-Tabsperre');
      return env.withPetLock(async()=>{
        const Factory=typeof createGhostCapture==='function'?createGhostCapture:require('./ghost-capture.js').createGhostCapture;
        const g=Factory(),p=g.propose(env.snapshot());
        if(!env.config().ghostCapture||!p.command||JSON.stringify(p.command)!==JSON.stringify(command))throw Error(p.why||'Ghost-Aktion nicht freigegeben');
        const key=(p.ownerKey||p.actor)+'|ghost:'+command.ghostInstanceId,records=attempts();
        if(!records||records[key])throw Error('Ghost-Instanz bereits versucht oder Protokoll unklar');
        const rateKey=(p.ownerKey||p.actor)+'|ghost-rate';
        if(records[rateKey]?.until>env.now()){const e=Error('Ghost-Rate-Limit: mindestens zehn Sekunden Abstand');e.notSent=true;throw e;}
        records[rateKey]={until:env.now()+10000};
        records[key]={state:'pending',until:Number.MAX_SAFE_INTEGER};
        if(!saveAttempts(records))throw Error('Ghost-Aktionsschutz nicht speicherbar');
        const reply=await actions.execute(command,{validate:s=>{
          const fresh=g.propose(s);
          return env.config().ghostCapture&&fresh.actor===p.actor&&fresh.generation===p.generation&&
            JSON.stringify(fresh.command)===JSON.stringify(command)&&(!options.validate||options.validate(s));
        }});
        if(!reply?.ok||!g.confirmed(p,env.snapshot()))throw Error('Ghost-Fang noch nicht im Server-State bestätigt');
        return reply;
      });
    }
    if(command.type==='MoveItem'&&!retrieving&&command.from==='PetHutch')
      throw Error('Nicht freigegebener Pet-Hutch-Transfer');
    const execute=async()=>{
      let pet=null,attemptKey=null,epoch=env.snapshot();
      if(retrieving||selling){
        const p=salePreview();
        if(p.pet?.id!==command.itemId||
           (retrieving&&p.source!=='Pet Hutch')||(selling&&p.source!=='Inventar'))
          throw Error('Pet-Aktion blockiert: '+p.why);
        pet=p.pet;attemptKey=(epoch.ownerKey||epoch.actor)+'|'+(retrieving?'retrieve:':'sell:')+lc(pet.id);
        const records=attempts();if(!records)throw Error('Pet-Aktionsprotokoll beschädigt – Verkauf gesperrt');
        const old=records[attemptKey];
        if(old&&(old.state!=='rejected'||old.until>env.now()))throw Error(retrieving?'Hutch-Entnahme noch unbestätigt; kein erneuter Versuch':
          'Pet-Verkauf noch unbestätigt; kein erneuter Versuch');
        records[attemptKey]={until:Number.MAX_SAFE_INTEGER,state:'pending',tries:(old?.tries||0)+1};
        if(!saveAttempts(records))throw Error('Pet-Aktionsschutz konnte nicht gespeichert werden');
      }
      try{
        const reply=await actions.execute(command,{validate:s=>{
          validatingAttempt=attemptKey;try{
          if(options.validate&&!options.validate(s))return false;
          if(pet){const check=salePreview();return check.pet?.id===pet.id&&
            check.source===(retrieving?'Pet Hutch':'Inventar');}
          return true;
          }finally{validatingAttempt=null;}
        }});
        if(pet){
          const now=env.snapshot();
          if(!now||now.actor!==epoch.actor||now.generation!==epoch.generation||now.ownerKey!==epoch.ownerKey)
            throw Error('Verbindung während Pet-Aktion geändert');
          const inBag=arr(now.inventory?.items).some(x=>lc(x.id)===lc(pet.id)&&x.itemType==='Pet');
          const inHutch=arr(now.inventory?.storages).some(st=>st.decorId==='PetHutch'&&
            arr(st.items).some(x=>lc(x.id)===lc(pet.id)));
          if(retrieving){
            // A command acknowledgement alone is not a transfer. Wait for
            // the exact ID to leave the Hutch and appear in our inventory.
            if(!inBag||inHutch)throw Error('Hutch-Entnahme noch nicht im eigenen Inventar bestätigt');
          }else if(builder.pets(now,env.catalogs()).some(p=>lc(p.id)===lc(pet.id))||!reply?.ok)
            throw Error('Verkauf noch nicht im eigenen Spielzustand bestätigt');
          const records=attempts();records[attemptKey]={until:Number.MAX_SAFE_INTEGER,state:'observed'};saveAttempts(records);
        }
        lastWork=env.now();
        return retrieving?{ok:true,observed:true}:reply;
       }catch(e){
        // Only an explicit server rejection proves that no action happened.
        // Timeouts and disconnects stay blocked indefinitely, including reloads.
        if(attemptKey&&e?.definite===true){
          const records=attempts(),r=records?.[attemptKey];
          if(r&&r.tries<3){r.until=env.now()+30000;r.state='rejected';saveAttempts(records);}
        }
        notice=e?.message||'Aktion fehlgeschlagen';throw e;
      }
    };
    if(retrieving||selling){
      if(typeof env.withPetLock!=='function')throw Error('Pet-Aktion benötigt die Browser-Tabsperre');
      return env.withPetLock(execute);
    }
    return execute();
  }
  async function tick(){
    const c=env.config(),s=env.snapshot();if(!s||!env.running())return false;
    refresh();
    if(await actions.resumeReturn())return true;
    if(queued){
      const q=queued;queued=null;const team=registry.list(s).find(t=>t.key===q&&!t.stale&&!t.paused);
      if(team){const saved=await registry.save(s,q);if(saved.ok){await env.rawSend({type:'ApplyPetTeam',teamId:saved.id});notice='Team eingesetzt';}else notice=saved.reason;}return true;
    }
    if(c.teamBuilder&&cached?.ready&&env.now()-lastSync>=2000){
      lastSync=env.now();const worked=await registry.syncOne(s);if(worked)return true;
    }
    if(c.autoTeams&&c.teamBuilder&&c.idleTeamKey&&env.now()-lastWork>=15000){
      const t=registry.list(s).find(t=>t.key===c.idleTeamKey&&!t.stale&&!t.paused&&t.mode==='afk');
      if(t&&actions.active(s).map(lc).sort().join('|')!==t.petIds.map(lc).sort().join('|')){
        lastWork=env.now();const r=await registry.save(s,t.key);
        if(r.ok){await env.rawSend({type:'ApplyPetTeam',teamId:r.id});notice='AFK-Team eingesetzt';}else notice=r.reason;
        return true;
      }
    }return false;
  }
  function state(){const s=env.snapshot(),p=refresh();return {
    ready:!!p?.ready,why:p?.message||'Eigene Spieldaten fehlen',plans:s?registry.list(s):[],
    proposals:p?.plans||[],decisions:(p?.decisions||[]).map(d=>({...d,name:p.owned.find(x=>x.id===d.id)?.name||p.owned.find(x=>x.id===d.id)?.petSpecies||'Pet'})),notice,action:actions.diagnostics()};}
  return {send,tick,refresh,state,salePreview,registry,builder,
    requestTeam:key=>{const s=env.snapshot();if(!s||!registry.list(s).some(t=>t.key===key&&!t.stale))return false;queued=key;return true;}};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createV16Controller};
