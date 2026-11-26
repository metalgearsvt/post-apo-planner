# Reverse-engineering notes and extraction tools

How `data/game/` was produced, and what we know about the game's save format.
Raw game files (APK, JS bundle, images) live in `re/`, which git ignores. **Never commit them.**

## What the app is

- `studio.powerplay.tycoonwrapper` 1.0.67 is a **Flutter wrapper** around a **WebView game**.
- The APK only ships art (`assets/flutter_assets/lib/assets/webview_game/public/images/`, 444 PNGs) and sounds.
- The game code is a single JS bundle served by `https://postapo-tycoon-live.powerplay.studio/public/bundle-<hash>.js`.
  The page needs a per-player session token, so it can only be opened through the app.
- The bundle is not minified. It's ~126 source files joined with `//# sourceURL=<file>.js` markers, and identifiers are often Slovak
  (`hrac` = player, `mesto` = town, `polution`, `otocenie` = rotation, `cena` = price).

## Refreshing the data (Android emulator)

1. Android Studio emulator, **Google APIs** x86_64 image (API 34). Its debuggable system build exposes every WebView to DevTools.
2. `adb install-multiple base.apk split_config.arm64_v8a.apk split_config.en.apk split_config.xxhdpi.apk`
3. Start the game (a guest account is fine; it gives clean base values) and get past the loading screen.
4. Find the socket and forward it:
   ```
   adb shell "cat /proc/net/unix | grep devtools_remote"     # -> @webview_devtools_remote_<pid>
   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
   curl http://127.0.0.1:9333/json                           # copy the "Post apo Tycoon" webSocketDebuggerUrl
   ```
5. Dump and extract (read-only, nothing in the game is changed):
   ```
   node tools/re/cdp_dump.mjs    <ws> re/web/live          # page resources, scripts, storage (tokens redacted)
   node tools/re/cdp_extract.mjs <ws> re/web/data/tables.json "BUILDINGS,TERRAINS,upgrades,CATEGORY_NAMES,TILE_CATEGORY_NAMES,COMBINATION_DATA,STILE_SETTINGS,ROCKET_TYPES,ARTIFACTS,BOOKS,BOOK_BONUSES,ACHIEVEMENTS_DATA,EXPAND_RULES,MEGA_CITIES,BUILDABLE_MEGA_CITIES,TOWN_UPGRADE_DEF_COSTS,PUMPKIN_FARM_LEVELS,TURKEY_FARM_LEVELS,RABBITS_FARM_LEVELS"
   node tools/re/cdp_extract.mjs <ws> re/web/data/levels.json  "<every ALL_CAPS const in town_levels_config.js>"
   node tools/re/cdp_extract.mjs <ws> re/web/data/getters.json "$(sed 's/$/()/' tools/re/getters.txt | tr '\n' ',')"
   node tools/re/cdp_extract.mjs <ws> re/web/data/roads.json   @tools/re/exprs_roads.json
   node tools/re/cdp_extract.mjs <ws> re/web/data/forests.json @tools/re/exprs_forests.json
   node tools/re/normalize.mjs        # -> data/game/*.json
   node tools/re/build_catalog.mjs    # -> js/gamedata.js (what the planner loads)
   node tools/re/compare_wiki.mjs     # -> data/game/WIKI_DIFF.md
   ```
   Your own map, for Menu → Import game map… (read-only; contains no account identifiers):
   ```
   node tools/re/cdp_extract.mjs <ws> re/account/grid.json @tools/re/exprs_grid.json
   ```
   Your account values (Menu → My account values…): after reading your logged-in game into
   re/account/eff_*.json and player.json (see "Account data" below), build the profile:
   ```
   node tools/re/build_profile.mjs    # -> re/account/profile.json (upgraded values; no identifiers)
   ```
   Local icon pack (output is git-ignored; never commit or host it):
   ```
   node tools/re/build_icons.mjs      # -> icons/game/ (sprite sheets + manifest.json)
   ```
   To split the bundle into readable files:
   `awk 'BEGIN{f="src/_prelude.js"} /^\/\/# sourceURL=/{close(f); n=$0; sub(/^\/\/# sourceURL=/,"",n); f="src/" n; next} {print > f}' bundle.js`

The page HTML contains the session's bearer token and user id. `cdp_dump.mjs` redacts the token from the URL, and the HTML
copy was redacted by hand. Check before sharing anything from `re/`.

## Account data

Read from the logged-in game, saved only in `re/account/` (git-ignored). Name, email, player id, country, language, town names
and visited players are stripped before anything is saved.
- `player.json`: player object `hrac` (resources, income, building counts, stats), town level, upgrade levels.
- `eff_tables.json`, `eff_getters.json`, `eff_roads.json`, `eff_forests.json`: the same tables as the base extraction, read
  with your upgrades applied.
- `grid.json`: your map (for Import game map). `summary.md`: readable overview.
- `profile.json`: made by `build_profile.mjs`. Per-building overrides where your values differ from base, plus the planner
  upgrade toggles your account owns. Toggles whose effect is already in the numbers (Big Farms, Farming Implements,
  Better Farm Watering) are listed as `baked` and ignored while the profile is on.

## How the planner uses it

- `tools/re/mapping.mjs`: planner id ↔ game key (`WIKI_TO_GAME`) and game tile ↔ planner terrain (`TILE_TO_TERRAIN`).
- `tools/re/build_catalog.mjs`: converts `data/game/` into planner-format records in `js/gamedata.js`. It skips
  auto-placed fields, map wrecks and duplicate variants, and derives categories, tiles, pavement bonus and road needs.
- `js/data.js`: merges field by field. The game value wins and the wiki value is a fallback. Planner-only logic (rules,
  radius kind, notes, flags) stays from `js/data_wiki.js`; placement rules found in game data are added to it.

## Save format (from `saving.js`, `saveload.js`, `http.js`)

The save lives **on the server**, tied to the account. Local storage only holds `already_playing`.

- **Player state** is one JS object, `hrac`, plus `chests`, `activists`, and the map grid.
- **Legacy save:** `POST /userGameData/save`. The body is gzip (via `fflate`) of
  `JSON.stringify({ hrac, chests, activists, myGridData })`, where `myGridData = GetAllOptimizedGridData()`.
- **Current save (v2):** `POST /userGameData/v2/save` as multipart form data: a `playerData` blob (`{hrac, chests}`),
  one blob per changed **grid chunk** (`saveGridMarker.getChunksToSave()`), `gameTick` (= `income_ticks*10 + n`), `saveTime`,
  optional `resourceLogs` and `claimedPayments`, and an `integrity` field.
- **Load:** `GET /userGameData/v2` (JSON) or legacy `GET /userGameData` (gzip). Other players' saves can be read with
  `GET /userGameData/<userId>`; the "visit player" feature uses this.
- `hrac.buildings` holds counts per building key; grid tiles store keys as flags (`_grid.coal_plant`, `_grid.has_street = <road type>`,
  `_grid.forest`, …). The `key` values in `data/game/buildings.json` are these same names.

### Save import: what's implemented

The planner imports the map, not the save file itself. While the game runs on the emulator, `exprs_grid.json` reads the
decoded map the game keeps in memory (`myGridData`): one `[x, y, {flags}]` row per explored tile, keeping only terrain,
building, road, rail, pavement and town flags. `js/gamemap.js` turns a region of it into a plan:

- Terrain comes from tile flags, most specific first. Town tiles become settlements, and (0, 0) is the main settlement.
- A building key on a tile maps to the planner building via its `gameKey`. `has_street = n` becomes road type n
  (on a river it's a River Bridge for dirt roads, at sea Sea Bridge T1–T3 for road types 4–6).
- The game drops some terrain flags once something is built (an oil rig's oil spot, for example), so plain ground or water under a
  building that needs a special tile takes that tile.
- Farm fields and fishing boats are skipped: the planner works out fields itself.

We deliberately don't call the save endpoints ourselves, and we don't study or reproduce the `integrity` value.
Writing saves back is out of scope.
