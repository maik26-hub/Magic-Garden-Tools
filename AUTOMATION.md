# V15 — Automation architecture and verification

## Scope and provenance

This is a standalone expansion of the existing AutoFarm release, not another userscript channel. All new automation is opt-in. The primary technical sources inspected were the **public game build 1517**, specifically:

- `https://magicgarden.gg/version/1517/assets/QuinoaCanvas-CzorzMCH.js`: native command schemas, including PlantSeed, GrowEgg, HatchEgg, FeedPet, WaterPlant, MoveItem, ToggleLockItem, ApplyPetTeam, LogItem, PurchaseShopItem, ClaimDailyQuestReward, ClaimDailyQuestBonus.
- `https://magicgarden.gg/version/1517/assets/BakedRoundedRect-Ve0XUP6_.js`: inventory/own-player schema, daily quest schema, plant/pet/egg/tool/decor/mutation catalogs and value/feeding helpers.
- `https://magicgarden.gg/version/1517/assets/bootScreen-7kOnKFcr.js`: current shop identifiers.
- Garden Companion public source at commit `6129f70b6858daa6551f0d203a9b9660d03ccb73`: additional examples for FeedPet, PlantSeed, MoveItem, journal actions and native connection state. This is a research/reference source, **not a runtime dependency**. Upstream: `https://github.com/Liam0306dis/garden-companion`, MIT license, copyright 2026 Liam.

Public game bundles and their artwork are not redistributed in this repository. The runtime imports only a matching **already-loaded same-origin game module**, identifies catalog exports structurally and waits when those catalogs are missing. No unrelated URL, foreign userscript, eval, private account credential or developer/debug command is used.

## Data and action boundaries

The native `MagicCircle_RoomConnection.subscribeToPatches` provides the own player's state, matched against the Welcome identity. A connection generation prevents old sockets from overriding new data. The game and bot share one socket command sequencer. Pending actions are cancelled as **unknown outcome** on a connection replacement; they are not assumed unexecuted.

One main farming loop calls the new scheduler. It sends at most one native command at a time, rechecks ownership, preferences and current state immediately before dispatch, and waits for the matching result. New tasks do not create parallel timer-based command loops.

The operator's existing selected fields are the only planting/egg/watering/harvest area. Plants are never removed to make space. Egg allocation uses the final N selected tile indices, not arbitrary empty ground outside the selection.

## Price and inventory rules

Produce base value uses the inspected native formula: linear size multiplier over sizes 50–100, one Growth multiplier, and additive non-Growth mutation contributions. It excludes friend/sale bonuses and is labelled **Basiswert** in the UI. Unknown species or mutation values are not guessed.

Pet feeding uses the verified species diet and `coinsToFullyReplenishHunger` (with the older `maxHunger` field as a compatibility fallback). It never consumes favorited, protected, mutated or over-limit food. A feeding trough is filled only within its confirmed capacity.

The native sale command is **SellAllCrops**, not a fictional per-item SellCrop API. Smart sale therefore waits until known keep-items are truly favorited, relevant journal entries are acknowledged and eligible hungry pets can be fed. It cannot give a transactional guarantee against simultaneous server grants or actions from another browser.

A favorite command is a **toggle**. A reserved toggle target is not retried automatically after an ambiguous result, including after F5. User favorites are never automatically toggled off. Local safety receipts and spending reservations are deliberately not cleared by the ordinary session-statistics reset.

## Spending

Only normal **coin** PurchaseShopItem commands are implemented. Every purchase needs an explicit rule, current native price, live stock/restock identity, available inventory room, per-restock limit, target holding limit, daily budget and reserve. Prices that are Infinity or unknown are not eligible.

Spending is pessimistically reserved **before** dispatch. A browser-origin-wide Web Lock and a shared UTC-day budget prevent two tabs or room identity changes from duplicating the allowance. Costs remain reserved on a timeout or rejection. The next purchase waits for the server's restock purchase count to advance; simultaneous legitimate income must not be mistaken for missing purchase confirmation. No credits, paid checkout, trades, pet selling or developer commands are allowed.

## Verification and known limitations

Run:

```sh
node scripts/build.cjs
node --test tests/main-upgrade.test.cjs tests/automation.test.cjs tests/reservations.test.cjs
```

Automated tests cover module activation gates, native schemas, stock/budget enforcement, favorites, ambiguous outcomes, scene ownership, reconnects, existing update identity and legacy preferences. A Chromium DOM integration test with **mock game state/catalogs** exercised menu choices, three confirmed PlantSeed operations, a locked tile remaining untouched, purchase-rule editing with purchases disabled, drag field deselection and the session counter reset.

These are not live account tests. The game may change internal module names, state shapes or server-side eligibility. Unsupported modules must report a wait/block condition rather than send guessed commands. A full live acceptance pass (farming, feeding, hatching, camera, reward claim, storage, one bounded purchase, reconnection) is still required. No percentage of total game automation is asserted.

## V16.3.2 – Pet Auto-Sell und optionales Ghost Capture

- Auto-Sell bewertet den gesamten aktuellen Bestand in Inventar und Pet Hutch, unabhängig davon, wann ein Pet erhalten wurde. Favoriten, Mutationen, aktive und gespeicherte Teams sowie alle benötigten Boost-Reserven bleiben geschützt. Unbekannte Herkunftseier oder unvollständige Zuordnungen werden nicht geraten.
- Überschüssige Hutch-Pets werden einzeln ins Inventar übertragen. Die gemeinsame Command-Pipeline wartet auf die konkrete ID im Inventar und ihr Verschwinden aus dem Hutch. Vor SellPet erfolgt eine neue vollständige Prüfung.
- Unklare Ergebnisse bleiben über Reloads und Tabs gesperrt. Nur explizite Serverablehnungen erlauben höchstens drei Versuche mit jeweils mindestens 30 Sekunden Abstand. Spät bestätigte Transfers werden im nächsten aktuellen Portfolio berücksichtigt.
- Auto Ghost Capture ist standardmäßig aus und unter Journal & tägliche Quests einschaltbar. Benötigt gehaltene Kamera, bestätigte Nacht, Kameraziel und explizite aktuelle Ghost-Instanz mit sichtbarem Status aus nativen Jotai-Atoms. Der Logger belegt den Befehl, aber keine allgemein verfügbare Instanz-/Sichtbarkeitsstruktur: stellt der Spielbuild diese Daten nicht bereit, bleibt die Funktion mit sichtbarer Diagnose wartend. Keine Rekonstruktion oder Wiederverwendung geloggter IDs.
- Ghost-Fotos laufen einzeln durch die bestehende Command-Pipeline, höchstens alle zehn Sekunden. Bestätigung benötigt passende erfolgreiche QuinoaCommandResult-Antwort und einen geänderten serverseitigen Fang mit eigener Photographer-ID. Jede Instanz wird höchstens einmal versucht; keine automatischen Wiederholungen unklarer Fotos.
- Scriptname, Namespace, Datei MagicGardenAutoFarm.user.js und beide Update-URLs auf main bleiben gleich. Update über den vorhandenen Versionsbutton und Tampermonkey.
