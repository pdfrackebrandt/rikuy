// The page's set up (src/pagesrc.js, src/layout.js): geometry worked out as TeX's geometry and
// the standard classes do (the numbers below are TeX's own, from \typeout of \textwidth and its
// like), and every control's edit of the source: the smallest one, where the construct already
// stands, nothing more the second time, and back to the bytes of before where it is turned off.
// A stranger's preamble is read in bounded time. test/page.py drives the same through the page.
import assert from 'node:assert/strict';
import * as PS from '../src/pagesrc.js';
import { geometry, hfRuns, fmtNum, cssColor, Layout } from '../src/layout.js';
import { applyEdits } from '../src/styles.js';
import { buildModel } from '../src/model.js';
import { escapeTyped, unbalanced } from '../src/ui/headerfooter.js';
import { pageForWord } from '../src/pageword.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const apply = (src, edits) => applyEdits(src, PS.joinEdits(edits));
const doc = (pre, body = 'Text.', cls = '\\documentclass{article}') => cls + '\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
// an edit applied, then the same call again changes nothing
const twice = (src, f) => { const a = apply(src, f(src)); assert.deepEqual(PS.joinEdits(f(a)), [], 'a second time changes nothing: ' + JSON.stringify(f(a))); return a; };

ok('geometry: the text block and its place as TeX gives them, with geometry and with the class alone', () => {
  const G = (geo, o = {}) => geometry({ pt: 10, paper: 'letter', geometry: geo !== null, geo: geo || {}, ...o });
  // [keys, what TeX printed (pt), class options]
  const cases = [
    [{}, { tw: 430.00462, th: 556.47656, ml: 92.1452, mt: 95.39738 }],
    [{ left: '2cm' }, { tw: 465.24431, ml: 56.905 }],
    [{ right: '2cm' }, { tw: 465.24431, ml: 92.1452 }],
    [{ top: '2cm' }, { th: 642.66711, mt: 56.905 }],
    [{ top: '3cm' }, { th: 614.21436 }],
    [{ vmarginratio: '1:2', top: '3cm' }, { th: 538.8952 }],
    [{ vmarginratio: '1:2', bottom: '3cm' }, { th: 666.9326 }],
    [{ bottom: '2cm' }, { th: 642.66711, mt: 95.39738 }],
    [{ width: '10cm' }, { tw: 284.52756, ml: 164.88372 }],
    [{ twoside: true }, { ml: 73.71614, mlE: 110.57426 }],
    [{ twoside: true, left: '2cm' }, { tw: 483.67337 }],
    [{ inner: '2cm', outer: '3cm' }, { ml: 56.905, tw: 472.03123 }],
    [{ twoside: true, inner: '2cm', outer: '3cm' }, { ml: 56.905, mlE: 85.35827 }],
    [{ bindingoffset: '1cm', margin: '2cm' }, { ml: 85.35826, tw: 472.03125 }],
    [{ twoside: true, bindingoffset: '1cm', margin: '2cm' }, { ml: 85.35826, mlE: 56.905 }],
    [{ landscape: true }, { tw: 556.47656, th: 430.00462, ml: 119.24672, mt: 73.71614 }],
    [{ includehead: true, margin: '2cm' }, { th: 644.15898, mt: 93.90551 }],
    [{ includefoot: true, margin: '2cm' }, { th: 651.15898, mt: 56.905 }],
    [{ headsep: '1cm', footskip: '1.5cm', margin: '2cm' }, { th: 681.15898, mt: 56.905, headsep: 28.45276, footskip: 42.67913 }],
    [{ textwidth: '12cm' }, { tw: 341.43306, ml: 136.43098 }],
    [{ a4paper: true, landscape: true, margin: '2cm' }, { tw: 731.23584, th: 483.69687, pw: 845.04684 }],
    [{ paperwidth: '20cm', paperheight: '25cm' }, { tw: 398.33684, th: 497.92105 }],
    [null, { tw: 276, ml: 72.27 }, { paper: 'a5' }],
    [null, { tw: 345, ml: 107.27, mlE: 161.27 }, { twoside: true }],
    [null, { tw: 345, th: 550, ml: 134.27, mt: 125.27 }]
  ];
  for (const [geo, want, o] of cases) {
    const g = G(geo, o || {});
    for (const [k, v] of Object.entries(want)) assert.ok(Math.abs(g[k] - v) < 0.05, JSON.stringify(geo) + ' ' + k + ': ' + g[k] + ' against TeX\'s ' + v);
  }
  // two columns: the class's text block twice as wide, as far as the paper lets it be
  assert.equal(G(null, { twocolumn: true }).tw, 469);
  assert.equal(G(null, { twocolumn: true }).cols, 2);
});

ok('geometry\'s keys: merged into the place that has them, a family taken out together', () => {
  const src = doc('\\usepackage[a4paper,margin=2cm]{geometry}\n');
  const a = twice(src, (t) => PS.geometryEdits(t, { margin: '3cm' }, PS.FAMILY.margins));
  assert.equal(a, doc('\\usepackage[a4paper,margin=3cm]{geometry}\n'));
  // left and right replace margin=, which goes
  const b = twice(src, (t) => PS.geometryEdits(t, { left: '1cm', right: '2cm' }, PS.FAMILY.margins));
  assert.equal(b, doc('\\usepackage[a4paper,left=1cm,right=2cm]{geometry}\n'));
  // a \geometry line holds them already: there, and out of the \usepackage line
  const c = doc('\\usepackage[margin=2cm]{geometry}\n\\geometry{a4paper}\n');
  assert.equal(apply(c, PS.geometryEdits(c, { margin: '1in' }, PS.FAMILY.margins)), doc('\\usepackage[margin=1in]{geometry}\n\\geometry{a4paper}\n'));
  assert.equal(apply(c, PS.geometryEdits(c, { top: '1cm' }, (k) => k === 'margin')), doc('\\usepackage[top=1cm]{geometry}\n\\geometry{a4paper}\n'));
  // not loaded: loaded with them; the line goes when its last key does
  const d = doc('');
  const d1 = apply(d, PS.geometryEdits(d, { margin: '2cm' }, PS.FAMILY.margins));
  assert.equal(d1, doc('\\usepackage[margin=2cm]{geometry}\n'));
  // a \geometry line left empty goes with its line
  const e = doc('\\usepackage{geometry}\n\\geometry{landscape}\n');
  assert.equal(apply(e, PS.geometryEdits(e, { landscape: null })), doc('\\usepackage{geometry}\n'));
  // geometry loaded in a file the preamble reads: a \geometry line of its own in the main file
  const f = doc('\\input{preamble}\n');
  assert.equal(apply(f, PS.geometryEdits(f, { margin: '2cm' }, null, { others: ['\\usepackage[a4paper]{geometry}'] })), doc('\\input{preamble}\n\\geometry{margin=2cm}\n'));
  // commented lines load nothing
  const g = doc('%\\usepackage[margin=1cm]{geometry}\n');
  assert.equal(apply(g, PS.geometryEdits(g, { margin: '2cm' })), doc('\\usepackage[margin=2cm]{geometry}\n%\\usepackage[margin=1cm]{geometry}\n'));
});

ok('paper: the class\'s option and geometry\'s pass where the class lays the page out (its text block stays), geometry\'s key where geometry does', () => {
  // (TeX Live's PDF is A4 where nothing sets its size: A4 asked there is the class's option alone)
  const a = doc('');
  assert.equal(twice(a, (t) => PS.paperEdits(t, 'a4')), doc('', 'Text.', '\\documentclass[a4paper]{article}'));
  // the review's: [letterpaper] and A4: the class's option, the class's A4 text block, no geometry
  const lp = doc('', 'Text.', '\\documentclass[letterpaper]{article}');
  assert.equal(twice(lp, (t) => PS.paperEdits(t, 'a4')), doc('', 'Text.', '\\documentclass[a4paper]{article}'));
  assert.equal(twice(a, (t) => PS.paperEdits(t, 'a5')), doc('\\usepackage[pass]{geometry}\n', 'Text.', '\\documentclass[a5paper]{article}'));
  // Letter is the class's paper already: pass alone makes the PDF's sheet Letter
  assert.equal(twice(a, (t) => PS.paperEdits(t, 'letter')), doc('\\usepackage[pass]{geometry}\n'));
  // the class's option changes in place, with pass beside it so the PDF's sheet follows
  const b = doc('', 'Text.', '\\documentclass[11pt,a4paper]{article}');
  assert.equal(twice(b, (t) => PS.paperEdits(t, 'letter')), doc('\\usepackage[pass]{geometry}\n', 'Text.', '\\documentclass[11pt,letterpaper]{article}'));
  // with hyperref loaded the class's option is enough (hyperref sets the PDF's size)
  const c = doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a4paper]{article}');
  assert.equal(apply(c, PS.paperEdits(c, 'a5')), doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a5paper]{article}'));
  // memoir and KOMA set the sheet themselves; KOMA's paper= is changed as KOMA writes it
  const k = doc('', 'Text.', '\\documentclass[paper=a5]{scrartcl}');
  assert.equal(twice(k, (t) => PS.paperEdits(t, 'a4')), doc('', 'Text.', '\\documentclass[paper=a4]{scrartcl}'));
  const mm = doc('', 'Text.', '\\documentclass{memoir}');
  assert.equal(twice(mm, (t) => PS.paperEdits(t, 'a4')), doc('', 'Text.', '\\documentclass[a4paper]{memoir}'));
  // in geometry: the other size goes, in its place
  const d = doc('\\usepackage[a4paper,margin=2cm]{geometry}\n');
  assert.equal(twice(d, (t) => PS.paperEdits(t, 'legal')), doc('\\usepackage[legalpaper,margin=2cm]{geometry}\n'));
  // any size
  assert.equal(apply(d, PS.paperEdits(d, { w: 20 * 72.27 / 2.54, h: 25 * 72.27 / 2.54 })), doc('\\usepackage[paperwidth=20cm,paperheight=25cm,margin=2cm]{geometry}\n'));
  // a size the class does not know: geometry's layout, the margins pinned as they are (pass goes)
  const e = doc('\\usepackage[pass]{geometry}\n');
  const pin = { l: 134.27, r: 134.73, t: 125.27, b: 119.7 };
  assert.equal(apply(e, PS.paperEdits(e, 'a3', { pin })), doc('\\usepackage[left=134.27pt,right=134.73pt,top=125.27pt,bottom=119.7pt,a3paper]{geometry}\n'));
  // bare geometry (no options) lays the page out by its own defaults: that is geometry's layout
  const f = doc('\\usepackage{geometry}\n');
  assert.equal(apply(f, PS.paperEdits(f, 'a5')), doc('\\usepackage[a5paper]{geometry}\n'));
  // beamer: none of it (Layout's page controls are off there)
  assert.equal(PS.pageMode(doc('', 'Text.', '\\documentclass{beamer}')).cls.beamer, true);
});

ok('orientation: the class\'s landscape (and pass) where the class lays the page out, geometry\'s key where geometry does; portrait takes it out where it is', () => {
  const a = doc('\\usepackage[margin=2cm]{geometry}\n');
  const l = twice(a, (t) => PS.orientationEdits(t, 'landscape'));
  assert.equal(l, doc('\\usepackage[margin=2cm,landscape]{geometry}\n'));
  assert.equal(apply(l, PS.orientationEdits(l, 'portrait')), a);
  // the class's landscape with nothing that sets the sheet: the PDF is A4 upright, so landscape
  // is asked again: pass makes the sheet turn, A4 as it was
  const b = doc('', 'Text.', '\\documentclass[landscape]{article}');
  assert.equal(PS.sheetLandscape(b), false);
  assert.equal(twice(b, (t) => PS.orientationEdits(t, 'landscape')), doc('\\usepackage[pass]{geometry}\n', 'Text.', '\\documentclass[landscape,a4paper]{article}'));
  assert.equal(apply(b, PS.orientationEdits(b, 'portrait')), doc('', 'Text.', '\\documentclass{article}'));
  const c = doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a4paper]{article}');
  assert.equal(twice(c, (t) => PS.orientationEdits(t, 'landscape')), doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a4paper,landscape]{article}'));
});

ok('header and footer distances: geometry\'s keys, the text block pinned where the class lays it out', () => {
  const a = doc('', 'Text.', '\\documentclass[a4paper]{article}');
  const pin = { l: 125.27, tw: 345, t: 125.27, th: 598 };
  assert.equal(apply(a, PS.headFootEdits(a, { headsep: 40 }, { pin })), doc('\\usepackage[left=125.27pt,textwidth=345pt,top=125.27pt,textheight=598pt,headsep=40pt]{geometry}\n', 'Text.', '\\documentclass[a4paper]{article}'));
  const b = doc('\\usepackage[margin=2cm]{geometry}\n');
  assert.equal(twice(b, (t) => PS.headFootEdits(t, { footskip: 30 })), doc('\\usepackage[margin=2cm,footskip=30pt]{geometry}\n'));
  // nothing sets the sheet (A4 shown, Letter the class's paper): A4 kept
  const c = doc('');
  assert.equal(apply(c, PS.headFootEdits(c, { headsep: 40 }, { pin })), doc('\\usepackage[a4paper,left=125.27pt,textwidth=345pt,top=125.27pt,textheight=598pt,headsep=40pt]{geometry}\n'));
});

ok('the sheet and the text block as TeX makes them: A4 where nothing sets the PDF\'s size, geometry bare or with pass (review H4, M1)', () => {
  const G = (src) => geometry(buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' }).opts);
  const near = (g, want, what) => { for (const [k, v] of Object.entries(want)) assert.ok(Math.abs(g[k] - v) < 0.05, what + ' ' + k + ': ' + g[k] + ' against TeX\'s ' + v); };
  // \documentclass{article}: the class's Letter text block on TeX Live's A4 sheet (595 x 842 bp)
  near(G(doc('')), { pw: 597.51, ph: 845.05, paperW: 614.295, tw: 345, ml: 134.27, th: 550, mt: 125.27 }, 'article');
  // a5paper alone: the PDF is still A4 upright; with hyperref it is A5
  near(G(doc('', 'Text.', '\\documentclass[a5paper]{article}')), { pw: 597.51, ph: 845.05, tw: 276 }, 'a5');
  near(G(doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a5paper]{article}')), { pw: 421.1, ph: 597.51, tw: 276 }, 'a5 hyperref');
  assert.equal(G(doc('', 'Text.', '\\documentclass[landscape]{article}')).land, false);
  // geometry with no options: its own layout (0.7 of the paper), TeX's \textwidth 418.25pt on A4
  near(G(doc('\\usepackage{geometry}\n', 'Text.', '\\documentclass[a4paper]{article}')), { pw: 597.51, tw: 418.25 }, 'bare geometry');
  // pass: the class's text block (TeX: 345pt, \oddsidemargin 53pt, 598pt), the sheet the class's paper
  near(G(doc('\\usepackage[pass]{geometry}\n', 'Text.', '\\documentclass[a4paper]{article}')), { pw: 597.51, tw: 345, ml: 125.27, th: 598 }, 'pass a4');
  near(G(doc('\\usepackage[pass]{geometry}\n', 'Text.', '\\documentclass[letterpaper]{article}')), { pw: 614.295, ph: 794.97, tw: 345, ml: 134.27 }, 'pass letter');
  near(G(doc('\\usepackage[pass,margin=1cm]{geometry}\n', 'Text.', '\\documentclass[letterpaper]{article}')), { tw: 345 }, 'pass ignores keys');
  // memoir and KOMA set the sheet
  near(G(doc('', 'Text.', '\\documentclass[a5paper]{memoir}')), { pw: 421.1 }, 'memoir');
  near(G(doc('', 'Text.', '\\documentclass[paper=a5]{scrartcl}')), { pw: 421.1 }, 'KOMA');
  // the paper written by Size makes the drawn sheet what the PDF has
  const a = doc('');
  near(G(apply(a, PS.paperEdits(a, 'letter'))), { pw: 614.295, ph: 794.97, tw: 345, ml: 134.27 }, 'Size letter');
  near(G(apply(a, PS.paperEdits(a, 'a5'))), { pw: 421.1, tw: 276 }, 'Size a5');
  // margins on a page whose sheet nothing set: the sheet stays A4
  near(G(apply(a, PS.marginEdits(a, { t: 72.27, b: 72.27, l: 72.27, r: 72.27 }))), { pw: 597.51, tw: 597.51 - 144.54 }, 'margins');
});

ok('margins: Word\'s presets as the fewest keys; the same again changes nothing; mirrored is two sided', () => {
  const CM = 72.27 / 2.54;
  const a = doc('');
  // (the sheet shown, A4 where nothing set it, stays: a4paper beside them)
  const N = twice(a, (t) => PS.marginEdits(t, { t: 2.54 * CM, b: 2.54 * CM, l: 2.54 * CM, r: 2.54 * CM }));
  assert.equal(N, doc('\\usepackage[a4paper,margin=2.54cm]{geometry}\n'));
  const M = twice(N, (t) => PS.marginEdits(t, { t: 2.54 * CM, b: 2.54 * CM, l: 1.91 * CM, r: 1.91 * CM }));
  assert.equal(M, doc('\\usepackage[a4paper,vmargin=2.54cm,hmargin=1.91cm]{geometry}\n'));
  const R = PS.marginEdits(N, { t: 2.54 * CM, b: 2.54 * CM, l: 3.18 * CM, r: 2.54 * CM, mirrored: true });
  assert.equal(apply(N, R), doc('\\usepackage[a4paper,twoside,vmargin=2.54cm,inner=3.18cm,outer=2.54cm]{geometry}\n'));
  // a class paper and pass: pass goes (it would ignore the margins), the paper is the class's
  const P = doc('\\usepackage[pass]{geometry}\n', 'Text.', '\\documentclass[letterpaper]{article}');
  assert.equal(twice(P, (t) => PS.marginEdits(t, { t: 72.27, b: 72.27, l: 72.27, r: 72.27 })), doc('\\usepackage[margin=2.54cm]{geometry}\n', 'Text.', '\\documentclass[letterpaper]{article}'));
  assert.deepEqual(PS.marginKeys({ t: 72.27, b: 72.27, l: 72.27, r: 72.27, gutter: CM }), { margin: '2.54cm', bindingoffset: '1cm' });
  // the page reads what was written: Normal is an inch all round
  const m = buildModel({ files: new Map([['main.tex', N]]), main: 'main.tex' });
  const g = geometry(m.opts);
  assert.ok(Math.abs(g.ml - 72.27) < 0.01 && Math.abs(g.mt - 72.27) < 0.01 && Math.abs(g.pw - g.tw - 144.54) < 0.01);
});

ok('breaks: on a line of their own, a paragraph cut in two halves at the caret', () => {
  const src = 'One two three.\n\nFour.';
  const at = (p, t = '\\newpage') => { const r = PS.breakEdits(src, p, p, t); return [apply(src, r.edits), r.caret]; };
  const [mid, c1] = at(3);
  assert.equal(mid, 'One\n\\newpage\ntwo three.\n\nFour.');
  assert.equal(mid.slice(c1, c1 + 3), 'two');
  assert.equal(at(14)[0], 'One two three.\n\\newpage\n\nFour.');
  assert.equal(at(16)[0], 'One two three.\n\n\\newpage\nFour.');
  assert.equal(at(3, PS.BREAKS.blank)[0], 'One\n\\newpage\n\\null\n\\newpage\ntwo three.\n\nFour.');
  // a selection goes
  const r = PS.breakEdits(src, 4, 8, '\\newpage');
  assert.equal(apply(src, r.edits), 'One\n\\newpage\nthree.\n\nFour.');
});

ok('columns: two as the class\'s twocolumn, three as multicols around the body, one takes them out', () => {
  const src = doc('', '\\maketitle\n\nA.\n\nB.');
  const two = twice(src, (t) => PS.columnsEdits(t, 2));
  assert.equal(two, doc('', '\\maketitle\n\nA.\n\nB.', '\\documentclass[twocolumn]{article}'));
  assert.equal(apply(two, PS.columnsEdits(two, 1)), src);
  const three = twice(src, (t) => PS.columnsEdits(t, 3));
  assert.equal(three, doc('\\usepackage{multicol}\n', '\\maketitle\n\n\\begin{multicols}{3}\nA.\n\nB.\n\\end{multicols}'));
  const four = twice(three, (t) => PS.columnsEdits(t, 4));
  assert.equal(four, three.replace('{multicols}{3}', '{multicols}{4}'));
  // one: the environment goes, byte for byte; its package stays (rule 5)
  assert.equal(apply(three, PS.columnsEdits(three, 1)), doc('\\usepackage{multicol}\n', '\\maketitle\n\nA.\n\nB.'));
  // the caret's multicols, as { s, e, n }
  const M = PS.multicolsAt(three, three.indexOf('A.'));
  assert.equal(M.n, 3);
  assert.equal(three.slice(M.s, M.e), '\\begin{multicols}{3}\nA.\n\nB.\n\\end{multicols}');
  assert.equal(PS.multicolsAt(three, three.indexOf('\\maketitle')), null);
  // the space and the line between
  const s1 = twice(src, (t) => PS.lengthEdits(t, 'columnseprule', '0.4pt'));
  assert.equal(s1, doc('\\setlength{\\columnseprule}{0.4pt}\n', '\\maketitle\n\nA.\n\nB.'));
  assert.equal(apply(s1, PS.lengthEdits(s1, 'columnseprule', null)), src);
});

ok('a page break in formatted words: the groups closed and opened again, or the break moved out of them; none in a footnote or a box (review M3)', () => {
  const at = (src, word, q) => { const p = src.indexOf(word); const r = PS.breakAt(src, 0, p, q == null ? p : q, '\\newpage'); return r.blocked ? { blocked: r.blocked } : { text: apply(src, r.edits), caret: r.caret }; };
  // the reviewer's: Ctrl+Enter between "bold" and "words"
  const b = at('Some \\textbf{bold words} here.', 'words');
  assert.equal(b.text, 'Some \\textbf{bold}\n\\newpage\n\\textbf{words} here.');
  assert.equal(b.text.slice(b.caret, b.caret + 5), 'words');
  // at a group's start or end: the break before it, after it
  assert.equal(at('Some \\textbf{bold words} here.', 'bold').text, 'Some\n\\newpage\n\\textbf{bold words} here.');
  assert.equal(at('Some \\textbf{bold words} here.', '} here').text, 'Some \\textbf{bold words}\n\\newpage\nhere.');
  // declarations and arguments kept
  assert.equal(at('A {\\bfseries bold words} b.', 'words').text, 'A {\\bfseries bold}\n\\newpage\n{\\bfseries words} b.');
  assert.equal(at('A \\textcolor{red}{red \\emph{deep words} x} b.', 'words').text, 'A \\textcolor{red}{red \\emph{deep}}\n\\newpage\n\\textcolor{red}{\\emph{words} x} b.');
  // footnotes, boxes, minipages: no page there
  assert.match(at('A\\footnote{note words} b.', 'words').blocked, /footnote/);
  assert.match(at('A \\parbox{3cm}{box words} b.', 'words').blocked, /parbox/);
  assert.match(at('\\begin{minipage}{3cm}\nmini words\n\\end{minipage}', 'words').blocked, /minipage/);
  // a comment or maths before it changes nothing
  assert.equal(at('$a{b}$ then words % {\n', 'words').text, '$a{b}$ then\n\\newpage\nwords % {\n');
});

ok('breaks as TeX makes them: \\newpage ends the page in multicols and a column in two columns; Even and Odd page land on the next page of that parity (review M2, M6)', () => {
  const L = new Layout(null, null);
  L.g = { th: 100, pt: 10, bs: 12, cols: 1, twoside: false, colsep: 10, tw: 300 };
  L.px = 1; L.page = {};
  const P = (h = 30, o = {}) => ({ kind: 'p', h, sb: 0, lines: null, ...o });
  const BR = (o = {}) => ({ kind: 'break', ...o });
  const where = (items) => L.plan(items).map((pg) => pg.entries.map((e) => items.indexOf(e.it)));
  // Even page from page 1: page 2 is even, no blank page (the reviewer: the old break gave page 4)
  assert.deepEqual(where([P(), BR(), BR({ parity: 'even' }), P()]), [[0], [3]]);
  // from page 2: a blank page 3, the text on page 4
  assert.deepEqual(where([P(), BR(), P(), BR(), BR({ parity: 'even' }), P()]), [[0], [2], [], [5]]);
  // Odd page from page 1: page 2 blank, the text on 3; from page 2: page 3 at once
  assert.deepEqual(where([P(), BR(), BR({ parity: 'odd' }), P()]), [[0], [], [3]]);
  assert.deepEqual(where([P(), BR(), P(), BR(), BR({ parity: 'odd' }), P()]), [[0], [2], [5]]);
  // \newpage inside multicols (a region): the page ends, not the column
  const mc = (o = {}) => P(30, { cols: 2, region: 'r1', ...o });
  const pages = L.plan([mc(), BR({ column: true, region: 'r1', cols: 2 }), mc()]);
  assert.equal(pages.length, 2);
  // in a two column document \newpage ends the column, the page goes on
  L.g = { ...L.g, cols: 2 };
  assert.equal(L.plan([P(), BR({ column: true }), P()]).length, 1);
  // the source: the model reads the idiom Even page writes
  const src = doc('', 'One.\n' + PS.BREAKS.even + '\nTwo.');
  const m = buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
  const br = m.blocks.flatMap((B) => B.items).filter((x) => x.type === 'pagebreak');
  assert.deepEqual(br.map((x) => x.parity || (x.column ? 'col' : 'page')), ['page', 'even']);
});

ok('several steps of a dialog: as many edits as places changed, each the smallest (review, Low)', () => {
  const src = doc('', 'One.\n\nTwo.');
  const E = PS.stepEdits(src, [(t) => [{ s: t.indexOf('Two'), e: t.indexOf('Two'), t: '\\vspace*{\\fill}\n' }], (t) => PS.marginEdits(t, { t: 72.27, b: 72.27, l: 72.27, r: 72.27 })]);
  assert.equal(E.length, 2);
  assert.ok(E.every((x) => x.t.length < 60), JSON.stringify(E));
  assert.equal(apply(src, E), doc('\\usepackage[a4paper,margin=2.54cm]{geometry}\n', 'One.\n\n\\vspace*{\\fill}\nTwo.'));
  assert.equal(PS.stepEdits(src, [() => null]), null);
});

ok('columns never hold a float: multicols ended before it and begun again after, read back as the body\'s columns, gone again to the byte (review H5)', () => {
  const src = '\\documentclass{article}\n\\begin{document}\nText before words.\n\\begin{figure}[h]\n\\centering\nFIGBODY\n\\caption{A caption}\n\\end{figure}\nText after.\n\\end{document}\n';
  const three = apply(src, PS.columnsEdits(src, 3));
  assert.equal(three, '\\documentclass{article}\n\\usepackage{multicol}\n\\begin{document}\n\\begin{multicols}{3}\nText before words.\n\\end{multicols}\n\\begin{figure}[h]\n\\centering\nFIGBODY\n\\caption{A caption}\n\\end{figure}\n\\begin{multicols}{3}\nText after.\n\\end{multicols}\n\\end{document}\n');
  assert.equal(PS.bodyColumns(three).n, 3);
  assert.deepEqual(PS.columnsEdits(three, 3), []);
  const two = apply(three, PS.columnsEdits(three, 2));
  assert.equal(two.match(/\\begin\{multicols\}\{2\}/g).length, 2);
  assert.equal(apply(three, PS.columnsEdits(three, 1)), src.replace('\\begin{document}', '\\usepackage{multicol}\n\\begin{document}'));
  // around a selection too; figure* may stay (it goes to a page's top)
  const sel = 'A.\n\n\\begin{table}\nT\n\\end{table}\n\nB.\n\n\\begin{figure*}\nW\n\\end{figure*}\n\nC.';
  assert.equal(apply(sel, PS.wrapMulticols(sel, 0, sel.length, 3)), '\\begin{multicols}{3}\nA.\n\\end{multicols}\n\n\\begin{table}\nT\n\\end{table}\n\n\\begin{multicols}{3}\nB.\n\n\\begin{figure*}\nW\n\\end{figure*}\n\nC.\n\\end{multicols}');
  // a float a document has inside multicols: drawn as left out, as TeX leaves it out
  const inside = '\\documentclass{article}\n\\usepackage{multicol}\n\\begin{document}\n\\begin{multicols}{2}\nOne.\n\\begin{figure}\nX\\caption{Gone}\n\\end{figure}\nTwo.\n\\end{multicols}\n\\end{document}\n';
  const m = buildModel({ files: new Map([['main.tex', inside]]), main: 'main.tex' });
  const items = m.blocks.flatMap((B) => B.items);
  const lost = items.find((x) => x.lost);
  assert.ok(lost && /left out of the PDF/.test(lost.name), JSON.stringify(items.map((x) => x.type)));
  assert.ok(!items.some((x) => x.type === 'float'));
  // and each paragraph of the multicols is a block of its own (review M5): typing redraws one
  const mb = m.blocks.filter((B) => B.items.some((x) => x.mc));
  assert.ok(mb.length >= 3, mb.length);
  assert.ok(mb.every((B) => B.items.every((x) => x.mc && x.mc.n === 2 && x.mc.key === 'main.tex:mc1')));
});

ok('headers and footers: fancyhdr turned on once, a place written in place, the plain page number kept', () => {
  const src = doc('\\usepackage{amsmath}\n');
  const keep = { FOC: '\\thepage', FEC: '\\thepage' };
  const h = twice(src, (t) => PS.slotEdits(t, new Set(['HOR', 'HER']), 'Draft', { keep }));
  assert.equal(h, doc('\\usepackage{amsmath}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\renewcommand{\\headrulewidth}{0pt}\n\\fancyhead[R]{Draft}\n\\fancyfoot[C]{\\thepage}\n'));
  // written again: in place
  const h2 = apply(h, PS.slotEdits(h, new Set(['HOR', 'HER']), 'Final'));
  assert.equal(h2, h.replace('{Draft}', '{Final}'));
  // read back
  const H = PS.readHF(h2);
  assert.equal(H.style, 'fancy');
  const T = PS.slotTexts(H.cmds);
  assert.equal(T.HOR, 'Final'); assert.equal(T.FEC, '\\thepage'); assert.equal(T.HOL, '');
  // a command naming more places than the one written: a command of its own for that one
  const tw = doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[LE,RO]{\\thepage}\n', 'Text.', '\\documentclass[twoside]{article}');
  const t2 = apply(tw, PS.slotEdits(tw, new Set(['HOR']), 'X', { twoside: true }));
  assert.ok(t2.includes('\\fancyhead[LE,RO]{\\thepage}\n\\fancyhead[RO]{X}\n'), t2);
  assert.equal(PS.slotTexts(PS.readHF(t2).cmds).HEL, '\\thepage');
  // fancyhdr's old commands and selectors read as it reads them
  assert.deepEqual([...PS.slotsOf('LE,RO', 'H')].sort(), ['HEL', 'HOR']);
  assert.deepEqual([...PS.slotsOf('C', 'F')].sort(), ['FEC', 'FOC']);
  assert.equal(PS.slotsOf(null, 'HF').size, 12);
  const old = doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\lhead{Left}\\rfoot[even]{odd}\n');
  const T2 = PS.slotTexts(PS.readHF(old).cmds);
  assert.equal(T2.HOL, 'Left'); assert.equal(T2.FER, 'even'); assert.equal(T2.FOR, 'odd');
  assert.equal(PS.selectorOf(new Set(['HOR', 'HEL']), true), 'LE,RO');
  assert.equal(PS.selectorOf(new Set(['HOR', 'HER']), true), 'R');
  // the rules
  assert.equal(PS.readHF(h).rules.head.value, '0pt');
  // \pagestyle{empty} becomes fancy where it stands
  const e = doc('\\pagestyle{empty}\n');
  assert.equal(apply(e, PS.slotEdits(e, new Set(['FOC', 'FEC']), '\\thepage')), doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\renewcommand{\\headrulewidth}{0pt}\n\\fancyfoot[C]{\\thepage}\n'));
});

ok('the header typed on the page: TeX\'s signs typed as words, braces that do not pair never written (review H1)', () => {
  // the reviewer's: \textbf{ typed, a pause: nothing written until the brace closes
  assert.ok(unbalanced(escapeTyped('Old', 'Old \\textbf{')));
  assert.equal(unbalanced(escapeTyped('Old', 'Old \\textbf{x}')), '');
  assert.ok(unbalanced('Old \\'));
  assert.ok(unbalanced('a}b{'));
  // $ _ ^ ~ & % # typed are text; the source's own $x$ stays maths; \$ typed is a command already
  assert.equal(escapeTyped('Old', 'Old costs $5 and a_b'), 'Old costs \\$5 and a\\_b');
  assert.equal(escapeTyped('$x$ and', '$x$ and 50% ^~#&'), '$x$ and 50\\% \\textasciicircum{}\\textasciitilde{}\\#\\&');
  assert.equal(escapeTyped('', 'a \\$ b \\\\$'), 'a \\$ b \\\\\\$');
  assert.equal(escapeTyped('\\thepage', 'Page \\thepage'), 'Page \\thepage');
  // and the page draws them as the PDF prints them
  assert.equal(hfRuns('50\\% \\textasciicircum{}\\textasciitilde{} \\$5 a\\_b').map((x) => x.t).join(''), '50% ^~ $5 a_b');
});

ok('a header\'s argument over several lines, with comments: read as TeX reads it, edited where it changed, comments kept (review H2)', () => {
  const src = doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[L]{%\n  \\textbf{My Title}% the running title\n}\n');
  const P = PS.readPage(src);
  assert.equal(P.slots.HOL, '\\textbf{My Title}');
  assert.equal(hfRuns(P.slots.HOL).map((x) => x.t).join(''), 'My Title');
  // even unread, a comment in the TeX is no text on the page
  assert.equal(hfRuns('\\textbf{My Title}% the running title\n').map((x) => x.t).join(''), 'My Title');
  // "!" typed at the end: one character, before the comment
  const a = apply(src, PS.slotEdits(src, new Set(['HOL', 'HEL']), '\\textbf{My Title}!'));
  assert.equal(a, src.replace('{My Title}%', '{My Title}!%'));
  assert.equal(PS.readPage(a).slots.HOL, '\\textbf{My Title}!');
  // a change across the comment cannot be made without losing it: refused
  const b = doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhead[L]{One% note\nTwo}\n');
  assert.equal(PS.readPage(b).slots.HOL, 'OneTwo');
  assert.equal(PS.slotEdits(b, new Set(['HOL', 'HEL']), 'Three'), null);
  assert.equal(apply(b, PS.slotEdits(b, new Set(['HOL', 'HEL']), 'OneTwo!')), b.replace('Two}', 'Two!}'));
  // CRLF: the line added in the file's own line ends
  const c = doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n').replace(/\n/g, '\r\n');
  const c1 = apply(c, PS.slotEdits(c, new Set(['FOR', 'FER']), 'x'));
  assert.ok(!/[^\r]\n/.test(c1), JSON.stringify(c1));
  const d = doc('').replace(/\n/g, '\r\n');
  const d1 = apply(d, PS.slotEdits(d, new Set(['HOL', 'HEL']), 'x', { keep: { FOC: '\\thepage', FEC: '\\thepage' } }));
  assert.ok(!/[^\r]\n/.test(d1), JSON.stringify(d1));
});

ok('a \\fancypagestyle of the document\'s own: drawn as its pages get it, edited inside it (review H3)', () => {
  const thesis = '\\usepackage{fancyhdr}\n\\fancypagestyle{thesis}{\\fancyhf{}\\fancyhead[L]{My Thesis}\\fancyhead[R]{\\leftmark}\\fancyfoot[R]{\\thepage}}\n\\pagestyle{thesis}\n';
  const src = doc(thesis);
  const P = PS.readPage(src);
  assert.equal(P.style, 'thesis');
  assert.equal(P.fancy, true);
  assert.deepEqual([P.slots.HOL, P.slots.HOR, P.slots.FOR, P.slots.FOC], ['My Thesis', '\\leftmark', '\\thepage', '']);
  assert.equal(P.headrule, 0.4);
  // "Draft" at the centre: inside the style, \pagestyle{thesis} kept
  const a = twice(src, (t) => PS.slotEdits(t, new Set(['HOC', 'HEC']), 'Draft'));
  assert.equal(a, src.replace('\\fancyfoot[R]{\\thepage}}', '\\fancyfoot[R]{\\thepage}\\fancyhead[C]{Draft}}'));
  // its own place: in place
  assert.equal(apply(src, PS.slotEdits(src, new Set(['HOL', 'HEL']), 'Final Thesis')), src.replace('{My Thesis}', '{Final Thesis}'));
  // a style over several lines: a line before its closing brace, indented as its lines
  const m = doc('\\usepackage{fancyhdr}\n\\fancypagestyle{main}{%\n  \\fancyhf{}%\n  \\fancyfoot[C]{\\thepage}%\n}\n\\pagestyle{main}\n');
  assert.equal(apply(m, PS.slotEdits(m, new Set(['HOR', 'HER']), 'X')), m.replace('  \\fancyfoot[C]{\\thepage}%\n}', '  \\fancyfoot[C]{\\thepage}%\n  \\fancyhead[R]{X}\n}'));
  // a style over fancy's own settings, and over its base
  const b = doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyfoot[C]{\\thepage}\n\\fancypagestyle{x}{\\fancyhead[L]{X}}\n\\fancypagestyle{y}[x]{\\renewcommand{\\headrulewidth}{0pt}\\fancyhead[R]{Y}}\n\\pagestyle{y}\n');
  const B = PS.readPage(b);
  assert.deepEqual([B.slots.HOL, B.slots.HOR, B.slots.FOC, B.headrule], ['X', 'Y', '\\thepage', 0]);
  // \fancypagestyle{plain}: the chapters' and the title's pages
  const pl = PS.readPage(doc('\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancypagestyle{plain}{\\fancyhf{}\\fancyfoot[R]{\\thepage}}\n'));
  assert.equal(pl.styles.plain.slots.FOR, '\\thepage');
  assert.equal(pl.styles.plain.slots.HOL, '');
});

ok('KOMA-Script: scrlayer-scrpage\'s own commands read and edited, a KOMA class gets it rather than fancyhdr (review, Low)', () => {
  const cls = '\\documentclass{scrartcl}';
  const src = doc('\\usepackage{scrlayer-scrpage}\n\\ihead{Left}\n\\cfoot[\\pagemark]{\\pagemark}\n', 'Text.', cls);
  const P = PS.readPage(src);
  assert.equal(P.style, 'scrheadings');
  assert.deepEqual([P.slots.HOL, P.slots.HOC, P.slots.FOC], ['Left', '\\headmark', '\\pagemark']);
  assert.equal(P.styles['plain.scrheadings'].slots.FOC, '\\pagemark');
  // in place, and a new one after the last
  assert.equal(apply(src, PS.slotEdits(src, new Set(['HOL', 'HEL']), 'Right now')), src.replace('{Left}', '{Right now}'));
  assert.equal(twice(src, (t) => PS.slotEdits(t, new Set(['HOR', 'HER']), 'X')), src.replace('{\\pagemark}\n', '{\\pagemark}\n\\ohead{X}\n'));
  assert.ok(!PS.slotEdits(src, new Set(['HOR', 'HER']), 'X').some((e) => /fancy/.test(e.t)));
  // a KOMA class without it: scrlayer-scrpage, its running head out where the page had none
  const k = doc('', 'Text.', cls);
  const k1 = apply(k, PS.slotEdits(k, new Set(['HOL', 'HEL']), 'Draft', { keep: { FOC: '\\thepage', FEC: '\\thepage' } }));
  assert.equal(k1, doc('\\usepackage{scrlayer-scrpage}\n\\ihead{Draft}\n\\chead{}\n', 'Text.', cls));
  const K1 = PS.readPage(k1);
  assert.deepEqual([K1.slots.HOL, K1.slots.HOC, K1.slots.FOC], ['Draft', '', '\\pagemark']);
  assert.equal(hfRuns('\\pagemark \\headmark', { page: '3', headmark: '1 Intro' }).map((x) => x.t).join(''), '3 1 Intro');
});

ok('a book\'s pages: the headings style, its running head at the top and no number at the foot, in the page and in Word (review M4)', () => {
  const src = doc('', '\\chapter{One}\nText.', '\\documentclass{book}');
  const P = PS.readPage(src);
  assert.equal(P.style, 'headings');
  assert.equal(P.fancy, false);
  assert.deepEqual([P.slots.HEL, P.slots.HER, P.slots.HOL, P.slots.HOR, P.slots.FOC], ['\\thepage', '\\slshape\\leftmark', '\\slshape\\rightmark', '\\thepage', '']);
  assert.equal(PS.readPage(doc('', 'Text.', '\\documentclass{report}')).style, 'plain');
  assert.equal(PS.readPage(doc('', 'Text.', '\\documentclass{memoir}')).style, 'headings');
  // Word gets the running head and the number at the top, nothing at the foot
  const m = buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
  const W = pageForWord(m, src);
  assert.ok(W.head && !W.foot, JSON.stringify(W));
  assert.deepEqual(W.head.even[0], [{ field: 'PAGE', b: false, i: false }]);
  // a header typed in: fancyhdr, the running head kept as it was
  const keep = Object.fromEntries(Object.entries(P.slots).filter(([, t]) => t));
  const a = apply(src, PS.slotEdits(src, new Set(['FOC', 'FEC']), 'Draft', { keep, twoside: true }));
  const A = PS.readPage(a);
  assert.deepEqual([A.slots.HEL, A.slots.HER, A.slots.HOL, A.slots.HOR, A.slots.FOC], ['\\thepage', '\\slshape\\leftmark', '\\slshape\\rightmark', '\\thepage', 'Draft']);
});

ok('page numbers: their format and first number at the body\'s start, back to the bytes of before', () => {
  const src = doc('', '\\maketitle\nText.');
  const r = twice(src, (t) => PS.pageNumberEdits(t, 'roman', 3));
  assert.equal(r, doc('', '\\pagenumbering{roman}\n\\setcounter{page}{3}\n\\maketitle\nText.'));
  assert.deepEqual([PS.pageNumbers(r).numbering, PS.pageNumbers(r).start], ['roman', 3]);
  assert.equal(apply(r, PS.pageNumberEdits(r, 'arabic', 1)), src);
  assert.equal(twice(src, (t) => PS.pageStyleEdits(t, 'empty')), doc('\\pagestyle{empty}\n', '\\maketitle\nText.'));
  // a different first page: \thispagestyle{empty} after \maketitle
  const f = twice(src, (t) => PS.firstPageEdits(t, true));
  assert.equal(f, doc('', '\\maketitle\n\\thispagestyle{empty}\nText.'));
  assert.equal(apply(f, PS.firstPageEdits(f, false)), src);
});

ok('line numbers, hyphenation, watermark, page colour, border: on, read back, off', () => {
  const src = doc('');
  const L = twice(src, (t) => PS.lineNumberEdits(t, 'continuous'));
  assert.equal(L, doc('\\usepackage{lineno}\n\\linenumbers\n'));
  assert.equal(PS.lineNumbers(L).on, true);
  const P = twice(L, (t) => PS.lineNumberEdits(t, 'page'));
  assert.equal(P, doc('\\usepackage[pagewise]{lineno}\n\\linenumbers\n'));
  const S = twice(L, (t) => PS.lineNumberEdits(t, 'section'));
  assert.equal(PS.lineNumbers(S).mode, 'section');
  assert.equal(apply(S, PS.lineNumberEdits(S, 'continuous')), L);
  assert.equal(apply(L, PS.lineNumberEdits(L, 'none')), doc('\\usepackage{lineno}\n'));
  const M = twice(L, (t) => PS.moduloEdits(t, 5));
  assert.equal(PS.lineNumbers(M).modulo, 5);
  assert.equal(apply(M, PS.moduloEdits(M, 1)), L);
  // hyphenation
  const H = twice(src, (t) => PS.hyphenationEdits(t, 'none'));
  assert.equal(H, doc('\\usepackage[none]{hyphenat}\n'));
  assert.equal(apply(H, PS.hyphenationEdits(H, 'auto')), src);
  const X = twice(src, (t) => PS.exceptionEdits(t, ['data-base', 'man-u-script']));
  assert.deepEqual(PS.exceptions(X).words, ['data-base', 'man-u-script']);
  assert.equal(apply(X, PS.exceptionEdits(X, [])), src);
  // watermark
  const W = twice(src, (t) => PS.watermarkEdits(t, { text: 'DRAFT' }));
  assert.equal(W, doc('\\usepackage{draftwatermark}\n\\DraftwatermarkOptions{text=DRAFT}\n'));
  const W2 = twice(W, (t) => PS.watermarkEdits(t, { text: 'CONFIDENTIAL', scale: 0.8, angle: 0, color: 'red!30' }));
  assert.deepEqual([PS.watermark(W2).text, PS.watermark(W2).scale, PS.watermark(W2).angle, PS.watermark(W2).color], ['CONFIDENTIAL', 0.8, 0, 'red!30']);
  assert.equal(apply(W2, PS.watermarkEdits(W2, null)), src);
  assert.equal(PS.watermark(doc('\\usepackage[text=SECRET,scale=2]{draftwatermark}\n')).text, 'SECRET');
  assert.equal(PS.watermark(doc('\\usepackage{draftwatermark}\n\\SetWatermarkText{Old}\n')).text, 'Old');
  // page colour
  const C = twice(src, (t) => PS.pageColorEdits(t, { name: 'yellow!10' }));
  assert.equal(C, doc('\\usepackage{xcolor}\n\\pagecolor{yellow!10}\n'));
  assert.equal(apply(C, PS.pageColorEdits(C, null)), doc('\\usepackage{xcolor}\n'));
  assert.equal(PS.pageColor(apply(C, PS.pageColorEdits(C, { html: 'FFF2CC' }))).color, 'FFF2CC');
  // border
  const B = twice(src, (t) => PS.borderEdits(t, { inset: 72.27 / 2.54, width: 0.4 }));
  assert.ok(B.includes('\\usepackage{tikz}\n\\AddToHook{shipout/background}{\\begin{tikzpicture}[remember picture,overlay]\\draw ([shift={(1cm,-1cm)}]current page.north west) rectangle ([shift={(-1cm,1cm)}]current page.south east);\\end{tikzpicture}}\n'), B);
  const b = PS.pageBorder(B);
  assert.ok(Math.abs(b.inset - 28.4528) < 0.01 && b.width === 0.4 && b.color === null);
  const B2 = apply(B, PS.borderEdits(B, { inset: 2 * 72.27 / 2.54, width: 1, color: 'blue' }));
  assert.deepEqual([Math.round(PS.pageBorder(B2).inset * 10) / 10, PS.pageBorder(B2).width, PS.pageBorder(B2).color], [56.9, 1, 'blue']);
  assert.equal(apply(B, PS.borderEdits(B, null)), doc('\\usepackage{tikz}\n'));
});

ok('the class: base size, two sided, written in its options and taken out again', () => {
  const src = doc('');
  const a = twice(src, (t) => PS.sizeEdits(t, 11));
  assert.equal(a, doc('', 'Text.', '\\documentclass[11pt]{article}'));
  assert.equal(twice(a, (t) => PS.sizeEdits(t, 12)), doc('', 'Text.', '\\documentclass[12pt]{article}'));
  assert.equal(apply(a, PS.sizeEdits(a, 10)), src);
  const t = twice(src, (x) => PS.sidesEdits(x, true));
  assert.equal(t, doc('', 'Text.', '\\documentclass[twoside]{article}'));
  assert.equal(apply(t, PS.sidesEdits(t, false)), src);
  const book = doc('', 'Text.', '\\documentclass{book}');
  assert.equal(PS.classPage(book).twoside, true);
  assert.equal(apply(book, PS.sidesEdits(book, false)), doc('', 'Text.', '\\documentclass[oneside]{book}'));
});

ok('the page reads it: paper, landscape, sides, columns, headers, marks, multicols, fills', () => {
  const src = '\\documentclass[a5paper,twoside]{article}\n\\usepackage{multicol}\n\\usepackage[landscape]{geometry}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[R]{\\thepage}\n'
    + '\\begin{document}\n\\thispagestyle{empty}\n\\pagenumbering{roman}\n\\begin{multicols}{3}\nOne.\n\n\\columnbreak\n\nTwo.\n\\end{multicols}\n\\vspace*{\\fill}\n\\null\n\\cleardoublepage\n\\end{document}\n';
  const m = buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
  const O = m.opts;
  assert.equal(O.paper, 'a5'); assert.equal(O.twoside, true); assert.equal(O.geometry, true); assert.equal(O.geo.landscape, true);
  const g = geometry(O);
  assert.ok(g.pw > g.ph && Math.abs(g.pw - 597.51) < 0.1);
  assert.equal(O.page.fancy, true); assert.equal(O.page.slots.HOR, '\\thepage');
  const items = m.blocks.flatMap((b) => b.items);
  assert.deepEqual(items.filter((i) => i.type === 'pagemark').map((i) => i.mark), [{ thisStyle: 'empty' }, { numbering: 'roman' }]);
  assert.deepEqual(items.filter((i) => i.type === 'p').map((i) => i.mc && i.mc.n), [3, 3]);
  assert.ok(items.some((i) => i.type === 'pagebreak' && i.column && i.only));
  assert.ok(items.some((i) => i.type === 'space' && i.fill));
  assert.ok(items.some((i) => i.type === 'pagebreak' && i.odd));
});

ok('a header\'s TeX as text: the page\'s numbers in, weights kept, nothing run', () => {
  const r = hfRuns('\\textbf{Page} \\thepage\\ of \\pageref{LastPage} -- \\emph{draft} \\& co', { page: 'iv', total: '12' });
  assert.equal(r.map((x) => x.t).join(''), 'Page iv of 12 – draft & co');
  assert.equal(r[0].st.b, true);
  assert.ok(r.some((x) => x.st.i && x.t === 'draft'));
  assert.equal(hfRuns('\\slshape\\rightmark', { right: '1.1 Deep' })[0].st.i, true);
  assert.equal(hfRuns('<script>alert(1)</script>').map((x) => x.t).join(''), '<script>alert(1)</script>');
  assert.deepEqual([fmtNum(4, 'roman'), fmtNum(9, 'Roman'), fmtNum(3, 'alph'), fmtNum(2, 'Alph'), fmtNum(7, 'arabic')], ['iv', 'IX', 'c', 'B', '7']);
  assert.equal(cssColor('red'), '#FF0000');
  assert.equal(cssColor('yellow!10'), 'color-mix(in srgb, #FFFF00 10%, #FFFFFF)');
  assert.equal(cssColor('url(x)'), '');
  assert.equal(cssColor('#C00000'), '#C00000');
});

ok('a stranger\'s preamble is read in bounded time', () => {
  const pre = '\\geometry{'.repeat(20000) + '\\fancyhead['.repeat(20000) + '\\fancyhead[L]{x}'.repeat(3000) + '\\pagecolor{'.repeat(5000) + '\\setlength{\\columnsep}{'.repeat(5000);
  const src = doc(pre);
  const t0 = Date.now();
  PS.readPage(src);
  PS.geometryEdits(src, { margin: '2cm' }, PS.FAMILY.margins);
  PS.slotEdits(src, new Set(['HOL']), 'x');
  PS.lineNumbers(src); PS.watermark(src); PS.pageBorder(src); PS.pageColor(src);
  hfRuns('{'.repeat(100000) + '\\textbf{'.repeat(10000));
  assert.ok(Date.now() - t0 < 4000, 'took ' + (Date.now() - t0) + ' ms');
  // \setlength with a stranger's 190 000 spaces after it: read by steps, not by a pattern that
  // backtracked over them (forty seconds before the fix, with the page frozen)
  const sp = doc('\\setlength' + ' '.repeat(190000) + 'x\n');
  const t1 = Date.now();
  PS.readPage(sp);
  PS.lengthEdits(sp, 'columnsep', '1cm');
  assert.ok(Date.now() - t1 < 500, 'took ' + (Date.now() - t1) + ' ms');
  assert.deepEqual(PS.setLengths('\\setlength{\\columnsep}{1cm}\\setlength \\columnseprule {2pt}\\setlength{\\columnsepx}{3pt}', 'columnseprule').length, 1);
  assert.equal(PS.readPage(doc('\\setlength{\\columnsep}{1cm}\n\\setlength\\columnsep{2cm}\n')).colsep.toFixed(2), (2 * 72.27 / 2.54).toFixed(2));
  // the review fixes' readings (security audit, quick profile): a paragraph of brackets or of
  // nested groups at the caret (read as the ribbon's state at every caret move), a preamble of a
  // thousand \fancypagestyle lines, a body of 20 000 unclosed floats, a header argument of
  // backslashes and comments
  const t2 = Date.now();
  const br = '\\a['.repeat(13000) + 'x', ne = '\\textbf{'.repeat(5000) + 'x', bra = '{'.repeat(39000) + 'x';
  for (const x of [br, ne, bra]) PS.breakAt(x, 0, x.length - 1, x.length - 1, '\\newpage');
  PS.readPage(doc('\\usepackage{fancyhdr}\n' + '\\fancypagestyle{a}{\\fancyhead[L]{x}}\n'.repeat(3000) + '\\pagestyle{a}\n'));
  const fl = doc('', '\\begin{figure}'.repeat(20000));
  PS.bodyColumns(fl); PS.columnsEdits(fl, 3); PS.wrapMulticols(fl, 0, fl.length, 3);
  PS.argEdits('{' + '\\'.repeat(4000) + '%\n'.repeat(500) + '}', 1, 4000 + 1000 + 1, 'x');
  PS.cleanArg('%'.repeat(4000)); PS.cleanArg(' \n'.repeat(4000));
  assert.ok(Date.now() - t2 < 1500, 'took ' + (Date.now() - t2) + ' ms');
});

console.log('page: ' + n + ' passed');
