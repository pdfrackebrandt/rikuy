// The native core (src/native.js, tex/native/core/) against the JavaScript it replaces: for
// every ported function the same result, value for value and key for key, on the repository's
// documents, a long generated one, random TeX-like text and thousands of random edits of real
// documents; and the fallbacks (no core, nesting past its depth, a lone surrogate).
//   node test/native.test.mjs [CORPUS_DIR]   with a LaTeX-examples clone: every .tex, .sty, .cls
//   and .bib of it too, and every document's model built both ways (buildModel) compared whole.
import fs from 'fs';
import path from 'path';
import { parse, parseJS, scanUserSigs, PARSE_TABLES, MATH_SCAN, MATH_BUDGET } from '../src/parser.js';
import { loadCore, nativeParse, coreReady, coreStats, coreText, PARSE_MIN } from '../src/native.js';

const root = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail === undefined ? '' : String(detail).slice(0, 600)); } };

// before the core loads, parse is parseJS
check('no core: parse is JavaScript', !coreReady() && JSON.stringify(parse('\\textbf{a} b')) === JSON.stringify(parseJS('\\textbf{a} b', {})));

const wasm = path.join(root, 'tex/vendor/core/rikuy-core.wasm');
check('the core loads', await loadCore(fs.readFileSync(wasm)));

// a seeded generator: the same cases on every run, so a failure can be repeated
let seed = 20261113;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

let firstDiff = null;
const same = (name, src, sigs) => {
  const a = JSON.stringify(parseJS(src, sigs));
  const r = nativeParse(src, sigs, true);
  if (!r) { check(name + ': the core answers', false, 'null for ' + JSON.stringify(src.slice(0, 200))); return false; }
  const b = JSON.stringify(r);
  if (a !== b) {
    let k = 0;
    while (a[k] === b[k]) k++;
    if (!firstDiff) firstDiff = { name, src };
    check(name, false, 'source ' + JSON.stringify(src.slice(0, 300)) + '\n   JS ' + a.slice(Math.max(0, k - 120), k + 120) + '\n   C++ ' + b.slice(Math.max(0, k - 120), k + 120));
    return false;
  }
  return true;
};

// ---- documents --------------------------------------------------------------------------------
const docs = [];
const walk = (d, out) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(tex|sty|cls|bib)$/.test(e.name)) out.push(p); } };
walk(path.join(root, 'sample'), docs);
walk(path.join(root, 'dev/bench'), docs);
walk(path.join(root, 'test/fixtures'), docs);
const texts = docs.map((f) => fs.readFileSync(f, 'utf8'));

// a long generated document: sections, math, citations, references, styles, macros
function longDoc(paras) {
  const words = 'the model of capital and trade is identified from a shock to demand when commitment absent regulator estimator regions price index'.split(' ');
  const out = ['\\documentclass{article}', '\\usepackage{amsmath}', '\\newcommand{\\E}[1]{\\mathbb{E}\\left[#1\\right]}', '\\newcommand\\R{\\mathbb{R}}', '\\def\\foo#1#2{#1 and #2}', '\\begin{document}'];
  for (let p = 0; p < paras; p++) {
    if (p % 40 === 0) out.push('\\section{Part ' + p + '}\\label{sec:' + p + '}', '');
    const w = [];
    for (let k = 0; k < 14; k++) {
      const r = rnd();
      w.push(r < 0.05 ? '$x_{' + k + '} = \\alpha$' : r < 0.08 ? '\\textbf{' + pick(words) + '}' : r < 0.1 ? '\\cite[p.~3]{ref' + k + '}' : r < 0.11 ? '\\E{x}' : r < 0.12 ? '\\foo{a}{b}' : r < 0.13 ? '% a comment\n' : pick(words));
    }
    out.push(w.join(' ') + '.', p % 17 === 3 ? '\\begin{equation}\\label{eq:' + p + '} y = \\E{x}\\end{equation}' : '', '');
  }
  out.push('\\end{document}');
  return out.join('\n');
}
texts.push(longDoc(1500));
let ok = 0;
texts.forEach((t, k) => { if (same('document ' + (docs[k] || 'generated'), t, scanUserSigs(t, {}))) ok++; });
check('every document of the repository and a generated one the same (' + ok + ' of ' + texts.length + ')', ok === texts.length);

// ---- random TeX-like text ----------------------------------------------------------------------
// the pieces parser.js treats specially, and some it must take as text
const PIECES = ['\\begin{', '\\end{', '\\begin {', '\\end {', '}', '{', '[', ']', '(', ')', '$', '$$', '\\(', '\\)', '\\[', '\\]', '%', '% c\n', '\n', '\n\n', '\n \n', ' ', '  ', '\t', '\r\n',
  '\\verb|x|', '\\verb', '\\verb*+a+', '|', '\\newcommand', '\\renewcommand*', '\\providecommand', '\\newcommand{\\x}[2][d]{#1#2}', '\\def', '\\def\\a#1#2{', '\\gdef', '\\let', '\\let\\a=\\b', '\\let\\a=', '\\let\\ab',
  '\\vskip', '\\hskip -1.5pt plus 1fil minus 2pt', ' 3pt', '-', '.', '1', 'fill', 'plus', 'minus', '\\kern\\x', '\\vspace_', '#1', '#',
  '\\textbf', '\\section', '\\section*', '\\item', '\\item[', '\\', '\\\\', '\\\\*', '\\\\[2pt]', '*', '\\*', '\\%', '\\{}', '\\ldots{}', '\\S', '\\%{b}',
  'a', 'b', 'text', 'é', '😀', '\u2028', '\u00a0', '\u3000', '\ufeff', "\\'", "\\'e", '\\"{o}', '\\c c', '\\u{g}', '\\H', '\\^', '\\~', '~', '&', '^', '_',
  'equation', 'equation*', 'align', 'alignat', 'verbatim', 'Verbatim', 'lstlisting', 'minted', 'itemize', 'tikzpicture', 'document', 'center', 'tabular', 'figure', 'myenv', 'constructor', 'toString',
  '\\tikzstyle{s}=[a]', '\\tikzstyle', '=', '+=', '\\newenvironment', '\\newenvironment{e}[1]{\\begin{tikzpicture}}{\\end{tikzpicture}}', '\\renewenvironment{', '\\DeclareMathOperator', '\\DeclareMathOperator*{\\argmax}{arg\\,max}',
  '\\newtheorem{thm}{Theorem}', '\\newtheorem*', '\\url', '\\url{a%b}', '\\href{x}{y}', '\\cite', '\\citep[a][b]{k}', '\\constructor', '\\hasOwnProperty{x}', '\\toString', '\\unknown', '\\unknown[x]{y}', '\\cmidrule(lr){1-2}',
  '\\input{f}', '\\label{x}', '\\ref', '\\frac{1}{2}', '\\mbox{', '\\cline', '\\multicolumn{2}{c}{x}',
  // glue as \\vskip reads it (fill before fil, units the first part has and plus or minus lack),
  // carriage returns where a blank line is looked for
  '\\vskip 1pt plus 2fill', '\\hskip 0pt plus 1filll minus 3pt', '\\vspace_ 2em plus 1fil', '\\kern-.5em', '\\vskip\\baselineskip plus 1fill minus 1fil',
  '\\mskip 3mu plus 2bp', '\\hskip 2cc minus 1sp', '\\vskip -0.5dd plus -1fil', '\r', '\n\r\n', '\n\t\r\n', '$a\n\r\nb$',
  // names that differ in one bit of a character past the BMP (U+1F600 and U+1F400 share a high
  // surrogate), and in a character of three bytes
  '\\begin{😀}', '\\end{🐀}', '\\end{😀}', '\\begin{ü}', '\\end{ű}', '\\verb😀x😀', '\\verb🐀x😀'];
let fuzzOk = 0;
const FUZZ = 3000;
for (let k = 0; k < FUZZ; k++) {
  let s = '';
  const n = 1 + Math.floor(rnd() * 60);
  for (let q = 0; q < n; q++) s += pick(PIECES);
  // the document's own signatures: the ones in it, and now and then odd ones
  const sigs = scanUserSigs(s, {});
  if (rnd() < 0.3) { sigs[pick(['a', 'b', 'x', 'textbf', 'myenv', 'constructor'])] = pick(['', 'm', 'om', 'mm', 'oom', 'p', 'v', 'raw']); sigs[' rawenv:' + pick(['myenv', 'center', 'e'])] = 'raw'; }
  if (same('random text ' + k, s, sigs)) fuzzOk++;
}
check('random TeX-like text the same (' + fuzzOk + ' of ' + FUZZ + ')', fuzzOk === FUZZ);
console.log('random texts: ' + fuzzOk + ' of ' + FUZZ + ' the same tree');

// ---- random edits of real documents ------------------------------------------------------------
const EDITS = 2000;
let editOk = 0;
const pool = texts.filter((t) => t.length > 200);
for (let k = 0; k < EDITS; k++) {
  let t = pick(pool);
  const at = Math.floor(rnd() * t.length);
  const del = rnd() < 0.5 ? Math.floor(rnd() * 30) : 0;
  let ins = '';
  const m = Math.floor(rnd() * 4);
  for (let q = 0; q < m; q++) ins += pick(PIECES);
  t = t.slice(0, at) + ins + t.slice(at + del);
  if (same('edit ' + k, t, scanUserSigs(t, {}))) editOk++;
}
check('random edits of the documents the same (' + editOk + ' of ' + EDITS + ')', editOk === EDITS);
console.log('random edits: ' + editOk + ' of ' + EDITS + ' the same tree; documents: ' + ok + ' of ' + texts.length);

// ---- the text as the core holds it --------------------------------------------------------------
// every way a code unit travels: ASCII, two and three bytes of UTF-8, a pair of surrogates, a lone
// surrogate (no UTF-8 at all: code unit by code unit), at the ends and in long runs
const UNITS = [0x41, 0x0a, 0x7f, 0x80, 0xe9, 0x7ff, 0x800, 0x3b1, 0x4e2d, 0xfffd, 0xfeff, 0xffff];
let textOk = 0;
const TEXTS = 400;
for (let k = 0; k < TEXTS; k++) {
  let s = '';
  const n = Math.floor(rnd() * (k < 200 ? 40 : 3000));
  for (let q = 0; q < n; q++) {
    const r = rnd();
    if (r < 0.6) s += String.fromCharCode(pick(UNITS));
    else if (r < 0.9) s += String.fromCodePoint(0x10000 + Math.floor(rnd() * 0xfffff));
    else if (r < 0.95 && k % 3 === 0) s += String.fromCharCode(0xd800 + Math.floor(rnd() * 0x800));
    else s += String.fromCharCode(32 + Math.floor(rnd() * 95));
  }
  if (coreText(s) === s) textOk++;
  else check('text through the core ' + k, false, JSON.stringify(s.slice(0, 80)));
}
check('every text through the core and back unchanged (' + textOk + ' of ' + TEXTS + ')', textOk === TEXTS);

// ---- what used to hang or throw, either way ----------------------------------------------------
for (const [name, s] of [['\\newenvironment{x}[ with no ] (parsed for ever)', 'a \\newenvironment{x}[2 {b'], ['\\constructor{a} (threw)', '\\constructor{a} \\hasOwnProperty{b}'], ['\\begin{toString} (threw)', '\\begin{toString}x\\end{toString}'], ['\\valueOf', '\\valueOf x \\isPrototypeOf{y}']]) {
  let js = null, nat = null;
  try { js = JSON.stringify(parseJS(s, scanUserSigs(s, {}))); } catch (e) { js = 'throws ' + e.message; }
  try { nat = JSON.stringify(nativeParse(s, scanUserSigs(s, {}), true)); } catch (e) { nat = 'throws ' + e.message; }
  check(name + ': JavaScript parses it', !js.startsWith('throws'), js);
  check(name + ': the core parses it the same', js === nat, nat);
}
check('\\constructor{a} is an unknown command with its argument', parseJS('\\constructor{a}', {})[0].unknown === true && parseJS('\\constructor{a}', {})[0].args.length === 1);

// ---- searches that once ran to the end for every occurrence -------------------------------------
// (each of these took 2 to 7 seconds, in JavaScript, in the core or both, before the searches
// were remembered: a crafted file a stranger can send, parsed again at every keystroke)
for (const [name, s] of [['\\( without \\)', 'a\\('.repeat(40000)], ['\\[ without \\]', 'a\\['.repeat(40000)], ['an unknown command\'s [ without ]', 'a\\x['.repeat(40000)],
  ['\\begin{equation} without its end', '\\begin{equation}'.repeat(20000)], ['\\begin{verbatim} without its end, \\end { verbatim } spaced', '\\begin{verbatim}x\\end { verbatim }'.repeat(2) + '\\begin{verbatim}'.repeat(20000)],
  ['\\newcommand{\\a}[ without ]', '\\newcommand{\\a}['.repeat(20000)],
  // a $ that never closes (braces TeX does not count, inside \verb or verbatim): 6.7 s and 2.3 s
  ['$ then \\verb|{|', '$\\verb|{|'.repeat(22000)], ['the same, 990 KB', '$\\verb|{|'.repeat(110000)], ['$ then a verbatim with {', '$\\begin{verbatim}{\\end{verbatim}'.repeat(6000)],
  ['$$ then \\verb|$|', '$$\\verb|$|'.repeat(15000)],
  // 8000 raw environments of 8000 names, none ended (2.3 s in JavaScript, 4.6 s in the core)
  ['8000 raw environments of different names without their end', (() => { const nm = (k) => 'e' + k.toString(26).replace(/[0-9]/g, (d) => 'qrstuvwxyz'[d]); let u = '', d = ''; for (let k = 0; k < 8000; k++) { u += '\\begin{' + nm(k) + '}'; d += '\\newenvironment{' + nm(k) + '}{\\tikz}{}\n'; } return u + d; })()]]) {
  const sigs = scanUserSigs(s, {});
  let t = performance.now();
  const js = JSON.stringify(parseJS(s, sigs));
  const tJS = performance.now() - t;
  t = performance.now();
  const c = JSON.stringify(nativeParse(s, sigs, true));
  const tC = performance.now() - t;
  check(name + ': JavaScript in ' + tJS.toFixed(0) + ' ms, the core in ' + tC.toFixed(0) + ' ms (under 1500 each), the same tree', tJS < 1500 && tC < 1500 && js === c, [tJS, tC, js === c]);
}

// a formula of any length closes while the failed scans are under their budget: a polynomial of
// computer algebra in $$, 8879 units on one line, is one formula (it was broken text under a fixed
// bound); after the budget is spent, a $ closes within MATH_SCAN units, in both parsers alike
const poly = (() => { let t = '$$', k = 0; while (t.length < 8870) { t += (k % 3 ? ' + ' : ' - ') + (k * 37 % 89 + 1) + ' x^{' + (k % 17) + '} y^{' + (k % 11) + '}'; k++; } return t + ' $$'; })();
const polyDoc = 'The result is\n' + poly + '\nas computed.' + pad0();
function pad0() { return ' '.repeat(700); }
const pt = parseJS(polyDoc, {});
check('a ' + (poly.length - 4) + ' unit $$ polynomial is one formula, the same in both', poly.length - 4 >= 8870 && same('polynomial', polyDoc, {}) && pt.filter((x) => x.t === 'math').length === 1 && !pt.some((x) => x.err));
// (each $ of it scans to the blank line: 9 units times 1 + 2 + ... + 800, past the budget)
const spent = '$\\verb|{|'.repeat(800) + '\n\n';
const atBound = (len) => spent + '$' + 'x'.repeat(len - 1) + '$ y' + ' z'.repeat(400);
check('once ' + MATH_BUDGET + ' units of failed scans are spent, a $ closes within ' + MATH_SCAN + ' units, not past them, the same in both',
  same('bound in', atBound(MATH_SCAN), {}) && same('bound out', atBound(MATH_SCAN + 1), {})
  && parseJS(atBound(MATH_SCAN), {}).some((x) => x.t === 'math' && x.ie - x.is === MATH_SCAN - 1) && !parseJS(atBound(MATH_SCAN + 1), {}).some((x) => x.t === 'math' && x.ie - x.is === MATH_SCAN));
check('before then the same formula closes', same('unspent', atBound(MATH_SCAN + 1).slice(spent.length), {}) && parseJS(atBound(MATH_SCAN + 1).slice(spent.length), {})[0].t === 'math');

// ---- every environment name the repository and the corpus write --------------------------------
// (parseJS keeps no name list of its own beside PARSE_TABLES; a list added inline on one side, as a
// branch editing parseEnv might, fails here for any name a test, a fixture, the editor's code or
// the corpus writes)
const envNames = new Set();
const harvest = (t) => { for (const m of t.matchAll(/\\+begin\s*\{([^{}\\\n]{1,40})\}/g)) envNames.add(m[1].trim()); };
const srcFiles = [];
const walkAll = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'node_modules') continue; const p = path.join(d, e.name); if (e.isDirectory()) walkAll(p); else if (/\.(tex|sty|cls|bib|js|mjs|py)$/.test(e.name)) srcFiles.push(p); } };
for (const d of ['src', 'test', 'sample', 'dev/bench']) walkAll(path.join(root, d));
if (process.argv[2]) walkAll(process.argv[2]);
for (const f of srcFiles) harvest(fs.readFileSync(f, 'utf8'));
// and every word parser.js quotes: a list of names written inline in parseJS is in here too
for (const m of fs.readFileSync(path.join(root, 'src/parser.js'), 'utf8').matchAll(/'([A-Za-z@*]{1,40})'/g)) envNames.add(m[1]);
console.log('environment names: ' + envNames.size);
let envOk = 0, envN = 0;
for (const k of envNames) for (const t of ['\\begin{' + k + '}[o]{m}{m}x\\end{' + k + '}', '\\begin{' + k + '}x', '\\begin{' + k + '} [o] y \\end { ' + k + ' } z']) {
  envN++;
  if (same('environment ' + JSON.stringify(k), pad0() + t + pad0(), scanUserSigs(t, {}))) envOk++;
}
check('every environment name written in the repository' + (process.argv[2] ? ' and the corpus' : '') + ' (' + envNames.size + ' names), the same in both (' + envOk + ' of ' + envN + ')', envOk === envN && envNames.size > 50);

// ---- every entry of every table the core reads -----------------------------------------------------
// (a merge that changes a table or the algorithm on one side only fails here: each name as a
// command with arguments of every kind, with a star, as an environment, and as a raw end)
let tabOk = 0, tabN = 0;
const pad = ' '.repeat(PARSE_MIN);
for (const [tab, v] of Object.entries(PARSE_TABLES)) {
  for (const k of v instanceof Set ? v : Object.keys(v)) {
    const cs = /^[A-Za-z]+$/.test(k) ? '\\' + k : '\\' + k;
    for (const t of [cs + '*[o]{m}{m}(p) x', cs + ' {a} [b] c', cs + 'x {y}', '\\begin{' + k + '}[o]{m}{m}x\\end{' + k + '}', '\\begin{' + k + '}x', '\\begin{' + k + '} y \\end { ' + k + ' } z', '$' + cs + '{$}$']) {
      tabN++;
      if (same('table ' + tab + ' ' + JSON.stringify(k), pad + t + pad, scanUserSigs(t, {}))) tabOk++;
    }
  }
}
check('every entry of every table, read the same by both (' + tabOk + ' of ' + tabN + ')', tabOk === tabN);

// ---- nesting: 200 levels of groups, environments and arguments alike, then JavaScript ------------
const nest = (open, close, d) => open.repeat(d) + 'x' + close.repeat(d) + pad;
check('190 levels of \\textbf{, of itemize and of braces: the core answers, the same tree',
  ['\\textbf{|}', '\\begin{itemize}|\\end{itemize}', '{|}'].every((oc) => { const [o, c] = oc.split('|'); return same('nest ' + o, nest(o, c, 190), {}); }));
check('past 200 of each: JavaScript parses', ['\\textbf{|}', '\\begin{itemize}|\\end{itemize}', '{|}'].every((oc) => { const [o, c] = oc.split('|'); return nativeParse(nest(o, c, 210), {}, true) === null; }));

// ---- fallbacks ---------------------------------------------------------------------------------
const deep = '{'.repeat(400) + 'x' + '}'.repeat(400);
check('nesting past the core\'s depth: the core says no', nativeParse(deep, {}, true) === null);
check('...and parse() gives JavaScript\'s tree', JSON.stringify(parse(deep, { userSigs: {} })) === JSON.stringify(parseJS(deep, {})));
const lone = 'a \\textbf{\ud800} b'.repeat(80) + '\udc00 \\emph{x}';
check('a lone surrogate (no UTF-8 for it): the same tree', same('lone surrogate', lone, {}));
const astral = '😀 \\textbf{𝔸} \\verb😀a😀 ' + 'x'.repeat(700);
check('characters past the BMP: the same tree', same('astral', astral, {}));
check('a short text goes to JavaScript (under ' + PARSE_MIN + ')', nativeParse('\\textbf{a}', {}) === null);
const before = coreStats.parsed;
const longT = texts[texts.length - 1];
check('a long text goes to the core through parse()', JSON.stringify(parse(longT)) === JSON.stringify(parseJS(longT, scanUserSigs(longT, {}))) && coreStats.parsed === before + 1);
// the document's signatures change between calls: the core reads them again
const sA = '\\newcommand{\\x}[1]{#1}\\x{a}' + ' y'.repeat(400), sB = '\\newcommand{\\x}{X}\\x{a}' + ' y'.repeat(400);
check('signatures that change between parses', same('sigs A', sA, scanUserSigs(sA, {})) && same('sigs B', sB, scanUserSigs(sB, {})) && same('sigs A again', sA, scanUserSigs(sA, {})));

// ---- a corpus, and the models built on it ------------------------------------------------------
const corpus = process.argv[2];
if (corpus) {
  const { buildModel } = await import('../src/model.js');
  const { setNativeParse } = await import('../src/parser.js');
  const files = [];
  walk(corpus, files);
  let cOk = 0;
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); if (same('corpus ' + f.replace(corpus, ''), t, scanUserSigs(t, {}))) cOk++; }
  check('every .tex, .sty, .cls and .bib of the corpus the same (' + cOk + ' of ' + files.length + ')', cOk === files.length);
  console.log('corpus files: ' + cOk + ' of ' + files.length + ' the same tree');
  // the model as the page builds it, once with the core and once without
  const ser = (m) => JSON.stringify(m, (k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : typeof v === 'function' ? 'fn' : v));
  let mOk = 0, mDocs = 0;
  const tJS = [], tC = [];
  for (const f of files.filter((x) => x.endsWith('.tex'))) {
    const t = fs.readFileSync(f, 'utf8');
    if (!/\\documentclass/.test(t)) continue;
    mDocs++;
    const dir = path.dirname(f), proj = new Map();
    for (const n of fs.readdirSync(dir)) if (/\.(tex|bib)$/.test(n)) proj.set(n, fs.readFileSync(path.join(dir, n), 'utf8'));
    let a, b;
    // a fresh copy of the files each time: the parse cache keys on the text, and must miss
    setNativeParse(null);
    let t0 = performance.now();
    try { a = ser(buildModel({ files: new Map([...proj].map(([k, v]) => [k, v + ' '])), main: path.basename(f) })); } catch (e) { a = 'throws ' + e.message; }
    tJS.push(performance.now() - t0);
    setNativeParse(nativeParse);
    t0 = performance.now();
    try { b = ser(buildModel({ files: new Map([...proj].map(([k, v]) => [k, v + ' '])), main: path.basename(f) })); } catch (e) { b = 'throws ' + e.message; }
    tC.push(performance.now() - t0);
    if (a === b) mOk++; else check('model of ' + f.replace(corpus, ''), false, 'differs');
  }
  const sum = (x) => x.reduce((s, v) => s + v, 0);
  check('every document\'s model the same with and without the core (' + mOk + ' of ' + mDocs + ')', mOk === mDocs);
  console.log('corpus models: ' + mOk + ' of ' + mDocs + ' the same; JavaScript ' + sum(tJS).toFixed(0) + ' ms, with the core ' + sum(tC).toFixed(0) + ' ms in all');
}

// ---- a second load, and a trap -----------------------------------------------------------------
// (after a new instance the document's signatures must go over again: the same text and
// signatures as before gave wrong trees, with no error)
const sig2 = '\\newcommand{\\mac}[2]{#1#2}\n' + 'Text \\mac {a} {b} more.\n'.repeat(40);
check('the same document before and after a second load of the core', same('before reload', sig2, scanUserSigs(sig2, {})) && (await loadCore(fs.readFileSync(wasm))) && same('after reload', sig2, scanUserSigs(sig2, {})));
// a parse from a JavaScript stack so deep that the core's recursion runs out of it: the core goes
// off for the session (its heap may be half written) and JavaScript parses
const deepDoc = nest('\\begin{itemize}', '\\end{itemize}', 190);
const down = (d) => (d ? down(d - 1) : parse(deepDoc, { userSigs: {} }));
let trapped = false;
for (let d = 0; d < 20000 && !trapped; d += 7) { try { down(d); } catch (e) { /* the JavaScript stack itself */ } trapped = coreStats.trapped > 0; }
if (trapped) {
  check('after a trap the core is off for the session, and parse() is JavaScript\'s', !coreReady() && nativeParse(texts[0], {}, true) === null && JSON.stringify(parse(texts[0])) === JSON.stringify(parseJS(texts[0], scanUserSigs(texts[0], {}))));
  check('and it loads again, giving the same trees', (await loadCore(fs.readFileSync(wasm))) && same('after trap', texts[texts.length - 1], scanUserSigs(texts[texts.length - 1], {})));
} else console.log('(no trap could be made from this stack: the trap checks did not run)');

console.log('native core:', pass, 'passed,', fail, 'failed');
if (fail) process.exitCode = 1;
