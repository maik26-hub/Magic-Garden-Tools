# Magic Garden AutoFarm — V15.1.0

Ein eigenständiges Tampermonkey-Skript mit Auto-Harvest, Auto-Sell und einer modularen Automationszentrale. Inoffizielles Community-Projekt, nicht mit Magic Garden verbunden.

## Update: derselbe Knopf, dieselbe Installation

**Im bisherigen Menü: Update prüfen → Installieren → in Tampermonkey bestätigen → F5.**

V13-/V14-Nutzer benötigen keinen neuen Link und kein zweites Skript. Name (`Magic Garden AutoFarm`), Namespace (`mg-autofarm-local`), Download-URL, Feldauswahl und die bisherigen Einstellungs-/Timer-Schlüssel bleiben unverändert.

Neue Nutzer: [AutoFarm installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js).

## Oberfläche V15.1

Das kompakte, dunkelbraune Menü hat vier Bereiche: **Farm**, **Felder**, **Automatik** und **Optionen**. Die Titelleiste liegt außerhalb des Scrollbereichs und bleibt mit Status, Versionsnummer und Einklappen-Button immer sichtbar. Verschieben, Einklappen und gespeicherte Positionen funktionieren weiterhin.

Pflanzenarten, Mutationen und Wetter werden über **durchsuchbare Mehrfachauswahlen mit Checkboxen** gewählt, nicht mehr über kommaseparierte IDs. Bei Wetter-Petteams gibt es ebenfalls eine Auswahlliste. Intern bleiben dieselben Werte gespeichert; alte Auswahlen werden auch dann beibehalten, wenn ein Katalogeintrag aktuell fehlt. Leere Kataloge werden als Wartezustand angezeigt. Pro Mehrfachauswahl gilt weiterhin das bestehende Limit von 40 Einträgen.

UI-Regressionsprüfung: `python tests/ui-browser.py` mit Playwright und Chromium (optional `CHROMIUM_PATH`). Der Test läuft vollständig auf `about:blank` mit simulierten Spieldaten, ohne Spiel- oder Netzwerkaktionen. Er prüft Scrollen, Verschieben, schmale Ansichten, Mehrfachauswahl/Suche, alte Einstellungen, Feldeingaben, Start/Stop und den vorhandenen Update-Button.

## Die neue Automationszentrale

Neue Aktionen sind beim Upgrade **zunächst aus**. Im Menü lassen sie sich einzeln freigeben. **„Sicherer Autopilot“** aktiviert Wertschutz, Journal, Pet-Fütterung, fertige Eier, Quest-Belohnungen und das Auffüllen vorhandener Lagerstapel — keine Einkäufe, kein Nachpflanzen und kein Gießkannenverbrauch.

| Bereich | Implementiertes Verhalten |
|---|---|
| Pflanzen | Gewähltes Saatgut auf ausgewählten leeren Feldern nachpflanzen; bei Bedarf einzelne Seeds aus dem Seed Silo holen |
| Eier | Reife Eier ausbrüten; gewählte Eier auf reservierten leeren Auswahlfeldern nachlegen |
| Pets | Hungrige aktive Pets mit passenden, günstigen, nicht favorisierten und nicht mutierten Produkten füttern |
| Futtertrog | Geeignetes Futter bis zum eingestellten Ziel nachfüllen |
| Lager | Bestehende Seed-/Tool-/Decor-Stapel auffüllen, ohne andere Items zu verdrängen oder wahllos umzusortieren |
| Gießen | Nur bei ausreichender Restwachstumszeit und verbleibender Gießkannen-Reserve |
| Journal | Mit vorhandener Camera noch fehlende Varianten aus Inventar, Garten oder aktiven Pets fotografieren |
| Quests | Fertige tägliche Belohnungen und Abschlussbonus abholen; bereits freigegebene Aufgaben passend priorisieren |
| Wertschutz | Gewählte Arten / wertvolle Produkte favorisieren; Verkauf wartet auf tatsächlichen Favoritenstatus |
| Erntefilter | Mindestgröße, Basiswert, gewünschte Mutationen und Wetterpausen |
| Wetter-Teams | Zwischen ausdrücklich ausgewählten, bereits gespeicherten Petteams wechseln |
| Shops | Ausschließlich freigegebene Seed-/Egg-/Tool-/Decor-Artikel mit Coin-Budget, Mindestreserve, Preislimit, Bestandsziel und Restock-Limit kaufen |

Alle Aktionen teilen sich **einen seriellen Ausführungspfad**. Ergebnisse werden über Serverantworten zugeordnet. Ein unklarer Ausgang wird nicht blind wiederholt; bei Favoriten-Toggles verhindert eine dauerhafte lokale Reservierung ein versehentliches Entsperren.

## Einmal konfigurieren

Saatgut und Eier wählst du im Menü selbst aus. Kaufregeln benötigen Artikel, Shop, Stückpreislimit und Zielbestand; zusätzlich Tagesbudget und Coin-Reserve. **Budget 0 bedeutet keine Käufe.** Das Tagesbudget ist konservativ pro Browser-Spiel-Origin und UTC-Tag gespeichert und wird nicht durch F5, Lobbywechsel oder Session-Reset gelöscht. Ein nicht bestätigter Kauf kann weitere Käufe sperren.

Native Sperren sowie der bisherige Mutations-/Max-Größen-Schutz haben Vorrang vor Erntefiltern. Bei fehlenden Preisen, Katalogen, Spieler- oder Inventardaten wartet das betroffene Modul statt zu raten. Status und „Plan prüfen“ stehen im Menü; kein Konsolen-Suchen nötig.

## Grenzen

Das ist **keine belegte 90–100-%-Automatisierung des gesamten Spiels**. Minispiele/Fishing/Garden Defence, Handel, Pet-Verkäufe, destruktives Umgestalten, gezielte Weltbewegung, Credit-/Echtgeldkäufe und beliebiger Trank-/Kristallverbrauch sind nicht enthalten. Nicht jede Quest wird automatisch lösbar. Anti-AFK bleibt experimentell; Browser oder Server können synthetische Bewegungsereignisse ignorieren.

Die Befehlsformen wurden am öffentlichen Spielbuild 1517 geprüft. Automatisierte Tests und Browser-Tests verwenden simulierte Spieldaten; ein echter Langzeittest sämtlicher neuer Module ist weiterhin nötig. Andere Mods können die Verbindung verändern; nicht mehrere AutoFarm-Versionen parallel starten.

## Entwicklung

- `src/core-v14.user.js`: unveränderte Basis der bisherigen Hauptversion.
- `src/automation-core.js`: Regeln, Planung, Budget und Bestätigungen.
- `src/automation-ui.js`: Menü und Konfiguration.
- `node scripts/build.cjs`: erzeugt die **einzige** installierbare Hauptdatei `MagicGardenAutoFarm.user.js`.
- `node --test tests/main-upgrade.test.cjs tests/automation.test.cjs tests/reservations.test.cjs`: aktuelle Regressionen.

[Protokollgrundlage und Testgrenzen](AUTOMATION.md)
