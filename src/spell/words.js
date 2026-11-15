// What spelling checks, and in which language: the prose of the page, never its LaTeX. The words
// come from the model's text (the seg runs src/render.js draws, each character with its source
// range), so a command, an environment's name, a key, a label, a citation key, math, a reference,
// a footnote mark and a macro's drawn text are never words here: none of them is a seg. What
// is a seg but no prose is left out too: \texttt and \verb (code, file names), \url and \path,
// a LaTeX paragraph (% rikuy: latex) and raw blocks, the table of contents (the headings
// again) and the bibliography (names and titles from the .bib). Inside the prose, Word's own
// rules: a word in capitals, a word with a digit next to it, an address or a file name
// (example.com, main.tex, a/b, x@y, x_y) is not checked.
//
// Pure, so test/spell.test.mjs runs it on the corpus under node; src/cmd/review.js runs it on the
// page's model and sends the distinct words to the spell worker (src/spell/worker.js).

import { parse } from '../parser.js';

// ---- the page's prose --------------------------------------------------------------------------

// block parts with no prose of their own (or none that is the document's: the TOC repeats the
// headings, the bibliography is the .bib's)
const SKIP_TYPES = new Set(['raw', 'tex', 'toc', 'refs', 'math', 'rule', 'space', 'pagebreak', 'pagemark']);
// inline atoms: they part the words around them and hold no prose
const ATOMS = new Set(['math', 'cite', 'ref', 'chip', 'img', 'widget', 'logo', 'url', 'verb', 'br', 'rule', 'mac', 'sp', 'fn']);
// styles whose text is code or an address, not prose
const CODE_ST = new Set(['tt', 'ph']);
const CODE_CMDS = new Set(['texttt', 'url', 'path', 'nolinkurl', 'verb', 'lstinline', 'mintinline', 'code', 'file', 'filename', 'cmd', 'meta', 'env', 'pkg', 'cls', 'opt', 'tex']);
const SKIP_KEYS = new Set(['map', 'rel', 'keys', 'cols', 'rules', 'tags', 'def', 'opts']);

// The runs of prose of a model's blocks: [{f, text, map}], map holding each character's source
// start and end (map[2k], map[2k+1]; -1 for a space Rikuy put between two runs of one line);
// a run ends at anything that is not text.
// o.code: count code too (Word Count counts \texttt's words); o.notes: false leaves footnotes
// and captions out (Word Count's box)
export function proseRuns(model, o = {}) {
  const runs = [];
  for (const B of model.blocks || []) blockRuns(B, o, runs);
  return runs;
}
export function blockRuns(B, o = {}, runs = []) {
  let cur = null;
  const flush = () => { if (cur && cur.text) runs.push(cur); cur = null; };
  const seg = (x) => {
    if (x.ph || !x.t || !x.map || x.map.length < 2 * x.t.length) { flush(); return; }
    const f = x.f;
    if (!cur || cur.f !== f) { flush(); cur = { f, text: '', map: [] }; }
    cur.text += x.t;
    for (let i = 0; i < 2 * x.t.length; i++) cur.map.push(x.map[i]);
  };
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 60) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v.k === 'seg') { seg(v); return; }
    if (v.k === 'sty') {
      if (v.ro || (!o.code && (CODE_ST.has(v.st) || CODE_CMDS.has(v.cmd)))) { flush(); return; }
      walk(v.kids, depth + 1);
      return;
    }
    if (v.k === 'chr') { if (/\S/.test(v.text || '') && v.cls !== 'sp') flush(); else if (cur && /\s/.test(v.text || '')) seg({ t: ' ', f: cur.f, map: [-1, -1] }); return; }
    if (v.k && ATOMS.has(v.k)) { flush(); return; }
    if (v.type && SKIP_TYPES.has(v.type)) { flush(); return; }
    if (v.type === 'caption' && o.notes === false) { flush(); return; }
    // a block part, a row, a cell, each field of a title: a run of its own
    flush();
    for (const k in v) if (!SKIP_KEYS.has(k) && v[k] && typeof v[k] === 'object') { walk(v[k], depth + 1); flush(); }
  };
  walk(B.items, 0); flush();
  if (o.notes !== false) { walk(B.fns, 0); flush(); }
  return runs;
}

// ---- words ---------------------------------------------------------------------------------------

// a word: letters, with an apostrophe or a hyphen inside (don't, well-known); the dictionary
// decides on compounds (Hunspell's BREAK)
const WORD = /[\p{L}\p{M}]+(?:['’\-‐][\p{L}\p{M}]+)*/gu;
// a chunk between spaces that is an address or a file name: checked as no words at all
// (a key=value list, as an unknown command's options show on the page, is no prose either)
const ADDRESS = /:\/\/|^www\.|@|[\\/_=]|\p{L}\.\p{L}{2,}/u;
export const MAX_WORD = 64;

// The words of a text to check: [{i, j, w}] (w as written, i and j in the text). Not words: a
// single letter, one in capitals (NASA, PDE), one touching a digit (x2, 3D), and every word of
// an address or a file name.
export function wordsIn(text) {
  const out = [];
  if (!text) return out;
  // the chunks between spaces that are addresses, by their ranges
  const skip = [];
  for (const m of text.matchAll(/\S+/g)) {
    // (a chunk longer than any word with its marks is no prose: skipped whole, and never given
    // to the trimming below, whose end anchored pattern takes time squared in a long run of
    // closing marks, as a stranger's document could hold)
    if (m[0].length > 2 * MAX_WORD) { skip.push([m.index, m.index + m[0].length]); continue; }
    const c = m[0].replace(/^[("“‘'[{<]+|[)"”’'\]}>.,;:!?]+$/g, '');
    if (c.length > 3 && ADDRESS.test(c)) skip.push([m.index, m.index + m[0].length]);
  }
  let k = 0;
  for (const m of text.matchAll(WORD)) {
    const i = m.index, j = i + m[0].length, w = m[0];
    while (k < skip.length && skip[k][1] <= i) k++;
    if (k < skip.length && skip[k][0] < j) continue;
    if (w.length < 2 || w.length > MAX_WORD) continue;
    if (/\p{N}/u.test(text[i - 1] || '') || /\p{N}/u.test(text[j] || '')) continue;
    if (w === w.toUpperCase() && w !== w.toLowerCase()) continue;
    out.push({ i, j, w });
  }
  return out;
}

// what the dictionary is asked: the typographic apostrophe as the straight one (the en
// dictionaries take both; the others have no apostrophes), soft hyphens out
export const asked = (w) => w.replace(/’/g, "'").replace(/[­]/g, '').replace(/‐/g, '-');

// ---- languages -----------------------------------------------------------------------------------

// The dictionaries Rikuy ships (tex/build_tools.sh hunspell) and the language names that take
// each: babel's and polyglossia's, and BCP 47 tags
export const DICTS = ['en_US', 'en_GB', 'de_DE', 'es_ES'];
export const DICT_NAME = { en_US: 'English (United States)', en_GB: 'English (United Kingdom)', de_DE: 'German (Germany)', es_ES: 'Spanish' };
const LANG = {
  english: 'en_US', american: 'en_US', usenglish: 'en_US', canadian: 'en_US', 'en': 'en_US', 'en-us': 'en_US', 'en-ca': 'en_US',
  british: 'en_GB', ukenglish: 'en_GB', australian: 'en_GB', newzealand: 'en_GB', 'en-gb': 'en_GB', 'en-au': 'en_GB', 'en-nz': 'en_GB', 'en-ie': 'en_GB',
  ngerman: 'de_DE', german: 'de_DE', austrian: 'de_DE', naustrian: 'de_DE', swissgerman: 'de_DE', nswissgerman: 'de_DE', germanb: 'de_DE', ngermanb: 'de_DE',
  de: 'de_DE', 'de-de': 'de_DE', 'de-at': 'de_DE', 'de-ch': 'de_DE',
  spanish: 'es_ES', spanishmx: 'es_ES', castilian: 'es_ES', es: 'es_ES', 'es-es': 'es_ES', 'es-mx': 'es_ES', 'es-pe': 'es_ES', 'es-ar': 'es_ES'
};
// the language names babel and polyglossia know, for telling a language from another option
const KNOWN = /^(english|american|usenglish|canadian|british|ukenglish|australian|newzealand|ngerman|german|austrian|naustrian|swissgerman|nswissgerman|germanb|ngermanb|spanish|spanishmx|castilian|french|francais|frenchb|italian|portuguese|portuges|brazil|brazilian|dutch|danish|swedish|norsk|nynorsk|norwegian|finnish|polish|czech|slovak|slovene|croatian|serbian|russian|ukrainian|greek|turkish|hungarian|romanian|catalan|galician|basque|irish|welsh|latin|estonian|latvian|lithuanian|icelandic|arabic|hebrew|farsi|persian|hindi|chinese|japanese|korean|thai|vietnamese|indonesian|malay|afrikaans|albanian|bulgarian|macedonian|esperanto|interlingua|[a-z]{2}(?:-[a-z]{2,4})?)$/;

// The dictionary of a language name: one of DICTS, null for a language Rikuy has none for, ''
// for no language at all. o.variant: polyglossia's variant= (british, uk, us, american)
export function dictOf(name, variant) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return '';
  if (n === 'english' && variant) { const v = String(variant).toLowerCase(); if (/british|uk|australian|newzealand/.test(v)) return 'en_GB'; }
  if (Object.prototype.hasOwnProperty.call(LANG, n)) return LANG[n];
  return null;
}

const strip = (t) => t.replace(/(^|[^\\])%[^\n]*/g, '$1');
// the part of a main file before \begin{document} (bounded: a preamble past 200 kB is read that far)
function preambleOf(src) {
  const t = src.length > 400000 ? src.slice(0, 400000) : src;
  const i = t.search(/\\begin\s*\{document\}/);
  return strip(i < 0 ? t.slice(0, 200000) : t.slice(0, i));
}
const optList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

// The document's language as babel or polyglossia set it (its name, '' where nothing does): babel's
// main= or its last language (the class's options count, before the package's), polyglossia's
// \setdefaultlanguage or \setmainlanguage; with the variant polyglossia gives English.
export function mainLanguage(src) {
  const pre = preambleOf(src || '');
  const poly = /\\set(?:default|main)language\s*(?:\[([^\]]{0,300})\])?\s*\{\s*([A-Za-z-]{1,30})\s*\}/.exec(pre);
  if (poly) {
    const v = /variant\s*=\s*([a-z]+)/i.exec(poly[1] || '');
    return { name: poly[2].toLowerCase(), variant: v ? v[1] : '' };
  }
  const cls = /\\documentclass\s*(?:\[([^\]]{0,2000})\])?/.exec(pre);
  const all = cls && cls[1] ? optList(cls[1]) : [];
  let babel = false;
  for (const m of pre.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]{0,2000})\])?\s*\{([^}]{0,500})\}/g)) {
    if (!m[2].split(',').some((p) => p.trim() === 'babel')) continue;
    babel = true;
    if (m[1]) all.push(...optList(m[1]));
  }
  const prov = /\\babelprovide\s*\[([^\]]{0,500})\]\s*\{\s*([A-Za-z-]{1,30})\s*\}/.exec(pre);
  if (prov && /(^|,)\s*main\s*(,|$)/.test(prov[1])) return { name: prov[2].toLowerCase(), variant: '' };
  if (!babel) return { name: '', variant: '' };
  const main = all.map((o) => /^main\s*=\s*([A-Za-z-]+)$/.exec(o)).filter(Boolean).pop();
  if (main) return { name: main[1].toLowerCase(), variant: '' };
  const langs = all.filter((o) => !o.includes('=') && KNOWN.test(o.toLowerCase()) && !/^(a4|a5|b5)$/.test(o));
  return { name: langs.length ? langs[langs.length - 1].toLowerCase() : '', variant: '' };
}

// a file that switches language somewhere (most switch nowhere: no parse for them)
const SWITCHES = /\\(?:selectlanguage|foreignlanguage|begin\s*\{\s*(?:otherlanguage\*?|english|british|american|german|ngerman|spanish|french|italian|portuguese|dutch)\s*\}|text(?:english|british|american|german|ngerman|spanish|french|italian|portuguese|dutch)\b)/;
const POLY = /^(english|british|american|german|ngerman|spanish|french|italian|portuguese|dutch)$/;

// The ranges of a file's source in another language than the document's: [[s, e, name]], sorted,
// from babel's \selectlanguage (to the end of its group or environment), otherlanguage and
// otherlanguage*, \foreignlanguage, and polyglossia's \text<language> and its environments.
const spanCache = new Map();
export function languageSpans(src) {
  if (!src || !SWITCHES.test(src)) return [];
  const hit = spanCache.get(src);
  if (hit) return hit;
  let tree;
  try { tree = parse(src); } catch (e) { return []; }
  const out = [];
  const arg = (a) => (a ? src.slice(a.is, a.ie).trim().toLowerCase() : '');
  const mark = (s, e, lang) => {
    if (!lang || e <= s) return;
    const L = out[out.length - 1];
    if (L && L[2] === lang && L[1] >= s) { L[1] = Math.max(L[1], e); return; }
    out.push([s, e, lang]);
  };
  const walk = (nodes, lang, depth) => {
    if (!nodes || depth > 200) return;
    let cur = lang;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.t === 'text') { mark(n.s, n.e, cur); continue; }
      if (n.t === 'cmd') {
        if (n.name === 'selectlanguage') { cur = arg(n.args && n.args[0]) || cur; continue; }
        if (n.name === 'foreignlanguage' && n.args && n.args[2]) { walk(n.args[2].nodes, arg(n.args[1]) || cur, depth + 1); continue; }
        const poly = /^text([a-z]+)$/.exec(n.name);
        if (poly && POLY.test(poly[1])) {
          const a = (n.args || []).find((x) => x && !x.o);
          if (a) walk(a.nodes, poly[1], depth + 1);
          else if (nodes[i + 1] && nodes[i + 1].t === 'group') { walk(nodes[i + 1].nodes, poly[1], depth + 1); i++; }
          continue;
        }
        for (const a of n.args || []) if (a && a.nodes) walk(a.nodes, cur, depth + 1);
        continue;
      }
      if (n.t === 'env') {
        let l = cur;
        if (n.name === 'otherlanguage' || n.name === 'otherlanguage*') l = arg(n.args && n.args[0]) || cur;
        else if (POLY.test(n.name)) l = n.name;
        walk(n.nodes, l, depth + 1);
        continue;
      }
      if (n.t === 'group') walk(n.nodes, cur, depth + 1);
    }
  };
  walk(tree, '', 0);
  if (spanCache.size > 8) spanCache.clear();
  spanCache.set(src, out);
  return out;
}

// The ranges of a file that are code the page may still show as text: the environments of
// drawing and listing programs (Asymptote, gnuplot, PSTricks, TikZ, listings), whose contents
// are no prose. A bounded scan of \begin and \end, no parse; cached for the text.
const CODE_ENVS = 'asy|asydef|asyinclude|gnuplot|gnuplottex|pspicture\\*?|psgraph|tikzpicture|axis|lstlisting|minted|verbatim\\*?|Verbatim|BVerbatim|LVerbatim|comment|filecontents\\*?|alltt|python|pycode|sagesilent|sageblock|luacode\\*?|code';
const CODE_BEGIN = new RegExp('\\\\begin\\s*\\{(' + CODE_ENVS + ')\\}', 'g');
const codeCache = new Map();
export function codeSpans(src) {
  if (!src || src.indexOf('\\begin') < 0) return [];
  const hit = codeCache.get(src);
  if (hit) return hit;
  const out = [];
  CODE_BEGIN.lastIndex = 0;
  let m;
  while ((m = CODE_BEGIN.exec(src)) && out.length < 10000) {
    const end = '\\end{' + m[1] + '}';
    const e = src.indexOf(end, m.index + m[0].length);
    const stop = e < 0 ? src.length : e + end.length;
    out.push([m.index, stop, 'code']);
    CODE_BEGIN.lastIndex = stop;
  }
  if (codeCache.size > 8) codeCache.clear();
  codeCache.set(src, out);
  return out;
}

// the language of source position p of a file's spans (or '' for the document's)
export function langAt(spans, p) {
  let lo = 0, hi = spans.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (spans[m][1] <= p) lo = m + 1; else hi = m; }
  return lo < spans.length && spans[lo][0] <= p ? spans[lo][2] : '';
}

// ---- the document's own words ------------------------------------------------------------------

// `% rikuy: words foo bar` lines (Rikuy's Add to Dictionary writes them) and cspell's in document
// lists (`% cspell:words …`, `% cspell:ignore …`, any case), read from every .tex of the project
const LIST_LINE = /^[ \t]*%[ \t]*(?:rikuy:[ \t]*words|c[sS]pell:[ \t]*(?:words|ignore))\b([^\n]*)/gm;
export function listedWords(src) {
  const out = new Set();
  if (!src || src.indexOf('words') < 0 && !/c[sS]pell/.test(src)) return out;
  const t = src.length > 2000000 ? src.slice(0, 2000000) : src;
  for (const m of t.matchAll(LIST_LINE)) for (const w of m[1].split(/[\s,]+/)) if (w && w.length <= MAX_WORD) out.add(w.replace(/’/g, "'"));
  return out;
}

const RIKUY_LINE = /^[ \t]*%[ \t]*rikuy:[ \t]*words\b[^\n]*/gm;
// The edit that adds a word to the main file's list: at the end of the last `% rikuy: words`
// line while it is short, else a new line after it, else a new line before \begin{document}
// (at the top of a file without one). The file's line ends are kept.
export function addWordEdit(src, word) {
  const w = String(word || '').trim();
  if (!w || /[\s%\\{}]/.test(w) || w.length > MAX_WORD) return null;
  const nl = /\r\n/.test(src) ? '\r\n' : '\n';
  let last = null;
  for (const m of src.matchAll(RIKUY_LINE)) last = m;
  if (last) {
    let end = last.index + last[0].length;
    if (src[end - 1] === '\r') end--;
    if (last[0].length < 90) return { s: end, e: end, t: ' ' + w };
    return { s: end, e: end, t: nl + '% rikuy: words ' + w };
  }
  const b = /^[ \t]*\\begin\s*\{document\}/m.exec(src);
  const at = b ? b.index : 0;
  return { s: at, e: at, t: '% rikuy: words ' + w + nl };
}

// The edits that take a word off the lists Rikuy writes (`% rikuy: words`); a line left with no
// word goes with its line end
export function removeWordEdits(src, word) {
  const out = [];
  for (const m of src.matchAll(RIKUY_LINE)) {
    const line = m[0].replace(/\r$/, '');
    const head = /^[ \t]*%[ \t]*rikuy:[ \t]*words/.exec(line)[0];
    const rest = line.slice(head.length).split(/\s+/).filter(Boolean);
    if (!rest.includes(word)) continue;
    const keep = rest.filter((x) => x !== word);
    if (keep.length) out.push({ s: m.index + head.length, e: m.index + line.length, t: ' ' + keep.join(' ') });
    else {
      let e = m.index + line.length;
      if (src[e] === '\r') e++;
      if (src[e] === '\n') e++;
      out.push({ s: m.index, e, t: '' });
    }
  }
  return out;
}

// ---- the whole plan --------------------------------------------------------------------------

// What to check in a project: the runs of prose, every occurrence {r, i, j, q, dict} of a word
// (run r's text from i to j, asked of dictionary dict as q), and per dictionary the distinct
// words asked. Words of a language Rikuy has no dictionary for are counted in skipped by
// language and not checked; words on the document's lists are not checked either.
// project: {files (Map), main}; model: its buildModel result
//
// A block the model built again unchanged (the same key: its file, its source text, what it
// holds) is not walked again: its runs and words are kept, their places relative to the block's
// start, so typing in one paragraph reads that paragraph alone.
const blockCache = new Map();
function blockEntry(B) {
  const hit = B.key != null ? blockCache.get(B.key) : null;
  if (hit) return hit;
  const runs = blockRuns(B);
  const own = runs.every((r) => r.f === B.f);
  const toks = [];
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    if (own) for (let k = 0; k < run.map.length; k++) if (run.map[k] >= 0) run.map[k] -= B.s;
    for (const t of wordsIn(run.text)) toks.push({ r, i: t.i, j: t.j, q: asked(t.w), w: t.w });
  }
  const E = { runs, toks, rel: own };
  if (B.key != null && own) {
    if (blockCache.size > 4000) blockCache.clear();
    blockCache.set(B.key, E);
  }
  return E;
}
export function spellPlan(model, project, o = {}) {
  const main = project.files.get(project.main) || '';
  const ml = mainLanguage(main);
  const base = dictOf(ml.name, ml.variant);
  const docDict = base === '' ? (o.fallback || 'en_US') : base;
  const listed = new Set();
  for (const [n, t] of project.files) if (n === project.main || /\.tex$/i.test(n)) for (const w of listedWords(t)) listed.add(w);
  const spans = new Map();
  const occ = [];
  const words = new Map();
  const skipped = new Map();
  const runs = [];
  for (const B of model.blocks || []) {
    const E = blockEntry(B);
    const r0 = runs.length, off = E.rel ? B.s : 0;
    for (const run of E.runs) runs.push(off ? { f: run.f, text: run.text, map: run.map, off } : run);
    for (const t of E.toks) {
      const run = E.runs[t.r];
      let dict = docDict;
      if (!spans.has(run.f)) { const t0 = project.files.get(run.f) || ''; spans.set(run.f, [languageSpans(t0), codeSpans(t0)]); }
      const [sp, code] = spans.get(run.f);
      if (sp.length || code.length) {
        let x = t.i;
        while (x < t.j && run.map[2 * x] < 0) x++;
        const p = x < t.j ? run.map[2 * x] + off : -1;
        if (code.length && p >= 0 && langAt(code, p)) continue;
        const lang = sp.length && p >= 0 ? langAt(sp, p) : '';
        if (lang) dict = dictOf(lang);
        if (!dict) { skipped.set(lang, (skipped.get(lang) || 0) + 1); continue; }
      }
      if (listed.size && (listed.has(t.q) || listed.has(t.w))) continue;
      occ.push({ r: r0 + t.r, i: t.i, j: t.j, q: t.q, dict });
      let set = words.get(dict);
      if (!set) words.set(dict, (set = new Set()));
      set.add(t.q);
    }
  }
  return { runs, occ, words, skipped, dict: docDict, lang: ml.name || '', listed };
}

// An occurrence's place in the source: {f, s, e, parts (each character's range, joined where
// they touch), w (as written)}, or null where none of it is the source's own
export function occSource(plan, x) {
  const run = plan.runs[x.r], off = run.off || 0;
  const parts = [];
  for (let k = x.i; k < x.j; k++) {
    if (run.map[2 * k] < 0) continue;
    const a = run.map[2 * k] + off, b = run.map[2 * k + 1] + off;
    if (a < 0 || b <= a) continue;
    const L = parts[parts.length - 1];
    if (L && L[1] === a) L[1] = b; else parts.push([a, b]);
  }
  if (!parts.length) return null;
  return { f: run.f, s: parts[0][0], e: parts[parts.length - 1][1], parts, w: run.text.slice(x.i, x.j) };
}
