# Magic Garden AutoFarm — V15.2.2

Eigenständiges Tampermonkey-Skript für Magic Garden. Inoffizielles Community-Projekt, nicht mit dem Spiel verbunden.

## Aktualisieren

**Im bisherigen Menü: Update prüfen → Installieren → in Tampermonkey bestätigen → F5.**

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
