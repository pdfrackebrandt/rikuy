// Formatting an object after it is in the document, as Word's Shape Format, Chart Design and Format,
// SmartArt Design and Format tabs do: every control is a small edit of the object's own LaTeX, read
// back by src/drawing.js so the page draws what TeX prints.
//
//   a shape (Insert › Shapes, or a TikZ picture of plain paths): its commands' options (fill=,
//     draw=, line width=, dashes, arrow tips), a \node of words at its middle, the picture's scale,
//     the order its commands are drawn in (Bring Forward, Send Backward)
//   a chart (Insert › Chart, pgfplots): one key of its axis (title=, xlabel=, ymajorgrids, nodes
//     near coords, legend pos=, cycle list=, width=, height=), or the chart written again from its
//     data with those keys kept (Change Chart Type, Switch Row/Column, Edit Data)
//   a SmartArt (smartdiagram): its kind ([flow diagram:horizontal]), its items, and the keys of a
//     \smartdiagramset just before it (colours, border colour). smartdiagram defines a colour list
//     globally, past any group: a diagram given colours of its own is followed by a line that puts
//     the package's own colours back, so the diagrams after it print as before (and as the page
//     draws them).
//
// Each function takes the object's text and returns edits [{ s, e, t }] on that text (offsets in
// it), or null where the object is not one it reads; pure, bounded and tested on strings
// (test/objfmt.test.mjs).

import { tikzCmds, readTikz, readAxis, chartTex, cycleColors, smartItems, colorOf, SMART, escTeX, unTeX } from './drawing.js';
import { parse } from './parser.js';
import { FLOATS, BOXES, WRAP_OK } from './picture.js';

// ---- option lists ----------------------------------------------------------------------------------
// the entries of a list "a, b={c,d}, e" with where each is (trimmed), braces kept whole; a %
// comment to its line's end is no part of an entry, and a comma in it no separator
export function entries(t, base = 0) {
  const out = [];
  let d = 0, s = 0, last = -1;   // last: the end of the entry's last character that is no space or comment
  const push = (e) => {
    let a = s;
    // (past spaces and whole comment lines before the entry)
    for (;;) { while (a < e && /\s/.test(t[a])) a++; if (t[a] === '%') { const nl = t.indexOf('\n', a); a = nl < 0 || nl > e ? e : nl + 1; continue; } break; }
    const z = last >= a ? last : a;
    if (z > a) out.push({ s: base + a, e: base + z, x: t.slice(a, z) });
  };
  for (let i = 0; i < t.length && i < 20000; i++) {
    const c = t[i];
    if (c === '%' && t[i - 1] !== '\\') { const nl = t.indexOf('\n', i); if (nl < 0) break; i = nl; continue; }
    if (c === '{') d++;
    else if (c === '}') d = Math.max(0, d - 1);
    else if (c === ',' && d === 0) { push(i); s = i + 1; last = -1; continue; }
    if (!/\s/.test(c)) last = i + 1;
  }
  push(t.length);
  return out;
}
// A list's text with the entries match() finds taken out and put (when given) in the place of the
// first of them, or after the last entry. Edited in place: every other character stays where it is,
// comments and a list written one key a line included (an entry goes with one separator; a new one
// comes after the last entry's own characters, before any space or comment after it, with the
// separator the list already uses).
export function listSet(t, match, put) {
  const E = entries(t);
  const hits = E.filter((x) => match(x.x));
  const cuts = [];
  if (hits.length && put != null) cuts.push({ s: hits[0].s, e: hits[0].e, t: put });
  for (const h of hits.slice(put != null ? 1 : 0)) {
    const k = E.indexOf(h);
    // (with the separator after it, or, the last one, the separator before it)
    if (k + 1 < E.length) cuts.push({ s: h.s, e: E[k + 1].s, t: '' });
    else if (k > 0 && !hits.includes(E[k - 1])) cuts.push({ s: E[k - 1].e, e: h.e, t: '' });
    else if (k > 0) cuts.push({ s: E[k - 1].e, e: h.e, t: '' });
    else cuts.push({ s: h.s, e: h.e, t: '' });
  }
  if (!hits.length && put != null) {
    if (!E.length) { const lead = /^\s*/.exec(t)[0].length; cuts.push({ s: lead, e: lead, t: put }); }
    else {
      const L = E[E.length - 1];
      // (the separator the list uses between its last two entries: ", ", "," or a comma and a new line)
      let sep = ', ';
      if (E.length > 1) { const between = t.slice(E[E.length - 2].e, L.s).replace(/%[^\n]*/g, ''); sep = /\n/.test(between) ? ',' + between.slice(between.lastIndexOf('\n')) : /,\s/.test(between) ? ', ' : ','; }
      cuts.push({ s: L.e, e: L.e, t: sep + put });
    }
  }
  // (overlapping cuts of two neighbours: the later from the end of the earlier)
  cuts.sort((x, y) => x.s - y.s);
  for (let i = 1; i < cuts.length; i++) if (cuts[i].s < cuts[i - 1].e) cuts[i].s = cuts[i - 1].e;
  let out = t;
  for (const c of cuts.slice().reverse()) out = out.slice(0, c.s) + c.t + out.slice(Math.max(c.s, c.e));
  return out;
}
const apply = (src, edits) => { for (const x of [...edits].sort((a, b) => b.s - a.s)) src = src.slice(0, x.s) + x.t + src.slice(x.e); return src; };
export { apply as applyEdits };

// ---- colours: Word's theme grid as xcolor's names and tints -----------------------------------------
// columns of a colour and its tints (c!80 is 80% c, the rest white) and shades (c!75!black)
const HUES = ['blue', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'violet', 'brown', 'gray'];
export const SHADES = ['', '!80', '!60', '!40', '!20', '!75!black', '!50!black'];
export const COLOR_GRID = SHADES.map((sh) => HUES.map((h) => h + sh));
const hex = (rgb) => { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb || ''); return m ? m.slice(1).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() : '000000'; };
export const colorHex = (name) => hex(colorOf(name));
// a name the page can draw and TeX reads: xcolor's own and their mixes ("blue!60!black")
export const okColor = (c) => typeof c === 'string' && c.length < 60 && !!colorOf(c);

// ---- shapes: a TikZ picture's commands ------------------------------------------------------------
const WIDTHS = /^(ultra thin|very thin|thin|semithick|thick|very thick|ultra thick)$/;
const isWidth = (x) => WIDTHS.test(x) || /^line width\s*=/.test(x);
const isDash = (x) => /^(dashed|dotted|densely dashed|densely dotted|loosely dashed|loosely dotted|dash dot|densely dash dot|loosely dash dot|solid)$/.test(x);
const isArrow = (x) => /^(->|<-|<->|-stealth|stealth-|stealth-stealth|-latex|latex-|latex-latex|>-<|-)$/.test(x);
const keyIs = (k) => (x) => new RegExp('^' + k + '\\s*=').test(x);
const closed = (c) => c.segs && c.segs.some((s) => s.op === 'Z' || s.op === 'rect' || s.op === 'circle' || s.op === 'ellipse');

// What a drawing holds, for the controls: its commands (index, name, closed or a line, a node),
// the first shape's look, the words of its first node
export function shapeInfo(text) {
  const T = tikzCmds(text), R = readTikz(text);
  if (!T || !R) return null;
  const cmds = T.cmds.map((c, k) => ({ k, name: c.name, node: !!R.cmds[k].node, closed: closed(R.cmds[k]), opts: c.os >= 0 ? entries(text.slice(c.os + 1, c.oe - 1)).map((x) => x.x) : [] }));
  const shape = cmds.find((c) => !c.node);
  const look = (c) => {
    if (!c) return {};
    const o = c.opts, kv = (k) => { const x = o.filter(keyIs(k)).pop(); return x ? x.slice(x.indexOf('=') + 1).trim() : null; };
    const flag = o.find((x) => colorOf(x));
    const w = o.find(isWidth);
    const lw = !w ? 0.4 : /=/.test(w) ? parseFloat(w.split('=')[1]) : { 'ultra thin': 0.1, 'very thin': 0.2, thin: 0.4, semithick: 0.6, thick: 0.8, 'very thick': 1.2, 'ultra thick': 1.6 }[w];
    return { fill: kv('fill') || (c.name === 'fill' || c.name === 'filldraw' ? flag || 'black' : null), outline: kv('draw') || kv('color') || flag || (c.name === 'fill' ? 'none' : 'black'),
      weight: lw, dash: o.find(isDash) || 'solid', arrow: o.find(isArrow) || '-' };
  };
  const node = cmds.find((c) => c.node);
  const nodeText = node ? R.cmds[node.k].text.split('\\\\').map((x) => unTeX(x.trim())).join('\n') : '';
  return { cmds, look: look(shape), lookOf: (k) => look(cmds[k]), text: nodeText, lines: !cmds.some((c) => c.closed), closed: cmds.some((c) => c.closed) };
}

// one command's options written: its [list] replaced, added after the command's name, or taken off
// (the smallest edit inside the brackets; the brackets go when nothing is left in them)
function optsEdit(text, c, list) {
  if (c.os >= 0) {
    if (!list.trim()) return { s: c.os, e: c.oe, t: '' };
    const d = diff(text.slice(c.os + 1, c.oe - 1), list)[0];
    return d ? { s: c.os + 1 + d.s, e: c.os + 1 + d.e, t: d.t } : null;
  }
  if (!list.trim()) return null;
  const at = c.s + 1 + c.name.length;
  return { s: at, e: at, t: '[' + list + ']' };
}
// The edits that set one property of a drawing's commands (ks: their indexes, null for all):
//   fill: an xcolor name, or 'none'; outline: a name or 'none'; weight: points; dash: 'solid',
//   'dashed', 'dotted', 'dash dot'; arrow: '-', '->', '<-', '<->'; style: { outline, fill }
export function shapeSet(text, prop, value, ks = null) {
  const T = tikzCmds(text), R = readTikz(text);
  if (!T || !R) return null;
  const edits = [];
  T.cmds.forEach((c, k) => {
    if (ks && !ks.includes(k)) return;
    const r = R.cmds[k];
    if (r.node) return;
    const cur = c.os >= 0 ? text.slice(c.os + 1, c.oe - 1) : '';
    let list = cur;
    const filled = c.name === 'fill' || c.name === 'filldraw';
    const one = (p, v) => {
      if (p === 'fill') {
        if (!closed(r)) return;
        if (v === 'none') list = filled ? listSet(list, keyIs('fill'), 'fill=none') : listSet(list, keyIs('fill'), null);
        else list = listSet(list, keyIs('fill'), 'fill=' + v);
      } else if (p === 'outline') {
        // (a bare colour coloured the fill too: kept for it as fill= where nothing else says it)
        const flag = entries(list).map((x) => x.x).find((x) => colorOf(x));
        if (flag && (filled || entries(list).some((x) => keyIs('fill')(x.x)) === false && filled) && !entries(list).some((x) => keyIs('fill')(x.x))) list = listSet(list, (x) => x === flag, 'fill=' + flag);
        list = listSet(list, (x) => !!colorOf(x) || keyIs('color')(x), null);
        list = listSet(list, keyIs('draw'), v === 'none' ? (filled || closed(r) ? 'draw=none' : null) : 'draw=' + v);
      } else if (p === 'weight') {
        const n = Math.round(parseFloat(v) * 100) / 100;
        list = listSet(list, isWidth, Number.isFinite(n) && n > 0 ? 'line width=' + n + 'pt' : null);
      } else if (p === 'dash') list = listSet(list, isDash, v && v !== 'solid' ? v : null);
      else if (p === 'arrow') { if (closed(r)) return; list = listSet(list, isArrow, v && v !== '-' ? v : null); }
    };
    if (prop === 'style') { one('outline', value.outline); one('fill', value.fill); } else one(prop, value);
    if (list !== cur) { const e = optsEdit(text, c, list); if (e) edits.push(e); }
  });
  return edits;
}

// The words in a shape: its first \node's text set (a line each; \\ between), a node added at the
// middle of the drawing's box where it has none, taken off when the words are empty
export function shapeTextSet(text, words, eol = '\n') {
  const T = tikzCmds(text), R = readTikz(text);
  if (!T || !R) return null;
  // (TeX's special characters escaped, as escTeX writes them; a ; in the braces ends nothing)
  const clean = String(words || '').split(/\r?\n/).map((x) => escTeX(x.replace(/\s+/g, ' ').trim())).filter(Boolean).slice(0, 20).join(' \\\\ ');
  const k = R.cmds.findIndex((c) => c.node);
  if (k >= 0) {
    const c = T.cmds[k];
    if (!clean) {
      // (its line goes whole: from the line's start to after its end)
      let s = c.s, e = c.e;
      while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
      if (text[s - 1] === '\n') { s--; if (text[s - 1] === '\r') s--; } else if (text[e] === '\r' || text[e] === '\n') e += text[e] === '\r' ? 2 : 1;
      return [{ s, e, t: '' }];
    }
    const o = text.indexOf('{', c.rest[0]), z = text.lastIndexOf('}', c.e);
    return o < 0 || z < o ? null : [{ s: o + 1, e: z, t: clean }];
  }
  if (!clean) return [];
  // the middle of the shapes' box, in the drawing's own units
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const c of R.cmds) for (const s of c.segs || []) {
    if (s.p) add(...s.p);
    if (s.op === 'rect') { add(...s.a); add(...s.b); }
    if (s.op === 'circle') { add(s.c[0] - s.r, s.c[1] - s.r); add(s.c[0] + s.r, s.c[1] + s.r); }
    if (s.op === 'ellipse') { add(s.c[0] - s.a, s.c[1] - s.b); add(s.c[0] + s.a, s.c[1] + s.b); }
  }
  const r2 = (v) => String(Math.round(v * 100) / 100);
  // (on a line, the words just above its middle, as Word's text on a line sits)
  const lines = !R.cmds.some(closed);
  const at = '(' + r2((x0 + x1) / 2) + ',' + r2(lines ? y1 + 0.3 : (y0 + y1) / 2) + ')';
  let p = T.end;
  while (p > 0 && (text[p - 1] === ' ' || text[p - 1] === '\t')) p--;
  const nl = text[p - 1] === '\n';
  return [{ s: p, e: p, t: (nl ? '' : eol) + '\\node[align=center] at ' + at + ' {' + clean + '};' + eol }];
}

// The drawing's size: its box in cm (the paths', without the lines' width) at its scale, and that
// scale; shapeSize writes scale= (or xscale= and yscale= when the shape is to change) on
// \begin{tikzpicture} so the box is w by h cm
export function shapeBox(text) {
  const R = readTikz(text);
  if (!R) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const c of R.cmds) {
    if (c.node) continue;
    for (const s of c.segs) {
      if (s.p) add(...s.p);
      if (s.op === 'rect') { add(...s.a); add(...s.b); }
      if (s.op === 'circle') { add(s.c[0] - s.r, s.c[1] - s.r); add(s.c[0] + s.r, s.c[1] + s.r); }
      if (s.op === 'ellipse') { add(s.c[0] - s.a, s.c[1] - s.b); add(s.c[0] + s.a, s.c[1] + s.b); }
    }
  }
  if (!Number.isFinite(x0)) return null;
  const nw = x1 - x0, nh = y1 - y0;
  return { nw, nh, xs: R.xs, ys: R.ys, w: nw * R.xs, h: nh * R.ys };
}
export function shapeSize(text, w, h) {
  const T = tikzCmds(text), B = shapeBox(text);
  if (!T || !B) return null;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  let xs = B.nw > 1e-9 && w > 0 ? r3(w / B.nw) : B.xs, ys = B.nh > 1e-9 && h > 0 ? r3(h / B.nh) : B.ys;
  if (!(xs > 0 && xs <= 50 && ys > 0 && ys <= 50)) return null;
  // (a line along one axis has no size across it: its scale there follows the other)
  if (B.nw <= 1e-9) xs = ys; if (B.nh <= 1e-9) ys = xs;
  const cur = T.po ? text.slice(T.po.s + 1, T.po.e - 1) : '';
  const put = xs === ys ? (xs === 1 ? null : 'scale=' + xs) : 'xscale=' + xs + ', yscale=' + ys;
  const list = listSet(cur, (x) => /^(x|y)?scale\s*=/.test(x), put);
  if (list === cur) return [];
  const at = text.indexOf('\\begin{tikzpicture}') + 19;
  if (!T.po) return [{ s: at, e: at, t: '[' + list + ']' }];
  if (!list.trim()) return [{ s: T.po.s, e: T.po.e, t: '' }];
  return diff(cur, list).map((x) => ({ s: T.po.s + 1 + x.s, e: T.po.s + 1 + x.e, t: x.t }));
}

// Bring Forward, Send Backward, Bring to Front, Send to Back: command k drawn later or earlier
// (TikZ draws in the order written: the last on top). One edit over the commands that move; each
// command keeps the line it is on. Returns { edits, k: its new index } or null where it cannot move.
export function shapeOrder(text, k, how) {
  const T = tikzCmds(text);
  if (!T || !readTikz(text) || !T.cmds[k]) return null;
  const n = T.cmds.length;
  const to = how === 'forward' ? k + 1 : how === 'backward' ? k - 1 : how === 'front' ? n - 1 : how === 'back' ? 0 : -1;
  if (to < 0 || to >= n || to === k) return null;
  const lo = Math.min(k, to), hi = Math.max(k, to);
  // each command a slot of whole lines: from its line's start to its last line's end, its own
  // comment with it; the lines between slots stay. A command sharing a line with another moves
  // nothing (its neighbour or a comment would go with it, or end up inside the comment).
  const slot = (c) => {
    const ls = text.lastIndexOf('\n', c.s - 1) + 1;
    let le = text.indexOf('\n', c.e);
    if (le < 0 || le > T.end) le = T.end;
    const before = text.slice(ls, c.s), after = text.slice(c.e, le);
    if (before.trim() || (after.trim() && !/^\s*%/.test(after))) return null;
    return { s: ls, e: /\r$/.test(text.slice(ls, le)) ? le - 1 : le };
  };
  const slots = [];
  for (let i = lo; i <= hi; i++) { const x = slot(T.cmds[i]); if (!x) return null; slots.push(x); }
  const body = slots.map((x) => text.slice(x.s, x.e));
  const order = [...Array(hi - lo + 1).keys()];
  const from = k - lo;
  order.splice(from, 1);
  order.splice(to - lo, 0, from);
  let t = '';
  for (let i = 0; i < slots.length; i++) t += body[order[i]] + (i + 1 < slots.length ? text.slice(slots[i].e, slots[i + 1].s) : '');
  return { edits: [{ s: slots[0].s, e: slots[slots.length - 1].e, t }], k: to };
}

// ---- charts: Rikuy's pgfplots axis -------------------------------------------------------------------
// Chart Styles' colours: [id, name, [[draw, fill] for each series]] (null: pgfplots' own)
export const PALETTES = [
  ['colorful', 'Colorful', null],
  ['colorful-2', 'Colorful 2', [['teal', 'teal!40!white'], ['orange', 'orange!40!white'], ['violet', 'violet!40!white'], ['olive', 'olive!40!white']]],
  ['blue', 'Monochromatic Blue', [['blue!70!black', 'blue!70!white'], ['blue!70!black', 'blue!45!white'], ['blue!70!black', 'blue!25!white'], ['blue!70!black', 'blue!10!white']]],
  ['green', 'Monochromatic Green', [['green!50!black', 'green!60!black'], ['green!50!black', 'green!45!white'], ['green!50!black', 'green!25!white'], ['green!50!black', 'green!10!white']]],
  ['orange', 'Monochromatic Orange', [['orange!70!black', 'orange'], ['orange!70!black', 'orange!55!white'], ['orange!70!black', 'orange!30!white'], ['orange!70!black', 'orange!15!white']]],
  ['gray', 'Monochromatic Gray', [['black', 'darkgray'], ['black', 'gray'], ['black', 'lightgray'], ['black', 'black!10!white']]]
];
export const LEGEND_POS = [['north west', 'Top Left'], ['north east', 'Top Right'], ['south west', 'Bottom Left'], ['south east', 'Bottom Right'], ['outer north east', 'Right']];
// the cycle list a palette writes: bars filled, lines and their marks in the drawing colour
export function cycleText(id, kind) {
  const P = PALETTES.find((p) => p[0] === id);
  if (!P || !P[2]) return null;
  return 'cycle list={' + P[2].map(([d, f]) => (kind === 'line' ? '{' + d + ',mark=*}' : '{draw=' + d + ',fill=' + f + ',mark=none}')).join(',') + '}';
}
const CORE = [/^(x|y)bar$/, /^(x|y)min=0$/, /^symbolic (x|y) coords=/, /^(x|y)tick=data$/];
// A chart Rikuy wrote, read: its kind, data and Chart Design's settings
export function chartInfo(text) {
  const A = readAxis(text);
  if (!A) return null;
  const kind = A.kind === 'xbar' ? 'bar' : A.kind === 'ybar' ? 'column' : 'line';
  const series = A.series.map((x, i) => ({ name: x.name || 'Series ' + (i + 1), values: A.cats.map((c) => { const q = x.pts.find((p) => (A.kind === 'xbar' ? p[1] : p[0]) === c); return q ? (A.kind === 'xbar' ? q[0] : q[1]) : ''; }) }));
  const get = (re) => { const x = A.opts.find((z) => re.test(z)); return x ? re.exec(x) : null; };
  const cyc = A.opts.find((x) => /^cycle list=/.test(x));
  const pal = cyc ? (PALETTES.find((p) => cycleText(p[0], kind) === cyc) || [null])[0] || 'custom' : 'colorful';
  const w = get(/^width=([\d.]*)\\linewidth$/), h = get(/^height=([\d.]+)cm$/);
  const words = (re) => { const x = get(re); return x ? unTeX(x[1]) : null; };
  return { kind, cats: A.cats, series, opts: A.opts, title: words(/^title=\{(.*)\}$/), xlabel: words(/^xlabel=\{(.*)\}$/), ylabel: words(/^ylabel=\{(.*)\}$/),
    grid: !!get(/^(x|y)majorgrids$/), labels: A.opts.includes('nodes near coords'), legend: (get(/^legend pos=(.+)$/) || [])[1] || null, palette: pal,
    width: w ? (w[1] === '' ? 1 : parseFloat(w[1])) : null, height: h ? parseFloat(h[1]) : null, extra: A.opts.filter((x) => !CORE.some((r) => r.test(x))) };
}
// the axis's [options] in the chart's text: { s, e } of what is between the brackets
function axisRange(text) {
  const i = text.indexOf('\\begin{axis}[');
  if (i < 0) return null;
  let d = 0;
  for (let j = i + 13; j < text.length && j < i + 4000; j++) {
    const c = text[j];
    // (a ] in a comment ends nothing)
    if (c === '%' && text[j - 1] !== '\\') { const nl = text.indexOf('\n', j); if (nl < 0) return null; j = nl; continue; }
    if (c === '{') d++; else if (c === '}') d--; else if (c === ']' && d === 0) return { s: i + 13, e: j };
  }
  return null;
}
const clean = (t) => escTeX(String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120));
// One of Chart Design's or Format's settings, as one edit of the axis's options: title, xlabel,
// ylabel (words; '' takes it off), grid (on or off), labels (data labels), legend (a corner of
// LEGEND_POS), palette (an id of PALETTES), width (a share of the line), height (cm)
export function chartSet(text, prop, value) {
  const I = chartInfo(text), R = axisRange(text);
  if (!I || !R) return null;
  const cur = text.slice(R.s, R.e);
  let list = cur;
  if (prop === 'title' || prop === 'xlabel' || prop === 'ylabel') { const v = clean(value); list = listSet(list, keyIs(prop), v ? prop + '={' + v + '}' : null); }
  else if (prop === 'grid') list = listSet(list, (x) => /^(x|y)majorgrids$/.test(x), value ? (I.kind === 'bar' ? 'xmajorgrids' : 'ymajorgrids') : null);
  else if (prop === 'labels') list = listSet(list, (x) => x === 'nodes near coords', value ? 'nodes near coords' : null);
  else if (prop === 'legend') { if (I.series.length < 2 || !LEGEND_POS.some((p) => p[0] === value)) return null; list = listSet(list, keyIs('legend pos'), 'legend pos=' + value); }
  else if (prop === 'palette') { if (!PALETTES.some((p) => p[0] === value)) return null; list = listSet(list, keyIs('cycle list'), cycleText(value, I.kind)); }
  else if (prop === 'width') { const v = Math.round(parseFloat(value) * 100) / 100; if (!(v > 0.05 && v <= 1)) return null; list = listSet(list, keyIs('width'), 'width=' + v + '\\linewidth'); }
  else if (prop === 'height') { const v = Math.round(parseFloat(value) * 100) / 100; if (!(v >= 1 && v <= 30)) return null; list = listSet(list, keyIs('height'), 'height=' + v + 'cm'); }
  else return null;
  return diff(cur, list).map((x) => ({ s: R.s + x.s, e: R.s + x.e, t: x.t }));
}
// The chart written again (Change Chart Type, Switch Row/Column, Edit Data) with its settings kept;
// a palette's cycle list rewritten for the new kind. One edit, over what differs.
export function chartRewrite(text, kind, cats, series) {
  const I = chartInfo(text);
  if (!I) return null;
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const extra = I.extra.map((x) => (/^cycle list=/.test(x) && I.palette !== 'custom' && I.palette !== 'colorful' ? cycleText(I.palette, kind) : x));
  return diff(text, chartTex(kind, cats, series, eol, extra));
}
// Switch Row/Column: the series become the categories
export function chartSwitch(text) {
  const I = chartInfo(text);
  if (!I) return null;
  return chartRewrite(text, I.kind, I.series.map((s) => s.name), I.cats.map((c, i) => ({ name: c, values: I.series.map((s) => s.values[i]) })));
}
// the one edit that makes a into b: what lies between their common start and end
export function diff(a, b) {
  if (a === b) return [];
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  return [{ s, e: a.length - e, t: b.slice(s, b.length - e) }];
}

// ---- SmartArt: smartdiagram ---------------------------------------------------------------------------
// smartdiagram's own colours, as the package sets them when it loads (and again after a diagram
// with colours of its own)
export const SMART_RESET = 'set color list={red!40,cyan!40,blue!40,green!40,orange!40,yellow!40,magenta!40,brown!40,violet!40,teal!40}';
// Change Colors: [id, name, its ten colours] (null: the package's own)
export const SMART_PALETTES = [
  ['colorful', 'Colorful', null],
  ['colorful-2', 'Colorful 2', ['teal!40', 'orange!40', 'violet!40', 'olive!40', 'cyan!40', 'red!40', 'lime!60', 'blue!30', 'brown!40', 'gray!40']],
  ['blue', 'Blue', ['blue!50', 'blue!43', 'blue!37', 'blue!31', 'blue!25', 'blue!20', 'blue!16', 'blue!12', 'blue!9', 'blue!6']],
  ['green', 'Green', ['green!50!black!60', 'green!45', 'green!38', 'green!31', 'green!25', 'green!20', 'green!16', 'green!12', 'green!9', 'green!6']],
  ['orange', 'Orange', ['orange!60', 'orange!52', 'orange!44', 'orange!37', 'orange!30', 'orange!24', 'orange!19', 'orange!14', 'orange!10', 'orange!7']],
  ['teal', 'Teal', ['teal!60', 'teal!52', 'teal!44', 'teal!37', 'teal!30', 'teal!24', 'teal!19', 'teal!14', 'teal!10', 'teal!7']],
  ['gray', 'Gray', ['gray!60', 'gray!52', 'gray!44', 'gray!37', 'gray!30', 'gray!24', 'gray!19', 'gray!14', 'gray!10', 'gray!7']]
];
// (green!50!black!60 is three mixes: xcolor reads it, the page's colours too)
const SET_RE = /\\smartdiagramset\s*\{((?:[^{}]|\{[^{}]*\})*)\}/y;
// The object: [\smartdiagramset{…}] \smartdiagram[kind]{items} [\smartdiagramset{SMART_RESET}],
// read with where each part is
export function smartInfo(text) {
  if (typeof text !== 'string' || text.length > 8000) return null;
  let i = 0, set = null;
  while (/\s/.test(text[i] || '')) i++;
  SET_RE.lastIndex = i;
  const sm = SET_RE.exec(text);
  if (sm) { set = { s: i, e: SET_RE.lastIndex, is: i + sm[0].indexOf('{') + 1, ie: SET_RE.lastIndex - 1 }; i = SET_RE.lastIndex; while (/\s/.test(text[i] || '')) i++; }
  const d = /\\smartdiagram\s*(\[([^\]{}]{0,80})\])?\s*\{/y;
  d.lastIndex = i;
  const m = d.exec(text);
  if (!m) return null;
  const ds = i, is = d.lastIndex;
  let k = is, depth = 1;
  while (k < text.length && depth) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; k++; }
  if (depth) return null;
  const de = k, ie = k - 1;
  let reset = null, j = de;
  while (/\s/.test(text[j] || '')) j++;
  SET_RE.lastIndex = j;
  const rm = SET_RE.exec(text);
  // (Rikuy's line that puts the colours of before back: marked by its comment, or the package's own
  // list as the first ones were written)
  if (rm) { const tail = /^% rikuy: colours back/.exec(text.slice(SET_RE.lastIndex, SET_RE.lastIndex + 30)); if (tail) reset = { s: de, e: SET_RE.lastIndex + tail[0].length }; else if (rm[1].trim() === SMART_RESET) reset = { s: de, e: SET_RE.lastIndex }; }
  const kind = m[2] != null ? m[2].trim() : 'flow diagram';
  const setText = set ? text.slice(set.is, set.ie) : '';
  const kv = entries(setText).map((x) => x.x);
  const get = (k2) => { const x = kv.filter(keyIs(k2)).pop(); return x ? x.slice(x.indexOf('=') + 1).trim() : null; };
  const list = get('set color list');
  const pal = list == null ? 'colorful' : (SMART_PALETTES.find((p) => p[2] && 'set color list={' + p[2].join(',') + '}' === kv.filter(keyIs('set color list')).pop()) || [null])[0] || 'custom';
  return { kind, items: smartItems(text.slice(is, ie)).map(unTeX), set, setText, reset, ds, de, ks: m[1] ? ds + m[0].indexOf('[') : -1, ke: m[1] ? ds + m[0].indexOf(']') + 1 : -1, is, ie, palette: pal, border: get('border color') };
}
// Change Layout: the diagram's kind, the one edit of its [option]
export function smartLayout(text, kind) {
  const I = smartInfo(text);
  if (!I || typeof kind !== 'string' || !/^[a-z :]{3,60}$/.test(kind)) return null;
  if (I.kind === kind) return [];
  if (I.ks >= 0) return [{ s: I.ks, e: I.ke, t: '[' + kind + ']' }];
  const at = text.indexOf('\\smartdiagram', I.ds) + 13;
  return [{ s: at, e: at, t: '[' + kind + ']' }];
}
// The items again (Text Pane, Add Shape, Move Up, Move Down), each as smartTex writes them
export function smartItemsSet(text, items) {
  const I = smartInfo(text);
  if (!I) return null;
  const it = items.map((x) => escTeX(String(x).replace(/\s+/g, ' ').trim())).filter(Boolean).map((x) => (/,/.test(x) ? '{' + x + '}' : x));
  if (!it.length) return null;
  const t = it.join(', ');
  return t === text.slice(I.is, I.ie) ? [] : [{ s: I.is, e: I.ie, t }];
}
// A key of the diagram's \smartdiagramset set (null takes it off): the set made where there is none,
// taken off when nothing is left in it; the line that puts the package's colours back follows a
// set with colours, and goes with them
// back: the colour list in effect before the diagram (the document's own, docColorList, or the
// package's)
export function docColorList(preamble) {
  const re = /\\smartdiagramset\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  let m, last = null;
  while ((m = re.exec(String(preamble || '').slice(0, 200000)))) { const e = entries(m[1]).map((x) => x.x).filter((x) => /^set color list\s*=/.test(x)).pop(); if (e) last = e; }
  return last || SMART_RESET;
}
function smartKey(text, key, put, eol, back = SMART_RESET) {
  const I = smartInfo(text);
  if (!I) return null;
  const cur = I.setText;
  const list = listSet(cur, typeof key === 'function' ? key : keyIs(key), put);
  const edits = [];
  const hasColors = (l) => entries(l).some((x) => /^(set|uniform) color list\s*=/.test(x.x));
  if (list !== cur) {
    if (!I.set) edits.push({ s: I.ds, e: I.ds, t: '\\smartdiagramset{' + list + '}' + eol });
    else if (!list.trim()) edits.push({ s: I.set.s, e: I.ds, t: '' });
    else edits.push(...diff(cur, list).map((x) => ({ s: I.set.is + x.s, e: I.set.is + x.e, t: x.t })));
  }
  const want = hasColors(list);
  if (want && !I.reset) edits.push({ s: I.de, e: I.de, t: eol + '\\smartdiagramset{' + back + '}% rikuy: colours back' });
  if (!want && I.reset) edits.push({ s: I.reset.s, e: I.reset.e, t: '' });
  return edits;
}
export function smartColors(text, id, eol = '\n', back) {
  const P = SMART_PALETTES.find((p) => p[0] === id);
  if (!P) return null;
  return smartKey(text, colorKeys, P[2] ? 'set color list={' + P[2].join(',') + '}' : null, eol, back);
}
const colorKeys = (x) => /^(set|uniform) color list\s*=/.test(x);
// Shape Fill: one colour for every item (smartdiagram's uniform color list, for its ten)
export function smartFill(text, color, eol = '\n', back) {
  if (!okColor(color)) return null;
  return smartKey(text, colorKeys, 'uniform color list=' + color + ' for 10 items', eol, back);
}
export function smartBorder(text, color, eol = '\n', back) {
  if (color != null && !okColor(color)) return null;
  return smartKey(text, 'border color', color ? 'border color=' + color : null, eol, back);
}
// Reset Graphic: the \smartdiagramset and the line after it gone, the diagram as Insert wrote it
export function smartResetEdits(text) {
  const I = smartInfo(text);
  if (!I) return null;
  const out = [];
  if (I.set) out.push({ s: I.set.s, e: I.ds, t: '' });
  if (I.reset) out.push({ s: I.reset.s, e: I.reset.e, t: '' });
  return out;
}
// Right to Left: a cycle's way round
export const smartTurns = (kind) => /^circular diagram/.test(kind);
export const smartFlip = (kind) => (/counterclockwise/.test(kind) ? 'circular diagram:clockwise' : 'circular diagram:counterclockwise');
export const SMART_LAYOUTS = SMART.concat([['circular diagram:counterclockwise', 'Basic Cycle, Right to Left', 'Steps that come round again, the other way']]);

// ---- Arrange: where an object stands, and its alignment --------------------------------------------
// (a drawing, a chart, a SmartArt or a picture: the block it is in, read with the parser's tree; the
// floats and boxes are picture.js's one list)
const ALIGN_ENVS = new Set(['center', 'flushleft', 'flushright']);
// (floats Position writes and reads; the others set their own place: sideways, beside the caption,
// in the margin)
const MOVABLE = /^(figure|table|wrapfigure|wraptable)\*?$/;
const WRAPS = /^wrap(figure|table)$/;
const headOf = (src, n) => {
  // (a wrapfigure's or wraptable's head takes its side and width too)
  const m = WRAPS.test(n.name) ? /^\\begin\{wrap(figure|table)\}(\[[^\]]{0,20}\])?\{[^{}]{0,8}\}\{[^{}]{0,60}\}/.exec(src.slice(n.s, n.s + 120)) : /^\\begin\{[A-Za-z*]+\}(\s*\[([^\]]{0,40})\])?/.exec(src.slice(n.s, n.s + 80));
  return { name: n.name, node: n, opt: !WRAPS.test(n.name) && m && m[1] ? { s: n.s + m[0].indexOf('[') + 1, e: n.s + m[0].length - 1, t: m[2] } : null, headEnd: n.s + (m ? m[0].length : 8 + n.name.length) };
};
// What stands round [s, e): { float: the outermost float (a float holds no float: Position works on
// it), align: the innermost center, flushleft or flushright, box: { name, cmd } of a box, a table's
// cell, a footnote or a command's argument round the block Position changes (no float comes out of
// one), multicols: the columns round it, outside: the environments round that block, outermost first }.
// nodes: the parser's tree of src where the caller keeps it (the app's picTree), else src is parsed.
export function blockOf(src, s, e, nodes) {
  let list = nodes || parse(src), F = null, A = null;
  const path = [];
  for (let depth = 0; depth < 60 && list; depth++) {
    const n = list.find((x) => x.s <= s && x.e >= e && (x.t === 'env' || x.t === 'group' || (x.t === 'cmd' && x.args && x.args.some((a) => a && a.nodes && a.is <= s && a.ie >= e))));
    // (the object itself is no surrounding)
    if (!n || (n.s >= s && n.e <= e)) break;
    if (n.t !== 'group') path.push(n);
    if (n.t === 'env' && FLOATS.test(n.name) && !F) F = n;
    if (n.t === 'env' && ALIGN_ENVS.has(n.name)) A = n;
    list = n.t === 'cmd' ? (n.args.find((a) => a && a.nodes && a.is <= s && a.ie >= e) || {}).nodes : n.nodes;
  }
  const at = F || A, out = at ? path.slice(0, path.indexOf(at)) : path;
  const bx = out.find((n) => n.t === 'cmd' || BOXES.test(n.name));
  return { float: F ? headOf(src, F) : null, align: A ? headOf(src, A) : null, box: bx ? { name: bx.name, cmd: bx.t === 'cmd' } : null,
    multicols: out.some((n) => n.t === 'env' && /^multicols\*?$/.test(n.name)), outside: out.filter((n) => n.t === 'env').map((n) => n.name) };
}
const DECL = /\\(centering|raggedleft|raggedright)\b[ \t]*(\r?\n)?/;
const DECL_OF = { center: 'centering', right: 'raggedleft', left: 'raggedright' };
const ENV_DECL = { center: 'centering', flushleft: 'raggedright', flushright: 'raggedleft' };
// Left, center or right: a center, flushleft or flushright round it (in a float or not); else a
// float's \centering, \raggedright or \raggedleft. { align, block } or null where it stands in a
// paragraph of its own words
export function alignOf(src, s, e, nodes) {
  const B = blockOf(src, s, e, nodes);
  if (B.align && (!B.float || B.align.node.s > B.float.node.s)) return { align: { center: 'center', flushleft: 'left', flushright: 'right' }[B.align.name], block: B.align, env: true };
  if (!B.float) return null;
  const F = B.float, body = src.slice(F.headEnd, s);
  const m = /\\(centering|raggedleft|raggedright)\b/g;
  let x, last = null;
  while ((x = m.exec(body))) last = x[1];
  return { align: last === 'centering' ? 'center' : last === 'raggedleft' ? 'right' : 'left', block: F, env: false };
}
export function alignEdits(src, s, e, how, nodes) {
  const A = alignOf(src, s, e, nodes);
  if (!A || !['left', 'center', 'right'].includes(how)) return null;
  if (A.align === how) return [];
  const B = A.block;
  if (A.env) {
    const name = { left: 'flushleft', center: 'center', right: 'flushright' }[how];
    const z = src.lastIndexOf('\\end{' + B.name + '}', B.node.e);
    return [{ s: B.node.s + 7, e: B.node.s + 7 + B.name.length, t: name }, { s: z + 5, e: z + 5 + B.name.length, t: name }];
  }
  // a float: its declaration in place, or one after its \begin line; left is a float's own
  const word = DECL_OF[how];
  const body = src.slice(B.headEnd, s);
  const m = DECL.exec(body);
  if (m) {
    const at = B.headEnd + m.index;
    return how === 'left' && m[1] !== 'raggedright' ? [{ s: at, e: at + m[0].length, t: '' }] : [{ s: at + 1, e: at + 1 + m[1].length, t: word }];
  }
  if (how === 'left') return [];
  const nl = /\r\n/.test(src.slice(B.node.s, B.node.e)) ? '\r\n' : '\n';
  const after = src[B.headEnd] === '\n' || src[B.headEnd] === '\r' ? B.headEnd + (src[B.headEnd] === '\r' ? 2 : 1) : B.headEnd;
  return [{ s: after, e: after, t: '\\' + word + nl }];
}
// Position: in line with the text (a center), a figure placed by LaTeX ([htbp], [t], [b], [p], [h],
// [H]), or at a side with the text wrapping round it (wrapfig's wrapfigure, {l} or {r}, at its
// natural width: {0pt}). to: { mode: 'inline' | 'float' | 'wrap', place, side }. Returns { edits,
// packages } or { error }. A float is never put inside a float: the one round it is changed; a
// table stays a table (table, wraptable).
export function positionOf(src, s, e, nodes) {
  const B = blockOf(src, s, e, nodes);
  const F = B.float;
  if (F && !MOVABLE.test(F.name)) return { mode: 'fixed', block: F, B };
  if (F && WRAPS.test(F.name)) { const m = /^\\begin\{wrap(?:figure|table)\}(\[[^\]]*\])?\{([lrioLRIO])\}/.exec(src.slice(F.node.s, F.node.s + 60)); return { mode: 'wrap', side: m ? m[2].toLowerCase() : 'r', block: F, B, kind: /table/.test(F.name) ? 'table' : 'figure' }; }
  if (F) return { mode: 'float', place: F.opt ? F.opt.t : '', block: F, B, kind: /^table/.test(F.name) ? 'table' : 'figure', star: /\*$/.test(F.name) };
  if (B.align) return { mode: 'inline', block: B.align, B, kind: 'figure' };
  return { mode: 'other', B };
}
// (what follows the object's block, for wrapfig: a list or a display just after it is no text to
// wrap round, and wrapfig floats the figure to the end then)
const LISTISH = /^\s*(\\begin\{(itemize|enumerate|description|equation\*?|align\*?|gather\*?|multline\*?|center|figure|table|tabular)\}|\\\[|\$\$|\\(section|subsection|chapter|paragraph)\b|\\end\{document\})/;
const LIST_ENVS = /^(itemize|enumerate|description|list|compactitem|compactenum|asparaenum|inparaenum)$/;
const CELLS = /^(tabular\*?|tabularx|tabulary|longtable|xltabular|tabu|array|tblr|longtblr|talltblr|NiceTabular\*?|NiceArray)$/;
const boxSays = (b) => (b.cmd ? (b.name === 'footnote' ? 'a footnote' : b.name === 'marginpar' ? 'a margin note' : 'a box (\\' + b.name + ')') : CELLS.test(b.name) ? 'a table\'s cell' : b.name === 'minipage' ? 'a minipage' : 'a box (' + b.name + ')');
// Why the object cannot go to `to` from where it stands, or null (the Position menu greys it, as Word
// greys what cannot apply)
export function positionWhyNot(P, to) {
  if (P.mode === 'other') return 'The object stands in a paragraph of words: put it in a paragraph of its own first.';
  if (P.mode === 'fixed') return 'It stands in a ' + P.block.name + ', which sets its own place: edit its source to move it.';
  if (P.B.box && to.mode !== 'inline') return 'It stands inside ' + boxSays(P.B.box) + ': LaTeX cannot float it from there.';
  if (P.star && to.mode !== 'float') return 'A figure across the page\'s columns (' + P.block.name + ') has no in-line or wrapped form: it stays a ' + P.block.name + '.';
  if (P.B.multicols && to.mode !== 'inline' && !P.star) return 'It stands in columns (multicols): LaTeX drops a figure there ("Floats and marginpars not allowed inside multicols"), and wrapfig cannot wrap in a column; it stays in line with the text.';
  if (to.mode === 'wrap' && P.mode !== 'wrap') {
    const bad = P.B.outside.filter((n) => !WRAP_OK.test(n));
    if (bad.length) {
      const n = bad[bad.length - 1];
      return LIST_ENVS.test(n) ? 'wrapfig cannot wrap text in a list (' + n + '): it would float the figure away ("wrapfigure used inside a conflicting environment"). Move it out of the list first.'
        : 'wrapfig cannot wrap text inside ' + n + ' ("wrapfigure used inside a conflicting environment"): move it out first.';
    }
  }
  return null;
}
export function positionEdits(src, s, e, to, nodes) {
  const P = positionOf(src, s, e, nodes);
  const why = positionWhyNot(P, to);
  if (why) return { error: why };
  const B = P.block, nl = /\r\n/.test(src.slice(B.node.s, B.node.e)) ? '\r\n' : '\n';
  const z = src.lastIndexOf('\\end{' + B.name + '}', B.node.e), ze = z + 6 + B.name.length;
  const inner = src.slice(B.headEnd, z);
  const hasCap = /\\caption\b/.test(inner);
  const A = alignOf(src, s, e, nodes);
  const whole = (head, tail, more) => [{ s: B.node.s, e: B.headEnd, t: head }, { s: z, e: ze, t: tail }, ...(more || [])];
  const lineAfter = (p) => (src[p] === '\r' ? p + 2 : src[p] === '\n' ? p + 1 : p);
  const lineBefore = (p) => { let q = p; while (q > 0 && (src[q - 1] === ' ' || src[q - 1] === '\t')) q--; return src[q - 1] === '\n' ? q - (src[q - 2] === '\r' ? 2 : 1) : p; };
  // (a center, flushleft or flushright inside the float)
  const inAlign = P.B.align && P.B.align.node.s > B.node.s ? P.B.align : null;
  if (to.mode === 'wrap' && P.mode !== 'wrap') {
    const after = src.slice(ze, ze + 400);
    if (LISTISH.test(after.replace(/^[ \t]*(\r?\n[ \t]*)*(%[^\n]*\n\s*)*/, ''))) return { error: 'A list, a display, a heading or another block comes right after it: wrapfig would float it to the end of the text there (as TeX says, "Stationary wrapfigure forced to float"). Put a paragraph of words after it first.' };
  }
  if (to.mode === 'float') {
    const place = String(to.place || 'htbp').replace(/[^htbpH!]/g, '') || 'htbp';
    const pk = place.includes('H') ? ['float'] : [];
    if (P.mode === 'float') return P.place === place ? { edits: [] } : { edits: B.opt ? [{ s: B.opt.s, e: B.opt.e, t: place }] : [{ s: B.headEnd, e: B.headEnd, t: '[' + place + ']' }], packages: pk };
    if (P.mode === 'wrap') return { edits: whole('\\begin{' + P.kind + '}[' + place + ']', '\\end{' + P.kind + '}'), packages: pk };
    // in line: its center (or flushleft, flushright) becomes the figure, its alignment a declaration
    const decl = A && A.align !== 'left' ? nl + '\\' + DECL_OF[A.align] : '';
    return { edits: whole('\\begin{figure}[' + place + ']' + decl, '\\end{figure}'), packages: pk };
  }
  if (to.mode === 'wrap') {
    const side = to.side === 'l' ? 'l' : 'r';
    if (P.mode === 'wrap') return P.side === side ? { edits: [] } : { edits: sideEdit(src, B, side), packages: ['wrapfig'] };
    const env = 'wrap' + P.kind;
    if (P.mode === 'float') {
      // (a {0pt} wrapfigure sets its body in one line's mode, where a center, a list, cannot stand:
      // "Not allowed in LR mode"; it becomes the declaration \centering, \raggedright, \raggedleft)
      const un = inAlign ? (() => { const az = src.lastIndexOf('\\end{' + inAlign.name + '}', inAlign.node.e); return [{ s: inAlign.node.s, e: inAlign.headEnd, t: '\\' + ENV_DECL[inAlign.name] }, { s: lineBefore(az), e: az + 6 + inAlign.name.length, t: '' }]; })() : [];
      return { edits: whole('\\begin{' + env + '}{' + side + '}{0pt}', '\\end{' + env + '}', un), packages: ['wrapfig'] };
    }
    return { edits: whole('\\begin{' + env + '}{' + side + '}{0pt}' + nl + '\\centering', '\\end{' + env + '}'), packages: ['wrapfig'] };
  }
  // in line with the text
  if (P.mode === 'inline') return { edits: [] };
  if (hasCap) return { error: 'Its caption needs a ' + P.kind + ': take the caption off first, or keep it a ' + P.kind + '.' };
  // (a center inside the float: the float's lines go, the center stays)
  if (inAlign) return { edits: [{ s: B.node.s, e: lineAfter(B.headEnd), t: '' }, { s: lineBefore(z), e: ze, t: '' }] };
  const name = { left: 'flushleft', center: 'center', right: 'flushright' }[A ? A.align : 'center'] || 'center';
  const dm = DECL.exec(inner);
  return { edits: whole('\\begin{' + name + '}', '\\end{' + name + '}', dm ? [{ s: B.headEnd + dm.index, e: B.headEnd + dm.index + dm[0].length, t: '' }] : []) };
}
function sideEdit(src, B, side) {
  const m = /^\\begin\{wrap(?:figure|table)\}(\[[^\]]*\])?\{([lrioLRIO])\}/.exec(src.slice(B.node.s, B.node.s + 60));
  if (!m) return [];
  const at = B.node.s + m[0].length - 2;
  return [{ s: at, e: at + 1, t: side }];
}
