# Magic Garden AutoFarm – Standalone Beta (V14)

**Experimentell – bitte noch nicht als Update für die reguläre AutoFarm veröffentlichen.**

## Ziel

Die AutoFarm soll nur Tampermonkey und Magic Garden benötigen; keine Skripte wie QPM, Garden Companion oder Arie's Mod. Im Gegensatz zu V13 liest die Beta die eigenen Spielerdaten über die **native `MagicCircle_RoomConnection.subscribeToPatches`**-Schnittstelle und beobachtet den **nativen WebSocket**. Die `Welcome`-Nachricht dient zum Identifizieren des eigenen Spielers und Initialisieren der `QuinoaCommand`-Sequenznummern. Bei fehlenden oder nicht eindeutig zuordenbaren Daten wird **keine Ernte** ausgeführt.

## Testinstallation ohne Konsole

1. Im Tampermonkey-Dashboard **alle anderen AutoFarm-Versionen deaktivieren**. Für einen klaren Test außerdem **QPM, Garden Companion, Arie's Mod und Auto-Buy vorübergehend deaktivieren** (nicht deinstallieren).
2. **[Standalone-Beta installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/feature/v14-standalone-beta/MagicGardenAutoFarm.standalone.user.js)**.
3. Magic Garden vollständig neu laden. Warten, bis im Menü **Standalone: Socket bereit, Daten bereit, Sequenz bereit** erscheint.
4. **Zunächst nur wenige, ungefährliche Felder auswählen und Start drücken.** Wichtige/seltene Pflanzen nicht testen.
5. Im Menü die Ernte- und Verkaufszahlen kontrollieren. Bei Fehlern auf **Stop** klicken und einen Screenshot des Menüs schicken. **Kein langer Konsolenmitschnitt nötig.**

## Schutz und Einschränkungen

- Geschützte, erhaltene oder nativ gelockte Pflanzen werden übersprungen.
- **Mutationen und Größe 100 sind in der Beta standardmäßig geschützt** und können im Menü einzeln ein-/ausgeschaltet werden.
- Ohne erkennbare Favoritenliste wird **Auto-Sell nicht ausgeführt**, um keine geschützten Items zu riskieren.
- Auto-Reconnect per Reload und experimenteller Anti-AFK sind **standardmäßig aus**.
- Die Beta behält die 200-Feldauswahl, Drag-Marking, Statistiken, Timer/Session-Reset, adaptive Geschwindigkeit und Diagnose bei.
- Das Spiel kann seine internen Schnittstellen jederzeit ändern. Der direkte Zugriff ist noch **nicht gegen die aktuelle Live-Version verifiziert**.
- Bei anderen installierten Skripten, die WebSocket-Befehle ebenfalls neu nummerieren, kann es erneut Sequenzkonflikte geben. Daher zuerst ohne weitere Mods testen.
- Die Beta hat absichtlich **keine automatischen Update-URLs auf `main`** und nutzt separate Beta-Präferenz- und Session-Schlüssel.

## Testabdeckung

`node --test tests/standalone.test.cjs`

Die simulierten Tests prüfen eigene Spielerdaten, Lock-/Mutationsschutz, unklare Spieleridentität, geteilte Kommandosequenzen sowie das Zurücksetzen veralteter Gartendaten beim Reconnect.

**Noch offen:** Live-Test in einem echten Magic-Garden-Tab ohne Dritt-Skripte. Die produktive `MagicGardenAutoFarm.user.js` auf `main` bleibt bis dahin unverändert.
