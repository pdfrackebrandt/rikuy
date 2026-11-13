// Rikuy renderer: model blocks -> DOM flow items. Each block owns a
// registry of segments, atoms and style wrappers with offsets relative
// to the block start, so unchanged blocks survive edits elsewhere.

import { siInMath } from './siunitx.js';

export const BLOCKS = new Map();
let blockSeq = 1;
let itemSeq = 1;

const KATEX_DEFAULT_MACROS = {
  '\\mathbbm': '\\mathbb', '\\mathds': '\\mathbb', '\\bbm': '\\mathbb', '\\nicefrac': '\\frac',
  '\\eqqcolon': '=\\vcentcolon', '\\T': '^{\\top}', '\\middlebar': '\\middle|',
  // \mleft ... \mright (mleftright package): brackets without the extra space before them
  '\\mleft': '\\left', '\\mright': '\\right',
  // amsmath and mathdots symbols KaTeX lacks
  '\\iiiint': '\\mathop{\\int\\mkern-9mu\\int\\mkern-9mu\\int\\mkern-9mu\\int}\\nolimits',
  '\\iddots': '\\mathinner{\\mkern1mu\\raisebox{0.1em}{.}\\mkern2mu\\raisebox{0.4em}{.}\\mkern2mu\\raisebox{0.7em}{.}\\mkern1mu}'
};

export class Renderer {
  constructor(app) {
    this.app = app;
    this.blocks = [];
    this.mathCache = new Map();
    this.macroSig = '';
    this.macros = {};
    this.optMacros = [];
  }

  // si: siunitx settings of the document ({ opts, units, lang }) for \SI and friends in formulas
  setMacros(mathMacros, si) {
    const sig = JSON.stringify([mathMacros, si ? [si.opts, [...si.units], si.lang] : null]);
    if (sig === this.macroSig) return false;
    this.macroSig = sig;
    this.si = si || null;
    this.macros = { ...KATEX_DEFAULT_MACROS };
    this.optMacros = [];
    for (const [k, v] of Object.entries(mathMacros)) {
      if (typeof v === 'string') this.macros[k] = v;
      else this.optMacros.push([k, v]);
    }
    this.mathCache.clear();
    return true;
  }

  expandOpt(tex) {
    if (!this.optMacros.length) return tex;
    for (let round = 0; round < 4; round++) {
      let changed = false;
      for (const [name, M] of this.optMacros) {
        let idx = 0;
        for (;;) {
          const at = tex.indexOf(name, idx);
          if (at < 0) break;
          const after = at + name.length;
          if (/[A-Za-z]/.test(tex[after] || '')) { idx = after; continue; }
          let k = after;
          const args = [];
          while (tex[k] === ' ') k++;
          if (M.opt) {
            if (tex[k] === '[') { const e = tex.indexOf(']', k); args.push(tex.slice(k + 1, e)); k = e + 1; } else args.push(M.dflt);
          }
          for (let n = M.opt ? 1 : 0; n < M.nargs; n++) {
            while (tex[k] === ' ') k++;
            if (tex[k] === '{') {
              let d = 0, j = k;
              for (; j < tex.length; j++) { if (tex[j] === '\\') { j++; continue; } if (tex[j] === '{') d++; else if (tex[j] === '}') { d--; if (d === 0) break; } }
              args.push(tex.slice(k + 1, j)); k = j + 1;
            } else if (tex[k] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(tex.slice(k)); args.push(m[0]); k += m[0].length; }
            else { args.push(tex[k] || ''); k++; }
          }
          const body = M.body.replace(/#(\d)/g, (m, d) => '{' + (args[+d - 1] ?? '') + '}');
          tex = tex.slice(0, at) + body + tex.slice(k);
          idx = at + body.length;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return tex;
  }

  katex(tex, display) {
    const key = (display ? 'D' : 'I') + tex;
    let r = this.mathCache.get(key);
    if (r) return r;
    const K = window.katex;
    if (!K) return { html: '<span class="mloading">' + esc(tex) + '</span>', err: null, loading: true };
    try {
      const t = this.si ? siInMath(tex, this.si.opts, this.si.units, this.si.lang) : tex;
      const html = K.renderToString(this.expandOpt(t), { displayMode: display, macros: { ...this.macros }, throwOnError: true, strict: 'ignore', trust: false, output: 'html', globalGroup: false });
      r = { html, err: null };
    } catch (e) {
      const msg = String(e.message || e).replace(/^KaTeX parse error: /, '');
      r = { html: '<span class="merr">' + esc(tex.trim() || '…') + '</span>', err: msg };
    }
    if (this.mathCache.size > 4000) this.mathCache.clear();
    this.mathCache.set(key, r);
    return r;
  }

  // Sync with a new model: reuse unchanged blocks, render new ones.
  sync(model, prefix) {
    const pool = new Map();
    for (const b of this.blocks) {
      if (!pool.has(b.key)) pool.set(b.key, []);
      pool.get(b.key).push(b);
    }
    const next = [];
    const fresh = [];
    for (const mb of model.blocks) {
      const key = prefix + mb.key;
      const q = mb.items.some((x) => x.type === 'refs') ? null : pool.get(key);
      if (q && q.length) {
        const b = q.shift();
        b.base = mb.s; b.s = mb.s; b.e = mb.e;
        next.push(b);
      } else {
        const b = this.renderBlock(mb, key, model);
        next.push(b);
        fresh.push(b);
      }
    }
    for (const q of pool.values()) for (const b of q) BLOCKS.delete(b.id);
    this.blocks = next;
    return fresh;
  }

  renderBlock(mb, key, model) {
    const B = { id: blockSeq++, key, f: mb.f, base: mb.s, s: mb.s, e: mb.e, segs: [], atoms: [], stys: [], items: [], fns: [] };
    BLOCKS.set(B.id, B);
    this.model = model;
    this.B = B;
    const fnEls = [];
    for (const fn of mb.fns) {
      const el = document.createElement('div');
      el.className = 'fn';
      el.dataset.ctx = 'fn';
      setDir(el, fn.dir);
      const sup = chr(fn.num, 'fnn');
      el.appendChild(sup);
      this.inl(fn.inl, el);
      const fi = { uid: itemSeq++, el, num: fn.num, block: B, h: 0 };
      fnEls.push(fi);
      B.fns.push(fi);
    }
    const all = [];
    for (const it of mb.items) {
      const item = this.item(it, mb);
      if (!item) continue;
      all.push(item);
      if (item.extra) for (const x of item.extra) all.push(x);
    }
    for (const item of all) {
      item.block = B;
      item.uid = itemSeq++;
      item.el.dataset.b = B.id;
      // footnotes whose marks are inside this item
      item.fnIdx = [];
      const marks = item.el.querySelectorAll('.fnm');
      for (const m of marks) {
        const a = this.atomOf(m);
        if (a && a.fnIndex != null) item.fnIdx.push(a.fnIndex);
      }
      // live figures inside: their boxes take a new height when the widget asks (App.widgetResized)
      const w = item.el.querySelectorAll('.w-live');
      if (w.length) item.widgets = [...w];
      B.items.push(item);
    }
    // Attach fn index to atoms (by order of fn marks)
    return B;
  }

  atomOf(el) {
    const id = el.dataset.a;
    if (!id) return null;
    const [bid, k] = id.split('.');
    const B = BLOCKS.get(+bid);
    return B ? B.atoms[+k] : null;
  }

  rel(x) { return x == null || x < 0 ? null : x - this.B.base; }

  // ---- items -------------------------------------------------------------------
  item(it, mb) {
    const B = this.B;
    const el = document.createElement('div');
    el.className = 'it';
    const item = { el, kind: it.type, splittable: false, sb: 0, sbEm: 0, keepNext: false };
    // paragraphs, headings, the title and the contents run the way the model says (floats,
    // formulas and code have no direction of their own: their parts do, or they stay as they are)
    if (it.type === 'p' || it.type === 'h' || it.type === 'title' || it.type === 'toc') setDir(el, it.dir);
    switch (it.type) {
      case 'p': {
        el.classList.add('p');
        // (a paragraph to a screen reader and an agent, which can then pick one inside the page)
        el.setAttribute('role', 'paragraph');
        if (it.cls) for (const c of it.cls.split(/\s+/).filter(Boolean)) el.classList.add(c);
        if (it.indent) el.classList.add('ind');
        if (it.cont) el.classList.add('cont');
        if (it.align) el.classList.add('al-' + it.align);
        el.dataset.ctx = it.ctx || 'p';
        if (it.depth) el.style.setProperty('--depth', it.depth);
        if (it.depth) el.classList.add('deep');
        if (it.label) {
          const lab = document.createElement('span');
          lab.className = 'lbl lbl-' + (it.labelKind || 'item');
          this.inl(it.label, lab);
          // description labels are editable inline text
          if (it.labelKind === 'desc') { lab.removeAttribute('contenteditable'); lab.className = 'dlbl'; }
          el.appendChild(lab);
          if (it.labelKind === 'desc') el.appendChild(chr(' ', 'sp'));
        }
        if (it.li) {
          const L = it.li;
          el.dataset.li = [this.rel(L.itemS), this.rel(L.itemE), this.rel(L.listS), this.rel(L.listE), this.rel(L.cmdE), L.kind, L.cont ? 1 : 0].join(',');
        }
        if (it.envTag) { const t = chr(it.envTag, 'envtag'); el.appendChild(t); }
        if (it.lead) this.inl(it.lead, el);
        this.inl(it.inl, el);
        if (it.tail) { this.inl(it.tail, el); if (it.tail.some((t) => t.cls === 'qed')) el.classList.add('has-qed'); }
        item.splittable = true;
        let sbEm = 0;
        if (it.ctx === 'li' && it.label) sbEm = it.sbList ? 0.8 : 0.45;
        else if (it.ctx === 'li') sbEm = 0.4;
        if (it.sbThm) sbEm = Math.max(sbEm, 0.8);
        if (it.sbList && it.ctx === 'li') sbEm = 0.8;
        if (/\bbibitem\b/.test(it.cls || '')) sbEm = 0.3;
        if (/\babs\b/.test(it.cls || '') && !it.indent) sbEm = 0;
        item.sbEm = sbEm || (this.model.opts.parskip || 0);
        if (it.saThm || it.saList) el.classList.add('pad-after');
        if (/\bthm\b/.test(it.cls || '') && it.thmFirst) el.dataset.thm = '1';
        break;
      }
      case 'h': {
        el.classList.add('h', 'h' + it.level);
        el.dataset.ctx = 'h';
        // a heading to a screen reader and an agent too, one level under the title's
        el.setAttribute('role', 'heading');
        el.setAttribute('aria-level', String(typeof it.level === 'number' ? Math.min(6, it.level + 1 || 1) : 2));
        if (it.chapLabel) {
          if (it.num) { const l = chr(it.chapLabel + ' ' + it.num, 'chapl'); el.appendChild(l); }
        } else if (it.num) { el.appendChild(chr(it.num, 'secnum')); }
        this.inl(it.inl, el);
        item.keepNext = true;
        item.level = it.level;
        item.sbEm = { 0: 2.5, 1: 1.5, 2: 1.35, 3: 1.35, 4: 1.1, 5: 1.1, abs: 0.6 }[it.level] ?? 1.2;
        break;
      }
      case 'title': {
        el.classList.add('ttl');
        el.dataset.ctx = 'ttl';
        const t = div('ttl-t'); this.inl(it.title, t); el.appendChild(t);
        t.setAttribute('role', 'heading');
        t.setAttribute('aria-level', '1');
        const a = div('ttl-a');
        for (const au of it.authors) { const s = document.createElement('span'); s.className = 'ttl-au'; this.inl(au, s); a.appendChild(s); }
        el.appendChild(a);
        if (it.date && it.date.length) { const d = div('ttl-d'); this.inl(it.date, d); el.appendChild(d); }
        item.sbEm = 0;
        break;
      }
      case 'math': {
        el.classList.add('dm', 'atom');
        el.contentEditable = 'false';
        const r = this.katex(it.tex, true);
        el.innerHTML = r.html;
        if (r.err) { el.classList.add('has-err'); el.title = r.err; }
        const idx = B.atoms.length;
        B.atoms.push({ kind: 'math', display: true, f: it.f, s: this.rel(it.s), e: this.rel(it.e), is: this.rel(it.is), ie: this.rel(it.ie), env: it.env, err: r.err });
        el.dataset.a = B.id + '.' + idx;
        item.sbEm = 0.9;
        el.classList.add('pad-math');
        break;
      }
      case 'float': {
        el.classList.add('flt', 'flt-' + it.kind);
        if (it.wide) el.classList.add('wide');
        for (const p of it.parts) el.appendChild(this.floatPart(p));
        item.isFloat = it.kind !== 'inline';
        if (it.kind === 'inline' && it.parts.length === 1 && it.parts[0].type === 'tabular' && it.parts[0].rows.length > 3) { item.splittable = true; item.rowSplit = true; }
        item.placement = it.placement || 'tbp';
        item.sbEm = it.kind === 'inline' ? 0.6 : 1.1;
        el.classList.add('pad-flt');
        break;
      }
      case 'raw': {
        el.classList.add('raw', 'atom');
        el.contentEditable = 'false';
        const head = div('raw-h');
        head.textContent = it.verb ? '' : (it.name || 'source');
        if (!it.verb) el.appendChild(head);
        const pre = document.createElement('pre');
        pre.textContent = it.text;
        el.appendChild(pre);
        if (it.verb) el.classList.add('verb');
        const idx = B.atoms.length;
        B.atoms.push({ kind: 'raw', f: it.f, s: this.rel(it.s), e: this.rel(it.e), is: this.rel(it.is), ie: this.rel(it.ie), name: it.name });
        el.dataset.a = B.id + '.' + idx;
        item.sbEm = 0.6;
        break;
      }
      case 'tex': {
        // A LaTeX paragraph (src/styles.js): its source as text to type in, each character
        // mapped to itself (App.texEdit writes what is typed as it is). Code runs left to right
        // and is not spell checked, whatever the document's language; the box's "LaTeX" header
        // is drawn by the style sheet, so it is never selected, copied or typed into.
        el.classList.add('tex');
        el.dataset.ctx = 'tex';
        el.dir = 'ltr';
        el.spellcheck = false;
        el.setAttribute('role', 'paragraph');
        el.setAttribute('aria-roledescription', 'LaTeX paragraph');
        this.inl(it.inl, el);
        B.tex = { is: this.rel(it.is), ie: this.rel(it.ie), para: !!it.para, nest: it.nest.map(([s, e]) => [this.rel(s), this.rel(e)]) };
        item.splittable = true;
        item.sbEm = 0.6;
        break;
      }
      case 'toc': {
        el.classList.add('toc');
        el.contentEditable = 'false';
        const h = div('toc-head'); h.textContent = this.model.opts.lang === 'de' ? 'Inhaltsverzeichnis' : 'Contents';
        el.appendChild(h);
        it.entries.forEach((e, k) => {
          const row = div('toc-e toc-l' + (e.level + (it.chapters ? 1 : 0)));
          const n = document.createElement('span'); n.className = 'toc-n'; n.textContent = e.num || '';
          const t = document.createElement('span'); t.className = 'toc-t';
          for (const part of (e.parts || [e.text])) {
            if (typeof part === 'string') t.appendChild(document.createTextNode(part));
            else { const m = document.createElement('span'); m.innerHTML = this.katex(part.m, false).html; t.appendChild(m); }
          }
          const d = document.createElement('span'); d.className = 'toc-d';
          const pg = document.createElement('span'); pg.className = 'toc-p'; pg.dataset.hk = k;
          row.append(n, t, d, pg);
          el.appendChild(row);
        });
        item.toc = true;
        item.sbEm = 1.6;
        el.classList.add('pad-after');
        break;
      }
      case 'refs': {
        // heading + one item per entry
        const items = [];
        el.classList.add('h', 'h1', 'refs-h');
        el.contentEditable = 'false';
        el.textContent = it.head;
        item.keepNext = true;
        item.sbEm = 1.5;
        item.extra = it.entries.map((en) => {
          const e2 = document.createElement('div');
          e2.className = 'it p ref atom' + (it.numeric ? ' num' : '');
          e2.contentEditable = 'false';
          if (en.label) { const l = document.createElement('span'); l.className = 'ref-l'; l.textContent = en.label; e2.appendChild(l); }
          for (const r of en.runs) {
            const s = document.createElement(r.it ? 'i' : 'span');
            s.textContent = r.t;
            e2.appendChild(s);
          }
          if (en.f) {
            const idx = B.atoms.length;
            B.atoms.push({ kind: 'bib', f: en.f, s: en.s, e: en.e, absolute: true, key: en.key });
            e2.dataset.a = B.id + '.' + idx;
          }
          return { el: e2, kind: 'p', splittable: true, sbEm: 0.35 };
        });
        void items;
        break;
      }
      case 'space': {
        el.classList.add('vs');
        el.style.height = 'calc(var(--pt) * ' + Math.max(0, it.pt) + ' * 1px)';
        el.contentEditable = 'false';
        item.sbEm = 0;
        // \vspace*{\fill}: what the page has left (src/layout.js)
        if (it.fill) item.fill = true;
        break;
      }
      case 'pagebreak': {
        el.classList.add('pbk');
        el.contentEditable = 'false';
        item.kind = 'break';
        // (to an odd page, a column's end, or one that ends a column alone: src/layout.js)
        item.odd = !!it.odd; item.column = !!it.column; item.only = !!it.only;
        break;
      }
      case 'pagemark': {
        // \thispagestyle, \pagenumbering and their like: nothing on the page but its header,
        // footer and numbers (src/layout.js)
        el.classList.add('pbk');
        el.contentEditable = 'false';
        item.kind = 'mark';
        item.mark = it.mark;
        break;
      }
      case 'rule': {
        el.classList.add('hrule');
        el.contentEditable = 'false';
        item.sbEm = 0.5;
        break;
      }
      default:
        return null;
    }
    // a paragraph of multicols: set in its columns (src/layout.js)
    if (it.mc) { item.cols = it.mc.n; item.region = it.mc.key; item.balance = !it.mc.star; }
    return item;
  }

  lineEm() { const O = this.model.opts; return ({ 10: 1.2, 11: 1.236, 12: 1.208 }[O.pt] || 1.2) * (O.spread || 1); }

  floatPart(p) {
    const B = this.B;
    if (p.type === 'p') {
      const d = div('fp al-' + (p.align || 'center'));
      d.dataset.ctx = 'p';
      setDir(d, p.dir);
      this.inl(p.inl, d);
      return d;
    }
    if (p.type === 'caption') {
      const d = div('cap');
      d.dataset.ctx = 'cap';
      setDir(d, p.dir);
      const lab = { figure: 'Figure', table: 'Table' }[p.kind] || p.kind;
      d.appendChild(chr(lab + (p.num ? ' ' + p.num : '') + ': ', 'caplab'));
      this.inl(p.inl, d);
      return d;
    }
    if (p.type === 'tabular') {
      const wrap = div('tabw');
      const t = document.createElement('table');
      t.className = 'tab';
      // (which table it is: a table that runs over pages is cut into one <table> a page, each
      // with this, so Tab, Select and the selection's block go on across them)
      if (p.f != null && p.s != null) t.dataset.tab = p.f + ':' + p.s;
      // in a right to left document TeX sets the first column at the right (babel's bidi=basic
      // turns alignments with the paragraph direction), and so does a table with dir="rtl"
      if (p.dir === 'rtl') setDir(t, p.dir);
      const tb = document.createElement('tbody');
      const ncol = p.cols.length;
      // (B7) the settings before the table: rows' height, the cells' side space, the rules' width
      // and colour; a cell merged down covers the cells under it; \rowcolors bands the rows
      if (p.stretch && p.stretch !== 1) t.style.setProperty('--tb-st', String(Math.max(0.3, Math.min(5, p.stretch))));
      // (a length as the source writes it, trimmed and short first: no pattern backtracks over a
      // stranger's run of spaces)
      const len = (v) => { const m = /^([\d.]{1,12})(pt|mm|cm|em|ex|in|bp)?$/.exec(String(v || '').slice(0, 60).replace(/[ \t\n]/g, '')); if (!m) return null; return +m[1] * ({ pt: 1, mm: 2.845, cm: 28.45, em: 10, ex: 4.3, in: 72.27, bp: 1.004 }[m[2] || 'pt']); };
      if (len(p.tabcolsep) != null) t.style.setProperty('--tb-sep', String(len(p.tabcolsep) / 6));
      if (len(p.arrayrulewidth) != null) t.style.setProperty('--tb-rw', String(len(p.arrayrulewidth) / 0.4));
      if (len(p.extrarowheight) != null) t.style.setProperty('--tb-xr', String(len(p.extrarowheight)));
      if (p.rulecolor) { t.style.setProperty('--tb-rc', cssColor(p.rulecolor)); t.classList.add('tb-rc'); }
      if (p.stretch || p.tabcolsep || p.arrayrulewidth || p.extrarowheight) t.classList.add('tb-set');
      // (\small and its kin before the table: its words in that size)
      if (p.size && /^(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)$/.test(p.size)) t.classList.add('z-' + p.size);
      const covered = new Map();
      let rowNo = 0;
      p.rows.forEach((r, ri) => {
        const tr = document.createElement('tr');
        for (const rule of r.rules) {
          if (rule.range) continue;
          if (rule.kind === 'heavy') tr.classList.add(ri === 0 ? 'r-top' : (r.empty ? 'r-bot' : 'r-heavy'));
          else if (rule.kind === 'light') tr.classList.add('r-light');
          else if (rule.kind === 'space') tr.classList.add('r-space');
          if (rule.range) tr.dataset.cr = rule.range.join('-');
        }
        if (r.empty) { tr.classList.add('r-empty'); const td = document.createElement('td'); td.colSpan = ncol; td.className = 'rule-cell'; td.contentEditable = 'false'; tr.appendChild(td); tb.appendChild(tr); return; }
        const partial = r.rules.filter((x) => x.range);
        rowNo++;
        if (p.band && rowNo >= p.band.start) { const bc = rowNo % 2 ? p.band.odd : p.band.even; if (bc) tr.style.background = cssColor(bc); }
        let col = 0;
        r.cells.forEach((c) => {
          // (a cell under one merged down, empty: the merged one stands there)
          const cov = covered.get(col);
          if (cov && cov.left > 0 && c.inl.every((x) => x.ph)) {
            // (each column it covers counts the row: a \multicolumn{2}{c}{} under a cell merged
            // both ways uses up both)
            for (let q = col; q < col + c.span; q++) { const v = covered.get(q); if (v && v.left > 0) v.left--; }
            // its place stays reachable: the caret goes into the merged cell's words
            col += c.span;
            return;
          }
          const td = document.createElement('td');
          const colInfo = p.cols[col] || {};
          td.className = 'al-' + (c.align === 'p' ? 'l' : c.align);
          if (colInfo.vl) td.classList.add('vl');
          const lastCol = p.cols[col + c.span - 1] || {};
          if (lastCol.vr) td.classList.add('vr');
          if (c.span > 1) td.colSpan = c.span;
          if (colInfo.align === 'p' && colInfo.w) td.classList.add('pcol');
          for (const pr of partial) if (col + 1 >= pr.range[0] && col + 1 <= pr.range[1]) td.classList.add(pr.kind === 'heavy' ? 'cr-heavy' : 'cr-top');
          td.dataset.ctx = 'cell';
          // a cell's words run right to left
          if (p.dir === 'rtl') setDir(td, p.dir);
          if (c.bg) td.style.background = cssColor(c.bg);
          if (c.rowbg) tr.style.background = cssColor(c.rowbg);
          if (c.bold) td.classList.add('tb-b');
          if (c.palign) { td.classList.remove('pcol', 'al-l', 'al-c', 'al-r'); td.classList.add('al-' + c.palign); }
          if (c.valign) td.classList.add('tb-v' + c.valign);
          if (c.rows > 1) { td.rowSpan = c.rows; td.classList.add(c.vpos === 't' ? 'tb-vt' : c.vpos === 'b' ? 'tb-vb' : 'tb-vm'); for (let q = col; q < col + c.span; q++) covered.set(q, { left: c.rows - 1 }); }
          if (c.rot) { const w = document.createElement('span'); w.className = 'tb-rot tb-rot' + c.rot; this.inl(c.inl, w); td.appendChild(w); td.classList.add('tb-turned'); }
          else this.inl(c.inl, td);
          tr.appendChild(td);
          col += c.span;
        });
        while (col < ncol) { tr.appendChild(document.createElement('td')); col++; }
        tb.appendChild(tr);
      });
      // partial rules (cmidrule) apply to the row below
      t.appendChild(tb);
      wrap.appendChild(t);
      return wrap;
    }
    if (p.type === 'math') {
      const d = div('fm atom');
      d.contentEditable = 'false';
      const r = this.katex(p.tex, true);
      d.innerHTML = r.html;
      const idx = B.atoms.length;
      B.atoms.push({ kind: 'math', display: true, f: p.f, s: this.rel(p.s), e: this.rel(p.e), is: this.rel(p.is), ie: this.rel(p.ie), env: p.env, err: r.err });
      d.dataset.a = B.id + '.' + idx;
      return d;
    }
    if (p.type === 'h') { const d = div('fp'); this.inl(p.inl, d); return d; }
    return div('fp');
  }

  // ---- inlines -----------------------------------------------------------------
  inl(list, parent) {
    const B = this.B;
    for (const x of list) {
      switch (x.k) {
        case 'seg': {
          const s = document.createElement('span');
          s.className = x.ph ? 't ph' : 't';
          const idx = B.segs.length;
          const rel = new Int32Array(x.map.length);
          for (let i = 0; i < x.map.length; i++) rel[i] = x.map[i] - B.base;
          B.segs.push({ f: x.f, rel, len: x.t.length, ph: !!x.ph });
          s.dataset.g = B.id + '.' + idx;
          s.textContent = x.t;
          parent.appendChild(s);
          break;
        }
        case 'chr': parent.appendChild(chr(x.text, x.cls)); break;
        case 'sty': {
          const tag = x.st === 'sup' ? 'sup' : x.st === 'sub' ? 'sub' : 'span';
          const s = document.createElement(tag);
          s.className = 'y y-' + (x.st || 'none') + (x.decl ? ' decl' : '');
          paint(s, x);
          if (x.st === 'dir') setDir(s, x.dir);
          if (x.title) s.title = x.title;
          if (x.url) s.dataset.url = x.url;
          if (x.s != null && x.s >= 0 && !x.ro) {
            const idx = B.stys.length;
            B.stys.push({ f: x.f, s: this.rel(x.s), e: this.rel(x.e), is: this.rel(x.is), ie: this.rel(x.ie), st: x.st, cmd: x.cmd });
            s.dataset.y = B.id + '.' + idx;
          }
          this.inl(x.kids, s);
          parent.appendChild(s);
          break;
        }
        case 'mac': {
          const s = document.createElement('span');
          s.className = 'mac';
          s.title = '\\' + x.name;
          if (x.s >= 0) {
            const idx = B.atoms.length;
            B.atoms.push({ kind: 'mac', f: x.f, s: this.rel(x.s), e: this.rel(x.e), name: x.name, soft: true });
            s.dataset.m = B.id + '.' + idx;
          }
          this.inl(x.kids, s);
          parent.appendChild(s);
          break;
        }
        default: parent.appendChild(this.atomEl(x));
      }
    }
  }

  // Inlines drawn to be read, not edited: no source maps, so nothing in them takes a caret or an
  // edit (the atom around them is edited as source).
  ro(list, parent) {
    for (const x of list) {
      if (x.k === 'seg') { if (!x.ph) parent.appendChild(document.createTextNode(x.t)); }
      else if (x.k === 'sty' || x.k === 'mac') {
        const s = document.createElement(x.st === 'sup' ? 'sup' : x.st === 'sub' ? 'sub' : 'span');
        if (x.k === 'sty') { s.className = 'y y-' + (x.st || 'none'); paint(s, x); if (x.st === 'dir') setDir(s, x.dir); }
        this.ro(x.kids, s);
        parent.appendChild(s);
      } else if (x.k === 'math') {
        const s = document.createElement('span');
        s.className = 'm';
        s.innerHTML = this.katex(x.tex, false).html;
        parent.appendChild(s);
      } else if (x.k === 'br') parent.appendChild(document.createElement('br'));
      else if (x.k === 'chip' && (x.list || x.table)) parent.appendChild(x.list ? this.roList(x.list) : this.roTable(x.table));
      else if (x.text != null || x.num != null) parent.appendChild(document.createTextNode(String(x.text != null ? x.text : x.num)));
    }
  }

  roList(l) {
    const el = document.createElement(l.ordered ? 'ol' : 'ul');
    el.style.margin = '0'; el.style.paddingLeft = '1.3em';
    for (const it of l.items) { const li = document.createElement('li'); this.ro(it, li); el.appendChild(li); }
    return el;
  }

  roTable(p) {
    const t = document.createElement('table');
    t.className = 'tab';
    const tb = document.createElement('tbody');
    p.rows.forEach((r, ri) => {
      if (r.empty) return;
      const tr = document.createElement('tr');
      for (const rule of r.rules) if (!rule.range) tr.classList.add(rule.kind === 'heavy' ? (ri === 0 ? 'r-top' : 'r-heavy') : rule.kind === 'light' ? 'r-light' : 'r-space');
      for (const c of r.cells) {
        const td = document.createElement('td');
        td.className = 'al-' + (c.align === 'p' ? 'l' : c.align);
        if (c.span > 1) td.colSpan = c.span;
        if (c.bg) td.style.background = cssColor(c.bg);
        this.ro(c.inl, td);
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  atomEl(x) {
    const B = this.B;
    const s = document.createElement(x.k === 'fn' ? 'sup' : 'span');
    s.contentEditable = 'false';
    s.className = 'atom a-' + x.k;
    // made by a macro's own text: shown, not edited here (openAtom says where it is defined)
    if (x.ro) s.classList.add('a-ro');
    const rec = { kind: x.k, f: x.f, s: this.rel(x.s), e: this.rel(x.e), is: this.rel(x.is), ie: this.rel(x.ie), ro: !!x.ro };
    switch (x.k) {
      case 'math': {
        s.classList.add('m');
        const r = this.katex(x.tex, false);
        s.innerHTML = r.html;
        if (r.err) { s.classList.add('has-err'); s.title = r.err; rec.err = r.err; }
        break;
      }
      case 'cite': s.textContent = x.text; rec.keys = x.keys; rec.cmd = x.cmd; if (x.missing) s.classList.add('miss'); break;
      case 'ref': s.textContent = x.text; rec.key = x.key; rec.cmd = x.cmd; if (x.missing) s.classList.add('miss'); break;
      case 'fn': s.classList.add('fnm'); s.textContent = x.num; rec.num = x.num; rec.fnIndex = B.fns.findIndex((f) => f.num === x.num && !f.claimed); if (rec.fnIndex >= 0) B.fns[rec.fnIndex].claimed = true; break;
      case 'br': s.innerHTML = '<br>'; break;
      case 'url': s.textContent = x.text; rec.url = x.url; break;
      case 'verb': s.textContent = x.text; break;
      case 'chip': {
        // a list or a table in a table cell: drawn, and edited as source like any chip
        if (x.list || x.table) {
          s.classList.add('plain');
          s.style.display = 'inline-block'; s.style.verticalAlign = 'top'; s.style.whiteSpace = 'normal'; s.style.textAlign = 'left';
          s.appendChild(x.list ? this.roList(x.list) : this.roTable(x.table));
          if (x.title) s.title = x.title;
          break;
        }
        s.textContent = x.text;
        if (x.title) s.title = x.title;
        if (x.err) s.classList.add('err');
        if (x.plain) s.classList.add('plain');
        if (x.note) s.classList.add('note');
        break;
      }
      case 'logo': s.innerHTML = logo(x.text); break;
      case 'sp': {
        if (x.w === 'fill') s.classList.add('fill'); else s.style.width = x.w;
        s.innerHTML = '&#8203;';
        break;
      }
      case 'rule': s.innerHTML = ''; break;
      case 'img': {
        const url = this.app.assetURL(x.file);
        const w = imgWidth(x.opts);
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = x.file;
          if (w) img.style.width = w;
          s.appendChild(img);
        } else {
          s.classList.add('img-missing');
          if (w) s.style.width = w;
          const lab = document.createElement('span');
          lab.textContent = x.file;
          const sub = document.createElement('small');
          const held = this.app.figuresWith && this.app.figuresWith();
          sub.textContent = held ? 'Stays with ' + held + ': a link carries no figures' : /\.(pdf|eps)$/i.test(x.file) || (this.app.vectorFigure && this.app.vectorFigure(x.file)) ? 'PDF and EPS figures show in the compiled PDF' : 'Image file not loaded';
          s.append(lab, sub);
        }
        rec.file = x.file;
        break;
      }
      case 'widget': {
        // A live figure. This box keeps the widget's place and size in the text; the widget runs
        // in a frame laid over it (src/widget.js), which outlives this box being drawn again.
        const fb = this.app.assetURL(x.fallback);
        const html = x.wfile ? this.app.files.get(x.wfile) : null;
        if (html != null && !this.app.widgetsAllowed()) {
          // from someone else and not allowed yet: the fallback, and a button over it (WidgetLayer)
          s.classList.add('w-live', 'gated');
          s.dataset.w = x.wfile + ':' + x.wsig;
          s.dataset.wf = x.wfile;
          if (fb) { const img = document.createElement('img'); img.src = fb; img.alt = x.fallback; s.appendChild(img); }
          else {
            s.classList.add('img-missing');
            const lab = document.createElement('span');
            lab.textContent = x.file;
            const sub = document.createElement('small');
            const held = this.app.figuresWith && this.app.figuresWith();
            sub.textContent = 'Live figure' + (held ? ' from ' + held : '') + ', not run yet';
            s.append(lab, sub);
          }
        } else if (html != null) {
          s.classList.add('w-live');
          s.dataset.w = x.wfile + ':' + x.wsig;
          s.dataset.wf = x.wfile;
          const h = this.app.widgetHeight && this.app.widgetHeight(s.dataset.w, x.wfile);
          if (h) { s.classList.add('sized'); s.style.height = widgetCss(h); }
          // printed in its place: a print of the page shows the picture TeX prints
          if (fb) { const img = document.createElement('img'); img.className = 'wfb'; img.src = fb; img.alt = ''; s.appendChild(img); }
        } else if (fb) {
          // no widget file in the project: its fallback, as TeX prints it
          s.classList.add('a-img');
          s.title = x.file + ' is not in the project: its fallback image shows instead';
          const img = document.createElement('img');
          img.src = fb;
          img.alt = x.fallback;
          const w = imgWidth(x.opts);
          if (w) img.style.width = w;
          s.appendChild(img);
        } else {
          s.classList.add('img-missing');
          const lab = document.createElement('span');
          lab.textContent = x.file;
          const sub = document.createElement('small');
          sub.textContent = 'Widget file not in the project, nor its fallback ' + (x.fallback || 'image');
          s.append(lab, sub);
        }
        rec.file = x.file;
        break;
      }
      default: s.textContent = x.text || '';
    }
    const idx = B.atoms.length;
    B.atoms.push(rec);
    s.dataset.a = B.id + '.' + idx;
    return s;
  }
}

function chr(text, cls) {
  const s = document.createElement('span');
  s.className = 'chr' + (cls ? ' ' + cls : '');
  s.contentEditable = 'false';
  s.textContent = text;
  return s;
}
function div(cls) { const d = document.createElement('div'); d.className = cls; return d; }
// The direction of an item or a run of words, as its dir attribute. The model's value comes from
// the document, maybe a stranger's: the attribute takes one of two fixed words, or is not set.
function setDir(el, d) { if (d === 'rtl' || d === 'ltr') el.dir = d === 'rtl' ? 'rtl' : 'ltr'; }
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function logo(name) {
  const L = '<span class="lg-a">A</span>';
  const E = '<span class="lg-e">E</span>';
  switch (name) {
    case 'TeX': return 'T' + E + 'X';
    case 'LaTeX': return 'L' + L + 'T' + E + 'X';
    case 'LaTeXe': return 'L' + L + 'T' + E + 'X 2<span class="lg-eps">ε</span>';
    case 'BibTeX': return 'B<span class="lg-sc">IB</span>T' + E + 'X';
    case 'XeLaTeX': return 'X<span class="lg-rev">E</span>L' + L + 'T' + E + 'X';
    case 'pdfLaTeX': return 'pdfL' + L + 'T' + E + 'X';
    case 'LuaLaTeX': return 'LuaL' + L + 'T' + E + 'X';
    default: return name;
  }
}

// a widget's height in its own pixels (laid out at 100 % zoom) as a length that follows the zoom
export function widgetCss(h) { return 'calc(var(--pt) * ' + (h * 72.27 / 96).toFixed(4) + ' * 1px)'; }

function imgWidth(opts) {
  if (!opts) return null;
  let m = /width\s*=\s*([\d.]*)\s*\\(textwidth|linewidth|columnwidth|hsize)/.exec(opts);
  if (m) return (parseFloat(m[1] || '1') * 100) + '%';
  m = /width\s*=\s*([\d.]+)\s*(cm|mm|in|pt|em)/.exec(opts);
  if (m) {
    const pt = parseFloat(m[1]) * { cm: 28.45, mm: 2.845, in: 72.27, pt: 1, em: 10 }[m[2]];
    return 'calc(var(--pt) * ' + pt.toFixed(2) + ' * 1px)';
  }
  m = /scale\s*=\s*([\d.]+)/.exec(opts);
  if (m) return Math.min(100, parseFloat(m[1]) * 100) + '%';
  return null;
}

const NAMED = { lightgreen: '#cfeccf', verylightgreen: '#e6f5e6', lightblue: '#d6e6f5', lightyellow: '#fff8cc', red: '#c0392b', blue: '#1f5fa8', green: '#1e7b3c', gray: '#777', grey: '#777', black: '#111', white: '#fff', orange: '#d9761a', purple: '#7b3fa0', magenta: '#b0307a', cyan: '#1b8a9c', yellow: '#d6b500', brown: '#8a5a2b', teal: '#1b7a7a', olive: '#6b6b1e', violet: '#6b3fa0', pink: '#d4789a', lightgray: '#bbb', darkgray: '#444', lime: '#7bbf2a' };
// Only a colour reaches the style: the argument is the document's text, maybe a stranger's,
// and url(...) there would have the reader's browser fetch from wherever it points (a copy
// served without the artifact host's policy lets it).
// a styled run's colour (or its background, for \colorbox), through the style API only
function paint(s, x) {
  if (!x.color) return;
  if (x.st === 'bg') s.style.background = cssColor(x.color); else s.style.color = cssColor(x.color);
}
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;
function cssColor(c) {
  c = (c || '').trim();
  if (NAMED[c.toLowerCase()] && !NAMED[c]) return NAMED[c.toLowerCase()];
  const mix = /^(\w+)!(\d+)/.exec(c);
  if (mix) return 'color-mix(in srgb, ' + (NAMED[mix[1]] || mix[1]) + ' ' + mix[2] + '%, white)';
  const out = NAMED[c] || c;
  return SAFE_COLOR.test(out) ? out : '';
}
