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
// that opens a menu of the same commands by the same names (the lowest rank first; ribbonFit has
// the rule). Below 861 px the tabs are a list, "Ribbon tab", at the start of the row, which on a
// phone scrolls sideways.
//
// The toolbar has one tab stop, the control the arrows last reached; the tabs have one more (the
// open tab), and the arrows move between them. Ctrl+F1 folds the ribbon to its tabs and back.

import { TABS, tabById, CONTEXTS } from './order.js';
import { commands, command, inGroup, enabled, pressed, installers } from '../commands.js';
import { $, mk, store, PREFS } from '../ui/dom.js';
import { openMenu, splitButton, CARET } from '../ui/kit.js';
import { measureTiles, installGallery } from '../ui/gallery.js';
import { styOfEl } from '../editor.js';
import { chordText } from '../keys.js';
import { enclosing } from '../wrap.js';

const SVG = (paths) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + paths + '</svg>';
// a control the toolbar's arrows skip: disabled, or a tile that cannot apply here
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
const wideScreen = () => !window.matchMedia || window.matchMedia('(min-width: 861px)').matches;
// where groups fold to fit the row (on a phone's width the row scrolls instead)
const foldsGroups = () => !window.matchMedia || window.matchMedia('(min-width: 521px)').matches;

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
      list.append(tab);
      const opt = new Option(T.name, T.id);
      sel.add(opt);
      // (a contextual tab, and its place in a narrow window's list, wait for their object)
      if (T.ctx) tab.hidden = opt.hidden = opt.disabled = true;
      const panel = mk('div', 'rb-panel');
      panel.id = 'rp-' + T.id; panel.dataset.tab = T.id; panel.hidden = true;
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
      const tb = mk('div', 'rb-tb');
      tb.setAttribute('role', 'toolbar'); tb.setAttribute('aria-label', T.name);
      groups.forEach(({ g, items }, k) => {
        if (k) tb.append(mk('span', 'sep'));
        const box = mk('div', 'rb-grp');
        box.dataset.group = g.id; box.dataset.rank = g.rank;
        if (g.spare) box.dataset.spare = '1';
        // a group by its name, as Word's are; not where a control in it has that name already (the
        // Styles gallery is the group "Styles")
        if (!items.some(({ c }) => c.role === 'group' && c.name === g.name)) { box.setAttribute('role', 'group'); box.setAttribute('aria-label', g.name); }
        // the button the group folds into: its name, and a menu of its commands
        const gb = mk('button', 'btn ghost rb-gbtn');
        gb.type = 'button'; gb.id = 'rg-' + T.id + '-' + g.id;
        gb.setAttribute('aria-label', g.name); gb.title = g.name; gb.setAttribute('aria-haspopup', 'menu'); gb.setAttribute('aria-expanded', 'false');
        // (its first command's icon, which it shows folded: see ribbonFit)
        const first = items.find(({ c }) => c.icon);
        if (first) gb.insertAdjacentHTML('beforeend', SVG(first.c.icon).replace('<svg ', '<svg class="rb-gico" '));
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
    const items = [];
    for (const { c, p } of inGroup(tab, g.id).filter(({ c }) => c.run && c.searchable !== false)) {
      const on = pressed(this, c, at);
      items.push({ name: p.name, title: c.title, keys: chordText((c.keys || [])[0]), checked: on === null ? undefined : on, radio: !!c.static, disabled: !enabled(this, c, at), run: () => { this.ribbonBack(); this.runCommand(c.id); } });
      // (a split button's other choices too, as Word's folded group lists them: Find's Advanced
      // Find and Go To)
      if (c.kind === 'split') for (const it of this.commandMenu(c)) if (it && it.name !== p.name && it.command !== c.id) items.push({ ...it, run: () => { this.ribbonBack(); if (it.run) it.run(); } });
    }
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
      const t = $('#rt-' + T.id), o = $('#rb-tabsel').querySelector('option[value="' + T.id + '"]');
      o.hidden = o.disabled = !on;
      if (t.hidden === !on) continue;
      t.hidden = !on;
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

  // The open tab's room (see the top of this file), one rule for every tab and width: everything
  // open first, then while the row is longer than the window one step at a time, the cheapest loss
  // first, counted in controls: what takes none (the Download caption, the buttons' names, which
  // stay their accessible names); then a tile of the Styles gallery at a time, down to three; the
  // three downloads as one Download button; the style list in the gallery's place; then the
  // groups, the least needed (rank 1, Editing on Home) and then the lowest rank first, of equal
  // ranks the rightmost. A folded group is one button, its first command's icon (or its name where
  // none has one), named after the group, that opens a menu of its commands. Below 861 px the
  // style sheet has the list and takes the names; below 521 px no group folds (a phone's row
  // scrolls). Then the steps are tried back, the last first, each kept undone where the row still
  // fits, so no room is left empty while something is folded. What takes no control goes before
  // any group folds, so a narrower window never shows more controls than a wider one for the names
  // or the tiles having gone (a group folded before them opened again once they had). Only where a
  // later group that takes fewer controls folds and an earlier one opens again for it does it
  // show more: the rank, not the count, says which goes first. Each step is one write and one
  // read. Each tile is as wide as its name, measured once its fonts are drawn.
  ribbonFit() {
    const rb = $('#ribbon');
    if (!rb || !this.rbBuilt) return;
    this.rbFitting = true;
    const panel = $('#rp-' + this.rbTab), gw = $('#rb-gw'), gal = !!panel && panel.contains(gw);
    const groups = panel ? [...panel.querySelectorAll('.rb-grp')] : [];
    const fits = () => rb.scrollWidth <= rb.clientWidth + 1;
    const tiles = (n) => { if (gal && n !== this.rbTiles) { this.rbTiles = n; this.rbFollow = true; this.paintGallery(); } };
    const flag = (c) => ({ do: () => rb.classList.add(c), undo: () => rb.classList.remove(c) });
    for (const g of groups) g.classList.remove('folded', 'ico');
    rb.classList.remove('rb-narrow', 'rb-fold', 'rb-nolab', 'rb-dl1');
    // (a phone's width has the list whatever the room: the style sheet hides the gallery there)
    const wide = gal ? getComputedStyle(gw).display !== 'none' : wideScreen();
    rb.classList.toggle('rb-narrow', !wide);
    // (once: again only where the fonts came since, or the ribbon was folded to its tabs and had no width)
    if (gal && wide && !(this.rbW && this.rbW.p > 0)) measureTiles(this);
    if (gal) { tiles(6); this.paintGallery(); }
    // (a spare group first, as one step each: its commands have a tab of their own)
    const fold = (g) => ({ do: () => g.classList.add('folded', ...(g.querySelector('.rb-gico') ? ['ico'] : [])), undo: () => g.classList.remove('folded', 'ico') });
    const spare = foldsGroups() ? groups.filter((g) => g.dataset.spare).sort((x, y) => x.dataset.rank - y.dataset.rank || groups.indexOf(y) - groups.indexOf(x)) : [];
    const steps = [...spare.map(fold), flag('rb-nolab')];
    // (the tiles one at a time: each undone only after the one after it, chain; down to three
    // before the buttons' names go, so a desktop keeps them; and the names in the chain too: a
    // tile given back for names lost showed more controls than a wider window)
    if (gal && wide) for (const n of [5, 4, 3]) steps.push({ do: () => tiles(n), undo: () => tiles(n + 1), chain: true });
    steps.push({ ...flag('rb-fold'), chain: true }, flag('rb-dl1'));
    if (gal && wide) steps.push(flag('rb-narrow'));
    const order = foldsGroups() ? [...groups].filter((g) => !g.dataset.spare).sort((x, y) => x.dataset.rank - y.dataset.rank || groups.indexOf(y) - groups.indexOf(x)) : [];
    for (const g of order) steps.push(fold(g));
    let k = 0;
    while (k < steps.length && !fits()) steps[k++].do();
    let chain = true;
    for (let i = k - 1; i >= 0; i--) {
      const st = steps[i];
      if (st.chain && !chain) continue;
      st.undo();
      if (!fits()) { st.do(); if (st.chain) chain = false; }
    }
    this.rbFitting = false;
    this.ribbonRove();
  },

  // one tab stop for the whole toolbar: the control the arrows last reached, or the first that works
  ribbonRove(to) {
    // (of the controls this width shows: a phone has one Download button, a wider screen the three)
    // (and the boxes a toolbar may hold, the font's and the size's)
    const every = [...$('#ribbon').querySelectorAll('select, button, input')], all = every.filter((x) => x.offsetParent !== null);
    if (to) this.rbStop = to;
    const cur = this.rbStop && !isOff(this.rbStop) && all.includes(this.rbStop) ? this.rbStop : all.find((x) => !isOff(x));
    for (const x of every) x.tabIndex = x === cur ? 0 : -1;
    return all;
  },

  // Ctrl+F1: the ribbon folded to its tabs, or shown again (kept for the next visit)
  toggleRibbon(force) {
    // (a narrow window has no tabs to fold to: a setting made there would fold a wide one later)
    if (force === undefined && !wideScreen()) return;
    const on = force ?? !document.body.classList.contains('rb-collapsed');
    document.body.classList.toggle('rb-collapsed', on);
    document.body.classList.remove('rb-peek');
    const b = $('#rb-collapse');
    if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = (on ? 'Show the ribbon' : 'Collapse the ribbon to its tabs') + ' (Ctrl+F1)'; }
    if (this.prefs && !!this.prefs.ribbon !== on) { this.prefs.ribbon = on; store(PREFS, this.prefs); }
    if (!on) requestAnimationFrame(() => this.ribbonFit());
  },
  // A tab pressed while the ribbon is folded shows it for a moment, as Word does: it folds again
  // when the page is pressed or has the focus back, or after a button of it ran, and the setting
  // stays folded (only Ctrl+F1 and the button change it)
  peekRibbon(on) {
    const b = document.body;
    if (on && !b.classList.contains('rb-collapsed')) return;
    if (b.classList.contains('rb-peek') === on) return;
    b.classList.toggle('rb-peek', on);
    if (on) requestAnimationFrame(() => this.ribbonFit());
  }
};

export function installRibbon(app) {
  const rb = $('#ribbon');
  if (!rb) return;
  // (not while the search box has the focus: the ribbon keeps showing the place on the page)
  // (nor while a box of the ribbon has it, the font's or the size's: typing there is no move on the page)
  app.ribbonSoon = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(() => { const a = document.activeElement; if (!(a && (a.id === 'rk-search' || (a.matches && a.matches('#ribbon input'))))) app.ribbonSync(); }, 60); }; })();
  app.ribbonBuild();
  installGallery(app);
  // A press must not take the caret or the selection off the page: not on a button, and not on
  // a disabled one (which lets the press through to the row, see .rb .btn:disabled), the
  // Download label or the empty part of the row either. Only the lists take the focus.
  rb.addEventListener('mousedown', (e) => { if (!e.target.closest('select, input')) e.preventDefault(); });
  rb.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (b && !b.disabled && rb.contains(b)) {
      app.runCommand(b.dataset.cmd, null, undefined, b);
      if (!b.hasAttribute('aria-haspopup')) app.peekRibbon(false);
    }
  });
  // a toolbar: arrows move between its controls (in the style list, up and down pick a style)
  rb.addEventListener('keydown', (e) => {
    // Escape on a button of the row goes back to the caret on the page (the lists have their own)
    if (e.key === 'Escape' && e.target.closest('button')) { e.preventDefault(); app.ribbonBack(); return; }
    // a menu button opens its menu with the down arrow too
    if (e.key === 'ArrowDown' && e.target.matches('.rb-gbtn, [data-cmd][aria-haspopup]')) { e.preventDefault(); e.target.click(); return; }
    if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    // in a box the keys move in its text; past its first or last character they go on to the controls beside it
    const t = e.target;
    if (t.matches && t.matches('input') && (/^(Home|End)$/.test(e.key) || t.selectionStart !== t.selectionEnd || (e.key === 'ArrowLeft' ? t.selectionStart > 0 : t.selectionEnd < t.value.length))) return;
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
    app.peekRibbon(true);
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
      app.peekRibbon(true);
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
  // (the folded ribbon shown for a moment folds again on a press elsewhere or the page's focus)
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ribbon, #rb-top, .pop, [role=menu], [role=listbox]')) app.peekRibbon(false); }, true);
  app.root.addEventListener('focusin', () => app.peekRibbon(false));
  for (const f of installers) f(app);
  document.addEventListener('selectionchange', app.ribbonSoon);
  document.addEventListener('focusin', app.ribbonSoon);
  // the gallery's room is measured again when the window's width changes and once the fonts the
  // tiles and the buttons' names are drawn in have come
  let fit = 0, w = innerWidth;
  addEventListener('resize', () => { if (innerWidth === w) return; w = innerWidth; cancelAnimationFrame(fit); fit = requestAnimationFrame(() => app.ribbonFit()); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { app.rbW = null; app.ribbonFit(); });
  app.ribbonSync();
  app.ribbonFit();
}
