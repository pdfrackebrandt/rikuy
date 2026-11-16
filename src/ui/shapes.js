// A drawing's points on the page (Insert › Shapes, a TikZ picture the page draws, src/drawing.js):
// a press on the drawing selects it and puts a handle on each of its points (a corner, an end of a
// line, a circle's radius, an ellipse's two); a handle dragged moves that point, the drawing
// redrawn as it goes, and writes the new coordinate in place of the old one when the press ends
// (one commit, one undo; Escape gives up). A second press, a double click or Enter edits its source
// as before. Mouse and finger alike: on a touch screen each handle has a 44 px target.

import { atomOfEl } from '../editor.js';
import { tikzPoints, pointText, drawTikz, readAxis, chartTex } from '../drawing.js';
import { chartDialog } from './picturedialogs.js';

const el = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
const drawnEl = (t) => (t && t.closest ? t.closest('#pages .raw.drawn') : null);
const isShape = (d) => !!(d && d.querySelector(':scope > svg.tz'));
const isChart = (d) => !!(d && d.querySelector(':scope > svg.pgf'));

// A chart Rikuy wrote (Insert › Chart), opened again in its grid: OK writes it again in its place,
// one commit; a hand written axis is not Rikuy's chart and keeps its source box
export function editChart(app, d) {
  const info = atomOfEl(d);
  if (!info || info.a.ro) return false;
  const t = app.src(info.f).slice(info.s, info.e), A = readAxis(t);
  if (!A) return false;
  const kind = A.kind === 'xbar' ? 'bar' : A.kind === 'ybar' ? 'column' : 'line';
  const series = A.series.map((x, i) => ({ name: x.name || 'Series ' + (i + 1), values: A.cats.map((c) => { const q = x.pts.find((p) => (A.kind === 'xbar' ? p[1] : p[0]) === c); return q ? (A.kind === 'xbar' ? q[0] : q[1]) : ''; }) }));
  app.chartAt = { f: info.f, s: info.s, e: info.e, t };
  chartDialog(app, { kind, cats: A.cats, series, done: (k, cats, ser) => app.chartReplace(k, cats, ser) });
  return true;
}

export function installShapeHandles(app) {
  const S = { el: null, info: null, layer: null, drag: null, raf: 0 };
  app.shapeSel = S;
  const clear = () => {
    if (S.el) S.el.classList.remove('sel');
    S.el = null; S.info = null;
    if (S.layer) S.layer.hidden = true;
  };
  const text = () => (S.info ? app.src(S.info.f).slice(S.info.s, S.info.e) : '');
  const svgOf = () => (S.el ? S.el.querySelector(':scope > svg.tz') : null);
  // a point in cm to the screen, and back, through the drawing's viewBox (its y is TeX's, upward)
  const toScreen = (svg, x, y) => { const r = svg.getBoundingClientRect(), v = svg.viewBox.baseVal; return [r.left + (x - v.x) / v.width * r.width, r.top + (-y - v.y) / v.height * r.height]; };
  const toCm = (svg, px, py) => { const r = svg.getBoundingClientRect(), v = svg.viewBox.baseVal; return [v.x + (px - r.left) / r.width * v.width, -(v.y + (py - r.top) / r.height * v.height)]; };
  const place = () => {
    if (!S.el || !S.el.isConnected) { clear(); return; }
    const svg = svgOf();
    const P = tikzPoints(S.drag ? S.drag.text : text());
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
      const [x, y] = toScreen(svg, P[k].x, P[k].y);
      h.style.left = x + 'px'; h.style.top = y + 'px';
    });
  };
  const soon = () => { cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(place); };
  S.soon = soon;
  const select = (d) => {
    const info = atomOfEl(d);
    if (!info || info.a.kind !== 'raw' || info.a.ro) return false;
    clear();
    if (app.disarm) app.disarm();
    S.el = d; S.info = { f: info.f, s: info.s, e: info.e };
    d.classList.add('sel');
    place();
    return true;
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
    S.drag = { k, t0, text: t0, P: P[k], box0 };
    e.target.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('pic-drag');
    const move = (ev) => {
      const svg = svgOf();
      if (!svg || !S.drag) return;
      const D = S.drag, B = D.box0;
      const x = B.vb[0] + (ev.clientX - B.left) / B.width * B.vb[2], y = -(B.vb[1] + (ev.clientY - B.top) / B.height * B.vb[3]);
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
      requestAnimationFrame(() => { const d = [...document.querySelectorAll('#pages .raw.drawn')].find((x) => { const a = atomOfEl(x); return a && a.f === want.f && a.s === want.s; }); if (d) select(d); });
    };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); S.drag.cancel = true; up(ev); } };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
    e.target.addEventListener('pointercancel', up);
    document.addEventListener('keydown', esc, true);
  }
  // a press on a drawing selects it; on the selected one, a second press edits its source
  document.addEventListener('mousedown', (e) => {
    const d = drawnEl(e.target);
    if (!d) { if (S.el && !(e.target.closest && e.target.closest('.shape-layer'))) clear(); return; }
    if (isChart(d) && e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation(); clear();
      if (app.pop) app.closePop();
      if (!editChart(app, d)) { const info = atomOfEl(d); if (info) app.openAtom(d, info); }
      return;
    }
    if (!isShape(d) || e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    if (app.pop) app.closePop();
    if (S.el === d && e.detail >= 2) { const info = atomOfEl(d); clear(); if (info) app.openAtom(d, info); return; }
    if (S.el !== d) select(d);
  }, true);
  document.addEventListener('click', (e) => { const d = drawnEl(e.target); if (d && isShape(d)) { e.preventDefault(); if (S.el !== d) select(d); } else if (d && isChart(d)) e.preventDefault(); }, true);
  document.addEventListener('keydown', (e) => {
    if (!S.el) return;
    if (e.key === 'Escape') { clear(); return; }
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const d = S.el, info = atomOfEl(d); clear(); if (info) app.openAtom(d, info); }
  }, true);
  window.addEventListener('resize', soon);
  if (app.desk) app.desk.addEventListener('scroll', soon, { passive: true });
  // (a page drawn again: the selected drawing is a new element, or gone)
  const sync = app.layoutPass;
  app.layoutPass = function (...a) {
    const r = sync.apply(this, a);
    if (S.info && !S.drag) {
      const d = [...document.querySelectorAll('#pages .raw.drawn')].find((x) => { const i = atomOfEl(x); return i && i.f === S.info.f && i.s === S.info.s; });
      if (d && isShape(d)) { if (S.el !== d) { if (S.el) S.el.classList.remove('sel'); S.el = d; d.classList.add('sel'); } soon(); } else clear();
    }
    return r;
  };
  return S;
}
