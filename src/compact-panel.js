/* Presentation-only layout: existing controls are moved, not recreated.
 * Header is outside the scrolling region; dragging/collapse keep their original handlers. */
function mountCompactPanel({ document, panel, header, body, headline, toggle, controls,
  resetButton, toggles, settingsPanel, tools, fields, automationRoot, version, storage, collapsed }) {
  if (!document.getElementById('mg15-simple-style')) {
    const style = document.createElement('style'); style.id = 'mg15-simple-style';
    style.textContent = `
#mg-autofarm-v13.mg-simple {
  --mg-bg:#29241e; --mg-card:#332d25; --mg-raised:#40372d; --mg-line:#504638;
  --mg-text:#f0e9dc; --mg-muted:#b8aa94; --mg-accent:#9db888;
  display:flex; flex-direction:column; overflow:hidden; padding:0;
  width:350px; max-width:calc(100vw - 16px); border:1px solid var(--mg-line);
  border-radius:20px; background:var(--mg-bg); color:var(--mg-text);
  font:13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  box-shadow:0 14px 40px #0005,0 2px 5px #0004; color-scheme:dark;
}
#mg-autofarm-v13.mg-simple *, #mg-autofarm-v13.mg-simple *::before,
#mg-autofarm-v13.mg-simple *::after { box-sizing:border-box; }
#mg-autofarm-v13.mg-simple [hidden] { display:none!important; }
#mg-autofarm-v13 .mg-head {
  display:flex; align-items:center; gap:8px; flex:none; padding:12px;
  min-height:59px; background:var(--mg-bg); border-bottom:1px solid var(--mg-line);
  position:relative; z-index:3; cursor:grab; touch-action:none; user-select:none;
}
#mg-autofarm-v13 .mg-grip { color:var(--mg-muted)!important; font-size:17px!important; margin:0!important; }
#mg-autofarm-v13 .mg-led { width:7px; height:7px; border-radius:50%; flex:none; background:#918777; }
#mg-autofarm-v13[data-running="true"] .mg-led { background:#92c486; box-shadow:0 0 0 3px #92c48610; }
#mg-autofarm-v13 .mg-brand { flex:1; min-width:0; }
#mg-autofarm-v13 .mg-brand strong { font-size:14px!important; font-weight:750; letter-spacing:-.2px; }
#mg-autofarm-v13 .mg-head-state { display:block; font-size:10px; color:var(--mg-muted); line-height:1.15; }
#mg-autofarm-v13 .mg-version { font-size:10px; font-weight:700; color:#bfd2ad; background:#35452e; padding:4px 7px; border-radius:8px; flex:none; }
#mg-autofarm-v13 .mg-collapse { width:30px!important; height:30px; padding:0!important; flex:none!important; font-size:17px!important; }
#mg-autofarm-v13.mg-simple .mg-body { display:flex; flex-direction:column; flex:0 1 auto; min-height:0; overflow:hidden; }
#mg-autofarm-v13 .mg-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; padding:11px 12px; flex:none; }
#mg-autofarm-v13.mg-simple .mg-tabs button {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:5px; border-radius:13px!important; min-height:62px; padding:9px 3px!important;
  background:var(--mg-card)!important; border:1px solid transparent!important;
  color:var(--mg-muted)!important; box-shadow:0 3px 0 #1d1915;
}
#mg-autofarm-v13.mg-simple .mg-tabs button[aria-selected="true"] { color:#eddfc6!important; background:#48402f!important; border-color:#756448!important; }
#mg-autofarm-v13 .mg-tabs svg { width:21px; height:21px; }
#mg-autofarm-v13 .mg-tabs span { font-size:10px; font-weight:600; }
#mg-autofarm-v13 .mg-scroll { min-height:0; overflow-y:auto; overflow-x:hidden; padding:0 12px 12px; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#6a5b48 transparent; }
#mg-autofarm-v13 .mg-scroll::-webkit-scrollbar { width:6px; }
#mg-autofarm-v13 .mg-scroll::-webkit-scrollbar-thumb { background:#6a5b48; border-radius:10px; }
#mg-autofarm-v13 .mg-pane { min-width:0; }
#mg-autofarm-v13 .mg-card { background:var(--mg-card); padding:12px; border:1px solid #4b4135; border-radius:13px; margin-bottom:10px; }
#mg-autofarm-v13 .mg-pane-title { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:650; margin:4px 0 10px; }
#mg-autofarm-v13 .mg-stat-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
#mg-autofarm-v13 .mg-stat { background:var(--mg-card); border-radius:12px; padding:11px; min-width:0; }
#mg-autofarm-v13 .mg-stat span { display:block; font-size:10px; color:var(--mg-muted); margin-bottom:3px; }
#mg-autofarm-v13 .mg-stat output { display:block; font-size:16px; font-weight:700; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
#mg-autofarm-v13 .mg-stat output[data-value="coins"] { color:#decc9f; }
#mg-autofarm-v13.mg-simple button:not([data-mg-field]), #mg-autofarm-v13.mg-simple a {
  font:600 12px/1.35 system-ui,sans-serif!important; background:var(--mg-raised)!important;
  border:1px solid #594d3d!important; border-radius:10px!important; color:var(--mg-text)!important;
  padding:8px 10px!important; cursor:pointer; text-decoration:none; min-width:0;
}
#mg-autofarm-v13.mg-simple button:hover:not(:disabled), #mg-autofarm-v13.mg-simple a:hover { filter:brightness(1.12); }
#mg-autofarm-v13.mg-simple button:disabled { opacity:.45; cursor:default; }
#mg-autofarm-v13.mg-simple button.mg-start { background:#415b38!important; border-color:#647d53!important; }
#mg-autofarm-v13.mg-simple button.mg-stop { background:#583933!important; border-color:#785149!important; }
#mg-autofarm-v13 .mg-actions { display:flex; gap:8px; margin:12px 0 8px!important; }
#mg-autofarm-v13.mg-simple button.mg-reset { width:100%; margin:0 0 10px!important; background:transparent!important; }
#mg-autofarm-v13.mg-simple small { color:var(--mg-muted)!important; font-size:11px; line-height:1.5!important; }
#mg-autofarm-v13.mg-simple p { margin:8px 0; }
#mg-autofarm-v13.mg-simple pre { font:11px/1.65 ui-monospace,monospace!important; color:var(--mg-muted); white-space:pre-wrap; overflow-wrap:anywhere; }
#mg-autofarm-v13 #mg13-status { margin:0!important; font-size:11px; color:var(--mg-accent); }
#mg-autofarm-v13 .mg-hint { font-size:10px; color:var(--mg-muted); margin:10px 0; }
#mg-autofarm-v13.mg-simple details:not(.mg-choice) { border:1px solid #4b4135!important; border-radius:12px; padding:0!important; margin:9px 0!important; background:var(--mg-card); }
#mg-autofarm-v13.mg-simple details:not(.mg-choice)>summary { padding:12px; font-size:12px; font-weight:650; cursor:pointer; list-style:none; }
#mg-autofarm-v13.mg-simple details:not(.mg-choice)>summary::after { content:'⌄'; float:right; color:var(--mg-muted); }
#mg-autofarm-v13.mg-simple details[open]:not(.mg-choice)>summary::after { content:'⌃'; }
#mg-autofarm-v13.mg-simple details:not(.mg-choice)>:not(summary) { margin-left:11px!important; margin-right:11px!important; }
#mg-autofarm-v13.mg-simple details:not(.mg-choice)>:last-child { margin-bottom:11px!important; }
#mg-autofarm-v13.mg-simple #mg15-automation { border:0!important; background:transparent; margin:0!important; }
#mg-autofarm-v13 #mg15-automation>summary { display:none; }
#mg-autofarm-v13 #mg15-automation>:not(summary) { margin-left:0!important; margin-right:0!important; }
#mg-autofarm-v13.mg-simple input:not([type="checkbox"]), #mg-autofarm-v13.mg-simple select {
  font:12px system-ui,sans-serif; color:var(--mg-text)!important; background:#27221c!important;
  border:1px solid #625341!important; border-radius:8px!important; padding:7px 8px!important;
  min-width:0; max-width:56%!important;
}
#mg-autofarm-v13.mg-simple input[type="checkbox"] { accent-color:#a0b77d; width:15px; height:15px; flex:none; cursor:pointer; }
#mg-autofarm-v13.mg-simple :is(button,input,select,summary,a):focus-visible { outline:2px solid #d3bc8d; outline-offset:2px; }
#mg-autofarm-v13.mg-simple summary::-webkit-details-marker { display:none; }
#mg-autofarm-v13 .mg-settings-toggles, #mg-autofarm-v13 .mg-settings-values, #mg-autofarm-v13 .mg-update-tools { border-color:var(--mg-line)!important; margin-bottom:8px; }
#mg-autofarm-v13 .mg-settings-toggles>div { border-color:var(--mg-line)!important; }
#mg-autofarm-v13.mg-simple [data-mg-field] { font-family:system-ui,sans-serif; background:#352e27!important; border-color:#54493a!important; color:var(--mg-text); }
#mg-autofarm-v13.mg-simple [data-mg-field][data-selected="true"] { background:#556947!important; border-color:#93a67c!important; }
#mg-autofarm-v13 .mg-choice { border:1px solid #625341; border-radius:9px; background:#27221c; width:100%; margin:5px 0 10px; }
#mg-autofarm-v13 .mg-option-row:has(>.mg-choice) { display:block!important; }
#mg-autofarm-v13 .mg-choice>summary { display:flex; align-items:center; justify-content:space-between; gap:8px; list-style:none; cursor:pointer; padding:8px 10px; font-size:12px; color:var(--mg-text); }
#mg-autofarm-v13 .mg-choice[open]>summary { border-bottom:1px solid var(--mg-line); }
#mg-autofarm-v13 .mg-choice-popup { padding:8px; }
#mg-autofarm-v13.mg-simple .mg-choice input[type="search"] { width:100%; max-width:100%!important; margin:0 0 6px; }
#mg-autofarm-v13 .mg-choice-toolbar { display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:10px; color:var(--mg-muted); margin-bottom:6px; }
#mg-autofarm-v13.mg-simple .mg-choice-toolbar button { padding:5px 7px!important; font-size:10px!important; }
#mg-autofarm-v13 .mg-choice-list { max-height:190px; overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#6a5b48 transparent; }
#mg-autofarm-v13 .mg-choice-row { display:flex; align-items:center; gap:9px; padding:7px 5px; border-radius:6px; cursor:pointer; font-size:12px; }
#mg-autofarm-v13 .mg-choice-row:hover { background:#3c3429; }
#mg-autofarm-v13 .mg-choice-row input { margin:0; }
#mg-autofarm-v13 .mg-choice-empty, #mg-autofarm-v13 .mg-choice-error { font-size:11px; color:var(--mg-muted); margin:4px; }
#mg-autofarm-v13 .mg-choice-error:empty { display:none; }
@media(max-width:380px) { #mg-autofarm-v13 .mg-scroll { padding:0 9px 9px; } #mg-autofarm-v13 .mg-tabs { padding:9px;gap:5px; } }
`;
    (document.head || document.documentElement).appendChild(style);
  }
  panel.classList.add('mg-simple'); panel.setAttribute('aria-label', 'Magic Garden AutoFarm');
  for (const key of ['padding','background','color','font','border','borderRadius','boxShadow','overflowY','boxSizing','width','maxWidth']) panel.style[key] = '';
  panel.style.top = '20px';
  header.id = 'mg15-header'; header.classList.add('mg-head'); header.style.cssText = '';
  const grip = header.querySelector('span'); grip.classList.add('mg-grip'); grip.setAttribute('aria-hidden','true');
  headline.textContent = 'AutoFarm'; headline.style.fontSize = '';
  const brand = document.createElement('div'); brand.className = 'mg-brand';
  const stateLabel = document.createElement('span'); stateLabel.className = 'mg-head-state'; stateLabel.textContent = 'Gestoppt';
  brand.append(headline, stateLabel);
  const led = document.createElement('span'); led.className = 'mg-led'; led.setAttribute('aria-hidden','true');
  const badge = document.createElement('span'); badge.className = 'mg-version'; badge.textContent = 'v' + version;
  toggle.id = 'mg15-collapse'; toggle.classList.add('mg-collapse'); toggle.style.cssText = '';
  header.replaceChildren(grip, led, brand, badge, toggle);
  body.id = 'mg15-body'; body.classList.add('mg-body');
  const status = body.querySelector('#mg13-status'), stats = body.querySelector('#mg13-stats');
  const overview = document.createElement('div'), fieldPage = document.createElement('div'), autoPage = document.createElement('div'), settingsPage = document.createElement('div');
  const title = document.createElement('div'); title.className = 'mg-pane-title'; title.append('Übersicht', status);
  overview.appendChild(title);
  const grid = document.createElement('div'); grid.className = 'mg-stat-grid';
  const outputs = {};
  for (const [key, label] of [['harvested','Geerntet'],['coins','Coins'],['sold','Verkäufe'],['fields','Felder'],['runtime','Laufzeit'],['delay','Erntepause']]) {
    const card = document.createElement('div'); card.className = 'mg-stat';
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('output'); value.dataset.value = key; value.textContent = '–'; outputs[key] = value;
    card.append(name,value); grid.appendChild(card);
  }
  controls.classList.add('mg-actions'); controls.children[0].classList.add('mg-start'); controls.children[1].classList.add('mg-stop');
  resetButton.classList.add('mg-reset'); resetButton.textContent = 'Session zurücksetzen';
  const hint = document.createElement('p'); hint.className = 'mg-hint'; hint.textContent = 'F8 · Start / Stop     ⠿ · Menü verschieben';
  const telemetry = document.createElement('details');
  const telemetryTitle = document.createElement('summary'); telemetryTitle.textContent = 'Verbindung & Details';
  telemetry.append(telemetryTitle, stats);
  overview.append(grid, controls, resetButton, hint, telemetry);
  fieldPage.appendChild(fields); fields.style.borderTop = '0'; fields.style.paddingTop = '4px';
  autoPage.appendChild(automationRoot);
  toggles.classList.add('mg-settings-toggles'); settingsPanel.classList.add('mg-settings-values'); tools.classList.add('mg-update-tools');
  settingsPage.append(toggles, settingsPanel, tools);
  const nav = document.createElement('div'); nav.className = 'mg-tabs'; nav.setAttribute('role','tablist'); nav.setAttribute('aria-label','AutoFarm-Bereiche');
  const scroll = document.createElement('div'); scroll.id = 'mg15-scroll'; scroll.className = 'mg-scroll';
  const icon = paths => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  const tabs = [
    ['farm','Farm',overview,'<path d="M12 21v-9M12 15C5 15 4 10 4 6c6 0 8 3 8 7M12 11c0-5 3-7 8-7 0 5-3 8-8 8"/>'],
    ['fields','Felder',fieldPage,'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
    ['automation','Automatik',autoPage,'<path d="M7 3v4m0 4v10M17 3v10m0 4v4"/><rect x="4" y="7" width="6" height="4" rx="1.5"/><rect x="14" y="13" width="6" height="4" rx="1.5"/>'],
    ['settings','Optionen',settingsPage,'<path d="m10 3-1 3-3 1-2 3 1 3-1 3 3 2 3-1 2 3 3-1 1-3 3-1 1-3-2-2 1-3-3-2-3 1Z"/><circle cx="12" cy="12" r="3"/>']
  ];
  let active = 'farm'; const scrollPositions = new Map();
  try { const saved = storage.getItem('magic_garden_ui_v15_tab'); if (tabs.some(t=>t[0]===saved)) active = saved; } catch {}
  function select(id, persist = true) {
    scrollPositions.set(active, scroll.scrollTop); active = id;
    for (const [key,, page,, button] of tabs) {
      page.hidden = key !== id; button.setAttribute('aria-selected', String(key === id)); button.tabIndex = key === id ? 0 : -1;
    }
    scroll.scrollTop = scrollPositions.get(id) || 0;
    if (persist) try { storage.setItem('magic_garden_ui_v15_tab', id); } catch {}
  }
  for (const tab of tabs) {
    const [id,label,page,path] = tab;
    page.id = 'mg15-pane-' + id; page.className = 'mg-pane'; page.setAttribute('role','tabpanel'); page.setAttribute('aria-labelledby','mg15-tab-' + id);
    const button = document.createElement('button'); button.id='mg15-tab-' + id; button.type='button'; button.setAttribute('role','tab'); button.setAttribute('aria-controls',page.id);
    button.innerHTML = icon(path); const text = document.createElement('span'); text.textContent = label; button.appendChild(text);
    button.addEventListener('click',()=>select(id)); tab.push(button); nav.appendChild(button); scroll.appendChild(page);
  }
  nav.addEventListener('keydown', event => {
    const index = tabs.findIndex(tab=>tab[4]===document.activeElement);
    if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); select(tabs[next][0]); tabs[next][4].focus();
  });
  body.replaceChildren(nav, scroll);
  function setCollapsed(value) {
    toggle.textContent = value ? '⌄' : '⌃'; toggle.setAttribute('aria-expanded',String(!value));
    toggle.setAttribute('aria-controls',body.id); toggle.setAttribute('aria-label',value ? 'Menü ausklappen' : 'Menü einklappen');
    panel.dataset.collapsed=String(value);
  }
  toggle.addEventListener('click',()=>setCollapsed(body.style.display==='none'));
  setCollapsed(collapsed); select(active,false);
  return { refresh(data) {
    panel.dataset.running=String(data.running); stateLabel.textContent=data.running?'Aktiv':data.busy?'Stoppt …':'Gestoppt';
    for (const [key,value] of Object.entries(data)) if(outputs[key]) outputs[key].textContent=String(value);
  } };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { mountCompactPanel };
