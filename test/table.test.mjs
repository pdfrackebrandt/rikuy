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
          // (a *{n}{…} stays written out)
          assert.equal(X.apply(b, X.deleteCols(b, B, k, k).edits), X.writtenOut(t, T), 'column ' + c + ' in ' + f + ' at ' + x.s);
          ops++;
        }
      }
    }
    assert.ok(tables > 200 && read >= tables - 1, tables + ' tables, ' + read + ' read');
    console.log('table: the corpus\'s ' + tables + ' tables (' + read + ' read; the other is half of a macro) put back byte for byte, ' + ops + ' rows and columns in and out again');
  });
} else console.log('table: no corpus (CORPUS_DIR) here, its tables not run');

console.log('table: ' + n + ' groups of checks passed');
