// Batch B6, the page: margins, orientation, size, columns, breaks, line numbers, hyphenation,
// headers and footers with page numbers, the watermark, the page's colour and border, the
// document's class, size and sides, and Print. Each control writes the smallest edit of the
// source (src/pagesrc.js), where the construct already stands when it does (a hand written
// \geometry{…}, the class's a4paper); the page draws it as TeX will print it (src/layout.js).
// The Page setup dialog and the others are in src/ui/pagesetup.js; the header and footer are
// typed in on the page itself (src/ui/headerfooter.js).

import { register, command, onInstall } from '../commands.js';
import { openMenu, colorPicker, colorNeeds } from '../ui/kit.js';
import { geometry, fmtNum } from '../layout.js';
import { preambleEnd, usePackages, setClass } from '../preamble.js';
import { mapPos } from '../wrap.js';
import * as PS from '../pagesrc.js';
import { openPageSetup, openColumns, openWatermark, openBorders, openLineNumbering, openHyphenation, openPageNumberFormat } from '../ui/pagesetup.js';
import { hfOpen, hfClose, hfInsert, installHeaderFooter } from '../ui/headerfooter.js';

const CM = 72.27 / 2.54;
// the document can take a page set up: a model, and a preamble in its main file
const doc = (app) => !!(app.model && !app.stale && app.files && app.files.has(app.main) && preambleEnd(app.src(app.main)) >= 0);
const NO_PRE = 'The page is set up in the preamble of the main file, and it has none (no \\begin{document} line)';
const anyWhy = (app) => (doc(app) ? '' : NO_PRE);
// beamer sets its slides' size and their frames itself (geometry or fancyhdr there clash with it)
const beamer = (app) => !!(app.model && app.model.opts && app.model.opts.cls === 'beamer');
const sheet = (app) => doc(app) && !beamer(app);
const sheetWhy = (app) => anyWhy(app) || (beamer(app) ? 'Beamer sets its slides\' size and frames itself (\\documentclass[aspectratio=169]{beamer}, its themes)' : '');
// the caret on the page, outside a table's cell, a formula or a picture
const inText = (app, at) => doc(app) && !!at && !at.cell && !app.armed;
const twoSided = (app) => !!(app.model && app.model.opts && geometry(app.model.opts).twoside);
// a page break can go at the caret: in the text, outside a footnote, a box or a minipage (TeX
// makes no page there: src/pagesrc.js breakAt)
const breakable = (app, at) => inText(app, at) && !app.pageBreakPlan(at).blocked;
const breakWhy = (app, at) => anyWhy(app) || (at && at.cell ? 'In a table Ctrl+Enter adds a row; a page break goes outside the table' : inText(app, at) ? app.pageBreakPlan(at).blocked || '' : 'Put the caret in the text');
const inColumns = (app, at) => !!at && !!at.c && !at.c.ghost && (!!PS.multicolsAt(app.src(at.c.f), at.c.a) || (app.model && app.model.opts.twocolumn));

const I = {
  margins: '<path d="M4 3.5h12v13H4zM7 3.5v13M13 3.5v13M4 6.5h12M4 13.5h12"/>',
  orientation: '<path d="M5.5 2.5h6v9h-6zM8.5 17.5h8v-6h-3"/>',
  size: '<path d="M5.5 2.5h6.5l3 3v12h-9.5zM12 2.5v3h3"/>',
  columns: '<path d="M3.5 4.5h5.5M3.5 7.5h5.5M3.5 10.5h5.5M3.5 13.5h5.5M11 4.5h5.5M11 7.5h5.5M11 10.5h5.5M11 13.5h5.5"/>',
  breaks: '<path d="M5.5 2.5v5h9v-5M5.5 17.5v-5h9v5M3 10h2M7 10h2M11 10h2M15 10h2"/>',
  lineno: '<path d="M8 5.5h8.5M8 10h8.5M8 14.5h8.5M3.6 4.6l.9-.5v3M3.3 12.6h1.3c.8 0 .8.9.2 1.4l-1.5 1.4h1.8"/>',
  hyph: '<path d="M3 6h6M3 10h3.5M8.5 10h2.5M3 14h6M13 6h4M13.5 14h3.5"/>',
  setup: '<path d="M5.5 2.5h9v15h-9zM8 6h4M8 9h4M8 12h2"/>',
  cls: '<path d="M4 3.5h12v13H4zM7 7h6M7 10h6M7 13h3"/>',
  fsize: '<path d="M3 15l3.5-9 3.5 9M4.3 12h4.4M12 15l2.5-6 2.5 6M12.9 13h3.2"/>',
  sides: '<path d="M3.5 4.5h6v11h-6zM10.5 4.5h6v11h-6z"/>',
  blank: '<path d="M5.5 2.5h9v15h-9z"/>',
  pbreak: '<path d="M5.5 2.5v5.5h9V2.5M5.5 17.5V12h9v5.5M3 10h14" stroke-dasharray="2 1.6"/>',
  header: '<path d="M4 3.5h12v13H4zM6.5 6.3h7"/>',
  footer: '<path d="M4 3.5h12v13H4zM6.5 13.7h7"/>',
  pnum: '<path d="M5.5 2.5h9v15h-9zM9.3 11.2l1-.6v3.8"/>',
  wm: '<path d="M5.5 2.5h9v15h-9zM7.5 13.5l5-7"/>',
  color: '<path d="M10 3c2.5 3.2 4.5 5.6 4.5 8a4.5 4.5 0 01-9 0c0-2.4 2-4.8 4.5-8z"/>',
  border: '<path d="M3.5 3.5h13v13h-13zM6 6h8v8H6z"/>',
  print: '<path d="M6 7.5V3h8v4.5M6 14H4.5V8h11v6H14M6 11.5h8v5.5H6z"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  date: '<path d="M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5"/>',
  first: '<path d="M5.5 2.5h9v15h-9zM7.5 5.5h5"/>',
  oddeven: '<path d="M3.5 4.5h6v11h-6zM10.5 4.5h6v11h-6zM5 6.5h3M12 13.5h3"/>'
};

// ---- the menus' entries ------------------------------------------------------------------------
const MARGIN_ITEMS = (app) => {
  const cur = app.pageMargins();
  return [...PS.MARGINS.map(([id, name, t, b, l, r, mir]) => ({
    name, title: (mir ? 'Top ' + t + ' cm, bottom ' + b + ' cm, inside ' + l + ' cm, outside ' + r : 'Top ' + t + ' cm, bottom ' + b + ' cm, left ' + l + ' cm, right ' + r) + ' cm',
    checked: !!cur && cur.preset === id, radio: true, run: () => app.runCommand('margins', id)
  })), null, { name: 'Custom margins…', title: 'Every margin, the gutter and the paper in the Page setup dialog', run: () => app.runCommand('page-setup', 'margins') }];
};
const SIZE_ITEMS = (app) => {
  const cur = app.pagePaper();
  return [...PS.SIZES.map(([id, name, dims]) => ({ name, title: name + ', ' + dims, checked: cur === id, radio: true, run: () => app.runCommand('size', id) })), null,
    { name: 'More paper sizes…', title: 'A paper of any size, in the Page setup dialog', run: () => app.runCommand('page-setup', 'paper') }];
};

register(
  // ---- Layout › Page setup ----
  { id: 'margins', name: 'Margins', label: 'Margins', title: 'Margins: Normal, Narrow, Moderate, Wide, Mirrored, or your own', icon: I.margins, kind: 'menu', tab: 'layout', group: 'setup', order: 10,
    synonyms: ['Page margins', 'geometry', 'Normal margins', 'Narrow margins', 'Wide margins', 'Mirrored margins'], when: sheet, whyNot: sheetWhy, menuItems: MARGIN_ITEMS,
    run: (app, args) => (typeof args === 'string' ? app.pageMarginsSet(args) : app.pageMenu('margins', MARGIN_ITEMS(app), 'Margins')) },
  { id: 'orientation', name: 'Orientation', label: 'Orientation', title: 'Portrait or landscape pages', icon: I.orientation, kind: 'menu', tab: 'layout', group: 'setup', order: 20,
    synonyms: ['Landscape', 'Portrait', 'Page orientation', 'Rotate page'], when: sheet, whyNot: sheetWhy,
    menuItems: (app) => ['portrait', 'landscape'].map((w) => ({ name: w === 'portrait' ? 'Portrait' : 'Landscape', checked: app.pageLand() === (w === 'landscape'), radio: true, run: () => app.runCommand('orientation', w) })),
    run: (app, args) => (typeof args === 'string' ? app.pageEdit(PS.orientationEdits(app.src(app.main), args, { others: app.preambleOthers(), pin: app.pagePin() }), 'page-orient') : app.pageMenu('orientation', app.pageCmdItems('orientation'), 'Orientation')) },
  { id: 'size', name: 'Size', label: 'Size', title: 'The paper: Letter, Legal, A4, A5, B5, Executive or any size', icon: I.size, kind: 'menu', tab: 'layout', group: 'setup', order: 30,
    synonyms: ['Paper size', 'A4', 'Letter', 'Page size', 'Legal', 'A5'], when: sheet, whyNot: sheetWhy, menuItems: SIZE_ITEMS,
    run: (app, args) => (args ? app.pageEdit(PS.paperEdits(app.src(app.main), args, { others: app.preambleOthers(), pin: app.pagePin() }), 'page-size') : app.pageMenu('size', SIZE_ITEMS(app), 'Size')) },
  { id: 'columns', name: 'Columns', label: 'Columns', title: 'Text in one, two or three columns: the whole document, or the selected paragraphs', icon: I.columns, kind: 'menu', tab: 'layout', group: 'setup', order: 40,
    synonyms: ['Two columns', 'Three columns', 'multicols', 'twocolumn'], when: sheet, whyNot: sheetWhy,
    menuItems: (app) => {
      const cur = app.pageColumns();
      return [...[[1, 'One'], [2, 'Two'], [3, 'Three']].map(([n, name]) => ({ name, title: n === 1 ? 'One column' : n + ' columns' + (n === 2 ? ' (the class\'s twocolumn, or multicols around the selection)' : ' (multicols)'), checked: cur === n, radio: true, run: () => app.runCommand('columns', n) })),
        null, { name: 'More columns…', title: 'How many, the space between them and a line between', run: () => openColumns(app) }];
    },
    run: (app, args) => (typeof args === 'number' ? app.pageColumnsSet(args) : app.pageMenu('columns', app.pageCmdItems('columns'), 'Columns')) },
  { id: 'breaks', name: 'Breaks', label: 'Breaks', title: 'A page, column or section break at the caret', icon: I.breaks, kind: 'menu', tab: 'layout', group: 'setup', order: 50,
    synonyms: ['Section break', 'Column break', 'Next page', 'Odd page', 'Even page'], when: inText, whyNot: (app) => anyWhy(app) || 'Put the caret in the text, outside a table',
    menuItems: (app) => {
      const at = app.ribbonAt(), cols = inColumns(app, at), mc = at && at.c && !at.c.ghost && PS.multicolsAt(app.src(at.c.f), at.c.a);
      return [
        { name: 'Page', title: 'Where one page ends and the next begins (\\newpage, Ctrl+Enter)', keys: 'Ctrl+Enter', run: () => app.runCommand('page-break') },
        { name: 'Column', title: 'The text after the caret starts the next column (\\columnbreak in multicols, \\newpage in two columns) (Ctrl+Shift+Enter)', keys: 'Ctrl+Shift+Enter', disabled: !cols, run: () => app.runCommand('column-break') },
        { name: 'Text wrapping', title: 'A line break inside the paragraph (Shift+Enter)', keys: 'Shift+Enter', run: () => { app.ribbonBack(); app.enter(true); } },
        null,
        { name: 'Next page', title: 'A new page, the floats waiting before it set first (\\clearpage)', run: () => app.pageBreakAt('next') },
        { name: 'Continuous', title: mc ? 'The columns end here and start again after the caret, so either part can have its own number (\\end{multicols} … \\begin{multicols})' : 'In LaTeX the page goes on as it is: a section break that keeps the page is only needed in columns (multicols)', disabled: !mc, run: () => app.pageContinuous() },
        { name: 'Even page', title: 'The next even page, an empty page before it only where needed (\\clearpage, then \\ifodd\\value{page}\\hbox{}\\clearpage\\fi)', run: () => app.pageBreakAt('even') },
        { name: 'Odd page', title: 'The next odd page, an empty page before it only where needed (\\clearpage, then \\ifodd\\value{page}\\else\\hbox{}\\clearpage\\fi)', run: () => app.pageBreakAt('odd') }
      ];
    },
    run: (app) => app.pageMenu('breaks', app.pageCmdItems('breaks'), 'Breaks') },
  { id: 'line-numbers', name: 'Line numbers', label: 'Line numbers', title: 'Number the lines in the margin (lineno): continuous, on each page, in each section', icon: I.lineno, kind: 'menu', tab: 'layout', group: 'setup', order: 60,
    synonyms: ['Line Numbers', 'lineno', 'Number lines'], when: sheet, whyNot: sheetWhy,
    menuItems: (app) => {
      const L = app.pageLineNumbers();
      const mode = L && L.on ? L.mode : 'none';
      return [...[['none', 'None'], ['continuous', 'Continuous'], ['page', 'Restart each page'], ['section', 'Restart each section']].map(([id, name]) => ({ name, checked: mode === id, radio: true, run: () => app.runCommand('line-numbers', id) })),
        null, { name: 'Line numbering options…', title: 'Count by every n-th line, and where numbers start again', run: () => openLineNumbering(app) }];
    },
    run: (app, args) => (typeof args === 'string' ? app.pageEdit(PS.lineNumberEdits(app.src(app.main), args, { others: app.preambleOthers() }), 'page-lineno') : app.pageMenu('line-numbers', app.pageCmdItems('line-numbers'), 'Line numbers')) },
  { id: 'hyphenation', name: 'Hyphenation', label: 'Hyphenation', title: 'Words broken at the line\'s end: automatically, never, or where you say', icon: I.hyph, kind: 'menu', tab: 'layout', group: 'setup', order: 70,
    synonyms: ['Hyphenate', 'hyphenat', 'Optional hyphen'], when: doc, whyNot: anyWhy,
    menuItems: (app) => {
      const h = PS.hyphenation(app.src(app.main), { others: app.preambleOthers() });
      const at = app.ribbonAt();
      return [{ name: 'None', checked: h === 'none', radio: true, title: 'No word is broken (\\usepackage[none]{hyphenat})', run: () => app.runCommand('hyphenation', 'none') },
        { name: 'Automatic', checked: h === 'auto', radio: true, title: 'TeX breaks words by the language\'s patterns', run: () => app.runCommand('hyphenation', 'auto') },
        { name: 'Manual', title: 'A place where the word at the caret may break (\\-)', disabled: !inText(app, at), run: () => app.runCommand('optional-hyphen') },
        null, { name: 'Hyphenation options…', title: 'Words broken your way everywhere (\\hyphenation{…})', run: () => openHyphenation(app) }];
    },
    run: (app, args) => (typeof args === 'string' ? app.pageEdit(PS.hyphenationEdits(app.src(app.main), args, { others: app.preambleOthers() }), 'page-hyph') : app.pageMenu('hyphenation', app.pageCmdItems('hyphenation'), 'Hyphenation')) },
  // (the group's launcher, as Word's: the group is Page setup, whose folded button has that name)
  { id: 'page-setup', name: 'Page setup dialog', label: 'Page setup', title: 'Margins, gutter, paper, orientation, header and footer distances, vertical alignment', icon: I.setup, tab: 'layout', group: 'setup', order: 80,
    synonyms: ['Page setup', 'Page Setup', 'Paper', 'Gutter', 'Vertical alignment'], when: sheet, whyNot: sheetWhy, run: (app, args) => openPageSetup(app, typeof args === 'string' ? args : null) },
  // ---- Layout › Document ----
  { id: 'doc-class', name: 'Document class', label: 'Class', title: 'The document\'s class: article, report, book, KOMA-Script, memoir, AMS', icon: I.cls, kind: 'menu', tab: 'layout', group: 'document', order: 10,
    synonyms: ['documentclass', 'Class', 'Report', 'Book', 'Article'], when: doc, whyNot: anyWhy,
    menuItems: (app) => { const c = PS.classPage(app.src(app.main)); return PS.CLASSES.map(([id, name]) => ({ name, title: '\\documentclass{' + id + '}', checked: !!c && c.name === id, radio: true, run: () => app.runCommand('doc-class', id) })); },
    run: (app, args) => (typeof args === 'string' ? app.pageEdit(classEdits(app, args), 'page-class') : app.pageMenu('doc-class', app.pageCmdItems('doc-class'), 'Document class')) },
  { id: 'base-size', name: 'Base font size', label: 'Base size', title: 'The size of the text the class sets everything else from: 10, 11 or 12 points', icon: I.fsize, kind: 'menu', tab: 'layout', group: 'document', order: 20,
    synonyms: ['10pt', '11pt', '12pt', 'Document font size'], when: doc, whyNot: anyWhy,
    menuItems: (app) => { const c = PS.classPage(app.src(app.main)); return [10, 11, 12].map((n) => ({ name: n + ' pt', title: '\\documentclass[' + n + 'pt]', checked: !!c && c.pt === n, radio: true, run: () => app.runCommand('base-size', n) })); },
    run: (app, args) => (typeof args === 'number' ? app.pageEdit(PS.sizeEdits(app.src(app.main), args), 'page-pt') : app.pageMenu('base-size', app.pageCmdItems('base-size'), 'Base font size')) },
  { id: 'two-sided', name: 'Two sided', label: 'Two sided', title: 'Pages printed on both sides: margins and headers mirrored on even pages (twoside)', icon: I.sides, kind: 'toggle', tab: 'layout', group: 'document', order: 30,
    synonyms: ['twoside', 'oneside', 'Double sided', 'Different odd and even'], when: sheet, whyNot: sheetWhy,
    on: (app) => { const c = doc(app) && PS.classPage(app.src(app.main)); return !!c && c.twoside; },
    run: (app) => { const c = PS.classPage(app.src(app.main)); return app.pageEdit(PS.sidesEdits(app.src(app.main), !(c && c.twoside)), 'page-sides'); } },
  // ---- Insert › Pages ----
  { id: 'blank-page', name: 'Blank page', label: 'Blank page', title: 'An empty page at the caret (\\newpage \\null \\newpage)', icon: I.blank, tab: 'insert', group: 'pages', order: 20,
    synonyms: ['Blank Page', 'Empty page', 'New page'], when: breakable, whyNot: breakWhy, run: (app) => app.pageBreakAt('blank') },
  { id: 'page-break', name: 'Page break', label: 'Page break', title: 'Where one page ends and the next begins (\\newpage) (Ctrl+Enter)', icon: I.pbreak, tab: 'insert', group: 'pages', order: 30,
    keys: ['Ctrl+Enter'], keyRank: 0, synonyms: ['Page Break', 'newpage', 'Insert page break', 'Ctrl+Enter'], when: breakable, whyNot: breakWhy,
    run: (app) => app.pageBreakAt('page') },
  { id: 'column-break', name: 'Column break', title: 'The text after the caret starts the next column (Ctrl+Shift+Enter)', keys: ['Ctrl+Shift+Enter'], synonyms: ['columnbreak', 'Next column'],
    when: (app, at) => inText(app, at) && inColumns(app, at), whyNot: (app) => anyWhy(app) || 'A column break is for text in columns (Layout › Columns)', run: (app) => app.pageBreakAt('column') },
  { id: 'optional-hyphen', name: 'Optional hyphen', title: 'A place where the word at the caret may break at a line\'s end (\\-)', synonyms: ['Manual hyphenation', 'Soft hyphen'],
    when: (app, at) => inText(app, at) && !!at.c && !at.c.ghost && at.c.a === at.c.b, whyNot: () => 'Put the caret inside a word', run: (app, args, at) => app.commit([{ f: at.c.f, s: at.c.a, e: at.c.a, t: '\\-' }], { f: at.c.f, p: at.c.a + 2, bias: 1 }, 'page-hy') },
  // ---- Insert › Header & Footer ----
  { id: 'header', name: 'Header', label: 'Header', title: 'The text at the top of every page: edit it on the page (double click the top margin)', icon: I.header, kind: 'menu', tab: 'insert', group: 'headfoot', order: 10,
    also: [{ tab: 'headfoot', group: 'headfoot', order: 10 }], synonyms: ['Edit header', 'Running head', 'fancyhdr', 'fancyhead'], when: sheet, whyNot: sheetWhy, menuItems: (app) => app.pageHFItems('head'),
    run: (app) => app.pageMenu('header', app.pageHFItems('head'), 'Header') },
  { id: 'footer', name: 'Footer', label: 'Footer', title: 'The text at the foot of every page: edit it on the page (double click the bottom margin)', icon: I.footer, kind: 'menu', tab: 'insert', group: 'headfoot', order: 20,
    also: [{ tab: 'headfoot', group: 'headfoot', order: 20 }], synonyms: ['Edit footer', 'fancyfoot'], when: sheet, whyNot: sheetWhy, menuItems: (app) => app.pageHFItems('foot'),
    run: (app) => app.pageMenu('footer', app.pageHFItems('foot'), 'Footer') },
  { id: 'page-number', name: 'Page number', label: 'Page number', title: 'Page numbers: at the top or the foot, Page X of Y, here, their format', icon: I.pnum, kind: 'menu', tab: 'insert', group: 'headfoot', order: 30,
    also: [{ tab: 'headfoot', group: 'headfoot', order: 30 }], synonyms: ['Page Number', 'Page numbers', 'thepage', 'Page X of Y', 'Number pages'], when: sheet, whyNot: sheetWhy, menuItems: (app) => app.pagePNItems(),
    run: (app, args) => (typeof args === 'string' ? app.pagePageNumber(args) : app.pageMenu('page-number', app.pagePNItems(), 'Page number')) },
  // ---- Design › Page background ----
  { id: 'watermark', name: 'Watermark', label: 'Watermark', title: 'DRAFT, CONFIDENTIAL or your own text across every page (draftwatermark)', icon: I.wm, kind: 'menu', tab: 'design', group: 'background', order: 10,
    synonyms: ['Draft', 'Confidential', 'draftwatermark', 'Remove watermark'], when: doc, whyNot: anyWhy,
    menuItems: (app) => {
      const W = PS.watermark(app.src(app.main), { others: app.preambleOthers() }) || {};
      return [...['DRAFT', 'CONFIDENTIAL', 'DO NOT COPY', 'SAMPLE', 'URGENT'].map((t) => ({ name: t, title: 'The word ' + t + ' across every page', checked: !!W.on && W.text === t, radio: true, run: () => app.runCommand('watermark', { text: t }) })),
        null, { name: 'Custom watermark…', title: 'Your own text, its size, angle and colour', run: () => openWatermark(app) },
        { name: 'Remove watermark', disabled: !W.on, run: () => app.runCommand('watermark', 'off') }];
    },
    run: (app, args) => (args === 'off' ? app.pageEdit(PS.watermarkEdits(app.src(app.main), null, { others: app.preambleOthers() }), 'page-wm')
      : args && typeof args === 'object' ? app.pageEdit(PS.watermarkEdits(app.src(app.main), { ...(PS.watermark(app.src(app.main)) || {}), ...args }, { others: app.preambleOthers() }), 'page-wm')
        : app.pageMenu('watermark', app.pageCmdItems('watermark'), 'Watermark')) },
  { id: 'page-color', name: 'Page color', label: 'Page color', title: 'The colour of every page (\\pagecolor)', icon: I.color, kind: 'menu', tab: 'design', group: 'background', order: 20,
    synonyms: ['Page Color', 'Page colour', 'Background color', 'pagecolor'], when: doc, whyNot: anyWhy,
    run: (app, args) => {
      if (args !== undefined && args !== null && typeof args === 'object') return app.pageEdit(PS.pageColorEdits(app.src(app.main), args.none ? null : { ...args, needs: args.name ? colorNeeds(args.name) : null }, { others: app.preambleOthers() }), 'page-color');
      const cur = PS.pageColor(app.src(app.main));
      const theme = [...(app.model.colors ? [] : [])];
      colorPicker(app, app.pageAnchor('page-color'), { label: 'Page color', auto: 'No color', current: cur ? cur.color : null, theme,
        onPick: (v) => { app.ribbonBack(); app.runCommand('page-color', v ? v : { none: true }); } });
      return true;
    } },
  { id: 'page-borders', name: 'Page borders', label: 'Page borders', title: 'A line around every page, inside its edge', icon: I.border, tab: 'design', group: 'background', order: 30,
    synonyms: ['Page Borders', 'Border around page', 'Frame'], when: doc, whyNot: anyWhy, run: (app, args) => (args === 'off' || (args && typeof args === 'object') ? app.pageEdit(PS.borderEdits(app.src(app.main), args === 'off' ? null : args, { others: app.preambleOthers() }), 'page-border') : openBorders(app)) },
  // ---- File › Print ----
  // (named for what it prints: the group it sits in is Print, whose folded button has that name)
  { id: 'print', name: 'Print PDF', label: 'Print PDF', title: 'Print the PDF as TeX makes it, its preview beside the page (Ctrl+P)', icon: I.print, tab: 'file', group: 'print', order: 10, keys: ['Ctrl+P'], keyScope: 'app',
    synonyms: ['Print', 'Print preview', 'Print view', 'Printer'], when: (app) => !!app.model, run: (app) => app.pagePrint() },
  // ---- the Header & Footer tab ----
  { id: 'hf-date', name: 'Date', label: 'Date', title: 'Today\'s date where the caret is in the header or footer (\\today)', icon: I.date, tab: 'headfoot', group: 'insert', order: 10,
    synonyms: ['Date & Time', 'today'], when: (app) => !!app.hf, whyNot: () => 'Open the header or footer first (double click the top or bottom margin)', run: (app) => hfInsert(app, '\\today') },
  { id: 'hf-pagenum', name: 'Page number here', label: 'Page number here', title: 'The page\'s number where the caret is in the header or footer (\\thepage)', icon: I.pnum, tab: 'headfoot', group: 'insert', order: 20,
    when: (app) => !!app.hf, whyNot: () => 'Open the header or footer first', run: (app) => hfInsert(app, '\\thepage') },
  { id: 'hf-first', name: 'Different first page', label: 'First page', title: 'Nothing in the header and footer of the first page (\\thispagestyle{empty})', icon: I.first, kind: 'toggle', tab: 'headfoot', group: 'options', order: 10,
    synonyms: ['Different First Page', 'thispagestyle'], when: doc, whyNot: anyWhy, on: (app) => doc(app) && !!PS.firstPageStyle(app.src(app.main)),
    run: (app) => app.pageEdit(PS.firstPageEdits(app.src(app.main), !PS.firstPageStyle(app.src(app.main))), 'page-first') },
  { id: 'hf-oddeven', name: 'Different odd & even pages', label: 'Odd & even pages', title: 'Even pages with headers and footers of their own: the document two sided (twoside)', icon: I.oddeven, kind: 'toggle', tab: 'headfoot', group: 'options', order: 20,
    synonyms: ['Different Odd & Even Pages', 'twoside'], when: doc, whyNot: anyWhy, on: (app) => doc(app) && twoSided(app), run: (app) => app.runCommand('two-sided') },
  { id: 'hf-position', name: 'Header and footer position', label: 'Position', title: 'How far the header stands above the text and the footer below it (geometry\'s headsep and footskip)', icon: I.setup, tab: 'headfoot', group: 'options', order: 30,
    synonyms: ['Header from top', 'Footer from bottom', 'headsep', 'footskip'], when: sheet, whyNot: sheetWhy, run: (app) => { if (app.hf) hfClose(app, false); return openPageSetup(app, 'layout'); } },
  { id: 'hf-close', name: 'Close header and footer', label: 'Close', title: 'Back to the text (Escape)', icon: I.close, tab: 'headfoot', group: 'close', order: 10,
    synonyms: ['Close Header and Footer'], when: (app) => !!app.hf, run: (app) => hfClose(app, true) }
);

// \documentclass{name}: KOMA and memoir take the sizes the standard classes take (the class as
// TeX reads it: a commented line before it is no class, src/preamble.js setClass)
function classEdits(app, name) {
  const src = app.src(app.main);
  const c = PS.classPage(src);
  return c && c.name !== name ? setClass(src, name) : [];
}

onInstall((app) => installHeaderFooter(app));

export const methods = {
  // Edits of the main file as one step of history, the caret kept on its words (edits before it
  // move it). False when there was nothing to change.
  pageEdit(edits, kind) {
    if (edits === null) { this.toast('Not written: the source has a comment there. Change it in the source.', 6000); return false; }
    edits = PS.joinEdits((edits || []).filter(Boolean));
    if (!edits.length) { this.toast('The page is set up that way already.'); return false; }
    const f = this.main;
    const c = this.caretNow();
    let caret = null;
    if (c && !c.ghost && c.f === f) caret = c.collapsed ? { f, p: mapPos(edits, c.p, 1), bias: 1 } : { f, p: mapPos(edits, c.a, 1), selA: mapPos(edits, c.a, 1), selB: mapPos(edits, c.b, -1) };
    else if (c && !c.ghost) caret = { f: c.f, p: c.p };
    this.closeGroup();
    this.commit(edits.map((x) => ({ f, ...x })), caret, kind || 'page');
    this.closeGroup();
    return true;
  },
  // where a menu of the ribbon opens: its button, or the button of its group folded, or the row
  pageAnchor(id) {
    const b = document.getElementById('rc-' + id);
    if (b && b.offsetParent) return b;
    const g = b && b.closest('.rb-grp');
    const gb = g && g.querySelector('.rb-gbtn');
    if (gb && gb.offsetParent) return gb;
    const r = document.getElementById('ribbon');
    if (r) { const q = r.getBoundingClientRect(); return { left: q.left + 40, right: q.left + 200, top: q.top, bottom: q.bottom, width: 160, height: q.height }; }
    return null;
  },
  pageMenu(id, items, label) { openMenu(this, this.pageAnchor(id), items, { label }); return true; },
  pageCmdItems(id) { return this.commandMenu(command(id)); },
  // Several edits of the main file, each made on the text the one before left (fns: functions of
  // the text giving edits), as the edits of one step on the text as it is, one for each place
  pageSteps(fns) { return PS.stepEdits(this.src(this.main), fns); },

  // ---- what the page is now ----
  pageGeom() { return geometry(this.model.opts); },
  // the margins as the page has them, in points, and the preset they are (Word's, within half a point)
  pageMargins() {
    if (!this.model) return null;
    const g = this.pageGeom();
    const m = { t: g.mt, b: g.ph - g.mt - g.th, l: g.ml, r: g.pw - g.ml - g.tw, two: g.twoside };
    const geo = this.model.opts.geo || {};
    if (g.twoside) m.r = g.mlE;
    const near = (a, b) => Math.abs(a - b * CM) < 0.6;
    const hit = PS.MARGINS.find(([, , t, b, l, r, mir]) => near(m.t, t) && near(m.b, b) && near(m.l, l) && near(m.r, r) && !!mir === !!(g.twoside && geo.twoside === true));
    m.preset = hit ? hit[0] : null;
    m.gutter = geo.bindingoffset ? (PS.lenPt(geo.bindingoffset) || 0) : 0;
    if (m.gutter) m.l -= m.gutter;
    return m;
  },
  // the paper as the PDF's sheet has it (A4 where nothing sets it: src/layout.js sheetSize)
  pagePaper() {
    if (!this.model) return null;
    const g = this.pageGeom(), w = Math.min(g.pw, g.ph), h = Math.max(g.pw, g.ph);
    const hit = Object.entries(PS.PAPERS).find(([, d]) => Math.abs(d.w - w) < 1 && Math.abs(d.h - h) < 1);
    return hit ? hit[0] : null;
  },
  pageLand() { return !!(this.model && this.pageGeom().land); },
  // the page as it is, for src/pagesrc.js to keep where geometry comes to lay it out: the margins
  // (a new paper keeps them), or the text block (o.block: the header's distances change alone)
  pagePin(o = {}) {
    if (!this.model) return null;
    const g = this.pageGeom();
    return o.block ? { l: g.ml, tw: g.tw, t: g.mt, th: g.th } : { l: g.ml, r: g.pw - g.ml - g.tw, t: g.mt, b: g.ph - g.mt - g.th };
  },
  pageColumns() {
    if (!this.model) return 1;
    const BC = PS.bodyColumns(this.src(this.main));
    if (BC) return BC.n;
    return this.model.opts.twocolumn ? 2 : 1;
  },
  pageLineNumbers() { return doc(this) ? PS.lineNumbers(this.src(this.main), { others: this.preambleOthers() }) : null; },

  pageMarginsSet(id) {
    const P = PS.MARGINS.find((x) => x[0] === id);
    if (!P) return false;
    const [, , t, b, l, r, mir] = P;
    return this.pageEdit(PS.marginEdits(this.src(this.main), { t: t * CM, b: b * CM, l: l * CM, r: r * CM, mirrored: !!mir }, { others: this.preambleOthers() }), 'page-margins');
  },

  // Columns: n for the whole document, or for the selected paragraphs (multicols around them), or
  // for the multicols the caret is in
  pageColumnsSet(n, o = {}) {
    const others = this.preambleOthers();
    const at = this.ribbonAt();
    const steps = [];
    // (the space and the line between columns, from More columns)
    if (o.sep !== undefined) steps.push((t) => PS.lengthEdits(t, 'columnsep', o.sep));
    if (o.rule !== undefined) steps.push((t) => PS.lengthEdits(t, 'columnseprule', o.rule));
    const src = this.src(this.main);
    const M = at && at.c && !at.c.ghost && at.c.f === this.main ? PS.multicolsAt(src, at.c.a) : null;
    const body = PS.bodyRange(src);
    const BC = PS.bodyColumns(src);
    const whole = M && body && BC && BC.segs.some((x) => x.s === M.s);
    if (M && !whole && o.scope !== 'document') {
      // (the multicols the caret is in: its number, or gone for one column)
      // (first, on the text as the caret knows it)
      steps.unshift((t) => { const X = PS.multicolsAt(t, at.c.a); if (!X) return []; if (n === 1) return PS.unwrapMulticols(t, X); return X.nAt && +t.slice(X.nAt[0], X.nAt[1]) !== n ? [{ s: X.nAt[0], e: X.nAt[1], t: String(n) }] : []; });
    } else if (at && at.multi && o.scope !== 'document' && n > 1) {
      const r = this.pageBlocks(at);
      if (!r) { this.toast('Columns go around whole paragraphs of the main file: select paragraphs there.'); return false; }
      // (around the paragraphs first, the package after: the paragraphs' places are the text's of now)
      steps.unshift((t) => PS.wrapMulticols(t, r.s, r.e, n));
      steps.push((t) => usePackages(t, ['multicol'], { others }));
    } else steps.push((t) => PS.columnsEdits(t, n, { others }));
    return this.pageEdit(this.pageSteps(steps), 'page-cols');
  },
  // the blocks a selection covers, as [s, e) of whole lines of the main file
  pageBlocks(at) {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    const of = (n) => { const el = n.nodeType === 1 ? n : n.parentElement, i = el && el.closest('.it'); return i ? +i.dataset.b : null; };
    const a = of(r.startContainer), z = of(r.endContainer);
    const blocks = this.renderer.blocks;
    const A = blocks.find((B) => B.id === a), Z = blocks.find((B) => B.id === z);
    if (!A || !Z || A.f !== this.main || Z.f !== this.main) return null;
    const src = this.src(this.main);
    const s = src.lastIndexOf('\n', A.s - 1) + 1;
    let e = Z.e;
    while (e > s && /\s/.test(src[e - 1])) e--;
    return /\S/.test(src.slice(s, A.s)) ? null : { s, e };
  },

  // A break of a kind (src/pagesrc.js's BREAKS) at the caret: inside a paragraph between its two
  // halves (out of the groups of its words' style, src/pagesrc.js breakAt), at a block that is no
  // paragraph (a heading, a display) before or after it; none in a footnote or a box. In a two
  // column document a page break is \clearpage (\newpage ends a column there), in multicols
  // \newpage (it ends the page).
  pageBreakPlan(at, kind = 'page') {
    if (!at || at.cell || !at.c) return { blocked: 'Put the caret in the text' };
    let text = PS.BREAKS[kind];
    const f = at.c.ghost ? this.ghost.f : at.c.f;
    const src = this.src(f);
    const mc = !at.c.ghost && PS.multicolsAt(src, at.c.a);
    if (kind === 'column' && !mc) text = '\\newpage';
    if ((kind === 'page' || kind === 'blank') && this.model && this.model.opts.twocolumn && !mc) text = PS.BREAKS[kind + '2'];
    if (at.c.ghost) return PS.breakEdits(src, this.ghost.pos, this.ghost.pos, text);
    let p = at.c.a, q = at.c.b;
    const ctx = at.ctx || (at.it && at.it.dataset.ctx) || 'p';
    if (ctx === 'fn') return { blocked: 'TeX makes no new page inside a footnote: put the caret in the text' };
    const B = at.B;
    if (!/^(p|li|tex)$/.test(ctx) && B) {
      // a heading, a title, a caption, a formula: the break goes before it or after it
      let s = B.s; while (s < B.e && /\s/.test(src[s])) s++;
      let e = B.e; while (e > s && /\s/.test(src[e - 1])) e--;
      p = q = at.c.a <= s + 1 ? s : e;
      return PS.breakEdits(src, p, q, text);
    }
    // (the paragraph from its block's start: what is open at the caret)
    const start = B && B.f === f && B.s <= p ? B.s : Math.max(0, src.lastIndexOf('\n\n', p) + 1);
    return PS.breakAt(src, start, p, q, text);
  },
  pageBreakAt(kind) {
    const at = this.ribbonAt();
    if (!at || at.cell) return false;
    this.ribbonBack && this.ribbonBack();
    const r = this.pageBreakPlan(at, kind);
    if (r.blocked) { this.toast(r.blocked, 5000); return false; }
    const f = at.c.ghost ? this.ghost.f : at.c.f;
    this.closeGroup();
    this.commit(r.edits.map((x) => ({ f, ...x })), { f, p: r.caret, bias: 1 }, 'page-break');
    this.closeGroup();
    return true;
  },
  // Continuous: the multicols the caret is in ends at the caret and starts again after it
  pageContinuous() {
    const at = this.ribbonAt();
    if (!at || !at.c || at.c.ghost) return false;
    const src = this.src(at.c.f), M = PS.multicolsAt(src, at.c.a);
    if (!M) return false;
    const name = M.star ? 'multicols*' : 'multicols';
    const r = PS.breakEdits(src, at.c.a, at.c.b, '\\end{' + name + '}\n\n\\begin{' + name + '}{' + M.n + '}');
    this.commit(r.edits.map((x) => ({ f: at.c.f, ...x })), { f: at.c.f, p: r.caret, bias: 1 }, 'page-break');
    return true;
  },

  // ---- vertical alignment of a page ----
  // The page the caret is on, as \vspace*{\fill} before and after what it holds sets it: { now:
  // 'top' | 'center' | 'bottom', f, s, e, first, last } (first, last: the fills Rikuy reads there)
  pageVAlign() {
    const at = this.ribbonAt();
    if (!at || !at.it || !this.plan) return null;
    const pageEl = at.it.closest('.page');
    const k = [...this.root.querySelectorAll(':scope > .page')].indexOf(pageEl);
    const pg = this.plan[k];
    if (!pg || !pg.entries.length) return null;
    const ents = pg.entries.filter((e) => e.it.block);
    const A = ents[0], Z = ents[ents.length - 1];
    if (!A || !Z || A.a !== 0 || Z.b != null || A.it.block.f !== this.main || Z.it.block.f !== this.main) return null;
    const src = this.src(this.main);
    // (a block's range without the spaces and line breaks around it)
    const trim = (B) => { let s = B.s, e = B.e; while (s < e && /\s/.test(src[s])) s++; while (e > s && /\s/.test(src[e - 1])) e--; return { s, e }; };
    const fill = (e) => (e.it.fill ? trim(e.it.block) : null);
    const first = fill(A), last = A === Z ? null : fill(Z);
    return { now: first && last ? 'center' : first ? 'bottom' : 'top', s: trim(A.it.block).s, e: trim(Z.it.block).e, first, last };
  },
  // the edits that align that page: \vspace*{\fill} lines added or taken out
  pageVAlignEdits(src, want, V = this.pageVAlign()) {
    if (!V) return [];
    const out = [];
    const line = (x) => { const ls = src.lastIndexOf('\n', x.s - 1) + 1, nl = src.indexOf('\n', x.e); return { s: /\S/.test(src.slice(ls, x.s)) ? x.s : ls, e: nl < 0 ? x.e : nl + 1, t: '' }; };
    const top = want === 'center' || want === 'bottom', bot = want === 'center';
    if (top && !V.first) out.push({ s: V.s, e: V.s, t: '\\vspace*{\\fill}\n' });
    if (!top && V.first) out.push(line(V.first));
    if (bot && !V.last) out.push({ s: V.e, e: V.e, t: '\n\\vspace*{\\fill}' });
    if (!bot && V.last) { const l = line(V.last); out.push({ s: l.s > 0 && src[l.s - 1] === '\n' ? l.s - 1 : l.s, e: l.e - (src[l.e - 1] === '\n' ? 1 : 0), t: '' }); }
    return out;
  },

  // ---- headers, footers, page numbers ----
  // the header or the footer open on the page (for scripts and tests: the menus and a double
  // click in the margin do it for a person)
  pageHFOpen(where = 'head', o = {}) { return hfOpen(this, where === 'foot' ? 'foot' : 'head', o); },
  pageHFClose() { return hfClose(this, true); },
  pageHFItems(where) {
    const H = where === 'head';
    return [
      { name: 'Blank', title: 'An empty ' + (H ? 'header' : 'footer') + ' to type in', run: () => { this.ribbonBack(); hfOpen(this, where, { slot: 'C' }); } },
      { name: 'Three columns', title: 'Left, centre and right', run: () => { this.ribbonBack(); hfOpen(this, where, { slot: 'L' }); } },
      ...(H ? [{ name: 'Title', title: 'The document\'s title at the centre', disabled: !this.pageTitleText(), run: () => this.pageSlot(['HC'], this.pageTitleText()) }]
        : [{ name: 'Page number', title: 'The page number at the centre', run: () => this.pageSlot(['FC'], '\\thepage') }]),
      null,
      { name: H ? 'Edit header' : 'Edit footer', title: 'Type in it on the page (or double click the ' + (H ? 'top' : 'bottom') + ' margin)', run: () => { this.ribbonBack(); hfOpen(this, where); } },
      { name: H ? 'Remove header' : 'Remove footer', title: 'Nothing in the ' + (H ? 'header' : 'footer'), run: () => this.pageSlot([H ? 'HL' : 'FL', H ? 'HC' : 'FC', H ? 'HR' : 'FR'], '') }
    ];
  },
  // the title as \title has it, for a header
  pageTitleText() {
    const t = this.model && this.model.meta && this.model.meta.title;
    if (!t || !t.a) return '';
    const s = t.ctx.src.slice(t.a.is, t.a.ie).replace(/\\\\(\[[^\]]*\])?/g, ' ').replace(/\\thanks\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim();
    return s.length > 120 ? '' : s;
  },
  // Text in places of the header or footer (['HL'], ['FC']): on both sides, or on the side the
  // page is in a two sided document (o.side)
  pageSlot(places, text, o = {}) {
    return this.pageEdit(this.pageSlotSteps(places, text, o), 'page-hf');
  },
  // the edits of pageSlot, without committing them: steps of text in places, then emptied ones
  pageSlotSteps(places, text, o = {}) {
    const two = twoSided(this), others = this.preambleOthers();
    const keep = o.keep !== undefined ? o.keep : this.pageKeep();
    const steps = [...(o.before || [])];
    const set = (p, t) => (src) => PS.slotEdits(src, new Set((o.side && two ? [o.side] : ['O', 'E']).map((side) => p[0] + side + p[1])), t, { others, twoside: two, keep: keep && Object.fromEntries(Object.entries(keep).filter(([k]) => !places.some((q) => q[0] === k[0] && q[1] === k[2]) && !(o.empty || []).some((q) => q[0] === k[0] && q[1] === k[2]))) });
    for (const p of o.empty || []) steps.push(set(p, ''));
    for (const p of places) steps.push(set(p, text));
    return this.pageSteps(steps);
  },
  // what LaTeX's own style shows (plain's number at the foot, a book's running head), to keep when
  // fancyhdr or scrlayer-scrpage comes in
  pageKeep() {
    const s = this.model && this.model.opts.page;
    if (s && s.fancy) return null;
    if (!s) return { FOC: '\\thepage', FEC: '\\thepage' };
    return Object.fromEntries(Object.entries(s.slots || {}).filter(([, t]) => t));
  },
  // what pageKeep keeps but the page numbers
  pageKeepText() {
    const k = this.pageKeep();
    return k && Object.fromEntries(Object.entries(k).filter(([, t]) => !PAGE_NUM.test(t)));
  },
  pagePNItems() {
    const at = this.ribbonAt();
    const P = PS.pageNumbers(this.src(this.main)) || {};
    return [
      { name: 'Top left', title: 'The page number at the top left', run: () => this.runCommand('page-number', 'HL') },
      { name: 'Top center', title: 'The page number at the top, centred', run: () => this.runCommand('page-number', 'HC') },
      { name: 'Top right', title: 'The page number at the top right', run: () => this.runCommand('page-number', 'HR') },
      null,
      { name: 'Bottom left', run: () => this.runCommand('page-number', 'FL') },
      { name: 'Bottom center', run: () => this.runCommand('page-number', 'FC') },
      { name: 'Bottom right', run: () => this.runCommand('page-number', 'FR') },
      null,
      { name: 'Page X of Y', title: 'Page 3 of 10 at the foot (\\thepage\\ of \\pageref{LastPage}, lastpage)', run: () => this.runCommand('page-number', 'XofY') },
      { name: 'Current position', title: 'The page\'s number here in the text (\\thepage)', disabled: !this.hf && !inText(this, at), run: () => this.runCommand('page-number', 'here') },
      null,
      { name: 'Format page numbers…', title: 'i, ii, iii or A, B, C; the number the first page has (now ' + fmtNum(P.start || 1, P.numbering || 'arabic') + ')', run: () => openPageNumberFormat(this) },
      { name: 'Remove page numbers', run: () => this.runCommand('page-number', 'remove') }
    ];
  },
  // A page number placed: in one place of the header or the footer (and out of the others), as
  // Page X of Y, in the text, or taken away
  pagePageNumber(where) {
    const src = this.src(this.main);
    if (where === 'here') {
      if (this.hf) return hfInsert(this, '\\thepage');
      const at = this.ribbonAt();
      if (!inText(this, at) || at.c.ghost) return false;
      return this.commit([{ f: at.c.f, s: at.c.a, e: at.c.b, t: '\\thepage{}' }], { f: at.c.f, p: at.c.a + 10, bias: 1 }, 'page-num');
    }
    const s = this.model.opts.page || {};
    if (where === 'remove') {
      // (LaTeX's plain style: empty; a running head stays where the number goes)
      if (!s.fancy && s.style === 'plain') return this.pageEdit(PS.pageStyleEdits(src, 'empty'), 'page-num');
      const S = s.slots || {};
      const places = Object.keys(S).filter((k) => PAGE_NUM.test(S[k])).map((k) => k[0] + k[2]);
      return places.length ? this.pageSlot([...new Set(places)], '') : false;
    }
    if (where === 'XofY') {
      const others = this.preambleOthers();
      return this.pageEdit(this.pageSlotSteps(['FC'], 'Page \\thepage\\ of \\pageref{LastPage}', { before: [(t) => usePackages(t, ['lastpage'], { others })], empty: thepageIn(s, 'FC'), keep: this.pageKeepText() }), 'page-num');
    }
    // (a plain page has its number at the foot's centre already)
    if (where === 'FC' && !s.fancy && s.style === 'plain') return false;
    // (the number moves there: the one the style had is not kept, a running head is)
    return this.pageEdit(this.pageSlotSteps([where], '\\thepage', { empty: thepageIn(s, where), keep: this.pageKeepText() }), 'page-num');
  },

  // ---- print: TeX's PDF ----
  // The PDF of the document as it is now, printed: its pages drawn into a sheet only the printer
  // sees, as pdf.js's own viewer prints, each at the PDF's size for that page, one picture at a
  // time, kept as a blob each (a long document says how far it got, and Escape stops it there),
  // then the browser's print dialog. (The PDF itself in a frame would be sharper, but the page
  // allows no blob: frame: src/widget.js framesOnlySrcdoc.) A frame that may not print gets the
  // PDF itself to download instead.
  async pagePrint() {
    this.togglePdf(true);
    const fresh = () => this.lastPdf && this.lastPdfSig === this.textSigNow();
    if (!fresh()) { try { await this.compilePdf(); } catch (e) { /* the PDF pane says why */ } }
    if (!this.lastPdf) { this.toast('No PDF to print yet: TeX stopped at an error, which the PDF pane shows. The page itself prints with the browser\'s Print (its menu).', 7000); return false; }
    return this.printPdfImages();
  },
  async printPdfImages() {
    const { loadPdfjs } = await import('../pdfview.js');
    const lib = await loadPdfjs(new URL('tex/pdf.worker.min.mjs', location.href).href);
    const pdf = await lib.getDocument({ data: new Uint8Array(this.lastPdf.slice(0)), isEvalSupported: false }).promise;
    const box = document.createElement('div');
    box.id = 'print-pdf';
    box.setAttribute('aria-hidden', 'true');
    const urls = [], sizes = new Map(), rules = [];
    let stopped = false;
    const stop = (e) => { if (e.key === 'Escape') stopped = true; };
    window.addEventListener('keydown', stop, true);
    try {
      for (let k = 1; k <= pdf.numPages && !stopped; k++) {
        if (pdf.numPages > 20 && k % 10 === 1) this.toast('Drawing page ' + k + ' of ' + pdf.numPages + ' for the printer (Escape stops)…', 4000);
        const pg = await pdf.getPage(k);
        const v1 = pg.getViewport({ scale: 1 });
        // (two device pixels to the point, but no picture over 16 million pixels)
        const scale = Math.min(2, Math.sqrt(16e6 / (v1.width * v1.height)));
        const vp = pg.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        pg.cleanup();
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        c.width = c.height = 0;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        // each page at its own size: a named page for each size the PDF has
        const key = v1.width.toFixed(2) + ' ' + v1.height.toFixed(2);
        if (!sizes.has(key)) { const name = 'pp' + sizes.size; sizes.set(key, name); rules.push('@page ' + name + ' { size: ' + v1.width.toFixed(2) + 'pt ' + v1.height.toFixed(2) + 'pt; margin: 0; }'); }
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.cssText = 'width:' + v1.width.toFixed(2) + 'pt;height:' + v1.height.toFixed(2) + 'pt;page:' + sizes.get(key);
        box.appendChild(img);
      }
    } finally { pdf.destroy(); window.removeEventListener('keydown', stop, true); }
    if (stopped) this.toast('Printing ' + box.children.length + ' of the PDF\'s pages: stopped there (Escape).', 6000);
    document.getElementById('print-pdf')?.remove();
    document.body.appendChild(box);
    const st = document.getElementById('print-pdf-page') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'print-pdf-page' }));
    st.textContent = '@media print { ' + rules.join(' ') + ' body > *:not(#print-pdf) { display: none !important; } #print-pdf { display: block !important; } #print-pdf img { display: block; break-after: page; } }';
    this.printing = true; this.printSeen = false;
    await new Promise((r) => setTimeout(r, 60));
    try { window.print(); } catch (e) { /* a frame that may not print */ }
    await new Promise((r) => setTimeout(r, 300));
    const blocked = !this.printSeen;
    this.printing = false;
    this.printedPages = box.children.length;
    this.printedSizes = [...sizes.keys()];
    box.remove();
    st.textContent = '';
    for (const u of urls) URL.revokeObjectURL(u);
    if (blocked && !this.noPrintFallback) { this.toast('This window may not print: here is the PDF to print from your PDF reader.', 6000); await this.downloadPdf(); }
    return true;
  }
};

// the places of the header and footer that hold \thepage now, but one
const PAGE_NUM = /\\(?:thepage|pagemark)(?![A-Za-z@])/;
const thepageIn = (s, but) => (s.slots ? [...new Set(Object.keys(s.slots).filter((k) => PAGE_NUM.test(s.slots[k])).map((k) => k[0] + k[2]))].filter((p) => p !== but) : []);
