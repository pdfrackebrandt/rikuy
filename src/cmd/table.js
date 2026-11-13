// Batch B7, tables, as Word has them: Insert › Table with its grid of sizes, Insert Table…,
// Convert Text to Table and a table from a data file; the Table Design tab (style options,
// styles, shading, borders, pen) and the Table Layout tab (select, properties, delete, insert
// above, below, left and right, merge, split, split table, AutoFit, distribute, the nine
// alignments, text direction, cell margins, sort, repeat header rows, convert to text, a caption)
// while the caret is in a table; the table's items in the right click menu; Tab in the last cell
// adds a row, Ctrl+Enter in a cell adds one under it (outside a table Ctrl+Enter is the page's).
//
// Every operation reads the table once with src/table.js (its rows and cells as ranges of the
// source) and writes one commit of small edits there, the packages it needs in the same step
// (one undo gives the bytes back). Hand written tables are read the same way: \hline and \cline
// tables are edited in their own style, booktabs ones in theirs, and a new table is booktabs.

import { register, onInstall } from '../commands.js';
import * as X from '../table.js';
import { mapPos } from '../wrap.js';
import { BLOCKS } from '../render.js';
import { segOfSpan, boundary } from '../editor.js';
import { packageOptions, packages as pkgLines, docClass, preambleEnd, stripComments } from '../preamble.js';
import { openMenu, colorPicker, colorArg, colorNeeds } from '../ui/kit.js';
import { openTablePicker, insertTableDialog, textToTableDialog, tableToTextDialog, sortDialog, propertiesDialog, marginsDialog, deleteCellsDialog, dataFileDialog } from '../ui/tablepicker.js';

const WHY = 'Put the caret in a table cell first.';
// the table's first row of cells (after a caption row of a longtable)
const LT_MARKS = ['endhead', 'endfirsthead', 'endfoot', 'endlastfoot'];
const firstRow = (T) => Math.max(0, T.rows.findIndex((x) => x.kind === 'row'));
// the table the caret is in, read once for each look at the ribbon (every button asks)
const here = (app, at) => {
  if (!at || !at.cell || !at.c || at.c.ghost) return null;
  const m = at.memo || (at.memo = {});
  if (!('table' in m)) { try { m.table = app.tableHere(at); } catch (e) { console.error(e); m.table = null; } }
  return m.table;
};
const inTable = (app, at) => !!here(app, at);
const ICON = {
  rowAbove: '<path d="M3.5 9.5h13v7h-13zM3.5 13h13M10 9.5v7M10 2.5v4M8 4.5h4"/>',
  rowBelow: '<path d="M3.5 3.5h13v7h-13zM3.5 7h13M10 3.5v7M10 13.5v4M8 15.5h4"/>',
  colLeft: '<path d="M9.5 3.5h7v13h-7zM13 3.5v13M9.5 10h7M2.5 10h4M4.5 8v4"/>',
  colRight: '<path d="M3.5 3.5h7v13h-7zM7 3.5v13M3.5 10h7M13.5 10h4M15.5 8v4"/>',
  del: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M10 4.5v11"/><path d="M12.5 11.5l4 4M16.5 11.5l-4 4"/>',
  merge: '<path d="M3.5 5.5h13v9h-13zM7 10h6M11 8l2 2-2 2M9 8l-2 2 2 2"/>',
  split: '<path d="M3.5 5.5h13v9h-13zM10 5.5v9M5 10h3M15 10h-3"/>',
  splitTable: '<path d="M3.5 3.5h13v5h-13zM3.5 11.5h13v5h-13zM10 3.5v5M10 11.5v5"/>',
  autofit: '<path d="M3.5 4.5h13v11h-13zM10 4.5v11M5.5 10h3M14.5 10h-3M7 8.5L5.5 10 7 11.5M13 8.5l1.5 1.5-1.5 1.5"/>',
  distRows: '<path d="M3.5 3.5h13v13h-13zM3.5 7.8h13M3.5 12.2h13M17.5 5.5v9"/>',
  distCols: '<path d="M3.5 3.5h13v13h-13zM7.8 3.5v13M12.2 3.5v13M5.5 17.5h9"/>',
  direction: '<path d="M6 15.5V5M3.5 7.5L6 5l2.5 2.5M11 5.5h5.5M11 9h5.5M11 12.5h4"/>',
  margins: '<path d="M3.5 3.5h13v13h-13zM6.5 6.5h7v7h-7z" stroke-dasharray="2 1.5"/>',
  sort: '<path d="M6 4v12M3.5 13.5L6 16l2.5-2.5M11 5h3.5l-3.5 4h3.5M11 11.5h3.5v4.5"/>',
  repeat: '<path d="M3.5 3.5h13v13h-13zM3.5 7.5h13M6 11h8M6 14h8"/><path d="M3.5 3.5h13v4h-13z" style="fill:currentColor;stroke:none" opacity=".35"/>',
  toText: '<path d="M3.5 4.5h13v11h-13zM10 4.5v11"/><path d="M6 8h2M12 8h2M6 12h2M12 12h2"/>',
  caption: '<path d="M3.5 3.5h13v8h-13zM3.5 7.5h13M10 3.5v8M4 14.5h12M4 17h8"/>',
  select: '<path d="M4 4h12v12H4z" stroke-dasharray="2 1.5"/><path d="M8 8l6 2.5-2.5 1 1.5 3-1 .5-1.5-3L8 13.5z"/>',
  props: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M10 4.5v11"/><circle cx="14.5" cy="14.5" r="2.5"/><path d="M14.5 13.3v2.4M13.3 14.5h2.4"/>',
  shading: '<path d="M5 12l5-8 5 8-5 4z"/><path d="M15.5 13.5c0 1.2.8 2 .8 2s.8-.8.8-2-.8-2-.8-2-.8.8-.8 2z"/><rect x="3" y="17" width="14" height="2" style="fill:currentColor;stroke:none"/>',
  borders: '<path d="M3.5 3.5h13v13h-13z" stroke-dasharray="1.5 1.5"/><path d="M3.5 16.5h13" stroke-width="2.2"/>',
  pen: '<path d="M4 16l1-4 8-8 3 3-8 8zM12 5l3 3"/>',
  penW: '<path d="M3.5 5h13" stroke-width=".8"/><path d="M3.5 10h13" stroke-width="1.6"/><path d="M3.5 15.5h13" stroke-width="2.8"/>',
  fromText: '<path d="M3 5h6M3 8h5M3 11h6M3 14h4"/><path d="M11.5 4.5h6v11h-6zM11.5 8.5h6M11.5 12h6M14.5 4.5v11"/>',
  data: '<path d="M4 3.5h8l4 4v9H4z"/><path d="M12 3.5v4h4M7 11h6M7 14h6M10 9.5v6"/>',
  dialog: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M10 4.5v11"/><path d="M13 14.5h4M15 12.5v4"/>'
};
// a small drawing of each look, for the gallery's buttons
const LOOK_ICON = {
  plain: '<path d="M4 6h3M9 6h3M14 6h2M4 10h3M9 10h3M14 10h2M4 14h3M9 14h3M14 14h2" stroke-width="1.6"/>',
  grid: '<path d="M3.5 3.5h13v13h-13zM3.5 7.8h13M3.5 12.2h13M7.8 3.5v13M12.2 3.5v13"/>',
  booktabs: '<path d="M3 4h14" stroke-width="2"/><path d="M3 8h14" stroke-width=".9"/><path d="M3 16h14" stroke-width="2"/><path d="M5 11.5h3M10 11.5h3M5 13.8h3M10 13.8h3" stroke-width="1.2"/>',
  rows: '<path d="M3 4h14M3 8h14M3 12h14M3 16h14"/>',
  frame: '<path d="M3.5 3.5h13v13h-13z"/><path d="M6 8h3M11 8h3M6 12h3M11 12h3" stroke-width="1.2"/>'
};
const ALIGN = [['top', 't'], ['center', 'm'], ['bottom', 'b']].flatMap(([vn, v]) => [['left', 'l'], ['center', 'c'], ['right', 'r']].map(([hn, h]) => ({ v, h, vn, hn })));
const alignName = (a) => a.vn === 'center' && a.hn === 'center' ? 'Align Center' : 'Align ' + (a.vn === 'center' ? 'Center' : a.vn[0].toUpperCase() + a.vn.slice(1)) + ' ' + (a.hn === 'center' ? 'Center' : a.hn[0].toUpperCase() + a.hn.slice(1));
// the nine buttons draw lines in their corner of a box
const alignIcon = (a) => {
  // three short lines of words, in the cell's corner or middle
  const y = { t: 4, m: 8, b: 12 }[a.v];
  const line = (k, w) => { const x = a.h === 'l' ? 3 : a.h === 'c' ? 10 - w / 2 : 17 - w; return 'M' + x + ' ' + (y + k * 2.5) + 'h' + w; };
  return '<path d="' + line(0, 11) + line(1, 7) + line(2, 9) + '" stroke-width="1.5"/>';
};
const BORDERS = [
  ['border-bottom', 'Bottom Border', { bottom: 1 }, '<path d="M4 4h12v12H4z" stroke-dasharray="1.5 1.5"/><path d="M4 16h12" stroke-width="2.2"/>'],
  ['border-top', 'Top Border', { top: 1 }, '<path d="M4 4h12v12H4z" stroke-dasharray="1.5 1.5"/><path d="M4 4h12" stroke-width="2.2"/>'],
  ['border-left', 'Left Border', { left: 1 }, '<path d="M4 4h12v12H4z" stroke-dasharray="1.5 1.5"/><path d="M4 4v12" stroke-width="2.2"/>'],
  ['border-right', 'Right Border', { right: 1 }, '<path d="M4 4h12v12H4z" stroke-dasharray="1.5 1.5"/><path d="M16 4v12" stroke-width="2.2"/>'],
  ['border-none', 'No Border', { top: 0, bottom: 0, left: 0, right: 0, insideH: 0, insideV: 0 }, '<path d="M4 4h12v12H4zM4 10h12M10 4v12" stroke-dasharray="1.5 1.5"/>'],
  ['border-all', 'All Borders', { top: 1, bottom: 1, left: 1, right: 1, insideH: 1, insideV: 1 }, '<path d="M4 4h12v12H4zM4 10h12M10 4v12"/>'],
  ['border-outside', 'Outside Borders', { top: 1, bottom: 1, left: 1, right: 1 }, '<path d="M4 10h12M10 4v12" stroke-dasharray="1.5 1.5"/><path d="M4 4h12v12H4z" stroke-width="1.8"/>'],
  ['border-inside', 'Inside Borders', { insideH: 1, insideV: 1 }, '<path d="M4 4h12v12H4z" stroke-dasharray="1.5 1.5"/><path d="M4 10h12M10 4v12" stroke-width="1.8"/>'],
  ['border-inside-h', 'Inside Horizontal Border', { insideH: 1 }, '<path d="M4 4h12v12H4zM10 4v12" stroke-dasharray="1.5 1.5"/><path d="M4 10h12" stroke-width="1.8"/>'],
  ['border-inside-v', 'Inside Vertical Border', { insideV: 1 }, '<path d="M4 4h12v12H4zM4 10h12" stroke-dasharray="1.5 1.5"/><path d="M10 4v12" stroke-width="1.8"/>']
];
const WEIGHTS = [['0.4pt', '½ pt (LaTeX\'s own)'], ['0.8pt', '¾ pt'], ['1pt', '1 pt'], ['1.5pt', '1½ pt'], ['2.25pt', '2¼ pt']];

const T = (id, name, o) => ({ id, name, when: inTable, whyNot: () => WHY, ...o });
register(
  // ---- Insert ----------------------------------------------------------------------------------
  // Table on Home (Rikuy's Insert group: one press, a table of two by two), and on Insert as
  // Word has it, with the arrow for the grid of sizes and the other ways in
  { id: 'table', name: 'Table', order: 30, title: 'Table: a table of two by two, booktabs\' rules (Insert › Table\'s arrow: its size, Insert Table…, Convert Text to Table, a table from a data file)', synonyms: ['Insert table', 'tabular', 'Grid'], tab: 'home', group: 'insert', el: 'rb-table', label: 'Table',
    icon: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M10 4.5v11"/>',
    run: (app, args) => app.insertTable(args && args.rows, args && args.cols, args || {}) },
  { id: 'insert-table', name: 'Table', order: 30, title: 'Table: a table of two by two, booktabs\' rules; the arrow for its size, Insert Table…, Convert Text to Table and a table from a data file', tab: 'insert', group: 'tables', el: 'ri-table', label: 'Table', kind: 'split', searchable: false,
    icon: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M10 4.5v11"/>',
    run: (app, args) => app.insertTable(args && args.rows, args && args.cols, args || {}), menuItems: (app) => app.tablePickerItems() },
  { id: 'insert-table-dialog', name: 'Insert Table', title: 'Insert Table…: its number of columns and rows, and how it fits (to its contents, to the page\'s width as tabularx, columns of a set width)', tab: 'insert', group: 'tables', order: 40, icon: ICON.dialog,
    synonyms: ['Table size', 'Insert Table…', 'New table'], when: (app, at) => !!at, run: (app, args) => (args ? app.insertTable(args.rows, args.cols, args) : insertTableDialog(app)) },
  { id: 'text-to-table', name: 'Convert Text to Table', title: 'Convert Text to Table…: the selected lines become rows, cut at tabs, commas, semicolons or &', tab: 'insert', group: 'tables', order: 50, icon: ICON.fromText,
    synonyms: ['Text to table', 'Table from text', 'CSV to table'], when: (app, at) => !!app.textToTableRange(at), whyNot: () => 'Select the lines to make a table of (paragraphs of plain text).', run: (app, args) => (args && args.sep ? app.textToTable(args.sep, args) : textToTableDialog(app)) },
  { id: 'table-from-data', name: 'Table from Data File', title: 'Table from Data File…: a .csv of the project set as a table by csvsimple (\\csvautobooktabular), read again at every compile', tab: 'insert', group: 'tables', order: 60, icon: ICON.data,
    synonyms: ['CSV', 'Spreadsheet', 'Excel', 'Data table', 'csvautotabular', 'pgfplotstable'], when: (app, at) => !!at, run: (app, args) => (args && args.file ? app.insertDataTable(args.file, args) : dataFileDialog(app)) },

  // ---- Table Layout: Table -------------------------------------------------------------------------
  T('table-select', 'Select', { title: 'Select the cell, the column, the row or the table', tab: 'table-layout', group: 'table', order: 10, kind: 'menu', icon: ICON.select, label: 'Select', synonyms: ['Select table'],
    run: (app, args) => (args && args.what ? app.tableSelect(args.what) : app.tableMenu('table-select')) }),
  T('select-cell', 'Select Cell', { title: 'Select Cell: its words', run: (app) => app.tableSelect('cell') }),
  T('select-column', 'Select Column', { title: 'Select Column: every cell of the caret\'s column', run: (app) => app.tableSelect('column') }),
  T('select-row', 'Select Row', { title: 'Select Row: every cell of the caret\'s row', run: (app) => app.tableSelect('row') }),
  T('select-table', 'Select Table', { title: 'Select Table: every cell', run: (app) => app.tableSelect('table') }),
  T('table-properties', 'Properties', { title: 'Table Properties…: the table\'s width and alignment, its rows\' height, the column\'s width, the cell\'s vertical alignment', tab: 'table-layout', group: 'table', order: 20, icon: ICON.props, 
    synonyms: ['Table Properties', 'Table width', 'Column width', 'Row height', 'arraystretch'], menu: { table: 60 }, run: (app, args) => (args ? app.tableProperties(args) : propertiesDialog(app)) }),
  T('table-caption', 'Insert Caption', { title: 'Insert Caption: the table\'s caption (\\caption, numbered "Table 1"), made where there is none, the table put in a float', tab: 'table-layout', group: 'table', order: 30, icon: ICON.caption,
    synonyms: ['Caption', 'Table caption', 'Title of table'], menu: { table: 70 }, run: (app) => app.tableCaption() }),

  // ---- Table Layout: Rows & Columns -----------------------------------------------------------------
  T('table-delete', 'Delete', { title: 'Delete cells, columns, rows or the table', tab: 'table-layout', group: 'rows', order: 10, kind: 'menu', icon: ICON.del, label: 'Delete', menu: { table: 20 },
    run: (app) => app.tableMenu('table-delete') }),
  T('delete-cells', 'Delete Cells', { title: 'Delete Cells…: the cells go, those right of them shift left or those under them shift up', synonyms: ['Remove cells'], run: (app, args) => (args && args.how ? app.tableDeleteCells(args.how) : deleteCellsDialog(app)) }),
  T('delete-columns', 'Delete Columns', { title: 'Delete Columns: the selected columns, their letters in the specification with them', synonyms: ['Remove column', 'Delete column'], run: (app) => app.tableDeleteCols() }),
  T('delete-rows', 'Delete Rows', { title: 'Delete Rows: the selected rows, with their \\\\ (and their rule in a grid)', synonyms: ['Remove row', 'Delete row'], run: (app) => app.tableDeleteRows() }),
  T('delete-table', 'Delete Table', { title: 'Delete Table: the table, with the float around it', synonyms: ['Remove table'], run: (app) => app.tableDelete() }),
  T('table-row-above', 'Insert above', { title: 'Insert a row above the caret\'s', synonyms: ['Insert Above', 'Insert row above', 'Add row above'], tab: 'table-layout', group: 'rows', order: 20, label: 'Insert above', icon: ICON.rowAbove, menu: { table: 11 }, run: (app) => app.tableInsertRow(false) }),
  T('table-row-below', 'Insert below', { title: 'A row below the caret\'s (Ctrl+Enter)', synonyms: ['Insert Below', 'Insert row below', 'New row', 'Add row'], tab: 'table-layout', group: 'rows', order: 30, label: 'Insert below', icon: ICON.rowBelow,
    keys: ['Ctrl+Enter'], keyRank: 1, menu: { table: 10 }, run: (app) => app.tableRow() }),
  T('table-col-left', 'Insert left', { title: 'Insert a column left of the caret\'s', synonyms: ['Insert Left', 'Insert column left', 'Add column'], tab: 'table-layout', group: 'rows', order: 40, label: 'Insert left', icon: ICON.colLeft, menu: { table: 12 }, run: (app) => app.tableInsertCol(false) }),
  T('table-col-right', 'Insert right', { title: 'Insert a column right of the caret\'s', synonyms: ['Insert Right', 'Insert column right', 'Add column'], tab: 'table-layout', group: 'rows', order: 50, label: 'Insert right', icon: ICON.colRight, menu: { table: 13 }, run: (app) => app.tableInsertCol(true) }),

  // ---- Table Layout: Merge -------------------------------------------------------------------------------
  T('merge-cells', 'Merge Cells', { title: 'Merge Cells: across a row \\multicolumn, down a column \\multirow (multirow), both together; their words in the first', tab: 'table-layout', group: 'merge', order: 10, icon: ICON.merge, label: 'Merge Cells',
    synonyms: ['Merge', 'multicolumn', 'multirow', 'Join cells'], menu: { table: 30 }, when: (app, at) => { const h = here(app, at); return !!h && h.multi; }, whyNot: () => 'Select two cells or more to merge.', run: (app) => app.tableMerge() }),
  T('split-cells', 'Split Cells', { title: 'Split Cells: a merged cell back into its cells, its words in the first', tab: 'table-layout', group: 'merge', order: 20, icon: ICON.split, label: 'Split Cells',
    synonyms: ['Unmerge', 'Split'], menu: { table: 31 }, when: (app, at) => { const h = here(app, at); return !!h && (!!h.cell.mr || (!!h.cell.mc && h.cell.mc.n > 1)); }, whyNot: () => 'Put the caret in a merged cell.', run: (app) => app.tableSplitCell() }),
  T('split-table', 'Split Table', { title: 'Split Table: two tables, the second from the caret\'s row, each with the table\'s top and bottom rules', tab: 'table-layout', group: 'merge', order: 30, icon: ICON.splitTable, 
    when: (app, at) => { const h = here(app, at); return !!h && h.r > 0; }, whyNot: () => 'Put the caret in a row below the first.', run: (app) => app.tableOp((src, t, h) => X.splitTable(src, t, h.r)) }),

  // ---- Table Layout: Cell Size -----------------------------------------------------------------------------
  T('autofit', 'AutoFit', { title: 'AutoFit: to the contents (l c r), to the window (tabularx, X columns), or columns of a set width (p{})', tab: 'table-layout', group: 'size', order: 10, kind: 'menu', icon: ICON.autofit, label: 'AutoFit', menu: { table: 45 },
    run: (app) => app.tableMenu('autofit') }),
  T('autofit-contents', 'AutoFit Contents', { title: 'AutoFit Contents: each column as wide as its words (l, c, r)', on: (app, at) => { const h = here(app, at); return !!h && X.fitOf(h.src, h.T) === 'contents'; }, run: (app) => app.tableFit('contents') }),
  T('autofit-window', 'AutoFit Window', { title: 'AutoFit Window: the table as wide as the text (tabularx with X columns)', synonyms: ['tabularx', 'Full width'], on: (app, at) => { const h = here(app, at); return !!h && X.fitOf(h.src, h.T) === 'window'; }, run: (app) => app.tableFit('window') }),
  T('autofit-fixed', 'Fixed Column Width', { title: 'Fixed Column Width: each column a paragraph column of the width it has now (p{…})', on: (app, at) => { const h = here(app, at); return !!h && X.fitOf(h.src, h.T) === 'fixed'; }, run: (app) => app.tableFit('fixed') }),
  T('distribute-rows', 'Distribute Rows', { title: 'Distribute Rows: rows of one height (the extra space after \\\\[…] goes)', tab: 'table-layout', group: 'size', order: 20, icon: ICON.distRows, run: (app) => app.tableOp((src, t) => X.distributeRows(src, t)) }),
  T('distribute-columns', 'Distribute Columns', { title: 'Distribute Columns: columns of one width (X in tabularx, else the same p{} each)', tab: 'table-layout', group: 'size', order: 30, icon: ICON.distCols, menu: { table: 41 }, run: (app) => app.tableDistributeCols() }),

  // ---- Table Layout: Alignment (Word's nine) ------------------------------------------------------------------
  ...ALIGN.map((a, k) => T('align-' + a.vn + '-' + a.hn, alignName(a), {
    title: alignName(a) + ': ' + (a.h === 'c' ? 'centred' : a.h === 'r' ? 'to the right' : 'to the left') + (a.v === 't' ? '' : a.v === 'm' ? ', in the middle of the row (an m{} column)' : ', at the row\'s foot (a b{} column)') + '; the whole column when all of it is selected, else the cells as \\multicolumn{1}{…}',
    tab: 'table-layout', group: 'alignment', order: 10 + k, icon: alignIcon(a), synonyms: k === 4 ? ['Center cell', 'Middle'] : [], kind: 'toggle',
    when: (app, at) => { const h = here(app, at); return !!h && (a.v === 't' || app.tableVertical(h)); },
    whyNot: () => (a.v === 't' ? WHY : 'Middle and bottom need a column of a set width: AutoFit › Fixed Column Width first.'),
    on: (app, at) => { const h = here(app, at); if (!h) return false; const s = app.tableAlignState(h); return s.h === a.h && s.v === a.v; },
    run: (app) => app.tableAlign(a.h, a.v)
  })),
  T('text-direction', 'Text Direction', { title: 'Text Direction: the cell\'s words turned up (\\rotatebox{90}), then down (270), then level again', tab: 'table-layout', group: 'alignment', order: 30, icon: ICON.direction, 
    synonyms: ['Rotate text', 'rotatebox', 'Vertical text'], menu: { table: 50 }, run: (app) => app.tableTurn() }),
  T('cell-margins', 'Cell Margins', { title: 'Cell Margins…: the space at the cells\' sides (\\tabcolsep) and above their words (\\extrarowheight)', tab: 'table-layout', group: 'alignment', order: 40, icon: ICON.margins, 
    synonyms: ['Padding', 'tabcolsep', 'Cell spacing'], run: (app, args) => (args ? app.tableSettings([['tabcolsep', args.side ?? null], ['extrarowheight', args.top ?? null, ['array']]]) : marginsDialog(app)) }),

  // ---- Table Layout: Data ---------------------------------------------------------------------------------------
  T('table-sort', 'Sort', { title: 'Sort…: the rows by a column, as text or numbers, up or down; the header row stays', tab: 'table-layout', group: 'data', order: 10, icon: ICON.sort, label: 'Sort',
    synonyms: ['Sort rows', 'Sort table', 'Order'], run: (app, args) => (args ? app.tableSort(args) : sortDialog(app)) }),
  T('repeat-header', 'Repeat Header Rows', { title: 'Repeat Header Rows: the header rows again on every page the table runs over (a longtable with \\endhead)', tab: 'table-layout', group: 'data', order: 20, icon: ICON.repeat,  kind: 'toggle',
    synonyms: ['longtable', 'endhead', 'Header on every page'], on: (app, at) => { const h = here(app, at); return !!h && X.repeats(h.T); },
    // (as in Word: the rows that repeat are the table's first ones, down to the selection's last)
    when: (app, at) => { const h = here(app, at); return !!h && (X.repeats(h.T) || h.rect.r0 <= firstRow(h.T)); },
    whyNot: () => 'Put the caret in the table\'s first row (or select its first rows): those rows repeat on every page.', run: (app) => app.tableRepeatHeader() }),
  T('table-to-text', 'Convert to Text', { title: 'Convert to Text…: each row a paragraph, its cells joined by commas, tabs (\\quad) or semicolons, or each cell a paragraph', tab: 'table-layout', group: 'data', order: 30, icon: ICON.toText, 
    synonyms: ['Table to text', 'Remove table keep text'], run: (app, args) => (args && args.sep ? app.tableToText(args.sep) : tableToTextDialog(app)) }),

  // ---- Table Design: options -------------------------------------------------------------------------------------
  T('header-row', 'Header Row', { icon: '<path d="M3.5 3.5h13v13h-13zM3.5 7.5h13M3.5 12h13M10 3.5v13"/><path d="M3.5 3.5h13v4h-13z" style="fill:currentColor;stroke:none" opacity=".45"/>', label: 'Header Row', title: 'Header Row: the first row bold, with a rule under it', tab: 'table-design', group: 'options', order: 10, kind: 'toggle', synonyms: ['Table header'], on: (app, at) => { const h = here(app, at); return !!h && X.headerOn(h.src, h.T, false); }, run: (app) => app.tableHeader(false) }),
  T('total-row', 'Total Row', { icon: '<path d="M3.5 3.5h13v13h-13zM3.5 8h13M3.5 12.5h13M10 3.5v13"/><path d="M3.5 12.5h13v4h-13z" style="fill:currentColor;stroke:none" opacity=".45"/>', label: 'Total Row', title: 'Total Row: the last row bold, with a rule over it', tab: 'table-design', group: 'options', order: 20, kind: 'toggle', synonyms: ['Footer row', 'Sum row'], on: (app, at) => { const h = here(app, at); return !!h && X.headerOn(h.src, h.T, true); }, run: (app) => app.tableHeader(true) }),
  T('banded-rows', 'Banded Rows', { icon: '<path d="M3.5 3.5h13v13h-13z"/><path d="M3.5 6.75h13v3.25h-13zM3.5 13.25h13v3.25h-13z" style="fill:currentColor;stroke:none" opacity=".4"/>', label: 'Banded Rows', title: 'Banded Rows: every second row shaded (\\rowcolors, xcolor\'s table option)', tab: 'table-design', group: 'options', order: 30, kind: 'toggle', synonyms: ['Zebra', 'Striped rows', 'rowcolors'], on: (app, at) => { const h = here(app, at); return !!h && !!X.settingsOf(h.src, h.T).rowcolors; }, run: (app) => app.tableBanded() }),
  T('first-column', 'First Column', { icon: '<path d="M3.5 3.5h13v13h-13zM7.5 3.5v13M12 3.5v13M3.5 10h13"/><path d="M3.5 3.5h4v13h-4z" style="fill:currentColor;stroke:none" opacity=".45"/>', label: 'First Column', title: 'First Column: its words bold (>{\\bfseries}, array)', tab: 'table-design', group: 'options', order: 40, kind: 'toggle', on: (app, at) => { const h = here(app, at); return !!h && X.colBold(h.src, h.T, 0); }, run: (app) => app.tableColBold(false) }),
  T('last-column', 'Last Column', { icon: '<path d="M3.5 3.5h13v13h-13zM8 3.5v13M12.5 3.5v13M3.5 10h13"/><path d="M12.5 3.5h4v13h-4z" style="fill:currentColor;stroke:none" opacity=".45"/>', label: 'Last Column', title: 'Last Column: its words bold (>{\\bfseries}, array)', tab: 'table-design', group: 'options', order: 50, kind: 'toggle', on: (app, at) => { const h = here(app, at); return !!h && X.colBold(h.src, h.T, h.T.spec.cols.length - 1); }, run: (app) => app.tableColBold(true) }),
  T('banded-columns', 'Banded Columns', { icon: '<path d="M3.5 3.5h13v13h-13z"/><path d="M6.75 3.5h3.25v13h-3.25zM13.25 3.5h3.25v13h-3.25z" style="fill:currentColor;stroke:none" opacity=".4"/>', label: 'Banded Columns', title: 'Banded Columns: every second column shaded (>{\\columncolor})', tab: 'table-design', group: 'options', order: 60, kind: 'toggle', synonyms: ['Striped columns'], on: (app, at) => { const h = here(app, at); return !!h && X.bandedCols(h.src, h.T); }, run: (app) => app.tableBandedCols() }),

  // ---- Table Design: styles, shading ----------------------------------------------------------------------------------
  ...Object.entries(X.LOOKS).map(([k, L], i) => T('table-look-' + k, L.name, {
    title: L.name + ': ' + { plain: 'no rules', grid: 'every cell ruled (| in the specification, \\hline under every row)', booktabs: 'booktabs\' rules: \\toprule, \\midrule under the header, \\bottomrule (the look of new tables)', rows: '\\hline under every row, no bars', frame: 'a box around the table' }[k],
    tab: 'table-design', group: 'styles', order: 10 + i, kind: 'toggle', icon: LOOK_ICON[k], synonyms: ['Table style', 'Table styles'],
    on: (app, at) => { const h = here(app, at); return !!h && app.tableLookOf(h) === k; }, run: (app) => app.tableLook(k)
  })),
  T('table-shading', 'Shading', { title: 'Shading: the cells\' background (\\cellcolor; whole rows \\rowcolor), in the colour picked last; the arrow for every colour', tab: 'table-design', group: 'styles', order: 30, kind: 'split', icon: ICON.shading,
    synonyms: ['Cell color', 'Background', 'cellcolor', 'rowcolor', 'Fill'], run: (app, args) => app.tableShade(args && 'pick' in args ? args.pick : undefined), menuItems: (app, at) => app.shadingItems(at) }),

  // ---- Table Design: borders, pen ------------------------------------------------------------------------------------
  T('table-borders', 'Table Borders', { title: 'Borders: the border picked last (Bottom Border to begin with) on the selected cells, or the whole table with the caret alone; the arrow for every border', tab: 'table-design', group: 'borders', order: 10, kind: 'split', icon: ICON.borders,
    synonyms: ['Borders', 'Border', 'Lines', 'Rules', 'hline', 'cline'], run: (app, args) => app.tableBorder(args && args.id ? args.id : app.lastBorder || 'border-bottom'), menuItems: (app, at) => app.borderItems(at) }),
  ...BORDERS.map(([id, name, parts, icon]) => T(id, name, { title: name + ': ' + (parts.left != null || parts.right != null || parts.insideV != null ? 'bars in the specification, the whole height of the table' : 'rules: \\hline over all the columns, \\cline over some'), icon, synonyms: ['Border'], kind: 'toggle',
    on: (app, at) => { const h = here(app, at); return !!h && app.borderOn(h, parts); }, run: (app) => app.tableBorder(id) })),
  T('pen-weight', 'Pen Weight', { title: 'Pen Weight: how thick the table\'s rules are (\\arrayrulewidth)', tab: 'table-design', group: 'borders', order: 20, kind: 'menu', icon: ICON.penW, synonyms: ['Line weight', 'Border width', 'arrayrulewidth'],
    run: (app, args) => (args && 'w' in args ? app.tableSetting('arrayrulewidth', args.w) : app.tableMenu('pen-weight')) }),
  T('pen-color', 'Pen Color', { title: 'Pen Color: the colour of the table\'s rules (\\arrayrulecolor, colortbl)', tab: 'table-design', group: 'borders', order: 30, kind: 'menu', icon: ICON.pen, synonyms: ['Border color', 'arrayrulecolor'],
    run: (app, args) => (args && 'pick' in args ? app.tablePenColor(args.pick) : app.penColorPicker()) })
);

// how a picked colour is written as an argument: {name} or [HTML]{C00000}
const colorText = (pick) => { const a = colorArg(pick); return (a.model ? '[' + a.model + ']' : '') + '{' + a.value + '}'; };

export const methods = {
  // ---- where the caret is ---------------------------------------------------------------------
  // The table the caret is in: { f, src, T, r, k, cell (the caret's), rect (the selection's cells,
  // grown to the merged cells it cuts), multi (more than one cell) } or null. any: also when the
  // caret is not in a cell (whether a table holds it at all)
  tableHere(at, any) {
    const c = at && at.c;
    if (!c || c.ghost || c.f == null) return null;
    if (any) return at.cell ? true : null;
    const f = c.f, src = this.src(f), B = at.B;
    const lo = B ? B.s : Math.max(0, c.a - 400000), hi = B ? B.e : c.a + 1;
    const T = X.tableAt(src, c.a, lo, hi);
    if (!T) return null;
    const A = X.cellAt(T, c.a);
    if (!A) return null;
    const Z = c.collapsed ? A : X.cellAt(T, Math.min(c.b, T.bodyE)) || A;
    const rect = X.grow(T, { r0: Math.min(A.r, Z.r), r1: Math.max(A.r, Z.r), c0: Math.min(A.cell.col, Z.cell.col), c1: Math.max(A.cell.col + A.cell.span - 1, Z.cell.col + Z.cell.span - 1) });
    return { f, src, T, r: A.r, k: A.k, cell: A.cell, rect, multi: A.cell !== Z.cell, c };
  },

  // Runs one table operation fn(src, T, here) → { edits, p, packages } | { error } as one commit
  tableOp(fn) {
    const at = this.ribbonAt(), h = at && this.tableHere(at);
    if (!h) { this.toast(WHY); return false; }
    const r = fn(h.src, h.T, h);
    if (!r) return false;
    if (r.error) { this.toast(r.error); return false; }
    if (r.table) return this.tableDelete();
    return this.tableApply(h, r);
  },
  tableApply(h, r) {
    const f = h.f;
    const edits = (r.edits || []).map((x) => ({ f, s: x.s, e: x.e, t: x.t }));
    const pk = this.tablePackages(r.packages || []);
    if (!edits.length && !pk.length) return false;
    const mine = [...edits, ...pk.filter((x) => x.f === f)];
    const map = (p) => mapPos(mine, p);
    let caret;
    if (r.p != null) { let p = r.p; for (const x of pk) if (x.f === f && x.s <= p) p += x.t.length - (x.e - x.s); caret = { f, p, bias: 1 }; }
    else caret = h.c.collapsed ? { f, p: map(h.c.a) } : { f, p: map(h.c.a), selA: map(h.c.a), selB: map(h.c.b) };
    this.closeGroup();
    this.removeGhost();
    this.commit([...edits, ...pk], caret, 'table');
    this.closeGroup();
    if (r.p != null) this.caretToCell(f, caret.p);
    return true;
  },
  // The \usepackage lines an operation needs, as edits ('xcolor-table': xcolor with its table
  // option, which \cellcolor, \rowcolor and \rowcolors need)
  tablePackages(names) {
    const want = {}, xc = {};
    for (const n of new Set(names)) {
      if (n === 'xcolor-table') xc.table = true;
      else if (n === 'xcolor-dvips') xc.dvipsnames = true;
      else if (n === 'fontenc-T1') want.fontenc = { T1: true };
      else want[n] = null;
    }
    // (xcolor in the same run as the others where it is a \usepackage line, new or merged: the
    // lines come in the order asked; else its \PassOptionsToPackage)
    const x = Object.keys(xc).length ? this.xcolorEdits(xc) : null;
    if (x && x.pkg) want.xcolor = x.pkg;
    else if (x && x.plain) want.xcolor = null;
    const out = Object.keys(want).length ? this.packageEdits(want) : [];
    return [...out, ...(x && x.edits ? x.edits : [])];
  },
  // xcolor's options (table: \cellcolor, \rowcolor, \rowcolors; dvipsnames: a colour of its names),
  // once and without an option clash: merged into its \usepackage where nothing loads xcolor
  // before it; else \PassOptionsToPackage{…}{xcolor} before anything can (right after
  // \documentclass; before it for beamer, which loads xcolor itself)
  xcolorEdits(want) {
    const f = this.main, src = this.src(f), end = preambleEnd(src);
    if (end < 0) return null;
    const others = this.preambleOthers ? this.preambleOthers() : [];
    const pre = stripComments(src.slice(0, end));
    const opts = packageOptions(src, 'xcolor', end, others) || {};
    const D = docClass(src);
    const passed = (k) => new RegExp('\\\\PassOptionsToPackage\\s*\\{[^{}]*\\b' + k + '\\b[^{}]*\\}\\s*\\{\\s*xcolor\\s*\\}').test(pre) || (D && new RegExp('\\b' + k + '\\b').test(String((D.options || {}).xcolor || '')));
    const lack = Object.keys(want).filter((k) => !opts[k] && !passed(k));
    if (!lack.length) return null;
    const lines = pkgLines(src, end);
    const LOADERS = new Set(['tikz', 'pgf', 'pgfplots', 'tcolorbox', 'todonotes', 'colortbl', 'pstricks', 'beamerarticle', 'mdframed', 'forest', 'circuitikz', 'pgfgantt', 'smartdiagram', 'tikz-cd', 'chemfig', 'listings', 'minted', 'tabularray', 'nicematrix']);
    const xi = lines.findIndex((p) => p.names.some((n) => n.name === 'xcolor'));
    const loaderBefore = lines.some((p, k) => (xi < 0 || k < xi) && p.names.some((n) => LOADERS.has(n.name)));
    const beamer = D && /^beamer/.test(D.name);
    if (!beamer && !loaderBefore) return { pkg: Object.fromEntries(lack.map((k) => [k, true])) };
    // (before the class for beamer; else on the line after \documentclass)
    const nl = /\r\n/.test(src.slice(0, 2000)) ? '\r\n' : '\n';
    const line = '\\PassOptionsToPackage{' + lack.join(',') + '}{xcolor}' + nl;
    let at = 0;
    if (!beamer && D) { const z = src.indexOf('\n', D.e); at = z < 0 ? src.length : z + 1; }
    else if (D) at = src.lastIndexOf('\n', D.s - 1) + 1;
    // (and xcolor itself where no line loads it: listings, tabularray and colortbl alone do not,
    // and \rowcolors, \cellcolor and yellow!20 are xcolor's; after a package that did, it does nothing)
    return { edits: [{ f, s: at, e: at, t: line }], plain: xi < 0 && !beamer };
  },

  // The caret in the cell that holds p (its first words, or its empty place)
  caretToCell(f, p) {
    const src = this.src(f), T = X.tableAt(src, p, Math.max(0, p - 400000), p + 1);
    if (!T) return;
    const hit = X.cellAt(T, p);
    if (!hit) return;
    const c = hit.cell;
    const tds = this.root.querySelectorAll('td span.t');
    for (const sp of tds) {
      const info = segOfSpan(sp);
      if (!info || info.seg.f !== f) continue;
      const q = boundary(info.B, info.seg, info.o);
      if (q < c.s || q > c.e) continue;
      const r = document.createRange();
      if (!c.empty && p >= c.ks && p <= c.ce) { this.restoreCaret({ f, p }); return; }
      r.setStart(sp.firstChild || sp, sp.firstChild && info.seg.ph ? sp.firstChild.length : 0);
      r.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      this.root.focus({ preventScroll: true });
      return;
    }
  },

  // ---- inserting a table --------------------------------------------------------------------
  // A table of r rows and c columns after the block the caret is in (two by two from the button),
  // booktabs' rules and a header row, in a table float with a caption under it, the caret in its
  // first cell. o: { fit, width, caption, header }
  insertTable(rows, cols, o = {}) {
    const { f, p, pre, post } = this.afterBlockPos();
    const r = rows || 2, c = cols || 2;
    const nl = /\r\n/.test(this.src(f).slice(0, 4000)) ? '\r\n' : '\n';
    const text = X.newTableText(r, c, { fit: o.fit, width: o.width, caption: o.caption, header: o.header, eol: nl });
    const pk = this.tablePackages(['booktabs', ...(o.fit === 'window' ? ['tabularx'] : [])]);
    const first = text.indexOf('\\toprule') + 8 + nl.length;
    let at = p + pre.length + first;
    for (const x of pk) if (x.f === f && x.s <= p) at += x.t.length - (x.e - x.s);
    this.closeGroup();
    this.removeGhost();
    this.commit([{ f, s: p, e: p, t: pre + text + post }, ...pk], { f, p: at, bias: 1 }, 'insert');
    this.closeGroup();
    this.caretToCell(f, at);
  },
  // the Table button's arrow: the grid of sizes and the other ways in (also its menu by name)
  tablePickerItems() {
    return [{ name: 'Insert Table…', title: 'Its number of columns and rows, and how it fits', icon: ICON.dialog, run: () => insertTableDialog(this) },
      { name: 'Convert Text to Table…', icon: ICON.fromText, disabled: !this.textToTableRange(this.ribbonAt()), run: () => textToTableDialog(this) },
      { name: 'Table from Data File…', icon: ICON.data, run: () => dataFileDialog(this) }];
  },

  // The plain paragraphs a selection covers, for Convert Text to Table: { f, s, e, text } or null
  textToTableRange(at) {
    if (!at || !at.c || at.c.ghost || at.cell || at.c.collapsed) return null;
    const c = at.c, src = this.src(c.f);
    // whole paragraphs: from the start of the first block's words to the end of the last
    const r = getSelection().rangeCount ? getSelection().getRangeAt(0) : null;
    if (!r) return null;
    const of = (n) => { const el = n.nodeType === 1 ? n : n.parentElement, i = el && el.closest('.it'); return i ? BLOCKS.get(+i.dataset.b) : null; };
    const A = of(r.startContainer), Z = of(r.endContainer);
    if (!A || !Z || A.f !== Z.f) return null;
    let s = A.s, e = Z.e;
    while (s < e && /\s/.test(src[s])) s++;
    while (e > s && /\s/.test(src[e - 1])) e--;
    const text = src.slice(s, e);
    if (!text || e - s > 200000 || /\\begin\s*\{|\\(?:sub)*section\b|\\\[|\$\$/.test(text)) return null;
    return { f: c.f, s, e, text };
  },
  // Convert Text to Table: the lines become a table's rows, cut at sep
  textToTable(sep, o = {}) {
    const R = this.textToTableRange(this.ribbonAt());
    if (!R) { this.toast('Select the lines to make a table of.'); return false; }
    const rows = X.splitRows(R.text, sep);
    const cols = Math.max(1, ...rows.map((x) => x.length));
    const nl = /\r\n/.test(R.text) ? '\r\n' : '\n';
    const text = X.newTableText(rows.length, cols, { cells: rows, caption: o.caption === true, header: o.header !== false, fit: o.fit, eol: nl });
    const pk = this.tablePackages(['booktabs', ...(o.fit === 'window' ? ['tabularx'] : [])]);
    let at = R.s + text.indexOf('\\toprule') + 8 + nl.length;
    for (const x of pk) if (x.f === R.f && x.s <= R.s) at += x.t.length - (x.e - x.s);
    this.closeGroup();
    this.commit([{ f: R.f, s: R.s, e: R.e, t: text }, ...pk], { f: R.f, p: at, bias: 1 }, 'table');
    this.closeGroup();
    this.caretToCell(R.f, at);
    return true;
  },
  // Table from Data File: \csvautobooktabular{file} in a table float (csvsimple, booktabs)
  insertDataTable(file, o = {}) {
    const { f, p, pre, post } = this.afterBlockPos();
    const nl = '\n';
    const name = String(file).replace(/[{}\\%#]/g, '');
    // (respect all: a value's _ % & $ # are its own characters, as the page shows them, not TeX's)
    const cmd = (o.booktabs === false ? '\\csvautotabular' : '\\csvautobooktabular') + '[respect all' + (o.sep && o.sep !== ',' ? ',separator=' + { ';': 'semicolon', '\t': 'tab', ' ': 'space' }[o.sep] : '') + ']{' + name + '}';
    const text = ['\\begin{table}[h]', '\\centering', cmd, '\\caption{}', '\\end{table}'].join(nl);
    // (respect all prints a value's _ { } \\ ~ ^ as the characters themselves: in LaTeX's first
    // encoding, OT1, those places hold other glyphs (_ is a dot accent), so T1 comes where the
    // document names no encoding and no fontspec)
    const main = this.src(this.main) || '', end = preambleEnd(main);
    const have = end < 0 ? [] : pkgLines(main, end).flatMap((x) => x.names.map((n) => n.name));
    const t1 = end >= 0 && !have.includes('fontenc') && !have.includes('fontspec');
    const pk = this.tablePackages(['csvsimple', ...(o.booktabs === false ? [] : ['booktabs']), ...(t1 ? ['fontenc-T1'] : [])]);
    let at = p + pre.length + text.indexOf('\\caption{') + 9;
    for (const x of pk) if (x.f === f && x.s <= p) at += x.t.length - (x.e - x.s);
    // (a file picked in the dialog comes in the same step: o.text, under the name it was given)
    const add = typeof o.text === 'string' && !this.files.has(name) && /\.(csv|tsv|dat|txt)$/i.test(name) ? [{ f: name, s: 0, e: 0, t: o.text }] : [];
    this.closeGroup();
    this.commit([{ f, s: p, e: p, t: pre + text + post }, ...pk, ...add], { f, p: at, bias: 1 }, 'insert');
    this.closeGroup();
  },

  // ---- rows and columns --------------------------------------------------------------------------
  tableInsertRow(below) {
    return this.tableOp((src, T, h) => X.insertRow(src, T, below ? h.rect.r1 : h.rect.r0, below));
  },
  // a row under the caret's (Ctrl+Enter, Insert below)
  tableRow() { return this.tableInsertRow(true); },
  tableInsertCol(right) {
    return this.tableOp((src, T, h) => X.insertCol(src, T, right ? h.rect.c1 : h.rect.c0, right, { row: h.r }));
  },
  tableDeleteRows() { return this.tableOp((src, T, h) => X.deleteRows(src, T, h.rect.r0, h.rect.r1)); },
  tableDeleteCols() { return this.tableOp((src, T, h) => X.deleteCols(src, T, h.rect.c0, h.rect.c1)); },
  // the table, and the float around it when it holds nothing else
  tableDelete() {
    const at = this.ribbonAt(), h = at && this.tableHere(at);
    if (!h) return false;
    const F = X.floatOf(h.src, h.T);
    const s = F && F.only ? F.s : h.T.s, e = F && F.only ? F.e : h.T.e;
    // (the blank line it stood in goes with it)
    let a = s, z = e;
    while (a > 0 && /[ \t]/.test(h.src[a - 1])) a--;
    while (z < h.src.length && /[ \t]/.test(h.src[z])) z++;
    if (h.src[z] === '\n' && (a === 0 || h.src[a - 1] === '\n')) { z++; if (h.src[z] === '\n' && (a < 2 || h.src[a - 2] === '\n')) z++; }
    this.closeGroup();
    this.commit([{ f: h.f, s: a, e: z, t: '' }], { f: h.f, p: a }, 'table');
    this.closeGroup();
    return true;
  },
  tableDeleteCells(how) {
    if (how === 'row') return this.tableDeleteRows();
    if (how === 'column') return this.tableDeleteCols();
    return this.tableOp((src, T, h) => X.deleteCells(src, T, h.rect, how));
  },

  // Tab: the next cell's words selected; in the last cell a new row, the caret in its first cell.
  // Shift+Tab: the cell before.
  tabCell(back) {
    const sel = getSelection();
    const n = sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const td = el && el.closest('td');
    if (!td) return;
    const cells = this.tablePieces(td.closest('table')).flatMap((t) => [...t.querySelectorAll('td:not(.rule-cell)')].filter((x) => x.closest('table') === t && x.querySelector('span.t')));
    const i = cells.indexOf(td);
    const next = cells[i + (back ? -1 : 1)];
    if (!next) { if (!back) this.tableRow(); return; }
    const sp = next.querySelector('span.t');
    const r = document.createRange();
    r.selectNodeContents(sp);
    sel.removeAllRanges(); sel.addRange(r);
  },

  // the <table> pieces of the table tbl is one of: a table that runs over pages is one a page
  tablePieces(tbl) {
    const key = tbl && tbl.dataset.tab;
    if (!key) return tbl ? [tbl] : [];
    const all = [...this.root.querySelectorAll('table[data-tab="' + CSS.escape(key) + '"]')];
    return all.includes(tbl) ? all : [tbl];
  },

  // ---- selecting ------------------------------------------------------------------------------------
  // Select Cell, Column, Row or Table: a selection over those cells (shown as a block of cells)
  tableSelect(what) {
    const at = this.ribbonAt(), h = at && this.tableHere(at);
    if (!h) return false;
    const tbl = at.el && at.el.closest('table');
    if (!tbl) return false;
    const { T } = h;
    const pick = (r, col) => { const row = T.rows[r]; const x = row && X.cellOfCol(row, col); return x && x.cell; };
    const data = T.rows.map((x, k) => k).filter((k) => T.rows[k].kind === 'row');
    let a, z;
    if (what === 'cell') { a = z = h.cell; }
    else if (what === 'row') { a = T.rows[h.r].cells[0]; z = T.rows[h.r].cells[T.rows[h.r].cells.length - 1]; }
    else if (what === 'column') { a = pick(data[0], h.cell.col); z = pick(data[data.length - 1], h.cell.col); }
    else { const first = T.rows[data[0]], last = T.rows[data[data.length - 1]]; a = first.cells[0]; z = last.cells[last.cells.length - 1]; }
    if (!a || !z) return false;
    const spans = this.tablePieces(tbl).flatMap((t) => [...t.querySelectorAll('td span.t')]);
    const pos = (sp) => { const i = segOfSpan(sp); return i ? boundary(i.B, i.seg, i.o) : -1; };
    const inA = spans.filter((sp) => { const q = pos(sp); return q >= a.s && q <= a.e; });
    const inZ = spans.filter((sp) => { const q = pos(sp); return q >= z.s && q <= z.e; });
    if (!inA.length || !inZ.length) return false;
    const r = document.createRange(), last = inZ[inZ.length - 1];
    r.setStart(inA[0].firstChild || inA[0], 0);
    r.setEnd(last.firstChild || last, last.firstChild ? last.firstChild.length : 0);
    const sel = getSelection();
    this.root.focus({ preventScroll: true });
    sel.removeAllRanges(); sel.addRange(r);
    this.ribbonSoon();
    return true;
  },
  // the cells of a selection over several shown as a block, as Word shows them (the browser's
  // own selection runs through the text between them, row by row)
  tablePaintSelection(at) {
    for (const x of this.root.querySelectorAll('td.tsel')) x.classList.remove('tsel');
    for (const x of this.root.querySelectorAll('table.tsel-on')) x.classList.remove('tsel-on');
    const h = at && here(this, at);
    if (!h || !h.multi) return;
    const tbl = at.el && at.el.closest('table');
    if (!tbl) return;
    const all = this.tablePieces(tbl);
    for (const t of all) t.classList.add('tsel-on');
    const { r0, r1, c0, c1 } = h.rect;
    for (const td of all.flatMap((t) => [...t.querySelectorAll('td')])) {
      const sp = td.querySelector('span.t'), info = sp && segOfSpan(sp);
      if (!info) continue;
      const hit = X.cellAt(h.T, boundary(info.B, info.seg, info.o));
      if (hit && hit.r >= r0 && hit.r <= r1 && hit.cell.col >= c0 && hit.cell.col + hit.cell.span - 1 <= c1) td.classList.add('tsel');
    }
  },

  // ---- merging and splitting --------------------------------------------------------------------------
  // Merge, and Split right after it (the merge the last step, the table as it made it): the table
  // as it was before, byte for byte, rules a merge down clipped and spaces included
  tableMerge() {
    let memo = null;
    const ok = this.tableOp((src, T, h) => {
      const r = X.mergeCells(src, T, h.rect);
      if (r.error || !r.edits) return r;
      const after = X.apply(src, r.edits), d = after.length - src.length;
      memo = { f: h.f, was: src.slice(T.s, T.e), made: after.slice(T.s, T.e + d), cell: r.p - T.s };
      return r;
    });
    this.tableMergeMemo = ok && memo ? { ...memo, step: this.hist[this.hist.length - 1] } : null;
    return ok;
  },
  tableSplitCell() {
    return this.tableOp((src, T, h) => {
      const m = this.tableMergeMemo;
      this.tableMergeMemo = null;
      if (m && m.step && m.step === this.hist[this.hist.length - 1] && m.f === h.f && src.slice(T.s, T.e) === m.made && h.cell.s - T.s <= m.cell && m.cell <= h.cell.e - T.s) {
        return { edits: [{ s: T.s, e: T.e, t: m.was }], p: T.s + Math.min(m.cell, m.was.length) };
      }
      return X.splitCell(src, T, h.r, h.k);
    });
  },

  // ---- size ------------------------------------------------------------------------------------------------
  // the columns' widths as the page draws them, in cm of the page (for Fixed Column Width)
  tableWidths(h) {
    const at = this.ribbonAt(), tbl = at && at.el && at.el.closest('table');
    const n = h.T.spec.cols.length;
    const out = Array(n).fill(null);
    if (!tbl) return out;
    const pxPerCm = (this.px || 1) * 72.27 / 2.54;
    const row = [...tbl.querySelectorAll('tr')].find((tr) => [...tr.children].length >= n && ![...tr.children].some((td) => td.colSpan > 1));
    if (!row) return out;
    [...row.children].slice(0, n).forEach((td, k) => {
      const cs = getComputedStyle(td);
      const w = td.getBoundingClientRect().width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
      out[k] = Math.max(0.5, Math.round(w / pxPerCm * 10) / 10) + 'cm';
    });
    return out;
  },
  tableFit(kind) {
    return this.tableOp((src, T, h) => X.autofit(src, T, kind, kind === 'fixed' ? this.tableWidths(h) : null));
  },
  tableDistributeCols() {
    return this.tableOp((src, T, h) => {
      const w = this.tableWidths(h).map((x) => parseFloat(x) || 0);
      const n = w.length || 1, avg = Math.max(0.5, Math.round(w.reduce((a, b) => a + b, 0) / n * 10) / 10);
      return X.distributeCols(src, T, Array(n).fill(avg + 'cm'));
    });
  },

  // ---- alignment ----------------------------------------------------------------------------------------------
  // whether the caret's column takes a vertical alignment (a paragraph column: p, m, b)
  tableVertical(h) {
    const col = h.T.spec.cols[h.cell.col];
    return !!(col && 'pmb'.includes(col.letter)) || !!h.cell.mr;
  },
  tableAlignState(h) {
    const col = h.T.spec.cols[h.cell.col];
    let v = h.cell.mr ? ({ t: 't', b: 'b' }[h.cell.mr.vpos] || 'm') : X.colV(col);
    const hz = X.cellH(h.src, h.T, h.cell);
    return { h: hz === 'j' ? 'l' : hz, v };
  },
  // Align the selection: whole columns (every row of them selected) by their letters, else each
  // cell as \multicolumn{1}{…}; the vertical by the column's letter (p, m, b), or a \multirow's [t]/[b]
  tableAlign(hz, v) {
    return this.tableOp((src, T, h) => {
      const data = T.rows.map((x, k) => k).filter((k) => T.rows[k].kind === 'row');
      const whole = h.rect.r0 <= data[0] && h.rect.r1 >= data[data.length - 1];
      const edits = [], pk = new Set();
      const vert = this.tableVertical(h) ? v : null;
      if (h.cell.mr && !h.multi) {
        // a cell merged down: \multirow's own vertical position
        const m = h.cell.mr, want = v === 't' ? 't' : v === 'b' ? 'b' : null;
        const has = m.vpos;
        if ((want || null) !== (has || null)) {
          const start = src.indexOf('\\multirow', m.s) + 9;
          if (has != null) { const lb = src.indexOf('[', start); const rb = src.indexOf(']', lb); edits.push({ s: lb, e: rb + 1, t: want ? '[' + want + ']' : '' }); }
          else edits.push({ s: start, e: start, t: '[' + want + ']' });
        }
        const r = X.alignCells(src, T, [h.cell], hz);
        edits.push(...r.edits);
        return { edits, packages: r.packages };
      }
      if (whole) {
        const r = X.alignCols(src, T, h.rect.c0, h.rect.c1, hz, vert);
        if (r.error) return r;
        r.packages.forEach((x) => pk.add(x));
        edits.push(...r.edits);
        return { edits, packages: [...pk] };
      }
      const cells = [];
      for (let r = h.rect.r0; r <= h.rect.r1; r++) for (const c of (T.rows[r] || { cells: [] }).cells) if (c.col >= h.rect.c0 && c.col + c.span - 1 <= h.rect.c1) cells.push(c);
      const rc = X.alignCells(src, T, cells, hz);
      edits.push(...rc.edits); rc.packages.forEach((x) => pk.add(x));
      if (vert && vert !== X.colV(T.spec.cols[h.cell.col])) {
        const r = X.alignCols(src, T, h.cell.col, h.cell.col, null, vert);
        edits.push(...r.edits); r.packages.forEach((x) => pk.add(x));
      }
      return { edits, packages: [...pk] };
    });
  },
  // Text Direction: level, up (90), down (270), level again
  tableTurn() {
    return this.tableOp((src, T, h) => {
      const cells = [];
      for (let r = h.rect.r0; r <= h.rect.r1; r++) for (const c of (T.rows[r] || { cells: [] }).cells) if (c.col >= h.rect.c0 && c.col + c.span - 1 <= h.rect.c1) cells.push(c);
      const now = X.turnOf(src, h.cell);
      return X.turnCells(src, cells, now === 0 ? 90 : now === 90 ? 270 : 0);
    });
  },

  // ---- data ---------------------------------------------------------------------------------------------------
  // Sort: o { col, desc, type, header }
  tableSort(o) {
    return this.tableOp((src, T, h) => {
      // (a longtable's body: the rows after its last \endhead, \endfoot …; its head is the header)
      const mark = T.rows.reduce((m, x, k) => (x.lead.some((l) => LT_MARKS.includes(l.name)) ? k : m), -1);
      const data = T.rows.map((x, k) => k).filter((k) => T.rows[k].kind === 'row' && k >= mark);
      let r0 = data[0], r1 = data[data.length - 1];
      if (h.rect.r1 > h.rect.r0) { r0 = h.rect.r0; r1 = h.rect.r1; }
      else if (o.header && data.length > 1 && mark < 0) r0 = data[1];
      return X.sortRows(src, T, r0, r1, o.col ?? h.cell.col, o);
    });
  },
  tableToText(sep) { return this.tableOp((src, T) => X.tableToText(src, T, sep)); },
  // Table Properties' OK: o { full, align, stretch, fixed, width, v } as one commit
  tableProperties(o) {
    return this.tableOp((src, T, h) => composeOps(src, T, [
      (s, t) => (o.full != null && (o.full !== (X.fitOf(s, t) === 'window')) ? X.autofit(s, t, o.full ? 'window' : 'contents') : null),
      (s, t) => (o.align ? X.floatAlign(s, t, o.align) : null),
      (s, t) => (o.stretch != null ? X.setSetting(s, t, 'arraystretch', Math.abs(o.stretch - 1) < 1e-6 ? null : String(Math.round(o.stretch * 100) / 100)) : null),
      (s, t) => (o.fixed != null && t.spec.cols[h.cell.col] ? X.setColWidth(s, t, h.cell.col, o.fixed ? o.width || '3cm' : null) : null),
      (s, t) => (o.v && t.spec.cols[h.cell.col] && 'pmb'.includes(t.spec.cols[h.cell.col].letter) ? X.alignCols(s, t, h.cell.col, h.cell.col, null, o.v) : null)
    ]));
  },
  tableRepeatHeader() {
    return this.tableOp((src, T, h) => {
      const on = !X.repeats(T);
      if (on && h.rect.r0 > firstRow(T)) return { error: 'Only the table\'s first rows repeat: put the caret in its first row, or select its first rows.' };
      return X.repeatHeader(src, T, Math.max(0, h.rect.r1), on, { twocolumn: this.twoColumns(h) });
    });
  },
  // whether the table stands where text runs in two columns: a two column class or option,
  // \twocolumn before it, or a multicols around it (longtable stops there)
  twoColumns(h) {
    const main = this.src(this.main) || '', cls = docClass(main);
    const opts = cls ? Object.keys(cls.options || {}) : [], has = (x) => opts.includes(x);
    if (has('twocolumn')) return true;
    // (classes in two columns unless told otherwise)
    if (cls && /^IEEE(tran|conf)$/.test(cls.name) && !has('onecolumn') && !has('draftcls') && !has('draftclsnofoot')) return true;
    if (cls && cls.name === 'acmart' && (has('sigconf') || has('sigplan'))) return true;
    if (cls && cls.name === 'elsarticle' && has('5p')) return true;
    const before = stripComments(h.src.slice(Math.max(0, h.T.s - 400000), h.T.s));
    const open = (before.match(/\\begin\s*\{multicols\*?\}/g) || []).length - (before.match(/\\end\s*\{multicols\*?\}/g) || []).length;
    if (open > 0) return true;
    const tw = before.lastIndexOf('\\twocolumn'), one = before.lastIndexOf('\\onecolumn');
    return tw >= 0 && tw > one && !/^\\twocolumn[A-Za-z@]/.test(before.slice(tw));
  },
  tableCaption() {
    const at = this.ribbonAt(), h = at && this.tableHere(at);
    if (!h) return false;
    const r = X.captionEdits(h.src, h.T);
    if (r.error) { this.toast(r.error); return false; }
    if (!r.edits) { this.closeGroup(); this.restoreCaret({ f: h.f, p: r.p }); return true; }
    // (\captionof needs caption's package: its line in the same step)
    const pk = this.tablePackages(r.packages || []);
    let p = r.p;
    for (const x of pk) if (x.f === h.f && x.s <= p) p += x.t.length - (x.e - x.s);
    this.closeGroup();
    this.commit([...r.edits.map((x) => ({ f: h.f, ...x })), ...pk], { f: h.f, p, bias: 1 }, 'table');
    this.closeGroup();
    return true;
  },

  // ---- design ---------------------------------------------------------------------------------------------------
  tableHeader(last) {
    return this.tableOp((src, T) => X.setHeader(src, T, last, !X.headerOn(src, T, last)));
  },
  tableColBold(last) {
    return this.tableOp((src, T) => { const c = last ? T.spec.cols.length - 1 : 0; return X.setColBold(src, T, c, !X.colBold(src, T, c)); });
  },
  tableBanded() {
    return this.tableOp((src, T) => {
      const on = !X.settingsOf(src, T).rowcolors;
      const r = X.setSetting(src, T, 'rowcolors', on ? '{2}{' + X.BAND + '}{}' : null);
      return { ...r, packages: on ? ['xcolor-table'] : [] };
    });
  },
  tableBandedCols() { return this.tableOp((src, T) => X.setBandedCols(src, T, !X.bandedCols(src, T))); },
  // the look the gallery shows checked
  tableLookOf(h) {
    const L = X.lookOf(h.src, h.T);
    if (L === 'other') { const b = X.barsOf(h.src, h.T); const leads = [...h.T.rows.map((r) => r.lead), h.T.tail.lead]; const ruled = leads.map((l) => l.some((x) => X.RULES.has(x.name))); if (b.all && ruled[0] && ruled[ruled.length - 1] && !ruled.slice(1, -1).some(Boolean)) return 'frame'; }
    return L === 'bars' ? null : L;
  },
  tableLook(k) { return this.tableOp((src, T) => X.applyLook(src, T, k)); },

  // Shading: the colour picked last (none to begin with: the picker); pick null takes it off
  tableShade(pick) {
    if (pick === undefined) {
      if (!this.lastShade) return this.shadingPicker();
      pick = this.lastShade;
    }
    if (pick) this.lastShade = pick;
    const dvips = pick && pick.name && colorNeeds(pick.name);
    return this.tableOp((src, T, h) => { const r = X.shade(src, T, h.rect, pick ? colorArg(pick) : null); return { ...r, packages: [...r.packages, ...(dvips ? ['xcolor-dvips'] : [])] }; });
  },
  shadingItems(at) {
    return [{ name: 'Shading Colors…', title: 'Every colour: Word\'s, xcolor\'s, dvipsnames and any other', run: () => this.shadingPicker(at) },
      { name: 'No Color', title: 'The cells\' own shading goes', run: () => this.tableShade(null) }];
  },
  shadingPicker(at) {
    const b = document.getElementById('rc-table-shading');
    const anchor = b && b.offsetParent ? b : this.root;
    const h = (at && here(this, at)) || (this.ribbonAt() && this.tableHere(this.ribbonAt()));
    const cur = h ? X.shadeOf(h.src, h.T, h.r, h.cell) : null;
    colorPicker(this, anchor, { label: 'Shading', auto: 'No Color', current: cur && !cur.model ? cur.value : null, onPick: (v) => { this.ribbonBack(); this.tableShade(v); this.ribbonSync(); } });
    return true;
  },

  // Borders: one of BORDERS on the selection, on or off (it shows pressed where all of it is there)
  // what Borders act on: the selected cells, or with the caret alone the whole table (LaTeX's
  // rules and bars are the table's; one cell's border is for a selected cell)
  borderRect(h) {
    if (!h.c.collapsed) return h.rect;
    const data = h.T.rows.map((x, k) => k).filter((k) => h.T.rows[k].kind === 'row');
    return { r0: data[0], r1: data[data.length - 1], c0: 0, c1: h.T.ncols - 1 };
  },
  borderOn(h, parts) {
    const now = X.bordersOf(h.src, h.T, this.borderRect(h));
    const keys = Object.keys(parts);
    if (keys.every((k) => parts[k] === 0)) return keys.every((k) => !now[k]);
    return keys.filter((k) => parts[k]).every((k) => now[k] !== false);
  },
  tableBorder(id) {
    const B = BORDERS.find((x) => x[0] === id);
    if (!B) return false;
    if (id !== 'border-none') this.lastBorder = id;
    const parts = B[2];
    return this.tableOp((src, T, h) => {
      const on = !this.borderOn(h, parts) || id === 'border-none';
      const set = {};
      for (const [k, v] of Object.entries(parts)) set[k] = id === 'border-none' ? false : on ? !!v : false;
      // (a part the selection has none of, one row's inside border, is no part)
      const rect = this.borderRect(h);
      const now = X.bordersOf(src, T, rect);
      for (const k of Object.keys(set)) if (now[k] === null) delete set[k];
      return X.setBorders(src, T, rect, set);
    });
  },
  borderItems(at) {
    const h = at && here(this, at);
    return BORDERS.map(([id, name, parts, icon], k) => [k === 4 ? null : undefined, { name, icon, checked: h ? this.borderOn(h, parts) : false, run: () => this.runCommand('table-borders', { id }) }]).flat().filter((x) => x !== undefined);
  },
  // the table's settings: \arrayrulewidth (Pen Weight), \tabcolsep, \extrarowheight, \arraystretch
  tableSetting(key, value, packages) {
    return this.tableOp((src, T) => ({ ...X.setSetting(src, T, key, value), packages: value != null ? packages || [] : [] }));
  },
  tableSettings(changes) {
    // several settings as one step, each on the text the one before left
    return this.tableOp((src, T) => composeOps(src, T, changes.map(([key, value, need]) => (s, t) => ({ ...X.setSetting(s, t, key, value), packages: value != null ? need || [] : [] }))));
  },
  tablePenColor(pick) {
    return this.tableOp((src, T) => ({ ...X.setSetting(src, T, 'arrayrulecolor', pick ? colorText(pick) : null), packages: pick ? ['xcolor-table'] : [] }));
  },
  penColorPicker() {
    const b = document.getElementById('rc-pen-color');
    colorPicker(this, b && b.offsetParent ? b : this.root, { label: 'Pen Color', auto: 'Automatic', onPick: (v) => { this.ribbonBack(); this.tablePenColor(v); this.ribbonSync(); } });
    return true;
  },

  // A menu command's menu, at its button (or its group's when the group is folded)
  tableMenu(id) {
    const at = this.ribbonAt(), h = at && here(this, at);
    let items = [];
    if (id === 'pen-weight') {
      const cur = h ? (X.settingsOf(h.src, h.T).arrayrulewidth || {}).value || '0.4pt' : '0.4pt';
      items = WEIGHTS.map(([w, name]) => ({ name, checked: cur === w, radio: true, run: () => { this.ribbonBack(); this.tableSetting('arrayrulewidth', w === '0.4pt' ? null : w); this.ribbonSync(); } }));
    } else {
      const fit = h ? X.fitOf(h.src, h.T) : null;
      const c = { 'table-select': [['select-cell', 'Select Cell'], ['select-column', 'Select Column'], ['select-row', 'Select Row'], ['select-table', 'Select Table']],
        'table-delete': [['delete-cells', 'Delete Cells…'], ['delete-columns', 'Delete Columns'], ['delete-rows', 'Delete Rows'], ['delete-table', 'Delete Table']],
        autofit: [['autofit-contents', 'AutoFit Contents'], ['autofit-window', 'AutoFit Window'], ['autofit-fixed', 'Fixed Column Width']] }[id] || [];
      items = c.map(([cid, name]) => ({ name, checked: id === 'autofit' ? fit === cid.replace('autofit-', '') : undefined, radio: id === 'autofit', run: () => { this.ribbonBack(); this.runCommand(cid); } }));
    }
    const b = document.getElementById('rc-' + id);
    const g = b && b.closest('.rb-grp'), gb = g && g.querySelector('.rb-gbtn');
    // (from the right click menu or the search box: at the caret)
    const sel = getSelection(), cr = sel.rangeCount && this.root.contains(sel.anchorNode) ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const where = b && b.offsetParent ? b : gb && gb.offsetParent ? gb : cr && (cr.width || cr.height) ? new DOMRect(cr.left, cr.bottom, 0, 0) : this.root;
    openMenu(this, where, items, { label: { 'pen-weight': 'Pen Weight', 'table-select': 'Select', 'table-delete': 'Delete', autofit: 'AutoFit' }[id] || id });
    return true;
  }
};

// Several operations as one: each on the text the one before left (the table found again where
// it moved to), the whole as one edit of the part that differs
function composeOps(src0, T0, steps) {
  let src = src0, s = T0.s;
  const pk = new Set();
  for (const step of steps) {
    const T = X.parseTable(src, s);
    if (!T) break;
    const r = step(src, T);
    if (!r || r.error || !r.edits) continue;
    src = X.apply(src, r.edits);
    s = mapPos(r.edits, s, 1);
    for (const x of r.packages || []) pk.add(x);
  }
  const d = diffOne(src0, src);
  return { edits: d ? [d] : [], packages: [...pk] };
}
// one edit from a text to another (the part that differs)
function diffOne(a, b) {
  if (a === b) return null;
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let z = 0;
  while (z < a.length - s && z < b.length - s && a[a.length - 1 - z] === b[b.length - 1 - z]) z++;
  return { s, e: a.length - z, t: b.slice(s, b.length - z) };
}

// The menus of the menu commands (Select, Delete, AutoFit) are their commands by name; the Table
// button's arrow opens the grid of sizes; a selection over several cells is shown as a block.
onInstall((app) => {
  // the Table button's arrow: the grid of sizes, then Insert Table…, Convert Text to Table… and
  // Table from Data File… (by the keyboard too: the down arrow presses it)
  document.addEventListener('click', (e) => {
    const x = e.target.closest && e.target.closest('#ri-table-x');
    if (!x) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!x.disabled) openTablePicker(app, x);
  }, true);
  document.addEventListener('selectionchange', () => { clearTimeout(app.tselT); app.tselT = setTimeout(() => app.tablePaintSelection(app.ribbonAt()), 80); });
});
