// Brackets that size themselves to their content, as in Word.
//
// Source -> field: every matched pair of plain brackets becomes \mleft...\mright, so it
// grows while you type a fraction or a sum inside it. Pairs the author wrote with
// \left( ... \right) are kept apart by spelling them \left\lparen ... \right\rparen.
// Field -> source: an \mleft pair (or one MathLive made while typing) whose content is taller
// than a line becomes \left...\right; every other one goes back to plain brackets, so the
// .tex stays the way people write it. The author's own \left...\right pairs stay as written.

const OPENERS = new Set(['(', '[', '\\{', '\\lbrace', '\\lbrack', '\\langle', '\\lfloor', '\\lceil', '\\lvert', '\\lVert']);
const CLOSERS = new Set([')', ']', '\\}', '\\rbrace', '\\rbrack', '\\rangle', '\\rfloor', '\\rceil', '\\rvert', '\\rVert']);
const SIZING = new Set(['left', 'right', 'middle', 'mleft', 'mright', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'Bigl', 'biggl', 'Biggl',
  'bigr', 'Bigr', 'biggr', 'Biggr', 'bigm', 'Bigm', 'biggm', 'Biggm']);
// Arguments typeset as text, or that are names: brackets inside are not math brackets.
const TEXTY = /^(text[a-z]*|mbox|hbox|fbox|label|tag|ref|eqref|cref|Cref|pageref|cite[a-z]*|href|url|operatorname|wmbm|wmbsym)$/;
// Commands whose [ ... ] is an optional argument, not a bracket.
const OPTARG = new Set(['sqrt', 'smash', 'xrightarrow', 'xleftarrow', 'xleftrightarrow', 'xRightarrow', 'xLeftarrow', 'xLeftrightarrow',
  'xhookrightarrow', 'xhookleftarrow', 'xmapsto', 'xlongequal', 'xtwoheadrightarrow', 'xtwoheadleftarrow', 'raisebox', 'makebox',
  'framebox', 'colorbox', 'color', 'genfrac']);
// After these a bracket starts a new term (operators, relations, punctuation, big operators).
const NONORD = new Set(('cdot times div pm mp ast star circ bullet oplus ominus otimes odot oslash cap cup sqcap sqcup uplus setminus wedge ' +
  'vee land lor lnot neg le leq ge geq ne neq lt gt ll gg approx equiv sim simeq cong propto in notin ni subset subseteq supset supseteq ' +
  'sqsubseteq sqsupseteq to gets rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow longrightarrow longleftarrow ' +
  'Longrightarrow Longleftarrow mapsto implies iff mid parallel perp coloneqq triangleq doteq prec succ preceq succeq models vdash dashv ' +
  'quad qquad sum prod coprod int iint iiint iiiint oint oiint bigcup bigcap bigoplus bigotimes bigodot biguplus bigsqcup bigvee bigwedge ' +
  'colon cdots ldots dots vdots ddots forall exists nexists therefore because displaystyle textstyle').split(' '));

const isAlphaCmd = (t) => /^\\[A-Za-z]+$/.test(t);

function skipGroup(s, j) {
  let d = 0;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return j + 1;
  }
  return s.length;
}
function skipOpt(s, j) { // s[j] === '['
  let d = 0;
  for (j++; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (c === ']' && d <= 0) return j + 1;
  }
  return s.length;
}
const nextNonSpace = (s, j) => { while (j < s.length && /\s/.test(s[j])) j++; return j; };

// Source row -> field row: matched plain bracket pairs become stretchy pairs. Not those around
// tall content (isTall): TeX sets them at their natural size, so the field shows them as plain
// characters, and they come back plain. Brackets typed in the field are sized as Word sizes them.
const AUTO_TOK = { '\\lbrace': '\\{', '\\rbrace': '\\}', '\\lbrack': '[', '\\rbrack': ']' };
export function fenceSource(s, optMacros, isTall) {
  const marks = [];
  const pairs = findPairs(s, optMacros, marks).filter(({ o, c }) => !(isTall && isTall(s.slice(o.pos + o.len, c.pos))));
  if (!pairs.length && !marks.length) return s;
  const edits = marks.slice();
  for (const { o, c } of pairs) {
    const sp = (p) => (/[A-Za-z]/.test(s.charAt(p)) ? ' ' : '');
    const a = AUTO_TOK[o.tok] || o.tok, b = AUTO_TOK[c.tok] || c.tok;
    edits.push([o.pos, o.len, '\\mleft' + a + (isAlphaCmd(a) ? sp(o.pos + o.len) : '')]);
    edits.push([c.pos, c.len, '\\mright' + b + (isAlphaCmd(b) ? sp(c.pos + c.len) : '')]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  for (const [p, l, t] of edits) s = s.slice(0, p) + t + s.slice(p + l);
  return s;
}

// Plain bracket pairs around tall content (a fraction, a sum in display) get \left \right,
// as Word would size them; nothing else in the source changes.
export function fitBrackets(s, isTall, optMacros) {
  const pairs = findPairs(s, optMacros).filter(({ o, c }) => isTall(s.slice(o.pos + o.len, c.pos)));
  if (!pairs.length) return { text: s, count: 0 };
  const edits = [];
  for (const { o, c } of pairs) {
    const sp = (p) => (/[A-Za-z]/.test(s.charAt(p)) ? ' ' : '');
    edits.push([o.pos, o.len, '\\left' + o.tok + (isAlphaCmd(o.tok) ? sp(o.pos + o.len) : '')]);
    edits.push([c.pos, c.len, '\\right' + c.tok + (isAlphaCmd(c.tok) ? sp(c.pos + c.len) : '')]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  for (const [p, l, t] of edits) s = s.slice(0, p) + t + s.slice(p + l);
  return { text: s, count: pairs.length };
}

function findPairs(s, optMacros, marks) {
  const pairs = [];
  const frames = [[]];
  let kind = 'op'; // what came before: 'ord' (symbol, letter, closing) or 'op'
  let i = 0;
  const n = s.length;
  const open = (pos, len, tok) => { frames[frames.length - 1].push({ pos, len, tok, ord: kind === 'ord' }); kind = 'op'; };
  const close = (pos, len, tok) => {
    const st = frames[frames.length - 1];
    const o = st.pop();
    if (o) pairs.push({ o, c: { pos, len, tok } });
    kind = 'ord';
  };
  while (i < n) {
    const c = s[i];
    if (c === '%') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i, i + 40));
      if (!m) { i++; continue; }
      const name = m[1], tok = m[0];
      let j = i + tok.length;
      if (SIZING.has(name)) {
        const d = /^\s*(\\[A-Za-z]+|\\.|[^\s])/.exec(s.slice(j, j + 40));
        if (marks && d && ((name === 'left' && d[1] === '(') || (name === 'right' && d[1] === ')'))) {
          const at = j + d[0].length;
          marks.push([at - 1, 1, (d[1] === '(' ? '\\lparen' : '\\rparen') + (/[A-Za-z]/.test(s.charAt(at)) ? ' ' : '')]);
        }
        i = j + (d ? d[0].length : 0);
        kind = /^(right|mright|bigr|Bigr|biggr|Biggr)$/.test(name) ? 'ord' : 'op';
        continue;
      }
      if (TEXTY.test(name)) {
        const k = nextNonSpace(s, j);
        if (s[k] === '{') { i = skipGroup(s, k); kind = 'ord'; continue; }
      }
      if (name === 'begin' || name === 'end') {
        let k = nextNonSpace(s, j);
        if (s[k] === '{') {
          const env = s.slice(k + 1, skipGroup(s, k) - 1);
          k = skipGroup(s, k);
          if (name === 'begin' && /^(array|subarray|alignat\*?|alignedat|tabular)$/.test(env)) { const q = nextNonSpace(s, k); if (s[q] === '{') k = skipGroup(s, q); }
          if (name === 'begin') { const q = nextNonSpace(s, k); if (s[q] === '[') k = skipOpt(s, q); }
          i = k;
          kind = name === 'end' ? 'ord' : 'op';
          continue;
        }
      }
      if (OPTARG.has(name) || (optMacros && optMacros.has(name))) {
        const k = nextNonSpace(s, j);
        if (s[k] === '[') j = skipOpt(s, k);
      }
      if (OPENERS.has(tok)) open(i, tok.length, tok);
      else if (CLOSERS.has(tok)) close(i, tok.length, tok);
      else if (/^[A-Za-z]+$/.test(name)) kind = NONORD.has(name) ? 'op' : 'ord';
      else kind = /^[,;:!> ]$/.test(name) ? 'op' : 'ord';
      i = j;
      continue;
    }
    if (c === '{') { frames.push([]); kind = 'op'; i++; continue; }
    if (c === '}') { if (frames.length > 1) frames.pop(); kind = 'ord'; i++; continue; }
    if (c === '&') { frames[frames.length - 1] = []; kind = 'op'; i++; continue; }
    if (c === '(' || c === '[') { open(i, 1, c); i++; continue; }
    if (c === ')' || c === ']') { close(i, 1, c); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    kind = /[A-Za-z0-9.'|]/.test(c) ? 'ord' : 'op';
    i++;
  }
  return pairs;
}

// How a delimiter is written when the pair goes back to plain brackets ('' for none).
const PLAIN = {
  '(': '(', ')': ')', '[': '[', ']': ']', '\\lbrack': '[', '\\rbrack': ']', '\\{': '\\{', '\\}': '\\}', '\\lbrace': '\\{', '\\rbrace': '\\}',
  '|': '|', '\\vert': '|', '\\|': '\\|', '\\Vert': '\\|', '\\lvert': '\\lvert', '\\rvert': '\\rvert', '\\lVert': '\\lVert', '\\rVert': '\\rVert',
  '\\langle': '\\langle', '\\rangle': '\\rangle', '<': '\\langle', '>': '\\rangle', '\\lfloor': '\\lfloor', '\\rfloor': '\\rfloor',
  '\\lceil': '\\lceil', '\\rceil': '\\rceil', '.': '', '/': '/', '\\backslash': '\\backslash'
};
// MathLive's own typing writes \left( \left\lbrack \left\lbrace: those pairs follow the automatic rule too.
const AUTO_LEFT = new Set(['(', '\\lbrack', '\\lbrace']);
const UNMARK = { '\\lparen': '(', '\\rparen': ')' };
const NORM = { '\\lbrack': '[', '\\rbrack': ']', '\\lbrace': '\\{', '\\rbrace': '\\}', '\\vert': '|', '<': '\\langle', '>': '\\rangle' };

function stripScripts(t) {
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '^' || c === '_') {
      const j = nextNonSpace(t, i + 1);
      if (t[j] === '{') { i = skipGroup(t, j) - 1; continue; }
      if (t[j] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(t.slice(j)); i = j + (m ? m[0].length : 1) - 1; continue; }
      i = j;
      continue;
    }
    out += c;
  }
  return out;
}
const TALL = /\\(?:[dtc]?frac|genfrac|over|atop|choose|[dt]?binom|sqrt|begin|substack|overbrace|underbrace|overset|underset|stackrel|displaystyle|left|mleft|middle|big|Big|bigg|Bigg|bigl|Bigl|biggl|Biggl|bigr|Bigr|biggr|Biggr|boxed)(?![A-Za-z])/;
const TALL_DISPLAY = /\\(?:sum|prod|coprod|int|iint|iiint|iiiint|oint|oiint|bigcup|bigcap|bigoplus|bigotimes|bigodot|biguplus|bigsqcup|bigvee|bigwedge)(?![A-Za-z])|\\(?:lim|max|min|sup|inf|liminf|limsup|det|gcd|Pr|argmax|argmin|injlim|projlim)(?:\\limits)?\s*_|\\operatorname\*\{[^{}]*\}(?:\\limits)?\s*_|\\operatorname\*\{\\mathrm\{[^{}]*\}\}(?:\\limits)?\s*_/;

export function tallTest(display, tallMacros) {
  const macroRe = tallMacros && tallMacros.size ? new RegExp('\\\\(?:' + [...tallMacros].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![A-Za-z])') : null;
  return (body) => {
    if (display && TALL_DISPLAY.test(body)) return true;
    const flat = stripScripts(body);
    return TALL.test(flat) || (macroRe ? macroRe.test(flat) : false);
  };
}
export const isTallDef = (def) => TALL.test(stripScripts(String(def)));

// Field row -> source row: stretchy pairs around flat content go back to plain brackets.
export function unfence(s, isTall) {
  let i = 0;
  const readDelim = () => {
    const m = /^\s*(\\[A-Za-z]+|\\.|[^\s])/.exec(s.slice(i, i + 40));
    if (!m) return '.';
    i += m[0].length;
    return m[1];
  };
  const emit = (tok, after) => tok + (isAlphaCmd(tok) && /^[A-Za-z]/.test(after || '') ? ' ' : '');
  const parse = (inner) => {
    let out = '';
    while (i < s.length) {
      const m = /^\\(mleft|mright|left|right)(?![A-Za-z])/.exec(s.slice(i, i + 7));
      if (m) {
        if (m[1] === 'right' || m[1] === 'mright') {
          if (inner) return { out, closed: true };
          i += m[0].length;
          out += '\\right' + emit(readDelim(), s[i]);
          continue;
        }
        i += m[0].length;
        const d1 = readDelim();
        if (isAlphaCmd(d1) && /^[ \t]+[A-Za-z]/.test(s.slice(i))) while (/[ \t]/.test(s[i])) i++; // the space only separated the name
        const body = parse(true);
        let d2 = '.';
        if (body.closed) {
          i += /^\\m?right/.exec(s.slice(i, i + 7))[0].length;
          d2 = readDelim();
          if (isAlphaCmd(d2) && /^[ \t]+[A-Za-z]/.test(s.slice(i))) while (/[ \t]/.test(s[i])) i++;
        }
        const after = s.charAt(i);
        const text = body.out;
        const auto = m[1] === 'mleft' || AUTO_LEFT.has(d1);
        if (!auto) {
          const a = UNMARK[d1] || d1, b = UNMARK[d2] || d2;
          out += '\\left' + emit(a, text.charAt(0)) + text + '\\right' + emit(b, after);
          continue;
        }
        if (PLAIN[d1] !== undefined && PLAIN[d2] !== undefined && !(d1 === '.' && d2 === '.') && !isTall(text)) {
          const a = PLAIN[d1], b = PLAIN[d2];
          out += (a ? emit(a, text.charAt(0)) : '') + text + (b ? emit(b, after) : '');
        } else {
          const a = NORM[d1] || d1, b = NORM[d2] || d2;
          out += '\\left' + emit(a, text.charAt(0)) + text + '\\right' + emit(b, after);
        }
        continue;
      }
      if (s[i] === '\\') {
        const t = /^\\([A-Za-z]+|.)/.exec(s.slice(i)) || ['\\'];
        out += t[0];
        i += t[0].length;
        continue;
      }
      out += s[i++];
    }
    return { out, closed: false };
  };
  return parse(false).out;
}

// What a typed key or a chip command means as a bracket.
export const OPEN_KEY = { '(': '(', '[': '[', '{': '\\{', '\\{': '\\{', '\\lbrace': '\\{', '\\lbrack': '[', '\\langle': '\\langle', '\\bra': '\\langle',
  '\\lfloor': '\\lfloor', '\\lceil': '\\lceil', '\\lvert': '\\lvert', '\\lVert': '\\lVert' };
export const CLOSE_KEY = { ')': ')', ']': ']', '}': '\\}', '\\}': '\\}', '\\rbrace': '\\}', '\\rbrack': ']', '\\rangle': '\\rangle', '\\ket': '\\rangle',
  '\\rfloor': '\\rfloor', '\\rceil': '\\rceil', '\\rvert': '\\rvert', '\\rVert': '\\rVert' };
export const MATCH = { '(': ')', '[': ']', '\\{': '\\}', '\\lbrace': '\\rbrace', '\\lbrack': '\\rbrack', '|': '|', '\\vert': '\\vert', '\\|': '\\|',
  '\\Vert': '\\Vert', '\\langle': '\\rangle', '\\lfloor': '\\rfloor', '\\lceil': '\\rceil', '\\lvert': '\\rvert', '\\lVert': '\\rVert' };
export const isBar = (d) => d === '|' || d === '\\vert' || d === '\\lvert' || d === '\\rvert';
export const sameClose = (a, b) => (PLAIN[a] !== undefined ? PLAIN[a] : a) === (PLAIN[b] !== undefined ? PLAIN[b] : b);
