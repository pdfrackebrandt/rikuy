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
// where a % starts a comment in this line, or -1: \% is the sign, \\% a line break and then a comment
function commentIn(line) {
  for (let i = 0; i < line.length; i++) { if (line[i] === '\\') i++; else if (line[i] === '%') return i; }
  return -1;
}
// The blank lines a paragraph needs before s and after e to stay a paragraph of its own: without
// one TeX runs it into the words beside it. None where one is there, where the text starts or
// ends, or where the neighbour is no paragraph (a heading, the end or the start of a block).
const HEADING_LINE = /^\s*\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\b.*\}\s*$/;
function blankPads(src, s, e) {
  const before = src.slice(0, s), after = src.slice(e);
  const prev = before.trimEnd().split('\n').pop(), next = after.trimStart().split('\n')[0];
  const closed = /\\(?:(?:begin|end)\s*\{[^}]*\}|maketitle|\]|par)\s*$/.test(prev) || HEADING_LINE.test(prev);
  const opens = /^\\(?:(?:begin|end)\s*\{|\[|item\b|bibliography)/.test(next) || HEADING_LINE.test(next);
  return {
    b: !before.trim() || closed || /(^|\n)[ \t]*\n[ \t]*$/.test(before) ? '' : /\n[ \t]*$/.test(before) ? '\n' : '\n\n',
    a: !after.trim() || opens || /^[ \t]*\n[ \t]*\n/.test(after) ? '' : /^[ \t]*\n/.test(after) ? '\n' : '\n\n'
  };
}
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

  // the style of the caret's block: v is 'p', 'title', a heading's command or '' (something
  // else: a list, a table, a theorem); can says whether the ribbon may change it
  blockStyle(at) {
    const { c, it, B } = at;
    if (c.ghost) return { v: 'p', can: true };
    if (!it || !B) return { v: '', can: false };
    // a selection that runs over several paragraphs: the list would change only the first
    if (at.multi) return { v: it.dataset.ctx === 'p' ? 'p' : '', can: false };
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
      edits = [{ f, s: r.e, e: r.e, t: commentIn(last) >= 0 ? '\n}' : '}' }, { f, s: r.s, e: r.s, t: open }];
      p = Math.max(c.a, r.s) + open.length;
    } else {
      const m = HEAD.exec(src.slice(B.s, B.e));
      if (to === 'p') {
        const lab = /^[ \t]*\\label\s*\{[^}]*\}/.exec(src.slice(B.e)), q = B.e + (lab ? lab[0].length : 0);
        const { b: padB, a: padA } = blankPads(src, B.s, q);
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
    p.setAttribute('role', 'menu');
    for (const id of ['rb-pdf', 'rb-word', 'b-save']) {
      const b = $('#' + id), a = document.createElement('button');
      a.type = 'button'; a.className = 'nav-act'; a.setAttribute('role', 'menuitem'); a.title = b.title;
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
    const L = at && this.listAt(at);
    const tight = !!at && (/^(h|ttl|cell|cap|fn)$/.test(at.ctx) || at.cell);
    for (const b of rb.querySelectorAll('button[data-rb]')) {
      const act = b.dataset.rb;
      if (act.startsWith('dl-')) continue;
      let off = !at, on = null;
      if (act in STYLES) { off = !at || !!at.c.ghost; on = !off && inside(STYLES[act]); }
      else if (act === 'itemize' || act === 'enumerate') { on = !!L && L.kind === act; off = !L || (on && L.labelled); }
      // Table and Picture go after the caret's block wherever the caret is, so they stay on
      else if (act === 'equation') off = !at || tight || at.sty;
      else if (act === 'footnote') off = !at || tight;
      b.disabled = off;
      if (on !== null) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // (the title reads every file for a live graph: once for each build of the page, not for each move of the caret)
    if (this.rbModel !== this.model) { this.rbModel = this.model; this.saveTitle(); }
    this.ribbonRove();
  },
  // one tab stop for the whole ribbon: the control the arrows last reached, or the first that works
  ribbonRove(to) {
    // (of the controls this width shows: a phone has one Download button, a wider screen the three)
    const every = [...$('#ribbon').querySelectorAll('select, button')], all = every.filter((x) => x.offsetParent !== null);
    if (to) this.rbStop = to;
    const cur = this.rbStop && !this.rbStop.disabled && all.includes(this.rbStop) ? this.rbStop : all.find((x) => !x.disabled);
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
  rb.addEventListener('click', (e) => { const b = e.target.closest('button[data-rb]'); if (b && !b.disabled) app.ribbonDo(b.dataset.rb); });
  // the list takes the focus while it is open: the place on the page is kept and put back
  const keep = () => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange(); };
  // (the place as it is now if the page still has it; the kept one only when it is still a place
  // in a text of the page: a range whose text was drawn again has collapsed to the page's start)
  const back = () => {
    const r = app.rbRange, s = getSelection();
    app.root.focus({ preventScroll: true });
    if (s.rangeCount && app.root.contains(s.anchorNode)) return;
    if (r && r.startContainer.nodeType === 3 && app.root.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
  };
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
