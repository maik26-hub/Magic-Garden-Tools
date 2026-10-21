/* Native build 1695: QuinoaCanvas stores the live engine in
 * quinoaDevEngineAtom unconditionally (the name does not enable dev tools).
 * Read only the renderer's framing query; never call reveal/confirmPhoto. */
function readNativeGhostState(page) {
  const store=page?.__jotaiStore,cache=page?.jotaiAtomCache;
  const atoms=cache instanceof Map?cache:cache?.cache;
  if(typeof store?.get!=='function'||!(atoms instanceof Map))return null;
  const values=new Map(),wanted=new Set(['dayNightStageAtom','isHoldingCameraAtom','cameraTargetAtom','ghostCatchesAtom','quinoaDevEngineAtom']);
  try{
    for(const atom of atoms.values()){
      const label=String(atom?.debugLabel||'').split('/').pop();
      if(!wanted.has(label))continue;
      if(values.has(label))return null;
      values.set(label,store.get(atom));
    }
  }catch{return null;}
  const result={stage:values.get('dayNightStageAtom'),holding:values.get('isHoldingCameraAtom'),
    target:values.get('cameraTargetAtom'),catches:values.get('ghostCatchesAtom'),instances:[],
    why:'Nativer Ghost-Renderer noch nicht verfügbar'};
  if(result.holding!==true||result.stage!=='night')return result;
  try{
    const scope=values.get('quinoaDevEngineAtom')?.page?.rendererScope,context=scope?.context;
    if(scope?.isActive!==true||scope.isWorldBuilt!==true||scope.isWorldDrawing!==true||
      scope.lifetime?.signal?.aborted||typeof scope.getSystem!=='function'||!context)return result;
    const ghost=scope.getSystem('ghost'),camera=scope.getSystem('cameraOverlay');
    if(typeof ghost?.framedGhosts!=='function'||typeof camera?.viewfinderRect!=='function')return result;
    const screen=camera.app?.screen,transform=context.cameraTransform,top=context.safeAreaInsets?.top;
    if(!Number.isFinite(screen?.width)||screen.width<=0||!Number.isFinite(screen?.height)||screen.height<=0||
      !Number.isFinite(top)||!Number.isFinite(transform?.scale)||transform.scale<=0||
      !Number.isFinite(transform.xPixels)||!Number.isFinite(transform.yPixels)||
      !Number.isFinite(context.serverTimeMs)||context.serverTimeMs<=0||typeof context.room?.localPlayerId!=='string')return result;
    const frame=camera.viewfinderRect(screen.width,screen.height,top);
    if(!frame||!['x','y','width','height'].every(k=>Number.isFinite(frame[k]))||frame.width<=0||frame.height<=0)return result;
    const selected=ghost.framedGhosts(transform,frame);
    result.source='native-renderer';result.actor=context.room.localPlayerId;result.roomId=scope.displayedRoomId;
    result.serverTimeMs=context.serverTimeMs;
    result.why=selected?.kind==='tooFar'?'Ghost außerhalb der Kamera-Reichweite':'Kein fangbereiter Ghost im Kamerarahmen';
    if(selected?.kind!=='ready'||!Array.isArray(selected.ghosts))return result;
    for(const row of selected.ghosts){
      const p=row?.ghost;
      if(!['catch','join'].includes(row?.kind)||!Number.isInteger(p?.index)||p.index<0||p.index>2||
        typeof p.instanceId!=='string'||p.instanceId.length<1||p.instanceId.length>64)return {...result,instances:[],why:'Native Ghost-Zuordnung unklar'};
      result.instances.push({ghostIndex:p.index,ghostInstanceId:p.instanceId,visible:true});
    }
    return result;
  }catch{return {...result,instances:[],why:'Native Ghost-Abfrage fehlgeschlagen – kein Foto'};}
}
function createGhostCapture(){
  const validId=v=>typeof v==='string'&&v.length>0&&v.length<200;
  function propose(s){
    const no=why=>({command:null,why}),g=s?.ghost;
    if(!g)return no('Ghost-Spielzustand nicht verfügbar');
    if(g.source==='native-renderer'&&(typeof g.roomId!=='string'||!g.roomId||g.actor!==s.actor||g.roomId!==s.roomId||!Number.isFinite(s.serverNow)||
      Math.abs(s.serverNow-g.serverTimeMs)>2000))return no('Ghost-Renderer gehört nicht zum aktuellen frischen Spielzustand');
    if(g.stage!=='night')return no('Warte auf bestätigte Nacht');
    if(g.holding!==true)return no('Kamera muss gehalten werden');
    if(!Number.isFinite(g.target?.x)||!Number.isFinite(g.target?.y))return no('Kameraziel fehlt');
    if(!s.game?.ghostCatches||typeof s.game.ghostCatches!=='object'||Array.isArray(s.game.ghostCatches))return no('Server-Fangdaten fehlen');
    const rows=Array.isArray(g.instances)?g.instances:[];
    const p=rows.find(p=>Number.isInteger(p?.ghostIndex)&&p.ghostIndex>=0&&validId(p.ghostInstanceId)&&p.visible===true);
    if(!p)return no(g.why||'Aktuelle Ghost-Instanz/Sichtbarkeit nicht verfügbar – kein Foto');
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
