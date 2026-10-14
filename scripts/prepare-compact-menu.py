from pathlib import Path
p=Path('src/automation-ui.js')
s=p.read_text()
s=s.replace("const root=document.createElement('details'); root.id='mg15-automation'; root.open=true;", "const root=document.createElement('section'); root.id='mg15-automation'; root.className='mg-auto-intro';")
s=s.replace("const summary=document.createElement('summary');", "const summary=document.createElement('h3');",1)
s=s.replace("const d=document.createElement('details'),s=document.createElement('summary');", "const d=document.createElement('details'),s=document.createElement('summary');d.open=true;d.className='mg-auto-section';")
s=s.replace("root.appendChild(status);const preview=", "const diagnostics=document.createElement('div');diagnostics.appendChild(status);root.appendChild(diagnostics);const preview=")
s=s.replace("root.appendChild(preview);", "diagnostics.appendChild(preview);")
s=s.replace("||'Keine ausführbare Aktion / Spieldaten noch nicht bereit';});", "||'Keine ausführbare Aktion / Spieldaten noch nicht bereit';},diagnostics);")
s=s.replace("button('Status kopieren',()=>{const text=JSON.stringify(engine.status(),null,2);navigator.clipboard?.writeText(text).then(()=>alert.textContent='Status kopiert',()=>alert.textContent='Kopieren im Browser nicht erlaubt');});", "button('Status kopieren',async()=>{try {await navigator.clipboard.writeText(JSON.stringify(engine.status(),null,2));alert.textContent='Status kopiert';}catch{alert.textContent='Kopieren im Browser nicht erlaubt';}},diagnostics);")
s=s.replace("return {refresh,root};", "return {refresh,root,alert,views:{automation:root,farming,protection,pets,journal:quests,teams,shop,diagnostics}};")
s=s.replace("inputs.set(key,input);", "input.dataset.mgSetting=key;inputs.set(key,input);")
s=s.replace("selectors.push({input,key,choiceKey});", "input.dataset.mgSetting=key;selectors.push({input,key,choiceKey});")
p.write_text(s)
p=Path('scripts/build.cjs');s=p.read_text()
s=s.replace('15.0.0','15.1.0')
s=s.replace('// @description  V15: modular automation for plants, pets, eggs, shops, storage, journal and daily rewards', '// @description  V15.1: compact icon menu with anchored header and scrollable sections; existing automation retained')
s=s.replace("new vm.Script(src,{filename:'MagicGardenAutoFarm.user.js'});", "src = require('./compact-menu.cjs')(src, stripExports('compact-menu.js'));\nnew vm.Script(src,{filename:'MagicGardenAutoFarm.user.js'});")
p.write_text(s)
p=Path('tests/main-upgrade.test.cjs');p.write_text(p.read_text().replace('15.0.0','15.1.0').replace('15.0.1','15.1.1'))
p=Path('README.md');s=p.read_text().replace('V15.0.0','V15.1.0')
s=s.replace('## Die neue Automationszentrale', '''## Kompaktes Menü (V15.1)

Zwölf schlichte Icon-Kacheln öffnen jeweils einen Bereich: Übersicht, Felder, Pflanzen, Pets & Futter, Einkauf, Schutz, Journal, Wetter, Autopilot, Einstellungen, Updates und Diagnose. Die lange Optionsliste ist in einzelne Ansichten aufgeteilt; alle vorhandenen Module und Einstellungen bleiben erhalten.

**Die Kopfzeile mit Status, Version, Verschieben und Einklappen bleibt immer stehen.** Auch Start/Stop und der Zurück-Pfeil scrollen nicht mit; nur der Inhalt darunter scrollt. Das gilt ebenfalls auf kleinen Fenstern. Die zuletzt geöffnete Ansicht, Position und der eingeklappte Zustand werden gespeichert.

Unter **Autopilot** stehen der Hauptschalter und das bisherige sichere Preset. **Übersicht** enthält die Session-Statistiken und den Reset. **Felder** unterstützt weiterhin Klicks und Ziehen. **Updates** bietet weiterhin **Update prüfen → Installieren** über exakt denselben Hauptkanal.

## Die Automationsfunktionen''')
s+='\n## UI-Regressionen\n\n`python tests/browser/compact_menu.py` prüft die fertige Datei in Chromium mit simuliertem Spiel/Browser-Speicher. Screenshots und ein JSON-Bericht werden unter `test-output/` abgelegt. Abhängigkeit: Playwright für Python, Chromium (bei Bedarf `CHROMIUM_PATH`). Der Test benötigt keine Spiel- oder GitHub-Anmeldung und navigiert nicht zum Live-Spiel. Ein Seitenneustart wird mit einem neuen isolierten Dokument und wiederhergestellten Speichern simuliert.\n'
p.write_text(s)
