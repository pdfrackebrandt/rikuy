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

// ---- width, wrapping ----------------------------------------------------------------------------------------
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
    ['\\text{if } x > 0', '"if "x>0'], ['\\frac{1}{2}', '1/2'], ['\\lim_{x \\to 0} \\frac{\\sin x}{x}', 'lim_(x→0)(sin x)/x']];
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

console.log('docgaps: ' + n + ' passed');
