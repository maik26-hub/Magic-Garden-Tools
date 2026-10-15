'use strict';
module.exports=function applyV16(src,tooltipSource){
  function rep(a,b,label){if(src.split(a).length!==2)throw Error('V16 '+label+': anchor not unique');src=src.replace(a,b);}
  rep('      let timeout;\n      const cancel',`      let timeout, observeTimer, ack=null;
      const observed=['SellPet','SavePetTeam','ApplyPetTeam'].includes(command.type);
      const actorAtSend=bridge.actor, revisionAtSend=bridge.revision||0;
      function verifyState(){
        if(!observed||finished)return false;
        if(bridge.socket!==ws||bridge.generation!==generation||bridge.actor!==actorAtSend){cancel();return false;}
        if((bridge.revision||0)<=revisionAtSend)return false;
        const own=bridge.own;
        if(!own||!Array.isArray(own.petSlots)||!Array.isArray(own.petTeams)||!Array.isArray(bridge.inventory?.items)||!Array.isArray(bridge.inventory?.storages))return false;
        const norm=v=>String(v||'').toLowerCase();
        const canon=ids=>ids.map(norm).sort().join('|');
        let matches=false;
        if(command.type==='SellPet'){
          const all=[...own.petSlots.map(p=>p.slot||p),...bridge.inventory.items,...bridge.inventory.storages.flatMap(s=>Array.isArray(s.items)?s.items:[])];
          matches=!all.some(p=>norm(p?.id)===norm(command.itemId));
        }else if(command.type==='SavePetTeam'){
          const team=own.petTeams.find(t=>t?.id===command.teamId);
          matches=!!team&&canon((team.members||[]).map(m=>m.petId))===canon(command.petIds);
        }else{
          const team=own.petTeams.find(t=>t?.id===command.teamId);
          matches=!!team&&canon((team.members||[]).map(m=>m.petId))===canon(own.petSlots.map(p=>(p.slot||p).id));
        }
        if(matches){finish(null,{...(ack||{}),ok:true,observed:true,acknowledged:!!ack,commandType:command.type});return true;}
        return false;
      }
      const cancel`,'state-driven observer');
  rep('        clearTimeout(timeout);\n        ws.removeEventListener', '        clearTimeout(timeout);\n        clearTimeout(observeTimer);\n        ws.removeEventListener','cancel observer');
  rep('          error.code = code;', '          error.definite = true;\n          error.code = code;', 'known rejection');
  rep('        finish(null, msg);\n      }', '        if(observed){ack=msg;verifyState();}else finish(null, msg);\n      }','wait beyond ack');
  rep('      timeout = setTimeout(() => finish(new Error("Server-Timeout")), cfg.commandTimeoutMs);',
    '      if(observed)observeTimer=setInterval(verifyState,100);\n      timeout = setTimeout(() => {if(!verifyState())finish(new Error(observed?command.type+": Zustand noch nicht bestätigt":"Server-Timeout"));}, cfg.commandTimeoutMs);','finite observer');
  rep('    if (bridge.garden && bridge.inventory) bridge.lastSnapshotAt = Date.now();','    if (bridge.garden && bridge.inventory) bridge.lastSnapshotAt = Date.now();\n    bridge.revision=(bridge.revision||0)+1;','state revision');
  rep('    const result = await sendCommand({ type: "SellAllCrops" });',
      '    const result = await automation.dispatch({ type: "SellAllCrops" },{validate:()=>automation.saleAllowed()});','sale team transaction');
  rep('    storage: localStorage,\n    now: () => Date.now(),',
    `    storage: localStorage,
    uuid: () => crypto.randomUUID(),
    withPetLock: fn => typeof navigator.locks?.request==='function'
      ? navigator.locks.request('magic-garden-v16-pet-transaction',{ifAvailable:true},lock=>{if(!lock)throw Error('Pet-Aktion läuft in anderem Tab');return fn();})
      : Promise.reject(new Error('Browser-Tabsperre fehlt – kein automatischer Pet-Verkauf')),
    now: () => Date.now(),`,'pet transaction lock');
  // Data schema binds actor to account where the native player map provides it.
  rep('heldId:bridge.heldId,selected:[...selectedSlots()]',
    'ownerKey:bridge.lastFullState?.data?.players?.find(p=>p.id===bridge.playerId)?.databaseUserId||bridge.actor,heldId:bridge.heldId,selected:[...selectedSlots()]','owner binding');
  rep('    document.body.appendChild(panel);', '    document.body.appendChild(panel);\n    installInfoTooltips(document,panel);','tooltip install');
  rep('  let automation = null;',tooltipSource+'\n  let automation = null;','tooltip source');
  // Keep user's field/purchase preferences, but don't start an untested update
  // or inherit irreversible V15 action toggles silently on its first launch.
  rep('  if (readValue(sessionStorage, KEYS.resume) === "1") {',
    `  const firstV16=readValue(localStorage,'magic_garden_v16_first_test')!=='1';
  if(firstV16){
    storeValue(localStorage,'magic_garden_v16_first_test','1');
    storeValue(sessionStorage,KEYS.resume,'0');
    automation.configure({enabled:true,petSell:false,teamBuilder:false,autoTeams:false,ariesSync:false});
  }
  if (!firstV16 && readValue(sessionStorage, KEYS.resume) === "1") {`,'safe first test');
  rep('      checkbox("Mutierte Ernten schützen (Standalone)", prefs.protectMutations,\n        v => { prefs.protectMutations = v; }),\n      checkbox("Pflanzen mit Größe 100 schützen", prefs.protectMaxSize,\n        v => { prefs.protectMaxSize = v; })',
      '      checkbox("Pflanzenschutz", prefs.protectMutations && prefs.protectMaxSize, v => { prefs.protectMutations = v; prefs.protectMaxSize = v; })','central crop shield');
  rep('  function findReadyCrop() {','  function findReadyCrop() {\n    if(automation?.getConfig().harvest===false)return null;','optional harvesting');
  return src;
};
