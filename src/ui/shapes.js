// A drawing's points on the page (Insert › Shapes, a TikZ picture the page draws, src/drawing.js):
// a press on the drawing selects it and puts a handle on each of its points (a corner, an end of a
// line, a circle's radius, an ellipse's two); a handle dragged moves that point, the drawing
// redrawn as it goes, and writes the new coordinate in place of the old one when the press ends
// (one commit, one undo; Escape gives up). A second press on one shape of a selected drawing
// selects that shape alone (Shape Format then changes it alone, Bring Forward orders it); a double
// click or Enter edits its source as before. Mouse and finger alike: on a touch screen each handle
// has a 44 px target.
//
// A chart (pgfplots) or a SmartArt (smartdiagram) pressed is selected the same way, with a frame and
// no handles: their contextual tabs show (src/cmd/objects.js); a double click or Enter opens a
// chart's grid (Edit Data) or a SmartArt's Text Pane. Delete takes the object off.

import { atomOfEl } from '../editor.js';
import { tikzPoints, tikzScale, pointText, drawTikz, readAxis } from '../drawing.js';
import { chartDialog } from './picturedialogs.js';

const el = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
// the object element a press is on: a drawn TikZ picture or chart, or a SmartArt's atom
const drawnEl = (t) => {
  if (!t || !t.closest) return null;
  const d = t.closest('#pages .raw.drawn');
  if (d) return d;
  const sm = t.closest('#pages svg.smart');
  return sm && sm.parentElement && sm.parentElement.dataset.a ? sm.parentElement : null;
};
const isShape = (d) => !!(d && d.querySelector(':scope > svg.tz'));
const isChart = (d) => !!(d && d.querySelector(':scope > svg.pgf'));
const isSmart = (d) => !!(d && d.querySelector(':scope > svg.smart'));
const kindOf = (d) => (isShape(d) ? 'shape' : isChart(d) ? 'chart' : isSmart(d) ? 'smart' : null);
// where an object's text is: a SmartArt's with its \smartdiagramset before it and the line after
function rangeOf(d) {
  const info = atomOfEl(d);
  if (!info || info.a.ro) return null;
  const a = info.a;
  if (a.kind === 'smart') return { f: info.f, s: info.s - (a.s - (a.ss ?? a.s)), e: info.e + ((a.se ?? a.e) - a.e) };
  return a.kind === 'raw' ? { f: info.f, s: info.s, e: info.e } : null;
}

// A chart Rikuy wrote (Insert › Chart), opened again in its grid: OK writes it again in its place,
// one commit; a hand written axis is not Rikuy's chart and keeps its source box
// (quiet: only the chart taken as the one Edit Data writes, no grid opened: an agent's data given)
export function editChart(app, d, quiet) {
  const info = atomOfEl(d);
  if (!info || info.a.ro) return false;
  const t = app.src(info.f).slice(info.s, info.e), A = readAxis(t);
  if (!A) return false;
  const kind = A.kind === 'xbar' ? 'bar' : A.kind === 'ybar' ? 'column' : 'line';
  const series = A.series.map((x, i) => ({ name: x.name || 'Series ' + (i + 1), values: A.cats.map((c) => { const q = x.pts.find((p) => (A.kind === 'xbar' ? p[1] : p[0]) === c); return q ? (A.kind === 'xbar' ? q[0] : q[1]) : ''; }) }));
  app.chartAt = { f: info.f, s: info.s, e: info.e, t };
  if (quiet) return true;
  chartDialog(app, { kind, cats: A.cats, series, done: (k, cats, ser) => app.chartReplace(k, cats, ser) });
  return true;
}

export function installShapeHandles(app) {
  const S = { el: null, info: null, kind: null, k: null, layer: null, drag: null, raf: 0 };
  app.shapeSel = S;
  const subMark = () => { if (!S.el) return; for (const x of S.el.querySelectorAll('[data-k]')) x.classList.toggle('sub', S.k != null && +x.dataset.k === S.k); };
  const clear = () => {
    const had = !!S.el;
    if (S.el) { S.el.classList.remove('sel'); S.k = null; subMark(); }
    S.el = null; S.info = null; S.kind = null; S.k = null;
    if (S.layer) S.layer.hidden = true;
    if (had) app.ribbonSync();
  };
  S.clear = clear;
  app.objElAt = drawnEl;
  const text = () => (S.info ? app.src(S.info.f).slice(S.info.s, S.info.e) : '');
  const svgOf = () => (S.el ? S.el.querySelector(':scope > svg.tz') : null);
  // a point in cm to the screen, and back, through the drawing's viewBox (its y is TeX's, upward)
  const toScreen = (svg, x, y) => { const r = svg.getBoundingClientRect(), v = svg.viewBox.baseVal; return [r.left + (x - v.x) / v.width * r.width, r.top + (-y - v.y) / v.height * r.height]; };
  const toCm = (svg, px, py) => { const r = svg.getBoundingClientRect(), v = svg.viewBox.baseVal; return [v.x + (px - r.left) / r.width * v.width, -(v.y + (py - r.top) / r.height * v.height)]; };
  const place = () => {
    if (!S.el || !S.el.isConnected) { clear(); return; }
    subMark();
    if (S.kind !== 'shape') { if (S.layer) S.layer.hidden = true; return; }
    const svg = svgOf();
    const P = tikzPoints(S.drag ? S.drag.text : text()), sc = tikzScale(S.drag ? S.drag.text : text());
    if (!svg || !P) { clear(); return; }
    if (!S.layer) { S.layer = el('shape-layer'); S.layer.setAttribute('aria-hidden', 'true'); document.body.append(S.layer); }
    S.layer.hidden = false;
    while (S.layer.children.length < P.length) {
      const h = el('pic-h shape-h');
      h.addEventListener('pointerdown', (e) => down(e, +h.dataset.k));
      S.layer.append(h);
    }
    [...S.layer.children].forEach((h, k) => {
      if (k >= P.length) { h.hidden = true; return; }
      h.hidden = false;
      h.dataset.k = String(k);
      h.classList.toggle('radius', P[k].kind !== 'pt');
      // (a shape selected alone: its own points only)
      h.hidden = S.k != null && P[k].k !== S.k;
      const [x, y] = toScreen(svg, P[k].x * sc[0], P[k].y * sc[1]);
      h.style.left = x + 'px'; h.style.top = y + 'px';
    });
  };
  const soon = () => { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(place); };
  S.soon = soon;
  // (a press or a tap opens its first tab, as a picture's does: on a phone a contextual tab is
  // otherwise one entry of a list; one of its own tabs open already stays)
  const TABS = { shape: ['shape-format'], chart: ['chart-design', 'chart-format'], smart: ['smart-design', 'smart-format'] };
  const openTab = () => { const t = TABS[S.kind]; if (t && !t.includes(app.rbTab) && app.selectTab) app.selectTab(t[0]); };
  const select = (d, o = {}) => {
    const r = rangeOf(d), kind = kindOf(d);
    if (!r || !kind) return false;
    if (S.el === d) { if (o.tab) openTab(); return true; }
    clear();
    if (app.disarm) app.disarm();
    if (app.armed) app.armed = null;
    S.el = d; S.info = r; S.kind = kind; S.k = null;
    d.classList.add('sel');
    place();
    app.ribbonSync();
    if (o.tab) openTab();
    return true;
  };
  app.objSelect = (d) => select(d, { tab: true });
  // a chart's grid, a SmartArt's Text Pane, a drawing's source: what a double click or Enter opens
  const open = (d) => {
    const kind = kindOf(d);
    if (kind === 'chart') { if (!editChart(app, d)) { const info = atomOfEl(d); if (info) { clear(); app.openAtom(d, info); } } return; }
    if (kind === 'smart') { select(d); app.smartPane(); return; }
    const info = atomOfEl(d); clear(); if (info) app.openAtom(d, info);
  };
  // a handle pressed: the point follows the pointer, the drawing redrawn from the text as it would be
  function down(e, k) {
    if (e.button !== 0 || !S.info) return;
    e.preventDefault(); e.stopPropagation();
    const t0 = text(), P = tikzPoints(t0);
    if (!P || !P[k]) return;
    // (the drawing's place and scale as the press began: the point follows the pointer in them, and
    // the drawing redrawn meanwhile keeps that box, its new parts beyond it showing)
    const svg0 = svgOf();
    if (!svg0) return;
    const R0 = svg0.getBoundingClientRect(), V0 = svg0.viewBox.baseVal;
    const box0 = { left: R0.left, top: R0.top, width: R0.width, height: R0.height, vb: [V0.x, V0.y, V0.width, V0.height], w: svg0.style.width, h: svg0.style.height };
    S.drag = { k, t0, text: t0, P: P[k], box0, sc: tikzScale(t0) };
    e.target.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('pic-drag');
    const move = (ev) => {
      const svg = svgOf();
      if (!svg || !S.drag) return;
      const D = S.drag, B = D.box0;
      const x = (B.vb[0] + (ev.clientX - B.left) / B.width * B.vb[2]) / D.sc[0], y = -(B.vb[1] + (ev.clientY - B.top) / B.height * B.vb[3]) / D.sc[1];
      const put = pointText(D.P, x, y);
      D.text = D.t0.slice(0, D.P.s) + put + D.t0.slice(D.P.e);
      D.put = put;
      const nsvg = drawTikz(D.text);
      if (nsvg) { nsvg.setAttribute('viewBox', B.vb.join(' ')); nsvg.style.width = B.w; nsvg.style.height = B.h; nsvg.style.overflow = 'visible'; svg.replaceWith(nsvg); }
      place();
    };
    const up = (ev) => {
      document.documentElement.classList.remove('pic-drag');
      e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); e.target.removeEventListener('pointercancel', up);
      document.removeEventListener('keydown', esc, true);
      const D = S.drag;
      S.drag = null;
      const back = () => { const svg = svgOf(), o = drawTikz(D.t0); if (svg && o) svg.replaceWith(o); place(); };
      if (!D || D.cancel || ev.type === 'pointercancel' || D.put == null || D.put === D.t0.slice(D.P.s, D.P.e)) { if (D) back(); return; }
      const I = S.info;
      if (app.src(I.f).slice(I.s, I.e) !== D.t0) { back(); return; }
      app.closeGroup();
      app.commit([{ f: I.f, s: I.s + D.P.s, e: I.s + D.P.e, t: D.put }], { f: I.f, p: I.s, bias: 1 }, 'shape');
      app.closeGroup();
      // (selected again where it is after the page is drawn from the new text)
      const want = { f: I.f, s: I.s };
      requestAnimationFrame(() => { const d = [...document.querySelectorAll('#pages .raw.drawn')].find((x) => { const a = atomOfEl(x); return a && a.f === want.f && a.s === want.s; }); if (d) { const k = S.k; S.el = null; select(d); S.k = k; place(); } });
    };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); S.drag.cancel = true; up(ev); } };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
    e.target.addEventListener('pointercancel', up);
    document.addEventListener('keydown', esc, true);
  }
  // a press on an object selects it; on a selected drawing, a press on one of its shapes selects that
  // shape alone; a double click opens it (the source, the chart's grid, the Text Pane). A press on
  // the page elsewhere lets it go; the ribbon, its menus and dialogs keep it.
  document.addEventListener('mousedown', (e) => {
    const d = drawnEl(e.target);
    if (!d) {
      if (S.el && !(e.target.closest && e.target.closest('.shape-layer')) && (app.root.contains(e.target) || (app.desk && app.desk.contains(e.target)))) clear();
      return;
    }
    if (!kindOf(d) || e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    if (app.pop) app.closePop();
    if (S.el === d && e.detail >= 2) { open(d); return; }
    if (S.el !== d) { select(d, { tab: true }); return; }
    // (the drawing selected already: one of its shapes, or the whole again)
    if (S.kind === 'shape') {
      const t = e.target.closest && e.target.closest('[data-k]');
      const k = t ? +t.dataset.k : null;
      S.k = S.k === k ? null : k;
      place(); app.ribbonSync();
    }
  }, true);
  document.addEventListener('click', (e) => { const d = drawnEl(e.target); if (d && kindOf(d)) { e.preventDefault(); if (S.el !== d) select(d, { tab: true }); } }, true);
  document.addEventListener('keydown', (e) => {
    if (!S.el) return;
    // (keys typed in the ribbon's fields, a menu or a dialog are theirs)
    const a = document.activeElement;
    if (a && a !== document.body && !(app.root.contains(a)) && a.closest && a.closest('input, textarea, select, [role=menu], [role=dialog], .pop')) return;
    if (e.key === 'Escape') { if (S.k != null) { S.k = null; place(); app.ribbonSync(); } else clear(); return; }
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); open(S.el); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); app.objDelete(); }
  }, true);
  window.addEventListener('resize', soon);
  if (app.desk) app.desk.addEventListener('scroll', soon, { passive: true });
  // (a page drawn again: the selected drawing is a new element, or gone)
  const sync = app.layoutPass;
  app.layoutPass = function (...a) {
    const r = sync.apply(this, a);
    if (S.info && !S.drag) {
      // (found again by where it starts: an edit of Shape Format or Chart Design starts inside it)
      const cand = [...document.querySelectorAll('#pages .raw.drawn, #pages [data-a] > svg.smart')].map((x) => (x.tagName.toLowerCase() === 'svg' ? x.parentElement : x));
      const d = cand.find((x) => { const r = rangeOf(x); return r && r.f === S.info.f && r.s === S.info.s; });
      if (d && kindOf(d) === S.kind) { if (S.el !== d) { if (S.el) S.el.classList.remove('sel'); S.el = d; d.classList.add('sel'); } S.info = rangeOf(d); soon(); } else clear();
    }
    return r;
  };
  return S;
}
