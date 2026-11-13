// The ribbon, as Word's: a row of tabs (the tablist "Ribbon": File, Home, Insert, Design,
// Layout, References, Review, View, Help, then the contextual tabs while their object has the
// caret), and under it the open tab's panel, one toolbar named after the tab, its groups in
// order. Every control is drawn from the command registry (src/commands.js) and the order of
// src/ribbon/order.js: a group shows once a command is in it, a tab once a group of it shows.
// The Download group stays at the row's right end in every tab (one element, moved into the
// open panel's toolbar). Only the open tab's panel is in the accessibility tree, so a command
// that has a copy on another tab (Picture on Home and Insert) has its name once there.
//
// As the window narrows the open tab's row gives way as Home's always has: the Styles gallery
// shows fewer tiles, the Download label goes, the buttons' names go, the style list takes the
// gallery's place; then, generalised, groups fold into one button each, named after the group,
// that opens a menu of the same commands by the same names (the lowest rank first). Below 861 px
// the tabs are a list, "Ribbon tab", at the start of one row that scrolls sideways.
//
// The toolbar has one tab stop, the control the arrows last reached; the tabs have one more (the
// open tab), and the arrows move between them. Ctrl+F1 folds the ribbon to its tabs and back.

import { TABS, tabById, CONTEXTS } from './order.js';
import { commands, command, inGroup, enabled, pressed, installers } from '../commands.js';
import { $, mk, store, PREFS } from '../ui/dom.js';
import { openMenu, splitButton, CARET } from '../ui/kit.js';
import { measureTiles, installGallery } from '../ui/gallery.js';
import { styOfEl } from '../editor.js';
import { enclosing } from '../wrap.js';

const SVG = (paths) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + paths + '</svg>';
// a control the toolbar's arrows skip: disabled, or a tile that cannot apply here
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
const wideScreen = () => !window.matchMedia || window.matchMedia('(min-width: 861px)').matches;

export const tabs = {
  // The tabs, panels, groups and controls, from the registry. The controls written in the
  // template (the gallery, the style list, the downloads) are moved in, never made again.
  ribbonBuild() {
    const rb = $('#ribbon'), list = $('#rb-tabs'), sel = $('#rb-tabsel'), dl = $('.rb-dl');
    if (!rb || !list) return;
    const hold = document.createDocumentFragment(), made = new Map();
    hold.append(dl);
    for (const c of commands()) if (c.kind === 'custom' && c.render) { const e = c.render(this); if (e) { made.set(c.id, e); hold.append(e); } }
    for (const p of rb.querySelectorAll('.rb-panel')) p.remove();
    list.replaceChildren();
    sel.replaceChildren();
    this.rbTabs = [];
    for (const T of TABS) {
      const groups = [];
      for (const g of T.groups) {
        const items = inGroup(T.id, g.id).filter(({ c }) => !c.static || c.kind === 'custom');
        if (items.length) groups.push({ g, items });
      }
      if (!groups.length) continue;
      const tab = mk('button', 'rb-tab' + (T.ctx ? ' ctx' : ''), T.name);
      tab.type = 'button'; tab.id = 'rt-' + T.id; tab.dataset.tab = T.id;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false'); tab.setAttribute('aria-controls', 'rp-' + T.id); tab.tabIndex = -1;
      if (T.ctx) tab.hidden = true;
      list.append(tab);
      sel.add(new Option(T.name, T.id));
      const panel = mk('div', 'rb-panel');
      panel.id = 'rp-' + T.id; panel.dataset.tab = T.id; panel.hidden = true;
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
      const tb = mk('div', 'rb-tb');
      tb.setAttribute('role', 'toolbar'); tb.setAttribute('aria-label', T.name);
      groups.forEach(({ g, items }, k) => {
        if (k) tb.append(mk('span', 'sep'));
        const box = mk('div', 'rb-grp');
        box.dataset.group = g.id; box.dataset.rank = g.rank;
        // the button the group folds into: its name, and a menu of its commands
        const gb = mk('button', 'btn ghost rb-gbtn');
        gb.type = 'button'; gb.id = 'rg-' + T.id + '-' + g.id;
        gb.setAttribute('aria-label', g.name); gb.title = g.name; gb.setAttribute('aria-haspopup', 'menu'); gb.setAttribute('aria-expanded', 'false');
        gb.append(mk('span', '', g.name));
        gb.insertAdjacentHTML('beforeend', SVG(CARET));
        gb.addEventListener('click', () => this.openGroupMenu(T.id, g, gb));
        box.append(gb);
        for (const { c, p } of items) { const e = c.kind === 'custom' ? made.get(c.id) : this.makeControl(c, p); if (e) box.append(e); }
        tb.append(box);
      });
      tb.append(mk('span', 'grow'));
      panel.append(tb);
      rb.insertBefore(panel, $('#picinput'));
      this.rbTabs.push(T.id);
    }
    // the downloads wait in the first panel until a tab is chosen
    rb.querySelector('.rb-tb').append(dl);
    this.rbBuilt = true;
    const want = this.rbTabs.includes(this.rbTab) ? this.rbTab : 'home';
    this.rbTab = null;
    this.selectTab(want);
  },

  // a command's control: a button (with its icon, glyph and label), a toggle, a split button
  makeControl(c, p) {
    const label = c.label ? (p.main ? c.label : p.name) : null;
    const b = mk('button', 'btn ghost' + (label ? '' : ' icon'));
    b.type = 'button'; b.id = p.el; b.dataset.cmd = c.id;
    b.setAttribute('aria-label', p.name);
    b.title = c.title || p.name;
    if (c.kind === 'toggle') b.setAttribute('aria-pressed', 'false');
    if (c.icon) b.insertAdjacentHTML('beforeend', SVG(c.icon));
    else if (c.glyph) b.insertAdjacentHTML('beforeend', c.glyph);
    b.append(label ? mk('span', '', label) : mk('span', 'sr', p.name));
    if (c.kind === 'menu') { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); }
    if (c.kind === 'split') return splitButton(this, b, p.name, () => this.commandMenu(c));
    return b;
  },

  // the items of a command's own menu (a split button's arrow, a menu button)
  commandMenu(c) {
    const at = this.ribbonAt();
    return (c.menuItems ? c.menuItems(this, at) : []).map((it) => it && { ...it, run: it.run || (it.command ? () => this.runCommand(it.command, it.args) : null) });
  },

  // A folded group's menu: its commands by their names, each as its button would act
  openGroupMenu(tab, g, gb) {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    const items = inGroup(tab, g.id).filter(({ c }) => c.run && c.searchable !== false).map(({ c, p }) => {
      const on = pressed(this, c, at);
      return { name: p.name, title: c.title, keys: (c.keys || [])[0], checked: on === null ? undefined : on, radio: !!c.static, disabled: !enabled(this, c, at), run: () => { this.ribbonBack(); this.runCommand(c.id); } };
    });
    openMenu(this, gb, items, { label: g.name });
  },

  // One command run where the caret is, from a button, a key, the search box or a menu: nothing
  // when it cannot run there. The ribbon then shows the new state.
  runCommand(id, args, at, from) {
    const c = command(id);
    if (!c || !c.run) return false;
    if (at === undefined) at = this.ribbonAt();
    if (at) at.memo = {};
    if (!enabled(this, c, at)) return false;
    const r = c.run(this, args, at);
    if (c.resync !== false) { if (r && typeof r.then === 'function') r.then(() => this.ribbonSync(), () => this.ribbonSync()); else this.ribbonSync(); }
    return r === undefined ? true : r;
  },

  // whether the caret's words lie in a wrapper of these commands, as the page drew them
  insideStyle(at, names) {
    for (let n = at && at.el; n && n !== this.root; n = n.parentElement) if (n.dataset && n.dataset.y) { const y = styOfEl(n); if (y && names.includes(y.cmd)) return true; }
    // ({\bfseries ...} and {\bf ...} are drawn without a range of their own: the source says)
    return !!(at && at.c && !at.c.ghost && enclosing(this.src(at.c.f), at.c.a, at.c.b, names));
  },

  selectTab(id, focus) {
    if (!this.rbBuilt || !this.rbTabs.includes(id)) return;
    const was = this.rbTab;
    this.rbTab = id;
    const T = tabById(id);
    if (!T.ctx) this.rbTabBefore = id;
    for (const t of $('#rb-tabs').children) { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; t.classList.toggle('on', on); }
    let panel = null;
    for (const p of $('#ribbon').querySelectorAll('.rb-panel')) { p.hidden = p.dataset.tab !== id; if (!p.hidden) panel = p; }
    // the downloads at the end of the open toolbar
    if (panel) panel.querySelector('.rb-tb').append($('.rb-dl'));
    $('#rb-tabsel').value = id;
    if (was !== id) $('#ribbon').scrollLeft = 0;
    if (focus) $('#rt-' + id).focus();
    if (was !== id) { this.ribbonSync(); this.ribbonFit(); }
  },

  // the contextual tabs: shown while their object has the caret; the open one, when its object
  // goes, gives way to the tab that was open before it
  ribbonContexts(at) {
    let gone = false;
    for (const T of TABS) {
      if (!T.ctx || !this.rbTabs.includes(T.id)) continue;
      let on = false;
      try { on = !!CONTEXTS[T.ctx](this, at); } catch (e) { on = false; }
      const t = $('#rt-' + T.id);
      if (t.hidden === !on) continue;
      t.hidden = !on;
      const o = $('#rb-tabsel').querySelector('option[value="' + T.id + '"]');
      o.hidden = o.disabled = !on;
      if (!on && this.rbTab === T.id) gone = true;
    }
    if (gone) this.selectTab(this.rbTabBefore || 'home');
  },

  // What the ribbon shows for where the caret is now: the contextual tabs, the pressed buttons,
  // those that can do nothing here disabled, the gallery's style
  ribbonSync() {
    const rb = $('#ribbon');
    if (!rb || !this.rbBuilt) return;
    this.dropEmpty();
    const at = this.ribbonAt();
    if (at) at.memo = {};
    this.ribbonContexts(at);
    for (const b of rb.querySelectorAll('.rb-panel button[data-cmd]')) {
      const c = command(b.dataset.cmd);
      if (!c || c.static) continue;
      const off = !enabled(this, c, at);
      b.disabled = off;
      const x = b.nextElementSibling && b.nextElementSibling.classList.contains('rb-x') ? b.nextElementSibling : null;
      if (x) x.disabled = off && !c.menuWhenOff;
      const on = pressed(this, c, at);
      if (on !== null) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const c of commands()) if (c.sync) { try { c.sync(this, at); } catch (e) { console.error(e); } }
    // (the title reads every file for a live graph: once for each build of the page, not for each move of the caret)
    if (this.rbModel !== this.model) { this.rbModel = this.model; this.saveTitle(); }
    this.ribbonRove();
  },

  // The open tab's room (see the top of this file). Each tile is as wide as its name, measured
  // here once its fonts are drawn.
  ribbonFit() {
    const rb = $('#ribbon');
    if (!rb || !this.rbBuilt) return;
    this.rbFitting = true;
    const panel = $('#rp-' + this.rbTab), gw = $('#rb-gw'), gal = !!panel && panel.contains(gw);
    const groups = panel ? [...panel.querySelectorAll('.rb-grp')] : [];
    const fits = () => rb.scrollWidth <= rb.clientWidth + 1;
    const set = (narrow, fold, n, nolab) => {
      rb.classList.toggle('rb-narrow', narrow); rb.classList.toggle('rb-fold', fold); rb.classList.toggle('rb-nolab', !!nolab);
      if (gal && n !== this.rbTiles) { this.rbTiles = n; this.rbFollow = true; }
      this.paintGallery();
    };
    for (const g of groups) g.classList.remove('folded');
    rb.classList.remove('rb-narrow');
    // (a phone's width has the list whatever the room: the style sheet hides the gallery there)
    const wide = gal ? getComputedStyle(gw).display !== 'none' : wideScreen();
    const done = () => { this.rbFitting = false; this.ribbonRove(); };
    if (wide) {
      if (gal) measureTiles(this);
      const steps = gal ? [[false, 6], [false, 5], [false, 4], [false, 3], [false, 4, 1], [false, 3, 1], [true, 6], [true, 5], [true, 4], [true, 3]] : [[false, this.rbTiles || 6], [false, this.rbTiles || 6, 1], [true, this.rbTiles || 6], [true, this.rbTiles || 6, 1]];
      for (const [fold, n, nolab] of steps) {
        set(false, fold, n, nolab);
        if (fits()) return done();
      }
    }
    set(true, true, gal ? 6 : this.rbTiles || 6);
    // (the list's row too goes without the Download label where it is longer than the window, as
    // between 861 and 900 px; a phone's row scrolls as it did)
    if (wide && !fits()) set(true, true, gal ? 6 : this.rbTiles || 6, 1);
    // then whole groups fold into their buttons, the lowest rank first (not on a phone: its row scrolls)
    if (wide && wideScreen() && !fits()) {
      for (const g of [...groups].sort((a, b) => a.dataset.rank - b.dataset.rank || groups.indexOf(b) - groups.indexOf(a))) {
        g.classList.add('folded');
        if (fits()) break;
      }
    }
    done();
  },

  // one tab stop for the whole toolbar: the control the arrows last reached, or the first that works
  ribbonRove(to) {
    // (of the controls this width shows: a phone has one Download button, a wider screen the three)
    const every = [...$('#ribbon').querySelectorAll('select, button')], all = every.filter((x) => x.offsetParent !== null);
    if (to) this.rbStop = to;
    const cur = this.rbStop && !isOff(this.rbStop) && all.includes(this.rbStop) ? this.rbStop : all.find((x) => !isOff(x));
    for (const x of every) x.tabIndex = x === cur ? 0 : -1;
    return all;
  },

  // Ctrl+F1: the ribbon folded to its tabs, or shown again (kept for the next visit)
  toggleRibbon(force) {
    const on = force ?? !document.body.classList.contains('rb-collapsed');
    document.body.classList.toggle('rb-collapsed', on);
    const b = $('#rb-collapse');
    if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = (on ? 'Show the ribbon' : 'Collapse the ribbon to its tabs') + ' (Ctrl+F1)'; }
    if (this.prefs && !!this.prefs.ribbon !== on) { this.prefs.ribbon = on; store(PREFS, this.prefs); }
    if (!on) requestAnimationFrame(() => this.ribbonFit());
  }
};

export function installRibbon(app) {
  const rb = $('#ribbon');
  if (!rb) return;
  // (not while the search box has the focus: the ribbon keeps showing the place on the page)
  app.ribbonSoon = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(() => { if (!(document.activeElement && document.activeElement.id === 'rk-search')) app.ribbonSync(); }, 60); }; })();
  app.ribbonBuild();
  installGallery(app);
  // A press must not take the caret or the selection off the page: not on a button, and not on
  // a disabled one (which lets the press through to the row, see .rb .btn:disabled), the
  // Download label or the empty part of the row either. Only the lists take the focus.
  rb.addEventListener('mousedown', (e) => { if (!e.target.closest('select, input')) e.preventDefault(); });
  rb.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (b && !b.disabled && rb.contains(b)) app.runCommand(b.dataset.cmd, null, undefined, b);
  });
  // a toolbar: arrows move between its controls (in the style list, up and down pick a style)
  rb.addEventListener('keydown', (e) => {
    // Escape on a button of the row goes back to the caret on the page (the lists have their own)
    if (e.key === 'Escape' && e.target.closest('button')) { e.preventDefault(); app.ribbonBack(); return; }
    // a menu button opens its menu with the down arrow too
    if (e.key === 'ArrowDown' && e.target.matches('.rb-gbtn, [data-cmd][aria-haspopup]')) { e.preventDefault(); e.target.click(); return; }
    if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const all = app.ribbonRove().filter((x) => !isOff(x)), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const to = all[e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    app.ribbonRove(to);
    to.focus();
  });
  // the tabs: a press opens one (and shows a folded ribbon again); the arrows move between them,
  // the down arrow into the open tab's toolbar
  const list = $('#rb-tabs');
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const t = e.target.closest('[role=tab]');
    if (!t) return;
    if (document.body.classList.contains('rb-collapsed')) app.toggleRibbon(false);
    app.selectTab(t.dataset.tab, document.activeElement === t || document.activeElement === document.body);
  });
  list.addEventListener('keydown', (e) => {
    const shown = [...list.children].filter((t) => !t.hidden), i = shown.indexOf(document.activeElement);
    if (i < 0) return;
    if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) {
      e.preventDefault();
      const to = shown[e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + shown.length) % shown.length];
      app.selectTab(to.dataset.tab, true);
    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (document.body.classList.contains('rb-collapsed')) app.toggleRibbon(false);
      if (e.key !== 'ArrowDown') app.selectTab(shown[i].dataset.tab);
      const stop = app.ribbonRove().find((x) => x.tabIndex === 0);
      if (stop) stop.focus();
    } else if (e.key === 'Escape') { e.preventDefault(); app.ribbonBack(); }
  });
  // a phone's list of the tabs (it takes the focus while open; the place on the page is kept)
  const sel = $('#rb-tabsel');
  const keep = () => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange(); };
  sel.addEventListener('pointerdown', keep);
  sel.addEventListener('focus', keep);
  sel.addEventListener('change', () => { app.selectTab(sel.value); sel.focus(); });
  sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); app.ribbonBack(); } });
  $('#rb-collapse').addEventListener('mousedown', (e) => e.preventDefault());
  $('#rb-collapse').addEventListener('click', () => app.toggleRibbon());
  if (app.prefs && app.prefs.ribbon) app.toggleRibbon(true);
  for (const f of installers) f(app);
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
