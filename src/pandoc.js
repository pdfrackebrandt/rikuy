// pandoc 3 as the pandoc project builds it for WebAssembly (npm's pandoc-wasm), run on an
// in-memory WASI file system. Adapted from pandoc-wasm's src/core.js (MIT): the same calls into
// the module (hs_init_with_rtsopts, then convert or query with options as JSON), with files in
// folders (figures/plot.png), which core.js keeps flat and pandoc then cannot find, and limits on
// what a run may write. Used by the Word worker (src/wordworker.js) and by the node tests.
import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: false });

const bytesOf = (v) => (typeof v === 'string' ? enc.encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v));

export async function createPandoc(wasm) {
  const args = ['pandoc.wasm', '+RTS', '-H64m', '-RTS'];
  const root = new Map();
  const pre = new PreopenDirectory('/', root);
  // pandoc's own messages go to its stderr file (below); these catch the runtime's
  const fds = [new OpenFile(new File(new Uint8Array(), { readonly: true })), ConsoleStdout.lineBuffered(() => {}), ConsoleStdout.lineBuffered(() => {}), pre];
  const wasi = new WASI(args, [], fds, { debug: false });
  const { instance } = await WebAssembly.instantiate(wasm instanceof WebAssembly.Module ? wasm : await WebAssembly.compile(wasm), { wasi_snapshot_preview1: wasi.wasiImport })
    .then((r) => (r instanceof WebAssembly.Instance ? { instance: r } : r));
  wasi.initialize(instance);
  instance.exports.__wasm_call_ctors();
  const X = instance.exports;
  const view = () => new DataView(X.memory.buffer);
  const put = (s) => {
    const b = enc.encode(s);
    const p = X.malloc(b.length + 1);
    new Uint8Array(X.memory.buffer, p, b.length).set(b);
    view().setUint8(p + b.length, 0);
    return [p, b.length];
  };
  const argc = X.malloc(4);
  view().setUint32(argc, args.length, true);
  const argv = X.malloc(4 * (args.length + 1));
  args.forEach((a, i) => view().setUint32(argv + 4 * i, put(a)[0], true));
  view().setUint32(argv + 4 * args.length, 0, true);
  const argvp = X.malloc(4);
  view().setUint32(argvp, argv, true);
  X.hs_init_with_rtsopts(argc, argvp);

  // a file at a path, its folders made as needed
  const putFile = (path, data, readonly) => {
    const parts = path.split('/').filter((p) => p && p !== '.');
    if (!parts.length || parts.some((p) => p === '..')) throw new Error('bad path ' + path);
    let dir = pre.dir;
    for (const p of parts.slice(0, -1)) {
      let d = dir.contents.get(p);
      if (!(d instanceof Directory)) { d = new Directory(new Map()); d.parent = dir; dir.contents.set(p, d); }
      dir = d;
    }
    const f = new File(bytesOf(data), { readonly: !!readonly });
    dir.contents.set(parts[parts.length - 1], f);
    return f;
  };
  const walk = (dir, prefix, out) => {
    for (const [n, e] of dir.contents) {
      const p = prefix ? prefix + '/' + n : n;
      if (e instanceof Directory) walk(e, p, out); else out.set(p, e);
    }
    return out;
  };
  const setup = () => {
    root.clear();
    return { out: putFile('stdout', ''), err: putFile('stderr', ''), warn: putFile('warnings', '') };
  };

  // options: pandoc's defaults file as JSON (from, to, output-file, input-files, citeproc...);
  // files: { path: string | Uint8Array }. Returns stdout, stderr, warnings, and every file the
  // run wrote ({ path: Uint8Array }: the output file, extracted media).
  function convert(options, stdin, files = {}) {
    const io = setup();
    const known = new Set(['stdout', 'stderr', 'warnings', 'stdin']);
    putFile('stdin', stdin || '', true);
    for (const [n, v] of Object.entries(files)) { putFile(n, v, true); known.add(n.split('/').filter(Boolean).join('/')); }
    if (options['output-file']) { putFile(options['output-file'], ''); known.delete(options['output-file']); }
    const [p, n] = put(JSON.stringify(options));
    if (stdin) fds[0] = new OpenFile(root.get('stdin'));
    try { X.convert(p, n); } finally { X.free && X.free(p); }
    const written = {};
    for (const [path, f] of walk(pre.dir, '', new Map())) if (!known.has(path) && f.data && f.data.length) written[path] = f.data;
    let warnings = [];
    try { const w = dec.decode(io.warn.data); if (w) warnings = JSON.parse(w); } catch (e) { warnings = []; }
    const out = { stdout: dec.decode(io.out.data), stderr: dec.decode(io.err.data), warnings, files: written };
    root.clear();
    return out;
  }

  function query(options) {
    const io = setup();
    const [p, n] = put(JSON.stringify(options));
    try { X.query(p, n); } finally { X.free && X.free(p); }
    const t = dec.decode(io.out.data);
    root.clear();
    return JSON.parse(t);
  }

  return { convert, query, memory: () => X.memory.buffer.byteLength };
}
