// xindy as the worker runs it: tools.js's front ends (xindyCommand) on the program
// build_tools.sh made, with TeX Live's modules, against the outputs of Debian's xindy 2.5.1 on
// CLISP for the same commands (tests/cases.txt).
// Usage: node --no-experimental-fetch test.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const TEX = path.join(HERE, '..', '..');
const MODULES = '/texlive/texmf-dist/xindy/modules';

// xindyOptions and xindyCommand, as tools.js has them
const src = fs.readFileSync(path.join(TEX, 'tools.js'), 'utf8');
const extract = (name) => {
  const a = src.indexOf('function ' + name + '(');
  return src.slice(a, src.indexOf('\n}\n', a) + 3);
};
const ctx = vm.createContext({ XINDY_MODULES: MODULES, flushProxyCache() {}, noteIndexed() {}, TextDecoder, TextEncoder, Uint8Array });
vm.runInContext(extract('xindyOptions') + extract('xindyCommand'), ctx);

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}

(async () => {
  const out = { o: '', e: '', s: '' };
  // the program's script, loaded as the CommonJS it is (this package's .js files are modules)
  // XINDY_DIR: a build to test instead of the vendored one (build_tools.sh with RIKUY_VENDOR)
  const file = path.join(process.env.XINDY_DIR || path.join(TEX, 'vendor/xindy'), 'xindy.js');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', fs.readFileSync(file, 'utf8'))(m, m.exports, require, path.dirname(file), file);
  const P = await m.exports({
    noInitialRun: true,
    print: (t) => { out.o += t + '\n'; out.s += t + '\n'; },
    printErr: (t) => { out.e += t + '\n'; out.s += t + '\n'; }
  });
  const mods = path.join(TEX, 'vendor/xindy/modules');
  for (const f of walk(mods)) {
    const p = MODULES + '/' + path.relative(mods, f);
    P.FS.mkdirTree(p.slice(0, p.lastIndexOf('/')));
    P.FS.writeFile(p, fs.readFileSync(f));
  }
  let t = Date.now();
  if (P._xindy_boot()) throw new Error('boot failed');
  console.log('boot', Date.now() - t, 'ms');
  const snap = P.HEAPU8.slice();
  const G = {
    P, out,
    call(argv) {
      out.o = ''; out.e = ''; out.s = '';
      const enc = new TextEncoder();
      const ptrs = argv.map((x) => { const b = enc.encode(x + '\0'); const q = P._malloc(b.length); P.HEAPU8.set(b, q); return q; });
      const av = P._malloc(4 * (ptrs.length + 1));
      ptrs.forEach((q, i) => { P.HEAP32[(av >> 2) + i] = q; });
      P.HEAP32[(av >> 2) + ptrs.length] = 0;
      let code;
      try { code = P._galley_main(ptrs.length, av); } catch (e) { code = e && e.status != null ? e.status : 1; if (!(e && e.status != null)) out.e += String(e) + '\n'; }
      P._fflush(0);
      const h = P.HEAPU8;
      h.set(snap);
      if (h.length > snap.length) h.fill(0, snap.length);
      return code;
    }
  };
  const work = '/work';
  P.FS.mkdirTree(work);
  for (const f of fs.readdirSync(path.join(HERE, 'tests'))) P.FS.writeFile(work + '/' + f, fs.readFileSync(path.join(HERE, 'tests', f)));
  const h = {
    abs: (p) => path.posix.resolve(work, p),
    isFile: (p) => { try { return P.FS.isFile(P.FS.stat(p).mode); } catch (e) { return false; } },
    readB: (p) => P.FS.readFile(p),
    FS: () => P.FS
  };
  let pass = 0, n = 0;
  for (const line of fs.readFileSync(path.join(HERE, 'tests/cases.txt'), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [name, cmd] = line.split('|').map((x) => x.trim());
    const argv = cmd.split(/\s+/);
    const o = argv[argv.indexOf('-o') + 1];
    try { P.FS.unlink(work + '/' + o); } catch (e) { /* none yet */ }
    let err = '';
    t = Date.now();
    const code = ctx.xindyCommand(G, argv, { env: { cwd: work }, out() {}, err: (x) => { err += x; }, stdin: '' }, h);
    let got = null;
    try { got = Buffer.from(P.FS.readFile(work + '/' + o)); } catch (e) { /* not written */ }
    const want = fs.readFileSync(path.join(HERE, 'tests', name + '.out'));
    const ok = code === 0 && got && got.equals(want);
    n++; if (ok) pass++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ' (' + (Date.now() - t) + ' ms)' + (ok ? '' : ' code ' + code + ' ' + err.slice(0, 300)));
  }
  console.log(pass + '/' + n + ' match xindy 2.5.1 on CLISP');
  process.exit(pass === n ? 0 : 1);
})();
