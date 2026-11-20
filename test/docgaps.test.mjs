// The document agent's Word gaps (PLAN task 68), on strings: Word's table formulas (src/formula.js)
// read, computed and formatted as Word does; a table's preferred width, text wrapping (wraptable),
// double borders and the formula lines (src/table.js), each written and taken off again byte for
// byte; and the model drawing a wraptable and double rules.
import assert from 'node:assert/strict';
import * as F from '../src/formula.js';
import * as X from '../src/table.js';
import { buildModel } from '../src/model.js';
import * as U from '../src/unimath.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const at = (src) => X.parseTable(src, src.search(/\\begin\{(tabular|tabularx|longtable)\}/));
const run = (src, r) => X.apply(src, r.edits);

// ---- formulas ---------------------------------------------------------------------------------------
ok('a cell\'s number as Word reads it', () => {
  const cases = { '12': 12, '1,234.50': 1234.5, '\\$12': 12, '\\textbf{17}': 17, '(12)': -12, '$-$3': -3, '--4': -4, '50\\%': 0.5, '\\num{1234.5}': 1234.5, '.5': 0.5, '€ 3': 3 };
  for (const [t, v] of Object.entries(cases)) assert.equal(F.cellNumber(t), v, t);
  for (const t of ['', 'apples', '12 apples', '1,23', 'A1']) assert.equal(F.cellNumber(t), null, t);
});
ok('A1 names: columns A to Z, AA; rows from 1', () => {
  assert.equal(F.cellName(0, 0), 'A1'); assert.equal(F.cellName(3, 25), 'Z4'); assert.equal(F.cellName(0, 26), 'AA1');
  assert.deepEqual(F.parseRef('b3'), { r: 2, c: 1 }); assert.deepEqual(F.parseRef('AA10'), { r: 9, c: 26 }); assert.equal(F.parseRef('3B'), null);
});
const G = (rows) => rows.map((r) => r.map((t) => (t === null ? null : { v: F.cellNumber(t) })));
ok('ABOVE stops at the first cell that is empty or words (a header row ends it), as Word', () => {
  const g = G([['Item', 'Price'], ['a', '2'], ['b', '3'], ['c', '5'], ['Total', '']]);
  assert.equal(F.evaluate('=SUM(ABOVE)', g, { r: 4, c: 1 }), 10);
  assert.equal(F.evaluate('=AVERAGE(ABOVE)', g, { r: 4, c: 1 }), 10 / 3);
  assert.equal(F.evaluate('=COUNT(ABOVE)', g, { r: 4, c: 1 }), 3);
  assert.equal(F.evaluate('=MAX(ABOVE)-MIN(ABOVE)', g, { r: 4, c: 1 }), 3);
  const gap = G([['1'], [''], ['2'], ['3'], ['']]);
  assert.equal(F.evaluate('SUM(ABOVE)', gap, { r: 4, c: 0 }), 5);
});
ok('LEFT, RIGHT, BELOW, ranges, cells, arithmetic, IF, ROUND, percent', () => {
  const g = G([['x', '2', '3', '4', ''], ['y', '1', '1', '1', '']]);
  assert.equal(F.evaluate('=SUM(LEFT)', g, { r: 0, c: 4 }), 9);
  assert.equal(F.evaluate('=PRODUCT(B1:D1)', g, { r: 0, c: 4 }), 24);
  assert.equal(F.evaluate('=B1*C1+D2', g, { r: 0, c: 4 }), 7);
  assert.equal(F.evaluate('=SUM(B1:D2)/2', g, { r: 1, c: 4 }), 6);
  assert.equal(F.evaluate('=IF(B1>C1, 1, 0)', g, { r: 0, c: 4 }), 0);
  assert.equal(F.evaluate('=ROUND(10/3, 2)', g, { r: 0, c: 4 }), 3.33);
  assert.equal(F.evaluate('=50%*B1', g, { r: 0, c: 4 }), 1);
  assert.equal(F.evaluate('=SUM(RIGHT)', g, { r: 0, c: 0 }), 9);
  assert.equal(F.evaluate('=SUM(BELOW)', G([[''], ['2'], ['5']]), { r: 0, c: 0 }), 7);
  // (a column a merged cell covers is passed over)
  assert.equal(F.evaluate('=SUM(LEFT)', [[{ v: 4 }, null, { v: 1 }, { v: null }]], { r: 0, c: 3 }), 5);
});
ok('a formula Rikuy cannot read or compute says why, in words', () => {
  for (const [t, why] of [['=', /Type a formula/], ['=SUM(ABOVE', /\) is missing/], ['=FOO(1)', /no function or cell named FOO/], ['=1/0', /divides by zero/], ['=ABOVE', /goes inside a function/], ['=1 $ 2', /cannot read/]]) {
    assert.throws(() => F.evaluate(t, [[{ v: 1 }]], { r: 0, c: 0 }), why, t);
  }
});
ok('Word\'s number formats, written as LaTeX', () => {
  assert.equal(F.formatNumber(1234.5, ''), '1234.5');
  assert.equal(F.formatNumber(1234.5, '#,##0'), '1,235');
  assert.equal(F.formatNumber(1234.5, '#,##0.00'), '1,234.50');
  assert.equal(F.formatNumber(0.256, '0%'), '26\\%');
  assert.equal(F.formatNumber(0.256, '0.00%'), '25.60\\%');
  assert.equal(F.formatNumber(-12, '$#,##0.00;($#,##0.00)'), '(\\$12.00)');
  assert.equal(F.formatNumber(12, '$#,##0.00;($#,##0.00)'), '\\$12.00');
  assert.equal(F.formatNumber(-3, '0'), '$-$3');
  assert.equal(F.formatNumber(-0.001, '0.00'), '0.00');
  assert.equal(F.formatNumber(10 / 3, ''), '3.3333333333');
});

// ---- the table's formula lines, a cell's value ----------------------------------------------------------
const PRICES = 'Words.\n\n\\begin{table}[h]\n\\centering\n% alt: Prices\n\\begin{tabular}{lr}\n\\toprule\nItem & Price \\\\\n\\midrule\na & 2 \\\\\nb & \\textbf{3} \\\\\nTotal & \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{P}\n\\end{table}\n\nAfter.';
ok('a formula line goes above the alt line, is read back, changed and taken off byte for byte', () => {
  let T = at(PRICES);
  const one = run(PRICES, X.setFormula(PRICES, T, 'b4', '=SUM(ABOVE)'));
  assert.ok(one.includes('\\centering\n% formula B4: =SUM(ABOVE)\n% alt: Prices\n\\begin{tabular}'), one);
  T = at(one);
  assert.deepEqual(X.formulasOf(one, T).map((x) => [x.name, x.r, x.c, x.text]), [['B4', 3, 1, '=SUM(ABOVE)']]);
  assert.equal(X.tableAlt(one, T).text, 'Prices');
  const two = run(one, X.setFormula(one, T, 'B4', '=AVERAGE(ABOVE) \\# "0.00"'));
  assert.ok(two.includes('% formula B4: =AVERAGE(ABOVE) \\# "0.00"\n% alt'), two);
  assert.equal(run(two, X.setFormula(two, at(two), 'B4', null)), PRICES);
});
ok('the grid of cells and a cell\'s value set, its wrapper kept', () => {
  const T = at(PRICES), g = X.cellGrid(PRICES, T);
  assert.deepEqual(g.map((r) => r.map((x) => x && x.tex)), [['Item', 'Price'], ['a', '2'], ['b', '\\textbf{3}'], ['Total', '']]);
  const empty = g[3][1].cell;
  const w = run(PRICES, X.setCellValue(PRICES, empty, '5'));
  assert.ok(w.includes('Total & 5 \\\\'), w);
  const b = run(PRICES, X.setCellValue(PRICES, g[2][1].cell, '4'));
  assert.ok(b.includes('b & \\textbf{4} \\\\'), b);
  assert.deepEqual(X.setCellValue(PRICES, g[1][1].cell, '2').edits, []);
});

// (the review of PR 84, H2, M2, L2: formula lines did not follow rows Rikuy added, Update then
// overwrote data; a range was looped over its nominal size; numbers unlike Word's)
const FX_TAB = 'Before.\n\n% formula B5 [10]: =SUM(ABOVE)\n% formula C2 [4]: =B2*2+SUM(B2:B4)\n\\begin{tabular}{lrr}\nItem & Price & x \\\\\napples & 2 & 4 \\\\\npears & 3 & \\\\\nplums & 5 & \\\\\nTotal & 10 & \\\\\n\\end{tabular}\n\nAfter.\n';
const follow = (r, src = FX_TAB) => { const T = at(src), fa = X.formulasAfter(src, T, r.edits, r.moved), out = X.apply(src, [...r.edits, ...fa.edits]); return { lines: X.formulasOf(out, at(out)).map((x) => x.name + ' ' + x.text), dropped: fa.dropped, out }; };
ok('formula lines follow rows and columns inserted, deleted, sorted, merged and cells deleted', () => {
  const T = at(FX_TAB), rows = X.dataRows(T);
  assert.deepEqual(follow(X.insertRow(FX_TAB, T, rows[2], false)).lines, ['B6 =SUM(ABOVE)', 'C2 =B2*2+SUM(B2:B5)']);
  assert.deepEqual(follow(X.insertRow(FX_TAB, T, rows[1], true)).lines, ['B6 =SUM(ABOVE)', 'C2 =B2*2+SUM(B2:B5)']);
  assert.deepEqual(follow(X.deleteRows(FX_TAB, T, rows[2], rows[2])).lines, ['B4 =SUM(ABOVE)', 'C2 =B2*2+SUM(B2:B3)']);
  const gone = follow(X.deleteRows(FX_TAB, T, rows[1], rows[1]));
  assert.deepEqual([gone.lines, gone.dropped], [['B4 =SUM(ABOVE)'], ['C2']]);
  assert.deepEqual(follow(X.insertCol(FX_TAB, T, 1, false, { row: rows[0] })).lines, ['C5 =SUM(ABOVE)', 'D2 =C2*2+SUM(C2:C4)']);
  assert.deepEqual(follow(X.insertCol(FX_TAB, T, 1, true, { row: rows[0] })).lines, ['B5 =SUM(ABOVE)', 'D2 =B2*2+SUM(B2:B4)']);
  assert.deepEqual(follow(X.deleteCols(FX_TAB, T, 0, 0)).lines, ['A5 =SUM(ABOVE)', 'B2 =A2*2+SUM(A2:A4)']);
  // (the column a formula reads deleted: #REF!, which Update Formulas reports)
  assert.deepEqual(follow(X.deleteCols(FX_TAB, T, 1, 1)).lines, ['B2 =#REF!*2+SUM(#REF!)']);
  assert.throws(() => F.evaluate('=#REF!*2', [[{ v: 1 }]], { r: 0, c: 0 }), /was deleted/);
  const sorted = follow(X.sortRows(FX_TAB, T, rows[1], rows[4], 1, { desc: true }));
  assert.deepEqual(sorted.lines, ['B2 =SUM(ABOVE)', 'C5 =B5*2+SUM(B3:B5)']);
  // (Sort moves a row ending in an empty cell with its &: three cells a row still)
  assert.ok(sorted.out.includes('Total & 10 & \\\\\nplums & 5 & \\\\\npears & 3 & \\\\\napples & 2 & 4 \\\\'), sorted.out);
  // (the verification of 3d3bfc4: Move Row Up and Down took the lines of the rows they moved)
  const up = follow(X.moveRow(FX_TAB, T, rows[2], -1));
  assert.deepEqual([up.lines, up.dropped], [['B5 =SUM(ABOVE)', 'C3 =B3*2+SUM(B2:B4)'], []]);
  const down = follow(X.moveRow(FX_TAB, T, rows[1], 1));
  assert.deepEqual([down.lines, down.dropped], [['B5 =SUM(ABOVE)', 'C3 =B3*2+SUM(B2:B4)'], []]);
  const merged = follow(X.mergeCells(FX_TAB, T, X.grow(T, { r0: rows[4], r1: rows[4], c0: 0, c1: 1 })));
  assert.deepEqual([merged.lines, merged.dropped], [['C2 =B2*2+SUM(B2:B4)'], ['B5']]);
  assert.deepEqual(follow(X.deleteCells(FX_TAB, T, { r0: rows[2], r1: rows[2], c0: 1, c1: 1 }, 'up')).lines, ['B4 =SUM(ABOVE)', 'C2 =B2*2+SUM(B2:B4)']);
  assert.deepEqual(follow(X.deleteCells(FX_TAB, T, { r0: rows[1], r1: rows[1], c0: 1, c1: 1 }, 'left')).lines, ['B5 =SUM(ABOVE)', 'B2 =#REF!*2+SUM(B2:B4)']);
  // a formula line keeps the value it wrote last, read back
  assert.deepEqual(X.formulasOf(FX_TAB, T).map((x) => x.value), ['10', '4']);
  assert.equal(run(FX_TAB, X.setFormula(FX_TAB, T, 'B5', '=SUM(ABOVE)', '11')), FX_TAB.replace('B5 [10]', 'B5 [11]'));
  assert.match(X.setFormula(FX_TAB, T, 'B5', '=' + '1+'.repeat(300) + '1').error, /at most 500/);
});
ok('a formula reads its range clamped to the table, any length it stores, and rounds as Word', () => {
  const g = G([['1', '2'], ['3', '4']]);
  const t0 = Date.now();
  assert.equal(F.evaluate('=SUM(A1:ZZZ99999)', g, { r: 5, c: 5 }), 10);
  assert.equal(F.evaluate('=MAX(A1:ZZZ99999)+MIN(A1:B2)', g, { r: 5, c: 5 }), 5);
  assert.ok(Date.now() - t0 < 200, Date.now() - t0);
  assert.throws(() => F.evaluate('=' + '1+'.repeat(300) + '1', g, { r: 0, c: 0 }), /at most 500 characters/);
  assert.equal(F.evaluate('=ROUND(-2.5, 0)', g, { r: 0, c: 0 }), -3);
  assert.equal(F.evaluate('=ROUND(2.675, 2)', g, { r: 0, c: 0 }), 2.68);
  assert.equal(F.evaluate('=ROUND(1234, -2)', g, { r: 0, c: 0 }), 1200);
  assert.equal(F.formatNumber(2.675, '#,##0.00'), '2.68');
  assert.equal(F.formatNumber(1.005, '0.00'), '1.01');
  assert.equal(F.formatNumber(1e21, ''), '1000000000000000000000');
  assert.equal(F.formatNumber(5e-8, ''), '0.00000005');
  assert.equal(F.formatNumber(1e21, '#,##0'), '1,000,000,000,000,000,000,000');
});

// (the review of PR 84, L3 and L4: \hhline was no border, and a booktabs table got || and \toprule\toprule)
ok('an \\hhline is read as the border it draws and kept; a booktabs table gets no bars and no double rules', () => {
  const hh = 'x\n\\begin{tabular}{|l|l|}\n\\hhline{|=|=|}\na & b \\\\\n\\hhline{|-|~|}\nc & d \\\\\n\\end{tabular}\ny';
  let T = at(hh);
  const rows = X.dataRows(T);
  const all = X.grow(T, { r0: rows[0], r1: rows[1], c0: 0, c1: 1 });
  assert.equal(X.bordersOf(hh, T, all).top, true);
  assert.equal(X.bordersOf(hh, T, X.grow(T, { r0: rows[1], r1: rows[1], c0: 0, c1: 0 })).top, true);
  assert.equal(X.bordersOf(hh, T, X.grow(T, { r0: rows[1], r1: rows[1], c0: 1, c1: 1 })).top, false);
  // (Top Border on where the \hhline draws it: nothing written, its crossings kept)
  assert.deepEqual(X.setBorders(hh, T, all, { top: true }).edits, []);
  const book = 'x\n\\begin{tabular}{ll}\n\\toprule\na & b \\\\\n\\midrule\nc & d \\\\\n\\bottomrule\n\\end{tabular}\ny';
  T = at(book);
  const r = X.setBorders(book, T, X.grow(T, { r0: X.dataRows(T)[0], r1: X.dataRows(T)[1], c0: 0, c1: 1 }), { top: true, bottom: true, left: true, right: true, insideH: true, insideV: true }, { double: true });
  const out = run(book, r);
  assert.ok(!out.includes('|') && !/\\toprule\s*\\toprule/.test(out) && /booktabs table/.test(r.note), out + r.note);
});

// ---- width, wrapping ----------------------------------------------------------------------------------------
// (the review of PR 84, M4: p{3cm} and siunitx's S became X, and Off gave l and c back)
ok('Preferred width stretches only l, c and r columns; p, m, b and S keep theirs; Off gives the bytes back', () => {
  const W = (spec) => 'x\n\\begin{tabular}{' + spec + '}\na & b & c \\\\\n\\end{tabular}\ny';
  const cases = [['|>{\\bfseries}c p{3cm}@{}r|', '|>{\\centering\\arraybackslash\\bfseries}X p{3cm}@{}>{\\raggedleft\\arraybackslash}X|'], ['p{3cm}lm{2cm}', 'p{3cm}Xm{2cm}'], ['lS[table-format=2.1]b{1cm}', 'XS[table-format=2.1]b{1cm}']];
  for (const [spec, want] of cases) {
    const src = W(spec), r = X.setTableWidth(src, at(src), '0.8\\linewidth'), on = run(src, r);
    assert.ok(on.includes('\\begin{tabularx}{0.8\\linewidth}{' + want + '}'), on);
    assert.deepEqual(r.packages, ['tabularx']);
    assert.equal(run(on, X.setTableWidth(on, at(on), null)), src, spec);
  }
  assert.match(X.setTableWidth(W('p{2cm}S'), at(W('p{2cm}S')), '10cm').error, /widths of their own/);
  // (a tabularx written by hand: Off makes it a tabular of l columns)
  const hand = 'x\n\\begin{tabularx}{\\linewidth}{lX}\na & b \\\\\n\\end{tabularx}\ny';
  assert.equal(run(hand, X.setTableWidth(hand, at(hand), null)), 'x\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\ny');
});
ok('Preferred width: a tabular becomes a tabularx that wide, the width changed in place, and back', () => {
  const T = at(PRICES);
  assert.equal(X.tableWidthOf(PRICES, T), null);
  const r = X.setTableWidth(PRICES, T, '0.8\\linewidth');
  const w = run(PRICES, r);
  assert.ok(w.includes('\\begin{tabularx}{0.8\\linewidth}{lX}') || w.includes('\\begin{tabularx}{0.8\\linewidth}{X>{\\raggedleft\\arraybackslash}X}') || /\\begin\{tabularx\}\{0\.8\\linewidth\}/.test(w), w);
  assert.deepEqual(r.packages.includes('tabularx'), true);
  const T2 = at(w);
  assert.equal(X.tableWidthOf(w, T2), '0.8\\linewidth');
  const w2 = run(w, X.setTableWidth(w, T2, '12cm'));
  assert.ok(/\\begin\{tabularx\}\{12cm\}/.test(w2), w2);
  assert.equal(run(w, X.setTableWidth(w, T2, null)), PRICES);
});
ok('Text wrapping Around: a wraptable on a side, as wide as asked; None gives a table float back', () => {
  const T = at(PRICES);
  assert.deepEqual(X.wrapOf(PRICES, T).around, false);
  const r = X.setWrap(PRICES, T, { around: true, side: 'r', width: '0.4\\linewidth' });
  const w = run(PRICES, r);
  assert.ok(w.includes('\\begin{wraptable}{r}{0.4\\linewidth}\n\\centering') && w.includes('\\end{wraptable}\n\nAfter.'), w);
  assert.deepEqual(r.packages, ['wrapfig']);
  const W = X.wrapOf(w, at(w));
  assert.deepEqual([W.around, W.side, W.width], [true, 'r', '0.4\\linewidth']);
  const l = run(w, X.setWrap(w, at(w), { around: true, side: 'l' }));
  assert.ok(l.includes('\\begin{wraptable}{l}{0.4\\linewidth}'), l);
  const back = run(w, X.setWrap(w, at(w), { around: false }));
  assert.equal(back, PRICES.replace('\\begin{table}[h]', '\\begin{table}[htbp]'));
  // the model draws the wraptable at its side, its width the line's share
  const M = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\n\\usepackage{wrapfig}\n\\begin{document}\n' + w + '\n\\end{document}\n']]), main: 'main.tex' });
  const fl = M.blocks.flatMap((b) => b.items || []).find((x) => x.type === 'float');
  assert.ok(fl && fl.wrapW === '0.4\\linewidth' && fl.side === 'r', JSON.stringify(fl && { w: fl.wrapW, s: fl.side }));
});
ok('Around is refused where wrapfig would lose the table: no paragraph after it, a list, table*', () => {
  const noPara = PRICES.replace('\n\nAfter.', '\n\n\\section{Next}');
  assert.match(X.setWrap(noPara, at(noPara), { around: true }).error, /paragraph of words follows/);
  const inList = '\\begin{itemize}\n\\item x\n' + PRICES + '\n\\end{itemize}';
  assert.match(X.setWrap(inList, at(inList), { around: true }).error, /list or columns/);
  const star = PRICES.replace('{table}[h]', '{table*}[h]').replace('\\end{table}', '\\end{table*}');
  assert.match(X.setWrap(star, at(star), { around: true }).error, /table\*/);
  const bare = 'A\n\\begin{tabular}{l}\nx \\\\\n\\end{tabular}\nB';
  assert.match(X.setWrap(bare, at(bare), { around: true }).error, /in a float/);
});

// ---- double borders --------------------------------------------------------------------------------------------
const PLAIN = 'A\n\\begin{tabular}{ll}\nH & K \\\\\n1 & 2 \\\\\n\\end{tabular}\nZ';
ok('Pen Style Double: \\hline\\hline and ||, single again gives the bytes of a single border', () => {
  const T = at(PLAIN), rect = { r0: 0, r1: 1, c0: 0, c1: 1 };
  const d = run(PLAIN, X.setBorders(PLAIN, T, rect, { top: true, bottom: true, left: true, right: true }, { double: true }));
  assert.ok(d.includes('\\begin{tabular}{||ll||}\n\\hline\\hline') || d.includes('\\begin{tabular}{||ll||}\n\\hline\n\\hline'), d);
  assert.ok(/\\hline\s*\\hline\s*\n\\end\{tabular\}/.test(d), d);
  const single = run(PLAIN, X.setBorders(PLAIN, T, rect, { top: true, bottom: true, left: true, right: true }));
  const back = run(d, X.setBorders(d, at(d), rect, { top: true, bottom: true, left: true, right: true }, { double: false }));
  assert.equal(back, single);
  assert.equal(run(d, X.setBorders(d, at(d), rect, { top: false, bottom: false, left: false, right: false })), PLAIN);
  // the model reads two rules and two bars
  const M = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\n\\begin{document}\n' + d + '\n\\end{document}\n']]), main: 'main.tex' });
  const tb = M.blocks.flatMap((b) => b.items || []).flatMap((it) => [it, ...(it.parts || [])]).find((x) => x.type === 'tabular');
  assert.ok(tb && tb.rows[0].rules.length === 2 && tb.cols[0].vl === 2 && tb.cols[1].vr === 2, JSON.stringify(tb && { r: tb.rows[0].rules, c: tb.cols }));
});

// ---- Word's linear format (UnicodeMath) and LaTeX ---------------------------------------------------------
ok('LaTeX to Word\'s linear format and back: fractions, scripts, roots, big operators, Greek, functions, matrices, text', () => {
  const cases = [['\\frac{a+b}{c}', '(a+b)/c'], ['x^{2}+y^{2}=z^{2}', 'x^2+y^2=z^2'], ['\\sqrt{x+1}', '√(x+1)'], ['\\sqrt[3]{x}', '√(3&x)'], ['\\sum_{i=1}^{n} i^{2}', '∑_(i=1)^n i^2'],
    ['\\alpha \\le \\beta', 'α≤β'], ['\\int_{0}^{\\infty} e^{-x}dx', '∫_0^∞ e^(-x)dx'], ['\\sin x + \\cos^{2} y', 'sin x+cos^2y'], ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '(■(a&b@c&d))'],
    ['\\text{if } x > 0', '"if "x>0'], ['\\frac{1}{2}', '1/2'], ['\\lim_{x \\to 0} \\frac{\\sin x}{x}', 'lim_(x→0) (sin x)/x']];
  const norm = (t) => t.replace(/\s+/g, '');
  for (const [tex, linear] of cases) {
    assert.equal(U.toLinear(tex), linear, tex);
    assert.equal(norm(U.fromLinear(linear)), norm(tex), linear);
  }
  // typed as Word types it
  assert.equal(U.fromLinear('a/b+c'), 'a/b+c'.replace('a/b', '\\frac{a}{b}'));
  assert.equal(U.fromLinear('e^(iπ)+1=0'), 'e^{i\\pi}+1=0');
  assert.equal(U.fromLinear('[■(1&0@0&1)]'), '\\begin{bmatrix}1 & 0 \\\\ 0 & 1\\end{bmatrix}');
  assert.equal(U.fromLinear('x_1, …, x_n'), 'x_{1},\\ldots,x_{n}');
});
// (the review of PR 84, H1 and M1: typing in the Linear box rewrote the equation through a lossy
// converter; Word's operand rules were not followed)
ok('LaTeX the linear format has no form for is kept as written, and a round trip changes nothing', () => {
  const kept = ['\\hat{x} = \\frac{a}{b}^2 \\leftarrow \\mathbf{v}', 'x \\leftarrow y', 'a \\leftrightarrow b', 'A \\rightleftharpoons B', '\\binom{n}{k}', '\\overline{AB}',
    'f(x)=\\begin{cases}1&x>0\\\\0&\\text{else}\\end{cases}', '\\operatorname{tr} A', '\\mathrm{d}x', '\\left(\\frac{1}{2}\\right)', '\\left\\{ x \\right.', '\\sqrt{x}^2', '{a+b}^2', '3{,}14',
    '\\dfrac{a}{b}', 'x^{(2)}', '(a+b)/c', 'x_{max}', 'a\\frac{b}{c}d', '\\underbrace {\\frac{1}{2}}_{x}', '\\hat{\\beta} = (X^\\top X)^{-1} X^\\top y', 'a\\,b', 'x\\%', '\\frac{1}{2} (e^x + e^{-x})', 'n\\in\\mathbb{R}'];
  for (const tex of kept) {
    const L = U.toLinear(tex);
    // (a space typed at the end: the same LaTeX, byte for byte)
    const r = U.linearEdit(tex, L + ' ');
    assert.ok(r.live, tex + ' -> ' + L);
    assert.equal(r.tex, tex, L);
  }
  assert.equal(U.toLinear('\\hat{x} = \\frac{a}{b}^2 \\leftarrow \\mathbf{v}'), '\\hat{x}=〖a/b〗^2←\\mathbf{v}');
  assert.equal(U.toLinear('\\binom{n}{k}'), '\\binom{n}{k}');
  // only whole \left and \right are brackets' sizes: \leftarrow is an arrow
  assert.equal(U.fromLinear('x \\leftarrow y \\rightarrow z \\leftrightarrow w'), 'x\\leftarrow y\\rightarrow z\\leftrightarrow w');
});
ok('typing in the Linear box changes only what was typed; the rest of the source keeps its bytes', () => {
  const E = (tex, f) => U.linearEdit(tex, f(U.toLinear(tex)));
  assert.equal(E('a \\leq b + c', (L) => L.replace('c', 'd')).tex, 'a \\leq b + d');
  assert.equal(E('\\alpha+b', (L) => L.replace('α', 'αx')).tex, '\\alpha x+b');
  assert.equal(E('x^{2} + y^2', (L) => L.replace('y^2', 'y^3')).tex, 'x^{2} + y^{3}');
  assert.equal(E('\\hat{x} = \\frac{a}{b}^2 \\leftarrow \\mathbf{v}', (L) => L + '+1').tex, '\\hat{x} = \\frac{a}{b}^2 \\leftarrow \\mathbf{v}+1');
  // (typed back to what it was: the first bytes again)
  assert.equal(E('x^{2}  +  y', (L) => L).tex, 'x^{2}  +  y');
  // a source the linear format would change (\frac{1}m is read back with braces) waits for Enter
  const r = E('\\frac{1}m + x', (L) => L + 'y');
  assert.ok(!r.live && r.why === 'source', JSON.stringify(r));
  // too deep: a plain message, no throw
  assert.equal(U.linearEdit('x', '('.repeat(19000)).error, U.DEEP);
  assert.equal(U.toLinear('{'.repeat(19000)), null);
});
ok('UnicodeMath read as Word reads it: runs, left to right, right associative scripts, ▒ and 〖〗', () => {
  const cases = { 'ab/cd': '\\frac{ab}{cd}', '2x/3y': '\\frac{2x}{3y}', 'n!/k!': '\\frac{n!}{k!}', '∂f/∂x': '\\frac{\\partial f}{\\partial x}', '1/2/3': '\\frac{\\frac{1}{2}}{3}',
    'x^2^3': 'x^{2^{3}}', 'a^-1': 'a^{-1}', 'x_1/x_2': '\\frac{x_{1}}{x_{2}}', 'a/b^2': '\\frac{a}{b^{2}}', '∑_(i=1)^n▒i': '\\sum_{i=1}^{n}i', '〖a/b〗^2': '\\frac{a}{b}^{2}',
    'f(x)=〖x+1〗^2': 'f(x)={x+1}^{2}', 'x∈ℝ': 'x\\in\\mathbb{R}', 'sin(x)/x': '\\frac{\\sin(x)}{x}', 'lim_(x→0)(sin x)/x': '\\lim_{x\\to0}\\frac{\\sin x}{x}', '1/2+3/4': '\\frac{1}{2}+\\frac{3}{4}',
    'x%': 'x\\%', '(0,1]': '(0,1]', 'a∕b': 'a/b', 'x^+': 'x^{+}' };
  for (const [u, tex] of Object.entries(cases)) assert.equal(U.fromLinear(u), tex, u);
  assert.throws(() => U.fromLinear('('.repeat(19000)), /too deep/);
});

console.log('docgaps: ' + n + ' passed');
