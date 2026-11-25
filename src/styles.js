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
import { commentsBlanked, preambleEnd } from './scan.js';
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
export function thmLine(v, defined, t = THM_STYLES[v]) {
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
  // (a proof's \qedhere, which puts its square in a display, is an error out of a proof: it goes
  // with the proof; it went into \section{... \qedhere})
  const qed = env === 'proof' && !(isEnvStyle(to) && envOf(to) === 'proof') ? [...src.slice(b.ws, b.we).matchAll(/[ \t]*\\qedhere(?![A-Za-z])/g)].map((m) => ({ s: b.ws + m.index, e: b.ws + m.index + m[0].length, t: '' })) : [];
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
      A = '\\' + to + '{'; Z = commentIn(last) >= 0 ? eolAt(src, b.we) + '}' : '}';
    }
  } else if (isEnvStyle(to)) {
    const name = envOf(to);
    // one environment to another: its name alone changes, at both ends
    if (env) { A = src.slice(b.s, b.ws).replace('{' + env + '}', '{' + name + '}'); Z = src.slice(b.we, b.e).replace(new RegExp('\\{' + env.replace('*', '\\*') + '\\}$'), '{' + name + '}'); }
    else { const nl = eolAt(src, b.s); A = envOpen(name) + nl; Z = nl + envClose(name); }
  } else return null;
  const edits = [...extra, ...qed, { s: b.we, e: b.e, t: Z }, { s: b.s, e: b.ws, t: A }].filter((x) => x.s !== x.e || x.t);
  const at = Math.min(Math.max(p, b.ws), b.we);
  return { edits, p: b.s + A.length + at - b.ws - qed.reduce((n, x) => n + (x.e <= at ? x.e - x.s : 0), 0) };
}

// One paragraph of an environment of several (a quote, a quotation, a verse, an abstract) made a
// heading: Word gives the style to that paragraph alone, so the environment ends before it and
// starts again after it, its other paragraphs kept where they are. An abstract is not begun
// again (TeX would title it "Abstract" a second time): the paragraphs after the heading leave it.
// On its first paragraph there is no first title: the abstract begins after the heading, as a
// quote does, or the heading would take the whole abstract, title and all, away (review V1).
// A theorem or a proof is never split (src/cmd/styles.js SPLITS): its second part would print
// its title, and a theorem's a new number. b: the environment's block as styleOfBlock reads it
// ({ v, s, ws, we, e }: the whole of it and its words), p the caret, to the heading's command.
// The paragraph is the one the caret is in, of plain words; the paragraphs before it keep the
// \begin, those after it get a bare one. Returns { edits, p } or { why }.
export function splitEnvEdits(src, b, to, p) {
  const name = envOf(b.v), words = src.slice(b.ws, b.we);
  // the paragraphs: [s, e) of each one's words, apart by blank lines
  const paras = [];
  const gap = /[ \t]*\r?\n[ \t]*(?:\r?\n[ \t]*)+/g;
  let at = 0;
  for (let m; (m = gap.exec(words));) { paras.push([b.ws + at, b.ws + m.index]); at = m.index + m[0].length; }
  paras.push([b.ws + at, b.ws + words.length]);
  if (paras.length < 2) return { why: 'one paragraph' };
  let k = paras.findIndex(([s, e]) => p >= s && p <= e);
  if (k < 0) k = paras.findIndex(([s]) => p < s);
  if (k < 0) k = paras.length - 1;
  const [ps, pe] = paras[k], text = src.slice(ps, pe);
  // (Normal: the paragraph leaves the environment as it is, whatever it holds; a heading holds words only)
  const normal = to === 'p';
  if (!text.trim() || (!normal && (NOT_PLAIN.test(text) || text[0] === '%' || /(^|[^\\])%/.test(text)))) return { why: 'This paragraph holds more than words: a heading cannot hold it.' };
  // (an abstract begun again after a paragraph in its middle would print its title twice)
  if (normal && name === 'abstract' && k > 0 && k < paras.length - 1) return { why: 'abstract' };
  const eol = eolAt(src, b.s);
  // before it: the environment ends where its last paragraph ends, or (it was the first) its
  // \begin line goes
  const head = k > 0 ? { s: paras[k - 1][1], e: ps, t: eol + '\\end{' + name + '}' + eol + eol } : { s: b.s, e: ps, t: '' };
  const edits = normal ? [head] : [head, { s: ps, e: ps, t: '\\' + to + '{' }, { s: pe, e: pe, t: '}' }];
  if (k === paras.length - 1) edits.push({ s: pe, e: b.e, t: '' });
  else if (name === 'abstract' && k > 0) edits.push({ s: pe, e: paras[k + 1][0], t: eol + eol }, { s: b.we, e: b.e, t: '' });
  else edits.push({ s: pe, e: paras[k + 1][0], t: eol + eol + '\\begin{' + name + '}' + eol });
  // the caret where it was in the words, which moved by what went before them
  const shift = head.t.length - (head.e - head.s) + (normal ? 0 : to.length + 2);
  return { edits, p: Math.min(Math.max(p, ps), pe) + shift };
}

// Edits applied to a text, from the end backwards (as App.commit applies them)
export function applyEdits(src, edits) {
  for (const x of [...edits].sort((u, v) => v.s - u.s || v.e - u.e)) src = src.slice(0, x.s) + x.t + src.slice(x.e);
  return src;
}

// ---- the preamble's lines for headings -----------------------------------------------------------
// The edits that turn the document's heading numbers off or on again. Off writes a line of
// Rikuy's own at the preamble's end (\setcounter{secnumdepth}{0}, -1 in a class with chapters,
// whose \chapter is level 0; memoir's \setsecnumdepth{none} and \maxsecnumdepth{none}, since its
// \mainmatter sets the depth again), after any the author wrote, which stay: the last one counts.
// On takes the last such line away where it turns numbers off and stands alone on its line (so
// the author's own \setcounter{secnumdepth}{2} before it counts again); with none to take away
// (the line is in another file) it writes the class's depth at the preamble's end.
// null where the text has no preamble; [] where nothing changes.
const SECNUM = /\\(?:setcounter\s*\{\s*secnumdepth\s*\}\s*\{\s*(-?\d{1,3})\s*\}|(setsecnumdepth|maxsecnumdepth)\s*\{\s*([a-z]{1,20})\s*\})/g;
const DEPTH = { book: -2, part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5, none: -10, all: 10 };
export function numberingEdits(src, off, chapters, memoir) {
  const end = preambleEndOf(src);
  if (end < 0) return null;
  const pre = stripCommentsOf(src.slice(0, end)), nl = eolAt(src, 0), min = chapters ? 0 : 1;
  const lines = [];
  let m;
  SECNUM.lastIndex = 0;
  for (let k = 0; (m = SECNUM.exec(pre)) && k < 200; k++) lines.push({ s: m.index, e: m.index + m[0].length, n: m[1] != null ? +m[1] : DEPTH[m[3]] ?? 3, max: m[2] === 'maxsecnumdepth' });
  const at = src.lastIndexOf('\n', end - 1) + 1, lead = at < end && /\S/.test(src.slice(at, end)) ? nl : '', s = lead ? end : at;
  const put = (t) => [{ s, e: s, t: lead + t + nl }];
  if (off) return put(memoir ? '\\setsecnumdepth{none}\\maxsecnumdepth{none}' : '\\setcounter{secnumdepth}{' + (chapters ? -1 : 0) + '}');
  // the last line, with any on the same line before it (memoir's pair), where it turns numbers off
  const last = lines[lines.length - 1];
  if (last && last.n < min) {
    const ls = src.lastIndexOf('\n', last.s - 1) + 1, le = src.indexOf('\n', last.e), lineEnd = le < 0 ? src.length : le;
    const mine = lines.filter((x) => x.s >= ls && x.e <= lineEnd);
    const rest = src.slice(ls, lineEnd);
    let left = rest;
    for (const x of [...mine].reverse()) left = left.slice(0, x.s - ls) + left.slice(x.e - ls);
    if (!left.trim() && mine.every((x) => x.n < min)) return [{ s: ls, e: le < 0 ? src.length : le + 1, t: '' }];
  }
  return put(memoir ? '\\setsecnumdepth{subsection}\\maxsecnumdepth{subsection}' : '\\setcounter{secnumdepth}{' + (chapters ? 2 : 3) + '}');
}
const preambleEndOf = preambleEnd;
// comments made spaces, offsets kept, all of t (src/scan.js: once per text)
const stripCommentsOf = (t) => commentsBlanked(t, t.length);

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

// ---- what a preamble defines --------------------------------------------------------------------
// The theorem like environments a preamble makes otherwise than by \newtheorem: thmtools'
// \declaretheorem[…]{name} and \declaretheorem{name}[…] (a comma list too), tcolorbox's
// \newtcbtheorem[…]{name}, mdframed's \newmdtheoremenv[…]{name}, llncs' \spnewtheorem{name}, and
// tcolorbox's and mdframed's boxes (\newtcolorbox{name}, \newmdenv[…]{name}). Bounded scans.
const THM_MAKERS = /\\(declaretheorem|newtcbtheorem|newmdtheoremenv|spnewtheorem|newtcolorbox|DeclareTColorBox|newmdenv|newtheorem|newenvironment|renewenvironment|NewDocumentEnvironment|newframedtheorem|newshadedtheorem)\*?(?![A-Za-z@])\s*/g;
// envs: also \newenvironment and the like (what defines a name, for a check before writing one)
export function thmDefsIn(text, envs) {
  const end = preambleEndOf(text);
  const pre = stripCommentsOf(String(text).slice(0, end < 0 ? Math.min(String(text).length, 200000) : end));
  const out = new Set();
  let m;
  THM_MAKERS.lastIndex = 0;
  for (let k = 0; (m = THM_MAKERS.exec(pre)) && k < 2000; k++) {
    let i = m.index + m[0].length;
    // an [option] before the name ([init options] of tcolorbox, mdframed's, thmtools' old form)
    if (pre[i] === '[') { const z = pre.indexOf(']', i); if (z < 0 || z - i > 2000) continue; i = z + 1; while (/\s/.test(pre[i] || '')) i++; }
    if (pre[i] !== '{') continue;
    if (!envs && /environment$/i.test(m[1])) continue;
    const z = pre.indexOf('}', i);
    if (z < 0 || z - i > 300) continue;
    for (const nm of pre.slice(i + 1, z).split(',')) { const n = nm.trim(); if (/^[A-Za-z*]{1,40}$/.test(n)) out.add(n); }
    if (out.size > 300) break;
  }
  return out;
}

// ---- a style of the document's own, changed where the dialog changed it --------------------------
// A character style's body as layers around #1, each { open, close, field, arg }: \textbf{…} is
// one, {\bfseries #1} a group and a declaration. A field the dialog did not change leaves its
// layers as they are written (\emph stays \emph, \colorbox and \textup stay), so OK with nothing
// changed writes the body back byte for byte.
const LAYER_FIELD = { textbf: 'bf', bfseries: 'bf', bf: 'bf', textit: 'it', emph: 'it', textsl: 'it', itshape: 'it', slshape: 'it', em: 'it', it: 'it', textsc: 'sc', scshape: 'sc',
  textsf: 'sf', sffamily: 'sf', texttt: 'tt', ttfamily: 'tt', uline: 'ul', underline: 'ul', MakeUppercase: 'upper', textcolor: 'color', color: 'color' };
export function charLayers(body) {
  if (!charStyleBody(body)) return null;
  const L = [];
  let t = body, a = 0, z = body.length;
  for (let k = 0; k < 24; k++) {
    const sl = t.slice(a, z), lead = sl.length - sl.trimStart().length, tail = sl.length - sl.trimEnd().length;
    if (sl.trim() === '#1') { L.inner = [a + lead, z - tail]; break; }
    const u = t.slice(a + lead, z - tail);
    let m;
    if ((m = /^\\(textcolor|colorbox)\s*\{([^{}]{0,40})\}\s*\{/.exec(u))) { L.push({ open: t.slice(a, a + lead + m[0].length), close: t.slice(z - tail - 1, z), field: m[1] === 'textcolor' ? 'color' : null, arg: m[2] }); a += lead + m[0].length; z -= tail + 1; continue; }
    if ((m = /^\\([A-Za-z]+)\s*\{/.exec(u))) { L.push({ open: t.slice(a, a + lead + m[0].length), close: t.slice(z - tail - 1, z), field: LAYER_FIELD[m[1]] || null }); a += lead + m[0].length; z -= tail + 1; continue; }
    if (u[0] === '{') {
      L.push({ open: t.slice(a, a + lead + 1), close: t.slice(z - tail - 1, z), field: null, group: true });
      a += lead + 1; z -= tail + 1;
      for (let n = 0; n < 8; n++) {
        const v = t.slice(a, z), d = /^\s*\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(v), col = /^\s*\\color\s*\{([^{}]{0,40})\}\s*/.exec(v);
        if (col) { L.push({ open: col[0], close: '', field: 'color', arg: col[1], decl: true }); a += col[0].length; }
        else if (d && v.trim() !== '#1') { L.push({ open: d[0], close: '', field: SIZE_NAMES.includes(d[1]) ? 'size' : LAYER_FIELD[d[1]] || null, arg: d[1], decl: true }); a += d[0].length; }
        else break;
      }
      continue;
    }
    return null;
  }
  return L.inner ? L : null;
}
const joinLayers = (body, L) => L.map((x) => x.open).join('') + body.slice(L.inner[0], L.inner[1]) + [...L].reverse().map((x) => x.close).join('');
const fieldsOf = (F) => ({ bf: !!F.bf, it: !!F.it, sc: !!F.sc, sf: !!F.sf, tt: !!F.tt, ul: !!F.ul, upper: !!F.upper, size: F.size && F.size !== 'normalsize' ? F.size : null, color: F.color || null, align: F.align || '' });
// what changed between two forms' fields
export function fieldsChanged(F, G) { const a = fieldsOf(F), b = fieldsOf(G); return Object.keys(a).filter((k) => a[k] !== b[k]); }
const ADD = { bf: '\\textbf{', it: '\\textit{', sc: '\\textsc{', sf: '\\textsf{', tt: '\\texttt{', ul: '\\uline{', upper: '\\MakeUppercase{' };
export function editCharBody(body, F, G) {
  const ch = fieldsChanged(F, G);
  if (!ch.length) return body;
  let L = charLayers(body);
  if (!L) return null;
  const inner = L.inner, g = fieldsOf(G);
  const keep = (x) => !(ch.includes(x.field) || (x.field === 'sf' && ch.includes('tt')) || (x.field === 'tt' && ch.includes('sf')));
  // (a declaration taken out leaves the spaces it had: {\bfseries #1} stays readable)
  let out = L.map((x) => (keep(x) ? x : x.decl ? { open: x.open.replace(/\\[A-Za-z]+(?:\s*\{[^{}]*\})?/, '').replace(/\s+/, ' '), close: '', field: null, gone: true } : null)).filter(Boolean);
  // a group left with no declaration goes too
  out = out.filter((x, k) => { if (!x.group) return true; for (let j = k + 1; j < out.length && !out[j].group; j++) if (out[j].decl) return true; return false; });
  // (and the spaces of declarations in a group that went)
  out = out.filter((x, k) => !x.gone || out.slice(0, k).some((y) => y.group));
  for (const f of ['upper', 'ul', 'tt', 'sf', 'sc', 'it', 'bf']) if (ch.includes(f) || ((f === 'sf' || f === 'tt') && (ch.includes('sf') || ch.includes('tt')))) if (g[f]) out.push({ open: ADD[f], close: '}', field: f });
  if ((ch.includes('size')) && g.size) out.unshift({ open: '{\\' + g.size + ' ', close: '}', field: 'size' });
  if (ch.includes('color') && g.color) out.unshift({ open: '\\textcolor{' + g.color + '}{', close: '}', field: 'color' });
  out.inner = inner;
  return joinLayers(body, out);
}
// A paragraph style's start as its tokens: \par, \noindent, \slshape, \color{x}, \centering kept as
// written where the dialog did not change their field
export function envTokens(begin) {
  if (!formatOnlyBegin(begin)) return null;
  const T = [];
  let i = 0;
  for (let n = 0; n < 24 && i < begin.length; n++) {
    const v = begin.slice(i), col = /^\s*\\color\s*\{([^{}]{0,40})\}\s*/.exec(v), d = /^\s*\\([A-Za-z]+)(?![A-Za-z])\s*/.exec(v);
    if (col) { T.push({ t: col[0], field: 'color' }); i += col[0].length; continue; }
    if (!d) { if (v.trim()) return null; T.push({ t: v, field: null }); break; }
    const w = d[1];
    T.push({ t: d[0], field: SIZE_NAMES.includes(w) ? 'size' : /^(centering|raggedleft|raggedright)$/.test(w) ? 'align' : LAYER_FIELD[w] || null });
    i += d[0].length;
  }
  return T;
}
const DECL = { bf: '\\bfseries', it: '\\itshape', sc: '\\scshape', sf: '\\sffamily', tt: '\\ttfamily' };
export function editEnvBegin(begin, F, G) {
  const ch = fieldsChanged(F, G);
  if (!ch.length) return begin;
  const T = envTokens(begin);
  if (!T) return null;
  const g = fieldsOf(G);
  const out = T.filter((x) => !(ch.includes(x.field) || (x.field === 'sf' && ch.includes('tt')) || (x.field === 'tt' && ch.includes('sf')))).map((x) => x.t);
  if (ch.includes('size') && g.size) out.push('\\' + g.size);
  for (const f of ['bf', 'it', 'sc', 'sf', 'tt']) if ((ch.includes(f) || ((f === 'sf' || f === 'tt') && (ch.includes('sf') || ch.includes('tt')))) && g[f]) out.push(DECL[f]);
  if (ch.includes('color') && g.color) out.push('\\color{' + g.color + '}');
  if (ch.includes('align') && g.align) out.push({ center: '\\centering', right: '\\raggedleft', left: '\\raggedright' }[g.align]);
  return out.join('');
}

// Names LaTeX, TeX or the usual packages have: a style of the document's own may not take one
// (\newcommand{\emph} stops TeX; \newenvironment{box} defines \box, a primitive). The parser's
// and the model's own tables are added to these where the check is made.
export const TAKEN = new Set(('box mark char count dimen skip toks output day month year time end begin par relax input include label ref cite item caption title author date '
  + 'section part chapter paragraph subparagraph subsection subsubsection footnote emph underline url href line hline vline frame framebox makebox mbox fbox parbox raisebox '
  + 'small large Large LARGE huge Huge tiny scriptsize footnotesize normalsize quote quotation verse center flushleft flushright tabular tabbing table figure array minipage '
  + 'itemize enumerate description list trivlist document abstract equation eqnarray math displaymath verbatim picture thebibliography theindex titlepage proof theorem '
  + 'lemma definition remark example corollary proposition note sloppy fussy cleardoublepage clearpage newpage pagebreak linebreak newline hfill vfill hspace vspace '
  + 'textbf textit textsc textsf texttt textrm textup textsl textmd textnormal bfseries itshape scshape sffamily ttfamily rmfamily mdseries upshape slshape normalfont em bf it rm sf tt sc sl '
  + 'color textcolor colorbox fcolorbox pagecolor definecolor rule kern hskip vskip penalty noindent indent centering raggedright raggedleft today the value arabic roman Roman alph Alph '
  + 'newcommand renewcommand newenvironment renewenvironment def let edef gdef xdef chardef mathchardef countdef dimendef skipdef toksdef font hbox vbox vtop vcenter halign valign '
  + 'hrule vrule unhbox unvbox copy lastbox setbox wd ht dp the number romannumeral string uppercase lowercase message write read openin openout closein closeout immediate special '
  + 'show showbox showthe accent mathaccent discretionary insert vadjust mark topmark firstmark botmark splitfirstmark splitbotmark noalign omit span cr crcr '
  + 'if ifx ifnum ifdim ifodd ifvmode ifhmode ifmmode ifinner ifvoid ifhbox ifvbox ifeof iftrue iffalse ifcase else fi or expandafter noexpand csname endcsname '
  + 'advance multiply divide global long outer protect ensuremath text quad qquad enspace thinspace negthinspace dots ldots cdots vdots ddots '
  + 'label pageref eqref cref Cref autoref nameref hyperref footnotemark footnotetext marginpar thanks maketitle tableofcontents listoffigures listoftables appendix '
  + 'bibliography bibliographystyle printbibliography addbibresource index glossary includegraphics graphicspath input usepackage documentclass RequirePackage '
  + 'item newline newpage pagestyle thispagestyle markboth markright stepcounter addtocounter setcounter newcounter refstepcounter setlength addtolength newlength settowidth '
  + 'uline uuline uwave sout xout hl ul st so caps lowercase MakeUppercase MakeLowercase verb lstinline mintinline frame').split(/\s+/).filter(Boolean));

// The theorems a preamble makes otherwise than by \newtheorem, as TeX prints them: thmtools'
// \declaretheorem (its name= or title=, numbered=no, sibling= or numberlike=, style=), mdframed's
// \newmdtheoremenv[…]{env}[shared]{Title} and llncs' \spnewtheorem(*){env}[shared]{Title}. Boxes
// (tcolorbox, mdframed's \newmdenv) and \newtcbtheorem, which takes arguments, are none: the page
// draws no label for them and the gallery offers none of them. Bounded scans.
export function thmMakersIn(text) {
  const end = preambleEndOf(text);
  const pre = stripCommentsOf(String(text).slice(0, end < 0 ? Math.min(String(text).length, 200000) : end));
  const out = [];
  const re = /\\(declaretheorem|newmdtheoremenv|spnewtheorem)(\*?)(?![A-Za-z@])\s*/g;
  // the group at i ({…} or […]) as [text, end], or null; 2000 characters at most
  const grp = (i) => { const o = pre[i], c = o === '{' ? '}' : ']'; let d = 0; for (let j = i; j < Math.min(pre.length, i + 2000); j++) { const ch = pre[j]; if (ch === '\\') { j++; continue; } if (ch === o) d++; else if (ch === c && --d === 0) return [pre.slice(i + 1, j), j + 1]; } return null; };
  const sp = (i) => { while (i < pre.length && /\s/.test(pre[i])) i++; return i; };
  const kv = (t) => { const o = {}; for (const part of t.split(',').slice(0, 40)) { const k = part.indexOf('='); if (k > 0) o[part.slice(0, k).trim()] = part.slice(k + 1).trim().replace(/^\{|\}$/g, ''); else if (part.trim()) o[part.trim()] = true; } return o; };
  let m;
  for (let k = 0; (m = re.exec(pre)) && k < 500 && out.length < 300; k++) {
    let i = m.index + m[0].length, opts = {};
    if (m[1] === 'declaretheorem') {
      if (pre[i] === '[') { const g = grp(i); if (!g) continue; opts = kv(g[0]); i = sp(g[1]); }
      if (pre[i] !== '{') continue;
      const g = grp(i); if (!g) continue;
      i = sp(g[1]);
      if (pre[i] === '[') { const h = grp(i); if (h) opts = { ...opts, ...kv(h[0]) }; }
      for (const nm of g[0].split(',')) {
        const name = nm.trim();
        if (!/^[A-Za-z]{1,40}$/.test(name)) continue;
        const title = opts.name || opts.title || name[0].toUpperCase() + name.slice(1);
        out.push({ name, title, numbered: !/^(no|false)$/.test(String(opts.numbered || '')), sibling: opts.sibling || opts.numberlike || null, style: opts.style || 'plain' });
      }
      continue;
    }
    if (pre[i] === '[' && m[1] === 'newmdtheoremenv') { const g = grp(i); if (!g) continue; i = sp(g[1]); }
    if (pre[i] !== '{') continue;
    const g = grp(i); if (!g) continue;
    i = sp(g[1]);
    let sibling = null;
    if (pre[i] === '[') { const h = grp(i); if (!h) continue; sibling = h[0].trim() || null; i = sp(h[1]); }
    if (pre[i] !== '{') continue;
    const t = grp(i); if (!t) continue;
    const name = g[0].trim();
    if (/^[A-Za-z]{1,40}$/.test(name)) out.push({ name, title: t[0].trim().replace(/[{}\\]/g, ''), numbered: !m[2], sibling, style: 'plain' });
  }
  return out;
}

// ---- Code: the paragraph in verbatim (H65) ----------------------------------------------------------
// Code goes only on words verbatim prints as the paragraph does: none of LaTeX's specials, no blank
// line, no dash or quote ligature (verbatim prints -- and `` as typed). So Normal again gives the
// same bytes back; a hand written verbatim with specials in it comes back as text that prints them.
// (and none of what OT1's fonts print otherwise than verbatim does: < > | as ¡ ¿ —, two spaces as
// one; and one line, which verbatim keeps as typed and TeX does not break: review H2, L2)
export const CODE_UNSAFE = /--|``|''|!`|\?`|"|[<>|]| {2}|\t|\r|\n/;
export const codeSafe = (t, cols = Infinity) => !!t && t.length <= cols && !VERB_UNSAFE.test(t) && !CODE_UNSAFE.test(t);
// A verbatim block [s, e) as a style's place: { v, s, ws, we, e } (the words between its lines), or null
export function codeBlock(src, s, e) {
  const head = /^\\begin\s*\{verbatim\}[ \t]*\r?\n?/.exec(src.slice(s, s + 40));
  const tail = /\r?\n?[ \t]*\\end\s*\{verbatim\}$/.exec(src.slice(Math.max(s, e - 40), e));
  if (!head || !tail) return null;
  const ws = s + head[0].length, we = e - tail[0].length;
  return we >= ws ? { v: 'verbatim', s, ws, we, e, spot: -1 } : null;
}
// The words of a verbatim block as text that prints them (LaTeX's specials escaped as typing
// escapes them; Rikuy's own Code has none, so nothing changes)
export function codeText(t, escape) {
  return t.split(/(\r?\n)/).map((x, i) => (i % 2 ? x : escape(x.replace(/\t/g, ' ')))).join('');
}

// ---- the title block as styles: Title, Subtitle, Author, Date (H63) -------------------------------------
// The preamble's \title, KOMA-Script's \subtitle, \author and \date (the last of each, where each
// stands and its argument), the subtitle written as \title{Main\\[0.5ex]\large Sub} where the class
// has no \subtitle, each author of \author{A \and B}, and \maketitle in the body. Bounded: the
// preamble's first 200 000 characters, 200 commands, an argument of 20 000.
const TITLE_CMDS = /\\(title|subtitle|author|date)(?![A-Za-z@])[ \t]*/g;
const SUB_TAIL = /\\\\[ \t]*(?:\[[^\]\n]{0,20}\])?[ \t]*\\(?:large|Large|normalsize|small)(?![A-Za-z])[ \t]*/;
export function titleInfo(src) {
  const end = preambleEndOf(src);
  if (end < 0) return null;
  const out = { end, title: null, subtitle: null, author: null, date: null, authors: [], make: null };
  const body = stripCommentsOf(src.slice(end, end + 200000)), k = body.search(/\\maketitle(?![A-Za-z@])/);
  if (k >= 0) out.make = { s: end + k, e: end + k + 10 };
  // (the preamble and the body before \maketitle, where a \title or \author is as common: the
  // last of each before it is the one TeX prints, review H4)
  const pre = stripCommentsOf(src.slice(0, out.make ? out.make.s : end));
  TITLE_CMDS.lastIndex = 0;
  for (let m, n = 0; (m = TITLE_CMDS.exec(pre)) && n < 200; n++) {
    let i = m.index + m[0].length;
    if (pre[i] === '[') { const z = groupEndOf(pre, i); if (z < 0) continue; i = z; while (pre[i] === ' ' || pre[i] === '\t') i++; }
    if (pre[i] !== '{') continue;
    const z = groupEndOf(pre, i);
    if (z < 0) continue;
    out[m[1]] = { s: m.index, e: z, is: i + 1, ie: z - 1, form: 'own' };
    TITLE_CMDS.lastIndex = z;
  }
  if (out.title && !out.subtitle) {
    const t = pre.slice(out.title.is, out.title.ie), k = t.search(SUB_TAIL);
    if (k > 0) { const m = SUB_TAIL.exec(t.slice(k)); out.subtitle = { s: out.title.is + k, e: out.title.ie, is: out.title.is + k + m[0].length, ie: out.title.ie, form: 'title' }; }
  }
  if (out.author) {
    // each author's words: \and at the argument's own level splits them
    const A = out.author, t = pre.slice(A.is, A.ie);
    let d = 0, from = 0;
    const cut = (a, b) => { let x = a, y = b; while (x < y && /\s/.test(t[x])) x++; while (y > x && /\s/.test(t[y - 1])) y--; out.authors.push({ s: A.is + x, e: A.is + y, cs: A.is + a, ce: A.is + b }); };
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') { if (!d && /^\\and(?![A-Za-z@])/.test(t.slice(i, i + 5))) { cut(from, i); from = i + 4; i += 3; } else i++; continue; }
      if (c === '{') d++; else if (c === '}') d--;
    }
    cut(from, t.length);
  }
  return out;
}
function groupEndOf(t, i) {
  const open = t[i], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let k = i, z = Math.min(t.length, i + 20000); k < z; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return k + 1;
  }
  return -1;
}
// the line a command stands alone on, with its line break, or the command alone
function ownLine(src, s, e) {
  const ls = lineStart(src, s);
  let le = src.indexOf('\n', e);
  if (le < 0) le = src.length;
  if (/\S/.test(src.slice(ls, s)) || /\S/.test(src.slice(e, le).replace(/\r$/, ''))) return { s, e };
  return { s: ls, e: le < src.length ? le + 1 : le };
}
// where the paragraph [ws, we) goes from the body: with the space that keeps it from the text before
function paraCut(src, ws, we) {
  let p = ws;
  while (p > 0 && /\s/.test(src[p - 1])) p--;
  return { s: p, e: we };
}
// A paragraph of plain words made a part of the title block: its words go into the preamble's
// command and it leaves the body (Title: \maketitle takes its place). b: the paragraph's place
// ({ ws, we }); part: 'title', 'subtitle', 'author' or 'date'; o.koma: the class has \subtitle.
// Returns { edits, p (where the caret goes: the title block) } or { why }.
export function titlePartEdits(src, b, part, o = {}) {
  const T = titleInfo(src);
  if (!T) return { why: 'The main file has no preamble to put the title in.' };
  if (b.ws < T.end) return { why: 'Only a paragraph of the document\'s body can be a part of its title.' };
  const words = src.slice(b.ws, b.we), nl = eolAt(src, 0);
  if (!words.trim() || /\n[ \t]*\r?\n/.test(words)) return { why: 'One paragraph of words at a time.' };
  // (into a command's argument only words that close in it: a comment would take its closing brace)
  if (!argSafe(words)) return { why: 'This paragraph has a comment or a brace that does not close in it: it cannot go into the title\'s command as it is.' };
  if (T.make && b.ws < T.make.e) return { why: 'Only a paragraph after \\maketitle can be a part of the title.' };
  const beginLine = lineStart(src, T.end), edits = [], cut = paraCut(src, b.ws, b.we);
  // (a new line beside the title where the title is in the body, else in the preamble)
  const line = (t) => (T.title && T.title.s > T.end ? ownLineAfter(src, T.title, t, nl) : { s: beginLine, e: beginLine, t: t + nl });
  if (part === 'title') {
    if (T.title) return { why: 'This document has a title: its words are edited where it shows, above the text.' };
    edits.push(line('\\title{' + words + '}'));
    if (T.make) edits.push(cut.s === cut.e ? null : { s: cut.s, e: cut.e, t: '' });
    else edits.push({ s: b.ws, e: b.we, t: '\\maketitle' });
  } else {
    if (!T.title || !T.make) return { why: 'Give the document a title first (Title on its first paragraph): \\maketitle shows the ' + part + ' with it.' };
    if (part === 'subtitle') {
      if (T.subtitle) return { why: 'This document has a subtitle: its words are edited where it shows.' };
      edits.push(o.koma ? ownLineAfter(src, T.title, '\\subtitle{' + words + '}', nl) : { s: T.title.ie, e: T.title.ie, t: '\\\\[0.5ex]\\large ' + words });
    } else if (part === 'author') {
      edits.push(T.author ? { s: T.author.ie, e: T.author.ie, t: ' \\and ' + words } : line('\\author{' + words + '}'));
    } else if (part === 'date') {
      if (T.date && src.slice(T.date.is, T.date.ie).trim()) return { why: 'This document has a date: its words are edited where it shows.' };
      edits.push(T.date ? { s: T.date.is, e: T.date.ie, t: words } : line('\\date{' + words + '}'));
    } else return { why: 'No such part of a title.' };
    edits.push({ s: cut.s, e: cut.e, t: '' });
  }
  return { edits: edits.filter(Boolean), p: T.make ? T.make.s : b.ws };
}
// words that can stand in a command's argument: no comment, braces that close in them
function argSafe(t) {
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '%') return false;
    if (c === '{') d++; else if (c === '}' && --d < 0) return false;
  }
  return d === 0;
}
const ownLineAfter = (src, C, t, nl) => { const L = ownLine(src, C.s, C.e); return L.s === C.s ? { s: C.e, e: C.e, t: nl + t } : { s: L.e, e: L.e, t: t + nl }; };
// The part of the title block at offset p ({ part, k (an author's place) } or null)
export function titlePartAt(T, p) {
  if (!T) return null;
  const inside = (R) => R && p >= R.is && p <= R.ie;
  if (T.subtitle && p >= T.subtitle.is && p <= T.subtitle.ie) return { part: 'subtitle' };
  if (inside(T.title)) return { part: 'title' };
  for (let k = 0; k < T.authors.length; k++) if (p >= T.authors[k].cs && p <= T.authors[k].ce) return { part: 'author', k };
  if (inside(T.date)) return { part: 'date' };
  return null;
}
// A part of the title block made a paragraph of the body again, right after \maketitle (Normal):
// Subtitle, an author, the date; the title only where it stands alone (\maketitle needs one: the
// paragraph takes \maketitle's place, so Title and Normal are each other's way back byte for byte)
export function titleNormalEdits(src, at) {
  const T = titleInfo(src);
  const P = titlePartAt(T, at);
  if (!P || !T.make) return { why: 'Click in a part of the title first.' };
  const nl = eolAt(src, 0), edits = [];
  let words;
  if (P.part === 'title') {
    if (T.subtitle || T.authors.some((x) => x.e > x.s) || (T.date && src.slice(T.date.is, T.date.ie).trim())) return { why: 'The title stays while the title block has a subtitle, an author or a date: \\maketitle needs it. Make those Normal first.' };
    words = src.slice(T.title.is, T.title.ie);
    if (/\\thanks(?![A-Za-z@])/.test(words)) return { why: 'A \\thanks note prints only in the title block: take it out first.' };
    // (an empty \author{} or \date{} stays: harmless without \maketitle, and the way back is byte for byte)
    const L = ownLine(src, T.title.s, T.title.e);
    edits.push({ s: L.s, e: L.e, t: '' }, { s: T.make.s, e: T.make.e, t: words });
    return { edits, p: T.make.s };
  }
  if (P.part === 'subtitle') {
    const S = T.subtitle;
    words = src.slice(S.is, S.ie).trim();
    if (S.form === 'title') edits.push({ s: S.s, e: S.e, t: '' }); else { const L = ownLine(src, S.s, S.e); edits.push({ s: L.s, e: L.e, t: '' }); }
  } else if (P.part === 'author') {
    const A = T.authors[P.k];
    words = src.slice(A.s, A.e);
    if (T.authors.length === 1) { const L = ownLine(src, T.author.s, T.author.e); edits.push({ s: L.s, e: L.e, t: '' }); }
    // (with the \and before it, or after it for the first)
    else if (P.k > 0) edits.push({ s: T.authors[P.k - 1].e, e: A.e, t: '' });
    else edits.push({ s: A.s, e: T.authors[1].s, t: '' });
  } else {
    words = src.slice(T.date.is, T.date.ie).trim();
    const L = ownLine(src, T.date.s, T.date.e);
    edits.push({ s: L.s, e: L.e, t: '' });
  }
  if (!words) return { why: 'That part has no words to make a paragraph of.' };
  if (/\\thanks(?![A-Za-z@])/.test(words)) return { why: 'A \\thanks note prints only in the title block: take it out first.' };
  edits.push({ s: T.make.e, e: T.make.e, t: nl + nl + words });
  return { edits, p: T.make.e + 2 * nl.length };
}

// ---- Rename a style of the document's own (H74) -------------------------------------------------------
// Every place a text names an environment or a command of its own, renamed: \begin{old} and
// \end{old}, its definition (\newenvironment, \renewenvironment, \newtheorem{old} and a theorem
// numbered with it, \newtheorem{x}[old], thmtools', tcolorbox's, mdframed's makers, cleveref's
// names), and for a command every \old. Comments and verbatim text are left as written. Bounded:
// 2 000 000 characters, 20 000 places.
const ENV_NAMERS = new Set(['begin', 'end', 'newenvironment', 'renewenvironment', 'provideenvironment', 'NewDocumentEnvironment', 'RenewDocumentEnvironment', 'newtheorem', 'declaretheorem', 'newtcbtheorem', 'newmdtheoremenv', 'spnewtheorem', 'newtcolorbox', 'DeclareTColorBox', 'newmdenv', 'crefname', 'Crefname', 'newframedtheorem', 'newshadedtheorem',
  // (a theorem's counter has its name: \setcounter{claim}{0}, \arabic{claim})
  'arabic', 'alph', 'Alph', 'roman', 'Roman', 'fnsymbol', 'setcounter', 'addtocounter', 'stepcounter', 'refstepcounter', 'value', 'numberwithin', 'counterwithin', 'counterwithout',
  'newcounter', '@addtoreset']);
// (namers whose every braced argument may be the counter: \numberwithin{equation}{claim}, review H6)
const COUNTER_PAIRS = new Set(['numberwithin', 'counterwithin', 'counterwithout', '@addtoreset']);
// (thmtools' and the like's options that name another theorem's counter)
const SIBLING_KEYS = /(\b(?:sibling|numberlike|sharenumber|numberwithin|parent)\s*=\s*\{?\s*)([A-Za-z@*]{1,60})(?=\s*\}?\s*(?:,|$))/g;
// (inline verbatim: its text is as written, as \verb's, review L3)
const INLINE_VERB = new Set(['lstinline', 'path', 'url', 'nolinkurl', 'mintinline', 'mint', 'Verb']);
const VERB_ENVS = /^(verbatim\*?|Verbatim\*?|lstlisting|minted|comment|filecontents\*?)$/;
// o.counter: the environment has a counter of its name (a theorem, \newcounter): \theold, \c@old and
// \p@old are its own then, and are renamed; else they are left (\theta for an environment "ta")
export function renameEdits(text, old, neu, kind, o = {}) {
  const out = [], n = Math.min(text.length, 2e6);
  const word = (i) => { let j = i; while (j < n && /[A-Za-z@]/.test(text[j])) j++; return j; };
  const skipSp = (i) => { while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++; return i; };
  for (let i = 0; i < n && out.length < 20000; i++) {
    const c = text[i];
    if (c === '%') { const k = text.indexOf('\n', i); if (k < 0) break; i = k; continue; }
    if (c !== '\\') continue;
    const j = word(i + 1), name = text.slice(i + 1, j);
    if (!name) { i++; continue; }
    // \verb|...| and the verbatim environments: their text is as written
    if (name === 'verb') { let k = j; if (text[k] === '*') k++; const d = text[k], z = d ? text.indexOf(d, k + 1) : -1; i = z < 0 ? j : z; continue; }
    if (INLINE_VERB.has(name)) {
      // (url's \path|..| and \url{..} take no option, and no delimiter TikZ's \path starts with:
      // "\path (0,0) node {..}" and "\path[draw]" are drawing commands whose text is TeX's; review N1)
      const urlish = name === 'path' || name === 'url' || name === 'nolinkurl';
      let k = skipSp(j);
      if (text[k] === '[' && !urlish) { const z = groupEndOf(text, k); k = z < 0 ? k : skipSp(z); }
      if (name === 'mint' || name === 'mintinline') { if (text[k] === '{') { const z = groupEndOf(text, k); k = z < 0 ? k : z; } }
      const d = text[k];
      const ok = d === '{' || (!!d && (urlish ? /[|!+"'\/@=:;.,*-]/.test(d) : !/[\s\\]/.test(d)));
      const z = !ok ? -1 : d === '{' ? groupEndOf(text, k) - 1 : text.indexOf(d, k + 1);
      i = z < 0 ? j - 1 : z;
      continue;
    }
    if (name === 'begin') {
      const k = skipSp(j);
      if (text[k] === '{') { const z = text.indexOf('}', k); const env = z > 0 && z - k < 60 ? text.slice(k + 1, z).trim() : ''; if (VERB_ENVS.test(env)) { const end = text.indexOf('\\end{' + env + '}', z); i = end < 0 ? n : end + 5 + env.length; continue; } }
    }
    if (kind === 'cmd') { if (name === old) out.push({ s: i + 1, e: j, t: neu }); i = j - 1; continue; }
    // (an environment's own commands and its counter's: \claim, \endclaim, \theclaim, \claimautorefname, \c@claim)
    const own = name === old ? '' : name === 'end' + old ? 'end' : o.counter && name === 'the' + old ? 'the' : o.counter && name === 'c@' + old ? 'c@' : o.counter && name === 'p@' + old ? 'p@' : name === old + 'autorefname' ? '+autorefname' : name === old + 'name' ? '+name' : null;
    if (own != null) {
      out.push({ s: i + 1, e: j, t: own[0] === '+' ? neu + own.slice(1) : own + neu });
      // (\renewcommand{\theoremautorefname}{Thm}: hyperref defines the old name, not the new one,
      // so the renamed one is provided: review N4)
      if (own[0] === '+') { const back = text.slice(Math.max(0, i - 40), i), m = /\\renewcommand(\*?)\s*\{?\s*$/.exec(back); if (m) { const s0 = i - back.length + m.index + 1; out.push({ s: s0, e: s0 + 12, t: 'providecommand' }); } }
      i = j - 1; continue;
    }
    if (!ENV_NAMERS.has(name)) { i = j - 1; continue; }
    // the namer's arguments: a star, an [option], then {name}; \newtheorem{x}[old] counts with old
    const thm = name === 'newtheorem' || name === 'spnewtheorem';
    let k = skipSp(j), braces = 0;
    if (text[k] === '*') k = skipSp(k + 1);
    for (let a = 0; a < 4 && k < n; a++) {
      const z = text[k] === '[' || text[k] === '{' ? groupEndOf(text, k) : -1;
      if (z < 0) break;
      const inner = text.slice(k + 1, z - 1), here = (k + 1) + inner.indexOf(old);
      if (text[k] === '[') {
        // (\newtheorem{x}[claim]{..}, \newtheorem{x}{..}[claim], \newcounter{x}[claim]; a key naming it)
        if (inner.trim() === old && ((thm && braces >= 1) || (name === 'newcounter' && braces === 1))) out.push({ s: here, e: here + old.length, t: neu });
        else if (inner.length < 2000) for (const m of inner.matchAll(SIBLING_KEYS)) if (m[2] === old) { const q = k + 1 + m.index + m[1].length; out.push({ s: q, e: q + old.length, t: neu }); }
        k = skipSp(z); continue;
      }
      if ((braces === 0 || COUNTER_PAIRS.has(name)) && inner.trim() === old) out.push({ s: here, e: here + old.length, t: neu });
      braces++;
      if (!thm && name !== 'newcounter' && !(COUNTER_PAIRS.has(name) && braces < 2)) break;
      k = skipSp(z);
    }
    i = j - 1;
  }
  return out;
}

// (R2, review H5) Whether a text makes a command or an environment its own (\newcommand, \def,
// \newenvironment, \newtheorem and the theorem makers), not one it only redefines (\renewcommand,
// \renewenvironment): only those are renamed. name: letters only.
export function createsOwn(text, name, kind) {
  if (!/^[A-Za-z]{1,40}$/.test(name)) return false;
  const t = stripCommentsOf(String(text).slice(0, 400000));
  const re = kind === 'cmd' ? new RegExp('\\\\(?:newcommand|providecommand|DeclareRobustCommand|NewDocumentCommand|[gex]?def)\\*?\\s*\\{?\\s*\\\\' + name + '(?![A-Za-z@])')
    : new RegExp('\\\\(?:newenvironment|NewDocumentEnvironment|newtheorem|declaretheorem|newtcbtheorem|newmdtheoremenv|spnewtheorem|newtcolorbox|DeclareTColorBox|newmdenv|newframedtheorem|newshadedtheorem)\\*?\\s*(?:\\[[^\\]]{0,500}\\]\\s*)?\\{\\s*' + name + '\\s*\\}');
  return re.test(t);
}
// (review H6) A fancyvrb Verbatim with commandchars runs the commands in it: a rename would have to
// reach into it, so a text holding one that names \old is refused
export function verbatimRuns(text, old) {
  const re = /\\begin\s*\{(Verbatim|BVerbatim|LVerbatim)\}\s*\[([^\]]{0,2000})\]/g, cmd = new RegExp('\\\\' + old + '(?![A-Za-z@])');
  for (let m, n = 0; (m = re.exec(text)) && n < 200; n++) {
    if (!/commandchars/.test(m[2])) continue;
    const z = text.indexOf('\\end{' + m[1] + '}', m.index);
    if (cmd.test(text.slice(m.index, z < 0 ? text.length : z))) return true;
  }
  return false;
}

// whether a text gives an environment a counter of its name (\newtheorem{claim}, \newcounter{claim})
export function makesCounter(text, name) {
  if (!/^[A-Za-z]{1,40}$/.test(name)) return false;
  return new RegExp('\\\\(?:newtheorem|newcounter|declaretheorem|spnewtheorem|newmdtheoremenv|newtcbtheorem)\\s*(?:\\[[^\\]]{0,500}\\]\\s*)?\\{\\s*' + name + '\\s*\\}').test(stripCommentsOf(String(text).slice(0, 400000)));
}
