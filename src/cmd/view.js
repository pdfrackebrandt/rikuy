// Batch B12, View: the PDF preview, the source pane and the zoom in the bar; the three views of the
// status bar (Page, LaTeX, PDF: one at a time, at the same place); Show LaTeX, which turns one
// block of the page into its source where it stands and back; and the View tab: Read Mode, Print
// Layout, LaTeX Mode, Draft, Show LaTeX, Show marks, One page, Multiple pages, Side to Side, Dark
// page, Focus. Nothing here writes to the source but what is typed into a block shown as LaTeX.

import { register, onInstall } from '../commands.js';
import { $, PREFS, store } from '../ui/dom.js';
import { openMenu } from '../ui/kit.js';
import { buildModel } from '../model.js';
import { groupOf } from '../ribbon/order.js';

const always = () => true;
const cls = () => document.body.classList;
const PX_PER_PT = 96 / 72.27;
const ICON = {
  read: '<path d="M2.5 4.5q3.5-1 7.5 1 4-2 7.5-1v11q-3.5-1-7.5 1-4-2-7.5-1zM10 5.5v11"/>',
  print: '<path d="M5.5 2.5h9v15h-9zM8 6h4M8 9h4M8 12h3"/>',
  latex: '<path d="m7 6-4 4 4 4m6-8 4 4-4 4"/>',
  draft: '<path d="M4 4h12M4 7.5h12M4 11h12M4 14.5h7"/><path d="M2 9.25h16" stroke-dasharray="1.5 1.5"/>',
  showtex: '<path d="M3 4.5h6v11H3zM11 4.5h6v11h-6zM4.5 8h3M4.5 11h3M13 8l1.5 1.5L13 11"/>',
  marks: '<path d="M12.5 3.5v13M15.5 3.5v13M15.5 3.5h-6a3.5 3.5 0 0 0 0 7h3"/>',
  one: '<path d="M6.5 3h7v14h-7z"/>',
  many: '<path d="M2.5 4h6.5v12H2.5zM11 4h6.5v12H11z"/>',
  side: '<path d="M2.5 5h6v10h-6zM11.5 5h6v10h-6zM9.5 10h1M13 2.5l1.5 1.5L13 5.5"/>',
  dark: '<path d="M14.5 12.5A6 6 0 0 1 7.5 5.5a6 6 0 1 0 7 7z"/>',
  focus: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'
};

// the views a person switches between, each across the window
const VIEWS = ['page', 'latex', 'pdf'];
const viewIs = (v) => (app) => (app.view || 'page') === v;

register(
  { id: 'preview', name: 'Preview', el: 'b-pdf', static: true, place: 'bar', title: 'Show the PDF as TeX makes it, beside the page', synonyms: ['PDF', 'Compile'], when: always, run: (app) => app.togglePdf() },
  { id: 'source', name: 'Source', el: 'b-src', static: true, place: 'bar', title: 'Show the source beside the page (Ctrl+\\)', keysElsewhere: ['Ctrl+\\'], synonyms: ['LaTeX source', 'Code'], when: always, run: (app) => app.toggleSource() },
  { id: 'zoom-out', name: 'Zoom out', el: 'b-zout', static: true, place: 'bar', only: 'wide', keysElsewhere: ['Ctrl+-'], when: always, run: (app) => app.setZoom(-1) },
  { id: 'zoom-fit', name: 'Fit width', el: 'zoomv', static: true, place: 'bar', synonyms: ['Zoom'], when: always, run: (app) => app.setZoom(0) },
  { id: 'zoom-in', name: 'Zoom in', el: 'b-zin', static: true, place: 'bar', only: 'wide', keysElsewhere: ['Ctrl+='], when: always, run: (app) => app.setZoom(+1) },

  // ---- the status bar: Page · LaTeX · PDF, and the zoom slider (Word's view buttons and slider)
  { id: 'view-page', name: 'Page view', el: 'sv-page', static: true, place: 'status', kind: 'toggle', title: 'Page: the typeset page you type on, at the same place', synonyms: ['Print Layout', 'Typeset page', 'Editing view'],
    when: always, on: viewIs('page'), run: (app) => app.setView('page'), sync: (app) => app.viewSync() },
  { id: 'view-latex', name: 'LaTeX view', el: 'sv-latex', static: true, place: 'status', kind: 'toggle', title: 'LaTeX: the source across the window, the caret at the same place', synonyms: ['Source view', 'Code view', 'LaTeX Mode'],
    when: always, on: viewIs('latex'), run: (app) => app.setView('latex') },
  { id: 'view-pdf', name: 'PDF view', el: 'sv-pdf', static: true, place: 'status', kind: 'toggle', title: 'PDF: TeX\'s PDF across the window, at the same place', synonyms: ['Read Mode', 'Reading view', 'PDF preview'],
    when: always, on: viewIs('pdf'), run: (app) => app.setView('pdf') },
  { id: 'zoom-slider', name: 'Zoom', el: 'st-zoom', role: 'slider', static: true, place: 'status', only: 'wide', title: 'Zoom: drag, or Ctrl and + or -', synonyms: ['Zoom slider', 'Magnification'],
    when: always, run: (app, args) => app.zoomTo((+args || 100) / 100, null) },
  { id: 'zoom-level', name: 'Zoom level', el: 'st-zoomv', static: true, place: 'status', only: 'wide', title: 'The zoom; a press shows the page at its actual size (Ctrl+0)', when: always, run: (app) => app.zoomTo(1, null) },

  // ---- View ▸ Views
  { id: 'read-mode', name: 'Read Mode', order: 10, title: 'Read Mode: TeX\'s PDF across the window, to read (the status bar\'s PDF)', synonyms: ['Reading view', 'PDF view', 'Full screen reading'],
    tab: 'view', group: 'views', el: 'rw-read', label: 'Read Mode', kind: 'toggle', icon: ICON.read, when: always, on: viewIs('pdf'), run: (app) => app.setView(app.view === 'pdf' ? 'page' : 'pdf') },
  { id: 'print-layout', name: 'Print Layout', order: 20, title: 'Print Layout: the typeset page you type on (the status bar\'s Page)', synonyms: ['Page view', 'Normal view'],
    tab: 'view', group: 'views', el: 'rw-print', label: 'Print Layout', kind: 'toggle', icon: ICON.print, when: always, on: (app) => viewIs('page')(app) && !app.draftOn(), run: (app) => { app.setDraft(false); app.setView('page'); } },
  { id: 'latex-mode', name: 'LaTeX Mode', order: 25, title: 'LaTeX Mode: the source across the window, the caret at the same place (the status bar\'s LaTeX)', synonyms: ['LaTeX view', 'Source view', 'Code'],
    tab: 'view', group: 'views', el: 'rw-latex', label: 'LaTeX Mode', kind: 'toggle', icon: ICON.latex, when: always, on: viewIs('latex'), run: (app) => app.setView(app.view === 'latex' ? 'page' : 'latex') },
  { id: 'draft', name: 'Draft', order: 30, title: 'Draft: the pages run on, one under the other, a dotted line where TeX turns the page', synonyms: ['Web Layout', 'Continuous', 'Draft view', 'No page breaks'],
    tab: 'view', group: 'views', el: 'rw-draft', label: 'Draft', kind: 'toggle', icon: ICON.draft, when: always, on: (app) => app.draftOn(), run: (app) => { app.setView('page'); app.setDraft(!app.draftOn()); } },

  // ---- Show LaTeX: a block of the page as its source, where it stands (Word's equation Linear)
  { id: 'show-latex', name: 'Show LaTeX', title: 'Show this paragraph or equation as its LaTeX, where it stands, to edit; again or Esc shows it typeset (Shift+F9; Ctrl+Shift+= in an equation)', synonyms: ['Linear', 'Professional', 'Toggle field codes', 'Edit LaTeX', 'Show source here', 'Raw LaTeX'],
    // (View > Show always; the Equation tab's Conversions group, Word's place for Linear, once
    // that group is declared: B13 declares it in src/ribbon/order.js)
    tab: 'view', group: 'show', el: 'rw-showtex', order: 10, label: 'Show LaTeX', kind: 'toggle', icon: ICON.showtex, keys: ['Shift+F9'], keyScope: 'page',
    also: groupOf('equation', 'conversions') ? [{ tab: 'equation', group: 'conversions', el: 're-latex' }] : [],
    menu: { text: 90, selection: 90, table: 90, list: 90, heading: 90 },
    when: (app, at) => app.showLatexBlocks(at).length > 0, whyNot: () => 'Put the caret in a paragraph or an equation of the page first.',
    on: (app, at) => { const bs = app.showLatexBlocks(at); return bs.length > 0 && bs.every((B) => B.tex && B.tex.view); },
    run: (app, args, at) => app.showLatex(at) },
  { id: 'show-marks', name: 'Show marks', order: 20, title: 'Show what TeX reads but does not print: paragraph ends, line breaks, spaces set by hand (Ctrl+Shift+8)', synonyms: ['Show/Hide', 'Pilcrow', 'Formatting marks', 'Paragraph marks', 'Show formatting'],
    tab: 'view', group: 'show', el: 'rw-marks', label: 'Show marks', kind: 'toggle', icon: ICON.marks, keys: ['Ctrl+Shift+8'], keyScope: 'app',
    when: always, on: () => cls().contains('show-marks'), run: (app) => app.setMarksShown(!cls().contains('show-marks')) },

  // ---- View ▸ Zoom
  { id: 'zoom-100', name: '100%', order: 10, title: 'The page at its actual size (Ctrl+0)', synonyms: ['Actual size', 'Zoom 100'], tab: 'view', group: 'zoom', el: 'rw-100', label: '100%', keysElsewhere: ['Ctrl+0'],
    icon: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5"/>', when: always, run: (app) => { app.setPagesAcross(0); app.zoomTo(1, null); } },
  { id: 'one-page', name: 'One page', order: 20, title: 'A whole page in the window', synonyms: ['Whole page', 'Fit page', 'Zoom one page'], tab: 'view', group: 'zoom', el: 'rw-one', label: 'One page', icon: ICON.one,
    when: (app) => !!app.model, run: (app) => app.zoomPages(1) },
  { id: 'multiple-pages', name: 'Multiple pages', order: 30, title: 'Pages side by side, as many as the window holds at a readable size', synonyms: ['Two pages', 'Many pages', 'Zoom multiple pages'], tab: 'view', group: 'zoom', el: 'rw-many', label: 'Multiple pages', icon: ICON.many,
    when: (app) => !!app.model, run: (app) => app.zoomPages(2) },
  { id: 'page-width', name: 'Page width', order: 40, title: 'The page as wide as the window', synonyms: ['Fit width'], tab: 'view', group: 'zoom', el: 'rw-width', label: 'Page width',
    icon: '<path d="M3.5 4.5h13v11h-13zM6 10h8M6 10l2-2M6 10l2 2M14 10l-2-2M14 10l-2 2"/>', when: always, run: (app) => app.zoomPageWidth() },

  // ---- View ▸ Page (Word's Page Movement, Immersive and the page's colour)
  { id: 'side-to-side', name: 'Side to Side', order: 10, title: 'The pages one beside the other, turned like a book\'s; off: one under the other', synonyms: ['Page movement', 'Horizontal', 'Vertical', 'Book view'],
    tab: 'view', group: 'page', el: 'rw-side', label: 'Side to Side', kind: 'toggle', icon: ICON.side, when: always, on: () => cls().contains('pg-side'), run: (app) => app.setPagesAcross(cls().contains('pg-side') ? 0 : 'side') },
  { id: 'dark-page', name: 'Dark page', order: 20, title: 'The page dark, its text light, for the screen only: the PDF and the files stay as they are', synonyms: ['Dark mode', 'Switch modes', 'Night', 'Page color'],
    tab: 'view', group: 'page', el: 'rw-dark', label: 'Dark page', kind: 'toggle', icon: ICON.dark, when: always, on: () => cls().contains('dark-page'), run: (app) => app.setDarkPage(!cls().contains('dark-page')) },
  { id: 'focus', name: 'Focus', order: 30, title: 'Focus: the page alone, every bar hidden; Esc brings them back', synonyms: ['Focus mode', 'Distraction free', 'Full screen', 'Zen'],
    tab: 'view', group: 'page', el: 'rw-focus', label: 'Focus', kind: 'toggle', icon: ICON.focus, when: always, on: () => cls().contains('focus'), run: (app) => app.setFocus(!cls().contains('focus')) },

  // ---- Repeat (Word's F4, and Ctrl+Y with nothing to redo)
  { id: 'repeat', name: 'Repeat', title: 'Do the last command again where the caret is now (F4, or Ctrl+Y with nothing to redo)', synonyms: ['Redo', 'Repeat last action', 'Again'], keys: ['F4'],
    when: (app) => !!app.lastAct, whyNot: () => 'Nothing to repeat yet: a command such as Bold or a style, then F4 does it again here.', run: (app) => app.repeatLast() },
  // ---- Undo's list (Word's Undo arrow)
  { id: 'undo-options', name: 'Undo options', el: 'b-undo-x', static: true, place: 'bar', only: 'wide', title: 'The last steps: undo several at once', synonyms: ['Undo history', 'Undo list', 'History'],
    when: (app) => app.hist && app.hist.length > 0, whyNot: () => 'Nothing to undo yet.', run: (app) => app.undoMenu() }
);

// What a step of the history was, for Undo's list (the kinds App.commit is given)
const KIND = { type: 'Typing', del: 'Delete', enter: 'New paragraph', paste: 'Paste', block: 'Paragraph', restore: 'Restore', reject: 'Reject', merge: 'Merge', 'del-atom': 'Delete',
  'page-border': 'Page border', style: 'Style', api: 'Script', 'other-tab': 'Another tab', move: 'Move', table: 'Table' };
const kindName = (k) => KIND[k] || (k ? String(k).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()).slice(0, 40) : 'Edit');

// commands that only show or move, never write: Repeat skips them
const NOT_REPEATED = /^(view-|zoom|read-mode|print-layout|latex-mode|draft|show-|one-page|multiple-pages|page-width|side-to-side|dark-page|focus|repeat|undo|preview|source|find|replace|go-to|select|navigation|outline|help|open|share|download|print|new-|load-sample|recent|properties|export|check-|set-default)/;

export const methods = {
  // the whole sheet as wide as the window, every press the same (the bar's Fit cycles on a phone)
  zoomPageWidth() {
    this.setPagesAcross(0);
    this.prefs.zoom = 'fit';
    if (window.innerWidth <= 520) this.prefs.phone = 'sheet';
    this.savePrefs();
    if (this.computePx()) this.relayout(true);
    this.zoomShow();
  },

  // ---- the three views ------------------------------------------------------------------------
  // Page, LaTeX or PDF across the window, one at a time. The place goes along: the caret's source
  // position into the LaTeX, SyncTeX into the PDF and back. Preview and Source in the bar stay what
  // they were, the PDF or the source beside the page: pressed in another view they go back to the
  // page first (App.toggleSource and togglePdf ask leaveView). A PDF that is current shows at once;
  // one that is not shows while TeX makes the new one, the pane saying so.
  async setView(v) {
    if (!VIEWS.includes(v)) return false;
    const was = this.view || 'page';
    if (v === was) { this.viewSync(); return true; }
    const spot = await this.viewSpotNow(was);
    this.viewBusy = true;
    const keep = { source: this.prefs.source, pdf: this.prefs.pdf };
    try {
      if (was === 'page') {
        this.viewPanes = { src: cls().contains('src-on'), pdf: cls().contains('pdf-on'), keep };
        this.desk.style.setProperty('--desk-w', this.desk.clientWidth + 'px');
      }
      cls().remove('view-latex', 'view-pdf');
      this.view = v;
      if (v === 'page') {
        const P = this.viewPanes || { src: false, pdf: false, keep };
        if (cls().contains('src-on') !== P.src) await this.toggleSource(P.src);
        if (cls().contains('pdf-on') !== P.pdf) this.togglePdf(P.pdf, true);
        Object.assign(keep, P.keep);
        if (this.computePx()) this.relayout(true);
        if (spot) this.viewPlaceOnPage(spot);
      } else if (v === 'latex') {
        cls().add('view-latex');
        if (cls().contains('pdf-on')) this.togglePdf(false);
        await this.toggleSource(true);
        await this.ensureCM();
        if (spot) this.viewPlaceInSource(spot);
      } else {
        cls().add('view-pdf');
        this.viewPdfSpot = null;
        if (cls().contains('src-on')) await this.toggleSource(false);
        const fresh = !!this.lastPdf && this.lastPdfSig === this.textSigNow();
        this.togglePdf(true, fresh);
        if (!fresh) this.pdfSay('Updating the PDF…');
        if (spot) this.viewPlaceInPdf(spot);
      }
    } finally {
      this.viewBusy = false;
      // (a view is for now: the panes a reload opens with stay those chosen beside the page)
      Object.assign(this.prefs, keep);
      store(PREFS, this.prefs);
    }
    this.viewSync();
    this.ribbonSync();
    return true;
  },

  // Preview or Source pressed in the LaTeX or PDF view: back to the page, their panes as they were
  leaveView() {
    if (!this.view || this.view === 'page' || this.viewBusy) return false;
    this.viewBusy = true;
    cls().remove('view-latex', 'view-pdf');
    this.view = 'page';
    const P = this.viewPanes;
    if (P) Object.assign(this.prefs, P.keep);
    this.viewBusy = false;
    this.viewSync();
    return true;
  },

  viewSync() {
    const v = this.view || 'page';
    for (const k of VIEWS) { const b = $('#sv-' + k); if (b) b.setAttribute('aria-pressed', k === v ? 'true' : 'false'); }
    this.zoomShow();
  },

  // Where the reader is in a view: { f, p } (a source position) or { f, line }
  async viewSpotNow(v) {
    if (v === 'latex' && this.cm) {
      const doc = this.cm.getDoc();
      return { f: this.srcFile || this.main, p: doc.indexFromPos(doc.getCursor()) };
    }
    if (v === 'pdf') return this.viewPdfSpot || await this.pdfSpotAtView();
    const c = this.caretNow();
    if (c && !c.ghost && c.f != null) return { f: c.f, p: c.a };
    if (c && c.ghost) return { f: c.f, p: c.p };
    // no caret on the page: the paragraph at the top third of the window
    const D = this.desk.getBoundingClientRect(), y = D.top + D.height / 3;
    for (const B of this.renderer.blocks) {
      const el = B.items[0] && B.items[0].el;
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom >= y) return { f: B.f, p: B.s };
    }
    return null;
  },

  viewPlaceOnPage(spot) {
    const f = spot.f, p = spot.p != null ? spot.p : this.lineStartAt(f, spot.line);
    if (!this.files.has(f)) return;
    requestAnimationFrame(() => {
      this.restoreCaret({ f, p, bias: 1 }, true);
      this.goTo(f, p);
    });
  },

  viewPlaceInSource(spot) {
    const f = spot.f, p = spot.p != null ? spot.p : this.lineStartAt(f, spot.line);
    if (!this.files.has(f) || !this.cm) return;
    if ((this.srcFile || this.main) !== f) this.showSrcFile(f);
    const doc = this.cm.getDoc(), pos = doc.posFromIndex(p);
    this.cm.refresh();
    doc.setCursor(pos);
    this.cm.scrollIntoView({ line: pos.line, ch: pos.ch }, Math.round(this.cm.getScrollInfo().clientHeight / 3));
    this.cm.focus();
  },

  // The PDF at the spot: now when it is current, else once TeX has made the new one
  async viewPlaceInPdf(spot) {
    const f = spot.f, line = spot.line != null ? spot.line : this.lineOfPos(f, spot.p);
    for (let i = 0; i < 1200 && (this.compiling || !this.pdfView || !this.pdfView.pages.length); i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (this.view !== 'pdf') return;
    }
    if (this.pdfView) this.pdfView.reveal(this.texPath(f), line);
  },

  // The source line at the top third of the PDF's window, by SyncTeX (null where it has none)
  async pdfSpotAtView() {
    const V = this.pdfView;
    if (!V || !V.pages.length) return null;
    const sync = await V.whenSync();
    if (!sync) return null;
    const H = V.host.getBoundingClientRect(), y = H.top + Math.min(H.height / 3, 160);
    for (const [i, p] of V.pages.entries()) {
      const r = p.box.getBoundingClientRect();
      if (r.bottom < y) continue;
      const k = p.h1 / r.height;
      // (a blank line there says nothing: the next lines down until one holds text)
      for (let d = 0; d < 240; d += 12) {
        const yy = Math.max(0, (y - r.top) * k) + d;
        if (yy > p.h1) break;
        for (const x of [0.3, 0.5, 0.15]) {
          const hit = sync.at(i + 1, p.w1 * x, yy);
          const f = hit && this.fromTexPath(hit.file);
          if (f) return { f, line: hit.line };
        }
      }
      return null;
    }
    return null;
  },

  // a click on the PDF in the PDF view: the place to go back to (App.fromPdf asks)
  viewPdfClick(f, line) {
    if (this.view !== 'pdf') return false;
    this.viewPdfSpot = { f, line };
    return true;
  },

  lineStartAt(f, line) { const s = this.src(f); let p = 0; for (let n = 1; n < line; n++) { const i = s.indexOf('\n', p); if (i < 0) return s.length; p = i + 1; } return p; },
  lineOfPos(f, p) { const s = this.src(f); let n = 1; for (let i = 0; i < p && i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; },

  // ---- Show LaTeX ---------------------------------------------------------------------------
  // The blocks the command acts on: the one the caret is in (the open equation's), or each one the
  // selection touches (at most 40). A LaTeX paragraph of the document's own (`% rikuy: latex`,
  // src/styles.js) is its source already: none of it.
  showLatexBlocks(at) {
    if (!this.renderer || !this.model) return [];
    let f, a, b;
    if (this.pop && this.pop.el && this.pop.el.classList.contains('pop-math') && this.pop.anchorPos) ({ f, s: a } = this.pop.anchorPos), b = a;
    else if (at && at.c && !at.c.ghost && at.c.f != null) { f = at.c.f; a = at.c.a; b = at.c.b; }
    else return [];
    const out = [];
    for (const B of this.renderer.blocks) {
      if (B.f !== f || B.e < a || B.s > b || (B.tex && !B.tex.view) || !(B.e > B.s)) continue;
      if (B.items.some((x) => x.el && x.el.classList && x.el.classList.contains('pagebreak'))) continue;
      out.push(B);
      if (out.length >= 40) break;
    }
    // the caret alone: the innermost block that holds it
    if (a === b && out.length > 1) { out.sort((x, y) => (x.e - x.s) - (y.e - y.s)); out.length = 1; }
    return out;
  },

  // Turns the blocks into their LaTeX, or back; writes nothing
  showLatex(at) {
    const bs = this.showLatexBlocks(at);
    if (!bs.length) return false;
    const off = bs.every((B) => B.tex && B.tex.view);
    if (this.pop) this.closePop(true);
    const keys = this.texViews || (this.texViews = new Map());
    const c = at && at.c && !at.c.ghost ? { f: at.c.f, p: at.c.a, bias: 1 } : { f: bs[0].f, p: bs[0].s, bias: 1 };
    for (const B of bs) {
      const k = B.f + '\u0000' + B.s;
      if (off) keys.delete(k); else keys.set(k, { f: B.f, s: B.s });
    }
    this.texViewText = new Map([...this.files].filter(([n]) => [...keys.values()].some((v) => v.f === n)));
    this.texViewDoc = this.name + '\u0000' + this.main;
    this.forceRender = true;
    this.rebuild(c);
    if (!off) this.toast('Shown as LaTeX here: type in it; Esc or Show LaTeX again shows it typeset. The source changes only as you type.', 6000);
    return true;
  },

  // The keys of the blocks shown as LaTeX for the model (App.rebuild asks before each build), moved
  // along with every change of the text since the last build: typing, undo, the source pane
  viewKeys() {
    const keys = this.texViews;
    if (!keys || !keys.size) return null;
    // (another document opened: none of its blocks is shown as LaTeX)
    if (this.texViewDoc !== this.name + '\u0000' + this.main) { keys.clear(); return null; }
    const was = this.texViewText || new Map();
    for (const [k, v] of [...keys]) {
      const a = was.get(v.f), b = this.files.get(v.f);
      if (b == null) { keys.delete(k); continue; }
      if (a == null || a === b) continue;
      // the one changed stretch: [i, a.length - j) became [i, b.length - j)
      let i = 0;
      const n = Math.min(a.length, b.length);
      while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
      let j = 0;
      while (j < n - i && a.charCodeAt(a.length - 1 - j) === b.charCodeAt(b.length - 1 - j)) j++;
      let s = v.s;
      const ae = a.length - j, ins = b.slice(i, b.length - j);
      // (text typed at the block's very start joins it; a paragraph written before it does not)
      if (s > ae || (s === ae && !(i === ae && s === i && !/\n[ \t]*\n/.test(ins)))) s += b.length - a.length;
      else if (s > i) s = i;
      keys.delete(k);
      if (s >= 0 && s < b.length) keys.set(v.f + '\u0000' + s, { f: v.f, s });
    }
    this.texViewText = new Map([...this.files].filter(([n]) => [...keys.values()].some((v) => v.f === n)));
    return keys.size ? new Set(keys.keys()) : null;
  },

  // the model as TeX reads the text, without the blocks shown as LaTeX (Word's export, Export as)
  plainModel() {
    if (!this.texViews || !this.texViews.size) return this.model;
    const m = buildModel({ files: this.files, main: this.main }, this.model);
    m.main = this.main;
    return m;
  },

  // every block shown as LaTeX typeset again (another document opened, Esc in one)
  hideLatexViews(only) {
    if (!this.texViews || !this.texViews.size) return false;
    if (only) this.texViews.delete(only); else this.texViews.clear();
    this.forceRender = true;
    const c = this.caretNow();
    this.rebuild(c && !c.ghost ? { f: c.f, p: c.a, bias: 1 } : null);
    return true;
  },

  // ---- Draft, marks, pages across, dark page, focus -----------------------------------------
  draftOn() { return cls().contains('pg-draft'); },
  setDraft(on) {
    if (on) this.setPagesAcross(0);
    cls().toggle('pg-draft', !!on);
    this.prefs.draft = !!on; this.savePrefs();
    this.ribbonSync();
  },
  setMarksShown(on) {
    cls().toggle('show-marks', !!on);
    this.prefs.showMarks = !!on; this.savePrefs();
    this.ribbonSync();
  },
  setDarkPage(on) {
    cls().toggle('dark-page', !!on);
    this.prefs.darkPage = !!on; this.savePrefs();
    this.ribbonSync();
  },
  // 0: one under the other; 'side': in a row, turned side to side; 'grid': as many across as fit
  setPagesAcross(how) {
    cls().toggle('pg-side', how === 'side');
    cls().toggle('pg-grid', how === 'grid');
    if (how) cls().remove('pg-draft');
    this.prefs.pages = how || 0; this.savePrefs();
    this.ribbonSync();
  },
  // One page: a whole sheet in the window's height; Multiple pages: two (or more) across
  zoomPages(n) {
    const g = this.layout && this.layout.g;
    if (!g) return false;
    const D = this.desk, padY = window.innerWidth <= 520 ? 50 : 88, padX = 56;
    const byH = (D.clientHeight - padY) / (g.ph * PX_PER_PT);
    const across = Math.max(1, n);
    const byW = (D.clientWidth - padX - (across - 1) * 22) / (across * g.pw * PX_PER_PT);
    this.setPagesAcross(n > 1 ? 'grid' : 0);
    this.zoomTo(Math.max(0.25, Math.min(byH, byW)), null);
    const first = this.root.querySelector('.page');
    if (first && n > 1) this.desk.scrollTop = 0;
    this.zoomShow();
    return true;
  },
  setFocus(on) {
    cls().toggle('focus', !!on);
    const x = $('#focus-x');
    if (x) x.hidden = !on;
    if (this.computePx()) this.relayout(true);
    if (on) this.toast('Focus: the page alone. Esc, or Leave Focus at the top, brings the bars back.', 4000);
    this.ribbonSync();
    if (!on) this.ribbonBack();
  },

  // the status bar's slider and percent, as the zoom is now
  zoomShow() {
    const s = $('#st-zoom'), v = $('#st-zoomv');
    if (!s || !this.px) return;
    const pct = Math.round(this.px / PX_PER_PT * 100);
    if (document.activeElement !== s) s.value = String(Math.max(25, Math.min(400, pct)));
    v.textContent = pct + '%';
    s.setAttribute('aria-valuetext', pct + '%');
  },

  // ---- Repeat and Undo's list ---------------------------------------------------------------
  repeatLast() {
    const L = this.lastAct;
    if (!L || document.activeElement !== this.root) return false;
    return this.runCommand(L.id, L.args) !== false;
  },
  undoMenu() {
    const steps = this.hist.slice(-12).reverse();
    if (!steps.length) return false;
    const items = steps.map((h, i) => ({ name: (i ? 'Undo ' + (i + 1) + ' steps, back to: ' : 'Undo: ') + kindName(h.kind), title: new Date(h.time).toLocaleTimeString(), run: () => { for (let k = 0; k <= i; k++) this.undo(); } }));
    // (under the arrow; where the bar hides it, a phone's menu panel pressed it: under the bar)
    const x = $('#b-undo-x'), at = x && x.offsetParent ? x : new DOMRect(8, $('#bar').getBoundingClientRect().bottom, 0, 0);
    openMenu(this, at, items, { label: 'Undo options' });
    return true;
  }
};

// a stranger's preferences are the person's own: kept as the page opened, nothing to check
function restorePrefs(app) {
  const P = app.prefs || {};
  if (P.draft) cls().add('pg-draft');
  if (P.showMarks) cls().add('show-marks');
  if (P.darkPage) cls().add('dark-page');
  if (P.pages === 'side' || P.pages === 'grid') cls().add(P.pages === 'side' ? 'pg-side' : 'pg-grid');
}

onInstall((app) => {
  restorePrefs(app);
  for (const k of VIEWS) {
    const b = $('#sv-' + k);
    if (!b) continue;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => app.runCommand('view-' + k));
    // the arrows move between the three, as in a set of tabs
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = (VIEWS.indexOf(k) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
      e.preventDefault();
      $('#sv-' + VIEWS[i]).focus();
    });
  }
  const s = $('#st-zoom');
  if (s) {
    s.addEventListener('input', () => { $('#st-zoomv').textContent = s.value + '%'; app.zoomSlide = s.value; clearTimeout(app.zoomSlideT); app.zoomSlideT = setTimeout(() => app.runCommand('zoom-slider', +app.zoomSlide), 60); });
    $('#st-zoomv').addEventListener('click', () => app.runCommand('zoom-level'));
  }
  const ux = $('#b-undo-x');
  if (ux) { ux.addEventListener('mousedown', (e) => e.preventDefault()); ux.addEventListener('click', () => app.runCommand('undo-options')); }
  const fx = $('#focus-x');
  if (fx) fx.addEventListener('click', () => app.runCommand('focus'));
  // Esc: out of a block shown as LaTeX (the caret's), else out of Focus
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !app.pop) {
      const T = app.texHere && app.texHere();
      if (T && T.view) { e.preventDefault(); app.hideLatexViews(T.f + '\u0000' + T.B.s); app.ribbonSync(); return; }
      if (cls().contains('focus')) { e.preventDefault(); app.runCommand('focus'); }
      return;
    }
    // Ctrl+Shift+= in the equation field: its LaTeX on the page, as Word's Linear
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && !e.altKey && e.code === 'Equal' && app.pop && app.pop.el && app.pop.el.classList.contains('pop-math')) {
      e.preventDefault(); e.stopImmediatePropagation();
      app.runCommand('show-latex');
    }
  }, true);
  // Repeat: the last command that wrote, as it was run (its arguments too)
  const run0 = app.runCommand;
  app.runCommand = function (id, args, at, from) {
    const n = this.hist ? this.hist.length : 0, top = n ? this.hist[n - 1] : null;
    const r = run0.call(this, id, args, at, from);
    const wrote = () => this.hist && (this.hist.length !== n || this.hist[this.hist.length - 1] !== top);
    if (!NOT_REPEATED.test(id) && r !== false) {
      if (r && typeof r.then === 'function') r.then(() => { if (wrote()) this.lastAct = { id, args }; }, () => {});
      else if (wrote()) this.lastAct = { id, args };
    }
    return r;
  };
  app.viewSync();
});
