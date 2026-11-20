// Find and Replace on the typeset text. The page's text is read from the rendered blocks (each
// character of a span.t knows its source range through the block's seg map, src/render.js), so a
// hit is found in what the page shows ("50%", “quoted”, an é) and mapped back to the exact
// characters of the source (\%, ``quoted'', \'e). Formulas, citations, references and footnote
// marks are atoms: no hit runs across one, and a paragraph's, a cell's or an item's end stops a
// hit as well. Commands, labels and math are not text here, so nothing inside them is found or
// replaced unless "In LaTeX source" is asked for, which searches the files themselves.
//
// The pure parts (the query as a pattern, Word's ^ codes and wildcards, the replacement's
// groups, a search over one text) are tested in test/find.test.mjs; pageText reads the page.

import { texToPlain } from './bib.js';

// what stands in the text for an atom, and for the end of a paragraph, a cell or an item
export const SEP = '￼';
export const PARA = '\n';
// (Word's ^p on the page: a paragraph's end that a hit may run across, in the text pageParaText
// joins from the page's paragraphs; the blank line between two paragraphs in the source)
export const PMARK = '\u2029';
// (the most hits counted, and the most a pattern may take: a pattern is the person's own, the
// text may be a long document; past these the search says it stopped)
export const MAX_HITS = 10000;
const BUDGET_MS = 1500;

// Formatting a hit may be asked to have (Format in the dialog): Word's names, the commands they
// stand for, and the class the page draws them with (src/render.js 'y y-' + the model's st)
export const FMT = {
  bold: 1, italic: 2, underline: 4, strike: 8, smallcaps: 16, typewriter: 32, highlight: 64, color: 128, link: 256,
  h1: 512, h2: 1024, h3: 2048, footnote: 4096, caption: 8192, latex: 16384, chapter: 32768,
  // LaTeX's own kinds of text, as Word's Format › Style finds a paragraph style: any heading, a
  // list's item, a table's cell, a theorem or a proof, a quotation (quote, quotation, verse), and
  // the formulas themselves (found in their LaTeX, src/cmd/find.js equationHits)
  heading: 65536, list: 131072, table: 262144, theorem: 524288, quote: 1048576, equation: 2097152
};
export const FORMATS = [
  { id: 'bold', name: 'Bold', cmd: '\\textbf, \\bfseries' },
  { id: 'italic', name: 'Italic', cmd: '\\emph, \\textit, \\itshape' },
  { id: 'underline', name: 'Underline', cmd: '\\underline, \\uline' },
  { id: 'strike', name: 'Strikethrough', cmd: '\\sout' },
  { id: 'smallcaps', name: 'Small caps', cmd: '\\textsc' },
  { id: 'typewriter', name: 'Typewriter', cmd: '\\texttt' },
  { id: 'highlight', name: 'Highlight', cmd: '\\hl' },
  { id: 'color', name: 'Font color', cmd: '\\textcolor' },
  { id: 'link', name: 'Link', cmd: '\\href' },
  { id: 'chapter', name: 'Chapter', cmd: '\\chapter' },
  { id: 'h1', name: 'Heading 1', cmd: '\\section' },
  { id: 'h2', name: 'Heading 2', cmd: '\\subsection' },
  { id: 'h3', name: 'Heading 3', cmd: '\\subsubsection' },
  { id: 'footnote', name: 'Footnote text', cmd: '\\footnote' },
  { id: 'caption', name: 'Caption', cmd: '\\caption' },
  { id: 'latex', name: 'LaTeX paragraph', cmd: '% rikuy: latex' },
  { id: 'heading', name: 'Any heading', cmd: '\\part to \\subparagraph' },
  { id: 'list', name: 'List item', cmd: '\\item of itemize, enumerate, description' },
  { id: 'table', name: 'Table cell', cmd: 'tabular, tabularx, longtable' },
  { id: 'theorem', name: 'Theorem or proof', cmd: 'theorem, lemma, definition, proof (\\newtheorem)' },
  { id: 'quote', name: 'Quotation', cmd: 'quote, quotation, verse' },
  { id: 'equation', name: 'Equation', cmd: '$…$, \\[…\\], equation, align: found in its LaTeX' }
];
const CLASS_FMT = { 'y-bf': FMT.bold, 'y-it': FMT.italic, 'y-em': FMT.italic, 'y-sl': FMT.italic, 'y-ul': FMT.underline, 'y-so': FMT.strike, 'y-sc': FMT.smallcaps,
  'y-tt': FMT.typewriter, 'y-hl': FMT.highlight, 'y-color': FMT.color, 'y-link': FMT.link, h0: FMT.chapter, h1: FMT.h1, h2: FMT.h2, h3: FMT.h3, fn: FMT.footnote, tex: FMT.latex,
  h: FMT.heading, thm: FMT.theorem, prf: FMT.theorem, quote: FMT.quote };

// ---- the query as a pattern ---------------------------------------------------------------------

const WORD = '[\\p{L}\\p{N}\\p{M}_]';
const ANY = '[^\\n\\uFFFC\\u2029]';
// (a sign of a pattern, escaped; not the hyphen: with Unicode's rules \- is an error outside a
// set, and well-known would not be found. A set escapes its own hyphen.)
const esc = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Word's ^ codes in the find box: any character, digit, letter, white space, a nonbreaking
// space, the dashes, a caret
const CARET = { '?': ANY, '#': '\\p{Nd}', $: '\\p{L}', w: '[ \\t\\u00A0]+', s: '\\u00A0', '^': '\\^', t: '\\t', '+': '—', '=': '–', '~': '‑', '-': '\\u00AD' };
// a character typed as it is: a space finds a nonbreaking one too (~ in the source), a straight
// quote the typeset curly ones (`` and '' in the source), as Word's do
function lit(c) {
  if (c === ' ') return '[ \\u00A0]';
  if (c === '"' || c === '“' || c === '”') return '["“”]';
  if (c === "'" || c === '‘' || c === '’') return "['‘’]";
  return esc(c);
}

// Word's wildcards (Use wildcards): ? one character, * any run (as few as can be), @ one or more
// of what stands before, {n,m} (or {n;m}) a count, [abc] [a-z] [!x] a set, < > a word's start and
// end, ( ) a group for \1 in the replacement, \ before a sign for the sign itself
function wildcards(q, pm = PARA_MARK) {
  let out = '', groups = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === '\\' && i + 1 < q.length) { out += esc(q[++i]); continue; }
    if (c === '^' && q[i + 1] === 'p') { out += pm; i++; continue; }
    if (c === '^' && i + 1 < q.length && CARET[q[i + 1]]) { out += CARET[q[++i]]; continue; }
    if (c === '?') out += ANY;
    // (* and @ reach at most 255 characters, as Word's counts do: a search that starts at every
    // character of a long paragraph cannot then cost the square of its length)
    else if (c === '*') out += ANY + '{0,255}?';
    else if (c === '@') out += '{1,255}';
    else if (c === '<') out += '(?<!' + WORD + ')(?=' + WORD + ')';
    else if (c === '>') out += '(?<=' + WORD + ')(?!' + WORD + ')';
    else if (c === '(') { out += '('; groups++; }
    else if (c === ')') out += ')';
    else if (c === '{') {
      const m = /^\{(\d{1,4})(?:([,;])(\d{0,4}))?\}/.exec(q.slice(i, i + 12));
      if (!m) throw new Error('A count is written {2}, {2,} or {2,4}.');
      out += '{' + m[1] + (m[2] ? ',' + m[3] : '') + '}';
      i += m[0].length - 1;
    } else if (c === '[') {
      const end = q.indexOf(']', i + 2);
      if (end < 0) throw new Error('A set of characters is closed with ].');
      let body = q.slice(i + 1, end), neg = false;
      if (body[0] === '!') { neg = true; body = body.slice(1); }
      let set = '';
      for (let k = 0; k < body.length; k++) {
        const d = body[k];
        if (d === '\\' && k + 1 < body.length) set += esc(body[++k]);
        else if (d === '-' && k > 0 && k < body.length - 1) set += '-';
        else set += /[\]\\^[-]/.test(d) ? '\\' + d : d;
      }
      out += '[' + (neg ? '^\\n\\uFFFC\\u2029' : '') + set + ']';
      i = end;
    } else out += lit(c);
  }
  return { src: out, groups };
}

// Word's ^p, a paragraph's end: in the LaTeX source a blank line; on the page the mark that
// stands between two paragraphs in the text pageParaText joins (PMARK)
const PARA_MARK = '\\r?\\n[ \\t]*\\r?\\n';
const PAGE_MARK = '\\u2029';
// whether a query (not a regular expression) has Word's ^p in it, the ^^ of a caret aside
export function hasParaMark(q) {
  for (let i = 0; i < q.length - 1; i++) {
    if (q[i] !== '^') continue;
    if (q[i + 1] === 'p') return true;
    i++;
  }
  return false;
}

// The query as a RegExp, or { error } with a sentence saying what is wrong.
// o: { matchCase, wholeWord, wildcards, regex, source }
export function compile(q, o = {}) {
  if (!q) return { error: '' };
  if (q.length > 2000) return { error: 'The text to find is longer than 2000 characters.' };
  const pm = o.source ? PARA_MARK : PAGE_MARK;
  let src;
  try {
    if (o.regex) src = q;
    else if (o.wildcards) src = wildcards(q, pm).src;
    else {
      src = '';
      // (literal: a formula's LaTeX, where x^p and A^t are what they say, not Word's codes)
      for (let i = 0; i < q.length; i++) {
        if (!o.literal && q[i] === '^' && q[i + 1] === 'p') { src += pm; i++; continue; }
        if (!o.literal && q[i] === '^' && i + 1 < q.length && CARET[q[i + 1]]) { src += CARET[q[++i]]; continue; }
        src += lit(q[i]);
      }
    }
  } catch (e) { return { error: e.message }; }
  if (o.wholeWord) src = '(?<!' + WORD + ')(?:' + src + ')(?!' + WORD + ')';
  // (Word's wildcards always match case: [A-Z] means capitals)
  const flags = 'g' + (o.matchCase || (o.wildcards && !o.regex) ? '' : 'i');
  try { return { re: new RegExp(src, flags + 'u') }; } catch (e) {
    // (a regular expression written without Unicode's stricter rules: \- or a lone brace)
    if (o.regex && !o.wholeWord) { try { return { re: new RegExp(src, flags) }; } catch (e2) { /* the first error says it */ } }
    return { error: 'This pattern cannot be read: ' + String(e.message).replace(/^Invalid regular expression: /, '') };
  }
}

// The replacement for one hit: Word's ^& (what was found) and ^^ (a caret), \1 to \9 (a group of
// the wildcards), and with regular expressions JavaScript's $1, $& and $<name> as well.
// o.literal: a formula's LaTeX, where only ^& and the groups are codes (x^p stays x^p)
export function expand(rep, m, o = {}) {
  let out = '';
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i], d = rep[i + 1];
    if (c === '^' && d === '&') { out += m[0]; i++; continue; }
    if (o.literal && c === '^' && d !== '&') { out += c; continue; }
    if (c === '^' && d === '^') { out += '^'; i++; continue; }
    if (c === '^' && d === 'p') { out += '\n\n'; i++; continue; }
    if (c === '^' && d && CARET[d] && d !== '?' && d !== '#' && d !== '$' && d !== 'w') { const t = { s: ' ', t: '\t', '+': '—', '=': '–', '~': '‑', '-': '­' }[d]; if (t != null) { out += t; i++; continue; } }
    if ((o.wildcards || o.regex) && c === '\\' && /[1-9]/.test(d || '')) { out += m[+d] ?? ''; i++; continue; }
    if (o.regex && c === '$') {
      if (d === '$') { out += '$'; i++; continue; }
      if (d === '&') { out += m[0]; i++; continue; }
      if (/[0-9]/.test(d || '')) {
        // $12 when there are twelve groups, else $1 then a 2
        const two = rep.slice(i + 1, i + 3);
        if (/^\d\d$/.test(two) && +two < m.length) { out += m[+two] ?? ''; i += 2; continue; }
        out += m[+d] ?? ''; i++; continue;
      }
      if (d === '<') { const e = rep.indexOf('>', i); if (e > 0 && m.groups) { out += m.groups[rep.slice(i + 2, e)] ?? ''; i = e; continue; } }
    }
    out += c;
  }
  return out;
}

// Every hit of re in text: [{ i, j, m }], no empty ones, none across an atom or a paragraph's
// end. The pattern runs on each stretch between them alone (a pattern of one's own, [^x]+ or
// \s, would otherwise reach over them and find nothing; ^ and $ then mean a stretch's ends).
// Stops at max hits or when the time is up (stopped: true).
export function hitsIn(text, re, o = {}) {
  const out = [], max = o.max ?? MAX_HITS, t0 = o.t0 ?? Date.now(), budget = o.budget ?? BUDGET_MS;
  let n = 0;
  for (let a = 0; a <= text.length;) {
    let b = a;
    while (b < text.length && text[b] !== PARA && text[b] !== SEP) b++;
    if (b > a) {
      const part = text.slice(a, b);
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(part))) {
        if (m[0] === '') { re.lastIndex = m.index + 1 + (part.codePointAt(m.index) > 0xFFFF ? 1 : 0); if (re.lastIndex > part.length) break; continue; }
        m.index += a;
        out.push({ i: m.index, j: m.index + m[0].length, m });
        if (out.length >= max) return { hits: out, more: true };
        if ((++n & 255) === 0 && Date.now() - t0 > budget) return { hits: out, stopped: true };
      }
      if (Date.now() - t0 > budget) return { hits: out, stopped: true };
    }
    a = b + 1;
  }
  return { hits: out };
}

// The runs of text with every bit of want: what Find with an empty box and a format finds
// (fmt: one number per character)
export function runsWith(fmt, text, want) {
  const out = [];
  let i = -1;
  for (let k = 0; k <= text.length; k++) {
    const ok = k < text.length && (fmt[k] & want) === want && text[k] !== PARA && text[k] !== SEP;
    if (ok && i < 0) i = k;
    else if (!ok && i >= 0) {
      // (a run is the words: the spaces at its ends are not)
      let a = i, b = k;
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      if (b > a) out.push({ i: a, j: b, m: [text.slice(a, b)] });
      i = -1;
    }
  }
  return out;
}

// A hit with what stands around it, for the list of results: [before, hit, after], cut at words
export function context(text, i, j, room = 34) {
  const clean = (s) => s.replace(/[\n￼]+/g, ' … ').replace(/\u2029/g, ' ¶ ').replace(/[^\S\u2029]+/g, ' ');
  let a = Math.max(0, i - room), b = Math.min(text.length, j + room);
  if (a > 0) { const sp = text.indexOf(' ', a); if (sp >= 0 && sp < i) a = sp + 1; }
  if (b < text.length) { const sp = text.lastIndexOf(' ', b); if (sp > j) b = sp; }
  const lead = text.lastIndexOf(PARA, i - 1);
  if (lead >= a) a = lead + 1;
  const tail = text.indexOf(PARA, j);
  if (tail >= 0 && tail < b) b = tail;
  return [(a > 0 && text[a - 1] !== PARA ? '…' : '') + clean(text.slice(a, i)).trimStart(), clean(text.slice(i, j)), clean(text.slice(j, b)).trimEnd() + (b < text.length && text[b] !== PARA ? '…' : '')];
}

// Hits in a file's own text (In LaTeX source): [{ i, j, m }], nothing filtered out
export function hitsInSource(text, re, o = {}) {
  const out = [], max = o.max ?? MAX_HITS, t0 = Date.now();
  re.lastIndex = 0;
  let m, n = 0;
  while ((m = re.exec(text))) {
    if (m[0] === '') { re.lastIndex = m.index + 1; if (re.lastIndex > text.length) break; continue; }
    out.push({ i: m.index, j: m.index + m[0].length, m });
    if (out.length >= max) return { hits: out, more: true };
    if ((++n & 255) === 0 && Date.now() - t0 > BUDGET_MS) return { hits: out, stopped: true };
  }
  return { hits: out };
}

// Every \label{key} of a file's text that is not commented out: [{ key, p }], in one pass (a
// stranger's file may hold many thousands; each key is read up to 200 characters, a comment is
// known from where its line starts as the scan goes, never by searching again for each label)
export function labelsIn(t, max = 20000) {
  const out = [];
  let scan = 0, comment = false;
  for (let k = t.indexOf('\\label{'); k >= 0 && out.length < max; k = t.indexOf('\\label{', k + 7)) {
    for (; scan < k; scan++) {
      const c = t.charCodeAt(scan);
      if (c === 10) comment = false;
      else if (c === 37 && t.charCodeAt(scan - 1) !== 92) comment = true;
    }
    if (comment) continue;
    const e = t.slice(k + 7, k + 208).indexOf('}');
    if (e < 0) continue;
    out.push({ key: t.slice(k + 7, k + 7 + e).trim(), p: k });
  }
  return out;
}

// The words of what a \label at p names, for the reference picker (POWER-USER.md 7): a heading's
// title, an equation's LaTeX ({ math }), a figure's or a table's caption, the first words of a
// theorem; { text: '' } when nothing is found near it. Pure: test/find.test.mjs.
const HEADING = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\]\s*)?\{/g;
const MATHS = /^(equation|align|gather|multline|flalign|alignat|eqnarray|math|displaymath)\*?$/;
// the group that opens at o ({ at t[o]): its inside, or null
function groupAt(t, o) {
  if (t[o] !== '{') return null;
  let d = 0;
  for (let k = o; k < t.length && k < o + 4000; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return t.slice(o + 1, k);
  }
  return null;
}
// the environment the place p is in: { name, s (after \begin{name}), e (at \end{name}) }
function envAround(t, p) {
  const re = /\\(begin|end)\s*\{([^}]+)\}/g;
  const open = [];
  for (let m; (m = re.exec(t)) && m.index < p;) {
    if (m[1] === 'begin') open.push({ name: m[2], s: m.index + m[0].length });
    else { const i = open.map((x) => x.name).lastIndexOf(m[2]); if (i >= 0) open.length = i; }
  }
  const x = open[open.length - 1];
  if (!x) return null;
  const end = t.indexOf('\\end{' + x.name + '}', p);
  return end < 0 ? null : { name: x.name, s: x.s, e: end };
}
const squash = (s, n) => { const x = s.replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
export function labelPreview(t, p, kind) {
  if (!t || p == null || p < 0) return { text: '' };
  const env = envAround(t, p);
  const disp = t.lastIndexOf('\\[', p), dispEnd = disp >= 0 ? t.indexOf('\\]', disp) : -1;
  if (kind === 'equation' || (env && MATHS.test(env.name))) {
    let inner = env && MATHS.test(env.name) ? t.slice(env.s, env.e) : disp >= 0 && dispEnd > p ? t.slice(disp + 2, dispEnd) : '';
    inner = inner.replace(/\\label\s*\{[^}]*\}|\\(nonumber|notag)\b/g, '');
    if (inner.trim()) return { math: squash(inner, 160) };
  }
  if (env && /^(figure|table|wrapfigure|wraptable|sidewaysfigure|sidewaystable)\*?$/.test(env.name)) {
    const body = t.slice(env.s, env.e), c = /\\caption\s*(?:\[[^\]]*\]\s*)?\{/.exec(body);
    const g = c ? groupAt(body, c.index + c[0].length - 1) : null;
    if (g != null) return { text: squash(texToPlain(g), 90) };
  }
  // a heading: the last one before the label, with nothing but other labels between them
  let h = null;
  HEADING.lastIndex = Math.max(0, p - 600);
  for (let m; (m = HEADING.exec(t)) && m.index < p;) h = m;
  if (h) {
    const o = h.index + h[0].length - 1, g = groupAt(t, o);
    if (g != null && /^\s*(\\label\s*\{[^}]*\}\s*)*$/.test(t.slice(o + g.length + 2, p))) return { text: squash(texToPlain(g), 90) };
  }
  if (env) return { text: squash(texToPlain(t.slice(env.s, Math.min(env.e, env.s + 300)).replace(/\\label\s*\{[^}]*\}/g, '').replace(/^\s*\[[^\]]*\]/, '')), 90) };
  return { text: '' };
}

// Character ranges of the source next to each other joined: [[s, e], ...] sorted
export function joinRanges(rs) {
  const out = [];
  for (const r of [...rs].sort((a, b) => a[0] - b[0])) {
    const L = out[out.length - 1];
    if (L && r[0] <= L[1]) L[1] = Math.max(L[1], r[1]); else out.push([r[0], r[1]]);
  }
  return out;
}

// ---- the page's text --------------------------------------------------------------------------
// One block's text as the page draws it (its items, then its footnotes), with for each character
// the index of its seg in B.segs and its place in that seg (-1 for SEP and PARA), and the
// formatting it is drawn with. Read once per drawn block: a block reused by the renderer keeps
// its text (its seg maps are relative to B.base, which moves with it).
const BLOCK_TAGS = new Set(['DIV', 'P', 'TD', 'TH', 'TR', 'TABLE', 'TBODY', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'PRE', 'FIGCAPTION', 'FIGURE', 'SECTION']);
const SKIP = /(^|\s)(mk-layer|cm-layer|envtag|fnrule|folio|ghostp|gh)(\s|$)/;
const cache = new WeakMap();
export function blockText(B) {
  const had = cache.get(B);
  if (had) return had;
  const chars = [], seg = [], k = [], fmt = [];
  const push = (c, g, i, f) => { chars.push(c); seg.push(g); k.push(i); fmt.push(f); };
  const sep = (c) => { const L = chars[chars.length - 1]; if (L === undefined || L === PARA || (L === SEP && c === SEP)) return; if (L === SEP && c === PARA) { chars[chars.length - 1] = PARA; return; } push(c, -1, -1, 0); };
  const pre = B.id + '.';
  const walk = (n, f) => {
    if (n.nodeType === 3) return;
    if (n.nodeType !== 1) return;
    const cl = n.className && typeof n.className === 'string' ? n.className : '';
    if (cl && SKIP.test(cl)) return;
    // (a number, a label, a theorem's head, text a macro made: drawn, not the source's own
    // characters, so not found; it parts the words around it)
    if (n.classList.contains('chr')) { if (/\S/.test(n.textContent) && !n.classList.contains('sp')) sep(SEP); return; }
    if (n.classList.contains('t')) {
      const g = n.dataset.g;
      if (!g || !g.startsWith(pre) || n.classList.contains('ph')) return;
      const gi = +g.slice(pre.length), t = n.textContent;
      for (let i = 0; i < t.length; i++) push(t[i], gi, i, f);
      return;
    }
    if (n.classList.contains('atom') || (n.dataset && n.dataset.a)) { sep(SEP); return; }
    let g = f;
    for (const c of n.classList) if (CLASS_FMT[c]) g |= CLASS_FMT[c];
    if (n.dataset && n.dataset.ctx === 'cap') g |= FMT.caption;
    if (n.dataset && n.dataset.ctx === 'li') g |= FMT.list;
    if (n.tagName === 'TD' || n.tagName === 'TH') g |= FMT.table;
    const block = BLOCK_TAGS.has(n.tagName);
    if (block) sep(PARA);
    if (n.tagName === 'BR') { sep(SEP); return; }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c, g);
    if (block) sep(PARA);
  };
  for (const it of B.items) { walk(it.el, 0); sep(PARA); }
  for (const fn of B.fns) { walk(fn.el, FMT.footnote); sep(PARA); }
  const out = { text: chars.join(''), seg: Int32Array.from(seg), k: Int32Array.from(k), fmt: Uint32Array.from(fmt) };
  cache.set(B, out);
  return out;
}

// The source range of character x of a block's text (null for SEP and PARA)
export function charSrc(B, T, x) {
  const g = T.seg[x];
  if (g < 0) return null;
  const s = B.segs[g];
  if (!s || s.ph) return null;
  const k = T.k[x];
  const a = B.base + s.rel[2 * k], b = B.base + s.rel[2 * k + 1];
  return { f: s.f || B.f, s: a, e: b };
}

// A hit [i, j) of block B's text as source: its file, its range, the range of each character
// (joined where they touch), and ro when a character has no place in the source of its own
export function hitSource(B, T, i, j) {
  let f = null, ro = false;
  const rs = [];
  for (let x = i; x < j; x++) {
    const c = charSrc(B, T, x);
    if (!c) { ro = true; continue; }
    if (f == null) f = c.f;
    if (c.f !== f || c.s < 0 || c.e <= c.s) { ro = true; continue; }
    rs.push([c.s, c.e]);
  }
  if (f == null || !rs.length) return null;
  const parts = joinRanges(rs);
  return { f, s: parts[0][0], e: parts[parts.length - 1][1], parts, ro };
}

// ---- the page's paragraphs joined, for Word's ^p ------------------------------------------------
// Where one paragraph of the page ends and the next begins, what lies between their characters in
// the source says whether Word would see a paragraph mark there: 'soft', blank lines and nothing
// else (comments aside), which Replace takes away or writes; 'hard', a blank line, or a heading's
// end, with closing braces before it or opening commands after it (}, \textbf{, \section{,
// \noindent): found, not replaced (the groups around it would be cut); null where something else
// stands between (an \item, an environment, a formula): no mark there. heading: a heading's text
// on either side (a heading ends its paragraph without a blank line).
export function gapKind(g, heading) {
  if (g.length > 400) return null;
  const t = g.replace(/(^|[^\\])%[^\n]*/g, '$1');
  const blank = /\n[ \t]*\r?\n/.test(t);
  if (/^\s*$/.test(t)) return blank ? 'soft' : null;
  if (!/^[\s}]{0,60}(?:(?:\\[A-Za-z]{1,30}\*?|\{|\[[^\]\n]{0,40}\])\s*){0,6}$/.test(t)) return null;
  return blank || heading ? 'hard' : null;
}

// The text of the page's paragraphs in order (footnotes left out: a note's words are not its
// paragraph's), each paragraph's end PMARK where the source has a paragraph break there, else
// PARA (a stop, as within a block); for each character its block (bi) and place in that block's
// text (x), -1 for the marks; gaps: the source range of each PMARK, by its index
export function pageParaText(blocks, srcOf, max = 4000000) {
  const chars = [], bi = [], xs = [], gaps = new Map();
  let last = null, pend = false;
  const push = (c, b, x) => { chars.push(c); bi.push(b); xs.push(x); };
  for (let b = 0; b < blocks.length && chars.length < max; b++) {
    const B = blocks[b], T = blockText(B);
    for (let x = 0; x < T.text.length; x++) {
      const c = T.text[x];
      if (T.fmt[x] & FMT.footnote) continue;
      if (c === PARA) { pend = true; continue; }
      const r = c === SEP ? null : charSrc(B, T, x);
      if (pend) {
        pend = false;
        let k = null;
        if (r && last && r.f === last.f && r.s >= last.e) k = gapKind(srcOf(r.f).slice(last.e, Math.min(r.s, last.e + 401)), !!((last.fmt | T.fmt[x]) & FMT.heading));
        if (k) { gaps.set(chars.length, { f: r.f, s: last.e, e: r.s, hard: k === 'hard' }); push(PMARK, -1, -1); } else push(PARA, -1, -1);
      }
      push(c, b, x);
      if (r) last = { f: r.f, e: r.e, fmt: T.fmt[x] };
      else if (c === SEP) last = null;
    }
    pend = true;
  }
  return { text: chars.join(''), bi: Int32Array.from(bi), x: Int32Array.from(xs), gaps };
}

// A hit [i, j) of that text as source: as hitSource, and the stretch of each paragraph it takes
// (segs) and each paragraph break it takes (gaps), whether one of them is hard, how many marks
export function paraHitSource(blocks, P, i, j) {
  let f = null, ro = false, hard = false, marks = 0, seg = null;
  const rs = [], segs = [], gaps = [];
  for (let x = i; x < j; x++) {
    let c;
    if (P.text[x] === PMARK) {
      const g = P.gaps.get(x);
      if (!g) { ro = true; continue; }
      marks++; if (g.hard) hard = true;
      c = { f: g.f, s: g.s, e: g.e };
      if (f == null) f = c.f;
      if (c.f !== f) { ro = true; continue; }
      if (seg) { segs.push(seg); seg = null; }
      gaps.push([g.s, g.e]); rs.push([g.s, g.e]);
      continue;
    }
    if (P.bi[x] < 0) { ro = true; continue; }
    const B = blocks[P.bi[x]];
    c = charSrc(B, blockText(B), P.x[x]);
    if (!c) { ro = true; continue; }
    if (f == null) f = c.f;
    if (c.f !== f || c.s < 0 || c.e <= c.s) { ro = true; continue; }
    rs.push([c.s, c.e]);
    if (!seg) seg = [c.s, c.e]; else { seg[0] = Math.min(seg[0], c.s); seg[1] = Math.max(seg[1], c.e); }
  }
  if (seg) segs.push(seg);
  if (f == null || !rs.length) return null;
  const parts = joinRanges(rs);
  return { f, s: parts[0][0], e: parts[parts.length - 1][1], parts, ro, hard, marks, segs, gaps };
}

// The control words of a formula's LaTeX (\alpha, \frac): [[s, e]], in one pass; a hit inside one
// is no hit (a in \alpha), unless the query asks for a command itself (starts with \)
// (and the names a command takes as its argument: an environment's in \begin{aligned}, a key in
// \label{eq:a} and \ref{eq:a}, a colour: a letter replaced there breaks the formula or a reference,
// Grok Bot's check of R5's H3)
const NAME_ARG = /^(?:begin|end|label|ref|eqref|pageref|autoref|cref|Cref|nameref|color|textcolor|colorbox|hyperref|hyperlink|hypertarget)\*?$/;
export function controlWords(t) {
  const out = [], re = /\\([A-Za-z@]+\*?)(\s*\{[^{}\n]{0,200}\})?/g;
  let m;
  while ((m = re.exec(t))) {
    const name = m[1], whole = m[2] && NAME_ARG.test(name);
    out.push([m.index, m.index + (whole ? m[0].length : 1 + name.replace(/\*$/, '').length)]);
    if (!whole) re.lastIndex = m.index + 1 + name.replace(/\*$/, '').length;
  }
  return out;
}
export function inControlWord(cw, i, j, own) {
  let lo = 0, hi = cw.length - 1;
  while (lo <= hi) { const k = (lo + hi) >> 1; if (cw[k][1] <= i) lo = k + 1; else if (cw[k][0] >= j) hi = k - 1; else return !(own && cw[k][0] === i); }
  return false;
}
