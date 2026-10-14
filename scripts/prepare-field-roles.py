from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
# One-time, pinned-base migration. Removed before merging the release.
for path, sha in {'src/automation-core.js':'80083358624cccaec662f42c9540519269f0dec9','scripts/build.cjs':'ea8a99a4e0db0553281aa31efcbc83d65eeca5ab'}.items():
    assert subprocess.check_output(['git','hash-object',str(root/path)],text=True).strip()==sha, path+' changed since baseline'
f=root/'scripts/build.cjs';s=f.read_text().replace('15.1.0','15.2.0')
s=s.replace("src = require('./compact-menu.cjs')(src, stripExports('compact-menu.js'));", "src = require('./compact-menu.cjs')(src, stripExports('compact-menu.js'));\nsrc = require('./field-plan.cjs')(src, stripExports('field-plan.js'));")
s=s.replace('compact icon menu with anchored header and scrollable sections; existing automation retained','colored plant/egg field roles and catalog menus without manual IDs')
s=s.replace("stripExports('automation-ui.js')", "stripExports('choice-controls.js')+'\\n'+stripExports('automation-ui.js')")
s=s.replace('// @description  V15.1:','// @description  V15.2:');f.write_text(s)
f=root/'src/automation-core.js';s=f.read_text()
s=s.replace("eggId:'',eggPlots:2,", "eggId:'',").replace('const ranges={eggPlots:[0,20],','const ranges={')
s=s.replace('  function itemKey(i)', '''  function plots(s, mode) {
    if (!Array.isArray(s.fieldModes) || s.fieldModes.length !== 200) return [];
    return s.fieldModes.flatMap((m, id) => m === mode ? [id] : []);
  }
  function itemKey(i)''')
s=s.replace('for(const tile of s.selected){const p=s.garden[tile];',"for(const tile of plots(s,'plant')){const p=s.garden[tile];")
s=s.replace('for(const tile of s.selected){const e=s.garden[tile];',"for(const tile of plots(s,'egg')){const e=s.garden[tile];")
s=s.replace("  function reservedEggPlots(s){return config.eggs&&config.eggPlots>0?s.selected.slice(-config.eggPlots):[];}\n",'')
s=s.replace('const reserved=reservedEggPlots(s),tile=s.selected.find(t=>s.garden[t]==null&&!reserved.includes(t));',"const tile=plots(s,'plant').find(t=>s.garden[t]==null);")
s=s.replace('reservedEggPlots(s).find(t=>s.garden[t]==null)',"plots(s,'egg').find(t=>s.garden[t]==null)")
assert 'eggPlots' not in s and 's.selected' not in s
anchor='  return {configure,getConfig:()=>structuredClone(config),'
assert s.count(anchor)==1
insert='''  // Human-readable menus retain native IDs internally. Missing catalogs never
  // become free-text inputs or guessed purchase commands.
  function menuChoices() {
    const s = snapshot();
    const human = value => String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g,' ').trim();
    const shopNames = {seed:'Saatgutladen',egg:'Eierladen',tool:'Werkzeugladen',decor:'Dekoladen',rain:'Regen-Shop',dawn:'Morgenrot-Shop',amber:'Bernsteinmond-Shop',snow:'Frost-Shop',thunder:'Gewitter-Shop',apology:'Entschädigungs-Shop'};
    const weatherNames = {Normal:'Kein Spezialwetter',Rain:'Regen',Frost:'Frost',Thunderstorm:'Gewitter',Dawn:'Morgenrot',AmberMoon:'Bernsteinmond'};
    const catalogList = (type, source) => Object.entries(source || {}).map(([id, record]) => {
      const c = type === 'Seed' ? record.seed : record;
      const shops = arr(c?.eligibleShops).filter(x=>Object.hasOwn(shopNames,x));
      return {id, name: record.name || c?.name || human(id), price:num(c?.coinPrice)?c.coinPrice:null,
        shops, owned:s?total(s,type,id,true):null,
        stock: shops.map(shopId=>{
          const sh=s?.game.shops?.[shopId], row=arr(sh?.inventory).find(i=>i?.itemType===type&&kindId(i)===id);
          const purchased=s?.own.shopPurchases?.[shopId];
          const used=purchased?.restockId===sh?.restockId ? purchased?.purchases?.[id]||0 : 0;
          return {shop:shopId,available:sh&&num(sh.deadlineMs)&&sh.deadlineMs>s.serverNow&&num(row?.initialStock)&&num(used)?Math.max(0,row.initialStock-used):0};
        })};
    }).sort((a,b)=>a.name.localeCompare(b.name,'de'));
    const weatherIds = [...new Set([...Object.keys(weatherNames),...(s?[weather(s)]:[]),...arr(s?.game.weatherForecast).map(w=>w?.weatherId).filter(str)])];
    return {
      seeds:catalogList('Seed',catalogs.plants), eggs:catalogList('Egg',catalogs.eggs),
      tools:catalogList('Tool',catalogs.tools), decor:catalogList('Decor',catalogs.decor),
      mutations:Object.entries(catalogs.mutations||{}).map(([id,m])=>({id,name:m.name||human(id)})).sort((a,b)=>a.name.localeCompare(b.name,'de')),
      weather:weatherIds.map(id=>({id,name:weatherNames[id]||human(id)})),
      shops:Object.entries(shopNames).map(([id,name])=>({id,name})),
      pets:arr(s?.own.petTeams).filter(t=>str(t?.id)).map(t=>({id:t.id,name:t.name||'Unbenanntes Team'})),
      fields:s?{plant:plots(s,'plant').length,egg:plots(s,'egg').length}:null
    };
  }
'''
s=s.replace(anchor,insert+anchor.replace('return {configure,','return {menuChoices,configure,'));f.write_text(s)
f=root/'tests/main-upgrade.test.cjs';s=f.read_text().replace('15.1.1','15.2.1').replace('15.1.0','15.2.0');f.write_text(s)
f=root/'tests/automation.test.cjs';s=f.read_text()
s=s.replace("selected:[0,1,2,3],heldId", "selected:[0,1,2,3],fieldModes:Array.from({length:200},(_,i)=>i<4?'plant':'none'),heldId")
s=s.replace("h.s.selected=[];", "h.s.selected=[];h.s.fieldModes.fill('none');")
s=s.replace("test('selected egg reserve is not overwritten by auto plant'", "test('explicit blue egg plots are not overwritten by auto plant'")
s=s.replace("eggs:true,eggId:'CommonEgg',eggPlots:2});h.s.garden", "eggs:true,eggId:'CommonEgg'});h.s.fieldModes[2]='egg';h.s.fieldModes[3]='egg';h.s.garden")
s=s.replace("test('zero reserved egg fields means no egg placement'", "test('no blue plots means no egg placement'")
s=s.replace("eggs:true,eggId:'CommonEgg',eggPlots:0}", "eggs:true,eggId:'CommonEgg'}")
s=s.replace("h.enable({hatch:true});h.s.garden", "h.enable({hatch:true});h.s.fieldModes[0]='egg';h.s.fieldModes[1]='egg';h.s.garden")
s=s.replace("assert.equal(c.eggPlots,20)", "assert.equal('eggPlots' in c,false)");f.write_text(s)
# Reject divergence from the locally tested implementation.
for path,sha in {'src/automation-core.js':'5a2065cf07f83237e1de8a8b64aa62cc0ada39ab','scripts/build.cjs':'763ab162a8456f3003e8b2f9e2e32f12024ab23d','src/automation-ui.js':'54a3ea44dd5130e7802f83543f7c680bc009bbf5','src/choice-controls.js':'0608f53c167b0829d26022e61573609faf8bfa08','src/field-plan.js':'9804daafa19b9a19f00f00537a2c34c4e687e2e0','scripts/field-plan.cjs':'34bd1ef1b403e8fefde655a85100a701198e2186','tests/main-upgrade.test.cjs':'5869286636d5c50063ce0a45282e7385c41083bc','tests/automation.test.cjs':'522992bf03d87f1be67dc79aa42ff138613dcf78'}.items():
    actual=subprocess.check_output(['git','hash-object',str(root/path)],text=True).strip()
    assert actual==sha, (path,actual,sha)
