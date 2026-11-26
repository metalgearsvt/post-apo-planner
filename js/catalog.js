// Catalog = game data with wiki fallback (data.js), then optionally the player's own upgraded values
// (an account profile, see tools/re/build_profile.mjs), then the user's edits and custom entries (localStorage).
import { TERRAIN, BUILDINGS, CATEGORIES, CAT_COLORS } from './data.js';

const KEY = 'pat.catalog.v1';

function blank() { return { buildings: {}, customBuildings: [], customTerrain: [] }; }
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return blank(); }
}

let user = load();

// ----- account profile: per-building values with the player's upgrades applied
const PKEY = 'pat.profile.v1';
let profile = (() => { try { return JSON.parse(localStorage.getItem(PKEY)) || null; } catch { return null; } })();
export function getProfile() { return profile; }
export function profileActive() { return !!(profile && profile.enabled !== false); }
export function setProfile(p) {
  if (!p || p.kind !== 'post-apo-planner-profile' || typeof p.buildings !== 'object') throw new Error('Not an account values file');
  profile = { ...p, enabled: true };
  localStorage.setItem(PKEY, JSON.stringify(profile)); rebuild();
}
export function setProfileEnabled(on) { if (!profile) return; profile.enabled = !!on; localStorage.setItem(PKEY, JSON.stringify(profile)); rebuild(); }
export function clearProfile() { profile = null; localStorage.removeItem(PKEY); rebuild(); }
function withProfile(b) {
  const o = profileActive() && profile.buildings[b.id];
  if (!o) return b;
  return { ...b, ...o, income: o.income ? { ...(b.income || {}), ...o.income } : b.income, profileFields: Object.keys(o) };
}
const baseOf = (id) => { const b = BUILDINGS.find(x => x.id === id); return b && withProfile(b); };

export const catalog = {
  terrain: [], buildings: [], tMap: new Map(), bMap: new Map(),
  categories: [...CATEGORIES],
};

export function rebuild() {
  catalog.terrain = [...TERRAIN, ...user.customTerrain.map(t => ({ ...t, custom: true }))];
  catalog.buildings = [
    ...BUILDINGS.map(withProfile).map(b => user.buildings[b.id] ? { ...b, ...user.buildings[b.id], edited: true } : b),
    ...user.customBuildings.map(b => ({ ...b, custom: true })),
  ];
  catalog.tMap = new Map(catalog.terrain.map(t => [t.id, t]));
  catalog.bMap = new Map(catalog.buildings.map(b => [b.id, b]));
  const cats = new Set(CATEGORIES);
  for (const b of catalog.buildings) cats.add(b.cat || 'Custom');
  catalog.categories = [...cats];
}
rebuild();

function persist() { localStorage.setItem(KEY, JSON.stringify(user)); rebuild(); }

export function isDefaultBuilding(id) { return BUILDINGS.some(b => b.id === id); }

export function saveBuilding(b) {
  if (isDefaultBuilding(b.id)) {
    const base = baseOf(b.id);
    const patch = {};
    for (const [k, v] of Object.entries(b)) {
      if (k === 'edited' || k === 'custom' || k === 'profileFields') continue;
      if (JSON.stringify(base[k]) !== JSON.stringify(v)) patch[k] = v;
    }
    if (Object.keys(patch).length) user.buildings[b.id] = patch; else delete user.buildings[b.id];
  } else {
    const clean = { ...b }; delete clean.custom; delete clean.edited;
    const i = user.customBuildings.findIndex(x => x.id === b.id);
    if (i >= 0) user.customBuildings[i] = clean; else user.customBuildings.push(clean);
  }
  persist();
}

export function resetBuilding(id) { delete user.buildings[id]; persist(); }
export function deleteCustomBuilding(id) { user.customBuildings = user.customBuildings.filter(b => b.id !== id); persist(); }

export function saveTerrain(t) {
  const clean = { ...t }; delete clean.custom;
  const i = user.customTerrain.findIndex(x => x.id === t.id);
  if (i >= 0) user.customTerrain[i] = clean; else user.customTerrain.push(clean);
  persist();
}
export function deleteCustomTerrain(id) { user.customTerrain = user.customTerrain.filter(t => t.id !== id); persist(); }

export function exportCatalog() { return JSON.parse(JSON.stringify(user)); }
export function importCatalog(data, merge = true) {
  if (!data) return;
  if (!merge) user = blank();
  Object.assign(user.buildings, data.buildings || {});
  for (const b of data.customBuildings || []) {
    const i = user.customBuildings.findIndex(x => x.id === b.id);
    if (i >= 0) user.customBuildings[i] = b; else user.customBuildings.push(b);
  }
  for (const t of data.customTerrain || []) {
    const i = user.customTerrain.findIndex(x => x.id === t.id);
    if (i >= 0) user.customTerrain[i] = t; else user.customTerrain.push(t);
  }
  persist();
}
export function resetCatalog() { user = blank(); persist(); }

export function bColor(b) { return b.color || CAT_COLORS[b.cat] || '#cccccc'; }
export function abbr(b) {
  if (b.abbr !== undefined && b.abbr !== null) return b.abbr;
  return b.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
}
