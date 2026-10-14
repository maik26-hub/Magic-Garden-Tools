'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAutomationCore}=require('../src/automation-core.js');

function store(){
  const map=new Map();
  return {
    getItem:key=>map.get(key)??null,
    setItem:(key,value)=>map.set(key,String(value)),
    map
  };
}
function egg(id,qty=1,extra={}){
  return {itemType:'Egg',eggId:id,quantity:qty,...extra};
}
function placed(id,maturedAt=0,plantedAt=1){
  return {objectType:'egg',eggId:id,maturedAt,plantedAt};
}
async function fixture({saved=null,withCatalog=false,mutate=false}={}){
  const storage=store(),calls=[],clock=Date.parse('2026-10-14T12:00:00Z');
  if(saved)storage.setItem('magic_garden_automation_v15',JSON.stringify(saved));
  const s={
    actor:'own',generation:1,serverNow:clock,
    fieldModes:Array(200).fill('none'),selected:[],
    garden:{},inventory:{items:[],favoritedItemIds:[],storages:[]},
    own:{coinsCount:300000,petSlots:[],petTeams:[],shopPurchases:{},journal:{produce:{},pets:{}}},
    game:{weather:'Normal',shops:{}}
  };
  s.fieldModes[0]='egg';s.fieldModes[1]='egg';s.fieldModes[2]='egg';
  const core=createAutomationCore({
    storage, now:()=>s.serverNow, running:()=>true,
    protected:(_,i)=>Boolean(i?.locked||i?.protected||i?.preserved),
    snapshot:()=>s,
    loadCatalogs:async()=>withCatalog?{
      eggs:{CommonEgg:{name:'Common Egg',coinPrice:100,secondsToHatch:600,eligibleShops:['egg']},
        RareEgg:{name:'Rare Egg',coinPrice:500,secondsToHatch:1500,eligibleShops:['egg']}}
    }:{},
    send:async command=>{
      calls.push(structuredClone(command));
      if(mutate){
        if(command.type==='GrowEgg'){
          const i=s.inventory.items.find(i=>i.eggId===command.eggId&&i.quantity>0);
          if(i)i.quantity--;
          s.garden[command.slot]=placed(command.eggId,s.serverNow+10000,s.serverNow);
        }
        if(command.type==='HatchEgg')delete s.garden[command.slot];
      }
      return {ok:true};
    }
  });
  await core.loadCatalogs();
  return {core,s,calls,storage,advance(ms=4000){s.serverNow+=ms;},enable(patch){core.configure({enabled:true,...patch});}};
}

test('new installs can use all inventory eggs, but egg modules stay opt-in',async()=>{
  const h=await fixture();
  assert.equal(h.core.getConfig().eggPlaceMode,'all');
  assert.equal(h.core.getConfig().eggHatchMode,'all');
  h.s.inventory.items=[egg('CommonEgg')];
  assert.equal(await h.core.step(),false);
  assert.deepEqual(h.calls,[]);
});
test('all mode consumes mixed egg stacks in the actual inventory order',async()=>{
  const h=await fixture({mutate:true});
  h.enable({eggs:true});
  h.s.inventory.items=[egg('CommonEgg'),egg('RareEgg',2),egg('ThirdEgg',1)];
  await h.core.step();h.advance();await h.core.step();h.advance();await h.core.step();
  assert.deepEqual(h.calls,[
    {type:'GrowEgg',slot:0,eggId:'CommonEgg'},
    {type:'GrowEgg',slot:1,eggId:'RareEgg'},
    {type:'GrowEgg',slot:2,eggId:'RareEgg'}
  ]);
  assert.equal(h.s.inventory.items[0].quantity,0);
});
test('selected placement allows several types and skips an earlier unwanted stack',async()=>{
  const h=await fixture();h.enable({eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['RareEgg','ThirdEgg']});
  h.s.inventory.items=[egg('CommonEgg',10),egg('RareEgg',2),egg('ThirdEgg',2)];
  await h.core.step();
  assert.deepEqual(h.calls,[{type:'GrowEgg',slot:0,eggId:'RareEgg'}]);
});
test('selected placement with an empty list is disabled, not treated as all',async()=>{
  const h=await fixture();h.enable({eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:[]});
  h.s.inventory.items=[egg('CommonEgg',10)];
  assert.equal(await h.core.step(),false);
  assert.equal(h.calls.length,0);
  assert.match(h.core.status().modules.find(m=>m.id==='eggs').status,/Keine Eier zum Platzieren/);
});
test('favorite and protected eggs never get placed in all or selected mode',async()=>{
  const h=await fixture();h.enable({eggs:true});
  h.s.inventory.items=[egg('FavoriteEgg',2),egg('ProtectedEgg',3,{locked:true}),egg('AllowedEgg',0),egg('SafeEgg',2)];
  h.s.inventory.favoritedItemIds=['FavoriteEgg'];
  await h.core.step();
  assert.deepEqual(h.calls,[{type:'GrowEgg',slot:0,eggId:'SafeEgg'}]);
});
test('only blue empty plots may receive eggs; inventory stock is mandatory',async()=>{
  const h=await fixture();h.enable({eggs:true});
  h.s.fieldModes.fill('none');h.s.fieldModes[0]='plant';h.s.fieldModes[1]='egg';
  h.s.garden[1]=placed('CommonEgg');h.s.inventory.items=[egg('RareEgg')];
  await h.core.step();assert.deepEqual(h.calls,[]);
  h.s.garden[1]=null;
  h.s.inventory.items[0].quantity=0;await h.core.step();
  assert.deepEqual(h.calls,[]);
});
test('selected hatch filter ignores disallowed ripe eggs before opening allowed type',async()=>{
  const h=await fixture();h.enable({hatch:true,eggHatchMode:'selected',eggHatchAllowed:['RareEgg']});
  h.s.garden={0:placed('CommonEgg'),1:placed('RareEgg'),2:placed('ThirdEgg')};
  await h.core.step();
  assert.deepEqual(h.calls,[{type:'HatchEgg',slot:1}]);
});
test('hatch allowed types are independent of placement allowed types',async()=>{
  const h=await fixture();h.enable({
    eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['CommonEgg'],
    hatch:true,eggHatchMode:'selected',eggHatchAllowed:['RareEgg']
  });
  h.s.inventory.items=[egg('CommonEgg'),egg('RareEgg')];
  h.s.garden[0]=placed('CommonEgg');h.s.garden[1]=placed('RareEgg');
  assert.equal(h.core.preview().find(j=>j.module==='hatch')?.action,'HatchEgg');
  assert.equal(h.core.preview().find(j=>j.module==='eggs')?.action,'GrowEgg');
  await h.core.step();
  assert.deepEqual(h.calls,[{type:'HatchEgg',slot:1}]);
  assert.deepEqual(h.core.getConfig().eggPlaceAllowed,['CommonEgg']);
});
test('selected hatch with no allowlist never opens a rare or unknown egg',async()=>{
  const h=await fixture();h.enable({hatch:true,eggHatchMode:'selected',eggHatchAllowed:[]});
  h.s.garden={0:placed('RareEgg')};
  assert.equal(await h.core.step(),false);
  assert.deepEqual(h.calls,[]);
  assert.match(h.core.status().modules.find(m=>m.id==='hatch').status,/Keine Eier zum Ausbrüten/);
});
test('all hatch mode preserves old behavior without loading an egg catalog',async()=>{
  const h=await fixture();h.enable({hatch:true});
  h.s.garden={0:placed('UnknownEgg')};
  await h.core.step();
  assert.deepEqual(h.calls,[{type:'HatchEgg',slot:0}]);
});
test('saved v15.2.1 single egg migrates to selected placement without broadening permissions',async()=>{
  const h=await fixture({saved:{eggs:true,hatch:true,eggId:'CommonEgg'}});
  const c=h.core.getConfig();
  assert.equal(c.eggPlaceMode,'selected');
  assert.deepEqual(c.eggPlaceAllowed,['CommonEgg']);
  assert.equal(c.eggHatchMode,'all');
  assert.equal('eggId' in c,false);
  h.enable({eggPlaceMode:'selected'});
  assert.deepEqual(h.core.getConfig().eggPlaceAllowed,['CommonEgg']);
  h.s.inventory.items=[egg('RareEgg'),egg('CommonEgg')];
  await h.core.step();
  assert.deepEqual(h.calls,[{type:'GrowEgg',slot:0,eggId:'CommonEgg'}]);
});
test('independent egg filters and mode persist through a new script instance',async()=>{
  const h=await fixture();h.enable({
    eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['RareEgg','CommonEgg'],
    hatch:true,eggHatchMode:'selected',eggHatchAllowed:['ThirdEgg']
  });
  const reload=await fixture({saved:JSON.parse(h.storage.getItem('magic_garden_automation_v15'))});
  const c=reload.core.getConfig();
  assert.deepEqual(c.eggPlaceAllowed,['RareEgg','CommonEgg']);
  assert.deepEqual(c.eggHatchAllowed,['ThirdEgg']);
  assert.equal(c.eggPlaceMode,'selected');
  assert.equal(c.eggHatchMode,'selected');
});
test('inventoried and currently placed egg variants appear even without price catalog',async()=>{
  const h=await fixture();
  h.s.inventory.items=[egg('InventoryOnlyEgg',4)];
  h.s.garden[0]=placed('OnGardenEgg');
  const eggs=h.core.menuChoices().eggFilterChoices;
  assert.deepEqual(eggs.map(x=>x.id).sort(),['InventoryOnlyEgg','OnGardenEgg']);
  assert.match(eggs.find(x=>x.id==='InventoryOnlyEgg').name,/4 im Inventar/);
  assert.match(eggs.find(x=>x.id==='OnGardenEgg').name,/0 im Inventar/);
});
test('invalid filters are ignored, valid multi-selection deduplicates up to 40 types',async()=>{
  const h=await fixture();
  h.core.configure({
    eggPlaceMode:'unlimited!',eggHatchMode:'junk',
    eggPlaceAllowed:['RareEgg','RareEgg',false,{id:'X'},...Array.from({length:45},(_,i)=>'Egg'+i)],
    eggHatchAllowed:['ThirdEgg','ThirdEgg',null]
  });
  const c=h.core.getConfig();
  assert.equal(c.eggPlaceMode,'all');
  assert.equal(c.eggHatchMode,'all');
  assert.equal(c.eggPlaceAllowed.length,40);
  assert.deepEqual(c.eggHatchAllowed,['ThirdEgg']);
});
