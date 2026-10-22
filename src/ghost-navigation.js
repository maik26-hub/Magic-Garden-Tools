/* Build 1695's normal player pathfinder is used at its default walking speed.
 * No PlayerPosition packets, teleports, camera atoms or native shutter writes. */
function readNativeGhostNavigation(page){
  try{
    const store=page?.__jotaiStore,cache=page?.jotaiAtomCache,atoms=cache instanceof Map?cache:cache?.cache;
    if(typeof store?.get!=='function'||!(atoms instanceof Map))return null;
    const values=new Map(),wanted=new Set(['quinoaDevEngineAtom','dayNightStageAtom','isHoldingCameraAtom','cameraModeAtom','anyModalOpenAtom']);
    for(const atom of atoms.values()){
      const label=String(atom?.debugLabel||'').split('/').pop();if(!wanted.has(label))continue;
      if(values.has(label))return null;values.set(label,store.get(atom));
    }
    const engine=values.get('quinoaDevEngineAtom'),scope=engine?.page?.rendererScope,player=engine?.page?.playerViews;
    if(!scope||scope.isActive!==true||scope.isWorldBuilt!==true||scope.isWorldDrawing!==true||
      scope.lifetime?.signal?.aborted||player?.isActive!==true||player.lifetime?.signal?.aborted||
      engine.page.playerViewsReady!==true||typeof scope.getSystem!=='function'||typeof player.getSystem!=='function')return null;
    const tap=player.getSystem('tapToMove'),ghost=scope.getSystem('ghost'),context=scope.context;
    if(tap?.isActive!==true||typeof tap.startPathTo!=='function'||typeof tap.cancelPath!=='function'||
      typeof tap.getReachableMap!=='function'||!Array.isArray(ghost?.ghosts)||!context)return null;
    const targets=ghost.ghosts.filter(p=>p?.out===true&&Number.isInteger(p.index)&&p.index>=0&&p.index<=2&&
      typeof p.instanceId==='string'&&p.instanceId.length>0&&p.instanceId.length<=64&&
      Number.isFinite(p.tile?.x)&&Number.isFinite(p.tile?.y)).map(p=>({ghostIndex:p.index,ghostInstanceId:p.instanceId,x:p.tile.x,y:p.tile.y}));
    return {actor:context.room?.localPlayerId,roomId:scope.displayedRoomId,serverTimeMs:context.serverTimeMs,
      position:context.room?.localPlayerPosition,stage:values.get('dayNightStageAtom'),holding:values.get('isHoldingCameraAtom'),
      mode:values.get('cameraModeAtom'),blocked:values.get('anyModalOpenAtom')!==false,tap,targets};
  }catch{return null;}
}
function createGhostNavigator(env){
  let notice='Aus',owned=null,revision=0,pauseUntil=0;const visits=new Map();
  const nights=new Set(['sunset','midnight','sunrise','night']);
  const now=()=>env.now(),wait=env.wait||(()=>new Promise(resolve=>setTimeout(resolve,200)));
  function cancelOwned(){
    const p=owned;owned=null;
    if(p&&p.tap.onWalkFinished===p.finish)p.tap.cancelPath('interrupted');
  }
  function stop(){revision++;cancelOwned();notice='Ghost-Navigation gestoppt';}
  function active(token){const c=env.config();return token===revision&&env.running()&&c.enabled&&c.ghostCapture&&c.ghostNavigate;}
  function current(s,r){return !!s&&!!r&&typeof s.roomId==='string'&&!!s.roomId&&r.actor===s.actor&&r.roomId===s.roomId&&
    Number.isFinite(s.serverNow)&&Number.isFinite(r.serverTimeMs)&&Math.abs(s.serverNow-r.serverTimeMs)<=2000&&
    nights.has(r.stage)&&r.mode==='player'&&!r.blocked&&Number.isFinite(r.position?.x)&&Number.isFinite(r.position?.y);}
  function destination(r,target,visited){
    const tap=r.tap,map=tap.map;
    if(!Number.isInteger(map?.cols)||!Number.isInteger(map.rows)||map.cols<1||map.rows<1||map.cols*map.rows>1000000)return null;
    const reachable=tap.getReachableMap(r.position);if(!reachable||reachable.length!==map.cols*map.rows)return null;
    const cells=[];
    for(let y=Math.max(0,Math.round(target.y)-2);y<=Math.min(map.rows-1,Math.round(target.y)+2);y++)
      for(let x=Math.max(0,Math.round(target.x)-2);x<=Math.min(map.cols-1,Math.round(target.x)+2);x++){
        if(reachable[x+y*map.cols]!==1||visited.has(x+':'+y)||x===r.position.x&&y===r.position.y)continue;
        // Approach closely; the native follow camera then supplies the framing.
        cells.push({x,y,score:Math.hypot(x-target.x,y-target.y)*2+Math.hypot(x-r.position.x,y-r.position.y)});
      }
    cells.sort((a,b)=>a.score-b.score);return cells[0]?{x:cells[0].x,y:cells[0].y}:null;
  }
  async function step(){
    const token=revision;if(!active(token)){cancelOwned();notice='Aus';return false;}
    if(now()<pauseUntil||now()-(env.userInputAt?.()??-Infinity)<5000){cancelOwned();notice='Eigene Eingabe – Navigation pausiert';return false;}
    let s=env.snapshot(),r=env.runtime?.();
    if(!current(s,r)){cancelOwned();notice='Warte auf frischen eigenen Spielzustand, Nacht und freie Spielkamera';return false;}
    if(env.captureReady(s)){notice='Ghost im Kamerarahmen – Foto wird geprüft';return false;}
    if(typeof env.withPetLock!=='function'){notice='Browser-Tabsperre fehlt – kein automatisches Laufen';return false;}
    let acquired=false;
    try{return await env.withPetLock(async()=>{
      acquired=true;s=env.snapshot();r=env.runtime?.();
      if(!active(token)||!current(s,r))return false;
      const epoch={actor:s.actor,ownerKey:s.ownerKey,roomId:s.roomId,generation:s.generation};
      if(r.holding!==true){
        const cameras=s.inventory?.items?.filter(i=>i?.itemType==='Tool'&&i.toolId==='Camera'&&(i.id==null||i.id==='Camera')&&i.quantity>0)||[];
        if(cameras.length!==1){notice='Genau eine zugeordnete Kamera im Inventar benötigt';return false;}
        notice='Kamera wird ausgerüstet';
        const reply=await env.send({type:'SetSelectedItem',itemId:'Camera',decorRotation:0},{validate:n=>active(token)&&n.actor===epoch.actor&&n.ownerKey===epoch.ownerKey&&n.generation===epoch.generation&&n.roomId===epoch.roomId});
        const after=env.snapshot(),runtime=env.runtime?.();
        if(!reply?.ok||!current(after,runtime)||after.actor!==epoch.actor||after.ownerKey!==epoch.ownerKey||after.roomId!==epoch.roomId||after.generation!==epoch.generation||runtime.holding!==true)throw Error('Kamera noch nicht im Spielzustand bestätigt');
        notice='Kamera ausgerüstet';return true;
      }
      const tap=r.tap;
      if(!tap||typeof tap.startPathTo!=='function'||typeof tap.cancelPath!=='function'||typeof tap.getReachableMap!=='function')return false;
      if(tap.onWalkFinished||tap.pathIndex<tap.path?.length){notice='Eigener Laufweg hat Vorrang';return false;}
      const targets=Array.isArray(r.targets)?r.targets.filter(p=>Number.isInteger(p.ghostIndex)&&p.ghostIndex>=0&&p.ghostIndex<=2&&
        typeof p.ghostInstanceId==='string'&&p.ghostInstanceId.length>0&&p.ghostInstanceId.length<=64&&Number.isFinite(p.x)&&Number.isFinite(p.y)):[];
      targets.sort((a,b)=>Math.hypot(a.x-r.position.x,a.y-r.position.y)-Math.hypot(b.x-r.position.x,b.y-r.position.y));
      let target=null,to=null,visited=null;
      for(const p of targets){
        const key=epoch.roomId+'|'+p.ghostInstanceId;
        if(!visits.has(key)){if(visits.size>=16)visits.delete(visits.keys().next().value);visits.set(key,new Set());}
        const tried=visits.get(key),dest=destination(r,p,tried);if(dest){target={...p};to=dest;visited=tried;break;}
      }
      if(!target){notice=targets.length?'Kein erreichbarer Kamerastandpunkt – warte':'Kein aktuell vorhandener Ghost zum Anlaufen';return false;}
      let finished=false,outcome='';
      const finish=result=>{finished=true;outcome=result;};owned={tap,finish};
      const startedAt=now(),inputAt=env.userInputAt?.()??-Infinity;
      visited.add(to.x+':'+to.y);
      notice='Laufe zu Ghost '+(target.ghostIndex+1)+' – Kamera folgt automatisch';
      try{
        tap.startPathTo(to,{onFinished:finish});
        while(!finished&&now()-startedAt<6000){
          const live=env.snapshot(),runtime=env.runtime?.();
          if(!active(token)||!current(live,runtime)||live.generation!==epoch.generation||live.ownerKey!==epoch.ownerKey||
            runtime.tap!==tap||runtime.holding!==true||!runtime.targets?.some(p=>p.ghostInstanceId===target.ghostInstanceId&&p.ghostIndex===target.ghostIndex)){
            notice='Lauf abgebrochen – Ziel oder Spielzustand geändert';break;
          }
          if((env.userInputAt?.()??-Infinity)>inputAt){pauseUntil=now()+15000;notice='Eigene Eingabe – Lauf abgebrochen';break;}
          if(env.captureReady(live)){notice='Ghost im Kamerarahmen – bereit zum Foto';break;}
          await wait();
        }
        if(outcome==='interrupted'){pauseUntil=now()+15000;notice='Eigene Bewegung hat Vorrang – pausiert';}
        else if(outcome==='failed')notice='Nativer Laufweg nicht erreichbar – neuer Standpunkt wird geprüft';
        return true;
      }finally{cancelOwned();}
    })??false;}catch(error){cancelOwned();notice=String(error?.message||'Ghost-Navigation fehlgeschlagen').slice(0,150);pauseUntil=now()+3000;return false;}
    finally{if(!acquired&&notice==='Aus')notice='Ghost-Navigation läuft in anderem Tab';}
  }
  return {step,stop,status:()=>notice};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createGhostNavigator,readNativeGhostNavigation};
