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
    if(arr(s.inventory.storages).some(st=>arr(st.items).some(isPet)))return 'Pet liegt im Lager';
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
  function salePreview(){
    const c=env.config(),s=env.snapshot();
    if(!s)return {pet:null,why:'Eigene Spieldaten fehlen',rows:[]};
    if(!c.petSell)return {pet:null,why:'Pet Auto-Sell ist ausgeschaltet',rows:[]};
    if(!arr(c.petSellEggs).length)return {pet:null,why:'Keine Ei-Gruppe zum Pet-Verkauf ausgewählt',rows:[]};
    if(!Array.isArray(s.own.petSlots)||!Array.isArray(s.own.petTeams)||!Array.isArray(s.inventory.storages))
      return {pet:null,why:'Aktive Pets, Teams oder Lagerdaten fehlen',rows:[]};
    const plan=refresh(true);if(!plan?.ready)return {pet:null,why:plan?.message||'Pet- und Fähigkeitenkatalog fehlen',rows:[]};
    const rows=[];let selected=null;
    for(const raw of s.inventory.items){
      const p=raw?.itemType==='Pet'?{...raw,...(raw.data||{})}:null;if(!p||typeof p.id!=='string')continue;
      let why=protection(p,s,plan);
      if(!why&&!p.sourceEggId)why='Herkunftsei fehlt – wird nicht geraten';
      if(!why&&!c.petSellEggs.includes(p.sourceEggId))why='Ei-Gruppe nicht freigegeben';
      const d=plan.decisions.find(d=>lc(d.id)===lc(p.id));
      if(!why&&d?.kind!=='surplus')why=d?.reason||'Boostvergleich unklar';
      if(!why&&(!plan.reserved.includes(lc(d.replacement))||!plan.owned.some(x=>lc(x.id)===lc(d.replacement))))why='Besseres Ersatz-Pet nicht mehr reserviert';
      const row={id:p.id,name:p.name||p.petSpecies||'Pet',eligible:!why,reason:why||d.reason};rows.push(row);
      if(!why&&!selected)selected=p;
    }
    return {pet:selected,why:selected?rows.find(r=>r.id===selected.id).reason:
      rows.length?rows[0].reason:'Keine Pets im Inventar',rows};
  }
  const SOLD_KEY='magic_garden_v16_pet_attempts';
  function attempts(){try{const v=JSON.parse(env.storage.getItem(SOLD_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}}
  function saveAttempts(v){try{env.storage.setItem(SOLD_KEY,JSON.stringify(v));return true;}catch{return false;}}
  async function send(command,options={}){
    const execute=async()=>{
      let pet=null,attemptKey=null,epoch=env.snapshot();
      if(command.type==='SellPet'){
        const p=salePreview();
        if(p.pet?.id!==command.itemId)throw Error('Pet-Verkauf blockiert: '+p.why);
        pet=p.pet;attemptKey=(epoch.ownerKey||epoch.actor)+'|'+lc(pet.id);
        const records=attempts(),old=records[attemptKey];
        if(old&&old.until>env.now())throw Error('Pet-Verkauf noch unbestätigt; kein erneuter Versuch');
        records[attemptKey]={until:env.now()+600000,state:'pending'};
        if(!saveAttempts(records))throw Error('Verkaufsschutz konnte nicht gespeichert werden');
      }
      try{
        const reply=await actions.execute(command,{validate:s=>{
          if(options.validate&&!options.validate(s))return false;
          if(pet)return salePreview().pet?.id===pet.id;
          return true;
        }});
        if(pet){
          const now=env.snapshot();
          if(!now||now.actor!==epoch.actor||now.generation!==epoch.generation||
             builder.pets(now,env.catalogs()).some(p=>lc(p.id)===lc(pet.id))||!reply?.ok)
            throw Error('Verkauf noch nicht im eigenen Spielzustand bestätigt');
          const records=attempts();records[attemptKey]={until:env.now()+86400000,state:'observed'};saveAttempts(records);
        }
        lastWork=env.now();return reply;
      }catch(e){notice=e?.message||'Aktion fehlgeschlagen';throw e;}
    };
    if(command.type==='SellPet'){
      if(typeof env.withPetLock!=='function')throw Error('Pet-Verkauf benötigt die Browser-Tabsperre');
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
