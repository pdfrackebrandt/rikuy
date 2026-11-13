// A table's source, read once and the same way for every table operation (src/cmd/table.js):
// its environment and arguments, its column specification (each column's letter and what is
// written around it), and its rows and cells, each with its range in the source. Every piece of
// the table is a range of the text, so the parts put back together are the table byte for byte
// (emit), and every operation is a set of small edits [{ s, e, t }] at those ranges: a row
// inserted is one new line, a column one `&` in each row and one letter in the specification.
//
// What it reads: tabular, tabular*, tabularx, tabulary, longtable, array and xltabular; an `&` or
// a `\\` only where it is the table's own (not inside braces, a nested environment, a comment or
// \verb); `\\` with a star and a length ([2pt]), \tabularnewline, longtable's \kill; the rules
// before a row (\hline, \cline, booktabs' \toprule, \midrule, \bottomrule, \cmidrule,
// \addlinespace, \specialrule, \hhline, arydshln's dashed rules, longtable's \endhead and its
// like); \rowcolor and \cellcolor at a cell's start; \multicolumn and \multirow cells; the
// column types l c r p m b X, siunitx's S, w and W, dcolumn's D, any letter \newcolumntype made,
// @{} !{} >{} <{} and *{n}{…}; line endings as the file has them (CRLF kept).
//
// Every scan is linear and bounded (a stranger's table of a million `&` costs one pass): no
// pattern here backtracks over the document. test/table.test.mjs runs every operation and its
// inverse, and parses and emits every table of the corpus byte for byte.

export const ENV_ARGS = { tabular: 'om', 'tabular*': 'mom', tabularx: 'mom', tabulary: 'mom', longtable: 'om', array: 'om', xltabular: 'omm' };
export const TABLE_ENVS = Object.keys(ENV_ARGS);
// where the specification and the width are among the arguments
const SPEC_AT = { tabular: 1, 'tabular*': 2, tabularx: 2, tabulary: 2, longtable: 1, array: 1, xltabular: 2 };
const WIDTH_AT = { 'tabular*': 0, tabularx: 0, tabulary: 0, xltabular: 1 };
// the longest table read (characters from \begin): a longer one is not a table here
export const MAX_TABLE = 2000000;

// The commands that stand before a row's words (rules, spaces, longtable's markers), with their
// arguments: o an optional [..], p an optional (..), m a braced one
const LEAD = {
  hline: '', toprule: 'o', midrule: 'o', bottomrule: 'o', cline: 'm', cmidrule: 'opm', specialrule: 'mmm', addlinespace: 'o', morecmidrules: '',
  hhline: 'm', hdashline: 'o', cdashline: 'm', Xhline: 'm', Xcline: 'mm', firsthline: '', lasthline: '', arrayrulecolor: 'om', noalign: 'm',
  endhead: '', endfirsthead: '', endfoot: '', endlastfoot: '', pagebreak: 'o', nopagebreak: 'o', newpage: '', clearpage: '', hiderowcolors: '', showrowcolors: ''
};
export const RULES = new Set(['hline', 'toprule', 'midrule', 'bottomrule', 'cline', 'cmidrule', 'specialrule', 'hhline', 'hdashline', 'cdashline', 'Xhline', 'Xcline', 'firsthline', 'lasthline']);
const HEAVY = new Set(['toprule', 'bottomrule']);

const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isSp = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

// a control sequence's name at i (src[i] is the backslash): [name, end]
export function csAt(src, i) {
  let j = i + 1;
  if (j >= src.length) return ['', j];
  if (!isLetter(src[j])) return [src[j], j + 1];
  while (j < src.length && isLetter(src[j])) j++;
  return [src.slice(i + 1, j), j];
}

// the end of a group that opens at i ({…}, […] or (…)), braces inside counted; -1 if it does not
// close before lim. In […] and (…) a braced part is one unit, so [{]}] closes at its last ].
export function groupEnd(src, i, lim) {
  const open = src[i], close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let d = 0;
  for (let j = i; j < lim; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === '%') { const n = src.indexOf('\n', j); if (n < 0 || n >= lim) return -1; j = n; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d < 0) return -1; if (open === '{' && d === 0) return j + 1; }
    else if (c === close && d === 0) return j + 1;
  }
  return -1;
}

// past spaces and comments, not past a blank line (TeX's \par ends the search for an argument)
function skipArgSp(src, i, lim) {
  let nl = 0;
  while (i < lim) {
    const c = src[i];
    if (c === '\n') { if (++nl > 1) return i; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '%') { const n = src.indexOf('\n', i); if (n < 0 || n >= lim) return lim; i = n + 1; nl = 0; continue; }
    break;
  }
  return i;
}

// The arguments of a command at i (after its name), by a spec of o, p, m: [{ s, e, is, ie, kind }]
// (absent optional ones are null); null when a braced one is missing
export function argsAt(src, i, spec, lim) {
  const out = [];
  let k = i;
  for (const a of spec) {
    const j = skipArgSp(src, k, lim);
    const want = a === 'm' ? '{' : a === 'o' ? '[' : '(';
    if (src[j] !== want) {
      if (a === 'm') {
        // a one token argument: \cline 2-3 is no use, but \multicolumn2c{x} is TeX
        if (j < lim && src[j] !== '}' && !isSp(src[j])) { const e = src[j] === '\\' ? csAt(src, j)[1] : j + 1; out.push({ s: j, e, is: j, ie: e, kind: a }); k = e; continue; }
        return null;
      }
      out.push(null);
      continue;
    }
    const e = groupEnd(src, j, lim);
    if (e < 0) return null;
    out.push({ s: j, e, is: j + 1, ie: e - 1, kind: a });
    k = e;
  }
  return { args: out, e: k };
}

// ---- the column specification ------------------------------------------------------------
// Each column as { s, e, ls, le, letter, w: width text or null, pre, post, x: true for X, star }:
// [s, e) is the column with what is written around it (>{…} before, <{…} after), [ls, le) its
// letter and the arguments the letter takes. star: the index of the *{n}{…} it came from.
const COL_ARGS = { p: 'm', m: 'm', b: 'm', w: 'mm', W: 'mm', D: 'mmm', S: 'o', s: 'o', X: '', l: '', c: '', r: '', L: '', C: '', R: '', J: '' };
// (at most MAX_COLS columns, *{n}{…} written out included: *{100}{*{100}{c}} is no table here)
export const MAX_COLS = 1000;
export function parseSpec(src, s, e, depth = 0) {
  const cols = [], stars = [];
  let pre = null, i = s;
  while (i < e) {
    const c = src[i];
    if (isSp(c)) { i++; continue; }
    if (c === '%') { const n = src.indexOf('\n', i); i = n < 0 || n >= e ? e : n + 1; continue; }
    if (c === '|' || c === ':' || c === ';') { i++; continue; }
    if (c === '@' || c === '!' || c === '>' || c === '<') {
      const j = skipArgSp(src, i + 1, e);
      const z = src[j] === '{' ? groupEnd(src, j, e) : j + 1;
      if (z < 0) return null;
      if (c === '>') { if (!pre) pre = { s: i, e: z, is: j + 1, ie: z - 1 }; else pre.e = z, pre.ie = z - 1; }
      else if (c === '<' && cols.length) { const last = cols[cols.length - 1]; last.post = { s: i, e: z, is: j + 1, ie: z - 1 }; last.e = z; }
      i = z;
      continue;
    }
    if (c === '*') {
      const a = argsAt(src, i + 1, 'mm', e);
      if (!a || depth > 3) return null;
      const n = Math.max(0, Math.min(MAX_COLS + 1, parseInt(src.slice(a.args[0].is, a.args[0].ie), 10) || 0));
      const inner = parseSpec(src, a.args[1].is, a.args[1].ie, depth + 1);
      if (!inner) return null;
      const k = stars.length;
      stars.push({ s: i, e: a.e, n, is: a.args[1].is, ie: a.args[1].ie });
      if (cols.length + n * inner.cols.length > MAX_COLS) return null;
      for (let r = 0; r < n; r++) for (const col of inner.cols) cols.push({ ...col, star: k, rep: r });
      i = a.e;
      continue;
    }
    if (c === '\\') { i = csAt(src, i)[1]; continue; }
    if (isLetter(c)) {
      // a letter \newcolumntype made may take arguments (L{2cm}): the braced groups right after it
      let spec = COL_ARGS[c];
      if (spec == null || spec === '') {
        spec = '';
        for (let j = i + 1, n = 0; n < 4; n++) { const q = skipArgSp(src, j, e); if (src[q] !== '{' && !(src[q] === '[' && n === 0)) break; const z = groupEnd(src, q, e); if (z < 0) return null; spec += src[q] === '{' ? 'm' : 'o'; j = z; }
      }
      const a = argsAt(src, i + 1, spec, e);
      if (!a) return null;
      const known = c === 'w' || c === 'W' || c === 'p' || c === 'm' || c === 'b';
      const wArg = c === 'w' || c === 'W' ? a.args[1] : known ? a.args[0] : COL_ARGS[c] == null ? a.args.find((x) => x && x.kind === 'm') || null : null;
      if (cols.length >= MAX_COLS) return null;
      const wa = (c === 'w' || c === 'W') && a.args[0] ? a.args[0] : null;
      cols.push({ s: pre ? pre.s : i, e: a.e, ls: i, le: a.e, letter: c, w: wArg ? src.slice(wArg.is, wArg.ie) : null, ws: wArg ? wArg.is : null, we: wArg ? wArg.ie : null, wa: wa ? src.slice(wa.is, wa.ie).trim() : null, was: wa ? wa.is : null, wae: wa ? wa.ie : null, pre, post: null, star: -1 });
      pre = null;
      i = a.e;
      continue;
    }
    // (anything else a specification holds is no column: a digit, a stray brace)
    i++;
  }
  return { s, e, cols, stars };
}

// how a column sets its words: l, c, r, or p for a paragraph (p, m, b, X, …)
export function colAlign(col) {
  if (!col) return 'l';
  const L = col.letter;
  if ((L === 'c' || L === 'C' || L === 'S') && col.w == null) return 'c';
  if ((L === 'r' || L === 'R') && col.w == null) return 'r';
  if (L === 'w' || L === 'W') return col.wa === 'c' || col.wa === 'r' ? col.wa : 'l';
  if (L === 'l' || L === 'L') return col.w == null ? 'l' : 'p';
  return 'p';
}

// ---- the table -------------------------------------------------------------------------------
// The table whose \begin is at s: { name, s, e, beginE, args, spec, width, bodyS, bodyE, rows,
// tail, ncols, eol, comments } or null where it is no table this reads (unbalanced, too long).
// A row: { s, leadE, lead: [{ name, s, e }], cs, cells, sepS, sepE, e, kind }. A cell: { s, e
// (between its &), cs, ce (its words, without the spaces and comments around them), ks (after a
// \rowcolor or \cellcolor at its start), pre, mc (\multicolumn), mr (\multirow), col, span }.
export function parseTable(src, s, budget = MAX_TABLE) {
  const m = /^\\begin\s*\{([A-Za-z]+\*?)\}/.exec(src.slice(s, s + 40));
  if (!m || !ENV_ARGS[m[1]]) return null;
  const name = m[1], lim = Math.min(src.length, s + Math.min(MAX_TABLE, budget));
  const a = argsAt(src, s + m[0].length, ENV_ARGS[name], lim);
  if (!a) return null;
  const specArg = a.args[SPEC_AT[name]];
  if (!specArg || specArg.kind !== 'm') return null;
  const widthArg = WIDTH_AT[name] != null ? a.args[WIDTH_AT[name]] : null;
  const spec = parseSpec(src, specArg.is, specArg.ie);
  if (!spec) return null;
  const bodyS = a.e;
  // one pass over the body: the table's own & and \\, the rules, the comments, where it ends
  const amps = [], seps = [], comments = [];
  let depth = 0, env = 0, bodyE = -1, e = -1;
  for (let i = bodyS; i < lim; i++) {
    const c = src[i];
    if (c === '%') { const n = src.indexOf('\n', i); const z = n < 0 || n > lim ? lim : n; comments.push([i, z]); i = z - 1; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') { if (--depth < 0) return null; continue; }
    if (c === '&') { if (depth === 0 && env === 0) amps.push(i); continue; }
    if (c !== '\\') continue;
    const [nm, j] = csAt(src, i);
    if (nm === 'verb') {
      // \verb|…| and \verb*|…|: up to the delimiter, on its line
      let k = j;
      if (src[k] === '*') k++;
      const d = src[k];
      const z = d ? src.indexOf(d, k + 1) : -1, n = src.indexOf('\n', k + 1);
      if (z < 0 || (n >= 0 && n < z)) return null;
      i = z;
      continue;
    }
    if (nm === 'begin' || nm === 'end') {
      const g = argsAt(src, j, 'm', lim);
      if (!g) { i = j - 1; continue; }
      const en = src.slice(g.args[0].is, g.args[0].ie).trim();
      if (nm === 'begin') env++;
      else if (env === 0) {
        if (en !== name || depth !== 0) return null;
        bodyE = i; e = g.e;
        break;
      } else env--;
      i = g.e - 1;
      continue;
    }
    if (depth === 0 && env === 0 && (nm === '\\' || nm === 'tabularnewline' || (nm === 'kill' && name === 'longtable'))) {
      let k = j;
      if (nm === '\\' && src[k] === '*') k++;
      // an optional length after it: \\[2pt], also after spaces and one line end (TeX's \@ifnextchar)
      if (nm !== 'kill') {
        const q = skipArgSp(src, k, lim);
        if (src[q] === '[') { const z = groupEnd(src, q, lim); if (z > 0) k = z; }
      }
      seps.push({ s: i, e: k, name: nm });
      i = k - 1;
      continue;
    }
    i = j - 1;
  }
  if (bodyE < 0) return null;
  const T = { name, s, e, beginE: bodyS, args: a.args, spec, specS: specArg.is, specE: specArg.ie, width: widthArg && widthArg.kind === 'm' ? { s: widthArg.is, e: widthArg.ie, text: src.slice(widthArg.is, widthArg.ie) } : null,
    bodyS, bodyE, rows: [], tail: null, comments, eol: /\r\n/.test(src.slice(s, Math.min(e, s + 4000))) ? '\r\n' : '\n' };
  const comEnd = new Map(comments.map(([x, z]) => [z, x]));
  const comStart = new Map(comments.map(([x, z]) => [x, z]));
  T.comEnd = comEnd; T.comStart = comStart;
  // the rows: the body cut at its separators
  let segS = bodyS, ai = 0;
  const segs = seps.map((x) => { const r = { s: segS, e: x.s, sep: x }; segS = x.e; return r; });
  segs.push({ s: segS, e: bodyE, sep: null });
  for (const [k, g] of segs.entries()) {
    const lead = [];
    let p = g.s;
    for (let guard = 0; guard < 200; guard++) {
      const q = skipWs(src, p, g.e, comStart);
      if (src[q] !== '\\') break;
      const [nm, j] = csAt(src, q);
      if (!(nm in LEAD)) break;
      const r = argsAt(src, j, LEAD[nm], g.e);
      if (!r) break;
      lead.push({ name: nm, s: q, e: r.e, args: r.args });
      p = r.e;
    }
    const leadE = p;
    const cs = skipWs(src, leadE, g.e, comStart);
    while (ai < amps.length && amps[ai] < leadE) ai++;
    const bounds = [];
    while (ai < amps.length && amps[ai] < g.e) bounds.push(amps[ai++]);
    const last = k === segs.length - 1;
    if (last && cs >= g.e && !bounds.length) { T.tail = { s: g.s, e: g.e, lead }; break; }
    const row = { s: g.s, leadE, lead, cs, cells: [], sepS: g.sep ? g.sep.s : null, sepE: g.sep ? g.sep.e : null, sep: g.sep ? src.slice(g.sep.s, g.sep.e) : null, e: g.sep ? g.sep.e : g.e, kind: 'row' };
    let cs0 = leadE;
    for (const b of [...bounds, g.e]) { row.cells.push(readCell(src, T, cs0, b)); cs0 = b + 1; }
    if (row.cells.length === 1 && /^\\caption\b/.test(src.slice(row.cells[0].cs, row.cells[0].cs + 9))) row.kind = 'caption';
    T.rows.push(row);
  }
  if (!T.tail) T.tail = { s: bodyE, e: bodyE, lead: [] };
  // the columns each cell covers
  let width = spec.cols.length;
  for (const row of T.rows) {
    let col = 0;
    for (const cell of row.cells) { cell.col = col; col += cell.span; }
    row.width = col;
    if (row.kind === 'row') width = Math.max(width, col);
  }
  T.ncols = Math.max(1, width);
  // longtable's head: the rows before \endhead (or \endfirsthead)
  T.headEnd = -1;
  T.rows.forEach((r, k) => { if (r.lead.some((x) => x.name === 'endhead' || x.name === 'endfirsthead') && T.headEnd < 0) T.headEnd = k; });
  if (T.headEnd < 0 && T.tail.lead.some((x) => x.name === 'endhead' || x.name === 'endfirsthead')) T.headEnd = T.rows.length;
  return T;
}

// past spaces and whole comments
function skipWs(src, i, lim, comStart) {
  while (i < lim) {
    const c = src[i];
    if (isSp(c)) { i++; continue; }
    if (c === '%' && comStart.has(i)) { i = comStart.get(i); continue; }
    break;
  }
  return Math.min(i, lim);
}
// back over spaces and whole comments
function skipWsBack(src, i, lo, comEnd) {
  while (i > lo) {
    const c = src[i - 1];
    if (isSp(c)) { i--; continue; }
    if (comEnd.has(i) && comEnd.get(i) >= lo) { i = comEnd.get(i); continue; }
    break;
  }
  return i;
}

// One cell [s, e): its words, the colours before them, a \multicolumn or \multirow around them
function readCell(src, T, s, e) {
  const cs = skipWs(src, s, e, T.comStart);
  const ce = cs >= e ? cs : skipWsBack(src, e, cs, T.comEnd);
  const cell = { s, e, cs, ce, ks: cs, pre: [], mc: null, mr: null, span: 1, empty: cs >= ce };
  if (cell.empty) {
    // where words typed into it go: after the line's indent, or after one space after the &
    const raw = src.slice(s, e), nl = raw.lastIndexOf('\n');
    let k = nl >= 0 ? s + nl + 1 : s;
    if (nl >= 0) { while (k < e && (src[k] === ' ' || src[k] === '\t')) k++; }
    else if (src[k] === ' ' && k < e) k++;
    cell.cs = cell.ce = cell.ks = cell.rs = k;
    return cell;
  }
  // \rowcolor and \cellcolor at the start (\rowcolor only in a row's first cell, as TeX wants)
  // (ks: where the words start, after the colours; rs: where a new first cell may start, after a
  // \rowcolor, which must stay the row's first; both past spaces, up to the cell's end)
  let k = cs;
  cell.rs = cs;
  for (let guard = 0; guard < 4 && src[k] === '\\'; guard++) {
    const [nm, j] = csAt(src, k);
    if (nm !== 'rowcolor' && nm !== 'cellcolor') break;
    const r = argsAt(src, j, 'om', ce);
    if (!r) break;
    cell.pre.push({ name: nm, s: k, e: r.e, model: r.args[0] ? src.slice(r.args[0].is, r.args[0].ie) : null, color: src.slice(r.args[1].is, r.args[1].ie) });
    k = skipWs(src, r.e, e, T.comStart);
    if (nm === 'rowcolor' && cell.pre.length === 1) cell.rs = k;
  }
  cell.ks = k;
  // the whole of the rest one \multicolumn{n}{spec}{text}, or \multirow[pos]{n}[struts]{width}[move]{text}
  if (src[k] === '\\') {
    const [nm, j] = csAt(src, k);
    if (nm === 'multicolumn') {
      const r = argsAt(src, j, 'mmm', ce + 1);
      if (r && r.e === ce) {
        const [n, sp, tx] = r.args;
        cell.mc = { s: k, e: r.e, n: parseInt(src.slice(n.is, n.ie), 10) || 1, nS: n.is, nE: n.ie, specS: sp.is, specE: sp.ie, bodyS: tx.is, textS: tx.is, textE: tx.ie };
        cell.span = Math.max(1, Math.min(1000, cell.mc.n));
        // a merged cell's colour stands in its text (\cellcolor before \multicolumn is TeX's
        // "Misplaced \omit"): read like the colours before a cell's words, its words after it
        let q = skipWs(src, tx.is, tx.ie, T.comStart);
        for (let guard = 0; guard < 4 && src.startsWith('\\cellcolor', q); guard++) {
          const [nm, j2] = csAt(src, q);
          if (nm !== 'cellcolor') break;
          const r2 = argsAt(src, j2, 'om', tx.ie);
          if (!r2) break;
          cell.pre.push({ name: nm, s: q, e: r2.e, inner: true, model: r2.args[0] ? src.slice(r2.args[0].is, r2.args[0].ie) : null, color: src.slice(r2.args[1].is, r2.args[1].ie) });
          q = skipWs(src, r2.e, tx.ie, T.comStart);
          cell.mc.textS = q;
        }
        const inner = skipWs(src, cell.mc.textS, tx.ie, T.comStart);
        if (src.startsWith('\\multirow', inner)) cell.mr = readMultirow(src, inner, tx.ie, T);
      }
    } else if (nm === 'multirow') cell.mr = readMultirow(src, k, ce, T);
  }
  return cell;
}
function readMultirow(src, k, ce, T) {
  const j = csAt(src, k)[1];
  const r = argsAt(src, j, 'omomom', ce + 1);
  if (!r || skipWsBack(src, ce, k, T.comEnd) !== r.e) return null;
  const [vpos, n, , w, , tx] = r.args;
  return { s: k, e: r.e, n: parseInt(src.slice(n.is, n.ie), 10) || 1, nS: n.is, nE: n.ie, vpos: vpos ? src.slice(vpos.is, vpos.ie) : null, w: src.slice(w.is, w.ie), textS: tx.is, textE: tx.ie };
}

// The table put back together from its parts: the same text, byte for byte (test/table.test.mjs
// checks every table of the corpus), which shows no character of it is left out of a part
export function emit(src, T) {
  let out = src.slice(T.s, T.bodyS);
  for (const r of T.rows) {
    out += src.slice(r.s, r.leadE);
    r.cells.forEach((c, k) => { if (k) out += '&'; out += src.slice(c.s, c.e); });
    if (r.sepS != null) out += src.slice(r.sepS, r.sepE);
  }
  out += src.slice(T.tail.s, T.tail.e) + src.slice(T.bodyE, T.e);
  return out;
}

// ---- finding tables ----------------------------------------------------------------------------
// The \begin of every table environment in [s, e), outside comments: [{ s, name }] (at most max)
export function tablesIn(src, s = 0, e = src.length, max = 2000) {
  const out = [];
  for (let i = src.indexOf('\\begin', s); i >= 0 && i < e && out.length < max; i = src.indexOf('\\begin', i + 6)) {
    // (a comment holds it: a % before it on its line, not escaped)
    // (on its line, 4000 characters back at most: a stranger's line of a million \begin is read once)
    const ls = Math.max(src.lastIndexOf('\n', i - 1) + 1, i - 4000);
    let com = false;
    for (let k = ls; k < i; k++) { if (src[k] === '\\') { k++; continue; } if (src[k] === '%') { com = true; break; } }
    if (com) continue;
    const m = /^\\begin\s*\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 40));
    if (m && ENV_ARGS[m[1]]) out.push({ s: i, name: m[1] });
  }
  return out;
}

// The innermost table whose body holds p, among those that begin in [lo, hi): T or null. The
// tables are tried from the nearest \begin back (the first that holds p is the innermost), and
// all of them together read at most WORK characters: a stranger's thousand nested or unclosed
// tabulars cost one bounded look, not one whole read each.
const WORK = 4000000;
export function tableAt(src, p, lo = 0, hi = src.length) {
  let work = WORK;
  const top = Math.min(hi, p + 1);
  for (let i = src.lastIndexOf('\\begin', top - 1), n = 0; i >= lo && n < 400 && work > 0; i = i > 0 ? src.lastIndexOf('\\begin', i - 1) : -1, n++) {
    const m = /^\\begin\s*\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 40));
    if (!m || !ENV_ARGS[m[1]]) continue;
    const ls = Math.max(src.lastIndexOf('\n', i - 1) + 1, i - 4000);
    let com = false;
    for (let k = ls; k < i; k++) { if (src[k] === '\\') { k++; continue; } if (src[k] === '%') { com = true; break; } }
    if (com) continue;
    const T = parseTable(src, i, work);
    work -= T ? T.e - i : Math.min(MAX_TABLE, work, src.length - i);
    if (T && T.bodyS <= p && p <= T.bodyE) return T;
    if (i === 0) break;
  }
  return null;
}

// The cell that holds p: { r, k (its index in the row), cell } or the nearest one
// (the cells in order, made once a table: painting a selection asks once a cell, and a scan of
// every row each time took a second at 3000 rows)
export function cellAt(T, p) {
  let ix = T.cellIx;
  if (!ix) {
    ix = T.cellIx = [];
    for (const [r, row] of T.rows.entries()) if (row.kind === 'row') for (const [k, c] of row.cells.entries()) ix.push({ r, k, cell: c });
  }
  if (!ix.length) return null;
  // the last cell that starts at or before p: it, or the one before it where both touch p
  let lo = 0, hi = ix.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (ix[m].cell.s <= p) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i < 0) return ix[0];
  if (i > 0 && ix[i - 1].cell.e >= p) return ix[i - 1];
  return ix[i];
}

// the cell of row r that covers column col (a \multicolumn covers several): { k, cell } or null
export function cellOfCol(row, col) {
  for (const [k, c] of row.cells.entries()) if (c.col <= col && col < c.col + c.span) return { k, cell: c };
  return null;
}

// The rows a \multirow covers: [{ r, k, top, n }] where n counts down from its row (or up for a
// negative count, colortbl's way)
export function multirows(T) {
  const out = [];
  T.rows.forEach((row, r) => row.cells.forEach((c, k) => { if (c.mr) out.push({ r, k, col: c.col, span: c.span, n: c.mr.n, top: c.mr.n > 0 ? r : r + c.mr.n + 1, bottom: c.mr.n > 0 ? r + c.mr.n - 1 : r }); }));
  return out;
}

// ---- reading what a table looks like ------------------------------------------------------------
// The rules between rows: gap(T, r) is what stands before row r (r = rows.length: the tail)
export const gapLead = (T, r) => (r >= T.rows.length ? T.tail.lead : T.rows[r].lead);
export const ruleNames = (lead) => lead.filter((x) => RULES.has(x.name)).map((x) => x.name);
const hasFull = (lead) => lead.some((x) => x.name === 'hline' || x.name === 'midrule' || HEAVY.has(x.name) || x.name === 'specialrule' || x.name === 'Xhline' || x.name === 'hdashline');

// The look of a table: 'booktabs' (\toprule … \bottomrule), 'grid' (a rule after every row and
// bars between all columns), 'rows' (a rule after every row), 'plain' (no rule), or 'other'
export function lookOf(src, T) {
  const rows = T.rows.filter((r) => r.kind === 'row');
  if (!rows.length) return 'plain';
  const leads = [...T.rows.map((r) => r.lead), T.tail.lead];
  const names = leads.flatMap(ruleNames);
  if (!names.length) return barsOf(src, T).all ? 'bars' : 'plain';
  if (names.some((n) => HEAVY.has(n) || n === 'midrule' || n === 'cmidrule')) return 'booktabs';
  const every = leads.every((l, k) => (k === 0 || hasFull(l)));
  if (every && hasFull(leads[0])) return barsOf(src, T).all ? 'grid' : 'rows';
  return 'other';
}

// The bars of the specification: which of the n + 1 places (before column 0 … after column n-1)
// hold one; all: every place does
export function barsOf(src, T) {
  const f = flatSpec(src, T), places = [];
  if (!f || !f.sp.cols.length) return { places: [], all: false };
  const { t, sp } = f, cols = sp.cols;
  const between = (a, b) => t.slice(a, b);
  places.push(between(sp.s, cols[0].s).includes('|'));
  for (let k = 0; k + 1 < cols.length; k++) places.push(between(cols[k].e, cols[k + 1].s).includes('|'));
  places.push(between(cols[cols.length - 1].e, sp.e).includes('|'));
  return { places, all: places.every(Boolean), none: !places.some(Boolean) };
}

// A row's text as a person reads it: each cell's words (for sorting, converting, merging)
export const cellText = (src, c) => (c.empty ? '' : src.slice(c.mc ? (c.mr ? c.mr.textS : c.mc.textS) : c.mr ? c.mr.textS : c.ks, c.mc ? (c.mr ? c.mr.textE : c.mc.textE) : c.mr ? c.mr.textE : c.ce));

// ---- new tables -----------------------------------------------------------------------------
// The text of a new table of r rows and c columns, as Insert Table writes it: in a table float,
// centred, booktabs' rules, a header row, the caption under it. o: { fit: 'contents' | 'window' |
// 'fixed', width (a column's width, for fixed), cells: [[text]] (the words of each cell),
// float: false for the tabular alone, caption: false for none, eol }
export function newTableText(r, c, o = {}) {
  const nl = o.eol || '\n';
  r = Math.max(1, Math.min(200, r | 0)); c = Math.max(1, Math.min(63, c | 0));
  const fit = o.fit || 'contents';
  const letter = fit === 'window' ? 'X' : fit === 'fixed' ? 'p{' + (o.width || (Math.round(12 / c * 100) / 100 + 'cm')) + '}' : 'l';
  const spec = letter.repeat ? Array(c).fill(letter).join('') : letter;
  const env = fit === 'window' ? 'tabularx' : 'tabular';
  const open = '\\begin{' + env + '}' + (fit === 'window' ? '{\\linewidth}' : '') + '{' + spec + '}';
  const row = (k) => Array.from({ length: c }, (_, j) => (o.cells && o.cells[k] && o.cells[k][j] != null ? o.cells[k][j] : '')).join(' & ') + ' \\\\' + (o.cells && o.cells[k] && o.cells[k].comment ? ' ' + o.cells[k].comment : '');
  const lines = [open, '\\toprule'];
  for (let k = 0; k < r; k++) { lines.push(row(k)); if (k === 0 && r > 1 && o.header !== false) lines.push('\\midrule'); }
  lines.push('\\bottomrule', '\\end{' + env + '}');
  if (o.float === false) return lines.join(nl);
  return ['\\begin{table}[h]', '\\centering', ...lines, ...(o.caption === false ? [] : ['\\caption{}']), '\\end{table}'].join(nl);
}

// ---- edits on rows ----------------------------------------------------------------------------
// A row's own text, its unit: from the end of the rules before it to the end of its \\, and in a
// grid (a rule under every row) the rules under it too. The units and the rules before the first
// row and after the last are the whole body, so a row deleted is its unit taken out, and a row
// inserted is a unit of the same shape put in between two: one undoes the other byte for byte.
// A row joins its neighbour's group: in booktabs a row inserted below the header stays above
// \midrule, one inserted above the first body row goes under it.

// an empty row of n columns, as Rikuy writes one
export const emptyRow = (n) => Array(Math.max(1, n)).fill('').join(' & ') + ' \\\\';

// In a grid of rules: the same rules under every row (spaces aside; from three rows one may
// differ, as \hline\hline under a header), never booktabs. Then
// a new row brings them too: the rules as written after its \\ (" \hline" or "\n\hline"); else null.
const BOOK_RULES = new Set(['toprule', 'midrule', 'bottomrule', 'cmidrule', 'specialrule', 'addlinespace', 'morecmidrules']);
export function gridRules(src, T) {
  const n = T.rows.length;
  if (!n || T.rows.some((r) => r.kind !== 'row')) return null;
  if ([...T.rows.map((r) => r.lead), T.tail.lead].some((l) => l.some((x) => BOOK_RULES.has(x.name)))) return null;
  const under = [];
  for (let k = 0; k < n; k++) {
    const lead = k + 1 < n ? T.rows[k + 1].lead : T.tail.lead;
    if (!lead.some((x) => RULES.has(x.name))) return null;
    // (the rule's text without its comment: a new row brings the rule, never "% ok" again)
    const t = src.slice(T.rows[k].e, unitEnd(src, T, k, true)).split('\n').map((l) => uncomment(l)[0].replace(/[ \t\r]+$/, '')).join('\n');
    under.push({ t, norm: t.replace(/\s+/g, '') });
  }
  // the same rules under every row, one row's aside where it holds them and more (a double
  // \hline under a header, wherever a row inserted has put it); comments do not count
  const kinds = [...new Set(under.map((x) => x.norm))];
  if (kinds.length > 2) return null;
  let base = kinds[0];
  if (kinds.length === 2) {
    const [a, b] = kinds;
    base = b.startsWith(a) ? a : a.startsWith(b) ? b : null;
    if (base == null || under.filter((x) => x.norm !== base).length !== 1) return null;
  }
  return under.filter((x) => x.norm === base).pop().t;
}
// where row k's unit ends: its \\, or in a grid the end of the rules under it
function unitEnd(src, T, k, grid) {
  const row = T.rows[k];
  let e = row.e;
  if (grid) {
    const nx = T.rows[k + 1];
    e = nx ? nx.leadE : T.tail.lead.length ? T.tail.lead[T.tail.lead.length - 1].e : row.e;
  }
  // (a comment after it on its line is the row's: it goes and comes with it)
  return pastComment(src, T, e);
}
// p, or the end of a comment that follows p on its line
function pastComment(src, T, p) {
  let q = p;
  while (q < src.length && (src[q] === ' ' || src[q] === '\t')) q++;
  return src[q] === '%' && T.comStart.has(q) ? T.comStart.get(q) : p;
}
// where row k's unit starts: after the rules before it, and after a comment that ends the row
// before it (that comment is the row before's)
function unitStart(src, T, k, grid) {
  const row = T.rows[k];
  // (and a comment on the line of the rules before it is theirs: \hline% stays whole)
  // (as is one on the \begin line before the first row)
  const p = row.leadE > row.s || k === 0 ? pastComment(src, T, row.leadE) : row.leadE;
  return k > 0 ? Math.max(p, unitEnd(src, T, k - 1, grid)) : p;
}
// the edits that take rules out: a rule alone on its line with its line
function removeRules(src, rules) {
  const out = [];
  for (const x of rules) {
    const ls = src.lastIndexOf('\n', x.s - 1) + 1, le = src.indexOf('\n', x.e);
    if (/^[ \t]*$/.test(src.slice(ls, x.s)) && le >= 0 && /^[ \t\r]*$/.test(src.slice(x.e, le))) out.push({ s: ls, e: le + 1, t: '' });
    else { let s = x.s; while (s > 0 && (src[s - 1] === ' ' || src[s - 1] === '\t')) s--; out.push({ s, e: x.e, t: '' }); }
  }
  return out;
}
// a row's indent: the spaces before its words on their line, when nothing else stands there
function indentOf(src, row) {
  const ls = src.lastIndexOf('\n', row.cs - 1) + 1;
  const pre = src.slice(ls, row.cs);
  return /^[ \t]*$/.test(pre) ? pre : '';
}

// the multirows a change of rows reaches: their count edits
function spanRowEdits(T, delta, inside) {
  const out = [];
  for (const m of multirows(T)) {
    if (!inside(m)) continue;
    const c = T.rows[m.r].cells[m.k].mr;
    out.push({ s: c.nS, e: c.nE, t: String(c.n + (c.n > 0 ? delta : -delta)) });
  }
  return out;
}

// Insert a row above or below row r: { edits, p } (p: the new row's first cell, in the new
// text). o.text: the row's words as LaTeX ("a & b \\\\"), else an empty row.
export function insertRow(src, T, r, below, o = {}) {
  const row = T.rows[r];
  if (!row) return null;
  const grid = gridRules(src, T);
  const text = o.text != null ? o.text : emptyRow(T.ncols);
  // (a line end and the row's indent: never the comments before it, which stay where they are)
  const W = T.eol + indentOf(src, row);
  const lead = W.endsWith(' ') || W.endsWith('\t') ? text.replace(/^ /, '') : text;
  const span = spanRowEdits(T, 1, below ? (m) => m.top <= r && r < m.bottom : (m) => m.top < r && r <= m.bottom);
  if (below && row.sepS == null) {
    // the last row has no \\: it gets one, and the new row is the last without one
    const end = rowEnd(src, row);
    // (an empty row of one column would be no row without its \\: it holds {})
    let words = lead.replace(/\s*\\\\$/, '');
    if (!words.trim()) words = '{}';
    const t = ' \\\\' + W + words;
    return { edits: [{ s: end, e: end, t }, ...span], p: end + 3 + W.length };
  }
  const at = below ? unitEnd(src, T, r, !!grid) : unitStart(src, T, r, !!grid);
  const t = W + lead + (grid || '');
  return { edits: [{ s: at, e: at, t }, ...span], p: at + W.length };
}
// the end of a row's words (its last non space character, comments aside)
function rowEnd(src, row) {
  const c = row.cells[row.cells.length - 1];
  if (!c.empty) return c.ce;
  // (all its cells empty: after its last &)
  for (let k = row.cells.length - 1; k >= 0; k--) if (!row.cells[k].empty) return row.cells[k].ce;
  return row.cells.length > 1 ? row.cells[row.cells.length - 1].s : row.cs;
}

// Delete rows r0..r1: { edits, p } or { table: true } when no row would be left. In a grid the
// rule under each goes with it; a \multirow over them shrinks, or moves down when its own row goes.
export function deleteRows(src, T, r0, r1) {
  const data = T.rows.map((r, k) => k).filter((k) => T.rows[k].kind === 'row');
  if (data.every((k) => k >= r0 && k <= r1)) return { table: true };
  const grid = !!gridRules(src, T);
  const edits = [];
  const last = T.rows[r1];
  if (last.sepS == null && r0 > 0) {
    // the last rows, the last without \\: the \\ before them goes too
    const prev = T.rows[r0 - 1];
    let s = prev.sepS;
    while (s > 0 && (src[s - 1] === ' ' || src[s - 1] === '\t')) s--;
    edits.push({ s, e: rowEnd(src, last), t: '' });
  } else edits.push({ s: unitStart(src, T, r0, grid), e: unitEnd(src, T, r1, grid), t: '' });
  const p = edits[0].s;
  // In booktabs two rules that come together lose the middle one: the header deleted leaves no
  // \midrule under \toprule, the body deleted none over \bottomrule
  // (in other tables the rules on both sides of the rows deleted would come together, \hline
  // over \cline{2-3}: the table's top or bottom rule stays, else the one above)
  if (!grid) {
    const before = T.rows[r0].lead.filter((x) => RULES.has(x.name));
    const after = (r1 + 1 < T.rows.length ? T.rows[r1 + 1].lead : T.tail.lead).filter((x) => RULES.has(x.name));
    const mid = (l) => l.length && l.every((x) => x.name === 'midrule' || x.name === 'cmidrule');
    const lastData = data[data.length - 1];
    if (before.length && after.length) edits.push(...removeRules(src, lookOf(src, T) === 'booktabs' ? (mid(after) ? after : mid(before) ? before : []) : r1 >= lastData ? before : after));
  }
  for (const m of multirows(T)) {
    const lost = Math.max(0, Math.min(m.bottom, r1) - Math.max(m.top, r0) + 1);
    if (!lost) continue;
    const c = T.rows[m.r].cells[m.k];
    if (m.r < r0 || m.r > r1) { edits.push({ s: c.mr.nS, e: c.mr.nE, t: String(c.mr.n > 0 ? c.mr.n - lost : c.mr.n + lost) }); continue; }
    // its own row goes: the words move to the first row left under it
    const left = m.bottom - r1;
    if (left <= 0) continue;
    const to = T.rows[r1 + 1], at = to && cellOfCol(to, m.col);
    if (!at || !at.cell.empty) continue;
    const repl = left > 1 ? src.slice(c.mr.s, c.mr.nS) + left + src.slice(c.mr.nE, c.mr.e) : src.slice(c.mr.textS, c.mr.textE);
    edits.push({ s: at.cell.ks, e: at.cell.ks, t: repl });
  }
  return { edits: edits.sort((x, y) => x.s - y.s), p };
}

// ---- edits on columns ---------------------------------------------------------------------------
// The specification's text with column k's piece changed (or a piece added at a place): the
// edits to get there, one replacement of the part that differs. Pieces are read from the
// specification with every *{n}{…} written out, so the bars and @{} inside a star stay; the
// edit then puts back every star whose columns it did not touch.
// (a star written out longer than this is too long to edit column by column: 1000 columns of ten
// characters are 10 000; and each look at a stranger's star costs at most this much)
const MAX_FLAT = 1 << 14;
// text a after text b as TeX reads them: a space between a command's name and a letter after it
// (TeX writes a star out in tokens, \vline then c, where the letters would run together). Only
// a's last 80 characters are looked at: a pattern over all of a, once a repetition, went
// quadratic on a stranger's *{999}{\aaa…}.
function glue(a, b) {
  if (!b || !isLetter(b[0])) return a + b;
  let i = a.length - 1;
  const stop = Math.max(0, a.length - 80);
  while (i >= stop && isLetter(a[i])) i--;
  return i >= 0 && i < a.length - 1 && a[i] === '\\' ? a + ' ' + b : a + b;
}
// src.slice(s, e) with its *{n}{…} written out, or null past room characters
function expandSpec(src, s, e, depth, room) {
  const sp = parseSpec(src, s, e, depth);
  if (!sp) return null;
  let out = '', p = s;
  for (const st of sp.stars) {
    out = glue(out, src.slice(p, st.s));
    const body = expandSpec(src, st.is, st.ie, depth + 1, room);
    if (body == null || out.length + (body.length + 1) * st.n > room) return null;
    for (let r = 0; r < st.n; r++) out = glue(out, body);
    p = st.e;
  }
  out = glue(out, src.slice(p, e));
  return out.length > room ? null : out;
}
// { t, sp }: the text the specification is read from and its columns (src and T.spec without stars)
// (written out once for each T: the ribbon asks about one table many times)
function flatSpec(src, T) {
  const sp = T.spec;
  if (!sp.stars.length) return { t: src, sp };
  if (T.flat !== undefined) return T.flat;
  const t = expandSpec(src, sp.s, sp.e, 0, MAX_FLAT);
  const fs = t == null ? null : parseSpec(t, 0, t.length);
  return (T.flat = fs && fs.cols.length === sp.cols.length ? { t, sp: fs } : null);
}
// [lead, column 0, after it, column 1, …, after the last]; null for a star too long to write out
function specPieces(src, T) {
  const f = flatSpec(src, T);
  if (!f) return null;
  const { t, sp } = f, cols = sp.cols;
  const pieces = [t.slice(sp.s, cols.length ? cols[0].s : sp.e)];
  cols.forEach((c, k) => { pieces.push(t.slice(c.s, c.e)); pieces.push(t.slice(c.e, k + 1 < cols.length ? cols[k + 1].s : sp.e)); });
  return pieces;
}
// the text with T's *{n}{…} written out
export function writtenOut(src, T) {
  if (!T.spec.stars.length) return src;
  const f = flatSpec(src, T);
  return f ? src.slice(0, T.spec.s) + f.t + src.slice(T.spec.e) : src;
}
function specEdit(src, T, pieces) {
  if (!pieces) return [];
  const before = src.slice(T.spec.s, T.spec.e);
  let after = pieces.join('');
  if (T.spec.stars.length) {
    // the top level stretches: text as written, and each star with its written-out text
    const segs = [];
    let p = T.spec.s;
    for (const st of T.spec.stars) {
      if (st.s > p) segs.push({ o: src.slice(p, st.s), x: src.slice(p, st.s) });
      segs.push({ o: src.slice(st.s, st.e), x: expandSpec(src, st.s, st.e, 0, MAX_FLAT) || '', star: true });
      p = st.e;
    }
    if (T.spec.e > p) segs.push({ o: src.slice(p, T.spec.e), x: src.slice(p, T.spec.e) });
    // (written out as flatSpec does, a space glued in where a command's name meets a letter)
    let B = '';
    const ends = segs.map((g) => { B = glue(B, g.x); return [B.length - g.x.length, B.length]; });
    let a = 0;
    while (a < B.length && a < after.length && B[a] === after[a]) a++;
    let z = 0;
    while (z < B.length - a && z < after.length - a && B[B.length - 1 - z] === after[after.length - 1 - z]) z++;
    // the stretches clear of the part that changed stay as written (not one that touches it: a
    // >{} written before a star's first column belongs in the star), the rest is the new text
    let head = '', tail = '', i0 = 0, i1 = B.length;
    let k0 = 0;
    while (k0 < segs.length && ends[k0][1] < a) { head += segs[k0].o; i0 = ends[k0][1]; k0++; }
    let k1 = segs.length - 1;
    while (k1 >= k0 && ends[k1][0] > B.length - z) { tail = segs[k1].o + tail; i1 = ends[k1][0]; k1--; }
    // (a space glued in beside a star kept as written is not needed: its braces end the name)
    const glued = (k) => k > 0 && k < segs.length && ends[k][0] > ends[k - 1][1];
    if (k0 > 0 && glued(k0) && segs[k0 - 1].star && i0 < i1) i0++;
    if (k1 + 1 < segs.length && glued(k1 + 1) && segs[k1 + 1].star && i1 > i0) i1--;
    after = head + after.slice(i0, after.length - (B.length - i1)) + tail;
  }
  if (before === after) return [];
  let s = 0;
  while (s < before.length && s < after.length && before[s] === after[s]) s++;
  let z = 0;
  while (z < before.length - s && z < after.length - s && before[before.length - 1 - z] === after[after.length - 1 - z]) z++;
  return [{ s: T.spec.s + s, e: T.spec.e - z, t: after.slice(s, after.length - z) }];
}
// the separator new columns get between them: what stands between every two columns, if the same
function innerSep(src0, T) {
  const f = flatSpec(src0, T);
  if (!f) return '';
  const { t: src, sp } = f, cols = sp.cols;
  if (cols.length < 2) { const a = src.slice(sp.s, cols[0] ? cols[0].s : sp.e), b = cols[0] ? src.slice(cols[0].e, sp.e) : ''; return a === b && a.includes('|') ? '|' : ''; }
  const seps = new Set();
  for (let k = 0; k + 1 < cols.length; k++) seps.add(src.slice(cols[k].e, cols[k + 1].s).replace(/\s+/g, ''));
  return seps.size === 1 ? [...seps][0] : '';
}

// shift the column ranges of \cline and \cmidrule for a column added at q (1-based) or taken out
function ruleColEdits(src, T, fn) {
  const out = [];
  for (const lead of [...T.rows.map((r) => r.lead), T.tail.lead]) {
    for (const x of lead) {
      if (!['cline', 'cmidrule', 'cdashline', 'Xcline'].includes(x.name)) continue;
      const a = x.args.filter(Boolean).find((g) => g.kind === 'm');
      if (!a) continue;
      const m = /^(\s*)(\d+)(\s*-\s*)(\d+)(\s*)$/.exec(src.slice(a.is, a.ie));
      if (!m) continue;
      const r = fn(+m[2], +m[4]);
      if (r === null) { out.push({ s: x.s, e: x.e, t: '', rule: true }); continue; }
      const t = m[1] + r[0] + m[3] + r[1] + m[5];
      if (t !== src.slice(a.is, a.ie)) out.push({ s: a.is, e: a.ie, t });
    }
  }
  return out;
}

// Insert a column left or right of column col: { edits, p } (p: the new cell of the caret's row)
export function insertCol(src, T, col, right, o = {}) {
  const cols = T.spec.cols, n = T.ncols;
  if (col < 0 || col >= n) return null;
  const edits = [];
  // the specification: a copy of the column's own piece beside it
  if (cols.length) {
    const pieces = specPieces(src, T), k = Math.min(col, cols.length - 1), sep = innerSep(src, T);
    if (!pieces) return null;
    const copy = o.letter != null ? o.letter : pieces[2 * k + 1];
    // (the new column goes after the separator before it: deleting a column takes the separator
    // before it, so the specification comes back as it was; left of the first, the one after it)
    if (right) pieces.splice(2 * k + 2, 0, sep, copy);
    else if (k > 0) pieces.splice(2 * k, 0, sep, copy);
    else pieces.splice(1, 0, copy, sep);
    edits.push(...specEdit(src, T, pieces));
  }
  const q = right ? col + 2 : col + 1;
  edits.push(...ruleColEdits(src, T, (a, b) => [a >= q ? a + 1 : a, b >= q ? b + 1 : b]));
  let p = null;
  for (const [r, row] of T.rows.entries()) {
    if (row.kind !== 'row') continue;
    const hit = cellOfCol(row, col);
    if (!hit) {
      // a short row: a cell at its end only when the column is right after it
      if (row.width === col + (right ? 1 : 0) && row.cells.length) { const c = row.cells[row.cells.length - 1]; edits.push({ s: c.ce, e: c.ce, t: ' &' }); }
      continue;
    }
    const { cell } = hit;
    // inside a \multicolumn the merged cell grows
    if (cell.mc && ((right && col < cell.col + cell.span - 1) || (!right && col > cell.col))) { edits.push({ s: cell.mc.nS, e: cell.mc.nE, t: String(cell.mc.n + 1) }); continue; }
    const next = right ? row.cells[hit.k + 1] : null;
    if (right && next && !next.mc) {
      // (the same as a column left of the next cell)
      edits.push({ s: next.s, e: next.s, t: ' &' });
      if (r === o.row) p = { at: next.s, d: 1 };
    } else if (right) {
      // (after an empty cell: before its &, "& " so the new one is " " as well)
      if (cell.empty) { edits.push({ s: cell.e, e: cell.e, t: '& ' }); if (r === o.row) p = { at: cell.e, d: 1 }; }
      else {
        // (after the spaces that follow its words when an & or \\ comes next on the line: they stay
        // with the words, and the column taken out again leaves them as they were)
        let q = cell.ce;
        while (q < cell.e && (src[q] === ' ' || src[q] === '\t')) q++;
        if (q === cell.e) { edits.push({ s: q, e: q, t: '& ' }); if (r === o.row) p = { at: q, d: 1 }; }
        else { edits.push({ s: cell.ce, e: cell.ce, t: ' &' }); if (r === o.row) p = { at: cell.ce, d: 2 }; }
      }
    } else if (hit.k === 0) {
      // the first cell: "& " before its words and their \cellcolor (before a \rowcolor would put
      // that after an &, where TeX does not take it)
      const at = cell.rs;
      edits.push({ s: at, e: at, t: '& ' });
      if (r === o.row) p = { at, d: 0 };
    } else {
      // right after the & before it: " &", so deleting the column (a cell and the & after it) gives
      // the text back as it was, spaces and all
      edits.push({ s: cell.s, e: cell.s, t: ' &' });
      if (r === o.row) p = { at: cell.s, d: 1 };
    }
  }
  const sorted = edits.sort((x, y) => x.s - y.s);
  let pos = null;
  if (p) { pos = p.at; for (const x of sorted) if (x.e <= p.at && !(x.s === p.at && x.e === p.at)) pos += x.t.length - (x.e - x.s); pos += p.d; }
  return { edits: sorted, p: pos };
}

// Delete columns c0..c1: { edits } or { table: true } when none would be left
export function deleteCols(src, T, c0, c1) {
  const n = T.ncols;
  if (c0 <= 0 && c1 >= n - 1) return { table: true };
  const k = c1 - c0 + 1, edits = [];
  const cols = T.spec.cols;
  if (cols.length) {
    const pieces = specPieces(src, T);
    if (!pieces) return { edits: [] };
    // the columns with the separator before them; from the first column, with the one after them
    const z = Math.min(c1, cols.length - 1);
    if (c0 > 0) pieces.splice(2 * c0, 2 * (z - c0 + 1));
    else pieces.splice(1, 2 * (z + 1));
    edits.push(...specEdit(src, T, pieces));
  }
  edits.push(...ruleColEdits(src, T, (a, b) => {
    const na = a > c1 + 1 ? a - k : a > c0 ? c0 + 1 : a;
    const nb = b > c1 + 1 ? b - k : b >= c0 + 1 ? c0 : b;
    return nb < na ? null : [na, nb];
  }));
  for (const row of T.rows) {
    if (row.kind !== 'row') continue;
    const cells = row.cells;
    // the cells wholly inside the columns go; a \multicolumn across their edge shrinks
    const gone = [];
    for (const [i, c] of cells.entries()) {
      const a = c.col, b = c.col + c.span - 1;
      const lost = Math.max(0, Math.min(b, c1) - Math.max(a, c0) + 1);
      if (!lost) continue;
      if (lost === c.span) gone.push(i);
      else if (c.mc) edits.push({ s: c.mc.nS, e: c.mc.nE, t: String(c.mc.n - lost) });
    }
    if (!gone.length) continue;
    if (gone.length === cells.length) continue;
    // a run of cells: from the first one's words to the next cell's words (the last ones: from
    // the words before them)
    const i0 = gone[0], i1 = gone[gone.length - 1];
    if (i1 + 1 < cells.length) {
      const s = i0 === 0 ? cells[0].rs : cells[i0].s;
      const e = i0 === 0 ? cells[i1 + 1].rs : cells[i1 + 1].s;
      edits.push({ s, e, t: '' });
    } else {
      // the last cells: from the & before them (and a space before it) to the end of their words
      // (an empty last cell: its first space too where the & had none before it, as "& " was put in)
      const amp = cells[i0].s - 1, z = cells[i1];
      const spaced = src[amp - 1] === ' ' || src[amp - 1] === '\t';
      const s = spaced && amp - 1 >= cells[i0 - 1].s ? amp - 1 : amp;
      const e = z.empty ? (!spaced && src[z.s] === ' ' && z.e > z.s ? z.s + 1 : z.s) : z.ce;
      edits.push({ s, e: Math.max(e, cells[i1].s), t: '' });
    }
  }
  return { edits: dedupe(edits) };
}
function dedupe(edits) {
  const out = [];
  for (const x of edits.sort((a, b) => a.s - b.s || a.e - b.e)) { const y = out[out.length - 1]; if (y && x.s < y.e) { if (x.e > y.e) y.e = x.e; continue; } out.push(x); }
  return out;
}

// ---- applying edits (tests and composed operations) -------------------------------------------
export function apply(src, edits) {
  let out = src;
  for (const x of [...edits].sort((a, b) => b.s - a.s || b.e - a.e)) out = out.slice(0, x.s) + x.t + out.slice(x.e);
  return out;
}

// ---- the float around a table ------------------------------------------------------------------
// The table float (table, table*) that holds T, with what else it holds: { s, e, name, headE (after
// \begin{table}[h]), endS, caption: { s, e, is, ie, above } | null, label, centering, only: true when
// it holds nothing but the table, \centering, \caption, \label and settings } or null
const SETTINGS = new Set(['centering', 'caption', 'label', 'small', 'footnotesize', 'scriptsize', 'normalsize', 'setlength', 'renewcommand', 'rowcolors', 'arrayrulecolor', 'raggedright', 'raggedleft']);
export function floatOf(src, T) {
  const from = Math.max(0, T.s - 8000);
  for (let i = src.lastIndexOf('\\begin', T.s - 1); i >= from; i = src.lastIndexOf('\\begin', i - 1)) {
    // (a \begin in a comment opens nothing)
    { const ls = src.lastIndexOf('\n', i - 1) + 1; if (i - ls < 2000 && uncomment(src.slice(ls, i))[1]) { if (i === 0) break; continue; } }
    const m = /^\\begin\s*\{(table\*?|sidewaystable|wraptable)\}/.exec(src.slice(i, i + 30));
    if (!m) { if (/^\\begin\s*\{/.test(src.slice(i, i + 8))) { const g = /^\\begin\s*\{([A-Za-z*]+)\}/.exec(src.slice(i, i + 40)); if (g && !TABLE_ENVS.includes(g[1]) && g[1] !== 'center' && g[1] !== 'adjustbox' && g[1] !== 'threeparttable') return null; } if (i === 0) break; continue; }
    const name = m[1];
    let k = i + m[0].length;
    const o = argsAt(src, k, name === 'wraptable' ? 'oomom' : 'o', T.s);
    if (o) k = o.e;
    // its \end, past T
    const re = new RegExp('\\\\(begin|end)\\s*\\{' + name.replace('*', '\\*') + '\\}', 'g');
    re.lastIndex = T.e;
    let d = 0, endS = -1, e = -1;
    for (let n = 0, x; (x = re.exec(src)) && n < 50; n++) { if (x[1] === 'begin') d++; else if (d-- === 0) { endS = x.index; e = x.index + x[0].length; break; } }
    if (endS < 0) return null;
    const F = { s: i, e, name, headE: k, endS, caption: null, label: null, centering: null, only: true };
    // what else it holds: [headE, T.s) and [T.e, endS)
    for (const [a, z, above] of [[k, T.s, true], [T.e, endS, false]]) {
      for (let p = a; p < z;) {
        p = skipWs(src, p, z, new Map());
        if (p >= z) break;
        if (src[p] === '%') { const n = src.indexOf('\n', p); p = n < 0 || n > z ? z : n + 1; continue; }
        if (src[p] !== '\\') { F.only = false; break; }
        const [nm, j] = csAt(src, p);
        const spec = nm === 'caption' ? 'om' : nm === 'label' ? 'm' : nm === 'setlength' ? 'mm' : nm === 'renewcommand' ? 'mm' : nm === 'rowcolors' ? 'omm' + 'm' : nm === 'arrayrulecolor' ? 'om' : '';
        if (!SETTINGS.has(nm)) {
          if (nm === 'begin' || nm === 'end') { const g = argsAt(src, j, 'm', z); if (g && ['center', 'adjustbox'].includes(src.slice(g.args[0].is, g.args[0].ie))) { if (src.slice(g.args[0].is, g.args[0].ie) === 'center') F.center = true; p = g.e; continue; } }
          F.only = false; break;
        }
        const r = argsAt(src, j, nm === 'rowcolors' ? 'ommm' : spec, z);
        const end = r ? r.e : j;
        if (nm === 'caption' && r) F.caption = { s: p, e: end, is: r.args[1].is, ie: r.args[1].ie, above };
        if (nm === 'label' && r) F.label = { s: p, e: end, is: r.args[0].is, ie: r.args[0].ie, above };
        if (nm === 'centering' || nm === 'raggedleft') F.centering = { s: p, e: end };
        p = end;
      }
    }
    return F;
  }
  return null;
}

// ---- merging and splitting cells ----------------------------------------------------------------
// the bars a \multicolumn over columns c0..c1 keeps: the first column's left bar (only at the
// table's left edge: inside, the bar belongs to the column before) and the bars after c1
function mcSpec(src0, T, c0, c1, letter) {
  const f = flatSpec(src0, T);
  if (!f || !f.sp.cols.length) return letter;
  const { t: src, sp } = f, cols = sp.cols;
  const bars = (a, b) => src.slice(a, b).replace(/[^|]/g, '');
  const left = c0 === 0 ? bars(sp.s, cols[0].s) : '';
  const k = Math.min(c1, cols.length - 1);
  const right = bars(cols[k].e, k + 1 < cols.length ? cols[k + 1].s : sp.e);
  return left + letter + right;
}
// the rectangle of cells a selection covers grown to the merged cells it cuts: { r0, r1, c0, c1 }
export function grow(T, rect) {
  let { r0, r1, c0, c1 } = rect;
  for (let n = 0, changed = true; changed && n < 20; n++) {
    changed = false;
    for (let r = r0; r <= r1; r++) {
      const row = T.rows[r];
      if (!row || row.kind !== 'row') continue;
      for (const c of row.cells) { const a = c.col, b = c.col + c.span - 1; if (b >= c0 && a <= c1 && (a < c0 || b > c1)) { c0 = Math.min(c0, a); c1 = Math.max(c1, b); changed = true; } }
    }
    for (const m of multirows(T)) if (m.col <= c1 && m.col + m.span - 1 >= c0 && m.bottom >= r0 && m.top <= r1 && (m.top < r0 || m.bottom > r1)) { r0 = Math.min(r0, m.top); r1 = Math.max(r1, m.bottom); changed = true; }
  }
  return { r0, r1, c0, c1 };
}

// Merge the cells of rect: across a row \multicolumn{k}{c}{…}, down a column \multirow{n}{*}{…},
// both \multicolumn{k}{c}{\multirow{n}{*}{…}} with \multicolumn{k}{c}{} in the rows under it. The
// words of every cell come together in the first, as Word puts them; a rule between the merged
// rows becomes \cline (\cmidrule in booktabs) of the other columns. { edits, p, packages } or { error }.
export function mergeCells(src, T, rect) {
  const { r0, r1, c0, c1 } = grow(T, rect);
  if (r0 === r1 && c0 === c1) return { error: 'Select two cells or more to merge them.' };
  for (let r = r0; r <= r1; r++) if (!T.rows[r] || T.rows[r].kind !== 'row') return { error: 'Only the table\'s rows can be merged.' };
  const k = c1 - c0 + 1, n = r1 - r0 + 1, edits = [], words = [];
  const ranges = [];
  for (let r = r0; r <= r1; r++) {
    const row = T.rows[r], cs = row.cells.filter((c) => c.col >= c0 && c.col + c.span - 1 <= c1);
    if (!cs.length) return { error: 'These cells cannot be merged: a row is too short.' };
    for (const c of cs) { const t = cellText(src, c).trim(); if (t) words.push(t); }
    ranges.push({ r, first: cs[0], last: cs[cs.length - 1] });
  }
  const letter = 'c';
  const spec = mcSpec(src, T, c0, c1, letter);
  const body = words.join(' ');
  const inner = n > 1 ? '\\multirow{' + n + '}{*}{' + body + '}' : body;
  // (a \cellcolor of a row's first cell goes into the \multicolumn's text: before it TeX stops)
  const color = (x) => outerColor(src, x.first) + innerColor(src, x.first);
  const top = k > 1 ? '\\multicolumn{' + k + '}{' + spec + '}{' + color(ranges[0]) + inner + '}' : color(ranges[0]) + inner;
  const span = (x) => ({ s: outerStart(x.first), e: x.last.empty ? (x.last === x.first ? x.last.ks : x.last.s) : x.last.ce });
  const t0 = span(ranges[0]);
  edits.push({ s: t0.s, e: t0.e, t: top });
  const p = t0.s + top.length - (k > 1 ? 1 : 0) - (n > 1 ? 1 : 0);
  for (const x of ranges.slice(1)) {
    const g = span(x);
    const t = k > 1 ? '\\multicolumn{' + k + '}{' + spec + '}{' + color(x).trim() + '}' : color(x).trim();
    if (g.s !== g.e || t) edits.push({ s: g.s, e: g.e, t });
  }
  // the rules between the merged rows: around the merged columns only
  if (n > 1) edits.push(...clipRules(src, T, r0 + 1, r1, c0, c1));
  return { edits: edits.sort((a, b) => a.s - b.s), p, packages: n > 1 ? ['multirow'] : [] };
}
// the rules in gaps g0..g1 (before rows g0..g1) cut away from columns c0..c1
function clipRules(src, T, g0, g1, c0, c1) {
  const out = [], n = T.ncols;
  const parts = (a, b) => { const r = []; if (a < c0 + 1) r.push([a, Math.min(b, c0)]); if (b > c1 + 1) r.push([Math.max(a, c1 + 2), b]); return r.filter(([x, y]) => x <= y); };
  for (let g = g0; g <= g1; g++) {
    for (const x of gapLead(T, g)) {
      if (!RULES.has(x.name) || x.name === 'hhline') continue;
      const partial = ['cline', 'cmidrule', 'cdashline', 'Xcline'].includes(x.name);
      let a = 1, b = n;
      if (partial) {
        const arg = x.args.filter(Boolean).find((y) => y.kind === 'm');
        const m = arg && /(\d+)\s*-\s*(\d+)/.exec(src.slice(arg.is, arg.ie));
        if (!m) continue;
        a = +m[1]; b = +m[2];
      }
      if (b < c0 + 1 || a > c1 + 1) continue;
      const name = x.name === 'midrule' || x.name === 'cmidrule' || HEAVY.has(x.name) ? 'cmidrule' : x.name === 'hdashline' || x.name === 'cdashline' ? 'cdashline' : 'cline';
      out.push({ s: x.s, e: x.e, t: parts(a, b).map(([p, q]) => '\\' + name + '{' + p + '-' + q + '}').join('') });
    }
  }
  return out;
}

// Split a merged cell back into its cells (Word's Split Cells on a merged cell): its words stay in
// the first; the rows a \multirow covered get their rules back across the whole table where only
// its columns lacked them. { edits, p } or { error }.
export function splitCell(src, T, r, k) {
  const row = T.rows[r], cell = row && row.cells[k];
  if (!cell || (!cell.mr && !(cell.mc && cell.mc.n > 1))) return { error: 'This cell is not merged: Split Cells divides a merged cell.' };
  const edits = [];
  const words = cellText(src, cell);
  const cols = cell.mc ? cell.mc.n : 1;
  const repl = cols > 1 ? (words ? words + ' &'.repeat(cols - 1) : '&' + ' &'.repeat(cols - 2)) : words;
  edits.push({ s: cell.ks, e: cell.ce, t: repl });
  if (cell.mr) {
    const top = cell.mr.n > 0 ? r : r + cell.mr.n + 1, bottom = cell.mr.n > 0 ? r + cell.mr.n - 1 : r;
    for (let q = top; q <= bottom; q++) {
      if (q === r) continue;
      const rr = T.rows[q];
      if (!rr) continue;
      const hit = cellOfCol(rr, cell.col);
      if (hit && hit.cell.mc && hit.cell.mc.n === cols && hit.cell.col === cell.col && !cellText(src, hit.cell).trim()) edits.push({ s: hit.cell.ks, e: hit.cell.ce, t: Array(cols).fill('').join(' & ').trim() });
    }
    edits.push(...unclipRules(src, T, top + 1, bottom, cell.col, cell.col + cols - 1));
  }
  return { edits: edits.sort((a, b) => a.s - b.s), p: cell.ks + words.length };
}
// the partial rules of gaps g0..g1 that leave out exactly columns c0..c1: one whole rule again
function unclipRules(src, T, g0, g1, c0, c1) {
  const out = [], n = T.ncols;
  for (let g = g0; g <= g1; g++) {
    const xs = gapLead(T, g).filter((x) => ['cline', 'cmidrule', 'cdashline'].includes(x.name));
    if (!xs.length) continue;
    const have = new Set();
    for (const x of xs) {
      const arg = x.args.filter(Boolean).find((y) => y.kind === 'm');
      const m = arg && /(\d+)\s*-\s*(\d+)/.exec(src.slice(arg.is, arg.ie));
      if (m) for (let q = +m[1]; q <= +m[2]; q++) have.add(q);
    }
    let ok = true;
    for (let q = 1; q <= n; q++) if ((q >= c0 + 1 && q <= c1 + 1) === have.has(q)) ok = false;
    if (!ok) continue;
    const name = xs[0].name === 'cmidrule' ? 'midrule' : xs[0].name === 'cdashline' ? 'hdashline' : 'hline';
    // (the clines are side by side: one rule in their place)
    out.push({ s: xs[0].s, e: xs[xs.length - 1].e, t: '\\' + name });
  }
  return out;
}

// Split the table into two above row r: the first ends with the rules the table ends with, the
// second starts with those it starts with and the same \begin. { edits, p }
export function splitTable(src, T, r) {
  const row = T.rows[r];
  if (!row || r === 0) return { error: 'Put the caret in a row below the first: the table splits above it.' };
  const nl = T.eol;
  const lead0 = T.rows[0].lead.filter((x) => RULES.has(x.name));
  const tailRules = T.tail.lead.filter((x) => RULES.has(x.name));
  const own = row.lead.some((x) => RULES.has(x.name));
  const begin = src.slice(T.s, T.beginE);
  const top = !own && tailRules.length ? nl + tailRules.map((x) => src.slice(x.s, x.e)).join(nl) : '';
  const head = lead0.length ? nl + lead0.map((x) => src.slice(x.s, x.e)).join(nl) : '';
  // (the rules before row r stay above the cut, as the old table's last)
  const at = row.leadE;
  const t = top + nl + '\\end{' + T.name + '}' + nl + nl + begin + head;
  return { edits: [{ s: at, e: at, t }], p: at + t.length };
}

// ---- alignment ----------------------------------------------------------------------------------
const H_DECL = { c: '\\centering', r: '\\raggedleft', l: '\\raggedright' };
const preDecl = (src, col) => (col && col.pre ? src.slice(col.pre.is, col.pre.ie) : '');
// a column's horizontal alignment: l, c, r, j (a paragraph column without one: justified)
export function colH(src, col) {
  const a = colAlign(col);
  if (a !== 'p') return a;
  const pre = preDecl(src, col);
  if (/\\centering/.test(pre)) return 'c';
  if (/\\raggedleft/.test(pre)) return 'r';
  if (/\\raggedright/.test(pre)) return 'l';
  return 'j';
}
// a paragraph column's vertical alignment: t (p), m, b
export const colV = (col) => (col && col.letter === 'm' ? 'm' : col && col.letter === 'b' ? 'b' : 't');
// a cell's alignment: its \multicolumn's letter, or its column's
export function cellH(src, T, cell) {
  if (cell.mc) { const sp = parseSpec(src, cell.mc.specS, cell.mc.specE); if (sp && sp.cols[0]) return colH(src, sp.cols[0]); }
  return colH(src, T.spec.cols[cell.col]);
}

// The specification's piece for a column with a new alignment: l c r for a plain column; for a
// paragraph column \centering, \raggedleft or \raggedright before it (array) and p, m or b for
// the vertical. h: 'l' | 'c' | 'r' | null (unchanged); v: 't' | 'm' | 'b' | null.
const NUMBER_COLS = new Set(['S', 's', 'D']);
function realign(src, col, h, v) {
  const a = colAlign(col);
  // (a number column aligns at its decimal sign, set by its own options: it stays)
  if (NUMBER_COLS.has(col.letter)) return null;
  // (w{align}{width}: its first argument)
  if (col.letter === 'w' || col.letter === 'W') return h && col.was != null ? src.slice(col.s, col.was) + h + src.slice(col.wae, col.e) : null;
  if (a !== 'p') return h ? (col.pre ? src.slice(col.s, col.ls) : '') + h + src.slice(col.le, col.e) : null;
  let letter = src.slice(col.ls, col.le);
  if (v && 'pmb'.includes(col.letter)) letter = { t: 'p', m: 'm', b: 'b' }[v] + letter.slice(1);
  let pre = preDecl(src, col);
  if (h) {
    pre = pre.replace(/\\(centering|raggedleft|raggedright)\b\s*(\\arraybackslash\b\s*)?/g, '');
    if (h !== 'j') pre = H_DECL[h] + '\\arraybackslash' + pre;
  }
  const post = col.post ? src.slice(col.post.s, col.post.e) : '';
  return (pre ? '>{' + pre + '}' : '') + letter + post;
}

// Align whole columns c0..c1: { edits, packages }
export function alignCols(src, T, c0, c1, h, v) {
  const pieces = specPieces(src, T), cols = T.spec.cols, pk = new Set();
  if (!pieces) return { edits: [], packages: [] };
  const some = cols.slice(c0, c1 + 1);
  if (h && some.length && some.every((col) => NUMBER_COLS.has(col.letter)) && !v) return { error: 'A number column (siunitx\'s S, dcolumn\'s D) lines its numbers up at the decimal sign; its own options set that. One cell, as a header, can be aligned.', edits: [], packages: [] };
  for (let c = c0; c <= Math.min(c1, cols.length - 1); c++) {
    const t = realign(src, cols[c], h, v);
    if (t == null) continue;
    if (/^>\{/.test(t) || /^[mb]/.test(t)) pk.add('array');
    pieces[2 * c + 1] = t;
  }
  return { edits: specEdit(src, T, pieces), packages: [...pk] };
}

// Align some cells: each as \multicolumn{1}{c}{…} with its column's bars, the \multicolumn going
// again when the alignment is its column's. { edits }
export function alignCells(src, T, cells, h) {
  const edits = [], pk = new Set();
  for (const cell of cells) {
    const col = T.spec.cols[cell.col];
    // (a number column's own alignment is at the decimal sign: any other is a cell's own)
    const own = col && NUMBER_COLS.has(col.letter) ? null : colH(src, col);
    if (cell.mc) {
      const sp = parseSpec(src, cell.mc.specS, cell.mc.specE), c0 = sp && sp.cols[0];
      if (!c0) continue;
      // back to its column's alignment: a \multicolumn{1}{…} that only aligned goes (its colour
      // kept before its words)
      if (cell.mc.n === 1 && h === own && !cell.mr && src.slice(cell.mc.specS, cell.mc.specE).replace(/[|\s]/g, '').length === 1) {
        edits.push({ s: cell.ks, e: cell.ce, t: src.slice(cell.mc.bodyS, cell.mc.textE) });
        continue;
      }
      const t = cellLetter(src, c0, h);
      if (t != null) { edits.push({ s: c0.s, e: c0.e, t }); if (/^>\{|^[mb]\s*\{/.test(t)) pk.add('array'); }
      continue;
    }
    if (h === own) continue;
    // the column's own piece realigned: its >{\bfseries} and <{} stay
    const letter = cellLetter(src, col, h) || h;
    if (/^>\{|^[mb]\s*\{/.test(letter)) pk.add('array');
    const words = cell.empty ? '' : src.slice(cell.ks, cell.ce);
    const s0 = outerStart(cell);
    edits.push({ s: s0, e: cell.empty ? cell.ks : cell.ce, t: '\\multicolumn{1}{' + mcSpec(src, T, cell.col, cell.col, letter) + '}{' + outerColor(src, cell) + words + '}' });
  }
  return { edits: edits.sort((a, b) => a.s - b.s), packages: [...pk] };
}
// one cell's column letter aligned h: a paragraph column keeps its width and gets \centering or
// \raggedleft; a number column (siunitx's S, dcolumn's D) a plain l, c or r, as for its header
function cellLetter(src, col, h) {
  if (!col) return h === 'j' ? 'l' : h;
  if (NUMBER_COLS.has(col.letter)) return (h === 'j' ? 'l' : h);
  return realign(src, col, colAlign(col) === 'p' ? (h === 'j' ? null : h) : h === 'j' ? 'l' : h, null);
}

// ---- sorting -------------------------------------------------------------------------------------
// what a cell sorts by: its words without commands, braces and math signs
export function sortKey(t) { return String(t).slice(0, 400).replace(/\\[A-Za-z]+\*?/g, ' ').replace(/[{}$~]/g, ' ').replace(/\s+/g, ' ').trim(); }
const asNumber = (t) => { const m = /^[-+−]?\s*[\d.,\s]*\d/.exec(sortKey(t).replace(/[−]/g, '-')); return m ? parseFloat(m[0].replace(/[\s,]/g, '')) : NaN; };
// Sort rows r0..r1 by column col: o { desc, type: 'text' | 'number' }. The rows' words change
// places, the rules and the \\ (and their lengths) stay. { edits } or { error }
export function sortRows(src, T, r0, r1, col, o = {}) {
  const rows = [];
  for (let r = r0; r <= r1; r++) { const row = T.rows[r]; if (row && row.kind === 'row') rows.push(r); }
  if (rows.length < 2) return { error: 'Nothing to sort: select two rows or more, or put the caret in a table with them.' };
  for (const m of multirows(T)) if (m.bottom >= rows[0] && m.top <= rows[rows.length - 1]) return { error: 'Rows with cells merged down them cannot be sorted.' };
  const items = rows.map((r) => {
    const row = T.rows[r], hit = cellOfCol(row, col);
    const key = hit ? cellText(src, hit.cell) : '';
    return { r, key, text: src.slice(row.cs, rowEnd(src, row)) };
  });
  const num = o.type === 'number' || (o.type == null && items.filter((x) => sortKey(x.key)).every((x) => !isNaN(asNumber(x.key))));
  const cmp = num ? (a, b) => (isNaN(asNumber(a.key)) ? Infinity : asNumber(a.key)) - (isNaN(asNumber(b.key)) ? Infinity : asNumber(b.key)) : (a, b) => sortKey(a.key).localeCompare(sortKey(b.key), undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...items].sort((a, b) => (o.desc ? -cmp(a, b) : cmp(a, b)) || a.r - b.r);
  const edits = [];
  items.forEach((x, i) => { const y = sorted[i]; if (y.text !== x.text) edits.push({ s: T.rows[x.r].cs, e: rowEnd(src, T.rows[x.r]), t: y.text }); });
  return { edits };
}

// ---- converting -----------------------------------------------------------------------------------
// The table as text: each row a paragraph, its cells joined by sep (', ', '; ', ' \quad '), or with
// sep 'para' each cell a paragraph. Replaces the float too when it holds only the table (its
// caption's words kept as a paragraph). { edits, p }
export function tableToText(src, T, sep) {
  const nl = T.eol;
  const F = floatOf(src, T);
  const rows = T.rows.filter((r) => r.kind === 'row').map((r) => r.cells.map((c) => cellText(src, c).trim()));
  const text = sep === 'para' ? rows.flat().filter(Boolean).join(nl + nl) : rows.map((cs) => cs.join(sep)).filter((x) => x.trim()).join(nl + nl);
  const whole = F && F.only;
  const s = whole ? F.s : T.s, e = whole ? F.e : T.e;
  let t = text;
  if (whole && F.caption && src.slice(F.caption.is, F.caption.ie).trim()) {
    const cap = src.slice(F.caption.is, F.caption.ie).trim();
    t = F.caption.above ? cap + nl + nl + text : text + nl + nl + cap;
  }
  return { edits: [{ s, e, t }], p: s };
}

// The rows of plain text as a table's cells: each paragraph (or each line, in one paragraph) a
// row, cut at sep: 'tab', ',', ';', '&', or auto (tabs, then &, then ;, then commas). A cut is
// made only outside braces and math ($…$, \(…\), \[…\]) and never at an escaped \& \% \, ; a
// comment is no cell's: each row's comments are its .comment, to stand after its \\.
// (one pass over each line, no pattern: a pattern with \s* on both sides of a separator went
// quadratic on a stranger's run of spaces)
function cutOutside(x, at) {
  const out = [];
  let cur = 0, d = 0, math = false;
  for (let i = 0; i < x.length; i++) {
    const ch = x[i];
    const n = d === 0 && !math ? at(x, i) : 0;
    if (n) { out.push(x.slice(cur, i)); i += n - 1; cur = i + 1; continue; }
    if (ch === '\\') {
      const nx = x[i + 1];
      if (nx === '(' || nx === '[') math = true;
      else if (nx === ')' || nx === ']') math = false;
      i++;
      continue;
    }
    if (ch === '{') d++;
    else if (ch === '}') d = Math.max(0, d - 1);
    else if (ch === '$') math = !math;
  }
  out.push(x.slice(cur));
  return out;
}
// a line without its comment: [words, comment ('' when none)]
function uncomment(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] === '%') return [line.slice(0, i), line.slice(i)];
  }
  return [line, ''];
}
export function splitRows(text, sep = 'auto') {
  const t = text.replace(/\r\n/g, '\n').trim();
  const paras = [];
  let cur = [];
  for (const raw of t.split('\n')) {
    const [line, com] = uncomment(raw);
    if (line.trim() || com) cur.push({ line: line.trim(), com: com.trim() });
    else if (cur.length) { paras.push(cur); cur = []; }
  }
  if (cur.length) paras.push(cur);
  const rowSep = (x, i) => (x[i] === '\\' && x[i + 1] === '\\' ? 2 : 0);
  let lines;
  if (paras.length > 1) lines = paras.map((p) => ({ text: p.map((x) => x.line).filter(Boolean).join(' '), com: p.map((x) => x.com).filter(Boolean).join(' ') }));
  else {
    lines = [];
    for (const x of paras[0] || []) {
      // (the length after a \\, as \\[2pt], is no cell's)
      const parts = cutOutside(x.line, rowSep).map((y, k) => (k ? y.replace(/^\s*\[[^\]\n]{0,40}\]/, '') : y));
      parts.forEach((y, k) => lines.push({ text: y, com: k === parts.length - 1 ? x.com : '' }));
    }
  }
  // (a line of only a comment joins the row before it)
  const rows = [];
  for (const x of lines) {
    if (x.text.trim()) rows.push({ text: x.text.trim(), com: x.com });
    else if (x.com && rows.length) rows[rows.length - 1].com = (rows[rows.length - 1].com + ' ' + x.com).trim();
  }
  const ch = { tab: '\t', ',': ',', ';': ';', '&': '&' };
  const cells = (x, s2) => cutOutside(x, (y, i) => (y[i] === ch[s2] ? 1 : 0));
  if (sep === 'auto') {
    const has = (s2) => rows.length && rows.every((x) => cells(x.text, s2).length > 1);
    sep = has('tab') ? 'tab' : rows.some((x) => cells(x.text, '&').length > 1) ? '&' : has(';') ? ';' : ',';
  }
  return rows.map((x) => {
    let cs = cells(x.text, sep).map((c) => c.trim());
    // (tabs in a row: a run of them is one cut)
    if (sep === 'tab') cs = cs.filter((c, k, a) => c !== '' || k === 0 || k === a.length - 1);
    if (x.com) cs.comment = x.com;
    return cs;
  });
}

// ---- the look: rules and bars -----------------------------------------------------------------------
// The rules of each gap (0: before the first row, rows.length: after the last) as names, and the
// edits that make a gap hold exactly these
function ruleText(names, style) { return names.map((n) => (n.startsWith('\\') ? n : '\\' + n)).join(style === 'same' ? ' ' : ''); }
function ownLines(src, T) {
  if (T.ownLines != null) return T.ownLines;
  let own = 0, same = 0;
  for (const r of T.rows.slice(1)) for (const x of r.lead) if (RULES.has(x.name)) { const ls = src.lastIndexOf('\n', x.s - 1) + 1; if (/^[ \t]*$/.test(src.slice(ls, x.s))) own++; else same++; }
  return (T.ownLines = own > same);
}
export function setGapRules(src, T, g, names) {
  const lead = gapLead(T, g), nl = T.eol;
  const rules = lead.filter((x) => RULES.has(x.name));
  const want = names.map((n) => n.replace(/^\\/, ''));
  const have = rules.map((x) => src.slice(x.s, x.e).replace(/^\\/, ''));
  if (have.join('|') === want.join('|')) return [];
  // (a rule on a line of its own where the table's rules are so, or booktabs' rules; else after the \\)
  const own = want.some((n) => /^(toprule|midrule|bottomrule)/.test(n)) || g === 0 || ownLines(src, T);
  if (rules.length) {
    // the rules there: replaced in place (their run, from the first to the last)
    if (!want.length) {
      const out = [];
      for (const x of rules) {
        // (a rule alone on its line goes with its line)
        const ls = src.lastIndexOf('\n', x.s - 1) + 1, le = src.indexOf('\n', x.e);
        if (/^[ \t]*$/.test(src.slice(ls, x.s)) && le >= 0 && /^[ \t\r]*$/.test(src.slice(x.e, le))) out.push({ s: ls, e: le + 1, t: '' });
        else { let s = x.s; while (s > 0 && (src[s - 1] === ' ' || src[s - 1] === '\t')) s--; out.push({ s, e: x.e, t: '' }); }
      }
      return out;
    }
    const between = src.slice(rules[0].e, rules.length > 1 ? rules[1].s : rules[0].e);
    return [{ s: rules[0].s, e: rules[rules.length - 1].e, t: want.map((n) => '\\' + n).join(/\n/.test(between) ? nl : between || ' ') }];
  }
  if (!want.length) return [];
  const text = want.map((n) => '\\' + n).join(own ? nl : ' ');
  if (g === 0) return [{ s: T.bodyS, e: T.bodyS, t: nl + text }];
  const prev = T.rows[g - 1];
  if (g === T.rows.length && prev.sepS == null) return [{ s: rowEnd(src, prev), e: rowEnd(src, prev), t: ' \\\\' + nl + text }];
  const at = prev.e;
  return [{ s: at, e: at, t: (own ? nl : ' ') + text }];
}
// The bars of the specification set: want[k] for each of the n + 1 places
export function setBars(src, T, want) {
  const cols = T.spec.cols;
  if (!cols.length) return [];
  const pieces = specPieces(src, T);
  if (!pieces) return [];
  const n = cols.length;
  for (let k = 0; k <= n; k++) {
    const i = 2 * k;
    const had = pieces[i].includes('|');
    if (had === !!want[k]) continue;
    if (want[k]) pieces[i] = k === 0 ? '|' + pieces[i] : k === n ? pieces[i] + '|' : '|' + pieces[i];
    else pieces[i] = pieces[i].replace(/\|/g, '');
  }
  return specEdit(src, T, pieces);
}

// Table styles, as Word's gallery: each a look of rules and bars (banding and header shading are
// settings of their own, see the options)
export const LOOKS = {
  plain: { name: 'Plain', rules: () => [], bars: () => false },
  grid: { name: 'Table Grid', rules: () => ['hline'], bars: () => true },
  booktabs: { name: 'Booktabs', rules: (g, n, head) => (g === 0 ? ['toprule'] : g === n ? ['bottomrule'] : g === 1 && head ? ['midrule'] : []), bars: () => false, packages: ['booktabs'] },
  rows: { name: 'Horizontal Lines', rules: () => ['hline'], bars: () => false },
  frame: { name: 'Box', rules: (g, n) => (g === 0 || g === n ? ['hline'] : []), bars: (k, n) => k === 0 || k === n }
};
// The edits that give T a look: { edits, packages }
export function applyLook(src, T, look) {
  const L = LOOKS[look];
  if (!L) return { edits: [] };
  const n = T.rows.length, edits = [];
  // (the header: row 0 is one, when there are rows under it)
  const head = T.rows.filter((r) => r.kind === 'row').length > 1;
  for (let g = 0; g <= n; g++) {
    // (longtable's caption row keeps its gap as it is)
    if (g < n && T.rows[g].kind === 'caption') continue;
    edits.push(...setGapRules(src, T, g, L.rules(g, n, head)));
  }
  const cols = T.spec.cols.length;
  edits.push(...setBars(src, T, Array.from({ length: cols + 1 }, (_, k) => L.bars(k, cols))));
  return { edits: edits.sort((a, b) => a.s - b.s), packages: L.packages || [] };
}

// ---- borders -----------------------------------------------------------------------------------------
// Which borders a selection has: { top, bottom, left, right, insideH, insideV } as true, false or
// null (no such border: one row has no inside horizontal one)
function gapCovers(src, T, g, c0, c1) {
  const lead = gapLead(T, g), have = new Set();
  for (const x of lead) {
    if (!RULES.has(x.name)) continue;
    if (['cline', 'cmidrule', 'cdashline', 'Xcline'].includes(x.name)) {
      const arg = x.args.filter(Boolean).find((y) => y.kind === 'm');
      const m = arg && /(\d+)\s*-\s*(\d+)/.exec(src.slice(arg.is, arg.ie));
      if (m) for (let q = +m[1]; q <= +m[2]; q++) have.add(q - 1);
    } else if (x.name !== 'hhline') for (let q = 0; q < T.ncols; q++) have.add(q);
  }
  for (let q = c0; q <= c1; q++) if (!have.has(q)) return false;
  return true;
}
export function bordersOf(src, T, rect) {
  const { r0, r1, c0, c1 } = rect, bars = barsOf(src, T).places;
  const all = (from, to, f) => { if (from > to) return null; for (let k = from; k <= to; k++) if (!f(k)) return false; return true; };
  return {
    top: gapCovers(src, T, r0, c0, c1), bottom: gapCovers(src, T, r1 + 1, c0, c1),
    left: !!bars[c0], right: !!bars[c1 + 1],
    insideH: all(r0 + 1, r1, (g) => gapCovers(src, T, g, c0, c1)), insideV: all(c0 + 1, c1, (k) => !!bars[k])
  };
}
// Set the borders named in parts ({ top: true, insideV: false, … }) on rect. Horizontal ones are
// rules: \hline (booktabs' \toprule, \midrule, \bottomrule) across the whole table, \cline{a-b}
// (\cmidrule) across some columns; vertical ones are bars in the specification, which run the
// whole height of the table, as LaTeX draws them. { edits, packages }
export function setBorders(src, T, rect, parts) {
  const { r0, r1, c0, c1 } = rect, n = T.rows.length;
  const full = c0 === 0 && c1 >= T.ncols - 1;
  const look = lookOf(src, T), book = look === 'booktabs';
  const edits = [];
  const gapWant = (g, on) => {
    const lead = gapLead(T, g);
    const cur = lead.filter((x) => RULES.has(x.name)).map((x) => src.slice(x.s, x.e));
    // the rules of this gap over the columns of the selection go; the others stay
    const keep = cur.filter((t) => {
      const m = /^\\(cline|cmidrule|cdashline)[^{]*\{(\d+)\s*-\s*(\d+)\}/.exec(t);
      if (!m) return !full ? false : false;
      return +m[3] < c0 + 1 || +m[2] > c1 + 1;
    });
    const partialOthers = full ? [] : cur.filter((t) => !/^\\(cline|cmidrule|cdashline)/.test(t)).length ? null : keep;
    let want;
    if (on) {
      const whole = book ? (g === 0 ? '\\toprule' : g === n ? '\\bottomrule' : '\\midrule') : '\\hline';
      if (full) want = [whole];
      else if (partialOthers === null) want = cur; // a whole rule there covers the columns already
      else want = [...keep, (book ? '\\cmidrule{' : '\\cline{') + (c0 + 1) + '-' + (c1 + 1) + '}'];
    } else {
      if (full) want = [];
      else if (partialOthers === null) {
        // a whole rule: what is left of it, as partial rules
        const left = [];
        if (c0 > 0) left.push([1, c0]);
        if (c1 < T.ncols - 1) left.push([c1 + 2, T.ncols]);
        want = left.map(([a, b]) => (book ? '\\cmidrule{' : '\\cline{') + a + '-' + b + '}');
      } else want = keep;
    }
    edits.push(...setGapRules(src, T, g, want));
  };
  if (parts.top != null) gapWant(r0, parts.top);
  if (parts.bottom != null) gapWant(r1 + 1, parts.bottom);
  if (parts.insideH != null) for (let g = r0 + 1; g <= r1; g++) gapWant(g, parts.insideH);
  const cols = T.spec.cols.length;
  if (cols && (parts.left != null || parts.right != null || parts.insideV != null)) {
    const bars = barsOf(src, T).places.slice();
    if (bars.length) {
      if (parts.left != null) bars[c0] = parts.left;
      if (parts.right != null) bars[Math.min(c1 + 1, cols)] = parts.right;
      if (parts.insideV != null) for (let k = c0 + 1; k <= Math.min(c1, cols - 1); k++) bars[k] = parts.insideV;
      edits.push(...setBars(src, T, bars));
    }
  }
  return { edits: dedupe(edits), packages: book ? ['booktabs'] : [] };
}

// ---- shading -------------------------------------------------------------------------------------------
// \cellcolor on each cell (or \rowcolor on whole rows), replacing what is there; color null takes
// it off. color: { model, value } as kit.colorArg gives. { edits, packages }
export function shade(src, T, rect, color) {
  const { r0, r1, c0, c1 } = rect, edits = [];
  const arg = color ? (color.model ? '[' + color.model + ']' : '') + '{' + color.value + '}' : null;
  const full = c0 === 0 && c1 >= T.ncols - 1;
  for (let r = r0; r <= r1; r++) {
    const row = T.rows[r];
    if (!row || row.kind !== 'row') continue;
    const first = row.cells[0];
    const rowc = first.pre.find((x) => x.name === 'rowcolor');
    if (full) {
      // the row's own colour: \rowcolor, and the cells' own colours go
      if (rowc) edits.push(arg ? { s: rowc.s, e: rowc.e, t: '\\rowcolor' + arg } : removePre(src, rowc, first));
      else if (arg) edits.push({ s: first.cs, e: first.cs, t: '\\rowcolor' + arg + (first.empty ? '' : ' ') });
      for (const c of row.cells) for (const x of c.pre) if (x.name === 'cellcolor') edits.push(removePre(src, x, c));
      continue;
    }
    for (const c of row.cells) {
      if (c.col + c.span - 1 < c0 || c.col > c1) continue;
      const cc = c.pre.find((x) => x.name === 'cellcolor');
      if (cc) edits.push(arg ? { s: cc.s, e: cc.e, t: '\\cellcolor' + arg } : removePre(src, cc, c));
      else if (arg && c.mc) edits.push({ s: c.mc.bodyS, e: c.mc.bodyS, t: '\\cellcolor' + arg + (src.slice(c.mc.bodyS, c.mc.textE).trim() ? ' ' : '') });
      else if (arg) edits.push({ s: c.ks, e: c.ks, t: '\\cellcolor' + arg + (c.empty ? '' : ' ') });
    }
  }
  return { edits: dedupe(edits), packages: arg ? ['xcolor-table'] : [] };
}
function removePre(src, x, c) {
  let e = x.e;
  while (e < c.e && (src[e] === ' ' || src[e] === '\t')) e++;
  return { s: x.s, e, t: '' };
}
// a cell's own \cellcolor as written before its words ('' when none): a \multicolumn made of the
// cell takes it into its text
const outerColor = (src, c) => c.pre.filter((x) => x.name === 'cellcolor' && !x.inner).map((x) => src.slice(x.s, x.e) + ' ').join('');
const outerStart = (c) => { const x = c.pre.find((y) => y.name === 'cellcolor' && !y.inner); return x ? x.s : c.ks; };
const innerColor = (src, c) => (c.mc ? c.pre.filter((x) => x.inner).map((x) => src.slice(x.s, x.e) + ' ').join('') : '');
// the colour of a cell as written: { name, model, value } or null
export function shadeOf(src, T, r, cell) {
  const own = cell.pre.find((x) => x.name === 'cellcolor');
  const row = T.rows[r], rowc = row && row.cells[0].pre.find((x) => x.name === 'rowcolor');
  const x = own || rowc;
  return x ? { model: x.model, value: x.color, row: !own } : null;
}

// ---- style options ---------------------------------------------------------------------------------------
const BOLD = /^\\textbf\s*\{/;
// whether a cell's words are bold as a whole (\textbf{…} around all of them, or {\bfseries …})
export function boldCell(src, c) {
  const s = c.mc ? c.mc.textS : c.ks, e = c.mc ? c.mc.textE : c.ce;
  const t = src.slice(s, e).trim();
  if (!t) return null;
  if (BOLD.test(t)) { const z = groupEnd(t, t.indexOf('{'), t.length); return z === t.length ? { s: s + (src.slice(s, e).length - src.slice(s, e).trimStart().length), kind: 'textbf' } : false; }
  if (/^\{\\(bfseries|bf)\b/.test(t) && groupEnd(t, 0, t.length) === t.length) return { kind: 'group' };
  return false;
}
export function rowBold(src, row) {
  const cs = row.cells.map((c) => boldCell(src, c)).filter((x) => x !== null);
  return cs.length > 0 && cs.every(Boolean);
}
// \textbf around each cell's words in row r (on), or off: \textbf{…} taken off whole cells
export function boldRow(src, row, on) {
  const edits = [];
  for (const c of row.cells) {
    const s = c.mc ? c.mc.textS : c.ks, e = c.mc ? c.mc.textE : c.ce;
    if (c.empty || s >= e) continue;
    const b = boldCell(src, c);
    if (on && !b) edits.push({ s, e: s, t: '\\textbf{' }, { s: e, e, t: '}' });
    if (!on && b && b.kind === 'textbf') {
      const t = src.slice(s, e), lead = t.length - t.trimStart().length;
      const open = t.indexOf('{', lead);
      const z = groupEnd(src, s + open, e + 1);
      edits.push({ s: s + lead, e: s + open + 1, t: '' }, { s: z - 1, e: z, t: '' });
    }
  }
  return edits;
}
// Header Row and Total Row: whether row 0 (the last row) is set off: bold, or a rule under it
// (over it) in a table without a rule under every row
export function headerOn(src, T, last) {
  const rows = T.rows.map((r, k) => k).filter((k) => T.rows[k].kind === 'row');
  if (rows.length < 2) return false;
  const r = last ? rows[rows.length - 1] : rows[0];
  const grid = !!gridRules(src, T);
  const g = last ? r : r + 1;
  return rowBold(src, T.rows[r]) || (!grid && gapLead(T, g).some((x) => RULES.has(x.name)));
}
export function setHeader(src, T, last, on) {
  const rows = T.rows.map((r, k) => k).filter((k) => T.rows[k].kind === 'row');
  if (rows.length < 2) return { edits: [] };
  const r = last ? rows[rows.length - 1] : rows[0];
  const grid = !!gridRules(src, T), book = lookOf(src, T) === 'booktabs';
  const g = last ? r : r + 1;
  const edits = [...boldRow(src, T.rows[r], on)];
  const has = gapLead(T, g).some((x) => RULES.has(x.name));
  if (!grid) {
    if (on && !has) edits.push(...setGapRules(src, T, g, [book ? 'midrule' : 'hline']));
    if (!on && has) edits.push(...setGapRules(src, T, g, []));
  }
  return { edits: dedupe(edits), packages: on && book ? ['booktabs'] : [] };
}

// First Column, Last Column: \bfseries before the column (array's >{})
export function colBold(src, T, c) { const col = T.spec.cols[c]; return !!col && /\\bfseries/.test(preDecl(src, col)); }
export function setColBold(src, T, c, on) {
  const col = T.spec.cols[c];
  const pieces = specPieces(src, T);
  if (!col || !pieces) return { edits: [] };
  const pre = preDecl(src, col).replace(/\\bfseries\b\s*/g, '');
  const own = (on ? '\\bfseries' : '') + pre;
  pieces[2 * c + 1] = (own ? '>{' + own + '}' : '') + src.slice(col.ls, col.e);
  return { edits: specEdit(src, T, pieces), packages: on ? ['array'] : [] };
}
// Banded Columns: \columncolor in every second column
export const BAND = 'gray!10';
export function bandedCols(src, T) { return T.spec.cols.some((col) => /\\columncolor/.test(preDecl(src, col))); }
export function setBandedCols(src, T, on) {
  const pieces = specPieces(src, T);
  if (!pieces) return { edits: [] };
  T.spec.cols.forEach((col, c) => {
    const pre = preDecl(src, col).replace(/\\columncolor(\[[^\]]*\])?\{[^{}]*\}\s*/g, '');
    const own = (on && c % 2 === 1 ? '\\columncolor{' + BAND + '}' : '') + pre;
    pieces[2 * c + 1] = (own ? '>{' + own + '}' : '') + src.slice(col.ls, col.e);
  });
  return { edits: specEdit(src, T, pieces), packages: on ? ['array', 'xcolor-table'] : [] };
}

// ---- settings before a table: \rowcolors, \arraystretch, \tabcolsep, \arrayrulewidth ------------------
// The settings written just before the table: in its float (between \begin{table} and the table)
// or in a group that holds the table alone ({\setlength… \begin{tabular}…\end{tabular}}). Each
// { key, s, e (its line), value: { s, e } }.
export const SETTING_KEYS = {
  rowcolors: { re: /^\\rowcolors\s*(\[[^\]]*\])?\s*\{([^{}]*)\}\s*\{([^{}]*)\}\s*\{([^{}]*)\}/, text: (v) => '\\rowcolors' + v },
  arraystretch: { re: /^\\renewcommand\s*\{?\\arraystretch\}?\s*\{([^{}]*)\}/, text: (v) => '\\renewcommand{\\arraystretch}{' + v + '}' },
  tabcolsep: { re: /^\\setlength\s*\{?\\tabcolsep\}?\s*\{([^{}]*)\}/, text: (v) => '\\setlength{\\tabcolsep}{' + v + '}' },
  arrayrulewidth: { re: /^\\setlength\s*\{?\\arrayrulewidth\}?\s*\{([^{}]*)\}/, text: (v) => '\\setlength{\\arrayrulewidth}{' + v + '}' },
  extrarowheight: { re: /^\\setlength\s*\{?\\extrarowheight\}?\s*\{([^{}]*)\}/, text: (v) => '\\setlength{\\extrarowheight}{' + v + '}' },
  arrayrulecolor: { re: /^\\arrayrulecolor\s*(\[[^\]]*\])?\s*\{([^{}]*)\}/, text: (v) => '\\arrayrulecolor' + v }
};
// where the settings of T are: { from, to (the place they may stand in), F (its float) | group:
// { s, e } (a group made for them: "{" settings, the table, "}") | arg (the table alone in a
// command's argument, \resizebox{…}{!}{…}: settings go in it, its braces stay), items }
// the commands from a to z when they are settings alone (spaces and comments between): [{ name,
// s, e }], or null when anything else stands there
const SET_ARGS = { caption: 'om', label: 'm', setlength: 'mm', renewcommand: 'mm', rowcolors: 'ommm', arrayrulecolor: 'om' };
function settingsOnly(src, a, z) {
  const out = [];
  for (let p = a, n = 0; p < z && n < 40; n++) {
    p = skipWs(src, p, z, new Map());
    if (p >= z) break;
    if (src[p] === '%') { const q = src.indexOf('\n', p); p = q < 0 || q > z ? z : q + 1; continue; }
    if (src[p] !== '\\') return null;
    const [nm, j] = csAt(src, p);
    if (!SETTINGS.has(nm)) return null;
    const r = argsAt(src, j, SET_ARGS[nm] || '', z);
    if (!r) return null;
    out.push({ name: nm, s: p, e: r.e });
    p = r.e;
  }
  return out;
}
function settingsPlace(src, T) {
  const F = floatOf(src, T);
  if (F) return { from: F.headE, to: T.s, F };
  // the brace before the table, past the settings before it (on its line or the lines above)
  let b = -1;
  for (let k = T.s, n = 0; n < 12 && b < 0; n++) {
    let j = k;
    while (j > 0 && isSp(src[j - 1])) j--;
    if (src[j - 1] === '{' && src[j - 2] !== '\\') { b = j - 1; break; }
    const ls = src.lastIndexOf('\n', j - 1) + 1;
    if (j - ls > 400) return null;
    // ("{\small" or "\resizebox{…}{!}{\rowcolors…": the brace after which settings alone stand)
    for (let q = src.lastIndexOf('{', j - 1); q >= ls; q = q > 0 ? src.lastIndexOf('{', q - 1) : -1) {
      if (src[q - 1] !== '\\' && settingsOnly(src, q + 1, T.s)) { b = q; break; }
    }
    if (b >= 0) break;
    if (!settingsOnly(src, ls, j)) return null;
    k = ls;
  }
  if (b < 0) return null;
  const items = settingsOnly(src, b + 1, T.s);
  if (!items) return null;
  let z = T.e;
  while (z < src.length && z - T.e < 200 && isSp(src[z])) z++;
  if (src[z] !== '}') return null;
  // a brace right after an argument (}, ] or a command's name before it) is an argument's: the
  // settings go in it and its braces stay; else it is a group of its own
  let q = b;
  while (q > 0 && (src[q - 1] === ' ' || src[q - 1] === '\t' || src[q - 1] === '\n' || src[q - 1] === '\r')) q--;
  const arg = src[q - 1] === '}' || src[q - 1] === ']' || /\\[A-Za-z@]+\*?$/.test(src.slice(Math.max(0, q - 40), q));
  return arg ? { from: b + 1, to: T.s, arg: true, items } : { from: b + 1, to: T.s, group: { s: b, e: z + 1 }, items };
}
export function settingsOf(src, T) {
  const P = settingsPlace(src, T);
  const out = {};
  if (!P) return out;
  const part = src.slice(P.from, P.to);
  for (let i = 0; i < part.length;) {
    const j = part.indexOf('\\', i);
    if (j < 0) break;
    const rest = part.slice(j, j + 200);
    let hit = false;
    for (const [key, x] of Object.entries(SETTING_KEYS)) {
      const m = x.re.exec(rest);
      if (!m) continue;
      const s = P.from + j, e = s + m[0].length;
      const val = key === 'rowcolors' ? m[0].replace(/^\\rowcolors\s*/, '') : key === 'arrayrulecolor' ? (m[1] || '') + '{' + m[2] + '}' : m[1];
      out[key] = { s, e, value: val };
      i = j + m[0].length; hit = true;
      break;
    }
    if (!hit) i = j + 1;
  }
  return out;
}
// Set one setting (value null takes it off): its line before the table, in the float, or else in a
// group made around the table (and taken off again with the last setting). { edits }
export function setSetting(src, T, key, value) {
  const have = settingsOf(src, T), x = have[key], nl = T.eol;
  const P = settingsPlace(src, T);
  const text = value == null ? null : SETTING_KEYS[key].text(value);
  if (x) {
    if (text) return { edits: text === src.slice(x.s, x.e) ? [] : [{ s: x.s, e: x.e, t: text }] };
    // its line goes; the group made for it goes when it was the last
    const ls = src.lastIndexOf('\n', x.s - 1) + 1, le = src.indexOf('\n', x.e);
    const alone = /^[ \t]*$/.test(src.slice(ls, x.s)) && le >= 0 && /^[ \t\r]*$/.test(src.slice(x.e, le));
    // (one Rikuy wrote right before the table, "\\rowcolors{…}" and a line end: both go)
    const edit = alone ? { s: ls, e: le + 1, t: '' } : src.slice(x.e, T.s) === nl ? { s: x.s, e: T.s, t: '' } : { s: x.s, e: x.e, t: '' };
    if (P && P.group && P.items.length === 1) {
      // "{" setting lines, the table, "}": back to the table alone
      return { edits: [{ s: P.group.s, e: T.s, t: '' }, { s: T.e, e: P.group.e, t: '' }] };
    }
    return { edits: [edit] };
  }
  if (!text) return { edits: [] };
  if (P && P.F) {
    // after \centering (or the float's head), on a line of its own, before the table
    const ls = src.lastIndexOf('\n', T.s - 1) + 1;
    if (ls > P.from && /^[ \t]*$/.test(src.slice(ls, T.s))) return { edits: [{ s: ls, e: ls, t: src.slice(ls, T.s) + text + nl }] };
    return { edits: [{ s: T.s, e: T.s, t: text + nl }] };
  }
  if (P && (P.group || P.arg)) return { edits: [{ s: T.s, e: T.s, t: text + nl }] };
  return { edits: [{ s: T.s, e: T.s, t: '{' + text + nl }, { s: T.e, e: T.e, t: '}' }] };
}

// ---- AutoFit and widths ----------------------------------------------------------------------------------
// What the table fits to: 'window' (tabularx, X columns), 'fixed' (every column of a set width),
// 'contents' (l c r)
export function fitOf(src, T) {
  if (T.name === 'tabularx' || T.name === 'xltabular' || T.name === 'tabular*') return 'window';
  const cols = T.spec.cols;
  if (cols.length && cols.every((c) => c.w != null)) return 'fixed';
  return 'contents';
}
// The environment renamed (and its width argument added or taken off): edits at \begin and \end
function renameEnv(src, T, name, width) {
  const edits = [];
  const bm = /^\\begin\s*\{[^}]*\}/.exec(src.slice(T.s, T.s + 40));
  const head = '\\begin{' + name + '}' + (width != null ? '{' + width + '}' : '');
  // (the old width argument goes; [pos] stays)
  let e = T.s + bm[0].length;
  if (T.width) { const wa = T.args[WIDTH_AT[T.name]]; if (wa && wa.s === skipArgSp(src, e, T.specS)) e = wa.e; }
  edits.push({ s: T.s, e, t: head });
  const em = src.slice(T.bodyE, T.e);
  edits.push({ s: T.bodyE, e: T.e, t: em.replace(/\{[^}]*\}/, '{' + name + '}') });
  return edits;
}
// AutoFit: { edits, packages } or { error }. widths: each column's width as written, for 'fixed'
export function autofit(src, T, kind, widths) {
  const cols = T.spec.cols, pieces = specPieces(src, T), pk = new Set();
  if (T.name === 'longtable' && kind === 'window') return { error: 'A table that repeats its header rows breaks across pages as longtable; it fits its contents. Turn Repeat Header Rows off first.' };
  if (T.name === 'array') return { error: 'A table in a formula (array) fits its contents.' };
  if (!pieces) return { edits: [], packages: [] };
  const edits = [];
  cols.forEach((col, c) => {
    const h = colH(src, col), v = colV(col);
    const post = col.post ? src.slice(col.post.s, col.post.e) : '';
    let pre = preDecl(src, col).replace(/\\(centering|raggedleft|raggedright)\b\s*(\\arraybackslash\b\s*)?/g, '');
    let t;
    if (kind === 'contents') t = (pre ? '>{' + pre + '}' : '') + (h === 'j' ? 'l' : h) + post;
    else if (kind === 'window') { const hd = h === 'c' || h === 'r' ? H_DECL[h] + '\\arraybackslash' : ''; t = (hd + pre ? '>{' + hd + pre + '}' : '') + 'X' + post; }
    else {
      const w = (widths && widths[c]) || col.w || '3cm';
      const hd = h === 'c' || h === 'r' ? H_DECL[h] + '\\arraybackslash' : '';
      t = (hd + pre ? '>{' + hd + pre + '}' : '') + { t: 'p', m: 'm', b: 'b' }[v] + '{' + w + '}' + post;
      if (hd || v !== 't') pk.add('array');
    }
    if (/^>\{/.test(t)) pk.add('array');
    pieces[2 * c + 1] = t;
  });
  // X columns only in tabularx: tabular, tabular* and tabulary become one, as wide as they were
  // (tabular*'s \extracolsep{\fill} goes: the X columns take the room)
  const toX = kind === 'window' && !X_ENVS.has(T.name);
  if (T.name === 'tabular*' && (toX || kind !== 'window')) for (let i = 0; i < pieces.length; i += 2) pieces[i] = pieces[i].replace(/@\{\s*\\extracolsep\s*\{\\fill\}\s*\}/g, '').replace(/\\extracolsep\s*\{\\fill\}\s*/g, '');
  edits.push(...specEdit(src, T, pieces));
  if (toX) { edits.push(...renameEnv(src, T, 'tabularx', T.width ? T.width.text : '\\linewidth')); pk.add('tabularx'); }
  if (kind !== 'window' && (T.name === 'tabularx' || T.name === 'tabular*' || T.name === 'tabulary')) edits.push(...renameEnv(src, T, 'tabular', null));
  return { edits: dedupe(edits), packages: [...pk] };
}
const X_ENVS = new Set(['tabularx', 'xltabular']);
// Distribute Columns: the same width for every column (X in tabularx, else the average of widths)
export function distributeCols(src, T, widths) {
  // (a tabular* as wide as the text becomes a tabularx of X columns: X only works there)
  if (fitOf(src, T) === 'window' && !X_ENVS.has(T.name)) return autofit(src, T, 'window');
  if (fitOf(src, T) === 'window') {
    const pieces = specPieces(src, T);
    if (!pieces) return { edits: [], packages: [] };
    T.spec.cols.forEach((col, c) => { if (col.letter !== 'X') pieces[2 * c + 1] = (col.pre ? src.slice(col.pre.s, col.pre.e) : '') + 'X' + (col.post ? src.slice(col.post.s, col.post.e) : ''); });
    return { edits: specEdit(src, T, pieces), packages: [] };
  }
  return autofit(src, T, 'fixed', widths);
}
// Distribute Rows: rows of one height: the lengths after \\ ([2pt]) go
export function distributeRows(src, T) {
  const edits = [];
  for (const row of T.rows) {
    if (row.sepS == null) continue;
    const t = src.slice(row.sepS, row.sepE), m = /^(\\\\\*?|\\tabularnewline)\s*\[[^\]]*\]$/.exec(t);
    if (m) edits.push({ s: row.sepS, e: row.sepE, t: m[1] });
  }
  return { edits };
}

// One column's width: p{width} (its alignment kept as \centering or \raggedleft before it), or
// width null back to l c r
export function setColWidth(src, T, c, width) {
  const col = T.spec.cols[c];
  if (!col) return { edits: [] };
  const pieces = specPieces(src, T), h = colH(src, col), v = colV(col);
  if (!pieces) return { edits: [] };
  const post = col.post ? src.slice(col.post.s, col.post.e) : '';
  let pre = preDecl(src, col).replace(/\\(centering|raggedleft|raggedright)\b\s*(\\arraybackslash\b\s*)?/g, '');
  const pk = [];
  if (width) {
    // (in a *{n}{…} the width written once is every one of its columns': this one is written out)
    if (col.w != null && (col.letter === 'p' || col.letter === 'm' || col.letter === 'b')) {
      if (col.star < 0) return { edits: [{ s: col.ws, e: col.we, t: width }] };
      pieces[2 * c + 1] = src.slice(col.s, col.ws) + width + src.slice(col.we, col.e);
      return { edits: specEdit(src, T, pieces), packages: [] };
    }
    const hd = h === 'c' || h === 'r' ? H_DECL[h] + '\\arraybackslash' : '';
    pieces[2 * c + 1] = (hd + pre ? '>{' + hd + pre + '}' : '') + { t: 'p', m: 'm', b: 'b' }[v] + '{' + width + '}' + post;
    if (hd || pre) pk.push('array');
  } else {
    if (col.w == null) return { edits: [] };
    pieces[2 * c + 1] = (pre ? '>{' + pre + '}' : '') + (h === 'j' ? 'l' : h) + post;
  }
  return { edits: specEdit(src, T, pieces), packages: pk };
}
// The float's alignment of its table: \centering (c), \raggedleft (r), none (l)
export function floatAlign(src, T, a) {
  const F = floatOf(src, T);
  if (!F) return { edits: [] };
  const nl = T.eol;
  const cur = F.centering ? { s: F.centering.s, e: F.centering.e, k: src.slice(F.centering.s, F.centering.e).includes('raggedleft') ? 'r' : 'c' } : null;
  const want = a === 'c' ? '\\centering' : a === 'r' ? '\\raggedleft' : null;
  if (cur && cur.k === a) return { edits: [] };
  if (!cur && !want) return { edits: [] };
  if (cur && want) return { edits: [{ s: cur.s, e: cur.e, t: want }] };
  if (cur) {
    const ls = src.lastIndexOf('\n', cur.s - 1) + 1, le = src.indexOf('\n', cur.e);
    if (/^[ \t]*$/.test(src.slice(ls, cur.s)) && le >= 0 && /^[ \t\r]*$/.test(src.slice(cur.e, le))) return { edits: [{ s: ls, e: le + 1, t: '' }] };
    return { edits: [{ s: cur.s, e: cur.e, t: '' }] };
  }
  const at = F.headE;
  return { edits: [{ s: at, e: at, t: nl + want }] };
}

// ---- text direction ------------------------------------------------------------------------------------------
// a cell's words turned: 0, 90 or 270 (\rotatebox{90}{…}, \rotatebox{270}{…}, also -90)
const TURN = /^\\rotatebox[ \t]*(\[[^\]]{0,40}\])?[ \t]*\{[ \t]*(-?\d{1,4})[ \t]*\}[ \t]*\{/;
export function turnOf(src, c) {
  const s = c.mc ? c.mc.textS : c.ks, e = c.mc ? c.mc.textE : c.ce;
  const t = src.slice(s, e).trim();
  const m = TURN.exec(t.slice(0, 120));
  if (!m || groupEnd(t, m[0].length - 1, t.length) !== t.length) return 0;
  const a = ((+m[2] % 360) + 360) % 360;
  return a === 90 || a === 270 ? a : 0;
}
// Turn the cells' words to angle (0 takes \rotatebox off): { edits, packages }
export function turnCells(src, cells, angle) {
  const edits = [];
  for (const c of cells) {
    if (c.empty) continue;
    const s = c.mc ? c.mc.textS : c.ks, e = c.mc ? c.mc.textE : c.ce;
    const t = src.slice(s, e), lead = t.length - t.trimStart().length, body = t.trim();
    const m = TURN.exec(body.slice(0, 120));
    const had = m && groupEnd(body, m[0].length - 1, body.length) === body.length;
    const words = had ? body.slice(m[0].length, -1) : body;
    const out = angle ? '\\rotatebox{' + angle + '}{' + words + '}' : words;
    if (out !== body) edits.push({ s: s + lead, e: s + lead + body.length, t: out });
  }
  return { edits, packages: angle ? ['graphicx'] : [] };
}

// ---- repeat header rows: longtable --------------------------------------------------------------------------
// Repeat Header Rows on: the table becomes a longtable with \endhead after row r (and the rules
// under it); a table float around it goes, its caption and label going into the longtable (a
// longtable is its own float: it breaks across pages), its settings (\small, \rowcolors,
// \arraystretch …) into a group around it, its alignment into longtable's [l] or [r], and a float
// head other than \begin{table}[h] into a comment after \begin{longtable}, so that off gives it
// back. Off: back to a tabular in a table float, the head of every page (\endfirsthead's) once at
// the top and the foot of the last (\endlastfoot's, else \endfoot's) once at the end. A longtable
// Rikuy wrote and nobody changed since comes back byte for byte (REPEAT_MEMO), and a float Rikuy
// wrote comes back as it was in any case.
const LT_MARKS = new Set(['endhead', 'endfirsthead', 'endfoot', 'endlastfoot']);
const MARK = '% rikuy: ';
const REPEAT_MEMO = new Map();
const memo = (made, was) => { REPEAT_MEMO.set(made, was); if (REPEAT_MEMO.size > 50) REPEAT_MEMO.delete(REPEAT_MEMO.keys().next().value); };
export function repeatHeader(src, T, r, on, o = {}) {
  const nl = T.eol;
  if (on) {
    if (o.twocolumn) return { error: 'In two columns a table cannot run over pages (longtable needs one column): Repeat Header Rows works where the text is in one column.' };
    if (T.name === 'longtable') {
      if (T.headEnd >= 0) return { edits: [] };
      return { edits: endheadEdits(src, T, r, nl) };
    }
    if (T.name !== 'tabular') return { error: 'Repeat Header Rows makes the table a longtable: AutoFit it to its contents first.' };
    const F = floatOf(src, T);
    if (F && !F.only) return { error: 'The float holds more than this table: Repeat Header Rows needs the table on its own.' };
    const spec = src.slice(T.specS, T.specE);
    const [eh] = endheadEdits(src, T, r, nl);
    const body = src.slice(T.bodyS, eh.s) + eh.t + src.slice(eh.s, T.bodyE);
    if (!F) {
      // a table alone: only its environment changes (a comment says it stood alone)
      const text = '\\begin{longtable}{' + spec + '} ' + MARK + 'tabular' + body + '\\end{longtable}';
      memo(text, src.slice(T.s, T.e));
      return { edits: [{ s: T.s, e: T.e, t: text }], packages: ['longtable'], p: T.s };
    }
    // what the float holds besides the table, in order
    const items = [...(settingsOnly(src, F.headE, T.s) || []).map((x) => ({ ...x, above: true })), ...(settingsOnly(src, T.e, F.endS) || []).map((x) => ({ ...x, above: false }))];
    const settings = items.filter((x) => !['centering', 'raggedleft', 'raggedright', 'caption', 'label'].includes(x.name)).map((x) => src.slice(x.s, x.e));
    // (centred by \centering or a center environment: longtable's own; \raggedleft [r]; else [l])
    const align = F.centering ? (src.slice(F.centering.s, F.centering.e).includes('raggedleft') ? '[r]' : '') : F.center ? '' : '[l]';
    // (the head on one line, without its comments: \begin{table} and [htbp] on two lines would
    // put [htbp] in the first cell)
    const head = src.slice(F.s, F.headE).split('\n').map((l) => uncomment(l)[0].trim()).join('');
    // (the float's comments, Rikuy's review comments among them, go with the table: those before
    // it at the start of its body, those after it at the end)
    const comments = (a, z) => { const out = []; for (let p = src.indexOf('%', a); p >= 0 && p < z && out.length < 200; p = src.indexOf('%', p + 1)) { if (src[p - 1] === '\\') continue; const le = src.indexOf('\n', p); const q = le < 0 || le > z ? z : le; out.push(src.slice(p, q).replace(/\r$/, '')); p = q; } return out; };
    const comBefore = comments(F.headE, T.s), comAfter = comments(T.e, F.endS);
    // the caption with the label right after it (the text between kept); a label alone after the table
    let cap = '', label = '';
    if (F.caption) {
      cap = src.slice(F.caption.s, F.caption.e);
      if (F.label && F.label.above === F.caption.above && F.label.s >= F.caption.e && /^\s*$/.test(src.slice(F.caption.e, F.label.s))) cap = src.slice(F.caption.s, F.label.e);
      else if (F.label) label = src.slice(F.label.s, F.label.e);
    } else if (F.label) label = src.slice(F.label.s, F.label.e);
    let text = '\\begin{longtable}' + align + '{' + spec + '}' + (head !== '\\begin{table}[h]' ? ' ' + MARK + head : '');
    if (cap && F.caption.above) text += nl + cap + '\\\\';
    if (comBefore.length) text += nl + comBefore.join(nl);
    let inner = body;
    if (cap && !F.caption.above) inner = inner.replace(/\s*$/, '') + nl + cap + nl;
    if (comAfter.length) inner = inner.replace(/\s*$/, '') + nl + comAfter.join(nl) + nl;
    text += inner + '\\end{longtable}';
    if (settings.length) text = '{' + settings.join(nl) + nl + text + '}';
    if (label) text += nl + label;
    memo(text, src.slice(F.s, F.e));
    return { edits: [{ s: F.s, e: F.e, t: text }], packages: ['longtable'], p: F.s };
  }
  if (T.name !== 'longtable') return { edits: [] };
  // off: the longtable's place (with the group of settings around it and a label after it)
  const P = settingsPlace(src, T);
  const G = P && P.group ? P.group : null;
  let s = G ? G.s : T.s, e = G ? G.e : T.e;
  const lab = /^[ \t]*\r?\n?[ \t]*(\\label\s*\{[^{}\n]{0,400}\})/.exec(src.slice(e, e + 500));
  if (lab) e += lab[0].length;
  const was = REPEAT_MEMO.get(src.slice(s, e));
  if (was != null) return { edits: [{ s, e, t: was }], packages: [], p: s };
  // the comment after \begin{longtable}{…}: how it stood before
  const mk = new RegExp('^[ \\t]*' + MARK.replace(/ /g, '[ \\t]*') + '([^\\r\\n]*)').exec(src.slice(T.specE + 1, T.specE + 400));
  const before = mk ? mk[1].trim() : null;
  const markEnd = mk ? T.specE + 1 + mk[0].length : -1;
  // the caption out of its row, then the parts: the head of the first page, the body, the foot of the last
  const edits = [];
  if (mk) edits.push({ s: T.specE + 1, e: markEnd, t: '' });
  const capRow = T.rows.findIndex((x) => x.kind === 'caption');
  let cap = '', above = false;
  if (capRow >= 0) {
    const row = T.rows[capRow];
    cap = src.slice(row.cells[0].cs, row.cells[0].ce);
    above = T.rows.slice(0, capRow).every((x) => x.kind !== 'row');
    // (the rules before it stay: \bottomrule before a caption at the end; and a comment after it)
    let ce = row.sepE != null ? row.sepE : row.cells[0].ce;
    const le = src.indexOf('\n', ce);
    if (le >= 0 && /^[ \t\r]*$/.test(src.slice(ce, le)) && (above || row.sepS != null)) ce = le;
    edits.push({ s: row.leadE, e: ce, t: '' });
  }
  const marks = [];
  for (const lead of [...T.rows.map((x) => x.lead), T.tail.lead]) for (const x of lead) if (LT_MARKS.has(x.name)) marks.push(x);
  marks.sort((x, y) => x.s - y.s);
  // each part: the text from the end of the mark before to its own mark
  const parts = {};
  let from = T.bodyS;
  for (const x of marks) { parts[x.name] = [from, x.s]; from = x.e; }
  const bodyPart = [from, T.bodyE];
  const textOf = ([a, z]) => {
    // (the caption and the comment cut out of the part's text)
    const cut = edits.filter((x) => x.s >= a && x.e <= z).sort((x, y) => x.s - y.s);
    let t = '', p = a;
    for (const x of cut) { t += src.slice(p, x.s); p = x.e; }
    return t + src.slice(p, z);
  };
  const pick = [parts.endfirsthead || parts.endhead, bodyPart, parts.endlastfoot || parts.endfoot].filter(Boolean).map(textOf).filter((t) => t.trim());
  let inner = '';
  for (const t of pick) inner += inner ? nl + t.replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '') : t.replace(/\s+$/, '');
  const spec = src.slice(T.specS, T.specE);
  const tab = '\\begin{tabular}{' + spec + '}' + inner.replace(/^(?![ \t]*\r?\n)/, nl) + nl + '\\end{tabular}';
  if (before === 'tabular') return { edits: [{ s: T.s, e: T.e, t: tab }], packages: [], p: T.s };
  // the float: its head, the alignment, the settings of the group, the caption and the label
  const pos = T.args[0] && T.args[0].kind === 'o' ? src.slice(T.args[0].is, T.args[0].ie).trim() : '';
  const alignLine = pos === 'l' ? [] : pos === 'r' ? ['\\raggedleft'] : ['\\centering'];
  const sets = G ? (settingsOnly(src, G.s + 1, T.s) || []).map((x) => src.slice(x.s, x.e)) : [];
  const head = before && /^\\begin\s*\{(table\*?|sidewaystable|wraptable)\}/.test(before) ? before : '\\begin{table}[h]';
  const lines = [head, ...alignLine, ...sets, ...(cap && above ? [cap] : []), tab, ...(cap && !above ? [cap] : []), ...(lab ? [lab[1]] : []), '\\end{' + /^\\begin\s*\{([^}]*)\}/.exec(head)[1] + '}'];
  return { edits: [{ s, e, t: lines.join(nl) }], packages: [], p: s };
}
function endheadEdits(src, T, r, nl) {
  // after the rules under row r: \endhead on a line of its own
  const nx = T.rows[r + 1];
  const at = nx ? nx.leadE : T.tail.lead.length ? T.tail.lead[T.tail.lead.length - 1].e : T.rows[r].e;
  return [{ s: at, e: at, t: nl + '\\endhead' }];
}
// whether the table's head repeats: a longtable with \endhead (or \endfirsthead)
export const repeats = (T) => T.name === 'longtable' && T.headEnd >= 0;

// ---- a caption ----------------------------------------------------------------------------------------------
// Where the table's caption is or goes: { p } at its words, or { edits, p } that add one: under
// the table in its float, or a table float made around a table that stands alone
export function captionEdits(src, T) {
  const nl = T.eol;
  if (T.name === 'longtable') {
    const cap = T.rows.find((x) => x.kind === 'caption');
    if (cap) { const c = cap.cells[0]; const i = src.indexOf('{', c.cs); return { p: i + 1 }; }
    const at = T.bodyS, t = nl + '\\caption{}\\\\';
    return { edits: [{ s: at, e: at, t }], p: at + nl.length + 9 };
  }
  const F = floatOf(src, T);
  if (F && F.caption) return { p: F.caption.is };
  if (F) { const t = nl + '\\caption{}'; return { edits: [{ s: T.e, e: T.e, t }], p: T.e + t.length - 1 }; }
  if (T.name === 'array') return { error: 'A table in a formula has no caption.' };
  // in a minipage or a subtable: the caption goes in it (\caption in a float's, \captionof{table}
  // outside one, caption's), never a float in it: a float in a minipage is "Not in outer par mode"
  const box = boxAround(src, T);
  if (box && box.caption) return { p: box.caption.is };
  if (box) {
    const inFloat = box.inFloat || box.name === 'subtable';
    const t = nl + (inFloat ? '\\caption{}' : '\\captionof{table}{}');
    return { edits: [{ s: T.e, e: T.e, t }], p: T.e + t.length - 1, packages: inFloat ? [] : ['caption'] };
  }
  const open = '\\begin{table}[h]' + nl + '\\centering' + nl, close = nl + '\\caption{}' + nl + '\\end{table}';
  return { edits: [{ s: T.s, e: T.s, t: open }, { s: T.e, e: T.e, t: close }], p: T.e + open.length + nl.length + 9 };
}

// The minipage or subtable (subcaption's) the table stands in, past a center around it: { name,
// inFloat (a table or figure float around that), caption: { is } (one it holds already) } or
// null. The \begin and \end before the table are counted, at most 20 000 characters back,
// comments blanked first (a "% \begin{minipage}" opens nothing).
const blankComments = (t) => t.replace(/(^|[^\\])(%[^\n]*)/g, (m, a, c) => a + ' '.repeat(c.length));
function boxAround(src, T) {
  const from = Math.max(0, T.s - 20000), text = blankComments(src.slice(from, T.s)), re = /\\(begin|end)\s*\{([A-Za-z]+\*?)\}/g;
  const open = [];
  for (let m, n = 0; (m = re.exec(text)) && n < 4000; n++) {
    if (m[1] === 'begin') open.push({ name: m[2], at: from + m.index + m[0].length });
    else { let k = -1; for (let j = open.length - 1; j >= 0; j--) if (open[j].name === m[2]) { k = j; break; } if (k >= 0) open.length = k; }
  }
  let i = open.length - 1;
  while (i >= 0 && ['center', 'adjustbox', 'threeparttable', 'small', 'footnotesize'].includes(open[i].name)) i--;
  if (i < 0 || !['minipage', 'subtable', 'subfigure'].includes(open[i].name)) return null;
  const box = open[i];
  // (its own \end, past the table, and a caption already in it)
  const after = blankComments(src.slice(T.e, Math.min(src.length, T.e + 20000)));
  const endRe = new RegExp('\\\\(begin|end)\\s*\\{' + box.name + '\\}', 'g');
  let d = 0, endAt = -1;
  for (let m, n = 0; (m = endRe.exec(after)) && n < 200; n++) { if (m[1] === 'begin') d++; else if (d-- === 0) { endAt = T.e + m.index; break; } }
  let caption = null;
  for (const [a0, z0, t0] of [[box.at, T.s, blankComments(src.slice(box.at, T.s))], [T.e, endAt, endAt < 0 ? '' : after.slice(0, endAt - T.e)]]) {
    const m = /\\caption(?:of\s*\{[^{}]*\})?\s*(\[[^\]]*\])?\s*\{/.exec(t0);
    if (m && !caption) caption = { is: a0 + m.index + m[0].length };
  }
  return { name: box.name, inFloat: open.slice(0, i).some((x) => /^(table|figure|sidewaystable|sidewaysfigure|wraptable|wrapfigure)\*?$/.test(x.name)), caption };
}

// ---- deleting cells ----------------------------------------------------------------------------------------------
// Delete Cells, shifting the cells to their right left (an empty cell at the row's end) or the
// cells under them up (empty cells in the last rows). { edits } or { error }
export function deleteCells(src, T, rect, how) {
  const { r0, r1, c0, c1 } = rect, edits = [];
  const data = T.rows.map((r, k) => k).filter((k) => T.rows[k].kind === 'row');
  for (const k of data) for (const c of T.rows[k].cells) if (c.span > 1 || c.mr) { if ((how === 'left' && k >= r0 && k <= r1) || (how === 'up' && c.col + c.span - 1 >= c0 && c.col <= c1 && k >= r0)) return { error: 'Merged cells are in the way: split them first.' }; }
  if (how === 'left') {
    for (let r = r0; r <= r1; r++) {
      const row = T.rows[r];
      if (row.kind !== 'row') continue;
      const words = row.cells.map((c) => (c.empty ? '' : src.slice(c.ks, c.ce)));
      const n = Math.min(c1, words.length - 1) - c0 + 1;
      const next = [...words.slice(0, c0), ...words.slice(c0 + n), ...Array(n).fill('')];
      row.cells.forEach((c, k) => { if (next[k] !== words[k]) edits.push({ s: c.ks, e: c.empty ? c.ks : c.ce, t: next[k] }); });
    }
    return { edits };
  }
  const rows = data.filter((k) => k >= r0);
  const h = data.filter((k) => k >= r0 && k <= r1).length;
  for (let col = c0; col <= c1; col++) {
    const cells = rows.map((k) => cellOfCol(T.rows[k], col)).map((x) => x && x.cell);
    const words = cells.map((c) => (c && !c.empty ? src.slice(c.ks, c.ce) : ''));
    const next = [...words.slice(h), ...Array(Math.min(h, words.length)).fill('')];
    cells.forEach((c, k) => { if (c && next[k] !== words[k]) edits.push({ s: c.ks, e: c.empty ? c.ks : c.ce, t: next[k] }); });
  }
  return { edits: edits.sort((a, b) => a.s - b.s) };
}
