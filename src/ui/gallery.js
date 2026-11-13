// The Styles gallery, as Word's: one bordered box of tiles, each the style's name drawn in that
// style's own look, the current one pressed, those that cannot apply here marked so with the
// reason in their tooltip; arrows page through the tiles where they do not all fit, More opens
// them all as a menu; and on a narrow window the style list in its place. The styles themselves
// are src/cmd/styles.js's (blockStyle, setBlockStyle); the ribbon's fitting (src/ribbon/tabs.js)
// says how many tiles there is room for. The methods join App's prototype.

import { $ } from './dom.js';
import { WHY, HEADS } from '../cmd/styles.js';

// a control the toolbar's arrows skip: disabled, or a tile that cannot apply here
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
// The Styles gallery's order, the one the list behind More keeps
export const ORDER = ['p', 'title', 'section', 'subsection', 'subsubsection', 'latex', 'quote'];
// The tiles in their order for n in view: LaTeX moves up to the last place of the first page
// where it would not be on it (Normal, Heading 1, LaTeX for three)
export function tileOrder(n, title) {
  const list = ORDER.filter((v) => v !== 'title' || title), i = list.indexOf('latex');
  if (i >= n) list.splice(n - 1, 0, ...list.splice(i, 1));
  return list;
}
// where the pages of n tiles start: every n, the last one full (it shows the last n styles), so
// paging never changes how many tiles there are
export function pageStarts(len, n) {
  const out = [];
  for (let k = 0; k < len - n; k += n) out.push(k);
  out.push(Math.max(0, len - n));
  return out;
}

export const methods = {
  // what the gallery and the list show for where the caret is now: the style, the styles it may
  // take, the LaTeX paragraph the caret is in marked so
  styleSync(at) {
    const st = at ? this.blockStyle(at) : { v: 'p', to: new Set() };
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
    // which control had the focus is read before painting: some Chromium versions move the focus
    // to the body at once when a focused button is disabled, others only at the next frame
    const a = document.activeElement;
    this.paintGallery();
    if (a && a.closest && a.closest('.rb-gal') && isOff(a)) {
      const to = [$(dir < 0 ? '#rb-st-down' : '#rb-st-up'), ...$('#rb-gallery').querySelectorAll('[data-style]:not([hidden])')].find((x) => x.offsetParent && !isOff(x)) || $('#rb-st-more');
      this.ribbonRove(to);
      to.focus();
    } else this.ribbonRove();
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
};

// the width of each tile as its name is drawn (the fonts are in by then): the row keeps the width
// of its widest page
export function measureTiles(app) {
  const row = $('#rb-gallery .rb-tiles'), tiles = [...row.children], was = tiles.map((b) => b.hidden);
  row.style.width = '';
  for (const b of tiles) b.hidden = false;
  app.rbW = Object.fromEntries(tiles.map((b) => [b.dataset.style, b.getBoundingClientRect().width]));
  tiles.forEach((b, k) => { b.hidden = was[k]; });
}

// The gallery's and the list's own presses (the ribbon's buttons go through the registry)
export function installGallery(app) {
  const rb = $('#ribbon'), sel = $('#rb-style');
  // a style that is none of the list's (a list, a table, a theorem) shows as an empty choice
  sel.add(new Option('', ''));
  rb.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-style]');
    if (!t) return;
    // (one that cannot apply here does nothing: it stays in reach of the pointer for its tooltip)
    if (!isOff(t)) { app.setBlockStyle(t.dataset.style); app.ribbonSync(); }
    // from the keyboard the focus goes back to the caret, also where nothing changed
    if (document.activeElement === t) app.ribbonBack();
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
  // (a menu button opens its menu with the down arrow too)
  rb.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && e.target.id === 'rb-st-more') { e.preventDefault(); app.openStyles(); } });
}
