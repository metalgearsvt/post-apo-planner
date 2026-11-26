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

// 3. Planner upgrade toggles. Effects already in the numbers above are "baked" and the toggles are ignored,
//    so they can't be counted twice. The others come from what you own.
const player = J(path.join(acc, 'player.json'));
const owned = new Map(player.upgrade_levels);
const profile = {
  kind: 'post-apo-planner-profile', version: 1,
  note: 'Building values with your game upgrades applied. Personal; contains no account identifiers.',
  app_version: J(path.join(baseRaw, 'meta.json')).app_version,
  extracted: fs.statSync(path.join(acc, 'eff_tables.json')).mtime.toISOString().slice(0, 10),
  level: player.level,
  upgrades: { advSaw: owned.has(12), roadless: owned.has(28) },
  baked: ['bigFarms', 'farmImplements', 'farmWatering'],
  buildings,
};
fs.writeFileSync(path.join(acc, 'profile.json'), JSON.stringify(profile, null, 1));
console.log(`profile: level ${profile.level}, ${Object.keys(buildings).length} buildings with upgraded values -> ${path.join(acc, 'profile.json')}`);
for (const [id, o] of Object.entries(buildings).slice(0, 12)) console.log(' ', id, JSON.stringify(o));
