// View › Ruler: Word's rulers beside the page. The horizontal one shows the page's margins (grey)
// where TeX sets them, and the paragraph the caret is in: its left and right indents
// (adjustwidth), its first line (LaTeX's \parindent, \noindent, a hanging \hangindent) and the stop
// its leader runs to (\dotfill, \hrulefill, \hfill: in LaTeX always the right margin, shown, not
// moved). A marker or a margin is dragged, or moved with the arrow keys, and written through B2's
// paragraph edits (src/parasrc.js, App.paraDialogApply) and B6's margins (src/pagesrc.js,
// App.pageEdit), one step of history each. The vertical ruler shows the top and bottom margins,
// dragged the same way. Hidden on a phone and a touch screen, in Web Layout, in Focus and in the
// LaTeX and PDF views. Nothing of the document reaches the rulers but numbers.

import * as P from '../parasrc.js';
import * as PS from '../pagesrc.js';
import { command, enabled } from '../commands.js';
import { mk } from './dom.js';

const CM = P.PT.cm;
const SNAP = 0.25 * CM;
const H = 20;
const fmt = (pt) => (Math.round(pt / CM * 100) / 100).toLocaleString('en-US') + ' cm';
const NAMES = { first: 'First Line Indent', hang: 'Hanging Indent', left: 'Left Indent', right: 'Right Indent', ml: 'Left margin', mr: 'Right margin', mt: 'Top margin', mb: 'Bottom margin' };

// whether the rulers show: the preference, a page view of pages, a window wide enough for a mouse
export function rulerShown(app) {
  if (!app.prefs || !app.prefs.ruler) return false;
  const B = document.body.classList;
  if ((app.view || 'page') !== 'page' || B.contains('pg-web') || B.contains('focus')) return false;
  return !rulerNarrow();
}
export const rulerNarrow = () => window.innerWidth < 640 || !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

export function rulerInstall(app) {
  const desk = document.getElementById('desk'), sheet = document.getElementById('sheet');
  if (!desk || !sheet || app.ru) return;
  const hr = mk('div', 'ruler');
  hr.id = 'ruler'; hr.hidden = true;
  hr.setAttribute('role', 'group'); hr.setAttribute('aria-label', 'Ruler');
  const track = mk('div', 'ru-track');
  const ticks = mk('div', 'ru-ticks');
  ticks.setAttribute('aria-hidden', 'true');
  const ml = mk('div', 'ru-g ru-gl'), mr = mk('div', 'ru-g ru-gr'), cols = mk('div', 'ru-cols');
  track.append(ml, mr, cols, ticks);
  const M = {};
  for (const k of ['first', 'hang', 'left', 'right', 'ml', 'mr']) {
    const e = mk('div', 'ru-mk ru-' + k);
    e.setAttribute('role', 'slider'); e.setAttribute('aria-label', NAMES[k]); e.setAttribute('aria-orientation', 'horizontal');
    e.tabIndex = 0; e.dataset.k = k;
    track.append(e); M[k] = e;
  }
  const tab = mk('div', 'ru-tab');
  tab.setAttribute('aria-hidden', 'true');
  track.append(tab);
  hr.append(track);
  desk.insertBefore(hr, sheet);
  const vr = mk('div', 'ruler vruler');
  vr.id = 'vruler'; vr.hidden = true;
  vr.setAttribute('role', 'group'); vr.setAttribute('aria-label', 'Vertical ruler');
  const vticks = mk('div', 'ru-ticks'), mt = mk('div', 'ru-g ru-gt'), mb = mk('div', 'ru-g ru-gb');
  vticks.setAttribute('aria-hidden', 'true');
  vr.append(mt, mb, vticks);
  for (const k of ['mt', 'mb']) {
    const e = mk('div', 'ru-mk ru-' + k);
    e.setAttribute('role', 'slider'); e.setAttribute('aria-label', NAMES[k]); e.setAttribute('aria-orientation', 'vertical');
    e.tabIndex = 0; e.dataset.k = k;
    vr.append(e); M[k] = e;
  }
  sheet.append(vr);
  const guide = mk('div', 'ru-guide'), tip = mk('div', 'ru-tip');
  guide.hidden = tip.hidden = true;
  tip.setAttribute('role', 'status');
  document.body.append(guide, tip);
  app.ru = { hr, vr, track, ticks, vticks, ml, mr, mt, mb, cols, tab, M, guide, tip, S: null, sig: '', vsig: '' };

  // (a press on the ruler keeps the page's caret and focus: the markers act on its paragraph)
  for (const el of [hr, vr]) {
    el.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('.ru-mk');
      e.preventDefault();
      if (!m || m.classList.contains('off') || e.button !== 0) return;
      drag(app, m.dataset.k, e);
    });
    // a double press on a marker opens what sets it by number, as Word's ruler does: the
    // Paragraph dialog for an indent, Page setup for a margin (a press of one pointer for every
    // drag, UI-PRINCIPLES.md T5, WCAG 2.5.7)
    // (anywhere on a margin's grey part too, as Word's: more than 3 px out of the text's column is
    // the margin, whatever marker the press falls on; the vertical ruler is all margins)
    el.addEventListener('dblclick', (e) => {
      const m = e.target.closest('.ru-mk'), R = app.ru, S = R.S;
      if (m && m.classList.contains('off')) return;
      let cmd = null;
      if (el === R.vr) cmd = 'page-setup';
      else if (S) {
        const x = e.clientX - R.track.getBoundingClientRect().left, l = S.ml * S.px, r = (S.pw - S.mr) * S.px;
        if (x < l - 3 || x > r + 3) cmd = 'page-setup';
        else if (m) cmd = /^m[lrtb]$/.test(m.dataset.k) ? 'page-setup' : 'paragraph-settings';
      }
      if (!cmd) return;
      e.preventDefault();
      app.runCommand(cmd);
    });
    el.addEventListener('keydown', (e) => {
      const m = e.target.closest('.ru-mk');
      if (!m || m.classList.contains('off')) return;
      const k = m.dataset.k, vert = k === 'mt' || k === 'mb';
      const step = e.shiftKey ? 0.05 * CM : SNAP;
      let d = 0;
      if (e.key === (vert ? 'ArrowUp' : 'ArrowLeft')) d = -step;
      else if (e.key === (vert ? 'ArrowDown' : 'ArrowRight')) d = step;
      if (!d) return;
      e.preventDefault();
      const S = app.ru.S;
      if (!S) return;
      // (the first line and the other lines' markers go from one of LaTeX's states to the next a
      // press: a hanging indent, none, \parindent; a step is too small to leave \parindent)
      const q = S.para;
      let v = pos(S, k) + d;
      if (q && k === 'first') {
        if (q.special === 'first') v = d < 0 ? q.lines2 : null;
        else if (q.special === 'none' && d > 0) v = q.lines2 + q.parindent;
      } else if (q && k === 'hang' && q.special === 'first') v = d > 0 ? q.first : null;
      if (v == null) { app.toast(k === 'first' ? 'The first line is at LaTeX\'s \\parindent already: Paragraph › Indentation › By sets that for the document.' : 'With LaTeX\'s \\parindent the other lines are the left indent: move Left Indent.'); return; }
      apply(app, k, v);
      // (the slider keeps the focus for the next press: the edit gave it to the page)
      const back = () => { const m = app.ru.M[k]; if (m && !m.classList.contains('off')) m.focus({ preventScroll: true }); };
      back(); requestAnimationFrame(back);
    });
  }
}

// What the rulers show, as numbers: the page shown, its geometry in points, the scale, the column
// the caret is in, the margins, and the caret's paragraph (null where it takes no indents, with why)
function state(app) {
  const L = app.layout, g = L && L.g;
  if (!g || !L.pages.length) return null;
  const k = Math.max(1, Math.min(L.pages.length, app.currentPage ? app.currentPage() : 1)) - 1;
  const page = L.pages[k].el, px = L.px;
  const even = page.classList.contains('even');
  const ml = even ? (g.mlE ?? g.ml) : g.ml;
  const S = { page, px, g, even, pw: g.pw, ph: g.ph, ml, mr: g.pw - ml - g.tw, mt: g.mt, mb: g.ph - g.mt - g.th, colL: ml, colW: g.tw, para: null, why: '' };
  // (R1's landscape page, pdflscape's, as layout.js turn() draws it: the sheet on its side, its
  // left margin the portrait page's bottom one and its top the left one; the text as wide as the
  // portrait page's is tall. Its margins are the portrait page's, turned, so they are set there)
  if (page.classList.contains('land')) {
    Object.assign(S, { land: true, pw: g.ph, ph: g.pw, ml: g.ph - g.mt - g.th, mr: g.mt, mt: ml, mb: g.pw - ml - g.tw, colW: g.th });
    S.colL = S.ml;
  }
  // (the column the caret is in, in a document of two columns)
  const at = app.ribbonAt ? app.ribbonAt() : null;
  if (!S.land && g.cols > 1 && at && at.el) {
    const r = at.el.getBoundingClientRect(), R = page.getBoundingClientRect(), sep = g.colsep ?? 10, w = (g.tw - (g.cols - 1) * sep) / g.cols;
    const c = Math.max(0, Math.min(g.cols - 1, Math.floor(((r.left - R.left) / px - ml) / (w + sep))));
    S.colL = ml + c * (w + sep); S.colW = w;
  }
  S.cols = !S.land && g.cols > 1 ? { n: g.cols, sep: g.colsep ?? 10 } : null;
  const mc = command('margins');
  S.marginsOK = !S.land && !!(mc && enabled(app, mc, at));
  S.marginsWhy = S.marginsOK ? '' : S.land ? 'A landscape page has the portrait pages\' margins, turned: set them from a portrait page or Layout › Margins.' : (mc && mc.whyNot ? mc.whyNot(app, at) : 'The margins cannot be set here.');
  if (!at || !app.paraUnits) { S.why = 'Click in a paragraph of the page.'; return S; }
  const p = app.paraUnits(at);
  if (!p || p.why || p.float || !p.units.length) { S.why = (p && p.why) || 'Click in a paragraph of the page.'; return S; }
  const u = p.units[0], U = u.U, ind = P.indentOf(p.src, U), fl = P.firstLineOf(U, !!u.it.indent);
  if (ind.l == null || ind.r == null) { S.why = 'This paragraph\'s indent is written as a length Rikuy does not reckon with: change it in the source.'; return S; }
  const parindent = app.model.opts.parindent ?? 15;
  const X = fl.special === 'hanging' ? (P.lenPt(fl.by) || 0) : 0;
  const first = ind.l + (fl.special === 'first' ? parindent : 0), lines2 = ind.l + X;
  // (the leader a paragraph's text runs to the right margin with)
  const B = at.B, text = B && B.e - B.s < 40000 ? app.src(B.f).slice(B.s, B.e) : '';
  const lead = /\\(dotfill|hrulefill|hfill)(?![A-Za-z@])/.exec(text);
  S.para = { p, l: ind.l, r: ind.r, special: fl.special, X, first, lines2, parindent, at, caret: at.c, leader: lead ? lead[1] : null };
  return S;
}

// a marker's place in points: from the column's left for the paragraph's, from the page's edge for
// a margin's (the right and bottom ones measured from their own edge, as the page sets them)
function pos(S, k) {
  const q = S.para;
  if (k === 'first') return q ? q.first : 0;
  if (k === 'hang' || k === 'left') return q ? q.lines2 : 0;
  if (k === 'right') return q ? S.colW - q.r : S.colW;
  if (k === 'ml') return S.ml;
  if (k === 'mr') return S.pw - S.mr;
  if (k === 'mt') return S.mt;
  return S.ph - S.mb;
}

export function rulerSync(app) {
  const R = app.ru;
  if (!R) return;
  const on = rulerShown(app);
  document.body.classList.toggle('ruler-on', on);
  R.hr.hidden = !on;
  if (!on) { R.vr.hidden = true; R.S = null; return; }
  const S = state(app);
  R.S = S;
  if (!S) { R.track.hidden = true; R.vr.hidden = true; return; }
  R.track.hidden = false;
  const px = S.px, pr = S.page.getBoundingClientRect(), hr = R.hr.getBoundingClientRect();
  R.track.style.left = (pr.left - hr.left) + 'px';
  R.track.style.width = (S.pw * px) + 'px';
  R.ml.style.width = (S.ml * px) + 'px';
  R.mr.style.width = (S.mr * px) + 'px';
  // (the gaps between columns, grey as Word draws them)
  const csig = S.cols ? S.cols.n + ':' + S.cols.sep + ':' + S.ml + ':' + px : '';
  if (R.csig !== csig) {
    R.csig = csig;
    R.cols.replaceChildren();
    if (S.cols) { const w = (S.g.tw - (S.cols.n - 1) * S.cols.sep) / S.cols.n; for (let c = 1; c < S.cols.n; c++) { const d = mk('div', 'ru-gap'); d.style.left = ((S.ml + c * w + (c - 1) * S.cols.sep) * px) + 'px'; d.style.width = (S.cols.sep * px) + 'px'; R.cols.append(d); } }
  }
  const sig = S.pw + ':' + S.colL + ':' + px;
  if (R.sig !== sig) { R.sig = sig; R.ticks.replaceChildren(tickSvg(S.pw, S.colL, px, false)); }
  const place = (k, x, title, off) => {
    const e = R.M[k];
    e.style.left = (x * px) + 'px';
    e.classList.toggle('off', !!off);
    e.setAttribute('aria-disabled', off ? 'true' : 'false');
    const v = k === 'right' ? (S.para ? S.para.r : 0) : k === 'mr' ? S.mr : k === 'ml' ? S.ml : x - S.colL;
    e.setAttribute('aria-valuenow', String(Math.round(v / CM * 100) / 100));
    e.setAttribute('aria-valuetext', fmt(v));
    e.title = NAMES[k] + ': ' + fmt(v) + (off && title ? '. ' + title : title ? ' ' + title : '') + (off ? '' : '. Drag, or double click for ' + (k === 'ml' || k === 'mr' ? 'Page setup' : 'the Paragraph dialog'));
  };
  const q = S.para, off = !q;
  place('first', S.colL + pos(S, 'first'), q ? (q.special === 'first' ? '(LaTeX\'s \\parindent; drag to the left indent for \\noindent, past it for a hanging indent)' : '') : S.why, off);
  place('hang', S.colL + pos(S, 'hang'), q ? '' : S.why, off);
  place('left', S.colL + pos(S, 'left'), q ? '' : S.why, off);
  place('right', S.colL + pos(S, 'right'), q ? '' : S.why, off);
  place('ml', S.ml, S.marginsWhy, !S.marginsOK);
  place('mr', S.pw - S.mr, S.marginsWhy, !S.marginsOK);
  R.tab.hidden = !(q && q.leader);
  if (q && q.leader) { R.tab.style.left = ((S.colL + S.colW - q.r) * px) + 'px'; R.tab.title = 'A right tab with a leader (\\' + q.leader + '): LaTeX\'s fill runs to the right indent; Paragraph › Tabs changes it'; }
  // the vertical ruler, left of the page where there is room
  const sr = document.getElementById('sheet').getBoundingClientRect(), vleft = pr.left - sr.left - H - 6;
  R.vr.hidden = vleft < 0;
  if (!R.vr.hidden) {
    R.vr.style.left = vleft + 'px';
    R.vr.style.top = (pr.top - sr.top) + 'px';
    R.vr.style.height = (S.ph * px) + 'px';
    R.mt.style.height = (S.mt * px) + 'px';
    R.mb.style.height = (S.mb * px) + 'px';
    const vsig = S.ph + ':' + S.mt + ':' + px;
    if (R.vsig !== vsig) { R.vsig = vsig; R.vticks.replaceChildren(tickSvg(S.ph, S.mt, px, true)); }
    for (const k of ['mt', 'mb']) {
      const e = R.M[k], y = pos(S, k), v = k === 'mt' ? S.mt : S.mb;
      e.style.top = (y * px) + 'px';
      e.classList.toggle('off', !S.marginsOK);
      e.setAttribute('aria-disabled', S.marginsOK ? 'false' : 'true');
      e.setAttribute('aria-valuenow', String(Math.round(v / CM * 100) / 100));
      e.setAttribute('aria-valuetext', fmt(v));
      e.title = NAMES[k] + ': ' + fmt(v) + (S.marginsOK ? '. Drag, or double click for Page setup' : '. ' + S.marginsWhy);
    }
  }
}

// The ticks: every quarter centimetre, a longer one at the half, the centimetres numbered from the
// text's edge outwards, as Word numbers them (an SVG of lines and text, made from numbers alone)
function tickSvg(len, zero, px, vert) {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  const w = len * px;
  svg.setAttribute('width', String(vert ? H : w)); svg.setAttribute('height', String(vert ? w : H));
  const q = CM / 4;
  const k0 = Math.ceil(-zero / q), k1 = Math.floor((len - zero) / q);
  let d = '';
  const labels = [];
  for (let k = k0; k <= k1; k++) {
    const x = (zero + k * q) * px;
    if (k % 4 === 0) { if (k) labels.push([x, Math.abs(k / 4)]); continue; }
    const h = k % 2 === 0 ? 6 : 3, a = (H - h) / 2;
    d += vert ? 'M' + a + ' ' + x.toFixed(1) + 'h' + h : 'M' + x.toFixed(1) + ' ' + a + 'v' + h;
  }
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  for (const [x, n] of labels) {
    const t = document.createElementNS(NS, 'text');
    if (vert) { t.setAttribute('x', String(H / 2)); t.setAttribute('y', x.toFixed(1)); } else { t.setAttribute('x', x.toFixed(1)); t.setAttribute('y', String(H / 2)); }
    t.textContent = String(n);
    svg.append(t);
  }
  return svg;
}

// A marker dragged: the guide over the page and the value in a tip as it moves, snapped to a
// quarter centimetre (Alt: free); written once, where it is let go; Escape puts it back
function drag(app, k, e0) {
  const R = app.ru, S = R.S;
  if (!S) return;
  const vert = k === 'mt' || k === 'mb', el = R.M[k];
  const base = vert ? R.vr.getBoundingClientRect().top : R.track.getBoundingClientRect().left;
  const zero = k === 'ml' || k === 'mr' || vert ? 0 : S.colL;
  const start = pos(S, k), p0 = vert ? e0.clientY : e0.clientX;
  // (a value as the ruler shows it: the right indent and the right and bottom margins from their
  // own edge; snapped as shown)
  const flip = k === 'right' ? S.colW : k === 'mr' ? S.pw : k === 'mb' ? S.ph : null;
  let v = start;
  try { el.setPointerCapture(e0.pointerId); } catch (e) { /* the pointer is gone */ }
  const desk = document.getElementById('desk').getBoundingClientRect();
  const show = () => {
    const at = base + (zero + v) * S.px;
    R.guide.hidden = false; R.tip.hidden = false;
    R.guide.classList.toggle('v', vert);
    if (vert) { R.guide.style.left = desk.left + 'px'; R.guide.style.width = desk.width + 'px'; R.guide.style.top = at + 'px'; R.guide.style.height = '0px'; }
    else { R.guide.style.top = desk.top + 'px'; R.guide.style.height = desk.height + 'px'; R.guide.style.left = at + 'px'; R.guide.style.width = '0px'; }
    const val = k === 'right' ? S.colW - v : k === 'mr' ? S.pw - v : k === 'mb' ? S.ph - v : k === 'ml' || k === 'mt' ? v : v;
    R.tip.textContent = NAMES[k] + ': ' + fmt(val);
    R.tip.style.left = (vert ? desk.left + 8 : at + 8) + 'px';
    R.tip.style.top = (vert ? at + 6 : R.hr.getBoundingClientRect().bottom + 4) + 'px';
    if (vert) el.style.top = (v * S.px) + 'px'; else el.style.left = ((zero + v) * S.px) + 'px';
  };
  const move = (e) => {
    const raw = start + ((vert ? e.clientY : e.clientX) - p0) / S.px, shown = flip != null ? flip - raw : raw, q = e.altKey ? 0.01 * CM : SNAP;
    const snapped = Math.round(shown / q) * q;
    v = flip != null ? flip - snapped : snapped;
    show();
  };
  let done = false;
  const end = (ok) => {
    if (done) return;
    done = true;
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', esc, true);
    R.guide.hidden = true; R.tip.hidden = true;
    if (ok && Math.abs(v - start) > 0.01) apply(app, k, v); else rulerSync(app);
  };
  const up = () => end(true), cancel = () => end(false);
  const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel); addEventListener('keydown', esc, true);
  show();
}

// A marker's new place v (points, as pos gives it) written: the paragraph's indents and first line
// through B2's edits, the margins through B6's
export function apply(app, k, v) {
  const S = app.ru && app.ru.S;
  if (!S) return false;
  if (k === 'ml' || k === 'mr' || k === 'mt' || k === 'mb') return applyMargin(app, S, k, v);
  const q = S.para;
  if (!q) { app.toast(S.why); return false; }
  const near = (a, b) => Math.abs(a - b) < 0.05;
  let l = q.l, r = q.r, special = q.special, X = q.X;
  if (k === 'right') r = Math.max(-S.mr, S.colW - v);
  else if (k === 'left') l = v - (special === 'hanging' ? X : 0);
  else if (k === 'hang') {
    // the other lines move, the first stays where it is
    const F = q.first;
    if (v > F + 0.5) { special = 'hanging'; X = v - F; l = F; } else if (v >= F - 0.5) { special = 'none'; l = F; }
    else if (Math.abs(F - v - q.parindent) < 0.6) { special = 'first'; l = v; }
    else {
      // (the first line further right of the others than \parindent: LaTeX has no such indent of
      // one paragraph; the first line stays where it is, so nothing is written)
      app.toast('LaTeX indents a first line by \\parindent alone: move Left Indent, or set the first line in Paragraph › Indentation.');
      rulerSync(app);
      return false;
    }
  } else if (k === 'first') {
    // the first line moves, the others stay: left of them a hanging indent, at them \noindent,
    // right of them LaTeX's own \parindent
    const Q = q.lines2;
    if (v < Q - 0.5) { special = 'hanging'; l = v; X = Q - v; } else if (v < Q + q.parindent / 2) { special = 'none'; l = Q; } else { special = 'first'; l = Q; }
  }
  l = Math.max(-S.ml, Math.min(S.colW - r - CM, l));
  const ops = [];
  if (!near(l, q.l) || !near(r, q.r)) ops.push((text, V) => P.indentEdits(text, V, l, r));
  if (special !== q.special || (special === 'hanging' && !near(X, q.X))) {
    const by = P.fmtLen(Math.max(0.01 * CM, X), 'cm');
    ops.push((text, V, u) => P.firstLineEdits(text, V, special, by, { indented: !!(u && u.it.indent) }));
  }
  if (!ops.length) { rulerSync(app); return false; }
  const done = app.paraDialogApply(q.p, ops, [], null, q.caret);
  rulerSync(app);
  return done;
}

function applyMargin(app, S, k, v) {
  if (!S.marginsOK) { app.toast(S.marginsWhy); return false; }
  const m = app.pageMargins();
  if (!m) return false;
  const geo = (app.model.opts && app.model.opts.geo) || {};
  // (geometry's own twoside key is written back as it is; but any two sided document, a book or
  // twoside among the class's options too, has the outer margin on the left of an even page)
  const mirrored = !!(m.two && geo.twoside === true);
  const want = { t: m.t, b: m.b, l: m.l + (m.gutter || 0), r: m.r };
  const left = S.even && m.two ? 'r' : 'l', right = S.even && m.two ? 'l' : 'r';
  const min = 0.2 * CM;
  if (k === 'ml') want[left] = Math.max(min, Math.min(S.pw - S.mr - 2 * CM, v));
  if (k === 'mr') want[right] = Math.max(min, Math.min(S.pw - S.ml - 2 * CM, S.pw - v));
  if (k === 'mt') want.t = Math.max(min, Math.min(S.ph - S.mb - 2 * CM, v));
  if (k === 'mb') want.b = Math.max(min, Math.min(S.ph - S.mt - 2 * CM, S.ph - v));
  const round = (x) => Math.round(x / (0.01 * CM)) * 0.01 * CM;
  const edits = PS.marginEdits(app.src(app.main), { t: round(want.t), b: round(want.b), l: round(want.l - (m.gutter || 0)), r: round(want.r), gutter: m.gutter || 0, mirrored }, { others: app.preambleOthers(), own: app.pageOwn() });
  const done = app.pageEdit(edits, 'page-margins');
  rulerSync(app);
  return done;
}
