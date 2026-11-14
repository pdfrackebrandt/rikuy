// What Insert's Shapes, Chart, SmartArt and Icons write, and the reading of it the page draws from
// (src/drawing.js): every shape read back as the paths it draws, anything outside the subset left
// to the source box, xcolor's mixes, a chart's coordinates read back as written, smartdiagram's
// items with their braces, a stranger's picture read in bounded time.
import assert from 'node:assert/strict';
import * as D from '../src/drawing.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

ok('every shape Insert › Shapes writes is read back as the paths the page draws', () => {
  for (const [id] of D.SHAPES) {
    const t = D.shapeTex(id);
    assert.match(t, /^\\begin\{tikzpicture\}\n\\draw\[thick, draw=blue!60!black/);
    const T = D.readTikz(t);
    assert.ok(T && T.cmds.length === 1, id);
    assert.equal(T.cmds[0].opts.color, 'rgb(0,0,153)');
  }
  const a = D.readTikz(D.shapeTex('arrow')).cmds[0];
  assert.equal(a.opts.arrow, '->');
  assert.equal(D.readTikz(D.shapeTex('star')).cmds[0].segs.filter((s) => s.op === 'L').length, 9);
  assert.equal(D.readTikz(D.shapeTex('oval')).cmds[0].segs[1].op, 'ellipse');
  assert.equal(D.readTikz(D.shapeTex('rounded-rectangle')).cmds[0].opts.round.toFixed(1), '6.0');
  assert.equal(D.shapeTex('nothing'), null);
});

ok('hand written TikZ in the subset is drawn; anything else is left to the source box', () => {
  assert.ok(D.readTikz('\\begin{tikzpicture}[scale=2]\n\\draw (0,0) -- (1,1) -- (2,0) -- cycle; % a triangle\n\\fill[red!50] (3,0) circle (0.5);\n\\end{tikzpicture}'));
  assert.equal(D.readTikz('\\begin{tikzpicture}[scale=2]\n\\fill[red!50] (3,0) circle (0.5);\n\\end{tikzpicture}').scale, 2);
  for (const t of ['\\begin{tikzpicture}\\node at (0,0) {A};\\end{tikzpicture}', '\\begin{tikzpicture}\\draw (0,0) to[bend left] (1,1);\\end{tikzpicture}',
    '\\begin{tikzpicture}\\draw[myStyle] (0,0) -- (1,1);\\end{tikzpicture}', '\\begin{tikzpicture}\\draw (0,0) -- (1,1)\\end{tikzpicture}', '\\begin{tikzpicture}\\foreach \\x in {1,2} \\draw (\\x,0) -- (1,1);\\end{tikzpicture}']) assert.equal(D.readTikz(t), null, t);
});

ok('colours: xcolor\'s names and mixes as RGB, nothing else', () => {
  assert.equal(D.colorOf('blue!20'), 'rgb(204,204,255)');
  assert.equal(D.colorOf('red!50!black'), 'rgb(128,0,0)');
  assert.equal(D.colorOf('blue'), 'rgb(0,0,255)');
  for (const bad of ['url(x)', 'red;background:url(x)', 'blue!200', 'notacolor', '']) assert.equal(D.colorOf(bad), null, bad);
});

ok('a chart from a grid: its coordinates read back as written; names made safe for pgfplots', () => {
  const t = D.chartTex('column', ['Q1', 'Q2'], [{ name: 'A', values: [1, 2.5] }, { name: 'B', values: [3, '4,5'] }]);
  assert.ok(t.includes('\\begin{axis}[ybar, width=0.8\\linewidth, height=6cm, ymin=0, symbolic x coords={Q1,Q2}, xtick=data, legend pos=north west]'));
  assert.ok(t.includes('\\addplot coordinates {(Q1,3) (Q2,4.5)};\n\\addlegendentry{B}'));
  const A = D.readAxis(t);
  assert.deepEqual(A.cats, ['Q1', 'Q2']);
  assert.deepEqual(A.series.map((s) => s.name), ['A', 'B']);
  assert.equal(A.kind, 'ybar');
  const b = D.chartTex('bar', ['a,b{c}', 'a,b{c}'], [{ name: 'x', values: [1, 2] }]);
  assert.ok(b.includes('symbolic y coords={a b c,a b c 2}') && b.includes('(1,a b c)'));
  assert.equal(D.readAxis(b).kind, 'xbar');
  assert.equal(D.readAxis(D.chartTex('line', ['a'], [{ name: 'x', values: [1] }])).kind, 'line');
  assert.equal(D.readAxis('\\begin{tikzpicture}\\begin{axis}[ybar]\\addplot table {data.csv};\\end{axis}\\end{tikzpicture}'), null);
});

ok('SmartArt: the items as written, commas kept in braces, specials taken out', () => {
  assert.equal(D.smartTex('flow diagram:horizontal', ['Plan', 'Write, edit', 'Sub%mit', '']), '\\smartdiagram[flow diagram:horizontal]{Plan, {Write, edit}, Sub mit}');
  assert.deepEqual(D.smartItems('Plan, {Write, edit}, Submit'), ['Plan', 'Write, edit', 'Submit']);
  assert.equal(D.SMART.length, 5);
  assert.ok(D.ICONS.length >= 30 && D.ICONS.every(([id, name, svg]) => /^[a-z-]+$/.test(id) && name && !/[<>]script|on\w+=/i.test(svg)));
});

ok('review H9, H10: a hand written pgfplots axis keeps its source box; SmartArt stops at ten items', () => {
  for (const t of ['\\begin{tikzpicture}\\begin{axis}[ymode=log, xlabel=$x$, only marks]\\addplot coordinates {(0,1) (1,10) (2,100) (10,1000)};\\end{axis}\\end{tikzpicture}',
    '\\begin{tikzpicture}\\begin{axis}[ybar stacked, symbolic x coords={a,b}, xtick=data]\\addplot coordinates {(a,1) (b,2)};\\addplot coordinates {(a,1) (b,2)};\\end{axis}\\end{tikzpicture}',
    '\\begin{tikzpicture}\\begin{axis}[xmin=0, xmax=10]\\addplot+[smooth, mark=none] coordinates {(0,1) (1,2)};\\end{axis}\\end{tikzpicture}',
    '\\begin{tikzpicture}\\begin{axis}[ybar, width=0.8\\linewidth]\\addplot coordinates {(1,1) (2,2)};\\end{axis}\\end{tikzpicture}']) assert.equal(D.readAxis(t), null, t);
  for (const k of ['column', 'bar', 'line']) assert.ok(D.readAxis(D.chartTex(k, ['a', 'b'], [{ name: 's', values: [1, 2] }, { name: 't', values: [3, 4] }])), k);
  const many = Array.from({ length: 12 }, (_, i) => 'Item ' + i);
  assert.equal(D.smartItems(/\{(.*)\}$/.exec(D.smartTex('flow diagram:horizontal', many))[1]).length, 10);
  assert.equal(D.smartItems(/\{(.*)\}$/.exec(D.smartTex('bubble diagram', many))[1]).length, 11);
});

ok('a stranger\'s picture is read in bounded time', () => {
  const t0 = Date.now();
  D.readTikz('\\begin{tikzpicture}' + '\\draw (0,0)'.repeat(5000) + '\\end{tikzpicture}');
  D.readTikz('\\begin{tikzpicture}\\draw ' + '(0,0) -- '.repeat(3000) + '(1,1);\\end{tikzpicture}');
  D.readAxis('\\begin{tikzpicture}\\begin{axis}[' + 'a,'.repeat(5000) + ']' + '\\addplot coordinates {(1,1)};'.repeat(500) + '\\end{axis}\\end{tikzpicture}');
  D.smartItems('{'.repeat(50000));
  assert.ok(Date.now() - t0 < 2000, Date.now() - t0);
});

console.log('drawing: ' + n + ' passed');
