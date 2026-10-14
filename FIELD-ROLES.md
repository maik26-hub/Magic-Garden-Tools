# Feldfarben und Auswahlmenüs — V15.2.0

## Wo soll der Bot arbeiten?

In **Felder** eine Farbe wählen und Kacheln anklicken oder mit gedrückter Maus darüberziehen:

| Farbe | Bedeutung | Erlaubte Feldaktionen, sofern das jeweilige Modul eingeschaltet ist |
|---|---|---|
| Grün | Pflanzen | Ernten, freie Felder mit dem gewählten Saatgut bepflanzen, gießen und Garten-Journalfotos |
| Blau | Eier | Fertige Eier öffnen und auf leeren Feldern den gewählten Eiertyp nachlegen |
| Grau | Ignorieren | Keine gezielten Feldaktionen |

Mit **Farben wechseln** werden einzelne Klicks zu Grau → Grün → Blau → Grau. Bei einer Ziehgeste gilt einheitlich die neue Farbe des Startfelds. **Links füllen** und **Rechts füllen** verwenden den gewählten Farbpinsel (im Wechselmodus Grün). **Alles grau** entfernt alle Arbeitsbereiche. Die Zuordnung wird gespeichert; Farben sind zusätzlich mit P/E/– und zugänglichen Feldnamen gekennzeichnet.

Ein belegtes Feld wird nicht geräumt, um seine neue Rolle zu erzwingen: eine Pflanze auf Blau bleibt stehen, ein Ei auf Grün wird nicht ausgebrütet. Grau bezieht sich auf Feldaktionen; unabhängig aktivierte Inventar-/Shop-Funktionen ändern dadurch nicht ihre Regeln. Bereits gesendete Aktionen können nicht nachträglich durch Umfärben zurückgenommen werden.

## Umstieg

Bisher markierte V13–V15.1-Felder werden einmalig **grün**, bisher nicht markierte bleiben **grau**. Es werden keine Eierfelder erraten. Der alte Wert **„Letzte Auswahlfelder für Eier“** wird nicht mehr ausgewertet. Eierfelder müssen bewusst blau markiert werden.

Ein vorhandener neuer Plan hat Vorrang. Ist er beschädigt, bleibt der Bot für Feldaktionen vorsichtshalber auf Grau statt heimlich die alte Auswahl wieder zu aktivieren. Für einen möglichen Downgrade wird im alten Auswahlschlüssel nur Grün gespiegelt, niemals Blau.

## Alles per Menü, keine Kennungen eintippen

- **Pflanzen/Eier:** Saatgut und Eiertyp anhand der Spielnamen auswählen. Diese Optionen erscheinen erst, wenn die passende Nachlegefunktion eingeschaltet ist.
- **Schutz:** Pflanzenarten, Mutationen und Wetterpausen über durchsuchbare Mehrfachauswahl markieren. Das Suchfeld filtert Namen; es ist keine Kennungs-Eingabe.
- **Wetterteams:** Wetter und gespeichertes Petteam auswählen.
- **Einkauf:** Kategorie Saatgut/Eier/Werkzeuge/Dekoration wählen, Artikel und passenden Shop auswählen, Mengen-/Preis-/Budgetgrenzen speichern. Gespeicherte Regeln können bearbeitet oder entfernt werden.

Der Einkaufskatalog zeigt alle bekannten Artikel, nicht nur bereits besessene. Aktueller Preis, Bestand im Inventar/Lager und verbleibender Shopbestand werden angezeigt. Ausverkaufte Artikel dürfen vorgemerkt werden. Der bekannte Coin-Preis wird bei bewusstem Artikelwechsel als Preislimit vorgeschlagen; eigene Grenzen werden nicht bei jedem Status-Refresh überschrieben. Nicht mit Coins kaufbare Artikel sind nicht für neue Kaufregeln auswählbar.

Fehlen Kataloge, zeigt das Menü einen Wartestatus. Gespeicherte Auswahlwerte bleiben erhalten und werden nicht stillschweigend gelöscht. Die tatsächlichen nativen Kennungen werden ausschließlich intern gespeichert und an die unveränderten, begrenzten Kaufbefehle weitergereicht. Eine Auswahl oder gespeicherte Regel aktiviert keine Käufe von selbst. **Tagesbudget 0 = kein Einkauf.**

## Verifikation

89 Node-Regressionen und 70 Chromium-Prüfungen (36 bestehende Menütests plus 34 neue Feld-/Auswahlprüfungen). Geprüft werden unter anderem grün/blau/grau beim tatsächlichen Mock-Befehlsversand, Drag/Keyboard, Legacy-Migration, F5-Persistenz, Suche, Mehrfachauswahl, Preisvorschlag, Regelbearbeitung, schmale Fenster und der unverrückte Header.

Die Browserläufe verwenden simulierte Spielzustände und Kataloge, keine Anmeldung am Live-Spiel. Die veröffentlichten Source-/Bundle-Hashes werden vor dem Staging gegen die lokal getesteten Dateien geprüft; das normale CI baut anschließend reproduzierbar ohne Schreibrechte.
