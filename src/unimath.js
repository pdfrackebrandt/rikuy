// Word's linear format for equations (UnicodeMath, Unicode Technical Note 28) and LaTeX, each into
// the other: the Equation tab's Convert › Linear shows an equation as Word types it, (a+b)/c,
// x^2, √(n&x), ∑_(i=1)^n, α, and what is typed there comes back as the LaTeX the source keeps.
// The common part of both languages: fractions, scripts, roots, Greek, operators, relations,
// arrows, big operators, functions, brackets, matrices, text. Pure: no page.

const SYM = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', circ: '∘', bullet: '∙',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅', setminus: '∖',
  forall: '∀', exists: '∃', neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗', perp: '⊥', parallel: '∥', angle: '∠',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦', uparrow: '↑', downarrow: '↓', implies: '⟹', iff: '⟺',
  ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dots: '…', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', degree: '°', prime: '′',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', mid: '∣',
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂'
};
const FROM_SYM = Object.fromEntries(Object.entries(SYM).reverse().map(([k, v]) => [v, k]));
// (the names a reverse table must give: the usual one of two)
Object.assign(FROM_SYM, { '≤': 'le', '≥': 'ge', '≠': 'ne', '→': 'to', '∅': 'emptyset', '¬': 'neg', '∧': 'land', '∨': 'lor', '…': 'ldots', 'ϵ': 'epsilon', 'ε': 'varepsilon', 'ϕ': 'phi', 'φ': 'varphi' });
FROM_SYM['−'] = null; // (U+2212 is a minus: '-')
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg', 'Pr', 'liminf', 'limsup']);
const BIG = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂']);
const MATRIX = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], vmatrix: ['|', '|'], Bmatrix: ['{', '}'] };
const MATRIX_OF = { '()': 'pmatrix', '[]': 'bmatrix', '||': 'vmatrix', '{}': 'Bmatrix' };

// ---- LaTeX to linear --------------------------------------------------------------------------------
// LaTeX's math read into a list of atoms: { t: 'text', v } a run as it is; { t: 'frac', a, b };
// { t: 'sup' | 'sub', v }; { t: 'sqrt', n, v }; { t: 'group', v } (braces); { t: 'fence', l, r, v };
// { t: 'matrix', env, rows }; { t: 'textword', v }
function parseTex(s, i = 0, stop = null) {
  const out = [];
  const arg = () => {
    while (s[i] === ' ') i++;
    if (s[i] === '{') { i++; const v = parseTex(s, i, '}'); i = v.i + 1; return v.list; }
    if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); i += m[0].length; return parseTex(m[0]).list; }
    const c = s[i++];
    return c == null ? [] : [{ t: 'text', v: c }];
  };
  while (i < s.length) {
    const c = s[i];
    if (stop && c === stop) break;
    if (stop === 'right' && s.startsWith('\\right', i)) break;
    if (c === '{') { i++; const v = parseTex(s, i, '}'); i = v.i + 1; out.push({ t: 'group', v: v.list }); continue; }
    if (c === '^' || c === '_') { i++; out.push({ t: c === '^' ? 'sup' : 'sub', v: arg() }); continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      const name = m[1];
      i += m[0].length;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = arg(), b = arg(); out.push({ t: 'frac', a, b }); continue; }
      if (name === 'sqrt') {
        let n = null;
        while (s[i] === ' ') i++;
        if (s[i] === '[') { const z = s.indexOf(']', i); n = parseTex(s.slice(i + 1, z)).list; i = z + 1; }
        out.push({ t: 'sqrt', n, v: arg() }); continue;
      }
      if (name === 'text' || name === 'textrm' || name === 'mathrm' || name === 'operatorname') {
        while (s[i] === ' ') i++;
        if (s[i] === '{') { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } const v = s.slice(i + 1, j); i = j + 1; out.push(name === 'operatorname' ? { t: 'text', v: v } : name === 'mathrm' && /^[A-Za-z]$/.test(v) ? { t: 'text', v } : { t: 'textword', v }); continue; }
      }
      if (name === 'left') {
        const l = s[i] === '\\' ? /^\\([A-Za-z]+|.)/.exec(s.slice(i))[0] : s[i];
        i += l.length;
        const v = parseTex(s, i, 'right');
        i = v.i + '\\right'.length;
        const r = s[i] === '\\' ? /^\\([A-Za-z]+|.)/.exec(s.slice(i))[0] : s[i] || '';
        i += r.length;
        out.push({ t: 'fence', l: l === '.' ? '' : l.replace(/^\\/, ''), r: r === '.' ? '' : r.replace(/^\\/, ''), v: v.list }); continue;
      }
      if (name === 'begin') {
        const m2 = /^\{([A-Za-z]+\*?)\}/.exec(s.slice(i));
        if (m2 && MATRIX[m2[1]]) {
          i += m2[0].length;
          const end = s.indexOf('\\end{' + m2[1] + '}', i);
          const body = s.slice(i, end < 0 ? s.length : end);
          i = end < 0 ? s.length : end + ('\\end{' + m2[1] + '}').length;
          out.push({ t: 'matrix', env: m2[1], rows: body.split(/\\\\/).map((r) => r.trim()).filter((r, k, a) => r || k < a.length - 1).map((r) => r.split('&').map((x) => parseTex(x.trim()).list)) });
          continue;
        }
      }
      if (name === ',' || name === ';' || name === ' ' || name === 'quad' || name === 'qquad' || name === '!') { out.push({ t: 'text', v: name === '!' ? '' : ' ' }); continue; }
      if (name === '{' || name === '}' || name === '%' || name === '#' || name === '&' || name === '_' || name === '$') { out.push({ t: 'text', v: name === '{' ? '\\{' : name === '}' ? '\\}' : name }); continue; }
      if (SYM[name]) { out.push({ t: 'text', v: SYM[name], big: BIG.has(SYM[name]) }); continue; }
      if (FUNCS.has(name)) { out.push({ t: 'text', v: name, fn: true }); continue; }
      out.push({ t: 'text', v: '\\' + name, cmd: true });
      continue;
    }
    if (c === ' ') { i++; continue; }
    out.push({ t: 'text', v: c });
    i++;
  }
  return { list: out, i };
}
// one operand as UnicodeMath writes it: in parentheses unless it is one letter, number or symbol
function operand(list) {
  const t = lin(list);
  if (/^([A-Za-z]|\d+(\.\d+)?|[^\x00-\x7F])$/.test(t) || /^\(.*\)$/.test(t) && balanced(t.slice(1, -1))) return t;
  return '(' + t + ')';
}
function balanced(t) { let d = 0; for (const c of t) { if (c === '(') d++; else if (c === ')' && --d < 0) return false; } return d === 0; }
function lin(list) {
  let out = '';
  let big = false;
  for (let k = 0; k < list.length; k++) {
    const a = list[k];
    // (a big operator's scripts end with a space before what it acts on: ∑_(i=1)^n i^2)
    if (big && a.t !== 'sup' && a.t !== 'sub') { out += ' '; big = false; }
    if (a.t === 'text' && a.big) big = true;
    else if (a.t !== 'sup' && a.t !== 'sub') big = false;
    if (a.t === 'text') {
      // (a command after letters keeps a space, so \alpha x stays two things; a function its space)
      if (a.cmd && /[A-Za-z]$/.test(out)) out += ' ';
      out += a.v;
      if ((a.fn || a.cmd) && list[k + 1] && list[k + 1].t === 'text' && /^[A-Za-z0-9]/.test(list[k + 1].v)) out += ' ';
    } else if (a.t === 'group') out += lin(a.v);
    else if (a.t === 'sup' || a.t === 'sub') out += (a.t === 'sup' ? '^' : '_') + operand(a.v);
    else if (a.t === 'frac') out += operand(a.a) + '/' + operand(a.b);
    else if (a.t === 'sqrt') out += '√' + (a.n ? '(' + lin(a.n) + '&' + lin(a.v) + ')' : operand(a.v));
    else if (a.t === 'fence') out += (SYM[a.l] || a.l) + lin(a.v) + (SYM[a.r] || a.r);
    else if (a.t === 'textword') out += '"' + a.v + '"';
    else if (a.t === 'matrix') { const [l, r] = MATRIX[a.env]; out += l + '■(' + a.rows.map((row) => row.map(lin).join('&')).join('@') + ')' + r; }
  }
  return out;
}
export function toLinear(latex) {
  try { return lin(parseTex(String(latex || '').slice(0, 20000)).list).trim(); } catch { return String(latex || ''); }
}

// ---- linear to LaTeX ----------------------------------------------------------------------------------
// A UnicodeMath text read: a row of operands and operators; / makes a fraction of the operands on
// either side, ^ and _ a script, √ a root; ( ) around an operand of those are its own, dropped
function tokensOf(t) {
  const out = [];
  for (let i = 0; i < t.length;) {
    const c = t[i];
    if (c === ' ') { out.push({ k: 'sp' }); i++; continue; }
    if (c === '"') { const z = t.indexOf('"', i + 1); const v = z < 0 ? t.slice(i + 1) : t.slice(i + 1, z); out.push({ k: 'text', v }); i = z < 0 ? t.length : z + 1; continue; }
    if (c === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(t.slice(i)); out.push({ k: 'cmd', v: m[0] }); i += m[0].length; continue; }
    if (/[0-9.]/.test(c)) { const m = /^[0-9]*\.?[0-9]+|^[0-9]+/.exec(t.slice(i)); out.push({ k: 'num', v: m[0] }); i += m[0].length; continue; }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z]+/.exec(t.slice(i))[0];
      // (a function's name whole; other letters one by one, as math reads them)
      const f = [...FUNCS].filter((x) => m.startsWith(x)).sort((a, b) => b.length - a.length)[0];
      if (f) { out.push({ k: 'fn', v: f }); i += f.length; continue; }
      out.push({ k: 'id', v: c }); i++; continue;
    }
    out.push({ k: 'op', v: c }); i++;
  }
  return out;
}
const OPEN = { '(': ')', '[': ']', '{': '}', '⟨': '⟩', '|': '|', '⌊': '⌋', '⌈': '⌉' };
function texOfSym(c) {
  if (c === '−') return '-';
  const n = FROM_SYM[c];
  return n ? '\\' + n : c === '{' ? '\\{' : c === '}' ? '\\}' : c;
}
export function fromLinear(text) {
  const T = tokensOf(String(text || '').slice(0, 20000));
  let i = 0;
  const peek = () => T[i];
  const skip = () => { while (T[i] && T[i].k === 'sp') i++; };
  // an operand, as written (with its parentheses) and as an argument (without them)
  const prim = () => {
    skip();
    const x = T[i];
    if (!x) return null;
    if (x.k === 'op' && x.v === '(' ) {
      i++;
      const inner = row(')');
      if (peek() && peek().v === ')') i++;
      return { w: '(' + inner + ')', a: inner };
    }
    if (x.k === 'op' && x.v === '■') {
      i++;
      if (peek() && peek().v === '(') i++;
      const body = row(')');
      if (peek() && peek().v === ')') i++;
      const rows = body.split('@').map((r) => r.split('&').map((c) => c.trim()).join(' & '));
      return { w: '\\begin{matrix}' + rows.join(' \\\\ ') + '\\end{matrix}', a: null, matrix: rows };
    }
    if (x.k === 'op' && x.v === '√') {
      i++;
      const o = prim();
      if (!o) return { w: '\\sqrt{}', a: '' };
      const amp = o.a != null ? splitAmp(o.a) : null;
      const t = amp ? '\\sqrt[' + amp[0] + ']{' + amp[1] + '}' : '\\sqrt{' + (o.a != null ? o.a : o.w) + '}';
      return { w: t, a: t };
    }
    i++;
    let t;
    if (x.k === 'num' || x.k === 'id') t = x.v;
    else if (x.k === 'fn') t = '\\' + x.v;
    else if (x.k === 'cmd') t = x.v;
    else if (x.k === 'text') t = '\\text{' + x.v + '}';
    else t = texOfSym(x.v);
    return { w: t, a: t, big: x.k === 'op' && BIG.has(x.v), cmd: x.k === 'cmd' || x.k === 'fn' || (x.k === 'op' && !!FROM_SYM[x.v]) };
  };
  // an operand and its scripts
  const scripted = () => {
    let o = prim();
    if (!o) return null;
    for (;;) {
      const p = peek();
      if (!p || p.k !== 'op' || (p.v !== '^' && p.v !== '_')) break;
      i++;
      const s = prim();
      const arg = s ? (s.a != null ? s.a : s.w) : '';
      o = { w: o.w + p.v + '{' + arg + '}', a: o.w + p.v + '{' + arg + '}', cmd: false };
    }
    return o;
  };
  const row = (end) => {
    let out = '';
    let prev = null;
    while (i < T.length) {
      const p = peek();
      if (end && p.k === 'op' && (p.v === end || (end === ')' && (p.v === '@' || p.v === '&') && false))) break;
      if (p.k === 'sp') { i++; continue; }
      if (p.k === 'op' && p.v === '/' && prev) {
        i++;
        const b = scripted();
        out = out.slice(0, out.length - prev.w.length) + '\\frac{' + (prev.a != null ? prev.a : prev.w) + '}{' + (b ? (b.a != null ? b.a : b.w) : '') + '}';
        prev = { w: '', a: '' };
        continue;
      }
      if (p.k === 'op' && (p.v === '@' || p.v === '&')) { i++; out += p.v; prev = null; continue; }
      if (p.k === 'op' && p.v !== '(' && p.v !== '√' && p.v !== '■' && OPEN[p.v] && p.v !== '|') {
        // (another bracket: written as it is, its inside read on)
        i++;
        out += texOfSym(p.v) === p.v && (p.v === '[') ? '[' : texOfSym(p.v);
        prev = null;
        continue;
      }
      const o = scripted();
      if (!o) break;
      // (a command before a letter needs a space to end its name)
      if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(o.w)) out += ' ';
      out += o.w;
      prev = o;
    }
    return out;
  };
  const r = row(null);
  // (a matrix in brackets: pmatrix, bmatrix, vmatrix)
  return r.replace(/\\left|\\right/g, '').replace(/([([|]|\\\{)\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}([)\]|]|\\\})/g, (m, l, body, rr) => {
    const k = (l.replace('\\', '') + rr.replace('\\', ''));
    const env = MATRIX_OF[k];
    return env ? '\\begin{' + env + '}' + body + '\\end{' + env + '}' : m;
  });
}
function splitAmp(t) {
  let d = 0;
  for (let k = 0; k < t.length; k++) { const c = t[k]; if (c === '{' || c === '(') d++; else if (c === '}' || c === ')') d--; else if (c === '&' && d === 0) return [t.slice(0, k), t.slice(k + 1)]; }
  return null;
}
