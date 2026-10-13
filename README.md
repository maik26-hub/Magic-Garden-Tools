# 🌱 Magic Garden AutoFarm

**Ein eigenständiges Tampermonkey-Userscript für [Magic Garden](https://magicgarden.gg/): automatisches Ernten, Verkaufen und Kontrollieren der Farming-Session.**

**Aktuelle Hauptversion: V14.0.3.** Inoffizielles Community-Projekt; nicht mit Magic Garden verbunden.

## 🔄 Upgrade von V13.2.3 auf V14 (ohne Link)

**In deiner vorhandenen V13.2.3:**

1. Magic Garden öffnen → AutoFarm-Menü → **Update prüfen**.
2. Die Meldung **„Update verfuegbar: V14.0.3“** erscheint (Internet/GitHub-Zugriff vorausgesetzt).
3. Auf **Installieren** klicken und die Aktualisierung **des vorhandenen Magic Garden AutoFarm-Userscripts** in Tampermonkey bestätigen.
4. Magic Garden neu laden. Das Menü und die Konsole melden V14.0.3.

Die alte V13 und die neue V14 verwenden absichtlich dieselbe Tampermonkey-Identität und denselben Pfad:
`@name Magic Garden AutoFarm`, `@namespace mg-autofarm-local`, `MagicGardenAutoFarm.user.js`.
**Es muss nicht erst eine Beta installiert oder ein neuer Link verschickt werden.**

*Erhalten bleiben* die Feldauswahl, Menüposition, gespeicherte Einstellungen, Laufzeit und Auto-Resume-Markierung (die alten Storage-Schlüssel werden weiterverwendet). V14 benötigt **weder QPM noch Garden Companion noch Arie's Mod**. Für den ersten Live-Test diese zusätzlichen Userscripts möglichst deaktivieren, damit WebSocket-Befehle nicht mehrfach nummeriert werden. Das deaktiviert keine anderen Skripte automatisch.

Neue Nutzer können direkt die [aktuelle Hauptversion installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js).

## ✨ Funktionen

| Funktion | Verhalten |
| --- | --- |
| Auto-Harvest | Erntet reife Pflanzen nur auf selbst ausgewählten Feldern |
| Auto-Sell | Verkauft nach Schwellenwert, sofern die Liste der favorisierten Items verfügbar ist; andernfalls wird nicht blind verkauft |
| Direkte Spielanbindung | Eigener WebSocket-Beobachter, eigener Garten und Inventar aus dem nativen Spielzustand; eigene Sequenzierung |
| Pflanzenschutz | Native Sperren und konservierter Status werden respektiert; Mutationen und Größe 100 standardmäßig geschützt |
| Feldauswahl | 200 Felder, per Klick oder Ziehen markieren; Speicherung über Updates hinweg |
| Adaptive Geschwindigkeit | Reagiert auf bestätigte Antwortzeiten; abgelehnte Ernten werden separat behandelt |
| Anti-AFK (experimentell) | Sendet bei Inaktivität synthetische Mausbewegungen; **kein garantierter Schutz gegen AFK-Kicks** |
| Auto-Neuladen | Bei mehr als 90 Sekunden fehlender Spielbereitschaft; maximal 3-mal in 15 Minuten, falls aktiviert |
| Auto-Resume | Setzt eine zuvor aktive Session nach dem Neuladen im selben Tab fort |
| Bedienung | F8 Start/Stop, verschiebbares Panel, Session-Reset, Statistiken und datensparsame Diagnose |
| In-Game-Updates | „Update prüfen“ liest die aktuelle Hauptversion auf GitHub; „Installieren“ öffnet die Tampermonkey-Aktualisierung |

## ⚙️ Hinweise

- **Nur eine AutoFarm-Version gleichzeitig aktivieren.** Die gesonderte Datei `MagicGardenAutoFarm.standalone.user.js` war ein früher Beta-Testkanal und soll nicht parallel zur Hauptversion laufen.
- Anti-AFK und Auto-Neuladen sind im Menü separat einstellbar. Beim Update von V13 werden bestehende Einstellungen übernommen.
- Das Spiel kann seine internen Zustands- und WebSocket-Schnittstellen ändern. Nach Updates des Spiels kann eine Anpassung nötig sein.
- Bei unbekanntem Spieler, fehlenden Gartendaten oder nicht sicherem Inventar wird vorsichtshalber nicht geerntet beziehungsweise verkauft.
- Automatisierung kann gegen die Regeln des Spiels verstoßen. Keine Cookies, Tokens, privaten WebSocket-Daten oder Login-Informationen weitergeben.
- Technische Kurzdiagnose bei Problemen: `MGAutoFarmV13.status()` (der Konsolenname bleibt aus Kompatibilitätsgründen erhalten).

## 🧪 Tests und Releases

Die Hauptversion wird mit `node --test tests/main-upgrade.test.cjs` geprüft. Für den separaten Beta-Kanal gibt es `tests/standalone.test.cjs`.

**Ein Release für bestehende V13-Nutzer muss die Version in `MagicGardenAutoFarm.user.js` anheben**. Eine neue Datei unter anderem Namen wird nicht vom alten Menü erkannt. Name, Namespace und die beiden Update-URLs dürfen nicht versehentlich geändert werden.

[Ältere Standalone-Beta und Migrationshinweise](STANDALONE-BETA.md) · [GitHub-Repository](https://github.com/maik26-hub/Magic-Garden-Tools)
