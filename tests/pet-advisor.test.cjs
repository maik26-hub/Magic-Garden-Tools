'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPetAdvisor}=require('../src/pet-advisor.js');
const advisor=createPetAdvisor();
const catalogue={
  Bee:{name:'Bee',maxScale:2,hoursToMature:12},
  Chicken:{name:'Chicken',maxScale:2.2,hoursToMature:24},
  Turtle:{name:'Turtle',maxScale:2.4,hoursToMature:100},
  Peacock:{name:'Peacock',maxScale:2.5,hoursToMature:144}
};
const abilities={
  SellBoostI:{name:'Sell Boost I',baseProbability:10,baseParameters:{sellBonusPercentage:20}},
  SellBoostIV:{name:'Sell Boost IV',baseProbability:16,baseParameters:{sellBonusPercentage:50}},
  EggGrowthBoost:{name:'Egg Growth Boost',baseProbability:21,baseParameters:{growthReductionSeconds:420}},
  EggGrowthBoostII:{name:'Egg Growth Boost II',baseProbability:27},
  HungerBoost:{name:'Hunger Boost',baseProbability:12},
  PetMutationBoost:{name:'Pet Mutation Boost',baseProbability:7},
  PetHatchSizeBoost:{name:'Max Strength Boost',baseProbability:12},
};
const p=(id,species,stats={})=>({
 id,itemType:'Pet',petSpecies:species,name:species,sourceEggId:'CommonEgg',
 targetScale:1.7,xp:0,hunger:1000,mutations:[],
 abilities:[],...stats
});
function sample(){
 const inventory={items:[],favoritedItemIds:[],storages:[]};
 return {actor:'mine',generation:1,game:{weather:'Normal'},
  inventory,own:{petSlots:[],petTeams:[],journal:{pets:{}}}};
}
function logged(s,species,ids=[]){
 s.own.journal.pets[species]={
  variantsLogged:[{variant:'Normal'}],
  abilitiesLogged:ids.map(ability=>({ability}))
 };
}
function run(s,goal='afk'){
 return advisor.analyze(s,{pets:catalogue,abilities},goal);
}
test('exact current and maximum strength follow catalog XP per-level formula',()=>{
 const pet=p('a','Bee',{xp:1440*10,targetScale:1.7});
 assert.deepEqual(advisor.strength(pet,catalogue.Bee),{
  current:74,max:94,base:64,progress:10,stepsRemaining:20,
  xpPerLevel:1440,xpToNext:1440
 });
});
test('unknown target scale or catalog are not assigned fictional STR',()=>{
 assert.equal(advisor.strength(p('a','Bee',{targetScale:undefined}),catalogue.Bee),null);
 assert.equal(advisor.strength(p('a','Bee'),{}),null);
});
test('active pet, pet hutch, inventory are merged once by pet ID',()=>{
 const s=sample();
 s.own.petSlots=[p('a','Bee')];
 s.inventory.items=[p('b','Peacock')];
 s.inventory.storages=[{decorId:'SeedSilo',items:[p('wrong','Turtle')]},
  {decorId:'PetHutch',items:[p('c','Chicken'),p('a','Bee')]}];
 const report=run(s,'sellCrops');
 assert.deepEqual(report.locations,{active:1,inventory:1,hutch:1});
 assert.deepEqual(report.profiles.map(x=>x.id),['a','b','c']);
});
test('own actual abilities are required, species alone does not grant buffs',()=>{
 const s=sample();
 s.inventory.items=[p('a','Peacock',{abilities:[]}),
  p('b','Bee',{abilities:['SellBoostIV']})];
 const report=run(s,'sellCrops');
 assert.equal(report.recommendations[0],'b');
 assert.equal(report.profiles.find(x=>x.id==='a').rated,false);
});
test('different levels score differently for the SAME rolled boost',()=>{
 const s=sample();
 s.inventory.items=[
  p('weak','Bee',{abilities:['SellBoostI'],xp:0}),
  p('strong','Bee',{abilities:['SellBoostI'],xp:1440*25})
 ];
 const report=run(s,'sellCrops');
 const byId=Object.fromEntries(report.profiles.map(x=>[x.id,x]));
 assert.ok(byId.strong.now.score>byId.weak.now.score);
 assert.equal(byId.strong.future.score,byId.weak.future.score);
});
test('higher-tier boost scores more for same current strength',()=>{
 const s=sample();
 s.inventory.items=[
  p('a','Bee',{abilities:['SellBoostI']}),
  p('b','Bee',{abilities:['SellBoostIV']})
 ];
 assert.equal(run(s,'sellCrops').recommendations[0],'b');
});
test('goal changes recommended team based on actual pet abilities',()=>{
 const s=sample();
 s.inventory.items=[
  p('sale','Bee',{abilities:['SellBoostIV']}),
  p('egg','Chicken',{abilities:['EggGrowthBoost']}),
  p('afk','Turtle',{abilities:['HungerBoost']})
 ];
 assert.equal(run(s,'sellCrops').recommendations[0],'sale');
 assert.equal(run(s,'hatchSpeed').recommendations[0],'egg');
 assert.equal(run(s,'afk').recommendations[0],'afk');
});
test('weather-gated boosts score zero outside their weather',()=>{
 const s=sample();
 s.inventory.items=[p('snow','Bee',{abilities:['SnowyEggGrowthBoost']})];
 assert.equal(run(s,'hatchSpeed').profiles[0].now.score,0);
 s.game.weather='Frost';
 assert.ok(run(s,'hatchSpeed').profiles[0].now.score>0);
});
test('pet mutations, favorites, team members, hutch and active pets are protected',()=>{
 const s=sample();
 logged(s,'Bee',['SellBoostI']);
 s.inventory.items=[
  p('star','Bee',{abilities:['SellBoostI']}),
  p('mutation','Bee',{abilities:['SellBoostI'],mutations:['Gold']}),
  p('team','Bee',{abilities:['SellBoostI']}),
  p('plain','Bee',{abilities:['SellBoostI']})
 ];
 s.inventory.favoritedItemIds=['star'];
 s.own.petTeams=[{id:'t',members:[{petId:'team'}]}];
 s.own.petSlots=[p('active','Bee',{abilities:['SellBoostI']})];
 s.inventory.storages=[{decorId:'PetHutch',items:[p('hutch','Bee',{abilities:['SellBoostI']})]}];
 const report=run(s);
 for(const id of ['star','mutation','team','active','hutch']){
  assert.equal(report.profiles.find(x=>x.id===id).protected,true,id);
 }
 assert.equal(report.profiles.find(x=>x.id==='plain').protected,false);
});
test('source egg unknown blocks sell comparison; do not infer from species',()=>{
 const s=sample();
 logged(s,'Bee',['SellBoostI']);
 s.inventory.items=[
  p('weak','Bee',{sourceEggId:undefined,abilities:['SellBoostI']}),
  p('strong','Bee',{sourceEggId:undefined,abilities:['SellBoostI'],xp:1440*20})
 ];
 assert.equal(run(s).reviews.length,0);
});
test('only dominated duplicates with same actual rolled abilities and egg provenance are suggested',()=>{
 const s=sample();
 logged(s,'Bee',['SellBoostI']);
 s.inventory.items=[
  p('weak','Bee',{abilities:['SellBoostI'],targetScale:1.5,xp:1440*5}),
  p('strong','Bee',{abilities:['SellBoostI'],targetScale:1.7,xp:1440*30}),
  p('special','Bee',{abilities:['SellBoostIV'],targetScale:1.5,xp:1440*5})
 ];
 const report=run(s,'sellCrops');
 assert.deepEqual(report.reviews.map(x=>x.id),['weak']);
 assert.equal(report.readOnly,true);
});
test('journal-unknown abilities protect apparent duplicates against irreversible sale',()=>{
 const s=sample();
 s.inventory.items=[
  p('weak','Bee',{abilities:['SellBoostI'],targetScale:1.5}),
  p('strong','Bee',{abilities:['SellBoostI'],targetScale:1.7,xp:1440*30})
 ];
 assert.equal(run(s).reviews.length,0);
});
test('read-only advisor never mutates inventory, team definitions, storage or game commands',()=>{
 const s=sample();
 s.inventory.items=[p('x','Chicken',{abilities:['EggGrowthBoost']})];
 const before=JSON.stringify(s);
 const report=run(s,'hatchSpeed');
 assert.equal(JSON.stringify(s),before);
 assert.equal(report.readOnly,true);
 assert.equal(report.recommendations.length,1);
});
test('inapplicable or unrecognized ability is not treated as a bad pet',()=>{
 const s=sample();
 s.inventory.items=[p('mystery','Bee',{abilities:['NewUniqueAbility']})];
 const r=run(s,'sellCrops');
 assert.equal(r.recommendations.length,0);
 assert.equal(r.profiles[0].rated,false);
 assert.equal(r.reviews.length,0);
});
