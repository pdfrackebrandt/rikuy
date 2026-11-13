// Rikuy layout: measure flow items once, paginate arithmetically, and
// touch only the pages whose contents changed.

import { clusterEdge } from './editor.js';
import { BASE_COLORS, DVIPS_COLORS } from './ui/kit.js';

const EPS = 1.5;
const IN = 72.27;
// letters of scripts that are hyphened where a word is cut
const HYPHENED = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Georgian}]/u;

// The page as LaTeX lays it out (pt): the paper (its size by name or given, turned for
// landscape), the text block and where it sits, the head and the foot, the columns. With geometry
// loaded its keys decide as geometry does (a margin given alone keeps the other at its default,
// the text block is 0.7 of the paper where nothing says otherwise, the rest split 1:1 across and
// 2:3 down, 2:3 inside to outside on two sided pages); without it the standard classes' own
// sums (size10.clo and its like). test/page.test.mjs holds these against TeX's own numbers.
const PAPERS = { a0: [2383.94, 3370.39], a1: [1683.78, 2383.94], a2: [1193.48, 1683.78], a3: [845.05, 1193.48], a4: [597.51, 845.05], a5: [421.10, 597.51], a6: [298.75, 421.10],
  b0: [2845.28, 4023.21], b1: [2011.61, 2845.28], b2: [1422.64, 2011.61], b3: [1004.38, 1422.64], b4: [711.32, 1004.38], b5: [500.77, 711.32], b6: [355.66, 500.77],
  letter: [614.295, 794.97], legal: [614.295, 1011.78], executive: [523.96, 758.84] };
const UNITS = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, dd: 1238 / 1157, cc: 12 * 1238 / 1157, sp: 1 / 65536 };
function len(v, rel) {
  if (v == null || v === true) return null;
  const m = /^\s*\{?\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|\\paperwidth|\\paperheight)?\s*\}?\s*$/.exec(String(v).slice(0, 60));
  if (!m) return null;
  const x = parseFloat(m[1]), u = m[2] || 'pt';
  if (u[0] === '\\') return rel ? x * (u === '\\paperheight' ? rel.h : rel.w) : null;
  return x * UNITS[u];
}
// {a,b} or a: the two of a pair (hmargin={1cm,2cm})
function pair(v) {
  if (v == null || v === true) return [null, null];
  const t = String(v).trim().replace(/^\{|\}$/g, '');
  const k = t.indexOf(',');
  return k < 0 ? [t, t] : [t.slice(0, k), t.slice(k + 1)];
}
const ratioOf = (v, d) => { const m = /^\{?(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(String(v || '').slice(0, 40).replace(/\s+/g, '')); return m && +m[1] + +m[2] > 0 ? +m[1] / (+m[1] + +m[2]) : d; };
const trunc = (x) => (x < 0 ? Math.ceil(x) : Math.floor(x));
export function paperSize(opts) {
  const geo = opts.geo || {};
  let w, h;
  const named = Object.keys(geo).map((k) => /^([a-c][0-6]|letter|legal|executive)paper$/.exec(k)).filter(Boolean).pop();
  const pn = geo.paper || geo.papername;
  const name = named ? named[1] : pn ? String(pn).replace(/paper$/, '') : opts.paper;
  [w, h] = PAPERS[name] || PAPERS.letter;
  const pw = len(geo.paperwidth), ph = len(geo.paperheight);
  if (geo.papersize) { const [a, b] = pair(geo.papersize); if (len(a) && len(b)) { w = len(a); h = len(b); } }
  if (pw) w = pw;
  if (ph) h = ph;
  const land = geo.landscape === true || (opts.landscape && geo.portrait !== true);
  if (land && h > w) [w, h] = [h, w];
  return { w, h, land: !!land };
}

export function geometry(opts) {
  const pt = opts.pt || 10;
  const bs = { 10: 12, 11: 13.6, 12: 14.5 }[pt] || 12;
  const tw0 = { 10: 345, 11: 360, 12: 390 }[pt] || 345;
  const P = paperSize(opts);
  const geo = opts.geo || {};
  const cols = opts.twocolumn ? 2 : 1;
  const two = geo.twoside === true || (!!opts.twoside && geo.asymmetric !== true);
  let hh = 12, hs = 25, fs = 30;
  if (len(geo.headheight) != null) hh = len(geo.headheight);
  if (len(geo.headsep) != null) hs = len(geo.headsep);
  if (len(geo.footskip) != null) fs = len(geo.footskip);
  if (geo.nohead || geo.noheadfoot) { hh = 0; hs = 0; }
  if (geo.nofoot || geo.noheadfoot) fs = 0;
  let tw, th, ml, mlE, mt;
  if (opts.geometry) {
    const rel = { w: P.w, h: P.h };
    const L = (v) => len(v, rel);
    const b = L(geo.bindingoffset) || 0;
    const [mh, mv] = pair(geo.margin);
    const [hl, hr] = pair(geo.hmargin), [vt, vb] = pair(geo.vmargin);
    const first = (...v) => { for (const x of v) { const y = L(x); if (y != null) return y; } return null; };
    let left = first(geo.left, geo.lmargin, geo.inner, hl, mh), right = first(geo.right, geo.rmargin, geo.outer, hr, mh);
    let top = first(geo.top, geo.tmargin, vt, mv), bottom = first(geo.bottom, geo.bmargin, vb, mv);
    const [bw, bh] = pair(geo.body || geo.text);
    let width = first(geo.textwidth, geo.width, bw);
    let height = first(geo.textheight, geo.height, bh);
    if (height == null && geo.lines && /^\d+$/.test(String(geo.lines).trim())) height = (+geo.lines - 1) * bs * (opts.spread || 1) + pt;
    const [sh, sv] = pair(geo.scale);
    const hscale = parseFloat(geo.hscale) || parseFloat(sh) || 0.7, vscale = parseFloat(geo.vscale) || parseFloat(sv) || 0.7;
    const hr0 = geo.centering || geo.hcentering ? 0.5 : ratioOf(geo.hmarginratio || pair(geo.marginratio)[0] || pair(geo.ratio)[0], two ? 0.4 : 0.5);
    const vr0 = geo.centering || geo.vcentering ? 0.5 : ratioOf(geo.vmarginratio || pair(geo.marginratio)[1] || pair(geo.ratio)[1], 0.4);
    // across
    const W = P.w - b;
    const solve = (A, a, z, size, scale, r, base, given) => {
      if (size != null && a != null) return [a, size, A - a - size];
      if (size != null && z != null) return [A - z - size, size, z];
      if (a != null && z != null) return [a, A - a - z, z];
      if (size != null) return [(A - size) * r, size, (A - size) * (1 - r)];
      const s0 = scale * base, d = [(A - s0) * r, s0, (A - s0) * (1 - r)];
      // (one margin alone: the other by the ratio where one is given, else the first of the
      // defaults, as geometry 5 does)
      if (a != null) { const o = given ? a * (1 - r) / r : d[0]; return [a, A - a - o, o]; }
      if (z != null) { const o = given ? z * r / (1 - r) : d[0]; return [o, A - o - z, z]; }
      return d;
    };
    const [l, w, r] = solve(W, left, right, width, hscale, hr0, P.w, !!(geo.hmarginratio || geo.marginratio || geo.ratio));
    tw = w; ml = b + l; mlE = two ? r : b + l;
    // down: the body holds the head and the foot where geometry is told to include them
    const incH = geo.includehead || geo.includeheadfoot || geo.includeall, incF = geo.includefoot || geo.includeheadfoot || geo.includeall;
    const extra = (incH ? hh + hs : 0) + (incF ? fs : 0);
    const [t, bd] = solve(P.h, top, bottom, height != null ? height + extra : null, vscale, vr0, P.h, !!(geo.vmarginratio || geo.marginratio || geo.ratio));
    th = bd - extra; mt = t + (incH ? hh + hs : 0);
  } else if (opts.margins) {
    const M = opts.margins;
    tw = P.w - M.l - M.r; th = P.h - M.t - M.b; ml = mlE = M.l; mt = M.t;
  } else {
    // the standard classes: the text block from the base size, the margins from the paper
    tw = Math.min(P.w - 2 * IN, tw0 * cols);
    tw = trunc(tw);
    th = Math.floor((P.h - 3.5 * IN) / bs) * bs + pt;
    if (two) { ml = IN + trunc(0.4 * (P.w - tw) - IN); mlE = IN + trunc(0.6 * (P.w - tw) - IN); }
    else ml = mlE = IN + trunc((P.w - tw) / 2 - IN);
    const topmargin = trunc((P.h - 2 * IN - hh - hs - th - fs) / 2);
    mt = IN + topmargin + hh + hs;
  }
  const pg = opts.page || {};
  const colsep = pg.colsep != null ? pg.colsep : len(geo.columnsep) != null ? len(geo.columnsep) : pt === 10 ? 10 : 10;
  // (hyphenation rides along: a change of it measures the lines again, src/app.js layoutPass)
  return { pw: P.w, ph: P.h, ml, mlE, mt, tw, th, footskip: fs, headsep: hs, headheight: hh, bs, pt, cols, twoside: two, colsep, colrule: pg.colrule || 0, land: P.land, hyph: pg.hyph || 'auto' };
}

export class Layout {
  constructor(root, host) {
    this.root = root;     // contenteditable container of pages
    this.host = host;     // hidden measuring flow
    this.pages = [];      // [{el, flow, fns, folio, sig}]
    this.px = 1.33;
    this.g = null;
    this.planCache = null;
    this.hosts = new Map(); // measuring flows as wide as a column, by the number of columns
    this.page = {};       // the page's set up beyond its size (model.opts.page: src/pagesrc.js)
  }

  setGeometry(g, px, sheet, sizes, opts) {
    this.g = g;
    this.px = px;
    this.opts = opts;
    this.page = opts.page || {};
    const S = sheet.style;
    const lh = g.bs * (opts.spread || 1);
    S.setProperty('--pt', px);
    S.setProperty('--fs', (g.pt * px) + 'px');
    S.setProperty('--lh', (lh * px) + 'px');
    S.setProperty('--lhr', (lh / g.pt).toFixed(4));
    S.setProperty('--pw', (g.pw * px) + 'px');
    S.setProperty('--ph', (g.ph * px) + 'px');
    S.setProperty('--ml', (g.ml * px) + 'px');
    // (a two sided document's even pages have the outer margin on the left)
    S.setProperty('--mle', ((g.mlE ?? g.ml) * px) + 'px');
    S.setProperty('--mt', (g.mt * px) + 'px');
    S.setProperty('--tw', (g.tw * px) + 'px');
    S.setProperty('--th', (g.th * px) + 'px');
    S.setProperty('--footskip', (g.footskip * px) + 'px');
    S.setProperty('--headsep', ((g.headsep ?? 25) * px) + 'px');
    S.setProperty('--colsep', ((g.colsep ?? 10) * px) + 'px');
    S.setProperty('--colrule', ((g.colrule || 0) * px) + 'px');
    S.setProperty('--parindent', ((opts.parindent ?? 15) * px) + 'px');
    for (const [k, v] of Object.entries(sizes)) S.setProperty('--z-' + k, v);
    const fnRatio = sizes.footnotesize;
    S.setProperty('--fnlh', ({ 10: 9.5, 11: 11, 12: 12 }[g.pt] || 9.5) / (g.pt * fnRatio));
    // \usepackage[none]{hyphenat}: the page breaks no word either
    sheet.classList.toggle('nohyph', this.page.hyph === 'none');
    for (const h of this.hosts.values()) h.remove();
    this.hosts.clear();
    for (const p of this.pages) p.sig = null;
  }

  // ---- columns ----------------------------------------------------------------------------
  // How many columns an item is set in: its multicols', else the document's (twocolumn), but the
  // title and a float of the page's width (figure*) run across
  colsOf(it) {
    if (it.cols > 1) return it.cols;
    if (this.g && this.g.cols > 1 && !spans(it)) return this.g.cols;
    return 1;
  }
  colW(k) { return (this.g.tw - (k - 1) * (this.g.colsep ?? 10)) / k; }
  hostFor(k) {
    if (k <= 1) return this.host.flow;
    let h = this.hosts.get(k);
    if (!h || !h.isConnected) {
      h = document.createElement('div');
      h.className = 'flow mcol';
      h.style.width = (this.colW(k) * this.px) + 'px';
      this.host.flow.parentNode.appendChild(h);
      this.hosts.set(k, h);
    }
    return h;
  }

  // Measure items (and their footnotes) that lack metrics.
  measure(items, fns) {
    const host = this.host;
    const todo = items.filter((it) => !it.measured);
    const fnTodo = fns.filter((f) => !f.measured);
    if (!todo.length && !fnTodo.length) return;
    const frags = new Map();
    for (const it of todo) {
      it.el.style.marginTop = '';
      const k = this.colsOf(it);
      if (!frags.has(k)) frags.set(k, document.createDocumentFragment());
      frags.get(k).appendChild(it.el);
    }
    for (const [k, f] of frags) this.hostFor(k).appendChild(f);
    const ffrag = document.createDocumentFragment();
    for (const f of fnTodo) ffrag.appendChild(f.el);
    host.fns.appendChild(ffrag);
    for (const it of todo) {
      const r = it.el.getBoundingClientRect();
      it.h = r.height;
      it.lines = it.rowSplit ? rowBoxes(it.el, r.top, r.height) : it.splittable ? lineBoxes(it.el, r.top, r.height) : null;
      if (it.lines && it.lines.length < 2) it.lines = null;
      it.fnLine = [];
      if (it.fnIdx && it.fnIdx.length) {
        const marks = it.el.querySelectorAll('.fnm');
        for (const m of marks) {
          const mr = m.getBoundingClientRect();
          const cy = (mr.top + mr.bottom) / 2 - r.top;
          let li = 0;
          if (it.lines) for (let k = 0; k < it.lines.length; k++) if (cy >= it.lines[k].t) li = k;
          it.fnLine.push(li);
        }
      }
      it.sb = (it.sbEm || 0) * this.g.pt * this.px;
      it.measured = true;
      it.pieces = null;
      // a picture not loaded yet was measured at no height: the item is measured again when it
      // loads (App, the sheet's load listener)
      it.late = null;
      for (const im of it.el.querySelectorAll('img')) if (!im.complete) (it.late || (it.late = new Set())).add(im);
    }
    for (const f of fnTodo) { f.h = f.el.getBoundingClientRect().height + 1; f.measured = true; }
  }

  // Items whose size changed after they were placed (a live figure that asked for a height):
  // measured again, and their pages rewritten even if the plan keeps them where they were, since
  // measuring takes an item out of its page.
  invalidate(its) {
    for (const it of its) { it.measured = false; it.pieces = null; }
    for (const P of this.pages) if (P.entries && P.entries.some((e) => its.includes(e.it))) P.sig = null;
  }

  // Pure pagination over measured items. A page: { entries, fns, used, fnH, marks, bands } and,
  // once closed, its number (num, fmt) and style. Paragraphs in columns (a two column document,
  // multicols) are set in bands of columns: filled one after another and, in multicols, balanced
  // where the environment ends on the page.
  plan(items) {
    const H = this.g.th * this.px;
    const fnSep = this.g.pt * 1.1 * this.px;
    const two = !!this.g.twoside;
    const pages = [];
    let page = null;
    const deferred = [];
    const cnt = { num: 1, fmt: 'arabic', style: this.page.style || 'plain' };
    const newPage = () => { page = { entries: [], fns: [], used: 0, fnH: 0, marks: [] }; };
    const avail = () => H - page.used - page.fnH;
    const fnCost = (list) => (list.length ? (page.fns.length ? 0 : fnSep) + list.reduce((s, f) => s + f.h, 0) : 0);
    const pieceH = (it, a, b) => {
      const top = a === 0 || !it.lines ? 0 : it.lines[a].t;
      const bot = b == null || !it.lines ? it.h : it.lines[b].t;
      return bot - top;
    };
    const fnsOf = (it, a, b) => {
      if (!it.fnIdx || !it.fnIdx.length) return [];
      const out = [];
      it.fnIdx.forEach((fi, j) => {
        const line = it.fnLine[j] ?? 0;
        if (line >= a && (b == null || line < b)) { const f = it.block.fns[fi]; if (f) out.push(f); }
      });
      return out;
    };
    const markOf = (it) => {
      // the title's page and a chapter's first page take the plain style, as \maketitle and
      // \chapter say
      if (it.kind === 'title' || (it.kind === 'h' && it.level === 0)) page.marks.push({ thisStyle: 'plain' });
    };
    const put = (it, a, b, sb) => {
      const fl = fnsOf(it, a, b);
      const cost = fnCost(fl);
      page.entries.push({ it, a, b, sb });
      page.used += sb + pieceH(it, a, b);
      page.fns.push(...fl);
      page.fnH += cost;
      if (a === 0) markOf(it);
    };
    // its number and style, from the marks on it (\pagenumbering starts again at 1)
    const number = (pg) => {
      for (const m of pg.marks) {
        if (m.numbering) { cnt.fmt = m.numbering; cnt.num = 1; }
        if (m.page != null) cnt.num = m.page;
        if (m.style) cnt.style = m.style;
        if (m.thisStyle) pg.thisStyle = m.thisStyle;
      }
      pg.num = cnt.num; pg.fmt = cnt.fmt; pg.style = cnt.style;
      cnt.num++;
    };
    const close = () => {
      number(page);
      pages.push(page);
      newPage();
      while (deferred.length) {
        const f = deferred[0];
        const sb = page.entries.length ? f.sb : 0;
        if (sb + f.h + fnCost(fnsOf(f, 0, null)) <= avail() + EPS || !page.entries.length) { put(f, 0, null, sb); deferred.shift(); }
        else break;
      }
    };
    // \cleardoublepage in a two sided document: the next page is odd, with a blank one before it
    const toOdd = () => {
      if (!two || cnt.num % 2) return;
      const b = { entries: [], fns: [], used: 0, fnH: 0, marks: [], blank: true };
      number(b);
      pages.push(b);
    };
    // ---- bands of columns ----
    // the run of items set in k columns from items[i]: [i, j)
    const runEnd = (i, k, region) => {
      let j = i + 1, last = i;
      for (; j < items.length; j++) {
        const x = items[j];
        if (x.kind === 'break' || x.kind === 'mark') continue;
        if (this.colsOf(x) !== k || (x.region || null) !== region) break;
        last = j;
      }
      return last + 1;
    };
    // Fill k columns of height T from pos ({ i, a } in run): { cols, hs, end, done, page (a page break ended it) }
    const fill = (run, pos, k, T) => {
      const cols = [], hs = [];
      let i = pos.i, a = pos.a, pageBreak = false;
      for (let c = 0; c < k; c++) {
        const col = [];
        let used = 0;
        while (i < run.length) {
          const it = run[i];
          if (it.kind === 'mark') { col.push({ mark: it.mark }); i++; continue; }
          if (it.kind === 'break') {
            i++;
            if (it.column || it.only) break;
            pageBreak = true;
            break;
          }
          const sb = used > 0 && a === 0 ? it.sb : 0;
          const need = sb + pieceH(it, a, null);
          if (used + need <= T + EPS || (!col.length && !(it.lines && it.lines.length - a >= 2))) { col.push({ it, a, b: null, sb }); used += need; i++; a = 0; continue; }
          if (it.lines && it.lines.length - a >= 2) {
            let best = -1;
            for (let b = a + 1; b < it.lines.length; b++) { if (used + sb + pieceH(it, a, b) <= T + EPS) best = b; else break; }
            if (best >= 0 && col.length && best - a < 2) best = -1;
            if (best < 0 && !col.length) best = a + 1;
            if (best > a) { col.push({ it, a, b: best, sb }); used += sb + pieceH(it, a, best); a = best; }
          }
          break;
        }
        cols.push(col); hs.push(used);
        if (pageBreak) break;
      }
      while (cols.length < k) { cols.push([]); hs.push(0); }
      return { cols, hs, end: { i, a }, done: i >= run.length, page: pageBreak };
    };
    const placeBand = (run, k, balance) => {
      const sep = (it) => (it.region ? 12 * this.px : 0);
      let pos = { i: 0, a: 0 };
      let first = true;
      while (pos.i < run.length) {
        // (the multicols environment has \multicolsep above it and below it)
        const gapTop = first && page.entries.length ? sep(run[0]) : 0;
        let A = avail() - gapTop;
        if (A < this.g.bs * this.px * 1.5 && page.entries.length) { close(); continue; }
        let F = fill(run, pos, k, A);
        if (F.done && balance && !F.page) {
          let lo = 0, hi = A;
          for (let n = 0; n < 16 && hi - lo > 0.5; n++) {
            const mid = (lo + hi) / 2;
            const G = fill(run, pos, k, mid);
            if (G.done) { hi = mid; } else lo = mid;
          }
          F = fill(run, pos, k, hi);
        }
        const h = F.done && (balance || F.page) ? Math.max(...F.hs) : A;
        const band = { k, cols: [] };
        page.used += gapTop;
        F.cols.forEach((col, c) => {
          const list = [];
          for (const e of col) {
            if (e.mark) { page.marks.push(e.mark); continue; }
            const en = { it: e.it, a: e.a, b: e.b, sb: e.sb, band, col: c };
            page.entries.push(en);
            list.push(en);
            const fl = fnsOf(e.it, e.a, e.b);
            page.fnH += fnCost(fl);
            page.fns.push(...fl);
            if (e.a === 0) markOf(e.it);
          }
          band.cols.push(list);
        });
        band.h = h; band.top = page.used;
        page.used += h;
        (page.bands || (page.bands = [])).push(band);
        pos = F.end;
        first = false;
        if (!F.done || F.page) close();
        else if (run[0].region) page.used += 12 * this.px;
      }
    };
    newPage();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'mark') { page.marks.push(it.mark); continue; }
      if (it.kind === 'break') {
        if (it.only) continue;
        if (page.entries.length || deferred.length) close();
        if (it.odd) toOdd();
        continue;
      }
      const k = this.colsOf(it);
      if (k > 1) {
        const j = runEnd(i, k, it.region || null);
        placeBand(items.slice(i, j), k, it.region ? it.balance !== false : false);
        i = j - 1;
        continue;
      }
      if (it.isFloat && !/H/.test(it.placement)) {
        if (deferred.length) { deferred.push(it); continue; }
        const sb = page.entries.length ? it.sb : 0;
        if (sb + it.h + fnCost(fnsOf(it, 0, null)) <= avail() + EPS || !page.entries.length) { put(it, 0, null, sb); continue; }
        deferred.push(it);
        continue;
      }
      let a = 0;
      let guard = 0;
      while (guard++ < 500) {
        const empty = !page.entries.length;
        const sb = empty || a > 0 ? 0 : it.sb;
        const need = sb + pieceH(it, a, null) + fnCost(fnsOf(it, a, null));
        if (need <= avail() + EPS) {
          if (it.keepNext && !empty) {
            const nx = items[i + 1];
            if (nx && nx.kind !== 'break' && nx.kind !== 'mark') {
              const nmin = nx.lines && nx.lines.length > 1 ? nx.lines[Math.min(2, nx.lines.length - 1)].t : nx.isFloat ? 0 : Math.min(nx.h, H * 0.9);
              if (need + nx.sb + nmin > avail() + EPS) { close(); continue; }
            }
          }
          put(it, a, null, sb);
          break;
        }
        if (it.lines && it.lines.length - a >= 2) {
          const n = it.lines.length;
          let best = -1;
          for (let b = a + 1; b < n; b++) {
            const cost = sb + pieceH(it, a, b) + fnCost(fnsOf(it, a, b));
            if (cost <= avail() + EPS) best = b; else break;
          }
          if (best >= 0 && !empty && best - a < 2) best = -1;
          if (best >= 0 && n - best < 2 && best - a > 2) best -= 1;
          if (best > a) { put(it, a, best, sb); close(); a = best; continue; }
        }
        if (empty) { put(it, a, null, sb); break; }
        close();
      }
    }
    while (deferred.length) { if (page.entries.length) close(); else { const f = deferred.shift(); put(f, 0, null, 0); } }
    if (page.entries.length || !pages.length) { number(page); pages.push(page); }
    return pages;
  }

  // Build split pieces of an item for the given cut lines.
  pieces(it, cuts) {
    const key = cuts.join(',');
    if (it.pieces && it.pieces.key === key) return it.pieces.map;
    const clone = it.el.cloneNode(true);
    clone.style.marginTop = '';
    this.hostFor(this.colsOf(it)).appendChild(clone);
    const top = clone.getBoundingClientRect().top;
    const units = it.rowSplit ? [...clone.querySelectorAll('tr')].map((el) => ({ el })) : collectUnits(clone);
    // A cut falls where a line starts, so between two characters as a reader sees them; a unit
    // is a code unit, and the first one of a line whose box can be measured may be the second of
    // its cluster (a vowel sign, a virama, half a pair). The cut goes to the cluster's start.
    const pos = cuts.map((k) => { const p = findUnit(units, it.lines[k].t, top); return p && p.node && p.i > 0 ? { node: p.node, i: clusterEdge(p.node.data, p.i, -1) } : p; });
    const map = new Map();
    const parts = [];
    for (let n = pos.length - 1; n >= 0; n--) {
      const p = pos[n];
      const r = document.createRange();
      if (!p) continue;
      if (p.node) r.setStart(p.node, p.i); else r.setStartBefore(p.el);
      r.setEnd(clone, clone.childNodes.length);
      const frag = r.extractContents();
      const part = clone.cloneNode(false);
      part.appendChild(frag);
      if (p.node && p.i > 0) {
        const sp = part.querySelector('span.t');
        if (sp) sp.dataset.o = (+(sp.dataset.o || 0)) + p.i;
      }
      // hyphen if split inside a word
      // (not between Chinese, Japanese or Korean characters, where a line may end anywhere, nor
      // in Arabic, Hebrew or India's scripts, which take no hyphen, nor in a LaTeX paragraph's
      // source, where a hyphen would read as a character of it)
      if (p.node && p.i > 0 && !clone.classList.contains('tex') && HYPHENED.test(p.node.data[p.i - 1] || '') && HYPHENED.test((part.querySelector('span.t') || {}).textContent?.[0] || '')) {
        const h = document.createElement('span');
        h.className = 'chr hy';
        h.contentEditable = 'false';
        h.textContent = '-';
        clone.appendChild(h);
      }
      part.classList.add('split-b');
      parts.unshift({ k: cuts[n], el: part });
      clone.classList.add('split-a');
    }
    clone.remove();
    map.set(0, clone);
    for (const p of parts) map.set(p.k, p.el);
    // the head keeps split-a; intermediates have both classes already
    it.pieces = { key, map };
    return map;
  }

  apply(plan) {
    // cut lists per item
    const cuts = new Map();
    for (const pg of plan) for (const e of pg.entries) if (e.b != null) {
      if (!cuts.has(e.it)) cuts.set(e.it, new Set());
      cuts.get(e.it).add(e.b);
    }
    const pieceEl = (e) => {
      if (e.a === 0 && e.b == null) return e.it.el;
      const cs = [...(cuts.get(e.it) || [])].sort((x, y) => x - y);
      const map = this.pieces(e.it, cs);
      return map.get(e.a) || e.it.el;
    };
    const changed = [];
    const marks = this.marks(plan);
    const ln = this.page.lineno && this.page.lineno.on ? this.lineStarts(plan) : null;
    const total = plan.length ? fmtNum(plan[plan.length - 1].num, plan[plan.length - 1].fmt) : '1';
    plan.forEach((pg, k) => {
      const fill = this.fillOf(pg);
      const sig = pg.entries.map((e) => e.it.uid + ':' + e.a + ':' + (e.b ?? '') + ':' + e.sb.toFixed(1) + (e.band ? ':' + e.col + ':' + e.band.h.toFixed(1) : '')).join(',') + '|' + pg.fns.map((f) => f.uid).join(',') + '|' + (k + 1) + '|' + fill.toFixed(1);
      let P = this.pages[k];
      if (!P) { P = this.makePage(); this.pages.push(P); this.root.appendChild(P.el); }
      // (the header, the footer and the page's numbers are drawn again on their own)
      const chrome = this.chromeSig(pg, marks[k], total) + '|' + k;
      if (P.chrome !== chrome) { P.chrome = chrome; this.drawChrome(P, pg, marks[k], total, k); }
      if (P.sig === sig) { if (ln && P.lnSig !== ln[k] + '|' + chrome + sig) this.lineNumbers(P, pg, ln[k]); else if (!ln && P.ln) { P.ln.remove(); P.ln = null; } return; }
      P.sig = sig;
      changed.push(k);
      const els = [];
      let band = null;
      for (const e of pg.entries) {
        const el = pieceEl(e);
        el.style.marginTop = e.sb ? e.sb.toFixed(2) + 'px' : '';
        el.style.height = e.it.fill && fill ? fill.toFixed(2) + 'px' : e.it.fill ? '' : el.style.height;
        if (!e.band) { els.push(el); band = null; continue; }
        if (band !== e.band) {
          band = e.band;
          const b = document.createElement('div');
          b.className = 'mcb';
          b.contentEditable = 'inherit';
          b.style.setProperty('--n', band.k);
          b.style.height = band.h.toFixed(2) + 'px';
          if (band.top && els.length) b.style.marginTop = '';
          band.el = b;
          band.colEls = band.cols.map(() => { const c = document.createElement('div'); c.className = 'mcc'; b.appendChild(c); return c; });
          els.push(b);
        }
        band.colEls[e.col].appendChild(el);
      }
      // (the space above a multicols band, and below it before what follows)
      this.bandGaps(pg, els);
      P.flow.replaceChildren(...els);
      if (pg.fns.length) { P.fns.hidden = false; P.fns.replaceChildren(P.rule, ...pg.fns.map((f) => f.el)); }
      else { P.fns.hidden = true; P.fns.replaceChildren(); }
      P.entries = pg.entries;
      if (ln) this.lineNumbers(P, pg, ln[k]);
      else if (P.ln) { P.ln.remove(); P.ln = null; }
    });
    while (this.pages.length > plan.length) { const P = this.pages.pop(); P.el.remove(); }
    this.host.flow.replaceChildren();
    this.host.fns.replaceChildren();
    for (const h of this.hosts.values()) h.replaceChildren();
    this.lastPlan = plan;
    return changed;
  }

  // what \vspace*{\fill} gets on a page: what the page has left, shared among its fills
  fillOf(pg) {
    const n = pg.entries.filter((e) => e.it.fill).length;
    if (!n) return 0;
    return Math.max(0, (this.g.th * this.px - pg.used - pg.fnH) / n);
  }
  // the space between bands and the paragraphs beside them (pg.used counted it)
  bandGaps(pg, els) {
    if (!pg.bands) return;
    for (const b of pg.bands) {
      const k = els.indexOf(b.el);
      if (k < 0) continue;
      const first = b.cols.flat()[0];
      const region = first && first.it.region;
      if (region && k > 0) b.el.style.marginTop = (12 * this.px).toFixed(2) + 'px';
      if (region && els[k + 1]) els[k + 1].style.marginTop = ((parseFloat(els[k + 1].style.marginTop) || 0) + 12 * this.px).toFixed(2) + 'px';
    }
  }

  // ---- the page's chrome: header, footer, numbers, watermark, colour, border, line numbers ----
  // Each page's marks for headers: \leftmark (the last section or chapter by the page's end) and
  // \rightmark (the first lower heading on the page, else the one before), as fancyhdr sets them
  marks(plan) {
    const top = this.opts && this.opts.chapters ? 0 : 1;
    let left = '', right = '';
    return plan.map((pg) => {
      let firstRight = null;
      for (const e of pg.entries) {
        if (e.it.kind !== 'h' || e.a !== 0 || typeof e.it.level !== 'number') continue;
        const t = headText(e.it.el);
        if (e.it.level === top) { left = t.toUpperCase(); if (firstRight === null) firstRight = ''; right = ''; }
        else if (e.it.level === top + 1) { if (firstRight === null) firstRight = t; right = t; }
      }
      return { left, right: firstRight !== null ? firstRight : right, lastRight: right };
    });
  }
  styleOf(pg) {
    const s = pg.thisStyle || pg.style || 'plain';
    return /^(plain|empty|fancy|headings|myheadings)$/.test(s) ? s : this.page.fancy && this.page.style === s ? 'fancy' : 'plain';
  }
  chromeSig(pg, mk, total) {
    const P = this.page;
    return [pg.num, pg.fmt, this.styleOf(pg), mk.left, mk.right, total, pg.blank ? 1 : 0, JSON.stringify(P.slots || null), JSON.stringify(P.plainSlots || null), P.headrule, P.footrule,
      JSON.stringify(P.wm || null), JSON.stringify(P.color || null), JSON.stringify(P.border || null), this.g.twoside ? 1 : 0, this.px].join('|');
  }
  // the slots of a page by its style: [left, centre, right] of the head and of the foot, as TeX text
  slotsFor(pg) {
    const st = this.styleOf(pg), side = this.g.twoside && pg.num % 2 === 0 ? 'E' : 'O';
    const P = this.page;
    const of = (S) => ({ head: ['L', 'C', 'R'].map((c) => S['H' + side + c] || ''), foot: ['L', 'C', 'R'].map((c) => S['F' + side + c] || ''), rules: true });
    if (st === 'empty') return null;
    if (st === 'plain') return P.plainSlots ? { ...of(P.plainSlots), rules: false } : { head: ['', '', ''], foot: ['', '\\thepage', ''], rules: false };
    if (st === 'fancy' && P.slots) return of(P.slots);
    if (st === 'headings' || st === 'myheadings') {
      // the standard classes' running heads: the section's mark and the page number, outside
      const mark = st === 'headings' ? '\\slshape\\rightmark' : '';
      return side === 'E' ? { head: ['\\thepage', '', mark], foot: ['', '', ''] } : { head: [mark, '', '\\thepage'], foot: ['', '', ''] };
    }
    return { head: ['', '', ''], foot: ['', '\\thepage', ''], rules: false };
  }
  drawChrome(P, pg, mk, total, k) {
    const S = this.slotsFor(pg);
    const ctx = { page: fmtNum(pg.num, pg.fmt), total, left: mk.left, right: mk.right };
    const fill = (box, list) => {
      box.replaceChildren();
      let any = false;
      list.forEach((t, k) => {
        const sp = document.createElement('span');
        sp.className = ['l', 'c', 'r'][k];
        hfInto(sp, t, ctx);
        if (sp.textContent) any = true;
        box.appendChild(sp);
      });
      return any;
    };
    const even = this.g.twoside && pg.num % 2 === 0;
    P.el.classList.toggle('even', !!even);
    P.el.dataset.n = ctx.page;
    const head = S ? fill(P.hd, S.head) : (P.hd.replaceChildren(), false);
    const foot = S ? fill(P.ft, S.foot) : (P.ft.replaceChildren(), false);
    const fancy = S && S.rules !== false;
    P.hd.classList.toggle('rule', !!(fancy && this.page.headrule > 0));
    P.ft.classList.toggle('rule', !!(fancy && this.page.footrule > 0));
    P.hd.style.setProperty('--rule', ((this.page.headrule || 0) * this.px) + 'px');
    P.ft.style.setProperty('--rule', ((this.page.footrule || 0) * this.px) + 'px');
    P.hd.hidden = !head && !(fancy && this.page.headrule > 0);
    P.ft.hidden = !foot && !(fancy && this.page.footrule > 0);
    // (the footer's centre is what the folio was: a page number the reader sees at its foot)
    P.folio.textContent = ctx.page;
    // the watermark, the page's colour and its border
    const W = this.page.wm;
    if (W && W.on && !(W.firstpage && k > 0)) {
      if (!P.wm) { P.wm = document.createElement('div'); P.wm.className = 'wmk'; P.wm.contentEditable = 'false'; P.wm.setAttribute('aria-hidden', 'true'); P.el.prepend(P.wm); }
      P.wm.textContent = plainTex(W.text || 'DRAFT').slice(0, 200);
      P.wm.style.fontSize = (0.25 * this.g.pw * (W.scale || 1) * this.px).toFixed(1) + 'px';
      P.wm.style.transform = 'translate(-50%, -50%) rotate(' + (-(Number.isFinite(W.angle) ? W.angle : 45)) + 'deg)';
      P.wm.style.color = cssColor(W.color) || '#CCCCCC';
    } else if (P.wm) { P.wm.remove(); P.wm = null; }
    const C = this.page.color;
    P.el.style.background = C ? cssColor(C.css || C.color) : '';
    const B = this.page.border;
    if (B) {
      if (!P.bd) { P.bd = document.createElement('div'); P.bd.className = 'pbd'; P.bd.contentEditable = 'false'; P.bd.setAttribute('aria-hidden', 'true'); P.el.prepend(P.bd); }
      P.bd.style.inset = (B.inset * this.px).toFixed(2) + 'px';
      P.bd.style.borderWidth = Math.max(1, B.width * this.px).toFixed(2) + 'px';
      P.bd.style.borderColor = cssColor(B.color) || '#000';
    } else if (P.bd) { P.bd.remove(); P.bd = null; }
  }

  // lineno: the lines of the page's paragraphs and headings numbered in the margin, from the plan
  // (where each piece sits, and where its lines are), running on from the page before, or from 1
  // on each page or at each section
  lineNumbers(P, pg, start) {
    const L = this.page.lineno || {};
    if (!P.ln) { P.ln = document.createElement('div'); P.ln.className = 'lnum'; P.ln.contentEditable = 'false'; P.ln.setAttribute('aria-hidden', 'true'); P.el.querySelector('.pb').appendChild(P.ln); }
    P.lnSig = start + '|' + P.chrome + P.sig;
    let n = start;
    const out = document.createDocumentFragment();
    const mod = Math.max(1, L.modulo || 1);
    const colX = (band, c) => (band ? c * (this.colW(band.k) + (this.g.colsep ?? 10)) * this.px : 0);
    this.eachLine(pg, (e, y, reset) => {
      if (reset) n = 1;
      if (n % mod === 0) {
        const d = document.createElement('span');
        d.textContent = String(n);
        d.style.top = y.toFixed(1) + 'px';
        // (the last of several columns has its numbers in the right margin, as lineno sets a
        // two column page's: in the gap they would stand on the other column's words)
        if (e.band && e.col === e.band.k - 1 && e.col > 0) { d.className = 'r'; d.style.left = (colX(e.band, e.col) + this.colW(e.band.k) * this.px).toFixed(1) + 'px'; }
        else if (e.band) d.style.left = colX(e.band, e.col).toFixed(1) + 'px';
        out.appendChild(d);
      }
      n++;
    });
    P.ln.replaceChildren(out);
  }
  // the lines a page's numbers go beside: fn(entry, y of the line's middle, whether a section
  // starts the count again there)
  eachLine(pg, fn) {
    const L = this.page.lineno || {};
    let y = 0, band = null;
    const colY = [];
    for (const e of pg.entries) {
      let top;
      if (e.band) {
        if (band !== e.band) { band = e.band; colY.length = 0; }
        top = (colY[e.col] ?? e.band.top) + e.sb;
        colY[e.col] = top + pieceHOf(e);
      } else {
        if (band) { y = band.top + band.h + (band.cols.flat()[0] && band.cols.flat()[0].it.region ? 12 * this.px : 0); band = null; }
        top = y + e.sb;
        y = top + pieceHOf(e);
      }
      const it = e.it;
      if (!(it.kind === 'p' || it.kind === 'h' || it.kind === 'title')) continue;
      const lines = it.lines ? it.lines.slice(e.a, e.b == null ? it.lines.length : e.b) : [{ t: 0, b: it.h }];
      const base = it.lines ? it.lines[e.a].t : 0;
      lines.forEach((l, j) => fn(e, top + (l.t + l.b) / 2 - base, j === 0 && L.mode === 'section' && it.kind === 'h' && e.a === 0));
    }
  }
  // the number each page's lines start at
  lineStarts(plan) {
    const L = this.page.lineno || {};
    const out = [];
    let n = 1;
    for (const pg of plan) {
      if (L.mode === 'page') n = 1;
      out.push(n);
      this.eachLine(pg, (e, y, reset) => { if (reset) n = 1; n++; });
    }
    return out;
  }

  makePage() {
    const el = document.createElement('div');
    el.className = 'page';
    const pb = document.createElement('div');
    pb.className = 'pb';
    const flow = document.createElement('div');
    flow.className = 'flow';
    const fns = document.createElement('div');
    fns.className = 'fns';
    fns.hidden = true;
    const rule = document.createElement('div');
    rule.className = 'fnrule';
    rule.contentEditable = 'false';
    const folio = document.createElement('div');
    folio.className = 'folio';
    folio.contentEditable = 'false';
    // the header and the footer: three places each (src/ui/headerfooter.js edits them)
    const hd = document.createElement('div');
    hd.className = 'hd';
    hd.contentEditable = 'false';
    hd.hidden = true;
    const ft = document.createElement('div');
    ft.className = 'ft';
    ft.contentEditable = 'false';
    ft.hidden = true;
    pb.append(flow, fns);
    el.append(pb, hd, ft, folio);
    return { el, flow, fns, rule, folio, hd, ft, sig: null };
  }
}

// the height of a piece of an item, as the plan counts it
function pieceHOf(e) {
  const it = e.it;
  const top = e.a === 0 || !it.lines ? 0 : it.lines[e.a].t;
  const bot = e.b == null || !it.lines ? it.h : it.lines[e.b].t;
  return bot - top;
}
// the title and a float as wide as the page (figure*) run across a two column page
const spans = (it) => it.kind === 'title' || (it.isFloat && it.el.classList.contains('wide'));
// a heading's number and words, as a running head shows them
const headText = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// ---- numbers and the text of headers ------------------------------------------------------------
const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
export function fmtNum(n, fmt) {
  if (!Number.isFinite(n)) return '';
  if (fmt === 'roman' || fmt === 'Roman') {
    if (n <= 0 || n > 4999) return String(n);
    let s = '', x = n;
    for (const [v, r] of ROMAN) while (x >= v) { s += r; x -= v; }
    return fmt === 'Roman' ? s.toUpperCase() : s;
  }
  if (fmt === 'alph' || fmt === 'Alph') {
    if (n < 1 || n > 26) return String(n);
    const c = String.fromCharCode(96 + n);
    return fmt === 'Alph' ? c.toUpperCase() : c;
  }
  return String(n);
}
// A header's TeX as text with its weight and shape, the page's numbers in: \thepage, LastPage,
// \leftmark and \rightmark, \today; \textbf, \textit, \emph and their declarations; other
// commands drop, their arguments stay. The text is the document's (maybe a stranger's): it is
// read in bounded steps and goes into the page as text only.
export function hfRuns(tex, ctx = {}) {
  const t = String(tex || '').slice(0, 600);
  const out = [];
  let cur = { b: false, i: false, sc: false, sf: false, tt: false, up: false };
  const stack = [];
  const push = (s) => { if (!s) return; const st = { ...cur }; const last = out[out.length - 1]; if (last && JSON.stringify(last.st) === JSON.stringify(st)) last.t += s; else out.push({ t: s, st }); };
  const WRAP = { textbf: 'b', textit: 'i', emph: 'i', textsl: 'i', textsc: 'sc', textsf: 'sf', texttt: 'tt', MakeUppercase: 'up', uppercase: 'up' };
  const DECL = { bfseries: 'b', bf: 'b', itshape: 'i', it: 'i', slshape: 'i', sl: 'i', em: 'i', scshape: 'sc', sc: 'sc', sffamily: 'sf', ttfamily: 'tt' };
  const today = () => { const d = new Date(); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
  for (let i = 0, n = 0; i < t.length && n < 2000; n++) {
    const c = t[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z@]+)\*?|^\\(.)/.exec(t.slice(i, i + 40));
      if (!m) { i++; continue; }
      i += m[0].length;
      const name = m[1];
      if (!name) { const ch = m[2]; push(ch === '\\' ? ' ' : ch === ' ' ? ' ' : '&%$#_{}'.includes(ch) ? ch : ''); continue; }
      const arg = () => { let j = i; while (t[j] === ' ') j++; if (t[j] !== '{') return null; let d = 0; for (let k = j; k < t.length; k++) { if (t[k] === '\\') { k++; continue; } if (t[k] === '{') d++; else if (t[k] === '}' && --d === 0) { i = k + 1; return t.slice(j + 1, k); } } i = t.length; return t.slice(j + 1); };
      if (name === 'thepage') push(ctx.page || '');
      else if (name === 'pageref') { const a = arg(); push(a != null && a.trim() === 'LastPage' ? ctx.total || '' : '??'); }
      else if (name === 'leftmark') push(ctx.left || '');
      else if (name === 'rightmark') push(ctx.right || '');
      else if (name === 'today') push(today());
      else if (name === 'LaTeX') push('LaTeX');
      else if (name === 'TeX') push('TeX');
      else if (name === 'ldots' || name === 'dots') push('…');
      else if (name === 'quad' || name === 'qquad' || name === 'hfill') push('  ');
      else if (WRAP[name]) { const a = arg(); if (a != null) { stack.push(cur); cur = { ...cur, [WRAP[name]]: true }; for (const r of hfRuns(a, ctx)) { cur = { ...cur, ...Object.fromEntries(Object.entries(r.st).filter(([, v]) => v)) }; push(r.t); cur = { ...stack[stack.length - 1], [WRAP[name]]: true }; } cur = stack.pop(); } }
      else if (DECL[name]) cur = { ...cur, [DECL[name]]: true };
      else if (/^(fancyplain|ifthenelse)$/.test(name)) { arg(); }
      continue;
    }
    if (c === '{') { stack.push(cur); i++; continue; }
    if (c === '}') { if (stack.length) cur = stack.pop(); i++; continue; }
    if (c === '~') { push(' '); i++; continue; }
    if (c === '-' && t[i + 1] === '-') { if (t[i + 2] === '-') { push('—'); i += 3; } else { push('–'); i += 2; } continue; }
    if (c === '`' && t[i + 1] === '`') { push('“'); i += 2; continue; }
    if (c === "'" && t[i + 1] === "'") { push('”'); i += 2; continue; }
    if (c === '$' || c === '%') { i++; continue; }
    push(/\s/.test(c) ? ' ' : c);
    i++;
  }
  return out;
}
function hfInto(el, tex, ctx) {
  for (const r of hfRuns(tex, ctx)) {
    const s = document.createElement('span');
    s.textContent = r.st.up ? r.t.toUpperCase() : r.t;
    if (r.st.b) s.style.fontWeight = 'bold';
    if (r.st.i) s.style.fontStyle = 'italic';
    if (r.st.sc) s.style.fontVariant = 'small-caps';
    if (r.st.tt) s.className = 'y-tt';
    if (r.st.sf) s.className = 'y-sf';
    el.appendChild(s);
  }
}
const plainTex = (t) => hfRuns(t, {}).map((r) => r.t).join('').trim();

// a colour as xcolor names it (red, gray!30, a dvipsnames name) or #RRGGBB, for the page's style;
// anything else gives nothing
const NAMED = Object.fromEntries([...BASE_COLORS, ...DVIPS_COLORS].map(([n, h]) => [n, '#' + h]));
export function cssColor(c) {
  c = String(c || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c;
  const mix = /^([A-Za-z]+)!(\d{1,3})(?:!([A-Za-z]+))?$/.exec(c);
  if (mix) {
    const a = NAMED[mix[1]], b = mix[3] ? NAMED[mix[3]] : '#FFFFFF';
    return a && b ? 'color-mix(in srgb, ' + a + ' ' + Math.min(100, +mix[2]) + '%, ' + b + ')' : '';
  }
  return NAMED[c] || '';
}

// Table rows as split units.
function rowBoxes(el, top, height) {
  const rows = [...el.querySelectorAll('tr')];
  if (rows.length < 2) return null;
  const tops = rows.map((r) => r.getBoundingClientRect().top - top);
  return tops.map((t, k) => ({ t: k === 0 ? 0 : t, b: k === tops.length - 1 ? height : tops[k + 1] }));
}

// Cluster an element's glyph rects into line boxes relative to its top.
export function lineBoxes(el, top, height) {
  const rects = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        const c = n.classList;
        if (c.contains('lbl')) return NodeFilter.FILTER_REJECT;
        if (c.contains('atom')) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const r = document.createRange();
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 1) {
      for (const q of n.getClientRects()) if (q.height > 0) rects.push({ t: q.top - top, b: q.bottom - top });
      continue;
    }
    if (!n.data.length) continue;
    r.selectNodeContents(n);
    for (const q of r.getClientRects()) if (q.height > 0 && q.width >= 0) rects.push({ t: q.top - top, b: q.bottom - top });
  }
  if (!rects.length) return [{ t: 0, b: height }];
  rects.sort((a, b) => a.t - b.t);
  const lines = [];
  for (const q of rects) {
    const L = lines[lines.length - 1];
    const cy = (q.t + q.b) / 2;
    if (L && cy < L.b && cy > L.t) { L.t = Math.min(L.t, q.t); L.b = Math.max(L.b, q.b); L.cy = (L.t + L.b) / 2; }
    else if (L && ((L.t + L.b) / 2) >= q.t && ((L.t + L.b) / 2) <= q.b) { L.t = Math.min(L.t, q.t); L.b = Math.max(L.b, q.b); }
    else lines.push({ t: q.t, b: q.b });
  }
  // Convert glyph extents to line box boundaries.
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    const t = k === 0 ? 0 : (lines[k - 1].b + lines[k].t) / 2;
    const b = k === lines.length - 1 ? height : (lines[k].b + lines[k + 1].t) / 2;
    out.push({ t, b });
  }
  return out;
}

function collectUnits(root) {
  const units = [];
  const walk = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        if (c.parentNode.classList && c.parentNode.classList.contains('t')) for (let i = 0; i < c.data.length; i++) units.push({ node: c, i });
        continue;
      }
      if (c.nodeType !== 1) continue;
      const cl = c.classList;
      if (cl.contains('lbl')) continue;
      if (cl.contains('atom') || cl.contains('chr')) { units.push({ el: c }); continue; }
      walk(c);
    }
  };
  walk(root);
  return units;
}

function unitY(u, top, r) {
  let q;
  if (u.node) {
    r.setStart(u.node, u.i); r.setEnd(u.node, u.i + 1);
    const rs = r.getClientRects();
    q = rs[0];
    if (!q || q.height === 0) return null;
  } else {
    q = u.el.getBoundingClientRect();
    if (!q || q.height === 0) return null;
  }
  return (q.top + q.bottom) / 2 - top;
}

function findUnit(units, y, top) {
  const r = document.createRange();
  let lo = 0, hi = units.length - 1, ans = units.length;
  const valAt = (i) => {
    for (let j = i; j < units.length; j++) { const v = unitY(units[j], top, r); if (v != null) return { v, j }; }
    return null;
  };
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const got = valAt(mid);
    if (!got) { hi = mid - 1; continue; }
    if (got.v >= y) { ans = got.j; hi = mid - 1; } else lo = got.j + 1;
  }
  if (ans >= units.length) return null;
  // never split right after an opening chrome unit at paragraph start
  return units[ans];
}
