# Post Apo Planner

An unofficial base-layout planner and calculator for **Post Apo Tycoon – Idle Builder**.
Plot your terrain and buildings on a configurable grid before you spend resources in the game.

It's a single installable web app (PWA): the same code runs on desktop and on Android, installs to the
home screen, and works offline. There's no build step — plain HTML/CSS/JS.

## Features

- **Configurable grid** (3–200 tiles per side), resize with anchoring, multiple saved plans.
- **Preloaded catalog** of ~110 buildings and ~30 terrain tiles from the community wiki
  (level, cost, power, pollution, income, allowed tiles, radius).
- **Placement checks**: wrong tile type, Coal Plant within 2 of water, Iron Mine needs a Foundry within 3,
  Lumber Mill needs Forest in range, overlapping farms, road connection to a settlement, and more.
- **Calculations**: net power and pollution, income per 9 s / per hour, total build cost, farm fields,
  pavement bonuses, Stone Conveyor and Tanker boosts, upgrade toggles (Big Farms, Advanced Saw, and others).
- **Catalog editor**: fix numbers the wiki is missing, or add custom buildings and tiles.
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

Your plans are stored in each browser's local storage, not on the server. Use share codes or
exported files to move them between devices.

## Project layout

```
index.html            app shell
css/style.css         styles (desktop sidebar, mobile bottom sheet)
js/data.js            terrain + building data (edit here to change defaults)
js/catalog.js         merges defaults with user edits
js/analyze.js         placement rules and totals
js/app.js             canvas rendering, input, UI, dialogs
sw.js                 offline cache
tools/serve.mjs       local server (LAN-accessible)
tools/make-icons.mjs  regenerates PNG icons
```

## Data & assumptions

Data comes from the Post Apo Tycoon fandom wiki (Module:Data/Buildings and building pages),
gathered in November 2026. Values are base values before upgrades. Gathering radius is treated as a square
around the building. Entries in the **Unverified** category come from the wiki's "pending" list.
Anything wrong can be corrected in the in-app Catalog editor.
