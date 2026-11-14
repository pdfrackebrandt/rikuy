// The selected picture's frame on the page, as Word draws it: eight handles that size it, a tip
// that says what will be written (a share of the line where the size is near one, else a length),
// and Crop's black bars. The frame sits over the page (fixed, out of the text the editor owns),
// follows the picture as the page scrolls, and goes when the picture is no longer selected.
//
// Sizing: a corner or a side keeps the picture's shape (one width written), Shift frees it (width
// and height; with Lock Aspect Ratio off the other way round, which is how a phone, with no Shift,
// frees it); the size snaps to twentieths of the line within a few pixels, as Word snaps to its
// guides. One commit when the press ends (Escape while dragging gives up). Crop: the whole file is
// shown dim with the part kept bright; the bars move the four edges; Enter or Crop again writes
// trim=… and clip, Escape gives up, Remove Crop (Crop's arrow) takes it off.

import * as X from '../picture.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const el = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

export function installHandles(app) {
  const H = new Handles(app);
  app.picHandles = H;
  // (a second finger on the page while a handle is held would pinch the page's zoom: not then)
  document.addEventListener('touchmove', (e) => { if (H.drag || H.dragging) e.preventDefault(); }, { passive: false });
  const tick = () => H.soon();
  document.addEventListener('selectionchange', tick);
  document.addEventListener('keyup', tick, true);
  document.addEventListener('mouseup', tick, true);
  window.addEventListener('resize', tick);
  if (app.desk) app.desk.addEventListener('scroll', tick, { passive: true });
  return H;
}

class Handles {
  constructor(app) {
    this.app = app;
    this.raf = 0;
    this.frame = null;
    this.drag = null;
    this.cr = null;
  }
  build() {
    if (this.frame) return;
    const f = el('pic-frame');
    f.setAttribute('aria-hidden', 'true');
    f.hidden = true;
    for (const k of HANDLES) {
      const h = el('pic-h pic-h-' + k);
      h.dataset.h = k;
      h.addEventListener('pointerdown', (e) => this.down(e, k));
      f.append(h);
    }
    const tip = el('pic-tip');
    tip.hidden = true;
    f.append(tip);
    this.tip = tip;
    document.body.append(f);
    this.frame = f;
  }
  // the picture selected, while it is on the page
  target() {
    const A = this.app.armed;
    return A && A.kind === 'img' && A.el && A.el.isConnected ? A.el : null;
  }
  soon() { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.show()); }
  show() {
    this.build();
    const t = this.target();
    if (this.cr && (!t || t !== this.cr.el)) this.cropEnd(false);
    // a caret or a selection put elsewhere on the page (a key, Find, a click into text) lets the
    // picture go, as a press elsewhere does; the focus in a field or a dialog keeps it
    if (t && !this.drag && !this.cr) {
      const s = getSelection();
      if (s.rangeCount && this.app.root.contains(s.anchorNode) && !s.getRangeAt(0).intersectsNode(t)) {
        // (a touch screen sets its caret where the finger was a moment after the tap that
        // selected the picture: the picture stays selected then)
        if (Date.now() - (this.app.picSelT || 0) < 700) { const r = document.createRange(); r.selectNode(t); this.app.ourSel = true; s.removeAllRanges(); s.addRange(r); }
        else { this.app.disarm(); this.app.ribbonSync(); this.frame.hidden = true; return; }
      }
    }
    if (!t) { this.frame.hidden = true; return; }
    // (the bubble of bold and italic is for words: a picture has its tab)
    const bub = document.getElementById('bubble');
    if (bub) bub.hidden = true;
    if (this.cr) { this.frame.hidden = true; this.place(this.cr); return; }
    const box = (t.querySelector('.pic-in') || t.querySelector('img') || t).getBoundingClientRect();
    const r = t.classList.contains('a-box') ? t.getBoundingClientRect() : box;
    // (off the visible part of the page, as a scrolled away picture is)
    const d = this.app.desk ? this.app.desk.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    if (r.bottom < d.top || r.top > d.bottom || !r.width) { this.frame.hidden = true; return; }
    this.frame.hidden = false;
    Object.assign(this.frame.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const h = this.app.picHere();
    this.frame.classList.toggle('locked', !h || !h.P.keyval);
  }
  hide() { if (this.frame) this.frame.hidden = true; }

  // ---- sizing ---------------------------------------------------------------------------------
  down(e, k) {
    if (e.button !== 0) return;
    const app = this.app, h = app.picHere();
    if (!h || !h.P.keyval) return;
    e.preventDefault(); e.stopPropagation();
    const img = h.el.querySelector('img') || h.el;
    const r0 = (h.el.classList.contains('a-box') ? h.el : img).getBoundingClientRect();
    const px = app.layout && app.layout.px ? app.layout.px : 1.33;
    const S = X.sizeOf(h.src, h.P);
    // (the line a width is a share of: the text's, also for a wrapfigure's own width)
    const g = app.layout && app.layout.g, tw = g && g.tw ? g.tw : 345;
    const lw = S.by === 'wrap' ? tw : app.picLine(h);
    this.drag = { k, h, img, r0, px, lw, x0: e.clientX, y0: e.clientY, w: r0.width, hh: r0.height, aspect: r0.height / r0.width, free: false, locked: app.picLocked(h), base: S.width && X.shareOf(S.width) ? X.shareOf(S.width)[1] : 'linewidth', was: { w: h.el.style.width, h: h.el.style.height, iw: img.style.width, ih: img.style.height } };
    e.target.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('pic-drag');
    const move = (ev) => this.move(ev);
    const up = (ev) => { document.documentElement.classList.remove('pic-drag'); e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); e.target.removeEventListener('pointercancel', up); document.removeEventListener('keydown', esc, true); this.up(ev); };
    const esc = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.drag.cancel = true; up(ev); } };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
    e.target.addEventListener('pointercancel', up);
    document.addEventListener('keydown', esc, true);
    this.tip.hidden = false;
  }
  move(e) {
    const D = this.drag;
    if (!D) return;
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0, k = D.k;
    const sx = /e/.test(k) ? 1 : /w/.test(k) ? -1 : 0, sy = /s/.test(k) ? 1 : /^n/.test(k) ? -1 : 0;
    // (Shift frees the shape; with Lock Aspect Ratio off it is free, and Shift keeps it: a phone has no Shift)
    D.free = e.shiftKey === D.locked;
    const max = D.lw * D.px, min = 8;
    let w = D.r0.width + sx * dx, hh = D.r0.height + sy * dy;
    if (!D.free) {
      // (a corner follows the larger of its two moves; a side its own, the other side with it)
      if (sx && sy) { const byW = w, byH = hh / D.aspect; w = Math.abs(byW - D.r0.width) >= Math.abs(byH - D.r0.width) ? byW : byH; }
      else if (sy) w = hh / D.aspect;
      w = Math.max(min, Math.min(max, w));
      // snap to twentieths of the line within 1.2% of it
      const f = w / (D.lw * D.px), r = Math.round(f * 20) / 20;
      D.snap = r > 0 && Math.abs(f - r) <= 0.012;
      if (D.snap) w = r * D.lw * D.px;
      hh = w * D.aspect;
    } else {
      if (!sx) w = D.r0.width;
      if (!sy) hh = D.r0.height;
      w = Math.max(min, Math.min(max, w)); hh = Math.max(min, hh);
      D.snap = false;
    }
    D.w = w; D.hh = hh;
    // the picture drawn at its new size while the press lasts
    const el = D.h.el;
    if (el.classList.contains('a-box')) { el.style.width = w + 'px'; el.style.height = hh + 'px'; const inner = el.querySelector('.pic-in'); if (inner) inner.style.transform = 'scale(' + (w / D.r0.width) + ',' + (hh / D.r0.height) + ')'; }
    else { el.style.width = w + 'px'; D.img.style.width = '100%'; D.img.style.height = D.free ? hh + 'px' : ''; }
    Object.assign(this.frame.style, { width: w + 'px', height: hh + 'px', left: (sx < 0 ? D.r0.right - w : D.r0.left) + 'px', top: (sy < 0 ? D.r0.bottom - hh : D.r0.top) + 'px' });
    this.tip.textContent = this.text(D).label;
  }
  // what a press would write: { width, height, label }
  text(D) {
    const wpt = D.w / D.px, hpt = D.hh / D.px;
    const cm = (pt) => X.lengthText(Math.round(pt * 2.54 / 72.27 * 10) / 10 * 72.27 / 2.54, 'cm');
    const width = D.snap ? X.widthText(wpt, D.lw, { base: D.base, near: 0.0125 }) : cm(wpt);
    const height = D.free ? cm(hpt) : null;
    const share = X.shareOf(width);
    const label = (share ? Math.round(share[0] * 100) + '% of the line' : width.replace('cm', ' cm')) + (height ? ' × ' + height.replace('cm', ' cm') : '');
    return { width, height, label };
  }
  up() {
    const D = this.drag;
    this.drag = null;
    this.tip.hidden = true;
    if (!D) return;
    const el = D.h.el;
    el.style.width = D.was.w; el.style.height = D.was.h; D.img.style.width = D.was.iw; D.img.style.height = D.was.ih;
    const inner = el.querySelector('.pic-in'); if (inner) inner.style.transform = '';
    if (D.cancel || (Math.abs(D.w - D.r0.width) < 2 && Math.abs(D.hh - D.r0.height) < 2)) { this.show(); return; }
    const t = this.text(D);
    this.app.picResize(D.free ? { width: t.width, height: t.height, free: true } : { width: t.width, free: false });
    this.app.ribbonSync();
    this.show();
  }

  // ---- crop -------------------------------------------------------------------------------------
  crop(h) {
    const app = this.app;
    const img = h.el.querySelector('img');
    if (!img || !img.naturalWidth) { app.toast('The picture has not loaded yet: try again in a moment, or Crop by Numbers (Crop\'s arrow).'); return false; }
    if (X.angleOf(h.src, h.P) || h.P.wraps.some((w) => /^(fliph|flipv|rot)$/.test(w.kind))) { app.toast('A turned or flipped picture is cropped by numbers: Crop\'s arrow, Crop by Numbers.'); return false; }
    const nat = app.picNaturalNow(h) || { w: img.naturalWidth, h: img.naturalHeight };
    const c = X.cropOf(h.P, nat) || { l: 0, b: 0, r: 0, t: 0 };
    const R = (h.el.classList.contains('a-box') ? h.el : img).getBoundingClientRect();
    // px on screen for each bp of the file, from the part shown now
    const k = R.width / Math.max(1, nat.w - c.l - c.r);
    const layer = el('pic-crop');
    layer.setAttribute('aria-hidden', 'true');
    const full = document.createElement('img');
    full.src = img.src; full.alt = ''; full.className = 'pc-full';
    const win = el('pc-win');
    const lit = document.createElement('img');
    lit.src = img.src; lit.alt = ''; lit.className = 'pc-lit';
    win.append(lit);
    for (const kk of HANDLES) { const b = el('pc-h pc-h-' + kk); b.dataset.h = kk; b.addEventListener('pointerdown', (e) => this.cropDown(e, kk)); win.append(b); }
    layer.append(full, win);
    document.body.append(layer);
    this.cr = { el: h.el, h, keep: { f: h.f, s: h.s }, nat, c: { ...c }, c0: { ...c }, k, ox: R.left - c.l * k, oy: R.top - c.t * k, layer, win, full, lit };
    this.place(this.cr);
    app.picCropping = true;
    app.ribbonSync();
    this.cropKeys = (e) => {
      if (!this.cr) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.cropEnd(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cropEnd(false); }
    };
    document.addEventListener('keydown', this.cropKeys, true);
    // a press outside the picture writes the crop, as in Word
    this.cropOut = (e) => { if (this.cr && !layer.contains(e.target) && !e.target.closest('#ribbon')) this.cropEnd(true); };
    setTimeout(() => document.addEventListener('pointerdown', this.cropOut, true), 0);
    this.frame.hidden = true;
    return true;
  }
  // the dim whole and the bright kept part, where the picture is now
  place(C) {
    const t = C.el.isConnected ? C.el : null;
    if (t) {
      const R = (t.classList.contains('a-box') ? t : t.querySelector('img') || t).getBoundingClientRect();
      if (!this.dragging) { C.ox = R.left - C.c0.l * C.k; C.oy = R.top - C.c0.t * C.k; }
    }
    const W = C.nat.w * C.k, Hh = C.nat.h * C.k;
    Object.assign(C.layer.style, { left: C.ox + 'px', top: C.oy + 'px', width: W + 'px', height: Hh + 'px' });
    Object.assign(C.full.style, { width: W + 'px', height: Hh + 'px' });
    const x = C.c.l * C.k, y = C.c.t * C.k, w = W - (C.c.l + C.c.r) * C.k, h = Hh - (C.c.t + C.c.b) * C.k;
    Object.assign(C.win.style, { left: x + 'px', top: y + 'px', width: Math.max(4, w) + 'px', height: Math.max(4, h) + 'px' });
    Object.assign(C.lit.style, { width: W + 'px', height: Hh + 'px', left: -x + 'px', top: -y + 'px' });
  }
  cropDown(e, k) {
    const C = this.cr;
    if (!C || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, c: { ...C.c } };
    this.dragging = true;
    document.documentElement.classList.add('pic-drag');
    e.target.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / C.k, dy = (ev.clientY - start.y) / C.k, c = { ...start.c }, m = 4;
      if (/w/.test(k)) c.l = clamp(start.c.l + dx, 0, C.nat.w - c.r - m);
      if (/e/.test(k)) c.r = clamp(start.c.r - dx, 0, C.nat.w - c.l - m);
      if (/^n/.test(k)) c.t = clamp(start.c.t + dy, 0, C.nat.h - c.b - m);
      if (/s/.test(k)) c.b = clamp(start.c.b - dy, 0, C.nat.h - c.t - m);
      C.c = c;
      this.place(C);
    };
    const up = () => { this.dragging = false; document.documentElement.classList.remove('pic-drag'); e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); e.target.removeEventListener('pointercancel', up); };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
    e.target.addEventListener('pointercancel', up);
  }
  // Crop again, Enter or a press elsewhere writes it; Escape gives up
  cropEnd(apply) {
    const C = this.cr;
    if (!C) return false;
    this.cr = null;
    this.app.picCropping = false;
    C.layer.remove();
    document.removeEventListener('keydown', this.cropKeys, true);
    document.removeEventListener('pointerdown', this.cropOut, true);
    const same = ['l', 'b', 'r', 't'].every((x) => Math.abs(C.c[x] - C.c0[x]) < 0.5);
    if (apply && !same) { this.app.picSelect(C.keep); this.app.picCrop(C.c); }
    else { this.app.ribbonSync(); this.show(); }
    return true;
  }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
