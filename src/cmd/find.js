// Batch B5, find and the outline: Find (Ctrl+F, the Navigation pane's search box), Replace (Ctrl+H)
// and Go To (Ctrl+G) in Word's Find and Replace dialog (src/ui/finddialog.js), Select▾ (Select
// All, a paragraph, a sentence, text with similar formatting), the outline's Promote, Demote,
// Move up and Move down (Alt+Shift+arrows), a heading's right click menu (new heading before and
// after, select heading and content), the Outline view (Ctrl+Alt+O), page x of y and the words
// of the selection in the status bar; the side panel itself is src/nav.js.
//
// What is found is the page's text (src/find.js maps each hit to the source's characters); a
// replacement is written through the escaping typing uses (App.escapeAt: % becomes \%, “ ``),
// into the first character's place, so the formatting of where it lands stays and the markup
// between the characters too. Replace All is one commit: one undo. "In LaTeX source" searches
// and replaces the files' own text, commands, labels and math included, the replacement as it is.

import { openQuickOpen } from '../ui/quickopen.js';
import { register, command, enabled, onInstall } from '../commands.js';
import { firstKey } from '../keys.js';
import { compile, expand, hitsIn, hitsInSource, runsWith, blockText, charSrc, hitSource, joinRanges, labelsIn, hasParaMark, pageParaText, paraHitSource, controlWords, inControlWord, PARA, PMARK, FMT, FORMATS, MAX_HITS } from '../find.js';
import { headingAt, sectionRange, promoteEdits, swapEdit, moveEdits, newHeading, eolOf, foldItems, foldEntry, matchFold, NAME } from '../outline.js';
import { absAtom, posFromDom, diff, endsWithControlWord } from '../editor.js';
import { $, load, store } from '../ui/dom.js';
import { openMenu } from '../ui/kit.js';
import { openFindDialog, closeFindDialog, findDialogSync } from '../ui/finddialog.js';

const isMacUA = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const plural = (n, a, b) => n.toLocaleString('en-US') + ' ' + (n === 1 ? a : b);
const memo = (at, k, f) => { if (!at) return f(); const m = at.memo || (at.memo = {}); if (!(k in m)) m[k] = f(); return m[k]; };
const MAG = '<circle cx="8.5" cy="8.5" r="4.6"/><path d="M12 12l4.5 4.5"/>';

// the heading the caret is in, as an index of model.headings, or -1
const headAt = (app, at) => memo(at, 'head', () => app.headingIndexAt(at));
const promoteOK = (delta) => (app, at) => memo(at, 'pro' + delta, () => { const k = headAt(app, at); return k >= 0 && !!app.promoteEdits(k, delta); });
const moveOK = (dir) => (app, at) => memo(at, 'mv' + dir, () => !!app.moveEditsAt(at, dir));

register(
  { id: 'outline-panel', name: 'Outline and problems', el: 'b-nav', static: true, place: 'bar', title: 'Show the outline, the problems and the changes in the side panel (Ctrl+Shift+O)', keysElsewhere: ['Ctrl+Shift+O'], synonyms: ['Outline', 'Problems', 'Side panel'],
    when: () => true, run: (app) => app.toggleNav() },
  { id: 'navigation-pane', name: 'Navigation pane', title: 'The Navigation pane: search the document, its headings and pages; a click goes there', synonyms: ['Outline', 'Headings', 'Document map', 'Pages', 'Thumbnails'], tab: 'view', group: 'show', el: 'rw-nav', label: 'Navigation pane', kind: 'toggle',
    icon: '<path d="M3.5 4.5h13v11h-13zM8.5 4.5v11M5 7.5h2M5 10h2"/>', when: () => true, on: (app) => app.navOpen('outline') && !app.outlineView, run: (app) => { if (app.outlineView) app.setOutlineView(false, true); else app.toggleNav(!app.navOpen('outline'), 'outline'); } },
  { id: 'outline-view', name: 'Outline', title: 'Outline view: the headings with the text under them in the side panel, to promote, demote and move (Ctrl+Alt+O)', synonyms: ['Outline view', 'Outlining'],
    tab: 'view', group: 'views', el: 'rw-outline', label: 'Outline', kind: 'toggle', order: 40, keys: ['Ctrl+Alt+O'], keyScope: 'app',
    icon: '<path d="M4 5h.01M4 10h.01M4 15h.01M7 5h9.5M9.5 10h7M9.5 15h7"/>', when: () => true, on: (app) => !!app.outlineView, run: (app) => app.setOutlineView(!app.outlineView) },

  // ---- Home ▸ Editing
  // (fit: on Home they show as the row has room; else the group "Editing" holds them, as Word's)
  { id: 'find', name: 'Find', order: 10, fit: true, title: 'Find text in the document, in the Navigation pane (Ctrl+F)', synonyms: ['Search document', 'Search the text', 'Look for'], tab: 'home', group: 'editing', el: 'rb-find', label: 'Find', kind: 'split',
    icon: MAG, keys: ['Ctrl+F'], when: () => true, run: (app) => app.findInPane(),
    menuItems: () => [{ name: 'Find', keys: 'Ctrl+F', command: 'find' }, { name: 'Advanced Find', command: 'advanced-find' }, { name: 'Go To', keys: firstKey(command('go-to'), isMacUA), command: 'go-to' }] },
  { id: 'advanced-find', name: 'Advanced Find', title: 'The Find and Replace dialog: match case, whole words, wildcards, formatting, in the LaTeX source', synonyms: ['Find and Replace', 'Find dialog'], when: () => true, run: (app) => openFindDialog(app, 'find') },
  { id: 'replace', name: 'Replace', order: 20, fit: true, title: 'Replace text in the document (Ctrl+H)', synonyms: ['Find and Replace', 'Substitute', 'Replace all'], tab: 'home', group: 'editing', el: 'rb-replace', label: 'Replace',
    icon: '<path d="M4 7.5h9l-2.5-2.5M16 12.5H7l2.5 2.5"/>', keys: ['Ctrl+H'], mac: { 'Ctrl+H': 'Control+H' }, when: () => true, run: (app) => openFindDialog(app, 'replace') },
  { id: 'go-to', name: 'Go To', title: 'Go to a page, a heading, a footnote, an equation, a figure, a table, a comment or a label (Ctrl+G, or F5)', synonyms: ['Go to page', 'Jump to', 'Go to section', 'Go to label'],
    keys: ['Ctrl+G', 'F5'], mac: { 'Ctrl+G': 'Ctrl+Alt+G' }, when: () => true, run: (app) => openFindDialog(app, 'goto') },
  // VS Code's quick open on Ctrl+P (POWER-USER.md 17): a project's files by a few letters; its first
  // line is Print, so Ctrl+P then Enter prints as Word's does (src/ui/quickopen.js)
  { id: 'go-to-file', name: 'Go to File', title: 'Go to a file of the project by a few letters of its name (Ctrl+P; Enter at once prints, as Word\'s Ctrl+P)', synonyms: ['Quick open', 'Open file of the project', 'Switch file', 'Files'],
    keys: ['Ctrl+P'], keyRank: 1, keyScope: 'app', when: () => true, run: (app) => openQuickOpen(app) },
  // Word's Shift+F4 finds the last words again, without the pane (Cmd+G on a Mac, as everywhere there)
  { id: 'find-next', name: 'Find Next', title: 'Find the words of the last Find again, the next place after the caret (Shift+F4)', synonyms: ['Repeat Find', 'Find again', 'Next result'],
    keys: ['Shift+F4', 'Ctrl+Alt+Y'], keysMac: ['Ctrl+Shift+F4', 'Ctrl+G'], when: () => true, run: (app) => app.findNext() },
  // Word's Shift+F5 (and Ctrl+Alt+Z): back to where the last edits were, the four last in turn
  { id: 'go-back', name: 'Go Back', title: 'The caret back to where you last edited; again, the edit before, among the last four (Shift+F5)', synonyms: ['Last edit', 'Previous edit', 'Last change', 'Where was I'],
    keys: ['Shift+F5', 'Ctrl+Alt+Z'], when: (app) => !!(app.hist && app.hist.length) || !!app.followBack || !!app.footnoteHere(), whyNot: () => 'Nothing has been edited yet.', run: (app) => app.goBack() },
  // Word's F8: each press selects more where the caret is: the word, the sentence, the paragraph,
  // the document; Shift+F8 one step back
  { id: 'extend-selection', name: 'Extend Selection', title: 'Select more: the word, then the sentence, the paragraph, the whole document, one step a press (F8)', synonyms: ['Grow selection', 'Expand selection', 'Select word'],
    keys: ['F8'], when: (app, at) => !!at && !at.c.ghost, whyNot: () => 'Put the caret in the text first.', run: (app, args, at) => app.extendSel(at) },
  { id: 'shrink-selection', name: 'Shrink Selection', title: 'Select less: one step of Extend Selection back (Shift+F8)', synonyms: ['Reduce selection'],
    keys: ['Shift+F8'], when: (app, at) => !!at && !at.c.ghost, whyNot: () => 'Put the caret in the text first.', run: (app) => app.shrinkSel() },
  { id: 'select', name: 'Select', order: 30, fit: true, title: 'Select all, a paragraph, a sentence, or text with similar formatting', tab: 'home', group: 'editing', el: 'rb-select', label: 'Select', kind: 'menu',
    icon: '<path d="M5 4.5v11M3.5 4.5h3M3.5 15.5h3M9 6.5h7.5M9 10h7.5M9 13.5h5"/>', when: () => true,
    run: (app) => app.openSelectMenu(), menuItems: (app) => regItems(app, SELECT) },
  { id: 'select-all', name: 'Select All', title: 'The whole document\'s text (Ctrl+A)', keysElsewhere: ['Ctrl+A'], synonyms: ['Select everything'], run: (app) => { app.ribbonBack(); app.selectAllText(); } },
  { id: 'select-paragraph', name: 'Select paragraph', title: 'The paragraph the caret is in', when: (app, at) => !!app.paraAt(at), whyNot: () => 'Put the caret in a paragraph first.', run: (app, args, at) => app.selectPara(at, false) },
  { id: 'select-sentence', name: 'Select sentence', title: 'The sentence the caret is in', when: (app, at) => !!app.paraAt(at), whyNot: () => 'Put the caret in a sentence first.', run: (app, args, at) => app.selectPara(at, true) },
  { id: 'select-similar', name: 'Select text with similar formatting', title: 'Every place with the formatting the caret has: the same command (\\textbf, \\emph, a heading level), marked and listed under Results',
    synonyms: ['Select all text with similar formatting', 'Similar formatting'],
    when: (app, at) => !!app.fmtAt(at), whyNot: () => 'The caret is in text without formatting of its own.', run: (app, args, at) => app.selectSimilar(at) },

  // ---- the outline: the page's caret in a heading (and the Navigation pane's toolbar)
  { id: 'promote', name: 'Promote', title: 'Promote: the heading, and every heading under it, one level up (Alt+Shift+←)', synonyms: ['Promote heading', 'Outline promote'], keys: ['Alt+Shift+ArrowLeft'], mac: { 'Alt+Shift+ArrowLeft': 'Control+Shift+ArrowLeft' },
    menu: { heading: 10 }, when: promoteOK(-1), whyNot: (app, at) => headAt(app, at) < 0 ? 'Put the caret in a heading first.' : 'It is the top level this document has.', run: (app, args, at) => app.promoteAt(headAt(app, at), -1) },
  { id: 'demote', name: 'Demote', title: 'Demote: the heading, and every heading under it, one level down (Alt+Shift+→)', synonyms: ['Demote heading', 'Outline demote'], keys: ['Alt+Shift+ArrowRight'], mac: { 'Alt+Shift+ArrowRight': 'Control+Shift+ArrowRight' },
    menu: { heading: 20 }, when: promoteOK(1), whyNot: (app, at) => headAt(app, at) < 0 ? 'Put the caret in a heading first.' : 'A heading under it is at the lowest level, \\subparagraph.', run: (app, args, at) => app.promoteAt(headAt(app, at), 1) },
  { id: 'move-up', name: 'Move up', title: 'Move the paragraph above the one before it; on a heading, its whole section (Alt+Shift+↑)', synonyms: ['Move paragraph up', 'Move section up'], keys: ['Alt+Shift+ArrowUp'], mac: { 'Alt+Shift+ArrowUp': 'Control+Shift+ArrowUp' },
    when: moveOK(-1), whyNot: () => 'Nothing of the same kind stands before it here.', run: (app, args, at) => app.moveAt(at, -1) },
  { id: 'move-down', name: 'Move down', title: 'Move the paragraph below the one after it; on a heading, its whole section (Alt+Shift+↓)', synonyms: ['Move paragraph down', 'Move section down'], keys: ['Alt+Shift+ArrowDown'], mac: { 'Alt+Shift+ArrowDown': 'Control+Shift+ArrowDown' },
    when: moveOK(1), whyNot: () => 'Nothing of the same kind stands after it here.', run: (app, args, at) => app.moveAt(at, 1) },
  { id: 'heading-before', name: 'New heading before', title: 'A new heading of the same level before this one', menu: { heading: 40 }, when: (app, at) => headAt(app, at) >= 0, run: (app, args, at) => app.newHeadingAt(headAt(app, at), 'before') },
  { id: 'heading-after', name: 'New heading after', title: 'A new heading of the same level after this section', menu: { heading: 50 }, when: (app, at) => headAt(app, at) >= 0 && !!app.sectionOf(headAt(app, at)), run: (app, args, at) => app.newHeadingAt(headAt(app, at), 'after') },
  { id: 'subheading-new', name: 'New subheading', title: 'A new heading one level down, at the end of this section', menu: { heading: 55 }, when: (app, at) => { const k = headAt(app, at); return k >= 0 && app.model.headings[k].level < 5 && !!app.sectionOf(k); }, run: (app, args, at) => app.newHeadingAt(headAt(app, at), 'sub') },
  { id: 'heading-select', name: 'Select heading and content', title: 'The heading and everything under it, to its next heading of the same level', menu: { heading: 60 }, when: (app, at) => headAt(app, at) >= 0 && !!app.sectionOf(headAt(app, at)), run: (app, args, at) => app.selectSection(headAt(app, at)) },

  // ---- a heading's text collapsed on the page (Word's triangle beside a heading): the page's
  // view alone, never the source or the PDF; kept for each document in this browser
  { id: 'heading-collapse', name: 'Collapse heading', title: 'Hide the text under this heading on the page; the source and the PDF keep it (Alt+Shift+-)', synonyms: ['Collapse', 'Fold heading', 'Hide section text', 'Expand/Collapse'],
    keys: ['Alt+Shift+-'], keysQuiet: ['Alt+Shift+_'], mac: { 'Alt+Shift+-': 'Control+Shift+-', 'Alt+Shift+_': 'Control+Shift+_' }, menu: { heading: 70 },
    when: (app, at) => { const k = headAt(app, at); return k >= 0 && !app.foldIs(k); }, whyNot: (app, at) => headAt(app, at) < 0 ? 'Put the caret in a heading first.' : 'It is collapsed already: Expand heading shows its text.', run: (app, args, at) => app.foldSet(headAt(app, at), true) },
  { id: 'heading-expand', name: 'Expand heading', title: 'Show the text under this heading again (Alt+Shift++)', synonyms: ['Expand', 'Unfold heading', 'Show section text'],
    keys: ['Alt+Shift++'], mac: { 'Alt+Shift++': 'Control+Shift++' }, menu: { heading: 71 },
    when: (app, at) => { const k = headAt(app, at); return k >= 0 && app.foldIs(k); }, whyNot: (app, at) => headAt(app, at) < 0 ? 'Put the caret in a heading first.' : 'Its text shows already.', run: (app, args, at) => app.foldSet(headAt(app, at), false) },
  // (Word's Alt+Shift+A, expand or collapse all: Expand where a heading is collapsed, else Collapse)
  { id: 'headings-expand-all', name: 'Expand all headings', title: 'Show the text under every collapsed heading (Alt+Shift+A)', synonyms: ['Expand all', 'Show all text', 'All levels'], menu: { heading: 72 },
    keys: ['Alt+Shift+A'], keyRank: 1, mac: { 'Alt+Shift+A': 'Control+Shift+A' },
    when: (app) => app.foldCount() > 0, whyNot: () => 'No heading is collapsed.', run: (app) => app.foldAll(false) },
  { id: 'headings-collapse-all', name: 'Collapse all headings', title: 'Collapse every heading: the page shows the headings of the top level alone (Alt+Shift+A)', synonyms: ['Collapse all', 'Headings only'], menu: { heading: 73 },
    keys: ['Alt+Shift+A'], mac: { 'Alt+Shift+A': 'Control+Shift+A' },
    when: (app) => !!(app.model && app.model.headings && app.model.headings.length), whyNot: () => 'This document has no headings.', run: (app) => app.foldAll(true) },
  // Word's Alt+Shift+1 to 9: the headings down to that level, the text under them collapsed
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: 'show-level-' + n, name: 'Show Level ' + n, title: 'The headings down to level ' + n + ' alone, the text under them collapsed (Alt+Shift+' + n + ')',
    synonyms: ['Headings to level ' + n, 'Outline level ' + n], keys: ['Alt+Shift+' + n], mac: { ['Alt+Shift+' + n]: 'Control+Shift+' + n },
    when: (app) => !!(app.model && app.model.headings && app.model.headings.length), whyNot: () => 'This document has no headings.', run: (app) => app.foldLevel(n) }))
);

// the status bar follows the caret and the scrolling: the page it is on, the words selected; a
// click on the page's number opens Go To, as in Word
onInstall((app) => {
  // extend mode (F8): the arrows extend; Escape, a click, an edit or a key that types ends it
  app.root.addEventListener('keydown', (e) => {
    if (!app.extSel || !app.extSel.mode || e.isComposing || /^(Shift|Control|Alt|Meta|AltGraph|CapsLock)$/.test(e.key) || /^F\d+$/.test(e.key)) return;
    const k = EXTEND_KEYS[e.key];
    if (k && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      getSelection().modify('extend', k[0], e.ctrlKey ? k[2] : k[1]);
      return;
    }
    if (!/^Page(Up|Down)$/.test(e.key)) app.extendEnd();
  }, true);
  document.addEventListener('pointerdown', (e) => { if (app.extSel && app.extSel.mode && !(e.target.closest && e.target.closest('#toast'))) app.extendEnd(); }, true);
  const commit = app.commit;
  app.commit = function (...a) { if (this.extSel && this.extSel.mode) this.extendEnd(); return commit.apply(this, a); };
  let t = 0, w = 0;
  app.desk.addEventListener('scroll', () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => app.pageStatus()); }, { passive: true });
  document.addEventListener('selectionchange', () => { clearTimeout(w); w = setTimeout(() => { app.pageStatus(); app.wordStatus(); }, 120); });
  const b = $('#st-pages');
  if (b) b.addEventListener('click', () => openFindDialog(app, 'goto'));
});

export const methods = {
  // the Find and Replace dialog closed, as its Close button does (agents, tests)
  closeFind() { closeFindDialog(this); },
  // ---- the search's state ------------------------------------------------------------------
  // fs: what is searched for and how, the hits, the one shown; shared by the Navigation pane's
  // box and the Find and Replace dialog, as Word's two are
  findState() {
    if (!this.fs) this.fs = { q: '', rep: '', o: { matchCase: false, wholeWord: false, wildcards: false, regex: false, source: false, insel: false, fmt: 0 }, sel: null, hits: [], cur: -1, msg: '', on: false, obj: null };
    return this.fs;
  },
  // what to look for changed: the box, an option, a format
  findSet(ch) {
    const fs = this.findState();
    // (a search typed after Select text with similar formatting is a search of its own)
    if ('q' in ch && fs.fmtSimilar && !(ch.o && 'fmt' in ch.o)) fs.o.fmt = 0;
    if (ch.o && 'fmt' in ch.o || 'q' in ch) fs.fmtSimilar = false;
    if ('q' in ch) fs.q = ch.q;
    if ('rep' in ch) fs.rep = ch.rep;
    if (ch.o) Object.assign(fs.o, ch.o);
    if (fs.o.wildcards && fs.o.regex) { if (ch.o && ch.o.regex) fs.o.wildcards = false; else fs.o.regex = false; }
    if ('obj' in ch) fs.obj = ch.obj;
    fs.on = true;
    fs.note = '';
    fs.cur = -1;
    this.findRun();
  },
  findActive() { const fs = this.fs; return !!fs && fs.on && !!(fs.q || fs.o.fmt); },
  // marks off, the hits forgotten (the box emptied, the dialog closed with the pane's box empty)
  findClear() {
    const fs = this.findState();
    fs.on = false; fs.hits = []; fs.cur = -1; fs.msg = '';
    const HL = window.CSS && CSS.highlights;
    if (HL) { HL.delete('rk-find'); HL.delete('rk-find-cur'); }
    this.findViews();
  },

  // Every hit of the search, in the document's order. Typeset: the page's text, block by block;
  // In LaTeX source: each file's text. A hit keeps its block (bi), its place in the block's text,
  // its file and source range, the ranges of its characters (parts) and ro when it cannot be
  // replaced (a character with no source of its own).
  findRun(o = {}) {
    const fs = this.findState();
    this.findMap();
    const was = o.keep ? fs.was : null;
    fs.hits = []; fs.msg = ''; fs.more = false; fs.stopped = false; fs.cur = -1;
    fs.model = this.model;
    if (!this.model || (!fs.q && !fs.o.fmt)) { this.findPaint(); this.findViews(); return; }
    let re = null;
    if (fs.q) {
      const c = compile(fs.q, fs.o.fmt & FMT.equation && !fs.o.source ? { ...fs.o, literal: true } : fs.o);
      if (c.error != null) { fs.msg = c.error; this.findPaint(); this.findViews(); return; }
      re = c.re;
    }
    const t0 = Date.now(), sel = fs.o.insel ? fs.sel : null;
    const inSel = (h) => !sel || (h.f === sel.f && h.s >= sel.a && h.e <= sel.b);
    if (fs.o.source && re) {
      // the main file first, then the others in the order the document takes them in
      const order = [this.main, ...this.renderer.blocks.map((B) => B.f), ...this.files.keys()].filter((f, i, a) => a.indexOf(f) === i && this.files.has(f) && !/\.(png|jpe?g|pdf|gif|svg)$/i.test(f));
      for (const f of order) {
        const r = hitsInSource(this.src(f), re, { max: MAX_HITS - fs.hits.length });
        for (const x of r.hits) { const h = { f, s: x.i, e: x.j, m: x.m, parts: [[x.i, x.j]], src: true, text: x.m[0], st: x.m[0] }; if (inSel(h)) fs.hits.push(h); }
        if (r.more) fs.more = true;
        if (r.stopped || Date.now() - t0 > 1500) { fs.stopped = true; break; }
        if (fs.hits.length >= MAX_HITS) { fs.more = true; break; }
      }
    } else if (!fs.o.source && (fs.o.fmt & FMT.equation)) this.equationHits(fs, re, inSel, t0);
    else if (!fs.o.source && re && !fs.o.regex && hasParaMark(fs.q)) this.paraMarkHits(fs, re, fs.o.fmt || 0, inSel, t0);
    else if (!fs.o.source) {
      const want = fs.o.fmt || 0;
      this.renderer.blocks.forEach((B, bi) => {
        if (fs.stopped || fs.hits.length >= MAX_HITS) return;
        const T = blockText(B);
        if (!T.text) return;
        let hs;
        if (re) {
          const r = hitsIn(T.text, re, { max: MAX_HITS - fs.hits.length, t0 });
          if (r.stopped) fs.stopped = true;
          if (r.more) fs.more = true;
          hs = want ? r.hits.filter((h) => { for (let x = h.i; x < h.j; x++) if ((T.fmt[x] & want) !== want) return false; return true; }) : r.hits;
        } else hs = runsWith(T.fmt, T.text, want);
        for (const x of hs) {
          const s = hitSource(B, T, x.i, x.j);
          if (!s) continue;
          const h = { bi, B, T, i: x.i, j: x.j, m: x.m, ...s, text: T.text.slice(x.i, x.j) };
          h.st = this.src(h.f).slice(h.s, h.e);
          if (inSel(h)) fs.hits.push(h);
        }
      });
    }
    if (fs.stopped) fs.msg = 'Stopped after 1.5 s: the pattern takes too long on this document.';
    else if (fs.more) fs.msg = 'More than ' + plural(MAX_HITS, 'result', 'results') + ': only the first are shown.';
    // (the result shown before, where the edits since have taken it: the same one, or the next)
    fs.exact = false;
    if (was) {
      let k = fs.hits.findIndex((h) => h.f === was.f && h.s === was.s);
      fs.exact = k >= 0;
      if (k < 0) k = fs.hits.findIndex((h) => h.f === was.f && h.s >= was.s);
      fs.cur = k;
    }
    this.snapFiles();
    this.findPaint();
    this.findViews();
  },
  // The selection to look in, and the result shown, follow the edits made since the last search:
  // each file's text then is kept (only the files they are in), and a place moves by the
  // difference between that text and today's (typing, Replace, Undo, the source pane alike)
  findMap() {
    const fs = this.fs, snap = fs.snap || new Map();
    const map = (f, p, end) => {
      const old = snap.get(f), now = this.src(f);
      if (old == null || old === now) return p;
      const d = diff(old, now);
      if (!d) return p;
      const a = d.s, b = d.s + d.del.length;
      if (p < a || (p === a && !end)) return p;
      if (p >= b && !(p === a && end)) return p + d.ins.length - d.del.length;
      return end ? a + d.ins.length : a;
    };
    if (fs.sel) { fs.sel.a = map(fs.sel.f, fs.sel.a, false); fs.sel.b = Math.max(fs.sel.a, map(fs.sel.f, fs.sel.b, true)); }
    const cur = fs.hits[fs.cur];
    fs.was = cur ? { f: cur.f, s: map(cur.f, cur.s, false) } : null;
  },
  snapFiles() {
    const fs = this.fs, cur = fs.hits[fs.cur];
    fs.snap = new Map();
    for (const f of [fs.sel && fs.o.insel ? fs.sel.f : null, cur ? cur.f : null]) if (f && !fs.snap.has(f)) fs.snap.set(f, this.src(f));
  },
  // Before Replace or Replace All acts: the hits are those of the text as it is now (an edit made
  // since, by typing, Undo or the source pane, may have moved or changed them)
  findFresh() {
    const fs = this.findState();
    if (this.srcRebuild && this.srcRebuild.pending && this.srcRebuild.pending()) this.srcRebuild.flush();
    if (fs.on && fs.model === this.model && !this.findT) return false;
    clearTimeout(this.findT); this.findT = 0;
    this.findRun({ keep: true });
    return true;
  },

  // Format › Equation: each formula of the page (inline and displayed) as one result, or with words
  // in the box the places in its LaTeX that match them; a replacement is written there as LaTeX
  equationHits(fs, re, inSel, t0) {
    const els = new Map();
    for (const el of this.root.querySelectorAll('[data-a]')) els.set(el.dataset.a, el);
    this.renderer.blocks.forEach((B, bi) => {
      if (fs.stopped || fs.hits.length >= MAX_HITS) return;
      B.atoms.forEach((a, k) => {
        if (fs.stopped || a.kind !== 'math' || a.s == null || a.e == null || fs.hits.length >= MAX_HITS) return;
        const A = absAtom(B, a), text = this.src(A.f), el = els.get(B.id + '.' + k) || null;
        const add = (s, e, m) => { const h = { bi, B, f: A.f, s, e, m, parts: [[s, e]], src: true, eq: el, text: text.slice(s, e), st: text.slice(s, e) }; if (inSel(h)) fs.hits.push(h); };
        if (!re) { add(A.s, A.e, [text.slice(A.s, A.e)]); return; }
        const is = A.is != null && A.is >= A.s ? A.is : A.s, ie = A.ie != null && A.ie <= A.e ? A.ie : A.e;
        const t = text.slice(is, ie), cw = controlWords(t), own = fs.q[0] === '\\';
        const r = hitsInSource(t, re, { max: MAX_HITS - fs.hits.length });
        for (const x of r.hits) if (!inControlWord(cw, x.i, x.j, own)) add(is + x.i, is + x.j, x.m);
        if (r.more) fs.more = true;
        if (r.stopped || Date.now() - t0 > 1500) fs.stopped = true;
      });
    });
  },
  // Word's ^p on the page: the page's paragraphs as one text, a paragraph mark between two where
  // the source has a paragraph break (src/find.js pageParaText); a hit may run across marks
  paraMarkHits(fs, re, want, inSel, t0) {
    const bs = this.renderer.blocks, P = pageParaText(bs, (f) => this.src(f));
    const r = hitsIn(P.text, re, { max: MAX_HITS, t0 });
    if (r.stopped) fs.stopped = true;
    if (r.more) fs.more = true;
    const fmtOf = (x) => { if (P.bi[x] < 0) return -1; const B = bs[P.bi[x]]; return blockText(B).fmt[P.x[x]]; };
    for (const x of r.hits) {
      if (want) { let ok = true; for (let y = x.i; y < x.j && ok; y++) { const f = fmtOf(y); if (f >= 0 && (f & want) !== want) ok = false; } if (!ok) continue; }
      const s = paraHitSource(bs, P, x.i, x.j);
      if (!s) continue;
      let y = x.i;
      while (y < x.j && P.bi[y] < 0) y++;
      // (a hit of marks alone belongs to the paragraph after them)
      const bi = y < x.j ? P.bi[y] : (P.bi[x.j] >= 0 ? P.bi[x.j] : Math.max(0, P.bi[Math.max(0, x.i - 1)]));
      const h = { bi, B: bs[bi], T: P, i: x.i, j: x.j, m: x.m, ...s, text: P.text.slice(x.i, x.j).replace(/\u2029/g, '\n'), first: y < x.j ? fmtOf(y) : 0 };
      h.st = this.src(h.f).slice(h.s, h.e);
      if (inSel(h)) fs.hits.push(h);
    }
  },

  // where a hit stands in the document: its block's index, then its place
  findKey(h) { if (h.bi == null) h.bi = this.blockIndexOf(h.f, h.s); return [h.bi, h.s]; },
  // (by a binary search in each file's blocks, made once for each drawing of the page: a
  // document's labels or hits may be thousands, its blocks thousands too)
  blockIndexOf(f, p) {
    const bs = this.renderer.blocks;
    if (!this.bxIndex || this.bxIndex.of !== bs) {
      const by = new Map();
      bs.forEach((B, i) => { if (!by.has(B.f)) by.set(B.f, []); by.get(B.f).push(i); });
      this.bxIndex = { of: bs, by };
    }
    const list = this.bxIndex.by.get(f);
    if (!list) return f === this.main ? -1 : 1e9;
    // the last block of the file starting at or before p
    let lo = 0, hi = list.length - 1, at = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (bs[list[m]].s <= p) { at = m; lo = m + 1; } else hi = m - 1; }
    if (at >= 0 && p <= bs[list[at]].e) return list[at];
    // (before the body, between blocks, after them: by where it would come)
    return at + 1 < list.length ? list[at + 1] - 0.5 : at >= 0 ? list[at] + 0.5 : (f === this.main ? -1 : list[0] - 0.5);
  },
  // the caret's place in that order; while a field has the focus, the place kept on the page
  caretKey() {
    let c = this.caretNow();
    const r = this.rbRange;
    if ((!c || c.f == null) && r && r.startContainer.isConnected && this.root.contains(r.startContainer)) { const P = posFromDom(r.startContainer, r.startOffset, this.root); if (P && !P.ghost) c = { f: P.f, a: P.p }; }
    if (!c || c.f == null) return null;
    return [this.blockIndexOf(c.f, c.a), c.a];
  },

  // The marks on the pages: every hit lightly, the one shown strongly (CSS highlights, as the
  // comments and the changes are marked; nothing in the page's text changes)
  findPaint() {
    const HL = window.CSS && CSS.highlights;
    if (!HL || !window.Highlight) return;
    const fs = this.fs;
    if (!fs || !fs.on || !fs.hits.length) { HL.delete('rk-find'); HL.delete('rk-find-cur'); return; }
    const byFile = new Map(), all = [];
    // (a formula found has no text of the page's own: the whole of it is marked)
    const whole = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r; };
    fs.hits.slice(0, 5000).forEach((h, k) => { if (k === fs.cur) return; if (h.eq) { if (h.eq.isConnected) all.push(whole(h.eq)); return; } if (!byFile.has(h.f)) byFile.set(h.f, []); byFile.get(h.f).push(...h.parts); });
    for (const [f, rs] of byFile) all.push(...this.index.domRanges(f, joinRanges(rs)));
    HL.set('rk-find', new window.Highlight(...all));
    const cur = fs.hits[fs.cur];
    if (cur) HL.set('rk-find-cur', new window.Highlight(...(cur.eq ? (cur.eq.isConnected ? [whole(cur.eq)] : []) : this.index.domRanges(cur.f, joinRanges(cur.parts)))));
    else HL.delete('rk-find-cur');
  },
  // after the pages were laid out again (an edit, a zoom): the search again, the shown hit kept
  findSoon() {
    clearTimeout(this.findT);
    // (the triangles of collapsed headings, where the pass put their headings)
    if ((this.fold && this.fold.shut.size) || this.foldHover) { cancelAnimationFrame(this.foldRaf); this.foldRaf = requestAnimationFrame(() => this.foldPaint()); }
    // (the Navigation pane's headings follow every edit at once, not only with the problems)
    if (this.navOpen && this.navOpen('outline') && this.nv) { clearTimeout(this.navT); this.navT = setTimeout(() => { if (this.navOpen('outline') && this.navView === 'headings') this.paintHeadings(); }, 60); }
    if (!this.findActive()) return;
    this.findT = setTimeout(() => {
      this.findT = 0;
      this.findRun({ keep: true });
      if (this.navOpen('outline') && this.navView === 'pages') this.paintPages();
    }, 220);
  },
  // the dialog, the Navigation pane and the status line say what the search has
  findViews() {
    findDialogSync(this);
    if (this.navOpen('outline')) this.paintNavFind();
  },
  findSummary() {
    const fs = this.findState();
    // (what Replace did, until the next search or step)
    if (fs.note) return fs.note + (fs.hits.length ? ' ' + plural(fs.hits.length, 'result is', 'results are') + ' left.' : '');
    if (fs.msg && !fs.hits.length) return fs.msg;
    if (!fs.on || (!fs.q && !fs.o.fmt)) return '';
    if (!fs.hits.length) return fs.o.insel ? 'Not found in the selection.' : 'Not found.';
    const n = fs.hits.length;
    return (fs.cur >= 0 ? 'Result ' + (fs.cur + 1).toLocaleString('en-US') + ' of ' + n.toLocaleString('en-US') : plural(n, 'result', 'results')) + (fs.more ? '+' : '') + (fs.msg && fs.hits.length ? '. ' + fs.msg : '');
  },

  // Next (dir 1) or previous (-1): from the hit shown, or from the caret when none is shown yet
  findGo(dir = 1) {
    const fs = this.findState();
    fs.note = '';
    if (!fs.on) this.findRun();
    if (!fs.hits.length) { this.findViews(); return null; }
    let k;
    if (fs.cur >= 0 && fs.cur < fs.hits.length) k = fs.cur + dir;
    else {
      const ck = this.caretKey();
      const after = (h) => { const hk = this.findKey(h); return hk[0] > ck[0] || (hk[0] === ck[0] && hk[1] >= ck[1]); };
      if (!ck) k = dir > 0 ? 0 : fs.hits.length - 1;
      else if (dir > 0) { k = fs.hits.findIndex(after); if (k < 0) k = fs.hits.length; }
      else { k = -1; for (let i = 0; i < fs.hits.length; i++) if (!after(fs.hits[i])) k = i; }
    }
    fs.wrapped = k < 0 || k >= fs.hits.length;
    fs.cur = (k + fs.hits.length) % fs.hits.length;
    this.snapFiles();
    this.findPaint();
    this.findShow(fs.hits[fs.cur]);
    this.findViews();
    return fs.hits[fs.cur];
  },
  findTo(k) {
    const fs = this.findState();
    if (!fs.hits[k]) return;
    fs.cur = k;
    this.snapFiles();
    this.findPaint();
    this.findShow(fs.hits[k]);
    this.findViews();
  },
  // the hit in view, about a third down the window
  findShow(h) {
    if (!h) return;
    // (a hit under a collapsed heading: the heading opens, as Word's does)
    if (this.fold && this.fold.hidden && this.fold.hidden.size && h.B && h.B.items.some((it) => this.fold.hidden.has(it))) { this.foldReveal((it) => it.block === h.B); this.findRun({ keep: true }); h = this.fs.hits[this.fs.cur] || h; this.findPaint(); }
    const rs = h.eq ? (h.eq.isConnected ? [(() => { const x = document.createRange(); x.selectNodeContents(h.eq); return x; })()] : []) : this.index.domRanges(h.f, joinRanges(h.parts));
    const r = rs[0] && rs[0].getBoundingClientRect();
    if (r && (r.width || r.height)) {
      const D = this.desk.getBoundingClientRect();
      if (r.top < D.top + 40 || r.bottom > D.bottom - 40) this.desk.scrollTop += r.top - D.top - D.height / 3;
      this.findDialogAside(rs[0].getBoundingClientRect());
      const pane = $('#srcpane');
      if (h.src && document.body.classList.contains('src-on') && pane) this.reveal(h.f, h.s, false);
      return;
    }
    if (h.eq) return;
    // (a hit in the preamble, or in a file the page does not show: the source pane shows it)
    if (h.src) this.reveal(h.f, h.s, false);
  },
  // the Find and Replace dialog moved off the hit it shows, as Word moves its own: below the
  // hit, or above it where there is no room (not on a phone, where it is a sheet at the foot)
  findDialogAside(r) {
    const d = this.fr && !this.fr.d.hidden ? this.fr.d : null;
    if (!d || window.innerWidth < 640) return;
    const R = d.getBoundingClientRect();
    if (r.right < R.left || r.left > R.right || r.bottom < R.top - 8 || r.top > R.bottom + 8) return;
    const below = r.bottom + 24, above = r.top - 24 - R.height;
    const top = below + R.height < window.innerHeight - 8 ? below : Math.max(8, above);
    d.style.top = Math.round(top) + 'px';
  },
  // the hit shown, selected on the page, as Word leaves it when the search is closed: typing
  // then replaces it
  findSelectCur() {
    const fs = this.fs, h = fs && fs.hits[fs.cur];
    if (!h) { this.ribbonBack(); return; }
    if (h.eq) {
      // (a formula: the caret beside it, as after a click on the page)
      const A = h.B && h.B.atoms.find((a) => a.kind === 'math' && absAtom(h.B, a).s <= h.s && h.e <= absAtom(h.B, a).e);
      this.restoreCaret({ f: h.f, p: A ? absAtom(h.B, A).s : h.s, bias: -1 });
      return;
    }
    const a = h.parts[0][0], b = h.parts[h.parts.length - 1][1];
    this.restoreCaret({ f: h.f, selA: a, selB: b });
    if (!this.caretNow()) this.restoreCaret({ f: h.f, p: a, bias: 1 });
  },

  // ---- replacing ----------------------------------------------------------------------------
  // The edits that write rep in hit h's place, as typing it over the hit would write it
  // (deletionEdits, then escapeAt: what lies between its characters goes where typing takes it
  // away, and words never run together over a comment). In the LaTeX source the replacement is
  // written as it is. null where the source there is no longer what was found, or where a LaTeX
  // paragraph would take a replacement with LaTeX's special characters as source (skip).
  hitEdits(h, rep) {
    const fs = this.findState(), src = this.src(h.f);
    if (h.st != null && src.slice(h.s, h.e) !== h.st) return null;
    const groups = fs.o.wildcards || fs.o.regex;
    // (in a formula the replacement is LaTeX as it is written: only ^& and the groups are codes)
    const text = !/[\\^$]/.test(rep) ? rep : h.eq ? expand(rep, h.m || [h.text], { ...(groups ? fs.o : {}), literal: true }) : expandRep(rep, h, fs.o, groups);
    if (h.src) return [{ f: h.f, s: h.s, e: h.e, t: text }];
    const a = h.parts[0][0], b = h.parts[h.parts.length - 1][1];
    // (a hit across a paragraph's end, ^p: each paragraph's part as typing over it takes it away,
    // and each break between them, a blank line alone, goes whole; one with braces or a heading's
    // command around it is found, not replaced)
    if (h.marks && h.hard) return { skip: 'para' };
    // (a break with comment lines in it, a note or a review comment: the comments stay, as typing's
    // joining keeps them, deletionEdits)
    const gapEdit = ([x, y]) => (/%/.test(src.slice(x, y)) ? this.deletionEdits(h.f, x, y) : [{ f: h.f, s: x, e: y, t: '' }]);
    const del = h.marks ? [...h.segs.flatMap(([x, y]) => this.deletionEdits(h.f, x, y)), ...h.gaps.flatMap(gapEdit)].sort((u, v) => u.s - v.s) : this.deletionEdits(h.f, a, b);
    let at = a;
    if (del.length && del[0].s > a && del[0].t === '') at = del[0].s;
    if (text && this.texAt(h.f, at, true) && /[\\{}%$&#^_~\n]/.test(text)) return { skip: 'latex' };
    // (^p in the replacement: a blank line, where the place is a paragraph's own text, outside any
    // group, argument or formula; a heading's, a cell's or a caption's text cannot hold one)
    if (/\n/.test(text) && !this.breakFits(h, at)) return { skip: 'break' };
    const t = text ? this.escapeAt(h.f, at, text) : '';
    const out = [];
    let put = !t;
    for (const ed of del) { if (!put && ed.s === at) { out.push({ ...ed, t: ed.t + t }); put = true; } else out.push(ed); }
    if (!put) out.push({ f: h.f, s: at, e: at, t });
    // (what is taken away must not join a control word to the letters after it: \dots and a
    // blank line before Next become \dots{}Next, never \dotsNext)
    out.sort((u, v) => u.s - v.s);
    for (let i = 0; i < out.length; i++) {
      if (out[i].t !== '') continue;
      let k = i;
      while (k + 1 < out.length && out[k + 1].s === out[k].e && out[k + 1].t === '') k++;
      let L = out[i].s;
      for (let j = i - 1; j >= 0 && out[j].e === L && out[j].t === ''; j--) L = out[j].s;
      if (endsWithControlWord(src, L) && /[A-Za-z@]/.test(src[out[k].e] || '')) out[k] = { ...out[k], t: '{}' };
      i = k;
    }
    return out;
  },
  // whether a paragraph break may be written at source place at, the start of hit h
  breakFits(h, at) {
    const fmt = h.marks ? h.first || 0 : (h.T && h.T.fmt ? h.T.fmt[h.i] : 0);
    if (fmt & (FMT.heading | FMT.chapter | FMT.h1 | FMT.h2 | FMT.h3 | FMT.table | FMT.caption | FMT.footnote | FMT.latex)) return false;
    const B = h.B, src = this.src(h.f);
    if (!B || B.f !== h.f || B.s == null || at < B.s || at - B.s > 40000) return false;
    // (an optional argument open at the place, \item[..] or \begin{theorem}[..], holds no break either)
    let d = 0, k = 0, math = false;
    for (let p = B.s; p < at; p++) {
      const c = src[p];
      if (c === '\\') { p++; continue; }
      if (c === '%') { const n = src.indexOf('\n', p); if (n < 0 || n >= at) return false; p = n; continue; }
      if (c === '{') d++; else if (c === '}') d--; else if (c === '$') math = !math;
      else if (d === 0 && c === '[') k++; else if (d === 0 && c === ']' && k > 0) k--;
    }
    return d === 0 && k === 0 && !math;
  },
  // Replace: the hit shown, if it is still what was found (an edit since may have moved it: it is
  // looked for again where the edit took it); then the next one in the list is shown
  replaceOne() {
    const fs = this.findState();
    const before = fs.hits[fs.cur], stale = this.findFresh();
    if (!fs.on || fs.cur < 0) {
      this.findGo(1);
      if (stale && before) { fs.note = 'The text changed since: this is the next result; Replace again to replace it.'; this.findViews(); }
      return;
    }
    const h = fs.hits[fs.cur];
    if (!h) return;
    // (the one shown is gone or changed: the next is shown, and the next press replaces it)
    if (stale && !fs.exact) { this.snapFiles(); this.findPaint(); this.findShow(h); fs.note = 'The text changed since: this is the next result; Replace again to replace it.'; this.findViews(); return; }
    if (h.ro) { this.findGo(1); fs.note = 'That one is drawn by a macro and cannot be replaced here: "In LaTeX source" finds its definition.'; this.findViews(); return; }
    const edits = this.hitEdits(h, fs.rep);
    if (!edits) { this.findGo(1); return; }
    if (edits.skip) { this.findGo(1); fs.note = SKIP_NOTE[edits.skip]; this.findViews(); return; }
    const shown = (fs.o.wildcards || fs.o.regex || /\^/.test(fs.rep) ? expandRep(fs.rep, h, fs.o, true) : fs.rep).length;
    const was = { bi: h.bi, i: h.i, f: h.f, s: h.s, src: !!h.src, len: shown };
    this.closeGroup();
    this.commit(edits, null, 'replace');
    this.closeGroup();
    this.findRun();
    // (the next in the list's order, the order Enter goes in: past the words just written)
    const k = was.src ? fs.hits.findIndex((x) => x.f === was.f && x.s >= was.s + was.len) : fs.hits.findIndex((x) => x.bi > was.bi || (x.bi === was.bi && x.i >= was.i + was.len));
    fs.cur = k;
    if (k >= 0) this.findShow(fs.hits[k]);
    this.snapFiles();
    this.findPaint();
    fs.note = k >= 0 ? '' : 'Replaced.';
    this.findViews();
  },
  // Replace All: every hit at once, one commit, so one undo takes it all back
  replaceAll() {
    const fs = this.findState();
    this.findFresh();
    if (!fs.on) this.findRun();
    const ok = [], edits = [];
    let ro = 0, tex = 0, para = 0, brk = 0;
    for (const h of fs.hits) {
      if (h.ro) { ro++; continue; }
      const e = this.hitEdits(h, fs.rep);
      if (!e) continue;
      if (e.skip) { if (e.skip === 'para') para++; else if (e.skip === 'break') brk++; else tex++; continue; }
      ok.push(h); edits.push(...e);
    }
    const left = (ro ? '; ' + plural(ro, 'other is', 'others are') + ' drawn by a macro and stayed' : '') + (tex ? '; ' + plural(tex, 'is', 'are') + ' in a LaTeX paragraph, where the replacement\'s %, $, & or braces would be LaTeX: tick In LaTeX source to write it there' : '') +
      (para ? '; ' + plural(para, 'runs', 'run') + ' across a paragraph\'s end with braces or a heading around it and stayed' : '') + (brk ? '; ' + plural(brk, 'is', 'are') + ' where a paragraph break (^p) cannot go (a heading, a cell, a caption, a group) and stayed' : '');
    if (!ok.length) { fs.note = fs.hits.length ? 'None replaced' + left + '.' : ''; this.findViews(); return 0; }
    const c = this.caretNow();
    this.closeGroup();
    this.commit(edits, c && c.f != null ? { f: c.f, p: c.a } : null, 'replace-all');
    this.closeGroup();
    const n = ok.length;
    this.findRun();
    fs.note = 'Replaced ' + plural(n, 'place', 'places') + left + '.';
    this.findPaint();
    this.findViews();
    return n;
  },

  // ---- Go To --------------------------------------------------------------------------------
  // The places of a kind, in the document's order: [{ num, text, f, p, page, heading }]
  goToTargets(kind) {
    const out = [], m = this.model;
    if (!m) return out;
    if (kind === 'page') return this.layout.pages.map((P, k) => ({ num: String(k + 1), page: k }));
    if (kind === 'section') return (m.headings || []).filter((h) => h.f && h.s >= 0).map((h) => ({ num: h.num || '', text: h.text, f: h.f, p: h.s, heading: true }));
    this.renderer.blocks.forEach((B) => {
      if (kind === 'figure' || kind === 'table') {
        for (const it of B.items) if (it.el.classList.contains('flt-' + kind)) out.push({ num: '', text: (it.el.querySelector('[data-ctx="cap"]') || {}).textContent || '', f: B.f, p: B.s });
        return;
      }
      for (const a of B.atoms) {
        if (kind === 'footnote' && a.kind === 'fn' && a.s != null) { const A = absAtom(B, a); out.push({ num: String(a.num ?? ''), f: A.f, p: A.s }); }
        if (kind === 'equation' && a.kind === 'math' && a.display && a.s != null) { const A = absAtom(B, a); out.push({ num: '', f: A.f, p: A.s, eq: true }); }
      }
    });
    if (kind === 'comment') {
      for (const t of this.allComments()) out.push({ num: '', text: t.who + ': ' + t.body, f: t.f, p: t.as, o: this.blockIndexOf(t.f, t.as) });
      out.sort((x, y) => x.o - y.o || x.p - y.p);
    }
    if (kind === 'label') {
      for (const [f, t] of this.files) if (/\.tex$/i.test(f)) for (const x of labelsIn(t)) out.push({ num: x.key, f, p: x.p, o: this.blockIndexOf(f, x.p) });
      out.sort((x, y) => x.o - y.o || x.p - y.p);
    }
    out.forEach((x, k) => { if (!x.num) x.num = String(k + 1); });
    return out;
  },
  // Go to the nth (value "3"), the one numbered so ("2.1", a label's key), one on or back from
  // where the caret is ("+2", "-1"), or the next or previous (no value, dir). { ok, msg }
  goToTarget(kind, value, dir = 1) {
    const list = this.goToTargets(kind);
    const KIND = { page: 'page', section: 'section', footnote: 'footnote', equation: 'equation', figure: 'figure', table: 'table', comment: 'comment', label: 'label' }[kind] || kind;
    if (!list.length) return { ok: false, msg: 'This document has no ' + KIND + 's.' };
    const v = String(value || '').trim();
    // where the caret is among them: the last at or before it
    let here = -1;
    if (kind === 'page') here = this.currentPage() - 1;
    else {
      const ck = this.caretKey();
      if (ck) list.forEach((x, k) => { const xk = this.blockIndexOf(x.f, x.p); if (xk < ck[0] || (xk === ck[0] && x.p <= ck[1])) here = k; });
    }
    let k = -1;
    if (!v) k = dir > 0 ? here + 1 : (kind === 'page' ? here - 1 : (() => { const ck = this.caretKey(); let j = -1; if (ck) list.forEach((x, i) => { const xk = this.blockIndexOf(x.f, x.p); if (xk < ck[0] || (xk === ck[0] && x.p < ck[1])) j = i; }); return j === here && here >= 0 && list[here].p === (this.caretNow() || {}).a ? here - 1 : j; })());
    else if (/^[+-]\d+$/.test(v)) k = here + parseInt(v, 10);
    else {
      k = list.findIndex((x) => x.num === v);
      if (k < 0 && /^\d+$/.test(v)) k = +v - 1;
      if (k < 0 && kind === 'label') k = list.findIndex((x) => x.num.toLowerCase().startsWith(v.toLowerCase()));
      if (k < 0 && kind === 'section') k = list.findIndex((x) => (x.text || '').toLowerCase().includes(v.toLowerCase()));
    }
    if (k < 0 || k >= list.length) return { ok: false, msg: v ? 'No ' + KIND + ' ' + v + ': the document has ' + plural(list.length, KIND, KIND + 's') + '.' : 'No ' + (dir > 0 ? 'next ' : 'previous ') + KIND + '.' };
    const x = list[k];
    if (x.page != null) this.goToPage(x.page);
    else { this.restoreCaret({ f: x.f, p: x.p, bias: 1 }, true); this.goTo(x.f, x.p, !!x.heading); }
    return { ok: true, msg: (KIND[0].toUpperCase() + KIND.slice(1)) + ' ' + (x.num || k + 1) + (list.length > 1 ? ' (' + (k + 1) + ' of ' + list.length + ')' : '') };
  },
  goToPage(k) {
    const P = this.layout.pages[k];
    if (!P) return;
    const D = this.desk.getBoundingClientRect(), R = P.el.getBoundingClientRect();
    this.desk.scrollTop += R.top - D.top - 12;
    const first = P.el.querySelector('span.t:not(.ph)');
    if (first && first.firstChild) { this.root.focus({ preventScroll: true }); getSelection().collapse(first.firstChild, 0); }
    this.pageStatus();
  },
  // the page the caret is on; with no caret on the page, the one most in view
  currentPage() {
    const pages = this.layout.pages;
    if (!pages.length) return 0;
    const s = getSelection(), n = s.rangeCount && this.root.contains(s.anchorNode) ? s.anchorNode : null;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const pg = el && el.closest('.page');
    if (pg) { const k = pages.findIndex((P) => P.el === pg); if (k >= 0) return k + 1; }
    const D = this.desk.getBoundingClientRect(), mid = D.top + D.height / 3;
    for (let k = 0; k < pages.length; k++) { const R = pages[k].el.getBoundingClientRect(); if (R.bottom >= mid) return k + 1; }
    return pages.length;
  },

  // ---- the status bar: page x of y, the words (of the selection too) --------------------------
  countStatus(pages, words) {
    this.stPages = pages; this.stWords = words;
    this.pageStatus();
    this.wordStatus();
  },
  pageStatus() {
    const b = $('#st-pages');
    if (!b || !this.layout) return;
    const n = this.layout.pages.length, k = Math.min(n, this.currentPage() || 1);
    const t = 'Page ' + k + ' of ' + n;
    if (b.textContent !== t) b.textContent = t;
    if (this.navOpen('outline') && this.navView === 'pages') this.markPage();
  },
  wordStatus() {
    const w = $('#st-words');
    if (!w || this.stWords == null) return;
    const total = this.stWords.toLocaleString('en-US');
    const s = getSelection();
    let t = total + ' words';
    if (s.rangeCount && !s.isCollapsed && this.root.contains(s.anchorNode)) {
      // the words of the page's text inside the selection, counted as the model counts them
      const r = s.getRangeAt(0), parts = [];
      // (the words the total counts: a paragraph's, not a heading's, a caption's or a cell's)
      for (const span of this.root.querySelectorAll('.it.p span.t')) {
        if (!r.intersectsNode(span) || span.classList.contains('ph') || span.closest('td, [data-ctx="cap"]')) continue;
        const node = span.firstChild;
        if (!node) continue;
        const a = node === r.startContainer ? r.startOffset : 0, b = node === r.endContainer ? r.endOffset : node.length;
        parts.push(node.data.slice(a, b));
      }
      const n = (parts.join(' ').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}‌‍'’-]*/gu) || []).length;
      t = n.toLocaleString('en-US') + ' of ' + total + ' words';
    }
    if (w.textContent !== t) w.textContent = t;
  },

  // ---- Select ---------------------------------------------------------------------------------
  // Select▾: its menu under its button (or, with its group folded, under the group's)
  openSelectMenu() {
    const b = $('#rb-select'), g = $('#rg-home-editing');
    const at = b && b.offsetParent ? b : g && g.offsetParent ? g : null;
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    openMenu(this, at || this.root.getBoundingClientRect(), regItems(this, SELECT), { label: 'Select' });
  },
  // the paragraph of the page's text the caret is in: its block, its text and its [a, b) there
  paraAt(at) {
    return memo(at, 'para', () => {
      if (!at || !at.B || at.c.ghost) return null;
      const T = blockText(at.B), c = at.c;
      let x = -1;
      for (let i = 0; i < T.text.length; i++) { const r = charSrc(at.B, T, i); if (r && r.f === c.f && r.e > c.a) { x = i; break; } }
      if (x < 0) for (let i = T.text.length - 1; i >= 0; i--) if (charSrc(at.B, T, i)) { x = i; break; }
      if (x < 0) return null;
      let a = x, b = x;
      while (a > 0 && T.text[a - 1] !== PARA) a--;
      while (b < T.text.length && T.text[b] !== PARA) b++;
      return { B: at.B, T, x, a, b };
    });
  },
  // Select paragraph, or the sentence the caret is in (Intl's sentences where the browser has
  // them, else up to the next ., ! or ? and a space)
  // Find Next: the last Find's words again, from the caret; none yet, the Navigation pane's box
  findNext() {
    const fs = this.findState();
    if (!fs.q) return this.findInPane();
    const hit = this.findGo(1);
    if (!hit) { this.toast('"' + fs.q + '" is not in the document.'); return true; }
    // (selected, as Word's Find Next leaves what it found: typing replaces it)
    const rs = hit.eq ? [] : this.index.domRanges(hit.f, joinRanges(hit.parts));
    if (rs.length) {
      const r = document.createRange();
      r.setStart(rs[0].startContainer, rs[0].startOffset);
      r.setEnd(rs[rs.length - 1].endContainer, rs[rs.length - 1].endOffset);
      this.root.focus({ preventScroll: true });
      const sel = getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    }
    return true;
  },
  // Go Back: the places of the last edits, newest first; a press the next one of them, again and
  // again while nothing else is edited
  goBack() {
    // in a footnote typed at the page's foot, Word's Shift+F5 is the way back to its mark first
    if (this.leaveFootnote()) return true;
    // after a reference was followed to its label (F12), back to the reference, as VS Code's
    // Alt+Left; once anything is edited, the places of the edits again
    const F = this.followBack;
    this.followBack = null;
    if (F && F.n === this.hist.length) { this.ribbonBack(); this.restoreCaret(F.back); this.scrollToCaret(); return true; }
    const spots = editSpots(this.hist, 4);
    if (!spots.length) return false;
    const G = this.goBackAt, top = this.hist[this.hist.length - 1];
    let i;
    if (G && G.top === top && G.n === this.hist.length) i = (G.i + 1) % spots.length;
    else {
      // (the first press passes over the place the caret is at already)
      const c = this.caretNow();
      i = spots.findIndex((x) => !(c && !c.ghost && c.f === x.f && Math.abs(c.a - x.p) < SPOT_NEAR));
      if (i < 0) i = 0;
    }
    this.goBackAt = { top, n: this.hist.length, i };
    const x = spots[i];
    this.ribbonBack();
    this.goTo(x.f, x.p);
    this.restoreCaret({ f: x.f, p: x.p });
    return true;
  },
  // Extend Selection, as Word's F8: the first press turns extend mode on (the arrow keys then
  // extend the selection, Escape, a click or an edit end it); each press after selects the next
  // of word, sentence, paragraph, document that holds more than is selected now. Shrink
  // Selection (Shift+F8) gives back the step before, and from the first one ends the mode.
  extendSel(at) {
    const c = this.caretNow();
    if (!c || c.ghost) return false;
    let E = this.extSel;
    if (!E || !E.mode) {
      this.extSel = { stack: [], level: -1, mode: true };
      this.toast(EXTEND_SAY, 3600000, { label: 'End', fn: () => this.extendEnd() });
      return true;
    }
    const was = { f: c.f, a: c.a, b: c.b, collapsed: c.collapsed };
    for (let lv = E.level + 1; lv < 4; lv++) {
      if (lv === 3) this.selectAllText();
      else this.selectUnit(this.ribbonAt() || at, ['word', 'sentence', 'para'][lv]);
      const n = this.caretNow();
      const grew = lv === 3 || (n && !n.ghost && n.f === c.f && n.a <= c.a && n.b >= c.b && (n.a < c.a || n.b > c.b));
      if (!grew) { this.restoreCaret(was.collapsed ? { f: was.f, p: was.a } : { f: was.f, selA: was.a, selB: was.b }); continue; }
      E.stack.push(was);
      E.level = lv;
      return true;
    }
    return false;
  },
  shrinkSel() {
    const E = this.extSel;
    if (!E || !E.mode) return false;
    if (!E.stack.length) { this.extendEnd(); return true; }
    const x = E.stack.pop();
    E.level--;
    this.restoreCaret(x.collapsed ? { f: x.f, p: x.a } : { f: x.f, selA: x.a, selB: x.b });
    return true;
  },
  extendEnd() {
    if (!this.extSel || !this.extSel.mode) return;
    this.extSel = null;
    const t = document.getElementById('toast');
    if (t && t.textContent.startsWith(EXTEND_SAY)) t.hidden = true;
  },
  // the word, the sentence or the paragraph the caret is in, selected (the paragraph's words
  // read as the page shows them, cut as the language cuts them)
  selectUnit(at, unit) {
    if (unit !== 'word') return this.selectPara(at, unit === 'sentence');
    const P = this.paraAt(at);
    if (!P) return;
    const text = P.T.text.slice(P.a, P.b), x = Math.min(P.x - P.a, text.length);
    let a = -1, b = -1;
    let seg = null;
    try { seg = new Intl.Segmenter(this.model.opts.lang || 'en', { granularity: 'word' }); } catch (e) { seg = null; }
    if (seg) {
      // (the word at the caret, or the one just before it: a caret after a word's last letter)
      for (const k of [x, x - 1]) {
        if (k < 0 || k >= text.length) continue;
        const s = seg.segment(text).containing(k);
        if (s && s.isWordLike) { a = P.a + s.index; b = a + s.segment.length; break; }
      }
    } else {
      let i = x, j = x;
      while (i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1])) i--;
      while (j < text.length && /[\p{L}\p{N}]/u.test(text[j])) j++;
      if (j > i) { a = P.a + i; b = P.a + j; }
    }
    if (a < 0) return;
    const s = hitSource(P.B, P.T, a, b);
    if (s) this.restoreCaret({ f: s.f, selA: s.s, selB: s.e });
  },
  selectPara(at, sentence) {
    const P = this.paraAt(at);
    if (!P) return;
    let a = P.a, b = P.b;
    if (sentence) {
      const text = P.T.text.slice(P.a, P.b), x = P.x - P.a;
      let seg = null;
      try { seg = new Intl.Segmenter(this.model.opts.lang || 'en', { granularity: 'sentence' }); } catch (e) { seg = null; }
      if (seg) { const r = sentenceAt(text, Math.min(x, text.length - 1), seg); if (r) { a = P.a + r[0]; b = P.a + r[1]; } }
      else {
        let i = x; while (i > 0 && !/[.!?]\s/.test(text.slice(i - 2, i))) i--;
        let j = x; while (j < text.length && !/[.!?]/.test(text[j])) j++;
        a = P.a + i; b = P.a + Math.min(text.length, j + 1);
      }
    }
    while (b > a && /[\s￼]/.test(P.T.text[b - 1])) b--;
    while (a < b && /[\s￼]/.test(P.T.text[a])) a++;
    const s = hitSource(P.B, P.T, a, b);
    if (!s) return;
    this.restoreCaret({ f: s.f, selA: s.s, selB: s.e });
  },
  // the formatting of the caret's character (FMT bits), 0 for none
  fmtAt(at) {
    const P = this.paraAt(at);
    return P ? P.T.fmt[P.x] & ~(FMT.latex | KINDS) : 0;
  },
  // Select text with similar formatting: every run with the caret's formatting, marked on the
  // pages and listed under Results, the first selected
  selectSimilar(at) {
    const want = this.fmtAt(at);
    if (!want) return;
    this.findSet({ q: '', o: { fmt: want, source: false, insel: false } });
    const fs = this.fs;
    fs.fmtSimilar = true;
    const names = FORMATS.filter((f) => want & FMT[f.id]).map((f) => f.name).join(', ');
    fs.msg = '';
    this.toggleNav(true, 'outline');
    this.setNavView('results');
    if (this.nv) this.nv.q.value = '';
    this.toast(plural(fs.hits.length, 'place', 'places') + ' with ' + names + ': marked, and listed under Results.', 4000);
    const k = fs.hits.findIndex((h) => h.f === at.c.f && h.s <= at.c.a && at.c.a <= h.e);
    if (k >= 0) { fs.cur = k; this.findPaint(); this.findViews(); }
    this.ribbonBack();
  },

  // ---- the outline --------------------------------------------------------------------------
  // the heading the caret is in: its index in model.headings, or -1
  headingIndexAt(at) {
    if (!at || at.ctx !== 'h' || !at.B || !this.model) return -1;
    const B = at.B;
    return (this.model.headings || []).findIndex((h) => h.f === B.f && h.s === B.s && h.s >= 0);
  },
  headsList() { return (this.model && this.model.headings || []).map((h) => ({ f: h.f, s: h.s, level: h.level })); },
  // where the document's body ends in this file (the section of the last heading ends there)
  bodyEnd(f) {
    const d = this.model && this.model.docBody;
    return f === this.main && d && d.closed ? d.e : this.src(f).length;
  },
  sectionOf(k) {
    const H = this.headsList();
    if (!H[k]) return null;
    return sectionRange(this.src(H[k].f), H, k, this.bodyEnd(H[k].f));
  },
  promoteEdits(k, delta) {
    if (k < 0) return null;
    return promoteEdits((f) => this.src(f), this.headsList(), k, delta, this.model.opts.chapters ? 0 : 1);
  },
  promoteAt(k, delta) {
    const edits = this.promoteEdits(k, delta);
    if (!edits) return false;
    const c = this.caretNow();
    const h = this.model.headings[k];
    // (the caret stays in the heading's words: the command's name before it changed length)
    const d = edits[0].t.length - (edits[0].e - edits[0].s);
    this.closeGroup();
    this.commit(edits, c && c.f === h.f ? { f: c.f, p: c.a + (c.a > edits[0].s ? d : 0), bias: 1 } : null, 'outline');
    this.closeGroup();
    return true;
  },
  // The edit Move up or Move down makes where the caret is: a heading's section with the section
  // beside it of the same level; an item with the item beside it in its list; a paragraph (any
  // block of the page) with the block beside it. null where nothing of the kind stands there.
  moveEditsAt(at, dir) {
    if (!at || !at.B || at.c.ghost || at.cell) return null;
    const k = this.headingIndexAt(at);
    if (k >= 0) return this.sectionMove(k, dir);
    const B = at.B, src = this.src(B.f);
    if (at.it && at.it.dataset.li) {
      const li = (el) => { const v = el.dataset.li.split(',').map((x) => +x + B.base); return { s: v[0], e: v[1], ls: v[2], le: v[3] }; };
      const me = li(at.it);
      const sibs = B.items.map((it) => it.el.dataset.li ? li(it.el) : null).filter((x) => x && x.ls === me.ls && x.le === me.le).sort((x, y) => x.s - y.s);
      const i = sibs.findIndex((x) => x.s === me.s);
      const o = sibs[i + dir];
      if (i < 0 || !o) return null;
      const e = dir < 0 ? swapEdit(src, B.f, o, me, true) : swapEdit(src, B.f, me, o, true);
      return e && { edit: e, me };
    }
    // (a paragraph of a theorem or of another environment of several paragraphs would take the
    // whole environment with it: it stays; one paragraph with a formula in it moves whole)
    if (B.items.length > 1 && (/^\s*\\begin\s*\{/.test(src.slice(B.s, B.s + 40)) || !B.items.every((it) => it.el.dataset.ctx === 'p' || it.kind === 'math'))) return null;
    const bs = this.renderer.blocks, i = bs.indexOf(B), o = bs[i + dir];
    if (i < 0 || !o || o.f !== B.f) return null;
    // A paragraph's own \noindent, \medskip or \vspace before it goes with it (the model's block
    // starts after them). A heading beside it moves alone (the paragraph goes into the section before).
    const LEAD = /(?:\\(?:noindent|indent|medskip|smallskip|bigskip|par)(?![A-Za-z@])\s*|\\vspace\*?\{[^{}]{0,40}\}\s*)+$/;
    const lead = (p, floor) => { const g = src.slice(Math.max(floor, p - 200), p), m = LEAD.exec(g); return m ? p - m[0].length : p; };
    const prev = bs[i - 1 + (dir < 0 ? -1 : 0)];
    const me = { s: lead(B.s, dir < 0 ? o.e : prev && prev.f === B.f ? prev.e : 0), e: B.e };
    const it = { s: lead(o.s, dir < 0 ? (prev && prev.f === B.f ? prev.e : 0) : B.e), e: o.e };
    const e = dir < 0 ? swapEdit(src, B.f, it, me) : swapEdit(src, B.f, me, it);
    return e && { edit: e, me };
  },
  sectionMove(k, dir) {
    const H = this.headsList(), h = H[k];
    if (!h) return null;
    // the section beside it: the one of the same level before it or after it, under the same parent
    let j = -1;
    if (dir < 0) { for (let i = k - 1; i >= 0; i--) { if (H[i].level < h.level) break; if (H[i].level === h.level) { j = i; break; } } }
    else { for (let i = k + 1; i < H.length; i++) { if (H[i].level < h.level) break; if (H[i].level === h.level) { j = i; break; } } }
    if (j < 0 || H[j].f !== h.f) return null;
    const src = this.src(h.f), end = this.bodyEnd(h.f);
    const a = sectionRange(src, H, Math.min(k, j), end), b = sectionRange(src, H, Math.max(k, j), end);
    if (!a || !b) return null;
    const e = swapEdit(src, h.f, a, b);
    return e && { edit: e, me: dir < 0 ? b : a };
  },
  // Move up or down: one edit, one undo; the caret stays in the same words, now elsewhere
  moveAt(at, dir) {
    const r = this.moveEditsAt(at, dir);
    if (!r) return false;
    this.commitMove(r, at.c, dir);
    return true;
  },
  commitMove(r, c, dir) {
    const e = r.edit, src = this.src(e.f);
    // the piece that moved, where it now starts, and the caret's place in it
    let ps = r.me.s;
    while (ps < r.me.e && /\s/.test(src[ps])) ps++;
    const me = src.slice(ps, r.me.e).trim();
    const k = dir < 0 ? e.t.indexOf(me) : e.t.lastIndexOf(me);
    const off = c && c.f === e.f && c.a >= ps && c.a <= ps + me.length ? c.a - ps : 0;
    this.closeGroup();
    this.commit([e], { f: e.f, p: e.s + Math.max(0, k) + off, bias: 1 }, 'outline');
    this.closeGroup();
  },
  // A section dragged in the Navigation pane to before heading t; with after, to after heading t's
  // section; t = -1, after the last section of its file. A section's end stops before \appendix
  // and the bibliography (sectionRange), so nothing lands after them.
  moveSectionTo(k, t, after) {
    const H = this.headsList(), h = H[k];
    if (!h) return false;
    const r = this.sectionOf(k);
    if (!r) { this.toast('This section has text in more than one file: move it in the source.'); return false; }
    if (t < 0) { after = true; t = -1; for (let j = H.length - 1; j >= 0; j--) if (H[j].f === h.f) { t = j; break; } }
    if (!H[t] || H[t].f !== h.f) { this.toast('Sections move within their file.'); return false; }
    let to = H[t].s;
    if (after) { const x = this.sectionOf(t); if (!x) return false; to = x.e; }
    const edits = moveEdits(this.src(h.f), h.f, r.s, r.e, to, after);
    if (!edits) return false;
    this.closeGroup();
    this.commit(edits, null, 'outline');
    this.closeGroup();
    return true;
  },
  // a block (a paragraph, a list, a formula) dragged in the Outline view to before position t,
  // or with after, right after it (the end of a paragraph or of a section)
  moveBlockTo(B, f, t, after) {
    if (B.f !== f) return false;
    const edits = moveEdits(this.src(f), f, B.s, B.e, t, after);
    if (!edits) return false;
    this.closeGroup();
    this.commit(edits, null, 'outline');
    this.closeGroup();
    return true;
  },
  newHeadingAt(k, where) {
    const h = this.model.headings[k];
    if (!h) return;
    const at = headingAt(this.src(h.f), h.s);
    if (!at) return;
    const name = where === 'sub' ? NAME[Math.min(5, at.level + 1)] : at.name;
    let n;
    const nl = eolOf(this.src(h.f));
    if (where === 'before') n = newHeading(name, 'before', h.s, nl);
    else { const r = this.sectionOf(k); if (!r) return; n = newHeading(name, 'after', r.e, nl); }
    this.closeGroup();
    this.commit([{ f: h.f, s: n.s, e: n.s, t: n.t }], { f: h.f, p: n.caret, bias: -1 }, 'outline');
    this.closeGroup();
  },
  selectSection(k) {
    const r = this.sectionOf(k);
    if (!r) return;
    this.restoreCaret({ f: r.f, selA: r.s, selB: r.e });
  },

  // ---- a heading collapsed on the page (Word's triangle) ---------------------------------------
  // This document's collapsed headings (src/outline.js foldEntry), kept in this browser under its
  // name and main file. Their places follow the edits: each file's text when last looked at is
  // kept, and a place moves by the difference, as Find's do; the words find it again otherwise.
  foldState() {
    const key = (this.name || '') + '|' + (this.main || '');
    if (!this.fold || this.fold.key !== key) {
      const all = load(FOLD_KEY), list = all && typeof all === 'object' && Array.isArray(all[key]) ? all[key].filter(okEntry).slice(0, FOLD_MAX) : [];
      this.fold = { key, list, snap: new Map(), shut: new Set(), hidden: new Set(), by: new Map(), at: new Map(), sig: JSON.stringify(list) };
    }
    return this.fold;
  },
  foldSave() {
    const F = this.foldState(), sig = JSON.stringify(F.list);
    if (sig === F.sig) return;
    F.sig = sig;
    const all = load(FOLD_KEY) || {};
    delete all[F.key];
    if (F.list.length) all[F.key] = F.list;
    // (the documents last folded, fifty at most)
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete all[k];
    store(FOLD_KEY, all);
  },
  foldIs(k) { const F = this.fold; return !!F && F.shut.has(k); },
  foldCount() { return this.fold ? this.fold.list.length : 0; },
  // the places kept, moved by the edits made since they were last looked at
  foldMap() {
    const F = this.fold;
    for (const x of F.list) {
      const old = F.snap.get(x.f), now = this.files.get(x.f);
      if (now == null || old == null || old === now) continue;
      const d = F.diffs.get(x.f) || F.diffs.set(x.f, diff(old, now)).get(x.f);
      if (!d) continue;
      const a = d.s, b = d.s + d.del.length;
      if (x.s >= b) x.s += d.ins.length - d.del.length; else if (x.s > a) x.s = a;
    }
    F.snap = new Map();
    for (const x of F.list) if (!F.snap.has(x.f) && this.files.has(x.f)) F.snap.set(x.f, this.files.get(x.f));
  },
  // App.layoutPass gives the page's items here before they are measured and laid out: those under a
  // collapsed heading are taken out (the model, the source and the PDF keep them). A caret a
  // rebuild puts back inside them opens their heading.
  foldFilter(items) {
    const F = this.foldState();
    if (!F.list.length || !this.model) { if (F.hidden.size || F.shut.size) { F.hidden = new Set(); F.shut = new Set(); F.by = new Map(); F.at = new Map(); } return items; }
    F.diffs = new Map();
    this.foldMap();
    const heads = this.model.headings || [];
    const top = this.model.opts && this.model.opts.chapters ? 0 : 1;
    let shut = matchFold(F.list, heads), r = foldItems(items, heads, shut, top);
    const c = this.foldCaret;
    if (c && c.f != null && r.hidden.size) {
      const p = c.p != null ? c.p : c.selA;
      const want = (it) => it.block && it.block.f === c.f && it.block.s <= p && p <= it.block.e;
      for (let n = 0; n < 8; n++) {
        const it = items.find((x) => r.hidden.has(x) && want(x));
        if (!it) break;
        shut.delete(r.by.get(it));
        r = foldItems(items, heads, shut, top);
      }
    }
    F.shut = shut; F.hidden = r.hidden; F.by = r.by; F.at = r.at;
    F.list = [...shut].sort((a, b) => a - b).map((k) => foldEntry(heads[k]));
    clearTimeout(this.foldT);
    this.foldT = setTimeout(() => this.foldSave(), 400);
    if (r.hidden.size) { let w = 0; for (const it of items) if (!r.hidden.has(it)) items[w++] = it; items.length = w; }
    return items;
  },
  // Collapse (on) or expand heading k of the model; the caret inside the text that goes moves to
  // the heading's end, as Word puts it
  foldSet(k, on) {
    const h = this.model && this.model.headings[k];
    if (!h) return false;
    const F = this.foldState();
    F.list = F.list.filter((x) => !(x.f === h.f && x.s === h.s));
    if (on) {
      F.list.push(foldEntry(h));
      const c = this.caretNow(), r = this.sectionOf(k);
      if (c && !c.ghost && r && c.f === r.f && c.a > h.e && c.a <= r.e) this.restoreCaret({ f: h.f, p: Math.max(h.s, h.e - 1), bias: -1 });
    }
    this.foldShow(on ? null : k);
    return true;
  },
  // Collapse all headings: every one, so the page shows its top level alone; Expand all: none
  foldAll(on) {
    const F = this.foldState(), heads = (this.model && this.model.headings) || [];
    if (on) {
      F.list = heads.slice(0, FOLD_MAX).map(foldEntry);
      // (the caret to the heading of the top level its text is under)
      const c = this.caretNow(), lv = Math.min(...heads.map((h) => h.level));
      if (c && !c.ghost) { let best = null; for (const h of heads) if (h.level === lv && h.f === c.f && h.s <= c.a) best = h; if (best && c.a > best.e) this.restoreCaret({ f: best.f, p: Math.max(best.s, best.e - 1), bias: -1 }); }
    } else F.list = [];
    this.foldShow(null);
    return true;
  },
  // Show Level n: every heading of the n-th level from the top collapsed, and those under it
  // (deeper ones are hidden inside them); more levels than the document has shows everything
  foldLevel(n) {
    const heads = (this.model && this.model.headings) || [];
    const levels = [...new Set(heads.map((h) => h.level))].sort((a, b) => a - b);
    if (n > levels.length) return this.foldAll(false);
    const rank = levels[n - 1], F = this.foldState();
    F.list = heads.filter((h) => h.level >= rank).slice(0, FOLD_MAX).map(foldEntry);
    // (the caret, where its text is now hidden, to the heading that shows in its place: the
    // outermost collapsed heading it lies under)
    const c = this.caretNow();
    if (c && !c.ghost) {
      const chain = [];
      for (const h of heads) {
        if (h.f !== c.f || h.s > c.a) continue;
        while (chain.length && chain[chain.length - 1].level >= h.level) chain.pop();
        chain.push(h);
      }
      const top = chain.find((h) => h.level >= rank);
      if (top && c.a > top.e) this.restoreCaret({ f: top.f, p: Math.max(top.s, top.e - 1), bias: -1 });
    }
    this.foldShow(null);
    return true;
  },
  // the page laid out again without (or with) the text, the state kept, the controls told
  foldShow(k) {
    clearTimeout(this.foldT);
    this.relayout();
    this.foldSave();
    this.ribbonSync && this.ribbonSync();
    if (k != null) this.foldHover = null;
    this.foldPaint();
  },
  // The headings that hide the items pred chooses open, outermost first (one hiding another is
  // opened in turn), the page laid out again
  foldReveal(pred) {
    const F = this.fold;
    if (!F || !F.hidden.size) return false;
    const heads = this.model.headings || [], items = this.renderer.blocks.flatMap((B) => B.items), top = this.model.opts.chapters ? 0 : 1;
    let shut = new Set(F.shut), r = foldItems(items, heads, shut, top), any = false;
    for (let n = 0; n < 8; n++) {
      const it = items.find((x) => r.hidden.has(x) && pred(x));
      if (!it) break;
      shut.delete(r.by.get(it)); any = true;
      r = foldItems(items, heads, shut, top);
    }
    if (!any) return false;
    F.list = [...shut].sort((a, b) => a - b).map((k) => foldEntry(heads[k]));
    this.foldShow(null);
    return true;
  },
  // A place the caret is sent to (Go To, the Navigation pane, a comment, a change) that a collapsed
  // heading hides: the heading opens first, as Word's does
  foldOpenAt(f, p) {
    const F = this.fold;
    if (!F || !F.hidden.size || f == null || p == null) return false;
    const pred = (it) => it.block && it.block.f === f && it.block.s <= p && p <= it.block.e;
    // (a look at the hidden items first: a caret put back at every keystroke costs nothing more)
    for (const it of F.hidden) if (pred(it)) return this.foldReveal(pred);
    return false;
  },
  // The triangles: one beside each collapsed heading, and one beside the heading the pointer is
  // over (with a mouse) or the caret is in (on a touch screen), drawn over the page, never in it
  foldLayer() {
    let L = this.foldEl;
    if (!L || !L.isConnected) {
      L = document.createElement('div');
      L.className = 'fold-layer';
      L.setAttribute('aria-hidden', 'false');
      const sheet = $('#sheet');
      if (!sheet) return null;
      sheet.appendChild(L);
      this.foldEl = L;
      L.addEventListener('mousedown', (e) => e.preventDefault());
      L.addEventListener('click', (e) => {
        const b = e.target.closest('.fold-tg');
        if (!b) return;
        const k = +b.dataset.k;
        if (this.model && this.model.headings[k]) this.foldSet(k, b.getAttribute('aria-expanded') === 'true');
      });
    }
    return L;
  },
  foldPaint() {
    const F = this.fold, L = this.foldLayer();
    if (!L) return;
    const want = [];
    if (F && F.at) for (const [it, k] of F.at) if (F.shut.has(k) && it.el.isConnected) want.push({ el: it.el, k, shut: true });
    const hv = this.foldHover;
    if (hv && hv.el.isConnected && !(F && F.shut.has(hv.k)) && this.model && this.model.headings[hv.k]) want.push({ el: hv.el, k: hv.k, shut: false });
    const have = [...L.children];
    while (have.length > want.length) have.pop().remove();
    if (!want.length) return;
    const R = L.getBoundingClientRect(), D = this.desk.getBoundingClientRect(), coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches, size = coarse ? 44 : 20;
    want.forEach((w, i) => {
      let b = have[i];
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'fold-tg'; b.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 7.5l4 5 4-5z"/></svg>'; L.appendChild(b); }
      const h = this.model.headings[w.k], words = String(h.text || '').trim().slice(0, 60) || 'heading';
      b.dataset.k = String(w.k);
      b.setAttribute('aria-expanded', w.shut ? 'false' : 'true');
      b.setAttribute('aria-label', (w.shut ? 'Expand: ' : 'Collapse: ') + words);
      b.title = w.shut ? 'Expand: show the text under this heading (Alt+Shift++)' : 'Collapse: hide the text under this heading on the page (Alt+Shift+-)';
      b.classList.toggle('shut', w.shut);
      const r = w.el.getBoundingClientRect(), lh = parseFloat(getComputedStyle(w.el).lineHeight) || 20;
      let x = r.left - size - 2, y = r.top + Math.min(r.height, lh) / 2;
      // (where the margin is off the screen, as on a phone with the text as wide as the screen:
      // after the heading's last line, inside the window)
      if (x < D.left) {
        const rg = document.createRange();
        rg.selectNodeContents(w.el);
        const rs = rg.getClientRects(), last = rs[rs.length - 1];
        if (last) {
          x = Math.min(last.right + 4, D.right - size); y = (last.top + last.bottom) / 2;
          // (a heading of several lines: the button no higher than its last line, so it never
          // covers the words of the line above)
          let above = -Infinity;
          for (const q of rs) if (q.bottom <= last.top + 1) above = Math.max(above, q.bottom);
          if (y - size / 2 < above) y = above + size / 2;
        }
      }
      b.style.left = Math.round(x - R.left) + 'px';
      b.style.top = Math.round(y - R.top - size / 2) + 'px';
    });
  },
  // the heading item the pointer is over or the caret is in, as { el, k }
  foldHeadingOf(el) {
    const it = el && el.closest && el.closest('.it.h[data-ctx="h"]');
    if (!it || !this.root.contains(it) || !this.model) return null;
    const B = this.renderer.blocks.find((x) => String(x.id) === it.dataset.b);
    if (!B) return null;
    const k = (this.model.headings || []).findIndex((h) => h.f === B.f && h.s >= B.s && h.s <= B.e);
    return k >= 0 ? { el: it, k } : null;
  }
};

// the collapsed headings of every document, in the browser (localStorage)
const FOLD_KEY = 'rikuy.fold.v1';
const FOLD_MAX = 2000;
const EXTEND_SAY = 'Extend mode: the arrow keys extend the selection, F8 selects more. Escape ends it.';
// extend mode's keys: an arrow, Home or End moves the selection's end as Shift with it would
const EXTEND_KEYS = { ArrowLeft: ['backward', 'character', 'word'], ArrowRight: ['forward', 'character', 'word'], ArrowUp: ['backward', 'line', 'paragraphboundary'],
  ArrowDown: ['forward', 'line', 'paragraphboundary'], Home: ['backward', 'lineboundary', 'documentboundary'], End: ['forward', 'lineboundary', 'documentboundary'] };

// The sentence of text at x as the language's segmenter cuts it, but never after an abbreviation
// or an initial ("Dr. Smith", "e.g. one", "J. Smith"), which it takes for a sentence's end: [a, b]
const ABBR = /(?:^|[\s(])(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|cf|al|Fig|Figs|Eq|Eqs|No|Nos|Vol|Ch|Sec|pp?|ca|approx|resp|e\.g|i\.e|[A-Z])\.\s*$/;
export function sentenceAt(text, x, seg) {
  const out = [];
  for (const s of seg.segment(text)) {
    const e = s.index + s.segment.length, L = out[out.length - 1];
    if (L && ABBR.test(text.slice(L[0], L[1]))) L[1] = e; else out.push([s.index, e]);
  }
  return out.find(([a, b]) => a <= x && x < b) || out[out.length - 1] || null;
}

// Go Back's places: where the last n edits of the history (App.hist, each step's files a diff
// { f, s, del, ins }) left the caret, newest first, each moved through the edits made after it.
// A place within SPOT_NEAR characters of a newer one is that place (one word typed on is one
// place; two short paragraphs edited are two).
const SPOT_NEAR = 2;
export function editSpots(hist, n = 4) {
  const out = [];
  for (let i = (hist || []).length - 1; i >= 0 && out.length < n; i--) {
    const d = hist[i].files && hist[i].files[0];
    if (!d) continue;
    const f = d.f;
    let p = d.s + d.ins.length;
    for (let j = i + 1; j < hist.length; j++) {
      for (const x of hist[j].files || []) {
        if (x.f !== f) continue;
        if (p >= x.s + x.del.length) p += x.ins.length - x.del.length;
        else if (p > x.s) p = x.s + x.ins.length;
      }
    }
    if (!out.some((o) => o.f === f && Math.abs(o.p - p) < SPOT_NEAR)) out.push({ f, p });
  }
  return out;
}
const okEntry = (x) => !!x && typeof x === 'object' && typeof x.f === 'string' && Number.isInteger(x.s) && x.s >= 0 && Number.isInteger(x.lv) && typeof x.t === 'string';

// the triangles follow the pointer over the page's headings (with a mouse) and the caret (on a
// touch screen, where there is no pointer over anything), and the layout's every pass
onInstall((app) => {
  let t = 0;
  const set = (hv) => {
    const was = app.foldHover;
    if ((was && hv && was.el === hv.el && was.k === hv.k) || (!was && !hv)) return;
    app.foldHover = hv;
    cancelAnimationFrame(t); t = requestAnimationFrame(() => app.foldPaint());
  };
  app.root.addEventListener('mousemove', (e) => { if (e.buttons) return; const hv = app.foldHeadingOf(e.target); if (hv || !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.fold-layer'))) set(hv); }, { passive: true });
  app.root.addEventListener('mouseleave', (e) => { if (!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.fold-layer'))) set(null); });
  document.addEventListener('selectionchange', () => {
    if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;
    const s = getSelection(), n = s.rangeCount && app.root.contains(s.anchorNode) ? s.anchorNode : null;
    set(n ? app.foldHeadingOf(n.nodeType === 1 ? n : n.parentElement) : null);
  });
  // (a rebuild's caret: one put back under a collapsed heading opens it)
  const rb = app.rebuild;
  app.rebuild = function (caret) { this.foldCaret = caret; try { return rb.call(this, caret); } finally { this.foldCaret = null; } };
});

// (the kinds of text Format finds as Word's styles; Select text with similar formatting keeps to
// the formatting of the words themselves)
const KINDS = FMT.heading | FMT.list | FMT.table | FMT.theorem | FMT.quote | FMT.equation;
const SKIP_NOTE = {
  latex: 'That one is in a LaTeX paragraph, where the replacement\'s %, $, & or braces would be LaTeX: tick In LaTeX source to write it there as source.',
  para: 'That one runs across a paragraph\'s end with braces or a heading\'s command around it: replace it In LaTeX source, where ^p is a blank line.',
  break: 'A paragraph break (^p) cannot go there: a heading, a cell or a caption holds one paragraph, and a group or a formula would be cut.'
};

// a replacement's groups and Word's codes (src/find.js expand), on the hit's match
function expandRep(rep, h, o, groups) { return expand(rep, h.m || [h.text], groups ? o : {}); }

// commands of the registry as the items of a menu: their names, keys, and disabled where they
// cannot run at the caret
function regItems(app, ids) {
  const at = app.ribbonAt();
  if (at) at.memo = {};
  return ids.map((id) => {
    const c = command(id);
    return c && { name: c.name, title: c.title, keys: firstKey(c, isMacUA), disabled: !enabled(app, c, at), run: () => { app.ribbonBack(); app.runCommand(id); } };
  });
}
const SELECT = ['select-all', 'select-paragraph', 'select-sentence', 'select-similar'];
