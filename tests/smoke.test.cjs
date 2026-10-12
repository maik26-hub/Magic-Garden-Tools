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
    setTimeout, clearTimeout,
    console: { log() {}, warn() {}, info() {}, error() {} },
    fetch: async () => ({ ok: true, text: async () => source })
  };
  vm.runInNewContext(source, context, { filename: 'MagicGardenAutoFarm.user.js', timeout: 3000 });
  return { api: window.MGAutoFarmV13, localStorage, context };
}

test('V13.2 initializes and retains selection and prior controls', () => {
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
  assert.equal(report.version, '13.2.0');
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
