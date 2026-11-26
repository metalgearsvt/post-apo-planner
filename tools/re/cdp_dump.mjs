// Read-only dump of a WebView page over the Chrome DevTools Protocol.
// usage: node cdp_dump.mjs <ws-url> <out-dir>
import fs from 'node:fs';
import path from 'node:path';

const [wsUrl, outDir] = process.argv.slice(2);
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const scripts = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Debugger.scriptParsed') scripts.push(m.params);
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
const redact = (s) => s.replace(/token=[^&]+/g, 'token=REDACTED');
const safeName = (u) => {
  let url; try { url = new URL(u); } catch { return "other/" + u.replace(/[^A-Za-z0-9._-]/g, "_"); }
  let p = url.hostname + url.pathname;
  if (p.endsWith('/')) p += 'index.html';
  return p.replace(/[<>:"|?*]/g, '_');
};

await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
await send('Debugger.enable');
await new Promise((r) => setTimeout(r, 1500));

const manifest = [];
const tree = (await send('Page.getResourceTree')).result.frameTree;
const walk = async (ft) => {
  for (const r of [{ url: ft.frame.url, type: 'Document', mimeType: 'text/html' }, ...(ft.resources || [])]) {
    if (!/^https?:/.test(r.url)) continue;
    const c = await send('Page.getResourceContent', { frameId: ft.frame.id, url: r.url });
    const rel = path.join('resources', safeName(r.url));
    if (c.result) {
      fs.mkdirSync(path.join(outDir, path.dirname(rel)), { recursive: true });
      let buf = c.result.base64Encoded ? Buffer.from(c.result.content, 'base64') : Buffer.from(c.result.content);
      if (r.type === 'Document') buf = Buffer.from(redact(buf.toString()));
      fs.writeFileSync(path.join(outDir, rel), buf);
    }
    manifest.push({ url: redact(r.url), type: r.type, mime: r.mimeType, saved: c.result ? rel : null, bytes: c.result ? c.result.content.length : 0 });
  }
  for (const ch of ft.childFrames || []) await walk(ch);
};
await walk(tree);

// Scripts the debugger knows about (includes inline / eval'd ones)
let n = 0;
for (const s of scripts) {
  if (s.url && /googleads|doubleclick/.test(s.url)) continue;
  const src = await send('Debugger.getScriptSource', { scriptId: s.scriptId });
  if (!src.result) continue;
  const name = s.url ? safeName(s.url) : `inline_${s.scriptId}.js`;
  const rel = path.join('scripts', name);
  fs.mkdirSync(path.join(outDir, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(outDir, rel), src.result.scriptSource);
  manifest.push({ url: redact(s.url || ''), type: 'Script', saved: rel, bytes: src.result.scriptSource.length });
  n++;
}

// Web storage (read only)
const origin = new URL(tree.frame.url).origin;
const storage = {};
for (const isLocal of [true, false]) {
  const r = await send('DOMStorage.getDOMStorageItems', { storageId: { securityOrigin: origin, isLocalStorage: isLocal } });
  storage[isLocal ? 'localStorage' : 'sessionStorage'] = r.result ? r.result.entries : r.error;
}
const idb = await send('IndexedDB.requestDatabaseNames', { securityOrigin: origin });
storage.indexedDBNames = idb.result ? idb.result.databaseNames : idb.error;
fs.writeFileSync(path.join(outDir, 'storage.json'), JSON.stringify(storage, null, 2));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`resources+scripts: ${manifest.length}, scripts: ${n}, localStorage keys: ${(storage.localStorage || []).length}, idb: ${JSON.stringify(storage.indexedDBNames)}`);
ws.close();
