"""Actual menu/loop + catalog discovery and dynamic ESM fixture import.
The about:blank harness maps approved fixture asset URLs to local data modules;
no real account, network access, manual catalog injection, or money is used.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,os,base64
R=Path(__file__).resolve().parents[2];OUT=R/'test-output/catalog-recovery';OUT.mkdir(parents=True,exist_ok=True)
source=(R/'MagicGardenAutoFarm.user.js').read_text()
# Environment-only seams to run same-origin module discovery in about:blank.
source=source.replace('pageURL: () => location.href,','pageURL: () => "https://magicgarden.gg/r/fixture",')
source=source.replace('importModule: url => import(url)','importModule: url => window.__fixtureImport(url)')
CATS={
 'plants':{'Carrot':{'name':'Carrot','seed':{'coinPrice':10,'eligibleShops':['seed']},'crop':{'baseSellPrice':20,'maxSizeMultiplier':3}}},
 'eggs':{'CommonEgg':{'name':'Common Egg','coinPrice':100,'secondsToHatch':600,'faunaSpawnWeights':{'Worm':1},'eligibleShops':['egg']},'NewEgg':{'name':'New Egg','coinPrice':250,'secondsToHatch':500,'eligibleShops':['egg']}},
 'pets':{'Worm':{'diet':['Carrot'],'coinsToFullyReplenishHunger':500}},
 'mutations':{'Gold':{'name':'Gold','group':'Growth','coinMultiplier':25},'Wet':{'name':'Wet','group':'Hydro','coinMultiplier':2}},
 'tools':{'WateringCan':{'name':'Watering Can','coinPrice':5000},'Camera':{'name':'Camera','coinPrice':10000}},
 'decor':{'SeedSilo':{'name':'Seed Silo'},'FeedingTrough':{'name':'Feeding Trough','coinPrice':1000}}}
MODULE='\n'.join('export const '+k+' = '+json.dumps(v)+';' for k,v in CATS.items())
HTML='<html lang="de"><head><meta name="magiccircle-release" content="777"></head><body style="background:#192520"><canvas></canvas></body></html>'
MOCK=r'''()=>{
 window.__sent=[];window.__catalogFetches=[];window.__catalogImports=[];let rid=0;Object.defineProperty(crypto,'randomUUID',{value:()=> 'mock-'+(++rid),configurable:true});
 Object.defineProperty(performance,'getEntriesByType',{value:()=>[],configurable:true});
 for(const key of ['localStorage','sessionStorage']){const m=new Map();Object.defineProperty(window,key,{value:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)},configurable:true});}
 localStorage.setItem('magic_garden_automation_v15',JSON.stringify({dailyBudget:0,coinReserve:999999,buy:false}));
 class Socket extends EventTarget{static OPEN=1;constructor(url){super();this.url=url;this.readyState=1;}send(payload){const m=JSON.parse(payload);__sent.push(m);if(m.type!=='QuinoaCommand')return;setTimeout(()=>{const c=m.command;if(c.type==='GrowEgg'){__own.garden.tileObjects[c.slot]={objectType:'egg',eggId:c.eggId,maturedAt:Date.now()+600000,plantedAt:Date.now()};__own.inventory.items.find(i=>i.eggId===c.eggId).quantity--;}
 if(c.type==='PurchaseShopItem'){__own.coinsCount-=100;__own.shopPurchases.egg={restockId:'cycle',purchases:{CommonEgg:(__own.shopPurchases.egg?.purchases.CommonEgg||0)+1}};}
 this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'QuinoaCommandResult',requestId:m.requestId,commandType:c.type,ok:true,itemGains:[]})}));__patch?.([],__snapshot);},15);}}
 window.WebSocket=Socket;
 window.fetch=async url=>{
  if(url.startsWith('https://magicgarden.gg/')){__catalogFetches.push(url);const value=__sources[url];return {ok:!!value,url,text:async()=>value};}
  return {ok:true,text:async()=>'// ==UserScript==\n// @name Magic Garden AutoFarm\n// @namespace mg-autofarm-local\n// @version 99.0.0\n// ==/UserScript==\n'};
 };
 Object.defineProperty(navigator,'locks',{value:{request:async(_name,_opts,fn)=>fn({name:'test-only-lock'})},configurable:true});
 window.__fixtureImport=async url=>{__catalogImports.push(url);return import('data:text/javascript;base64,'+btoa(__sources[url]));};
 window.addEventListener('DOMContentLoaded',()=>{
 const own=__own={coinsCount:1000,petSlots:[],petTeams:[],shopPurchases:{},journal:{produce:{},pets:{}},inventory:{items:[{itemType:'Egg',eggId:'CommonEgg',quantity:2}],favoritedItemIds:[],storages:[]},garden:{tileObjects:{}}};
 window.__snapshot={data:{players:[]},child:{data:{weather:'Normal',shops:{egg:{restockId:'cycle',deadlineMs:Date.now()+600000,inventory:[{itemType:'Egg',eggId:'CommonEgg',initialStock:10}]}},userSlots:[{userId:'self',data:own}]}}};
 const ws=new WebSocket('wss://magicgarden.gg/version/777/api/rooms/mock');window.MagicCircle_RoomConnection={currentWebSocket:ws,lastDistributedRoomPublication:{executedCommandSequence:0},subscribeToPatches(fn){__patch=fn;fn([],__snapshot);return ()=>{};}};
 ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'Welcome',selfPlayerId:'self',executedCommandSequence:0})}));
 });
}'''
checks=[]
def ok(name,value):
 assert value,name
 checks.append(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':850});page.set_default_timeout(8000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda r:r.abort());page.set_content(HTML)
 page.evaluate(MOCK);page.evaluate('s=>window.__sources=s',{'https://magicgarden.gg/version/777/assets/Boot-new.js':'export {plants} from "./Shared-renamed.js";', 'https://magicgarden.gg/version/777/assets/Shared-renamed.js':MODULE});page.add_script_tag(content=source);page.evaluate("window.dispatchEvent(new Event('DOMContentLoaded'))");page.wait_for_timeout(450)
 def go(name):
  back=page.get_by_role('button',name='Zur Übersicht',exact=True)
  if back.is_visible():back.click()
  page.get_by_role('button',name=name,exact=True).click()
 go('Pflanzen');page.get_by_label('Leere blaue Felder mit Eiern füllen',exact=True).check()
 ok('all inventory eggs can be placed without a catalog',page.get_by_label('Welche Eier platzieren?',exact=True).input_value()=='all' and len(page.evaluate('__catalogImports'))==0)
 page.get_by_label('Welche Eier platzieren?',exact=True).select_option('selected')
 picker=page.locator('[data-choice="eggPlaceAllowed"]');picker.locator('summary').click()
 picker.get_by_label('Common Egg · 2 im Inventar',exact=True).check()
 ok('owned egg can be filtered by name before catalog loads',page.evaluate("MGAutoFarmV13.automation.getConfig().eggPlaceAllowed")==['CommonEgg'] and len(page.evaluate('__catalogImports'))==0)
 picker.locator('summary').click()
 go('Felder');page.get_by_role('button',name='Eier malen',exact=True).click();page.locator('[data-mg-field][data-side="left"][data-index="0"]').click();page.evaluate('MGAutoFarmV13.automation.configure({enabled:true})');page.get_by_role('button',name='AutoFarm starten',exact=True).click();page.wait_for_function('__sent.some(x=>x.command?.type==="GrowEgg")');page.get_by_role('button',name='AutoFarm stoppen',exact=True).click();page.wait_for_timeout(500)
 ok('actual loop places an owned egg on blue without a catalog',page.evaluate('__sent.filter(x=>x.command?.type==="GrowEgg").length')==1)
 ok('no grey plot is touched',page.evaluate('__sent.every(x=>!x.command||x.command.slot===0)'))
 # Reveal a renamed bootstrap late; timing remains empty. Automatic retry, no reload.
 page.evaluate("()=>{const s=document.createElement('script');s.type='application/x-fixture';s.src='https://magicgarden.gg/version/777/assets/Boot-new.js';document.head.appendChild(s);}")
 page.wait_for_function('MGAutoFarmV13.automation.menuChoices().eggs.some(x=>x.id==="NewEgg")',timeout=18000)
 ok('late bootstrap recovers a renamed catalog without timing entries',page.evaluate('__catalogImports')==['https://magicgarden.gg/version/777/assets/Shared-renamed.js'])
 ok('dynamic module populates all six real engine catalog categories',page.evaluate('Object.keys(MGAutoFarmV13.automation.catalogs()).length')==6)
 go('Einkauf');ok('daily budget and reserve inputs removed',page.locator('[data-mg-setting="dailyBudget"],[data-mg-setting="coinReserve"]').count()==0)
 ok('old stored limits are ignored after upgrade',page.evaluate('!("dailyBudget" in MGAutoFarmV13.automation.getConfig()) && !("coinReserve" in MGAutoFarmV13.automation.getConfig())'))
 page.get_by_label('Was kaufen?',exact=True).select_option(label='Eier');page.get_by_label('Artikel auswählen',exact=True).select_option(label='Common Egg · 100 Coins');ok('egg picker now displays the actual native catalog price',page.get_by_label('Artikel auswählen').input_value()=='CommonEgg')
 page.get_by_role('button',name='Kaufregel speichern').click();ok('saving a rule does not enable buying',not page.get_by_label('Auto-Buy freigeben',exact=True).is_checked())
 # Actual sender + matching result, no manual catalog assignment. Web Lock API
 # is simulated in about:blank; its real availability is covered separately.
 page.get_by_label('Auto-Buy freigeben',exact=True).check();page.evaluate('MGAutoFarmV13.automation.configure({eggs:false})');page.get_by_role('button',name='AutoFarm starten',exact=True).click();page.wait_for_function('__sent.some(x=>x.command?.type==="PurchaseShopItem")');page.get_by_role('button',name='AutoFarm stoppen',exact=True).click();page.wait_for_timeout(200)
 ok('Auto-Buy actually sends with old budget=0 and huge reserve removed',page.evaluate('__sent.filter(x=>x.command?.type==="PurchaseShopItem").length')==1)
 ok('coins are paid only for chosen item and stock rule remains bounded',page.evaluate('__own.coinsCount')==900)
 header=page.locator('.mg-menu-header');rect=header.bounding_box();page.locator('#mg-menu-scroll').evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(150);ok('header remains fixed while shop scrolls',header.bounding_box()==rect)
 page.locator('#mg-autofarm-v13').screenshot(path=str(OUT/'shop-ready.png'))
 ok('catalog import is cached rather than repeated every second',len(page.evaluate('__catalogImports'))==1)
 ok('no uncaught browser errors',not errors)
 (OUT/'report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'scope':'Chromium offline fixture ESM imports, real bundled loader/menu/sender; no live account'},indent=2,ensure_ascii=False));print(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2,ensure_ascii=False));b.close()
