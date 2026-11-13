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
import { sourceEdge } from './editor.js';

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
// names) leaves out every other before its end is looked for, which is what costs
export function parseAt(src, s, want) {
  if (src[s] === '{') {
    const m = /^\{\\([A-Za-z]+)(?![A-Za-z])[ \t]*\n?[ \t]*/.exec(src.slice(s, s + 80));
    if (!m || (want && !want.has(m[1]))) return null;
    const e = closeOf(src, s);
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
  const e = closeOf(src, i);
  if (e < 0) return null;
  return { s, e, is: i + 1, ie: e - 1, cmd: m[1], opt, args, decl: false };
}

// whether the character at k is escaped (an odd number of backslashes before it)
const escaped = (t, k) => { let n = 0; while (k - 1 - n >= 0 && t[k - 1 - n] === '\\') n++; return n % 2 === 1; };
// the { that the } at k closes, looking back, or -1
function openOf(t, k, stop) {
  let d = 0;
  for (let j = k; j >= stop; j--) {
    const c = t[j];
    if ((c !== '{' && c !== '}' && c !== '[' && c !== ']') || escaped(t, j)) continue;
    if (c === '}' || c === ']') d++;
    else if (--d === 0) return j;
  }
  return -1;
}

// The innermost wrapper of one of these commands or declarations that holds [a, b), or null.
// (The ribbon asks at every move of the caret: the groups looked at are bounded, 400 deep, and
// only one of the names asked for has its end looked for.)
export function enclosing(src, a, b, names) {
  const want = new Set(names);
  const stop = Math.max(0, a - MAXSCAN);
  let d = 0, tried = 0;
  for (let k = a - 1; k >= stop; k--) {
    const c = src[k];
    if ((c !== '{' && c !== '}') || escaped(src, k)) continue;
    if (c === '}') { d++; continue; }
    if (d > 0) { d--; continue; }
    if (++tried > 400) return null;
    // an unmatched { before a: the body of a wrapper, or a group with a declaration
    let W = parseAt(src, k, want);
    if (W && W.decl && W.ie >= b) return W;
    // walk back over the arguments to the command
    let j = k - 1;
    while (j >= stop && /[ \t\n]/.test(src[j])) j--;
    while (j >= stop && (src[j] === '}' || src[j] === ']') && !escaped(src, j)) {
      const o = openOf(src, j, stop);
      if (o < 0) break;
      j = o - 1;
      while (j >= stop && /[ \t\n]/.test(src[j])) j--;
    }
    const m = /\\([A-Za-z]+)$/.exec(src.slice(Math.max(stop, j - 60), j + 1));
    if (m && want.has(m[1])) {
      W = parseAt(src, j + 1 - m[0].length, want);
      if (W && !W.decl && W.is === k + 1 && W.ie >= b) return W;
    }
  }
  return null;
}

// Every wrapper of these names that lies wholly inside [a, b), outermost first (2000 at most)
export function wrappersIn(src, a, b, names) {
  const want = new Set(names), out = [];
  for (let k = a; k < b && out.length < 2000; k++) {
    const c = src[k];
    if (c === '%' && !escaped(src, k)) { const n = src.indexOf('\n', k); if (n < 0) break; k = n; continue; }
    if ((c !== '\\' && c !== '{') || (c === '\\' && escaped(src, k)) || (c === '{' && escaped(src, k))) { continue; }
    const W = parseAt(src, k, want);
    if (W && W.e <= b) { out.push(W); continue; }
    if (c === '\\') k++;
  }
  return out;
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

// The edits that take a wrapper off, leaving what it holds byte for byte
export function unwrapEdits(src, W) {
  return [{ s: W.ie, e: W.e, t: '' }, { s: W.s, e: W.is, t: '' }];
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
  const open = src.slice(W.s, W.is), close = src.slice(W.ie, W.e);
  const left = src.slice(W.is, a), mid = src.slice(a, b), right = src.slice(b, W.ie);
  const out = (left ? open + left + close : '') + mid + (right ? open + right + close : '');
  const a2 = W.s + (left ? open.length + left.length + close.length : 0);
  return { text: src.slice(0, W.s) + out + src.slice(W.e), a: a2, b: a2 + mid.length };
}

// Every wrapper of these names taken off [a, b): those inside it, and those around it split
// around it. { text, a, b, edits } (one edit, from the first change to the last), or null when
// there is none.
export function clearText(src, a, b, names) {
  let t = src;
  // those inside it, all at once (their braces never overlap: one holds the other or neither)
  const inside = wrappersIn(t, a, b, names);
  if (inside.length) {
    const edits = inside.flatMap((W) => unwrapEdits(t, W)).sort((x, y) => y.s - x.s);
    for (const x of edits) t = t.slice(0, x.s) + x.t + t.slice(x.e);
    b -= inside.reduce((n, W) => n + (W.is - W.s) + (W.e - W.ie), 0);
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
    const shift = W.is - W.s;
    return { edits: unwrapEdits(src, W), p: a - shift, bias: -1, sel: a === b ? null : { a: a - shift, b: b - shift }, off: true };
  }
  return wrapEdits(src, a, b, { cmd: (GROUPS[group] || { write: group }).write });
}
