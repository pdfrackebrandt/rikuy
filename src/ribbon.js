// What the ribbon's commands share about where the caret is: its element, its item and block on
// the page (ribbonAt), whether a block is one plain paragraph or a quote, the empty footnote, link
// or citation that goes again when it is given up, and the focus put back on the page after a
// control took it. The ribbon itself (tabs, groups, folding, the keyboard) is src/ribbon/tabs.js;
// its commands are src/cmd/*.js. The methods join App's prototype.

import { BLOCKS } from './render.js';
import { NOT_PLAIN, quoteWords } from './styles.js';
import { posFromDom } from './editor.js';

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
  // With no caret on the page at all (none yet, or a press in the PDF or the side panel) the page
  // gets one back, as Word's always has one: at the last place it was, or else the document's end
  // (the selection only: the focus stays where it is). Not while a field, a dialog or the equation
  // field has the focus, nor over words selected elsewhere: those keep their own place.
  ribbonAt() {
    if (this.stale || !this.model) return null;
    const a = document.activeElement;
    if (a && a.closest && a.closest('#srcpane')) return null;
    const c = this.caretNow();
    if (!c) return this.ribbonAtRest(a);
    const n = getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    const r = getSelection().getRangeAt(0);
    if (!c.ghost) this.rbLast = { f: c.f, p: c.b };
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
  // the caret given back to the page when it has none (see ribbonAt)
  ribbonAtRest(a) {
    if (a && a !== document.body && a.closest && a.closest('input, textarea, select, math-field, [contenteditable="true"], .pop, [role=dialog], .CodeMirror')) return null;
    const sel = getSelection();
    if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return null;
    let at = null;
    const L = this.rbLast;
    const x = L && this.files.has(L.f) && this.index ? this.index.find(L.f, L.p, -1) : null;
    if (x && x.node && this.root.contains(x.node)) at = { node: x.node, offset: x.offset };
    if (!at) {
      // the document's end: the last words of the last paragraph on the page
      let n = this.root;
      while (n.lastChild) n = n.lastChild;
      for (; n && n !== this.root; n = prevNode(n, this.root)) {
        if (n.nodeType === 3 && n.nodeValue.trim() && n.parentElement && n.parentElement.closest('.it.p')) { at = { node: n, offset: n.nodeValue.length }; break; }
      }
    }
    if (!at) return null;
    const A = posFromDom(at.node, at.offset, this.root);
    if (!A || A.ghost) return null;
    // (every command reads the place as it reads a caret put there by a press: the selection)
    sel.collapse(at.node, at.offset);
    const c = this.caretNow();
    return c ? this.atOf(c, at.node.nodeType === 1 ? at.node : at.node.parentElement, sel.getRangeAt(0)) : null;
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
