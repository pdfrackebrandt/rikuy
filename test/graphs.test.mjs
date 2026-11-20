// Interactive graphs as an edge (PLAN.md task 70), the pure parts: equations' LaTeX read into the
// formula language and written back (the text reads back to the same values, LaTeX for the PDF),
// Graph this choosing the kind, the variable and the sliders, the new kinds (implicit curves,
// phase portraits, shaded areas, crossings) against their known answers, the PDF's picture as PGF
// (ASCII, balanced, its coordinates inside TeX's lengths, its mark read back), rikuy.sty's
// versions, and the web page's writer escaping what a document says.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kit as K, graphKit, graphPGF, pgfMark, specHash, summary, template, TEMPLATES, GALLERY, graphHtml, readGraph, RIKUY_STY, RIKUY_STY_V10, styDrawsPgf } from '../src/graph.js';
import { graphThis, paramValues } from '../src/graphthis.js';
import { HtmlWriter } from '../src/webpage.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const ev = (t, vars = {}, names = []) => {
  const slots = {}, env = [];
  Object.keys(vars).forEach((k, i) => { slots[k] = i; env.push(vars[k]); });
  return K.compile(K.parse(t, names), slots)(env);
};
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), a + ' != ' + b);

ok('LaTeX as papers write it: fractions, roots, powers, subscripts, Greek, sizes and spacing', () => {
  near(ev('\\frac{1}{2}x', { x: 4 }), 2);
  near(ev('\\dfrac{a}{1+x^{2}}', { a: 2, x: 1 }), 1);
  near(ev('\\tfrac12 x', { x: 3 }), 1.5);
  near(ev('\\sqrt{x}', { x: 9 }), 3);
  near(ev('\\sqrt[3]{x}', { x: -27 }), -3);
  near(ev('\\sqrt[n]{x}', { x: 16, n: 4 }), 2);
  near(ev('s k^{\\alpha}', { s: 0.3, k: 4, 'α': 0.5 }), 0.6);
  near(ev('k_t^{\\alpha}', { k_t: 9, 'α': 0.5 }), 3);
  near(ev('\\ln x + \\exp(x)', { x: 1 }), Math.E);
  near(ev('\\mathrm{e}^{-x}', { x: 2 }), Math.exp(-2));
  near(ev('\\left( 1 + \\frac{r}{n} \\right)^{n t}', { r: 0.05, n: 12, t: 2 }), Math.pow(1 + 0.05 / 12, 24));
  near(ev('\\alpha\\beta k', { 'α': 2, 'β': 3, k: 4 }), 24);
  near(ev('2\\pi r', { r: 1 }), 2 * Math.PI);
  near(ev('\\Delta x \\cdot y', { 'Δ': 2, x: 3, y: 4 }), 24);
  near(ev('\\lvert x \\rvert + \\left| y \\right|', { x: -2, y: -3 }), 5);
  near(ev('\\bigl( x + 1 \\bigr) \\cdot 2', { x: 1 }), 4);
  near(ev('\\operatorname{sgn}(x) \\, x', { x: -3 }), 3);
  near(ev('x \\leq 1', { x: 0 }), 1);
  assert.throws(() => K.parse('\\sum_{i=1}^n x_i', []), /not a function this graph knows|subscript/);
  assert.throws(() => K.parse('\\sqrt[3]', []), /closed|needs/);
});

// formulas written back as text and as LaTeX: the text reads back to the same values
const FORMULAS = ['s k^α - (n + δ) k', '(a - (1 - c) Y)/b', '1/(σ sqrt(2π)) e^(-(x - μ)^2/(2σ^2))', 'x^(1/3) - sin(x)^2', '-x^2 + 2x - 1', 'a/(b c) + (a/b) c', '2^3^2', '(-2)^x', 'abs(x - 1) + max(x, 0)',
  'e^-x', 'sin^2 x + cos x', 'x!', 'root(x, 3)', 'if(x < 0, 0, x)', '-(x + 1)', 'x - (y - z)', 'x / y / z', 'x^y^z', 'a b c', '3 2', 'k^α^2', '2·x', '-x^-2'];
ok('a formula written out as text reads back to the same values; as LaTeX it is LaTeX the parser reads too', () => {
  const vals = { x: 0.7, y: 1.3, z: 2.1, a: 1.5, b: 0.4, c: 0.6, k: 2.2, s: 0.3, n: 0.02, 'δ': 0.08, 'α': 0.33, Y: 3, 'σ': 1.2, 'μ': 0.1 };
  const names = Object.keys(vals);
  for (const f of FORMULAS) {
    const t = K.parse(f, names), back = K.show(t, false), tex = K.show(t, true);
    const e1 = ev(f, vals, names), e2 = ev(back, vals, names), e3 = ev(tex, vals, names);
    if (Number.isFinite(e1)) { near(e2, e1, 1e-12); near(e3, e1, 1e-12); }
    assert.equal(K.show(K.parse(back, names), false), back, f + ' -> ' + back);
  }
  // random trees, written out and read back
  let seed = 7;
  const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const gen = (d) => {
    if (d <= 0 || r() < 0.25) return r() < 0.5 ? ['n', Math.round(r() * 50) / 10] : ['v', ['x', 'y', 'a', 'α'][Math.floor(r() * 4)]];
    const k = r();
    if (k < 0.12) return ['neg', gen(d - 1)];
    if (k < 0.25) return ['f', ['sin', 'exp', 'sqrt', 'abs', 'ln'][Math.floor(r() * 5)], [gen(d - 1)]];
    return [['+', '-', '*', '/', '^'][Math.floor(r() * 5)], gen(d - 1), gen(d - 1)];
  };
  const slots = { x: 0, y: 1, a: 2, 'α': 3 }, env = [0.37, 1.21, 0.83, 0.44];
  for (let i = 0; i < 2000; i++) {
    const t = gen(4), v = K.compile(t, slots)(env), back = K.show(t, false);
    const w = K.compile(K.parse(back, ['a']), slots)(env), w2 = K.compile(K.parse(K.show(t, true), ['a']), slots)(env);
    if (Number.isFinite(v)) { assert.ok(Math.abs(w - v) <= 1e-9 * Math.max(1, Math.abs(v)), back + ': ' + w + ' != ' + v); assert.ok(Math.abs(w2 - v) <= 1e-9 * Math.max(1, Math.abs(v)), K.show(t, true)); }
  }
});

const gt = (tex, values) => graphThis(tex, { values });
ok('Graph this: the kind, the variable and the sliders from the equation', () => {
  let r = gt('y = A k^{\\alpha}');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.vars, ['k']); assert.deepEqual(r.spec.f, ['A k^α']);
  assert.deepEqual(r.spec.sliders.map((q) => q.name), ['A', 'α']); assert.deepEqual([r.spec.x.min, r.spec.x.max], [0, 10]);
  assert.deepEqual([r.spec.sliders[1].min, r.spec.sliders[1].max, r.spec.sliders[1].value], [0, 1, 0.33]);
  r = gt('f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.vars, ['x']); assert.equal(r.spec.y.label, 'f(x)'); assert.deepEqual([r.spec.x.min, r.spec.x.max], [-5, 5]);
  near(K.compute(r.spec, K.defaults(r.spec)).series[0].pts[300][1], 1 / Math.sqrt(2 * Math.PI), 1e-9);
  r = gt('e^{-x^2/2}');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.vars, ['x']);
  r = gt('x = \\cos(a t), \\quad y = \\sin(b t)');
  assert.equal(r.spec.kind, 'curve'); assert.equal(r.spec.curve.mode, 'parametric'); assert.equal(r.spec.curve.x, 'cos(a t)'); assert.deepEqual(r.spec.sliders.map((q) => q.name), ['a', 'b']);
  r = gt('x = r\\cos\\theta, y = r\\sin\\theta');
  assert.equal(r.spec.kind, 'curve'); assert.equal(r.spec.curve.y, 'r sin(t)');
  r = gt('x^{\\alpha} y^{1-\\alpha} = u');
  assert.equal(r.spec.kind, 'implicit'); assert.deepEqual(r.spec.vars, ['x', 'y']); assert.deepEqual([r.spec.x.min, r.spec.y.min], [0, 0]);
  r = gt('x^2 + y^2 = r^2');
  assert.equal(r.spec.kind, 'implicit'); assert.deepEqual([r.spec.x.min, r.spec.x.max], [-5, 5]);
  assert.equal(r.spec.sliders[0].value, 1, 'r is a radius here, not a rate');
  r = gt('\\dot{k} = s k^{\\alpha} - (n + \\delta) k');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.vars, ['k']); assert.deepEqual(r.spec.f, ['s k^α - (n + δ) k', '0']); assert.deepEqual(r.spec.cross, [[0, 1]]);
  const marks = K.compute(r.spec, K.defaults(r.spec)).series.filter((S) => S.kind === 'mark');
  near(marks[0].pts[0][0], Math.pow(0.2 / 0.07, 1 / (1 - 0.33)), 1e-6);
  r = gt('k_{t+1} = s A k_t^{\\alpha} + (1-\\delta) k_t');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.vars, ['k_t']); assert.deepEqual(r.spec.f[1], 'k_t');
  r = gt('\\dot{k} = k^{\\alpha} - \\delta k - c \\\\ \\dot{c} = \\frac{c}{\\theta}\\left(\\alpha k^{\\alpha-1} - \\delta - \\rho\\right)');
  assert.equal(r.spec.kind, 'phase'); assert.deepEqual(r.spec.vars, ['k', 'c']);
  // (the plot is round the rest point: k* = (α/(δ+ρ))^(1/(1-α)))
  const ks = Math.pow(0.33 / 0.08, 1 / 0.67);
  assert.ok(r.spec.x.max > ks && r.spec.x.max < 3 * ks, r.spec.x.max);
  r = gt('\\frac{dx}{dt} = a x - b x y, \\quad \\frac{dy}{dt} = d x y - c y');
  assert.equal(r.spec.kind, 'phase'); assert.deepEqual(r.spec.vars, ['x', 'y']);
  r = gt('p = a - b q, \\quad p = c + d q');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.vars, ['q']); assert.equal(r.spec.cross, true); assert.equal(r.spec.y.label, 'p');
  r = gt('r = \\frac{A - (1-c)Y}{b} \\\\ r = \\frac{kY - m}{h}');
  assert.deepEqual(r.spec.vars, ['Y'], 'the variable both curves share');
  r = gt('\\begin{aligned} y &= x^2 \\label{eq:a} \\end{aligned}');
  assert.equal(r.spec.kind, 'function'); assert.deepEqual(r.spec.f, ['x^2']);
  // what cannot be drawn is said
  assert.match(gt('V(k) = \\max_{c \\in [0,k]} \\bigl\\{ u(c) + \\beta\\, V\\bigl(f(k) - c\\bigr) \\bigr\\}').error, /\\max/);
  assert.match(gt('\\sum_{i=1}^n x_i').error, /\\sum/);
  assert.match(gt('V(k) = u(k) + \\beta V(k)').error, /both sides/);
  assert.ok(gt('').error);
  assert.ok(gt('a = b = c').error);
});

ok('Graph this: values the document gives its letters start their sliders', () => {
  const v = paramValues('We set $\\alpha = 0.3$, $\\beta=0.96$ and s = 0.25. Then x = 2y is no value, nor is $k_t = 3k$; $\\delta = 0.1$.');
  // (s = 0.25 in the prose is not read: the review found "n = 500 observations" taken for n)
  assert.deepEqual(v, { 'α': 0.3, 'β': 0.96, 'δ': 0.1 });
  const r = gt('y = s k^{\\alpha}', { 'α': 0.3, s: 0.25 });
  assert.deepEqual(r.spec.sliders.map((q) => [q.name, q.value]), [['s', 0.25], ['α', 0.3]]);
  // a value outside the letter's usual range widens the range round it
  const r2 = gt('y = a x', { a: 40 });
  assert.deepEqual([r2.spec.sliders[0].min, r2.spec.sliders[0].max, r2.spec.sliders[0].value], [0, 100, 40]);
  // bounded on a long document, and on a run of digits (the security audit: the old pattern tried
  // every split of them, and Graph this on such a document hung the page)
  assert.ok(Object.keys(paramValues('$a = 1$ '.repeat(100000))).length === 1);
  const t0 = performance.now();
  paramValues('\\[a = ' + '1'.repeat(200000) + 'x b = .' + '2'.repeat(100000) + 'y\\]');
  paramValues('$a = ' + '1'.repeat(1500) + 'x b = .' + '2'.repeat(400) + 'y$'.repeat(300));
  assert.ok(performance.now() - t0 < 300, 'digits read in ' + (performance.now() - t0) + ' ms');
});

ok('implicit curves: the contour lies on the curve, joined into lines, capped', () => {
  const s = K.normalize({ kind: 'implicit', eq: ['x^2 + y^2 = r^2'], sliders: [{ name: 'r', min: 0, max: 4, value: 2 }] });
  const S = K.compute(s, K.defaults(s)).series[0];
  assert.equal(S.kind, 'segs');
  const pts = S.lines.flat();
  assert.ok(pts.length > 100 && S.lines.length === 1, S.lines.length);
  for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x, y) - 2) < 0.02, x + ',' + y);
  // two equations, each its own colour; a stranger's description capped
  const b = template('budget'), d = K.compute(b, K.defaults(b)).series;
  assert.equal(d.length, 2);
  // the budget line p1 x1 + p2 x2 = m at p = 1, m = 10: x1 + x2 = 10
  for (const [x, y] of d[0].lines.flat()) assert.ok(Math.abs(x + y - 10) < 1e-6);
  const big = K.normalize({ kind: 'implicit', eq: Array(9).fill('x = y'), vars: ['x', 'x'] });
  assert.equal(big.eq.length, 4); assert.deepEqual(big.vars, ['x', 'y']);
});

ok('phase portraits: field, nullclines, a path from the start that keeps the Ramsey rest point a saddle', () => {
  const s = template('ramsey'), d = K.compute(s, K.defaults(s)).series;
  assert.deepEqual(d.map((S) => S.kind), ['arrows', 'segs', 'segs', 'line', 'start']);
  // the k nullcline is c = k^α - δk
  // (away from k = 0, where k^α is steeper than a grid cell sees)
  for (const [k, c] of d[1].lines.flat().filter(([k, c]) => c > 0.05 && k > 1)) assert.ok(Math.abs(c - (Math.pow(k, 0.33) - 0.05 * k)) < 0.02, k + ',' + c);
  // the c nullcline's vertical part is at k* = (α/(δ+ρ))^(1/(1-α))
  const ks = Math.pow(0.33 / 0.08, 1 / 0.67);
  assert.ok(d[2].lines.flat().some(([k, c]) => c > 0.5 && Math.abs(k - ks) < 0.15), ks);
  // the path leaves the start point and stays finite
  assert.deepEqual(d[3].pts[0], s.phase.start);
  assert.ok(d[3].pts.length > 20 && d[3].pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  // a dragged start (vals.__start) moves only the path
  const e = K.compute(s, { ...K.defaults(s), __start: [10, 1] }).series;
  assert.deepEqual(e[3].pts[0], [10, 1]);
  assert.equal(e[1], d[1], 'the nullclines are kept while only the start moves');
  // no trajectory where the start is none
  assert.ok(!K.compute(K.normalize({ ...s, phase: { ...s.phase, start: null } }), K.defaults(s)).series.some((S) => S.traj));
});

ok('functions: where curves cross, the areas between them, the faint start curves', () => {
  const s = template('supply-demand'), d = K.compute(s, K.defaults(s)).series;
  const mark = d.find((S) => S.kind === 'mark'), fills = d.filter((S) => S.kind === 'fill');
  assert.deepEqual(mark.pts[0].map((v) => Math.round(v * 1e9) / 1e9), [4, 6]);
  assert.deepEqual(fills.map((S) => Math.round(S.area * 1e6) / 1e6), [8, 8]);
  assert.equal(fills[0].label, 'consumer surplus = 8');
  // a shade from a slider's formula to a number, under one curve to the axis: an integral
  const f = K.normalize({ kind: 'function', f: ['x^2'], shade: [{ a: 0, b: 'axis', from: '0', to: 'u' }], x: { min: -1, max: 2 }, sliders: [{ name: 'u', min: 0, max: 2, value: 1.5 }] });
  near(K.compute(f, K.defaults(f)).series.find((S) => S.kind === 'fill').area, 1.125, 1e-4);
  // Solow: the steady state where saving meets break even investment, and only there
  const so = template('solow'), m = K.compute(so, K.defaults(so)).series.filter((S) => S.kind === 'mark');
  assert.equal(m.length, 1);
  near(m[0].pts[0][0], Math.pow(0.3 / 0.1, 1 / 0.67), 1e-6);
  // tan x against 0: crossings at its zeros, none at its poles
  const t = K.normalize({ kind: 'function', f: ['tan(x)', '0'], cross: true, x: { min: -4, max: 4 } });
  const xs = K.compute(t, K.defaults(t)).series.filter((S) => S.kind === 'mark').map((S) => Math.round(S.pts[0][0] * 1e6) / 1e6 + 0);
  assert.deepEqual(xs, [-Math.PI, 0, Math.PI].map((v) => Math.round(v * 1e6) / 1e6));
  // faint curves at the start values: on by default, kept in the file, off by choice
  assert.equal(s.ghost, true);
  assert.equal(K.normalize({ ...s, ghost: false }).ghost, false);
});

ok('every template and named graph reads back from its file and draws; graphKit runs on its own text', () => {
  const k2 = new Function('return (' + graphKit.toString() + ')()')();
  for (const t of TEMPLATES.concat(GALLERY)) {
    const s = template(t.id), h = graphHtml(s);
    assert.deepEqual(readGraph(h), s, t.id);
    K.formulas(s);
    const d = K.compute(s, K.defaults(s)), d2 = k2.compute(k2.normalize(s), k2.defaults(s));
    assert.equal(JSON.stringify(d.series.map((S) => S.kind)), JSON.stringify(d2.series.map((S) => S.kind)), t.id);
    assert.ok(d.series.length, t.id);
  }
});

ok('the PDF\'s picture as PGF: ASCII TeX, balanced, inside TeX\'s lengths, marked, the type in math where it is math', () => {
  for (const t of TEMPLATES.concat(GALLERY)) {
    const s = template(t.id), p = graphPGF(s, 460, 'graphs/' + t.id + '.html');
    const body = p.split('\n').filter((l) => !l.startsWith('%')).join('\n');
    assert.ok(/^[\x09\x0a\x20-\x7e]*$/.test(body), t.id + ': ASCII');
    const m = pgfMark(p);
    assert.deepEqual(m, { path: 'graphs/' + t.id + '.html', hash: specHash(s), W: 460 }, t.id);
    let depth = 0;
    for (const c of body.replace(/\\[{}%$]/g, '')) { if (c === '{') depth++; if (c === '}') depth--; assert.ok(depth >= 0, t.id); }
    assert.equal(depth, 0, t.id);
    assert.equal((body.match(/\\begin\{pgfscope\}/g) || []).length, (body.match(/\\end\{pgfscope\}/g) || []).length, t.id);
    assert.equal((body.match(/\$/g) || []).length % 2, 0, t.id + ': math closed');
    // every coordinate a fraction of the width TeX can hold (16383 pt at most)
    for (const x of body.matchAll(/\\rk[ml] (-?[\d.]+) (-?[\d.]+) /g)) assert.ok(Math.abs(+x[1]) <= 3 && Math.abs(+x[2]) <= 3, t.id + ' ' + x[0]);
    assert.ok(/\\definecolor\{rkc[a-z]+\d*\}\{rgb\}/.test(body) && body.includes('\\begin{pgfpicture}') && body.endsWith('\\endgroup%\n'), t.id);
  }
  // a stranger's noisy equations: a bounded drawing (20000 pieces) and a bounded file (the audit)
  const noisy = K.normalize({ kind: 'implicit', eq: Array(4).fill('sin(40x) sin(40y) + sin(37x y) - 0.01'), aspect: 1.2 });
  assert.ok(K.compute(noisy, {}).series.reduce((n, S) => n + S.lines.reduce((m, l) => m + l.length - 1, 0), 0) <= 20000);
  const big = graphPGF(noisy, 1200, 'graphs/n.html');
  assert.ok(big.length < 900000 && big.endsWith('\\endgroup%\n'), big.length);
  // a curve running off to infinity is cut where it leaves, not drawn past TeX's largest length
  const tan = graphPGF(K.normalize({ kind: 'function', f: ['tan(x)', '1/x'], x: { min: -5, max: 5 }, y: { min: -3, max: 3 } }), 460);
  for (const x of tan.matchAll(/\\rk[ml] (-?[\d.]+) (-?[\d.]+) /g)) assert.ok(Math.abs(+x[1]) <= 3 && Math.abs(+x[2]) <= 3, x[0]);
  // labels: Greek and names as math, the legend's formula as LaTeX, a stranger's text escaped
  const so = graphPGF(template('solow'), 460);
  assert.ok(so.includes('$\\alpha = 0.33$') && so.includes('$y = s k^{\\alpha}$'), so.slice(0, 200));
  const evil = graphPGF(K.normalize({ kind: 'function', f: ['x'], x: { label: '}\\input{/etc/passwd}{' }, y: { label: '$\\write18{rm}$ % 100 & #' } }), 460);
  assert.ok(!evil.includes('\\input{/etc') && !evil.includes('\\write18') && evil.includes('\\textbackslash{}input') && evil.includes('\\%') && evil.includes('\\&') && evil.includes('\\#'));
  // the mark: another description, another hash; no mark on someone else's file
  assert.notEqual(specHash(template('solow')), specHash({ ...template('solow'), f: ['k'] }));
  assert.equal(pgfMark('\\begin{pgfpicture}'), null);
  assert.equal(pgfMark('% rikuy-graph: graphs/a.html zz 5\n'), null);
  // the comment says what the graph is, ASCII
  assert.match(summary(template('solow')), /^y = k\^α; y = s k\^α; y = \(n \+ δ\) k for k from 0 to 12; s = 0\.3/);
});

ok('rikuy.sty: v1.1 draws .pgf pictures; Rikuy\'s own v1.0 is known (and renewed), one\'s own is left', () => {
  assert.ok(styDrawsPgf(RIKUY_STY));
  assert.match(RIKUY_STY, /\\ProvidesPackage\{rikuy\}\[2026\/11\/20 v1\.1/);
  assert.match(RIKUY_STY, /AddToHook\{begindocument\/before\}\{\\RequirePackage\{pgf\}\}/);
  const v10 = '% rikuy.sty\n\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesPackage{rikuy}[2026/10/30 v1.0 Live figures in Rikuy, pictures in print]\n\\RequirePackage{graphicx}\n% robust, so that it survives a moving argument as \\includegraphics does\n\\DeclareRobustCommand\\rikuywidget[3][]{\\includegraphics[#1]{#3}}\n\\endinput\n';
  assert.ok(RIKUY_STY_V10.test(v10) && !styDrawsPgf(v10));
  assert.ok(!RIKUY_STY_V10.test(v10.replace('\\endinput', '\\def\\mine{}\n\\endinput')));
  assert.equal(fs.readFileSync(new URL('../sample/widget/rikuy.sty', import.meta.url), 'utf8'), RIKUY_STY);
});

ok('the web page\'s writer: the document\'s words as text, links only to the web, pictures only from inside', () => {
  const katex = { renderToString: (t, o) => '<span class="katex">' + t.replace(/</g, '&lt;') + (o.displayMode ? ' D' : '') + '</span>' };
  const w = new HtmlWriter({ katex, graphs: new Map(), images: new Map([['a.png', 'data:image/png;base64,AAAA']]) });
  const S = (t) => ({ t: 'Str', c: t });
  const html = w.blocks([
    { t: 'Header', c: [1, ['sec:x', [], []], [S('1 Intro <script>')]] },
    { t: 'Para', c: [S('a<b>&"'), { t: 'Space' }, { t: 'Link', c: [['', [], []], [S('bad')], ['javascript:alert(1)', '']] }, { t: 'Link', c: [['', [], []], [S('ok')], ['https://example.org/?a=1&b=2', '']] }, { t: 'Math', c: [{ t: 'InlineMath' }, 'x<y'] }, { t: 'RawInline', c: ['html', '<img src=x onerror=alert(1)>'] }, { t: 'Note', c: [{ t: 'Para', c: [S('note')] }] }] },
    { t: 'Para', c: [{ t: 'Math', c: [{ t: 'DisplayMath' }, 'E=mc^2'] }] },
    { t: 'Para', c: [{ t: 'Image', c: [['', [], [['width', '50%']]], [S('alt "q"')], ['a.png', '']] }, { t: 'Image', c: [['', [], [['width', 'expression(alert(1))']]], [], ['http://evil.example/x.png', '']] }] },
    { t: 'RawBlock', c: ['html', '<script>alert(1)</script>'] },
    { t: 'Div', c: [['', [], [['custom-style', 'Image Caption']]], [{ t: 'Para', c: [S('Figure 1: cap')] }]] }
  ]) + w.notesOut();
  assert.ok(html.includes('<h2 id="sec:x">1 Intro &lt;script&gt;</h2>'));
  assert.ok(html.includes('a&lt;b&gt;&amp;&quot;'));
  assert.ok(!/javascript:|<script|onerror|src="http|expression\(/.test(html), html);
  assert.ok(html.includes('<a href="https://example.org/?a=1&amp;b=2" rel="noopener noreferrer">ok</a>'));
  assert.ok(html.includes('<div class="eq"><span class="katex">E=mc^2 D</span></div>'));
  assert.ok(html.includes('<img src="data:image/png;base64,AAAA" alt="alt &quot;q&quot;" style="width:50%">'));
  assert.ok(html.includes('<span class="missing">[http://evil.example/x.png]</span>'));
  assert.ok(html.includes('<sup class="fn" id="fnref1"><a href="#fn1">1</a></sup>') && html.includes('<li id="fn1"><p>note <a href="#fnref1"'));
  assert.ok(html.includes('<div class="caption">Figure 1: cap</div>'));
  // a graph: its frame sandboxed to scripts, its document Rikuy's drawing of the description
  const s = template('solow');
  const g = new HtmlWriter({ katex, graphs: new Map([['g.pgf', { path: 'g.html', spec: s }]]), images: new Map() }).inline({ t: 'Image', c: [['', [], []], [], ['g.pgf', '']] });
  assert.ok(g.startsWith('<iframe class="rk-graph" sandbox="allow-scripts" referrerpolicy="no-referrer"') && g.includes('srcdoc="&lt;!doctype html&gt;'));
  assert.ok(!/srcdoc="[^"]*"[^>]*"/.test(g.replace(/srcdoc="[^"]*"/, '')));
});

console.log('graphs: ' + n + ' groups passed');
