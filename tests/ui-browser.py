"""Chromium UI regressions using synthetic game/catalog state, never a live account.
Run: python tests/ui-browser.py (requires playwright + Chromium).
"""
import json
import os
from pathlib import Path
import unittest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'MagicGardenAutoFarm.user.js').read_text()
WIDGETS = (ROOT / 'src/choice-menu.js').read_text()
VERSION = '15.1.0'
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
CATALOGS = {
 'plants': {
   'Carrot': {'name': 'Carrot', 'seed': {'coinPrice': 10}, 'crop': {'baseSellPrice': 20,'maxSizeMultiplier':3}},
   'BurrosTail': {'name': "Burro’s Tail",'seed': {},'crop': {'baseSellPrice': 100,'maxSizeMultiplier':2}},
   **{f'Plant{i:02d}': {'name':f'Example plant {i:02d}', 'seed':{},'crop':{}} for i in range(45)}
 },
 'pets': {'Worm': {'diet':['Carrot'],'coinsToFullyReplenishHunger':500}},
 'mutations': {'Gold': {'name':'Gold','group':'Growth','coinMultiplier':25},
   'Rainbow': {'name':'Rainbow','group':'Growth','coinMultiplier':50},
   'Wet': {'name':'Wet','group':'Weather','coinMultiplier':2}},
 'eggs': {'CommonEgg': {'coinPrice':10,'secondsToHatch':100}},
 'tools': {'WateringCan': {'coinPrice':10},'Camera':{'coinPrice':50}},
 'decor': {'SeedSilo':{},'FeedingTrough':{'coinPrice':50}}
}
FIXTURE = r"""
window.__sent = [];
const originalFetch=window.fetch.bind(window);
window.fetch=(url,opts)=>String(url).includes('raw.githubusercontent.com')?Promise.resolve(new Response(window.__testRelease,{status:200})):originalFetch(url,opts);
class FakeSocket extends EventTarget {
  static OPEN=1;
  constructor(url){super();this.url=url;this.readyState=1;}
  send(payload){window.__sent.push(JSON.parse(payload));}
}
window.WebSocket=FakeSocket;
const originalEntries=performance.getEntriesByType.bind(performance);
performance.getEntriesByType=function(kind){return originalEntries(kind);};
if(!localStorage.getItem('magic_garden_selected_tiles_v1'))localStorage.setItem('magic_garden_selected_tiles_v1',JSON.stringify({left:[0,1,2,3],right:[]}));
if(!localStorage.getItem('magic_garden_automation_v15'))localStorage.setItem('magic_garden_automation_v15',JSON.stringify({keepSpecies:['Carrot','LegacySpecies']}));
window.__full={data:{players:[]},child:{data:{weather:'Rain',shops:{},userSlots:[{userId:'self',data:{coinsCount:500,
 garden:{tileObjects:{0:{objectType:'plant',species:'Carrot',slots:[{slotId:0,endTime:0,locked:true,mutations:[]}]}}},
 inventory:{items:[],favoritedItemIds:[],storages:[]},petSlots:[],petTeams:[{id:'team1',name:'Rain team',members:[]}]
}}]}}};
window.__connectFixture=()=>{
 const ws=new WebSocket('wss://magicgarden.gg/version/1517/api/rooms/fixture');
 window.MagicCircle_RoomConnection={currentWebSocket:ws,lastDistributedRoomPublication:{executedCommandSequence:0},subscribeToPatches(fn){fn([],window.__full);return ()=>{};}};
 ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'Welcome',selfPlayerId:'self',executedCommandSequence:0})}));
};
"""
class UITests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start()
  exe=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')
  kwargs={'headless':True,'args':['--no-sandbox']}
  if Path(exe).exists():kwargs['executable_path']=exe
  cls.browser=cls.pw.chromium.launch(**kwargs)
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':1050,'height':850})
  self.errors=[]
  self.remote=SOURCE
  self.page=self.context.new_page()
  self.page.on('pageerror',lambda e:self.errors.append(str(e)))
  self.load_page()
 def load_page(self,saved=None):
  self.page.goto('about:blank')
  self.page.set_content('<!doctype html><html lang="de"><head><meta charset="utf-8"><style>body{background:#171a18;margin:0;font-family:system-ui;color:#90988f;}h1{font-size:19px;margin:30px}p{margin:30px}</style></head><body><h1>AutoFarm UI-Prüfung</h1><p>Simuliertes Spiel · keine Serveraktionen</p></body></html>')
  self.page.evaluate("""(data)=>{
    for(const key of ['localStorage','sessionStorage']) {
      const map=new Map(Object.entries(data[key]||{}));
      Object.defineProperty(window,key,{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),dump:()=>Object.fromEntries(map)}});
    }
  }""",saved or {})
  self.page.evaluate('(s)=>window.__testRelease=s',SOURCE)
  self.page.add_script_tag(content=FIXTURE)
  self.page.add_script_tag(content=SOURCE)
  self.page.evaluate('window.__connectFixture()')
  self.page.evaluate('(c)=>Object.assign(MGAutoFarmV13.automation.catalogs(),c)',CATALOGS)
  self.page.locator('#mg15-header').wait_for()
  self.page.wait_for_timeout(450)
 def reload_page(self):
  saved=self.page.evaluate('({localStorage:localStorage.dump(),sessionStorage:sessionStorage.dump()})')
  self.load_page(saved)
 def tearDown(self):
  errors=self.errors[:];self.context.close();self.assertEqual(errors,[])
 def tab(self,id):self.page.locator('#mg15-tab-'+id).click()
 def header_rect(self):return self.page.locator('#mg15-header').bounding_box()
 def scroll_bottom(self):
  self.page.locator('#mg15-scroll').evaluate('(el)=>el.scrollTop=el.scrollHeight')
  self.page.wait_for_timeout(100)
 def test_header_is_fixed_while_content_scrolls(self):
  self.tab('settings')
  before=self.header_rect();self.scroll_bottom();after=self.header_rect()
  self.assertAlmostEqual(before['y'],after['y'],delta=1)
  self.assertGreater(self.page.locator('#mg15-scroll').evaluate('(e)=>e.scrollTop'),20)
  self.assertEqual(self.page.locator('#mg-autofarm-v13').evaluate('(e)=>e.scrollTop'),0)
  self.assertTrue(self.page.get_by_role('button',name='Update prüfen',exact=True).is_visible())
  self.tab('farm');self.page.locator('#mg-autofarm-v13').screenshot(path=str(OUT/'ui-overview.png'))
 def test_searchable_choices_persist_without_sending_actions(self):
  self.tab('automation')
  self.page.locator('summary').filter(has_text='Erntefilter & Wertschutz').click()
  menu=self.page.locator('[data-preference="keepSpecies"]');menu.locator('summary').click()
  search=menu.get_by_role('searchbox');search.fill('burro')
  menu.get_by_role('checkbox',name='Burro’s Tail',exact=True).check()
  self.page.wait_for_timeout(1200)
  self.assertEqual(search.input_value(),'burro')
  self.assertTrue(menu.evaluate('(e)=>e.open'))
  chosen=self.page.evaluate('MGAutoFarmV13.automation.getConfig().keepSpecies')
  self.assertCountEqual(chosen,['Carrot','LegacySpecies','BurrosTail'])
  search.fill('legacy');self.assertTrue(menu.get_by_role('checkbox',name='Legacy Species',exact=True).is_checked())
  menu.locator('summary').click()
  mutations=self.page.locator('[data-preference="wantedMutations"]');mutations.locator('summary').click()
  mutations.get_by_role('checkbox',name='Rainbow',exact=True).check()
  mutations.get_by_role('checkbox',name='Gold',exact=True).check()
  mutations.locator('summary').click()
  weather=self.page.locator('[data-preference="pauseWeather"]');weather.locator('summary').click()
  weather.get_by_role('checkbox',name='Regen',exact=True).check()
  weather.get_by_role('checkbox',name='Gewitter',exact=True).check()
  self.assertEqual(self.page.evaluate('window.__sent.length'),0)
  self.assertEqual(self.page.get_by_placeholder('IDs, mit Komma getrennt').count(),0)
  self.page.locator('#mg-autofarm-v13').screenshot(path=str(OUT/'ui-choices.png'))
  self.reload_page();self.page.locator('#mg15-header').wait_for()
  saved=self.page.evaluate('MGAutoFarmV13.automation.getConfig()')
  self.assertCountEqual(saved['pauseWeather'],['Rain','Thunderstorm'])
  self.assertCountEqual(saved['wantedMutations'],['Rainbow','Gold'])
  self.assertIn('LegacySpecies',saved['keepSpecies'])
 def test_weather_team_selector_and_keyboard_navigation(self):
  self.tab('automation')
  self.page.locator('summary').filter(has_text='Wetterabhängige Petteams').click()
  self.page.get_by_label('Wetter',exact=True).select_option('Frost')
  self.page.get_by_label('Gespeichertes Team',exact=True).select_option('team1')
  self.page.get_by_role('button',name='Teamregel speichern',exact=True).click()
  self.assertEqual(self.page.evaluate('MGAutoFarmV13.automation.getConfig().teamRules'),[{'weather':'Frost','teamId':'team1'}])
  self.page.locator('#mg15-tab-automation').focus();self.page.keyboard.press('ArrowRight')
  self.assertEqual(self.page.locator('#mg15-tab-settings').get_attribute('aria-selected'),'true')
  self.assertEqual(self.page.evaluate('window.__sent.length'),0)
 def test_move_collapse_small_viewport_and_field_paint(self):
  self.tab('fields')
  field=self.page.locator('[data-side="left"][data-index="0"]')
  dest=self.page.locator('[data-side="left"][data-index="3"]')
  a=field.bounding_box();b=dest.bounding_box()
  self.page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);self.page.mouse.down()
  self.page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=15);self.page.mouse.up()
  self.assertEqual(self.page.evaluate('MGAutoFarmV13.selectedSlots().size'),0)
  before=self.header_rect();x=before['x']+90;y=before['y']+20
  self.page.mouse.move(x,y);self.page.mouse.down();self.page.mouse.move(x-300,y+50,steps=8);self.page.mouse.up()
  saved=json.loads(self.page.evaluate("localStorage.getItem('magic_garden_v13_panel_position')"))
  self.assertLess(saved['left'],before['x']-200)
  self.page.get_by_role('button',name='Menü einklappen').click()
  self.assertFalse(self.page.locator('#mg15-body').is_visible());self.assertLess(self.page.locator('#mg-autofarm-v13').bounding_box()['height'],70)
  self.page.get_by_role('button',name='Menü ausklappen').click()
  self.reload_page();self.page.locator('#mg15-header').wait_for();self.assertAlmostEqual(self.header_rect()['x'],saved['left'],delta=2)
  self.page.set_viewport_size({'width':320,'height':560});self.page.wait_for_timeout(150)
  rect=self.page.locator('#mg-autofarm-v13').bounding_box()
  self.assertLessEqual(rect['x']+rect['width'],320)
  self.assertLessEqual(self.page.locator('#mg15-scroll').evaluate('(e)=>e.scrollWidth-e.clientWidth'),1)
  self.assertLess(self.header_rect()['y']+self.header_rect()['height'],560)
  self.page.locator('#mg-autofarm-v13').screenshot(path=str(OUT/'ui-narrow.png'))
 def test_existing_update_and_start_stop_still_work(self):
  self.tab('settings');self.remote=SOURCE.replace('// @version      '+VERSION,'// @version      15.1.1');self.page.evaluate('(s)=>window.__testRelease=s',self.remote)
  self.page.get_by_role('button',name='Update prüfen',exact=True).click()
  self.page.get_by_role('link',name='Installieren',exact=True).wait_for()
  self.assertTrue(self.page.get_by_role('link',name='Installieren',exact=True).get_attribute('href').endswith('/main/MagicGardenAutoFarm.user.js'))
  self.tab('farm');self.page.get_by_role('button',name='▶ Start',exact=True).click()
  self.page.wait_for_function('MGAutoFarmV13.state.running')
  self.assertEqual(self.page.locator('.mg-head-state').inner_text(),'Aktiv')
  self.page.get_by_role('button',name='■ Stop',exact=True).click()
  self.assertFalse(self.page.evaluate('MGAutoFarmV13.state.running'))
  self.assertEqual(self.page.evaluate('window.__sent.length'),0)
 def test_choice_loading_limit_escape_and_focus_survive_refresh(self):
  self.page.add_script_tag(content=WIDGETS)
  self.page.evaluate("""() => {
    window.values=['OldID'];window.available=[];window.saves=0;
    window.widget=createChoiceMenu(document,{label:'Testauswahl',placeholder:'Wählen',read:()=>values,onChange:v=>{values=v;saves++},choices:()=>available});
    widget.root.id='test-choice';document.body.append(widget.root);
  }""")
  widget=self.page.locator('#test-choice');widget.locator('summary').click()
  self.assertTrue(widget.get_by_role('checkbox').is_checked())
  self.page.evaluate("available=Array.from({length:45},(_,i)=>({id:'ID'+i,name:'Choice '+i}));widget.refresh()")
  self.assertTrue(widget.get_by_role('checkbox',name='Old ID',exact=True).is_checked())
  self.page.evaluate("values=available.slice(0,40).map(x=>x.id);widget.refresh()")
  self.assertTrue(widget.get_by_role('checkbox',name='Choice 44',exact=True).is_disabled())
  search=widget.get_by_role('searchbox');search.fill('Choice 39');search.focus()
  self.page.evaluate('widget.refresh()')
  self.assertEqual(search.input_value(),'Choice 39');self.assertEqual(self.page.evaluate('saves'),0)
  self.page.keyboard.press('Escape');self.assertFalse(widget.evaluate('(e)=>e.open'))
  widget.locator('summary').click();widget.get_by_role('button',name='Testauswahl: Auswahl leeren').click()
  self.assertEqual(self.page.evaluate('values'),[])

if __name__=='__main__':unittest.main(verbosity=2)
