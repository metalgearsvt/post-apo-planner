// Read-only: serialize named global data tables from the running game page.
// usage: node cdp_extract.mjs <ws-url> <out.json> <name1,name2,...>
//    or: node cdp_extract.mjs <ws-url> <out.json> @exprs.json   ({"label": "js expression", ...})
// Expressions must be side-effect free: this only reads game state.
import fs from 'node:fs';
const [wsUrl, out, namesArg] = process.argv.slice(2);
const exprs = namesArg.startsWith('@')
  ? JSON.parse(fs.readFileSync(namesArg.slice(1), 'utf8'))
  : Object.fromEntries(namesArg.split(',').filter(Boolean).map((n) => [n, n]));
const ws = new WebSocket(wsUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
const expr = `(() => {
  const exprs = ${JSON.stringify(exprs)};
  const out = {}, missing = [];
  for (const [n, src] of Object.entries(exprs)) {
    let v;
    try { v = (0, eval)(src); } catch (e) { missing.push(n); continue; }
    const seen = new WeakSet();
    if (v === undefined) { out[n] = null; continue; }
    out[n] = JSON.parse(JSON.stringify(v, (k, x) => {
      if (typeof x === 'function') return '[fn]';
      if (x && typeof x === 'object') { if (seen.has(x)) return '[circular]'; seen.add(x); }
      return x;
    }));
  }
  return JSON.stringify({ out, missing });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
if (r.result?.exceptionDetails || !r.result) { console.error(JSON.stringify(r).slice(0, 2000)); process.exit(1); }
const { out: data, missing } = JSON.parse(r.result.result.value);
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log('extracted', Object.keys(data).length, 'missing', missing.join(',') || 'none');
for (const [k, v] of Object.entries(data)) console.log(' ', k, Array.isArray(v) ? `array[${v.length}]` : typeof v === 'object' && v ? `object{${Object.keys(v).length}}` : JSON.stringify(v));
ws.close();
