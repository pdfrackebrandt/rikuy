// Icons drawn on the grid of the pixels they are shown at (UI-PRINCIPLES C2, C3). Every icon is
// written once, on a 20 by 20 grid (src/commands.js icon); shown at 16 px it was scaled by 0.8 and
// its 1 px lines fell between two rows of pixels, two pale lines for one. regrid() redraws an
// icon's shapes on the grid of its size: every point where a line runs scaled and moved to the
// middle of a pixel (a filled shape's to a pixel's edge), the curves' handles scaled. Pure: strings
// in, a string out (test/commands.test.mjs); gridIcons() applies it to what the page shows.

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

// the path's commands, each with its numbers (an arc's two flags read as one digit each)
function parsePath(d) {
  const out = [];
  let i = 0, cur = null;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  while (i < d.length) {
    ws();
    if (i >= d.length) break;
    const ch = d[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) { cur = { c: ch, n: [] }; out.push(cur); i++; continue; }
    if (!cur) return null;
    const arc = /[Aa]/.test(cur.c), k = cur.n.length % 7;
    if (arc && (k === 3 || k === 4) && /[01]/.test(ch)) { cur.n.push(+ch); i++; continue; }
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) return null;
    cur.n.push(+m[0]); i = NUM.lastIndex;
  }
  return out;
}
const SIZE = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const fmt = (v) => String(Math.round(v * 1000) / 1000);

// a path on the new grid: absolute commands, ends and corners on the pixels' middles
export function regridPath(d, kx, ky, snap) {
  const P = parsePath(d);
  if (!P) return d;
  const sx = (v) => snap(v * kx), sy = (v) => snap(v * ky), hx = (v) => v * kx, hy = (v) => v * ky;
  let x = 0, y = 0, x0 = 0, y0 = 0;
  const out = [];
  for (const { c, n } of P) {
    const C = c.toUpperCase(), rel = c !== C, step = SIZE[C];
    if (C === 'Z') { out.push('Z'); x = x0; y = y0; continue; }
    for (let j = 0; j < n.length; j += step) {
      const a = n.slice(j, j + step);
      if (a.length < step) break;
      const X = (v) => (rel ? x + v : v), Y = (v) => (rel ? y + v : v);
      // (a moveto's further pairs are linetos)
      const cmd = C === 'M' && j > 0 ? 'L' : C;
      if (cmd === 'H') { x = X(a[0]); out.push('H' + fmt(sx(x))); continue; }
      if (cmd === 'V') { y = Y(a[0]); out.push('V' + fmt(sy(y))); continue; }
      if (cmd === 'A') {
        const ex = X(a[5]), ey = Y(a[6]);
        out.push('A' + [fmt(hx(a[0])), fmt(hy(a[1])), a[2], a[3], a[4], fmt(sx(ex)), fmt(sy(ey))].join(' '));
        x = ex; y = ey; continue;
      }
      const pts = [];
      for (let q = 0; q < a.length; q += 2) pts.push([X(a[q]), Y(a[q + 1])]);
      const end = pts[pts.length - 1];
      const ctl = pts.slice(0, -1).map(([px, py]) => fmt(hx(px)) + ' ' + fmt(hy(py)));
      out.push(cmd + [...ctl, fmt(sx(end[0])) + ' ' + fmt(sy(end[1]))].join(' '));
      x = end[0]; y = end[1];
      if (cmd === 'M') { x0 = x; y0 = y; }
    }
  }
  return out.join('');
}

// an icon's markup from a grid of W by H to one of w by h
export function regrid(markup, W, H, w, h) {
  const kx = w / W, ky = h / H;
  return markup.replace(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/g, (all, tag, attrs) => {
    // (a filled shape's edges on the pixels' edges, a line's on their middles)
    const filled = /\bfill="(?!none)[^"]+"/.test(attrs) || /fill:\s*(?!none)[a-z#]/i.test(attrs);
    const snap = filled ? (v) => Math.round(v) : (v) => Math.round(v - 0.5) + 0.5;
    const set = (name, f) => { attrs = attrs.replace(new RegExp('(\\s' + name + '=")([^"]*)(")'), (m, a, v, b) => a + f(v) + b); };
    if (tag === 'path') set('d', (v) => regridPath(v, kx, ky, snap));
    if (tag === 'circle' || tag === 'ellipse') {
      set('cx', (v) => fmt(snap(+v * kx))); set('cy', (v) => fmt(snap(+v * ky)));
      // (a radius of whole pixels keeps the circle's sides on the middles too)
      set('r', (v) => fmt(Math.max(1, Math.round(+v * Math.min(kx, ky)))));
      set('rx', (v) => fmt(Math.max(1, Math.round(+v * kx)))); set('ry', (v) => fmt(Math.max(1, Math.round(+v * ky))));
    }
    if (tag === 'rect') {
      set('x', (v) => fmt(snap(+v * kx))); set('y', (v) => fmt(snap(+v * ky)));
      set('width', (v) => fmt(Math.max(1, Math.round(+v * kx)))); set('height', (v) => fmt(Math.max(1, Math.round(+v * ky))));
      set('rx', (v) => fmt(+v * kx)); set('ry', (v) => fmt(+v * ky));
    }
    if (tag === 'line') { set('x1', (v) => fmt(snap(+v * kx))); set('x2', (v) => fmt(snap(+v * kx))); set('y1', (v) => fmt(snap(+v * ky))); set('y2', (v) => fmt(snap(+v * ky))); }
    if (tag === 'polyline' || tag === 'polygon') set('points', (v) => (v.match(NUM_ALL) || []).map(Number).map((n, i) => fmt(snap(n * (i % 2 ? ky : kx)))).join(' '));
    return '<' + tag + attrs + '>';
  });
}
const NUM_ALL = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

// Every icon under root drawn on the grid of the size it is shown at now: its first grid kept
// (data-g), drawn again only where its size changed (a group made small, folded, opened again)
export function gridIcons(root) {
  if (!root) return;
  for (const svg of root.querySelectorAll('svg[viewBox]')) {
    if (svg.closest('[data-nogrid]')) continue;
    let g = svg.dataset.g;
    if (!g) {
      const v = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
      if (v.length !== 4 || v[0] || v[1]) { svg.dataset.g = 'x'; continue; }
      g = svg.dataset.g = v[2] + ' ' + v[3];
      svg.dataset.gm = svg.innerHTML;
    }
    if (g === 'x') continue;
    const b = svg.getBoundingClientRect();
    const w = Math.round(b.width), h = Math.round(b.height);
    if (!w || !h) continue;
    const now = '0 0 ' + w + ' ' + h;
    if (svg.getAttribute('viewBox') === now) continue;
    const [W, H] = g.split(' ').map(Number);
    svg.setAttribute('viewBox', now);
    svg.innerHTML = regrid(svg.dataset.gm, W, H, w, h);
  }
}
