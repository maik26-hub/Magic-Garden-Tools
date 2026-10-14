"""Chromium UI acceptance on the distributed bundle; no real server/account requests.
Run: python tests/browser/compact_menu.py
Requires Playwright for Python and an installed Chromium (CHROMIUM_PATH optional).
"""
from pathlib import Path
import json, os, re
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('MG_UI_TEST_OUTPUT', str(ROOT / 'test-output')))
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = (ROOT / 'MagicGardenAutoFarm.user.js').read_text()
VERSION = re.search(r'// @version\s+(\S+)', SOURCE).group(1)
checks = []
def ok(name, value):
    assert value, name
    checks.append(name)

MOCK = r"""
(() => {
  window.__sent = [];
  window.__testAlerts = [];
  class Socket extends EventTarget {
    static OPEN = 1;
    constructor(url) { super(); this.url = url; this.readyState = 1; }
    send(payload) {
      const msg=JSON.parse(payload); window.__sent.push(msg);
      if(msg.type==='QuinoaCommand') setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{
        data:JSON.stringify({type:'QuinoaCommandResult',requestId:msg.requestId,commandType:msg.command.type,ok:true,itemGains:[]})
      })), 10);
    }
  }
  window.WebSocket = Socket;
  // Make update fetch deterministic, leaving the userscript's validation intact.
  window.fetch = async () => ({ok:true,text:async()=>
    '// ==UserScript==\n// @name Magic Garden AutoFarm\n// @namespace mg-autofarm-local\n// @version 99.1.0\n// ==/UserScript==\n'});
  if(!localStorage.getItem('magic_garden_selected_tiles_v1')) localStorage.setItem('magic_garden_selected_tiles_v1',JSON.stringify({left:[0,1,2,3],right:[0,1]}));
  window.addEventListener('DOMContentLoaded', () => {
    const ws=new window.WebSocket('wss://magicgarden.gg/version/1517/api/rooms/mock-ui');
    window.MagicCircle_RoomConnection={
      currentWebSocket:ws,lastDistributedRoomPublication:{executedCommandSequence:0},
      subscribeToPatches(fn) {
        const snapshot={data:{players:[]},child:{data:{weather:'Rain',shops:{},userSlots:[{userId:'test-self',data:{coinsCount:1500000,petSlots:[],petTeams:[{id:'test-team',name:'Regen-Team',members:[]}],shopPurchases:{},journal:{produce:{},pets:{}},garden:{tileObjects:{0:{objectType:'plant',species:'Carrot',slots:[{slotId:0,endTime:Date.now()+900000,locked:true}]} }},inventory:{items:[],favoritedItemIds:[],storages:[]}}}]}}};
        fn([],snapshot); return ()=>{};
      }
    };
    ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'Welcome',selfPlayerId:'test-self',executedCommandSequence:0})}));
  });
})();
"""
HTML = """<!doctype html><html lang='de'><head><meta charset='utf-8'><title>AutoFarm – UI test fixture</title><style>
html,body{margin:0;min-height:100%;background:#192520;font-family:system-ui,sans-serif}body{height:220vh;background-image:linear-gradient(#ffffff03 1px,transparent 1px),linear-gradient(90deg,#ffffff03 1px,transparent 1px);background-size:52px 52px}main{color:#83988a;padding:40px;opacity:.5}button{font-size:17px}
</style></head><body><main>Magic Garden · lokale UI-Testumgebung</main><canvas id='game'></canvas></body></html>"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1280,'height':900}, locale='de-DE')
    errors=[]
    def fixture(seed=None):
        # Offline document: no network navigation, cookies or game-account session.
        new_page=context.new_page()
        new_page.on('pageerror', lambda e: errors.append(str(e)))
        new_page.route('**/*', lambda route: route.abort())
        new_page.set_content(HTML)
        new_page.evaluate("""(seed) => {
            const make = values => {
              const map = new Map(Object.entries(values || {}));
              return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),dump:()=>Object.fromEntries(map)};
            };
            Object.defineProperty(window,'localStorage',{value:make(seed.local),configurable:true});
            Object.defineProperty(window,'sessionStorage',{value:make(seed.session),configurable:true});
        }""",seed or {'local':{},'session':{}})
        new_page.evaluate(MOCK + '\n' + SOURCE)
        new_page.evaluate("window.dispatchEvent(new Event('DOMContentLoaded'))")
        return new_page
    def reload_fixture(old_page):
        seed=old_page.evaluate('({local:localStorage.dump(),session:sessionStorage.dump()})')
        old_page.close()
        return fixture(seed)
    page=fixture()
    panel=page.locator('#mg-autofarm-v13'); header=page.locator('.mg-menu-header'); scroll=page.locator('#mg-menu-scroll')
    panel.wait_for(); page.wait_for_timeout(600)
    ok('compact icon home with 12 sections and no auto-actions', page.locator('.mg-shortcut').count()==12 and page.evaluate('window.__sent.length')==0)
    ok('correct version visible in header',page.locator('.mg-version').inner_text()=='v'+VERSION)
    panel.screenshot(path=str(OUT/'menu-home.png'))
    labels=['Übersicht','Felder','Pflanzen','Pets & Futter','Einkauf','Schutz','Journal','Wetter','Autopilot','Einstellungen','Updates','Diagnose']
    for label in labels:
        page.get_by_role('button',name=label,exact=True).click()
        ok('section accessible: '+label,page.locator('.mg-menu-view:visible').count()==1 and page.locator('.mg-location-title').inner_text()==label)
        page.get_by_role('button',name='Zur Übersicht',exact=True).click()
    ok('navigation alone never starts the bot or purchases',page.evaluate('window.__sent.length')==0)
    page.set_viewport_size({'width':1280,'height':600});page.wait_for_timeout(100)
    page.get_by_role('button',name='Einkauf',exact=True).click()
    page.get_by_label('Tagesbudget (0 = keine Käufe)',exact=True).fill('25000')
    page.get_by_label('Tagesbudget (0 = keine Käufe)',exact=True).press('Tab')
    page.wait_for_timeout(100)
    ok('existing automation setting handler preserved',page.evaluate('MGAutoFarmV13.automation.getConfig().dailyBudget')==25000)
    before=header.bounding_box()
    scroll.evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
    page.wait_for_timeout(200)
    after=header.bounding_box()
    ok('header stationary while content scrolls',before==after and scroll.evaluate('(el)=>el.scrollTop')>0)
    ok('header and Start/Stop outside scroll container', page.evaluate("!document.querySelector('#mg-menu-scroll').contains(document.querySelector('.mg-menu-header')) && !document.querySelector('#mg-menu-scroll').contains(document.querySelector('.mg-menu-controls'))"))
    panel.screenshot(path=str(OUT/'menu-shop-scrolled.png'))
    page.get_by_role('button',name='Menü einklappen',exact=True).click()
    ok('collapse from a scrolled page leaves title visible', header.is_visible() and not scroll.is_visible() and panel.bounding_box()['height']<65)
    page.get_by_role('button',name='Menü ausklappen',exact=True).click()
    ok('expand restores current section and scroll location',scroll.is_visible() and page.locator('.mg-location-title').inner_text()=='Einkauf' and scroll.evaluate('(el)=>el.scrollTop')>0)
    page.get_by_role('button',name='Zur Übersicht',exact=True).click()
    page.get_by_role('button',name='Felder',exact=True).click()
    field=page.locator('[data-mg-field][data-side="left"][data-index="10"]')
    field.scroll_into_view_if_needed(); end=page.locator('[data-mg-field][data-side="left"][data-index="14"]')
    a=field.bounding_box(); b=end.bounding_box()
    page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down()
    page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=12);page.mouse.up()
    ok('drag selects every traversed field with accessible state',all(page.locator(f'[data-side="left"][data-index="{n}"]').get_attribute('aria-pressed')=='true' for n in range(10,15)))
    ok('all 200 fields remain present',page.locator('[data-mg-field]').count()==200)
    panel.screenshot(path=str(OUT/'menu-fields.png'))
    # Actual wheel input with the pointer over the scrollable content.
    sb=scroll.bounding_box(); hb=header.bounding_box(); page.mouse.move(sb['x']+sb['width']-12,sb['y']+sb['height']-30)
    page.mouse.wheel(0,600);page.wait_for_timeout(200)
    ok('mouse wheel scroll keeps header at exactly same viewport position',header.bounding_box()==hb and scroll.evaluate('(el)=>el.scrollTop')>0)
    page.get_by_role('button',name='Zur Übersicht',exact=True).click()
    page.get_by_role('button',name='Einstellungen',exact=True).click()
    page.get_by_text('Min. Erntepause (ms)',exact=True).locator('..').locator('input').fill('95')
    page.get_by_text('Min. Erntepause (ms)',exact=True).locator('..').locator('input').press('Tab')
    ok('original speed preference remains wired',page.evaluate('MGAutoFarmV13.prefs.minHarvestDelayMs')==95)
    page.get_by_role('button',name='Zur Übersicht',exact=True).click();page.get_by_role('button',name='Updates',exact=True).click()
    page.get_by_role('button',name='Update prüfen',exact=True).click();page.wait_for_timeout(100)
    link=page.get_by_role('link',name='Installieren',exact=True)
    ok('update check and install link use original release channel',link.is_visible() and link.get_attribute('href').endswith('/main/MagicGardenAutoFarm.user.js'))
    page.get_by_role('button',name='Zur Übersicht',exact=True).click()
    ok('home Update tile indicates available release',page.locator('[data-section="updates"]').get_attribute('data-new')=='true')
    # Start, F8 stop, and reset counters through the moved original controls.
    page.get_by_role('button',name='AutoFarm starten',exact=True).click();page.wait_for_timeout(250)
    ok('Start updates anchored running indicator',page.locator('.mg-menu-title').inner_text()=='AutoFarm · Aktiv' and page.evaluate('MGAutoFarmV13.state.running'))
    page.keyboard.press('F8');page.wait_for_timeout(200)
    ok('F8 Stop remains functional',not page.evaluate('MGAutoFarmV13.state.running'))
    page.evaluate('Object.assign(MGAutoFarmV13.state,{harvested:40,sold:4,coins:12345})')
    page.get_by_role('button',name='Übersicht',exact=True).click();page.get_by_role('button',name='Session zurücksetzen',exact=True).click()
    ok('session reset retains its original handler',page.evaluate('MGAutoFarmV13.state.harvested+MGAutoFarmV13.state.sold+MGAutoFarmV13.state.coins')==0)
    # Scrolled header drag persists and remains reachable.
    page.get_by_role('button',name='Zur Übersicht',exact=True).click()
    h=header.bounding_box(); page.mouse.move(h['x']+50,h['y']+h['height']/2);page.mouse.down();page.mouse.move(h['x']-190,h['y']+90,steps=8);page.mouse.up()
    new=header.bounding_box()
    ok('dragging the title moves the whole menu and persists position',new['x']<h['x']-150 and bool(page.evaluate('localStorage.getItem("magic_garden_v13_panel_position")')))
    before_reload=panel.bounding_box()
    page=reload_fixture(page);panel=page.locator('#mg-autofarm-v13');header=page.locator('.mg-menu-header');scroll=page.locator('#mg-menu-scroll');panel.wait_for();page.wait_for_timeout(300)
    ok('position and choices survive F5',abs(panel.bounding_box()['x']-before_reload['x'])<2 and page.evaluate('MGAutoFarmV13.automation.getConfig().dailyBudget')==25000)
    page.set_viewport_size({'width':360,'height':640});page.wait_for_timeout(150)
    box=panel.bounding_box()
    ok('small-screen position and width clamped to viewport',box['x']>=0 and box['x']+box['width']<=360 and header.bounding_box()['y']>=0)
    page.get_by_role('button',name='Einkauf',exact=True).click()
    ok('forms fit narrow viewport without horizontal overflow',scroll.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'))
    panel.screenshot(path=str(OUT/'menu-mobile.png'))
    page.set_viewport_size({'width':640,'height':280});page.wait_for_timeout(100)
    scroll.evaluate('(el)=>el.scrollTop=el.scrollHeight');hb=header.bounding_box()
    ok('title still visible on short viewport',hb['y']>=0 and hb['y']+hb['height']<=280 and scroll.bounding_box()['height']>0)
    page.get_by_role('button',name='Menü einklappen',exact=True).click();page=reload_fixture(page);panel=page.locator('#mg-autofarm-v13');header=page.locator('.mg-menu-header');scroll=page.locator('#mg-menu-scroll');panel.wait_for()
    ok('collapsed state survives F5 and can be expanded',not scroll.is_visible() and page.get_by_role('button',name='Menü ausklappen',exact=True).is_visible())
    page.get_by_role('button',name='Menü ausklappen',exact=True).click()
    ok('no uncaught page errors',errors==[])
    report={'version':VERSION,'checks':len(checks),'passed':checks,'pageErrors':errors,'environment':'Chromium offline document with mocked game/storage; reload simulated by fresh document and persisted stores; no live account requests'}
    (OUT/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
    print(json.dumps(report,indent=2,ensure_ascii=False)); browser.close()
