// Batch B9, references: Word's References tab over LaTeX's own machinery, and the links of the
// Insert tab. The table of contents (\tableofcontents, its levels by tocdepth, Add Text: a
// heading's level, starred to stay out, a short title), footnotes and endnotes (enotez; Next,
// Show, the Footnote and Endnote dialog: numbering, start, restart, convert), sources in the
// project's .bib (Add New Source, Manage Sources: src/ui/sourceform.js), the citation style
// (natbib, biblatex or plain BibTeX, as the document has it, never mixed), the bibliography,
// captions and the lists of figures and tables, cross references (\ref, \pageref, and \cref,
// \autoref, \vref where their package is loaded; a label added where the target has none), the
// index (Mark Entry, Insert Index: imakeidx, makeindex run by the worker), links (Ctrl+K: \href,
// \url, mailto:, \hyperref; edit, open, copy, remove) and bookmarks (\label). Each action is one
// step of history; what it writes is src/refsrc.js's and src/bib.js's, on strings.

import { register, command } from '../commands.js';
import { BLOCKS } from '../render.js';
import { styOfEl, atomOfEl, escapeTeX } from '../editor.js';
import { usePackages, provides, preambleEnd, stripComments, hasPackage } from '../preamble.js';
import { applyEdits } from '../styles.js';
import { mapPos, diffEdit } from '../wrap.js';
import { parse } from '../parser.js';
import { blockText, compile, hitsIn, hitSource } from '../find.js';
import * as RS from '../refsrc.js';
import { openMenu } from '../ui/kit.js';
import { openSourceForm, openSourceManager, sourceFiles, addSource } from '../ui/sourceform.js';
import { near, openCaptionDialog, openCrossRefDialog, openLinkDialog, openBookmarkDialog, openMarkEntryDialog, openIndexDialog, openNotesDialog, openShortTitleDialog, openMarkCitationDialog, TOA_CATEGORIES } from '../ui/refsdialog.js';

// where a footnote cannot go: inside a heading, the title, a cell, a caption or another footnote
const tight = (at) => /^(h|ttl|cell|cap|fn)$/.test(at.ctx) || at.cell;
const piece = (open, close) => ({ open, close });
const textAt = (app, at) => !!at && !(at.c.ghost && app.ghost && app.ghost.tex);
const NOT_HERE = 'Click in the text first';
const ICON = {
  toc: '<path d="M4 5h12M4 8.5h9M6.5 12h9.5M6.5 15.5h7"/>',
  addText: '<path d="M4 5.5h8M4 9h6M4 12.5h8M14.5 9v7M11 12.5h7"/>',
  endnote: '<path d="M4 6h12M4 9h12M4 12h7M12.5 14.5l1.6-1v5"/>',
  next: '<path d="M4 6h9M4 10h6M4 14h9M15 8l2.5 2.5L15 13"/>',
  show: '<path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
  options: '<path d="M4 4h12v12H4zM7 8h6M7 11h4M12 14l2 2"/>',
  source: '<path d="M5 3.5h7l3 3v10H5zM10 8v6M7 11h6"/>',
  manage: '<path d="M4 4h12v3H4zM4 9h12v3H4zM4 14h12v3H4z"/>',
  style: '<path d="M5 4h10M5 7.5h10M5 11h6M13.5 12.5l2.5 2.5-4 1.5 1.5-4z"/>',
  bib: '<path d="M4 4h4v12H4zM9.5 4h3v12h-3zM13.5 5l2.5-.6 2.4 11.4-2.5.6z"/>',
  caption: '<path d="M4 4h12v8H4zM4 14.5h8M4 17h5"/>',
  lof: '<path d="M4 4h5v4H4zM11 5.5h5M4 11h5v4H4zM11 12.5h5"/>',
  mark: '<path d="M5 3.5h10v13l-5-3.5-5 3.5zM8 8h4"/>',
  index: '<path d="M4 4h12v12H4zM7 7.5h2M7 10.5h4M7 13.5h3M12.5 7.5h1"/>',
  bookmark: '<path d="M6 3.5h8v13l-4-3-4 3z"/>',
  cite: '<path d="M4.5 5.5h4v4c0 2-1 3.5-3 4M11.5 5.5h4v4c0 2-1 3.5-3 4"/>',
  toa: '<path d="M10 3.5v13M5 16.5h10M4 7.5h12M4 7.5l-1.8 4.5h3.6zM16 7.5l-1.8 4.5h3.6z"/>'
};

// ---- the commands ----------------------------------------------------------------------------------
register(
  { id: 'footnote', name: 'Footnote', order: 50, title: 'Footnote (Ctrl+Alt+F)', synonyms: ['Insert footnote', 'Note'], tab: 'home', group: 'insert', el: 'rb-fn', label: 'Footnote',
    icon: '<path d="M4 8l6 7.5M10 8l-6 7.5M14 5.2l1.6-1v5.6"/>', also: [{ tab: 'references', group: 'footnotes', el: 'rr-fn', order: 10 }], keys: ['Ctrl+Alt+F'],
    when: (app, at) => !!at && !tight(at), run: (app) => app.insertEmpty('\\footnote{', '}'),
    palette: { k: 'footnote', d: 'Footnote', order: 10, t: piece('\\footnote{', '}') } },
  { id: 'citation', name: 'Citation', order: 60, title: 'Citation of a work in the bibliography', synonyms: ['Insert citation', 'Cite', 'Reference a source'], tab: 'home', group: 'insert', el: 'rb-cite', label: 'Citation',
    icon: '<path d="M7 4.5H5v11h2M13 4.5h2v11h-2M9.4 8.2l1.2-.8v5.4"/>', also: [{ tab: 'references', group: 'citations', el: 'rr-cite', order: 10 }], run: (app) => app.insertCite(),
    palette: { k: 'cite', d: 'Citation', order: 20, act: 'cite' } },
  { id: 'link', name: 'Link', order: 70, title: 'Link (Ctrl+K): a web page, an e-mail address or a place in this document; with the caret in a link, edit it',
    synonyms: ['Hyperlink', 'URL', 'Web address', 'Insert link', 'Edit link', 'href', 'mailto'], tab: 'home', group: 'insert', el: 'rb-link', label: 'Link', keys: ['Ctrl+K'], keyRank: 1,
    icon: '<path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.2-2.2a3 3 0 0 0-4.2-4.2l-.9.9M11.4 8.6a3 3 0 0 0-4.2 0L5 10.8A3 3 0 0 0 9.2 15l.9-.9"/>', also: [{ tab: 'insert', group: 'links', el: 'ri-link', order: 10 }],
    when: (app, at) => textAt(app, at) && at.ctx !== 'ttl', whyNot: () => NOT_HERE, run: (app, args, at) => (args && (args.url != null || args.kind) ? app.linkWrite(at, args) : openLinkDialog(app, at)),
    palette: { k: 'url', d: 'URL', order: 210, t: piece('\\url{', '}') } },
  { id: 'bookmark', name: 'Bookmark', order: 20, tab: 'insert', group: 'links', label: 'Bookmark', icon: ICON.bookmark, title: 'Bookmark: a label (\\label) here, to refer to or link to; the dialog lists, goes to and deletes them',
    synonyms: ['Label', 'Anchor', 'phantomsection'], when: (app, at) => textAt(app, at), whyNot: () => NOT_HERE, run: (app, args, at) => (args && args.add ? app.bookmarkAdd(at, args.add) : openBookmarkDialog(app, at)) },
  { id: 'cross-reference', name: 'Cross-reference', order: 30, title: 'A reference to a heading, figure, table, equation or bookmark: its number, its page, or its name where cleveref or hyperref is loaded; a label is added where it has none',
    synonyms: ['Reference', 'Cross reference', 'ref', 'cref', 'pageref', 'autoref'], tab: 'insert', group: 'links', el: 'ri-xref', label: 'Cross-reference', icon: '<path d="M6 4.5h8v11l-4-3-4 3zM8.5 8h3"/>',
    also: [{ tab: 'references', group: 'captions', el: 'rr-xref', order: 30 }], when: (app, at) => textAt(app, at) && at.ctx !== 'ttl', whyNot: () => NOT_HERE,
    run: (app, args, at) => (args && args.target ? app.crossRefWrite(at, args) : openCrossRefDialog(app, at)), palette: { k: 'ref', d: 'Cross reference', order: 30, act: 'ref' } },
  { id: 'equation-reference', name: 'Equation reference', synonyms: ['eqref'], run: (app) => app.insertFromPalette('eqref'), palette: { k: 'eqref', d: 'Equation reference', order: 40, act: 'eqref' } },
  { id: 'label', name: 'Label', title: 'A label to refer to', synonyms: ['Bookmark'], run: (app) => app.insertFromPalette('label'), palette: { k: 'label', d: 'Label', order: 200, t: piece('\\label{', '}') } },

  // the link at the caret (its right click menu, and C7)
  { id: 'link-edit', name: 'Edit Link', menu: { link: 10 }, title: 'Edit Link: its address and its text', synonyms: ['Edit hyperlink'], when: (app, at) => !!app.linkAt(at), whyNot: () => 'Put the caret in a link first', run: (app, args, at) => openLinkDialog(app, at) },
  { id: 'link-open', name: 'Open Link', menu: { link: 20 }, title: 'Open Link in a new tab (Ctrl+click it)', synonyms: ['Open hyperlink', 'Follow link'], when: (app, at) => !!(app.linkAt(at) || {}).url, whyNot: () => 'Put the caret in a link to a web page first', run: (app, args, at) => app.openLink(app.linkAt(at).url) },
  { id: 'link-copy', name: 'Copy Link', menu: { link: 30 }, title: 'Copy Link: its address to the clipboard', synonyms: ['Copy hyperlink', 'Copy address'], when: (app, at) => !!(app.linkAt(at) || {}).url, whyNot: () => 'Put the caret in a link to a web page first', run: (app, args, at) => app.linkCopy(at) },
  { id: 'link-remove', name: 'Remove Link', menu: { link: 40 }, title: 'Remove Link: its words stay, without the link', synonyms: ['Remove hyperlink', 'Unlink'], when: (app, at) => !!app.linkAt(at), whyNot: () => 'Put the caret in a link first', run: (app, args, at) => app.linkRemove(at) },

  // ---- References › Table of contents
  { id: 'table-of-contents', name: 'Table of Contents', kind: 'split', menuWhenOff: true, tab: 'references', group: 'toc', order: 10, label: 'Table of Contents', icon: ICON.toc,
    title: 'Table of Contents: \\tableofcontents after the paragraph the caret is in; the arrow: how many levels it shows (tocdepth), or take it out. The page keeps it up to date as you type.',
    synonyms: ['Contents', 'TOC', 'tableofcontents', 'Update table', 'tocdepth', 'Remove table of contents'], when: (app, at) => !!at && !app.tocSpots().length,
    whyNot: (app) => (app.tocSpots().length ? 'The document has its table of contents already: the arrow sets its levels or takes it out' : NOT_HERE),
    run: (app) => app.blockCommand('\\tableofcontents'), menuItems: (app) => app.tocItems() },
  { id: 'toc-levels', name: 'Table of Contents levels', title: 'How many levels of headings the table of contents shows: \\setcounter{tocdepth}{…}', synonyms: ['Show levels', 'tocdepth', 'Contents depth'],
    when: (app) => app.refsHasPreamble(), whyNot: () => 'The main file has no preamble to set it in', run: (app, args) => (args && args.levels !== undefined ? app.tocLevels(args.levels) : app.refsMenu('table-of-contents')) },
  { id: 'toc-remove', name: 'Remove Table of Contents', title: 'Remove Table of Contents: \\tableofcontents taken out', synonyms: ['Delete table of contents'], when: (app) => app.tocSpots().length > 0, whyNot: () => 'The document has no table of contents', run: (app) => app.tocRemove() },
  { id: 'toc-add-text', name: 'Add Text', kind: 'menu', tab: 'references', group: 'toc', order: 20, label: 'Add Text', icon: ICON.addText,
    title: 'Add Text: the heading\'s level in the table of contents, or none (\\section*), or a short title for it (\\section[Short]{…})', synonyms: ['Do not show in table of contents', 'Heading level', 'Outline level', 'Short title'],
    when: (app, at) => !!app.headingAt(at), whyNot: () => 'Put the caret in a heading first', run: (app, args, at) => app.addTextMenu(at) },

  // ---- References › Footnotes
  { id: 'endnote', name: 'Insert Endnote', tab: 'references', group: 'footnotes', order: 20, label: 'Insert Endnote', icon: ICON.endnote, keys: ['Ctrl+Alt+D'], mac: { 'Ctrl+Alt+D': false },
    title: 'Insert Endnote (Ctrl+Alt+D): \\endnote{…} here, its words at the document\'s end (enotez, and \\printendnotes once)', synonyms: ['Endnote', 'Note at the end', 'enotez'],
    when: (app, at) => !!at && !tight(at) && !at.c.ghost, whyNot: () => 'Click in a paragraph\'s words first', run: (app, args, at) => app.insertEndnote(at, args) },
  { id: 'next-footnote', name: 'Next Footnote', kind: 'split', tab: 'references', group: 'footnotes', order: 30, label: 'Next Footnote', icon: ICON.next, title: 'Next Footnote: the caret to the next footnote\'s mark; the arrow: previous, and the endnotes',
    synonyms: ['Go to footnote', 'Previous footnote', 'Next endnote', 'Previous endnote'], when: (app) => app.noteMarks('fn').length > 0, whyNot: () => 'The document has no footnotes',
    run: (app) => app.noteJump('fn', 1), menuItems: (app) => [
      { name: 'Next Footnote', command: 'next-footnote' }, { name: 'Previous Footnote', command: 'previous-footnote', disabled: !app.noteMarks('fn').length },
      { name: 'Next Endnote', command: 'next-endnote', disabled: !app.noteMarks('en').length }, { name: 'Previous Endnote', command: 'previous-endnote', disabled: !app.noteMarks('en').length }] },
  { id: 'previous-footnote', name: 'Previous Footnote', title: 'The caret to the footnote before', when: (app) => app.noteMarks('fn').length > 0, run: (app) => app.noteJump('fn', -1) },
  { id: 'next-endnote', name: 'Next Endnote', title: 'The caret to the next endnote\'s mark', when: (app) => app.noteMarks('en').length > 0, run: (app) => app.noteJump('en', 1) },
  { id: 'previous-endnote', name: 'Previous Endnote', title: 'The caret to the endnote before', when: (app) => app.noteMarks('en').length > 0, run: (app) => app.noteJump('en', -1) },
  { id: 'show-notes', name: 'Show Notes', tab: 'references', group: 'footnotes', order: 40, label: 'Show Notes', icon: ICON.show, title: 'Show Notes: from a footnote\'s mark to its text and back; with endnotes, to the notes at the end',
    synonyms: ['Footnote text', 'Endnotes list'], when: (app) => app.noteMarks('fn').length + app.noteMarks('en').length > 0, whyNot: () => 'The document has no notes', run: (app, args, at) => app.showNotes(at) },
  { id: 'footnote-options', name: 'Footnote and Endnote', tab: 'references', group: 'footnotes', order: 50, icon: ICON.options, title: 'Footnote and Endnote: the numbers\' format, where they start and start again, and turning footnotes into endnotes or back',
    synonyms: ['Footnote options', 'Footnote numbering', 'Restart each page', 'Restart each section', 'Convert footnotes', 'fnsymbol'], when: (app) => app.refsHasPreamble(),
    whyNot: () => 'The main file has no preamble to set it in', run: (app, args) => (args ? app.notesApply(args) : openNotesDialog(app)) },

  // ---- References › Citations & Bibliography
  { id: 'add-source', name: 'Add New Source', tab: 'references', group: 'citations', order: 20, label: 'Add New Source', icon: ICON.source,
    title: 'Add New Source: a book, an article, a web site… as an entry of the project\'s .bib file (refs.bib and the bibliography lines where there are none), and a citation of it here',
    synonyms: ['New source', 'Create source', 'BibTeX entry', 'Add reference'], when: (app) => !app.bibWhyNot(), whyNot: (app) => app.bibWhyNot(), run: (app, args, at) => (args ? app.sourceAdd(args, at) : openSourceForm(app, { at })) },
  { id: 'manage-sources', name: 'Manage Sources', tab: 'references', group: 'citations', order: 30, label: 'Manage Sources', icon: ICON.manage,
    title: 'Manage Sources: the .bib files\' entries, to cite, edit, copy or delete; paste BibTeX to add entries', synonyms: ['Source manager', 'Bibliography sources', 'Paste BibTeX', 'Edit source'],
    when: (app) => !app.bibWhyNot(), whyNot: (app) => app.bibWhyNot(), run: (app) => openSourceManager(app) },
  { id: 'citation-style', name: 'Citation Style', kind: 'menu', tab: 'references', group: 'citations', order: 40, label: 'Style', icon: ICON.style,
    title: 'Citation Style: the style of the citations and the bibliography (biblatex\'s style=, or the .bst of \\bibliographystyle)', synonyms: ['Style', 'APA', 'MLA', 'Chicago', 'IEEE', 'Harvard', 'bibliographystyle', 'Bibliography style'],
    when: (app) => !app.styleWhyNot(), whyNot: (app) => app.styleWhyNot(), run: (app, args, at) => (args && args.style ? app.bibStyle(args.style) : app.bibStyleMenu()) },
  { id: 'bibliography', name: 'Bibliography', kind: 'split', menuWhenOff: true, tab: 'references', group: 'citations', order: 50, label: 'Bibliography', icon: ICON.bib,
    title: 'Bibliography: the list of the works cited, after the paragraph the caret is in; the arrow: its title (Bibliography, References, Works Cited) or take it out',
    synonyms: ['Insert bibliography', 'References', 'Works Cited', 'printbibliography', 'Reference list'], when: (app, at) => !!at && !app.bibWhyNot() && !app.bibAt(),
    whyNot: (app) => app.bibWhyNot() || (app.bibAt() ? 'The document has its bibliography already: the arrow sets its title or takes it out' : NOT_HERE),
    run: (app, args) => app.bibInsert(args && args.title !== undefined ? args.title : null), menuItems: (app) => app.bibItems() },
  { id: 'bibliography-title', name: 'Bibliography title', title: 'The bibliography\'s title: Bibliography, References, Works Cited, or the class\'s own', synonyms: ['Works Cited', 'References title', 'refname'],
    when: (app) => !app.bibWhyNot() && app.bibAt(), whyNot: (app) => app.bibWhyNot() || 'Insert a bibliography first', run: (app, args) => (args && args.title !== undefined ? app.bibRetitle(args.title) : app.refsMenu('bibliography')) },
  { id: 'bibliography-remove', name: 'Remove Bibliography', title: 'Remove Bibliography: its lines taken out', synonyms: ['Delete bibliography'], when: (app) => !app.bibWhyNot() && app.bibAt(), whyNot: (app) => app.bibWhyNot() || 'The document has no bibliography', run: (app) => app.bibRemove() },

  // ---- References › Captions
  { id: 'insert-caption', name: 'Insert Caption', tab: 'references', group: 'captions', order: 10, label: 'Insert Caption', icon: ICON.caption,
    title: 'Insert Caption: a numbered caption and a label for the figure or the table the caret is in (a picture or a table on its own becomes a figure or a table)', synonyms: ['Caption', 'Figure caption', 'Table caption', 'caption'],
    when: (app, at) => !app.captionWhyNot(at), whyNot: (app, at) => app.captionWhyNot(at), run: (app, args, at) => (args ? app.captionWrite(at, args) : openCaptionDialog(app, at)) },
  { id: 'table-of-figures', name: 'Insert Table of Figures', kind: 'split', menuWhenOff: true, tab: 'references', group: 'captions', order: 20, label: 'Table of Figures', icon: ICON.lof,
    title: 'Insert Table of Figures: \\listoffigures after the paragraph the caret is in; the arrow: the list of tables, or take one out', synonyms: ['List of figures', 'List of tables', 'listoffigures', 'listoftables', 'Table of figures'],
    when: (app, at) => !!at && !app.listSpots('listoffigures').length, whyNot: (app) => (app.listSpots('listoffigures').length ? 'The document has its list of figures already' : NOT_HERE),
    run: (app) => app.blockCommand('\\listoffigures'), menuItems: (app) => app.lofItems() },
  { id: 'list-of-tables', name: 'List of Tables', title: 'List of Tables: \\listoftables after the paragraph the caret is in', synonyms: ['listoftables', 'Table of tables'], when: (app, at) => !!at && !app.listSpots('listoftables').length,
    whyNot: (app) => (app.listSpots('listoftables').length ? 'The document has its list of tables already' : NOT_HERE), run: (app) => app.blockCommand('\\listoftables') },
  { id: 'remove-list-of-figures', name: 'Remove List of Figures', synonyms: ['Delete list of figures'], when: (app) => app.listSpots('listoffigures').length > 0, whyNot: () => 'The document has no list of figures', run: (app) => app.listRemove('listoffigures') },
  { id: 'remove-list-of-tables', name: 'Remove List of Tables', synonyms: ['Delete list of tables'], when: (app) => app.listSpots('listoftables').length > 0, whyNot: () => 'The document has no list of tables', run: (app) => app.listRemove('listoftables') },

  // ---- References › Index
  { id: 'mark-entry', name: 'Mark Entry', tab: 'references', group: 'index', order: 10, label: 'Mark Entry', icon: ICON.mark, keys: ['Alt+Shift+X'],
    title: 'Mark Entry (Alt+Shift+X): the selected words as an index entry (\\index{…}): its subentry, a cross reference, a page range, its page in bold or italic; Mark All for every place they stand',
    synonyms: ['Mark index entry', 'Index entry', 'index'], when: (app, at) => textAt(app, at) && !at.c.ghost && at.ctx !== 'ttl', whyNot: () => 'Select the words to index first', run: (app, args, at) => (args ? app.indexMark(at, args) : openMarkEntryDialog(app, at)) },
  { id: 'insert-index', name: 'Insert Index', tab: 'references', group: 'index', order: 20, label: 'Insert Index', icon: ICON.index,
    title: 'Insert Index: \\printindex after the paragraph the caret is in, in its columns (imakeidx); TeX runs makeindex for you, and the page draws it from the entries', synonyms: ['Index', 'printindex', 'makeindex', 'Update index'],
    when: (app, at) => !!at, whyNot: () => NOT_HERE, run: (app, args) => (args ? app.indexInsert(args) : openIndexDialog(app)) },

  // ---- References › Table of Authorities (R4): a second index, imakeidx's, under its categories
  { id: 'mark-citation', name: 'Mark Citation', tab: 'references', group: 'authorities', order: 10, label: 'Mark Citation', icon: ICON.cite, keys: ['Alt+Shift+I'],
    title: 'Mark Citation (Alt+Shift+I): the selected words as a citation of the Table of Authorities, under its category (Cases, Statutes…): \\index[toa]{…}; Mark All for every place it stands',
    synonyms: ['Table of authorities', 'Legal citation', 'Mark authority', 'TA field'], when: (app, at) => textAt(app, at) && !at.c.ghost && at.ctx !== 'ttl' && !app.toaWhyNot(), whyNot: (app) => app.toaWhyNot() || 'Select the citation first',
    run: (app, args, at) => (args ? app.citationMark(at, args) : openMarkCitationDialog(app, at)) },
  { id: 'insert-toa', name: 'Insert Table of Authorities', tab: 'references', group: 'authorities', order: 20, label: 'Insert Table of Authorities', icon: ICON.toa,
    title: 'Insert Table of Authorities: \\printindex[toa] after the paragraph the caret is in, the citations marked under their categories with their pages; TeX runs makeindex for you',
    synonyms: ['Table of authorities', 'TOA', 'Update table of authorities', 'printindex toa'], when: (app, at) => !!at && !app.toaWhyNot(), whyNot: (app) => app.toaWhyNot() || NOT_HERE, run: (app) => app.toaInsert() }
);

// ---- what the commands do ----------------------------------------------------------------------
// A working copy of the files one action changes: each set of edits is worked out on the text as
// the sets before it left it (two edits of one preamble line never overlap), places of interest
// (the caret) move with them, and commit makes one step of history.
class Work {
  constructor(app) { this.app = app; this.t = new Map(); this.marks = []; }
  src(f) { return this.t.has(f) ? this.t.get(f) : this.app.src(f); }
  apply(f, edits) {
    if (!edits || !edits.length) return this;
    const list = edits.map((x) => ({ s: x.s, e: x.e, t: x.t }));
    this.t.set(f, applyEdits(this.src(f), list));
    for (const m of this.marks) if (m.f === f) m.p = mapPos(list, m.p, m.bias);
    return this;
  }
  mark(f, p, bias = 1) { const m = { f, p, bias }; this.marks.push(m); return m; }
  // packages through src/preamble.js on the main file as it stands in the copy
  pkgs(names) { const f = this.app.main; return this.apply(f, usePackages(this.src(f), names, { others: this.app.preambleOthers() })); }
  edits() {
    const out = [];
    for (const [f, b] of this.t) {
      if (!this.app.files.has(f)) { out.push({ f, s: 0, e: 0, t: b }); continue; }
      const d = diffEdit(this.app.src(f), b);
      if (d) out.push({ f, ...d });
    }
    return out;
  }
  commit(caret, kind = 'insert') {
    const ed = this.edits();
    if (!ed.length) return false;
    this.app.closeGroup();
    this.app.removeGhost();
    this.app.commit(ed, caret, kind);
    this.app.closeGroup();
    return true;
  }
}

const eolOf = (t) => (/\r\n/.test(String(t).slice(0, 4000)) ? '\r\n' : '\n');
const texFiles = (app) => [...app.files.keys()].filter((n) => /\.(tex|ltx)$/i.test(n)).slice(0, 200);
// What the commands' when and on read of the project, once for each text of it: a look at the
// caret runs every command's, and on a long document (167 KB of preamble, 3000 paragraphs) reading
// the preamble and every file's body again took 27 to 84 ms a command. The answers are kept while
// the main file is the same and every file holds the same string (compared by reference, as
// para.js's byFiles), so an edit anywhere reads them afresh.
function perText(app, key, fn) {
  let m = app.refsMemo;
  const same = () => {
    if (m.main !== app.main || m.n !== app.files.size) return false;
    let i = 0;
    for (const [n, t] of app.files) { if (m.files[i] !== n || m.files[i + 1] !== t) return false; i += 2; }
    return true;
  };
  if (!m || !same()) {
    const files = [];
    for (const [n, t] of app.files) files.push(n, t);
    m = app.refsMemo = { main: app.main, n: app.files.size, files, vals: new Map() };
  }
  if (!m.vals.has(key)) m.vals.set(key, fn());
  return m.vals.get(key);
}
const SAFE_KEY = /^[A-Za-z0-9:_.\-/+]{1,80}$/;
const textOf = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// a command's end in t from s (its backslash): its name, star, and the [..] and {..} groups that follow
function cmdEnd(t, s, groups = 2) {
  let i = s + 1;
  while (i < t.length && /[A-Za-z@]/.test(t[i])) i++;
  if (t[i] === '*') i++;
  for (let k = 0; k < groups + 1; k++) {
    let j = i;
    while (j < t.length && j - i < 40 && /[ \t]/.test(t[j])) j++;
    if (t[j] !== '[' && t[j] !== '{') break;
    const z = groupClose(t, j);
    if (z < 0) return -1;
    i = z;
    if (t[j] === '{') break;
  }
  return i;
}
function groupClose(t, i, limit = 20000) {
  const open = t[i], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let k = i, z = Math.min(t.length, i + limit); k < z; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return k + 1;
  }
  return -1;
}

export const methods = {
  // ---- shared ------------------------------------------------------------------------------------
  refsWork() { return new Work(this); },
  // a split button's menu opened at its button (or the page) for a command reached without arguments
  refsMenu(id) {
    const c = command(id), n = near(this, 'rc-' + id);
    openMenu(this, n.anchor || n.rect, this.commandMenu(c), { label: c.name });
  },
  // Where text goes at the caret: { f, p, pre } (a blank paragraph's place, with the line breaks
  // that make it a paragraph of its own), or null
  refsSpot(at) {
    const c = at ? at.c : this.caretNow();
    if (!c) return null;
    if (c.ghost && this.ghost) {
      const g = this.ghost, src = this.src(g.f);
      let nl = 0;
      for (let k = g.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nl++;
      return { f: g.f, p: g.pos, pre: '\n'.repeat(Math.max(0, 2 - nl)) };
    }
    return { f: c.f, p: c.collapsed ? c.a : c.b, a: c.a, b: c.b, pre: '' };
  },
  // A command on a line of its own after the block the caret is in (Word puts these at the caret;
  // a paragraph cut in two by one would be another paragraph): \tableofcontents, \listoffigures
  blockCommand(text, w = new Work(this)) {
    const { f, p, pre, post } = this.afterBlockPos();
    const nl = eolOf(this.src(f));
    const t = (pre + text + post).replace(/\n/g, nl);
    const m = w.mark(f, p + t.length - post.length * nl.length, -1);
    w.apply(f, [{ s: p, e: p, t }]);
    return w.commit({ f, p: m.p, bias: -1 });
  },
  // the lines of the body that call a command, in every .tex file: [{ f, s, e }]
  bodySpots(names, opt = false) {
    return perText(this, 'spots ' + names.join(' ') + (opt ? ' opt' : ''), () => {
      const out = [];
      for (const f of texFiles(this)) for (const c of RS.bodyCalls(this.src(f), names, opt)) out.push({ f, s: c.s, e: c.e, name: c.name, opt: c.opt ? this.src(f).slice(c.opt[0], c.opt[1]).trim() : '' });
      return out;
    });
  },
  refsHasPreamble() { return perText(this, 'pre', () => preambleEnd(this.src(this.main)) >= 0); },
  removeSpots(spots) {
    const w = new Work(this);
    const byF = new Map();
    for (const x of spots) { if (!byF.has(x.f)) byF.set(x.f, []); const [s, e] = RS.lineSpan(this.src(x.f), x.s, x.e); byF.get(x.f).push({ s, e, t: '' }); }
    for (const [f, ed] of byF) w.apply(f, ed);
    const c = this.caretNow();
    return w.commit(c && !c.ghost ? { f: c.f, p: mapPos(byF.get(c.f) || [], c.a) } : null, 'format');
  },

  // ---- the table of contents -------------------------------------------------------------------------
  tocSpots() { return this.bodySpots(['tableofcontents']); },
  tocItems() {
    const O = this.model.opts, ch = !!O.chapters, depth = O.tocdepth ?? (ch ? 2 : 3);
    const has = this.tocSpots().length;
    const items = [{ name: 'Insert Table of Contents', title: '\\tableofcontents after this paragraph', disabled: !!has, command: 'table-of-contents' }, null];
    for (let n = 1; n <= 4; n++) items.push({ name: 'Show Levels: ' + n, title: '\\setcounter{tocdepth}{' + (n - (ch ? 1 : 0)) + '}: headings down to ' + ['', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4'][n], radio: true, checked: O.tocdepth != null && depth === n - (ch ? 1 : 0), run: () => this.runCommand('toc-levels', { levels: n }) });
    items.push({ name: 'Levels of the class', title: 'No \\setcounter{tocdepth}: the class\'s own levels (' + (ch ? 3 : 3) + ')', radio: true, checked: O.tocdepth == null, run: () => this.runCommand('toc-levels', { levels: null }) });
    items.push(null, { name: 'Remove Table of Contents', disabled: !has, command: 'toc-remove' });
    return items;
  },
  tocLevels(n) {
    const ch = !!this.model.opts.chapters;
    const w = new Work(this), f = this.main, v = n == null ? null : Math.max(-1, Math.min(5, n - (ch ? 1 : 0)));
    // (where the body sets it, before \tableofcontents, that line is the one TeX reads: review M3)
    const body = texFiles(this).map((g) => [g, RS.bodyCounterCalls(this.src(g), 'tocdepth')]).filter(([, cs]) => cs.length);
    if (body.length) for (const [g, cs] of body) w.apply(g, cs.map((c) => (v == null ? (([a, b]) => ({ s: a, e: b, t: '' }))(RS.lineSpan(this.src(g), c.s, c.e)) : { s: c.v[0], e: c.v[1], t: String(v) })));
    else w.apply(f, RS.setCounterEdits(w.src(f), 'tocdepth', v));
    return w.commit(null, 'format');
  },
  tocRemove() { return this.removeSpots(this.tocSpots()); },
  // Add Text: the heading's level (Heading 1 to 3), none (starred), its title in the contents
  addTextMenu(at) {
    const h = this.headingAt(at);
    if (!h) return;
    const lv = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }[h.cmd] - (this.model.opts.chapters ? -1 : 0);
    const items = [{ name: 'Do Not Show in Table of Contents', title: '\\' + h.cmd + '*{…}: left out of the contents, with no number', checked: h.star, disabled: !h.star && h.short, run: () => this.runCommand('heading-unnumbered') }, null];
    for (let k = 1; k <= 3; k++) items.push({ name: 'Level ' + k, title: 'Heading ' + k, radio: true, checked: !h.star && lv === k, run: () => this.runCommand('style-heading' + k) });
    items.push(null, { name: 'Text in the Table of Contents…', title: 'A short title for the contents: \\' + h.cmd + '[Short]{Long}', disabled: h.star, run: () => openShortTitleDialog(this, at) });
    const n = near(this, 'rc-toc-add-text');
    openMenu(this, n.anchor || n.rect, items, { label: 'Add Text' });
  },
  // \section[Short]{Long}: short is LaTeX already; '' takes it out
  shortTitle(at, short) {
    const h = this.headingAt(at);
    if (!h || h.star) return false;
    const f = at.B.f, src = this.src(f), s = h.s;
    let i = s + 1 + h.cmd.length;
    const w = new Work(this);
    if (src[i] === '[') {
      const z = groupClose(src, i);
      if (z < 0) return false;
      w.apply(f, [{ s: i, e: z, t: short ? '[' + br(short) + ']' : '' }]);
    } else if (short) w.apply(f, [{ s: i, e: i, t: '[' + br(short) + ']' }]);
    return w.commit(null, 'format');
  },

  // ---- notes ----------------------------------------------------------------------------------------
  insertEndnote(at, args) {
    const sp = this.refsSpot(at);
    if (!sp) return false;
    const w = new Work(this), R = this.model.opts.refs || {};
    const text = '\\endnote{' + (args && args.text ? escapeTeX(String(args.text)) : '') + '}';
    const m = w.mark(sp.f, sp.p, -1);
    w.apply(sp.f, [{ s: sp.p, e: sp.p, t: sp.pre + text }]);
    if (!R.endnotes) w.pkgs(['enotez']);
    if (!this.bodySpots(['printendnotes', 'theendnotes']).length) {
      const f = this.main, kind = R.endnotes === 'endnotes' ? '\\theendnotes' : '\\printendnotes';
      w.apply(f, RS.endLines(w.src(f), [kind], ['bibliographystyle', 'bibliography', 'printbibliography', 'printindex', 'renewcommand']));
    }
    const s = m.p + sp.pre.length;
    w.commit({ f: sp.f, p: s + text.length, bias: 1 });
    if (args && args.text) return true;
    const el = this.findAtomEl({ f: sp.f, s, kind: 'en' });
    if (el) { const info = atomOfEl(el); if (info) this.openEndnote(el, info); }
    return true;
  },
  // An endnote's words, edited in a box by its mark (they are printed far from it, at the end)
  openEndnote(el, info) {
    if (info.is == null || info.ie == null) return this.openRaw(el, info);
    const f = info.f;
    const p = this.makePop(el, 'pop-raw pop-en', 'Endnote ' + (info.a.num || ''));
    this.pop.anchorPos = { f, s: info.s, kind: 'en' };
    this.pop.returnCaret = { f, p: info.e, bias: 1 };
    const ta = document.createElement('textarea');
    ta.className = 'code'; ta.id = 'pop-endnote'; ta.setAttribute('aria-label', 'Endnote text'); ta.rows = 3;
    ta.value = this.src(f).slice(info.is, info.ie);
    const note = document.createElement('div'); note.className = 'pop-note';
    note.textContent = 'Printed with the notes at the end (\\printendnotes). LaTeX: & % # _ are written \\& \\% \\# \\_.';
    const row = document.createElement('div'); row.className = 'pop-row';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn ghost sm danger'; del.textContent = 'Delete';
    const done = document.createElement('button'); done.type = 'button'; done.className = 'btn sm'; done.textContent = 'Done';
    const sp = document.createElement('span'); sp.className = 'grow';
    row.append(del, sp, done);
    p.append(ta, note, row);
    const apply = this.liveRange(f, info.is, info.ie);
    let timer = 0;
    const push = () => { clearTimeout(timer); if (this.pop) apply(ta.value); };
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(push, 220); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); push(); this.closePop(); } });
    done.addEventListener('click', () => { push(); this.closePop(); });
    del.addEventListener('click', () => { push(); const R = this.pop.range; this.closePop(true); const s = R.s - (info.is - info.s); this.commit([{ f, s, e: R.e + 1, t: '' }], { f, p: s }, 'del-atom'); });
    this.positionPop();
    ta.focus();
  },
  // the marks of the footnotes (fn) or the endnotes (en) on the page, in its order
  noteMarks(kind) { return this.root ? [...this.root.querySelectorAll(kind === 'en' ? 'sup.a-en' : 'sup.a-fn')] : []; },
  noteJump(kind, dir) {
    const marks = this.noteMarks(kind);
    if (!marks.length) return false;
    const s = getSelection();
    let k = -1;
    if (s.rangeCount && this.root.contains(s.anchorNode)) {
      const r = s.getRangeAt(0);
      // (the first mark after the caret, or the last before it)
      k = dir > 0 ? marks.findIndex((m) => r.comparePoint(m, 0) > 0) : marks.map((m) => r.comparePoint(m, 0) < 0).lastIndexOf(true);
      // (just after a mark, Previous goes to the one before it)
      if (dir < 0 && k >= 0 && this.nextTo(marks[k], r)) k--;
      // (a caret in a footnote's text at the page's foot: from its own mark)
      const fn = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('.fn');
      if (fn) { const own = marks.findIndex((m) => m.textContent === (fn.querySelector('.fnn') || {}).textContent && m.closest('.page') === fn.closest('.page')); if (own >= 0) k = own + dir; }
    } else k = dir > 0 ? 0 : marks.length - 1;
    if (k < 0 || k >= marks.length) { this.toast(dir > 0 ? 'No more ' + (kind === 'en' ? 'endnotes' : 'footnotes') + ' after this' : 'No ' + (kind === 'en' ? 'endnotes' : 'footnotes') + ' before this'); return false; }
    const m = marks[k];
    const r = document.createRange();
    r.setStartAfter(m); r.collapse(true);
    this.root.focus({ preventScroll: true });
    s.removeAllRanges(); s.addRange(r);
    m.scrollIntoView({ block: 'center' });
    m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 900);
    return true;
  },
  // whether a caret r stands just before or just after a mark m on the page
  nextTo(m, r) {
    const a = document.createRange(), b = document.createRange();
    a.setStartBefore(m); b.setStartAfter(m);
    const same = (x) => r.compareBoundaryPoints(Range.START_TO_START, x) === 0;
    if (same(a) || same(b)) return true;
    // (a caret at the end of the text node before the mark, or at the start of the one after it)
    const n = r.startContainer;
    return n.nodeType === 3 && ((r.startOffset === n.data.length && (n.parentElement === m.previousSibling || n === m.previousSibling || n.parentElement.nextElementSibling === m)) || (r.startOffset === 0 && (n.parentElement === m.nextSibling || n === m.nextSibling || n.parentElement.previousElementSibling === m)));
  },
  showNotes(at) {
    const s = getSelection();
    const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    // in a footnote's text: back to its mark
    const fn = node && node.closest && node.closest('.fn');
    if (fn) {
      const num = (fn.querySelector('.fnn') || {}).textContent;
      const m = this.noteMarks('fn').find((x) => x.textContent === num && x.closest('.page') === fn.closest('.page'));
      if (m) { const r = document.createRange(); r.setStartAfter(m); r.collapse(true); s.removeAllRanges(); s.addRange(r); m.scrollIntoView({ block: 'center' }); return true; }
    }
    // by a footnote's mark: to its text; else the endnotes, or the first footnote
    const fm = this.noteMarks('fn'), em = this.noteMarks('en');
    const near = (list) => (s.rangeCount ? list.find((m) => this.nextTo(m, s.getRangeAt(0))) || null : null);
    const m = near(fm) || (!em.length ? fm[0] : null);
    if (m) { const info = atomOfEl(m); if (info) { this.gotoFootnote(m, info); return true; } }
    const list = this.root.querySelector('.en-e');
    if (list) { list.scrollIntoView({ block: 'center' }); list.classList.add('flash'); setTimeout(() => list.classList.remove('flash'), 900); return true; }
    if (em.length) { em[0].scrollIntoView({ block: 'center' }); return true; }
    return false;
  },
  // The Footnote and Endnote dialog's Apply: { style, start, restart, enStyle, convert: 'en'|'fn' }
  notesApply(o) {
    const w = new Work(this), f = this.main, ch = !!this.model.opts.chapters;
    const R = (this.model.opts.refs || {}).fn || {};
    // (\fnsymbol counts nine, \alph 26: past them TeX stops, "Counter too large"; review H7)
    const style = o.style || R.style, restart = o.restart || R.restart, cap = style === 'fnsymbol' ? 9 : /^alph$/i.test(style) ? 26 : 0;
    if (cap && restart !== 'page') {
      const most = this.notesPerScope(restart) + Math.max(0, parseInt(o.start ?? R.start, 10) || 1) - 1;
      if (most > cap) { this.toast((style === 'fnsymbol' ? 'Symbols' : 'Letters') + ' number ' + cap + ' footnotes at most and this document has ' + most + (restart === 'continuous' ? '' : ' in one ' + restart.replace(/^within-/, '')) + ': restart them each page, or pick numbers'); return false; }
    }
    if (o.style) w.apply(f, RS.counterStyleEdits(w.src(f), 'footnote', o.style));
    if (o.enStyle) {
      // (symbols and letters run out as for footnotes: nine and 26 endnotes, which never restart)
      const ecap = o.enStyle === 'fnsymbol' ? 9 : /^alph$/i.test(o.enStyle) ? 26 : 0;
      const n = ecap ? this.noteMarks('en').length : 0;
      if (ecap && n > ecap) { this.toast((o.enStyle === 'fnsymbol' ? 'Symbols' : 'Letters') + ' number ' + ecap + ' endnotes at most and this document has ' + n + ': pick numbers'); return false; }
      w.apply(f, RS.enoteFormatEdits(w.src(f), o.enStyle, (this.model.opts.refs || {}).endnotes));
    }
    if (o.start != null) { const n = Math.max(1, Math.min(9999, parseInt(o.start, 10) || 1)); w.apply(f, RS.setCounterEdits(w.src(f), 'footnote', n > 1 ? n - 1 : null)); }
    if (o.restart) { const r = RS.fnRestartEdits(w.src(f), o.restart, ch); w.apply(f, r.edits); if (r.pkg) w.pkgs(r.pkg); }
    if (o.convert === 'en' || o.convert === 'fn') {
      const from = o.convert === 'en' ? 'footnote' : 'endnote', to = o.convert === 'en' ? 'endnote' : 'footnote';
      for (const g of texFiles(this)) w.apply(g, RS.noteNames(w.src(g), from).map((x) => ({ ...x, t: to })));
      const R = this.model.opts.refs || {};
      if (o.convert === 'en') {
        if (!R.endnotes) w.pkgs(['enotez']);
        if (!this.bodySpots(['printendnotes', 'theendnotes']).length) w.apply(f, RS.endLines(w.src(f), [R.endnotes === 'endnotes' ? '\\theendnotes' : '\\printendnotes'], ['bibliographystyle', 'bibliography', 'printbibliography', 'printindex', 'renewcommand']));
      }
    }
    const c = this.caretNow();
    return w.commit(c && !c.ghost ? { f: c.f, p: c.a } : null, 'format');
  },

  // the most footnotes one numbering holds: all of them, or per section or chapter where they restart
  notesPerScope(restart) {
    const at = /section/.test(restart) ? 'section' : /chapter/.test(restart) ? 'chapter' : null;
    let most = 0, n = 0;
    for (const g of texFiles(this)) {
      const t = stripComments(this.src(g).slice(0, 4000000));
      // (\footnotemark steps the counter as \footnote does, review V8)
      for (let re = /\\(footnote|footnotemark|section|chapter)(\*?)(?![A-Za-z@])/g, m, k = 0; (m = re.exec(t)) && k < 100000; k++) {
        if (m[1] === 'footnote' || m[1] === 'footnotemark') { if (!m[2]) most = Math.max(most, ++n); } else if (!m[2] && at && (m[1] === at || (at === 'section' && m[1] === 'chapter'))) n = 0;
      }
    }
    return most;
  },
  // ---- sources, the style, the bibliography ------------------------------------------------------------
  // the bibliography of the main file: biblatex, natbib, BibTeX or a list written by hand
  bibState() { return perText(this, 'bib', () => RS.bibSetup(this.src(this.main), this.preambleOthers())); },
  bibWhyNot() {
    if (!this.refsHasPreamble()) return 'The main file has no preamble';
    const B = this.bibState();
    return B.system === 'thebibliography' ? 'This document\'s bibliography is written by hand (thebibliography): edit its \\bibitem entries on the page' : '';
  },
  styleWhyNot() { return this.bibWhyNot() || (!this.bibAt() && !this.bibState().biblatex ? 'Insert a bibliography first (References › Bibliography)' : ''); },
  bibAt() { const B = this.bibState(); return B.print ? true : this.bodySpots(['bibliography', 'printbibliography'], true).length > 0; },
  bibStyleMenu() {
    const B = this.bibState(), list = RS.BIB_STYLES[B.system] || RS.BIB_STYLES.bibtex;
    const items = list.map(([v, name, t]) => ({ name, title: t + (B.system === 'biblatex' ? ' (style=' + v + ')' : ' (\\bibliographystyle{' + v + '})'), radio: true, checked: B.style === v.replace(/:numbers$/, '') && (B.system !== 'natbib' || !!B.numbers === /:numbers$/.test(v)), run: () => this.runCommand('citation-style', { style: v }) }));
    if (B.style && !list.some(([v]) => v.replace(/:numbers$/, '') === B.style)) items.unshift({ name: B.style, title: 'This document\'s own style', radio: true, checked: true, disabled: true }, null);
    const n = near(this, 'rc-citation-style');
    openMenu(this, n.anchor || n.rect, items, { label: 'Citation Style' });
  },
  bibStyle(style) {
    // (in the main file, or the .tex file that has \bibliographystyle)
    const files = [this.main, ...texFiles(this).filter((x) => x !== this.main)];
    const w = new Work(this);
    for (const f of files) { const ed = RS.bibStyleEdits(w.src(f), style, f === this.main ? this.preambleOthers() : []); if (ed.length) { w.apply(f, ed); break; } }
    return w.commit(null, 'format');
  },
  // The bibliography's lines where the document has none: natbib with plainnat and refs.bib for
  // a document with no system yet; biblatex's \printbibliography; BibTeX's two lines. title: a
  // title ('Works Cited'), null the class's own.
  bibInsert(title, w = new Work(this), place = 'caret') {
    const B = this.bibState(), ch = !!this.model.opts.chapters;
    const nl = eolOf(this.src(this.main));
    const files = sourceFiles(this), file = files.length ? files[0].name : 'refs.bib';
    const name = file.replace(/\.bib$/i, '');
    let lines;
    if (B.biblatex) {
      if (!B.resources.length) w.apply(this.main, RS.preambleLine(w.src(this.main), '\\addbibresource{' + file + '}'));
      lines = ['\\printbibliography'];
    } else {
      if (!B.natbib && !B.style) w.pkgs(['natbib']);
      lines = [...(B.styleCall ? [] : ['\\bibliographystyle{' + (B.natbib || !B.style ? 'plainnat' : B.style) + '}']), '\\bibliography{' + name + '}'];
    }
    if (place === 'end') { const f = this.main; w.apply(f, RS.endLines(w.src(f), lines, [])); } else {
      const { f, p, pre, post } = this.afterBlockPos();
      w.apply(f, [{ s: p, e: p, t: (pre + lines.join('\n') + post).replace(/\n/g, eolOf(this.src(f))) }]);
    }
    if (!files.length && !this.files.has(file)) w.t.set(file, '');
    if (title) { const f = this.main; w.apply(f, RS.bibTitleEdits(w.src(f), title, ch, this.preambleOthers())); }
    void nl;
    return place === 'end' ? w : w.commit(null, 'insert');
  },
  bibRemove() {
    const B = this.bibState(), spots = this.bodySpots(['bibliography', 'printbibliography', ...(B.biblatex ? [] : ['bibliographystyle'])], true);
    return this.removeSpots(spots.filter((x) => x.name !== 'bibliographystyle' || preambleEnd(this.src(x.f)) < x.s));
  },
  bibItems() {
    const has = this.bibAt(), ch = !!this.model.opts.chapters;
    const cur = RS.bibTitle(this.src(this.main), ch, this.preambleOthers());
    const dflt = this.bibState().biblatex ? (ch ? 'Bibliography' : 'References') : ch ? 'Bibliography' : 'References';
    const set = (t) => () => this.runCommand(has ? 'bibliography-title' : 'bibliography', { title: t === dflt ? null : t });
    return [...['Bibliography', 'References', 'Works Cited'].map((t) => ({ name: t, title: has ? 'Its title: ' + t : 'A bibliography titled ' + t + ' after this paragraph', radio: has, checked: has && (cur ? cur === t : t === dflt), run: set(t) })),
      null, { name: 'Remove Bibliography', disabled: !has, command: 'bibliography-remove' }];
  },
  bibRetitle(title) {
    const w = new Work(this), f = this.main, ch = !!this.model.opts.chapters;
    w.apply(f, RS.bibTitleEdits(w.src(f), title, ch, this.preambleOthers()));
    return w.commit(null, 'format');
  },
  // a new source: { type, fields (typed text), key?, file?, cite } through the form or an agent
  sourceAdd(o, at) { return addSource(this, o, at); },

  // ---- captions and the lists of figures and tables ---------------------------------------------------
  // What Insert Caption acts on where the caret is: { kind, f, B, mode: 'float'|'wrap', ... }, or
  // { why } when it cannot
  captionTarget(at) {
    if (!at || !at.B || at.c.ghost) return { why: 'Put the caret in a figure, a picture or a table first' };
    const B = at.B, f = B.f, src = this.src(f), off = B.s;
    if (B.e - B.s > 200000) return { why: 'This block is too long to read' };
    if (B.items.some((x) => x.region && x.cols > 1)) return { why: 'A figure or a table cannot float inside columns (multicols): its caption would stop TeX' };
    const text = src.slice(B.s, B.e);
    const nodes = parse(text).filter((n) => !(n.t === 'text' && !text.slice(n.s, n.e).trim()) && n.t !== 'comment' && n.t !== 'par');
    if (nodes.length !== 1) return { why: 'Put the caret in a figure, a picture or a table first' };
    const n = nodes[0];
    // (a subfigure's or a subtable's caption is its own: the float may still want one, review L6)
    const has = (ns, name) => ns && ns.some((x) => (x.t === 'cmd' && x.name === name) || (x.nodes && !(x.t === 'env' && /^sub(figure|table)$/.test(x.name)) && has(x.nodes, name)) || (x.t !== 'env' && x.args && x.args.some((a) => a && a.nodes && has(a.nodes, name))));
    if (n.t === 'env' && /^(figure|table)\*?$/.test(n.name)) {
      if (has(n.nodes, 'caption')) return { why: 'This ' + n.name.replace('*', '') + ' has its caption: type in it on the page' };
      return { kind: n.name.replace('*', ''), f, mode: 'float', s: off + n.s, be: off + n.be, es: off + n.es, e: off + n.e };
    }
    const pic = (ns) => ns.filter((x) => !(x.t === 'text' && !text.slice(x.s, x.e).trim()) && x.t !== 'comment' && x.t !== 'par' && !(x.t === 'cmd' && /^(centering|label)$/.test(x.name)));
    if (n.t === 'env' && n.name === 'center') {
      const inner = pic(n.nodes || []);
      if (inner.length === 1 && ((inner[0].t === 'cmd' && inner[0].name === 'includegraphics') || (inner[0].t === 'env' && /^(tabular|tabularx|tabular\*)$/.test(inner[0].name))))
        return { kind: inner[0].t === 'cmd' ? 'figure' : 'table', f, mode: 'center', s: off + n.s, be: off + n.be, es: off + n.es, e: off + n.e };
    }
    if ((n.t === 'cmd' && n.name === 'includegraphics') || (n.t === 'env' && /^(tabular|tabularx|tabular\*)$/.test(n.name)))
      return { kind: n.t === 'cmd' ? 'figure' : 'table', f, mode: 'wrap', s: off + n.s, e: off + n.e };
    if (n.t === 'env' && n.name === 'longtable') return { why: 'A longtable takes its caption inside it, as its first row: \\caption{…}\\\\' };
    return { why: 'Put the caret in a figure, a picture or a table first' };
  },
  captionWhyNot(at) { const T = this.captionTarget(at); return T.why || ''; },
  // { text (typed), position: 'below'|'above', label: key or '' , numbering: 'plain'|'section'|'chapter',
  //   kind: the float ('figure', 'table' or one of the document's own), newLabel: the name of a new
  //   one (Word's New Label: newfloat's \\DeclareFloatingEnvironment), exclude: the number alone
  //   (Word's Exclude label from caption: caption's \\captionsetup{labelformat=nolabel} in the float) }
  captionWrite(at, o) {
    const T = this.captionTarget(at);
    if (T.why) { this.toast(T.why); return false; }
    const f = T.f, src = this.src(f), nl = eolOf(src), w = new Work(this);
    const own = (this.model.opts.refs || {}).floats || {};
    const kind = o.kind == null ? T.kind : String(o.kind);
    const newName = o.newLabel != null ? String(o.newLabel).replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    if (kind !== T.kind && !/^(figure|table)$/.test(kind) && !(Object.prototype.hasOwnProperty.call(own, kind) || (newName && /^[a-z]{1,30}$/.test(kind) && newName.toLowerCase().replace(/[^a-z]/g, '') === kind))) { this.toast('No such label: make it with New Label first'); return false; }
    if (this.model.opts.cls === 'beamer' && (newName || o.exclude)) { this.toast('Beamer has no floats of its own: its figures are not numbered by the caption package'); return false; }
    const words = escapeTeX(textOf(o.text));
    const first = '\\caption{' + words + '}';
    const cap = (o.exclude ? '\\captionsetup{labelformat=nolabel}' + nl : '') + first + (o.label && SAFE_KEY.test(o.label) ? nl + '\\label{' + o.label + '}' : '');
    const above = o.position ? o.position === 'above' : T.kind === 'table';
    const indentOf = (p) => { const ls = src.lastIndexOf('\n', p - 1) + 1; return /^[ \t]*/.exec(src.slice(ls, p))[0]; };
    const lines = (ind) => cap.split(nl).map((l) => ind + l).join(nl);
    // (another label for a float that is there: its name changed at its begin and its end, its
    // star kept, in the same step as its caption)
    let rename = [];
    if (T.mode === 'float' && kind !== T.kind) {
      const bm = /^\\begin\s*\{(figure|table)(\*?)\}/.exec(src.slice(T.s, T.be)), em = /\\end\s*\{(figure|table)(\*?)\}$/.exec(src.slice(T.es, T.e));
      if (!bm || !em) { this.toast('This float\'s label cannot change here: change its environment in the source'); return false; }
      const bs = T.s + bm[0].indexOf('{') + 1, es = T.es + em.index + em[0].indexOf('{') + 1;
      rename = [{ s: bs, e: bs + bm[1].length, t: kind }, { s: es, e: es + em[1].length, t: kind }];
    }
    if (T.mode === 'float') {
      const inner = src.slice(T.be, T.es);
      const ind = (/\n([ \t]*)\S/.exec(inner) || [, ''])[1];
      if (above) {
        // (after the begin line's options, and after \centering where it comes first)
        const m = /^(\s*\[[^\]\n]{0,40}\])?([ \t]*\r?\n)?([ \t]*\\centering\b[ \t]*\r?\n)?/.exec(inner);
        const p = T.be + m[0].length;
        w.apply(f, [{ s: p, e: p, t: (/\n$/.test(src.slice(T.be, p)) ? '' : nl) + lines(ind) + nl }, ...rename]);
      } else {
        let ls = src.lastIndexOf('\n', T.es - 1) + 1, atLine = ls > T.be && !src.slice(ls, T.es).trim();
        // (a lone \label at the float's end goes after the caption, so \ref gives the figure's number: review L5)
        const lab = /\\label\s*\{[^{}\n]{0,200}\}\s*$/.exec(src.slice(T.be, T.es));
        if (lab) { const at = T.be + lab.index, l2 = src.lastIndexOf('\n', at - 1) + 1; if (l2 > T.be && !src.slice(l2, at).trim()) { ls = l2; atLine = true; } }
        const p = atLine ? ls : T.es;
        w.apply(f, [{ s: p, e: p, t: (atLine ? '' : nl) + lines(ind) + nl + (atLine ? '' : indentOf(T.s)) }, ...rename]);
      }
    } else {
      const env = kind, ind = indentOf(T.s);
      const head = '\\begin{' + env + '}[htbp]' + nl + ind + '\\centering';
      if (T.mode === 'center') {
        // (center becomes the float, \centering inside it: the picture's own lines stay as they are)
        const ls = src.lastIndexOf('\n', T.es - 1) + 1, atLine = ls > T.be && !src.slice(ls, T.es).trim();
        const ed = [{ s: T.s, e: T.be, t: head + (above ? nl + lines(ind) : '') }];
        ed.push(above ? { s: T.es, e: T.e, t: '\\end{' + env + '}' } : { s: atLine ? ls : T.es, e: T.e, t: (atLine ? '' : nl) + lines(ind) + nl + ind + '\\end{' + env + '}' });
        w.apply(f, ed);
      } else {
        const body = src.slice(T.s, T.e);
        w.apply(f, [{ s: T.s, e: T.e, t: head + nl + (above ? lines(ind) + nl : '') + ind + body + (above ? '' : nl + lines(ind)) + nl + ind + '\\end{' + env + '}' }]);
      }
    }
    if (o.numbering) this.captionNumbering(w, kind, o.numbering);
    // (R4: a new label's float and the number alone's format, in the preamble, packages once)
    if (newName && !Object.prototype.hasOwnProperty.call((this.model.opts.refs || {}).floats || {}, kind)) { w.pkgs(['newfloat']); w.apply(this.main, RS.newFloatEdits(w.src(this.main), kind, escapeTeX(newName))); }
    if (o.exclude) { w.pkgs(['caption']); w.apply(this.main, RS.noLabelFormatEdits(w.src(this.main))); }
    // (the caret at the caption's end, as Word leaves it)
    const k = w.src(f).indexOf(first, Math.max(0, T.s - 4));
    w.commit(k >= 0 ? { f, p: k + first.length - 1, bias: -1 } : null);
    return true;
  },
  // 1, 2, 3 or 1.1, 1.2 (by section or chapter): \counterwithin{figure}{section}, or taken out
  captionNumbering(w, kind, how) {
    const f = this.main, src = w.src(f), ch = !!this.model.opts.chapters;
    const t = stripComments(src.slice(0, Math.max(0, preambleEnd(src))));
    const calls = [...RS.cmdCalls(t, 'counterwithin', 2), ...RS.cmdCalls(t, 'numberwithin', 2), ...RS.cmdCalls(t, 'counterwithout', 2)].filter((c) => t.slice(c.args[0][0], c.args[0][1]).trim() === kind);
    const want = how === 'section' || how === 'chapter' ? how : null;
    // (each call by its name: \counterwithin and amsmath's \numberwithin number within, review M1)
    const nameOf = (c) => /^\\([A-Za-z]+)/.exec(t.slice(c.s, c.s + 20))[1];
    const ok = calls.some((c) => nameOf(c) !== 'counterwithout' && !c.star && t.slice(c.args[1][0], c.args[1][1]).trim() === want);
    if (!want && !calls.some((c) => nameOf(c) !== 'counterwithout' && !c.star) && (!ch || calls.some((c) => nameOf(c) === 'counterwithout'))) return;
    const dflt = ch ? 'chapter' : null;
    if ((want === dflt && !calls.length) || ok) return;
    const ed = calls.map((c) => { const [s, e] = RS.lineSpan(src, c.s, c.e); return { s, e, t: '' }; });
    w.apply(f, ed);
    if (want !== dflt) w.apply(f, RS.preambleLine(w.src(f), want ? '\\counterwithin{' + kind + '}{' + want + '}' : '\\counterwithout{' + kind + '}{chapter}'));
  },
  listSpots(name) { return this.bodySpots([name]); },
  lofItems() {
    const f = this.listSpots('listoffigures').length, t = this.listSpots('listoftables').length;
    return [{ name: 'List of Figures', title: '\\listoffigures after this paragraph', disabled: !!f, command: 'table-of-figures' },
      { name: 'List of Tables', title: '\\listoftables after this paragraph', disabled: !!t, command: 'list-of-tables' },
      null, { name: 'Remove List of Figures', disabled: !f, command: 'remove-list-of-figures' }, { name: 'Remove List of Tables', disabled: !t, command: 'remove-list-of-tables' }];
  },
  listRemove(name) { return /^listof(figures|tables)$/.test(name) ? this.removeSpots(this.listSpots(name)) : false; },
  // the page numbers of the lists of figures and tables (by their captions) and of the index
  // (by where each \index stands), from the pages as they are laid out: never stale
  refPages(plan) {
    const caps = this.root.querySelectorAll('.toc-p[data-cap]'), ixs = this.root.querySelectorAll('.idx-p');
    this.fnPerPage();
    if (!caps.length && !ixs.length) return;
    const capPage = new Map();
    plan.forEach((pg, k) => {
      for (const e of pg.entries) {
        const it = e.it;
        if (!it || !it.el) continue;
        if (caps.length) for (const c of it.el.querySelectorAll('[data-cap]')) if (!capPage.has(c.dataset.cap)) capPage.set(c.dataset.cap, k + 1);
      }
    });
    for (const c of caps) c.textContent = capPage.has(c.dataset.cap) ? String(capPage.get(c.dataset.cap)) : '';
    // (an entry's page: the page holding the words just before it, a paragraph cut over two pages
    // giving each part its own; blocks by file, searched by halves: review M9, L12)
    const pageNo = new Map([...this.root.querySelectorAll('.page')].map((p, k) => [p, k + 1]));
    const byF = new Map();
    for (const B of this.renderer.blocks) { if (!byF.has(B.f)) byF.set(B.f, []); byF.get(B.f).push(B); }
    for (const L of byF.values()) L.sort((a, b) => a.s - b.s);
    const starts = new Map();
    const pageOf = (f, s) => {
      const L = byF.get(f);
      if (!L) return null;
      let lo = 0, hi = L.length - 1, k = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].s <= s) { k = m; lo = m + 1; } else hi = m - 1; }
      if (k < 0 || s > L[k].e) return null;
      const B = L[k];
      if (!starts.has(B)) starts.set(B, B.segs.map((g, i) => [g && g.rel && g.rel.length && (g.f || B.f) === f ? B.base + g.rel[0] : -1, i]).filter((x) => x[0] >= 0).sort((a, b) => a[0] - b[0]));
      const S = starts.get(B);
      let j = -1;
      for (let a = 0, b = S.length - 1; a <= b;) { const m = (a + b) >> 1; if (S[m][0] <= s) { j = m; a = m + 1; } else b = m - 1; }
      // (a segment cut over two pages is two spans of one data-g: the one holding the character
      // just before the entry, counted along them, review V5)
      let el = null;
      if (j >= 0) {
        const g = B.segs[S[j][1]], spans = this.root.querySelectorAll('span.t[data-g="' + B.id + '.' + S[j][1] + '"]');
        let ci = 0;
        if (g && g.rel) { const n = g.rel.length >> 1; while (ci < n && B.base + g.rel[2 * ci] < s) ci++; }
        let at = 0;
        for (const sp of spans) { el = sp; at += sp.textContent.length; if (at >= ci) break; }
      }
      el = el || this.root.querySelector('[data-b="' + B.id + '"]');
      const pg = el && el.closest('.page');
      return pg ? pageNo.get(pg) || null : null;
    };
    // (an index row's entries from the model as it is now, the page's block reused or not)
    const rows = new Map(), RB = this.renderer.blocks;
    for (const x of ixs) {
      const it = x.closest('.it'), B = it && BLOCKS.get(+it.dataset.b);
      if (!B || rows.has(B)) continue;
      const i = RB.indexOf(B), mu = i >= 0 ? this.model.blocks[i] : null, ix = mu && mu.items.find((y) => y.type === 'idx' && !y.notes);
      rows.set(B, ix ? ix.rows : []);
    }
    for (const x of ixs) {
      const it = x.closest('.it'), R = rows.get(it && BLOCKS.get(+it.dataset.b)) || [], row = R[+x.dataset.row];
      const refs = row ? row.pages.map((p) => [p.f, p.s, p.fmt, p.range]) : [];
      const pages = [], ranges = [];
      let open = null;
      for (const [f, s, fmt, range] of refs.slice(0, 500)) {
        const n = pageOf(f, s);
        if (n == null) continue;
        if (range === 'open') open = { n, fmt };
        else if (range === 'close' && open) { ranges.push({ t: open.n === n ? String(n) : open.n + '–' + n, fmt: open.fmt, n: open.n }); open = null; } else pages.push({ page: n, fmt });
      }
      const list = [...RS.pageList(pages).map((p) => ({ ...p, n: parseInt(p.t, 10) })), ...ranges].sort((a, b) => a.n - b.n);
      x.replaceChildren();
      // (R4: right aligned, the first number comes after the leader, as makeindex's \dotfill puts it)
      const right = !!(it && it.classList.contains('idx-right'));
      for (const [k, p] of list.entries()) {
        x.append(right && k === 0 ? '' : ', ');
        const tag = /^(textbf|bfseries)$/.test(p.fmt) ? 'b' : /^(textit|emph|itshape)$/.test(p.fmt) ? 'i' : 'span';
        const el = document.createElement(tag); el.textContent = p.t; x.append(el);
      }
    }
  },

  // footmisc's perpage (Restart each page): the marks and the notes of each page numbered from 1
  // as the pages are laid out; the model's numbers kept to go back to (review M5)
  fnPerPage() {
    const R = ((this.model && this.model.opts.refs) || {}).fn || {}, per = R.restart === 'page';
    // (\thanks' marks are the title's, not the footnotes': left as they are, review V4)
    const all = this.root.querySelectorAll('sup.a-fn:not(.fn-th), .fn:not(.fn-th) .fnn');
    if (!per) { for (const x of all) if (x.dataset.n0 != null) { x.textContent = x.dataset.n0; delete x.dataset.n0; } return; }
    const style = R.style;
    const fmt = (n) => (style === 'roman' ? roman(n) : style === 'Roman' ? roman(n).toUpperCase() : style === 'alph' ? String.fromCharCode(96 + n) : style === 'Alph' ? String.fromCharCode(64 + n) : style === 'fnsymbol' ? ['*', '\u2020', '\u2021', '\u00a7', '\u00b6', '\u2016', '**', '\u2020\u2020', '\u2021\u2021'][n - 1] || String(n) : String(n));
    for (const pg of this.root.querySelectorAll('.page')) {
      const marks = pg.querySelectorAll('sup.a-fn:not(.fn-th)'), notes = pg.querySelectorAll('.fn:not(.fn-th) .fnn');
      marks.forEach((m, k) => { if (m.dataset.n0 == null) m.dataset.n0 = m.textContent; m.textContent = fmt(k + 1); });
      notes.forEach((m, k) => { if (m.dataset.n0 == null) m.dataset.n0 = m.textContent; m.textContent = fmt(k + 1); });
    }
  },

  // ---- cross references -------------------------------------------------------------------------
  // What a reference can point to, by kind: [{ kind, text, key (its label, or null), add (where a
  // label goes when it has none) }]
  refTargets(kind) {
    const M = this.model, labels = [...M.labels.entries()];
    const keyFor = (k, num) => { const L = labels.find(([, v]) => v.kind === k && v.num === num && num); return L ? L[0] : null; };
    const after = (f, p) => { const m = /^\s*\\label\s*\{([^{}\n]{1,200})\}/.exec(this.src(f).slice(p, p + 300)); return m ? m[1].trim() : null; };
    const NAMES = { '-1': 'part', 0: 'chapter', 1: 'section', 2: 'subsection', 3: 'subsubsection', 4: 'paragraph', 5: 'subparagraph' };
    if (kind === 'heading') {
      return (M.headings || []).filter((h) => h.f && h.s >= 0 && h.e > h.s && this.files.has(h.f)).map((h) => {
        const inner = (/\\label\s*\{([^{}\n]{1,200})\}/.exec(this.src(h.f).slice(h.s, h.e)) || [])[1];
        const key = inner || after(h.f, h.e) || (h.num ? keyFor(NAMES[h.level], h.num) : null);
        return { kind, text: (h.num ? h.num + ' ' : '') + h.text, num: h.num, key, add: { f: h.f, p: h.e, prefix: h.level <= 0 ? 'chap:' : 'sec:', words: h.text } };
      });
    }
    if (kind === 'figure' || kind === 'table') {
      return (M.captions || []).filter((c) => c.kind === kind).map((c) => {
        const f = c.f, s = c.s, src = this.src(f), e = cmdEnd(src, s);
        const key = (e > 0 && after(f, e)) || keyFor(kind, c.num);
        return { kind, text: (kind === 'figure' ? 'Figure ' : 'Table ') + c.num + ': ' + c.text, num: c.num, key, add: e > 0 ? { f, p: e, prefix: kind === 'figure' ? 'fig:' : 'tab:', words: c.text } : null };
      });
    }
    if (kind === 'equation') return labels.filter(([, v]) => v.kind === 'equation').map(([k, v]) => ({ kind, text: 'Equation (' + v.num + ')', num: v.num, key: k }));
    return labels.map(([k, v]) => ({ kind: 'label', text: k + (v.num ? ' (' + v.kind + ' ' + v.num + ')' : ''), num: v.num, key: k }));
  },
  // which reference commands the document defines: \ref and \pageref always; \cref with cleveref,
  // \autoref with hyperref, \vref with varioref, \eqref with amsmath
  refForms(kind) {
    const src = this.src(this.main), others = this.preambleOthers(), end = preambleEnd(src);
    const has = (n) => hasPackage(src, n, end, others) || provides(src, n, others, end);
    const out = [['ref', 'Number (\\ref)'], ['pageref', 'Page number (\\pageref)']];
    if (kind === 'equation' && (has('amsmath') || has('mathtools'))) out.unshift(['eqref', 'Number in parentheses (\\eqref)']);
    if (has('cleveref')) out.push(['cref', 'With its name: “section 2” (\\cref)'], ['Cref', 'With its name, capital: “Section 2” (\\Cref)']);
    else if (has('hyperref')) out.push(['autoref', 'With its name: “Section 2” (\\autoref)']);
    if (has('varioref')) out.push(['vref', 'With above or below, or its page (\\vref)']);
    return out;
  },
  // { target: { key | add, ... } or a label's key, form: 'ref'|'pageref'|..., kind }
  crossRefWrite(at, o) {
    const sp = this.refsSpot(at);
    if (!sp) return false;
    let T = o.target;
    if (typeof T === 'string') T = { key: T };
    if (!T) return false;
    const forms = this.refForms(o.kind || 'label').map(([v]) => v);
    const form = forms.includes(o.form) ? o.form : 'ref';
    const w = new Work(this);
    const m = w.mark(sp.f, sp.p, 1);
    let key = T.key;
    if (!key) {
      if (!T.add) return false;
      key = RS.labelKey(T.add.prefix, T.add.words, new Set(this.model.labels.keys()));
      w.apply(T.add.f, [{ s: T.add.p, e: T.add.p, t: '\\label{' + key + '}' }]);
    }
    if (!SAFE_KEY.test(key)) { this.toast('This label has characters a reference cannot carry'); return false; }
    const text = '\\' + form + '{' + key + '}';
    w.apply(sp.f, [{ s: m.p, e: m.p, t: sp.pre + text }]);
    return w.commit({ f: sp.f, p: m.p, bias: 1 });
  },

  // ---- links -------------------------------------------------------------------------------------------
  // the link the caret is in: \href, \hyperref (their words on the page) or a \url beside it
  linkAt(at) {
    if (!at || !at.el || !at.el.closest) return null;
    const y = at.el.closest('.y-link');
    if (y) {
      const r = styOfEl(y);
      if (r && /^(href|hyperref)$/.test(r.cmd)) return this.linkRead(r.f, r.s, r.e);
    }
    const a = at.el.closest('.a-url');
    if (a) { const info = atomOfEl(a); if (info) return this.linkRead(info.f, info.s, info.e); }
    return null;
  },
  // a link command at [s, e) of f read: { f, s, e, cmd, url, label, text: [ts, te) of its words }
  linkRead(f, s, e) {
    const src = this.src(f), t = src.slice(s, e);
    let m = /^\\(href)\s*\{/.exec(t);
    if (m) {
      const a = s + m[0].length - 1, z = groupClose(src, a);
      if (z < 0) return null;
      let b = z; while (b < e && /\s/.test(src[b])) b++;
      if (src[b] !== '{') return null;
      const bz = groupClose(src, b);
      return { f, s, e, cmd: 'href', url: src.slice(a + 1, z - 1).replace(/\\([%#&_~])/g, '$1'), urlRaw: src.slice(a + 1, z - 1), text: [b + 1, bz - 1] };
    }
    m = /^\\hyperref\s*\[([^\]\n]{0,200})\]\s*\{/.exec(t);
    if (m) { const b = s + m[0].length - 1, bz = groupClose(src, b); return { f, s, e, cmd: 'hyperref', url: '', label: m[1].trim(), text: [b + 1, bz - 1] }; }
    m = /^\\(url|nolinkurl)\s*\{/.exec(t);
    if (m) { const a = s + m[0].length - 1, z = groupClose(src, a); return z < 0 ? null : { f, s, e, cmd: m[1], url: src.slice(a + 1, z - 1), text: null }; }
    return null;
  },
  linkCopy(at) {
    const L = this.linkAt(at);
    if (!L || !L.url) return false;
    try { navigator.clipboard.writeText(L.url).then(() => this.toast('Copied ' + L.url), () => this.toast('The browser did not let the page copy it')); } catch (e) { this.toast('The browser did not let the page copy it'); }
    return true;
  },
  linkRemove(at, link) {
    const L = link || this.linkAt(at);
    if (!L) return false;
    const src = this.src(L.f);
    const t = L.text ? src.slice(L.text[0], L.text[1]) : this.escapeAt(L.f, L.s, L.url);
    const w = new Work(this);
    w.apply(L.f, [{ s: L.s, e: L.e, t }]);
    return w.commit({ f: L.f, p: L.s + t.length, bias: -1 }, 'format');
  },
  // A link written or changed: { kind: 'web'|'mail'|'place', url, text (typed), label, subject }.
  // A new one goes at the caret, around the selection (its source kept as the words where the
  // text was not changed); the link at the caret is changed where it stands, field by field.
  linkWrite(at, o) {
    const kind = o.kind || (/^mailto:/i.test(o.url || '') ? 'mail' : o.label ? 'place' : 'web');
    let url = String(o.url || '').trim();
    if (kind === 'mail') { url = url.replace(/^mailto:/i, ''); if (!/^[^\s@{}\\]+@[^\s@{}\\]+$/.test(url)) { this.toast('This is no e-mail address'); return false; } url = 'mailto:' + url + (o.subject ? '?subject=' + encodeURIComponent(o.subject) : ''); }
    if (kind === 'web') { if (!url) { this.toast('Type the address first'); return false; } if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[#/.]/.test(url)) url = 'https://' + url; }
    if (kind === 'place' && !(o.label && SAFE_KEY.test(o.label)) && !(o.target && o.target.add)) { this.toast('Pick a place in this document first'); return false; }
    const urlArg = url.replace(/[\\{}\s^]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).replace(/[%#]/g, (c) => '\\' + c);
    const L = o.link || this.linkAt(at);
    const w = new Work(this);
    let label = o.label;
    const sp = L ? { f: L.f } : this.refsSpot(at);
    if (!sp) return false;
    const f = sp.f, src = this.src(f);
    const typed = o.text == null ? null : String(o.text);
    let s, e, words, inner = null;
    if (L) {
      s = L.s; e = L.e;
      inner = L.text ? src.slice(L.text[0], L.text[1]) : null;
      const shown = inner != null ? textOf(this.plainOf(L.f, L.text[0], L.text[1])) : L.url;
      words = typed != null && textOf(typed) !== shown ? this.escapeAt(f, s, textOf(typed)) : inner != null ? inner : this.escapeAt(f, s, L.url);
    } else {
      s = sp.pre ? sp.p : sp.a; e = sp.pre ? sp.p : sp.b;
      const sel = e > s ? src.slice(s, e) : '';
      const selPlain = sel ? textOf(this.plainOf(f, s, e)) : '';
      words = sel && (typed == null || textOf(typed) === selPlain) ? sel : this.escapeAt(f, s, textOf(typed || (kind === 'mail' ? url.slice(7).replace(/\?.*$/, '') : kind === 'web' ? url : '')));
      if (sel && ((!/^[^{}]*$/.test(sel) && !balanced(sel)) || /\n[ \t]*\r?\n|\\(?:begin|end|par|item)(?![A-Za-z@])/.test(sel))) { this.toast('A link holds words of one paragraph: select within one paragraph'); return false; }
    }
    const m = w.mark(f, s, -1), me = w.mark(f, e, 1);
    if (kind === 'place' && !label) { label = RS.labelKey(o.target.add.prefix, o.target.add.words, new Set(this.model.labels.keys())); w.apply(o.target.add.f, [{ s: o.target.add.p, e: o.target.add.p, t: '\\label{' + label + '}' }]); }
    let t;
    if (kind === 'place') t = '\\hyperref[' + label + ']{' + (words || this.escapeAt(f, s, label)) + '}';
    else if (!words || (kind === 'web' && textOf(words) === url && !/[%#\\{}~^]/.test(url))) t = '\\url{' + url + '}';
    else {
      // (an address left as it was keeps its own bytes: \_ and \& in it stay, review L11)
      const keep = L && L.cmd === 'href' && L.url === url && L.urlRaw != null ? L.urlRaw : urlArg;
      t = '\\href{' + keep + '}{' + words + '}';
    }
    w.apply(f, [{ s: m.p, e: me.p, t: (sp.pre || '') + t }]);
    // (hyperref with hidelinks, the links black as Word prints them, where nothing gives it yet)
    const main = this.main, msrc = w.src(main), others = this.preambleOthers();
    if (!provides(msrc, 'hyperref', others, preambleEnd(msrc)) && !(t.startsWith('\\url') && provides(msrc, 'url', others, preambleEnd(msrc)))) w.pkgs({ hyperref: 'hidelinks' });
    return w.commit({ f, p: m.p + (sp.pre || '').length + t.length, bias: -1 }, L ? 'format' : 'insert');
  },
  // the page's words of [s, e) of f: the plain text TeX would print (for the Link dialog's text)
  plainOf(f, s, e) {
    const src = this.src(f).slice(s, e);
    return src.replace(/\\(?:textbf|textit|emph|texttt|textsc|underline|uline)\s*\{([^{}]*)\}/g, '$1').replace(/\\([%#&_$])/g, '$1').replace(/~/g, ' ').replace(/[{}]/g, '');
  },
  // a \url clicked on the page: the Link dialog (its Remove, Open and Copy too)
  openLinkFor(el, info) {
    openLinkDialog(this, this.ribbonAt(), this.linkRead(info.f, info.s, info.e), el);
  },

  // ---- bookmarks ------------------------------------------------------------------------------------
  // every \label of the project's .tex files: [{ key, f, s, e }] in their order
  labelSpots() {
    const out = [];
    for (const f of texFiles(this)) {
      const t = stripComments(this.src(f).slice(0, 4000000));
      for (let re = /\\label\s*\{([^{}\n]{1,200})\}/g, m, k = 0; (m = re.exec(t)) && k < 20000; k++) out.push({ key: m[1].trim(), f, s: m.index, e: m.index + m[0].length });
    }
    return out;
  },
  bookmarkAdd(at, key) {
    key = String(key || '').trim();
    if (!SAFE_KEY.test(key)) { this.toast('A bookmark\'s name: letters, digits and : - _ . / + only'); return false; }
    if (this.labelSpots().some((x) => x.key === key)) { this.toast('The document has a bookmark of that name: pick another'); return false; }
    const sp = this.refsSpot(at);
    if (!sp) return false;
    const src = this.src(this.main), others = this.preambleOthers();
    // (in running text a hyperref link needs an anchor of its own: \phantomsection)
    const inText = !sp.pre && !/^(h|cap)$/.test(at.ctx || '') && provides(src, 'hyperref', others, preambleEnd(src));
    const t = sp.pre + (inText ? '\\phantomsection' : '') + '\\label{' + key + '}';
    const w = new Work(this);
    w.apply(sp.f, [{ s: sp.p, e: sp.p, t }]);
    return w.commit({ f: sp.f, p: sp.p + t.length, bias: -1 });
  },
  bookmarkDelete(key) {
    const L = this.labelSpots().find((x) => x.key === key);
    if (!L) return false;
    const src = this.src(L.f);
    let s = L.s;
    if (src.slice(Math.max(0, s - 15), s) === '\\phantomsection') s -= 15;
    const [a, b] = RS.lineSpan(src, s, L.e);
    const w = new Work(this);
    w.apply(L.f, [{ s: a, e: b, t: '' }]);
    return w.commit(null, 'format');
  },
  bookmarkGo(key) {
    const L = this.labelSpots().find((x) => x.key === key);
    if (!L) return false;
    this.root.focus({ preventScroll: true });
    this.restoreCaret({ f: L.f, p: L.s, bias: -1 });
    this.scrollToCaret();
    return true;
  },

  // ---- the index ---------------------------------------------------------------------------------------
  // the edits that make an index where the preamble has none: imakeidx and \makeindex
  // whether a makeindex style of the project sets page numbers at the right margin (R4)
  indexRightIn(name) { return !!RS.istRight(this.files.get(name)); },
  // (R4) Right align page numbers on or off: imakeidx's options=-s with a style of the project's
  // own (index-right.ist, written where it is not there yet), or that option taken out
  indexRight(w, on) {
    const f = this.main, src = w.src(f), t = stripComments(src.slice(0, Math.max(0, preambleEnd(src))));
    const mk = RS.cmdCalls(t, 'makeindex', 0, 0, t.length, true).find((c) => !c.opt || !/\bname\s*=/.test(t.slice(c.opt[0], c.opt[1])));
    if (!mk) return;
    const opt = mk.opt ? t.slice(mk.opt[0], mk.opt[1]) : '';
    const m = /(^|,)\s*options\s*=\s*(\{[^{}]*\}|[^,]*)/.exec(opt);
    if (on) {
      const have = this.files.get(RS.RIGHT_IST);
      if (have != null && !RS.istRight(have)) { this.toast(RS.RIGHT_IST + ' is a file of this project already: rename it first'); return false; }
      if (have == null) w.apply(RS.RIGHT_IST, [{ s: 0, e: 0, t: RS.RIGHT_IST_TEXT }]);
      const val = 'options=-s ' + RS.RIGHT_IST;
      if (m) w.apply(f, [{ s: mk.opt[0] + m.index + m[1].length, e: mk.opt[0] + m.index + m[0].length, t: (m[0].startsWith(' ') || m[1] ? '' : '') + val }]);
      else if (mk.opt) w.apply(f, [{ s: mk.opt[1], e: mk.opt[1], t: (opt.trim() ? ',' : '') + val }]);
      else w.apply(f, [{ s: mk.e, e: mk.e, t: '[' + val + ']' }]);
    } else if (m) {
      // (the option goes; the brackets with it where nothing else is left)
      const rest = (opt.slice(0, m.index) + opt.slice(m.index + m[0].length)).replace(/^\s*,/, '');
      w.apply(f, rest.trim() ? [{ s: mk.opt[0], e: mk.opt[1], t: rest }] : [{ s: mk.opt[0] - 1, e: mk.opt[1] + 1, t: '' }]);
    }
  },
  indexSetup(w, columns) {
    const f = this.main, R = RS.refsSetup(w.src(f), !!this.model.opts.chapters);
    if (!R.index) {
      w.pkgs(['imakeidx']);
      w.apply(f, RS.preambleLine(w.src(f), '\\makeindex' + (columns && columns !== 2 ? '[columns=' + columns + ']' : '')));
      return;
    }
    if (!R.index.make) w.apply(f, RS.preambleLine(w.src(f), '\\makeindex'));
    if (columns && R.index.pkg === 'imakeidx' && R.index.make && columns !== R.index.columns) {
      const src = w.src(f), t = stripComments(src.slice(0, Math.max(0, preambleEnd(src))));
      const mk = RS.cmdCalls(t, 'makeindex', 0, 0, t.length, true).find((c) => !c.opt || !/\bname\s*=/.test(t.slice(c.opt[0], c.opt[1])));
      if (mk) w.apply(f, mk.opt ? [{ s: mk.opt[0] - 1, e: mk.opt[1] + 1, t: columns === 2 && /^\s*columns\s*=\s*\d+\s*$/.test(t.slice(mk.opt[0], mk.opt[1])) ? '' : '[' + setKV(t.slice(mk.opt[0], mk.opt[1]), 'columns', columns) + ']' }] : [{ s: mk.e, e: mk.e, t: '[columns=' + columns + ']' }]);
    }
  },
  // Mark Entry: { main, sub, see, bold, italic, range, all } (typed text); \index{…} after the
  // selection (|( and |) around it for a range), or after every place the words stand (all)
  indexMark(at, o) {
    const main = textOf(o.main);
    if (!main) { this.toast('Type the main entry first'); return false; }
    const esc = (x) => escapeTeX(textOf(x));
    const fmt = o.bold ? 'textbf' : o.italic ? 'textit' : '';
    const arg = (range) => RS.indexArg({ main: esc(main), sub: o.sub ? esc(o.sub) : '', see: o.see ? esc(o.see) : '', fmt, range });
    const w = new Work(this);
    const sp = o.all ? null : this.refsSpot(at);
    if (!o.all && !sp) return false;
    const c = at && at.c;
    const rng = !o.all && o.range && c && !c.collapsed && !c.ghost ? [w.mark(c.f, c.a, -1), w.mark(c.f, c.b, 1)] : null;
    const m = sp ? w.mark(sp.f, sp.p, -1) : null;
    if (!o.all) this.indexSetup(w, null);
    if (o.all) {
      const q = compile(main, { matchCase: true, wholeWord: true });
      if (!q.re) return false;
      const byF = new Map();
      let n = 0;
      for (const B of this.renderer.blocks) {
        const T = blockText(B), r = hitsIn(T.text, q.re, { max: 2000 });
        for (const h of r.hits) {
          const x = hitSource(B, T, h.i, h.j);
          if (!x || x.ro || !this.files.has(x.f)) continue;
          // (not twice where the entry stands already)
          if (/^\s*\\index\s*\{/.test(this.src(x.f).slice(x.e, x.e + 40))) continue;
          if (!byF.has(x.f)) byF.set(x.f, []);
          byF.get(x.f).push({ s: x.e, e: x.e, t: '\\index{' + arg() + '}' });
          n++;
        }
      }
      // (the places first, on the text as it is; then the preamble's lines)
      for (const [f, ed] of byF) w.apply(f, ed);
      this.indexSetup(w, null);
      if (!n) { this.toast('“' + main + '” stands nowhere else in the text'); return false; }
      w.commit(null, 'insert');
      this.toast('Marked ' + n + ' place' + (n === 1 ? '' : 's'));
      return true;
    }
    if (rng) {
      const [ma, mb] = rng, close = '\\index{' + arg('close') + '}';
      w.apply(c.f, [{ s: mb.p, e: mb.p, t: close }, { s: ma.p, e: ma.p, t: '\\index{' + arg('open') + '}' }]);
      return w.commit({ f: c.f, p: mb.p, bias: 1 });
    }
    const t = sp.pre + '\\index{' + arg() + '}';
    w.apply(sp.f, [{ s: m.p, e: m.p, t }]);
    return w.commit({ f: sp.f, p: m.p + t.length, bias: 1 });
  },
  // Insert Index: { columns } \printindex after the paragraph (or the index's columns where it is)
  indexInsert(o) {
    const cols = Math.max(1, Math.min(4, parseInt(o && o.columns, 10) || 2));
    const w = new Work(this);
    this.indexSetup(w, cols);
    if (o && o.right != null && this.indexRight(w, !!o.right) === false) return false;
    if (this.bodySpots(['printindex'], true).filter((x) => !x.opt).length) return w.commit(null, 'format');
    return this.blockCommand('\\printindex', w);
  },

  // ---- the Table of Authorities (R4) --------------------------------------------------------------
  // a second index of imakeidx's, named toa: \makeindex[name=toa,title=Table of Authorities,columns=1] once (one column, as Word's),
  // each citation \index[toa]{n@\textbf{Category}!citation} (the categories in Word's order),
  // printed by \printindex[toa]; makeidx has no second index
  toaWhyNot() {
    const R = (this.model && this.model.opts.refs) || {};
    if (R.index && R.index.pkg === 'makeidx') return 'This document\'s index is makeidx\'s, which has no second index: imakeidx has';
    if (this.model && this.model.opts.cls === 'beamer') return 'Beamer has no index';
    return '';
  },
  toaCategories() {
    const out = [];
    for (const x of (this.model && this.model.indexEntries) || []) {
      if (x.name !== 'toa') continue;
      const L = RS.readIndexArg(x.arg).levels[0];
      const c = L && L.text.replace(/^\\textbf\s*\{(.*)\}$/, '$1').trim();
      if (c && !out.includes(c) && out.length < 30) out.push(c);
    }
    return out;
  },
  toaSetup(w) {
    const f = this.main, R = RS.refsSetup(w.src(f), !!this.model.opts.chapters);
    if (!(R.index && R.index.pkg === 'imakeidx')) w.pkgs(['imakeidx']);
    if (!(R.index && (R.index.mk || []).some((m) => m.name === 'toa'))) w.apply(f, RS.preambleLine(w.src(f), '\\makeindex[name=toa,title=Table of Authorities,columns=1]'));
  },
  // { long, short, category, rank, all } (typed text)
  citationMark(at, o) {
    const why = this.toaWhyNot();
    if (why) { this.toast(why); return false; }
    const long = textOf(o.long), cat = textOf(o.category) || 'Cases';
    if (!long) { this.toast('Type the citation first'); return false; }
    const k = TOA_CATEGORIES.indexOf(cat);
    const rank = k >= 0 ? k + 1 : Math.max(1, Math.min(99, parseInt(o.rank, 10) || 8));
    const arg = RS.indexArg({ sort: String(rank), main: '\\textbf{' + escapeTeX(cat) + '}', sub: escapeTeX(long) });
    const entry = '\\index[toa]{' + arg + '}';
    const w = new Work(this);
    if (o.all) {
      const words = textOf(o.short) || long;
      const q = compile(words, { matchCase: true, wholeWord: true });
      if (!q.re) return false;
      const byF = new Map();
      let n = 0;
      for (const B of this.renderer.blocks) {
        const T = blockText(B), r = hitsIn(T.text, q.re, { max: 2000 });
        for (const h of r.hits) {
          const x = hitSource(B, T, h.i, h.j);
          if (!x || x.ro || !this.files.has(x.f)) continue;
          if (/^\s*\\index\s*\[\s*toa\s*\]/.test(this.src(x.f).slice(x.e, x.e + 40))) continue;
          if (!byF.has(x.f)) byF.set(x.f, []);
          byF.get(x.f).push({ s: x.e, e: x.e, t: entry });
          n++;
        }
      }
      for (const [f, ed] of byF) w.apply(f, ed);
      this.toaSetup(w);
      if (!n) { this.toast('“' + words + '” stands nowhere in the text'); return false; }
      w.commit(null, 'insert');
      this.toast('Marked ' + n + ' place' + (n === 1 ? '' : 's'));
      return true;
    }
    const sp = this.refsSpot(at);
    if (!sp) return false;
    const m = w.mark(sp.f, sp.p, -1);
    this.toaSetup(w);
    const t = sp.pre + entry;
    w.apply(sp.f, [{ s: m.p, e: m.p, t }]);
    return w.commit({ f: sp.f, p: m.p + t.length, bias: 1 });
  },
  toaInsert() {
    const why = this.toaWhyNot();
    if (why) { this.toast(why); return false; }
    const w = new Work(this);
    this.toaSetup(w);
    if (this.bodySpots(['printindex'], true).some((x) => x.opt === 'toa')) return w.commit(null, 'format');
    return this.blockCommand('\\printindex[toa]', w);
  }
};

// an optional argument's words in braces where a bracket would end it early (review M7)
const br = (t) => (/[\]\[]/.test(t) ? '{' + t + '}' : t);
function roman(n) { let s = ''; for (const [v, r] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (n >= v) { s += r; n -= v; } return s; }
const balanced = (t) => { let d = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '\\') { i++; continue; } if (t[i] === '{') d++; else if (t[i] === '}' && --d < 0) return false; } return d === 0; };
function setKV(list, key, value) {
  const parts = list.split(',').map((x) => x.trim()).filter(Boolean).filter((x) => x.split('=')[0].trim() !== key);
  if (!(key === 'columns' && value === 2)) parts.push(key + '=' + value);
  return parts.join(',');
}
