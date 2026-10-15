import { fenceSource, unfence, tallTest, OPEN_KEY, CLOSE_KEY, MATCH, isBar, sameClose } from './fences.js';

// Where a selection goes when a command is typed over it: the base, not an index or label.
function wrapSlot(tex) {
  if (/^\\(overset|underset|stackrel)\{#\?\}\{#\?\}$/.test(tex)) return tex.replace(/\{#\?\}$/, '{#@}');
  if (/^\\sqrt\[#\?\]/.test(tex)) return tex.replace('{#?}', '{#@}');
  return tex.replace('#?', '#@');
}

// A slash before a relation negates it (Word: a/=b is a≠b, x/\in A is x∉A).
const NEGATE = {
  '=': '\\neq', '<': '\\nless', '>': '\\ngtr', '\\in': '\\notin', '\\ni': '\\not\\ni', '\\equiv': '\\not\\equiv',
  '\\sim': '\\nsim', '\\simeq': '\\not\\simeq', '\\approx': '\\not\\approx', '\\cong': '\\ncong',
  '\\le': '\\nleq', '\\leq': '\\nleq', '\\ge': '\\ngeq', '\\geq': '\\ngeq', '\\subset': '\\not\\subset', '\\supset': '\\not\\supset',
  '\\subseteq': '\\nsubseteq', '\\supseteq': '\\nsupseteq', '\\mid': '\\nmid', '\\parallel': '\\nparallel', '\\exists': '\\nexists',
  '\\rightarrow': '\\nrightarrow', '\\leftarrow': '\\nleftarrow', '\\Rightarrow': '\\nRightarrow', '\\Leftarrow': '\\nLeftarrow',
  '\\leftrightarrow': '\\nleftrightarrow', '\\Leftrightarrow': '\\nLeftrightarrow', '\\prec': '\\nprec', '\\succ': '\\nsucc',
  '\\vdash': '\\nvdash', '\\models': '\\not\\models', '\\to': '\\nrightarrow'
};
// Word-style equation typing on top of a MathLive field:
//   \name + Space (or Enter, Tab, any symbol) converts, like Word's Math AutoCorrect
//   function names (sin, max, lim ...) turn upright once a non-letter follows, as in Word
//   Space leaves a superscript, subscript, fraction part or root, one level at a time
//   in display math, subscripts after max, min, lim, sup, inf, argmax ... sit below
//   ASCII pairs like -> <= != +- convert as in Word

// Word Math AutoCorrect names that LaTeX spells the same way.
const SAME = ('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho ' +
  'sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega ' +
  'aleph beth gimel daleth hbar ell wp Re Im imath jmath infty partial nabla emptyset ' +
  'amalg ast bullet cap cup cdot circ diamond div mp pm odot ominus oplus otimes setminus sqcap sqcup star times uplus vee wedge wr ' +
  'bigcap bigcup bigodot bigoplus bigotimes bigsqcup biguplus bigvee bigwedge coprod prod sum int iint iiint oint ' +
  'approx asymp bowtie cong dashv doteq equiv frown ge geq gg in le leq ll mid models ne neq ni notin parallel perp prec preceq ' +
  'propto sim simeq smile sqsubseteq subset subseteq succ succeq top bot vdash ' +
  'downarrow Downarrow gets hookleftarrow hookrightarrow leftarrow Leftarrow leftharpoondown leftharpoonup leftrightarrow ' +
  'Leftrightarrow Longleftarrow Longleftrightarrow Longrightarrow mapsto nearrow nwarrow rightarrow Rightarrow rightharpoondown ' +
  'rightharpoonup searrow swarrow to uparrow Uparrow updownarrow Updownarrow ' +
  'angle because therefore exists forall boxdot boxminus boxplus clubsuit diamondsuit heartsuit spadesuit ' +
  'cdots ddots ldots vdots langle rangle lceil rceil lfloor rfloor').split(' ');

// Word names that LaTeX spells differently, or that need empty slots (#?). '' means Word's
// entry is layout glue with no LaTeX counterpart, so it inserts nothing.
const WORD = {
  // structures
  sqrt: '\\sqrt{#?}', cbrt: '\\sqrt[3]{#?}', qdrt: '\\sqrt[4]{#?}', root: '\\sqrt[#?]{#?}',
  frac: '\\frac{#?}{#?}', dfrac: '\\dfrac{#?}{#?}', tfrac: '\\tfrac{#?}{#?}', over: '\\frac{#?}{#?}', binom: '\\binom{#?}{#?}',
  atop: '{#?\\atop #?}', above: '\\overset{#?}{#?}', below: '\\underset{#?}{#?}',
  sdiv: '/', sdivide: '/', ldiv: '/', ldivide: '/',
  matrix: '\\begin{matrix}#?&#?\\\\#?&#?\\end{matrix}', pmatrix: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}',
  bmatrix: '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', Bmatrix: '\\begin{Bmatrix}#?&#?\\\\#?&#?\\end{Bmatrix}',
  vmatrix: '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', Vmatrix: '\\begin{Vmatrix}#?&#?\\\\#?&#?\\end{Vmatrix}',
  cases: '\\begin{cases}#?&#?\\\\#?&#?\\end{cases}', eqarray: '\\begin{aligned}#?&=#?\\\\#?&=#?\\end{aligned}',
  identitymatrix: '\\begin{pmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{pmatrix}',
  box: '\\boxed{#?}', rect: '\\boxed{#?}', boxed: '\\boxed{#?}',
  left: '(', open: '(', begin: '(',
  right: '', close: '', end: '', middle: '', of: '', naryand: '', funcapply: '', itimes: '', zwsp: '', zwnj: '', break: '', eqno: '', j: '',
  // fonts and text
  text: '\\text{#?}', mathrm: '\\mathrm{#?}', mathbf: '\\mathbf{#?}', mathbb: '\\mathbb{#?}', mathcal: '\\mathcal{#?}',
  mathfrak: '\\mathfrak{#?}', mathit: '\\mathit{#?}', mathsf: '\\mathsf{#?}', mathtt: '\\mathtt{#?}',
  boldsymbol: '\\boldsymbol{#?}', bm: '\\boldsymbol{#?}', operatorname: '\\operatorname{#?}',
  // accents and over/under marks
  acute: '\\acute{#?}', grave: '\\grave{#?}', breve: '\\breve{#?}', check: '\\check{#?}', dot: '\\dot{#?}', ddot: '\\ddot{#?}',
  dddot: '\\dddot{#?}', ddddot: '\\ddddot{#?}', hat: '\\hat{#?}', widehat: '\\widehat{#?}', tilde: '\\tilde{#?}',
  widetilde: '\\widetilde{#?}', bar: '\\bar{#?}', Bar: '\\overline{\\overline{#?}}', vec: '\\vec{#?}', hvec: '\\vec{#?}',
  rhvec: '\\vec{#?}', lhvec: '\\overleftarrow{#?}', lvec: '\\overleftarrow{#?}', tvec: '\\overleftrightarrow{#?}',
  overleftarrow: '\\overleftarrow{#?}', overrightarrow: '\\overrightarrow{#?}', overleftrightarrow: '\\overleftrightarrow{#?}',
  overbar: '\\overline{#?}', overline: '\\overline{#?}', underbar: '\\underline{#?}', underline: '\\underline{#?}',
  ubar: '\\underline{#?}', Ubar: '\\underline{\\underline{#?}}', overbrace: '\\overbrace{#?}', underbrace: '\\underbrace{#?}',
  overbracket: '\\overbrace{#?}', underbracket: '\\underbrace{#?}', overparen: '\\overset{\\frown}{#?}',
  overshell: '\\overset{\\frown}{#?}', underparen: '\\underset{\\smile}{#?}', undershell: '\\underset{\\smile}{#?}',
  // phantoms and smash
  phantom: '\\phantom{#?}', hphantom: '\\hphantom{#?}', vphantom: '\\vphantom{#?}', smash: '\\smash{#?}',
  asmash: '\\smash[t]{#?}', dsmash: '\\smash[b]{#?}', hsmash: '\\mathrlap{#?}',
  // spaces
  hairsp: '\\,', thinsp: '\\,', medsp: '\\:', thicksp: '\\;', vthicksp: '\\;\\,', ensp: '\\enspace', emsp: '\\quad',
  nbsp: '~', dots: '\\ldots', quad: '\\quad', qquad: '\\qquad',
  // letters, constants, units
  G: '\\Gamma', o: 'o', O: '\\mathrm{O}', Alpha: '\\mathrm{A}', Beta: '\\mathrm{B}', Epsilon: '\\mathrm{E}', Zeta: '\\mathrm{Z}',
  Eta: '\\mathrm{H}', Iota: '\\mathrm{I}', Kappa: '\\mathrm{K}', Mu: '\\mathrm{M}', Nu: '\\mathrm{N}', Omicron: '\\mathrm{O}',
  omicron: 'o', Rho: '\\mathrm{P}', Tau: '\\mathrm{T}', Chi: '\\mathrm{X}', bet: '\\beth', dalet: '\\daleth',
  inc: '\\Delta', dd: '\\mathrm{d}', Dd: '\\mathrm{D}', ee: '\\mathrm{e}', ii: '\\mathrm{i}', jj: '\\mathrm{j}',
  degree: '^{\\circ}', degc: '^{\\circ}\\mathrm{C}', degf: '^{\\circ}\\mathrm{F}',
  prime: '^{\\prime}', pprime: '^{\\prime\\prime}', ppprime: '^{\\prime\\prime\\prime}', pppprime: '^{\\prime\\prime\\prime\\prime}',
  emptyset: '\\emptyset', varnothing: '\\varnothing',
  // relations, operators, brackets
  Deltaeq: '\\triangleq', defeq: '\\stackrel{\\mathrm{def}}{=}', ratio: ':', superset: '\\supset', superseteq: '\\supseteq',
  sqsuperseteq: '\\sqsupseteq', notcontain: '\\not\\ni', notelement: '\\notin', vbar: '\\vert', vert: '\\vert', Vert: '\\Vert',
  bra: '\\langle', ket: '\\rangle', Rangle: '\\rangle\\!\\rangle', Langle: '\\langle\\!\\langle', lbbrack: '\\llbracket',
  Rbrack: '\\rrbracket', rbbrack: '\\rrbracket', lbrack: '[', rbrack: ']', lbrace: '\\{', rbrace: '\\}',
  lmoust: '\\lmoustache', rmoust: '\\rmoustache', lrhar: '\\leftrightharpoons', rlhar: '\\rightleftharpoons', rddots: '\\iddots',
  coint: '\\oint', aoint: '\\oint', oiint: '\\oiint', iiiint: '\\iiiint',
  norm: '\\mleft\\lVert #?\\mright\\rVert', abs: '\\mleft\\lvert #?\\mright\\rvert', floor: '\\mleft\\lfloor #?\\mright\\rfloor', ceil: '\\mleft\\lceil #?\\mright\\rceil',
  // formulas Word ships in its list
  quadratic: 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
  binomial: '(a+b)^{n}=\\sum_{k=0}^{n}\\binom{n}{k}a^{k}b^{n-k}',
  integral: '\\frac{1}{2\\pi}\\int_{0}^{2\\pi}\\frac{d\\theta}{a+b\\sin\\theta}=\\frac{1}{\\sqrt{a^{2}-b^{2}}}',
  limit: '\\lim_{n\\to\\infty}\\left(1+\\frac{1}{n}\\right)^{n}=e'
};

// Word's recognized function names: typed as plain letters, set upright once a non-letter follows.
const FUNCS = ['arccos', 'arccot', 'arccsc', 'arcsec', 'arcsin', 'arctan', 'arg', 'cos', 'cosh', 'cot', 'coth', 'csc', 'csch', 'def',
  'deg', 'det', 'dim', 'exp', 'gcd', 'hom', 'inf', 'ker', 'lg', 'lim', 'liminf', 'limsup', 'ln', 'log', 'max', 'min', 'mod', 'Pr',
  'sec', 'sech', 'sin', 'sinh', 'sup', 'tan', 'tanh', 'argmax', 'argmin'];
const TEX_FUNCS = new Set(['arccos', 'arcsin', 'arctan', 'arg', 'cos', 'cosh', 'cot', 'coth', 'csc', 'deg', 'det', 'dim', 'exp', 'gcd',
  'hom', 'inf', 'ker', 'lg', 'lim', 'ln', 'log', 'max', 'min', 'Pr', 'sec', 'sin', 'sinh', 'sup', 'tan', 'tanh']);
// LaTeX operators with limits that MathLive only knows as macros. A macro cannot carry
// limits in the field, so the field holds the \operatorname* form and the source keeps the name.
const BUILTIN_OPS = { liminf: '\\operatorname*{lim\\,inf}', limsup: '\\operatorname*{lim\\,sup}', injlim: '\\operatorname*{inj\\,lim}', projlim: '\\operatorname*{proj\\,lim}' };
// Real operators MathLive sets with side scripts even in display math, where LaTeX puts them below.
const SIDE_FIX = /\\(sup|inf|gcd|Pr)(?![A-Za-z])(?!\s*\\(?:no)?limits(?![A-Za-z]))/g;
const SIDE_UNFIX = /\\(sup|inf|gcd|Pr)\\limits(?![A-Za-z])/g;

// What people type most comes first in suggestions.
const COMMON = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Phi', 'Psi', 'Omega', 'sum', 'prod', 'int', 'iint', 'oint', 'lim', 'max', 'min', 'sup', 'inf', 'argmax', 'argmin', 'sqrt', 'cbrt', 'frac',
  'infty', 'partial', 'nabla', 'pm', 'mp', 'times', 'div', 'cdot', 'circ', 'le', 'ge', 'ne', 'approx', 'equiv', 'sim', 'simeq', 'cong',
  'propto', 'll', 'gg', 'in', 'notin', 'subset', 'subseteq', 'supset', 'supseteq', 'cup', 'cap', 'setminus', 'emptyset', 'forall', 'exists',
  'neg', 'land', 'lor', 'to', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'iff', 'implies', 'mapsto', 'ldots',
  'cdots', 'vdots', 'ddots', 'degree', 'hat', 'bar', 'overline', 'tilde', 'vec', 'dot', 'ddot', 'mathbb', 'mathcal', 'mathrm', 'mathbf',
  'text', 'matrix', 'pmatrix', 'bmatrix', 'cases', 'binom', 'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'det', 'perp', 'parallel', 'angle',
  'ell', 'hbar', 'Re', 'Im', 'aleph', 'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil', 'norm', 'abs', 'dd', 'inc', 'therefore',
  'because', 'top', 'bot', 'oplus', 'otimes', 'star', 'ast', 'dagger', 'prime', 'qquad', 'quad', 'overbrace', 'underbrace', 'above', 'below'
];
const NAMES = [...new Set([...COMMON, ...SAME, ...Object.keys(WORD), ...FUNCS, ...Object.keys(BUILTIN_OPS)])];

const ALPHA = { double: '\\mathbb', fraktur: '\\mathfrak', script: '\\mathcal' };
function alphabet(name) {
  const m = /^(double|fraktur|script)([A-Za-z])$/.exec(name);
  if (!m) return null;
  if (m[1] !== 'fraktur' && !/[A-Z]/.test(m[2])) return null; // LaTeX has no lowercase blackboard or calligraphic letters
  return ALPHA[m[1]] + '{' + m[2] + '}';
}

// MathLive's own inline shortcuts minus surprises. Letters never convert on their own (Word
// needs a backslash), function names are handled by the typing rules, and anything that
// would not compile in plain LaTeX is replaced.
const DROP = new Set(['*', '**', '***', '//', '@', '^^', '^^^', '-:', '&&', '::', '\\\\', '?=']);
const BRACKETY = /[()[\]{}|]/; // typed brackets and bars are handled by the typing rules, not shortcuts
const ASCII = {
  '->': '\\to', '<-': '\\leftarrow', '=>': '\\Rightarrow', '<=>': '\\Leftrightarrow', '<->': '\\leftrightarrow',
  '<=': '\\le', '>=': '\\ge', '!=': '\\ne', '+-': '\\pm', '-+': '\\mp', '~=': '\\cong', '~~': '\\approx', '<<': '\\ll', '>>': '\\gg',
  '...': '\\ldots', ':=': '\\coloneqq', '==': '\\equiv', "''": '^{\\prime\\prime}', "'''": '^{\\prime\\prime\\prime}',
  "''''": '^{\\prime\\prime\\prime\\prime}', '∆': '\\Delta', '∂': '\\partial', 'Ω': '\\Omega', 'µ': '\\mu'
};
export function wordShortcuts(defaults) {
  const out = {};
  for (const [k, v] of Object.entries(defaults || {})) {
    if (/[A-Za-z]/.test(k) || DROP.has(k) || BRACKETY.test(k)) continue;
    out[k] = v;
  }
  return { ...out, ...ASCII };
}

// Packages a few Word symbols need beyond amsmath and amssymb.
export const PACKAGES = { llbracket: 'stmaryrd', rrbracket: 'stmaryrd', iddots: 'mathdots', oiint: 'esint', coloneqq: 'mathtools', mathrlap: 'mathtools' };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const argCount = (def) => { let n = 0; String(def).replace(/#(\d)/g, (m, d) => { n = Math.max(n, +d); return m; }); return n; };

// The field writes a few things in ways LaTeX does not take, or not the way they were
// written: put them back.
const BIG_OPS = 'int|iint|iiint|iiiint|oint|oiint|sum|prod|coprod|bigcup|bigcap|bigoplus|bigotimes|bigodot|biguplus|bigsqcup|bigvee|bigwedge';
export function tidy(s) {
  s = s.replace(/\\placeholder(?:\[[^\]]*\])?\{[^{}]*\}/g, ''); // empty slots left unfilled
  s = s.replace(/\\doubleprime(?![A-Za-z])/g, '\\prime\\prime');
  s = s.replace(/\^\{((?:\\prime)+)\}/g, (m, p) => "'".repeat(p.length / 6));
  s = s.replace(new RegExp('\\{\\\\(' + BIG_OPS + ')\\}([A-Za-z])?', 'g'), (m, n, next) => '\\' + n + (next ? ' ' + next : ''));
  s = s.replace(/\\operatorname(\*?)\{\\mathrm\{([^{}]*)\}\}/g, '\\operatorname$1{$2}');
  s = s.replace(/\\bm\{/g, '\\boldsymbol{').replace(/\\wmbm\{/g, '\\bm{').replace(/\\wmbsym\{/g, '\\boldsymbol{');
  // \! is a math-only command; inside \text it is just "!"
  let i = s.indexOf('\\text{');
  while (i >= 0) {
    let d = 0, j = i + 5;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') d++;
      else if (c === '}' && --d === 0) break;
    }
    const inner = s.slice(i + 6, j).replace(/\\!/g, '!');
    s = s.slice(0, i + 6) + inner + s.slice(j);
    i = s.indexOf('\\text{', i + 6 + inner.length);
  }
  return s;
}
// Field macros that keep \bm and \boldsymbol as written (MathLive would rename them).
export const FIELD_MACROS = {
  wmbm: { def: '\\bm{#1}', args: 1, captureSelection: true, expand: false },
  wmbsym: { def: '\\bm{#1}', args: 1, captureSelection: true, expand: false }
};

// Source LaTeX <-> what the field holds. `ops` maps user operator macros with limits
// (\DeclareMathOperator*) to their field form; `fieldMacros` are the macros the field knows.
export function makeDialect({ display, ops = {}, operators = [], fieldMacros = [], tallMacros = null, optMacros = null }) {
  const isTall = tallTest(display, tallMacros);
  const all = { ...BUILTIN_OPS, ...ops };
  const opNames = Object.keys(all).sort((a, b) => b.length - a.length);
  const byDef = Object.keys(all).sort((a, b) => all[b].length - all[a].length);
  const opRe = opNames.length ? new RegExp('\\\\(' + opNames.map(esc).join('|') + ')(?![A-Za-z])', 'g') : null;
  const macroLimits = fieldMacros.length ? new RegExp('\\\\(' + fieldMacros.map(esc).join('|') + ')(?![A-Za-z])\\s*\\\\(?:no)?limits(?![A-Za-z])', 'g') : null;
  const userOps = new Set(operators);
  return {
    toField(s) {
      s = s.replace(/\\(bm|boldsymbol)(?![A-Za-z])\s*\{/g, (m, n) => (n === 'bm' ? '\\wmbm{' : '\\wmbsym{'));
      if (opRe) s = s.replace(opRe, (m, n) => all[n]);
      if (display) s = s.replace(SIDE_FIX, (m, n) => '\\' + n + '\\limits');
      if (macroLimits) s = s.replace(macroLimits, (m, n) => '\\' + n); // MathLive drops scripts after a macro with \limits
      return fenceSource(s, optMacros);
    },
    fromField(s) {
      s = unfence(tidy(s), isTall);
      if (display) s = s.replace(SIDE_UNFIX, (m, n) => '\\' + n);
      for (const n of byDef) {
        const d = all[n];
        let i = s.indexOf(d);
        while (i >= 0) {
          const next = s.charAt(i + d.length);
          const rep = '\\' + n + (/[A-Za-z]/.test(next) ? ' ' : '');
          s = s.slice(0, i) + rep + s.slice(i + d.length);
          i = s.indexOf(d, i + rep.length);
        }
      }
      return s;
    },
    // The field form of a function or operator name, or null if it is not one.
    func(name) {
      if (ops[name]) return ops[name];
      if (userOps.has(name)) return '\\' + name;
      if (BUILTIN_OPS[name]) return BUILTIN_OPS[name];
      if (name === 'argmax' || name === 'argmin') return '\\operatorname*{arg\\,' + name.slice(3) + '}';
      if (!FUNCS.includes(name)) return null;
      if (display && /^(sup|inf|gcd|Pr)$/.test(name)) return '\\' + name + '\\limits';
      if (TEX_FUNCS.has(name)) return '\\' + name;
      if (name === 'mod') return '\\bmod';
      return '\\operatorname{' + name + '}';
    },
    recognizes(word) {
      return (FUNCS.includes(word) || userOps.has(word) || !!ops[word]) && word.length > 1;
    }
  };
}

// Split document macros for the field: operators with limits get expanded (see makeDialect),
// other operators are recognized by name as you type.
export function classifyMacros(macros) {
  const ops = {}, operators = [], plain = {};
  for (const [k, v] of Object.entries(macros || {})) {
    if (/^\\operatorname\*\{[^{}]*\}$/.test(v)) { ops[k] = v; continue; }
    if (/^\\operatorname\{[^{}]*\}$/.test(v) && k.length > 1) operators.push(k);
    plain[k] = v;
  }
  return { ops, operators, plain };
}

export function resolveCommand(name, macros, dialect) {
  if (!name) return null;
  const f = dialect && dialect.func(name);
  if (f && !(macros && macros[name] && !dialect.recognizes(name))) return f;
  if (macros && macros[name]) return '\\' + name + '{#?}'.repeat(argCount(macros[name]));
  if (Object.prototype.hasOwnProperty.call(WORD, name)) return WORD[name];
  const a = alphabet(name);
  if (a) return a;
  return '\\' + name;
}

// Every name the typing rules know, with what it inserts (for the help list and tests).
export function wordTable(dialect) {
  const out = [];
  for (const n of [...SAME, ...Object.keys(WORD), ...FUNCS]) out.push([n, resolveCommand(n, null, dialect)]);
  return out.filter(([, t], i, a) => a.findIndex((x) => x[0] === out[i][0]) === i && t != null);
}
export const WORD_GROUPS = [
  ['Greek', 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi o pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega G Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'],
  ['Structures', 'frac sqrt cbrt qdrt root binom atop above below matrix pmatrix bmatrix vmatrix cases eqarray box rect left norm abs floor ceil text identitymatrix'],
  ['Accents', 'hat bar Bar vec tilde dot ddot dddot acute grave breve check overline underline Ubar overbrace underbrace overparen underparen tvec lvec'],
  ['Big operators', 'sum prod coprod int iint iiint iiiint oint oiint bigcup bigcap bigoplus bigotimes bigodot biguplus bigsqcup bigvee bigwedge'],
  ['Functions (no backslash needed)', 'sin cos tan sec csc cot sinh cosh tanh coth sech csch arcsin arccos arctan arcsec arccsc arccot exp ln log lg lim liminf limsup max min sup inf argmax argmin det dim ker deg arg gcd hom mod Pr def'],
  ['Relations', 'le ge ne approx equiv sim simeq cong propto ll gg prec succ preceq succeq doteq Deltaeq defeq asymp models vdash dashv perp parallel mid in notin ni notcontain subset subseteq superset superseteq sqsubseteq sqsuperseteq'],
  ['Arrows', 'to gets rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow Longrightarrow Longleftarrow Longleftrightarrow mapsto uparrow downarrow updownarrow Uparrow Downarrow Updownarrow nearrow nwarrow searrow swarrow hookleftarrow hookrightarrow leftharpoonup leftharpoondown rightharpoonup rightharpoondown lrhar'],
  ['Operators', 'pm mp times div cdot circ ast star bullet oplus ominus otimes odot cap cup sqcap sqcup uplus setminus wedge vee amalg wr boxplus boxminus boxdot'],
  ['Brackets', 'langle rangle bra ket lbrace rbrace lfloor rfloor lceil rceil lbbrack Rbrack lmoust rmoust vert Vert'],
  ['Symbols', 'infty partial nabla emptyset forall exists therefore because angle aleph beth gimel daleth hbar ell wp Re Im imath jmath inc degree degc degf prime pprime dd ee ii jj cdots ldots vdots ddots rddots clubsuit diamondsuit heartsuit spadesuit'],
  ['Spaces', 'thinsp medsp thicksp ensp emsp quad qquad nbsp'],
  ['Phantoms', 'phantom hphantom vphantom smash asmash dsmash hsmash'],
  ['Formulas', 'quadratic binomial integral limit'],
  ['Letter styles', 'doubleR frakturg scriptL mathbb mathcal mathfrak mathbf mathrm']
];

function suggestions(prefix, macros) {
  const pool = [...new Set([...COMMON, ...Object.keys(macros || {}), ...NAMES])];
  const p = prefix.toLowerCase();
  const exact = pool.filter((x) => x === prefix);
  const starts = pool.filter((x) => x !== prefix && x.startsWith(prefix));
  const ci = pool.filter((x) => !x.startsWith(prefix) && x.toLowerCase().startsWith(p));
  const out = [...exact, ...starts, ...ci];
  const fam = ['double', 'fraktur', 'script'].find((w) => prefix.length >= 3 && (w.startsWith(prefix) || prefix.startsWith(w)));
  if (fam) {
    const ex = prefix.length > fam.length ? [prefix] : fam === 'fraktur' ? ['frakturg', 'frakturA'] : fam === 'double' ? ['doubleR', 'doubleN', 'doubleZ'] : ['scriptL', 'scriptF'];
    const at = prefix.length > fam.length ? 0 : Math.min(out.length, 2);
    out.splice(at, 0, ...ex.filter((e) => alphabet(e) && !out.includes(e)));
  }
  return out.slice(0, 6);
}

// Word-sized pairs live in the field as \mleft...\mright. MathLive spaces those like a closing
// bracket, which is right after a symbol, f(x), but squeezes a+(b). After an operator,
// relation or at the start, set them like \left...\right instead. Rendering only.
const ORDISH = new Set(['mord', 'mclose', 'subsup', 'leftright', 'genfrac', 'surd', 'accent', 'overunder', 'box', 'enclose', 'macro', 'mop', 'operator', 'extensible-symbol']);
let fencePatched = false;
function patchFenceSpacing(mf) {
  if (fencePatched) return;
  try {
    const keep = mf.getValue('latex');
    mf.setValue('\\mleft(x\\mright)', { silenceNotifications: true });
    const lr = mf._mathfield.model.atoms.find((a) => a.type === 'leftright');
    mf.setValue(keep, { silenceNotifications: true });
    const proto = lr && Object.getPrototypeOf(lr);
    if (!proto || typeof proto.render !== 'function') return;
    const render = proto.render;
    proto.render = function (ctx) {
      const prev = this.leftSibling;
      const afterSymbol = prev && prev.type !== 'first' && ORDISH.has(prev.type);
      if (this.variant !== 'mleft...mright' || afterSymbol) return render.call(this, ctx);
      this.variant = 'left...right';
      try { return render.call(this, ctx); } finally { this.variant = 'mleft...mright'; }
    };
    fencePatched = true;
  } catch (e) { /* spacing stays MathLive's */ }
}

// The field's LaTeX, with brackets still waiting for their partner written as one-sided
// (MathLive would otherwise write the partner the user has not typed).
export function fieldValue(mf) {
  const waiting = [];
  try {
    for (const a of mf._mathfield.model.atoms) if (a.type === 'leftright' && a.rightDelim === '?') { waiting.push(a); a.rightDelim = '.'; }
  } catch (e) { /* older MathLive */ }
  try { return mf.getValue('latex'); } finally { for (const a of waiting) a.rightDelim = '?'; }
}

// Attach Word typing rules to a MathLive field. `renderTex(tex)` returns HTML for previews.
export function installWordTyping(mf, opts) {
  let buf = null; // the command being typed, without the backslash
  let pick = 0;
  const chip = document.createElement('div');
  chip.className = 'wm-chip';
  chip.hidden = true;
  (opts.host || document.body).appendChild(chip);
  const macros = () => opts.macros() || {};
  const dialect = () => opts.dialect();
  const changed = () => mf.dispatchEvent(new Event('input', { bubbles: true }));
  const put = (tex, extra) => {
    if (!tex) return;
    // Word wraps a selection: select x+1, type \sqrt, and the root holds x+1
    if (tex.includes('#?') && !mf.selectionIsCollapsed && !(extra && extra.selectionMode)) tex = wrapSlot(tex);
    mf.insert(tex, { format: 'latex', selectionMode: tex.includes('#?') ? 'placeholder' : 'after', insertionMode: 'replaceSelection', mode: 'math', ...extra });
    changed();
  };

  const place = () => {
    let r = null;
    try { const c = mf.shadowRoot && mf.shadowRoot.querySelector('.ML__caret, .ML__text-caret, .ML__latex-caret'); if (c) r = c.getBoundingClientRect(); } catch (e) { r = null; }
    if (!r || !r.width && !r.height) { try { const info = mf.getElementInfo(Math.max(0, mf.position)); r = info && info.bounds; } catch (e) { r = null; } }
    if (!r || !r.width && !r.height) r = mf.getBoundingClientRect();
    const w = chip.offsetWidth || 220, h = chip.offsetHeight || 120;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - 12));
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    chip.style.left = x + 'px';
    chip.style.top = y + 'px';
  };
  const draw = () => {
    if (buf == null) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'wm-typed';
    head.textContent = '\\' + buf;
    chip.appendChild(head);
    const list = buf ? suggestions(buf, macros()) : [];
    pick = Math.min(pick, Math.max(0, list.length - 1));
    list.forEach((name, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wm-sug' + (i === pick ? ' on' : '');
      const t = (resolveCommand(name, macros(), dialect()) || '').replace(/#\?/g, '\\square');
      const sym = document.createElement('span');
      sym.className = 'wm-sym';
      sym.innerHTML = t ? opts.renderTex(t) : '<i>layout only</i>';
      const nm = document.createElement('span');
      nm.className = 'wm-name';
      nm.textContent = '\\' + name;
      row.append(sym, nm);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); buf = name; commit(); mf.focus(); });
      chip.appendChild(row);
    });
    const hint = document.createElement('div');
    hint.className = 'wm-hint';
    hint.textContent = list.length ? 'Space inserts \\' + buf + (list[pick] && list[pick] !== buf ? '. Tab picks \\' + list[pick] : '') : 'Type a command name';
    chip.appendChild(hint);
    chip._list = list;
    place();
  };
  const cancel = () => { buf = null; pick = 0; draw(); };
  const commit = () => {
    const name = buf;
    buf = null; pick = 0;
    draw();
    if (!name) return;
    const tex = resolveCommand(name, macros(), dialect());
    if ((OPEN_KEY[tex] || CLOSE_KEY[tex]) && bracketKey(tex)) return;
    if (NEGATE[tex] && unslash(NEGATE[tex])) return;
    put(tex);
  };

  // Word sets a function name upright once a non-letter follows it: "sin x", "max_x".
  const recognize = () => {
    if (mf.mode !== 'math') return false;
    const pos = mf.position;
    let k = 0, word = '';
    while (k < 9 && pos - k - 1 >= 0) {
      let t = '';
      try { t = mf.getValue(pos - k - 1, pos - k, 'latex'); } catch (e) { t = ''; }
      if (!/^[A-Za-z]$/.test(t)) break;
      word = t + word; k++;
    }
    if (k < 2 || k === 9 || !dialect().recognizes(word)) return false;
    const tex = dialect().func(word);
    if (!tex) return false;
    try { mf.selection = { ranges: [[pos - k, pos]], direction: 'forward' }; } catch (e) { return false; }
    put(tex, { selectionMode: 'after' });
    return true;
  };

  // Space steps out of a script, fraction part, root or accent; it never leaves a row or cell.
  const canStepOut = () => {
    try {
      const model = mf._mathfield && mf._mathfield.model;
      if (model && typeof model.at === 'function') {
        const a = model.at(mf.position);
        const p = a && a.parent;
        if (!p || p.type === 'root' || Array.isArray(a.parentBranch) || p.type === 'leftright') return false;
        return true;
      }
    } catch (e) { /* fall through */ }
    let depth = 0;
    try { const info = mf.getElementInfo(mf.position); depth = info && info.depth != null ? info.depth : 0; } catch (err) { depth = 0; }
    return depth > (opts.baseDepth ? opts.baseDepth() : 0);
  };

  // Table cells (aligned rows, matrices): which cell holds the caret.
  const cellAt = (pos) => {
    try {
      const model = mf._mathfield && mf._mathfield.model;
      let a = model.at(pos == null ? mf.position : pos);
      while (a && !Array.isArray(a.parentBranch)) a = a.parent;
      if (!a || !a.parent || typeof a.parent.getCell !== 'function') return null;
      return { arr: a.parent, r: a.parentBranch[0], c: a.parentBranch[1], model };
    } catch (e) { return null; }
  };
  const goCell = (at, r, c) => {
    const cl = at.arr.getCell(r, c);
    if (!cl || !cl.length) return false;
    const last = cl[cl.length - 1];
    if (cl.length === 2 && last.type === 'placeholder') mf.selection = { ranges: [[at.model.offsetOf(cl[0]), at.model.offsetOf(last)]], direction: 'forward' };
    else mf.position = at.model.offsetOf(cl[0]);
    return true;
  };
  // A new row below the caret's row, caret in its first cell. MathLive's own command makes
  // the new cells share one list (typing fills them all), so the value is re-read after it.
  const newRow = () => {
    let pos = mf.position;
    let at = cellAt(pos);
    if (!at) {
      // caret just after a whole table (End of the field): add below its last row
      try {
        const model = mf._mathfield.model;
        const a = model.at(pos);
        if (a && typeof a.getCell === 'function') {
          const cl = a.getCell(a.rowCount - 1, a.colCount - 1);
          mf.position = model.offsetOf(cl[cl.length - 1]);
          pos = mf.position;
          at = cellAt(pos);
        }
      } catch (e) { at = null; }
    }
    if (!at) return false;
    try { mf.executeCommand('addRowAfter'); } catch (e) { return false; }
    mf.setValue(mf.getValue('latex'), { silenceNotifications: true });
    const again = cellAt(pos);
    if (again) goCell(again, at.r + 1, 0);
    changed();
    return true;
  };

  // Word's build-up rules for scripts and slash fractions:
  //   x^2+1      an operator after a script ends the script
  //   x^(n+1)    parentheses right after ^ or _ group without showing, ) closes
  //   a/b+c      the same for the denominator of a fraction typed with /
  //   (a+b)/c    parentheses around a typed numerator disappear
  const linear = new WeakSet();
  let groups = []; // open invisible groups, by how many scripts deep they started
  const LIMIT_PARENT = new Set(['extensible-symbol', 'operator', 'mop']);
  const ENDS_SCRIPT = /^[+\-=<>,;:!)\]}|*]$/;
  const slot = () => {
    try {
      const model = mf._mathfield.model;
      const a = model.at(mf.position);
      const p = a && a.parent;
      const br = a && a.parentBranch;
      if (!p || typeof br !== 'string') return null;
      const atoms = typeof p.branch === 'function' ? p.branch(br) || [] : [];
      const empty = atoms.every((x) => x.type === 'first' || x.type === 'placeholder');
      const script = br === 'superscript' || br === 'subscript';
      const denom = br === 'below' && p.type === 'genfrac' && linear.has(p);
      if (!script && !denom) return null;
      let depth = 0;
      for (let x = a; x; x = x.parent) if (x.parentBranch === 'superscript' || x.parentBranch === 'subscript' || (x.parentBranch === 'below' && x.parent && x.parent.type === 'genfrac')) depth++;
      const group = groups.length > 0 && groups[groups.length - 1] === depth;
      return { p, br, empty, depth, limit: script && LIMIT_PARENT.has(p.type), group, model };
    } catch (e) { return null; }
  };
  const buildUp = (k) => {
    const s = slot();
    if (!s) return false;
    if (k === '(' && s.empty) {
      groups.push(s.depth);
      return true; // swallow the paren: it only groups
    }
    if (k === ')' && s.group) {
      groups.pop();
      mf.executeCommand('moveAfterParent');
      return true;
    }
    if (!s.group && !s.limit && !s.empty && ENDS_SCRIPT.test(k)) mf.executeCommand('moveAfterParent');
    return false;
  };
  let slashPending = false;
  const afterSlash = () => {
    if (!slashPending) return;
    slashPending = false;
    try {
      const model = mf._mathfield.model;
      const a = model.at(mf.position);
      const g = a && a.parent;
      if (!g || g.type !== 'genfrac' || a.parentBranch !== 'below') return;
      linear.add(g);
      const above = g.branch('above') || [];
      const X = above.length === 2 ? above[1] : null;
      if (!X || X.type !== 'leftright' || X.leftDelim !== '(' || X.rightDelim !== ')') return;
      const body = X.body || [];
      if (body.length < 2) return;
      const inner = mf.getValue(model.offsetOf(body[0]), model.offsetOf(body[body.length - 1]), 'latex');
      mf.selection = { ranges: [[model.offsetOf(above[0]), model.offsetOf(X)]], direction: 'forward' };
      mf.insert(inner, { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after', mode: 'math' });
      const below = g.branch('below') || [];
      const last = below[below.length - 1];
      if (last && last.type === 'placeholder') mf.selection = { ranges: [[model.offsetOf(below[0]), model.offsetOf(last)]], direction: 'forward' };
      else if (below[0]) mf.position = model.offsetOf(below[0]);
      changed();
    } catch (e) { /* leave it as typed */ }
  };

  // Word's negation: a slash typed before a relation crosses it out, a/=b gives a≠b. The
  // slash has already made a fraction by then, so undo it into numerator + negated relation.
  const unslash = (neg) => {
    const s = slot();
    if (!s || s.br !== 'below' || !s.empty || s.p.type !== 'genfrac' || !linear.has(s.p)) return false;
    try {
      const M = s.model, g = s.p;
      const above = g.branch('above') || [];
      const real = above.filter((x) => x.type !== 'first' && x.type !== 'placeholder');
      const num = real.length ? mf.getValue(M.offsetOf(above[0]), M.offsetOf(above[above.length - 1]), 'latex').replace(/\\placeholder\{\}/g, '') : '';
      const before = g.leftSibling;
      if (!before) return false;
      mf.selection = { ranges: [[M.offsetOf(before), M.offsetOf(g)]], direction: 'forward' };
      mf.insert(num + neg + ' ', { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after', mode: 'math' });
      linear.delete(g);
      changed();
      return true;
    } catch (e) { return false; }
  };

  // Word's brackets: ( [ { | open a pair that grows with its content; the partner closes
  // it (any closing bracket does, as in [0,1) ), and typing over a closed partner steps out.
  const model = () => mf._mathfield.model;
  patchFenceSpacing(mf);
  const openFence = (tok) => {
    try {
      const M = model();
      if (!mf.selectionIsCollapsed) {
        const r = mf.selection.ranges[0];
        const inner = mf.getValue(Math.min(r[0], r[1]), Math.max(r[0], r[1]), 'latex');
        put('\\mleft' + tok + ' ' + inner + '\\mright' + MATCH[tok], { selectionMode: 'after' });
        return true;
      }
      mf.insert('\\mleft' + tok + ' \\mright.', { format: 'latex', selectionMode: 'after', insertionMode: 'replaceSelection', mode: 'math' });
      const lr = M.at(mf.position);
      if (lr && lr.type === 'leftright') {
        lr.rightDelim = '?';
        lr.isDirty = true;
        const body = lr.body || [];
        if (body[0]) mf.position = M.offsetOf(body[0]);
        M.contentDidChange({ inputType: 'insertText' });
      }
      changed();
      return true;
    } catch (e) { return false; }
  };
  const closeFence = (tok) => {
    try {
      const M = model();
      let x = M.at(mf.position);
      while (x && x.parent && x.parent.type === 'leftright' && x.parentBranch === 'body') {
        const lr = x.parent;
        const atEnd = x.isLastSibling || (x.rightSibling && x.rightSibling.type === 'placeholder' && x.rightSibling.isLastSibling);
        if (!atEnd) return false;
        if (lr.rightDelim === '?') {
          if (isBar(tok) && !isBar(lr.leftDelim)) return false; // a bar inside ( or { starts its own pair
          if (isBar(lr.leftDelim) && !isBar(tok)) { lr.rightDelim = '.'; lr.isDirty = true; x = lr; continue; } // a bar with no partner stays one bar
          lr.rightDelim = tok;
          lr.isDirty = true;
          mf.position = M.offsetOf(lr);
          M.contentDidChange({ inputType: 'insertText' });
          changed();
          return true;
        }
        if (sameClose(lr.rightDelim, tok)) { mf.position = M.offsetOf(lr); return true; }
        return false;
      }
    } catch (e) { return false; }
    return false;
  };
  const bracketKey = (k) => {
    if (OPEN_KEY[k]) return openFence(OPEN_KEY[k]);
    if (CLOSE_KEY[k]) { if (!closeFence(CLOSE_KEY[k])) put(CLOSE_KEY[k]); return true; }
    if (k === '|') return closeFence('|') || openFence('|');
    return false;
  };

  const onKey = (e) => {
    if (e.isComposing) return;
    afterSlash(); // the fraction from the previous / exists by now
    const mode = mf.mode;
    const k = e.key;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    // AltGr (Windows: Ctrl+Alt) and Option (Mac) type characters such as { [ | \ on many layouts
    const altGr = !!(e.getModifierState && e.getModifierState('AltGraph'));
    const shortcut = e.metaKey || (e.ctrlKey && !altGr) || (e.altKey && !altGr && /^[A-Za-z0-9]$/.test(k));
    if (buf != null) {
      if (/^[A-Za-z]$/.test(k) && !shortcut) { stop(); buf += k; pick = 0; draw(); return; }
      if (k === 'Backspace') { stop(); if (buf.length) { buf = buf.slice(0, -1); draw(); } else cancel(); return; }
      if (k === 'Escape') { stop(); cancel(); return; }
      if (k === 'ArrowDown') { stop(); pick = Math.min((chip._list || []).length - 1, pick + 1); draw(); return; }
      if (k === 'ArrowUp') { stop(); pick = Math.max(0, pick - 1); draw(); return; }
      if (k === 'Tab') { stop(); const l = chip._list || []; if (l[pick]) buf = l[pick]; commit(); return; }
      if (k === ' ' || k === 'Enter') { stop(); if (!buf) { cancel(); return; } commit(); return; }
      if (!buf && k.length === 1 && /[,;:!{}|&%$#_\\/]/.test(k)) {
        stop(); buf = null; draw();
        if (k === '/') put('/'); // \/ is a plain slash, not a fraction
        else if (k === '{' || k === '}') bracketKey(k);
        else put(k === '\\' ? '\\backslash' : '\\' + k);
        return;
      }
      if (k.length === 1) { commit(); return; } // the symbol itself goes through to the field
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) { commit(); return; }
      return;
    }
    if (/^(Arrow|Home|End|Page|Tab|Escape|Enter)/.test(k)) groups = [];
    if (mode === 'latex') return; // MathLive's own command mode keeps its keys
    // Ctrl+Enter, or Shift+Enter as in Word's equations, starts a new row
    if (k === 'Enter' && !e.altKey && ((e.ctrlKey || e.metaKey) !== e.shiftKey)) {
      stop();
      if (!newRow() && opts.onNewRowOutside) opts.onNewRowOutside();
      return;
    }
    // "words" in quotes are upright text, as in Word's linear format
    if (k === '"' && !shortcut && (mode === 'math' || mode === 'text')) {
      stop();
      try { mf.executeCommand(['switchMode', mode === 'math' ? 'text' : 'math']); } catch (err) { return; }
      changed();
      return;
    }
    if (shortcut || mode !== 'math') return;
    if (NEGATE[k] && unslash(NEGATE[k])) { stop(); return; }
    // German, French, Spanish: a digit right after "3," makes it a decimal comma, 3{,}1, so
    // TeX puts no space after it. Commas already in the source are left as written.
    if (opts.decimalComma && /^[0-9]$/.test(k)) {
      try {
        const M = model();
        const a = M.at(mf.position), b = a && a.leftSibling;
        if (a && a.value === ',' && a.type !== 'group' && b && /^[0-9]$/.test(b.value || '') && a.parent && a.parent.type !== 'group') {
          const p = mf.position;
          mf.selection = { ranges: [[p - 1, p]], direction: 'forward' };
          mf.insert('{,}', { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after', mode: 'math' });
        }
      } catch (err) { /* type it as it comes */ }
    }
    if (k === '&') {
      const at = cellAt();
      if (at) {
        stop();
        recognize();
        const here = cellAt();
        if (here && here.c + 1 < here.arr.colCount) goCell(here, here.r, here.c + 1);
        return;
      }
    }
    const trigger = k === ' ' || k === 'Enter' || k === 'Tab' || (k.length === 1 && !/[A-Za-z]/.test(k));
    const converted = trigger && recognize();
    if (k === '\\') { stop(); buf = ''; pick = 0; draw(); return; }
    if (k.length === 1 && buildUp(k)) { stop(); changed(); return; }
    if (k.length === 1 && /^[()[\]{}|]$/.test(k) && bracketKey(k)) { stop(); return; }
    if (altGr && k.length === 1) { stop(); mf.executeCommand(['typedText', k]); changed(); return; }
    if (k === '/') { slashPending = true; setTimeout(afterSlash, 0); }
    if (k === ' ') {
      stop();
      if (!converted && canStepOut()) {
        const s = slot();
        if (s && s.group) groups.pop();
        mf.executeCommand('moveAfterParent');
      }
    }
  };
  mf.addEventListener('keydown', onKey, true);
  mf.addEventListener('pointerdown', () => { groups = []; }, true);
  mf.addEventListener('blur', () => { if (buf != null) cancel(); });
  return { active: () => buf != null, newRow, reposition: () => { if (buf != null) place(); }, destroy: () => { chip.remove(); } };
}
