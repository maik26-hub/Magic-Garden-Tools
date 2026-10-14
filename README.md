# Magic Garden AutoFarm — V15.4.0

Eigenständiges Tampermonkey-Skript für Magic Garden. Inoffizielles Community-Projekt, nicht mit dem Spiel verbunden.

## V15.4.0 – Pet Auto-Sell und Aries-Team-Sync

**Pet Auto-Sell (standardmäßig AUS):** Unter **Pets & Futter** kannst du **„Pet Auto-Sell einschalten“** aktivieren, **Herkunftseier mit Häkchen** auswählen (z. B. Common Egg und Uncommon Egg) und die maximale Anzahl an Verkäufen pro laufender Sitzung einstellen (1–20, voreingestellt 5). Der Bot verkauft **nicht** blind alle Pets dieser Eier. Er berücksichtigt nur **im Inventar** liegende Pets, deren individuelle Max-STR-/Fähigkeitenkombination nachweisbar von einem Pet übertroffen wird, das für eines der Spezialteams reserviert ist. Er schützt aktiv verwendete, in normalen/Aries-Teams gespeicherte, favorisierte, gesperrte, mutierte und im Pet Hutch gelagerte Pets sowie Pets mit unbekannter Herkunft, unvollständigem Journal oder unbekannten Boost-/Stärkedaten. Ein leeres Herkunftsei-Menü lässt nichts verkaufen. Bitte vor Aktivierung die Vorschau prüfen.

Der echte native Spielbefehl `SellPet` mit der individuellen `itemId` ist aus dem aktuellen öffentlichen Aries-Quellcode bestätigt. **Er gibt nicht immer eine Befehlsbestätigung zurück.** Die AutoFarm prüft deshalb nach dem Senden, ob das exakte Pet aus deinem Inventar verschwunden ist, und wiederholt ausbleibende/unklare Verkäufe **nicht blind** (10 Minuten Sperre). Ein sicherer Live-Verkauf wurde bisher **nicht** mit deinem Spielaccount geprüft.

**Aries-Team-Verwaltung (standardmäßig AUS):** Arie's Mod gibt gespeicherte Teams über `window.QWS_PetsService.getTeams()` sowie `saveTeam()` frei. Wenn Aries läuft und sein Team-Sync aktiviert ist, kannst du ein **bereits gespeichertes und mit dem Spiel verknüpftes Aries-Team** auswählen und dessen Ziel (AFK, Verkauf, Growth, Hatch usw.) festlegen. Nur dieses ausdrücklich registrierte Team darf die AutoFarm mit den besten Pet-IDs aus ihrer Max-STR-/Boost-Analyse aktualisieren. **Manuell erstellte, nicht ausgewählte Teams bleiben unverändert.** Es werden weder Aries-Teams gelöscht noch automatisch erstellt. Teamnamen und Team-IDs bleiben gleich.

**Wichtige Grenze:** Aries' noch **nicht gespeicherte** Team-Builder-Vorschläge sind derzeit nicht als öffentliches API verfügbar. Diese Version **importiert also gespeicherte Aries-Teams**, verwendet für bessere Mitglieder aber unsere **eigene** geprüfte Max-Level-Optimierung statt heimlich Aries' Algorithmus zu behaupten oder fremden proprietären Code zu kopieren. Für exakt dieselben Builder-Vorschläge bräuchten wir eine offizielle Bridge/API von Arie.

**Aktivierung:** Automationszentrale und AutoFarm starten, im Pet-Menü die Schutz-/Verkaufsoptionen ausdrücklich aktivieren. Ohne aktive AutoFarm werden keine Aktionen gesendet.

## Smart Pet Advisor (V15.3.1)

Unter **Pets & Futter → Pet-Manager · Boost-Vergleich** findest du eine **rein lesende** Auswertung aus eigenem Inventar, den bis zu drei aktiven Pets und dem **Pet Hutch**. Ziel auswählen: Verkauf von Pflanzen, AFK, Hatch-Qualität, Hatch-Speed, Pflanzenwachstum, Crop-Mutationen/-Größe, Pet-Leveln oder Verkauf von Pets/Magic Dust.

Der Manager wertet **nur die tatsächlich am Pet gespeicherten Abilities** aus, nicht alle Fähigkeiten, die seine Art theoretisch bekommen könnte. Aktuelle Stärke, MAX STR und verbleibende Stufen werden aus `xp`, `targetScale` und den Pet-Katalogdaten (`maxScale`, `hoursToMature`) ermittelt. Für passende Ziele wird eine **relative, ausdrücklich heuristische** Priorisierung der Boosts angezeigt; gleiche Abilities werden nach aktueller Stärke und zukünftigem Potenzial verglichen. Wettergebundene Abilities erhalten außerhalb des passenden Wetters keine aktive Bewertung. Unbekannte Abilities oder fehlende XP/Katalogdaten werden **nicht als Nullstärke interpretiert**.

**Neu in V15.3.1: Max-Level entscheidet – nicht die Pet-Art.** Der Manager vergleicht jedes Pet mit potenziellen Spezialteams für alle acht Rollen: aktuelle und maximale Stärke, auf Max-Level hochgerechneter Boost, konkrete Fähigkeiten/Tier und wettergebundene Fähigkeiten. Für jedes Ziel reserviert er die bis zu drei langfristig stärksten sinnvollen Pets, auch **artübergreifend**. Ein Pet mit einer einzigartigen Fähigkeit für Egg-Hatch oder Plant-Growth bleibt unabhängig von seiner Art interessant. Es gibt **keine Regel „behalte zwingend ein Pet jeder Art“**.

Die Anzeige unterscheidet **„Behalten“** (wichtiges Spezialteam, besondere Fähigkeit oder geschütztes Pet) und **„Prüfen“** (fehlende Daten oder ein nach Max-Level-Boosts von anderen Pets übertroffenes Exemplar). Gleichwertige vierte Pets können als Überbestand erkannt werden. Die Scores sind relative **Heuristiken**, keine gesicherten Spiel-Berechnungen; unbekannte Fähigkeiten werden niemals als wertlos eingestuft.

**Noch kein automatischer Pet-Verkauf:** Trotz Behalten-/Aussortieren-Einschätzung bleiben Verkäufe und Pet-Swaps deaktiviert. Favoriten, gesperrte, aktive, Pet-Hutch-/Team-Pets und Mutationen werden ausdrücklich geschützt; unsichere Journalstände sind zusätzliche Prüfsperren. Zum tatsächlichen Auto-Sell müssen native Verkaufsbefehle und die Schutzbedingungen zuerst verifiziert werden.

Die <https://magicgarden.wiki/Pets> und <https://magicgarden.wiki/Abilities> dienen zur Orientierung. Werte und Abilities werden nach Möglichkeit aus den aktuellen **individuellen** Spieldaten gelesen. Die Wiki-Tabelle allein lässt weder die am konkreten Pet gewürfelte Fähigkeit noch seine Max Strength erkennen.

## Aktualisieren: rote Version oben

Ab **V15.2.3** entfällt die alte Seite **„Updates“** samt **„Update prüfen“**. Stattdessen prüft die AutoFarm beim Laden und alle 30 Minuten automatisch über **Tampermonkey** die offizielle GitHub-Hauptversion.

- **Grüne/neutrale Versionsplakette im Kopfbereich:** Kein neuerer Release erkannt (oder bei Verbindungsfehler: Status nicht bestimmbar). Die Versionsplakette bleibt anklickbar.
- **Rote Versionsplakette:** Ein neuerer Release wurde gefunden. Klicke die Version oben an, bestätige die Aktualisierung in Tampermonkey und lade die Spielseite neu.
- Die Versionsplakette öffnet den bekannten GitHub-Installationspfad als `.user.js`, über den Tampermonkey Updates normalerweise übernimmt.

**Einmaliger Übergang von V15.2.1/V15.2.2:** Diese bereits installierten Versionen kennen die neue rote Versionsplakette noch nicht. Wenn dort „Update-Check fehlgeschlagen“ erscheint, benutze **einmalig Tampermonkey → Dashboard → Nach Userscript-Updates suchen** (beziehungsweise das Updates-Menü der Erweiterung). Tampermonkey prüft die bereits gespeicherte `@updateURL` selbst; du brauchst weder den kaputten In-Game-Check noch einen zusätzlichen Userscript-Link. Wenn der Browser/die Erweiterung den Release nicht laden kann, hilft auch das neue UI nicht ohne Behebung der Netzwerk-/Berechtigungsprobleme.

**Seit V15.2.3:** Das Skript nutzt `GM_xmlhttpRequest` und `unsafeWindow`; Tampermonkey darf für den Versionsabruf `raw.githubusercontent.com` kontaktieren. Das bestehende Spiel läuft weiterhin über seine eigenen nativen Verbindungen.

Name, Namespace, bisherige Update-Adresse, Einstellungen und Feldfarben bleiben erhalten. Kein zweites Userscript, keine QPM-/Garden-Companion-Abhängigkeit.

Neue Nutzer: [AutoFarm installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js).

## V15.2.2: Eier nach Typ filtern

Platzieren und Ausbrüten besitzen jetzt **unabhängige Eiertyp-Filter** mit „Alle“ oder „Nur ausgewählte“ und Live-Bestandsanzeige. Siehe die Eier-Anleitung unten.

## V15.2.1: Kataloge und Auto-Buy repariert

- **Tagesbudget und Coin-Mindestreserve entfernt**, sowohl im Menü als auch aus den Kaufbedingungen. Alte gespeicherte Werte blockieren nichts mehr.
- Auto-Buy kauft nur die ausdrücklich gespeicherten Artikel, solange genügend Coins vorhanden sind. **Stückpreislimit, Gesamtbestand und Menge pro Restock bleiben gültig.** Keine Credits oder Echtgeldkäufe.
- Der Kataloglader hängt nicht mehr ausschließlich an einem bestimmten Dateinamen in der Performance-Ressourcenliste. Er beobachtet Ressourcen früh und findet fehlende oder umbenannte Katalogmodule über die eigenen Modul-Skripte, Preloads und deren Import-Verweise.
- Fehlgeschlagene oder zu frühe Ladevorgänge werden automatisch wiederholt; hängende Abrufe haben Zeitlimits. Erfolgreiche Ergebnisse werden wiederverwendet.
- **Vorhandene Eier und Samen werden direkt aus Inventar/Lager angezeigt.** Vorhandene Eier können auf blauen Feldern platziert und Samen auf grünen Feldern verwendet werden, auch wenn deren Preiskatalog noch lädt. Beim Einkauf werden unbekannte Preise weiterhin nicht geraten.
- Bei Bedarf gibt es im Einkauf **Spieldaten neu laden**. Kein Konsolenbefehl nötig.

**Wichtig:** Ohne Tagesbudget/Mindestreserve kann aktiviertes Auto-Buy alle verfügbaren Coins verwenden, soweit deine gespeicherten Kaufregeln es erlauben. Das Update schaltet Auto-Buy nicht selbst ein und verändert keine Artikelregeln.

## Feldfarben

In **Felder** eine Farbe auswählen und klicken oder mit gedrückter Maus über die Kacheln ziehen:

| Farbe | Bedeutung |
|---|---|
| Grün | Pflanzen ernten, nachpflanzen, gießen und Gartenfotos |
| Blau | Eier platzieren und fertige Eier öffnen |
| Grau | Keine gezielten Feldaktionen |

Die jeweiligen Automationsschalter müssen zusätzlich eingeschaltet sein. Bestehende Pflanzen werden nicht entfernt, um Platz für Eier zu machen. Eine bereits gesendete Aktion lässt sich durch Umfärben nicht rückgängig machen. Die alte Angabe „Letzte Auswahlfelder für Eier“ ist entfernt.

**Eier platzieren:** Blaue Felder markieren → Pflanzen → „Leere blaue Felder mit Eiern füllen“ einschalten. Unter **„Welche Eier platzieren?“** zwischen **„Alle verfügbaren Eier im Inventar“** und **„Nur ausgewählte Eiertypen“** wählen. In der zweiten Einstellung lassen sich mehrere Eier über ein durchsuchbares Häkchen-Menü erlauben. Der Bot nimmt die erlaubten Eierstapel nacheinander aus deinem Inventar; favorisierte und geschützte Eier bleiben unangetastet. Er kauft hier nichts automatisch.

**Eier ausbrüten:** Unabhängig davon unter **„Welche Eier ausbrüten?“** entweder alle reifen Eier auf blauen Feldern erlauben oder gezielt mehrere Eiertypen freigeben. Wer zum Beispiel seltene Eier aufbewahren will, wählt diese beim Öffnen einfach nicht aus.

**Update-Sicherheit:** Eine bisherige Einzelwahl (z. B. Common Egg) wird beim Update auf **„Nur ausgewählte Eiertypen“** übertragen, nicht ungefragt auf alle Eier erweitert. Die vorherige Einstellung „alle reifen Eier ausbrüten“ bleibt erhalten. Beide Filter funktionieren ohne geladenen Preiskatalog, wenn die Eier im Inventar oder Garten bekannt sind.

## Bedienung und Kaufregeln

Zwölf Icon-Kacheln öffnen einzelne Bereiche. Die Kopfzeile, Start/Stop und Zurück bleiben beim Scrollen erreichbar. Feldplan, Menüposition und Auswahl bleiben gespeichert.

**Einkauf:** Kategorie → Artikel anhand seines Namens → passender Shop → Preis-/Mengenlimits → Kaufregel speichern → Auto-Buy freigeben. Bekannte Coin-Preise werden bei bewusster Artikelwahl als Preislimit vorgeschlagen. Nicht besessene Katalogartikel und ausverkaufte Artikel können vorgemerkt werden. Regeln lassen sich bearbeiten oder entfernen.

Pflanzenarten zum Behalten, Mutationen und Wetterpausen werden über durchsuchbare Mehrfachauswahl bedient. Nirgends müssen technische Kennungen eingetippt werden.

## Erhaltene Funktionen

Auto-Harvest/-Sell, Pet-Fütterung, Futtertrog, vorhandene Lagerstapel, Journalfotos, fertige tägliche Questbelohnungen, Wetter-Petteams, Wertschutz, Erntefilter, adaptive Geschwindigkeit, experimenteller Anti-AFK, begrenztes Auto-Neuladen, F8, Session-Reset und Diagnose.

Native Sperren und Favoriten haben Vorrang. Nur eine AutoFarm aktivieren. Käufe und andere Aktionen teilen sich einen seriellen Befehlsweg. Ein unbekannter Kauf-Ausgang wird nicht blind wiederholt; die Ausgabenanzeige ist nur noch Statistik, keine Tagesgrenze. Neue Kaufregeln aktivieren Auto-Buy nicht automatisch.

## Tests und Grenzen

- `node scripts/build.cjs` erzeugt dieselbe installierbare Hauptdatei.
- `node --test tests/main-upgrade.test.cjs tests/automation.test.cjs tests/reservations.test.cjs tests/field-roles.test.cjs tests/catalog-source.test.cjs`: **112 Tests**.
- `python tests/browser/compact_menu.py`, `python tests/browser/field_choices.py` und `python tests/browser/catalog_recovery.py`: **84 Chromium-Prüfungen**.

Die Browserprüfungen nutzen simulierte Spieldaten und ESM-Testmodule, nicht deinen Account. Der neue Test prüft den tatsächlichen Kataloglader samt Menü und Befehlsweg, statt Katalogdaten direkt in die Engine einzutragen. Keine Garantie für jeden zukünftigen Spielbuild; Anti-AFK bleibt experimentell. Keine Credits/Echtgeldkäufe, Trades, Pet-Verkäufe, destruktiven Umbauten oder vollständige Minispiel-Automatisierung.

[Details zu Feldfarben und Auswahl](FIELD-ROLES.md)
