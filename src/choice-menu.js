/* Read-only UI choices. Values remain the existing IDs in saved preferences. */
function automationChoiceOptions(engine, kind) {
  const catalog = engine.catalogs();
  const config = engine.getConfig();
  const pretty = id => String(id).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  const names = { Normal: 'Klares Wetter', Rain: 'Regen', Frost: 'Frost',
    Thunderstorm: 'Gewitter', Dawn: 'Morgendämmerung', AmberMoon: 'Bernsteinmond' };
  let options = [];
  if (kind === 'plants') {
    options = Object.entries(catalog.plants || {}).map(([id, item]) => ({
      id, name: item.name || item.crop?.name || pretty(id)
    }));
  } else if (kind === 'mutations') {
    options = Object.entries(catalog.mutations || {}).map(([id, item]) => ({
      id, name: item.name || pretty(id)
    }));
  } else if (kind === 'weather') {
    // Native weather enum in public build 1517; Normal is AutoFarm's existing clear-sky value.
    // Keep observed and previously saved values, including future game weather types.
    const weather = engine.status().weather;
    const ids = new Set(['Normal', 'Rain', 'Frost', 'Thunderstorm', 'Dawn', 'AmberMoon',
      ...(config.pauseWeather || []), ...(config.teamRules || []).map(rule => rule.weather)]);
    if (weather && weather !== 'unbekannt') ids.add(weather);
    options = [...ids].map(id => ({ id, name: names[id] || pretty(id) }));
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/* Native details + checkboxes: keyboard/touch accessible, no external component library.
 * It only calls onChange on a real selection edit, never during polling/rendering. */
function createChoiceMenu(document, { label, placeholder, read, onChange, choices, max = 40 }) {
  const root = document.createElement('details');
  root.className = 'mg-choice';
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', label);
  const caption = document.createElement('span');
  const chevron = document.createElement('span');
  chevron.textContent = '⌄'; chevron.setAttribute('aria-hidden', 'true');
  summary.append(caption, chevron); root.appendChild(summary);
  const popup = document.createElement('div'); popup.className = 'mg-choice-popup';
  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Suchen …';
  search.setAttribute('aria-label', label + ' durchsuchen');
  const toolbar = document.createElement('div'); toolbar.className = 'mg-choice-toolbar';
  const count = document.createElement('span');
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Auswahl leeren';
  clear.setAttribute('aria-label', label + ': Auswahl leeren');
  toolbar.append(count, clear);
  const list = document.createElement('div'); list.className = 'mg-choice-list';
  list.setAttribute('role', 'group'); list.setAttribute('aria-label', label);
  const empty = document.createElement('p'); empty.className = 'mg-choice-empty';
  const error = document.createElement('p'); error.className = 'mg-choice-error'; error.setAttribute('role', 'status');
  popup.append(search, toolbar, list, empty, error); root.appendChild(popup);
  let signature = '', rows = [], lastCatalog = [];
  const values = () => [...new Set((read() || []).filter(id => typeof id === 'string'))];
  function commit(next) {
    try { onChange(next); error.textContent = ''; }
    catch (err) { error.textContent = err?.message || 'Speichern fehlgeschlagen'; }
    refresh();
  }
  function filter() {
    const query = search.value.trim().toLocaleLowerCase('de');
    let shown = 0;
    for (const item of rows) {
      const match = !query || item.search.includes(query);
      item.row.hidden = !match; if (match) shown++;
    }
    empty.hidden = shown > 0;
    empty.textContent = rows.length ? 'Keine Treffer.' : 'Warte auf Spielkatalog …';
  }
  function refresh() {
    const chosen = new Set(values());
    const available = choices() || [];
    const byId = new Map(available.map(item => [item.id, item]));
    for (const id of chosen) if (!byId.has(id)) byId.set(id, { id,
      name: id.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), saved: true });
    lastCatalog = [...byId.values()];
    const nextSignature = JSON.stringify(lastCatalog.map(x => [x.id, x.name, !!x.saved]));
    if (signature !== nextSignature) {
      const activeId = document.activeElement?.dataset?.choiceValue;
      const scroll = list.scrollTop;
      signature = nextSignature; rows = []; list.replaceChildren();
      for (const option of lastCatalog) {
        const row = document.createElement('label'); row.className = 'mg-choice-row';
        const input = document.createElement('input'); input.type = 'checkbox';
        input.dataset.choiceValue = option.id;
        const text = document.createElement('span');
        text.textContent = option.name + (option.saved ? ' (gespeichert)' : '');
        input.setAttribute('aria-label', option.name);
        input.addEventListener('change', () => {
          const next = new Set(values());
          if (input.checked) { if (next.size < max) next.add(option.id); }
          else next.delete(option.id);
          commit([...next]);
        });
        row.append(input, text); list.appendChild(row);
        rows.push({ row, input, search: (option.name + ' ' + option.id).toLocaleLowerCase('de') });
      }
      list.scrollTop = scroll;
      if (activeId) rows.find(row => row.input.dataset.choiceValue === activeId)?.input.focus({ preventScroll: true });
    }
    for (const row of rows) {
      row.input.checked = chosen.has(row.input.dataset.choiceValue);
      row.input.disabled = chosen.size >= max && !row.input.checked;
    }
    caption.textContent = chosen.size ? chosen.size + ' ausgewählt' : placeholder;
    summary.title = chosen.size ? lastCatalog.filter(item => chosen.has(item.id)).map(item => item.name).join(', ') : label;
    count.textContent = chosen.size + ' / ' + max + ' ausgewählt';
    clear.disabled = chosen.size === 0;
    filter();
  }
  clear.addEventListener('click', () => commit([]));
  search.addEventListener('input', filter);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { root.open = false; summary.focus(); event.stopPropagation(); }
  });
  refresh();
  return { root, refresh };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { automationChoiceOptions, createChoiceMenu };
