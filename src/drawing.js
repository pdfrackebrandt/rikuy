// What Insert's Shapes, Chart, SmartArt and Icons write, and the page's drawing of it. Each writes
// standard LaTeX that Overleaf and every TeX read (TikZ, pgfplots, smartdiagram, fontawesome5);
// the page draws it as TeX prints it from the same text: a TikZ picture of plain paths (lines,
// arrows, rectangles, circles, ellipses, polygons; colours, widths, dashes, rounded corners), a
// pgfplots axis of bars or lines from coordinates, a smartdiagram's boxes and arrows, an icon.
// Hand written pictures in that subset are drawn too; anything else keeps the page's source box.
//
// The reading is pure and bounded (test/drawing.test.mjs): a stranger's picture is read token by
// token with caps on its size, its commands and its points, with no backtracking pattern. The
// drawing builds SVG and HTML through the DOM: a document's words are set as text, its numbers
// checked as numbers, its colours only from a fixed table (never a style string of its own).

export const MAX_TEXT = 20000;
const MAX_CMDS = 200, MAX_PTS = 2000;
const num = (t) => { const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(cm|mm|pt|in|em)?\s*$/.exec(t); if (!m) return NaN; const v = parseFloat(m[1]); return m[2] ? v * { cm: 1, mm: 0.1, pt: 2.54 / 72.27, in: 2.54, em: 0.35 }[m[2]] : v; };

// ---- colours: xcolor's names and mixes ("blue!20", "red!50!black"), as RGB ---------------------
const BASE = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], cyan: [0, 255, 255], magenta: [255, 0, 255], yellow: [255, 255, 0],
  gray: [128, 128, 128], darkgray: [64, 64, 64], lightgray: [191, 191, 191], brown: [191, 128, 64], lime: [191, 255, 0], olive: [128, 128, 0], orange: [255, 128, 0], pink: [255, 191, 191],
  purple: [191, 0, 64], teal: [0, 128, 128], violet: [128, 0, 128] };
export function colorOf(t) {
  const parts = String(t || '').trim().split('!');
  if (!parts[0] || parts.length > 5) return null;
  let c = BASE[parts[0]];
  if (!c) return null;
  for (let i = 1; i < parts.length; i += 2) {
    const p = parseFloat(parts[i]);
    if (!Number.isFinite(p) || p < 0 || p > 100) return null;
    const other = parts[i + 1] ? BASE[parts[i + 1]] : BASE.white;
    if (!other) return null;
    c = c.map((v, k) => v * p / 100 + other[k] * (1 - p / 100));
  }
  return 'rgb(' + c.map((v) => Math.round(v)).join(',') + ')';
}

// ---- TikZ: \draw, \fill and \filldraw of plain paths ---------------------------------------------
// The commands of a tikzpicture's body, or null where anything else is in it: [{ draw, fill, opts:
// { arrow, width, dash, round, color, fillColor }, segs: [{ op: 'M'|'L'|'Z'|'rect'|'circle'|'ellipse', ... }] }]
export function readTikz(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
  const m = /^\\begin\{tikzpicture\}(\[[^\]\n]{0,200}\])?([\s\S]*)\\end\{tikzpicture\}\s*$/.exec(text.trim());
  if (!m) return null;
  const pic = m[1] ? opts(m[1].slice(1, -1)) : {};
  if (!pic) return null;
  const body = m[2].replace(/%[^\n]*/g, '');
  const cmds = [];
  let i = 0, pts = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    const c = /^\\(draw|fill|filldraw|path)\b/.exec(body.slice(i, i + 12));
    if (!c || cmds.length >= MAX_CMDS) return null;
    i += c[0].length;
    const end = body.indexOf(';', i);
    if (end < 0) return null;
    let s = body.slice(i, end).trim();
    i = end + 1;
    let o = {};
    if (s[0] === '[') { const z = s.indexOf(']'); if (z < 0) return null; o = opts(s.slice(1, z)); if (!o) return null; s = s.slice(z + 1); }
    const segs = path(s);
    if (!segs) return null;
    pts += segs.length;
    if (pts > MAX_PTS) return null;
    cmds.push({ draw: c[1] !== 'fill', fill: c[1] === 'fill' || c[1] === 'filldraw' || !!o.fillColor, opts: o, segs });
  }
  return cmds.length ? { scale: pic.scale || 1, cmds } : null;
}
// TikZ options this drawing knows; null for any other
function opts(t) {
  const o = {};
  for (const raw of t.split(',')) {
    const x = raw.trim();
    if (!x) continue;
    const kv = /^([a-z ]+?)\s*=\s*(.+)$/.exec(x);
    if (/^(->|<-|<->|-stealth|stealth-|stealth-stealth|-latex|latex-|latex-latex|>-<|-)$/.test(x)) { o.arrow = x; continue; }
    if (/^(ultra thin|very thin|thin|semithick|thick|very thick|ultra thick)$/.test(x)) { o.width = { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 }[x]; continue; }
    if (/^(dashed|dotted|densely dashed|densely dotted|loosely dashed|loosely dotted|solid)$/.test(x)) { o.dash = x; continue; }
    if (x === 'rounded corners') { o.round = 4; continue; }
    if (colorOf(x)) { o.color = colorOf(x); continue; }
    if (kv) {
      const k = kv[1], v = kv[2].trim();
      if (k === 'line width') { const n = num(v); if (!Number.isFinite(n)) return null; o.width = n / (2.54 / 72.27); continue; }
      if (k === 'rounded corners') { const n = num(v); if (!Number.isFinite(n)) return null; o.round = n / (2.54 / 72.27); continue; }
      if (k === 'fill') { const c = colorOf(v); if (!c) return null; o.fillColor = c; continue; }
      if (k === 'draw' || k === 'color') { const c = colorOf(v); if (!c) return null; o.color = c; continue; }
      if (k === 'scale') { const n = parseFloat(v); if (!Number.isFinite(n) || n <= 0 || n > 50) return null; o.scale = n; continue; }
      if (k === 'fill opacity' || k === 'opacity') { const n = parseFloat(v); if (!Number.isFinite(n)) return null; o.opacity = Math.max(0, Math.min(1, n)); continue; }
    }
    return null;
  }
  return o;
}
// a path: points joined by -- , rectangle to a point, circle and ellipse about one, cycle
function path(s) {
  const segs = [];
  let i = 0, cur = null, n = 0;
  const pt = () => {
    while (/\s/.test(s[i] || '')) i++;
    if (s[i] !== '(') return null;
    const z = s.indexOf(')', i);
    if (z < 0 || z - i > 60) return null;
    const inner = s.slice(i + 1, z);
    i = z + 1;
    return inner;
  };
  const xy = (t) => { if (t == null) return null; const c = t.split(','); if (c.length !== 2) return null; const x = num(c[0]), y = num(c[1]); return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null; };
  while (i < s.length && n++ < MAX_PTS) {
    while (/\s/.test(s[i] || '')) i++;
    if (i >= s.length) break;
    if (s.startsWith('--', i)) {
      i += 2;
      while (/\s/.test(s[i] || '')) i++;
      if (s.startsWith('cycle', i)) { i += 5; segs.push({ op: 'Z' }); continue; }
      const p = xy(pt()); if (!p) return null; segs.push({ op: 'L', p }); cur = p; continue;
    }
    if (s.startsWith('rectangle', i)) { i += 9; const p = xy(pt()); if (!p || !cur) return null; segs.push({ op: 'rect', a: cur, b: p }); cur = p; continue; }
    if (s.startsWith('circle', i)) { i += 6; const r = pt(); const v = r == null ? NaN : num(r); if (!Number.isFinite(v) || !cur) return null; segs.push({ op: 'circle', c: cur, r: v }); continue; }
    if (s.startsWith('ellipse', i)) { i += 7; const r = pt(); const m = r == null ? null : /^(.+?)\s+and\s+(.+)$/.exec(r); if (!m || !cur) return null; const a = num(m[1]), b = num(m[2]); if (!Number.isFinite(a) || !Number.isFinite(b)) return null; segs.push({ op: 'ellipse', c: cur, a, b }); continue; }
    if (s[i] === '(') { const p = xy(pt()); if (!p) return null; segs.push({ op: 'M', p }); cur = p; continue; }
    return null;
  }
  return segs.length ? segs : null;
}

// ---- pgfplots: an axis of bars or lines from coordinates ---------------------------------------------
// { kind: 'ybar' | 'xbar' | 'line', cats: [..] | null, series: [{ name, pts: [[x, y]] }], width, height }
// Only Rikuy's own charts (chartTex's options, nothing else): a hand written axis (a log scale,
// labels, stacked bars, a smooth line) is drawn by TeX alone, and the page keeps its source box
const AXIS_KEYS = [/^(x|y)bar$/, /^width=[\d.]*\\linewidth$/, /^height=[\d.]+cm$/, /^(x|y)min=0$/, /^symbolic (x|y) coords=\{[^{}]*\}$/, /^(x|y)tick=data$/, /^legend pos=north west$/];
function axisOpts(t) {
  const out = [];
  let d = 0, cur = '';
  for (const c of t) {
    if (c === '{') d++;
    if (c === '}') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((x) => x.replace(/\s*=\s*/, '='));
}
export function readAxis(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
  const m = /^\\begin\{tikzpicture\}\s*\\begin\{axis\}\[([^\]]{0,2000})\]([\s\S]*)\\end\{axis\}\s*\\end\{tikzpicture\}\s*$/.exec(text.trim().replace(/%[^\n]*/g, ''));
  if (!m) return null;
  const opts = axisOpts(m[1]);
  if (!opts.every((o) => AXIS_KEYS.some((r) => r.test(o)))) return null;
  const kind = opts.includes('xbar') ? 'xbar' : opts.includes('ybar') ? 'ybar' : 'line';
  const sym = opts.find((o) => /^symbolic (x|y) coords=/.test(o));
  if (!sym) return null;
  const cats = sym.slice(sym.indexOf('{') + 1, -1).split(',').map((x) => x.trim()).slice(0, 50);
  const series = [];
  const re = /\\addplot(\+\[mark=\*\])?\s*coordinates\s*\{([^{}]{0,4000})\}\s*;\s*(\\addlegendentry\s*\{([^{}]{0,200})\})?/g;
  let x, k = 0;
  while ((x = re.exec(m[2])) && k++ < 8) {
    if (!!x[1] !== (kind === 'line')) return null;
    const pts = [];
    const pr = /\(\s*([^,()]{1,60}),\s*([^,()]{1,60})\)/g;
    let p, j = 0;
    while ((p = pr.exec(x[2])) && j++ < 200) pts.push([p[1].trim(), p[2].trim()]);
    series.push({ name: x[4] ? x[4].trim() : '', pts });
  }
  if (!series.length) return null;
  const rest = m[2].replace(re, '').replace(/\s+/g, '');
  if (rest) return null;
  return { kind, cats, series };
}
// the LaTeX of a chart from a grid: cats, series [{ name, values }]
export function chartTex(kind, cats, series, eol = '\n') {
  const safe = (t) => String(t).replace(/[\\{}%#$&_^~,()[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '?';
  const C = cats.map(safe);
  // (each category once: pgfplots' symbolic coordinates are names)
  for (let i = 0; i < C.length; i++) { let n = C[i], k = 2; while (C.slice(0, i).includes(n)) n = C[i] + ' ' + k++; C[i] = n; }
  const v = (x) => { const n = parseFloat(String(x).replace(',', '.')); return Number.isFinite(n) ? String(Math.round(n * 1e4) / 1e4) : '0'; };
  const axisOpts = kind === 'bar'
    ? ['xbar', 'width=0.8\\linewidth', 'height=6cm', 'xmin=0', 'symbolic y coords={' + C.join(',') + '}', 'ytick=data']
    : [kind === 'line' ? null : 'ybar', 'width=0.8\\linewidth', 'height=6cm', kind === 'line' ? null : 'ymin=0', 'symbolic x coords={' + C.join(',') + '}', 'xtick=data'].filter(Boolean);
  if (series.length > 1) axisOpts.push('legend pos=north west');
  const lines = ['\\begin{tikzpicture}', '\\begin{axis}[' + axisOpts.join(', ') + ']'];
  for (const s of series) {
    const pts = C.map((c, i) => (kind === 'bar' ? '(' + v(s.values[i]) + ',' + c + ')' : '(' + c + ',' + v(s.values[i]) + ')')).join(' ');
    lines.push('\\addplot' + (kind === 'line' ? '+[mark=*]' : '') + ' coordinates {' + pts + '};');
    if (series.length > 1) lines.push('\\addlegendentry{' + safe(s.name) + '}');
  }
  lines.push('\\end{axis}', '\\end{tikzpicture}');
  return lines.join(eol);
}

// ---- shapes: what each of Insert › Shapes writes ------------------------------------------------------
const poly = (k, r, cx, cy, star) => {
  const out = [];
  const n = star ? k * 2 : k;
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + i * 2 * Math.PI / n, rr = star && i % 2 ? r * 0.42 : r;
    out.push('(' + (Math.round((cx + rr * Math.cos(a)) * 100) / 100) + ',' + (Math.round((cy + rr * Math.sin(a)) * 100) / 100) + ')');
  }
  return out.join(' -- ') + ' -- cycle';
};
const FILLED = '[thick, draw=blue!60!black, fill=blue!20]', LINE = '[thick, draw=blue!60!black';
export const SHAPES = [
  ['line', 'Line', LINE + '] (0,0) -- (3,0)', '<path d="M3 15L17 5"/>'],
  ['arrow', 'Arrow', LINE + ', ->] (0,0) -- (3,0)', '<path d="M3 15L16 6M11 5.5l5 .5-1 5"/>'],
  ['double-arrow', 'Double Arrow', LINE + ', <->] (0,0) -- (3,0)', '<path d="M4 14L16 6M11 5.5l5 .5-1 5M9 14.5L4 14l1-5"/>'],
  ['rectangle', 'Rectangle', FILLED + ' (0,0) rectangle (3,2)', '<path d="M3 5h14v10H3z"/>'],
  ['rounded-rectangle', 'Rounded Rectangle', '[thick, draw=blue!60!black, fill=blue!20, rounded corners=6pt] (0,0) rectangle (3,2)', '<rect x="3" y="5" width="14" height="10" rx="3"/>'],
  ['oval', 'Oval', FILLED + ' (1.5,1) ellipse (1.5 and 1)', '<ellipse cx="10" cy="10" rx="7" ry="5"/>'],
  ['circle', 'Circle', FILLED + ' (1,1) circle (1)', '<circle cx="10" cy="10" r="6"/>'],
  ['triangle', 'Triangle', FILLED + ' (0,0) -- (3,0) -- (1.5,2.4) -- cycle', '<path d="M3 16h14L10 4z"/>'],
  ['diamond', 'Diamond', FILLED + ' (1.5,0) -- (3,1.2) -- (1.5,2.4) -- (0,1.2) -- cycle', '<path d="M10 3l7 7-7 7-7-7z"/>'],
  ['pentagon', 'Pentagon', FILLED + ' ' + poly(5, 1.2, 1.2, 1.2), '<path d="M10 3l7 5-2.7 8H5.7L3 8z"/>'],
  ['hexagon', 'Hexagon', FILLED + ' ' + poly(6, 1.2, 1.2, 1.2), '<path d="M10 3l6 3.5v7L10 17l-6-3.5v-7z"/>'],
  ['star', 'Star', FILLED + ' ' + poly(5, 1.3, 1.3, 1.3, true), '<path d="M10 2.5l2.2 5 5.3.4-4 3.5 1.2 5.3L10 14l-4.7 2.7 1.2-5.3-4-3.5 5.3-.4z"/>']
];
export const shapeTex = (id, eol = '\n') => { const s = SHAPES.find((x) => x[0] === id); return s ? ['\\begin{tikzpicture}', '\\draw' + s[2] + ';', '\\end{tikzpicture}'].join(eol) : null; };

// ---- SmartArt: smartdiagram's kinds ------------------------------------------------------------------
export const SMART = [
  ['flow diagram:horizontal', 'Basic Process', 'Steps from left to right'],
  ['flow diagram', 'Vertical Process', 'Steps from top to bottom'],
  ['circular diagram:clockwise', 'Basic Cycle', 'Steps that come round again'],
  ['bubble diagram', 'Bubbles', 'A centre and the ideas round it (the first item in the middle)'],
  ['priority descriptive diagram', 'Priority List', 'Items stacked by priority, the first at the bottom']
];
// smartdiagram's colours stop at ten: an eleventh item stops TeX ("Missing \\endcsname"); a
// bubble diagram takes its centre and ten
export const smartMax = (kind) => (/bubble/.test(kind) ? 11 : 10);
export function smartTex(kind, items) {
  const it = items.map((x) => String(x).replace(/[\\{}%#$&_^~]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, smartMax(kind)).map((x) => (/,/.test(x) ? '{' + x + '}' : x));
  return '\\smartdiagram[' + kind + ']{' + it.join(', ') + '}';
}
// a smartdiagram's items from its argument's text (braced items keep their commas)
export function smartItems(t) {
  const out = [];
  let d = 0, cur = '';
  for (let i = 0; i < t.length && i < MAX_TEXT; i++) {
    const c = t[i];
    if (c === '{') { d++; if (d === 1) continue; }
    if (c === '}') { d--; if (d === 0) continue; }
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; if (out.length >= 30) break; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

// ---- icons: fontawesome5's names, and the page's drawing of each --------------------------------
export const ICONS = [
  ['check', 'Check', '<path d="M4 10.5l4 4 8-9"/>'], ['times', 'Cross', '<path d="M5 5l10 10M15 5L5 15"/>'], ['star', 'Star', '<path d="M10 2.5l2.2 5 5.3.4-4 3.5 1.2 5.3L10 14l-4.7 2.7 1.2-5.3-4-3.5 5.3-.4z"/>'],
  ['heart', 'Heart', '<path d="M10 16.5S3 12 3 7.5A3.5 3.5 0 0 1 10 6a3.5 3.5 0 0 1 7 1.5c0 4.5-7 9-7 9z"/>'], ['envelope', 'Envelope', '<path d="M3 5h14v10H3zM3 5l7 6 7-6"/>'],
  ['phone', 'Phone', '<path d="M5 3h3l1.5 4-2 1.5a9 9 0 0 0 4 4l1.5-2 4 1.5v3a2 2 0 0 1-2 2A13 13 0 0 1 3 5a2 2 0 0 1 2-2z"/>'], ['home', 'Home', '<path d="M3 10l7-6 7 6M5 8.5V16h10V8.5M8.5 16v-4h3v4"/>'],
  ['user', 'User', '<circle cx="10" cy="7" r="3.5"/><path d="M3.5 17a6.5 6.5 0 0 1 13 0"/>'], ['users', 'Users', '<circle cx="7.5" cy="7.5" r="3"/><circle cx="14" cy="8" r="2.5"/><path d="M2 17a5.5 5.5 0 0 1 11 0M12 12a4.5 4.5 0 0 1 6.5 4"/>'],
  ['calendar', 'Calendar', '<path d="M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5"/>'], ['clock', 'Clock', '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>'],
  ['map-marker-alt', 'Map Marker', '<path d="M10 17.5s5.5-5.5 5.5-9.5a5.5 5.5 0 0 0-11 0c0 4 5.5 9.5 5.5 9.5z"/><circle cx="10" cy="8" r="2"/>'], ['globe', 'Globe', '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.5 2.5 2.5 11.5 0 14M10 3c-2.5 2.5-2.5 11.5 0 14"/>'],
  ['link', 'Link', '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2L10 5.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1.1-1.1"/>'],
  ['github', 'GitHub', '<path d="M7.5 16.5c-3.5 1-3.5-1.5-5-2M12.5 18v-2.7a2.4 2.4 0 0 0-.7-1.8c2.3-.3 4.7-1.1 4.7-5a3.9 3.9 0 0 0-1-2.7 3.6 3.6 0 0 0-.1-2.7s-.9-.3-2.9 1.1a10 10 0 0 0-5 0C5.5 2.8 4.6 3.1 4.6 3.1a3.6 3.6 0 0 0-.1 2.7 3.9 3.9 0 0 0-1 2.7c0 3.9 2.4 4.7 4.7 5a2.4 2.4 0 0 0-.7 1.8V18"/>'],
  ['linkedin', 'LinkedIn', '<path d="M3.5 3.5h13v13h-13zM6.5 9v5M6.5 6.5v.1M9.5 14V9M9.5 11a2 2 0 0 1 4 0v3"/>'], ['book', 'Book', '<path d="M4 4.5h5a2 2 0 0 1 1 1.7V17a1.5 1.5 0 0 0-1.5-1.5H4zM16 4.5h-5a2 2 0 0 0-1 1.7V17a1.5 1.5 0 0 1 1.5-1.5H16z"/>'],
  ['graduation-cap', 'Graduation Cap', '<path d="M2 8l8-4 8 4-8 4zM5.5 9.8V14c2.5 2 6.5 2 9 0V9.8M17 8.5v4.5"/>'], ['lightbulb', 'Light Bulb', '<path d="M7.5 14.5h5M8 17h4M7 12.5a5 5 0 1 1 6 0c-.6.5-1 1.2-1 2H8c0-.8-.4-1.5-1-2z"/>'],
  ['exclamation-triangle', 'Warning', '<path d="M10 3l8 14H2zM10 8v4M10 14.5v.1"/>'], ['info-circle', 'Information', '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.5v.1"/>'],
  ['question-circle', 'Question', '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.5 2c-.4.2-.5.6-.5 1v.5M10 14.5v.1"/>'], ['search', 'Search', '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5L17 17"/>'],
  ['cog', 'Settings', '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>'],
  ['chart-bar', 'Bar Chart', '<path d="M3 17h14M5 17V9M9 17V4M13 17v-6M17 17V7"/>'], ['download', 'Download', '<path d="M10 3v10M6 9l4 4 4-4M3.5 16.5h13"/>'],
  ['arrow-right', 'Arrow Right', '<path d="M3 10h13M11 5l5 5-5 5"/>'], ['thumbs-up', 'Thumbs Up', '<path d="M6 9v8H3V9zM6 9l3-6a2 2 0 0 1 2 2v3h4.5a1.5 1.5 0 0 1 1.5 1.8l-1.2 6A1.5 1.5 0 0 1 14.3 17H6"/>'],
  ['laptop', 'Laptop', '<path d="M4.5 5h11v8h-11zM2.5 15.5h15"/>'], ['flag', 'Flag', '<path d="M4.5 17.5V3M4.5 3.5h10l-2 3.5 2 3.5h-10"/>']
];

// ---- the page's drawing ---------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const sv = (doc, tag, attrs) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); return e; };
const PT = 28.4528;                       // TeX points in a centimetre
const ptCss = (pt) => 'calc(var(--pt) * ' + (Math.round(pt * 100) / 100) + ' * 1px)';
let mk = 0;
// A tikzpicture's text drawn as SVG at the size TeX gives it, or null where it holds more than
// plain paths (the page then keeps its source box)
export function drawTikz(text, doc = document) {
  const T = readTikz(text);
  if (!T) return null;
  // the box of every point, circle and ellipse, in cm, y up
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  let lw = 0;
  for (const c of T.cmds) {
    lw = Math.max(lw, (c.opts.width ?? 0.4) / PT);
    for (const s of c.segs) {
      if (s.p) add(...s.p);
      if (s.op === 'rect') { add(...s.a); add(...s.b); }
      if (s.op === 'circle') { add(s.c[0] - s.r, s.c[1] - s.r); add(s.c[0] + s.r, s.c[1] + s.r); }
      if (s.op === 'ellipse') { add(s.c[0] - s.a, s.c[1] - s.b); add(s.c[0] + s.a, s.c[1] + s.b); }
    }
  }
  if (!Number.isFinite(x0)) return null;
  const pad = lw / 2 + 0.05;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.max(0.05, x1 - x0), H = Math.max(0.05, y1 - y0), k = T.scale;
  const svg = sv(doc, 'svg', { viewBox: [x0, -y1, W, H].map((v) => Math.round(v * 1000) / 1000).join(' '), class: 'tz', role: 'img', 'aria-label': 'Drawing' });
  svg.style.width = ptCss(W * k * PT); svg.style.height = ptCss(H * k * PT);
  const defs = sv(doc, 'defs');
  svg.append(defs);
  for (const c of T.cmds) {
    let d = '';
    const P = (p) => p[0] + ' ' + (-p[1]);
    const shapes = [];
    for (const s of c.segs) {
      if (s.op === 'M') d += 'M' + P(s.p);
      else if (s.op === 'L') d += 'L' + P(s.p);
      else if (s.op === 'Z') d += 'Z';
      else if (s.op === 'rect') {
        const x = Math.min(s.a[0], s.b[0]), y = Math.max(s.a[1], s.b[1]), w = Math.abs(s.b[0] - s.a[0]), h = Math.abs(s.b[1] - s.a[1]);
        const r = c.opts.round ? Math.min(c.opts.round / PT, w / 2, h / 2) : 0;
        shapes.push(sv(doc, 'rect', { x, y: -y, width: w, height: h, rx: r, ry: r }));
      } else if (s.op === 'circle') shapes.push(sv(doc, 'circle', { cx: s.c[0], cy: -s.c[1], r: Math.abs(s.r) }));
      else if (s.op === 'ellipse') shapes.push(sv(doc, 'ellipse', { cx: s.c[0], cy: -s.c[1], rx: Math.abs(s.a), ry: Math.abs(s.b) }));
    }
    if (d && /L/.test(d)) shapes.unshift(sv(doc, 'path', { d }));
    const col = c.opts.color || 'rgb(0,0,0)';
    for (const e of shapes) {
      e.setAttribute('fill', c.fill ? (c.opts.fillColor || col) : 'none');
      e.setAttribute('stroke', c.draw ? col : 'none');
      e.setAttribute('stroke-width', String((c.opts.width ?? 0.4) / PT));
      e.setAttribute('stroke-linejoin', c.opts.round ? 'round' : 'miter');
      if (c.opts.opacity != null) e.setAttribute('fill-opacity', String(c.opts.opacity));
      if (c.opts.dash && c.opts.dash !== 'solid') { const w = 1 / PT; e.setAttribute('stroke-dasharray', /dot/.test(c.opts.dash) ? [w * 0.4, w * 2].join(' ') : [w * 3, w * 3].join(' ')); }
      // arrow tips: TikZ's at the path's ends
      if (c.opts.arrow && e.tagName === 'path') {
        const id = 'tza' + (++mk);
        const m = sv(doc, 'marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' });
        m.append(sv(doc, 'path', { d: 'M0 0L10 5L0 10z', fill: col }));
        defs.append(m);
        const a = c.opts.arrow;
        if (/>$|-(stealth|latex)$/.test(a)) e.setAttribute('marker-end', 'url(#' + id + ')');
        if (/^<|^(stealth|latex)-/.test(a)) e.setAttribute('marker-start', 'url(#' + id + ')');
      }
      svg.append(e);
    }
  }
  return svg;
}

// A pgfplots axis of bars or lines drawn as SVG, its width the axis's share of the line
const CYCLE = [['rgb(0,0,255)', 'rgb(178,178,255)'], ['rgb(255,0,0)', 'rgb(255,178,178)'], ['rgb(191,128,64)', 'rgb(236,217,198)'], ['rgb(0,0,0)', 'rgb(178,178,178)']];
export function drawAxis(text, doc = document) {
  const A = readAxis(text);
  if (!A) return null;
  const optsM = /\\begin\{axis\}\[([^\]]{0,2000})\]/.exec(text);
  const o = optsM ? optsM[1] : '';
  const wm = /(?:^|,)\s*width\s*=\s*([\d.]*)\\(linewidth|textwidth|columnwidth)/.exec(o), hm = /(?:^|,)\s*height\s*=\s*([\d.]+)\s*cm/.exec(o);
  const share = wm ? (wm[1] === '' ? 1 : parseFloat(wm[1])) : null;
  const VW = 400, VH = hm && share ? Math.round(VW * parseFloat(hm[1]) / (share * 12.2)) : 280;
  const svg = sv(doc, 'svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'pgf', role: 'img', 'aria-label': 'Chart' });
  svg.style.width = share ? Math.min(100, share * 100) + '%' : ptCss(240 * 0.75 * 1.33);
  const L = 40, R = VW - 10, Tp = 10, B = VH - 30;
  const cats = A.cats || [...new Set(A.series.flatMap((s) => s.pts.map((p) => (A.kind === 'xbar' ? p[1] : p[0]))))].slice(0, 50);
  const vals = A.series.map((s) => s.pts.map((p) => parseFloat(A.kind === 'xbar' ? p[0] : p[1])).filter(Number.isFinite));
  const all = vals.flat();
  if (!all.length) return null;
  let lo = Math.min(0, ...all), hi = Math.max(...all);
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 5);
  hi = Math.ceil(hi / step) * step; lo = Math.floor(lo / step) * step;
  const frame = sv(doc, 'rect', { x: L, y: Tp, width: R - L, height: B - Tp, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8 });
  svg.append(frame);
  const text_ = (x, y, t, anchor) => { const e = sv(doc, 'text', { x, y, 'font-size': 10, 'text-anchor': anchor || 'middle', fill: 'currentColor' }); e.textContent = String(t).slice(0, 40); svg.append(e); };
  const horiz = A.kind === 'xbar';
  const vPos = (v) => (horiz ? L + (v - lo) / (hi - lo) * (R - L) : B - (v - lo) / (hi - lo) * (B - Tp));
  for (let v = lo, n = 0; v <= hi + step / 2 && n < 30; v += step, n++) {
    const p = vPos(v);
    if (horiz) { svg.append(sv(doc, 'line', { x1: p, y1: B, x2: p, y2: B - 4, stroke: 'currentColor', 'stroke-width': 0.6 })); text_(p, B + 12, fmtTick(v)); }
    else { svg.append(sv(doc, 'line', { x1: L, y1: p, x2: L + 4, y2: p, stroke: 'currentColor', 'stroke-width': 0.6 })); text_(L - 4, p + 3, fmtTick(v), 'end'); }
  }
  const nc = Math.max(1, cats.length), band = (horiz ? B - Tp : R - L) / nc;
  const cPos = (i) => (horiz ? Tp + band * (i + 0.5) : L + band * (i + 0.5));
  cats.forEach((c, i) => { if (horiz) text_(L - 4, cPos(i) + 3, c, 'end'); else text_(cPos(i), B + 12, c); });
  const ns = A.series.length;
  A.series.forEach((s, si) => {
    const [stroke, fill] = CYCLE[si % CYCLE.length];
    const pts = s.pts.map((p) => { const cat = horiz ? p[1] : p[0], v = parseFloat(horiz ? p[0] : p[1]); const i = cats.indexOf(cat); return { i: i >= 0 ? i : parseFloat(cat), v }; }).filter((q) => Number.isFinite(q.v) && Number.isFinite(q.i));
    if (A.kind === 'line') {
      const d = pts.map((q, k) => (k ? 'L' : 'M') + cPos(q.i) + ' ' + vPos(q.v)).join('');
      svg.append(sv(doc, 'path', { d, fill: 'none', stroke, 'stroke-width': 1.2 }));
      for (const q of pts) svg.append(sv(doc, 'circle', { cx: cPos(q.i), cy: vPos(q.v), r: 2.5, fill: stroke }));
    } else {
      const bw = Math.min(28, band * 0.7 / ns);
      for (const q of pts) {
        const c = cPos(q.i) - bw * ns / 2 + bw * si, a = vPos(Math.max(lo, Math.min(0, hi))), b = vPos(q.v);
        svg.append(horiz ? sv(doc, 'rect', { x: Math.min(a, b), y: c, width: Math.abs(b - a), height: bw * 0.9, fill, stroke, 'stroke-width': 0.6 })
          : sv(doc, 'rect', { x: c, y: Math.min(a, b), width: bw * 0.9, height: Math.abs(b - a), fill, stroke, 'stroke-width': 0.6 }));
      }
    }
  });
  if (ns > 1) A.series.forEach((s, si) => { svg.append(sv(doc, 'rect', { x: L + 8, y: Tp + 6 + si * 13, width: 10, height: 8, fill: CYCLE[si % CYCLE.length][1], stroke: CYCLE[si % CYCLE.length][0], 'stroke-width': 0.6 })); text_(L + 22, Tp + 13 + si * 13, s.name || '', 'start'); });
  return svg;
}
function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x || 1)), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
const fmtTick = (v) => String(Math.round(v * 1000) / 1000);
// whatever of a raw tikzpicture the page can draw: its paths, or its pgfplots axis
export function drawRaw(text, doc = document) { return drawAxis(text, doc) || drawTikz(text, doc); }

// smartdiagram's boxes and arrows, in its colours
const SMART_COLORS = ['rgb(255,128,128)', 'rgb(128,255,255)', 'rgb(128,128,255)', 'rgb(128,255,128)', 'rgb(255,191,128)', 'rgb(255,255,128)', 'rgb(255,128,255)'];
export function drawSmart(kind, items, doc = document) {
  const it = items.slice(0, 12);
  const n = Math.max(1, it.length);
  const svg = sv(doc, 'svg', { class: 'smart', role: 'img', 'aria-label': 'Diagram: ' + it.join(', ').slice(0, 200) });
  const box = (x, y, w, h, t, k) => {
    svg.append(sv(doc, 'rect', { x, y, width: w, height: h, rx: 6, fill: SMART_COLORS[k % SMART_COLORS.length], stroke: 'rgb(90,90,90)', 'stroke-width': 0.8 }));
    const e = sv(doc, 'text', { x: x + w / 2, y: y + h / 2 + 4, 'font-size': 11, 'text-anchor': 'middle', fill: 'rgb(0,0,0)' });
    e.textContent = String(t).slice(0, 24);
    svg.append(e);
  };
  const arrow = (x1, y1, x2, y2) => svg.append(sv(doc, 'line', { x1, y1, x2, y2, stroke: 'rgb(120,120,120)', 'stroke-width': 3, 'marker-end': '' }));
  let W, H;
  if (/circular/.test(kind) || /bubble/.test(kind)) {
    W = 280; H = 280;
    const cx = 140, cy = 140, R = /bubble/.test(kind) ? 95 : 100;
    const ring = /bubble/.test(kind) ? it.slice(1) : it;
    if (/bubble/.test(kind)) { svg.append(sv(doc, 'circle', { cx, cy, r: 46, fill: SMART_COLORS[0], 'fill-opacity': 0.8 })); const e = sv(doc, 'text', { x: cx, y: cy + 4, 'font-size': 11, 'text-anchor': 'middle' }); e.textContent = String(it[0] || '').slice(0, 20); svg.append(e); }
    ring.forEach((t, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, ring.length), x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      if (/bubble/.test(kind)) { svg.append(sv(doc, 'circle', { cx: x, cy: y, r: 34, fill: SMART_COLORS[(i + 1) % SMART_COLORS.length], 'fill-opacity': 0.8 })); const e = sv(doc, 'text', { x, y: y + 4, 'font-size': 10, 'text-anchor': 'middle' }); e.textContent = String(t).slice(0, 16); svg.append(e); }
      else {
        const b = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / Math.max(1, ring.length);
        svg.append(sv(doc, 'path', { d: 'M' + (cx + R * Math.cos(b - 0.2)) + ' ' + (cy + R * Math.sin(b - 0.2)) + 'A' + R + ' ' + R + ' 0 0 1 ' + (cx + R * Math.cos(b + 0.2)) + ' ' + (cy + R * Math.sin(b + 0.2)), fill: 'none', stroke: 'rgb(150,150,150)', 'stroke-width': 4 }));
        box(x - 40, y - 15, 80, 30, t, i);
      }
    });
  } else if (/priority/.test(kind)) {
    W = 300; H = n * 34 + 6;
    it.forEach((t, i) => box(20 + i * 6, H - 34 - i * 34 + 3, 260 - i * 12, 28, t, i));
  } else if (/horizontal/.test(kind)) {
    W = n * 96; H = 50;
    it.forEach((t, i) => { box(i * 96 + 4, 8, 76, 34, t, i); if (i < n - 1) arrow(i * 96 + 82, 25, i * 96 + 98, 25); });
  } else {
    W = 120; H = n * 56;
    it.forEach((t, i) => { box(10, i * 56 + 4, 100, 34, t, i); if (i < n - 1) arrow(60, i * 56 + 40, 60, i * 56 + 58); });
  }
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.style.width = ptCss(Math.min(W * 0.75, 340));
  return svg;
}

// an icon of fontawesome5 at the text's size (one the table lacks: a plain mark, its name as its title)
export function drawIcon(name, doc = document) {
  const I = ICONS.find((x) => x[0] === name);
  const svg = sv(doc, 'svg', { viewBox: '0 0 20 20', class: 'fa', role: 'img', 'aria-label': I ? I[1] : String(name).slice(0, 40) });
  if (I) {
    // (the table's drawings are the code's own paths, never a document's)
    const g = sv(doc, 'g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    g.innerHTML = I[2];
    svg.append(g);
  } else svg.append(sv(doc, 'rect', { x: 4, y: 4, width: 12, height: 12, rx: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
  return svg;
}
