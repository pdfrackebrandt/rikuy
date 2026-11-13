// The Styles gallery, as Word's: one bordered box of tiles, each the style's name drawn in that
// style's own look, the current one pressed, those that cannot apply here marked so with the
// reason in their tooltip; arrows page through the tiles where they do not all fit, More opens
// every style as a menu (with the Styles pane, Apply Styles and Create a Style after them); a
// right click on a tile gives its own menu (Update to Match Selection, Modify, Remove from Style
// Gallery); and on a narrow window the style list in its place. The tiles are slots: Heading 1 is
// \section in an article and \chapter in a report, and Heading 4 shows once Heading 3 is in use
// (Word's rule). The styles themselves are src/cmd/styles.js's (blockStyle, setBlockStyle); the
// ribbon's fitting (src/ribbon/tabs.js) says how many tiles there is room for. The methods join
// App's prototype.

import { $ } from './dom.js';
import { openMenu } from './kit.js';
import { WHY, SLOT_EL } from '../cmd/styles.js';
import { isEnvStyle, isHeading } from '../styles.js';
import { command, enabled } from '../commands.js';

// a control the toolbar's arrows skip: disabled, or a tile that cannot apply here
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
// The Styles gallery's slots in their order, the one the list behind More keeps
export const SLOTS = ['p', 'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'latex', 'quote'];
// The tiles in their order for n in view: LaTeX moves up to the last place of the first page
// where it would not be on it (Normal, Heading 1, LaTeX for three)
export function tileOrder(n, slots) {
  const list = [...slots], i = list.indexOf('latex');
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
// the level of each sectioning command, as the model counts them
const LEVEL = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
// the slots removed from the gallery in this browser (Remove from Style Gallery)
function hiddenSlots(set) {
  try {
    if (set) localStorage.setItem('rikuy.gallery.hidden', JSON.stringify([...set]));
    const v = JSON.parse(localStorage.getItem('rikuy.gallery.hidden') || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => SLOTS.includes(x)) : []);
  } catch (e) { return set || new Set(); }
}

export const methods = {
  // which style each slot stands for in this document, and which slots the gallery shows: Normal,
  // Heading 1 to 3, LaTeX and Quote; Title in the title; Heading 4 once Heading 3 is in use (and
  // so on down), and any slot whose style the caret is in; none that was removed from it
  gallerySlots(v) {
    const K = this.styleCatalog(), M = this.model;
    const val = { p: 'p', title: 'title', latex: 'latex', quote: 'quote' };
    K.levels.forEach((c, k) => { val['h' + (k + 1)] = c; });
    const used = new Set(M && M.headings ? M.headings.map((h) => h.level) : []);
    const hidden = hiddenSlots();
    const show = SLOTS.filter((s) => {
      if (!val[s]) return false;
      if (val[s] === v) return true;
      if (hidden.has(s)) return false;
      if (s === 'title') return false;
      const k = /^h(\d)$/.exec(s);
      if (k && +k[1] >= 4) { const above = K.levels[+k[1] - 2]; return !!above && used.has(LEVEL[above]); }
      return true;
    });
    return { val, show };
  },

  // what the gallery and the list show for where the caret is now: the style, the styles it may
  // take, the LaTeX paragraph the caret is in marked so
  styleSync(at) {
    // (the focus in the Styles pane: the caret it came from is still the one its styles are for)
    if (!at && this.rbStyle && this.rbStyle.on && document.activeElement && document.activeElement.closest && document.activeElement.closest('#stylespane')) return;
    const st = at ? this.blockStyle(at) : { v: 'p', to: new Set() };
    this.rbStyle = { ...st, on: !!at };
    // a caret in another block (or the block's style changed): the gallery pages to its style
    const key = at ? (at.B ? at.B.id : at.c.ghost ? 'ghost' : '') + '|' + st.v : '';
    if (key !== this.rbKey) { this.rbKey = key; this.rbFollow = true; }
    const sel = $('#rb-style');
    this.fillStyleList(sel);
    for (const o of sel.options) {
      if (o.value.startsWith('__')) continue;
      if (o.value === 'title') o.hidden = o.disabled = st.v !== 'title';
      else if (o.value === '') o.hidden = o.disabled = st.v !== '';
      else o.disabled = o.value !== st.v && !st.to.has(o.value);
    }
    sel.value = st.v;
    sel.disabled = !at || !st.to.size;
    this.paintGallery();
    if (this.paneSync) this.paneSync(at, st);
    // the LaTeX paragraph the caret is in shows so
    const box = at && at.ctx === 'tex' && at.it ? at.it : this.ghost && this.ghost.tex ? this.ghost.el.closest('.it.tex') : null;
    for (const x of this.root.querySelectorAll('.it.tex.cur')) if (!box || x.dataset.b !== box.dataset.b) x.classList.remove('cur');
    if (box) for (const x of this.root.querySelectorAll('.it.tex[data-b="' + box.dataset.b + '"]')) x.classList.add('cur');
  },
  // the narrow window's list: every style of this document, by its name (made again when the
  // document's styles change: another class, a \newtheorem)
  fillStyleList(sel) {
    const K = this.styleCatalog();
    if (sel.dataset.cat === String(K.all.length) + K.levels.join() && sel.options.length) return;
    sel.dataset.cat = String(K.all.length) + K.levels.join();
    sel.textContent = '';
    for (const x of K.all) sel.add(new Option(x.name, x.v));
    // a style that is none of the list's (a list, a table, a figure) shows as an empty choice
    sel.add(new Option('', ''));
    // the Styles pane and Create a Style, which a wide window has under More (a phone has no
    // right click and no More: these are its way to Modify, Update to Match and New Style)
    const more = document.createElement('optgroup');
    more.label = 'More';
    more.append(new Option('Styles pane…', '__pane'), new Option('Create a Style…', '__new'));
    sel.append(more);
  },

  // The Styles gallery: the tiles of the styles there are here, as many as the row has room for
  // (ribbonFit), from the page the arrows paged to or the one with the caret's style; the
  // current style's tile pressed, those that cannot apply here marked so, with the reason in
  // their tooltip. The row keeps one width while it pages, the width of its widest page: a
  // toolbar that moved under the mouse sent a second click to another button.
  paintGallery() {
    const gal = $('#rb-gallery');
    if (!gal) return;
    const st = this.rbStyle || { v: 'p', to: new Set(), on: false }, n = this.rbTiles || 6;
    const { val, show } = this.gallerySlots(st.v);
    const list = tileOrder(n, show), starts = pageStarts(list.length, n);
    let start = Math.min(this.rbStart || 0, starts[starts.length - 1]);
    if (!starts.includes(start)) start = starts.filter((x) => x <= start).pop();
    const at = list.findIndex((s) => val[s] === st.v);
    if (this.rbFollow && at >= 0 && (at < start || at >= start + n)) start = starts.filter((x) => x <= at).pop();
    this.rbFollow = false;
    this.rbStart = start;
    const view = list.slice(start, start + n), row = gal.querySelector('.rb-tiles');
    // the tiles stand in the order they are seen in, which the arrow keys follow
    const order = [...list, ...SLOTS.filter((s) => !list.includes(s))];
    if ([...row.children].map((b) => b.dataset.slot).join() !== order.join()) for (const s of order) row.append($('#' + SLOT_EL[s]));
    for (const b of row.children) {
      const s = b.dataset.slot, v = val[s] || '', can = !!v && st.on && (st.to.has(v) || (v === st.v && st.to.size > 0));
      b.dataset.style = v;
      b.hidden = !view.includes(s);
      b.setAttribute('aria-pressed', v && v === st.v ? 'true' : 'false');
      if (can) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      b.title = b.dataset.tip + (can || v === st.v ? '' : '\n' + this.whyNot(st, v));
    }
    const W = this.rbW;
    if (W) row.style.width = Math.max(...starts.map((k) => list.slice(k, k + n).reduce((sum, s) => sum + (W[s] || 0), 0))) + 2 * (n - 1) + 'px';
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
    if (v === 'latex') return WHY.latex;
    if (isEnvStyle(v)) return st.opt ? WHY.opt : WHY.quote;
    return isHeading(v) ? WHY.head : WHY.part;
  },
  // the arrows page by n tiles; from the keyboard the focus stays on the strip: an arrow that has
  // reached its end hands it to the other one (it fell to the page's body)
  pageGallery(dir) {
    const st = this.rbStyle || { v: 'p' }, n = this.rbTiles || 6, starts = pageStarts(tileOrder(n, this.gallerySlots(st.v).show).length, n);
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

  // All the styles, from the strip's More button: a menu of them, each drawn in its own look, in
  // three parts (the paragraph styles, LaTeX's environments, this document's own), then the
  // Styles pane, Apply Styles and Create a Style as in Word's
  openStyles() {
    const more = $('#rb-st-more'), st = this.rbStyle || { v: 'p', to: new Set(), on: false };
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    const p = this.makePop(more, 'pop-dl pop-styles', null);
    p.setAttribute('role', 'menu');
    p.setAttribute('aria-label', 'Styles');
    this.menuKeys(p);
    more.setAttribute('aria-expanded', 'true');
    this.pop.onClose = () => more.setAttribute('aria-expanded', 'false');
    const K = this.styleCatalog(), { val } = this.gallerySlots(st.v);
    const slotOf = Object.fromEntries(Object.entries(val).map(([k, v]) => [v, k]));
    let group = null;
    const sep = () => { const d = document.createElement('div'); d.className = 'pop-sep'; d.setAttribute('role', 'separator'); p.append(d); };
    for (const x of K.all) {
      if (x.v === 'title' && st.v !== 'title') continue;
      if (group && x.group !== group) sep();
      group = x.group;
      const tile = slotOf[x.v] ? $('#' + SLOT_EL[slotOf[x.v]]) : null, can = st.on && (st.to.has(x.v) || (x.v === st.v && st.to.size > 0));
      const a = document.createElement('button');
      // (drawn as its tile is, or as a paragraph or an environment where it has none)
      a.type = 'button'; a.className = 'rb-mi ' + (tile ? [...tile.classList].find((k) => k.startsWith('st-')) : 'st-' + (isEnvStyle(x.v) ? 'env' : 'p')); a.setAttribute('role', 'menuitemradio');
      a.setAttribute('aria-checked', x.v === st.v ? 'true' : 'false'); a.setAttribute('aria-label', x.name);
      a.title = (tile ? tile.dataset.tip : x.name) + (can || x.v === st.v ? '' : '\n' + this.whyNot(st, x.v));
      if (!can) a.setAttribute('aria-disabled', 'true');
      if (tile) a.append(tile.firstElementChild.cloneNode(true));
      else { const sp = document.createElement('span'); sp.setAttribute('aria-hidden', 'true'); sp.textContent = x.name; a.append(sp); }
      // (a press keeps the caret on the page; the keyboard's Enter comes as a click)
      a.addEventListener('mousedown', (e) => e.preventDefault());
      a.addEventListener('click', () => { if (isOff(a)) return; this.closePop(true); this.ribbonBack(); this.setBlockStyle(x.v); this.ribbonSync(); });
      p.append(a);
    }
    sep();
    for (const id of ['create-style', 'clear-formatting', 'apply-styles', 'styles-pane']) {
      const c = command(id);
      if (!c) continue;
      const a = document.createElement('button');
      a.type = 'button'; a.className = 'rb-mi rb-mact'; a.setAttribute('role', 'menuitem');
      a.setAttribute('aria-label', c.name + (id === 'clear-formatting' ? '' : '…'));
      a.title = c.title || c.name;
      const sp = document.createElement('span'); sp.setAttribute('aria-hidden', 'true'); sp.textContent = c.name + (id === 'clear-formatting' ? '' : '…'); a.append(sp);
      if (!enabled(this, c, this.ribbonAt())) a.setAttribute('aria-disabled', 'true');
      a.addEventListener('mousedown', (e) => e.preventDefault());
      a.addEventListener('click', () => { if (isOff(a)) return; this.closePop(true); this.ribbonBack(); this.runCommand(id); });
      p.append(a);
    }
    this.positionPop();
    const first = p.querySelector('[aria-checked="true"]:not([aria-disabled])') || p.querySelector('[role=menuitemradio]:not([aria-disabled])');
    if (first) first.focus();
  },

  // A tile's own menu (a right click on it, or the menu key on it): Word's
  tileMenu(b, x, y) {
    const st = this.rbStyle || { v: 'p', to: new Set(), on: false }, v = b.dataset.style, slot = b.dataset.slot, name = b.getAttribute('aria-label');
    const items = [];
    const can = (id) => !!command(id) && enabled(this, command(id), this.ribbonAt());
    if (command('update-style')) items.push({ name: 'Update ' + name + ' to Match Selection', title: 'The formatting of the caret\'s heading (or text) becomes the style\'s, everywhere', disabled: !can('update-style') || !this.canUpdateStyle || !this.canUpdateStyle(v), run: () => { this.ribbonBack(); this.runCommand('update-style', { v }); } });
    if (command('modify-style')) items.push({ name: 'Modify…', title: 'The font, size, colour, alignment, spacing and numbering of ' + name, disabled: !this.canModifyStyle || !this.canModifyStyle(v), run: () => { this.ribbonBack(); this.runCommand('modify-style', { v }); } });
    items.push({ name: 'Select All Instances', title: 'Selects the first paragraph in this style and says how many there are', disabled: !v || !this.styleInstances(v, 1).length, run: () => { this.ribbonBack(); this.selectStyleInstances(v); } });
    items.push(null);
    items.push({ name: 'Remove from Style Gallery', title: 'Takes the tile out of the gallery in this browser; More styles and the Styles pane still have it', disabled: slot === 'p' || slot === 'latex',
      run: () => { this.ribbonBack(); this.galleryRemove(slot); } });
    if (hiddenSlots().size) items.push({ name: 'Reset Style Gallery', title: 'Every tile back in the gallery', run: () => { hiddenSlots(new Set(['-'])); this.ribbonBack(); this.ribbonSync(); this.ribbonFit(); } });
    void st;
    openMenu(this, x != null ? new DOMRect(x, y, 0, 0) : b, items, { label: name + ' style' });
  },
  galleryRemove(slot) { const h = hiddenSlots(); h.add(slot); hiddenSlots(h); this.ribbonSync(); this.ribbonFit(); },
  // a style back in the gallery (the Styles pane's Add to Style Gallery)
  galleryAdd(slot) { const h = hiddenSlots(); h.delete(slot); hiddenSlots(h.size ? h : new Set(['-'])); this.ribbonSync(); this.ribbonFit(); },
  galleryHas(slot) { return !hiddenSlots().has(slot); },
};

// the width of each tile as its name is drawn (the fonts are in by then): the row keeps the width
// of its widest page
export function measureTiles(app) {
  const row = $('#rb-gallery .rb-tiles'), tiles = [...row.children], was = tiles.map((b) => b.hidden);
  row.style.width = '';
  for (const b of tiles) b.hidden = false;
  app.rbW = Object.fromEntries(tiles.map((b) => [b.dataset.slot, b.getBoundingClientRect().width]));
  tiles.forEach((b, k) => { b.hidden = was[k]; });
}

// The gallery's and the list's own presses (the ribbon's buttons go through the registry)
export function installGallery(app) {
  const rb = $('#ribbon'), sel = $('#rb-style');
  app.fillStyleList(sel);
  rb.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-style]');
    if (!t || !t.closest('#rb-gallery')) return;
    // (one that cannot apply here does nothing: it stays in reach of the pointer for its tooltip)
    if (!isOff(t)) { app.setBlockStyle(t.dataset.style); app.ribbonSync(); }
    // from the keyboard the focus goes back to the caret, also where nothing changed
    if (document.activeElement === t) app.ribbonBack();
  });
  // a right click on a tile: its own menu (Word's), not the browser's
  rb.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('#rb-gallery button[data-slot]');
    if (!t) return;
    e.preventDefault();
    const s = getSelection();
    if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange();
    if (e.button === 2 || e.clientX || e.clientY) app.tileMenu(t, e.clientX, e.clientY); else app.tileMenu(t);
  });
  // the list takes the focus while it is open: the place on the page is kept and put back
  const keep = () => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange(); };
  const back = () => app.ribbonBack();
  sel.addEventListener('pointerdown', keep);
  sel.addEventListener('focus', keep);
  sel.addEventListener('change', () => {
    const v = sel.value;
    back();
    if (v === '__pane' || v === '__new') { sel.value = (app.rbStyle || {}).v || ''; app.runCommand(v === '__pane' ? 'styles-pane' : 'create-style'); return; }
    app.setBlockStyle(v); app.ribbonSync();
  });
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
