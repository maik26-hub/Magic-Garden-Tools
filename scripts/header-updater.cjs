'use strict';
// Deterministic build-time update transport/UI migration. No runtime dependency.
module.exports = function patchHeaderUpdater(input, transportSource) {
  let src = input;
  function replace(oldText, newText, what) {
    const count = src.split(oldText).length - 1;
    if (count !== 1) throw new Error('header updater: ' + what + ' matched ' + count);
    src = src.replace(oldText, newText);
  }
  replace('// @grant        none',
    '// @grant        GM_xmlhttpRequest\n// @grant        unsafeWindow\n// @connect      raw.githubusercontent.com',
    'Tampermonkey permissions');
  // GM grants run in a sandbox, so all existing game globals/socket hooks must
  // access the real page. In @grant-none test harnesses unsafeWindow is absent.
  replace('(() => {\n  "use strict";',
    '(() => {\n  "use strict";\n  const window = typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis.window;\n\n' +
    transportSource, 'page-window access and fetch helper');

  replace(
    '    const controller = new AbortController();\n    const timeout = setTimeout(() => controller.abort(), 8000);\n    try {',
    '    try {',
    'updater timeout owned by transport');
  replace(
    '      // credentials:"omit" vermeidet CORS-Fehler durch Credential-/Wildcard-Mix.\n' +
    '      // Query-Parameter umgehen alte Edge-/Proxy-Caches; Link selbst bleibt konstant.\n' +
    '      const response = await fetch(UPDATE_URL + "?check=" + Date.now(), {\n' +
    '        cache: "no-store", credentials: "omit", mode: "cors", signal: controller.signal\n' +
    '      });\n' +
    '      if (!response.ok) throw new Error("HTTP " + response.status);\n' +
    '      const remote = parseMainRelease(await response.text());',
    '      const source = await fetchReleaseSource(UPDATE_URL, {\n' +
    '        gmRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null,\n' +
    '        fetchImpl: fetch, timeoutMs: 10000\n' +
    '      });\n' +
    '      const remote = parseMainRelease(source);',
    'privileged update source');
  replace('      clearTimeout(timeout);\n      updateInfo.checkedAt = Date.now();',
    '      updateInfo.checkedAt = Date.now();',
    'privileged timeout cleanup');
  replace('Date.now() - updateInfo.checkedAt < 6 * 3600000',
    'Date.now() - updateInfo.checkedAt < 30 * 60000',
    'background poll cache');
  replace('    updateControls.appendChild(btn("Update prüfen", () => { void checkForUpdate(true); }));',
    '    // Update check runs on a timer. The sticky version badge opens install.',
    'remove old update button');
  replace('    if (event.button !== 0 || event.isPrimary === false ||\n          event.target?.closest?.("button")) return;',
    '    if (event.button !== 0 || event.isPrimary === false ||\n          event.target?.closest?.("button, a, [role=button]")) return;',
    'clickable badge must not trigger dragging');
  replace('    setTimeout(() => { void checkForUpdate(false); }, 2000);',
    '    setTimeout(() => { void checkForUpdate(false); }, 2000);\n' +
    '    setInterval(() => { void checkForUpdate(false); }, 30 * 60000);',
    'automatic recurring update check');
  return src;
};
