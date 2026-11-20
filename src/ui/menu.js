// The right click menu on the page, as Word's: what applies where the press was, from the command
// registry (each command's menu field says in which contexts it is listed: a selection, a table,
// a list, a heading, plain text). It replaces the browser's menu on the page alone; a second
// right click, one with Shift held, or Shift+F10 or the menu key pressed again while it is open
// gives the browser's. Shift+F10 and the menu key open it at the caret. A long press on a touch
// screen keeps the system's own menu (select, paste), but on a word spelling marks it opens this
// menu with the word's suggestions (src/cmd/review.js spellMenuItems). Names are the registry's
// and, for a marked word, the dictionary's suggestions, always set as text.

import { menuItems, enabled } from '../commands.js';
import { firstKey, macUA } from '../keys.js';

// A command's words in the menu as Word's menus write them (UI-PRINCIPLES.md C11): every word
// capitalised but the small ones inside ("Select Heading and Content"), four words at most
// (menuName), "…" after one that opens a dialog. Its accessible name stays its name, the one
// agents and the search box use.
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);
// at the menu's end, under one line: where the LaTeX is, and Next Tab Stop (Word's menu ends with
// its own); a heading's four expand and collapse commands, one item, Word's Expand/Collapse
const TAIL = ['show-latex', 'show-in-source', 'tab-next'];
const FOLDS = ['heading-expand', 'heading-collapse', 'headings-expand-all', 'headings-collapse-all'];
export function menuLabel(c) {
  const words = (c.menuName || c.name).split(' ').map((w, i) => (i && SMALL.has(w) ? w : /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w));
  return words.join(' ') + (c.dialog && !/…$/.test(c.name) ? '…' : '');
}
import { openMenu } from './kit.js';

export const methods = {
  // the contexts of where the caret is, the most particular first
  menuContexts(at) {
    if (!at) return [];
    const out = [];
    // (a picture selected on the page: its own items first, B8)
    if (this.armed && this.armed.kind === 'img' && this.armed.el && this.armed.el.isConnected) out.push('picture');
    if (at.cell) out.push('table');
    // an interactive graph armed or in the caret's block: Edit graph (src/cmd/insert.js)
    if (this.graphHere && this.graphHere(at)) out.push('graph');
    if (at.it && at.it.dataset.li) out.push('list');
    if (at.ctx === 'h') out.push('heading');
    // (B9: a link at the caret, src/cmd/refs.js)
    if (this.linkAt(at)) out.push('link');
    if (!at.c.ghost && !at.c.collapsed) out.push('selection');
    // (a line a comment hangs under: Edit Comment, src/cmd/review.js)
    if (this.commentHere && this.commentHere()) out.push('comment');
    out.push('text');
    return out;
  },

  // The menu at a point (a right click) or, without one, under the caret
  openContextMenu(x, y) {
    const at = this.ribbonAt();
    if (!at) return false;
    at.memo = {};
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    // (Ask Claude only inside Claude)
    const item = (c) => c && {
      name: c.name, label: menuLabel(c), title: c.title, keys: firstKey(c, macUA()), disabled: !enabled(this, c, at), submenu: c.kind === 'menu' || !!c.submenu,
      run: () => { this.ribbonBack(); this.runCommand(c.id); }
    };
    let list = menuItems(this.menuContexts(at)).filter((c) => !c || c.only !== 'claude' || document.body.classList.contains('has-ai'));
    const tail = list.filter((c) => c && TAIL.includes(c.id)).sort((a, b) => TAIL.indexOf(a.id) - TAIL.indexOf(b.id)), folds = list.filter((c) => c && FOLDS.includes(c.id));
    list = list.filter((c) => !c || (!TAIL.includes(c.id) && !FOLDS.includes(c.id)));
    // (no line twice, none first or last)
    list = list.filter((c, i) => c || (i > 0 && list[i - 1] && i < list.length - 1));
    const items = list.map(item);
    if (folds.length) {
      const fold = { name: 'Expand/Collapse', label: 'Expand/Collapse', title: 'Expand or collapse this heading, or all of them (Alt+Shift++ and Alt+Shift+-)', submenu: true, disabled: folds.every((c) => !enabled(this, c, at)),
        run: () => { this.ribbonBack(); openMenu(this, this.ctxXY ? new DOMRect(this.ctxXY[0], this.ctxXY[1], 0, 0) : this.root.getBoundingClientRect(), folds.map(item), { label: 'Expand/Collapse' }); } };
      // (after the heading's other items)
      let k = -1;
      list.forEach((c, i) => { if (c && c.menu && c.menu.heading != null) k = i; });
      items.splice(k + 1, 0, fold);
    }
    if (tail.length) items.push(null, ...tail.map(item));
    // a word spelling marks: Hunspell's suggestions first, Ignore All, Add to Dictionary (src/cmd/review.js)
    const sp = this.spellMenuItems ? this.spellMenuItems(at) : null;
    if (sp) items.unshift(...sp.items);
    if (!items.length) return false;
    items.push(null, { name: 'Right click again for the browser\'s menu', title: 'Its spelling suggestions too; or hold Shift as you right click, or press Shift+F10 again', disabled: true, cls: 'mi-hint' });
    let rect;
    if (x != null) rect = new DOMRect(x, y, 0, 0);
    else {
      const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
      rect = r && (r.width || r.height) ? new DOMRect(r.left, r.bottom, 0, 0) : this.root.getBoundingClientRect();
    }
    // closed with nothing picked (Escape, a press elsewhere), the focus goes back to the page
    this.ctxXY = x != null ? [x, y] : null;
    const menu = openMenu(this, rect, items, { label: 'Context menu', cls: 'pop-ctx', ring: x == null, onClose: () => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) this.ribbonBack(); }, 0) });
    // Shift+F10 or the menu key again: Rikuy's menu goes and the browser's comes (the key is let
    // through, with the focus back on the page)
    menu.addEventListener('keydown', (e) => {
      if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu' || e.key === 'Apps')) return;
      this.ctxPass = Date.now();
      this.closePop(true);
      this.ribbonBack();
    });
    if (this.pop) this.pop.spellKey = sp ? sp.key : null;
    this.ctxT = Date.now();
    return true;
  }
};

export function installMenu(app) {
  // whether Rikuy's menu was open when a right press came: the second one is the browser's
  let wasOpen = false, touch = 0;
  document.addEventListener('mousedown', (e) => { if (e.button === 2) wasOpen = !!(app.pop && app.pop.el.classList.contains('pop-ctx')); }, true);
  app.root.addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch' ? Date.now() : 0; }, true);
  // Windows sends the menu key's contextmenu as the key comes up, to what has the focus by then:
  // Rikuy's own menu, just opened. Nothing more opens over it.
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.pop-ctx')) e.preventDefault(); }, true);
  app.root.addEventListener('contextmenu', (e) => {
    if (e.shiftKey || wasOpen) { wasOpen = false; if (app.pop) app.closePop(true); return; }
    // (asked for again by its key, or a long press on a touch screen: the browser's or the system's)
    if (Date.now() - (app.ctxPass || 0) < 1500) { app.ctxPass = 0; return; }
    // (except on a word spelling marks: its suggestions, as a phone's own keyboard offers them)
    if (touch && Date.now() - touch < 2000) {
      const p = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (!(p && app.spellAtPoint && app.spellAtPoint(p))) return;
      e.preventDefault();
      const s = getSelection(); s.removeAllRanges(); s.addRange(p);
      app.openContextMenu(e.clientX, e.clientY);
      return;
    }
    // (the menu key and Shift+F10 opened it already)
    if (Date.now() - (app.ctxT || 0) < 400) { e.preventDefault(); return; }
    // a press outside the selection puts the caret there first, as Word does
    const s = getSelection();
    const p = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    const inSel = s.rangeCount && !s.isCollapsed && p && s.getRangeAt(0).isPointInRange(p.startContainer, p.startOffset);
    if (!inSel && p && app.root.contains(p.startContainer)) { s.removeAllRanges(); s.addRange(p); }
    if (app.openContextMenu(e.clientX, e.clientY)) e.preventDefault();
  });
}
