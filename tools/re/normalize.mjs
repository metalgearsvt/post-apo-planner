// Turns raw tables pulled from the running game (re/web/data/*.json, made by
// cdp_extract.mjs) into the tidy, committed dataset in data/game/.
//
// usage: node tools/re/normalize.mjs [rawDir=re/web/data] [outDir=data/game]
//
// Only facts (names, numbers, rules) are written out. Game code and art stay in re/.
import fs from 'node:fs';
import path from 'node:path';

const rawDir = process.argv[2] || 're/web/data';
const outDir = process.argv[3] || 'data/game';
const tables = JSON.parse(fs.readFileSync(path.join(rawDir, 'tables.json'), 'utf8'));
const levels = JSON.parse(fs.readFileSync(path.join(rawDir, 'levels.json'), 'utf8'));
const getters = JSON.parse(fs.readFileSync(path.join(rawDir, 'getters.json'), 'utf8'));
const roadsRaw = fs.existsSync(path.join(rawDir, 'roads.json')) ? JSON.parse(fs.readFileSync(path.join(rawDir, 'roads.json'), 'utf8')) : null;
const forestsRaw = fs.existsSync(path.join(rawDir, 'forests.json')) ? JSON.parse(fs.readFileSync(path.join(rawDir, 'forests.json'), 'utf8')) : null;
const meta = fs.existsSync(path.join(rawDir, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(rawDir, 'meta.json'), 'utf8')) : {};

// ---- shared vocab -----------------------------------------------------------
// Game resource keys -> the planner's names (js/data.js RESOURCES).
export const RESOURCE_ALIASES = { rocks: 'stone', uranium_battery: 'uranium' };
const res = (k) => RESOURCE_ALIASES[k] || k;
const mapCost = (c) => (c && typeof c === 'object' ? Object.fromEntries(Object.entries(c).map(([k, v]) => [res(k), v])) : null);

const CATEGORY = tables.CATEGORY_NAMES.map((s) => (s || '').replace(/<!--.*?-->/g, '').trim());
const TILE_CATEGORY = Object.fromEntries(tables.TILE_CATEGORY_NAMES.map((v, i) => [i, v]).filter(([, v]) => v));
const UPGRADE_FILTERS = {
  1: 'Utility', 2: 'Gold cost', 3: 'Resource cost', 4: 'Gem cost', 5: 'Cytrium cost', 6: 'Power', 7: 'Pollution',
  8: 'Storage', 9: 'Restoration', 11: 'Event', 14: 'Gold income', 15: 'Resource income', 16: 'Settlements',
  17: 'Trains', 18: 'Bombs', 19: 'Swappers', 20: 'Radius', 21: 'Offline', 22: 'Gems',
};
// Placeholder levels the game uses for "not unlocked by level" (shop / event / story only).
const UNLOCK_PLACEHOLDERS = new Set([999, 9999]);

// Base per-building output that the game computes in Get*() functions instead of storing
// on the building. Values come from getters.json (read at upgrade level 0).
const PRODUCTION = {
  golden_mine: { gold: 'GetGoldenMineProduction()' },
  golden_mine_2: { gold: 'GetAdvancedGoldMineProduction()' },
  golden_mine_3: { gold: 'GetHeavyGoldMineProduction()' },
  golden_mine_4: { gold: 'GetDualGoldMineProduction()' },
  golden_mine_premium: { gold: 'GetGoldenPremiumMineProduction()' },
  golden_mine_premium_2: { gold: 'GetGoldenPremium2MineProduction()' },
  golden_mine_premium_3: { gold: 'GetGoldenPremium3MineProduction()' },
  golden_mine_eco: { gold: 'GetGoldenEcoMineProduction()' },
  golden_titan_eco: { gold: 'GetTitanGoldenEcoMineProduction()' },
  golden_titan_dual: { gold: 'GetTitaniumDualGoldMineProduction()' },
  oil_rig_ground: { oil: 'GetGroundOilRigProduction()' },
  rift_miner: { oil: 'GetRiftMinerProduction()' },
};
const STORAGE = {
  saw_mill: { lumber: 'GetMaxLumberPerLumberMill()' },
  heavy_lumber_mill: { lumber: 'GetMaxLumberStoragePerHeavyLumberMill()' },
  premium_lumber_mill: { lumber: 'GetMaxLumberStoragePerPremiumLumberMill()' },
  lumber_mill_drone: { lumber: 'GetMaxLumberPerDroneMill()' },
  wood_storage: { lumber: 'GetSingleWoodStorage()' },
  rock_mine: { stone: 'GetMaxRocksStoragePerMine()' },
  rock_mine2: { stone: 'GetMaxRocksStoragePerMine2()' },
  rock_water_mine: { stone: 'GetMaxRocksStoragePerMine3()' },
  rockyiron: { stone: 'GetMaxRocksStoragePerRockyIronMine()' },
  rock_mine_boost: { stone: 'GetMaxRocksStoragePerBooster()' },
  rock_mine_boost_2: { stone: 'GetMaxRocksStoragePerBooster2()' },
  foundry: { steel: 'GetMaxSteelStoragePerFoundry()' },
  foundry_big: { steel: 'GetMaxSteelStoragePerFoundryBig()' },
  foundry_eco: { steel: 'GetMaxSteelStoragePerFoundryEco()' },
  steel_storage: { steel: 'GetSingleSteelStorage()' },
  storage_container: { stone: 'GetStorageContainerRocks()', steel: 'GetStorageContainerSteel()', chips: 'GetStorageContainerChips()' },
  oil_storage: { oil: 'GetOilStorageStorage()' },
  oil_rig_ground: { oil: 'GetGroundOilrigStorage()' },
  oil_rig: { oil: 'GetWaterOilrigStorage()' },
  tanker: { oil: 'GetTankerOilStorage()' },
  rift_miner: { oil: 'GetRiftMinerStorage()' },
  premium_storage: { lumber: 'GetPremiumStorage_lumber()', stone: 'GetPremiumStorage_rocks()', steel: 'GetPremiumStorage_steel()', chips: 'GetPremiumStorage_chips()', oil: 'GetPremiumStorage_oil()', titanium: 'GetPremiumStorage_titanium()' },
  rift_storage_1: { lumber: 'GetRiftStorage_lumber()', stone: 'GetRiftStorage_rocks()', steel: 'GetRiftStorage_steel()', chips: 'GetRiftStorage_chips()', oil: 'GetRiftStorage_oil()', uranium: 'GetRiftStorage_uranium()' },
  silo_storage: { stone: 'GetSiloStorage_rocks()', uranium: 'GetSiloStorage_uranium()', titanium: 'GetSiloStorage_titanium()' },
  uranium_storage_1: { uranium: 'GetUraniumStoragePerStorage()' },
  uranium_factory_1: { uranium: 'GetUraniumStoragePerFactory()' },
  uranium_factory_2: { uranium: 'GetUraniumStoragePerFactory2()' },
  deepwater_reactor: { uranium: 'GetUraniumStoragePerDeepWaterReactor()' },
  titanium_storage: { titanium: 'GetTitaniumStorageForSingleTitaniumStorage()' },
  titan_factory: { titanium: 'GetTitaniumStoragePerTitaniumFactory()' },
  titan_factory_gem: { titanium: 'GetTitaniumStoragePerTitaniumFactoryGem()' },
  titan_factory_rift: { titanium: 'GetTitaniumStoragePerTitaniumRift()' },
};
const RADIUS = {
  farm: 'GetFarmRange()', farm_big: 'GetBigFarmRange()', watch_tower: 'GetScoutTowerRadius()',
  sensor_tower: 'GetSensorTowerRadius()', tanker: 'GetTankerRadius()', lighthouse: 'GetLighthouseRadius()',
  filter_array_1: 'GetFilterArrayRadius()', cementaren: 'GetCementarenRange()',
};
const resolve = (m) => m && Object.fromEntries(Object.entries(m).map(([k, g]) => [k, getters[g]]).filter(([, v]) => v != null));

// Fields that only matter for drawing, sound or UI plumbing.
const DROP = /^(image|sound|click_sound|grid_color|buildEffectPower|healEffectPower|mudEffectPower|draw_|has_animation|has_door|has_over_image|build_mountain_image|mountain_image|build_water_image|has_water_images|znecistenie_image|in_offer_image|extra_animation|graphics_over|reopen_grid_menu|ignoreGridMenuHandle|floating_button|has_tutorial|hidden_among_actions|disable_label|no_name_in_description|always_full_line_view|standard_drawing_disabled|sized_\d|image_)/;

function cleanRaw(b) {
  const o = {};
  for (const [k, v] of Object.entries(b)) {
    if (v === '[fn]' || DROP.test(k)) continue;
    o[k] = v;
  }
  return o;
}

const buildings = [], actions = [];
for (const b of tables.BUILDINGS) {
  const isAction = /_notsaved\d*$/.test(b.grid_key) || b.is_action;
  const level = UNLOCK_PLACEHOLDERS.has(b.required_level) ? null : b.required_level;
  const gems = (b.cost && b.cost.gems) || b.gems || 0;
  const entry = {
    key: b.grid_key,
    id: b.id,
    name: b.name,
    category: (b.categories || []).map((c) => CATEGORY[c] || String(c)),
    level,
    unlock: b.event_type ? 'event' : level != null ? 'level' : 'shop/story',
    event_type: b.event_type ?? null,
    premium: gems > 0,
    // {gold: 1} is a placeholder the game uses when the real price comes from a function.
    cost: b.cost_fun || (b.cost && b.cost.gold === 1 && Object.keys(b.cost).length === 1) ? null : mapCost(b.cost),
    cost_note: b.cost_fun ? 'Price is calculated in game (scales with count or tile).' : b.cost && b.cost.gold === 1 ? 'Price is calculated in game (see roads.json for roads).' : undefined,
    destroy_cost: b.destroy_gold_cost != null ? { gold: b.destroy_gold_cost } : undefined,
    power: b.base_electricity ?? b.electricity ?? null, // null = not a static field (computed in game)
    pollution: b.base_polution ?? b.polution ?? null,
    income: Object.fromEntries(Object.entries({
      gold: b.gold_income, food: b.food_income, chips: b.chip_production, steel: b.steel_production,
      titanium: b.titanium_income, uranium: b.ub_income, red_chips: b.red_chips_production,
      ...resolve(PRODUCTION[b.grid_key]),
    }).filter(([, v]) => v)),
    uranium_drain: b.ub_drain || undefined,
    storage: resolve(STORAGE[b.grid_key]) || undefined,
    radius: getters[RADIUS[b.grid_key]] ?? undefined,
    tiles: {
      categories: (b.tile_categories || []).map((t) => TILE_CATEGORY[t] || String(t)),
      only: b.only_specific_tiles,
      also: b.also_allowed_tiles || b.allow_on_these_tiles,
      forbidden: b.forbidden_tiles,
    },
    rules: Object.fromEntries(Object.entries({
      requires_road: b.requires_street,
      water_within: b.requires_water_near_by,
      river_within: b.requires_river_near_by,
      all_water_within: b.all_tiles_in_range_water,
      connects_to: b.can_connect_to_these_buildings,
      connects_to_same: b.can_connect_to_same_building,
      connects_to_neighbour_mine: b.can_connect_to_neighbour_mine,
      max_one_same_in_range: b.max_1_same_building_in_range,
      pavement_allowed: b.pavement_not_allowed ? false : undefined,
      requires_upgrade: b.requires_upgrade,
    }).filter(([, v]) => v !== undefined && v !== null && v !== 0 && v !== false || v === false)),
    pavement_bonus: b.pavement_bonus ? {
      percent: b.pavement_bonus.value,
      applies_to: b.pavement_bonus.changes_power ? 'power' : b.pavement_bonus.changes_pollution ? 'pollution' : /storage/i.test(b.pavement_bonus.text) ? 'storage' : 'production',
      text: b.pavement_bonus.text.replace('{att1}', b.pavement_bonus.value).replace('{att2}', b.pavement_bonus.att2 || ''),
    } : undefined,
    upgrades_to: b.upgrades_to,
    description: b.description,
    raw: cleanRaw(b),
  };
  (isAction ? actions : buildings).push(JSON.parse(JSON.stringify(entry)));
}
buildings.sort((a, b) => (a.level ?? 1e9) - (b.level ?? 1e9) || a.name.localeCompare(b.name));

const terrains = tables.TERRAINS.map((t) => ({ key: t.grid_key, id: t.id, ...Object.fromEntries(Object.entries(t).filter(([k, v]) => !['grid_key', 'id', 'image', 'apo_pattern'].includes(k) && v !== '[fn]')) }));

const upgrades = tables.upgrades.map((u) => JSON.parse(JSON.stringify({
  id: u.id,
  name: [u.label_prefix, u.label, u.label_sufix].filter(Boolean).join(' '),
  label: u.label,
  filters: u.filter.map((f) => UPGRADE_FILTERS[f] || String(f)),
  building: u.att1_building_name_key,
  value: u.value,
  value2: u.value2,
  max_level: u.max_level,
  min_town_level: u.min_town_level,
  requires_upgrade: u.required_upgrade_id,
  cost: mapCost(u.costs),
  gems: u.gems,
  cost_growth: u.mat_plus ? { type: 'linear', plus: u.mat_plus } : u.mat_exponent_plus ? { type: 'multiplier', per_level: u.mat_exponent_plus } : u.mat_exponent ? { type: 'exponential', base: u.mat_exponent } : undefined,
  max_cost: u.max_cost,
  event: u.is_event ? true : undefined,
  temporary: u.temporary ? true : undefined,
  hidden: u.hidden ? true : undefined,
  desc: u.desc,
})));

// Roads: price depends on road type and the tile (plain / river or swamp / sea). Bridges are roads on water.
const roads = roadsRaw ? roadsRaw.ROADS.map((r) => {
  const a = actions.find((x) => x.key === `road_${r.type}_notsaved`);
  const clean = (c) => Object.fromEntries(Object.entries(mapCost(c)).filter(([, v]) => v != null));
  return {
    type: r.type, key: `road_${r.type}_notsaved`, name: r.name, level: a ? a.level : null,
    cost: { plain: clean(r.cost_plain), river_or_swamp: clean(r.cost_river), sea: clean(r.cost_water) },
    forest_clearing_extra_gold: r.cost_forest_extra_gold,
    income: { gold: r.income }, pollution: r.pollution,
    note: r.type === 7 ? `Only the first ${roadsRaw.FIRST_XY_TITANIUM_ROADS} Eco Highways give income.` : undefined,
  };
}) : [];

// Planted forests (Grow Forest action). Types 1-3 are actions, 4-6 also exist as tree4..tree6 buildings.
const FOREST_KEYS = [null, 'forest_1_notsaved', 'forest_2_notsaved', 'forest_3_notsaved', 'tree4', 'tree5', 'tree6'];
const forests = forestsRaw ? forestsRaw.FORESTS.map((f) => ({
  type: f.type, key: FOREST_KEYS[f.type], name: f.name, level: f.level, cost: mapCost(f.cost), income: { gold: f.income }, pollution: f.pollution,
})) : [];

const levelUnlocks = Object.entries(levels).filter(([, v]) => typeof v === 'number').map(([k, v]) => ({ key: k, level: v })).sort((a, b) => a.level - b.level || a.key.localeCompare(b.key));

const constants = Object.fromEntries(Object.entries(getters).map(([k, v]) => [k.replace(/^Get|\(\)$/g, ''), v]));
Object.assign(constants, {
  INCOME_INTERVAL_SECONDS: 9,
  SUPER_FACTORY_INCOME: tables.SUPER_FACTORY_INCOME ?? 5000, // gems.js; upgrades raise it
  PUMPKIN_FARM_LEVELS: tables.PUMPKIN_FARM_LEVELS,
  TURKEY_FARM_LEVELS: tables.TURKEY_FARM_LEVELS,
  RABBITS_FARM_LEVELS: tables.RABBITS_FARM_LEVELS,
});

const source = {
  game: 'Post Apo Tycoon (studio.powerplay.tycoonwrapper)',
  app_version: meta.app_version || '1.0.67',
  bundle: meta.bundle || 'bundle-cb02d18ace.js',
  extracted: meta.extracted || new Date().toISOString().slice(0, 10),
  method: 'Read from the running game (guest save, no upgrades) via the WebView DevTools protocol. See tools/re/README.md.',
  notes: [
    'Values are BASE values with zero upgrades.',
    'level null = not unlocked by town level (shop, event or story only).',
    'Resource keys follow the planner: rocks -> stone, uranium_battery -> uranium.',
    'income is per 9-second tick unless noted.',
  ],
};

fs.mkdirSync(outDir, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(outDir, name), JSON.stringify({ source, count: data.length ?? Object.keys(data).length, data }, null, 1) + '\n');
write('buildings.json', buildings);
write('actions.json', actions);
write('terrains.json', terrains);
write('upgrades.json', upgrades);
write('level_unlocks.json', levelUnlocks);
if (roads.length) write('roads.json', JSON.parse(JSON.stringify(roads)));
if (forests.length) write('forests.json', forests);
write('constants.json', constants);
console.log(`roads ${roads.length}, buildings ${buildings.length}, actions ${actions.length}, terrains ${terrains.length}, upgrades ${upgrades.length}, level unlocks ${levelUnlocks.length}, constants ${Object.keys(constants).length}`);
