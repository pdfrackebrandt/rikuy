// Galley's TeX engine worker: TeX Live 2026's pdfTeX, XeTeX (+ xdvipdfmx) and LuaHBTeX (the
// BusyTeX WebAssembly build) running over a TeX tree that is fetched in packs only when a file
// is first read, with shell escape answered by shell.js and the programs in tools.js.
//
// Files this worker expects next to it (see build_tree.py):
//   busytex.js, shell.js, tools.js, fflate.js, and the tools' own scripts (gs.js, gnuplot.js, pyodide.js)
//   tree.wasm   the index: { v, wasm: [chunk...], packs: [{f, z, n, h}], files: [[path, size, pack, off, zlen?, kind?]],
//               provides: {package: [packs]}, biber, tools }
//   w-*.wasm    the engine, gzipped and cut under the artifact's per-file limit
//   p-*.wasm    packs: gzip of the concatenated files (Type 1 fonts stored decrypted, kind 1)
//   b-*, t-*    biber and the shell's programs, fetched on first use
// Every file travels as a WebAssembly module with one custom section (see unwrap()).
// Messages in:  {init, base, mirror}, {compile: {id, project, files, main, engine, shellEscape, clean, bibSig}},
//               {prefetch: [packs]}, {exec: {args, files, read, list}} (build scripts and tests)
// Messages out: {status}, {ready}, {result}, {execResult}, {error}

/* global busytex, fflate */
// The page starts this worker from a small blob script (blob workers take the page's own
// security policy, which allows WebAssembly) and tells it where its files live.
const HERE = self.__galleyBase || new URL('.', self.location.href).href;
importScripts(HERE + 'busytex.js', HERE + 'fflate.js', HERE + 'shell.js', HERE + 'tools.js');

const PROJECT = '/home/web_user/project';
const FMT = {
  pdflatex: '/texlive/texmf-dist/texmf-var/web2c/pdftex/pdflatex.fmt',
  xelatex: '/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt',
  lualatex: '/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt'
};
// every directory of the tree gets this mtime, so caches made at build time (fontconfig's)
// match what the worker's file system reports
const TREE_MTIME = 1700000000000;
const ENV = {
  TEXMFDIST: '/texlive/texmf-dist:/texmf/texmf-dist',
  TEXMFVAR: '/texlive/texmf-dist/texmf-var',
  TEXMFCACHE: '/texlive/texmf-dist/texmf-var',
  TEXMFCNF: '/texlive/texmf-dist/web2c',
  FONTCONFIG_PATH: '/texlive',
  FONTCONFIG_FILE: '/texlive/fonts.conf',
  ICU_DATA: '/texlive/',
  TEXLIVE_REMOTE_ENDPOINT: '',
  // TeX Live's list of programs restricted shell escape may run, and xindy: here it reads and
  // writes the project's files only, as makeindex does
  shell_escape_commands: 'bibtex,bibtex8,extractbb,gregorio,kpsewhich,l3sys-query,latexminted,makeindex,memoize-extract.pl,memoize-extract.py,repstopdf,r-mpost,texindy,texosquery-jre8,xindy'
};
const MEM_HEADER = 2 ** 26;
// intermediate files kept between compiles, so an edit usually needs one pass, not three
const KEEP = /\.(aux|bbl|blg|toc|lof|lot|out|nav|snm|vrb|bcf|run\.xml|idx|ind|ilg|glo|gls|glg|acn|acr|alg|nlo|nls|loa|thm|brf|fls|synctex\.gz|mw|pygtex|pygstyle|minted|table|gnuplot)$/i;

const post = (m, t) => postMessage(m, t || []);
const status = (s, extra) => post({ status: s, ...(extra || {}) });

let INDEX = null;
let INDEX_PATHS = new Set();
let BASE = HERE;
let M = null; // the TeX instance running now (MAIN, or a second one while TeX runs TeX)
let MAIN = null; // the first: the one whose file system holds the tree and the projects
const packs = new Map(); // pack number -> Uint8Array (decompressed)
const pending = new Map(); // pack number -> Promise
let readLog = null; // Set of paths read during the current compile (for diagnostics)
const usedPacks = new Set();
let netBytes = 0;

// ---- cache (IndexedDB), so a second session starts without the network ----------------
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
    try {
      const q = d.transaction('blobs', 'readonly').objectStore('blobs').get(key);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}
async function cachePut(key, val) {
  const d = await db();
  if (!d) return;
  try { d.transaction('blobs', 'readwrite').objectStore('blobs').put(val, key); } catch (e) { /* quota: fine */ }
}

async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return fflate.gunzipSync(bytes);
}

// Packs travel wrapped as WebAssembly modules (a header and one custom section); this returns
// the bytes inside.
function unwrap(b) {
  if (!(b[0] === 0 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d)) return b;
  let i = 9; // magic, version, section id
  const leb = () => { let n = 0, shift = 0, x; do { x = b[i++]; n += (x & 0x7f) * 2 ** shift; shift += 7; } while (x & 0x80); return n; };
  leb(); // section size
  const nameLen = leb();
  i += nameLen;
  return b.subarray(i);
}

async function fetchBytes(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load ' + url + ' (HTTP ' + r.status + ')');
  if (!onProgress || !r.body) { const b = new Uint8Array(await r.arrayBuffer()); netBytes += b.length; return unwrap(b); }
  const reader = r.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length; netBytes += value.length;
    onProgress(got);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return unwrap(out);
}

// ---- packs ---------------------------------------------------------------------------
function packInfo(n) { return INDEX.packs[n]; }

async function loadPackAsync(n) {
  if (packs.has(n)) return packs.get(n);
  if (pending.has(n)) return pending.get(n);
  const P = packInfo(n);
  const job = (async () => {
    let z = await cacheGet('p:' + P.h);
    if (!z) { z = await fetchBytes(P.f); cachePut('p:' + P.h, z); }
    const raw = await gunzip(z);
    packs.set(n, raw);
    pending.delete(n);
    return raw;
  })();
  pending.set(n, job);
  return job;
}

// Called from inside TeX (synchronously) when it opens a file whose pack is not here yet.
function loadPackSync(n) {
  if (packs.has(n)) return packs.get(n);
  const P = packInfo(n);
  status('fetch', { pack: n, bytes: P.z });
  const x = new XMLHttpRequest();
  x.open('GET', P.f, false);
  x.responseType = 'arraybuffer';
  x.send();
  if (x.status !== 200) throw new Error('pack ' + P.f + ' HTTP ' + x.status);
  const z = unwrap(new Uint8Array(x.response));
  netBytes += z.length;
  cachePut('p:' + P.h, z);
  const raw = fflate.gunzipSync(z);
  packs.set(n, raw);
  return raw;
}

// Type 1 fonts travel decrypted (encrypted bytes do not compress); this puts both ciphers
// back, giving the original .pfb byte for byte. Layout: "T1X1", segment count, then per
// segment its type, length, the glyph programs' positions and the bytes (see build_tree.py).
function t1xRestore(x) {
  let i = 4;
  const uv = () => { let n = 0, sh = 0, c; do { c = x[i++]; n += (c & 0x7f) * 2 ** sh; sh += 7; } while (c & 0x80); return n; };
  const enc = (buf, a, n, r) => {
    for (let k = a, e = a + n; k < e; k++) { const c = buf[k] ^ (r >> 8); buf[k] = c; r = ((c + r) * 52845 + 22719) & 0xffff; }
  };
  const segs = [];
  let total = 0;
  for (let s = uv(); s > 0; s--) {
    const t = x[i++], n = uv(), nr = uv();
    const ranges = [];
    let prev = 0;
    for (let k = 0; k < nr; k++) { const a = prev + uv(), len = uv(); ranges.push(a, len); prev = a + len; }
    segs.push({ t, d: x.subarray(i, i + n), ranges });
    i += n;
    total += t === 3 ? 2 : 6 + n;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const { t, d, ranges } of segs) {
    out[o] = 0x80; out[o + 1] = t;
    if (t === 3) { o += 2; continue; }
    const n = d.length;
    out[o + 2] = n & 255; out[o + 3] = (n >>> 8) & 255; out[o + 4] = (n >>> 16) & 255; out[o + 5] = (n >>> 24) & 255;
    o += 6;
    out.set(d, o);
    if (t === 2) {
      for (let k = 0; k < ranges.length; k += 2) enc(out, o + ranges[k], ranges[k + 1], 4330);
      enc(out, o, n, 55665);
    }
    o += n;
  }
  return out;
}

// ---- the TeX tree as lazy MEMFS files ------------------------------------------------
function populate(Module) {
  const FS = Module.FS;
  const made = new Set(['/']);
  const mkdirs = (d) => {
    if (made.has(d)) return;
    const parent = d.slice(0, d.lastIndexOf('/')) || '/';
    mkdirs(parent);
    try { FS.mkdir(d); } catch (e) { /* exists */ }
    made.add(d);
  };
  for (const [path, size, pack, off, zlen, kind] of INDEX.files) {
    const cut = path.lastIndexOf('/');
    const dir = path.slice(0, cut) || '/';
    mkdirs(dir);
    let node;
    try { node = FS.createFile(dir, path.slice(cut + 1), {}, true, true); } catch (e) { continue; }
    node.atime = node.mtime = node.ctime = TREE_MTIME; // stable across sessions, so caches keyed on it stay valid
    let data = null;
    Object.defineProperty(node, 'contents', {
      configurable: true,
      enumerable: true,
      get() {
        if (data === null) {
          const raw = loadPackSync(pack);
          data = kind === 1 ? t1xRestore(raw.subarray(off, off + zlen)) : raw.subarray(off, off + size);
          usedPacks.add(pack);
        }
        if (readLog) readLog.add(path);
        return data;
      },
      set(v) { data = v; }
    });
    Object.defineProperty(node, 'usedBytes', {
      configurable: true,
      enumerable: true,
      get() { return data === null ? size : data.length; },
      set(v) { /* a lazy file is never resized */ }
    });
  }
  for (const d of made) { try { const n = FS.lookupPath(d).node; n.atime = n.mtime = n.ctime = TREE_MTIME; n.timestamp = TREE_MTIME; } catch (e) { /* not there */ } }
  FS.mkdirTree(PROJECT);
  try { FS.mkdirTree('/texlive/fontconfig-cache'); } catch (e) { /* exists */ }
  if (MIRROR) mirrorPopulate(Module);
}

// ---- TeX instances ---------------------------------------------------------------------
// The first instance holds the TeX tree and the projects. TeX can run TeX (\write18{pdflatex
// ...}: TikZ's externalization, auto-pst-pdf, standalone's conversion, Asymptote's labels);
// the instance running then cannot start again, so a second one (a third for TeX run from that)
// is made from the same compiled engine and sees the same files through proxy mounts. M is
// whichever instance is running, so everything that reads TeX's memory or files follows it.
let engineModule = null;
const texPool = []; // by depth: texPool[0] = MAIN
let texDepth = 0;
async function newTeX(primary) {
  const out = { stdout: '', stderr: '' };
  const Module = {
    thisProgram: '/bin/busytex',
    noInitialRun: true,
    preRun: [() => {
      Object.assign(Module.ENV, ENV);
      if (primary) populate(Module);
      else { mountTeX(Module.FS); Module.FS.mkdirTree('/bin'); Module.FS.writeFile('/bin/busytex', ''); } // kpathsea starts from the program's own folder
    }],
    instantiateWasm(imports, ok) {
      // TeX's \write18, xdvipdfmx's calls to Ghostscript and every popen() arrive here
      imports.env.shell_escape_dispatch_js = (a, b) => (b < 0 ? pipeHook(a, b) : SHELL.dispatch(cstr(a), b > 1 ? cstr(b) : M.FS.cwd()));
      // kpathsea asks here for a file it did not find in the tree: the full TeX Live mirror
      imports.env.kpse_remote_fetch_js = (namePtr, format) => mirrorFetch(cstr(namePtr), format);
      WebAssembly.instantiate(engineModule, imports).then((inst) => { Module._galleyMalloc = inst.exports.malloc; ok(inst); });
      return {};
    },
    print(...a) { out.stdout += a.join(' ') + '\n'; },
    printErr(...a) { out.stderr += a.join(' ') + '\n'; }
  };
  const T = await busytex(Module);
  T._out = out;
  T._galleyMalloc = Module._galleyMalloc;
  T._pipes = new Map();
  // The first runs set up state the C library keeps for good (stdio buffers, environment);
  // the heap is snapshotted after them and restored after every TeX run, as BusyTeX does.
  const prev = M;
  M = T;
  try {
    const warm = (args) => { try { T.callMain([...args]); } catch (e) { /* exit */ } try { T._flush_streams && T._flush_streams(); } catch (e) { /* ignore */ } };
    warm([]);
    for (const a of ['pdftex', 'xetex', 'luahbtex', 'xdvipdfmx', 'bibtex8', 'kpsewhich']) warm([a, '--version']); // not makeindex: it would read stdin
  } finally { M = prev; }
  T._memHeader = Uint8Array.from(T.HEAPU8.subarray(0, MEM_HEADER));
  T.HEAPU8.fill(0, MEM_HEADER);
  return T;
}
// one more instance, for TeX run from the deepest one now (made between passes)
async function addTeXInstance() {
  if (texPool.length > 2) throw new Error('TeX runs TeX runs TeX: not deeper than that');
  status('tool-fetch', { tool: 'a second TeX' });
  texPool.push(await newTeX(false));
}
// TeX started from TeX's shell: the command line becomes the engine's, and the run happens on
// the instance one level down, in the folder it was started from
const TEX_PROGRAMS = {
  pdflatex: { prog: 'pdflatex', fmt: 'pdflatex' }, 'pdflatex-dev': { prog: 'pdflatex', fmt: 'pdflatex' },
  latex: { prog: 'pdflatex', fmt: 'pdflatex', dvi: true }, 'latex-dev': { prog: 'pdflatex', fmt: 'pdflatex', dvi: true },
  xelatex: { prog: 'xelatex', fmt: 'xelatex', xdv: true }, 'xelatex-dev': { prog: 'xelatex', fmt: 'xelatex', xdv: true },
  lualatex: { prog: 'luahblatex', fmt: 'lualatex', lua: true }, 'lualatex-dev': { prog: 'luahblatex', fmt: 'lualatex', lua: true },
  luahblatex: { prog: 'luahblatex', fmt: 'lualatex', lua: true }
};
function nestedTeX(argv, io, opts) {
  const name = argv[0].replace(/^.*\//, '');
  const P = TEX_PROGRAMS[name];
  if (!P) { io.err('galley: ' + name + ' (plain TeX) is not in this TeX tree\n'); SHELL.state.missing.add(name); return 127; }
  const depth = texDepth + 1;
  const T = texPool[depth];
  if (!T) { SHELL.state.need.add('tex'); io.err('galley: starting a second TeX, the pass runs again\n'); return 1; }
  const args = [P.prog];
  let pdfAfter = false;
  for (const a of argv.slice(1)) {
    if (/^--?(fmt|ini)\b/.test(a)) continue; // the format is ours
    if (/^--?output-format=pdf$/.test(a) && P.dvi) continue;
    if (/^--?no-pdf$/.test(a)) { pdfAfter = false; continue; }
    args.push(a);
  }
  if (P.dvi && !argv.some((a) => /^--?output-format=pdf$/.test(a))) args.splice(1, 0, '-output-format=dvi');
  if (P.xdv) { pdfAfter = !argv.some((a) => /^--?no-pdf$/.test(a)); args.splice(1, 0, '-no-pdf'); }
  if (P.lua) args.splice(1, 0, '--nosocket');
  args.splice(1, 0, '--fmt', FMT[P.fmt]);
  // kpathsea's search path by TeX Live's name for the program (see ENGINES), never a -dev one:
  // the format is the release kernel's
  if (!argv.some((a) => /^--?progname=/.test(a))) args.splice(1, 0, '-progname=' + name.replace(/-dev$/, '').replace(/^luahblatex$/, 'lualatex'));
  // shell escape as asked, else as this compile has it
  if (!argv.some((a) => /^--?(no-)?shell-(escape|restricted)$|^--?(dis|en)able-write18$/.test(a))) args.splice(1, 0, KPSE_VARS.shell_escape === 't' ? '-shell-escape' : '-shell-restricted');
  const jobname = (argv.find((a) => /^--?jobname=/.test(a)) || '').replace(/^--?jobname=/, '').replace(/^"|"$/g, '');
  const prev = M;
  let r;
  status('tool', { tool: name });
  M = T; texDepth = depth;
  const piped = opts && opts.stdin != null;
  flushProxyCache(T.FS);
  try {
    T.FS.chdir(io.env.cwd);
    if (piped) {
      // its terminal: what the caller wrote, then a line marking the end; its output: a file,
      // byte for byte as a pipe would carry it
      const FS = T.FS;
      FS.writeFile('/tmp/galley-stdin', opts.stdin + (!opts.stdin || opts.stdin.endsWith('\n') ? '' : '\n') + '\\immediate\\write16{' + PIPE_END + '}\n');
      FS.writeFile('/tmp/galley-stdout', '');
      FS.close(FS.streams[0]); FS.close(FS.streams[1]);
      FS.open('/tmp/galley-stdin', 'r'); FS.open('/tmp/galley-stdout', 'w');
      try { r = run(args); } finally {
        for (const fd of [0, 1]) { try { FS.close(FS.streams[fd]); } catch (e) { /* closed */ } }
        FS.open('/dev/stdin', 'r'); FS.open('/dev/stdout', 'w');
      }
      const all = new TextDecoder().decode(FS.readFile('/tmp/galley-stdout'));
      const k = all.indexOf(PIPE_END);
      r.stdout = k < 0 ? all : all.slice(0, all[k - 1] === '\n' ? k - 1 : k);
    } else r = run(args);
    // XeTeX's own call of xdvipdfmx (through a pipe): done here, as xelatex does it
    if (pdfAfter && r.code === 0) {
      const xdv = jobname ? jobname + '.xdv' : newestWith('.xdv', io.env.cwd);
      if (xdv && exists(io.env.cwd + '/' + xdv)) run(['xdvipdfmx', '-q', '-o', xdv.replace(/\.xdv$/, '.pdf'), xdv]);
    }
  } catch (e) {
    io.err(String((e && e.message) || e) + '\n'); r = { code: 1, stdout: '', stderr: '' };
  } finally { M = prev; texDepth = depth - 1; }
  if (r.stdout) io.out(r.stdout);
  if (r.code && r.stderr) io.err(r.stderr.slice(-2000));
  return r.code;
}
const PIPE_END = 'GALLEY-PIPE-END';
// a program asy keeps open (its LaTeX for label sizes, Ghostscript for texpath): run on all
// that was written to it so far (see native/patch_asy.py)
// Each run of the same session starts from the files there were when it opened (asy has already
// removed the .aux): what a run wrote is removed before the next, so all runs read the same.
const pipeSessions = new Map(); // command and folder -> names in the folder when it opened
// The same input gives the same output (asy asks for the same label in many pictures, and each
// figure starts from the same preamble), so answers are kept for the compile (pipeCache.clear()).
const pipeCache = new Map();
let pipeCacheSize = 0;
const PIPE_CACHE_MAX = 32 << 20; // characters
const pipeKey = (argv, cwd, input) => argv.join('\0') + '\0' + cwd + '\0' + input;
function pipeKeep(ck, out) {
  pipeCache.set(ck, out);
  pipeCacheSize += ck.length + out.length;
  for (const [k, v] of pipeCache) {
    if (pipeCacheSize <= PIPE_CACHE_MAX) break;
    pipeCache.delete(k); pipeCacheSize -= k.length + v.length;
  }
}
function texPipe(argv, input, cwd) {
  const key = argv.join('\0') + '\0' + cwd;
  const list = () => { try { return M.FS.readdir(cwd).filter((n) => n !== '.' && n !== '..'); } catch (e) { return []; } };
  if (!input || !pipeSessions.has(key)) pipeSessions.set(key, new Set(list()));
  else { const was = pipeSessions.get(key); for (const n of list()) if (!was.has(n)) { try { M.FS.unlink(cwd + '/' + n); } catch (e) { /* a folder */ } } }
  let out = '';
  nestedTeX(argv, { env: { cwd }, out: (t) => { out += t; }, err: () => {} }, { stdin: input });
  return out;
}
function pipeProgram(argv, input, cwd) {
  const name = argv[0].replace(/^.*\//, '');
  const ck = pipeKey(argv, cwd, input);
  const hit = pipeCache.get(ck);
  if (hit !== undefined) { pipeCache.delete(ck); pipeCache.set(ck, hit); return hit; }
  if (TEX_PROGRAMS[name]) {
    const q = asyQuestion(input);
    if (asyRehearsal && q) { asyRehearsal.push({ argv, cwd, input, ...q }); return asyGuess(q.q); }
    const out = texPipe(argv, input, cwd);
    pipeKeep(ck, out);
    return out;
  }
  const out = SHELL.run(argv, cwd, input).out;
  pipeKeep(ck, out);
  return out;
}

// Asymptote asks its LaTeX for each label's size, one at a time, and each answer costs a run of
// TeX on all asy wrote before. So asy first runs as a rehearsal: questions not answered yet are
// written down and get a rough guess, and nothing is drawn (galleySystem fails). Then one run of
// TeX answers all of them, each in its place in what was written, and the real run of asy finds
// its answers ready. Labels that only the real sizes bring up are asked as before.
let asyRehearsal = null;
const Q_OPEN = '\\immediate\\write16{>galleyq<}\n', Q_CLOSE = '\\immediate\\write16{>galleyend<}\n';
function asyQuestion(input) {
  const a = input.lastIndexOf(Q_OPEN);
  if (a < 0 || !input.endsWith(Q_CLOSE)) return null;
  return { t: input.slice(0, a), q: input.slice(a + Q_OPEN.length, input.length - Q_CLOSE.length) };
}
function asyGuess(q) {
  let out = '>galleyq<\n';
  for (const m of q.matchAll(/\\setbox\\ASYbox=\\hbox\{([^\n]*)\}\n/g)) {
    const w = Math.max(1, m[1].replace(/\\[a-zA-Z]+|[{}$^_\s]/g, '').length) * 6;
    out += '>dim(' + w + '.0pt)dim\n>dim(8.0pt)dim\n>dim(2.0pt)dim\n';
  }
  return out + '>galleyend<\n';
}
function asyAnswerAll(asked) {
  // one run for each line of what was written: questions of one figure share it, each new
  // question comes after the last's (asy only adds to what it writes)
  const runs = [];
  for (const x of asked) {
    const r = runs[runs.length - 1];
    if (r && r.argv.join('\0') === x.argv.join('\0') && r.cwd === x.cwd && x.t.startsWith(r.t)) { r.items.push(x); r.t = x.t; }
    else runs.push({ argv: x.argv, cwd: x.cwd, t: x.t, items: [x] });
  }
  for (const r of runs) {
    let input = '', at = '';
    r.items.forEach((x, i) => {
      input += x.t.slice(at.length) + '\\immediate\\write16{>galleyq:' + i + '<}\n\\begingroup\n' + x.q + '\\endgroup\n\\immediate\\write16{>galleyend:' + i + '<}\n';
      at = x.t;
    });
    const out = texPipe(r.argv, input, r.cwd);
    r.items.forEach((x, i) => {
      const b = out.indexOf('>galleyq:' + i + '<'), e = out.indexOf('>galleyend:' + i + '<');
      if (b < 0 || e < b) return;
      const answer = out.slice(b + ('>galleyq:' + i + '<').length, e);
      if (/^! /m.test(answer)) return; // an error: asked on its own in the real run
      pipeKeep(pipeKey(x.argv, x.cwd, x.input), '>galleyq<' + answer + '>galleyend<\n');
    });
  }
}
function newestWith(ext, dir) {
  let best = null, t = -1;
  try { for (const n of M.FS.readdir(dir)) if (n.endsWith(ext)) { const m = M.FS.stat(dir + '/' + n).mtime; if (+m > t) { t = +m; best = n; } } } catch (e) { /* none */ }
  return best;
}

// ---- the full TeX Live mirror (Galley on its own site; see build_tree.py mirror) -----------
let MIRROR_URL = null;
let MIRROR = null;
let mirrorError = null;
const mirrorPacks = new Map();
async function loadMirror(url) {
  try {
    const raw = await gunzip(await fetchBytes(new URL('index.wasm', url).href));
    const index = JSON.parse(new TextDecoder().decode(raw));
    const byName = new Map();
    for (const f of index.files) { const b = f[0].slice(f[0].lastIndexOf('/') + 1); if (!byName.has(b)) byName.set(b, f); }
    MIRROR = { url, index, byName, hits: new Map() };
  } catch (e) { mirrorError = String(e.message || e); MIRROR = null; }
}
// the mirror's whole pdftex.map replaces the trimmed one, so its fonts are found by pdfTeX and
// xdvipdfmx like the local ones
function mirrorPopulate(Module) {
  const f = MIRROR.index.files.find((x) => x[0] === MIRROR.index.map);
  if (!f) return;
  const map = '/texlive/texmf-dist/texmf-var/fonts/map/pdftex/updmap/pdftex.map';
  try {
    const bytes = mirrorBytes(f);
    Module.FS.unlink(map); // a lazy node; replace it with a plain file
    Module.FS.writeFile(map, bytes);
  } catch (e) { mirrorError = 'full font map: ' + e.message; }
}
function mirrorPackSync(n) {
  if (mirrorPacks.has(n)) return mirrorPacks.get(n);
  const P = MIRROR.index.packs[n];
  status('fetch', { pack: 'mirror ' + n, bytes: P.z });
  const x = new XMLHttpRequest();
  x.open('GET', new URL(P.f, MIRROR.url).href, false);
  x.responseType = 'arraybuffer';
  x.send();
  if (x.status !== 200) throw new Error('mirror pack ' + P.f + ' HTTP ' + x.status);
  const z = unwrap(new Uint8Array(x.response));
  netBytes += z.length;
  cachePut('m:' + P.h, z);
  const raw = fflate.gunzipSync(z);
  mirrorPacks.set(n, raw);
  return raw;
}
async function mirrorPackAsync(n) {
  if (mirrorPacks.has(n)) return;
  const P = MIRROR.index.packs[n];
  let z = await cacheGet('m:' + P.h);
  if (!z) { z = await fetchBytes(new URL(P.f, MIRROR.url).href); cachePut('m:' + P.h, z); }
  mirrorPacks.set(n, await gunzip(z));
}
function mirrorBytes(f) {
  const [, size, pack, off, zlen, kind] = f;
  const raw = mirrorPackSync(pack);
  return kind === 1 ? t1xRestore(raw.subarray(off, off + zlen)) : raw.subarray(off, off + size).slice();
}
// kpathsea file formats (kpathsea/types.h) and the suffixes a bare name may need
const KPSE_SUFFIX = { 3: ['.tfm'], 4: ['.afm'], 6: ['.bib'], 7: ['.bst'], 11: ['.map'], 20: ['.ofm'], 23: ['.ovf'], 26: ['.tex', '.sty', '.cls'], 32: ['.pfb', '.pfa'],
  33: ['.vf'], 35: ['.ist'], 36: ['.ttf', '.ttc'], 44: ['.enc'], 45: [''], 47: ['.otf'], 51: ['.lua', '.luc'], 52: ['.fea'] };
function mirrorFetch(name, format) {
  if (!MIRROR || !name || name.length > 255) return 0;
  const key = format + '/' + name;
  let path = MIRROR.hits.get(key);
  if (path === undefined) {
    path = null;
    const base = name.slice(name.lastIndexOf('/') + 1);
    for (const c of [base, ...(KPSE_SUFFIX[format] || []).map((e) => base + e)]) {
      const f = MIRROR.byName.get(c);
      if (!f) continue;
      try {
        const bytes = mirrorBytes(f);
        const p = f[0];
        MAIN.FS.mkdirTree(p.slice(0, p.lastIndexOf('/')));
        MAIN.FS.writeFile(p, bytes);
        // keep the tree's directory times, which font caches are keyed on
        for (let d = p.slice(0, p.lastIndexOf('/')); d.length > 1; d = d.slice(0, d.lastIndexOf('/'))) {
          try { const nd = MAIN.FS.lookupPath(d).node; nd.mtime = nd.atime = nd.ctime = TREE_MTIME; } catch (e) { break; }
        }
        path = p;
        if (readLog) readLog.add(p);
      } catch (e) { path = null; }
      break;
    }
    MIRROR.hits.set(key, path);
  }
  if (!path || !M._galleyMalloc) return 0;
  const b = new TextEncoder().encode(path);
  const ptr = M._galleyMalloc(b.length + 1);
  M.HEAPU8.set(b, ptr);
  M.HEAPU8[ptr + b.length] = 0;
  return ptr;
}

async function boot(base) {
  BASE = base;
  status('index');
  const idx = await gunzip(await fetchBytes(HERE + 'tree.wasm'));
  INDEX = JSON.parse(new TextDecoder().decode(idx));
  INDEX_PATHS = new Set(INDEX.files.map((f) => f[0]));
  if (MIRROR_URL) await loadMirror(MIRROR_URL);
  INDEX.packs.forEach((p) => { p.f = new URL(p.f, base).href; });

  // the engine itself (about 11 MB to download, once)
  let wasm = await cacheGet('w:' + INDEX.wasmHash);
  if (!wasm) {
    const total = INDEX.wasm.reduce((s, c) => s + c.z, 0);
    const parts = [];
    let done = 0;
    for (const c of INDEX.wasm) {
      const b = await fetchBytes(new URL(c.f, base).href, (got) => status('engine', { got: done + got, total }));
      done += b.length;
      parts.push(b);
    }
    const z = new Uint8Array(done);
    let o = 0;
    for (const p of parts) { z.set(p, o); o += p.length; }
    wasm = await gunzip(z);
    cachePut('w:' + INDEX.wasmHash, wasm);
  }
  status('compile-engine');
  const wasmModule = await WebAssembly.compile(wasm);
  wasm = null;

  // the core pack: what nearly every document reads
  status('core');
  await Promise.all((INDEX.core || []).map((n) => loadPackAsync(n)));

  engineModule = wasmModule;
  M = MAIN = await newTeX(true);
  texPool[0] = MAIN;
  await restoreFontCaches();
}

// LuaTeX's font loader (luaotfload) turns each OpenType font into a Lua table the first time it
// is used, which takes a second or two per font; the tables it writes are kept in IndexedDB and
// put back at the next start, as they would stay on a disk.
const LUACACHE = '/texlive/texmf-dist/texmf-var/luatex-cache/generic/fonts/otl';
let savedLuc = new Set();
async function restoreFontCaches() {
  const saved = await cacheGet('luacache');
  if (!saved) return;
  mkdirp(LUACACHE);
  for (const [name, bytes] of Object.entries(saved)) {
    try { if (!exists(LUACACHE + '/' + name)) M.FS.writeFile(LUACACHE + '/' + name, bytes); savedLuc.add(name); } catch (e) { /* skip */ }
  }
}
async function saveFontCaches() {
  let names;
  try { names = M.FS.readdir(LUACACHE).filter((n) => n.endsWith('.luc')); } catch (e) { return; }
  const fresh = names.filter((n) => !savedLuc.has(n) && !INDEX_PATHS.has(LUACACHE + '/' + n));
  if (!fresh.length) return;
  const saved = (await cacheGet('luacache')) || {};
  let total = Object.values(saved).reduce((a, b) => a + b.length, 0);
  for (const n of fresh) {
    const b = readBytes(LUACACHE + '/' + n);
    if (!b || total + b.length > 40e6) continue;
    saved[n] = b.slice(); total += b.length; savedLuc.add(n);
  }
  await cachePut('luacache', saved);
}

// a C string in TeX's memory
// Pipes: the binary's popen() and pclose() come here (patch_wasm.py), for TeX's \\input|"cmd"
// and \\openout to |"cmd", Lua's io.popen and xdvipdfmx asking Ghostscript where PSTricks labels
// go. A read pipe runs the command at once and its FILE reads a file holding what it printed; a
// write pipe's FILE writes a file that becomes the command's input when the pipe is closed.
// (TeX checks restricted shell escape before it opens one.) Names come from TeX's own malloc:
// the heap is put back after every run, which frees them.
let pipeSeq = 0, pipeOpening = null; // each instance keeps its open pipes in M._pipes: FILE* -> { cmd, path, write, code }
function pipeHook(a, op) {
  if (op === -1 || op === -2) {
    const cmd = cstr(a), write = op === -2;
    const path = '/tmp/galley-pipe-' + (++pipeSeq);
    let code = 0;
    if (write) M.FS.writeFile(path, '');
    else { const r = SHELL.pipe(cmd, M.FS.cwd()); code = r.code; M.FS.writeFile(path, r.out); }
    pipeOpening = { cmd, path, write, code };
    const name = new TextEncoder().encode(path + '\0');
    const p = M._galleyMalloc(name.length);
    M.HEAPU8.set(name, p);
    return p;
  }
  if (op === -3) { if (a && pipeOpening) M._pipes.set(a, pipeOpening); pipeOpening = null; return 0; }
  if (op === -4) {
    const p = M._pipes.get(a);
    if (!p) return -1;
    M._pipes.delete(a);
    let code = p.code;
    if (p.write) code = SHELL.pipe(p.cmd, M.FS.cwd(), new TextDecoder().decode(M.FS.readFile(p.path))).code;
    try { M.FS.unlink(p.path); } catch (e) { /* gone */ }
    return (code & 255) << 8; // a wait() status, as pclose returns
  }
  return -1;
}

function cstr(ptr) {
  const H = M.HEAPU8;
  let e = ptr;
  while (H[e]) e++;
  return new TextDecoder().decode(H.subarray(ptr, e));
}

// files of the TeX tree by name, for kpsewhich asked through the shell
let BYNAME = null;
function treeLookup(name) {
  if (!BYNAME) {
    BYNAME = new Map();
    for (const f of INDEX.files) { const b = f[0].slice(f[0].lastIndexOf('/') + 1); if (!BYNAME.has(b)) BYNAME.set(b, f[0]); }
  }
  const n = name.replace(/^.*\//, '');
  return BYNAME.get(n) || BYNAME.get(n + '.tex') || null;
}
const KPSE_VARS = {
  TEXMFOUTPUT: '', TEXMFHOME: '', TEXMFDIST: '/texlive/texmf-dist', TEXMFVAR: '/texlive/texmf-dist/texmf-var', TEXMFSYSVAR: '/texlive/texmf-dist/texmf-var',
  TEXMFCONFIG: '/texlive/texmf-dist/texmf-config', TEXMFLOCAL: '', TEXMFCACHE: '/texlive/texmf-dist/texmf-var', openout_any: 'p', openin_any: 'a',
  shell_escape: 'p', shell_escape_commands: ENV.shell_escape_commands,
  max_print_line: '79', TEXMF_OUTPUT_DIRECTORY: '', TEXMFROOT: '/texlive', SELFAUTOPARENT: '/texlive', SELFAUTOLOC: '/texlive/bin'
};
const TOOLS = { gs: null, gnuplot: null, python: null, dvips: null, asy: null, tex: { run: (argv, io) => nestedTeX(argv, io) }, pdfcrop: { run: (argv, io, h) => pdfcrop(argv, io, h) } };
const SHELL = self.GalleyShell({ FS: () => M.FS, treeLookup, tools: TOOLS, vars: KPSE_VARS });

function run(args, beforeRestore) {
  const FS = M.FS;
  M._out.stdout = ''; M._out.stderr = '';
  M._pipes = new Map(); pipeOpening = null;
  let code;
  // callMain prepends argv[0] to the array it is given, so it gets a copy
  try { code = M.callMain([...args]); } catch (e) {
    code = typeof e === 'number' ? e : (e && e.status != null ? e.status : 1);
    if (!(e && (e.name === 'ExitStatus' || e.status != null) || typeof e === 'number')) M._out.stderr += '\n[crash] ' + ((e && e.stack) || e);
  }
  try { M._flush_streams && M._flush_streams(); } catch (e) { /* ignore */ }
  // a program that exits does not close what it opened; without this, every run leaks
  // descriptors until opening files fails
  for (const st of FS.streams || []) if (st && st.fd > 2) { try { FS.close(st); } catch (e) { /* already closed */ } }
  if (beforeRestore) beforeRestore();
  M.HEAPU8.fill(0);
  M.HEAPU8.set(M._memHeader);
  return { code, stdout: M._out.stdout, stderr: M._out.stderr };
}

const exists = (p) => { try { M.FS.stat(p); return true; } catch (e) { return false; } };
const readText = (p) => (exists(p) ? M.FS.readFile(p, { encoding: 'utf8' }) : '');
const readBytes = (p) => (exists(p) ? M.FS.readFile(p) : null);

function rmTree(dir, keep) {
  const FS = M.FS;
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const p = dir + '/' + name;
    const st = FS.stat(p);
    if (FS.isDir(st.mode)) { rmTree(p, keep); try { FS.rmdir(p); } catch (e) { /* not empty */ } }
    else if (!keep || !keep(p)) FS.unlink(p);
  }
}
function mkdirp(d) {
  const parts = d.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) { cur += '/' + p; if (!exists(cur)) M.FS.mkdir(cur); }
}

// ---- biber -------------------------------------------------------------------------
// biblatex's default backend is biber, a Perl program; BusyTeX ships Perl and biber as their
// own WebAssembly module. It is fetched the first time a document needs it, and each run
// gets a fresh instance (Perl tears itself down on exit).
let biberP = null;
function biberAssets() {
  if (!biberP) {
    biberP = (async () => {
      const B = INDEX.biber;
      status('biber-fetch');
      const get = async (x) => {
        let z = await cacheGet('b:' + x.h);
        if (!z) { z = await fetchBytes(new URL(x.f, BASE).href); cachePut('b:' + x.h, z); }
        return gunzip(z);
      };
      importScripts(HERE + 'biber.js');
      const [wasm, data] = await Promise.all([get(B.wasm), get(B.data)]);
      const mod = await WebAssembly.compile(wasm);
      const dataUrl = URL.createObjectURL(new Blob([data]));
      return { mod, dataUrl };
    })();
    biberP.catch(() => { biberP = null; });
  }
  return biberP;
}
async function runBiber(cwd, base, files, sub) {
  let log = '';
  try {
    const { mod, dataUrl } = await biberAssets();
    const Module = {
      noInitialRun: true,
      locateFile: (p) => (p.endsWith('.data') ? dataUrl : p),
      instantiateWasm(imports, ok) { WebAssembly.instantiate(mod, imports).then((inst) => ok(inst)); return {}; },
      print: (t) => { log += t + '\n'; },
      printErr: (t) => { log += t + '\n'; }
    };
    const B = await self.biber(Module);
    const work = '/home/web_user/biber';
    const mk = (d) => { const parts = d.split('/').filter(Boolean); let c = ''; for (const x of parts) { c += '/' + x; try { B.FS.mkdir(c); } catch (e) { /* exists */ } } };
    mk(work);
    B.FS.chdir(work);
    // the control file, and the bibliography files as the .bcf names them (paths relative to the document)
    B.FS.writeFile(work + '/' + base + '.bcf', M.FS.readFile(cwd + '/' + base + '.bcf'));
    for (const f of files) {
      if (!/\.(bib|bibtex|ris|xml|dbx|bbx|cbx|lbx)$/i.test(f.path)) continue;
      // biber looks for data files relative to the document's folder
      const rel = sub && f.path.startsWith(sub + '/') ? f.path.slice(sub.length + 1) : f.path.replace(/^(\.\.\/)+/, '');
      const p = work + '/' + rel;
      mk(p.slice(0, p.lastIndexOf('/')));
      B.FS.writeFile(p, f.data);
    }
    let code = 0;
    try { code = B.callMain(['/opt/perl-wasm/bin/biber', '--output-format=bbl', '--outfile=' + base + '.bbl', '--nolog', base + '.bcf']); }
    catch (e) { code = e && typeof e.status === 'number' ? e.status : 1; }
    const out = work + '/' + base + '.bbl';
    let bbl = null;
    try { bbl = B.FS.readFile(out); } catch (e) { bbl = null; }
    return { code: bbl ? code : (code || 1), log, bbl };
  } catch (e) {
    return { code: 1, log: log + '\nbiber could not run: ' + ((e && e.message) || e), bbl: null };
  }
}

// Projects keep their intermediate files (aux, bbl, toc) between compiles under their own dir;
// the few most recent projects stay, older ones are dropped.
function projectDir(id) { return PROJECT + '/' + String(id || 'doc').replace(/[^\w.-]+/g, '_'); }
const recent = [];
const bibSigs = new Map(); // project dir -> signature of its .bib files when bibtex/biber last ran
function touchProject(dir) {
  const i = recent.indexOf(dir);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(dir);
  while (recent.length > 3) {
    const old = recent.pop();
    try { rmTree(old, null); M.FS.rmdir(old); } catch (e) { /* gone */ }
    bibSigs.delete(old);
  }
}

// Citations recorded by a run: the main .aux and the .aux files it pulls in (\include).
function citesIn(auxPath, seen = new Set()) {
  if (seen.has(auxPath)) return '';
  seen.add(auxPath);
  const t = readText(auxPath);
  let out = (t.match(/\\(?:citation|abx@aux@cite)\{[^}]*\}(?:\{[^}]*\})?/g) || []).join();
  const dir = auxPath.includes('/') ? auxPath.slice(0, auxPath.lastIndexOf('/') + 1) : '';
  for (const m of t.matchAll(/\\@input\{([^}]*)\}/g)) out += '|' + citesIn(dir + m[1], seen);
  return out;
}

// only what asks for another pass: a reference that is simply undefined stays undefined
const RERUN = /Rerun to get|rerun LaTeX|Label\(s\) may have changed|run LaTeX again/i;
// biblatex's "Please (re)run Biber ... and rerun LaTeX afterwards" asks for biber, not TeX:
// when biber could not help, another TeX pass changes nothing
const needsRerun = (log) => RERUN.test(log) && !/Please \(re\)run Biber/.test(log);

// latexmk's other reason for a pass: TeX read a file it then wrote with other content, or looked
// for one it then made. LaTeX itself warns only when labels change, so without this a table of
// contents or a list of figures keeps the page numbers of the pass before (the corpus's
// Analysis-I.tex: "Vorwort 3" here, 4 in TeX Live's latexmk). TeX's recorder (-recorder, the
// .fls) lists what a pass read and wrote, in order; a file written before it was read (the .aux
// LaTeX checks at \end{document}) was not an input.
const NOT_REREAD = /\.(log|pdf|xdv|dvi|fls|synctex|synctex\.gz)$/i;
const TRIVIAL_AUX = '\\relax \n\\gdef \\@abspage@last{1}\n';
function flsFiles(fls) {
  const pwd = (fls.match(/^PWD (.*)$/m) || [])[1] || '';
  const abs = (p) => (p.startsWith('/') ? p : pwd + '/' + p.replace(/^\.\//, ''));
  const first = new Map();
  const written = new Set();
  for (const m of fls.matchAll(/^(INPUT|OUTPUT) (.*)$/gm)) {
    const p = abs(m[2]);
    if (!first.has(p)) first.set(p, m[1]);
    if (m[1] === 'OUTPUT' && !NOT_REREAD.test(p)) written.add(p);
  }
  return { abs, first, written };
}
// the contents of what the last pass wrote, as the next pass will find them
function rereadState(fls) {
  const s = new Map();
  if (fls) for (const p of flsFiles(fls).written) if (exists(p)) s.set(p, readText(p));
  return s;
}
function rewrote(fls, log, before) {
  if (!fls) return false;
  const { abs, first, written } = flsFiles(fls);
  for (const p of written) if (first.get(p) === 'INPUT' && before.get(p) !== readText(p)) return true;
  for (const m of log.matchAll(/^No file (.+)\.$/gm)) if (written.has(abs(m[1]))) return true;
  return false;
}

// ---- engines -------------------------------------------------------------------------
// pdfLaTeX writes PDF itself; XeLaTeX writes XDV, which xdvipdfmx turns into PDF; LuaLaTeX
// (LuaHBTeX, as in TeX Live) writes PDF itself.
// -progname: kpathsea picks its search path by the program's name (texmf.cnf's TEXINPUTS.xelatex
// is tex/{xelatex,latex,xetex,generic,}//). Run as an applet of BusyTeX's one binary, the name
// would be "busytex", whose default path puts tex/generic first: XeLaTeX then read PSTricks'
// generic pstricks.con instead of tex/xelatex's, wrote ps: specials xdvipdfmx cannot draw, and
// every PSTricks figure came out blank. The names are TeX Live's own.
const ENGINES = {
  pdflatex: { label: 'pdfLaTeX', out: 'pdf', cmd: (b, se) => ['pdflatex', '-progname=pdflatex', '-synctex=1', '-recorder', se, '--interaction=nonstopmode', '--file-line-error', '--fmt', FMT.pdflatex, b + '.tex'] },
  xelatex: { label: 'XeLaTeX', out: 'xdv', cmd: (b, se) => ['xelatex', '-progname=xelatex', '-synctex=1', '-recorder', se, '--interaction=nonstopmode', '--file-line-error', '-no-pdf', '--fmt', FMT.xelatex, b + '.tex'] },
  lualatex: { label: 'LuaLaTeX', out: 'pdf', cmd: (b, se) => ['luahblatex', '--progname=lualatex', '-synctex=1', '-recorder', se, '--interaction=nonstopmode', '--file-line-error', '--nosocket', '--fmt', FMT.lualatex, b + '.tex'] },
  // LaTeX writing DVI, then dvips and ps2pdf: the classic route, PSTricks' own
  latex: { label: 'LaTeX (dvips)', out: 'dvi', cmd: (b, se) => ['pdflatex', '-progname=latex', '-synctex=1', '-recorder', se, '--interaction=nonstopmode', '--file-line-error', '-output-format=dvi', '--fmt', FMT.pdflatex, b + '.tex'] }
};
const ENGINE_NAMES = { pdflatex: 'pdflatex', pdftex: 'pdflatex', latex: 'latex', dvips: 'latex', 'latex-dvips': 'latex', xelatex: 'xelatex', xetex: 'xelatex', lualatex: 'lualatex', luatex: 'lualatex', luahblatex: 'lualatex', luahbtex: 'lualatex' };

const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, '$1');
// The engine a document asks for: a magic comment ("% !TeX program = xelatex") wins; otherwise
// what the preamble loads decides. Packages that only run on one engine pick it; fontspec and
// the other Unicode font packages need XeTeX or LuaTeX (XeTeX: the faster of the two); PSTricks
// needs a driver that understands PostScript, which xdvipdfmx is (it hands it to Ghostscript).
function pickEngine(job, mainText, allText) {
  const asked = ENGINE_NAMES[String(job.engine || '').toLowerCase()];
  if (asked) return { engine: asked, why: 'chosen' };
  const magic = /^[ \t]*%+[ \t]*!\s*TEX\s+(?:TS-)?program\s*=\s*([\w-]+)/im.exec(mainText.slice(0, 8000));
  if (magic && ENGINE_NAMES[magic[1].toLowerCase()]) return { engine: ENGINE_NAMES[magic[1].toLowerCase()], why: 'magic comment' };
  const t = stripComments(allText);
  const pkgs = new Set();
  for (const m of t.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) for (const x of m[1].split(',')) pkgs.add(x.trim());
  const cls = (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(t) || [])[1] || '';
  const has = (...names) => names.some((n) => pkgs.has(n));
  if (has('luacode', 'luatexbase', 'luaotfload', 'luatexja', 'luatexja-fontspec', 'luatexja-preset', 'lua-ul', 'luamplib', 'lua-visual-debug', 'luacolor', 'selnolig', 'chickenize', 'lualatex-math', 'luatextra', 'luaxml', 'lua-widow-control', 'emoji', 'ctable-lua') ||
      /^(ltj|lua)/.test(cls) || /\\(directlua|luaexec|luadirect)\b/.test(t)) return { engine: 'lualatex', why: 'LuaTeX packages' };
  if (has('xeCJK', 'xltxtra', 'xunicode', 'mathspec', 'xetexko', 'bidi', 'xepersian', 'xgreek', 'zhspacing', 'xeindex', 'arabxetex', 'ucharclasses') ||
      /^(xe|ctex|ctexart|ctexrep|ctexbook)/i.test(cls) || has('ctex') || /\\XeTeX\w+/.test(t)) return { engine: 'xelatex', why: 'XeTeX packages' };
  if (has('fontspec', 'unicode-math', 'polyglossia', 'fontsetup', 'realscripts', 'newunicodechar-fontspec') || /\\(setmainfont|setsansfont|setmonofont|newfontfamily|setmathfont)\b/.test(t))
    return { engine: 'xelatex', why: 'fontspec' };
  const pst = [...pkgs].some((x) => /^(pstricks|pstcol)$|^pst(ricks)?-/.test(x)) && !has('pst-pdf', 'auto-pst-pdf', 'pdftricks', 'pdftricks2');
  if (pst) return { engine: 'xelatex', why: 'PSTricks' };
  return { engine: 'pdflatex', why: 'default' };
}

// Programs TeX asked for whose output it reads on its next pass (makeindex, bibtex through the
// shell), and the indexes latexmk would make: run now, in the folder TeX ran them from. True
// when a file in that folder changed. xindy goes through the shell (tools.js); a glossary's
// call (retry) is retried as makeglossaries does.
function runPrograms(jobs, runs) {
  let changed = false;
  for (const j of jobs) {
    const before = folderSig(j.cwd);
    try { M.FS.chdir(j.cwd); } catch (e) { continue; }
    status('tool', { tool: j.argv[0] });
    if (XINDY_PROGS.test(j.argv[0])) {
      let argv = j.argv, x = SHELL.run(argv, j.cwd);
      if (j.retry) {
        const said = () => x.out + x.err;
        if (x.code && /Cannot locate xindy module for language \S+ in codepage/.test(said())) x = SHELL.run(argv = dropOption(argv, '-C'), j.cwd);
        const m = /Cannot locate xindy module for language (\S+?)\.?\s/.exec(said());
        if (x.code && m && m[1] !== 'general') x = SHELL.run(argv = [...dropOption(dropOption(argv, '-C'), '-L'), '-L', 'general'], j.cwd);
      }
      runs.push({ cmd: j.argv[0], code: x.code, log: (x.out + x.err).slice(-3000) });
    } else {
      const r = run(j.argv);
      runs.push({ cmd: j.argv[0], code: r.code, log: (r.stdout + r.stderr).slice(-3000) });
    }
    if (folderSig(j.cwd) !== before) changed = true;
  }
  return changed;
}
const XINDY_PROGS = /^(xindy|texindy)$/;
function dropOption(argv, opt) {
  const out = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === opt) { i++; continue; } out.push(argv[i]); }
  return out;
}
function folderSig(d) {
  let sig = '';
  try {
    for (const n of M.FS.readdir(d).sort()) {
      if (n === '.' || n === '..' || /\.(log|pdf|xdv|synctex\.gz)$/.test(n)) continue;
      const st = M.FS.stat(d + '/' + n);
      if (M.FS.isFile(st.mode)) sig += n + ':' + st.size + ':' + quickHash(M.FS.readFile(d + '/' + n)) + ';';
    }
  } catch (e) { /* gone */ }
  return sig;
}
function quickHash(b) { let h = 2166136261; for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619); return (h >>> 0).toString(36); }

// What latexmk does for indexes: makeindex for \makeindex (.idx), each glossary the .aux
// declares (\@newglossary, with the style \@istfilename names: xindy for an .xdy, called as
// makeglossaries calls it), and nomencl (.nlo). imakeidx names in the log each index it could not
// make itself (no shell escape for its program): that command runs. A program runs when its
// input changed since it last ran; true when its output changed.
const indexSigs = new Map(); // project dir -> {input file: hash it was run on}
// makeindex run through the shell (imakeidx) counts as having processed its input
function noteIndexInputs(jobs, dir) {
  const seen = indexSigs.get(dir) || {};
  indexSigs.set(dir, seen);
  for (const j of jobs) {
    if (j.argv[0] !== 'makeindex') continue;
    let inp = j.argv.slice(1).filter((x, i, a) => !x.startsWith('-') && !(i > 0 && /^-[sotp]$/.test(a[i - 1]))).pop();
    if (!inp) continue;
    if (!/\.[^./]+$/.test(inp)) inp += '.idx';
    const p = inp.startsWith('/') ? inp : j.cwd + '/' + inp;
    if (exists(p)) seen[p.slice(p.lastIndexOf('/') + 1)] = quickHash(M.FS.readFile(p));
  }
}
// so does xindy, wherever it ran from (tools.js)
function noteIndexed(path) {
  const dir = path.slice(0, path.lastIndexOf('/')) || '/';
  const seen = indexSigs.get(dir) || {};
  indexSigs.set(dir, seen);
  try { seen[path.slice(path.lastIndexOf('/') + 1)] = quickHash(MAIN.FS.readFile(path)); } catch (e) { /* gone */ }
}
// a log's lines as TeX wrote them before it broke them at max_print_line (79)
function unwrapLog(log) {
  return log.split('\n').reduce((acc, line) => {
    if (acc.length && acc[acc.length - 1].length === 79) acc[acc.length - 1] += line; else acc.push(line);
    return acc;
  }, []).join('\n');
}
// makeglossaries' names for babel's languages, and its codepages for languages xindy only
// has some for
const XDY_LANG = { american: 'english', austrian: 'german', brazil: 'portuguese', brazilian: 'portuguese', british: 'english', canadian: 'english', canadien: 'french',
  francais: 'french', frenchb: 'french', germanb: 'german', lsorbian: 'lower-sorbian', magyar: 'hungarian', naustrian: 'german', ngermanb: 'german', ngerman: 'german',
  norsk: 'norwegian', portuges: 'portuguese', russianb: 'russian', slovene: 'slovenian', UKenglish: 'english', USenglish: 'english', ukraineb: 'ukrainian', usorbian: 'upper-sorbian' };
const XDY_CODEPAGE = { dutch: 'ij-as-ij', german: 'din5007', gypsy: 'northrussian', mongolian: 'cyrillic', slovak: 'small', spanish: 'modern', vietnamese: 'utf8' };
function glossaryXindy(ist, lang, cp, log, out, inp) {
  lang = XDY_LANG[lang] || lang || '';
  cp = cp || '';
  if (cp === '' || /^utf8|latin\d+|cp\d+$/.test(cp)) {
    if (XDY_CODEPAGE[lang]) cp = cp ? XDY_CODEPAGE[lang] + '-' + cp : XDY_CODEPAGE[lang];
    else if (!cp && ['hausa', 'klingon', 'latin'].includes(lang)) cp = 'utf8';
  } else if (lang === 'german' && !/din5007|duden|braille/.test(cp)) cp = 'din5007-' + cp;
  return ['xindy', ...(lang ? ['-L', lang] : []), ...(cp ? ['-C', cp] : []), '-I', 'xindy', '-M', ist.replace(/\.xdy$/, ''), '-t', log, '-o', out, inp];
}
async function indexTools(base, dir, runs) {
  const seen = indexSigs.get(dir) || {};
  indexSigs.set(dir, seen);
  const jobs = [];
  const add = (input, argv, more) => {
    if (!exists(input)) return;
    const h = quickHash(M.FS.readFile(input));
    if (seen[input] === h) return;
    seen[input] = h;
    jobs.push(Object.assign({ argv }, more));
  };
  // imakeidx: "Remember to run pdflatex again after calling `texindy -L german main.idx'"
  const named = new Set();
  for (const m of unwrapLog(readText(base + '.log')).matchAll(/Package imakeidx Warning: Remember to run \S+ again after calling\s*\n\(imakeidx\)\s*`([^']+)'/g)) {
    const argv = m[1].trim().split(/\s+/);
    const inp = argv[argv.length - 1];
    if (!/^(makeindex|xindy|texindy)$/.test(argv[0]) || !/\.idx$/.test(inp)) continue;
    named.add(inp);
    add(inp, argv);
  }
  if (!named.has(base + '.idx')) add(base + '.idx', ['makeindex', '-o', base + '.ind', base + '.idx']);
  add(base + '.nlo', ['makeindex', base + '.nlo', '-s', 'nomencl.ist', '-o', base + '.nls']);
  const aux = readText(base + '.aux');
  const ist = (/\\@istfilename\{([^}]*)\}/.exec(aux) || [])[1];
  const letter = /\\@glsorder\{letter\}/.test(aux);
  const of = (cs) => { const o = {}; for (const m of aux.matchAll(new RegExp('\\\\' + cs + '\\s*\\{([^}]+)\\}\\{([^}]*)\\}', 'g'))) o[m[1]] = m[2]; return o; };
  const langs = of('@xdylanguage'), cps = of('@gls@codepage');
  for (const m of aux.matchAll(/\\@newglossary\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g)) {
    const [, type, lg, out, inp] = m;
    if (ist && /\.xdy$/.test(ist)) add(base + '.' + inp, glossaryXindy(ist.replace(/^"(.*)"\.xdy$/, '$1.xdy'), langs[type], cps[type], base + '.' + lg, base + '.' + out, base + '.' + inp), { retry: true });
    else add(base + '.' + inp, ['makeindex', ...(ist ? ['-s', ist] : []), ...(letter ? ['-l'] : []), '-t', base + '.' + lg, '-o', base + '.' + out, base + '.' + inp]);
  }
  if (!jobs.length) return false;
  if (jobs.some((j) => XINDY_PROGS.test(j.argv[0])) && !TOOLS.xindy) {
    status('tool-fetch', { tool: TOOL_NAMES.xindy });
    await loadTool('xindy').catch((e) => runs.push({ cmd: 'xindy', code: 1, log: 'could not load: ' + e.message }));
  }
  const cwd = M.FS.cwd();
  return runPrograms(jobs.map((j) => Object.assign({ cwd }, j)), runs);
}

// Asymptote: asymptote.sty writes each figure as <job>-<n>.asy, which asy draws (a .pdf, or with
// inline labels a .tex and its _0.pdf) for the next pass, as latexmk's asy rule runs it. A figure
// is drawn again only when its .asy changed.
const asySigs = new Map(); // project dir -> {file: hash of the .asy it was drawn from}
const ASY_OUT = /-\d+(_\d+)?\.(asy|pdf|eps|tex|pre)$/;
// asy with its labels answered ahead: rehearsals until no new label is asked (see
// asyRehearsal), three at most, then the real run. A program it started that was not loaded yet
// (dvips for texpath and 3D labels, a second TeX) is loaded and the drawing made again.
async function asyRun(argv, cwd, stdin) {
  for (let k = 0; k < 3; k++) {
    const asked = asyRehearsal = [];
    try { SHELL.run(argv, cwd, stdin); } finally { asyRehearsal = null; }
    if (!asked.length) break;
    asyAnswerAll(asked);
  }
  let r = SHELL.run(argv, cwd, stdin);
  for (let k = 0; k < 2 && r.code && SHELL.state.need.size; k++) {
    const want = [...SHELL.state.need];
    SHELL.state.need.clear();
    for (const t of want) {
      status('tool-fetch', { tool: TOOL_NAMES[t] || t });
      await (t === 'tex' ? addTeXInstance() : loadTool(t)).catch(() => {});
    }
    r = SHELL.run(argv, cwd, stdin);
  }
  return r;
}
async function asyFigures(base, dir, runs) {
  let names;
  try { names = M.FS.readdir('.'); } catch (e) { return false; }
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d+\\.asy$');
  const seen = asySigs.get(dir) || {};
  asySigs.set(dir, seen);
  const todo = [];
  for (const n of names) {
    if (!re.test(n)) continue;
    const h = quickHash(M.FS.readFile(n));
    const b = n.slice(0, -4);
    const drawn = exists(b + '.pdf') || exists(b + '.eps') || exists(b + '.tex');
    if (seen[n] === h && drawn) continue;
    todo.push([n, h]);
  }
  if (!todo.length) return false;
  // texpath and 3D labels go through latex, dvips and Ghostscript
  const paths = todo.some(([n]) => /\btexpath\b|\bimport\s+(three|graph3|solids|tube|surface|contour3|smoothcontour3|obj)\b/.test(readText(n)));
  for (const k of paths ? ['asy', 'gs', 'dvips'] : ['asy', 'gs']) if (!TOOLS[k]) { status('tool-fetch', { tool: TOOL_NAMES[k] }); await loadTool(k).catch(() => {}); }
  if (texPool.length < 2) await addTeXInstance().catch(() => {});
  if (!TOOLS.asy) { SHELL.state.missing.add('asy'); return false; }
  const cwd = M.FS.cwd();
  for (const [n, h] of todo) {
    status('tool', { tool: 'asy' });
    const r = await asyRun(['asy', n], cwd);
    runs.push({ cmd: 'asy', code: r.code, log: (r.out + r.err).slice(-3000) });
    if (!r.code) seen[n] = h;
  }
  return true;
}

async function compile(job) {
  const t0 = performance.now();
  readLog = new Set();
  netBytes = 0;
  pipeCache.clear(); pipeCacheSize = 0; pipeSessions.clear();
  const dir = projectDir(job.project || job.id); // stable per project, so its .aux and .bbl carry over
  mkdirp(dir);
  touchProject(dir);
  // keep last run's intermediates unless a clean build was asked for; drop everything else
  rmTree(dir, job.clean ? null : (p) => KEEP.test(p) || ASY_OUT.test(p));
  if (job.clean) asySigs.delete(dir);
  for (const f of job.files) {
    const p = dir + '/' + f.path.replace(/^\/+/, '');
    mkdirp(p.slice(0, p.lastIndexOf('/')));
    M.FS.writeFile(p, f.data);
  }
  const dec = new TextDecoder();
  const textOf = (f) => (typeof f.data === 'string' ? f.data : dec.decode(f.data));
  const texFiles = job.files.filter((f) => /\.(tex|sty|cls|ltx)$/i.test(f.path));
  const mainFile = job.files.find((f) => f.path.replace(/^\/+/, '') === job.main);
  const mainText = mainFile ? textOf(mainFile) : '';
  const allText = texFiles.map(textOf).join('\n');
  const { engine, why } = pickEngine(job, mainText, allText);
  const E = ENGINES[engine];
  // the packs holding the packages and class this document names: fetched together up front,
  // not one by one from inside TeX
  const want = new Set(job.prefetch || []);
  for (const f of texFiles) {
    const t = textOf(f);
    const re = /\\(usepackage|RequirePackage|documentclass|LoadClass|use(|color|font|inner|outer)theme)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(t))) {
      for (let name of m[3].split(',')) {
        name = name.trim();
        if (m[2] !== undefined) name = 'beamer' + m[2] + 'theme' + name; // \usecolortheme{x} loads beamercolorthemex.sty
        for (const n of INDEX.provides[name] || []) want.add(n);
      }
    }
  }
  for (const f of INDEX.enginePacks ? INDEX.enginePacks[engine] || [] : []) want.add(f);
  if (MIRROR) {
    const mw = new Set();
    for (const f of texFiles) for (const m of textOf(f).matchAll(/\\(?:usepackage|RequirePackage|documentclass)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) {
      if (INDEX.provides[n.trim()]) continue;
      for (const k of MIRROR.index.provides[n.trim()] || []) mw.add(k);
    }
    if (mw.size) { status('fetch', { packs: mw.size }); await Promise.all([...mw].map((k) => mirrorPackAsync(k).catch(() => null))); }
  }
  for (const n of [...want]) if (packs.has(n)) want.delete(n);
  if (want.size) { status('fetch', { packs: want.size }); await Promise.all([...want].map((n) => loadPackAsync(n).catch(() => null))); }
  const mainPath = job.main;
  const sub = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/')) : '';
  const cwd = sub ? dir + '/' + sub : dir;
  M.FS.chdir(cwd);
  const base = mainPath.slice(mainPath.lastIndexOf('/') + 1).replace(/\.tex$/i, '');
  // Shell escape on: -shell-escape, as Overleaf runs it (the programs are emulated in this
  // worker, so nothing reaches the computer). Off: TeX Live's default, restricted to its list of
  // safe programs (makeindex, bibtex, repstopdf, kpsewhich, latexminted, ...).
  const unrestricted = job.shellEscape !== false;
  KPSE_VARS.shell_escape = unrestricted ? 't' : 'p';
  const tex = E.cmd(base, unrestricted ? '-shell-escape' : '-shell-restricted');
  SHELL.reset();
  await preloadTools(texFiles, job.files, engine);
  if (E.out === 'dvi') for (const k of ['dvips', 'gs']) if (!TOOLS[k]) { status('tool-fetch', { tool: TOOL_NAMES[k] }); await loadTool(k).catch(() => {}); }
  const runs = [];
  let reread = rereadState(readText(base + '.fls'));
  const texRun = () => {
    status('pass', { n: runs.filter((x) => x.cmd === 'tex').length + 1, engine });
    const before = reread;
    const r = run(tex);
    const log = readText(base + '.log');
    const fls = readText(base + '.fls');
    reread = rereadState(fls);
    runs.push({ cmd: 'tex', engine, code: r.code, log, err: (r.stderr || '').slice(-3000), rewrote: rewrote(fls, log, before) });
    return runs[runs.length - 1];
  };
  const texPasses = () => runs.filter((x) => x.cmd === 'tex').length;
  let pendingRerun = false;
  let toolLoads = 0;
  // one TeX pass, then what it asked for: a program module it needed (loaded, and the pass run
  // again), and the programs whose output TeX reads on the next pass (makeindex, bibtex)
  const pass = async () => {
    let x = texRun();
    while (SHELL.state.need.size && toolLoads < 3) {
      const need = [...SHELL.state.need];
      SHELL.state.need.clear(); SHELL.state.deferred = [];
      toolLoads++;
      for (const k of need) {
        if (k === 'tex') { await addTeXInstance().catch((e) => SHELL.state.log.push({ cmd: 'tex', code: 1, err: e.message })); continue; }
        status('tool-fetch', { tool: TOOL_NAMES[k] || k }); await loadTool(k).catch((e) => SHELL.state.log.push({ cmd: k, code: 1, err: 'could not load: ' + e.message }));
      }
      runs.pop();
      x = texRun();
    }
    if (SHELL.state.rerun) { SHELL.state.rerun = false; pendingRerun = true; }
    if (x.rewrote) pendingRerun = true;
    if (SHELL.state.deferred.length) {
      const jobs = SHELL.state.deferred; SHELL.state.deferred = [];
      if (runPrograms(jobs, runs)) pendingRerun = true;
      noteIndexInputs(jobs, dir);
    }
    return x;
  };

  const citesBefore = citesIn(base + '.aux');
  job.lastBcf = readText(base + '.bcf');
  // a kept .bcf would make the next run look like biblatex even after the document left it,
  // and a kept .bbl written for the other bibliography system would break the first pass
  if (exists(base + '.bcf')) M.FS.unlink(base + '.bcf');
  const usesBiblatex = texFiles.some((f) => /\.(tex|ltx)$/i.test(f.path) && /\\usepackage\s*(\[[^\]]*\])?\s*\{biblatex\}/.test(textOf(f)));
  if (exists(base + '.bbl') && /\\refsection|\\datalist|\\abx@/.test(readText(base + '.bbl').slice(0, 4000)) !== usesBiblatex) M.FS.unlink(base + '.bbl');
  // the .aux of another engine can hold what this one cannot read (font commands, \pdf...)
  if (lastEngine.get(dir) && lastEngine.get(dir) !== engine) for (const x of ['.aux', '.toc', '.lof', '.lot', '.out', '.nav', '.snm']) if (exists(base + x)) M.FS.unlink(base + x);
  lastEngine.set(dir, engine);
  const bibStale = (job.bibSig || '') !== (bibSigs.get(dir) || '');
  // A first run starts from the .aux a one page document without references writes, as latexmk
  // does (its set_trivial_aux_fdb): such a document then needs one pass, not two (a 3D pgfplots
  // figure: a minute less). Any other document rewrites it and gets its second pass as before.
  if (!exists(base + '.aux')) {
    M.FS.writeFile(base + '.aux', TRIVIAL_AUX);
    reread.set(M.FS.cwd().replace(/\/$/, '') + '/' + base + '.aux', TRIVIAL_AUX);
  }
  let r = await pass();
  const fatal = (x) => /Emergency stop|Fatal error occurred|==> Fatal error|No pages of output/.test(x.log) && !exists(base + '.' + E.out);
  // bibliography
  const aux = readText(base + '.aux');
  const wantsBib = /\\bibdata\{|\\abx@aux@/.test(aux) || exists(base + '.bcf');
  if (!fatal(r) && wantsBib) {
    const bcf = exists(base + '.bcf') && /backend=biber|<bcf:controlfile/.test(readText(base + '.bcf'));
    const citesNow = citesIn(base + '.aux');
    const changed = bibStale || citesNow !== citesBefore || !exists(base + '.bbl');
    if (bcf) {
      if (changed || readText(base + '.bcf') !== job.lastBcf) {
        status('biber');
        const b = await runBiber(cwd, base, job.files, sub);
        runs.push({ cmd: 'biber', code: b.code, log: b.log });
        if (b.bbl != null) { M.FS.writeFile(base + '.bbl', b.bbl); bibSigs.set(dir, job.bibSig || ''); r = await pass(); }
      }
    } else if (changed) {
      status('bibtex');
      const b = run(['bibtex8', '--8bit', base + '.aux']);
      runs.push({ cmd: 'bibtex', code: b.code, log: readText(base + '.blg') || b.stdout });
      if (exists(base + '.bbl')) bibSigs.set(dir, job.bibSig || '');
      r = await pass();
    }
  }
  // indexes, glossaries and nomenclatures, as latexmk runs them
  if (!fatal(r) && await indexTools(base, dir, runs)) r = await pass();
  // (a document of figures alone has no pages until they are drawn)
  if (!/Emergency stop|Fatal error occurred|==> Fatal error/.test(r.log) && await asyFigures(base, dir, runs)) r = await pass();
  // reruns until references settle (at most four TeX passes in all, five with an index)
  while (!fatal(r) && (needsRerun(r.log) || pendingRerun) && texPasses() < 5) { pendingRerun = false; r = await pass(); if (await indexTools(base, dir, runs)) pendingRerun = true; }
  let log = r.log;
  // XeTeX's output goes through xdvipdfmx, as xelatex does it on a desktop
  if (E.out === 'xdv' && exists(base + '.xdv')) {
    status('driver');
    const d = run(['xdvipdfmx', '-o', base + '.pdf', base + '.xdv']);
    const dlog = (d.stderr + '\n' + d.stdout).trim();
    runs.push({ cmd: 'xdvipdfmx', code: d.code, log: dlog });
    if (dlog && (d.code || !exists(base + '.pdf') || /warning|error|fatal/i.test(dlog))) log += '\n\n[xdvipdfmx]\n' + dlog + '\n';
  }

  // DVI: dvips makes PostScript, Ghostscript (ps2pdf) the PDF, as latex + dvips + ps2pdf does
  if (E.out === 'dvi' && exists(base + '.dvi')) {
    status('driver', { tool: 'dvips' });
    for (const cmd of ['dvips -o "' + base + '.ps" "' + base + '.dvi"', 'ps2pdf "' + base + '.ps" "' + base + '.pdf"']) {
      const n = SHELL.state.log.length;
      const code = SHELL.dispatch(cmd, cwd);
      const err = SHELL.state.log.slice(n).map((x) => x.err).join('').trim();
      runs.push({ cmd: cmd.split(' ')[0], code, log: err });
      if (err && (code || !exists(base + '.pdf'))) log += '\n\n[' + cmd.split(' ')[0] + ']\n' + err + '\n';
      if (code) break;
    }
  }
  if (engine === 'lualatex') saveFontCaches().catch(() => {});
  // pdfTeX leaves an empty .pdf behind when a run had "No pages of output": that is no PDF
  const pdfFile = readBytes(base + '.pdf');
  const pdf = pdfFile && pdfFile.length ? pdfFile : null;
  const synctex = readBytes(base + '.synctex.gz');
  const out = {
    id: job.id,
    ok: !!pdf,
    engine,
    engineLabel: E.label,
    engineWhy: why,
    pdf: pdf ? pdf.slice().buffer : null,
    synctex: synctex ? synctex.slice().buffer : null,
    log,
    runs: runs.map((x) => ({ cmd: x.cmd, code: x.code, log: x.cmd === 'tex' ? (x.code && !/\(see the transcript file/.test(x.log) ? x.err : '') : x.log })),
    passes: texPasses(),
    shell: SHELL.state.log.slice(0, 200),
    missing: [...SHELL.state.missing],
    ms: Math.round(performance.now() - t0),
    net: netBytes,
    reads: job.trace ? [...readLog] : undefined,
    files: job.read ? Object.fromEntries(job.read.filter((p) => exists(p)).map((p) => [p, readBytes(p).slice()])) : undefined, // tests
    packs: [...usedPacks]
  };
  readLog = null;
  return out;
}
const lastEngine = new Map(); // project dir -> engine of its last compile

// Build-time and test use: run one program of the binary in a scratch folder and hand back
// the files asked for (formats, font caches).
function execJob(job) {
  const work = '/home/web_user/exec';
  try { rmTree(work, null); } catch (e) { /* new */ }
  mkdirp(work);
  for (const f of job.files || []) { const p = f.path.startsWith('/') ? f.path : work + '/' + f.path; mkdirp(p.slice(0, p.lastIndexOf('/'))); try { M.FS.unlink(p); } catch (e) { /* new */ } M.FS.writeFile(p, f.data); }
  M.FS.chdir(work);
  readLog = new Set();
  const fc = {};
  const r = run(job.args, job.fcdump ? () => dumpFcCaches(fc) : null);
  const files = {};
  for (const p of job.read || []) { const q = p.startsWith('/') ? p : work + '/' + p; if (exists(q)) files[p] = readBytes(q).slice(); }
  const listed = {};
  for (const d of job.list || []) { try { listed[d] = M.FS.readdir(d).filter((x) => x !== '.' && x !== '..'); } catch (e) { listed[d] = null; } }
  const reads = [...readLog];
  readLog = null;
  return { code: r.code, stdout: r.stdout, stderr: r.stderr, files, listed, reads, fc };
}

// fontconfig cannot write its caches here (it locks with link(), which the binary lacks), but it
// builds each directory's cache as one block in memory, laid out exactly as the file it would
// write (fcint.h: magic, version, size, offset of the directory name, ...). After a run that made
// it scan, those blocks are copied out of the heap; the file name is md5(dir)-le32d8.cache-8.
function dumpFcCaches(out) {
  const H = M.HEAPU8, dv = new DataView(H.buffer);
  for (let i = 0; i + 32 < H.length; i += 4) {
    if (H[i] !== 0x05 || H[i + 1] !== 0xfc || H[i + 2] !== 0x02 || H[i + 3] !== 0xfc) continue;
    const version = dv.getInt32(i + 4, true), size = dv.getInt32(i + 8, true), dirOff = dv.getInt32(i + 12, true);
    if (version !== 8 || size < 40 || size > 64e6 || dirOff < 32 || dirOff >= size || i + size > H.length) continue;
    let e = i + dirOff;
    while (e < i + size && H[e]) e++;
    const dir = new TextDecoder().decode(H.subarray(i + dirOff, e));
    if (!dir.startsWith('/texlive/')) continue;
    const blob = H.slice(i, i + size);
    blob[0] = 0x04; // FC_CACHE_MAGIC_MMAP, as fontconfig writes it
    out[dir] = blob;
  }
}

let booting = null;
onmessage = async ({ data }) => {
  try {
    if (data.init) {
      // tests fix the clock (SOURCE_DATE_EPOCH, FORCE_SOURCE_DATE) so a PDF can be compared with a
      // desktop TeX Live's; the editor never sends env, so \today stays today for its users
      if (data.env && !booting) Object.assign(ENV, data.env);
      if (data.mirror && !booting) MIRROR_URL = new URL(data.mirror, data.base || self.location.href).href;
      booting = booting || boot(data.base || self.location.href);
      await booting;
      post({ ready: true, packs: INDEX.packs.length, files: INDEX.files.length, v: INDEX.v, mirror: MIRROR ? { files: MIRROR.index.files.length, error: null } : (MIRROR_URL ? { error: mirrorError } : null) });
    } else if (data.prefetch) {
      await booting;
      await Promise.all(data.prefetch.map((n) => loadPackAsync(n).catch(() => null)));
    } else if (data.compile) {
      await booting;
      const res = await compile(data.compile);
      post({ result: res }, [res.pdf, res.synctex].filter(Boolean));
    } else if (data.exec) {
      await booting;
      if (data.exec.packs) await Promise.all(data.exec.packs.map((n) => loadPackAsync(n)));
      post({ execResult: execJob(data.exec) });
    } else if (data.shell) {
      // a program run through the shell in a folder of the given files (tests, tools)
      await booting;
      const j = data.shell;
      for (const k of j.tools || []) await loadTool(k);
      const dir = PROJECT + '/shell-' + (j.id || 'x');
      mkdirp(dir);
      for (const f of j.files || []) { const p = dir + '/' + f.path; mkdirp(p.slice(0, p.lastIndexOf('/'))); M.FS.writeFile(p, f.data); }
      SHELL.reset();
      // asy as asymptote.sty's figures run it: a second TeX for its labels, answered ahead
      if (j.argv[0] === 'asy' && texPool.length < 2) await addTeXInstance().catch(() => {});
      let r = j.argv[0] === 'asy' ? await asyRun(j.argv, dir, j.stdin) : SHELL.run(j.argv, dir, j.stdin);
      // what the program found missing (a TeX instance for asy's labels, a program it started):
      // made or loaded, and the program run again, as a compile's pass does
      for (let k = 0; k < 2 && SHELL.state.need.size; k++) {
        const need = [...SHELL.state.need];
        SHELL.state.need.clear();
        for (const t of need) await (t === 'tex' ? addTeXInstance() : loadTool(t));
        r = SHELL.run(j.argv, dir, j.stdin);
      }
      const files = {};
      for (const n of j.read || []) if (exists(dir + '/' + n)) files[n] = M.FS.readFile(dir + '/' + n);
      post({ shellResult: Object.assign(r, { files }) });
    }
  } catch (e) {
    post({ error: String((e && e.message) || e), stack: e && e.stack, id: data.compile && data.compile.id });
  }
};
