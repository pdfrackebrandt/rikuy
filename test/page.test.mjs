// The page's set up (src/pagesrc.js, src/layout.js): geometry worked out as TeX's geometry and
// the standard classes do (the numbers below are TeX's own, from \typeout of \textwidth and its
// like), and every control's edit of the source: the smallest one, where the construct already
// stands, nothing more the second time, and back to the bytes of before where it is turned off.
// A stranger's preamble is read in bounded time. test/page.py drives the same through the page.
import assert from 'node:assert/strict';
import * as PS from '../src/pagesrc.js';
import { geometry, hfRuns, fmtNum, cssColor } from '../src/layout.js';
import { applyEdits } from '../src/styles.js';
import { buildModel } from '../src/model.js';

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

ok('paper: where it is written (geometry, the class), else geometry; the PDF then takes its size', () => {
  const a = doc('');
  assert.equal(twice(a, (t) => PS.paperEdits(t, 'a5')), doc('\\usepackage[a5paper]{geometry}\n'));
  // the class's option changes in place, with geometry beside it so the PDF's sheet follows
  const b = doc('', 'Text.', '\\documentclass[11pt,a4paper]{article}');
  assert.equal(twice(b, (t) => PS.paperEdits(t, 'letter')), doc('\\usepackage{geometry}\n', 'Text.', '\\documentclass[11pt,letterpaper]{article}'));
  // with hyperref loaded the class's option is enough (hyperref sets the PDF's size)
  const c = doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a4paper]{article}');
  assert.equal(apply(c, PS.paperEdits(c, 'a5')), doc('\\usepackage{hyperref}\n', 'Text.', '\\documentclass[a5paper]{article}'));
  // in geometry: the other size goes
  const d = doc('\\usepackage[a4paper,margin=2cm]{geometry}\n');
  assert.equal(twice(d, (t) => PS.paperEdits(t, 'legal')), doc('\\usepackage[margin=2cm,legalpaper]{geometry}\n'));
  // any size
  assert.equal(apply(d, PS.paperEdits(d, { w: 20 * 72.27 / 2.54, h: 25 * 72.27 / 2.54 })), doc('\\usepackage[margin=2cm,paperwidth=20cm,paperheight=25cm]{geometry}\n'));
});

ok('orientation: landscape in geometry; portrait takes it out where it is', () => {
  const a = doc('\\usepackage[margin=2cm]{geometry}\n');
  const l = twice(a, (t) => PS.orientationEdits(t, 'landscape'));
  assert.equal(l, doc('\\usepackage[margin=2cm,landscape]{geometry}\n'));
  assert.equal(apply(l, PS.orientationEdits(l, 'portrait')), a);
  const b = doc('', 'Text.', '\\documentclass[landscape]{article}');
  assert.deepEqual(PS.orientationEdits(b, 'landscape'), []);
  assert.equal(apply(b, PS.orientationEdits(b, 'portrait')), doc('', 'Text.', '\\documentclass{article}'));
});

ok('margins: Word\'s presets as the fewest keys; the same again changes nothing; mirrored is two sided', () => {
  const CM = 72.27 / 2.54;
  const a = doc('');
  const N = twice(a, (t) => PS.marginEdits(t, { t: 2.54 * CM, b: 2.54 * CM, l: 2.54 * CM, r: 2.54 * CM }));
  assert.equal(N, doc('\\usepackage[margin=2.54cm]{geometry}\n'));
  const M = twice(N, (t) => PS.marginEdits(t, { t: 2.54 * CM, b: 2.54 * CM, l: 1.91 * CM, r: 1.91 * CM }));
  assert.equal(M, doc('\\usepackage[vmargin=2.54cm,hmargin=1.91cm]{geometry}\n'));
  const R = PS.marginEdits(N, { t: 2.54 * CM, b: 2.54 * CM, l: 3.18 * CM, r: 2.54 * CM, mirrored: true });
  assert.equal(apply(N, R), doc('\\usepackage[twoside,vmargin=2.54cm,inner=3.18cm,outer=2.54cm]{geometry}\n'));
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
});

console.log('page: ' + n + ' passed');
