// Builds an "account profile" for the planner: the building values YOUR upgrades produce, as overrides
// on top of the base game data. Import it in the app (Menu > My account values) to get totals that
// match your game.
//
// Input (from reading your logged-in game with cdp_extract.mjs, see tools/re/README.md):
//   re/account/eff_tables.json   BUILDINGS (+ SUPER_FACTORY_INCOME) with upgrades applied
//   re/account/eff_getters.json  production / storage / radius getters with upgrades applied
//   re/account/eff_roads.json, eff_forests.json
//   re/account/player.json       upgrade levels and town level (identifiers already stripped)
// plus the base raw data in re/web/data/ (levels.json, meta.json, tables.json for the non-building tables).
//
// Output: re/account/profile.json (private: keep it out of git; it holds no names, emails or ids).
// usage: node tools/re/build_profile.mjs [accountDir=re/account] [baseRawDir=re/web/data]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRecords } from './build_catalog.mjs';

const acc = process.argv[2] || 're/account';
const baseRaw = process.argv[3] || 're/web/data';
const here = path.dirname(fileURLToPath(import.meta.url));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// 1. Assemble a raw folder for the account in the same shape as the base extraction, then normalize it.
const rawDir = path.join(acc, 'raw'), gameDir = path.join(acc, 'game');
fs.mkdirSync(rawDir, { recursive: true });
const eff = J(path.join(acc, 'eff_tables.json'));
// Upgrades change a building's live electricity / polution; base_* keep the original. Use the live values.
const effBuildings = eff.BUILDINGS.map((b) => ({ ...b, base_electricity: b.electricity ?? b.base_electricity, base_polution: b.polution ?? b.base_polution }));
const tables = { ...J(path.join(baseRaw, 'tables.json')), BUILDINGS: effBuildings, SUPER_FACTORY_INCOME: eff.SUPER_FACTORY_INCOME };
fs.writeFileSync(path.join(rawDir, 'tables.json'), JSON.stringify(tables));
fs.copyFileSync(path.join(baseRaw, 'levels.json'), path.join(rawDir, 'levels.json'));
fs.copyFileSync(path.join(acc, 'eff_getters.json'), path.join(rawDir, 'getters.json'));
fs.copyFileSync(path.join(acc, 'eff_roads.json'), path.join(rawDir, 'roads.json'));
fs.copyFileSync(path.join(acc, 'eff_forests.json'), path.join(rawDir, 'forests.json'));
if (fs.existsSync(path.join(baseRaw, 'meta.json'))) fs.copyFileSync(path.join(baseRaw, 'meta.json'), path.join(rawDir, 'meta.json'));
execFileSync(process.execPath, [path.join(here, 'normalize.mjs'), rawDir, gameDir], { stdio: 'inherit' });

// 2. Planner records for base vs account, and keep only what differs.
const base = new Map(buildRecords('data/game').records.map((r) => [r.id, r]));
const mine = buildRecords(gameDir).records;
const FIELDS = ['cost', 'power', 'poll', 'income', 'uranium', 'radius', 'pave', 'storage', 'fieldFood', 'waterWithin', 'road'];
const buildings = {};
for (const r of mine) {
  const b = base.get(r.id); if (!b) continue;
  const o = {};
  for (const f of FIELDS) if (r[f] !== undefined && JSON.stringify(r[f]) !== JSON.stringify(b[f])) o[f] = r[f];
  if (Object.keys(o).length) buildings[r.id] = o;
}

// Pollution that depends on the account rather than the map (hrac_income_stats.js, end of the income pass),
// plus the upgrade factors js/analyze.js needs for the map terms (towns, farm fields, Trees of Life).
function accountPollution(h, owned) {
  const upgrades = J('data/game/upgrades.json').data;
  const val = (id) => (owned.get(id) || 0) * (upgrades.find((u) => u.id === id)?.value || 0); // GetPlayerUpgradeValue
  const st = h.stats || {};
  const removeWaterOil = J(path.join(baseRaw, 'tables.json')).BUILDINGS.find((b) => b.grid_key === 'remove_water_oil_notsaved')?.polution ?? -45;
  const expand = J(path.join(baseRaw, 'tables.json')).EXPAND_RULES || [];
  const parts = [
    ['Base pollution', 100000 + 5],                                              // BASE_POLLUTION + BASE_POLLUTION_start
    ['Map expansions', expand.filter((e) => h.map_size >= e.map_size).reduce((s, e) => s + e.pollution, 0)],
    ['Pollution Purifier upgrades', -(val(464) + val(465) + val(585))],
    ['Nuked experiments', ((st.number_of_experiements_nuked || 0) - (st.number_of_experiements_cleared || 0)) * 500],
    ['Rockets sent', -(h.rocket_types_sent?.[1] || 0) * 1000],
    ['Anti-pollution (offers, rewards)', -(h.anti_pollution || 0) - (h.bonus_pollution || 0)],
    ['Cleared broken power lines', -(st.cleared_broken_power || 0) * 20],
    ['Uranium barrels cleared', -(st.uranium_barrels_polution_bonus || 0) - (st.special_uranium_cleared || 0)
      - (st.water_barrels_cleared || 0) * 20 - (st.uran_lakes_cleared || 0) * 100],
    ['Ground oil removed / added', ((st.new_ground_oil || 0) - (st.ground_oil_removal || 0)) * 5],
    ['Sea oil removed / added', ((st.removed_water_oils || 0) - (st.created_water_oils || 0)) * removeWaterOil],
  ];
  // Thanksgiving (6) / Rabbits (10): each event field cleans by upgrade 200's value while the event runs.
  if ([6, 10].includes(h.event_last_event_type) && h.event_tracking_data_2) {
    parts.push(['Event fields (until the event ends)', -h.event_tracking_data_2 * val(200)]);
  }
  const kept = parts.filter(([, v]) => v);
  return {
    account: kept.reduce((s, [, v]) => s + v, 0),
    parts: kept,
    townFactor: (1 - 0.01 * val(66)) * (1 - 0.01 * val(285)) * (1 - 0.01 * val(555)), // Town Cleaner upgrades
    fieldBonus: owned.get(200) ? val(200) : 0,                                     // Stop Burping, Cows
    forestBonusPct: Math.min(16, h.buildings?.tree_of_life_1 || 0),                // Trees of Life, MAX_TREES_OF_LIFE
    gameTotal: h.real_polution,                                                    // what the game showed, for comparison
  };
}

// 3. Planner upgrade toggles. Effects already in the numbers above are "baked" and the toggles are ignored,
//    so they can't be counted twice. The others come from what you own.
const player = J(path.join(acc, 'player.json'));
const owned = new Map(player.upgrade_levels);
// Upgrades js/analyze.js checks by id: road exemptions (ROAD_FREE_UPGRADES), Advanced Infrastructure (51),
// Faster Iron Mines (36).
const CHECKED = [25, 28, 52, 105, 149, 164, 212, 241, 358, 407, 428, 449, 468, 542, 51, 36];
const profile = {
  kind: 'post-apo-planner-profile', version: 1,
  note: 'Building values with your game upgrades applied. Personal; contains no account identifiers.',
  app_version: J(path.join(baseRaw, 'meta.json')).app_version,
  extracted: fs.statSync(path.join(acc, 'eff_tables.json')).mtime.toISOString().slice(0, 10),
  level: player.level,
  upgrades: {
    advSaw: owned.has(12), roadless: owned.has(28),
    owned: Object.fromEntries(CHECKED.filter((id) => owned.get(id) > 0).map((id) => [id, true])),
  },
  baked: ['bigFarms', 'farmImplements', 'farmWatering'],
  pollution: accountPollution(player.player, owned),
  buildings,
};
fs.writeFileSync(path.join(acc, 'profile.json'), JSON.stringify(profile, null, 1));
console.log(`profile: level ${profile.level}, ${Object.keys(buildings).length} buildings with upgraded values -> ${path.join(acc, 'profile.json')}`);
for (const [id, o] of Object.entries(buildings).slice(0, 12)) console.log(' ', id, JSON.stringify(o));
