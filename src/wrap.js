// Inline wrappers as edits: \textbf{…}, \emph{…}, \textcolor{red}{…}, \hl[green]{…} put around
// a selection, taken off, given a new argument, split around part of what they hold, and every one
// of a kind cleared. Hand written forms count as the same: {\bfseries …} and {\bf …} are bold as
// \textbf{…} is (GROUPS, which a batch extends with defineGroup), and taking bold off takes off
// whichever of them is there, its bytes exactly. The page finds the wrapper the caret is in from
// the model (styOfEl in src/editor.js); enclosing() finds it in the text alone, for the edits a
// command makes without the page. Pure functions on a string; test/wrap.test.mjs.
//
// A wrapper found in the text is { s, e, is, ie, cmd, opt, args, decl }: [s, e) all of it, [is, ie)
// what it holds; cmd its command or declaration; opt the [option] and args the leading {arguments}
// as text; decl true for the {\bfseries …} form. A wrapper to write is { cmd, opt, args }.

import { isBalanced } from './parser.js';
import { sourceEdge, endsWithControlWord } from './editor.js';

// The kinds of inline formatting and the forms each is written in. write is what a control writes.
export const GROUPS = {
  bold: { write: 'textbf', cmds: ['textbf'], decls: ['bfseries', 'bf'] },
  italic: { write: 'emph', cmds: ['emph', 'textit'], decls: ['itshape', 'it'] },
  underline: { write: 'underline', cmds: ['underline', 'uline'], decls: [] },
  mono: { write: 'texttt', cmds: ['texttt'], decls: ['ttfamily', 'tt'] }
};
export function defineGroup(name, spec) { GROUPS[name] = { cmds: [], decls: [], ...spec }; }
export const groupNames = (g) => (GROUPS[g] ? [...GROUPS[g].cmds, ...GROUPS[g].decls] : [g]);
export function groupOf(cmd) {
  for (const [g, s] of Object.entries(GROUPS)) if (s.cmds.includes(cmd) || s.decls.includes(cmd)) return g;
  return null;
}

// How many braced arguments come before what a command holds (\textcolor{red}{…}: one)
export const LEAD = { textcolor: 1, colorbox: 1, fcolorbox: 2, foreignlanguage: 1, raisebox: 1, scalebox: 1, rotatebox: 1, textls: 0, hl: 0 };

export function opener(w) {
  return '\\' + w.cmd + (w.opt != null && w.opt !== '' ? '[' + w.opt + ']' : '') + (w.args || []).map((a) => '{' + a + '}').join('') + '{';
}

const MAXSCAN = 20000;
// the end of the group that opens at i ({ or [), past its closing one, or -1; escaped braces and
// comments are not counted
export function closeOf(t, i) {
  const open = t[i], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let k = i, z = Math.min(t.length, i + MAXSCAN); k < z; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === '%') { const n = t.indexOf('\n', k); if (n < 0) return -1; k = n; continue; }
    if (open === '[' && c === '{') { const e = closeOf(t, k); if (e < 0) return -1; k = e - 1; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return k + 1;
  }
  return -1;
}
const ws = (t, i) => { while (i < t.length && (t[i] === ' ' || t[i] === '\t' || (t[i] === '\n' && t[i + 1] !== '\n'))) i++; return i; };

// The wrapper that starts at s: \cmd[opt]{arg}…{body} or {\decl body}, or null; want (a Set of
// names) leaves out every other before its end is looked for, which is what costs; ends (a Map
// from where a group opens to its end) the ends a caller found already
export function parseAt(src, s, want, ends) {
  const end = (i) => (ends && ends.has(i) ? ends.get(i) : closeOf(src, i));
  if (src[s] === '{') {
    const m = /^\{\\([A-Za-z]+)(?![A-Za-z])[ \t]*\n?[ \t]*/.exec(src.slice(s, s + 80));
    if (!m || (want && !want.has(m[1]))) return null;
    const e = end(s);
    if (e < 0) return null;
    return { s, e, is: s + m[0].length, ie: e - 1, cmd: m[1], opt: null, args: [], decl: true };
  }
  const m = /^\\([A-Za-z]+)(?![A-Za-z])/.exec(src.slice(s, s + 80));
  if (!m || (want && !want.has(m[1]))) return null;
  let i = ws(src, s + m[0].length), opt = null;
  const args = [];
  if (src[i] === '[') { const z = closeOf(src, i); if (z < 0) return null; opt = src.slice(i + 1, z - 1); i = ws(src, z); }
  for (let n = LEAD[m[1]] || 0; n > 0; n--) {
    if (src[i] !== '{') return null;
    const z = closeOf(src, i);
    if (z < 0) return null;
    args.push(src.slice(i + 1, z - 1));
    i = ws(src, z);
  }
  if (src[i] !== '{') return null;
  const e = end(i);
  if (e < 0) return null;
  return { s, e, is: i + 1, ie: e - 1, cmd: m[1], opt, args, decl: false };
}

// whether the character at k is escaped (an odd number of backslashes before it)
const escaped = (t, k) => { let n = 0; while (k - 1 - n >= 0 && t[k - 1 - n] === '\\') n++; return n % 2 === 1; };

// What of [from, to) no brace counts in: 1 for a comment's characters, 2 for an escaped one. Read
// forward from the start of from's line, so a % earlier on that line is seen; a brace in a comment
// (%\textbf{ above a footnote's words) took the footnote's own } as its end.
function marks(t, from, to) {
  let ls = t.lastIndexOf('\n', from - 1) + 1;
  if (from - ls > MAXSCAN) ls = from;
  const m = new Uint8Array(Math.max(0, to - from));
  let inC = false;
  for (let k = ls; k < to; k++) {
    const c = t[k];
    if (c === '\n') { inC = false; continue; }
    if (inC) { if (k >= from) m[k - from] = 1; continue; }
    if (c === '\\') { if (k + 1 >= from && k + 1 < to) m[k + 1 - from] = 2; k++; continue; }
    if (c === '%') { inC = true; if (k >= from) m[k - from] = 1; }
  }
  return m;
}

// the { that the } (or [ that the ]) at k closes, looking back, or -1; comments and escaped
// braces left out
function openOf(t, k, stop, m) {
  let d = 0;
  for (let j = k; j >= stop; j--) {
    const c = t[j];
    if ((c !== '{' && c !== '}' && c !== '[' && c !== ']') || m[j - stop]) continue;
    if (c === '}' || c === ']') d++;
    else if (--d === 0) return j;
  }
  return -1;
}

// The unmatched { before a, the nearest first (400 at most), with what is a comment or escaped
// there: one walk back for each place, kept for the next call (the ribbon asks three times, for
// bold, italic and underline, at every move of the caret)
let lastScan = null;
function unmatchedBefore(src, a) {
  if (lastScan && lastScan.src === src && lastScan.a === a) return lastScan;
  const stop = Math.max(0, a - MAXSCAN), m = marks(src, stop, a), out = [];
  let d = 0;
  for (let k = a - 1; k >= stop && out.length < 400; k--) {
    const c = src[k];
    if ((c !== '{' && c !== '}') || m[k - stop]) continue;
    if (c === '}') { d++; continue; }
    if (d > 0) { d--; continue; }
    out.push(k);
  }
  lastScan = { src, a, stop, m, open: out, closes: null };
  return lastScan;
}
// The ends of those groups, in the same order, from one walk forward from a: the nearest
// unmatched } closes the nearest {, and so on (a group whose end is not there, none further out
// has one either). Each group was looked for alone before: 4000 nested {\bf took 40 ms a look.
function closesAfter(src, a, n) {
  const out = [];
  let ls = src.lastIndexOf('\n', a - 1) + 1, d = 0, inC = false;
  if (a - ls > MAXSCAN) ls = a;
  for (let k = ls, z = Math.min(src.length, a + MAXSCAN); k < z && out.length < n; k++) {
    const c = src[k];
    if (c === '\n') { inC = false; continue; }
    if (inC) continue;
    if (c === '\\') { k++; continue; }
    if (c === '%') { inC = true; continue; }
    if (k < a) continue;
    if (c === '{') d++;
    else if (c === '}') { if (d > 0) d--; else out.push(k + 1); }
  }
  return out;
}

// The innermost wrapper of one of these commands or declarations that holds [a, b), or null.
// (Only one of the names asked for has its end looked for, which is what costs.)
export function enclosing(src, a, b, names) {
  const want = new Set(names);
  const scan = unmatchedBefore(src, a), { stop, m, open } = scan;
  if (!scan.closes) scan.closes = closesAfter(src, a, open.length);
  for (let i = 0; i < open.length; i++) {
    // an unmatched { before a: a group with a declaration, or the body of a wrapper (no end, or
    // one further than a group is read: none further out has one)
    const k = open[i], e = scan.closes[i];
    if (e == null || e - k > MAXSCAN) break;
    const ends = new Map([[k, e]]);
    let W = parseAt(src, k, want, ends);
    if (W && W.decl && W.ie >= b) return W;
    // walk back over the arguments to the command
    let j = k - 1;
    while (j >= stop && /[ \t\n]/.test(src[j])) j--;
    while (j >= stop && (src[j] === '}' || src[j] === ']') && !m[j - stop]) {
      const o = openOf(src, j, stop, m);
      if (o < 0) break;
      j = o - 1;
      while (j >= stop && /[ \t\n]/.test(src[j])) j--;
    }
    const cm = /\\([A-Za-z]+)$/.exec(src.slice(Math.max(stop, j - 60), j + 1));
    if (cm && want.has(cm[1]) && !m[j + 1 - cm[0].length - stop]) {
      W = parseAt(src, j + 1 - cm[0].length, want, ends);
      if (W && !W.decl && W.is === k + 1 && W.ie >= b) return W;
    }
  }
  return null;
}

// Every wrapper of these names that lies wholly inside [a, b), outermost first (2000 at most)
export function wrappersIn(src, a, b, names) {
  const want = new Set(names), out = [], ends = endsIn(src, a, b);
  for (let k = a; k < b && out.length < 2000; k++) {
    const c = src[k];
    if (c === '%' && !escaped(src, k)) { const n = src.indexOf('\n', k); if (n < 0) break; k = n; continue; }
    if ((c !== '\\' && c !== '{') || (c === '\\' && escaped(src, k)) || (c === '{' && escaped(src, k))) { continue; }
    const W = parseAt(src, k, want, ends);
    if (W && W.e <= b) { out.push(W); continue; }
    if (c === '\\') k++;
  }
  return out;
}

// The end of every group that opens and closes in [a, b), from one walk: a group with none there
// has none (-1) for wrappersIn. Each was looked for alone before: 3000 nested took 0.3 s.
function endsIn(src, a, b) {
  const ends = new Map(), st = [];
  let ls = src.lastIndexOf('\n', a - 1) + 1, inC = false;
  if (a - ls > MAXSCAN) ls = a;
  for (let k = ls; k < b; k++) {
    const c = src[k];
    if (c === '\n') { inC = false; continue; }
    if (inC) continue;
    if (c === '\\') { k++; continue; }
    if (c === '%') { inC = true; continue; }
    if (k < a) continue;
    if (c === '{') st.push(k);
    else if (c === '}' && st.length) { const o = st.pop(); if (k + 1 - o <= MAXSCAN) ends.set(o, k + 1); }
  }
  return { has: () => true, get: (i) => ends.get(i) ?? -1 };
}

// a position in a text before edits, in the text after them
export function mapPos(edits, p, bias = -1) {
  let q = p;
  for (const x of edits) {
    if (x.e < p || (x.e === p && (x.s < p || bias > 0))) q += x.t.length - (x.e - x.s);
    else if (x.s < p && x.e > p) q += x.s + x.t.length - p;
  }
  return q;
}
// one edit from a text to another: what lies between their common start and end
export function diffEdit(a, b) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let z = 0;
  while (z < a.length - s && z < b.length - s && a[a.length - 1 - z] === b[b.length - 1 - z]) z++;
  return s === a.length && s === b.length ? null : { s, e: a.length - z, t: b.slice(s, b.length - z) };
}

// The edits that put [a, b) in the wrapper w. An empty selection gets the empty wrapper and the
// caret between its braces. A selection that starts or ends inside what a reader takes for one
// character (क्षि is four code points) takes that character whole; one that crosses structure
// (a brace, an environment) is refused: { error }. Over several paragraphs each paragraph's part
// gets a wrapper of its own: one around all of them would take the blank lines into its braces,
// which TeX refuses ("Paragraph ended before \textbf was complete").
// Returns { edits, p, bias, sel: { a, b } or null } in the text after the edits.
export function wrapEdits(src, a, b, w) {
  const open = typeof w === 'string' ? w : opener(w);
  if (a === b) return { edits: [{ s: a, e: a, t: open + '}' }], p: a + open.length, bias: 1, sel: null };
  a = sourceEdge(src, a, -1);
  b = sourceEdge(src, b, 1);
  if (!isBalanced(src, a, b)) return { error: 'crosses' };
  const parts = [];
  for (let p = a, m, re = /\n[ \t]*\n\s*/g; p < b;) {
    re.lastIndex = p;
    m = re.exec(src);
    const e = m && m.index < b ? m.index : b;
    if (e > p && src.slice(p, e).trim()) parts.push([p, e]);
    p = m && m.index < b ? m.index + m[0].length : b;
  }
  if (parts.length > 1) {
    if (parts.some(([s, e]) => !isBalanced(src, s, e))) return { error: 'crosses' };
    const edits = [];
    for (const [s, e] of parts) edits.push({ s: e, e, t: '}' }, { s, e: s, t: open });
    const grown = parts.length * (open.length + 1);
    return { edits: edits.reverse(), p: b + grown, bias: -1, sel: { a: a + open.length, b: b + grown - 1 } };
  }
  return { edits: [{ s: b, e: b, t: '}' }, { s: a, e: a, t: open }], p: b + open.length, bias: -1, sel: { a: a + open.length, b: b + open.length } };
}

// Whether a group {\bf …} stands free, so its braces may go with the declaration: after a
// space or the start of a line, with no command before those spaces (\section {\bf x}, the
// group is its argument) and no other declaration or command at the group's own level (\large,
// \it, \color{red} would reach past it). Anywhere else (\noindent{\bf …}, \textcolor{red}{\bf …},
// \item[{\bf …}], \multicolumn{2}{c}{\bf …}) the braces stay and only the declaration goes.
export function standsFree(src, W) {
  if (!W.decl) return true;
  let k = W.s - 1;
  if (k >= 0 && !/\s/.test(src[k])) return false;
  while (k >= 0 && /\s/.test(src[k])) k--;
  if (k >= 0 && /\\(?:[A-Za-z@]+|[^A-Za-z@\s])$/.test(src.slice(Math.max(0, k - 60), k + 1)) && !(src[k] === '\\' && escaped(src, k))) return false;
  return !holdsDecl(src, W);
}
// a command or a comment at the group's own level in what it holds (past 4000 characters it is
// taken to: braces kept are harmless, and a thousand groups nested took a second to read)
function holdsDecl(src, W) {
  if (W.ie - W.is > 4000) return true;
  for (let i = W.is, d = 0; i < W.ie; i++) {
    const c = src[i];
    if (c === '\\') { if (d === 0 && /[A-Za-z@]/.test(src[i + 1] || '')) return true; i++; continue; }
    if (c === '%') return true;
    if (c === '{') d++; else if (c === '}') d--;
  }
  return false;
}
// What stands where a wrapper's opening went and where its end went, so the words do not run into
// a command: \noindent\textbf{Proof.} off is \noindent Proof., not \noindentProof.; a command at
// the end of what it held keeps {} before a letter after it (\LaTeX{}ing).
function seams(src, s, is, ie, e) {
  const first = src[is] || '', last = endsWithControlWord(src, ie), next = src[e] || '';
  const pre = endsWithControlWord(src, s) ? (/[A-Za-z]/.test(first) ? ' ' : /[[*]/.test(first) ? '{}' : '') : '';
  return { pre, post: last && /[A-Za-z]/.test(next) ? '{}' : '' };
}

// The edits that take a wrapper off, leaving what it holds byte for byte. A group {\bf …} loses
// its braces only where it stands free (standsFree); elsewhere \bf alone goes.
export function unwrapEdits(src, W) {
  if (W.decl && !standsFree(src, W)) return [{ s: W.s + 1, e: W.is, t: '' }];
  const { pre, post } = seams(src, W.s, W.is, W.ie, W.e);
  return [{ s: W.ie, e: W.e, t: post }, { s: W.s, e: W.is, t: pre }];
}

// The edits that give a wrapper another command or argument: \textcolor{red}{x} to
// \textcolor{blue}{x}, \hl{x} to \hl[green]{x}, {\bf x} to \textbf{x}; what it holds stays
export function rewrapEdits(src, W, w) {
  const open = opener(w);
  return src.slice(W.s, W.is) === open ? [] : [{ s: W.s, e: W.is, t: open }];
}

// The wrapper W taken off [a, b) alone: \textbf{abc} with b selected becomes \textbf{a}b\textbf{c},
// {\bf abc} becomes {\bf a}b{\bf c}. null when the parts on either side are not whole (a brace
// opened before a and closed after it).
export function splitText(src, W, a, b) {
  a = Math.max(a, W.is); b = Math.min(b, W.ie);
  if (!isBalanced(src, W.is, a) || !isBalanced(src, b, W.ie)) return null;
  // all of it: the wrapper comes off as unwrapEdits takes it off
  if (a === W.is && b === W.ie) { const edits = unwrapEdits(src, W); return { text: applyAll(src, edits), a: mapPos(edits, a), b: mapPos(edits, b) }; }
  // (a group whose declarations reach past the part taken out would carry them with it: refused;
  // one that is an argument stays one group: \textcolor{red}{{\bf a}b{\bf c}})
  if (W.decl && holdsDecl(src, W)) return null;
  const keep = W.decl && !standsFree(src, W);
  const open = src.slice(W.s, W.is), close = src.slice(W.ie, W.e);
  const left = src.slice(W.is, a), mid = src.slice(a, b), right = src.slice(b, W.ie);
  const seam = seams(src, W.s, a, b, W.e);
  const pre = left || keep ? '' : seam.pre, post = right || keep ? '' : seam.post;
  const out = (keep ? '{' : '') + (left ? open + left + close : pre) + mid + post + (right ? open + right + close : '') + (keep ? '}' : '');
  const a2 = W.s + (keep ? 1 : 0) + (left ? open.length + left.length + close.length : pre.length);
  return { text: src.slice(0, W.s) + out + src.slice(W.e), a: a2, b: a2 + mid.length };
}
// (in one pass: one slice of the whole text for each edit took 0.5 s for 20 000 wrappers; two at
// one place go in the order the slices gave them, the later first)
const applyAll = (t, edits) => {
  const xs = edits.map((x, i) => [x, i]).sort(([u, i], [v, j]) => u.s - v.s || j - i);
  let out = '', at = 0;
  for (const [x] of xs) { out += t.slice(at, Math.max(at, x.s)) + x.t; at = Math.max(at, x.e); }
  return out + t.slice(at);
};

// Every wrapper of these names taken off [a, b): those inside it, and those around it split
// around it. { text, a, b, edits } (one edit, from the first change to the last), or null when
// there is none.
export function clearText(src, a, b, names) {
  let t = src;
  // those inside it, all at once (their braces never overlap: one holds the other or neither)
  const inside = wrappersIn(t, a, b, names);
  if (inside.length) {
    const edits = inside.flatMap((W) => unwrapEdits(t, W));
    b = mapPos(edits, b, 1);
    t = applyAll(t, edits);
  }
  // those around it, the innermost first
  for (let n = 0; n < 200; n++) {
    const W = enclosing(t, a, b, names);
    const r = W && splitText(t, W, a, b);
    if (!r) break;
    t = r.text; a = r.a; b = r.b;
  }
  if (t === src) return null;
  const d = diffEdit(src, t);
  return { text: t, a, b, edits: d ? [d] : [] };
}

// Bold on or off for [a, b), as the B button does: W is the wrapper of the group around the
// caret if there is one (from the page, or enclosing()). Inside it (or a caret in it) it comes
// off whole; elsewhere the selection gets the group's own command.
export function toggleEdits(src, a, b, group, W) {
  if (W && (a === b || (a >= W.is && b <= W.ie))) {
    const edits = unwrapEdits(src, W);
    return { edits, p: mapPos(edits, a), bias: -1, sel: a === b ? null : { a: mapPos(edits, a), b: mapPos(edits, b) }, off: true };
  }
  return wrapEdits(src, a, b, { cmd: (GROUPS[group] || { write: group }).write });
}
