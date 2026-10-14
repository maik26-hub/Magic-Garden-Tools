from pathlib import Path
root=Path(__file__).resolve().parents[1]
def one(s,a,b,label):
 if s.count(a)!=1:raise ValueError((label,s.count(a)))
 return s.replace(a,b)
p=root/'src/automation-core.js';s=p.read_text()
s=one(s,"dailyBudget:0,coinReserve:100000,","","config caps")
s=one(s,"dailyBudget:[0,1e12],coinReserve:[0,1e12],","","normalize caps")
s=one(s,"loading=false,nextCatalogAt=0,lastActionAt", "loading=false,nextCatalogAt=0,catalogFailures=0,lastActionAt",'failure state')
a=s.index('  function extractCatalogs(exports)');b=s.index('  function produceValue(',a)
s=s[:a]+'''  function extractCatalogs(exports) {
    const identify = typeof identifyNativeCatalogs === 'function'
      ? identifyNativeCatalogs : require('./catalog-source.js').identifyNativeCatalogs;
    return identify(exports);
  }
  async function loadCatalogs(force = false) {
    if (loading || (!force && now() < nextCatalogAt)) return;
    loading = true;
    catalogMessage = Object.keys(catalogs).length ? 'Spielkataloge werden ergänzt …' : 'Spielkataloge werden geladen …';
    try {
      const exports = await env.loadCatalogs();
      const found = extractCatalogs(exports);
      catalogs = {...catalogs, ...found};
      const keys = Object.keys(catalogs);
      const names = {plants:'Pflanzen',eggs:'Eier',pets:'Pets',tools:'Werkzeuge',decor:'Dekoration',mutations:'Mutationen'};
      const all = keys.length >= 6;
      catalogMessage = keys.length ? 'Geladen: ' + keys.map(k=>names[k]||k).join(', ') : 'Suche aktuelle Spielkataloge – automatischer Neuversuch';
      catalogFailures = all ? 0 : Math.min(catalogFailures + 1, 3);
      nextCatalogAt = now() + (all ? 300000 : [2000,2000,5000,10000][catalogFailures]);
    } catch {
      catalogFailures = Math.min(catalogFailures + 1, 3);
      catalogMessage = 'Spielkatalog noch nicht erreichbar – automatischer Neuversuch';
      nextCatalogAt = now() + [2000,2000,5000,10000][catalogFailures];
    } finally {
      loading = false;
      try { env.onCatalogsChanged?.(); } catch { /* UI must not break catalog recovery */ }
    }
  }
''' + s[b:]
s=one(s,"if(!catalogs.plants?.[species]){reasons.plant='Pflanzenkatalog / Saatgut unbekannt';return null;}","",'plant own fallback')
s=one(s,"if(!id||!catalogs.eggs?.[id]){reasons.eggs='Ei auswählen / Eierkatalog fehlt';return null;}","if(!id){reasons.eggs='Ei auswählen';return null;}",'egg own fallback')
s=one(s,"if(!config.dailyBudget||!config.buyRules.length){reasons.buy='Auswahlliste und Tagesbudget festlegen';return null;}","if(!config.buyRules.length){reasons.buy='Artikel auswählen und Kaufregel speichern';return null;}",'buy rules')
s=one(s,"budget.data.spent+price>config.dailyBudget||s.own.coinsCount-price<config.coinReserve", "s.own.coinsCount<price",'buy caps')
s=one(s,"reasons.buy='Budget / Coin-Reserve erreicht'", "reasons.buy='Nicht genug Coins für diesen Artikel'",'reason')
s=one(s,"b.data.spent+p.price>config.dailyBudget||fresh.own.coinsCount-p.price<config.coinReserve", "fresh.own.coinsCount<p.price",'final caps')
s=s.replace('Budgetdaten beschädigt – Käufe gesperrt','Kaufstatus beschädigt – Käufe pausiert').replace('Budget nicht speicherbar – Kauf gesperrt','Kaufstatus nicht speicherbar – Kauf pausiert')
s=one(s,"budget:config.dailyBudget,","catalogSource:env.catalogDiagnostics?.()||null,",'status remove budget')
a=s.index('    const catalogList = (type, source)');b=s.index('    const weatherIds',a)
s=s[:a]+'''    const catalogList = (type, source) => {
      // Owned seeds/eggs can be used without a price catalog. Keep their real
      // native identifiers, not invented defaults. Shop-only entries can be
      // shown now, but purchases still require a verified native coin price.
      const entries = new Map(Object.entries(source || {}));
      const inventory = s ? [...s.inventory.items, ...arr(s.inventory.storages).flatMap(st=>arr(st.items))] : [];
      const shopItems = s ? Object.values(s.game.shops||{}).flatMap(sh=>arr(sh?.inventory)) : [];
      for (const item of [...inventory,...shopItems]) {
        const id=kindId(item||{});
        if(item?.itemType===type && str(id) && !entries.has(id)) entries.set(id,null);
      }
      return [...entries].map(([id, record]) => {
        const c = type === 'Seed' ? record?.seed : record;
        const knownShops = arr(c?.eligibleShops).filter(x=>Object.hasOwn(shopNames,x));
        const observedShops = s ? Object.entries(s.game.shops||{}).filter(([key,sh])=>Object.hasOwn(shopNames,key)&&arr(sh?.inventory).some(i=>i?.itemType===type&&kindId(i)===id)).map(([key])=>key) : [];
        const shops = c ? knownShops : observedShops;
        return {id, name: record?.name || c?.name || human(id), price:num(c?.coinPrice)?c.coinPrice:null,
          catalogReady:!!c, shops, owned:s?total(s,type,id,true):null,
          stock: shops.map(shopId=>{
            const sh=s?.game.shops?.[shopId], row=arr(sh?.inventory).find(i=>i?.itemType===type&&kindId(i)===id);
            const purchased=s?.own.shopPurchases?.[shopId];
            const used=purchased?.restockId===sh?.restockId ? purchased?.purchases?.[id]||0 : 0;
            return {shop:shopId,available:sh&&num(sh.deadlineMs)&&sh.deadlineMs>s.serverNow&&num(row?.initialStock)&&num(used)?Math.max(0,row.initialStock-used):0};
          })};
      }).sort((a,b)=>a.name.localeCompare(b.name,'de'));
    };
''' +s[b:]
p.write_text(s)
p=root/'src/automation-ui.js';s=p.read_text()
s=s.replace('Käufe benötigen Auswahlliste, Preislimit, Tagesbudget und Coin-Reserve.', 'Käufe benötigen nur deine Kaufregeln und genügend Coins.')
s=one(s,"const shop=section('Shops: Coin-Käufe mit Budget');check('Auto-Buy freigeben','buy',shop);number('Tagesbudget (0 = keine Käufe)','dailyBudget',0,1e12,shop);number('Coin-Mindestreserve','coinReserve',0,1e12,shop);", "const shop=section('Shops: ausgewählte Artikel kaufen');check('Auto-Buy freigeben','buy',shop);",'UI remove cap controls')
s=one(s,"explain('Nur Coins, nie Credits. Budget 0 = keine Käufe. F5 und Session-Reset setzen das Tagesbudget nicht zurück.',shop);", "explain('Kauft deine ausgewählten Artikel, solange genügend Coins da sind. Kein Tagesbudget und keine Mindestreserve. Preislimit, Zielbestand und Restock-Menge bleiben aktiv; Credits werden nie ausgegeben.',shop);",'UI help')
s=one(s,"r.price.toLocaleString('de-DE')+' Coins':' · nicht mit Coins kaufbar'", "r.price.toLocaleString('de-DE')+' Coins':r.catalogReady?' · nicht mit Coins kaufbar':' · Preis lädt …'",'price loading label')
s=one(s,"unavailable:!Number.isFinite(r.price)||!r.shops.length", "unavailable:!!r.catalogReady&&(!Number.isFinite(r.price)||!r.shops.length)",'unknown selectable')
s=one(s,"const itemInfo=explain('Warte auf Spielkatalog …',shop);", "const itemInfo=explain('Artikel werden aus Spiel und Inventar geladen …',shop);\n  button('Spieldaten neu laden',()=>{ void engine.loadCatalogs(true); },shop);",'manual retry')
s=s.replace("'Warte auf Spielkatalog. Du musst keine Kennung eingeben.'", "'Spielkataloge werden automatisch gesucht. Vorhandene Eier und Samen findest du bereits unter Pflanzen.'")
s=one(s,"'\\nReservierte Ausgaben heute: '+info.spentToday.toLocaleString('de-DE')+' / '+info.budget.toLocaleString('de-DE')", "'\\nKäufe heute: '+info.spentToday.toLocaleString('de-DE')+' Coins'",'UI spent')
p.write_text(s)
p=root/'scripts/build.cjs';s=p.read_text()
s=s.replace('15.2.0','15.2.1')
s=s.replace("// @description  V15.2: colored plant/egg field roles and catalog menus without manual IDs", "// @description  V15.2.1: reliable live catalog discovery and Auto-Buy without daily budget or coin reserve")
s=one(s,"stripExports('automation-core.js')", "stripExports('catalog-source.js')+'\\n'+stripExports('automation-core.js')",'inline loader')
a=s.index('  // ===== Native Kataloge:');b=s.index('  automation = createAutomationCore({',a)
s=s[:a]+'''  // ===== Own-game catalogs: observe early, recover from bootstrap imports =====
  const nativeCatalogSource = createNativeCatalogSource({
    document, performance,
    PerformanceObserver: typeof PerformanceObserver === 'function' ? PerformanceObserver : null,
    pageURL: () => location.href,
    release: () => document.querySelector?.('meta[name="magiccircle-release"]')?.content ||
      window.MagicCircle_RoomConnection?.currentWebSocket?.url?.match(/\\\\/version\\\\/(\\\\d+)\\\\//)?.[1] || '',
    fetch: (...args) => fetch(...args),
    importModule: url => import(url)
  });
  async function loadNativeAutomationCatalogs() { return nativeCatalogSource.load(); }
''' +s[b:]
s=one(s,'    loadCatalogs: loadNativeAutomationCatalogs,','    loadCatalogs: loadNativeAutomationCatalogs,\n    catalogDiagnostics: () => nativeCatalogSource.diagnostics(),\n    onCatalogsChanged: () => automationUI?.refresh(),','env diagnostics')
p.write_text(s)
# Assertions whose behavior changes by the explicit user request, not by hiding
# test failures: old spending limits no longer gate buys; actual wallet still does.
p=root/'tests/main-upgrade.test.cjs';s=p.read_text().replace('15.2.1','__NEWER__').replace('15.2.0','15.2.1').replace('__NEWER__','15.2.2');p.write_text(s)
p=root/'tests/automation.test.cjs';s=p.read_text()
s=s.replace('assert.equal(h.e.getConfig().dailyBudget,0);','assert.equal("dailyBudget" in h.e.getConfig(),false);assert.equal("coinReserve" in h.e.getConfig(),false);')
s=s.replace("test('no planting without actual seeds or verified catalog',async()=>{const h=await harness({noCatalogs:true});h.enable({plant:true,seedSpecies:'Carrot'});h.s.inventory.items=[stack('Seed','Carrot')];assert.equal(await h.e.step(),false);assert.equal(h.commands.length,0);});", "test('owned seeds can be planted before catalog but missing seeds are never invented',async()=>{const h=await harness({noCatalogs:true});h.enable({plant:true,seedSpecies:'Carrot'});assert.equal(await h.e.step(),false);h.s.inventory.items=[stack('Seed','Carrot')];assert.equal(await h.e.step(),true);assert.equal(h.commands[0].type,'PlantSeed');});")
a=s.index("test('purchase rejects absent budget");b=s.index("\ntest(",a)
s=s[:a]+"""test('purchase ignores removed legacy limits but respects wallet and item max price',async()=>{for(const legacy of [{dailyBudget:0},{dailyBudget:9},{dailyBudget:50,coinReserve:999999}]){const h=await harness();h.enable({buy:true,buyRules:[shop(h.s,'Seed','Carrot',10)],...legacy});await h.e.step();assert.equal(h.commands.length,1);assert.ok(!('dailyBudget' in h.e.getConfig()));}for(const mode of ['wallet','price']){const h=await harness();if(mode==='wallet')h.s.own.coinsCount=9;h.enable({buy:true,buyRules:[shop(h.s,'Seed','Carrot',mode==='price'?9:10)]});await h.e.step();assert.equal(h.commands.length,0,mode);}});"""+s[b:]
s=s.replace("confirmed purchase state enables subsequent stock-limited buy but preserves daily cap", "confirmed purchase state enables buys without a day cap until per-restock limit")
s=s.replace('assert.equal(h.commands.length,2);assert.equal(h.e.status().spentToday,20);','assert.equal(h.commands.length,3);assert.equal(h.e.status().spentToday,30);h.advance(6000);await h.e.step();assert.equal(h.commands.length,3);')
s=s.replace('assert.equal(c.dailyBudget,0);','assert.equal("dailyBudget" in c,false);assert.equal("coinReserve" in c,false);')
s=s.replace("purchase requires price, live stock, chosen rule, budget and reserve", "purchase requires price, live stock and chosen rule, not old reserve")
s=s.replace("two tabs share pessimistic budget reservations", "two tabs share pending purchase reservations")
s=s.replace("unconfirmed purchase holds the next buy and daily budget over F5", "unconfirmed purchase holds the next buy and purchase history over F5")
p.write_text(s)
p=root/'tests/reservations.test.cjs';s=p.read_text().replace("assert.equal(h.sent.length,2);assert.equal(h.e.status().spentToday,20)","assert.equal(h.sent.length,3);assert.equal(h.e.status().spentToday,30)")
s=s.replace("changing room/player identity cannot reset the shared daily budget", "changing room/player identity cannot reset explicit per-restock counts")
s=s.replace("const b=await make(st,'room-self-B');b.s.own.shopPurchases", "const b=await make(st,'room-self-B');b.e.configure({buyRules:[{...b.e.getConfig().buyRules[0],perRestock:2}]});b.s.own.shopPurchases")
p.write_text(s)
p=root/'tests/browser/field_choices.py';s=p.read_text().replace("page.evaluate('!MGAutoFarmV13.automation.getConfig().buy && MGAutoFarmV13.automation.getConfig().dailyBudget===0')",'page.evaluate("!MGAutoFarmV13.automation.getConfig().buy && !(\'dailyBudget\' in MGAutoFarmV13.automation.getConfig())")').replace('saving a shop rule neither enables buy nor changes budget','saving a shop rule leaves buy disabled and no day budget remains');p.write_text(s)
p=root/'tests/browser/compact_menu.py';s=p.read_text();s=s.replace("page.get_by_label('Tagesbudget (0 = keine Käufe)',exact=True).fill('25000')", "page.get_by_label('Auto-Buy freigeben',exact=True).check()");s=s.replace("page.get_by_label('Tagesbudget (0 = keine Käufe)',exact=True).press('Tab')", "page.get_by_label('Auto-Buy freigeben',exact=True).press('Tab')");s=s.replace("page.evaluate('MGAutoFarmV13.automation.getConfig().dailyBudget')==25000", "page.evaluate('MGAutoFarmV13.automation.getConfig().buy') is True");p.write_text(s)
