// The table's pickers and dialogs: the grid of sizes under Insert › Table (ten columns by eight
// rows, as Word's; the arrows move over it, Enter inserts), and the dialogs of the tables' commands
// (Insert Table, Convert Text to Table, Convert to Text, Sort, Table Properties, Cell Margins,
// Delete Cells, Table from Data File). Each dialog is the kit's (role dialog named by its title,
// Close, Escape), its fields named for agents; OK runs the command as one commit where the caret
// was when it opened. A document's text reaches these only as text (a column's header in Sort).

import { dialog, numberField, parseLength, formatLength } from './kit.js';
import { mk } from './dom.js';
import * as X from '../table.js';

const COLS = 10, ROWS = 8;

// the caret's place, kept while a dialog has the focus, and put back for OK
function keep(app) {
  const s = getSelection();
  if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange();
  return app.ribbonAt();
}
function back(app) {
  // (a field of the dialog had the selection: the caret's place kept at its opening goes back)
  const r = app.rbRange;
  app.closePop(true);
  app.root.focus({ preventScroll: true });
  if (r && r.startContainer && app.root.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
}

// ---- the parts of a dialog -----------------------------------------------------------------------
const row = (cls, ...kids) => { const d = mk('div', cls); d.append(...kids); return d; };
function field(name, ctl) {
  const l = mk('label', 'tb-f');
  l.append(mk('span', 'tb-l', name), ctl);
  if (!ctl.getAttribute('aria-label')) ctl.setAttribute('aria-label', name);
  return l;
}
function int(value, min, max) {
  const i = mk('input', 'tb-num');
  i.type = 'number'; i.min = String(min); i.max = String(max); i.step = '1'; i.value = String(value);
  return i;
}
function radios(name, items, value) {
  const g = mk('div', 'tb-radios');
  g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', name);
  g.append(mk('div', 'tb-gl', name));
  const inputs = [];
  for (const [v, label] of items) {
    const l = mk('label', 'tb-r');
    const i = mk('input');
    i.type = 'radio'; i.name = 'tb-' + name.replace(/\W+/g, '-').toLowerCase(); i.value = v; i.checked = v === value; i.setAttribute('aria-label', label);
    l.append(i, mk('span', '', label));
    g.append(l);
    inputs.push(i);
  }
  g.value = () => (inputs.find((i) => i.checked) || inputs[0]).value;
  return g;
}
function check(name, on) {
  const l = mk('label', 'tb-ck');
  const i = mk('input');
  i.type = 'checkbox'; i.checked = !!on; i.setAttribute('aria-label', name);
  l.append(i, mk('span', '', name));
  l.input = i;
  return l;
}
function buttons(app, ok, okName = 'OK') {
  const b = mk('div', 'tb-btns');
  const o = mk('button', 'btn primary', okName);
  o.type = 'button';
  const c = mk('button', 'btn ghost', 'Cancel');
  c.type = 'button';
  o.addEventListener('click', ok);
  c.addEventListener('click', () => back(app));
  b.append(c, o);
  return b;
}
// a dialog at the ribbon button that opened it, or under the caret; Enter in a field is OK
function open(app, title, id, cls) {
  const b = document.getElementById(id);
  const s = getSelection();
  const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
  const rect = r && (r.width || r.height) ? r : app.root.getBoundingClientRect();
  const p = dialog(app, { title, anchor: b && b.offsetParent ? b : null, rect, cls: 'pop-tb ' + (cls || '') });
  return p;
}
function finish(app, p, ok) {
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=radio]), select')) { e.preventDefault(); ok(); } });
  app.positionPop();
  const first = p.querySelector('input, select, [role=grid]');
  if (first) first.focus();
}

// ---- the grid of sizes -------------------------------------------------------------------------
export function openTablePicker(app, anchor) {
  keep(app);
  const p = app.makePop(anchor, 'pop-dl pop-tpick', null);
  p.setAttribute('aria-label', 'Insert Table');
  if (anchor && anchor.hasAttribute('aria-expanded')) { anchor.setAttribute('aria-expanded', 'true'); app.pop.onClose = () => anchor.setAttribute('aria-expanded', 'false'); }
  const head = mk('div', 'tp-head', 'Insert Table');
  head.id = 'tp-head';
  const g = mk('div', 'tp-grid');
  g.setAttribute('role', 'grid'); g.setAttribute('aria-label', 'Table size'); g.setAttribute('aria-describedby', 'tp-head'); g.tabIndex = 0;
  const cells = [];
  let cur = { r: 0, c: 0, on: false };
  for (let r = 0; r < ROWS; r++) {
    const tr = mk('div', 'tp-row');
    tr.setAttribute('role', 'row');
    for (let c = 0; c < COLS; c++) {
      const d = mk('div', 'tp-cell');
      d.setAttribute('role', 'gridcell');
      d.setAttribute('aria-label', 'Table of ' + (r + 1) + ' row' + (r ? 's' : '') + ' and ' + (c + 1) + ' column' + (c ? 's' : ''));
      d.id = 'tp-' + r + '-' + c;
      d.dataset.r = r; d.dataset.c = c;
      tr.append(d);
      cells.push(d);
    }
    g.append(tr);
  }
  const show = () => {
    for (const d of cells) { const on = cur.on && +d.dataset.r <= cur.r && +d.dataset.c <= cur.c; d.classList.toggle('on', on); d.setAttribute('aria-selected', on ? 'true' : 'false'); }
    head.textContent = cur.on ? (cur.c + 1) + '×' + (cur.r + 1) + ' Table' : 'Insert Table';
    g.setAttribute('aria-activedescendant', 'tp-' + cur.r + '-' + cur.c);
  };
  const insert = () => { const r = cur.r + 1, c = cur.c + 1; back(app); app.runCommand('table', { rows: r, cols: c }); };
  // (the pointer's moves, not a cell that comes to lie under a pointer standing still)
  g.addEventListener('mousemove', (e) => { const d = e.target.closest('.tp-cell'); if (!d || (cur.on && cur.r === +d.dataset.r && cur.c === +d.dataset.c)) return; cur = { r: +d.dataset.r, c: +d.dataset.c, on: true }; show(); });
  g.addEventListener('mousedown', (e) => e.preventDefault());
  g.addEventListener('click', (e) => { const d = e.target.closest('.tp-cell'); if (!d) return; cur = { r: +d.dataset.r, c: +d.dataset.c, on: true }; insert(); });
  g.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!cur.on) cur.on = true; insert(); return; }
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[k];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    // (the up arrow from the top row goes to the head; the down arrow from the last row to the items)
    if (k === 'ArrowDown' && cur.on && cur.r === ROWS - 1) { const first = p.querySelector('[role=menuitem]'); if (first) first.focus(); return; }
    if (!cur.on) { cur = { r: 0, c: 0, on: true }; show(); return; }
    cur = { r: Math.max(0, Math.min(ROWS - 1, cur.r + d[0])), c: Math.max(0, Math.min(COLS - 1, cur.c + d[1])), on: true };
    show();
  });
  g.addEventListener('focus', () => { if (!cur.on) { cur.on = true; show(); } });
  p.append(head, g, mk('div', 'pop-sep'));
  for (const it of app.tablePickerItems()) {
    const a = mk('button', 'nav-act');
    a.type = 'button';
    a.setAttribute('role', 'menuitem');
    a.setAttribute('aria-label', it.name);
    a.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 20 20" aria-hidden="true">' + it.icon + '</svg>');
    a.append(mk('span', 'mi-n', it.name));
    if (it.disabled) a.setAttribute('aria-disabled', 'true');
    a.addEventListener('mousedown', (e) => e.preventDefault());
    a.addEventListener('click', () => { if (a.getAttribute('aria-disabled') === 'true') return; app.closePop(true); it.run(); });
    a.addEventListener('keydown', (e) => {
      const all = [...p.querySelectorAll('[role=menuitem]')], i = all.indexOf(a);
      if (e.key === 'ArrowDown') { e.preventDefault(); (all[i + 1] || all[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i === 0) { g.focus(); } else all[i - 1].focus(); }
    });
    p.append(a);
  }
  show();
  app.positionPop();
  g.focus();
  return p;
}

// ---- Insert Table ----------------------------------------------------------------------------------
export function insertTableDialog(app) {
  keep(app);
  const p = open(app, 'Insert Table', 'rc-insert-table-dialog', 'tb-insert');
  const cols = int(app.lastTableSize ? app.lastTableSize.c : 2, 1, 63), rows = int(app.lastTableSize ? app.lastTableSize.r : 2, 1, 200);
  const fit = radios('AutoFit behavior', [['fixed', 'Fixed column width'], ['contents', 'AutoFit to contents'], ['window', 'AutoFit to window']], 'contents');
  const width = numberField({ id: 'tb-colw', name: 'Column width', value: { value: 3, unit: 'cm' }, units: ['cm', 'mm', 'in', 'pt'], step: 0.5, min: 0.2, max: 40 });
  const head = check('Header row', true), cap = check('Caption', true), remember = check('Remember dimensions for new tables', !!app.lastTableSize);
  const ok = () => {
    const r = Math.max(1, Math.min(200, parseInt(rows.value, 10) || 2)), c = Math.max(1, Math.min(63, parseInt(cols.value, 10) || 2));
    const f = fit.value(), w = width.get();
    app.lastTableSize = remember.input.checked ? { r, c } : null;
    back(app);
    app.runCommand('table', { rows: r, cols: c, fit: f, width: f === 'fixed' ? formatLength(w) : null, header: head.input.checked, caption: cap.input.checked });
  };
  const wf = field('Column width', width);
  const fixedOnly = () => { const on = fit.value() === 'fixed'; wf.classList.toggle('off', !on); for (const x of width.querySelectorAll('input, select')) x.disabled = !on; };
  fit.addEventListener('change', fixedOnly);
  p.append(row('tb-sec', mk('div', 'tb-gl', 'Table size'), field('Number of columns', cols), field('Number of rows', rows)),
    row('tb-sec', fit, wf), row('tb-sec', head, cap, remember), buttons(app, ok));
  fixedOnly();
  finish(app, p, ok);
}

// ---- Convert Text to Table, Convert to Text ------------------------------------------------------------
export function textToTableDialog(app) {
  const at = keep(app), R = app.textToTableRange(at);
  if (!R) { app.toast('Select the lines to make a table of: paragraphs of plain text.'); return; }
  const p = open(app, 'Convert Text to Table', 'rc-text-to-table');
  const guess = X.splitRows(R.text);
  const sepGuess = /\t/.test(R.text) ? 'tab' : /(^|[^\\])&/.test(R.text) ? '&' : guess.every((x) => x.length > 1) && R.text.includes(';') ? ';' : ',';
  const n = mk('output', 'tb-out');
  n.setAttribute('aria-label', 'Number of columns');
  const sep = radios('Separate text at', [['tab', 'Tabs'], [',', 'Commas'], [';', 'Semicolons'], ['&', 'Ampersands (&)']], sepGuess);
  const count = () => { const rs = X.splitRows(R.text, sep.value()); n.value = String(Math.max(1, ...rs.map((x) => x.length))) + ' columns, ' + rs.length + ' rows'; };
  sep.addEventListener('change', count);
  const fit = radios('AutoFit behavior', [['contents', 'AutoFit to contents'], ['window', 'AutoFit to window']], 'contents');
  const head = check('Header row', true);
  const ok = () => { const s = sep.value(), f = fit.value(), hd = head.input.checked; back(app); app.runCommand('text-to-table', { sep: s, fit: f, header: hd }); };
  p.append(row('tb-sec', mk('div', 'tb-gl', 'Table size'), n), row('tb-sec', sep), row('tb-sec', fit, head), buttons(app, ok));
  count();
  finish(app, p, ok);
}
export function tableToTextDialog(app) {
  keep(app);
  const p = open(app, 'Convert Table to Text', 'rc-table-to-text');
  const sep = radios('Separate text with', [['para', 'Paragraph marks'], [' \\quad ', 'Tabs (\\quad)'], [', ', 'Commas'], ['; ', 'Semicolons']], ', ');
  const ok = () => { const s = sep.value(); back(app); app.runCommand('table-to-text', { sep: s }); };
  p.append(row('tb-sec', sep), buttons(app, ok));
  finish(app, p, ok);
}

// ---- Sort ------------------------------------------------------------------------------------------------
export function sortDialog(app) {
  const at = keep(app), h = at && app.tableHere(at);
  if (!h) return;
  const p = open(app, 'Sort', 'rc-table-sort');
  const data = h.T.rows.map((x, k) => k).filter((k) => h.T.rows[k].kind === 'row');
  const first = h.T.rows[data[0]];
  const hasHead = X.headerOn(h.src, h.T, false) || h.T.headEnd > 0;
  // (the columns by their header's words where the table has a header row: the document's text, as text)
  const by = mk('select', 'tb-sel');
  for (let c = 0; c < h.T.ncols; c++) {
    const cell = X.cellOfCol(first, c);
    const words = hasHead && cell ? X.sortKey(X.cellText(h.src, cell.cell)).slice(0, 40) : '';
    by.add(new Option(words ? 'Column ' + (c + 1) + ': ' + words : 'Column ' + (c + 1), String(c)));
  }
  by.value = String(h.cell.col);
  const type = mk('select', 'tb-sel');
  for (const [v, t] of [['auto', 'Text or numbers, as they are'], ['text', 'Text'], ['number', 'Number']]) type.add(new Option(t, v));
  const dir = radios('Order', [['asc', 'Ascending'], ['desc', 'Descending']], 'asc');
  const head = radios('My list has', [['1', 'Header row'], ['0', 'No header row']], hasHead ? '1' : '0');
  const ok = () => {
    const o = { col: +by.value, type: type.value === 'auto' ? undefined : type.value, desc: dir.value() === 'desc', header: head.value() === '1' };
    back(app); app.runCommand('table-sort', o);
  };
  p.append(row('tb-sec', field('Sort by', by), field('Type', type), dir), row('tb-sec', head), buttons(app, ok));
  finish(app, p, ok);
}

// ---- Table Properties ------------------------------------------------------------------------------------------
export function propertiesDialog(app) {
  const at = keep(app), h = at && app.tableHere(at);
  if (!h) return;
  const p = open(app, 'Table Properties', 'rc-table-properties', 'tb-props');
  const fit = X.fitOf(h.src, h.T), F = X.floatOf(h.src, h.T), S = X.settingsOf(h.src, h.T);
  const col = h.T.spec.cols[h.cell.col];
  const full = check('Full width (tabularx)', fit === 'window');
  const align = radios('Alignment', [['l', 'Left'], ['c', 'Center'], ['r', 'Right']], F && F.centering ? 'c' : F ? 'l' : 'l');
  if (!F) for (const i of align.querySelectorAll('input')) i.disabled = true;
  const stretch = numberField({ id: 'tb-stretch', name: 'Row height', value: { value: S.arraystretch ? parseFloat(S.arraystretch.value) || 1 : 1, unit: '×' }, units: ['×'], step: 0.1, min: 0.5, max: 4 });
  const w = col && col.w ? parseLength(col.w) : null;
  const fixed = check('Preferred width', !!w);
  const width = numberField({ id: 'tb-width', name: 'Column width', value: w || { value: 3, unit: 'cm' }, units: ['cm', 'mm', 'in', 'pt'], step: 0.5, min: 0.2, max: 40 });
  const vert = radios('Vertical alignment', [['t', 'Top'], ['m', 'Center'], ['b', 'Bottom']], X.colV(col));
  const ok = () => {
    const want = { full: full.input.checked, align: F ? align.value() : null, stretch: stretch.get().value, fixed: fixed.input.checked, width: formatLength(width.get()), v: para || fixed.input.checked ? vert.value() : null };
    back(app);
    app.runCommand('table-properties', want);
  };
  // (a column's words have a top, a middle and a foot only when it is of a set width)
  const para = col && 'pmb'.includes(col.letter);
  const vOn = () => { const on = para || fixed.input.checked; for (const x of vert.querySelectorAll('input')) x.disabled = !on; vert.classList.toggle('off', !on); };
  fixed.input.addEventListener('change', vOn);
  p.append(row('tb-sec', mk('div', 'tb-gl', 'Table'), full, align),
    row('tb-sec', mk('div', 'tb-gl', 'Row'), field('Row height (\\arraystretch)', stretch)),
    row('tb-sec', mk('div', 'tb-gl', 'Column ' + (h.cell.col + 1)), fixed, field('Column width', width)),
    row('tb-sec', mk('div', 'tb-gl', 'Cell'), vert), buttons(app, ok));
  vOn();
  finish(app, p, ok);
}

// ---- Cell Margins ---------------------------------------------------------------------------------------------
export function marginsDialog(app) {
  const at = keep(app), h = at && app.tableHere(at);
  if (!h) return;
  const p = open(app, 'Cell Margins', 'rc-cell-margins');
  const S = X.settingsOf(h.src, h.T);
  const side = numberField({ id: 'tb-sep', name: 'Left and right', value: (S.tabcolsep && parseLength(S.tabcolsep.value, 'pt')) || { value: 6, unit: 'pt' }, units: ['pt', 'mm', 'cm'], step: 1, min: 0, max: 72 });
  const top = numberField({ id: 'tb-top', name: 'Top', value: (S.extrarowheight && parseLength(S.extrarowheight.value, 'pt')) || { value: 0, unit: 'pt' }, units: ['pt', 'mm', 'cm'], step: 1, min: 0, max: 72 });
  const ok = () => { const a = side.get(), b = top.get(); back(app); app.runCommand('cell-margins', { side: a.value === 6 && a.unit === 'pt' ? null : formatLength(a), top: b.value === 0 ? null : formatLength(b) }); };
  p.append(row('tb-sec', mk('div', 'tb-gl', 'Default cell margins'), field('Left and right (\\tabcolsep)', side), field('Top (\\extrarowheight)', top)), buttons(app, ok));
  finish(app, p, ok);
}

// ---- Delete Cells -----------------------------------------------------------------------------------------------
export function deleteCellsDialog(app) {
  keep(app);
  const p = open(app, 'Delete Cells', 'rc-table-delete');
  const how = radios('Delete', [['left', 'Shift cells left'], ['up', 'Shift cells up'], ['row', 'Delete entire row'], ['column', 'Delete entire column']], 'left');
  const ok = () => { const v = how.value(); back(app); app.runCommand('delete-cells', { how: v }); };
  p.append(row('tb-sec', how), buttons(app, ok));
  finish(app, p, ok);
}

// ---- Table from Data File ----------------------------------------------------------------------------------------
export function dataFileDialog(app) {
  keep(app);
  const p = open(app, 'Table from Data File', 'rc-table-from-data');
  const files = [...app.files.keys()].filter((n) => /\.(csv|tsv|dat|txt)$/i.test(n) && n !== app.main).sort();
  const pick = mk('select', 'tb-sel');
  for (const n of files) pick.add(new Option(n, n));
  const up = mk('button', 'btn ghost', 'Add a file…');
  up.type = 'button';
  const inp = mk('input');
  inp.type = 'file'; inp.accept = '.csv,.tsv,.dat,.txt,text/csv'; inp.hidden = true;
  up.addEventListener('click', () => inp.click());
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    // (a data file's name, safe as a project file and as an argument; never one the project has:
    // data.csv, then data-2.csv)
    let name = (f.name.replace(/[^\w.\-]+/g, '_').replace(/^[.\-]+/, '').slice(0, 80) || 'data').replace(/(\.(csv|tsv|dat|txt))?$/i, (m) => m || '.csv');
    const text = await f.text();
    for (let k = 2; app.files.has(name) && app.files.get(name) !== text && k < 100; k++) name = name.replace(/(-\d+)?(\.\w+)$/, '-' + k + '$2');
    // (the file joins the project only with Insert, in the same step as the table: Cancel
    // leaves the project as it was, and Undo takes both away)
    pending.set(name, text);
    if (![...pick.options].some((o) => o.value === name)) pick.add(new Option(name, name));
    pick.value = name;
  });
  const pending = new Map();
  const sep = radios('Separated by', [[',', 'Commas'], [';', 'Semicolons'], ['\t', 'Tabs']], ',');
  const book = check('Booktabs rules', true);
  const ok = () => {
    if (!pick.value) { up.focus(); return; }
    const v = { file: pick.value, sep: sep.value(), booktabs: book.input.checked };
    if (pending.has(pick.value) && !app.files.has(pick.value)) v.text = pending.get(pick.value);
    back(app); app.runCommand('table-from-data', v);
  };
  p.append(row('tb-sec', field('Data file', pick), up, inp), row('tb-sec', sep, book),
    mk('p', 'tb-note', 'csvsimple sets the file as a table at every compile: change the file, and the PDF\'s table follows.'), buttons(app, ok, 'Insert'));
  finish(app, p, ok);
}
