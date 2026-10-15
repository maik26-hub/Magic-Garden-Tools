/* Persistent owned team registry; never identifies/manages a team by name alone.
 * Native SavePetTeam confirmations are state-echo driven. UUIDs are persisted
 * before sending, so reconnects cannot create a new duplicate for each retry.
 */
function createTeamRegistry(env) {
  'use strict';
  const KEY='magic_garden_v16_effect_teams';
  const arr=x=>Array.isArray(x)?x:[], id=x=>typeof x==='string'&&x.length>0&&x.length<=128;
  const canon=x=>arr(x).filter(id).map(x=>x.toLowerCase()).sort().join('|');
  const nativeMembers=t=>arr(t?.members).map(m=>m?.petId).filter(id);
  let db;
  try{db=JSON.parse(env.storage.getItem(KEY)||'null');}catch{}
  if(!db||db.version!==1||!db.owners||typeof db.owners!=='object')db={version:1,owners:{}};
  let failure='',locked=false,activeOwner=null;
  function persist(){try{env.storage.setItem(KEY,JSON.stringify(db));failure='';return true;}catch{failure='Teams konnten nicht gespeichert werden';return false;}}
  function owner(s){return id(s?.ownerKey)?s.ownerKey:id(s?.actor)?s.actor:null;}
  function section(s){const name=owner(s);if(!name)return null;activeOwner=name;
    if(!Object.hasOwn(db.owners,name))Object.defineProperty(db.owners,name,{value:{records:{}},writable:true,enumerable:true,configurable:true});
    const data=db.owners[name];if(!data||typeof data.records!=='object'||!data.records)return null;return data;
  }
  function eligible(s,ids){
    const list=[...arr(s?.own?.petSlots).map(p=>p?.slot||p),...arr(s?.inventory?.items),...arr(s?.inventory?.storages).flatMap(x=>arr(x?.items))];
    const owned=new Set(list.filter(p=>p?.petSpecies||p?.data?.petSpecies).map(p=>String(p.id).toLowerCase()));
    return ids.length>0&&ids.length<=3&&new Set(ids.map(x=>x.toLowerCase())).size===ids.length&&ids.every(x=>owned.has(x.toLowerCase()));
  }
  function nameFor(plan){
    const code=plan.mode==='afk'?'A ':'E ';
    // The stable ID, not this shortened display name, determines ownership.
    return Array.from(code+plan.name).slice(0,16).join('');
  }
  function reconcile(s){
    const data=section(s);if(!data||!Array.isArray(s?.own?.petTeams))return;
    for(const rec of Object.values(data.records)){
      if(!rec||!id(rec.id)||!Array.isArray(rec.petIds))continue;
      const native=s.own.petTeams.find(t=>t?.id===rec.id);
      if(!native){rec.saved=false;continue;}
      const actual=nativeMembers(native);
      if(rec.pending&&canon(actual)===canon(rec.pending.petIds)){
        rec.confirmed=actual;rec.pending=null;rec.saved=true;rec.error='';rec.lastName=native.name;
      }else if(canon(actual)===canon(rec.confirmed||[])){
        rec.saved=true;
      }else if(!rec.confirmed&&!rec.pending){
        // Only adopt ID created by us, still match desired membership.
        if(canon(actual)===canon(rec.petIds)){rec.confirmed=actual;rec.saved=true;rec.lastName=native.name;}
        else {rec.paused=true;rec.error='Manuell geändertes Team – wird nicht überschrieben';}
      }else if(!rec.pending){rec.paused=true;rec.error='Manuell geändertes Team – wird nicht überschrieben';}
    }
  }
  function update(s,plans){
    const data=section(s);if(!data)return false;reconcile(s);let changed=false;
    const keys=new Set();
    for(const p of plans){
      if(!id(p.key)&&!(typeof p.key==='string'&&p.key.length<500))continue;
      if(!eligible(s,p.petIds))continue;
      keys.add(p.key);let r=data.records[p.key];
      if(!r){r={key:p.key,id:env.uuid(),name:nameFor(p),confirmed:null,pending:null,paused:false};data.records[p.key]=r;changed=true;}
      if(canon(r.petIds)!==canon(p.petIds)||r.stale){r.petIds=p.petIds.slice();r.stale=false;changed=true;}
      r.plan={...p};
    }
    for(const r of Object.values(data.records))if(r.key!=='@return'&&!keys.has(r.key)&&!r.stale){r.stale=true;changed=true;}
    return !changed||persist();
  }
  async function save(s,key,{force=false}={}){
    if(locked)return {ok:false,reason:'Teamspeicherung läuft'};
    const data=section(s),r=data?.records[key];
    if(!r||r.stale||!eligible(s,r.petIds))return {ok:false,reason:'Team-Pets fehlen'};
    reconcile(s);
    if(r.paused)return {ok:false,reason:r.error};
    const current=arr(s.own.petTeams).find(t=>t?.id===r.id);
    if(current&&canon(nativeMembers(current))===canon(r.petIds))return {ok:true,id:r.id,unchanged:true};
    if(r.pending)return {ok:false,reason:'Teamspeicherung noch nicht vom Spiel bestätigt'};
    if(!force&&r.retryAt>env.now())return {ok:false,reason:r.error||'Teamspeicherung pausiert'};
    const intent={petIds:r.petIds.slice(),actor:s.actor,generation:s.generation,at:env.now()};
    r.pending=intent;r.error='Speichern läuft';if(!persist()){r.pending=null;return {ok:false,reason:failure};}
    locked=true;
    try{
      const reply=await env.send({type:'SavePetTeam',teamId:r.id,isCreate:!current,name:current?.name||r.name,petIds:intent.petIds});
      const fresh=env.snapshot();
      if(!fresh||owner(fresh)!==owner(s)||fresh.generation!==s.generation)throw new Error('Verbindung während Teamspeicherung geändert');
      const echo=arr(fresh.own.petTeams).find(t=>t?.id===r.id);
      if(reply?.ok!==true||canon(nativeMembers(echo))!==canon(intent.petIds))throw new Error('Teamspeicherung noch nicht im Spiel sichtbar');
      r.confirmed=intent.petIds;r.pending=null;r.saved=true;r.error='';r.retryAt=0;persist();return {ok:true,id:r.id};
    }catch(e){
      r.error=String(e?.message||e).slice(0,150);
      // A definite server refusal may retry later with the SAME UUID. An
      // ambiguous outcome keeps its pending reservation across F5.
      if(e?.definite===true||e?.code==='rejected'){r.pending=null;r.retryAt=env.now()+60000;}
      persist();return {ok:false,reason:r.error};
    }finally{locked=false;}
  }
  async function syncOne(s){
    reconcile(s);const data=section(s);if(!data)return false;
    for(const r of Object.values(data.records)){
      if(r.key==='@return'||r.stale||r.paused||r.pending||r.retryAt>env.now())continue;
      const t=arr(s.own.petTeams).find(t=>t?.id===r.id);
      if(t&&canon(nativeMembers(t))===canon(r.petIds))continue;
      await save(s,r.key);return true;
    }return false;
  }
  async function snapshotTeam(s,petIds){
    const t=arr(s?.own?.petTeams).find(t=>canon(nativeMembers(t))===canon(petIds));
    if(t)return {ok:true,id:t.id};
    if(!eligible(s,petIds))return {ok:false,reason:'Vorheriges Team nicht sicher speicherbar'};
    const data=section(s);let r=data.records['@return'];
    if(!r)r=data.records['@return']={key:'@return',id:env.uuid(),name:'AF Rückkehr',confirmed:null};
    r.petIds=petIds.slice();r.stale=false;if(!persist())return {ok:false,reason:failure};
    return save(s,'@return');
  }
  function list(s){reconcile(s);const data=section(s);return data?Object.values(data.records).filter(r=>r.key!=='@return').map(r=>({
    ...r.plan,key:r.key,id:r.id,petIds:arr(r.petIds).slice(),stale:!!r.stale,paused:!!r.paused,
    saved:!!r.saved&&canon(r.petIds)===canon(r.confirmed),error:r.error||'',pending:!!r.pending})):[];}
  function protectedIds(s){return [...new Set(list(s).filter(r=>!r.stale||r.pending).flatMap(r=>r.petIds.map(x=>x.toLowerCase())))];}
  return {update,save,syncOne,list,protectedIds,snapshotTeam,diagnostics:()=>({error:failure,busy:locked,owner:activeOwner})};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createTeamRegistry};
