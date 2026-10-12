// ==UserScript==
// @name         Magic Garden AutoFarm
// @namespace    mg-autofarm-local
// @version      13.0.0
// @updateURL   https://raw.githubusercontent.com/DEIN_GITHUB_NAME/magic-garden-autofarm/main/MagicGardenAutoFarm.user.js
// @downloadURL https://raw.githubusercontent.com/DEIN_GITHUB_NAME/magic-garden-autofarm/main/MagicGardenAutoFarm.user.js
// @description  Adaptive Harvest, Auto Sell, Anti-AFK (experimentell), Auto-Reconnect, Background, F8, Auto-Resume, Recovery
// @match        https://magicgarden.gg/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // WICHTIG: Nur dieses AutoFarm-Skript aktivieren; Garden Companion aktiv lassen.
  // Garden Companion liefert Garden-Snapshot, Inventar, WS-Sequenz und Pflanzenschutz.
  // V13 umgeht den Schutz NICHT.
  if (window.MGAutoFarmV13) return;
  if (window.MGAutoFarmV12 || window.MGAutoFarmV11) {
    console.warn("[MG V13] Bitte alte AutoFarm-Skripte deaktivieren und neu laden.");
    return;
  }

  const KEYS = {
    selection: "magic_garden_selected_tiles_v1",      // kompatibel mit V11/V12
    collapsed: "magic_garden_v11_ui_collapsed",          // kompatibel mit V11/V12
    prefs: "magic_garden_v13_preferences",
    resume: "magic_garden_v13_should_resume",           // sessionStorage: pro Tab
    timer: "magic_garden_v13_elapsed_ms",               // sessionStorage
    reloads: "magic_garden_v13_reload_history"          // sessionStorage
  };

  const cfg = {
    scanMs: 500,
    hiddenScanMs: 1500,           // Browser darf Hintergrund-Timer weiter drosseln
    sellThreshold: 40,
    sellEveryMs: 2000,
    commandTimeoutMs: 6000,
    harvestedSlotCooldownMs: 5000,
    failedSlotCooldownMs: 60000,
    protectedSlotCooldownMs: 30 * 60000,
    antiAfkEveryMs: 50 * 1000,
    antiAfkOnlyAfterNoRealInputMs: 45 * 1000,
    offlineReloadAfterMs: 90 * 1000,
    reloadLimit: 3,
    reloadWindowMs: 15 * 60000,
    breakerAfterErrors: 8,
    breakerMs: 60 * 1000,
    adaptive: {
      initialMs: 100,
      minMs: 75,
      maxMs: 1000,
      speedUpMs: 5,
      slowDownMs: 50,
      fastResponseMs: 350,
      slowResponseMs: 900,
      successesToSpeedUp: 5
    }
  };

  function readJSON(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key));
      return value == null ? fallback : value;
    } catch { return fallback; }
  }
  function readValue(storage, key, fallback = null) {
    try { return storage.getItem(key) ?? fallback; }
    catch { return fallback; }
  }
  function storeValue(storage, key, value) {
    try { storage.setItem(key, value); }
    catch (e) { console.warn("[MG V13] Speichern fehlgeschlagen:", e.message); }
  }
  function storeJSON(storage, key, value) {
    storeValue(storage, key, JSON.stringify(value));
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const savedPrefs = readJSON(localStorage, KEYS.prefs, {});
  const prefs = {
    antiAfk: savedPrefs.antiAfk !== false,
    autoReload: savedPrefs.autoReload !== false,
    adaptive: savedPrefs.adaptive !== false
  };
  const persistPrefs = () => storeJSON(localStorage, KEYS.prefs, prefs);

  const state = {
    running: false,
    busy: false,
    harvested: 0,
    sold: 0,
    coins: 0,
    errors: 0,
    protectedSkips: 0,
    lastError: "",
    cooldowns: new Map(),
    currentDelay: cfg.adaptive.initialMs,
    lastResponseMs: 0,
    averageResponseMs: 0,
    successStreak: 0,
    speedAdjustments: 0,
    consecutiveErrors: 0,
    breakerUntil: 0,
    connection: "Warte auf Spiel",
    connectedOnce: false,
    offlineSince: null,
    reconnects: 0,
    lastOnline: null,
    hidden: typeof document !== "undefined" ? document.hidden : false,
    lastRealInput: Date.now(),
    antiAfkTicks: 0,
    lastAntiAfk: null,
    lastActivityAt: null,
    lastLoopAt: null,
    wakeLagMs: 0,
    autoResumed: false,
    reloadRequested: false
  };

  // ===== Laufzeit: Start/Stop; nach F5 im selben Tab fortsetzen =====
  let elapsedMs = Number(readValue(sessionStorage, KEYS.timer, "0")) || 0;
  let timerStartAt = null;
  const runtimeMs = () => elapsedMs + (timerStartAt === null ? 0 : Date.now() - timerStartAt);
  function startTimer() {
    if (timerStartAt === null) timerStartAt = Date.now();
  }
  function persistTimer() {
    storeValue(sessionStorage, KEYS.timer, String(Math.max(0, Math.round(runtimeMs()))));
  }
  function stopTimer() {
    if (timerStartAt !== null) {
      elapsedMs = runtimeMs();
      timerStartAt = null;
    }
    persistTimer();
  }
  function formatTime(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(n => String(n).padStart(2, "0")).join(":");
  }
  window.addEventListener("pagehide", persistTimer);

  // ===== Feldwahl: 10x10 links und 10x10 rechts =====
  function cleanIndices(items) {
    return new Set((Array.isArray(items) ? items : [])
      .map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 100));
  }
  function loadSelection() {
    const data = readJSON(localStorage, KEYS.selection, {});
    return { left: cleanIndices(data.left), right: cleanIndices(data.right) };
  }
  const selection = loadSelection();
  function saveSelection() {
    storeJSON(localStorage, KEYS.selection, {
      left: [...selection.left].sort((a, b) => a - b),
      right: [...selection.right].sort((a, b) => a - b)
    });
  }
  function selectedSlots() {
    const result = new Set();
    for (const i of selection.left) result.add(Math.floor(i / 10) * 20 + i % 10);
    for (const i of selection.right) result.add(Math.floor(i / 10) * 20 + 10 + i % 10);
    return result;
  }

  // ===== Spielzustand (nur eigene Garden-Companion-Daten) =====
  function getSocket() {
    return [window.quinoaWS, window.mgBot?.ws]
      .find(ws => ws && ws.readyState === WebSocket.OPEN) || null;
  }
  function getInventory() {
    return window.__gardenCompanionState?.slot?.data?.inventory;
  }
  function getProduce() {
    const inv = getInventory();
    const favorites = new Set(inv?.favoritedItemIds || []);
    return (inv?.items || []).filter(item =>
      item?.itemType === "Produce" &&
      typeof item.id === "string" && !favorites.has(item.id)
    );
  }
  function isMarkedProtected(plant, crop) {
    // Best-effort: nur klar benannte Schutz-Flags prüfen.
    // Entscheidend bleibt die Sperre des Garden Companion beim Senden.
    return [crop?.protected, crop?.isProtected, crop?.preserved,
      crop?.isPreserved, plant?.protected, plant?.isProtected,
      plant?.preserved, plant?.isPreserved].some(v => v === true);
  }
  function findReadyCrop() {
    const tiles = window.__qpmGardenSnapshot__?.tileObjects;
    if (!tiles) return null;
    const chosen = selectedSlots();
    const now = Date.now();
    for (const [id, plant] of Object.entries(tiles)) {
      const tile = Number(id);
      if (!chosen.has(tile) || plant?.objectType !== "plant") continue;
      for (const crop of plant.slots || []) {
        if (!Number.isInteger(crop?.slotId)) continue;
        if (!Number.isFinite(crop?.endTime) || crop.endTime > now) continue;
        const key = `${tile}:${crop.slotId}`;
        if ((state.cooldowns.get(key) || 0) > now) continue;
        if (isMarkedProtected(plant, crop)) {
          state.cooldowns.set(key, now + cfg.protectedSlotCooldownMs);
          state.protectedSkips++;
          continue;
        }
        return { tile, slotsIndex: crop.slotId, key };
      }
    }
    return null;
  }

  // ===== Adaptives Tempo: nur bestätigte Ernteantworten messen =====
  function adjustSpeed(responseMs, successful, protectedError = false) {
    if (!protectedError) {
      state.lastResponseMs = Math.round(responseMs);
      state.averageResponseMs = state.averageResponseMs === 0
        ? responseMs : state.averageResponseMs * 0.8 + responseMs * 0.2;
    }
    if (!prefs.adaptive || protectedError) return;
    const a = cfg.adaptive;
    const before = state.currentDelay;
    if (!successful) {
      state.successStreak = 0;
      state.currentDelay = Math.min(a.maxMs, before + a.slowDownMs * 2);
    } else if (responseMs >= a.slowResponseMs) {
      state.successStreak = 0;
      state.currentDelay = Math.min(a.maxMs, before + a.slowDownMs);
    } else if (responseMs <= a.fastResponseMs) {
      if (++state.successStreak >= a.successesToSpeedUp) {
        state.currentDelay = Math.max(a.minMs, before - a.speedUpMs);
        state.successStreak = 0;
      }
    } else {
      state.successStreak = 0;
    }
    if (state.currentDelay !== before) state.speedAdjustments++;
  }

  function errorText(error) {
    return String(error?.message || error || "Unbekannter Fehler").slice(0, 350);
  }
  function looksProtected(error) {
    return /protect|preserv|blocked|refus|gesch[uü]tz|gesperrt|schutz|forbidden/i
      .test(errorText(error));
  }
  function isNetworkError(error) {
    return /socket|websocket|disconnect|netzwerk|network|timeout|offline|closed/i
      .test(errorText(error));
  }

  // ===== WebSocket-Befehle – keine Umgehung der Companion-Wrappers =====
  function sendCommand(command) {
    return new Promise((resolve, reject) => {
      const ws = getSocket();
      if (!ws) return reject(new Error("WebSocket nicht verbunden"));
      const requestId = crypto.randomUUID();
      const sentAt = performance.now();
      let finished = false;
      let timeout;

      function finish(err, result) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        ws.removeEventListener("message", onMessage);
        if (command.type === "HarvestCrop") {
          adjustSpeed(performance.now() - sentAt, !err, !!err && looksProtected(err));
        }
        if (err) reject(err);
        else {
          state.lastActivityAt = Date.now();
          resolve(result);
        }
      }
      function onMessage(event) {
        if (typeof event.data !== "string") return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type !== "QuinoaCommandResult" || msg.requestId !== requestId) return;
        if (msg.ok !== true) {
          return finish(new Error(JSON.stringify(msg.error || msg.reason || msg).slice(0, 350)));
        }
        finish(null, msg);
      }
      ws.addEventListener("message", onMessage);
      timeout = setTimeout(() => finish(new Error("Server-Timeout")), cfg.commandTimeoutMs);
      try {
        // Nur zwei zuvor im realen Spiel geprüfte Befehle werden verwendet.
        // Das unveränderte ws.send erlaubt Garden Companion, Geschütztes zu sperren.
        ws.send(JSON.stringify({
          scopePath: ["Room", "Quinoa"],
          type: "QuinoaCommand", requestId, commandSequence: 0, command
        }));
      } catch (error) { finish(error); }
    });
  }
  async function harvest(target) {
    const result = await sendCommand({
      type: "HarvestCrop", slot: target.tile, slotsIndex: target.slotsIndex,
      cropItemId: crypto.randomUUID()
    });
    state.harvested += result.itemGains?.length || 1;
    state.cooldowns.set(target.key, Date.now() + cfg.harvestedSlotCooldownMs);
  }
  async function sell() {
    const result = await sendCommand({ type: "SellAllCrops" });
    state.sold++;
    state.coins += Number(result.currencyGains?.coins) || 0;
  }

  // ===== Anti-AFK, vorsichtig und ehrlich: kein "echtes" Benutzerevent =====
  // Synthetic Mouse/PointerEvents haben isTrusted=false. Der Server kann
  // diese ignorieren. Es gibt keine gesicherte Magic-Garden-AFK-API.
  function recordRealInput(event) {
    if (event.isTrusted) state.lastRealInput = Date.now();
  }
  for (const type of ["pointerdown", "pointermove", "keydown", "wheel"]) {
    window.addEventListener(type, recordRealInput, { capture: true, passive: true });
  }
  function antiAfkPulse() {
    if (!state.running || !prefs.antiAfk || !getSocket()) return;
    const now = Date.now();
    if (now - state.lastRealInput < cfg.antiAfkOnlyAfterNoRealInputMs) return;
    if (state.lastAntiAfk && now - state.lastAntiAfk < cfg.antiAfkEveryMs) return;
    const target = document.querySelector("canvas") || document.body;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    try {
      // Nur Bewegung, keine Klicks, keine Tasten, keine echten Cursor-Bewegungen.
      // Simulierte Events werden NICHT als "trusted" ausgegeben.
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, pointerType: "mouse", clientX: x, clientY: y
        }));
      }
      target.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true, clientX: x, clientY: y
      }));
      state.antiAfkTicks++;
      state.lastAntiAfk = now;
    } catch (error) {
      console.warn("[MG V13] Anti-AFK-Impuls fehlgeschlagen:", error);
    }
  }

  // ===== Hintergrundbetrieb / Sichtbarkeit =====
  document.addEventListener("visibilitychange", () => {
    state.hidden = document.hidden;
    updatePanel();
  });
  window.addEventListener("focus", updatePanel);
  function scanDelay() {
    return document.hidden ? cfg.hiddenScanMs : cfg.scanMs;
  }
  async function waitTick(ms) {
    const before = Date.now();
    await sleep(document.hidden ? Math.max(ms, 1000) : ms);
    state.wakeLagMs = Math.max(0, Date.now() - before - (document.hidden ? Math.max(ms, 1000) : ms));
  }

  // ===== Wiederverbindung: zunächst Spiel selbst reconnecten lassen =====
  function reloadBudgetAvailable() {
    const now = Date.now();
    const recent = readJSON(sessionStorage, KEYS.reloads, [])
      .filter(t => Number.isFinite(t) && t > now - cfg.reloadWindowMs);
    storeJSON(sessionStorage, KEYS.reloads, recent);
    return recent.length < cfg.reloadLimit;
  }
  function controlledReload() {
    if (!prefs.autoReload || !state.running || !state.connectedOnce || state.reloadRequested) return false;
    if (navigator.onLine === false) return false;
    if (!reloadBudgetAvailable()) {
      state.connection = "Offline – Reload-Limit erreicht";
      return false;
    }
    const history = readJSON(sessionStorage, KEYS.reloads, []);
    history.push(Date.now());
    storeJSON(sessionStorage, KEYS.reloads, history);
    persistTimer();
    storeValue(sessionStorage, KEYS.resume, "1");
    state.connection = "Neuladen für Reconnect …";
    console.warn("[MG V13] Länger offline: Seite wird kontrolliert neu geladen.");
    state.reloadRequested = true;
    location.reload();
    return true;
  }
  let lastWs = null;
  async function ensureReady() {
    const ws = getSocket();
    const snapshot = window.__qpmGardenSnapshot__?.tileObjects;
    if (!ws || !snapshot) {
      if (!ws) {
        if (state.offlineSince === null) state.offlineSince = Date.now();
        state.connection = "Verbindung verloren – warte …";
        if (Date.now() - state.offlineSince >= cfg.offlineReloadAfterMs) {
          controlledReload();
          // Bis zum Reload keine Befehle senden.
        }
      } else {
        state.connection = "Warte auf Garten-Daten";
      }
      await waitTick(Math.min(10000, Math.max(1500,
        state.offlineSince ? Math.floor((Date.now() - state.offlineSince) / 10) : 1500)));
      return false;
    }
    if (state.offlineSince !== null) state.reconnects++;
    state.reloadRequested = false;
    state.offlineSince = null;
    state.connectedOnce = true;
    state.connection = "Verbunden";
    state.lastOnline = Date.now();
    if (ws !== lastWs) lastWs = ws;
    return true;
  }

  // ===== Fehler-Recovery: Schutz respektieren, backoff, Circuit Breaker =====
  async function handleError(error, target) {
    const msg = errorText(error);
    const protectedCrop = !!target && looksProtected(error);
    state.errors++;
    state.lastError = msg;
    if (target) {
      state.cooldowns.set(target.key, Date.now() +
        (protectedCrop ? cfg.protectedSlotCooldownMs : cfg.failedSlotCooldownMs));
    }
    if (protectedCrop) {
      state.protectedSkips++;
      state.consecutiveErrors = 0;
      console.info("[MG V13] Geschützte Pflanze übersprungen; Companion-Schutz bleibt aktiv.");
      await waitTick(250);
      return;
    }
    if (isNetworkError(error)) {
      // Erst prüfen, ob ein neuer WebSocket erscheint. Kein eigener WS-Neuaufbau.
      if (!getSocket() && state.offlineSince === null) state.offlineSince = Date.now();
    }
    state.consecutiveErrors++;
    console.warn("[MG V13] Fehler:", msg);
    if (state.consecutiveErrors >= cfg.breakerAfterErrors) {
      state.breakerUntil = Date.now() + cfg.breakerMs;
      state.consecutiveErrors = 0;
      state.connection = "Sicherheitspause nach Fehlern";
      console.warn("[MG V13] 60 Sekunden Sicherheitspause.");
    }
    await waitTick(Math.min(15000, 1000 * 2 ** Math.min(state.consecutiveErrors, 4)));
  }

  // ===== Steuerung; genau ein Befehl gleichzeitig =====
  async function loop() {
    if (state.busy) return;
    state.busy = true;
    let lastSellCheck = 0;
    try {
      while (state.running) {
        state.lastLoopAt = Date.now();
        let attempted = null;
        try {
          if (!(await ensureReady())) continue;
          if (!state.running) break;
          antiAfkPulse();
          if (Date.now() < state.breakerUntil) {
            state.connection = "Sicherheitspause";
            await waitTick(Math.min(2000, state.breakerUntil - Date.now()));
            continue;
          }
          state.connection = "Verbunden";
          if (Date.now() - lastSellCheck >= cfg.sellEveryMs) {
            lastSellCheck = Date.now();
            if (getProduce().length >= cfg.sellThreshold) {
              await sell();
              state.consecutiveErrors = 0;
              await waitTick(500);
              continue;
            }
          }
          attempted = findReadyCrop();
          if (!attempted) {
            await waitTick(scanDelay());
            continue;
          }
          await harvest(attempted);
          state.consecutiveErrors = 0;
          await waitTick(prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs);
        } catch (error) {
          await handleError(error, attempted);
        }
      }
    } finally {
      state.busy = false;
      stopTimer();
      updatePanel();
    }
  }

  function start({ auto = false } = {}) {
    if (state.running || state.busy) return;
    state.running = true;
    state.autoResumed = auto;
    state.consecutiveErrors = 0;
    state.breakerUntil = 0;
    state.reloadRequested = false;
    storeValue(sessionStorage, KEYS.resume, "1");
    startTimer();
    updatePanel();
    void loop();
    console.log(`[MG V13] ${auto ? "Auto-Resume" : "Start"} aktiviert.`);
  }
  function stop() {
    state.running = false;
    storeValue(sessionStorage, KEYS.resume, "0");
    stopTimer();
    updatePanel();
    console.log("[MG V13] Stop angefordert.");
  }
  function onHotkey(event) {
    if (event.code !== "F8" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
    event.preventDefault();
    if (state.running) stop();
    else start();
  }
  window.addEventListener("keydown", onHotkey, true);

  // ===== Bedienoberfläche =====
  let panel = null;
  let body = null;
  let fieldCount = null;
  let headline = null;
  const fieldButtons = [];
  let collapsed = readValue(localStorage, KEYS.collapsed) === "true";

  function btn(label, callback) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.style.cssText = "flex:1;min-width:0;padding:9px 5px;background:#294b38;color:#fff;border:1px solid #456052;border-radius:7px;cursor:pointer;font:12px Arial,sans-serif";
    el.addEventListener("click", callback);
    return el;
  }
  function checkbox(label, checked, onChange) {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;margin:8px 0";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => { onChange(input.checked); persistPrefs(); updatePanel(); });
    const text = document.createElement("span");
    text.textContent = label;
    row.append(input, text);
    return row;
  }
  function updatePanel() {
    if (!panel) return;
    const status = panel.querySelector("#mg13-status");
    const stats = panel.querySelector("#mg13-stats");
    if (status) status.textContent = state.running ? "🟢 Aktiv" : state.busy ? "🟡 Stoppt …" : "🔴 Gestoppt";
    if (headline) headline.textContent = state.running ? "🌱 V13 · Aktiv" : "🌱 Magic Garden V13";
    if (stats) stats.textContent =
      `Felder: ${selectedSlots().size} / 200\n` +
      `Geerntet: ${state.harvested}\n` +
      `Verkäufe: ${state.sold}\n` +
      `Coins: ${state.coins.toLocaleString("de-DE")}\n` +
      `Verkaufbare Items: ${getProduce().length}\n` +
      `Fehler: ${state.errors}  ·  Schutz-Skips: ${state.protectedSkips}\n` +
      `⏱ Laufzeit: ${formatTime(runtimeMs())}\n` +
      `⚡ Erntepause: ${prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs} ms\n` +
      `📡 Antwort: ${state.lastResponseMs} ms (Ø ${Math.round(state.averageResponseMs)} ms)\n` +
      `🔌 ${state.connection}\n` +
      `🔁 Reconnects: ${state.reconnects}\n` +
      `🖥 Tab: ${document.hidden ? "Hintergrund (gedrosselt möglich)" : "Sichtbar"}\n` +
      `🛡 Anti-AFK-Impulse: ${state.antiAfkTicks} (nicht garantiert)\n` +
      `⌨ F8 = Start / Stop`;
    if (fieldCount) fieldCount.textContent = `Ausgewählt: ${selectedSlots().size} / 200`;
  }
  function repaintFields() {
    for (const { el, side, i } of fieldButtons) {
      const active = selection[side].has(i);
      el.style.background = active ? "#237c49" : "#1b2a23";
      el.style.borderColor = active ? "#65d88c" : "#456052";
    }
    updatePanel();
  }
  function makeGrid(side, parent) {
    const label = document.createElement("div");
    label.textContent = side === "left" ? "Linkes Feld" : "Rechtes Feld";
    label.style.cssText = "font-weight:bold;margin:12px 0 7px";
    parent.appendChild(label);
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px";
    for (let i = 0; i < 100; i++) {
      const el = btn(String(i + 1), () => {
        if (selection[side].has(i)) selection[side].delete(i);
        else selection[side].add(i);
        saveSelection();
        repaintFields();
      });
      el.title = `${side === "left" ? "Links" : "Rechts"}: Reihe ${Math.floor(i / 10) + 1}, Spalte ${i % 10 + 1}`;
      el.style.cssText = "aspect-ratio:1;min-width:0;padding:0;border:1px solid;border-radius:4px;color:#fff;font-size:10px;cursor:pointer";
      fieldButtons.push({ el, side, i });
      grid.appendChild(el);
    }
    parent.appendChild(grid);
  }
  function createPanel() {
    if (panel || !document.body) return;
    panel = document.createElement("div");
    panel.id = "mg-autofarm-v13";
    panel.style.cssText = "position:fixed;top:80px;right:20px;width:350px;max-width:calc(100vw - 40px);max-height:85vh;overflow-y:auto;box-sizing:border-box;padding:15px;background:#101c17;color:#e9fff1;border:1px solid #3a7856;border-radius:14px;z-index:2147483647;font:13px Arial,sans-serif;box-shadow:0 8px 30px #0009";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px";
    headline = document.createElement("strong");
    headline.textContent = "🌱 Magic Garden V13";
    headline.style.fontSize = "16px";
    const toggle = btn(collapsed ? "+" : "−", () => {
      collapsed = !collapsed;
      storeValue(localStorage, KEYS.collapsed, String(collapsed));
      body.style.display = collapsed ? "none" : "";
      toggle.textContent = collapsed ? "+" : "−";
    });
    toggle.style.cssText += ";flex:none;padding:5px 12px;font-size:18px";
    header.append(headline, toggle);
    panel.appendChild(header);

    body = document.createElement("div");
    body.style.display = collapsed ? "none" : "";
    body.innerHTML = '<div id="mg13-status" style="margin:12px 0">🔴 Gestoppt</div>' +
      '<pre id="mg13-stats" style="font:12px monospace;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere"></pre>';

    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:8px;margin:10px 0 14px";
    const startBtn = btn("▶ Start", () => start());
    startBtn.style.background = "#237c49";
    const stopBtn = btn("■ Stop", stop);
    stopBtn.style.background = "#a93232";
    controls.append(startBtn, stopBtn);
    body.appendChild(controls);

    const toggles = document.createElement("div");
    toggles.style.cssText = "border-top:1px solid #355342;padding:10px 0";
    toggles.append(
      checkbox("Adaptive Geschwindigkeit", prefs.adaptive, v => { prefs.adaptive = v; }),
      checkbox("Anti-AFK-Impulse (experimentell)", prefs.antiAfk, v => { prefs.antiAfk = v; }),
      checkbox("Auto-Neuladen bei längerem Offline", prefs.autoReload, v => { prefs.autoReload = v; })
    );
    const note = document.createElement("small");
    note.textContent = "Anti-AFK nutzt künstliche Mausbewegungen ohne Klicks; kein garantierter Schutz vor AFK-Kicks. Hintergrund-Tabs können vom Browser gebremst werden.";
    note.style.cssText = "color:#a8b9ae;display:block;line-height:1.4;margin-top:5px";
    toggles.appendChild(note);
    body.appendChild(toggles);

    const fields = document.createElement("div");
    fields.style.cssText = "border-top:1px solid #355342;padding-top:12px";
    const fieldTitle = document.createElement("strong");
    fieldTitle.textContent = "🌿 Feldauswahl";
    fields.appendChild(fieldTitle);
    fieldCount = document.createElement("div");
    fieldCount.style.marginTop = "8px";
    fields.appendChild(fieldCount);
    makeGrid("left", fields);
    makeGrid("right", fields);
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;margin-top:12px";
    actions.append(
      btn("Alle", () => {
        for (const side of ["left", "right"])
          selection[side] = new Set(Array.from({ length: 100 }, (_, i) => i));
        saveSelection(); repaintFields();
      }),
      btn("Keine", () => {
        selection.left.clear(); selection.right.clear();
        saveSelection(); repaintFields();
      }),
      btn("Speichern", () => { saveSelection(); console.log("[MG V13] Feldauswahl gespeichert."); })
    );
    fields.appendChild(actions);
    body.appendChild(fields);
    panel.appendChild(body);
    document.body.appendChild(panel);
    repaintFields();
    setInterval(updatePanel, 1000);
  }

  // ===== Konsole =====
  window.MGAutoFarmV13 = {
    state, cfg, prefs, start, stop, selectedSlots,
    status() {
      const details = {
        Aktiv: state.running,
        Verbunden: !!getSocket(),
        Verbindung: state.connection,
        Hintergrund: document.hidden,
        Felder: selectedSlots().size,
        Geerntet: state.harvested,
        Verkaeufe: state.sold,
        Coins: state.coins,
        Laufzeit: formatTime(runtimeMs()),
        ErntepauseMs: prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs,
        LetzteAntwortMs: state.lastResponseMs,
        AntiAFKImpulse: state.antiAfkTicks,
        Reconnects: state.reconnects,
        SchutzUebersprungen: state.protectedSkips,
        Fehler: state.errors,
        LetzterFehler: state.lastError
      };
      console.table(details);
      return details;
    }
  };

  if (document.body) createPanel();
  else document.addEventListener("DOMContentLoaded", createPanel, { once: true });

  // Auto-Resume: nur wenn in diesem Tab beim Reload vorher aktiv.
  if (readValue(sessionStorage, KEYS.resume) === "1") {
    start({ auto: true });
  }
  console.log("✅ Magic Garden AutoFarm V13 geladen (Garden Companion erforderlich).");
})();
