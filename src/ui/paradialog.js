// The Paragraph dialog as Word's (task 34's rule, kit.dialog: role dialog, its title as its name,
// Close, Escape): Indents and Spacing (alignment, direction, left and right indents, the first
// line, space before and after, line spacing exactly as Word offers it), Line and Page Breaks
// (widow and orphan control, keep with next, keep lines together, page break before, suppress
// line numbers, don't hyphenate) and, under them, the whole document's line spacing, space
// between paragraphs and first line indent. OK writes what changed and only that, in one step of
// history (App.paraDialogApply); Tabs… opens the dialog of a tab stop with a leader. Also the
// Layout tab's four paragraph fields (paraField).

import { dialog } from './kit.js';
import { mk } from './dom.js';
import * as P from '../parasrc.js';
import { usePackages } from '../preamble.js';

// TeX's baselineskip at the class's size: what Exactly and At least are counted against
const BASE = { 10: 12, 11: 13.6, 12: 14.5 };
// a length typed in a field: '1.5', '1,5 cm', '12pt', '0.5in' -> points (unit: the field's own)
export function fieldPt(text, unit) {
  const m = /^\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(pt|bp|mm|cm|in|pc)?\s*$/.exec(String(text));
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.')) * P.PT[m[2] || unit];
}
const show = (pt, unit) => (pt == null ? '' : String(Math.round(pt / P.PT[unit] * 100) / 100));

// ---- the Layout tab's fields --------------------------------------------------------------------
const FIELD = {
  'indent-left': ['Left', 'Indent Left', 'cm', 0.25], 'indent-right': ['Right', 'Indent Right', 'cm', 0.25],
  'spacing-before': ['Before', 'Spacing Before', 'pt', 6], 'spacing-after': ['After', 'Spacing After', 'pt', 6]
};
// A spin field of the ribbon: its label, the number, its unit; Enter or leaving it writes the value
// (App.paraFieldSet), the arrows step it (a quarter centimetre, 6 points), Escape goes back
export function paraField(app, id) {
  const [label, name, unit, step] = FIELD[id];
  const box = mk('span', 'pf');
  const l = mk('label', 'pf-l', label);
  const inp = mk('input', 'pf-v');
  inp.type = 'text'; inp.id = 'rl-' + id; inp.setAttribute('role', 'spinbutton'); inp.setAttribute('aria-label', name);
  inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.title = name + ' (' + unit + ')';
  l.htmlFor = inp.id;
  box.append(l, inp, mk('span', 'pf-u', unit));
  let cur = null;
  // back to the place on the page the field stands for (App.paraFieldSync keeps it, in the source):
  // focusing the page alone would put the caret at its start
  const back = () => {
    const c = app.paraFieldC;
    if (c && app.files.has(c.f)) app.restoreCaret(c.collapsed ? { f: c.f, p: c.a, bias: -1 } : { f: c.f, p: c.a, selA: c.a, selB: c.b }, true);
    else app.ribbonBack();
  };
  inp.setValue = (v) => {
    cur = v;
    inp.value = v == null ? '' : String(v.value);
    if (v == null) { inp.removeAttribute('aria-valuenow'); inp.removeAttribute('aria-valuetext'); }
    else { inp.setAttribute('aria-valuenow', String(v.value)); inp.setAttribute('aria-valuetext', v.value + ' ' + unit); }
  };
  const commit = (pt) => {
    if (pt == null) { inp.setValue(cur); return; }
    const v = { value: Math.round(Math.max(0, pt) / P.PT[unit] * 100) / 100, unit };
    if (cur && Math.abs(cur.value - v.value) < 0.005) return;
    back();
    app.runCommand(id, v);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(fieldPt(inp.value, unit)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const now = fieldPt(inp.value, unit) ?? 0;
      const v = Math.max(0, now / P.PT[unit] + (e.key === 'ArrowUp' ? step : -step));
      inp.value = String(Math.round(v * 100) / 100);
      commit(v * P.PT[unit]);
      inp.focus();
      inp.value = String(Math.round(v * 100) / 100);
    } else if (e.key === 'Escape') { e.preventDefault(); inp.setValue(cur); back(); }
  });
  inp.addEventListener('change', () => commit(fieldPt(inp.value, unit)));
  return box;
}

// Where the dialog opens: under the control that opened it or its group, as the ribbon shows them,
// else under the ribbon in the middle of the window
function placeOf(app) {
  for (const id of ['rc-paragraph-settings', 'rg-home-paragraph', 'rl-indent-left', 'rg-layout-paragraph', 'rc-line-spacing', 'rc-paragraph-spacing']) {
    const el = document.getElementById(id);
    if (el && el.offsetParent && el.getBoundingClientRect().width) return { anchor: el };
  }
  const rb = document.getElementById('ribbon'), y = rb ? rb.getBoundingClientRect().bottom : 100, w = Math.min(480, innerWidth - 16);
  return { rect: { left: Math.max(8, (innerWidth - w) / 2), right: Math.max(8, (innerWidth - w) / 2) + w, top: y, bottom: y, width: w, height: 0 } };
}

// ---- parts of the dialog --------------------------------------------------------------------------
function row(label, field) {
  const r = mk('div', 'pd-row');
  const l = mk('label', 'pd-l', label);
  const target = field.input || field;
  if (target.id) l.htmlFor = target.id;
  r.append(l, field);
  return r;
}
function select(id, name, options, value) {
  const s = mk('select', 'pd-sel');
  s.id = id; s.setAttribute('aria-label', name);
  for (const [v, t] of options) s.add(new Option(t, v));
  s.value = value;
  return s;
}
function num(id, name, value, unit) {
  const w = mk('span', 'pd-num');
  const i = mk('input', 'pd-in');
  i.type = 'text'; i.id = id; i.inputMode = 'decimal'; i.autocomplete = 'off'; i.spellcheck = false; i.setAttribute('aria-label', name + (unit ? ' (' + unit + ')' : ''));
  i.value = value;
  w.append(i);
  if (unit) w.append(mk('span', 'pd-u', unit));
  w.input = i;
  return w;
}
function check(id, name, on, disabled, title) {
  const box = mk('label', 'pd-check');
  const c = mk('input');
  c.type = 'checkbox'; c.id = id; c.checked = !!on; c.disabled = !!disabled;
  if (title) box.title = title;
  box.append(c, mk('span', '', name));
  box.c = c;
  return box;
}
const section = (name) => { const f = mk('fieldset', 'pd-sec'); f.append(mk('legend', '', name)); return f; };
const grid = (...kids) => { const g = mk('div', 'pd-grid'); g.append(...kids); return g; };

// the line spacing as the dialog's two fields: [kind, at]
function spacingFields(sp) {
  if (!sp || sp.lines === 1) return ['single', ''];
  if (sp.lines === 1.5) return ['onehalf', ''];
  if (sp.lines === 2) return ['double', ''];
  return ['multiple', String(sp.multiple)];
}
// and back: a spacing (src/parasrc.js), or null where At holds no number
function spacingFrom(kind, at, ptSize) {
  if (kind === 'single') return { lines: 1 };
  if (kind === 'onehalf') return { lines: 1.5 };
  if (kind === 'double') return { lines: 2 };
  const x = parseFloat(String(at).replace(',', '.'));
  if (!(x > 0)) return null;
  // (Exactly and At least: the nearest stretch, against the class's baselineskip, GAP H51)
  if (kind === 'exactly' || kind === 'atleast') return { multiple: Math.round(x / (BASE[ptSize] || 12) * 100) / 100 };
  return x > 9 ? null : { multiple: Math.round(x * 1000) / 1000 };
}
const LS_OPTIONS = [['single', 'Single'], ['onehalf', '1.5 lines'], ['double', 'Double'], ['atleast', 'At least'], ['exactly', 'Exactly'], ['multiple', 'Multiple']];

// ---- the Paragraph dialog ---------------------------------------------------------------------------
export function openParagraphDialog(app, at, p, args = {}) {
  if (args.tab === 'tabs') return openTabs(app, at);
  const ok = !!p && !p.why && !p.float;
  // (the caret on the page as the dialog opens: OK maps it through what it writes, the dialog
  // having had the focus since)
  const c0 = app.caretNow();
  const src = app.src(app.main), others = app.preambleOthers(), O = app.model.opts, ptSize = O.pt;
  const u0 = ok ? p.units[0] : null, U = u0 ? u0.U : null;
  // what is there now
  // (a figure's: as the page draws it, the class's own where nothing is written)
  const alignNow = ok ? (app.paraAlignNow(p) || 'justify') : p && p.float ? app.floatAlign(p.float).v : 'justify';
  const ind = ok ? P.indentOf(p.src, U) : { l: 0, r: 0 };
  const first = ok ? P.firstLineOf(U, !!u0.it.indent) : { special: 'first', by: null };
  const parindent = P.docParindent(src);
  const before = ok ? P.spaceOf(U, 'before').pt : 0, after = ok ? P.spaceOf(U, 'after').pt : 0;
  const docSp = P.docSpacing(src, { others });
  const docV = docSp ? docSp.v : { lines: 1 };
  const dialect = P.spacingDialect(src);
  const K = P.spacingKind(dialect || 'setspace');
  const own = ok ? U.levels.find((L) => L.W && K.names.includes(L.W.name)) : null;
  const paraV = own ? K.value(own.W) : docV;
  const flags = ok ? { keep: !!P.flagOf(U, 'keep'), samepage: !!P.flagEnvOf(p.src, U, P.SAMEPAGE), break: !!P.flagOf(U, 'break'), nohyph: !!P.flagEnvOf(p.src, U, P.NOHYPH), nolineno: !!P.flagEnvOf(p.src, U, P.NOLINENO) } : {};
  const widow = P.widowControl(src).on;
  const parskip = P.docParskip(src, { others }).skip;
  const dirs = app.paraDirs(), dirNow = ok ? app.paraDirNow(at) : null;

  const d = dialog(app, { title: 'Paragraph', ...placeOf(app), cls: 'pop-pd' });
  // the tabs
  const tl = mk('div', 'pd-tabs');
  tl.setAttribute('role', 'tablist'); tl.setAttribute('aria-label', 'Paragraph');
  const panels = [];
  const tabOf = (id, name) => {
    const t = mk('button', 'pd-tab', name);
    t.type = 'button'; t.id = 'pd-t-' + id; t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'pd-p-' + id);
    const panel = mk('div', 'pd-panel');
    panel.id = 'pd-p-' + id; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', t.id);
    panels.push([t, panel]);
    t.addEventListener('click', () => pick(t));
    tl.append(t);
    return panel;
  };
  const pick = (t) => { for (const [x, panel] of panels) { const on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; panel.hidden = !on; } };
  tl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = panels.findIndex(([x]) => x === document.activeElement), j = (i + (e.key === 'ArrowRight' ? 1 : panels.length - 1)) % panels.length;
    pick(panels[j][0]); panels[j][0].focus();
  });
  const p1 = tabOf('indents', 'Indents and Spacing'), p2 = tabOf('breaks', 'Line and Page Breaks');
  d.append(tl, p1, p2);

  // Indents and Spacing
  const gen = section('General');
  // (paragraphs of several alignments: none shown, as Word shows none, and none written unless one is picked)
  const alignSel = select('pd-align', 'Alignment', [...(alignNow === 'mixed' ? [['mixed', '']] : []), ['left', 'Left'], ['center', 'Centered'], ['right', 'Right'], ['justify', 'Justified']], alignNow);
  let dirSel = null;
  if (dirs.rtl) dirSel = select('pd-dir', 'Direction', [['ltr', 'Left-to-right'], ['rtl', 'Right-to-left']], dirNow || 'ltr');
  gen.append(grid(row('Alignment', alignSel), dirSel ? row('Direction', dirSel) : mk('span')));
  const indS = section('Indentation');
  const left = num('pd-left', 'Left', show(ind.l, 'cm'), 'cm'), right = num('pd-right', 'Right', show(ind.r, 'cm'), 'cm');
  const special = select('pd-special', 'Special', [['none', '(none)'], ['first', 'First line'], ['hanging', 'Hanging']], first.special);
  const byPt = first.special === 'hanging' ? P.lenPt(first.by) : parindent && parindent.pt != null ? parindent.pt : (O.parindent ?? 15);
  const by = num('pd-by', 'By', show(byPt, 'cm'), 'cm');
  indS.append(grid(row('Left', left), row('Right', right), row('Special', special), row('By', by)));
  const spS = section('Spacing');
  const bef = num('pd-before', 'Before', show(before, 'pt'), 'pt'), aft = num('pd-after', 'After', show(after, 'pt'), 'pt');
  const [lk, la] = spacingFields(paraV);
  const ls = select('pd-line', 'Line spacing', LS_OPTIONS, lk), lsAt = num('pd-at', 'At', la, '');
  spS.append(grid(row('Before', bef), row('After', aft), row('Line spacing', ls), row('At', lsAt)));
  const syncAt = () => { const kind = ls.value, wantAt = kind === 'multiple' || kind === 'exactly' || kind === 'atleast'; lsAt.input.disabled = !ok || !wantAt; lsAt.querySelector('.pd-u') && (lsAt.querySelector('.pd-u').textContent = kind === 'multiple' ? '' : 'pt'); if (!wantAt) lsAt.input.value = ''; else if (!lsAt.input.value) lsAt.input.value = kind === 'multiple' ? '1.15' : String(BASE[ptSize] || 12); };
  ls.addEventListener('change', syncAt);
  // the whole document
  const docS = section('Whole document');
  const [dk, da] = spacingFields(docV);
  const dls = select('pd-doc-line', 'Document line spacing', LS_OPTIONS, dk), dlsAt = num('pd-doc-at', 'Document line spacing at', da, '');
  const dSkip = num('pd-doc-skip', 'Space between paragraphs', parskip == null ? '0' : parskip === 'open' ? show(0.5 * (BASE[ptSize] || 12), 'pt') : show(parskip, 'pt'), 'pt');
  const dInd = num('pd-doc-indent', 'First line indent', show(parindent && parindent.pt != null ? parindent.pt : (O.parindent ?? 15), 'cm'), 'cm');
  docS.append(grid(row('Line spacing', dls), row('At', dlsAt), row('Space between paragraphs', dSkip), row('First line indent', dInd)));
  const syncDocAt = () => { const k = dls.value, want = k === 'multiple' || k === 'exactly' || k === 'atleast'; dlsAt.input.disabled = !dialect || !want; if (!want) dlsAt.input.value = ''; else if (!dlsAt.input.value) dlsAt.input.value = k === 'multiple' ? '1.15' : String(BASE[ptSize] || 12); };
  dls.addEventListener('change', syncDocAt);
  p1.append(gen, indS, spS, docS);
  if (!dialect) { dls.disabled = true; dSkip.input.disabled = true; }

  // Line and Page Breaks
  const pag = section('Pagination');
  const cW = check('pd-widow', 'Widow/Orphan control', widow, false, 'The whole document: \\widowpenalty and \\clubpenalty at 10000');
  const cK = check('pd-keep', 'Keep with next', flags.keep, !ok), cL = check('pd-lines', 'Keep lines together', flags.samepage, !ok), cB = check('pd-break', 'Page break before', flags.break, !ok);
  pag.append(cW, cK, cL, cB);
  const fx = section('Formatting exceptions');
  const cN = check('pd-nolineno', 'Suppress line numbers', flags.nolineno, !ok || !app.paraLineno(), app.paraLineno() ? '' : 'The document numbers no lines');
  const cH = check('pd-nohyph', 'Don\'t hyphenate', flags.nohyph, !ok || !app.paraBabel(), app.paraBabel() ? '' : 'Needs babel or polyglossia');
  fx.append(cN, cH);
  p2.append(pag, fx);
  // no paragraph here: its fields wait (the document's still change)
  if (!ok) for (const x of [alignSel, special, ls, dirSel].filter(Boolean)) x.disabled = true;
  if (!ok) for (const w of [left, right, by, bef, aft, lsAt]) w.input.disabled = true;
  if (p && p.float) alignSel.disabled = false;
  syncAt(); syncDocAt();
  const syncBy = () => { by.input.disabled = !ok || special.value === 'none'; };
  special.addEventListener('change', () => { syncBy(); if (special.value === 'hanging' && first.special !== 'hanging') by.input.value = '1'; });
  syncBy();

  // the buttons
  const acts = mk('div', 'pop-row pd-acts');
  const tabs = mk('button', 'btn ghost sm', 'Tabs…');
  tabs.type = 'button'; tabs.disabled = !ok; tabs.title = 'A tab stop at the right margin with a leader, at the caret';
  tabs.addEventListener('click', () => { app.closePop(true); openTabs(app, at); });
  const cancel = mk('button', 'btn ghost sm', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => app.closePop());
  const okB = mk('button', 'btn sm', 'OK');
  okB.type = 'button';
  acts.append(tabs, mk('span', 'grow'), cancel, okB);
  d.append(acts);
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]), select')) { e.preventDefault(); okB.click(); } });

  okB.addEventListener('click', () => {
    const ops = [], docOps = [];
    const near = (a, b, tol = 0.02 * P.PT.cm) => a != null && b != null && Math.abs(a - b) < tol;
    if (ok) {
      const inherit = u0.it.align || null;
      if (alignSel.value !== alignNow && alignSel.value !== 'mixed') ops.push((text, V, u) => P.alignEdits(text, V, alignSel.value, { inherit: u ? u.it.align || null : inherit }));
      const l1 = fieldPt(left.input.value, 'cm'), r1 = fieldPt(right.input.value, 'cm');
      if (l1 != null && r1 != null && (!near(l1, ind.l) || !near(r1, ind.r))) ops.push((text, V) => P.indentEdits(text, V, Math.max(-50 * P.PT.cm, l1), Math.max(-50 * P.PT.cm, r1)));
      const by1 = fieldPt(by.input.value, 'cm');
      if (special.value !== first.special || (special.value === 'hanging' && by1 != null && !near(by1, P.lenPt(first.by)))) {
        const byText = by1 != null ? P.fmtLen(by1, 'cm') : '1cm';
        ops.push((text, V, u) => P.firstLineEdits(text, V, special.value, byText, { indented: !!u.it.indent }));
      }
      // (First line's By is every paragraph's: the document's \parindent)
      if (special.value === 'first' && by1 != null && !near(by1, byPt)) docOps.push((text) => P.docParindentEdits(text, by1));
      const b1 = fieldPt(bef.input.value, 'pt'), a1 = fieldPt(aft.input.value, 'pt');
      if (b1 != null && !near(b1, before, 0.05)) ops.push((text, V) => P.spaceEdits(text, V, 'before', Math.max(0, b1)));
      if (a1 != null && !near(a1, after, 0.05)) ops.push((text, V) => P.spaceEdits(text, V, 'after', Math.max(0, a1)));
      const v = spacingFrom(ls.value, lsAt.input.value, ptSize);
      if (v && dialect && !P.sameSpacing(v, paraV, ptSize)) {
        const KK = { ...K, same: (a, b) => P.sameSpacing(a, b, ptSize) };
        ops.push((text, V) => P.layerEdits(text, V, KK, v, { inherit: docV }));
      }
      const flag = (box, was, f) => { if (!box.c.disabled && box.c.checked !== !!was) ops.push(f(box.c.checked)); };
      flag(cK, flags.keep, (on) => (text, V) => P.flagEdits(text, V, 'keep', on));
      flag(cB, flags.break, (on) => (text, V) => P.flagEdits(text, V, 'break', on));
      flag(cL, flags.samepage, (on) => (text, V) => P.layerEdits(text, V, P.SAMEPAGE, on ? true : null));
      flag(cH, flags.nohyph, (on) => (text, V) => P.layerEdits(text, V, P.NOHYPH, on ? true : null));
      flag(cN, flags.nolineno, (on) => (text, V) => P.layerEdits(text, V, P.NOLINENO, on ? true : null));
      if (dirSel && dirSel.value !== (dirNow || 'ltr')) {
        const lang = dirSel.value === 'rtl' ? dirs.rtl : dirs.ltr;
        if (lang) ops.push((text, V) => { const own = V.levels.find((L) => L.W && P.DIRECTION.names.includes(L.W.name)); return P.layerEdits(text, V, P.DIRECTION, own && dirSel.value === dirs.doc ? null : lang); });
      }
    }
    // (a figure's alignment set as chosen, not toggled; the rest of the dialog with it)
    const floatTo = p && p.float && alignSel.value !== alignNow ? alignSel.value : null;
    // the whole document
    if (cW.c.checked !== widow) docOps.push((text) => P.widowEdits(text, cW.c.checked));
    const dv = spacingFrom(dls.value, dlsAt.input.value, ptSize);
    if (dialect && dv && !P.sameSpacing(dv, docV, ptSize)) docOps.push((text, oth) => {
      const r = P.docSpacingEdits(text, dv, { others: oth, pt: ptSize });
      if (r.why) return r;
      const t1 = applyEdits(text, r.edits);
      return r.needs ? { text: applyEdits(t1, usePackages(t1, [r.needs], { others: oth })) } : { text: t1 };
    });
    const sk = fieldPt(dSkip.input.value, 'pt');
    const skNow = parskip == null ? 0 : parskip === 'open' ? 0.5 * (BASE[ptSize] || 12) : parskip;
    if (dialect && sk != null && !near(sk, skNow, 0.05)) docOps.push((text, oth) => {
      const r = P.docParskipEdits(text, sk > 0.01 ? sk : null, { others: oth });
      if (r.why) return r;
      const t1 = applyEdits(text, r.edits);
      return r.needs ? { text: applyEdits(t1, usePackages(t1, r.needs.parskip ? { parskip: r.needs.parskip } : ['parskip'], { others: oth })) } : { text: t1 };
    });
    const di = fieldPt(dInd.input.value, 'cm');
    if (di != null && !near(di, parindent && parindent.pt != null ? parindent.pt : (O.parindent ?? 15)) && !(special.value === 'first' && by1Same(by, di))) docOps.push((text) => P.docParindentEdits(text, di));
    app.closePop(true);
    if (ops.length || docOps.length || floatTo) app.paraDialogApply(p, ops, docOps, floatTo, c0);
    else if (c0 && !c0.ghost) app.restoreCaret(c0.collapsed ? { f: c0.f, p: c0.a, bias: -1 } : { f: c0.f, p: c0.a, selA: c0.a, selB: c0.b }, true);
  });
  pick(panels[args.tab === 'breaks' ? 1 : 0][0]);
  app.positionPop();
  const focus = { 'indent-left': left.input, 'indent-right': right.input, 'spacing-before': bef.input, 'spacing-after': aft.input, line: ls, document: dls }[args.focus] || (ok ? alignSel : dls);
  if (args.tab === 'breaks') panels[1][0].focus(); else focus.focus();
  return d;
}
const by1Same = (by, di) => { const v = fieldPt(by.input.value, 'cm'); return v != null && Math.abs(v - di) < 0.01; };
function applyEdits(src, edits) {
  for (const x of [...edits].sort((u, v) => v.s - u.s || v.e - u.e)) src = src.slice(0, x.s) + x.t + src.slice(x.e);
  return src;
}

// ---- Tabs: a stop at the right margin with its leader --------------------------------------------------
export function openTabs(app, at) {
  const d = dialog(app, { title: 'Tabs', ...placeOf(app), cls: 'pop-pd pop-tabs' });
  const sec = section('Leader');
  const opts = [['none', 'None (\\hfill)'], ['dots', 'Dots ……… (\\dotfill)'], ['line', 'Line ____ (\\hrulefill)']];
  const radios = opts.map(([v, t], k) => {
    const l = mk('label', 'pd-check');
    const r = mk('input');
    r.type = 'radio'; r.name = 'pd-leader'; r.value = v; r.id = 'pd-leader-' + v; r.checked = k === 1;
    l.append(r, mk('span', '', t));
    sec.append(l);
    return r;
  });
  const note = mk('p', 'pd-note', 'A stop at the right margin: the text after the caret goes to the right edge of the line, the leader filling the gap.');
  const acts = mk('div', 'pop-row pd-acts');
  const cancel = mk('button', 'btn ghost sm', 'Cancel');
  cancel.type = 'button'; cancel.addEventListener('click', () => app.closePop());
  const set = mk('button', 'btn sm', 'Set');
  set.type = 'button';
  set.addEventListener('click', () => { const v = radios.find((r) => r.checked).value; app.closePop(true); app.ribbonBack(); app.runCommand('tab-leader', v); });
  acts.append(mk('span', 'grow'), cancel, set);
  d.append(note, sec, acts);
  app.positionPop();
  radios[1].focus();
  return d;
}
