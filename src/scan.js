// A TeX text's comments, read once per text. Every reader of the preamble (src/preamble.js,
// src/looks.js, src/styles.js and the modules on top of them: the page's set up, the paragraph's,
// lists, references) needs the text with its comments made spaces and the place where the
// preamble ends; each once made that again from the whole file, one character at a time, and one
// build of the page's model asked a dozen times: on a 141 KB paper more than half of the build
// (docs/handoff/CPP-PLAN.md, B0). Now the answers for the last few texts are kept. A string is a
// value, so the same text always gets the same answer and nothing kept can be stale; a text is
// compared with what is kept by ===, which for another string of another length costs nothing.

const KEEP = 12;     // answers kept
const BUDGET = 8e6;  // characters kept in all, texts and answers
const SMALL = 1000;  // shorter texts are made again: cheaper than looking
const kept = [];
let size = 0;
function memo(kind, t, make) {
  if (t.length < SMALL) return make();
  for (let k = 0; k < kept.length; k++) {
    const x = kept[k];
    if (x.kind === kind && x.t === t) {
      if (k) { kept.splice(k, 1); kept.unshift(x); }
      return x.v;
    }
  }
  const v = make();
  const n = t.length + (typeof v === 'string' ? v.length : 0);
  kept.unshift({ kind, t, v, n });
  size += n;
  while (kept.length > KEEP || (size > BUDGET && kept.length > 1)) size -= kept.pop().n;
  return v;
}

// t's first n characters with each comment (from a % no backslash escapes to its line's end) made
// spaces, so offsets stay those of the text. As the readers always made it: a comment that runs
// past n is made spaces to its line's end, and a backslash at n - 1 takes the character after it
// along, so the answer may be longer than n (a caller that adds the rest of the text adds it from
// the answer's length: src/preamble.js stripComments).
export function commentsBlanked(t, n) {
  return memo(n, t, () => blank(t, n));
}

// (the text between specials is copied in pieces, found by indexOf, not character by character)
function blank(t, n) {
  let out = '', from = 0, i = 0;
  let nb = t.indexOf('\\'), np = t.indexOf('%');
  while (i < n) {
    if (nb >= 0 && nb < i) nb = t.indexOf('\\', i);
    if (np >= 0 && np < i) np = t.indexOf('%', i);
    const k = nb < 0 ? np : np < 0 ? nb : Math.min(nb, np);
    if (k < 0 || k >= n) break;
    // a backslash keeps the character after it, which is then no comment's start
    if (k === nb) { i = k + 2; continue; }
    const j = t.indexOf('\n', k), e = j < 0 ? n : j;
    out += t.slice(from, k) + ' '.repeat(e - k);
    from = i = e;
  }
  if (i < n) i = n;
  return out + t.slice(from, i);
}

// where the preamble ends: the first \begin{document} that is no comment's, in the first 200,000
// characters, or -1
export function preambleEnd(src) {
  return memo('end', src, () => {
    const s = src.slice(0, 200000);
    const m = /\\begin\s*\{document\}/.exec(commentsBlanked(s, s.length));
    return m ? m.index : -1;
  });
}

// A file's name as \input, \include or \subfile gives it, to the project's file TeX reads, or null
// (review V6). TeX looks from the folder it runs in, the main file's; the subfiles package from the
// folder of the file that names it (\subfile{sections/s1} in chapters/one.tex reads
// chapters/sections/s1.tex), so that folder first; then the other of the two; then the project's
// root; and as a last guess a file of that name anywhere, in the main file's folder first. Before,
// the name was tried from the root first, then by its last part anywhere: paper/main.tex's
// \input{intro} read slides/intro.tex where the Map had that first. "a b" is a name with a space,
// as TeX Live reads it. The page's model resolves names by this too (src/model.js resolveFile).
const dirOf = (f) => (f && f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '');
function joined(path) {
  const out = [];
  for (const seg of path.split('/')) {
    if (seg === '..') { if (!out.length) return null; out.pop(); } else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return out.join('/');
}
export function resolveIn(files, name, main, from, sub) {
  name = (name || '').trim().replace(/^"([^"]*)"$/, '$1').trim();
  if (!name || name[0] === '/') return null;
  const md = dirOf(main), fd = dirOf(from);
  for (const d of sub ? [fd, md, ''] : [md, fd, '']) {
    const p = joined(d + name);
    if (p) for (const c of [p, p + '.tex']) if (files.has(c)) return c;
  }
  const base = name.split('/').pop();
  for (const pre of md ? [md, ''] : ['']) {
    for (const k of files.keys()) if (k.startsWith(pre) && (k.endsWith('/' + base) || k.endsWith('/' + base + '.tex') || k === base + '.tex')) return k;
  }
  return null;
}

// \iffalse ... \fi (or up to its \else) made spaces, offsets kept: a chapter left out that way is
// not read (review V6). TeX's own conditionals inside it, and those the text makes with \newif,
// nest; \ifthenelse and etoolbox's \ifdef take no \fi and do not.
const PRIM_IF = new Set(['if', 'ifcat', 'ifnum', 'ifdim', 'ifodd', 'ifvmode', 'ifhmode', 'ifmmode', 'ifinner', 'ifvoid', 'ifhbox', 'ifvbox', 'ifx', 'ifeof', 'iftrue', 'iffalse', 'ifcase', 'ifdefined', 'ifcsname', 'iffontchar', 'ifincsname', 'ifpdfprimitive', 'ifprimitive', 'ifpdfabsnum', 'ifpdfabsdim', 'ifabsnum', 'ifabsdim']);
function falseBlanked(t) {
  if (!/\\iffalse(?![A-Za-z])/.test(t)) return t;
  const own = new Set([...t.matchAll(/\\newif\s*\\(if[A-Za-z]+)/g)].map((m) => m[1]));
  const blank = (x) => x.replace(/[^\n]/g, ' ');
  let out = '', at = 0, depth = 0, start = 0;
  for (const m of t.matchAll(/\\(if[A-Za-z]*|else|fi)(?![A-Za-z])/g)) {
    const w = m[1];
    if (!depth) { if (w === 'iffalse') { depth = 1; start = m.index; } continue; }
    if (w === 'fi') depth--;
    else if (w === 'else') { if (depth === 1) depth = 0; }
    else if (PRIM_IF.has(w) || own.has(w)) depth++;
    if (!depth) { const z = m.index + m[0].length; out += t.slice(at, start) + blank(t.slice(start, z)); at = z; }
  }
  // (one never closed: TeX skips to the file's end)
  if (depth) { out += t.slice(at, start) + blank(t.slice(start)); at = t.length; }
  return out + t.slice(at);
}

// The project's .tex files the main file reads, in the order TeX reads them: the main file, then
// each \input, \include, \subfile, \import and \subimport (in a comment none, nor in \iffalse), the
// files those read after them; names resolved as the model resolves them (resolveIn). The
// project-wide scans (the bibliography's files and style: src/cmd/refs.js, src/model.js) read
// these alone: a beamer talk or a response letter beside the paper is no part of it (review E16:
// its \bibliography took the paper's .bib, and its \bibliographystyle set the paper's order).
export function filesRead(files, main) {
  const out = [], seen = new Set();
  const walk = (f) => {
    if (seen.has(f) || out.length > 500) return;
    seen.add(f);
    out.push(f);
    const t = files.get(f);
    if (typeof t !== 'string') return;
    // (\input chap1, with no braces, as plain TeX writes it: the name ends at a space)
    const re = /\\(input|include|subfile|import|subimport)(?![A-Za-z])\s*(?:\{([^{}]*)\}(?:\s*\{([^{}]*)\})?|([^\s{}%\\]+))/g;
    for (const m of falseBlanked(commentsBlanked(t, Math.min(t.length, 2e6))).matchAll(re)) {
      if (m[4] != null && m[1] !== 'input') continue;
      const two = m[1] === 'import' || m[1] === 'subimport';
      if (two && m[3] == null) continue;
      const name = m[4] != null ? m[4] : two ? m[2].replace(/\/?$/, '/') + m[3] : m[2];
      // (\subfile and \subimport from the folder of the file that names them)
      const g = resolveIn(files, name, main, f, m[1] === 'subfile' || m[1] === 'subimport');
      if (g && /\.(tex|ltx)$/i.test(g)) walk(g);
    }
  };
  if (files.has(main)) walk(main);
  return out;
}
