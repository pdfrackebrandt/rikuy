// The native core: the editor's pure computation over long texts compiled from C++
// (tex/native/core/, built by tex/build_tools.sh core into tex/vendor/core/rikuy-core.wasm).
// WebAssembly reaches no page and every string crossing into it is copied, so only work that
// is pure, long and called with few crossings lives there; the JavaScript it replaces stays as
// the fallback and as the reference the tests hold it to (test/native.test.mjs: the same result
// on the corpus and on thousands of random edits).
//
// The page fetches it once it is in use (src/app.js, loadCoreLater: the file build.mjs puts beside
// the page, checked against the hash in the bundle) and hands the bytes to loadCore; until then,
// or where it fails to load, everything runs in JavaScript as before. Ported so far:
//   parse (src/parser.js): parse.cc; the tree comes back as numbers, made into the same objects
//     here (readTree), strings sliced from the source.
import { PARSE_TABLES, setNativeParse } from './parser.js';

let X = null;          // the instance's exports
// texts shorter than this are parsed in JavaScript: a macro's body, a .bib field, a cell's text,
// where the crossing costs about what the C++ saves (dev/bench_native.mjs: 1.6 times on a file of
// 766 code units, 2 and more from a few thousand)
export const PARSE_MIN = 600;
// what the core did, for the tests and the status line
export const coreStats = { parsed: 0, fellBack: 0 };

export function coreReady() { return !!X; }

// bytes: the module (a Uint8Array or ArrayBuffer). Resolves to true when the core runs.
export async function loadCore(bytes) {
  try {
    const { instance } = await WebAssembly.instantiate(bytes, { env: { emscripten_notify_memory_growth() {} } });
    const x = instance.exports;
    if (x._initialize) x._initialize();
    X = x;
    if (!tables()) { X = null; return false; }
    setNativeParse(nativeParse);
    return true;
  } catch (e) {
    X = null;
    return false;
  }
}

// a string into the core's text buffer, as UTF-16 code units: the offsets the editor counts in.
// A well formed string goes as UTF-8 through TextEncoder.encodeInto, which copies a long text
// many times faster than a loop of charCodeAt, and the core makes it UTF-16 again; one with a
// lone surrogate (which UTF-8 cannot carry) goes code unit by code unit.
const ENC = typeof TextEncoder === 'function' ? new TextEncoder() : null;
function put(s) {
  const n = s.length;
  if (ENC && n > 64 && typeof s.isWellFormed === 'function' && s.isWellFormed()) {
    const p8 = X.core_text8(3 * n);
    if (p8) {
      const r = ENC.encodeInto(s, new Uint8Array(X.memory.buffer, p8, 3 * n));
      if (r.read === n && X.core_utf8(r.written, n) === n) return true;
    }
  }
  const p = X.core_text(n);
  if (!p && n) return false;
  const u = new Uint16Array(X.memory.buffer, p, n);
  for (let k = 0; k < n; k++) u[k] = s.charCodeAt(k);
  return true;
}

// (for test/native.test.mjs: a string through put and back, as the core holds it)
export function coreText(s) {
  if (!X || !put(s)) return null;
  const u = new Uint16Array(X.memory.buffer, X.core_text(s.length), s.length);
  let out = '';
  for (let k = 0; k < u.length; k += 4096) out += String.fromCharCode.apply(null, u.subarray(k, k + 4096));
  return out;
}

// parser.js's tables, once: sections split by U+0003, entries by U+0001, key and value by U+0002
function tables() {
  const T = PARSE_TABLES;
  const obj = (o) => Object.keys(o).map((k) => k + '\u0002' + o[k]).join('\u0001');
  const set = (s) => [...s].join('\u0001');
  const keys = (o) => Object.keys(o).join('\u0001');
  const text = [obj(T.SIG), keys(T.CHARS), keys(T.ACCENTS), obj(T.ENV_SIG), set(T.MATH_ENVS), set(T.RAW_ENVS), set(T.DEF_CMDS), set(T.ENV_DEF), set(T.DIM_CMDS), set(T.PLAIN_ENVS)].join('\u0003');
  return put(text) && X.core_parse_tables(text.length) === 1;
}

// the document's own signatures, sent again only when they change
let lastUser = null;
function userSigs(sigs) {
  let s = '';
  for (const k in sigs) if (Object.prototype.hasOwnProperty.call(sigs, k)) s += k + '\u0002' + sigs[k] + '\u0001';
  if (s === lastUser) return true;
  lastUser = null;
  if (!put(s) || X.core_parse_user(s.length) !== 1) return false;
  lastUser = s;
  return true;
}

// parse() through the core: the tree parseJS makes, or null where the core does not answer
export function nativeParse(src, sigs, force) {
  if (!X || (!force && src.length < PARSE_MIN)) return null;
  const sp = X.stackSave();
  try {
    if (!userSigs(sigs) || !put(src)) { coreStats.fellBack++; return null; }
    const len = X.core_parse(src.length);
    if (len < 0) { coreStats.fellBack++; return null; }
    const B = new Int32Array(X.memory.buffer, X.core_out(), len);
    coreStats.parsed++;
    return readTree(src, B);
  } catch (e) {
    // (a trap: the stack past its end, memory refused) JavaScript parses
    X.stackRestore(sp);
    lastUser = null;
    coreStats.fellBack++;
    return null;
  }
}

// The numbers back into parseJS's objects, field for field and in its order of keys
// (tex/native/core/parse.cc names the kinds).
const SPECIAL_CH = { 65536: '$$', 65537: '\\(', 65538: '\\[' };
const DELIM = ['$', '$$', '\\(', '\\['];
function readTree(src, B) {
  let p = 0;
  const list = () => {
    const n = B[p++], out = [];
    for (let k = 0; k < n; k++) out.push(node());
    return out;
  };
  const arg = () => {
    const tag = B[p++];
    if (tag === 0) return null;
    const s = B[p++], e = B[p++], is = B[p++], ie = B[p++];
    if (tag === 1) return { o: true, s, e, is, ie, nodes: list() };
    if (tag === 2) return { o: false, s, e, is, ie, nodes: [], raw: true };
    if (tag === 3) return { o: false, s, e, is, ie, nodes: list() };
    return { o: false, s, e, is, ie, nodes: [node()], single: true };
  };
  const args = () => {
    const n = B[p++], out = [];
    for (let k = 0; k < n; k++) out.push(arg());
    return out;
  };
  const nargs = (mode, a, b) => (mode ? parseInt(src.slice(a, b), 10) || 0 : a);
  const node = () => {
    switch (B[p++]) {
      case 1: { const s = B[p++], e = B[p++]; return { t: 'text', s, e }; }
      case 2: {
        const c = B[p++], s = B[p++], e = B[p++], err = B[p++];
        const ch = c > 65535 ? SPECIAL_CH[c] : String.fromCharCode(c);
        return err ? { t: 'special', ch, s, e, err: true } : { t: 'special', ch, s, e };
      }
      case 3: { const s = B[p++], e = B[p++]; return { t: 'comment', s, e }; }
      case 4: { const s = B[p++], e = B[p++], nl = B[p++]; return { t: 'par', s, e, nl }; }
      case 5: { const s = B[p++], e = B[p++], is = B[p++], ie = B[p++]; return { t: 'group', s, e, is, ie, nodes: list() }; }
      case 6: { const s = B[p++], e = B[p++], is = B[p++], ie = B[p++], display = B[p++] === 1, delim = DELIM[B[p++]]; return { t: 'math', s, e, is, ie, display, delim }; }
      case 7: {
        const a = B[p++], b = B[p++], s = B[p++], e = B[p++], ne = B[p++], star = B[p++] === 1, x = B[p++];
        const node = { t: 'cmd', name: src.slice(a, b), s, e, ne, star, args: args() };
        if (x === 1) node.unknown = true;
        else if (x === 2) node.accent = true;
        else if (x === 3) node.def = def();
        return node;
      }
      case 8: {
        const mode = B[p++], a = B[p++], b = B[p++], s = B[p++], e = B[p++], err = B[p++];
        const name = mode === 0 ? src.slice(a, b) : mode === 1 ? 'begin{' + src.slice(a, b) + '}' : mode === 2 ? 'begin' : '';
        return err ? { t: 'stray', name, s, e, err: true } : { t: 'stray', name, s, e };
      }
      case 9: { const s = B[p++], e = B[p++], is = B[p++], ie = B[p++]; return { t: 'verb', s, e, is, ie }; }
      case 10: {
        const a = B[p++], b = B[p++], s = B[p++], e = B[p++], bs = B[p++], be = B[p++], es = B[p++], nameEnd = B[p++], raw = B[p++] === 1, math = B[p++] === 1;
        const name = src.slice(a, b), as = args();
        if (raw) return { t: 'env', name, s, e, bs, be, es, args: as, raw: true, math, nameEnd };
        return { t: 'env', name, s, e, bs, be, es, args: as, nodes: list(), nameEnd };
      }
    }
    throw new Error('native parse: unknown node kind at ' + (p - 1));
  };
  const def = () => {
    const k = B[p++];
    if (k === 1) { const a = B[p++], b = B[p++], c = B[p++], d = B[p++]; return { kind: 'let', name: src.slice(a, b), body: src.slice(c, d) }; }
    if (k === 2) return { kind: 'op' };
    const a = B[p++], b = B[p++], mode = B[p++], na = B[p++], nb = B[p++], c = B[p++], d = B[p++], f = B[p++], g = B[p++];
    if (k === 3) return { kind: 'cmd', name: src.slice(a, b), nargs: nargs(mode, na, nb), dflt: c >= 0 ? src.slice(c, d) : null, body: f >= 0 ? src.slice(f, g) : '', bs: f, be: g };
    return { kind: 'env', name: src.slice(a, b), nargs: nargs(mode, na, nb), begin: c >= 0 ? src.slice(c, d) : '', end: f >= 0 ? src.slice(f, g) : '' };
  };
  return list();
}
