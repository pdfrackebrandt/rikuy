// The right click menu on the page, as Word's: what applies where the press was, from the command
// registry (each command's menu field says in which contexts it is listed: a selection, a table,
// a list, a heading, plain text). It replaces the browser's menu on the page alone; a second
// right click, one with Shift held, or Shift+F10 or the menu key pressed again while it is open
// gives the browser's (its spelling suggestions, until Rikuy has its own). Shift+F10 and the menu
// key open it at the caret. A long press on a touch screen keeps the system's own menu (select,
// paste). Only the registry's names are shown, never the document's text.

import { menuItems, enabled } from '../commands.js';
import { chordText } from '../keys.js';
import { openMenu } from './kit.js';

export const methods = {
  // the contexts of where the caret is, the most particular first
  menuContexts(at) {
    if (!at) return [];
    const out = [];
    // (a picture selected on the page: its own items first, B8)
    if (this.armed && this.armed.kind === 'img' && this.armed.el && this.armed.el.isConnected) out.push('picture');
    if (at.cell) out.push('table');
    if (at.it && at.it.dataset.li) out.push('list');
    if (at.ctx === 'h') out.push('heading');
    if (!at.c.ghost && !at.c.collapsed) out.push('selection');
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
    const items = menuItems(this.menuContexts(at)).filter((c) => !c || c.only !== 'claude' || document.body.classList.contains('has-ai')).map((c) => c && {
      name: c.name, title: c.title, keys: chordText((c.keys || c.keysElsewhere || [])[0]), disabled: !enabled(this, c, at),
      run: () => { this.ribbonBack(); this.runCommand(c.id); }
    });
    if (!items.length) return false;
    items.push(null, { name: 'Right click again for the browser\'s menu', title: 'Its spelling suggestions too; or hold Shift as you right click, or press Shift+F10 again', disabled: true, cls: 'mi-hint' });
    let rect;
    if (x != null) rect = new DOMRect(x, y, 0, 0);
    else {
      const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
      rect = r && (r.width || r.height) ? new DOMRect(r.left, r.bottom, 0, 0) : this.root.getBoundingClientRect();
    }
    // closed with nothing picked (Escape, a press elsewhere), the focus goes back to the page
    const menu = openMenu(this, rect, items, { label: 'Context menu', cls: 'pop-ctx', onClose: () => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) this.ribbonBack(); }, 0) });
    // Shift+F10 or the menu key again: Rikuy's menu goes and the browser's comes (the key is let
    // through, with the focus back on the page)
    menu.addEventListener('keydown', (e) => {
      if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu' || e.key === 'Apps')) return;
      this.ctxPass = Date.now();
      this.closePop(true);
      this.ribbonBack();
    });
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
    if (touch && Date.now() - touch < 2000) return;
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
