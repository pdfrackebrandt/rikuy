// The ribbon: the row under the bar with what a word processor keeps at hand. The style of the
// paragraph the caret is in, bold, italic and underline, lists, the things to insert, and the
// three downloads. Every button runs an edit the editor already has, or one small patch of the
// source made here (a paragraph to a heading and back, paragraphs to a list and back): one
// commit, so one undo step restores the source byte for byte. The methods join App's prototype.

import { BLOCKS } from './render.js';
import { styOfEl } from './editor.js';

const $ = (s, r = document) => r.querySelector(s);
const HEAD = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(\[[^\]]*\])?\s*\{/;
const STYLES = { textbf: ['textbf', 'bf', 'bfseries'], emph: ['emph', 'textit', 'it', 'itshape'], underline: ['underline', 'uline'] };
// what cannot go inside a heading's braces or one list item without changing what TeX does
const NOT_PLAIN = /\\begin\s*\{|\\end\s*\{|\\\[|\$\$|\\footnote\b|\\item\b|\n[ \t]*\n/;
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
    return { c, el, it, B: it ? BLOCKS.get(+it.dataset.b) : null };
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

  // the style of the caret's block: v is 'p', 'title', a heading's command or '' (something
  // else: a list, a table, a theorem); can says whether the ribbon may change it
  blockStyle(at) {
    const { c, it, B } = at;
    if (c.ghost) return { v: 'p', can: true };
    if (!it || !B) return { v: '', can: false };
    if (it.dataset.ctx === 'ttl') return { v: 'title', can: false };
    if (it.dataset.ctx === 'h') {
      const src = this.src(B.f), m = HEAD.exec(src.slice(B.s, B.e));
      const known = !!m && /^(sub){0,2}section$/.test(m[1]);
      return { v: known ? m[1] : '', can: known && src[B.e - 1] === '}' };
    }
    return this.plainPara(B, it) ? { v: 'p', can: true } : { v: it.dataset.ctx === 'p' && B.items.length === 1 ? 'p' : '', can: false };
  },

  // Normal text, Heading 1 to 3: the caret's paragraph becomes that heading, a heading becomes a
  // paragraph or another level. The words are not touched: the command and its braces go around
  // them or away, and a heading turned into a paragraph keeps a blank line on each side, or
  // TeX would run it into its neighbours.
  setBlockStyle(to) {
    const at = this.ribbonAt();
    if (!at) return;
    const { c, it, B } = at, cur = this.blockStyle(at);
    if (!cur.can || cur.v === to || !(to === 'p' || /^(sub){0,2}section$/.test(to))) return;
    this.closeGroup();
    if (c.ghost) { this.insertPiece(null, this.ghost, '\\' + to + '{', '}'); this.closeGroup(); return; }
    const f = B.f, src = this.src(f);
    let edits, p = c.a;
    if (cur.v === 'p') {
      const r = this.plainPara(B, it), open = '\\' + to + '{';
      // a comment on the last line would take the closing brace with it
      const last = src.slice(src.lastIndexOf('\n', r.e - 1) + 1, r.e);
      edits = [{ f, s: r.e, e: r.e, t: /(^|[^\\])%/.test(last) ? '\n}' : '}' }, { f, s: r.s, e: r.s, t: open }];
      p = Math.max(c.a, r.s) + open.length;
    } else {
      const m = HEAD.exec(src.slice(B.s, B.e));
      if (to === 'p') {
        const lab = /^[ \t]*\\label\s*\{[^}]*\}/.exec(src.slice(B.e)), q = B.e + (lab ? lab[0].length : 0);
        const after = src.slice(q), before = src.slice(0, B.s);
        const padA = !after.trim() || /^[ \t]*\n[ \t]*\n/.test(after) || /^\s*\\end\s*\{document\}/.test(after) ? '' : /^[ \t]*\n/.test(after) ? '\n' : '\n\n';
        const padB = /(^|\n)[ \t]*\n[ \t]*$/.test(before) || /\\begin\s*\{document\}\s*$/.test(before) ? '' : /\n[ \t]*$/.test(before) ? '\n' : '\n\n';
        edits = [{ f, s: q, e: q, t: padA }, { f, s: B.e - 1, e: B.e, t: '' }, { f, s: B.s, e: B.s + m[0].length, t: padB }].filter((x) => x.s !== x.e || x.t);
        p = Math.min(Math.max(c.a, B.s + m[0].length), B.e - 1) - m[0].length + padB.length;
      } else {
        edits = [{ f, s: B.s + 1, e: B.s + 1 + m[1].length, t: to }];
        p = c.a + (c.a > B.s ? to.length - m[1].length : 0);
      }
    }
    this.commit(edits, { f, p, bias: -1 }, 'block');
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
      return { kind: bm[1], f: B.f, is, ie, ls, le, cmdE, bodyS: ls + bm[0].length, bodyE: ls + em.index, begin: bm[0], end: em[0].trim() };
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
        const open = (k ? '' : '\\begin{' + kind + '}\n') + '  \\item ';
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
      const before = src.slice(L.bodyS, L.is).trim(), after = src.slice(L.ie, L.bodyE).trim();
      const raw = src.slice(L.cmdE, L.ie), text = raw.trim();
      const head = before ? L.begin + '\n  ' + before + '\n' + L.end + '\n\n' : '';
      const out = head + text + (after ? '\n\n' + L.begin + '\n  ' + after + '\n' + L.end : '');
      const off = Math.min(text.length, Math.max(0, c.a - L.cmdE - (raw.length - raw.trimStart().length)));
      this.commit([{ f, s: L.ls, e: L.le, t: out }], { f, p: L.ls + head.length + off, bias: -1 }, 'block');
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

  hasLive() { return [...this.files].some(([n, t]) => /\.tex$/i.test(n) && /(^|[^\\%])\\rikuywidget\b/m.test(t)); },
  // PDF and Word hold a live graph as its picture: said once for each document
  liveNote() {
    const k = this.name + '|' + this.main;
    if (!this.hasLive() || this.liveTold === k) return;
    this.liveTold = k;
    this.toast(LIVE_NOTE, 9000);
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

  // one press of a ribbon button (data-rb)
  async ribbonDo(act) {
    if (act in STYLES) this.toggleStyle(act);
    else if (act === 'itemize' || act === 'enumerate') this.toggleList(act);
    else if (act === 'math') this.newMath();
    else if (act === 'equation') this.newDisplayMath();
    else if (act === 'table') this.insertTable();
    else if (act === 'picture') { const s = getSelection(); this.rbRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; $('#picinput').click(); }
    else if (act === 'footnote' || act === 'cite' || act === 'url') this.insertFromPalette(act);
    else if (act === 'dl-tex') await this.save();
    else if (act === 'dl-word') { await this.saveDocx(); this.liveNote(); }
    else if (act === 'dl-pdf') await this.downloadPdfNow();
    this.ribbonSync();
  },

  // what the ribbon shows for where the caret is now: the style, the pressed buttons, and which
  // buttons can do nothing here and so are disabled
  ribbonSync() {
    const rb = $('#ribbon');
    if (!rb) return;
    const at = this.ribbonAt(), st = at ? this.blockStyle(at) : { v: 'p', can: false };
    const sel = $('#rb-style');
    for (const o of sel.options) {
      if (o.value === 'title') o.hidden = o.disabled = st.v !== 'title';
      else if (o.value === '') o.hidden = o.disabled = st.v !== '';
      else o.disabled = !st.can;
    }
    sel.value = st.v;
    sel.disabled = !at || !st.can;
    const inside = (names) => { for (let n = at && at.el; n && n !== this.root; n = n.parentElement) if (n.dataset && n.dataset.y) { const y = styOfEl(n); if (y && names.includes(y.cmd)) return true; } return false; };
    const L = at && this.listAt(at), ctx = at && at.it ? at.it.dataset.ctx : '';
    for (const b of rb.querySelectorAll('button[data-rb]')) {
      const act = b.dataset.rb;
      if (act.startsWith('dl-')) continue;
      let off = !at, on = null;
      if (act in STYLES) { off = !at || !!at.c.ghost; on = !off && inside(STYLES[act]); }
      else if (act === 'itemize' || act === 'enumerate') { off = !L; on = !!L && L.kind === act; }
      else if (act === 'equation') off = !at || /^(h|ttl|cell|cap)$/.test(ctx);
      b.disabled = off;
      if (on !== null) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    this.saveTitle();
    this.ribbonRove();
  },
  // one tab stop for the whole ribbon: the control the arrows last reached, or the first that works
  ribbonRove(to) {
    const all = [...$('#ribbon').querySelectorAll('select, button')];
    if (to) this.rbStop = to;
    const cur = this.rbStop && !this.rbStop.disabled ? this.rbStop : all.find((x) => !x.disabled);
    for (const x of all) x.tabIndex = x === cur ? 0 : -1;
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
  // a press must not take the caret or the selection off the page
  rb.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  rb.addEventListener('click', (e) => { const b = e.target.closest('button[data-rb]'); if (b && !b.disabled) app.ribbonDo(b.dataset.rb); });
  // the list takes the focus while it is open: the place on the page is kept and put back
  const keep = () => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange(); };
  const back = () => { const r = app.rbRange, s = getSelection(); if (r && app.root.contains(r.startContainer)) { app.root.focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(r); } };
  sel.addEventListener('pointerdown', keep);
  sel.addEventListener('focus', keep);
  sel.addEventListener('change', () => { const v = sel.value; back(); app.setBlockStyle(v); app.ribbonSync(); });
  $('#picinput').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; back(); if (fs.length) app.openFiles(fs); });
  // a toolbar: arrows move between its controls (in the style list, up and down pick a style)
  rb.addEventListener('keydown', (e) => {
    if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const all = app.ribbonRove().filter((x) => !x.disabled), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const to = all[e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    app.ribbonRove(to);
    to.focus();
  });
  document.addEventListener('selectionchange', app.ribbonSoon);
  document.addEventListener('focusin', app.ribbonSoon);
  app.ribbonSync();
}
