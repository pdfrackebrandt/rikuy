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

// end: the place is a selection's end, which an element's edge leaves after what stands before
// it on the page (posFromDom below)
export function posFromDom(node, off, root, end) {
  if (!node) return null;
  // At the start of a list item's bullet or number, where Right puts the caret from the end of
  // the paragraph above: the start of the item's own words, as Word's caret never stands before
  // a number. It was taken for the end of that paragraph, and what was typed next went there.
  // (at the label's end, where Left puts it from the item's words: the end of what is above)
  const lbl = (node.nodeType === 1 ? node : node.parentElement)?.closest?.('.lbl');
  // (a label of the item's own, \item[Step:], holds words to edit: not passed over)
  if (lbl && lbl !== root && root.contains(lbl) && !lbl.querySelector('span.t') && labelStart(lbl, node, off)) for (let n = lbl.nextSibling; n; n = n.nextSibling) { const r = firstPos(n); if (r) return r; }
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
  // A selection that ends at the edge of an element ends after the words before that edge: a
  // triple click on a page's last paragraph, or Shift+Down on its last line, ends at the start of
  // the footnotes below it, which were taken for the place of their own words, earlier in the
  // source; the selection then reached back over half the document, and typing over it deleted it
  if (end) {
    for (let i = off - 2; i >= 0; i--) { const r = lastPos(kids[i]); if (r) return r; }
    const r = before(el, root);
    if (r) return r;
  }
  if (kids[off]) { const r = firstPos(kids[off]); if (r) return r; }
  // (a place before a heading's number, which Home and Ctrl+Home give, is the start of the
  // heading's own words: looking outside the element first sent the keys typed there into the
  // paragraph before or after it)
  for (let i = off + 1; i < kids.length; i++) { const r = firstPos(kids[i]); if (r) return r; }
  for (let i = off - 2; i >= 0; i--) { const r = lastPos(kids[i]); if (r) return r; }
  return before(el, root) || after(el, root);
}

// whether (node, off) inside label lbl has none of its characters before it
function labelStart(lbl, node, off) {
  const r = document.createRange();
  r.setStart(lbl, 0); r.setEnd(node, off);
  return r.toString() === '';
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
    // (a place inside a run of spaces the page draws as one, as a word deleted letter by letter
    // leaves "The  paragraph": after that space, where the letters were; before it, the caret
    // jumped back a space and Backspace took the letter before it)
    if (best < E.o + E.len && E.span.firstChild.data[best - E.o] === ' ' && charRange(E.B, E.seg, best)[0] < p) best++;
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
// Text from a PDF holds its typesetter's ligatures (ﬁ, ﬂ) as characters of their own, which no
// engine's fonts expect in the source: they are their letters. A PDF's or a web page's Greek and
// math symbols in running text (τ* = 1/(1 + ε)) are characters pdfLaTeX's text fonts do not
// have ("Unicode character τ (U+03C4) not set up"): pasted into a document pdfLaTeX compiles they
// are written as the formula a person types, $\tau$. The list is what TeX Live's pdfLaTeX
// refused here; ±, ×, ÷, ·, µ, °, ¬, the four arrows and … it sets, and they stay.
const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };
const TEXT_MATH = Object.fromEntries(('α alpha β beta γ gamma δ delta ε varepsilon ϵ epsilon ζ zeta η eta θ theta ϑ vartheta ι iota κ kappa λ lambda μ mu ν nu ξ xi π pi ϖ varpi ρ rho ϱ varrho σ sigma ς varsigma τ tau υ upsilon '
  + 'φ varphi ϕ phi χ chi ψ psi ω omega Γ Gamma Δ Delta Θ Theta Λ Lambda Ξ Xi Π Pi Σ Sigma Υ Upsilon Φ Phi Ψ Psi Ω Omega ≤ le ≥ ge ≠ ne ≈ approx ≡ equiv ∼ sim ∝ propto ≪ ll ≫ gg ∞ infty ∂ partial ∇ nabla '
  + '∑ sum ∏ prod ∫ int ∈ in ∉ notin ⊂ subset ⊃ supset ⊆ subseteq ⊇ supseteq ∪ cup ∩ cap ∀ forall ∃ exists ∧ wedge ∨ vee ⊕ oplus ⊗ otimes ⊥ perp ∥ parallel ↔ leftrightarrow ⇒ Rightarrow ⇐ Leftarrow '
  + '⇔ Leftrightarrow ↦ mapsto ⟹ implies ⟺ iff ⋯ cdots ℓ ell ℏ hbar ℜ Re ℑ Im ℵ aleph ′ prime ⌊ lfloor ⌋ rfloor ⌈ lceil ⌉ rceil').split(' ').reduce((a, x, i, all) => (i % 2 ? a : [...a, [x, '\\' + all[i + 1]]]), []));
TEXT_MATH['\u2212'] = '-';
// (a prime is the formula's ' : $\prime$ printed a large one, review E9)
TEXT_MATH['\u2032'] = "'";
TEXT_MATH['\u2033'] = "''";
let mathForPdf = false;
// fn run with escapeTeX writing those symbols as formulas (a paste into a document pdfLaTeX
// compiles: src/app.js onPaste). o.greek false: the document sets Greek up for its text already
// (babel's greek, LGR, textgreek, its own \DeclareUnicodeCharacter): Greek letters stay letters.
export function withPdfText(pdf, fn, o = {}) {
  const was = mathForPdf;
  mathForPdf = pdf ? { greek: o.greek !== false } : false;
  try { return fn(); } finally { mathForPdf = was; }
}

// opts.code: text that is code (\texttt, a Code block's words): its straight quotes stay straight,
// as a typewriter font prints ` and `` as grave accents
export function escapeTeX(text, prev = ' ', opts = {}) {
  let out = '';
  let p = prev;
  // (what was written last: a quote just opened opens the one after it too, ‘“)
  let w = prev === '`' || prev === "'" ? prev : '';
  const quotes = !opts.verbatim && !opts.code;
  for (const ch of text) {
    let r = ch;
    const opening = /[\s([{—–-]/.test(p) || p === '' || w.endsWith('`');
    if (LIGATURES[ch] && !opts.verbatim) r = LIGATURES[ch];
    else if (mathForPdf && TEXT_MATH[ch] && !opts.verbatim && (mathForPdf.greek || !/[\u0370-\u03FF]/.test(ch))) r = '$' + TEXT_MATH[ch] + '$';
    else if (ch === '"' && quotes) r = opening ? '``' : "''";
    // (a straight single quote opening a quotation, after a space, a bracket or an opening quote:
    // LaTeX's opening quote, as Word's smart quotes make it. Left as ', TeX printed a closing
    // quote at both ends, ’word’; one after a letter or a digit stays an apostrophe or a prime)
    else if (ch === "'" && quotes && opening) r = '`';
    else if (ch === '“') r = '``';
    else if (ch === '”') r = "''";
    else if (ch === '‘') r = '`';
    else if (ch === '’') r = "'";
    else if (ch === '—') r = '---';
    else if (ch === '–') r = '--';
    else if (ch === '\t') r = ' ';
    else if (ESC[ch] !== undefined && !opts.verbatim) r = ESC[ch];
    // (a double quote right after a single one: TeX reads ``` as “‘ and ''' as ”’, so ‘“ and ’”
    // get {} between them)
    if ((r === '``' && /(^|[^`])`$/.test(w)) || (r === "''" && /(^|[^'])'$/.test(w))) r = '{}' + r;
    out += r;
    p = ch;
    w = r;
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

// Minimal diff between two strings (common prefix/suffix). pre and suf: how many code units at
// the start and at the end the caller knows to be the same in both (App.commit knows where its
// edits were), so the comparison starts there and not at the whole file; the answer is the same.
export function diff(a, b, pre = 0, suf = 0) {
  if (a === b) return null;
  const n = Math.min(a.length, b.length);
  let s = Math.min(pre, n);
  while (s < n && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let e = Math.min(suf, n - s);
  while (e < n - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++;
  return { s, del: a.slice(s, a.length - e), ins: b.slice(s, b.length - e) };
}

// An undo step's record compares only what its edits left alone (win: for each file, how much of
// its start, pre, and its end, suf, App.commit's edits did not touch). A step that goes on over
// several commits (typing) keeps the least of each, which holds only while every commit starts
// from the text the one before left: so the step keeps that text (after), and a file found
// changed in between (opened over, Accept, another tab) loses its window and is compared from the
// ends, which is always right. before: each edited file's text at this commit's start; now(f):
// a file's text now; win: this commit's windows, or none.
export function stepStart(before, now, win) {
  const W = new Map(), after = new Map();
  for (const [f] of before) { after.set(f, now(f)); const w = win && win.get(f); if (w) W.set(f, w); }
  return { win: W, after };
}
export function stepJoin(step, before, now, win) {
  const W = step.win || new Map();
  for (const f of [...W.keys()]) {
    const start = before.has(f) ? before.get(f) : now(f);
    if (!step.after || step.after.get(f) !== start) W.delete(f);
  }
  for (const [f, b] of before) {
    const w = win && win.get(f), had = W.get(f);
    if (!step.before.has(f)) { step.before.set(f, b); if (w) W.set(f, w); else W.delete(f); }
    else if (w && had) W.set(f, { pre: Math.min(had.pre, w.pre), suf: Math.min(had.suf, w.suf) });
    else W.delete(f);
  }
  step.win = W;
  step.after = new Map();
  for (const [f] of step.before) step.after.set(f, now(f));
}
