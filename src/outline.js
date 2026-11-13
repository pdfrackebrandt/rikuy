// The outline as edits of the source: a heading promoted or demoted with every heading under it
// (\subsection to \section), a section moved before or after the one beside it (its heading to
// the next heading of its level or higher), a paragraph moved past the one beside it, a section
// dragged to another place, a new heading before or after one. Each is the smallest edit that
// does it, on strings, so it is tested without a page (test/find.test.mjs). A heading written by
// hand keeps everything but its command's name: \section*{...} stays starred, \section[short]{...}
// keeps its short title.

export const LEVEL = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
export const NAME = Object.fromEntries(Object.entries(LEVEL).map(([n, l]) => [l, n]));
export const MAX_LEVEL = 5;

// The heading command written at p: { name, level, star, s, e } (e: the end of its name and star),
// or null when the source there is no heading command (a macro made it)
export function headingAt(src, p) {
  if (p == null || p < 0) return null;
  const m = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(?![A-Za-z@])(\s*\*)?/.exec(src.slice(p, p + 32));
  if (!m) return null;
  return { name: m[1], level: LEVEL[m[1]], star: !!m[2], s: p, e: p + 1 + m[1].length };
}

// Where a section's text stops before the next heading: the back matter and the bibliography,
// which a section moved must not take with it (a line that starts with one of these)
const STOPS = ['\\appendix', '\\backmatter', '\\bibliography', '\\printbibliography', '\\begin{thebibliography}', '\\printindex', '\\end{document}'];
function stopIn(src, a, b) {
  let best = b;
  for (const w of STOPS) {
    let k = src.indexOf(w, a);
    while (k >= 0 && k < best) {
      // (at a line's start, not commented out)
      let q = k;
      while (q > 0 && (src[q - 1] === ' ' || src[q - 1] === '\t')) q--;
      if (q === 0 || src[q - 1] === '\n') { best = k; break; }
      k = src.indexOf(w, k + w.length);
    }
  }
  return best;
}
const trimEnd = (src, a, b) => { while (b > a && /\s/.test(src[b - 1])) b--; return b; };
const trimStart = (src, a, b) => { while (a < b && /\s/.test(src[a])) a++; return a; };

// The section of heading k of heads ([{ f, s, level }] in the document's order): [s, e) in its
// file, its end the next heading of its level or higher in the same file (or the end of the
// document's body there, limit), with the space before that left out. null when a heading under
// it lives in another file (its text is not one piece of one file).
export function sectionRange(src, heads, k, limit = src.length) {
  const h = heads[k];
  let e = limit;
  for (let j = k + 1; j < heads.length; j++) {
    const x = heads[j];
    if (x.level <= h.level) { if (x.f === h.f) e = Math.min(e, x.s); break; }
    if (x.f !== h.f) return null;
  }
  e = stopIn(src, h.s + 1, Math.min(e, limit));
  return { f: h.f, s: h.s, e: trimEnd(src, h.s, e) };
}

// The headings under heading k (deeper, until one of its level or higher): their indexes
export function under(heads, k) {
  const out = [];
  for (let j = k + 1; j < heads.length && heads[j].level > heads[k].level; j++) out.push(j);
  return out;
}

// Promote (delta -1) or demote (+1) heading k and every heading under it: each command's name
// changed, nothing else. null where one would leave the levels there are (min: \chapter in a
// book or report, \section in an article; max: \subparagraph) or is no command of its own.
export function promoteEdits(srcOf, heads, k, delta, min = 1) {
  const edits = [];
  for (const j of [k, ...under(heads, k)]) {
    const x = heads[j], at = headingAt(srcOf(x.f), x.s);
    if (!at) return null;
    const to = at.level + delta;
    if (to < min || to > MAX_LEVEL) return null;
    edits.push({ f: x.f, s: at.s + 1, e: at.e, t: NAME[to] });
  }
  return edits;
}

// The line break a file writes: \r\n where its first line break is one (a file from Windows
// keeps its own; a blank line is two of them)
export const eolOf = (src) => { const k = src.indexOf('\n'); return k > 0 && src[k - 1] === '\r' ? '\r\n' : '\n'; };
const BLANK = /\n[ \t]*\r?\n/;
const HEAD = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(?![A-Za-z@])/;
// a line a paragraph may follow with one line break and not run into: nothing, a heading, a
// \begin or \end, a comment (a \begin{...} at its end read in its last 200 characters: a line of
// 40 000 "\begin{a" took 10 s per test)
const opens = (line) => { const t = line.trim(); return !t || HEAD.test(t) || /^\\(begin|end)\s*\{/.test(t) || /\\begin\s*\{[^{}]{0,80}\}\s*$/.test(t.slice(-200)) || t[0] === '%'; };

// Two pieces of one file next to each other, [a.s, a.e) then [b.s, b.e) with only space between,
// swapped: one edit; the space between stays where it was. null if anything but space lies
// between them. A paragraph moved next to text it met before over a heading's single line break
// would run into it: that line break, just outside the two, becomes a blank line.
// (keep: two items of a list, whose line breaks are theirs)
export function swapEdit(src, f, a, b, keep) {
  const as = trimStart(src, a.s, a.e), ae = trimEnd(src, as, a.e), bs = trimStart(src, b.s, b.e), be = trimEnd(src, bs, b.e);
  if (ae <= as || be <= bs || ae > bs) return null;
  const gap = src.slice(ae, bs);
  if (/\S/.test(gap)) return null;
  const nl = eolOf(src), blank = nl + nl;
  // (a single line break between them is a heading's own line; a blank line keeps them apart
  // as paragraphs once swapped)
  const sp = keep || BLANK.test(gap) ? gap : blank;
  const A = src.slice(as, ae), B = src.slice(bs, be);
  let s = as, e = be, pre = '', post = '';
  if (!keep) {
    // before: B comes first now
    let p = as;
    while (p > 0 && /[ \t\r\n]/.test(src[p - 1])) p--;
    const ws = src.slice(p, as), line = src.slice(src.lastIndexOf('\n', p - 1) + 1, p);
    if (p > 0 && /\n/.test(ws) && !BLANK.test(ws) && !HEAD.test(B) && !opens(line)) { s = p; pre = blank; }
    // after: A comes last now
    let q = be;
    while (q < src.length && /[ \t\r\n]/.test(src[q])) q++;
    const ws2 = src.slice(be, q), next = src.slice(q, src.indexOf('\n', q) < 0 ? src.length : src.indexOf('\n', q));
    if (q < src.length && /\n/.test(ws2) && !BLANK.test(ws2) && !HEAD.test(A) && !opens(next)) { e = q; post = blank; }
  }
  return { f, s, e, t: pre + B + sp + A + post };
}

// A piece [s, e) of a file moved to t (outside it): two edits, one step. The piece leaves with
// the space after it, and arrives as a paragraph of its own: before t (the start of a heading or
// a paragraph), or with after, right after t (the end of a section or a paragraph), a blank
// line on its other side; at the end of a text, a blank line before it.
export function moveEdits(src, f, s, e, t, after) {
  s = trimStart(src, s, e); e = trimEnd(src, s, e);
  if (e <= s || (t > s && t < e)) return null;
  const nl = eolOf(src), blank = nl + nl;
  let e2 = e;
  while (e2 < src.length && /\s/.test(src[e2])) e2++;
  // (the last piece before \end{document}: the space before it goes instead, the line break
  // before \end{document} stays)
  let s2 = s;
  const last = e2 >= src.length || src.startsWith('\\end{document}', e2);
  if (last) { e2 = e; while (s2 > 0 && /\s/.test(src[s2 - 1])) s2--; }
  const atEnd = !after && (t >= src.length || src.startsWith('\\end{document}', t));
  if ((t >= s2 && t <= e2) || (last && atEnd) || (after && t <= s && !/\S/.test(src.slice(t, s)))) return null;
  const piece = src.slice(s, e);
  let ins = after ? blank + piece : piece + blank;
  if (atEnd) {
    const before = src.slice(Math.max(0, t - 2 * nl.length), t);
    ins = (before.endsWith(blank) ? '' : before.endsWith(nl) ? nl : blank) + piece + nl;
  }
  return [{ f, s: s2, e: e2, t: '' }, { f, s: t, e: t, t: ins }];
}

// A new heading of name before position at (a heading's own start), or after a section's end e:
// { edit, caret } with the caret between its braces
export function newHeading(name, where, p, nl = '\n') {
  const cmd = '\\' + name + '{}';
  if (where === 'before') return { t: cmd + nl + nl, s: p, caret: p + cmd.length - 1 };
  return { t: nl + nl + cmd, s: p, caret: p + 2 * nl.length + cmd.length - 1 };
}
