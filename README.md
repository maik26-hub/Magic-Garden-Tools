# 🌱 Magic Garden AutoFarm

**Automatisches Ernten und Verkaufen für [Magic Garden](https://magicgarden.gg/) – direkt im Browser über Tampermonkey.**

> **Aktuelle Version:** V13.2.1 · Inoffizielles Community-Projekt, nicht mit Magic Garden verbunden.

## 🚀 Installation

**Voraussetzungen:**
- Chrome, Brave oder ein anderer Browser mit [Tampermonkey](https://www.tampermonkey.net/)
- Das separate Userscript **Garden Companion** muss installiert und aktiviert sein. Es liefert die benötigten Spieldaten und stellt unter anderem den Pflanzenschutz bereit.

1. Installiere Tampermonkey und Garden Companion.
2. **[Magic Garden AutoFarm installieren](https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js)** – der Link öffnet bei korrekt eingerichteter Tampermonkey-Installation den Installationsdialog.
3. Klicke auf **Installieren** und öffne [Magic Garden](https://magicgarden.gg/).
4. Wähle die gewünschten Felder und klicke auf **▶ Start**.

**Wichtig:** Aktiviere nur **eine** Version von Magic Garden AutoFarm gleichzeitig. Garden Companion muss aktiv bleiben.

## ✨ Funktionen

| Funktion | Beschreibung |
| --- | --- |
| 🌾 Auto-Harvest | Erntet reife Pflanzen auf ausgewählten Feldern. |
| 💰 Auto-Sell | Verkauft nicht favorisierte Erzeugnisse automatisch, sobald mindestens 40 verkaufbare Items vorliegen. |
| ⚡ Adaptive Geschwindigkeit | Passt die Pause zwischen Ernten an Serverantwortzeiten an (75–1.000 ms). |
| 🧩 Feldauswahl | 2 × 10 × 10 Felder, dauerhaft im Browser gespeichert. |
| ⏱️ Session-Zähler | Laufzeit, Ernten, Verkäufe, verdiente Coins und Fehlerzähler lassen sich gemeinsam zurücksetzen – die Farm läuft weiter. |
| 💤 Anti-AFK (experimentell) | Sendet synthetische Mausbewegungsereignisse nach Inaktivität. **Kein garantierter Schutz vor AFK-Kicks.** |
| 🔌 Auto-Reconnect | Wartet bei Verbindungsverlust und kann nach längerer Unterbrechung kontrolliert neu laden. |
| 🔁 Auto-Resume | Setzt einen zuvor aktiven Lauf nach Neuladen im selben Tab fort. |
| 🛡️ Fehlerbehandlung | Wartet bei vorübergehenden Problemen und respektiert den Pflanzenschutz von Garden Companion. |
| ⌨️ F8-Hotkey | Startet oder stoppt die AutoFarm ohne Öffnen des Menüs. |
| 📦 Hintergrundbetrieb | Erkennt inaktive Tabs; Browser-Drosselung kann den Betrieb trotzdem verlangsamen. |
| 📋 Einklappbares, verschiebbares Menü | Start/Stop, Status, Laufzeit, Feldauswahl; Position bleibt nach F5 gespeichert. |
| 🩺 Self-Healing | Erkennt wiederholten Erntestau bei verfügbaren ungeschützten Pflanzen; pausiert und nutzt bei Bedarf begrenztes Auto-Neuladen. |
| ⚙️ Gespeicherte Einstellungen | Verkaufsschwelle, Prüfintervall, Erntepausen und Erntestau-Schwelle im Menü ändern. |
| 🔄 GitHub-Update-Anzeige | Prüft die Versionsnummer auf `main`; Tampermonkey übernimmt die eigentliche Installation. |
| 📋 Diagnose kopieren | Erstellt technische Kennzahlen ohne IDs, Rohdaten, Cookies oder Inventarinhalte. |

## 🎮 Bedienung

- **▶ Start:** AutoFarm einschalten.
- **■ Stop:** AutoFarm und Timer anhalten.
- **↺ Session zurücksetzen (Zeit + Zähler):** Laufzeit und Session-Statistiken gemeinsam auf null setzen. **Das Coin-Guthaben im Spiel bleibt unverändert.**
- **F8:** Zwischen Start und Stop umschalten (außer beim Tippen in Eingabefeldern).
- **+/−:** Menü aus- oder einklappen.
- **Grüne Felder:** Für die Ernte ausgewählt; Änderungen werden automatisch gespeichert.
- **Optionen im Menü:** Adaptive Geschwindigkeit, experimenteller Anti-AFK und Auto-Neuladen können einzeln deaktiviert werden.

## 🔧 Einstellungen und Diagnose (V13.2)

Im Menü lassen sich Auto-Sell-Schwelle, Verkaufsprüfung, minimale und maximale Erntepause sowie die Schwelle für Self-Healing ändern. Alle Werte werden im Browser gespeichert. V13.2 respektiert weiterhin die geschützten Pflanzen von Garden Companion.

Der Button **Update prüfen** liest nur die veröffentlichte Versionsnummer auf GitHub. Mit **Diagnose kopieren** werden ausschließlich technische Zähler und Statuswerte kopiert, keine Spielidentifikatoren oder privaten Daten.

## 🔄 Updates

Tampermonkey kann neue Versionen automatisch erkennen, sofern die Datei über den Installationslink installiert wurde und im Skript `@updateURL` sowie `@downloadURL` korrekt eingetragen sind.

Für neue Releases dieselbe Datei **`MagicGardenAutoFarm.user.js`** ersetzen und die Versionsnummer in `@version` erhöhen. Manuell prüfen: **Tampermonkey → Dashboard → Nach Updates suchen**.

## ⚠️ Hinweise

- **Anti-AFK ist nicht garantiert:** künstliche Browserereignisse gelten nicht als echte Benutzereingaben und können ignoriert werden.
- Das Skript benötigt den aktuellen Spielzustand und die WebSocket-Integration von Garden Companion; Spieländerungen können Funktionen beeinträchtigen.
- Geschützte Pflanzen sollen **nicht** gegen den Pflanzenschutz geerntet werden.
- Automatisierung kann gegen die Regeln des jeweiligen Spiels verstoßen. Verwendung auf eigenes Risiko.
- Keine Zugangsdaten, Cookies oder privaten WebSocket-Mitschnitte veröffentlichen.

## 🛠️ Fehlersuche

Wenn nichts passiert, prüfe, ob Magic Garden geladen ist, **Garden Companion aktiv** ist und nicht gleichzeitig eine ältere AutoFarm läuft. Weitere Statusdaten findest du mit `F12` in der Konsole:

```javascript
MGAutoFarmV13.status()
```

---

**Repository:** [maik26-hub/Magic-Garden-Tools](https://github.com/maik26-hub/Magic-Garden-Tools)
