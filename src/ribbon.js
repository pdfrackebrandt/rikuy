// The ribbon: the row under the bar with what a word processor keeps at hand. The Styles gallery
// (the style of the paragraph the caret is in, as Word's: Normal, the headings, LaTeX, Quote),
// bold, italic and underline, lists, the things to insert, and the three downloads. Every button
// runs an edit the editor already has, or one small patch of the source (a paragraph to a heading
// or a quote and back, to a LaTeX paragraph and back by src/styles.js, paragraphs to a list and
// back): one commit, so one undo step restores the source byte for byte. The methods join App's
// prototype.

import { BLOCKS } from './render.js';
import { styOfEl } from './editor.js';
import { NOT_PLAIN, latexSpot, restyle, blankPads, quoteWords, startsLine } from './styles.js';

const $ = (s, r = document) => r.querySelector(s);
const HEAD = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(\[[^\]]*\])?\s*\{/;
const STYLES = { textbf: ['textbf', 'bf', 'bfseries'], emph: ['emph', 'textit', 'it', 'itshape'], underline: ['underline', 'uline'] };
const HEADS = ['section', 'subsection', 'subsubsection'];
// The Styles gallery's order, the one the list behind More keeps
const ORDER = ['p', 'title', 'section', 'subsection', 'subsubsection', 'latex', 'quote'];
// The tiles in their order for n in view: LaTeX moves up to the last place of the first page
// where it would not be on it (Normal, Heading 1, LaTeX for three)
function tileOrder(n, title) {
  const list = ORDER.filter((v) => v !== 'title' || title), i = list.indexOf('latex');
  if (i >= n) list.splice(n - 1, 0, ...list.splice(i, 1));
  return list;
}
// where the pages of n tiles start: every n, the last one full (it shows the last n styles), so
// paging never changes how many tiles there are
function pageStarts(len, n) {
  const out = [];
  for (let k = 0; k < len - n; k += n) out.push(k);
  out.push(Math.max(0, len - n));
  return out;
}
// a control the toolbar's arrows skip: disabled, or a tile that cannot apply here (those keep
// their tooltip, which says why)
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
// why a tile cannot apply where the caret is (its tooltip says so)
const WHY = {
  none: 'Click in the text of the page first.',
  multi: 'Not for a selection over several paragraphs.',
  title: 'The title is the one \\title sets: edit its words where they stand.',
  part: 'Not for one part of a list, a table or a theorem: LaTeX takes it as a whole.',
  latex: 'Not here: a LaTeX paragraph stands on lines of its own and ends at a blank line, and this one has text right before or after it.',
  head: 'Not here: a heading holds one paragraph of plain text, with no footnote, display, list or environment.',
  quote: 'Not here: a quote holds one paragraph of text.',
  line: 'Not on a line to come in a LaTeX paragraph: type it first.'
};
const LIVE_NOTE = 'Graphs are pictures in a PDF or Word file. Download LaTeX to keep them live.';

export const ribbon = {
  // (set by installRibbon; the page's first builds come before it)
  ribbonSoon() {},
  // Where the caret is, for the ribbon: its element, its item on the page and its block. None
  // while the source pane has the focus or the pages are stale: the buttons are then disabled.
  ribbonAt() {
    if (this.stale || !this.model) return null;
    const a = document.activeElement;
    if (a && a.closest && a.closest('#srcpane')) return null;
    const c = this.caretNow();
    if (!c) return null;
    const n = getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    const it = c.ghost ? null : el && el.closest('.it');
    // What the caret is inside, nearest first: a footnote's text and a caption are not items of
    // the page, a cell and bold or italic words lie within one. An equation or a footnote
    // written there would land inside the cell, the braces or the other footnote.
    const near = c.ghost || !el ? null : el.closest('[data-ctx]');
    const r = getSelection().getRangeAt(0), end = r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement;
    return { c, el, it, B: it ? BLOCKS.get(+it.dataset.b) : null, ctx: near ? near.dataset.ctx : '', cell: !!(el && el.closest('td')), sty: !!(el && el.closest('[data-y]')),
      multi: !c.ghost && !r.collapsed && !!it && (end && end.closest('.it')) !== it };
  },

  // a block that is one plain paragraph of the text: [s, e) of its words, or null
  plainPara(B, it) {
    if (!B || !it || it.dataset.ctx !== 'p' || B.items.length !== 1 || /\bthm\b/.test(it.className)) return null;
    const src = this.src(B.f);
    let s = B.s, e = B.e;
    while (s < e && /\s/.test(src[s])) s++;
    while (e > s && /\s/.test(src[e - 1])) e--;
    return e > s && src[s] !== '%' && !NOT_PLAIN.test(src.slice(s, e)) ? { s, e } : null;
  },

  // a quote or quotation environment as a block of its own: where its words are, whether they
  // are one paragraph (the only kind made a paragraph again) and whether a heading could hold them
  quoteOf(B) {
    const src = this.src(B.f), q = quoteWords(src, B.s, B.e);
    if (!q) return null;
    const { ws, we } = q, words = src.slice(ws, we);
    const one = B.items.length === 1 && we > ws && !/\\begin\s*\{|\\\[|\$\$|\n[ \t]*\n/.test(words);
    return { ws, we, one, plain: one && !NOT_PLAIN.test(words) && words[0] !== '%' };
  },

  // The style of the caret's block: v is 'p', 'title', a heading's command, 'latex', 'quote' or
  // '' (something else: a list, a table, a theorem); to, the styles the ribbon may change it to;
  // b, where its words are for restyle (src/styles.js).
  blockStyle(at) {
    const { c, it, B } = at, none = new Set();
    if (c.ghost) {
      // a line to come in a LaTeX paragraph keeps its paragraph's style
      if (this.ghost.tex) return { v: 'latex', to: none, why: WHY.line };
      return { v: this.ghost.style || 'p', to: new Set(['p', ...HEADS, 'latex', 'quote']) };
    }
    if (!it || !B) return { v: '', to: none };
    const ctx = it.dataset.ctx;
    // a selection that runs over several paragraphs: the list would change only the first
    if (at.multi) return { v: ctx === 'p' ? 'p' : ctx === 'tex' ? 'latex' : '', to: none, why: WHY.multi };
    if (ctx === 'ttl') return { v: 'title', to: none, why: WHY.title };
    const src = this.src(B.f);
    if (ctx === 'tex') {
      // back to what its source makes; a heading or a quote only of what is one paragraph of text
      const T = this.texBox(it);
      if (!T) return { v: 'latex', to: none };
      const words = src.slice(T.is, T.ie), to = new Set(['p']);
      if (T.para) { to.add('quote'); if (!NOT_PLAIN.test(words) && words[0] !== '%') HEADS.forEach((h) => to.add(h)); }
      return { v: 'latex', to, b: { v: 'latex', s: T.ms, ws: T.is, we: T.ie, e: T.ie } };
    }
    const spot = latexSpot(src, B.s, B.e);
    const latex = (to) => { if (spot >= 0) to.add('latex'); return to; };
    if (ctx === 'h') {
      const m = HEAD.exec(src.slice(B.s, B.e));
      const v = m && HEADS.includes(m[1]) ? m[1] : '';
      if (!v || src[B.e - 1] !== '}') return { v, to: latex(new Set()), b: { spot } };
      // the \label on the heading's next line stays with it: a paragraph made of it ends after the label
      const lab = /^[ \t]*\\label\s*\{[^}]*\}/.exec(src.slice(B.e, B.e + 400));
      return { v, to: latex(new Set(['p', 'quote', ...HEADS.filter((h) => h !== v)])), b: { v, s: B.s, ws: B.s + m[0].length, we: B.e - 1, e: B.e, after: lab ? B.e + lab[0].length : null, spot } };
    }
    const q = this.quoteOf(B);
    if (q) return { v: 'quote', to: latex(new Set(q.one ? ['p', ...(q.plain ? HEADS : [])] : [])), b: { v: 'quote', s: B.s, ws: q.ws, we: q.we, e: B.e, spot } };
    const r = this.plainPara(B, it);
    // (Quote only for a paragraph that starts its line: after \noindent or the like on the same
    // line, the environment would go in after it, and the way back would not be byte for byte)
    if (r) return { v: 'p', to: latex(new Set([...HEADS, ...(startsLine(src, r.s) ? ['quote'] : [])])), b: { v: 'p', s: r.s, ws: r.s, we: r.e, e: r.e, spot } };
    if (ctx === 'p' && B.items.length === 1 && !/\bthm\b/.test(it.className)) {
      // a paragraph with a footnote or a display in it: no heading can hold it, a quote can
      let s = B.s, e = B.e;
      while (s < e && /\s/.test(src[s])) s++;
      while (e > s && /\s/.test(src[e - 1])) e--;
      const words = src.slice(s, e), quote = e > s && startsLine(src, s) && !/^\\begin\s*\{/.test(words) && !/\n[ \t]*\n/.test(words);
      return { v: 'p', to: latex(new Set(quote ? ['quote'] : [])), b: { v: 'p', s, ws: s, we: e, e, spot } };
    }
    return { v: '', to: latex(new Set()), b: { spot } };
  },

  // Normal, Heading 1 to 3, LaTeX and Quote: the caret's block takes the style by the smallest
  // edit (restyle in src/styles.js): the words are not touched, the command, the environment or
  // the mark's line goes around them or away. One commit, so one undo restores the source byte for
  // byte. A blank paragraph (after Enter, a new document) set to LaTeX or Quote shows so, and
  // the mark or the environment goes in with its first character.
  setBlockStyle(to) {
    const at = this.ribbonAt();
    if (!at) return;
    const { c } = at, cur = this.blockStyle(at);
    if (cur.v === to || !cur.to.has(to)) return;
    this.closeGroup();
    if (c.ghost) {
      const g = this.ghost;
      if (to === 'p' || to === 'latex' || to === 'quote') {
        g.style = to === 'p' ? null : to;
        g.pend = '';
        g.el.classList.toggle('tex', to === 'latex');
        g.el.classList.toggle('quote', to === 'quote');
        this.paintGhost();
        return;
      }
      g.style = null;
      this.insertPiece(null, g, '\\' + to + '{', '}');
      this.closeGroup();
      return;
    }
    const f = at.B.f, r = restyle(this.src(f), cur.b, to, c.a);
    if (!r) return;
    this.commit(r.edits.map((x) => ({ f, ...x })), { f, p: r.p, bias: -1 }, 'block');
    this.closeGroup();
  },

  // The list the caret is in, if it is one the ribbon can work on (a bulleted or numbered list
  // that is a block of its own, not one inside another list or a theorem), else the plain
  // paragraphs the selection covers.
  listAt(at) {
    const { c, it, B } = at;
    if (c.ghost || !it || !B) return null;
    const src = this.src(B.f);
    if (it.dataset.li) {
      const [is, ie, ls, le, cmdE] = it.dataset.li.split(',').map((x) => +x + B.base);
      const L = src.slice(ls, le), bm = /^\\begin\s*\{(itemize|enumerate)\}(\s*\[[^\]]*\])?/.exec(L), em = /\\end\s*\{(itemize|enumerate)\}\s*$/.exec(L);
      if (!bm || !em || bm[1] !== em[1] || ls !== B.s || le !== B.e || /\\begin\s*\{/.test(L.slice(bm[0].length))) return null;
      // (labelled: \item[b)] has a label of its own, which a paragraph could not keep)
      return { kind: bm[1], f: B.f, is, ie, ls, le, cmdE, bodyS: ls + bm[0].length, bodyE: ls + em.index, begin: bm[0], end: em[0].trim(), labelled: /^\\item\s*\[/.test(src.slice(is, is + 60)) };
    }
    // every block from the one the selection starts in to the one it ends in
    const r = getSelection().getRangeAt(0);
    const of = (n) => { const el = n.nodeType === 1 ? n : n.parentElement, i = el && el.closest('.it'); return i ? { it: i, B: BLOCKS.get(+i.dataset.b) } : null; };
    const a = of(r.startContainer), z = of(r.endContainer);
    if (!a || !z || !a.B || !z.B || a.B.f !== z.B.f) return null;
    const paras = [];
    for (const X of this.renderer.blocks) {
      if (X.f !== a.B.f || X.s < a.B.s || X.e > z.B.e) continue;
      const item = X.items[0], p = item && this.plainPara(X, item.el);
      if (!p) return null;
      paras.push(p);
    }
    return paras.length ? { kind: null, f: a.B.f, paras: paras.sort((x, y) => x.s - y.s) } : null;
  },

  // Bulleted or numbered: paragraphs become the items of a new list; in a list of the other
  // kind the list changes its kind; in a list of this kind the caret's item becomes a paragraph
  // again, and the items before and after it stay lists of their own.
  toggleList(kind) {
    const at = this.ribbonAt(), L = at && this.listAt(at);
    if (!L) return;
    const f = L.f, src = this.src(f), c = at.c;
    this.closeGroup();
    if (L.paras) {
      const edits = [];
      let p = c.a, add = 0;
      L.paras.forEach((r, k) => {
        // (a paragraph that starts with a bracket: \item would read it as the item's label)
        const open = (k ? '' : '\\begin{' + kind + '}\n') + '  \\item ' + (src[r.s] === '[' ? '{}' : '');
        if (r.s <= c.a) add += open.length;
        edits.push({ f, s: r.s, e: r.s, t: open });
        if (k === L.paras.length - 1) edits.push({ f, s: r.e, e: r.e, t: '\n\\end{' + kind + '}' });
      });
      p = Math.max(c.a, L.paras[0].s) + add;
      this.commit(edits.reverse(), { f, p, bias: -1 }, 'block');
    } else if (L.kind !== kind) {
      const e0 = L.ls + L.begin.indexOf(L.kind), e1 = L.bodyE + L.end.indexOf(L.kind);
      this.commit([{ f, s: e1, e: e1 + L.kind.length, t: kind }, { f, s: e0, e: e0 + L.kind.length, t: kind }], { f, p: c.a + kind.length - L.kind.length, bias: -1 }, 'block');
    } else {
      if (L.labelled) return;
      // What comes before the first \item (\setlength\itemsep...) sets the list up: it stays
      // with each list that keeps items and goes only when none is left. A list is written
      // only around items: one with setup lines alone would stop TeX.
      const pre = src.slice(L.bodyS, L.is), k = pre.search(/\\item\b/);
      const setup = (k < 0 ? pre : pre.slice(0, k)).trim(), prev = k < 0 ? '' : pre.slice(k).trim(), after = src.slice(L.ie, L.bodyE).trim();
      const list = (items) => L.begin + '\n' + (setup ? '  ' + setup + '\n' : '') + '  ' + items + '\n' + L.end;
      const raw = src.slice(L.cmdE, L.ie), text = raw.trim().replace(/^\{\}(?=\[)/, '');
      const pad = blankPads(src, L.ls, L.le);
      const head = prev ? list(prev) + '\n\n' : pad.b, tail = after ? '\n\n' + list(after) : pad.a;
      const off = Math.min(text.length, Math.max(0, c.a - L.cmdE - (raw.length - raw.trimStart().length)));
      this.commit([{ f, s: L.ls, e: L.le, t: head + text + tail }], { f, p: L.ls + head.length + off, bias: -1 }, 'block');
    }
    this.closeGroup();
  },

  // A table of two columns and two rows, after the block the caret is in, the caret in its
  // first cell. Plain rules: booktabs may not be loaded.
  insertTable() {
    const { f, p, pre, post } = this.afterBlockPos();
    const open = '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\hline\n';
    this.closeGroup();
    this.removeGhost();
    this.commit([{ f, s: p, e: p, t: pre + open + ' &  \\\\\n &  \\\\\n\\hline\n\\end{tabular}\n\\caption{}\n\\end{table}' + post }], { f, p: p + pre.length + open.length, bias: 1 }, 'insert');
    this.closeGroup();
  },

  // Footnote and Link: the empty command at the caret, after any selected words (which stay as
  // they are), the caret between its braces. Citation: the insert list's item, which opens its
  // picker. Each is watched: given up empty, it goes again (dropEmpty).
  insertEmpty(open, close) {
    const c = this.caretNow();
    if (!c) return;
    this.closeGroup();
    const mark = { h0: this.hist.length, redo0: this.redoStack };
    const f = c.ghost ? this.ghost.f : c.f, from = c.ghost ? this.ghost.pos : c.b;
    if (c.ghost) this.insertPiece(null, this.ghost, open, close);
    else this.commit([{ f, s: from, e: from, t: open + close }], { f, p: from + open.length, bias: 1 }, 'insert');
    this.watchEmpty(f, from, open + close, mark);
  },
  insertCite() {
    const c = this.caretNow();
    if (!c) return;
    this.closeGroup();
    const mark = { h0: this.hist.length, redo0: this.redoStack };
    const f = c.ghost ? this.ghost.f : c.f, from = c.ghost ? this.ghost.pos : c.a;
    this.insertFromPalette('cite');
    this.watchEmpty(f, from, '\\' + this.citeChoices()[0][0] + '{}', mark);
  },
  watchEmpty(f, from, t, mark) {
    const s = this.src(f).indexOf(t, from);
    this.rbEmpty = s < 0 ? null : { f, s, t, ...mark };
    this.closeGroup();
  },
  // An empty footnote, link or citation the caret has left (its picker closed with nothing
  // picked) is taken out again: it showed as a bare mark or "[?]". Its insertion leaves no step
  // in the history, so undo and redo are as they were before the button was pressed.
  dropEmpty() {
    const w = this.rbEmpty;
    if (!w || this.pop) return;
    const c = this.caretNow();
    if (this.src(w.f).slice(w.s, w.s + w.t.length) !== w.t) { this.rbEmpty = null; return; }
    if (c && !c.ghost && c.f === w.f && c.collapsed && c.a > w.s && c.a < w.s + w.t.length) return;
    this.rbEmpty = null;
    const at = c && !c.ghost ? { f: c.f, p: c.f === w.f && c.a >= w.s + w.t.length ? c.a - w.t.length : c.a, bias: -1 } : null;
    if (this.hist.length === w.h0 + 1) {
      const h = this.hist.pop();
      for (const d of h.files) { const s = this.files.get(d.f) ?? ''; this.files.set(d.f, s.slice(0, d.s) + d.del + s.slice(d.s + d.ins.length)); }
      this.redoStack = w.redo0;
      this.rebuild(at);
      this.pushToSource(); this.saveSoon(); this.updateUndoUI();
    } else this.commit([{ f: w.f, s: w.s, e: w.s + w.t.length, t: '' }], at, 'insert');
  },

  // a live graph on the page, as the parser found it (one named in a comment is none)
  hasLive() { return this.renderer.blocks.some((B) => B.atoms.some((a) => a.kind === 'widget')); },
  // PDF and Word hold a live graph as its picture: said once for each document, after what the
  // download itself has to say (Word's "Saved, shown differently in Word"), in the same message
  liveNote() {
    const k = this.name + '|' + this.main;
    if (!this.hasLive() || this.liveTold === k) return;
    this.liveTold = k;
    const said = $('#toast').hidden ? '' : $('#toast').firstChild.textContent;
    this.toast((said ? said + ' ' : '') + LIVE_NOTE, 14000);
  },
  // the LaTeX download's title: what it gives, whether there are changes since, and that it
  // alone keeps live graphs live (the button then carries a mark)
  saveTitle() {
    const b = $('#b-save');
    if (!b) return;
    const live = this.hasLive(), what = this.singleFile() ? this.main.split('/').pop() : 'the project as .zip';
    b.classList.toggle('live', live);
    b.title = (this.zipDirty ? 'Changes since you last saved. ' : '') + 'Download the LaTeX source, ' + what + (live ? ': keeps the live graphs' : '') + ' (Ctrl+S)';
  },

  // The PDF in one click: the one TeX last made when the text has not changed since, else a
  // compile first. The button is busy meanwhile and cannot start a second run. A run that
  // fails opens the preview pane, which holds its error.
  async downloadPdfNow() {
    if (this.pdfBusy) return;
    const b = $('#rb-pdf'), lab = b.querySelector('span');
    const fresh = () => !!this.lastPdf && this.lastPdfSig === this.textSigNow();
    if (!fresh() || this.compiling) {
      this.pdfBusy = true;
      b.disabled = true; b.setAttribute('aria-busy', 'true'); lab.textContent = 'Making the PDF…';
      try {
        this.pdfPane();
        if (!this.compiling) await this.compilePdf();
        // (a run asked for while one was going starts when that one ends)
        while (this.compiling) await new Promise((r) => setTimeout(r, 150));
      } finally {
        this.pdfBusy = false;
        b.disabled = false; b.removeAttribute('aria-busy'); lab.textContent = 'PDF';
      }
    }
    if (fresh()) { await this.downloadPdf(); this.liveNote(); } else if (!document.body.classList.contains('pdf-on')) this.togglePdf(true, true);
  },

  // A phone's one Download button: the three downloads by name, each pressing its own button.
  openDownloads() {
    const p = this.makePop($('#rb-dl-menu'), 'pop-dl', 'Download');
    // a menu named by its title; each item under its button's own name ("Download LaTeX")
    p.setAttribute('role', 'menu');
    p.querySelector('.pop-x').setAttribute('role', 'menuitem');
    this.menuKeys(p);
    for (const id of ['rb-pdf', 'rb-word', 'b-save']) {
      const b = $('#' + id), a = document.createElement('button');
      a.type = 'button'; a.className = 'nav-act'; a.setAttribute('role', 'menuitem'); a.setAttribute('aria-label', b.getAttribute('aria-label')); a.title = b.title;
      a.append(b.querySelector('svg').cloneNode(true), Object.assign(document.createElement('span'), { textContent: b.querySelector('span').textContent }));
      if (id === 'b-save' && b.classList.contains('live')) a.classList.add('live');
      a.addEventListener('click', () => { this.closePop(true); b.click(); });
      p.append(a);
    }
    this.positionPop();
  },

  // one press of a ribbon button (data-rb)
  async ribbonDo(act) {
    if (act in STYLES) this.toggleStyle(act);
    else if (act === 'itemize' || act === 'enumerate') this.toggleList(act);
    else if (act === 'math') this.newMath();
    else if (act === 'equation') this.newDisplayMath();
    else if (act === 'table') this.insertTable();
    else if (act === 'picture') { const s = getSelection(); this.rbRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; $('#picinput').click(); }
    else if (act === 'footnote') this.insertEmpty('\\footnote{', '}');
    else if (act === 'url') this.insertEmpty('\\url{', '}');
    else if (act === 'cite') this.insertCite();
    else if (act === 'dl-menu') this.openDownloads();
    else if (act === 'st-up' || act === 'st-down') { this.pageGallery(act === 'st-up' ? -1 : 1); return; }
    else if (act === 'st-more') { this.openStyles(); return; }
    else if (act === 'dl-tex') await this.save();
    // (the note only once a file was made: on a copy without Word the notice about that stays)
    else if (act === 'dl-word') { const had = this.lastDocx; await this.saveDocx(); if (this.lastDocx !== had) this.liveNote(); }
    else if (act === 'dl-pdf') await this.downloadPdfNow();
    this.ribbonSync();
  },

  // what the ribbon shows for where the caret is now: the style, the pressed buttons, and which
  // buttons can do nothing here and so are disabled
  ribbonSync() {
    const rb = $('#ribbon');
    if (!rb) return;
    this.dropEmpty();
    const at = this.ribbonAt(), st = at ? this.blockStyle(at) : { v: 'p', to: new Set() };
    this.rbStyle = { ...st, on: !!at };
    // a caret in another block (or the block's style changed): the gallery pages to its style
    const key = at ? (at.B ? at.B.id : at.c.ghost ? 'ghost' : '') + '|' + st.v : '';
    if (key !== this.rbKey) { this.rbKey = key; this.rbFollow = true; }
    const sel = $('#rb-style');
    for (const o of sel.options) {
      if (o.value === 'title') o.hidden = o.disabled = st.v !== 'title';
      else if (o.value === '') o.hidden = o.disabled = st.v !== '';
      else o.disabled = o.value !== st.v && !st.to.has(o.value);
    }
    sel.value = st.v;
    sel.disabled = !at || !st.to.size;
    this.paintGallery();
    // the LaTeX paragraph the caret is in shows so
    const box = at && at.ctx === 'tex' && at.it ? at.it : this.ghost && this.ghost.tex ? this.ghost.el.closest('.it.tex') : null;
    for (const x of this.root.querySelectorAll('.it.tex.cur')) if (!box || x.dataset.b !== box.dataset.b) x.classList.remove('cur');
    if (box) for (const x of this.root.querySelectorAll('.it.tex[data-b="' + box.dataset.b + '"]')) x.classList.add('cur');
    const inside = (names) => { for (let n = at && at.el; n && n !== this.root; n = n.parentElement) if (n.dataset && n.dataset.y) { const y = styOfEl(n); if (y && names.includes(y.cmd)) return true; } return false; };
    const L = at && this.listAt(at);
    const tight = !!at && (/^(h|ttl|cell|cap|fn)$/.test(at.ctx) || at.cell);
    for (const b of rb.querySelectorAll('button[data-rb]')) {
      const act = b.dataset.rb;
      if (act.startsWith('dl-') || act.startsWith('st-')) continue;
      let off = !at, on = null;
      // (in a LaTeX paragraph bold is written as \textbf by hand: the box shows source, not bold words)
      if (act in STYLES) { off = !at || !!at.c.ghost || at.ctx === 'tex'; on = !off && inside(STYLES[act]); }
      else if (act === 'itemize' || act === 'enumerate') { on = !!L && L.kind === act; off = !L || (on && L.labelled); }
      // Table and Picture go after the caret's block wherever the caret is, so they stay on
      else if (act === 'equation') off = !at || tight || at.sty || at.ctx === 'tex' || !!(at.c.ghost && this.ghost.tex);
      else if (act === 'footnote') off = !at || tight;
      b.disabled = off;
      if (on !== null) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // (the title reads every file for a live graph: once for each build of the page, not for each move of the caret)
    if (this.rbModel !== this.model) { this.rbModel = this.model; this.saveTitle(); }
    this.ribbonRove();
  },

  // The Styles gallery: the tiles of the styles there are here (Title only in the title), as
  // many as the row has room for (ribbonFit), from the page the arrows paged to or the one with
  // the caret's style; the current style's tile pressed, those that cannot apply here marked so,
  // with the reason in their tooltip. The row keeps one width while it pages, the width of its
  // widest page: a toolbar that moved under the mouse sent a second click to another button.
  paintGallery() {
    const gal = $('#rb-gallery');
    if (!gal) return;
    const st = this.rbStyle || { v: 'p', to: new Set(), on: false }, n = this.rbTiles || 6;
    const list = tileOrder(n, st.v === 'title'), starts = pageStarts(list.length, n);
    let start = Math.min(this.rbStart || 0, starts[starts.length - 1]);
    if (!starts.includes(start)) start = starts.filter((x) => x <= start).pop();
    const at = list.indexOf(st.v);
    if (this.rbFollow && at >= 0 && (at < start || at >= start + n)) start = starts.filter((x) => x <= at).pop();
    this.rbFollow = false;
    this.rbStart = start;
    const view = list.slice(start, start + n), row = gal.querySelector('.rb-tiles');
    // the tiles stand in the order they are seen in, which the arrow keys follow
    const order = list.join() + (list.includes('title') ? '' : ',title');
    if ([...row.children].map((b) => b.dataset.style).join() !== order) { for (const v of list) row.append($('#rb-st-' + v)); if (!list.includes('title')) row.append($('#rb-st-title')); }
    for (const b of row.children) {
      const v = b.dataset.style, can = st.on && (st.to.has(v) || (v === st.v && st.to.size > 0));
      b.hidden = !view.includes(v);
      b.setAttribute('aria-pressed', v === st.v ? 'true' : 'false');
      if (can) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      b.title = b.dataset.tip + (can || v === st.v ? '' : '\n' + this.whyNot(st, v));
    }
    const W = this.rbW;
    if (W) row.style.width = Math.max(...starts.map((k) => list.slice(k, k + n).reduce((sum, v) => sum + W[v], 0))) + 2 * (n - 1) + 'px';
    // the arrows only where there is more than one page
    const paged = starts.length > 1;
    if (gal.classList.contains('paged') !== paged) { gal.classList.toggle('paged', paged); if (!this.rbFitting) requestAnimationFrame(() => this.ribbonFit()); }
    $('#rb-st-up').disabled = !paged || start === starts[0];
    $('#rb-st-down').disabled = !paged || start === starts[starts.length - 1];
  },
  whyNot(st, v) {
    if (!st.on) return WHY.none;
    if (st.why) return st.why;
    if (st.v === '') return v === 'latex' ? WHY.latex : WHY.part;
    return v === 'latex' ? WHY.latex : v === 'quote' ? WHY.quote : HEADS.includes(v) ? WHY.head : WHY.part;
  },
  // the arrows page by n tiles; from the keyboard the focus stays on the strip: an arrow that has
  // reached its end hands it to the other one (it fell to the page's body)
  pageGallery(dir) {
    const st = this.rbStyle || { v: 'p' }, n = this.rbTiles || 6, starts = pageStarts(tileOrder(n, st.v === 'title').length, n);
    const cur = this.rbStart || 0;
    this.rbStart = dir < 0 ? starts.filter((x) => x < cur).pop() ?? starts[0] : starts.find((x) => x > cur) ?? starts[starts.length - 1];
    this.paintGallery();
    const a = document.activeElement;
    if (a && a.closest && a.closest('.rb-gal') && isOff(a)) {
      const to = [$(dir < 0 ? '#rb-st-down' : '#rb-st-up'), ...$('#rb-gallery').querySelectorAll('[data-style]:not([hidden])')].find((x) => x.offsetParent && !isOff(x)) || $('#rb-st-more');
      this.ribbonRove(to);
      to.focus();
    } else this.ribbonRove();
  },

  // The row's room. As Word's gallery does, it shrinks before the other groups fold: six tiles
  // with the insert buttons' names, else five, four or three (LaTeX still in sight), then the same
  // without the Download label; then the names fold and the gallery has six again, down to three;
  // where three do not fit, the style list takes its place. Each tile is as wide as its name,
  // measured here once its fonts are drawn.
  ribbonFit() {
    const rb = $('#ribbon'), gw = $('#rb-gw');
    if (!rb || !gw) return;
    this.rbFitting = true;
    const set = (narrow, fold, n, nolab) => {
      rb.classList.toggle('rb-narrow', narrow); rb.classList.toggle('rb-fold', fold); rb.classList.toggle('rb-nolab', !!nolab);
      if (n !== this.rbTiles) { this.rbTiles = n; this.rbFollow = true; }
      this.paintGallery();
    };
    rb.classList.remove('rb-narrow');
    // (a phone's width has the list whatever the room: the style sheet hides the gallery there)
    const wide = getComputedStyle(gw).display !== 'none';
    if (wide) {
      const row = $('#rb-gallery .rb-tiles'), tiles = [...row.children], was = tiles.map((b) => b.hidden);
      row.style.width = '';
      for (const b of tiles) b.hidden = false;
      this.rbW = Object.fromEntries(tiles.map((b) => [b.dataset.style, b.getBoundingClientRect().width]));
      tiles.forEach((b, k) => { b.hidden = was[k]; });
      for (const [fold, n, nolab] of [[false, 6], [false, 5], [false, 4], [false, 3], [false, 4, 1], [false, 3, 1], [true, 6], [true, 5], [true, 4], [true, 3]]) {
        set(false, fold, n, nolab);
        if (rb.scrollWidth <= rb.clientWidth + 1) { this.rbFitting = false; this.ribbonRove(); return; }
      }
    }
    set(true, true, 6);
    // (the list's row too goes without the Download label where it is longer than the window, as
    // between 861 and 900 px; a phone's row scrolls as it did)
    if (wide && rb.scrollWidth > rb.clientWidth + 1) set(true, true, 6, 1);
    this.rbFitting = false;
    this.ribbonRove();
  },

  // All the styles, from the strip's More button: a menu of them, each drawn in its own look
  openStyles() {
    const more = $('#rb-st-more'), st = this.rbStyle || { v: 'p', to: new Set(), on: false };
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    // a menu named Styles, of the styles alone (no heading or close button among its items:
    // Escape and a press elsewhere close it)
    const p = this.makePop(more, 'pop-dl pop-styles', null);
    p.setAttribute('role', 'menu');
    p.setAttribute('aria-label', 'Styles');
    this.menuKeys(p);
    more.setAttribute('aria-expanded', 'true');
    this.pop.onClose = () => more.setAttribute('aria-expanded', 'false');
    for (const v of ORDER) {
      if (v === 'title' && st.v !== 'title') continue;
      const tile = $('#rb-st-' + v), a = document.createElement('button');
      a.type = 'button'; a.className = 'rb-mi st-' + v; a.setAttribute('role', 'menuitemradio');
      a.setAttribute('aria-checked', v === st.v ? 'true' : 'false'); a.setAttribute('aria-label', tile.getAttribute('aria-label')); a.title = tile.title;
      if (tile.getAttribute('aria-disabled') === 'true') a.setAttribute('aria-disabled', 'true');
      a.append(tile.firstElementChild.cloneNode(true));
      // (a press keeps the caret on the page; the keyboard's Enter comes as a click)
      a.addEventListener('mousedown', (e) => e.preventDefault());
      a.addEventListener('click', () => { if (isOff(a)) return; this.closePop(true); this.ribbonBack(); this.setBlockStyle(v); this.ribbonSync(); });
      p.append(a);
    }
    this.positionPop();
    const first = p.querySelector('[aria-checked="true"]:not([aria-disabled])') || p.querySelector('[role=menuitemradio]:not([aria-disabled])');
    if (first) first.focus();
  },

  // The focus back on the page after a list or a menu took it: the place as it is now if the
  // page still has it; the kept one only when it is still a place in a text of the page (a range
  // whose text was drawn again has collapsed to the page's start)
  ribbonBack() {
    const r = this.rbRange, s = getSelection();
    this.root.focus({ preventScroll: true });
    if (s.rangeCount && this.root.contains(s.anchorNode)) return;
    if (r && r.startContainer.nodeType === 3 && this.root.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
  },

  // one tab stop for the whole ribbon: the control the arrows last reached, or the first that works
  ribbonRove(to) {
    // (of the controls this width shows: a phone has one Download button, a wider screen the three)
    const every = [...$('#ribbon').querySelectorAll('select, button')], all = every.filter((x) => x.offsetParent !== null);
    if (to) this.rbStop = to;
    const cur = this.rbStop && !isOff(this.rbStop) && all.includes(this.rbStop) ? this.rbStop : all.find((x) => !isOff(x));
    for (const x of every) x.tabIndex = x === cur ? 0 : -1;
    return all;
  }
};

export function installRibbon(app) {
  const rb = $('#ribbon');
  if (!rb) return;
  const sel = $('#rb-style');
  // a style that is none of the list's (a list, a table, a theorem) shows as an empty choice
  sel.add(new Option('', ''));
  app.ribbonSoon = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(() => app.ribbonSync(), 60); }; })();
  // A press must not take the caret or the selection off the page: not on a button, and not on
  // a disabled one (which lets the press through to the row, see .rb .btn:disabled), the
  // Download label or the empty part of the row either. Only the style list takes the focus.
  rb.addEventListener('mousedown', (e) => { if (!e.target.closest('select')) e.preventDefault(); });
  rb.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-style]');
    if (t) {
      // (one that cannot apply here does nothing: it stays in reach of the pointer for its tooltip)
      if (!isOff(t)) { app.setBlockStyle(t.dataset.style); app.ribbonSync(); }
      // from the keyboard the focus goes back to the caret, also where nothing changed
      if (document.activeElement === t) app.ribbonBack();
      return;
    }
    const b = e.target.closest('button[data-rb]');
    if (b && !b.disabled) app.ribbonDo(b.dataset.rb);
  });
  // the list takes the focus while it is open: the place on the page is kept and put back
  const keep = () => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange(); };
  const back = () => app.ribbonBack();
  sel.addEventListener('pointerdown', keep);
  sel.addEventListener('focus', keep);
  sel.addEventListener('change', () => { const v = sel.value; back(); app.setBlockStyle(v); app.ribbonSync(); });
  // The list keeps the focus when it is closed with Escape or with the style it already showed.
  // What is typed next is meant for the page: it went into the list, where "H" picked Heading 1.
  sel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); back(); return; }
    if (e.key.length !== 1 || e.key === ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    back();
    app.insertText(e.key);
  });
  // Picture places pictures. Anything else picked there (a .tex would open as a new project in
  // place of this one) is left out and named.
  $('#picinput').addEventListener('change', (e) => {
    const all = [...e.target.files], fs = all.filter((x) => /\.(png|jpe?g|pdf)$/i.test(x.name)), no = all.filter((x) => !fs.includes(x)).map((x) => x.name);
    e.target.value = '';
    back();
    const said = no.length ? no.slice(0, 3).join(', ') + (no.length > 3 ? ' and ' + (no.length - 3) + ' more' : '') + (no.length === 1 ? ' is' : ' are') + ' no picture and ' + (no.length === 1 ? 'was' : 'were') + ' left out: Picture takes PNG, JPEG and PDF files. Open takes the rest.' : '';
    if (!fs.length) { if (said) app.toast(said, 9000); return; }
    app.openFiles(fs).then(() => { if (said) app.toast($('#toast span').textContent + ' ' + said, 10000); });
  });
  // a toolbar: arrows move between its controls (in the style list, up and down pick a style)
  rb.addEventListener('keydown', (e) => {
    // Escape on a button of the row goes back to the caret on the page (the list has its own)
    if (e.key === 'Escape' && e.target.closest('button')) { e.preventDefault(); app.ribbonBack(); return; }
    // (a menu button opens its menu with the down arrow too)
    if (e.key === 'ArrowDown' && e.target.id === 'rb-st-more') { e.preventDefault(); app.openStyles(); return; }
    if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const all = app.ribbonRove().filter((x) => !isOff(x)), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const to = all[e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    app.ribbonRove(to);
    to.focus();
  });
  document.addEventListener('selectionchange', app.ribbonSoon);
  document.addEventListener('focusin', app.ribbonSoon);
  // the gallery's room is measured again when the window's width changes and once the fonts the
  // tiles and the buttons' names are drawn in have come
  let fit = 0, w = innerWidth;
  addEventListener('resize', () => { if (innerWidth === w) return; w = innerWidth; cancelAnimationFrame(fit); fit = requestAnimationFrame(() => app.ribbonFit()); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => app.ribbonFit());
  app.ribbonSync();
  app.ribbonFit();
}
