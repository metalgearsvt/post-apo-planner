// Catalog the planner uses: data mined from the game (js/gamedata.js) merged over the
// wiki catalog (js/data_wiki.js). For every field the game value wins; the wiki value is only
// kept where the game data has nothing for that field. Each building records which it got:
//   source: 'game' | 'wiki'      fallback: [fields that still come from the wiki]
import { WIKI_TERRAIN, WIKI_BUILDINGS } from './data_wiki.js';
import { GAME_BUILDINGS, GAME_EXTRA_TERRAIN, GAME_SOURCE } from './gamedata.js';

export { GAME_SOURCE };

export const CATEGORIES = [
  'Roads', 'Gold', 'Lumber', 'Farms', 'Power', 'Stone & Steel', 'Microchips', 'Oil',
  'Uranium', 'Titanium', 'Gems', 'Storage', 'Shipyards', 'Cleaners', 'Scouting', 'Trees', 'Rail & Other',
  'Events', 'Special',
];

export const CAT_COLORS = {
  'Roads': '#c9c2b4', 'Gold': '#f2c230', 'Lumber': '#8a5a2b', 'Farms': '#9ccf5a', 'Power': '#ffd84a',
  'Stone & Steel': '#9aa4ad', 'Microchips': '#3fc1c9', 'Oil': '#222831', 'Uranium': '#7fe03a', 'Titanium': '#8fa3b8',
  'Gems': '#c86fe0', 'Storage': '#d08b4a', 'Shipyards': '#4a7fd0', 'Cleaners': '#58d6a0',
  'Scouting': '#e86f6f', 'Trees': '#2f8f3a', 'Rail & Other': '#b07acc', 'Events': '#ff7fb0', 'Special': '#a0a0a0',
  'Unverified': '#ff9f43',
};

export const RESOURCES = ['gold', 'food', 'lumber', 'stone', 'steel', 'chips', 'red_chips', 'oil', 'uranium', 'gems', 'titanium', 'cytrium', 'clay'];
export const RES_LABEL = {
  gold: 'Gold', food: 'Food', lumber: 'Lumber', stone: 'Stone', steel: 'Steel', chips: 'Microchips', red_chips: 'Red Chips',
  oil: 'Oil', uranium: 'U-Battery', gems: 'Gems', titanium: 'Titanium', cytrium: 'Cytrium', clay: 'Clay',
};

export const TERRAIN = [...WIKI_TERRAIN, ...GAME_EXTRA_TERRAIN.filter((t) => !WIKI_TERRAIN.some((w) => w.id === t.id))];

// Fields the game data can supply. Anything else (rules, radiusKind, abbr, colour, notes, flags
// like foundry / isRoad) is planner logic and stays as the wiki catalog defines it.
const GAME_FIELDS = ['name', 'lvl', 'cost', 'power', 'poll', 'income', 'uranium', 'tiles', 'radius', 'pave', 'premium', 'road', 'storage', 'fieldFood', 'waterWithin', 'mineLink', 'linkFrom', 'linkSame', 'shipyard', 'mineOrigin'];

function merge(wiki, game) {
  const b = { ...wiki };
  const fallback = [];
  for (const f of GAME_FIELDS) {
    if (game[f] === undefined) { if (wiki[f] !== undefined) fallback.push(f); continue; }
    if (f === 'income' && wiki.income) {
      // Per-resource: the game wins, wiki fills resources the game doesn't state.
      const extra = Object.keys(wiki.income).filter((k) => !(k in game.income));
      if (extra.length) fallback.push(...extra.map((k) => `income.${k}`));
      b.income = { ...wiki.income, ...game.income };
    } else b[f] = game[f];
  }
  if (game.newRules) b.rules = [...new Set([...(wiki.rules || []), ...game.newRules])]; // placement rules found in game data
  if (b.cat === 'Unverified') b.cat = game.cat;
  b.gameKey = game.key;
  b.source = 'game';
  b.fallback = fallback;
  return b;
}

function fromGameOnly(g) {
  const b = {};
  for (const [k, v] of Object.entries(g)) if (!['wikiId', 'key', 'unlock', 'newRules', 'newDesc'].includes(k)) b[k] = v;
  if (g.newRules) b.rules = g.newRules;
  if (g.newDesc) b.desc = g.newDesc;
  b.gameKey = g.key;
  b.source = 'game';
  b.fallback = [];
  return b;
}

const byWiki = new Map(GAME_BUILDINGS.filter((g) => g.wikiId).map((g) => [g.wikiId, g]));
export const BUILDINGS = [
  ...WIKI_BUILDINGS.map((w) => (byWiki.has(w.id) ? merge(w, byWiki.get(w.id)) : { ...w, source: 'wiki', fallback: [] })),
  ...GAME_BUILDINGS.filter((g) => !g.wikiId).map(fromGameOnly),
];
