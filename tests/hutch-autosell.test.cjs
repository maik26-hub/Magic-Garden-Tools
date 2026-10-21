'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAutomationCore}=require('../src/automation-core.js');
const {createEffectTeamBuilder}=require('../src/effect-teams.js');
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v))};};
const pig=(id,max,extra={})=>({id,itemType:'Pet',petSpecies:'Pig',name:id,
  sourceEggId:'CommonEgg',targetScale:1+(max-80)/20,xp:0,abilities:['PetHatchSizeBoost','PetAgeBoost'],
  mutations:[],...extra});
const cats={pets:{Pig:{name:'Pig',maxScale:2,hoursToMature:12}},abilities:{
  PetHatchSizeBoost:{name:'Max STR beim Hatch',trigger:'hatchEgg',baseProbability:18,baseParameters:{maxStrengthIncreasePercentage:5}},
  PetAgeBoost:{name:'Hatch XP',trigger:'hatchEgg',baseProbability:60,baseParameters:{bonusXp:1000}}
}};
function fixture({hutch=[pig('weak-hutch',90),pig('mid-hutch',94),pig('good-hutch',96)],
  bag=[pig('new-best',99)],moveMode='observed',sellMode='observed',inventoryFill=0,config={},lock=null}={}){
 let clock=10000;
 const s={actor:'me',ownerKey:'account',generation:1,serverNow:clock,game:{weather:'Normal',shops:{}},garden:{},
  fieldModes:Array(200).fill('none'),heldId:'',inventory:{items:[...bag,...Array.from({length:inventoryFill},(_,i)=>({id:'fill'+i,itemType:'Tool',toolId:'Camera',quantity:1}))],
    favoritedItemIds:[],storages:[{decorId:'PetHutch',capacitySlots:25,items:hutch}]},
  own:{petSlots:[],petTeams:[],shopPurchases:{},coinsCount:1000}};
 const calls=[],storage=store();
 const e=createAutomationCore({storage,now:()=>clock,running:()=>true,snapshot:()=>s,
  uuid:()=>`uuid-${Math.random()}`,protected:()=>false,loadCatalogs:async()=>({}),withPetLock:lock|| (async fn=>fn()),
  send:async c=>{
    calls.push(structuredClone(c));
    if(c.type==='MoveItem'&&c.from==='PetHutch'){
      if(moveMode==='rejected'){const x=Error('Rejected');x.code='rejected';x.definite=true;throw x;}
      if(moveMode==='observed'){
        const st=s.inventory.storages[0];const target=st.items.find(p=>p.id===c.itemId);
        if(target){st.items=st.items.filter(p=>p!==target);s.inventory.items.push(target);}
      }
      return {ok:true};
    }
    if(c.type==='SellPet'){
      if(sellMode==='observed')s.inventory.items=s.inventory.items.filter(p=>p.id!==c.itemId);
      return {ok:true};
    }
    return {ok:true};
  }});
 Object.assign(e.catalogs(),structuredClone(cats));
 e.configure({enabled:true,petSell:true,petSellEggs:['CommonEgg'],harvest:false,cropSell:false,...config});
 return {e,s,calls,storage,advance:()=>{clock+=2500;s.serverNow=clock;}};
}
test('Hutch + inventory are one Max-STR portfolio; only the weakest fourth Hatch-XP+STR pig is surplus',()=>{
 const h=fixture(),r=createEffectTeamBuilder().build(h.s,cats);
 assert.deepEqual(r.plans.find(t=>t.family==='PetHatchSizeBoost'&&t.mode==='active').petIds,
   ['new-best','good-hutch','mid-hutch']);
 assert.equal(r.decisions.find(d=>d.id==='weak-hutch').kind,'surplus');
 for(const id of ['new-best','good-hutch','mid-hutch'])assert.equal(r.decisions.find(d=>d.id===id).kind,'keep');
 const proposal=h.e.petSellProposal();assert.equal(proposal.pet.id,'weak-hutch');
 assert.equal(proposal.source,'Pet Hutch');
 assert.equal(proposal.rows.find(r=>r.id==='weak-hutch').maxStrength,90);
});
test('moves exactly the surplus Hutch pig to inventory, confirms move, and only then sells it',async()=>{
 const h=fixture();
 await h.e.step();
 assert.deepEqual(h.calls,[{type:'MoveItem',from:'PetHutch',to:'inventory',itemId:'weak-hutch',quantity:1}]);
 assert.ok(h.s.inventory.items.some(p=>p.id==='weak-hutch'));
 assert.ok(!h.s.inventory.storages[0].items.some(p=>p.id==='weak-hutch'));
 assert.equal(h.e.status().modules.find(x=>x.id==='petSell').confirmed,1); // confirmed retrieval, not sale
 h.advance();await h.e.step();
 assert.deepEqual(h.calls[1],{type:'SellPet',itemId:'weak-hutch'});
 assert.ok(!h.s.inventory.items.some(p=>p.id==='weak-hutch'));
 for(const id of ['new-best','good-hutch','mid-hutch'])
   assert.ok([...h.s.inventory.items,...h.s.inventory.storages[0].items].some(p=>p.id===id));
});
test('move ACK with no own-game inventory change is NOT a successful retrieval and never followed by SellPet',async()=>{
 const h=fixture({moveMode:'ackOnly'});
 await h.e.step();h.advance();await h.e.step();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].type,'MoveItem');
 assert.equal(h.e.status().modules.find(x=>x.id==='petSell').confirmed,0);
 assert.ok(h.s.inventory.storages[0].items.some(p=>p.id==='weak-hutch'));
});
test('a favorite, mutation or manual saved team prevents extracting the Hutch pig',async()=>{
 for(const mutation of [h=>h.s.inventory.favoritedItemIds.push('weak-hutch'),
   h=>h.s.inventory.storages[0].items[0].mutations=['Rainbow'],
   h=>h.s.own.petTeams.push({id:'user-custom',members:[{petId:'weak-hutch'}]})]){
   const h=fixture();mutation(h);await h.e.step();assert.equal(h.calls.length,0);
 }
});
test('full inventory blocks Hutch extraction but still allows inventory-only candidates',async()=>{
 const h=fixture({inventoryFill:97});
 assert.equal(h.e.petSellProposal().rows.find(r=>r.id==='weak-hutch').eligible,false);
 await h.e.step();assert.equal(h.calls.length,0);
});
test('new strongest pig missing complete Max-STR metadata cannot evict a known Hutch pig',async()=>{
 const h=fixture({bag:[pig('new-best',99,{targetScale:undefined})]});
 assert.notEqual(h.e.petSellProposal().pet?.id,'weak-hutch');
 await h.e.step();assert.equal(h.calls.length,0);
});
test('Pet Hutch extraction is blocked without the cross-tab pet lock',async()=>{
 const h=fixture(),c=structuredClone(cats);
 const s=h.s,raw=[];
 const e=createAutomationCore({storage:store(),now:()=>10000,running:()=>true,snapshot:()=>s,protected:()=>false,
  loadCatalogs:async()=>({}),send:async cmd=>{raw.push(cmd);return {ok:true};}});
 Object.assign(e.catalogs(),c);e.configure({enabled:true,petSell:true,petSellEggs:['CommonEgg']});
 await e.step();assert.equal(raw.length,0);
 assert.match(e.status().modules.find(x=>x.id==='petSell').status,/Tabsperre/);
});
test('incomplete Hutch mapping blocks even inventory sales',async()=>{
 const h=fixture({bag:[pig('weak-bag',90),pig('best',99)],hutch:[pig('mid',94),pig('good',96)]});
 h.s.inventory.storages.push({decorId:'PetHutch'});
 await h.e.step();assert.equal(h.calls.length,0);
});
test('nested active slots protect their pet IDs',async()=>{
 const h=fixture();h.s.own.petSlots=[{slot:pig('weak-hutch',90)}];
 await h.e.step();assert.equal(h.calls.length,0);
});
test('uncertain sale is never retried after the old ten minute expiry',async()=>{
 const h=fixture({hutch:[],bag:[pig('weak',90),pig('mid',94),pig('good',96),pig('best',99)],sellMode:'ackOnly'});
 await h.e.step();for(let i=0;i<300;i++)h.advance();await h.e.step();
 assert.equal(h.calls.length,1);
});
test('a delayed successful retrieval may be sold after current portfolio revalidation',async()=>{
 const h=fixture({moveMode:'ackOnly'});await h.e.step();
 const st=h.s.inventory.storages[0],p=st.items.shift();h.s.inventory.items.push(p);
 h.advance();await h.e.step();assert.deepEqual(h.calls.map(c=>c.type),['MoveItem','SellPet']);
});
test('favorites added after retrieval stop SellPet',async()=>{
 const h=fixture();await h.e.step();h.s.inventory.favoritedItemIds.push('weak-hutch');
 h.advance();await h.e.step();assert.equal(h.calls.length,1);
});
test('duplicate inventory/Hutch identity never authorizes a sale',async()=>{
 const h=fixture();h.s.inventory.items.push(structuredClone(h.s.inventory.storages[0].items[0]));
 await h.e.step();assert.equal(h.calls.length,0);
});
test('definite rejection retries with backoff and stops after three attempts',async()=>{
 const h=fixture({moveMode:'rejected'});await h.e.step();h.advance();await h.e.step();assert.equal(h.calls.length,1);
 for(let retry=0;retry<4;retry++){for(let i=0;i<13;i++)h.advance();await h.e.step();}
 assert.equal(h.calls.length,3);
});
test('corrupt durable pet action ledger blocks destructive commands',async()=>{
 const h=fixture();h.storage.setItem('magic_garden_v16_pet_attempts','invalid-json');
 await h.e.step();assert.equal(h.calls.length,0);
});
test('temporary tab lock contention never poisons a sale receipt',async()=>{
 let contended=true;const h=fixture({lock:async fn=>{if(contended)throw Error('Other tab');return fn();}});
 await h.e.step();assert.equal(h.calls.length,0);contended=false;h.advance();await h.e.step();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'MoveItem');
});
test('nested Pet data remains eligible while outer locks stay protected',async()=>{
 const h=fixture(),p=h.s.inventory.storages[0].items[0];
 h.s.inventory.storages[0].items[0]={id:p.id,itemType:'Pet',data:p};
 assert.equal(h.e.petSellProposal().pet?.id,p.id);
 h.s.inventory.storages[0].items[0].locked=true;await h.e.step();assert.equal(h.calls.length,0);
});
