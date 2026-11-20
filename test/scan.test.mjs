// src/scan.js against the three loops it replaced (src/preamble.js's stripComments and
// preambleEnd, src/looks.js's, src/styles.js's stripCommentsOf and preambleEndOf, kept here as
// they were): the same text for every document of the repository and for random TeX-like texts
// cut at random places, and the kept answers never confused between texts.
import fs from 'fs';
import path from 'path';
import { commentsBlanked, preambleEnd } from '../src/scan.js';
import { stripComments as preambleStrip, preambleEnd as preambleEndP } from '../src/preamble.js';
import { stripComments as looksStrip, preambleEnd as preambleEndL } from '../src/looks.js';

const root = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail === undefined ? '' : String(detail).slice(0, 400)); } };

// the loops as they were (preamble.js used n = min(length, 400000) and added t.slice(n); looks.js
// n = min(length, 200000); styles.js all of t)
function oldBlank(t, n) {
  let out = '', i = 0;
  while (i < n) {
    const c = t[i];
    if (c === '\\') { out += t.slice(i, i + 2); i += 2; continue; }
    if (c === '%') { const j = t.indexOf('\n', i); const e = j < 0 ? n : j; out += ' '.repeat(e - i); i = e; continue; }
    out += c; i++;
  }
  return out;
}
const oldPreambleStrip = (t) => { const n = Math.min(t.length, 400000); return oldBlank(t, n) + t.slice(n); };
const oldLooksStrip = (t) => oldBlank(t, Math.min(t.length, 200000));
const oldEnd = (src) => { const m = /\\begin\s*\{document\}/.exec(oldBlank(src.slice(0, 200000), Math.min(src.length, 200000))); return m ? m.index : -1; };

const docs = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tex|sty|cls|bib)$/.test(e.name)) docs.push(fs.readFileSync(p, 'utf8')); } };
for (const d of ['sample', 'dev/bench', 'test/fixtures']) walk(path.join(root, d));
let ok = 0;
for (const t of docs) {
  if (preambleStrip(t) === oldPreambleStrip(t) && looksStrip(t) === oldLooksStrip(t) && commentsBlanked(t, t.length) === oldBlank(t, t.length) &&
    preambleEnd(t) === oldEnd(t) && preambleEndP(t) === oldEnd(t) && preambleEndL(t) === oldEnd(t)) ok++;
}
check('every document of the repository the same (' + ok + ' of ' + docs.length + ')', ok === docs.length && docs.length > 5);

// random texts heavy in what the loop treats specially, cut anywhere (a backslash just before
// the cut, a comment across it, at the very end), short and past the kept size
let seed = 20261120;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const bits = ['\\', '%', '\n', '\r\n', '\\%', '%%', '\\\\', ' ', 'a', 'word ', '\\begin{document}', '% \\begin{document}\n', '\\begin {document}', '{', '}', '\u2028', '\uD83D\uDE00', '\uD800'];
let fz = 0;
const N = 3000;
for (let k = 0; k < N; k++) {
  let t = '';
  const len = rnd() < 0.1 ? 1000 + Math.floor(rnd() * 3000) : Math.floor(rnd() * 120);
  while (t.length < len) t += bits[Math.floor(rnd() * bits.length)];
  const n = Math.floor(rnd() * (t.length + 1));
  const same = commentsBlanked(t, n) === oldBlank(t, n) && commentsBlanked(t, t.length) === oldBlank(t, t.length) &&
    preambleStrip(t) === oldPreambleStrip(t) && looksStrip(t) === oldLooksStrip(t) && preambleEnd(t) === oldEnd(t);
  if (same) fz++; else if (fz + 1 === k) console.log('  first difference', JSON.stringify(t), n);
}
check('random texts cut anywhere the same (' + fz + ' of ' + N + ')', fz === N);

// the kept answers: a text and one that differs in its last character, both long, asked in turns
const a = 'x'.repeat(5000) + '% c\n\\begin{document}', b = a.slice(0, -1) + ']';
let turns = true;
for (let k = 0; k < 20; k++) turns = turns && preambleEnd(a) === 5004 && preambleEnd(b) === -1 && commentsBlanked(a, a.length) === oldBlank(a, a.length) && commentsBlanked(b, 10) === oldBlank(b, 10);
check('kept answers are never another text\'s', turns);
// many long texts: the earliest are let go and made again the same
const many = Array.from({ length: 40 }, (_, k) => 'y'.repeat(2000 + k) + '%' + k + '\n\\begin{document}');
check('past the kept count, the same answers again', many.every((t) => preambleEnd(t) === oldEnd(t)) && many.every((t) => preambleEnd(t) === oldEnd(t)));
// a 3 MB text: past the size kept, still right
const big = ('\\section{A} text % note\n').repeat(130000) + '\\begin{document}';
check('a 3 MB text: the same', commentsBlanked(big, big.length) === oldBlank(big, big.length) && preambleEnd(big) === oldEnd(big));

// (B0's review) past preamble.js's cap of 400,000 the rest of the text follows on from where the
// blanking stopped: a backslash at 399,999 or a comment across the cap no longer says a stretch
// twice, every offset is kept, and below the cap nothing changed (the checks above)
{
  const t1 = 'a'.repeat(399999) + '\\%after % c\nend';
  check('a backslash at 399,999: the text as it is, said once', preambleStrip(t1) === t1, preambleStrip(t1).length - t1.length);
  const t2 = 'a'.repeat(399990) + '% a comment past the cap\nend', e = t2.indexOf('\n', 399990);
  check('a comment across the cap: made spaces to its line\'s end, then the rest once', preambleStrip(t2) === t2.slice(0, 399990) + ' '.repeat(e - 399990) + t2.slice(e), preambleStrip(t2).length - t2.length);
  const t3 = 'b'.repeat(400010);
  check('a plain text past the cap: as it is', preambleStrip(t3) === t3);
}
console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
