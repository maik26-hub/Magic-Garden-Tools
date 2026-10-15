from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
SOURCE=(ROOT/'MagicGardenAutoFarm.user.js').read_text()
OUT=ROOT/'test-output/v16-integration';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,value):
    if not value: raise AssertionError(name)
    checks.append(name)
SETUP=r"""() => {
 window.__clock=Date.now();const NativeDate=Date;
 window.Date=class extends NativeDate {static now(){return __clock;}};
 let uid=0;Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>`00000000-0000-4000-8000-${String(++uid).padStart(12,'0')}`});
 window.__sent=[];window.__saleMode='noAck';window.__commandsBlocked=false;
 const storage=initial=>{const m=new Map(Object.entries(initial||{}));return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>Object.fromEntries(m)}};
 Object.defineProperty(window,'localStorage',{value:storage(),configurable:true});
 Object.defineProperty(window,'sessionStorage',{value:storage(),configurable:true});
 const locked=new Set();Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(key,options,fn)=>{if(locked.has(key))return fn(null);locked.add(key);try{return await fn({name:key});}finally{locked.delete(key)}}}});
 const pet=(id,ability,max=90,extra={})=>({itemType:'Pet',id,name:id,petSpecies:'Pig',targetScale:1+(max-80)/20,xp:0,hunger:500,mutations:[],abilities:Array.isArray(ability)?ability:[ability],sourceEggId:'RareEgg',...extra});
 window.__pet=pet;
 window.__catalogs={
 pets:{Pig:{name:'Pig',maxScale:2,hoursToMature:72},Squirrel:{name:'Squirrel',maxScale:2,hoursToMature:100},Turtle:{name:'Turtle',maxScale:2,hoursToMature:100}},
 abilities:{SellBoostI:{name:'Sell Boost I',trigger:'sellAllCrops',baseProbability:10,baseParameters:{cropSellPriceIncreasePercentage:20}},SellBoostIII:{name:'Sell Boost III',trigger:'sellAllCrops',baseProbability:14,baseParameters:{cropSellPriceIncreasePercentage:40}},PetHatchSizeBoost:{name:'Max Strength Boost',trigger:'hatchEgg',baseProbability:12,baseParameters:{maxStrengthIncreasePercentage:2.4}},PetAgeBoost:{name:'Hatch XP',trigger:'hatchEgg',baseProbability:50,baseParameters:{bonusXp:8000}},PetMutationBoost:{name:'Pet mutation',trigger:'hatchEgg',baseProbability:12,baseParameters:{mutationChanceIncreasePercentage:5}},DoubleHatch:{name:'Double Hatch',trigger:'hatchEgg',baseProbability:3,baseParameters:{}},ProduceRefund:{name:'Crop Refund',trigger:'sellAllCrops',baseProbability:10,baseParameters:{}},EggGrowthBoost:{name:'Egg Growth',trigger:'continuous',baseProbability:21,baseParameters:{eggGrowthTimeReductionMinutes:7}},HungerRestore:{name:'Hunger Restore',trigger:'continuous',baseProbability:12,baseParameters:{hungerRestorePercentage:30}},HungerBoost:{name:'Hunger Boost',trigger:'continuous',baseParameters:{hungerRefundPercentage:12}},SeedFinderI:{name:'Seed Finder',trigger:'continuous',baseProbability:10,baseParameters:{}}},
 eggs:{RareEgg:{name:'Rare Egg',coinPrice:100,secondsToHatch:600,faunaSpawnWeights:{Pig:1},eligibleShops:['egg']}}
 };
 window.__own={coinsCount:10000,petSlots:[pet('my-original','SeedFinderI')],petTeams:[],shopPurchases:{},journal:{produce:{},pets:{}},garden:{tileObjects:{0:{objectType:'egg',eggId:'RareEgg',plantedAt:1,maturedAt:0}}},inventory:{items:[pet('pig-A','SellBoostI',96),pet('pig-B','SellBoostI',94),pet('pig-C','SellBoostI',93),pet('weak-pig','SellBoostI',82),pet('squirrel','SellBoostIII',98,{petSpecies:'Squirrel',sourceEggId:'LegendaryEgg'}),pet('hatch-pet','PetHatchSizeBoost',96),pet('hatch-dual',['PetHatchSizeBoost','PetAgeBoost'],98),pet('hatch-double','DoubleHatch',96),pet('hatch-mut','PetMutationBoost',94),pet('refund-pet','ProduceRefund',90),pet('turtle',['EggGrowthBoost','HungerRestore','HungerBoost'],95,{petSpecies:'Turtle',sourceEggId:'LegendaryEgg'})],favoritedItemIds:[],storages:[{decorId:'PetHutch',capacitySlots:10,items:[]}]}};
 const listeners=new Set();
 window.__patch=()=>{const full={data:{players:[{id:'self',databaseUserId:'account'}]},child:{data:{weather:'Normal',shops:{},userSlots:[{userId:'self',data:__own}]}}};for(const fn of listeners)fn([],structuredClone(full));};
 window.WebSocket=class extends EventTarget{static OPEN=1;constructor(url){super();this.url=url;this.readyState=1;}send(raw){const frame=JSON.parse(raw);if(frame.type!=='QuinoaCommand')return;__sent.push(frame.command);const c=frame.command;
  setTimeout(()=>{
   if(__commandsBlocked)return;
   let reply=true,ok=true;
   if(c.type==='SavePetTeam'){
    let t=__own.petTeams.find(t=>t.id===c.teamId);if(!t)__own.petTeams.push(t={id:c.teamId,name:c.name});t.members=c.petIds.map(petId=>({petId}));reply=false;
   }else if(c.type==='ApplyPetTeam'){
    const t=__own.petTeams.find(t=>t.id===c.teamId);if(!t)ok=false;else{
     const all=[...__own.petSlots,...__own.inventory.items,...__own.inventory.storages.flatMap(s=>s.items)];
     const wanted=t.members.map(m=>m.petId),incoming=wanted.map(id=>all.find(p=>p.id===id)).filter(Boolean);
     const outgoing=__own.petSlots.filter(p=>!wanted.includes(p.id));
     __own.inventory.items=__own.inventory.items.filter(p=>!wanted.includes(p.id));
     __own.inventory.items.push(...outgoing.map(p=>({...p,itemType:'Pet'})));
     for(const s of __own.inventory.storages)s.items=s.items.filter(p=>!wanted.includes(p.id));
     __own.petSlots=incoming;
    }reply=false;
   }else if(c.type==='SellPet'){
    if(__saleMode==='reject'){ok=false;}
    else if(__saleMode==='ackOnly'){}
    else{
     const target=__own.inventory.items.find(p=>p.id===c.itemId);__own.inventory.items=__own.inventory.items.filter(p=>p.id!==c.itemId);
     if(__saleMode==='moveToHutch'&&target)__own.inventory.storages[0].items.push(target);
     reply=false;
    }
   }else if(c.type==='HatchEgg'){
     delete __own.garden.tileObjects[c.slot];__own.inventory.items.push(pet('new-squirrel','SellBoostIII',100,{petSpecies:'Squirrel',sourceEggId:'LegendaryEgg'}));
   }
   if(ok)__patch();
   if(reply)this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'QuinoaCommandResult',requestId:frame.requestId,commandType:c.type,ok,code:ok?undefined:'rejected',currencyGains:{coins:100}})}));
  },20);
 }};
 window.fetch=async()=>({ok:false,status:503,text:async()=>''});
 window.__connect=()=>{
  const ws=new WebSocket('wss://magicgarden.gg/version/1517/api/rooms/mock');
  window.MagicCircle_RoomConnection={currentWebSocket:ws,lastDistributedRoomPublication:{executedCommandSequence:0},subscribeToPatches(fn){listeners.add(fn);__patch();return()=>listeners.delete(fn)}};
  ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'Welcome',selfPlayerId:'self',executedCommandSequence:0})}));
 };
}"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1200,'height':850},locale='de-DE');errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda route:route.abort())
    page.set_content('<html><head></head><body style="background:#1e2822"><canvas></canvas></body></html>')
    page.evaluate(SETUP);page.add_script_tag(content=SOURCE);page.evaluate('__connect()');page.wait_for_timeout(600)
    page.evaluate('Object.assign(MGAutoFarmV13.automation.catalogs(),__catalogs)')
    api='MGAutoFarmV13.automation'
    page.evaluate(f'{api}.configure({{enabled:true,teamBuilder:true,autoTeams:false,petSell:false,harvest:false,cropSell:false}})')
    page.evaluate('MGAutoFarmV13.state.running=true')
    state=page.evaluate(f'{api}.teamState()')
    check('per-effect and AFK proposals exist from current owned pet data',len(state['proposals'])>=7 and any(t['mode']=='afk' for t in state['proposals']))
    check('templates saved locally even before native save confirmations',len(state['plans'])==len(state['proposals']))
    hatch_combo=next(t for t in state['proposals'] if t['key']=='combo:hatch#active')
    check('Hatch combo merges a multi-ability pet with Double Hatch and mutation', 'hatch-dual' in hatch_combo['petIds'] and 'hatch-double' in hatch_combo['petIds'] and 'hatch-mut' in hatch_combo['petIds'])
    check('Hatch combo credits multiple effects to the same pet',set(x['family'] for x in hatch_combo['contributions'] if 'hatch-dual' in x['pets'])=={'PetHatchSizeBoost','PetAgeBoost'})
    check('crop sell combo exists next to independent Sell Boost and Refund teams',any(t['key']=='combo:cropSale#active' for t in state['proposals']))
    # The serial native SavePetTeam sender waits for its state echo, not an ACK.
    for _ in range(30):
        page.evaluate('__clock+=2500')
        page.evaluate(f'{api}.step()')
    state=page.evaluate(f'{api}.teamState()')
    check('generated teams were saved into native game state without command-result ACKs',sum(t['saved'] for t in state['plans'])==len(state['plans']))
    before=page.evaluate('__sent.filter(c=>c.type==="SavePetTeam").length')
    page.evaluate('__clock+=2500');page.evaluate(f'{api}.step()')
    check('unchanged teams produce no additional writes',page.evaluate('__sent.filter(c=>c.type==="SavePetTeam").length')==before)
    sell=next(t for t in state['plans'] if t['family']=='SellBoost' and t['mode']=='active')
    hatch=next(t for t in state['plans'] if t['family']=='PetHatchSizeBoost' and t['mode']=='active')
    hatch_combo=next(t for t in state['plans'] if t['key']=='combo:hatch#active')
    check('higher-tier squirrel outranks weaker sell-boost pigs',sell['petIds'][0]=='squirrel' and 'weak-pig' not in sell['petIds'])
    page.evaluate('(keys)=>MGAutoFarmV13.automation.configure({autoTeams:true,sellTeamKey:keys.sell,hatchTeamKey:""})',{'sell':sell['key']})
    index=page.evaluate('__sent.length')
    page.evaluate(f'{api}.dispatch({{type:"SellAllCrops"}})')
    flow=page.evaluate(f'__sent.slice({index}).map(c=>c.type)')
    check('actual bundled sender uses saved return team and orders apply/action/restore',flow==['ApplyPetTeam','SellAllCrops','ApplyPetTeam'])
    check('previous active team is restored in observed game state',page.evaluate('__own.petSlots.map(p=>p.id)')==['my-original'])
    # Hatching creates a stronger Squirrel; stable effect team IDs are updated.
    page.evaluate("MGAutoFarmV13.fieldPlan.set(0,'egg')")
    pre_hatch=page.evaluate('__sent.length')
    page.evaluate(f'{api}.dispatch({{type:"HatchEgg",slot:0}})')
    hatch_commands=page.evaluate(f'__sent.slice({pre_hatch})')
    check('Hatch action automatically chooses the combined team and restores previous team',
      [c['type'] for c in hatch_commands]==['ApplyPetTeam','HatchEgg','ApplyPetTeam'] and
      hatch_commands[0]['teamId']==hatch_combo['id'] and page.evaluate('__own.petSlots.map(p=>p.id)')==['my-original'])
    page.evaluate('__clock+=2500')
    after=page.evaluate(f'{api}.teamState()');updated=next(t for t in after['plans'] if t['key']==sell['key'])
    check('new hatch replaces a weaker pig in the same effect template',updated['id']==sell['id'] and 'new-squirrel' in updated['petIds'] and 'pig-B' not in updated['petIds'])
    for _ in range(5):page.evaluate('__clock+=2500');page.evaluate(f'{api}.step()')
    check('team improvement updates native existing ID, not a duplicate create',page.evaluate('(id)=>__sent.some(c=>c.type==="SavePetTeam"&&c.teamId===id&&c.isCreate===false&&c.petIds.includes("new-squirrel"))',sell['id']))
    # AutoSell candidate selection is exercised through the public step method.
    page.evaluate(f'{api}.configure({{autoTeams:false,petSell:true,petSellEggs:["RareEgg"]}})')
    proposal=page.evaluate(f'{api}.petSellProposal()');check('missing Journal entries do not block a genuinely surplus pig',proposal['pet'] is not None)
    target=proposal['pet']['id'];count=page.evaluate(f'{api}.status().modules.find(m=>m.id==="petSell").confirmed')
    page.evaluate('__clock+=2500');page.evaluate(f'{api}.step()')
    check('no-ACK pet sale is counted only after exact pet disappears',page.evaluate(f'{api}.status().modules.find(m=>m.id==="petSell").confirmed')==count+1 and page.evaluate('(id)=>!__own.inventory.items.some(p=>p.id===id)',target))
    # ACK alone cannot turn a non-sale into success.
    page.evaluate('__own.inventory.items.push(__pet("ack-only-pet","SellBoostI",80));__saleMode="ackOnly";__patch();__clock+=2500')
    count=page.evaluate(f'{api}.status().modules.find(m=>m.id==="petSell").confirmed')
    page.evaluate(f'{api}.step()')
    check('ACK-only pet sale times out without a false sale counter',page.evaluate(f'{api}.status().modules.find(m=>m.id==="petSell").confirmed')==count)
    check('uncertain pet sale gets a human-readable diagnostic', 'bestätigt' in page.evaluate(f'{api}.status().modules.find(m=>m.id==="petSell").status'))
    page.evaluate('MGAutoFarmV13.state.running=false')
    # Show the actual UI with generated cards and delayed information.
    back=page.get_by_role('button',name='Zur Übersicht',exact=True)
    if back.is_visible():back.click()
    page.get_by_role('button',name='Pets & Futter',exact=True).click();page.wait_for_timeout(1200)
    check('saved team cards are accessible in the real menu',page.locator('[data-effect-team]').count()>=7)
    check('combined Hatch and Crop Sell team cards have readable boost labels',page.locator('[data-effect-team="combo:hatch#active"]').count()==1 and page.locator('[data-effect-team="combo:cropSale#active"]').count()==1 and 'Kombi:' in page.locator('[data-effect-team="combo:hatch#active"]').inner_text())
    page.locator('#mg-autofarm-v13').screenshot(path=str(OUT/'pets-teams.png'))
    before=page.locator('.mg-menu-header').bounding_box();page.locator('#mg-menu-scroll').evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(100)
    check('header stays fixed with a populated long team library',page.locator('.mg-menu-header').bounding_box()==before)
    check('no uncaught browser errors',not errors)
    report={'checks':len(checks),'passed':checks,'errors':errors,'scope':'Complete V16 userscript in Chromium with local simulated native websocket/game state; no live account'}
    (OUT/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report,indent=2,ensure_ascii=False))
    browser.close()
