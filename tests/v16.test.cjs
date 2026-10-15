'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createEffectTeamBuilder}=require('../src/effect-teams');
const {createTeamRegistry}=require('../src/team-registry');
const {createTeamActions}=require('../src/team-actions');
const {createV16Controller}=require('../src/v16-controller');
const {createAutomationCore}=require('../src/automation-core');
// Synthetic fixtures: representative native schema, not anyone's account.
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>Object.fromEntries(m)};};
const definitions={
  SellBoostI:{name:'Sell Boost I',trigger:'sellAllCrops',baseProbability:10,baseParameters:{cropSellPriceIncreasePercentage:20}},
  SellBoostIII:{name:'Sell Boost III',trigger:'sellAllCrops',baseProbability:14,baseParameters:{cropSellPriceIncreasePercentage:40}},
  EggGrowthBoost:{name:'Egg Growth I',trigger:'continuous',baseProbability:21,baseParameters:{eggGrowthTimeReductionMinutes:7}},
  EggGrowthBoostII_NEW:{name:'Egg Growth II',trigger:'continuous',baseProbability:24,baseParameters:{eggGrowthTimeReductionMinutes:9}},
  EggGrowthBoostII:{name:'Egg Growth III',trigger:'continuous',baseProbability:27,baseParameters:{eggGrowthTimeReductionMinutes:11}},
  PlantGrowthBoost:{name:'Plant Growth',trigger:'continuous',baseProbability:20,baseParameters:{plantGrowthReductionMinutes:4}},
  PetXpBoost:{name:'XP',trigger:'continuous',baseProbability:50,baseParameters:{bonusXp:10}},
  PetHatchSizeBoost:{name:'Max Strength',trigger:'hatchEgg',baseProbability:12,baseParameters:{maxStrengthIncreasePercentage:2.4}},
  PetHatchSizeBoostIII:{name:'Max Strength III',trigger:'hatchEgg',baseProbability:16,baseParameters:{maxStrengthIncreasePercentage:4.6}},
  PetAgeBoost:{name:'Hatch XP',trigger:'hatchEgg',baseProbability:50,baseParameters:{bonusXp:8000}},
  PetMutationBoost:{name:'Pet mutation',trigger:'hatchEgg',baseProbability:12,baseParameters:{mutationChanceIncreasePercentage:5}},
  ProduceRefund:{name:'Crop refund',trigger:'sellAllCrops',baseProbability:10,baseParameters:{}},
  DustBoost:{name:'Magic Dust',trigger:'sellPet',baseProbability:10,baseParameters:{petDustIncreasePercentage:12}},
  PetRefund:{name:'Pet refund',trigger:'sellPet',baseProbability:5,baseParameters:{}},
  DoubleHatch:{name:'Double Hatch',trigger:'hatchEgg',baseProbability:3,baseParameters:{}},
  HungerRestore:{name:'Hunger Restore',trigger:'continuous',baseProbability:12,baseParameters:{hungerRestorePercentage:30}},
  HungerBoost:{name:'Hunger Boost',trigger:'continuous',baseParameters:{hungerRefundPercentage:12}},
  SnowyEggGrowthBoost:{name:'Frost Eggs',trigger:'continuous',baseProbability:35,baseParameters:{eggGrowthTimeReductionMinutes:10,requiredWeather:'Frost'}},
  ProduceScaleBoost:{name:'Size',trigger:'continuous',baseProbability:10,baseParameters:{sizeIncrease:10}},
  SeedFinderI:{name:'Seeds I',trigger:'continuous',baseProbability:10,baseParameters:{}},
  SeedFinderII:{name:'Seeds II',trigger:'continuous',baseProbability:10,baseParameters:{}},
  ProduceEater:{name:'Crop Eater',trigger:'continuous',baseProbability:60,baseParameters:{}},
  GoldGranter:{name:'Gold Granter',trigger:'continuous',baseProbability:8,baseParameters:{grantedMutations:['Gold']}}
};
function catalog(){return {abilities:structuredClone(definitions),pets:{Pig:{name:'Pig',maxScale:2,hoursToMature:12},Squirrel:{name:'Squirrel',maxScale:2,hoursToMature:12},Turtle:{name:'Turtle',maxScale:2,hoursToMature:12},Worm:{diet:['Carrot'],coinsToFullyReplenishHunger:500,maxScale:2,hoursToMature:12}},eggs:{CommonEgg:{name:'Common Egg',coinPrice:100,secondsToHatch:600,faunaSpawnWeights:{Pig:1,Squirrel:1},eligibleShops:['egg']}}};}
const pet=(id,abilities,max=90,extra={})=>({id,name:id,itemType:'Pet',petSpecies:'Pig',sourceEggId:'CommonEgg',targetScale:1+(max-80)/20,xp:0,hunger:500,abilities,mutations:[],...extra});
function snapshot(items=[]){return {actor:'self',ownerKey:'account',generation:1,serverNow:Date.now(),game:{weather:'Normal',shops:{}},garden:{},fieldModes:Array(200).fill('none'),inventory:{items,favoritedItemIds:[],storages:[]},own:{petSlots:[],petTeams:[],shopPurchases:{},journal:{pets:{},produce:{}},coinsCount:1000}};}
const planKey=(result,family,mode='active')=>result.plans.find(t=>t.family===family&&t.mode===mode)?.key;

test('same Sell effect ranks actual III proc/magnitude above levelled I across species',()=>{
 const b=createEffectTeamBuilder(),c=catalog(),s=snapshot([pet('old',['SellBoostI'],100,{xp:1e6}),pet('new',['SellBoostIII'],90,{petSpecies:'Squirrel'}),pet('middle',['SellBoostI'],95),pet('weak',['SellBoostI'],85)]);
 const r=b.build(s,c),t=r.plans.find(t=>t.family==='SellBoost');assert.equal(t.petIds[0],'new');assert.equal(r.decisions.find(d=>d.id==='weak').kind,'surplus');
});
test('egg internal II_NEW alias ranks by native 9 vs 11 minute effects, not Roman suffix',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('ii',['EggGrowthBoostII_NEW']),pet('iii',['EggGrowthBoostII'])]),catalog());
 assert.equal(r.plans.filter(t=>t.family==='EggGrowthBoost'&&t.mode==='active').length,1);assert.equal(r.plans[0].petIds[0],'iii');
});
test('individual effect/Seed Finder tier plans remain separate alongside action combination teams',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('a',['SellBoostI','EggGrowthBoost','SeedFinderI']),pet('b',['SeedFinderII','DoubleHatch','PetHatchSizeBoost'])]),catalog());
 assert.equal(r.plans.filter(t=>!t.combo).length,6);
 assert.equal(r.plans.filter(t=>t.trigger==='hatchEgg'&&!t.combo).length,2);
 assert.ok(r.plans.some(t=>t.key==='combo:hatch#active'&&t.trigger==='hatchEgg'));
 assert.ok(r.plans.some(t=>t.family==='SeedFinderI'));
 assert.ok(r.plans.some(t=>t.family==='SeedFinderII'));
});
test('hatch combo jointly covers Max STR, Hatch XP, Double Hatch and Pet Mutations',()=>{
 const s=snapshot([pet('dual',['PetHatchSizeBoostIII','PetAgeBoost'],98),pet('double',['DoubleHatch'],99),
   pet('mutation',['PetMutationBoost'],95),pet('max-alone',['PetHatchSizeBoostIII'],100),
   pet('xp-alone',['PetAgeBoost'],100)]);
 const r=createEffectTeamBuilder().build(s,catalog());
 const hatch=r.plans.find(t=>t.key==='combo:hatch#active');
 assert.ok(hatch,'should form an action-combination Hatch team');
 assert.deepEqual(hatch.petIds,['dual','double','mutation']);
 assert.equal(hatch.trigger,'hatchEgg');
 assert.equal(new Set(hatch.petIds).size,3);
 assert.deepEqual(hatch.contributions.map(c=>c.family),
   ['PetHatchSizeBoost','DoubleHatch','PetMutationBoost','PetAgeBoost']);
 assert.deepEqual(hatch.contributions.filter(c=>c.pets.includes('dual')).map(c=>c.family),
   ['PetHatchSizeBoost','PetAgeBoost']);
 assert.ok(hatch.score>0&&hatch.known);
 assert.ok(r.reserved.includes('dual'));
});
test('hatch combo recognizes two useful rolled abilities on one pet even without a third',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('multi',['PetHatchSizeBoost','PetAgeBoost'],94)]),catalog());
 const hatch=r.plans.find(t=>t.key==='combo:hatch#active');
 assert.deepEqual(hatch.petIds,['multi']);
 assert.equal(hatch.contributions.filter(c=>c.pets.includes('multi')).length,2);
});
test('hatch builder refuses to form a fake combo from only Max STR without other effects',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('a',['PetHatchSizeBoostIII']),pet('b',['PetHatchSizeBoost'])]),catalog());
 assert.ok(!r.plans.some(t=>t.key==='combo:hatch#active'));
});
test('crop sale combo merges Sell Boost and Produce Refund; no unrelated trigger',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('combined',['SellBoostIII','ProduceRefund']),
   pet('refund',['ProduceRefund']),pet('single',['SellBoostI']),pet('growing',['PlantGrowthBoost'])]),catalog());
 const c=r.plans.find(t=>t.key==='combo:cropSale#active');
 assert.ok(c&&c.petIds.includes('combined'));
 assert.deepEqual(c.contributions.map(t=>t.family),['SellBoost','ProduceRefund']);
 assert.equal(c.trigger,'sellAllCrops');
 assert.ok(!c.petIds.includes('growing'));
});
test('AFK growth+egg combination requires hunger support and both continuous boost families',()=>{
 const r=createEffectTeamBuilder().build(snapshot([
   pet('grow',['PlantGrowthBoost']),pet('egg',['EggGrowthBoostII']),
   pet('feeder',['HungerBoost','HungerRestore'])]),catalog());
 const c=r.plans.find(t=>t.key==='combo:growEggs#afk');
 assert.ok(c&&c.petIds.includes('feeder'));
 assert.equal(c.mode,'afk');assert.equal(c.trigger,'continuous');
 assert.deepEqual(c.contributions.map(x=>x.family),['PlantGrowthBoost','EggGrowthBoost']);
 assert.match(c.note,/keine Laufzeitgarantie/);
});
test('weather-only ability cannot sneak into general AFK mix',()=>{
 const r=createEffectTeamBuilder().build(snapshot([
   pet('snow',['SnowyEggGrowthBoost']),pet('grow',['PlantGrowthBoost']),pet('feed',['HungerRestore'])]),catalog());
 assert.ok(!r.plans.some(t=>t.key==='combo:growEggs#afk'));
});
test('pet sale combo uses only native SellPet abilities, not crop-selling boosts',()=>{
 const r=createEffectTeamBuilder().build(snapshot([
   pet('dust',['DustBoost']),pet('refund',['PetRefund']),pet('crop',['SellBoostIII'])]),catalog());
 const c=r.plans.find(t=>t.key==='combo:petSale#active');
 assert.ok(c);
 assert.deepEqual(c.contributions.map(x=>x.family),['DustBoost','PetRefund']);
 assert.ok(!c.petIds.includes('crop'));
});
test('newly hatched stronger multi-boost Pet updates combo members without changing its stable key or saved native ID',async()=>{
 const s=snapshot([pet('old',['PetHatchSizeBoost'],94),pet('xp',['PetAgeBoost'],94),
   pet('double',['DoubleHatch'],95)]),c=catalog(),builder=createEffectTeamBuilder();
 const h=registryFixture({s});
 const old=builder.build(s,c).plans.find(p=>p.key==='combo:hatch#active');
 assert.ok(old);h.r.update(s,[old]);
 assert.equal((await h.r.save(s,old.key)).ok,true);
 const nativeId=h.sent[0].teamId;
 s.inventory.items.push(pet('new',['PetHatchSizeBoostIII','PetAgeBoost'],100));
 const improved=builder.build(s,c,h.r.list(s)).plans.find(p=>p.key==='combo:hatch#active');
 assert.ok(improved.petIds.includes('new'));
 h.r.update(s,[improved]);
 assert.equal((await h.r.save(s,improved.key)).ok,true);
 assert.equal(h.sent[1].teamId,nativeId);
 assert.equal(h.sent[1].isCreate,false);
 assert.ok(h.sent[1].petIds.includes('new'));
});
test('XP team leaves a trainee slot and action-triggered selling never gets an AFK label',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('a',['PetXpBoost','HungerBoost']),pet('b',['PetXpBoost','SellBoostI']),pet('c',['PetXpBoost','HungerRestore'])]),catalog());
 assert.ok(r.plans.filter(t=>t.family==='PetXpBoost').every(t=>t.petIds.length<=2&&t.trainingSlot));assert.ok(!r.plans.some(t=>t.trigger==='sellAllCrops'&&t.mode==='afk'));
});
test('AFK combinations include appropriate passive hunger support and mark estimates honestly',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('a',['EggGrowthBoostII']),pet('b',['EggGrowthBoost']),pet('feed',['HungerBoost','HungerRestore'])]),catalog());
 const afk=r.plans.find(t=>t.family==='EggGrowthBoost'&&t.mode==='afk');assert.ok(afk.petIds.includes('feed'));assert.match(afk.note,/keine Garantie/);
});
test('seasonal effects remain separate and do not become all-weather AFK',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('snow',['SnowyEggGrowthBoost']),pet('regular',['EggGrowthBoost']),pet('feed',['HungerRestore'])]),catalog());
 assert.ok(r.plans.some(t=>t.weather==='Frost'));assert.ok(!r.plans.some(t=>t.weather&&t.mode==='afk'));
});
test('unknown rolled capability protects a pet from surplus classification',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('a',['SellBoostI','Unknown']),...['b','c','d'].map(x=>pet(x,['SellBoostIII']))]),catalog());
 assert.notEqual(r.decisions.find(d=>d.id==='a').kind,'surplus');
});
test('native sizeIncrease is flat, not falsely multiplied by current/max strength',()=>{
 const b=createEffectTeamBuilder();assert.equal(b.effect('ProduceScaleBoost',definitions.ProduceScaleBoost,80).values.sizeIncrease,10);
});
test('owned pets normalize wrapper/data forms, deduplicate IDs and include Hutch',()=>{
 const s=snapshot([{itemType:'Pet',id:'nested',data:{petSpecies:'Pig',targetScale:1.5,xp:0,abilities:['SellBoostI'],mutations:[]}}]);
 s.own.petSlots=[{slot:pet('ACTIVE',['SellBoostI'])}];s.inventory.storages=[{decorId:'PetHutch',items:[pet('active',['SellBoostI']),pet('stored',['EggGrowthBoost'])]}];
 assert.deepEqual(createEffectTeamBuilder().pets(s,catalog()).map(p=>p.id),['ACTIVE','nested','stored']);
});
test('unknown catalog produces no invented team effects',()=>{
 const r=createEffectTeamBuilder().build(snapshot([pet('a',['SellBoostI'])]),{pets:catalog().pets});assert.equal(r.ready,false);assert.equal(r.plans.length,0);
});
function registryFixture(opts={}){
 let now=1000,seq=0;const s=opts.s||snapshot([pet('a',['SellBoostI']),pet('b',['SellBoostI'])]),storage=opts.storage||store(),sent=[];
 const env={storage,uuid:()=>`team-${++seq}`,now:()=>now,snapshot:()=>s,send:async c=>{sent.push(c);if(opts.reject){const e=Error('refused');e.code='rejected';throw e;}
   if(opts.timeout)throw Error('unknown result');
   let t=s.own.petTeams.find(t=>t.id===c.teamId);if(!t)s.own.petTeams.push(t={id:c.teamId,name:c.name});t.members=c.petIds.map(petId=>({petId}));return {ok:true,observed:true};}};
 return {r:createTeamRegistry(env),s,env,storage,sent,advance:ms=>now+=ms};
}
const tplan=(ids=['a'])=>({key:'sell-effect#active',name:'Sell Boost',mode:'active',petIds:ids});
test('teams persist locally before saving and use stable native ID for improvements',async()=>{
 const h=registryFixture();assert.equal(h.r.update(h.s,[tplan()]),true);await h.r.save(h.s,tplan().key);
 const id=h.sent[0].teamId;h.r.update(h.s,[tplan(['b'])]);await h.r.save(h.s,tplan().key);
 assert.equal(h.sent[1].teamId,id);assert.equal(h.sent[1].isCreate,false);assert.deepEqual(h.sent[1].petIds,['b']);
});
test('identical team refresh sends no duplicate SavePetTeam',async()=>{
 const h=registryFixture();h.r.update(h.s,[tplan()]);await h.r.save(h.s,tplan().key);h.r.update(h.s,[tplan()]);await h.r.save(h.s,tplan().key);assert.equal(h.sent.length,1);
});
test('F5 reconstruction retains the same managed IDs and templates',async()=>{
 const h=registryFixture();h.r.update(h.s,[tplan()]);await h.r.save(h.s,tplan().key);
 const again=createTeamRegistry(h.env);assert.equal(again.list(h.s)[0].id,h.sent[0].teamId);await again.save(h.s,tplan().key);assert.equal(h.sent.length,1);
});
test('manual saved-team member edit pauses syncing instead of overwriting player choice',async()=>{
 const h=registryFixture();h.r.update(h.s,[tplan()]);await h.r.save(h.s,tplan().key);h.s.own.petTeams[0].members=[{petId:'b'}];
 const next=await h.r.save(h.s,tplan().key);assert.equal(next.ok,false);assert.match(next.reason,/Manuell/);assert.equal(h.sent.length,1);
});
test('unknown save outcome holds its UUID and prevents duplicate creates across restart',async()=>{
 const h=registryFixture({timeout:true});h.r.update(h.s,[tplan()]);await h.r.save(h.s,tplan().key);h.advance(1000000);
 await createTeamRegistry(h.env).save(h.s,tplan().key);assert.equal(h.sent.length,1);
});
test('unavailable pets make templates stale without deleting user/game teams',async()=>{
 const h=registryFixture();h.r.update(h.s,[tplan()]);await h.r.save(h.s,tplan().key);h.r.update(h.s,[]);
 assert.equal(h.r.list(h.s)[0].stale,true);assert.equal(h.s.own.petTeams.length,1);assert.equal((await h.r.save(h.s,tplan().key)).ok,false);
});
test('registry refuses game writes if persistent storage fails',async()=>{
 const h=registryFixture({storage:{getItem:()=>null,setItem(){throw Error('quota')}}});assert.equal(h.r.update(h.s,[tplan()]),false);
 assert.equal((await h.r.save(h.s,tplan().key)).ok,false);assert.equal(h.sent.length,0);
});
test('team registry is owner-bound rather than mixing two players',()=>{
 const h=registryFixture();h.r.update(h.s,[tplan()]);h.s.ownerKey='other-account';assert.equal(h.r.list(h.s).length,0);
});
function actionsFixture(opts={}){
 let running=true;const s=snapshot([pet('boost',['SellBoostIII'])]);s.own.petSlots=[pet('old',['HungerRestore'])];
 const calls=[];const chosen={key:'sell',petIds:['boost']};
 const registry={snapshotTeam:async()=>({ok:true,id:'old-template'}),save:async()=>({ok:true,id:'new-template'})};
 const a=createTeamActions({snapshot:()=>s,running:()=>running,registry,choose:()=>chosen,sendRaw:async c=>{
  calls.push(c.type+':'+(c.teamId||''));
  if(c.type==='ApplyPetTeam'&&opts.noEcho)return {ok:true};
  if(c.type==='ApplyPetTeam')s.own.petSlots=[pet(c.teamId==='new-template'?'boost':'old',['SellBoostI'])];
  if(opts.stopAfterSwap&&c.teamId==='new-template')running=false;
  if(c.type==='SellAllCrops'&&opts.manualChange)s.own.petSlots=[pet('manual',['SellBoostI'])];
  if(c.type==='SellAllCrops'&&opts.failAction)throw Error('sale rejected');return {ok:true};
 }});return {a,s,calls,resume:()=>running=true};
}
test('temporary switch executes apply → confirmed action → restore in serial order',async()=>{
 const h=actionsFixture();await h.a.execute({type:'SellAllCrops'});assert.deepEqual(h.calls,['ApplyPetTeam:new-template','SellAllCrops:','ApplyPetTeam:old-template']);
});
test('positive switch ACK without observed team state must NOT authorize a sale',async()=>{
 const h=actionsFixture({noEcho:true});await assert.rejects(()=>h.a.execute({type:'SellAllCrops'}),/nicht bestätigt/);assert.ok(!h.calls.includes('SellAllCrops:'));
});
test('manual intervention after action is not overwritten by restoration',async()=>{
 const h=actionsFixture({manualChange:true});await h.a.execute({type:'SellAllCrops'});assert.equal(h.s.own.petSlots[0].id,'manual');assert.equal(h.calls.length,2);
});
test('Stop while switching blocks action and defers restoration until explicit restart',async()=>{
 const h=actionsFixture({stopAfterSwap:true});await assert.rejects(()=>h.a.execute({type:'SellAllCrops'}));assert.equal(h.calls.length,1);
 h.resume();await h.a.resumeReturn();assert.deepEqual(h.calls,['ApplyPetTeam:new-template','ApplyPetTeam:old-template']);
});
test('failed action still restores previous team when no manual interference occurred',async()=>{
 const h=actionsFixture({failAction:true});await assert.rejects(()=>h.a.execute({type:'SellAllCrops'}));assert.equal(h.s.own.petSlots[0].id,'old');
});
test('revalidation after team switch can veto destructive action',async()=>{
 const h=actionsFixture();await assert.rejects(()=>h.a.execute({type:'SellAllCrops'},{validate:()=>false}),/freigegeben/);assert.ok(!h.calls.includes('SellAllCrops:'));
});
function coreFixture(opts={}){
 let clock=1000;const s=snapshot([pet('best',['SellBoostIII'],100),pet('next',['SellBoostIII'],99),pet('third',['SellBoostIII'],98),pet('weak',['SellBoostI'],85)]),storage=opts.storage||store(),sent=[];
 const c=catalog(),e=createAutomationCore({storage,now:()=>clock,uuid:()=>String(Math.random()),running:()=>true,snapshot:()=>s,protected:(_,p)=>!!p?.locked,loadCatalogs:async()=>({}),withPetLock:opts.noLock?undefined:async f=>f(),send:async command=>{
 sent.push(command);if(opts.refuse){const e=Error('SellPet rejected');e.code='rejected';e.definite=true;throw e;}
 if(command.type==='SellPet'&&!opts.ackOnly)s.inventory.items=s.inventory.items.filter(p=>p.id!==command.itemId);
 return {ok:true,observed:!opts.ackOnly};}});
 Object.assign(e.catalogs(),c);e.configure({enabled:true,petSell:true,petSellEggs:['CommonEgg']});
 return {e,s,sent,storage,tick:ms=>clock+=ms};
}
test('missing journal no longer silently blocks a proven surplus pet sale',async()=>{
 const h=coreFixture();delete h.s.own.journal;await h.e.step();assert.deepEqual(h.sent,[{type:'SellPet',itemId:'weak'}]);
 assert.equal(h.e.status().modules.find(m=>m.id==='petSell').confirmed,1);
});
test('Pet Sell success ACK with pet still present does not increment sold counter',async()=>{
 const h=coreFixture({ackOnly:true});await h.e.step();assert.equal(h.e.status().modules.find(m=>m.id==='petSell').confirmed,0);
 h.tick(1000);await h.e.step();assert.equal(h.sent.length,1);
});
test('definite refusal is never converted into success based on a stale inventory',async()=>{
 const h=coreFixture({refuse:true});await h.e.step();assert.equal(h.e.status().modules.find(m=>m.id==='petSell').confirmed,0);
});
test('favorites, mutation and native team membership each block pet selling',async()=>{
 for(const setup of [h=>h.s.inventory.favoritedItemIds.push('weak'),h=>h.s.inventory.items[3].mutations=['Gold'],h=>h.s.own.petTeams.push({id:'manual',members:[{petId:'weak'}]})]){
  const h=coreFixture();setup(h);await h.e.step();assert.equal(h.sent.length,0);
 }
});
test('exact unknown egg origin has a concrete diagnostic instead of guessed disposal',async()=>{
 const h=coreFixture();delete h.s.inventory.items[3].sourceEggId;const row=h.e.petSellProposal().rows.find(r=>r.id==='weak');assert.match(row.reason,/Herkunftsei fehlt/);await h.e.step();assert.equal(h.sent.length,0);
});
test('Pet Sell blocks if tab lock capability is unavailable',async()=>{
 const h=coreFixture({noLock:true});await h.e.step();assert.equal(h.sent.length,0);assert.match(h.e.status().modules.find(m=>m.id==='petSell').status,/Tabsperre/);
});
test('six surplus pets can sell: hidden legacy five-pet cap was removed',async()=>{
 const h=coreFixture();for(let i=0;i<6;i++)h.s.inventory.items.push(pet('extra'+i,['SellBoostI'],81));
 for(let i=0;i<7;i++){await h.e.step();h.tick(2000);}assert.equal(h.sent.length,7);
});
test('configuration keeps independent switches and contains no farm-mode presets',()=>{
 const h=coreFixture();const c=h.e.configure({buy:false,eggs:true,hatch:false,autoTeams:false,teamBuilder:true});
 assert.equal(c.buy,false);assert.equal(c.hatch,false);assert.equal(c.eggs,true);assert.equal(c.teamBuilder,true);assert.equal('farmMode' in c,false);
});
test('buy editor model preserves only selected item and target, ignores stale budget and price cap',()=>{
 const h=coreFixture();const c=h.e.configure({buyRules:[{type:'Seed',id:'Carrot',maxOwned:14,shop:'auto',maxPrice:0,perRestock:1}],dailyBudget:0,coinReserve:1e99});
 assert.deepEqual(c.buyRules,[{type:'Seed',id:'Carrot',shop:'auto',maxOwned:14}]);assert.equal('dailyBudget'in c,false);
});


test('full inventory portfolio can cover three rolled effects with three different stronger reserved pets',()=>{
 const boost=['SeedFinderI','ProduceEater','GoldGranter'];
 const items=[pet('weak-triple',boost,80)];
 for(const [family,tag] of [['SeedFinderI','seed'],['ProduceEater','eater'],['GoldGranter','gold']]){
   for(let n=0;n<3;n++)items.push(pet(tag+n,[family],96+n));
 }
 const plan=createEffectTeamBuilder().build(snapshot(items),catalog());
 const weak=plan.decisions.find(p=>p.id==='weak-triple');
 assert.equal(weak.kind,'surplus');
 assert.equal(weak.replacements.length,3,'one different team pet covers each rolled effect');
 assert.ok(weak.replacements.every(id=>plan.reserved.includes(id.toLowerCase())));
 assert.ok(!plan.reserved.includes('weak-triple'));
});
test('portfolio refuses to dispose of a triple-boost pet while any family remains uncovered',()=>{
 const items=[pet('special',['SeedFinderI','ProduceEater','GoldGranter'],80)];
 for(let i=0;i<3;i++)items.push(pet('seed'+i,['SeedFinderI'],96+i),pet('eater'+i,['ProduceEater'],96+i));
 const plan=createEffectTeamBuilder().build(snapshot(items),catalog());
 const special=plan.decisions.find(p=>p.id==='special');
 assert.equal(special.kind,'keep');
 assert.ok(plan.reserved.includes('special'));
});
test('unknown ability metadata prevents selling even if other known boosts are covered',()=>{
 const items=[pet('mystery',['SeedFinderI','FutureSecretBoost'],80)];
 for(let i=0;i<3;i++)items.push(pet('seed'+i,['SeedFinderI'],96+i));
 const plan=createEffectTeamBuilder().build(snapshot(items),catalog());
 assert.equal(plan.decisions.find(p=>p.id==='mystery').kind,'unknown');
});
