// Word's linear format for equations (UnicodeMath, Unicode Technical Note 28) and LaTeX, each into
// the other: the Equation tab's Convert › Linear shows an equation as Word types it, (a+b)/c,
// x^2, √(n&x), ∑_(i=1)^n, α, and what is typed there comes back as the LaTeX the source keeps.
// The common part of both languages: fractions, scripts, roots, Greek, operators, relations,
// arrows, big operators, functions, brackets, matrices, text. A LaTeX command UnicodeMath has no
// form for (\hat{x}, \mathbf{v}, \binom{n}{k}, cases, \left( \right)) is shown as it is written,
// with its braces, and read back the same, so a round trip never changes what the source means.
// Pure: no page.

const SYM = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', circ: '∘', bullet: '∙',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅', setminus: '∖',
  forall: '∀', exists: '∃', neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗', perp: '⊥', parallel: '∥', angle: '∠',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦', uparrow: '↑', downarrow: '↓', implies: '⟹', iff: '⟺',
  ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', prime: '′',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', mid: '∣',
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂'
};
// (\varnothing and \dots are not here: ∅ is \emptyset's glyph, and \dots changes with what is
// next to it, so both stay as they are written)
const FROM_SYM = Object.fromEntries(Object.entries(SYM).reverse().map(([k, v]) => [v, k]));
// (the names a reverse table must give: the usual one of two)
Object.assign(FROM_SYM, { '≤': 'le', '≥': 'ge', '≠': 'ne', '→': 'to', '←': 'leftarrow', '¬': 'neg', '∧': 'land', '∨': 'lor', 'ϵ': 'epsilon', 'ε': 'varepsilon', 'ϕ': 'phi', 'φ': 'varphi' });
// Word's double struck letters, amssymb's \mathbb
const BB = { 'ℝ': 'R', 'ℕ': 'N', 'ℤ': 'Z', 'ℚ': 'Q', 'ℂ': 'C', 'ℙ': 'P', 'ℍ': 'H' };
const BB_OF = Object.fromEntries(Object.entries(BB).map(([k, v]) => [v, k]));
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg', 'Pr', 'liminf', 'limsup']);
const BIG = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂']);
const MATRIX = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], vmatrix: ['|', '|'], Bmatrix: ['{', '}'] };
const MATRIX_OF = { '()': 'pmatrix', '[]': 'bmatrix', '||': 'vmatrix', '{}': 'Bmatrix' };
// Brackets inside brackets, deeper than this, are refused with a message rather than read (a
// paste of thousands of parentheses would otherwise overflow the stack in the input handler)
export const MAX_DEPTH = 100;
export const DEEP = 'More than ' + MAX_DEPTH + ' brackets inside one another: too deep to convert.';
// (marks lin puts round a function's name and a command written as it is, so the last pass can
// tell them from letters; never in the result)
const F0 = '\uE000', F1 = '\uE001', V0 = '\uE002', V1 = '\uE003';
const bare = (t) => t.replace(/[\uE000-\uE003]/g, '');

// one balanced {…} or […] group at s[i], its end, or -1
function groupEnd(s, i) {
  const open = s[i], close = open === '{' ? '}' : ']';
  for (let d = 0, j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return j + 1;
  }
  return -1;
}
// the end of \begin{env}…\end{env} from i (just after "\begin{env}"), nested ones of the same name
// counted
function envEnd(s, i, env) {
  const b = '\\begin{' + env + '}', e = '\\end{' + env + '}';
  for (let d = 1, j = i; j < s.length; j++) {
    if (s.startsWith(b, j)) { d++; j += b.length - 1; } else if (s.startsWith(e, j) && --d === 0) return j + e.length;
  }
  return -1;
}
const DELIM = /^(\\[A-Za-z]+|\\.|[^\s])/;

// ---- LaTeX to linear --------------------------------------------------------------------------------
// LaTeX's math read into a list of atoms: { t: 'text', v } a run as it is (cmd: a command kept as
// written, fn: a function's name, big: a big operator); { t: 'frac', a, b }; { t: 'sup' | 'sub', v };
// { t: 'sqrt', n, v }; { t: 'group', v } (braces); { t: 'fence', l, r, v } (\left \right, as
// written); { t: 'matrix', env, rows }; { t: 'textword', v }
function parseTex(s, i = 0, stop = null, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error(DEEP);
  const out = [];
  const arg = () => {
    while (s[i] === ' ') i++;
    if (s[i] === '{') { i++; const v = parseTex(s, i, '}', depth + 1); i = v.i + 1; return v.list; }
    if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); i += m[0].length; return parseTex(m[0], 0, null, depth + 1).list; }
    const c = s[i++];
    return c == null ? [] : [{ t: 'text', v: c }];
  };
  // a command and the {…} and […] groups right after it, as written
  // (TeX skips spaces after a command's name, so \underbrace {x} is \underbrace{x})
  const verbatim = (start) => {
    for (;;) {
      let j = i;
      while (s[j] === ' ' || s[j] === '\n' || s[j] === '\t') j++;
      if (s[j] !== '{' && !(s[j] === '[' && j === i)) break;
      const z = groupEnd(s, j);
      if (z < 0) break;
      i = z;
    }
    out.push({ t: 'text', v: s.slice(start, i), cmd: true });
  };
  while (i < s.length) {
    const c = s[i];
    if (stop && c === stop) break;
    if (stop === 'right' && /^\\right(?![A-Za-z])/.test(s.slice(i, i + 7))) break;
    if (c === '{') { i++; const v = parseTex(s, i, '}', depth + 1); i = v.i + 1; out.push({ t: 'group', v: v.list }); continue; }
    if (c === '^' || c === '_') { i++; out.push({ t: c === '^' ? 'sup' : 'sub', v: arg() }); continue; }
    if (c === '\\') {
      const start = i;
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      if (!m) { out.push({ t: 'text', v: '\\', cmd: true }); i++; continue; }
      const name = m[1];
      i += m[0].length;
      if (name === 'frac') {
        // (only two braced or one letter arguments; anything else is kept as written)
        const a = arg(), b = arg();
        out.push({ t: 'frac', a, b }); continue;
      }
      if (name === 'sqrt') {
        let n = null;
        while (s[i] === ' ') i++;
        if (s[i] === '[') { const z = groupEnd(s, i); if (z < 0) { verbatim(start); continue; } n = parseTex(s.slice(i + 1, z - 1), 0, null, depth + 1).list; i = z; }
        out.push({ t: 'sqrt', n, v: arg() }); continue;
      }
      if (name === 'text' && s[i] === '{') {
        const z = groupEnd(s, i);
        const v = s.slice(i + 1, z < 0 ? s.length : z - 1);
        // (words in quotes; a quote inside them cannot be written so: kept as written)
        if (z > 0 && !/["\\{}]/.test(v)) { i = z; out.push({ t: 'textword', v }); continue; }
        verbatim(start); continue;
      }
      if (name === 'mathbb' && /^\{[A-Z]\}/.test(s.slice(i, i + 3)) && BB_OF[s[i + 1]]) { out.push({ t: 'text', v: BB_OF[s[i + 1]] }); i += 3; continue; }
      if (name === 'left') {
        while (s[i] === ' ') i++;
        const lm = DELIM.exec(s.slice(i));
        if (!lm) { verbatim(start); continue; }
        i += lm[0].length;
        const v = parseTex(s, i, 'right', depth + 1);
        i = v.i;
        let r = '';
        if (s.startsWith('\\right', i)) {
          i += 6;
          while (s[i] === ' ') i++;
          const rm = DELIM.exec(s.slice(i));
          r = rm ? rm[0] : '';
          i += r.length;
          r = '\\right' + r;
        }
        out.push({ t: 'fence', l: '\\left' + lm[0], r, v: v.list }); continue;
      }
      if (name === 'begin') {
        const m2 = /^\{([A-Za-z]+\*?)\}/.exec(s.slice(i));
        if (m2) {
          i += m2[0].length;
          const z = envEnd(s, i, m2[1]);
          const end = z < 0 ? s.length : z;
          const body = s.slice(i, z < 0 ? s.length : z - ('\\end{' + m2[1] + '}').length);
          // (a plain matrix as Word's ■; any other environment, or a matrix holding one, as written)
          if (MATRIX[m2[1]] && z > 0 && !/\\begin|\\\\\s*\[/.test(body)) {
            out.push({ t: 'matrix', env: m2[1], rows: body.split(/\\\\/).map((r) => r.trim()).filter((r, k, a) => r || k < a.length - 1).map((r) => r.split('&').map((x) => parseTex(x.trim(), 0, null, depth + 1).list)) });
          } else out.push({ t: 'text', v: s.slice(start, end), cmd: true });
          i = end;
          continue;
        }
      }
      if (/^[A-Za-z]+$/.test(name) && SYM[name]) { out.push({ t: 'text', v: SYM[name], big: BIG.has(SYM[name]), sym: true }); continue; }
      if (FUNCS.has(name)) { out.push({ t: 'text', v: name, fn: true }); continue; }
      // (anything else, \hat{x}, \mathbf{v}, \binom{n}{k}, \, and \%, as written)
      verbatim(start);
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    // (a slash written in LaTeX is a slash: Word's linear fraction ∕, which reads back as one)
    out.push({ t: 'text', v: c === '/' ? '∕' : c });
    i++;
  }
  return { list: out, i };
}
const ALNUM = /[\p{L}\p{N}∂∇∞!′″ℏℓ']/u;
// what may go on a run of letters and numbers, at its start and at its end
const RUNSTART = /^[\p{L}\p{N}∂∇∞!′″ℏℓ'\\(〖]/u, RUNEND = /[\p{L}\p{N}∂∇∞!′″ℏℓ')〗}.]$/u;
// one operand as UnicodeMath writes it: as it is if it is one letter, number, symbol or command;
// otherwise in parentheses, which reading takes off again (so written parentheses get a second pair)
function operand(list) {
  const t = lin(list);
  const b = bare(t);
  if (list.length === 1 && list[0].t === 'text' && (list[0].cmd || list[0].fn || [...list[0].v].length === 1)) return t;
  if (list.length && list.every((a) => a.t === 'text' && /^[0-9.]$/.test(a.v)) && /^\d+(\.\d+)?$/.test(b)) return t;
  return '(' + t + ')';
}
const lastCh = (out) => bare(out).slice(-1);
function lin(list) {
  let out = '';
  let big = false, sep = false;
  const push = (t) => {
    // (after a fraction, a letter or number starts a new operand: a space keeps it out of the denominator)
    if (sep && RUNSTART.test(bare(t))) out += ' ';
    // (a command's name ends before a letter only with a space: ^\top X)
    else if (/\\[A-Za-z]+$/.test(bare(out)) && /^[A-Za-z]/.test(bare(t))) out += ' ';
    sep = false;
    out += t;
  };
  for (let k = 0; k < list.length; k++) {
    const a = list[k], next = list[k + 1];
    const scripted = next && (next.t === 'sup' || next.t === 'sub');
    // (a big operator's scripts end with a space before what it acts on: ∑_(i=1)^n i^2)
    if (big && a.t !== 'sup' && a.t !== 'sub') { out += ' '; big = false; }
    if (a.t === 'text' && a.big) big = true;
    else if (a.t !== 'sup' && a.t !== 'sub') big = false;
    if (a.t === 'text') {
      // (a command or a function after letters keeps a space, so \alpha x stays two things)
      if ((a.fn || (a.cmd && /^\\[A-Za-z]/.test(a.v))) && /[A-Za-z]/.test(lastCh(out))) out += ' ';
      push(a.fn ? F0 + a.v + F1 : a.cmd ? V0 + a.v + V1 : a.v);
      if ((a.fn || (a.cmd && /[A-Za-z]$/.test(a.v))) && next && next.t === 'text' && /^[A-Za-z0-9]/.test(next.v)) out += ' ';
    } else if (a.t === 'group') push('〖' + lin(a.v) + '〗');
    else if (a.t === 'sup' || a.t === 'sub') { out += (a.t === 'sup' ? '^' : '_') + operand(a.v); sep = false; }
    else if (a.t === 'frac' || a.t === 'sqrt') {
      let t = a.t === 'frac' ? operand(a.a) + '/' + operand(a.b) : '√' + (a.n ? '(' + lin(a.n) + '&' + lin(a.v) + ')' : operand(a.v));
      // (a script on a fraction or a root: Word's invisible brackets 〖 〗 hold it, as a/b^2 is a over b²)
      if (scripted) t = '〖' + t + '〗';
      if (RUNEND.test(lastCh(out))) out += ' ';
      push(t);
      sep = a.t === 'frac' && !scripted;
    } else if (a.t === 'fence') {
      const inner = lin(a.v);
      push(a.l + (/[A-Za-z]$/.test(a.l) && /^[A-Za-z0-9]/.test(bare(inner)) ? ' ' : '') + inner + a.r);
    } else if (a.t === 'textword') push('"' + a.v + '"');
    else if (a.t === 'matrix') { const [l, r] = MATRIX[a.env]; push(l + '■(' + a.rows.map((row) => row.map(lin).join('&')).join('@') + ')' + r); }
  }
  return out;
}
// The last pass: letters that spell a function's name but are not one (x_{max}) get Word's
// invisible times between them, so they read back as letters
function finish(t) {
  return t.replace(/\uE000[^\uE001]*\uE001|\uE002[^\uE003]*\uE003|"[^"]*"|[A-Za-z]+/g, (m) => (/^[A-Za-z]+$/.test(m) && FUNCS.has(m) ? m[0] + '\u2062' + m.slice(1) : m)).replace(/[\uE000-\uE003]/g, '');
}
// The linear text of an equation, or null where it cannot be shown (brackets too deep)
export function toLinear(latex) {
  try { return finish(lin(parseTex(String(latex || '').slice(0, 20000)).list)).trim(); } catch { return null; }
}

// ---- linear to LaTeX ----------------------------------------------------------------------------------
// A UnicodeMath text read: a row of operands and operators; / makes a fraction of the operands on
// either side (a run of letters and numbers is one operand: ab/cd), ^ and _ a script (x^2^3 is
// x to the 2³), √ a root; ( ) around an operand of those are its own, dropped
function tokensOf(t) {
  const out = [];
  for (let i = 0; i < t.length;) {
    const c = t[i];
    if (c === ' ' || c === '▒' || c === '\u2061' || c === '\u2009' || c === '\u00a0') { out.push({ k: 'sp' }); i++; continue; }
    if (c === '\u2062' || c === '\u200b') { i++; continue; }
    if (c === '"') { const z = t.indexOf('"', i + 1); const v = z < 0 ? t.slice(i + 1) : t.slice(i + 1, z); out.push({ k: 'text', v }); i = z < 0 ? t.length : z + 1; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.?)/.exec(t.slice(i));
      const name = m[1];
      let j = i + m[0].length;
      if (name === 'left' || name === 'right') {
        let k = j; while (t[k] === ' ') k++;
        const d = DELIM.exec(t.slice(k));
        if (d) { out.push({ k: name === 'left' ? 'lopen' : 'rclose', v: '\\' + name + d[0] }); i = k + d[0].length; continue; }
      }
      if (name === 'begin') {
        const m2 = /^\{([A-Za-z]+\*?)\}/.exec(t.slice(j));
        if (m2) { const z = envEnd(t, j + m2[0].length, m2[1]); j = z < 0 ? t.length : z; out.push({ k: 'cmd', v: t.slice(i, j) }); i = j; continue; }
      }
      // (a command with the {…} and […] groups right after it, as it is written)
      for (;;) {
        let k = j;
        while (t[k] === ' ' || t[k] === '\n' || t[k] === '\t') k++;
        if (t[k] !== '{' && !(t[k] === '[' && k === j)) break;
        const z = groupEnd(t, k);
        if (z < 0) break;
        j = z;
      }
      out.push({ k: 'cmd', v: t.slice(i, j) }); i = j; continue;
    }
    const nm = /[0-9.]/.test(c) && /^[0-9]*\.?[0-9]+|^[0-9]+\.?/.exec(t.slice(i));
    if (nm) { out.push({ k: 'num', v: nm[0] }); i += nm[0].length; continue; }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z]+/.exec(t.slice(i))[0];
      // (a function's name when it is the whole run of letters; other letters one by one, as math reads them)
      if (FUNCS.has(m)) out.push({ k: 'fn', v: m });
      else for (const ch of m) out.push({ k: 'id', v: ch });
      i += m.length;
      continue;
    }
    const cp = String.fromCodePoint(t.codePointAt(i));
    // (Word's ┬ and ┴ put what follows under or over: a script here)
    out.push({ k: 'op', v: cp === '┬' ? '_' : cp === '┴' ? '^' : cp });
    i += cp.length;
  }
  return out;
}
const OPEN = { '(': ')', '[': ']', '{': '}', '⟨': '⟩', '|': '|', '⌊': '⌋', '⌈': '⌉' };
const TEX_CHAR = { '−': '-', '∕': '/', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '$': '\\$', '〖': '', '〗': '' };
function texOfSym(c) {
  if (c in TEX_CHAR) return TEX_CHAR[c];
  if (BB[c]) return '\\mathbb{' + BB[c] + '}';
  const n = FROM_SYM[c];
  return n ? '\\' + n : c;
}
// an operand that can go on a run of letters and numbers (2x, n!, f(x)), as Word reads ab/cd
// (a command goes on it when it has a letter name and is not a space or a style: \hat{x}, \ep)
const SPACING = /^\\(quad|qquad|displaystyle|textstyle|scriptstyle|scriptscriptstyle|hfill|hspace|vspace|label|tag|notag|nonumber|newline|limits|nolimits)(?![A-Za-z])/;
const runs = (x) => x && (x.k === 'id' || x.k === 'num' || (x.k === 'cmd' && /^\\[A-Za-z]/.test(x.v) && !SPACING.test(x.v)) || x.k === 'lopen' || (x.k === 'op' && (x.v === '(' || x.v === '〖' || (ALNUM.test(x.v) && !BIG.has(x.v)))));
const argOf = (o) => (o.a != null ? o.a : o.w);
const join = (a, b) => (/\\[A-Za-z]+$/.test(a) && /^[A-Za-z]/.test(b) ? a + ' ' + b : a + b);
// a \frac or \sqrt and its groups, nothing else: a script on it needs no braces round it
const oneAtom = (t) => { const m = /^\\(frac|sqrt)/.exec(t); if (!m) return false; let j = m[0].length; while (t[j] === '{' || t[j] === '[') { const z = groupEnd(t, j); if (z < 0) return false; j = z; } return j === t.length; };
export function fromLinear(text) {
  const T = tokensOf(String(text || '').slice(0, 20000));
  let i = 0, depth = 0;
  const peek = () => T[i];
  const skip = () => { while (T[i] && T[i].k === 'sp') i++; };
  const enter = () => { if (++depth > MAX_DEPTH) throw new Error(DEEP); };
  // an operand, as written (with its parentheses) and as an argument (without them)
  const prim = () => {
    skip();
    const x = T[i];
    if (!x) return null;
    enter();
    try {
      if (x.k === 'op' && x.v === '(') {
        i++;
        const inner = row(')');
        // (a parenthesis never closed stays open, as it was typed)
        if (peek() && peek().v === ')') { i++; return { w: '(' + inner + ')', a: inner, run: true }; }
        return { w: '(' + inner, a: '(' + inner, run: true };
      }
      if (x.k === 'op' && x.v === '〖') {
        i++;
        const inner = row('〗');
        if (peek() && peek().v === '〗') i++;
        return { w: '{' + inner + '}', a: inner, run: true, group: true };
      }
      if (x.k === 'lopen') {
        i++;
        const inner = row('rclose');
        let w = join(x.v, inner);
        if (peek() && peek().k === 'rclose') { w += peek().v; i++; }
        return { w, a: w, run: true };
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
        const o = scripted();
        if (!o) return { w: '\\sqrt{}', a: '\\sqrt{}' };
        const amp = o.a != null && !o.group ? splitAmp(o.a) : null;
        const t = amp ? '\\sqrt[' + amp[0] + ']{' + amp[1] + '}' : '\\sqrt{' + argOf(o) + '}';
        return { w: t, a: t };
      }
      // (a script with nothing before it: on an empty base, {}^2, as TeX needs)
      if (x.k === 'op' && (x.v === '^' || x.v === '_')) return { w: '{}', a: '{}' };
      i++;
      let t;
      if (x.k === 'num' || x.k === 'id') t = x.v;
      else if (x.k === 'fn') t = '\\' + x.v;
      else if (x.k === 'cmd') t = x.v;
      else if (x.k === 'text') t = '\\text{' + x.v + '}';
      else if (x.k === 'rclose') t = x.v;
      else t = texOfSym(x.v);
      // (a function's name goes on a run when brackets follow it at once: sin(x)/x)
      return { w: t, a: t, big: x.k === 'op' && BIG.has(x.v), run: runs(x) || (x.k === 'fn' && !!T[i] && T[i].k === 'op' && T[i].v === '('), fn: x.k === 'fn' };
    } finally { depth--; }
  };
  // a script's operand: a sign may lead it (a^-1), and a script of the same kind after it is its
  // own (x^2^3 is x^{2^{3}}, as Word builds it)
  const scriptArg = (op) => {
    let sign = '';
    const p = peek();
    if (p && p.k === 'op' && (p.v === '-' || p.v === '−' || p.v === '+' || p.v === '±' || p.v === '∓')) {
      sign = texOfSym(p.v); i++;
      // (a sign alone, x^+ or x^-, when no operand follows it)
      const q = peek();
      if (!q || q.k === 'sp' || !(runs(q) || q.k === 'fn' || q.k === 'text' || (q.k === 'op' && (q.v === '√' || BIG.has(q.v))))) return sign;
    }
    const s = prim();
    let arg = sign + (s ? (sign ? s.w : argOf(s)) : '');
    const q = peek();
    if (q && q.k === 'op' && q.v === op) { i++; enter(); try { arg += op + '{' + scriptArg(op) + '}'; } finally { depth--; } }
    return arg;
  };
  // an operand and its scripts
  const scripted = () => {
    let o = prim();
    if (!o) return null;
    for (let first = true; ; first = false) {
      const p = peek();
      if (!p || p.k !== 'op' || (p.v !== '^' && p.v !== '_')) break;
      i++;
      const arg = scriptArg(p.v);
      // (Word's invisible brackets round a fraction or a root: the script is on it, no braces needed)
      const base = first && o.group && oneAtom(o.a) ? o.a : o.w;
      o = { w: base + p.v + '{' + arg + '}', a: base + p.v + '{' + arg + '}', run: o.run, fn: o.fn, big: o.big };
    }
    return o;
  };
  // the denominator: an operand, then the run of letters and numbers right after it
  const denominator = () => {
    const items = [];
    const first = scripted();
    if (!first) return '';
    items.push(first);
    if (first.run) while (runs(peek())) { const o = scripted(); if (!o) break; items.push(o); }
    return items.length === 1 ? argOf(first) : items.map((o) => o.w).reduce(join, '');
  };
  const row = (end) => {
    let out = '';
    let run = [];
    while (i < T.length) {
      const p = peek();
      if (end && ((end === 'rclose' && p.k === 'rclose') || (p.k === 'op' && p.v === end))) break;
      if (p.k === 'sp') { i++; run = []; continue; }
      if (p.k === 'op' && p.v === '/') {
        i++;
        if (!run.length) { out += '/'; continue; }
        const at = run[0].at;
        const num = run.length === 1 ? argOf(run[0]) : out.slice(at);
        out = out.slice(0, at);
        const f = '\\frac{' + num + '}{' + denominator() + '}';
        // (1/2/3 is (1/2)/3: the fraction is the next one's numerator)
        run = [{ w: f, a: f, at: out.length }];
        out += f;
        continue;
      }
      if (p.k === 'op' && (p.v === '@' || p.v === '&')) { i++; out += p.v; run = []; continue; }
      if (p.k === 'op' && p.v !== '(' && p.v !== '|' && OPEN[p.v]) {
        // (another bracket: written as it is, its inside read on)
        i++;
        out += texOfSym(p.v);
        run = [];
        continue;
      }
      if (p.k === 'op' && (p.v === ')' || p.v === '〗') && !end) { i++; out += p.v === ')' ? ')' : ''; run = []; continue; }
      const o = scripted();
      if (!o) break;
      // (a command before a letter needs a space to end its name)
      const sp = /\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(o.w) ? ' ' : '';
      out += sp;
      if (o.run && run.length) run.push({ ...o, at: out.length });
      else run = o.run ? [{ ...o, at: out.length }] : [];
      out += o.w;
    }
    return out;
  };
  const r = row(null);
  // (a matrix in brackets: pmatrix, bmatrix, vmatrix)
  return r.replace(/([([|]|\\\{)\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}([)\]|]|\\\})/g, (m, l, body, rr) => {
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

// ---- typing in the Linear box -----------------------------------------------------------------------------
// LaTeX's tokens as far as meaning goes: spaces dropped, a script's one token argument with or
// without braces the same (x^2, x^{2}), a command's other names the same (\leq, \le)
function texTokens(s) {
  const out = [];
  const canon = (t) => { const m = /^\\([A-Za-z]+)$/.exec(t); return m && SYM[m[1]] && FROM_SYM[SYM[m[1]]] ? '\\' + FROM_SYM[SYM[m[1]]] : t; };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const st = i;
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|[\s\S]?)/.exec(s.slice(i));
      i += m[0].length;
      out.push({ k: canon(m[0]), s: st, e: i });
      continue;
    }
    if (c === '^' || c === '_') {
      let j = i + 1;
      while (/\s/.test(s[j] || '')) j++;
      const rest = s.slice(j);
      const m = /^\{\s*(\\[A-Za-z]+|\\[^A-Za-z]|[^{}\\\s])\s*\}/.exec(rest) || /^(\\[A-Za-z]+|\\[^A-Za-z]|[^{}\\\s])/.exec(rest);
      if (m) { i = j + m[0].length; out.push({ k: c + canon(m[1]), s: st, e: i }); continue; }
    }
    out.push({ k: c, s: st, e: i + 1 });
    i++;
  }
  return out;
}
const sameTokens = (A, B) => A.length === B.length && A.every((x, k) => x.k === B[k].k);
// What a text typed in the Linear box writes into an equation whose LaTeX is now orig, written
// from the linear text was (or shown as toLinear(orig) when was is null): { tex, live } where live
// means it may be written as it is typed (orig reads into the box and back unchanged, and so does
// what was typed); only the part that differs is changed, orig's other bytes are kept. { error }
// for a text that cannot be read.
export function linearEdit(orig, text, was = null) {
  const L0 = was == null ? toLinear(orig) : was;
  if (L0 == null) return { error: DEEP };
  if (text === L0) return { tex: orig, live: true };
  let t1, t0;
  try { t1 = fromLinear(text); t0 = fromLinear(L0); } catch (e) { return { error: e.message || DEEP }; }
  const A = texTokens(orig), B = texTokens(t0), C = texTokens(t1);
  const live = sameTokens(A, B);
  const L1 = toLinear(t1);
  let stable = false;
  try { stable = L1 != null && sameTokens(C, texTokens(fromLinear(L1))); } catch { stable = false; }
  if (!live) return { tex: t1, live: false, why: 'source' };
  // (orig's bytes where the tokens agree; the typed part from t1 between them)
  let p = 0;
  while (p < B.length && p < C.length && B[p].k === C[p].k) p++;
  let q = 0;
  while (q < B.length - p && q < C.length - p && B[B.length - 1 - q].k === C[C.length - 1 - q].k) q++;
  const removed = A.length - p - q, added = C.length - p - q;
  const mid = added > 0 ? t1.slice(C[p].s, C[C.length - 1 - q].e) : '';
  let tex;
  if (removed > 0) tex = join(join(orig.slice(0, A[p].s), mid), orig.slice(A[A.length - 1 - q].e));
  else {
    const at = p > 0 ? A[p - 1].e : (A.length ? A[0].s : orig.length);
    tex = join(join(orig.slice(0, at), mid), orig.slice(at));
  }
  if (!sameTokens(texTokens(tex), C)) tex = t1;
  return { tex, live: stable, why: stable ? null : 'typed' };
}
