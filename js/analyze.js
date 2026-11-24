// Layout analysis: placement validation, rule checks, and production totals.
import { catalog } from './catalog.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Effective gathering / effect radius after upgrades toggled in settings.
export function effRadius(b, settings) {
  if (!b || !b.radius) return 0;
  let r = b.radius;
  const up = settings.upgrades || {};
  if (b.radiusKind === 'farm' && up.bigFarms) r += 1;
  if (b.radiusKind === 'lumber' && up.advSaw && b.id !== 'premiummill') r += 1;
  return r;
}

export function needsRoad(b, terrainId, settings) {
  if (!b || b.road === false || b.isRoad || b.isRail) return false;
  if (b.roadlessUpg && settings.upgrades?.roadless) return false;
  const t = catalog.tMap.get(terrainId);
  if (t?.water) return false; // water buildings connect through shipyards
  return true;
}

export function analyze(plan, settings) {
  const { w, h, terrain, bld, pave } = plan;
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

  // ----- road connectivity (BFS from settlements through roads)
  let connected = null;
  if (settings.checkRoads) {
    connected = new Uint8Array(n);
    const q = [];
    for (let i = 0; i < n; i++) if (T(i)?.settlement) { connected[i] = 1; q.push(i); }
    while (q.length) {
      const i = q.pop(); const [x, y] = xy(i);
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy; if (!inside(nx, ny)) continue;
        const j = idx(nx, ny); if (connected[j]) continue;
        const b = Bd(j);
        if ((b && b.isRoad) || T(j)?.settlement) { connected[j] = 1; q.push(j); }
      }
    }
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
    if (connected && needsRoad(b, terrain[i], settings)) {
      const [x, y] = xy(i);
      const ok = N4.some(([dx, dy]) => inside(x + dx, y + dy) && connected[idx(x + dx, y + dy)]);
      if (!ok) add(i, 'warn', `${b.name} is not connected to a settlement by road`);
    }
    for (const rule of b.rules || []) {
      switch (rule) {
        case 'nearWater2':
          if (!anyAround(i, 2, j => T(j)?.water)) add(i, 'bad', `${b.name} must be within 2 tiles of Water or River`);
          break;
        case 'needFoundry3':
          if (!anyAround(i, 3, j => Bd(j)?.foundry)) add(i, 'bad', `${b.name} needs a Foundry within 3 tiles`);
          break;
        case 'adjStoneMine':
          if (!anyAround(i, 1, j => /stone_mine$/.test(bld[j] || '') && bld[j] !== 'sea_stone_mine')) add(i, 'warn', `${b.name} has no adjacent Stone Mine`);
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
          if (!anyAround(i, 1, j => Bd(j)?.isRail)) add(i, 'warn', `${b.name} should be placed by rails`);
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
  // Foundries: steel from Iron Mines in range (hybrid counts double). Each mine feeds one foundry.
  const mineOwner = new Map();
  for (const i of list) {
    const c = cells.get(i); const b = c.b;
    if (!b.foundry) continue;
    let mines = 0, shared = 0;
    around(i, effRadius(b, settings) || 3, j => {
      const v = (bld[j] === 'iron_mine' || bld[j] === 'mk2_iron_mine') ? 1 : bld[j] === 'hybrid_mine' ? 2 : 0;
      if (!v) return;
      if (mineOwner.has(j)) { shared++; return; }
      mineOwner.set(j, i); mines += v;
    });
    if (shared && !mines) add(i, 'warn', `${b.name}: its iron mines already feed another foundry`);
    c.mines = mines;
    if (b.steelPerMine) c.income.steel = (c.income.steel || 0) + mines * b.steelPerMine;
    c.notes.push(`${mines} iron mine(s) feeding${b.steelPerMine ? ` → ${mines * b.steelPerMine} steel` : ' (steel rate not on wiki)'}`);
    if (!mines && !shared) add(i, 'warn', `${b.name} has no Iron Mines within 3 tiles`);
  }
  // Stone conveyors: +200% to adjacent stone mines (no stacking).
  const boosted = new Set();
  for (const i of list) if (cells.get(i).b.rules?.includes('adjStoneMine')) around(i, 1, j => { if (bld[j] === 'stone_mine' || bld[j] === 'mk2_stone_mine') boosted.add(j); });
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

  const rank = { bad: 0, warn: 1, info: 2 };
  issues.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
  return { cells, issues, totals, fieldOwner, connected };
}
