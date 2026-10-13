// Run: node --test tests/smoke.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'MagicGardenAutoFarm.user.js'), 'utf8');
const memory = () => {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) };
};
function setup(prefs = {}) {
  const localStorage = memory(), sessionStorage = memory();
  localStorage.setItem('magic_garden_selected_tiles_v1',
    JSON.stringify({ left: [0, 1], right: [99] }));
  localStorage.setItem('magic_garden_v13_preferences', JSON.stringify(prefs));
  const window = { addEventListener() {} };
  const document = { body: null, hidden: false, addEventListener() {} };
  const context = {
    window, document, localStorage, sessionStorage,
    WebSocket: { OPEN: 1 },
    performance: { now: () => 0 },
    crypto: { randomUUID: () => 'mock-request-id' },
    navigator: { onLine: true },
    location: { reload() {} },
    setTimeout, clearTimeout, AbortController,
    console: { log() {}, warn() {}, info() {}, error() {} },
    fetch: async () => ({ ok: true, text: async () => source })
  };
  vm.runInNewContext(source, context, { filename: 'MagicGardenAutoFarm.user.js', timeout: 3000 });
  return { api: window.MGAutoFarmV13, localStorage, context };
}

test('V13.2.3 initializes and retains selection and prior controls', () => {
  const { api } = setup();
  assert.ok(api);
  assert.equal(api.selectedSlots().size, 3);
  assert.equal(typeof api.start, 'function');
  assert.equal(typeof api.stop, 'function');
  assert.match(source, /installPanelDragging\(header\)/);
  assert.match(source, /event\.code !== "F8"/);
  assert.match(source, /type: "HarvestCrop"/);
  assert.match(source, /type: "SellAllCrops"/);
  assert.match(source, /isMarkedProtected\(plant, crop\)/);
});
test('settings are validated and persisted', () => {
  const { api, localStorage } = setup({
    sellThreshold: 9999, minHarvestDelayMs: 12, maxHarvestDelayMs: 5000, stallAfterMs: 1000
  });
  assert.equal(api.prefs.sellThreshold, 200);
  assert.equal(api.prefs.minHarvestDelayMs, 50);
  assert.equal(api.prefs.maxHarvestDelayMs, 3000);
  assert.equal(api.prefs.stallAfterMs, 30000);
  assert.equal(api.setNumberPreference('sellThreshold', 25), 25);
  assert.equal(JSON.parse(localStorage.getItem('magic_garden_v13_preferences')).sellThreshold, 25);
});
test('diagnostics exclude raw user/game identifiers', () => {
  const { api } = setup();
  const report = api.getDiagnostics();
  assert.equal(report.version, '13.2.3');
  assert.equal(report.selectedFieldCount, 3);
  assert.ok(!Object.keys(report).some(k =>
    /cookie|user|account|itemId|cropId|requestId|inventoryItems/i.test(k)
  ));
  assert.ok(!JSON.stringify(report).includes('mock-request-id'));
});
test('update checker reads metadata, never installs code', async () => {
  const { api, context } = setup();
  context.fetch = async () => ({ ok: true, text: async () => '// @version      13.3.0\n' });
  const status = await api.checkForUpdate(true);
  assert.equal(status.newer, '13.3.0');
  assert.equal(typeof api.checkForUpdate, 'function');
});

test('resetTimer clears elapsed time while leaving farm running', () => {
  const { api, context } = setup();
  // Start does not require ready websocket; the async loop will wait for it.
  api.start();
  assert.equal(api.state.running, true);
  assert.equal(api.resetTimer(), '00:00:00');
  assert.equal(api.state.running, true);
  assert.equal(context.sessionStorage.getItem('magic_garden_v13_elapsed_ms'), '0');
  api.stop();
  assert.equal(api.state.running, false);
  assert.equal(api.resetTimer(), '00:00:00');
});

test('session reset clears time and counters, preserves fields, preferences and protected cooldowns', () => {
  const { api, localStorage, context } = setup({ sellThreshold: 55 });
  api.start();
  api.state.harvested = 87;
  api.state.sold = 3;
  api.state.coins = 500123;
  api.state.errors = 4;
  api.state.protectedSkips = 2;
  api.state.antiAfkTicks = 7;
  api.state.reconnects = 1;
  api.state.selfHealChecks = 9;
  api.state.lastError = 'old error';
  api.state.cooldowns.set('protected:tile', Date.now() + 30_000);
  const result = api.resetSession();
  assert.deepEqual(Object.values(result), ['00:00:00', 0, 0, 0]);
  assert.equal(api.state.running, true);
  for (const key of ['harvested', 'sold', 'coins', 'errors', 'protectedSkips', 'antiAfkTicks', 'reconnects', 'selfHealChecks']) {
    assert.equal(api.state[key], 0, key);
  }
  assert.equal(api.state.lastError, '');
  assert.equal(api.selectedSlots().size, 3);
  assert.equal(api.prefs.sellThreshold, 55);
  assert.ok(api.state.cooldowns.has('protected:tile'));
  assert.equal(context.sessionStorage.getItem('magic_garden_v13_elapsed_ms'), '0');
  assert.deepEqual(JSON.parse(localStorage.getItem('magic_garden_selected_tiles_v1')).left, [0, 1]);
  api.stop();
});

test('a harvest already in flight does not count toward a freshly reset session', async () => {
  const { api, context } = setup();
  const listeners = new Set();
  let lastCommand;
  const ws = {
    readyState: 1,
    addEventListener(type, fn) { if (type === 'message') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'message') listeners.delete(fn); },
    send(text) { lastCommand = JSON.parse(text); }
  };
  context.window.quinoaWS = ws;
  context.window.__qpmGardenSnapshot__ = {
    tileObjects: { 0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] } }
  };
  api.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lastCommand.command.type, 'HarvestCrop');
  api.resetSession();
  for (const listener of listeners) listener({
    data: JSON.stringify({
      type: 'QuinoaCommandResult',
      requestId: lastCommand.requestId,
      ok: true,
      itemGains: [{}]
    })
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.state.harvested, 0);
  assert.ok(api.state.cooldowns.has('0:0'));
  api.stop();
});


function paintHarness() {
  const start = source.indexOf('  function installFieldPainting(container) {');
  const end = source.indexOf('\n  function createPanel() {', start);
  assert.ok(start >= 0 && end > start, 'real drag painter implementation exists');
  const implementation = source.slice(start, end);

  const selection = { left: new Set([0, 1]), right: new Set([0]) };
  const layout = [['left', 0], ['left', 1], ['left', 2], ['right', 0], ['right', 1]];
  const buttons = new Map(layout.map(([side, index]) => {
    const el = {
      dataset: { side, index: String(index) },
      style: {},
      closest() { return this; }
    };
    return [side + ':' + index, el];
  }));
  const handlers = new Map();
  let saves = 0, updates = 0, capture = null;
  const fields = {
    contains: el => [...buttons.values()].includes(el),
    addEventListener: (type, callback) => handlers.set(type, callback),
    setPointerCapture: id => { capture = id; },
    hasPointerCapture: id => capture === id,
    releasePointerCapture: () => { capture = null; }
  };
  const document = {
    elementFromPoint(x) {
      const item = layout[Math.floor(x / 20)];
      return item ? buttons.get(item[0] + ':' + item[1]) : null;
    }
  };
  const window = { addEventListener() {} };
  const fieldCount = { textContent: '' };
  const factory = new Function(
    'selection', 'saveSelection', 'updatePanel',
    'fieldCount', 'document', 'window',
    implementation + '\nreturn installFieldPainting;'
  );
  factory(selection, () => saves++, () => updates++,
    fieldCount, document, window)(fields);

  const pointer = (type, x, key) => ({
    type, button: 0, isPrimary: true, pointerId: 1,
    clientX: x, clientY: 10,
    target: buttons.get(key),
    preventDefault() {}
  });
  return {
    selection, handlers, pointer,
    get saves() { return saves; },
    get updates() { return updates; },
    fieldCount, buttons
  };
}
test('dragging across both plots deselects fields based on start tile, without toggling twice', () => {
  const h = paintHarness();
  h.handlers.get('pointerdown')(h.pointer('pointerdown', 10, 'left:0'));
  h.handlers.get('pointermove')(h.pointer('pointermove', 90, 'left:0'));
  h.handlers.get('pointermove')(h.pointer('pointermove', 20, 'left:0'));
  h.handlers.get('pointerup')(h.pointer('pointerup', 90, 'left:0'));
  assert.equal(h.selection.left.size, 0);
  assert.equal(h.selection.right.size, 0);
  assert.equal(h.saves, 1);
  assert.equal(h.fieldCount.textContent, 'Ausgewählt: 0 / 200');
});
test('dragging from empty field selects all traversed tiles, including other plot', () => {
  const h = paintHarness();
  h.handlers.get('pointerdown')(h.pointer('pointerdown', 50, 'left:2'));
  h.handlers.get('pointermove')(h.pointer('pointermove', 90, 'left:2'));
  h.handlers.get('pointerup')(h.pointer('pointerup', 90, 'left:2'));
  assert.equal(h.selection.left.has(2), true);
  assert.equal(h.selection.right.has(1), true);
  assert.equal(h.selection.left.has(0), true);
  assert.equal(h.selection.left.has(1), true);
  assert.equal(h.saves, 1);
});
test('a single pointer tap selects one field and a cancelled drag still persists changes', () => {
  const h = paintHarness();
  h.handlers.get('pointerdown')(h.pointer('pointerdown', 50, 'left:2'));
  h.handlers.get('pointercancel')(h.pointer('pointercancel', 50, 'left:2'));
  assert.equal(h.selection.left.has(2), true);
  assert.equal(h.saves, 1);
});
test('field buttons keep keyboard click support and have touch-safe pointer styling', () => {
  assert.match(source, /if \(event\.detail !== 0\) return;/);
  assert.match(source, /touch-action:none/);
  assert.match(source, /installFieldPainting\(fields\)/);
});

test('rejected harvests do not increase adaptive delay, preserve protection, and cool down the rejected slot', async () => {
  const { api, context } = setup();
  const listeners = new Set();
  let lastCommand = null;
  const ws = {
    readyState: 1,
    addEventListener(type, fn) { if (type === 'message') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'message') listeners.delete(fn); },
    send(text) { lastCommand = JSON.parse(text); }
  };
  context.window.quinoaWS = ws;
  context.window.__qpmGardenSnapshot__ = {
    tileObjects: { 0: { objectType: 'plant', slots: [{ slotId: 0, endTime: 0 }] } }
  };
  api.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lastCommand?.command?.type, 'HarvestCrop');

  const beforeDelay = api.state.currentDelay;
  const reply = {
    type: 'QuinoaCommandResult',
    requestId: lastCommand.requestId,
    commandType: 'HarvestCrop',
    ok: false,
    code: 'rejected'
  };
  for (const fn of [...listeners]) fn({ data: JSON.stringify(reply) });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(api.state.rejectedHarvests, 1);
  assert.equal(api.state.errors, 0);
  assert.equal(api.state.currentDelay, beforeDelay);
  assert.equal(api.state.rejectionStreak, 1);
  assert.ok(api.state.cooldowns.get('0:0') > Date.now() + 8 * 60_000);
  assert.equal(api.state.protectedSkips, 0);
  assert.equal(api.state.lastError, '');
  assert.ok(!api.state.lastRejection.includes(reply.requestId));
  api.stop();
});

test('rejected harvest diagnostics are privacy safe and session reset clears count', () => {
  const { api } = setup();
  api.state.rejectedHarvests = 4;
  assert.equal(api.getDiagnostics().rejectedHarvestCount, 4);
  api.resetSession();
  assert.equal(api.state.rejectedHarvests, 0);
  assert.equal(api.state.lastRejection, '');
  assert.equal(api.getDiagnostics().rejectedHarvestCount, 0);
});

test('harvest protections, selling, adaptive speed, and drag selection remain installed', () => {
  assert.match(source, /isMarkedProtected\(plant, crop\)/);
  assert.match(source, /function isHarvestRejected\(error\)/);
  assert.match(source, /type: "SellAllCrops"/);
  assert.match(source, /installFieldPainting\(fields\)/);
  assert.match(source, /if \(!err \|\| \(!isHarvestRejected\(err\)/);
});
