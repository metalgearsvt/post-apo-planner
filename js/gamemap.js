// Converts a map exported from the game into a planner plan.
//
// Input: the per-tile list produced by tools/re/cdp_extract.mjs with tools/re/exprs_grid.json:
//   { grid: [[x, y, { flag: value, ... }], ...] }   (or just the array)
// Each tile's flags are the game's own keys: terrain (hill, water, golden_field…), building keys
// (coal_plant, golden_mine_2…), has_street = road type, rails, pavement, mesto = town, etc.
// Game coordinates are centred on the main settlement at (0, 0).

// Game tile key -> planner terrain id (also used by tools/re/build_catalog.mjs).
export const TILE_TO_TERRAIN = {
  grass: 'grass', desert: 'desert', sand: 'sand', hill: 'hill', mountain: 'mountain',
  golden_field: 'goldenfield', golden_island: 'goldenisland', copper_field: 'copperfield', gem_field: 'gemfield',
  uranium_field: 'uraniumfield', ground_oil: 'groundoil', rift: 'rift', rift_big: 'largerift', lava_rift: 'lavarift',
  thermal: 'thermalspot', water: 'water', deep_water: 'deepwater', river: 'river', oil: 'wateroil', water_rocks_gem: 'gemrock',
  swamp: 'swamp', swamp_rocks: 'swamp', scorched: 'scorched', disrupted_earth: 'disrupted', titan: 'titaniumspot', titan_flat: 'titaniumspot',
  rubble1: 'rubble', rubble2: 'rubble', rubble3: 'rubble', rubble4: 'rubble', airplane_wreck: 'ruins', spoiled_forest: 'spoiledforest',
  ship_wreck: 'shipwreck', ship_wreck_small: 'shipwreck', smog_vent: 'smogvent', mud: 'mud',
  broken_city_small: 'ruins', broken_city_medium: 'ruins', broken_city_big: 'ruins',
};

// Terrain the game has that the wiki catalog didn't.
export const EXTRA_TERRAIN = [
  { id: 'sand', name: 'Sand', color: '#d9c48f', group: 'land' },
  { id: 'goldenisland', name: 'Golden Island', color: '#d9a81f', group: 'resource' },
  { id: 'titaniumspot', name: 'Titanium Spot', color: '#8fa3b8', group: 'resource' },
  { id: 'smogvent', name: 'Smog Vent', color: '#5a5550', group: 'special' },
  { id: 'mud', name: 'Mud', color: '#6b5640', group: 'land' },
];

// Land terrain checked in this order (a tile can carry several flags; the most specific wins).
const LAND_ORDER = ['golden_field', 'golden_island', 'copper_field', 'gem_field', 'uranium_field', 'ground_oil', 'thermal',
  'titan', 'titan_flat', 'rift_big', 'rift', 'lava_rift', 'smog_vent', 'mountain', 'hill', 'swamp_rocks', 'swamp', 'scorched',
  'disrupted_earth', 'rubble1', 'rubble2', 'rubble3', 'rubble4', 'airplane_wreck', 'broken_city_big', 'broken_city_medium',
  'broken_city_small', 'desert', 'sand', 'mud', 'spoiled_forest'];

const ROAD_IDS = [null, 'dirt_road', 'paved_road', 'basic_road', 'street_road', 'fast_road', 'eco_road', 'eco_highway', 'super_highway'];
const SEA_BRIDGES = { 4: 'sea_bridge_t1', 5: 'sea_bridge_t2', 6: 'sea_bridge_t3' };
// Auto-placed farm fields and similar: the planner works these out itself.
// `ship` is a fishing boat spawned by shipyards, not something you place.
const NOT_BUILDINGS = /^(farmfield|ship$)/;

export function readGrid(data) {
  const grid = Array.isArray(data) ? data : data?.grid;
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || typeof grid[0][2] !== 'object') {
    throw new Error('Not a game map export (expected { grid: [[x, y, {flags}], …] })');
  }
  return grid;
}

export function gridBounds(grid) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, buildings = 0;
  for (const [x, y, f] of grid) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (f.building_type && !NOT_BUILDINGS.test(f.building_type)) buildings++;
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, tiles: grid.length, buildings };
}

function terrainOf(f, x, y) {
  if (f.mega_city) return 'megacity';
  if (f.mesto) return x === 0 && y === 0 ? 'mainsettlement' : 'settlement';
  if (f.vidiek) return 'settlement';
  if (f.water) {
    if (f.oil) return 'wateroil';
    if (f.water_rocks_gem) return 'gemrock';
    if (f.ship_wreck || f.ship_wreck_small) return 'shipwreck';
    return f.deep_water ? 'deepwater' : 'water';
  }
  if (f.river) return 'river';
  for (const k of LAND_ORDER) if (f[k]) return TILE_TO_TERRAIN[k];
  if (f.forest) return 'forest';
  return 'grass';
}

/**
 * @param grid      tiles from readGrid()
 * @param region    { cx, cy, w, h } in game coordinates (cx, cy = centre)
 * @param buildings planner catalog buildings (need .id and .gameKey)
 * @returns {{ terrain: string[], bld: (string|null)[], pave: number[], rail: number[], forest: number[], town: number[], w, h, report }}
 *   forest = forest level on the tile (the game's `forest` flag, 1-6; it lowers pollution by that much),
 *   town   = town level on settlement tiles (the game's `mesto`; towns past level 20 pollute),
 *   tflag  = deep water / Eco City bits (see TF in js/analyze.js).
 */
export function gridToPlan(grid, region, buildings) {
  const { w, h } = region;
  const gx0 = region.cx - Math.floor(w / 2), gy0 = region.cy - Math.floor(h / 2);
  const n = w * h;
  const terrain = new Array(n).fill('unknown'), bld = new Array(n).fill(null), pave = new Array(n).fill(0), rail = new Array(n).fill(0);
  const forest = new Array(n).fill(0), town = new Array(n).fill(0), tflag = new Array(n).fill(0);
  const byKey = new Map(), byId = new Map(buildings.map((b) => [b.id, b]));
  for (const b of buildings) if (b.gameKey && !b.gameKey.includes(':') && !byKey.has(b.gameKey)) byKey.set(b.gameKey, b.id);
  // The game drops some terrain flags once a building sits on the tile (e.g. an oil rig's oil spot).
  // The building is proof of the terrain, so plain ground/water under a building that needs a special tile takes that tile.
  const GENERIC = new Set(['grass', 'water', 'deepwater', 'forest']);
  const report = { tiles: 0, buildings: 0, roads: 0, unmatched: {} };

  for (const [x, y, f] of grid) {
    const px = x - gx0, py = y - gy0;
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const i = py * w + px;
    report.tiles++;
    const t = terrainOf(f, x, y);
    terrain[i] = t;
    if (f.pavement || f.pavement_w) pave[i] = 1;
    // Uranium clouds stop a forest from cleaning (hrac_income_stats.js).
    if (f.forest && !f.uranium_cloud) forest[i] = +f.forest || 1;
    if (f.mesto) town[i] = +f.mesto || 0;
    // Bits as in js/analyze.js TF: 1 deep water, 2 Eco City, 4 Eco City 2.0.
    tflag[i] = (f.deep_water || f.deep_water2 ? 1 : 0) | (f.eco_city ? 2 : 0) | (f.eco_city_2 ? 4 : 0);
    if (t === 'mainsettlement' || t === 'settlement' || t === 'megacity') continue; // town tiles carry their own road
    let id = null;
    for (const k in f) {
      if (byKey.has(k) && !NOT_BUILDINGS.test(k) && !(k === 'rails' && f.has_street)) { id = byKey.get(k); break; }
    }
    if (!id && f.building_type && !NOT_BUILDINGS.test(f.building_type) && f.building_type !== 'mesto') {
      report.unmatched[f.building_type] = (report.unmatched[f.building_type] || 0) + 1;
    }
    // A level crossing (rails + road on one tile): the road goes in `bld` (it carries the road connection),
    // the rails in the `rail` layer so the rail line stays unbroken.
    if (f.rails && f.has_street) rail[i] = 1;
    if (!id && f.rails && !f.has_street) id = 'rail';
    if (!id && f.has_street) {
      const s = f.has_street;
      id = (t === 'river' && s === 1) ? 'river_bridge' : (f.water && SEA_BRIDGES[s]) || ROAD_IDS[s] || null;
      if (id) report.roads++;
    } else if (id) {
      report.buildings++;
      const b = byId.get(id);
      if (b?.tiles?.length && !b.isRoad && !b.isRail && !b.tiles.includes(t) && GENERIC.has(t)) {
        const water = t === 'water' || t === 'deepwater';
        terrain[i] = b.tiles.find((x) => water === (x === 'water' || x === 'deepwater' || x === 'wateroil' || x === 'gemrock' || x === 'river')) || b.tiles[0];
        report.terrainFromBuilding = (report.terrainFromBuilding || 0) + 1;
      }
    }
    bld[i] = id;
  }
  return { terrain, bld, pave, rail, forest, town, tflag, w, h, report };
}
