# Feldfarben und Auswahlmenüs — V15.2.2

## Wo soll der Bot arbeiten?

In **Felder** eine Farbe wählen und Kacheln anklicken oder mit gedrückter Maus darüberziehen:

| Farbe | Bedeutung | Erlaubte Feldaktionen, sofern das Modul eingeschaltet ist |
|---|---|---|
| Grün | Pflanzen | Ernten, freie Felder mit gewähltem Saatgut bepflanzen, gießen, Garten-Journalfotos |
| Blau | Eier | Fertige Eier öffnen und auf leeren Feldern den gewählten Eiertyp nachlegen |
| Grau | Ignorieren | Keine gezielten Feldaktionen |

Mit **Farben wechseln** laufen einzelne Klicks durch Grau → Grün → Blau → Grau. Eine Ziehgeste verwendet einheitlich die neue Farbe des Startfelds. Links/Rechts füllen verwenden den gewählten Farbpinsel; Alles grau entfernt die Arbeitsbereiche.

Ein belegtes Feld wird nie geleert, um seine neue Rolle zu erzwingen: Pflanzen auf Blau bleiben stehen, Eier auf Grün werden nicht ausgebrütet. Grau bezieht sich auf Feldaktionen, nicht unabhängig aktivierte Inventar-/Shop-Regeln. Bereits gesendete Aktionen können nicht zurückgenommen werden.

## Umstieg

Bisher markierte V13–V15.1-Felder werden einmalig grün. Eierfelder müssen bewusst blau markiert werden. Ein vorhandener neuer Plan hat Vorrang; ein beschädigter Plan aktiviert nicht heimlich die alte Auswahl. Für einen Downgrade wird im alten Auswahlschlüssel nur Grün gespiegelt. Ein Update von V15.2.0 verändert die Farben nicht.

## Auswahl statt Kennungen

Pflanzen, Eier, Wetter, Petteams und Artikel werden anhand ihrer Namen gewählt. Pflanzenarten zum Behalten, Mutationen und Wetterpausen bieten eine durchsuchbare Mehrfachauswahl. Das Suchfeld filtert Namen und erzeugt keine Befehlskennung.

**Ab V15.2.2:** Die Menülisten kombinieren erkannte Spielkataloge mit tatsächlichen Inventar-/Shop-Artikeln. So sind eigene Eier und Samen bereits vor vollständigem Laden der Preisdaten auswählbar. Die tatsächlichen Kennungen kommen aus diesen Daten, nicht aus geratenen Standardlisten.

**Eier ab V15.2.2:** Blaue Felder → Pflanzen. **„Welche Eier platzieren?“** bietet „Alle verfügbaren Eier im Inventar“ oder „Nur ausgewählte Eiertypen“ (Mehrfachauswahl mit Suchfeld). Unabhängig davon kontrolliert **„Welche Eier ausbrüten?“**, ob alle reifen Eier oder nur bestimmte Eiertypen geöffnet werden dürfen. Der ausgewählte Modus wirkt nur, wenn der dazugehörige Platzieren-/Ausbrüten-Schalter sowie Automationszentrale und AutoFarm aktiviert sind. Eier werden nicht durch diesen Schalter gekauft. Favorisierte und gesperrte Eier bleiben beim Platzieren geschützt.

Bei Bestandsfilter „alle“ arbeitet der Bot die erlaubten Eierstapel aus dem **Inventar** nacheinander ab; Lagereier werden nicht automatisch entnommen. Beim Ausbrüten berücksichtigen die Filter reife Eier **nur auf blauen Feldern**. Die Menüs enthalten auch Eiertypen, die bereits auf blauen Feldern liegen, selbst wenn der Spielkatalog noch nicht geladen ist. Ohne freigegebene Eiertypen bewirkt „Nur ausgewählte“ bewusst keine Aktion.

**Migration V15.2.1 → V15.2.2:** Eine alte Einzelwahl `eggId` wird als exakte Platzierungs-Erlaubnis übernommen (nicht stillschweigend auf alle erweitern). Alte Ausbrütregeln waren „alle“ und bleiben zunächst so. Beide Filter werden separat gespeichert.

**Einkauf:** Kategorie → Artikel → passender Shop → Preislimit, Zielbestand und Menge pro Restock → Kaufregel speichern. Unbekannte Preise werden als noch ladend gekennzeichnet; neue Käufe brauchen weiterhin bestätigte Coin-Preise. Ausverkaufte, bekannte Artikel lassen sich vormerken. Preisvorschläge überschreiben eigene Grenzen nicht bei jeder Aktualisierung.

**Kein Tagesbudget, keine Coin-Mindestreserve.** Alte Werte werden nicht mehr ausgewertet. Aktiviertes Auto-Buy kann alle vorhandenen Coins bis zu den Grenzen deiner Artikelregeln verwenden. Das Speichern einer Regel schaltet Auto-Buy nicht selbst ein. Keine Credits/Echtgeldkäufe.

## Katalogfehler

Der Lader nutzt Ressourcenbeobachtung, eigene Skript-/Preload-Elemente und deren Import-Verweise statt nur eines festgelegten Dateinamens. Er lädt automatisch nach und verwendet erfolgreiche Ergebnisse wieder. Der Knopf **Spieldaten neu laden** im Einkauf startet einen neuen Versuch; Diagnose ist im Menü verfügbar. Hängende Anfragen haben Zeitlimits. Gespeicherte Auswahl geht nicht verloren.

## Verifikation

112 Node-Regressionen und 84 Chromium-Prüfungen. Feldfarben, Drag/Keyboard, Migration, Persistenz, Namenssuche, Kaufregelbearbeitung, unverrückter Header sowie Katalogwiederherstellung aus verspäteten/umbenannten Testmodulen werden geprüft.

Die Browserläufe nutzen simulierte Spielzustände, keine Live-Anmeldung. Der zusätzliche Test führt den echten gebündelten Lader aus; eigene Eier werden vor Preisdaten platziert und ein freigegebener Kauf funktioniert trotz alter Budget-/Reservewerte. Die verteilte Datei wird reproduzierbar gebaut.
