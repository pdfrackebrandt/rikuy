// Direction, for Word files. Word keeps a direction on every paragraph (w:bidi) and on every run
// of text (w:rtl); LaTeX with babel's bidi=basic works both out from the characters and from the
// language in force. So on the way to Word the text of each paragraph is divided into runs by
// the direction of its characters, as the Unicode bidirectional algorithm resolves them (in a
// short form: the only embeddings are the wrappers LaTeX has), and the wrappers that set a
// direction are found in the source. Used by the page (src/wordast.js); nothing here needs a DOM.
import { rtlLanguage } from './scripts.js';

// Hebrew, Arabic, Syriac, Thaana, N'Ko and the presentation forms of Hebrew and Arabic
const RTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]|[\uD802\uD803\uD83A\uD83B][\uDC00-\uDFFF]/;
export const hasRtl = (t) => RTL.test(t);

const LETTER = /\p{L}/u, DIGIT = /\p{Nd}/u, MARK = /[\p{M}‌‍]/u;

// One class per UTF-16 unit of t, added to out: R and L for what has a direction of its own, D
// for a digit, M for a mark or joiner (it goes with its letter), N for the rest.
function classes(t, out) {
  for (const ch of t) {
    const c = MARK.test(ch) ? 'M' : RTL.test(ch) ? 'R' : LETTER.test(ch) ? 'L' : DIGIT.test(ch) ? 'D' : 'N';
    for (let k = 0; k < ch.length; k++) out.push(c);
  }
}

// The direction of each unit: 'R' or 'L'. base ('rtl' or 'ltr') is the paragraph's, or the
// wrapper's the text is in. A number takes the direction of the text before it (in Arabic text
// it is part of that text, after a Latin word it stays with the word); spaces and punctuation
// take the direction both their sides agree on, else the base. B (a line break) is a border.
export function resolve(cls, base) {
  const B = base === 'rtl' ? 'R' : 'L';
  const out = cls.slice();
  let last = B, prev = 'N';
  for (let i = 0; i < out.length; i++) {
    let c = out[i];
    if (c === 'M') c = prev;
    else if (c === 'D') c = last;
    else if (c === 'B') c = B;
    if (c !== 'N') last = c;
    out[i] = prev = c;
  }
  for (let i = 0; i < out.length;) {
    if (out[i] !== 'N') { i++; continue; }
    let j = i;
    while (j < out.length && out[j] === 'N') j++;
    const l = i ? out[i - 1] : B, r = j < out.length ? out[j] : B;
    out.fill(l === r ? l : B, i, j);
    i = j;
  }
  return out;
}

// ---- pandoc's tree ----------------------------------------------------------------------------

// pandoc's Word writer marks every run inside a Div or Span with dir="rtl" as right to left
// (w:rtl), and every paragraph inside such a Div (w:bidi); dir="ltr" turns both off again.
const dirAttr = (d) => ['', [], [['dir', d]]];
export const dirSpan = (d, inl) => ({ t: 'Span', c: [dirAttr(d), inl] });
const dirDiv = (d, blocks) => ({ t: 'Div', c: [dirAttr(d), blocks] });
const dirIn = (attr) => { const p = attr[2].find((kv) => kv[0] === 'dir'); return p && (p[1] === 'rtl' || p[1] === 'ltr') ? p[1] : null; };
const ownSpan = (x) => (x.t === 'Span' && !x.c[0][0] && !x.c[0][1].length ? dirIn(x.c[0]) : null);
const isComment = (x) => x.t === 'Span' && x.c[0][1].some((c) => c === 'comment-start' || c === 'comment-end');
// where an inline keeps its inlines: in c itself (0) or in c[1]
const KIDS = { Emph: 0, Strong: 0, Underline: 0, Strikeout: 0, Superscript: 0, Subscript: 0, SmallCaps: 0, Span: 1, Link: 1, Quoted: 1, Cite: 1 };
const kidsOf = (x) => (!Object.hasOwn(KIDS, x.t) ? null : KIDS[x.t] ? x.c[1] : x.c);
const withKids = (x, k) => (KIDS[x.t] ? { ...x, c: [x.c[0], k, ...x.c.slice(2)] } : { ...x, c: k });

// A paragraph's inlines with every stretch of text that runs against `amb` (the direction
// pandoc has in force there) in a span that says so. base: the direction spaces and punctuation
// fall back to. A span that names a direction already (a LaTeX wrapper, src/wordast.js) is text
// of that direction to its surroundings, and its own text is resolved inside it.
function inlines(inl, base, amb, C) {
  const cls = [];
  const scan = (list) => {
    for (const x of list) {
      const d = ownSpan(x);
      if (d) cls.push(d === 'rtl' ? 'R' : 'L');
      else if (x.t === 'Str') classes(x.c, cls);
      else if (x.t === 'LineBreak') cls.push('B');
      else if (x.t === 'Code') cls.push('L');
      else if (isComment(x) || !kidsOf(x)) cls.push('N');
      else scan(kidsOf(x));
    }
  };
  scan(inl);
  const dirs = resolve(cls, base);
  let i = 0;
  const build = (list) => {
    const out = [];
    for (const x of list) {
      const d = ownSpan(x);
      if (d) { i++; out.push(dirSpan(d, inlines(x.c[1], d, d, C))); continue; }
      if (x.t === 'Str') {
        const n = x.c.length;
        for (let a = 0, b; a < n; a = b) {
          b = a + 1;
          while (b < n && dirs[i + b] === dirs[i + a]) b++;
          const dd = dirs[i + a] === 'R' ? 'rtl' : 'ltr';
          const s = { t: 'Str', c: x.c.slice(a, b) };
          out.push(dd === amb ? s : dirSpan(dd, [s]));
        }
        i += n;
        continue;
      }
      // code reads left to right wherever it stands
      if (x.t === 'Code') { i++; out.push(amb === 'rtl' ? dirSpan('ltr', [x]) : x); continue; }
      if (x.t === 'Note') { i++; out.push({ t: 'Note', c: blocks(x.c, amb, C) }); continue; }
      // a comment's own words (its start mark holds them) are not the paragraph's
      if (isComment(x)) { i++; out.push(withKids(x, inlines(x.c[1], amb, amb, C))); continue; }
      const k = kidsOf(x);
      if (!k) { i++; out.push(x); continue; }
      out.push(withKids(x, build(k)));
    }
    return out;
  };
  return build(inl);
}

function blocks(list, amb, C) {
  const out = [];
  for (const b of list) out.push(block(b, amb, C));
  return out;
}

// the direction of the block Rikuy's bookmark in these inlines stands for
function anchored(inl, C) {
  for (const x of inl) if (x.t === 'Span' && x.c[0][0] && C.dirOf.has(x.c[0][0])) return C.dirOf.get(x.c[0][0]);
  return null;
}

function block(b, amb, C) {
  const all = (bs) => blocks(bs, amb, C);
  switch (b.t) {
    case 'Para': case 'Plain': {
      const d = anchored(b.c, C) || amb;
      const nb = { t: b.t, c: inlines(b.c, d, d, C) };
      return d === amb ? nb : dirDiv(d, [nb]);
    }
    case 'Header': {
      const d = anchored(b.c[2], C) || amb;
      const nb = { t: 'Header', c: [b.c[0], b.c[1], inlines(b.c[2], d, d, C)] };
      return d === amb ? nb : dirDiv(d, [nb]);
    }
    case 'BulletList': return { t: b.t, c: b.c.map(all) };
    case 'OrderedList': return { t: b.t, c: [b.c[0], b.c[1].map(all)] };
    // a term is a line of its own with no paragraph around it to turn: its text only
    case 'DefinitionList': return { t: b.t, c: b.c.map(([term, defs]) => {
      const d = anchored(term, C) || amb;
      return [inlines(term, d, amb, C), defs.map(all)];
    }) };
    case 'BlockQuote': return { t: b.t, c: all(b.c) };
    case 'Div': return { t: b.t, c: [b.c[0], blocks(b.c[1], dirIn(b.c[0]) || amb, C)] };
    case 'Figure': return { t: b.t, c: [b.c[0], [b.c[1][0], all(b.c[1][1])], all(b.c[2])] };
    case 'LineBlock': return { t: b.t, c: b.c.map((l) => inlines(l, amb, amb, C)) };
    case 'Table': {
      const cell = (c) => [c[0], c[1], c[2], c[3], all(c[4])];
      const row = (r) => [r[0], r[1].map(cell)];
      const [attr, cap, specs, head, bodies, foot] = b.c;
      return { t: b.t, c: [attr, [cap[0], all(cap[1])], specs, [head[0], head[1].map(row)], bodies.map((x) => [x[0], x[1], x[2].map(row), x[3].map(row)]), [foot[0], foot[1].map(row)]] };
    }
    case 'CodeBlock': return amb === 'rtl' ? dirDiv('ltr', [b]) : b;
    default: return b;
  }
}

// doc: pandoc's tree of the page (blocks and meta); dirOf: Map of a bookmark's id to the
// direction of its block where the source or the model says one; rtl: the document runs right
// to left. Returns the tree with its directions spelt out for pandoc's Word writer.
export function bidiDoc(doc, dirOf, rtl) {
  const D = rtl ? 'rtl' : 'ltr';
  const C = { dirOf };
  const meta = {};
  for (const [k, v] of Object.entries(doc.meta)) meta[k] = metaValue(v, D, C);
  // pandoc reads the document's own direction from its meta data
  if (rtl) meta.dir = { t: 'MetaString', c: 'rtl' };
  return { ...doc, meta, blocks: blocks(doc.blocks, D, C) };
}
function metaValue(v, D, C) {
  if (!v || typeof v !== 'object') return v;
  if (v.t === 'MetaInlines') return { t: v.t, c: inlines(v.c, D, D, C) };
  if (v.t === 'MetaBlocks') return { t: v.t, c: blocks(v.c, D, C) };
  if (v.t === 'MetaList') return { t: v.t, c: v.c.map((x) => metaValue(x, D, C)) };
  return v;
}

// ---- the source -------------------------------------------------------------------------------

// languages polyglossia has an environment and a \text command for, set left to right
const LTR_LANGUAGES = /^(english|french|german|spanish|italian|portuguese|dutch|latin|greek|russian|turkish|catalan|polish|czech|swedish|danish|norwegian|finnish)$/;
const VERBATIM = /^(verbatim|Verbatim|lstlisting|minted|comment|filecontents)\*?$/;
const QUICK = /\\(begin\s*\{\s*(otherlanguage|Arabic|RTL|LTR|CJK|hebrew|persian|farsi|urdu|syriac|kurdish|pashto|uyghur|sindhi)\*?\s*\}|foreignlanguage|text(arabic|hebrew|persian|farsi|urdu|syriac|kurdish|pashto|uyghur|sindhi)|RLE?(?![A-Za-z])|LRE?(?![A-Za-z])|selectlanguage|set(RTL|LTR|RL|LR)(?![A-Za-z])|CJKfamily)/;

// the braces at p (after spaces) and what is in them: { s, e, text }, or null. B.n: how many
// characters the whole scan may still read looking for closing braces; a source of a hundred
// thousand wrappers that never close (it may be a stranger's) would else be read once for each.
function braces(tex, p, B) {
  while (p < tex.length && /\s/.test(tex[p])) p++;
  if (tex[p] !== '{') return null;
  let d = 0;
  for (let k = p; k < tex.length && B.n-- > 0; k++) {
    const c = tex[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return { s: p, e: k + 1, text: tex.slice(p + 1, k) };
  }
  return null;
}
// the end of an optional argument at p (a short one, on a few lines at most), or p
function brackets(tex, p) {
  let q = p;
  while (q < tex.length && (tex[q] === ' ' || tex[q] === '\t')) q++;
  if (tex[q] !== '[') return p;
  const e = tex.slice(q, q + 400).indexOf(']');
  return e < 0 || tex.slice(q, q + e).includes('\n\n') ? p : q + e + 1;
}

// The stretches of a LaTeX source that a wrapper sets right to left or left to right, and the
// stretches the page model may show that are no text of the document. null when it has none.
//   block(p): the direction an environment or a language switch gives the paragraph at p
//     (\begin{otherlanguage}{arabic}, polyglossia's \begin{Arabic}, the bidi package's
//     \begin{RTL} and \begin{LTR}, \selectlanguage, \setRTL), or null;
//   inline(p): the direction a command gives the text at p, inside a paragraph that keeps its
//     own (\foreignlanguage{arabic}{..}, \textarabic{..}, \RL{..}, \LR{..}), or null;
//   hidden(p): p is in the arguments of the CJK package's wrappers (\begin{CJK}{UTF8}{gbsn},
//     \CJKfamily{gkai}) or in an option of the environments above.
export function scanDir(tex) {
  if (!QUICK.test(tex)) return null;
  const ranges = [], hide = [];
  const B = { n: 8 * tex.length + 1e5 };
  let last = null;
  const add = (s, e, dir, blk) => {
    const r = { s, e, dir, block: blk, parent: null };
    let p = last;
    while (p && !(p.s <= s && s < p.e)) p = p.parent;
    r.parent = p;
    ranges.push(r);
    last = r;
    return r;
  };
  // environments open at this point, innermost last; decl: a language switch in force in one
  const stack = [{ name: '', r: null, decl: null }];
  const top = () => stack[stack.length - 1];
  const declare = (at, from, dir) => { const f = top(); if (f.decl) f.decl.e = at; f.decl = add(from, tex.length, dir, true); };
  const langDir = (l) => (rtlLanguage(l) ? 'rtl' : 'ltr');
  const RE = /%[^\n]*|\\(begin|end)\s*\{([^{}]*)\}|\\([A-Za-z]+)|\\[^A-Za-z]/g;
  for (let m; (m = RE.exec(tex));) {
    if (m[1] === 'begin') {
      const name = m[2].trim(), bare = name.replace(/\*$/, '');
      let p = RE.lastIndex, dir = null;
      if (VERBATIM.test(name)) { const e = tex.indexOf('\\end{' + name + '}', p); RE.lastIndex = e < 0 ? tex.length : e; continue; }
      if (bare === 'otherlanguage') { const a = braces(tex, p, B); if (a) { dir = langDir(a.text.trim()); p = a.e; } }
      else if (name === 'RTL' || name === 'Arabic' || (name !== 'arabic' && rtlLanguage(name))) dir = 'rtl';
      else if (name === 'LTR' || LTR_LANGUAGES.test(name)) dir = 'ltr';
      else if (bare === 'CJK') {
        const a = braces(tex, p, B), b = a && braces(tex, a.e, B);
        if (b) { let e = b.e; while (e < tex.length && /\s/.test(tex[e])) e++; hide.push([p, e]); p = b.e; }
      }
      if (dir && bare !== 'otherlanguage') { const e = brackets(tex, p); if (e > p) { hide.push([p, e]); p = e; } }
      // the starred form sets the text's direction and leaves the paragraph's (babel)
      // (no document nests its environments two hundred deep: past that they are not followed)
      if (stack.length < 200) stack.push({ name, r: dir ? add(p, tex.length, dir, name !== 'otherlanguage*') : null, decl: null });
      RE.lastIndex = p;
    } else if (m[1] === 'end') {
      const name = m[2].trim();
      let k = stack.length - 1;
      while (k > 0 && stack[k].name !== name) k--;
      if (k > 0) for (const f of stack.splice(k)) { if (f.decl) f.decl.e = m.index; if (f.r) f.r.e = m.index; }
      if (name === 'document') break;
    } else if (m[3]) {
      const name = m[3], p = RE.lastIndex;
      const lang = /^text([a-z]+)$/.exec(name);
      let dir = null;
      if (name === 'foreignlanguage' || name === 'selectlanguage') {
        const a = braces(tex, brackets(tex, p), B);
        if (!a) continue;
        if (name === 'selectlanguage') { declare(m.index, a.e, langDir(a.text.trim())); RE.lastIndex = a.e; continue; }
        const b = braces(tex, a.e, B);
        if (b) { add(b.s + 1, b.e - 1, langDir(a.text.trim()), false); RE.lastIndex = b.s + 1; }
        continue;
      }
      if (name === 'setRTL' || name === 'setRL') { declare(m.index, p, 'rtl'); continue; }
      if (name === 'setLTR' || name === 'setLR') { declare(m.index, p, 'ltr'); continue; }
      if (name === 'CJKfamily') { const a = braces(tex, p, B); if (a) hide.push([a.s, a.e]); continue; }
      if (name === 'RL' || name === 'RLE' || (lang && rtlLanguage(lang[1]))) dir = 'rtl';
      else if (name === 'LR' || name === 'LRE' || (lang && LTR_LANGUAGES.test(lang[1]))) dir = 'ltr';
      if (!dir) continue;
      const a = braces(tex, brackets(tex, p), B);
      if (a) { add(a.s + 1, a.e - 1, dir, false); RE.lastIndex = a.s + 1; }
    }
  }
  if (!ranges.length && !hide.length) return null;
  // the innermost stretch holding p: the last that starts at or before it, or one around that
  const at = (p) => {
    let lo = 0, hi = ranges.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ranges[mid].s <= p) lo = mid + 1; else hi = mid; }
    let r = lo ? ranges[lo - 1] : null;
    while (r && p >= r.e) r = r.parent;
    return r;
  };
  return {
    block: (p) => { let r = at(p); while (r && !r.block) r = r.parent; return r ? r.dir : null; },
    inline: (p) => { const r = at(p); return r && !r.block ? r.dir : null; },
    hidden: (p) => {
      let lo = 0, hi = hide.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (hide[mid][0] <= p) lo = mid + 1; else hi = mid; }
      return lo > 0 && p < hide[lo - 1][1];
    }
  };
}
