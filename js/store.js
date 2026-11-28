// Saved plans live in IndexedDB, one record per plan. Unlike localStorage (about 5 MB for the whole site,
// rewritten in one piece on every save) this holds large imported maps and saves only the plan that changed.
// Plans saved by older versions in localStorage are moved over once. If IndexedDB can't be opened
// (some private-browsing modes), it falls back to localStorage.

const DB = 'pat-plans', STORE = 'plans', LS_KEY = 'pat.plans.v1';
let backend = 'idb';
let all = {}; // id -> encoded plan, shared with the app

let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
    open.onblocked = () => rej(new Error('IndexedDB blocked'));
  });
}
function tx(mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB transaction failed'));
  }));
}
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const writeLocal = () => localStorage.setItem(LS_KEY, JSON.stringify(all));

/** Loads every saved plan. Returns the id -> plan object that the app keeps using. */
export async function loadPlans() {
  try {
    if (!('indexedDB' in self)) throw new Error('no IndexedDB');
    const list = await tx('readonly', (s) => s.getAll());
    all = Object.fromEntries(list.map((p) => [p.id, p]));
    const old = readLocal();
    const move = Object.values(old).filter((p) => p?.id && !all[p.id]);
    if (move.length) await tx('readwrite', (s) => { for (const p of move) s.put(p); });
    for (const p of move) all[p.id] = p;
    if (localStorage.getItem(LS_KEY) !== null) localStorage.removeItem(LS_KEY);
  } catch (err) {
    console.warn('Plans: IndexedDB unavailable, using localStorage', err);
    backend = 'local';
    all = readLocal();
  }
  return all;
}

/** Saves the given plans (already set in the shared object). Rejects if the browser refuses. */
export async function savePlans(...list) {
  for (const p of list) all[p.id] = p;
  if (backend === 'local') return writeLocal();
  await tx('readwrite', (s) => { for (const p of list) s.put(p); });
}

export async function deletePlan(id) {
  delete all[id];
  if (backend === 'local') return writeLocal();
  await tx('readwrite', (s) => s.delete(id));
}

export const storageKind = () => backend;
