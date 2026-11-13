// The styles of a paragraph as edits of the source: Normal, a heading, Quote and LaTeX. The ribbon
// (src/ribbon.js) applies them; test/styles.test.mjs checks them on plain strings, with no page.
//
// LaTeX is the one convention Rikuy adds to a .tex file. A LaTeX paragraph is shown on the page as
// its own source, in a box where what is typed goes into the file as it is. The file says which
// paragraphs those are with a comment line of its own just before each, `% rikuy: latex`; the
// paragraph runs from the next line to the next blank line, or to the end of the text it is in
// (\end{document}, the end of an \input file). TeX skips a comment line, so the file compiles
// anywhere to the same PDF, and the mark cannot appear by chance: no package writes it.

// (the line helpers and the blank lines a paragraph needs live with the environments in
// src/blockenv.js, which Quote's edits come from too)
import { lineStart, startsLine, eolAt, blankPads, HEADING_LINE, envOpen, envClose } from './blockenv.js';
export { lineStart, startsLine, eolAt, blankPads, HEADING_LINE };

export const LATEX_MARK = '% rikuy: latex';

// what cannot go inside a heading's braces or one list item without changing what TeX does
export const NOT_PLAIN = /\\begin\s*\{|\\end\s*\{|\\\[|\$\$|\\footnote\b|\\item\b|\n[ \t]*\n/;

// The parser's comment [s, e) runs from % to the start of the next line's text. It is the mark
// when it has a line of its own, says rikuy: latex (spaces around the words as one likes, small
// letters), and a line with something on it follows: a mark before a blank line marks nothing.
const MARK_LINE = /^%[ \t]*rikuy:[ \t]*latex[ \t]*\r?\n[ \t]*$/;
export function isLatexMark(src, s, e) {
  if (e >= src.length || src[e] === '\n' || src[e] === '\r' || !MARK_LINE.test(src.slice(s, e))) return false;
  for (let k = s - 1; k >= 0 && src[k] !== '\n'; k--) if (src[k] !== ' ' && src[k] !== '\t') return false;
  return true;
}

// After a block that the mark alone may turn into a LaTeX paragraph: the rest of its last line,
// comment or \label lines (which become part of it), then a blank line or the end of the text
// it is in. Anything else there (a heading on the next line) would be taken into the paragraph.
const AFTER_BLOCK = /^[ \t]*(?:%[^\n]*)?(?:\r?\n[ \t]*(?:%[^\n]*|\\label\s*\{[^{}\n]*\}[ \t]*(?:%[^\n]*)?))*(?:\r?\n[ \t]*(?:\r?\n|$)|\s*\\end\s*\{|\s*$)/;
// Where the mark goes to make the block [s, e) a LaTeX paragraph, or -1: the block must start
// its line, so the paragraph the mark makes is that block and nothing before it on the line.
export function latexSpot(src, s, e) {
  while (s < e && /\s/.test(src[s])) s++;
  while (e > s && /\s/.test(src[e - 1])) e--;
  if (e <= s) return -1;
  const ls = lineStart(src, s);
  if (/\S/.test(src.slice(ls, s))) return -1;
  return AFTER_BLOCK.test(src.slice(e, e + 4000)) ? ls : -1;
}

// where a % starts a comment in this line, or -1: \% is the sign, \\% a line break and then a comment
export function commentIn(line) {
  for (let i = 0; i < line.length; i++) { if (line[i] === '\\') i++; else if (line[i] === '%') return i; }
  return -1;
}

const HEADINGS = /^(sub){0,2}section$/;

// A quote or quotation environment that is [s, e) of src: where its words are and which of the
// two it is, or null. The end is looked for in the last characters alone: a pattern that starts
// with \s* is tried at every place of the text, and a stranger's paragraph of 60 000 spaces took
// a second and a half at every move of the caret (100 000, four).
export function quoteWords(src, s, e) {
  const m = /^\\begin\s*\{(quote|quotation)\}\s*/.exec(src.slice(s, Math.min(e, s + 4000)));
  if (!m) return null;
  let z = e;
  while (z > s && /\s/.test(src[z - 1])) z--;
  const tail = src.slice(Math.max(s, z - 40), z), k = tail.search(/\\end\s*\{(?:quote|quotation)\}$/);
  if (k < 0 || !tail.endsWith(m[1] + '}')) return null;
  let we = z - tail.length + k;
  const ws = s + m[0].length;
  while (we > ws && /\s/.test(src[we - 1])) we--;
  return we >= ws ? { name: m[1], ws, we } : null;
}

// One block of the page from one style to another. b says where its words are: [ws, we) are
// the words, which stay as they are; [s, ws) what opens them and [we, e) what closes them, which
// change (nothing for a paragraph, \section{ and } for a heading, the environment's lines for a
// quote, the mark's line for a LaTeX paragraph). b.v is the style now ('p', 'section',
// 'subsection', 'subsubsection', 'quote', 'latex'); b.after, for a heading, where the \label on
// its next line ends (a paragraph made of it keeps its blank line after the label); b.spot, for
// a block to become LaTeX, where the mark goes (latexSpot). The edits keep a byte for byte way
// back: the style back again restores the source the first change started from.
// Returns { edits: [{s, e, t}], p } with p the caret's place after the edits, from p before.
export function restyle(src, b, to, p) {
  if (to === b.v) return null;
  if (to === 'latex') {
    if (b.spot == null || b.spot < 0) return null;
    const t = LATEX_MARK + eolAt(src, b.spot);
    return { edits: [{ s: b.spot, e: b.spot, t }], p: p >= b.spot ? p + t.length : p };
  }
  let A, Z;
  const extra = [];
  // what Quote wrote, intact, with the paragraph kept apart from its neighbours without it
  const quoted = b.v === 'quote' && /^\\begin\{quote\}\r?\n$/.test(src.slice(b.s, b.ws)) && /^\r?\n\\end\{quote\}$/.test(src.slice(b.we, b.e));
  const apart = () => { const pad = blankPads(src, b.s, b.e); return !pad.b && !pad.a; };
  if (to === 'p') {
    // (LaTeX and Quote take away exactly what they added: the way back is the bytes of before)
    if (b.v === 'latex' || (quoted && apart())) { A = ''; Z = ''; }
    else {
      const q = b.after != null ? b.after : b.e;
      const pad = blankPads(src, b.s, q);
      A = pad.b;
      Z = '';
      if (q === b.e) Z = pad.a; else if (pad.a) extra.push({ s: q, e: q, t: pad.a });
    }
  } else if (HEADINGS.test(to)) {
    if (HEADINGS.test(b.v)) { A = src.slice(b.s, b.ws).replace(b.v, to); Z = src.slice(b.we, b.e); }
    else {
      // a comment on the last line would take the closing brace with it
      const last = src.slice(lineStart(src, b.we), b.we);
      A = '\\' + to + '{'; Z = commentIn(last) >= 0 ? '\n}' : '}';
    }
  } else if (to === 'quote') { const nl = eolAt(src, b.s); A = envOpen('quote') + nl; Z = nl + envClose('quote'); }
  else return null;
  const edits = [...extra, { s: b.we, e: b.e, t: Z }, { s: b.s, e: b.ws, t: A }].filter((x) => x.s !== x.e || x.t);
  return { edits, p: b.s + A.length + Math.min(Math.max(p, b.ws), b.we) - b.ws };
}

// Edits applied to a text, from the end backwards (as App.commit applies them)
export function applyEdits(src, edits) {
  for (const x of [...edits].sort((u, v) => v.s - u.s || v.e - u.e)) src = src.slice(0, x.s) + x.t + src.slice(x.e);
  return src;
}
