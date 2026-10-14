# Magic Garden AutoFarm — V15.2.0

Ein eigenständiges Tampermonkey-Skript mit Auto-Harvest, Auto-Sell und einer modularen Automationszentrale. Inoffizielles Community-Projekt, nicht mit Magic Garden verbunden.

## Update: derselbe Knopf, dieselbe Installation

**Im bisherigen Menü: Update prüfen → Installieren → in Tampermonkey bestätigen → F5.**

V13-/V14-/V15-Nutzer benötigen keinen neuen Link und kein zweites Skript. Name (`Magic Garden AutoFarm`), Namespace (`mg-autofarm-local`), Download-URL und bisherige Einstellungen bleiben erhalten.

Neue Nutzer: [AutoFarm installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js).

## Neu: Grün für Pflanzen, Blau für Eier, Grau ignorieren

In **Felder** eine Farbe auswählen und klicken oder mit gedrückter Maus über die Kacheln ziehen. **Grün** erlaubt Pflanzenaktionen, **Blau** Eieraktionen, **Grau** keine gezielten Feldaktionen. Die jeweiligen Automationsschalter müssen zusätzlich eingeschaltet sein.

**Die alte Angabe „Letzte Auswahlfelder für Eier“ entfällt.** Vorhandene ausgewählte Felder werden einmalig grün übernommen; Eierfelder werden nicht geraten, sondern bewusst blau markiert. Bereits belegte Felder werden nicht zum Erzwingen ihrer neuen Rolle geleert.

## Keine Kennungen mehr eintippen

Saatgut, Eier, Artikeltypen und Shops werden aus Menüs gewählt. Pflanzenarten, gewünschte Mutationen und Wetterpausen haben eine durchsuchbare Mehrfachauswahl. Auch Wetter-Petteams benötigen keine eingetippten IDs.

**Auto-Buy:** Saatgut/Eier/Werkzeuge/Dekoration wählen → Artikel anhand des Namens wählen → passenden Shop und Zahlenlimits festlegen → Kaufregel speichern. Die Liste enthält alle im Spielkatalog bekannten Artikel, nicht nur den eigenen Besitz. Coin-Preis, Besitz und Shopbestand werden angezeigt. Ein bewusst ausgewählter Artikel übernimmt seinen bekannten Preis als Vorschlag für das Preislimit. Gespeicherte Regeln lassen sich bearbeiten und entfernen.

Unbekannte Katalogdaten werden nicht erraten; das Menü wartet und behält gespeicherte Einstellungen. **Budget 0 bedeutet keine Käufe.** Eine neue Kaufregel aktiviert nicht automatisch Auto-Buy.

[Bedienung, Migration und Testgrenzen der Feldfarben/Auswahlmenüs](FIELD-ROLES.md)

## Kompaktes Menü

Zwölf schlichte Icon-Kacheln öffnen jeweils einen Bereich. **Die Kopfzeile mit Status, Version, Verschieben und Einklappen bleibt stehen.** Start/Stop und der Zurück-Pfeil scrollen ebenfalls nicht mit. Ansicht, Position und eingeklappter Zustand werden gespeichert.

## Automationsfunktionen

| Bereich | Verhalten |
|---|---|
| Pflanzen | Gewähltes Saatgut auf leeren grünen Feldern nachpflanzen; bei Bedarf einzelne Seeds aus dem Seed Silo holen |
| Eier | Auf blauen Feldern reife Eier öffnen und gewählte Eier nachlegen |
| Pets | Hungrige aktive Pets mit passenden, günstigen, nicht favorisierten und nicht mutierten Produkten füttern |
| Futtertrog | Geeignetes Futter bis zum eingestellten Ziel nachfüllen |
| Lager | Bestehende Seed-/Tool-/Decor-Stapel auffüllen, ohne andere Items zu verdrängen |
| Gießen | Nur auf grünen Feldern, bei ausreichender Restwachstumszeit und mit Gießkannen-Reserve |
| Journal | Mit Camera fehlende Varianten aus Inventar, aktiven Pets oder grünen Gartenfeldern fotografieren |
| Quests | Fertige tägliche Belohnungen und Abschlussbonus abholen |
| Wertschutz | Gewählte Arten / wertvolle Produkte favorisieren; Verkauf wartet auf tatsächlichen Favoritenstatus |
| Erntefilter | Mindestgröße, Basiswert, gewünschte Mutationen und Wetterpausen |
| Wetterteams | Zwischen ausdrücklich ausgewählten gespeicherten Petteams wechseln |
| Shops | Freigegebene Coin-Artikel mit Tagesbudget, Reserve, Preislimit, Zielbestand und Restock-Limit kaufen |

Alle Aktionen teilen sich einen seriellen Ausführungspfad. Unklare Ergebnisse werden nicht blind wiederholt. Native Sperren und Favoriten haben Vorrang. Neue Automationsmodule sind ohne vorherige Freigabe ausgeschaltet. Das Preset **Sicherer Autopilot** aktiviert Wertschutz, Journal, Fütterung, reife Eier, fertige Questbelohnungen und vorhandene Lagerstapel; nicht Einkäufe, Nachpflanzen oder Gießen.

## Grenzen und Sicherheit

Die Feldfarben steuern Feldaktionen, nicht unabhängig aktivierte Inventar-/Shop-Regeln. Eine bereits gesendete Aktion lässt sich durch Umfärben nicht rückgängig machen. Budgetreservierungen bleiben über F5, Lobbywechsel und Session-Reset erhalten.

Keine Credits-/Echtgeldkäufe, Trades, Pet-Verkäufe oder destruktiven Umbauten. Fishing, Garden Defence und weitere Minispiele sind nicht enthalten. Anti-AFK bleibt experimentell. Spielupdates können interne Kataloge oder Befehlsformen ändern; fehlende Daten führen zum Warten statt zu geratenen Aktionen. Andere Mods können die Verbindung verändern; nur eine AutoFarm-Version gleichzeitig starten.

## Entwicklung und Tests

- `node scripts/build.cjs`: erzeugt die einzige installierbare Hauptdatei `MagicGardenAutoFarm.user.js`.
- `node --test tests/main-upgrade.test.cjs tests/automation.test.cjs tests/reservations.test.cjs tests/field-roles.test.cjs`: 89 Regressionen.
- `python tests/browser/compact_menu.py` und `python tests/browser/field_choices.py`: 70 Chromium-Prüfungen mit simulierten Spielzuständen, keine Live-Account-Tests.

[Protokollgrundlage und Grenzen der ursprünglichen Automation](AUTOMATION.md) · [Aktuelle Feldzuordnung](FIELD-ROLES.md)
