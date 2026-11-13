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

import { register, command, enabled, onInstall } from '../commands.js';
import { compile, expand, hitsIn, hitsInSource, runsWith, blockText, charSrc, hitSource, joinRanges, labelsIn, PARA, FMT, FORMATS, MAX_HITS } from '../find.js';
import { headingAt, sectionRange, promoteEdits, swapEdit, moveEdits, newHeading, NAME } from '../outline.js';
import { absAtom, posFromDom } from '../editor.js';
import { $ } from '../ui/dom.js';
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
  { id: 'outline-panel', name: 'Outline and problems', el: 'b-nav', static: true, place: 'bar', title: 'Outline, problems and changes (Ctrl+Shift+O)', keysElsewhere: ['Ctrl+Shift+O'], synonyms: ['Outline', 'Problems', 'Side panel'],
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
    menuItems: () => [{ name: 'Find', keys: 'Ctrl+F', command: 'find' }, { name: 'Advanced Find', command: 'advanced-find' }, { name: 'Go To', keys: isMacUA ? 'Ctrl+Alt+G' : 'Ctrl+G', command: 'go-to' }] },
  { id: 'advanced-find', name: 'Advanced Find', title: 'The Find and Replace dialog: match case, whole words, wildcards, formatting, in the LaTeX source', synonyms: ['Find and Replace', 'Find dialog'], when: () => true, run: (app) => openFindDialog(app, 'find') },
  { id: 'replace', name: 'Replace', order: 20, fit: true, title: 'Replace text in the document (Ctrl+H)', synonyms: ['Find and Replace', 'Substitute', 'Replace all'], tab: 'home', group: 'editing', el: 'rb-replace', label: 'Replace',
    icon: '<path d="M4 7.5h9l-2.5-2.5M16 12.5H7l2.5 2.5"/>', keys: ['Ctrl+H'], mac: { 'Ctrl+H': 'Control+H' }, when: () => true, run: (app) => openFindDialog(app, 'replace') },
  { id: 'go-to', name: 'Go To', title: 'Go to a page, a heading, a footnote, an equation, a figure, a table, a comment or a label (Ctrl+G)', synonyms: ['Go to page', 'Jump to', 'Go to section', 'Go to label'],
    keys: ['Ctrl+G'], mac: { 'Ctrl+G': 'Ctrl+Alt+G' }, when: () => true, run: (app) => openFindDialog(app, 'goto') },
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
  { id: 'promote', name: 'Promote', title: 'Promote: the heading, and every heading under it, one level up (Alt+Shift+Left)', synonyms: ['Promote heading', 'Outline promote'], keys: ['Alt+Shift+ArrowLeft'], mac: { 'Alt+Shift+ArrowLeft': 'Control+Shift+ArrowLeft' },
    menu: { heading: 10 }, when: promoteOK(-1), whyNot: (app, at) => headAt(app, at) < 0 ? 'Put the caret in a heading first.' : 'It is the top level this document has.', run: (app, args, at) => app.promoteAt(headAt(app, at), -1) },
  { id: 'demote', name: 'Demote', title: 'Demote: the heading, and every heading under it, one level down (Alt+Shift+Right)', synonyms: ['Demote heading', 'Outline demote'], keys: ['Alt+Shift+ArrowRight'], mac: { 'Alt+Shift+ArrowRight': 'Control+Shift+ArrowRight' },
    menu: { heading: 20 }, when: promoteOK(1), whyNot: (app, at) => headAt(app, at) < 0 ? 'Put the caret in a heading first.' : 'A heading under it is at the lowest level, \\subparagraph.', run: (app, args, at) => app.promoteAt(headAt(app, at), 1) },
  { id: 'move-up', name: 'Move up', title: 'Move the paragraph above the one before it; on a heading, its whole section (Alt+Shift+Up)', synonyms: ['Move paragraph up', 'Move section up'], keys: ['Alt+Shift+ArrowUp'], mac: { 'Alt+Shift+ArrowUp': 'Control+Shift+ArrowUp' },
    when: moveOK(-1), whyNot: () => 'Nothing of the same kind stands before it here.', run: (app, args, at) => app.moveAt(at, -1) },
  { id: 'move-down', name: 'Move down', title: 'Move the paragraph below the one after it; on a heading, its whole section (Alt+Shift+Down)', synonyms: ['Move paragraph down', 'Move section down'], keys: ['Alt+Shift+ArrowDown'], mac: { 'Alt+Shift+ArrowDown': 'Control+Shift+ArrowDown' },
    when: moveOK(1), whyNot: () => 'Nothing of the same kind stands after it here.', run: (app, args, at) => app.moveAt(at, 1) },
  { id: 'heading-before', name: 'New heading before', title: 'A new heading of the same level before this one', menu: { heading: 40 }, when: (app, at) => headAt(app, at) >= 0, run: (app, args, at) => app.newHeadingAt(headAt(app, at), 'before') },
  { id: 'heading-after', name: 'New heading after', title: 'A new heading of the same level after this section', menu: { heading: 50 }, when: (app, at) => headAt(app, at) >= 0 && !!app.sectionOf(headAt(app, at)), run: (app, args, at) => app.newHeadingAt(headAt(app, at), 'after') },
  { id: 'subheading-new', name: 'New subheading', title: 'A new heading one level down, at the end of this section', menu: { heading: 55 }, when: (app, at) => { const k = headAt(app, at); return k >= 0 && app.model.headings[k].level < 5 && !!app.sectionOf(k); }, run: (app, args, at) => app.newHeadingAt(headAt(app, at), 'sub') },
  { id: 'heading-select', name: 'Select heading and content', title: 'The heading and everything under it, to its next heading of the same level', menu: { heading: 60 }, when: (app, at) => headAt(app, at) >= 0 && !!app.sectionOf(headAt(app, at)), run: (app, args, at) => app.selectSection(headAt(app, at)) }
);

// the status bar follows the caret and the scrolling: the page it is on, the words selected; a
// click on the page's number opens Go To, as in Word
onInstall((app) => {
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
  findRun() {
    const fs = this.findState();
    fs.hits = []; fs.msg = ''; fs.more = false; fs.stopped = false;
    if (!this.model || (!fs.q && !fs.o.fmt)) { this.findPaint(); this.findViews(); return; }
    let re = null;
    if (fs.q) {
      const c = compile(fs.q, fs.o);
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
        for (const x of r.hits) { const h = { f, s: x.i, e: x.j, m: x.m, parts: [[x.i, x.j]], src: true, text: x.m[0] }; if (inSel(h)) fs.hits.push(h); }
        if (r.more) fs.more = true;
        if (r.stopped || Date.now() - t0 > 1500) { fs.stopped = true; break; }
        if (fs.hits.length >= MAX_HITS) { fs.more = true; break; }
      }
    } else if (!fs.o.source) {
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
          if (inSel(h)) fs.hits.push(h);
        }
      });
    }
    if (fs.stopped) fs.msg = 'Stopped after 1.5 s: the pattern takes too long on this document.';
    else if (fs.more) fs.msg = 'More than ' + plural(MAX_HITS, 'result', 'results') + ': only the first are shown.';
    this.findPaint();
    this.findViews();
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
    const byFile = new Map();
    fs.hits.slice(0, 5000).forEach((h, k) => { if (k === fs.cur) return; if (!byFile.has(h.f)) byFile.set(h.f, []); byFile.get(h.f).push(...h.parts); });
    const all = [];
    for (const [f, rs] of byFile) all.push(...this.index.domRanges(f, joinRanges(rs)));
    HL.set('rk-find', new window.Highlight(...all));
    const cur = fs.hits[fs.cur];
    if (cur) HL.set('rk-find-cur', new window.Highlight(...this.index.domRanges(cur.f, joinRanges(cur.parts))));
    else HL.delete('rk-find-cur');
  },
  // after the pages were laid out again (an edit, a zoom): the search again, the shown hit kept
  findSoon() {
    clearTimeout(this.findT);
    // (the Navigation pane's headings follow every edit at once, not only with the problems)
    if (this.navOpen && this.navOpen('outline') && this.nv) { clearTimeout(this.navT); this.navT = setTimeout(() => { if (this.navOpen('outline') && this.navView === 'headings') this.paintHeadings(); }, 60); }
    if (!this.findActive()) return;
    this.findT = setTimeout(() => {
      const fs = this.fs, was = fs.hits[fs.cur];
      this.findRun();
      if (was) { const k = fs.hits.findIndex((h) => h.f === was.f && h.s >= was.s); fs.cur = k; this.findPaint(); this.findViews(); }
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
    this.findPaint();
    this.findShow(fs.hits[fs.cur]);
    this.findViews();
    return fs.hits[fs.cur];
  },
  findTo(k) {
    const fs = this.findState();
    if (!fs.hits[k]) return;
    fs.cur = k;
    this.findPaint();
    this.findShow(fs.hits[k]);
    this.findViews();
  },
  // the hit in view, about a third down the window
  findShow(h) {
    if (!h) return;
    const rs = this.index.domRanges(h.f, joinRanges(h.parts));
    const r = rs[0] && rs[0].getBoundingClientRect();
    if (r && (r.width || r.height)) {
      const D = this.desk.getBoundingClientRect();
      if (r.top < D.top + 40 || r.bottom > D.bottom - 40) this.desk.scrollTop += r.top - D.top - D.height / 3;
      this.findDialogAside(rs[0].getBoundingClientRect());
      const pane = $('#srcpane');
      if (h.src && document.body.classList.contains('src-on') && pane) this.reveal(h.f, h.s, false);
      return;
    }
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
    const a = h.parts[0][0], b = h.parts[h.parts.length - 1][1];
    this.restoreCaret({ f: h.f, selA: a, selB: b });
    if (!this.caretNow()) this.restoreCaret({ f: h.f, p: a, bias: 1 });
  },

  // ---- replacing ----------------------------------------------------------------------------
  // The edits that write rep in hit h's place: the first of its characters' ranges takes the
  // replacement, the others go; what lies between them (a closing brace, a comment) stays. The
  // text is escaped as typing escapes it, unless the search is in the LaTeX source.
  hitEdits(h, rep) {
    const fs = this.findState();
    const groups = fs.o.wildcards || fs.o.regex;
    let t = /[\\^$]/.test(rep) ? expandRep(rep, h, fs.o, groups) : rep;
    if (!h.src) t = t ? this.escapeAt(h.f, h.parts[0][0], t) : '';
    return h.parts.map(([s, e], k) => ({ f: h.f, s, e, t: k ? '' : t }));
  },
  // Replace: the hit shown, if it is still where it was; then the next one is shown
  replaceOne() {
    const fs = this.findState();
    if (!fs.on || fs.cur < 0) { this.findGo(1); return; }
    const h = fs.hits[fs.cur];
    if (!h) return;
    if (h.ro) { this.findGo(1); fs.note = 'That one is drawn by a macro and cannot be replaced here: "In LaTeX source" finds its definition.'; this.findViews(); return; }
    const edits = this.hitEdits(h, fs.rep);
    const at = { f: h.f, p: h.parts[0][0] + edits[0].t.length };
    this.closeGroup();
    this.commit(edits, null, 'replace');
    this.closeGroup();
    this.findRun();
    const k = fs.hits.findIndex((x) => { const xk = this.findKey(x), ak = [this.blockIndexOf(at.f, at.p), at.p]; return x.f === at.f ? x.s >= at.p : xk[0] > ak[0]; });
    fs.cur = -1;
    if (k >= 0) { fs.cur = k; this.findPaint(); this.findShow(fs.hits[k]); }
    else this.findPaint();
    fs.note = k >= 0 ? '' : 'Replaced.';
    this.findViews();
  },
  // Replace All: every hit at once, one commit, so one undo takes it all back
  replaceAll() {
    const fs = this.findState();
    if (!fs.on) this.findRun();
    const ok = fs.hits.filter((h) => !h.ro), ro = fs.hits.length - ok.length;
    if (!ok.length) { fs.note = fs.hits.length ? 'None of these can be replaced here: a macro draws them.' : ''; this.findViews(); return 0; }
    const edits = [];
    for (const h of ok) edits.push(...this.hitEdits(h, fs.rep));
    const c = this.caretNow();
    this.closeGroup();
    this.commit(edits, c && c.f != null ? { f: c.f, p: c.a } : null, 'replace-all');
    this.closeGroup();
    const n = ok.length;
    this.findRun();
    fs.cur = -1;
    fs.note = 'Replaced ' + plural(n, 'place', 'places') + (ro ? '; ' + plural(ro, 'other is', 'others are') + ' drawn by a macro and stayed.' : '.');
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
      for (const span of this.root.querySelectorAll('span.t')) {
        if (!r.intersectsNode(span) || span.classList.contains('ph')) continue;
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
  selectPara(at, sentence) {
    const P = this.paraAt(at);
    if (!P) return;
    let a = P.a, b = P.b;
    if (sentence) {
      const text = P.T.text.slice(P.a, P.b), x = P.x - P.a;
      let seg = null;
      try { seg = new Intl.Segmenter(this.model.opts.lang || 'en', { granularity: 'sentence' }); } catch (e) { seg = null; }
      if (seg) { const s = seg.segment(text).containing(Math.min(x, text.length - 1)); if (s) { a = P.a + s.index; b = a + s.segment.length; } }
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
    return P ? P.T.fmt[P.x] & ~FMT.latex : 0;
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
    if (B.items.length !== 1 && !(B.items.every((it) => it.el.dataset.ctx === 'p'))) return null;
    const bs = this.renderer.blocks, i = bs.indexOf(B), o = bs[i + dir];
    if (i < 0 || !o || o.f !== B.f) return null;
    // a heading beside it moves alone (the paragraph goes into the section before)
    const e = dir < 0 ? swapEdit(src, B.f, { s: o.s, e: o.e }, { s: B.s, e: B.e }) : swapEdit(src, B.f, { s: B.s, e: B.e }, { s: o.s, e: o.e });
    return e && { edit: e, me: { s: B.s, e: B.e } };
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
    // the piece that moved and where it now starts
    const text = e.t, me = src.slice(Math.max(e.s, r.me.s), r.me.e).trim();
    const at = dir < 0 ? e.s : e.s + text.lastIndexOf(me);
    const off = c && c.f === e.f ? Math.max(0, c.a - Math.max(e.s, r.me.s) - (src.slice(Math.max(e.s, r.me.s)).length - src.slice(Math.max(e.s, r.me.s)).trimStart().length)) : 0;
    this.closeGroup();
    this.commit([e], { f: e.f, p: (dir < 0 ? e.s : at) + off, bias: 1 }, 'outline');
    this.closeGroup();
  },
  // A section dragged in the Navigation pane to before heading t (or to the end, t = -1)
  moveSectionTo(k, t) {
    const H = this.headsList(), h = H[k];
    if (!h) return false;
    const r = this.sectionOf(k);
    if (!r) { this.toast('This section has text in more than one file: move it in the source.'); return false; }
    let to;
    if (t < 0) to = this.bodyEnd(h.f);
    else { if (!H[t] || H[t].f !== h.f) { this.toast('Sections move within their file.'); return false; } to = H[t].s; }
    const edits = moveEdits(this.src(h.f), h.f, r.s, r.e, to);
    if (!edits) return false;
    this.closeGroup();
    this.commit(edits, null, 'outline');
    this.closeGroup();
    return true;
  },
  // a block (a paragraph, a list, a formula) dragged in the Outline view to before position t
  moveBlockTo(B, f, t) {
    if (B.f !== f) return false;
    const edits = moveEdits(this.src(f), f, B.s, B.e, t);
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
    if (where === 'before') n = newHeading(name, 'before', h.s);
    else { const r = this.sectionOf(k); if (!r) return; n = newHeading(name, 'after', r.e); }
    this.closeGroup();
    this.commit([{ f: h.f, s: n.s, e: n.s, t: n.t }], { f: h.f, p: n.caret, bias: -1 }, 'outline');
    this.closeGroup();
  },
  selectSection(k) {
    const r = this.sectionOf(k);
    if (!r) return;
    this.restoreCaret({ f: r.f, selA: r.s, selB: r.e });
  }
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
    return c && { name: c.name, title: c.title, keys: (c.keys || c.keysElsewhere || [])[0], disabled: !enabled(app, c, at), run: () => { app.ribbonBack(); app.runCommand(id); } };
  });
}
const SELECT = ['select-all', 'select-paragraph', 'select-sentence', 'select-similar'];
