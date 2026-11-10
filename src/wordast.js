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
  }

  run() {
    // pass 1 finds the text each anchor holds; pass 2 places comments on the words they quote
    this.blocks = this.walk();
    if (this.o.comments !== false) {
      const marks = this.commentMarks();
      if (marks.size) {
        this.cmarks = marks;
        this.anchors = []; this.atoms = []; this.images = new Set(); this.warnings = []; this.degraded = new Map(); this.n = 0; this.meta = {};
        this.blocks = this.walk();
      }
    }
  }

  result() {
    const doc = { 'pandoc-api-version': API, meta: this.metaOut(), blocks: this.blocks };
    const deg = [...this.degraded.entries()].map(([k, n]) => k + (n > 1 ? ' (' + n + ')' : ''));
    return { doc, anchors: this.anchors.map(packAnchor), atoms: this.atoms, images: [...this.images], warnings: this.warnings, degraded: deg, comments: this.ncomments };
  }

  degrade(what) { this.degraded.set(what, (this.degraded.get(what) || 0) + 1); }

  walk() {
    const out = [];
    const units = this.m.blocks;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const items = u.items;
      // a list: its items, flat in the model, become nested Word lists
      if (items.length && items[0].type === 'p' && items[0].li && !items[0].li.cont) { out.push(...this.list(items, u)); continue; }
      if (items.length && items[0].type === 'h' && items[0].level === 'abs') { this.abstract(items.slice(1), u); continue; }
      for (const it of items) out.push(...this.item(it, u));
    }
    return out;
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
    if (!A) return;
    A.text += t;
    for (let i = 0; i < t.length; i++) A.map.push(s, e);
    if (f && A.f && f !== A.f) A.mixed = true;
  }
  ro(t) { const A = this.A; if (!A) return; A.text += t; for (let i = 0; i < t.length; i++) A.map.push(RO, RO); }
  atomText(t, ai) { const A = this.A; if (!A) return; A.text += t; for (let i = 0; i < t.length; i++) A.map.push(ATOM, ai); }
  atom(a) { this.atoms.push(a); return this.atoms.length - 1; }

  wrap(kind, f, s, e, build, extra) {
    const { A, end } = this.begin(kind, f, s, e, extra);
    let inl;
    try { inl = build(A); } finally { end(); }
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
      case 'toc': this.toc = true; return [];
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
    }, { top: !!(u && u.items.length === 1 && it === u.items[0] && !it.li && !it.lead), after: u ? u.e : null });
    let b = { t: plain ? 'Plain' : 'Para', c: inl };
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
    }, { after: u.e });
    return [{ t: 'Header', c: [level, attr(), inl] }];
  }

  display(it) {
    const tex = numberRows(expandMath(it.tex, this.m.mathMacros));
    const ai = this.atom({ k: 'math', f: it.f, s: it.s, e: it.e, is: it.is, ie: it.ie, disp: true, env: it.env || '', tags: it.tags || [] });
    const inl = this.wrap('math', it.f, it.s, it.e, () => { this.atomText(OBJ, ai); return [{ t: 'Math', c: [{ t: 'DisplayMath' }, tex] }]; }, { after: it.e });
    return { t: 'Para', c: inl };
  }

  float(it, u) {
    const out = [];
    for (const p of it.parts) {
      if (p.type === 'p') out.push(this.para(p, u));
      else if (p.type === 'caption') {
        const lab = ({ figure: 'Figure', table: 'Table' }[p.kind] || p.kind) + (p.num ? ' ' + p.num : '') + ': ';
        const inl = this.wrap('cap', p.f, null, null, () => { this.ro(lab); return [Str(lab), ...this.inl(p.inl, u.fns)]; }, { after: u.e });
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
    const row = (r) => [attr(), r.cells.map((c) => [attr(), { t: AL[c.align] || 'AlignDefault' }, 1, c.span || 1,
      [{ t: 'Plain', c: this.wrap('cell', t.f, null, null, () => this.inl(c.inl, u ? u.fns : []), { after: u ? u.e : null }) }]])];
    const headRows = head ? [row(rows[0])] : [];
    const bodyRows = (head ? rows.slice(1) : rows).map(row);
    return { t: 'Table', c: [attr(), [null, []], specs, [attr(), headRows], [[attr(), 0, [], bodyRows]], [attr(), []]] };
  }

  title(it, u) {
    const fns = u.fns;
    if (it.title && it.title.length) this.meta.title = { t: 'MetaInlines', c: this.wrap('title', it.f, null, null, () => this.inl(it.title, fns)) };
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

  raw(it) {
    if (it.verb) return [{ t: 'CodeBlock', c: [attr(), it.text] }];
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
      while (i < items.length) {
        const it = items[i];
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
      if (kind === 'enum') return [{ t: 'OrderedList', c: [[1, { t: 'DefaultStyle' }, { t: 'DefaultDelim' }], entries.map((x) => x.blocks)] }];
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

  inline(x, fns) {
    switch (x.k) {
      case 'seg': {
        if (x.ph) { if (this.A && this.A.ins == null && x.map[0] >= 0) this.A.ins = x.map[0]; return []; }
        const out = [];
        let run = '';
        const flush = () => { if (run) { out.push(Str(run)); run = ''; } };
        for (let i = 0; i < x.t.length; i++) {
          const s = x.map[2 * i], e = x.map[2 * i + 1];
          const marks = this.cmarks && this.cmarks.get(x.f + ':' + s);
          if (marks && marks.start) { flush(); out.push(...marks.start); marks.start = null; }
          run += x.t[i];
          this.ch(x.t[i], x.f, s, e);
          const endm = this.cmarks && this.cmarks.get(x.f + ':' + e + ':end');
          if (endm && endm.end) { flush(); out.push(...endm.end); endm.end = null; }
          if (this.A && this.A.ins == null) this.A.ins = s;
        }
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
          default: return kids;
        }
      }
      case 'mac': return this.inl(x.kids, fns);
      case 'math': {
        const ai = this.atom({ k: 'math', f: x.f, s: x.s, e: x.e, is: x.is, ie: x.ie, ro: !!x.ro });
        this.atomText(OBJ, ai);
        return [{ t: 'Math', c: [{ t: 'InlineMath' }, expandMath(x.tex, this.m.mathMacros)] }];
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
        return [{ t: 'Image', c: [attr('', [], w ? [['width', w]] : []), [], [file, '']] }];
      }
      case 'br': { this.ro('\n'); return [{ t: 'LineBreak' }]; }
      case 'verb': { const ai = this.atom({ k: 'verb', f: x.f, s: x.s, e: x.e, ro: !!x.ro }); this.atomText(x.text, ai); return [{ t: 'Code', c: [attr(), x.text] }]; }
      case 'logo': { const ai = this.atom({ k: 'logo', f: x.f, s: x.s, e: x.e, ro: !!x.ro }); const t = x.text === 'LaTeXe' ? 'LaTeX2e' : x.text; this.atomText(t, ai); return [Str(t)]; }
      case 'sp': { this.ro(' '); return [Str(' ')]; }
      case 'rule': return [];
      case 'chip': {
        const t = x.text || '';
        if (!t) return [];
        const ai = this.atom({ k: 'chip', f: x.f, s: x.s, e: x.e, ro: !!x.ro });
        this.atomText(t, ai);
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
