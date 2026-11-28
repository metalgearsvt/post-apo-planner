// Optional game icons. The planner ships WITHOUT game art; icons only appear when the user supplies them:
//   1. Local folder icons/game/ (built from your own APK by tools/re/build_icons.mjs, git-ignored), or
//   2. An icon pack file imported in the app (stored in this browser's IndexedDB), e.g. on a phone.
// Without either, buildings and terrain are drawn as coloured tiles like before.

const SIZE = 96; // px per cropped icon
const DB = 'pat-icons', STORE = 'pack', KEY = 'current';

// id -> canvas; r: tiles that join their neighbours, road id (or RIVER) -> Map(variant -> canvas)
export const icons = { b: new Map(), t: new Map(), r: new Map(), source: null };
export const RIVER = 'terrain:river', RIVER_TREES = 'terrain:river_trees', RAILS = 'rails';
const urlCache = new Map();

function idb(mode, fn) {
  return new Promise((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => rej(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { res(req?.result); open.result.close(); };
      tx.onerror = () => rej(tx.error);
    };
  });
}

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

function crop(img, s) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const sx = s?.x ?? 0, sy = s?.y ?? 0, sw = s?.w ?? img.naturalWidth, sh = s?.h ?? img.naturalHeight;
  const k = SIZE / Math.max(sw, sh);
  const dw = sw * k, dh = sh * k;
  // Tall buildings stick out above their tile in game: bottom-align them.
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, (SIZE - dw) / 2, SIZE - dh, dw, dh);
  return c;
}

function reset() { icons.b.clear(); icons.t.clear(); icons.r.clear(); urlCache.clear(); icons.source = null; }

// Which road / river sprite the game draws, from which sides connect (the game's BuildStreet / RotateRiversAuto):
//   12 = straight vertical, 11 = straight horizontal, 5 = crossing,
//   T-junctions: 8 = no up, 6 = no right, 4 = no left, 2 = no down; corners: 1 = up+right, 3 = up+left,
//   7 = down+right, 9 = down+left.
// Roads use a straight piece for dead ends and lone tiles; rivers (ends = true) have end pieces:
//   22 = up only, 88 = down only, 66 = left only, 44 = right only, 13 = none.
export function connVariant(up, down, left, right, ends = false) {
  if (ends && up + down + left + right <= 1) return up ? '22' : down ? '88' : left ? '66' : right ? '44' : '13';
  return roadVariant(up, down, left, right);
}
export function roadVariant(up, down, left, right) {
  if (!left && !right) return '12';
  if (!up && !down) return '11';
  if (up && down) return left && right ? '5' : left ? '6' : '4';
  if (left && right) return up ? '2' : '8';
  return up ? (left ? '3' : '1') : (left ? '9' : '7');
}

// Road / river sprites are full tiles, kept at their aspect ratio: taller ones (river banks with trees) stick out
// above the tile, the way the game draws them. Draw them tile-wide and bottom-aligned (see drawTile in app.js).
function cropTile(img, s) {
  const sw = s?.w ?? img.naturalWidth, sh = s?.h ?? img.naturalHeight;
  const c = document.createElement('canvas'); c.width = SIZE; c.height = Math.round(SIZE * sh / sw);
  c.getContext('2d').drawImage(img, s?.x ?? 0, s?.y ?? 0, sw, sh, 0, 0, c.width, c.height);
  return c;
}

async function fromPack(pack, source) {
  reset();
  for (const kind of ['b', 't']) {
    await Promise.all(Object.entries(pack[kind] || {}).map(async ([id, url]) => {
      try { icons[kind].set(id, crop(await loadImg(url))); } catch { /* skip broken entry */ }
    }));
  }
  await Promise.all(Object.entries(pack.r || {}).map(async ([id, vs]) => {
    const m = new Map();
    await Promise.all(Object.entries(vs).map(async ([v, url]) => { try { m.set(v, cropTile(await loadImg(url))); } catch { } }));
    if (m.size) icons.r.set(id, m);
  }));
  icons.source = source;
}

async function fromFolder() {
  const r = await fetch('icons/game/manifest.json', { cache: 'no-cache' });
  if (!r.ok) return false;
  const m = await r.json();
  const sheets = new Map();
  await Promise.all(m.files.map(async (f) => { try { sheets.set(f, await loadImg(`icons/game/${f}`)); } catch { } }));
  reset();
  for (const [kind, key] of [['b', 'buildings'], ['t', 'terrain']]) {
    for (const [id, s] of Object.entries(m[key] || {})) {
      const img = sheets.get(s.file); if (img) icons[kind].set(id, crop(img, s.x == null ? null : s));
    }
  }
  for (const [id, vs] of [...Object.entries(m.roads || {}), [RIVER, m.river || {}], [RIVER_TREES, m.river_trees || {}], [RAILS, m.rails || {}]]) {
    const out = new Map();
    for (const [v, s] of Object.entries(vs)) { const img = sheets.get(s.file); if (img) out.set(v, cropTile(img, s.x == null ? null : s)); }
    if (out.size) icons.r.set(id, out);
  }
  icons.source = 'folder';
  return icons.b.size + icons.t.size > 0;
}

// Imported pack wins (it's what the user chose on this device), then the local folder.
export async function loadIcons() {
  try {
    const pack = await idb('readonly', (s) => s.get(KEY));
    if (pack) { await fromPack(pack, 'imported'); return icons.source; }
  } catch { /* IndexedDB unavailable */ }
  try { if (await fromFolder()) return icons.source; } catch { /* no folder */ }
  reset();
  return null;
}

export function iconURL(kind, id) {
  const k = kind + id;
  if (!urlCache.has(k)) { const c = icons[kind].get(id); urlCache.set(k, c ? c.toDataURL('image/png') : null); }
  return urlCache.get(k);
}

// A pack file holds the already-cropped icons as PNG data URLs, so it's small and self-contained.
export function exportPack() {
  const out = { kind: 'post-apo-planner-icons', version: 1, note: 'Game art from your own copy of the game. Personal use only; do not share.', b: {}, t: {}, r: {} };
  for (const kind of ['b', 't']) for (const id of icons[kind].keys()) out[kind][id] = iconURL(kind, id);
  for (const [id, vs] of icons.r) {
    out.r[id] = {};
    for (const [v, c] of vs) out.r[id][v] = c.toDataURL('image/png');
  }
  return out;
}

export async function importPack(data) {
  if (!data || data.kind !== 'post-apo-planner-icons') throw new Error('Not an icon pack file');
  await idb('readwrite', (s) => s.put({ b: data.b, t: data.t, r: data.r }, KEY));
  await fromPack(data, 'imported');
}

export async function removeImportedPack() {
  await idb('readwrite', (s) => s.delete(KEY));
  return loadIcons();
}
