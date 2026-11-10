// Rikuy's service worker: the installed app's offline copy. build/app.mjs writes dist/sw.js as
// `const RIKUY = {v, files, imm};` followed by this file; only the hosted build (index.html served
// as a whole page) registers it, never the copy inside the claude.ai artifact.
//
// RIKUY.v      the version: a hash of every file of the build but the content addressed ones
// RIKUY.files  path -> [sha256, size, kind] for what this worker serves; kind p: kept at install,
//              l: kept the first time it is asked for (large), i: content addressed (any version)
//
// What it keeps, and why:
// - The page and the scripts of the page and of the TeX worker, one Cache per version
//   ('rikuy-v-<version>'), fetched at install and checked against the hashes the build wrote: a
//   version is complete or not used, and a server that already moved on mid install fails the
//   install instead of mixing two versions. The page is answered from this cache first, so a new
//   version applies only when its worker becomes active: at the next open, or when the page asks
//   (its "Update ready" button), never while someone types.
// - Requests under _v/<version>/ (the page asks that way for everything bound to its version,
//   once a worker controls it) are answered from that version's cache. The cache of the version
//   before stays until the next update, so a second tab still on it keeps getting its own scripts;
//   a version no cache holds gets 410, never another version's file.
// - TeX packs (tex/p-<hash>.wasm) are not kept here: the TeX worker keeps them in IndexedDB
//   (galley-tex, key p:<hash>) by the hash they are named after. This worker answers a pack from
//   there when it is kept, which is what lets TeX's synchronous reads work offline; storing them
//   again here would double the largest part of what Rikuy keeps.
// - Nothing of the user's: projects live in IndexedDB and localStorage, which this worker does not
//   touch. Files shared to the app (manifest share_target) wait in 'rikuy-share' only until the
//   page the share opens takes them.
/* global RIKUY */
const VERSION = RIKUY.v;
const FILES = RIKUY.files;
const SCOPE = new URL(self.registration.scope);
const ROOT = SCOPE.pathname;
const CACHE_PREFIX = 'rikuy-v-';
const IMMUTABLE = 'rikuy-immutable';
const META = 'rikuy-meta';
const SHARE = 'rikuy-share';
const HEX16 = /^[0-9a-f]{16}$/;
// files of at most this size are fetched at install; larger ones the first time they are used
const PRECACHE_MAX = 4 * 1024 * 1024;
const at = (rel) => new URL(rel, SCOPE).href;

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}
// the version a page names in its <meta name="rikuy-app">; the page is checked by it, not by its
// hash, so a host that adds to the HTML (an analytics tag) still gets an offline copy
function pageVersion(buf) {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 8192)));
  const m = /<meta name="rikuy-app" content="([0-9a-f]{16})"/.exec(head);
  return m ? m[1] : null;
}

// A network response made fit to keep: complete, unredirected, and the bytes this version of the
// build lists under that path. Anything else is refused, so nothing another version (or anyone
// else) served is ever kept or answered as this version's.
async function checked(rel, f, res) {
  if (!res || !res.ok || res.status !== 200 || res.type !== 'basic') throw new Error(rel + ': HTTP ' + (res ? res.status : 'error'));
  const buf = await res.arrayBuffer();
  if (rel === '') {
    if (pageVersion(buf) !== VERSION) throw new Error('the page on the server is another version');
  } else if (buf.byteLength !== f[1] || await sha256(buf) !== f[0]) throw new Error(rel + ': not the file this version lists');
  return new Response(buf, { status: 200, statusText: res.statusText, headers: res.headers });
}

const fresh = (rel, kind) => fetch(at(rel), { cache: kind === 'i' ? 'default' : 'no-cache', credentials: 'same-origin', redirect: 'error' });

self.addEventListener('install', (e) => { e.waitUntil(install()); });
async function install() {
  const mine = await caches.open(CACHE_PREFIX + VERSION);
  const imm = await caches.open(IMMUTABLE);
  const todo = Object.entries(FILES).filter(([, f]) => f[2] === 'p' || (f[2] === 'i' && f[1] <= PRECACHE_MAX));
  let i = 0;
  const lane = async () => {
    while (i < todo.length) {
      const [rel, f] = todo[i++];
      const c = f[2] === 'i' ? imm : mine;
      if (await c.match(at(rel))) continue; // kept by an earlier attempt, checked then
      await c.put(at(rel), await checked(rel, f, await fresh(rel, f[2])));
    }
  };
  await Promise.all([lane(), lane(), lane(), lane(), lane(), lane()]);
}

self.addEventListener('activate', (e) => { e.waitUntil(activate()); });
async function activate() {
  // this version and the one it replaces stay; a tab still open on the older one keeps working
  const meta = await caches.open(META);
  let order = [];
  try { const r = await meta.match(at('_meta/versions')); if (r) order = await r.json(); } catch (e) { order = []; }
  const keep = [VERSION, ...order.filter((v) => v !== VERSION && HEX16.test(v))].slice(0, 2);
  await meta.put(at('_meta/versions'), new Response(JSON.stringify(keep)));
  const imm = Object.entries(FILES).filter(([, f]) => f[2] === 'i').map(([rel]) => at(rel));
  await meta.put(at('_meta/immutable-' + VERSION), new Response(JSON.stringify(imm)));
  const wanted = new Set();
  for (const v of keep) {
    const r = await meta.match(at('_meta/immutable-' + v));
    if (r) for (const u of await r.json()) wanted.add(u);
  }
  for (const k of await caches.keys()) {
    if (k.startsWith(CACHE_PREFIX) && !keep.includes(k.slice(CACHE_PREFIX.length))) await caches.delete(k);
  }
  for (const r of await meta.keys()) {
    const m = /\/_meta\/immutable-([0-9a-f]{16})$/.exec(r.url);
    if (m && !keep.includes(m[1])) await meta.delete(r);
  }
  const ic = await caches.open(IMMUTABLE);
  for (const r of await ic.keys()) if (!wanted.has(r.url)) await ic.delete(r);
  await self.clients.claim();
}

self.addEventListener('message', (e) => {
  const d = e.data || {};
  // the page's "Update ready": the waiting version takes over; the page reloads on controllerchange
  if (d.rikuy === 'activate') self.skipWaiting();
  else if (d.rikuy === 'version' && e.ports[0]) e.ports[0].postMessage({ v: VERSION });
});

const offline = () => new Response('Rikuy is offline and has not kept this file yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
const gone = () => new Response('This copy of Rikuy was replaced by a newer one. Reload the page.', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(ROOT)) return;
  let rel = url.pathname.slice(ROOT.length);
  if (req.method === 'POST' && rel === 'share-target') { e.respondWith(shareTarget(req)); return; }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    if (rel === '' || rel === 'index.html') e.respondWith(page(req));
    return;
  }
  let ver = VERSION, pinned = false;
  const m = /^_v\/([0-9a-f]{16})\/(.+)$/.exec(rel);
  if (m) { ver = m[1]; rel = m[2]; pinned = true; }
  const p = /^tex\/p-([0-9a-f]{16})\.wasm$/.exec(rel);
  if (p) { e.respondWith(pack(p[1], at(rel))); return; }
  const f = FILES[rel];
  if (f && f[2] === 'i') { e.respondWith(immutable(rel, f)); return; }
  if (f && ver === VERSION) { e.respondWith(current(rel, f)); return; }
  if (pinned) e.respondWith(older(ver, rel));
});

// the page: this version's, kept at install; the network only if the cache was lost
async function page(req) {
  const c = await caches.open(CACHE_PREFIX + VERSION);
  const hit = await c.match(at(''));
  if (hit) return hit;
  try { return await fetch(req); } catch (e) { return offline(); }
}
async function current(rel, f) {
  const c = await caches.open(CACHE_PREFIX + VERSION);
  const hit = await c.match(at(rel));
  if (hit) return hit;
  let net;
  try { net = await fresh(rel, f[2]); } catch (e) { return offline(); }
  let res;
  try { res = await checked(rel, f, net); } catch (e) { return gone(); }
  await c.put(at(rel), res.clone());
  return res;
}
async function older(ver, rel) {
  if (!(await caches.has(CACHE_PREFIX + ver))) return gone();
  const hit = await (await caches.open(CACHE_PREFIX + ver)).match(at(rel));
  return hit || gone();
}
async function immutable(rel, f) {
  const c = await caches.open(IMMUTABLE);
  const hit = await c.match(at(rel));
  if (hit) return hit;
  const res = await checked(rel, f, await fresh(rel, 'i'));
  await c.put(at(rel), res.clone());
  return res;
}

// ---- TeX packs from the worker's IndexedDB ------------------------------------------------
function packDb() {
  return new Promise((resolve) => {
    let r;
    try { r = indexedDB.open('galley-tex', 1); } catch (e) { resolve(null); return; }
    r.onupgradeneeded = () => { r.result.createObjectStore('blobs'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
}
async function packKept(h) {
  const d = await packDb();
  if (!d) return null;
  try {
    return await new Promise((resolve) => {
      const q = d.transaction('blobs', 'readonly').objectStore('blobs').get('p:' + h);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    });
  } catch (e) { return null; } finally { d.close(); }
}
// The bytes the worker kept are the pack without its WebAssembly wrapper; the worker's unwrap()
// passes them through as they are. They are answered only if they still hash to the pack's name
// (build_tree.py names a pack by the SHA-256 of these bytes): TeX's synchronous reads never took
// a pack from the cache before, and a damaged or planted entry must not become a file TeX reads.
async function pack(h, href) {
  const z = await packKept(h);
  if (z && (await sha256(z)).startsWith(h)) return new Response(z, { headers: { 'Content-Type': 'application/octet-stream' } });
  return fetch(href, { credentials: 'same-origin' });
}

// ---- files shared to the installed app (manifest share_target) -----------------------------
// The system's share sheet posts the files here. They wait under a random id in 'rikuy-share'
// and the page opens at ./?share-target=<id>, takes them and deletes them (src/pwa.js). Any web
// page can post a form here too, so the page treats them as someone else's, as it does a share
// link, which any page can open as well: the project opens with shell escape restricted. What
// one post may leave is bounded, and what no page took is dropped after a day.
const SHARE_MAX = 64 * 1024 * 1024, SHARE_FILES = 64, SHARE_DAY = 864e5;
async function shareTarget(req) {
  const back = (q) => Response.redirect(at(q || './'), 303);
  let form;
  try { form = await req.formData(); } catch (e) { return back(); }
  const files = form.getAll('files').filter((f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function').slice(0, SHARE_FILES);
  if (!files.length || files.reduce((s, f) => s + f.size, 0) > SHARE_MAX) return back();
  const c = await caches.open(SHARE);
  const now = Date.now();
  for (const r of await c.keys()) { const t = +((/\/_share\/(\d+)-/.exec(r.url) || [])[1] || 0); if (now - t > SHARE_DAY) await c.delete(r); }
  const id = now + '-' + crypto.randomUUID();
  let i = 0;
  for (const f of files) {
    await c.put(at('_share/' + id + '/' + i++), new Response(f, { headers: { 'Content-Type': 'application/octet-stream', 'X-Rikuy-Name': encodeURIComponent(String(f.name || 'shared.tex').slice(0, 255)) } }));
  }
  return back('./?share-target=' + encodeURIComponent(id));
}
