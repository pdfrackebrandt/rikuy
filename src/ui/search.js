// Word's search box, "Search" in the bar (Alt+Q): any command by its name, one of its other
// names ("Bullets" finds Bulleted list) or its item of the insert list, run where the caret is.
// The list shows what cannot run there faded, and says why when it is picked. Only the
// registry's names and the text typed into the box are shown here, never the document's text.

import { search, enabled } from '../commands.js';
import { tabById } from '../ribbon/order.js';
import { $, mk } from './dom.js';

const MAX = 12;

export const methods = {
  // Alt+Q: the focus to the box, with what it held selected; the place on the page is kept
  openSearch() {
    const inp = $('#rk-search');
    if (!inp) return;
    this.keepPlace();
    inp.focus();
    inp.select();
  },
  // the place kept, back on the page: a field took the document's selection with the focus, so
  // the page's focus alone would put the caret at its start
  backToPlace() {
    const r = this.rbRange, s = getSelection();
    this.root.focus({ preventScroll: true });
    if (r && r.startContainer.isConnected && this.root.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
  },
  // where the caret is on the page, kept while a field of the bar has the focus
  keepPlace() {
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) { this.rbRange = s.getRangeAt(0).cloneRange(); this.searchAt = this.ribbonAt(); }
  }
};

export function installSearch(app) {
  const inp = $('#rk-search'), list = $('#rk-search-list');
  if (!inp) return;
  let hits = [], hi = 0;
  const where = (c) => {
    const t = c.tab && tabById(c.tab);
    if (t) return t.name;
    if (c.place === 'bar') return 'Top bar';
    if (c.place === 'download') return 'Download';
    if (c.place === 'status') return 'Status bar';
    if (c.palette) return 'Insert list';
    if (c.menu) return 'Right click menu';
    return '';
  };
  const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); };
  const draw = () => {
    hits = search(inp.value, { max: MAX });
    hi = Math.min(hi, Math.max(0, hits.length - 1));
    list.replaceChildren();
    if (!inp.value.trim()) { close(); return; }
    const at = app.searchAt ?? null;
    if (at) at.memo = {};
    if (!hits.length) {
      const none = mk('div', 'srch-none', 'No command by that name. Try another word, or \\ on the page for the insert list.');
      list.append(none);
    }
    hits.forEach((c, i) => {
      const o = mk('div', 'srch-opt' + (i === hi ? ' on' : ''));
      o.id = 'rk-so-' + i;
      o.setAttribute('role', 'option');
      o.setAttribute('aria-selected', i === hi ? 'true' : 'false');
      if (!enabled(app, c, at)) { o.classList.add('off'); o.setAttribute('aria-disabled', 'true'); }
      o.append(mk('span', 'srch-n', c.name));
      const w = where(c), k = (c.keys || c.keysElsewhere || [])[0];
      if (w) o.append(mk('span', 'srch-w', w));
      if (k) { const kk = mk('span', 'srch-k', k); kk.setAttribute('aria-hidden', 'true'); o.append(kk); }
      if (c.title && c.title !== c.name) o.title = c.title;
      o.addEventListener('mousedown', (e) => e.preventDefault());
      o.addEventListener('click', () => go(i));
      list.append(o);
    });
    list.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
    if (hits.length) inp.setAttribute('aria-activedescendant', 'rk-so-' + hi); else inp.removeAttribute('aria-activedescendant');
  };
  // the command picked runs at the place on the page; one that cannot says why
  const go = (i) => {
    const c = hits[i];
    if (!c) return;
    inp.value = '';
    close();
    app.backToPlace();
    app.searchAt = null;
    const at = app.ribbonAt();
    if (at) at.memo = {};
    if (!enabled(app, c, at)) {
      const why = c.whyNot ? c.whyNot(app, at) : null;
      app.toast(why || (at ? c.name + ' does not apply here.' : 'Click in the text of the page first, then ' + c.name + '.'), 5000);
      return;
    }
    app.runCommand(c.id, null, at);
  };
  inp.addEventListener('pointerdown', () => app.keepPlace());
  inp.addEventListener('focus', () => { if (!app.searchAt) app.keepPlace(); });
  inp.addEventListener('input', () => { hi = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden && inp.value.trim()) { draw(); return; }
      if (!hits.length) return;
      hi = (hi + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      draw();
      const o = $('#rk-so-' + hi);
      if (o) o.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); go(hi); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      if (inp.value) { inp.value = ''; close(); } else { close(); app.searchAt = null; app.backToPlace(); }
    }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) { close(); app.searchAt = null; } }, 120));
  // (a name for each command in the list, and its other names: test/tabs.py)
  app.searchCommands = (q) => search(q, { max: MAX }).map((c) => ({ id: c.id, name: c.name }));
}
