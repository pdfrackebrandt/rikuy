// What the ribbon's commands share about where the caret is: its element, its item and block on
// the page (ribbonAt), whether a block is one plain paragraph or a quote, the empty footnote, link
// or citation that goes again when it is given up, and the focus put back on the page after a
// control took it. The ribbon itself (tabs, groups, folding, the keyboard) is src/ribbon/tabs.js;
// its commands are src/cmd/*.js. The methods join App's prototype.

import { BLOCKS } from './render.js';
import { NOT_PLAIN, quoteWords } from './styles.js';
import { posFromDom } from './editor.js';
import { mapPos, diffEdit } from './wrap.js';

// the node before n in document order, within root (the last of a previous sibling's subtree)
function prevNode(n, root) {
  if (n.previousSibling) { n = n.previousSibling; while (n.lastChild) n = n.lastChild; return n; }
  return n.parentNode === root ? null : n.parentNode;
}

export const ribbon = {
  // (set by installRibbon; the page's first builds come before it)
  ribbonSoon() {},
  // Where the caret is, for the ribbon: its element, its item on the page and its block. None
  // while the source pane has the focus or the pages are stale: the buttons are then disabled.
  // With no caret on the page (none yet, or a press in the PDF, the side panel or the status bar)
  // the ribbon stands for the document's last selection, as Word's document always keeps one: its
  // both ends, moved with every edit since, or else the document's end. Reading it moves no
  // caret (UI-PRINCIPLES P5): the selection goes there only when a command runs (atRestDo). Not
  // while a field, a dialog or the equation field has the focus, nor over words selected
  // elsewhere: those keep their own place.
  ribbonAt() {
    if (this.stale || !this.model) return null;
    const a = document.activeElement;
    if (a && a.closest && a.closest('#srcpane')) return null;
    const c = this.caretNow();
    if (!c) return this.ribbonAtRest(a);
    const n = getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    const r = getSelection().getRangeAt(0);
    // (the document's selection, kept for when the page has none: its text, so a change made since
    // by any way moves it, and its project's files, so another document drops it)
    if (!c.ghost && !c.crossFile) this.rbLast = { f: c.f, a: c.a, b: c.b, text: this.files.get(c.f), files: this.files };
    return this.atOf(c, el, r);
  },
  atOf(c, el, r) {
    const it = c.ghost ? null : el && el.closest('.it');
    // What the caret is inside, nearest first: a footnote's text and a caption are not items of
    // the page, a cell and bold or italic words lie within one. An equation or a footnote
    // written there would land inside the cell, the braces or the other footnote.
    const near = c.ghost || !el ? null : el.closest('[data-ctx]');
    const end = r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement;
    return { c, el, it, B: it ? BLOCKS.get(+it.dataset.b) : null, ctx: near ? near.dataset.ctx : '', cell: !!(el && el.closest('td')), sty: !!(el && el.closest('[data-y]')),
      multi: !c.ghost && !r.collapsed && !!it && (end && end.closest('.it')) !== it };
  },
  // The kept selection moved with the edits of a step (commit): its start after what is put at it,
  // its end before, as a caret and a selection move (src/cmd/page.js pageEdit)
  restMove(f, edits, text) {
    const L = this.rbLast;
    if (!L || L.f !== f || L.files !== this.files) return;
    // (a place whose words the edit took away is gone: the document's end stands for it, as a new
    // document's text put in place of the old has its end)
    if (edits.some((x) => x.s < L.a && x.e > L.a) || edits.some((x) => x.s < L.b && x.e > L.b)) { this.rbLast = null; return; }
    const one = L.a === L.b, a = mapPos(edits, L.a, 1), b = one ? a : mapPos(edits, L.b, -1);
    L.a = a; L.b = Math.max(a, b); L.text = text;
  },
  // the kept selection as the text is now: a change that came another way (an undo, the source
  // pane, a coauthor) taken as its one edit; none for another document or a place now gone
  restPlace() {
    const L = this.rbLast;
    if (!L || L.files !== this.files || !this.files.has(L.f)) return null;
    const t = this.files.get(L.f);
    if (t !== L.text) {
      const d = diffEdit(L.text, t);
      if (d) this.restMove(L.f, [d], t); else L.text = t;
    }
    return this.rbLast && L.b <= t.length ? L : null;
  },
  // the place the ribbon stands for with no caret on the page (see ribbonAt): the kept selection's
  // range, or a caret at the document's end, read as a caret there would be
  ribbonAtRest(a) {
    // (the page itself with the focus and no selection, as an agent's setSource leaves it when it
    // takes the caret's words away, is no field: the kept place or the document's end stands)
    if (a && a !== document.body && a !== this.root && a.closest && a.closest('input, textarea, select, math-field, [contenteditable="true"], .pop, [role=dialog], .CodeMirror')) return null;
    const sel = getSelection();
    if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return null;
    let rng = null;
    const L = this.index ? this.restPlace() : null;
    if (L) {
      const x = this.index.find(L.f, L.a, 1), y = L.b > L.a ? this.index.find(L.f, L.b, -1) : x;
      if (x && x.node && y && y.node && this.root.contains(x.node) && this.root.contains(y.node)) {
        rng = document.createRange();
        rng.setStart(x.node, x.offset);
        try { rng.setEnd(y.node, y.offset); } catch (e) { rng.collapse(true); }
      }
    }
    if (!rng) {
      // the document's end: the last words of the last paragraph on the page
      let n = this.root;
      while (n.lastChild) n = n.lastChild;
      for (; n && n !== this.root; n = prevNode(n, this.root)) {
        if (n.nodeType === 3 && n.nodeValue.trim() && n.parentElement && n.parentElement.closest('.it.p') && !n.parentElement.closest('[contenteditable="false"]')) {
          rng = document.createRange(); rng.setStart(n, n.nodeValue.length); rng.collapse(true); break;
        }
      }
    }
    if (!rng) return null;
    const A = posFromDom(rng.startContainer, rng.startOffset, this.root);
    if (!A || A.ghost) return null;
    let B = rng.collapsed ? A : posFromDom(rng.endContainer, rng.endOffset, this.root);
    if (!B || B.ghost || B.f !== A.f) B = A;
    const lo = Math.min(A.p, B.p), hi = Math.max(A.p, B.p);
    const c = { f: A.f, p: A.p, a: lo, b: hi, collapsed: lo === hi, range: rng, rest: true };
    const n = rng.startContainer;
    return this.atOf(c, n.nodeType === 1 ? n : n.parentElement, rng);
  },
  // fn with the selection at a place read with no caret on the page (ribbonAtRest), as the commands
  // read a caret: from the selection; it stays there (a command runs there). The browser gives the
  // page the focus with a selection put in it: the focus stays where it was (a button of the bar a
  // popover gave it back to, or nowhere).
  atRestDo(at, fn) {
    if (!at || !at.c || !at.c.rest) return fn();
    const sel = getSelection(), f = document.activeElement;
    sel.removeAllRanges(); sel.addRange(at.c.range.cloneRange());
    if (document.activeElement !== f) {
      if (f && f !== document.body && f.focus) f.focus({ preventScroll: true });
      else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    return fn();
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

  // an environment of a paragraph style (quote, quotation, verse, a theorem, the document's own) as
  // a block of its own: its name, where its words are, whether it has an [option] (a theorem's
  // title), whether they are one paragraph and whether a heading could hold them
  quoteOf(B) {
    const src = this.src(B.f), q = quoteWords(src, B.s, B.e, this.styleEnvNames ? this.styleEnvNames() : undefined);
    if (!q) return null;
    const { ws, we } = q, words = src.slice(ws, we);
    const opt = /^\\begin\s*\{[^{}]*\}\s*\[/.test(src.slice(B.s, Math.min(ws, B.s + 300)));
    const one = we > ws && !/\\begin\s*\{|\\\[|\$\$|\n[ \t]*\n/.test(words);
    return { name: q.name, ws, we, opt, one, plain: one && !NOT_PLAIN.test(words) && words[0] !== '%' };
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

  // The focus back on the page after a list or a menu took it: the place as it is now if the
  // page still has it; the kept one only when it is still a place in a text of the page (a range
  // whose text was drawn again has collapsed to the page's start)
  ribbonBack() {
    const r = this.rbRange, s = getSelection();
    this.root.focus({ preventScroll: true });
    if (s.rangeCount && this.root.contains(s.anchorNode)) return;
    if (r && r.startContainer.nodeType === 3 && this.root.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
  }
};
