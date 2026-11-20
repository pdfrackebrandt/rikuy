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

import { TABS, tabById, CONTEXTS, KEYTIPS } from './order.js';
import { keyTitle, firstKey, macUA } from '../keys.js';

// the shortcut in the tooltip, as this computer has it (src/keys.js keyTitle)
const tipTitle = (c, p) => keyTitle(c, p.name, macUA());

import { LAUNCH, CHECKS, TIPS, groupLayout } from './layout.js';
import { commands, command, inGroup, places, enabled, pressed, installers } from '../commands.js';
import { $, mk, store, PREFS } from '../ui/dom.js';
import { openMenu, splitButton, CARET } from '../ui/kit.js';
import { measureTiles, installGallery } from '../ui/gallery.js';
import { styOfEl } from '../editor.js';
import { enclosing } from '../wrap.js';

const SVG = (paths) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + paths + '</svg>';

// What kind of control each one of the ribbon, the title bar and the status bar is (data-kind):
// one height, type, spacing and corner per kind, which test/consistency.py measures in one pass.
// The kind is what the layout asks for (a large button stays "large" in a group drawn small).
function kindOf(e, scope) {
  if (e.matches('.sep')) return 'separator';
  if (e.matches('.rb-glab, .rb-cap')) return 'group-label';
  if (e.matches('.rb-tab')) return 'tab';
  if (e.matches('input, select') || e.closest('.fbx, .pf, .pf-field, .nf')) return 'field';
  if (e.closest('.rb-gal') || e.matches('.rb-tile, .rb-sb')) return 'gallery';
  if (scope === 'bar') return e.matches('.undo-x') ? 'split-arrow' : e.matches('.icon') ? 'title-icon' : 'title-button';
  if (scope === 'status') return 'status';
  if (e.matches('.rb-gbtn')) return 'group';
  if (e.matches('.rb-launch')) return 'launcher';
  if (e.matches('.rb-x')) return 'split-arrow';
  const s = (e.closest('.rb-split') || e).dataset.size;
  if (s === 'L' || e.dataset.cmd === 'paste') return 'large';
  if (s === 'T') return 'tile';
  if (s === 'I') return 'icon';
  if (s === 'S') return 'small';
  return e.querySelector(':scope > span:not(.sr), :scope > .rb-bl') ? 'small' : 'icon';
}
export function tagKinds(root, scope) {
  if (!root) return;
  for (const e of root.querySelectorAll('button, input, select, .sep, .rb-glab, .rb-cap')) if (!e.dataset.kind) e.dataset.kind = kindOf(e, scope);
}

// A group's commands in Word's order where src/ribbon/layout.js lays the group out (those it does
// not list after them, small), each with its line l; else in the registry's order
function laidOut(tab, group) {
  const items = inGroup(tab, group), lines = groupLayout(tab, group);
  if (!lines) return items;
  const out = [];
  let brk = false;
  for (const l of lines) {
    if (l.brk) { brk = true; continue; }
    const x = items.find((y) => y.c.id === l.id);
    if (x) { out.push({ ...x, l: brk ? { ...l, brk } : l }); brk = false; }
  }
  for (const x of items) if (!out.some((y) => y.c.id === x.c.id)) out.push({ ...x, l: { id: x.c.id, size: 'S', tip: null, shown: null } });
  return out;
}
// The columns a laid out group's controls take: a large one (or a tile) a column of its own, small
// ones three to a column, '|' a new column. Small (sm and nm, the large ones small too), a run of
// Word's small ones stays together, Previous over Next: where it would not fit in what is left of
// a column it starts the next (smallBreak marks it, for the style sheet).
const isBig = (l) => l.size === 'L' || l.size === 'T';
function packed(items, small) {
  let n = 0, row = 3;
  const brk = new Set();
  items.forEach(({ l }, i) => {
    if (l.brk) row = 3;
    if (!small && isBig(l)) { n++; row = 3; return; }
    if (small && !isBig(l) && (i === 0 || isBig(items[i - 1].l) || l.brk) && row < 3) {
      let len = 0;
      for (let j = i; j < items.length && !isBig(items[j].l) && (j === i || !items[j].l.brk); j++) len++;
      if (row + Math.min(len, 3) > 3) { brk.add(i); row = 3; }
    }
    if (row >= 3) { n++; row = 0; }
    row++;
  });
  return { n: Math.max(n, 1), brk };
}
const columns = (items, small) => packed(items, small).n;
// A large button's name over two lines, as Word breaks them: at the space that leaves the longer
// line shortest ("Table of" over "Contents")
function twoLines(t) {
  const w = t.split(' ');
  if (w.length < 2) return [t];
  let best = null;
  for (let k = 1; k < w.length; k++) {
    const a = w.slice(0, k).join(' '), b = w.slice(k).join(' '), m = Math.max(a.length, b.length);
    if (!best || m < best.m) best = { m, a, b };
  }
  return [best.a, best.b];
}
// a control the toolbar's arrows skip: disabled, or a tile that cannot apply here
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
const wideScreen = () => !window.matchMedia || window.matchMedia('(min-width: 861px)').matches;
// where a laid out group has Word's layout (src/app.css): a wide window with a mouse (a touch
// screen keeps its row of 44 px targets)
const wideLay = () => !window.matchMedia || window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
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
        const items = laidOut(T.id, g.id).filter(({ c }) => !c.static || c.kind === 'custom');
        if (items.length) groups.push({ g, items });
      }
      if (!groups.length) continue;
      const tab = mk('button', 'rb-tab' + (T.ctx ? ' ctx' : ''), T.name);
      tab.type = 'button'; tab.id = 'rt-' + T.id; tab.dataset.tab = T.id;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false'); tab.setAttribute('aria-controls', 'rp-' + T.id); tab.tabIndex = -1;
      // the name stays the tab's own. The KeyTip letter is not text in the button: tests and the
      // accessible name read that text, and on a phone the hidden tab row would rename the panel.
      tab.setAttribute('aria-label', T.name);
      if (KEYTIPS[T.id]) { const tip = mk('span', 'rb-ktip'); tip.dataset.k = KEYTIPS[T.id]; tip.setAttribute('aria-hidden', 'true'); tab.append(tip); }
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
        gb.setAttribute('aria-label', g.name); gb.title = g.name + ': show the group\'s commands in a menu'; gb.setAttribute('aria-haspopup', 'menu'); gb.setAttribute('aria-expanded', 'false');
        // (its first command's icon, which it shows folded: see ribbonFit)
        const first = items.find(({ c }) => c.icon);
        if (first) gb.insertAdjacentHTML('beforeend', SVG(first.c.icon).replace('<svg ', '<svg class="rb-gico" '));
        gb.append(mk('span', '', g.name));
        gb.insertAdjacentHTML('beforeend', SVG(CARET));
        gb.addEventListener('click', () => this.openGroupMenu(T.id, g, gb));
        box.append(gb);
        // the corner arrow. On the Styles gallery it follows the tiles, so ArrowLeft from the
        // first tile still leaves the group. On the others it leads, so ArrowLeft into the
        // group still lands on the group's last command.
        const launch = LAUNCH[T.id + '/' + g.id];
        const launchBtn = () => {
          if (!launch) return null;
          const cmd = command(launch[0]);
          if (!cmd || !cmd.run) return null;
          const b = mk('button', 'rb-launch');
          b.type = 'button'; b.id = 'rl-' + T.id + '-' + g.id; b.dataset.cmd = cmd.id;
          b.setAttribute('aria-label', launch[1]); b.title = cmd.title || launch[1];
          b.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 7.8 7.8 2.2M4.2 2.2h3.6V5.8"/></svg>');
          b.addEventListener('click', () => this.runCommand(cmd.id));
          return b;
        };
        const gallery = T.id === 'home' && g.id === 'styles';
        // (a laid out group, Word's: each control's size, and the columns it takes with its names
        // and without them, so the group's name below spans them all; see src/ribbon/layout.js)
        const lay = items.some((x) => x.l);
        // Where the corner arrow's command is a button of the group too (Page setup, Footnote and
        // Endnote, Size and Position), that button is the arrow, with a mouse from 900 px: one
        // control, not an arrow and an icon beside it that do the same. Elsewhere it is the button.
        // (it keeps its place among them, for the narrower row)
        const own = launch ? items.find((x) => x.c.id === launch[0] && x.p.main) : null;
        if (!own && !gallery) { const b = launchBtn(); if (b) box.append(b); }
        const flow = own ? items.filter((x) => x !== own) : items;
        if (lay) {
          box.classList.add('lay');
          if (CHECKS.has(T.id + '/' + g.id)) box.classList.add('lay-check');
          box.style.setProperty('--c', columns(flow, false));
          box.style.setProperty('--cf', columns(flow, true));
        }
        const smallBreak = lay ? packed(flow, true).brk : new Set();
        for (const x of items) {
          const { c, p, l } = x;
          if (x === own) {
            const e = this.makeControl(c, p, null);
            e.classList.add('rb-launch-c');
            e.insertAdjacentHTML('beforeend', '<svg class="rb-larrow" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 7.8 7.8 2.2M4.2 2.2h3.6V5.8"/></svg>');
            box.append(e);
            continue;
          }
          const e = c.kind === 'custom' ? made.get(c.id) : this.makeControl(c, p, l);
          if (!e) continue;
          if (l) { e.dataset.size = l.size; if (l.brk) e.dataset.brk = '1'; if (smallBreak.has(flow.indexOf(x))) e.dataset.sbrk = '1'; }
          box.append(e);
        }
        if (gallery) { const b = launchBtn(); if (b) box.append(b); }
        // the group's name under its controls, as Word's ribbon labels them (the Styles gallery has
        // its own caption: this one names the group where the style list stands in its place).
        // Hidden from the accessibility tree: the group has the name.
        { const lab = mk('span', 'rb-glab', g.name); lab.setAttribute('aria-hidden', 'true'); box.append(lab); }
        tb.append(box);
      });
      tb.append(mk('span', 'grow'));
      panel.append(tb);
      rb.insertBefore(panel, $('#picinput'));
      this.rbTabs.push(T.id);
    }
    // the downloads wait in the first panel until a tab is chosen
    rb.querySelector('.rb-tb').append(dl);
    tagKinds(rb, 'ribbon'); tagKinds($('#rb-top'), 'ribbon'); tagKinds($('#bar'), 'bar'); tagKinds($('#status'), 'status');
    this.rbBuilt = true;
    const want = this.rbTabs.includes(this.rbTab) ? this.rbTab : 'home';
    this.rbTab = null;
    this.selectTab(want);
  },

  // a command's control: a button (with its icon, glyph and label), a toggle, a split button. l:
  // its line of a laid out group (src/ribbon/layout.js), which may show a shorter name, give a
  // name to a button that had its icon alone (shown from 900 px only, so a narrower row is as it
  // was), and break a large button's name over two lines with a menu's arrow after it.
  makeControl(c, p, l) {
    const label = c.label ? (p.main ? c.label : p.name) : null;
    const b = mk('button', 'btn ghost' + (label ? '' : ' icon'));
    b.type = 'button'; b.id = p.el; b.dataset.cmd = c.id;
    b.setAttribute('aria-label', p.name);
    b.title = tipTitle(c, p);
    if (c.kind === 'toggle') b.setAttribute('aria-pressed', 'false');
    if (c.icon) b.insertAdjacentHTML('beforeend', SVG(c.icon));
    else if (c.glyph) b.insertAdjacentHTML('beforeend', c.glyph);
    const shown = l && l.size !== 'I' && l.size !== 'T' ? l.shown || label || p.name : label;
    if (!shown) b.append(mk('span', 'sr', p.name));
    else if (!l) b.append(mk('span', '', shown));
    else {
      // (a name the command had none of stays out of a narrow row: rb-xl)
      if (!label) b.append(mk('span', 'sr', p.name));
      const bl = mk('span', 'rb-bl' + (label ? '' : ' rb-xl'));
      const lines = l.size === 'L' ? twoLines(shown) : [shown];
      lines.forEach((t, k) => { if (k) bl.append(' '); bl.append(mk('span', 'rb-ln', t)); });
      // a menu's arrow: after the name, or under it where the name is one line (a large button)
      if (c.kind === 'menu') (lines.length > 1 ? bl.lastChild : bl).insertAdjacentHTML('beforeend', SVG(CARET).replace('<svg ', '<svg class="rb-car" '));
      b.append(bl);
    }
    if (c.kind === 'menu') { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); }
    if (c.kind === 'split') {
      const box = splitButton(this, b, p.name, () => this.commandMenu(c));
      // A large split button as Word's: its icon above runs it, its name and arrow below open the
      // menu. The name below is drawn in the arrow's part, which is named "<name> options", so
      // what it shows is in its name; the button keeps its own (hidden there) for a smaller row.
      if (l && l.size === 'L' && shown) {
        const x = box.lastChild, bl = mk('span', 'rb-bl rb-xname'), lines = twoLines(shown);
        lines.forEach((t, k) => { if (k) bl.append(' '); bl.append(mk('span', 'rb-ln', t)); });
        (lines.length > 1 ? bl.lastChild : bl).insertAdjacentHTML('beforeend', SVG(CARET).replace('<svg ', '<svg class="rb-car" '));
        bl.setAttribute('aria-hidden', 'true');
        x.append(bl);
      }
      return box;
    }
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
    for (const { c, p } of laidOut(tab, g.id).filter(({ c }) => c.run && c.searchable !== false)) {
      const on = pressed(this, c, at);
      items.push({ name: p.name, title: c.title, keys: firstKey(c, macUA()), checked: on === null ? undefined : on, radio: !!c.static, disabled: !enabled(this, c, at), run: () => { this.ribbonBack(); this.runCommand(c.id); } });
      // (a split button's other choices too, as Word's folded group lists them: Find's Advanced
      // Find and Go To)
      if (c.kind === 'split') for (const it of this.commandMenu(c)) if (it && it.name !== p.name && it.command !== c.id) items.push({ ...it, run: () => { this.ribbonBack(); if (it.run) it.run(); } });
    }
    openMenu(this, gb, items, { label: g.name });
  },

  // One command run where the caret is, from a button, a key, the search box or a menu: nothing
  // when it cannot run there. The ribbon then shows the new state.
  runCommand(id, args, at, from) {
    // (the font box gives the page's selection back as it loses the focus; a key pressed before
    // that is done must find it on the page, see fbxFlush)
    if (this.fbxFlush && this.fbxFlush() && at !== undefined) at = this.ribbonAt();
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
    document.body.classList.toggle('file-open', id === 'file');
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
  // first, counted in controls: what takes none (the Download caption; a laid out group's large
  // buttons made small, then its names, see below), then a tile of the Styles gallery at a time,
  // down to three; the three downloads as one Download button; the buttons' names, which stay
  // their accessible names; the style list in the gallery's place; then the
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
    // (controls the app adds later, an update's button in the bar, take their kind here)
    tagKinds($('#bar'), 'bar'); tagKinds($('#status'), 'status');
    const panel = $('#rp-' + this.rbTab), gw = $('#rb-gw'), gal = !!panel && panel.contains(gw);
    const groups = panel ? [...panel.querySelectorAll('.rb-grp')] : [];
    const fits = () => rb.scrollWidth <= rb.clientWidth + 1;
    const tiles = (n) => { if (gal && n !== this.rbTiles) { this.rbTiles = n; this.rbFollow = true; this.paintGallery(); } };
    const flag = (c) => ({ do: () => rb.classList.add(c), undo: () => rb.classList.remove(c) });
    for (const g of groups) g.classList.remove('folded', 'ico', 'sm', 'nm');
    rb.classList.remove('rb-narrow', 'rb-fold', 'rb-nolab', 'rb-dl1');
    // (a phone's width has the list whatever the room: the style sheet hides the gallery there)
    const wide = gal ? getComputedStyle(gw).display !== 'none' : wideScreen();
    rb.classList.toggle('rb-narrow', !wide);
    // (once: again only where the fonts came since, or the ribbon was folded to its tabs and had no width)
    if (gal && wide && !(this.rbW && this.rbW.p > 0)) measureTiles(this);
    if (gal) { tiles(6); this.paintGallery(); }
    // (a spare group first, as one step each: its commands have a tab of their own)
    const fold = (g) => ({ do: () => g.classList.add('folded', ...(g.querySelector('.rb-gico') ? ['ico'] : [])), undo: () => g.classList.remove('folded', 'ico') });
    // (Home's spare Insert comes back only with the Styles gallery: opened beside the style list, it
    // showed more controls than a row a little wider, with the gallery and Insert folded)
    const spareFold = (g) => ({ ...fold(g), spare: true });
    const spare = foldsGroups() ? groups.filter((g) => g.dataset.spare).sort((x, y) => x.dataset.rank - y.dataset.rank || groups.indexOf(y) - groups.indexOf(x)) : [];
    const steps = [...spare.map(spareFold), flag('rb-nolab')];
    // (a laid out group, from 900 px with a mouse, gives way as Word's do: its large buttons small,
    // the least needed group first; then its names, the same way. Neither takes a control, so all
    // of it goes before any group folds. src/ribbon/layout.js)
    const lay = wideLay() ? groups.filter((g) => g.classList.contains('lay')).sort((x, y) => x.dataset.rank - y.dataset.rank || groups.indexOf(y) - groups.indexOf(x)) : [];
    // (a group's large buttons made small only where that is narrower: one large button with a
    // name over two lines is narrower than the same as a small one, and every step must take room)
    const small = (g) => ({ chain: 'small', do: () => { const w = g.offsetWidth; g.classList.add('sm'); if (g.offsetWidth >= w) g.classList.remove('sm'); }, undo: () => g.classList.remove('sm') });
    const bare = (g) => ({ chain: 'names', do: () => g.classList.add('nm'), undo: () => g.classList.remove('nm') });
    // (and a group of one large button keeps its name: it would save next to nothing, and Word
    // keeps such a group large until it folds)
    const named = lay.filter((g) => g.querySelectorAll(':scope > [data-size]').length > 1);
    steps.push(...lay.map(small));
    // Two chains, each given back from its last step only (ribbonFit's pass back): a step comes
    // back only once every later step of its chain has, so a group of higher rank is never smaller
    // than one of lower rank and a wider window never shows fewer names. The large buttons made
    // small are one chain. The names are the other: the less needed groups' names (below rank 4),
    // then the gallery's tiles one at a time down to three (Home), then the three downloads as one
    // Download button (Word spends no room on them), then the names of the groups that matter
    // most, then every button's name (rb-fold).
    // (Home with its gallery, all in the chain: the tiles down to three, its names, the style list in
    // the gallery's place, then its downloads, so a download in one press stays the longest and a
    // wider window never shows fewer names or controls: given back on their own, after the chain,
    // the list and the downloads came back where the names then could not. Where no group is laid
    // out and there is no gallery, a narrower row, the downloads go after the names on their own:
    // below 861 px the style sheet takes the names for nothing, and a row a little wider that gave
    // two downloads for the names would show fewer controls.)
    const home = !lay.length && gal && wide;
    steps.push(...named.filter((g) => g.dataset.rank < 4).map(bare));
    if (gal && wide) for (const n of [5, 4, 3]) steps.push({ do: () => tiles(n), undo: () => tiles(n + 1), chain: 'names' });
    if (lay.length) steps.push({ ...flag('rb-dl1'), chain: 'names' });
    steps.push(...named.filter((g) => g.dataset.rank >= 4).map(bare));
    steps.push({ ...flag('rb-fold'), chain: 'names' });
    if (gal && wide) steps.push({ ...flag('rb-narrow'), chain: 'names' });
    if (home) steps.push({ ...flag('rb-dl1'), chain: 'names' });
    else if (!lay.length) steps.push(flag('rb-dl1'));
    const order = foldsGroups() ? [...groups].filter((g) => !g.dataset.spare).sort((x, y) => x.dataset.rank - y.dataset.rank || groups.indexOf(y) - groups.indexOf(x)) : [];
    for (const g of order) steps.push(fold(g));
    let k = 0;
    while (k < steps.length && !fits()) steps[k++].do();
    const held = new Set();
    for (let i = k - 1; i >= 0; i--) {
      const st = steps[i];
      if (st.chain && held.has(st.chain)) continue;
      if (st.spare && gal && rb.classList.contains('rb-narrow')) continue;
      st.undo();
      if (!fits()) { st.do(); if (st.chain) held.add(st.chain); }
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
    // (Enter on a button the arrows reached from the font box, before the box gave the page's
    // selection back: given back now, and the buttons' states read again from it)
    if (b && app.fbxFlush && app.fbxFlush()) app.ribbonSync();
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
    // (a split button's arrow opened its menu on the down arrow already)
    if (!/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    // in a box the keys move in its text; past its first or last character they go on to the controls beside it
    const t = e.target;
    if (t.matches && t.matches('input') && (/^(Home|End|ArrowUp|ArrowDown)$/.test(e.key) || t.selectionStart !== t.selectionEnd || (e.key === 'ArrowLeft' ? t.selectionStart > 0 : t.selectionEnd < t.value.length))) return;
    const all = app.ribbonRove().filter((x) => !isOff(x)), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    // In Word's grid (a laid out group, a mouse, 900 px and wider) the arrows move as the eye does:
    // up and down a column, left and right to the control beside it in its row; past the group's
    // edge, to the next group's first control or the last group's last
    const grp = t.closest && t.closest('.rb-grp.lay:not(.folded)');
    const grid = grp && wideLay() && /^Arrow/.test(e.key);
    if (/^(ArrowUp|ArrowDown)$/.test(e.key) && !grid) return;
    e.preventDefault();
    let to = null;
    if (grid) {
      const mine = all.filter((x) => grp.contains(x)), r = t.getBoundingClientRect(), cy = (r.top + r.bottom) / 2;
      const over = (a, b, lo, hi) => Math.min(a[hi], b[hi]) - Math.max(a[lo], b[lo]) > 2;
      if (/^(ArrowUp|ArrowDown)$/.test(e.key)) {
        const down = e.key === 'ArrowDown';
        let best = Infinity;
        for (const x of mine) {
          const q = x.getBoundingClientRect(), gap = down ? q.top - r.bottom : r.top - q.bottom;
          if (x !== t && gap > -3 && over(q, r, 'left', 'right') && gap < best) { best = gap; to = x; }
        }
        if (!to) return;
      } else {
        const right = e.key === 'ArrowRight';
        // (one beside it in its row first, the nearest; then the nearest at all. Columns line up on
        // their left edges: a column's buttons are as wide as their names)
        const near = (xs) => {
          let best = null, pick = null;
          for (const x of xs) {
            const q = x.getBoundingClientRect(), gap = right ? q.left - r.left : r.left - q.left;
            if (x === t || gap < 3) continue;
            const row = over(q, r, 'top', 'bottom');
            const score = [row ? 0 : 1, gap + (row ? 0 : Math.abs((q.top + q.bottom) / 2 - cy)), q.top];
            if (!best || score[0] < best[0] || (score[0] === best[0] && (score[1] < best[1] - 0.5 || (Math.abs(score[1] - best[1]) <= 0.5 && score[2] < best[2])))) { best = score; pick = x; }
          }
          return pick;
        };
        to = near(mine);
        if (!to) {
          // the next group's control beside it (its first or last where that group is no grid)
          const first = all.indexOf(mine[0]), last = all.indexOf(mine[mine.length - 1]);
          to = right ? all[(last + 1) % all.length] : all[(first - 1 + all.length) % all.length];
          const g2 = to.closest('.rb-grp.lay:not(.folded)');
          if (g2 && g2 !== grp) to = near(all.filter((x) => g2.contains(x))) || to;
        }
      }
    }
    if (!to) to = all[e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
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
    // (a press with the mouse gives the tab no focus: its ring would stay drawn round it, the
    // keyboard's sign, after a click; the keys reach the tabs by Tab, F10 or Alt)
    app.selectTab(t.dataset.tab, document.activeElement === t);
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
  // (and whenever a face comes later: the page's serif in bold and italic, drawn on B, I and the
  // tiles, loads when first used, after fonts.ready on a slow line or machine, and the fold
  // measured before it was wrong: the tiles' names fell off at 1920 px, Save hid behind the fold)
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { cancelAnimationFrame(fit); fit = requestAnimationFrame(() => { app.rbW = null; app.ribbonFit(); }); });
  app.ribbonSync();
  app.ribbonFit();
  installKeyTips(app);
}

// Alt alone, or F10, shows Word's KeyTips on the tabs. A letter opens that tab (Help is Y then 2,
// a contextual tab J then its letter while it shows) and shows the letters of its controls, as
// Word's do (src/ribbon/layout.js): typing one runs that control, a group folded into a button has
// Z and a letter, Escape goes back to the tabs' letters and then away. The letters are drawn over
// the ribbon, not in the buttons: their names stay theirs. A key the letters take goes nowhere
// else (Escape would also let go of a selected picture). On a Mac, F10 alone: Option is how a Mac
// types é and ©, and Word for Mac has no KeyTips.
function installKeyTips(app) {
  const list = $('#rb-tabs');
  if (!list) return;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  let altDown = false, altUsed = false, level = 0, typed = '', tips = [];
  const layer = mk('div', 'rb-kt-layer');
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const field = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, math-field, [contenteditable="true"]:not(#pages), .CodeMirror');
  const shown = (el) => el && el.offsetParent !== null && el.getClientRects().length > 0;
  // the tabs' letters there are now (a contextual tab's while it shows)
  const tabTips = () => Object.entries(KEYTIPS).filter(([id]) => { const t = $('#rt-' + id); return t && !t.hidden; });
  const tabBadges = () => { for (const b of list.querySelectorAll('.rb-ktip')) b.hidden = !b.dataset.k.startsWith(typed); };
  // the open tab's controls that have letters, where they are now
  const collect = () => {
    const tab = app.rbTab, panel = $('#rp-' + tab), map = TIPS[tab] || {}, out = [], used = new Set();
    if (!panel) return out;
    for (const c of commands()) for (const p of places(c)) {
      if (p.tab !== tab || !map[c.id]) continue;
      const el = document.getElementById(p.el);
      if (shown(el) && panel.contains(el)) { out.push({ k: map[c.id], el }); used.add(map[c.id]); }
    }
    for (const b of panel.querySelectorAll('.rb-launch, .rb-launch-c')) {
      const L = LAUNCH[tab + '/' + b.closest('.rb-grp').dataset.group];
      if (L && L[2] && shown(b)) { out.push({ k: L[2], el: b }); used.add(L[2]); }
    }
    // a folded group: Z and its name's first letter (another of its letters, or a digit, where taken)
    for (const b of panel.querySelectorAll('.rb-grp.folded > .rb-gbtn')) {
      if (!shown(b)) continue;
      const name = (b.getAttribute('aria-label') || '').toUpperCase().replace(/[^A-Z]/g, '');
      const k = [...name, ...'123456789'].map((x) => 'Z' + x).find((x) => !used.has(x));
      if (k) { out.push({ k, el: b }); used.add(k); }
    }
    return out;
  };
  const draw = () => {
    layer.replaceChildren();
    for (const t of tips) {
      if (!t.k.startsWith(typed)) continue;
      const r = t.el.getBoundingClientRect(), big = r.height > 40;
      const b = mk('span', 'rb-kt', t.k);
      // (under a large button's middle, as Word draws them; at a small one's icon)
      b.style.left = Math.round(big ? r.left + r.width / 2 : r.left + Math.min(12, r.width / 2)) + 'px';
      b.style.top = Math.round(big ? r.bottom - 7 : r.bottom - 3) + 'px';
      layer.append(b);
    }
  };
  const show = (on) => {
    typed = '';
    level = on ? 1 : 0;
    document.body.classList.toggle('keytips', on);
    tabBadges();
    tips = []; layer.replaceChildren();
  };
  const commandsOf = () => {
    tips = collect();
    if (!tips.length) return show(false);
    level = 2; typed = '';
    document.body.classList.remove('keytips');
    draw();
  };
  const open = (id) => {
    if (!(app.rbTabs && app.rbTabs.includes(id))) return show(false);
    app.selectTab(id); app.peekRibbon(true);
    // (File opens its own sheet: its commands are buttons on the page, reached by Tab)
    if (id === 'file') return show(false);
    commandsOf();
  };
  const press = (t) => {
    show(false);
    const el = t.el;
    if (el.matches('input, select')) { el.focus(); if (el.select) el.select(); return; }
    if (el.disabled) return;
    el.click();
  };
  // (a key the letters take: the page, the picture's and the app's own keys never see it)
  const take = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.shiftKey) { altDown = true; altUsed = false; return; }
    if (altDown && e.key !== 'Alt') altUsed = true;
    if (e.key === 'F10' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !field(e)) {
      take(e);
      show(!level);
      return;
    }
    if (!level || field(e)) return;
    if (e.key === 'Escape') {
      take(e);
      if (typed) { typed = ''; if (level === 2) draw(); else tabBadges(); } else if (level === 2) show(true); else show(false);
      return;
    }
    const k = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (!k || e.ctrlKey || e.metaKey || e.altKey) return;
    take(e);
    const want = typed + k;
    if (level === 2) {
      const hits = tips.filter((t) => t.k.startsWith(want));
      if (!hits.length) return;
      const exact = hits.find((t) => t.k === want);
      if (exact) return press(exact);
      typed = want; draw();
      return;
    }
    // (Y then Y opens Help too, as it always has here)
    const hits = tabTips().filter(([, t]) => t.startsWith(want) || (want === 'YY' && t === 'Y2'));
    if (!hits.length) return;
    const exact = hits.find(([, t]) => t === want || (want === 'YY' && t === 'Y2'));
    if (exact) return open(exact[0]);
    typed = want; tabBadges();
  }, true);
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt') return;
    const alone = altDown && !altUsed && !e.ctrlKey && !e.metaKey && !e.shiftKey && !field(e);
    altDown = false;
    if (alone && !mac) { e.preventDefault(); show(!level); }
  }, true);
  // (anything else puts them away: a press, the window resized or scrolled, the focus gone)
  const away = () => { if (level) show(false); };
  document.addEventListener('pointerdown', away, true);
  addEventListener('resize', away);
  addEventListener('blur', away);
  $('#ribbon').addEventListener('scroll', away);
}
