// Insert › Cover Page as LaTeX: a titlepage environment right after \begin{document}, in one of a
// few designs, its title, author and date the document's own (\thetitle and its kin, src/fields.js,
// so a title changed in \title changes on the cover too) or, in a document with none, words to type
// over. A titlepage standing first in the body, hand written or Rikuy's, is the cover page: a new
// design takes its place, Remove Current Cover Page takes it out. Pure edits on strings.

import { propertyTex } from './fields.js';

export const COVERS = [
  ['plain', 'Plain', 'The title in the middle of the page, the author and the date under it'],
  ['sideline', 'Sideline', 'The title between two rules, from the left'],
  ['motion', 'Motion', 'The title at the foot of the page, at the right']
];

const BODY = {
  plain: (T, A, D) => ['\\centering', '\\vspace*{\\fill}', '{\\Huge\\bfseries ' + T + '\\par}', '\\vspace{2em}', '{\\Large ' + A + '\\par}', '\\vspace{1em}', '{\\large ' + D + '\\par}', '\\vspace*{\\fill}'],
  sideline: (T, A, D) => ['\\raggedright', '\\vspace*{0.2\\textheight}', '\\noindent\\rule{\\linewidth}{1pt}\\par', '\\vspace{1em}', '{\\Huge\\bfseries ' + T + '\\par}', '\\vspace{1em}', '\\noindent\\rule{\\linewidth}{1pt}\\par', '\\vspace{2em}', '{\\Large ' + A + '\\par}', '\\vspace{0.5em}', '{\\large ' + D + '\\par}'],
  motion: (T, A, D) => ['\\raggedleft', '\\vspace*{\\fill}', '{\\Huge\\bfseries ' + T + '\\par}', '\\vspace{1em}', '{\\Large ' + A + '\\par}', '\\vspace{0.5em}', '{\\large ' + D + '\\par}']
};

const begin = (src) => { const m = /\\begin\s*\{document\}/.exec(src); return m ? m.index + m[0].length : -1; };

// The cover page: a titlepage environment first in the body (blank lines and comments before it
// are fine), as { s, e } with e after its \end{titlepage} and the line's end; or null
export function coverAt(src) {
  const b = begin(src);
  if (b < 0) return null;
  let i = b;
  // (bounded: a cover page stands within the body's first lines)
  for (let n = 0; n < 200 && i < src.length; n++) {
    while (i < src.length && /[ \t\r\n]/.test(src[i])) i++;
    if (src[i] === '%') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    break;
  }
  const m = /^\\begin\s*\{titlepage\}/.exec(src.slice(i, i + 40));
  if (!m) return null;
  // its end, the first \end{titlepage} not in a comment (titlepage does not nest)
  const re = /\\end\s*\{titlepage\}|%[^\n]*/g;
  re.lastIndex = i + m[0].length;
  let x;
  while ((x = re.exec(src))) {
    if (x[0][0] === '%') continue;
    let e = x.index + x[0].length;
    if (src[e] === '\r') e++;
    if (src[e] === '\n') e++;
    return { s: i, e };
  }
  return null;
}

// What a design writes. props: { title, author, date } as present in the document (truthy when
// \title, \author, \date are there), cls the class. Returns { text, packages }.
export function coverTex(id, props = {}, cls = '', eol = '\n') {
  const make = BODY[id] || BODY.plain;
  const pk = new Set();
  const field = (prop, words) => {
    if (!props[prop]) return words;
    const P = propertyTex(prop, cls);
    for (const x of P.pk) pk.add(x);
    return P.tex + '{}';
  };
  // (the date: \date's, else the day the PDF is made, as \maketitle prints it)
  const T = field('title', 'Document title'), A = field('author', 'Author name');
  const D = props.title || props.author || props.date ? field('date', '\\today{}') : '\\today{}';
  return { text: ['\\begin{titlepage}', ...make(T, A, D), '\\end{titlepage}'].join(eol) + eol, packages: [...pk] };
}

// The edits that put a design in: in place of the cover page there is, else right after
// \begin{document}'s line. { edits: [{ s, e, t }], packages, at } or { error }
export function coverEdits(src, id, props, cls) {
  if (cls === 'beamer') return { error: 'A presentation\'s title page is a frame of its own (\\titlepage in a frame).' };
  const b = begin(src);
  if (b < 0) return { error: 'The document has no \\begin{document}.' };
  const eol = /\r\n/.test(src.slice(0, 4000)) ? '\r\n' : '\n';
  const { text, packages } = coverTex(id, props, cls, eol);
  const old = coverAt(src);
  if (old) return { edits: [{ s: old.s, e: old.e, t: text }], packages, at: old.s };
  // (after the line \begin{document} ends: the cover's lines on lines of their own)
  let p = b;
  while (p < src.length && (src[p] === ' ' || src[p] === '\t')) p++;
  if (src[p] === '\r') p++;
  if (src[p] === '\n') p++;
  else return { edits: [{ s: b, e: b, t: eol + text }], packages, at: b + eol.length };
  return { edits: [{ s: p, e: p, t: text }], packages, at: p };
}

// Remove Current Cover Page: the titlepage first in the body, and its line
export function coverRemoveEdits(src) {
  const c = coverAt(src);
  return c ? [{ s: c.s, e: c.e, t: '' }] : [];
}

// which design a cover page is (Rikuy's, read back), or null for a hand written one
export function coverDesign(src) {
  const c = coverAt(src);
  if (!c) return null;
  const t = src.slice(c.s, c.e);
  if (/\\rule\{\\linewidth\}/.test(t) && /\\raggedright/.test(t)) return 'sideline';
  if (/\\raggedleft/.test(t)) return 'motion';
  if (/\\centering/.test(t) && /\\vspace\*\{\\fill\}/.test(t)) return 'plain';
  return 'own';
}
