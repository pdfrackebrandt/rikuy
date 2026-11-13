// The page's dialogs (task 34's rule, kit.dialog: role dialog, its title as its name, Close,
// Escape): Page setup (margins, gutter, mirrored margins, orientation, paper, the distances of
// the header and the footer, vertical alignment), More columns, Custom watermark, Page borders,
// Line numbering options, Hyphenation options, Format page numbers. Each writes what changed, and
// only that, in one step of history (App.pageEdit; the edits are src/pagesrc.js's).

import { dialog, numberField } from './kit.js';
import { mk } from './dom.js';
import * as PS from '../pagesrc.js';
import { geometry, paperSize } from '../layout.js';

const CM = 72.27 / 2.54;
const cm = (pt) => ({ value: Math.round(pt / CM * 100) / 100, unit: 'cm' });
const toPt = (len) => (len ? len.value * (PS.UNIT[len.unit] || 1) : null);

// a labelled row: the label names the field for a screen reader and an agent
function row(label, field, id) {
  const r = mk('div', 'ps-row');
  const l = mk('label', 'ps-l', label);
  const inp = field.matches && field.matches('input, select, textarea') ? field : field.querySelector('input, select, textarea');
  if (inp) { if (!inp.id) inp.id = id || 'ps-' + label.toLowerCase().replace(/[^a-z]+/g, '-'); l.htmlFor = inp.id; }
  r.append(l, field);
  return r;
}
function select(id, name, options, value) {
  const s = mk('select', 'ps-sel');
  s.id = id;
  s.setAttribute('aria-label', name);
  for (const [v, t] of options) s.add(new Option(t, v));
  s.value = value;
  return s;
}
function check(id, name, on) {
  const box = mk('label', 'ps-check');
  const c = mk('input');
  c.type = 'checkbox'; c.id = id; c.checked = !!on;
  box.append(c, mk('span', '', name));
  return { box, c };
}
function buttons(app, p, ok, okName = 'OK') {
  const r = mk('div', 'pop-row ps-acts');
  const cancel = mk('button', 'btn ghost sm', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => { app.closePop(); });
  const b = mk('button', 'btn sm', okName);
  b.type = 'button';
  b.addEventListener('click', () => { const run = ok(); app.closePop(true); if (run) run(); });
  r.append(mk('span', 'grow'), cancel, b);
  p.append(r);
  // (Enter in a field is OK, as in Word's dialogs)
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]), select')) { e.preventDefault(); b.click(); } });
  return b;
}
const section = (name) => { const f = mk('fieldset', 'ps-sec'); f.append(mk('legend', '', name)); return f; };
const nf = (id, name, len, o = {}) => numberField({ id, name, value: len, units: o.units || ['cm', 'mm', 'in', 'pt'], step: o.step || 0.1, min: o.min ?? 0, max: o.max ?? 100 });
const anchorOf = (app, id) => app.pageAnchor(id);

// ---- Page setup ------------------------------------------------------------------------------------
export function openPageSetup(app, focus) {
  const O = app.model.opts, g = geometry(O), m = app.pageMargins(), P = paperSize(O);
  const p = dialog(app, { title: 'Page setup', anchor: anchorOf(app, 'page-setup'), cls: 'pop-ps' });
  // Margins
  const mar = section('Margins');
  const top = nf('ps-top', 'Top', cm(m.t)), bottom = nf('ps-bottom', 'Bottom', cm(m.b));
  const left = nf('ps-left', m.two ? 'Inside' : 'Left', cm(m.l)), right = nf('ps-right', m.two ? 'Outside' : 'Right', cm(m.r));
  const gutter = nf('ps-gutter', 'Gutter', cm(m.gutter || 0));
  const geo = O.geo || {};
  const mirror = check('ps-mirror', 'Mirror margins (two sided pages: inside and outside)', !!(g.twoside && geo.twoside === true));
  const grid = mk('div', 'ps-grid');
  grid.append(row('Top', top), row('Bottom', bottom), row(m.two ? 'Inside' : 'Left', left), row(m.two ? 'Outside' : 'Right', right), row('Gutter', gutter));
  mar.append(grid, mirror.box);
  // Orientation
  const ori = section('Orientation');
  const oSel = select('ps-orient', 'Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], P.land ? 'landscape' : 'portrait');
  ori.append(row('Orientation', oSel, 'ps-orient'));
  // Paper
  const pap = section('Paper');
  const cur = app.pagePaper();
  const pSel = select('ps-paper', 'Paper size', [...PS.SIZES.map(([id, name, dims]) => [id, name + ' (' + dims + ')']), ['custom', 'Custom size']], cur && PS.SIZES.some(([id]) => id === cur) ? cur : 'custom');
  const pw = nf('ps-pw', 'Width', cm(Math.min(P.w, P.h)), { max: 200 }), ph = nf('ps-ph', 'Height', cm(Math.max(P.w, P.h)), { max: 300 });
  const sync = () => {
    const custom = pSel.value === 'custom';
    for (const f of [pw, ph]) for (const x of f.querySelectorAll('input, select')) x.disabled = !custom;
    if (!custom) { const d = PS.PAPERS[pSel.value]; pw.set(cm(d.w)); ph.set(cm(d.h)); }
  };
  pSel.addEventListener('change', sync);
  const pg = mk('div', 'ps-grid');
  pg.append(row('Width', pw), row('Height', ph));
  pap.append(row('Paper size', pSel, 'ps-paper'), pg);
  // Layout
  const lay = section('Layout');
  const hs = nf('ps-headsep', 'Header to text', cm(g.headsep), { max: 20 }), fs = nf('ps-footskip', 'Text to footer', cm(g.footskip), { max: 20 });
  const va = app.pageVAlign();
  const vSel = select('ps-valign', 'Vertical alignment', [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']], va ? va.now : 'top');
  if (!va) vSel.disabled = true;
  const lg = mk('div', 'ps-grid');
  lg.append(row('Header to text', hs), row('Text to footer', fs));
  lay.append(lg, row('Vertical alignment (the page the caret is on)', vSel, 'ps-valign'));
  p.append(mar, ori, pap, lay);
  sync();
  const before = { m: [m.t, m.b, m.l, m.r, m.gutter || 0, mirror.c.checked], land: P.land, paper: pSel.value, w: P.w, h: P.h, hs: g.headsep, fs: g.footskip };
  buttons(app, p, () => {
    const others = app.preambleOthers();
    const steps = [];
    const near = (a, b) => Math.abs(a - b) < 0.02 * CM;
    const now = [toPt(top.get()), toPt(bottom.get()), toPt(left.get()), toPt(right.get()), toPt(gutter.get()), mirror.c.checked];
    // (the vertical alignment is the text's: written first, on the text the caret knows)
    if (va && vSel.value !== va.now) steps.push((t) => app.pageVAlignEdits(t, vSel.value, va));
    if (!now.slice(0, 5).every((v, k) => near(v, before.m[k])) || now[5] !== before.m[5]) {
      steps.push((t) => PS.marginEdits(t, { t: now[0], b: now[1], l: now[2], r: now[3], gutter: now[4] > 0.01 ? now[4] : 0, mirrored: now[5] }, { others }));
    }
    const land = oSel.value === 'landscape';
    if (pSel.value === 'custom') {
      const w = toPt(pw.get()), h = toPt(ph.get());
      if (!near(w, Math.min(before.w, before.h)) || !near(h, Math.max(before.w, before.h)) || before.paper !== 'custom') steps.push((t) => PS.paperEdits(t, { w, h, unit: 'cm' }, { others }));
    } else if (pSel.value !== before.paper) steps.push((t) => PS.paperEdits(t, pSel.value, { others }));
    if (land !== before.land) steps.push((t) => PS.orientationEdits(t, land ? 'landscape' : 'portrait', { others }));
    const h1 = toPt(hs.get()), f1 = toPt(fs.get());
    const hf = {};
    if (!near(h1, before.hs)) hf.headsep = PS.fmtLen(h1, 'cm');
    if (!near(f1, before.fs)) hf.footskip = PS.fmtLen(f1, 'cm');
    if (Object.keys(hf).length) steps.push((t) => PS.geometryEdits(t, hf, null, { others }));
    if (!steps.length) return null;
    return () => app.pageEdit(app.pageSteps(steps), 'page-setup');
  });
  app.positionPop();
  const want = { margins: top, paper: pSel, layout: hs }[focus] || top;
  (want.matches && want.matches('select') ? want : want.querySelector('input')).focus();
  return p;
}

// ---- More columns ----------------------------------------------------------------------------------
export function openColumns(app) {
  const p = dialog(app, { title: 'Columns', anchor: anchorOf(app, 'columns'), cls: 'pop-ps' });
  const g = geometry(app.model.opts), at = app.ribbonAt();
  const n0 = app.pageColumns();
  const num = mk('input', 'ps-num');
  num.type = 'number'; num.min = '1'; num.max = '10'; num.value = String(n0); num.id = 'ps-cols';
  num.setAttribute('aria-label', 'Number of columns');
  const sep = nf('ps-colsep', 'Spacing', cm(g.colsep), { max: 10 });
  const line = check('ps-colrule', 'Line between', (app.model.opts.page || {}).colrule > 0);
  const scopes = [['document', 'Whole document']];
  if (at && at.multi) scopes.push(['selection', 'Selected text']);
  if (at && at.c && !at.c.ghost && PS.multicolsAt(app.src(at.c.f), at.c.a)) scopes.push(['here', 'These columns (the caret\'s)']);
  const scope = select('ps-colscope', 'Apply to', scopes, scopes[scopes.length - 1][0]);
  p.append(row('Number of columns', num, 'ps-cols'), row('Spacing', sep), line.box, row('Apply to', scope, 'ps-colscope'));
  buttons(app, p, () => {
    const n = Math.max(1, Math.min(10, parseInt(num.value, 10) || 1));
    const o = { scope: scope.value === 'document' ? 'document' : null };
    const s1 = toPt(sep.get());
    if (Math.abs(s1 - g.colsep) > 0.05) o.sep = PS.fmtLen(s1, 'pt');
    const was = (app.model.opts.page || {}).colrule > 0;
    if (line.c.checked !== was) o.rule = line.c.checked ? '0.4pt' : null;
    return () => app.pageColumnsSet(n, o);
  });
  app.positionPop();
  num.focus();
  return p;
}

// ---- Custom watermark --------------------------------------------------------------------------------
const WM_COLORS = [['', 'Light gray (the package\'s own)'], ['gray!50', 'Gray'], ['red!30', 'Light red'], ['blue!25', 'Light blue'], ['green!30', 'Light green']];
export function openWatermark(app) {
  const W = PS.watermark(app.src(app.main), { others: app.preambleOthers() }) || {};
  const p = dialog(app, { title: 'Watermark', anchor: anchorOf(app, 'watermark'), cls: 'pop-ps' });
  const text = mk('input', 'ps-text');
  text.type = 'text'; text.id = 'ps-wm-text'; text.value = W.on ? W.text : 'DRAFT'; text.setAttribute('aria-label', 'Watermark text'); text.maxLength = 120;
  const scale = mk('input', 'ps-num');
  scale.type = 'number'; scale.step = '0.1'; scale.min = '0.1'; scale.max = '5'; scale.id = 'ps-wm-scale'; scale.value = String(W.on ? W.scale : 1); scale.setAttribute('aria-label', 'Size (scale)');
  const angle = select('ps-wm-angle', 'Layout', [['45', 'Diagonal'], ['0', 'Horizontal']], W.on && W.angle === 0 ? '0' : '45');
  const color = select('ps-wm-color', 'Color', WM_COLORS.some(([v]) => v === (W.color || '')) ? WM_COLORS : [...WM_COLORS, [W.color, W.color]], W.color || '');
  p.append(row('Text', text, 'ps-wm-text'), row('Size (scale)', scale, 'ps-wm-scale'), row('Layout', angle, 'ps-wm-angle'), row('Color', color, 'ps-wm-color'));
  const rm = mk('button', 'btn ghost sm', 'Remove watermark');
  rm.type = 'button';
  rm.disabled = !W.on;
  rm.addEventListener('click', () => { app.closePop(true); app.runCommand('watermark', 'off'); });
  buttons(app, p, () => {
    const t = text.value.replace(/[{}\\%#&$]/g, '').trim();
    if (!t) return null;
    return () => app.runCommand('watermark', { text: t, scale: parseFloat(scale.value) || 1, angle: +angle.value, color: color.value || null });
  });
  p.querySelector('.ps-acts').prepend(rm);
  app.positionPop();
  text.focus(); text.select();
  return p;
}

// ---- Page borders ------------------------------------------------------------------------------------
export function openBorders(app) {
  const B = PS.pageBorder(app.src(app.main));
  const p = dialog(app, { title: 'Page borders', anchor: anchorOf(app, 'page-borders'), cls: 'pop-ps' });
  const kind = select('ps-bd-kind', 'Setting', [['none', 'None'], ['box', 'Box']], B ? 'box' : 'none');
  const inset = nf('ps-bd-inset', 'Distance from the edge', cm(B ? B.inset : CM), { max: 10 });
  const width = nf('ps-bd-width', 'Width', { value: B ? Math.round(B.width * 100) / 100 : 0.4, unit: 'pt' }, { units: ['pt', 'mm'], step: 0.2, max: 20 });
  const color = select('ps-bd-color', 'Color', [['', 'Black'], ['gray', 'Gray'], ['blue', 'Blue'], ['red', 'Red']], (B && B.color) || '');
  p.append(row('Setting', kind, 'ps-bd-kind'), row('Distance from the edge', inset), row('Width', width), row('Color', color, 'ps-bd-color'));
  buttons(app, p, () => {
    if (kind.value === 'none') return B ? () => app.runCommand('page-borders', 'off') : null;
    return () => app.runCommand('page-borders', { inset: toPt(inset.get()), width: toPt(width.get()), color: color.value || null });
  });
  app.positionPop();
  kind.focus();
  return p;
}

// ---- Line numbering options ----------------------------------------------------------------------------
export function openLineNumbering(app) {
  const L = app.pageLineNumbers() || {};
  const p = dialog(app, { title: 'Line numbers', anchor: anchorOf(app, 'line-numbers'), cls: 'pop-ps' });
  const mode = select('ps-ln-mode', 'Numbering', [['none', 'None'], ['continuous', 'Continuous'], ['page', 'Restart each page'], ['section', 'Restart each section']], L.on ? L.mode : 'none');
  const by = mk('input', 'ps-num');
  by.type = 'number'; by.min = '1'; by.max = '100'; by.id = 'ps-ln-by'; by.value = String(L.modulo || 1); by.setAttribute('aria-label', 'Count by');
  p.append(row('Numbering', mode, 'ps-ln-mode'), row('Count by', by, 'ps-ln-by'));
  buttons(app, p, () => {
    const others = app.preambleOthers(), n = Math.max(1, parseInt(by.value, 10) || 1);
    const steps = [(t) => PS.lineNumberEdits(t, mode.value, { others })];
    if (mode.value !== 'none' || L.modAt) steps.push((t) => PS.moduloEdits(t, mode.value === 'none' ? 1 : n, { others }));
    return () => app.pageEdit(app.pageSteps(steps), 'page-lineno');
  });
  app.positionPop();
  mode.focus();
  return p;
}

// ---- Hyphenation options --------------------------------------------------------------------------------
export function openHyphenation(app) {
  const src = app.src(app.main), h = PS.hyphenation(src, { others: app.preambleOthers() }), X = PS.exceptions(src);
  const p = dialog(app, { title: 'Hyphenation', anchor: anchorOf(app, 'hyphenation'), cls: 'pop-ps' });
  const auto = check('ps-hy-auto', 'Hyphenate the document automatically', h !== 'none');
  const ta = mk('textarea', 'ps-ta');
  ta.id = 'ps-hy-words'; ta.rows = 4; ta.value = X.words.join('\n'); ta.setAttribute('aria-label', 'Words broken your way');
  ta.placeholder = 'data-base\nman-u-script';
  p.append(auto.box, row('Words broken your way, one a line, a hyphen where they may break', ta, 'ps-hy-words'));
  buttons(app, p, () => {
    const others = app.preambleOthers();
    const words = ta.value.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{M}\-]/gu, '')).filter((w) => w && w.includes('-')).slice(0, 500);
    const steps = [(t) => PS.hyphenationEdits(t, auto.c.checked ? 'auto' : 'none', { others }), (t) => PS.exceptionEdits(t, words)];
    return () => app.pageEdit(app.pageSteps(steps), 'page-hyph');
  });
  app.positionPop();
  auto.c.focus();
  return p;
}

// ---- Format page numbers -----------------------------------------------------------------------------------
export function openPageNumberFormat(app) {
  const P = PS.pageNumbers(app.src(app.main)) || { numbering: 'arabic', start: 1 };
  const p = dialog(app, { title: 'Page number format', anchor: anchorOf(app, 'page-number'), cls: 'pop-ps' });
  const fmt = select('ps-pn-fmt', 'Number format', PS.NUMBERINGS, PS.NUMBERINGS.some(([v]) => v === P.numbering) ? P.numbering : 'arabic');
  const start = mk('input', 'ps-num');
  start.type = 'number'; start.min = '0'; start.max = '9999'; start.id = 'ps-pn-start'; start.value = String(P.start); start.setAttribute('aria-label', 'Start at');
  p.append(row('Number format', fmt, 'ps-pn-fmt'), row('Start at', start, 'ps-pn-start'));
  buttons(app, p, () => {
    const n = Math.max(0, parseInt(start.value, 10) || 1);
    return () => app.pageEdit(PS.pageNumberEdits(app.src(app.main), fmt.value, n), 'page-num');
  });
  app.positionPop();
  fmt.focus();
  return p;
}
