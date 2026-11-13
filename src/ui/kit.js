// The parts the ribbon's controls are made of, for every batch to use alike: a split button (the
// command, and an arrow "<name> options" that opens its menu), a menu, a gallery of choices in a
// grid, a colour picker (the document's own colours, Word's standard ones under their xcolor
// names, the 68 of dvipsnames, any other as HTML), a number field with units, and the dialog
// shell (task 34's rule: role dialog, its title as its name, a Close button, Escape closes it).
// Menus and dialogs are App's popovers (makePop), so a press outside or Escape closes them and the
// caret goes back where it was. The pure parts (lengths, colours) are tested in test/kit.test.mjs.

const SVG = (paths) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + paths + '</svg>';
const isOff = (x) => x.disabled || x.getAttribute('aria-disabled') === 'true';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const CARET = '<path d="M6 8l4 4 4-4"/>';

// ---- lengths -----------------------------------------------------------------------------------
export const UNITS = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, em: 10, ex: 4.3 };
// '2.5cm', '2,5 cm', '-3pt', '0.5\linewidth' -> { value, unit } or null
export function parseLength(s, unit = 'cm') {
  const m = /^\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(pt|bp|mm|cm|in|pc|em|ex|\\(?:line|text|column|paper)(?:width|height))?\s*$/.exec(String(s));
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(value) ? { value, unit: m[2] || unit } : null;
}
// a length in another unit (TeX's points through the table above; \linewidth and its like stay)
export function convert(len, unit) {
  if (len.unit === unit || !(len.unit in UNITS) || !(unit in UNITS)) return len;
  return { value: Math.round(len.value * UNITS[len.unit] / UNITS[unit] * 1000) / 1000, unit };
}
export const formatLength = (len) => (Math.round(len.value * 1000) / 1000) + len.unit;

// ---- colours -----------------------------------------------------------------------------------
// xcolor's own names (no option needed)
export const BASE_COLORS = [['black', '000000'], ['darkgray', '404040'], ['gray', '808080'], ['lightgray', 'BFBFBF'], ['white', 'FFFFFF'], ['red', 'FF0000'], ['orange', 'FF8000'],
  ['yellow', 'FFFF00'], ['lime', 'BFFF00'], ['green', '00FF00'], ['olive', '808000'], ['teal', '008080'], ['cyan', '00FFFF'], ['blue', '0000FF'], ['violet', '800080'],
  ['purple', 'BF0040'], ['magenta', 'FF00FF'], ['pink', 'FFBFBF'], ['brown', 'BF8040']];
// \usepackage[dvipsnames]{xcolor}: the 68 names, with the colours they print as
export const DVIPS_COLORS = [['Apricot', 'FBB982'], ['Aquamarine', '00B5BE'], ['Bittersweet', 'C04F17'], ['Black', '221E1F'], ['Blue', '2D2F92'], ['BlueGreen', '00B3B8'],
  ['BlueViolet', '473992'], ['BrickRed', 'B6321C'], ['Brown', '792500'], ['BurntOrange', 'F7921D'], ['CadetBlue', '74729A'], ['CarnationPink', 'F282B4'], ['Cerulean', '00A2E3'],
  ['CornflowerBlue', '41B0E4'], ['Cyan', '00AEEF'], ['Dandelion', 'FDBC42'], ['DarkOrchid', 'A4538A'], ['Emerald', '00A99D'], ['ForestGreen', '009B55'], ['Fuchsia', '8C368C'],
  ['Goldenrod', 'FFDF42'], ['Gray', '949698'], ['Green', '00A64F'], ['GreenYellow', 'DFE674'], ['JungleGreen', '00A99A'], ['Lavender', 'F49EC4'], ['LimeGreen', '8DC73E'],
  ['Magenta', 'EC008C'], ['Mahogany', 'A9341F'], ['Maroon', 'AF3235'], ['Melon', 'F89E7B'], ['MidnightBlue', '006795'], ['Mulberry', 'A93C93'], ['NavyBlue', '006EB8'],
  ['OliveGreen', '3C8031'], ['Orange', 'F58137'], ['OrangeRed', 'ED135A'], ['Orchid', 'AF72B0'], ['Peach', 'F7965A'], ['Periwinkle', '7977B8'], ['PineGreen', '008B72'],
  ['Plum', '92268F'], ['ProcessBlue', '00B0F0'], ['Purple', '99479B'], ['RawSienna', '974006'], ['Red', 'ED1B23'], ['RedOrange', 'F26035'], ['RedViolet', 'A1246B'],
  ['Rhodamine', 'EF559F'], ['RoyalBlue', '0071BC'], ['RoyalPurple', '613F99'], ['RubineRed', 'ED017D'], ['Salmon', 'F69289'], ['SeaGreen', '3FBC9D'], ['Sepia', '671800'],
  ['SkyBlue', '46C5DD'], ['SpringGreen', 'C6DC67'], ['Tan', 'DA9D76'], ['TealBlue', '00AEB3'], ['Thistle', 'D883B7'], ['Turquoise', '00B4CE'], ['Violet', '58429B'],
  ['VioletRed', 'EF58A0'], ['White', 'FFFFFF'], ['WildStrawberry', 'EE2967'], ['Yellow', 'FFF200'], ['YellowGreen', '98CC70'], ['YellowOrange', 'FAA21A']];
// Word's ten standard colours, as the xcolor names nearest them (Word's own value in the title)
export const STANDARD_COLORS = [['BrickRed', 'C00000', 'Dark red'], ['red', 'FF0000', 'Red'], ['Orange', 'FFC000', 'Orange'], ['yellow', 'FFFF00', 'Yellow'], ['YellowGreen', '92D050', 'Light green'],
  ['ForestGreen', '00B050', 'Green'], ['Cerulean', '00B0F0', 'Light blue'], ['RoyalBlue', '0070C0', 'Blue'], ['MidnightBlue', '002060', 'Dark blue'], ['Plum', '7030A0', 'Purple']];
// what a picked colour needs in the preamble: dvipsnames for its names, nothing for xcolor's own
export function colorNeeds(name) {
  if (BASE_COLORS.some(([n]) => n === name)) return null;
  return DVIPS_COLORS.some(([n]) => n === name) ? 'dvipsnames' : null;
}
// a colour as xcolor writes it in an argument: a name, or [HTML]{C00000} split as { model, value }
export function colorArg(pick) {
  if (pick.name) return { model: null, value: pick.name };
  return { model: 'HTML', value: String(pick.html || '').replace(/^#/, '').toUpperCase() };
}

// ---- menus ---------------------------------------------------------------------------------
// A menu at an element or a rectangle: items [{ name, title, keys, icon (paths), checked (true or
// false for a check item, undefined for a plain one), radio, disabled, run }], null for a line
// between them. o.label names the menu; o.cls adds classes; o.focus false leaves the focus where it
// is (a menu opened by the mouse on the page keeps the caret). Returns the menu's element.
export function openMenu(app, at, items, o = {}) {
  const anchor = at instanceof Element ? at : null;
  const p = app.makePop(anchor, 'pop-dl pop-menu ' + (o.cls || ''), null);
  if (!anchor && at) app.pop.rect = at;
  p.setAttribute('role', 'menu');
  if (o.label) p.setAttribute('aria-label', o.label);
  app.menuKeys(p);
  if (anchor && anchor.hasAttribute('aria-expanded')) { anchor.setAttribute('aria-expanded', 'true'); const was = app.pop.onClose; app.pop.onClose = () => { anchor.setAttribute('aria-expanded', 'false'); if (was) was(); }; }
  if (o.onClose) { const was = app.pop.onClose; app.pop.onClose = () => { if (was) was(); o.onClose(); }; }
  for (const it of items) {
    if (!it) { if (p.lastChild && p.lastChild.getAttribute('role') !== 'separator') { const sep = el('div', 'pop-sep'); sep.setAttribute('role', 'separator'); p.append(sep); } continue; }
    const a = el('button', 'nav-act' + (it.cls ? ' ' + it.cls : ''));
    a.type = 'button';
    a.setAttribute('role', it.checked === undefined ? 'menuitem' : it.radio ? 'menuitemradio' : 'menuitemcheckbox');
    if (it.checked !== undefined) a.setAttribute('aria-checked', it.checked ? 'true' : 'false');
    a.setAttribute('aria-label', it.name);
    if (it.title) a.title = it.title;
    if (it.id) a.id = it.id;
    if (it.icon) a.insertAdjacentHTML('beforeend', SVG(it.icon));
    // (html is the code's own markup, never a document's; a swatch's colour is set as a style)
    else if (it.html) { const g = el('span', 'mi-g'); g.setAttribute('aria-hidden', 'true'); g.innerHTML = it.html; a.append(g); }
    else if (it.swatch) { const g = el('i', 'mi-sw'); g.setAttribute('aria-hidden', 'true'); if (/^[0-9A-Fa-f]{6}$/.test(it.swatch)) g.style.background = '#' + it.swatch; a.append(g); }
    if ((it.label ?? it.name) !== '') a.append(el('span', 'mi-n', it.label ?? it.name));
    if (it.keys) { const k = el('span', 'mi-k', it.keys); k.setAttribute('aria-hidden', 'true'); a.append(k); }
    if (it.disabled) a.setAttribute('aria-disabled', 'true');
    // (a press keeps the caret on the page; the keyboard's Enter comes as a click)
    a.addEventListener('mousedown', (e) => e.preventDefault());
    a.addEventListener('click', () => { if (isOff(a)) return; app.closePop(true); if (it.run) it.run(); });
    p.append(a);
  }
  if (p.lastChild && p.lastChild.getAttribute('role') === 'separator') p.lastChild.remove();
  app.positionPop();
  if (o.focus !== false) { const first = p.querySelector('[role^=menuitem]:not([aria-disabled])'); if (first) first.focus(); }
  return p;
}

// A gallery of choices in a menu, as a grid (Word's bullet library, table styles): items
// [{ name, html (what the tile shows), checked, run }], columns across; the arrow keys move in two
// directions. Every tile is a menu item of its own name.
export function openGallery(app, at, items, o = {}) {
  const p = openMenu(app, at, items.map((it) => ({ ...it, checked: it.checked == null ? false : it.checked, radio: true, cls: 'gal-tile' })), { ...o, cls: 'pop-gal ' + (o.cls || '') });
  const cols = o.columns || 4;
  p.style.setProperty('--cols', cols);
  p.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = [...p.querySelectorAll('[role^=menuitem]')].filter((a) => !isOff(a)), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].focus();
  });
  // up and down move a row (menuKeys moves one: the grid's own rule comes first)
  p.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = [...p.querySelectorAll('[role^=menuitem]')].filter((a) => !isOff(a)), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const j = i + (e.key === 'ArrowDown' ? cols : -cols);
    if (j >= 0 && j < all.length) all[j].focus();
  }, true);
  return p;
}

// ---- a split button ------------------------------------------------------------------------
// The command's own button and an arrow beside it, named "<name> options", that opens its menu.
// b: the main button, made by the caller (it keeps the command's id and name); menu: () => items
export function splitButton(app, b, name, menu, o = {}) {
  const box = el('span', 'rb-split');
  const x = el('button', 'btn ghost icon rb-x');
  x.type = 'button';
  x.id = b.id + '-x';
  x.setAttribute('aria-label', name + ' options');
  x.title = o.title || name + ': more choices';
  x.setAttribute('aria-haspopup', 'menu');
  x.setAttribute('aria-expanded', 'false');
  x.innerHTML = SVG(CARET);
  x.addEventListener('click', () => { if (!isOff(x)) openMenu(app, x, menu(), { label: name }); });
  x.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); x.click(); } });
  box.append(b, x);
  return box;
}

// ---- the colour picker ---------------------------------------------------------------------
// o: { label (the menu's name: "Font Color"), theme: [{ name, hex }] (the document's own),
// auto: the name of the item that takes the colour off ("Automatic", "No Color"), current,
// onPick({ name } | { html } | null) }. Each swatch is a menu item named by its colour's name.
export function colorPicker(app, at, o) {
  const pick = (v) => () => o.onPick(v);
  // (a document's own colour comes with its name and value from its preamble: both stay text)
  const sw = (name, hex, title, label) => ({ name: label || name, label: '', title: title || name, swatch: hex, checked: o.current === name, radio: true, cls: 'gal-tile sw', run: pick({ name }) });
  const items = [], named = new Set(), heard = new Set();
  // (each name once: a menu with two items of one name leaves an agent to guess. xcolor's names
  // tell red from Red, a screen reader does not: the second of two such is said with where it
  // comes from, "Red (dvipsnames)")
  const add = (n, hex, title, from) => {
    if (named.has(n)) return;
    named.add(n);
    const said = heard.has(n.toLowerCase()) ? n + ' (' + from + ')' : n;
    heard.add(n.toLowerCase());
    items.push(sw(n, hex, title, said));
  };
  const base = new Set(BASE_COLORS.map(([n]) => n));
  if (o.auto) items.push({ name: o.auto, run: pick(null) }, null);
  for (const t of o.theme || []) add(t.name, t.hex, t.name + ' (this document\'s colour)', 'this document');
  if (o.theme && o.theme.length) items.push(null);
  for (const [n, hex, word] of STANDARD_COLORS) add(n, hex, word + ': ' + n, base.has(n) ? 'xcolor' : 'dvipsnames');
  items.push(null);
  for (const [n, hex] of BASE_COLORS) add(n, hex, null, 'xcolor');
  items.push(null);
  for (const [n, hex] of DVIPS_COLORS) add(n, hex, n + ' (dvipsnames)', 'dvipsnames');
  items.push(null, { name: 'More colors', title: 'Any colour, written as HTML', run: () => {
    const inp = el('input'); inp.type = 'color'; inp.value = o.html ? '#' + o.html : '#c00000';
    inp.addEventListener('change', () => o.onPick({ html: inp.value.slice(1).toUpperCase() }));
    inp.click();
  } });
  const p = openMenu(app, at, items, { label: o.label || 'Colors', cls: 'pop-colors' });
  p.style.setProperty('--cols', 10);
  return p;
}

// ---- a number field with units ----------------------------------------------------------------
// o: { id, name, value: { value, unit }, units: ['cm', 'mm', 'pt', 'in'], step, min, max,
// onChange({ value, unit }) }. A spinbutton named name, its unit a list named "<name> unit";
// Enter or leaving the field commits, the arrows step, a length typed with its unit ("12pt") is
// taken in that unit.
export function numberField(o) {
  const box = el('span', 'nf');
  const inp = el('input', 'nf-v');
  inp.type = 'text'; inp.inputMode = 'decimal'; inp.id = o.id; inp.setAttribute('role', 'spinbutton'); inp.setAttribute('aria-label', o.name);
  inp.autocomplete = 'off'; inp.spellcheck = false;
  const sel = el('select', 'nf-u');
  sel.setAttribute('aria-label', o.name + ' unit');
  for (const u of o.units || ['cm', 'mm', 'pt', 'in']) sel.add(new Option(u, u));
  let cur = o.value || { value: 0, unit: (o.units || ['cm'])[0] };
  const show = () => { inp.value = String(Math.round(cur.value * 1000) / 1000); sel.value = cur.unit; inp.setAttribute('aria-valuenow', String(cur.value)); inp.setAttribute('aria-valuetext', formatLength(cur)); };
  const clamp = (v) => Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v));
  const commit = (len) => { if (!len) { show(); return; } cur = { value: clamp(len.value), unit: len.unit }; show(); if (o.onChange) o.onChange(cur); };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(parseLength(inp.value, sel.value)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit({ value: (parseLength(inp.value, sel.value) || cur).value + (e.key === 'ArrowUp' ? 1 : -1) * (o.step || 0.1), unit: sel.value }); }
    else if (e.key === 'Escape') show();
  });
  inp.addEventListener('change', () => commit(parseLength(inp.value, sel.value)));
  sel.addEventListener('change', () => commit(convert(cur, sel.value)));
  box.append(inp, sel);
  box.set = (len) => { cur = len; show(); };
  box.get = () => cur;
  show();
  return box;
}

// ---- the dialog shell ------------------------------------------------------------------------
// A dialog named by its title, with a Close button; Escape and a press outside close it (it is
// not modal: the page stays in reach). Returns the dialog's element to fill.
export function dialog(app, o) {
  const p = app.makePop(o.anchor || null, 'pop-dlg ' + (o.cls || ''), o.title);
  if (!o.anchor && o.rect) app.pop.rect = o.rect;
  if (o.onClose) app.pop.onClose = o.onClose;
  return p;
}
