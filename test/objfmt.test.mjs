// Formatting an object after it is in the document (src/objfmt.js): Shape Format, Chart Design
// and Format, SmartArt Design and Format as edits on strings. Each edit is read back by the page's
// drawing (src/drawing.js), and each has its inverse giving the bytes of before.
import assert from 'node:assert/strict';
import * as O from '../src/objfmt.js';
import * as D from '../src/drawing.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const ap = O.applyEdits;
const rect = D.shapeTex('rectangle'), line = D.shapeTex('arrow');

ok('entries and listSet: braces kept whole, the list\'s own spacing', () => {
  assert.deepEqual(O.entries('a, b={c,d},e').map((x) => x.x), ['a', 'b={c,d}', 'e']);
  assert.equal(O.listSet('thick, draw=red, fill=blue', (x) => x.startsWith('fill'), 'fill=green'), 'thick, draw=red, fill=green');
  assert.equal(O.listSet('thick,draw=red', (x) => x === 'thick', null), 'draw=red');
  assert.equal(O.listSet('', () => false, 'red'), 'red');
});

ok('Shape Fill and Shape Outline: one key of each command, read back by the drawing; the inverse gives the bytes back', () => {
  const a = ap(rect, O.shapeSet(rect, 'fill', 'red!40'));
  assert.equal(a, rect.replace('fill=blue!20', 'fill=red!40'));
  assert.equal(D.readTikz(a).cmds[0].opts.fillColor, D.colorOf('red!40'));
  assert.equal(ap(a, O.shapeSet(a, 'fill', 'blue!20')), rect);
  const none = ap(rect, O.shapeSet(rect, 'fill', 'none'));
  assert.equal(none, rect.replace(', fill=blue!20', ''));
  assert.equal(D.readTikz(none).cmds[0].fill, false);
  const out = ap(rect, O.shapeSet(rect, 'outline', 'teal'));
  assert.equal(out, rect.replace('draw=blue!60!black', 'draw=teal'));
  const noOut = ap(rect, O.shapeSet(rect, 'outline', 'none'));
  assert.equal(D.readTikz(noOut).cmds[0].draw, false);
  assert.equal(ap(noOut, O.shapeSet(noOut, 'outline', 'blue!60!black')), rect);
  // a line has no fill
  assert.deepEqual(O.shapeSet(line, 'fill', 'red'), []);
  // a hand written \filldraw[red]: its fill stays red when the outline changes
  const hw = '\\begin{tikzpicture}\n\\filldraw[red] (0,0) circle (1);\n\\end{tikzpicture}';
  const hw2 = ap(hw, O.shapeSet(hw, 'outline', 'blue'));
  assert.equal(hw2, '\\begin{tikzpicture}\n\\filldraw[fill=red, draw=blue] (0,0) circle (1);\n\\end{tikzpicture}');
  assert.equal(D.readTikz(hw2).cmds[0].opts.fillColor, D.colorOf('red'));
  // a command without options gets its list after its name
  const bare = '\\begin{tikzpicture}\\draw (0,0) rectangle (1,1);\\end{tikzpicture}';
  assert.equal(ap(bare, O.shapeSet(bare, 'fill', 'yellow')), '\\begin{tikzpicture}\\draw[fill=yellow] (0,0) rectangle (1,1);\\end{tikzpicture}');
});

ok('Weight, Dashes, Arrows and the Shape Styles: each a key in place of the old, back to the bytes of before', () => {
  const w = ap(rect, O.shapeSet(rect, 'weight', 2.25));
  assert.equal(w, rect.replace('thick', 'line width=2.25pt'));
  assert.ok(Math.abs(D.readTikz(w).cmds[0].opts.width - 2.25) < 1e-9);
  const d = ap(rect, O.shapeSet(rect, 'dash', 'dashed'));
  assert.equal(D.readTikz(d).cmds[0].opts.dash, 'dashed');
  assert.equal(ap(d, O.shapeSet(d, 'dash', 'solid')), rect);
  const dd = ap(rect, O.shapeSet(rect, 'dash', 'dash dot'));
  assert.equal(D.readTikz(dd).cmds[0].opts.dash, 'dash dot');
  const ar = ap(line, O.shapeSet(line, 'arrow', '<->'));
  assert.equal(ar, line.replace('->]', '<->]'));
  assert.equal(ap(ar, O.shapeSet(ar, 'arrow', '->')), line);
  assert.equal(ap(line, O.shapeSet(line, 'arrow', '-')), line.replace(', ->', ''));
  assert.deepEqual(O.shapeSet(rect, 'arrow', '->'), []);
  const st = ap(rect, O.shapeSet(rect, 'style', { outline: 'orange!75!black', fill: 'orange!40' }));
  assert.equal(st, rect.replace('draw=blue!60!black', 'draw=orange!75!black').replace('fill=blue!20', 'fill=orange!40'));
  // only the commands named
  const two = '\\begin{tikzpicture}\n\\draw[fill=red] (0,0) rectangle (1,1);\n\\draw[fill=red] (2,0) circle (1);\n\\end{tikzpicture}';
  assert.equal(ap(two, O.shapeSet(two, 'fill', 'blue', [1])), two.replace('[fill=red] (2', '[fill=blue] (2'));
  const I = O.shapeInfo(st);
  assert.equal(I.look.fill, 'orange!40'); assert.equal(I.look.outline, 'orange!75!black'); assert.equal(I.look.weight, 0.8);
  assert.equal(O.shapeInfo(line).look.arrow, '->'); assert.ok(O.shapeInfo(line).lines);
});

ok('words in a shape: a node at its middle, its words changed in place, taken off whole', () => {
  const a = ap(rect, O.shapeTextSet(rect, 'Start'));
  assert.equal(a, rect.replace('\n\\end', '\n\\node[align=center] at (1.5,1) {Start};\n\\end'));
  const R = D.readTikz(a);
  assert.deepEqual(R.cmds[1], { node: true, at: [1.5, 1], text: 'Start', opts: { align: 'center' } });
  assert.equal(O.shapeInfo(a).text, 'Start');
  const b = ap(a, O.shapeTextSet(a, 'Two\nlines'));
  assert.equal(D.readTikz(b).cmds[1].text, 'Two \\\\ lines');
  assert.equal(O.shapeInfo(b).text, 'Two\nlines');
  assert.equal(ap(b, O.shapeTextSet(b, '')), rect);
  // a stranger's words lose what TeX would read as commands
  // (review M8: escaped as TeX prints them, read back whole)
  assert.equal(O.shapeInfo(ap(rect, O.shapeTextSet(rect, 'a\\b{c}$d;e'))).text, 'a\\b{c}$d;e');
  // \r\n kept
  const crlf = rect.replace(/\n/g, '\r\n');
  assert.equal(ap(crlf, O.shapeTextSet(crlf, 'X', '\r\n')), crlf.replace('\r\n\\end', '\r\n\\node[align=center] at (1.5,1) {X};\r\n\\end'));
  assert.equal(ap(ap(crlf, O.shapeTextSet(crlf, 'X', '\r\n')), O.shapeTextSet(ap(crlf, O.shapeTextSet(crlf, 'X', '\r\n')), '')), crlf);
});

ok('Height and Width: scale= or xscale= and yscale= on the picture, its box at the size asked', () => {
  const B = O.shapeBox(rect);
  assert.deepEqual([B.w, B.h], [3, 2]);
  const a = ap(rect, O.shapeSize(rect, 6, 4));
  assert.equal(a, rect.replace('\\begin{tikzpicture}', '\\begin{tikzpicture}[scale=2]'));
  assert.deepEqual([O.shapeBox(a).w, O.shapeBox(a).h], [6, 4]);
  const b = ap(a, O.shapeSize(a, 3, 4));
  assert.equal(b, rect.replace('\\begin{tikzpicture}', '\\begin{tikzpicture}[xscale=1, yscale=2]'));
  assert.equal(D.readTikz(b).xs, 1); assert.equal(D.readTikz(b).ys, 2);
  assert.equal(ap(b, O.shapeSize(b, 3, 2)), rect);
  // the drawing's svg follows: twice as wide at scale=2, its line no wider
  const R = D.readTikz(a);
  assert.equal(R.xs, 2);
  // a horizontal line has no height: its width alone sets the scale
  assert.equal(ap(line, O.shapeSize(line, 6, 0)), line.replace('\\begin{tikzpicture}', '\\begin{tikzpicture}[scale=2]'));
});

ok('Bring Forward, Send Backward, to Front, to Back: the commands\' order, each on its line', () => {
  const t = '\\begin{tikzpicture}\n\\draw (0,0) circle (1);\n\\fill[red] (1,0) circle (1);\n\\draw (2,0) rectangle (3,1);\n\\end{tikzpicture}';
  const f = O.shapeOrder(t, 0, 'forward');
  assert.equal(f.k, 1);
  const a = ap(t, f.edits);
  assert.equal(a, '\\begin{tikzpicture}\n\\fill[red] (1,0) circle (1);\n\\draw (0,0) circle (1);\n\\draw (2,0) rectangle (3,1);\n\\end{tikzpicture}');
  assert.equal(ap(a, O.shapeOrder(a, 1, 'backward').edits), t);
  const fr = ap(t, O.shapeOrder(t, 0, 'front').edits);
  assert.equal(fr, '\\begin{tikzpicture}\n\\fill[red] (1,0) circle (1);\n\\draw (2,0) rectangle (3,1);\n\\draw (0,0) circle (1);\n\\end{tikzpicture}');
  assert.equal(ap(fr, O.shapeOrder(fr, 2, 'back').edits), t);
  assert.equal(O.shapeOrder(t, 2, 'forward'), null);
  assert.equal(O.shapeOrder(t, 0, 'backward'), null);
  assert.ok(D.readTikz(fr));
});

const chart = D.chartTex('column', ['A', 'B', 'C'], [{ name: 'Sales', values: [4.3, 2.5, 3.5] }, { name: 'Costs', values: [2, 3, 1] }]);
ok('Add Chart Element: a title, axis titles, gridlines, data labels, the legend\'s corner, each one key of the axis', () => {
  const t = ap(chart, O.chartSet(chart, 'title', 'Q1 sales'));
  assert.equal(t, chart.replace(', legend pos=north west]', ', legend pos=north west, title={Q1 sales}]'));
  assert.equal(O.chartInfo(t).title, 'Q1 sales');
  assert.equal(ap(t, O.chartSet(t, 'title', '')), chart);
  for (const [p, v, key] of [['xlabel', 'Region', 'xlabel={Region}'], ['ylabel', 'Units', 'ylabel={Units}'], ['grid', true, 'ymajorgrids'], ['labels', true, 'nodes near coords']]) {
    const a = ap(chart, O.chartSet(chart, p, v));
    assert.ok(a.includes(key), p);
    assert.ok(D.readAxis(a), p + ' read back');
    assert.equal(ap(a, O.chartSet(a, p, p === 'grid' || p === 'labels' ? false : '')), chart, p + ' off');
  }
  const l = ap(chart, O.chartSet(chart, 'legend', 'south east'));
  assert.equal(l, chart.replace('legend pos=north west', 'legend pos=south east'));
  assert.equal(O.chartInfo(l).legend, 'south east');
  assert.equal(O.chartSet(chart, 'legend', 'middle'), null);
  // a bar chart's gridlines run across its values: x's
  const bar = D.chartTex('bar', ['A', 'B'], [{ name: 'S', values: [1, 2] }]);
  assert.ok(ap(bar, O.chartSet(bar, 'grid', true)).includes('xmajorgrids'));
  // words that TeX would read are taken out
  assert.equal(O.chartInfo(ap(chart, O.chartSet(chart, 'title', 'a}b\\c'))).title, 'a}b\\c');
});

ok('Change Colors and the size: a cycle list of xcolor names, width= and height=; the drawing reads both', () => {
  const c = ap(chart, O.chartSet(chart, 'palette', 'blue'));
  assert.ok(/cycle list=\{\{draw=blue!70!black,fill=blue!70!white,mark=none\},/.test(c));
  assert.equal(O.chartInfo(c).palette, 'blue');
  assert.deepEqual(D.cycleColors(O.cycleText('blue', 'column'))[0], ['blue!70!black', 'blue!70!white']);
  assert.equal(ap(c, O.chartSet(c, 'palette', 'colorful')), chart);
  const s = ap(chart, O.chartSet(chart, 'width', 0.6));
  assert.equal(s, chart.replace('width=0.8\\linewidth', 'width=0.6\\linewidth'));
  const h = ap(s, O.chartSet(s, 'height', 4.5));
  assert.equal(O.chartInfo(h).height, 4.5);
  assert.equal(O.chartInfo(h).width, 0.6);
  assert.equal(O.chartSet(chart, 'width', 3), null);
});

ok('Change Chart Type, Switch Row/Column, Edit Data: the chart again, its settings kept', () => {
  let a = ap(chart, O.chartSet(chart, 'title', 'T'));
  a = ap(a, O.chartSet(a, 'grid', true));
  a = ap(a, O.chartSet(a, 'palette', 'colorful-2'));
  a = ap(a, O.chartSet(a, 'height', 5));
  const I = O.chartInfo(a);
  const bar = ap(a, O.chartRewrite(a, 'bar', I.cats, I.series));
  const J = O.chartInfo(bar);
  assert.equal(J.kind, 'bar'); assert.equal(J.title, 'T'); assert.ok(bar.includes('xmajorgrids')); assert.equal(J.palette, 'colorful-2'); assert.equal(J.height, 5);
  assert.deepEqual(J.series, I.series);
  const line = ap(bar, O.chartRewrite(bar, 'line', J.cats, J.series));
  assert.equal(O.chartInfo(line).palette, 'colorful-2');
  assert.ok(line.includes('{teal,mark=*}'));
  // and back to a column chart: the bytes of before
  assert.equal(ap(line, O.chartRewrite(line, 'column', J.cats, J.series)), a);
  const sw = ap(a, O.chartSwitch(a));
  assert.deepEqual(O.chartInfo(sw).cats, ['Sales', 'Costs']);
  assert.deepEqual(O.chartInfo(sw).series.map((x) => x.name), ['A', 'B', 'C']);
  assert.equal(ap(sw, O.chartSwitch(sw)), a);
  // one series: no legend; Switch with one category makes one series again
  const one = D.chartTex('column', ['A', 'B'], [{ name: 'S', values: [1, 2] }]);
  assert.equal(O.chartSet(one, 'legend', 'north east'), null);
});

const smart = D.smartTex('flow diagram:horizontal', ['Plan', 'Write', 'Submit']);
ok('SmartArt: Change Layout, the items, Right to Left', () => {
  const a = ap(smart, O.smartLayout(smart, 'circular diagram:clockwise'));
  assert.equal(a, '\\smartdiagram[circular diagram:clockwise]{Plan, Write, Submit}');
  assert.ok(O.smartTurns(O.smartInfo(a).kind));
  assert.equal(O.smartFlip('circular diagram:clockwise'), 'circular diagram:counterclockwise');
  assert.equal(ap(a, O.smartLayout(a, 'flow diagram:horizontal')), smart);
  const b = ap(smart, O.smartItemsSet(smart, ['Plan', 'Draft, then write', 'Submit', 'Wait']));
  assert.equal(b, '\\smartdiagram[flow diagram:horizontal]{Plan, {Draft, then write}, Submit, Wait}');
  assert.deepEqual(O.smartInfo(b).items, ['Plan', 'Draft, then write', 'Submit', 'Wait']);
  assert.equal(O.smartItemsSet(smart, []), null);
});

ok('SmartArt: Change Colors writes its set and the line that gives the package\'s colours back; Colorful and Reset Graphic take both off', () => {
  const a = ap(smart, O.smartColors(smart, 'teal'));
  const P = O.SMART_PALETTES.find((p) => p[0] === 'teal')[2];
  assert.equal(a, '\\smartdiagramset{set color list={' + P.join(',') + '}}\n' + smart + '\n\\smartdiagramset{' + O.SMART_RESET + '}% rikuy: colours back');
  const I = O.smartInfo(a);
  assert.equal(I.palette, 'teal'); assert.ok(I.reset);
  assert.deepEqual(D.smartLook(I.setText).colors.slice(0, 2), [D.colorOf('teal!60'), D.colorOf('teal!52')]);
  assert.equal(ap(a, O.smartColors(a, 'colorful')), smart);
  const b = ap(a, O.smartBorder(a, 'black'));
  assert.equal(O.smartInfo(b).border, 'black');
  assert.equal(D.smartLook(O.smartInfo(b).setText).border, D.colorOf('black'));
  // colours off: the reset goes, the border stays (it is local to the diagram's group)
  const c = ap(b, O.smartColors(b, 'colorful'));
  assert.equal(c, '\\smartdiagramset{border color=black}\n' + smart);
  assert.equal(ap(c, O.smartBorder(c, null)), smart);
  assert.equal(ap(b, O.smartResetEdits(b)), smart);
  assert.equal(O.smartBorder(smart, 'url(x)'), null);
  // every palette's colours read by the page
  for (const [, , cols] of O.SMART_PALETTES) if (cols) assert.ok(cols.every((x) => D.colorOf(x)), String(cols));
  for (const [id] of O.PALETTES) { const t = O.cycleText(id, 'column'); if (t) assert.ok(D.cycleColors(t)); }
  for (const row of O.COLOR_GRID) for (const x of row) assert.ok(D.colorOf(x), x);
});

ok('SmartArt Format: Shape Fill one colour for every item, in place of a palette; Colorful takes it off', () => {
  const a = ap(smart, O.smartColors(smart, 'blue'));
  const b = ap(a, O.smartFill(a, 'orange!50'));
  assert.equal(b, '\\smartdiagramset{uniform color list=orange!50 for 10 items}\n' + smart + '\n\\smartdiagramset{' + O.SMART_RESET + '}% rikuy: colours back');
  assert.deepEqual(D.smartLook(O.smartInfo(b).setText).colors.slice(0, 2), [D.colorOf('orange!50'), D.colorOf('orange!50')]);
  assert.equal(ap(b, O.smartColors(b, 'colorful')), smart);
  assert.equal(O.smartFill(smart, 'nonsense'), null);
});

ok('review H1, M2: a comment in an option list and a list one key a line: the edit goes in place, nothing else moves', () => {
  // a comment after the axis's last key: the new key before it, the ] after it untouched
  const c = chart.replace(', legend pos=north west]', ', legend pos=north west % top left\n]');
  assert.ok(O.chartInfo(c));
  const t = ap(c, O.chartSet(c, 'title', 'Q1'));
  // (review N5: the comment stays the key's it was written after; the new key on a line of its own)
  assert.equal(t, c.replace('north west % top left\n', 'north west, % top left\ntitle={Q1}\n'));
  assert.ok(D.readAxis(t) && O.chartInfo(t).title === 'Q1');
  assert.equal(ap(t, O.chartSet(t, 'title', '')), c);
  // one key a line: a new key on a line of its own, an old one taken off with its line
  const hand = chart.replace(/\\begin\{axis\}\[[^\]]*\]/, (m) => '\\begin{axis}[\n  ' + m.slice(13, -1).split(', ').join(',\n  ') + ' % the end\n]');
  assert.ok(O.chartInfo(hand), hand);
  const g = ap(hand, O.chartSet(hand, 'grid', true));
  assert.equal(g, hand.replace('legend pos=north west % the end\n', 'legend pos=north west, % the end\n  ymajorgrids\n'));
  assert.equal(ap(g, O.chartSet(g, 'grid', false)), hand);
  const w = ap(hand, O.chartSet(hand, 'width', 0.5));
  assert.equal(w, hand.replace('width=0.8\\linewidth', 'width=0.5\\linewidth'));
  // a drawing's options over several lines, a comment among them
  const sh = '\\begin{tikzpicture}\n\\draw[thick,\n  draw=blue!60!black, % outline\n  fill=blue!20] (0,0) rectangle (2,1);\n\\end{tikzpicture}';
  assert.ok(D.readTikz(sh));
  const f = ap(sh, O.shapeSet(sh, 'fill', 'red'));
  assert.equal(f, sh.replace('fill=blue!20', 'fill=red'));
  const d = ap(sh, O.shapeSet(sh, 'dash', 'dashed'));
  assert.equal(d, sh.replace('fill=blue!20]', 'fill=blue!20,\n  dashed]'));
  assert.equal(ap(d, O.shapeSet(d, 'dash', 'solid')), sh);
  // review L1: a command sharing its line with another, or followed by a comment, is ordered only
  // where that cannot comment code out
  const so = '\\begin{tikzpicture}\n\\draw (0,0) rectangle (1,1); % A\n\\draw (2,0) circle (0.5); \\node at (0,0) {x};\n\\end{tikzpicture}';
  assert.equal(O.shapeOrder(so, 0, 'forward'), null);
  const so2 = so.replace(' \\node at (0,0) {x};', '\n\\node at (0,0) {x};');
  const r = O.shapeOrder(so2, 0, 'forward');
  assert.equal(ap(so2, r.edits), '\\begin{tikzpicture}\n\\draw (2,0) circle (0.5);\n\\draw (0,0) rectangle (1,1); % A\n\\node at (0,0) {x};\n\\end{tikzpicture}');
  // a comma in a comment is no separator
  assert.deepEqual(O.entries('a, % b, c\n d').map((x) => x.x), ['a', 'd']);
});

ok('review H2: an object in a center in a figure is in the figure; Position changes the figure, never nests one; a box refuses', () => {
  const nest = 'A\n\\begin{figure}[htbp]\n\\begin{center}\n' + rect + '\n\\end{center}\n\\caption{Box}\n\\end{figure}\n\nWords.';
  const s = nest.indexOf('\\begin{tikzpicture}'), e = nest.indexOf('\\end{tikzpicture}') + 17;
  assert.equal(O.positionOf(nest, s, e).mode, 'float');
  assert.equal(O.alignOf(nest, s, e).align, 'center');
  const t = ap(nest, O.positionEdits(nest, s, e, { mode: 'float', place: 't' }).edits);
  assert.equal(t, nest.replace('[htbp]', '[t]'));
  assert.equal((t.match(/\\begin\{figure\}/g) || []).length, 1);
  // (review N1: a {0pt} wrapfigure's body is one line's mode, where a center cannot stand)
  const w = ap(nest, O.positionEdits(nest, s, e, { mode: 'wrap', side: 'r' }).edits);
  assert.equal(w, 'A\n\\begin{wrapfigure}{r}{0pt}\n\\centering\n' + rect + '\n\\caption{Box}\n\\end{wrapfigure}\n\nWords.');
  assert.match(O.positionEdits(nest, s, e, { mode: 'inline' }).error, /caption/);
  // Align in it: its center becomes a flushright
  assert.equal(ap(nest, O.alignEdits(nest, s, e, 'right')), nest.replace(/\{center\}/g, '{flushright}'));
  // without a caption, In Line with Text takes the figure's lines off and keeps the center
  const nc = nest.replace('\\caption{Box}\n', '');
  const s2 = nc.indexOf('\\begin{tikzpicture}'), e2 = nc.indexOf('\\end{tikzpicture}') + 17;
  assert.equal(ap(nc, O.positionEdits(nc, s2, e2, { mode: 'inline' }).edits), 'A\n\\begin{center}\n' + rect + '\n\\end{center}\n\nWords.');
  // a minipage, a table's cell, a footnote: no float from there
  for (const [a, z, word] of [['\\begin{minipage}{5cm}', '\\end{minipage}', 'minipage'], ['\\begin{tabular}{c}', '\\end{tabular}', 'cell'], ['\\footnote{', '}', 'footnote']]) {
    const d = 'A ' + a + '\\begin{center}' + rect + '\\end{center}' + z + ' B';
    const ss = d.indexOf('\\begin{tikzpicture}'), ee = d.indexOf('\\end{tikzpicture}') + 17;
    assert.match(O.positionEdits(d, ss, ee, { mode: 'float' }).error, new RegExp(word), word);
  }
});

ok('review N5: a key taken off takes its own line or its comma, never a neighbour\'s comment; one put after a comment keeps it its line\'s', () => {
  const body = '\\addplot coordinates {(A,1) (B,2)};\n\\end{axis}\n\\end{tikzpicture}';
  const t = '\\begin{tikzpicture}\n\\begin{axis}[\n  ybar,\n  symbolic x coords={A,B},\n  xtick=data,\n  ymajorgrids, % grid lines help\n  nodes near coords % labels on bars\n]\n' + body;
  const l = ap(t, O.chartSet(t, 'labels', false));
  assert.equal(l, t.replace('ymajorgrids, % grid lines help\n  nodes near coords % labels on bars\n', 'ymajorgrids % grid lines help\n'));
  // on again: the comma before the comment, the key on its own line (its own old comment went with it)
  assert.equal(ap(l, O.chartSet(l, 'labels', true)), t.replace(' % labels on bars', ''));
  const g = ap(t, O.chartSet(t, 'grid', false));
  assert.equal(g, t.replace('  ymajorgrids, % grid lines help\n', ''));
  // a drawing's options with a comment on every line
  const s = '\\begin{tikzpicture}\n\\draw[thick, % the line\n  draw=red, % its colour\n  dashed % style\n] (0,0) rectangle (2,1);\n\\end{tikzpicture}';
  const d = ap(s, O.shapeSet(s, 'dash', 'solid'));
  assert.equal(d, s.replace('draw=red, % its colour\n  dashed % style\n', 'draw=red % its colour\n'));
  assert.ok(D.readTikz(d));
  const f = ap(s, O.shapeSet(s, 'fill', 'blue!20'));
  assert.equal(f, s.replace('dashed % style\n', 'dashed, % style\n  fill=blue!20\n'));
  assert.equal(ap(f, O.shapeSet(f, 'fill', 'none')), s);
  // on one line: the entry and the comma before it; a comment after stays
  assert.equal(O.listSet('a, b % c', (x) => x === 'b'), 'a % c');
  assert.equal(O.listSet('a, b, % c\n d', (x) => x === 'b'), 'a, % c\n d');
  // all of them taken off: nothing left between them
  assert.equal(O.listSet('xscale=1, yscale=2', (x) => /scale/.test(x)), '');
  assert.equal(O.listSet('a,\n  b, % B\n  c % C\n', (x) => x !== 'a'), 'a\n');
});

ok('review N8: Edit Data: a series\' name keeps & % _ $ # (escaped, read back as typed); a category is cleaned by the rule the grid says', () => {
  const names = ['Sales & Co', '100%', 'a_b $5 #1', 'x \\ {y} ^ ~'];
  const c = D.chartTex('column', ['R&D', 'Q1 50%', 'a_b', 'x,y'], names.map((n, i) => ({ name: n, values: [1, 2, 3, i] })));
  assert.ok(c.includes('\\addlegendentry{Sales \\& Co}') && c.includes('\\addlegendentry{100\\%}') && c.includes('\\addlegendentry{a\\_b \\$5 \\#1}'), c);
  const A = D.readAxis(c);
  assert.deepEqual(A.series.map((x) => x.name), names);
  assert.deepEqual(A.cats, ['R D', 'Q1 50', 'a b', 'x y']);
  assert.deepEqual(A.cats, ['R&D', 'Q1 50%', 'a_b', 'x,y'].map(D.catClean));
  assert.ok(D.CAT_OUT.test('R&D') && !D.CAT_OUT.test('Q1 sales'));
  // Change Chart Type keeps the names as they were
  const I = O.chartInfo(c);
  const l = ap(c, O.chartRewrite(c, 'line', I.cats, I.series));
  assert.deepEqual(D.readAxis(l).series.map((x) => x.name), names);
});

ok('review U1, U2, U4: a float only where LaTeX can float it (the document\'s own environments read), language environments wrap, one \\centering', () => {
  const at = (d) => [d.indexOf('\\begin{tikzpicture}'), d.indexOf('\\end{tikzpicture}') + 17];
  const C = '\\begin{center}\n' + rect + '\n\\end{center}\n';
  const doc = (pre, a, z) => '\\documentclass{article}\n' + pre + '\\begin{document}\nA\n\n' + a + '\n' + C + 'Words to wrap round it, words to wrap round it.\n' + z + '\n\nB\n\\end{document}\n';
  const T = { mode: 'float', place: 't' }, W = { mode: 'wrap', side: 'r' };
  // U1: environments of the document's own that are boxes, and ones Rikuy cannot read: refused, said why
  for (const [pre, env] of [['\\newenvironment{mybox}{\\begin{minipage}{6cm}}{\\end{minipage}}\n', 'mybox'], ['\\usepackage{tcolorbox}\n\\newtcolorbox{notebox}{colback=red!5}\n', 'notebox'],
    ['\\NewDocumentEnvironment{framedbox}{}{\\begin{tcolorbox}}{\\end{tcolorbox}}\n', 'framedbox'], ['', 'unknownthing']]) {
    const d = doc(pre, '\\begin{' + env + '}', '\\end{' + env + '}');
    const [s, e] = at(d);
    for (const to of [T, W]) assert.match(O.positionEdits(d, s, e, to).error, new RegExp(env), env + ' ' + to.mode);
    if (pre) assert.match(O.positionEdits(d, s, e, T).error, /of this document's own/, env);
    assert.ok(O.positionEdits(d, s, e, { mode: 'inline' }).edits, env);
  }
  // ones made only of safe environments and declarations, theorems, a proof: a float may stand there
  for (const [pre, env] of [['\\newenvironment{note}{\\begin{quote}\\small\\itshape}{\\end{quote}}\n', 'note'], ['\\usepackage{amsthm}\n\\newtheorem{thm}{Theorem}\n', 'thm'], ['\\usepackage{amsthm}\n', 'proof']]) {
    const d = doc(pre, '\\begin{' + env + '}', '\\end{' + env + '}');
    const [s, e] = at(d);
    assert.ok((O.positionEdits(d, s, e, T).edits || []).length, env);
    assert.match(O.positionEdits(d, s, e, W).error, /wrapfig cannot wrap/, env);
  }
  // the preamble from the main file where the object is in another
  const part = 'A\n\n\\begin{mybox}\n' + C + '\\end{mybox}\n';
  const [ps, pe] = at(part);
  assert.match(O.positionEdits(part, ps, pe, T, undefined, '\\newenvironment{mybox}{\\begin{minipage}{6cm}}{\\end{minipage}}\n\\begin{document}\\input{part}\\end{document}').error, /of this document's own/);
  // a float already there keeps its choice of place
  const fl = doc('\\newtcolorbox{notebox}{}\n', '\\begin{notebox}\n\\begin{figure}[h]', '\\end{figure}\n\\end{notebox}');
  const [fs, fe] = at(fl);
  assert.ok(O.positionEdits(fl, fs, fe, T).edits.length);
  // U2: polyglossia's language environments, babel's: wrap and float both
  const pg = doc('\\usepackage{polyglossia}\n\\setdefaultlanguage{english}\n\\setotherlanguages{french,arabic}\n', '\\begin{french}', '\\end{french}');
  const [gs, ge] = at(pg);
  assert.ok(O.positionEdits(pg, gs, ge, W).edits.length);
  assert.ok(O.positionEdits(pg, gs, ge, T).edits.length);
  const ar = pg.replace(/\{french\}/g, '{Arabic}');
  const [as, ae] = at(ar);
  assert.ok(O.positionEdits(ar, as, ae, W).edits.length);
  const ol = doc('\\usepackage[french,english]{babel}\n', '\\begin{otherlanguage}{french}', '\\end{otherlanguage}');
  const [os, oe] = at(ol);
  assert.ok(O.positionEdits(ol, os, oe, W).edits.length);
  // U4: a figure with \\centering and a center: Wrap keeps one \\centering
  const both = 'A\n\\begin{figure}[h]\n\\centering\n\\begin{center}\n' + rect + '\n\\end{center}\n\\caption{Box}\n\\end{figure}\nWords.';
  const [bs, be] = at(both);
  const w = ap(both, O.positionEdits(both, bs, be, W).edits);
  assert.equal(w, 'A\n\\begin{wrapfigure}{r}{0pt}\n\\centering\n' + rect + '\n\\caption{Box}\n\\end{wrapfigure}\nWords.');
});

ok('review V1: the preamble\'s own files read; a theorem\'s name trusted only where a \\newtheorem declares it; a box anywhere is a box', () => {
  const at = (d) => [d.indexOf('\\begin{tikzpicture}'), d.indexOf('\\end{tikzpicture}') + 17];
  const C = '\\begin{center}\n' + rect + '\n\\end{center}\n';
  const doc = (env, cls = 'article') => '\\documentclass{' + cls + '}\n\\input{preamble}\n\\begin{document}\nA\n\n\\begin{' + env + '}\n' + C + 'Words.\n\\end{' + env + '}\n\nB\n\\end{document}\n';
  const T = { mode: 'float', place: 't' };
  const run = (env, others, cls) => { const d = doc(env, cls); const [s, e] = at(d); return O.positionEdits(d, s, e, T, undefined, d, others); };
  // a box in the preamble's file, under a theorem's name
  assert.match(run('example', ['\\usepackage{tcolorbox}\n\\newtcolorbox{example}{colback=blue!5}\n']).error, /example, an environment of this document's own/);
  assert.match(run('note', ['\\newenvironment{note}{\\begin{minipage}{6cm}}{\\end{minipage}}\n']).error, /note, an environment of this document's own/);
  // a theorem's name nobody declares: refused as any unknown environment
  assert.match(run('example', []).error, /stands in example/);
  // declared a theorem in the preamble's file, or by a class that makes them theorems: a float may stand there
  assert.ok(run('example', ['\\usepackage{amsthm}\n\\newtheorem{example}{Example}\n']).edits.length);
  assert.ok(run('example', [], 'llncs').edits.length);
  // code put at a quote's start that opens a box: the quote is a box then
  assert.match(run('quote', ['\\usepackage{etoolbox}\n\\AtBeginEnvironment{quote}{\\begin{minipage}{6cm}}\n\\AtEndEnvironment{quote}{\\end{minipage}}\n']).error, /quote/);
  assert.ok(run('quote', ['\\usepackage{etoolbox}\n\\AtBeginEnvironment{quote}{\\small}\n']).edits.length);
});

ok('review N1: Wrap on a float holding a center writes \\centering (no center in a wrapfigure), a table stays a table', () => {
  const at = (d) => [d.indexOf('\\begin{tikzpicture}'), d.indexOf('\\end{tikzpicture}') + 17];
  const fr = 'A\n\\begin{figure}[h]\n  \\begin{flushright}\n' + rect + '\n  \\end{flushright}\n\\caption{Box}\n\\end{figure}\n\nWords.';
  const [s1, e1] = at(fr);
  assert.equal(ap(fr, O.positionEdits(fr, s1, e1, { mode: 'wrap', side: 'l' }).edits), 'A\n\\begin{wrapfigure}{l}{0pt}\n  \\raggedleft\n' + rect + '\n\\caption{Box}\n\\end{wrapfigure}\n\nWords.');
  const tb = 'A\n\\begin{table}[htbp]\n\\begin{center}\n' + rect + '\n\\end{center}\n\\caption{Data}\n\\end{table}\n\nWords.';
  const [s2, e2] = at(tb);
  const w = ap(tb, O.positionEdits(tb, s2, e2, { mode: 'wrap', side: 'r' }).edits);
  assert.equal(w, 'A\n\\begin{wraptable}{r}{0pt}\n\\centering\n' + rect + '\n\\caption{Data}\n\\end{wraptable}\n\nWords.');
  // back to a float: a table again, never a figure, never two
  const [s3, e3] = at(w);
  assert.equal(O.positionOf(w, s3, e3).mode, 'wrap');
  const t = ap(w, O.positionEdits(w, s3, e3, { mode: 'float', place: 't' }).edits);
  assert.equal(t, w.replace('\\begin{wraptable}{r}{0pt}', '\\begin{table}[t]').replace('\\end{wraptable}', '\\end{table}'));
  assert.equal(ap(w, O.positionEdits(w, s3, e3, { mode: 'wrap', side: 'l' }).edits), w.replace('{wraptable}{r}', '{wraptable}{l}'));
  assert.match(O.positionEdits(tb, s2, e2, { mode: 'inline' }).error, /caption needs a table/);
});

ok('review N2, N3: no float in columns, in a box or in another float of any kind; the reason said, the menu greyed', () => {
  const at = (d) => [d.indexOf('\\begin{tikzpicture}'), d.indexOf('\\end{tikzpicture}') + 17];
  const C = '\\begin{center}\n' + rect + '\n\\end{center}\n';
  // multicols: a figure there is dropped ("Floats and marginpars not allowed inside multicols")
  const mc = 'A\n\\begin{multicols}{2}\nWords.\n\n' + C + '\nMore words.\n\\end{multicols}\n';
  const [s1, e1] = at(mc);
  for (const to of [{ mode: 'float', place: 't' }, { mode: 'float', place: 'H' }, { mode: 'wrap', side: 'r' }]) assert.match(O.positionEdits(mc, s1, e1, to).error, /multicols/, to.mode);
  assert.match(O.positionWhyNot(O.positionOf(mc, s1, e1), { mode: 'float', place: 't' }), /multicols/);
  // a figure already lost there comes back in line; a figure* across the columns keeps its place's choice
  const mf = mc.replace(C, '\\begin{figure}[h]\n\\centering\n' + rect + '\n\\end{figure}\n');
  const [s2, e2] = at(mf);
  assert.ok(O.positionEdits(mf, s2, e2, { mode: 'inline' }).edits.length);
  assert.match(O.positionEdits(mf, s2, e2, { mode: 'float', place: 't' }).error, /multicols/);
  const ms = mf.replace(/\{figure\}/g, '{figure*}');
  const [s3, e3] = at(ms);
  assert.equal(ap(ms, O.positionEdits(ms, s3, e3, { mode: 'float', place: 't' }).edits), ms.replace('[h]', '[t]'));
  assert.match(O.positionEdits(ms, s3, e3, { mode: 'wrap', side: 'r' }).error, /figure\*/);
  // boxes: tcolorbox, mdframed, adjustbox, framed, a \parbox, a \fbox
  for (const [a, z, word] of [['\\begin{tcolorbox}', '\\end{tcolorbox}', 'tcolorbox'], ['\\begin{mdframed}', '\\end{mdframed}', 'mdframed'], ['\\begin{adjustbox}{max width=\\linewidth}', '\\end{adjustbox}', 'adjustbox'], ['\\begin{framed}', '\\end{framed}', 'framed'], ['\\parbox{5cm}{', '}', 'parbox'], ['\\fbox{', '}', 'fbox']]) {
    const d = 'A\n' + a + '\n' + C + z + '\n\nB';
    const [ss, ee] = at(d);
    for (const to of [{ mode: 'float', place: 't' }, { mode: 'wrap', side: 'r' }]) assert.match(O.positionEdits(d, ss, ee, to).error, new RegExp(word), word);
  }
  // floats that set their own place: never a figure inside them
  for (const env of ['sidewaysfigure', 'sidewaystable', 'SCfigure', 'marginfigure']) {
    const d = 'A\n\\begin{' + env + '}\n\\centering\n' + rect + '\n\\caption{X}\n\\end{' + env + '}\n\nB';
    const [ss, ee] = at(d);
    assert.equal(O.positionOf(d, ss, ee).mode, 'fixed', env);
    for (const to of [{ mode: 'float', place: 't' }, { mode: 'wrap', side: 'r' }, { mode: 'inline' }]) assert.match(O.positionEdits(d, ss, ee, to).error, new RegExp(env + ', which sets its own place'), env);
  }
  // a wraptable round it: Top of Page makes it the table, no figure inside
  const wt = 'A\n\\begin{wraptable}{r}{5cm}\n\\centering\n' + rect + '\n\\end{wraptable}\nWords.';
  const [s4, e4] = at(wt);
  const t = ap(wt, O.positionEdits(wt, s4, e4, { mode: 'float', place: 't' }).edits);
  assert.equal(t, wt.replace('\\begin{wraptable}{r}{5cm}', '\\begin{table}[t]').replace('\\end{wraptable}', '\\end{table}'));
  // a float inside a list stays allowed (LaTeX floats from an item)
  const li = 'A\n\\begin{itemize}\n\\item Words.\n\n' + C + '\\end{itemize}\n';
  const [s5, e5] = at(li);
  assert.ok(O.positionEdits(li, s5, e5, { mode: 'float', place: 't' }).edits.length);
});

ok('review N4: no wrap inside a list item, a quote or a theorem (wrapfig: "conflicting environment")', () => {
  const at = (d) => [d.indexOf('\\begin{tikzpicture}'), d.indexOf('\\end{tikzpicture}') + 17];
  const C = '\\begin{center}\n' + rect + '\n\\end{center}\n';
  for (const [a, z, word] of [['\\begin{itemize}\n\\item Words.\n\n', '\nWords after.\n\\end{itemize}', 'in a list \\(itemize\\)'], ['\\begin{enumerate}\\item ', '\nMore.\n\\end{enumerate}', 'in a list \\(enumerate\\)'], ['\\begin{quote}\n', '\nWords.\n\\end{quote}', 'inside quote'], ['\\begin{theorem}\n', '\nWords.\n\\end{theorem}', 'inside theorem']]) {
    const d = 'A\n' + a + C + z + '\n\nB';
    const [ss, ee] = at(d);
    assert.match(O.positionEdits(d, ss, ee, { mode: 'wrap', side: 'r' }).error, new RegExp(word), word);
  }
  // in a language's environment or at a smaller size wrapfig works
  const ok1 = 'A\n\\begin{otherlanguage}{german}\n' + C + '\nWorte, die herumlaufen.\n\\end{otherlanguage}\n';
  const [s1, e1] = at(ok1);
  assert.ok(O.positionEdits(ok1, s1, e1, { mode: 'wrap', side: 'r' }).edits.length);
});

ok('review M1: no wrap before a list, a display or a heading (wrapfig would float it to the end)', () => {
  const base = 'A\n\n\\begin{center}\n' + rect + '\n\\end{center}\n';
  const s = base.indexOf('\\begin{tikzpicture}'), e = base.indexOf('\\end{tikzpicture}') + 17;
  for (const after of ['\\begin{itemize}\n\\item x\n\\end{itemize}', '\\[ x \\]', '\\section{B}', '% note\n\\begin{enumerate}\\item x\\end{enumerate}']) assert.match(O.positionEdits(base + after, s, e, { mode: 'wrap', side: 'r' }).error, /floats? it to the end|float it to the end/, after);
  assert.ok(O.positionEdits(base + '\nWords to wrap round it.', s, e, { mode: 'wrap', side: 'r' }).edits.length);
});

ok('review M8: & % $ _ # ^ ~ \\ { } escaped in a shape\'s words, a chart\'s titles and SmartArt\'s items, and read back', () => {
  const w = 'R&D: 50% of $5_000 #1 ^~ \\ {x}';
  const a = ap(rect, O.shapeTextSet(rect, w));
  assert.ok(a.includes('{R\\&D: 50\\% of \\$5\\_000 \\#1 \\textasciicircum{}\\textasciitilde{} \\textbackslash{} \\textbraceleft{}x\\textbraceright{}};'), a);
  assert.equal(O.shapeInfo(a).text, w);
  assert.ok(D.readTikz(a));
  const t = ap(chart, O.chartSet(chart, 'title', w));
  assert.equal(O.chartInfo(t).title, w);
  assert.ok(D.readAxis(t));
  const x = ap(chart, O.chartSet(chart, 'xlabel', '50% R&D'));
  assert.equal(O.chartInfo(x).xlabel, '50% R&D');
  const sm = ap(smart, O.smartItemsSet(smart, ['R&D', '50%, then $5', 'a_b #1']));
  assert.equal(sm, '\\smartdiagram[flow diagram:horizontal]{R\\&D, {50\\%, then \\$5}, a\\_b \\#1}');
  assert.deepEqual(O.smartInfo(sm).items, ['R&D', '50%, then $5', 'a_b #1']);
  assert.equal(D.unTeX(D.escTeX(w)), w);
});

ok('review L7: after a diagram with colours of its own, the document\'s own list comes back, not the package\'s', () => {
  const pre = '\\usepackage{smartdiagram}\n\\smartdiagramset{border color=gray, set color list={blue!20,blue!30,blue!40}}\n';
  const back = O.docColorList(pre);
  assert.equal(back, 'set color list={blue!20,blue!30,blue!40}');
  assert.equal(O.docColorList('\\usepackage{smartdiagram}'), O.SMART_RESET);
  const a = ap(smart, O.smartColors(smart, 'teal', '\n', back));
  assert.ok(a.endsWith('\n\\smartdiagramset{set color list={blue!20,blue!30,blue!40}}% rikuy: colours back'), a);
  assert.ok(O.smartInfo(a).reset);
  assert.equal(ap(a, O.smartColors(a, 'colorful', '\n', back)), smart);
  // a set after a diagram with no comment is the next diagram's, never taken as this one's
  const two = smart + '\n\\smartdiagramset{set color list={red!20}}';
  assert.equal(O.smartInfo(two).reset, null);
});

console.log('objfmt: ' + n + ' groups passed');
