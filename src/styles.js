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

// ---- the styles there are --------------------------------------------------------------------
// Headings are LaTeX's sectioning commands: Heading 1 is \section, or \chapter in a class that has
// chapters (report, book, scrbook, memoir), and so on down to \subparagraph; Part is \part.
export const HEAD_CMDS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
const HEADINGS = /^(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)$/;
export const isHeading = (v) => HEADINGS.test(v || '');
// Heading 1, 2, ... in their order for a class with or without chapters
export const headLevels = (chapters) => HEAD_CMDS.slice(chapters ? 1 : 2);
// the name a heading command has in Word's terms here ("Heading 2" for \section in a report)
export function headName(cmd, chapters) {
  if (cmd === 'part') return 'Part';
  const k = headLevels(chapters).indexOf(cmd);
  return k >= 0 ? 'Heading ' + (k + 1) : cmd === 'chapter' ? 'Chapter' : cmd;
}
// The paragraph styles that are an environment around the words, and Word's names for them: each
// is one paragraph (or several) in \begin{…} … \end{…} on lines of their own. Code is verbatim,
// only for words that read the same there (no \, $, %, braces or the like: verbatim prints them).
export const ENV_STYLES = { quote: 'Quote', quotation: 'Quotation', verse: 'Verse', abstract: 'Abstract', verbatim: 'Code' };
// The theorem like environments the gallery offers ("LaTeX environments"): each written with its
// \newtheorem where the preamble has none (and amsthm, for \theoremstyle and proof)
export const THM_STYLES = {
  theorem: { name: 'Theorem' }, lemma: { name: 'Lemma' }, proposition: { name: 'Proposition' }, corollary: { name: 'Corollary' },
  definition: { name: 'Definition', style: 'definition' }, example: { name: 'Example', style: 'definition' }, remark: { name: 'Remark', style: 'remark' },
  proof: { name: 'Proof', amsthm: true }
};
export const isEnvStyle = (v) => Object.prototype.hasOwnProperty.call(ENV_STYLES, v) || Object.prototype.hasOwnProperty.call(THM_STYLES, v) || /^env:/.test(v || '');
// the environment a style value stands for ('env:name' is one of the document's own)
export const envOf = (v) => (/^env:/.test(v) ? v.slice(4) : v);
// what verbatim would print otherwise than the paragraph does
export const VERB_UNSAFE = /[\\{}$&#^_~%]|\n[ \t]*\n/;

// The \newtheorem line an environment of THM_STYLES needs here, with the \theoremstyle before it
// where it has one, or '' where the preamble (or a file it reads) defines it already.
export function thmLine(v, defined) {
  const t = THM_STYLES[v];
  if (!t || v === 'proof' || defined) return '';
  return (t.style ? '\\theoremstyle{' + t.style + '}\n' : '') + '\\newtheorem{' + v + '}{' + t.name + '}';
}

// Heading numbers: \section* to \section and back (the star right after the name)
export function starEdits(src, b) {
  const m = /^\\([A-Za-z]+)(\*?)/.exec(src.slice(b.s, b.s + 40));
  if (!m || !isHeading(m[1])) return null;
  const at = b.s + 1 + m[1].length;
  return m[2] ? [{ s: at, e: at + 1, t: '' }] : [{ s: at, e: at, t: '*' }];
}

// A quote or quotation environment that is [s, e) of src: where its words are and which of the
// two it is, or null. The end is looked for in the last characters alone: a pattern that starts
// with \s* is tried at every place of the text, and a stranger's paragraph of 60 000 spaces took
// a second and a half at every move of the caret (100 000, four). names: the environments to
// take (the paragraph styles of ENV_STYLES and THM_STYLES, and the document's own).
const QUOTES = new Set(['quote', 'quotation']);
export function quoteWords(src, s, e, names = QUOTES) {
  const head = src.slice(s, Math.min(e, s + 4000)), m = /^\\begin\s*\{([A-Za-z]+\*?)\}/.exec(head);
  if (!m || !names.has(m[1])) return null;
  let i = m[0].length;
  // (a theorem's [title]; quote, quotation and verse take none: "[t]" after them is their text)
  if (head[i] === '[' && !QUOTES.has(m[1]) && m[1] !== 'verse') { const z = head.indexOf(']', i); if (z < 0 || z - i > 200 || head.slice(i, z).includes('\n')) return null; i = z + 1; }
  while (i < head.length && /\s/.test(head[i])) i++;
  let z = e;
  while (z > s && /\s/.test(src[z - 1])) z--;
  const tail = src.slice(Math.max(s, z - 60), z), k = tail.search(/\\end\s*\{[A-Za-z]+\*?\}$/);
  if (k < 0 || !tail.endsWith('{' + m[1] + '}')) return null;
  let we = z - tail.length + k;
  const ws = s + i;
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
  // what an environment style wrote, intact, with the paragraph kept apart from its neighbours without it
  const env = isEnvStyle(b.v) ? envOf(b.v) : null;
  const quoted = !!env && new RegExp('^\\\\begin\\{' + env.replace('*', '\\*') + '\\}\\r?\\n$').test(src.slice(b.s, b.ws)) && new RegExp('^\\r?\\n\\\\end\\{' + env.replace('*', '\\*') + '\\}$').test(src.slice(b.we, b.e));
  const apart = () => { const pad = blankPads(src, b.s, b.e); return !pad.b && !pad.a; };
  if (to === 'p') {
    // (LaTeX and an environment take away exactly what they added: the way back is the bytes of before)
    if (b.v === 'latex' || (quoted && apart())) { A = ''; Z = ''; }
    else {
      const q = b.after != null ? b.after : b.e;
      const pad = blankPads(src, b.s, q);
      A = pad.b;
      Z = '';
      if (q === b.e) Z = pad.a; else if (pad.a) extra.push({ s: q, e: q, t: pad.a });
    }
  } else if (isHeading(to)) {
    if (isHeading(b.v)) { A = src.slice(b.s, b.ws).replace(b.v, to); Z = src.slice(b.we, b.e); }
    else {
      // a comment on the last line would take the closing brace with it
      const last = src.slice(lineStart(src, b.we), b.we);
      A = '\\' + to + '{'; Z = commentIn(last) >= 0 ? '\n}' : '}';
    }
  } else if (isEnvStyle(to)) {
    const name = envOf(to);
    // one environment to another: its name alone changes, at both ends
    if (env) { A = src.slice(b.s, b.ws).replace('{' + env + '}', '{' + name + '}'); Z = src.slice(b.we, b.e).replace(new RegExp('\\{' + env.replace('*', '\\*') + '\\}$'), '{' + name + '}'); }
    else { const nl = eolAt(src, b.s); A = envOpen(name) + nl; Z = nl + envClose(name); }
  } else return null;
  const edits = [...extra, { s: b.we, e: b.e, t: Z }, { s: b.s, e: b.ws, t: A }].filter((x) => x.s !== x.e || x.t);
  return { edits, p: b.s + A.length + Math.min(Math.max(p, b.ws), b.we) - b.ws };
}

// Edits applied to a text, from the end backwards (as App.commit applies them)
export function applyEdits(src, edits) {
  for (const x of [...edits].sort((u, v) => v.s - u.s || v.e - u.e)) src = src.slice(0, x.s) + x.t + src.slice(x.e);
  return src;
}

// ---- the preamble's lines for headings -----------------------------------------------------------
// The edits that turn the document's heading numbers off (\setcounter{secnumdepth}{0}, -1 in a
// class with chapters, whose \chapter is level 0) or on again: a line of that kind already in the
// preamble changes its number; one Rikuy wrote alone on its line goes again whole, so off and on
// give the bytes of before. null where the text has no preamble.
const SECNUM = /\\setcounter\s*\{\s*secnumdepth\s*\}\s*\{\s*(-?\d{1,3})\s*\}/g;
export function numberingEdits(src, off, chapters) {
  const end = preambleEndOf(src);
  if (end < 0) return null;
  const pre = stripCommentsOf(src.slice(0, end));
  let m, last = null;
  SECNUM.lastIndex = 0;
  for (let k = 0; (m = SECNUM.exec(pre)) && k < 200; k++) last = { s: m.index, e: m.index + m[0].length, n: +m[1] };
  const want = off ? (chapters ? -1 : 0) : chapters ? 2 : 3;
  if (last) {
    if (off ? last.n <= want : last.n >= (chapters ? 0 : 1)) return [];
    // the line as Rikuy writes it, alone on its line: back on, it goes
    const ls = src.lastIndexOf('\n', last.s - 1) + 1, le = src.indexOf('\n', last.e);
    if (!off && src.slice(ls, last.s).trim() === '' && src.slice(last.e, le < 0 ? src.length : le).trim() === '' && last.n <= 0) return [{ s: ls, e: le < 0 ? src.length : le + 1, t: '' }];
    const a = src.indexOf('{', src.indexOf('}', last.s) + 1);
    return [{ s: a + 1, e: src.indexOf('}', a), t: String(want) }];
  }
  if (!off) return [];
  const at = src.lastIndexOf('\n', end - 1) + 1, lead = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '', s = lead ? end : at;
  return [{ s, e: s, t: lead + '\\setcounter{secnumdepth}{' + want + '}\n' }];
}
function preambleEndOf(src) {
  const m = /\\begin\s*\{document\}/.exec(stripCommentsOf(src.slice(0, 200000)));
  return m ? m.index : -1;
}
// comments made spaces, offsets kept (as src/preamble.js's stripComments)
function stripCommentsOf(t) {
  let out = '', i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '\\') { out += t.slice(i, i + 2); i += 2; continue; }
    if (c === '%') { const j = t.indexOf('\n', i), e = j < 0 ? t.length : j; out += ' '.repeat(e - i); i = e; continue; }
    out += c; i++;
  }
  return out;
}

// ---- the document's own styles --------------------------------------------------------------------
// Formatting a style may hold: the inline commands around its words (\textbf{#1}) and the
// declarations at an environment's start (\bfseries, \color{accent}, \centering)
export const CHAR_WRAPS = ['textbf', 'textit', 'emph', 'textsl', 'textsc', 'textsf', 'texttt', 'textrm', 'textup', 'textmd', 'underline', 'uline', 'MakeUppercase', 'MakeLowercase', 'textnormal'];
export const DECLS = ['bfseries', 'mdseries', 'itshape', 'slshape', 'upshape', 'scshape', 'sffamily', 'ttfamily', 'rmfamily', 'normalfont', 'em',
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'centering', 'raggedright', 'raggedleft', 'par', 'noindent', 'itshape'];
// A \newcommand body that only formats its one argument: \textbf{\textcolor{accent}{#1}},
// {\bfseries #1}, \emph{#1}. Read token by token (no pattern that can backtrack), 300 characters at most.
export function charStyleBody(body) {
  if (typeof body !== 'string' || body.length > 300 || (body.match(/#1/g) || []).length !== 1 || /#[2-9]/.test(body)) return false;
  let t = body.trim();
  for (let k = 0; k < 12 && t !== '#1'; k++) {
    let m;
    if ((m = /^\\([A-Za-z]+)\s*\{/.exec(t)) && CHAR_WRAPS.includes(m[1]) && t.endsWith('}')) { t = t.slice(m[0].length, -1).trim(); continue; }
    if ((m = /^\\(textcolor|colorbox)\s*\{([A-Za-z][A-Za-z0-9!.]{0,40})\}\s*\{/.exec(t)) && t.endsWith('}')) { t = t.slice(m[0].length, -1).trim(); continue; }
    if (t[0] === '{' && t.endsWith('}')) {
      let u = t.slice(1, -1).trim(), n = 0;
      for (; n < 8; n++) { const d = /^\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(u), col = /^\\color\s*\{[A-Za-z][A-Za-z0-9!.]{0,40}\}\s*/.exec(u); if (d && DECLS.includes(d[1])) u = u.slice(d[0].length); else if (col) u = u.slice(col[0].length); else break; }
      if (!n) return false;
      t = u.trim();
      continue;
    }
    return false;
  }
  return t === '#1';
}
// An environment's start of declarations alone (\par\bfseries\color{accent}): the paragraph style
// an environment of the document's own is
export function formatOnlyBegin(begin) {
  if (typeof begin !== 'string' || begin.length > 300) return false;
  let u = begin.trim(), n = 0;
  for (; u && n < 20; n++) {
    const d = /^\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(u), col = /^\\color\s*\{[A-Za-z][A-Za-z0-9!.]{0,40}\}\s*/.exec(u);
    if (col) u = u.slice(col[0].length);
    else if (d && DECLS.includes(d[1])) u = u.slice(d[0].length);
    else return false;
  }
  return !u && n > 0;
}

// A style's formatting as fields ({ bf, it, sc, sf, tt, ul, upper, size, color, align }), read
// from a character style's body or a paragraph style's start, and written back as LaTeX writes it
// by hand: \textcolor{accent}{\textbf{\textit{#1}}} and \par\bfseries\color{accent}
const WRAP_FIELD = { textbf: 'bf', textit: 'it', emph: 'it', textsl: 'it', textsc: 'sc', textsf: 'sf', texttt: 'tt', underline: 'ul', uline: 'ul', MakeUppercase: 'upper' };
const DECL_FIELD = { bfseries: 'bf', itshape: 'it', slshape: 'it', em: 'it', scshape: 'sc', sffamily: 'sf', ttfamily: 'tt' };
const SIZE_NAMES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'];
export function readCharBody(body) {
  const F = {};
  if (!charStyleBody(body)) return null;
  let t = body.trim();
  for (let k = 0; k < 12 && t !== '#1'; k++) {
    let m;
    if ((m = /^\\(textcolor)\s*\{([A-Za-z][A-Za-z0-9!.]{0,40})\}\s*\{/.exec(t))) { F.color = m[2]; t = t.slice(m[0].length, -1).trim(); continue; }
    if ((m = /^\\([A-Za-z]+)\s*\{/.exec(t)) && t.endsWith('}')) { if (WRAP_FIELD[m[1]]) F[WRAP_FIELD[m[1]]] = true; t = t.slice(m[0].length, -1).trim(); continue; }
    if (t[0] === '{') {
      let u = t.slice(1, -1).trim();
      for (let n = 0; n < 8; n++) {
        const d = /^\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(u), col = /^\\color\s*\{([A-Za-z][A-Za-z0-9!.]{0,40})\}\s*/.exec(u);
        if (col) { F.color = col[1]; u = u.slice(col[0].length); } else if (d && DECL_FIELD[d[1]]) { F[DECL_FIELD[d[1]]] = true; u = u.slice(d[0].length); } else if (d && SIZE_NAMES.includes(d[1])) { F.size = d[1]; u = u.slice(d[0].length); } else if (d) u = u.slice(d[0].length); else break;
      }
      t = u.trim();
    }
  }
  return F;
}
export function charBodyOf(F) {
  let b = '#1';
  if (F.upper) b = '\\MakeUppercase{' + b + '}';
  if (F.ul) b = '\\uline{' + b + '}';
  if (F.tt) b = '\\texttt{' + b + '}'; else if (F.sf) b = '\\textsf{' + b + '}';
  if (F.sc) b = '\\textsc{' + b + '}';
  if (F.it) b = '\\textit{' + b + '}';
  if (F.bf) b = '\\textbf{' + b + '}';
  if (F.size && F.size !== 'normalsize' && SIZE_NAMES.includes(F.size)) b = '{\\' + F.size + ' ' + b + '}';
  if (F.color) b = '\\textcolor{' + F.color + '}{' + b + '}';
  return b;
}
export function readEnvBegin(begin) {
  if (!formatOnlyBegin(begin)) return null;
  const F = {};
  let u = begin.trim();
  for (let n = 0; u && n < 20; n++) {
    const d = /^\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(u), col = /^\\color\s*\{([A-Za-z][A-Za-z0-9!.]{0,40})\}\s*/.exec(u);
    if (col) { F.color = col[1]; u = u.slice(col[0].length); continue; }
    if (!d) break;
    const w = d[1];
    if (DECL_FIELD[w]) F[DECL_FIELD[w]] = true;
    else if (SIZE_NAMES.includes(w)) F.size = w;
    else if (w === 'centering') F.align = 'center';
    else if (w === 'raggedleft') F.align = 'right';
    else if (w === 'raggedright') F.align = 'left';
    u = u.slice(d[0].length);
  }
  return F;
}
export function envBeginOf(F) {
  let b = '\\par';
  if (F.size && F.size !== 'normalsize' && SIZE_NAMES.includes(F.size)) b += '\\' + F.size;
  if (F.bf) b += '\\bfseries';
  if (F.it) b += '\\itshape';
  if (F.sc) b += '\\scshape';
  if (F.tt) b += '\\ttfamily'; else if (F.sf) b += '\\sffamily';
  if (F.color) b += '\\color{' + F.color + '}';
  if (F.align === 'center') b += '\\centering'; else if (F.align === 'right') b += '\\raggedleft'; else if (F.align === 'left') b += '\\raggedright';
  return b;
}
// The new definition's line of a style Rikuy makes
export const charDef = (name, F) => '\\newcommand{\\' + name + '}[1]{' + charBodyOf(F) + '}';
export const envDef = (name, F) => '\\newenvironment{' + name + '}{' + envBeginOf(F) + '}{\\par}';
// Where the main file's preamble defines it: [s, e) of the body of \newcommand{\name}[1]{…}, or of
// the start of \newenvironment{name}{…}{…}, or null (no definition there, or one written otherwise)
export function defRange(src, name, kind) {
  const end = preambleEndOf(src);
  if (end < 0 || !/^[A-Za-z]{1,40}$/.test(name)) return null;
  const pre = stripCommentsOf(src.slice(0, end));
  const re = kind === 'env' ? /\\(?:re)?newenvironment\s*\{\s*([A-Za-z]+)\s*\}\s*/g : /\\(?:re)?newcommand\*?\s*(?:\{\s*\\([A-Za-z]+)\s*\}|\\([A-Za-z]+))\s*/g;
  let m;
  for (let k = 0; (m = re.exec(pre)) && k < 2000; k++) {
    if ((m[1] || m[2]) !== name) continue;
    let i = m.index + m[0].length;
    if (kind !== 'env') { const o = /^\[\s*1\s*\]\s*/.exec(pre.slice(i, i + 20)); if (!o) return null; i += o[0].length; }
    if (pre[i] !== '{') return null;
    let d = 0, j = i;
    for (; j < Math.min(pre.length, i + 2000); j++) { const c = pre[j]; if (c === '\\') { j++; continue; } if (c === '{') d++; else if (c === '}' && --d === 0) break; }
    if (d !== 0 || j >= pre.length) return null;
    return { s: i + 1, e: j };
  }
  return null;
}
