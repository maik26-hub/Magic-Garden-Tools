/* Read live native atoms only. An old command or catch timestamp is never an
 * instance source. Unknown native schemas deliberately produce no command. */
function readNativeGhostState(page) {
  const store=page?.__jotaiStore,cache=page?.jotaiAtomCache;
  const atoms=cache instanceof Map?cache:cache?.cache;
  if(typeof store?.get!=='function'||!(atoms instanceof Map))return null;
  const values=new Map();
  try {
    for(const atom of atoms.values()){
      const label=String(atom?.debugLabel||'').split('/').pop();
      if(['dayNightStageAtom','isHoldingCameraAtom','cameraTargetAtom','ghostCatchesAtom'].includes(label)||/ghost/i.test(label)){
        if(values.has(label))return null; // ambiguous labels are not authoritative
        values.set(label,store.get(atom));
      }
    }
  }catch{return null;}
  const instances=[];
  // Accept only explicit instance + visibility data in a current ghost atom.
  // Do not derive IDs from ghostCatches, route time, night number or indexes.
  for(const [label,value]of values){
    if(!/ghost/i.test(label)||label==='ghostCatchesAtom')continue;
    for(const row of Array.isArray(value)?value: value&&typeof value==='object'?[value,...Object.values(value)]:[]){
      if(row&&Number.isInteger(row.ghostIndex)&&typeof row.ghostInstanceId==='string'&&row.visible===true)
        instances.push({ghostIndex:row.ghostIndex,ghostInstanceId:row.ghostInstanceId,visible:true});
    }
  }
  return {stage:values.get('dayNightStageAtom'),holding:values.get('isHoldingCameraAtom'),
    target:values.get('cameraTargetAtom'),catches:values.get('ghostCatchesAtom'),instances};
}
function createGhostCapture(){
  const validId=v=>typeof v==='string'&&v.length>0&&v.length<200;
  function propose(s){
    const no=why=>({command:null,why}),g=s?.ghost;
    if(!g)return no('Ghost-Spielzustand nicht verfügbar');
    if(g.stage!=='night')return no('Warte auf bestätigte Nacht');
    if(g.holding!==true)return no('Kamera muss gehalten werden');
    if(!Number.isFinite(g.target?.x)||!Number.isFinite(g.target?.y))return no('Kameraziel fehlt');
    if(!s.game?.ghostCatches||typeof s.game.ghostCatches!=='object'||Array.isArray(s.game.ghostCatches))return no('Server-Fangdaten fehlen');
    const rows=Array.isArray(g.instances)?g.instances:[];
    const p=rows.find(p=>Number.isInteger(p?.ghostIndex)&&p.ghostIndex>=0&&validId(p.ghostInstanceId)&&p.visible===true);
    if(!p)return no('Aktuelle Ghost-Instanz/Sichtbarkeit nicht verfügbar – kein Foto');
    if(rows.filter(x=>x?.ghostIndex===p.ghostIndex).length!==1)return no('Ghost-Zuordnung mehrdeutig');
    return {command:{type:'PhotographGhost',ghostIndex:p.ghostIndex,ghostInstanceId:p.ghostInstanceId},
      actor:s.actor,ownerKey:s.ownerKey,generation:s.generation,before:s.game.ghostCatches[p.ghostIndex]?.lastCaughtAtMs??null,
      why:'Sichtbare aktuelle Ghost-Instanz bereit'};
  }
  function confirmed(p,s){
    if(!s||s.actor!==p.actor||s.generation!==p.generation||s.ownerKey!==p.ownerKey)return false;
    const c=s.game?.ghostCatches?.[p.command.ghostIndex];
    return Number.isFinite(c?.lastCaughtAtMs)&&(p.before===null||c.lastCaughtAtMs>p.before)&&
      Array.isArray(c.photographerIds)&&c.photographerIds.some(id=>id===p.actor||!!p.ownerKey&&id===p.ownerKey);
  }
  return {propose,confirmed};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createGhostCapture,readNativeGhostState};
