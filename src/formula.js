// Word's table formulas (Table Layout › Formula: =SUM(ABOVE), =AVERAGE(LEFT), =B2*C2, …), read
// and computed by Rikuy from the cells' text, so that a cell holds its value as plain LaTeX and
// the table compiles anywhere. Word keeps a field in the cell and updates it on F9 or printing;
// LaTeX has no such field without a package that changes how the table is written (spreadtab),
// so Rikuy writes the value, and keeps the formula on a comment line before the table
// ("% formula D4: =SUM(ABOVE)", src/table.js formulasOf), which Update Formulas computes again.
// Pure: no page, no document.

// The functions Word's Formula dialog pastes, with what each does to its list of numbers
const AGG = {
  SUM: (xs) => xs.reduce((a, b) => a + b, 0),
  AVERAGE: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
  COUNT: (xs) => xs.length,
  // (a loop, not Math.min(...xs): a spread of a big range overflows the stack)
  MIN: (xs) => (xs.length ? xs.reduce((a, b) => (b < a ? b : a)) : 0),
  MAX: (xs) => (xs.length ? xs.reduce((a, b) => (b > a ? b : a)) : 0),
  PRODUCT: (xs) => (xs.length ? xs.reduce((a, b) => a * b, 1) : 0),
  AND: (xs) => (xs.every((x) => x !== 0) ? 1 : 0),
  OR: (xs) => (xs.some((x) => x !== 0) ? 1 : 0)
};
const ONE = {
  ABS: (x) => Math.abs(x),
  INT: (x) => Math.trunc(x),
  SIGN: (x) => Math.sign(x),
  NOT: (x) => (x === 0 ? 1 : 0)
};
export const FUNCTIONS = ['ABS', 'AND', 'AVERAGE', 'COUNT', 'DEFINED', 'FALSE', 'IF', 'INT', 'MAX', 'MIN', 'MOD', 'NOT', 'OR', 'PRODUCT', 'ROUND', 'SIGN', 'SUM', 'TRUE'];
export const DIRS = ['ABOVE', 'BELOW', 'LEFT', 'RIGHT'];
// Word's number formats, as its Formula dialog lists them
export const FORMATS = ['#,##0', '#,##0.00', '$#,##0.00;($#,##0.00)', '0', '0%', '0.00', '0.00%'];

// ---- a cell's text as Word reads a number ---------------------------------------------------
// The number a cell's LaTeX holds, or null: its words without commands, braces, math shifts and
// thin spaces; a currency sign, a percent sign and thousands' commas allowed; (12) and a minus
// ($-$, --, −) negative. "12 apples" is no number, as in Word.
export function cellNumber(tex) {
  let t = String(tex || '').slice(0, 400);
  // (siunitx's \num{1234.5} and its kin: their argument)
  t = t.replace(/\\(?:num|SI|qty|si)\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}(?:\s*\{[^{}]*\})?/g, ' $1 ');
  t = t.replace(/\\[$%&#]/g, (m) => m[1]).replace(/\\(?:,|;|:|!|\s|thinspace|enspace|quad)/g, '').replace(/\\(?:textminus|textendash)\b/g, '-');
  t = t.replace(/\\[A-Za-z@]+\*?/g, ' ').replace(/[{}~]/g, ' ').replace(/\$/g, ' ').replace(/--?|−|–/g, '-');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  let neg = false;
  const par = /^\((.*)\)$/.exec(t);
  if (par) { neg = true; t = par[1].trim(); }
  t = t.replace(/^-\s*/, () => { neg = !neg; return ''; });
  t = t.replace(/^[£€¥$]\s*|\s*[£€¥]$/, '').replace(/^-\s*/, () => { neg = !neg; return ''; });
  let pct = false;
  t = t.replace(/\s*%$/, () => { pct = true; return ''; });
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^\.\d+$/.test(t)) return null;
  let v = parseFloat(t.replace(/,/g, ''));
  if (pct) v /= 100;
  return neg ? -v : v;
}

// ---- reading a formula ---------------------------------------------------------------------------
// A1 references: columns A, B, … Z, AA; rows from 1, as Word counts them (merged cells count as
// the columns they span)
export const colName = (c) => { let s = ''; c += 1; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
export const cellName = (r, c) => colName(c) + (r + 1);
export function parseRef(t) {
  const m = /^([A-Z]{1,3})(\d{1,5})$/i.exec(String(t || '').trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  return { r: +m[2] - 1, c: c - 1 };
}

// the longest formula Rikuy reads, as long as a formula line keeps (src/table.js FORMULA_MAX)
export const MAX_LENGTH = 500;
function tokens(s) {
  const out = [];
  // (a cell a row or column operation deleted: src/table.js renameRefs writes #REF! for it)
  if (/#REF!/i.test(s)) throw new Error('A cell this formula names was deleted (#REF!): write the formula again.');
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z]+\d*)|(<=|>=|<>|[-+*/^%(),:;=<>]))/y;
  let k = 0;
  while (k < s.length) {
    re.lastIndex = k;
    const m = re.exec(s);
    if (!m) { if (/^\s*$/.test(s.slice(k))) break; throw new Error('Rikuy cannot read the formula at "' + s.slice(k, k + 12).trim() + '".'); }
    out.push(m[1] != null ? { t: 'num', v: parseFloat(m[1]) } : m[2] != null ? { t: 'id', v: m[2].toUpperCase() } : { t: 'op', v: m[3] });
    k = re.lastIndex;
  }
  return out;
}

// The formula's tree: { k: 'num' | 'ref' | 'range' | 'dir' | 'call' | 'bin' | 'neg' | 'pct' }.
// Throws an Error that says what is wrong, in words.
export function parseFormula(text) {
  let s = String(text || '').trim();
  // (refused, not cut: a formula cut short would compute something else than the one stored)
  if (s.length > MAX_LENGTH) throw new Error('A formula of at most ' + MAX_LENGTH + ' characters: this one has ' + s.length + '.');
  if (s.startsWith('=')) s = s.slice(1);
  if (!s.trim()) throw new Error('Type a formula after the = sign, such as =SUM(ABOVE).');
  const T = tokens(s);
  let i = 0;
  const peek = () => T[i], take = () => T[i++];
  const want = (v) => { const x = take(); if (!x || x.v !== v) throw new Error('A ' + v + ' is missing in the formula.'); };
  const LEVELS = [['=', '<', '>', '<=', '>=', '<>'], ['+', '-'], ['*', '/'], ['^']];
  const bin = (lv) => {
    if (lv >= LEVELS.length) return unary();
    let a = bin(lv + 1);
    while (peek() && peek().t === 'op' && LEVELS[lv].includes(peek().v)) { const op = take().v; a = { k: 'bin', op, a, b: bin(lv + 1) }; }
    return a;
  };
  const unary = () => {
    const x = peek();
    if (x && x.t === 'op' && (x.v === '-' || x.v === '+')) { take(); const a = unary(); return x.v === '-' ? { k: 'neg', a } : a; }
    let a = atom();
    while (peek() && peek().v === '%') { take(); a = { k: 'pct', a }; }
    return a;
  };
  const atom = () => {
    const x = take();
    if (!x) throw new Error('The formula ends too soon.');
    if (x.t === 'num') return { k: 'num', v: x.v };
    if (x.t === 'op' && x.v === '(') { const a = bin(0); want(')'); return a; }
    if (x.t === 'id') {
      if (DIRS.includes(x.v)) return { k: 'dir', v: x.v };
      if (x.v === 'TRUE' || x.v === 'FALSE') { if (peek() && peek().v === '(') { take(); want(')'); } return { k: 'num', v: x.v === 'TRUE' ? 1 : 0 }; }
      const ref = parseRef(x.v);
      if (ref) {
        if (peek() && peek().v === ':') { take(); const y = take(); const to = y && y.t === 'id' && parseRef(y.v); if (!to) throw new Error('A range runs from one cell to another, such as A1:B3.'); return { k: 'range', a: ref, b: to }; }
        return { k: 'ref', v: ref };
      }
      if (FUNCTIONS.includes(x.v)) {
        want('(');
        const args = [];
        if (peek() && peek().v !== ')') { args.push(bin(0)); while (peek() && (peek().v === ',' || peek().v === ';')) { take(); args.push(bin(0)); } }
        want(')');
        return { k: 'call', f: x.v, args };
      }
      throw new Error('Word has no function or cell named ' + x.v + '.');
    }
    throw new Error('Rikuy cannot read the formula at "' + x.v + '".');
  };
  const tree = bin(0);
  if (i < T.length) throw new Error('Rikuy cannot read the formula at "' + T[i].v + '".');
  return tree;
}

// ---- computing it ------------------------------------------------------------------------------------
// grid: rows of cells, each { v: number or null (text or empty), empty: bool } by column (a
// merged cell's value stands in its first column; the columns it covers are null); at: the
// formula's own cell { r, c }. ABOVE takes the numbers right above the cell up to the first one
// that is empty or not a number, as Word does (so a header row's words end it); likewise BELOW,
// LEFT and RIGHT.
function along(grid, at, dir) {
  const [dr, dc] = { ABOVE: [-1, 0], BELOW: [1, 0], LEFT: [0, -1], RIGHT: [0, 1] }[dir];
  const out = [];
  for (let r = at.r + dr, c = at.c + dc; r >= 0 && r < grid.length && c >= 0 && c < ((grid[r] || []).length); r += dr, c += dc) {
    const x = grid[r][c];
    if (x === undefined) break;
    // (a column a merged cell covers: no cell of its own, passed over)
    if (x === null) continue;
    if (x.v == null) break;
    out.push(x.v);
  }
  return out;
}
const valueAt = (grid, ref) => {
  const x = grid[ref.r] && grid[ref.r][ref.c];
  return x && x.v != null ? x.v : 0;
};
function list(grid, at, a) {
  if (a.k === 'dir') return along(grid, at, a.v);
  if (a.k === 'range') {
    const out = [];
    // (clamped to the table's grid: A1:ZZZ99999 reads the cells there are, not a hundred million)
    const width = grid.reduce((m, row) => Math.max(m, row ? row.length : 0), 0);
    const r0 = Math.min(a.a.r, a.b.r), r1 = Math.min(Math.max(a.a.r, a.b.r), grid.length - 1), c0 = Math.min(a.a.c, a.b.c), c1 = Math.min(Math.max(a.a.c, a.b.c), width - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const x = grid[r] && grid[r][c]; if (x && x.v != null && !(r === at.r && c === at.c)) out.push(x.v); }
    return out;
  }
  return [num(grid, at, a)];
}
function num(grid, at, n) {
  switch (n.k) {
    case 'num': return n.v;
    case 'ref': return valueAt(grid, n.v);
    case 'neg': return -num(grid, at, n.a);
    case 'pct': return num(grid, at, n.a) / 100;
    case 'dir': case 'range': throw new Error(n.k === 'dir' ? n.v + ' goes inside a function: SUM(' + n.v + ').' : 'A range goes inside a function: SUM(A1:B3).');
    case 'bin': {
      const a = num(grid, at, n.a), b = num(grid, at, n.b);
      switch (n.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b; case '^': return a ** b;
        case '/': if (b === 0) throw new Error('The formula divides by zero.'); return a / b;
        case '=': return a === b ? 1 : 0; case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0; case '<>': return a !== b ? 1 : 0;
      }
      break;
    }
    case 'call': {
      const f = n.f, A = n.args;
      if (AGG[f]) return AGG[f](A.flatMap((a) => list(grid, at, a)));
      if (ONE[f]) { if (A.length !== 1) throw new Error(f + ' takes one number.'); return ONE[f](num(grid, at, A[0])); }
      if (f === 'ROUND') { if (A.length !== 2) throw new Error('ROUND takes a number and how many places.'); return roundTo(num(grid, at, A[0]), Math.trunc(num(grid, at, A[1]))); }
      if (f === 'MOD') { if (A.length !== 2) throw new Error('MOD takes two numbers.'); const b = num(grid, at, A[1]); if (b === 0) throw new Error('MOD by zero.'); return num(grid, at, A[0]) % b; }
      if (f === 'IF') { if (A.length !== 3) throw new Error('IF takes a test, a value if true and a value if false.'); return num(grid, at, A[0]) !== 0 ? num(grid, at, A[1]) : num(grid, at, A[2]); }
      if (f === 'DEFINED') { try { num(grid, at, A[0]); return 1; } catch { return 0; } }
    }
  }
  throw new Error('Rikuy cannot compute this formula.');
}
export function evaluate(text, grid, at) {
  const tree = parseFormula(text);
  const v = num(grid, at, tree);
  if (!Number.isFinite(v)) throw new Error('The formula gives no number.');
  return v;
}

// A number rounded to p decimal places as Word rounds it: on its decimal digits (2.675 is 2.68, not
// binary's 2.67) and halves away from zero (-2.5 is -3)
export function roundTo(v, p) {
  const x = Math.abs(v), sign = v < 0 ? -1 : 1;
  if (!Number.isFinite(x) || Math.abs(p) > 300) return v;
  const shifted = Number(x + 'e' + p);
  const r = Number.isFinite(shifted) && !/e/.test(String(x)) ? Number(Math.round(shifted) + 'e' + -p) : Math.round(x * 10 ** p) / 10 ** p;
  return sign * r || 0;
}
// digits with no exponent (1e21 is 1000000000000000000000) and no separators
const plain = (x, places) => x.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: places, maximumFractionDigits: places });

// ---- writing the value ----------------------------------------------------------------------------------
// A number in one of Word's formats ('#,##0.00', '0%', '$#,##0.00;($#,##0.00)'), or as Word writes it
// with no format (up to the places it needs), as LaTeX: \$ and \% escaped
export function formatNumber(v, fmt) {
  const f = String(fmt || '').trim();
  let neg = v < 0, x = Math.abs(v);
  let pat = f, negPat = null;
  if (f.includes(';')) [pat, negPat] = f.split(';');
  const pct = pat.includes('%');
  if (pct) x *= 100;
  let body;
  if (!pat) {
    // (Word: as many places as the value has, up to 15 significant digits; no separators, no exponent)
    const r = roundTo(x, 10);
    body = r >= 1e15 ? r.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 15 }) : plain(r, 10).replace(/\.?0+$/, '') || '0';
  } else {
    const dm = /0\.(0+)/.exec(pat);
    const places = dm ? dm[1].length : 0;
    body = plain(roundTo(x, places), places);
    if (/#,##0|0,000/.test(pat)) { const [i, d] = body.split('.'); body = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d != null ? '.' + d : ''); }
  }
  if (Number(body.replace(/,/g, '')) === 0) neg = false;
  const usePat = neg && negPat ? negPat : pat;
  const cur = /\$/.test(usePat) ? '\\$' : '';
  let out = cur + body + (pct ? '\\%' : '');
  if (neg && negPat && /^\(.*\)$/.test(negPat.trim())) out = '(' + out + ')';
  else if (neg) out = '$-$' + out;
  return out;
}
