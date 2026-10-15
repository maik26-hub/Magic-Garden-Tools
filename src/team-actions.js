/* Serial, state-confirmed temporary team changes. Never send a farming action
 * before the selected team's actual members are visible in the own game state.
 */
function createTeamActions(env){
  'use strict';
  let busy=false,last='',pendingReturn=null;
  const canon=ids=>ids.map(x=>String(x).toLowerCase()).sort().join('|');
  const active=s=>(Array.isArray(s?.own?.petSlots)?s.own.petSlots:[]).map(p=>(p.slot||p).id).filter(x=>typeof x==='string');
  const same=(a,b)=>a&&b&&a.actor===b.actor&&a.generation===b.generation;
  async function apply(id,ids,start){
    if(!same(start,env.snapshot()))throw Error('Verbindung geändert – Teamwechsel abgebrochen');
    const r=await env.sendRaw({type:'ApplyPetTeam',teamId:id});
    if(!r?.ok||!same(start,env.snapshot())||canon(active(env.snapshot()))!==canon(ids))throw Error('Teamwechsel nicht bestätigt');
  }
  async function execute(command,options={}){
    if(busy)throw Error('Teamaktion läuft bereits');
    busy=true;let start=null,before=[],chosen=null,returnId=null,switched=false;
    try{
      if(!env.running())throw Error('AutoFarm gestoppt');
      start=env.snapshot();if(!start)throw Error('Eigene Spieldaten fehlen');
      before=active(start);chosen=env.choose(command,start);
      if(chosen&&canon(chosen.petIds)!==canon(before)){
        // Cannot safely restore an empty team with ApplyPetTeam; leave it alone.
        if(!before.length)throw Error('Kein aktives Rückkehr-Team – zuerst eigene Pets einsetzen');
        const restore=await env.registry.snapshotTeam(start,before);
        if(!restore.ok)throw Error(restore.reason);
        returnId=restore.id;
        const stored=await env.registry.save(env.snapshot(),chosen.key);
        if(!stored.ok)throw Error(stored.reason);
        if(!env.running()||!same(start,env.snapshot()))throw Error('Aktion vor Teamwechsel abgebrochen');
        if(canon(active(env.snapshot()))!==canon(before))throw Error('Team wurde manuell geändert');
        await apply(stored.id,chosen.petIds,start);switched=true;
      }
      if(!env.running()||!same(start,env.snapshot()))throw Error('Aktion gestoppt oder Verbindung geändert');
      if(switched&&canon(active(env.snapshot()))!==canon(chosen.petIds))throw Error('Aktives Team hat sich geändert');
      if(options.validate&&!options.validate(env.snapshot()))throw Error('Aktion nach Teamwechsel nicht mehr freigegeben');
      const result=await env.sendRaw(command);last=result?.ok?'Aktion bestätigt':'Aktion unbestätigt';return result;
    }finally{
      if(switched&&same(start,env.snapshot())&&canon(active(env.snapshot()))===canon(chosen.petIds)){
        if(env.running()){
          try{await apply(returnId,before,start);pendingReturn=null;}
          catch{pendingReturn={id:returnId,petIds:before,expected:chosen.petIds,actor:start.actor,generation:start.generation};last='Rückkehr-Team noch nicht bestätigt';}
        }else {pendingReturn={id:returnId,petIds:before,expected:chosen.petIds,actor:start.actor,generation:start.generation};last='Gestoppt – Rückkehr beim nächsten Start';}
      }
      busy=false;
    }
  }
  async function resumeReturn(){
    if(!pendingReturn||busy||!env.running())return false;
    const s=env.snapshot(),p=pendingReturn;
    if(!s||p.actor!==s.actor||p.generation!==s.generation||canon(active(s))!==canon(p.expected)){pendingReturn=null;return false;}
    busy=true;try{await apply(p.id,p.petIds,s);pendingReturn=null;last='Vorheriges Team wiederhergestellt';return true;}
    finally{busy=false;}
  }
  return {execute,resumeReturn,diagnostics:()=>({busy,last,pendingReturn:!!pendingReturn}),active};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createTeamActions};
