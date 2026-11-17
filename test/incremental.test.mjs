// The incremental model build (src/model.js, incremental) against the full build it stands in for:
// after every edit of a random stream the model built from the last one is the model the full
// build makes from the same last model, value for value (the order of keys too), whether the edit
// took the fast path or not, with the same parts of each unit being one object (a footnote's mark
// is the atom in its text); and the same after keystrokes whose moved units no one read.
//   node test/incremental.test.mjs   (npm test's: short streams over every document, about 15 s)
//   INCR_FULL=1 node test/incremental.test.mjs [CORPUS_DIR]   (the long streams, every unit in
//   the offset guard; with a LaTeX-examples clone also every document of it: CI's corpus job)
import fs from 'fs';
import path from 'path';
import { buildModel, INCR, OFFSET_KEYS, sameModels, sharedParts } from '../src/model.js';
import { buildWordDoc } from '../src/wordast.js';

const root = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail === undefined ? '' : String(detail).slice(0, 800)); } };
const ser = (m) => JSON.stringify(m, (k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v));
const modelText = ser;
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
    if (typeof a !== 'string' && a.blocks.some((u, j) => sharedParts(u) !== sharedParts(b.blocks[j]))) { const i = a.blocks.findIndex((u, j) => sharedParts(u) !== sharedParts(b.blocks[j])); check(name + ' edit ' + k + ': the parts unit ' + i + ' shares', false, sharedParts(a.blocks[i]) + ' | full: ' + sharedParts(b.blocks[i])); return; }
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

docs.push(['pictures (B8)', new Map([['main.tex', '\\documentclass{article}\n\\usepackage{graphicx,wrapfig,caption,subcaption,tcolorbox}\n\\begin{document}\n' +
  'Words before a picture \\includegraphics[width=1cm]{a.png} and after it, in one paragraph.\n\n' +
  'A \\scalebox{1.5}{scaled} word and a \\rotatebox{90}{turned} one.\n\n' +
  '\\begin{wrapfigure}{r}{0.4\\textwidth}\n\\centering\n\\includegraphics[width=\\linewidth]{b.png}\n\\caption{Wrapped}\n\\end{wrapfigure}\n' +
  'The paragraph the figure wraps, plain and long enough to go on beside it for a while.\n\nThe next paragraph, still beside it.\n\n' +
  '\\begin{center}\n\\includegraphics[width=3cm]{c.png}\n\\captionof{figure}{A caption of its own}\n\\end{center}\n\n' +
  '\\begin{figure}[h]\n\\begin{minipage}{0.45\\linewidth}\\includegraphics[width=\\linewidth]{d.png}\\end{minipage}\\hfill\n' +
  '\\begin{subfigure}{0.45\\linewidth}\\includegraphics[width=\\linewidth]{e.png}\\caption{Sub}\\end{subfigure}\n\\caption{Two}\n\\end{figure}\n\n' +
  '\\begin{tcolorbox}[width=0.6\\linewidth,center]A boxed paragraph.\\end{tcolorbox}\n\nLast plain paragraph after the box.\n\\end{document}\n'], ['a.png', ''], ['b.png', ''], ['c.png', ''], ['d.png', ''], ['e.png', '']]), 'main.tex']);
// what the References batch (B9) draws from the whole document: the contents (tocdepth, a short
// title, \addcontentsline), the lists of figures and tables, footnotes in their style, endnotes,
// citations and the bibliography, index entries and the index, every one with plain words to type
// before and after it
{
  const body = ['\\tableofcontents', '\\listoffigures', '\\listoftables', ''];
  for (let k = 0; k < 6; k++) body.push('\\section[Short ' + k + ']{Section ' + k + '}', 'Plain words of section ' + k + ' to type in, long enough to go on.', '',
    'A footnote\\footnote{Note ' + k + '.} and an endnote\\endnote{End ' + k + '.} and \\citet{knuth84} with an entry\\index{entry ' + k + '!sub|textbf}.', '',
    '\\begin{figure}[htbp]\n\\centering\nX\n\\caption[Cap ' + k + ']{A caption ' + k + '}\\label{fig:' + k + '}\n\\end{figure}', '',
    '\\begin{table}[htbp]\n\\caption{Table ' + k + '}\nT\n\\end{table}', '',
    '\\section*{Starred ' + k + '}\n\\addcontentsline{toc}{section}{Starred ' + k + '}', 'More plain words after it, typed into as well.', '');
  body.push('\\printendnotes', '\\bibliographystyle{plainnat}', '\\bibliography{refs}', '\\printindex');
  docs.push(['references (B9)', new Map([['main.tex', '\\documentclass{article}\n\\usepackage{natbib,enotez,imakeidx}\n\\makeindex\n\\setcounter{tocdepth}{1}\n\\renewcommand{\\thefootnote}{\\roman{footnote}}\n\\counterwithin*{footnote}{section}\n\\begin{document}\n' +
    body.join('\n') + '\n\\end{document}\n'], ['refs.bib', '@book{knuth84, author={Donald Knuth}, title={The TeXbook}, year=1984}\n']]), 'main.tex']);
}
docs.push(['paragraph settings (B2)', new Map([['main.tex', '\\documentclass{article}\n\\usepackage{setspace}\n\\begin{document}\nFirst plain paragraph, typed in.\n\n\\onehalfspacing\nA paragraph after one and a half spacing.\n\nAnother after it.\n\n' +
  '\\doublespacing\n\\centering\nCentred from here on, plain.\n\nStill centred, the next paragraph.\n\n\\hangindent=1cm\\hangafter=1 A hanging paragraph with words.\n\nKept with the next\\nopagebreak\n\nLast plain words.\n\\end{document}\n']]), 'main.tex']);
// (R1) the page's and the paragraphs' leftovers: hand written marks, a paragraph without line
// numbers, landscape pages, a tabbing (its \= read again), fills, a title for the header
docs.push(['page and paragraph leftovers (R1)', new Map([['main.tex', '\\documentclass{article}\n\\usepackage{lineno,pdflscape}\n\\linenumbers\n\\pagestyle{myheadings}\n\\title{A Title}\n\\makeatletter\\let\\thetitle\\@title\\makeatother\n\\begin{document}\n\\markboth{Left}{Right}\nFirst plain paragraph, typed in.\n\n' +
  '\\begin{nolinenumbers}\nNo numbers here, plain words.\n\\end{nolinenumbers}\n\n\\begin{landscape}\nA wide paragraph on its own page.\n\nAnother one there.\n\\end{landscape}\n\n\\begin{tabbing}\n\\hspace{2cm}\\=\\hspace{3cm}\\=\\kill\nName\\>Value\\>Note\\\\\nAlpha \\> Beta \\> Gamma\n\\end{tabbing}\n\n' +
  'Left \\hfill Right and Fig.~5 with a label\\label{x} here.\n\n\\markright{Later}\nLast plain words.\n\\end{document}\n']]), 'main.tex']);
docs.push(['a LaTeX paragraph (its groups)', new Map([['main.tex', '\\documentclass{article}\n\\begin{document}\nFirst paragraph, typed in.\n\n% rikuy: latex\n{\\bfseries bold} raw and {\\itshape more {nested}} words\n\nLast plain paragraph.\n\\end{document}\n']]), 'main.tex']);
const corpus = process.argv[2], FULL = process.env.INCR_FULL === '1' || !!corpus, repoDocs = docs.length;
if (corpus) {
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.tex')) { const t = fs.readFileSync(p, 'utf8'); if (/\\documentclass/.test(t)) add(path.dirname(p), e.name); } } };
  walk(corpus);
}
// (R1 review M1) tabbings far down a file: each read again by itself, so a keystroke before them
// leaves the incremental build equal to the full one and every letter after a \= in place
{
  const tb = (k) => '\\begin{tabbing}\nName' + k + '\\=Value\\=Note\\kill\nName\\>Value\\>Note\\\\\nAlpha \\> Beta \\> Gamma\n\\end{tabbing}\n\n';
  const t0 = '\\documentclass{article}\n\\begin{document}\nFirst plain paragraph typed in.\n\n' + ('%' + 'x'.repeat(98) + '\n').repeat(3000) + Array.from({ length: 10 }, (_, k) => tb(k)).join('') + 'End.\n\\end{document}\n';
  const prev = buildModel({ files: new Map([['main.tex', t0]]), main: 'main.tex' });
  const at = t0.indexOf('typed in') + 5, t1 = t0.slice(0, at) + 'x' + t0.slice(at);
  const was = INCR.reused;
  const a = buildModel({ files: new Map([['main.tex', t1]]), main: 'main.tex' }, prev);
  const fastPath = INCR.reused > was;
  INCR.on = false;
  const b = buildModel({ files: new Map([['main.tex', t1]]), main: 'main.tex' }, prev);
  INCR.on = true;
  const cells = (m) => m.blocks.filter((u) => u.items[0] && u.items[0].tab).map((u) => u.items.map((it) => (it.inl || []).map((c) => (c.kids || []).map((x) => x.t || '').join('')).join('|')).join('/'));
  check('a keystroke before ten tabbings far down: the incremental build is the full one (' + (fastPath ? 'fast path' : 'full') + ')', sameModels(a, b));
  check('and every letter after a \\= is in place in both', cells(b).length === 10 && cells(b).every((x, k) => x === 'Name' + k + '|Value|Note/Name|Value|Note/Alpha |Beta |Gamma ') && JSON.stringify(cells(a)) === JSON.stringify(cells(b)), cells(b).slice(-1));
}
// (the short run: every document, fewer edits, the 120 KB paper the fewest; each edit there is
// two full builds and two serialisations)
let failsBefore = fail;
docs.forEach(([name, files, main], i) => {
  const big = name.includes('long') || name.includes('sample') || name.includes('styles') || name.includes('pictures') || name.includes('references');
  stream(name + ' ' + main, files, main, i >= repoDocs ? 16 : FULL ? (big ? 800 : 400) : name.includes('dev/bench/long') ? 25 : 80);
});
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
  // (a comment line before each unit of the main file, at the start of its line: every unit of
  // the repository's documents in the long run, 24 spread over each in the short one, eight over
  // each of the corpus's)
  for (const [name, files, main] of docs) {
    const t = files.get(main);
    let m;
    try { m = buildModel({ files, main }); } catch (e) { continue; }
    let us = m.blocks.filter((u) => u.f === main && u.s > 0);
    const cap = docs.findIndex((d) => d[0] === name) >= repoDocs ? 8 : FULL ? Infinity : 24;
    if (us.length > cap) us = us.filter((u, k) => k % Math.ceil(us.length / cap) === 0);
    for (const u of us) {
      const j = t.lastIndexOf('\n', u.s - 1) + 1, ins = '%XXXX\n', next = new Map(files);
      next.set(main, t.slice(0, j) + ins + t.slice(j));
      let b;
      try { b = buildModel({ files: next, main }); } catch (e) { continue; }
      walk(m.blocks, b.blocks, '', ins.length);
    }
  }
  const missing = [...moved].filter((k) => !OFFSET_KEYS.has(k) && k !== 'map' && k !== 'nest');
  check('every field of the models\' units that moves with the text is one OFFSET_KEYS names (' + [...moved].sort().join(' ') + ')', !missing.length, 'not named: ' + missing.join(' '));
}

// what Pictures (B8) draws: a picture inside a paragraph, \scalebox and \rotatebox, a wrapfigure
// with the paragraphs it wraps, \captionof in a center, minipages and subfigures sharing a line,
// a tcolorbox of a width

for (const [what, needle, fastWanted] of [['a paragraph with a picture in it', 'Words before a picture', false], ['a paragraph with \\scalebox', 'scaled} word', false],
  ['the paragraph a wrapfigure wraps', 'The paragraph the figure wraps', true], ['the next paragraph beside it', 'The next paragraph, still', true],
  ['a \\captionof\'s caption', 'A caption of its own', false], ['a boxed paragraph', 'A boxed paragraph', false], ['the paragraph after the box', 'Last plain paragraph', true]]) {
  const [, files] = docs.find(([n]) => n.startsWith('pictures'));
  const t = files.get('main.tex'), prev = buildModel({ files, main: 'main.tex' });
  const at = t.indexOf(needle) + 3, next = new Map(files);
  next.set('main.tex', t.slice(0, at) + 'xy' + t.slice(at));
  const before = INCR.reused;
  const a = buildModel({ files: next, main: 'main.tex' }, prev);
  const fast = INCR.reused > before;
  INCR.on = false; const b = buildModel({ files: next, main: 'main.tex' }, prev); INCR.on = true;
  check('typing in ' + what + ': the full build\'s model, ' + (fastWanted ? 'on the fast path' : 'by the full build'), ser(a) === ser(b) && fast === fastWanted, [fast, ser(a) === ser(b) ? '' : first(ser(a), ser(b))]);
}

// the paragraph settings of B2 that reach a later paragraph: line spacing declared in the body,
// \centering before a paragraph, a hanging indent and \nopagebreak in one

for (const [what, needle, fastWanted] of [['a paragraph that opens with \\onehalfspacing (the declaration is its own)', 'A paragraph after one', false], ['the paragraph after it, one and a half spaced', 'Another after it', true],
  ['a paragraph that opens with \\centering', 'Centred from here', false], ['the centred paragraph after it', 'Still centred', true],
  ['a paragraph with \\hangindent', 'A hanging paragraph', false], ['a paragraph with \\nopagebreak', 'Kept with the next', false], ['the last paragraph', 'Last plain', true]]) {
  const [, files] = docs.find(([n]) => n.startsWith('paragraph settings'));
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

// the hostile review's cases (each once a difference the streams above had not met)
{
  const D = (body) => '\\documentclass{article}\n\\begin{document}\n' + body + '\n\\end{document}\n';
  const F = (t) => new Map([['main.tex', t]]);
  const type = (t, prev, at, ins, del = 0) => {
    const nt = t.slice(0, at) + ins + t.slice(at + del), r0 = INCR.reused;
    const a = buildModel({ files: F(nt), main: 'main.tex' }, prev);
    const fast = INCR.reused > r0;
    INCR.on = false; const b = buildModel({ files: F(nt), main: 'main.tex' }, prev); INCR.on = true;
    return { nt, a, b, fast };
  };
  // H1: a footnote moved by a keystroke before it is still its mark's atom, and Word's export
  // finds it (it looks the note up by that identity)
  {
    const t = D('First paragraph to type in.\n\nSecond paragraph with a note\\footnote{The note text.} here.');
    const { nt, a, b, fast } = type(t, buildModel({ files: F(t), main: 'main.tex' }), t.indexOf('to type'), 'x');
    const u = a.blocks[1], atom = u.items[0].inl.find((x) => x.k === 'fn');
    const word = JSON.stringify(buildWordDoc(a, F(nt), {}));
    check('a keystroke before a footnote, on the fast path: its mark is the atom in the text, Word\'s export has the note, the full build\'s model', fast && u.fns[0].mark === atom && word.includes('"Note"') && word === JSON.stringify(buildWordDoc(b, F(nt), {})) && sameModels(a, b));
  }
  // M1: a table of contents whose first pass left a \ref in a heading at ?? is drawn again by the
  // full build at the first keystroke, then typing takes the fast path with the full build's key
  {
    let t = D('\\tableofcontents\n\n\\section{Overview of Section \\ref{sec:late}}\nFirst paragraph to type in.\n\n\\section{Late}\\label{sec:late}\nSecond.');
    let m = buildModel({ files: F(t), main: 'main.tex' }), ok = true, fasts = [];
    for (let k = 0; k < 3; k++) { const r = type(t, m, t.indexOf('to type'), 'x'); fasts.push(r.fast); ok = ok && modelText(r.a) === modelText(r.b) && sameModels(r.a, r.b); t = r.nt; m = r.a; }
    check('a table of contents with a heading the first pass left at ??: the full build at the first key, then the fast path, each the full build\'s model', ok && JSON.stringify(fasts) === '[false,true,true]', fasts);
  }
  // M2: the groups of a LaTeX paragraph after the edit move with it
  {
    const t = D('First paragraph.\n\n% rikuy: latex\n{\\bfseries bar} raw\n\nLast.');
    const { a, b, fast } = type(t, buildModel({ files: F(t), main: 'main.tex' }), t.indexOf('paragraph'), 'x');
    check('a keystroke before a LaTeX paragraph: its groups (nest) moved, the full build\'s model', fast && modelText(a) === modelText(b) && sameModels(a, b));
  }
  // L1: a warning the old paragraph made (an unknown command, here a known one with no argument)
  // leaves the list when the edit takes it away
  for (const [cmd, by] of [['\\mbox', ''], ['\\underline', 'x']]) {
    const t = D('First para.\n\nHello world ' + cmd + '\n\nLast para.'), m = buildModel({ files: F(t), main: 'main.tex' });
    const { a, b } = type(t, m, t.indexOf(cmd), by, cmd.length);
    check('deleting ' + cmd + ' with no argument: its warning gone, the full build\'s model', m.warn.length === 1 && !a.warn.length && modelText(a) === modelText(b));
  }
  // L2: what the app writes on a model (cmd/lists.js's listCfg, listMech) is not carried to the next
  {
    const t = D('First paragraph to type in.\n\nSecond.'), m = buildModel({ files: F(t), main: 'main.tex' });
    m.listMech = { stale: true }; m.listCfg = { stale: true };
    const { a, fast } = type(t, m, t.indexOf('to type'), 'x');
    check('a model\'s fields the app wrote are not carried by the fast path', fast && !('listMech' in a) && !('listCfg' in a));
  }
  // the self check of development builds: every Nth fast build against the full one, the full one
  // kept on a difference
  {
    const t = D('First paragraph to type in.\n\nSecond paragraph.'), m = buildModel({ files: F(t), main: 'main.tex' });
    const was = INCR.check, mis = INCR.mismatch;
    INCR.check = 1;
    let r = type(t, m, t.indexOf('to type'), 'x');
    const clean = INCR.mismatch === mis && modelText(r.a) === modelText(r.b);
    const bad = { ...m, blocks: m.blocks.map((u, i) => (i === 1 ? { ...u, items: u.items.map((x) => ({ ...x, align: 'center' })) } : u)) };
    Object.defineProperty(bad, '_incr', { value: m._incr });
    const warn = console.warn; let said = 0; console.warn = () => { said++; };
    try { r = type(t, bad, t.indexOf('to type'), 'x'); } finally { console.warn = warn; INCR.check = was; }
    check('the self check: no difference on a clean model; a poisoned last model found, said once, and the full build\'s model returned', clean && INCR.mismatch === mis + 1 && said === 1 && modelText(r.a) === modelText(r.b));
  }
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
