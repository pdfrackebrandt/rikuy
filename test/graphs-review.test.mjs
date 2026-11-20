// The hostile review of interactive graphs (docs/reviews/GRAPHS.md), its findings as checks that
// failed before their fixes: an economist's notation and pairs read as economists mean them,
// numbers printed without floating point noise, labels with $ in them, \log as the natural log,
// implicit curves broken at poles, areas as areas, crossings inside the range, equal axes where a
// circle or a 45 degree line is drawn, and the values a document gives taken from its math.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kit as K, graphPGF, template } from '../src/graph.js';
import { graphThis, paramValues } from '../src/graphthis.js';
import { sourceFiles, stripComments, plainOf } from '../src/webpage.js';
import { findProblems } from '../src/problems.js';
import { graphHtml } from '../src/graph.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const ev = (t, vars = {}, names = []) => {
  const slots = {}, env = [];
  Object.keys(vars).forEach((k, i) => { slots[k] = i; env.push(vars[k]); });
  return K.compile(K.parse(t, names), slots)(env);
};
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), a + ' != ' + b);
const marks = (spec, vals) => { const s = K.normalize(spec); return K.compute(s, vals || K.defaults(s)).series.filter((S) => S.kind === 'mark'); };
const inside = (spec) => { const s = K.normalize(spec), R = K.ranges(s); return marks(s).filter((m) => { const [x, y] = m.pts[0]; return x > R.X[0] + 1e-9 && x < R.X[1] - 1e-9 && y > R.Y[0] + 1e-9 && y < R.Y[1] - 1e-9; }); };

ok('H1: a supply and demand pair is two curves of the price, P up and Q across, their crossing marked', () => {
  for (const tex of ['Q_d = a - bP, \\quad Q_s = c + dP', 'q^d = a - b p, \\qquad q^s = c + d p']) {
    const r = graphThis(tex);
    assert.ok(r.spec, tex + ': ' + r.error);
    assert.equal(r.spec.kind, 'function', tex);
    assert.equal(r.spec.flip, true, tex);
    assert.equal(r.spec.vars[0].toLowerCase(), 'p', tex);
    const m = inside(r.spec);
    assert.equal(m.length, 1, tex + ': the equilibrium inside the plot');
    // [Q, P]: both curves give that Q at that P
    const s = K.normalize(r.spec), [q, p] = m[0].pts[0], v = K.defaults(s);
    const f = K.formulas(s).filter((x) => !x.shade);
    for (const g of f) { const slots = { [s.vars[0]]: 0 }; s.sliders.forEach((x, k) => { slots[x.name] = k + 1; }); near(K.compile(g.tree, slots)([p, ...s.sliders.map((x) => v[x.name])]), q, 1e-6); }
    // the legend names each curve by its own left side
    const lines = K.compute(s, v).series.filter((S) => S.kind === 'line');
    assert.deepEqual(lines.map((S) => S.label.split(' = ')[0]), tex.startsWith('Q') ? ['Q_d', 'Q_s'] : ['q^d', 'q^s']);
    assert.ok(/^\d/.test(r.what) || /against/.test(r.what), r.what);
  }
  // a coordinate pair, or a parameter called t, is still a parametric curve
  assert.equal(graphThis('x = \\cos t, \\quad y = \\sin t').spec.kind, 'curve');
  assert.equal(graphThis('x = a\\cos\\theta, \\quad y = b\\sin\\theta').spec.kind, 'curve');
});

ok('H2: no floating point noise in a label; every minus a minus sign', () => {
  const r = graphThis('\\dot k = s k^\\alpha - (n+\\delta)k');
  const m = marks(r.spec).map((S) => S.label);
  assert.ok(m.length >= 1 && m.every((t) => /^\(\d[\d.]*, 0\)$/.test(t)), m.join(' | '));
  const t = marks({ kind: 'function', f: ['tan(x)', '0'], cross: true, x: { min: -5, max: 5 } }).map((S) => S.label);
  assert.ok(t.includes('(0, 0)') && t.every((x) => !/e|-/.test(x)), t.join(' | '));
  assert.equal(K.fmt(-1.5e-7, 3), '−1.5e−7');
  assert.equal(K.fmt(5.55e-17, 3, 10), '0');
});

ok('H3: a $ in a label: math in $…$ as math, a lone $ a dollar sign, in the PDF\'s LaTeX', () => {
  const s = K.normalize({ kind: 'function', f: ['x'], x: { label: '$k_t$' }, y: { label: 'price ($)' } });
  assert.equal(s.x.label, 'k_t');
  assert.equal(K.labelTex('price ($)'), 'price (\\$)');
  assert.equal(K.labelTex(s.x.label), '$k_{t}$');
  const t = K.labelTex('x$1$ and a$b');
  assert.ok(!/\\1|\\k/.test(t) && (t.replace(/\\\$/g, '').match(/\$/g) || []).length % 2 === 0, t);
  assert.equal(K.labelTex('k′ and $'), '$k\'$ and \\$');
  const pgf = graphPGF(s, 600);
  assert.ok(pgf.includes('$k_{t}$') && pgf.includes('price (\\$)'), pgf.slice(0, 50));
});

ok('H4: \\log in a paper is the natural log; log typed alone keeps Desmos\'s base 10', () => {
  near(ev('\\log x', { x: Math.E }), 1);
  near(ev('\\log(x^2)', { x: Math.E }), 2);
  near(ev('\\log_{10} x', { x: 1000 }), 3);
  near(ev('\\log_2 x', { x: 8 }), 3);
  near(ev('log(100)'), 2);
  const r = graphThis('y = \\log x');
  assert.equal(r.spec.f[0], 'ln(x)');
  assert.ok(graphThis('\\dot k = s\\log k - \\delta k').spec);
});

ok('M7: an implicit curve is broken where its function is not continuous', () => {
  for (const eq of ['y = tan(x)', 'y = 1/x', '1/(x - 0.3) + 1/(y - 0.3) = 1']) {
    const s = K.normalize({ kind: 'implicit', vars: ['x', 'y'], eq: [eq], x: { min: -5, max: 5 }, y: { min: -5, max: 5 } });
    const S = K.compute(s, {}).series.find((x) => x.kind === 'segs');
    const F = K.formulas(s)[0], f = K.compile(F.tree, { x: 0, y: 1 });
    let bad = 0, all = 0;
    for (const l of S.lines) for (let i = 1; i < l.length; i++) { const x = (l[i][0] + l[i - 1][0]) / 2, y = (l[i][1] + l[i - 1][1]) / 2, v = f([x, y]); all++; if (!(Math.abs(v) < 2)) bad++; }
    assert.ok(all > 50 && bad === 0, eq + ': ' + bad + ' of ' + all + ' pieces across a pole');
  }
});

ok('M8: a shaded area is the area between the curves, and none across a pole', () => {
  const area = (f, from, to) => { const s = K.normalize({ kind: 'function', f: [f], shade: [{ a: 0, b: 'axis', from, to }], x: { min: -1, max: 7 } }); return K.compute(s, {}).series.find((S) => S.kind === 'fill'); };
  near(area('sin(x)', '0', '2 pi').area, 4, 1e-3);
  assert.match(area('sin(x)', '0', '2 pi').label, /^area = 4$/);
  near(area('ln(x)', '-1', '1').area, 1, 3e-3);
  const pole = area('1/x', '-1', '1');
  assert.ok(!pole || !Number.isFinite(pole.area), pole && pole.label);
  if (pole) assert.match(pole.label, /no area|not finite|pole/);
});

ok('M9: a linear supply and demand pair starts with its crossing inside the plot', () => {
  for (const tex of ['q = a - bp, \\quad q = c + dp', 'p = a - bq, \\quad p = c + dq']) {
    const r = graphThis(tex);
    assert.ok(r.spec, r.error);
    assert.equal(inside(r.spec).length, 1, tex);
  }
});

ok('M10: economists\' notation: superscripts that name, stars, bars, E, Φ, max, CRRA, many parameters', () => {
  const ph = graphThis('\\pi = \\pi^e - \\beta (u - u^*)');
  assert.ok(ph.spec, ph.error);
  assert.ok(ph.spec.sliders.some((q) => q.name === 'π^e') && ph.spec.sliders.some((q) => q.name === 'u^*'), JSON.stringify(ph.spec.sliders.map((q) => q.name)));
  assert.equal(ph.spec.vars[0], 'u');
  const tr = graphThis('i = r^* + \\pi + 0.5(\\pi - \\pi^*) + 0.5(y - y^*)');
  assert.ok(tr.spec, tr.error);
  const bar = graphThis('y = \\bar u + a x');
  assert.ok(bar.spec && bar.spec.sliders.some((q) => q.name === 'u^-'), bar.error || JSON.stringify(bar.spec.sliders));
  assert.ok(graphThis('\\pi_t = \\mathbb E_t \\pi + \\kappa x').spec);
  const pr = graphThis('P = \\Phi(\\beta x)');
  assert.ok(pr.spec && /normcdf/.test(pr.spec.f[0]), pr.error || pr.spec.f[0]);
  const mx = graphThis('y = \\max(x, 0)');
  assert.ok(mx.spec && /max\(x, 0\)/.test(mx.spec.f[0]), mx.error);
  assert.ok(graphThis('V = \\max_{c} u(c)').error);
  const crra = graphThis('u(c) = \\frac{c^{1-\\sigma} - 1}{1 - \\sigma}');
  assert.ok(crra.spec, crra.error);
  assert.notEqual(crra.spec.sliders.find((q) => q.name === 'σ').value, 1);
  const many = graphThis('y = a + b x + c x^2 + d x^3 + f x^4 + g x^5 + h x^6 + j x^7 + m x^8 + n x^9');
  assert.ok(many.spec || /parameters/.test(many.error), many.error);
  if (many.error) assert.ok(!/No slider/.test(many.error), many.error);
  // the language reads the names back, and the PDF writes them as superscripts
  near(ev('π^e + u^*', { 'π^e': 2, 'u^*': 3 }, ['π^e', 'u^*']), 5);
  assert.equal(K.nameTex('u^*'), 'u^{*}');
  assert.equal(K.nameTex('u^-'), '\\bar{u}');
});

ok('M11: the variable an economist means, and its range', () => {
  assert.equal(graphThis('q_1 = \\frac{a - c - q_2}{2}').spec.vars[0], 'q_2');
  assert.equal(graphThis('E = \\frac12 m v^2').spec.vars[0], 'v');
  const laffer = graphThis('R = \\tau (1 - \\tau)^{\\varepsilon}').spec;
  assert.equal(laffer.vars[0], 'τ');
  assert.deepEqual([laffer.x.min, laffer.x.max], [0, 1]);
  const lv = graphThis('\\dot x = \\alpha x - \\beta x y, \\quad \\dot y = \\delta x y - \\gamma y', { values: { 'α': 1, 'β': 0.1, 'γ': 1.5, 'δ': 0.075 } }).spec;
  assert.ok(lv.x.max > 20 && lv.y.max > 10 && lv.x.min >= 0, JSON.stringify([lv.x, lv.y]));
  // prose numbers are not parameters: only the document's math gives values
  const v = paramValues('We use n = 500 observations. With $\\alpha = 0.3$ and \\(s = 0.2\\), and \\[ \\delta = 0.05 \\]');
  assert.deepEqual(v, { 'α': 0.3, s: 0.2, 'δ': 0.05 });
  // (one pass: a hundred thousand unclosed environments read in well under a second)
  const t0 = performance.now();
  paramValues('\\begin{equation} x '.repeat(100000) + '\\( a '.repeat(100000));
  assert.ok(performance.now() - t0 < 400, 'read in ' + Math.round(performance.now() - t0) + ' ms');
});

ok('M14: equal axes where a circle or the 45 degree line is drawn', () => {
  const c = graphThis('x^2 + y^2 = r^2').spec;
  assert.equal(c.equal, true);
  assert.equal(K.ranges(K.normalize(c)).equal, true);
  const nx = graphThis('k_{t+1} = s k_t^{\\alpha} + (1 - \\delta) k_t').spec;
  assert.equal(nx.equal, true);
  // (at one scale the plot is widened from its corner: k_t from 0, never below)
  const R = K.ranges(K.normalize(nx));
  assert.ok(R.X[0] === 0 && R.Y[0] === 0, JSON.stringify(R));
});

ok('H6: the web page\'s link carries the main file and what it reads, not the project\'s other files', () => {
  const files = new Map([
    ['paper/main.tex', '\\documentclass{article}\n\\usepackage{rikuy,mine}\n% \\input{old}\n\\begin{document}\n\\input{sec/intro}\n\\include{appendix}\n\\rikuywidget{graphs/g.html}{graphs/g.pgf}\n\\bibliography{refs,more}\n\\end{document}\n'],
    ['paper/sec/intro.tex', 'Intro. \\input{sec/deeper.tex}'], ['paper/sec/deeper.tex', 'Deep.'], ['paper/appendix.tex', 'A.'],
    ['paper/graphs/g.html', '<!doctype html>'], ['paper/graphs/g.pgf', '% pgf'], ['paper/refs.bib', '@misc{a}'], ['paper/rikuy.sty', '% sty'], ['paper/mine.sty', '% mine'],
    ['paper/old.tex', 'old'], ['notes-private.txt', 'SECRET reviewer notes'], ['paper/draft.tex', 'draft'], ['paper/fig.png', new Uint8Array(1)]
  ]);
  const got = sourceFiles(files, 'paper/main.tex');
  assert.deepEqual(got.slice().sort(), ['paper/appendix.tex', 'paper/graphs/g.html', 'paper/graphs/g.pgf', 'paper/main.tex', 'paper/mine.sty', 'paper/refs.bib', 'paper/rikuy.sty', 'paper/sec/deeper.tex', 'paper/sec/intro.tex'].sort());
  assert.equal(got[0], 'paper/main.tex');
  // (a comment after text stays, the review's V1: it may be a URL's %20)
  assert.equal(stripComments('a % note to self\n% a whole line\n50\\% off\n% rikuy: words Rikuy\nb'), 'a % note to self\n50\\% off\n% rikuy: words Rikuy\nb');
});

ok('M15: a graph whose hand edited description no longer draws is a problem in its place', () => {
  const good = graphHtml({ kind: 'function', f: ['x'] });
  const bad = graphHtml({ kind: 'function', f: ['x +'] });
  const files = new Map([['main.tex', '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\n\\rikuywidget{graphs/a.html}{graphs/a.pgf}\n\n\\rikuywidget{graphs/b.html}{graphs/b.pgf}\n\\end{document}\n'], ['graphs/a.html', bad], ['graphs/b.html', good], ['rikuy.sty', '% sty']]);
  const P = findProblems({ files, main: 'main.tex', assets: [] }).filter((x) => /graph/.test(x.msg));
  assert.equal(P.length, 1, JSON.stringify(P));
  assert.ok(P[0].sev === 'error' && /graphs\/a\.html cannot be drawn/.test(P[0].msg) && P[0].line === 4, JSON.stringify(P[0]));
});

ok('Lows: the web page\'s title as plain text; plain words for \\ddot and an undefined function', () => {
  assert.equal(plainOf([{ t: 'Str', c: 'Supply' }, { t: 'Space' }, { t: 'Str', c: '&' }, { t: 'Space' }, { t: 'Emph', c: [{ t: 'Str', c: 'Demand:' }] }, { t: 'Space' }, { t: 'Math', c: [{ t: 'InlineMath' }, '\\alpha'] }]), 'Supply & Demand: α');
  assert.match(graphThis('\\ddot x = -\\omega^2 x').error, /second derivative/);
  assert.match(graphThis('M/P = L(Y, i)').error, /L\(…\) is a function/);
  assert.ok(graphThis('y = \\max(x, 0)').spec);
});

ok('V1 (High): removing comments keeps the source compiling: whole comment lines only, never in verbatim, never a .bib', () => {
  const tex = [
    '% a note to self',
    '  % indented note',
    'See \\url{https://example.org/a%20b} and \\href{https://x.org/?q=a%2Cb}{x}.',
    'Rate \\verb|x % 2| and 50\\% off. % trailing note stays',
    '\\begin{verbatim}',
    '% kept: verbatim',
    'a % b',
    '\\end{verbatim}',
    '\\begin{lstlisting}',
    '% code comment',
    '\\end{lstlisting}',
    '% rikuy: words Rikuy',
    'end'
  ].join('\n');
  assert.equal(stripComments(tex, 'main.tex'), [
    'See \\url{https://example.org/a%20b} and \\href{https://x.org/?q=a%2Cb}{x}.',
    'Rate \\verb|x % 2| and 50\\% off. % trailing note stays',
    '\\begin{verbatim}',
    '% kept: verbatim',
    'a % b',
    '\\end{verbatim}',
    '\\begin{lstlisting}',
    '% code comment',
    '\\end{lstlisting}',
    '% rikuy: words Rikuy',
    'end'
  ].join('\n'));
  const bib = '@article{a,\n  title = {A 5% rise},\n  url = {https://x.org/a%20b}\n}\n% a note\n';
  assert.equal(stripComments(bib, 'refs.bib'), bib);
});

ok('V2: equal axes widen the region the curves are worked out on, not the plot alone', () => {
  const s = K.normalize(graphThis('x_1^\\alpha x_2^{1-\\alpha} = \\bar u').spec);
  assert.equal(s.equal, true);
  const R = K.ranges(s);
  const W = 640, H = Math.round(W * s.aspect);
  const g = new Proxy({}, { get(o, k) { if (k === 'measureText') return (t) => ({ width: K.tw(t, 12) }); if (k === 'tex') return undefined; if (k in o) return o[k]; return () => {}; }, set(o, k, v) { o[k] = v; return true; } });
  const geo = K.paint(g, s, K.compute(s, K.defaults(s)), R, K.defaults(s), W, H, null, null);
  const r = K.region(s, geo);
  assert.ok(r.x.max >= geo.x1 - 1e-9 && r.y.max >= geo.y1 - 1e-9 && geo.x1 > s.x.max + 1, JSON.stringify([geo.x1, geo.y1, r.x, r.y]));
  const segs = K.compute(r, K.defaults(r)).series.find((S) => S.kind === 'segs');
  const far = Math.max(...segs.lines.flat().map((p) => p[0]));
  assert.ok(far > s.x.max + 1, 'the curve reaches ' + far + ', the plot ' + geo.x1);
});

ok('V3: a pair with different left sides (IS and LM, two best responses) has its crossing marked, on a range that holds it', () => {
  for (const [tex, at] of [['Y = A - b r, \\quad r = c Y - d', null], ['q_1 = \\frac{a - c - q_2}{2}, \\quad q_2 = \\frac{a - c - q_1}{2}', null]]) {
    const r = graphThis(tex);
    assert.ok(r.spec, tex + ': ' + r.error);
    const s = K.normalize(r.spec), m = K.compute(s, K.defaults(s)).series.filter((S) => S.kind === 'mark');
    assert.equal(m.length, 1, tex + ': ' + m.length + ' marks');
    const [x, y] = m[0].pts[0];
    assert.ok(x > s.x.min && x < s.x.max && y > s.y.min && y < s.y.max && s.x.min >= 0, tex + ' ' + JSON.stringify([x, y, s.x, s.y]));
    // on both curves
    for (const F of K.formulas(s)) { const slots = { [s.vars[0]]: 0, [s.vars[1]]: 1 }; s.sliders.forEach((q, k) => { slots[q.name] = k + 2; }); const v = K.compile(F.tree, slots)([x, y, ...s.sliders.map((q) => q.value)]); assert.ok(Math.abs(v) < 1e-6, tex + ' ' + v); }
  }
});

ok('V4 and V5: the cheaper leftovers', () => {
  assert.ok(graphThis('\\pi_t = \\pi^e_t - \\beta (u_t - u^*)').spec, graphThis('\\pi_t = \\pi^e_t - \\beta (u_t - u^*)').error);
  const ar = graphThis('y_t = \\rho y_{t-1} + \\varepsilon_t');
  assert.ok(ar.spec && ar.spec.equal && ar.spec.f[1] === 'y_t', ar.error || JSON.stringify(ar.spec.f));
  assert.ok(graphThis('y = \\max\\{x - K, 0\\}').spec, graphThis('y = \\max\\{x - K, 0\\}').error);
  const pw = graphThis('y = x^d');
  assert.ok(pw.spec && pw.spec.sliders.some((q) => q.name === 'd') && pw.spec.vars[0] === 'x', JSON.stringify(pw.spec || pw.error));
  assert.equal(graphThis('\\pi = \\pi^e - \\beta (u - u^*)').spec.vars[0], 'u');
  assert.equal(graphThis('i_t = r^* + \\pi_t + 0.5 (\\pi_t - \\pi^*) + 0.5 y_t').spec.vars[0], 'π_t');
  assert.ok(/normpdf/.test(graphThis('y = \\phi(x)').spec.f[0]));
  const files = new Map([['main.tex', '\\input chap1\n\\import{parts/}{intro}\n\\lstinputlisting{code/run.py}\n'], ['chap1.tex', 'x'], ['parts/intro.tex', 'y'], ['code/run.py', 'print(1)']]);
  assert.deepEqual(sourceFiles(files, 'main.tex').sort(), ['chap1.tex', 'code/run.py', 'main.tex', 'parts/intro.tex']);
  assert.equal(K.normalize({ kind: 'function', f: ['x'], y: { label: 'a 5\\% rise' } }).y.label, 'a 5% rise');
  const sd = graphThis('q = a - bp, \\quad q = c + dp').spec;
  assert.ok(sd.sliders.every((q) => q.value < q.max), JSON.stringify(sd.sliders));
  const qd = K.seriesRuns({ tx: ['fn', 'Q_d', 'a - b P'], label: '' }, K.normalize({ kind: 'function', vars: ['P'], f: ['a - b P'], sliders: [{ name: 'a' }, { name: 'b' }] }));
  assert.ok(!qd.some((r) => r[0] === '_'), JSON.stringify(qd.slice(0, 3)));
});

ok('M12: the opening document\'s Bellman equation is the one its saving rule solves, its 45 degree line at 45 degrees', () => {
  const saving = K.normalize(JSON.parse(fs.readFileSync(new URL('../sample/graphs/saving.json', import.meta.url), 'utf8')));
  assert.equal(K.ranges(saving).equal, true);
  const main = fs.readFileSync(new URL('../sample/main.tex', import.meta.url), 'utf8');
  assert.ok(/c \\in \[0, *f\(k\)\]/.test(main) && /full depreciation/.test(main));
});

console.log('graphs review: ' + n + ' groups passed');
