# Magic Garden AutoFarm – V16.2.0

## Neu in V16.2.0: Bestehenden Bestand nach aktuellen Regeln behandeln

- **Crops: Live-Schutz statt F5.** Wenn du den eigenständigen Mutations- oder Größenschutz abschaltest, wird ein früher wegen Schutz übersprungener Grow-Slot beim nächsten Scan erneut geprüft – ohne 30-Minuten-Alt-Cooldown. Native Pflanzensperren bleiben weiterhin geschützt.
- **Auto-Favoriten nur mit Eigentumsnachweis wieder freigeben.** Die AutoFarm protokolliert ab dieser Version, welche konkreten Crops **sie selbst** favorisiert hat. Nach einer Regeländerung löst sie diese bot-eigenen Favoriten beim nächsten aktiven Verkaufslauf automatisch und berücksichtigt anschließend auch älteren Bestand. Manuelle Favoriten, ausdrücklich gesperrte Pflanzen und unklare Server-Toggles bleiben unangetastet.
- **Wichtig bei alten Favoriten aus früheren Versionen:** Es gibt keinen zuverlässigen Herkunftsnachweis. Sie werden aus Sicherheitsgründen nicht automatisch entmarkiert. Falls du sie verkaufen möchtest, musst du den alten manuellen/unklaren Favoriten einmal im Spiel entfernen.
- **Pet Auto-Sell: Vollständiger Portfolio-Vergleich.** Auch wenn ein Pet **drei verschiedene Fähigkeiten** besitzt, darf es erst als surplus markiert werden, wenn **jede** Fähigkeit bei Max STR durch aktuell reservierte Team-Pets mindestens gleich gut abgedeckt wird. Unterschiedliche Ersatz-Pets dürfen unterschiedliche Fähigkeiten abdecken. Fehlende oder unbekannte Daten blockieren den Verkauf.
- **Aktuelle Regel ist entscheidend, nicht Erhaltszeitpunkt:** Die Prüfung läuft über den gesamten vorhandenen eigenen Bestand inklusive Inventar, aktiver Pets und Pet Hutch. Teamreservierungen und aktueller Herkunftsei-Filter werden vor jedem möglichen Verkauf erneut validiert. Nur freigegebene, im Inventar liegende Pets können verkauft werden; Favoriten, Sperren, Mutationen und Teammitglieder bleiben geschützt. Bereits unsichere native Verkaufsversuche bleiben gegen Doppelverkauf gesperrt.
- Keine neue Pflichtoption und kein Farm-Modus. Erklärungen stehen hinter ⓘ.

## Neu in V16.1.0: Kombinierte Aktions-Teams

Der eigene Team Builder speichert neben Einzel-Effekt-Teams auch echte **Kombinations-Teams**:

- **Eier öffnen / Hatch:** Max-STR beim Schlüpfen, Double Hatch, Pet-Mutationen und Hatch-XP werden gemeinsam bewertet und auf maximal drei Pets verteilt. Ein Pet mit mehreren passenden Fähigkeiten trägt zu **allen** seinen Effekten bei – nicht nur zu einem.
- **Pflanzen verkaufen:** Sell Boost und Crop Refund in einem Team.
- **Pets verkaufen:** Magic Dust Boost und Pet Refund, wenn beide Fähigkeiten sicher im aktuellen Katalog vorliegen.
- **AFK-Kombos:** Wachstum und Brutzeit sowie Coins/Pet-XP zusammen mit passiver Hunger-Unterstützung, sofern geeignete Pets vorhanden sind. Wettergebundene Fähigkeiten werden nicht als immer aktiv gewertet.

Die neuen Pläne haben stabile Schlüssel (`combo:hatch#active`, `combo:cropSale#active`, `combo:petSale#active`, `combo:growEggs#afk`, `combo:coinsXp#afk`). Sie werden mit **derselben** nativen Team-ID verbessert, statt fortlaufend neue Team-IDs anzulegen. Ein manueller Eingriff in gespeicherte Teams pausiert die Automatik für dieses Team. AutoFarm kann vor einem Hatch oder Verkauf standardmäßig das passende Combo-Team wählen, sofern Teamwechsel aktiviert und vom Spiel bestätigt sind. Einzelteams wie Seed Finder I/II/III/IV bleiben bestehen.

Die Gewichtung normalisiert Fähigkeiten je Effekt-Familie und benutzt eine abnehmende Zusatzwirkung weiterer Pets derselben Familie. Es sind **Planungs-Heuristiken** aus den spielseitig geladenen Effektwerten, keine Garantie für Gold-/Hatch-Ergebnisse. Pet-Verkauf bleibt weiter getrennt aktivierbar und vorsichtig.


Lokale, installierbare Testversion auf Basis der V15.4.0 aus
maik26-hub/Magic-Garden-Tools. **Nicht auf GitHub veröffentlicht.**

## Installieren

1. Die bisherige AutoFarm in Tampermonkey sichern (Export oder Codekopie).
2. Die vorhandene „Magic Garden AutoFarm“ im Tampermonkey-Editor öffnen.
3. Den kompletten Code durch den Inhalt von `MagicGardenAutoFarm-V16-Test.user.js`
   ersetzen und speichern. Die gleichnamige TXT enthält exakt denselben Code.
4. Magic Garden neu laden. Oben muss `v16.2.0` stehen.
5. Nur **eine AutoFarm** aktiv lassen. Andere Farm-Skripte nicht parallel ausführen.

Name und Namespace bleiben gleich. Die bisherigen Feldfarben, gewählten Eier,
Kaufartikel und übrigen Einstellungen werden weiterverwendet. Beim ersten
V16-Start läuft die Farm **nicht automatisch an**. Pet Auto-Sell, der neue
Team-Builder, automatische Teamwechsel und der alte optionale Aries-Sync
bleiben zunächst aus. Diese Module ausdrücklich im Menü freigeben und Start
drücken. Spätere Neuladungen können die bestehende Auto-Resume-Funktion nutzen.

## Was umgesetzt ist

**Pet-Manager 2.0.** Erzeugt eigene Vorlagen pro tatsächlichem Effekt sowie
passive AFK-Kombinationen mit Hunger-Unterstützung. Vergleicht individuelle
Fähigkeiten und projizierte Max-STR, nicht einfach Pet-Seltenheiten. Auch die
ungewöhnliche Benennung `EggGrowthBoostII_NEW` wird über native Werte statt
lexikografisch nach „II“ bewertet. Pet-XP-Teams lassen einen Trainingsplatz frei.
Alle Vorlagen werden lokal pro Spieler gespeichert; bei laufender Farm werden
sie einzeln mit `SavePetTeam` im Spiel gespeichert. Verbesserungen verwenden
dieselbe Team-ID. Unveränderte Teams werden nicht ständig neu geschrieben.
Manuelle Änderungen an verwalteten Team-Mitgliedern führen zu einer Pause,
nicht zu stillem Überschreiben. Alte/unpassende Vorlagen werden nicht blind gelöscht.
Serverseitig abgewiesene oder unbestätigte Speicherungen werden sichtbar angezeigt.

**Teamwechsel.** Separater Schalter. Zum Eieröffnen, Pflanzen- und Pet-Verkauf
kann ein passendes Effekt-Team eingesetzt werden. Die Aktion wartet auf den
tatsächlich beobachteten Wechsel. Danach Rückkehr zum vorherigen Team; eine
zwischenzeitliche manuelle Änderung wird respektiert. Ein AFK-Team für Wartezeiten
lässt sich separat aus den erzeugten AFK-Vorlagen wählen. Stop unterbricht neue
Aktionen; eine ausstehende Rückkehr wird beim nächsten Start versucht.

**Pet Auto-Sell.** Ei-Gruppen per Auswahl freigeben und einschalten. Nur Pets
mit vollständig bekannten, bei Max-STR von einem reservierten Pet abgedeckten
Fähigkeiten kommen infrage. Favoriten, Sperren, Mutationen, aktive/gespeicherte
Team-Pets und gelagerte Pets bleiben geschützt. Fehlende Journal-Einträge und
das alte Fünf-Pets-Limit blockieren nicht mehr pauschal. Unbekannte Herkunftseier
oder unbekannte individuelle Effekte werden nicht geraten. Die Vorschau zeigt
einen konkreten Grund. Eine reine positive Antwort zählt nicht als Verkauf:
das genaue Pet muss danach aus dem vollständigen eigenen Bestand verschwunden
sein. Bei fehlender normaler Antwort kann der beobachtete Zustand bestätigen.
Unklare Ergebnisse lösen keine blinden Sofortwiederholungen aus. Eine Tabsperre
verhindert parallele AutoFarm-Pet-Verkäufe in mehreren Browser-Tabs.

**Auto-Buy.** Kategorie/Artikel und gewünschter Gesamtbestand; fertig.
Der Bot sucht passende aktuelle Shops und verwendet die verifizierten
Coin-Preise. Kein Tagesbudget, keine Mindestreserve, keine alte versteckte
Preis-/Restock-Obergrenze. Inventar und Lager zählen zum Zielbestand.
Keine Credits/Echtgeldkäufe. Unbekannte Preise oder ein noch unbestätigter
vorheriger Einkauf stoppen weitere Käufe mit einer Statusmeldung.

**Bedienung.** Funktionen einzeln ein-/ausschalten, keine vorgegebenen Farm-Modi.
Auch Ernten und Pflanzenverkauf sind separat schaltbar. Unnötige Unterfelder
verschwinden bei ausgeschalteter Funktion. Erklärungstexte sind hinter kleinen
ⓘ-Symbolen: 1,2 Sekunden Hover/Fokus, alternativ Klick/Touch. Escape oder
Klick außerhalb schließt sie. Kopfzeile und Start/Stop bleiben beim Scrollen
stehen. Zentraler Pflanzenschutz fasst die bisherigen Pflanzen-Schutzschalter
zusammen; native Sperren/Favoriten und Team-Pets werden immer respektiert.

## Grenzen dieser Testversion

Die Tests verwenden simulierte native Spielzustände – **keinen angemeldeten
Spielaccount**. Ein bestandener Test belegt daher nicht, dass ein neuer
Spielbuild jede interne Schnittstelle unverändert anbietet. Vor dem ersten
unbeaufsichtigten Lauf einen einzelnen Verkaufs- und Wechselvorgang beobachten.
Es wird nichts auf GitHub gepusht und kein Hintergrund-Deployment ausgeführt.

Der Team-Builder ist eigenständig, nach dem besprochenen Prinzip. Er liest
**nicht** Aries' interne Vorschlagskarten und verspricht keine identischen
Aries-Ergebnisse. AFK-Unterstützung ist eine vergleichende Schätzung; keine
garantierte Laufzeit oder mathematisch gesicherte optimale Kombination.
Unbekannte neue Parameter schützen ein Pet vorsichtshalber vor Auto-Sell.
Es werden keine Platzhalter-Pets eingesetzt. Spielseitige Team-Limits oder
fehlende Berechtigungen können die native Speicherung blockieren; die lokalen
Vorlagen und Meldungen bleiben erhalten. Die Routinefunktionen benötigen kein
Aries/QPM/Garden Companion; der ältere manuelle Aries-Sync ist nur optional.

## Nachprüfen und zurückrollen

`delivery-status.json` und `test-report.json` nennen die ausgeführten Tests und
SHA-256 der konkreten Testdatei. Die Browserberichte und Screenshots befinden
sich in `test-output/`. Die Logs liegen in `validation-logs/`.

Zum Zurückrollen den Code aus `backup/MagicGardenAutoFarm-V15.4-Backup.user.js`
in derselben Tampermonkey-Installation speichern und neu laden. Die V16-Datei
nicht zusätzlich zur alten AutoFarm aktiv lassen. V16-spezifische lokale
Teamvorlagen können im Browser verbleiben; vorhandene Spielteams werden beim
Zurückrollen nicht automatisch gelöscht.

## Lokale Entwicklerprüfungen

```
node scripts/build.cjs
python scripts/verify.py
```

Node 22, Python 3 und Playwright mit Chromium werden für dieselben Prüfungen
benötigt. Der Chromium-Pfad kann über `CHROMIUM_PATH` gesetzt werden.
Die historischen V13/Standalone-Beta-Tests sind nicht Teil dieses Hauptkanals;
die Hauptversions-, Feld-, Katalog-, Kauf-, Schutz-, Pet- und V16-Tests werden
vom Prüfskript explizit ausgeführt. Keine Browser-Anmeldung erforderlich.
