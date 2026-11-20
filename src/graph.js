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
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', varphi: 'φ', vartheta: 'θ', varepsilon: 'ε', varrho: 'ρ',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
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
    frac: (a, b) => a / b,
    // \sqrt[n]{x}: a negative number's odd root is real
    root: (x, n) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n))
  };
  // the functions that take more than one argument, and how many at most
  const ARGS = { log: 2, min: 8, max: 8, mod: 2, atan2: 2, binom: 2, normpdf: 3, normcdf: 3, frac: 2, if: 3, root: 2 };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const KNOWN = Object.keys(FN).concat(['if'], Object.keys(GREEK), Object.keys(CONST));

  // Tokens: numbers, names, operators. A run of letters is cut into names the way Desmos does
  // (ax is a times x, sinx is sin x): the longest known name at each place, else one letter;
  // names the graph declares (its sliders) count as known, so a slider called "amp" is one name.
  function tokens(text, names) {
    let s = String(text);
    if (s.length > MAXF) throw err('The formula is longer than ' + MAXF + ' characters', MAXF);
    // LaTeX as an equation of a paper writes it: sizes and spacing go, \dfrac is \frac, \frac12
    // is \frac{1}{2}, \mathrm{e} and \operatorname{sgn} are their letters (lengths kept where
    // they can be, so a mistake is said near where it is)
    s = s.replace(/\\left\s*(?:\||\\[lv]vert(?![A-Za-z]))|\\lvert(?![A-Za-z])/g, ' abs(').replace(/\\right\s*(?:\||\\[rv]vert(?![A-Za-z]))|\\rvert(?![A-Za-z])/g, ') ').replace(/\\(?:left|right)\s*\./g, ' ').replace(/\\(?:left|right|[bB]igg?[lrm]?)(?![A-Za-z])/g, ' ').replace(/\\(?:displaystyle|textstyle|scriptstyle|limits|nolimits)(?![A-Za-z])/g, ' ')
      .replace(/\\[dtc]frac(?![A-Za-z])/g, '\\frac').replace(/\\frac\s*(\d)\s*(\d)/g, '\\frac{$1}{$2}')
      .replace(/\\(?:mathrm|mathit|mathnormal|operatorname\*?|textrm|textit|text)\s*\{\s*([A-Za-z]{1,12})\s*\}/g, ' $1 ')
      .replace(/\\[vV]ert(?![A-Za-z])/g, '|').replace(/\\[{}]/g, (m) => (m[1] === '{' ? '(' : ')'))
      .replace(/\\(?:cdot|times|ast)(?![A-Za-z])|[·×⋅∗]/g, '*').replace(/\\div(?![A-Za-z])/g, '/').replace(/\\(?:leq?|leqslant)(?![A-Za-z])/g, '<=').replace(/\\(?:geq?|geqslant)(?![A-Za-z])/g, '>=')
      .replace(/[−–]/g, '-').replace(/÷/g, '/').replace(/\*\*/g, '^')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\\[,;:! ]|[~&]/g, ' ');
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
      if ('+-*/^(),!|{}[]'.includes(ch)) { out.push({ t: 'op', v: ch === '{' || ch === '[' ? '(' : ch === '}' || ch === ']' ? ')' : ch, at: i, br: ch }); i++; continue; }
      throw err('"' + ch + '" is not part of a formula', i);
    }
    // Greek letters by name; gamma before a bracket is the function
    out.forEach((t, k) => { if (t.t === 'name' && own(GREEK, t.v) && !(t.v === 'gamma' && out[k + 1] && out[k + 1].v === '(')) t.v = GREEK[t.v]; });
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
    const isFn = (t) => t && t.t === 'name' && (own(FN, t.v) || t.v === 'if');
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
        if (t.bs && !own(CONST, t.v) && !/^[α-ωΑ-Ω]$/.test(t.v)) throw err('\\' + t.v + ' is not a function this graph knows', t.at);
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
      // \sqrt[3]{x}: the root's index in square brackets, then the group
      if (name === 'sqrt' && t.bs && isOp('(') && T[i].br === '[' && !power) {
        i++;
        const k = cmp();
        if (!isOp(')')) throw err('A bracket is not closed', at());
        i++;
        if (!isOp('(')) throw err('\\sqrt[n] needs {…} after it', at());
        i++;
        const x = cmp();
        if (!isOp(')')) throw err('A bracket is not closed', at());
        i++;
        return node(['f', 'root', [x, k]]);
      }
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
      const max = ARGS[name] || 1, min = name === 'if' ? 3 : name === 'frac' || name === 'mod' || name === 'atan2' || name === 'binom' || name === 'root' ? 2 : 1;
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
    if (tree[0] === 'v') { if (!own(CONST, tree[1])) out.add(tree[1]); }
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
      if (own(CONST, tree[1])) { const v = CONST[tree[1]]; return () => v; }
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
      case '^': {
        // (a number for the power, the usual case: its kind settled once, x^2 as a product)
        if (tree[2][0] === 'n') {
          const y = tree[2][1];
          if (y === 2) return (e) => { const x = a(e); return x * x; };
          if (y === Math.round(y)) return (e) => Math.pow(a(e), y);
          const q = 1 / y, r = Math.round(q), odd = Math.abs(q - r) < 1e-9 && Math.abs(r) % 2 === 1;
          return odd ? (e) => { const x = a(e); return x < 0 ? -Math.pow(-x, y) : Math.pow(x, y); } : (e) => Math.pow(a(e), y);
        }
        return (e) => { const x = a(e), y = b(e); if (x < 0 && y !== Math.round(y)) { const q = 1 / y, r = Math.round(q); if (Math.abs(q - r) < 1e-9 && Math.abs(r) % 2 === 1) return -Math.pow(-x, y); } return Math.pow(x, y); };
      }
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
    binomial: { name: 'Binomial', discrete: true, p: [['n', 1, 100, 1, 10], ['p', 0, 1, 0.01, 0.3]], x: [0, 10], pdf: (k, P) => { if (k < 0 || k > P.n || k !== Math.floor(k)) return 0; if (P.p <= 0) return k === 0 ? 1 : 0; if (P.p >= 1) return k === P.n ? 1 : 0; return Math.exp(lg(P.n + 1) - lg(k + 1) - lg(P.n - k + 1) + k * Math.log(P.p) + (P.n - k) * Math.log(1 - P.p)); }, mean: (P) => P.n * P.p, vari: (P) => P.n * P.p * (1 - P.p),
      // (by its cdf, a search per draw: n uniform numbers a draw froze the page at n = 100)
      draw: (r, P) => { const c = cdfOf(FAM.binomial, P, Math.round(P.n)); const u = r(); let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < u) lo = m + 1; else hi = m; } return lo; } },
    poisson: { name: 'Poisson', discrete: true, p: [['λ', 0.5, 20, 0.1, 4]], x: [0, 15], pdf: (k, P) => (k < 0 || k !== Math.floor(k) ? 0 : Math.exp(k * Math.log(P.λ) - P.λ - lg(k + 1))), mean: (P) => P.λ, vari: (P) => P.λ, draw: (r, P) => { const L = Math.exp(-P.λ); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 400); return k - 1; } }
  };
  // a discrete family's cdf at 0..n, kept for the values it was made for
  let cdfKey = '', cdfVal = null;
  function cdfOf(F, P, n) {
    const key = n + ':' + P.p;
    if (key !== cdfKey) { const c = []; let acc = 0; for (let k = 0; k <= n; k++) { acc += F.pdf(k, P); c.push(acc); } c[n] = 1; cdfKey = key; cdfVal = c; }
    return cdfVal;
  }
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
  const KINDS = ['function', 'data', 'curve', 'implicit', 'phase', 'dist'];
  // a variable's or a slider's name: letters, Greek, a subscript
  const NAME = /^[A-Za-zα-ωΑ-Ω][A-Za-z0-9α-ωΑ-Ω]*(_[A-Za-z0-9]{1,8})?$/;
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
    // the variables a kind draws against (a function of k, an indifference curve in x_1 and x_2)
    const vname = (v, d) => { const t = str(v, 16).trim(); return NAME.test(t) && !own(CONST, t) && !own(FN, t) ? t : d; };
    const two = (v, a, b) => { const V = Array.isArray(v) ? v : []; const x = vname(V[0], a); let y = vname(V[1], b); if (y === x) y = x === b ? a : b; return [x, y]; };
    if (kind === 'function') {
      s.vars = [vname(Array.isArray(r.vars) ? r.vars[0] : null, 'x')];
      s.f = (Array.isArray(r.f) ? r.f : ['sin(x)']).slice(0, 6).map((f) => str(f, MAXF)).filter((f) => f.trim());
      if (!s.f.length) s.f = ['sin(' + s.vars[0] + ')'];
      s.x = ax(r.x, -5, 5, s.vars[0]);
      s.y = ax(r.y, null, null, 'y');
      // where two curves cross: true (every pair) or the pairs [[i, j]]
      s.cross = r.cross === true ? true : (Array.isArray(r.cross) ? r.cross : []).slice(0, 8).filter((q) => Array.isArray(q) && q.length === 2 && q.every((k) => Number.isInteger(k) && k >= 0 && k < s.f.length) && q[0] !== q[1]).map((q) => [q[0], q[1]]);
      if (Array.isArray(s.cross) && !s.cross.length) s.cross = false;
      // shaded areas: under curve a down to b (another curve, 'axis', or 'cross', the level where
      // a meets curve w), from and to a formula of the sliders or 'cross' (where a meets w)
      const end = (v, d) => { const t = str(v, 80, d).trim(); return t || d; };
      s.shade = (Array.isArray(r.shade) ? r.shade : []).slice(0, 4).filter((q) => q && typeof q === 'object' && Number.isInteger(q.a) && q.a >= 0 && q.a < s.f.length).map((q) => {
        const b = q.b === 'axis' || q.b === 'cross' ? q.b : Number.isInteger(q.b) && q.b >= 0 && q.b < s.f.length && q.b !== q.a ? q.b : 'axis';
        const w = Number.isInteger(q.w) && q.w >= 0 && q.w < s.f.length && q.w !== q.a ? q.w : Number.isInteger(b) ? b : (q.a === 0 ? 1 : 0);
        return { a: q.a, b, w: w < s.f.length ? w : null, from: end(q.from, 'min'), to: end(q.to, 'max'), label: str(q.label, 60) };
      });
    } else if (kind === 'implicit') {
      s.vars = two(r.vars, 'x', 'y');
      s.eq = (Array.isArray(r.eq) ? r.eq : ['x^2 + y^2 = 4']).slice(0, 4).map((f) => str(f, MAXF)).filter((f) => f.trim());
      if (!s.eq.length) s.eq = [s.vars[0] + '^2 + ' + s.vars[1] + '^2 = 4'];
      s.x = ax(r.x, -5, 5, s.vars[0]);
      s.y = ax(r.y, -5, 5, s.vars[1]);
    } else if (kind === 'phase') {
      s.vars = two(r.vars, 'x', 'y');
      const P = r.phase && typeof r.phase === 'object' ? r.phase : {};
      s.phase = { dx: str(P.dx, MAXF, 'y') || 'y', dy: str(P.dy, MAXF, '-x') || '-x', field: P.field !== false, nullclines: P.nullclines !== false, start: null };
      s.x = ax(r.x, -5, 5, s.vars[0]);
      s.y = ax(r.y, -5, 5, s.vars[1]);
      // the trajectory's starting point, which the reader drags (none: no trajectory)
      if (Array.isArray(P.start) && Number.isFinite(P.start[0]) && Number.isFinite(P.start[1])) s.phase.start = [num(P.start[0], 0), num(P.start[1], 0)];
      else if (P.start !== null && P.start !== false) s.phase.start = [s.x.min + (s.x.max - s.x.min) * 0.3, s.y.min + (s.y.max - s.y.min) * 0.6];
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
      if (!NAME.test(name) || seen.has(name) || own(CONST, name) || own(FN, name) || (s.vars && s.vars.includes(name))) continue;
      seen.add(name);
      let min = num(q.min, 0), max = num(q.max, 10);
      if (!(max > min)) max = min + 1;
      let step = num(q.step, 0);
      if (!(step > 0) || step > max - min) step = niceStep((max - min) / 100);
      const value = Math.max(min, Math.min(max, num(q.value, min)));
      s.sliders.push({ name, min, max, step, value });
    }
    // while a slider moves, the curves at the starting values stay, faint: what changed is seen
    if (kind !== 'data' && kind !== 'dist') s.ghost = r.ghost !== false;
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
  // An equation F = G, read as the tree of F − G (no sign: F = 0). Its sides' mistakes are said
  // where they are in the whole line.
  function parseEq(text, declared) {
    const t = String(text);
    let d = 0, k = -1;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '(' || c === '{' || c === '[') d++;
      else if (c === ')' || c === '}' || c === ']') d--;
      else if (c === '=' && d === 0 && !'<>!'.includes(t[i - 1] || '') && t[i + 1] !== '=') { if (k >= 0) throw err('An equation has one = sign', i); k = i; }
    }
    if (k < 0) return parse(t, declared);
    const side = (a, b) => { try { return parse(t.slice(a, b), declared); } catch (e) { e.at = (e.at || 0) + a; throw e; } };
    if (!t.slice(0, k).trim()) throw err('Nothing before the = sign', 0);
    if (!t.slice(k + 1).trim()) throw err('Nothing after the = sign', k + 1);
    return ['-', side(0, k), side(k + 1, t.length)];
  }
  // What each kind's formulas are read in, and against which variables:
  // [{ text, field, vars, eq, shade }]
  function sources(s) {
    const out = [];
    if (s.kind === 'function') s.f.forEach((f, k) => out.push({ text: f, field: 'f' + k, vars: s.vars }));
    if (s.kind === 'curve') {
      if (s.curve.mode === 'polar') out.push({ text: s.curve.r, field: 'r', vars: ['θ', 't'] });
      else { out.push({ text: s.curve.x, field: 'cx', vars: ['t'] }); out.push({ text: s.curve.y, field: 'cy', vars: ['t'] }); }
    }
    if (s.kind === 'implicit') s.eq.forEach((f, k) => out.push({ text: f, field: 'e' + k, vars: s.vars, eq: true }));
    if (s.kind === 'phase') { out.push({ text: s.phase.dx, field: 'dx', vars: s.vars }); out.push({ text: s.phase.dy, field: 'dy', vars: s.vars }); }
    if (s.kind === 'data' && s.data.model.trim()) out.push({ text: s.data.model, field: 'model', vars: ['x'] });
    if (s.kind === 'function') s.shade.forEach((q, k) => { for (const e of ['from', 'to']) if (!/^(min|max|cross)$/.test(q[e])) out.push({ text: q[e], field: 'shade' + k + e, vars: [], shade: true }); });
    return out;
  }
  function formulas(s) {
    const declared = s.sliders.map((q) => q.name);
    const list = [];
    for (const F of sources(s)) {
      let tree;
      try { tree = F.eq ? parseEq(F.text, declared) : parse(F.text, declared); } catch (e) { e.field = F.field; throw e; }
      for (const n of names(tree)) if (!F.vars.includes(n) && !declared.includes(n)) { const e = err('No slider is called ' + n + (F.vars.length ? ': add one, or use ' + F.vars.join(' or ') : ''), 0); e.field = F.field; e.name = n; throw e; }
      list.push({ text: F.text, field: F.field, tree, shade: !!F.shade });
    }
    return list;
  }
  // The names the formulas use that no slider has: the sliders to offer
  function unknownNames(s) {
    const declared = new Set(s.sliders.map((q) => q.name)), out = [];
    for (const F of sources(s)) {
      try { for (const n of names(F.eq ? parseEq(F.text, [...declared]) : parse(F.text, [...declared]))) if (!F.vars.includes(n) && !declared.has(n) && !out.includes(n)) out.push(n); } catch (e) { /* said elsewhere */ }
    }
    return out;
  }
  const defaults = (s) => Object.fromEntries(s.sliders.map((q) => [q.name, q.value]));

  // ---- a formula written out again: as a reader types it, or as LaTeX ---------------------------
  // show(tree, tex): the text parse reads back to the same tree's values (test/graphs.test.mjs),
  // with the brackets it needs and no more; tex: LaTeX for the PDF's legend and the web page
  const GREEK_TEX = Object.fromEntries(Object.entries(GREEK).filter(([k]) => !/^var/.test(k)).map(([k, v]) => [v, '\\' + k]));
  const TEXFN = { sin: 1, cos: 1, tan: 1, sec: 1, csc: 1, cot: 1, arcsin: 1, arccos: 1, arctan: 1, sinh: 1, cosh: 1, tanh: 1, exp: 1, ln: 1, log: 1, lg: 1, min: 1, max: 1 };
  function nameTex(n) {
    const m = /^([^_]+)(?:_(.+))?$/.exec(n);
    const base = [...m[1]].length === 1 ? (GREEK_TEX[m[1]] || m[1]) : '\\mathit{' + m[1].replace(/[α-ωΑ-Ω]/g, (c) => GREEK_TEX[c] || c) + '}';
    return m[2] ? base + '_{' + m[2] + '}' : base;
  }
  function numText(v, tex) {
    let t = String(v);
    if (/e/.test(t)) { const [a, b] = t.split('e'); t = tex ? (a === '1' ? '' : a + '\\cdot ') + '10^{' + (+b) + '}' : a + 'e' + (+b); }
    return t;
  }
  const PREC = { '<': 0, '>': 0, '<=': 0, '>=': 0, '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4 };
  const prec = (t) => (t[0] in PREC ? PREC[t[0]] : 5);
  function show(t, tex) {
    const P = (x, min) => (prec(x) < min ? (tex ? '\\left(' + show(x, tex) + '\\right)' : '(' + show(x, tex) + ')') : show(x, tex));
    switch (t[0]) {
      case 'n': return numText(t[1], tex);
      case 'v': return tex ? nameTex(t[1]) : t[1];
      case 'neg': return '-' + P(t[1], 3);
      case 'f': {
        const [, n, a] = t;
        if (tex) {
          if (n === 'sqrt') return '\\sqrt{' + show(a[0], 1) + '}';
          if (n === 'root') return '\\sqrt[' + show(a[1], 1) + ']{' + show(a[0], 1) + '}';
          if (n === 'abs') return '\\lvert ' + show(a[0], 1) + '\\rvert';
          if (n === 'frac') return '\\frac{' + show(a[0], 1) + '}{' + show(a[1], 1) + '}';
          if (n === 'factorial') return P(a[0], 5) + '!';
          return (TEXFN[n] ? '\\' + n : '\\operatorname{' + n + '}') + '\\left(' + a.map((x) => show(x, 1)).join(', ') + '\\right)';
        }
        if (n === 'factorial') return P(a[0], 5) + '!';
        if (n === 'frac') return show(['/', a[0], a[1]], false);
        return n + '(' + a.map((x) => show(x, false)).join(', ') + ')';
      }
    }
    const [op, a, b] = t;
    if (op === '+') return P(a, 1) + ' + ' + P(b, 2);
    if (op === '-') return P(a, 1) + ' - ' + P(b, 2);
    if (op === '/') return tex ? '\\frac{' + show(a, 1) + '}{' + show(b, 1) + '}' : P(a, 2) + '/' + P(b, 4);
    if (op === '^') {
      const base = a[0] === 'f' && !tex ? '(' + show(a, false) + ')' : P(a, 5);
      if (tex) return base + '^{' + show(b, 1) + '}';
      return base + '^' + (prec(b) >= 5 && b[0] !== 'f' ? show(b, false) : '(' + show(b, false) + ')');
    }
    if (op === '*') {
      // a product as written: 2x, s k^α, (n + δ) k; a number after anything gets its sign
      const L = P(a, 2), R = P(b, 3);
      if (b[0] === 'n' || b[0] === 'neg' || /^[\d.]/.test(R)) return L + (tex ? ' \\cdot ' : '·') + R;
      if (a[0] === 'n' && b[0] !== 'f') return L + (tex ? ' ' : '') + R;
      return L + ' ' + R;
    }
    return P(a, 1) + ' ' + (tex ? { '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' }[op] : op) + ' ' + P(b, 1);
  }
  // a formula's text as LaTeX (the text itself where it does not read)
  const texOf = (text, declared) => { try { return show(parse(text, declared), true); } catch (e) { return null; } };
  const eqTexOf = (text, declared) => { try { const t = parseEq(text, declared); return t[0] === '-' && /=/.test(text) ? show(t[1], true) + ' = ' + show(t[2], true) : show(t, true) + ' = 0'; } catch (e) { return null; } };

  // ---- what is drawn --------------------------------------------------------------------------
  // series: [{ kind: 'line' | 'points' | 'bars' | 'area' | 'segs' | 'fill' | 'mark' | 'arrows' |
  // 'start', pts: [[x, y]...] (null breaks a line), lines (segs: polylines), label, tex, slot }],
  // at the slider values vals
  // fast: a slider is being dragged; half the samples, the grids and the steps, the full ones once it
  // rests (mount), so a frame stays inside a phone's 16 ms
  const memo = new WeakMap();
  function compute(s, vals, N = 600, fast = false) {
    if (fast) N = Math.min(N, 300);
    const cells = fast ? 48 : 120;
    const vars = s.kind === 'curve' ? ['t', 'θ'] : s.vars || ['x'];
    const slots = {};
    vars.forEach((v, k) => { slots[v] = s.kind === 'curve' ? 0 : k; });
    const nv = s.kind === 'curve' ? 1 : vars.length;
    s.sliders.forEach((q, k) => { slots[q.name] = k + nv; });
    const env = [...new Array(nv).fill(0), ...s.sliders.map((q) => (q.name in vals ? vals[q.name] : q.value))];
    const out = [];
    const declared = s.sliders.map((q) => q.name);
    const fns = formulas(s).map((f) => ({ ...f, fn: compile(f.tree, slots) }));
    const at = (fn, v) => { env[0] = v; const y = fn(env); return Number.isFinite(y) ? y : NaN; };
    const at2 = (fn, x, y) => { env[0] = x; env[1] = y; const z = fn(env); return Number.isFinite(z) ? z : NaN; };
    if (s.kind === 'function') {
      const curves = fns.filter((f) => !f.shade);
      const xs = [];
      for (let i = 0; i <= N; i++) xs.push(s.x.min + (s.x.max - s.x.min) * i / N);
      // the legend's left side: the y label where it names the curve (p, k′, k̇, f(x)), else y
      const yl = String(s.y.label || '').trim();
      const m1 = /^([A-Za-zα-ωΑ-Ω])([\u0307′']?)(_[A-Za-z0-9]{1,8})?$/.exec(yl), m2 = /^([A-Za-zα-ωΑ-Ω]\w*)\(([A-Za-zα-ωΑ-Ω]\w*(?:_\w+)?)\)$/.exec(yl);
      const lhs = m1 || m2 ? yl : 'y';
      const lhsTex = m1 ? (m1[2] === '\u0307' ? '\\dot{' + nameTex(m1[1]) + '}' : nameTex(m1[1]) + (m1[2] ? "'" : '')) + (m1[3] ? '_{' + m1[3].slice(1) + '}' : '') : m2 ? nameTex(m2[1]) + '(' + nameTex(m2[2]) + ')' : 'y';
      curves.forEach((f, k) => {
        const pts = xs.map((x) => [x, at(f.fn, x)]);
        out.push({ kind: 'line', pts, label: lhs + ' = ' + f.text.trim(), tex: lhsTex + ' = ' + (texOf(f.text, declared) || ''), slot: k });
      });
      // where curves a and b cross, left to right: bisection from a change of sign on the samples
      // (not at the ends of the range, where a curve through the origin meets another at 0)
      const crossings = (a, b) => {
        const fa = curves[a].fn, fb = curves[b].fn, h = (x) => at(fa, x) - at(fb, x), roots = [];
        let px = xs[0], ph = h(px);
        for (let i = 1; i <= N && roots.length < 8; i++) {
          const x = xs[i], v = h(x);
          if (Number.isFinite(ph) && Number.isFinite(v) && i > 1 && (ph === 0 ? false : v === 0 ? i < N : (ph < 0) !== (v < 0))) {
            let lo = px, hi = x, hl = ph;
            for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2, hm = h(m); if (!Number.isFinite(hm)) break; if ((hm < 0) === (hl < 0) && hm !== 0) { lo = m; hl = hm; } else hi = m; }
            const r = (lo + hi) / 2, y = at(fa, r);
            // (a sign that changes through a pole is no crossing: tan x against 0)
            if (Number.isFinite(y) && Math.abs(h(r)) < 1e-6 * (1 + Math.abs(y))) roots.push([r, y]);
          }
          px = x; ph = v;
        }
        return roots;
      };
      for (const [k, q] of s.shade.entries()) {
        const fa = curves[q.a] && curves[q.a].fn;
        if (!fa) continue;
        const cr = q.w != null && curves[q.w] ? crossings(q.a, q.w)[0] : null;
        const end = (e, d) => {
          if (e === 'min') return s.x.min;
          if (e === 'max') return s.x.max;
          if (e === 'cross') return cr ? cr[0] : NaN;
          const f = fns.find((g) => g.field === 'shade' + k + d);
          return f ? at(f.fn, 0) : NaN;
        };
        let a = end(q.from, 'from'), b = end(q.to, 'to');
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
        if (a > b) [a, b] = [b, a];
        a = Math.max(a, s.x.min); b = Math.min(b, s.x.max);
        if (!(b > a)) continue;
        const lower = q.b === 'axis' ? () => 0 : q.b === 'cross' ? (cr ? () => cr[1] : null) : (x) => at(curves[q.b].fn, x);
        if (!lower) continue;
        const top = [], bot = [];
        let area = 0, prev = null;
        for (let i = 0; i <= 200; i++) {
          const x = a + (b - a) * i / 200, u = at(fa, x), l = lower(x);
          if (!Number.isFinite(u) || !Number.isFinite(l)) continue;
          top.push([x, u]); bot.push([x, l]);
          if (prev) area += (x - prev[0]) * ((u - l) + prev[1]) / 2;
          prev = [x, u - l];
        }
        if (top.length < 2) continue;
        const name = q.label || 'area';
        out.push({ kind: 'fill', pts: top.concat(bot.reverse()), label: name + ' = ' + fmt(Math.abs(area), 3), slot: q.a, area: Math.abs(area), shadeOf: k });
      }
      if (s.cross && curves.length > 1) {
        const pairs = s.cross === true ? curves.flatMap((_, i) => curves.map((__, j) => [i, j]).filter(([a, b]) => a < b)) : s.cross;
        const seen = [];
        for (const [a, b] of pairs) {
          if (!curves[a] || !curves[b]) continue;
          for (const p of crossings(a, b)) {
            if (seen.length >= 8 || seen.some((q) => Math.abs(q[0] - p[0]) < 1e-9 * (1 + Math.abs(p[0])) && Math.abs(q[1] - p[1]) < 1e-9 * (1 + Math.abs(p[1])))) continue;
            seen.push(p);
            out.push({ kind: 'mark', pts: [p], label: '(' + fmt(p[0], 3) + ', ' + fmt(p[1], 3) + ')', slot: 0 });
          }
        }
      }
    } else if (s.kind === 'curve') {
      const [t0, t1] = s.curve.t, pts = [], M = N * 2;
      for (let i = 0; i <= M; i++) {
        const t = t0 + (t1 - t0) * i / M;
        if (s.curve.mode === 'polar') { const r = at(fns[0].fn, t); pts.push([r * Math.cos(t), r * Math.sin(t)]); }
        else pts.push([at(fns[0].fn, t), at(fns[1].fn, t)]);
      }
      out.push({ kind: 'line', pts, label: s.curve.mode === 'polar' ? 'r = ' + s.curve.r.trim() : '(' + s.curve.x.trim() + ', ' + s.curve.y.trim() + ')',
        tex: s.curve.mode === 'polar' ? 'r = ' + (texOf(s.curve.r, declared) || '') : '\\left(' + (texOf(s.curve.x, declared) || '') + ',\\ ' + (texOf(s.curve.y, declared) || '') + '\\right)', slot: 0, curve: true });
    } else if (s.kind === 'implicit') {
      // (20000 pieces for the whole graph: a stranger's noisy equations stay a bounded drawing)
      fns.forEach((f, k) => out.push({ kind: 'segs', lines: contour((x, y) => at2(f.fn, x, y), s, cells, Math.floor(20000 / fns.length)), label: f.text.trim(), tex: eqTexOf(f.text, declared), slot: k }));
    } else if (s.kind === 'phase') {
      const [fx, fy] = fns.map((f) => f.fn);
      const dx = (x, y) => at2(fx, x, y), dy = (x, y) => at2(fy, x, y);
      // the field and the nullclines move with the sliders only: a dragged start point redraws the
      // path alone
      const key = env.slice(2).join(',') + (fast ? ' fast' : '');
      let m = memo.get(s);
      if (!m || m.key !== key) {
        m = { key, parts: [] };
        if (s.phase.field) {
          const nx = 19, ny = Math.max(6, Math.round(nx * s.aspect)), pts = [];
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const x = s.x.min + (s.x.max - s.x.min) * (i + 0.5) / nx, y = s.y.min + (s.y.max - s.y.min) * (j + 0.5) / ny;
            const u = dx(x, y), v = dy(x, y);
            if (Number.isFinite(u) && Number.isFinite(v)) pts.push([x, y, u, v]);
          }
          m.parts.push({ kind: 'arrows', pts, slot: 0 });
        }
        if (s.phase.nullclines) {
          const [a, b] = s.vars;
          // (nullclines are smooth: 90 cells across draw them as finely as the eye sees)
          const nc = fast ? 40 : 90;
          m.parts.push({ kind: 'segs', lines: contour(dx, s, nc), label: dotName(a) + ' = 0', tex: '\\dot{' + nameTex(a) + '} = 0', slot: 0 });
          m.parts.push({ kind: 'segs', lines: contour(dy, s, nc), label: dotName(b) + ' = 0', tex: '\\dot{' + nameTex(b) + '} = 0', slot: 1 });
        }
        memo.set(s, m);
      }
      out.push(...m.parts);
      const st = vals.__start || s.phase.start;
      if (st) {
        const pts = trajectory(dx, dy, st, s, fast ? 0.016 : 0.004);
        out.push({ kind: 'line', pts, label: 'path from (' + fmt(st[0], 3) + ', ' + fmt(st[1], 3) + ')', slot: 2, curve: true, traj: true });
        out.push({ kind: 'start', pts: [st], slot: 2 });
      }
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
        out.push({ kind: 'line', pts, label: 'y = ' + fns[0].text.trim(), tex: 'y = ' + (texOf(fns[0].text, declared) || ''), slot: 2, dash: true });
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

  // a variable with a dot over it, as a time derivative is written: k̇
  const dotName = (v) => { const m = /^([^_]+)(_.*)?$/.exec(v); return m[1] + '̇' + (m[2] || ''); };

  // Where F(x, y) = 0 on the plot: marching squares on a grid (its cells about square on the
  // page, 120 across at most), each crossing of a cell's edge at the linear guess between its
  // corners, the ambiguous saddle cells settled by the value at their middle; the pieces joined
  // into polylines. Bounded: 120 by 120 cells, 20000 pieces.
  function contour(F, s, nx = 120, cap = 10000) {
    const ny = Math.max(10, Math.min(nx, Math.round(nx * s.aspect)));
    const x0 = s.x.min, y0 = s.y.min, hx = (s.x.max - s.x.min) / nx, hy = (s.y.max - s.y.min) / ny, W1 = nx + 1;
    const V = new Float64Array(W1 * (ny + 1));
    for (let j = 0; j <= ny; j++) { const y = y0 + j * hy; for (let i = 0; i <= nx; i++) V[j * W1 + i] = F(x0 + i * hx, y); }
    // An edge by its number: 2 (j (nx + 1) + i) for the one from corner (i, j) to the right, one more
    // for the one up. Its point is the linear guess between its corners, the same from either cell.
    const point = (id) => {
      const k = id >> 1, i = k % W1, j = (k - i) / W1, up = id & 1, a = V[k], b = up ? V[k + W1] : V[k + 1], t = a / (a - b);
      return up ? [x0 + i * hx, y0 + (j + t) * hy] : [x0 + (i + t) * hx, y0 + j * hy];
    };
    const segA = [], segB = [];
    for (let j = 0; j < ny && segA.length < cap; j++) for (let i = 0; i < nx && segA.length < cap; i++) {
      const q = j * W1 + i, a = V[q], b = V[q + 1], c = V[q + W1 + 1], d = V[q + W1];
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const k = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (k === 0 || k === 15) continue;
      const S = 2 * q, E = 2 * (q + 1) + 1, Nn = 2 * (q + W1), Wd = 2 * q + 1;
      const add = (p, r) => { segA.push(p); segB.push(r); };
      switch (k) {
        case 1: case 14: add(Wd, S); break;
        case 2: case 13: add(S, E); break;
        case 3: case 12: add(Wd, E); break;
        case 4: case 11: add(E, Nn); break;
        case 6: case 9: add(S, Nn); break;
        case 7: case 8: add(Wd, Nn); break;
        case 5: case 10: {
          const mid = (a + b + c + d) / 4 > 0;
          if ((k === 5) === mid) { add(Wd, Nn); add(S, E); } else { add(Wd, S); add(E, Nn); }
          break;
        }
      }
    }
    // joined end to end where they share an edge (each edge borders two cells: two pieces at most)
    const n = segA.length, adj = new Map(), used = new Uint8Array(n);
    const link = (e, g) => { const l = adj.get(e); if (l) l.push(g); else adj.set(e, [g]); };
    for (let g = 0; g < n; g++) { link(segA[g], g); link(segB[g], g); }
    const lines = [];
    for (let g = 0; g < n; g++) {
      if (used[g]) continue;
      used[g] = 1;
      const ids = [segA[g], segB[g]];
      for (const back of [false, true]) {
        for (;;) {
          const e = back ? ids[0] : ids[ids.length - 1], l = adj.get(e), h = l && l.find((x) => !used[x]);
          if (h === undefined) break;
          used[h] = 1;
          const o = segA[h] === e ? segB[h] : segA[h];
          if (back) ids.unshift(o); else ids.push(o);
        }
      }
      // (a piece of no length, where the curve passes through a corner, is none)
      const pts = [];
      for (const id of ids) { const p = point(id), q = pts[pts.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p); }
      if (pts.length > 1) lines.push(pts);
    }
    return lines;
  }

  // A path of dx/dt, dy/dt from a point: classical Runge–Kutta, each step about 0.4 % of the plot
  // (the time step from the speed there), until it leaves the plot by a plot's width, stops at a
  // rest point, or has taken 3000 steps
  function trajectory(dx, dy, st, s, step = 0.004) {
    const W = s.x.max - s.x.min, H = s.y.max - s.y.min, pts = [[st[0], st[1]]];
    let x = st[0], y = st[1];
    const f = (x, y) => [dx(x, y), dy(x, y)];
    for (let n = 0; n < 3000; n++) {
      const [u, v] = f(x, y);
      const sp = Math.hypot(u / W, v / H);
      if (!Number.isFinite(sp) || sp < 1e-9) break;
      const h = step / sp;
      const k1 = [u, v], k2 = f(x + h / 2 * k1[0], y + h / 2 * k1[1]), k3 = f(x + h / 2 * k2[0], y + h / 2 * k2[1]), k4 = f(x + h * k3[0], y + h * k3[1]);
      const nx = x + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), ny = y + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
      x = nx; y = ny;
      pts.push([x, y]);
      if (x < s.x.min - W || x > s.x.max + W || y < s.y.min - H || y > s.y.max + H) break;
    }
    return pts;
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
    // (an implicit curve's and a phase portrait's plot is the region their axes give)
    if (s.kind === 'implicit' || s.kind === 'phase') return { X: [s.x.min, s.x.max], Y: [s.y.min, s.y.max], equal: false };
    const { series } = compute(s, defaults(s));
    const xs = [], ys = [];
    for (const S of series) if (S.pts && S.kind !== 'fill') for (const p of S.pts) if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
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
  const SLOT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#8a5cc7', '#d23f6e'];
  const INK = '#0b0b0b', INK2 = '#52514e', GRID = '#e8e7e3', ZERO = '#b9b8b3';
  const FONT = 'Georgia, "Times New Roman", Times, serif';

  // paint(g, s, data, R, vals, W, H, hover, ghost): one picture on a 2D context of W by H CSS
  // pixels. data from compute, R from ranges; hover { x, y } in pixels for the live figure's
  // readout; ghost, the series at the starting values, drawn faint under the rest while a slider
  // is away from its start (comparative statics). Every length of the layout comes from tw, not
  // from the font: the PDF's picture (src/graph.js, pgfContext) is laid out by this same code with
  // TeX's fonts, and its lines fall where the live figure's do. g.rkTex, set before a text, is its
  // LaTeX for the PDF; a canvas ignores it.
  function paint(g, s, data, R, vals, W, H, hover, ghost) {
    g.clearRect(0, 0, W, H);
    g.font = '12px ' + FONT;
    let [x0, x1] = R.X, [y0, y1] = R.Y;
    const yt0 = ticks(y0, y1, Math.max(3, Math.round(H / 55)));
    let L = 14;
    for (const v of yt0.out) L = Math.max(L, tw(tickText(v, yt0.step), 12) + 12);
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
      const p = X(v), t = tickText(v, xt.step), w = tw(t, 12);
      if (p - w / 2 < last + 6) continue;
      g.beginPath(); g.moveTo(Math.round(p) + 0.5, T + ph); g.lineTo(Math.round(p) + 0.5, T + ph + 4); g.stroke();
      g.fillText(t, p, T + ph + 6);
      last = p + w / 2;
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of yt.out) { const p = Y(v); g.beginPath(); g.moveTo(L - 4, Math.round(p) + 0.5); g.lineTo(L, Math.round(p) + 0.5); g.stroke(); g.fillText(tickText(v, yt.step), L - 6, p); }
    g.font = 'italic 13px ' + FONT;
    g.fillStyle = INK;
    if (s.x.label) { g.textAlign = 'center'; g.textBaseline = 'bottom'; g.rkTex = labelTex(s.x.label); g.fillText(s.x.label, L + pw / 2, H - 2); }
    if (s.y.label) { g.save(); g.translate(12, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.rkTex = labelTex(s.y.label); g.fillText(s.y.label, 0, 0); g.restore(); }
    g.rkTex = null;
    // the data, clipped to the plot
    g.save();
    g.beginPath(); g.rect(L, T - 1, pw + 1, ph + 2); g.clip();
    const yspan = y1 - y0;
    const line = (pts, curve) => {
      // a line, cut where it is undefined or jumps across the plot (tan x at its poles)
      g.beginPath();
      let pen = false, prev = null;
      for (const p of pts) {
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { pen = false; prev = null; continue; }
        const jump = !curve && prev && Math.abs(p[1] - prev[1]) > 3 * yspan && Math.sign(p[1] - (y0 + y1) / 2) !== Math.sign(prev[1] - (y0 + y1) / 2);
        const px = clampPx(X(p[0])), py = clampPx(Y(p[1]));
        if (pen && !jump) g.lineTo(px, py); else g.moveTo(px, py);
        pen = true; prev = p;
      }
    };
    const polylines = (lines) => { g.beginPath(); for (const l of lines) l.forEach((p, k) => (k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); };
    // the starting values' curves, faint and thin, under everything
    if (ghost) for (const S of ghost.series) {
      if (S.kind !== 'line' && S.kind !== 'segs' && S.kind !== 'area' && S.kind !== 'mark') continue;
      if (S.traj) continue;
      g.globalAlpha = 0.32;
      g.strokeStyle = SLOT[S.slot % SLOT.length]; g.lineWidth = 1.5; g.setLineDash([]);
      if (S.kind === 'mark') { const [x, y] = S.pts[0]; g.beginPath(); g.arc(X(x), Y(y), 3.5, 0, 2 * Math.PI); g.fillStyle = INK2; g.fill(); }
      else { if (S.kind === 'segs') polylines(S.lines); else line(S.pts, S.curve); g.stroke(); }
      g.globalAlpha = 1;
    }
    // shaded areas first, under the curves that bound them
    for (const S of data.series) {
      if (S.kind !== 'fill') continue;
      g.beginPath();
      S.pts.forEach((p, k) => (k ? g.lineTo(X(p[0]), clampPx(Y(p[1]))) : g.moveTo(X(p[0]), clampPx(Y(p[1])))));
      g.closePath();
      g.fillStyle = SLOT[S.slot % SLOT.length]; g.globalAlpha = 0.2; g.fill(); g.globalAlpha = 1;
    }
    for (const S of data.series) {
      const col = SLOT[S.slot % SLOT.length];
      if (S.kind === 'fill') continue;
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
      if (S.kind === 'arrows') {
        // the field's direction at each point of a grid, in the plot's own scale, all one length
        const len = Math.min(pw, ph) / 26;
        g.strokeStyle = '#9b9a95'; g.fillStyle = '#9b9a95'; g.lineWidth = 1; g.setLineDash([]);
        for (const [x, y, u, v] of S.pts) {
          const a = u / (x1 - x0) * pw, b = -v / (y1 - y0) * ph, n = Math.hypot(a, b);
          if (!(n > 0)) continue;
          const ux = a / n * len, uy = b / n * len, cx = X(x), cy = Y(y);
          g.beginPath(); g.moveTo(cx - ux / 2, cy - uy / 2); g.lineTo(cx + ux / 2, cy + uy / 2); g.stroke();
          g.beginPath(); g.moveTo(cx + ux / 2, cy + uy / 2); g.lineTo(cx + ux / 2 - ux * 0.38 - uy * 0.22, cy + uy / 2 - uy * 0.38 + ux * 0.22); g.lineTo(cx + ux / 2 - ux * 0.38 + uy * 0.22, cy + uy / 2 - uy * 0.38 - ux * 0.22); g.closePath(); g.fill();
        }
        continue;
      }
      if (S.kind === 'mark') {
        // an equilibrium: dashed to both axes, a dot, its coordinates beside it
        const [x, y] = S.pts[0], px = X(x), py = Y(y);
        g.strokeStyle = INK2; g.lineWidth = 1; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px, T + ph); g.moveTo(px, py); g.lineTo(L, py); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(px, py, 4, 0, 2 * Math.PI); g.fillStyle = INK; g.fill();
        g.font = '12px ' + FONT; g.textAlign = px > L + pw - 90 ? 'right' : 'left'; g.textBaseline = 'bottom';
        g.fillStyle = INK; g.rkTex = labelTex(S.label);
        g.fillText(S.label, px + (g.textAlign === 'right' ? -7 : 7), py - 5);
        g.rkTex = null;
        continue;
      }
      if (S.kind === 'start') {
        // where the path starts: a ring the reader drags
        const [x, y] = S.pts[0];
        g.beginPath(); g.arc(X(x), Y(y), 6, 0, 2 * Math.PI);
        g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = col; g.lineWidth = 2.5; g.setLineDash([]); g.stroke();
        continue;
      }
      if (S.kind === 'segs') polylines(S.lines);
      else line(S.pts, S.curve);
      if (S.kind === 'area') {
        // the density's area, faint, under its line
        g.save();
        g.lineTo(X(S.pts[S.pts.length - 1][0]), Y(0)); g.lineTo(X(S.pts[0][0]), Y(0)); g.closePath();
        g.fillStyle = 'rgba(42,120,214,0.14)'; g.fill();
        g.restore();
        g.beginPath(); let pen = false;
        for (const p of S.pts) { if (!Number.isFinite(p[1])) { pen = false; continue; } const px = X(p[0]), py = clampPx(Y(p[1])); if (pen) g.lineTo(px, py); else g.moveTo(px, py); pen = true; }
      }
      g.setLineDash(S.dash ? [6, 4] : []);
      g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
      g.stroke();
      g.setLineDash([]);
      if (S.traj && S.pts.length > 8) {
        // which way time runs: an arrowhead a third of the way along
        const k = Math.floor(S.pts.length / 3), a = S.pts[k], b = S.pts[Math.min(S.pts.length - 1, k + 3)];
        const ax = X(a[0]), ay = Y(a[1]), dx = X(b[0]) - ax, dy = Y(b[1]) - ay, n = Math.hypot(dx, dy);
        if (n > 0) {
          const ux = dx / n * 9, uy = dy / n * 9;
          g.beginPath(); g.moveTo(ax + ux, ay + uy); g.lineTo(ax - uy * 0.55, ay + ux * 0.55); g.lineTo(ax + uy * 0.55, ay - ux * 0.55); g.closePath();
          g.fillStyle = col; g.fill();
        }
      }
    }
    g.restore();
    // the legend, top left inside the plot: each series' swatch and its formula, in ink
    g.font = '12px ' + FONT;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const items = data.series.filter((S) => S.label && !/^(mark|start|arrows)$/.test(S.kind) && !(s.kind === 'data' && S.kind === 'points' && data.series.length === 1));
    let ly = T + 12;
    const lw = Math.min(pw - 24, Math.max(0, ...items.map((S) => tw(S.label, 12))) + 30);
    if (items.length) {
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.fillRect(L + 6, T + 3, lw, items.length * 17 + 4);
    }
    for (const S of items) {
      const col = SLOT[S.slot % SLOT.length];
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
      if (S.kind === 'points') { g.beginPath(); g.arc(L + 19, ly, 3.5, 0, 2 * Math.PI); g.fill(); }
      else if (S.kind === 'bars') g.fillRect(L + 12, ly - 4, 14, 8);
      else if (S.kind === 'fill') { g.globalAlpha = 0.35; g.fillRect(L + 12, ly - 5, 14, 10); g.globalAlpha = 1; }
      else { g.setLineDash(S.dash ? [4, 3] : []); g.beginPath(); g.moveTo(L + 11, ly); g.lineTo(L + 27, ly); g.stroke(); g.setLineDash([]); }
      g.fillStyle = INK;
      const t = clip(S.label, lw - 26);
      g.rkTex = t === S.label ? (S.tex ? '$' + S.tex + '$' : labelTex(S.label)) : null;
      g.fillText(t, L + 32, ly);
      g.rkTex = null;
      ly += 17;
    }
    // the sliders' values, top right: the picture says what it shows, in the PDF too
    if (s.sliders.length) {
      const parts = s.sliders.map((q) => [q.name, fmtStep(q.name in vals ? vals[q.name] : q.value, q.step)]);
      const t = parts.map(([n, v]) => n + ' = ' + v).join(',  ');
      g.textAlign = 'right'; g.font = 'italic 12px ' + FONT;
      const w = tw(t, 12);
      g.fillStyle = 'rgba(255,255,255,0.86)'; g.fillRect(L + pw - w - 10, T + 3, w + 8, 17);
      g.fillStyle = INK2;
      g.rkTex = parts.map(([n, v]) => '$' + nameTex(n) + ' = ' + v.replace('−', '-') + '$').join(',\\enspace ');
      g.fillText(t, L + pw - 6, T + 12);
      g.rkTex = null;
    }
    // the live figure's readout under the pointer
    if (hover && hover.x >= L && hover.x <= L + pw && hover.y >= T && hover.y <= T + ph) readout(g, s, data, { X, Y, x0, x1, y0, y1, L, T, pw, ph }, hover);
    return { L, T, pw, ph, x0, x1, y0, y1 };
  }
  // A text's width in CSS pixels at px, as a serif face sets it (Georgia on the screen and
  // Computer Modern in the PDF are within a few per cent of this): the layout's one measure
  const CW = { '′': 0.25, ' ': 0.27, '.': 0.27, ',': 0.27, ':': 0.27, ';': 0.27, '(': 0.36, ')': 0.36, '-': 0.36, '−': 0.65, '=': 0.65, '+': 0.65, '<': 0.65, '>': 0.65, 'i': 0.3, 'l': 0.3, 'j': 0.3, 'f': 0.33, 't': 0.38, 'r': 0.4, 'm': 0.82, 'w': 0.75, 'M': 0.9, 'W': 1, '²': 0.35, '³': 0.35 };
  function tw(t, px) {
    let w = 0;
    for (const c of String(t)) w += CW[c] !== undefined ? CW[c] : /[0-9]/.test(c) ? 0.55 : /[A-Z]/.test(c) ? 0.7 : /[̀-ͯ]/.test(c) ? 0 : 0.52;
    return w * px;
  }
  // a label's LaTeX: a variable's name in math, Greek as Greek, a minus as a minus; words as words
  function labelTex(t) {
    const out = [];
    const re = /([A-Za-zα-ωΑ-Ω])(\u0307?)(_[A-Za-z0-9]{1,8})?(?![A-Za-zα-ωΑ-Ω])|(−?\d+(?:\.\d+)?)|([A-Za-z]{2,})|([\s\S])/g;
    const SYM = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '%': '\\%', '_': '\\_', '^': '\\^{}', '~': '\\~{}', '−': '$-$', '²': '\\textsuperscript{2}', '³': '\\textsuperscript{3}', '·': '$\\cdot$', '…': '\\dots{}', '≤': '$\\le$', '≥': '$\\ge$', '×': '$\\times$', '′': "$'$" };
    let m;
    while ((m = re.exec(String(t)))) {
      if (m[1]) { const n = nameTex(m[1] + (m[3] || '')), sub = /_\{.*$/.exec(n); out.push('$' + (m[2] ? '\\dot{' + n.replace(/_\{.*$/, '') + '}' + (sub ? sub[0] : '') : n) + '$'); }
      else if (m[4]) out.push('$' + m[4].replace('−', '-') + '$');
      else if (m[5]) out.push(m[5]);
      else { const c = m[6]; out.push(SYM[c] || (GREEK_TEX[c] ? '$' + GREEK_TEX[c] + '$' : /[\x20-\x7e\u00a0-\u00ff]/.test(c) ? c : '?')); }
    }
    return out.join('').replace(/\$\$/g, '');
  }

  function clip(t, w) {
    if (tw(t, 12) <= w) return t;
    while (t.length > 1 && tw(t + '…', 12) > w) t = t.slice(0, -1);
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
      } else if (S.kind === 'points' || S.kind === 'bars' || S.kind === 'mark') {
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
    // (an implicit curve or a phase portrait: where the pointer is)
    if (s.kind === 'implicit' || s.kind === 'phase') lines.push('(' + fmt(xv, 4) + ', ' + fmt(A.y0 + (T + ph - hover.y) / ph * (A.y1 - A.y0), 4) + ')');
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
      inp.addEventListener('input', () => { vals[q.name] = +inp.value; out.textContent = fmtStep(+inp.value, q.step); soon(); });
      r.append(lab, inp, out);
      list.append(r);
      outs.push([inp, out, q]);
    });
    if (s.sliders.length) {
      // back to the values the PDF's picture shows
      const b = D.createElement('button'); b.type = 'button'; b.id = 'rk-reset'; b.textContent = 'Reset'; b.title = 'Back to the values the PDF shows';
      b.addEventListener('click', () => { for (const [inp, out, q] of outs) { inp.value = String(q.value); out.textContent = fmtStep(q.value, q.step); vals[q.name] = q.value; } delete vals.__start; redraw(true); });
      row.append(b);
    }
    cv.setAttribute('aria-label', s.title || 'Interactive graph');
    // the curves at the starting values, once: drawn faint while a slider is away from its start
    let base = null;
    const away = () => s.ghost && s.sliders.some((q) => vals[q.name] !== q.value);
    const ghostOf = () => { if (!away()) return null; if (!base) { try { base = compute(s, defaults(s)); } catch (e) { base = { series: [] }; } } return base; };
    let W = 0, H = 0, queued = 0;
    // (a slider's input events come faster than frames: one compute a frame, a fast one while it
    // moves, and the full one when it has rested for 150 ms)
    let fast = false, rest = 0;
    const soon = () => {
      fast = true;
      clearTimeout(rest);
      rest = setTimeout(() => { fast = false; redraw(true); }, 150);
      if (!queued) queued = requestAnimationFrame(() => { queued = 0; redraw(true); });
    };
    function redraw(again) {
      W = Math.max(120, Math.round(cv.clientWidth || box.clientWidth || 600));
      H = Math.round(W * s.aspect);
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
      const t0 = performance.now();
      if (again || !data) { try { data = compute(s, vals, 600, fast); say(''); } catch (e) { say(e.message); data = { series: [] }; } }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo = paint(g, s, data, R, vals, W, H, hover, ghostOf());
      // (the time each frame took, for test/graphs.py's budget: 16 ms on a phone while a slider
      // moves; the full drawing once it rests)
      const T = self.rkTimes || (self.rkTimes = []), Tf = self.rkFast || (self.rkFast = []);
      if (T.length < 400) T.push(performance.now() - t0);
      if (fast && again && Tf.length < 400) Tf.push(performance.now() - t0);
      post();
    }
    let geo = null;
    function post() {
      // the page sizes this frame to what the graph needs
      try { parent.postMessage({ rikuy: 'height', px: Math.ceil(box.getBoundingClientRect().height) }, '*'); } catch (e) { /* no parent */ }
    }
    const point = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    // A phase portrait's path starts where the reader presses and drags (or moves it with the
    // arrow keys, Shift for longer steps): the PDF prints it from the start the graph gives
    const phase = s.kind === 'phase' && s.phase.start;
    let drag = false;
    const toData = (p) => (geo ? [geo.x0 + (p.x - geo.L) / geo.pw * (geo.x1 - geo.x0), geo.y0 + (geo.T + geo.ph - p.y) / geo.ph * (geo.y1 - geo.y0)] : null);
    const inPlot = (p) => geo && p.x >= geo.L && p.x <= geo.L + geo.pw && p.y >= geo.T && p.y <= geo.T + geo.ph;
    const startAt = (p) => { const d = toData(p); if (d) { vals.__start = d; soon(); } };
    if (phase) {
      cv.style.touchAction = 'none';
      cv.tabIndex = 0;
      cv.setAttribute('aria-label', (s.title || 'Phase portrait') + '. The arrow keys move where the path starts.');
      cv.addEventListener('keydown', (e) => {
        const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
        if (!k) return;
        e.preventDefault();
        const st = vals.__start || s.phase.start, f = e.shiftKey ? 0.1 : 0.02;
        vals.__start = [st[0] + k[0] * f * (s.x.max - s.x.min), st[1] + k[1] * f * (s.y.max - s.y.min)];
        soon();
      });
    }
    cv.addEventListener('pointermove', (e) => {
      if (drag) { startAt(point(e)); return; }
      if (e.pointerType === 'touch' && !e.buttons) return;
      hover = point(e); redraw(false);
    });
    cv.addEventListener('pointerdown', (e) => {
      const p = point(e);
      if (phase && e.button === 0 && inPlot(p)) { drag = true; hover = null; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } startAt(p); return; }
      hover = p; redraw(false);
    });
    for (const n of ['pointerup', 'pointercancel']) cv.addEventListener(n, () => { drag = false; });
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

  return { parse, parseEq, names, compile, normalize, formulas, unknownNames, defaults, compute, ranges, paint, mount, fmt, fmtStep, FAM, FITS, KINDS, NAME, sizeName, niceStep, show, texOf, nameTex, labelTex, tw, GREEK, GREEK_VALUES: new Set(Object.values(GREEK)), own };
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
    '<script>\n(' + kitText() + ')().mount();\n</script>\n</body>\n</html>\n';
}
// graphKit's text as each graph's file carries it: its lines without their indent and without the
// lines that are comments alone (a fifth smaller; every graph of a document carries a copy)
let KIT_TEXT = null;
const kitText = () => KIT_TEXT || (KIT_TEXT = graphKit.toString().split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.trimStart()).join('\n'));

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
  { id: 'implicit', name: 'Implicit', title: 'Curves F(x, y) = c: indifference curves, isoquants, a circle', spec: { kind: 'implicit', vars: ['x', 'y'], eq: ['x^2 + y^2 = r^2', 'x y = c'], x: { min: -4, max: 4 }, y: { min: -3, max: 3 }, aspect: 0.6, sliders: [{ name: 'r', min: 0.5, max: 3.5, step: 0.05, value: 2 }, { name: 'c', min: -3, max: 3, step: 0.1, value: 1 }] } },
  { id: 'phase', name: 'Phase', title: 'A phase portrait of dx/dt and dy/dt: the field, the nullclines and a path from a point you drag', spec: { kind: 'phase', vars: ['x', 'y'], phase: { dx: 'a x - b x y', dy: 'd x y - c y', start: [1, 1.5] }, x: { min: 0, max: 4 }, y: { min: 0, max: 4 }, aspect: 0.6, title: 'Predator and prey (Lotka and Volterra)', sliders: [{ name: 'a', min: 0.1, max: 2, step: 0.05, value: 1 }, { name: 'b', min: 0.1, max: 2, step: 0.05, value: 0.8 }, { name: 'c', min: 0.1, max: 2, step: 0.05, value: 1 }, { name: 'd', min: 0.1, max: 2, step: 0.05, value: 0.6 }] } },
  { id: 'dist', name: 'Distribution', title: 'A distribution with sliders for its parameters, or the mean of n draws (the central limit theorem)', spec: { kind: 'dist', dist: { family: 'exponential', mode: 'mean' }, sliders: [] } }
];
// Named graphs of economics and statistics, ready to change: the dialog's Template list and
// Insert's Interactive graph menu
export const GALLERY = [
  { id: 'supply-demand', name: 'Supply and demand', title: 'Linear supply and demand, the equilibrium marked, consumer and producer surplus shaded',
    spec: { kind: 'function', vars: ['q'], f: ['a - b q', 'c + d q'], cross: true, shade: [{ a: 0, b: 'cross', w: 1, from: '0', to: 'cross', label: 'consumer surplus' }, { a: 1, b: 'cross', w: 0, from: '0', to: 'cross', label: 'producer surplus' }], x: { min: 0, max: 10, label: 'q' }, y: { min: 0, max: 12, label: 'p' }, title: 'Supply and demand',
      sliders: [{ name: 'a', min: 4, max: 12, step: 0.1, value: 10 }, { name: 'b', min: 0.2, max: 3, step: 0.05, value: 1 }, { name: 'c', min: 0, max: 6, step: 0.1, value: 2 }, { name: 'd', min: 0.2, max: 3, step: 0.05, value: 1 }] } },
  { id: 'is-lm', name: 'IS–LM', title: 'The IS and LM curves in output Y and the interest rate r, their equilibrium marked',
    spec: { kind: 'function', vars: ['Y'], f: ['(A - (1 - c) Y)/b', '(k Y - m)/h'], cross: true, x: { min: 0, max: 20, label: 'Y' }, y: { min: 0, max: 10, label: 'r' }, title: 'IS and LM',
      sliders: [{ name: 'A', min: 5, max: 15, step: 0.1, value: 10 }, { name: 'c', min: 0.2, max: 0.9, step: 0.01, value: 0.6 }, { name: 'b', min: 0.5, max: 3, step: 0.05, value: 1 }, { name: 'k', min: 0.2, max: 1, step: 0.01, value: 0.5 }, { name: 'm', min: 0, max: 6, step: 0.1, value: 2 }, { name: 'h', min: 0.5, max: 3, step: 0.05, value: 1 }] } },
  { id: 'solow', name: 'Solow', title: 'The Solow diagram: output, saving and break even investment, the steady state marked',
    spec: { kind: 'function', vars: ['k'], f: ['k^α', 's k^α', '(n + δ) k'], cross: [[1, 2]], x: { min: 0, max: 12, label: 'k' }, y: { min: 0, max: 2.5, label: 'per worker' }, title: 'The Solow model',
      sliders: [{ name: 's', min: 0.05, max: 0.6, step: 0.01, value: 0.3 }, { name: 'α', min: 0.1, max: 0.9, step: 0.01, value: 0.33 }, { name: 'n', min: 0, max: 0.06, step: 0.001, value: 0.02 }, { name: 'δ', min: 0, max: 0.15, step: 0.005, value: 0.08 }] } },
  { id: 'ramsey', name: 'Ramsey', title: 'The Ramsey model\'s phase diagram in capital k and consumption c: nullclines, the field, a path from a point you drag',
    spec: { kind: 'phase', vars: ['k', 'c'], phase: { dx: 'k^α - δ k - c', dy: 'c (α k^(α - 1) - δ - ρ)/θ', start: [3, 1.2] }, x: { min: 0, max: 25, label: 'k' }, y: { min: 0, max: 2.5, label: 'c' }, aspect: 0.6, title: 'The Ramsey model',
      sliders: [{ name: 'α', min: 0.1, max: 0.6, step: 0.01, value: 0.33 }, { name: 'δ', min: 0.01, max: 0.15, step: 0.005, value: 0.05 }, { name: 'ρ', min: 0.005, max: 0.1, step: 0.005, value: 0.03 }, { name: 'θ', min: 0.2, max: 5, step: 0.1, value: 1 }] } },
  { id: 'budget', name: 'Budget and indifference', title: 'A budget line and a Cobb–Douglas indifference curve in x_1 and x_2',
    spec: { kind: 'implicit', vars: ['x_1', 'x_2'], eq: ['p_1 x_1 + p_2 x_2 = m', 'x_1^α x_2^(1 - α) = u'], x: { min: 0, max: 12, label: 'x_1' }, y: { min: 0, max: 12, label: 'x_2' }, aspect: 0.7, title: 'Budget line and indifference curve',
      sliders: [{ name: 'p_1', min: 0.5, max: 4, step: 0.05, value: 1 }, { name: 'p_2', min: 0.5, max: 4, step: 0.05, value: 1 }, { name: 'm', min: 2, max: 20, step: 0.1, value: 10 }, { name: 'α', min: 0.05, max: 0.95, step: 0.01, value: 0.5 }, { name: 'u', min: 0.5, max: 10, step: 0.05, value: 5 }] } },
  { id: 'normal', name: 'Normal density', title: 'The normal density, its mean and standard deviation on sliders', spec: { kind: 'dist', dist: { family: 'normal', mode: 'density' }, sliders: [] } },
  { id: 't', name: 'Student\'s t density', title: 'Student\'s t density, its degrees of freedom on a slider', spec: { kind: 'dist', dist: { family: 't', mode: 'density' }, sliders: [] } },
  { id: 'clt', name: 'Central limit theorem', title: 'The mean of n draws from a skewed distribution, standardised, against the normal density', spec: { kind: 'dist', dist: { family: 'exponential', mode: 'mean' }, sliders: [] } }
];
export const template = (id) => K.normalize((TEMPLATES.find((t) => t.id === id) || GALLERY.find((t) => t.id === id) || TEMPLATES[0]).spec);

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
// ---- the PDF's picture as vector graphics: PGF commands TeX draws -----------------------------
// The figure TeX prints is written by the same paint() the live figure runs, on a context that
// records instead of drawing: each path becomes PGF's path commands, each text a \pgftext set in
// the document's own fonts (its LaTeX given by paint as g.rkTex). So the PDF's figure is the live
// figure at its starting values by construction, as lines and type at any zoom (test/graphs.py
// compares the two in pixels). Coordinates are fractions of \rikuywidth, the figure's width,
// which rikuy.sty sets from the command's width option (\linewidth when none): the picture takes
// the width TeX gives it, its type stays at the document's size.
const PGF_HEAD = '% rikuy-graph: ';
const PGF_MAX = 800000;
const F4 = (v) => { const t = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); return t === '-0' ? '0' : t.replace(/^(-?)0\./, '$1.'); };
function cssColor(c) {
  const t = String(c || '#000').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(t);
  if (m) { const n = parseInt(m[1], 16); return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }; }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(t);
  if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] === undefined ? 1 : +m[4] };
  return { r: 0, g: 0, b: 0, a: 1 };
}
class PGFContext {
  constructor(W, H) {
    this.W = W; this.H = H; this.out = []; this.path = []; this.colors = new Map();
    this.st = { stroke: '#000', fill: '#000', lw: 1, dash: [], alpha: 1, font: '12px serif', align: 'start', base: 'alphabetic', tx: 0, ty: 0, rot: 0 };
    this.stack = []; this.rkTex = null; this.size = 0;
  }
  // (a picture of 800 kB at most: past it, what is left is left out and the file says so)
  push(t) { if (this.size > PGF_MAX) { this.cut = true; return; } this.size += t.length; this.out.push(t); }
  // canvas state, as paint() sets it
  set strokeStyle(v) { this.st.stroke = v; } get strokeStyle() { return this.st.stroke; }
  set fillStyle(v) { this.st.fill = v; } get fillStyle() { return this.st.fill; }
  set lineWidth(v) { this.st.lw = v; } get lineWidth() { return this.st.lw; }
  set globalAlpha(v) { this.st.alpha = v; } get globalAlpha() { return this.st.alpha; }
  set font(v) { this.st.font = v; } get font() { return this.st.font; }
  set textAlign(v) { this.st.align = v; } get textAlign() { return this.st.align; }
  set textBaseline(v) { this.st.base = v; } get textBaseline() { return this.st.base; }
  set lineJoin(v) { /* round, as PGF's is set once */ } set lineCap(v) { /* likewise */ }
  setLineDash(d) { this.st.dash = d || []; }
  setTransform() { /* the picture is drawn at its own size */ }
  measureText(t) { return { width: K.tw(t, parseFloat(this.st.font.replace(/^\D*/, '')) || 12) }; }
  save() { this.stack.push({ ...this.st, dash: this.st.dash.slice() }); this.out.push('\\begin{pgfscope}'); }
  restore() { if (!this.stack.length) return; this.st = this.stack.pop(); this.out.push('\\end{pgfscope}'); }
  translate(x, y) { this.st.tx += x; this.st.ty += y; }
  rotate(a) { this.st.rot += a; }
  // a point, in the figure's own scale: x from the left, y from the bottom, as fractions of W
  P(x, y) { return F4((x + this.st.tx) / this.W) + ' ' + F4((this.H - (y + this.st.ty)) / this.W) + ' '; }
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push(['M', x, y]); }
  lineTo(x, y) { if (!this.path.length) this.path.push(['M', x, y]); else this.path.push(['L', x, y]); }
  closePath() { this.path.push(['Z']); }
  rect(x, y, w, h) { this.path.push(['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']); }
  arc(x, y, r) { this.path.push(['C', x, y, r]); }
  color(c, what) {
    const k = cssColor(c), key = [k.r, k.g, k.b].map((v) => v.toFixed(3)).join(',');
    let name = this.colors.get(key);
    if (!name) { name = 'rkc' + String.fromCharCode(97 + this.colors.size % 26) + (this.colors.size >= 26 ? Math.floor(this.colors.size / 26) : ''); this.colors.set(key, name); }
    return { name, a: k.a * this.st.alpha, set: '\\pgfset' + what + 'color{' + name + '}' };
  }
  // The path as PGF's commands, with every segment clipped to a box a plot's size round the
  // picture (a curve that runs off to infinity would be past TeX's largest length; the part
  // inside is drawn exactly), and the points a straight run passes through left out
  emitPath() {
    const W = this.W, H = this.H, lo = [-W, -H], hi = [2 * W, 2 * H], o = [];
    let pen = null, first = null;
    const inside = (p) => p[0] >= lo[0] && p[0] <= hi[0] && p[1] >= lo[1] && p[1] <= hi[1];
    const clipSeg = (a, b) => {
      // Liang and Barsky: the part of a to b inside the box, or null
      let t0 = 0, t1 = 1;
      const d = [b[0] - a[0], b[1] - a[1]];
      for (let k = 0; k < 2; k++) {
        for (const [p, q] of [[-d[k], a[k] - lo[k]], [d[k], hi[k] - a[k]]]) {
          if (p === 0) { if (q < 0) return null; continue; }
          const r = q / p;
          if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
        }
      }
      return [[a[0] + t0 * d[0], a[1] + t0 * d[1]], [a[0] + t1 * d[0], a[1] + t1 * d[1]]];
    };
    let run = [];
    const flush = () => {
      // (a point within 0.05 px of the chord from the last kept point to the next is left out)
      if (!run.length) return;
      let A = run[0];
      o.push('\\rkm ' + this.P(A[0], A[1]));
      for (let i = 1; i < run.length; i++) {
        const B = run[i], C = run[i + 1];
        if (C) {
          const dx = C[0] - A[0], dy = C[1] - A[1], n = Math.hypot(dx, dy);
          if (n > 0 && Math.abs((B[0] - A[0]) * dy - (B[1] - A[1]) * dx) / n < 0.05 && (B[0] - A[0]) * dx + (B[1] - A[1]) * dy > 0 && (C[0] - B[0]) * dx + (C[1] - B[1]) * dy > 0) continue;
        }
        o.push('\\rkl ' + this.P(B[0], B[1]));
        A = B;
      }
      run = [];
    };
    for (const s of this.path) {
      if (s[0] === 'M') { flush(); pen = [s[1], s[2]]; first = pen; continue; }
      if (s[0] === 'C') {
        flush();
        const [, x, y, r] = s;
        o.push('\\pgfpathcircle{\\pgfqpoint{' + F4((x + this.st.tx) / W) + '\\rikuywidth}{' + F4((H - y - this.st.ty) / W) + '\\rikuywidth}}{' + F4(r / W) + '\\rikuywidth}');
        pen = null;
        continue;
      }
      if (s[0] === 'Z') {
        if (pen && first && run.length && inside(first) && inside(pen)) { run.push(first); flush(); o.push('\\pgfpathclose'); }
        else flush();
        pen = first;
        continue;
      }
      if (!pen) { pen = [s[1], s[2]]; first = pen; continue; }
      const b = [s[1], s[2]], c = clipSeg(pen, b);
      if (c) {
        const last = run[run.length - 1];
        if (!run.length || last[0] !== c[0][0] || last[1] !== c[0][1]) { flush(); run.push(c[0]); }
        run.push(c[1]);
        if (c[1][0] !== b[0] || c[1][1] !== b[1]) flush();
      } else flush();
      pen = b;
    }
    flush();
    return o.join('\n');
  }
  use(what) {
    const body = this.emitPath();
    if (!body) return;
    const lines = ['\\begin{pgfscope}'];
    if (what === 'stroke') {
      const c = this.color(this.st.stroke, 'stroke');
      lines.push(c.set, '\\pgfsetlinewidth{' + F4(this.st.lw / this.W) + '\\rikuywidth}');
      if (c.a < 1) lines.push('\\pgfsetstrokeopacity{' + F4(c.a) + '}');
      if (this.st.dash.length) lines.push('\\pgfsetdash{' + this.st.dash.map((d) => '{' + F4(d / this.W) + '\\rikuywidth}').join('') + '}{0pt}');
    } else {
      const c = this.color(this.st.fill, 'fill');
      lines.push(c.set);
      if (c.a < 1) lines.push('\\pgfsetfillopacity{' + F4(c.a) + '}');
    }
    lines.push(body, '\\pgfusepath{' + what + '}', '\\end{pgfscope}');
    this.push(lines.join('\n'));
  }
  stroke() { this.use('stroke'); }
  fill() { this.use('fill'); }
  clip() { const body = this.emitPath(); if (body) this.out.push(body + '\n\\pgfusepath{clip}'); }
  fillRect(x, y, w, h) { const p = this.path; this.path = []; this.rect(x, y, w, h); this.fill(); this.path = p; }
  strokeRect(x, y, w, h) { const p = this.path; this.path = []; this.rect(x, y, w, h); this.stroke(); this.path = p; }
  clearRect() { /* paper */ }
  fillText(t, x, y) {
    const st = this.st, px = parseFloat(st.font.replace(/^\D*/, '')) || 12, it = /italic/.test(st.font);
    const tex = this.rkTex || K.labelTex(String(t));
    const h = st.align === 'right' || st.align === 'end' ? 'right' : st.align === 'left' || st.align === 'start' ? 'left' : '';
    const v = st.base === 'top' || st.base === 'hanging' ? 'top' : st.base === 'bottom' || st.base === 'ideographic' ? 'bottom' : st.base === 'middle' ? '' : 'base';
    const c = this.color(st.fill, 'fill');
    // (the turn, about the anchor: the y label reads upwards)
    const rot = Math.round(-st.rot * 180 / Math.PI);
    const opts = [h, v].filter(Boolean).join(',');
    const size = px >= 13 ? '\\small' : '\\footnotesize';
    const at = '\\pgfqpoint{' + F4((x + st.tx) / this.W) + '\\rikuywidth}{' + F4((this.H - y - st.ty) / this.W) + '\\rikuywidth}';
    const body = '{\\color{' + c.name + '}' + size + (it ? '\\itshape ' : ' ') + '\\strut ' + tex + '}';
    // (turned about its anchor: the y label reads upwards)
    if (rot) this.push('\\begin{pgfscope}\\pgftransformshift{' + at + '}\\pgftransformrotate{' + rot + '}\\pgftext' + (opts ? '[' + opts + ']' : '') + body + '\\end{pgfscope}');
    else this.push('\\pgftext[' + (opts ? opts + ',' : '') + 'at={' + at + '}]' + body);
  }
  text(mark, spec) {
    const cols = [...this.colors.entries()].map(([k, n]) => '\\definecolor{' + n + '}{rgb}{' + k + '}');
    return PGF_HEAD + mark + '\n' +
      '% The picture TeX prints for an interactive graph (Insert, Interactive graph in Rikuy): drawn by\n' +
      '% Rikuy from the graph\'s description, the live figure at its starting values. Rikuy writes it\n' +
      '% again when the graph changes; edit the graph, not this file. ' + spec + '\n' +
      '% rikuy.sty inputs it (\\rikuywidth is the width); it needs \\usepackage{pgf}, which rikuy.sty loads.\n' +
      // (every line ends in % where its end would be a space: the picture sits in a line of text)
      '\\begingroup%\n\\ifx\\rikuywidth\\undefined\\csname newdimen\\endcsname\\rikuywidth\\rikuywidth=\\linewidth\\fi%\n' +
      '\\def\\rkm#1 #2 {\\pgfpathmoveto{\\pgfqpoint{#1\\rikuywidth}{#2\\rikuywidth}}}%\n' +
      '\\def\\rkl#1 #2 {\\pgfpathlineto{\\pgfqpoint{#1\\rikuywidth}{#2\\rikuywidth}}}%\n' +
      cols.map((c) => c + '%\n').join('') +
      '\\begin{pgfpicture}%\n\\pgfsetroundjoin\\pgfsetroundcap%\n' +
      '\\pgfpathrectangle{\\pgfpointorigin}{\\pgfqpoint{\\rikuywidth}{' + F4(this.H / this.W) + '\\rikuywidth}}\\pgfusepath{use as bounding box}%\n' +
      this.out.join('\n') + (this.cut ? '\n% (the rest of the picture was left out: it was past ' + PGF_MAX + ' bytes)' : '') + '\n\\end{pgfpicture}%\n\\endgroup%\n';
  }
}

// The PDF's picture of a graph as PGF, W CSS pixels wide (the text's width, which only places the
// type: the lines scale to the width TeX gives). mark: the graph's file, and the description's
// hash, so a picture Rikuy drew is known and drawn again when its graph changes.
export function graphPGF(spec, W, mark = '') {
  const s = K.normalize(spec);
  W = Math.max(200, Math.min(1200, Math.round(W)));
  const H = Math.round(W * s.aspect);
  const g = new PGFContext(W, H);
  const vals = K.defaults(s);
  K.paint(g, s, K.compute(s, vals), K.ranges(s), vals, W, H, null, null);
  return g.text(String(mark).replace(/[^\x20-\x7e]/g, '_').slice(0, 300) + ' ' + specHash(s) + ' ' + W, summary(s));
}
// what a picture of ours says on its first line: { path, hash, W }, or null for any other file
export function pgfMark(text) {
  if (typeof text !== 'string' || !text.startsWith(PGF_HEAD)) return null;
  const m = /^% rikuy-graph: (\S+) ([0-9a-f]{8}) (\d+)\n/.exec(text.slice(0, 400));
  return m ? { path: m[1], hash: m[2], W: +m[3] } : null;
}
// A description's hash (FNV-1a over its JSON): a picture drawn for another one is drawn again
export function specHash(spec) {
  const t = JSON.stringify(K.normalize(spec));
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
// the graph in a line of words, for the picture's comment: what it draws and over which range
export function summary(s) {
  const f = s.kind === 'function' ? s.f.map((x) => 'y = ' + x).join('; ') + ' for ' + s.vars[0] + ' from ' + K.fmt(s.x.min, 4) + ' to ' + K.fmt(s.x.max, 4)
    : s.kind === 'implicit' ? s.eq.join('; ') : s.kind === 'phase' ? 'd' + s.vars[0] + '/dt = ' + s.phase.dx + '; d' + s.vars[1] + '/dt = ' + s.phase.dy
      : s.kind === 'curve' ? (s.curve.mode === 'polar' ? 'r = ' + s.curve.r : '(' + s.curve.x + ', ' + s.curve.y + ')') : s.kind === 'data' ? s.data.points.length + ' points' : K.FAM[s.dist.family].name;
  const q = s.sliders.map((x) => x.name + ' = ' + K.fmt(x.value, 4) + ' (' + K.fmt(x.min, 4) + ' to ' + K.fmt(x.max, 4) + ')').join(', ');
  return (f + (q ? '; ' + q : '')).replace(/−/g, '-').replace(/[\r\n%\\]/g, ' ').slice(0, 600);
}

// mark: the graph's file the picture is drawn for (a tEXt chunk "rikuy-graph"): only a picture so
// marked, or none, is ever drawn again (one's own picture under that name is one's own)
export function graphPNG(spec, W, scale = 3, mark = '') {
  const c = graphCanvas(spec, W, scale);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('The picture could not be made'))), 'image/png'))
    .then(async (b) => new Blob([withMark(withDpi(new Uint8Array(await b.arrayBuffer()), 96 * scale), mark)], { type: 'image/png' }));
}
const MARK_KEY = 'rikuy-graph';
export function withMark(png, mark) {
  if (!mark || png.length < 33) return png;
  const data = new TextEncoder().encode(MARK_KEY + '\0' + String(mark).slice(0, 300).replace(/[^\x20-\x7e]/g, '_'));
  const chunk = new Uint8Array(12 + data.length), v = new DataView(chunk.buffer);
  v.setUint32(0, data.length); chunk.set([0x74, 0x45, 0x58, 0x74], 4); chunk.set(data, 8);
  v.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33)); out.set(chunk, 33); out.set(png.subarray(33), 33 + chunk.length);
  return out;
}
// the graph a picture was drawn for, from its mark, or null (bounded: the first 64 chunks)
export function pngMark(png) {
  if (!png || png.length < 33 || png[1] !== 0x50) return null;
  const v = new DataView(png.buffer, png.byteOffset, png.length);
  for (let p = 8, k = 0; p + 12 <= png.length && k < 64; k++) {
    const n = v.getUint32(p), type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    if (type === 'IDAT' || type === 'IEND' || p + 12 + n > png.length) return null;
    if (type === 'tEXt' && n < 400) {
      const t = new TextDecoder().decode(png.subarray(p + 8, p + 8 + n));
      if (t.startsWith(MARK_KEY + '\0')) return t.slice(MARK_KEY.length + 1);
    }
    p += 12 + n;
  }
  return null;
}

// A PNG with its resolution written (a pHYs chunk after IHDR): without one graphicx takes 72 dpi,
// and a command with no width printed the picture at three times its size
export function withDpi(png, dpi) {
  if (png.length < 33 || png[12] !== 0x49 || png[13] !== 0x48) return png;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21), v = new DataView(chunk.buffer);
  v.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); v.setUint32(8, ppm); v.setUint32(12, ppm); chunk[16] = 1;
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  // (one already there is replaced: the IHDR is 8 + 25 bytes from the start)
  let rest = png.subarray(33);
  if (rest.length > 8 && String.fromCharCode(...rest.subarray(4, 8)) === 'pHYs') rest = rest.subarray(21);
  const out = new Uint8Array(33 + 21 + rest.length);
  out.set(png.subarray(0, 33)); out.set(chunk, 33); out.set(rest, 54);
  return out;
}
let CRC = null;
function crc32(a) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < a.length; i++) c = CRC[(c ^ a[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// the width a PNG was drawn for, in CSS pixels (its pixels over its scale), or 0
export function pngWidth(png, scale = 3) {
  return png && png.length > 24 && png[12] === 0x49 ? new DataView(png.buffer, png.byteOffset).getUint32(16) / scale : 0;
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
%   \\rikuywidget[<\\includegraphics options>]{<widget .html>}{<fallback picture>}
%
% TeX (Rikuy's PDF pane, Overleaf, arXiv, a desktop TeX Live) prints the fallback and never opens
% the widget file. The fallback is a picture \\includegraphics takes (PDF, PNG, JPEG), or a .pgf
% file of PGF's drawing commands, as Rikuy writes for its interactive graphs: TeX draws it as
% lines in the document's own fonts, as wide as the width option says (\\linewidth when none).
% Rikuy's typeset page runs the widget: a self contained HTML file of the project (inline script
% and style, nothing from the network) in a sandboxed frame as wide as the text. The widget sets
% the frame's height by sending
%   parent.postMessage({rikuy: "height", px: <integer>}, "*")
% Both paths are relative to the main .tex file; keep this file beside it.
%
% This file is in the public domain: copy it into any document.
\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{rikuy}[2026/11/20 v1.1 Live figures in Rikuy, pictures in print]
\\RequirePackage{graphicx}
% PGF draws the .pgf pictures; loaded as the preamble ends, so a later \\usepackage[...]{xcolor}
% keeps its options (PGF loads xcolor)
\\ifdefined\\AddToHook
  \\AddToHook{begindocument/before}{\\RequirePackage{pgf}}
\\else
  \\RequirePackage{pgf}
\\fi
\\newdimen\\rikuywidth
\\def\\rikuy@pgf{pgf}
% robust, so that it survives a moving argument as \\includegraphics does
\\DeclareRobustCommand\\rikuywidget[3][]{%
  \\filename@parse{#3}%
  \\ifx\\filename@ext\\rikuy@pgf\\rikuy@figure{#1}{#3}\\else\\includegraphics[#1]{#3}\\fi}
% the width option read as \\includegraphics reads it; the other options are for pictures
\\def\\rikuy@figure#1#2{\\begingroup
  \\let\\Gin@ewidth\\Gin@exclamation
  \\setkeys{Gin}{#1}%
  \\ifx\\Gin@ewidth\\Gin@exclamation\\rikuywidth=\\linewidth\\else\\rikuywidth=\\Gin@ewidth\\relax\\fi
  \\leavevmode\\input{#2}\\endgroup}
\\endinput
`;
// rikuy.sty as Rikuy wrote it before .pgf pictures (v1.0): a project with it gets the new one,
// one with a rikuy.sty of its own keeps it and its graphs' pictures stay PNG
export const RIKUY_STY_V10 = /\\ProvidesPackage\{rikuy\}\[2026\/10\/30 v1\.0 Live figures in Rikuy, pictures in print\]\s*\\RequirePackage\{graphicx\}\s*(?:%[^\n]*\n\s*)*\\DeclareRobustCommand\\rikuywidget\[3\]\[\]\{\\includegraphics\[#1\]\{#3\}\}\s*\\endinput\s*$/;
// whether a project's rikuy.sty prints .pgf pictures
export const styDrawsPgf = (t) => typeof t === 'string' && /\\rikuy@figure/.test(t);
