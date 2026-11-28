// Builds a LOCAL-ONLY icon pack from your own extracted APK. The game's art is copyrighted:
// the output folder (icons/game/) is git-ignored and must never be committed or hosted.
//
// usage: node tools/re/build_icons.mjs [imagesDir] [imagePreloaderJs] [rawTables]
//   imagesDir        re/extract/assets/flutter_assets/lib/assets/webview_game/public/images
//   imagePreloaderJs re/web/src/image_preloader.js   (sprite coordinates, from the game bundle)
//   rawTables        re/web/data/tables.json          (building/terrain image names)
//
// Output: icons/game/manifest.json + the sprite sheets / single images it references.
// The planner crops sprites in the browser (js/icons.js).
import fs from 'node:fs';
import path from 'node:path';
import { BUILDINGS, TERRAIN } from '../../js/data.js';
import { TILE_TO_TERRAIN } from './mapping.mjs';

const imagesDir = process.argv[2] || 're/extract/assets/flutter_assets/lib/assets/webview_game/public/images';
const preloader = process.argv[3] || 're/web/src/image_preloader.js';
const rawTables = process.argv[4] || 're/web/data/tables.json';
const outDir = 'icons/game';

// Sprite sheet name -> file in the APK. Sheets under atlas_new/ aren't shipped in the APK (downloaded later), so
// sprites on them fall back to single images when those exist.
const PACK_FILE = {
  icons: 'atlas/icons1.png', icons2: 'atlas/icons2.png', icons3: 'atlas/icons3.png', roads12: 'atlas/roads12.png',
  roads34: 'atlas/roads34.png', shores: 'atlas/shores.png', rivers: 'atlas/rivers.png', bat1: 'atlas/bat1.png',
  bat2: 'atlas/bat2.png', bat3: 'atlas/bat3.png', bat4: 'atlas/bat4.png', sidekick: 'atlas/sidekick_v2.png', waters: 'atlas/waters.png',
};

// name -> {file, x, y, w, h}
const sprites = new Map();
const src = fs.readFileSync(preloader, 'utf8');
const re = /images_(\w+)\['([^']+)'\]\s*=\s*\{([^}]*)\}/g;
for (const m of src.matchAll(re)) {
  const body = m[3];
  const num = (k) => { const r = new RegExp(`\\b${k}\\s*:\\s*(-?\\d+)`).exec(body); return r ? +r[1] : null; };
  const pack = (/pack\s*:\s*'([^']+)'/.exec(body) || [])[1] || m[1];
  const prefix = (/prefix\s*:\s*'([^']+)'/.exec(body) || [])[1];
  const file = PACK_FILE[pack];
  if (!file || !fs.existsSync(path.join(imagesDir, file))) continue;
  const name = prefix ? `${prefix}/${m[2]}` : m[2];
  sprites.set(name, { file, x: num('x'), y: num('y'), w: num('w'), h: num('h') });
}

function resolve(name) {
  if (!name) return null;
  if (sprites.has(name)) return sprites.get(name);
  for (const cand of [`${name}.png`, `${name}.jpg`]) if (fs.existsSync(path.join(imagesDir, cand))) return { file: cand };
  return null;
}

const tables = JSON.parse(fs.readFileSync(rawTables, 'utf8'));
const gameImage = Object.fromEntries(tables.BUILDINGS.map((b) => [b.grid_key, b.image]));
const terrainImage = Object.fromEntries(tables.TERRAINS.map((t) => [t.grid_key, t.image]));

// Image names for things that aren't plain game buildings.
const EXTRA_BUILDING_IMAGES = {
  road_1_notsaved: 'streets/street_t1_8', road_2_notsaved: 'streets/street_t2_8', road_3_notsaved: 'streets/street_t3_8',
  road_4_notsaved: 'streets/street_t4_8', road_5_notsaved: 'streets/street_t5_8', road_6_notsaved: 'streets/street_t6_8',
  road_7_notsaved: 'streets/street_t7_8', road_8_notsaved: 'streets/street_t8_8',
  'forest:1': 'tree1', 'forest:2': 'tree2', 'forest:3': 'tree3', 'forest:4': 'tree4', 'forest:5': 'tree5', 'forest:6': 'tree6',
  tree6: 'tree6',
};
const PLANNER_TERRAIN_IMAGES = {
  forest: 'tree2', cutforest: 'tree_cutted', water: 'water', deepwater: 'water_deep', river: 'water',
  barren: 'desert', rubble: 'rubble1', ruins: 'airplane_wreck', gemrock: 'water_rocks_gem', shipwreck: 'ship_wreck',
  wateroil: 'oil_water', mainsettlement: 'town4', settlement: 'town1', megacity: 'megacities/megacity_1', bunker: 'bunker',
};

const manifest = { note: 'Local icon pack built from your own copy of the game. Do not commit or share.', files: [], buildings: {}, terrain: {} };
const used = new Set();
const missing = { buildings: [], terrain: [] };

for (const b of BUILDINGS) {
  const key = b.gameKey;
  const name = EXTRA_BUILDING_IMAGES[key] || gameImage[key?.split(':')[0]] || EXTRA_BUILDING_IMAGES[key?.split(':')[0]];
  const s = resolve(name);
  if (s) { manifest.buildings[b.id] = s; used.add(s.file); } else missing.buildings.push(`${b.id}(${name || '?'})`);
}
// Roads join their neighbours: the game picks one of 11 sprites per road type (streets/street_t<N>_<variant>)
// from which sides connect, see roadVariant() in js/icons.js. Bridges only have straight sprites (11 / 12).
manifest.roads = {};
for (const b of BUILDINGS) {
  const m = /^road_(\d+)_notsaved(?::(\w+))?$/.exec(b.gameKey || '');
  if (!m) continue;
  const [, n, place] = m, out = {};
  const variants = place ? ['11', '12'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12'];
  for (const v of variants) {
    const base = `streets/street_t${n}_${v}`;
    const s = place === 'sea' ? resolve(`${base}_bridge_big`) || resolve(`${base}_bridge`) : place ? resolve(`${base}_bridge`) : resolve(base);
    if (s) { out[v] = s; used.add(s.file); }
  }
  if (Object.keys(out).length) manifest.roads[b.id] = out;
}
// Rivers turn with their neighbours the same way (the game's RotateRiversAuto), plus end pieces 22/44/66/88 and a lone 13.
manifest.river = {};
for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '22', '44', '66', '88']) {
  const s = resolve(`rivers/river_t1_${v}`);
  if (s) { manifest.river[v] = s; used.add(s.file); }
}

const terrainKeyFor = Object.fromEntries(Object.entries(TILE_TO_TERRAIN).map(([g, t]) => [t, g]));
for (const t of TERRAIN) {
  const name = PLANNER_TERRAIN_IMAGES[t.id] || terrainImage[terrainKeyFor[t.id]] || terrainKeyFor[t.id];
  const s = resolve(name);
  if (s) { manifest.terrain[t.id] = s; used.add(s.file); } else missing.terrain.push(`${t.id}(${name || '?'})`);
}

fs.rmSync(outDir, { recursive: true, force: true });
for (const f of used) {
  fs.mkdirSync(path.join(outDir, path.dirname(f)), { recursive: true });
  fs.copyFileSync(path.join(imagesDir, f), path.join(outDir, f));
}
manifest.files = [...used];
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`icons: ${Object.keys(manifest.buildings).length}/${BUILDINGS.length} buildings, ${Object.keys(manifest.terrain).length}/${TERRAIN.length} terrain, ${used.size} image files`);
console.log(`road sprites: ${Object.keys(manifest.roads).length} road types, river sprites: ${Object.keys(manifest.river).length}`);
console.log('no image for buildings:', missing.buildings.join(' ') || 'none');
console.log('no image for terrain:', missing.terrain.join(' ') || 'none');
