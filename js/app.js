import { RESOURCES, RES_LABEL, CAT_COLORS, GAME_SOURCE } from './data.js';
import {
  catalog, bColor, abbr, saveBuilding, resetBuilding, deleteCustomBuilding, saveTerrain,
  deleteCustomTerrain, exportCatalog, importCatalog, resetCatalog, isDefaultBuilding,
  getProfile, profileActive, setProfile, setProfileEnabled, clearProfile,
} from './catalog.js';
import { analyze, effRadius, waterRange, needsRoad } from './analyze.js';
import { icons, loadIcons, iconURL, exportPack, importPack, removeImportedPack, connVariant, RIVER, RIVER_TREES, RAILS } from './icons.js';
import { readGrid, gridBounds, gridToPlan } from './gamemap.js';
import { loadPlans, savePlans, deletePlan } from './store.js';

// =====================================================================
// Persistence
// =====================================================================
const LS = { cur: 'pat.current.v1', settings: 'pat.settings.v1', views: 'pat.views.v1' };
const MAX_SIDE = 1000; // largest plan width/height
const DEFAULT_SETTINGS = {
  level: 0, hideLocked: false, showGrid: true, showLabels: true, showFields: true, checkRoads: true,
  upgrades: { bigFarms: false, farmImplements: false, advSaw: false, roadless: false, farmWatering: false },
  palKind: 'building', collapsed: {}, useIcons: true,
};
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let settings = { ...DEFAULT_SETTINGS, ...readJSON(LS.settings, {}) };
settings.upgrades = { ...DEFAULT_SETTINGS.upgrades, ...(settings.upgrades || {}) };
const saveSettings = () => localStorage.setItem(LS.settings, JSON.stringify(settings));

const plans = await loadPlans(); // id -> encoded plan (IndexedDB, see store.js)
const storePlans = (...list) => savePlans(...list).catch((e) => { console.error('Saving plans failed', e); toast('Could not save — storage full?'); });
const uid = () => Math.random().toString(36).slice(2, 10);

function encodePlan(p) {
  const t = []; let prev = null, run = 0;
  for (const id of p.terrain) { if (id === prev) run++; else { if (prev !== null) t.push(prev, run); prev = id; run = 1; } }
  if (prev !== null) t.push(prev, run);
  const b = []; p.bld.forEach((id, i) => { if (id) b.push([i, id]); });
  const pv = []; p.pave.forEach((v, i) => { if (v) pv.push(i); });
  const rx = []; p.rail.forEach((v, i) => { if (v) rx.push(i); });
  const fl = []; p.forest.forEach((v, i) => { if (v) fl.push([i, v]); });
  const tl = []; p.town.forEach((v, i) => { if (v) tl.push([i, v]); });
  const tf = []; p.tflag.forEach((v, i) => { if (v) tf.push([i, v]); });
  return { id: p.id, name: p.name, w: p.w, h: p.h, t, b, p: pv, x: rx, f: fl, tl, tf, updated: Date.now(), view: p.view };
}
function decodePlan(e) {
  const n = e.w * e.h;
  const terrain = new Array(n); let k = 0;
  for (let j = 0; j < e.t.length; j += 2) for (let r = 0; r < e.t[j + 1]; r++) terrain[k++] = e.t[j];
  while (k < n) terrain[k++] = 'grass';
  const bld = new Array(n).fill(null); for (const [i, id] of e.b || []) if (i < n) bld[i] = id;
  const pave = new Array(n).fill(0); for (const i of e.p || []) if (i < n) pave[i] = 1;
  const rail = new Array(n).fill(0); for (const i of e.x || []) if (i < n) rail[i] = 1;
  const forest = new Array(n).fill(0); for (const [i, v] of e.f || []) if (i < n) forest[i] = v;
  const town = new Array(n).fill(0); for (const [i, v] of e.tl || []) if (i < n) town[i] = v;
  const tflag = new Array(n).fill(0); for (const [i, v] of e.tf || []) if (i < n) tflag[i] = v;
  return { id: e.id, name: e.name, w: e.w, h: e.h, terrain, bld, pave, rail, forest, town, tflag, view: readJSON(LS.views, {})[e.id] || e.view };
}
function makePlan(name, w, h, fill = 'grass', withMain = true) {
  const n = w * h;
  const p = { id: uid(), name, w, h, terrain: new Array(n).fill(fill), bld: new Array(n).fill(null), pave: new Array(n).fill(0), rail: new Array(n).fill(0),
    forest: new Array(n).fill(0), town: new Array(n).fill(0), tflag: new Array(n).fill(0) };
  if (withMain) p.terrain[((h / 2) | 0) * w + ((w / 2) | 0)] = 'mainsettlement';
  return p;
}

let plan;
function loadInitial() {
  const curId = localStorage.getItem(LS.cur);
  if (curId && plans[curId]) plan = decodePlan(plans[curId]);
  else if (Object.keys(plans).length) plan = decodePlan(Object.values(plans).sort((a, b) => b.updated - a.updated)[0]);
  else plan = makePlan('My base', 25, 25); // saved after the first fit()
}
let saveTimer = 0;
function persistPlan(now = false) {
  clearTimeout(saveTimer);
  const go = () => {
    plan.view = { scale: view.scale, ox: view.ox, oy: view.oy };
    storePlans(encodePlan(plan));
    try { localStorage.setItem(LS.cur, plan.id); } catch {}
  };
  if (now) go(); else saveTimer = setTimeout(go, 400);
  saveView();
}
// Zooming and panning only change the view: keep that in a small localStorage entry instead of
// re-saving the whole plan, which takes a noticeable moment on big maps.
let viewTimer = 0;
function saveView() {
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    plan.view = { scale: view.scale, ox: view.ox, oy: view.oy };
    const all = readJSON(LS.views, {}); all[plan.id] = plan.view;
    try { localStorage.setItem(LS.views, JSON.stringify(all)); localStorage.setItem(LS.cur, plan.id); } catch {}
  }, 400);
}

// =====================================================================
// State
// =====================================================================
const view = { scale: 24, ox: 0, oy: 0 };
let tool = 'build';
let rectMode = false;
let selTerrain = 'grass';
let selBuilding = 'farm';
let selCell = -1;       // inspected cell
let hoverCell = -1;
let result = null;      // analysis
let undoStack = [], redoStack = [];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const canvas = $('#canvas'), ctx = canvas.getContext('2d');
const stage = $('#stage');
const isMobile = () => matchMedia('(max-width: 899px)').matches;

// With account values on, upgrade effects already in those numbers are switched off so they aren't counted
// twice, and the remaining toggles come from the upgrades the account owns.
function analysisSettings() {
  if (!profileActive()) return settings;
  const p = getProfile(), up = { ...settings.upgrades, ...(p.upgrades || {}) };
  for (const k of p.baked || []) up[k] = false;
  return { ...settings, upgrades: up, pollution: p.pollution, power: p.power };
}
function reanalyze() { result = analyze(plan, analysisSettings()); }
// On big plans a full re-check on every pointer move makes painting stutter; it runs once when the stroke ends instead.
const liveAnalysis = () => plan.w * plan.h <= 200 * 200;

// =====================================================================
// Editing + history
// =====================================================================
let stroke = null; // { changes: Map(key -> {i, layer, before, after}) }
function beginStroke() { stroke = { changes: new Map() }; }
function setCell(i, layer, val) {
  const arr = plan[layer];
  if (arr[i] === val) return false;
  const key = layer + i;
  if (stroke) {
    const ex = stroke.changes.get(key);
    if (ex) ex.after = val; else stroke.changes.set(key, { i, layer, before: arr[i], after: val });
  }
  arr[i] = val;
  ovSet(i);
  return true;
}
// Removing the road of a level crossing leaves the rails behind.
function removeBuilding(i) {
  if (plan.rail[i]) { setCell(i, 'bld', 'rail'); setCell(i, 'rail', 0); } else setCell(i, 'bld', null);
}
function endStroke() {
  if (!stroke) return;
  const ch = [...stroke.changes.values()].filter(c => c.before !== c.after);
  stroke = null;
  if (!ch.length) return;
  undoStack.push(ch); if (undoStack.length > 300) undoStack.shift();
  redoStack = [];
  changed();
}
function cancelStroke() {
  if (!stroke) return;
  for (const c of stroke.changes.values()) plan[c.layer][c.i] = c.before;
  stroke = null; invalidateOverview(); changed(false);
}
function undo() {
  const ch = undoStack.pop(); if (!ch) return;
  for (const c of ch) plan[c.layer][c.i] = c.before;
  redoStack.push(ch); invalidateOverview(); changed();
}
function redo() {
  const ch = redoStack.pop(); if (!ch) return;
  for (const c of ch) plan[c.layer][c.i] = c.after;
  undoStack.push(ch); invalidateOverview(); changed();
}
function changed(save = true) {
  reanalyze();
  if (save) persistPlan();
  updateChrome();
  renderStats(); renderInfo();
  draw();
}

function applyTool(i, mode) {
  if (i < 0) return;
  // New terrain drops the imported forest / town level of the tile (painted Forest counts as level 1).
  if (tool === 'terrain') { if (setCell(i, 'terrain', selTerrain)) { setCell(i, 'forest', 0); setCell(i, 'town', 0); setCell(i, 'tflag', 0); } }
  else if (tool === 'build') {
    const b = catalog.bMap.get(selBuilding);
    const cur = catalog.bMap.get(plan.bld[i]);
    if (b?.isPavement) setCell(i, 'pave', 1);
    // Rails and a road can share a tile (a level crossing): the road stays in `bld`, the rails go in the `rail` layer.
    else if (b?.isRail && cur?.isRoad) setCell(i, 'rail', 1);
    else {
      const crossing = b?.isRoad && (cur?.isRail || (cur?.isRoad && plan.rail[i]));
      setCell(i, 'bld', selBuilding); setCell(i, 'rail', crossing ? 1 : 0);
    }
  } else if (tool === 'erase') { setCell(i, 'bld', null); setCell(i, 'pave', 0); setCell(i, 'rail', 0); }
  else if (tool === 'pave') setCell(i, 'pave', mode);
}

// =====================================================================
// View / rendering
// =====================================================================
let dpr = 1;
let needFit = false; // fit once the stage has a real size (first load / new plan)
function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const r = stage.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  if (needFit && r.width > 50 && r.height > 50) { needFit = false; fit(); return; }
  draw();
}
function fit() {
  const r = stage.getBoundingClientRect();
  if (r.width < 50 || r.height < 50) { needFit = true; return; }
  const pad = 16;
  const availH = r.height - (isMobile() && !panel.classList.contains('closed') ? r.height * 0.58 : 0);
  view.scale = Math.max(4, Math.min(64, Math.min((r.width - pad * 2) / plan.w, (Math.max(availH, 120) - pad * 2) / plan.h)));
  view.ox = (r.width - plan.w * view.scale) / 2;
  view.oy = (Math.max(availH, 120) - plan.h * view.scale) / 2;
  draw(); saveView();
}
const cellAt = (sx, sy) => {
  const x = Math.floor((sx - view.ox) / view.scale), y = Math.floor((sy - view.oy) / view.scale);
  return (x < 0 || y < 0 || x >= plan.w || y >= plan.h) ? -1 : y * plan.w + x;
};
function zoomAt(sx, sy, factor) {
  const ns = Math.max(3, Math.min(120, view.scale * factor));
  const f = ns / view.scale;
  view.ox = sx - (sx - view.ox) * f; view.oy = sy - (sy - view.oy) * f; view.scale = ns;
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

let rectPreview = null; // {a, b} cell indices
let raf = 0;

// Zoomed-out overview: the whole plan as one picture, one pixel per tile (terrain, pavement, building colour),
// scaled up in a single drawImage. Drawing every tile and building separately is far too slow on big maps.
const OVERVIEW_BELOW = 8; // px per tile; icons and decorations only start at 8 anyway
let ov = null; // { plan, canvas, img, dirty }
const rgbCache = new Map();
function rgbOf(col) {
  let v = rgbCache.get(col);
  if (!v) {
    const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#000'; c.fillStyle = col;
    const n = parseInt(c.fillStyle.slice(1), 16) || 0; // canvas normalises any colour to #rrggbb
    v = [n >> 16, (n >> 8) & 255, n & 255]; rgbCache.set(col, v);
  }
  return v;
}
function ovPixel(i) {
  const b = plan.bld[i] ? catalog.bMap.get(plan.bld[i]) : null;
  if (b) return rgbOf(b.isRail ? '#5a3e2b' : b.isRoad ? (b.color || '#8a8a8a') : bColor(b));
  if (plan.pave[i]) return rgbOf('#cdcdc8');
  return rgbOf(catalog.tMap.get(plan.terrain[i])?.color || '#ff00ff');
}
function ovSet(i) {
  if (ov?.plan !== plan) return;
  const [r, g, b] = ovPixel(i), d = ov.img.data, k = i * 4;
  d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; ov.dirty = true;
}
function overview() {
  if (ov?.plan !== plan) {
    const c = document.createElement('canvas'); c.width = plan.w; c.height = plan.h;
    ov = { plan, canvas: c, img: c.getContext('2d').createImageData(plan.w, plan.h), dirty: true };
    for (let i = 0, n = plan.w * plan.h; i < n; i++) ovSet(i);
  }
  if (ov.dirty) { ov.canvas.getContext('2d').putImageData(ov.img, 0, 0); ov.dirty = false; }
  return ov.canvas;
}
const invalidateOverview = () => { ov = null; };
function draw() { if (!raf) raf = requestAnimationFrame(drawNow); }
function drawNow() {
  raf = 0;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0f1113'; ctx.fillRect(0, 0, W, H);
  if (!plan) return;
  const s = view.scale, { w, h, terrain, bld, pave } = plan;
  const x0 = Math.max(0, Math.floor(-view.ox / s)), y0 = Math.max(0, Math.floor(-view.oy / s));
  const x1 = Math.min(w - 1, Math.floor((W - view.ox) / s)), y1 = Math.min(h - 1, Math.floor((H - view.oy) / s));
  const px = (x) => view.ox + x * s, py = (y) => view.oy + y * s;

  // map shadow
  ctx.fillStyle = '#000'; ctx.fillRect(view.ox - 2, view.oy - 2, w * s + 4, h * s + 4);

  const far = s < OVERVIEW_BELOW;
  if (far) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overview(), view.ox, view.oy, w * s, h * s);
    ctx.imageSmoothingEnabled = true;
  }
  if (!far) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x, t = catalog.tMap.get(terrain[i]);
    const X = px(x), Y = py(y);
    const col = t?.color || '#ff00ff';
    ctx.fillStyle = col; ctx.fillRect(X, Y, s + 0.5, s + 0.5);
    const tIcon = s >= 8 && settings.useIcons ? (terrain[i] === 'river' && riverSprite(x, y)) || icons.t.get(terrain[i]) : null;
    if (tIcon) drawTile(tIcon, X, Y, s);
    else if (s >= 10 && t) drawTerrainDecor(t, X, Y, s, x, y);
    if (settings.showFields && result?.fieldOwner.has(i)) {
      ctx.strokeStyle = 'rgba(240,210,90,.75)'; ctx.lineWidth = Math.max(1, s / 14);
      ctx.beginPath();
      for (let k = 1; k <= 3; k++) { ctx.moveTo(X + s * 0.15, Y + (s * k) / 4); ctx.lineTo(X + s * 0.85, Y + (s * k) / 4); }
      ctx.stroke();
    }
    if (pave[i]) {
      ctx.fillStyle = 'rgba(205,205,200,.85)'; ctx.fillRect(X + s * .04, Y + s * .04, s * .92, s * .92);
      if (s >= 10) { ctx.strokeStyle = 'rgba(120,120,115,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + s / 2, Y + s * .04); ctx.lineTo(X + s / 2, Y + s * .96); ctx.moveTo(X + s * .04, Y + s / 2); ctx.lineTo(X + s * .96, Y + s / 2); ctx.stroke(); }
    }
  }
  if (settings.showGrid && s >= 9) {
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) { const X = Math.round(px(x)) + .5; ctx.moveTo(X, py(y0)); ctx.lineTo(X, py(y1 + 1)); }
    for (let y = y0; y <= y1 + 1; y++) { const Y = Math.round(py(y)) + .5; ctx.moveTo(px(x0), Y); ctx.lineTo(px(x1 + 1), Y); }
    ctx.stroke();
  }
  // buildings
  if (!far) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (!bld[i]) continue;
    const b = catalog.bMap.get(bld[i]);
    drawBuilding(b, i, x, y, px(x), py(y), s, 1);
  }
  // issue markers
  if (result && !far) for (const [i, c] of result.cells) {
    if (!c.issues.length) continue;
    const x = i % w, y = (i / w) | 0; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const worst = c.issues.some(q => q.lvl === 'bad') ? 'bad' : c.issues.some(q => q.lvl === 'warn') ? 'warn' : null;
    if (!worst) continue;
    const X = px(x), Y = py(y);
    ctx.strokeStyle = worst === 'bad' ? '#ff4b3e' : '#ffb02e'; ctx.lineWidth = Math.max(1.5, s / 12);
    if (worst === 'bad') ctx.strokeRect(X + 1, Y + 1, s - 2, s - 2);
    else { ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(X + s * .82, Y + s * .18, Math.max(2, s * .12), 0, 7); ctx.fill(); }
  }
  // radius overlays: selected building, and ghost under cursor
  const ghost = ghostInfo();
  if (selCell >= 0 && bld[selCell]) drawRadius(selCell, catalog.bMap.get(bld[selCell]), 'rgba(240,166,48,');
  if (ghost) {
    const gx = ghost.i % w, gy = (ghost.i / w) | 0;
    if (ghost.b) { ctx.globalAlpha = .6; drawBuilding(ghost.b, ghost.i, gx, gy, px(gx), py(gy), s, 1, true); ctx.globalAlpha = 1; drawRadius(ghost.i, ghost.b, 'rgba(120,200,255,'); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(px(gx) + 1, py(gy) + 1, s - 2, s - 2);
  }
  if (selCell >= 0) {
    const x = selCell % w, y = (selCell / w) | 0;
    ctx.strokeStyle = '#f0a630'; ctx.lineWidth = 2.5; ctx.strokeRect(px(x) + 1, py(y) + 1, s - 2, s - 2);
  }
  if (rectPreview) {
    const ax = rectPreview.a % w, ay = (rectPreview.a / w) | 0, bx = rectPreview.b % w, by = (rectPreview.b / w) | 0;
    const lx = Math.min(ax, bx), ly = Math.min(ay, by), hx = Math.max(ax, bx), hy = Math.max(ay, by);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(px(lx), py(ly), (hx - lx + 1) * s, (hy - ly + 1) * s);
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(px(lx), py(ly), (hx - lx + 1) * s, (hy - ly + 1) * s); ctx.setLineDash([]);
    hud(`${hx - lx + 1} × ${hy - ly + 1}  (${(hx - lx + 1) * (hy - ly + 1)} tiles)`);
  }
}

function drawTerrainDecor(t, X, Y, s, x, y) {
  const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  if (t.forest) {
    ctx.fillStyle = shade(t.color, -0.12);
    for (let k = 0; k < 3; k++) {
      const cx = X + s * (0.25 + 0.25 * k) + ((hash >> k) & 3) - 1.5, cy = Y + s * (k === 1 ? 0.38 : 0.62);
      ctx.beginPath(); ctx.moveTo(cx, cy - s * .2); ctx.lineTo(cx - s * .13, cy + s * .14); ctx.lineTo(cx + s * .13, cy + s * .14); ctx.fill();
    }
  } else if (t.id === 'hill' || t.id === 'mountain') {
    ctx.fillStyle = shade(t.color, t.id === 'mountain' ? -0.15 : -0.08);
    ctx.beginPath(); ctx.moveTo(X + s * .15, Y + s * .8); ctx.lineTo(X + s * .5, Y + s * (t.id === 'mountain' ? .15 : .35)); ctx.lineTo(X + s * .85, Y + s * .8); ctx.fill();
    if (t.id === 'mountain') { ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(X + s * .4, Y + s * .3); ctx.lineTo(X + s * .5, Y + s * .15); ctx.lineTo(X + s * .6, Y + s * .3); ctx.fill(); }
  } else if (t.group === 'resource') {
    ctx.fillStyle = shade(t.color, 0.25);
    ctx.beginPath(); ctx.moveTo(X + s / 2, Y + s * .25); ctx.lineTo(X + s * .75, Y + s / 2); ctx.lineTo(X + s / 2, Y + s * .75); ctx.lineTo(X + s * .25, Y + s / 2); ctx.fill();
  } else if (t.water && s >= 14) {
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath();
    const yy = Y + s * (0.35 + ((hash & 7) / 30));
    ctx.moveTo(X + s * .2, yy); ctx.quadraticCurveTo(X + s * .35, yy - s * .08, X + s * .5, yy); ctx.quadraticCurveTo(X + s * .65, yy + s * .08, X + s * .8, yy); ctx.stroke();
  } else if (t.settlement || t.id === 'bunker') {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    const bw = s * .18;
    ctx.fillRect(X + s * .2, Y + s * .45, bw, s * .35); ctx.fillRect(X + s * .42, Y + s * .25, bw, s * .55); ctx.fillRect(X + s * .64, Y + s * .38, bw, s * .42);
  }
}

function roadLike(b) { return b && (b.isRoad); }
// Like the game, a building that needs a road hooks up to just one adjacent road: here the first of below, left, right, above.
const ROAD_SIDES = [[0, 1], [-1, 0], [1, 0], [0, -1]];
function buildingRoadCell(j) {
  const { w, h, bld } = plan, x = j % w, y = (j / w) | 0;
  for (const [dx, dy] of ROAD_SIDES) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && roadLike(catalog.bMap.get(bld[ny * w + nx]))) return ny * w + nx;
  }
  return -1;
}
// Game road sprite for the road at (x, y), or null when no icons are loaded for that road type.
function roadSprite(b, i, x, y) {
  const set = icons.r.get(b.id); if (!set) return null;
  const { w, h, bld, terrain } = plan, st = analysisSettings();
  const conn = (nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
    const j = ny * w + nx, nb = catalog.bMap.get(bld[j]);
    if (roadLike(nb) || catalog.tMap.get(terrain[j])?.settlement) return true;
    return needsRoad(nb, terrain[j], st) && buildingRoadCell(j) === i;
  };
  return set.get(connVariant(conn(x, y - 1), conn(x, y + 1), conn(x - 1, y), conn(x + 1, y))) || set.get('11') || set.get('12') || null;
}
// River tiles turn toward neighbouring river or open water, like the game's RotateRiversAuto.
function riverSprite(x, y, kind = RIVER) {
  const set = icons.r.get(kind); if (!set) return null;
  const { w, h, terrain } = plan;
  const wet = (nx, ny) => nx >= 0 && ny >= 0 && nx < w && ny < h && !!catalog.tMap.get(terrain[ny * w + nx])?.water;
  let up = wet(x, y - 1), down = wet(x, y + 1), left = wet(x - 1, y), right = wet(x + 1, y);
  // Plans are often cut out of a bigger map: a river running into the edge keeps going off-map.
  if (y === 0 && down) up = true; if (y === h - 1 && up) down = true;
  if (x === 0 && right) left = true; if (x === w - 1 && left) right = true;
  return set.get(connVariant(up, down, left, right, true)) || null;
}
// Tile sprites are drawn tile-wide and bottom-aligned; taller ones (trees on river banks) stick out above the tile.
function drawTile(c, X, Y, s) {
  const th = s * c.height / c.width;
  ctx.drawImage(c, X, Y + s - th, s + 0.5, th + 0.5);
}
// Micro / Citrhodium Cleaners turn the river tile itself into a tree-lined river that follows the river's course.
const RIVER_TREE_BUILDINGS = new Set(['microcleaner', 'citrhodiumcleaner']);
function drawBuilding(b, i, x, y, X, Y, s, alpha, ghost = false) {
  drawBuildingBody(b, i, x, y, X, Y, s, alpha, ghost);
  if (b?.isRoad && !ghost && plan.rail[i]) drawRails(x, y, X, Y, s); // level crossing: rails over the road
}
// Rails join neighbouring rails (rail tiles or other crossings): the game's rail sprite when icons are loaded,
// else a brown track.
function drawRails(x, y, X, Y, s, ghost = false) {
  const { w, h, bld } = plan;
  const conn = (nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
    const j = ny * w + nx;
    return !!catalog.bMap.get(bld[j])?.isRail || !!plan.rail[j];
  };
  const sprite = !ghost && s >= 8 && settings.useIcons ? railSprite(x, y, conn) : null;
  if (sprite) { drawTile(sprite, X, Y, s); return; }
  const rw = s * 0.22, o = (s - rw) / 2;
  ctx.fillStyle = '#5a3e2b';
  ctx.fillRect(X + o, Y + o, rw, rw);
  if (conn(x - 1, y) || ghost) ctx.fillRect(X, Y + o, o + 1, rw);
  if (conn(x + 1, y) || ghost) ctx.fillRect(X + o + rw - 1, Y + o, o + 1, rw);
  if (conn(x, y - 1)) ctx.fillRect(X + o, Y, rw, o + 1);
  if (conn(x, y + 1)) ctx.fillRect(X + o, Y + o + rw - 1, rw, o + 1);
  if (s >= 12) { ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1; ctx.strokeRect(X + o + 1, Y + o + 1, rw - 2, rw - 2); }
}
// Which rail sprite the game draws (AutoRotateRails): across a road the rails run straight over it
// (11_b_road / 12_b), on a river they bridge it, on the sea they use the _b pieces; elsewhere they turn like roads
// and have end pieces, and a lone rail uses piece 4.
function railSprite(x, y, conn) {
  const set = icons.r.get(RAILS); if (!set) return null;
  const i = y * plan.w + x, t = plan.terrain[i];
  const up = conn(x, y - 1), down = conn(x, y + 1), left = conn(x - 1, y), right = conn(x + 1, y);
  const horiz = (left || right) && !(up || down) ? true : (up || down) && !(left || right) ? false : null;
  if (plan.rail[i]) { // level crossing: rails cross the road
    const road = (nx, ny) => nx >= 0 && ny >= 0 && nx < plan.w && ny < plan.h && roadLike(catalog.bMap.get(plan.bld[ny * plan.w + nx]));
    const h = horiz ?? !(road(x - 1, y) || road(x + 1, y));
    return set.get(h ? '11_b_road' : '12_b') || set.get(h ? '11' : '12');
  }
  if (t === 'river') return set.get(horiz === false ? '12_b' : '11_b');
  const v = connVariant(up, down, left, right, true);
  if (catalog.tMap.get(t)?.water) {
    const wv = v === '22' || v === '88' ? '12' : v === '44' || v === '66' || v === '13' ? '11' : v;
    return set.get(wv + '_b') || set.get(wv);
  }
  return set.get(v === '13' ? '4' : v) || set.get('4');
}
function drawBuildingBody(b, i, x, y, X, Y, s, alpha, ghost) {
  if (!b) { ctx.fillStyle = '#f0f'; ctx.fillRect(X + s * .2, Y + s * .2, s * .6, s * .6); return; }
  const col = bColor(b);
  const { w, h, bld, terrain } = plan;
  const rIcon = b.isRoad && s >= 8 && settings.useIcons ? roadSprite(b, i, x, y) : null;
  if (rIcon) { drawTile(rIcon, X, Y, s); return; }
  const treeRiver = RIVER_TREE_BUILDINGS.has(b.id) && s >= 8 && settings.useIcons && plan.terrain[i] === 'river' ? riverSprite(x, y, RIVER_TREES) : null;
  if (treeRiver) {
    drawTile(treeRiver, X, Y, s);
    if (b.id === 'microcleaner') return; // the tree-lined river is the whole picture; Citrhodium adds its cleaner on top
  }
  if (b.isRail) { drawRails(x, y, X, Y, s, ghost); return; }
  if (b.isRoad) {
    const conn = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
      const j = ny * w + nx;
      return roadLike(catalog.bMap.get(bld[j])) || catalog.tMap.get(terrain[j])?.settlement;
    };
    const rw = s * 0.42, o = (s - rw) / 2;
    ctx.fillStyle = b.color || '#8a8a8a';
    ctx.fillRect(X + o, Y + o, rw, rw);
    if (conn(x - 1, y) || ghost) ctx.fillRect(X, Y + o, o + 1, rw);
    if (conn(x + 1, y) || ghost) ctx.fillRect(X + o + rw - 1, Y + o, o + 1, rw);
    if (conn(x, y - 1)) ctx.fillRect(X + o, Y, rw, o + 1);
    if (conn(x, y + 1)) ctx.fillRect(X + o, Y + o + rw - 1, rw, o + 1);
    return;
  }
  const bIcon = s >= 8 && settings.useIcons ? icons.b.get(b.id) : null;
  if (bIcon) {
    ctx.drawImage(bIcon, X, Y, s, s);
    if (b.premium && s >= 14) { ctx.fillStyle = '#c86fe0'; ctx.beginPath(); ctx.arc(X + s * .85, Y + s * .85, s * .08, 0, 7); ctx.fill(); }
    return;
  }
  if (b.cat === 'Trees') {
    const tc = b.color || (b.id === 'sakura' ? '#e9a1c0' : b.id === 'winterforest' ? '#d8eef2' : b.id === 'palmtree' ? '#5fae3d' : '#1f7a2c');
    ctx.fillStyle = shade(tc, -0.15); ctx.beginPath(); ctx.arc(X + s * .35, Y + s * .6, s * .22, 0, 7); ctx.fill();
    ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(X + s * .62, Y + s * .55, s * .24, 0, 7); ctx.fill();
    ctx.fillStyle = shade(tc, 0.12); ctx.beginPath(); ctx.arc(X + s * .48, Y + s * .35, s * .22, 0, 7); ctx.fill();
    return;
  }
  const m = s * 0.1, r = Math.max(2, s * 0.16);
  ctx.fillStyle = col;
  roundRect(X + m, Y + m, s - 2 * m, s - 2 * m, r); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1, s / 22); ctx.stroke();
  if (b.premium && s >= 14) { ctx.fillStyle = '#c86fe0'; ctx.beginPath(); ctx.arc(X + s * .78, Y + s * .78, s * .09, 0, 7); ctx.fill(); }
  if (settings.showLabels && s >= 15) {
    const t = abbr(b);
    ctx.fillStyle = lum(col) > 0.55 ? '#111' : '#f4f4f4';
    ctx.font = `700 ${Math.max(8, Math.min(s * 0.36, 18 - t.length * 0.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, X + s / 2, Y + s / 2 + 0.5);
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawRadius(i, b, rgba) {
  if (!b) return;
  let r = effRadius(b, analysisSettings());
  if (!r && b.rules?.includes('nearWater2')) r = waterRange(b, analysisSettings());
  if (!r && b.rules?.includes('needFoundry3')) r = 3;
  if (!r) return;
  const { w, h } = plan, s = view.scale;
  const x = i % w, y = (i / w) | 0;
  const lx = Math.max(0, x - r), ly = Math.max(0, y - r), hx = Math.min(w - 1, x + r), hy = Math.min(h - 1, y + r);
  const X = view.ox + lx * s, Y = view.oy + ly * s, W = (hx - lx + 1) * s, H = (hy - ly + 1) * s;
  ctx.fillStyle = rgba + '.13)'; ctx.fillRect(X, Y, W, H);
  ctx.strokeStyle = rgba + '.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(X + 1, Y + 1, W - 2, H - 2); ctx.setLineDash([]);
}
function ghostInfo() {
  if (hoverCell < 0 || isTouch || tool === 'pan' || tool === 'inspect' || rectPreview || pointers.size) return null;
  if (tool === 'build') { const b = catalog.bMap.get(selBuilding); return { i: hoverCell, b: b?.isPavement ? null : b }; }
  return { i: hoverCell, b: null };
}

let hudTimer = 0;
function hud(text) { $('#hud').textContent = text; }
function hoverHud(i) {
  if (i < 0) { hud(''); return; }
  const x = i % plan.w, y = (i / plan.w) | 0;
  const t = catalog.tMap.get(plan.terrain[i]);
  const b = plan.bld[i] ? catalog.bMap.get(plan.bld[i]) : null;
  hud(`(${x}, ${y})  ${t?.name || plan.terrain[i]}${plan.pave[i] ? ' + pavement' : ''}${b ? '\n' + b.name : ''}${plan.rail[i] ? ' + Rails' : ''}`);
}
function toast(msg, ms = 2200) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(hudTimer); hudTimer = setTimeout(() => (el.hidden = true), ms);
}

// =====================================================================
// Input
// =====================================================================
const pointers = new Map();
let isTouch = false;
let gesture = null; // {type:'pan'|'paint'|'rect'|'pinch'|'tap', ...}
let spaceDown = false;

function localXY(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  isTouch = e.pointerType === 'touch';
  const [x, y] = localXY(e);
  pointers.set(e.pointerId, { x, y });
  if (pointers.size === 2) {
    // second finger: switch to pinch, undo any stroke in progress
    cancelStroke(); rectPreview = null;
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  const i = cellAt(x, y);
  const panBtn = e.button === 1 || e.button === 2 || spaceDown;
  if (tool === 'pan' || panBtn) { gesture = { type: 'pan', x, y, sx: x, sy: y, moved: false, tap: !panBtn }; return; }
  if (tool === 'inspect') { gesture = { type: 'tap', x, y, sx: x, sy: y, moved: false }; return; }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (rectMode) { if (i < 0) return; gesture = { type: 'rect', a: i }; rectPreview = { a: i, b: i }; draw(); return; }
  // paint stroke (on touch, wait briefly so a 2-finger pinch doesn't paint)
  let mode = 1;
  if (tool === 'pave' && i >= 0) mode = plan.pave[i] ? 0 : 1;
  gesture = { type: 'paint', last: i, mode, sx: x, sy: y };
  beginStroke();
  if (i >= 0) { applyTool(i, mode); if (liveAnalysis()) reanalyze(); draw(); }
});

stage.addEventListener('pointermove', (e) => {
  const [x, y] = localXY(e);
  if (!pointers.has(e.pointerId)) {
    if (e.pointerType === 'mouse') { const i = cellAt(x, y); if (i !== hoverCell) { hoverCell = i; hoverHud(i); draw(); } }
    return;
  }
  pointers.set(e.pointerId, { x, y });
  if (!gesture) return;
  if (gesture.type === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    view.ox += cx - gesture.cx; view.oy += cy - gesture.cy;
    if (gesture.d > 0) zoomAt(cx, cy, d / gesture.d);
    gesture.d = d; gesture.cx = cx; gesture.cy = cy;
    draw(); return;
  }
  if (gesture.type === 'pan') {
    view.ox += x - gesture.x; view.oy += y - gesture.y; gesture.x = x; gesture.y = y;
    if (Math.hypot(x - gesture.sx, y - gesture.sy) > 6) gesture.moved = true;
    draw(); return;
  }
  if (gesture.type === 'tap') { if (Math.hypot(x - gesture.sx, y - gesture.sy) > 8) { gesture = { type: 'pan', x, y, sx: x, sy: y, moved: true }; } return; }
  const i = cellAt(x, y);
  if (e.pointerType === 'mouse' && i !== hoverCell) { hoverCell = i; hoverHud(i); }
  if (gesture.type === 'rect') { if (i >= 0) { rectPreview.b = i; draw(); } return; }
  if (gesture.type === 'paint') {
    if (i === gesture.last) return;
    // fill the line between cells so fast drags don't skip
    const pts = lineCells(gesture.last, i, gesture.sx, gesture.sy, x, y);
    for (const c of pts) applyTool(c, gesture.mode);
    gesture.last = i; gesture.sx = x; gesture.sy = y;
    if (liveAnalysis()) reanalyze(); draw();
  }
});

function lineCells(a, b, sx, sy, ex, ey) {
  if (b < 0) return [];
  if (a < 0) return [b];
  const w = plan.w; let x0 = a % w, y0 = (a / w) | 0; const x1 = b % w, y1 = (b / w) | 0;
  const out = []; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sxn = x0 < x1 ? 1 : -1, syn = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    out.push(y0 * w + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sxn; }
    if (e2 <= dx) { err += dx; y0 += syn; }
  }
  return out;
}

function pointerEnd(e) {
  if (!pointers.has(e.pointerId)) return;
  const [x, y] = localXY(e);
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.type === 'pinch') { if (pointers.size === 0) { gesture = null; saveView(); } return; }
  if (gesture.type === 'pan') { if (gesture.tap && !gesture.moved) inspectCell(cellAt(x, y)); gesture = null; saveView(); return; }
  if (gesture.type === 'tap') { inspectCell(cellAt(x, y)); gesture = null; return; }
  if (gesture.type === 'rect') {
    const { a, b } = rectPreview; rectPreview = null; hud('');
    const w = plan.w, lx = Math.min(a % w, b % w), hx = Math.max(a % w, b % w), ly = Math.min((a / w) | 0, (b / w) | 0), hy = Math.max((a / w) | 0, (b / w) | 0);
    const mode = tool === 'pave' ? (plan.pave[a] ? 0 : 1) : 1;
    beginStroke();
    for (let yy = ly; yy <= hy; yy++) for (let xx = lx; xx <= hx; xx++) applyTool(yy * w + xx, mode);
    endStroke(); gesture = null; return;
  }
  if (gesture.type === 'paint') { endStroke(); gesture = null; }
}
stage.addEventListener('pointerup', pointerEnd);
stage.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (gesture?.type === 'paint') cancelStroke(); gesture = null; rectPreview = null; draw(); });
stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pointers.size) { hoverCell = -1; hoverHud(-1); draw(); } });
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [x, y] = localXY(e);
  if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  else { view.ox -= e.deltaX; }
  draw(); saveView();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
  const map = { h: 'pan', b: 'build', t: 'terrain', p: 'pave', e: 'erase', i: 'inspect' };
  if (map[k]) setTool(map[k]);
  else if (k === 'r') toggleRect();
  else if (k === 'f') fit();
  else if (k === 'escape') { selCell = -1; renderInfo(); draw(); }
  else if (k === 'delete' || k === 'backspace') { if (selCell >= 0) { beginStroke(); removeBuilding(selCell); endStroke(); } }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

function inspectCell(i) {
  selCell = i;
  if (i >= 0) { showTab('info'); if (isMobile()) openPanel(); }
  renderInfo(); draw();
}

// =====================================================================
// Toolbar + chrome
// =====================================================================
function setTool(t) {
  tool = t;
  $$('#tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  if (t === 'terrain' && settings.palKind !== 'terrain') { settings.palKind = 'terrain'; renderPalette(); }
  if (t === 'build' && settings.palKind !== 'building') { settings.palKind = 'building'; renderPalette(); }
  updateChrome(); draw();
}
function toggleRect() { rectMode = !rectMode; $('#btnRect').classList.toggle('active', rectMode); toast(rectMode ? 'Rectangle mode: drag to fill an area' : 'Brush mode'); }
$$('#tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('#btnRect').addEventListener('click', toggleRect);
$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);
$('#btnFit').addEventListener('click', fit);
$('#btnCurrent').addEventListener('click', () => {
  const onPalette = !$('#tab-palette').hidden;
  if (isMobile() && !panel.classList.contains('closed') && onPalette) { closePanel(); return; }
  showTab('palette'); openPanel();
});
$('#btnPanel').addEventListener('click', () => panel.classList.contains('closed') ? openPanel() : closePanel());
$('#btnPlans').addEventListener('click', plansDialog);
$('#btnMenu').addEventListener('click', menuDialog);

function updateChrome() {
  $('#planName').textContent = plan.name;
  $('#planSize').textContent = `${plan.w}×${plan.h}`;
  $('#btnUndo').disabled = !undoStack.length;
  $('#btnRedo').disabled = !redoStack.length;
  const sw = $('#curSwatch'), nm = $('#curName');
  const img = settings.useIcons ? (tool === 'terrain' ? iconURL('t', selTerrain) : tool === 'build' ? iconURL('b', selBuilding) : null) : null;
  if (tool === 'terrain') { const t = catalog.tMap.get(selTerrain); sw.style.background = t?.color; sw.textContent = ''; nm.textContent = t?.name || selTerrain; }
  else if (tool === 'build') { const b = catalog.bMap.get(selBuilding); sw.style.background = b ? bColor(b) : '#888'; sw.style.color = b && lum(bColor(b)) > .55 ? '#111' : '#fff'; sw.textContent = b && !img ? abbr(b) : ''; nm.textContent = b?.name || '—'; }
  else if (tool === 'pave') { sw.style.background = '#cdcdc8'; sw.textContent = ''; nm.textContent = 'Pavement'; }
  else if (tool === 'erase') { sw.style.background = '#3a1d1b'; sw.textContent = '⌫'; sw.style.color = '#fff'; nm.textContent = 'Erase'; }
  else { sw.style.background = '#333'; sw.textContent = ''; nm.textContent = tool === 'pan' ? 'Pan (tap = inspect)' : 'Inspect'; }
  sw.style.backgroundImage = img ? `url(${img})` : ''; sw.style.backgroundSize = 'cover';
}

// Panel (sidebar on desktop, bottom sheet on mobile)
const panel = $('#panel');
function openPanel() { panel.classList.remove('closed'); }
function closePanel() { panel.classList.add('closed'); }
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  for (const n of ['palette', 'stats', 'info']) $('#tab-' + n).hidden = n !== name;
}
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
(() => { // drag handle to resize/close sheet
  const hdl = $('#panelHandle'); let sy = null;
  hdl.addEventListener('pointerdown', e => { sy = e.clientY; hdl.setPointerCapture(e.pointerId); });
  hdl.addEventListener('pointerup', e => {
    if (sy === null) return; const dy = e.clientY - sy; sy = null;
    if (dy > 40) { if (panel.classList.contains('tall')) panel.classList.remove('tall'); else closePanel(); }
    else if (dy < -40) panel.classList.add('tall');
    else panel.classList.toggle('tall');
  });
})();

// =====================================================================
// Palette
// =====================================================================
const fmt = (v) => {
  if (typeof v !== 'number') return String(v);
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
};
const sign = (v) => (v > 0 ? '+' : '') + fmt(v);
function bSummary(b) {
  const p = [];
  if (b.power) p.push(`⚡${sign(b.power)}`);
  if (b.poll) p.push(`☁${sign(b.poll)}`);
  if (b.income) p.push(Object.entries(b.income).map(([k, v]) => `${sign(v)} ${RES_LABEL[k] || k}`).join(', '));
  if (b.radius) p.push(`r${b.radius}`);
  if (b.tiles?.length && b.tiles.length <= 3) p.push('on ' + b.tiles.map(t => catalog.tMap.get(t)?.name || t).join('/'));
  return p.join(' · ');
}
function chipHTML(b) {
  const c = bColor(b);
  const url = settings.useIcons ? iconURL('b', b.id) : null;
  if (url) return `<span class="chip img"><img src="${url}" alt=""></span>`;
  if (b.isRoad) return `<span class="chip" style="background:#7fae4c"><span class="in" style="inset:10px 0;border-radius:0;background:${b.color || '#8a8a8a'}"></span></span>`;
  return `<span class="chip" style="background:${c};color:${lum(c) > .55 ? '#111' : '#fff'}">${esc(abbr(b))}</span>`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderPalette() {
  $$('#palKind button').forEach(b => b.classList.toggle('active', b.dataset.kind === settings.palKind));
  $('#palLevel').value = settings.level || '';
  $('#palHideLocked').checked = settings.hideLocked;
  const q = $('#palSearch').value.trim().toLowerCase();
  const list = $('#palList');
  const lvlOn = settings.level > 0;
  $('.pal-filters .lvl').style.display = settings.palKind === 'terrain' ? 'none' : '';
  $('.pal-filters .chk').style.display = settings.palKind === 'terrain' ? 'none' : '';
  if (settings.palKind === 'terrain') {
    const groups = { land: 'Land', resource: 'Resource tiles', water: 'Water', special: 'Special', settlement: 'Settlements' };
    let html = '';
    for (const [g, label] of Object.entries(groups)) {
      const ts = catalog.terrain.filter(t => (t.group || 'land') === g && (!q || t.name.toLowerCase().includes(q)));
      if (!ts.length) continue;
      html += `<div class="pal-group"><h4>${label}</h4><div class="pal-items pal-terrain">` +
        ts.map(t => `<button class="pal-item ${t.id === selTerrain ? 'sel' : ''}" data-t="${esc(t.id)}"><span class="chip ${settings.useIcons && iconURL('t', t.id) ? 'img' : ''}" style="background:${t.color}">${settings.useIcons && iconURL('t', t.id) ? `<img src="${iconURL('t', t.id)}" alt="">` : ''}</span><span class="nm">${esc(t.name)}</span></button>`).join('') +
        `</div></div>`;
    }
    list.innerHTML = html || '<p class="muted">No matches.</p>';
    return;
  }
  let html = '';
  for (const cat of catalog.categories) {
    const bs = catalog.buildings.filter(b => (b.cat || 'Custom') === cat &&
      (!q || b.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) &&
      !(settings.hideLocked && lvlOn && b.lvl > settings.level));
    if (!bs.length) continue;
    const col = settings.collapsed[cat] && !q;
    html += `<div class="pal-group ${col ? 'collapsed' : ''}" data-cat="${esc(cat)}"><h4><span style="width:8px;height:8px;border-radius:2px;background:${CAT_COLORS[cat] || '#ccc'}"></span>${esc(cat)} <span class="muted">(${bs.length})</span></h4><div class="pal-items">` +
      bs.map(b => `<button class="pal-item ${b.id === selBuilding ? 'sel' : ''} ${lvlOn && b.lvl > settings.level ? 'locked' : ''}" data-b="${esc(b.id)}">
        ${chipHTML(b)}<span><div class="nm">${esc(b.name)}${b.premium ? ' <span style="color:#c86fe0">◆</span>' : ''}${b.custom ? ' <span class="muted">(custom)</span>' : b.edited ? ' <span class="muted">(edited)</span>' : ''}</div><div class="sub">${esc(bSummary(b))}</div></span>
        <span class="lv">${b.lvl ? 'Lv ' + b.lvl : ''}</span></button>`).join('') +
      `</div></div>`;
  }
  list.innerHTML = html || '<p class="muted">No matches.</p>';
}
$('#palList').addEventListener('click', (e) => {
  const h = e.target.closest('h4');
  if (h) { const cat = h.parentElement.dataset.cat; if (cat) { settings.collapsed[cat] = !settings.collapsed[cat]; saveSettings(); h.parentElement.classList.toggle('collapsed'); } return; }
  const it = e.target.closest('.pal-item'); if (!it) return;
  if (it.dataset.t) { selTerrain = it.dataset.t; setTool('terrain'); }
  if (it.dataset.b) {
    selBuilding = it.dataset.b;
    const b = catalog.bMap.get(selBuilding);
    setTool(b?.isPavement ? 'pave' : 'build');
  }
  $$('#palList .pal-item').forEach(x => x.classList.toggle('sel', x === it));
  if (isMobile()) closePanel();
});
$$('#palKind button').forEach(b => b.addEventListener('click', () => { settings.palKind = b.dataset.kind; saveSettings(); renderPalette(); }));
$('#palSearch').addEventListener('input', renderPalette);
$('#palLevel').addEventListener('change', (e) => { settings.level = Math.max(0, parseInt(e.target.value) || 0); saveSettings(); renderPalette(); changed(false); });
$('#palHideLocked').addEventListener('change', (e) => { settings.hideLocked = e.target.checked; saveSettings(); renderPalette(); });

// =====================================================================
// Totals tab
// =====================================================================
// Where the pollution total comes from, the way the game adds it up.
function pollRows(T) {
  const P = T.pollParts; if (!P) return '';
  const rows = [['Buildings, roads & rails', P.buildings], ['Forest tiles', P.forest], ['Deep water tiles (−2 each)', P.deep],
    ['Towns', P.towns], ['Farm fields (Stop Burping, Cows)', P.fields]].filter(([, v]) => v);
  const acc = T.pollAccountParts || [];
  const html = (r) => r.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${sign(v)}</td></tr>`).join('');
  return `<h3>Pollution</h3><table class="kv">${html(rows)}
    ${acc.length ? `<tr><td colspan="2" class="muted small">Your account, not on the map:</td></tr>${html(acc)}` : ''}
    <tr><td><b>Total</b></td><td class="n"><b>${sign(T.poll)}</b></td></tr></table>
    ${acc.length ? '' : '<p class="note">The game also adds account-wide amounts (base +100,005, anti-pollution, cleared barrels…). Load your account values (Menu → My account values) to include them.</p>'}`;
}
function powerRows(T) {
  const P = T.powerParts; if (!P) return '';
  const acc = T.powerAccountParts || [];
  const html = (r) => r.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${sign(v)}</td></tr>`).join('');
  return `<h3>Power</h3><table class="kv">${html([['Buildings producing', P.gen], ['Buildings using', -P.use], ['Towns using', -P.towns]].filter(([, v]) => v))}
    ${acc.length ? `<tr><td colspan="2" class="muted small">Your account, not on the map:</td></tr>${html(acc)}` : ''}
    <tr><td><b>Net</b></td><td class="n"><b>${sign(T.powerGen - T.powerUse)}</b></td></tr></table>`;
}
function renderStats() {
  const el = $('#tab-stats'); if (!result) return;
  const T = result.totals;
  const net = T.powerGen - T.powerUse;
  const resRows = RESOURCES.filter(r => T.income[r]).map(r =>
    `<tr><td>${RES_LABEL[r]}</td><td class="n">${sign(T.income[r])}</td><td class="n">${fmt(T.income[r] * 400)}</td></tr>`).join('');
  const costRows = RESOURCES.filter(r => T.cost[r]).map(r => `<tr><td>${RES_LABEL[r]}</td><td class="n">${fmt(T.cost[r])}</td></tr>`).join('');
  const counts = Object.entries(T.counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const b = catalog.bMap.get(id); return `<tr><td>${esc(b?.name || id)}</td><td class="n">${n}</td></tr>`;
  }).join('');
  const issues = result.issues.slice(0, 200).map(q => {
    const x = q.i % plan.w, y = (q.i / plan.w) | 0;
    return `<div class="issue ${q.lvl}" data-i="${q.i}">(${x},${y}) ${esc(q.msg)}</div>`;
  }).join('');
  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="k">Power (net)</div><div class="v ${net < 0 ? 'bad' : 'good'}">${sign(net)}</div><div class="small muted">+${fmt(T.powerGen)} / −${fmt(T.powerUse)}</div></div>
      <div class="stat"><div class="k">Pollution (net)</div><div class="v ${T.poll > 0 ? 'bad' : 'good'}">${sign(T.poll)}</div><div class="small muted">+${fmt(T.pollAdd)} / −${fmt(T.pollRem)}</div></div>
      <div class="stat"><div class="k">Buildings</div><div class="v">${T.buildings}</div><div class="small muted">${T.paved} paved tiles</div></div>
      <div class="stat"><div class="k">Farm fields</div><div class="v">${T.fields}</div><div class="small muted">${result.issues.filter(q => q.lvl === 'bad').length} errors · ${result.issues.filter(q => q.lvl === 'warn').length} warnings</div></div>
    </div>
    ${net < 0 ? '<div class="issue">Power deficit — in game, all incomes drop proportionally until energy is balanced.</div>' : ''}
    <h3>Income</h3>
    ${resRows ? `<table class="kv"><tr><th>Resource</th><th class="n">per 9s</th><th class="n">per hour</th></tr>${resRows}</table>` : '<p class="muted small">No production yet.</p>'}
    ${powerRows(T)}
    ${pollRows(T)}
    <h3>Build cost (total)</h3>
    ${costRows ? `<table class="kv">${costRows}</table>` : '<p class="muted small">—</p>'}
    <h3>Issues</h3>
    ${issues || '<p class="muted small">No problems found.</p>'}
    <h3>Buildings</h3>
    ${counts ? `<table class="kv">${counts}</table>` : '<p class="muted small">—</p>'}
    <p class="note">Base values from the community wiki, before upgrades (except the upgrade toggles in Settings) and before the pollution penalty. Gathering radius is treated as a square around the building. Edit any number in Menu → Catalog editor.</p>`;
}
$('#tab-stats').addEventListener('click', (e) => {
  const it = e.target.closest('.issue[data-i]'); if (!it) return;
  const i = +it.dataset.i; centerOn(i); inspectCell(i);
});
function centerOn(i) {
  const r = stage.getBoundingClientRect();
  const x = i % plan.w, y = (i / plan.w) | 0;
  view.scale = Math.max(view.scale, 22);
  view.ox = r.width / 2 - (x + .5) * view.scale;
  view.oy = (isMobile() ? r.height * 0.22 : r.height / 2) - (y + .5) * view.scale;
  draw();
}

// =====================================================================
// Inspect tab
// =====================================================================
// Where a building's numbers come from: mined game data, with wiki values only as a fallback.
function dataSourceHTML(b) {
  if (b.custom) return 'Custom entry';
  const parts = [];
  if (b.source === 'game') parts.push(`Game ${esc(GAME_SOURCE.app_version)} (base values)`);
  else if (b.source === 'wiki') parts.push('Wiki only');
  if (b.profileFields?.length) parts.push(`<span style="color:#7fc8ff">your account: ${esc(b.profileFields.join(', '))}</span>`);
  if (b.fallback?.length) parts.push(`<span style="color:#ff9f43">wiki fallback: ${esc(b.fallback.join(', '))}</span>`);
  if (b.edited) parts.push('edited by you');
  return parts.join('<br>') || '—';
}

function renderInfo() {
  const el = $('#tab-info');
  if (selCell < 0 || !plan || selCell >= plan.w * plan.h) { el.innerHTML = '<p class="muted">Use the 🔍 Inspect tool (or tap with ✋ Pan) to see details for a tile.</p>'; return; }
  const i = selCell, x = i % plan.w, y = (i / plan.w) | 0;
  const t = catalog.tMap.get(plan.terrain[i]);
  const b = plan.bld[i] ? catalog.bMap.get(plan.bld[i]) : null;
  const c = result?.cells.get(i);
  let html = `<h3 style="margin-top:0">Tile (${x}, ${y})</h3>
    <div class="row" style="margin-bottom:8px"><span class="chip" style="background:${t?.color}"></span><b>${esc(t?.name || plan.terrain[i])}</b>${plan.pave[i] ? '<span class="muted">+ pavement</span>' : ''}</div>`;
  if (result?.fieldOwner.has(i)) { const o = result.fieldOwner.get(i); html += `<p class="small muted">Farm field of the farm at (${o % plan.w}, ${(o / plan.w) | 0})</p>`; }
  if (b) {
    const eff = c || {};
    html += `<h3>${esc(b.name)}${plan.rail[i] ? ' + Rails' : ''} ${b.premium ? '<span style="color:#c86fe0">◆ premium</span>' : ''}</h3>
    <table class="kv">
      ${b.lvl ? `<tr><td>Unlocks</td><td class="n">Lv ${b.lvl}</td></tr>` : ''}
      ${b.cost ? `<tr><td>Cost</td><td class="n">${Object.entries(b.cost).map(([k, v]) => `${fmt(v)} ${RES_LABEL[k] || k}`).join(', ')}</td></tr>` : ''}
      <tr><td>Power</td><td class="n">${sign(eff.power ?? b.power ?? 0)}</td></tr>
      <tr><td>Pollution</td><td class="n">${sign(eff.poll ?? b.poll ?? 0)}</td></tr>
      ${eff.uranium ? `<tr><td>U-Battery use</td><td class="n">${sign(eff.uranium)}</td></tr>` : ''}
      ${Object.keys(eff.income || {}).length ? `<tr><td>Income / 9s</td><td class="n">${Object.entries(eff.income).map(([k, v]) => `${sign(v)} ${RES_LABEL[k] || k}`).join(', ')}</td></tr>` : ''}
      ${b.radius ? `<tr><td>Radius</td><td class="n">${effRadius(b, analysisSettings())}</td></tr>` : ''}
      ${b.tiles?.length ? `<tr><td>Placeable on</td><td class="n">${b.tiles.map(id => esc(catalog.tMap.get(id)?.name || id)).join(', ')}</td></tr>` : ''}
      ${b.storage ? `<tr><td>Storage</td><td class="n">${Object.entries(b.storage).map(([k, v]) => `${fmt(v)} ${RES_LABEL[k] || k}`).join(', ')}</td></tr>` : ''}
      <tr><td>Data</td><td class="n small">${dataSourceHTML(b)}</td></tr>
    </table>
    ${b.desc ? `<p class="small">${esc(b.desc)}</p>` : ''}`;
    for (const n of eff.notes || []) html += `<div class="issue info">${esc(n)}</div>`;
  }
  for (const q of c?.issues || []) html += `<div class="issue ${q.lvl}">${esc(q.msg)}</div>`;
  html += `<div class="row" style="margin-top:10px">
    ${b ? `<button data-act="pick">Use this building</button><button data-act="remove" class="btn-danger">Remove</button><button data-act="edit">Edit in catalog</button>` : ''}
    <button data-act="pickT">Use this terrain</button>
  </div>`;
  el.innerHTML = html;
}
$('#tab-info').addEventListener('click', (e) => {
  const a = e.target.closest('button[data-act]')?.dataset.act; if (!a) return;
  const i = selCell, b = plan.bld[i];
  if (a === 'pick') { selBuilding = b; setTool('build'); renderPalette(); toast('Selected ' + catalog.bMap.get(b)?.name); }
  if (a === 'pickT') { selTerrain = plan.terrain[i]; setTool('terrain'); renderPalette(); toast('Selected ' + catalog.tMap.get(selTerrain)?.name); }
  if (a === 'remove') { beginStroke(); removeBuilding(i); endStroke(); }
  if (a === 'edit') editBuildingDialog(catalog.bMap.get(b));
});

// =====================================================================
// Dialogs
// =====================================================================
function modal(title, bodyHTML, buttons = [{ label: 'Close', value: null }], onMount) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" class="dlg"><header><h2>${esc(title)}</h2><button value="__x" class="icon" aria-label="Close" formnovalidate>✕</button></header>
      <div class="body">${bodyHTML}</div>
      <footer>${buttons.map((b, k) => `<button value="${k}" class="${b.cls || ''}" ${b.novalidate ? 'formnovalidate' : ''}>${esc(b.label)}</button>`).join('')}</footer></form>`;
    document.body.appendChild(d);
    const form = d.querySelector('form');
    let val = null;
    form.addEventListener('submit', (e) => {
      const k = e.submitter?.value;
      if (k === '__x' || k === undefined) { val = null; return; }
      const btn = buttons[+k];
      if (btn.check && !btn.check(form)) { e.preventDefault(); return; }
      val = btn.value === undefined ? k : btn.value;
      if (btn.collect) val = btn.collect(form);
    });
    d.addEventListener('close', () => { d.remove(); resolve(val); });
    onMount?.(d, form, () => d.close());
    d.showModal();
  });
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

async function menuDialog() {
  const items = [
    ['new', '➕  New plan…'], ['plans', '📂  My plans…'], ['resize', '⇲  Resize grid…'],
    ['settings', '⚙  Settings & upgrades…'], ['catalog', '🧱  Catalog editor (buildings & terrain)…'], ['icons', '🎨  Game icons…'], ['gamemap', '🗺  Import game map…'], ['profile', '👤  My account values…'],
    ['share', '🔗  Copy share code'], ['paste', '📋  Load from share code…'],
    ['export', '⬇  Export plan file'], ['exportAll', '⬇  Export all plans (backup)'], ['import', '⬆  Import plan file…'],
    ...(deferredInstall ? [['install', '📱  Install as app']] : []),
    ['help', '❓  Help'],
  ];
  const v = await modal('Menu', `<div class="menu-list">${items.map(([k, l]) => `<button value="${k}" type="button" data-k="${k}">${l}</button>`).join('')}</div>`, [{ label: 'Close' }], (d, f, close) => {
    d.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { d.dataset.choice = b.dataset.k; close(); }));
    d.addEventListener('close', () => setTimeout(() => runMenu(d.dataset.choice)), { once: true });
  });
}
function runMenu(k) {
  ({
    new: newPlanDialog, plans: plansDialog, resize: resizeDialog, settings: settingsDialog, catalog: catalogDialog,
    share: copyShareCode, paste: pasteShareDialog, export: () => exportFile(false), exportAll: () => exportFile(true),
    import: () => $('#fileImport').click(), help: helpDialog, icons: iconsDialog, gamemap: () => $('#mapImport').click(), profile: profileDialog,
    install: async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; },
  })[k]?.();
}

function terrainOptions(sel) { return catalog.terrain.map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join(''); }

async function newPlanDialog() {
  const v = await modal('New plan', `
    <label class="f">Name<input name="name" required value="Plan ${Object.keys(plans).length + 1}"></label>
    <div class="two"><label class="f">Width (tiles)<input name="w" type="number" min="3" max="${MAX_SIDE}" value="25" required></label>
    <label class="f">Height (tiles)<input name="h" type="number" min="3" max="${MAX_SIDE}" value="25" required></label></div>
    <label class="f">Fill with<select name="fill">${terrainOptions('grass')}</select></label>
    <label class="chk" style="font-size:13px"><input type="checkbox" name="main" checked> Put a Main Settlement in the centre</label>
    <p class="note">Tip: copy the area around your settlement from the game — paint the terrain first, then plan buildings on top.</p>`,
    [{ label: 'Cancel', value: null, novalidate: true }, { label: 'Create', cls: 'btn-primary', collect: (f) => Object.fromEntries(new FormData(f)) }]);
  if (!v) return;
  const w = clamp(+v.w, 3, MAX_SIDE), h = clamp(+v.h, 3, MAX_SIDE);
  persistPlan(true);
  plan = makePlan(v.name || 'Plan', w, h, v.fill, !!v.main);
  switchedPlan(true);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v | 0 || a));

function switchedPlan(doFit = false) {
  undoStack = []; redoStack = []; selCell = -1;
  if (plan.view && !doFit) Object.assign(view, plan.view);
  reanalyze(); persistPlan(true); updateChrome(); renderStats(); renderInfo();
  if (doFit || !plan.view) fit(); else draw();
}

async function plansDialog() {
  persistPlan(true);
  const rows = () => Object.values(plans).sort((a, b) => b.updated - a.updated).map(p => `
    <div class="plan-row ${p.id === plan.id ? 'cur' : ''}">
      <div><b>${esc(p.name)}</b><div class="meta">${p.w}×${p.h} · ${p.b.length} buildings · ${new Date(p.updated).toLocaleString()}</div></div>
      <div class="row">
        <button type="button" data-a="open" data-id="${p.id}">Open</button>
        <button type="button" data-a="ren" data-id="${p.id}" title="Rename">✎</button>
        <button type="button" data-a="dup" data-id="${p.id}" title="Duplicate">⧉</button>
        <button type="button" data-a="del" data-id="${p.id}" class="btn-danger" title="Delete">🗑</button>
      </div></div>`).join('');
  await modal('My plans', `<div id="planRows">${rows()}</div>`, [{ label: 'New plan…', value: 'new' }, { label: 'Close' }], (d, f, close) => {
    d.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-a]'); if (!btn) return;
      const id = btn.dataset.id, a = btn.dataset.a;
      if (a === 'open') { persistPlan(true); plan = decodePlan(plans[id]); switchedPlan(); close(); }
      if (a === 'ren') { const n = prompt('Plan name', plans[id].name); if (n) { plans[id].name = n; if (id === plan.id) plan.name = n; storePlans(plans[id]); updateChrome(); d.querySelector('#planRows').innerHTML = rows(); } }
      if (a === 'dup') { const c = { ...JSON.parse(JSON.stringify(plans[id])), id: uid(), name: plans[id].name + ' (copy)', updated: Date.now() }; storePlans(c); d.querySelector('#planRows').innerHTML = rows(); }
      if (a === 'del') {
        if (!confirm(`Delete "${plans[id].name}"? This can't be undone.`)) return;
        deletePlan(id).catch((e) => { console.error(e); toast('Could not delete the saved plan'); });
        if (id === plan.id) {
          const rest = Object.values(plans).sort((a, b) => b.updated - a.updated);
          plan = rest.length ? decodePlan(rest[0]) : makePlan('My base', 25, 25); switchedPlan();
        }
        d.querySelector('#planRows').innerHTML = rows();
      }
    });
  }).then(v => { if (v === 'new') newPlanDialog(); });
}

async function resizeDialog() {
  const v = await modal('Resize grid', `
    <div class="two"><label class="f">Width<input name="w" type="number" min="3" max="${MAX_SIDE}" value="${plan.w}" required></label>
    <label class="f">Height<input name="h" type="number" min="3" max="${MAX_SIDE}" value="${plan.h}" required></label></div>
    <label class="f">Keep existing content anchored at<select name="anchor">
      <option value="c">Centre</option><option value="tl">Top-left</option><option value="tr">Top-right</option><option value="bl">Bottom-left</option><option value="br">Bottom-right</option></select></label>
    <label class="f">Fill new tiles with<select name="fill">${terrainOptions('grass')}</select></label>
    <p class="note">Shrinking removes anything outside the new size.</p>`,
    [{ label: 'Cancel', value: null, novalidate: true }, { label: 'Resize', cls: 'btn-primary', collect: (f) => Object.fromEntries(new FormData(f)) }]);
  if (!v) return;
  const nw = clamp(+v.w, 3, MAX_SIDE), nh = clamp(+v.h, 3, MAX_SIDE);
  const dx = v.anchor === 'c' ? Math.floor((nw - plan.w) / 2) : v.anchor.includes('r') ? nw - plan.w : 0;
  const dy = v.anchor === 'c' ? Math.floor((nh - plan.h) / 2) : v.anchor.includes('b') ? nh - plan.h : 0;
  const np = makePlan(plan.name, nw, nh, v.fill, false); np.id = plan.id;
  for (let y = 0; y < plan.h; y++) for (let x = 0; x < plan.w; x++) {
    const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= nw || Y >= nh) continue;
    const s = y * plan.w + x, t = Y * nw + X;
    np.terrain[t] = plan.terrain[s]; np.bld[t] = plan.bld[s]; np.pave[t] = plan.pave[s]; np.rail[t] = plan.rail[s];
    np.forest[t] = plan.forest[s]; np.town[t] = plan.town[s]; np.tflag[t] = plan.tflag[s];
  }
  plan = np; switchedPlan(true);
}

async function settingsDialog() {
  const u = settings.upgrades;
  const v = await modal('Settings & upgrades', `
    <label class="f">Your Main Settlement level (0 = ignore)<input name="level" type="number" min="0" max="999" value="${settings.level || 0}"></label>
    <h3>Upgrades that change layout math</h3>
    ${profileActive() ? '<p class="note">Your account values are on: these come from your game (Menu → My account values), so the boxes below are ignored.</p>' : ''}
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="bigFarms" ${u.bigFarms ? 'checked' : ''}> Big Farms — farm radius +1</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="farmImplements" ${u.farmImplements ? 'checked' : ''}> Farming Implements — ×2 food per field</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="advSaw" ${u.advSaw ? 'checked' : ''}> Advanced Saw — lumber mill radius +1</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="roadless" ${u.roadless ? 'checked' : ''}> Surrounded by Nature — farms & mills don't need roads</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="farmWatering" ${u.farmWatering ? 'checked' : ''}> Better Farm Watering — Big Farms up to 6 tiles from water</label>
    <h3>Display & checks</h3>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="checkRoads" ${settings.checkRoads ? 'checked' : ''}> Warn when buildings aren't road-connected to a settlement</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="showFields" ${settings.showFields ? 'checked' : ''}> Show farm fields</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="showGrid" ${settings.showGrid ? 'checked' : ''}> Grid lines</label><br>
    <label class="chk" style="font-size:14px;margin-bottom:6px"><input type="checkbox" name="showLabels" ${settings.showLabels ? 'checked' : ''}> Building labels</label>`,
    [{ label: 'Cancel', value: null, novalidate: true }, { label: 'Save', cls: 'btn-primary', collect: (f) => { const fd = new FormData(f); return { level: +fd.get('level') || 0, on: (n) => fd.get(n) === 'on' }; } }]);
  if (!v) return;
  settings.level = v.level;
  for (const k of ['bigFarms', 'farmImplements', 'advSaw', 'roadless', 'farmWatering']) settings.upgrades[k] = v.on(k);
  for (const k of ['checkRoads', 'showFields', 'showGrid', 'showLabels']) settings[k] = v.on(k);
  saveSettings(); renderPalette(); changed(false);
}

// ----- catalog editor
async function catalogDialog() {
  const listHTML = (q = '') => catalog.buildings.filter(b => !q || b.name.toLowerCase().includes(q)).map(b =>
    `<button type="button" data-id="${esc(b.id)}">${chipHTML(b)}<span>${esc(b.name)} <span class="muted small">${esc(b.cat)}</span></span><span class="small muted">${b.custom ? 'custom' : b.edited ? 'edited' : ''}</span></button>`).join('');
  const terrHTML = () => catalog.terrain.filter(t => t.custom).map(t => `<button type="button" data-tid="${esc(t.id)}"><span class="chip" style="background:${t.color}"></span><span>${esc(t.name)}</span><span class="small muted">custom terrain</span></button>`).join('');
  const v = await modal('Catalog editor', `
    <p class="note" style="margin-top:0">Fix numbers the wiki is missing, or add buildings/tiles. Edits are saved on this device and travel inside exported plan files and share codes.</p>
    <div class="row" style="margin-bottom:8px"><input id="catQ" type="search" placeholder="Search buildings…" style="flex:1"></div>
    <div class="cat-list" id="catList">${listHTML()}</div>
    <h3>Custom terrain</h3><div class="cat-list" id="terrList">${terrHTML() || '<span class="muted small">None yet.</span>'}</div>`,
    [{ label: '+ Building', value: 'newB' }, { label: '+ Terrain', value: 'newT' }, { label: 'Reset all edits', value: 'reset', cls: 'btn-danger' }, { label: 'Close' }],
    (d, f, close) => {
      d.querySelector('#catQ').addEventListener('input', (e) => { d.querySelector('#catList').innerHTML = listHTML(e.target.value.toLowerCase()); });
      d.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-id]'); if (b) { d.dataset.edit = b.dataset.id; close(); }
        const t = e.target.closest('button[data-tid]'); if (t) { d.dataset.editT = t.dataset.tid; close(); }
      });
      d.addEventListener('close', () => {
        if (d.dataset.edit) setTimeout(() => editBuildingDialog(catalog.bMap.get(d.dataset.edit), true));
        if (d.dataset.editT) setTimeout(() => editTerrainDialog(catalog.tMap.get(d.dataset.editT)));
      }, { once: true });
    });
  if (v === 'newB') editBuildingDialog(null, true);
  if (v === 'newT') editTerrainDialog(null);
  if (v === 'reset' && confirm('Remove all your catalog edits and custom entries?')) { resetCatalog(); afterCatalogChange(); }
}
const kvToText = (o) => Object.entries(o || {}).map(([k, v]) => `${k}:${v}`).join(', ');
function textToKv(s) {
  const o = {};
  for (const part of String(s || '').split(/[,;\n]/)) {
    const m = part.trim().match(/^([a-z_]+)\s*[:=]\s*(-?[\d.]+)\s*([kmb])?$/i);
    if (m) o[m[1].toLowerCase()] = Math.round(+m[2] * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[3] || '').toLowerCase()] || 1));
  }
  return o;
}
function afterCatalogChange() { invalidateOverview(); reanalyze(); renderPalette(); renderStats(); renderInfo(); updateChrome(); draw(); }

async function editBuildingDialog(b, backToCatalog = false) {
  const isNew = !b;
  b = b || { id: 'custom_' + uid(), name: 'New building', cat: 'Custom', tiles: ['grass', 'barren', 'desert', 'rubble', 'groundoil', 'copperfield'] };
  const tiles = new Set(b.tiles || []);
  const kinds = [['', 'none'], ['farm', 'Farm fields'], ['lumber', 'Needs forest'], ['foundry', 'Foundry (iron mines)'], ['reveal', 'Reveal / scout'], ['collect', 'Collect / boost'], ['tanker', 'Tanker (oil rigs)']];
  const v = await modal(isNew ? 'New building' : 'Edit ' + b.name, `
    <div class="two"><label class="f">Name<input name="name" required value="${esc(b.name)}"></label>
    <label class="f">Label on map (≤3 chars)<input name="abbr" maxlength="4" value="${esc(abbr(b))}"></label></div>
    <div class="two"><label class="f">Category<input name="cat" list="catOpts" value="${esc(b.cat || 'Custom')}"><datalist id="catOpts">${catalog.categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="f">Colour<input name="color" type="color" value="${bColor(b)}"></label></div>
    <div class="three"><label class="f">Unlock level<input name="lvl" type="number" min="0" value="${b.lvl || ''}"></label>
    <label class="f">Power (+ make / − use)<input name="power" type="number" value="${b.power || 0}"></label>
    <label class="f">Pollution (+/−)<input name="poll" type="number" value="${b.poll || 0}"></label></div>
    <label class="f">Income per 9s (e.g. <code>gold:100, chips:5</code>)<input name="income" value="${esc(kvToText(b.income))}"></label>
    <label class="f">Cost (e.g. <code>gold:3.5m, steel:20k</code>)<input name="cost" value="${esc(kvToText(b.cost))}"></label>
    <div class="three"><label class="f">Radius<input name="radius" type="number" min="0" max="30" value="${b.radius || 0}"></label>
    <label class="f">Radius effect<select name="radiusKind">${kinds.map(([k, l]) => `<option value="${k}" ${k === (b.radiusKind || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">U-Battery / 9s<input name="uranium" type="number" value="${b.uranium || 0}"></label></div>
    <label class="chk" style="font-size:14px"><input type="checkbox" name="road" ${b.road !== false ? 'checked' : ''}> Needs road connection</label>
    <label class="chk" style="font-size:14px;margin-left:12px"><input type="checkbox" name="premium" ${b.premium ? 'checked' : ''}> Premium</label>
    <h3>Placeable on</h3>
    <div class="tile-checks">${catalog.terrain.map(t => `<label><input type="checkbox" name="tile" value="${esc(t.id)}" ${tiles.has(t.id) ? 'checked' : ''}><span class="chip" style="width:14px;height:14px;background:${t.color}"></span>${esc(t.name)}</label>`).join('')}</div>
    <label class="f" style="margin-top:10px">Notes<textarea name="desc" rows="2">${esc(b.desc || '')}</textarea></label>`,
    [
      ...(!isNew && isDefaultBuilding(b.id) && b.edited ? [{ label: 'Reset to wiki', value: 'reset', novalidate: true }] : []),
      ...(!isNew && b.custom ? [{ label: 'Delete', value: 'delete', cls: 'btn-danger', novalidate: true }] : []),
      { label: 'Cancel', value: null, novalidate: true },
      { label: 'Save', cls: 'btn-primary', collect: (f) => { const fd = new FormData(f); return { save: true, fd, tiles: fd.getAll('tile') }; } },
    ]);
  if (v === 'reset') { resetBuilding(b.id); afterCatalogChange(); }
  else if (v === 'delete') { if (confirm('Delete this custom building? Tiles using it will show as unknown.')) { deleteCustomBuilding(b.id); afterCatalogChange(); } }
  else if (v?.save) {
    const fd = v.fd, num = (k) => +fd.get(k) || 0;
    const nb = { ...b, name: fd.get('name'), abbr: fd.get('abbr'), cat: fd.get('cat') || 'Custom', color: fd.get('color'),
      lvl: num('lvl') || undefined, power: num('power') || undefined, poll: num('poll') || undefined, uranium: num('uranium') || undefined,
      income: textToKv(fd.get('income')), cost: textToKv(fd.get('cost')), radius: num('radius') || undefined,
      radiusKind: fd.get('radiusKind') || undefined, road: fd.get('road') === 'on' ? undefined : false,
      premium: fd.get('premium') === 'on' || undefined, tiles: v.tiles, desc: fd.get('desc') || undefined };
    if (nb.radiusKind === 'foundry') nb.foundry = true;
    if (!isNew && !b.color && nb.color === bColor(b)) delete nb.color;
    for (const k of Object.keys(nb)) if (nb[k] === undefined) delete nb[k];
    if (!Object.keys(nb.income).length) delete nb.income;
    if (!Object.keys(nb.cost).length) delete nb.cost;
    delete nb.edited; delete nb.custom;
    saveBuilding(nb); afterCatalogChange();
    if (isNew) { selBuilding = nb.id; setTool('build'); }
    toast('Saved ' + nb.name);
  }
  if (backToCatalog && v !== null) setTimeout(catalogDialog);
}
async function editTerrainDialog(t) {
  const isNew = !t;
  t = t || { id: 'custom_t_' + uid(), name: 'New tile', color: '#88aa66', group: 'land' };
  const v = await modal(isNew ? 'New terrain' : 'Edit ' + t.name, `
    <div class="two"><label class="f">Name<input name="name" required value="${esc(t.name)}"></label>
    <label class="f">Colour<input name="color" type="color" value="${t.color}"></label></div>
    <label class="f">Group<select name="group">${['land', 'resource', 'water', 'special', 'settlement'].map(g => `<option ${g === t.group ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <label class="chk" style="font-size:14px"><input type="checkbox" name="forest" ${t.forest ? 'checked' : ''}> Counts as forest (lumber)</label>
    <label class="chk" style="font-size:14px;margin-left:10px"><input type="checkbox" name="water" ${t.water ? 'checked' : ''}> Counts as water</label>
    <p class="note">New tiles aren't automatically buildable — tick them under "Placeable on" for each building.</p>`,
    [...(!isNew ? [{ label: 'Delete', value: 'delete', cls: 'btn-danger', novalidate: true }] : []), { label: 'Cancel', value: null, novalidate: true },
      { label: 'Save', cls: 'btn-primary', collect: (f) => Object.fromEntries(new FormData(f)) }]);
  if (v === 'delete') { deleteCustomTerrain(t.id); afterCatalogChange(); return; }
  if (!v) return;
  saveTerrain({ id: t.id, name: v.name, color: v.color, group: v.group, forest: v.forest === 'on' || undefined, water: v.water === 'on' || undefined, settlement: v.group === 'settlement' || undefined });
  afterCatalogChange();
}

// ----- game icons (optional, user-supplied; see js/icons.js)
async function iconsDialog() {
  const n = icons.b.size + icons.t.size;
  const status = !icons.source ? 'No icon pack loaded: buildings and terrain are drawn as coloured tiles.'
    : `${icons.b.size} building and ${icons.t.size} terrain icons loaded from ${icons.source === 'folder' ? 'the local <code>icons/game/</code> folder' : 'an imported icon pack (stored in this browser)'}.`;
  const v = await modal('Game icons', `
    <p class="small">${status}</p>
    <label class="chk" style="font-size:14px"><input type="checkbox" name="use" ${settings.useIcons ? 'checked' : ''}> Show game icons</label>
    <p class="note">The planner doesn't include any game art. To see icons, build them from your own copy of the game
      (<code>node tools/re/build_icons.mjs</code>, see tools/re/README.md), then on this device use <b>Export icon pack</b> and,
      on your phone, <b>Import icon pack</b>. Packs are for your own use only; please don't share them.</p>`,
    [
      { label: 'Import icon pack…', value: 'import', novalidate: true },
      ...(n ? [{ label: 'Export icon pack', value: 'export', novalidate: true }] : []),
      ...(icons.source === 'imported' ? [{ label: 'Remove imported pack', value: 'remove', cls: 'btn-danger', novalidate: true }] : []),
      { label: 'Done', cls: 'btn-primary', value: 'done' },
    ], (d, f) => f.use.addEventListener('change', () => { settings.useIcons = f.use.checked; saveSettings(); renderPalette(); updateChrome(); draw(); }));
  if (v === 'import') $('#iconImport').click();
  if (v === 'export') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exportPack())], { type: 'application/json' }));
    a.download = 'post-apo-icon-pack.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  if (v === 'remove') { await removeImportedPack(); renderPalette(); updateChrome(); draw(); toast('Imported icon pack removed'); }
}
{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'iconImport'; inp.hidden = true;
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    try { await importPack(JSON.parse(await f.text())); renderPalette(); updateChrome(); draw(); toast(`Icon pack imported (${icons.b.size + icons.t.size} icons)`); }
    catch (err) { alert('Icon import failed: ' + err.message); }
  });
}

// ----- account values (profile built from your own game by tools/re/build_profile.mjs)
async function profileDialog() {
  const p = getProfile();
  const status = !p ? 'Not loaded. Totals use base values (no upgrades) plus the upgrade boxes in Settings.'
    : `Loaded: values for ${Object.keys(p.buildings).length} buildings with your upgrades applied (game ${esc(p.app_version || '?')}, read ${esc(p.extracted || '?')}, town level ${esc(p.level ?? '?')}).`;
  const v = await modal('My account values', `
    <p class="small">${status}</p>
    ${p ? `<label class="chk" style="font-size:14px"><input type="checkbox" name="on" ${profileActive() ? 'checked' : ''}> Use my account values</label>` : ''}
    <p class="note">Base game values assume no upgrades. Load the <code>profile.json</code> made from your own game
      (<code>node tools/re/build_profile.mjs</code>, see tools/re/README.md) so production, power, pollution, costs, ranges and
      storage match what you have. It's stored only in this browser. The Inspect panel marks values that come from it.</p>`,
    [{ label: 'Load profile…', value: 'load', novalidate: true },
      ...(p ? [{ label: 'Remove', value: 'remove', cls: 'btn-danger', novalidate: true }] : []),
      { label: 'Done', cls: 'btn-primary', value: 'done' }],
    (d, f) => f.on?.addEventListener('change', () => { setProfileEnabled(f.on.checked); afterCatalogChange(); }));
  if (v === 'load') $('#profileImport').click();
  if (v === 'remove') { clearProfile(); afterCatalogChange(); toast('Account values removed'); }
}
{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'profileImport'; inp.hidden = true;
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    try {
      const p = JSON.parse(await f.text()); setProfile(p);
      if (p.level && !settings.level) { settings.level = p.level; saveSettings(); }
      afterCatalogChange();
      toast(`Account values loaded for ${Object.keys(p.buildings).length} buildings`);
    } catch (err) { alert('Could not load account values: ' + err.message); }
  });
}

// ----- game map import (a map exported from the running game, see tools/re/README.md)
async function gameMapDialog(grid, fileName) {
  const B = gridBounds(grid);
  const fits = B.w <= MAX_SIDE && B.h <= MAX_SIDE;
  // Pre-filled with the whole map; a map larger than the plan limit starts centred on the main settlement.
  const W = Math.min(MAX_SIDE, B.w), H = Math.min(MAX_SIDE, B.h);
  const CX = fits ? B.x0 + Math.floor(B.w / 2) : 0, CY = fits ? B.y0 + Math.floor(B.h / 2) : 0;
  const v = await modal('Import game map', `
    <p class="small">${fmt(B.tiles)} explored tiles, ${fmt(B.buildings)} buildings. Map spans x ${B.x0}…${B.x1}, y ${B.y0}…${B.y1}
      (${fmt(B.w)} × ${fmt(B.h)} tiles); your main settlement is at (0, 0).</p>
    <p class="note">${fits ? 'Filled in with the whole map. Change the centre or size to bring in only an area.'
      : `Plans are at most ${MAX_SIDE} × ${MAX_SIDE} tiles, so pick the area to bring in.`} Unexplored tiles become "Unexplored".</p>
    <label class="f">Plan name<input name="name" required value="${esc(fileName.replace(/\.json$/i, '') || 'Game map')}"></label>
    <div class="two"><label class="f">Centre x<input name="cx" type="number" value="${CX}" required></label>
    <label class="f">Centre y<input name="cy" type="number" value="${CY}" required></label></div>
    <div class="two"><label class="f">Width (tiles)<input name="w" type="number" min="3" max="${MAX_SIDE}" value="${W}" required></label>
    <label class="f">Height (tiles)<input name="h" type="number" min="3" max="${MAX_SIDE}" value="${H}" required></label></div>`,
    [{ label: 'Cancel', value: null, novalidate: true }, { label: 'Create plan', cls: 'btn-primary', collect: (f) => Object.fromEntries(new FormData(f)) }]);
  if (!v) return;
  const region = { cx: +v.cx | 0, cy: +v.cy | 0, w: clamp(+v.w, 3, MAX_SIDE), h: clamp(+v.h, 3, MAX_SIDE) };
  const r = gridToPlan(grid, region, catalog.buildings);
  persistPlan(true);
  plan = { id: uid(), name: v.name || 'Game map', w: r.w, h: r.h, terrain: r.terrain, bld: r.bld, pave: r.pave, rail: r.rail, forest: r.forest, town: r.town, tflag: r.tflag };
  switchedPlan(true);
  const odd = Object.entries(r.report.unmatched);
  toast(`Imported ${fmt(r.report.buildings)} buildings and ${fmt(r.report.roads)} roads` + (odd.length ? ` (${odd.length} unknown building type(s) skipped)` : ''), 5000);
  if (odd.length) console.warn('Map import: building types with no catalog entry', r.report.unmatched);
}
{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.id = 'mapImport'; inp.hidden = true;
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    let grid;
    try { grid = readGrid(JSON.parse(await f.text())); } catch (err) { alert('Map import failed: ' + err.message); return; }
    gameMapDialog(grid, f.name);
  });
}

// ----- import / export / share
function bundle(all) {
  persistPlan(true);
  return { app: 'post-apo-planner', v: 1, plans: all ? Object.values(plans) : [plans[plan.id]], catalog: exportCatalog() };
}
function exportFile(all) {
  const data = JSON.stringify(bundle(all));
  if (all) localStorage.setItem('pat.lastBackup', Date.now());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = (all ? 'post-apo-plans-backup' : plan.name.replace(/[^\w-]+/g, '_')) + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importBundle(data) {
  if (!data || data.app !== 'post-apo-planner' || !Array.isArray(data.plans)) throw new Error('Not a planner file');
  if (data.catalog) importCatalog(data.catalog, true);
  const added = [];
  for (const p of data.plans) {
    const e = { ...p };
    if (plans[e.id]) { e.id = uid(); e.name += ' (imported)'; }
    e.updated = Date.now(); plans[e.id] = e; added.push(e);
  }
  storePlans(...added);
  const last = added.at(-1);
  if (last) { plan = decodePlan(last); afterCatalogChange(); switchedPlan(); }
  toast(`Imported ${data.plans.length} plan(s)`);
}
$('#fileImport').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { importBundle(JSON.parse(await f.text())); } catch (err) { alert('Import failed: ' + err.message); }
});

async function gz(str) {
  const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(s).arrayBuffer());
  let bin = ''; for (const c of buf) bin += String.fromCharCode(c);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function ungz(code) {
  const b64 = code.trim().replace(/^PAT1:/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).text();
}
async function copyShareCode() {
  const b = bundle(false);
  const code = 'PAT1:' + await gz(JSON.stringify(b));
  try { await navigator.clipboard.writeText(code); toast(`Share code copied (${code.length} chars) — paste it on your other device`); }
  catch { await modal('Share code', `<p class="small muted">Copy this text and paste it into “Load from share code” on another device.</p><textarea class="code" readonly onclick="this.select()">${esc(code)}</textarea>`); }
}
async function pasteShareDialog() {
  const v = await modal('Load from share code', `<textarea class="code" name="code" placeholder="PAT1:…" required></textarea>`,
    [{ label: 'Cancel', value: null, novalidate: true }, { label: 'Load', cls: 'btn-primary', collect: (f) => new FormData(f).get('code') }]);
  if (!v) return;
  try { importBundle(JSON.parse(await ungz(v))); } catch (err) { alert('That code could not be read: ' + err.message); }
}

function helpDialog() {
  modal('How to use', `
    <p><b>Plan before you build.</b> Paint the terrain around your settlement the way it is in the game, then try building layouts on top. Nothing here costs resources.</p>
    <h3>Tools</h3>
    <ul class="small">
      <li><b>✋ Pan</b> — drag to move; tap a tile to inspect it. Pinch (or mouse wheel) to zoom anywhere.</li>
      <li><b>🏗 Build</b> — place the selected building; drag to place several (great for roads and trees).</li>
      <li><b>🟩 Terrain</b> — paint tiles (Plain, Forest, Hill, Water, Golden Field…).</li>
      <li><b>▦ Pave</b> — lay / remove Pavement under buildings (pavement bonuses are included in totals).</li>
      <li><b>⌫ Erase</b> — removes buildings and pavement. <b>🔍 Inspect</b> — tile details, radius and problems.</li>
      <li><b>▭ Rect</b> — drag a rectangle to fill an area with the current tool.</li>
    </ul>
    <h3>What gets checked</h3>
    <ul class="small">
      <li>Red outline = can't be built there (wrong tile, coal plant too far from water, iron mine without a foundry in 3 tiles…).</li>
      <li>Orange dot = warning (no road connection, farms overlapping, conveyor without a stone mine…).</li>
      <li>Gold stripes = farm fields. Farms claim free tiles around them; overlapping farms share tiles.</li>
    </ul>
    <h3>Desktop shortcuts</h3>
    <p class="small">H pan · B build · T terrain · P pave · E erase · I inspect · R rect · F fit · Ctrl+Z / Ctrl+Y · Space+drag or right-drag to pan · Delete removes inspected building.</p>
    <h3>Phone ↔ desktop</h3>
    <p class="small">Plans save automatically on each device. To move one across, use <b>Copy share code</b> and paste it on the other device, or export/import a file.</p>
    <p class="note">Data: read from Post Apo Tycoon ${esc(GAME_SOURCE.app_version)} (base values), community wiki as fallback. Unofficial fan tool.</p>`);
}

// =====================================================================
// Boot
// =====================================================================
loadInitial();
reanalyze();
setTool('build');
renderPalette(); renderStats(); renderInfo(); updateChrome();
if (isMobile()) closePanel();
if (plan.view) Object.assign(view, plan.view); else needFit = true;
new ResizeObserver(resizeCanvas).observe(stage);
resizeCanvas();
loadIcons().then((src) => { if (src) { renderPalette(); updateChrome(); draw(); } });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Ask the browser not to auto-clear our saved plans when the device is low on space.
navigator.storage?.persist?.().catch(() => {});
// Write any pending change straight away when the tab is hidden or closed (saves are otherwise delayed a little).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) persistPlan(true); });

// Gentle backup reminder: plans live only on this device, so nudge for a backup file
// every couple of weeks once there's real work saved (at most once a week).
(() => {
  const DAY = 864e5, now = Date.now();
  const built = Object.values(plans).reduce((n, p) => n + (p.b?.length || 0), 0);
  const last = +localStorage.getItem('pat.lastBackup') || 0;
  const nag = +localStorage.getItem('pat.lastNag') || 0;
  if (built >= 15 && now - last > 14 * DAY && now - nag > 7 * DAY) {
    localStorage.setItem('pat.lastNag', now);
    setTimeout(() => toast('Plans are saved only on this device — back them up: Menu → Export all plans', 6000), 1500);
  }
})();
