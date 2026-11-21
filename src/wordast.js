// Rikuy's page, as a Word document: the model (src/model.js) walked into pandoc's document tree
// (its JSON form), which pandoc writes as .docx with native Word equations (OMML). Everything the
// page shows goes in as the page shows it (numbers, cross references, citations), so the Word file
// reads like the typeset page; what the page cannot draw (TikZ, a raw environment) becomes a
// picture of it when one is given, else a line naming it.
//
// Each paragraph, heading, caption, table cell and footnote is wrapped in a span with an id, which
// pandoc writes as a Word bookmark (Rk1, Rk2, ...) around the paragraph's text. Alongside it goes
// what the paragraph says, character by character, and for each character the source range that
// made it (a seg's map), or that it is generated (a theorem's head, a section number), or which
// atom it is part of (an equation, a citation, a footnote mark). That is what brings a coauthor's
// edits in Word back into the .tex (src/wordsync.js).
import { findComments } from './share.js';
import { texToPlain } from './bib.js';
import { readIndexArg } from './refsrc.js';
import { rtlDocument } from './scripts.js';
import { bidiDoc, dirSpan, hasRtl, scanDir } from './wordbidi.js';
import { parseKV } from './preamble.js';
import { unescapeAlt } from './picture.js';
import { tableAlt, formulasOf } from './table.js';
import { sectionRuns, sectionType } from './pageword.js';

export const API = [1, 23, 1, 2];
const OBJ = '\uFFFC';
const RO = -1, ATOM = -2;

const Str = (s) => ({ t: 'Str', c: s });
const attr = (id = '', cls = [], kv = []) => [id, cls, kv];

// links leave only as web or mail addresses: a document may be a stranger's, and Word opens
// what a link says when it is clicked
export function safeUrl(u) {
  let s = String(u || '').trim();
  if (!s) return null;
  if (s.startsWith('#')) return s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try { const x = new URL(s); return /^(https?|mailto|ftp):$/.test(x.protocol) ? x.href : null; } catch (e) { return null; }
}

// the fonts Word has for the page's looks (src/charfmt.js FONTS), by the name of their style
export const WORD_FONTS = { times: 'Times New Roman', palatino: 'Palatino Linotype', sans: 'Arial', charter: 'Charter', schola: 'Century Schoolbook', bookman: 'Bookman Old Style', mono: 'Courier New' };
// A colour as Word writes one (RRGGBB): a hex value, one of xcolor's base names, or "red!40"
// (mixed with white, as xcolor does); null for a name only the document's preamble knows.
const XCOLOR = { red: 'FF0000', green: '00FF00', blue: '0000FF', cyan: '00FFFF', magenta: 'FF00FF', yellow: 'FFFF00', black: '000000', white: 'FFFFFF', gray: '808080', grey: '808080', darkgray: '404040', lightgray: 'BFBFBF', brown: 'BF8040', lime: 'BFFF00', olive: '808000', orange: 'FF8000', pink: 'FFBFBF', purple: 'BF0040', teal: '008080', violet: '800080' };
export function wordColor(c) {
  c = String(c || '').trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(c)) return c.replace('#', '').toUpperCase();
  const m = /^([A-Za-z]+)(?:!(\d{1,3}))?$/.exec(c);
  // a name is the document's text: "constructor" is no colour, though every object has one
  const base = m && Object.hasOwn(XCOLOR, m[1].toLowerCase()) && XCOLOR[m[1].toLowerCase()];
  if (!base) return null;
  const k = m[2] == null ? 1 : Math.min(100, +m[2]) / 100;
  return [0, 2, 4].map((i) => Math.round(parseInt(base.slice(i, i + 2), 16) * k + 255 * (1 - k)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// A numbered list's style as pandoc names it, from the label the page shows on its first item:
// "(a)", "i)", "3."
export function listStyle(label) {
  const m = /^(\()?([a-z]|[A-Z]|\d{1,4})([.)])?$/.exec(String(label || '').trim());
  if (!m) return [1, { t: 'DefaultStyle' }, { t: 'DefaultDelim' }];
  const x = m[2];
  const style = /\d/.test(x) ? 'Decimal' : x === 'i' ? 'LowerRoman' : x === 'I' ? 'UpperRoman' : x === x.toLowerCase() ? 'LowerAlpha' : 'UpperAlpha';
  const start = /\d/.test(x) ? +x : /Roman/.test(style) ? 1 : x.toLowerCase().charCodeAt(0) - 96;
  return [Math.max(1, start), { t: style }, { t: m[1] && m[3] === ')' ? 'TwoParens' : m[3] === ')' ? 'OneParen' : m[3] === '.' ? 'Period' : 'DefaultDelim' }];
}

// ---- user macros in math -------------------------------------------------------------------

// pandoc turns TeX into Word's equations (texmath), which knows no \newcommand of the document's:
// the project's macros (as the model collected them for KaTeX) are expanded first, so custom
// notation (\R, \E, \argmax) comes out as what it means.
export function expandMath(tex, macros) {
  if (!macros || !Object.keys(macros).length) return tex;
  const toks = tokenize(tex);
  const out = [];
  let budget = 20000;
  while (toks.length) {
    const t = toks.shift();
    const m = /^\\[A-Za-z]+$/.test(t) ? macros[t] : undefined;
    if (m === undefined || budget-- <= 0) { out.push(t); continue; }
    const def = typeof m === 'string' ? { body: m, nargs: maxArg(m), dflt: null } : { body: m.body, nargs: m.nargs || 0, dflt: m.opt ? m.dflt : null };
    const args = [];
    let k = 0;
    if (def.dflt != null) {
      while (toks.length && /^\s+$/.test(toks[0])) toks.shift();
      if (toks[0] === '[') {
        toks.shift();
        const a = [];
        let d = 0;
        while (toks.length && !(d === 0 && toks[0] === ']')) { const x = toks.shift(); if (x === '{') d++; if (x === '}') d--; a.push(x); }
        toks.shift();
        args.push(a.join(''));
      } else args.push(def.dflt);
      k = 1;
    }
    for (; k < def.nargs; k++) {
      while (toks.length && /^\s+$/.test(toks[0])) toks.shift();
      if (!toks.length) { args.push(''); continue; }
      if (toks[0] === '{') {
        toks.shift();
        const a = [];
        let d = 0;
        while (toks.length && !(d === 0 && toks[0] === '}')) { const x = toks.shift(); if (x === '{') d++; if (x === '}') d--; a.push(x); }
        toks.shift();
        args.push(a.join(''));
      } else args.push(toks.shift());
    }
    let body = def.body.replace(/#(#|\d)/g, (s, d) => (d === '#' ? '#' : args[+d - 1] ?? ''));
    // a control word followed by a letter would merge with it
    if (/\\[A-Za-z]+$/.test(body) && toks.length && /^[A-Za-z]/.test(toks[0])) body += ' ';
    toks.unshift(...tokenize(body));
  }
  return out.join('');
}
function maxArg(b) { let n = 0; b.replace(/#(\d)/g, (s, d) => { n = Math.max(n, +d); return s; }); return n; }
function tokenize(s) { return s.match(/\\[A-Za-z]+|\\.|\s+|[\s\S]/g) || []; }

// texmath has no colour: one \textcolor in a formula and pandoc gave the whole formula up,
// writing its TeX into the Word file as text. The colour goes, the formula stays an equation.
export function uncolor(tex) {
  if (!/\\(textcolor|color|colorbox)\b/.test(tex)) return tex;
  return tex.replace(/\\(textcolor|colorbox|color)\s*(?:\[[^\]{}]*\])?\s*\{[^{}]*\}/g, '');
}

// \tag{n} that the model puts on numbered rows: texmath drops \tag without a word, so the number
// goes after the formula as Word shows it, \qquad (n)
export function numberRows(tex) {
  return tex.replace(/\s*\\tag\*?\{([^}]*)\}/g, (m, n) => '\\qquad (' + n + ')');
}

// ---- the walk ---------------------------------------------------------------------------------

// model, files (Map name -> text) -> { doc, anchors, atoms, images, notes, warnings }
//  opts.asset(name): the project file an \includegraphics name refers to, or null
//  opts.rasters: Map 'file:offset' -> picture file name, for blocks the page cannot draw
//  opts.citeproc: citations become pandoc citations (else the page's own text)
//  opts.comments: Rikuy's comment threads become Word comments
//  opts.main: the main file's name (its preamble says whether the document runs right to left)
// (B2) A paragraph's own settings as the name of a paragraph style, Word's way of giving one its
// formatting through pandoc: "Centred", "Right Aligned", "Left Aligned", then ", Line Spacing 1.5",
// ", Indent 1cm 0cm", ", Hanging 1cm", ", Keep With Next", ", Keep Lines Together". exportDocx
// (src/wordjobs.js, paraStyles) gives each such style its formatting from its name. Line spacing:
// setspace's one and a half and double spacing are Word's 1.5 lines and Double, any other stretch
// its multiple.
const ONEHALF_AT = { 10: 1.25, 11: 1.213, 12: 1.241 }, DOUBLE_AT = { 10: 1.667, 11: 1.618, 12: 1.655 };
export function paraStyle(it, O = {}) {
  const parts = [];
  if (it.align === 'center') parts.push('Centred');
  else if (it.align === 'right') parts.push('Right Aligned');
  else if (it.align === 'left') parts.push('Left Aligned');
  if (it.spread) {
    const pt = O.pt || 10, x = Math.abs(it.spread - (ONEHALF_AT[pt] || 1.25)) < 0.005 ? 1.5 : Math.abs(it.spread - (DOUBLE_AT[pt] || 1.667)) < 0.005 ? 2 : Math.round(it.spread * 100) / 100;
    parts.push('Line Spacing ' + x);
  }
  const cm = (v) => Math.round(v / 28.4528 * 100) / 100 + 'cm';
  if (it.mx && (it.mx[0] || it.mx[1])) parts.push('Indent ' + cm(it.mx[0]) + ' ' + cm(it.mx[1]));
  if (it.hang) parts.push('Hanging ' + cm(it.hang));
  if (it.keepNext) parts.push('Keep With Next');
  if (it.keepLines) parts.push('Keep Lines Together');
  // (R1) lineno's nolinenumbers: Word's Suppress line numbers
  if (it.noLn) parts.push('No Line Numbers');
  return parts.join(', ');
}

// (R3) text and attributes in Word's XML, and a form field's content control
const xmlText = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function sdtXml(x, ph) {
  const items = (x.choices || []).slice(0, 50).map((c) => '<w:listItem w:displayText="' + xmlText(c) + '" w:value="' + xmlText(c) + '" />').join('');
  const kind = x.kind === 'date' ? '<w:date><w:dateFormat w:val="dd/MM/yyyy" /><w:lid w:val="en-GB" /><w:storeMappedDataAs w:val="dateTime" /><w:calendar w:val="gregorian" /></w:date>'
    : x.kind === 'list' ? '<w:dropDownList>' + items + '</w:dropDownList>' : x.kind === 'combo' ? '<w:comboBox>' + items + '</w:comboBox>' : '<w:text />';
  return '<w:sdt><w:sdtPr><w:tag w:val="rikuy-' + x.kind + '" />' + kind + '</w:sdtPr><w:sdtContent><w:r><w:t xml:space="preserve">' + xmlText(ph) + '</w:t></w:r></w:sdtContent></w:sdt>';
}

export function buildWordDoc(model, files, opts = {}) {
  const W = new Walker(model, files, opts);
  W.run();
  return W.result();
}

class Walker {
  constructor(model, files, opts) {
    this.m = model; this.files = files; this.o = opts;
    this.anchors = []; this.atoms = []; this.images = new Set(); this.warnings = []; this.degraded = new Map();
    this.n = 0; this.A = null; this.meta = {};
    this.cmarks = null; // source offset -> comment marks to emit (second pass)
    this.ncomments = 0;
    // (R2) each bullet or numbered list in the order pandoc numbers them (its numIds): the bullet the
    // page drew, null for a numbered one, for src/wordjobs.js to give Word the same bullets
    this.lists = [];
    // Direction. The document's comes from the model when it says one, else from the preamble
    // (src/scripts.js); a block's or a stretch of text's from the model when the node says one
    // (dir: 'rtl' or 'ltr'), else from the wrappers around it in the source (src/wordbidi.js).
    const dir = model.opts && model.opts.dir;
    const main = opts.main || (files.has('main.tex') ? 'main.tex' : [...files.keys()].find((f) => /\\begin\s*\{document\}/.test(files.get(f) || '')));
    this.rtl = opts.rtl != null ? !!opts.rtl : dir === 'rtl' || dir === 'ltr' ? dir === 'rtl' : rtlDocument(files.get(main) || '');
    this.scans = new Map();
    this.bidi = this.rtl;
  }

  // the wrappers of a source file that set a direction, or null when it has none
  scan(f) {
    if (!this.scans.has(f)) this.scans.set(f, scanDir(this.files.get(f) || ''));
    return this.scans.get(f);
  }

  run() {
    // pass 1 finds the text each anchor holds; pass 2 places comments on the words they quote,
    // and the changes waiting as Word's tracked changes (trackMarks)
    this.blocks = this.walk();
    if (this.o.comments !== false || (this.o.changes && this.o.changes.length)) {
      const marks = this.o.comments !== false ? this.commentMarks() : new Map();
      this.trackMarks(marks);
      if (marks.size) {
        this.cmarks = marks;
        this.anchors = []; this.atoms = []; this.images = new Set(); this.warnings = []; this.degraded = new Map(); this.n = 0; this.meta = {}; this.lists = [];
        this.blocks = this.walk();
      }
    }
  }

  result() {
    let doc = { 'pandoc-api-version': API, meta: this.metaOut(), blocks: this.blocks };
    // only a document with right to left text in it, or a wrapper that sets a direction
    if (this.bidi) doc = bidiDoc(doc, new Map(this.anchors.filter((A) => A.dir).map((A) => [A.id, A.dir])), this.rtl);
    const deg = [...this.degraded.entries()].map(([k, n]) => k + (n > 1 ? ' (' + n + ')' : ''));
    return { doc, anchors: this.anchors.map(packAnchor), atoms: this.atoms, images: [...this.images], warnings: this.warnings, degraded: deg, comments: this.ncomments, rtl: this.rtl, bullets: this.lists, tracked: this.tracked || 0 };
  }

  plainMath(tex) {
    const t = uncolor(tex);
    if (t !== tex) this.degrade('a formula without its colours');
    return t;
  }

  degrade(what) { this.degraded.set(what, (this.degraded.get(what) || 0) + 1); }

  walk() {
    const out = [];
    const units = this.m.blocks;
    // (R1) where a part in columns or on landscape pages begins and ends, the section before it ends
    // (src/pageword.js sectionRuns; src/wordpage.js gives each its sheet, margins and the rest)
    const runs = sectionRuns(this.m), at = new Map(runs.map((r, j) => [r.i, j]));
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const items = u.items;
      const j = at.get(i);
      if (j > 0) {
        const R = runs[j - 1], type = sectionType(runs, j - 1);
        out.push({ t: 'RawBlock', c: ['openxml', '<w:p><w:pPr><w:sectPr>' + (type ? '<w:type w:val="' + type + '"/>' : '') + (R.kind === 'L' ? '<w:pgSz w:orient="landscape"/>' : '') + (R.kind[0] === 'C' ? '<w:cols w:num="' + +R.kind.slice(1) + '"/>' : '') + '</w:sectPr></w:pPr></w:p>'] });
      }
      if (items.length && items[0].type === 'h' && items[0].level === 'abs') { this.abstract(items.slice(1), u); continue; }
      // a list: its items, flat in the model, become nested Word lists; also one that stands
      // among paragraphs in an environment the model reads as one block (otherlanguage, small)
      if (items.some((x) => x.type === 'p' && x.li && !x.li.cont)) { out.push(...this.list(items, u)); continue; }
      const from = out.length;
      for (const it of items) out.push(...this.item(it, u));
      this.indexMarks(u, out, from);
    }
    return out;
  }

  // ---- R4: the index, the Table of Authorities and the lists of figures and tables as Word's
  // fields. Each \index stands as an XE field (\index[toa] a TA field) at the end of the paragraph
  // it is in: Word gives it that paragraph's page. \printindex is an INDEX field, \printindex[toa]
  // a TOA field for each category, \listoffigures a TOC field of the caption style; each holds
  // what the page shows, and Word fills in the page numbers when its fields are updated (F9; the
  // fields are marked to be updated as the file opens).
  indexMarks(u, out, from) {
    if (!this.ixBy) {
      this.ixBy = new Map();
      for (const x of (this.m.indexEntries || []).slice(0, 20000)) { const k = x.f; if (!this.ixBy.has(k)) this.ixBy.set(k, []); this.ixBy.get(k).push(x); }
    }
    const list = this.ixBy.get(u.f);
    if (!list || !list.length) return;
    const mine = list.filter((x) => !x.done && x.s >= u.s && x.s < u.e);
    if (!mine.length) return;
    // (the last paragraph this unit gave: its runs take the fields)
    let target = null;
    const last = (b) => { if (!b) return null; if (b.t === 'Para' || b.t === 'Plain' || b.t === 'Header') return b; if (b.t === 'Div') return last(b.c[1][b.c[1].length - 1]); if (b.t === 'BlockQuote') return last(b.c[b.c.length - 1]); return null; };
    for (let k = out.length - 1; k >= from && !target; k--) target = last(out[k]);
    if (!target) return;
    const inl = target.t === 'Header' ? target.c[2] : target.c;
    for (const x of mine) {
      x.done = true;
      const code = fieldOfIndex(x);
      if (code) inl.push({ t: 'RawInline', c: ['openxml', fieldRuns(code)] });
    }
  }
  indexField(it) {
    const out = [{ t: 'Header', c: [this.m.opts.chapters ? 1 : 1, attr(), [Str(it.head)]] }];
    if (/^table of authorities$/i.test(it.head) || it.key && /:ixtoa$/.test(it.key)) {
      // (a TOA field each category, in the order the index sorts them)
      let cat = null, rows = [];
      const flush = () => { if (cat) out.push({ t: 'RawBlock', c: ['openxml', fieldParas('TOA \\h \\c "' + cat.rank + '" \\p', [cat.text, ...rows])] }); rows = []; };
      for (const r of it.rows) {
        if (r.lvl === 0) { flush(); const m = /^(\d{1,2})$/.exec(String(r.sort || '')); cat = { rank: r.rank || (m ? m[1] : String(TOA_RANK(r.text))), text: r.text }; } else if (cat) rows.push(r.text);
      }
      flush();
      return out;
    }
    const cols = Math.max(1, Math.min(4, it.cols || 2));
    out.push({ t: 'RawBlock', c: ['openxml', fieldParas('INDEX \\c "' + cols + '"' + (it.right ? ' \\e "\t"' : '') + ' \\h "A"', it.rows.map((r) => (r.lvl ? '\u2003'.repeat(Math.min(2, r.lvl)) : '') + r.text), it.right)] });
    return out;
  }
  lofField(it) {
    const style = it.lof === 'table' ? 'Table Caption' : 'Image Caption';
    return [{ t: 'Header', c: [1, attr(), [Str(it.head)]] },
      { t: 'RawBlock', c: ['openxml', fieldParas('TOC \\h \\z \\t "' + style + ',1"', (it.entries || []).map((e) => (e.num ? e.num + ' ' : '') + e.text), true)] }];
  }

  // ---- anchors --------------------------------------------------------------------------------

  begin(kind, f, s, e, extra) {
    const id = 'Rk' + (++this.n);
    const A = { id, kind, f, s, e, text: '', map: [], ins: null, ...extra };
    this.anchors.push(A);
    const prev = this.A;
    this.A = A;
    return { A, end: () => { this.A = prev; } };
  }
  ch(t, f, s, e) {
    const A = this.A;
    if (!this.bidi && hasRtl(t)) this.bidi = true;
    if (!A) return;
    A.text += t;
    for (let i = 0; i < t.length; i++) A.map.push(s, e);
    if (f && A.f && f !== A.f) A.mixed = true;
  }
  ro(t) { const A = this.A; if (!this.bidi && hasRtl(t)) this.bidi = true; if (!A) return; A.text += t; for (let i = 0; i < t.length; i++) A.map.push(RO, RO); }
  atomText(t, ai) { const A = this.A; if (!this.bidi && hasRtl(t)) this.bidi = true; if (!A) return; A.text += t; for (let i = 0; i < t.length; i++) A.map.push(ATOM, ai); }
  atom(a) { this.atoms.push(a); return this.atoms.length - 1; }

  wrap(kind, f, s, e, build, extra) {
    const { A, end } = this.begin(kind, f, s, e, extra);
    let inl;
    try { inl = build(A); } finally { end(); }
    // the block's direction, where it is not the document's: the model's word, else the
    // environment or language switch its first character stands in
    if (A.dir !== 'rtl' && A.dir !== 'ltr') {
      const p = A.ins != null ? A.ins : A.s;
      const S = p != null && A.f ? this.scan(A.f) : null;
      A.dir = (S && S.block(p)) || null;
    }
    if (A.dir && A.dir !== (this.rtl ? 'rtl' : 'ltr')) this.bidi = true;
    return [{ t: 'Span', c: [attr(A.id), merge(inl)] }];
  }

  // ---- blocks ---------------------------------------------------------------------------------

  item(it, u) {
    switch (it.type) {
      case 'p': return [this.para(it, u)];
      case 'h': return this.heading(it, u);
      case 'math': return [this.display(it)];
      case 'float': return this.float(it, u);
      case 'title': this.title(it, u); return [];
      case 'refs': return this.refs(it);
      case 'raw': return this.raw(it);
      // a LaTeX paragraph goes as the page shows it, its source as code (src/styles.js)
      case 'tex': return this.code(it, 'tex', it.ie);
      // (R4: a list of figures or tables is Word's own, a TOC field of the caption style, filled as
      // the page lists them; the index, a Table of Authorities and the endnotes' place below)
      case 'toc': if (it.lof) return this.lofField(it); this.toc = true; return [];
      case 'idx': return it.notes ? [] : this.indexField(it);
      case 'pagebreak': return [{ t: 'RawBlock', c: ['openxml', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'] }];
      case 'rule': return [{ t: 'HorizontalRule' }];
      default: return [];
    }
  }

  para(it, u, plain, kind = 'p') {
    const fns = u ? u.fns : [];
    const inl = this.wrap(kind, it.f, u ? u.s : null, u ? u.e : null, () => {
      const out = [];
      if (it.label && it.labelKind === 'bib') { out.push(...this.inl(it.label, fns)); out.push(Str(' ')); this.ro(' '); }
      if (it.lead) out.push(...this.inl(it.lead, fns));
      out.push(...this.inl(it.inl, fns));
      if (it.tail) { out.push(Str(' ')); this.ro(' '); out.push(...this.inl(it.tail, fns)); }
      return out;
    }, { top: !!(u && u.items.length === 1 && it === u.items[0] && !it.li && !it.lead), after: u ? u.e : null, dir: it.dir || (u && u.dir) });
    let b = { t: plain ? 'Plain' : 'Para', c: inl };
    // centred and right aligned text keeps its place: a paragraph style of that name, which
    // exportDocx (src/wordjobs.js) gives its alignment
    if (!plain) { const st = paraStyle(it, this.m.opts); if (st) b = { t: 'Div', c: [attr('', [], [['custom-style', st]]), [b]] }; }
    if (/\bquote\b/.test(it.cls || '')) b = { t: 'BlockQuote', c: [b] };
    return b;
  }

  heading(it, u) {
    let level = it.level;
    if (level === 'abs') return [];
    level = this.m.opts.chapters ? level + 1 : level;
    level = Math.max(1, Math.min(6, level < 1 ? 1 : level));
    const inl = this.wrap('h', it.f, u.s, u.e, () => {
      const out = [];
      const num = it.chapLabel ? it.chapLabel + (it.num ? ' ' + it.num : '') : it.num;
      if (num) { const t = num + (it.chapLabel ? ': ' : ' '); out.push(Str(t)); this.ro(t); }
      out.push(...this.inl(it.inl, u.fns));
      return out;
    }, { after: u.e, dir: it.dir || u.dir });
    return [{ t: 'Header', c: [level, attr(), inl] }];
  }

  display(it) {
    const tex = numberRows(this.plainMath(expandMath(it.tex, this.m.mathMacros)));
    const ai = this.atom({ k: 'math', f: it.f, s: it.s, e: it.e, is: it.is, ie: it.ie, disp: true, env: it.env || '', tags: it.tags || [] });
    const inl = this.wrap('math', it.f, it.s, it.e, () => { this.atomText(OBJ, ai); return [{ t: 'Math', c: [{ t: 'DisplayMath' }, tex] }]; }, { after: it.e });
    return { t: 'Para', c: inl };
  }

  float(it, u) {
    const out = [];
    for (const p of it.parts) {
      if (p.type === 'p') out.push(this.para(p, u));
      else if (p.type === 'caption') {
        // (R4: a float of the document's own under its name, the number alone, or none for \caption*)
        const name = p.lab != null ? p.lab : { figure: 'Figure', table: 'Table' }[p.kind] || p.kind;
        const lab = p.star ? '' : (name ? name + (p.num ? ' ' + p.num : '') : p.num || '') + ': ';
        const inl = this.wrap('cap', p.f, null, null, () => { this.ro(lab); return [Str(lab), ...this.inl(p.inl, u.fns)]; }, { after: u.e, dir: p.dir || it.dir || u.dir });
        out.push({ t: 'Div', c: [attr('', [], [['custom-style', p.kind === 'table' ? 'Table Caption' : 'Image Caption']]), [{ t: 'Para', c: inl }]] });
      } else if (p.type === 'tabular') out.push(this.table(p, u));
      else if (p.type === 'math') out.push(this.display(p));
      else if (p.type === 'h') out.push(this.para({ ...p, type: 'p' }, u));
    }
    return out;
  }

  table(t, u) {
    const ncol = Math.max(1, t.cols.length, ...t.rows.map((r) => r.cells.reduce((n, c) => n + (c.span || 1), 0)));
    const AL = { l: 'AlignLeft', c: 'AlignCenter', r: 'AlignRight', p: 'AlignLeft' };
    const specs = Array.from({ length: ncol }, (_, i) => [{ t: AL[(t.cols[i] || {}).align] || 'AlignDefault' }, { t: 'ColWidthDefault' }]);
    const rows = t.rows.filter((r) => !r.empty && r.cells.length);
    // the first row is a header when a rule sets it off from the rest (\midrule, \hline)
    const ri = t.rows.indexOf(rows[0]);
    const after = t.rows[ri + 1];
    const head = rows.length > 1 && after && after.rules.some((x) => x.kind === 'light' || x.kind === 'heavy') && ri === t.rows.findIndex((r) => !r.empty);
    // (B7) a cell merged down (\multirow) spans its rows in Word too: the empty cells under it,
    // which LaTeX needs and Word has not, are left out
    const covered = new Map();
    // (\rowcolors' bands, counted as the page counts them: the rows that are not rules alone)
    const bandOf = (n) => (t.band && n >= t.band.start ? (n % 2 ? t.band.odd : t.band.even) : null);
    let rowNo = 0;
    // (the table's formula lines, by the cell they name; src/table.js formulasOf)
    const fsrc = t.f != null && this.files && this.files.get ? this.files.get(t.f) : null;
    const fxOf = new Map(typeof fsrc === 'string' && t.s != null ? formulasOf(fsrc, { s: t.s }).map((F) => [F.name, F.text]) : []);
    const colName = (c) => { let n = ''; c += 1; while (c > 0) { const m = (c - 1) % 26; n = String.fromCharCode(65 + m) + n; c = Math.floor((c - 1) / 26); } return n; };
    const row = (r) => {
      const out = [];
      let col = 0;
      rowNo = t.rows.filter((x) => !x.empty).indexOf(r) + 1;
      // (\rowcolor in a row's first cell colours the whole row)
      const rowBg = (r.cells.find((x) => x.rowbg) || {}).rowbg || null;
      for (const c of r.cells) {
        const cov = covered.get(col);
        if (cov && cov.left > 0 && c.inl.every((x) => x.ph)) {
          for (let q = col; q < col + (c.span || 1); q++) { const v = covered.get(q); if (v && v.left > 0) v.left--; }
          col += c.span || 1;
          continue;
        }
        if (c.rows > 1) for (let q = col; q < col + (c.span || 1); q++) covered.set(q, { left: c.rows - 1 });
        // (R3) what Word keeps of the cell and pandoc's table has no field for: its shading and
        // its words turned (src/wordtable.js writes them into the .docx)
        const shd = wordColor(c.bg || rowBg || bandOf(rowNo)), kvs = [];
        if (shd) kvs.push(['rk-shd', shd]);
        if (c.rot === 90 || c.rot === 270) kvs.push(['rk-rot', String(c.rot)]);
        // (a "% formula" line names this cell: Word's own field, src/wordtable.js)
        const fx = fxOf.get(colName(col) + rowNo);
        if (fx) kvs.push(['rk-fx', fx]);
        out.push([attr('', [], kvs), { t: AL[c.palign || c.align] || 'AlignDefault' }, c.rows > 1 ? c.rows : 1, c.span || 1,
          [{ t: 'Plain', c: this.wrap('cell', t.f, null, null, () => this.inl(c.inl, u ? u.fns : []), { after: u ? u.e : null, dir: c.dir || t.dir || (u && u.dir) }) }]]);
        col += c.span || 1;
      }
      return [attr(), out];
    };
    const headRows = head ? [row(rows[0])] : [];
    const bodyRows = (head ? rows.slice(1) : rows).map(row);
    // (R3) its alt text, a "% alt:" line before it (src/table.js), as Word's table description
    const src = t.f != null && this.files && this.files.get ? this.files.get(t.f) : null;
    const alt = typeof src === 'string' && t.s != null ? tableAlt(src, { s: t.s }) : null;
    return { t: 'Table', c: [attr('', [], alt && alt.text ? [['rk-alt', alt.text]] : []), [null, []], specs, [attr(), headRows], [[attr(), 0, [], bodyRows]], [attr(), []]] };
  }

  title(it, u) {
    const fns = u.fns;
    if (it.title && it.title.length) this.meta.title = { t: 'MetaInlines', c: this.wrap('title', it.f, null, null, () => this.inl(it.title, fns)) };
    // (R2) the subtitle: Word's Subtitle paragraph under the title
    if (it.subtitle && it.subtitle.length) this.meta.subtitle = { t: 'MetaInlines', c: this.wrap('subtitle', it.f, null, null, () => this.inl(it.subtitle, fns)) };
    const au = (it.authors || []).filter((a) => a.length).map((a) => ({ t: 'MetaInlines', c: this.wrap('author', it.f, null, null, () => this.inl(a, fns)) }));
    if (au.length) this.meta.author = { t: 'MetaList', c: au };
    if (it.date && it.date.length) this.meta.date = { t: 'MetaInlines', c: this.wrap('date', it.f, null, null, () => this.inl(it.date, fns)) };
  }

  abstract(items, u) {
    const blocks = [];
    for (const it of items) blocks.push(...this.item(it, { ...u, items: [it] }));
    if (blocks.length) this.meta.abstract = { t: 'MetaBlocks', c: blocks };
  }

  refs(it) {
    const head = { t: 'Header', c: [1, attr('', ['unnumbered']), this.wrap('refs', null, null, null, () => { this.ro(it.head); return [Str(it.head)]; })] };
    if (this.o.citeproc) { this.hasRefs = true; return [head, { t: 'Div', c: [attr('refs'), []] }]; }
    const out = [head];
    for (const en of it.entries) {
      const runs = [];
      if (en.label) runs.push(Str(en.label + ' '));
      for (const r of en.runs) if (r.t) runs.push(r.it ? { t: 'Emph', c: [Str(r.t)] } : Str(r.t));
      out.push({ t: 'Para', c: merge(runs) });
    }
    return out;
  }

  // Code (a LaTeX paragraph, a verbatim listing) as Word's Source Code paragraph, plain: a block
  // of its own with a bookmark whose every character is read only, so what a coauthor changes in
  // it comes back as a comment that says it was not applied, under its last line (at), and not
  // as words written into the paragraph before it, which a code block without a bookmark of its
  // own belongs to in Word.
  code(it, kind, at) {
    const inl = this.wrap(kind, it.f, null, null, () => {
      const out = [];
      it.text.split('\n').forEach((line, k) => {
        if (k) { out.push({ t: 'LineBreak' }); this.ro('\n'); }
        if (line) { out.push({ t: 'Code', c: [attr(), line] }); this.ro(line); }
      });
      return out;
    }, { ins: at, dir: 'ltr' });
    return [{ t: 'Div', c: [attr('', [], [['custom-style', 'Source Code']]), [{ t: 'Para', c: inl }]] }];
  }

  raw(it) {
    if (it.verb) return this.code(it, 'code', it.e);
    const pic = this.o.rasters && this.o.rasters.get(it.f + ':' + it.s);
    if (pic) {
      this.images.add(pic);
      this.degrade((it.name || 'figure') + ' as a picture from the PDF');
      return [{ t: 'Para', c: [{ t: 'Image', c: [attr('', [], [['width', '100%']]), [], [pic, '']] }] }];
    }
    this.degrade((it.name || 'source block') + ' as a placeholder');
    const what = /tikz|pgf|asy|pstricks|circuit|forest|chem/i.test(it.name || '') ? 'Figure (' + it.name + ')' : '\\begin{' + (it.name || '?') + '}';
    return [{ t: 'Para', c: [{ t: 'Emph', c: [Str('[' + what + ': drawn in the PDF; Rikuy keeps its source]')] }] }];
  }

  // flat list items -> nested BulletList / OrderedList / DefinitionList
  list(items, u) {
    let i = 0;
    const build = (depth) => {
      const first = items[i];
      const kind = first.li.kind;
      const listS = first.li.listS;
      const entries = [];
      // (pandoc numbers a list as it starts it, before the lists inside it: the same order here)
      const slot = kind === 'desc' ? -1 : this.lists.push(null) - 1;
      if (kind === 'item') { const L = first.label && first.label[0]; this.lists[slot] = L && L.k === 'chr' && L.text ? { glyph: L.text, level: depth } : null; }
      while (i < items.length) {
        const it = items[i];
        // what follows the list in its block (a paragraph that is no item's, a table) ends it
        if (it.type === 'p' ? !it.li : it.depth == null) break;
        const d = it.depth || 1;
        if (d < depth) break;
        if (d === depth && it.type === 'p' && it.li && !it.li.cont) {
          if (it.li.listS !== listS && entries.length) break;
          // a term is a block of its own, made before its definition so the bookmarks keep the order
          entries.push({ term: kind === 'desc' && it.label ? this.labelInl(it.label, u) : null, blocks: [] });
          entries[entries.length - 1].blocks.push(this.para({ ...it, label: null }, u, true, 'li'));
          i++;
          continue;
        }
        if (!entries.length) { i++; continue; }
        if (d > depth && it.type === 'p' && it.li && !it.li.cont) { entries[entries.length - 1].blocks.push(...build(d)); continue; }
        entries[entries.length - 1].blocks.push(...(it.type === 'p' ? [this.para({ ...it, label: null }, u)] : this.item(it, u)));
        i++;
      }
      // (the style and start the model read from the list's own format: a list that starts at iv. is
      // roman from 4; else as the first label reads)
      if (kind === 'enum') return [{ t: 'OrderedList', c: [first.listFmt || listStyle((first.label || []).map((x) => x.text || '').join('')), entries.map((x) => x.blocks)] }];
      if (kind === 'desc') return [{ t: 'DefinitionList', c: entries.map((x) => [x.term || [], [x.blocks]]) }];
      return [{ t: 'BulletList', c: entries.map((x) => x.blocks) }];
    };
    const out = [];
    while (i < items.length) {
      const it = items[i];
      if (it.type === 'p' && it.li && !it.li.cont) out.push(...build(it.depth || 1));
      else { out.push(...this.item(it, u)); i++; }
    }
    return out;
  }
  labelInl(label, u) { return this.wrap('term', u.f, null, null, () => this.inl(label, u.fns)); }

  // ---- inlines --------------------------------------------------------------------------------

  inl(list, fns) {
    const out = [];
    for (const x of list) out.push(...this.inline(x, fns || []));
    return out;
  }

  // a node the model gives a direction is a span of that direction (src/wordbidi.js)
  inline(x, fns) {
    const out = this.inline1(x, fns);
    if ((x.dir !== 'rtl' && x.dir !== 'ltr') || !out.length) return out;
    this.bidi = true;
    return [dirSpan(x.dir, out)];
  }

  inline1(x, fns) {
    switch (x.k) {
      case 'seg': {
        if (x.ph) { if (this.A && this.A.ins == null && x.map[0] >= 0) this.A.ins = x.map[0]; return []; }
        const out = [];
        // what the source says about these characters where the model does not: text inside
        // \RL{..}, \foreignlanguage{arabic}{..} and the like is a span of that direction, and
        // the arguments of the CJK package's wrappers, which the model shows as words, are none
        const S = this.scan(x.f);
        let run = '', to = out, gd = null;
        const flush = () => { if (run) { to.push(Str(run)); run = ''; } };
        const group = (d) => {
          if (d === gd) return;
          flush();
          if (gd && to.length) out.push(dirSpan(gd, to));
          to = d ? [] : out;
          gd = d;
          if (d) this.bidi = true;
        };
        for (let i = 0; i < x.t.length; i++) {
          const s = x.map[2 * i], e = x.map[2 * i + 1];
          if (S && s >= 0) {
            if (S.hidden(s)) continue;
            group(x.dir ? null : S.inline(s));
          }
          const marks = this.cmarks && this.cmarks.get(x.f + ':' + s);
          if (marks && marks.start) { flush(); to.push(...marks.start); marks.start = null; }
          run += x.t[i];
          this.ch(x.t[i], x.f, s, e);
          const endm = this.cmarks && this.cmarks.get(x.f + ':' + e + ':end');
          if (endm && endm.end) { flush(); to.push(...endm.end); endm.end = null; }
          if (this.A && this.A.ins == null) this.A.ins = s;
        }
        group(null);
        flush();
        return out;
      }
      case 'chr': { if (!x.text) return []; this.ro(x.text); const s = Str(x.text); return [x.cls === 'bf' ? { t: 'Strong', c: [s] } : x.cls === 'it' ? { t: 'Emph', c: [s] } : s]; }
      case 'sty': {
        if (x.st === 'ph') return [];
        const kids = this.inl(x.kids, fns);
        if (!kids.length) return [];
        switch (x.st) {
          case 'bf': return [{ t: 'Strong', c: kids }];
          case 'it': case 'em': case 'sl': return [{ t: 'Emph', c: kids }];
          case 'tt': return [{ t: 'Span', c: [attr('', [], [['custom-style', 'Verbatim Char']]), kids] }];
          case 'sc': return [{ t: 'SmallCaps', c: kids }];
          case 'ul': return [{ t: 'Underline', c: kids }];
          case 'so': return [{ t: 'Strikeout', c: kids }];
          case 'sup': return [{ t: 'Superscript', c: kids }];
          case 'sub': return [{ t: 'Subscript', c: kids }];
          case 'link': { const u = safeUrl(x.url); return u ? [{ t: 'Link', c: [attr(), kids, [u, '']] }] : kids; }
          // colour, shading and the highlighter: character styles named after what they do,
          // filled in by exportDocx (pandoc's tree has no colour)
          case 'color': case 'bg': {
            const hex = wordColor(x.color);
            if (!hex) { this.degrade('text in a colour the preamble defines, without the colour'); return kids; }
            return [{ t: 'Span', c: [attr('', [], [['custom-style', (x.st === 'bg' ? 'Shade ' : 'Colour ') + hex]]), kids] }];
          }
          case 'hl': {
            // (a highlighter in a colour of its own, \hl[green]: a style of that colour)
            const hex = x.color ? wordColor(x.color) : null;
            return [{ t: 'Span', c: [attr('', [], [['custom-style', hex && hex !== 'FFFF00' ? 'Highlight ' + hex : 'Highlight']]), kids] }];
          }
          // the Font group's other formats (src/cmd/font.js), each a character style named after
          // what it does, which exportDocx fills in (src/wordjobs.js): ulem's lines, the double
          // strikethrough, all caps, a border, a size, a font, spacing, position and scale
          case 'ul2': case 'ulw': case 'uld': case 'ulo': return [{ t: 'Underline', c: [{ t: 'Span', c: [attr('', [], [['custom-style', { ul2: 'Underline Double', ulw: 'Underline Wave', uld: 'Underline Dash', ulo: 'Underline Dotted' }[x.st]]]), kids] }] }];
          case 'so2': return [{ t: 'Span', c: [attr('', [], [['custom-style', 'Double Strikethrough']]), kids] }];
          // (Word's phonetic guide is a field pandoc cannot write: the reading in brackets after
          // its text, said among what Word gets otherwise)
          case 'ruby': {
            if (!x.title) return kids;
            this.degrade('a phonetic guide, as its reading in brackets after the text');
            const wide = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(x.title);
            return [...kids, { t: 'Str', c: (wide ? '\uFF08' : '(') + x.title + (wide ? '\uFF09' : ')') }];
          }
          case 'upper': return [{ t: 'Span', c: [attr('', [], [['custom-style', 'All Caps']]), kids] }];
          case 'fbox': return [{ t: 'Span', c: [attr('', [], [['custom-style', 'Character Border']]), kids] }];
          case 'sf': return [{ t: 'Span', c: [attr('', [], [['custom-style', 'Font Sans']]), kids] }];
          case 'fs': { const hp = Math.round((x.fs || 0) * 2); return hp >= 2 && hp <= 3276 ? [{ t: 'Span', c: [attr('', [], [['custom-style', 'Size ' + hp]]), kids] }] : kids; }
          case 'ls': { const tw = Math.round((x.ls || 0) / 1000 * (this.m.opts.pt || 10) * 20); return tw ? [{ t: 'Span', c: [attr('', [], [['custom-style', 'Spacing ' + (tw < 0 ? 'm' : '') + Math.abs(tw)]]), kids] }] : kids; }
          case 'raise': { const hp = Math.round((x.raise || 0) * 2); return hp ? [{ t: 'Span', c: [attr('', [], [['custom-style', 'Position ' + (hp < 0 ? 'm' : '') + Math.abs(hp)]]), kids] }] : kids; }
          case 'scale': { const pc = Math.round((x.scale || 1) * 100); return pc > 0 && pc !== 100 && pc <= 600 ? [{ t: 'Span', c: [attr('', [], [['custom-style', 'Scale ' + pc]]), kids] }] : kids; }
          default: {
            // a size of LaTeX ({\large ..}): its points at the document's size; a font by its look
            const z = /^z-(\w+)$/.exec(x.st || ''), ff = /^ff-(\w+)$/.exec(x.st || '');
            if (z && this.m.sizes && this.m.sizes[z[1]]) { const hp = Math.round(this.m.sizes[z[1]] * ((this.m.opts.ext && this.m.opts.ext.fs) || this.m.opts.pt || 10) * 2); if (hp !== Math.round(((this.m.opts.ext && this.m.opts.ext.fs) || this.m.opts.pt || 10) * 2)) return [{ t: 'Span', c: [attr('', [], [['custom-style', 'Size ' + hp]]), kids] }]; }
            if (ff && Object.hasOwn(WORD_FONTS, ff[1])) return [{ t: 'Span', c: [attr('', [], [['custom-style', 'Font ' + ff[1][0].toUpperCase() + ff[1].slice(1)]]), kids] }];
            return kids;
          }
        }
      }
      case 'mac': return this.inl(x.kids, fns);
      case 'math': {
        const ai = this.atom({ k: 'math', f: x.f, s: x.s, e: x.e, is: x.is, ie: x.ie, ro: !!x.ro });
        this.atomText(OBJ, ai);
        return [{ t: 'Math', c: [{ t: 'InlineMath' }, this.plainMath(expandMath(x.tex, this.m.mathMacros))] }];
      }
      case 'cite': {
        const ai = this.atom({ k: 'cite', f: x.f, s: x.s, e: x.e, ro: !!x.ro });
        this.atomText(x.text, ai);
        if (!this.o.citeproc || x.missing || !x.keys.length) return [Str(x.text)];
        const c = (x.cmd || '').replace(/\*$/, '').toLowerCase();
        const mode = /^(citet|textcite|citealt|citeauthor)$/.test(c) ? 'AuthorInText' : /^(citeyear|citeyearpar)$/.test(c) ? 'SuppressAuthor' : 'NormalCitation';
        const { pre, post } = citeNotes(this.files.get(x.f) || '', x.s, x.e);
        const cits = x.keys.map((k, i) => ({ citationId: k, citationPrefix: i === 0 && pre ? [Str(pre)] : [], citationSuffix: i === x.keys.length - 1 && post ? [Str(post)] : [], citationMode: { t: mode }, citationNoteNum: 0, citationHash: 0 }));
        return [{ t: 'Cite', c: [cits, [Str(x.text)]] }];
      }
      case 'ref': { const ai = this.atom({ k: 'ref', f: x.f, s: x.s, e: x.e, ro: !!x.ro }); this.atomText(x.text, ai); return [Str(x.text)]; }
      case 'en': {
        // (R4) an endnote: a note pandoc writes as a footnote, marked for src/wordnotes.js, which
        // makes it one of Word's endnotes; its words as the page lists them
        const n = (this.m.endnotes || []).find((y) => y.f === x.f && y.s === x.s);
        const parts = n ? (n.parts || [n.text]) : [];
        const inl = [{ t: 'RawInline', c: ['openxml', '<!--rikuy:endnote:' + ((this.m.opts && this.m.opts.enStyle) || 'arabic') + '-->'] }];
        for (const part of parts) { if (typeof part === 'string') { if (part) inl.push(Str(part)); } else if (part && part.m != null) inl.push({ t: 'Math', c: [{ t: 'InlineMath' }, part.m] }); }
        return [{ t: 'Note', c: [{ t: 'Para', c: inl }] }];
      }
      case 'fn': {
        const fn = fns.find((y) => y.mark === x) || null;
        const ai = this.atom({ k: 'fn', f: x.f, s: x.s, e: x.e, is: x.is, ie: x.ie, ro: !!x.ro });
        this.atomText(OBJ, ai);
        if (!fn) return [{ t: 'Superscript', c: [Str(x.num || '')] }];
        const inl = this.wrap('fn', fn.f, x.is, x.ie, () => this.inl(fn.inl, fns));
        return [{ t: 'Note', c: [{ t: 'Para', c: inl }] }];
      }
      case 'url': {
        const ai = this.atom({ k: 'url', f: x.f, s: x.s, e: x.e, ro: !!x.ro });
        this.atomText(x.text, ai);
        const u = safeUrl(x.url);
        return u ? [{ t: 'Link', c: [attr(), [Str(x.text)], [u, '']] }] : [Str(x.text)];
      }
      case 'img': case 'widget': {
        const name = x.k === 'widget' ? x.fallback : x.file;
        const file = this.o.asset ? this.o.asset(name) : name;
        const ai = this.atom({ k: 'img', f: x.f, s: x.s, e: x.e, ro: !!x.ro });
        this.atomText(OBJ, ai);
        if (!file) { this.degrade('missing figure'); return [{ t: 'Emph', c: [Str('[' + (name || 'figure') + ']')] }]; }
        this.images.add(file);
        const w = imgWidth(x.opts);
        // (B8) its alt text, which Word keeps as the picture's description (descr) and pandoc
        // reads back as alt={…}; a height given with the width (Lock Aspect Ratio off) too
        const kv = x.opts && x.opts.length < 4000 ? parseKV(x.opts) : [];
        const alt = kv.find((k) => k.key === 'alt' && k.value), hk = kv.find((k) => k.key === 'height' && k.value);
        const h = w && hk ? imgLength(hk.value) : null;
        return [{ t: 'Image', c: [attr('', [], [...(w ? [['width', w]] : []), ...(h ? [['height', h]] : [])]), alt ? [Str(unescapeAlt(alt.value.replace(/^\{([\s\S]*)\}$/, '$1')))] : [], [file, '']] }];
      }
      case 'br': { this.ro('\n'); return [{ t: 'LineBreak' }]; }
      case 'verb': { const ai = this.atom({ k: 'verb', f: x.f, s: x.s, e: x.e, ro: !!x.ro }); this.atomText(x.text, ai); return [{ t: 'Code', c: [attr(), x.text] }]; }
      case 'logo': { const ai = this.atom({ k: 'logo', f: x.f, s: x.s, e: x.e, ro: !!x.ro }); const t = x.text === 'LaTeXe' ? 'LaTeX2e' : x.text; this.atomText(t, ai); return [Str(t)]; }
      case 'sp': { this.ro(' '); return [Str(' ')]; }
      case 'rule': return [];
      case 'form': {
        // (R3) a form field as Word's content control (w:sdt) after its label: a plain text box, a
        // date, a drop-down list or a combo box; a check box as its box's character (Word's own
        // check box needs a namespace pandoc's document does not declare)
        const ph = x.kind === 'check' ? (x.checked ? '\u2612' : '\u2610') : x.value || 'Click or tap here to enter text.';
        const t = (x.label ? x.label + ' ' : '') + ph;
        const ai = this.atom({ k: 'form', f: x.f, s: x.s, e: x.e, ro: !!x.ro });
        this.atomText(t, ai);
        return [...(x.label ? [Str(x.label + ' ')] : []), { t: 'RawInline', c: ['openxml', sdtXml(x, ph)] }];
      }
      case 'chip': {
        const t = x.text || '';
        if (!t) return [];
        const ai = this.atom({ k: 'chip', f: x.f, s: x.s, e: x.e, ro: !!x.ro });
        this.atomText(t, ai);
        // (R3) a field Word has as a field: the page's number, the pages', the title, the author
        if (x.word && /^(PAGE|NUMPAGES|TITLE|AUTHOR)$/.test(x.word)) return [{ t: 'RawInline', c: ['openxml', '<w:fldSimple w:instr=" ' + x.word + ' "><w:r><w:t xml:space="preserve">' + xmlText(t) + '</w:t></w:r></w:fldSimple>'] }];
        if (x.err || /^\\/.test(t)) this.degrade('unknown command shown as its name');
        return [x.plain ? Str(t) : { t: 'Code', c: [attr(), t] }];
      }
      default: { const t = x.text || ''; if (!t) return []; this.ro(t); return [Str(t)]; }
    }
  }

  // ---- comments -------------------------------------------------------------------------------

  // Rikuy's comment threads (% comment (Who) on "words": text) on the words they quote, as Word
  // comments; replies as further comments on the same words. Keyed by source offset for pass 2.
  commentMarks() {
    const marks = new Map();
    const date = new Date(this.o.now || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
    for (const [f, text] of this.files) {
      if (!/\.tex$/i.test(f)) continue;
      for (const th of findComments(text, f)) {
        const hit = this.locate(f, th.as, th.ae, th.quote);
        if (!hit) continue;
        const notes = [{ who: th.who, body: th.body }, ...th.replies];
        const start = [], end = [];
        for (const n of notes) {
          const id = String(this.ncomments++);
          start.push({ t: 'Span', c: [attr('', ['comment-start'], [['id', id], ['author', n.who], ['date', date]]), [Str(n.body)]] });
          end.push({ t: 'Span', c: [attr('', ['comment-end'], [['id', id]]), []] });
        }
        const a = marks.get(f + ':' + hit[0]) || {};
        a.start = [...(a.start || []), ...start];
        marks.set(f + ':' + hit[0], a);
        const b = marks.get(f + ':' + hit[1] + ':end') || {};
        b.end = [...end, ...(b.end || [])];
        marks.set(f + ':' + hit[1] + ':end', b);
      }
    }
    return marks;
  }
  // The changes waiting (opts.changes: [{ f, s, e, del, who }], the words now at [s, e) inserted
  // and the words del deleted at s, in plain prose: src/cmd/review.js plainChanges) as Word's
  // tracked changes, each its author's, dated now: a deletion is its runs in a w:del where its
  // words stood, an insertion its runs between two marks that src/wordjobs.js trackedRuns makes a
  // w:ins. A change whose words the page does not draw stays as the text is now.
  trackMarks(marks) {
    const list = this.o.changes || [];
    if (!list.length) return;
    const date = new Date(this.o.now || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
    // (each file's drawn characters once, [s, e, anchor] in the order of their places, and the
    // last to end at each place; a change then finds its own by halving: read again for every
    // change, 3000 changes on a 287 KB paper took 14 s)
    const idx = new Map();
    const index = (f) => {
      if (idx.has(f)) return idx.get(f);
      const S = [];
      this.anchors.forEach((A, k) => { if (A.f === f) for (let i = 0; i < A.text.length; i++) { const s = A.map[2 * i]; if (s >= 0) S.push([s, A.map[2 * i + 1], k]); } });
      S.sort((x, y) => x[0] - y[0]);
      const E = new Map();
      for (const x of S) E.set(x[1], x);
      const I = { S, E };
      idx.set(f, I);
      return I;
    };
    const from = (S, p) => { let lo = 0, hi = S.length; while (lo < hi) { const m = (lo + hi) >> 1; if (S[m][0] < p) lo = m + 1; else hi = m; } return lo; };
    const put = (key, side, x) => { const m = marks.get(key) || {}; m[side] = [...(m[side] || []), { t: 'RawInline', c: ['openxml', x] }]; marks.set(key, m); };
    let id = 9000;
    this.tracked = 0;
    for (const c of list) {
      // (characters XML 1.0 does not allow, which a name from another's Word file may hold, go:
      // Word refuses a file with one)
      const ok = (t) => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
      const who = xmlEsc(ok(c.who || 'Rikuy').slice(0, 200)).replace(/"/g, '&quot;'), att = ' w:author="' + who + '" w:date="' + date + '"';
      const { S, E } = index(c.f), i0 = from(S, c.s);
      let done = false;
      if (c.del) {
        // (the deleted words as the page shows them, its dashes and quotes, as the text around them goes)
        const xml = '<w:del w:id="' + id++ + '"' + att + '><w:r><w:delText xml:space="preserve">' + xmlEsc(ok(texToPlain(c.del))) + '</w:delText></w:r></w:del>';
        // where its words stood: before the character there, else after the one that ends there,
        // else before one a character or two on in the same block, else after one that ends a
        // character or two before (never the next paragraph's first: past the end of a heading
        // or a paragraph the next character in the source is the next block's)
        const exact = i0 < S.length && S[i0][0] === c.s ? S[i0] : null, before = !exact && E.get(c.s);
        let at = exact, end = before || null;
        if (!at && !end) {
          const prev = i0 > 0 ? S[i0 - 1] : null, next = i0 < S.length && S[i0][0] <= c.s + 2 ? S[i0] : null;
          if (next && (!prev || prev[2] === next[2])) at = next;
          else if (prev && prev[1] >= c.s - 2 && prev[1] <= c.s) end = prev;
        }
        if (at) { put(c.f + ':' + at[0], 'start', xml); done = true; } else if (end) { put(c.f + ':' + end[1] + ':end', 'end', xml); done = true; }
      }
      if (c.e > c.s) {
        let a = null, b = null;
        for (let i = i0; i < S.length && S[i][0] <= c.e; i++) if (S[i][1] <= c.e) { if (!a) a = S[i]; b = S[i]; }
        if (a) {
          put(c.f + ':' + a[0], 'start', '<w:rkIns w:id="' + id++ + '"' + att + '/>');
          put(c.f + ':' + b[1] + ':end', 'end', '<w:rkInsEnd/>');
          done = true;
        }
      }
      if (done) this.tracked++;
    }
  }
  // the source offsets of the first and last character of the quoted words on line [as, ae)
  locate(f, as, ae, quote) {
    const chars = [];
    for (const A of this.anchors) {
      if (A.f !== f) continue;
      for (let i = 0; i < A.text.length; i++) {
        const s = A.map[2 * i], e = A.map[2 * i + 1];
        if (s >= as && e <= ae && s >= 0) chars.push([A.text[i], s, e]);
      }
    }
    if (!chars.length) return null;
    const q = String(quote || '').replace(/…$/, '').replace(/\s+/g, ' ').trim();
    if (q) {
      let t = '';
      const at = [];
      for (const [c, s, e] of chars) { const ch = /\s/.test(c) ? ' ' : c; if (ch === ' ' && t.endsWith(' ')) continue; t += ch; at.push([s, e]); }
      const k = t.indexOf(q);
      if (k >= 0) return [at[k][0], at[k + q.length - 1][1]];
    }
    return [chars[0][1], chars[chars.length - 1][2]];
  }

  metaOut() {
    const M = {};
    for (const [k, v] of Object.entries(this.meta)) M[k] = v;
    if (this.m.opts.lang && this.m.opts.lang !== 'en') M.lang = { t: 'MetaString', c: this.m.opts.lang };
    return M;
  }
}

// \citep[see][p. 3]{key}: the notes before and after, from the command's source
export function citeNotes(src, s, e) {
  const m = /^\\[A-Za-z]+\*?\s*(?:\[([^\]]*)\])?\s*(?:\[([^\]]*)\])?/.exec(src.slice(s, e));
  if (!m) return { pre: '', post: '' };
  if (m[2] != null) return { pre: texToPlain(m[1] || ''), post: texToPlain(m[2]) };
  return { pre: '', post: m[1] != null ? texToPlain(m[1]) : '' };
}

// a length of graphicx's as Word takes one (cm, mm, in, pt), or null
function imgLength(v) { const m = /^\s*([\d.]+)\s*(cm|mm|in|pt)\s*$/.exec(String(v)); return m ? m[1] + m[2] : null; }
function imgWidth(opts) {
  if (!opts) return null;
  let m = /width\s*=\s*([\d.]*)\s*\\(textwidth|linewidth|columnwidth|hsize)/.exec(opts);
  if (m) return Math.min(100, parseFloat(m[1] || '1') * 100) + '%';
  m = /width\s*=\s*([\d.]+)\s*(cm|mm|in|pt)/.exec(opts);
  if (m) return m[1] + m[2];
  m = /scale\s*=\s*([\d.]+)/.exec(opts);
  if (m) return Math.min(100, parseFloat(m[1]) * 100) + '%';
  return null;
}

// adjacent Str merged, empty ones dropped: pandoc's writer takes them as they are
function merge(inl) {
  const out = [];
  for (const x of inl) {
    if (x.t === 'Str') { if (!x.c) continue; const L = out[out.length - 1]; if (L && L.t === 'Str') { L.c += x.c; continue; } out.push({ t: 'Str', c: x.c }); continue; }
    out.push(x);
  }
  return out;
}

// An anchor's character map, run length coded: [n, s] n characters mapping one to one from s;
// [0, s, e] one character from [s, e); [-1, n] n generated characters; [-2, atom, n] n characters
// of one atom. Kept in the .docx, so it is small.
export function packAnchor(A) {
  const runs = [];
  const m = A.map;
  for (let i = 0; i < m.length / 2;) {
    const s = m[2 * i], e = m[2 * i + 1];
    if (s === RO) { let n = 0; while (i < m.length / 2 && m[2 * i] === RO) { n++; i++; } runs.push([-1, n]); continue; }
    if (s === ATOM) { let n = 0; while (i < m.length / 2 && m[2 * i] === ATOM && m[2 * i + 1] === e) { n++; i++; } runs.push([-2, e, n]); continue; }
    if (e === s + 1) {
      let n = 0;
      while (i < m.length / 2 && m[2 * i] === s + n && m[2 * i + 1] === s + n + 1) { n++; i++; }
      runs.push([n, s]);
      continue;
    }
    runs.push([0, s, e]); i++;
  }
  const out = { id: A.id, k: A.kind, f: A.f, text: A.text, runs };
  if (A.s != null) { out.s = A.s; out.e = A.e; }
  if (A.ins != null) out.ins = A.ins;
  if (A.top) out.top = 1;
  if (A.after != null) out.after = A.after;
  return out;
}
export function unpackRuns(runs) {
  const m = [];
  for (const r of runs) {
    if (r[0] > 0) for (let k = 0; k < r[0]; k++) m.push(r[1] + k, r[1] + k + 1);
    else if (r[0] === 0) m.push(r[1], r[2]);
    else if (r[0] === -1) for (let k = 0; k < r[1]; k++) m.push(RO, RO);
    else if (r[0] === -2) for (let k = 0; k < r[2]; k++) m.push(ATOM, r[1]);
  }
  return m;
}

// ---- R4: Word fields ---------------------------------------------------------------------------------
const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// a field's text in its quotes: Word's own quote marks keep a citation's
const fq = (t) => texToPlain(String(t || '')).replace(/"/g, '”').replace(/[\u0000-\u001f]/g, ' ').slice(0, 250);
const TOA_NAMES = ['Cases', 'Statutes', 'Other Authorities', 'Rules', 'Treatises', 'Regulations', 'Constitutional Provisions'];
const TOA_RANK = (name) => { const k = TOA_NAMES.indexOf(String(name).trim()); return k >= 0 ? k + 1 : 8; };
// the field code an \index entry is in Word: XE (the main index), TA (the Table of Authorities)
export function fieldOfIndex(x) {
  const r = readIndexArg(x.arg);
  const L = r.levels.map((l) => fq(l.text)).filter(Boolean);
  if (!L.length) return null;
  if (x.name === 'toa') {
    const cat = r.levels[0], cite = L[1] || L[0];
    const rank = /^\d{1,2}$/.test(String(cat.sort || '').trim()) ? String(cat.sort).trim() : String(TOA_RANK(L[0]));
    return 'TA \\l "' + cite + '" \\s "' + cite + '" \\c ' + rank;
  }
  if (x.name) return null;
  if (r.range) return null;
  let code = 'XE "' + L.slice(0, 3).join(':') + '"';
  if (r.see || r.seealso) code += ' \\t "' + (r.see ? 'See ' : 'See also ') + fq(r.see || r.seealso) + '"';
  else if (/^(textbf|bfseries)$/.test(r.fmt || '')) code += ' \\b';
  else if (/^(textit|emph|itshape)$/.test(r.fmt || '')) code += ' \\i';
  return code;
}
export function fieldRuns(code) {
  return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + xmlEsc(code) + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
}
// a field whose result is paragraphs: begun in the first, ended in the last; marked to be updated
// when Word opens the file (dirty), so its page numbers are Word's own
export function fieldParas(code, lines, right) {
  const tab = right ? '<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs></w:pPr>' : '';
  const ls = lines.length ? lines : [''];
  return ls.map((l, i) => '<w:p>' + tab + (i === 0 ? '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ' + xmlEsc(code) + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '')
    + '<w:r><w:t xml:space="preserve">' + xmlEsc(l) + '</w:t></w:r>' + (i === ls.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '') + '</w:p>').join('');
}
