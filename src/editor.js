// Rikuy editor: maps carets between page and source, and turns every
// input event into a minimal patch of the .tex source.
import { BLOCKS } from './render.js';
import { isBalanced } from './parser.js';

// ---------------------------------------------------------------------------
// Segment and atom lookups

export function segOfSpan(span) {
  const g = span && span.dataset && span.dataset.g;
  if (!g) return null;
  const dot = g.indexOf('.');
  const B = BLOCKS.get(+g.slice(0, dot));
  if (!B) return null;
  const seg = B.segs[+g.slice(dot + 1)];
  if (!seg) return null;
  return { B, seg, o: +(span.dataset.o || 0), len: span.firstChild ? span.firstChild.data.length : 0 };
}

export function atomOfEl(el) {
  const id = el && el.dataset && (el.dataset.a || el.dataset.m);
  if (!id) return null;
  const dot = id.indexOf('.');
  const B = BLOCKS.get(+id.slice(0, dot));
  if (!B) return null;
  const a = B.atoms[+id.slice(dot + 1)];
  if (!a) return null;
  return { B, a, ...absAtom(B, a) };
}
export function absAtom(B, a) {
  const off = a.absolute ? 0 : B.base;
  const f = a.f || B.f;
  return {
    f, s: a.s == null ? null : a.s + off, e: a.e == null ? null : a.e + off,
    is: a.is == null ? null : a.is + off, ie: a.ie == null ? null : a.ie + off
  };
}
export function styOfEl(el) {
  const id = el && el.dataset && el.dataset.y;
  if (!id) return null;
  const dot = id.indexOf('.');
  const B = BLOCKS.get(+id.slice(0, dot));
  if (!B) return null;
  const y = B.stys[+id.slice(dot + 1)];
  if (!y) return null;
  const b = B.base;
  return { B, y, f: y.f || B.f, s: y.s + b, e: y.e + b, is: y.is + b, ie: y.ie + b, cmd: y.cmd, st: y.st };
}

export function boundary(B, seg, k) {
  if (seg.ph || seg.len === 0) return B.base + seg.rel[0];
  if (k <= 0) return B.base + seg.rel[0];
  if (k >= seg.len) return B.base + seg.rel[2 * seg.len - 1];
  return B.base + seg.rel[2 * (k - 1) + 1];
}
export function charRange(B, seg, k) {
  return [B.base + seg.rel[2 * k], B.base + seg.rel[2 * k + 1]];
}

// ---------------------------------------------------------------------------
// DOM position -> source position

const isSkippable = (el) => el.nodeType === 1 && (el.classList.contains('chr') || el.classList.contains('lbl') || el.classList.contains('fnrule') || el.classList.contains('folio') || el.classList.contains('mk-layer'));

export function posFromDom(node, off, root) {
  if (!node) return null;
  if (node.nodeType === 3) {
    const span = node.parentNode;
    if (span && span.classList && span.classList.contains('t')) {
      if (span.classList.contains('gh')) return { ghost: true };
      const info = segOfSpan(span);
      if (!info) return null;
      return { f: info.seg.f, p: boundary(info.B, info.seg, info.o + Math.min(off, info.len)) };
    }
    // text inside an atom or chrome: treat as element boundary
    const holder = node.parentElement && node.parentElement.closest('.atom, .chr');
    if (holder) {
      return off === 0 ? before(holder, root) : after(holder, root);
    }
    return null;
  }
  const el = node;
  if (el.classList && el.classList.contains('t')) {
    if (el.classList.contains('gh')) return { ghost: true };
    const info = segOfSpan(el);
    if (!info) return null;
    const k = off === 0 ? info.o : info.o + info.len;
    return { f: info.seg.f, p: boundary(info.B, info.seg, k) };
  }
  if (el.classList && el.classList.contains('atom')) return off === 0 ? before(el, root) : after(el, root);
  const kids = el.childNodes;
  if (off > 0 && kids[off - 1]) { const r = lastPos(kids[off - 1]); if (r) return r; }
  if (kids[off]) { const r = firstPos(kids[off]); if (r) return r; }
  return before(el, root) || after(el, root);
}

function lastPos(n) {
  if (n.nodeType === 3) {
    const span = n.parentNode;
    if (span.classList && span.classList.contains('t')) { const i = segOfSpan(span); if (i) return { f: i.seg.f, p: boundary(i.B, i.seg, i.o + i.len) }; }
    return null;
  }
  if (n.nodeType !== 1) return null;
  if (n.classList.contains('t')) { const i = segOfSpan(n); return i ? { f: i.seg.f, p: boundary(i.B, i.seg, i.o + i.len) } : null; }
  if (n.classList.contains('atom')) { const a = atomOfEl(n); return a && a.e != null && !a.a.ro ? { f: a.f, p: a.e } : null; }
  if (isSkippable(n)) return null;
  for (let c = n.lastChild; c; c = c.previousSibling) { const r = lastPos(c); if (r) return r; }
  return null;
}
function firstPos(n) {
  if (n.nodeType === 3) {
    const span = n.parentNode;
    if (span.classList && span.classList.contains('t')) { const i = segOfSpan(span); if (i) return { f: i.seg.f, p: boundary(i.B, i.seg, i.o) }; }
    return null;
  }
  if (n.nodeType !== 1) return null;
  if (n.classList.contains('t')) { const i = segOfSpan(n); return i ? { f: i.seg.f, p: boundary(i.B, i.seg, i.o) } : null; }
  if (n.classList.contains('atom')) { const a = atomOfEl(n); return a && a.s != null && !a.a.ro ? { f: a.f, p: a.s } : null; }
  if (isSkippable(n)) return null;
  for (let c = n.firstChild; c; c = c.nextSibling) { const r = firstPos(c); if (r) return r; }
  return null;
}
function before(el, root) {
  if (el.classList && el.classList.contains('atom')) { const a = atomOfEl(el); if (a && a.s != null && !a.a.ro) return { f: a.f, p: a.s }; }
  for (let n = el; n && n !== root; n = n.parentNode) {
    for (let c = n.previousSibling; c; c = c.previousSibling) { const r = lastPos(c); if (r) return r; }
  }
  return null;
}
function after(el, root) {
  if (el.classList && el.classList.contains('atom')) { const a = atomOfEl(el); if (a && a.e != null && !a.a.ro) return { f: a.f, p: a.e }; }
  for (let n = el; n && n !== root; n = n.parentNode) {
    for (let c = n.nextSibling; c; c = c.nextSibling) { const r = firstPos(c); if (r) return r; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source position -> DOM position (via an index of placed spans)

export class CaretIndex {
  constructor(root) { this.root = root; this.dirty = true; this.byFile = new Map(); }
  build() {
    this.byFile.clear();
    const spans = this.root.querySelectorAll('span.t');
    for (const span of spans) {
      if (span.closest('.ghostp')) continue;
      const info = segOfSpan(span);
      if (!info) continue;
      const { B, seg, o, len } = info;
      const a = boundary(B, seg, o), b = boundary(B, seg, o + len);
      const f = seg.f;
      if (!this.byFile.has(f)) this.byFile.set(f, []);
      this.byFile.get(f).push({ span, B, seg, o, len, a, b });
    }
    for (const arr of this.byFile.values()) arr.sort((x, y) => x.a - y.a || x.b - y.b);
    this.dirty = false;
  }
  // Fast path: index only the spans of blocks whose source range covers p.
  local(f, p) {
    const blocks = this.blocksOf ? this.blocksOf() : null;
    if (!blocks) return null;
    const hits = [];
    for (const B of blocks) if (B.f === f && B.base <= p && p <= B.e) hits.push(B);
    if (!hits.length || hits.length > 3) return null;
    const arr = [];
    for (const B of hits) {
      for (const span of this.root.querySelectorAll('span.t[data-g^="' + B.id + '."]')) {
        if (span.closest('.ghostp')) continue;
        const info = segOfSpan(span);
        if (!info || info.seg.f !== f) continue;
        const { seg, o, len } = info;
        arr.push({ span, B, seg, o, len, a: boundary(B, seg, o), b: boundary(B, seg, o + len) });
      }
    }
    arr.sort((x, y) => x.a - y.a || x.b - y.b);
    return arr.some((E) => E.a <= p && p <= E.b) ? arr : null;
  }
  find(f, p, bias = -1) {
    const loc = this.local(f, p);
    if (loc) return this.findIn(loc, p, bias);
    if (this.dirty) this.build();
    return this.findIn(this.byFile.get(f), p, bias);
  }
  findIn(arr, p, bias) {
    if (!arr || !arr.length) return null;
    // binary search last entry with a <= p
    let lo = 0, hi = arr.length - 1, last = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].a <= p) { last = m; lo = m + 1; } else hi = m - 1; }
    const cands = [];
    for (let k = last; k >= 0 && k > last - 40; k--) { const E = arr[k]; if (E.a <= p && p <= E.b) cands.push(E); }
    let E = null;
    if (cands.length) {
      cands.reverse();
      if (bias < 0) E = cands.find((c) => p > c.a && !c.seg.ph) || cands.find((c) => !c.seg.ph) || cands[0];
      else E = cands.find((c) => p < c.b) || cands[0];
      // prefer placeholders when caret sits exactly on them
      const ph = cands.find((c) => c.seg.ph && c.a === p);
      if (ph && !(bias < 0 && cands.some((c) => !c.seg.ph && p > c.a))) E = ph;
    }
    if (!E) {
      const next = arr[last + 1];
      if (next) return { node: next.span.firstChild, offset: 0, entry: next, inexact: true };
      const prev = arr[last];
      if (prev) return { node: prev.span.firstChild, offset: prev.len, entry: prev, inexact: true };
      return null;
    }
    if (E.seg.ph) return { node: E.span.firstChild, offset: E.len, entry: E };
    // find k in [o, o+len] with max boundary <= p
    let k0 = E.o, k1 = E.o + E.len, best = E.o;
    while (k0 <= k1) { const m = (k0 + k1) >> 1; if (boundary(E.B, E.seg, m) <= p) { best = m; k0 = m + 1; } else k1 = m - 1; }
    if (bias > 0) { while (best > E.o && boundary(E.B, E.seg, best - 1) === p) best--; }
    return { node: E.span.firstChild, offset: best - E.o, entry: E };
  }
  // DOM ranges over the visible characters of file f whose source lies in any of the sorted,
  // disjoint ranges rs = [[s, e], ...] (for showing changes on the page).
  domRanges(f, rs) {
    if (this.dirty) this.build();
    const arr = this.byFile.get(f) || [];
    const out = [];
    if (!rs.length) return out;
    for (const E of arr) {
      if (E.seg.ph || !E.len) continue;
      let lo = 0, hi = rs.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (rs[m][1] <= E.a) lo = m + 1; else hi = m; }
      if (lo >= rs.length || rs[lo][0] >= E.b) continue;
      const node = E.span.firstChild;
      if (!node || node.nodeType !== 3) continue;
      let k0 = -1;
      for (let k = 0; k <= E.len; k++) {
        let hit = false;
        if (k < E.len) {
          const s = charRange(E.B, E.seg, E.o + k)[0];
          for (let j = lo; j < rs.length && rs[j][0] <= s; j++) if (s < rs[j][1]) { hit = true; break; }
        }
        if (hit && k0 < 0) k0 = k;
        else if (!hit && k0 >= 0) {
          const r = document.createRange();
          r.setStart(node, Math.min(k0, node.length)); r.setEnd(node, Math.min(k, node.length));
          if (!r.collapsed) out.push(r);
          k0 = -1;
        }
      }
    }
    return out;
  }
}

// Visible content ranges inside [a,b) across all current blocks.
export function visibleRanges(blocks, f, a, b) {
  const out = [];
  for (const B of blocks) {
    for (const seg of B.segs) {
      if (seg.f !== f || seg.ph) continue;
      for (let k = 0; k < seg.len; k++) {
        const s = B.base + seg.rel[2 * k], e = B.base + seg.rel[2 * k + 1];
        if (s >= a && e <= b && e > s) out.push([s, e]);
      }
    }
    for (const at of B.atoms) {
      if (at.ro || at.s == null || at.soft) continue;
      if (at.kind === 'bib') continue;
      const A = absAtom(B, at);
      if (A.f !== f) continue;
      if (A.s >= a && A.e <= b && A.e > A.s) out.push([A.s, A.e]);
    }
  }
  out.sort((x, y) => x[0] - y[0]);
  // merge and drop ranges contained in others
  const merged = [];
  for (const r of out) {
    const L = merged[merged.length - 1];
    if (L && r[0] <= L[1]) { L[1] = Math.max(L[1], r[1]); } else merged.push([r[0], r[1]]);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Grapheme clusters. What a reader takes for one character may be several code points: in
// Devanagari क्षि is four (a consonant, its virama, a consonant, a vowel sign), an emoji two
// code units. The browser puts a caret only between clusters; a range made otherwise (a cut for
// a page break, a selection set by a program) is moved to their edges with these.

let graphemes;
// one cluster's worth of text that goes with what stands before it, where Intl.Segmenter is not
// to be had: a mark, a joiner, the second half of a pair, a letter after a virama or a joiner
const VIRAMA = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D]/;
const joins = (text, i) => {
  const c = text[i], p = text[i - 1];
  if (c >= '\uDC00' && c <= '\uDFFF' && p >= '\uD800' && p <= '\uDBFF') return true;
  if (p === '\u200D' || /[\p{M}\u200C\u200D]/u.test(c)) return true;
  if (VIRAMA.test(p) && /\p{L}/u.test(c)) return true;
  // Thai's and Lao's am vowel, and a hangul syllable written as its jamo
  if (c === '\u0E33' || c === '\u0EB3') return true;
  return /[\u1160-\u11FF\uD7B0-\uD7FF]/.test(c) && /[\u1100-\u11FF\uA960-\uA97F\uAC00-\uD7FF]/.test(p);
};
// The cluster of text that holds the code unit at i: [start, end). Only the text near i is
// read (a cluster is a handful of code units), from a place where a cluster surely starts.
// (plain: without Intl.Segmenter, as where a browser has none)
export function clusterAt(text, i, plain) {
  if (i < 0 || i >= text.length) return [i, i];
  // (an ASCII character starts a cluster of its own, whatever stands before it)
  let from = i;
  for (const stop = Math.max(0, i - 64); from > stop && text.charCodeAt(from) > 0x7E; from--);
  const to = Math.min(text.length, i + 64);
  if (graphemes === undefined) { try { graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { graphemes = null; } }
  if (graphemes && !plain) {
    const s = graphemes.segment(text.slice(from, to)).containing(i - from);
    if (s) return [from + s.index, from + s.index + s.segment.length];
  }
  let a = i, b = i + 1;
  while (a > from && joins(text, a)) a--;
  while (b < to && joins(text, b)) b++;
  return [a, b];
}
// How many code units Backspace takes off the end of a cluster: its last code point, as the
// browser's own Backspace and editors for India's scripts do (the vowel sign of कि, then the
// letter; an accent typed after its letter), but all of an emoji, a flag or a keycap, whose
// parts mean nothing alone, and both halves of a pair.
export function backspaceUnits(cluster) {
  if (cluster.length < 2 || /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3\r]/u.test(cluster)) return cluster.length;
  const c = cluster.charCodeAt(cluster.length - 1), p = cluster.charCodeAt(cluster.length - 2);
  return c >= 0xDC00 && c <= 0xDFFF && p >= 0xD800 && p <= 0xDBFF ? 2 : 1;
}
// The nearest edge of a cluster at or before i (dir < 0), or at or after it (dir > 0)
export function clusterEdge(text, i, dir) {
  if (i <= 0 || i >= text.length) return Math.max(0, Math.min(text.length, i));
  const [a, b] = clusterAt(text, i);
  return a === i ? i : dir < 0 ? a : b;
}
// The same in LaTeX source, where not every character is text: a mark written after a brace, a
// dollar or a space (\textcolor{red}{<fatha>}, \emph{cafe}<acute>) has that sign for its base as far
// as Unicode goes, and an edge moved over it would put half a group inside a command. A place
// in such a cluster stays where it is.
const SYNTAX = /[\\{}$%&~^_#\s]/;
export function sourceEdge(text, i, dir) {
  if (i <= 0 || i >= text.length) return Math.max(0, Math.min(text.length, i));
  const [a, b] = clusterAt(text, i);
  return a === i || SYNTAX.test(text.slice(a, b)) ? i : dir < 0 ? a : b;
}

// ---------------------------------------------------------------------------
// Escaping typed text into LaTeX

const ESC = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '_': '\\_', '$': '\\$', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}', ' ': '~', '…': '\\ldots{}' };
export function escapeTeX(text, prev = ' ', opts = {}) {
  let out = '';
  let p = prev;
  for (const ch of text) {
    let r = ch;
    if (ch === '"' && !opts.verbatim) r = /[\s([{—–-]/.test(p) || p === '' ? '``' : "''";
    else if (ch === '“') r = '``';
    else if (ch === '”') r = "''";
    else if (ch === '‘') r = '`';
    else if (ch === '’') r = "'";
    else if (ch === '—') r = '---';
    else if (ch === '–') r = '--';
    else if (ch === '\t') r = ' ';
    else if (ESC[ch] !== undefined && !opts.verbatim) r = ESC[ch];
    out += r;
    p = ch;
  }
  return out;
}

// Plain text with paragraphs -> LaTeX
export function textToTeX(text, prev) {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  return paras.map((p, i) => escapeTeX(p.replace(/\s*\n\s*/g, ' '), i === 0 ? prev : ' ')).join('\n\n');
}

export function endsWithControlWord(src, p) {
  let k = p - 1;
  if (k < 0 || !/[A-Za-z]/.test(src[k])) return false;
  while (k >= 0 && /[A-Za-z]/.test(src[k])) k--;
  if (k < 0 || src[k] !== '\\') return false;
  // count backslashes: odd -> control word
  let n = 0;
  while (k >= 0 && src[k] === '\\') { n++; k--; }
  return n % 2 === 1;
}

export { isBalanced };

// Minimal diff between two strings (common prefix/suffix).
export function diff(a, b) {
  if (a === b) return null;
  let s = 0;
  const n = Math.min(a.length, b.length);
  while (s < n && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let e = 0;
  while (e < n - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++;
  return { s, del: a.slice(s, a.length - e), ins: b.slice(s, b.length - e) };
}
