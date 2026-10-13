# Magic Garden AutoFarm – Standalone Beta V14.0.1

**Experimentell – getrennte Beta-Datei. Die bisherige V13 auf `main` bleibt als stabile Variante bestehen.**

## Ziel

Die AutoFarm soll nur Tampermonkey und Magic Garden benötigen; keine Skripte wie QPM, Garden Companion oder Arie's Mod. Im Gegensatz zu V13 liest die Beta die eigenen Spielerdaten über die **native `MagicCircle_RoomConnection.subscribeToPatches`**-Schnittstelle und beobachtet den **nativen WebSocket**. Die `Welcome`-Nachricht dient zum Identifizieren des eigenen Spielers und Initialisieren der `QuinoaCommand`-Sequenznummern. Bei fehlenden oder nicht eindeutig zuordenbaren Daten wird **keine Ernte** ausgeführt.

## Testinstallation ohne Konsole

1. Im Tampermonkey-Dashboard **alle anderen AutoFarm-Versionen deaktivieren**. Für einen klaren Test außerdem **QPM, Garden Companion, Arie's Mod und Auto-Buy vorübergehend deaktivieren** (nicht deinstallieren).
2. **[Standalone-Beta installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.standalone.user.js)**.
3. Magic Garden vollständig neu laden. Warten, bis im Menü **Standalone: Socket bereit, Daten bereit, Sequenz bereit** erscheint.
4. **Zunächst nur wenige, ungefährliche Felder auswählen und Start drücken.** Wichtige/seltene Pflanzen nicht testen.
5. Im Menü die Ernte- und Verkaufszahlen kontrollieren. Bei Fehlern auf **Stop** klicken und einen Screenshot des Menüs schicken. **Kein langer Konsolenmitschnitt nötig.**
6. Zum Testen der neuen Funktionen **„Anti-AFK-Impulse (experimentell)“** und **„Auto-Neuladen bei längerem Offline“** im Menü aktivieren. Die Einstellungen werden separat von der V13 gespeichert.
7. Der Anti-AFK-Zähler sollte bei Inaktivität steigen. **Das beweist nur die synthetische Event-Auslösung, nicht dass Magic Garden sie als echte Aktivität akzeptiert.** Ob ein AFK-Kick wirklich ausbleibt, muss in einer längeren echten Session beobachtet werden.

## Schutz und Einschränkungen

- Geschützte, erhaltene oder nativ gelockte Pflanzen werden übersprungen.
- **Mutationen und Größe 100 sind in der Beta standardmäßig geschützt** und können im Menü einzeln ein-/ausgeschaltet werden.
- Ohne erkennbare Favoritenliste wird **Auto-Sell nicht ausgeführt**, um keine geschützten Items zu riskieren.
- Auto-Reconnect per Reload und experimenteller Anti-AFK sind **standardmäßig aus**, lassen sich aber separat einschalten.
- Der AFK-Impuls prüft alle 10 Sekunden auf Inaktivität und erzeugt dann nur synthetische Mausbewegungsereignisse. **Keine Garantie gegen AFK-Kicks**; Hintergrund-Tabs können vom Browser gedrosselt werden.
- Auto-Neuladen wartet zunächst auf die native Wiederverbindung. Es greift erst nach **90 Sekunden ununterbrochen fehlender Spielbereitschaft**, und höchstens **3-mal innerhalb von 15 Minuten**. Bei gemeldetem Netzwerkverlust wird nicht neu geladen. Ein gesundes Spiel wird durch Self-Healing nicht neu geladen.
- **Auto-Resume** kann nach Reload die Session fortsetzen; Stop deaktiviert Auto-Resume.
- Die Beta behält die 200-Feldauswahl, Drag-Marking, Statistiken, Timer/Session-Reset, adaptive Geschwindigkeit und Diagnose bei.
- Das Spiel kann seine internen Schnittstellen jederzeit ändern. Der direkte Zugriff ist noch **nicht gegen die aktuelle Live-Version verifiziert**.
- Bei anderen installierten Skripten, die WebSocket-Befehle ebenfalls neu nummerieren, kann es erneut Sequenzkonflikte geben. Daher zuerst ohne weitere Mods testen.
- Die Beta hat **eigene** `@updateURL`/`@downloadURL`-Adressen zu `MagicGardenAutoFarm.standalone.user.js` auf `main`, ohne den regulären V13-Update-Kanal zu verändern. Separate Beta-Präferenz- und Session-Schlüssel bleiben erhalten.

## Testabdeckung

`node --test tests/standalone.test.cjs`

Die simulierten Tests prüfen native Spielerdaten, Locks und Mutationsschutz, unklare Spieleridentität, Befehlssequenzen, Reconnect, AFK-Impulse bei Inaktivität, Safety-Cooldowns, Reload-Grenzen, Netzwerkoffline-Verhalten, Auto-Resume sowie die getrennten Update-Kanäle.

**Noch offen:** Eine längere Live-Session zum Prüfen, ob das Spiel die künstlichen AFK-Impulse akzeptiert und ob nach einem echten Verbindungsabbruch zuverlässig neu geladen wird. Der Nutzer hat den grundlegenden Standalone-Start bereits als funktionierend gemeldet. Die produktive `MagicGardenAutoFarm.user.js` bleibt unverändert.
