'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGhostNavigator}=require('../src/ghost-navigation.js');
function fixture(){
 let time=10000,running=true,lastInput=-Infinity,waitHook=null;
 const config={enabled:true,ghostCapture:true,ghostNavigate:true};
 const s={actor:'me',ownerKey:'account',roomId:'room',generation:1,serverNow:time,inventory:{items:[{itemType:'Tool',toolId:'Camera',quantity:1}]},ghost:{holding:true}};
 const ghost={ghostIndex:2,ghostInstanceId:'live',x:6,y:3};const paths=[],sent=[];
 const tap={path:[],pathIndex:0,onWalkFinished:undefined,startPathTo(tile,opts){paths.push(tile);this.path=[tile];this.pathIndex=0;this.onWalkFinished=opts.onFinished;},cancelPath(){const f=this.onWalkFinished;this.onWalkFinished=undefined;this.path=[];f?.('interrupted');},getReachableMap:()=>new Uint8Array(100).fill(1),map:{cols:10,rows:10}};
 const r={actor:'me',roomId:'room',serverTimeMs:time,stage:'midnight',holding:true,mode:'player',blocked:false,position:{x:1,y:1},targets:[ghost],tap};
 const env={config:()=>config,snapshot:()=>s,runtime:()=>r,now:()=>time,running:()=>running,userInputAt:()=>lastInput,captureReady:()=>false,withPetLock:async fn=>fn(),send:async c=>{sent.push(c);r.holding=true;s.ghost.holding=true;return {ok:true};},wait:async()=>{time+=200;s.serverNow=time;r.serverTimeMs=time;if(waitHook){waitHook();return;}const f=tap.onWalkFinished;tap.onWalkFinished=undefined;tap.pathIndex=tap.path.length;r.position=paths.at(-1);f?.('arrived');}};const e=createGhostNavigator(env);
 return {env,e,advance:()=>{time+=1000;s.serverNow=time;r.serverTimeMs=time;},s,r,tap,paths,sent,config,ghost,input:()=>lastInput=time,stop:()=>running=false,hook:f=>waitHook=f};
}
test('navigation is optional and never moves when switched off',async()=>{const h=fixture();h.config.ghostNavigate=false;await h.e.step();assert.equal(h.paths.length,0);});
test('normal native pathfinding approaches the current ghost',async()=>{const h=fixture();await h.e.step();assert.equal(h.paths.length,1);assert.equal(h.sent.length,0);});
test('missing camera is equipped through the command pipeline before walking',async()=>{const h=fixture();h.r.holding=false;h.s.ghost.holding=false;await h.e.step();assert.deepEqual(h.sent,[{type:'SetSelectedItem',itemId:'Camera',decorRotation:0}]);assert.equal(h.paths.length,0);});
test('camera absent from inventory causes no commands or movement',async()=>{const h=fixture();h.r.holding=false;h.s.inventory.items=[];await h.e.step();assert.equal(h.sent.length,0);assert.equal(h.paths.length,0);});
test('manual input pauses navigation',async()=>{const h=fixture();h.input();await h.e.step();assert.equal(h.paths.length,0);});
test('stopping while walking cancels only the owned path',async()=>{const h=fixture();h.hook(()=>h.stop());await h.e.step();assert.equal(h.tap.path.length,0);});
test('vanished or replaced ghost cancels the current chase',async()=>{const h=fixture();h.hook(()=>h.ghost.ghostInstanceId='different');await h.e.step();assert.equal(h.tap.path.length,0);});
test('unreachable ghosts never cause position commands',async()=>{const h=fixture();h.tap.getReachableMap=()=>new Uint8Array(100);await h.e.step();assert.equal(h.paths.length,0);assert.equal(h.sent.length,0);});
test('foreign or stale renderer state cannot authorize movement',async()=>{for(const change of [h=>h.r.actor='other',h=>h.r.roomId='other',h=>h.r.serverTimeMs=0]){const h=fixture();change(h);await h.e.step();assert.equal(h.paths.length,0);}});
test('manual replacement path is never cancelled by navigation cleanup',async()=>{
 const h=fixture();const replacement=()=>{};
 h.hook(()=>{const old=h.tap.onWalkFinished;h.tap.onWalkFinished=replacement;h.tap.path=[{x:9,y:9}];old('interrupted');});
 await h.e.step();assert.equal(h.tap.onWalkFinished,replacement);assert.deepEqual(h.tap.path,[{x:9,y:9}]);
});
test('manual input during an owned walk cancels it',async()=>{const h=fixture();h.hook(()=>h.input());await h.e.step();assert.equal(h.tap.path.length,0);});
test('modal and free camera modes cannot start movement',async()=>{for(const change of [h=>h.r.blocked=true,h=>h.r.mode='freelook']){const h=fixture();change(h);await h.e.step();assert.equal(h.paths.length,0);}});
const {readNativeGhostNavigation}=require('../src/ghost-navigation.js');
test('native reader finds the verified playerViews pathfinder without invoking movement',()=>{
 const h=fixture(),nativeGhost={index:2,instanceId:'current',out:true,tile:{x:6,y:3}};
 const tap={...h.tap,isActive:true},player={isActive:true,getSystem:name=>name==='tapToMove'?tap:null};
 const scope={isActive:true,isWorldBuilt:true,isWorldDrawing:true,displayedRoomId:'room',context:{serverTimeMs:10000,room:{localPlayerId:'me',localPlayerPosition:{x:1,y:1}}},getSystem:name=>name==='ghost'?{ghosts:[nativeGhost]}:null};
 const vals={quinoaDevEngineAtom:{page:{rendererScope:scope,playerViews:player,playerViewsReady:true}},dayNightStageAtom:'midnight',isHoldingCameraAtom:true,cameraModeAtom:'player',anyModalOpenAtom:false};
 const atoms=new Map(Object.keys(vals).map(debugLabel=>[debugLabel,{debugLabel}]));
 const page={jotaiAtomCache:{cache:atoms},__jotaiStore:{get:a=>vals[a.debugLabel]}};
 const r=readNativeGhostNavigation(page);assert.equal(r.tap,tap);assert.equal(r.targets[0].ghostInstanceId,'current');assert.equal(h.paths.length,0);
 nativeGhost.out=false;assert.equal(readNativeGhostNavigation(page).targets.length,0);
 player.isActive=false;assert.equal(readNativeGhostNavigation(page),null);
});
test('full automation serially equips camera walks and confirms PhotographGhost',async()=>{
 const {createAutomationCore}=require('../src/automation-core.js'),h=fixture(),map=new Map(),calls=[];
 Object.assign(h.s,{own:{petSlots:[],petTeams:[]},game:{ghostCatches:{},shops:{}},garden:{}});
 h.s.inventory.favoritedItemIds=[];h.s.inventory.storages=[];
 Object.assign(h.s.ghost,{stage:'midnight',target:{x:1,y:1},instances:[]});h.r.holding=false;
 const wait=h.env.wait;
 const e=createAutomationCore({...h.env,nativeGhostRuntime:()=>h.r,storage:{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v))},protected:()=>false,loadCatalogs:async()=>({}),
  wait:async()=>{await wait();h.s.ghost.instances=[{ghostIndex:2,ghostInstanceId:'live',visible:true}];},
  send:async c=>{calls.push(c.type);if(c.type==='SetSelectedItem'){h.r.holding=true;h.s.ghost.holding=true;}if(c.type==='PhotographGhost')h.s.game.ghostCatches[2]={lastCaughtAtMs:h.s.serverNow+1,photographerIds:['account']};return {ok:true};}});
 e.configure({enabled:true,ghostCapture:true,ghostNavigate:true,cropSell:false,harvest:false});
 await e.step();assert.deepEqual(calls,['SetSelectedItem']);assert.equal(h.paths.length,0);
 h.advance();await e.step();assert.equal(h.paths.length,1);
 h.advance();await e.step();assert.deepEqual(calls,['SetSelectedItem','PhotographGhost']);
 assert.equal(e.status().modules.find(m=>m.id==='ghostCapture').confirmed,1);
});

test('hidden tab does not independently block fresh native ghost navigation',()=>{
 const h=fixture(),nativeGhost={index:2,instanceId:'current',out:true,tile:{x:6,y:3}};
 const tap={...h.tap,isActive:true},player={isActive:true,getSystem:name=>name==='tapToMove'?tap:null};
 const scope={isActive:true,isWorldBuilt:true,isWorldDrawing:true,displayedRoomId:'room',context:{serverTimeMs:10000,room:{localPlayerId:'me',localPlayerPosition:{x:1,y:1}}},getSystem:name=>name==='ghost'?{ghosts:[nativeGhost]}:null};
 const vals={quinoaDevEngineAtom:{page:{rendererScope:scope,playerViews:player,playerViewsReady:true}},dayNightStageAtom:'midnight',isHoldingCameraAtom:true,cameraModeAtom:'player',anyModalOpenAtom:false};
 const atoms=new Map(Object.keys(vals).map(debugLabel=>[debugLabel,{debugLabel}]));
 const page={document:{hidden:true},jotaiAtomCache:{cache:atoms},__jotaiStore:{get:a=>vals[a.debugLabel]}};
 assert.equal(readNativeGhostNavigation(page)?.blocked,false);
 vals.anyModalOpenAtom=true;assert.equal(readNativeGhostNavigation(page)?.blocked,true);
 vals.anyModalOpenAtom=false;scope.isWorldDrawing=false;assert.equal(readNativeGhostNavigation(page),null);
});
