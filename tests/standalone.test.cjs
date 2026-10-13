// node --test tests/standalone.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'MagicGardenAutoFarm.standalone.user.js'), 'utf8'
);

function store() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, val) => map.set(key, String(val))
  };
}

function createHarness({ withCanvas = false, resumeOnLoad = false } = {}) {
  const localStorage = store(), sessionStorage = store(), tasks = [];
  const events = [], handlers = new Map();
  const fetchCalls = [];
  let remoteSource = source, fetchFailure = null, fetchStatus = 200;
  let now = Date.now(), reloadCount = 0;
  class FakeDate extends Date { static now() { return now; } }
  class FakeMouseEvent {
    constructor(type, fields = {}) { this.type = type; this.isTrusted = false; Object.assign(this, fields); }
  }
  const canvas = {
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    dispatchEvent(event) { events.push(event); return true; }
  };
  localStorage.setItem('magic_garden_selected_tiles_v1',
    JSON.stringify({ left: [0, 1, 2], right: [] }));
  if (resumeOnLoad) {
    sessionStorage.setItem('magic_garden_standalone_beta_should_resume', '1');
  }

  class Socket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.listeners = new Map();
      this.sent = [];
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, data) {
      for (const fn of [...(this.listeners.get(type) || [])]) fn({
        data: typeof data === 'string' ? data : JSON.stringify(data)
      });
    }
    send(payload) { this.sent.push(JSON.parse(payload)); }
  }

  const window = {
    WebSocket: Socket,
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    }
  };
  const document = {
    body: null, hidden: false, addEventListener() {},
    querySelector(selector) {
      return withCanvas && selector === 'canvas' ? canvas : null;
    }
  };
  const context = {
    window, document, localStorage, sessionStorage,
    WebSocket: Socket,
    performance: { now: () => 0 },
    crypto: { randomUUID: () => 'test-request' },
    navigator: { onLine: true },
    location: { reload() { reloadCount += 1; } },
    Date: FakeDate,
    PointerEvent: FakeMouseEvent,
    MouseEvent: FakeMouseEvent,
    AbortController,
    setTimeout: (fn, ms) => { tasks.push({ fn, ms }); return tasks.length; },
    clearTimeout() {},
    setInterval: (fn, ms) => { tasks.push({ fn, ms }); return tasks.length; },
    console: { log() {}, info() {}, warn() {}, error() {}, table() {} },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      if (fetchFailure) throw fetchFailure;
      return { ok: fetchStatus >= 200 && fetchStatus < 300,
        status: fetchStatus, text: async () => remoteSource };
    }
  };

  vm.runInNewContext(source, context, { timeout: 3000 });
  const api = window.MGAutoFarmV13;
  assert.ok(api);

  const ws = new window.WebSocket('wss://magicgarden.gg/version/1497/api/rooms/fake');
  ws.emit('message', {
    type: 'Welcome',
    selfPlayerId: 'self-player',
    executedCommandSequence: 5
  });
  let sendPatch;
  window.MagicCircle_RoomConnection = {
    currentWebSocket: ws,
    lastDistributedRoomPublication: { executedCommandSequence: 5 },
    subscribeToPatches(fn) { sendPatch = fn; }
  };
  const watch = tasks.find(t => t.ms === 300);
  assert.ok(watch, 'game-state observer installed');
  watch.fn();

  return {
    api, window, ws, sendPatch, tasks, localStorage, sessionStorage, events, context,
    fetchCalls,
    setRemoteSource(value) { remoteSource = value; },
    setFetchFailure(error) { fetchFailure = error; },
    setFetchStatus(status) { fetchStatus = status; },
    advanceTime(ms) { now += ms; },
    getReloads() { return reloadCount; },
    runWatchdog() {
      const task = tasks.find(t => t.ms === 10000);
      assert.ok(task, 'watchdog interval installed');
      task.fn();
    },
    runGameObserver() { watch.fn(); },
    realInput(type = 'pointermove') {
      for (const handler of handlers.get(type) || []) handler({ isTrusted: true });
    },
    receiveOwnState(tiles, inventory = { items: [], favoritedItemIds: [] }) {
      sendPatch([], {
        data: { players: [] },
        child: { data: { userSlots: [
          { userId: 'other', data: { garden: { tileObjects: {
            3: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] }
          } }, inventory: { items: [], favoritedItemIds: [] } } },
          { userId: 'self-player', data: {
            garden: { tileObjects: tiles },
            inventory
          } }
        ] } }
      });
    }
  };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test('standalone has no references to third-party global data sources', () => {
  for (const reference of [
    'window.__qpmGardenSnapshot__',
    'window.__gardenCompanionState',
    'window.quinoaWS',
    'window.mgBot'
  ]) assert.ok(!source.includes(reference), reference);
});

test('owned garden is selected, locked and mutated plants are not harvested', async () => {
  const h = createHarness();
  h.receiveOwnState({
    0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0, locked: true }] },
    1: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0, mutations: ['Rainbow'] }] },
    2: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] }
  });
  h.api.start();
  await flush();
  assert.equal(h.ws.sent.length, 1);
  assert.equal(h.ws.sent[0].command.type, 'HarvestCrop');
  assert.equal(h.ws.sent[0].command.slot, 2);
  assert.equal(h.ws.sent[0].commandSequence, 6);
  assert.equal(h.api.state.protectedSkips, 2);
  h.ws.emit('message', {
    type: 'QuinoaCommandResult',
    requestId: h.ws.sent[0].requestId,
    commandType: 'HarvestCrop', ok: true, itemGains: [{}]
  });
  await flush();
  assert.equal(h.api.state.harvested, 1);
  h.api.stop();
});

test('missing player identification never harvests an arbitrary garden', async () => {
  const h = createHarness();
  h.sendPatch([], { child: { data: { userSlots: [
    { userId: 'not-self', data: { garden: { tileObjects: {
      0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] }
    } }, inventory: { items: [], favoritedItemIds: [] } } }
  ] } } });
  h.api.start();
  await flush();
  assert.equal(h.ws.sent.length, 0);
  h.api.stop();
});

test('game native commands and AutoFarm commands share increasing sequence numbers', async () => {
  const h = createHarness();
  h.receiveOwnState({
    0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] }
  });
  h.ws.send(JSON.stringify({
    scopePath: ['Room', 'Quinoa'], type: 'QuinoaCommand',
    requestId: 'game-id', commandSequence: 6,
    command: { type: 'DummyNativeCommand' }
  }));
  h.api.start();
  await flush();
  assert.equal(h.ws.sent[0].commandSequence, 6);
  assert.equal(h.ws.sent[1].commandSequence, 7);
  h.api.stop();
});

test('reconnect clears stale garden until fresh own-player patches arrive', async () => {
  const h = createHarness();
  h.receiveOwnState({ 0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] } });
  assert.equal(h.api.getDiagnostics().snapshotAvailable, true);
  const next = new h.window.WebSocket('wss://magicgarden.gg/version/1497/api/rooms/fake2');
  h.window.MagicCircle_RoomConnection.currentWebSocket = next;
  assert.equal(h.api.getDiagnostics().snapshotAvailable, false);
  assert.equal(h.api.getDiagnostics().nativeSequenceReady, false);
});


test('Anti-AFK is opt-in; independent watchdog sends synthetic movement only after inactivity', async () => {
  const h = createHarness({ withCanvas: true });
  h.receiveOwnState({});
  h.api.start();
  await flush();
  assert.equal(h.api.prefs.antiAfk, false);
  h.advanceTime(60000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 0);
  h.api.prefs.antiAfk = true;
  h.realInput();
  h.advanceTime(44000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 0);
  h.advanceTime(2000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 1);
  assert.deepEqual(h.events.map(e => e.type), ['pointermove', 'mousemove']);
  assert.ok(h.events.every(e => e.isTrusted === false));
  assert.match(h.api.state.antiAfkStatus, /unbestaetigt/);
  h.advanceTime(30000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 1, 'no event spam');
  h.advanceTime(21000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 2);
  h.realInput();
  h.advanceTime(15000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 2, 'fresh actual user input suppresses a pulse');
  h.api.stop();
  h.advanceTime(60000);
  h.runWatchdog();
  assert.equal(h.api.state.antiAfkTicks, 2, 'stop blocks pulses');
});

test('Auto-Reload is opt-in, waits 90 seconds after disconnect, and triggers only once per page', async () => {
  const h = createHarness();
  h.receiveOwnState({});
  h.api.prefs.autoReload = true;
  h.api.start();
  await flush();
  assert.equal(h.api.state.connectedOnce, true);
  h.ws.readyState = 3;
  h.ws.emit('close', {});
  h.advanceTime(89000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 0);
  h.advanceTime(2000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 1);
  assert.equal(h.sessionStorage.getItem('magic_garden_standalone_beta_should_resume'), '1');
  assert.ok(Number(h.sessionStorage.getItem('magic_garden_standalone_beta_elapsed_ms')) > 0);
  h.advanceTime(90000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 1, 'no runaway reload');
  assert.equal(h.api.getDiagnostics().autoReloadAttemptsLast15m, 1);
  h.api.stop();
});

test('Auto-Reload is disabled by default and never triggers with real network offline', async () => {
  const h = createHarness();
  h.receiveOwnState({});
  h.api.start();
  await flush();
  h.ws.readyState = 3;
  h.ws.emit('close', {});
  h.advanceTime(200000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 0, 'disabled');
  h.api.prefs.autoReload = true;
  h.context.navigator.onLine = false;
  h.runWatchdog();
  assert.equal(h.getReloads(), 0, 'actual network offline');
  h.api.stop();
});

test('Auto-Reload respects a 3-in-15-minutes budget', async () => {
  const h = createHarness();
  h.receiveOwnState({});
  h.api.prefs.autoReload = true;
  h.sessionStorage.setItem(
    'magic_garden_standalone_beta_reload_history',
    JSON.stringify([Date.now(), Date.now(), Date.now()])
  );
  h.api.start();
  await flush();
  h.ws.readyState = 3;
  h.ws.emit('close', {});
  h.advanceTime(91000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 0);
  assert.equal(h.api.state.reloadLimitReached, true);
  h.api.stop();
});

test('healthy connection and quick native reconnect do not reload after several minutes', async () => {
  const h = createHarness();
  h.receiveOwnState({});
  h.api.prefs.autoReload = true;
  h.api.start();
  await flush();
  h.advanceTime(120000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 0, 'healthy connection');
  h.ws.readyState = 3;
  h.ws.emit('close', {});
  h.advanceTime(40000);
  h.runWatchdog();
  const next = new h.window.WebSocket('wss://magicgarden.gg/version/1497/api/rooms/reconnect');
  h.window.MagicCircle_RoomConnection.currentWebSocket = next;
  h.runGameObserver();
  next.emit('message', {
    type: 'Welcome', selfPlayerId: 'self-player', executedCommandSequence: 0
  });
  h.window.MagicCircle_RoomConnection.lastDistributedRoomPublication.executedCommandSequence = 0;
  h.receiveOwnState({});
  await flush();
  h.runWatchdog();
  assert.equal(h.api.getDiagnostics().snapshotAvailable, true);
  h.advanceTime(160000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 0, 'reconnected before threshold');
  h.api.stop();
});


test('Auto-Resume from session storage waits for native game readiness and Stop disables it', async () => {
  const h = createHarness({ resumeOnLoad: true });
  assert.equal(h.api.state.running, true);
  assert.equal(h.api.state.autoResumed, true);
  assert.equal(h.api.state.connectedOnce, false);
  assert.equal(h.ws.sent.length, 0);
  h.receiveOwnState({
    0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0, locked: true }] }
  });
  await flush();
  assert.equal(h.ws.sent.length, 0, 'protected crop is not harvested');
  h.api.stop();
  assert.equal(h.sessionStorage.getItem('magic_garden_standalone_beta_should_resume'), '0');
});

test('Self-Healing never reloads a healthy socket just because crops are ripe', async () => {
  const h = createHarness();
  h.receiveOwnState({
    0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] }
  });
  h.api.prefs.autoReload = true;
  h.api.start();
  await flush();
  h.advanceTime(350000);
  h.runWatchdog();
  assert.equal(h.getReloads(), 0);
  h.api.stop();
});

test('standalone update channel never points to stable V13 script', () => {
  assert.match(source, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\/maik26-hub\/Magic-Garden-Tools\/main\/MagicGardenAutoFarm\.standalone\.user\.js/);
  assert.match(source, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/maik26-hub\/Magic-Garden-Tools\/main\/MagicGardenAutoFarm\.standalone\.user\.js/);
});


test('manual V14 update check accepts only a newer standalone version and omits credentials', async () => {
  const h = createHarness();
  h.setRemoteSource(source.replace('// @version      14.0.2',
    '// @version      14.0.3'));
  const result = await h.api.checkForUpdate(true);
  assert.equal(result.newer, '14.0.3');
  assert.match(result.status, /Standalone-Update verfuegbar/);
  assert.ok(result.url.endsWith('/MagicGardenAutoFarm.standalone.user.js'));
  assert.equal(h.fetchCalls.length, 1);
  assert.ok(h.fetchCalls[0].url.startsWith(result.url + '?check='));
  assert.equal(h.fetchCalls[0].options.credentials, 'omit');
  assert.equal(h.fetchCalls[0].options.mode, 'cors');
  assert.equal(h.fetchCalls[0].options.cache, 'no-store');
});

test('manual update check correctly reports already-current standalone release', async () => {
  const h = createHarness();
  const result = await h.api.checkForUpdate(true);
  assert.equal(result.newer, null);
  assert.equal(result.status, 'Standalone aktuell: V14.0.2');
});

test('manual update check rejects a V13 file despite a higher metadata version', async () => {
  const h = createHarness();
  h.setRemoteSource(
    '// ==UserScript==\n' +
    '// @name Magic Garden AutoFarm\n' +
    '// @namespace mg-autofarm-local\n' +
    '// @version 99.9.9\n' +
    '// ==/UserScript==\n'
  );
  const result = await h.api.checkForUpdate(true);
  assert.equal(result.newer, null, 'never offer the wrong product');
  assert.match(result.status, /Update-Check fehlgeschlagen/);
});

test('manual update check handles a blocked network request without false upgrades', async () => {
  const h = createHarness();
  h.setFetchFailure(new Error('CORS'));
  const result = await h.api.checkForUpdate(true);
  assert.equal(result.newer, null);
  assert.match(result.status, /Update-Check fehlgeschlagen/);
});

test('manual update check reports remote older without downgrade', async () => {
  const h = createHarness();
  h.setRemoteSource(source.replace('// @version      14.0.2',
    '// @version      14.0.1'));
  const result = await h.api.checkForUpdate(true);
  assert.equal(result.newer, null);
  assert.match(result.status, /Server-Version aelter/);
});

test('metadata and update check both use one standalone release filename', () => {
  const target = 'MagicGardenAutoFarm.standalone.user.js';
  const base = 'https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/';
  assert.ok(source.includes('// @updateURL    ' + base + target));
  assert.ok(source.includes('// @downloadURL  ' + base + target));
  assert.ok(source.includes('const UPDATE_URL = "' + base + target + '"'));
  assert.ok(!source.includes('const UPDATE_URL = "' + base + 'MagicGardenAutoFarm.user.js"'));
});
