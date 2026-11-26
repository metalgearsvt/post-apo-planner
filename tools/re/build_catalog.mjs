// Builds js/gamedata.js (planner-format records) from data/game/*.json.
// js/data.js merges these over the wiki fallback in js/data_wiki.js.
// usage: node tools/re/build_catalog.mjs
import fs from 'node:fs';
import { WIKI_TO_GAME, TILE_TO_TERRAIN, EXTRA_TERRAIN } from './mapping.mjs';
import { WIKI_BUILDINGS, LAND, SEA } from '../../js/data_wiki.js';

const read = (f) => JSON.parse(fs.readFileSync(`data/game/${f}`, 'utf8'));
const { source, data: buildings } = read('buildings.json');
const roads = read('roads.json').data;
const forests = read('forests.json').data;
const actions = read('actions.json').data;
const constants = read('constants.json').data;
// Food per farm field (farm -> basic fields, big farm -> advanced fields; inferred from hrac_income_stats.js).
const FIELD_FOOD = { farm: constants.FarmFieldFoodProduction, farm_big: constants.AdvancedFarmFieldFoodProduction };

const GAME_TO_WIKI = Object.fromEntries(Object.entries(WIKI_TO_GAME).map(([w, g]) => [g, w]));
const wikiIds = new Set(WIKI_BUILDINGS.map((b) => b.id));

// Buildings that aren't separate placeable things in the planner: auto-placed fields, wrecks on the map,
// story props, and duplicate variants of the same building.
const SKIP = /^(farmfield_|.*_broken$|rocket_silo_story$|empty_rocket_silo_2$|legacy_hill_flatten$|tree[456]$|palms2$|replicator2$|rift_storage_2$|fish_hammer$)/;

const PLAIN = [...LAND, 'sand'];
const mapTiles = (keys) => [...new Set((keys || []).map((k) => TILE_TO_TERRAIN[k]).filter(Boolean))];

function tilesFor(g) {
  const t = g.tiles || {};
  let out;
  if (t.only && t.only.length) out = mapTiles(t.only);
  else {
    out = [];
    if (t.categories?.includes('Plain')) out.push(...PLAIN);
    if (t.categories?.includes('Water')) out.push(...SEA);
  }
  out.push(...mapTiles(t.also));
  const forbidden = new Set(mapTiles(t.forbidden));
  out = [...new Set(out)].filter((x) => !forbidden.has(x));
  return out.length ? out : undefined; // undefined -> wiki fallback
}

function categoryFor(g) {
  const k = g.key, c = g.category || [];
  if (g.unlock === 'event') return 'Events';
  if (/titan/.test(k) && !/golden_titan/.test(k)) return 'Titanium';
  if (/golden|gold_mine|super_factory/.test(k)) return 'Gold';
  if (/shipyard|ship_big|lighthouse/.test(k)) return 'Shipyards';
  if (/storage|silo/.test(k)) return 'Storage';
  if (/saw|lumber|wood/.test(k)) return 'Lumber';
  if (/farm|bio_dom/.test(k)) return 'Farms';
  if (/rock|iron|foundry|steel|cement/.test(k)) return 'Stone & Steel';
  if (/chip/.test(k)) return 'Microchips';
  if (/oil|rift_miner|tanker/.test(k)) return 'Oil';
  if (/uran|reactor/.test(k)) return 'Uranium';
  if (/gem/.test(k)) return 'Gems';
  if (/rail|train|station|primestie/.test(k)) return 'Rail & Other';
  if (/sensor|watch|radar/.test(k)) return 'Scouting';
  if (c.includes('Power Plants')) return 'Power';
  if (c.includes('Purifiers')) return 'Cleaners';
  if (c.includes('Nature')) return 'Trees';
  return 'Special';
}

const clean = (o) => JSON.parse(JSON.stringify(o)); // drop undefined
const nonEmpty = (o) => (o && Object.keys(o).length ? o : undefined);
const plainText = (s) => (typeof s === 'string' && s && !/[{<]/.test(s) ? s : undefined);

function fromBuilding(g) {
  const wikiId = GAME_TO_WIKI[g.key];
  const pave = g.pavement_bonus && g.pavement_bonus.percent
    ? { mult: g.pavement_bonus.percent / 100, on: g.pavement_bonus.applies_to === 'production' ? 'income' : g.pavement_bonus.applies_to }
    : undefined;
  const rules = [];
  if (g.rules?.water_within) rules.push('nearWater2'); // range comes from waterWithin
  const unlockNote = g.unlock === 'event' ? 'Event building.' : g.unlock === 'shop/story' ? 'Not unlocked by level (shop, offer or story).' : undefined;
  return clean({
    id: wikiId || (wikiIds.has(g.key) ? `g_${g.key}` : g.key),
    wikiId,
    key: g.key,
    name: g.name,
    cat: categoryFor(g),
    lvl: g.level == null ? undefined : Math.max(1, g.level),
    cost: nonEmpty(g.cost || undefined),
    power: g.power ?? undefined,
    poll: g.pollution ?? undefined,
    income: nonEmpty(g.income),
    uranium: g.uranium_drain ? -g.uranium_drain : undefined,
    tiles: tilesFor(g),
    radius: g.radius,
    pave,
    premium: g.premium,
    road: g.rules?.requires_road ? true : false,
    storage: nonEmpty(g.storage),
    fieldFood: FIELD_FOOD[g.key],
    waterWithin: g.rules?.water_within || undefined,
    // Mines that pass a foundry connection on to touching mines (can_connect_to_neighbour_mine / isMineConnectionOrigin).
    mineLink: g.rules?.connects_to_neighbour_mine || g.raw?.isMineConnectionOrigin ? true : undefined,
    unlock: g.unlock,
    // only used for buildings that are new to the planner (wiki rules/desc win when present)
    newRules: rules.length ? rules : undefined,
    newDesc: [plainText(g.description), unlockNote].filter(Boolean).join(' ') || undefined,
  });
}

const out = [];
for (const g of [...buildings, ...actions.filter((a) => a.key === 'pavement_notsaved')]) {
  if (SKIP.test(g.key)) continue;
  if (g.key.endsWith('_notsaved') && !GAME_TO_WIKI[g.key]) continue; // tile actions, not buildings
  if (g.key === 'pavement_notsaved') { out.push(clean({ id: 'pavement', wikiId: 'pavement', key: g.key, lvl: g.level == null ? undefined : Math.max(1, g.level), cost: nonEmpty(g.cost || undefined) })); continue; }
  const rec = fromBuilding(g);
  if (g.raw?.allows_build_on_hill && rec.tiles) rec.tiles = [...new Set([...rec.tiles, 'hill'])];
  // Rails can cross rivers and sea on bridges (seen in real saves; the building data doesn't list it).
  if (g.key === 'rails' && rec.tiles) rec.tiles = [...new Set([...rec.tiles, 'river', 'water', 'deepwater'])];
  out.push(rec);
}

// Roads and bridges.
const ROAD_IDS = [null, 'dirt_road', 'paved_road', 'basic_road', 'street_road', 'fast_road', 'eco_road', 'eco_highway', 'super_highway'];
const BRIDGES = { 1: ['river_or_swamp', 'river_bridge'], 4: ['sea', 'sea_bridge_t1'], 5: ['sea', 'sea_bridge_t2'], 6: ['sea', 'sea_bridge_t3'] };
for (const r of roads) {
  const id = ROAD_IDS[r.type];
  const isNew = !wikiIds.has(id);
  // Any road type can bridge a straight river (road_streets.js AllowStreetInGrid). Fast Road needs plain tiles.
  const roadTiles = [...(r.type === 5 ? ['grass'] : PLAIN), 'river'];
  out.push(clean({
    id, wikiId: isNew ? undefined : id, key: r.key, name: r.name, cat: 'Roads', lvl: r.level == null ? undefined : Math.max(1, r.level),
    cost: r.cost.plain, poll: r.pollution, income: r.income.gold ? r.income : undefined, power: 0, tiles: roadTiles,
    ...(isNew ? { isRoad: true, road: false, abbr: '', newDesc: r.note } : {}),
  }));
  if (BRIDGES[r.type]) {
    const [tile, bid] = BRIDGES[r.type];
    // Bridge level isn't a separate value in the game data: keep the wiki's.
    out.push(clean({ id: bid, wikiId: bid, key: `${r.key}:${tile}`, cost: r.cost[tile], poll: r.pollution, income: r.income.gold ? r.income : undefined, power: 0 }));
  }
}

// Planted forests.
const FOREST_IDS = [null, 'small_forest', 'dense_forest', 'deep_forest', 'thick_forest', 'tall_forest', 'lush_tall_forest'];
for (const f of forests) {
  const id = FOREST_IDS[f.type];
  const isNew = !wikiIds.has(id);
  out.push(clean({
    id, wikiId: isNew ? undefined : id, key: f.key, name: f.name, cat: 'Trees', lvl: f.level == null ? undefined : Math.max(1, f.level),
    cost: f.cost, poll: f.pollution, income: f.income, power: 0,
    ...(isNew ? { tiles: [...LAND], road: false, forest: true, abbr: '' } : {}),
  }));
}

const header = `// GENERATED by tools/re/build_catalog.mjs from data/game/*.json. Do not edit by hand.
// Game: ${source.game} ${source.app_version} (${source.bundle}), extracted ${source.extracted}.
// Base values (no upgrades). js/data.js merges these over the wiki fallback in js/data_wiki.js.
`;
fs.writeFileSync('js/gamedata.js', `${header}
export const GAME_SOURCE = ${JSON.stringify({ app_version: source.app_version, bundle: source.bundle, extracted: source.extracted })};

export const GAME_EXTRA_TERRAIN = ${JSON.stringify(EXTRA_TERRAIN, null, 1)};

export const GAME_BUILDINGS = [
${out.map((b) => '  ' + JSON.stringify(b)).join(',\n')}
];
`);
const matched = out.filter((b) => b.wikiId).length;
console.log(`js/gamedata.js: ${out.length} records (${matched} overlay wiki entries, ${out.length - matched} new)`);
const unmatchedWiki = WIKI_BUILDINGS.filter((w) => !out.some((b) => b.wikiId === w.id)).map((w) => w.id);
console.log('wiki entries with no game data:', unmatchedWiki.join(', ') || 'none');
