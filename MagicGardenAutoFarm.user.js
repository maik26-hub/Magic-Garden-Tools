// ==UserScript==
// @name         Magic Garden AutoFarm
// @namespace    mg-autofarm-local
// @version      13.2.3
// @updateURL   https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js
// @downloadURL https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js
// @description  V13.2.3: Rejected-Harvest-Fix, Drag-Feldauswahl, Auto-Sell, Self-Healing
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
    reloads: "magic_garden_v13_reload_history",         // sessionStorage
    panelPosition: "magic_garden_v13_panel_position"   // localStorage
  };

  const cfg = {
    scanMs: 500,
    hiddenScanMs: 1500,           // Browser darf Hintergrund-Timer weiter drosseln
    sellThreshold: 40,
    sellEveryMs: 2000,
    commandTimeoutMs: 6000,
    harvestedSlotCooldownMs: 5000,
    failedSlotCooldownMs: 60000,
    rejectedSlotCooldownMs: 10 * 60000,
    rejectionBurstThreshold: 3,
    rejectionBurstPauseMs: 30000,
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

  const VERSION = "13.2.3";
  const UPDATE_URL = "https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js";
  const NUMBER_FIELDS = Object.freeze({
    sellThreshold: { min: 5, max: 200, step: 1 },
    sellIntervalMs: { min: 500, max: 30000, step: 500 },
    minHarvestDelayMs: { min: 50, max: 1000, step: 5 },
    maxHarvestDelayMs: { min: 100, max: 3000, step: 5 },
    stallAfterMs: { min: 30000, max: 300000, step: 1000 }
  });
  function validatedNumber(input, fallback, bounds) {
    const value = Number(input);
    if (!Number.isFinite(value)) return fallback;
    return Math.round(clamp(value, bounds.min, bounds.max) / bounds.step) * bounds.step;
  }
  const savedPrefs = readJSON(localStorage, KEYS.prefs, {});
  const prefs = {
    antiAfk: savedPrefs.antiAfk !== false,
    autoReload: savedPrefs.autoReload !== false,
    adaptive: savedPrefs.adaptive !== false,
    selfHealing: savedPrefs.selfHealing !== false,
    sellThreshold: validatedNumber(savedPrefs.sellThreshold, cfg.sellThreshold, NUMBER_FIELDS.sellThreshold),
    sellIntervalMs: validatedNumber(savedPrefs.sellIntervalMs, cfg.sellEveryMs, NUMBER_FIELDS.sellIntervalMs),
    minHarvestDelayMs: validatedNumber(savedPrefs.minHarvestDelayMs, cfg.adaptive.minMs, NUMBER_FIELDS.minHarvestDelayMs),
    maxHarvestDelayMs: validatedNumber(savedPrefs.maxHarvestDelayMs, cfg.adaptive.maxMs, NUMBER_FIELDS.maxHarvestDelayMs),
    stallAfterMs: validatedNumber(savedPrefs.stallAfterMs, 90000, NUMBER_FIELDS.stallAfterMs)
  };
  prefs.minHarvestDelayMs = Math.min(prefs.minHarvestDelayMs, prefs.maxHarvestDelayMs);
  const persistPrefs = () => storeJSON(localStorage, KEYS.prefs, prefs);
  function setNumberPreference(key, input) {
    const limits = NUMBER_FIELDS[key];
    if (!limits) throw new Error("Unbekannte Einstellung");
    prefs[key] = validatedNumber(input, prefs[key], limits);
    if (prefs.minHarvestDelayMs > prefs.maxHarvestDelayMs) {
      if (key === "minHarvestDelayMs") prefs.maxHarvestDelayMs = prefs.minHarvestDelayMs;
      else prefs.minHarvestDelayMs = prefs.maxHarvestDelayMs;
    }
    state.currentDelay = clamp(state.currentDelay, prefs.minHarvestDelayMs, prefs.maxHarvestDelayMs);
    persistPrefs();
    updatePanel();
    return prefs[key];
  }

  const state = {
    running: false,
    busy: false,
    harvested: 0,
    sold: 0,
    coins: 0,
    errors: 0,
    protectedSkips: 0,
    rejectedHarvests: 0,
    rejectionStreak: 0,
    lastRejection: "",
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
    reloadRequested: false,
    lastHarvestAt: null,
    ripeSince: null,
    lastSelfHealAt: null,
    selfHealAttempts: 0,
    selfHealChecks: 0,
    sessionEpoch: 0
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
  // Timer kann im laufenden Betrieb zurueckgesetzt werden, ohne den Bot anzuhalten.
  // Ein erneuter Start/F5 setzt anschliessend bei 00:00:00 an.
  function resetTimer() {
    elapsedMs = 0;
    if (timerStartAt !== null) timerStartAt = Date.now();
    persistTimer();
    updatePanel();
    return formatTime(runtimeMs());
  }
  // Nur lokale Session-Zaehler; keine Aenderung am Coin-Kontostand im Spiel.
  // Der Farming-Loop und der Pflanzenschutz werden nicht zurueckgesetzt.
  function resetSession() {
    state.sessionEpoch++;
    resetTimer();
    for (const key of [
      "harvested", "sold", "coins", "errors", "protectedSkips", "rejectedHarvests",
      "reconnects", "antiAfkTicks", "selfHealChecks", "speedAdjustments",
      "lastResponseMs", "averageResponseMs"
    ]) state[key] = 0;
    state.lastError = "";
    state.lastRejection = "";
    state.rejectionStreak = 0;
    state.successStreak = 0;
    state.lastHarvestAt = null;
    state.ripeSince = null;
    state.lastSelfHealAt = null;
    state.selfHealAttempts = 0;
    updatePanel();
    console.info("[MG V13.2.1] Session zurueckgesetzt; AutoFarm bleibt aktiv.");
    return {
      laufzeit: formatTime(runtimeMs()),
      geerntet: state.harvested,
      verkaeufe: state.sold,
      coins: state.coins
    };
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
      state.currentDelay = Math.min(prefs.maxHarvestDelayMs, before + a.slowDownMs * 2);
    } else if (responseMs >= a.slowResponseMs) {
      state.successStreak = 0;
      state.currentDelay = Math.min(prefs.maxHarvestDelayMs, before + a.slowDownMs);
    } else if (responseMs <= a.fastResponseMs) {
      if (++state.successStreak >= a.successesToSpeedUp) {
        state.currentDelay = Math.max(prefs.minHarvestDelayMs, before - a.speedUpMs);
        state.successStreak = 0;
      }
    } else {
      state.successStreak = 0;
    }
    if (state.currentDelay !== before) state.speedAdjustments++;
  }

  // "rejected" bedeutet nur: HarvestCrop wurde abgelehnt.
  // Es ist KEIN Beweis fuer Server-Lag oder geschuetzte Pflanzen.
  function isHarvestRejected(error) {
    return error?.commandType === "HarvestCrop" &&
      error?.code === "rejected";
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
        if (command.type === "HarvestCrop" &&
            (!err || (!isHarvestRejected(err) && !looksProtected(err)))) {
          // Harte Ablehnungen sind kein Signal fuer eine zu kurze Erntepause.
          adjustSpeed(performance.now() - sentAt, !err, false);
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
          const code = typeof msg.code === "string" ? msg.code :
            typeof msg.error?.code === "string" ? msg.error.code : "";
          const kind = typeof msg.commandType === "string" ? msg.commandType : command.type;
          const reason = code || (typeof msg.reason === "string" ? msg.reason :
            typeof msg.error === "string" ? msg.error : "unbekannt");
          // Keine requestId oder Rohdaten in Logs/Diagnosen kopieren.
          const error = new Error(`${kind}: ${String(reason).slice(0, 100)}`);
          error.code = code;
          error.commandType = kind;
          return finish(error);
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
    const epoch = state.sessionEpoch;
    const result = await sendCommand({
      type: "HarvestCrop", slot: target.tile, slotsIndex: target.slotsIndex,
      cropItemId: crypto.randomUUID()
    });
    if (epoch === state.sessionEpoch) {
      state.harvested += result.itemGains?.length || 1;
    }
    // Bestaetigte Ernte weiterhin im Cooldown respektieren – selbst bei Reset.
    state.cooldowns.set(target.key, Date.now() + cfg.harvestedSlotCooldownMs);
    state.lastHarvestAt = Date.now();
    state.rejectionStreak = 0;
    state.ripeSince = null;
    state.lastSelfHealAt = null;
    state.selfHealAttempts = 0;
  }
  async function sell() {
    const epoch = state.sessionEpoch;
    const result = await sendCommand({ type: "SellAllCrops" });
    if (epoch !== state.sessionEpoch) return;
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
    const rejectedCrop = !!target && isHarvestRejected(error);
    const protectedCrop = !!target && !rejectedCrop && looksProtected(error);

    if (rejectedCrop) {
      // Ablehnung ist nicht automatisch ein Verbindungs- oder Geschwindigkeitsfehler.
      // Den Ernte-Slot in Ruhe lassen und NICHT den Pflanzenschutz umgehen.
      state.rejectedHarvests++;
      state.rejectionStreak++;
      state.lastRejection = msg;
      state.cooldowns.set(target.key, Date.now() + cfg.rejectedSlotCooldownMs);
      state.consecutiveErrors = 0;
      if (state.rejectionStreak >= cfg.rejectionBurstThreshold) {
        state.breakerUntil = Math.max(state.breakerUntil,
          Date.now() + cfg.rejectionBurstPauseMs);
        state.connection = "Ernten abgelehnt – Sicherheitspause";
        state.rejectionStreak = 0;
        console.warn("[MG V13.2.3] Mehrere Ernten abgelehnt – 30s Sicherheitspause. Pflanzenschutz bleibt aktiv.");
      } else if (state.rejectedHarvests <= 3 || state.rejectedHarvests % 10 === 0) {
        console.info("[MG V13.2.3] Ernte abgelehnt – Slot wird 10 Minuten ausgelassen (Zaehler: " +
          state.rejectedHarvests + ").");
      }
      await waitTick(350);
      return;
    }

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

  // ===== Self-Healing: nur bei ANHALTEND erntebereiten, ungeschuetzten Pflanzen =====
  // Geschuetzte Pflanzen und aktive Cooldowns zaehlen nicht als Stau.
  // Der erste Eingriff ist eine Sicherheitspause; erst ein zweiter Stau darf
  // den bestehenden, begrenzten Reload-Weg benutzen (wenn aktiviert).
  function checkSelfHealing(target) {
    if (!prefs.selfHealing || !target) {
      state.ripeSince = null;
      state.selfHealAttempts = 0;
      return false;
    }
    const now = Date.now();
    if (state.ripeSince === null) state.ripeSince = now;
    if (now - state.ripeSince < prefs.stallAfterMs) return false;
    if (state.lastSelfHealAt !== null &&
        now - state.lastSelfHealAt < prefs.stallAfterMs) return false;

    state.lastSelfHealAt = now;
    state.selfHealAttempts++;
    state.selfHealChecks++;

    // Nur ABGELAUFENE Cooldowns bereinigen. Pflanzenschutz bleibt intakt.
    for (const [key, until] of state.cooldowns) {
      if (until <= now) state.cooldowns.delete(key);
    }
    state.successStreak = 0;
    state.currentDelay = Math.min(prefs.maxHarvestDelayMs,
      Math.max(state.currentDelay, cfg.adaptive.initialMs + 50));

    if (state.selfHealAttempts >= 2 && prefs.autoReload && state.connectedOnce) {
      state.connection = "Self-Healing: kontrollierter Reconnect";
      if (controlledReload()) return true;
    }
    state.connection = "Self-Healing: kurze Sicherheitspause";
    state.breakerUntil = Math.max(state.breakerUntil, now + 3000);
    console.warn("[MG V13.2] Erntestau erkannt: pruefe Verbindung/Status, pausiere kurz.");
    return true;
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
          if (Date.now() - lastSellCheck >= prefs.sellIntervalMs) {
            lastSellCheck = Date.now();
            if (getProduce().length >= prefs.sellThreshold) {
              await sell();
              state.consecutiveErrors = 0;
              await waitTick(500);
              continue;
            }
          }
          attempted = findReadyCrop();
          if (!attempted) {
            checkSelfHealing(null);
            await waitTick(scanDelay());
            continue;
          }
          if (checkSelfHealing(attempted)) {
            await waitTick(500);
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

  // ===== Update-Erkennung: Lesender Abruf; Installation macht Tampermonkey =====
  const updateInfo = { checkedAt: 0, status: "Noch nicht geprueft", newer: null };
  let updateRunning = false;
  function parseVersion(source) {
    return String(source).match(/^\s*\/\/\s*@version\s+(\d+\.\d+\.\d+)\b/m)?.[1] || null;
  }
  function compareVersions(a, b) {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    }
    return 0;
  }
  async function checkForUpdate(force = false) {
    if (updateRunning || (!force && Date.now() - updateInfo.checkedAt < 6 * 3600000)) {
      return { ...updateInfo };
    }
    updateRunning = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(UPDATE_URL, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const remote = parseVersion(await response.text());
      if (!remote) throw new Error("Versionsnummer fehlt");
      updateInfo.newer = compareVersions(remote, VERSION) > 0 ? remote : null;
      updateInfo.status = updateInfo.newer
        ? "Update verfuegbar: V" + remote
        : "Aktuell (main: V" + remote + ")";
    } catch (error) {
      updateInfo.status = "Update-Check nicht moeglich";
      updateInfo.newer = null;
    } finally {
      clearTimeout(timeout);
      updateInfo.checkedAt = Date.now();
      updateRunning = false;
      updatePanel();
    }
    return { ...updateInfo };
  }

  // ===== Diagnose OHNE IDs, Chat, Koordinaten, Inventarinhalte oder Token =====
  function getDiagnostics() {
    const tiles = window.__qpmGardenSnapshot__?.tileObjects;
    const errorKind = !state.lastError ? "none" :
      looksProtected(state.lastError) ? "protected" :
      isNetworkError(state.lastError) ? "connection" : "other";
    return {
      tool: "Magic Garden AutoFarm",
      version: VERSION,
      timestamp: new Date().toISOString(),
      running: state.running,
      connection: state.connection,
      socketOpen: !!getSocket(),
      snapshotAvailable: !!tiles,
      snapshotTileCount: tiles ? Object.keys(tiles).length : 0,
      tabHidden: !!document.hidden,
      selectedFieldCount: selectedSlots().size,
      readyProduceCount: getProduce().length,
      harvestedCount: state.harvested,
      salesCount: state.sold,
      errorCount: state.errors,
      rejectedHarvestCount: state.rejectedHarvests,
      errorCategory: errorKind,
      protectedSkipCount: state.protectedSkips,
      reconnectCount: state.reconnects,
      selfHealingChecks: state.selfHealChecks,
      adaptiveDelayMs: prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs,
      averageServerResponseMs: Math.round(state.averageResponseMs),
      runtimeSeconds: Math.floor(runtimeMs() / 1000)
    };
  }
  async function copyDiagnostics() {
    const report = JSON.stringify(getDiagnostics(), null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API fehlt");
      await navigator.clipboard.writeText(report);
      if (diagnosticStatus) diagnosticStatus.textContent = "Diagnose kopiert (ohne private Spieldaten).";
    } catch {
      console.info("[MG V13.2] Diagnose zum Kopieren:\n" + report);
      if (diagnosticStatus) diagnosticStatus.textContent = "Kopieren gesperrt: Diagnose steht in der Konsole.";
    }
  }

  // ===== Bedienoberfläche =====
  let panel = null;
  let body = null;
  let fieldCount = null;
  let headline = null;
  let updateStatus = null;
  let updateLink = null;
  let diagnosticStatus = null;
  const fieldButtons = [];
  let collapsed = readValue(localStorage, KEYS.collapsed) === "true";

  // ===== V13.1: Menue via Titelleiste ziehen, Position nach F5 behalten =====
  function positionPanel(left, top, persist = true) {
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - bounds.width - 8);
    // Die Titelleiste soll sichtbar bleiben. Ist das Panel tiefer platziert,
    // wird der scrollbare Inhalt verkleinert statt die Bewegung zu blockieren.
    const maxY = Math.max(8, window.innerHeight - 84);
    const x = clamp(Math.round(left), 8, maxX);
    const y = clamp(Math.round(top), 8, maxY);
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    panel.style.maxHeight = `${Math.min(Math.floor(window.innerHeight * 0.85),
      Math.max(76, window.innerHeight - y - 8))}px`;
    if (persist) storeJSON(localStorage, KEYS.panelPosition, { left: x, top: y });
  }

  function installPanelDragging(header) {
    header.style.cursor = "grab";
    header.style.userSelect = "none";
    header.style.touchAction = "none";
    header.title = "Hier ziehen, um das Menue zu verschieben";
    let drag = null;

    header.addEventListener("pointerdown", event => {
      // Plus/Minus bleibt ein normaler Button und startet keinen Drag.
      if (event.button !== 0 || event.isPrimary === false ||
          event.target?.closest?.("button")) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      header.style.cursor = "grabbing";
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    header.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      positionPanel(
        drag.left + event.clientX - drag.clientX,
        drag.top + event.clientY - drag.clientY,
        false
      );
      event.preventDefault();
    });

    function finishDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      header.style.cursor = "grab";
      const rect = panel.getBoundingClientRect();
      positionPanel(rect.left, rect.top, true);
      if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
    }
    header.addEventListener("pointerup", finishDrag);
    header.addEventListener("pointercancel", finishDrag);
    header.addEventListener("lostpointercapture", finishDrag);
  }

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
    if (headline) headline.textContent = state.running ? "🌱 V13.2.3 · Aktiv" : "🌱 Magic Garden V13.2.3";
    if (stats) stats.textContent =
      `Felder: ${selectedSlots().size} / 200\n` +
      `Geerntet: ${state.harvested}\n` +
      `Verkäufe: ${state.sold}\n` +
      `Coins: ${state.coins.toLocaleString("de-DE")}\n` +
      `Verkaufbare Items: ${getProduce().length}\n` +
      `Fehler: ${state.errors}  ·  Ablehnungen: ${state.rejectedHarvests}\n` +
      `Schutz-Skips: ${state.protectedSkips}\n` +
      `⏱ Laufzeit: ${formatTime(runtimeMs())}\n` +
      `⚡ Erntepause: ${prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs} ms\n` +
      `📡 Antwort: ${state.lastResponseMs} ms (Ø ${Math.round(state.averageResponseMs)} ms)\n` +
      `🔌 ${state.connection}\n` +
      `🔁 Reconnects: ${state.reconnects}\n` +
      `🖥 Tab: ${document.hidden ? "Hintergrund (gedrosselt möglich)" : "Sichtbar"}\n` +
      `🛡 Anti-AFK-Impulse: ${state.antiAfkTicks} (nicht garantiert)\n` +
      `🩺 Self-Healing: ${prefs.selfHealing ? "An" : "Aus"} (${state.selfHealChecks} Prüfungen)\n` +
      `⌨ F8 = Start / Stop`;
    if (fieldCount) fieldCount.textContent = `Ausgewählt: ${selectedSlots().size} / 200`;
    if (updateStatus) updateStatus.textContent = updateInfo.status;
    if (updateLink) updateLink.style.display = updateInfo.newer ? "inline-block" : "none";
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
    grid.style.cssText = "display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px;touch-action:none";
    for (let i = 0; i < 100; i++) {
      const el = btn(String(i + 1), event => {
        // Pointer-Eingaben laufen ueber die Paint-Geste; "click" ist nur fuer
        // Tastatur (Enter/Leertaste, detail===0). Kein doppeltes Umschalten.
        if (event.detail !== 0) return;
        if (selection[side].has(i)) selection[side].delete(i);
        else selection[side].add(i);
        saveSelection();
        repaintFields();
      });
      el.dataset.mgField = "1";
      el.dataset.side = side;
      el.dataset.index = String(i);
      el.title = `${side === "left" ? "Links" : "Rechts"}: Reihe ${Math.floor(i / 10) + 1}, Spalte ${i % 10 + 1}`;
      el.style.cssText = "aspect-ratio:1;min-width:0;padding:0;border:1px solid;border-radius:4px;color:#fff;font-size:10px;cursor:pointer;touch-action:none;user-select:none";
      fieldButtons.push({ el, side, i });
      grid.appendChild(el);
    }
    parent.appendChild(grid);
  }

  // ===== V13.2.2: Auswaehlen/Abwaehlen durch Gedrueckthalten und Ziehen =====
  // Ein Stroke waehlt genau EINEN Modus (markieren ODER entfernen), abhaengig
  // vom Startfeld. Jedes Feld wird dabei hoechstens einmal bearbeitet.
  // Pointer-Capture haelt die Geste auch beim Wechsel zwischen beiden Grids.
  function installFieldPainting(container) {
    let stroke = null;

    function hitFromElement(el) {
      const button = el?.closest?.("[data-mg-field]");
      if (!button || !container.contains(button)) return null;
      const side = button.dataset.side;
      const index = Number(button.dataset.index);
      if (!["left", "right"].includes(side) ||
          !Number.isInteger(index) || index < 0 || index >= 100) return null;
      return { button, side, index };
    }

    function paint(hit) {
      if (!stroke || !hit) return;
      const key = `${hit.side}:${hit.index}`;
      if (stroke.visited.has(key)) return;
      stroke.visited.add(key);
      const chosen = selection[hit.side];
      if (chosen.has(hit.index) === stroke.select) return;
      if (stroke.select) chosen.add(hit.index);
      else chosen.delete(hit.index);
      hit.button.style.background = stroke.select ? "#237c49" : "#1b2a23";
      hit.button.style.borderColor = stroke.select ? "#65d88c" : "#456052";
      stroke.changed = true;
      if (fieldCount) {
        fieldCount.textContent =
          `Ausgewählt: ${selection.left.size + selection.right.size} / 200`;
      }
    }

    function paintAlongPath(x, y) {
      if (!stroke) return;
      const from = stroke.last;
      const distance = Math.hypot(x - from.x, y - from.y);
      // Auch bei schneller Bewegung Zwischenfelder erfassen.
      const steps = Math.max(1, Math.min(350, Math.ceil(distance / 7)));
      for (let n = 1; n <= steps; n++) {
        const fx = from.x + (x - from.x) * n / steps;
        const fy = from.y + (y - from.y) * n / steps;
        paint(hitFromElement(document.elementFromPoint(fx, fy)));
      }
      stroke.last = { x, y };
    }

    function finish(event) {
      if (!stroke || (event?.pointerId != null &&
          event.pointerId !== stroke.pointerId)) return;
      if (event?.type === "pointerup") {
        paintAlongPath(event.clientX, event.clientY);
      }
      const pointerId = stroke.pointerId;
      const changed = stroke.changed;
      stroke = null;
      try {
        if (container.hasPointerCapture?.(pointerId)) {
          container.releasePointerCapture(pointerId);
        }
      } catch { /* Capture wurde bereits vom Browser beendet. */ }
      if (changed) {
        saveSelection();
        updatePanel();
      }
    }

    container.addEventListener("pointerdown", event => {
      if (stroke || event.button !== 0 || event.isPrimary === false) return;
      const hit = hitFromElement(event.target);
      if (!hit) return;
      stroke = {
        pointerId: event.pointerId,
        select: !selection[hit.side].has(hit.index),
        visited: new Set(),
        last: { x: event.clientX, y: event.clientY },
        changed: false
      };
      paint(hit);
      try { container.setPointerCapture?.(event.pointerId); }
      catch { /* Pointer-Tracking funktioniert innerhalb des Grids weiter. */ }
      event.preventDefault();
    });

    container.addEventListener("pointermove", event => {
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      paintAlongPath(event.clientX, event.clientY);
      event.preventDefault();
    });
    container.addEventListener("pointerup", finish);
    container.addEventListener("pointercancel", finish);
    container.addEventListener("lostpointercapture", finish);
    // Fallback fuer Browser, die kein Pointer-Capture erlauben.
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", () => finish());
  }

  function createPanel() {
    if (panel || !document.body) return;
    panel = document.createElement("div");
    panel.id = "mg-autofarm-v13";
    panel.style.cssText = "position:fixed;top:80px;right:20px;width:350px;max-width:calc(100vw - 40px);max-height:85vh;overflow-y:auto;box-sizing:border-box;padding:15px;background:#101c17;color:#e9fff1;border:1px solid #3a7856;border-radius:14px;z-index:2147483647;font:13px Arial,sans-serif;box-shadow:0 8px 30px #0009";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px";
    headline = document.createElement("strong");
    headline.textContent = "🌱 Magic Garden V13.2.3";
    headline.style.fontSize = "16px";
    const toggle = btn(collapsed ? "+" : "−", () => {
      collapsed = !collapsed;
      storeValue(localStorage, KEYS.collapsed, String(collapsed));
      body.style.display = collapsed ? "none" : "";
      toggle.textContent = collapsed ? "+" : "−";
      // Nach Ein-/Ausklappen pruefen, dass das Panel im Bildschirm bleibt.
      if (panel.style.left) {
        const rect = panel.getBoundingClientRect();
        positionPanel(rect.left, rect.top);
      }
    });
    toggle.style.cssText += ";flex:none;padding:5px 12px;font-size:18px";
    header.append(headline, toggle);
    const grip = document.createElement("span");
    grip.textContent = "⠿";
    grip.title = "Zum Verschieben an der Titelleiste ziehen";
    grip.style.cssText = "color:#81d4a0;font-size:20px;margin-right:6px;pointer-events:none";
    header.insertBefore(grip, headline);
    installPanelDragging(header);
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
    const resetButton = btn("↺ Session zurücksetzen (Zeit + Zähler)", resetSession);
    resetButton.title = "Setzt Laufzeit, verdiente Coins, Ernten, Verkäufe und Fehlerzähler zurück. Die Farm läuft weiter.";
    resetButton.style.cssText += ";display:block;width:100%;margin:-3px 0 14px";
    body.appendChild(resetButton);

    const toggles = document.createElement("div");
    toggles.style.cssText = "border-top:1px solid #355342;padding:10px 0";
    toggles.append(
      checkbox("Adaptive Geschwindigkeit", prefs.adaptive, v => { prefs.adaptive = v; }),
      checkbox("Self-Healing bei Erntestau", prefs.selfHealing, v => { prefs.selfHealing = v; }),
      checkbox("Anti-AFK-Impulse (experimentell)", prefs.antiAfk, v => { prefs.antiAfk = v; }),
      checkbox("Auto-Neuladen bei längerem Offline", prefs.autoReload, v => { prefs.autoReload = v; })
    );
    const note = document.createElement("small");
    note.textContent = "Anti-AFK nutzt künstliche Mausbewegungen ohne Klicks; kein garantierter Schutz vor AFK-Kicks. Hintergrund-Tabs können vom Browser gebremst werden.";
    note.style.cssText = "color:#a8b9ae;display:block;line-height:1.4;margin-top:5px";
    toggles.appendChild(note);
    body.appendChild(toggles);

    const settingsPanel = document.createElement("div");
    settingsPanel.style.cssText = "border-top:1px solid #355342;padding:12px 0";
    const settingsTitle = document.createElement("strong");
    settingsTitle.textContent = "⚙ Einstellungen (automatisch gespeichert)";
    settingsPanel.appendChild(settingsTitle);
    function numberControl(label, key, factor = 1) {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;margin:9px 0;font-size:12px";
      const text = document.createElement("span");
      text.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(NUMBER_FIELDS[key].min / factor);
      input.max = String(NUMBER_FIELDS[key].max / factor);
      input.step = String(NUMBER_FIELDS[key].step / factor);
      input.value = String(prefs[key] / factor);
      input.style.cssText = "width:88px;padding:5px;color:#e9fff1;background:#20372a;border:1px solid #456052;border-radius:5px";
      input.addEventListener("change", () => {
        input.value = String(setNumberPreference(key, Number(input.value) * factor) / factor);
      });
      row.append(text, input);
      return row;
    }
    settingsPanel.append(
      numberControl("Auto-Sell ab Items", "sellThreshold"),
      numberControl("Verkaufscheck (Sek.)", "sellIntervalMs", 1000),
      numberControl("Min. Erntepause (ms)", "minHarvestDelayMs"),
      numberControl("Max. Erntepause (ms)", "maxHarvestDelayMs"),
      numberControl("Self-Healing nach (Sek.)", "stallAfterMs", 1000)
    );
    body.appendChild(settingsPanel);

    const tools = document.createElement("div");
    tools.style.cssText = "border-top:1px solid #355342;padding:12px 0";
    const updateHeading = document.createElement("strong");
    updateHeading.textContent = "🔄 GitHub-Update";
    updateStatus = document.createElement("div");
    updateStatus.style.cssText = "margin:8px 0;color:#a8b9ae;font-size:12px";
    updateStatus.textContent = updateInfo.status;
    const updateControls = document.createElement("div");
    updateControls.style.cssText = "display:flex;gap:8px;align-items:center";
    updateControls.appendChild(btn("Update prüfen", () => { void checkForUpdate(true); }));
    updateLink = document.createElement("a");
    updateLink.href = UPDATE_URL;
    updateLink.target = "_blank";
    updateLink.rel = "noopener noreferrer";
    updateLink.textContent = "Installieren";
    updateLink.style.cssText = "display:none;color:#91efb4;font-size:12px";
    updateControls.appendChild(updateLink);
    diagnosticStatus = document.createElement("div");
    diagnosticStatus.style.cssText = "font-size:11px;color:#a8b9ae;margin:6px 0";
    const copyButton = btn("📋 Diagnose kopieren (datensparsam)", () => { void copyDiagnostics(); });
    tools.append(updateHeading, updateStatus, updateControls, copyButton, diagnosticStatus);
    copyButton.style.marginTop = "10px";
    body.appendChild(tools);

    const fields = document.createElement("div");
    fields.style.cssText = "border-top:1px solid #355342;padding-top:12px";
    const fieldTitle = document.createElement("strong");
    fieldTitle.textContent = "🌿 Feldauswahl";
    fields.appendChild(fieldTitle);
    fieldCount = document.createElement("div");
    fieldCount.style.marginTop = "8px";
    fields.appendChild(fieldCount);
    const hint = document.createElement("small");
    hint.textContent = "Feld anklicken oder Maustaste gedrückt halten und darüber ziehen – Startfeld bestimmt Markieren/Entfernen.";
    hint.style.cssText = "display:block;color:#a8b9ae;line-height:1.4;margin-top:6px";
    fields.appendChild(hint);
    makeGrid("left", fields);
    makeGrid("right", fields);
    installFieldPainting(fields);
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
    const savedPosition = readJSON(localStorage, KEYS.panelPosition, null);
    if (Number.isFinite(savedPosition?.left) && Number.isFinite(savedPosition?.top)) {
      positionPanel(savedPosition.left, savedPosition.top, false);
    }
    window.addEventListener("resize", () => {
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      // Bei Groessenaenderung den verschobenen Header erreichbar halten.
      if (panel.style.left) positionPanel(rect.left, rect.top);
    });
    repaintFields();
    setInterval(updatePanel, 1000);
    // Status einmal beim Laden prüfen; danach nur auf Knopfdruck bzw. spaeter pro Sitzung.
    setTimeout(() => { void checkForUpdate(false); }, 2000);
  }

  // ===== Konsole =====
  window.MGAutoFarmV13 = {
    state, cfg, prefs, start, stop, resetTimer, resetSession, selectedSlots, getDiagnostics, checkForUpdate, setNumberPreference,
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
        ErntenAbgelehnt: state.rejectedHarvests,
        SelfHealingPruefungen: state.selfHealChecks,
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
  console.log("✅ Magic Garden AutoFarm V13.2.3 geladen (Garden Companion erforderlich).");
})();
