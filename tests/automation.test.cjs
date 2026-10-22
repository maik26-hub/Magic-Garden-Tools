'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {createAutomationCore}=require('../src/automation-core.js');
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),map};}
const plant=(species='Carrot',extra={})=>({objectType:'plant',species,plantedAt:1,slots:[{slotId:0,endTime:0,size:50,mutations:[],...extra}]});
const produce=(id='food1',species='Carrot',extra={})=>({itemType:'Produce',id,species,size:50,mutations:[],...extra});
const stack=(type,id,quantity=10)=>({itemType:type,[{Seed:'species',Egg:'eggId',Tool:'toolId',Decor:'decorId'}[type]]:id,quantity});
function exportsFixture(){return {
 randomPlants:{Carrot:{seed:{coinPrice:10,eligibleShops:['seed']},crop:{baseSellPrice:20,maxSizeMultiplier:3}},Blueberry:{seed:{coinPrice:50,eligibleShops:['seed']},crop:{baseSellPrice:40,maxSizeMultiplier:3}}},
 randomPets:{Worm:{diet:['Carrot'],coinsToFullyReplenishHunger:500,maxScale:2},Snail:{diet:['Blueberry'],coinsToFullyReplenishHunger:1000}},
 randomEggs:{CommonEgg:{coinPrice:100000,secondsToHatch:600,eligibleShops:['egg']}},
 randomTools:{WateringCan:{coinPrice:5000,eligibleShops:['tool'],maxInventoryQuantity:99},Camera:{coinPrice:10000,isOneTimePurchase:true,eligibleShops:['tool']}},
 randomMutations:{Gold:{group:'Growth',coinMultiplier:25},Rainbow:{group:'Growth',coinMultiplier:50},Wet:{group:'Weather',coinMultiplier:2},Chilled:{group:'Weather',coinMultiplier:2}},
 randomDecor:{SeedSilo:{coinPrice:Infinity,baseCapacitySlots:10},FeedingTrough:{coinPrice:1e7,eligibleShops:['tool'],baseCapacitySlots:9},Fence:{coinPrice:500,eligibleShops:['decor']}}
};}
async function harness(options={}){
 let clock=Date.parse('2026-10-14T12:00:00Z'),running=true;const st=options.storage||storage(),commands=[];
 const snap={actor:'player-self',generation:1,serverNow:clock,selected:[0,1,2,3],fieldModes:Array.from({length:200},(_,i)=>i<4?'plant':'none'),heldId:'',garden:{},inventory:{items:[],favoritedItemIds:[],storages:[]},own:{coinsCount:1000000,petSlots:[],petTeams:[],journal:{produce:{},pets:{}},shopPurchases:{}},game:{weather:null,shops:{}}};
 const e=createAutomationCore({storage:st,now:()=>clock,running:()=>running,protected:(_,i)=>i?.locked===true||i?.preserved===true||i?.protected===true,snapshot:()=>options.noSnapshot?null:snap,loadCatalogs:async()=>options.noCatalogs?{}:exportsFixture(),withPurchaseLock:options.noLock?undefined:async(_actor,fn)=>fn(),send:async command=>{commands.push(structuredClone(command));if(options.reject)throw Error('timeout');if(options.onSend)return options.onSend(command,snap);return {ok:true};}});
 await e.loadCatalogs();return {e,s:snap,st,commands,advance(ms=2000){clock+=ms;snap.serverNow=clock;},stop(){running=false;e.stop();},enable(patch){e.configure({enabled:true,...patch});},clock:()=>clock};
}
function shop(s,type,id,price,shopId='seed'){s.game.shops[shopId]={restockId:'restockA',deadlineMs:s.serverNow+60000,inventory:[{...stack(type,id),initialStock:10}]};return {type,id,shop:shopId,maxPrice:price,perRestock:3,maxOwned:30};}
test('all new modules and purchasing are opt-in',async()=>{const h=await harness();h.s.inventory.items=[stack('Seed','Carrot')];assert.equal(await h.e.step(),false);assert.equal(h.commands.length,0);assert.equal("dailyBudget" in h.e.getConfig(),false);assert.equal("coinReserve" in h.e.getConfig(),false);});
test('native catalogs identified by structure, not minified export symbols',async()=>{const h=await harness();assert.equal(Object.keys(h.e.catalogs()).length,6);assert.equal(h.e.choices().seeds.includes('Carrot'),true);});
test('native coin value matches size and additive weather/growth mutations',async()=>{const h=await harness();assert.equal(h.e.produceValue(produce()),20);assert.equal(h.e.produceValue(produce('x','Carrot',{size:100})),60);assert.equal(h.e.produceValue(produce('x','Carrot',{size:100,mutations:['Gold','Wet','Chilled']})),4500);assert.equal(h.e.produceValue(produce('x','unknown')),null);assert.equal(h.e.produceValue(produce('x','Carrot',{mutations:['NewUnknownMutation']})),null);});
test('plant existing whitelisted seeds only onto selected empty plot',async()=>{const h=await harness();h.enable({plant:true,seedSpecies:'Carrot'});h.s.garden[0]=plant('Blueberry');h.s.inventory.items=[stack('Seed','Carrot',3)];await h.e.step();assert.deepEqual(h.commands,[{type:'PlantSeed',slot:1,species:'Carrot'}]);});
test('owned seeds can be planted before catalog but missing seeds are never invented',async()=>{const h=await harness({noCatalogs:true});h.enable({plant:true,seedSpecies:'Carrot'});assert.equal(await h.e.step(),false);h.s.inventory.items=[stack('Seed','Carrot')];assert.equal(await h.e.step(),true);assert.equal(h.commands[0].type,'PlantSeed');});
test('planting retrieves only one approved seed from existing silo',async()=>{const h=await harness();h.enable({plant:true,seedSpecies:'Carrot'});h.s.inventory.storages=[{decorId:'SeedSilo',capacitySlots:10,items:[stack('Seed','Carrot',5)]}];await h.e.step();assert.deepEqual(h.commands[0],{type:'MoveItem',from:'SeedSilo',to:'inventory',itemId:'Carrot',quantity:1});});
test('explicit blue egg plots are not overwritten by auto plant',async()=>{const h=await harness();h.enable({plant:true,seedSpecies:'Carrot',eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['CommonEgg']});h.s.fieldModes[2]='egg';h.s.fieldModes[3]='egg';h.s.garden={0:plant(),1:plant()};h.s.inventory.items=[stack('Seed','Carrot'),stack('Egg','CommonEgg')];await h.e.step();assert.equal(h.commands[0].type,'GrowEgg');assert.equal(h.commands[0].slot,2);});
test('no blue plots means no egg placement',async()=>{const h=await harness();h.enable({eggs:true,eggPlaceMode:'selected',eggPlaceAllowed:['CommonEgg']});h.s.inventory.items=[stack('Egg','CommonEgg')];await h.e.step();assert.equal(h.commands.length,0);});
test('hatch uses maturedAt server time, not arbitrary endTime',async()=>{const h=await harness();h.enable({hatch:true});h.s.fieldModes[0]='egg';h.s.fieldModes[1]='egg';h.s.garden={0:{objectType:'egg',eggId:'CommonEgg',maturedAt:h.clock()+1000,plantedAt:1},1:{objectType:'egg',eggId:'CommonEgg',maturedAt:h.clock()-1,plantedAt:1}};await h.e.step();assert.deepEqual(h.commands[0],{type:'HatchEgg',slot:1});});
test('hatch holds at low free inventory capacity',async()=>{const h=await harness();h.enable({hatch:true});h.s.fieldModes[0]='egg';h.s.fieldModes[1]='egg';h.s.garden[0]={objectType:'egg',maturedAt:0,plantedAt:1};h.s.inventory.items=Array.from({length:98},(_,i)=>produce('p'+i));await h.e.step();assert.equal(h.commands.length,0);});
test('pet feed chooses cheapest permitted diet item, never favorite/rare/incompatible',async()=>{const h=await harness();h.enable({feed:true});h.s.own.petSlots=[{id:'pet',petSpecies:'Worm',hunger:50}];h.s.inventory.items=[produce('star'),produce('gold','Carrot',{mutations:['Gold']}),produce('incompatible','Blueberry'),produce('bigger','Carrot',{size:100}),produce('cheap')];h.s.inventory.favoritedItemIds=['star'];await h.e.step();assert.deepEqual(h.commands[0],{type:'FeedPet',petItemId:'pet',cropItemId:'cheap'});});
test('feed skips pets with unknown capacity / full hunger',async()=>{const h=await harness();h.enable({feed:true});h.s.own.petSlots=[{id:'pet',petSpecies:'Worm',hunger:400},{id:'unknown',petSpecies:'UnverifiedPet',hunger:0}];h.s.inventory.items=[produce()];await h.e.step();assert.equal(h.commands.length,0);});
test('trough fills only up to chosen target with compatible ordinary food',async()=>{const h=await harness();h.enable({trough:true,troughItems:2});h.s.own.petSlots=[{id:'pet',petSpecies:'Worm',hunger:400}];h.s.inventory.items=[produce('incompatible','Blueberry'),produce('food')];h.s.inventory.storages=[{decorId:'FeedingTrough',capacitySlots:9,items:[produce('old')]}];await h.e.step();assert.deepEqual(h.commands[0],{type:'MoveItem',from:'inventory',to:'FeedingTrough',itemId:'food',quantity:1});});
test('storage tops up only existing nonfavorite stacks and retains chosen seed/timed tools',async()=>{const h=await harness();h.enable({storage:true,plant:true,seedSpecies:'Carrot'});h.s.selected=[];h.s.fieldModes.fill('none');h.s.inventory.items=[stack('Seed','Carrot'),stack('Seed','Blueberry'),stack('Tool','RunningShard'),stack('Decor','Fence')];h.s.inventory.items[2].remainingActiveSeconds=100;h.s.inventory.storages=[{decorId:'SeedSilo',capacitySlots:10,items:[stack('Seed','Carrot'),stack('Seed','Blueberry')]},{decorId:'ToolShack',capacitySlots:10,items:[stack('Tool','RunningShard')]}];await h.e.step();assert.deepEqual(h.commands[0],{type:'MoveItem',from:'inventory',to:'SeedSilo',itemId:'Blueberry',quantity:10});});
test('watering waits for enough growth time and preserves tool reserve',async()=>{const h=await harness();h.enable({water:true,waterMinSeconds:600,toolReserve:2});h.s.garden[0]=plant('Carrot',{endTime:h.clock()+700000});h.s.inventory.items=[stack('Tool','WateringCan',2)];await h.e.step();assert.equal(h.commands.length,0);h.s.inventory.items[0].quantity=3;await h.e.step();assert.deepEqual(h.commands[0],{type:'WaterPlant',slot:0});});
test('water never targets protected or almost grown plants',async()=>{const h=await harness();h.enable({water:true});h.s.garden={0:plant('Carrot',{endTime:h.clock()+999999,locked:true}),1:plant('Carrot',{endTime:h.clock()+100})};h.s.inventory.items=[stack('Tool','WateringCan',5)];await h.e.step();assert.equal(h.commands.length,0);});
test('only completed unclaimed quests are claimed, without discarding partial rewards',async()=>{const h=await harness();h.enable({claims:true});h.s.own.dailyQuests={dayUTC:'2026-10-14',quests:[{instanceId:'incomplete',completedAt:null,claimedAt:null},{instanceId:'ready',completedAt:h.clock()-10,claimedAt:null}],bonusClaimedAt:null};await h.e.step();assert.deepEqual(h.commands[0],{type:'ClaimDailyQuestReward',instanceId:'ready',acceptPartial:false});});
test('daily bonus waits for all individual rewards to be claimed',async()=>{const h=await harness();h.enable({claims:true});h.s.own.dailyQuests={dayUTC:'2026-10-14',quests:[{instanceId:'a',completedAt:5,claimedAt:6}],bonusClaimedAt:null};await h.e.step();assert.deepEqual(h.commands[0],{type:'ClaimDailyQuestBonus',acceptPartial:false});});
test('unknown completed/claimed fields never authorize a quest claim',async()=>{const h=await harness();h.enable({claims:true});h.s.own.dailyQuests={dayUTC:'2026-10-14',quests:[{instanceId:'a'}],bonusClaimedAt:null};await h.e.step();assert.equal(h.commands.length,0);});
test('journal logs new variants only with Camera and own journal state',async()=>{const h=await harness();h.enable({journal:true});h.s.inventory.items=[produce(),stack('Tool','Camera',1)];await h.e.step();assert.deepEqual(h.commands[0],{type:'LogItem',target:{kind:'inventoryItem',itemId:'food1'}});});
test('journal skips existing variants and does not consume crops',async()=>{const h=await harness();h.enable({journal:true});h.s.inventory.items=[produce(),stack('Tool','Camera',1)];h.s.own.journal.produce.Carrot={variantsLogged:[{variant:'Normal'}]};await h.e.step();assert.equal(h.commands.length,0);assert.equal(h.s.inventory.items.length,2);});
test('journal can photograph a selected ready crop before harvest',async()=>{const h=await harness();h.enable({journal:true});h.s.inventory.items=[stack('Tool','Camera',1)];h.s.garden[0]=plant();await h.e.step();assert.deepEqual(h.commands[0],{type:'LogItem',target:{kind:'growSlot',slot:0,slotsIndex:0}});assert.equal(h.e.harvestAllowed(h.s.garden[0],h.s.garden[0].slots[0]),false);});
test('smart harvest combines size/value/mutation/weather conditions',async()=>{const h=await harness();h.enable({minHarvestSize:75,minHarvestValue:100,wantedMutations:['Gold'],pauseWeather:['Rain']});const c=produce('x','Carrot',{size:90,mutations:['Gold']});assert.equal(h.e.harvestAllowed(plant(),c),true);h.s.game.weather='Rain';assert.equal(h.e.harvestAllowed(plant(),c),false);h.s.game.weather='Normal';c.size=50;assert.equal(h.e.harvestAllowed(plant(),c),false);});
test('smart sale waits until protected products really appear in favorite state',async()=>{const h=await harness();h.enable({favorite:true,keepSpecies:['Carrot']});h.s.inventory.items=[produce()];assert.equal(h.e.saleAllowed(),false);await h.e.step();assert.deepEqual(h.commands[0],{type:'ToggleLockItem',itemId:'food1'});assert.equal(h.e.saleAllowed(),false);h.s.inventory.favoritedItemIds=['food1'];assert.equal(h.e.saleAllowed(),true);});
test('favorite toggle is never replayed on ambiguous timeout, including F5',async()=>{const st=storage(),h=await harness({reject:true,storage:st});h.enable({favorite:true,keepSpecies:['Carrot']});h.s.inventory.items=[produce()];await h.e.step();h.advance(3600000);await h.e.step();assert.equal(h.commands.length,1);const next=await harness({storage:st});next.s.inventory.items=[produce()];await next.e.step();assert.equal(next.commands.length,0);});
test('module action counter reset does not reset persistent safety reservations',async()=>{const h=await harness();h.enable({favorite:true,keepSpecies:['Carrot']});h.s.inventory.items=[produce()];await h.e.step();h.e.resetCounters();h.advance(5000);await h.e.step();assert.equal(h.commands.length,1);});
test('native favorites are never fed, moved to trough or toggled off',async()=>{const h=await harness();h.enable({favorite:true,feed:true,trough:true,keepSpecies:['Carrot']});h.s.inventory.items=[produce()];h.s.inventory.favoritedItemIds=['food1'];h.s.own.petSlots=[{id:'pet',petSpecies:'Worm',hunger:0}];h.s.inventory.storages=[{decorId:'FeedingTrough',capacitySlots:9,items:[]}];await h.e.step();assert.equal(h.commands.length,0);});
test('weather team applies only an explicitly selected existing saved team',async()=>{const h=await harness();h.enable({teams:true,teamRules:[{weather:'Rain',teamId:'rain-team'}]});h.s.game.weather='Rain';h.s.own.petTeams=[{id:'rain-team',members:[{petId:'pet2'}]}];h.s.own.petSlots=[{id:'pet1'}];await h.e.step();assert.deepEqual(h.commands[0],{type:'ApplyPetTeam',teamId:'rain-team'});});
test('team switch skips when team already active',async()=>{const h=await harness();h.enable({teams:true,teamRules:[{weather:'Rain',teamId:'rain-team'}]});h.s.game.weather='Rain';h.s.own.petTeams=[{id:'rain-team',members:[{petId:'pet2'}]}];h.s.own.petSlots=[{id:'pet2'}];await h.e.step();assert.equal(h.commands.length,0);});
test('purchase requires price, live stock and chosen rule, not old reserve',async()=>{const h=await harness();const r=shop(h.s,'Seed','Carrot',10);h.enable({buy:true,buyRules:[r],dailyBudget:30,coinReserve:999990});await h.e.step();assert.deepEqual(h.commands[0],{type:'PurchaseShopItem',shop:'seed',viewMode:'list',item:{itemType:'Seed',species:'Carrot'},quantity:1});assert.equal(h.e.status().spentToday,10);});
test('purchase ignores removed price/allowance limits but still checks wallet and native price',async()=>{for(const legacy of [{dailyBudget:0},{dailyBudget:9},{dailyBudget:50,coinReserve:999999}]){const h=await harness();h.enable({buy:true,buyRules:[shop(h.s,'Seed','Carrot',10)],...legacy});await h.e.step();assert.equal(h.commands.length,1);assert.ok(!('dailyBudget' in h.e.getConfig()));}for(const mode of ['wallet','price']){const h=await harness();if(mode==='wallet')h.s.own.coinsCount=9;h.enable({buy:true,buyRules:[shop(h.s,'Seed','Carrot',mode==='price'?9:10)]});await h.e.step();assert.equal(h.commands.length,mode==='price'?1:0,mode);}});
test('purchase blocks unsupported catalog, no lock, sold-out, expired stock and max-owned',async()=>{for(const mode of ['catalog','lock','soldout','expired','owned']){const h=await harness({noCatalogs:mode==='catalog',noLock:mode==='lock'});const r=shop(h.s,'Seed','Carrot',10);if(mode==='soldout')h.s.game.shops.seed.inventory[0].initialStock=0;if(mode==='expired')h.s.game.shops.seed.deadlineMs=h.clock()-1;if(mode==='owned')h.s.inventory.items=[stack('Seed','Carrot',100)];h.enable({buy:true,buyRules:[r],dailyBudget:100});await h.e.step();assert.equal(h.commands.length,0,mode);}});
test('unconfirmed purchase holds the next buy and purchase history over F5',async()=>{const st=storage(),h=await harness({storage:st,reject:true});const r=shop(h.s,'Seed','Carrot',10);h.enable({buy:true,buyRules:[r],dailyBudget:100});await h.e.step();h.advance(1000000);shop(h.s,'Seed','Carrot',10);await h.e.step();assert.equal(h.commands.length,1);assert.equal(h.e.status().spentToday,10);const next=await harness({storage:st});shop(next.s,'Seed','Carrot',10);await next.e.step();assert.equal(next.commands.length,0);assert.equal(next.e.status().spentToday,10);});
test('confirmed purchase state buys until target holdings, not retired restock cap',async()=>{const h=await harness({onSend:(c,s)=>{s.own.coinsCount-=10;s.own.shopPurchases.seed={restockId:'restockA',purchases:{Carrot:(s.own.shopPurchases.seed?.purchases?.Carrot||0)+1}};return {ok:true};}});h.enable({buy:true,buyRules:[shop(h.s,'Seed','Carrot',10)],dailyBudget:20});await h.e.step();h.advance(6000);await h.e.step();h.advance(6000);await h.e.step();assert.equal(h.commands.length,3);assert.equal(h.e.status().spentToday,30);h.s.inventory.items=[stack('Seed','Carrot',30)];h.advance(6000);await h.e.step();assert.equal(h.commands.length,3);});
test('two tabs share pending purchase reservations',async()=>{const st=storage(),one=await harness({storage:st}),two=await harness({storage:st});one.enable({buy:true,buyRules:[shop(one.s,'Seed','Carrot',10)],dailyBudget:10});two.enable({buy:true,buyRules:[shop(two.s,'Seed','Carrot',10)],dailyBudget:10});await Promise.all([one.e.step(),two.e.step()]);assert.equal(one.commands.length+two.commands.length,1);});
test('preview and status never send game commands',async()=>{const h=await harness();h.enable({plant:true,seedSpecies:'Carrot'});h.s.inventory.items=[stack('Seed','Carrot')];assert.equal(h.e.preview()[0].action,'PlantSeed');h.e.status();assert.equal(h.commands.length,0);});
test('stop, disabled modules, missing identity and overlapping calls are gated',async()=>{const h=await harness();h.enable({plant:true,seedSpecies:'Carrot'});h.s.inventory.items=[stack('Seed','Carrot')];await Promise.all([h.e.step(),h.e.step()]);assert.equal(h.commands.length,1);h.stop();h.advance(5000);await h.e.step();assert.equal(h.commands.length,1);const empty=await harness({noSnapshot:true});empty.enable({plant:true,seedSpecies:'Carrot'});await empty.e.step();assert.equal(empty.commands.length,0);});
test('revalidation under purchase lock rechecks identity',async()=>{const h=await harness();h.enable({buy:true,buyRules:[shop(h.s,'Seed','Carrot',10)],dailyBudget:100});h.s.actor='';await h.e.step();assert.equal(h.commands.length,0);});
test('malformed config cannot add arbitrary wire commands or bypass constraints',async()=>{const h=await harness();const c=h.e.configure({enabled:true,buy:true,dailyBudget:-10,seedSpecies:{bad:true},buyRules:[{type:'DevGiveCoins',id:'x',shop:'seed'},{type:'Seed',id:'Carrot',shop:'credits'}],eggPlots:999});assert.equal("dailyBudget" in c,false);assert.equal("coinReserve" in c,false);assert.equal(c.seedSpecies,'');assert.equal(c.buyRules.length,0);assert.equal('eggPlots' in c,false);});
test('unsafe or unknown product price blocks valuation-dependent consume rules',async()=>{const h=await harness({noCatalogs:true});h.enable({feed:true,keepValue:100});h.s.inventory.items=[produce()];h.s.own.petSlots=[{id:'pet',petSpecies:'Worm',hunger:0}];await h.e.step();assert.equal(h.commands.length,0);assert.equal(h.e.saleAllowed(),false);});
test('no modules for credits, trades, pet sales, garden destruction or dev commands',async()=>{const h=await harness();const c=h.e.getConfig();for(const key of ['trade','sellPets','credits','dev','uproot'])assert.equal(key in c,false);});


test('old auto-favorited Gold crops are re-evaluated and released after a live rule change without F5',async()=>{
 const h=await harness({onSend:(cmd,s)=>{
   if(cmd.type==='ToggleLockItem'){
     const list=s.inventory.favoritedItemIds,id=cmd.itemId,index=list.indexOf(id);
     if(index>=0)list.splice(index,1);else list.push(id);
   }
   return {ok:true};
 }});
 h.enable({favorite:true,keepSpecies:['Carrot'],cropSell:true});
 h.s.inventory.items=[produce('old-gold','Carrot',{mutations:['Gold']}),produce('manual','Blueberry')];
 h.s.inventory.favoritedItemIds=['manual'];
 assert.equal(await h.e.step(),true);
 assert.deepEqual(h.commands,[{type:'ToggleLockItem',itemId:'old-gold'}]);
 assert.deepEqual(h.s.inventory.favoritedItemIds,['manual','old-gold']);
 h.advance(3000);
 h.e.configure({keepSpecies:[],keepValue:0,favorite:false});
 assert.equal(await h.e.step(),true,'the release must run despite disabling new favorites');
 assert.deepEqual(h.commands[1],{type:'ToggleLockItem',itemId:'old-gold'});
 assert.deepEqual(h.s.inventory.favoritedItemIds,['manual'],'the manually marked crop must remain locked');
 assert.equal(h.e.saleAllowed(),true,'old Gold crop becomes sellable without reload');
});
test('automatic crop ownership persists across F5, without claiming a player-marked favorite',async()=>{
 const st=storage();
 const sender=(cmd,s)=>{
   if(cmd.type==='ToggleLockItem'){
     const index=s.inventory.favoritedItemIds.indexOf(cmd.itemId);
     if(index>=0)s.inventory.favoritedItemIds.splice(index,1);
     else s.inventory.favoritedItemIds.push(cmd.itemId);
   }
   return {ok:true};
 };
 const first=await harness({storage:st,onSend:sender});
 first.enable({favorite:true,keepSpecies:['Carrot'],cropSell:true});
 first.s.inventory.items=[produce('bot','Carrot'),produce('manual','Blueberry')];
 first.s.inventory.favoritedItemIds=['manual'];
 await first.e.step();
 const next=await harness({storage:st,onSend:sender});
 next.s.inventory.items=[produce('bot','Carrot'),produce('manual','Blueberry')];
 next.s.inventory.favoritedItemIds=['bot','manual'];
 next.e.configure({favorite:false,keepSpecies:[]});
 assert.equal(await next.e.step(),true);
 assert.deepEqual(next.commands,[{type:'ToggleLockItem',itemId:'bot'}]);
 assert.deepEqual(next.s.inventory.favoritedItemIds,['manual']);
});
test('uncertain favorite toggle never authorizes an automatic future unlock',async()=>{
 const st=storage();
 const h=await harness({reject:true,storage:st});
 h.enable({favorite:true,keepSpecies:['Carrot'],cropSell:true});
 h.s.inventory.items=[produce('uncertain')];
 await h.e.step();
 // A later favorite mark might have come from a manual player action; a
 // timeout cannot establish ownership of the reversible native toggle.
 const next=await harness({storage:st});
 next.s.inventory.items=[produce('uncertain')];
 next.s.inventory.favoritedItemIds=['uncertain'];
 next.e.configure({favorite:false,keepSpecies:[]});
 assert.equal(await next.e.step(),false);
 assert.deepEqual(next.commands,[]);
});
test('releasing a once-managed crop waits while native explicit protection remains',async()=>{
 const h=await harness({onSend:(cmd,s)=>{
   if(cmd.type==='ToggleLockItem'){
     const idx=s.inventory.favoritedItemIds.indexOf(cmd.itemId);
     if(idx>=0)s.inventory.favoritedItemIds.splice(idx,1);else s.inventory.favoritedItemIds.push(cmd.itemId);
   }return {ok:true};
 }});
 h.enable({favorite:true,keepSpecies:['Carrot'],cropSell:true});
 h.s.inventory.items=[produce('locked')];await h.e.step();h.advance();
 h.e.configure({favorite:false,keepSpecies:[]});
 h.s.inventory.items[0].protected=true;
 assert.equal(await h.e.step(),false);
 assert.equal(h.commands.length,1);
 h.s.inventory.items[0].protected=false;h.advance();
 assert.equal(await h.e.step(),true);
 assert.equal(h.commands.length,2);
});

test('a crop can be protected, released, then protected again without F5 or toggling a stale receipt',async()=>{
 const h=await harness({onSend:(cmd,s)=>{
   if(cmd.type==='ToggleLockItem'){
     const n=s.inventory.favoritedItemIds.indexOf(cmd.itemId);
     if(n>=0)s.inventory.favoritedItemIds.splice(n,1);else s.inventory.favoritedItemIds.push(cmd.itemId);
   }return {ok:true};
 }});
 h.enable({favorite:true,keepSpecies:['Carrot'],cropSell:true});
 h.s.inventory.items=[produce('reversible')];
 await h.e.step();assert.deepEqual(h.s.inventory.favoritedItemIds,['reversible']);
 h.advance();h.e.configure({favorite:false,keepSpecies:[]});
 await h.e.step();assert.deepEqual(h.s.inventory.favoritedItemIds,[]);
 h.advance();h.e.configure({favorite:true,keepSpecies:['Carrot']});
 assert.equal(await h.e.step(),true);
 assert.deepEqual(h.s.inventory.favoritedItemIds,['reversible']);
 assert.deepEqual(h.commands.map(c=>c.itemId),['reversible','reversible','reversible']);
});

test("journal scans own green plots even outside the user's selected slots",async()=>{
  const h=await harness();h.enable({journal:true});h.s.inventory.items=[stack('Tool','Camera',1)];
  h.s.fieldModes.fill('none');h.s.fieldModes[192]='plant';h.s.garden[192]=plant('Carrot');
  await h.e.step();
  assert.deepEqual(h.commands[0],{type:'LogItem',target:{kind:'growSlot',slot:192,slotsIndex:0}});
});
test('journal accepts verified native camera ownership without inventory tool stack',async()=>{
  const h=await harness();h.enable({journal:true});h.s.cameraOwned=true;h.s.inventory.items=[produce()];
  await h.e.step();
  assert.equal(h.commands[0]?.type,'LogItem');
});
test('journal does not guess camera ownership or incomplete plant mutations',async()=>{
  const h=await harness();h.enable({journal:true});h.s.garden[0]=plant('Carrot',{mutations:undefined});
  await h.e.step();assert.equal(h.commands.length,0);
});
