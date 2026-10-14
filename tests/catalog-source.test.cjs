'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {createNativeCatalogSource,identifyNativeCatalogs}=require('../src/catalog-source.js');
const {createAutomationCore}=require('../src/automation-core.js');
const BASE='https://magicgarden.gg/version/1601/assets/';
const fixture={
  plants:{Carrot:{name:'Carrot',seed:{coinPrice:10,eligibleShops:['seed']},crop:{baseSellPrice:20,maxSizeMultiplier:3}}},
  eggs:{CommonEgg:{name:'Common Egg',secondsToHatch:600,coinPrice:100000,faunaSpawnWeights:{Worm:1},eligibleShops:['egg']}},
  pets:{Worm:{diet:['Carrot'],coinsToFullyReplenishHunger:500}},
  mutations:{Gold:{group:'Growth',coinMultiplier:25},Wet:{group:'Weather',coinMultiplier:2}},
  tools:{WateringCan:{coinPrice:5000},Camera:{coinPrice:10000}},
  decor:{SeedSilo:{coinPrice:Infinity},FeedingTrough:{coinPrice:10000000}}
};
const marker='/* CommonEgg secondsToHatch faunaSpawnWeights baseSellPrice maxSizeMultiplier */ export const native = 1;';
function setup({nodes=[],entries=[],sources={},exports=fixture,release='1601',observe=true,fetchImpl,importImpl}={}){
  let clock=1000,observerCallback,loadedImports=[],fetched=[],currentRelease=release;
  class Observer {constructor(fn){observerCallback=fn;} observe(options){assert.deepEqual(options,{type:'resource',buffered:true});}disconnect(){}}
  const env={pageURL:()=> 'https://magicgarden.gg/r/test',release:()=>currentRelease,document:{querySelectorAll:()=>nodes},performance:{getEntriesByType:()=>entries},PerformanceObserver:observe?Observer:null,now:()=>clock,
    fetch:async(url,options)=>{fetched.push({url,options});if(fetchImpl)return fetchImpl(url,options);return {ok:Object.hasOwn(sources,url),status:200,text:async()=>sources[url],url};},
    importModule:async url=>{loadedImports.push(url);return importImpl?importImpl(url):exports;},fetchTimeoutMs:25,importTimeoutMs:25};
  const resolver=createNativeCatalogSource(env);
  return {resolver,env,loadedImports,fetched,addNode(url){nodes.push({src:url});},addEntry(url){entries.push({name:url});},emit(url){observerCallback?.({getEntries:()=>[{name:url}]});},advance(ms=11000){clock+=ms;},release(v){currentRelease=v;}};
}
test('catalog recognition handles the full namespace, not just its first few exports',()=>{
  const exports={};for(let i=0;i<1000;i++)exports['a'+i]=()=>i;
  Object.assign(exports,fixture);assert.deepEqual(Object.keys(identifyNativeCatalogs(exports)).sort(),Object.keys(fixture).sort());
});
test('catalog recognition allows a default-export container',()=>{assert.equal(Object.keys(identifyNativeCatalogs({default:fixture})).length,6);});
test('empty performance buffer is recovered from a DOM module link',async()=>{
  const h=setup({nodes:[{href:BASE+'BakedRoundedRect-newHash.js'}],sources:{[BASE+'BakedRoundedRect-newHash.js']:marker}});
  const result=await h.resolver.load();assert.equal(result.eggs.CommonEgg.name,'Common Egg');assert.equal(h.loadedImports.length,1);
});
test('renamed catalog is discovered through actual relative bootstrap imports',async()=>{
  const h=setup({nodes:[{src:BASE+'index-ab.js'}],sources:{[BASE+'index-ab.js']:'import "./Start-cc.js";', [BASE+'Start-cc.js']:'export {x} from "./GameData-renamed.js";', [BASE+'GameData-renamed.js']:marker}});
  assert.equal(Object.keys(await h.resolver.load()).length,6);assert.deepEqual(h.loadedImports,[BASE+'GameData-renamed.js']);
});
test('Vite dependency arrays using assets/X.js resolve at the version root',async()=>{
  const h=setup({nodes:[{src:BASE+'index-ab.js'}],sources:{[BASE+'index-ab.js']:'const deps=["assets/UnknownCatalog-cc.js"];', [BASE+'UnknownCatalog-cc.js']:marker}});
  assert.equal(Object.keys(await h.resolver.load()).length,6);assert.ok(h.fetched.some(x=>x.url===BASE+'UnknownCatalog-cc.js'));
});
test('unversioned same-origin assets also work',async()=>{
  const url='https://magicgarden.gg/assets/Shared-foo.js';const h=setup({release:'',nodes:[{src:url}],sources:{[url]:marker}});assert.equal(Object.keys(await h.resolver.load()).length,6);
});
test('early resource observer retains catalog entry after timing buffer is cleared',async()=>{
  const url=BASE+'Shared-foo.js',h=setup({sources:{[url]:marker}});h.emit(url);assert.equal(Object.keys(await h.resolver.load()).length,6);
});
test('late resources are discovered without restarting the bot',async()=>{
  const url=BASE+'Late-foo.js',h=setup({sources:{[url]:marker}});assert.equal(Object.keys(await h.resolver.load()).length,0);h.emit(url);assert.equal(Object.keys(await h.resolver.load()).length,6);
});
test('discovery never loads cross-origin scripts, private room URLs or wrong releases',async()=>{
  const h=setup({nodes:[{src:'https://evil.invalid/version/1601/assets/Test.js'},{src:'https://magicgarden.gg/version/1500/assets/Old.js'},{src:'https://magicgarden.gg/version/1601/api/rooms/secret?token=xx'},{src:'javascript:alert(1)'},{src:'https://magicgarden.gg/assets/Test.js#x'}],sources:{'https://magicgarden.gg/assets/Test.js':'export const none = 1;'}});
  await h.resolver.load();assert.deepEqual(h.fetched.map(x=>x.url),['https://magicgarden.gg/assets/Test.js']);assert.equal(h.loadedImports.length,0);
});
test('bootstrap source is read only; modules without catalog markers are not executed',async()=>{
  const url=BASE+'Boot-foo.js',h=setup({nodes:[{src:url}],sources:{[url]:'/* normal renderer startup */ export const boot=1;'}});await h.resolver.load();assert.equal(h.loadedImports.length,0);
});
test('catalog fetch omits credentials, cannot redirect, and uses own-origin requests',async()=>{
  const url=BASE+'Any.js',h=setup({nodes:[{src:url}],sources:{[url]:marker}});await h.resolver.load();const o=h.fetched[0].options;assert.equal(o.credentials,'omit');assert.equal(o.mode,'same-origin');assert.equal(o.redirect,'error');
});
test('successful discovery is cached and does not refetch on each UI refresh',async()=>{
  const url=BASE+'Any.js',h=setup({nodes:[{src:url}],sources:{[url]:marker}});await h.resolver.load();for(let i=0;i<5;i++)await h.resolver.load();assert.equal(h.fetched.length,1);assert.equal(h.loadedImports.length,1);
});
test('concurrent callers share one discovery pass',async()=>{
  const url=BASE+'Any.js',h=setup({nodes:[{src:url}],sources:{[url]:marker}});const a=h.resolver.load(),b=h.resolver.load();assert.equal(a,b);await Promise.all([a,b]);assert.equal(h.loadedImports.length,1);
});
test('transient module import rejection is retried without permanent empty catalogs',async()=>{
  const url=BASE+'Any.js';let tries=0;const h=setup({nodes:[{src:url}],sources:{[url]:marker},importImpl:()=>{if(++tries===1)throw Error('not ready');return fixture;}});
  assert.equal(Object.keys(await h.resolver.load()).length,0);h.advance();assert.equal(Object.keys(await h.resolver.load()).length,6);assert.equal(h.fetched.length,1);
});
test('hung fetch resolves as a retryable state, not an eternal loading spinner',async()=>{
  const url=BASE+'Any.js',h=setup({nodes:[{src:url}],fetchImpl:()=>new Promise(()=>{})});await h.resolver.load();assert.match(h.resolver.diagnostics().issue,/dauert zu lange/);assert.equal(h.resolver.diagnostics().loading,false);
});
test('hung import is not fired twice while pending',async()=>{
  const url=BASE+'Any.js',h=setup({nodes:[{src:url}],sources:{[url]:marker},importImpl:()=>new Promise(()=>{})});await h.resolver.load();h.advance();await h.resolver.load();assert.equal(h.loadedImports.length,1);assert.equal(h.resolver.diagnostics().loading,false);
});
test('split catalog modules are combined rather than accepting the first partial export',async()=>{
  const a=BASE+'Data1.js',b=BASE+'Data2.js',h=setup({nodes:[{src:a},{src:b}],sources:{[a]:marker,[b]:marker},importImpl:url=>url===a?{plants:fixture.plants,eggs:fixture.eggs}:{pets:fixture.pets,mutations:fixture.mutations,tools:fixture.tools,decor:fixture.decor}});assert.equal(Object.keys(await h.resolver.load()).length,6);
});
test('change of release clears loader cache and rejects modules from old version',async()=>{
  const a=BASE+'Data1.js',b='https://magicgarden.gg/version/1602/assets/Data2.js',h=setup({nodes:[{src:a}],sources:{[a]:marker,[b]:marker}});await h.resolver.load();h.release('1602');h.addNode(b);await h.resolver.load();assert.equal(h.resolver.diagnostics().release,'1602');assert.deepEqual(h.loadedImports,[a,b]);
});
function ownCore(noCatalogs=true){
  let t=1000;const sent=[],storage=new Map();const snap={actor:'me',generation:1,serverNow:1000,fieldModes:Array(200).fill('none'),garden:{},inventory:{items:[{itemType:'Egg',eggId:'OwnedNewEgg',quantity:2},{itemType:'Seed',species:'OwnedNewSeed',quantity:2}],favoritedItemIds:[],storages:[]},own:{coinsCount:1000,shopPurchases:{}},game:{shops:{}}};
  const core=createAutomationCore({storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},now:()=>t,snapshot:()=>snap,running:()=>true,protected:()=>false,send:async cmd=>{sent.push(cmd);return {ok:true};},loadCatalogs:async()=>noCatalogs?{}:fixture});
  return {core,snap,sent,advance:()=>{t+=3000;}};
}
test('owned eggs are selectable and placed on blue fields without waiting for prices',async()=>{
  const h=ownCore();h.snap.fieldModes[4]='egg';await h.core.loadCatalogs();assert.equal(h.core.menuChoices().eggs[0].id,'OwnedNewEgg');assert.equal(h.core.menuChoices().eggs[0].price,null);h.core.configure({enabled:true,eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['OwnedNewEgg']});await h.core.step();assert.deepEqual(h.sent,[{type:'GrowEgg',slot:4,eggId:'OwnedNewEgg'}]);
});
test('without catalog an egg selection does not invent eggs or touch grey plots',async()=>{
  const h=ownCore();h.core.configure({enabled:true,eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['OwnedNewEgg']});await h.core.step();assert.equal(h.sent.length,0);h.snap.fieldModes[1]='egg';h.snap.inventory.items=[];await h.core.step();assert.equal(h.sent.length,0);
});
test('owned seed fallback works on green only and no catalog means no purchase price is guessed',async()=>{
  const h=ownCore();h.snap.fieldModes[4]='plant';h.snap.game.shops.seed={restockId:'a',deadlineMs:99999,inventory:[{itemType:'Seed',species:'OwnedNewSeed',initialStock:10}]};h.core.configure({enabled:true,buy:true,buyRules:[{type:'Seed',id:'OwnedNewSeed',shop:'seed',maxPrice:10,perRestock:1,maxOwned:50}]});await h.core.step();assert.equal(h.sent.length,0);h.core.configure({plant:true,seedSpecies:'OwnedNewSeed'});await h.core.step();assert.deepEqual(h.sent,[{type:'PlantSeed',slot:4,species:'OwnedNewSeed'}]);
});
test('core retries initial empty results sooner than the old fixed thirty seconds',async()=>{
  let t=1000,calls=0;const h=ownCore();const c=createAutomationCore({storage:{getItem:()=>null,setItem(){}},now:()=>t,snapshot:()=>h.snap,running:()=>false,loadCatalogs:async()=>++calls===1?{}:fixture});await c.loadCatalogs();t+=2100;await c.loadCatalogs();assert.equal(calls,2);assert.equal(c.menuChoices().eggs.some(e=>e.id==='CommonEgg'),true);assert.match(c.status().catalogs,/Geladen/);
});
test('removed legacy reserve/day-budget keys neither persist nor block new rules',()=>{
  const h=ownCore();h.core.configure({dailyBudget:0,coinReserve:999999});assert.equal('dailyBudget' in h.core.getConfig(),false);assert.equal('coinReserve' in h.core.getConfig(),false);assert.equal('budget' in h.core.status(),false);
});
