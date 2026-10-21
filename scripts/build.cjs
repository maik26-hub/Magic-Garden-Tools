'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
let src=fs.readFileSync(path.join(root,'src/core-v14.user.js'),'utf8');
function replace(a,b,name){const parts=src.split(a);if(parts.length!==2)throw Error(`${name}: expected one anchor, got ${parts.length-1}`);src=parts[0]+b+parts[1];}
function stripExports(file){return fs.readFileSync(path.join(root,'src',file),'utf8').replace(/^if \(typeof module[^\n]*$/m,'');}
replace('// @version      14.0.3','// @version      16.3.1','metadata version');
replace('const VERSION = "14.0.3"','const VERSION = "16.3.1"','runtime version');
replace('// @description  V14.0.3: standalone auto-farm, direct V13 update, AFK watchdog and safe reconnect/reload recovery','// @description  V16.3.1: Jotai room state compatibility for build 1684+','description');
replace('  "use strict";', '  "use strict";\n\n'+stripExports('catalog-source.js')+'\n'+stripExports('pet-advisor.js')+'\n'+stripExports('pet-automation.js')+'\n'+stripExports('effect-teams.js')+'\n'+stripExports('team-registry.js')+'\n'+stripExports('team-actions.js')+'\n'+stripExports('v16-controller.js')+'\n'+stripExports('automation-core.js')+'\n'+stripExports('choice-controls.js')+'\n'+stripExports('automation-ui.js')+'\n  let automation = null;\n  let automationUI = null;','inline modules');
replace('    sequence: -1, frontier: -1, lastSnapshotAt: 0, observedSockets: 0',`    sequence: -1, frontier: -1, lastSnapshotAt: 0, observedSockets: 0,
    own: null, game: null, actor: null, heldId: '', generation: 0,
    welcomed: false, cancelPending: null, serverOffset: 0`,'bridge fields');
replace('  function readFrontier() {',`  const seenSockets = new WeakSet();
  function serverNow() { return Date.now() + bridge.serverOffset; }
  function readFrontier() {
    if (!bridge.welcomed || window.MagicCircle_RoomConnection?.currentWebSocket !== bridge.socket) return bridge.frontier;`,'frontier isolation');
replace('    bridge.garden = own?.data?.garden?.tileObjects || null;',`    bridge.own = own?.data || null;
    bridge.game = full.child?.data || null;
    bridge.actor = own ? id : null;
    bridge.heldId = typeof own?.heldItem === 'string' ? own.heldItem :
      own?.heldItem?.id || own?.heldItem?.toolId || own?.heldItem?.species || '';
    bridge.garden = own?.data?.garden?.tileObjects || null;`,'own native data');
replace(`    if (!ws || ws === bridge.socket) return;
    if (!String(ws.url || "").includes("/api/rooms/")) return;
    bridge.socket = ws;`,
`    if (!ws || ws === bridge.socket || seenSockets.has(ws)) return;
    if (!String(ws.url || "").includes("/api/rooms/")) return;
    seenSockets.add(ws);
    if (bridge.cancelPending) bridge.cancelPending();
    bridge.socket = ws;
    bridge.generation++;
    bridge.own = null; bridge.game = null; bridge.actor = null;
    bridge.welcomed = false;
    bridge.serverOffset = 0;`,'socket generation');
replace(`      if (bridge.socket !== ws) return;
      bridge.garden = null;`,
`      if (bridge.socket !== ws) return;
      if (bridge.cancelPending) bridge.cancelPending();
      bridge.welcomed = false;
      bridge.own = null; bridge.game = null; bridge.actor = null;
      bridge.garden = null;`,'close pending');
replace(`    ws.addEventListener("message", event => {
      const data = event.data;`,
`    ws.addEventListener("message", event => {
      if (bridge.socket !== ws) return;
      const data = event.data;`,'old message isolation');
replace(`      if (typeof data !== "string") return;
      if (data.includes('"selfPlayerId"')`,
`      if (typeof data !== "string") return;
      const timeMatch = data.match(/"publishedAtServerMs"\\s*:\\s*(\\d{12,16})/);
      if (timeMatch) {
        const offset = Number(timeMatch[1]) - Date.now();
        if (Number.isFinite(offset) && Math.abs(offset) < 86400000) bridge.serverOffset = offset;
      }
      if (data.includes('"selfPlayerId"')`,'server clock');
replace('            bridge.playerId = msg.selfPlayerId;', '            bridge.playerId = msg.selfPlayerId;\n            bridge.welcomed = true;','welcome');
replace(`    ws.send = function(payload) {
      if (typeof payload`,
`    ws.send = function(payload) {
      if (bridge.socket !== ws) return nativeSend.call(this, payload);
      if (typeof payload`,'old sender isolation');
// Room subscription is implemented directly in the source for Jotai builds.
replace('if (!Number.isFinite(crop?.endTime) || crop.endTime > now) continue;','if (!Number.isFinite(crop?.endTime) || crop.endTime > serverNow()) continue;','ripe server clock');
replace('        return { tile, slotsIndex: crop.slotId, key };','        if (automation && !automation.harvestAllowed(plant, crop)) continue;\n        return { tile, slotsIndex: crop.slotId, key };','smart harvest');
replace('      if (!ws) return reject(new Error("WebSocket nicht verbunden"));',`      if (!ws) return reject(new Error("WebSocket nicht verbunden"));
      if (bridge.cancelPending) return reject(new Error("Eine Spielaktion wartet bereits auf Antwort"));
      const generation = bridge.generation;`,'single sender');
replace('      let timeout;\n\n      function finish',`      let timeout;
      const cancel = () => {
        const err = new Error('WebSocket ersetzt oder getrennt; Ausgang der Aktion unbekannt');
        err.code = 'connection_changed'; err.commandType = command.type;
        finish(err);
      };
      bridge.cancelPending = cancel;

      function finish`,'cancel');
replace('        ws.removeEventListener("message", onMessage);',`        ws.removeEventListener("message", onMessage);
        if (bridge.cancelPending === cancel) bridge.cancelPending = null;`,'pending cleanup');
replace(`      function onMessage(event) {
        if (typeof event.data`,
`      function onMessage(event) {
        if (bridge.socket !== ws || bridge.generation !== generation) return cancel();
        if (typeof event.data`,'command generation');
replace('// Nur zwei zuvor im realen Spiel geprüfte Befehle werden verwendet.','// Nur explizit implementierte native Spielbefehle; keine Dev-/Credits-/Trade-Aktionen.','comment');
replace(`          if (Date.now() - lastSellCheck >= prefs.sellIntervalMs) {`,
`          if (automation && await automation.step()) {
            await waitTick(250);
            continue;
          }
          if (Date.now() - lastSellCheck >= prefs.sellIntervalMs) {`,'serial planner');
replace('            if (getProduce().length >= prefs.sellThreshold) {','            if (getProduce().length >= prefs.sellThreshold && (!automation || automation.saleAllowed())) {','sale guard');
replace('    state.sessionEpoch++;\n    resetTimer();','    state.sessionEpoch++;\n    automation?.resetCounters();\n    resetTimer();','stats reset');
replace('  function stop() {\n    state.running = false;','  function stop() {\n    state.running = false;\n    automation?.stop();','stop');
replace('    if (!panel) return;\n    const status = panel.querySelector','    if (!panel) return;\n    automationUI?.refresh();\n    const status = panel.querySelector','UI refresh');
src=src.replaceAll('🌱 Standalone BETA · Aktiv','🌱 AutoFarm V15 · Aktiv').replaceAll('🌱 Magic Garden Standalone BETA','🌱 Magic Garden V15');
replace('    body.appendChild(toggles);','    body.appendChild(toggles);\n    automationUI = mountAutomationUI(body, automation, document);','panel mount');
replace('  // ===== Konsole =====',`  // ===== Own-game catalogs: observe early, recover from bootstrap imports =====
  const nativeCatalogSource = createNativeCatalogSource({
    document, performance,
    PerformanceObserver: typeof PerformanceObserver === 'function' ? PerformanceObserver : null,
    pageURL: () => location.href,
    release: () => document.querySelector?.('meta[name="magiccircle-release"]')?.content ||
      window.MagicCircle_RoomConnection?.currentWebSocket?.url?.match(/\\/version\\/(\\d+)\\//)?.[1] || '',
    fetch: (...args) => fetch(...args),
    importModule: url => import(url)
  });
  async function loadNativeAutomationCatalogs() { return nativeCatalogSource.load(); }
  automation = createAutomationCore({
    storage: localStorage,
    now: () => Date.now(),
    running: () => state.running && !state.reloadRequested,
    protected: isMarkedProtected,
    send: sendCommand,
    snapshot: () => {
      if (!getSocket() || !bridge.garden || !bridge.own || !bridge.game || !bridge.actor) return null;
      return {actor:bridge.actor,own:bridge.own,game:bridge.game,garden:bridge.garden,
        inventory:bridge.inventory,generation:bridge.generation,serverNow:serverNow(),
        heldId:bridge.heldId,selected:[...selectedSlots()].sort((a,b)=>a-b)};
    },
    loadCatalogs: loadNativeAutomationCatalogs,
    catalogDiagnostics: () => nativeCatalogSource.diagnostics(),
    onCatalogsChanged: () => automationUI?.refresh(),
    ariesService: () => {
      const svc=window.QWS_PetsService;
      return svc&&typeof svc.getTeams==='function'?svc:null;
    },
    updateAriesTeam: async plan => {
      const svc=window.QWS_PetsService;
      if(!svc||!svc.isTeamSyncEnabled?.()||typeof svc.saveTeam!=='function'||
        typeof svc.getTeams!=='function')return {ok:false};
      const before=svc.getTeams().find(t=>t.id===plan.id);
      if(!before||!before.serverId||
        JSON.stringify(before.slots?.slice(0,3))!==JSON.stringify(plan.before.slice(0,3)))return {ok:false};
      const updated=svc.saveTeam({id:plan.id,slots:plan.slots});
      const after=svc.getTeams().find(t=>t.id===plan.id);
      return {ok:!!updated&&!!after&&
        JSON.stringify(after.slots?.slice(0,3))===JSON.stringify(plan.slots)};
    },
    withPurchaseLock: (actor, fn) => typeof navigator.locks?.request === 'function'
      ? navigator.locks.request('magic-garden-autofarm-purchases',{ifAvailable:true}, lock => lock ? fn() : false)
      : Promise.resolve(false)
  });
  setTimeout(() => { void automation.loadCatalogs(); }, 2500);

  // ===== Konsole =====`,'init engine');
replace('    state, cfg, prefs, start, stop, resetTimer, resetSession, selectedSlots, getDiagnostics, checkForUpdate, setNumberPreference,','    state, cfg, prefs, start, stop, resetTimer, resetSession, selectedSlots, getDiagnostics, checkForUpdate, setNumberPreference, automation,','public API');
replace('      runtimeSeconds: Math.floor(runtimeMs() / 1000)','      runtimeSeconds: Math.floor(runtimeMs() / 1000),\n      automation: automation?.status() || null','diag');
replace('console.log("✅ Magic Garden AutoFarm V14.0.3 geladen (keine QPM-/Companion-Abhaengigkeit).");','console.log("✅ Magic Garden AutoFarm V16.3.1 geladen (Automationszentrale, ohne Fremdskripte).");','boot');
src = require('./compact-menu.cjs')(src, stripExports('compact-menu.js'));
src = require('./field-plan.cjs')(src, stripExports('field-plan.js'));
src = require('./header-updater.cjs')(src, stripExports('update-fetch.js'));
src = require('./v16.cjs')(src, stripExports('info-tooltips.js')); 
new vm.Script(src,{filename:'MagicGardenAutoFarm.user.js'});
fs.writeFileSync(path.join(root,'MagicGardenAutoFarm.user.js'),src);
console.log('Built V16.3.1:,Buffer.byteLength(src),'bytes');
