// Programs TeX runs through the shell (see shell.js), each a WebAssembly module of its own,
// fetched the first time a document needs it and kept in IndexedDB like the TeX packs:
//
//   gs       Ghostscript 10.06 (@okathira/ghostpdl-wasm): EPS and PostScript to PDF, for
//            epstopdf/repstopdf and for xdvipdfmx (PSTricks and EPS under XeLaTeX)
//   gnuplot  gnuplot 6.0.2 (built here: build_tools.sh): gnuplottex, pgfplots' "gnuplot" plots
//   python   Python 3.14 (Pyodide) with Pygments and latexminted: minted
//
// Each runs on its own file system; a run copies the files it needs in at the same absolute
// paths TeX uses, and copies what the program wrote back.

/* global self, HERE, INDEX, M, MAIN, ENV, TOOLS, status, cacheGet, cachePut, fetchBytes, gunzip, BASE, SHELL */
const TOOL_NAMES = { gs: 'Ghostscript', gnuplot: 'gnuplot', python: 'Python and Pygments', dvips: 'dvips', asy: 'Asymptote', xindy: 'xindy' };

// which programs a document will likely ask for, loaded before the first pass (a guess: a
// program asked for without being loaded makes the pass run again once it is)
async function preloadTools(texFiles, files, engine) {
  const want = new Set();
  const dec = new TextDecoder();
  const text = texFiles.map((f) => (typeof f.data === 'string' ? f.data : dec.decode(f.data))).join('\n').replace(/(^|[^\\])%.*$/gm, '$1');
  if (files.some((f) => /\.(e?ps)$/i.test(f.path)) || /\\usepackage(\[[^\]]*\])?\{[^}]*\b(pstricks|pst-[\w-]+|auto-pst-pdf|pdftricks|epsfig|psfrag)\b/.test(text) || /\\psfig\b/.test(text)) want.add('gs');
  if (/gnuplottex|\\gnuplot\b|\bgnuplot\s*[[{]|raw gnuplot/.test(text)) want.add('gnuplot');
  if (/gnuplottex/.test(text) && engine !== 'lualatex') want.add('gs'); // its epslatex figures go through epstopdf
  if (/\\usepackage(\[[^\]]*\])?\{[^}]*\bminted\b|\\inputminted|\\mint\b|pygmentize/.test(text)) want.add('python');
  // TeX run from TeX needs a second instance of the engine
  if (/\\tikzexternalize|auto-pst-pdf|\\write18\s*\{[^}]*(latex|pdftex)\b|\\ShellEscape\s*\{[^}]*latex|\[[^\]]*\bconvert\b[^\]]*\]\s*\{standalone\}/.test(text) && texPool.length < 2) {
    try { await addTeXInstance(); } catch (e) { /* the pass will report it */ }
  }
  if (engine === 'latex') { want.add('dvips'); want.add('gs'); }
  if (/auto-pst-pdf|\\write18\s*\{[^}]*dvips/.test(text)) { want.add('dvips'); want.add('gs'); }
  // xindy: glossaries' xindy option, imakeidx's xindy programs, or a call of it
  if (/\\usepackage\s*\[[^\]]*\b(xindy|texindy|truexindy)\b[^\]]*\]\s*\{[^}]*\b(glossaries|glossaries-extra|imakeidx)\b|\bprogram\s*=\s*(tex|true)?xindy\b|\\(write18|ShellEscape)\s*\{[^}]*\b(tex)?xindy\b|\\setupglossaries\s*\{[^}]*\bxindy/.test(text)) want.add('xindy');
  for (const k of want) {
    if (TOOLS[k]) continue;
    status('tool-fetch', { tool: TOOL_NAMES[k] });
    try { await loadTool(k); } catch (e) { /* the pass will report it */ }
  }
}

const toolLoading = {};
function loadTool(k) {
  if (TOOLS[k]) return Promise.resolve(TOOLS[k]);
  if (!toolLoading[k]) {
    const make = { gs: makeGs, gnuplot: makeGnuplot, python: makePython, dvips: makeDvips, asy: makeAsy, xindy: makeXindy }[k];
    toolLoading[k] = make().then((t) => { TOOLS[k] = t; return t; });
    toolLoading[k].catch(() => { delete toolLoading[k]; });
  }
  return toolLoading[k];
}

async function toolAsset(a) {
  let z = await cacheGet('t:' + a.h);
  if (!z) { z = await fetchBytes(new URL(a.f, BASE).href); cachePut('t:' + a.h, z); }
  return gunzip(z);
}

// An emscripten program run more than once: its memory is put back to how it was before the
// first run after every run (these programs do not tidy up after themselves).
async function emProgram(factoryName, asset, extra) {
  self.__galleyToolBase = HERE;
  importScripts(HERE + asset.js);
  const mod = await WebAssembly.compile(await toolAsset(asset.wasm));
  const out = { s: '', o: '', e: '' }; // s: all it printed; o: its standard output alone; e: its standard error
  let mem = null;
  const opts = Object.assign({
    noInitialRun: true,
    // the C library reads its environment while starting, before any run: set it first
    preRun: [() => { if (extra && extra.env && opts.ENV) Object.assign(opts.ENV, extra.env); }],
    instantiateWasm(imports, ok) {
      for (const ns of Object.values(imports)) for (const v of Object.values(ns)) if (v instanceof WebAssembly.Memory) mem = v;
      WebAssembly.instantiate(mod, imports).then((inst) => {
        for (const v of Object.values(inst.exports)) if (v instanceof WebAssembly.Memory) mem = v;
        ok(inst);
      });
      return {};
    },
    print: (t) => { out.s += t + '\n'; out.o += t + '\n'; },
    printErr: (t) => { out.s += t + '\n'; out.e += t + '\n'; }
  }, extra || {});
  delete opts.env; delete opts.init;
  const P = await self[factoryName](opts);
  // what every run starts from: the memory as it is now, after init (xindy loads its Lisp here)
  if (extra && extra.init) extra.init(P);
  const snap = new Uint8Array(mem.buffer).slice();
  // programs built for Galley (build_tools.sh) start at galley_main (native/galley_main.c),
  // which takes the whole argv, program name included
  const enter = P._galley_main ? (argv) => {
    const enc = new TextEncoder();
    const ptrs = argv.map((x) => { const b = enc.encode(x + '\0'); const q = P._malloc(b.length); P.HEAPU8.set(b, q); return q; });
    const av = P._malloc(4 * (ptrs.length + 1));
    ptrs.forEach((q, i) => { P.HEAP32[(av >> 2) + i] = q; });
    P.HEAP32[(av >> 2) + ptrs.length] = 0;
    const r = P._galley_main(ptrs.length, av);
    if (P._fflush) P._fflush(0);
    return r;
  } : (argv) => P.callMain(argv.slice(1));
  return {
    P, out,
    // argv: the program's whole command line, its name first
    call(argv) {
      out.s = ''; out.o = ''; out.e = '';
      let code;
      try { code = enter(argv); } catch (e) { code = e && typeof e.status === 'number' ? e.status : (typeof e === 'number' ? e : 1); if (!(e && e.status != null)) { out.s += String(e) + '\n'; out.e += String(e) + '\n'; } }
      if (P._fflush) { try { P._fflush(0); } catch (e) { /* exited */ } }
      const h = new Uint8Array(mem.buffer);
      h.set(snap);
      if (h.length > snap.length) h.fill(0, snap.length);
      return code == null ? 0 : code;
    }
  };
}

// A mount showing another module's file system (Emscripten's PROXYFS, written out here so
// any module can take it): programs built for Galley and a second TeX see the TeX tree and
// the project folders exactly as TeX does, reading and writing straight through.
function proxyFS(FS, remote) {
  const wrap = (f) => { try { return f(); } catch (e) { if (e && e.errno != null && !(e instanceof FS.ErrnoError)) throw new FS.ErrnoError(e.errno); throw e; } };
  const real = (node) => {
    const parts = [];
    while (node.parent !== node) { parts.push(node.name); node = node.parent; }
    return (node.mount.opts.root + '/' + parts.reverse().join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
  };
  const P = {
    mount: (m) => P.createNode(null, '/', remote.lstat(m.opts.root).mode, 0),
    createNode(parent, name, mode) {
      const n = FS.createNode(parent, name, mode, 0);
      n.node_ops = P.node_ops; n.stream_ops = P.stream_ops;
      return n;
    },
    node_ops: {
      getattr: (node) => wrap(() => {
        const t = remote.lstat(real(node));
        return { dev: t.dev, ino: t.ino, mode: t.mode, nlink: t.nlink, uid: t.uid, gid: t.gid, rdev: t.rdev, size: t.size, atime: t.atime, mtime: t.mtime, ctime: t.ctime, blksize: t.blksize, blocks: t.blocks };
      }),
      setattr: (node, attr) => wrap(() => {
        const p = real(node);
        if (attr.mode !== undefined) { remote.chmod(p, attr.mode); node.mode = attr.mode; }
        if (attr.timestamp !== undefined) { const d = new Date(attr.timestamp); remote.utime(p, d, d); }
        if (attr.size !== undefined) {
          // opened for writing after someone else removed it: it is made again, empty
          try { remote.truncate(p, attr.size); } catch (e) { if (attr.size === 0 && e && e.errno === 44) remote.writeFile(p, new Uint8Array(0)); else throw e; }
        }
      }),
      lookup: (parent, name) => wrap(() => P.createNode(parent, name, remote.lstat(real(parent) + '/' + name).mode)),
      mknod: (parent, name, mode) => {
        const n = P.createNode(parent, name, mode);
        wrap(() => { if (FS.isDir(mode)) remote.mkdir(real(n), mode); else remote.writeFile(real(n), new Uint8Array(0)); });
        return n;
      },
      rename: (old, dir, name) => wrap(() => remote.rename(real(old), real(dir) + '/' + name)),
      unlink: (parent, name) => wrap(() => remote.unlink(real(parent) + '/' + name)),
      rmdir: (parent, name) => wrap(() => remote.rmdir(real(parent) + '/' + name)),
      readdir: (node) => wrap(() => remote.readdir(real(node))),
      symlink: (parent, name, target) => wrap(() => remote.symlink(target, real(parent) + '/' + name)),
      readlink: (node) => wrap(() => remote.readlink(real(node)))
    },
    stream_ops: {
      open: (st) => wrap(() => { st.nfd = remote.open(real(st.node), st.flags); }),
      close: (st) => wrap(() => remote.close(st.nfd)),
      read: (st, buf, off, len, pos) => wrap(() => remote.read(st.nfd, buf, off, len, pos)),
      write: (st, buf, off, len, pos) => wrap(() => remote.write(st.nfd, buf, off, len, pos)),
      llseek: (st, offset, whence) => {
        let p = offset;
        if (whence === 1) p += st.position;
        else if (whence === 2) p += P.node_ops.getattr(st.node).size;
        if (p < 0) throw new FS.ErrnoError(28);
        return p;
      }
    }
  };
  proxyOps.add(P.node_ops);
  return P;
}
// The file system keeps the nodes it looked up; TeX may have removed or replaced those files
// since, so a program's proxy nodes are forgotten before each run (looked up again as needed).
const proxyOps = new WeakSet();
function flushProxyCache(FS) {
  const t = FS.nameTable;
  if (!t) return;
  for (let i = 0; i < t.length; i++) {
    let n = t[i];
    while (n) {
      const next = n.name_next;
      if (proxyOps.has(n.node_ops) && n.parent !== n && !n.mounted) FS.hashRemoveNode(n);
      n = next;
    }
  }
}
// what a program built for Galley sees: the tree and the home folder (the projects) of TeX's
// file system; its own /tmp stays its own
function mountTeX(FS) {
  const remote = MAIN.FS;
  for (const d of ['/texlive', '/home/web_user']) {
    try { FS.mkdirTree ? FS.mkdirTree(d) : mkdirsIn(FS, d); } catch (e) { /* exists */ }
    try { remote.mkdirTree ? remote.mkdirTree(d) : mkdirsIn(remote, d); } catch (e) { /* exists */ }
    FS.mount(proxyFS(FS, remote), { root: d }, d);
  }
}

// a program built for Galley, run in TeX's folder; what it prints goes to the shell
async function galleyTool(factoryName, asset, envExtra, init) {
  const G = await emProgram(factoryName, asset, { env: Object.assign({}, ENV, { TEXMFCNF: '/texlive/texmf-dist/web2c' }, envExtra || {}), init });
  mountTeX(G.P.FS);
  return G;
}
function runGalleyTool(G, argv0, argv, io) {
  flushProxyCache(G.P.FS);
  // kpathsea finds texmf.cnf from where the program is: it has to be a file
  if (!texIsFile(argv0)) { try { MAIN.FS.mkdirTree(argv0.slice(0, argv0.lastIndexOf('/'))); } catch (e) { /* exists */ } MAIN.FS.writeFile(argv0, ''); }
  try { G.P.FS.chdir(io.env.cwd); } catch (e) { io.err(argv0 + ': no folder ' + io.env.cwd + '\n'); return 1; }
  const code = G.call([argv0, ...argv]);
  if (G.out.o) io.out(G.out.o);
  if (code) io.err(G.out.s.slice(-2500));
  return code;
}

// ---- dvips (TeX Live's, built for Galley: build_tools.sh) ----------------------------------
async function makeDvips() {
  const G = await galleyTool('GalleyDvips', INDEX.tools.dvips);
  return {
    run(argv, io) { return runGalleyTool(G, '/texlive/bin/dvips', argv.slice(1), io); }
  };
}

// ---- Asymptote 3.09 (built for Galley: build_tools.sh, native/patch_asy.py) ----------------------
// The programs it starts (LaTeX for its labels and the final picture, Ghostscript, dvips) run
// through the shell here; the base modules are in the tree, at TeX Live's place.
async function makeAsy() {
  const G = await galleyTool('GalleyAsy', INDEX.tools.asy, { ASYMPTOTE_SYSDIR: '/texlive/texmf-dist/asymptote', ASYMPTOTE_HOME: '/tmp/asy-home' });
  G.P.galleySystem = (argv, quiet) => {
    if (asyRehearsal) return 1; // a rehearsal draws nothing (engine.js)
    const r = SHELL.run(argv, G.P.FS.cwd());
    if (quiet < 1 && r.out) G.out.s += r.out;
    if (r.code && r.err) G.out.s += r.err;
    return r.code;
  };
  G.P.galleyPipe = (argv, input) => pipeProgram(argv, input, G.P.FS.cwd());
  return {
    run(argv, io) { return runGalleyTool(G, '/texlive/bin/asy', argv.slice(1), io); }
  };
}

// ---- xindy 2.5.1 (TeX Live's Lisp sources on ECL, built for Galley: build_tools.sh xindy) ----
// The program loads xindy's Lisp once (xindy_boot), and every run starts from that memory, as
// CLISP starts from xindy.mem. TeX Live's Perl front ends, xindy and texindy, are written out
// here: their options, the raw index through tex2xindy, the language module, the style file
// naming the modules, and the expression the Lisp kernel evaluates.
const XINDY_MODULES = '/texlive/texmf-dist/xindy/modules';
async function makeXindy() {
  const G = await galleyTool('GalleyXindy', INDEX.tools.xindy, {}, (P) => { if (P._xindy_boot()) throw new Error('the xindy kernel did not load'); });
  return { run: (argv, io, h) => xindyCommand(G, argv, io, h) };
}

// GNU getopt with bundling, as Perl's Getopt::Long (:config bundling) parses these
function xindyOptions(args, spec) {
  // spec: { 'long-name|x': true (takes a value) or false }
  const longs = {}, shorts = {};
  for (const [k, v] of Object.entries(spec)) { const [l, s] = k.split('|'); longs[l] = { name: l, value: v }; if (s) shorts[s] = longs[l]; }
  const o = { _: [] };
  const set = (d, val) => { if (Array.isArray(o[d.name])) o[d.name].push(val); else if (o[d.name] !== undefined && d.value) o[d.name] = [].concat(o[d.name], val); else o[d.name] = val; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { o._.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const d = longs[eq < 0 ? a.slice(2) : a.slice(2, eq)];
      if (!d) return { error: 'Unknown option: ' + a.slice(2) };
      if (d.value) { const v = eq >= 0 ? a.slice(eq + 1) : args[++i]; if (v === undefined) return { error: 'Option ' + d.name + ' requires an argument' }; set(d, v); } else set(d, true);
    } else if (a.length > 1 && a[0] === '-') {
      for (let j = 1; j < a.length; j++) {
        const d = shorts[a[j]];
        if (!d) return { error: 'Unknown option: ' + a[j] };
        if (d.value) { const v = j + 1 < a.length ? a.slice(j + 1) : args[++i]; if (v === undefined) return { error: 'Option ' + a[j] + ' requires an argument' }; set(d, v); break; }
        set(d, true);
      }
    } else o._.push(a);
  }
  return o;
}

function xindyCommand(G, argv, io, h) {
  const name = argv[0].replace(/^.*\//, '').replace(/\.(pl|exe)$/, '');
  const FS = G.P.FS;
  const tmp = (n) => '/tmp/xindy-' + n;
  const call = (args, quiet) => {
    flushProxyCache(FS);
    try { FS.chdir(io.env.cwd); } catch (e) { io.err(name + ': no folder ' + io.env.cwd + '\n'); return 1; }
    const code = G.call(args);
    if (G.out.o && !quiet) io.out(G.out.o);
    if (G.out.e) io.err(G.out.e);
    return code;
  };
  // tex2xindy is a filter: its standard input and output become files for the run (the
  // descriptors live in the file system, which the memory put back after a run does not reset)
  const filter = (input, output, args) => {
    FS.close(FS.streams[0]); FS.close(FS.streams[1]);
    FS.open(input, 'r'); FS.open(output, 'w');
    try { return call(['tex2xindy', ...args], true); } finally {
      for (const fd of [0, 1]) { try { FS.close(FS.streams[fd]); } catch (e) { /* closed */ } }
      FS.open('/dev/stdin', 'r'); FS.open('/dev/stdout', 'w');
    }
  };
  if (name === 'tex2xindy') {
    FS.writeFile(tmp('t2x-in'), new TextEncoder().encode(io.stdin || ''));
    const code = filter(tmp('t2x-in'), tmp('t2x-out'), argv.slice(1));
    io.out(new TextDecoder().decode(FS.readFile(tmp('t2x-out'))));
    return code;
  }
  let args = argv.slice(1);
  if (name === 'texindy') {
    const o = xindyOptions(args, { 'version|V': false, 'help|h': false, 'quiet|q': false, 'verbose|v': false, 'stdin|i': false, 'german|g': false, 'letter-ordering|l': false,
      'no-ranges|r': false, 'debug|d': true, 'out-file|o': true, 'log-file|t': true, 'language|L': true, 'codepage|C': true, 'module|M': true, 'input-markup|I': true });
    if (o.error) { io.err(o.error + '\nusage: texindy [-V?h] [-qglr] [-L lang] [-C codepage] [-M module] [-o outfile.ind] [-t log] [idx0 idx1 ...]\n'); return 1; }
    if (o.version) return xindyCommand(G, ['xindy', '-V'], io, h);
    if (o.help) { io.out('usage: texindy [-V?h] [-qglr] [-L lang] [-C codepage] [-M module] [-o outfile.ind] [-t log] [idx0 idx1 ...]\n'); return 0; }
    let language = o.language ? [].concat(o.language).pop() : 'general';
    let codepage = o.codepage === undefined ? 'latin' : [].concat(o.codepage).pop();
    const markup = o['input-markup'] ? [].concat(o['input-markup']).pop() : 'latex';
    const modules = [].concat(o.module || []);
    if (o.german) {
      modules.unshift('german-sty');
      if (language === 'general') language = 'german-din';
      else if (!/^german/.test(language)) { io.err('You cannot specify -g and -L at the same time.\n'); return 1; }
    }
    modules.unshift(o['letter-ordering'] ? 'letter-order' : 'word-order');
    if (!o['no-ranges']) modules.unshift('page-ranges');
    if (!['latex', 'xelatex', 'omega'].includes(markup)) { io.err('Unsupported input markup ' + markup + '.\n'); return 1; }
    if (markup !== 'latex') codepage = null;
    if (!o.stdin && !o._.length) { io.err('usage: texindy [-V?h] [-qglr] [-L lang] [-C codepage] [-M module] [-o outfile.ind] [-t log] [idx0 idx1 ...]\n'); return 1; }
    args = [];
    if (o.quiet) args.push('-q');
    if (o.verbose) args.push('-v');
    for (const d of [].concat(o.debug || [])) args.push('-d', d);
    if (o['out-file']) args.push('-o', [].concat(o['out-file']).pop());
    if (o['log-file']) args.push('-t', [].concat(o['log-file']).pop());
    args.push('-L', language);
    if (codepage) args.push('-C', codepage, '-M', 'tex/inputenc/' + codepage);
    for (const m of ['texindy', ...modules]) args.push('-M', m);
    args.push('-I', markup, ...o._);
  }
  const o = xindyOptions(args, { 'version|V': false, 'internal-version': false, 'help|h': false, 'quiet|q': false, 'verbose|v': false, 'debug|d': true, 'out-file|o': true,
    'log-file|t': true, 'language|L': true, 'codepage|C': true, 'module|M': true, 'input-markup|I': true, interactive: false, 'mem-file': true });
  const usage = 'usage: xindy [-V?h] [-qv] [-d magic] [-o outfile.ind] [-t log] \\\n\t\t[-L lang] [-C codepage] [-M module] [-I input] [idx0 idx1 ...]\n';
  if (o.error) { io.err(o.error + '\n' + usage); return 1; }
  if (o.help) { io.out(usage); return 0; }
  if (o.version || o['internal-version']) {
    if (o.version) io.out('xindy release: 2.5.1\n');
    io.out(name + ' script version: 1.18\n');
    return call(['xindy', '-x', '(xindy:startup :show-version t)']);
  }
  if (o.interactive) { io.err(name + ': --interactive needs a terminal\n'); return 1; }
  const quote = (s) => '"' + s.replace(/([\\"])/g, '\\$1') + '"';
  let outfile = o['out-file'] ? [].concat(o['out-file']).pop() : null;
  if (!outfile) {
    if (!o._.length) { io.err('You need to specify --out-file if the raw index is read from standard input.\n' + usage); return 1; }
    outfile = o._[0].replace(/\.[^./]+$/, '') + '.ind';
  }
  const logfile = o['log-file'] ? [].concat(o['log-file']).pop() : '/dev/null';
  const modules = [].concat(o.module || []).map((m) => (/\.xdy$/.test(m) ? m : m + '.xdy'));
  const markup = o['input-markup'] ? [].concat(o['input-markup']).pop() : 'latex';
  if (!['latex', 'xelatex', 'omega', 'xindy'].includes(markup)) { io.err('Unsupported input markup ' + markup + '.\n' + usage); return 1; }
  let codepages = [].concat(o.codepage || []);
  if (markup === 'xelatex' || markup === 'omega') codepages = ['utf8'];
  // the raw index: the input files one after the other (or standard input), through tex2xindy;
  // bytes as they are (xindy reads them as ISO-8859-1)
  const parts = [];
  for (const f of o._) {
    if (!h.isFile(h.abs(f))) { io.err(name + ': input file ' + f + ' does not exist\n'); return 1; }
    parts.push(h.readB(h.abs(f)));
  }
  // whatever comes of it, these inputs had their run: the compile does not index them again
  // (engine.js), as nothing would on a desktop
  for (const f of o._) noteIndexed(h.abs(f));
  if (!o._.length) parts.push(new TextEncoder().encode(io.stdin || ''));
  const raw = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => { raw.set(p, at); return at + p.length; }, 0);
  FS.writeFile(tmp('raw'), raw);
  let rawIndex = tmp('raw');
  if (/latex$/.test(markup) || markup === 'omega') {
    if (o.verbose) io.out('Running filter: tex2xindy\n');
    const code = filter(tmp('raw'), tmp('filtered'), markup === 'omega' ? ['-o'] : []);
    if (code) return code;
    rawIndex = tmp('filtered');
  }
  // the language module, first: it defines the sort rules the others add to
  let language = o.language ? [].concat(o.language).pop() : 'general';
  const ls = (d) => { try { return h.FS().readdir(d).filter((n) => n !== '.' && n !== '..'); } catch (e) { return null; } };
  let langDir = null, variant = '';
  for (const base of [XINDY_MODULES + '/contrib/lang', XINDY_MODULES + '/lang']) {
    if (ls(base + '/' + language)) { langDir = base + '/' + language; break; }
    const m = /^([^-]*)-(.*)/.exec(language);
    if (m && m[2] && ls(base + '/' + m[1])) {
      language = m[1]; langDir = base + '/' + language;
      variant = m[2] === 'iso' ? '' : m[2] + '-';
      if (variant === 'din-') variant = 'din5007-';
      break;
    }
  }
  if (!codepages.length) codepages = ['latin', 'cp', 'iso8859', 'ascii', 'utf8'];
  let styles = [];
  for (const cp of codepages) {
    styles = langDir ? (ls(langDir) || []).filter((n) => n.startsWith(variant + cp) && n.endsWith('-lang.xdy')).sort() : [];
    if (styles.length) break;
  }
  if (!styles.length) {
    io.err('Cannot locate xindy module for language ' + language + (codepages.length === 1 ? ' in codepage ' + codepages[0] : '') + '.\n');
    return 1;
  }
  modules.unshift((langDir + '/' + styles[0]).slice(XINDY_MODULES.length + 1));
  // more than one module: a style file requiring them in turn (modules of the document's
  // folder by their path there, as kpsewhich finds them)
  let style = modules[0];
  if (modules.length > 1) {
    style = tmp('style.xdy');
    FS.writeFile(style, modules.map((m) => '(require "' + (/[/\\]/.test(m) || !h.isFile(h.abs(m)) ? m : './' + m) + '")\n').join(''));
  }
  const debug = [].concat(o.debug || []);
  const level = (debug.find((d) => /^level=/.test(d)) || '').slice(6);
  const expr = '(progn\n  (searchpath ' + quote(['.', XINDY_MODULES, XINDY_MODULES + '/base'].join(':')) + ')\n  (xindy:startup\n    :idxstyle ' + quote(style) +
    '\n    :rawindex ' + quote(rawIndex) + '\n    :output ' + quote(outfile) + '\n    :logfile ' + quote(logfile) +
    (debug.includes('markup') ? '\n    :markup-trace :on' : '') + (level ? '\n    :trace-level ' + level : '') + ')\n  (exit))';
  if (debug.includes('script')) io.out('command: xindy -x ' + expr + '\n');
  return call(['xindy', '-x', expr], o.quiet);
}

// copy a file from TeX's file system into a program's, at the same path
// A copy dated 1970: copyBackChanged tells what a program wrote by size and time, and a program
// that rewrites a file within the millisecond it was copied in, at the same size, left it
// looking untouched. pgfplots' gnuplot plots all write <job>.pgf-plot.table: a fast gnuplot's
// second table of the same size never reached TeX, which drew the first curve again.
function mirrorIn(FS2, path) {
  const data = M.FS.readFile(path);
  mkdirsIn(FS2, path.slice(0, path.lastIndexOf('/')));
  FS2.writeFile(path, data);
  try { FS2.utime(path, 0, 0); } catch (e) { /* the time only helps tell writes apart */ }
}
function mkdirsIn(FS2, d) {
  let cur = '';
  for (const seg of d.split('/').filter(Boolean)) { cur += '/' + seg; try { FS2.mkdir(cur); } catch (e) { /* exists */ } }
}
function texIsFile(p) { try { return M.FS.isFile(M.FS.stat(p).mode); } catch (e) { return false; } }
function texWrite(p, data) {
  let cur = '';
  for (const seg of p.split('/').slice(0, -1).filter(Boolean)) { cur += '/' + seg; try { M.FS.mkdir(cur); } catch (e) { /* exists */ } }
  M.FS.writeFile(p, data);
}
// a whole folder (the document's), for programs that read files their script names
function mirrorFolder(FS2, dir, limit) {
  let n = 0;
  const walk = (d) => {
    let names;
    try { names = M.FS.readdir(d); } catch (e) { return; }
    for (const x of names) {
      if (x === '.' || x === '..') continue;
      const p = d + '/' + x;
      const st = M.FS.stat(p);
      if (M.FS.isDir(st.mode)) walk(p);
      else if (st.size < 8e6 && n++ < (limit || 2000)) mirrorIn(FS2, p);
    }
  };
  walk(dir);
  // and a file TeX's side no longer has (deleted by TeX or by another program) is gone here too
  for (const p of folderState(FS2, dir).keys()) if (!exists(p)) { try { FS2.unlink(p); } catch (e) { /* gone */ } }
}
// what changed in a folder of a program's file system since `before` (path -> signature)
function folderState(FS2, dir) {
  const st = new Map();
  const walk = (d) => {
    let names;
    try { names = FS2.readdir(d); } catch (e) { return; }
    for (const x of names) {
      if (x === '.' || x === '..') continue;
      const p = d + '/' + x;
      const s = FS2.stat(p);
      if (FS2.isDir(s.mode)) walk(p);
      else st.set(p, s.size + ':' + (s.mtime && s.mtime.getTime ? s.mtime.getTime() : s.mtime));
    }
  };
  walk(dir);
  return st;
}
// copies back what the program wrote, and deletes what it deleted (latexminted removes the
// message file of its last run; a stale one reads as a new error); returns how many files TeX
// will now see differently
function copyBackChanged(FS2, dir, before) {
  const after = folderState(FS2, dir);
  let n = 0;
  for (const p of before.keys()) if (!after.has(p) && exists(p)) { try { M.FS.unlink(p); n++; } catch (e) { /* a folder */ } }
  for (const [p, sig] of after) {
    if (before.get(p) === sig) continue;
    const data = FS2.readFile(p);
    let same = false;
    try { const old = M.FS.readFile(p); same = old.length === data.length && old.every((x, i) => x === data[i]); } catch (e) { /* new */ }
    if (!same) { texWrite(p, data); n++; }
  }
  return n;
}

// ---- Ghostscript -------------------------------------------------------------------------
async function makeGs() {
  const G = await emProgram('GalleyGs', INDEX.tools.gs);
  const FS2 = G.P.FS;
  const BASEOPTS = ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER'];
  // epstopdf's default Ghostscript options (TeX Live's epstopdf.pl)
  const EPSTOPDF = ['-sDEVICE=pdfwrite', '-dAutoRotatePages=/None', '-dPDFSETTINGS=/prepress', '-dMaxSubsetPct=100', '-dSubsetFonts=true', '-dEmbedAllFonts=true', '-dCompatibilityLevel=1.5'];

  function gsRun(args, cwd, inputs, outputs) {
    mkdirsIn(FS2, cwd);
    for (const p of inputs) if (texIsFile(p)) mirrorIn(FS2, p);
    for (const p of outputs) { mkdirsIn(FS2, p.slice(0, p.lastIndexOf('/'))); try { FS2.unlink(p); } catch (e) { /* none */ } }
    FS2.chdir(cwd);
    const code = G.call(['gs', ...args]);
    let made = 0;
    for (const p of outputs) { try { texWrite(p, FS2.readFile(p)); made++; } catch (e) { /* not written */ } }
    return { code: code || (outputs.length && !made ? 1 : 0), log: G.out.s };
  }

  // EPS with its bounding box moved to the origin and the page cut to it, as epstopdf does
  function epsForPdf(bytes, hires, exact) {
    let b = bytes;
    if (b[0] === 0xc5 && b[1] === 0xd0 && b[2] === 0xd3 && b[3] === 0xc6) { // DOS EPS binary header
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const off = dv.getUint32(4, true), len = dv.getUint32(8, true);
      b = b.subarray(off, off + len);
    }
    // one character per byte (TextDecoder's "latin1" is windows-1252, which would change bytes)
    let text = '';
    for (let i = 0; i < b.length; i += 0x8000) text += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    const key = exact ? '%%ExactBoundingBox:' : hires ? '%%HiResBoundingBox:' : '%%BoundingBox:';
    // the box may be given at the end ("(atend)"): the first line with numbers holds it
    const find = (k) => new RegExp('^' + k + '[ \\t]*([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)', 'm').exec(text);
    const m = find(key) || find('%%BoundingBox:');
    if (!m) return null;
    let [llx, lly, urx, ury] = m.slice(1).map(Number);
    if (!hires && !exact) { llx = Math.floor(llx); lly = Math.floor(lly); urx = Math.ceil(urx); ury = Math.ceil(ury); }
    const w = +(urx - llx).toFixed(4), h = +(ury - lly).toFixed(4);
    // the page size and the shift go where the header gives the box (its first such line),
    // else right after the first line; every other box line is dropped
    const first = /^%%BoundingBox:.*$/m.exec(text);
    const cut = first ? first.index : text.indexOf('\n') + 1;
    const after = first ? first.index + first[0].length + 1 : cut;
    const head = text.slice(0, cut) + '%%BoundingBox: 0 0 ' + Math.ceil(w) + ' ' + Math.ceil(h) + '\n' +
      (hires || exact ? '%%HiResBoundingBox: 0 0 ' + w + ' ' + h + '\n' : '') +
      '<< /PageSize [' + w + ' ' + h + '] >> setpagedevice\ngsave ' + (-llx) + ' ' + (-lly) + ' translate\n';
    const body = text.slice(after).replace(/^%%(HiRes|Exact)?BoundingBox:.*\r?\n/gm, '');
    const s = head + body + '\ngrestore\n';
    const outb = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) outb[i] = s.charCodeAt(i) & 255;
    return outb;
  }

  return {
    // each page's bounding box (Ghostscript's bbox device), for pdfcrop
    bbox(inp, cwd, hires) {
      const r = gsRun([...BASEOPTS, '-sDEVICE=bbox', inp], cwd, [inp], []);
      const key = hires ? '%%HiResBoundingBox:' : '%%BoundingBox:';
      const out = [];
      for (const l of r.log.split('\n')) if (l.startsWith(key)) out.push(l.slice(key.length).trim().split(/\s+/).map(Number));
      return { code: r.code, boxes: out, log: r.log };
    },
    run(argv, io, h) {
      const name = argv[0].replace(/^.*\//, '').replace(/\.(exe|pl)$/i, '');
      const a = argv.slice(1);
      const cwd = io.env.cwd;
      let r;
      if (name === 'repstopdf' || name === 'epstopdf' || name === 'eps2pdf') {
        let outFile = null, hires = false, exact = false;
        const extra = [];
        const files = [];
        for (let i = 0; i < a.length; i++) {
          const x = a[i];
          let m;
          if ((m = /^--?outfile=(.*)$/.exec(x))) outFile = m[1];
          else if (x === '--outfile' || x === '-o') outFile = a[++i];
          else if (x === '--hires') hires = true;
          else if (x === '--exact') exact = true;
          else if ((m = /^--gsopts?=(.*)$/.exec(x))) extra.push(...m[1].split(/\s+/).filter(Boolean));
          else if ((m = /^--res=(\d+)/.exec(x))) extra.push('-r' + m[1]);
          else if (x.startsWith('-')) continue;
          else files.push(x);
        }
        if (!files.length) { io.err(name + ': no input file\n'); return 1; }
        const inp = h.abs(files[0]);
        const out = h.abs(outFile || files[0].replace(/\.[^./]*$/, '') + '.pdf');
        if (!texIsFile(inp)) { io.err(name + ': ' + files[0] + ' not found\n'); return 1; }
        const eps = epsForPdf(M.FS.readFile(inp), hires, exact);
        if (!eps) { io.err(name + ': no %%BoundingBox in ' + files[0] + '\n'); return 1; }
        const tmp = '/tmp/galley-epstopdf.ps';
        mkdirsIn(FS2, '/tmp'); FS2.writeFile(tmp, eps);
        r = gsRun([...BASEOPTS, ...EPSTOPDF, ...extra, '-sOutputFile=' + out, tmp, '-c', 'quit'], cwd, [], [out]);
      } else if (/^ps2pdf/.test(name) || name === 'eps2eps' || name === 'ps2ps' || name === 'pdf2ps') {
        const opts = a.filter((x) => x.startsWith('-'));
        const files = a.filter((x) => !x.startsWith('-'));
        const inp = h.abs(files[0] || '');
        const dev = name === 'eps2eps' ? 'eps2write' : name === 'ps2ps' || name === 'pdf2ps' ? 'ps2write' : 'pdfwrite';
        const level = { ps2pdf12: '1.2', ps2pdf13: '1.3', ps2pdf14: '1.4' }[name] || '1.5';
        const ext = dev === 'pdfwrite' ? '.pdf' : name === 'eps2eps' ? '.eps' : '.ps';
        const out = h.abs(files[1] || files[0].replace(/\.[^./]*$/, '') + ext);
        r = gsRun([...BASEOPTS, '-sDEVICE=' + dev, ...(dev === 'pdfwrite' ? ['-dCompatibilityLevel=' + level] : []), ...opts, '-sOutputFile=' + out, inp], cwd, [inp], [out]);
      } else {
        // gs or rungs as called (xdvipdfmx: rungs ... -sOutputFile='%o' '%i' -c quit)
        const outputs = [], inputs = [];
        const args = a.map((x, i) => {
          let m;
          if ((m = /^-sOutputFile=(.*)$/.exec(x)) || (m = /^-o(.+)$/.exec(x))) { const p = h.abs(m[1]); outputs.push(p); return '-sOutputFile=' + p; }
          if (x === '-o' && a[i + 1]) return x;
          if (i > 0 && a[i - 1] === '-o') { const p = h.abs(x); outputs.push(p); return p; }
          if (!x.startsWith('-') && texIsFile(h.abs(x))) { const p = h.abs(x); inputs.push(p); return p; }
          return x;
        });
        r = gsRun(args, cwd, inputs, outputs);
      }
      if (r.code) io.err(r.log.slice(-1500));
      else if (G.out.o) io.out(G.out.o); // what PostScript printed (xdvipdfmx reads numbers this way)
      return r.code;
    }
  };
}

// ---- pdfcrop (a Perl script in TeX Live; the same method here) ---------------------------------
// Ghostscript measures every page; pdfTeX (a second instance, see engine.js) takes each page
// as an image cut to that box, so the content stays as it was.
let cropSeq = 0;
function pdfcrop(argv, io, h) {
  const a = argv.slice(1);
  let margins = [0, 0, 0, 0], hires = false, clip = false, fixed = null;
  const files = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const val = () => (x.includes('=') ? x.slice(x.indexOf('=') + 1) : a[++i]);
    if (/^--?margins?\b/.test(x)) { const m = String(val()).trim().split(/\s+/).map(Number); margins = m.length === 1 ? [m[0], m[0], m[0], m[0]] : m.length === 2 ? [m[0], m[1], m[0], m[1]] : m; }
    else if (/^--?hires$/.test(x)) hires = true;
    else if (/^--?nohires$/.test(x)) hires = false;
    else if (/^--?clip$/.test(x)) clip = true;
    else if (/^--?bbox\b/.test(x)) fixed = String(val()).trim().split(/\s+/).map(Number);
    else if (/^--?(gscmd|pdftexcmd|xetexcmd|luatexcmd|tex|papersize|resolution|bbox-odd|bbox-even|pdfversion|uncompress|ini|restricted)\b/.test(x)) { if (!x.includes('=')) i++; }
    else if (x.startsWith('-')) continue;
    else files.push(x);
  }
  if (!files.length) { io.err('pdfcrop: no input file\n'); return 1; }
  const inp = h.abs(files[0].replace(/^"|"$/g, ''));
  const out = h.abs(files[1] || files[0].replace(/\.pdf$/i, '') + '-crop.pdf');
  if (!texIsFile(inp)) { io.err('pdfcrop: ' + files[0] + ' not found\n'); return 1; }
  if (!TOOLS.gs) { SHELL.state.need.add('gs'); io.err('galley: loading Ghostscript, the pass runs again\n'); return 1; }
  let boxes;
  if (fixed) {
    const n = (M.FS.readFile(inp, { encoding: 'binary' }).match(/\/Type\s*\/Page\b/g) || [1]).length;
    boxes = Array.from({ length: n }, () => fixed);
  } else {
    const r = TOOLS.gs.bbox(inp, io.env.cwd, hires);
    if (!r.boxes.length) { io.err('pdfcrop: Ghostscript found no pages\n' + r.log.slice(-800)); return 1; }
    boxes = r.boxes;
  }
  const [ml, mt, mr, mb] = margins;
  const job = 'galley-pdfcrop-' + (++cropSeq);
  const lines = boxes.map((b, k) => {
    if (!(b[0] < b[2] && b[1] < b[3])) return '\\pageinclude{' + (k + 1) + '}';
    if (clip) return '\\pageclip ' + (k + 1) + ' [' + b.join(' ') + '][' + ml + ' ' + mb + ' ' + mr + ' ' + mt + ']';
    return '\\page ' + (k + 1) + ' [' + [b[0] - ml, b[1] - mb, b[2] + mr, b[3] + mt].join(' ') + ']';
  });
  const tex = String.raw`\pdfcompresslevel=9 \pdfoutput=1 \pdfinfoomitdate=1 \pdftrailerid{}
\def\pdffile{` + inp + String.raw`}
\def\page #1 [#2 #3 #4 #5]{\count0=#1\relax
  \setbox0=\hbox{\pdfximage page #1 mediabox{\pdffile}\pdfrefximage\pdflastximage}%
  \pdfhorigin=-#2bp\relax \pdfvorigin=#3bp\relax
  \pdfpagewidth=#4bp\relax \advance\pdfpagewidth by -#2bp\relax
  \pdfpageheight=#5bp\relax \advance\pdfpageheight by -#3bp\relax
  \ht0=\pdfpageheight \shipout\box0\relax}
\def\pageclip #1 [#2 #3 #4 #5][#6 #7 #8 #9]{\count0=#1\relax
  \dimen0=#4bp\relax \advance\dimen0 by -#2bp\relax \edef\imagewidth{\the\dimen0}%
  \dimen0=#5bp\relax \advance\dimen0 by -#3bp\relax \edef\imageheight{\the\dimen0}%
  \pdfximage page #1 mediabox{\pdffile}%
  \setbox0=\hbox{\kern -#2bp\relax \lower #3bp\hbox{\pdfrefximage\pdflastximage}}%
  \wd0=\imagewidth\relax \ht0=\imageheight\relax \dp0=0pt\relax
  \pdfhorigin=#6bp\relax \pdfvorigin=#7bp\relax
  \pdfpagewidth=\imagewidth \advance\pdfpagewidth by #6bp\relax \advance\pdfpagewidth by #8bp\relax
  \pdfpageheight=\imageheight\relax \advance\pdfpageheight by #7bp\relax \advance\pdfpageheight by #9bp\relax
  \pdfxform0\relax \shipout\hbox{\pdfrefxform\pdflastxform}}
\def\pageinclude#1{\pdfhorigin=0pt\relax \pdfvorigin=0pt\relax
  \pdfximage page #1 mediabox{\pdffile}\setbox0=\hbox{\pdfrefximage\pdflastximage}%
  \pdfpagewidth=\wd0\relax \pdfpageheight=\ht0\relax \advance\pdfpageheight by \dp0\relax
  \shipout\hbox{\raise\dp0\box0\relax}}
` + lines.join('\n') + '\n\\csname @@end\\endcsname\\end\n';
  const dir = io.env.cwd;
  texWrite(dir + '/' + job + '.tex', tex);
  const code = nestedTeX(['pdflatex', '-interaction=batchmode', '-no-shell-escape', job + '.tex'], { env: io.env, out: () => {}, err: io.err });
  const made = dir + '/' + job + '.pdf';
  let ok = code === 0 && texIsFile(made);
  if (ok) { texWrite(out, M.FS.readFile(made)); io.out('==> ' + boxes.length + ' page' + (boxes.length > 1 ? 's' : '') + ' written on `' + files[1] + "'.\n"); }
  else io.err('pdfcrop: pdfTeX could not cut the pages\n' + (texIsFile(dir + '/' + job + '.log') ? M.FS.readFile(dir + '/' + job + '.log', { encoding: 'utf8' }).slice(-1200) : ''));
  for (const e of ['.tex', '.pdf', '.log']) { try { M.FS.unlink(dir + '/' + job + e); } catch (e2) { /* none */ } }
  return ok ? 0 : (code || 1);
}

// ---- gnuplot -------------------------------------------------------------------------------
async function makeGnuplot() {
  const G = await emProgram('GalleyGnuplot', INDEX.tools.gnuplot, { noFSInit: true });
  const FS2 = G.P.FS;
  try { FS2.init(() => null, null, null); } catch (e) { /* already */ }
  // the PostScript prologues the postscript and epslatex terminals copy into their output
  // (gnuplot 6.0.2's, shipped in the TeX tree)
  const PS = '/usr/local/share/gnuplot/6.0/PostScript';
  mkdirsIn(FS2, PS);
  try { for (const n of M.FS.readdir('/texlive/gnuplot-ps')) if (n !== '.' && n !== '..') FS2.writeFile(PS + '/' + n, M.FS.readFile('/texlive/gnuplot-ps/' + n)); } catch (e) { /* none */ }
  return {
    run(argv, io, h) {
      const cwd = io.env.cwd;
      // the document's folder, so the script finds its data files
      const root = cwd.split('/').slice(0, 5).join('/'); // /home/web_user/project/<id>
      mirrorFolder(FS2, root);
      // gnuplot 6 dropped the old "latex" terminal that gnuplottex asks for by default; its
      // successor, pict2e, writes the same kind of picture environment
      for (const a of argv.slice(1)) {
        if (a.startsWith('-')) continue;
        const p = h.abs(a);
        try {
          const t = new TextDecoder().decode(FS2.readFile(p));
          const t2 = t.replace(/^(\s*set\s+term(?:inal)?\s+)latex\b/gm, '$1pict2e');
          if (t2 !== t) { FS2.writeFile(p, t2); io.err('galley: gnuplot 6 has no latex terminal; using pict2e\n'); }
        } catch (e) { /* not a file */ }
      }
      const before = folderState(FS2, root);
      mkdirsIn(FS2, cwd);
      FS2.chdir(cwd);
      const code = G.call(['gnuplot', ...argv.slice(1)]);
      copyBackChanged(FS2, root, before);
      if (code) io.err(G.out.s.slice(-1500));
      return code;
    }
  };
}

// ---- Python (Pyodide), for minted --------------------------------------------------------
// minted (v3) has TeX write what to highlight into files and runs `latexminted`, a Python
// program using Pygments. Here it runs in Pyodide (CPython 3.14 in WebAssembly) with the real
// latexminted, latex2pydata, latexrestricted and Pygments wheels. latexrestricted asks
// kpsewhich (through subprocess) for TeX's settings; those calls are answered by the shell.
async function makePython() {
  const T = INDEX.tools.python;
  // Pyodide refuses classic workers, which it detects by whether importScripts takes a data:
  // URL (a page's security policy usually forbids that anyway). It is given everything it would
  // load, so the difference does not matter here: data: URLs fail while it loads.
  const realImport = self.importScripts;
  self.importScripts = function (...urls) {
    if (urls.some((u) => String(u).startsWith('data:'))) throw new Error('no data: scripts');
    return realImport.apply(self, urls);
  };
  try { return await makePythonIn(T); } finally { self.importScripts = realImport; }
}
async function makePythonIn(T) {
  importScripts(HERE + T.loader); // pyodide.js: defines self.loadPyodide
  const [asm, wasm, stdlib, lock, ...wheels] = await Promise.all([T.asm, T.wasm, T.stdlib, T.lock, ...T.wheels].map(toolAsset));
  const asmUrl = URL.createObjectURL(new Blob([asm], { type: 'text/javascript' }));
  const mod = await import(asmUrl);
  const fake = 'https://pyodide.galley.invalid/';
  const realFetch = self.fetch;
  self.fetch = (u, o) => {
    const s = String((u && u.url) || u);
    if (s.startsWith(fake)) {
      const n = s.slice(fake.length);
      if (n === 'pyodide.asm.wasm') return Promise.resolve(new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } }));
      if (n === 'python_stdlib.zip') return Promise.resolve(new Response(stdlib, { headers: { 'Content-Type': 'application/zip' } }));
      return Promise.resolve(new Response('', { status: 404 }));
    }
    return realFetch(u, o);
  };
  const out = { s: '' };
  let py;
  try {
    py = await self.loadPyodide({
      indexURL: fake, createPyodideModule: mod.default, lockFileContents: JSON.parse(new TextDecoder().decode(lock)),
      stdout: (t) => { out.s += t + '\n'; }, stderr: (t) => { out.s += t + '\n'; }, env: { HOME: '/home/pyodide' }
    });
  } finally { self.fetch = realFetch; }
  const site = py.runPython("import sysconfig; sysconfig.get_paths()['purelib']");
  for (const w of wheels) py.unpackArchive(w, 'wheel', { extractDir: site });
  py.runPython('import importlib; importlib.invalidate_caches()');
  // kpsewhich for latexrestricted, answered by Galley's shell
  self.galleyKpsewhich = (args, cwd) => {
    const r = SHELL.capture(['kpsewhich', ...args.toJs ? args.toJs() : args], cwd);
    return [r.code, r.out];
  };
  py.runPython(`
import os, sys, subprocess, shutil, js
os.environ['SELFAUTOLOC'] = '/texlive/bin'
os.makedirs('/texlive/bin', exist_ok=True)
with open('/texlive/bin/kpsewhich', 'w') as f: f.write('')
os.chmod('/texlive/bin/kpsewhich', 0o755)
_which = shutil.which
def _galley_which(cmd, mode=os.F_OK | os.X_OK, path=None):
    return '/texlive/bin/kpsewhich' if os.path.basename(str(cmd)) == 'kpsewhich' else None
shutil.which = _galley_which
def _galley_run(cmd, *a, **k):
    args = [str(x) for x in cmd]
    if os.path.basename(args[0]) != 'kpsewhich':
        raise FileNotFoundError(args[0])
    code, out = js.galleyKpsewhich(args[1:], os.getcwd())
    out = str(out).encode()
    return subprocess.CompletedProcess(args, int(code), out if k.get('capture_output') or k.get('stdout') else None, b'')
subprocess.run = _galley_run
def galley_fresh_latexminted():
    # latexminted and latexrestricted fix TeX's folder when they are imported, so each run gets
    # fresh modules (a run is one process on a desktop)
    for _m in [m for m in sys.modules if m.split('.')[0] in ('latexminted', 'latexrestricted', 'latex2pydata')]:
        del sys.modules[_m]
    import argparse, latexminted.cmdline as _lmc
    # latexminted 0.6.0 (the one minted 3.7, in BusyTeX's TeX Live, asks for) predates Python
    # 3.14, whose argparse passes color= to subcommand parsers; its parser class takes no such
    # argument (0.7.0, with minted 3.8, does; dropping it there only drops colored help)
    for _cls in [c for c in vars(_lmc).values() if isinstance(c, type) and issubclass(c, argparse.ArgumentParser)]:
        _orig = _cls.__init__
        def _init(self, *a, _orig=_orig, **k):
            k.pop('color', None); k.pop('suggest_on_error', None)
            return _orig(self, *a, **k)
        _cls.__init__ = _init
    return _lmc.main
`);
  const FS2 = py.FS;
  return {
    run(argv, io, h) {
      const cwd = io.env.cwd;
      const root = cwd.split('/').slice(0, 5).join('/');
      mirrorFolder(FS2, root);
      const before = folderState(FS2, root);
      mkdirsIn(FS2, cwd);
      const name = argv[0].replace(/^.*\//, '');
      out.s = '';
      let code = 0;
      py.globals.set('galley_argv', py.toPy([name, ...argv.slice(1)]));
      py.globals.set('galley_cwd', cwd);
      try {
        code = py.runPython(`
import os, sys
os.chdir(galley_cwd)
sys.argv = list(galley_argv)
code = 0
try:
    if sys.argv[0] == 'pygmentize':
        from pygments.cmdline import main as _m
        code = _m(sys.argv) or 0
    else:
        galley_fresh_latexminted()()
except SystemExit as e:
    code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
code
`);
      } catch (e) { out.s += String(e) + '\n'; code = 1; }
      // minted highlights at the end of the document; TeX reads the result on its next pass
      if (copyBackChanged(FS2, root, before) && /^(batch|highlight)$/.test(argv[1] || '')) SHELL.state.rerun = true;
      if (code) io.err(out.s.slice(-2000));
      return code;
    }
  };
}
