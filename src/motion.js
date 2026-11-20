// Motion, as Fluent 2 has it (clean room: its published durations and curves, Rikuy's own code).
// One set of tokens (src/tokens.css: durations 100, 150, 200 and 300 ms; a decelerating curve for
// what enters, an accelerating one for what leaves, an easing one for what moves), read here once,
// so CSS and script share them. Only transform (the translate and scale properties, which compose
// with an element's own transform, the toast's centring) and opacity are animated, never a size
// or a place in the layout: an animation costs no layout and runs on the compositor.
//
// What moves, and nothing else: a ribbon tab's content as it opens (a fade and an 8 px slide from
// the side of the tab it came from), a contextual tab appearing, menus, split buttons' flyouts,
// galleries and the right click menu (a fade and a scale from 0.98 at their anchor), dialogs (a
// fade and a scale from 0.96), task panes and the Help pane from their edge, File's backstage from
// the left, toasts rising, the save state's words, the PDF pane holding the old pages until the new
// ones are drawn and then cross fading (it flashed white), and the views (Page, LaTeX, PDF) through
// the View Transitions API where the browser has it. The caret's glide is src/caret.js.
//
// Nothing waits for an animation: what it shows is in the page, in its final place for the
// accessibility tree and the hit test, from the first frame; a press or a key during one finishes
// it at once (the press acts where it lands); a surface that leaves is gone from the page at once,
// and what fades out is an inert copy (no ids, no role in the tree, no pointer events).
//
// Three modes, on <html data-motion>: "full"; "reduced" when the system asks for reduced motion
// (WCAG 2.3.3): nothing moves, things fade in for 100 ms, nothing fades out, the caret is the
// browser's; "off" when File › Options › Animations is off (Word's "Provide feedback with
// animation"): nothing at all. The settings are kept in this browser (KEY).
//
// The module is loaded under node by the build (src/cmd/motion.js reads its settings): nothing
// here touches the page until installMotion runs.

const KEY = 'rikuy.motion.v1';
const DEFAULTS = { anim: true, caret: true };

// the tokens, as src/tokens.css has them (these values only where the style sheet is missing)
export const TOKENS = {
  faster: 100, fast: 150, normal: 200, slow: 300,
  decelerate: 'cubic-bezier(0, 0, 0, 1)', accelerate: 'cubic-bezier(1, 0, 1, 1)', standard: 'cubic-bezier(0.33, 0, 0.67, 1)',
  slide: 8, slidePane: 16, slideBackstage: 24, scaleMenu: 0.98, scaleDialog: 0.96, blink: 1060
};
const T = { ...TOKENS };

let settings = null;
const listeners = new Set();
const live = new Set();   // the animations running now, finished by a press or a key
let app = null, vt = null, mql = null;
const $ = (s) => document.querySelector(s);
// what motion costs the main thread: every callback of its own timed (test/motion.py reads it,
// and it must never come near a long task's 50 ms)
export const motionStats = { calls: 0, total: 0, worst: 0 };
export function timed(fn) {
  return function (...a) {
    const t = performance.now();
    try { return fn.apply(this, a); } finally { const d = performance.now() - t; motionStats.calls++; motionStats.total += d; if (d > motionStats.worst) motionStats.worst = d; }
  };
}

export function motionSettings() {
  if (!settings) {
    let kept = null;
    try { kept = JSON.parse(globalThis.localStorage && localStorage.getItem(KEY) || 'null'); } catch (e) { kept = null; }
    settings = { ...DEFAULTS, ...(kept && typeof kept === 'object' ? { anim: kept.anim !== false, caret: kept.caret !== false } : {}) };
  }
  return settings;
}
export function setMotion(change) {
  settings = { ...motionSettings(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* private mode: for this visit */ }
  applyMode();
}
// 'full', 'reduced' or 'off'
export function motionMode() {
  if (!motionSettings().anim) return 'off';
  return mql && mql.matches ? 'reduced' : 'full';
}
// told when the mode or the settings change (the caret listens)
export function onMotion(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function applyMode() {
  if (typeof document === 'undefined') return;
  const m = motionMode();
  document.documentElement.dataset.motion = m;
  if (m !== 'full') finishAll();
  for (const fn of listeners) { try { fn(m, motionSettings()); } catch (e) { console.error(e); } }
}

// ---- the tokens --------------------------------------------------------------------------
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const ms = (n, d) => { const s = v(n), m = /^([\d.]+)(ms|s)$/.exec(s); return m ? +m[1] * (m[2] === 's' ? 1000 : 1) : d; };
  const px = (n, d) => { const m = /^(-?[\d.]+)px$/.exec(v(n)); return m ? +m[1] : d; };
  const num = (n, d) => { const x = parseFloat(v(n)); return Number.isFinite(x) ? x : d; };
  Object.assign(T, {
    faster: ms('--rk-duration-faster', TOKENS.faster), fast: ms('--rk-duration-fast', TOKENS.fast), normal: ms('--rk-duration-normal', TOKENS.normal), slow: ms('--rk-duration-slow', TOKENS.slow),
    decelerate: v('--rk-curve-decelerate') || TOKENS.decelerate, accelerate: v('--rk-curve-accelerate') || TOKENS.accelerate, standard: v('--rk-curve-standard') || TOKENS.standard,
    slide: px('--rk-slide', TOKENS.slide), slidePane: px('--rk-slide-pane', TOKENS.slidePane), slideBackstage: px('--rk-slide-backstage', TOKENS.slideBackstage),
    scaleMenu: num('--rk-scale-menu', TOKENS.scaleMenu), scaleDialog: num('--rk-scale-dialog', TOKENS.scaleDialog), blink: ms('--rk-caret-blink', TOKENS.blink)
  });
}
export const tokens = () => T;

// ---- playing -------------------------------------------------------------------------------
// One animation of the registry of running ones; its id says what it is ('rk-menu', ...), which
// test/motion.py reads with document.getAnimations()
function play(el, frames, duration, easing, tag, done) {
  if (!el || typeof el.animate !== 'function') { if (done) done(); return null; }
  let a;
  try { a = el.animate(frames, { duration, easing, fill: 'backwards' }); } catch (e) { if (done) done(); return null; }
  a.id = 'rk-' + tag;
  live.add(a);
  const end = () => { live.delete(a); if (done) done(); };
  a.addEventListener('finish', end);
  a.addEventListener('cancel', end);
  return a;
}
// what an entering surface does in each mode: the full motion, or a fade of 100 ms
function enter(el, tag, frames, duration) {
  const m = motionMode();
  if (m === 'off') return null;
  if (m === 'reduced') return play(el, [{ opacity: 0 }, { opacity: 1 }], T.faster, T.decelerate, tag);
  return play(el, frames, duration, T.decelerate, tag);
}
// every running animation to its end, at once (a press or a key during one); the PDF's cover
// too where pdf is true (a press in the PDF pane: typing elsewhere while TeX runs keeps it)
export function finishAll(pdf = true) {
  for (const a of [...live]) { try { a.finish(); } catch (e) { try { a.cancel(); } catch (e2) { /* gone */ } } }
  if (vt) { try { vt.skipTransition(); } catch (e) { /* done */ } vt = null; }
  if (xf && pdf) dropOverlay();
}

// A surface that left the page fades out as a copy: the element itself is gone at once (its
// listeners, ids and focus with it), so nothing can reach the copy, which is inert, hidden from
// the accessibility tree and from the pointer. A surface holding live parts (a formula field, a
// canvas, a frame) is not copied: cloning a custom element would start a second one.
let ghosts = null;
function leave(el, tag, frames) {
  if (motionMode() !== 'full' || !el || el.querySelector('canvas, iframe, video, object, embed') || [...el.querySelectorAll('*')].some((x) => x.localName.includes('-')) || el.localName.includes('-')) return;
  const g = el.cloneNode(true);
  g.removeAttribute('id');
  for (const x of g.querySelectorAll('[id]')) x.removeAttribute('id');
  g.hidden = false;
  g.inert = true;
  g.setAttribute('aria-hidden', 'true');
  g.classList.add('rk-ghost');
  if (!ghosts || !ghosts.isConnected) { ghosts = document.createElement('div'); ghosts.className = 'rk-ghosts'; ghosts.setAttribute('aria-hidden', 'true'); document.body.append(ghosts); }
  ghosts.append(g);
  // (a pane docked in the layout has no place of its own outside it: it just goes)
  const pos = getComputedStyle(g).position;
  if (pos !== 'fixed' && pos !== 'absolute') { g.remove(); if (!ghosts.childElementCount) { ghosts.remove(); ghosts = null; } return; }
  play(g, frames, T.faster, T.accelerate, tag + '-out', () => { g.remove(); if (ghosts && !ghosts.childElementCount) { ghosts.remove(); ghosts = null; } });
}

// ---- the parts -----------------------------------------------------------------------------
// (no backdrop: Fluent dims the page only behind a modal dialog, and Rikuy's dialogs are not modal,
// a press on the page behind one closes it; the one modal dialog, an agent's question in
// src/webmcp.js, has its backdrop fade in src/motion.css)
// a menu or a dialog from App.makePop: its kind, and where it grows from (its anchor)
function popEnter(el) {
  const menu = el.getAttribute('role') === 'menu';
  if (el.classList.contains('sheet-mode')) return enter(el, menu ? 'menu' : 'dialog', [{ opacity: 0, translate: '0 ' + T.slidePane + 'px' }, { opacity: 1, translate: '0 0' }], T.normal);
  if (el.classList.contains('pop-help')) return enter(el, 'pane', [{ opacity: 0, translate: T.slidePane + 'px 0' }, { opacity: 1, translate: '0 0' }], T.normal);
  const P = app && app.pop && app.pop.el === el ? app.pop : null;
  const a = P ? (P.anchor && P.anchor.isConnected ? P.anchor.getBoundingClientRect() : P.rect) : null;
  const r = el.getBoundingClientRect();
  if (a && r.width) {
    const ox = Math.max(0, Math.min(r.width, a.left + a.width / 2 - r.left));
    const oy = r.top >= a.top + a.height / 2 ? 0 : r.height;
    el.style.transformOrigin = Math.round(ox) + 'px ' + Math.round(oy) + 'px';
  }
  const s = menu ? T.scaleMenu : T.scaleDialog;
  const an = enter(el, menu ? 'menu' : 'dialog', [{ opacity: 0, scale: String(s) }, { opacity: 1, scale: '1' }], menu ? T.fast : T.normal);
  if (an) an.addEventListener('finish', () => { el.style.transformOrigin = ''; });
  else el.style.transformOrigin = '';
  return an;
}
function popLeave(el) {
  const menu = el.getAttribute('role') === 'menu';
  if (el.classList.contains('pop-help')) return leave(el, 'pane', [{ opacity: 1 }, { opacity: 0, translate: T.slidePane + 'px 0' }]);
  leave(el, menu ? 'menu' : 'dialog', [{ opacity: 1 }, { opacity: 0, scale: String(menu ? T.scaleMenu : T.scaleDialog) }]);
}
// a task pane from its edge (the right, or the left for the side panel)
const fromEdge = (side) => [{ opacity: 0, translate: (side === 'left' ? -T.slidePane : T.slidePane) + 'px 0' }, { opacity: 1, translate: '0 0' }];
const toEdge = (side) => [{ opacity: 1 }, { opacity: 0, translate: (side === 'left' ? -T.slidePane : T.slidePane) + 'px 0' }];
const isPane = (el) => el.matches && el.matches('.stp, .sp-pane, .th-pane, .help-pane');

// what came into the page or left it: body's and #main's children (panes dock in #main)
function children(recs) {
  for (const r of recs) {
    for (const n of r.addedNodes) {
      // (one put in and taken out again in the same moment: Help's popover, docked as a pane)
      if (n.nodeType !== 1 || !n.isConnected || n.classList.contains('rk-ghost') || n.classList.contains('rk-ghosts')) continue;
      if (n.classList.contains('pop') && !n.hidden) popEnter(n);
      else if (isPane(n) && !n.hidden) enter(n, 'pane', fromEdge('right'), T.normal);
      else if (n.classList.contains('fr') && !n.hidden) enter(n, 'dialog', [{ opacity: 0, scale: String(T.scaleDialog) }, { opacity: 1, scale: '1' }], T.normal);
    }
    for (const n of r.removedNodes) {
      if (n.nodeType !== 1 || n.isConnected || n.classList.contains('rk-ghost')) continue;
      // (Help's popover whose content became the Help pane leaves nothing to fade: the pane enters)
      if (n.classList.contains('pop') && !n.hidden && !(n.classList.contains('pop-help') && document.getElementById('helppane'))) popLeave(n);
      else if (isPane(n) && !n.hidden) leave(n, 'pane', toEdge('right'));
    }
  }
}

// an element shown or hidden by its hidden attribute
let lastPanel = null;
function shownOrHidden(recs) {
  const seen = new Set();
  for (const r of recs) {
    const el = r.target;
    if (seen.has(el) || el.nodeType !== 1) continue;
    seen.add(el);
    const shown = !el.hidden, was = r.oldValue === null;   // (oldValue null: it had no hidden attribute)
    if (shown === was) continue;
    if (el.classList.contains('rb-panel')) { if (shown) panelShown(el); continue; }
    if (el.classList.contains('rb-tab')) { if (shown) enter(el, 'ctx-tab', [{ opacity: 0, translate: -T.slide + 'px 0' }, { opacity: 1, translate: '0 0' }], T.normal); continue; }
    if (el.id === 'toast') {
      if (shown) enter(el, 'toast', [{ opacity: 0, translate: '0 ' + T.slide + 'px' }, { opacity: 1, translate: '0 0' }], T.normal);
      else leave(el, 'toast', [{ opacity: 1 }, { opacity: 0, translate: '0 ' + T.slide + 'px' }]);
      continue;
    }
    if (isPane(el)) { if (shown) enter(el, 'pane', fromEdge('right'), T.normal); else leave(el, 'pane', toEdge('right')); continue; }
    if (el.classList.contains('fr')) {
      if (shown) enter(el, 'dialog', [{ opacity: 0, scale: String(T.scaleDialog) }, { opacity: 1, scale: '1' }], T.normal);
      else leave(el, 'dialog', [{ opacity: 1 }, { opacity: 0, scale: String(T.scaleDialog) }]);
    }
  }
}

// A ribbon tab opened: its content fades in and slides 8 px from the side of the tab it came from
// (from the right for a tab to the right). The toolbar slides inside its panel, which clips it
// meanwhile: a toolbar 8 px to the right would widen the ribbon's scrolling row, and the
// ribbon's fitting (src/ribbon/tabs.js ribbonFit) measures that row. File's backstage comes in
// from the left, as Word's does.
function panelShown(p) {
  const panels = [...p.parentElement.querySelectorAll(':scope > .rb-panel')];
  const from = lastPanel && lastPanel.isConnected ? panels.indexOf(lastPanel) : -1;
  lastPanel = p;
  const tb = p.querySelector(':scope > .rb-tb') || p;
  if (p.dataset.tab === 'file') return enter(tb, 'backstage', [{ opacity: 0, translate: -T.slideBackstage + 'px 0' }, { opacity: 1, translate: '0 0' }], T.slow);
  if (from < 0) return null;
  const dir = panels.indexOf(p) > from ? 1 : -1;
  p.classList.add('rk-clip');
  const a = enter(tb, 'tab', [{ opacity: 0, translate: dir * T.slide + 'px 0' }, { opacity: 1, translate: '0 0' }], T.fast);
  const unclip = () => p.classList.remove('rk-clip');
  if (a) { a.addEventListener('finish', unclip); a.addEventListener('cancel', unclip); } else unclip();
  return a;
}

// the side panel, the source and the PDF beside the page (body's classes)
function bodyClasses(recs) {
  const b = document.body;
  for (const r of recs) {
    const was = new Set(String(r.oldValue || '').split(/\s+/));
    const added = (c) => b.classList.contains(c) && !was.has(c);
    // (a view's switch has its own cross fade, and moves panes as it goes)
    if (vt) continue;
    if (added('nav-on')) enter($('#nav'), 'pane', fromEdge('left'), T.normal);
    if (added('src-on') && !b.classList.contains('view-latex')) enter($('#srcpane'), 'pane', fromEdge('right'), T.normal);
    if (added('pdf-on') && !b.classList.contains('view-pdf')) enter($('#pdfpane'), 'pane', fromEdge('right'), T.normal);
  }
}

// the words of the save state (Saved, Not saved) fade in when they change
function saveState(el) {
  let last = el.textContent;
  new MutationObserver(timed(() => {
    const now = el.textContent;
    if (now === last) return;
    last = now;
    if (!el.hidden && now) enter(el, 'save', [{ opacity: 0 }, { opacity: 1 }], T.fast);
  })).observe(el, { childList: true, characterData: true, subtree: true });
}

// ---- the PDF pane -----------------------------------------------------------------------------
// A recompiled PDF replaced every page at once with empty ones that pdf.js then drew one by one:
// the pane flashed white. The old pages (their canvases keep their pictures) stay over the new
// ones, at the place they were, until the new pages in view are drawn, then fade out. The cover
// is a copy for the eye alone (no pdf-page class, no data-page, no pointer events): a click goes
// to the new page beneath, and a press, a key or the wheel takes the cover away at once.
let xf = null, pdfTop = 0;
function dropOverlay() { if (xf) { const o = xf; xf = null; o.el.remove(); } }
function pdfPane() {
  const host = $('#pdf-host'), pane = $('#pdfpane');
  if (!host || !pane) return;
  host.addEventListener('scroll', () => { if (!xf) pdfTop = host.scrollTop; }, { passive: true });
  for (const ev of ['wheel', 'touchstart']) host.addEventListener(ev, () => dropOverlay(), { passive: true });
  new MutationObserver(timed((recs) => {
    let old = null, added = false;
    for (const r of recs) {
      for (const n of r.removedNodes) if (n.nodeType === 1 && n.classList.contains('pdf-pages') && !old) old = n;
      for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList.contains('pdf-pages')) added = true;
    }
    if (!added) { dropOverlay(); return; }
    // (a cover up already shows the last PDF drawn: it stays, for the newest)
    if (!old || xf || motionMode() === 'off' || !document.body.classList.contains('pdf-on')) { if (!xf) pdfTop = host.scrollTop; return; }
    if (![...old.querySelectorAll('canvas')].some((c) => c.width > 0)) { pdfTop = host.scrollTop; return; }
    const cs = getComputedStyle(host);
    const cover = document.createElement('div');
    cover.className = 'rk-pdf-xf';
    cover.setAttribute('aria-hidden', 'true');
    cover.inert = true;
    Object.assign(cover.style, { top: host.offsetTop + 'px', left: host.offsetLeft + 'px', width: host.clientWidth + 'px', height: host.clientHeight + 'px' });
    old.className = 'rk-xf-pages';
    old.style.padding = cs.padding;
    old.style.translate = '0 ' + -pdfTop + 'px';
    for (const pg of old.querySelectorAll('.pdf-page')) { pg.className = 'rk-xf-page'; pg.removeAttribute('data-page'); }
    cover.append(old);
    pane.append(cover);
    xf = { el: cover, t0: performance.now() };
    const me = xf;
    const view = app && app.pdfView;
    const settle = timed(() => {
      if (xf !== me) return;
      const pages = view && view.pages ? view.pages : [];
      const hr = host.getBoundingClientRect();
      const inView = pages.filter((p) => { const b = p.box.getBoundingClientRect(); return b.bottom > hr.top && b.top < hr.bottom; });
      for (const p of inView) if (p.done && !p.rkSeen) { p.rkSeen = true; p.done.then(() => { p.rkDone = true; }); }
      const ready = inView.length > 0 && inView.every((p) => p.rkDone);
      if (!ready && performance.now() - me.t0 < 3000) { requestAnimationFrame(settle); return; }
      pdfTop = host.scrollTop;
      if (motionMode() === 'full') play(cover, [{ opacity: 1 }, { opacity: 0 }], T.fast, T.standard, 'pdf', () => { if (xf === me) dropOverlay(); });
      else if (motionMode() === 'reduced') play(cover, [{ opacity: 1 }, { opacity: 0 }], T.faster, T.standard, 'pdf', () => { if (xf === me) dropOverlay(); });
      else dropOverlay();
    });
    requestAnimationFrame(settle);
  })).observe(host, { childList: true });
  // the pane closed: no cover left over it
  new MutationObserver(() => { if (!document.body.classList.contains('pdf-on')) dropOverlay(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// ---- the views ------------------------------------------------------------------------------
// fn (a switch of Page, LaTeX or PDF) inside a view transition where the browser has one: the
// page as it was cross fades into the page as it is (src/motion.css, 200 ms; 150 ms with reduced
// motion). The work waits for nothing but the switch before it (two switches at once ran their
// awaits interleaved, and the first pressed could win): it starts with the transition, and where
// it takes longer than 150 ms (CodeMirror loading for the first LaTeX view) the fade shows what is
// there by then and the rest comes without one. Resolves to what fn resolves to.
let views = Promise.resolve(), switching = 0;
export function crossFade(fn) {
  const go = () => fade(fn);
  let p;
  // (with none running, at once, as the switch always began: its first steps before the caller's next)
  if (!switching) { try { p = Promise.resolve(go()); } catch (e) { p = Promise.reject(e); } } else p = views.then(go, go);
  switching++;
  const done = () => { switching--; };
  views = p.then(done, done);
  return p;
}
function fade(fn) {
  const m = typeof document === 'undefined' ? 'off' : motionMode();
  if (m === 'off' || typeof document.startViewTransition !== 'function' || document.visibilityState !== 'visible') return fn();
  let give;
  const out = new Promise((r) => { give = r; });
  try {
    const t = document.startViewTransition(() => {
      const p = Promise.resolve().then(fn);
      give(p);
      return Promise.race([p.then(() => {}, () => {}), new Promise((r) => setTimeout(r, T.fast))]);
    });
    vt = t;
    const clear = () => { if (vt === t) vt = null; };
    t.finished.then(clear, clear);
    // (a transition skipped, by a press or a key, rejects these; the work is done all the same)
    t.updateCallbackDone.catch(() => {});
    t.ready.catch(() => {});
  } catch (e) { vt = null; return fn(); }
  return out.then((p) => p);
}

// ---- starting --------------------------------------------------------------------------------

export function installMotion(a) {
  app = a;
  // (for the tests and a look in the console)
  a.motion = { mode: motionMode, settings: motionSettings, set: setMotion, tokens: () => ({ ...T }), stats: motionStats, finish: finishAll };
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  readTokens();
  applyMode();
  if (mql) mql.addEventListener('change', applyMode);
  // (another tab changed the setting)
  addEventListener('storage', (e) => { if (e.key === KEY) { settings = null; applyMode(); } });
  // a press or a key during an animation acts at once, on the final state
  addEventListener('pointerdown', timed((e) => { if (live.size || vt || xf) finishAll(!!(e.target && e.target.closest && e.target.closest('#pdfpane'))); }), true);
  addEventListener('keydown', timed(() => { if (live.size || vt) finishAll(false); }), true);
  const off = () => motionMode() === 'off';
  const gate = (fn) => timed((recs) => { if (!off()) fn(recs); });
  const kids = new MutationObserver(gate(children));
  kids.observe(document.body, { childList: true });
  const main = $('#main');
  if (main) kids.observe(main, { childList: true });
  // (hidden on any element; most records are of elements this ignores, and cost one look each)
  new MutationObserver(gate(shownOrHidden)).observe(document.body, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true, subtree: true });
  new MutationObserver(gate(bodyClasses)).observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  lastPanel = [...document.querySelectorAll('#ribbon > .rb-panel')].find((p) => !p.hidden) || null;
  for (const id of ['#savestate', '#st-save']) { const el = $(id); if (el) saveState(el); }
  pdfPane();
}
