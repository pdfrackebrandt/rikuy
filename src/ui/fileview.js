// File as Word's view (its "backstage"): File's commands over the window below the tabs, with a
// Back button. Esc, Back, or a command run from it give the document back, as Word does (a dialog
// a command opens stands over the view, which stays behind it); the tab that was open before
// comes back. The sheet itself is the ribbon's File panel
// (src/ribbon/tabs.js builds it; app.css's "File as a view" lays it over the page). `app` is the
// editor (src/app.js).

import { $, mk } from './dom.js';
import { command } from '../commands.js';

const isOpen = () => document.body.classList.contains('file-open');
const BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M11.5 6.5 8 10l3.5 3.5"/></svg>';

// what lies under the view: out of reach of the keys, Tab and a screen reader while it is open
// (inert), as Word's backstage leaves nothing of the document to type in; Find and Replace's
// floating dialog with them (app.css hides it)
const UNDER = ['#main', '#status', '#fr'];
const under = (on) => { for (const s of UNDER) { const e = $(s); if (e) e.inert = on; } };

// The view's Home, as Word's backstage opens: beside the column of File's commands, a new
// document a press away (blank, or each template, drawn as a page) and the documents this browser
// keeps, newest first, each a press away, not behind the Templates and Recent menus. Drawn again
// each time the view opens (the list changes as documents are made).
const PAGE = '<span class="rf-sheet" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
function fillHome(app) {
  const panel = $('#rp-file');
  if (!panel) return;
  let home = $('#rf-home');
  if (!home) { home = mk('div', 'rf-home'); home.id = 'rf-home'; panel.append(home); }
  home.replaceChildren();
  const tile = (label, name, title, run, cls) => {
    const b = mk('button', 'rf-tile' + (cls ? ' ' + cls : ''));
    b.type = 'button'; b.setAttribute('aria-label', name);
    // (its name, then what it is, as every tooltip: UI-PRINCIPLES.md C14)
    b.title = title ? name + ': ' + (/^[A-Z][a-z]/.test(title) ? title[0].toLowerCase() + title.slice(1) : title) : name;
    b.innerHTML = PAGE;
    b.append(mk('span', 'rf-tile-n', label));
    b.addEventListener('click', run);
    return b;
  };
  home.append(mk('h2', 'rf-h', 'New'));
  const tiles = mk('div', 'rf-tiles');
  const blank = command('new-blank'), tpl = command('new-template');
  if (blank) tiles.append(tile('Blank document', 'New blank document', blank.title, () => app.runCommand('new-blank'), 'blank'));
  for (const it of (tpl && tpl.menuItems ? tpl.menuItems(app) : [])) tiles.append(tile(it.name, it.name + ' template', it.title, it.run));
  home.append(tiles);
  home.append(mk('h2', 'rf-h', 'Recent'));
  const list = mk('div', 'rf-recent-list');
  list.setAttribute('role', 'list');
  home.append(list);
  // (the documents kept in this browser, the open one left out, as the Recent menu lists them)
  Promise.resolve(app.allSnaps ? app.allSnaps() : []).then((all) => {
    const seen = new Map();
    for (const v of all || []) if (v.name && v.name !== app.name && !seen.has(v.name)) seen.set(v.name, v);
    const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    if (!seen.size) {
      // (what belongs here, and the command that brings one, UI-PRINCIPLES.md N5)
      // (its own name: Open is the bar's, Browse the column's, and a name is in the tree once)
      const b = mk('button', 'btn ghost', 'Open a file');
      b.type = 'button'; b.id = 'rf-none-open'; b.title = 'Open a file (Ctrl+O): .tex, .bib, images, an Overleaf .zip or a Word .docx';
      b.addEventListener('click', () => app.runCommand('open'));
      list.append(mk('p', 'rf-none', 'No other documents yet: the ones you make or open here are kept in this browser.'), b);
      return;
    }
    for (const v of [...seen.values()].slice(0, 15)) {
      const row = mk('div', 'rf-row'); row.setAttribute('role', 'listitem');
      const b = mk('button', 'rf-doc');
      b.type = 'button'; b.setAttribute('aria-label', 'Open ' + v.name); b.title = 'Open ' + v.name + ': open it, as it was ' + when(v.t);
      b.append(mk('span', 'rf-doc-n', v.name), mk('span', 'rf-doc-t', when(v.t)));
      b.addEventListener('click', () => app.runCommand('recent', { open: v.name }));
      row.append(b); list.append(row);
    }
  }).catch(() => {});
}

// whether the last thing the person did was a key (File opened by Alt, F or Enter) or a press
let byKeys = false;
export function installFileView(app) {
  document.addEventListener('keydown', () => { byKeys = true; }, true);
  document.addEventListener('pointerdown', () => { byKeys = false; }, true);
  // (src/ribbon/tabs.js's selectTab calls this as File opens or closes)
  app.fileViewChanged = (on, was) => {
    if (!on) {
      under(false);
      // (left by another tab, as Word's backstage is left by a click on Home: the document gets its
      // caret back when the focus was in the view, now hidden; closeFileView does the rest)
      const a = document.activeElement, B = app.fileBack;
      if (B && (!a || a === document.body || (a.closest && a.closest('#rp-file'))) && !app.pop && app.files.get(B.c.f) === B.text) app.restoreCaret(B.c, true);
      return;
    }
    app.fileFrom = was && was !== 'file' ? was : app.fileFrom || 'home';
    // the caret or selection the document had, put back when the view is left with Esc or Back
    const at = app.caretNow ? app.caretNow() : null;
    app.fileBack = at && !at.ghost && !at.crossFile ? { c: at.collapsed ? { f: at.f, p: at.p } : { f: at.f, selA: at.a, selB: at.b }, text: app.files.get(at.f) } : null;
    const tb = $('#rp-file .rb-tb');
    if (tb && !$('#rf-back')) {
      const b = mk('button', 'btn ghost rf-back');
      b.id = 'rf-back'; b.type = 'button';
      b.setAttribute('aria-label', 'Back to the document');
      b.title = 'Back to the document (Esc)';
      b.innerHTML = BACK + '<span>Back</span>';
      b.addEventListener('click', () => app.closeFileView(true));
      tb.prepend(b);
    }
    fillHome(app);
    // the keys in the view, not in the page under it (a letter typed, or Word's Alt, F, N, wrote
    // into the hidden document): the page and the status bar inert, the focus on Back
    under(true);
    // (a tab of the row keeps it: the arrow keys go along the tabs, as Word's do)
    const back = $('#rf-back'), a = document.activeElement;
    // (its ring only when the keys opened the view: a press on File showed it, unasked)
    if (back && !(a && a.closest && a.closest('#rp-file, #rb-top'))) back.focus({ preventScroll: true, focusVisible: byKeys });
    // the browser's or the phone's Back closes the view, as Word's phone app's does (a page in a
    // frame has its parent's history: none there)
    if (window.top === window && !(history.state && history.state.rikuyFile)) { try { history.pushState({ ...(history.state || {}), rikuyFile: 1 }, ''); } catch (e) { /* refused */ } }
  };

  // giveBack: the document's caret again (Esc, Back); a command that ran from the view keeps the
  // focus where it put it (a dialog, the new document's blank paragraph)
  app.closeFileView = (giveBack, fromHistory) => {
    if (!isOpen()) return;
    const to = app.fileFrom && app.rbTabs && app.rbTabs.includes(app.fileFrom) && app.fileFrom !== 'file' ? app.fileFrom : 'home';
    app.selectTab(to);
    under(false);
    // (its history entry goes again; the popstate that brings is this close's own, not a Back:
    // counted, so a view opened again before it arrives is not closed by it)
    if (!fromHistory && history.state && history.state.rikuyFile) { try { selfBack++; history.back(); } catch (e) { selfBack--; } }
    const B = app.fileBack;
    app.fileBack = null;
    // (the focus in the view, the tabs or the title bar, or nowhere: the document gets it back)
    const lost = !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('#ribbon, #rb-top, #bar');
    if (giveBack && B && lost && !app.pop && app.files.get(B.c.f) === B.text) app.restoreCaret(B.c, true);
  };
  let selfBack = 0;
  addEventListener('popstate', () => { if (selfBack) { selfBack--; return; } if (isOpen()) app.closeFileView(true, true); });

  // a command run while the view is open closes it, as Word's do (Blank document, a template, a
  // recent document, Print); one that opens a dialog keeps it behind the dialog, as Word's Info
  // keeps the backstage behind Properties, and the dialog takes the focus; a menu of the view
  // opening (Templates, Recent, Export as) keeps it until one of its items is chosen
  const run = app.runCommand;
  app.runCommand = function (id, args, at, from) {
    const was = isOpen();
    const r = run.call(this, id, args, at, from);
    const c = was && isOpen() ? command(id) : null;
    const dialog = app.pop && app.pop.el.getAttribute('role') === 'dialog';
    if (c && dialog && !app.pop.el.contains(document.activeElement)) {
      const f = app.pop.el.querySelector('input:not([type=hidden]), select, textarea, button:not(.pop-x), [tabindex="0"]') || app.pop.el.querySelector('.pop-x');
      if (f) f.focus({ preventScroll: true });
    }
    if (c && !/^ribbon-/.test(id) && !(c.kind === 'menu' && args == null) && !dialog) {
      app.closeFileView(false);
      // a document made or opened from the view (a template, a recent one) with no caret yet: at
      // its start, as Blank document's blank paragraph has it
      // (the focus may still be on the view's hidden button that opened a menu of it)
      const place = () => {
        const a = document.activeElement;
        if (a && a.closest && a.closest('#rp-file')) a.blur();
        if (document.activeElement && document.activeElement !== document.body || app.pop || matchMedia('(pointer: coarse)').matches) return;
        // (a place the new document's page already holds is taken as it is, focused; else its start)
        if (app.caretNow()) app.root.focus({ preventScroll: true }); else if (app.placeInitialCaret) app.placeInitialCaret();
      };
      if (r && typeof r.then === 'function') r.then(place, () => {}); else place();
    }
    return r;
  };

  // The keys in the view, as Word's backstage takes them: Up and Down along the column of commands
  // and the Recent list, the arrows across the templates' pages, Tab from one part to the next
  // (the column, the pages, Recent) and round again. The ribbon's own keys (one stop for the whole
  // toolbar, Left and Right along it) do not reach here while the view is open.
  const vis = (e) => e.offsetParent !== null && !e.disabled;
  const parts = () => [[...document.querySelectorAll('#rp-file > .rb-tb button, #rp-file > .rb-tb select')], [...document.querySelectorAll('#rf-home .rf-tile')], [...document.querySelectorAll('#rf-home .rf-doc')]].map((l) => l.filter(vis)).filter((l) => l.length);
  const last = new Map();
  document.addEventListener('keydown', (e) => {
    if (!isOpen() || app.pop || e.altKey || e.ctrlKey || e.metaKey || window.innerWidth < 1000) return;
    const a = document.activeElement, P = parts(), k = P.findIndex((l) => l.includes(a));
    if (k < 0) return;
    const list = P[k], i = list.indexOf(a);
    const go = (x) => { if (!x) return; e.preventDefault(); e.stopPropagation(); last.set(P.findIndex((l) => l.includes(x)), x); x.focus(); };
    if (e.key === 'Tab') {
      const n = P[(k + (e.shiftKey ? P.length - 1 : 1)) % P.length];
      const kk = P.indexOf(n);
      return go(last.get(kk) && n.includes(last.get(kk)) ? last.get(kk) : n[0]);
    }
    const tiles = list[0].classList.contains('rf-tile');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!tiles) return go(list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]);
      // (the pages by rows: the one above or below, as far along as it can be)
      const row = list.filter((t) => t.offsetTop === list[0].offsetTop).length || 1;
      return go(list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? row : -row)))]);
    }
    if (tiles && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return go(list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]);
    if (e.key === 'Home' || e.key === 'End') return go(e.key === 'Home' ? list[0] : list[list.length - 1]);
  }, true);

  // (before the ribbon's own Esc, which would put the focus on the page under the view; a menu or
  // a dialog open over the view, or Alt's KeyTips, take their Esc first; the lists of the panes
  // docked in the page under the view are not open menus)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !isOpen() || app.pop || document.body.classList.contains('keytips')) return;
    if ([...document.querySelectorAll('[role=menu], [role=listbox]')].some((m) => m.offsetParent && !m.closest('#nav, #main, [inert]'))) return;
    e.preventDefault();
    e.stopPropagation();
    app.closeFileView(true);
  }, true);
}
