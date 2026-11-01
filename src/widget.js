// Live figures: \rikuywidget[<includegraphics options>]{<widget.html>}{<fallback image>} from
// rikuy.sty. Every TeX (the PDF pane, Overleaf, a desktop TeX Live) prints the fallback image; the
// typeset page runs the widget, a self contained HTML file of the project. The text holds a box
// of the widget's size (render.js, class w-live), and the widget runs in a frame laid over that
// box (WidgetLayer). docs/ARCHITECTURE.md, "Live figures", says why it runs this way.

// What a widget may use: its own inline script and style, and pictures, fonts and workers it
// carries as data. No connection, frame, form or file from anywhere: a widget arrives inside
// documents from anyone, and a request out would tell its author who reads them, and when. The
// page's own policy applies as well (a srcdoc frame inherits it: on the artifact host, and in
// test/serve.py, it allows inline scripts); this one is added inside the frame, before any of
// the widget's markup is read, and policies only ever add restrictions to each other. WebRTC is
// the one way out no policy closes in Chromium (it ignores CSP's webrtc directive), which is why
// widgets from someone else wait for a click (App.widgetsAllowed).
export const WIDGET_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:; base-uri 'none'; form-action 'none'";

// The document the frame runs: the policy first, then the widget. The widget's own doctype goes,
// since ours must come first for the frame to be in standards mode; its <html>, <head> and
// <body> tags after ours are merged into ours by the HTML parser, as for any second such tag.
export function widgetDoc(html) {
  const body = String(html).replace(/^\uFEFF?\s*<!doctype[^>]*>/i, '');
  // DNS prefetching off as well (a link's host name looked up is a request out too); once off,
  // a document cannot turn it on again
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + WIDGET_CSP + '">' +
    '<meta http-equiv="x-dns-prefetch-control" content="off"></head>' + body;
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

// The frames, over the boxes the text keeps for them. A frame taken out of the document and put
// back starts again from nothing, and the pages move and redraw their contents all the time (a
// caption typed into redraws its figure; pagination moves blocks between pages). So the frames
// live outside the pages, in one layer that never moves them, each laid over its box after every
// change to the pages. A widget keeps its state while the text around it, its caption, its
// options or the zoom change; only a change to its own file starts it again.
//
// Protocol, from the widget: parent.postMessage({rikuy: "height", px: <integer>}, "*") gives the
// height its content needs, in its own CSS pixels. The page lays the widget out at the width the
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
    window.addEventListener('message', (e) => this.onMessage(e));
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
    fr.srcdoc = widgetDoc(html);
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
    if (!d || typeof d !== 'object' || d.rikuy !== 'height' || !e.source) return;
    let F = null;
    for (const x of this.frames.values()) if (x.frame && x.frame.contentWindow === e.source) { F = x; break; }
    if (!F) return;
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
