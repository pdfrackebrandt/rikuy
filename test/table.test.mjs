// A table's source and the operations on it (src/table.js): the parser on every kind of table
// (& in braces, math and \verb, \\[2pt], rules, @{} >{} p{} X and *{n}{}, tabularx, longtable,
// array, comments, CRLF), each operation and its inverse giving the bytes back, what each writes,
// a stranger's table of a hundred thousand cells read in bounded time, and, given a LaTeX-examples
// clone (CORPUS_DIR or the first argument), every table of the corpus parsed and put back together
// byte for byte, a row and a column inserted and deleted again in each.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as X from '../src/table.js';
import { buildModel } from '../src/model.js';
import { buildWordDoc } from '../src/wordast.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const T0 = (src) => X.parseTable(src, src.indexOf('\\begin{'));
const at = (src) => { const i = src.search(/\\begin\{(tabular|tabularx|tabular\*|longtable|array|xltabular|tabulary)\}/); return X.parseTable(src, i); };
const run = (src, r) => X.apply(src, r.edits);

const BOOK = 'Words.\n\n\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\toprule\nA & B \\\\\n\\midrule\n1 & 2 \\\\\n3 & 4 \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{}\n\\end{table}\n\nAfter.';
const GRID = 'A\n\\begin{tabular}{|l|l|}\n\\hline\nA & B \\\\ \\hline\n1 & 2 \\\\ \\hline\n3 & 4 \\\\ \\hline\n\\end{tabular}\nZ';
const ONELINE = 'A\n\\begin{tabular}{|l|c|r|}\\hline a & b & c\\\\\\hline d & e & f\\\\\\hline\\end{tabular}Z';
const NOSEP = '\\begin{tabular}{lcr}\n  a & b & c \\\\\n  d & e & f\n\\end{tabular}';
const CRLF = '\\begin{tabular}{ll}\r\n\\hline\r\nA & B \\\\\r\n1 & 2 \\\\\r\n\\hline\r\n\\end{tabular}';
const MC = '\\begin{tabular}{|l|c|c|}\\hline\n\\multicolumn{3}{|c|}{Title}\\\\\\hline\na & b & c \\\\\n\\cline{2-3}\nd & \\multicolumn{2}{c|}{wide} \\\\\n\\hline\n\\end{tabular}';
const MR = '\\begin{tabular}{lll}\n\\multirow{2}{*}{M} & a & b \\\\\n & c & d \\\\\n e & f & g \\\\\n\\end{tabular}';
const ALL = { BOOK, GRID, ONELINE, NOSEP, CRLF, MC, MR };

ok('the parser: rows, cells, rules, the specification', () => {
  const T = at(BOOK);
  assert.equal(T.name, 'tabular');
  assert.equal(T.rows.length, 3);
  assert.equal(T.ncols, 2);
  assert.deepEqual(T.rows.map((r) => r.lead.map((x) => x.name)), [['toprule'], ['midrule'], []]);
  assert.deepEqual(T.tail.lead.map((x) => x.name), ['bottomrule']);
  assert.deepEqual(T.rows[1].cells.map((c) => BOOK.slice(c.cs, c.ce)), ['1', '2']);
  assert.equal(X.lookOf(BOOK, T), 'booktabs');
  assert.equal(X.lookOf(GRID, at(GRID)), 'grid');
  assert.equal(X.lookOf(NOSEP, at(NOSEP)), 'plain');
  // & in braces, in a nested tabular, in \verb, in math braces; \\ in braces; comments
  const odd = '\\begin{tabular}{p{2cm}>{\\bfseries}l@{}*{2}{c}}\n{a & b} & \\verb|&| & $\\substack{x \\\\ y}$ & \\begin{tabular}{c} u & v \\end{tabular} \\\\[2pt]\n% a & comment \\\\\nx & y & z & w \\tabularnewline\n\\end{tabular}';
  const U = at(odd);
  assert.ok(U);
  assert.equal(U.ncols, 4);
  assert.deepEqual(U.spec.cols.map((c) => c.letter), ['p', 'l', 'c', 'c']);
  assert.equal(U.spec.cols[0].w, '2cm');
  assert.equal(U.rows.length, 2);
  assert.equal(U.rows[0].cells.length, 4);
  assert.equal(U.rows[0].sep, '\\\\[2pt]');
  assert.equal(odd.slice(U.rows[1].cells[0].cs, U.rows[1].cells[0].ce), 'x');
  assert.equal(X.emit(odd, U), odd);
  // tabularx, longtable, array, tabular*, xltabular
  for (const [env, head] of [['tabularx', '{\\linewidth}{lX}'], ['longtable', '[c]{ll}'], ['array', '{cc}'], ['tabular*', '{\\textwidth}{@{\\extracolsep{\\fill}}ll}'], ['xltabular', '{\\linewidth}{lX}']]) {
    const t = '\\begin{' + env + '}' + head + '\na & b \\\\\n\\end{' + env + '}';
    const V = at(t);
    assert.ok(V, env);
    assert.equal(V.ncols, 2, env);
    assert.equal(X.emit(t, V), t, env);
  }
  assert.equal(at('\\begin{tabularx}{\\linewidth}{lX}\na & b\n\\end{tabularx}').width.text, '\\linewidth');
  // \multicolumn and \multirow
  const M = at(MC);
  assert.deepEqual(M.rows.map((r) => r.cells.map((c) => c.span)), [[3], [1, 1, 1], [1, 2]]);
  assert.equal(at(MR).rows[0].cells[0].mr.n, 2);
  // unbalanced or unterminated: no table
  assert.equal(at('\\begin{tabular}{ll} a } & b \\end{tabular}'), null);
  assert.equal(at('\\begin{tabular}{ll} a & b'), null);
});

ok('every kind put back together byte for byte, CRLF kept', () => {
  for (const [k, src] of Object.entries(ALL)) { const T = at(src); assert.equal(X.emit(src, T), src.slice(T.s, T.e), k); }
  assert.equal(at(CRLF).eol, '\r\n');
});

ok('insert a row above and below every row, and delete it again: the bytes back', () => {
  for (const [k, src] of Object.entries(ALL)) {
    const T = at(src);
    for (let r = 0; r < T.rows.length; r++) for (const below of [false, true]) {
      const res = X.insertRow(src, T, r, below);
      const out = run(src, res);
      const T2 = at(out);
      assert.equal(T2.rows.length, T.rows.length + 1, k + r + below);
      const back = X.deleteRows(out, T2, below ? r + 1 : r, below ? r + 1 : r);
      assert.equal(run(out, back), src, k + ' row ' + r + (below ? ' below' : ' above'));
    }
  }
});

ok('what a new row is: booktabs keeps its groups, a grid gives the row its rule, CRLF lines', () => {
  const T = at(BOOK);
  assert.ok(run(BOOK, X.insertRow(BOOK, T, 0, true)).includes('A & B \\\\\n &  \\\\\n\\midrule'));
  assert.ok(run(BOOK, X.insertRow(BOOK, T, 1, false)).includes('\\midrule\n &  \\\\\n1 & 2'));
  assert.ok(run(BOOK, X.insertRow(BOOK, T, 2, true)).includes('3 & 4 \\\\\n &  \\\\\n\\bottomrule'));
  assert.ok(run(GRID, X.insertRow(GRID, at(GRID), 2, true)).includes('3 & 4 \\\\ \\hline\n &  \\\\ \\hline\n\\end'));
  assert.ok(run(CRLF, X.insertRow(CRLF, at(CRLF), 1, true)).includes('1 & 2 \\\\\r\n &  \\\\\r\n\\hline'));
  assert.equal(run(NOSEP, X.insertRow(NOSEP, at(NOSEP), 1, true)), '\\begin{tabular}{lcr}\n  a & b & c \\\\\n  d & e & f \\\\\n  &  &\n\\end{tabular}');
  // the caret's place: in the new row's first cell
  const r = X.insertRow(BOOK, T, 2, true), out = run(BOOK, r);
  assert.equal(out.slice(r.p, r.p + 6), ' &  \\\\');
  // a \multirow grows when a row comes inside it
  const m = run(MR, X.insertRow(MR, at(MR), 0, true));
  assert.ok(m.startsWith('\\begin{tabular}{lll}\n\\multirow{3}{*}{M}'), m);
});

ok('insert a column left and right of every column, and delete it again: the bytes back', () => {
  for (const [k, src] of Object.entries(ALL)) {
    const T = at(src);
    for (let c = 0; c < T.ncols; c++) for (const right of [false, true]) {
      const out = run(src, X.insertCol(src, T, c, right));
      const T2 = at(out);
      assert.equal(T2.ncols, T.ncols + 1, k + c + right);
      const back = X.deleteCols(out, T2, right ? c + 1 : c, right ? c + 1 : c);
      assert.equal(run(out, back), src, k + ' column ' + c + (right ? ' right' : ' left'));
    }
  }
});

ok('what a new column is: a letter and a bar like its neighbour, \\cline and \\multicolumn follow', () => {
  assert.ok(run(GRID, X.insertCol(GRID, at(GRID), 1, true)).includes('{|l|l|l|}\n\\hline\nA & B & \\\\ \\hline'));
  const m = run(MC, X.insertCol(MC, at(MC), 1, true));
  assert.ok(m.includes('\\multicolumn{4}{|c|}{Title}') && m.includes('\\cline{2-4}') && m.includes('\\multicolumn{3}{c|}{wide}'), m);
  const p = run('\\begin{tabular}{l|p{2cm}}\na & b \\\\\n\\end{tabular}', X.insertCol('\\begin{tabular}{l|p{2cm}}\na & b \\\\\n\\end{tabular}', at('\\begin{tabular}{l|p{2cm}}\na & b \\\\\n\\end{tabular}'), 1, true));
  assert.ok(p.startsWith('\\begin{tabular}{l|p{2cm}|p{2cm}}'), p);
  // a *{n}{…} is written out first
  const s = '\\begin{tabular}{*{3}{c}}\na & b & c \\\\\n\\end{tabular}';
  assert.ok(run(s, X.insertCol(s, at(s), 0, false)).startsWith('\\begin{tabular}{cccc}'));
  // deleting several, and all of them asks to delete the table
  assert.equal(run(BOOK, X.deleteCols(BOOK, at(BOOK), 1, 1)).includes('A \\\\\n\\midrule\n1 \\\\'), true);
  assert.equal(X.deleteCols(BOOK, at(BOOK), 0, 1).table, true);
  assert.equal(X.deleteRows(BOOK, at(BOOK), 0, 2).table, true);
});

ok('merge across, down and both, and split back: the bytes of Rikuy\'s own empty cells back', () => {
  const src = '\\begin{tabular}{|l|l|l|}\n\\hline\n &  &  \\\\ \\hline\n &  &  \\\\ \\hline\n\\end{tabular}';
  const T = at(src);
  // across
  const a = X.mergeCells(src, T, { r0: 0, r1: 0, c0: 0, c1: 1 });
  const ao = run(src, a);
  assert.ok(ao.includes(' \\multicolumn{2}{|c|}{}  &  \\\\'), ao);
  const A = at(ao);
  assert.equal(run(ao, X.splitCell(ao, A, 0, 0)), src);
  // words come together in the first cell
  const w = '\\begin{tabular}{lll}\na & b & c \\\\\nd & e & f \\\\\n\\end{tabular}';
  const W = at(w);
  assert.ok(run(w, X.mergeCells(w, W, { r0: 0, r1: 0, c0: 1, c1: 2 })).includes('a & \\multicolumn{2}{c}{b c} \\\\'));
  // down: \multirow, the cell under emptied
  const d = run(w, X.mergeCells(w, W, { r0: 0, r1: 1, c0: 0, c1: 0 }));
  assert.ok(d.includes('\\multirow{2}{*}{a d} & b & c \\\\\n & e & f'), d);
  assert.deepEqual(X.mergeCells(w, W, { r0: 0, r1: 1, c0: 0, c1: 0 }).packages, ['multirow']);
  // both
  const b = run(w, X.mergeCells(w, W, { r0: 0, r1: 1, c0: 0, c1: 1 }));
  assert.ok(b.includes('\\multicolumn{2}{c}{\\multirow{2}{*}{a b d e}} & c \\\\\n\\multicolumn{2}{c}{} & f'), b);
  // a rule between merged rows leaves out the merged columns
  const g = run(src, X.mergeCells(src, T, { r0: 0, r1: 1, c0: 1, c1: 1 }));
  assert.ok(g.includes('\\\\ \\cline{1-1}\\cline{3-3}\n'), g);
  // and split brings the whole rule back
  const G = at(g);
  const sp = run(g, X.splitCell(g, G, 0, 1));
  assert.equal(sp, src);
  // nothing to merge, nothing to split
  assert.ok(X.mergeCells(w, W, { r0: 0, r1: 0, c0: 0, c1: 0 }).error);
  assert.ok(X.splitCell(w, W, 0, 0).error);
});

ok('merge then split on cells with words gives the words in the first cell', () => {
  const w = '\\begin{tabular}{ll}\nx &  \\\\\n\\end{tabular}';
  const m = run(w, X.mergeCells(w, at(w), { r0: 0, r1: 0, c0: 0, c1: 1 }));
  assert.equal(m, '\\begin{tabular}{ll}\n\\multicolumn{2}{c}{x}  \\\\\n\\end{tabular}');
  assert.equal(run(m, X.splitCell(m, at(m), 0, 0)), '\\begin{tabular}{ll}\nx &  \\\\\n\\end{tabular}');
});

ok('split the table: the rules of its top and bottom on both parts', () => {
  const T = at(BOOK);
  const out = run(BOOK, X.splitTable(BOOK, T, 2));
  assert.ok(out.includes('1 & 2 \\\\\n\\bottomrule\n\\end{tabular}\n\n\\begin{tabular}{ll}\n\\toprule\n3 & 4 \\\\'), out);
  const g = run(GRID, X.splitTable(GRID, at(GRID), 2));
  assert.ok(g.includes('1 & 2 \\\\ \\hline\n\\end{tabular}\n\n\\begin{tabular}{|l|l|}\n\\hline\n3 & 4'), g);
  assert.ok(X.splitTable(BOOK, T, 0).error);
});

ok('alignment: a column\'s letter, a paragraph column\'s \\centering, one cell as \\multicolumn{1}', () => {
  const w = '\\begin{tabular}{|l|p{2cm}|}\na & b \\\\\nc & d \\\\\n\\end{tabular}';
  const T = at(w);
  assert.ok(run(w, X.alignCols(w, T, 0, 0, 'c', null)).startsWith('\\begin{tabular}{|c|p{2cm}|}'));
  const p = X.alignCols(w, T, 1, 1, 'c', 'm');
  assert.ok(run(w, p).startsWith('\\begin{tabular}{|l|>{\\centering\\arraybackslash}m{2cm}|}'), run(w, p));
  assert.deepEqual(p.packages, ['array']);
  // and back
  const w2 = run(w, p), T2 = at(w2);
  assert.equal(run(w2, X.alignCols(w2, T2, 1, 1, 'j', 't')), w);
  // one cell: \multicolumn{1}{c|} with the column's bars, gone again at the column's alignment
  const c = run(w, X.alignCells(w, T, [T.rows[1].cells[0]], 'r'));
  assert.ok(c.includes('\\multicolumn{1}{|r|}{c} & d'), c);
  const C = at(c);
  assert.equal(run(c, X.alignCells(c, C, [C.rows[1].cells[0]], 'l')), w);
  assert.equal(X.cellH(c, C, C.rows[1].cells[0]), 'r');
});

ok('sort rows: by text, by number, down; rules and \\\\ stay; merged rows refused', () => {
  const T = at(BOOK);
  const d = run(BOOK, X.sortRows(BOOK, T, 1, 2, 0, { desc: true }));
  assert.ok(d.includes('\\midrule\n3 & 4 \\\\\n1 & 2 \\\\\n\\bottomrule'), d);
  const n = '\\begin{tabular}{ll}\nx & 10 \\\\\ny & 9 \\\\[2pt]\nz & 100 \\\\\n\\end{tabular}';
  assert.ok(run(n, X.sortRows(n, at(n), 0, 2, 1, {})).includes('y & 9 \\\\\nx & 10 \\\\[2pt]\nz & 100'));
  assert.ok(X.sortRows(MR, at(MR), 0, 2, 0, {}).error);
});

ok('table to text and text to table', () => {
  const T = at(BOOK);
  const t = run(BOOK, X.tableToText(BOOK, T, ', '));
  assert.equal(t, 'Words.\n\nA, B\n\n1, 2\n\n3, 4\n\nAfter.');
  assert.deepEqual(X.splitRows('a, b\nc, d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(X.splitRows('a\tb\n\nc\td'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(X.splitRows('a & b \\\\ c & d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(X.splitRows('a; b, c\nd; e, f'), [['a', 'b, c'], ['d', 'e, f']]);
  assert.deepEqual(X.splitRows('Price \\& tax, 3\nx, y', 'auto'), [['Price \\& tax', '3'], ['x', 'y']]);
});

ok('a new table: booktabs, a header rule, fit to window as tabularx, fixed as p{}', () => {
  assert.equal(X.newTableText(2, 2), '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\toprule\n &  \\\\\n\\midrule\n &  \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{}\n\\end{table}');
  assert.ok(X.newTableText(1, 3, { fit: 'window' }).includes('\\begin{tabularx}{\\linewidth}{XXX}'));
  assert.ok(X.newTableText(2, 2, { fit: 'fixed', width: '3cm' }).includes('{p{3cm}p{3cm}}'));
  assert.ok(!X.newTableText(1, 2).includes('midrule'));
  const t = X.newTableText(3, 4);
  assert.equal(at(t).ncols, 4);
  assert.equal(at(t).rows.length, 3);
});

ok('looks: each one and back to booktabs gives booktabs\' bytes', () => {
  const T = at(BOOK);
  for (const look of Object.keys(X.LOOKS)) {
    const out = run(BOOK, X.applyLook(BOOK, T, look));
    const U = at(out);
    assert.equal(X.lookOf(out, U), { plain: 'plain', grid: 'grid', booktabs: 'booktabs', rows: 'rows', frame: 'other' }[look], look + ': ' + out);
    assert.equal(run(out, X.applyLook(out, U, 'booktabs')), BOOK, look);
  }
  const g = run(BOOK, X.applyLook(BOOK, T, 'grid'));
  assert.ok(g.includes('{|l|l|}') && g.includes('A & B \\\\\n\\hline\n1 & 2 \\\\\n\\hline') && g.includes('\\hline\n\\end{tabular}'), g);
});

ok('borders: on and off, whole table and part of it', () => {
  const w = '\\begin{tabular}{ll}\na & b \\\\\nc & d \\\\\n\\end{tabular}';
  const T = at(w), all = { r0: 0, r1: 1, c0: 0, c1: 1 };
  const on = run(w, X.setBorders(w, T, all, { top: true, bottom: true, left: true, right: true, insideH: true, insideV: true }));
  assert.equal(X.lookOf(on, at(on)), 'grid', on);
  const U = at(on);
  assert.deepEqual(X.bordersOf(on, U, all), { top: true, bottom: true, left: true, right: true, insideH: true, insideV: true });
  assert.equal(run(on, X.setBorders(on, U, all, { top: false, bottom: false, left: false, right: false, insideH: false, insideV: false })), w);
  // the bottom of one cell: \cline
  const one = run(w, X.setBorders(w, T, { r0: 0, r1: 0, c0: 1, c1: 1 }, { bottom: true }));
  assert.ok(one.includes('a & b \\\\ \\cline{2-2}'), one);
  assert.equal(run(one, X.setBorders(one, at(one), { r0: 0, r1: 0, c0: 1, c1: 1 }, { bottom: false })), w);
});

ok('shading: \\cellcolor, \\rowcolor for whole rows, off again', () => {
  const w = '\\begin{tabular}{ll}\na & b \\\\\nc & d \\\\\n\\end{tabular}';
  const T = at(w);
  const c = run(w, X.shade(w, T, { r0: 0, r1: 0, c0: 1, c1: 1 }, { model: null, value: 'yellow' }));
  assert.ok(c.includes('a & \\cellcolor{yellow} b'), c);
  assert.equal(run(c, X.shade(c, at(c), { r0: 0, r1: 0, c0: 1, c1: 1 }, null)), w);
  const r = run(w, X.shade(w, T, { r0: 1, r1: 1, c0: 0, c1: 1 }, { model: 'HTML', value: 'C00000' }));
  assert.ok(r.includes('\\rowcolor[HTML]{C00000} c & d'), r);
  assert.equal(X.shadeOf(r, at(r), 1, at(r).rows[1].cells[1]).value, 'C00000');
  assert.equal(run(r, X.shade(r, at(r), { r0: 1, r1: 1, c0: 0, c1: 1 }, null)), w);
  assert.deepEqual(X.shade(w, T, { r0: 0, r1: 0, c0: 0, c1: 0 }, { value: 'red' }).packages, ['xcolor-table']);
});

ok('style options: header and total rows, first and last column, banded columns', () => {
  const w = '\\begin{tabular}{ll}\na & b \\\\\nc & d \\\\\ne & f \\\\\n\\end{tabular}';
  const T = at(w);
  assert.equal(X.headerOn(w, T, false), false);
  const h = run(w, X.setHeader(w, T, false, true));
  assert.ok(h.includes('\\textbf{a} & \\textbf{b} \\\\ \\hline\nc'), h);
  assert.equal(X.headerOn(h, at(h), false), true);
  assert.equal(run(h, X.setHeader(h, at(h), false, false)), w);
  const t = run(w, X.setHeader(w, T, true, true));
  assert.ok(t.includes('c & d \\\\ \\hline\n\\textbf{e} & \\textbf{f}'), t);
  assert.equal(run(t, X.setHeader(t, at(t), true, false)), w);
  // booktabs: the header's rule is \midrule
  const b = '\\begin{tabular}{ll}\n\\toprule\na & b \\\\\nc & d \\\\\n\\bottomrule\n\\end{tabular}';
  assert.ok(run(b, X.setHeader(b, at(b), false, true)).includes('\\textbf{a} & \\textbf{b} \\\\\n\\midrule\nc'));
  const f = run(w, X.setColBold(w, T, 0, true));
  assert.ok(f.startsWith('\\begin{tabular}{>{\\bfseries}ll}'), f);
  assert.equal(X.colBold(f, at(f), 0), true);
  assert.equal(run(f, X.setColBold(f, at(f), 0, false)), w);
  const bc = run(w, X.setBandedCols(w, T, true));
  assert.ok(bc.startsWith('\\begin{tabular}{l>{\\columncolor{gray!10}}l}'), bc);
  assert.equal(run(bc, X.setBandedCols(bc, at(bc), false)), w);
});

ok('settings before the table: in its float, or a group made for them and taken off again', () => {
  const T = at(BOOK);
  const a = run(BOOK, X.setSetting(BOOK, T, 'rowcolors', '{2}{gray!10}{}'));
  assert.ok(a.includes('\\centering\n\\rowcolors{2}{gray!10}{}\n\\begin{tabular}'), a);
  assert.equal(X.settingsOf(a, at(a)).rowcolors.value, '{2}{gray!10}{}');
  assert.equal(run(a, X.setSetting(a, at(a), 'rowcolors', null)), BOOK);
  const b = run(GRID, X.setSetting(GRID, at(GRID), 'arraystretch', '1.5'));
  assert.ok(b.includes('A\n{\\renewcommand{\\arraystretch}{1.5}\n\\begin{tabular}') && b.includes('\\end{tabular}}\nZ'), b);
  assert.equal(X.settingsOf(b, at(b)).arraystretch.value, '1.5');
  const c = run(b, X.setSetting(b, at(b), 'tabcolsep', '8pt'));
  assert.equal(X.settingsOf(c, at(c)).tabcolsep.value, '8pt');
  const d = run(c, X.setSetting(c, at(c), 'tabcolsep', null));
  assert.equal(d, b);
  assert.equal(run(d, X.setSetting(d, at(d), 'arraystretch', null)), GRID);
});

ok('AutoFit: contents, window (tabularx), fixed (p{}); and back', () => {
  const w = '\\begin{tabular}{lcr}\na & b & c \\\\\n\\end{tabular}';
  const T = at(w);
  const win = run(w, X.autofit(w, T, 'window'));
  assert.equal(win, '\\begin{tabularx}{\\linewidth}{X>{\\centering\\arraybackslash}X>{\\raggedleft\\arraybackslash}X}\na & b & c \\\\\n\\end{tabularx}');
  assert.equal(X.fitOf(win, at(win)), 'window');
  assert.equal(run(win, X.autofit(win, at(win), 'contents')), w);
  const fx = run(w, X.autofit(w, T, 'fixed', ['2cm', '3cm', '4cm']));
  assert.ok(fx.startsWith('\\begin{tabular}{p{2cm}>{\\centering\\arraybackslash}p{3cm}>{\\raggedleft\\arraybackslash}p{4cm}}'), fx);
  assert.equal(X.fitOf(fx, at(fx)), 'fixed');
  assert.equal(run(fx, X.autofit(fx, at(fx), 'contents')), w);
  const dist = run(fx, X.distributeCols(fx, at(fx), ['3cm', '3cm', '3cm']));
  assert.ok(dist.includes('p{3cm}>{\\centering\\arraybackslash}p{3cm}>{\\raggedleft\\arraybackslash}p{3cm}'), dist);
  const rows = '\\begin{tabular}{l}\na \\\\[4pt]\nb \\\\*[2pt]\nc \\\\\n\\end{tabular}';
  assert.equal(run(rows, X.distributeRows(rows, at(rows))), '\\begin{tabular}{l}\na \\\\\nb \\\\*\nc \\\\\n\\end{tabular}');
});

ok('text direction: \\rotatebox{90}, {270}, off', () => {
  const w = '\\begin{tabular}{ll}\nName & b \\\\\n\\end{tabular}';
  const c = at(w).rows[0].cells[0];
  const t = run(w, X.turnCells(w, [c], 90));
  assert.ok(t.includes('\\rotatebox{90}{Name} & b'));
  const c2 = at(t).rows[0].cells[0];
  assert.equal(X.turnOf(t, c2), 90);
  const t2 = run(t, X.turnCells(t, [c2], 270));
  assert.equal(X.turnOf(t2, at(t2).rows[0].cells[0]), 270);
  assert.equal(run(t2, X.turnCells(t2, [at(t2).rows[0].cells[0]], 0)), w);
});

ok('repeat header rows: a longtable with \\endhead, its caption out of the float, and back', () => {
  const src = BOOK.replace('\\caption{}', '\\caption{Results}');
  const T = at(src);
  const r = X.repeatHeader(src, T, 0, true);
  const out = run(src, r);
  assert.equal(out, 'Words.\n\n\\begin{longtable}{ll}\n\\toprule\nA & B \\\\\n\\midrule\n\\endhead\n1 & 2 \\\\\n3 & 4 \\\\\n\\bottomrule\n\\caption{Results}\n\\end{longtable}\n\nAfter.');
  const L = at(out);
  assert.equal(X.repeats(L), true);
  assert.equal(L.headEnd, 1);
  assert.equal(run(out, X.repeatHeader(out, L, 0, false)), src.replace('[h]', '[h]'));
  // a float with more in it is refused
  assert.ok(X.repeatHeader(src.replace('\\centering', '\\centering\nSome words.'), at(src.replace('\\centering', '\\centering\nSome words.')), 0, true).error);
});

ok('caption: found, added in the float, or a float made around the table', () => {
  const T = at(BOOK);
  assert.equal(BOOK.slice(X.captionEdits(BOOK, T).p - 9, X.captionEdits(BOOK, T).p), '\\caption{');
  const nocap = BOOK.replace('\n\\caption{}', '');
  const a = X.captionEdits(nocap, at(nocap));
  assert.equal(run(nocap, a), BOOK);
  const g = X.captionEdits(GRID, at(GRID));
  const go = run(GRID, g);
  assert.ok(go.startsWith('A\n\\begin{table}[h]\n\\centering\n\\begin{tabular}') && go.endsWith('\\end{tabular}\n\\caption{}\n\\end{table}\nZ'), go);
  assert.equal(go.slice(g.p - 9, g.p + 1), '\\caption{}');
});

ok('delete cells: shift left, shift up', () => {
  const w = '\\begin{tabular}{lll}\na & b & c \\\\\nd & e & f \\\\\n\\end{tabular}';
  const T = at(w);
  assert.ok(run(w, X.deleteCells(w, T, { r0: 0, r1: 0, c0: 0, c1: 0 }, 'left')).includes('b & c &  \\\\\nd & e'));
  assert.ok(run(w, X.deleteCells(w, T, { r0: 0, r1: 0, c0: 1, c1: 1 }, 'up')).includes('a & e & c \\\\\nd &  & f'));
});

ok('the float: its caption, label, whether it holds the table alone', () => {
  const F = X.floatOf(BOOK, at(BOOK));
  assert.ok(F && F.only && F.caption && !F.caption.above && F.centering);
  assert.equal(X.floatOf(GRID, at(GRID)), null);
});

ok('a stranger\'s table of a hundred thousand cells, and of unbalanced text, in bounded time', () => {
  const big = '\\begin{tabular}{' + 'l'.repeat(10) + '}\n' + Array(10000).fill(Array(10).fill('x').join(' & ') + ' \\\\').join('\n') + '\n\\end{tabular}';
  let t0 = Date.now();
  const T = at(big);
  assert.equal(T.rows.length, 10000);
  X.insertRow(big, T, 5000, true); X.insertCol(big, T, 5, true); X.lookOf(big, T);
  assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + ' ms');
  const bad = '\\begin{tabular}{' + '{'.repeat(50000) + '}\n' + '&'.repeat(100000);
  t0 = Date.now();
  assert.equal(at(bad), null);
  X.tablesIn('\\begin{tabular}'.repeat(5000));
  assert.ok(Date.now() - t0 < 2000, 'took ' + (Date.now() - t0) + ' ms');
});

ok('the security audit\'s cases: nested and unclosed tabulars, a star of millions of columns, runs of spaces, all in bounded time', () => {
  // a thousand nested tabulars round the caret, and two thousand never closed
  let src = '\\begin{tabular}{l}\n'.repeat(1000) + 'x '.repeat(200000) + '\\end{tabular}\n'.repeat(1000);
  let t0 = Date.now();
  const T = X.tableAt(src, src.indexOf('x '));
  assert.ok(T && T.s === 999 * 19, 'the innermost');
  assert.ok(Date.now() - t0 < 1500, 'nested: ' + (Date.now() - t0) + ' ms');
  src = '\\begin{tabular}{l}\n'.repeat(2000) + 'x '.repeat(100000);
  t0 = Date.now();
  assert.equal(X.tableAt(src, src.length - 10), null);
  assert.ok(Date.now() - t0 < 1500, 'unclosed: ' + (Date.now() - t0) + ' ms');
  // one line of a million characters holding a thousand \begin
  src = 'a'.repeat(1000000) + ' \\begin{tabular}{l} x \\end{tabular}'.repeat(1000);
  t0 = Date.now();
  X.tablesIn(src); X.tableAt(src, src.length - 20);
  assert.ok(Date.now() - t0 < 1500, 'a long line: ' + (Date.now() - t0) + ' ms');
  // columns: *{3000000}{c} and stars in stars are no table here, and the page stops at 1000 columns
  for (const spec of ['*{3000000}{c}', '*{100}{*{100}{*{100}{c}}}']) assert.equal(at('\\begin{tabular}{' + spec + '}\na\n\\end{tabular}'), null, spec);
  t0 = Date.now();
  const M = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\n\\begin{document}\n\\begin{tabular}{*{30000000}{c}}\na\n\\end{tabular}\n\\begin{tabular}{*{100}{*{100}{*{100}{c}}}}\nb\n\\end{tabular}\n\\end{document}\n']]), main: 'main.tex' });
  const tabs = M.blocks.flatMap((B) => B.items).flatMap((it) => it.parts || []).filter((p) => p.type === 'tabular');
  assert.ok(tabs.length === 2 && tabs.every((t) => t.cols.length === 1000), tabs.map((t) => t.cols.length));
  assert.ok(Date.now() - t0 < 1500, 'the model: ' + (Date.now() - t0) + ' ms');
  // text to table on a paragraph of spaces between its separators
  t0 = Date.now();
  X.splitRows('a' + ' '.repeat(200000) + 'b\\\\ c' + ' '.repeat(100000) + ',' + ' '.repeat(100000) + 'd', 'auto');
  X.splitRows(' '.repeat(100000) + '&' + ' '.repeat(100000));
  assert.ok(Date.now() - t0 < 1500, 'text to table: ' + (Date.now() - t0) + ' ms');
  // a cell of \rotatebox and a hundred thousand spaces
  const r = '\\begin{tabular}{l}\n\\rotatebox' + ' '.repeat(100000) + 'x \\\\\n\\end{tabular}';
  t0 = Date.now();
  const R = at(r);
  X.turnOf(r, R.rows[0].cells[0]); X.turnCells(r, [R.rows[0].cells[0]], 90);
  assert.ok(Date.now() - t0 < 1500, 'a turned cell: ' + (Date.now() - t0) + ' ms');
});

// The hostile review's cases (/tmp/B7-REVIEW.md), one check or more for each finding
const rev = (name, f) => ok('review ' + name, f);
rev('H1: Rikuy\'s own booktabs table is no grid: a row goes above \\bottomrule, rules stay single', () => {
  const src = X.newTableText(2, 2, {}).replace(' &  \\\\', 'h1 & h2 \\\\').replace(' &  \\\\', 'v1 & v2 \\\\');
  const T = at(src);
  assert.equal(X.gridRules(src, T), null);
  assert.equal(X.lookOf(src, T), 'booktabs');
  assert.ok(X.headerOn(src, T, false), 'Header Row pressed');
  const below = run(src, X.insertRow(src, T, 1, true));
  assert.ok(/v1 & v2 \\\\\n &  \\\\\n\\bottomrule\n\\end\{tabular\}/.test(below), below);
  const above = run(src, X.insertRow(src, T, 1, false));
  assert.equal((above.match(/\\midrule/g) || []).length, 1, above);
  assert.ok(/\\midrule\n &  \\\\\nv1 & v2/.test(above), above);
  // deleting the last row of a two row booktabs table keeps \bottomrule (probe11)
  const del = run(src, X.deleteRows(src, T, 1, 1));
  assert.ok(/\\toprule\nh1 & h2 \\\\\n\\bottomrule\n\\end\{tabular\}/.test(del), del);
  // a \cline{2-3} and \hline table: rows not all ruled the same, no grid
  const cl = '\\begin{tabular}{lll}\n\\hline\na & b & c \\\\ \\cline{2-3}\nd & e & f \\\\\n\\hline\n\\end{tabular}';
  const C = at(cl);
  assert.equal(X.gridRules(cl, C), null);
  assert.ok(/d & e & f \\\\\n &  &  \\\\\n\\hline/.test(run(cl, X.insertRow(cl, C, 1, true))));
  // a real grid still brings its rule; one double rule under the header is allowed
  assert.equal(X.gridRules(GRID, at(GRID)), ' \\hline');
  const dbl = '\\begin{tabular}{|l|l|}\n\\hline\nA & B \\\\ \\hline\\hline\n1 & 2 \\\\ \\hline\n3 & 4 \\\\ \\hline\n\\end{tabular}';
  assert.equal(X.gridRules(dbl, at(dbl)), ' \\hline');
});
rev('H2: Insert above copies no comment, a review comment or a commented row', () => {
  const src = '\\begin{tabular}{ll}\na & b \\\\\n% comment (Ana) on "gamma": check this\ngamma & delta \\\\\n\\end{tabular}';
  const out = run(src, X.insertRow(src, at(src), 1, false));
  assert.equal((out.match(/comment \(Ana\)/g) || []).length, 1, out);
  const s2 = '\\begin{tabular}{ll}\n% x & y \\\\\na & b \\\\\nc & d \\\\\n\\end{tabular}';
  const o2 = run(s2, X.insertRow(s2, at(s2), 0, false));
  assert.equal((o2.match(/% x & y/g) || []).length, 1, o2);
  // below a last row without \\, and indented rows keep their indent
  const s3 = '\\begin{tabular}{ll}\n  a & b \\\\ % one\n  c & d % two\n\\end{tabular}';
  const o3 = run(s3, X.insertRow(s3, at(s3), 1, true));
  assert.equal((o3.match(/% two/g) || []).length, 1, o3);
  assert.equal((o3.match(/% one/g) || []).length, 1, o3);
  const o4 = run(s3, X.insertRow(s3, at(s3), 1, false));
  assert.ok(o4.includes('% one\n  &  \\\\\n  c & d'), o4);
  assert.equal(run(o4, X.deleteRows(o4, at(o4), 1, 1)), s3);
});
rev('L1, L6: deleting the header of a booktabs table, a row with a comment', () => {
  const del = run(BOOK, X.deleteRows(BOOK, at(BOOK), 0, 0));
  assert.ok(!/\\toprule\s*\\midrule/.test(del), del);
  assert.ok(/\\toprule\n1 & 2/.test(del), del);
  const c = '\\begin{tabular}{ll}\na & b \\\\ % first\nc & d \\\\ % second\n\\end{tabular}';
  const d0 = run(c, X.deleteRows(c, at(c), 0, 0));
  assert.equal(d0, '\\begin{tabular}{ll}\nc & d \\\\ % second\n\\end{tabular}');
  const d1 = run(c, X.deleteRows(c, at(c), 1, 1));
  assert.equal(d1, '\\begin{tabular}{ll}\na & b \\\\ % first\n\\end{tabular}');
});
rev('H12: column operations on *{n}{…} keep its bars and @{}', () => {
  const src = '\\begin{tabular}{|*{3}{c|}}\n\\hline\na & b & c \\\\\n\\hline\n\\end{tabular}';
  const T = at(src);
  const spec = (r) => { const t = run(src, r); return t.slice(t.indexOf('}{') + 2, t.indexOf('}\n')); };
  assert.deepEqual(X.barsOf(src, T).places, [true, true, true, true]);
  assert.equal(spec(X.insertCol(src, T, 2, true)), '|c|c|c|c|');
  assert.equal(spec(X.insertCol(src, T, 0, false)), '|c|c|c|c|');
  assert.equal(spec(X.deleteCols(src, T, 1, 1)), '|c|c|');
  assert.equal(spec(X.alignCols(src, T, 1, 1, 'r', 't')), '|c|r|c|');
  assert.equal(spec(X.setColBold(src, T, 0, true)), '|>{\\bfseries}c|c|c|');
  assert.equal(spec(X.setBandedCols(src, T, true)), '|c|>{\\columncolor{gray!10}}c|c|');
  assert.equal(spec({ edits: X.setBars(src, T, [true, false, false, true]) }), '|ccc|');
  assert.equal(spec(X.applyLook(src, T, 'booktabs')), 'ccc');
  assert.equal(X.lookOf(src, T), 'grid');
  // a star the change does not touch stays a star; @{} and a command at the end of a star body
  const s2 = '\\begin{tabular}{@{}*{2}{l@{\\quad}}r@{}}\na & b & c \\\\\n\\end{tabular}';
  const o2 = run(s2, X.insertCol(s2, at(s2), 2, true));
  assert.ok(o2.startsWith('\\begin{tabular}{@{}*{2}{l@{\\quad}}r@{\\quad}r@{}}'), o2);
  const s3 = '\\begin{tabular}{*{2}{c}|*{2}{c\\vline}l}\na & b & c & d & e \\\\\n\\end{tabular}';
  const o3 = run(s3, X.alignCols(s3, at(s3), 0, 0, 'r', 't'));
  assert.ok(o3.startsWith('\\begin{tabular}{rc|*{2}{c\\vline}l}'), o3);
  const o4 = run(s3, X.alignCols(s3, at(s3), 4, 4, 'r', 't'));
  assert.ok(o4.startsWith('\\begin{tabular}{*{2}{c}|*{2}{c\\vline}r}'), o4);
  const o5 = run(s3, X.alignCols(s3, at(s3), 3, 3, 'r', 't'));
  assert.ok(o5.startsWith('\\begin{tabular}{*{2}{c}|c\\vline r\\vline l}'), o5);
  // a width in a star: this column only
  const s5 = '\\begin{tabular}{*{2}{p{1cm}|}}\na & b \\\\\n\\end{tabular}';
  assert.ok(run(s5, X.setColWidth(s5, at(s5), 1, '2cm')).startsWith('\\begin{tabular}{p{1cm}|p{2cm}|}'));
});

rev('H3: a merged cell\'s \\cellcolor goes in its \\multicolumn, never before it', () => {
  const s1 = '\\begin{tabular}{lll}\n\\toprule\n\\multicolumn{2}{c}{Head} & x \\\\\n\\midrule\na & b & c \\\\\n\\bottomrule\n\\end{tabular}';
  const T1 = at(s1);
  const o1 = run(s1, X.shade(s1, T1, { r0: 0, r1: 0, c0: 0, c1: 1 }, { value: 'yellow' }));
  assert.ok(o1.includes('\\multicolumn{2}{c}{\\cellcolor{yellow} Head} & x'), o1);
  // read back: the colour is the cell's, changed and taken off in place; its words without it
  const U = at(o1), mc = U.rows[0].cells[0];
  assert.deepEqual(X.shadeOf(o1, U, 0, mc), { model: null, value: 'yellow', row: false });
  assert.equal(X.cellText(o1, mc), 'Head');
  assert.ok(run(o1, X.shade(o1, U, { r0: 0, r1: 0, c0: 0, c1: 1 }, { value: 'red' })).includes('{\\cellcolor{red} Head}'));
  assert.equal(run(o1, X.shade(o1, U, { r0: 0, r1: 0, c0: 0, c1: 1 }, null)), s1);
  // merging cells the first of which is shaded; aligning one shaded cell, and back
  const s2 = '\\begin{tabular}{lll}\n\\toprule\n\\cellcolor{red} a & b & c \\\\\n\\midrule\nd & e & f \\\\\n\\bottomrule\n\\end{tabular}';
  const T2 = at(s2);
  const m = run(s2, X.mergeCells(s2, T2, { r0: 0, r1: 0, c0: 0, c1: 1 }));
  assert.ok(m.includes('\\multicolumn{2}{c}{\\cellcolor{red} a b} & c'), m);
  const a = run(s2, X.alignCells(s2, T2, [T2.rows[0].cells[0]], 'c'));
  assert.ok(a.includes('\\multicolumn{1}{c}{\\cellcolor{red} a} & b'), a);
  const A = at(a);
  assert.equal(run(a, X.alignCells(a, A, [A.rows[0].cells[0]], 'l')), s2);
  // merged down and across with colours in both rows' first cells
  const s3 = '\\begin{tabular}{lll}\n\\cellcolor{red} a & b & c \\\\\n\\cellcolor{blue} d & e & f \\\\\n\\end{tabular}';
  const m3 = run(s3, X.mergeCells(s3, at(s3), { r0: 0, r1: 1, c0: 0, c1: 1 }));
  assert.ok(m3.includes('\\multicolumn{2}{c}{\\cellcolor{red} \\multirow{2}{*}{a b d e}} & c') && m3.includes('\\multicolumn{2}{c}{\\cellcolor{blue}} & f'), m3);
});
rev('H4, L4: one cell aligned in a p{}, m{} or >{\\bfseries} column, and number columns', () => {
  const s1 = '\\begin{tabular}{p{2cm}l}\na & b \\\\\n\\end{tabular}';
  const r1 = X.alignCells(s1, at(s1), [at(s1).rows[0].cells[0]], 'c');
  assert.ok(run(s1, r1).includes('\\multicolumn{1}{>{\\centering\\arraybackslash}p{2cm}}{a}'));
  assert.deepEqual(r1.packages, ['array']);
  const s2 = '\\begin{tabular}{>{\\bfseries}ll}\na & b \\\\\n\\end{tabular}';
  const r2 = run(s2, X.alignCells(s2, at(s2), [at(s2).rows[0].cells[0]], 'r'));
  assert.ok(r2.includes('\\multicolumn{1}{>{\\bfseries}r}{a}'), r2);
  // siunitx's S: one cell (a header) a plain c, the whole column refused; w{}{} its argument
  const s3 = '\\begin{tabular}{lS}\na & 1.5 \\\\\n\\end{tabular}';
  assert.ok(run(s3, X.alignCells(s3, at(s3), [at(s3).rows[0].cells[1]], 'c')).includes('\\multicolumn{1}{c}{1.5}'));
  assert.ok(X.alignCols(s3, at(s3), 1, 1, 'r', null).error);
  const s4 = '\\begin{tabular}{w{l}{2cm}l}\na & b \\\\\n\\end{tabular}';
  assert.equal(X.colH(s4, at(s4).spec.cols[0]), 'l');
  const o4 = run(s4, X.alignCols(s4, at(s4), 0, 0, 'c', null));
  assert.ok(o4.startsWith('\\begin{tabular}{w{c}{2cm}l}'), o4);
  assert.equal(X.colH(o4, at(o4).spec.cols[0]), 'c');
});
rev('H5: AutoFit Window and Distribute Columns on tabular* and tabulary make a tabularx as wide', () => {
  const s1 = '\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}lr}\na & b \\\\\n\\end{tabular*}';
  for (const r of [X.autofit(s1, at(s1), 'window'), X.distributeCols(s1, at(s1), ['3cm', '3cm'])]) {
    const o = run(s1, r);
    assert.ok(o.startsWith('\\begin{tabularx}{\\textwidth}{X>{\\raggedleft\\arraybackslash}X}') && o.endsWith('\\end{tabularx}'), o);
    assert.ok(r.packages.includes('tabularx'));
  }
  const s2 = '\\begin{tabulary}{\\linewidth}{LC}\na & b \\\\\n\\end{tabulary}';
  const o2 = run(s2, X.autofit(s2, at(s2), 'window'));
  assert.ok(o2.startsWith('\\begin{tabularx}{\\linewidth}{X>{\\centering\\arraybackslash}X}') && o2.endsWith('\\end{tabularx}'), o2);
  // contents from tabular*: a tabular, \extracolsep gone
  assert.ok(run(s1, X.autofit(s1, at(s1), 'contents')).startsWith('\\begin{tabular}{lr}'));
});
rev('H6, H7: Repeat Header Rows on and off carry the float, its settings, label and placement', () => {
  const flt = 'Before.\n\n\\begin{table}[!htbp]\n\\centering\n\\small\n\\rowcolors{2}{gray!10}{}\n\\renewcommand{\\arraystretch}{1.3}\n\\begin{tabular}{ll}\n\\toprule\nA & B \\\\\n\\midrule\na & b \\\\\nc & d \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Results}\n\\label{tab:r}\n\\end{table}\n\nAfter.';
  const on = run(flt, X.repeatHeader(flt, at(flt), 0, true));
  assert.ok(on.includes('{\\small\n\\rowcolors{2}{gray!10}{}\n\\renewcommand{\\arraystretch}{1.3}\n\\begin{longtable}{ll} % rikuy: \\begin{table}[!htbp]\n'), on);
  assert.ok(on.includes('\\midrule\n\\endhead\n') && on.includes('\\caption{Results}\n\\label{tab:r}\n\\end{longtable}}'), on);
  const L = at(on);
  assert.ok(X.repeats(L));
  assert.equal(X.settingsOf(on, L).rowcolors.value, '{2}{gray!10}{}');
  assert.equal(run(on, X.repeatHeader(on, L, 0, false)), flt);
  // with a cell changed since (no memo): the float as it was, the cell as it is
  const ed = on.replace('c & d', 'c & e');
  assert.equal(run(ed, X.repeatHeader(ed, at(ed), 0, false)), flt.replace('c & d', 'c & e'));
  // Rikuy's own table, and a label alone, a left aligned float, a table alone
  const own = X.newTableText(3, 2, {}).replace('\\caption{}', '\\caption{Mine}');
  const o2 = run(own, X.repeatHeader(own, at(own), 0, true));
  assert.ok(!o2.includes('rikuy:'), o2);
  const o2b = o2.replace('\\endhead\n &', '\\endhead\nx &');
  assert.equal(run(o2b, X.repeatHeader(o2b, at(o2b), 0, false)), own.replace('\\midrule\n &', '\\midrule\nx &'));
  const lab = '\\begin{table}[h]\n\\begin{tabular}{ll}\nA & B \\\\\na & b \\\\\n\\end{tabular}\n\\label{tab:x}\n\\end{table}';
  const o3 = run(lab, X.repeatHeader(lab, at(lab), 0, true));
  assert.ok(o3.startsWith('\\begin{longtable}[l]{ll}') && o3.endsWith('\\end{longtable}\n\\label{tab:x}'), o3);
  const o3b = o3.replace('a & b', 'a & c');
  assert.equal(run(o3b, X.repeatHeader(o3b, at(o3b), 0, false)), lab.replace('a & b', 'a & c'));
  const alone = 'x\n\\begin{tabular}{ll}\nA & B \\\\\na & b \\\\\n\\end{tabular}\ny';
  const o4 = run(alone, X.repeatHeader(alone, at(alone), 0, true)).replace('a & b', 'a & c');
  assert.equal(run(o4, X.repeatHeader(o4, at(o4), 0, false)), alone.replace('a & b', 'a & c'));
  // two columns: refused
  assert.ok(X.repeatHeader(flt, at(flt), 0, true, { twocolumn: true }).error);
  // pandoc's longtable (Word import): head once at the top, the last foot at the end
  const pd = '\\begin{longtable}[]{@{}ll@{}}\n\\toprule\\noalign{}\nHead A & Head B \\\\\n\\midrule\\noalign{}\n\\endhead\n\\bottomrule\\noalign{}\n\\endlastfoot\none & two \\\\\nthree & four \\\\\n\\end{longtable}';
  const off = run(pd, X.repeatHeader(pd, at(pd), 0, false));
  assert.equal(off, '\\begin{table}[h]\n\\centering\n\\begin{tabular}{@{}ll@{}}\n\\toprule\\noalign{}\nHead A & Head B \\\\\n\\midrule\\noalign{}\none & two \\\\\nthree & four \\\\\n\\bottomrule\\noalign{}\n\\end{tabular}\n\\end{table}');
  const lt = '\\begin{longtable}{ll}\n\\caption{Long one}\\label{tab:l}\\\\\n\\toprule\nA & B \\\\\n\\midrule\n\\endfirsthead\n\\toprule\nA & B \\\\\n\\midrule\n\\endhead\n\\midrule\n\\multicolumn{2}{r}{continued} \\\\\n\\endfoot\n\\bottomrule\n\\endlastfoot\na & b \\\\\n\\end{longtable}';
  const off2 = run(lt, X.repeatHeader(lt, at(lt), 0, false));
  assert.equal(off2, '\\begin{table}[h]\n\\centering\n\\caption{Long one}\\label{tab:l}\n\\begin{tabular}{ll}\n\\toprule\nA & B \\\\\n\\midrule\na & b \\\\\n\\bottomrule\n\\end{tabular}\n\\end{table}');
});
rev('H8: a caption for a table in a minipage or subtable goes in it, never a float in it', () => {
  const mp = '\\begin{table}[h]\n\\begin{minipage}{0.5\\linewidth}\n\\centering\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{minipage}\n\\end{table}';
  const r1 = X.captionEdits(mp, at(mp));
  assert.equal(run(mp, r1), mp.replace('\\end{tabular}\n', '\\end{tabular}\n\\caption{}\n'));
  assert.deepEqual(r1.packages, []);
  const sub = mp.replace(/minipage\}\{0\.5\\linewidth\}/, 'subtable}{0.5\\linewidth}').replace('\\end{minipage}', '\\end{subtable}');
  assert.ok(!run(sub, X.captionEdits(sub, at(sub))).includes('\\begin{table}[h]\n\\centering'));
  const free = 'x\n\\begin{minipage}{5cm}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\end{minipage}';
  const r3 = X.captionEdits(free, at(free));
  assert.ok(run(free, r3).includes('\\end{tabular}\n\\captionof{table}{}\n\\end{minipage}'));
  assert.deepEqual(r3.packages, ['caption']);
});
rev('H10, M6: settings of a table in \\resizebox{…}{!}{…} stay in it, the braces too', () => {
  const s1 = 'T\n\\resizebox{\\linewidth}{!}{\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}}';
  const on = run(s1, X.setSetting(s1, at(s1), 'rowcolors', '{2}{gray!10}{}'));
  assert.ok(on.includes('\\resizebox{\\linewidth}{!}{\\rowcolors{2}{gray!10}{}\n\\begin{tabular}'), on);
  assert.ok(X.settingsOf(on, at(on)).rowcolors, 'read again: Banded Rows pressed');
  assert.equal(run(on, X.setSetting(on, at(on), 'rowcolors', null)), s1);
  const s2 = '\\resizebox{\\linewidth}{!}{\n\\rowcolors{2}{gray!10}{}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}}';
  assert.equal(run(s2, X.setSetting(s2, at(s2), 'rowcolors', null)), '\\resizebox{\\linewidth}{!}{\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}}');
  const s3 = '\\resizebox{\\linewidth}{!}{\\setlength{\\tabcolsep}{2pt}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}}';
  assert.equal(run(s3, X.setSetting(s3, at(s3), 'tabcolsep', null)), '\\resizebox{\\linewidth}{!}{\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}}');
  // a group of its own still goes with its last setting; one holding \small stays
  const g = 'x\n{\\setlength{\\tabcolsep}{2pt}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}}\ny';
  assert.equal(run(g, X.setSetting(g, at(g), 'tabcolsep', null)), 'x\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\ny');
  const g2 = 'x\n{\\small\n\\setlength{\\tabcolsep}{2pt}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}}\ny';
  assert.equal(run(g2, X.setSetting(g2, at(g2), 'tabcolsep', null)), 'x\n{\\small\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}}\ny');
});
rev('H11: Convert Text to Table cuts outside braces and math, keeps comments after the row', () => {
  const rows = X.splitRows('\\textbf{x, y}, b\n$f(x,y)$, c % note\nd\\, e, f');
  assert.deepEqual(rows.map((r) => [...r]), [['\\textbf{x, y}', 'b'], ['$f(x,y)$', 'c'], ['d\\, e', 'f']]);
  assert.equal(rows[1].comment, '% note');
  assert.deepEqual(X.splitRows('a & b \\\\ c & \\{d\\} \\\\[2pt] e & f').map((r) => [...r]), [['a', 'b'], ['c', '\\{d\\}'], ['e', 'f']]);
  assert.deepEqual(X.splitRows('x, \\(a,b\\), \\[c,d\\], {p,q}').map((r) => [...r]), [['x', '\\(a,b\\)', '\\[c,d\\]', '{p,q}']]);
  const t = X.newTableText(3, 2, { cells: rows, float: false });
  assert.ok(t.includes('$f(x,y)$ & c \\\\ % note\n'), t);
});
rev('M5: one big CSV in many tables: read once, values cut, a budget of cells', () => {
  const big = 'a,'.repeat(20) + 'x'.repeat(1900000);
  const fl = '\\begin{table}[h]\n\\centering\n\\csvautotabular{big.csv}\n\\end{table}\n\n';
  const t0 = Date.now();
  const M = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\n\\usepackage{csvsimple}\n\\begin{document}\n' + fl.repeat(200) + '\\end{document}\n'], ['big.csv', big]]), main: 'main.tex' });
  assert.ok(Date.now() - t0 < 3000, (Date.now() - t0) + ' ms');
  const tabs = M.blocks.flatMap((B) => B.items).flatMap((it) => it.parts || []).filter((p) => p.type === 'tabular');
  assert.ok(tabs.length > 0);
  const longest = Math.max(...tabs.flatMap((t) => t.rows.flatMap((r) => r.cells.flatMap((c) => c.inl.map((x) => (x.text || '').length)))));
  assert.ok(longest <= 201, longest);
});

rev('M1: under a cell merged both ways, a row of empty cells keeps every cell (Word)', () => {
  const tex = '\\documentclass{article}\n\\usepackage{multirow}\n\\begin{document}\n\\begin{tabular}{lll}\n\\multicolumn{2}{c}{\\multirow{2}{*}{zz}} & z3 \\\\\n\\multicolumn{2}{c}{} & y3 \\\\\n & & n3 \\\\\n\\end{tabular}\n\\end{document}\n';
  const files = new Map([['main.tex', tex]]);
  const W = buildWordDoc(buildModel({ files, main: 'main.tex' }), files, { now: 0, main: 'main.tex' });
  const find = (x) => { if (!x || typeof x !== 'object') return null; if (x.t === 'Table') return x; for (const v of Object.values(x)) { const r = find(v); if (r) return r; } return null; };
  const rows = find(W.doc).c[4][0][3].map((r) => r[1].map((c) => c[2] + 'x' + c[3]));
  assert.deepEqual(rows, [['2x2', '1x1'], ['1x1'], ['1x1', '1x1', '1x1']]);
});

rev('audit: a stranger\'s *{n}{…} written out in bounded time, each look', () => {
  for (const body of ['\\' + 'a'.repeat(62) + 'c', '|'.repeat(60) + 'c', 'c\\vline']) {
    const src = '\\begin{tabular}{*{999}{' + body + '}}\na \\\\\n\\end{tabular}';
    const t0 = Date.now();
    for (let k = 0; k < 20; k++) { const U = X.parseTable(src, 0); X.barsOf(src, U); X.lookOf(src, U); X.insertCol(src, U, 0, true); }
    assert.ok(Date.now() - t0 < 1500, body.slice(0, 10) + ': ' + (Date.now() - t0) + ' ms');
  }
});

// The verifier's cases on the review fixes (R1 to R8, H7's rest)
const ver = (name, f) => ok('verify ' + name, f);
ver('R1: a longtable in a group of settings, as Repeat Header Rows writes it, is drawn as a table', () => {
  const flt = 'Intro.\n\n\\begin{table}[!htbp]\n\\centering\n\\small\n\\rowcolors{2}{gray!10}{}\n\\setlength{\\tabcolsep}{3pt}\n\\begin{tabular}{ll}\n\\toprule\nHead & Other \\\\\n\\midrule\nalpha & beta \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Results}\n\\end{table}\n\nSee.';
  const on = run(flt, X.repeatHeader(flt, at(flt), 0, true));
  const doc = (b) => '\\documentclass{article}\n\\usepackage{booktabs}\n\\usepackage{longtable}\n\\usepackage[table]{xcolor}\n\\begin{document}\n' + b + '\n\\end{document}\n';
  const label = on.replace('\\caption{Results}\n', '').replace('\\end{longtable}}', '\\end{longtable}}\n\\label{tab:x}');
  for (const b of [on, label, '{\\small\n\\begin{longtable}{ll}\nA & B \\\\\n\\endhead\na & b \\\\\n\\end{longtable}}']) {
    const M = buildModel({ files: new Map([['main.tex', doc(b)]]), main: 'main.tex' });
    const t = M.blocks.flatMap((B) => B.items).flatMap((it) => it.parts || []).filter((p) => p.type === 'tabular');
    assert.equal(t.length, 1, b);
    if (b === on) assert.ok(t[0].size === 'small' && t[0].band && t[0].tabcolsep === '3pt', JSON.stringify({ size: t[0].size, band: t[0].band, sep: t[0].tabcolsep }));
  }
  // a \small in a figure's text stays the text's
  const fig = '\\documentclass{article}\n\\begin{document}\n\\begin{figure}[h]\n\\small\nNote here.\n\\caption{F}\n\\end{figure}\n\\end{document}\n';
  const F = buildModel({ files: new Map([['main.tex', fig]]), main: 'main.tex' });
  assert.ok(JSON.stringify(F.blocks).includes('z-small'));
});
ver('R3, R4: the float\'s head on two lines, a center environment, comments, wraptable', () => {
  const cell = (t) => t.replace('a & b', 'a2 & b');
  const cycle = (src) => { const on = run(src, X.repeatHeader(src, at(src), 0, true)); const e = cell(on); return { on, off: run(e, X.repeatHeader(e, at(e), 0, false)) }; };
  const two = 'X\n\n\\begin{table}\n[htbp]\n\\centering\n\\begin{tabular}{ll}\nA & B \\\\\na & b \\\\\n\\end{tabular}\n\\caption{Cap}\n\\end{table}\n';
  let c = cycle(two);
  assert.ok(c.on.includes('\\begin{longtable}{ll} % rikuy: \\begin{table}[htbp]\nA & B'), c.on);
  assert.equal(c.off, cell(two).replace('\\begin{table}\n[htbp]', '\\begin{table}[htbp]'));
  const ctr = 'X\n\n\\begin{table}[h]\n\\begin{center}\n\\begin{tabular}{ll}\nA & B \\\\\na & b \\\\\n\\end{tabular}\n\\end{center}\n\\caption{Cap}\n\\end{table}\n';
  c = cycle(ctr);
  assert.ok(c.on.includes('\\begin{longtable}{ll}\n'), c.on);
  assert.ok(c.off.includes('\\begin{table}[h]\n\\centering\n'), c.off);
  const com = 'X\n\n\\begin{table}[h]\n\\centering % keep centred\n% comment (Ana) on "a": check this\n\\begin{tabular}{ll}\nA & B \\\\\na & b \\\\\n\\end{tabular}\n\\caption{Cap} % cap\n\\end{table}\n';
  c = cycle(com);
  for (const x of ['% keep centred', '% comment (Ana) on "a": check this', '% cap']) { assert.ok(c.on.includes(x), x + ' on'); assert.ok(c.off.includes(x), x + ' off'); }
  const wrap = 'X\n\n\\begin{wraptable}{r}{0.4\\textwidth}\n\\centering\n\\begin{tabular}{ll}\nA & B \\\\\na & b \\\\\n\\end{tabular}\n\\caption{Cap}\n\\end{wraptable}\n';
  c = cycle(wrap);
  assert.equal(c.off, cell(wrap));
});
ver('R5: cellAt on a table of 3000 rows, once a cell, in bounded time', () => {
  const big = '\\begin{tabular}{ll}\n' + Array.from({ length: 3000 }, (_, k) => 'a' + k + ' & b' + k + ' \\\\\n').join('') + '\\end{tabular}';
  const T = at(big);
  const t0 = Date.now();
  for (const row of T.rows) for (const c of row.cells) assert.equal(X.cellAt(T, c.cs).cell, c);
  assert.ok(Date.now() - t0 < 500, (Date.now() - t0) + ' ms');
  assert.equal(X.cellAt(T, 0).cell, T.rows[0].cells[0]);
});
ver('R6, R7: a caption already in the subtable or minipage is gone to; a commented \\begin opens nothing', () => {
  const a = '\\begin{table}[h]\n\\begin{subtable}{0.5\\linewidth}\n\\centering\n\\begin{tabular}{ll}\nka & kb \\\\\n\\end{tabular}\n\\caption{Sub one}\n\\end{subtable}\n\\end{table}';
  const r = X.captionEdits(a, at(a));
  assert.ok(!r.edits && a.startsWith('Sub one', r.p), JSON.stringify(r));
  const b = '\\begin{table}[h]\n\\begin{minipage}{0.5\\linewidth}\n\\caption{Above}\n\\begin{tabular}{ll}\nka & kb \\\\\n\\end{tabular}\n\\end{minipage}\n\\end{table}';
  assert.ok(b.startsWith('Above', X.captionEdits(b, at(b)).p));
  const c = 'x\n% \\begin{minipage}{5cm}\n\\begin{tabular}{l}\nfa \\\\\n\\end{tabular}';
  assert.ok(run(c, X.captionEdits(c, at(c))).includes('\\begin{table}[h]\n\\centering\n\\begin{tabular}'));
  const d = '\\begin{table}[h]\n\\centering\n% \\begin{minipage}{5cm}\n\\begin{tabular}{l}\nfa \\\\\n\\end{tabular}\n\\end{table}';
  assert.equal(run(d, X.captionEdits(d, at(d))), d.replace('\\end{tabular}\n', '\\end{tabular}\n\\caption{}\n'));
});
ver('R8: grids with a double rule in two rows, comments on rule lines; rows next to a \\cline', () => {
  const dbl2 = '\\begin{tabular}{|l|l|}\n\\hline\nH & K \\\\ \\hline\\hline\na & b \\\\ \\hline\n\\end{tabular}';
  const o1 = run(dbl2, X.insertRow(dbl2, at(dbl2), 1, true));
  assert.ok(o1.includes('a & b \\\\ \\hline\n &  \\\\ \\hline\n\\end'), o1);
  assert.equal(run(o1, X.deleteRows(o1, at(o1), 2, 2)), dbl2);
  for (const [k, com] of [['different', ['% head', '% first', '% second']], ['same', ['% ok', '% ok', '% ok']]]) {
    const g = '\\begin{tabular}{|l|l|}\n\\hline\nH & K \\\\ \\hline ' + com[0] + '\na & b \\\\ \\hline ' + com[1] + '\nc & d \\\\ \\hline ' + com[2] + '\n\\end{tabular}';
    const o = run(g, X.insertRow(g, at(g), 2, true));
    assert.ok(o.includes('c & d \\\\ \\hline ' + com[2] + '\n &  \\\\ \\hline\n\\end'), k + ': ' + o);
    assert.equal(run(o, X.deleteRows(o, at(o), 3, 3)), g);
  }
  const cl = '\\begin{tabular}{|l|l|l|}\n\\hline\nH & K & L \\\\ \\cline{2-3}\na & b & c \\\\ \\hline\nd & e & f \\\\ \\hline\n\\end{tabular}';
  assert.equal(X.gridRules(cl, at(cl)), null);
  assert.equal(run(cl, X.deleteRows(cl, at(cl), 0, 0)), '\\begin{tabular}{|l|l|l|}\n\\hline\na & b & c \\\\ \\hline\nd & e & f \\\\ \\hline\n\\end{tabular}');
  const cl2 = '\\begin{tabular}{|l|l|l|}\n\\hline\nH & K & L \\\\ \\hline\na & b & c \\\\ \\cline{2-3}\nd & e & f \\\\ \\hline\n\\end{tabular}';
  assert.ok(!run(cl2, X.deleteRows(cl2, at(cl2), 2, 2)).includes('\\cline'));
  assert.ok(!run(cl2, X.deleteRows(cl2, at(cl2), 1, 1)).includes('\\cline'));
});

// the corpus: every table put back together, a row and a column in and out again
const root = process.argv[2] || process.env.CORPUS_DIR || (fs.existsSync('/tmp/corpus-le/le') ? '/tmp/corpus-le/le' : null);
if (root && fs.existsSync(root)) {
  ok('every table of the corpus: parsed, put back together, a row and a column in and out again', () => {
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tex$/.test(e.name)) files.push(p); } };
    walk(root);
    let tables = 0, read = 0, ops = 0;
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8');
      for (const x of X.tablesIn(t)) {
        tables++;
        const T = X.parseTable(t, x.s);
        if (!T) continue;
        read++;
        assert.equal(X.emit(t, T), t.slice(T.s, T.e), f + ' at ' + x.s);
        const data = T.rows.map((r, k) => k).filter((k) => T.rows[k].kind === 'row');
        if (!data.length) continue;
        for (const r of data) for (const below of [false, true]) {
          const a = X.apply(t, X.insertRow(t, T, r, below).edits), A = X.parseTable(a, x.s), k = below ? r + 1 : r;
          assert.equal(X.apply(a, X.deleteRows(a, A, k, k).edits), t, 'row ' + r + ' in ' + f + ' at ' + x.s);
          ops++;
        }
        for (let c = 0; c < T.ncols; c++) for (const right of [false, true]) {
          const b = X.apply(t, X.insertCol(t, T, c, right).edits), B = X.parseTable(b, x.s), k = right ? c + 1 : c;
          // (a *{n}{…} the column was in stays written out)
          const back = X.apply(b, X.deleteCols(b, B, k, k).edits);
          if (back !== t) assert.equal(X.writtenOut(back, X.parseTable(back, x.s)), X.writtenOut(t, T), 'column ' + c + ' in ' + f + ' at ' + x.s);
          ops++;
        }
      }
    }
    assert.ok(tables > 200 && read >= tables - 1, tables + ' tables, ' + read + ' read');
    console.log('table: the corpus\'s ' + tables + ' tables (' + read + ' read; the other is half of a macro) put back byte for byte, ' + ops + ' rows and columns in and out again');
  });
} else console.log('table: no corpus (CORPUS_DIR) here, its tables not run');

console.log('table: ' + n + ' groups of checks passed');
