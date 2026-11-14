// Interactive graphs (Insert › Interactive graph): live figures Rikuy writes and reads back. A
// graph is a widget file of its own (rikuy.sty's \rikuywidget, src/widget.js) that holds its
// description as JSON (the formulas, the data, the sliders and their ranges) and a script that
// draws it; the PDF prints a PNG of the same drawing at the sliders' starting values.
//
// graphKit is everything the drawing needs, written to run in two places: in the widget's own
// sandboxed frame (its text is copied into every graph's file, the way widgetGuard is, so it
// uses nothing outside itself), and here in the editor, where the same code draws the PDF's
// picture on a canvas, so the picture is the live figure at its starting values by
// construction. Formulas are read by its own small parser into closures: nothing is ever
// evaluated as JavaScript, so a graph from a stranger's document can describe a formula but
// never run code in the editor. Every size is capped (formulas, sliders, points, samples).

export function graphKit() {
  'use strict';
  const MAXF = 300, MAXDEPTH = 40, MAXNODES = 600;

  // ---- the formula language: what people type in Word, Desmos or LaTeX ---------------------
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', varphi: 'φ', vartheta: 'θ', varepsilon: 'ε' };
  const CONST = { pi: Math.PI, 'π': Math.PI, e: Math.E };
  const lg = (x) => {
    // log Γ(x), Lanczos (g = 7, n = 9): 15 digits, enough for every density here
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lg(1 - x);
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    x -= 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  const gammaFn = (x) => (x <= 0 && x === Math.floor(x) ? NaN : x < 0.5 ? Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x)) : Math.exp(lg(x)));
  const fact = (n) => (n < 0 ? NaN : n === Math.floor(n) && n <= 20 ? (() => { let p = 1; for (let i = 2; i <= n; i++) p *= i; return p; })() : gammaFn(n + 1));
  const erf = (x) => {
    // Abramowitz and Stegun 7.1.26 is too rough for a cdf drawn at full width: this is the
    // series below 3 and the continued fraction's complement above
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    if (x < 3) { let sum = x, term = x; for (let n = 1; n < 80; n++) { term *= -x * x / n; const d = term / (2 * n + 1); sum += d; if (Math.abs(d) < 1e-16 * Math.abs(sum)) break; } return s * 2 / Math.sqrt(Math.PI) * sum; }
    let f = 0;
    for (let n = 60; n >= 1; n--) f = n / 2 / (x + f);
    return s * (1 - Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f));
  };
  const FN = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
    asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
    exp: Math.exp, ln: Math.log, log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)), log10: Math.log10, log2: Math.log2, lg: Math.log10,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sgn: Math.sign,
    min: Math.min, max: Math.max, mod: (a, b) => a - b * Math.floor(a / b), atan2: Math.atan2,
    gamma: gammaFn, lgamma: lg, factorial: fact, binom: (n, k) => Math.round(Math.exp(lg(n + 1) - lg(k + 1) - lg(n - k + 1))), erf,
    normpdf: (x, m, s) => { m = m ?? 0; s = s ?? 1; const z = (x - m) / s; return Math.exp(-z * z / 2) / (s * Math.sqrt(2 * Math.PI)); },
    normcdf: (x, m, s) => 0.5 * (1 + erf((x - (m ?? 0)) / ((s ?? 1) * Math.SQRT2))),
    frac: (a, b) => a / b
  };
  // the functions that take more than one argument, and how many at most
  const ARGS = { log: 2, min: 8, max: 8, mod: 2, atan2: 2, binom: 2, normpdf: 3, normcdf: 3, frac: 2, if: 3 };
  const KNOWN = Object.keys(FN).concat(['if'], Object.keys(GREEK), Object.keys(CONST));

  // Tokens: numbers, names, operators. A run of letters is cut into names the way Desmos does
  // (ax is a times x, sinx is sin x): the longest known name at each place, else one letter;
  // names the graph declares (its sliders) count as known, so a slider called "amp" is one name.
  function tokens(text, names) {
    let s = String(text);
    if (s.length > MAXF) throw err('The formula is longer than ' + MAXF + ' characters', MAXF);
    s = s.replace(/\\(left|right|big|Big|bigg|Bigg)\b/g, ' ').replace(/\\(cdot|times)\b|[·×⋅∗]/g, '*').replace(/[−–]/g, '-').replace(/÷/g, '/').replace(/\*\*/g, '^')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\\[,;:! ]/g, ' ');
    const known = KNOWN.concat(names || []).sort((a, b) => b.length - a.length);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i, i + 40));
      // (1e3 is a number, but 2e alone is two times e)
      // (1e3 is a number; 2e is two times e, which the pattern leaves out)
      if (num) { out.push({ t: 'n', v: parseFloat(num[0]), at: i }); i += num[0].length; continue; }
      if (ch === '\\') {
        const m = /^\\([A-Za-z]+)/.exec(s.slice(i, i + 30));
        if (!m) throw err('A backslash with no name after it', i);
        const n = m[1];
        out.push({ t: 'name', v: n === 'operatorname' ? '' : n, at: i, bs: true });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-zα-ωΑ-Ωϑϕ_]/.test(ch)) {
        let j = i;
        while (j < s.length && /[A-Za-zα-ωΑ-Ωϑϕ]/.test(s[j])) j++;
        const run = s.slice(i, j);
        let k = 0;
        const parts = [];
        while (k < run.length) {
          const hit = known.find((n) => run.startsWith(n, k));
          const n = hit || run[k];
          parts.push({ t: 'name', v: n, at: i + k });
          k += n.length;
        }
        // a subscript belongs to the last name: a_1, x_{max}
        if (s[j] === '_') {
          const m = /^_(\{[A-Za-z0-9]{1,8}\}|[A-Za-z0-9]{1,8})/.exec(s.slice(j, j + 12));
          if (!m) throw err('A subscript needs letters or digits after _', j);
          if (!parts.length) throw err('A subscript needs a name before it', j);
          parts[parts.length - 1].v += '_' + m[1].replace(/[{}]/g, '');
          j += m[0].length;
        }
        out.push(...parts);
        i = j;
        continue;
      }
      if (ch === '<' || ch === '>' || ch === '≤' || ch === '≥') {
        const two = s[i + 1] === '=';
        out.push({ t: 'op', v: ch === '≤' ? '<=' : ch === '≥' ? '>=' : ch + (two ? '=' : ''), at: i });
        i += two ? 2 : 1;
        continue;
      }
      if ('+-*/^(),!|{}[]'.includes(ch)) { out.push({ t: 'op', v: ch === '{' || ch === '[' ? '(' : ch === '}' || ch === ']' ? ')' : ch, at: i }); i++; continue; }
      throw err('"' + ch + '" is not part of a formula', i);
    }
    // Greek letters by name; gamma before a bracket is the function
    out.forEach((t, k) => { if (t.t === 'name' && GREEK[t.v] && !(t.v === 'gamma' && out[k + 1] && out[k + 1].v === '(')) t.v = GREEK[t.v]; });
    return out.filter((t) => t.t !== 'name' || t.v !== '');
  }
  function err(msg, at) { const e = new Error(msg); e.at = at; return e; }

  // parse(text, names) -> a tree: ['n', v] ['v', name] ['f', name, [args]] [op, a, b] ['neg', a]
  function parse(text, names) {
    const T = tokens(text, names);
    let i = 0, depth = 0, nodes = 0;
    const peek = () => T[i], at = () => (T[i] ? T[i].at : String(text).length);
    const isOp = (v) => T[i] && T[i].t === 'op' && T[i].v === v;
    const node = (x) => { if (++nodes > MAXNODES) throw err('The formula is too long', at()); return x; };
    const isFn = (t) => t && t.t === 'name' && (!!FN[t.v] || t.v === 'if');
    const startsAtom = (t) => t && (t.t === 'n' || t.t === 'name' || (t.t === 'op' && t.v === '('));
    const deeper = (f) => { if (++depth > MAXDEPTH) throw err('The formula nests too deep', at()); try { return f(); } finally { depth--; } };
    function cmp() {
      let a = add();
      while (T[i] && T[i].t === 'op' && /^[<>]=?$/.test(T[i].v)) { const op = T[i++].v; a = node([op, a, add()]); }
      return a;
    }
    function add() {
      let a = mul();
      while (isOp('+') || isOp('-')) { const op = T[i++].v; a = node([op, a, mul()]); }
      return a;
    }
    function mul() {
      let a = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const op = T[i++].v; a = node([op, a, unary()]); continue; }
        // 2x, 2 sin x, (x+1)(x-1), a b: a product with no sign between
        if (startsAtom(peek())) { a = node(['*', a, pow()]); continue; }
        return a;
      }
    }
    function unary() {
      if (isOp('-')) { i++; return node(['neg', deeper(unary)]); }
      if (isOp('+')) { i++; return deeper(unary); }
      return pow();
    }
    function pow() {
      const a = post();
      if (isOp('^')) { i++; return node(['^', a, deeper(unary)]); }
      return a;
    }
    function post() {
      let a = atom();
      while (isOp('!')) { i++; a = node(['f', 'factorial', [a]]); }
      return a;
    }
    function atom() {
      const t = T[i];
      if (!t) throw err('The formula ends too soon', at());
      if (t.t === 'n') { i++; return node(['n', t.v]); }
      if (t.t === 'op' && t.v === '(') { i++; const a = deeper(cmp); if (!isOp(')')) throw err('A bracket is not closed', at()); i++; return a; }
      if (t.t === 'op' && t.v === '|') { i++; const a = deeper(add); if (!isOp('|')) throw err('An absolute value bar is not closed', at()); i++; return node(['f', 'abs', [a]]); }
      if (t.t === 'name') {
        i++;
        if (isFn(t)) return deeper(() => call(t));
        if (t.bs && !(t.v in CONST) && !/^[α-ωΑ-Ω]$/.test(t.v)) throw err('\\' + t.v + ' is not a function this graph knows', t.at);
        return node(['v', t.v]);
      }
      throw err('"' + t.v + '" cannot stand here', t.at);
    }
    function call(t) {
      const name = t.v;
      // sin^2 x: the square of the sine
      let power = null;
      if (isOp('^')) { i++; power = deeper(post); }
      let args;
      if (isOp('(')) {
        i++;
        args = [cmp()];
        while (isOp(',')) { i++; args.push(cmp()); }
        if (!isOp(')')) throw err('A bracket is not closed', at());
        i++;
        // \frac{a}{b}, \sqrt{x}: LaTeX's groups, one after the other
        if (name === 'frac' && args.length === 1 && isOp('(')) { i++; args.push(cmp()); if (!isOp(')')) throw err('A bracket is not closed', at()); i++; }
      } else {
        // sin x, sin 2x, ln x^2: the product of numbers and names that follows, up to the next
        // function or sign (sin x cos x is sin(x) cos(x))
        let a = pow();
        while (peek() && (peek().t === 'n' || (peek().t === 'name' && !isFn(peek())))) a = node(['*', a, pow()]);
        args = [a];
      }
      const max = ARGS[name] || 1, min = name === 'if' ? 3 : name === 'frac' || name === 'mod' || name === 'atan2' || name === 'binom' ? 2 : 1;
      if (args.length < min || args.length > max) throw err(name + ' takes ' + (min === max ? min : min + ' to ' + max) + ' argument' + (max > 1 ? 's' : ''), t.at);
      let n = node(['f', name, args]);
      if (power) n = node(['^', n, power]);
      return n;
    }
    const tree = cmp();
    if (i < T.length) throw err('"' + T[i].v + '" was not expected here', T[i].at);
    return tree;
  }

  // the names a formula uses that are not functions or constants: its variables
  function names(tree, out = new Set()) {
    if (tree[0] === 'v') { if (!(tree[1] in CONST)) out.add(tree[1]); }
    else if (tree[0] === 'f') for (const a of tree[2]) names(a, out);
    else if (tree[0] !== 'n') for (let k = 1; k < tree.length; k++) names(tree[k], out);
    return out;
  }

  // The tree as a closure of closures over env, an array of values in slot order. Unknown names
  // were refused before this (check), so a slot is always found.
  function compile(tree, slots) {
    const op = tree[0];
    if (op === 'n') { const v = tree[1]; return () => v; }
    if (op === 'v') {
      if (tree[1] in CONST) { const v = CONST[tree[1]]; return () => v; }
      const k = slots[tree[1]];
      if (k === undefined) throw err('Unknown name ' + tree[1], 0);
      return (e) => e[k];
    }
    if (op === 'neg') { const a = compile(tree[1], slots); return (e) => -a(e); }
    if (op === 'f') {
      const as = tree[2].map((t) => compile(t, slots));
      if (tree[1] === 'if') { const [c, y, n] = as; return (e) => (c(e) ? y(e) : n(e)); }
      const fn = FN[tree[1]];
      if (as.length === 1) { const a = as[0]; return (e) => fn(a(e)); }
      if (as.length === 2) { const [a, b] = as; return (e) => fn(a(e), b(e)); }
      return (e) => fn(...as.map((a) => a(e)));
    }
    const a = compile(tree[1], slots), b = compile(tree[2], slots);
    switch (op) {
      case '+': return (e) => a(e) + b(e);
      case '-': return (e) => a(e) - b(e);
      case '*': return (e) => a(e) * b(e);
      case '/': return (e) => a(e) / b(e);
      // (a negative number's odd root is real: x^(1/3) is drawn left of 0 too)
      case '^': return (e) => { const x = a(e), y = b(e); if (x < 0 && y !== Math.round(y)) { const q = 1 / y, r = Math.round(q); if (Math.abs(q - r) < 1e-9 && Math.abs(r) % 2 === 1) return -Math.pow(-x, y); } return Math.pow(x, y); };
      case '<': return (e) => +(a(e) < b(e));
      case '>': return (e) => +(a(e) > b(e));
      case '<=': return (e) => +(a(e) <= b(e));
      case '>=': return (e) => +(a(e) >= b(e));
    }
    throw err('Unknown operation', 0);
  }

  // ---- distributions ------------------------------------------------------------------------
  // p: their parameters as sliders [name, from, to, step, start]; pdf; mean and variance (for
  // the mean of n draws, standardised); draw(r, P) one value from uniform numbers r()
  const normal = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const gammaDraw = (r, k) => {
    // Marsaglia and Tsang; below 1 by k + 1 and a power of a uniform
    if (k < 1) return gammaDraw(r, k + 1) * Math.pow(1 - r(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (let n = 0; n < 1000; n++) {
      let x, v;
      do { x = normal(r); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = 1 - r();
      if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
    return d;
  };
  const FAM = {
    normal: { name: 'Normal', p: [['μ', -3, 3, 0.1, 0], ['σ', 0.2, 3, 0.1, 1]], x: [-4, 4], pdf: (x, P) => FN.normpdf(x, P.μ, P.σ), mean: (P) => P.μ, vari: (P) => P.σ * P.σ, draw: (r, P) => P.μ + P.σ * normal(r) },
    exponential: { name: 'Exponential', p: [['λ', 0.2, 4, 0.1, 1]], x: [0, 5], pdf: (x, P) => (x < 0 ? 0 : P.λ * Math.exp(-P.λ * x)), mean: (P) => 1 / P.λ, vari: (P) => 1 / (P.λ * P.λ), draw: (r, P) => -Math.log(1 - r()) / P.λ },
    uniform: { name: 'Uniform', p: [['a', -3, 0, 0.1, 0], ['b', 0.5, 4, 0.1, 1]], x: [-1, 2], pdf: (x, P) => (P.b > P.a && x >= P.a && x <= P.b ? 1 / (P.b - P.a) : 0), mean: (P) => (P.a + P.b) / 2, vari: (P) => (P.b - P.a) * (P.b - P.a) / 12, draw: (r, P) => P.a + (P.b - P.a) * r() },
    gamma: { name: 'Gamma', p: [['k', 0.5, 10, 0.1, 2], ['θ', 0.2, 3, 0.1, 1]], x: [0, 10], pdf: (x, P) => (x <= 0 ? 0 : Math.exp((P.k - 1) * Math.log(x) - x / P.θ - lg(P.k) - P.k * Math.log(P.θ))), mean: (P) => P.k * P.θ, vari: (P) => P.k * P.θ * P.θ, draw: (r, P) => P.θ * gammaDraw(r, P.k) },
    beta: { name: 'Beta', p: [['α', 0.5, 10, 0.1, 2], ['β', 0.5, 10, 0.1, 5]], x: [0, 1], pdf: (x, P) => (x <= 0 || x >= 1 ? 0 : Math.exp((P.α - 1) * Math.log(x) + (P.β - 1) * Math.log(1 - x) - lg(P.α) - lg(P.β) + lg(P.α + P.β))), mean: (P) => P.α / (P.α + P.β), vari: (P) => P.α * P.β / ((P.α + P.β) * (P.α + P.β) * (P.α + P.β + 1)), draw: (r, P) => { const a = gammaDraw(r, P.α), b = gammaDraw(r, P.β); return a / (a + b); } },
    t: { name: 'Student\'s t', p: [['ν', 1, 30, 1, 3]], x: [-5, 5], pdf: (x, P) => Math.exp(lg((P.ν + 1) / 2) - lg(P.ν / 2)) / Math.sqrt(P.ν * Math.PI) * Math.pow(1 + x * x / P.ν, -(P.ν + 1) / 2), mean: () => 0, vari: (P) => (P.ν > 2 ? P.ν / (P.ν - 2) : NaN), draw: (r, P) => normal(r) / Math.sqrt(2 * gammaDraw(r, P.ν / 2) / P.ν) },
    chi2: { name: 'Chi-square', p: [['k', 1, 20, 1, 3]], x: [0, 12], pdf: (x, P) => (x <= 0 ? 0 : Math.exp((P.k / 2 - 1) * Math.log(x) - x / 2 - lg(P.k / 2) - (P.k / 2) * Math.log(2))), mean: (P) => P.k, vari: (P) => 2 * P.k, draw: (r, P) => 2 * gammaDraw(r, P.k / 2) },
    binomial: { name: 'Binomial', discrete: true, p: [['n', 1, 100, 1, 10], ['p', 0, 1, 0.01, 0.3]], x: [0, 10], pdf: (k, P) => { if (k < 0 || k > P.n || k !== Math.floor(k)) return 0; if (P.p <= 0) return k === 0 ? 1 : 0; if (P.p >= 1) return k === P.n ? 1 : 0; return Math.exp(lg(P.n + 1) - lg(k + 1) - lg(P.n - k + 1) + k * Math.log(P.p) + (P.n - k) * Math.log(1 - P.p)); }, mean: (P) => P.n * P.p, vari: (P) => P.n * P.p * (1 - P.p), draw: (r, P) => { let c = 0; for (let k = 0; k < P.n; k++) if (r() < P.p) c++; return c; } },
    poisson: { name: 'Poisson', discrete: true, p: [['λ', 0.5, 20, 0.1, 4]], x: [0, 15], pdf: (k, P) => (k < 0 || k !== Math.floor(k) ? 0 : Math.exp(k * Math.log(P.λ) - P.λ - lg(k + 1))), mean: (P) => P.λ, vari: (P) => P.λ, draw: (r, P) => { const L = Math.exp(-P.λ); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 400); return k - 1; } }
  };
  // the number of draws averaged, in "mean of n draws": n, or N where the family has its own n
  const sizeName = (fam) => (FAM[fam].p.some((q) => q[0] === 'n') ? 'N' : 'n');
  const REPS = 4000, BINS = 32, ZLO = -4, ZHI = 4;
  // the generator of the sample's histogram, seeded, so the picture in the PDF is the same draws
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---- the description: everything a graph is, checked and capped -------------------------
  const KINDS = ['function', 'data', 'curve', 'dist'];
  const FITS = ['none', 'linear', 'quadratic', 'cubic', 'exp', 'log', 'power'];
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e9, Math.min(1e9, v)) : d);
  const opt = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e9, Math.min(1e9, v)) : null);
  const str = (v, n, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, n) : d);
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const kind = KINDS.includes(r.kind) ? r.kind : 'function';
    const ax = (a, lo, hi, label) => {
      a = a && typeof a === 'object' ? a : {};
      let min = opt(a.min), max = opt(a.max);
      if (min != null && max != null && !(max > min)) { min = null; max = null; }
      return { min: min ?? lo, max: max ?? hi, label: str(a.label, 60, label) };
    };
    const s = { rikuy: 'graph', v: 1, kind, title: str(r.title, 200), aspect: Math.max(0.25, Math.min(1.2, num(r.aspect, 0.5))) };
    if (kind === 'function') {
      s.f = (Array.isArray(r.f) ? r.f : ['sin(x)']).slice(0, 4).map((f) => str(f, MAXF)).filter((f) => f.trim());
      if (!s.f.length) s.f = ['sin(x)'];
      s.x = ax(r.x, -5, 5, 'x');
      s.y = ax(r.y, null, null, 'y');
    } else if (kind === 'curve') {
      const c = r.curve && typeof r.curve === 'object' ? r.curve : {};
      const polar = c.mode === 'polar';
      s.curve = polar ? { mode: 'polar', r: str(c.r, MAXF, '1 + cos(θ)') || '1 + cos(θ)' } : { mode: 'parametric', x: str(c.x, MAXF, 'cos(3t)') || 'cos(3t)', y: str(c.y, MAXF, 'sin(2t)') || 'sin(2t)' };
      const t = Array.isArray(c.t) ? c.t : [];
      let t0 = num(t[0], 0), t1 = num(t[1], 2 * Math.PI);
      if (!(t1 > t0)) { t0 = 0; t1 = 2 * Math.PI; }
      s.curve.t = [t0, t1];
      s.x = ax(r.x, null, null, 'x');
      s.y = ax(r.y, null, null, 'y');
    } else if (kind === 'data') {
      const d = r.data && typeof r.data === 'object' ? r.data : {};
      const pts = (Array.isArray(d.points) ? d.points : []).slice(0, 2000).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [num(p[0], 0), num(p[1], 0)]);
      s.data = { points: pts, fit: FITS.includes(d.fit) ? d.fit : 'linear', model: str(d.model, MAXF) };
      s.x = ax(r.x, null, null, 'x');
      s.y = ax(r.y, null, null, 'y');
    } else {
      const d = r.dist && typeof r.dist === 'object' ? r.dist : {};
      const fam = Object.prototype.hasOwnProperty.call(FAM, d.family) ? d.family : 'normal';
      s.dist = { family: fam, mode: d.mode === 'mean' ? 'mean' : 'density' };
      const F = FAM[fam];
      s.x = s.dist.mode === 'mean' ? { min: ZLO, max: ZHI, label: str((r.x || {}).label, 60, 'standardised mean') } : ax(r.x, F.x[0], F.x[1], 'x');
      s.y = ax(r.y, null, null, s.dist.mode === 'mean' ? 'density' : F.discrete ? 'probability' : 'density');
    }
    // sliders: a name each (letters, Greek, a subscript), its range, its step and where it starts
    const seen = new Set();
    s.sliders = [];
    for (const q of (Array.isArray(r.sliders) ? r.sliders : []).slice(0, 8)) {
      if (!q || typeof q !== 'object') continue;
      const name = str(q.name, 16).trim();
      if (!/^[A-Za-zα-ωΑ-Ω][A-Za-z0-9α-ωΑ-Ω]*(_[A-Za-z0-9]{1,8})?$/.test(name) || seen.has(name) || name in CONST || FN[name]) continue;
      seen.add(name);
      let min = num(q.min, 0), max = num(q.max, 10);
      if (!(max > min)) max = min + 1;
      let step = num(q.step, 0);
      if (!(step > 0) || step > max - min) step = niceStep((max - min) / 100);
      const value = Math.max(min, Math.min(max, num(q.value, min)));
      s.sliders.push({ name, min, max, step, value });
    }
    if (kind === 'dist') {
      // a distribution's sliders are its parameters (and n), whatever else the file says
      const F = FAM[s.dist.family];
      const want = F.p.map((q) => q.slice());
      if (s.dist.mode === 'mean') want.push([sizeName(s.dist.family), 1, 50, 1, 4]);
      s.sliders = want.map(([name, lo, hi, step, v]) => {
        const q = s.sliders.find((x) => x.name === name);
        // (a range may be narrowed, never widened past where the density is defined)
        const min = q ? Math.max(lo, q.min) : lo, max = q ? Math.min(hi, q.max) : hi;
        const ok = max > min;
        const st = q && ok ? Math.min(q.step, max - min) : step;
        const val = q && ok ? Math.max(min, Math.min(max, q.value)) : v;
        return ok ? { name, min, max, step: st, value: val } : { name, min: lo, max: hi, step, value: v };
      });
      if (s.dist.family === 't' && s.dist.mode === 'mean') { const nu = s.sliders[0]; nu.min = Math.max(nu.min, 3); nu.value = Math.max(nu.value, nu.min); if (nu.max <= nu.min) nu.max = 30; }
    }
    return s;
  }
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const m = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / m;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * m;
  }

  // The formulas of a graph, read: [{ text, tree }] and the names they use. Throws the first
  // mistake with where it is ({ field, at }).
  function formulas(s) {
    const declared = s.sliders.map((q) => q.name);
    const list = [];
    const read = (text, field, vars) => {
      let tree;
      try { tree = parse(text, declared); } catch (e) { e.field = field; throw e; }
      for (const n of names(tree)) if (!vars.includes(n) && !declared.includes(n)) { const e = err('No slider is called ' + n + ': add one, or use ' + vars.join(' or '), 0); e.field = field; e.name = n; throw e; }
      list.push({ text, field, tree });
    };
    if (s.kind === 'function') s.f.forEach((f, k) => read(f, 'f' + k, ['x']));
    if (s.kind === 'curve') {
      if (s.curve.mode === 'polar') read(s.curve.r, 'r', ['θ', 't']);
      else { read(s.curve.x, 'cx', ['t']); read(s.curve.y, 'cy', ['t']); }
    }
    if (s.kind === 'data' && s.data.model.trim()) read(s.data.model, 'model', ['x']);
    return list;
  }
  // The names the formulas use that no slider has: the sliders to offer
  function unknownNames(s) {
    const declared = new Set(s.sliders.map((q) => q.name)), out = [];
    const take = (text, vars) => { try { for (const n of names(parse(text, [...declared]))) if (!vars.includes(n) && !declared.has(n) && !out.includes(n)) out.push(n); } catch (e) { /* said elsewhere */ } };
    if (s.kind === 'function') for (const f of s.f) take(f, ['x']);
    if (s.kind === 'curve') { if (s.curve.mode === 'polar') take(s.curve.r, ['θ', 't']); else { take(s.curve.x, ['t']); take(s.curve.y, ['t']); } }
    if (s.kind === 'data' && s.data.model.trim()) take(s.data.model, ['x']);
    return out;
  }
  const defaults = (s) => Object.fromEntries(s.sliders.map((q) => [q.name, q.value]));

  // ---- what is drawn --------------------------------------------------------------------------
  // series: [{ kind: 'line' | 'points' | 'bars' | 'area', pts: [[x, y]...] (null breaks a line),
  // label, slot }], at the slider values vals
  function compute(s, vals, N = 600) {
    const slots = { x: 0, t: 0, θ: 0 };
    s.sliders.forEach((q, k) => { slots[q.name] = k + 1; });
    const env = [0, ...s.sliders.map((q) => (q.name in vals ? vals[q.name] : q.value))];
    const out = [];
    const fns = formulas(s).map((f) => ({ ...f, fn: compile(f.tree, slots) }));
    const at = (fn, v) => { env[0] = v; const y = fn(env); return Number.isFinite(y) ? y : NaN; };
    if (s.kind === 'function') {
      fns.forEach((f, k) => {
        const pts = [];
        for (let i = 0; i <= N; i++) { const x = s.x.min + (s.x.max - s.x.min) * i / N; pts.push([x, at(f.fn, x)]); }
        out.push({ kind: 'line', pts, label: 'y = ' + f.text.trim(), slot: k });
      });
    } else if (s.kind === 'curve') {
      const [t0, t1] = s.curve.t, pts = [], M = N * 2;
      for (let i = 0; i <= M; i++) {
        const t = t0 + (t1 - t0) * i / M;
        if (s.curve.mode === 'polar') { const r = at(fns[0].fn, t); pts.push([r * Math.cos(t), r * Math.sin(t)]); }
        else pts.push([at(fns[0].fn, t), at(fns[1].fn, t)]);
      }
      out.push({ kind: 'line', pts, label: s.curve.mode === 'polar' ? 'r = ' + s.curve.r.trim() : '(' + s.curve.x.trim() + ', ' + s.curve.y.trim() + ')', slot: 0, curve: true });
    } else if (s.kind === 'data') {
      const P = s.data.points;
      out.push({ kind: 'points', pts: P, label: 'data', slot: 0 });
      const fit = fitData(P, s.data.fit);
      if (fit) {
        const [lo, hi] = extent(P.map((p) => p[0]));
        const pts = [];
        for (let i = 0; i <= N; i++) { const x = lo + (hi - lo) * i / N; pts.push([x, fit.f(x)]); }
        out.push({ kind: 'line', pts, label: fit.label + ', R² = ' + fmt(fit.r2, 3), slot: 1 });
      }
      if (fns.length) {
        // one's own curve beside the data, its parameters on sliders: a fit by eye
        const [a, b] = P.length ? extent(P.map((p) => p[0])) : [0, 1];
        const pts = [];
        for (let i = 0; i <= N; i++) { const x = a + (b - a) * i / N; pts.push([x, at(fns[0].fn, x)]); }
        out.push({ kind: 'line', pts, label: 'y = ' + fns[0].text.trim(), slot: 2, dash: true });
      }
    } else {
      const F = FAM[s.dist.family], P = {};
      for (const q of s.sliders) P[q.name] = q.name in vals ? vals[q.name] : q.value;
      if (s.dist.mode === 'mean') {
        const n = Math.max(1, Math.round(P[sizeName(s.dist.family)])), m = F.mean(P), sd = Math.sqrt(F.vari(P));
        const r = mulberry32(2026), bw = (ZHI - ZLO) / BINS, cnt = new Array(BINS).fill(0);
        for (let i = 0; i < REPS; i++) {
          let sum = 0;
          for (let k = 0; k < n; k++) sum += F.draw(r, P);
          const z = Math.sqrt(n) * (sum / n - m) / sd;
          const b = Math.floor((z - ZLO) / bw);
          if (b >= 0 && b < BINS) cnt[b]++;
        }
        out.push({ kind: 'bars', pts: cnt.map((c, b) => [ZLO + (b + 0.5) * bw, c / (REPS * bw)]), w: bw, label: 'mean of ' + n + ' draw' + (n > 1 ? 's' : '') + ', standardised', slot: 0, hist: true });
        const pts = [];
        for (let i = 0; i <= 200; i++) { const x = ZLO + (ZHI - ZLO) * i / 200; pts.push([x, FN.normpdf(x)]); }
        out.push({ kind: 'line', pts, label: 'N(0, 1)', slot: 1 });
      } else if (F.discrete) {
        const pts = [];
        for (let k = Math.max(0, Math.ceil(s.x.min)); k <= Math.floor(s.x.max) && pts.length < 400; k++) pts.push([k, F.pdf(k, P)]);
        out.push({ kind: 'bars', pts, w: 0.7, label: F.name, slot: 0 });
      } else {
        const pts = [];
        for (let i = 0; i <= N; i++) { const x = s.x.min + (s.x.max - s.x.min) * i / N; const y = F.pdf(x, P); pts.push([x, Number.isFinite(y) ? y : NaN]); }
        out.push({ kind: 'area', pts, label: F.name, slot: 0 });
      }
    }
    return { series: out };
  }

  function extent(a) {
    let lo = Infinity, hi = -Infinity;
    for (const v of a) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return lo <= hi ? [lo, hi] : [0, 1];
  }

  // Least squares: a polynomial (in x scaled to [-1, 1] for a well conditioned system), or a
  // line through logarithms for the exponential, logarithmic and power fits
  function fitData(P, kind) {
    if (kind === 'none' || P.length < 2) return null;
    const deg = { linear: 1, quadratic: 2, cubic: 3 }[kind];
    let X = P.map((p) => p[0]), Y = P.map((p) => p[1]);
    let tx = (x) => x, ty = (y) => y, back = (y) => y;
    if (kind === 'exp') { const k = P.filter((p) => p[1] > 0); if (k.length < 2) return null; X = k.map((p) => p[0]); Y = k.map((p) => Math.log(p[1])); back = Math.exp; }
    if (kind === 'log') { const k = P.filter((p) => p[0] > 0); if (k.length < 2) return null; X = k.map((p) => Math.log(p[0])); Y = k.map((p) => p[1]); tx = Math.log; }
    if (kind === 'power') { const k = P.filter((p) => p[0] > 0 && p[1] > 0); if (k.length < 2) return null; X = k.map((p) => Math.log(p[0])); Y = k.map((p) => Math.log(p[1])); tx = Math.log; back = Math.exp; }
    const d = deg || 1;
    if (X.length <= d) return null;
    const [lo, hi] = extent(X), mid = (lo + hi) / 2, half = (hi - lo) / 2 || 1;
    const u = X.map((x) => (x - mid) / half);
    // normal equations, Gaussian elimination with partial pivoting
    const A = [], b = [];
    for (let i = 0; i <= d; i++) { A.push(new Array(d + 1).fill(0)); b.push(0); }
    u.forEach((x, k) => { for (let i = 0; i <= d; i++) { b[i] += Math.pow(x, i) * Y[k]; for (let j = 0; j <= d; j++) A[i][j] += Math.pow(x, i + j); } });
    for (let c = 0; c <= d; c++) {
      let p = c;
      for (let r = c + 1; r <= d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r <= d; r++) { const m = A[r][c] / A[c][c]; for (let j = c; j <= d; j++) A[r][j] -= m * A[c][j]; b[r] -= m * b[c]; }
    }
    const cu = new Array(d + 1).fill(0);
    for (let r = d; r >= 0; r--) { let v = b[r]; for (let j = r + 1; j <= d; j++) v -= A[r][j] * cu[j]; cu[r] = v / A[r][r]; }
    // the coefficients in x itself: p(x) = sum c_k ((x - mid) / half)^k
    const cx = new Array(d + 1).fill(0);
    for (let k = 0; k <= d; k++) for (let j = 0; j <= k; j++) cx[j] += cu[k] * Math.pow(half, -k) * binomC(k, j) * Math.pow(-mid, k - j);
    const poly = (x) => { let v = 0; for (let k = d; k >= 0; k--) v = v * x + cx[k]; return v; };
    const f = (x) => back(poly(tx(x)));
    const ys = P.map((p) => p[1]), mean = ys.reduce((a, v) => a + v, 0) / ys.length;
    let ss = 0, sr = 0;
    for (const p of P) { const e = p[1] - f(p[0]); if (Number.isFinite(e)) sr += e * e; ss += (p[1] - mean) * (p[1] - mean); }
    const r2 = ss > 0 ? 1 - sr / ss : 1;
    let label;
    if (kind === 'exp') label = 'y = ' + fmt(Math.exp(cx[0]), 3) + ' e^(' + fmt(cx[1], 3) + 'x)';
    else if (kind === 'power') label = 'y = ' + fmt(Math.exp(cx[0]), 3) + ' x^' + fmt(cx[1], 3);
    else if (kind === 'log') label = 'y = ' + fmt(cx[0], 3) + sgnTerm(cx[1], ' ln x');
    else label = 'y = ' + polyText(cx);
    return { f, r2, label };
  }
  function binomC(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  const sgnTerm = (c, t) => (c < 0 ? ' − ' : ' + ') + fmt(Math.abs(c), 3) + t;
  function polyText(c) {
    let s = '';
    for (let k = c.length - 1; k >= 0; k--) {
      const t = k === 0 ? '' : k === 1 ? 'x' : 'x' + (k === 2 ? '²' : '³');
      if (!s) s = fmt(c[k], 3) + t;
      else s += sgnTerm(c[k], t);
    }
    return s;
  }
  // a number as a reader writes it: significant digits, the minus sign, no trailing zeros
  function fmt(v, sig) {
    if (!Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    let t;
    if (a >= 1e6 || a < 1e-4) t = v.toExponential(sig - 1).replace(/\.?0+e/, 'e');
    else { const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a))); t = v.toFixed(Math.min(8, d)); if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, ''); }
    return t.replace('-', '−');
  }
  // a slider's value at its step's precision
  function fmtStep(v, step) {
    const d = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
    let t = v.toFixed(d);
    if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
    if (/^-0$/.test(t)) t = '0';
    return t.replace('-', '−');
  }

  // The axes: their ranges, from the description where it gives them, else from what is drawn
  // at the sliders' starting values (kept while they move, so a slider's effect is seen)
  function ranges(s) {
    const { series } = compute(s, defaults(s));
    const xs = [], ys = [];
    for (const S of series) for (const p of S.pts) if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
    const pad = (lo, hi, f = 0.06) => { if (!(hi > lo)) { const c = Number.isFinite(lo) ? lo : 0; return [c - 1, c + 1]; } const d = (hi - lo) * f; return [lo - d, hi + d]; };
    // most of the values, where a few run off to infinity (tan x near its poles)
    const robust = (a) => {
      if (!a.length) return [0, 1];
      const v = a.slice().sort((p, q) => p - q), q = (f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
      const lo = v[0], hi = v[v.length - 1], l5 = q(0.05), h5 = q(0.95);
      if (!(hi - lo > 10 * (h5 - l5) && h5 > l5)) return [lo, hi];
      const d = (h5 - l5) * 0.15;
      return [Math.max(lo, l5 - d), Math.min(hi, h5 + d)];
    };
    let X, Y;
    if (s.kind === 'function') { X = [s.x.min, s.x.max]; Y = pad(...robust(ys)); }
    else if (s.kind === 'dist') {
      X = [s.x.min, s.x.max];
      const top = ys.length ? Math.max(...ys) : 1;
      Y = [0, (top > 0 ? top : 1) * 1.12];
      if (s.dist.mode === 'mean') Y = [0, Math.max(0.5, top * 1.15)];
    } else if (s.kind === 'curve') {
      X = pad(...extent(xs), 0.08); Y = pad(...extent(ys), 0.08);
    } else { X = pad(...extent(xs)); Y = pad(...robust(ys)); }
    if (s.x.min != null && s.kind !== 'function' && s.kind !== 'dist') X[0] = s.x.min;
    if (s.x.max != null && s.kind !== 'function' && s.kind !== 'dist') X[1] = s.x.max;
    if (s.y.min != null) Y[0] = s.y.min;
    if (s.y.max != null) Y[1] = s.y.max;
    if (!(X[1] > X[0])) X = [X[0] - 1, X[0] + 1];
    if (!(Y[1] > Y[0])) Y = [Y[0] - 1, Y[0] + 1];
    return { X, Y, equal: s.kind === 'curve' && s.x.min == null && s.x.max == null && s.y.min == null && s.y.max == null };
  }

  function ticks(lo, hi, n) {
    const step = niceStep((hi - lo) / Math.max(2, n)), out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9 && out.length < 40; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { step, out };
  }
  const tickText = (v, step) => fmtStep(v, step);

  // ---- drawing ----------------------------------------------------------------------------------
  // The reference palette's categorical slots in their fixed order (on white paper), ink and
  // recessive grid: the page is paper in dark mode too, so one set
  const SLOT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
  const INK = '#0b0b0b', INK2 = '#52514e', GRID = '#e8e7e3', ZERO = '#b9b8b3';
  const FONT = 'Georgia, "Times New Roman", Times, serif';

  // paint(g, s, data, R, vals, W, H, hover): one picture on a 2D context of W by H CSS pixels.
  // data from compute, R from ranges; hover { x, y } in pixels for the live figure's readout
  function paint(g, s, data, R, vals, W, H, hover) {
    g.clearRect(0, 0, W, H);
    g.font = '12px ' + FONT;
    let [x0, x1] = R.X, [y0, y1] = R.Y;
    const yt0 = ticks(y0, y1, Math.max(3, Math.round(H / 55)));
    let L = 14;
    for (const v of yt0.out) L = Math.max(L, g.measureText(tickText(v, yt0.step)).width + 12);
    if (s.y.label) L += 16;
    const Rm = 14, T = 12, B = 28 + (s.x.label ? 16 : 0);
    const pw = Math.max(10, W - L - Rm), ph = Math.max(10, H - T - B);
    if (R.equal) {
      // a circle drawn as a circle: the larger of the two scales for both
      const sx = (x1 - x0) / pw, sy = (y1 - y0) / ph, k = Math.max(sx, sy);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      x0 = cx - k * pw / 2; x1 = cx + k * pw / 2; y0 = cy - k * ph / 2; y1 = cy + k * ph / 2;
    }
    const X = (x) => L + (x - x0) / (x1 - x0) * pw, Y = (y) => T + ph - (y - y0) / (y1 - y0) * ph;
    const clampPx = (v) => Math.max(-1e5, Math.min(1e5, v));
    const xt = ticks(x0, x1, Math.max(3, Math.round(pw / 80))), yt = R.equal ? ticks(y0, y1, Math.max(3, Math.round(ph / 55))) : yt0;
    // grid, then the zero lines, then the frame's two sides
    g.lineWidth = 1;
    g.strokeStyle = GRID;
    g.beginPath();
    for (const v of xt.out) { const p = Math.round(X(v)) + 0.5; g.moveTo(p, T); g.lineTo(p, T + ph); }
    for (const v of yt.out) { const p = Math.round(Y(v)) + 0.5; g.moveTo(L, p); g.lineTo(L + pw, p); }
    g.stroke();
    if (s.kind !== 'dist') {
      g.strokeStyle = ZERO;
      g.beginPath();
      if (x0 < 0 && x1 > 0) { const p = Math.round(X(0)) + 0.5; g.moveTo(p, T); g.lineTo(p, T + ph); }
      if (y0 < 0 && y1 > 0) { const p = Math.round(Y(0)) + 0.5; g.moveTo(L, p); g.lineTo(L + pw, p); }
      g.stroke();
    }
    g.strokeStyle = INK2;
    g.beginPath(); g.moveTo(L + 0.5, T); g.lineTo(L + 0.5, T + ph + 0.5); g.lineTo(L + pw, T + ph + 0.5); g.stroke();
    // tick labels in the secondary ink, minus signs as minus signs
    g.fillStyle = INK2;
    g.textAlign = 'center'; g.textBaseline = 'top';
    let last = -Infinity;
    for (const v of xt.out) {
      const p = X(v), t = tickText(v, xt.step), w = g.measureText(t).width;
      if (p - w / 2 < last + 6) continue;
      g.beginPath(); g.moveTo(Math.round(p) + 0.5, T + ph); g.lineTo(Math.round(p) + 0.5, T + ph + 4); g.stroke();
      g.fillText(t, p, T + ph + 6);
      last = p + w / 2;
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of yt.out) { const p = Y(v); g.beginPath(); g.moveTo(L - 4, Math.round(p) + 0.5); g.lineTo(L, Math.round(p) + 0.5); g.stroke(); g.fillText(tickText(v, yt.step), L - 6, p); }
    g.font = 'italic 13px ' + FONT;
    g.fillStyle = INK;
    if (s.x.label) { g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(s.x.label, L + pw / 2, H - 2); }
    if (s.y.label) { g.save(); g.translate(12, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.y.label, 0, 0); g.restore(); }
    // the data, clipped to the plot
    g.save();
    g.beginPath(); g.rect(L, T - 1, pw + 1, ph + 2); g.clip();
    const yspan = y1 - y0;
    for (const S of data.series) {
      const col = SLOT[S.slot % SLOT.length];
      if (S.kind === 'bars') {
        const base = Y(Math.max(0, y0));
        for (const [x, y] of S.pts) {
          if (!(y > 0)) continue;
          const a = X(x - S.w / 2) + 1, b = X(x + S.w / 2) - 1, top = Y(Math.min(y, y1 + yspan));
          g.fillStyle = S.hist ? 'rgba(42,120,214,0.30)' : col;
          g.fillRect(a, top, Math.max(1, b - a), base - top);
          if (S.hist) { g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(a + 0.5, top + 0.5, Math.max(0, b - a - 1), base - top - 0.5); }
        }
        continue;
      }
      if (S.kind === 'points') {
        for (const [x, y] of S.pts) {
          g.beginPath(); g.arc(X(x), Y(y), 4, 0, 2 * Math.PI);
          g.fillStyle = col; g.fill();
          g.lineWidth = 1.5; g.strokeStyle = '#ffffff'; g.stroke();
        }
        continue;
      }
      // a line, cut where it is undefined or jumps across the plot (tan x at its poles)
      g.beginPath();
      let pen = false, prev = null;
      for (const p of S.pts) {
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { pen = false; prev = null; continue; }
        const jump = !S.curve && prev && Math.abs(p[1] - prev[1]) > 3 * yspan && Math.sign(p[1] - (y0 + y1) / 2) !== Math.sign(prev[1] - (y0 + y1) / 2);
        const px = clampPx(X(p[0])), py = clampPx(Y(p[1]));
        if (pen && !jump) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true; prev = p;
      }
      if (S.kind === 'area') {
        // the density's area, faint, under its line
        g.save();
        g.lineTo(X(S.pts[S.pts.length - 1][0]), Y(0)); g.lineTo(X(S.pts[0][0]), Y(0)); g.closePath();
        g.fillStyle = 'rgba(42,120,214,0.14)'; g.fill();
        g.restore();
        g.beginPath(); pen = false;
        for (const p of S.pts) { if (!Number.isFinite(p[1])) { pen = false; continue; } const px = X(p[0]), py = clampPx(Y(p[1])); if (pen) g.lineTo(px, py); else g.moveTo(px, py); pen = true; }
      }
      g.setLineDash(S.dash ? [6, 4] : []);
      g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    // the legend, top left inside the plot: each series' swatch and its formula, in ink
    g.font = '12px ' + FONT;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const items = data.series.filter((S) => S.label && !(s.kind === 'data' && S.kind === 'points' && data.series.length === 1));
    let ly = T + 12;
    const lw = Math.min(pw - 24, Math.max(0, ...items.map((S) => g.measureText(S.label).width)) + 30);
    if (items.length) {
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.fillRect(L + 6, T + 3, lw, items.length * 17 + 4);
    }
    for (const S of items) {
      const col = SLOT[S.slot % SLOT.length];
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
      if (S.kind === 'points') { g.beginPath(); g.arc(L + 19, ly, 3.5, 0, 2 * Math.PI); g.fill(); }
      else if (S.kind === 'bars') g.fillRect(L + 12, ly - 4, 14, 8);
      else { g.setLineDash(S.dash ? [4, 3] : []); g.beginPath(); g.moveTo(L + 11, ly); g.lineTo(L + 27, ly); g.stroke(); g.setLineDash([]); }
      g.fillStyle = INK;
      g.fillText(clip(g, S.label, lw - 26), L + 32, ly);
      ly += 17;
    }
    // the sliders' values, top right: the picture says what it shows, in the PDF too
    if (s.sliders.length) {
      const t = s.sliders.map((q) => q.name + ' = ' + fmtStep(q.name in vals ? vals[q.name] : q.value, q.step)).join(',  ');
      g.textAlign = 'right'; g.fillStyle = INK2; g.font = 'italic 12px ' + FONT;
      const w = g.measureText(t).width;
      g.fillStyle = 'rgba(255,255,255,0.86)'; g.fillRect(L + pw - w - 10, T + 3, w + 8, 17);
      g.fillStyle = INK2;
      g.fillText(t, L + pw - 6, T + 12);
    }
    // the live figure's readout under the pointer
    if (hover && hover.x >= L && hover.x <= L + pw && hover.y >= T && hover.y <= T + ph) readout(g, s, data, { X, Y, x0, x1, L, T, pw, ph }, hover);
    return { L, T, pw, ph };
  }
  function clip(g, t, w) {
    if (g.measureText(t).width <= w) return t;
    while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t + '…';
  }
  function readout(g, s, data, A, hover) {
    const { X, Y, x0, x1, L, T, pw, ph } = A;
    const xv = x0 + (hover.x - L) / pw * (x1 - x0);
    const marks = [];
    let best = null;
    for (const S of data.series) {
      if (S.kind === 'line' && !S.curve || S.kind === 'area') {
        // the value at the pointer's x, read off the samples
        let k = 0;
        for (let i = 1; i < S.pts.length; i++) if (Math.abs(S.pts[i][0] - xv) < Math.abs(S.pts[k][0] - xv)) k = i;
        const p = S.pts[k];
        if (p && Number.isFinite(p[1])) marks.push({ p, S });
      } else {
        for (const p of S.pts) {
          if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
          const d = Math.hypot(X(p[0]) - hover.x, (S.kind === 'bars' ? hover.y : Y(p[1])) - hover.y);
          if (S.kind === 'bars' && Math.abs(X(p[0]) - hover.x) > Math.abs(X(p[0] + S.w / 2) - X(p[0]))) continue;
          if (!best || d < best.d) best = { d, p, S };
        }
      }
    }
    if (best && (best.d < 28 || best.S.kind === 'bars')) marks.push(best);
    g.save();
    g.strokeStyle = 'rgba(82,81,78,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(Math.round(hover.x) + 0.5, T); g.lineTo(Math.round(hover.x) + 0.5, T + ph); g.stroke();
    const lines = [];
    for (const m of marks.slice(0, 4)) {
      const col = SLOT[m.S.slot % SLOT.length];
      if (m.S.kind !== 'bars') { g.beginPath(); g.arc(X(m.p[0]), Y(m.p[1]), 4.5, 0, 2 * Math.PI); g.fillStyle = col; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke(); }
      lines.push(m.S.kind === 'bars' && m.S.hist ? 'density ' + fmt(m.p[1], 3) : '(' + fmt(m.p[0], 4) + ', ' + fmt(m.p[1], 4) + ')');
    }
    if (lines.length) {
      g.font = '12px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
      const w = Math.max(...lines.map((t) => g.measureText(t).width)) + 12, h = lines.length * 16 + 6;
      let bx = hover.x + 10, by = hover.y - h - 8;
      if (bx + w > L + pw) bx = hover.x - w - 10;
      if (by < T) by = hover.y + 12;
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = '#c3c2b7'; g.lineWidth = 1;
      g.fillRect(bx, by, w, h); g.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
      g.fillStyle = INK;
      lines.forEach((t, k) => g.fillText(t, bx + 6, by + 11 + k * 16));
    }
    g.restore();
  }

  // ---- the widget: its sliders and its canvas, in the graph's own frame -------------------------
  function mount() {
    const D = document, box = D.getElementById('rk'), cv = D.getElementById('rk-c'), row = D.getElementById('rk-s'), msg = D.getElementById('rk-e');
    let s, R, data, hover = null;
    const vals = {};
    const say = (t) => { msg.textContent = t; msg.hidden = !t; };
    try { s = normalize(JSON.parse(D.getElementById('rikuy-graph').textContent)); R = ranges(s); } catch (e) { say('This graph cannot be drawn: ' + e.message); post(); return; }
    Object.assign(vals, defaults(s));
    const outs = [], list = D.createElement('div');
    list.className = 'rk-l';
    row.append(list);
    s.sliders.forEach((q, k) => {
      const r = D.createElement('div'); r.className = 'rk-r';
      const lab = D.createElement('label'); lab.htmlFor = 'rk-' + k; lab.textContent = q.name;
      const inp = D.createElement('input'); inp.type = 'range'; inp.id = 'rk-' + k;
      inp.min = String(q.min); inp.max = String(q.max); inp.step = String(q.step); inp.value = String(q.value);
      const out = D.createElement('output'); out.htmlFor = inp.id; out.textContent = fmtStep(q.value, q.step);
      inp.addEventListener('input', () => { vals[q.name] = +inp.value; out.textContent = fmtStep(+inp.value, q.step); redraw(true); });
      r.append(lab, inp, out);
      list.append(r);
      outs.push([inp, out, q]);
    });
    if (s.sliders.length) {
      // back to the values the PDF's picture shows
      const b = D.createElement('button'); b.type = 'button'; b.id = 'rk-reset'; b.textContent = 'Reset'; b.title = 'Back to the values the PDF shows';
      b.addEventListener('click', () => { for (const [inp, out, q] of outs) { inp.value = String(q.value); out.textContent = fmtStep(q.value, q.step); vals[q.name] = q.value; } redraw(true); });
      row.append(b);
    }
    cv.setAttribute('aria-label', s.title || 'Interactive graph');
    let W = 0, H = 0;
    function redraw(again) {
      W = Math.max(120, Math.round(cv.clientWidth || box.clientWidth || 600));
      H = Math.round(W * s.aspect);
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
      if (again || !data) { try { data = compute(s, vals); say(''); } catch (e) { say(e.message); data = { series: [] }; } }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(g, s, data, R, vals, W, H, hover);
      post();
    }
    function post() {
      // the page sizes this frame to what the graph needs
      try { parent.postMessage({ rikuy: 'height', px: Math.ceil(box.getBoundingClientRect().height) }, '*'); } catch (e) { /* no parent */ }
    }
    const point = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && !e.buttons) return; hover = point(e); redraw(false); });
    cv.addEventListener('pointerdown', (e) => { hover = point(e); redraw(false); });
    cv.addEventListener('pointerleave', () => { hover = null; redraw(false); });
    // Rikuy's own menu for this graph (Edit graph): a right click, or a long press on a touch
    // screen, says where to the page, which opens it; the frame keeps everything else
    const menu = (x, y) => { try { parent.postMessage({ rikuy: 'menu', x: Math.round(x), y: Math.round(y) }, '*'); } catch (e) { /* no parent */ } };
    D.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('input')) return; e.preventDefault(); menu(e.clientX, e.clientY); });
    let hold = null;
    cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (!t || e.touches.length > 1) return; const x = t.clientX, y = t.clientY; clearTimeout(hold); hold = setTimeout(() => { hold = null; menu(x, y); }, 600); }, { passive: true });
    for (const n of ['touchend', 'touchcancel', 'touchmove']) cv.addEventListener(n, () => { clearTimeout(hold); hold = null; }, { passive: true });
    window.addEventListener('resize', () => redraw(false));
    redraw(true);
  }

  return { parse, names, compile, normalize, formulas, unknownNames, defaults, compute, ranges, paint, mount, fmt, fmtStep, FAM, FITS, KINDS, sizeName, niceStep };
}

// ---- the editor's side: the widget's file, read back, and the PDF's picture -------------------

const K = graphKit();
export const kit = K;

const MARK = '<script type="application/json" id="rikuy-graph">';
const MAX_FILE = 2e6;

const escHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The widget's file for a description: the description as JSON (what Rikuy reads back to edit it),
// the frame's style and the script, graphKit's own text. One file, nothing from the network.
export function graphHtml(spec) {
  const s = K.normalize(spec);
  // (in a script element only "</" could end it early: as \u003c the JSON reads the same)
  const json = JSON.stringify(s, null, 1).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + escHTML(s.title || 'Interactive graph') + '</title>\n' +
    '<!-- An interactive graph made by Rikuy (Insert, Interactive graph): Rikuy reads the graph back\n' +
    '     from the JSON below to edit it; the script draws it. TeX prints its fallback picture. -->\n' +
    MARK + '\n' + json + '\n</script>\n' +
    '<style>\n' + STYLE + '</style>\n</head>\n<body>\n' +
    '<div id="rk"><canvas id="rk-c" role="img"></canvas><div id="rk-s"></div><p id="rk-e" role="status" hidden></p></div>\n' +
    '<script>\n(' + graphKit.toString() + ')().mount();\n</script>\n</body>\n</html>\n';
}

const STYLE = [
  'html, body { margin: 0; background: transparent; }',
  'body { color: #0b0b0b; font: 13px/1.35 Georgia, "Times New Roman", Times, serif; }',
  '#rk { padding: 2px 0 4px; }',
  'canvas { display: block; width: 100%; touch-action: pan-y; }',
  '#rk-s { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 14px; align-items: center; margin: 4px 8px 0 40px; }',
  '#rk-s:empty { display: none; }',
  '.rk-l { display: flex; flex-wrap: wrap; gap: 2px 22px; min-width: 0; }',
  '.rk-r { display: flex; align-items: center; gap: 8px; flex: 1 1 230px; min-width: 0; }',
  '.rk-r label { font-style: italic; min-width: 1.4em; text-align: right; }',
  'input[type=range] { flex: 1; min-width: 60px; margin: 0; accent-color: #2a78d6; }',
  'output { min-width: 3.5em; font-variant-numeric: tabular-nums; color: #52514e; }',
  'button { font: 12px system-ui, sans-serif; color: #0b0b0b; background: #fff; border: 1px solid #c3c2b7; border-radius: 6px; padding: 3px 10px; cursor: pointer; }',
  'button:hover { border-color: #2a78d6; }',
  '#rk-e { margin: 4px 40px; color: #b3261e; font: 12px system-ui, sans-serif; }',
  // (the page shows a widget at its zoom, about 0.75 on a phone: 58 px here are 44 on the screen)
  '@media (pointer: coarse) { .rk-r { min-height: 58px; } input[type=range] { height: 58px; } button { min-height: 58px; min-width: 58px; font-size: 15px; } }',
  ''
].join('\n');

// Whether a file's text is a graph Rikuy made (its description, before any other script)
export function isGraph(html) {
  if (typeof html !== 'string' || html.length > MAX_FILE) return false;
  const k = html.indexOf(MARK);
  return k >= 0 && k < 4000;
}

// The description of a graph's file, or null: a file Rikuy did not make, or one whose
// description no longer parses
export function readGraph(html) {
  if (!isGraph(html)) return null;
  const a = html.indexOf(MARK) + MARK.length, b = html.indexOf('</script>', a);
  if (b < 0 || b - a > 1e6) return null;
  try { return K.normalize(JSON.parse(html.slice(a, b))); } catch (e) { return null; }
}

// whether two descriptions draw the same graph
export const sameGraph = (a, b) => JSON.stringify(K.normalize(a)) === JSON.stringify(K.normalize(b));

// The templates of the gallery: a good first graph of each kind
export const TEMPLATES = [
  { id: 'function', name: 'Function', title: 'A function of x with sliders for its parameters', spec: { kind: 'function', f: ['a sin(b x)'], x: { min: -6.2832, max: 6.2832, label: 'x' }, y: { label: 'y' }, sliders: [{ name: 'a', min: 0, max: 3, step: 0.1, value: 1 }, { name: 'b', min: 0.2, max: 4, step: 0.1, value: 1 }] } },
  { id: 'data', name: 'Data and fit', title: 'Points pasted from a table, with a least squares fit', spec: { kind: 'data', data: { points: [[0, 1.1], [1, 2.9], [2, 5.2], [3, 6.8], [4, 9.1], [5, 11.2], [6, 12.8], [7, 15.1]], fit: 'linear', model: '' }, x: { label: 'x' }, y: { label: 'y' }, sliders: [] } },
  { id: 'curve', name: 'Curve', title: 'A parametric curve (x(t), y(t)) or a polar curve r(θ)', spec: { kind: 'curve', curve: { mode: 'polar', r: '1 + a cos(k θ)', t: [0, 6.2832] }, x: { label: 'x' }, y: { label: 'y' }, sliders: [{ name: 'a', min: 0, max: 2, step: 0.05, value: 0.5 }, { name: 'k', min: 1, max: 8, step: 1, value: 3 }] } },
  { id: 'dist', name: 'Distribution', title: 'A distribution with sliders for its parameters, or the mean of n draws (the central limit theorem)', spec: { kind: 'dist', dist: { family: 'exponential', mode: 'mean' }, sliders: [] } }
];
export const template = (id) => K.normalize((TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]).spec);

// The PDF's picture: the graph at its sliders' starting values, drawn by the same code the live
// figure runs, W CSS pixels wide (the text's width), at scale times the pixels for print
export function graphCanvas(spec, W, scale = 3) {
  const s = K.normalize(spec);
  W = Math.max(200, Math.min(1200, Math.round(W)));
  const H = Math.round(W * s.aspect);
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const g = c.getContext('2d');
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const vals = K.defaults(s);
  K.paint(g, s, K.compute(s, vals), K.ranges(s), vals, W, H, null);
  return c;
}
export function graphPNG(spec, W, scale) {
  const c = graphCanvas(spec, W, scale);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('The picture could not be made'))), 'image/png'));
}

// Data pasted from a spreadsheet, a CSV or typed: two numbers a line (the first two columns);
// a header line and lines without two numbers are left out. Bounded: 2000 points.
export function parseData(text) {
  const pts = [];
  const lines = String(text).slice(0, 200000).split(/\r?\n/);
  for (const line of lines) {
    if (pts.length >= 2000) break;
    // commas between numbers, or decimal commas between semicolons or tabs (European CSV)
    const cells = (/[;\t]/.test(line) ? line.split(/[;\t]/).map((c) => c.replace(',', '.')) : line.split(/[,\s]+/)).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const x = Number(cells[0].replace('−', '-')), y = Number(cells[1].replace('−', '-'));
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  return pts;
}
export const dataText = (pts) => pts.map((p) => p[0] + '\t' + p[1]).join('\n');

// rikuy.sty, as sample/widget has it: written beside the main file when the project has none
export const RIKUY_STY = `% rikuy.sty: a live figure on Rikuy's typeset page, the same figure as a picture in every TeX.
%
%   \\rikuywidget[<\\includegraphics options>]{<widget .html>}{<fallback image>}
%
% TeX (Rikuy's PDF pane, Overleaf, a desktop TeX Live) prints the fallback image with
% \\includegraphics and never opens the widget file. Rikuy's typeset page runs the widget: a self
% contained HTML file of the project (inline script and style, nothing from the network) in a
% sandboxed frame as wide as the text. The widget sets the frame's height by sending
%   parent.postMessage({rikuy: "height", px: <integer>}, "*")
% Both paths are relative to the main .tex file; keep this file beside it.
%
% This file is in the public domain: copy it into any document.
\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{rikuy}[2026/10/30 v1.0 Live figures in Rikuy, pictures in print]
\\RequirePackage{graphicx}
% robust, so that it survives a moving argument as \\includegraphics does
\\DeclareRobustCommand\\rikuywidget[3][]{\\includegraphics[#1]{#3}}
\\endinput
`;
