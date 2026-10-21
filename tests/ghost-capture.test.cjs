'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGhostCapture}=require('../src/ghost-capture.js');
const live=()=>({actor:'me',generation:1,serverNow:10000,game:{ghostCatches:{}},ghost:{stage:'night',holding:true,target:{x:1,y:2},instances:[{ghostIndex:2,ghostInstanceId:'live-instance',visible:true}]}});
test('only explicit current visible instances produce commands',()=>{
 const g=createGhostCapture(),s=live();
 assert.deepEqual(g.propose(s).command,{type:'PhotographGhost',ghostIndex:2,ghostInstanceId:'live-instance'});
 for(const change of [s=>delete s.ghost,s=>s.ghost.instances=[],s=>s.ghost.instances[0].visible=false,s=>delete s.ghost.instances[0].ghostInstanceId,s=>s.ghost.holding=false,s=>s.ghost.stage='day']){
  const n=live();change(n);assert.equal(g.propose(n).command,null);
 }
});
test('caught state alone cannot supply an instance ID',()=>{
 const s=live();s.ghost.instances=[];s.game.ghostCatches={2:{firstCaughtAtMs:123,photographerIds:['me']}};
 assert.equal(createGhostCapture().propose(s).command,null);
});
test('confirmation requires own photographer and changed server catch timestamp',()=>{
 const g=createGhostCapture(),s=live(),p=g.propose(s);
 assert.equal(g.confirmed(p,s),false);
 s.game.ghostCatches[2]={lastCaughtAtMs:10001,photographerIds:['other']};assert.equal(g.confirmed(p,s),false);
 s.game.ghostCatches[2].photographerIds.push('me');assert.equal(g.confirmed(p,s),true);
 s.generation++;assert.equal(g.confirmed(p,s),false);
});
const {readNativeGhostState}=require('../src/ghost-capture.js');
test('native reader uses current atoms and never synthesizes IDs from catches',()=>{
 const values=new Map(),atoms=new Map();
 const put=(label,value)=>{const atom={debugLabel:label};atoms.set(label,atom);values.set(atom,value);};
 put('dayNightStageAtom','night');put('isHoldingCameraAtom',true);put('cameraTargetAtom',{x:1,y:2});
 put('ghostCatchesAtom',{2:{firstCaughtAtMs:123}});
 const page={__jotaiStore:{get:a=>values.get(a)},jotaiAtomCache:atoms};
 assert.equal(readNativeGhostState(page).instances.length,0);
 put('visibleGhostsAtom',[{ghostIndex:2,ghostInstanceId:'fresh',visible:true}]);
 assert.equal(readNativeGhostState(page).instances[0].ghostInstanceId,'fresh');
 values.set(atoms.get('visibleGhostsAtom'),[]);assert.equal(readNativeGhostState(page).instances.length,0);
});
const {createAutomationCore}=require('../src/automation-core.js');
function core({ackOnly=false,reuseStorage=null}={}){
 const s=live();s.ownerKey='account';s.own={petSlots:[],petTeams:[]};s.garden={};s.inventory={items:[],favoritedItemIds:[],storages:[]};
 let time=10000;const calls=[],map=new Map(),storage=reuseStorage||{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v))};
 const e=createAutomationCore({storage,now:()=>time,snapshot:()=>s,running:()=>true,protected:()=>false,loadCatalogs:async()=>({}),withPetLock:async f=>f(),send:async c=>{
  calls.push(c);if(!ackOnly)s.game.ghostCatches[c.ghostIndex]={lastCaughtAtMs:time+1,photographerIds:['account']};return {ok:true};
 }});
 e.configure({enabled:true,ghostCapture:true,cropSell:false,harvest:false});
 return {s,e,calls,storage,advance:()=>time+=11000};
}
test('Ghost automation defaults off and sends no command',async()=>{
 const h=core();h.e.configure({ghostCapture:false});await h.e.step();assert.equal(h.calls.length,0);
});
test('Ghost pipeline confirms state, rate limits and never repeats an instance',async()=>{
 const h=core();await h.e.step();assert.equal(h.calls.length,1);
 assert.equal(h.e.status().modules.find(m=>m.id==='ghostCapture').confirmed,1);
 h.s.ghost.instances[0].ghostInstanceId='next';await h.e.step();assert.equal(h.calls.length,1);
 h.advance();await h.e.step();assert.equal(h.calls.length,2);
 h.advance();await h.e.step();assert.equal(h.calls.length,2);
});
test('ACK-only Ghost is uncertain and remains blocked after reload',async()=>{
 const h=core({ackOnly:true});await h.e.step();assert.equal(h.calls.length,1);
 assert.equal(h.e.status().modules.find(m=>m.id==='ghostCapture').confirmed,0);
 const reloaded=core({reuseStorage:h.storage});await reloaded.e.step();assert.equal(reloaded.calls.length,0);
});
test('a visibility change just before dispatch vetoes the command',async()=>{
 const h=core();h.s.ghost.instances[0].visible=false;await h.e.step();assert.equal(h.calls.length,0);
});
