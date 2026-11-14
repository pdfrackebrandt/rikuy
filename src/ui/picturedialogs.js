// The picture's dialogs: Alt Text (what it shows, or Mark as decorative) and Size and Position
// (width, height, lock aspect ratio, rotation, crop, where it stands), each the kit's dialog (role
// dialog named by its title, Close, Escape), its fields named for agents. OK runs the command as
// one commit on the picture selected when it opened, which is selected again after.

import { dialog } from './kit.js';
import { mk } from './dom.js';
import * as X from '../picture.js';
import { SMART, smartMax } from '../drawing.js';

const row = (cls, ...kids) => { const d = mk('div', cls); d.append(...kids); return d; };
function field(name, ctl) {
  const l = mk('label', 'tb-f');
  l.append(mk('span', 'tb-l', name), ctl);
  if (!ctl.getAttribute('aria-label')) ctl.setAttribute('aria-label', name);
  return l;
}
function text(value, cls = 'tb-num pd-len') {
  const i = mk('input', cls);
  i.type = 'text'; i.value = value; i.autocomplete = 'off'; i.spellcheck = false;
  return i;
}
function check(name, on) {
  const l = mk('label', 'tb-ck');
  const i = mk('input');
  i.type = 'checkbox'; i.checked = !!on; i.setAttribute('aria-label', name);
  l.append(i, mk('span', '', name));
  l.input = i;
  return l;
}
function buttons(app, ok, cancel) {
  const b = mk('div', 'tb-btns');
  const o = mk('button', 'btn primary', 'OK'); o.type = 'button';
  const c = mk('button', 'btn ghost', 'Cancel'); c.type = 'button';
  o.addEventListener('click', ok);
  c.addEventListener('click', cancel);
  b.append(c, o);
  return b;
}
// The picture selected now, kept for OK: the dialog's fields take the focus, the picture stays
function open(app, title, id, cls) {
  const h = app.picHere();
  if (!h) { app.toast('Select a picture first: click it on the page.'); return null; }
  const b = document.getElementById(id);
  const r = h.el.getBoundingClientRect();
  const p = dialog(app, { title, anchor: b && b.offsetParent ? b : h.el, rect: r, cls: 'pop-tb pop-pic ' + (cls || '') });
  // (in the window before it is placed: a dialog out of a phone's width widened the page, which
  // then read too wide for the dialog's sheet)
  p.style.left = '8px'; p.style.top = '52px';
  return { p, h, keep: { f: h.f, s: h.s } };
}
const back = (app, keep) => { app.closePop(true); app.picSelect(keep); };
// a phone's dialog is a sheet at the screen's foot: by the screen's width too, which a page
// widened for a moment (a wide row, a box being placed) does not change
function place(app, p) {
  app.positionPop();
  if (Math.min(innerWidth, (typeof screen !== 'undefined' && screen.width) || innerWidth) < 640) { p.classList.add('sheet-mode'); p.style.left = p.style.top = ''; }
}
function finish(app, p, ok, focus) {
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches('input:not([type=checkbox]):not([type=radio]), select')) { e.preventDefault(); ok(); } });
  place(app, p);
  const first = (focus && p.querySelector(focus)) || p.querySelector('textarea, input, select');
  if (first) { first.focus(); if (first.select) first.select(); }
}

// ---- Alt Text ----------------------------------------------------------------------------------
export function altDialog(app) {
  const o = open(app, 'Alt Text', 'rc-picture-alt', 'pd-alt');
  if (!o) return;
  const { p, h, keep } = o;
  const cur = X.altOf(h.src, h.P);
  const ta = mk('textarea', 'pd-alt-t');
  ta.rows = 4; ta.value = cur.text; ta.maxLength = 2000; ta.setAttribute('aria-label', 'Alt text');
  ta.placeholder = 'What the picture shows, in a sentence or two';
  const dec = check('Mark as decorative', cur.decorative);
  const sync = () => { ta.disabled = dec.input.checked; };
  dec.input.addEventListener('change', sync);
  const note = mk('p', 'tb-note', h.P.keyval ? 'Written as \\includegraphics[alt={…}]: tagged PDF reads it aloud, and Word keeps it. Decorative: a "% alt (decorative)" line above the picture (graphicx\'s artifact key needs TeX Live 2024 or later).' : 'This picture uses graphics\' bounding box form, which takes no keys: the text goes in a "% alt:" line above it.');
  const ok = () => { const t = ta.value, d = dec.input.checked; back(app, keep); app.runCommand('picture-alt', { text: t, decorative: d }); };
  p.append(row('tb-sec', mk('div', 'tb-gl', 'How would you describe this picture to someone who cannot see it?'), ta, dec, note), buttons(app, ok, () => back(app, keep)));
  sync();
  finish(app, p, ok, 'textarea');
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); } });
}

// ---- Size and Position -------------------------------------------------------------------------
const PLACES = [['inline', 'In line with text'], ['htbp', 'Figure: best place'], ['t', 'Figure: top of page'], ['b', 'Figure: bottom of page'], ['h', 'Figure: here if it fits'], ['H', 'Figure: exactly here'], ['p', 'Figure: page of floats'], ['wrap-l', 'Left, text wrapping round it'], ['wrap-r', 'Right, text wrapping round it']];
const cmText = (bp) => String(Math.round(bp * 2.54 / 72 * 100) / 100);
export function sizeDialog(app, focus) {
  const o = open(app, 'Size and Position', 'rc-picture-size', 'pd-size');
  if (!o) return;
  const { p, h, keep } = o;
  const S = X.sizeOf(h.src, h.P), d = app.picDrawn(h), lw = app.picLine(h);
  const show = (v, pt) => { const sh = X.shareOf(v); if (sh) return Math.round(sh[0] * 1000) / 10 + '%'; if (v && /^\s*[\d.]+\s*(cm|mm|in|pt|bp)\s*$/.test(v)) return v.trim(); return Math.round(pt * 2.54 / 72.27 * 100) / 100 + 'cm'; };
  const w = text(show(S.width, d.w)), hh = text(show(S.height, d.h));
  w.setAttribute('aria-label', 'Width'); hh.setAttribute('aria-label', 'Height');
  const lock = check('Lock aspect ratio', app.picLocked(h));
  const ang = text(String(X.angleOf(h.src, h.P)), 'tb-num');
  ang.setAttribute('aria-label', 'Rotation');
  const nat = app.picNaturalNow(h);
  const c0 = X.cropOf(h.P, nat) || { l: 0, b: 0, r: 0, t: 0 };
  const cl = text(cmText(c0.l), 'tb-num'), cr = text(cmText(c0.r), 'tb-num'), ct = text(cmText(c0.t), 'tb-num'), cb = text(cmText(c0.b), 'tb-num');
  const pos = X.positionOf(h.src, h.P);
  const sel = mk('select', 'tb-sel');
  sel.setAttribute('aria-label', 'Position');
  const curPlace = pos.mode === 'inline' ? 'inline' : pos.mode === 'wrap' ? 'wrap-' + String(pos.side || 'r').toLowerCase()[0] : pos.mode === 'float' ? (pos.place || 'tbp').replace(/!/g, '') : '';
  if (!PLACES.some(([v]) => v === curPlace)) sel.add(new Option(pos.mode === 'float' ? 'Figure: [' + (pos.place || '') + ']' : 'As written', ''));
  for (const [v, n] of PLACES) sel.add(new Option(n, v));
  sel.value = PLACES.some(([v]) => v === curPlace) ? curPlace : '';
  const fixed = X.whyFixed(h.src, h.P, 'float', app.picContext(h));
  if (fixed) { sel.disabled = true; sel.title = fixed; }
  const was = { w: w.value, h: hh.value, lock: lock.input.checked, ang: ang.value, crop: [cl.value, cr.value, ct.value, cb.value].join(), place: sel.value };
  const len = (t) => { const s = String(t).trim(); const pct = /^([\d.,]+)\s*%$/.exec(s); if (pct) return (parseFloat(pct[1].replace(',', '.')) / 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '\\linewidth'; const m = /^([\d.,]+)\s*(cm|mm|in|pt|bp)?$/.exec(s); if (m) return parseFloat(m[1].replace(',', '.')) + (m[2] || 'cm'); return X.lengthPt(s, lw) != null ? s : null; };
  const ok = () => {
    const args = {};
    const lk = lock.input.checked;
    if (w.value !== was.w || hh.value !== was.h || lk !== was.lock) {
      const W = len(w.value), H = len(hh.value);
      if (!W || !H) { app.toast('Width and height: a length (6.5cm, 2in, 120pt) or a share of the line (50%).'); return; }
      if (lk) { if (hh.value !== was.h && w.value === was.w) args.height = H; else args.width = W; args.free = false; }
      else { args.width = W; args.height = H; args.free = true; }
    }
    if (ang.value !== was.ang) { const a = parseFloat(ang.value); if (!Number.isFinite(a)) { app.toast('Rotation: a number of degrees.'); return; } args.angle = a; }
    const cs = [cl.value, cr.value, ct.value, cb.value];
    if (cs.join() !== was.crop) {
      const v = cs.map((x) => parseFloat(String(x).replace(',', '.')));
      if (!v.every((x) => Number.isFinite(x) && x >= 0)) { app.toast('Crop: lengths in cm, 0 or more.'); return; }
      const bp = v.map((x) => x * 72 / 2.54);
      args.crop = { l: bp[0], r: bp[1], t: bp[2], b: bp[3] };
    }
    if (sel.value !== was.place && sel.value) {
      const v = sel.value;
      args.place = v === 'inline' ? { mode: 'inline' } : v.startsWith('wrap-') ? { mode: 'wrap', side: v.slice(5) } : { mode: 'float', place: v };
    }
    back(app, keep);
    if (Object.keys(args).length) app.runCommand('picture-size', args);
  };
  const fw = field('Width', w), fh = field('Height', hh);
  p.append(
    row('tb-sec', mk('div', 'tb-gl', 'Size'), fw, fh, lock, field('Rotation (degrees, counterclockwise)', ang),
      mk('p', 'tb-note', 'A length (6.5cm, 2in) or a share of the line (50% writes 0.5\\linewidth).')),
    row('tb-sec', mk('div', 'tb-gl', 'Crop (cm from each edge)'), row('pd-crop', field('Left', cl), field('Right', cr), field('Top', ct), field('Bottom', cb))),
    row('tb-sec', mk('div', 'tb-gl', 'Position'), field('Position', sel), fixed ? mk('p', 'tb-note', fixed) : mk('span', 'sr', '')),
    buttons(app, ok, () => back(app, keep)));
  if (!h.P.keyval) for (const x of [w, hh, ang, cl, cr, ct, cb]) x.disabled = true;
  finish(app, p, ok, { width: '.pd-len', height: '.pd-len:nth-of-type(1)', crop: '.pd-crop input', angle: '[aria-label=Rotation]', place: 'select' }[focus] || null);
  if (focus === 'height') hh.focus();
}

// ---- Insert's dialogs: SmartArt, Chart, Drop Cap Options ---------------------------------------
// (opened from the caret: its place kept while a field has the focus, and put back for OK)
function keepCaret(app) {
  const s = getSelection();
  if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange();
}
function backCaret(app) {
  const r = app.rbRange;
  app.closePop(true);
  app.root.focus({ preventScroll: true });
  if (r && r.startContainer && app.root.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
}
function openAt(app, title, id, cls) {
  keepCaret(app);
  const b = document.getElementById(id);
  const s = getSelection();
  const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
  const p = dialog(app, { title, anchor: b && b.offsetParent ? b : null, rect: r && (r.width || r.height) ? r : app.root.getBoundingClientRect(), cls: 'pop-tb pop-pic ' + (cls || '') });
  p.style.left = '8px'; p.style.top = '52px';
  return p;
}
function radios(name, items, value) {
  const g = mk('div', 'tb-radios');
  g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', name);
  g.append(mk('div', 'tb-gl', name));
  const inputs = [];
  for (const [v, label, title] of items) {
    const l = mk('label', 'tb-r');
    const i = mk('input');
    i.type = 'radio'; i.name = 'pd-' + name.replace(/\W+/g, '-').toLowerCase(); i.value = v; i.checked = v === value; i.setAttribute('aria-label', label);
    if (title) l.title = title;
    l.append(i, mk('span', '', label));
    g.append(l);
    inputs.push(i);
  }
  g.value = () => (inputs.find((i) => i.checked) || inputs[0]).value;
  return g;
}

export function smartDialog(app) {
  const p = openAt(app, 'SmartArt', 'rc-insert-smartart', 'pd-smart');
  const kind = radios('Kind', SMART, SMART[0][0]);
  const ta = mk('textarea', 'pd-alt-t');
  ta.rows = 5; ta.value = 'Plan\nWrite\nSubmit'; ta.setAttribute('aria-label', 'Items, one per line');
  const ok = () => {
    const k = kind.value(), items = ta.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (items.length > smartMax(k)) { app.toast('At most ' + smartMax(k) + ' items: smartdiagram\'s colours stop there and TeX stops on more.'); return; }
    backCaret(app); app.runCommand('insert-smartart', { kind: k, items });
  };
  p.append(row('tb-sec', kind), row('tb-sec', mk('div', 'tb-gl', 'Items, one per line'), ta, mk('p', 'tb-note', 'Written as \\smartdiagram[kind]{items} (smartdiagram), ten items at most (eleven for Bubbles); click it on the page to edit them.')), buttons(app, ok, () => backCaret(app)));
  place(app, p);
  ta.focus(); ta.select();
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); } });
}

// Chart: its kind and a small grid of numbers, Word's own sample data to start with
export function chartDialog(app) {
  const p = openAt(app, 'Chart', 'rc-insert-chart', 'pd-chart');
  const kind = radios('Chart type', [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line']], 'column');
  const COLS = 3, ROWS = 6;
  const sample = [['', 'Series 1', 'Series 2', 'Series 3'], ['Category 1', '4.3', '2.4', '2'], ['Category 2', '2.5', '4.4', '2'], ['Category 3', '3.5', '1.8', '3'], ['Category 4', '4.5', '2.8', '5'], ['', '', '', ''], ['', '', '', '']];
  const grid = mk('div', 'pd-grid');
  grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', 'Chart data');
  const cells = [];
  for (let r = 0; r <= ROWS; r++) {
    const tr = mk('div', 'pd-gr');
    tr.setAttribute('role', 'row');
    cells.push([]);
    for (let c = 0; c <= COLS; c++) {
      const i = text(sample[r] ? sample[r][c] : '', 'pd-cell' + (r === 0 || c === 0 ? ' head' : ''));
      i.setAttribute('aria-label', r === 0 && c === 0 ? 'Corner' : r === 0 ? 'Name of series ' + c : c === 0 ? 'Category ' + r : 'Row ' + r + ', series ' + c);
      if (r === 0 && c === 0) { i.disabled = true; i.value = ''; }
      const cell = mk('div', 'pd-gc'); cell.setAttribute('role', 'gridcell'); cell.append(i);
      tr.append(cell);
      cells[r].push(i);
    }
    grid.append(tr);
  }
  const ok = () => {
    const rows = [];
    for (let r = 1; r <= ROWS; r++) if (cells[r][0].value.trim()) rows.push(r);
    const series = [];
    for (let c = 1; c <= COLS; c++) {
      const vals = rows.map((r) => cells[r][c].value.trim());
      if (!cells[0][c].value.trim() && vals.every((v) => !v)) continue;
      series.push({ name: cells[0][c].value.trim() || 'Series ' + c, values: vals.map((v) => (Number.isFinite(parseFloat(v.replace(',', '.'))) ? parseFloat(v.replace(',', '.')) : 0)) });
    }
    if (!rows.length || !series.length) { app.toast('Fill in at least one category and one series of numbers.'); return; }
    const k = kind.value(), cats = rows.map((r) => cells[r][0].value.trim());
    backCaret(app);
    app.runCommand('insert-chart', { kind: k, cats, series });
  };
  p.append(row('tb-sec', kind), row('tb-sec', mk('div', 'tb-gl', 'Data'), grid, mk('p', 'tb-note', 'Written as a pgfplots axis with its coordinates in the source; click the chart on the page to edit them.')), buttons(app, ok, () => backCaret(app)));
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); ok(); } });
  place(app, p);
  cells[1][0].focus(); cells[1][0].select();
}

export function dropCapDialog(app) {
  const at = app.ribbonAt();
  const d = app.dropCapAt(at);
  if (!d) { app.toast(app.dropCapWhy(at)); return; }
  const p = openAt(app, 'Drop Cap', 'rc-insert-dropcap', 'pd-drop');
  const pos = radios('Position', [['none', 'None'], ['dropped', 'Dropped'], ['margin', 'In margin']], d.mode === 'none' ? 'dropped' : d.mode);
  const lines = text(String(d.L ? +((/(?:^|,)\s*lines\s*=\s*(\d+)/.exec(d.L.ot) || [])[1] || 3) : 3), 'tb-num');
  lines.setAttribute('aria-label', 'Lines to drop');
  const dist = text(d.L ? ((/(?:^|,)\s*findent\s*=\s*([^,]+)/.exec(d.L.ot) || [])[1] || '0pt').trim() : '0pt', 'tb-num');
  dist.setAttribute('aria-label', 'Distance from text');
  const ok = () => {
    const mode = pos.value(), n = parseInt(lines.value, 10);
    if (mode !== 'none' && !(n >= 2 && n <= 10)) { app.toast('Lines to drop: 2 to 10.'); return; }
    const ds = dist.value.trim(), dl = /^([\d.]+)\s*(pt|mm|cm|em|ex|in)?$/.exec(ds);
    if (mode !== 'none' && ds && !dl) { app.toast('Distance from text: a length such as 2pt or 1mm.'); return; }
    backCaret(app);
    app.runCommand('insert-dropcap', { mode, lines: n, distance: dl && parseFloat(dl[1]) ? parseFloat(dl[1]) + (dl[2] || 'pt') : null });
  };
  p.append(row('tb-sec', pos), row('tb-sec', mk('div', 'tb-gl', 'Options'), field('Lines to drop', lines), field('Distance from text', dist), mk('p', 'tb-note', 'Written as \\lettrine[lines=3]{T}{his} (lettrine).')), buttons(app, ok, () => backCaret(app)));
  finish(app, p, ok, 'input[type=radio]:checked');
}
