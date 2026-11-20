// Live figures: \rikuywidget[<includegraphics options>]{<widget.html>}{<fallback image>} from
// rikuy.sty. Every TeX (the PDF pane, Overleaf, a desktop TeX Live) prints the fallback image; the
// typeset page runs the widget, a self contained HTML file of the project. The text holds a box
// of the widget's size (render.js, class w-live), and the widget runs in a frame laid over that
// box (WidgetLayer). docs/ARCHITECTURE.md, "Live figures", says why it runs this way.

// What a widget may use: its own inline script and style, and pictures, fonts and workers it
// carries as data. No connection, frame, form or file from anywhere: a widget arrives inside
// documents from anyone, and a request out would tell its author who reads them, and when. It is
// added inside the frame, before any of the widget's markup is read, and policies only ever add
// restrictions to each other. WebRTC is the one way out no policy closes in Chromium (it ignores
// CSP's webrtc directive), which is why widgets from someone else wait for a click
// (App.widgetsAllowed); widgetGuard below only makes the plain ways to it fail.
export const WIDGET_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:; base-uri 'none'; form-action 'none'";

// Where a widget's document comes from. A srcdoc frame inherits the page's policy, so it can run
// the widget's inline scripts only where the page's policy allows inline scripts: the claude.ai
// artifact's host does (the copy built with RIKUY_SHARE, which keeps srcdoc). The hosted page's
// does not (build/app.mjs policy: the page's one script by its hash, no eval), so there a widget
// runs in a document of its own, WIDGET_SHELL, served as widget-<hash>.html with WIDGET_POLICY in
// its own header (build/app.mjs headers): the frame loads it, it asks the page for the widget,
// and writes it over itself; document.open() takes its listener away with everything else, so
// the widget cannot ask it for anything. build.mjs writes the file and names it here
// (__RIKUY_WIDGET_SHELL__); named by its hash, the HTTP cache keeps it for good, which is where
// an offline page finds it (a service worker does not see a sandboxed frame's requests).
// WIDGET_POLICY is WIDGET_CSP plus who may frame it: the page alone.
export const WIDGET_POLICY = WIDGET_CSP + "; frame-ancestors 'self'";
const SHELL = typeof __RIKUY_WIDGET_SHELL__ === 'undefined' ? '' : __RIKUY_WIDGET_SHELL__;
// The shell writes what it is sent only for the page that framed it and only inside the sandbox:
// a message from its parent window, sent by a page of its own origin (a site that frames a copy
// served without the page's headers is another origin), and the shell's own origin opaque, which
// it is only in a sandboxed frame (unsandboxed, the widget would run as the site itself, with its
// storage and its parent page within reach). location.origin is the address's origin even in the
// sandbox; self.origin is "null" there.
function widgetShell() {
  'use strict';
  addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== parent || e.origin !== location.origin || self.origin !== 'null' || !d || d.rikuy !== 'widget' || typeof d.html !== 'string') return;
    document.open();
    document.write(d.html);
    document.close();
  });
  parent.postMessage({ rikuy: 'shell' }, '*');
}
export const WIDGET_SHELL = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="x-dns-prefetch-control" content="off"><title>Live figure</title>' +
  '<script>(' + widgetShell + ')()</script></head><body></body></html>\n';

// The frames that run a widget from WIDGET_SHELL, and the document each is to write: answered when
// its shell asks, again after a reload (the widget's own, or the frame given a new document).
// Only a frame of this page that was given a widget is answered, with its own widget; the frame's
// origin is opaque, hence '*'.
const shells = new WeakMap();
// the frames whose shell has asked: one that never does (offline, with the browser's cached copy
// of the shell gone) is told to the page (WidgetLayer: the figure's picture and a note instead)
const asked = new WeakSet();
export const SHELL_WAIT = 8000;
let shellsHeard = false;
function answerShell(e) {
  if (!e.data || e.data.rikuy !== 'shell' || !e.source) return;
  for (const fr of document.querySelectorAll('iframe')) {
    if (fr.contentWindow === e.source && shells.has(fr)) {
      e.source.postMessage({ rikuy: 'widget', html: shells.get(fr) }, '*');
      if (!asked.has(fr)) { asked.add(fr); fr.dispatchEvent(new Event('rikuy-shell')); }
      return;
    }
  }
}
// Run a widget's HTML in a sandboxed frame (allow-scripts alone), or run new HTML in it.
export function runWidget(frame, html) {
  // (scripts alone, set here as well as by each caller: the shell runs nothing outside the sandbox)
  frame.setAttribute('sandbox', 'allow-scripts');
  const doc = widgetDoc(html);
  if (!SHELL) { frame.srcdoc = doc; return; }
  if (!shellsHeard) { shellsHeard = true; window.addEventListener('message', answerShell); }
  shells.set(frame, doc);
  // (setting src navigates the frame again even when it names the same file)
  frame.src = new URL(SHELL, location.href).href;
}

// The first script of every widget's document, run before any of the widget's markup is parsed.
// A widget can open an RTCPeerConnection and send a STUN request to its author's server, which
// tells them who opened the document and when; no policy stops that in Chromium. This takes the
// WebRTC interfaces away, so a tracker that calls them plainly fails. It is defense in depth,
// not the control: the control is the click a project from someone else needs before its widgets
// run. Every way around it found by trying (test/widgets.py checks the ones closed):
// - a new frame's own window: an about:blank frame the widget adds has an opaque origin of its
//   own (the sandbox gives every document in it one), so `frames[0].RTCPeerConnection` and
//   `contentWindow` throw, and `contentDocument` is null; a data: or blob: frame, `<object>`
//   and `<embed>` are refused by the policy. A srcdoc frame is not (no policy covers srcdoc) and
//   runs its own scripts in a window this never reaches, so frames are taken out of the document
//   as soon as they are added: a widget has no frames.
// - leaving: `location`, a link, `open(url, '_self')`, `navigation.navigate()` or a refresh
//   `<meta>` can take the frame to a data: or blob: document, which keeps the sandbox but not
//   this script, and none of them can be patched (`location` is unforgeable; the Navigation API
//   sends no events to an opaque origin). The parent's frame-src decides where a frame may go,
//   so the page refuses data: and blob: (framesOnlySrcdoc); a reload gets this script again.
// - `document.open()` and `write()` keep the window, so what was taken stays taken; a Worker has
//   no RTCPeerConnection; `open()` is refused by the sandbox.
// What still gets through: a srcdoc frame inside a shadow root the HTML parser makes
// (`<template shadowrootmode>` in the widget's markup, in `document.write` or through
// setHTMLUnsafe), which no observer here sees into. A widget written to get around this will.
// The function is sent as its text, so it uses nothing outside itself, and it holds on to every
// built-in it calls: by the time its callbacks run the widget may have replaced them.
function widgetGuard() {
  'use strict';
  const W = window, apply = Reflect.apply, gopd = Object.getOwnPropertyDescriptor;
  for (const n of Object.getOwnPropertyNames(W)) if (/^(webkit|moz)?RTC/.test(n)) try { delete W[n]; } catch (e) {}
  const SEL = 'iframe,frame,object,embed,fencedframe';
  const added = gopd(MutationRecord.prototype, 'addedNodes').get, count = gopd(NodeList.prototype, 'length').get;
  const matches = Element.prototype.matches, all = Element.prototype.querySelectorAll, remove = Element.prototype.remove;
  const drop = (list) => { for (let i = 0, n = apply(count, list, []); i < n; i++) apply(remove, list[i], []); };
  const mo = new MutationObserver((recs) => {
    for (let r = 0; r < recs.length; r++) {
      const nodes = apply(added, recs[r], []);
      for (let i = 0, n = apply(count, nodes, []); i < n; i++) {
        // text and comments throw here: matches is an Element's
        try { if (apply(matches, nodes[i], [SEL])) apply(remove, nodes[i], []); else drop(apply(all, nodes[i], [SEL])); } catch (e) {}
      }
    }
  });
  const watch = MutationObserver.prototype.observe, opts = { childList: true, subtree: true };
  apply(watch, mo, [document, opts]);
  // a shadow root made by script is watched as well (the HTML parser's are not: see above)
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachShadow(o) { const root = apply(attach, this, [o]); apply(watch, mo, [root, opts]); return root; };
  // The focus, only after a person's press or key in the widget. A frame's document may take the
  // focus from the page by itself in Chromium (focus() on a timer took the letters typed on the
  // page; an inert or hidden frame does it too), and no check after the fact closes that race.
  // So every way to the focus a script has is held until the frame has user activation, which
  // only a person's input inside it gives (a press on the page does not reach a frame of another
  // origin). Defense in depth, as above: what the page itself does is test/insert.py's to show.
  const ua = W.navigator && W.navigator.userActivation, isActive = ua && gopd(Object.getPrototypeOf(ua), 'isActive');
  const act = () => { try { return !isActive || apply(isActive.get, ua, []); } catch (e) { return false; } };
  const hold = (P, name) => {
    const d = P && gopd(P, name);
    if (!d || typeof d.value !== 'function') return;
    const fn = d.value;
    Object.defineProperty(P, name, { configurable: false, enumerable: d.enumerable, writable: false, value: function () { if (!act()) return undefined; return apply(fn, this, arguments); } });
  };
  for (const P of [W.HTMLElement, W.SVGElement, W.MathMLElement]) if (P) hold(P.prototype, 'focus');
  hold(W, 'focus');
  // (a label's click focuses its control; a dialog or a popover focuses what it holds; a
  // selection put in an editable element focuses it)
  if (W.HTMLLabelElement) Object.defineProperty(W.HTMLLabelElement.prototype, 'click', { configurable: false, writable: false, value: function () { if (act()) return apply(HTMLElement.prototype.click, this, []); } });
  if (W.HTMLDialogElement) { hold(W.HTMLDialogElement.prototype, 'show'); hold(W.HTMLDialogElement.prototype, 'showModal'); }
  hold(W.HTMLElement && W.HTMLElement.prototype, 'showPopover'); hold(W.HTMLElement && W.HTMLElement.prototype, 'togglePopover');
  for (const n of ['addRange', 'collapse', 'setPosition', 'setBaseAndExtent', 'selectAllChildren', 'extend', 'collapseToStart', 'collapseToEnd', 'modify']) hold(W.Selection && W.Selection.prototype, n);
  hold(W.Document && W.Document.prototype, 'execCommand');
}

// The page's only frames are the widgets' frames: srcdoc ones, which no frame-src refuses, or on
// the hosted page WIDGET_SHELL, a file of the page's own site. A frame's navigations answer to
// its parent's frame-src, so a policy of frame-src 'self' added to the page keeps a widget from
// taking its frame to a data: or blob: document of its own making (see widgetGuard); the page's
// own site holds only the page's files, and every one of them but WIDGET_SHELL refuses to be
// framed (frame-ancestors 'none'); WIDGET_SHELL only asks the page for the widget again. 'self'
// and not 'none', so the shell and a frame the host itself might add from its own site still
// load. The host sends the page's policy; a second one in a <meta> can only narrow it, and one
// added to the head by script applies from then on (to every frame made after it: this runs
// before any).
function framesOnlySrcdoc() {
  if (document.querySelector('meta[data-rikuy-frames]')) return;
  const m = document.createElement('meta');
  m.httpEquiv = 'Content-Security-Policy';
  m.content = "frame-src 'self'";
  m.dataset.rikuyFrames = '';
  document.head.append(m);
}

// The document the frame runs: the policy first, then widgetGuard, then the widget. The widget's
// own doctype goes, since ours must come first for the frame to be in standards mode; its <html>,
// <head> and <body> tags after ours are merged into ours by the HTML parser, as for any second
// such tag.
export function widgetDoc(html) {
  const body = String(html).replace(/^\uFEFF?\s*<!doctype[^>]*>/i, '');
  // DNS prefetching off as well (a link's host name looked up is a request out too); once off,
  // a document cannot turn it on again
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + WIDGET_CSP + '">' +
    '<meta http-equiv="x-dns-prefetch-control" content="off"><script>(' + widgetGuard + ')()</script></head>' + body;
}

// A short signature of a widget's text, for the page's block keys: a widget edited in the source
// pane is drawn again, and runs from its new text.
export function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

// The widget's file as the project keeps it, or null. TeX reads paths from the main file's
// folder, so a name is looked up there first, then from the project's top. Only .html files are
// widgets.
export function widgetPath(files, main, name) {
  name = String(name || '').trim();
  if (!/\.html?$/i.test(name)) return null;
  const dir = main && main.includes('/') ? main.slice(0, main.lastIndexOf('/') + 1) : '';
  for (const c of [dir + name, name]) {
    const p = normPath(c);
    if (p && files.has(p)) return p;
  }
  return null;
}

function normPath(p) {
  const out = [];
  for (const part of p.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.join('/');
}

// The paper's faces for a graph's frame, which has none of the page's fonts: KaTeX's Computer
// Modern roman and math italic, the faces the page sets math in and TeX the PDF's labels
// (src/graph.js mount). Read once from the page's style sheets: a data: address decoded (the
// page's policy fetches no data:), a file of the page's own fetched from beside it.
let FACES = null;
export function paperFaces() {
  if (FACES) return FACES;
  FACES = (async () => {
    const out = [];
    for (const sh of document.styleSheets) {
      let rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (r.type !== CSSRule.FONT_FACE_RULE) continue;
        const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(), st = r.style.getPropertyValue('font-style') || 'normal';
        if (!(fam === 'KaTeX_Main' && st === 'normal' || fam === 'KaTeX_Math' && st === 'italic') || !/^(normal|400|)$/.test(r.style.getPropertyValue('font-weight')) || out.some((f) => f.family === fam)) continue;
        const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(r.style.getPropertyValue('src'));
        if (!m) continue;
        try {
          let data;
          if (m[1].startsWith('data:')) { const b = atob(m[1].slice(m[1].indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); data = a.buffer; }
          else { const u = new URL(m[1], sh.href || document.baseURI); if (u.origin !== location.origin) continue; data = await (await fetch(u)).arrayBuffer(); }
          if (data.byteLength < 3e5) out.push({ family: fam, style: st, weight: '400', data });
        } catch (e) { /* the frame keeps its serif */ }
      }
    }
    return out;
  })();
  return FACES;
}
const darkPage = () => document.body.classList.contains('dark-page');
export function sendFaces(win, dark) {
  paperFaces().then((faces) => { try { win.postMessage({ rikuy: 'fonts', faces, dark: !!dark }, '*'); } catch (e) { /* gone */ } });
}

// The frames, over the boxes the text keeps for them. A frame taken out of the document and put
// back starts again from nothing, and the pages move and redraw their contents all the time (a
// caption typed into redraws its figure; pagination moves blocks between pages). So the frames
// live outside the pages, in one layer that never moves them, each laid over its box after every
// change to the pages. A widget keeps its state while the text around it, its caption, its
// options or the zoom change; only a change to its own file starts it again.
//
// Protocol, from the widget: parent.postMessage({rikuy: "height", px: <integer>}, "*") gives the
// height its content needs, in its own CSS pixels; {rikuy: "menu", x, y} asks for Rikuy's menu
// at that point of the frame (an interactive graph's right click or long press: the host opens it
// only for a graph, and at most once a second); {rikuy: "fonts"} asks for the paper's faces
// (answered four times at most: {rikuy: "fonts", faces: [{family, style, weight, data}], dark}),
// and {rikuy: "theme", dark} follows when View, Dark page changes; {rikuy: "touch"}, a tap in a
// graph, shows its buttons a while (above it: on a touch screen they wait for a tap). The page lays the widget out at the width the
// text has at 100 % zoom and scales it with the page, so a widget looks the same at any zoom, as a
// figure does. Messages are taken only from these frames' windows (a widget's origin is "null",
// as is every sandboxed frame's, so the window is what tells them apart).
export class WidgetLayer {
  // root: the pages, where the boxes are; layer: where the frames live. host gives
  // scale() (page pixels per widget pixel), text(path), maxHeight() in widget pixels,
  // resized(key) after a widget asked for another height, source(box, event) for the tab, and
  // allow() for the button over a widget from someone else (a box of class gated).
  constructor(root, layer, host) {
    this.root = root;
    this.layer = layer;
    this.host = host;
    this.frames = new Map();   // 'path:sig#n' -> { key, path, box, frame, ph }
    this.heights = new Map();  // 'path:sig' -> the height its widget last asked for
    this.byPath = new Map();   // path -> the same, so a widget edited keeps its size until it asks
    this.queued = false;
    framesOnlySrcdoc();
    window.addEventListener('message', (e) => this.onMessage(e));
    // the paper's colour, to every frame when View, Dark page changes
    let dark = darkPage();
    new MutationObserver(() => {
      if (darkPage() === dark) return;
      dark = !dark;
      for (const F of this.frames.values()) if (F.frame && F.frame.contentWindow) F.frame.contentWindow.postMessage({ rikuy: 'theme', dark }, '*');
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // the boxes move whenever the pages change: a new layout, a blank paragraph shown while
    // typing, a picture above that finished loading; and a box selected for deletion shows it on
    // its frame, which covers it
    new MutationObserver(() => this.placeSoon()).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    root.addEventListener('load', () => this.placeSoon(), true);
  }

  placeSoon() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.place(); });
  }

  // Lay each frame over its box; make the frames of new boxes; drop those whose box is gone.
  place() {
    const boxes = this.root.querySelectorAll('.w-live');
    if (!boxes.length && !this.frames.size) return;
    const base = this.layer.getBoundingClientRect();
    const s = this.host.scale();
    const count = new Map();
    const keep = new Set();
    for (const ph of boxes) {
      const gated = ph.classList.contains('gated');
      const key = (gated ? 'gate|' : '') + ph.dataset.w;
      const n = count.get(key) || 0;
      count.set(key, n + 1);
      const id = key + '#' + n;
      let F = this.frames.get(id);
      if (!F) {
        F = gated ? this.gate(ph) : this.make(ph.dataset.w, ph);
        if (!F) continue;
        this.frames.set(id, F);
      }
      keep.add(id);
      F.ph = ph;
      // (a box drawn again keeps showing the picture of a figure whose frame did not load)
      if (F.box.classList.contains('w-stalled') !== ph.classList.contains('w-stalled')) ph.classList.toggle('w-stalled', F.box.classList.contains('w-stalled'));
      F.box.classList.toggle('sel', ph.classList.contains('sel'));
      const r = ph.getBoundingClientRect();
      if (!r.width || !r.height) { F.box.hidden = true; continue; }
      const B = F.box.style;
      F.box.hidden = false;
      B.left = (r.left - base.left) + 'px';
      B.top = (r.top - base.top) + 'px';
      B.width = (r.width / s) + 'px';
      B.height = (r.height / s) + 'px';
      B.transform = Math.abs(s - 1) < 1e-4 ? '' : 'scale(' + s + ')';
      // the box's scale, so its buttons keep their size on the screen (44 px on a phone's page)
      B.setProperty('--ws', String(s));
    }
    for (const [id, F] of this.frames) if (!keep.has(id)) { F.box.remove(); this.frames.delete(id); }
  }

  make(key, ph) {
    const path = ph.dataset.wf;
    const html = this.host.text(path);
    // the file changed since this box was drawn: the build that follows draws a new one
    if (html == null || key !== path + ':' + hashText(html)) return null;
    const box = document.createElement('div');
    box.className = 'wbox';
    const fr = document.createElement('iframe');
    fr.className = 'rk-widget';
    // scripts and nothing else: without allow-same-origin the frame's origin is opaque, so it
    // reaches neither this page nor its storage; no popups, forms, top navigation or dialogs
    fr.setAttribute('sandbox', 'allow-scripts');
    fr.setAttribute('referrerpolicy', 'no-referrer');
    fr.title = 'Live figure ' + path;
    runWidget(fr, html);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'w-src';
    tab.textContent = 'LaTeX';
    tab.title = path + ': its \\rikuywidget command (Alt+click: show it in the source)';
    const F = { key, path, box, frame: fr, ph };
    tab.addEventListener('mousedown', (e) => { e.preventDefault(); this.host.source(F.ph, e); });
    // from the keyboard (Tab to it, Enter): a click with no mouse behind it
    tab.addEventListener('click', (e) => { if (!e.detail) this.host.source(F.ph, e); });
    box.append(fr, tab);
    this.layer.append(box);
    // (an interactive graph adds its Edit graph button: src/cmd/insert.js)
    if (this.host.decorate) this.host.decorate(F);
    // a shell that never asks for its widget: the figure's picture shows instead, and the page
    // says why (and runs it after all if the shell comes late)
    if (SHELL) {
      const stall = (on) => { F.box.classList.toggle('w-stalled', on); if (F.ph) F.ph.classList.toggle('w-stalled', on); };
      fr.addEventListener('rikuy-shell', () => stall(false));
      setTimeout(() => { if (fr.isConnected && !asked.has(fr)) { stall(true); if (this.host.stalled) this.host.stalled(F); } }, SHELL_WAIT);
    }
    return F;
  }

  // A widget from someone else, not allowed yet: its box shows the fallback, and this lays a
  // button over it. Clicks elsewhere go through to the box, which opens its command as a
  // figure's does.
  gate(ph) {
    const box = document.createElement('div');
    box.className = 'wbox wgate';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'w-run';
    b.textContent = 'Run live figures';
    b.title = 'This document came from someone else. Its widgets run sandboxed, with no access to this page or your files; run them?';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => this.host.allow());
    box.append(b);
    this.layer.append(box);
    return { key: null, path: ph.dataset.wf, box, frame: null, ph };
  }

  onMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object' || !/^(height|menu|fonts|touch)$/.test(d.rikuy) || !e.source) return;
    let F = null;
    for (const x of this.frames.values()) if (x.frame && x.frame.contentWindow === e.source) { F = x; break; }
    if (!F) return;
    if (d.rikuy === 'fonts') { F.fonts = (F.fonts || 0) + 1; if (F.fonts <= 4) sendFaces(e.source, darkPage()); return; }
    if (d.rikuy === 'touch') {
      F.box.classList.add('wtouch');
      clearTimeout(F.touched);
      F.touched = setTimeout(() => F.box.classList.remove('wtouch'), 5000);
      return;
    }
    // a right click or long press in the frame: the host decides whether a menu opens
    if (d.rikuy === 'menu') { if (this.host.menu) this.host.menu(F, d.x, d.y); return; }
    const px = Math.round(Number(d.px));
    if (!Number.isFinite(px) || px <= 0) return;
    // no taller than a page's text: a widget that grows with its frame stops there
    const h = Math.max(24, Math.min(px, Math.floor(this.host.maxHeight())));
    if (this.heights.get(F.key) === h) return;
    this.heights.set(F.key, h);
    this.byPath.set(F.path, h);
    this.host.resized(F.key);
  }
}
