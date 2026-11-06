// The TeX worker's own checks, run in node with no TeX tree (tex/engine.js in a vm, with
// shell.js, tools.js and fflate, and stand-ins for the network and IndexedDB): a mirror pack is
// kept and used only if its bytes match the hash its index names it by, and a compile writes
// only inside its project's folder.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');

// the network: url -> bytes, for synchronous XHR and fetch alike
const served = new Map();
const asBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
class XHR {
  open(method, url) { this.url = url; }
  send() { const b = served.get(this.url); this.status = b ? 200 : 404; this.response = b ? asBuffer(b) : null; }
}
const fetch = async (url) => { const b = served.get(url); return { ok: !!b, status: b ? 200 : 404, body: null, arrayBuffer: async () => asBuffer(b) }; };

// IndexedDB, as much of it as the worker's cache uses
const blobs = new Map();
const later = (q, v) => { setTimeout(() => { q.result = v; if (q.onsuccess) q.onsuccess(); }, 0); return q; };
const store = { get: (k) => later({}, blobs.get(k)), put: (v, k) => { blobs.set(k, v); return later({}, k); } };
const idb = { transaction: () => ({ objectStore: () => store }) };
const indexedDB = { open: () => { const r = {}; setTimeout(() => { r.result = idb; if (r.onsuccess) r.onsuccess(); }, 0); return r; } };

const ctx = { console, URL, TextEncoder, TextDecoder, performance, setTimeout, Blob, Response, DecompressionStream, XMLHttpRequest: XHR, fetch, indexedDB };
ctx.self = ctx;
ctx.__galleyBase = 'https://rikuy.test/tex/';
ctx.postMessage = () => {};
ctx.importScripts = (...urls) => {
  for (const u of urls) {
    const f = u.endsWith('fflate.js') ? 'node_modules/fflate/umd/index.js' : u.endsWith('shell.js') ? 'tex/shell.js' : u.endsWith('tools.js') ? 'tex/tools.js' : null;
    if (f) vm.runInContext(read(f), ctx, { filename: f });
  }
};
vm.createContext(ctx);
vm.runInContext(read('tex/engine.js'), ctx, { filename: 'tex/engine.js' });
const run = (code) => vm.runInContext(code, ctx);

let n = 0;
const ok = async (name, f) => { try { await f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

await ok('the worker\'s SHA-256 is SHA-256', () => {
  for (const len of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000, 65536, 1_000_003]) {
    const b = crypto.randomBytes(len);
    assert.equal(ctx.sha256hex(new Uint8Array(b)), crypto.createHash('sha256').update(b).digest('hex'), 'length ' + len);
  }
  assert.equal(ctx.sha256hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// a mirror on the page's own site, with one pack, and a stranger's copy of its index that names
// a pack of its own choosing by the real pack's hash
const real = new TextEncoder().encode('\\ProvidesPackage{realpkg}\n');
const evil = new TextEncoder().encode('\\ProvidesPackage{realpkg}\\immediate\\write18{evil}\n');
const zReal = zlib.gzipSync(real), zEvil = zlib.gzipSync(evil);
const h = sha16(zReal);
const mirror = (url) => run(`MIRROR = { url: ${JSON.stringify(url)}, index: { packs: [{ f: 'm-${h}.wasm', z: 40, h: '${h}' }] }, byName: new Map(), hits: new Map() }; mirrorPacks.clear();`);
const kept = () => blobs.get('m:' + h);
const same = (a, b) => a && Buffer.from(a).equals(Buffer.from(b));

await ok('a mirror pack whose bytes do not match its hash is neither kept nor used', async () => {
  served.set('https://stranger.example/m-' + h + '.wasm', new Uint8Array(zEvil));
  mirror('https://stranger.example/');
  assert.throws(() => ctx.mirrorPackSync(0), /does not match its hash/);
  assert.equal(kept(), undefined, 'nothing kept under the real pack\'s name');
  await assert.rejects(ctx.mirrorPackAsync(0), /does not match its hash/);
  assert.equal(kept(), undefined);
  assert.equal(run('mirrorPacks.has(0)'), false);
});

await ok('a pack that matches is kept and used', async () => {
  served.set('https://rikuy.test/mirror/m-' + h + '.wasm', new Uint8Array(zReal));
  mirror('https://rikuy.test/mirror/');
  assert.ok(same(ctx.mirrorPackSync(0), real));
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(same(kept(), zReal));
});

await ok('a pack planted in the cache under a real pack\'s name is refused and fetched again', async () => {
  blobs.set('m:' + h, new Uint8Array(zEvil));
  mirror('https://rikuy.test/mirror/');
  await ctx.mirrorPackAsync(0);
  assert.ok(same(run('mirrorPacks.get(0)'), real), 'the real pack is used');
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(same(kept(), zReal), 'and kept in place of the planted one');
  // a cached pack that matches is used without the network
  served.clear();
  mirror('https://rikuy.test/mirror/');
  await ctx.mirrorPackAsync(0);
  assert.ok(same(run('mirrorPacks.get(0)'), real));
});

await ok('a project file name cannot leave the project\'s folder', async () => {
  for (const [p, want] of [['main.tex', 'main.tex'], ['/main.tex', 'main.tex'], ['chapters/intro.tex', 'chapters/intro.tex'], ['a..b/c...tex', 'a..b/c...tex'], ['./x.tex', './x.tex']]) assert.equal(ctx.projectPath(p), want, p);
  for (const bad of ['../x.tex', 'a/../../texlive/texmf-dist/tex/latex/base/article.cls', '/../x', 'a/..', '..', 'a\u0000.tex']) assert.throws(() => ctx.projectPath(bad), /leaves the project/, JSON.stringify(bad));
  const P = '/home/web_user/project/';
  assert.equal(ctx.projectDir('paper|main.tex'), P + 'paper_main.tex');
  for (const id of ['.', '..', '...']) assert.notEqual(ctx.projectDir(id), P + id, id);
  // a compile with such a name is refused before anything is written or cleaned
  const touched = [];
  run('M = null; MAIN = null;');
  ctx.__fs = new Proxy({}, { get: (t, k) => (...a) => { touched.push(k); return null; } });
  run('M = MAIN = { FS: __fs };');
  const job = (files, main = 'main.tex') => ({ id: 'x', project: 'p|main.tex', files: files.map((path) => ({ path, data: 'x' })), main });
  await assert.rejects(ctx.compile(job(['main.tex', '../../../texlive/texmf-dist/tex/latex/base/article.cls'])), /leaves the project/);
  await assert.rejects(ctx.compile(job(['main.tex'], '../main.tex')), /leaves the project/);
  assert.deepEqual(touched, []);
});

console.log(n + '/' + n + ' passed');
