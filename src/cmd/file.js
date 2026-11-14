// Batch B12, File: the downloads pinned at the ribbon's right end (PDF, Word, LaTeX; one Download
// menu on a phone), Open, Share, New document and Load the sample; and the File tab: New (a blank
// document, one from a template), Open (Browse, Recent documents), Info (Properties, Check
// accessibility), Save a copy (Export as HTML, Markdown, OpenDocument, RTF, EPUB, plain text,
// through the Word worker's pandoc), Print (src/cmd/page.js) and Options (Set as default: the
// preamble new documents start from).

import { register, onInstall } from '../commands.js';
import { wordEnabled } from '../word.js';
import { $, mk, load, store } from '../ui/dom.js';
import { openMenu, dialog } from '../ui/kit.js';
import { where } from './help.js';
import { preambleEnd, lastCall, hasPackage, setPackageKeys, docClass, usePackages, packageOptions, packageLine, kvEdits } from '../preamble.js';

const LIVE_NOTE = 'Graphs are pictures in a PDF or Word file. Download LaTeX to keep them live.';
const always = () => true;
const DEFAULT_KEY = 'rikuy.default.v1';
const BLANK = '\\documentclass{article}\n\\usepackage{amsmath}\n\n\\begin{document}\n\n\\end{document}\n';
const I = {
  blank: '<path d="M5 2.5h7l3.5 3.5v11.5H5zM12 2.5V6h3.5"/>',
  tpl: '<path d="M4 3.5h12v13H4zM4 7.5h12M8 7.5v9"/>',
  browse: '<path d="M3 5.5h5l1.5 1.5H17v8.5H3z"/>',
  recent: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
  props: '<path d="M5 2.5h7l3.5 3.5v11.5H5zM7.5 10h5M7.5 13h3M7.5 7h2"/>',
  a11y: '<circle cx="10" cy="4" r="1.6"/><path d="M4 7.5l6 1 6-1M10 8.5v4l-3 5M10 12.5l3 5"/>',
  export: '<path d="M5 2.5h7l3.5 3.5v11.5H5zM10 8v6M7.5 11.5 10 14l2.5-2.5"/>',
  dflt: '<path d="M10 2.5l2 4.6 5 .5-3.8 3.3 1.1 4.9L10 13.3l-4.3 2.5 1.1-4.9L3 7.6l5-.5z"/>'
};

// New from template: skeletons of the classes TeX Live has, each one that compiles as it is
const TEMPLATES = [
  ['article', 'Article', 'A paper: title, abstract, sections', '\\documentclass[11pt]{article}\n\\usepackage{amsmath}\n\n\\title{Title}\n\\author{Your name}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\begin{abstract}\nWhat the paper finds, in a few sentences.\n\\end{abstract}\n\n\\section{Introduction}\nStart writing here.\n\n\\end{document}\n'],
  ['report', 'Report', 'Chapters, a contents page', '\\documentclass[11pt]{report}\n\\usepackage{amsmath}\n\n\\title{Report}\n\\author{Your name}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\\tableofcontents\n\n\\chapter{Introduction}\nStart writing here.\n\n\\end{document}\n'],
  ['book', 'Book or thesis', 'Front matter, chapters, two sided', '\\documentclass[11pt]{book}\n\\usepackage{amsmath}\n\n\\title{Thesis}\n\\author{Your name}\n\\date{\\today}\n\n\\begin{document}\n\\frontmatter\n\\maketitle\n\\tableofcontents\n\n\\mainmatter\n\\chapter{Introduction}\nStart writing here.\n\n\\backmatter\n\\end{document}\n'],
  ['letter', 'Letter', 'Address, opening, closing', '\\documentclass[11pt]{letter}\n\n\\signature{Your name}\n\\address{Your street\\\\Your town}\n\n\\begin{document}\n\\begin{letter}{Their name\\\\Their street\\\\Their town}\n\\opening{Dear Sir or Madam,}\n\nStart writing here.\n\n\\closing{Yours faithfully,}\n\\end{letter}\n\\end{document}\n'],
  ['scrartcl', 'KOMA-Script article', 'European layout, sans serif headings', '\\documentclass[11pt,a4paper]{scrartcl}\n\\usepackage{amsmath}\n\n\\title{Title}\n\\author{Your name}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\nStart writing here.\n\n\\end{document}\n'],
  ['beamer', 'Slides', 'Beamer: a title slide and frames', '\\documentclass{beamer}\n\n\\title{Talk}\n\\author{Your name}\n\\date{\\today}\n\n\\begin{document}\n\\frame{\\titlepage}\n\n\\begin{frame}{First slide}\n\\begin{itemize}\n\\item Start writing here.\n\\end{itemize}\n\\end{frame}\n\n\\end{document}\n'],
  ['exam', 'Exam', 'Questions with points', '\\documentclass[11pt]{exam}\n\\usepackage{amsmath}\n\n\\begin{document}\n\\begin{center}\n\\textbf{Exam}\n\\end{center}\n\n\\begin{questions}\n\\question[5] Start writing here.\n\\end{questions}\n\n\\end{document}\n'],
  ['cv', 'CV', 'A one page curriculum vitae', '\\documentclass[11pt]{article}\n\\usepackage[margin=2cm]{geometry}\n\\pagestyle{empty}\n\n\\begin{document}\n\\begin{center}\n{\\LARGE Your name}\\\\[4pt]\nyou@example.org\n\\end{center}\n\n\\section*{Education}\n\\textbf{2026}\\quad Degree, University\n\n\\section*{Experience}\n\\textbf{2025}\\quad Role, Organisation\n\n\\end{document}\n']
];

// Export as: what pandoc writes from the page's AST, as the Word download does
const EXPORTS = [['html', 'Web page (.html)', 'html'], ['markdown', 'Markdown (.md)', 'md'], ['odt', 'OpenDocument text (.odt)', 'odt'], ['rtf', 'Rich text (.rtf)', 'rtf'], ['epub', 'E-book (.epub)', 'epub'], ['txt', 'Plain text (.txt)', 'txt']];
const MIME = { html: 'text/html', md: 'text/markdown', odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf', epub: 'application/epub+zip', txt: 'text/plain' };

register(
  // (drawn in src/template.html, in the group "Download" that stays at the row's end in every tab)
  { id: 'download-menu', name: 'Download', el: 'rb-dl-menu', static: true, place: 'download', only: 'narrow', title: 'Download as PDF, Word or LaTeX', when: always, run: (app) => app.openDownloads() },
  { id: 'download-pdf', name: 'Download PDF', el: 'rb-pdf', static: true, place: 'download', only: 'wide', title: 'Download the PDF as TeX makes it', synonyms: ['Export to PDF', 'Save as PDF', 'PDF'], when: always,
    run: async (app) => { await app.downloadPdfNow(); app.ribbonSync(); } },
  { id: 'download-word', name: 'Download Word', el: 'rb-word', static: true, place: 'download', only: 'wide', title: 'Download a Word file (.docx)', synonyms: ['Save as Word', 'Export to Word', 'docx'], when: always,
    // (the note only once a file was made: on a copy without Word the notice about that stays)
    run: async (app) => { const had = app.lastDocx; await app.saveDocx(); if (app.lastDocx !== had) app.liveNote(); app.ribbonSync(); } },
  { id: 'download-latex', name: 'Download LaTeX', el: 'b-save', static: true, place: 'download', only: 'wide', title: 'Download the LaTeX source (Ctrl+S)', keysElsewhere: ['Ctrl+S'], synonyms: ['Save', 'Save a copy', '.tex', '.zip'], when: always,
    run: async (app) => { await app.save(); app.ribbonSync(); } },
  { id: 'open', name: 'Open', el: 'b-open', static: true, place: 'bar', title: 'Open .tex, .bib, images, an Overleaf .zip or a Word .docx (Ctrl+O)', keysElsewhere: ['Ctrl+O'], synonyms: ['Open a file', 'Import'], when: always, run: () => $('#fileinput').click() },
  { id: 'share', name: 'Share', el: 'b-share', static: true, place: 'bar', title: 'A link anyone can open and type in, or a copy for Overleaf', synonyms: ['Share link', 'Overleaf'], when: always, run: (app) => app.openSharePanel() },
  { id: 'new-document', name: 'New document', el: 'b-new', static: true, place: 'status', synonyms: ['New', 'Blank document'], when: always, run: (app) => app.newDocument() },
  { id: 'load-sample', name: 'Load the sample', el: 'b-sample', static: true, place: 'status', synonyms: ['Sample document', 'Example'], when: always, run: (app) => app.resetToSample() },

  // ---- File ▸ New
  { id: 'new-blank', name: 'Blank document', order: 10, title: 'A new document from your default preamble (Set as default), or a plain article', synonyms: ['New blank', 'Empty document'],
    tab: 'file', group: 'new', el: 'rf-blank', label: 'Blank document', icon: I.blank, when: always, run: (app) => app.newFromText(app.defaultPreambleDoc(), 'Untitled', 'New document') },
  { id: 'new-template', name: 'New from template', order: 20, title: 'A new document from a template: article, report, book or thesis, letter, KOMA-Script, slides, exam, CV', synonyms: ['Templates', 'Letter', 'Thesis', 'Slides', 'Beamer', 'Exam', 'CV', 'Report', 'Resume'],
    tab: 'file', group: 'new', el: 'rf-template', label: 'Templates', icon: I.tpl, kind: 'menu', when: always,
    menuItems: (app) => TEMPLATES.map(([id, name, d]) => ({ name, title: d, run: () => app.runCommand('new-template', id) })),
    run: (app, args) => (typeof args === 'string' ? app.newFromTemplate(args) : app.fileMenu('rf-template', 'New from template', TEMPLATES.map(([id, name, d]) => ({ name, title: d, run: () => app.runCommand('new-template', id) })))) },
  // ---- File ▸ Open
  { id: 'browse', name: 'Browse', order: 10, title: 'Open .tex, .bib, images, an Overleaf .zip or a Word .docx from your computer (Ctrl+O)', synonyms: ['Open file', 'Open from computer'],
    tab: 'file', group: 'open', el: 'rf-browse', label: 'Browse', icon: I.browse, when: always, run: () => $('#fileinput').click() },
  { id: 'recent', name: 'Recent documents', order: 20, title: 'The documents kept in this browser: open one, or take it off the list', synonyms: ['Recent', 'Recent files', 'Open recent', 'My documents'],
    tab: 'file', group: 'open', el: 'rf-recent', label: 'Recent', icon: I.recent, kind: 'menu', when: always, run: (app, args) => app.openRecent(args) },
  // ---- File ▸ Info
  { id: 'properties', name: 'Properties', order: 10, title: 'Title, author, subject and keywords: \\title, \\author and the PDF\'s own (\\hypersetup)', synonyms: ['Document properties', 'Info', 'Metadata', 'Keywords', 'Subject'],
    tab: 'file', group: 'info', el: 'rf-props', label: 'Properties', icon: I.props, when: (app) => !!app.model && preambleEnd(app.src(app.main)) >= 0,
    whyNot: () => 'This file has no preamble (\\documentclass ... \\begin{document}) to hold them.', run: (app, args) => (args && typeof args === 'object' ? app.setProperties(args) : app.openProperties()) },
  { id: 'check-accessibility', name: 'Check accessibility', order: 20, title: 'What a screen reader would miss: pictures without alt text, skipped heading levels, tables without a header row, no title or language', synonyms: ['Accessibility checker', 'Tagged PDF', 'PDF/UA', 'Alt text'],
    tab: 'file', group: 'info', el: 'rf-a11y', label: 'Check accessibility', icon: I.a11y, also: [{ tab: 'review', group: 'accessibility', el: 'rr-a11y' }],
    when: (app) => !!app.model, run: (app, args) => (args === 'tagging' ? app.addTagging() : app.openAccessibility()) },
  // ---- File ▸ Save a copy
  { id: 'export-as', name: 'Export as', order: 10, title: 'A copy as a web page, Markdown, OpenDocument, rich text, an e-book or plain text (pandoc, as the Word download)', synonyms: ['Save as', 'Export', 'HTML', 'Markdown', 'ODT', 'RTF', 'EPUB', 'Plain text'],
    tab: 'file', group: 'save', el: 'rf-export', label: 'Export as', icon: I.export, kind: 'menu', when: (app) => !!app.model,
    menuItems: (app) => EXPORTS.map(([id, name]) => ({ name, run: () => app.runCommand('export-as', id) })),
    run: (app, args) => (typeof args === 'string' ? app.exportAs(args) : app.fileMenu('rf-export', 'Export as', EXPORTS.map(([id, name]) => ({ name, run: () => app.runCommand('export-as', id) })))) },
  // ---- File ▸ Options
  { id: 'set-default', name: 'Set as default', order: 10, title: 'New blank documents start with this document\'s preamble (its class, packages and definitions); kept in this browser', synonyms: ['Default template', 'Normal template', 'Default preamble'],
    tab: 'file', group: 'options', el: 'rf-default', label: 'Set as default', icon: I.dflt, kind: 'menu', when: (app) => !!app.model && preambleEnd(app.src(app.main)) >= 0,
    whyNot: () => 'This file has no preamble to keep.', run: (app, args) => app.setDefaultPreamble(args) }
);

// The text of a title, an author, a subject as typed in a field: LaTeX may be written in it, and
// the three characters that would stop TeX in running text (& % #) are escaped where they stand
// bare. Braces must pair: a field whose braces do not is refused.
const texField = (s) => String(s).replace(/\r?\n+/g, ' ').replace(/(?<!\\)[&%#]/g, (c) => '\\' + c);
const paired = (s) => { let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '{') d++; else if (s[i] === '}' && --d < 0) return false; } return d === 0; };

// The options of each \\includegraphics of a text (null for none), at most 500, read by a scan: a
// pattern with \\s* on both sides of an optional [..] took seconds on a stranger's file of spaces
function graphicsOptions(t) {
  const out = [];
  for (let i = 0; out.length < 500;) {
    i = t.indexOf('\\includegraphics', i);
    if (i < 0) break;
    i += 16;
    if (/[A-Za-z@]/.test(t[i] || '')) continue;
    let j = i;
    if (t[j] === '*') j++;
    while (j < t.length && j - i < 200 && /\s/.test(t[j])) j++;
    const z = t[j] === '[' ? t.indexOf(']', j) : -1;
    out.push(z > j && z - j <= 400 ? t.slice(j + 1, z) : null);
  }
  return out;
}

// Accessibility: what the document lacks, read from the model and the source (bounded)
function a11yIssues(app) {
  const out = [], src = app.src(app.main), end = preambleEnd(src);
  const pre = end >= 0 ? src.slice(0, end) : '';
  const files = [...app.files].filter(([n]) => /\.tex$/i.test(n));
  if (end >= 0 && !lastCall(src, 'title', end) && !/\\title\s*\{/.test(src.slice(0, 200000))) out.push({ k: 'title', t: 'No title (\\title): a PDF reader names the document by its file instead.' });
  if (end >= 0 && !/\\DocumentMetadata\s*\{[^}]*lang\s*=/.test(pre.slice(0, 4000)) && !hasPackage(src, 'babel', end) && !hasPackage(src, 'polyglossia', end) && !/\\set(main|default)language/.test(pre)) out.push({ k: 'lang', t: 'No language set: a screen reader guesses how to read the text. \\DocumentMetadata{lang=en} or babel says it.' });
  let figs = 0, noAlt = 0;
  for (const [, t] of files) for (const o of graphicsOptions(t)) { figs++; if (o == null || !/\balt\s*=/.test(o)) noAlt++; }
  if (noAlt) out.push({ k: 'alt', t: noAlt + ' of ' + figs + ' pictures have no alt text: \\includegraphics[alt={What it shows}]{...}.' });
  // heading levels as the outline has them: a level skipped (a \subsubsection right under a \section)
  let last = null, skips = 0;
  for (const h of (app.model.headings || [])) { if (last != null && h.level > last + 1) skips++; last = h.level; }
  if (skips) out.push({ k: 'heads', t: skips + (skips === 1 ? ' heading skips' : ' headings skip') + ' a level: a reader moving by headings loses the order.' });
  let tabs = 0, plain = 0;
  for (const [, t] of files) {
    const re = /\\begin\s*\{(tabular\*?|tabularx|longtable|tblr)\}/g;
    let m, n = 0;
    while ((m = re.exec(t)) && n++ < 500) {
      tabs++;
      const body = t.slice(m.index, m.index + 3000);
      if (!/\\(toprule|hline|midrule|rowcolor|thead|SetRow)/.test(body.slice(0, body.indexOf('\\\\') + 200))) plain++;
    }
  }
  if (plain) out.push({ k: 'table', t: plain + ' of ' + tabs + ' tables have no marked header row (\\toprule, \\hline or \\midrule under the first row).' });
  if (end >= 0 && !/\\DocumentMetadata\s*\{[^}]*tagging\s*=\s*on/.test(pre.slice(0, 4000))) out.push({ k: 'tagging', t: 'The PDF is not tagged: a screen reader reads it as loose text.', fix: 'Tag the PDF' });
  return out;
}

export const methods = {
  // a live graph on the page, as the parser found it (one named in a comment is none)
  hasLive() { return this.renderer.blocks.some((B) => B.atoms.some((a) => a.kind === 'widget')); },
  // PDF and Word hold a live graph as its picture: said once for each document, after what the
  // download itself has to say (Word's "Saved, shown differently in Word"), in the same message
  liveNote() {
    const k = this.name + '|' + this.main;
    if (!this.hasLive() || this.liveTold === k) return;
    this.liveTold = k;
    const said = $('#toast').hidden ? '' : $('#toast').firstChild.textContent;
    this.toast((said ? said + ' ' : '') + LIVE_NOTE, 14000);
  },
  // the LaTeX download's title: what it gives, whether there are changes since, and that it
  // alone keeps live graphs live (the button then carries a mark)
  saveTitle() {
    const b = $('#b-save');
    if (!b) return;
    const live = this.hasLive(), what = this.singleFile() ? this.main.split('/').pop() : 'the project as .zip';
    b.classList.toggle('live', live);
    b.title = (this.zipDirty ? 'Changes since you last saved. ' : '') + 'Download the LaTeX source, ' + what + (live ? ': keeps the live graphs' : '') + ' (Ctrl+S)';
  },

  // The PDF in one click: the one TeX last made when the text has not changed since, else a
  // compile first. The button is busy meanwhile and cannot start a second run. A run that
  // fails opens the preview pane, which holds its error.
  async downloadPdfNow() {
    if (this.pdfBusy) return;
    const b = $('#rb-pdf'), lab = b.querySelector('span');
    const fresh = () => !!this.lastPdf && this.lastPdfSig === this.textSigNow();
    if (!fresh() || this.compiling) {
      this.pdfBusy = true;
      b.disabled = true; b.setAttribute('aria-busy', 'true'); lab.textContent = 'Making the PDF…';
      try {
        this.pdfPane();
        if (!this.compiling) await this.compilePdf();
        // (a run asked for while one was going starts when that one ends)
        while (this.compiling) await new Promise((r) => setTimeout(r, 150));
      } finally {
        this.pdfBusy = false;
        b.disabled = false; b.removeAttribute('aria-busy'); lab.textContent = 'PDF';
      }
    }
    if (fresh()) { await this.downloadPdf(); this.liveNote(); } else if (!document.body.classList.contains('pdf-on')) this.togglePdf(true, true);
  },

  // A phone's one Download button: the three downloads by name, each pressing its own button.
  openDownloads() {
    const p = this.makePop($('#rb-dl-menu'), 'pop-dl', 'Download');
    // a menu named by its title; each item under its button's own name ("Download LaTeX")
    p.setAttribute('role', 'menu');
    p.querySelector('.pop-x').setAttribute('role', 'menuitem');
    this.menuKeys(p);
    for (const id of ['rb-pdf', 'rb-word', 'b-save']) {
      const b = $('#' + id), a = document.createElement('button');
      a.type = 'button'; a.className = 'nav-act'; a.setAttribute('role', 'menuitem'); a.setAttribute('aria-label', b.getAttribute('aria-label')); a.title = b.title;
      a.append(b.querySelector('svg').cloneNode(true), Object.assign(document.createElement('span'), { textContent: b.querySelector('span').textContent }));
      if (id === 'b-save' && b.classList.contains('live')) a.classList.add('live');
      a.addEventListener('click', () => { this.closePop(true); b.click(); });
      p.append(a);
    }
    this.positionPop();
  },

  // a File tab menu under its button (or, folded or from the search box, under the ribbon)
  fileMenu(el, label, items) {
    const b = $('#' + el);
    const at = b && b.offsetParent ? b : ($('#ribbon') && $('#ribbon').offsetParent ? $('#ribbon') : this.root);
    openMenu(this, at, items, { label });
    return true;
  },

  // ---- New -----------------------------------------------------------------------------------
  // a new project of this text (the open one stays under Review, Versions), named base, base 2, ...
  async newFromText(text, base, label) {
    await this.snapshot('Before starting a new document', { force: !this.lastSig });
    await this.stashBinary();
    const taken = new Set((await this.allSnaps()).map((v) => v.name));
    let name = base;
    for (let k = 2; taken.has(name) || name === this.name; k++) name = base + ' ' + k;
    this.clearLink(name, 'main.tex');
    this.loadProject(new Map([['main.tex', text]]), 'main.tex', name, label);
    if (this.view && this.view !== 'page') this.setView('page');
    if (this.ghost && this.ghost.sticky) this.caretToGhost();
    this.toast('A new document. The one you had is under Review, Versions.', 5000);
    return true;
  },
  newFromTemplate(id) {
    const t = TEMPLATES.find((x) => x[0] === id);
    if (!t) return false;
    return this.newFromText(t[3], t[1], 'New ' + t[1].toLowerCase());
  },
  // the blank document: the default preamble kept by Set as default, or Rikuy's article
  defaultPreambleDoc() {
    const d = load(DEFAULT_KEY);
    if (!d || typeof d.pre !== 'string' || d.pre.length > 200000 || !/\\documentclass/.test(d.pre)) return BLANK;
    const nl = d.pre.includes('\r\n') ? '\r\n' : '\n';
    return d.pre.replace(/\s+$/, '') + nl + nl + '\\begin{document}' + nl + nl + '\\end{document}' + nl;
  },
  // Set as default: this preamble (to \begin{document}) for new blank documents; 'reset' forgets it
  setDefaultPreamble(args) {
    if (args === 'reset') { try { localStorage.removeItem(DEFAULT_KEY); } catch (e) { /* none kept */ } this.toast('New blank documents start as a plain article again.'); return true; }
    if (args !== 'set') {
      const kept = !!load(DEFAULT_KEY);
      return this.fileMenu('rf-default', 'Set as default', [
        { name: 'Use this preamble for new documents', title: 'Its class, packages and definitions, kept in this browser', run: () => this.runCommand('set-default', 'set') },
        { name: 'Forget the default', title: 'New blank documents start as a plain article', disabled: !kept, run: () => this.runCommand('set-default', 'reset') }
      ]);
    }
    const src = this.src(this.main), end = preambleEnd(src);
    if (end < 0) return false;
    if (!store(DEFAULT_KEY, { pre: src.slice(0, end), t: Date.now(), from: this.name })) { this.toast('This browser keeps nothing more: the default could not be saved.'); return false; }
    this.toast('New blank documents (File, Blank document) start with this preamble.', 5000);
    return true;
  },

  // ---- Recent documents -----------------------------------------------------------------------
  // The documents kept in this browser, newest first, the open one left out: each opens; Remove
  // takes all of its versions away after a second press of the toast's button.
  async openRecent(args) {
    const all = await this.allSnaps(), seen = new Map();
    for (const v of all) if (v.name && v.name !== this.name && !seen.has(v.name)) seen.set(v.name, v);
    const list = [...seen.values()].slice(0, 15);
    if (args && typeof args === 'object' && args.open) { const v = seen.get(args.open); if (!v) return false; const files = await this.versionFiles(v); if (!files) return false; await this.openVersion(v, files); return true; }
    if (args && typeof args === 'object' && args.remove) return this.removeRecent(args.remove, all);
    const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const items = list.length ? list.flatMap((v) => [
      { name: v.name, title: 'Open it, as it was ' + when(v.t), run: () => this.runCommand('recent', { open: v.name }) }
    ]) : [{ name: 'No other documents yet', disabled: true }];
    if (list.length) items.push(null, { name: 'Remove a document…', title: 'Take a document and all of its versions out of this browser', run: () => this.fileMenu('rf-recent', 'Remove a document', list.map((v) => ({ name: 'Remove ' + v.name, run: () => this.runCommand('recent', { remove: v.name }) }))) });
    return this.fileMenu('rf-recent', 'Recent documents', items);
  },
  async removeRecent(name, all) {
    if (name === this.name) return false;
    const vs = all.filter((v) => v.name === name);
    if (!vs.length) return false;
    this.toast('Remove ' + name + ' and its ' + vs.length + (vs.length === 1 ? ' version' : ' versions') + ' from this browser?', 8000, { label: 'Remove', fn: async () => {
      const { snapDel } = await import('../store.js');
      for (const v of vs) { try { await snapDel(v.id); } catch (e) { /* gone */ } }
      this.memSnaps = (this.memSnaps || []).filter((m) => m.name !== name);
      this.snapList = null;
      this.toast('Removed ' + name + '.');
    } });
    return true;
  },

  // ---- Properties -----------------------------------------------------------------------------
  // { title, author, subject, keywords } as the source has them (the text of the arguments)
  properties() {
    const src = this.src(this.main), end = preambleEnd(src);
    const arg = (cmd, endAt) => { const c = lastCall(src, cmd, endAt); return c ? src.slice(c.arg[0], c.arg[1]) : null; };
    const out = { title: arg('title', end), author: arg('author', end) };
    // (written after \begin{document} in some documents)
    const body = Math.min(src.length, 200000);
    if (out.title == null) out.title = arg('title', body);
    if (out.author == null) out.author = arg('author', body);
    const hs = lastCall(src, 'hypersetup', end);
    const kv = (k) => {
      const t = hs ? src.slice(hs.arg[0], hs.arg[1]) : '';
      const m = new RegExp('(?:^|,)\\s*' + k + '\\s*=\\s*').exec(t);
      if (!m) return null;
      let i = m.index + m[0].length;
      if (t[i] === '{') { let d = 0; for (let j = i; j < t.length && j < i + 2000; j++) { if (t[j] === '{') d++; else if (t[j] === '}' && --d === 0) return t.slice(i + 1, j); } return null; }
      const z = t.indexOf(',', i);
      return t.slice(i, z < 0 ? t.length : z).trim();
    };
    // (\\hypersetup's, else hyperref's options)
    const opt = packageOptions(src, 'hyperref', end) || {};
    const unbrace = (x) => (typeof x === 'string' ? x.trim().replace(/^\{([^]*)\}$/, '$1') : null);
    out.subject = kv('pdfsubject') ?? unbrace(opt.pdfsubject); out.keywords = kv('pdfkeywords') ?? unbrace(opt.pdfkeywords);
    return out;
  },
  // The edits that set them: a changed title or author replaces the argument (or a line is added
  // before \begin{document}); subject and keywords are \hypersetup's keys, hyperref loaded with
  // hidelinks where nothing loads it (so links look as before); a class that loads hyperref
  // itself (beamer) gets a \hypersetup line instead. Unchanged fields write nothing.
  propertyEdits(v) {
    const src = this.src(this.main), end = preambleEnd(src);
    if (end < 0) return null;
    const cur = this.properties(), edits = [], nl = src.includes('\r\n') ? '\r\n' : '\n';
    for (const k of ['title', 'author', 'subject', 'keywords']) if (v[k] != null && !paired(String(v[k]))) return { error: 'The braces of the ' + k + ' do not pair.' };
    for (const k of ['title', 'author']) {
      if (v[k] == null || v[k] === (cur[k] ?? '')) continue;
      const t = texField(v[k]);
      let c = lastCall(src, k, end);
      if (!c) c = lastCall(src, k, Math.min(src.length, 200000));
      if (c) edits.push({ s: c.arg[0], e: c.arg[1], t });
      else if (t) { const at = src.lastIndexOf('\n', end - 1) + 1; edits.push({ s: at, e: at, t: '\\' + k + '{' + t + '}' + nl }); }
    }
    const keys = {};
    for (const [k, key] of [['subject', 'pdfsubject'], ['keywords', 'pdfkeywords']]) {
      if (v[k] == null || v[k] === (cur[k] ?? '')) continue;
      keys[key] = v[k] ? '{' + texField(v[k]) + '}' : null;
    }
    if (Object.keys(keys).length) {
      const cls = docClass(src), others = this.preambleOthers ? this.preambleOthers() : [];
      const viaClass = cls && /^(beamer|beamerposter)$/.test(src.slice(cls.nameAt[0], cls.nameAt[1]).trim());
      if (lastCall(src, 'hypersetup', end) || hasPackage(src, 'hyperref', end, others) || viaClass) {
        if (!lastCall(src, 'hypersetup', end) && (viaClass || !hasPackage(src, 'hyperref', end))) {
          // hyperref loaded by the class or another file: a \hypersetup line of its own
          const set = Object.entries(keys).filter(([, x]) => x != null).map(([a, b]) => a + '=' + b).join(',');
          if (set) { const at = src.lastIndexOf('\n', end - 1) + 1; edits.push({ s: at, e: at, t: '\\hypersetup{' + set + '}' + nl }); }
        } else if (lastCall(src, 'hypersetup', end)) edits.push(...setPackageKeys(src, 'hyperref', 'hypersetup', keys, { end }));
        else {
          // (hyperref's own options: set or taken out in its line; a line of several packages, or
          // one in another file, gets what is added through usePackages)
          const L = packageLine(src, 'hyperref', end);
          if (L && L.opts && L.names.length === 1) edits.push(...kvEdits(src, L.opts[0], L.opts[1], keys));
          else { const add = Object.fromEntries(Object.entries(keys).filter(([, x]) => x != null)); if (Object.keys(add).length) edits.push(...usePackages(src, { hyperref: add }, { end, others })); }
        }
      } else if (Object.values(keys).some((x) => x != null)) edits.push(...usePackages(src, { hyperref: { hidelinks: true, ...keys } }, { end, others }));
    }
    return { edits };
  },
  setProperties(v) {
    const r = this.propertyEdits(v || {});
    if (!r) return false;
    if (r.error) { this.toast(r.error); return false; }
    if (!r.edits.length) return true;
    this.commit(r.edits.map((x) => ({ f: this.main, ...x })), null, 'properties');
    this.closeGroup();
    return true;
  },
  openProperties() {
    const cur = this.properties();
    const p = dialog(this, { title: 'Properties', ...where('rf-props', 440), cls: 'pop-props' });
    const fields = {};
    const row = (k, label, hint) => {
      const l = mk('label', 'props-row');
      const i = mk('input');
      i.type = 'text'; i.value = cur[k] ?? ''; i.spellcheck = k !== 'keywords'; i.setAttribute('aria-label', label);
      fields[k] = i;
      l.append(mk('span', null, label), i);
      if (hint) l.append(mk('small', null, hint));
      p.append(l);
    };
    row('title', 'Title', '\\title: the title page and the PDF\'s title');
    row('author', 'Author', '\\author: names joined with \\and');
    row('subject', 'Subject', 'The PDF\'s subject (\\hypersetup{pdfsubject=...})');
    row('keywords', 'Keywords', 'The PDF\'s keywords, separated by commas');
    const r = mk('div', 'pop-row');
    const ok = mk('button', 'btn sm', 'Apply');
    ok.type = 'button';
    ok.addEventListener('click', () => {
      const v = {};
      for (const k in fields) v[k] = fields[k].value;
      if (this.setProperties(v) !== false) { this.closePop(true); this.ribbonBack(); }
    });
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); ok.click(); } });
    r.append(mk('span', 'grow'), ok);
    p.append(r);
    this.positionPop();
    fields.title.focus();
    return true;
  },

  // ---- Check accessibility --------------------------------------------------------------------
  accessibilityIssues() { return a11yIssues(this); },
  openAccessibility() {
    const list = a11yIssues(this);
    const p = dialog(this, { title: 'Check accessibility', ...where('rf-a11y', 560), cls: 'pop-help pop-guide pop-a11y' });
    if (!list.length) p.append(mk('p', null, 'Nothing found: pictures have alt text, headings keep their order, tables mark their header, and the PDF is tagged.'));
    for (const x of list) {
      const d = mk('div', 'a11y-row');
      d.append(mk('p', null, x.t));
      if (x.fix) {
        const b = mk('button', 'btn ghost sm', x.fix);
        b.type = 'button';
        b.title = 'Writes \\DocumentMetadata{lang=..., pdfstandard=ua-2, tagging=on} before \\documentclass: LaTeX tags the PDF (some older packages do not support it yet)';
        b.addEventListener('click', () => { this.closePop(true); this.runCommand('check-accessibility', 'tagging'); });
        d.append(b);
      }
      p.append(d);
    }
    this.positionPop();
    return true;
  },
  // \DocumentMetadata{lang=..,pdfstandard=ua-2,tagging=on} on the first line, once
  addTagging() {
    const src = this.src(this.main), cls = docClass(src);
    if (!cls || /\\DocumentMetadata\s*\{/.test(src.slice(0, cls.s))) return false;
    const lang = (this.model && this.model.opts.lang) || 'en', nl = src.includes('\r\n') ? '\r\n' : '\n';
    const at = src.lastIndexOf('\n', cls.s - 1) + 1;
    this.commit([{ f: this.main, s: at, e: at, t: '\\DocumentMetadata{lang=' + lang + ',pdfstandard=ua-2,tagging=on}' + nl }], null, 'tagging');
    this.closeGroup();
    return true;
  },

  // ---- Export as --------------------------------------------------------------------------------
  // The page's AST (as the Word download builds it) through pandoc to another format, downloaded
  async exportAs(id) {
    const x = EXPORTS.find((e) => e[0] === id);
    if (!x) return false;
    if (!wordEnabled()) { this.wordMissing(); return false; }
    if (this.wordBusy) return false;
    this.wordBusy = true;
    try {
      this.toast('Making the ' + x[1].replace(/ \(.*/, '').toLowerCase() + '…', 60000);
      const req = await this.wordRequest();
      const res = await this.wordEngine().run('convert', { req, to: id });
      const blob = new Blob([res.bytes], { type: MIME[x[2]] });
      const fname = (this.name || 'paper').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') + '.' + x[2];
      const D = this.caps && this.caps.downloads;
      if (D) await D.save({ filename: fname, data: blob });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      this.lastExport = { name: fname, size: blob.size, blob };
      this.toast('Saved ' + fname + '.', 5000);
      return true;
    } catch (e) {
      if (!(e && e.code === 'declined')) this.toast('Could not export: ' + ((e && e.message) || e), 8000);
      return false;
    } finally { this.wordBusy = false; }
  }
};

onInstall((app) => {
  // Recent documents' button opens its list (the menu kind draws an arrow but has no items of its own)
  const r = $('#rf-recent');
  if (r) r.setAttribute('aria-haspopup', 'menu');
});
