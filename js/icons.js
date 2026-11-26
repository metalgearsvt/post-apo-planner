// Optional game icons. The planner ships WITHOUT game art; icons only appear when the user supplies them:
//   1. Local folder icons/game/ (built from your own APK by tools/re/build_icons.mjs, git-ignored), or
//   2. An icon pack file imported in the app (stored in this browser's IndexedDB), e.g. on a phone.
// Without either, buildings and terrain are drawn as coloured tiles like before.

const SIZE = 96; // px per cropped icon
const DB = 'pat-icons', STORE = 'pack', KEY = 'current';

export const icons = { b: new Map(), t: new Map(), source: null }; // id -> canvas
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

function reset() { icons.b.clear(); icons.t.clear(); urlCache.clear(); icons.source = null; }

async function fromPack(pack, source) {
  reset();
  for (const kind of ['b', 't']) {
    await Promise.all(Object.entries(pack[kind] || {}).map(async ([id, url]) => {
      try { icons[kind].set(id, crop(await loadImg(url))); } catch { /* skip broken entry */ }
    }));
  }
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
  const out = { kind: 'post-apo-planner-icons', version: 1, note: 'Game art from your own copy of the game. Personal use only; do not share.', b: {}, t: {} };
  for (const kind of ['b', 't']) for (const id of icons[kind].keys()) out[kind][id] = iconURL(kind, id);
  return out;
}

export async function importPack(data) {
  if (!data || data.kind !== 'post-apo-planner-icons') throw new Error('Not an icon pack file');
  await idb('readwrite', (s) => s.put({ b: data.b, t: data.t }, KEY));
  await fromPack(data, 'imported');
}

export async function removeImportedPack() {
  await idb('readwrite', (s) => s.delete(KEY));
  return loadIcons();
}
