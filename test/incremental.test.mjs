// The incremental model build (src/model.js, incremental) against the full build it stands in for:
// after every edit of a random stream the model built from the last one is the model the full
// build makes from the same last model, value for value (the order of keys too), whether the edit
// took the fast path or not; and the same after keystrokes whose moved units no one read.
//   node test/incremental.test.mjs [CORPUS_DIR]   (with a LaTeX-examples clone: every document of it)
import fs from 'fs';
import path from 'path';
import { buildModel, INCR, OFFSET_KEYS } from '../src/model.js';

const root = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail === undefined ? '' : String(detail).slice(0, 800)); } };
const ser = (m) => JSON.stringify(m, (k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v));
const first = (a, b) => { let k = 0; while (a[k] === b[k]) k++; return 'incremental ' + a.slice(Math.max(0, k - 150), k + 150) + '\n   full ' + b.slice(Math.max(0, k - 150), k + 150); };

let seed = 20261114;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
// what is typed: mostly letters and spaces (the fast path), and what must leave it (a citation, a
// reference, a footnote, a blank line, a brace, a $, a macro, a comment, a heading)
const TYPED = ['a', 'b', 'e', 'x', ' ', ' ', 'word ', 'Z', 'é', '😀', '--', "''", '``', '~', '\\textbf{b}', '\\emph{', '}', '{', '$x$', '$x^2', '\\(y\\)', '\\%', '\\&',
  '\\cite{k}', '\\ref{sec:1}', '\\label{new}', '\\footnote{n}', '\n', '\n\n', '% c\n', '\\section{S}', '\\newcommand{\\q}{Q}', '\\verb|v|', '$\\ref{x}$', '\\ldots{}', "\\'e", '\\\\'];

const PLAIN = ['a', 'e', 'n', 's', 't', ' ', 'the ', 'X', 'é', '.', ','];
let steps = 0, fast = 0;
function stream(name, files, main, n) {
  let cur = new Map(files);
  let prev;
  try { prev = buildModel({ files: cur, main }); } catch (e) { return; }
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const t = cur.get(main);
    // a place inside one of the model's paragraphs of this file, now and then anywhere
    const ps = prev.blocks.filter((u) => u.f === main && u.items[0] && u.items[0].type === 'p');
    let at;
    if (ps.length && rnd() < 0.85) { const u = pick(ps); at = u.s + Math.floor(rnd() * (u.e - u.s + 1)); } else at = Math.floor(rnd() * (t.length + 1));
    const del = rnd() < 0.3 ? Math.floor(rnd() * 4) : 0;
    // (typing is mostly letters and spaces: three edits in four)
    const ins = rnd() < 0.15 && del ? '' : rnd() < 0.75 ? pick(PLAIN) : pick(TYPED);
    const next = new Map(cur);
    next.set(main, t.slice(0, at) + ins + t.slice(Math.min(t.length, at + del)));
    const before = INCR.reused;
    INCR.on = true;
    let a, b;
    try { a = buildModel({ files: next, main }, prev); } catch (e) { a = 'throws ' + e.message; }
    INCR.on = false;
    try { b = buildModel({ files: next, main }, prev); } catch (e) { b = 'throws ' + e.message; }
    INCR.on = true;
    steps++;
    if (INCR.reused > before) fast++;
    const sa = typeof a === 'string' ? a : ser(a), sb = typeof b === 'string' ? b : ser(b);
    if (sa !== sb) { check(name + ' edit ' + k + ' at ' + at + ' ' + JSON.stringify(ins) + ' -' + del + (INCR.reused > before ? ' (fast path)' : ' (full)'), false, first(sa, sb)); return; }
    ok++;
    if (typeof b === 'string') return;
    prev = a; cur = next;
  }
  // (a fresh build, with no last model, is not compared: its table of contents lists the headings of
  // its own first pass, a chained build's those of the model before, as Builder.flow does it)
  return ok;
}

const docs = [];
const add = (dir, main) => { const files = new Map(); for (const n of fs.readdirSync(dir)) if (/\.(tex|bib)$/.test(n)) files.set(n, fs.readFileSync(path.join(dir, n), 'utf8')); docs.push([dir.replace(root, ''), files, main]); };
for (const d of ['dev/bench/long', 'dev/bench/sample', 'dev/bench/lua', 'dev/bench/heavy', 'sample']) add(path.join(root, d), 'main.tex');
// what the Styles batch (B4) draws: headings run into their paragraph (\paragraph, titlesec's
// runin), a paragraph style of the document's own, theorems of thmtools, headings with a look
{
  const body = [];
  for (let k = 0; k < 12; k++) body.push('\\section{Part ' + k + '}', '', 'Opening words of part ' + k + ' with \\textbf{bold} and $x_' + k + '$ in it.', '',
    '\\paragraph{Run in ' + k + '} The paragraph the heading runs into, with plain words that go on for a while.', '',
    '\\subparagraph{Deeper} Another run in paragraph, typed into.', '',
    '\\begin{note}A paragraph in the document\'s own style.\n\nIts second paragraph.\\end{note}', '',
    '\\begin{theorem}[Name]A theorem\'s text.\\end{theorem}', '', '\\begin{lemma}A lemma.\\end{lemma}', '',
    'Closing words of part ' + k + ', plain and long enough to type in.', '');
  docs.push(['styles (B4)', new Map([['main.tex', '\\documentclass{article}\n\\usepackage{amsthm,thmtools,xcolor,titlesec}\n\\titleformat{\\subsection}[runin]{\\bfseries}{\\thesubsection}{1em}{}\n' +
    '\\declaretheorem[name=Theorem]{theorem}\n\\declaretheorem[sibling=theorem]{lemma}\n\\newenvironment{note}{\\par\\itshape\\color{blue}}{\\par}\n\\setcounter{secnumdepth}{5}\n\\begin{document}\n' +
    body.join('\n') + '\n\\subsection{Run in by titlesec} Its paragraph, plain.\n\n\\end{document}\n']]), 'main.tex']);
}

const corpus = process.argv[2];
if (corpus) {
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.tex')) { const t = fs.readFileSync(p, 'utf8'); if (/\\documentclass/.test(t)) add(path.dirname(p), e.name); } } };
  walk(corpus);
}
const N = corpus ? 16 : 400;
let failsBefore = fail;
for (const [name, files, main] of docs) stream(name + ' ' + main, files, main, name.includes('long') || name.includes('sample') || name.includes('styles') ? N * 2 : N);
check('every edit of every stream: the incremental model is the full build\'s (' + steps + ' edits, ' + fast + ' on the fast path, ' + docs.length + ' documents)', fail === failsBefore && fast > steps / 20, [steps, fast]);
console.log('edits ' + steps + ', on the fast path ' + fast + ', documents ' + docs.length);

// every numeric field of a model that moves with the text before it is a name OFFSET_KEYS holds: a
// field a change to the model adds (B2's ps, pe, vs, ve were the first) and leaves out would be
// left behind by the moved units, so it fails here by name before any stream finds it
{
  const moved = new Set();
  const walk = (a, b, k, D) => {
    if (typeof a === 'number' && typeof b === 'number') { if (b - a === D && a !== b) moved.add(k); return; }
    if (!a || !b || typeof a !== 'object') return;
    if (Array.isArray(a)) { for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], k, D); return; }
    for (const key of Object.keys(a)) walk(a[key], b[key], key, D);
  };
  for (const [, files, main] of docs) {
    const t = files.get(main), i = t.indexOf('\\begin{document}');
    if (i < 0) continue;
    const j = i + 16, ins = '\n\n%XXXX\n', next = new Map(files);
    next.set(main, t.slice(0, j) + ins + t.slice(j));
    let a, b;
    try { a = buildModel({ files, main }); b = buildModel({ files: next, main }); } catch (e) { continue; }
    walk(a.blocks, b.blocks, '', ins.length);
  }
  const missing = [...moved].filter((k) => !OFFSET_KEYS.has(k) && k !== 'map');
  check('every field of the models\' units that moves with the text is one OFFSET_KEYS names (' + [...moved].sort().join(' ') + ')', !missing.length, 'not named: ' + missing.join(' '));
}

// the paragraph settings of B2 that reach a later paragraph: line spacing declared in the body,
// \centering before a paragraph, a hanging indent and \nopagebreak in one
docs.push(['paragraph settings (B2)', new Map([['main.tex', '\\documentclass{article}\n\\usepackage{setspace}\n\\begin{document}\nFirst plain paragraph, typed in.\n\n\\onehalfspacing\nA paragraph after one and a half spacing.\n\nAnother after it.\n\n' +
  '\\doublespacing\n\\centering\nCentred from here on, plain.\n\nStill centred, the next paragraph.\n\n\\hangindent=1cm\\hangafter=1 A hanging paragraph with words.\n\nKept with the next\\nopagebreak\n\nLast plain words.\n\\end{document}\n']]), 'main.tex']);
for (const [what, needle, fastWanted] of [['a paragraph that opens with \\onehalfspacing (the declaration is its own)', 'A paragraph after one', false], ['the paragraph after it, one and a half spaced', 'Another after it', true],
  ['a paragraph that opens with \\centering', 'Centred from here', false], ['the centred paragraph after it', 'Still centred', true],
  ['a paragraph with \\hangindent', 'A hanging paragraph', false], ['a paragraph with \\nopagebreak', 'Kept with the next', false], ['the last paragraph', 'Last plain', true]]) {
  const [, files] = docs[docs.length - 1];
  const t = files.get('main.tex'), prev = buildModel({ files, main: 'main.tex' });
  const at = t.indexOf(needle) + 3, next = new Map(files);
  next.set('main.tex', t.slice(0, at) + 'xy' + t.slice(at));
  const before = INCR.reused;
  const a = buildModel({ files: next, main: 'main.tex' }, prev);
  const fast = INCR.reused > before;
  INCR.on = false; const b = buildModel({ files: next, main: 'main.tex' }, prev); INCR.on = true;
  check('typing in ' + what + ': the full build\'s model, ' + (fastWanted ? 'on the fast path' : 'by the full build'), ser(a) === ser(b) && fast === fastWanted, [fast, ser(a) === ser(b) ? '' : first(ser(a), ser(b))]);
}

// typing in each construct of the Styles document, once: equal to the full build, and on the fast
// path where the paragraph is plain (a paragraph a heading runs into is; a paragraph style's or a
// theorem's paragraph is inside an environment, which takes the full build)
{
  const [, files] = docs.find(([n]) => n.startsWith('styles'));
  const t = files.get('main.tex'), prev = buildModel({ files, main: 'main.tex' });
  for (const [what, needle, fastWanted] of [['a paragraph \\paragraph runs into', 'The paragraph the heading runs into', true], ['a paragraph \\subparagraph runs into', 'Another run in paragraph', true],
    ['a paragraph titlesec\'s runin runs into', 'Its paragraph, plain', true], ['a paragraph of the document\'s own style', 'in the document\'s own style', false], ['a theorem', 'A theorem\'s text', false], ['a plain paragraph after a heading', 'Opening words of part 3', true]]) {
    const at = t.indexOf(needle) + 4, next = new Map(files);
    next.set('main.tex', t.slice(0, at) + 'xy' + t.slice(at));
    const before = INCR.reused;
    const a = buildModel({ files: next, main: 'main.tex' }, prev);
    const fast = INCR.reused > before;
    INCR.on = false; const b = buildModel({ files: next, main: 'main.tex' }, prev); INCR.on = true;
    check('typing in ' + what + ': the full build\'s model, ' + (fastWanted ? 'on the fast path' : 'by the full build'), ser(a) === ser(b) && fast === fastWanted, [fast, ser(a) === ser(b) ? '' : first(ser(a), ser(b))]);
  }
}

// keystrokes no one reads in between: the moved units' steps pile up (src/model.js movedUnit),
// then the model is read once and must be the full build's
{
  const [, files] = docs.find(([n]) => n.includes('bench/long'));
  let cur = new Map(files), prev = buildModel({ files: cur, main: 'main.tex' });
  const plain = prev.blocks.filter((u) => u.items.length === 1 && u.items[0].type === 'p' && !/[\\$%{}]/.test(cur.get('main.tex').slice(u.s, u.e)));
  let ok = true, fastBefore = INCR.reused;
  for (let k = 0; k < 90; k++) {
    // in turn in two paragraphs, an early one and a later one, so the steps' places differ
    const u = plain[k % 2 ? 3 : plain.length - 4];
    const t = cur.get('main.tex'), at = u.s + 2 + (k % 7);
    const next = new Map(cur); next.set('main.tex', t.slice(0, at) + (k % 5 ? 'q' : '') + t.slice(at + (k % 5 ? 0 : 1)));
    // (every 30th: the full build from the same last model, as the stream above compares)
    const last = prev;
    prev = buildModel({ files: next, main: 'main.tex' }, prev);
    cur = next;
    if (k % 30 === 29) { INCR.on = false; const full = buildModel({ files: cur, main: 'main.tex' }, last); INCR.on = true; if (ser(full) !== ser(prev)) { ok = false; check('moved units after ' + (k + 1) + ' unread keystrokes', false, first(ser(prev), ser(full)).replace(/\n/g, ' || ').slice(0, 300) + ' ... ' + (() => { const x = ser(prev), y = ser(full); let q = 0; while (x[q] === y[q]) q++; return x.slice(q - 900, q - 300); })()); break; } }
    // (the paragraphs' places move with what was typed before them)
    const cu = prev.blocks;
    // (read from their keys: their items stay unread)
    plain.length = 0; for (const b of cu) if (b.key.endsWith('\u0000p') && !/[\\$%{}]/.test(cur.get('main.tex').slice(b.s, b.e))) plain.push(b);
  }
  check('90 keystrokes in two paragraphs, read every 30: the full build\'s model each time (' + (INCR.reused - fastBefore) + ' on the fast path)', ok && INCR.reused - fastBefore > 60);
}

// a stranger's document: nothing of it is kept for the next one (the fast path reads only the
// last model and the new text, and a model of another document or main file never qualifies)
{
  const A = new Map([['main.tex', '\\documentclass{article}\\begin{document}\nAlpha text here.\n\nMore.\n\\end{document}\n']]);
  const Bm = new Map([['main.tex', '\\documentclass{article}\\newcommand{\\x}{X}\\begin{document}\nAlpha text herE.\n\nMore.\n\\end{document}\n']]);
  const ma = buildModel({ files: A, main: 'main.tex' });
  const before = INCR.reused;
  const mb = buildModel({ files: Bm, main: 'main.tex' }, ma);
  INCR.on = false; const full = buildModel({ files: Bm, main: 'main.tex' }, ma); INCR.on = true;
  check('another document with the last one\'s model: no fast path (its preamble differs), the full build', INCR.reused === before && ser(mb) === ser(full));
  const two = new Map([...A, ['other.tex', 'x']]);
  const mc = buildModel({ files: two, main: 'other.tex' }, ma);
  check('another main file: no fast path', INCR.reused === before && mc.blocks.length >= 0);
}

console.log('incremental model:', pass, 'passed,', fail, 'failed');
if (fail) process.exitCode = 1;
