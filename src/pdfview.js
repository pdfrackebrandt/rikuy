// The compiled PDF, shown with PDF.js, plus SyncTeX both ways: click the PDF to find the
// source line, or ask where a source line landed in the PDF.

let pdfjsP = null;

export function loadPdfjs(workerUrl) {
  if (!pdfjsP) {
    // pdf.js ships beside its worker (build.mjs copies both from package-lock.json's pdfjs-dist):
    // a module import() takes no integrity hash, so from a CDN it would run whatever the CDN
    // answered as this page, with every project and the git tokens in reach
    const u = new URL('pdf.min.mjs', workerUrl).href;
    pdfjsP = import(u).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    });
    pdfjsP.catch(() => { pdfjsP = null; });
  }
  return pdfjsP;
}

export class PdfView {
  constructor(host, opts) {
    this.host = host; // scrolling element
    this.opts = opts; // { workerUrl, onClickSource(file, line) }
    this.doc = null;
    this.pages = [];
    this.sync = null;
    this.syncGz = null; // SyncTeX as TeX wrote it, until something asks where a line is
    this.syncP = null;
    this.scale = 1;
    this.renderSeq = 0;
    this.io = null;
    this.worker = null; // PDF.js's worker, kept from one PDF to the next
    this.queue = []; // pages waiting to be drawn, those in view first
    this.drawing = false;
  }

  // PDF.js starts a worker of its own for every document it opens: 80 ms of each compile's
  // wait, for a worker that does the same work as the last. One is kept; a PDF it cannot open
  // is tried once more on a new one, so a worker that broke does not stay.
  async open(lib, bytes) {
    for (let k = 0; ; k++) {
      let own = null;
      try { if (!this.worker || this.worker.destroyed) this.worker = new lib.PDFWorker(); own = this.worker; } catch (e) { this.worker = null; }
      try {
        // PDF.js takes ownership of the buffer it is given (it moves it to its worker): give it a copy
        return await lib.getDocument(Object.assign({ data: bytes.slice(), isEvalSupported: false }, own ? { worker: own } : {})).promise;
      } catch (e) {
        if (own) { try { own.destroy(); } catch (e2) { /* gone */ } if (this.worker === own) this.worker = null; }
        if (k > 0 || !own) throw e;
      }
    }
  }

  // pdf.js and its worker's script ahead of the first PDF, while TeX typesets and the line is
  // free: fetched only once TeX was done, they were half a megabyte and three round trips that
  // the first PDF still waited for. (Where a service worker keeps them, this costs nothing.)
  warm() {
    loadPdfjs(this.opts.workerUrl).catch(() => {});
    fetch(this.opts.workerUrl).then((r) => r.arrayBuffer()).catch(() => {});
  }

  async show(bytes, synctexGz) {
    const lib = await loadPdfjs(this.opts.workerUrl);
    const seq = ++this.renderSeq;
    const keepTop = this.host.scrollTop, keepH = this.host.scrollHeight || 1;
    const doc = await this.open(lib, bytes);
    if (seq !== this.renderSeq) { doc.destroy(); return; }
    if (this.doc) this.doc.destroy();
    this.doc = doc;
    // SyncTeX is read after the pages in view are drawn, or when a click asks for it before
    // that (whenSync): unpacking and reading it took 50 to 300 ms before any page showed
    this.sync = null; this.syncP = null;
    this.syncGz = synctexGz || null;
    const wrap = document.createElement('div');
    wrap.className = 'pdf-pages';
    const width = Math.max(200, (this.host.clientWidth || 640) - 24);
    this.pages = [];
    this.queue = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      if (seq !== this.renderSeq) return;
      const vp1 = page.getViewport({ scale: 1 });
      const scale = width / vp1.width;
      const vp = page.getViewport({ scale });
      const box = document.createElement('div');
      box.className = 'pdf-page';
      box.style.width = vp.width + 'px';
      box.style.height = vp.height + 'px';
      box.dataset.page = String(n);
      const canvas = document.createElement('canvas');
      box.appendChild(canvas);
      wrap.appendChild(box);
      this.pages.push({ n, page, vp, scale, box, canvas, drawn: false, w1: vp1.width, h1: vp1.height });
      box.addEventListener('click', (e) => this.clickAt(n, e));
    }
    this.host.replaceChildren(wrap);
    this.host.scrollTop = keepTop * (this.host.scrollHeight / keepH);
    if (this.io) this.io.disconnect();
    this.io = new IntersectionObserver((ents) => {
      const pages = this.pages;
      for (const en of ents) if (en.isIntersecting) this.draw(pages[+en.target.dataset.page - 1]);
    }, { root: this.host, rootMargin: '600px 0px' });
    for (const p of this.pages) this.io.observe(p.box);
    return doc.numPages;
  }

  // Pages are drawn one at a time, a page in view before one near it: two drawn at once (the
  // one in view and the next, which the 600 px margin takes in) each waited for the other.
  draw(p) {
    if (!p || p.drawn) return p ? p.done : undefined;
    p.drawn = true;
    p.done = new Promise((resolve) => { p.resolve = resolve; });
    this.queue.push(p);
    this.pump();
    return p.done;
  }

  inView(p) {
    const a = p.box.getBoundingClientRect(), b = this.host.getBoundingClientRect();
    return a.bottom > b.top && a.top < b.bottom;
  }

  async pump() {
    if (this.drawing) return;
    this.drawing = true;
    try {
      while (this.queue.length) {
        let i = this.queue.findIndex((p) => this.pages.includes(p) && this.inView(p));
        if (i < 0) i = 0;
        const p = this.queue.splice(i, 1)[0];
        if (this.pages.includes(p)) await this.paint(p); // (a page of a PDF since replaced is not drawn)
        p.resolve();
      }
    } finally { this.drawing = false; }
    // nothing left to draw: now the SyncTeX of this PDF, so the first click finds it read
    if (this.syncGz && !this.syncP) setTimeout(() => { if (!this.queue.length) this.whenSync(); }, 0);
  }

  async paint(p) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const vp = p.page.getViewport({ scale: p.scale * dpr });
    p.canvas.width = Math.floor(vp.width);
    p.canvas.height = Math.floor(vp.height);
    p.canvas.style.width = p.vp.width + 'px';
    p.canvas.style.height = p.vp.height + 'px';
    try { await p.page.render({ canvasContext: p.canvas.getContext('2d'), viewport: vp }).promise; } catch (e) { p.drawn = false; }
  }

  // The SyncTeX of the PDF shown, read the first time it is asked for (null when TeX wrote none).
  whenSync() {
    if (!this.syncP) {
      const gz = this.syncGz;
      this.syncP = (gz ? parseSynctex(gz).catch(() => null) : Promise.resolve(null)).then((s) => { if (this.syncGz === gz) this.sync = s; return s; });
    }
    return this.syncP;
  }

  async clickAt(n, e) {
    if (!this.opts.onClickSource) return;
    const p = this.pages[n - 1];
    const r = p.box.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * p.w1;
    const y = ((e.clientY - r.top) / r.height) * p.h1;
    const sync = await this.whenSync();
    if (!sync || this.pages[n - 1] !== p) return; // (another PDF came meanwhile)
    const hit = sync.at(n, x, y);
    if (hit) this.opts.onClickSource(hit.file, hit.line);
  }

  // Scroll to where file:line was typeset and mark it briefly. False when this PDF has no
  // SyncTeX; with it still unread, the mark comes once it is read.
  reveal(file, line) {
    if (!this.sync) {
      if (!this.syncGz) return false;
      const doc = this.doc;
      this.whenSync().then((s) => { if (s && this.doc === doc && this.sync === s) this.reveal(file, line); });
      return true;
    }
    const hit = this.sync.where(file, line);
    if (!hit) return false;
    const p = this.pages[hit.page - 1];
    if (!p) return false;
    const k = p.box.clientHeight / p.h1;
    const top = p.box.getBoundingClientRect().top - this.host.getBoundingClientRect().top + this.host.scrollTop + hit.y * k;
    this.host.scrollTo({ top: Math.max(0, top - this.host.clientHeight / 3), behavior: 'smooth' });
    const m = document.createElement('div');
    m.className = 'pdf-mark';
    m.style.top = (hit.y - hit.h) * k + 'px';
    m.style.height = Math.max(8, (hit.h + hit.d) * k) + 'px';
    p.box.appendChild(m);
    setTimeout(() => m.remove(), 1600);
    return true;
  }

  clear() {
    if (this.doc) this.doc.destroy();
    this.doc = null; this.pages = []; this.sync = null; this.syncGz = null; this.syncP = null; this.queue = [];
    if (this.io) this.io.disconnect();
    this.host.replaceChildren();
  }
}

// ---- SyncTeX ---------------------------------------------------------------------------
// Records: [ ( vbox/hbox opening with tag,line:x,y:W,H,D ; h/v box ; x k g $ points.
// Units are TeX scaled points times the file's Unit, measured from the page's top left
// corner; PDF.js works in big points.
async function parseSynctex(gz) {
  const s = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(s).text();
  const lines = text.split('\n');
  const inputs = new Map();
  let unit = 1, xoff = 0, yoff = 0, mag = 1000;
  const recs = []; // [page, tag, line, x, y, w, h, d, kind]
  let page = 0;
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('Input:')) { const m = /^Input:(\d+):(.*)$/.exec(l); if (m) inputs.set(+m[1], m[2]); }
    else if (l.startsWith('Unit:')) unit = +l.slice(5) || 1;
    else if (l.startsWith('X Offset:')) xoff = +l.slice(9) || 0;
    else if (l.startsWith('Y Offset:')) yoff = +l.slice(9) || 0;
    else if (l.startsWith('Magnification:')) mag = +l.slice(14) || 1000;
    else if (l.startsWith('Content:')) { i++; break; }
  }
  const re = /^([[(hvxkg$])(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?/;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const c = l.charCodeAt(0);
    if (c === 123) { page = +l.slice(1); continue; } // {
    if (l.startsWith('Input:')) { const m = /^Input:(\d+):(.*)$/.exec(l); if (m) inputs.set(+m[1], m[2]); continue; }
    const m = re.exec(l);
    if (!m) continue;
    recs.push([page, +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0, m[7] ? +m[7] : 0, m[8] ? +m[8] : 0, m[1]]);
  }
  const k = (unit * mag / 1000) / 65536 * (72 / 72.27); // scaled points to big points
  const toBp = (v, off) => (v + off) * k;
  const norm = (f) => String(f || '').replace(/^\/home\/web_user\/project\/[^/]+\//, '').replace(/^\.\//, '').replace(/\/\.\//g, '/');
  const files = new Map([...inputs].map(([t, f]) => [t, norm(f)]));
  return {
    // The smallest box under the point gives the line of text; inside it the nearest glue,
    // kern or math record gives the source line (a paragraph's line boxes carry the line
    // where the paragraph ended, its glue carries the line each word came from).
    at(pageNo, x, y) {
      let box = null, boxArea = Infinity;
      for (const r of recs) {
        if (r[0] !== pageNo || !(r[8] === 'h' || r[8] === '(' || r[8] === '[') || r[5] <= 0) continue;
        const rx = toBp(r[3], xoff), ry = toBp(r[4], yoff);
        const w = r[5] * k, h = r[6] * k, d = r[7] * k;
        if (x >= rx && x <= rx + w && y >= ry - h - 1 && y <= ry + d + 1) {
          const area = w * (h + d);
          if (area < boxArea) { boxArea = area; box = { r, rx, ry, w, h, d }; }
        }
      }
      let best = null, bestScore = Infinity;
      for (const r of recs) {
        if (r[0] !== pageNo || !'xkg$'.includes(r[8])) continue;
        const rx = toBp(r[3], xoff), ry = toBp(r[4], yoff);
        if (box && (ry < box.ry - box.h - 2 || ry > box.ry + box.d + 2 || rx < box.rx - 2 || rx > box.rx + box.w + 2)) continue;
        const score = Math.abs(x - rx) + Math.abs(y - ry) * 3;
        if (score < bestScore) { bestScore = score; best = r; }
      }
      if (!box && bestScore > 60) best = null;
      const hit = best || (box && box.r);
      if (!hit) return null;
      return { file: files.get(hit[1]) || null, line: hit[2] };
    },
    where(file, line) {
      const want = norm(file);
      let tag = null;
      for (const [t, f] of files) if (f === want || f.endsWith('/' + want) || want.endsWith('/' + f)) { tag = t; break; }
      if (tag == null) return null;
      let best = null, bestD = Infinity;
      for (const r of recs) {
        if (r[1] !== tag) continue;
        const dl = Math.abs(r[2] - line) * 1000 + (r[8] === 'h' ? 0 : 1);
        if (dl < bestD) { bestD = dl; best = r; }
      }
      if (!best) return null;
      return { page: best[0], x: toBp(best[3], xoff), y: toBp(best[4], yoff), h: (best[6] || 8 * 65536) * k, d: best[7] * k };
    }
  };
}
