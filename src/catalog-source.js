/** Own-game catalog discovery. No pinned chunk name, external catalogs or eval.
 * Resource observation starts at document-start; missing timing entries are
 * recovered from the page's module scripts/preloads and their ESM dependencies.
 */
function identifyNativeCatalogs(exports) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const out = {}, seen = new Set();
  function inspect(value, depth) {
    if (!object(value) || seen.has(value) || seen.size >= 8192) return;
    seen.add(value);
    const before = Object.keys(out).length;
    if (object(value.Carrot?.seed) && finite(value.Carrot?.crop?.baseSellPrice)) out.plants = value;
    if (Array.isArray(value.Worm?.diet) && (finite(value.Worm.coinsToFullyReplenishHunger) || finite(value.Worm.maxHunger))) out.pets = value;
    if (finite(value.CommonEgg?.secondsToHatch) && (finite(value.CommonEgg.coinPrice) || object(value.CommonEgg.faunaSpawnWeights))) out.eggs = value;
    if (finite(value.WateringCan?.coinPrice) && object(value.Camera)) out.tools = value;
    if (finite(value.Gold?.coinMultiplier) && typeof value.Gold.group === 'string' && object(value.Wet)) out.mutations = value;
    if (object(value.SeedSilo) && object(value.FeedingTrough) && finite(value.FeedingTrough.coinPrice)) out.decor = value;
    // Native ability metadata is optional; unavailable values are never guessed.
    if (object(value.SellBoostI) && object(value.EggGrowthBoost) &&
      (finite(value.SellBoostI.baseProbability) || object(value.SellBoostI.baseParameters)))
      out.abilities = value;
    if (Object.keys(out).length > before) return;
    // Module namespaces can export hundreds of symbols. Do not stop before
    // late alphabetically-named catalog exports or recurse into catalog rows.
    // Module namespaces, default-export containers, and canonical category maps.
    if (depth < 2) {
      for (const child of Object.values(value).slice(0, depth === 0 ? 4096 : 128)) {
        if (object(child)) inspect(child, depth + 1);
      }
    }
  }
  inspect(exports, 0);
  return out;
}

function createNativeCatalogSource(env) {
  'use strict';
  const limit = { urls: 192, sourceBytes: 4 * 1024 * 1024, totalBytes: 24 * 1024 * 1024, readsPerPass: 12, fetchMs: 5000, importMs: 6000 };
  const now = env.now || (() => Date.now());
  const resources = new Map(), imported = new Map(), catalogData = {};
  let observer = null, flight = null, totalBytes = 0, release = '', issue = '', stopped = false;
  const groups = ['plants', 'pets', 'eggs', 'tools', 'mutations', 'decor'];
  const full = () => groups.every(group => catalogData[group]);
  function context() {
    try {
      const page = new URL(env.pageURL());
      let current = String(env.release?.() || '');
      if (!/^\d+$/.test(current)) current = '';
      return { page, current };
    } catch { return null; }
  }
  function normalize(value, base) {
    const c = context();
    if (!c || typeof value !== 'string' || value.length > 1500) return null;
    try {
      let reference = value;
      // Vite dependency arrays use "assets/X.js" relative to the release root,
      // whereas ordinary static imports use "./X.js" relative to the module.
      if (base && /^assets\//.test(reference)) reference = '../' + reference;
      const url = new URL(reference, base || c.page.href);
      if (url.origin !== c.page.origin || !/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      if (!/^\/(?:version\/\d+\/)?assets\/[A-Za-z0-9_./-]+\.m?js$/.test(url.pathname)) return null;
      const version = url.pathname.match(/^\/version\/(\d+)\//)?.[1];
      if (version && c.current && version !== c.current) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }
  function remember(value, base, discovered = false) {
    const url = normalize(value, base);
    if (!url || resources.has(url) || resources.size >= limit.urls) return;
    resources.set(url, { url, read: false, retryAt: 0, candidate: false, discovered });
  }
  function collect() {
    const c = context();
    if (!c) return;
    if (c.current && release && c.current !== release) {
      resources.clear(); imported.clear();
      for (const key of Object.keys(catalogData)) delete catalogData[key];
      totalBytes = 0;
    }
    if (c.current) release = c.current;
    try { for (const e of env.performance?.getEntriesByType?.('resource') || []) remember(e.name); } catch { /* timing buffer may be unavailable */ }
    try {
      for (const node of env.document?.querySelectorAll?.('script[src],link[rel~="modulepreload"][href]') || []) {
        remember(node.src || node.href || node.getAttribute?.('src') || node.getAttribute?.('href'));
      }
    } catch { /* document may not be ready at document-start */ }
  }
  function references(text, base) {
    // Read references, never execute/rewrite source. Accept only own asset URLs.
    const rx = /["'`]((?:\.{1,2}\/|\/version\/\d+\/assets\/|\/assets\/|assets\/)[^"'`\s]+\.m?js(?:\?[^"'`\s]*)?)["'`]/g;
    for (const match of text.matchAll(rx)) remember(match[1], base, true);
  }
  function containsCatalogData(text) {
    const signals = [
      /\bbaseSellPrice\b/.test(text) && /\bmaxSizeMultiplier\b/.test(text),
      /\bsecondsToHatch\b/.test(text) && /\bfaunaSpawnWeights\b/.test(text),
      /\bcoinsToFullyReplenishHunger\b/.test(text) && /\bdiet\b/.test(text),
      /\bcoinMultiplier\b/.test(text) && /\bGrowth\b/.test(text),
      /\bWateringCan\b/.test(text) && /\bcoinPrice\b/.test(text),
      /\bFeedingTrough\b/.test(text) && /\bcoinPrice\b/.test(text)
    ];
    return signals.some(Boolean) && /\bexport\b/.test(text);
  }
  function priority(item) {
    // Hints only. A new/renamed bundle is still found through source markers.
    if (item.candidate) return 0;
    if (/BakedRoundedRect|catalog|Catalog|[Pp]lants|[Ee]ggs/.test(item.url)) return 1;
    if (/\/Boot-|\/index-|\/bootScreen-|\/QuinoaCanvas-|\/main-/.test(item.url)) return 2;
    return item.discovered ? 3 : 4;
  }
  async function boundedText(response) {
    if (!response.ok) throw new Error('Katalog-Datei vorübergehend nicht erreichbar');
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > limit.sourceBytes) throw new Error('Katalog-Datei überschreitet Leselimit');
    // Bound streamed reads as well as decompressed bodies.
    if (response.body?.getReader && typeof TextDecoder === 'function') {
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let bytes = 0, text = '';
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit.sourceBytes) { await reader.cancel(); throw new Error('Katalog-Datei überschreitet Leselimit'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
      } finally { reader.releaseLock(); }
    }
    const text = await response.text();
    if (text.length > limit.sourceBytes) throw new Error('Katalog-Datei überschreitet Leselimit');
    return text;
  }
  async function readModule(item) {
    let timer = null;
    const controller = new AbortController();
    try {
      // The race bounds stalled streams too. Never add credentials or use the
      // WebSocket URL (which contains private room/auth data) as a fetch target.
      return await Promise.race([
        (async () => {
          const response = await env.fetch(item.url, { credentials: 'omit', mode: 'same-origin', cache: 'force-cache', signal: controller.signal, redirect: 'error' });
          if (response.url && normalize(response.url) !== item.url) throw new Error('Unerwartete Katalog-Weiterleitung');
          return boundedText(response);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Katalogabruf dauert zu lange')); }, env.fetchTimeoutMs || limit.fetchMs); })
      ]);
    } finally { if (timer !== null) clearTimeout(timer); }
  }
  async function importCatalog(item) {
    let promise = imported.get(item.url);
    if (!promise) {
      const requestRelease = release;
      promise = Promise.resolve().then(() => env.importModule(item.url)).then(exports => {
        if (requestRelease === release && !stopped) Object.assign(catalogData, identifyNativeCatalogs(exports));
        return exports;
      });
      // No duplicated imports while a prior asynchronous module is pending.
      imported.set(item.url, promise);
      promise.catch(() => { if (imported.get(item.url) === promise) imported.delete(item.url); });
    }
    let timer = null;
    try {
      await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Spielmodul noch nicht bereit')), env.importTimeoutMs || limit.importMs); })]);
    } finally { if (timer !== null) clearTimeout(timer); }
  }
  async function pass() {
    collect();
    if (full()) return { ...catalogData };
    const started = now();
    let reads = 0;
    while (!stopped && !full() && reads < limit.readsPerPass && now() - started < 10000) {
      const item = [...resources.values()].filter(i => (!i.read || i.candidate) && i.retryAt <= now() && normalize(i.url)).sort((a,b) => priority(a) - priority(b))[0];
      if (!item) break;
      try {
        if (!item.read) {
          if (totalBytes >= limit.totalBytes) { issue = 'Katalogsuche begrenzt; auf weitere Spieldaten warten'; break; }
          const text = await readModule(item); reads++;
          totalBytes += text.length; item.read = true;
          references(text, item.url);
          item.candidate = containsCatalogData(text);
        }
        if (item.candidate) {
          await importCatalog(item);
          item.candidate = false;
        }
        issue = '';
      } catch (error) {
        item.retryAt = now() + 10000;
        reads++;
        issue = String(error?.message || 'Katalogquelle noch nicht bereit').slice(0, 120);
      }
    }
    if (full()) issue = '';
    return { ...catalogData };
  }
  function load() {
    if (stopped) return Promise.resolve({ ...catalogData });
    if (!flight) flight = pass().finally(() => { flight = null; });
    return flight;
  }
  function diagnostics() { return { release, ready: Object.keys(catalogData), resources: resources.size, issue, loading: !!flight }; }
  function dispose() { stopped = true; observer?.disconnect(); }
  try {
    if (typeof env.PerformanceObserver === 'function') {
      observer = new env.PerformanceObserver(list => { for (const entry of list.getEntries()) remember(entry.name); });
      observer.observe({ type: 'resource', buffered: true });
    }
  } catch { observer = null; }
  collect();
  return { load, diagnostics, dispose };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createNativeCatalogSource, identifyNativeCatalogs };
