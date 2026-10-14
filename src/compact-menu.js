/** Presentation only: reuses live controls; never sends a command or enables a module. */
function mountCompactMenu(ui) {
  'use strict';
  const { document: doc, panel, body, header, headline, toggle, grip, controls,
    startButton, stopButton, resetButton, settings, toggles, protectionToggles,
    tools, fields, updateStatus, updateControls, copyButton, diagnosticStatus,
    automationUI: auto, version, storage } = ui;
  const pageKey = 'magic_garden_ui_section_v15';
  const icons = {
    overview: '<path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
    fields: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    farming: '<path d="M12 21v-9M12 16C5 16 3 12 3 6c6 0 9 3 9 8M12 12c0-6 3-9 9-9 0 6-3 9-9 9"/>',
    pets: '<ellipse cx="6" cy="7" rx="2" ry="3"/><ellipse cx="18" cy="7" rx="2" ry="3"/><ellipse cx="3" cy="13" rx="1.5" ry="2"/><ellipse cx="21" cy="13" rx="1.5" ry="2"/><path d="M7 15c2-6 8-6 10 0 5 7-1 7-5 5-4 2-10 2-5-5Z"/>',
    shop: '<path d="M5 8h14l2 13H3L5 8ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    protection: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    journal: '<path d="M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1v15M6 8h2M16 8h2"/>',
    teams: '<circle cx="9" cy="9" r="4"/><path d="M9 1v2M1 9h2M3 3l2 2M15 3l-2 2M18 6v2M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0-1 6Z"/>',
    automation: '<path d="M12 3v3M10 3h4"/><rect x="3" y="6" width="18" height="14" rx="4"/><path d="M7 12h1M16 12h1M8 16h8"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><rect x="7" y="4" width="3" height="4" rx="1"/><rect x="15" y="10" width="3" height="4" rx="1"/><rect x="8" y="16" width="3" height="4" rx="1"/>',
    updates: '<path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M21 21v-5h-5"/>',
    diagnostics: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    grip: '<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>',
  };
  function svg(name) {
    const el = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '1.8');
    el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('aria-hidden', 'true'); el.setAttribute('focusable', 'false');
    // Fixed, local SVG paths only. No data from the game enters innerHTML.
    el.innerHTML = icons[name] || icons.overview; return el;
  }
  function node(tag, cls, text) {
    const el = doc.createElement(tag); if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text; return el;
  }
  function text(el, value) { const next = String(value ?? ''); if (el.textContent !== next) el.textContent = next; }
  const style = node('style'); style.id = 'mg-compact-menu-style';
  style.textContent = `
#mg-autofarm-v13.mg-compact {--mg-bg:#29251f;--mg-surface:#363129;--mg-raised:#403930;--mg-line:#51483c;--mg-text:#f3ecdc;--mg-muted:#c1b49f;--mg-accent:#a6c494;--mg-focus:#e4c28a;display:flex;flex-direction:column;width:320px!important;max-width:calc(100vw - 16px)!important;overflow:hidden!important;padding:0!important;background:var(--mg-bg)!important;color:var(--mg-text)!important;border:2px solid var(--mg-line)!important;border-radius:20px!important;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif!important;box-shadow:0 12px 36px #0005!important;color-scheme:dark;isolation:isolate}
#mg-autofarm-v13.mg-compact *,#mg-autofarm-v13.mg-compact *::before,#mg-autofarm-v13.mg-compact *::after {box-sizing:border-box}
#mg-autofarm-v13.mg-compact [hidden] {display:none!important}
#mg-autofarm-v13.mg-compact svg {width:22px;height:22px;display:block;flex:none;pointer-events:none}
#mg-autofarm-v13 .mg-menu-header {position:relative;z-index:3;flex:0 0 auto;min-height:52px;padding:10px 12px!important;background:var(--mg-bg);gap:8px!important;border-bottom:1px solid var(--mg-line)}
#mg-autofarm-v13.mg-collapsed .mg-menu-header {border-bottom:0}
#mg-autofarm-v13 .mg-menu-grip {width:12px!important;margin:0!important;color:var(--mg-muted)!important;flex:none}
#mg-autofarm-v13 .mg-menu-grip svg {width:12px;height:20px}
#mg-autofarm-v13 .mg-menu-title {font:700 14px/1.2 system-ui,sans-serif!important;min-width:0;flex:1;display:flex;align-items:center;gap:7px;white-space:nowrap}
#mg-autofarm-v13 .mg-dot {width:7px;height:7px;border-radius:50%;background:#a79c8c;display:inline-block;flex:none}
#mg-autofarm-v13[data-running="true"] .mg-dot {background:#a4ca91;box-shadow:0 0 0 3px #a4ca9110}
#mg-autofarm-v13.mg-compact a.mg-version {font:600 10px/1.3 ui-monospace,monospace!important;color:var(--mg-accent)!important;padding:4px 7px!important;border-radius:10px!important;background:#354032!important;border:1px solid transparent!important;flex:none;white-space:nowrap;text-decoration:none!important;box-shadow:none!important}
#mg-autofarm-v13.mg-compact a.mg-version[data-update="available"] {color:#ffe5e5!important;background:#922d30!important;border-color:#e7666a!important;box-shadow:0 0 0 2px #e7666a23!important;animation:mg-update-flash 2.2s ease-in-out infinite}
@keyframes mg-update-flash {50%{border-color:#ffd0d0;box-shadow:0 0 0 4px #e7666a16}}
@media (prefers-reduced-motion:reduce) {#mg-autofarm-v13.mg-compact a.mg-version {animation:none!important}}
#mg-autofarm-v13.mg-compact button,#mg-autofarm-v13.mg-compact a {font:600 12px/1.3 system-ui,sans-serif!important;color:var(--mg-text)!important;background:var(--mg-surface)!important;border:1px solid var(--mg-line)!important;border-radius:10px!important;min-width:0;padding:8px!important;cursor:pointer;box-shadow:0 2px 0 #19161155;transition:background .12s ease,border-color .12s ease;text-decoration:none}
#mg-autofarm-v13.mg-compact button:hover,#mg-autofarm-v13.mg-compact a:hover {background:var(--mg-raised)!important;border-color:#8a795f!important}
#mg-autofarm-v13.mg-compact button:disabled {cursor:default;opacity:.45}
#mg-autofarm-v13.mg-compact :is(button,a,input,select,summary):focus-visible {outline:2px solid var(--mg-focus)!important;outline-offset:2px}
#mg-autofarm-v13.mg-compact .mg-menu-toggle {flex:none!important;width:28px;height:28px;padding:4px!important;border:0!important;box-shadow:none;margin:0!important}
#mg-autofarm-v13 .mg-menu-toggle svg {width:18px;height:18px;transform:rotate(180deg)}
#mg-autofarm-v13.mg-collapsed .mg-menu-toggle svg {transform:none}
#mg-autofarm-v13 .mg-menu-body {display:flex;flex-direction:column;flex:0 1 auto;min-height:0;overflow:hidden}
#mg-autofarm-v13 .mg-menu-controls {flex:0 0 auto;display:flex;align-items:center;gap:7px!important;padding:10px 12px 8px;margin:0!important}
#mg-autofarm-v13 .mg-menu-controls button {display:flex;justify-content:center;align-items:center;gap:5px;padding:7px!important}
#mg-autofarm-v13 .mg-menu-controls svg {width:14px;height:14px}
#mg-autofarm-v13 .mg-menu-controls .mg-start {color:#d9ecd1!important;background:#3b4b34!important;border-color:#536848!important}
#mg-autofarm-v13 .mg-hotkey {flex:none;color:var(--mg-muted);font:10px ui-monospace,monospace;padding-left:3px}
#mg-autofarm-v13 .mg-menu-location {display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:0 12px 8px}
#mg-autofarm-v13.mg-compact .mg-back {flex:none;width:28px;height:28px;padding:4px!important;background:transparent!important;box-shadow:none}
#mg-autofarm-v13 .mg-back svg {width:18px;height:18px}
#mg-autofarm-v13 .mg-location-title {font-size:13px;font-weight:650;margin:0;outline:none}
#mg-autofarm-v13 .mg-menu-scroll {overflow-y:auto;overflow-x:hidden;min-height:0;flex:0 1 auto;overscroll-behavior-y:contain;padding:2px 12px 14px;scrollbar-width:thin;scrollbar-color:#746651 transparent;scroll-padding:10px}
#mg-autofarm-v13 .mg-menu-scroll::-webkit-scrollbar {width:5px}
#mg-autofarm-v13 .mg-menu-scroll::-webkit-scrollbar-thumb {background:#746651;border-radius:6px}
#mg-autofarm-v13 .mg-home-metrics {display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:8px;margin:1px 0 12px}
#mg-autofarm-v13 .mg-metric-label {font-size:10px;color:var(--mg-muted);display:block;margin-bottom:2px}
#mg-autofarm-v13 .mg-metric-value {font:650 13px/1.3 ui-monospace,monospace;overflow-wrap:anywhere}
#mg-autofarm-v13 .mg-menu-nav {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
#mg-autofarm-v13.mg-compact .mg-shortcut {min-height:65px;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border-radius:15px!important;border-color:transparent!important;padding:9px 3px!important;color:#e1d1b4!important;box-shadow:0 3px 0 #504638;position:relative}
#mg-autofarm-v13 .mg-shortcut span {font-size:10px;font-weight:550;line-height:1.2;letter-spacing:.01em}
#mg-autofarm-v13 .mg-shortcut[data-new="true"]::after {content:"";position:absolute;right:10px;top:8px;width:6px;height:6px;border-radius:50%;background:var(--mg-accent)}
#mg-autofarm-v13 .mg-home-state {color:var(--mg-muted);font-size:10px;margin:12px 0 0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
#mg-autofarm-v13 .mg-menu-view {min-width:0}
#mg-autofarm-v13.mg-compact .mg-menu-view > div,#mg-autofarm-v13.mg-compact .mg-menu-view > details {border:0!important;padding:0!important;margin-top:0!important}
#mg-autofarm-v13 .mg-auto-section > summary,#mg-autofarm-v13 .mg-auto-intro > h3 {display:none}
#mg-autofarm-v13.mg-compact label {font-size:12px!important;line-height:1.5!important;gap:10px!important;margin:11px 0!important;white-space:normal}
#mg-autofarm-v13.mg-compact label > span {min-width:0;flex:1;overflow-wrap:break-word;color:var(--mg-text)}
#mg-autofarm-v13.mg-compact input:not([type="checkbox"]),#mg-autofarm-v13.mg-compact select {width:112px!important;max-width:44%!important;min-width:0;flex:0 0 auto;min-height:31px;border:1px solid #695c49!important;border-radius:8px!important;padding:5px 7px!important;background:#211e19!important;color:var(--mg-text)!important;font:12px/1.3 system-ui,sans-serif!important}
#mg-autofarm-v13.mg-compact input[type="checkbox"] {accent-color:#a6c494;width:15px;height:15px;flex:none;cursor:pointer}
#mg-autofarm-v13.mg-compact p,#mg-autofarm-v13.mg-compact small {font:11px/1.6 system-ui,sans-serif!important;color:var(--mg-muted)!important;overflow-wrap:anywhere}
#mg-autofarm-v13.mg-compact small {display:block;margin:10px 0}
#mg-autofarm-v13.mg-compact pre {font:11px/1.6 ui-monospace,monospace!important;color:var(--mg-muted);overflow-wrap:anywhere;white-space:pre-wrap}
#mg-autofarm-v13 .mg-feedback {margin:0!important;padding:0 12px 7px;flex:none;font-size:10px!important;color:var(--mg-accent)!important;max-height:54px;overflow:auto}
#mg-autofarm-v13 .mg-feedback:empty {display:none}
#mg-autofarm-v13 .mg-stat-row {display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #51483c77;padding:8px 0;font-size:12px}
#mg-autofarm-v13 .mg-stat-row span {color:var(--mg-muted)}
#mg-autofarm-v13 .mg-stat-row strong {font-weight:550;text-align:right;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;max-width:65%}
#mg-autofarm-v13.mg-compact [data-mg-field] {padding:0!important;aspect-ratio:1;border-radius:5px!important;font:9px system-ui,sans-serif!important;background:#332e27!important;color:#cebea6!important;box-shadow:none;touch-action:none}
#mg-autofarm-v13.mg-compact [data-mg-field][aria-pressed="true"] {background:#506046!important;color:#edf4e7!important;border-color:#819271!important}
#mg-autofarm-v13.mg-compact [data-mg-field]:hover {border-color:#b5ab88!important}
#mg-autofarm-v13 .mg-version-note {color:var(--mg-muted);font-size:11px;margin:8px 0}
#mg-autofarm-v13 #mg13-status {font-size:12px;margin:4px 0 12px!important}
#mg-autofarm-v13.mg-compact #mg15-automation {border:0!important;padding:0!important;margin:0!important}
@media (max-width:360px) {#mg-autofarm-v13 .mg-menu-nav {gap:7px} #mg-autofarm-v13 .mg-menu-title {font-size:12px!important} #mg-autofarm-v13 .mg-version {font-size:9px} }
@media (prefers-reduced-motion:reduce) {#mg-autofarm-v13.mg-compact * {transition:none!important}}
`;
  doc.head.appendChild(style);
  panel.classList.add('mg-compact'); panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Magic Garden AutoFarm');
  header.classList.add('mg-menu-header'); headline.classList.add('mg-menu-title');
  grip.classList.add('mg-menu-grip'); grip.replaceChildren(svg('grip'));
  const dot = node('span', 'mg-dot'); const label = node('span', '', 'AutoFarm');
  headline.replaceChildren(dot, label);
  // Clickable even when the update service is unreachable: Tampermonkey can
  // still install from the official repo via its normal .user.js handler.
  const badge = node('a', 'mg-version', 'v' + version);
  badge.href = 'https://github.com/maik26-hub/Magic-Garden-Tools/raw/main/MagicGardenAutoFarm.user.js';
  badge.target = '_blank'; badge.rel = 'noopener noreferrer';
  badge.dataset.update = 'checking';
  badge.setAttribute('aria-label', 'AutoFarm v' + version + ' – Update-Installation öffnen');
  badge.title = 'Version v' + version + ' · Klicken zum Aktualisieren';
  header.insertBefore(badge, toggle);
  toggle.classList.add('mg-menu-toggle'); toggle.replaceChildren(svg('chevron'));
  toggle.setAttribute('aria-controls', 'mg-menu-body');
  body.id = 'mg-menu-body'; body.classList.add('mg-menu-body');
  controls.classList.add('mg-menu-controls');
  startButton.classList.add('mg-start'); stopButton.classList.add('mg-stop');
  startButton.replaceChildren(svg('play'), doc.createTextNode('Start'));
  stopButton.replaceChildren(svg('stop'), doc.createTextNode('Stop'));
  startButton.setAttribute('aria-label', 'AutoFarm starten'); stopButton.setAttribute('aria-label', 'AutoFarm stoppen');
  controls.appendChild(node('span', 'mg-hotkey', 'F8'));
  const breadcrumb = node('div', 'mg-menu-location');
  const back = node('button', 'mg-back'); back.type = 'button'; back.appendChild(svg('back'));
  back.title = 'Zur Übersicht'; back.setAttribute('aria-label', 'Zur Übersicht');
  const pageTitle = node('h2', 'mg-location-title', ''); pageTitle.tabIndex = -1;
  breadcrumb.append(back, pageTitle);
  const scroll = node('div', 'mg-menu-scroll'); scroll.id = 'mg-menu-scroll';
  const home = node('section', 'mg-menu-view'); home.dataset.view = 'home'; home.setAttribute('aria-label', 'Startübersicht');
  const metricStrip = node('div', 'mg-home-metrics'); const metricValues = {};
  for (const [key, title] of [['harvested', 'Geerntet'], ['coins', 'Coins'], ['runtime', 'Laufzeit']]) {
    const card = node('div'); const val = node('strong', 'mg-metric-value', '0');
    card.append(node('span', 'mg-metric-label', title), val); metricValues[key] = val; metricStrip.appendChild(card);
  }
  const nav = node('nav', 'mg-menu-nav'); nav.setAttribute('aria-label', 'AutoFarm Bereiche');
  const homeState = node('p', 'mg-home-state', 'Warte auf Spiel');
  home.append(metricStrip, nav, homeState);
  const overview = node('div');
  const statDefinitions = [['runtime', 'Laufzeit'], ['harvested', 'Geerntet'], ['coins', 'Verdiente Coins'], ['sold', 'Verkäufe'],
    ['fields', 'Gewählte Felder'], ['produce', 'Verkaufbare Items'], ['delay', 'Erntepause'], ['errors', 'Fehler'], ['rejected', 'Ablehnungen'], ['protected', 'Schutz-Skips']];
  const statValues = {};
  for (const [key, title] of statDefinitions) {
    const row = node('div', 'mg-stat-row'); const val = node('strong', '', '0');
    row.append(node('span', '', title), val); statValues[key] = val; overview.appendChild(row);
  }
  const legacyStatus = panel.querySelector('#mg13-status'); const legacyStats = panel.querySelector('#mg13-stats');
  if (legacyStatus) overview.prepend(legacyStatus);
  resetButton.textContent = 'Session zurücksetzen'; resetButton.style.marginTop = '12px'; overview.appendChild(resetButton);
  const diagnostics = auto.views.diagnostics; if (legacyStats) {
    const details = node('details'); details.append(node('summary', '', 'Verbindung & vollständiger Status'), legacyStats); diagnostics.appendChild(details);
  }
  diagnostics.append(copyButton, diagnosticStatus);
  // All original controls are MOVED, not copied, so their handlers and focus state survive.
  auto.views.protection.prepend(protectionToggles);
  const settingsView = node('div'); settingsView.append(settings, toggles);
  const descriptors = [
    ['overview', 'Übersicht', overview], ['fields', 'Felder', fields], ['farming', 'Pflanzen', auto.views.farming],
    ['pets', 'Pets & Futter', auto.views.pets], ['shop', 'Einkauf', auto.views.shop], ['protection', 'Schutz', auto.views.protection],
    ['journal', 'Journal', auto.views.journal], ['teams', 'Wetter', auto.views.teams], ['automation', 'Autopilot', auto.views.automation],
    ['settings', 'Einstellungen', settingsView], ['diagnostics', 'Diagnose', diagnostics],
  ];
  const views = new Map([['home', home]]); const shortcuts = new Map();
  scroll.appendChild(home);
  for (const [key, title, content] of descriptors) {
    const view = node('section', 'mg-menu-view'); view.dataset.view = key; view.id = 'mg-view-' + key;
    view.setAttribute('aria-label', title); view.hidden = true;
    if (content.tagName === 'DETAILS') { content.open = true; content.classList.add('mg-auto-section'); }
    view.appendChild(content); scroll.appendChild(view); views.set(key, view);
    const button = node('button', 'mg-shortcut'); button.type = 'button'; button.dataset.section = key;
    button.title = title; button.setAttribute('aria-label', title); button.setAttribute('aria-controls', view.id);
    button.append(svg(key), node('span', '', title));
    button.addEventListener('click', () => show(key, true)); nav.appendChild(button); shortcuts.set(key, button);
  }
  // Replace the old single long sheet by an anchored title, anchored actions, and one scroller.
  // The title is deliberately NOT a descendant of the scrolling container.
  body.replaceChildren(controls, breadcrumb, scroll, auto.alert);
  auto.alert.className = 'mg-feedback'; auto.alert.setAttribute('role', 'status'); auto.alert.setAttribute('aria-live', 'polite');
  tools.remove(); // Empty legacy wrapper: update and diagnostic controls are already relocated.
  let current = 'home'; const positions = new Map();
  function show(key, moveFocus = false) {
    if (!views.has(key)) key = 'home';
    const previous = current; positions.set(current, scroll.scrollTop); current = key;
    for (const [name, view] of views) view.hidden = name !== key;
    breadcrumb.hidden = key === 'home'; text(pageTitle, descriptors.find(d => d[0] === key)?.[1] || 'Übersicht');
    scroll.scrollTop = positions.get(key) || 0;
    try { storage.setItem(pageKey, key); } catch { /* UI still works without storage. */ }
    if (moveFocus) {
      if (key === 'home') shortcuts.get(previous)?.focus({preventScroll: true});
      else back.focus({preventScroll: true});
    }
  }
  back.addEventListener('click', () => show('home', true));
  body.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target.closest('input,select,textarea,[contenteditable="true"]') || current === 'home') return;
    event.stopPropagation(); show('home', true);
  });
  nav.addEventListener('keydown', event => {
    const deltas = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3};
    if (!(event.key in deltas)) return;
    const items = [...shortcuts.values()]; const index = items.indexOf(doc.activeElement); if (index < 0) return;
    event.preventDefault(); items[(index + deltas[event.key] + items.length) % items.length].focus();
  });
  function setCollapsed(value) {
    panel.classList.toggle('mg-collapsed', value); toggle.setAttribute('aria-expanded', String(!value));
    const title = value ? 'Menü ausklappen' : 'Menü einklappen'; toggle.setAttribute('aria-label', title); toggle.title = title;
  }
  function refresh(data) {
    panel.dataset.running = String(data.running);
    const stateLabel = data.running ? 'Aktiv' : data.busy ? 'Stoppt …' : 'Gestoppt';
    dot.title = stateLabel; headline.setAttribute('aria-label', 'AutoFarm – ' + stateLabel); headline.title = stateLabel;
    text(label, data.running ? 'AutoFarm · Aktiv' : data.busy ? 'AutoFarm · Stoppt' : 'AutoFarm');
    for (const [key, el] of Object.entries(metricValues)) text(el, key === 'coins' ? data.coinsCompact : data[key]);
    metricValues.coins.title = data.coins;
    for (const [key, el] of Object.entries(statValues)) text(el, data[key]);
    text(homeState, data.connection); startButton.disabled = data.running || data.busy; stopButton.disabled = !data.running;
    badge.dataset.update = data.update ? 'available' : 'current';
    const description = data.update
      ? 'Update verfügbar: v' + data.update + ' – Klicken zum Installieren'
      : 'Installiert: v' + version + ' – Klicken zum Prüfen/Installieren in Tampermonkey';
    badge.title = description; badge.setAttribute('aria-label', description);
  }
  let saved = 'home'; try { saved = storage.getItem(pageKey) || 'home'; } catch { /* use home */ }
  show(saved); setCollapsed(ui.collapsed);
  return {refresh, setCollapsed, show, scroll, header, views};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {mountCompactMenu};
