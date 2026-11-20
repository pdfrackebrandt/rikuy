// Graph this: an equation of the document drawn as a live graph below it (the right click menu,
// the Equation tab, the search box). Its LaTeX is read into the graph's formula language: y = f(x)
// and f(x) alone become a function of the letter that reads as the variable (x, else t, k, q...),
// a pair x = g(t), y = h(t) a parametric curve, F(x, y) = c an implicit curve (an indifference
// curve, an isoquant), a pair of time derivatives (\dot k = ..., \dot c = ...) a phase portrait,
// and \dot k = f(k) alone the rate against k with its rest points marked. Every other letter
// gets a slider, its range from the letter's usual role (α a share, δ a depreciation rate, β a
// discount factor) and from a value the document gives it ("with α = 0.3"). Pure: strings in,
// a graph's description out (test/graphs.test.mjs).
import { kit as K } from './graph.js';

// a variable's name in LaTeX, as the formula language names it: \alpha is α, x_{1} is x_1
const NAME_TEX = '(?:\\\\[A-Za-z]+|[A-Za-z])(?:_\\{?[A-Za-z0-9]{1,8}\\}?)?';
function nameOf(tex) {
  const m = /^\s*(\\[A-Za-z]+|[A-Za-z])(?:_\{?([A-Za-z0-9]{1,8})\}?)?\s*$/.exec(tex);
  if (!m) return null;
  const b = m[1][0] === '\\' ? K.GREEK[m[1].slice(1)] : m[1];
  return b ? b + (m[2] ? '_' + m[2] : '') : null;
}

// The letters' usual roles in economics and statistics: [start, from, to]
const ROLE = {
  α: [0.33, 0, 1], β: [0.95, 0, 1], γ: [2, 0, 5], δ: [0.05, 0, 0.3], ε: [0.5, 0, 2], ζ: [1, 0, 5], η: [1, 0, 5], θ: [1, 0.1, 5], κ: [1, 0, 5], λ: [1, 0, 5],
  μ: [0, -3, 3], ν: [3, 1, 30], ξ: [1, 0, 5], ρ: [0.03, 0, 0.2], σ: [1, 0.1, 5], τ: [0.2, 0, 1], φ: [0.5, 0, 1], χ: [1, 0, 5], ψ: [1, 0, 5], ω: [1, 0, 10],
  s: [0.2, 0, 1], n: [0.02, 0, 0.1], g: [0.02, 0, 0.1], i: [0.05, 0, 0.2], r: [0.05, 0, 0.2], A: [1, 0.1, 5], B: [1, 0.1, 5], m: [10, 1, 20], M: [10, 1, 20],
  P: [1, 0.1, 5], p: [1, 0.1, 10], w: [1, 0.1, 10], u: [2, 0.5, 10], U: [2, 0.5, 10]
};
// the letters that read as the variable of a function, in order
const VAR_RANK = ['x', 't', 'k', 'q', 'c', 'n', 'h', 'l', 'z', 'K', 'L', 'N', 'Q', 'Y', 'C', 'X', 'T', 'w', 'p', 'r', 'y'];
// the pairs that read as an implicit curve's two variables
const PAIRS = [['x', 'y'], ['x_1', 'x_2'], ['q_1', 'q_2'], ['c_1', 'c_2'], ['K', 'L'], ['Y', 'r'], ['y', 'r'], ['k', 'c'], ['q', 'p'], ['x', 'z'], ['u', 'v']];
// quantities that are never negative: their axis starts at 0
const NONNEG = new Set(['k', 'q', 'c', 'n', 'h', 'l', 'K', 'L', 'N', 'Q', 'Y', 'C', 'p', 'w', 'x_1', 'x_2', 'q_1', 'q_2', 'c_1', 'c_2']);

const nice = (v) => { const m = Math.pow(10, Math.floor(Math.log10(v))), r = v / m; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * m; };
// a slider for a name: its role's range, a value the document gives it
// (econ: the graph's variables are quantities, so a Latin letter's economic role holds: r is a
// rate there, a radius in x^2 + y^2 = r^2)
function slider(name, values, econ) {
  const base = name.split('_')[0];
  const greek = K.GREEK_VALUES.has(base);
  const role = (greek || econ) && ROLE[base] ? ROLE[base] : /^[a-z]$/.test(base) ? (econ ? [1, 0, 10] : [1, -5, 5]) : [1, 0, 10];
  let [v, lo, hi] = role;
  const given = values && Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
  if (given != null && Number.isFinite(given)) {
    v = given;
    if (!(v >= lo && v <= hi)) { if (v > 0) { lo = 0; hi = nice(2 * v); } else if (v < 0) { lo = -nice(-2 * v); hi = nice(-2 * v); } else { lo = -1; hi = 1; } }
  }
  return { name, min: lo, max: hi, step: K.niceStep((hi - lo) / 100), value: v };
}

// The values a document gives its letters: "α = 0.3", "$\beta=0.95$", "s = 0.2," (the first of
// each, a number standing alone after the sign)
export function paramValues(src) {
  const out = {};
  const re = new RegExp('(' + NAME_TEX + ')\\s*=\\s*(-?\\d*\\.?\\d+)(?=\\s*(?:[,;.$)]|\\\\[,;!) ]|\\\\right|\\\\\\)|\\s|$))', 'g');
  const t = String(src).slice(0, 2e6);
  let m, n = 0;
  while ((m = re.exec(t)) && n++ < 5000) {
    const name = nameOf(m[1]);
    if (name && !(name in out)) out[name] = parseFloat(m[2]);
  }
  return out;
}

// the equation's LaTeX without what does not draw: labels, tags, alignment, environments
function clean(tex) {
  return String(tex).slice(0, 4000)
    .replace(/\\(?:label|tag\*?|eqref|ref|text|mbox|textrm)\s*\{(?:and|und|et)\}/g, ' ;; ')
    .replace(/\\(?:label|tag\*?|eqref|ref|hypertarget)\s*\{[^{}]*\}/g, ' ')
    .replace(/\\(?:begin|end)\s*\{[A-Za-z*]+\}(?:\{[^{}]*\})?/g, ' ').replace(/\\(?:nonumber|notag)(?![A-Za-z])/g, ' ')
    .replace(/\\q?quad(?![A-Za-z])/g, ' ;; ').replace(/\\\\(?:\[[^\]]*\])?/g, ' ;; ')
    .replace(/&/g, ' ').replace(/\\[,;:! ]/g, ' ').replace(/[.,;\s]+$/, '');
}
// the equations of a formula: split at ;; and at a comma or semicolon outside brackets where each
// side has an = sign
function equations(tex) {
  const parts = [];
  let d = 0, from = 0;
  const t = tex;
  const cut = (i, len) => { parts.push(t.slice(from, i)); from = i + len; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && /[{}]/.test(t[i + 1] || '')) { i++; continue; }
    if (c === '(' || c === '{' || c === '[') d++;
    else if (c === ')' || c === '}' || c === ']') d--;
    else if (d === 0 && t.startsWith(';;', i)) { cut(i, 2); i++; }
    else if (d === 0 && (c === ',' || c === ';')) cut(i, 1);
  }
  parts.push(t.slice(from));
  // (a comma inside one equation, as in f(x, y), is at depth 1; one between a formula and its
  // condition, "x \ge 0", leaves a piece without = that is dropped)
  const eqs = parts.map((p) => p.trim().replace(/^[.,;]+|[.,;]+$/g, '').trim()).filter(Boolean);
  const withEq = eqs.filter((p) => topEq(p) >= 0);
  return withEq.length ? withEq : eqs.filter((p) => !/[<>]|\\[lg]eq?(?![A-Za-z])/.test(p)).slice(0, 1);
}
// where an equation's = sign is, outside brackets, or -1
function topEq(t) {
  let d = 0, at = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '(' || c === '{' || c === '[') d++;
    else if (c === ')' || c === '}' || c === ']') d--;
    else if (c === '=' && d === 0) { if (at >= 0) return -2; at = i; }
  }
  return at;
}
// what an equation's left side is: a time derivative, f(x), a name, or an expression
function lhsKind(t) {
  const s = t.trim().replace(/^\\left|\\right/g, '');
  let m = new RegExp('^\\\\dot\\s*\\{?\\s*(' + NAME_TEX + ')\\s*\\}?\\s*(?:_\\{?t\\}?)?\\s*(?:\\(\\s*t\\s*\\))?$').exec(s);
  if (m) return { dot: nameOf(m[1].replace(/[{}]/g, '')) };
  m = new RegExp('^\\\\[dt]?frac\\s*\\{\\s*(?:\\\\mathrm\\{d\\}|d)\\s*(' + NAME_TEX + ')\\s*\\}\\s*\\{\\s*(?:\\\\mathrm\\{d\\}|d)\\s*t\\s*\\}$').exec(s);
  if (m) return { dot: nameOf(m[1]) };
  // k_{t+1} = g(k_t): the next value against this one
  m = /^(\\[A-Za-z]+|[A-Za-z])_\{\s*t\s*\+\s*1\s*\}$/.exec(s);
  if (m && nameOf(m[1])) return { next: nameOf(m[1]) };
  m = new RegExp("^(" + NAME_TEX + ")'$").exec(s);
  if (m) return { dot: nameOf(m[1]) };
  m = new RegExp('^(' + NAME_TEX + ')\\s*(?:\\\\left)?\\(\\s*(' + NAME_TEX + ')\\s*(?:\\\\right)?\\)$').exec(s);
  if (m && nameOf(m[1]) && nameOf(m[2])) return { fn: nameOf(m[1]), arg: nameOf(m[2]) };
  const n = nameOf(s);
  if (n) return { name: n };
  return { expr: true };
}

// a side of an equation as the formula language's tree; the names it uses
function read(tex) {
  const tree = K.parse(tex, []);
  return { tree, names: [...K.names(tree)] };
}
// a tree with one name renamed (a parametric curve's variable is t)
function rename(t, from, to) {
  if (t[0] === 'v') return t[1] === from ? ['v', to] : t;
  if (t[0] === 'n') return t;
  if (t[0] === 'f') return ['f', t[1], t[2].map((a) => rename(a, from, to))];
  return [t[0], ...t.slice(1).map((a) => rename(a, from, to))];
}
const text = (tree) => K.show(tree, false);
const pick = (names, rank) => rank.find((v) => names.includes(v)) || names.find((v) => /^[a-z]/.test(v) && !K.GREEK_VALUES.has(v[0])) || names[0];

// graphThis(tex, { values }) -> { spec, what } or { error }: what says in words what was drawn
export function graphThis(tex, opts = {}) {
  const values = opts.values || {};
  let eqs;
  try { eqs = equations(clean(tex)); } catch (e) { eqs = []; }
  if (!eqs.length) return { error: 'There is no formula here to draw' };
  const op = /\\(max|min|sum|prod|int|iint|oint|lim|sup|inf|argmax|argmin|operatorname\*?\{arg)/.exec(tex);
  if (op) return { error: 'It has \\' + op[1] + ': a formula of one variable draws, an operator over a set or a sum does not' };
  if (eqs.length > 2) return { error: 'Graph this draws one equation or a pair of them; this has ' + eqs.length };
  try {
    const sides = eqs.map((e) => { const k = topEq(e); if (k === -2) throw new Error('An equation with two = signs cannot be drawn'); return k < 0 ? { rhs: e } : { lhs: e.slice(0, k), rhs: e.slice(k + 1) }; });
    const L = sides.map((x) => (x.lhs != null ? lhsKind(x.lhs) : null));
    const R = sides.map((x) => read(x.rhs));
    const sliders = (used, vars) => { const econ = vars.some((v) => NONNEG.has(v) || NONNEG.has(v.split('_')[0])); return [...new Set(used)].filter((n) => !vars.includes(n)).slice(0, 8).map((n) => slider(n, values, econ)); };
    const range = (v, tree, others) => {
      if (NONNEG.has(v)) return [0, 10];
      // (a formula with no value left of 0, as k^α has none, is drawn right of it)
      try {
        const s = K.normalize({ kind: 'function', vars: [v], f: [K.show(tree, false)], x: { min: -5, max: 5 }, sliders: sliders(others, [v]) });
        const d = K.compute(s, K.defaults(s), 100).series[0].pts;
        const neg = d.filter((p) => p[0] < 0), bad = neg.filter((p) => !Number.isFinite(p[1])).length;
        if (neg.length && bad / neg.length > 0.4) return [0, 10];
      } catch (e) { /* drawn as it is */ }
      return [-5, 5];
    };
    // two time derivatives: a phase portrait
    if (eqs.length === 2 && L[0] && L[1] && L[0].dot && L[1].dot && L[0].dot !== L[1].dot) {
      const vars = [L[0].dot, L[1].dot];
      const used = R.flatMap((r) => r.names);
      const pos = vars.every((v) => NONNEG.has(v));
      const lim = pos ? [0, 10] : [-5, 5];
      const spec = { kind: 'phase', vars, phase: { dx: text(R[0].tree), dy: text(R[1].tree) }, x: { min: lim[0], max: lim[1], label: vars[0] }, y: { min: lim[0], max: lim[1], label: vars[1] }, sliders: sliders(used, vars), title: 'Phase portrait of ' + vars.join(' and ') };
      // (round its rest point, where there is one inside: twice its distance from the corner)
      const rest = restPoint(spec);
      if (rest && pos && rest[0] > 0 && rest[1] > 0) { spec.x.max = +(2 * rest[0]).toPrecision(2); spec.y.max = +(2 * rest[1]).toPrecision(2); spec.phase.start = [rest[0] * 0.5, rest[1] * 0.75]; }
      return done(spec, 'a phase portrait in ' + vars.join(' and ') + ': its field, its nullclines and a path from a point you drag');
    }
    // one time derivative: the rate against its variable, its rest points marked
    if (eqs.length === 1 && L[0] && L[0].dot) {
      const v = L[0].dot, r = R[0];
      const spec = { kind: 'function', vars: [v], f: [text(r.tree), '0'], cross: [[0, 1]], x: { min: range(v, r.tree, r.names)[0], max: range(v, r.tree, r.names)[1], label: v }, y: { label: K.show(['v', v], false) + '̇' }, sliders: sliders(r.names, [v]), title: 'The rate of change of ' + v + ' against ' + v };
      spec.y.label = v.replace(/^([^_]+)/, '$1̇');
      return done(spec, 'the rate of ' + v + ' against ' + v + ', its rest points marked');
    }
    // k_{t+1} = g(k_t): against the 45 degree line, the steady states marked
    if (eqs.length === 1 && L[0] && L[0].next) {
      const b = L[0].next, v = b + '_t', r = R[0];
      const names = r.names.filter((n) => n !== v);
      const spec = { kind: 'function', vars: [v], f: [text(r.tree), v], cross: [[0, 1]], x: { min: 0, max: 10, label: v }, y: { label: b + '′' }, sliders: sliders(names, [v]), title: b + ' next period against ' + b + ' now, and the 45 degree line' };
      return done(spec, b + ' next period against ' + b + ' now, with the 45 degree line: the steady states marked');
    }
    // a pair x = g(t), y = h(t): a parametric curve
    if (eqs.length === 2 && L[0] && L[1] && L[0].name && L[1].name && L[0].name !== L[1].name) {
      const lhs = [L[0].name, L[1].name];
      const common = R[0].names.filter((n) => R[1].names.includes(n) && !lhs.includes(n));
      const t = pick(common, ['t', 'θ', 'τ', 's', 'u']);
      if (t && !R.some((r) => r.names.some((n) => lhs.includes(n)))) {
        const tv = t === 'θ' ? 'θ' : 't';
        const used = R.flatMap((r) => r.names).filter((n) => n !== t);
        const spec = { kind: 'curve', curve: { mode: 'parametric', x: text(rename(R[0].tree, t, 't')), y: text(rename(R[1].tree, t, 't')), t: [0, 2 * Math.PI] }, x: { label: lhs[0] }, y: { label: lhs[1] }, sliders: sliders(used, ['t', tv]), title: 'The curve (' + lhs.join(', ') + ') as ' + t + ' runs' };
        return done(spec, 'a parametric curve as ' + t + ' runs from 0 to 2π');
      }
    }
    // a pair of curves of one variable with the same left side (IS and LM, supply and demand)
    if (eqs.length === 2 && L[0] && L[1] && (L[0].name || L[0].fn) && (L[0].name || L[0].fn) === (L[1].name || L[1].fn)) {
      const y = L[0].name || L[0].fn, names = R.flatMap((r) => r.names).filter((n) => n !== y);
      if (!R.some((r) => r.names.includes(y))) {
        // (the variable is in both: Y in IS and LM, where k is LM's alone)
        const common = R[0].names.filter((n) => R[1].names.includes(n) && n !== y);
        const v = L[0].arg || pick(common, VAR_RANK) || pick(names, VAR_RANK);
        const [lo, hi] = range(v, R[0].tree, names);
        const spec = { kind: 'function', vars: [v], f: R.map((r) => text(r.tree)), cross: true, x: { min: lo, max: hi, label: v }, y: { label: y }, sliders: sliders(names, [v]), title: 'Two curves of ' + y + ' against ' + v + ' and where they cross' };
        return done(spec, 'two curves of ' + y + ' against ' + v + ', where they cross marked');
      }
    }
    // one equation
    if (eqs.length === 1) {
      const lk = L[0], r = R[0];
      // f(x) = ... or y = ... with the left side not on the right: a function
      if (!lk || lk.fn || (lk.name && !r.names.includes(lk.name))) {
        if (lk && lk.fn && r.names.includes(lk.fn)) return { error: lk.fn + ' is on both sides: this equation defines it by itself, and cannot be drawn as it stands' };
        const y = lk ? lk.fn || lk.name : 'y';
        const names = r.names.filter((n) => n !== y);
        const v = (lk && lk.arg) || pick(names, VAR_RANK) || 'x';
        const [lo, hi] = range(v, r.tree, names);
        const spec = { kind: 'function', vars: [v], f: [text(r.tree)], x: { min: lo, max: hi, label: v }, y: { label: lk && lk.fn ? lk.fn + '(' + v + ')' : y }, sliders: sliders(names, [v]), title: 'Graph of ' + (lk ? (lk.fn ? lk.fn + '(' + v + ')' : y) : 'y') + ' = ' + text(r.tree) };
        return done(spec, (lk && (lk.fn || lk.name) ? (lk.fn || lk.name) : 'y') + ' against ' + v);
      }
    }
    // F(x, y) = c, one or two of them: implicit curves in the pair of names that reads as one
    const trees = sides.map((x) => (x.lhs != null ? K.parseEq(x.lhs + '=' + x.rhs, []) : read(x.rhs).tree));
    const all = [...new Set(trees.flatMap((t) => [...K.names(t)]))];
    const pair = PAIRS.find(([a, b]) => all.includes(a) && all.includes(b)) || (() => { const r = VAR_RANK.filter((v) => all.includes(v)); const o = all.filter((v) => !r.includes(v)); const q = r.concat(o); return q.length >= 2 ? [q[0], q[1]] : null; })();
    if (!pair) return { error: 'This formula has one variable and no = sign to draw a curve from' };
    const pos = pair.every((v) => NONNEG.has(v)) || trees.every((t) => nanLeft(t, pair, all, values));
    const lim = pos ? [0, 10] : [-5, 5];
    const eqText = sides.map((x) => (x.lhs != null ? text(read(x.lhs).tree) + ' = ' + text(read(x.rhs).tree) : text(read(x.rhs).tree) + ' = 0'));
    const spec = { kind: 'implicit', vars: pair, eq: eqText, x: { min: lim[0], max: lim[1], label: pair[0] }, y: { min: lim[0], max: lim[1], label: pair[1] }, sliders: sliders(all, pair), title: 'The curve' + (eqText.length > 1 ? 's ' : ' ') + eqText.join(' and ') };
    return done(spec, 'the curve' + (eqText.length > 1 ? 's' : '') + ' where ' + eqText.join(' and ') + ', in ' + pair.join(' and '));
  } catch (e) {
    return { error: 'This formula cannot be drawn: ' + (e.message || e) };
  }
}
// A phase portrait's rest point in its plot (both rates zero), or null: the smallest of the two
// rates, each over its typical size, on a grid, then on finer grids round the best
function restPoint(spec) {
  try {
    const s = K.normalize(spec), d = K.compute(s, K.defaults(s), 50);
    void d;
    const slots = { [s.vars[0]]: 0, [s.vars[1]]: 1 };
    s.sliders.forEach((q, k) => { slots[q.name] = k + 2; });
    const [fx, fy] = K.formulas(s).map((f) => K.compile(f.tree, slots));
    const env = [0, 0, ...s.sliders.map((q) => q.value)];
    const at = (x, y) => { env[0] = x; env[1] = y; return [fx(env), fy(env)]; };
    let sx = 0, sy = 0, n = 0;
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { const [u, v] = at(s.x.min + (s.x.max - s.x.min) * i / 10, s.y.min + (s.y.max - s.y.min) * j / 10); if (Number.isFinite(u) && Number.isFinite(v)) { sx += Math.abs(u); sy += Math.abs(v); n++; } }
    if (!n) return null;
    sx = sx / n || 1; sy = sy / n || 1;
    let best = null, box = [s.x.min, s.x.max, s.y.min, s.y.max];
    for (let round = 0; round < 6; round++) {
      for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
        const x = box[0] + (box[1] - box[0]) * i / 40, y = box[2] + (box[3] - box[2]) * j / 40, [u, v] = at(x, y), e = Math.abs(u) / sx + Math.abs(v) / sy;
        if (Number.isFinite(e) && (!best || e < best[2])) best = [x, y, e];
      }
      if (!best) return null;
      const w = (box[1] - box[0]) / 10, h = (box[3] - box[2]) / 10;
      box = [best[0] - w, best[0] + w, best[1] - h, best[1] + h];
    }
    return best[2] < 1e-3 ? [best[0], best[1]] : null;
  } catch (e) { return null; }
}
// whether an implicit equation has no values left of 0 in its variables (x^α y^(1-α) = u)
function nanLeft(tree, pair, all, values) {
  try {
    const sl = all.filter((n) => !pair.includes(n)).map((n) => slider(n, values));
    const slots = { [pair[0]]: 0, [pair[1]]: 1 };
    sl.forEach((q, k) => { slots[q.name] = k + 2; });
    const f = K.compile(tree, slots), env = [0, 0, ...sl.map((q) => q.value)];
    let bad = 0, n = 0;
    for (const x of [-4, -2.5, -1, -0.3]) for (const y of [-4, -1, 0.5, 2, 4]) { env[0] = x; env[1] = y; n++; if (!Number.isFinite(f(env))) bad++; }
    return bad / n > 0.4;
  } catch (e) { return false; }
}
// the description checked: its formulas read, and it draws something at its starting values
function done(spec, what) {
  const s = K.normalize(spec);
  K.formulas(s);
  const d = K.compute(s, K.defaults(s), 200);
  const any = d.series.some((S) => (S.pts && S.pts.some((p) => p && Number.isFinite(p[1]))) || (S.lines && S.lines.length));
  if (!any) return { error: 'The formula draws nothing at its sliders\' starting values' };
  return { spec: s, what };
}
