// Paragraphs as edits of the source (batch B2): alignment, line spacing, indents, the space
// before and after, keeping with the next one, page breaks, shading and borders, and the
// document's own paragraph settings (setspace, parskip, \parindent, widows and orphans). Every
// function reads the text it is given and returns edits [{s, e, t}] on it, or a reason it cannot
// ({ why }); src/cmd/para.js commits them. Pure, so test/para.test.mjs checks them on strings.
//
// A paragraph is what the page's model says it is (Builder.flow in src/model.js gives each one
// its source range, ps and pe). Around it the source may hold what belongs to it alone: what
// starts it on its line (\noindent, \hangindent=1cm), lines of their own right before or after it
// with no blank line between (\vspace{12pt}, \nopagebreak, \clearpage, \centering), and
// environments whose whole body it is (center, spacing, adjustwidth, tcolorbox, samepage), each of
// which may have such lines of its own. unitOf reads all of that once; the edits then add, change
// or take away one of those things and nothing else, so one undo gives the bytes back and the
// same command on a hand written form (\begin{flushright} written by a person, {\centering ...
// \par}) takes exactly that off.
//
// The text may be a stranger's: the scans here are bounded (a line read is at most LINE
// characters, at most ATTACH lines either side) and no pattern can backtrack over the document.

import { parse } from './parser.js';
import { lineStart, startsLine, eolAt, blankPads, envOpen, envClose, envWords } from './blockenv.js';
import { stripComments, preambleEnd, docClass, packageLine, packageOptions, hasPackage, parseKV, kvEdits } from './preamble.js';

const LINE = 240;     // the most of one line read
const ATTACH = 6;     // the most lines of their own read before or after a paragraph
const SCOPE = 2e6;    // the most of a block parsed

// ---- small helpers ----------------------------------------------------------------------------
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
export const skipWs = (src, p, end = src.length) => { while (p < end && isWs(src[p])) p++; return p; };
export const skipWsBack = (src, p, start = 0) => { while (p > start && isWs(src[p - 1])) p--; return p; };
const lineEnd = (src, p) => { const k = src.indexOf('\n', p); return k < 0 ? src.length : k; };
// the text of the line [ls, le) without its \r and the spaces around it, at most LINE characters
const lineText = (src, ls, le) => (le - ls > LINE ? null : src.slice(ls, le).replace(/\r$/, '').trim());
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- lengths ----------------------------------------------------------------------------------
// TeX's units in points; em and ex as at 10pt (a field shows them converted only where it must)
export const PT = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, dd: 1238 / 1157, cc: 12 * 1238 / 1157, sp: 1 / 65536, em: 10, ex: 4.3 };
// '1cm', '1.5 cm', '-2em', '0pt', '' -> points (an empty argument is 0), or null for anything
// else (\parindent, 0.1\linewidth: a length TeX knows and Rikuy does not reckon with)
export function lenPt(t, em = 10) {
  const s = String(t ?? '').trim();
  if (!s) return 0;
  const m = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|em|ex)$/.exec(s);
  if (!m) return null;
  const u = m[2] === 'em' ? em : m[2] === 'ex' ? em * 0.43 : PT[m[2]];
  return parseFloat(m[1]) * u;
}
// a length in points written in a unit, as briefly as it goes: 1cm, 1.25cm, 12pt
export function fmtLen(pt, unit = 'cm') {
  const v = Math.round(pt / PT[unit] * 100) / 100;
  return (Object.is(v, -0) ? 0 : v) + unit;
}

// ---- what a paragraph is in the source --------------------------------------------------------

// What may start a paragraph on its own line, before its words: read back from the words' start
const LEAD_TOKEN = /\\(?:noindent|indent)(?![A-Za-z])|\\hang(?:indent|after)[ \t]*(?:=[ \t]*)?[+-]?(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:pt|bp|mm|cm|in|pc|em|ex)?/y;
// The lead [ls, s) when the line before the words holds only that, else null:
// { s, hang: '1cm' or null, after: n or null, noindent }
export function leadOf(src, s) {
  const ls = lineStart(src, s);
  if (s - ls > LINE) return null;
  const t = src.slice(ls, s);
  let i = 0, hang = null, after = null, noindent = false, indent = false;
  const sp = () => { while (i < t.length && (t[i] === ' ' || t[i] === '\t')) i++; };
  sp();
  while (i < t.length) {
    LEAD_TOKEN.lastIndex = i;
    const m = LEAD_TOKEN.exec(t);
    if (!m) return null;
    const w = m[0];
    if (/^\\noindent/.test(w)) noindent = true;
    else if (/^\\indent/.test(w)) indent = true;
    else {
      const v = w.replace(/^\\hang(?:indent|after)[ \t]*(?:=[ \t]*)?/, '').replace(/[ \t]+/g, '');
      if (/^\\hangindent/.test(w)) hang = v; else after = v;
    }
    i += w.length;
    sp();
  }
  return { s: ls, e: s, hang, after, noindent, indent, text: t };
}

// Lines of their own right before or after a paragraph, what each is, and the one argument it has
const BEFORE = [
  ['space', /^\\vspace\*?[ \t]*\{[ \t]*([^{}\\]{1,40})\}$/], ['space', /^\\(bigskip|medskip|smallskip)$/],
  ['break', /^\\(newpage|clearpage|pagebreak)$/],
  ['rule', /^\\noindent\\rule\{\\linewidth\}\{([^{}\\]{1,20})\}\\par$/],
  ['decl', /^\\(centering|raggedright|raggedleft)$/]
];
const AFTER = [
  ['space', /^\\vspace\*?[ \t]*\{[ \t]*([^{}\\]{1,40})\}$/], ['space', /^\\(bigskip|medskip|smallskip)$/],
  ['keep', /^\\nopagebreak(?:\[[0-4]\])?$/],
  ['rule', /^\\par\\noindent\\rule\{\\linewidth\}\{([^{}\\]{1,20})\}$/]
];
const kindOf = (list, t) => { if (t == null) return null; for (const [k, re] of list) { const m = re.exec(t); if (m) return { kind: k, arg: m[1] ?? null, text: t }; } return null; };
// a line [ls, le): its end with its line break, for taking it away whole
const lineWithBreak = (src, ls, le) => (le < src.length ? le + 1 : le);

// The lines of their own before position p (which starts its line), nearest first: each
// { kind, arg, text, s, e (the line with its break) }; and the first position of the lowest one
function linesBefore(src, p, lo) {
  const out = [];
  let top = p;
  for (let n = 0; n < ATTACH && top > lo; n++) {
    const le = top - 1;
    if (src[le] !== '\n') break;
    const ls = Math.max(lo, lineStart(src, le));
    const k = kindOf(BEFORE, lineText(src, ls, le));
    if (!k) break;
    out.push({ ...k, s: ls, e: top });
    top = ls;
  }
  return { lines: out, top };
}
// The lines of their own after position p (the end of the words; the rest of its line must be
// blank), nearest first, and where the last one ends (before its line break)
function linesAfter(src, p, hi) {
  const out = [];
  let bot = p;
  let le = lineEnd(src, p);
  if (le > hi || /\S/.test(src.slice(p, Math.min(le, p + LINE)))) return { lines: out, bot };
  for (let n = 0; n < ATTACH && le < hi; n++) {
    const ls = le + 1, ne = Math.min(hi, lineEnd(src, ls));
    const k = kindOf(AFTER, lineText(src, ls, ne));
    if (!k) break;
    out.push({ ...k, s: le, e: ne });  // [the break before it, its end): taken away whole
    bot = ne; le = ne;
  }
  return { lines: out, bot };
}

// The environments, groups and arguments around [a, z) in the parse of src[lo, hi), outermost
// first: { t: 'env', n } | { t: 'group', n } | { t: 'arg', n }, offsets in src
function pathTo(src, lo, hi, a, z) {
  if (hi - lo > SCOPE) return null;
  let nodes;
  // (kept for the next look at the same text: the ribbon asks at every move of the caret; a
  // stranger's text nested past what the parser takes: nothing is known about it)
  if (PARSED.src === src && PARSED.lo === lo && PARSED.hi === hi) nodes = PARSED.nodes;
  else {
    try { nodes = parse(src.slice(lo, hi)); } catch (e) { return null; }
    Object.assign(PARSED, { src, lo, hi, nodes });
  }
  const out = [];
  let list = nodes;
  for (let depth = 0; depth < 64 && list; depth++) {
    let next = null;
    for (const n of list) {
      const s = n.s + lo, e = n.e + lo;
      if (e <= a) continue;
      if (s >= z) break;
      if (n.t === 'env' && !n.raw && n.nodes && n.be + lo <= a && z <= n.es + lo) { out.push({ t: 'env', n: shift(n, lo) }); next = n.nodes; break; }
      if (n.t === 'group' && n.is + lo <= a && z <= n.ie + lo) { out.push({ t: 'group', n: shift(n, lo) }); next = n.nodes; break; }
      if (n.t === 'cmd' && n.args) {
        const g = n.args.find((x) => x && x.nodes && x.is + lo <= a && z <= x.ie + lo);
        if (g) { out.push({ t: 'arg', n: shift(n, lo) }); next = g.nodes; break; }
      }
      // (a node that holds part of the range and not all of it: the range is no unit of it)
      if (s < a || e > z) return out;
    }
    list = next;
  }
  return out;
}
const PARSED = { src: null, lo: -1, hi: -1, nodes: null };
const shift = (n, lo) => ({ name: n.name, s: n.s + lo, e: n.e + lo, be: n.be != null ? n.be + lo : null, es: n.es != null ? n.es + lo : null, args: n.args });

// the environments this batch reads and writes, and how many braced arguments each takes
export const NARGS = { spacing: 1, Spacing: 1, adjustwidth: 2, 'adjustwidth*': 2, hyphenrules: 1, otherlanguage: 1 };
const OPTS = new Set(['tcolorbox', 'mdframed', 'minipage', 'figure', 'figure*', 'table', 'table*']);
const W = (src, n) => envWords(src, n.s, n.e, [n.name], NARGS, OPTS);

// The paragraph [s, e) (a model paragraph's ps and pe; several paragraphs side by side for a
// selection) as a unit: { s, e (its words), lead, levels: [{ W (the environment whose whole body
// the level below is; none for the words), xs, xe (with its lines of its own), before, after }],
// ts, te (the outermost level), cs, ce (that level without its lines), container (the innermost
// environment that holds more than the unit: { name, s, e, be, es }), inArg (it lies in a
// group or a command's argument: nothing goes around it), group (the words are one group
// {\centering ...\par}: { decl, s, e, ds, de })}. lo, hi: the block of the page that holds it
// (what is parsed).
export function unitOf(src, s, e, lo = 0, hi = src.length, vis = null) {
  s = skipWs(src, s, e); e = skipWsBack(src, e, s);
  if (e <= s) return null;
  // Where the page's first and last characters come from (vis: { vs, ve }, the model's): lines
  // before the first one's line are no part of the unit (a declaration on a line of its own,
  // \onehalfspacing or \selectlanguage{german}, keeps its reach over the paragraphs after it),
  // and after the last one's line only \label, \index and comment lines are
  if (vis && vis.vs >= s && vis.ve <= e) {
    const ls = lineStart(src, vis.vs);
    if (ls > s) s = ls;
    let z = Math.min(e, lineEnd(src, vis.ve));
    for (let n = 0; n < ATTACH * 4 && z < e; n++) {
      const ns = z + 1, ne = Math.min(e, lineEnd(src, ns)), t = lineText(src, ns, ne);
      if (t == null || !/^(?:\\(?:label|index)\{[^{}]{0,200}\}[ \t]*)*(?:%.*)?$/.test(t)) break;
      z = ne;
    }
    e = skipWsBack(src, z, s);
  }
  // (\nopagebreak at the end of a paragraph is part of it as TeX reads it: a line of its own)
  let tailLines = [];
  for (let n = 0; n < ATTACH; n++) {
    const ls = lineStart(src, e);
    if (ls <= s) break;
    const k = kindOf(AFTER, lineText(src, ls, e));
    if (!k || k.kind !== 'keep') break;
    const pe = skipWsBack(src, ls, s);
    tailLines.unshift({ ...k, s: pe, e });
    e = pe;
  }
  const lead = leadOf(src, s);
  // (lines of their own are read past the block: a \vspace line before a paragraph is a block of
  // the page by itself)
  const level0 = (xs, xe) => {
    const b = startsLine(src, xs) ? linesBefore(src, xs, 0) : { lines: [], top: xs };
    const a = linesAfter(src, xe, src.length);
    return { b, a };
  };
  const ws = lead ? lead.s : s;
  const { b, a } = level0(ws, e);
  const after = [...tailLines.reverse(), ...a.lines].sort((x, y) => x.s - y.s);
  const levels = [{ W: null, cs: ws, ce: e, xs: b.top, xe: a.bot, before: b.lines, after }];
  // the group {\centering ...\par}: the words are one balanced group that starts with the declaration
  let group = null;
  if (src[s] === '{' && src[e - 1] === '}') {
    const m = /^\{[ \t]*\\(centering|raggedright|raggedleft)(?![A-Za-z])[ \t]*/.exec(src.slice(s, s + 40));
    if (m && closes(src, s, e)) group = { decl: m[1], s, e, ds: s, de: s + m[0].length, par: src.slice(e - 5, e) === '\\par}' };
  }
  const path = pathTo(src, lo, hi, s, e);
  let container = null, inArg = !path;
  for (let k = (path || []).length - 1; k >= 0; k--) {
    const p = path[k], L = levels[levels.length - 1];
    if (p.t !== 'env') { inArg = true; break; }
    const n = p.n, bs = skipWs(src, n.be, n.es), be = skipWsBack(src, n.es, n.be);
    const xs = skipWs(src, L.xs, L.xe);
    if (bs === xs && be === L.xe) {
      const w = W(src, n);
      if (!w) { container = n; break; }
      const nb = startsLine(src, n.s) ? linesBefore(src, n.s, 0) : { lines: [], top: n.s };
      const na = linesAfter(src, n.e, src.length);
      levels.push({ W: w, name: n.name, cs: n.s, ce: n.e, xs: nb.top, xe: na.bot, before: nb.lines, after: na.lines });
    } else { container = n; break; }
  }
  const top = levels[levels.length - 1];
  return { s, e, lead, levels, ts: top.xs, te: top.xe, cs: top.cs, ce: top.ce, container, inArg, group };
}
// whether the group that opens at s closes at e - 1
function closes(src, s, e) {
  let d = 0;
  for (let i = s; i < e; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '%') { const k = src.indexOf('\n', i); if (k < 0 || k >= e) return false; i = k; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return i === e - 1;
  }
  return false;
}

// every line of its own of the unit, of one kind, before or after it, nearest first
export function linesOf(U, kind, side) {
  const out = [];
  for (const L of U.levels) for (const x of L[side]) if (x.kind === kind) out.push(x);
  return out;
}
// the environments of the unit of these names, innermost first
const wrappers = (U, names) => U.levels.filter((L) => L.W && names.includes(L.W.name));

// ---- a layer of environments of one kind --------------------------------------------------------
// A kind: names (the environments that make it), value(W) (what one says: 'center', '1.5'),
// open(value) ({ name, opt, args }: what is written for a value). set() puts the unit under the
// value given (null: none of the kind): the environment around it changed or taken off, one
// that holds other paragraphs too split around it, or a new one around it, joined with one of
// the same just before or after it (so that a paragraph centred between two centred ones and
// back again gives the bytes it had). inherit: the value the unit has from outside the
// environments that are its own, which needs none of its own.

function headOf(o) { return envOpen(o.name, { opt: o.opt, args: o.args }); }
const plainHead = (src, W) => src.slice(W.head[0], W.head[1]);

// The environment just before position p (only blank space between) whose head is head: the
// edits that take its end away so that the text at p joins it, or null
function joinBefore(src, p, name, head, lo) {
  const q = skipWsBack(src, p, lo);
  const close = envClose(name);
  if (q < close.length || src.slice(q - close.length, q) !== close) return null;
  // (its environment: its head must be exactly head; found by the parse of what is before)
  const k = q - close.length, r = skipWsBack(src, k, lo);
  // the blank space between it and p: a paragraph's break at most (two line breaks)
  if ((src.slice(q, p).match(/\n/g) || []).length > 2) return null;
  const hs = findOpen(src, k, name, lo);
  if (hs < 0) return null;
  const W = envWords(src, hs, q, [name], NARGS, OPTS);
  if (!W || plainHead(src, W) !== head) return null;
  return [{ s: r, e: q, t: '' }];
}
// The environment just after position p whose head is head: the edits that take its head away
function joinAfter(src, p, name, head, hi) {
  const r = skipWs(src, p, hi);
  if (!src.startsWith(head, r)) return null;
  if ((src.slice(p, r).match(/\n/g) || []).length > 2) return null;
  const he = r + head.length;
  // the head alone on its line, and its environment closed further on
  const nl = src[he] === '\r' && src[he + 1] === '\n' ? 2 : src[he] === '\n' ? 1 : 0;
  if (!nl) return null;
  const end = findClose(src, he, name, hi);
  if (end < 0) return null;
  return [{ s: r, e: he + nl, t: '' }];
}
// where the \begin{name} that the \end{name} at k closes starts, or -1 (balanced, bounded)
function findOpen(src, k, name, lo) {
  const re = new RegExp('\\\\(begin|end)\\s*\\{' + esc(name) + '\\}', 'g');
  const from = Math.max(lo, k - 200000), text = src.slice(from, k);
  const hits = [];
  for (let m, n = 0; (m = re.exec(text)) && n < 5000; n++) hits.push([m.index + from, m[1]]);
  let d = 0;
  for (let i = hits.length - 1; i >= 0; i--) { if (hits[i][1] === 'end') d++; else if (d === 0) return hits[i][0]; else d--; }
  return -1;
}
function findClose(src, p, name, hi) {
  const re = new RegExp('\\\\(begin|end)\\s*\\{' + esc(name) + '\\}', 'g');
  re.lastIndex = p;
  let d = 0;
  for (let m, n = 0; (m = re.exec(src)) && n < 5000 && m.index < hi; n++) { if (m[1] === 'begin') d++; else if (d === 0) return m.index + m[0].length; else d--; }
  return -1;
}

// The edits that put the unit under value v of kind K (see above). Returns edits or { why }.
export function layerEdits(src, U, K, v, o = {}) {
  if (U.inArg) return { why: 'This paragraph is inside a group or an argument of a command: an environment cannot go around it there.' };
  const lo = o.lo ?? 0, hi = o.hi ?? src.length;
  const mine = wrappers(U, K.names);
  const W0 = mine[0] ? mine[0].W : null;
  const same = (a, b) => a == null ? b == null : b != null && K.same(a, b);
  const now = W0 ? K.value(W0, src) : U.container && K.names.includes(U.container.name) ? K.value(W(src, U.container) || {}, src) : o.inherit ?? null;
  if (same(now, v)) return [];
  const want = v == null || same(v, o.inherit ?? null) ? null : v;
  // an environment of the kind is the unit's own: changed, joined with its neighbours, or taken off
  if (W0) {
    if (mine.length > 1) return { why: 'This paragraph has two environments of this kind around it: change the source.' };
    if (want == null) return unwrapBlockEditsKeep(src, W0);
    return replaceWrapper(src, W0, K.open(want), lo, hi);
  }
  // in an environment of the kind that holds other paragraphs too: split it around the unit
  const C = U.container && K.names.includes(U.container.name) ? U.container : null;
  if (C) {
    const out = splitEdits(src, C, U);
    if (out.why) return out;
    if (want != null) out.push(...wrapEdits(src, U, K.open(want), lo, hi, true));
    return out;
  }
  if (want == null) return { why: o.whyInherit || 'This comes from further out in the document, not from this paragraph.' };
  return wrapEdits(src, U, K.open(want), lo, hi);
}

// the environment W off its words (blockenv's, with the blank lines a paragraph needs)
function unwrapBlockEditsKeep(src, W) {
  const nl = '\r?\n';
  const head = src.slice(W.head[0], W.head[1]);
  const asWritten = new RegExp('^' + esc(head) + nl + '$').test(src.slice(W.head[0], W.ws)) && new RegExp('^' + nl + esc(src.slice(W.tail[0], W.tail[1])) + '$').test(src.slice(W.we, W.e));
  const pad = blankPads(src, W.s, W.e);
  if (asWritten && !pad.b && !pad.a) return [{ s: W.we, e: W.e, t: '' }, { s: W.s, e: W.ws, t: '' }];
  return [{ s: W.we, e: W.e, t: pad.a }, { s: W.s, e: W.ws, t: pad.b }];
}

// W given another head; where the same environment stands right before or after it, the two join
// (the neighbours are looked for past the block: an environment beside this one is a block of its own)
function replaceWrapper(src, W, o) {
  const lo = 0, hi = src.length;
  const head = headOf(o), close = envClose(o.name);
  const jb = joinBefore(src, W.s, o.name, head, lo), ja = joinAfter(src, W.e, o.name, head, hi);
  const out = [];
  if (jb) { out.push(...jb, { s: W.s, e: lineBreakAfter(src, W.head[1]), t: '' }); }
  else if (plainHead(src, W) !== head) out.push({ s: W.head[0], e: W.head[1], t: head });
  if (ja) { out.push(...ja, { s: lineBreakBefore(src, W.tail[0]), e: W.tail[1], t: '' }); }
  else if (src.slice(W.tail[0], W.tail[1]) !== close) out.push({ s: W.tail[0], e: W.tail[1], t: close });
  return out;
}
// the position after the line break that follows p (only blanks between), else p
function lineBreakAfter(src, p) {
  let q = p;
  while (q < src.length && (src[q] === ' ' || src[q] === '\t')) q++;
  if (src[q] === '\r' && src[q + 1] === '\n') return q + 2;
  return src[q] === '\n' ? q + 1 : p;
}
function lineBreakBefore(src, p) {
  let q = p;
  while (q > 0 && (src[q - 1] === ' ' || src[q - 1] === '\t')) q--;
  if (src[q - 1] === '\n') return src[q - 2] === '\r' ? q - 2 : q - 1;
  return p;
}

// A new environment around the unit's outermost level (inside its lines of their own), joined
// with the same environment right before or after it. split: the unit was just split out of a
// container (no join: its neighbours are the container's halves)
function wrapEdits(src, U, o, lo0, hi0, split) {
  const s = U.cs, e = U.ce, lo = 0, hi = src.length;
  if (!startsLine(src, s)) return { why: 'This paragraph shares its line with what comes before it in the source.' };
  const head = headOf(o), close = envClose(o.name), nl = eolAt(src, s);
  const jb = !split && !U.levels[U.levels.length - 1].before.length ? joinBefore(src, s, o.name, head, lo) : null;
  const ja = !split && !U.levels[U.levels.length - 1].after.length ? joinAfter(src, e, o.name, head, hi) : null;
  const out = [];
  out.push(jb ? jb[0] : { s, e: s, t: head + nl });
  out.push(ja ? ja[0] : { s: e, e, t: nl + close });
  return out;
}

// The edits that close the container C before the unit and open it again after it (its head
// as written), so that the unit stands between the two halves; a half with nothing in it goes
function splitEdits(src, C, U) {
  const w = W(src, C);
  if (!w) return { why: 'The environment around this paragraph is not one Rikuy can split.' };
  const head = plainHead(src, w), close = src.slice(w.tail[0], w.tail[1]), nl = eolAt(src, U.ts);
  if (!startsLine(src, U.ts)) return { why: 'This paragraph shares its line with what comes before it in the source.' };
  const out = [];
  const bEnd = skipWsBack(src, U.ts, w.ws);
  if (bEnd > w.ws) out.push({ s: bEnd, e: bEnd, t: nl + close });
  else out.push({ s: w.s, e: U.ts, t: '' });
  const aStart = skipWs(src, U.te, w.we);
  if (aStart < w.we) out.push({ s: aStart, e: aStart, t: head + nl });
  else out.push({ s: U.te, e: w.e, t: '' });
  return out;
}

// ---- alignment ----------------------------------------------------------------------------------
export const ALIGN_ENV = { left: 'flushleft', center: 'center', right: 'flushright' };
export const ENV_ALIGN = { flushleft: 'left', center: 'center', flushright: 'right' };
export const DECL_ALIGN = { raggedright: 'left', centering: 'center', raggedleft: 'right' };
export const ALIGN_DECL = { left: 'raggedright', center: 'centering', right: 'raggedleft' };
export const ALIGN = {
  names: ['center', 'flushleft', 'flushright'],
  value: (W) => ENV_ALIGN[W.name] || null,
  same: (a, b) => a === b,
  open: (v) => ({ name: ALIGN_ENV[v] })
};

// The unit's alignment and where it comes from: { v: 'left' | 'center' | 'right' | null (justified),
// from: 'env' | 'decl' | 'group' | 'container' | 'outside' | null }. inherit: the alignment the
// page's model gives it (from a declaration further up, which this function does not see).
export function alignOf(src, U, inherit = null) {
  const w = wrappers(U, ALIGN.names);
  if (w.length) return { v: ENV_ALIGN[w[0].W.name], from: 'env', W: w[0].W };
  if (U.group) return { v: DECL_ALIGN[U.group.decl], from: 'group' };
  // a declaration of its own: on a line before the words, scoped to this unit (an environment
  // or a group whose whole body the unit is)
  const d = declOf(U);
  if (d) return { v: DECL_ALIGN[d.arg], from: 'decl', line: d };
  if (U.container && ALIGN.names.includes(U.container.name)) return { v: ENV_ALIGN[U.container.name], from: 'container' };
  return { v: inherit, from: inherit ? 'outside' : null };
}
// the \centering line of the unit, if its scope is the unit alone (an environment ends it)
function declOf(U) {
  for (let k = 0; k < U.levels.length; k++) {
    const d = U.levels[k].before.find((x) => x.kind === 'decl');
    if (!d) continue;
    // (scoped: a level above it is an environment of the unit's own, which ends the declaration)
    if (U.levels.length > k + 1) return d;
  }
  return null;
}

// The edits that align the unit: 'left', 'center', 'right' or 'justify' (LaTeX's own: no
// environment). inherit as for alignOf.
export function alignEdits(src, U, to, o = {}) {
  const v = to === 'justify' ? null : to;
  const cur = alignOf(src, U, o.inherit ?? null);
  if (cur.v === v) return [];
  // a declaration of the unit's own: changed in place, or taken off
  if (cur.from === 'group') {
    const g = U.group;
    if (v) return [{ s: g.ds + 1, e: g.ds + 1 + ('\\' + g.decl).length, t: '\\' + ALIGN_DECL[v] }];
    if (!g.par) return { why: 'This group ends without \\par, so TeX sets the paragraph after it ends: change it in the source.' };
    return [{ s: g.e - 5, e: g.e, t: '' }, { s: g.ds, e: g.de, t: '' }];
  }
  if (cur.from === 'decl') {
    const d = cur.line;
    if (v) return [{ s: d.s + d.text.length - d.text.trimStart().length + srcIndent(src, d.s), e: d.s + srcIndent(src, d.s) + d.text.length, t: '\\' + ALIGN_DECL[v] }];
    return [{ s: d.s, e: d.e, t: '' }];
  }
  if (cur.from === 'outside' && !v) return { why: 'This paragraph takes its alignment from a declaration further up (\\centering, \\raggedright): change that one in the source.' };
  return layerEdits(src, U, ALIGN, v, { ...o, inherit: cur.from === 'outside' ? cur.v : null });
}
const srcIndent = (src, ls) => { let i = ls; while (src[i] === ' ' || src[i] === '\t') i++; return i - ls; };

// ---- line spacing ---------------------------------------------------------------------------------
// A spacing is { lines: 1 | 1.5 | 2 } (setspace's single, one and a half and double spacing, as
// a typewriter's: \onehalfspacing makes the space between lines one and a half times the font's
// size) or { multiple: x } (\setstretch{x}: x times LaTeX's own). The ribbon's 1.0, 1.15, 1.5 and
// 2.0 are { lines: 1 }, { multiple: 1.15 }, { lines: 1.5 }, { lines: 2 } (GAP H45).
// setspace's stretch at 10, 11 and 12 pt (memoir's the same)
const ONEHALF = { 10: 1.25, 11: 1.213, 12: 1.241 }, DOUBLE = { 10: 1.667, 11: 1.618, 12: 1.655 };
export function stretchOf(sp, pt = 10) {
  if (!sp) return 1;
  if (sp.multiple != null) return sp.multiple;
  return sp.lines === 1.5 ? ONEHALF[pt] || 1.25 : sp.lines === 2 ? DOUBLE[pt] || 1.667 : 1;
}
export const sameSpacing = (a, b, pt = 10) => Math.abs(stretchOf(a, pt) - stretchOf(b, pt)) < 0.005;
export const spacingName = (sp) => !sp ? 'Single' : sp.lines === 1 ? 'Single' : sp.lines === 1.5 ? '1.5 lines' : sp.lines === 2 ? 'Double' : 'Multiple ' + sp.multiple;

// which commands a class has for it: setspace's, memoir's own, or none (beamer)
export function spacingDialect(src) {
  const d = docClass(src);
  const cls = d ? d.name : '';
  if (cls === 'memoir') return 'memoir';
  if (cls === 'beamer') return null;
  return 'setspace';
}
const ENVS = {
  setspace: { single: 'singlespace', onehalf: 'onehalfspace', double: 'doublespace', multiple: 'spacing' },
  memoir: { single: 'SingleSpace', onehalf: 'OnehalfSpace', double: 'DoubleSpace', multiple: 'Spacing' }
};
const DECLS = {
  setspace: { onehalf: '\\onehalfspacing', double: '\\doublespacing', single: '\\singlespacing', multiple: (x) => '\\setstretch{' + x + '}' },
  memoir: { onehalf: '\\OnehalfSpacing', double: '\\DoubleSpacing', single: '\\SingleSpacing', multiple: (x) => '\\setSpacing{' + x + '}' }
};
export function spacingKind(dialect = 'setspace') {
  const E = ENVS[dialect] || ENVS.setspace;
  return {
    names: [E.single, E.onehalf, E.double, E.multiple],
    value: (W) => W.name === E.single ? { lines: 1 } : W.name === E.onehalf ? { lines: 1.5 } : W.name === E.double ? { lines: 2 } : W.name === E.multiple && W.args && isNum(W.args[0]) ? { multiple: +W.args[0].trim() } : null,
    same: (a, b) => sameSpacing(a, b),
    open: (v) => v.lines === 1 ? { name: E.single } : v.lines === 1.5 ? { name: E.onehalf } : v.lines === 2 ? { name: E.double } : { name: E.multiple, args: [numText(v.multiple)] }
  };
}
const isNum = (t) => /^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(String(t ?? ''));
const numText = (x) => String(Math.round(x * 1000) / 1000);

// The document's line spacing as the preamble sets it (the last one TeX meets), or at the very
// start of the body: { v, s, e (the command, to change in place), form: 'decl' | 'stretch' |
// 'linespread' | 'baselinestretch' | 'option', line: [ls, le] (its line, when the command
// stands alone on it) } or null (single, LaTeX's own)
const DOC_SPACING = /\\(onehalfspacing|doublespacing|singlespacing|OnehalfSpacing|DoubleSpacing|SingleSpacing)(?![A-Za-z@])\*?|\\(setstretch|linespread|setSpacing)[ \t]*\{[ \t]*((?:\d+(?:\.\d*)?|\.\d+))[ \t]*\}|\\renewcommand\*?[ \t]*(?:\{[ \t]*)?\\baselinestretch[ \t]*(?:\}[ \t]*)?\{[ \t]*((?:\d+(?:\.\d*)?|\.\d+))[ \t]*\}/g;
export function docSpacing(src, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const clean = stripComments(src.slice(0, end));
  let best = null;
  DOC_SPACING.lastIndex = 0;
  for (let m, n = 0; (m = DOC_SPACING.exec(clean)) && n < 2000; n++) best = hit(m, 0);
  // (the body's first lines: \onehalfspacing right after \begin{document}, before any text)
  const bs = src.indexOf('}', end) + 1;
  const head = stripComments(src.slice(bs, Math.min(src.length, bs + 600)));
  const first = /^\s*(?:\\(?:onehalfspacing|doublespacing|singlespacing|OnehalfSpacing|DoubleSpacing|SingleSpacing)(?![A-Za-z@])|\\(?:setstretch|linespread|setSpacing)[ \t]*\{[^{}]{1,10}\}(?:\\selectfont)?)/.exec(head);
  if (first) { DOC_SPACING.lastIndex = 0; const m = DOC_SPACING.exec(first[0]); if (m) best = hit(m, bs); }
  if (!best) {
    // setspace's own options: \usepackage[onehalfspacing]{setspace}
    const op = packageOptions(src, 'setspace', end, o.others);
    if (op) for (const k of ['onehalfspacing', 'doublespacing', 'singlespacing']) if (op[k]) best = { v: k === 'onehalfspacing' ? { lines: 1.5 } : k === 'doublespacing' ? { lines: 2 } : { lines: 1 }, form: 'option', key: k };
  }
  return best;
  function hit(m, base) {
    const s = m.index + base, e = s + m[0].length;
    const ls = lineStart(src, s), le = lineEnd(src, s);
    const alone = !/\S/.test(src.slice(ls, s)) && !/\S/.test(src.slice(e, le).replace(/\\selectfont/, ''));
    let v, form;
    if (m[1]) { const k = m[1].toLowerCase(); v = k.startsWith('onehalf') ? { lines: 1.5 } : k.startsWith('double') ? { lines: 2 } : { lines: 1 }; form = 'decl'; }
    else if (m[2]) { v = { multiple: parseFloat(m[3]) }; form = m[2] === 'linespread' ? 'linespread' : 'stretch'; }
    else { v = { multiple: parseFloat(m[4]) }; form = 'baselinestretch'; }
    const num = m[3] || m[4];
    return { v, s, e, form, line: alone ? [ls, lineWithBreak(src, ls, le)] : null, num: num ? [s + m[0].lastIndexOf(num), s + m[0].lastIndexOf(num) + num.length] : null };
  }
}

// The edits that give the document line spacing v. Packages are the caller's (packageEdits):
// returns { edits, needs: 'setspace' | null } or { why }.
export function docSpacingEdits(src, v, o = {}) {
  const dialect = o.dialect || spacingDialect(src);
  if (!dialect) return { why: 'A beamer presentation spaces its lines itself.' };
  const D = DECLS[dialect], cur = docSpacing(src, o), end = preambleEnd(src);
  if (end < 0) return { why: 'This file has no preamble.' };
  const single = !v || (v.lines === 1);
  if (cur && sameSpacing(cur.v, v || { lines: 1 }, o.pt)) return { edits: [], needs: null };
  const text = !v || v.lines === 1 ? D.single : v.lines === 1.5 ? D.onehalf : v.lines === 2 ? D.double : D.multiple(numText(v.multiple));
  if (cur && cur.form === 'option') {
    // setspace's option: changed among its options
    const p = packageLine(src, 'setspace', end);
    if (!p || !p.opts) return { why: 'setspace\'s options are set elsewhere: change them in the source.' };
    const drop = { [cur.key]: null };
    if (single) return { edits: optsEdits(src, p, drop), needs: null };
    if (v.lines) return { edits: kvEdits(src, p.opts[0], p.opts[1], { ...drop, [v.lines === 2 ? 'doublespacing' : 'onehalfspacing']: true }), needs: null };
    return { edits: [...optsEdits(src, p, drop), ...declLine(src, end, text)], needs: null };
  }
  if (cur) {
    // single: the command goes (with its line, when it has one of its own)
    if (single) return { edits: [cur.line ? { s: cur.line[0], e: cur.line[1], t: '' } : { s: cur.s, e: cur.e, t: '' }], needs: null };
    // a number written by hand keeps its form: \linespread{1.3} becomes \linespread{1.15}
    if (v.multiple != null && cur.num) return { edits: [{ s: cur.num[0], e: cur.num[1], t: numText(v.multiple) }], needs: null };
    return { edits: [{ s: cur.s, e: cur.e, t: text }], needs: dialect === 'setspace' ? 'setspace' : null };
  }
  if (single) return { edits: [], needs: null };
  return { edits: declLine(src, end, text), needs: dialect === 'setspace' ? 'setspace' : null };
}
// a line of its own at the end of the preamble (where \begin{document}'s line starts)
function declLine(src, end, text) {
  const at = lineStart(src, end);
  if (/\S/.test(src.slice(at, end))) return [{ s: end, e: end, t: eolAt(src, at) + text + eolAt(src, at) }];
  return [{ s: at, e: at, t: text + eolAt(src, at) }];
}

// ---- indents ---------------------------------------------------------------------------------------
// adjustwidth (changepage; memoir has it): { l, r } in points, the two arguments as written
export const INDENT = {
  names: ['adjustwidth', 'adjustwidth*'],
  value: (W) => W.args && W.args.length === 2 ? { l: lenPt(W.args[0]), r: lenPt(W.args[1]), raw: W.args } : null,
  same: (a, b) => a.l != null && b.l != null && Math.abs(a.l - b.l) < 0.05 && Math.abs((a.r || 0) - (b.r || 0)) < 0.05,
  open: (v) => ({ name: 'adjustwidth', args: [v.l ? fmtLen(v.l, v.unit || 'cm') : '', v.r ? fmtLen(v.r, v.unit || 'cm') : ''] })
};
// the unit's indents from its own adjustwidth (or the container's), in points; null where one
// is a length Rikuy does not reckon with
export function indentOf(src, U) {
  const w = wrappers(U, INDENT.names);
  if (w.length) return { ...(INDENT.value(w[0].W) || { l: null, r: null }), from: 'env' };
  if (U.container && INDENT.names.includes(U.container.name)) { const c = W(src, U.container); return { ...((c && INDENT.value(c)) || { l: null, r: null }), from: 'container' }; }
  return { l: 0, r: 0, from: null };
}
// The edits that give the unit the left and right indents l and r (points; 0 for none)
export function indentEdits(src, U, l, r, o = {}) {
  const cur = indentOf(src, U);
  if (cur.l == null || cur.r == null) return { why: 'This paragraph\'s indent is written as a length Rikuy does not reckon with: change it in the source.' };
  const v = Math.abs(l) < 0.05 && Math.abs(r) < 0.05 ? null : { l, r, unit: o.unit || 'cm' };
  return layerEdits(src, U, INDENT, v, o);
}
// Increase Indent and Decrease Indent: to the next step of Word's, half an inch (1.27 cm), to the
// right or the left
export const INDENT_STEP = PT.in / 2;
export function stepIndent(l, by) {
  const k = l / INDENT_STEP;
  const n = by > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1;
  return Math.max(0, n) * INDENT_STEP;
}

// ---- the paragraph's first line ------------------------------------------------------------------
// Special: 'none' (\noindent), 'first' (LaTeX's \parindent), 'hanging' (\hangindent=by: the
// first line at the margin, the others by in from it). by: a length as written ('1cm').
export function firstLineOf(U, indented) {
  const L = U.lead;
  if (L && L.hang) return { special: 'hanging', by: L.hang };
  return { special: indented ? 'first' : 'none', by: null };
}
export function firstLineEdits(src, U, special, by, o = {}) {
  const L = U.lead, s = U.s;
  const cur = firstLineOf(U, o.indented);
  if (cur.special === special && (special !== 'hanging' || cur.by === by)) return [];
  const want = special === 'hanging' ? '\\noindent\\hangindent=' + by + ' ' : special === 'none' ? '\\noindent ' : '';
  if (L) {
    // what Rikuy wrote, or a hand written lead: the whole lead takes the new form (a lead of
    // \noindent alone, after a heading, where LaTeX indents nothing anyway, goes for 'first')
    const keepIndent = L.text.slice(0, L.text.length - L.text.trimStart().length);
    if (special === 'first' && !o.indented && !L.hang && L.noindent) return [{ s: L.s + keepIndent.length, e: L.e, t: '' }];
    return [{ s: L.s + keepIndent.length, e: L.e, t: want }];
  }
  if (!want) return [];
  return [{ s, e: s, t: want }];
}

// ---- the space before and after, keeping with the next, a page break before ----------------------
// the points of a space line: \vspace{12pt}, \medskip
export function spacePt(x) {
  if (!x) return 0;
  if (x.arg === 'bigskip') return 12;
  if (x.arg === 'medskip') return 6;
  if (x.arg === 'smallskip') return 3;
  return lenPt(x.arg);
}
export function spaceOf(U, side) {
  const l = linesOf(U, 'space', side)[0];
  return l ? { pt: spacePt(l), line: l } : { pt: 0, line: null };
}
// The edits that give the unit pt points of space before or after it (0: none)
export function spaceEdits(src, U, side, pt) {
  const cur = spaceOf(U, side);
  if (cur.line && cur.pt != null && Math.abs(cur.pt - pt) < 0.05) return [];
  const text = '\\vspace{' + fmtLen(pt, 'pt') + '}';
  if (cur.line) {
    if (pt <= 0) return [{ s: cur.line.s, e: cur.line.e, t: '' }];
    const x = cur.line, at = src.indexOf(x.text, x.s);
    return at < 0 ? [] : [{ s: at, e: at + x.text.length, t: text }];
  }
  if (pt <= 0) return [];
  return lineEdits(src, U, side, text);
}
// a line of its own put at the unit's outermost edge (inside the lines it has there)
function lineEdits(src, U, side, text) {
  if (side === 'before') {
    if (!startsLine(src, U.cs)) return { why: 'This paragraph shares its line with what comes before it in the source.' };
    return [{ s: U.cs, e: U.cs, t: text + eolAt(src, U.cs) }];
  }
  return [{ s: U.ce, e: U.ce, t: eolAt(src, U.cs) + text }];
}
// a flag line (keep: \nopagebreak after; break: \clearpage before): on or off
export function flagOf(U, kind) {
  return linesOf(U, kind, kind === 'break' ? 'before' : 'after')[0] || null;
}
export function flagEdits(src, U, kind, on) {
  const cur = flagOf(U, kind);
  if (!!cur === !!on) return [];
  if (!on) return [{ s: cur.s, e: cur.e, t: '' }];
  return lineEdits(src, U, kind === 'break' ? 'before' : 'after', kind === 'break' ? '\\clearpage' : '\\nopagebreak');
}

// ---- borders as lines: a rule above or below ------------------------------------------------------
export function ruleOf(U, side) { return linesOf(U, 'rule', side)[0] || null; }
export function ruleEdits(src, U, side, on) {
  const cur = ruleOf(U, side);
  if (!!cur === !!on) return [];
  if (!on) return [{ s: cur.s, e: cur.e, t: '' }];
  return lineEdits(src, U, side, side === 'before' ? '\\noindent\\rule{\\linewidth}{0.4pt}\\par' : '\\par\\noindent\\rule{\\linewidth}{0.4pt}');
}
// A horizontal line of its own after the unit, as its own paragraph (Word's Horizontal Line)
export function hrEdits(src, U) {
  const nl = eolAt(src, U.cs);
  return [{ s: U.te, e: U.te, t: nl + nl + '\\noindent\\rule{\\linewidth}{0.4pt}' + (blankAfter(src, U.te) ? '' : nl) }];
}
const blankAfter = (src, p) => /^[ \t]*\r?\n[ \t]*\r?\n/.test(src.slice(p, p + 200)) || !src.slice(p).trim();

// ---- environments that hold one flag: samepage, nohyphenation, nolinenumbers --------------------------
export const SAMEPAGE = { names: ['samepage'], value: () => true, same: (a, b) => a === b, open: () => ({ name: 'samepage' }) };
export const NOHYPH = { names: ['hyphenrules'], value: (W) => (W.args && W.args[0].trim() === 'nohyphenation' ? true : null), same: (a, b) => a === b, open: () => ({ name: 'hyphenrules', args: ['nohyphenation'] }) };
export const NOLINENO = { names: ['nolinenumbers'], value: () => true, same: (a, b) => a === b, open: () => ({ name: 'nolinenumbers' }) };
export function flagEnvOf(src, U, K) {
  const w = wrappers(U, K.names).find((x) => K.value(x.W));
  if (w) return 'env';
  if (U.container && K.names.includes(U.container.name)) { const c = W(src, U.container); if (c && K.value(c)) return 'container'; }
  return null;
}

// ---- shading and borders: tcolorbox ---------------------------------------------------------------
// Rikuy's box: shading alone is colback=X,colframe=X,boxrule=0pt,sharp corners (no frame to
// see); a box is colframe=black,boxrule=0.4pt; both, colback=X and the frame. Read back from any
// tcolorbox: its colback, and whether it shows a frame.
export const BOX = {
  names: ['tcolorbox'],
  value: (W, src) => ({ kv: W.opt != null ? Object.fromEntries(parseKV(W.opt).map((x) => [x.key, x.value == null ? true : x.value])) : {} }),
  same: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  open: (v) => ({ name: 'tcolorbox', opt: v.opt })
};
export function boxOf(src, U) {
  const w = wrappers(U, BOX.names);
  if (w.length) {
    const kv = BOX.value(w[0].W).kv;
    const rule = kv.boxrule != null ? lenPt(kv.boxrule) : 0.5;
    return { from: 'env', W: w[0].W, shading: kv.colback && kv.colback !== 'white' ? kv.colback : null, border: rule == null || rule > 0, kv };
  }
  if (U.container && BOX.names.includes(U.container.name)) return { from: 'container' };
  return { from: null, shading: null, border: false };
}
const boxOpt = (shade, border) => (shade ? 'colback=' + shade + ',' : 'colback=white,') + (border ? 'colframe=black,boxrule=0.4pt' : 'colframe=' + shade + ',boxrule=0pt') + ',sharp corners';
// The edits that give the unit shading (an xcolor colour, null for none) and a box (true, false)
export function boxEdits(src, U, shade, border, o = {}) {
  const cur = boxOf(src, U);
  if (cur.from === 'container') return { why: 'This paragraph is in a box with other paragraphs: change the box in the source.' };
  if (cur.from === 'env') {
    const W0 = cur.W;
    if (!shade && !border) {
      // Rikuy's own options (or none): the box goes; a box with options of a person's own keeps
      // them and loses what was asked
      const own = Object.keys(cur.kv).every((k) => ['colback', 'colframe', 'boxrule', 'sharp corners', 'arc'].includes(k));
      if (own) return unwrapBlockEditsKeep(src, W0);
    }
    if (W0.opt == null) { const at = W0.head[1]; return [{ s: at, e: at, t: '[' + boxOpt(shade, border) + ']' }]; }
    const ch = { colback: shade || 'white', colframe: border ? 'black' : shade || 'white', boxrule: border ? '0.4pt' : '0pt' };
    const os = W0.head[0] + src.slice(W0.head[0], W0.head[1]).indexOf('[') + 1;
    return kvEdits(src, os, os + W0.opt.length, ch);
  }
  if (!shade && !border) return [];
  return layerEdits(src, U, BOX, { opt: boxOpt(shade, border) }, o);
}

// ---- the document's paragraph spacing (Design › Paragraph spacing) -----------------------------------
// Word's built in sets, as LaTeX writes them: the space between paragraphs (parskip's skip, or
// the class's own option) and the line spacing (above). 'none' is LaTeX's own: first lines
// indented, no space between.
export const PARA_SETS = [
  { id: 'none', name: 'No Paragraph Space', skip: null, sp: null },
  { id: 'compact', name: 'Compact', skip: 4, sp: null },
  { id: 'tight', name: 'Tight', skip: 6, sp: { multiple: 1.15 } },
  { id: 'open', name: 'Open', skip: 'open', sp: { multiple: 1.15 } },
  { id: 'relaxed', name: 'Relaxed', skip: 6, sp: { lines: 1.5 } },
  { id: 'double', name: 'Double', skip: 8, sp: { lines: 2 } }
];
const KOMA = /^scr(?:artcl|reprt|book|lttr2)$/;
// The document's space between paragraphs: { skip: points | 'open' | null, form: 'package' |
// 'setlength' | 'koma' | 'memoir', s, e (what to change), line } or { skip: null }
export function docParskip(src, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return { skip: null };
  const d = docClass(src);
  if (d && KOMA.test(d.name)) {
    const v = d.options.parskip;
    if (v && v !== true && !/^(false|off|never|no)$/.test(v)) return { skip: /^full/.test(v) ? 'open' : 6, form: 'koma', key: v };
    return { skip: null, form: 'koma' };
  }
  const p = packageLine(src, 'parskip', end);
  if (p) {
    const op = packageOptions(src, 'parskip', end) || {};
    return { skip: op.skip ? lenPt(op.skip) ?? 'open' : 'open', form: 'package', p, opts: op };
  }
  if (hasPackage(src, 'parskip', end, o.others)) return { skip: 'open', form: 'elsewhere' };
  const clean = stripComments(src.slice(0, end));
  const re = /\\setlength[ \t]*(?:\{[ \t]*)?\\parskip[ \t]*(?:\}[ \t]*)?\{([^{}]{0,60})\}|\\(?:abnormalparskip)[ \t]*\{([^{}]{0,60})\}|\\(nonzeroparskip)(?![A-Za-z])/g;
  let last = null;
  for (let m, n = 0; (m = re.exec(clean)) && n < 500; n++) last = m;
  if (!last) return { skip: null, form: null };
  const s = last.index, e = s + last[0].length, ls = lineStart(src, s), le = lineEnd(src, s);
  const alone = !/\S/.test(src.slice(ls, s)) && !/\S/.test(src.slice(e, le));
  const arg = last[1] ?? last[2];
  const pt = last[3] ? 'open' : lenPt(String(arg).replace(/\s+plus.*$/, '').replace(/\s+minus.*$/, ''));
  return { skip: pt === 0 ? null : pt ?? 'open', form: last[3] || last[2] != null ? 'memoir' : 'setlength', s, e, line: alone ? [ls, lineWithBreak(src, ls, le)] : null, arg: arg != null ? [s + last[0].lastIndexOf(arg), s + last[0].lastIndexOf(arg) + arg.length] : null };
}
// The edits that set the space between the document's paragraphs (points, 'open' for parskip's
// own half a line, null for none): { edits, needs: { parskip: options } | null } or { why }
export function docParskipEdits(src, skip, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return { why: 'This file has no preamble.' };
  const d = docClass(src);
  if (d && d.name === 'beamer') return { why: 'A beamer presentation spaces its paragraphs itself.' };
  const cur = docParskip(src, o);
  const same = (a, b) => (a == null && b == null) || a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.05);
  if (same(cur.skip, skip)) return { edits: [], needs: null };
  if (cur.form === 'koma') {
    // KOMA-Script's own option: parskip=half or full, or none
    return { edits: classOptionEdits(src, d, 'parskip', skip == null ? null : skip === 'open' ? 'full' : 'half'), needs: null };
  }
  if (cur.form === 'elsewhere') return { why: 'parskip is loaded by another file of the project: change it there.' };
  if (cur.form === 'package') {
    const p = cur.p;
    if (skip == null) {
      // the package line goes when it loads parskip alone, on a line of its own
      const ls = lineStart(src, p.s), le = lineEnd(src, p.s);
      if (p.names.length === 1 && !/\S/.test(src.slice(ls, p.s)) && !/\S/.test(src.slice(p.e, le))) return { edits: [{ s: ls, e: lineWithBreak(src, ls, le), t: '' }], needs: null };
      return { why: 'parskip is loaded with other packages on one line: take it out in the source.' };
    }
    const ch = { skip: skip === 'open' ? null : fmtLen(skip, 'pt') };
    if (p.opts) return { edits: optsEdits(src, p, ch), needs: null };
    if (skip === 'open') return { edits: [], needs: null };
    return { edits: [{ s: p.list[0] - 1, e: p.list[0] - 1, t: '[skip=' + fmtLen(skip, 'pt') + ']' }], needs: null };
  }
  if (cur.form === 'setlength' || cur.form === 'memoir') {
    if (skip == null) return { edits: [cur.line ? { s: cur.line[0], e: cur.line[1], t: '' } : { s: cur.s, e: cur.e, t: '' }], needs: null };
    if (cur.arg && skip !== 'open') return { edits: [{ s: cur.arg[0], e: cur.arg[1], t: fmtLen(skip, 'pt') }], needs: null };
    if (cur.arg) return { edits: [{ s: cur.arg[0], e: cur.arg[1], t: '.5\\baselineskip plus 2pt' }], needs: null };
  }
  if (skip == null) return { edits: [], needs: null };
  if (d && d.name === 'memoir') return { edits: declLine(src, end, skip === 'open' ? '\\nonzeroparskip' : '\\abnormalparskip{' + fmtLen(skip, 'pt') + '}'), needs: null };
  return { edits: [], needs: { parskip: skip === 'open' ? null : 'skip=' + fmtLen(skip, 'pt') } };
}
// a package's options changed, the brackets gone with the last of them
export function optsEdits(src, p, changes) {
  if (!p.opts) return [];
  const have = parseKV(src, p.opts[0], p.opts[1]);
  if (have.length && have.every((x) => x.key in changes && changes[x.key] === null) && !Object.values(changes).some((v) => v !== null)) return [{ s: p.opts[0] - 1, e: p.opts[1] + 1, t: '' }];
  return kvEdits(src, p.opts[0], p.opts[1], changes);
}
// a class option set to a value, or taken out (null)
function classOptionEdits(src, d, key, value) {
  if (!d) return [];
  if (d.opts) return kvEdits(src, d.opts[0], d.opts[1], { [key]: value });
  return value == null ? [] : [{ s: d.nameAt[0] - 1, e: d.nameAt[0] - 1, t: '[' + key + '=' + value + ']' }];
}

// ---- the document's first line indent and widows ----------------------------------------------------
// \setlength{\parindent}{1.25cm} in the preamble: { pt, s, e, arg } or null
export function docParindent(src) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const clean = stripComments(src.slice(0, end));
  const re = /\\setlength[ \t]*(?:\{[ \t]*)?\\parindent[ \t]*(?:\}[ \t]*)?\{([^{}]{0,40})\}|\\parindent[ \t]*(?:=[ \t]*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:pt|bp|mm|cm|in|pc|em|ex))/g;
  let last = null;
  for (let m, n = 0; (m = re.exec(clean)) && n < 500; n++) last = m;
  if (!last) return null;
  const arg = last[1] ?? last[2];
  const at = last.index + last[0].lastIndexOf(arg);
  return { pt: lenPt(arg), s: last.index, e: last.index + last[0].length, arg: [at, at + arg.length] };
}
export function docParindentEdits(src, pt) {
  const end = preambleEnd(src);
  if (end < 0) return { why: 'This file has no preamble.' };
  const cur = docParindent(src);
  const text = fmtLen(pt, 'cm');
  if (cur) return cur.pt != null && Math.abs(cur.pt - pt) < 0.05 ? [] : [{ s: cur.arg[0], e: cur.arg[1], t: text }];
  return declLine(src, end, '\\setlength{\\parindent}{' + text + '}');
}

// Widow and orphan control: \widowpenalty and \clubpenalty at 10000 in the preamble
const PENALTY = /\\(widowpenalty|clubpenalty)[ \t]*(?:=[ \t]*)?(\d{1,6})/g;
export function widowControl(src) {
  const end = preambleEnd(src);
  if (end < 0) return { on: false, hits: [] };
  const clean = stripComments(src.slice(0, end));
  const hits = [];
  for (let m, n = 0; (m = PENALTY.exec(clean)) && n < 200; n++) hits.push({ name: m[1], v: +m[2], s: m.index, e: m.index + m[0].length });
  const last = (k) => hits.filter((h) => h.name === k).pop();
  const w = last('widowpenalty'), c = last('clubpenalty');
  const nowidow = /\\usepackage\s*\[[^\]]*\ball\b[^\]]*\]\s*\{nowidow\}/.test(clean);
  return { on: nowidow || (!!w && !!c && w.v >= 10000 && c.v >= 10000), nowidow, hits };
}
export function widowEdits(src, on) {
  const end = preambleEnd(src);
  if (end < 0) return { why: 'This file has no preamble.' };
  const cur = widowControl(src);
  if (cur.on === on) return [];
  if (cur.nowidow) return { why: 'nowidow\'s all option sets it: change that in the source.' };
  if (on) {
    const out = [];
    const miss = [];
    for (const k of ['widowpenalty', 'clubpenalty']) {
      const h = cur.hits.filter((x) => x.name === k).pop();
      if (h) { const t = src.slice(h.s, h.e), d = /\d+$/.exec(t); out.push({ s: h.e - d[0].length, e: h.e, t: '10000' }); } else miss.push('\\' + k + '=10000');
    }
    if (miss.length) out.push(...declLine(src, end, miss.join(eolAt(src, end))));
    return out;
  }
  // off: the assignments go, with their lines when they stand alone on them
  return cur.hits.map((h) => {
    const ls = lineStart(src, h.s), le = lineEnd(src, h.s);
    const alone = !/\S/.test(src.slice(ls, h.s)) && !/\S/.test(src.slice(h.e, le));
    return alone ? { s: ls, e: lineWithBreak(src, ls, le), t: '' } : { s: h.s, e: h.e, t: '' };
  });
}

// ---- direction -----------------------------------------------------------------------------------
// A paragraph the other way round: otherlanguage{arabic} or {english}, as the set up has the
// languages (src/scripts.js); bidi's RTL and LTR where bidi is loaded alone
export const DIRECTION = {
  names: ['otherlanguage', 'RTL', 'LTR'],
  value: (W) => W.name === 'RTL' ? 'rtl' : W.name === 'LTR' ? 'ltr' : W.args ? W.args[0].trim() : null,
  same: (a, b) => a === b,
  open: (v) => v === 'rtl' ? { name: 'RTL' } : v === 'ltr' ? { name: 'LTR' } : { name: 'otherlanguage', args: [v] }
};
