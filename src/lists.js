// Lists as edits of their source: the lists of a stretch of text read once with their items, nested
// lists and options; what labels and numbers a list (its options, its own set up lines, the
// preamble's \setlist and \renewcommand, LaTeX's defaults); and every change Word makes to a list,
// as the new text of the stretch that holds it: an item one level down under the item before it
// (Tab) and back (Shift+Tab), items made paragraphs again, another bullet or number format, a
// numbering that starts at another value or continues the list before, the space between items,
// items or paragraphs sorted, and the list typed as "- " or "1. " at a paragraph's start. Nothing
// here touches the page: the functions take the source and positions in it and return
// { s, e, t, a, b } (the stretch [s, e) becomes t, the caret and the selection's end at a and b in
// the text after it), or null where the change cannot be made. src/cmd/lists.js commits them;
// src/model.js draws labels and numbers with the same reading (numText, bulletGlyph, listSetup).
//
// The text may be a stranger's: every scan is bounded (a stretch of 400 000 characters at most is
// read, the preamble's 200 000), no pattern runs over more than one short line or argument.
// test/lists.test.mjs.

import { parse } from './parser.js';
import { parseKV, kvEdits, stripComments, preambleEnd, groupEnd } from './preamble.js';
import { blankPads } from './blockenv.js';

export const KINDS = { itemize: 'item', enumerate: 'enum', description: 'desc' };
const MAX = 400000;
const PRE = 200000;
const ROMAN = ['', 'i', 'ii', 'iii', 'iv'];
// LaTeX nests lists six deep, and each of enumerate and itemize four deep
export const MAX_LEVEL = 4, MAX_DEPTH = 6;

// ---- reading -------------------------------------------------------------------------------------
// The lists of [s, e) of src, the outermost first, each
// { name, kind ('item', 'enum', 'desc'), editable (one of the three LaTeX environments), s, e (after
//   its \end), be (after \begin{name} and its options), es (where \end starts), nameAt, endAt (the
//   name's places in \begin{} and \end{}), opt ({ s, e, is, ie } of [options]) or null, setupE
//   (where its first \item starts: [be, setupE) is its set up), items, parent ({ L, k }: the item
//   it stands in, or null), direct (in that item's own text, not inside another environment there) }
// and each item { s (its \item), cmdE (after \item and its label), lab ({ s, e, is, ie } of
// [label]) or null, e (its text's end, without the space after it), lists (lists in it) }.
const cache = new Map();
export function readLists(src, s = 0, e = src.length, sigs) {
  if (e - s > MAX || e <= s) return [];
  const text = src.slice(s, e), key = s + ':' + text;
  let rel = cache.get(key);
  if (!rel) {
    rel = [];
    // (a stranger's text nested past the parser's stack reads as no list at all)
    try { walk(parse(text, sigs ? { userSigs: sigs } : {}), text, null, rel, 0); } catch (e) { rel = []; }
    cache.set(key, rel);
    if (cache.size > 8) cache.delete(cache.keys().next().value);
  }
  return s ? rel.map((L) => shift(L, s, null)) : rel;
}
function shift(L, d, parent) {
  const M = { ...L, s: L.s + d, e: L.e + d, be: L.be + d, es: L.es + d, setupE: L.setupE + d, nameAt: [L.nameAt[0] + d, L.nameAt[1] + d], endAt: L.endAt && [L.endAt[0] + d, L.endAt[1] + d], opt: L.opt && { s: L.opt.s + d, e: L.opt.e + d, is: L.opt.is + d, ie: L.opt.ie + d }, parent };
  M.items = L.items.map((it, k) => {
    const I = { ...it, s: it.s + d, cmdE: it.cmdE + d, e: it.e + d, lab: it.lab && { s: it.lab.s + d, e: it.lab.e + d, is: it.lab.is + d, ie: it.lab.ie + d } };
    I.lists = it.lists.map((C) => shift(C, d, { L: M, k }));
    return I;
  });
  return M;
}
const isList = (name) => /^(itemize|enumerate|description)\*?$|^(compactitem|compactenum|compactdesc|inparaenum|asparaenum|asparaitem|inparaitem)$/.test(name);
function walk(nodes, text, parent, out, deep) {
  for (const nd of nodes) {
    if (!nd) continue;
    if (nd.t === 'env' && !nd.raw && isList(nd.name)) out.push(readList(nd, text, parent, deep === 0));
    else if (nd.nodes && !nd.raw) walk(nd.nodes, text, parent, out, deep + 1);
    if (nd.t === 'cmd' && nd.args) for (const a of nd.args) if (a && a.nodes) walk(a.nodes, text, parent, out, deep + 1);
  }
}
function readList(nd, text, parent, direct) {
  const name = nd.name, base = name.replace(/\*$/, '');
  const kind = KINDS[base] || (/enum/.test(name) ? 'enum' : /desc/.test(name) ? 'desc' : 'item');
  const a = nd.args && nd.args[0];
  const ns = nd.s + text.slice(nd.s, nd.s + 80).indexOf('{') + 1;
  const em = nd.e > nd.es ? /^\\end\s*\{\s*/.exec(text.slice(nd.es, nd.es + 40)) : null;
  const L = { name, kind, editable: !!KINDS[name], s: nd.s, e: nd.e, be: nd.be, es: nd.es, nameAt: [ns, ns + name.length], endAt: em ? [nd.es + em[0].length, nd.es + em[0].length + name.length] : null,
    opt: a && a.o ? { s: a.s, e: a.e, is: a.is, ie: a.ie } : null, items: [], parent, direct, closed: nd.e > nd.es };
  let cur = null;
  const groups = [];
  for (const n of nd.nodes || []) {
    if (n.t === 'cmd' && n.name === 'item') { cur = { s: n.s, cmdE: n.e, head: n.args && n.args[0] && n.args[0].o ? n.args[0].e : n.ne, lab: n.args && n.args[0] && n.args[0].o ? { s: n.args[0].s, e: n.args[0].e, is: n.args[0].is, ie: n.args[0].ie } : null, nodes: [] }; groups.push(cur); }
    else if (cur) cur.nodes.push(n);
  }
  L.setupE = groups.length ? groups[0].s : nd.es;
  groups.forEach((g, k) => {
    let e = g.nodes.length ? Math.max(g.cmdE, g.nodes[g.nodes.length - 1].e) : g.cmdE;
    if (k + 1 < groups.length) e = Math.min(e, groups[k + 1].s);
    // (an item with no words ends after "\item " and its one space: the space it was typed with)
    while (e > g.head && /\s/.test(text[e - 1])) e--;
    if (e === g.head && (text[e] === ' ' || text[e] === '\t')) e++;
    const item = { s: g.s, cmdE: g.cmdE, lab: g.lab, e, lists: [] };
    L.items.push(item);
    const kids = [];
    walk(g.nodes, text, { L, k }, kids, 0);
    item.lists = kids;
  });
  return L;
}

// Every list of the tree, the outermost first (depth first)
export function allLists(lists) {
  const out = [];
  const go = (ls) => { for (const L of ls) { out.push(L); for (const it of L.items) go(it.lists); } };
  go(lists);
  return out;
}
// The items that hold p, the outermost first: [{ L, k }]; p in an item's [\item, end of its text]
export function chainAt(lists, p) {
  const out = [];
  let ls = lists;
  for (let guard = 0; guard < 64; guard++) {
    let hit = null;
    for (const L of ls) {
      if (p < L.s || p > L.e) continue;
      const k = L.items.findIndex((it, i) => p >= it.s && (p <= it.e || (i + 1 < L.items.length ? p < L.items[i + 1].s : p <= L.es)));
      if (k >= 0) { hit = { L, k }; break; }
    }
    if (!hit) break;
    out.push(hit);
    ls = hit.L.items[hit.k].lists;
  }
  return out;
}
// how deep a list stands: its level among lists of its kind (enumerate in enumerate), and among all
export function levelOf(L) {
  let level = 1, depth = 1;
  for (let P = L.parent; P; P = P.L.parent) { depth++; if (P.L.kind === L.kind) level++; }
  return { level, depth };
}
// the item's line's indentation (the spaces before it on its line), or null where text stands before it
export function indentAt(src, p) {
  const ls = src.lastIndexOf('\n', p - 1) + 1, w = src.slice(ls, p);
  return /^[ \t]*$/.test(w) ? w : null;
}
// one step of the list's indentation: its items' indentation beyond its \begin's, else two spaces
function stepOf(src, L) {
  const b = indentAt(src, L.s), i = L.items.length ? indentAt(src, L.items[0].s) : null;
  return b != null && i != null && i.length > b.length && i.startsWith(b) ? i.slice(b.length) : '  ';
}
const itemInd = (src, L) => { const i = L.items.length ? indentAt(src, L.items[0].s) : null; return i != null ? i : (indentAt(src, L.s) || '') + stepOf(src, L); };
const beginInd = (src, L) => { const b = indentAt(src, L.s); return b != null ? b : ''; };

// [s, e) of src with every line after the first that starts with the indentation from starting with
// to instead (lines inside a verbatim environment as they are), and a map from offsets in [s, e) to
// offsets in the text made
function reindent(src, s, e, from, to, raw = []) {
  const t = src.slice(s, e);
  if (from === to) return { t, map: (p) => p - s };
  let out = '', i = 0;
  const marks = [];
  while (i < t.length) {
    const nl = t.indexOf('\n', i), z = nl < 0 ? t.length : nl + 1;
    const line = t.slice(i, z), at = s + i;
    let d = 0;
    if (i > 0 && !raw.some(([a, b]) => at > a && at < b)) {
      if (line.startsWith(from) && /\S/.test(line)) { out += to; d = from.length; marks.push([i, out.length - to.length, from.length, to.length]); }
    }
    out += line.slice(d);
    i = z;
  }
  // (a place inside an indentation that changed goes to the same place in the new one, or its end)
  return { t: out, map: (p) => {
    const off = p - s;
    let add = 0;
    for (const [li, , fl, tl] of marks) {
      if (li > off) break;
      if (off < li + fl) return li + add + Math.min(off - li, tl);
      add += tl - fl;
    }
    return off + add;
  } };
}
// the verbatim stretches of [s, e): no line in them is moved
function rawRanges(src, s, e) {
  const out = [];
  if (e - s > MAX) return out;
  const go = (ns) => { for (const n of ns) { if (!n) continue; if (n.t === 'env' && n.raw) out.push([n.s + s, n.e + s]); else if (n.nodes) go(n.nodes); } };
  if (/\\begin\s*\{\s*(verbatim|lstlisting|minted|Verbatim|alltt|comment)/.test(src.slice(s, e))) { try { go(parse(src.slice(s, e))); } catch (x) { return out; } }
  return out;
}

// a file written with CRLF keeps them in what is written into it
const CRLF = (src) => /\r\n/.test(src.slice(0, 4000));
export const crlf = (src, t) => (CRLF(src) ? t.replace(/\r?\n/g, '\r\n') : t);
const crlfAll = (src, r) => (r && r.edits && CRLF(src) ? { ...r, edits: r.edits.map((x) => ({ ...x, t: crlf(src, x.t) })) } : r);

// ---- formats -------------------------------------------------------------------------------------
// The bullet library (Word's, in LaTeX that compiles on pdfLaTeX, XeLaTeX and LuaLaTeX): code, the
// glyph the page and the gallery draw, the tile's name, a package the code needs
export const BULLETS = [
  { code: '\\textbullet', glyph: '•', name: 'Round bullet' },
  { code: '$\\circ$', glyph: '◦', name: 'Hollow round bullet' },
  { code: '\\tiny$\\blacksquare$', glyph: '▪', name: 'Square bullet', pkg: 'amssymb' },
  { code: '\\textendash', glyph: '–', name: 'Dash bullet' },
  { code: '$\\blacktriangleright$', glyph: '▸', name: 'Arrowhead bullet', pkg: 'amssymb' },
  { code: '\\checkmark', glyph: '✓', name: 'Check mark bullet', pkg: 'amssymb' },
  { code: '$\\star$', glyph: '⋆', name: 'Star bullet' },
  { code: '$\\diamond$', glyph: '⋄', name: 'Diamond bullet' },
  { code: '$\\rightarrow$', glyph: '→', name: 'Arrow bullet' }
];
// more for Define New Bullet
export const SYMBOLS = [
  ...BULLETS,
  { code: '$\\bullet$', glyph: '•', name: 'Math bullet' }, { code: '$\\blacksquare$', glyph: '■', name: 'Large square', pkg: 'amssymb' }, { code: '$\\square$', glyph: '□', name: 'Hollow square', pkg: 'amssymb' },
  { code: '$\\blacklozenge$', glyph: '⧫', name: 'Lozenge', pkg: 'amssymb' }, { code: '$\\lozenge$', glyph: '◊', name: 'Hollow lozenge', pkg: 'amssymb' }, { code: '$\\triangleright$', glyph: '▹', name: 'Hollow arrowhead' },
  { code: '$\\Rightarrow$', glyph: '⇒', name: 'Double arrow' }, { code: '$\\hookrightarrow$', glyph: '↪', name: 'Hook arrow' }, { code: '\\textemdash', glyph: '—', name: 'Long dash' },
  { code: '$\\ast$', glyph: '∗', name: 'Asterisk' }, { code: '$\\bigstar$', glyph: '★', name: 'Large star', pkg: 'amssymb' }, { code: '$\\times$', glyph: '×', name: 'Cross' },
  { code: '$+$', glyph: '+', name: 'Plus' }, { code: '$-$', glyph: '−', name: 'Minus' }, { code: '\\S', glyph: '§', name: 'Section sign' }, { code: '\\textparagraph', glyph: '¶', name: 'Pilcrow' },
  { code: '\\dag', glyph: '†', name: 'Dagger' }, { code: '\\textperiodcentered', glyph: '·', name: 'Middle dot' }
];
// The numbering library: enumitem's label (the counter as \alph* and the like) and the tile's name
export const NUMBERS = [
  { star: '\\arabic*.', name: 'Numbers 1. 2. 3.', show: ['1.', '2.', '3.'] },
  { star: '\\arabic*)', name: 'Numbers 1) 2) 3)', show: ['1)', '2)', '3)'] },
  { star: '\\Roman*.', name: 'Roman numerals I. II. III.', show: ['I.', 'II.', 'III.'] },
  { star: '\\Alph*.', name: 'Capital letters A. B. C.', show: ['A.', 'B.', 'C.'] },
  { star: '\\alph*)', name: 'Letters a) b) c)', show: ['a)', 'b)', 'c)'] },
  { star: '\\alph*.', name: 'Letters a. b. c.', show: ['a.', 'b.', 'c.'] },
  { star: '(\\alph*)', name: 'Letters (a) (b) (c)', show: ['(a)', '(b)', '(c)'] },
  { star: '\\roman*.', name: 'Roman numerals i. ii. iii.', show: ['i.', 'ii.', 'iii.'] }
];
// the number styles of Define New Number Format and Define New Multilevel List
export const STYLES = [['arabic', '1, 2, 3'], ['alph', 'a, b, c'], ['Alph', 'A, B, C'], ['roman', 'i, ii, iii'], ['Roman', 'I, II, III']];
// Multilevel lists: four levels each, for every list of their kind (\setlist in the preamble)
export const MULTI = [
  { name: 'Multilevel 1. a. i.', kind: 'enum', labels: ['\\arabic*.', '\\alph*.', '\\roman*.', '\\Alph*.'] },
  { name: 'Multilevel 1) a) i)', kind: 'enum', labels: ['\\arabic*)', '\\alph*)', '\\roman*)', '\\Alph*)'] },
  { name: 'Multilevel 1. 1.1. 1.1.1.', kind: 'enum', labels: ['\\arabic*.', '\\arabic{enumi}.\\arabic*.', '\\arabic{enumi}.\\arabic{enumii}.\\arabic*.', '\\arabic{enumi}.\\arabic{enumii}.\\arabic{enumiii}.\\arabic*.'] },
  { name: 'Multilevel I. A. 1. a)', kind: 'enum', labels: ['\\Roman*.', '\\Alph*.', '\\arabic*.', '\\alph*)'] },
  { name: 'LaTeX\'s numbering 1. (a) i. A.', kind: 'enum', labels: null },
  { name: 'Multilevel bullets • ◦ ▪ –', kind: 'item', labels: ['\\textbullet', '$\\circ$', '\\tiny$\\blacksquare$', '\\textendash'] },
  { name: 'LaTeX\'s bullets • – ∗ ·', kind: 'item', labels: null }
];
// LaTeX's own labels, level by level (article, report, book; KOMA's and memoir's are the same)
export const DEFAULT = { enum: ['\\arabic*.', '(\\alph*)', '\\roman*.', '\\Alph*.'], item: ['\\textbullet', '\\normalfont\\bfseries\\textendash', '\\textasteriskcentered', '\\textperiodcentered'] };
const THE = ['arabic', 'alph', 'roman', 'Alph'];

const tidy = (s) => String(s).replace(/\s+/g, '').replace(/^\{(.*)\}$/, '$1');
// (TeX prints nothing for a letter or a roman numeral of 0 or less: start=0 with \alph* is ")")
const val = (n, k) => k === 'arabic' ? String(n) : n <= 0 ? '' : k === 'alph' ? alph(n) : k === 'Alph' ? alph(n).toUpperCase() : k === 'roman' ? roman(n) : roman(n).toUpperCase();
function roman(n) {
  if (!(n > 0) || n > 3999) return String(n);
  let s = '';
  for (const [v, r] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (n >= v) { s += r; n -= v; }
  return s;
}
const alph = (n) => (n >= 1 && n <= 26 ? String.fromCharCode(96 + n) : String(n));

// A label in LaTeX 2e's own terms (\alph{enumii}, \theenumi) at level ℓ, made enumitem's
// (\alph*); the counters of the levels above stay as they are
// (kept per set of \theenum definitions, the preamble's object, which a build reads once: then by
// level and code, the strings themselves as keys, so a stranger's 2000 lists with a 2000 character
// \theenumi cost one expansion, not one each nor a key of that length built each time)
const starCache = new WeakMap();
const NO_THE = {};
export function starOf(code, level, the = NO_THE) {
  let A = starCache.get(the);
  if (!A) starCache.set(the, (A = new Map()));
  let B = A.get(level);
  if (!B) A.set(level, (B = new Map()));
  const hit = B.get(code);
  if (hit != null) return hit;
  const v = starOf0(String(code), level, the);
  if (B.size > 500) B.clear();
  B.set(code, v);
  return v;
}
function starOf0(t, level, the) {
  // (a definition that names itself, \renewcommand{\theenumi}{\theenumi\theenumi...}, would grow
  // fourfold exponentially: the expansion stops at 2000 characters, within a pass too)
  for (let k = 0; k < 4 && t.length < 2000; k++) {
    let grown = t.length;
    t = t.replace(/\\theenum(iv|i{1,3})(?![A-Za-z])/g, (m, r) => {
      if (grown > 2000) return m;
      const x = '{' + (the[ROMAN.indexOf(r)] || '\\' + THE[ROMAN.indexOf(r) - 1] + '{enum' + r + '}') + '}';
      grown += x.length - m.length;
      return x;
    });
  }
  if (t.length > 2000) t = t.slice(0, 2000);
  return t.replace(/\\(arabic|alph|Alph|roman|Roman)\s*\{\s*enum(iv|i{1,3})\s*\}/g, (m, k, r) => ROMAN.indexOf(r) === level ? '\\' + k + '*' : '\\' + k + '{enum' + r + '}').replace(/\{(\\(?:arabic|alph|Alph|roman|Roman)\*)\}/g, '$1');
}
// enumitem's label as LaTeX 2e writes it at level ℓ (for \def\labelenumii{...})
export const l2eOf = (star, level) => String(star).replace(/\\(arabic|alph|Alph|roman|Roman)\*/g, '\\$1{enum' + ROMAN[level] + '}');
// The enumerate package's short label ("(a)", "i.", "{Step} 1") as enumitem's; null when none of
// a, A, i, I, 1 stands outside braces in it
export function starOfShort(t) {
  t = String(t);
  let d = 0;
  for (let i = 0; i < t.length && i < 200; i++) {
    const c = t[i];
    if (c === '\\') { i++; while (i < t.length && /[A-Za-z]/.test(t[i + 1] || '')) i++; continue; }
    if (c === '{') d++;
    else if (c === '}') d--;
    else if (!d && 'aAiI1'.includes(c)) return t.slice(0, i).replace(/^\{(.*)\}$/, '$1') + '\\' + { a: 'alph', A: 'Alph', i: 'roman', I: 'Roman', 1: 'arabic' }[c] + '*' + t.slice(i + 1);
  }
  return null;
}
// enumitem's label as a short label, or null where it has more than one counter
export function shortOf(star) {
  const m = /\\(arabic|alph|Alph|roman|Roman)\*/.exec(star);
  if (!m || /\\(arabic|alph|Alph|roman|Roman)\s*[*{]/.test(star.slice(m.index + m[0].length))) return null;
  // (text with a counter's letter, or a bracket, braced: the bracket would end the option)
  const lit = (s) => (/[aAiI1[\]]/.test(s) ? '{' + s + '}' : s);
  return lit(star.slice(0, m.index)) + { arabic: '1', alph: 'a', Alph: 'A', roman: 'i', Roman: 'I' }[m[1]] + lit(star.slice(m.index + m[0].length));
}
// The text a numbered item's label shows: star with n for its counter, vals for the levels above
// (vals[0] the first level's number); braces, \textbf and the like gone
const numCache = new Map();
export function numText(star, n, vals = []) {
  // (the same label and numbers for every one-item list of a long document: worked out once)
  const key = n + ',' + vals.join(',');
  let A = numCache.get(star);
  if (A && A.has(key)) return A.get(key);
  if (!A) { if (numCache.size > 200) numCache.clear(); numCache.set(star, (A = new Map())); }
  if (A.size > 200) A.clear();
  const v = numText0(star, n, vals);
  A.set(key, v);
  return v;
}
function numText0(star, n, vals) {
  return String(star)
    .replace(/\\(arabic|alph|Alph|roman|Roman)\*/g, (m, k) => val(n, k))
    .replace(/\\(arabic|alph|Alph|roman|Roman)\s*\{\s*enum(iv|i{1,3})\s*\}/g, (m, k, r) => val(vals[ROMAN.indexOf(r) - 1] || 0, k))
    .replace(/\\(?:textbf|textit|emph|textup|textsc|textrm|textsf|upshape|bfseries|itshape|normalfont|rmfamily|small|footnotesize)(?![A-Za-z])\s*/g, '')
    .replace(/\\ |~/g, ' ').replace(/[{}]/g, '').replace(/\$/g, '').trim();
}
// The glyph a bullet's code draws (the page and the gallery): the library's, LaTeX's, a character
// typed as text; '' for none; null where the code is more than the page can tell
const GLYPHS = { textbullet: '•', bullet: '•', circ: '◦', textendash: '–', textemdash: '—', blacksquare: '▪', square: '□', blacktriangleright: '▸', triangleright: '▹', checkmark: '✓', star: '⋆', bigstar: '★',
  diamond: '⋄', rightarrow: '→', to: '→', Rightarrow: '⇒', hookrightarrow: '↪', ast: '∗', textasteriskcentered: '∗', textperiodcentered: '·', cdot: '·', times: '×', blacklozenge: '⧫', lozenge: '◊',
  S: '§', textparagraph: '¶', P: '¶', dag: '†', ddag: '‡', textdagger: '†', rhd: '▹', triangleright_: '▹', minus: '−', ding: null, textgreater: '>', textless: '<', diamondsuit: '♢', clubsuit: '♣', heartsuit: '♡', spadesuit: '♠', checkmark_: '✓' };
// The text of a number label around its counter as a field shows it: ~ a no-break space (typing's
// escape gives it back as ~), \% and the like their character, {} nothing; null where it holds
// anything else (a command, a group), which the dialogs keep as written
export function labelText(t) {
  let out = '';
  const ch = { textasciitilde: '~', textasciicircum: '^', textbackslash: '\\' };
  for (let i = 0; i < t.length;) {
    const r = t.slice(i, i + 20);
    let m;
    if ((m = /^\\(textasciitilde|textasciicircum|textbackslash)\{\}/.exec(r))) { out += ch[m[1]]; i += m[0].length; }
    else if ((m = /^\\([#$%&_{}])/.exec(r))) { out += m[1]; i += 2; }
    else if (r.startsWith('{}')) i += 2;
    else if (r[0] === '~') { out += ' '; i++; }
    else if (r.startsWith('---')) { out += '—'; i += 3; }
    else if (r.startsWith('--')) { out += '–'; i += 2; }
    else if (r.startsWith('``')) { out += '“'; i += 2; }
    else if (r.startsWith("''")) { out += '”'; i += 2; }
    else if (/[\\{}$^_#&%]/.test(r[0])) return null;
    else { out += r[0]; i++; }
  }
  return out;
}
// A number label (enumitem's form) as Define New Number Format and Define New Multilevel List
// show it: { before, style, after, up } (up: the levels above written before it, as
// \arabic{enumi}.), or null where it is written some other way (\textbf{\alph*}, \S\roman*)
export function numberParts(code) {
  const t = String(code || '');
  // (one counter of its own, found by a plain search: no pattern that could backtrack over a
  // stranger's label; a label that long is kept as written)
  if (t.length > 200) return null;
  const all = [...t.matchAll(/\\(arabic|alph|Alph|roman|Roman)\*/g)];
  if (all.length !== 1) return null;
  const m = all[0];
  let head = t.slice(0, m.index);
  const after = labelText(t.slice(m.index + m[0].length));
  // the levels above written before it, as \arabic{enumi}. (each with what follows it up to the next)
  const up = [];
  const ups = /\\(arabic|alph|Alph|roman|Roman)\{enum(?:iv|i{1,3})\}[^\\]*/g;
  let first = -1;
  for (const u of head.matchAll(ups)) { if (first < 0) first = u.index; up.push(u[1]); }
  if (first >= 0) {
    // (only where they run on to the counter, one after another)
    if (head.slice(first).replace(ups, '') !== '') return null;
    head = head.slice(0, first);
  }
  const before = labelText(head);
  if (before == null || after == null) return null;
  return { before, style: m[1], after, up };
}
// A character typed as a bullet (Define New Bullet), as LaTeX: one of the symbols' glyphs is that
// symbol's code; ASCII as typing escapes it (esc); anything else as it is where the engine reads
// Unicode (XeLaTeX, LuaLaTeX) or, on pdfLaTeX, where the T1 fonts have it (Latin-1). pdfLaTeX's
// default fonts have no »: "Command \guillemetright unavailable in encoding OT1", and nothing has
// →: "Unicode character → not set up". { code, pkg } or { error }.
export function bulletCode(text, o = {}) {
  const t = String(text).trim();
  if (!t) return { error: 'Type a character, or pick a symbol.' };
  const latex = o.latex != null ? o.latex : /[\\$]/.test(t);
  const sym = !latex && SYMBOLS.find((x) => x.glyph === t);
  if (sym) return { code: sym.code, pkg: sym.pkg || null };
  const code = latex || !o.esc ? t : o.esc(t);
  // (one character of the text that pdfLaTeX could not print)
  const bad = o.unicode ? null : [...t].find((c) => c.codePointAt(0) > 0x7e && !(o.t1 && c.codePointAt(0) >= 0xa1 && c.codePointAt(0) <= 0xff));
  if (!bad) return { code, pkg: null };
  return { error: 'pdfLaTeX\'s fonts here have no ' + bad + ': pick a symbol, write it in LaTeX (such as $\\gg$), or compile with XeLaTeX or LuaLaTeX.' };
}
// Whether a document is compiled by an engine that reads Unicode (the engine chosen, else what
// the worker's pickEngine would choose from the same lines), and whether pdfLaTeX's fonts are T1
export function textEngine(src, chosen = 'auto') {
  // (every pattern bounded: a stranger's preamble of "\usepackage[" without "]" read in a line's time)
  const pre = stripComments(String(src).slice(0, Math.min(200000, Math.max(0, preambleEnd(src)))));
  const t1 = [...pre.matchAll(/\\usepackage\s*\[([^\]]{0,500})\]\s*\{fontenc\}/g)].some((m) => /\bT1\b/.test(m[1]));
  if (chosen === 'xelatex' || chosen === 'lualatex') return { unicode: true, t1 };
  if (chosen === 'pdflatex') return { unicode: false, t1 };
  const magic = /^[ \t]*%+[ \t]*!\s*TEX\s+(?:TS-)?program\s*=\s*([\w-]+)/im.exec(String(src).slice(0, 8000));
  if (magic) return { unicode: /^(xe|lua)/i.test(magic[1]), t1 };
  const cls = (/\\documentclass\s*(?:\[[^\]]{0,500}\])?\s*\{([^}]{0,100})\}/.exec(pre) || [])[1] || '';
  const pkgs = new Set();
  for (const m of pre.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]{0,500}\])?\s*\{([^}]{0,500})\}/g)) for (const x of m[1].split(',')) pkgs.add(x.trim());
  const unicode = /^(xe|lua|ltj|ctex)/i.test(cls) || [...pkgs].some((x) => /^(fontspec|unicode-math|polyglossia|xeCJK|ctex|luatexja[\w-]*|luacode|luaotfload|fontsetup|mathspec|bidi)$/.test(x)) ||
    /\\(setmainfont|setsansfont|newfontfamily|setmathfont|directlua)\b/.test(pre);
  return { unicode, t1 };
}
export function bulletGlyph(code) {
  let t = String(code).trim();
  if (t.length > 200) return null;
  t = t.replace(/\\(?:normalfont|bfseries|mdseries|upshape|itshape|tiny|scriptsize|footnotesize|small|normalsize|large|Large|rmfamily|sffamily|ttfamily|boldmath|unboldmath)(?![A-Za-z])\s*/g, '')
    .replace(/\\(?:(?:textbf|textit|textrm|textsf|ensuremath|mathbf|mathrm|text)(?![A-Za-z])|raisebox\{[^{}]*\}|scalebox\{[^{}]*\})\s*/g, '').replace(/^\$(.*)\$$/, '$1').replace(/^\\\((.*)\\\)$/, '$1').replace(/^\{(.*)\}$/, '$1').trim();
  if (t === '' ) return '';
  if (t === '--') return '–';
  if (t === '---') return '—';
  if (t === '-' || t === '$-$') return '-';
  const m = /^\\([A-Za-z]+)\s*(?:\{\})?$/.exec(t);
  if (m) return Object.hasOwn(GLYPHS, m[1]) && GLYPHS[m[1]] ? GLYPHS[m[1]] : null;
  if (!/[\\{}$%&#^_~]/.test(t) && t.length <= 6) return t;
  return null;
}

// ---- the preamble's set up of lists -----------------------------------------------------------------
// What the preamble says of every list: \setlist (enumitem), \renewcommand of \labelitemi,
// \labelenumi and \theenumi; { setlist: [{ names, levels, kv, s, e, arg }], labelitem: { 1: code },
// labelenum: { 1: code }, theenum: { 1: code } } (names, levels: null for all). end: where it ends.
export function listSetup(src, end) {
  const out = { setlist: [], labelitem: {}, labelenum: {}, theenum: {}, pos: { labelitem: {}, labelenum: {}, theenum: {} } };
  if (end == null) end = preambleEnd(src);
  if (end < 0) return out;
  const pre = stripComments(src.slice(0, Math.min(end, PRE)));
  const re = /\\(setlist|renewcommand|def)(?![A-Za-z@])/g;
  let m, n = 0;
  while ((m = re.exec(pre)) && n++ < 3000) {
    let i = skip(pre, m.index + m[0].length);
    if (m[1] === 'setlist') {
      if (pre[i] === '*') i = skip(pre, i + 1);
      let names = null, levels = null;
      if (pre[i] === '[') {
        const z = groupEnd(pre, i, 400);
        if (z < 0) continue;
        const parts = pre.slice(i + 1, z - 1).split(',').map((x) => x.trim()).filter(Boolean);
        const lv = parts.filter((x) => /^\d$/.test(x)).map(Number), nm = parts.filter((x) => !/^\d$/.test(x));
        names = nm.length ? new Set(nm) : null; levels = lv.length ? new Set(lv) : null;
        i = skip(pre, z);
      }
      if (pre[i] !== '{') continue;
      const z = groupEnd(pre, i, 4000);
      if (z < 0) continue;
      out.setlist.push({ names, levels, kv: parseKV(src, i + 1, z - 1), s: m.index, e: z, arg: [i + 1, z - 1] });
      re.lastIndex = z;
      continue;
    }
    if (pre[i] === '*') i = skip(pre, i + 1);
    const br = pre[i] === '{';
    if (br) i = skip(pre, i + 1);
    const w = /^\\(labelitem|labelenum|theenum)(iv|i{1,3})(?![A-Za-z@])/.exec(pre.slice(i, i + 20));
    if (!w) continue;
    i += w[0].length;
    if (br) { i = skip(pre, i); if (pre[i] !== '}') continue; i++; }
    i = skip(pre, i);
    if (pre[i] !== '{') continue;
    const z = groupEnd(pre, i, 2000);
    if (z < 0) continue;
    out[w[1]][ROMAN.indexOf(w[2])] = src.slice(i + 1, z - 1).trim();
    // (where it is written: Multilevel list rewrites it in place where enumitem cannot be added)
    const ls = pre.lastIndexOf('\n', m.index - 1) + 1, nl = pre.indexOf('\n', z);
    out.pos[w[1]][ROMAN.indexOf(w[2])] = { s: m.index, e: z, vs: i + 1, ve: z - 1, line: /^[ \t]*$/.test(pre.slice(ls, m.index)) && /^[ \t]*$/.test(pre.slice(z, nl < 0 ? pre.length : nl)) ? [ls, nl < 0 ? pre.length : nl + 1] : null };
    re.lastIndex = z;
  }
  return out;
}
const skip = (t, i) => { let nl = 0; while (i < t.length && /\s/.test(t[i])) { if (t[i] === '\n' && ++nl > 1) break; i++; } return i; };

// A list's own set up (the text before its first \item): \def\labelenumi{...},
// \renewcommand{\labelitemii}{...}, \setcounter{enumi}{4}, \setlength{\itemsep}{0pt}, \tightlist;
// [{ what ('labelenum', 'labelitem', 'theenum', 'counter', 'itemsep', 'tight'), level, value, s, e, vs, ve }]
export function setupOf(src, L) {
  const out = [], s = L.be, e = Math.min(L.setupE, L.be + 4000), t = stripComments(src.slice(s, e));
  const re = /\\(def|renewcommand|setcounter|setlength|itemsep|tightlist)(?![A-Za-z@])/g;
  let m, n = 0;
  while ((m = re.exec(t)) && n++ < 50) {
    let i = skip(t, m.index + m[0].length);
    if (m[1] === 'tightlist') { out.push({ what: 'tight', s: s + m.index, e: s + i }); continue; }
    if (m[1] === 'itemsep') {
      const v = /^=?\s*(-?[\d.]+\s*(?:pt|em|ex|mm|cm|in|bp)|\\z@)/.exec(t.slice(i, i + 40));
      if (v) { out.push({ what: 'itemsep', value: v[1], s: s + m.index, e: s + i + v[0].length }); re.lastIndex = i + v[0].length; }
      continue;
    }
    if (m[1] === 'setcounter' || m[1] === 'setlength') {
      if (t[i] !== '{' && !(m[1] === 'setlength' && t[i] === '\\')) continue;
      let z = t[i] === '{' ? groupEnd(t, i, 100) : i + (/^\\[A-Za-z]+/.exec(t.slice(i, i + 40)) || [''])[0].length;
      if (z < 0 || z === i) continue;
      const what = t.slice(i, z).replace(/[{}\s]/g, '');
      const j = skip(t, z);
      if (t[j] !== '{') continue;
      const y = groupEnd(t, j, 200);
      if (y < 0) continue;
      const v = t.slice(j + 1, y - 1).trim();
      const c = /^enum(iv|i{1,3})$/.exec(what);
      if (m[1] === 'setcounter' && c) out.push({ what: 'counter', level: ROMAN.indexOf(c[1]), value: v, s: s + m.index, e: s + y, vs: s + j + 1, ve: s + y - 1 });
      else if (m[1] === 'setlength' && what === '\\itemsep') out.push({ what: 'itemsep', value: v, s: s + m.index, e: s + y, vs: s + j + 1, ve: s + y - 1 });
      re.lastIndex = y;
      continue;
    }
    if (m[1] === 'renewcommand' && t[i] === '*') i = skip(t, i + 1);
    const br = t[i] === '{';
    if (br) i = skip(t, i + 1);
    const w = /^\\(labelitem|labelenum|theenum)(iv|i{1,3})(?![A-Za-z@])/.exec(t.slice(i, i + 20));
    if (!w) continue;
    i += w[0].length;
    if (br) { i = skip(t, i); if (t[i] !== '}') continue; i++; }
    i = skip(t, i);
    if (t[i] !== '{') continue;
    const z = groupEnd(t, i, 1000);
    if (z < 0) continue;
    out.push({ what: w[1], level: ROMAN.indexOf(w[2]), value: src.slice(s + i + 1, s + z - 1).trim(), s: s + m.index, e: s + z, vs: s + i + 1, ve: s + z - 1 });
    re.lastIndex = z;
  }
  return out;
}

const FLAGS = new Set(['nosep', 'noitemsep', 'resume', 'resume*', 'nolistsep', 'wide', 'inline', 'before', 'after', 'series', 'beginpenalty', 'topsep', 'partopsep', 'parsep', 'itemsep', 'leftmargin', 'rightmargin', 'labelsep', 'labelwidth', 'itemindent', 'listparindent', 'align', 'font', 'format', 'ref', 'start', 'label', 'label*', 'widest', 'labelindent', 'noitemsep*', 'first', 'first*', 'style', 'mode', 'before*', 'after*']);
// A list's options as { key: { value, s, e } } and its short label (enumerate's "(a)"), if any
export function optionsOf(src, L) {
  const out = { kv: {}, short: null };
  if (!L.opt) return out;
  for (const x of parseKV(src, L.opt.is, L.opt.ie).slice(0, 60)) {
    if (x.value == null && !FLAGS.has(x.key) && !/^</.test(x.key)) { if (!out.short) out.short = x; continue; }
    out.kv[x.key] = x;
  }
  return out;
}

// What labels and numbers a list, and where each is written:
// { label (enumitem's terms for a numbered list, LaTeX's code for a bulleted one), from ('opt',
//   'short', 'def' (its own set up), 'setlist', 'pre' (the preamble's \renewcommand), 'default'),
//   at ({ s, e } of what to rewrite: the option's value, the short label, the definition's body),
//   star (from label*, the label is the level above's followed by this one), start (its first
//   number), startFrom ('opt', 'counter' or null) and startAt, resume (true, 'resume*' or false),
//   sep ('nosep', 'noitemsep', a length for itemsep, 'tight' or null) and sepFrom, level, depth }
export function formatOf(src, L, cfg, lv) {
  const { level, depth } = lv || levelOf(L), kind = L.kind, o = optionsOf(src, L), su = setupOf(src, L);
  const f = { kind, level, depth, label: null, from: 'default', at: null, star: false, start: 1, startFrom: null, startAt: null, resume: false, sep: null, sepFrom: null, opts: o };
  const sets = cfg ? cfg.setlist.filter((x) => (!x.names || x.names.has(L.name) || (x.names.has(kind === 'enum' ? 'enumerate' : kind === 'item' ? 'itemize' : 'description'))) && (!x.levels || x.levels.has(depth) || x.levels.has(level))) : [];
  const fromKV = (get) => { for (let i = sets.length - 1; i >= 0; i--) { const v = get(sets[i].kv); if (v !== undefined) return v; } return undefined; };
  // (the preamble's own object where the list sets none: starOf's results are kept by it)
  let the = cfg ? cfg.theenum : NO_THE;
  if (su.some((x) => x.what === 'theenum')) { the = { ...the }; for (const x of su) if (x.what === 'theenum') the[x.level] = x.value; }
  // the label
  const own = o.kv['label'] || o.kv['label*'];
  if (own) { f.label = own.value.replace(/^\{([\s\S]*)\}$/, '$1'); f.from = 'opt'; f.star = !!o.kv['label*'] && !o.kv['label']; f.at = { s: own.s + own.key.length + 1, e: own.e }; }
  else if (o.short && kind === 'enum') { const st = starOfShort(o.short.key.replace(/^\{([\s\S]*)\}$/, '$1')); if (st) { f.label = st; f.from = 'short'; f.at = { s: o.short.s, e: o.short.e }; } }
  else if (o.short && kind === 'item') { f.label = o.short.key.replace(/^\{([\s\S]*)\}$/, '$1'); f.from = 'short'; f.at = { s: o.short.s, e: o.short.e }; }
  if (!f.label) {
    const d = su.filter((x) => x.what === (kind === 'enum' ? 'labelenum' : 'labelitem') && x.level === level).pop();
    if (d && kind !== 'desc') { f.label = kind === 'enum' ? starOf(d.value, level, the) : d.value; f.from = 'def'; f.at = { s: d.vs, e: d.ve }; }
  }
  if (!f.label && kind !== 'desc') {
    const v = fromKV((kv) => { const x = kv.find((y) => y.key === 'label' || y.key === 'label*'); return x ? x : undefined; });
    if (v) { f.label = v.value.replace(/^\{([\s\S]*)\}$/, '$1'); f.from = 'setlist'; f.star = v.key === 'label*'; }
  }
  if (!f.label && kind !== 'desc' && cfg) {
    const p = (kind === 'enum' ? cfg.labelenum : cfg.labelitem)[level];
    if (p) { f.label = kind === 'enum' ? starOf(p, level, the) : p; f.from = 'pre'; }
  }
  if (!f.label && kind === 'enum' && the[level]) { f.label = starOf(DEFAULT.enum[level - 1].replace(/\\(arabic|alph|Alph|roman|Roman)\*/, '\\theenum' + ROMAN[level]), level, the); f.from = 'pre'; }
  if (!f.label && kind !== 'desc') f.label = (DEFAULT[kind] || [])[Math.min(3, level - 1)] || null;
  // (a label of a stranger's longer than any label: drawn as its first 400 characters, not copied
  // onto every item of the page)
  if (f.label && f.label.length > 400) f.label = f.label.slice(0, 400);
  // the first number
  if (kind === 'enum') {
    const st = o.kv.start, c = su.filter((x) => x.what === 'counter' && x.level === level).pop();
    if (st && /^-?\d+$/.test(st.value)) { f.start = +st.value; f.startFrom = 'opt'; f.startAt = { s: st.s, e: st.e }; }
    else if (c && /^-?\d+$/.test(c.value)) { f.start = +c.value + 1; f.startFrom = 'counter'; f.startAt = { s: c.vs, e: c.ve, line: [c.s, c.e] }; }
    else { const v = fromKV((kv) => { const x = kv.find((y) => y.key === 'start'); return x ? x.value : undefined; }); if (v && /^-?\d+$/.test(v)) f.start = +v; }
    f.resume = o.kv['resume*'] ? 'resume*' : o.kv.resume ? (o.kv.resume.value ? o.kv.resume.value : true) : false;
    // enumitem's series: series=foo names this list's count; resume=foo and resume*=foo go on from it
    const name = (x) => (x && x.value ? x.value.replace(/^\{([\s\S]*)\}$/, '$1').trim().slice(0, 60) : null);
    f.series = name(o.kv.series);
    f.resumeName = typeof f.resume === 'string' && f.resume !== 'resume*' ? f.resume.replace(/^\{([\s\S]*)\}$/, '$1').trim().slice(0, 60) : name(o.kv['resume*']);
    if (f.resumeName) { f.resume = o.kv['resume*'] ? 'resume*' : true; f.series = f.series || f.resumeName; }
    // what \ref gives: enumitem's ref= (else its label, as written); LaTeX's own lists \theenumi
    // with the levels above it (\theenumi in this level's terms: a \renewcommand, the enumerate
    // package's style, LaTeX's arabic, alph, roman, Alph)
    const ref = o.kv.ref || (() => { const v = fromKV((kv) => { const x = kv.find((y) => y.key === 'ref'); return x ? x : undefined; }); return v; })();
    f.ref = ref ? ref.value.replace(/^\{([\s\S]*)\}$/, '$1').slice(0, 400) : null;
    const counter = (star) => { const m = /\\(arabic|alph|Alph|roman|Roman)\*/.exec(star || ''); return m ? '\\' + m[1] + '*' : null; };
    f.theStar = the[level] ? starOf(the[level], level, the) : f.from === 'short' || f.from === 'opt' || f.from === 'setlist' ? counter(f.label) || '\\' + THE[level - 1] + '*' : '\\' + THE[Math.min(3, level - 1)] + '*';
  }
  // the space between items
  for (const k of ['nosep', 'noitemsep', 'itemsep']) if (o.kv[k]) { f.sep = k === 'itemsep' ? o.kv[k].value : k; f.sepFrom = 'opt'; break; }
  if (!f.sep) { const x = su.find((y) => y.what === 'itemsep' || y.what === 'tight'); if (x) { f.sep = x.what === 'tight' ? 'tight' : x.value; f.sepFrom = 'def'; } }
  if (!f.sep) { const v = fromKV((kv) => { const x = kv.find((y) => ['nosep', 'noitemsep', 'itemsep'].includes(y.key)); return x ? (x.key === 'itemsep' ? x.value : x.key) : undefined; }); if (v) { f.sep = v; f.sepFrom = 'setlist'; } }
  return f;
}

// The label LaTeX would print for a list's first level by default, and whether a label is one
// (the bullet drawn the same: $\bullet$ is \textbullet)
export function sameBullet(a, b) { if (a == null || b == null) return false; const x = bulletGlyph(a), y = bulletGlyph(b); return x != null && y != null ? x === y : tidy(a) === tidy(b); }
export const sameNumber = (a, b) => a != null && b != null && tidy(a) === tidy(b);

// ---- how a label or a number is written -----------------------------------------------------------
// Which way a document labels its lists: 'enumitem' (loaded, or to be loaded), 'short' (the
// enumerate package: "[(a)]"; bullets as \renewcommand{\labelitemi} in the list), 'paralist'
// (short labels for both), 'beamer' (short labels for numbers, no bullets of the list's own)
export function mechOf(o) {
  if (o.cls === 'beamer') return 'beamer';
  if (o.has('enumitem')) return 'enumitem';
  if (o.has('paralist')) return 'paralist';
  if (o.has('enumerate')) return 'short';
  return 'enumitem';
}
// whether the symbols of amssymb are there, or another package gives them (and amssymb would clash)
export const OWN_SYMBOLS = ['amssymb', 'unicode-math', 'newtxmath', 'newpxmath', 'mtpro2', 'stix', 'stix2', 'fdsymbol', 'MnSymbol', 'mathabx', 'kpfonts', 'libertinust1math', 'lucimatx', 'minionpro', 'mathdesign', 'fourier', 'boisik', 'txfonts', 'pxfonts'];

// The edits that give list L the label code (enumitem's terms for numbers, LaTeX's code for
// bullets; null: LaTeX's own for its level again), written the way the list already writes its
// label, else the way mech says. Returns { edits, pkgs } (pkgs: packages it then needs) or null.
export const labelEdits = (src, L, code, cfg, mech) => crlfAll(src, labelEdits0(src, L, code, cfg, mech));
function labelEdits0(src, L, code, cfg, mech) {
  const f = formatOf(src, L, cfg), kind = L.kind, level = f.level;
  if (kind === 'desc') return null;
  // the label the level gets without one of the list's own (the preamble's, LaTeX's)
  const g = formatOf(src, { ...L, opt: null, be: L.setupE }, cfg);
  const plain = code == null || (kind === 'enum' ? sameNumber(code, g.label) : sameBullet(code, g.label) && tidy(code) === tidy(g.label));
  const edits = [], pkgs = [];
  const braced = (v) => (/[,=\]\[]/.test(v) ? '{' + v + '}' : v);
  if (f.from === 'opt' || (f.from !== 'short' && f.from !== 'def' && (mech === 'enumitem' || (mech === 'paralist' && false)))) {
    if (f.from !== 'opt' && plain) return { edits: [], pkgs };
    if (L.opt) edits.push(...kvEdits(src, L.opt.is, L.opt.ie, plain ? { label: null, 'label*': null } : { label: braced(code), 'label*': null }));
    else edits.push({ s: L.be, e: L.be, t: '[label=' + braced(code) + ']' });
    if (L.opt && plain && edits.length && !/\S/.test(stripComments(apply(src.slice(L.opt.is, L.opt.ie), edits.map((x) => ({ s: x.s - L.opt.is, e: x.e - L.opt.is, t: x.t })))))) return { edits: [{ s: L.opt.s, e: L.opt.e, t: '' }], pkgs };
    if (!plain) pkgs.push('enumitem');
    return { edits, pkgs };
  }
  if (f.from === 'short' || ((mech === 'short' || mech === 'beamer' || mech === 'paralist') && (kind === 'enum' || mech === 'paralist'))) {
    const t = plain ? '' : kind === 'enum' ? shortOf(code) : '{' + code + '}';
    if (t == null) return null;
    if (f.from === 'short') {
      // the short label alone in its brackets: they go with it
      const only = L.opt && src.slice(L.opt.is, L.opt.ie).trim() === src.slice(f.at.s, f.at.e).trim();
      if (!t) return { edits: [only ? { s: L.opt.s, e: L.opt.e, t: '' } : cutKV(src, L, f.at)], pkgs };
      return { edits: [{ s: f.at.s, e: f.at.e, t }], pkgs };
    }
    if (!t) return { edits: [], pkgs };
    if (L.opt) return null;
    return { edits: [{ s: L.be, e: L.be, t: '[' + t + ']' }], pkgs };
  }
  // LaTeX 2e's own: \renewcommand{\labelenumii}{...} in the list (or the definition it has, rewritten)
  const v = plain ? null : kind === 'enum' ? l2eOf(code, level) : code;
  if (f.from === 'def') {
    if (v == null) { const su = setupOf(src, L).filter((x) => x.what === (kind === 'enum' ? 'labelenum' : 'labelitem') && x.level === level).pop(); return su ? { edits: [lineCut(src, su.s, su.e)], pkgs } : null; }
    return { edits: [{ s: f.at.s, e: f.at.e, t: v }], pkgs };
  }
  if (v == null) return { edits: [], pkgs };
  const ind = itemInd(src, L);
  return { edits: [{ s: L.be, e: L.be, t: '\n' + ind + '\\renewcommand{\\label' + (kind === 'enum' ? 'enum' : 'item') + ROMAN[level] + '}{' + v + '}' }], pkgs };
}
const apply = (t, edits) => { for (const x of [...edits].sort((a, b) => b.s - a.s)) t = t.slice(0, x.s) + x.t + t.slice(x.e); return t; };
// a key=value item taken out of a list's options with the comma before or after it
function cutKV(src, L, at) {
  const items = parseKV(src, L.opt.is, L.opt.ie), k = items.findIndex((x) => x.s === at.s);
  if (k < 0) return { s: at.s, e: at.e, t: '' };
  if (items.length === 1) return { s: L.opt.s, e: L.opt.e, t: '' };
  return k > 0 ? { s: items[k - 1].e, e: items[k].e, t: '' } : { s: items[0].s, e: items[1].s, t: '' };
}
// a line of a list's set up taken out whole (its line break too), or just the command
function lineCut(src, s, e) {
  const ls = src.lastIndexOf('\n', s - 1) + 1, nl = src.indexOf('\n', e);
  if (/^[ \t]*$/.test(src.slice(ls, s)) && /^[ \t]*$/.test(src.slice(e, nl < 0 ? src.length : nl))) return { s: ls > 0 ? ls - 1 : ls, e: nl < 0 ? src.length : nl, t: '' };
  return { s, e, t: '' };
}

// The edits that make a numbered list start at n (1: as LaTeX starts it), as it already writes
// its start (start=, \setcounter), else as mech says; resume goes. null where it cannot be written.
export const startEdits = (src, L, n, cfg, mech) => crlfAll(src, startEdits0(src, L, n, cfg, mech));
function startEdits0(src, L, n, cfg, mech) {
  const f = formatOf(src, L, cfg);
  if (L.kind !== 'enum') return null;
  n = Math.round(n);
  if (!(n >= 0 && n <= maxStart(f))) return null;
  const edits = [], pkgs = [];
  const drop = { resume: null, 'resume*': null };
  if (f.startFrom === 'counter') {
    if (L.opt && (f.opts.kv.resume || f.opts.kv['resume*'])) edits.push(...optDrop(src, L, drop));
    if (n === 1) edits.push(lineCut(src, f.startAt.line[0], f.startAt.line[1]));
    else edits.push({ s: f.startAt.s, e: f.startAt.e, t: String(n - 1) });
    return { edits, pkgs };
  }
  if (f.startFrom === 'opt' || mech === 'enumitem') {
    const ch = { start: n === 1 ? null : String(n), ...drop };
    if (L.opt) edits.push(...optDrop(src, L, ch));
    else if (n !== 1) edits.push({ s: L.be, e: L.be, t: '[start=' + n + ']' });
    if (n !== 1) pkgs.push('enumitem');
    return { edits, pkgs };
  }
  if (n === 1) return { edits, pkgs };
  const ind = itemInd(src, L);
  return { edits: [{ s: L.be, e: L.be, t: '\n' + ind + '\\setcounter{enum' + ROMAN[f.level] + '}{' + (n - 1) + '}' }], pkgs };
}
// The highest number a list can start at: TeX stops at a letter past z ("Counter too large")
export const maxStart = (f) => (/\\(alph|Alph)\s*(\*|\{\s*enum)/.test((f && f.label) || '') ? 26 : 99999);
// option edits that leave no empty brackets
function optDrop(src, L, ch) {
  const e = kvEdits(src, L.opt.is, L.opt.ie, ch);
  if (e.length && !/\S/.test(stripComments(apply(src.slice(L.opt.is, L.opt.ie), e.map((x) => ({ s: x.s - L.opt.is, e: x.e - L.opt.is, t: x.t })))))) return [{ s: L.opt.s, e: L.opt.e, t: '' }];
  return e;
}
// Continue the numbering of the list before (enumitem's resume; a start of its own goes), or not
export function resumeEdits(src, L, on, cfg) {
  if (L.kind !== 'enum') return null;
  const f = formatOf(src, L, cfg);
  const edits = [];
  if (on) {
    if (f.startFrom === 'counter') edits.push(lineCut(src, f.startAt.line[0], f.startAt.line[1]));
    if (L.opt) edits.push(...optDrop(src, L, { resume: true, start: null }));
    else edits.push({ s: L.be, e: L.be, t: '[resume]' });
    return { edits, pkgs: ['enumitem'] };
  }
  if (!L.opt) return { edits, pkgs: [] };
  return { edits: optDrop(src, L, { resume: null, 'resume*': null, start: null }), pkgs: [] };
}
// Restart at 1 on item k (k > 0): the list ends before it and a list of the same kind starts
// there, with the list's options and set up but not its start, its continuation or its counter
export function restartEdit(src, L, k) {
  if (L.kind !== 'enum' || !L.editable || k < 1 || k >= L.items.length) return null;
  const it = L.items[k], prev = L.items[k - 1];
  const ind = indentAt(src, L.s) ?? '', iind = indentAt(src, it.s) ?? ind + '  ';
  const setup = L.setupE > L.be ? src.slice(L.be, L.setupE).trim().replace(/\\setcounter\s*\{\s*enum(?:iv|i{1,3})\s*\}\s*\{[^{}\n]{0,20}\}[ \t]*\n?[ \t]*/g, '').trim() : '';
  const t = '\n' + ind + '\\end{' + L.name + '}\n' + ind + '\\begin{' + L.name + '}' + keepOpts(src, L) + (setup ? '\n' + iind + setup : '') + '\n' + iind;
  return { s: prev.e, e: it.s, t: crlf(src, t) };
}
// The space between a list's items: 'nosep' (none, nor around the list), 'noitemsep' (none
// between items), a length (itemsep=), null (LaTeX's own)
export function sepEdits(src, L, sep, cfg, mech = 'enumitem') {
  const f = formatOf(src, L, cfg), edits = [];
  const own = setupOf(src, L).filter((x) => x.what === 'itemsep' || x.what === 'tight');
  // Beside the enumerate package or paralist enumitem would break their "(a)" lists: the space
  // is LaTeX's own \setlength{\itemsep} in the list then (none around a list has no such form)
  if (mech !== 'enumitem' && f.sepFrom !== 'opt') {
    if (sep === 'nosep') return null;
    const len = sep === 'noitemsep' ? '0pt' : sep;
    if (!len) return { edits: own.map((x) => lineCut(src, x.s, x.e)), pkgs: [] };
    const x = own[0];
    if (x && x.what === 'itemsep' && x.vs != null) edits.push({ s: x.vs, e: x.ve, t: len });
    else if (x) edits.push({ s: x.s, e: x.e, t: '\\setlength{\\itemsep}{' + len + '}' });
    else edits.push({ s: L.be, e: L.be, t: crlf(src, '\n' + itemInd(src, L) + '\\setlength{\\itemsep}{' + len + '}') });
    for (const y of own.slice(1)) edits.push(lineCut(src, y.s, y.e));
    return { edits, pkgs: [] };
  }
  // a hand written \setlength{\itemsep}{0pt} or \tightlist goes: the option says it now
  if (f.sepFrom === 'def') for (const x of own) edits.push(lineCut(src, x.s, x.e));
  const ch = { nosep: sep === 'nosep' ? true : null, noitemsep: sep === 'noitemsep' ? true : null, itemsep: sep && sep !== 'nosep' && sep !== 'noitemsep' ? sep : null };
  if (L.opt) edits.push(...optDrop(src, L, ch));
  else if (sep) edits.push({ s: L.be, e: L.be, t: '[' + (sep === 'nosep' || sep === 'noitemsep' ? sep : 'itemsep=' + sep) + ']' });
  return { edits, pkgs: sep ? ['enumitem'] : [] };
}
// Another kind of list: the environment's name in \begin and \end; a label, a start or a
// continuation that belonged to the other kind goes
export function kindEdits(src, L, name) {
  if (!L.endAt || !L.editable) return null;
  const edits = [{ s: L.endAt[0], e: L.endAt[1], t: name }, { s: L.nameAt[0], e: L.nameAt[1], t: name }];
  if (L.opt) {
    const o = optionsOf(src, L);
    if (o.short) edits.push(cutKV(src, L, o.short));
    else {
      const ch = { label: null, 'label*': null };
      if (name !== 'enumerate') Object.assign(ch, { start: null, resume: null, 'resume*': null });
      const e = optDrop(src, L, ch);
      edits.push(...e);
    }
  }
  return merge(edits);
}
// edits that overlap (an option's removal and its brackets'): the wider one stays
function merge(edits) {
  const out = [];
  for (const x of [...edits].sort((a, b) => a.s - b.s || b.e - a.e)) {
    const last = out[out.length - 1];
    if (last && x.s < last.e) { if (x.e > last.e) last.e = x.e; continue; }
    out.push({ ...x });
  }
  return out;
}

// ---- levels ---------------------------------------------------------------------------------------
// The output of a change: pieces of the source (copied, perhaps moved in by an indentation) and
// new text, with the source's places followed into it
class Out {
  constructor(src) { this.src = src; this.t = ''; this.spans = []; }
  lit(t) { this.t += t; return this; }
  copy(s, e, from, to, raw) {
    if (e <= s) return this;
    const r = from != null ? reindent(this.src, s, e, from, to, raw) : { t: this.src.slice(s, e), map: (p) => p - s };
    this.spans.push({ s, e, at: this.t.length, map: r.map });
    this.t += r.t;
    return this;
  }
  // where source position p is in the text made (the first piece that holds it), or null
  pos(p) { for (const x of this.spans) if (p >= x.s && p <= x.e) return x.at + x.map(p); return null; }
  trimEnd() { const n = this.t.length - this.t.trimEnd().length; if (n) { this.t = this.t.slice(0, -n); } return this; }
}

// the selection's items in the innermost list that holds a: items k to m (siblings), b inside the last
export function selectedItems(lists, a, b) {
  const ch = chainAt(lists, a);
  if (!ch.length) return null;
  const { L, k } = ch[ch.length - 1];
  let m = k;
  while (m + 1 < L.items.length && L.items[m + 1].s < b) m++;
  return { chain: ch, L, k, m };
}

// Tab: items k to m of the innermost list at a go one level down, under the item before them (into
// the list that ends that item, if one does, else a new list of the same kind). null where none can.
export function demote(src, rs, re, a, b, sigs) {
  const lists = readLists(src, rs, re, sigs), sel = selectedItems(lists, a, b);
  if (!sel || sel.k < 1 || !sel.L.editable) return null;
  const { L, k, m } = sel;
  const P = L.items[k - 1], raw = rawRanges(src, L.s, L.e);
  const N = P.lists.length ? P.lists[P.lists.length - 1] : null;
  // (a comment after its \end, "\end{itemize} % sub", still ends the item with that list)
  const into = N && N.direct && N.editable && N.closed && endsWith(src, N, P) && N.items.length ? N : null;
  // how deep it goes: LaTeX nests four lists of a kind, six in all
  const kind = into ? into.kind : L.kind;
  const { level, depth } = levelOf(into || L);
  const sub = maxNest(L.items.slice(k, m + 1));
  if (depth + (into ? 0 : 1) + sub.depth > MAX_DEPTH || (into ? level : level + 1) + (sub.levels[kind] || 0) > MAX_LEVEL) return { refused: 'deep' };
  const from = itemInd(src, L), o = new Out(src);
  let s;
  if (into) {
    const last = into.items[into.items.length - 1], to = itemInd(src, into);
    s = last.e;
    o.lit('\n' + to).copy(L.items[k].s, L.items[m].e, from, to, raw).copy(last.e, P.e);
  } else {
    const step = stepOf(src, L), bi = (indentAt(src, P.s) ?? from) + step, to = bi + step;
    s = P.e;
    o.lit('\n' + bi + '\\begin{' + L.name + '}\n' + to).copy(L.items[k].s, L.items[m].e, from, to, raw).lit('\n' + bi + '\\end{' + L.name + '}');
  }
  return done(src, s, L.items[m].e, o, a, b);
}
// how deep the lists inside some items go: { depth, levels: { kind: n } }
function maxNest(items) {
  let depth = 0;
  const levels = {};
  const go = (L, d, lv) => { const l2 = { ...lv, [L.kind]: (lv[L.kind] || 0) + 1 }; depth = Math.max(depth, d); for (const k of Object.keys(l2)) levels[k] = Math.max(levels[k] || 0, l2[k]); for (const it of L.items) for (const C of it.lists) go(C, d + 1, l2); };
  for (const it of items) for (const C of it.lists) go(C, 1, {});
  return { depth, levels };
}

// Shift+Tab: items k to m of a nested list go one level up, as items of the list above, right
// after the item they stood in; the items after them in their list stay one level down, now
// under the last of them, and so does what that item held after its list. null where none can.
export function promote(src, rs, re, a, b, sigs) {
  const lists = readLists(src, rs, re, sigs), sel = selectedItems(lists, a, b);
  if (!sel || sel.chain.length < 2) return null;
  const { L: N, k, m } = sel;
  const up = sel.chain[sel.chain.length - 2], O = up.L, P = O.items[up.k];
  if (!N.direct || !N.editable || !O.editable || !N.closed) return null;
  const raw = rawRanges(src, O.s, O.e), o = new Out(src);
  const indP = indentAt(src, P.s) ?? itemInd(src, O), indN = itemInd(src, N), step = stepOf(src, O);
  // the item above keeps what it had before the list and the list's items before these
  if (k > 0) o.copy(P.s, N.items[k - 1].e).lit('\n' + beginInd(src, N) + '\\end{' + N.name + '}');
  else o.copy(P.s, N.s).trimEnd();
  o.lit('\n' + indP);
  const M = N.items[m], after = m + 1 < N.items.length;
  const C = M.lists.length ? M.lists[M.lists.length - 1] : null;
  const join = after && C && C.direct && C.closed && endsWith(src, C, M) && C.name === N.name;
  if (join) {
    // the items after them join the list that ends the last of them
    const last = C.items[C.items.length - 1], to = shiftInd(itemInd(src, C), indN, indP);
    o.copy(N.items[k].s, last.e, indN, indP, raw).lit('\n' + to).copy(N.items[m + 1].s, N.items[N.items.length - 1].e, indN, to, raw).copy(last.e, C.e, indN, indP, raw).copy(C.e, M.e);
  } else {
    o.copy(N.items[k].s, M.e, indN, indP, raw);
    if (after) {
      // a list of their own, as theirs was: its options and set up, its numbers going on where the
      // list had set them itself (the items that came up no longer count)
      const bi = indP + step, to = bi + step, h = splitHead(src, N, k);
      o.lit('\n' + bi + '\\begin{' + N.name + '}' + h.open);
      if (h.setup) o.lit('\n' + to + h.setup);
      o.lit('\n' + to).copy(N.items[m + 1].s, N.items[N.items.length - 1].e, indN, to, raw).lit('\n' + bi + '\\end{' + N.name + '}');
    }
  }
  // what the item above held after the list
  if (N.e < P.e) o.copy(N.e, P.e);
  return done(src, P.s, P.e, o, a, b);
}
const shiftInd = (ind, from, to) => (ind.startsWith(from) ? to + ind.slice(from.length) : ind);
// whether list C ends item I's text: nothing after its \end but spaces and comments
function endsWith(src, C, I) {
  if (C.e === I.e) return true;
  if (C.e > I.e || I.e - C.e > 2000) return false;
  // (a comment runs to its line's end: written so, "%%%%…" cannot be split two ways, which made
  // a stranger's line of percent signs after an \end take seconds at each move of the caret)
  const t = src.slice(C.e, I.e);
  return /^(?:[ \t\r\n]|%[^\n]*(?:\n|$))*$/.test(t);
}
// The options and set up of a list split off list L after its first k items: its own, with its
// start going on from where those k leave off where the list set its start itself (start=,
// \setcounter), and no continuation of another list
function splitHead(src, L, k) {
  const f = L.kind === 'enum' ? formatOf(src, L, null) : null;
  let setup = L.setupE > L.be ? src.slice(L.be, L.setupE).trim() : '';
  if (!f) return { open: keepOpts(src, L), setup };
  const n = f.start + k, level = f.level;
  setup = setup.replace(/\\setcounter\s*\{\s*enum(?:iv|i{1,3})\s*\}\s*\{[^{}\n]{0,20}\}[ \t]*(?:\r?\n[ \t]*)?/, f.startFrom === 'counter' && n !== 1 ? '\\setcounter{enum' + ROMAN[level] + '}{' + (n - 1) + '}\n' : '').trim();
  const open = f.startFrom === 'opt' ? optWith(src, L, { start: n === 1 ? null : String(n), resume: null, 'resume*': null }) : keepOpts(src, L);
  return { open, setup };
}
// a list's options without its start and continuation, as a list split off it takes them
function keepOpts(src, L) { return optWith(src, L, { start: null, resume: null, 'resume*': null }); }
// a list's options in brackets with keys changed (none left: no brackets)
function optWith(src, L, ch) {
  if (!L.opt) return '';
  const e = optDrop(src, L, ch);
  return apply(src.slice(L.opt.s, L.opt.e), e.map((x) => ({ s: x.s - L.opt.s, e: x.e - L.opt.s, t: x.t })));
}
// the change as the smallest edit, the caret and the selection followed into it
function done(src, s, e, o, a, b) {
  let t = o.t, pa = o.pos(a), pb = o.pos(b);
  if (CRLF(src)) {
    // (each line break written gets its \r: the places after it move by as many)
    const fix = (q) => { if (q == null) return q; let n = 0; for (let i = 0; i < q; i++) if (t[i] === '\n' && t[i - 1] !== '\r') n++; return q + n; };
    pa = fix(pa); pb = fix(pb); t = crlf(src, t);
  }
  const old = src.slice(s, e);
  let p = 0;
  while (p < old.length && p < t.length && old[p] === t[p]) p++;
  let z = 0;
  while (z < old.length - p && z < t.length - p && old[old.length - 1 - z] === t[t.length - 1 - z]) z++;
  if (p === old.length && p === t.length) return null;
  return { s: s + p, e: e - z, t: t.slice(p, t.length - z), a: pa == null ? null : s + pa, b: pb == null ? null : s + pb };
}

// Items k to m of the innermost list at a made paragraphs again: the items before them stay a list,
// so do those after (a list of their own, with the list's options and set up); a label of an
// item's own stays as its first words (a description's term in bold). In a nested list the
// paragraphs stay in the item above. null where they cannot.
export function unlist(src, rs, re, a, b, sigs) {
  const lists = readLists(src, rs, re, sigs), sel = selectedItems(lists, a, b);
  if (!sel || !sel.L.editable || !sel.L.closed) return null;
  const { L, k, m } = sel;
  const nested = sel.chain.length > 1;
  if (nested && !L.direct) return null;
  const raw = rawRanges(src, L.s, L.e), o = new Out(src);
  const ind = nested ? beginInd(src, L) : '', iind = itemInd(src, L);
  const setup = L.setupE > L.be ? src.slice(L.be, L.setupE).trim() : '';
  const begin = src.slice(L.s, L.be).trim();
  const head = (s0) => o.lit(begin + '\n' + (setup ? iind + setup + '\n' : '') + iind).copy(s0, L.items[k - 1].e).lit('\n' + ind + '\\end{' + L.name + '}');
  let s = L.s, e = L.e;
  if (!nested) {
    // outside a list: blank lines around the paragraphs, as many as they need to stand alone
    const pad = blankPads(src, L.s, L.e);
    if (k > 0) head(L.items[0].s).lit('\n\n');
    else o.lit(pad.b);
    paragraphs(o, src, L, k, m, '', iind, raw);
    if (m + 1 < L.items.length) { const h = splitHead(src, L, k); o.lit('\n\n\\begin{' + L.name + '}' + h.open + '\n' + (h.setup ? '  ' + h.setup + '\n' : '') + '  ').copy(L.items[m + 1].s, L.items[L.items.length - 1].e).lit('\n\\end{' + L.name + '}'); }
    else o.lit(pad.a);
  } else {
    if (k > 0) head(L.items[0].s).lit('\n\n' + ind);
    else {
      // a paragraph of its own after the item's words (a blank line between), or its words where
      // it has none before the list
      const P = sel.chain[sel.chain.length - 2], it = P.L.items[P.k];
      s = L.s;
      while (s > it.cmdE && /\s/.test(src[s - 1])) s--;
      if (s > it.cmdE) o.lit('\n\n' + ind);
    }
    paragraphs(o, src, L, k, m, ind, iind, raw);
    if (m + 1 < L.items.length) { const h = splitHead(src, L, k); o.lit('\n\n' + ind + '\\begin{' + L.name + '}' + h.open + '\n' + (h.setup ? iind + h.setup + '\n' : '') + iind).copy(L.items[m + 1].s, L.items[L.items.length - 1].e).lit('\n' + ind + '\\end{' + L.name + '}'); }
  }
  return done(src, s, e, o, a, b);
}
// items k to m as paragraphs, one blank line between them
function paragraphs(o, src, L, k, m, ind, iind, raw) {
  for (let i = k; i <= m; i++) {
    const it = L.items[i];
    if (i > k) o.lit('\n\n' + ind);
    let t0 = it.cmdE;
    while (t0 < it.e && /\s/.test(src[t0])) t0++;
    // (the {} that kept a bracket from being read as the item's label)
    if (src.startsWith('{}[', t0)) t0 += 2;
    if (it.lab) {
      const lab = src.slice(it.lab.is, it.lab.ie).trim().replace(/^\{([\s\S]*)\}$/, '$1');
      if (lab) o.lit(L.kind === 'desc' ? '\\textbf{' + lab + '}' : lab).lit(t0 < it.e ? ' ' : '');
    }
    o.copy(t0, it.e, iind, ind, raw);
  }
}

// ---- making a list ------------------------------------------------------------------------------
// Paragraphs [{ s, e }] (their words) made the items of a new list; open: what \begin{...} gets
// after it ("[label=\alph*)]"). The caret at a.
export function listFrom(src, paras, name, open = '', a) {
  const edits = [];
  let p = a, add = 0;
  paras.forEach((r, k) => {
    const t = crlf(src, (k ? '' : '\\begin{' + name + '}' + open + '\n') + '  \\item ' + (src[r.s] === '[' ? '{}' : ''));
    // (a paragraph's own \noindent goes: before \begin it would be left alone, before \item it
    // would start a paragraph where the list wants its first item)
    const ni = noindentBefore(src, r.s);
    if (r.s <= a) add += t.length - (r.s - ni);
    edits.push({ s: ni, e: r.s, t });
    if (k === paras.length - 1) edits.push({ s: r.e, e: r.e, t: crlf(src, '\n\\end{' + name + '}') });
  });
  p = Math.max(a, paras[0].s) + add;
  return { edits, p };
}

// where a \noindent (with \indent, \par, spaces) right before s starts, or s
export function noindentBefore(src, s) {
  const back = src.slice(Math.max(0, s - 60), s), m = /\\(?:no)?indent(?![A-Za-z@])[ \t]*(?:\r?\n[ \t]*)?$/.exec(back);
  return m ? s - (back.length - m.index) : s;
}

// What a paragraph's first characters ask for as Word's automatic lists read them: "- ", "* " a
// bulleted list; "1. ", "1) ", "(1) ", "a) ", "a. ", "A. ", "(a) ", "i. ", "I. " a numbered one in
// that format, from that number. The marker without its space; null for none.
export function autoMarker(t) {
  // (- and *, a dash a phone's keyboard made of "-", written as -- or ---, and a typed bullet)
  if (/^(?:-{1,3}|\*|•|–|—)$/.test(t)) return { name: 'itemize', star: null, start: 1 };
  const m = /^(\()?(\d{1,4}|[a-zA-Z]|[ivxIVX]{2,5})([.)])$/.exec(t);
  if (!m || (m[1] && m[3] !== ')')) return null;
  const x = m[2];
  let style, start;
  if (/^\d+$/.test(x)) { style = 'arabic'; start = +x; }
  else if (/^(i|I)$/.test(x) || x.length > 1) {
    const r = romanValue(x.toLowerCase());
    if (!r) return null;
    style = x === x.toLowerCase() ? 'roman' : 'Roman'; start = r;
  } else { style = x === x.toLowerCase() ? 'alph' : 'Alph'; start = x.toLowerCase().charCodeAt(0) - 96; }
  const star = (m[1] ? '(' : '') + '\\' + style + '*' + m[3];
  return { name: 'enumerate', star, start: start || 1 };
}
function romanValue(r) { for (let n = 1; n < 40; n++) if (roman(n) === r) return n; return 0; }

// ---- sorting --------------------------------------------------------------------------------------
// Pieces [{ s, e }] of src (items of one list, or paragraphs) put in the order of their keys; the
// text between them stays where it is. o: { type 'text' | 'number' | 'date', descending, caseSensitive,
// lang }. A piece that ends in a comment keeps a line break after it. Returns { s, e, t } or null.
export function sortEdit(src, pieces, keys, o = {}) {
  if (pieces.length < 2) return null;
  const coll = typeof Intl !== 'undefined' ? new Intl.Collator(o.lang || undefined, { sensitivity: o.caseSensitive ? 'case' : 'base', numeric: true }) : null;
  const num = (t) => { const m = /-?\d+(?:[.,]\d+)?/.exec(t); return m ? parseFloat(m[0].replace(',', '.')) : NaN; };
  const date = (t) => { const d = Date.parse(t); return Number.isNaN(d) ? NaN : d; };
  const k = keys.map((t) => (o.type === 'number' ? num(t) : o.type === 'date' ? date(t) : String(t).trim()));
  const order = pieces.map((p, i) => i).sort((x, y) => {
    const a = k[x], b = k[y];
    let c;
    if (o.type === 'number' || o.type === 'date') c = Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : Number.isNaN(b) ? -1 : a - b;
    else c = coll ? coll.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;
    if (o.descending && !((o.type === 'number' || o.type === 'date') && (Number.isNaN(a) || Number.isNaN(b)))) c = -c;
    return c || x - y;
  });
  if (order.every((v, i) => v === i)) return null;
  const s = pieces[0].s, e = pieces[pieces.length - 1].e;
  let t = '';
  order.forEach((j, i) => {
    let piece = src.slice(pieces[j].s, pieces[j].e);
    const gap = i + 1 < pieces.length ? src.slice(pieces[i].e, pieces[i + 1].s) : '';
    // (a piece whose last line is a comment would comment out what comes after it on its line)
    if (endsInComment(piece) && (i + 1 < pieces.length ? !gap.includes('\n') : !/^[ \t]*(\r?\n|$)/.test(src.slice(e, e + 200)))) piece += CRLF(src) ? '\r\n' : '\n';
    t += piece + gap;
  });
  return { s, e, t };
}
function endsInComment(t) {
  const line = t.slice(t.lastIndexOf('\n') + 1);
  for (let i = 0; i < line.length; i++) { if (line[i] === '\\') { i++; continue; } if (line[i] === '%') return true; }
  return false;
}

// ---- multilevel lists -----------------------------------------------------------------------------
// Every \setlist of the preamble: [{ s, e, line: [ls, le], names: [...], levels: [...], arg: [as, ae] }]
export function setlistCalls(src, end) {
  const out = [];
  if (end == null) end = preambleEnd(src);
  if (end < 0) return out;
  const pre = stripComments(src.slice(0, Math.min(end, PRE)));
  const re = /\\setlist(?![A-Za-z@])/g;
  let m, n = 0;
  while ((m = re.exec(pre)) && n++ < 500) {
    let i = skip(pre, m.index + m[0].length), names = [], levels = [];
    if (pre[i] === '*') continue;
    if (pre[i] === '[') {
      const z = groupEnd(pre, i, 400);
      if (z < 0) continue;
      for (const x of pre.slice(i + 1, z - 1).split(',').map((y) => y.trim()).filter(Boolean)) (/^\d$/.test(x) ? levels : names).push(/^\d$/.test(x) ? +x : x);
      i = skip(pre, z);
    }
    if (pre[i] !== '{') continue;
    const z = groupEnd(pre, i, 4000);
    if (z < 0) continue;
    const ls = pre.lastIndexOf('\n', m.index - 1) + 1, nl = pre.indexOf('\n', z);
    out.push({ s: m.index, e: z, line: [ls, nl < 0 ? pre.length : nl + 1], names, levels, arg: [i + 1, z - 1] });
    re.lastIndex = z;
  }
  return out;
}
// The edits that give every list of a kind the labels of levels 1 to 4 (null: LaTeX's own again):
// an existing \setlist[enumerate,k]{...} gets its label changed, else a line is added (at the
// preamble's end, after the packages). Returns { edits, pkgs }.
export const multilevelEdits = (src, kind, labels, end, mech) => crlfAll(src, multilevelEdits0(src, kind, labels, end, mech));
// labels: one entry a level, 1 to 4: a label to give it, null for LaTeX's own again, undefined to
// leave it as it is (null for the whole array: LaTeX's own at every level). mech: where enumitem is
// not the document's way (the enumerate package, paralist) the levels are LaTeX's own
// \renewcommand{\labelenumii}{...} lines, rewritten where the preamble has them.
function multilevelEdits0(src, kind, labels, end, mech = 'enumitem') {
  if (end == null) end = preambleEnd(src);
  if (end < 0) return null;
  if (!labels) labels = [null, null, null, null];
  const name = kind === 'enum' ? 'enumerate' : 'itemize';
  const edits = [], lines = [];
  let pkgs = [];
  if (mech !== 'enumitem') {
    const cfg = listSetup(src, end), what = kind === 'enum' ? 'labelenum' : 'labelitem';
    for (let k = 1; k <= 4; k++) {
      const want = labels[k - 1];
      if (want === undefined) continue;
      const v = want == null ? null : kind === 'enum' ? l2eOf(want, k) : want;
      const at = cfg.pos[what][k];
      if (at) { if (v == null) edits.push(at.line ? { s: at.line[0], e: at.line[1], t: '' } : { s: at.s, e: at.e, t: '' }); else edits.push({ s: at.vs, e: at.ve, t: v }); }
      else if (v != null) lines.push('\\renewcommand{\\' + what + ROMAN[k] + '}{' + v + '}');
    }
  } else {
    const calls = setlistCalls(src, end);
    for (let k = 1; k <= 4; k++) {
      const want = labels[k - 1];
      if (want === undefined) continue;
      const own = calls.filter((c) => c.names.length === 1 && c.names[0] === name && c.levels.length === 1 && c.levels[0] === k).pop();
      if (own) {
        const e = kvEdits(src, own.arg[0], own.arg[1], { label: want == null ? null : braced(want), 'label*': null });
        if (want == null && e.length && !/\S/.test(stripComments(apply(src.slice(own.arg[0], own.arg[1]), e.map((x) => ({ s: x.s - own.arg[0], e: x.e - own.arg[0], t: x.t })))))) edits.push({ s: own.line[0], e: own.line[1], t: '' });
        else edits.push(...e);
      } else if (want != null) lines.push('\\setlist[' + name + ',' + k + ']{label=' + braced(want) + '}');
    }
    // labels a \setlist for every level of the kind gives: they go when LaTeX's own are asked for
    if (labels.every((x) => x === null)) for (const c of calls) if (c.names.length === 1 && c.names[0] === name && !c.levels.length) {
      const e = kvEdits(src, c.arg[0], c.arg[1], { label: null, 'label*': null });
      if (e.length && !/\S/.test(stripComments(apply(src.slice(c.arg[0], c.arg[1]), e.map((x) => ({ s: x.s - c.arg[0], e: x.e - c.arg[0], t: x.t })))))) edits.push({ s: c.line[0], e: c.line[1], t: '' });
      else edits.push(...e);
    }
    if (labels.some((x) => typeof x === 'string')) pkgs = ['enumitem'];
  }
  if (lines.length) {
    const at = src.lastIndexOf('\n', end - 1) + 1;
    const pre = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '';
    edits.push({ s: pre ? end : at, e: pre ? end : at, t: pre + lines.join('\n') + '\n' });
  }
  return { edits: merge(edits), pkgs };
}
const braced = (v) => (/[,=\]\[]/.test(v) ? '{' + v + '}' : v);
// the labels the preamble gives each level of a kind (null where it gives none of its own)
export function multilevelOf(cfg, kind) {
  const name = kind === 'enum' ? 'enumerate' : 'itemize', out = [];
  for (let k = 1; k <= 4; k++) {
    let v = null;
    for (const x of cfg.setlist) if ((!x.names || x.names.has(name)) && (!x.levels || x.levels.has(k))) { const y = x.kv.find((z) => z.key === 'label'); if (y) v = y.value.replace(/^\{([\s\S]*)\}$/, '$1'); }
    // (the preamble's own \renewcommand{\labelenumii}, where no \setlist says otherwise)
    if (v == null) { const d = (kind === 'enum' ? cfg.labelenum : cfg.labelitem)[k]; if (d) v = kind === 'enum' ? starOf(d, k, cfg.theenum) : d; }
    out.push(v);
  }
  return out;
}
