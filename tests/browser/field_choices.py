"""Real DOM acceptance for V15.2 plot roles and catalog pickers. No live account/network."""
from pathlib import Path
import os, json, re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('MG_CHOICES_TEST_OUTPUT',str(ROOT/'test-output/field-choices')));OUT.mkdir(parents=True,exist_ok=True)
SOURCE=(ROOT/'MagicGardenAutoFarm.user.js').read_text();VERSION=re.search(r'@version\s+(\S+)',SOURCE).group(1)
HTML='<!doctype html><html lang="de"><head><meta charset="utf-8"></head><body style="background:#192520"><canvas></canvas></body></html>'
CATALOGS={
 'plants':{'Carrot':{'name':'Carrot','seed':{'coinPrice':10,'eligibleShops':['seed']},'crop':{'baseSellPrice':20,'maxSizeMultiplier':3}},'BurrosTail':{'name':'Burro’s Tail','seed':{'coinPrice':500,'eligibleShops':['seed']},'crop':{'baseSellPrice':200,'maxSizeMultiplier':3}},'Blueberry':{'name':'Blueberry','seed':{'coinPrice':50,'eligibleShops':['seed']},'crop':{'baseSellPrice':40,'maxSizeMultiplier':3}}},
 'eggs':{'CommonEgg':{'name':'Common Egg','coinPrice':100,'secondsToHatch':600,'eligibleShops':['egg']}},
 'tools':{'WateringCan':{'name':'Watering Can','coinPrice':5000,'eligibleShops':['tool']},'Camera':{'name':'Camera','coinPrice':10000,'eligibleShops':['tool']}},
 'mutations':{'Gold':{'name':'Gold','coinMultiplier':25,'group':'Growth'},'Wet':{'name':'Wet','coinMultiplier':2,'group':'Hydro'}},
 'decor':{'Fence':{'name':'Fence','coinPrice':500,'eligibleShops':['decor']}}
}
MOCK=r"""(()=>{
 window.__sent=[]; let requestCounter=0;
 Object.defineProperty(crypto,"randomUUID",{value:()=>"test-uuid-"+(++requestCounter),configurable:true});
 class Socket extends EventTarget {static OPEN=1;constructor(url){super();this.url=url;this.readyState=1;}send(payload){const m=JSON.parse(payload);window.__sent.push(m);if(m.type!=='QuinoaCommand')return;setTimeout(()=>{const c=m.command;if(c.type==='HarvestCrop'||c.type==='HatchEgg')delete window.__own.garden.tileObjects[c.slot];this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'QuinoaCommandResult',requestId:m.requestId,commandType:c.type,ok:true,itemGains:[]})}));window.__patch?.([],window.__snapshot);},15);}}
 window.WebSocket=Socket;
 window.fetch=async()=>({ok:true,text:async()=>'// ==UserScript==\n// @name Magic Garden AutoFarm\n// @namespace mg-autofarm-local\n// @version 99.1.0\n// ==/UserScript==\n'});
 window.addEventListener('DOMContentLoaded',()=>{
 const crop={objectType:'plant',species:'Carrot',slots:[{slotId:0,endTime:0,size:50,mutations:[]}]};const egg={objectType:'egg',eggId:'CommonEgg',maturedAt:0,plantedAt:1};
 const own=window.__own={coinsCount:1000000,petSlots:[],petTeams:[{id:'saved-team',name:'Regenfreunde',members:[]}],shopPurchases:{},journal:{produce:{},pets:{}},inventory:{items:[{itemType:'Seed',species:'Carrot',quantity:3}],favoritedItemIds:[],storages:[]},garden:{tileObjects:{0:structuredClone(crop),1:structuredClone(egg),2:structuredClone(crop),3:structuredClone(egg),4:structuredClone(egg),5:structuredClone(crop)}}};
 window.__snapshot={data:{players:[]},child:{data:{weather:'Rain',shops:{seed:{restockId:'cycle',deadlineMs:Date.now()+600000,inventory:[{itemType:'Seed',species:'Carrot',initialStock:5}]}},userSlots:[{userId:'self',data:own}]}}};
 const ws=new window.WebSocket('wss://magicgarden.gg/version/1517/api/rooms/mock');window.MagicCircle_RoomConnection={currentWebSocket:ws,lastDistributedRoomPublication:{executedCommandSequence:0},subscribeToPatches(fn){window.__patch=fn;fn([],window.__snapshot);return()=>{};}};ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'Welcome',selfPlayerId:'self',executedCommandSequence:0})}));
 });
})();"""
checks=[]
def ok(name,condition):
 assert condition,name
 checks.append(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1280,'height':840},locale='de-DE');errors=[]
 def new_page(seed=None):
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda r:r.abort());page.set_content(HTML)
  page.evaluate('''seed=>{const make=values=>{const m=new Map(Object.entries(values||{}));return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>Object.fromEntries(m)};};Object.defineProperty(window,'localStorage',{value:make(seed.local),configurable:true});Object.defineProperty(window,'sessionStorage',{value:make(seed.session),configurable:true});}''',seed or {'local':{},'session':{}})
  page.add_script_tag(content=MOCK);page.add_script_tag(content=SOURCE);page.evaluate("window.dispatchEvent(new Event('DOMContentLoaded'))")
  page.locator('#mg-autofarm-v13').wait_for();page.wait_for_timeout(400);return page
 def go(label):
  back=page.get_by_role('button',name='Zur Übersicht',exact=True)
  if back.is_visible():back.click()
  page.get_by_role('button',name=label,exact=True).click()
 page=new_page({'local':{'magic_garden_selected_tiles_v1':json.dumps({'left':[0,1],'right':[]}), 'magic_garden_automation_v15':json.dumps({'keepSpecies':['GhostPlant'],'wantedMutations':['Gold']})},'session':{}})
 panel=page.locator('#mg-autofarm-v13');header=page.locator('.mg-menu-header');scroll=page.locator('#mg-menu-scroll')
 go('Schutz');picker=page.locator('[data-choice="keepSpecies"]');picker.locator('summary').click()
 ok('saved selections retained while game catalogs are absent',page.evaluate("MGAutoFarmV13.automation.getConfig().keepSpecies.includes('GhostPlant')"))
 ok('multi-choice list exposes saved entry, not raw-ID textbox',picker.get_by_label('Ghost Plant (gespeichert)',exact=True).is_checked())
 ok('no free-text identifier inputs remain anywhere',page.locator('#mg-autofarm-v13 input[type="text"],#mg-autofarm-v13 input:not([type])').count()==0)
 page.evaluate('catalogs=>Object.assign(MGAutoFarmV13.automation.catalogs(),catalogs)',CATALOGS);page.wait_for_timeout(1100)
 picker.get_by_label('Diese Pflanzenarten behalten durchsuchen').fill('burro')
 ok('search filters out nonmatching plant names',not picker.get_by_label('Carrot',exact=True).is_visible())
 picker.get_by_label('Burro’s Tail',exact=True).check()
 ok('plant choices search by displayed name and save native identifier',page.evaluate("MGAutoFarmV13.automation.getConfig().keepSpecies.includes('BurrosTail')"))
 page.wait_for_timeout(1100)
 ok('periodic UI refresh retains search focus/value and selection',picker.get_by_label('Diese Pflanzenarten behalten durchsuchen').input_value()=='burro' and picker.get_by_label('Burro’s Tail',exact=True).is_checked())
 picker.locator('summary').click()
 mutations=page.locator('[data-choice="wantedMutations"]');mutations.locator('summary').click();mutations.get_by_label('Wet',exact=True).check()
 ok('mutation checkboxes provide multi-selection with native values',set(page.evaluate('MGAutoFarmV13.automation.getConfig().wantedMutations'))=={'Gold','Wet'})
 mutations.locator('summary').click()
 weather=page.locator('[data-choice="pauseWeather"]');weather.locator('summary').click();weather.get_by_label('Regen',exact=True).check()
 ok('readable weather menu maps Regen to Rain',page.evaluate('MGAutoFarmV13.automation.getConfig().pauseWeather')==['Rain'])
 panel.screenshot(path=str(OUT/'choice-menus.png'));weather.locator('summary').click()
 go('Wetter');page.get_by_label('Bei diesem Wetter',exact=True).select_option(label='Regen');page.get_by_label('Gespeichertes Team',exact=True).select_option(label='Regenfreunde');page.get_by_role('button',name='Teamregel speichern',exact=True).click()
 ok('weather team rules also need no typed identifiers',page.evaluate('MGAutoFarmV13.automation.getConfig().teamRules')==[{'weather':'Rain','teamId':'saved-team'}])
 go('Einkauf');page.get_by_label('Artikel auswählen',exact=True).select_option(label='Burro’s Tail · 500 Coins');page.wait_for_timeout(100)
 ok('shop lists unowned known seeds, and proposes verified price',page.get_by_label('Höchstens Coins pro Stück').input_value()=='500')
 ok('shop choice is constrained to eligible readable shops',page.get_by_label('In diesem Shop').input_value()=='seed' and page.get_by_label('In diesem Shop').locator('option:checked').inner_text()=='Saatgutladen')
 page.get_by_label('Maximal pro Restock').fill('2');page.get_by_label('Gewünschter Gesamtbestand').fill('42');page.get_by_role('button',name='Kaufregel speichern').click()
 rule=page.evaluate('MGAutoFarmV13.automation.getConfig().buyRules[0]')
 ok('catalog purchase selection becomes a bounded rule with native payload values',rule=={'type':'Seed','id':'BurrosTail','shop':'seed','maxPrice':500,'perRestock':2,'maxOwned':42})
 ok('saving a shop rule leaves buy disabled and no day budget remains',page.evaluate("!MGAutoFarmV13.automation.getConfig().buy && !('dailyBudget' in MGAutoFarmV13.automation.getConfig())"))
 page.get_by_label('Was kaufen?').select_option(label='Eier');page.get_by_label('Artikel auswählen').select_option(label='Common Egg · 100 Coins');page.get_by_role('button',name='Kaufregel speichern').click()
 ok('egg purchases use the same menu, with correct egg shop/type',page.evaluate('MGAutoFarmV13.automation.getConfig().buyRules[1].type')=='Egg' and page.get_by_label('In diesem Shop').input_value()=='egg')
 page.locator('.mg-buy-rule').first.get_by_role('button',name='Bearbeiten').click();page.get_by_label('Gewünschter Gesamtbestand').fill('24');page.get_by_role('button',name='Kaufregel speichern').click()
 ok('saved rules can be edited without duplication',page.evaluate("MGAutoFarmV13.automation.getConfig().buyRules.length===2 && MGAutoFarmV13.automation.getConfig().buyRules.find(r=>r.id==='BurrosTail').maxOwned===24"))
 before=header.bounding_box();scroll.evaluate('(e)=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(150)
 ok('anchored header still does not move when menus scroll',header.bounding_box()==before)
 panel.screenshot(path=str(OUT/'shop-choices.png'))
 go('Felder');ok('old chosen fields migrated to green without any blue inference',page.evaluate("MGAutoFarmV13.fieldPlan.get(0)==='plant' && MGAutoFarmV13.fieldPlan.get(1)==='plant' && MGAutoFarmV13.fieldPlan.counts().egg===0"))
 page.get_by_role('button',name='Alles grau',exact=True).click();ok('all-grey clears every field role',page.evaluate('MGAutoFarmV13.fieldPlan.indices().length')==0)
 def tile(i):return page.locator(f'[data-mg-field][data-side="left"][data-index="{i}"]')
 page.get_by_role('button',name='Pflanzen malen',exact=True).click();tile(0).click();tile(4).click()
 page.get_by_role('button',name='Eier malen',exact=True).click();tile(1).click();tile(5).click()
 ok('explicit brushes produce exactly requested green/blue/grey plots',page.evaluate("JSON.stringify(MGAutoFarmV13.fieldPlan.snapshot().slice(0,6))")=='["plant","egg","none","none","plant","egg"]')
 page.get_by_role('button',name='Farben durchwechseln',exact=True).click();tile(6).click();tile(6).click()
 ok('click cycle reaches blue on second click',tile(6).get_attribute('data-mode')=='egg');tile(6).click();ok('third click returns to grey',tile(6).get_attribute('data-mode')=='none')
 page.get_by_role('button',name='Eier malen',exact=True).click();a=tile(10);b=tile(14);a.scroll_into_view_if_needed();abox=a.bounding_box();bbox=b.bounding_box();page.mouse.move(abox['x']+abox['width']/2,abox['y']+abox['height']/2);page.mouse.down();page.mouse.move(bbox['x']+bbox['width']/2,bbox['y']+bbox['height']/2,steps=12);page.mouse.up()
 ok('held drag paints all crossed plots one blue role',all(tile(i).get_attribute('data-mode')=='egg' for i in range(10,15)))
 page.get_by_role('button',name='Ignorieren malen',exact=True).click();tile(12).focus();page.keyboard.press('Enter')
 ok('keyboard applies selected role and exposes role in accessible name',tile(12).get_attribute('data-mode')=='none' and 'Ignorieren' in tile(12).get_attribute('aria-label'))
 panel.screenshot(path=str(OUT/'colored-fields.png'))
 ok('200 field buttons still exist',page.locator('[data-mg-field]').count()==200)
 ok('configuration and UI use sends no game actions',page.evaluate('window.__sent.length')==0)
 # Recreate document with persisted stores, like F5, without using an account.
 seed=page.evaluate('({local:localStorage.dump(),session:sessionStorage.dump()})');before_roles=page.evaluate('MGAutoFarmV13.fieldPlan.snapshot()');page.close();page=new_page(seed);page.evaluate('c=>Object.assign(MGAutoFarmV13.automation.catalogs(),c)',CATALOGS);page.wait_for_timeout(1100);panel=page.locator('#mg-autofarm-v13');header=page.locator('.mg-menu-header');scroll=page.locator('#mg-menu-scroll')
 ok('field colors survive page recreation',page.evaluate('MGAutoFarmV13.fieldPlan.snapshot()')==before_roles)
 ok('multi-selection and purchase rules survive page recreation',page.evaluate("MGAutoFarmV13.automation.getConfig().keepSpecies.includes('BurrosTail') && MGAutoFarmV13.automation.getConfig().buyRules.length===2"))
 go('Pflanzen');ok('old implicit egg reservation control is gone',page.get_by_text('Letzte Auswahlfelder für Eier',exact=True).count()==0)
 ok('irrelevant planting/egg options stay hidden until enabled',not page.get_by_label('Saatgut',exact=True).is_visible() and not page.get_by_label('Welche Eier platzieren?',exact=True).is_visible() and not page.get_by_label('Welche Eier ausbrüten?',exact=True).is_visible())
 page.get_by_label('Leere grüne Felder bepflanzen',exact=True).check();page.get_by_label('Saatgut',exact=True).select_option(label='Carrot');ok('green planting type selectable without a code',page.evaluate('MGAutoFarmV13.automation.getConfig().seedSpecies')=='Carrot');page.get_by_label('Leere grüne Felder bepflanzen',exact=True).uncheck()
 # Independent filters: a selected hatch type never silently changes placing.
 page.get_by_label('Reife Eier auf blauen Feldern öffnen',exact=True).check()
 ok('hatching initially allows all ready eggs',page.get_by_label('Welche Eier ausbrüten?',exact=True).input_value()=='all')
 page.get_by_label('Welche Eier ausbrüten?',exact=True).select_option('selected')
 hatch_picker=page.locator('[data-choice="eggHatchAllowed"]');hatch_picker.locator('summary').click()
 hatch_picker.get_by_label('Common Egg · 0 im Inventar',exact=True).check()
 ok('hatch filter is independent and saves native egg identity',page.evaluate("MGAutoFarmV13.automation.getConfig().eggHatchAllowed")==['CommonEgg'] and page.get_by_label('Welche Eier platzieren?',exact=True).is_visible()==False)
 hatch_picker.locator('summary').click()
 page.get_by_label('Leere blaue Felder mit Eiern füllen',exact=True).check()
 ok('placement defaults to all inventory egg types',page.get_by_label('Welche Eier platzieren?',exact=True).input_value()=='all')
 page.get_by_label('Welche Eier platzieren?',exact=True).select_option('selected')
 place_picker=page.locator('[data-choice="eggPlaceAllowed"]');place_picker.locator('summary').click()
 place_picker.get_by_label('Common Egg · 0 im Inventar',exact=True).check()
 ok('place filter can select egg species independent of hatch filter',page.evaluate("MGAutoFarmV13.automation.getConfig().eggPlaceAllowed")==['CommonEgg'] and page.evaluate("MGAutoFarmV13.automation.getConfig().eggHatchAllowed")==['CommonEgg'])
 place_picker.locator('summary').click()
 ok('no raw egg ID input exposed anywhere',page.locator('#mg-autofarm-v13 input[type="text"]').count()==0)
 # The existing integration below turns off placement and verifies a blue hatch.
 page.get_by_label('Leere blaue Felder mit Eiern füllen',exact=True).uncheck()
 # Only hatch + standard harvesting active. Test roles on actual emitted payloads.
 page.evaluate("MGAutoFarmV13.automation.configure({enabled:true,hatch:true,plant:false,eggs:false,water:false,feed:false,favorite:false,journal:false,buy:false,claims:false,keepSpecies:[],wantedMutations:[],pauseWeather:[]})")
 page.get_by_role('button',name='AutoFarm starten',exact=True).click();page.wait_for_timeout(2000);page.get_by_role('button',name='AutoFarm stoppen',exact=True).click()
 wire=page.evaluate("window.__sent.filter(x=>x.type==='QuinoaCommand').map(x=>x.command)")
 ok('actual loop harvests only green ready crop and hatches only blue ready egg',sorted((x['type'],x['slot']) for x in wire)==[('HarvestCrop',0),('HatchEgg',1)])
 page.set_viewport_size({'width':360,'height':640});go('Schutz');page.locator('[data-choice="keepSpecies"] summary').click();scroll.evaluate('(e)=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(100)
 ok('multi-select fits a narrow viewport',scroll.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'))
 ok('header remains reachable at small width',header.bounding_box()['y']>=0)
 panel.screenshot(path=str(OUT/'narrow-choices.png'))
 ok('no uncaught browser errors',not errors)
 report={'version':VERSION,'checks':len(checks),'passed':checks,'pageErrors':errors,'environment':'Chromium offline mock game; actual built userscript and controls, no live account test'}
 (OUT/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
