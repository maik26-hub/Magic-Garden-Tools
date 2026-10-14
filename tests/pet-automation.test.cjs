'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAutomationCore}=require('../src/automation-core.js');
const {createPetAutomationPolicy}=require('../src/pet-automation.js');
const policy=createPetAutomationPolicy();
const clock0=Date.parse('2026-10-14T14:00:00Z');
const pet=(id,targetScale,other={})=>({
 id,itemType:'Pet',petSpecies:'Bee',name:id,xp:0,targetScale,
 sourceEggId:'CommonEgg',abilities:['SellBoostI'],mutations:[],
 hunger:500,...other
});
function storage(){
 const cache=new Map();
 return {getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,String(v)),cache};
}
function harness(opts={}){
 let t=clock0,sends=[],ariesSaves=[],running=true,service=opts.aries||null;
 const s={actor:'self',generation:1,serverNow:t,
   fieldModes:Array(200).fill('none'),selected:[],garden:{},
   heldId:'',inventory:{items:opts.inventory||[],favoritedItemIds:[],storages:[]},
   own:{petSlots:[],petTeams:[],shopPurchases:{},coinsCount:10000,
     journal:{pets:{Bee:{variantsLogged:[{variant:'Normal'}],abilitiesLogged:[{ability:'SellBoostI'}]}}}},
   game:{shops:{},weather:'Normal'}};
 const e=createAutomationCore({
   storage:storage(),now:()=>t,running:()=>running,
   protected:(_,p)=>!!(p?.locked||p?.isLocked||p?.protected),
   snapshot:()=>s,loadCatalogs:async()=>({}),
   send:async command=>{
     sends.push({...command});
     if(opts.removeOnSell&&command.type==='SellPet')
       s.inventory.items=s.inventory.items.filter(p=>p.id!==command.itemId);
     if(opts.reject)throw Error('no native SellPet acknowledgement');
     return {ok:true};
   },
   ariesService:()=>service,
   updateAriesTeam:async p=>{
     ariesSaves.push(p);
     if(!service?.isTeamSyncEnabled())return {ok:false};
     const team=service.getTeams().find(t=>t.id===p.id);
     if(!team)return {ok:false};
     team.slots=p.slots.slice();
     return {ok:true};
   }
 });
 Object.assign(e.catalogs(),{pets:{Bee:{maxScale:2,hoursToMature:12,diet:['Carrot'],coinsToFullyReplenishHunger:500}}});
 return {e,s,sends,ariesSaves,enable:patch=>e.configure({enabled:true,...patch}),
   add:(...pets)=>s.inventory.items.push(...pets),
   advance:(ms=2000)=>{t+=ms;s.serverNow=t;},
   setAries:x=>service=x
 };
}
function ranked(){return [pet('best',1.95),pet('strong',1.9),pet('good',1.85),pet('weak',1.3)];}
function svc({sync=true,slots=['weak',null,null]}={}){
 const teams=[{id:'local-aries',serverId:'server-aries',name:'Sell AFK',slots}];
 return {getTeams:()=>teams,isTeamSyncEnabled:()=>sync,saveTeam:({id,slots})=>{
   const t=teams.find(x=>x.id===id);if(!t)return null;t.slots=slots;return t; }};
}
test('Pet Sell is off by default; no origin allowlist means no sale',async()=>{
 const h=harness({inventory:ranked()});
 h.enable({});
 assert.equal(h.e.getConfig().petSell,false);
 assert.equal(await h.e.step(),false);
 h.enable({petSell:true,petSellEggs:[]});
 assert.equal(await h.e.step(),false);
 assert.deepEqual(h.sends,[]);
});
test('with opt-in, only the clearly dominated fourth pet is sold by exact native itemId',async()=>{
 const h=harness({inventory:ranked(),removeOnSell:true});
 h.enable({petSell:true,petSellEggs:['CommonEgg']});
 assert.equal(await h.e.step(),true);
 assert.deepEqual(h.sends,[{type:'SellPet',itemId:'weak'}]);
 assert.equal(h.s.inventory.items.some(p=>p.id==='weak'),false);
 assert.equal(h.e.status().modules.find(m=>m.id==='petSell').confirmed,1);
});
test('SellPet with no native acknowledgement is confirmed only if own bag loses exact pet',async()=>{
 const h=harness({inventory:ranked(),removeOnSell:true,reject:true});
 h.enable({petSell:true,petSellEggs:['CommonEgg']});
 await h.e.step();
 assert.equal(h.e.status().modules.find(m=>m.id==='petSell').confirmed,1);
 assert.equal(h.sends.length,1);
});
test('failed/uncertain sale remains suppressed rather than blindly retried',async()=>{
 const h=harness({inventory:ranked(),reject:true});
 h.enable({petSell:true,petSellEggs:['CommonEgg']});
 await h.e.step();h.advance(3000);await h.e.step();
 assert.deepEqual(h.sends,[{type:'SellPet',itemId:'weak'}]);
 assert.match(h.e.status().modules.find(m=>m.id==='petSell').status,/Bestätigung|Nicht bestätigt|Warte/);
});
test('source egg must match selected egg origins exactly; no name or species guesses',async()=>{
 const h=harness({inventory:ranked()});
 h.enable({petSell:true,petSellEggs:['UncommonEgg']});
 assert.equal(await h.e.step(),false);
 assert.equal(h.e.petSellProposal().pet,null);
 h.s.inventory.items[3].sourceEggId=undefined;
 h.e.configure({petSellEggs:['CommonEgg']});
 assert.equal(await h.e.step(),false);
});
test('favorites, locked, special mutations and saved game teams are protected',async()=>{
 for(const setup of [
   h=>h.s.inventory.favoritedItemIds=['weak'],
   h=>h.s.inventory.items[3].locked=true,
   h=>h.s.inventory.items[3].mutations=['Gold'],
   h=>h.s.own.petTeams=[{id:'team',members:[{petId:'weak'}]}]
 ]){
   const h=harness({inventory:ranked()});
   h.enable({petSell:true,petSellEggs:['CommonEgg']});
   setup(h);assert.equal(await h.e.step(),false);assert.deepEqual(h.sends,[]);
 }
});
test('Aries saved team members are additionally protected even if server teams lag',async()=>{
 const h=harness({inventory:ranked(),aries:svc({slots:['weak',null,null]})});
 h.enable({petSell:true,petSellEggs:['CommonEgg']});
 assert.equal(await h.e.step(),false);assert.equal(h.sends.length,0);
});
test('all protected or unknown roll data fails closed',async()=>{
 const h=harness({inventory:ranked()});
 h.s.inventory.items[3].abilities=['FutureUnknownAbility'];
 h.enable({petSell:true,petSellEggs:['CommonEgg']});
 assert.equal(await h.e.step(),false);
 assert.deepEqual(h.sends,[]);
});
test('per-session pet-sale cap stops further disposal despite eligible fourth and fifth',async()=>{
 const h=harness({inventory:[...ranked(),pet('extraWeak',1.2)],removeOnSell:true});
 h.enable({petSell:true,petSellEggs:['CommonEgg'],petSellPerSession:1});
 await h.e.step();h.advance();await h.e.step();
 assert.equal(h.sends.length,1);
});
test('only explicitly registered saved Aries teams receive a local managed update',async()=>{
 const aries=svc(),h=harness({inventory:ranked(),aries});
 h.enable({ariesSync:true,ariesManagedTeams:[{teamId:'local-aries',goal:'sellCrops'}]});
 assert.equal(await h.e.step(),true);
 assert.equal(h.sends.length,0);
 assert.equal(h.ariesSaves.length,1);
 assert.equal(h.ariesSaves[0].id,'local-aries');
 assert.deepEqual(aries.getTeams()[0].slots.filter(Boolean),['best','strong','good']);
});
test('disabled Aries sync never updates manually maintained teams',async()=>{
 const h=harness({inventory:ranked(),aries:svc()});
 h.enable({ariesSync:false,ariesManagedTeams:[{teamId:'local-aries',goal:'sellCrops'}]});
 assert.equal(await h.e.step(),false);assert.equal(h.ariesSaves.length,0);
});
test('Aries native sync disabled means no local writes either',async()=>{
 const h=harness({inventory:ranked(),aries:svc({sync:false})});
 h.enable({ariesSync:true,ariesManagedTeams:[{teamId:'local-aries',goal:'sellCrops'}]});
 assert.equal(await h.e.step(),false);assert.equal(h.ariesSaves.length,0);
});
test('Aries team lacking a serverId is skipped, preventing unsynced ghost templates',async()=>{
 const aries=svc();aries.getTeams()[0].serverId=null;
 const h=harness({inventory:ranked(),aries});
 h.enable({ariesSync:true,ariesManagedTeams:[{teamId:'local-aries',goal:'sellCrops'}]});
 assert.equal(await h.e.step(),false);assert.equal(h.ariesSaves.length,0);
});
test('one-time configured Aries optimization keeps preserved ID and team label',async()=>{
 const aries=svc(),h=harness({inventory:ranked(),aries});
 h.enable({ariesSync:true,ariesManagedTeams:[{teamId:'local-aries',goal:'sellCrops'}]});
 await h.e.step();
 assert.equal(aries.getTeams()[0].id,'local-aries');
 assert.equal(aries.getTeams()[0].name,'Sell AFK');
 h.advance();await h.e.step();assert.equal(h.ariesSaves.length,1);
});
test('Aries service absent does not invent its proposals or create arbitrary teams',async()=>{
 const h=harness({inventory:ranked()});
 h.enable({ariesSync:true,ariesManagedTeams:[{teamId:'not-real',goal:'sellCrops'}]});
 assert.equal(await h.e.step(),false);
 assert.equal(h.ariesSaves.length,0);
});
test('config rejects malformed pet origins/Aries team declarations and clamps sale cap',()=>{
 const h=harness({inventory:ranked()});
 const c=h.e.configure({petSellEggs:['CommonEgg','CommonEgg',22],
   petSellPerSession:2000,ariesManagedTeams:[
     {teamId:'my-team',goal:'sellCrops'},{teamId:'fake',goal:'GiveCoins'}
   ]});
 assert.deepEqual(c.petSellEggs,['CommonEgg']);
 assert.equal(c.petSellPerSession,20);
 assert.deepEqual(c.ariesManagedTeams,[{teamId:'my-team',goal:'sellCrops'}]);
});
