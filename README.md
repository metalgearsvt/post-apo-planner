# Post Apo Planner

An unofficial base-layout planner and calculator for **Post Apo Tycoon – Idle Builder**.
Plot your terrain and buildings on a configurable grid before you spend resources in the game.

It's a single installable web app (PWA): the same code runs on desktop and on Android, installs to the
home screen, and works offline. There's no build step — plain HTML/CSS/JS.

## Features

- **Configurable grid** (3–1000 tiles per side), resize with anchoring, multiple saved plans.
- **Preloaded catalog** of 165 buildings, roads and forests and ~40 terrain tiles, read from the game itself
  (level, cost, power, pollution, income, storage, allowed tiles, radius), with the community wiki as a fallback.
- **Placement checks**: wrong tile type, Coal Plant within 2 of water, Iron Mine needs a Foundry within 3,
  Lumber Mill needs Forest in range, overlapping farms, road connection to a settlement, and more.
- **Calculations**: net power and pollution, income per 9 s / per hour, total build cost, farm fields,
  pavement bonuses, Stone Conveyor and Tanker boosts, upgrade toggles (Big Farms, Advanced Saw, and others).
- **Catalog editor**: fix numbers the wiki is missing, or add custom buildings and tiles.
- **Game icons (optional, local only)**: build an icon pack from your own copy of the game and the planner draws
  real building and terrain art. No game art is included in this repository or the hosted app.
  Menu → Game icons… also exports a pack file you can import on your phone.
- **Your account values (optional)**: Menu → My account values… loads a profile of the building values your
  upgrades produce, so production, power, pollution, costs, ranges and storage match your game.
- **Import your game map**: Menu → Import game map… turns a map exported from the game into a plan
  (the whole map, or any area of it up to 1000 × 1000 tiles; buildings, roads, rails and pavement included).
- **Phone ↔ desktop**: share codes (copy/paste text) or export/import JSON files.
- Touch: pinch to zoom, drag to paint, a Pan tool for one-finger moving. Desktop: wheel zoom and keyboard shortcuts.

## Run it locally

```powershell
npm start
```

Open http://localhost:8080. The server also prints a `http://192.168.x.x:8080` address you can open
on your phone while it's on the same Wi-Fi. (Installing as an app and working offline need HTTPS, so for
the phone a hosted copy is better — see below.)

## Host it (recommended for phone use)

Any static host works. With GitHub Pages:

1. Push this folder to a GitHub repository.
2. Repository → Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<user>.github.io/<repo>/` on your phone → browser menu → **Install app** / **Add to Home screen**.

Your plans are stored in each browser's IndexedDB (plans saved by older versions in local storage move over automatically), not on the server. Use share codes or
exported files to move them between devices.

## Project layout

```
index.html            app shell
css/style.css         styles (desktop sidebar, mobile bottom sheet)
js/data.js            merged catalog: game data over the wiki fallback (+ categories, resources)
js/gamedata.js        GENERATED from data/game/ by tools/re/build_catalog.mjs
js/data_wiki.js       wiki catalog: fallback values, planner rules and notes (planner ids live here)
js/catalog.js         merges defaults with user edits
js/icons.js           optional game icons (local folder or imported pack)
js/gamemap.js         converts an exported game map into a plan
js/store.js           saved plans (IndexedDB, localStorage fallback)
js/analyze.js         placement rules and totals
js/app.js             canvas rendering, input, UI, dialogs
sw.js                 offline cache
tools/serve.mjs       local server (LAN-accessible)
tools/make-icons.mjs  regenerates PNG icons
tools/re/             game data extraction + catalog generator (see tools/re/README.md)
data/game/            data mined from the game (JSON) + WIKI_DIFF.md
```

## Data & assumptions

Numbers come from the game itself: Post Apo Tycoon 1.0.67, read from a running copy of the game
(see [data/game/README.md](data/game/README.md)). They are **base values with no upgrades**. For every
field the game value wins. The wiki value (fandom wiki, November 2026, in `js/data_wiki.js`) is only used
where the game data has nothing for that field, mostly per-tile production the game calculates on the fly
(stone, lumber, chip, oil and super factory output). The Inspect panel's **Data** row shows which fields still
come from the wiki. Gathering radius is treated as a square around the building. Anything can still be
corrected in the in-app Catalog editor.

After re-extracting game data, regenerate the catalog:

```powershell
node tools/re/normalize.mjs; node tools/re/build_catalog.mjs; node tools/re/compare_wiki.mjs
```
