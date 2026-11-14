// Insert's pure parts. Interactive graphs (src/graph.js): the formula language (what people type
// in Word, Desmos and LaTeX), its mistakes said where they are, the caps a stranger's graph
// meets, the description read back from a widget's file byte for byte, the four templates
// drawn, the fits, the distributions against their known moments, the CLT template against
// sample/widget's hand written widget, and graphKit running on its own text alone (as it does
// in a widget's frame).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { graphKit, kit as K, graphHtml, readGraph, isGraph, sameGraph, template, TEMPLATES, parseData, dataText, RIKUY_STY } from '../src/graph.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const ev = (t, vars = {}, names = []) => {
  const slots = {}, env = [];
  Object.keys(vars).forEach((k, i) => { slots[k] = i; env.push(vars[k]); });
  return K.compile(K.parse(t, names), slots)(env);
};
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), a + ' != ' + b);

ok('formulas: products without a sign, functions without brackets, powers, LaTeX', () => {
  near(ev('2x', { x: 3 }), 6);
  near(ev('a sin(b x)', { a: 2, b: 1, x: Math.PI / 2 }), 2);
  near(ev('ax^2', { a: 2, x: 3 }), 18);
  near(ev('sin x cos x', { x: 1 }), Math.sin(1) * Math.cos(1));
  near(ev('sin 2x', { x: 0.3 }), Math.sin(0.6));
  near(ev('sin^2 x + cos^2 x', { x: 0.7 }), 1);
  near(ev('(x+1)(x-1)', { x: 3 }), 8);
  near(ev('-x^2', { x: 3 }), -9);
  near(ev('2^3^2'), 512);
  near(ev('x^(1/3)', { x: -8 }), -2);
  assert.ok(Number.isNaN(ev('x^0.5', { x: -4 })));
  near(ev('|x - 3|', { x: 1 }), 2);
  near(ev('3!'), 6);
  near(ev('e^x', { x: 1 }), Math.E);
  near(ev('2e'), 2 * Math.E);
  near(ev('1e3'), 1000);
  near(ev('2pi'), 2 * Math.PI);
  near(ev('\\frac{1}{2}x^2', { x: 4 }), 8);
  near(ev('\\sqrt{x} \\cdot 2', { x: 9 }), 6);
  near(ev('\\left(x\\right)^2', { x: 3 }), 9);
  near(ev('3 × 2 − 1'), 5);
  near(ev('x²', { x: 5 }), 25);
  near(ev('if(x < 0, 0, x)', { x: -2 }), 0);
  near(ev('if(x >= 0, 1, -1)', { x: 0 }), 1);
  near(ev('gamma(5)'), 24, 1e-12);
  near(ev('ln e'), 1);
  near(ev('log(100)'), 2);
  near(ev('log(2, 8)'), 3);
  near(ev('normcdf(0)'), 0.5);
  near(ev('erf(0.5)'), 0.5204998778130465, 1e-12);
  near(ev('erf(3.5)'), 0.9999992569016276, 1e-12);
  near(ev('amp x', { amp: 2, x: 3 }, ['amp']), 6);
  near(ev('μ + sigma', { 'μ': 1, 'σ': 2 }), 3);
  near(ev('\\alpha x', { 'α': 2, x: 2 }), 4);
  near(ev('a_1 x', { a_1: 3, x: 2 }), 6);
  near(ev('x_{max}', { x_max: 7 }), 7);
});

ok('formulas: the variables they name, Greek by name or letter', () => {
  assert.deepEqual([...K.names(K.parse('a sin(bx) + μ + theta + pi + e'))].sort(), ['a', 'b', 'x', 'θ', 'μ'].sort());
  assert.deepEqual([...K.names(K.parse('gamma(x) + gamma'))].sort(), ['x', 'γ'].sort());
});

ok('formulas: mistakes said, with where', () => {
  const bad = { 'sin(': 'ends too soon', '2 +': 'ends too soon', 'x)': 'not expected', '\\foo x': 'not a function', 'log(1,2,3)': 'takes', '#': 'not part', '|x': 'not closed', '(x': 'not closed', 'x_': 'subscript' };
  for (const [t, m] of Object.entries(bad)) assert.throws(() => K.parse(t), (e) => e.message.includes(m) && typeof e.at === 'number', t);
});

ok('formulas: a stranger\'s are bounded (length, nesting, size): no runaway', () => {
  assert.throws(() => K.parse('x+'.repeat(200) + 'x'), /longer than/);
  assert.throws(() => K.parse('('.repeat(60) + 'x' + ')'.repeat(60)), /nests too deep/);
  assert.throws(() => K.parse('-'.repeat(100) + 'x'), /nests too deep/);
  // nothing in a formula is ever run as JavaScript
  for (const t of ['constructor', 'x.constructor', 'this', '__proto__', 'alert(1)', 'toString']) {
    let v;
    try { v = ev(t, { x: 1, c: 1, o: 1, n: 1, s: 1, t: 1, r: 1, u: 1, i: 1, h: 1, a: 1, l: 1, e: 1, p: 1, _: 1, g: 1 }); } catch (e) { v = 'refused'; }
    assert.ok(v === 'refused' || typeof v === 'number', t);
  }
});

ok('descriptions: normalised, every field capped, nonsense dropped', () => {
  const s = K.normalize({ kind: 'function', f: ['x', 'x^2', 'x^3', 'x^4', 'x^5'], sliders: Array.from({ length: 20 }, (_, k) => ({ name: 'a' + k, min: 0, max: 1, value: 9 })).concat([{ name: 'sin' }, { name: '<b>' }]), title: 'T'.repeat(500), aspect: 99, x: { min: 5, max: 1 } });
  assert.equal(s.f.length, 4);
  assert.equal(s.sliders.length, 8);
  assert.equal(s.sliders[0].value, 1);
  assert.equal(s.title.length, 200);
  assert.equal(s.aspect, 1.2);
  assert.deepEqual([s.x.min, s.x.max], [-5, 5]);
  assert.equal(K.normalize(null).kind, 'function');
  assert.equal(K.normalize({ kind: 'evil' }).kind, 'function');
  const d = K.normalize({ kind: 'data', data: { points: Array.from({ length: 5000 }, (_, k) => [k, k]).concat([['x', 1], [NaN, 2]]), fit: 'magic' } });
  assert.equal(d.data.points.length, 2000);
  assert.equal(d.data.fit, 'linear');
  const p = K.normalize({ kind: 'dist', dist: { family: '__proto__' } });
  assert.equal(p.dist.family, 'normal');
  assert.deepEqual(p.sliders.map((q) => q.name), ['μ', 'σ']);
});

ok('the widget\'s file: the description read back the same, the file the same bytes when written again', () => {
  for (const t of TEMPLATES) {
    const s = template(t.id), h = graphHtml(s);
    assert.ok(isGraph(h), t.id);
    assert.deepEqual(readGraph(h), s, t.id);
    assert.equal(graphHtml(readGraph(h)), h, t.id);
    assert.ok(sameGraph(readGraph(h), s));
    // one file, no request out: no src or href to anywhere, no import
    assert.ok(!/\b(src|href)\s*=|import\s*\(|fetch\(|XMLHttpRequest|WebSocket/.test(h.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '')), t.id);
  }
  // a description cannot end its script element early
  const h = graphHtml({ kind: 'function', f: ['x'], title: '</script><script>alert(1)</script>', x: { label: '</script>' } });
  assert.equal(h.split('</script>').length, 3);
  assert.equal(readGraph(h).x.label, '</script>');
  assert.ok(h.includes('<title>&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>'));
  assert.equal(readGraph('<html>no graph</html>'), null);
  assert.equal(readGraph(h.replace('"kind"', '"kind" oops')), null);
  assert.equal(isGraph('x'.repeat(5000) + h), false);
  assert.ok(!sameGraph(template('function'), { ...template('function'), f: ['x'] }));
});

ok('graphKit runs from its own text alone, as in a widget\'s frame', () => {
  const k2 = new Function('return (' + graphKit.toString() + ')()')();
  const s = template('function');
  assert.deepEqual(JSON.stringify(k2.compute(s, k2.defaults(s)).series[0].pts.slice(0, 5)), JSON.stringify(K.compute(s, K.defaults(s)).series[0].pts.slice(0, 5)));
});

ok('the templates draw: their sliders, their ranges, their series', () => {
  for (const t of TEMPLATES) {
    const s = template(t.id), R = K.ranges(s), d = K.compute(s, K.defaults(s));
    assert.ok(R.X[1] > R.X[0] && R.Y[1] > R.Y[0], t.id);
    assert.ok(d.series.length >= 1 && d.series.every((x) => x.pts.length > 0), t.id);
  }
  // a function's y range is from its values at the starting sliders; tan's poles do not set it
  const tan = K.ranges(K.normalize({ kind: 'function', f: ['tan(x)'], x: { min: -5, max: 5 } }));
  assert.ok(tan.Y[1] < 100 && tan.Y[0] > -100, JSON.stringify(tan));
  // the names a formula needs sliders for
  assert.deepEqual(K.unknownNames(K.normalize({ kind: 'function', f: ['a x^2 + b x + c'] })), ['a', 'b', 'c']);
  assert.deepEqual(K.unknownNames(K.normalize({ kind: 'curve', curve: { mode: 'polar', r: 'k θ' } })), ['k']);
  assert.throws(() => K.formulas(K.normalize({ kind: 'function', f: ['q x'] })), /No slider is called q/);
});

ok('fits: least squares lines and curves, their equations and R²', () => {
  const line = K.compute(K.normalize({ kind: 'data', data: { points: [[0, 1], [1, 3], [2, 5], [3, 7]], fit: 'linear' } }), {}).series[1];
  assert.equal(line.label, 'y = 2x + 1, R² = 1');
  const quad = K.compute(K.normalize({ kind: 'data', data: { points: [[-2, 4], [-1, 1], [0, 0], [1, 1], [2, 4], [3, 9]], fit: 'quadratic' } }), {}).series[1];
  assert.match(quad.label, /^y = 1x² [+−] 0x [+−] 0, R² = 1$/);
  const ex = K.compute(K.normalize({ kind: 'data', data: { points: [0, 1, 2, 3].map((x) => [x, 2 * Math.exp(0.5 * x)]), fit: 'exp' } }), {}).series[1];
  assert.equal(ex.label, 'y = 2 e^(0.5x), R² = 1');
  const pw = K.compute(K.normalize({ kind: 'data', data: { points: [1, 2, 3, 4].map((x) => [x, 3 * x * x]), fit: 'power' } }), {}).series[1];
  assert.equal(pw.label, 'y = 3 x^2, R² = 1');
  // too few points for the fit: no fit line, no error
  assert.equal(K.compute(K.normalize({ kind: 'data', data: { points: [[1, 1], [2, 2]], fit: 'cubic' } }), {}).series.length, 1);
});

ok('distributions: densities integrate to 1, discrete ones sum to 1; their sliders', () => {
  for (const [fam, F] of Object.entries(K.FAM)) {
    const s = K.normalize({ kind: 'dist', dist: { family: fam } });
    const P = K.defaults(s);
    let sum = 0;
    if (F.discrete) for (let k = 0; k <= 200; k++) sum += F.pdf(k, P);
    else { const a = fam === 'beta' ? 0 : -60, b = fam === 'beta' ? 1 : 60, N = 200000; for (let i = 0; i < N; i++) sum += F.pdf(a + (b - a) * (i + 0.5) / N, P) * (b - a) / N; }
    near(sum, 1, fam === 't' ? 2e-3 : 1e-3);
    assert.deepEqual(s.sliders.map((q) => q.name), F.p.map((q) => q[0]), fam);
  }
  assert.deepEqual(K.normalize({ kind: 'dist', dist: { family: 'binomial', mode: 'mean' } }).sliders.map((q) => q.name), ['n', 'p', 'N']);
});

ok('the mean of n draws: the CLT template is sample/widget\'s histogram, bin for bin', () => {
  // the hand written widget's own numbers (widgets/clt.html), run here as it runs in the frame
  const clt = fs.readFileSync(new URL('../sample/widget/widgets/clt.html', import.meta.url), 'utf8');
  const body = clt.slice(clt.indexOf('function mulberry32'), clt.indexOf('function draw()'));
  const ref = new Function('var REPS = 4000, LO = -4, HI = 4, BINS = 32;' + body + 'return histogram(4);')();
  const s = template('dist');
  assert.equal(s.dist.family, 'exponential');
  const bars = K.compute(s, K.defaults(s)).series[0].pts.map((p) => p[1]);
  assert.deepEqual(bars, ref);
});

ok('data pasted: CSV, tabs, spaces, decimal commas, a header', () => {
  assert.deepEqual(parseData('x,y\n1,2\n3 4\n5;6,5\n7\t8\n\nfoo bar\n−1 −2'), [[1, 2], [3, 4], [5, 6.5], [7, 8], [-1, -2]]);
  assert.deepEqual(parseData(dataText([[1, 2.5], [3, 4]])), [[1, 2.5], [3, 4]]);
  assert.equal(parseData('1 1\n'.repeat(3000)).length, 2000);
});

ok('rikuy.sty is sample/widget\'s, byte for byte', () => {
  assert.equal(RIKUY_STY, fs.readFileSync(new URL('../sample/widget/rikuy.sty', import.meta.url), 'utf8'));
});

console.log('insert:', n, 'groups passed');
