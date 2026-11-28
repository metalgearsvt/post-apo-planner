// Layout analysis: placement validation, rule checks, and production totals.
import { catalog } from './catalog.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Stone Conveyors boost all of these, Sea Stone Mines included (resource_storage.js GetRockBoostBonus).
const STONE_MINES = new Set(['stone_mine', 'mk2_stone_mine', 'sea_stone_mine']);
// Sea terrain (the game's `water` flag; rivers aren't part of it).
const SEA = new Set(['water', 'deepwater', 'wateroil', 'gemrock', 'shipwreck']);

// Effective gathering / effect radius after upgrades toggled in settings.
export function effRadius(b, settings) {
  if (!b || !b.radius) return 0;
  let r = b.radius;
  const up = settings.upgrades || {};
  if (b.radiusKind === 'farm' && up.bigFarms) r += 1;
  if (b.radiusKind === 'lumber' && up.advSaw && b.id !== 'premiummill') r += 1;
  return r;
}

// Max distance to Water/River for buildings with the 'nearWater2' rule (name kept for saved catalogs).
// Better Farm Watering (upgrade 198) lets Big Farms be up to 6 tiles away.
export function waterRange(b, settings) {
  if (b.id === 'bigfarm' && settings.upgrades?.farmWatering) return 6;
  return b.waterWithin || 2;
}

// Upgrades that free buildings (game keys) from needing a road (upgrades.js TryAddEffectOfSomeUpgrades).
export const ROAD_FREE_UPGRADES = {
  28: ['wood_storage', 'saw_mill', 'farm', 'farm_big', 'farm_turkey', 'farm_rabbits', 'farm_pumpkin', 'heavy_lumber_mill', 'lumber_mill_drone'],
  105: ['thermal_plant'], 407: ['toy_factory'], 358: ['super_factory', 'super_factory_2'],
  428: ['bio_dom', 'bio_dom_big', 'bio_dom_cytrium'], 542: ['blue_purifier'], 449: ['filter_array_1'],
  241: ['uranium_plant'], 212: ['giger_farm_1'], 468: ['titan_factory', 'titanium_storage', 'titan_factory_rift'],
  164: ['cementaren'], 149: ['chip_factory', 'chip_factory_big', 'chip_scrap_factory'],
  25: ['watch_tower', 'sensor_tower'], 52: ['oil_rig_ground', 'oil_storage', 'rift_miner'],
};
export const ADVANCED_INFRASTRUCTURE = 51; // any connected building passes its road connection on
export const FASTER_IRON_MINES = 36;       // each iron mine can feed 2 foundries
const owns = (settings, id) => !!settings.upgrades?.owned?.[id];

export function needsRoad(b, terrainId, settings) {
  if (!b || b.road === false || b.isRoad || b.isRail) return false;
  if (b.roadlessUpg && settings.upgrades?.roadless) return false;
  if (b.gameKey) for (const [id, keys] of Object.entries(ROAD_FREE_UPGRADES)) if (keys.includes(b.gameKey) && owns(settings, id)) return false;
  const t = catalog.tMap.get(terrainId);
  if (t?.water) return false; // water buildings connect through shipyards
  return true;
}

export function analyze(plan, settings) {
  const { w, h, terrain, bld, pave } = plan;
  const rail = plan.rail || []; // rails sharing a road tile (level crossings)
  const n = w * h;
  const T = (i) => catalog.tMap.get(terrain[i]);
  const Bd = (i) => (bld[i] ? catalog.bMap.get(bld[i]) : null);
  const xy = (i) => [i % w, (i / w) | 0];
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  function around(i, r, fn) { // square neighbourhood, excluding i itself
    const [cx, cy] = xy(i);
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
        const j = idx(x, y);
        if (j !== i) fn(j, x, y);
      }
  }
  const anyAround = (i, r, pred) => { let f = false; around(i, r, j => { if (!f && pred(j)) f = true; }); return f; };

  const cells = new Map();     // i -> { issues: [{lvl,msg}], notes: [], income:{}, power, poll }
  const issues = [];           // flat list for the Totals tab
  const fieldOwner = new Map(); // tile -> farm index
  const add = (i, lvl, msg) => { cells.get(i).issues.push({ lvl, msg }); issues.push({ i, lvl, msg }); };

  // ----- pass 0: collect buildings
  const list = [];
  for (let i = 0; i < n; i++) {
    const b = Bd(i);
    if (!bld[i]) continue;
    if (!b) { cells.set(i, { issues: [], notes: [], income: {}, power: 0, poll: 0, b: null }); add(i, 'bad', `Unknown building "${bld[i]}" (removed from catalog?)`); continue; }
    cells.set(i, { issues: [], notes: [], income: { ...(b.income || {}) }, power: b.power || 0, poll: b.poll || 0, uranium: b.uranium || 0, b });
    list.push(i);
  }

  // ----- road connectivity, as the game spreads it (road_streets.js CheckRoadConnectionRecursive):
  // settlements and roads connect whatever touches them; a connected building passes it on to a touching
  // building that lists it (linkFrom), to its own kind (linkSame), mine to mine (mineLink), or to any
  // building with Advanced Infrastructure. Shipyards count as road, and shipyards and sea bridges carry it
  // across open sea to other shipyards and bridges (sea only: rivers don't).
  let connected = null;
  if (settings.checkRoads) {
    connected = new Uint8Array(n);
    const adv = owns(settings, ADVANCED_INFRASTRUCTURE);
    const passes = (a, b) => adv || (b.linkFrom && a.gameKey && b.linkFrom.includes(a.gameKey))
      || (a.linkSame && b.id === a.id) || (a.mineLink && b.mineLink);
    const sea = (j) => SEA.has(terrain[j]);
    const q = [];
    // Start from settlements, and from mine connection origins (Premium Gold Mine, Stone Conveyor), which
    // the game treats as connected without a road (road_streets.js mineConnectionOrigin).
    for (let i = 0; i < n; i++) if (T(i)?.settlement || Bd(i)?.mineOrigin) { connected[i] = 1; q.push(i); }
    while (q.length) {
      const i = q.pop(); const [x, y] = xy(i);
      const a = Bd(i);
      const roadLike = a ? a.isRoad || a.shipyard : !sea(i);  // empty land here = settlement tile
      const onWater = !roadLike && sea(i) && (!a || !a.isRail); // open sea (or a water building) reached by ship
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy; if (!inside(nx, ny)) continue;
        const j = idx(nx, ny); if (connected[j]) continue;
        const b = Bd(j);
        let ok;
        if (onWater) ok = sea(j) || b?.shipyard;
        else if (roadLike) ok = b ? !b.isRail : T(j)?.settlement || ((a?.shipyard || sea(i)) && sea(j));
        else ok = b && !b.isRoad && !b.isRail && passes(a, b);
        if (ok) { connected[j] = 1; q.push(j); }
      }
    }
  }

  // Iron mines reach a foundry directly (within 3) or through a chain of touching mines: in game, mines
  // flagged can_connect_to_neighbour_mine pass the connection on (checked against a real save: 1,264 of 1,269 fit).
  const ironOk = new Set();
  {
    const chain = (i) => { const b = cells.get(i)?.b; return !!b && (b.mineLink || b.rules?.includes('needFoundry3')); };
    const q = list.filter(i => (cells.get(i).b.rules?.includes('needFoundry3') && anyAround(i, 3, j => Bd(j)?.foundry))
      || (cells.get(i).b.mineLink && anyAround(i, 1, j => Bd(j)?.foundry)));
    q.forEach(i => ironOk.add(i));
    while (q.length) { const i = q.pop(); around(i, 1, j => { if (!ironOk.has(j) && cells.has(j) && chain(j)) { ironOk.add(j); q.push(j); } }); }
  }

  // ----- pass 1: per-building checks
  for (const i of list) {
    const c = cells.get(i); const b = c.b; const t = T(i);
    if (b.tiles && b.tiles.length && !b.tiles.includes(terrain[i])) {
      add(i, 'bad', `${b.name} can't be built on ${t?.name || terrain[i]}`);
    }
    if (b.lvl && settings.level && b.lvl > settings.level) add(i, 'info', `${b.name} unlocks at Lv ${b.lvl} (you: ${settings.level})`);
    if (pave[i] && b.pave) {
      if (b.pave.on === 'power' && c.power > 0) c.power = Math.round(c.power * (1 + b.pave.mult));
      if (b.pave.on === 'income') for (const k in c.income) c.income[k] = Math.round(c.income[k] * (1 + b.pave.mult));
      c.notes.push(`Pavement bonus +${Math.round(b.pave.mult * 100)}%`);
    }
    if (connected && !connected[i] && needsRoad(b, terrain[i], settings)) add(i, 'warn', `${b.name} is not connected to a settlement by road`);
    for (const rule of b.rules || []) {
      switch (rule) {
        case 'nearWater2': {
          const wr = waterRange(b, settings);
          if (!anyAround(i, wr, j => T(j)?.water)) add(i, 'bad', `${b.name} must be within ${wr} tile${wr === 1 ? '' : 's'} of Water or River`);
          break;
        }
        case 'needFoundry3':
          if (!ironOk.has(i)) add(i, 'bad', `${b.name} needs a Foundry within 3 tiles (or a touching mine that has one)`);
          break;
        case 'adjStoneMine':
          if (!anyAround(i, 1, j => STONE_MINES.has(bld[j]))) add(i, 'warn', `${b.name} has no adjacent Stone Mine`);
          break;
        case 'adjContainer': {
          let k = 0; around(i, 1, j => { if (bld[j] === b.id) k++; });
          c.notes.push(k ? `${k} adjacent container(s): +100% capacity` : 'No adjacent containers (place them together for +100%)');
          break;
        }
        case 'adjSettlementBonus':
          if (anyAround(i, 1, j => T(j)?.settlement)) {
            for (const [k, v] of Object.entries(b.settleBonus || {})) c.income[k] = (c.income[k] || 0) + v;
            c.notes.push('Adjacent to a settlement: bonus gold');
          } else add(i, 'info', `${b.name} is not next to a settlement (misses bonus gold)`);
          break;
        case 'airCleanerThermal':
          if (terrain[i] === 'thermalspot') { c.power = 0; c.poll = -300; c.notes.push('On Thermal Spot: no power drain, -300 pollution'); }
          break;
        case 'allWater2': {
          let ok = true; around(i, 2, j => { if (!T(j)?.water) ok = false; });
          const [x, y] = xy(i);
          if (x < 2 || y < 2 || x > w - 3 || y > h - 3) ok = false;
          if (!ok) add(i, 'bad', `${b.name}: every tile within 2 must be water`);
          break;
        }
        case 'adjMegaOrSuburb':
          if (!anyAround(i, 1, j => terrain[j] === 'megacity' || bld[j] === 'small_suburb')) add(i, 'bad', `${b.name} must be next to a Mega City or another Suburb`);
          break;
        case 'adjRail':
          if (!anyAround(i, 1, j => Bd(j)?.isRail || rail[j])) add(i, 'warn', `${b.name} should be placed by rails`);
          break;
      }
    }
  }

  // ----- pass 2: area mechanics
  // Farms claim free buildable tiles in range, first-come (top-left first) like fields in game.
  for (const i of list) {
    const c = cells.get(i); const b = c.b;
    if (b.radiusKind !== 'farm') continue;
    const r = effRadius(b, settings); let fields = 0, shared = 0;
    around(i, r, j => {
      if (bld[j] || pave[j] || !b.tiles.includes(terrain[j])) return;
      if (fieldOwner.has(j)) { shared++; return; }
      fieldOwner.set(j, i); fields++;
    });
    const per = (b.fieldFood || 1) * (settings.upgrades?.farmImplements ? 2 : 1);
    c.income.food = fields * per; c.fields = fields;
    c.notes.push(`${fields} farm field${fields === 1 ? '' : 's'} × ${per} food`);
    if (shared) add(i, 'warn', `${b.name} overlaps another farm on ${shared} tile(s)`);
    if (!fields) add(i, 'warn', `${b.name} has no free tiles for fields`);
  }
  // Lumber mills: need Forest in range.
  for (const i of list) {
    const c = cells.get(i); const b = c.b;
    if (b.radiusKind !== 'lumber') continue;
    let k = 0; around(i, effRadius(b, settings), j => { if (T(j)?.forest || Bd(j)?.forest) k++; });
    c.forests = k; c.notes.push(`${k} forest tile(s) in range`);
    if (!k) { add(i, 'bad', `${b.name} has no Forest within ${effRadius(b, settings)} tile(s)`); c.income.lumber = 0; }
  }
  // Foundries: steel from Iron Mines in range (hybrid counts double). Each mine feeds one foundry,
  // or two with Faster Iron Mines (hrac_income_stats.js: countedBy capped at upgrade 36's value).
  const mineCap = owns(settings, FASTER_IRON_MINES) ? 2 : 1;
  const mineUses = new Map();
  for (const i of list) {
    const c = cells.get(i); const b = c.b;
    if (!b.foundry) continue;
    let mines = 0, shared = 0;
    around(i, effRadius(b, settings) || 3, j => {
      const v = (bld[j] === 'iron_mine' || bld[j] === 'mk2_iron_mine') ? 1 : bld[j] === 'hybrid_mine' ? 2 : 0;
      if (!v) return;
      const used = mineUses.get(j) || 0;
      if (used >= mineCap) { shared++; return; }
      mineUses.set(j, used + 1); mines += v;
    });
    if (shared && !mines) add(i, 'warn', `${b.name}: its iron mines already feed another foundry`);
    c.mines = mines;
    if (b.steelPerMine) c.income.steel = (c.income.steel || 0) + mines * b.steelPerMine;
    c.notes.push(`${mines} iron mine(s) feeding${b.steelPerMine ? ` → ${mines * b.steelPerMine} steel` : ' (steel rate not on wiki)'}`);
    if (!mines && !shared) add(i, 'warn', `${b.name} has no Iron Mines within 3 tiles`);
  }
  // Stone conveyors: +200% to adjacent stone mines (no stacking).
  const boosted = new Set();
  for (const i of list) if (cells.get(i).b.rules?.includes('adjStoneMine')) around(i, 1, j => { if (STONE_MINES.has(bld[j])) boosted.add(j); });
  for (const j of boosted) { const c = cells.get(j); c.income.stone = (c.income.stone || 0) * 3; c.notes.push('Stone Conveyor adjacent: +200%'); }
  // Tankers: +100% to offshore oil rigs within range.
  const tanked = new Set();
  for (const i of list) { const b = cells.get(i).b; if (b.radiusKind === 'tanker') around(i, b.radius, j => { if (bld[j] === 'offshoreoilrig') tanked.add(j); }); }
  for (const j of tanked) { const c = cells.get(j); c.income.oil = (c.income.oil || 0) * 2; c.notes.push('Tanker in range: +100% oil'); }

  // ----- totals
  const totals = { powerGen: 0, powerUse: 0, poll: 0, pollAdd: 0, pollRem: 0, income: {}, cost: {}, counts: {}, buildings: list.length, fields: fieldOwner.size, paved: 0, uranium: 0 };
  for (const i of list) {
    const c = cells.get(i); const b = c.b;
    if (c.power > 0) totals.powerGen += c.power; else totals.powerUse -= c.power;
    totals.poll += c.poll; if (c.poll > 0) totals.pollAdd += c.poll; else totals.pollRem -= c.poll;
    if (c.uranium) totals.uranium += c.uranium;
    for (const [k, v] of Object.entries(c.income)) if (typeof v === 'number') totals.income[k] = (totals.income[k] || 0) + v;
    for (const [k, v] of Object.entries(b.cost || {})) if (typeof v === 'number') totals.cost[k] = (totals.cost[k] || 0) + v;
    totals.counts[b.id] = (totals.counts[b.id] || 0) + 1;
  }
  if (totals.uranium) totals.income.uranium = (totals.income.uranium || 0) + totals.uranium;
  for (let i = 0; i < n; i++) if (pave[i]) totals.paved++;
  const railB = catalog.bMap.get('rail');
  if (railB) for (let i = 0; i < n; i++) if (rail[i] && bld[i]) { // the rails of a level crossing
    totals.poll += railB.poll || 0; totals.pollAdd += Math.max(0, railB.poll || 0);
    for (const [k, v] of Object.entries(railB.cost || {})) if (typeof v === 'number') totals.cost[k] = (totals.cost[k] || 0) + v;
    totals.counts.rail = (totals.counts.rail || 0) + 1;
  }

  const rank = { bad: 0, warn: 1, info: 2 };
  issues.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
  return { cells, issues, totals, fieldOwner, connected };
}
