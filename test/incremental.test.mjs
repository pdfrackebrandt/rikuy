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

const corpus = process.argv[2];
if (corpus) {
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.tex')) { const t = fs.readFileSync(p, 'utf8'); if (/\\documentclass/.test(t)) add(path.dirname(p), e.name); } } };
  walk(corpus);
}
const N = corpus ? 16 : 400;
let failsBefore = fail;
for (const [name, files, main] of docs) stream(name + ' ' + main, files, main, name.includes('long') || name.includes('sample') ? N * 2 : N);
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
