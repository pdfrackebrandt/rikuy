// Rikuy layout: measure flow items once, paginate arithmetically, and
// touch only the pages whose contents changed.

const EPS = 1.5;
const IN = 72.27;

export function geometry(opts) {
  const P = opts.paper === 'a4' ? { w: 597.5, h: 845.05 } : { w: 614.295, h: 794.97 };
  const pt = opts.pt || 10;
  const bs = { 10: 12, 11: 13.6, 12: 14.5 }[pt] || 12;
  const tw0 = { 10: 345, 11: 360, 12: 390 }[pt] || 345;
  let tw = Math.min(P.w - 2 * IN, tw0);
  let th = Math.floor((P.h - 3.5 * IN) / bs) * bs + pt;
  const footskip = 30;
  let ml = (P.w - tw) / 2;
  const headheight = 12, headsep = 25;
  let topmargin = (P.h - 2 * IN - headheight - headsep - th - footskip) / 2;
  let mt = IN + topmargin + headheight + headsep;
  const M = opts.margins;
  if (M) {
    if (M.l != null || M.r != null || M.tw != null) {
      const l = M.l ?? M.r ?? ml;
      const r = M.r ?? M.l ?? ml;
      tw = M.tw ?? (P.w - l - r);
      ml = M.l != null ? M.l : (P.w - tw) / 2;
    }
    if (M.t != null || M.b != null || M.th != null) {
      const t = M.t ?? M.b ?? mt;
      const b = M.b ?? M.t ?? (P.h - mt - th);
      th = M.th ?? (P.h - t - b);
      mt = t;
    }
    if (M.scale) { tw = P.w * M.scale; th = P.h * M.scale; ml = (P.w - tw) / 2; mt = (P.h - th) / 2; }
  }
  return { pw: P.w, ph: P.h, ml, mt, tw, th, footskip, bs, pt };
}

export class Layout {
  constructor(root, host) {
    this.root = root;     // contenteditable container of pages
    this.host = host;     // hidden measuring flow
    this.pages = [];      // [{el, flow, fns, folio, sig}]
    this.px = 1.33;
    this.g = null;
    this.planCache = null;
  }

  setGeometry(g, px, sheet, sizes, opts) {
    this.g = g;
    this.px = px;
    const S = sheet.style;
    const lh = g.bs * (opts.spread || 1);
    S.setProperty('--pt', px);
    S.setProperty('--fs', (g.pt * px) + 'px');
    S.setProperty('--lh', (lh * px) + 'px');
    S.setProperty('--lhr', (lh / g.pt).toFixed(4));
    S.setProperty('--pw', (g.pw * px) + 'px');
    S.setProperty('--ph', (g.ph * px) + 'px');
    S.setProperty('--ml', (g.ml * px) + 'px');
    S.setProperty('--mt', (g.mt * px) + 'px');
    S.setProperty('--tw', (g.tw * px) + 'px');
    S.setProperty('--th', (g.th * px) + 'px');
    S.setProperty('--footskip', (g.footskip * px) + 'px');
    S.setProperty('--parindent', ((opts.parindent ?? 15) * px) + 'px');
    for (const [k, v] of Object.entries(sizes)) S.setProperty('--z-' + k, v);
    const fnRatio = sizes.footnotesize;
    S.setProperty('--fnlh', ({ 10: 9.5, 11: 11, 12: 12 }[g.pt] || 9.5) / (g.pt * fnRatio));
    for (const p of this.pages) p.sig = null;
  }

  // Measure items (and their footnotes) that lack metrics.
  measure(items, fns) {
    const host = this.host;
    const todo = items.filter((it) => !it.measured);
    const fnTodo = fns.filter((f) => !f.measured);
    if (!todo.length && !fnTodo.length) return;
    const frag = document.createDocumentFragment();
    for (const it of todo) { it.el.style.marginTop = ''; frag.appendChild(it.el); }
    host.flow.appendChild(frag);
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

  // Pure pagination over measured items.
  plan(items) {
    const H = this.g.th * this.px;
    const fnSep = this.g.pt * 1.1 * this.px;
    const pages = [];
    let page = null;
    const deferred = [];
    const newPage = () => { page = { entries: [], fns: [], used: 0, fnH: 0 }; };
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
    const put = (it, a, b, sb) => {
      const fl = fnsOf(it, a, b);
      const cost = fnCost(fl);
      page.entries.push({ it, a, b, sb });
      page.used += sb + pieceH(it, a, b);
      page.fns.push(...fl);
      page.fnH += cost;
    };
    const close = () => {
      pages.push(page);
      newPage();
      while (deferred.length) {
        const f = deferred[0];
        const sb = page.entries.length ? f.sb : 0;
        if (sb + f.h + fnCost(fnsOf(f, 0, null)) <= avail() + EPS || !page.entries.length) { put(f, 0, null, sb); deferred.shift(); }
        else break;
      }
    };
    newPage();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'break') { if (page.entries.length || deferred.length) close(); continue; }
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
            if (nx && nx.kind !== 'break') {
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
    if (page.entries.length || !pages.length) pages.push(page);
    return pages;
  }

  // Build split pieces of an item for the given cut lines.
  pieces(it, cuts) {
    const key = cuts.join(',');
    if (it.pieces && it.pieces.key === key) return it.pieces.map;
    const clone = it.el.cloneNode(true);
    clone.style.marginTop = '';
    this.host.flow.appendChild(clone);
    const top = clone.getBoundingClientRect().top;
    const units = it.rowSplit ? [...clone.querySelectorAll('tr')].map((el) => ({ el })) : collectUnits(clone);
    const pos = cuts.map((k) => findUnit(units, it.lines[k].t, top));
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
      if (p.node && p.i > 0 && /[\p{L}]/u.test(p.node.data[p.i - 1] || '') && /[\p{L}]/u.test((part.querySelector('span.t') || {}).textContent?.[0] || '')) {
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
    plan.forEach((pg, k) => {
      const sig = pg.entries.map((e) => e.it.uid + ':' + e.a + ':' + (e.b ?? '') + ':' + e.sb.toFixed(1)).join(',') + '|' + pg.fns.map((f) => f.uid).join(',') + '|' + (k + 1);
      let P = this.pages[k];
      if (!P) { P = this.makePage(); this.pages.push(P); this.root.appendChild(P.el); }
      if (P.sig === sig) return;
      P.sig = sig;
      changed.push(k);
      const els = pg.entries.map((e) => { const el = pieceEl(e); el.style.marginTop = e.sb ? e.sb.toFixed(2) + 'px' : ''; return el; });
      P.flow.replaceChildren(...els);
      if (pg.fns.length) { P.fns.hidden = false; P.fns.replaceChildren(P.rule, ...pg.fns.map((f) => f.el)); }
      else { P.fns.hidden = true; P.fns.replaceChildren(); }
      P.folio.textContent = String(k + 1);
      P.entries = pg.entries;
    });
    while (this.pages.length > plan.length) { const P = this.pages.pop(); P.el.remove(); }
    this.host.flow.replaceChildren();
    this.host.fns.replaceChildren();
    this.lastPlan = plan;
    return changed;
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
    pb.append(flow, fns);
    el.append(pb, folio);
    return { el, flow, fns, rule, folio, sig: null };
  }
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
