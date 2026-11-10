// The Word worker: pandoc (src/pandoc.js) and the .docx code (src/docx.js, src/wordjobs.js), in a
// worker of its own, started only when a Word action is used. pandoc.wasm (59 MB, 16 MB gzipped)
// comes as numbered parts next to the page (build.mjs: every file under the 25 MiB the host takes),
// each checked against the SHA-256 the manifest gives, then the whole file against its own; it is
// kept in IndexedDB (the TeX worker's database, galley-tex) and checked again when read back, as the
// cache is the whole site's, so a later Word action needs no network.
import { createPandoc } from './pandoc.js';
import { exportDocx, docxToLatex } from './wordjobs.js';

const BASE = self.__rikuyWordBase || './';
let pandocP = null;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let r;
    try { r = indexedDB.open('galley-tex', 1); } catch (e) { resolve(null); return; }
    r.onupgradeneeded = () => { r.result.createObjectStore('blobs'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
  return dbp;
}
async function cacheGet(key) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try { const q = d.transaction('blobs', 'readonly').objectStore('blobs').get(key); q.onsuccess = () => resolve(q.result || null); q.onerror = () => resolve(null); } catch (e) { resolve(null); }
  });
}
async function cachePut(key, val) {
  const d = await db();
  if (!d) return;
  try { d.transaction('blobs', 'readwrite').objectStore('blobs').put(val, key); } catch (e) { /* quota: fetched again next time */ }
}

async function gunzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const status = (msg, done, total) => self.postMessage({ status: msg, done, total });

async function load() {
  const res = await fetch(BASE + 'pandoc.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Word support is not on this site (word/pandoc.json: ' + res.status + ')');
  const man = await res.json();
  if (!/^[0-9a-f]{64}$/.test(man.sha256 || '') || !Array.isArray(man.parts)) throw new Error('word/pandoc.json is damaged');
  const key = 'pandoc:' + man.sha256;
  let wasm = null;
  const kept = await cacheGet(key);
  if (kept) {
    try {
      const b = await gunzip(new Uint8Array(kept));
      if (await sha256(b) === man.sha256) wasm = b;
    } catch (e) { wasm = null; }
  }
  if (!wasm) {
    let got = 0;
    const total = man.parts.reduce((n, p) => n + p.size, 0);
    status('Loading Word support', 0, total);
    const parts = await Promise.all(man.parts.map(async (p) => {
      if (!/^[\w.-]+$/.test(p.name)) throw new Error('word/pandoc.json names a file outside its folder');
      const r = await fetch(BASE + p.name);
      if (!r.ok) throw new Error('could not fetch word/' + p.name + ' (' + r.status + ')');
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length !== p.size || await sha256(b) !== p.sha256) throw new Error('word/' + p.name + ' is not the file the manifest names (its SHA-256 differs)');
      got += b.length;
      status('Loading Word support', got, total);
      return b;
    }));
    const gz = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { gz.set(p, o); o += p.length; }
    if (man.gz && man.gz.sha256 && await sha256(gz) !== man.gz.sha256) throw new Error('the parts of pandoc.wasm do not join into the file the manifest names');
    wasm = await gunzip(gz);
    if (await sha256(wasm) !== man.sha256) throw new Error('pandoc.wasm is not the file the manifest names (its SHA-256 differs)');
    cachePut(key, gz.buffer);
  }
  status('Starting pandoc');
  const P = await createPandoc(wasm);
  return { P, version: man.pandoc || '' };
}

self.onmessage = async ({ data }) => {
  const { id, op } = data || {};
  try {
    if (!pandocP) pandocP = load();
    const { P, version } = await pandocP;
    let result;
    if (op === 'ping') result = { version };
    else if (op === 'export') result = exportDocx(P, data.req);
    else if (op === 'open') result = docxToLatex(P, data.bytes, data.name);
    else throw new Error('unknown request');
    const transfer = [];
    if (result && result.docx) transfer.push(result.docx.buffer);
    self.postMessage({ id, result }, transfer);
  } catch (e) {
    if (pandocP && !(await pandocP.then(() => true, () => false))) pandocP = null;
    self.postMessage({ id, error: (e && e.message) || String(e) });
  }
};
