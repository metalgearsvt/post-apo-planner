# Game data (extracted)

Facts read directly from Post Apo Tycoon **1.0.67** (game bundle `bundle-cb02d18ace.js`, 2026-11-26),
from a fresh guest save with **no upgrades**, so every number is a base value.
How it was pulled and how to refresh it: [tools/re/README.md](../../tools/re/README.md).

Every file has the same envelope: `{ "source": {...}, "count": N, "data": [...] }`.

| File | What's in it |
|---|---|
| `buildings.json` | 162 placeable buildings: cost, power, pollution, income, storage, radius, allowed tiles, placement rules, pavement bonus, unlock level. `raw` keeps every other static field the game defines. |
| `roads.json` | The 8 road types with costs on plain, river/swamp, and sea tiles. Wiki "bridges" are roads built on river/sea. |
| `forests.json` | The 6 plantable forest types (Grow Forest action): cost, gold income, pollution. |
| `actions.json` | 72 tile actions (clear rubble, dig, revitalise, flatten, fill, …). Many prices are calculated, so `cost` is often `null`. |
| `terrains.json` | 44 terrain tile keys. |
| `upgrades.json` | 796 upgrades: base cost, gem cost, how cost grows per level, max level, the building affected, minimum town level. |
| `level_unlocks.json` | 86 named unlock levels (`STEEL_LEVEL_REQ: 24`, …). |
| `constants.json` | Base production, storage and radius values the game computes in code (for example `GoldenMineProduction: 100`, `FarmRange: 2`). |
| `WIKI_DIFF.md` | What differs between these files and the planner's current wiki-based `js/data.js`. |

## Conventions

- **Resources** use the planner's names: the game's `rocks` → `stone`, `uranium_battery` → `uranium`.
  Others are as in game (`gold`, `lumber`, `steel`, `chips`, `red_chips`, `oil`, `titanium`, `cytrium`, `gems`, `clay`, `food`).
- **Income** is per 9-second tick.
- **`level: null`** means the building isn't unlocked by town level (shop, event, or story only). `level: 0` means available from the start.
- **`power` / `pollution: null`** means the game doesn't store a fixed number on the building; it's computed in code.
- **`cost: null`** with a `cost_note` means the game calculates the price (by count, tile, or upgrades).
- **Tile categories**: `Plain`, `Water`, `Special Tiles`; `tiles.only` lists the exact terrain keys allowed.
- **`key`** is the game's internal id (for example `coal_plant`, `golden_mine_2`). It's what a save file uses, so it's the
  join key for a future save import. `tools/re/compare_wiki.mjs` has the planner id → game key map (`WIKI_TO_GAME`).

## Upgrade cost formula

From `GetUpgradeCost` in the game's `upgrades.js`. For upgrade `u` at current level `L`:

```
cost = base × u.mat_exponent^L          (cost_growth.type = "exponential")
cost = base + u.mat_plus × L            (cost_growth.type = "linear")
cost = base × u.mat_exponent_plus × (L+1)   ("multiplier")
then: round to the nearest 10 if > 100, cap at max_cost
```

## Not yet covered

- The gold income of towns, settlements and suburbs (computed from town level and connections).
- Upgrade effects. `value` is the per-level amount, but what it changes is described only in the `desc` text.
- Event-only economies (eventium and so on).
