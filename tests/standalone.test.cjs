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

function createHarness() {
  const localStorage = store(), sessionStorage = store(), tasks = [];
  localStorage.setItem('magic_garden_selected_tiles_v1',
    JSON.stringify({ left: [0, 1, 2], right: [] }));

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

  const window = { WebSocket: Socket, addEventListener() {} };
  const document = { body: null, hidden: false, addEventListener() {} };
  const context = {
    window, document, localStorage, sessionStorage,
    WebSocket: Socket,
    performance: { now: () => 0 },
    crypto: { randomUUID: () => 'test-request' },
    navigator: { onLine: true },
    location: { reload() {} },
    AbortController,
    setTimeout: (fn, ms) => { tasks.push({ fn, ms }); return tasks.length; },
    clearTimeout() {},
    setInterval: (fn, ms) => { tasks.push({ fn, ms }); return tasks.length; },
    console: { log() {}, info() {}, warn() {}, error() {}, table() {} },
    fetch: async () => ({ ok: true, text: async () => source })
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
    api, window, ws, sendPatch, tasks, localStorage, sessionStorage,
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
