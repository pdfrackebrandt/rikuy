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
  assert.equal(D.readTikz(ap(rect, O.shapeTextSet(rect, 'a\\b{c}$d;e'))).cmds[1].text, 'a b c d e');
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
  assert.equal(O.chartInfo(ap(chart, O.chartSet(chart, 'title', 'a}b\\c'))).title, 'a b c');
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
  assert.equal(a, '\\smartdiagramset{set color list={' + P.join(',') + '}}\n' + smart + '\n\\smartdiagramset{' + O.SMART_RESET + '}');
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
  assert.equal(b, '\\smartdiagramset{uniform color list=orange!50 for 10 items}\n' + smart + '\n\\smartdiagramset{' + O.SMART_RESET + '}');
  assert.deepEqual(D.smartLook(O.smartInfo(b).setText).colors.slice(0, 2), [D.colorOf('orange!50'), D.colorOf('orange!50')]);
  assert.equal(ap(b, O.smartColors(b, 'colorful')), smart);
  assert.equal(O.smartFill(smart, 'nonsense'), null);
});

console.log('objfmt: ' + n + ' groups passed');
