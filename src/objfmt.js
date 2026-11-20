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

import { tikzCmds, readTikz, readAxis, chartTex, cycleColors, smartItems, colorOf, SMART } from './drawing.js';
import { parse } from './parser.js';

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
  const nodeText = node ? R.cmds[node.k].text.split('\\\\').map((x) => x.trim()).join('\n') : '';
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
  const clean = String(words || '').split(/\r?\n/).map((x) => x.replace(/[\\{}%#$&_^~;]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20).join(' \\\\ ');
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
  return { kind, cats: A.cats, series, opts: A.opts, title: (get(/^title=\{(.*)\}$/) || [])[1] ?? null, xlabel: (get(/^xlabel=\{(.*)\}$/) || [])[1] ?? null, ylabel: (get(/^ylabel=\{(.*)\}$/) || [])[1] ?? null,
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
const clean = (t) => String(t || '').replace(/[\\{}%#$&_^~]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
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
  if (rm && rm[1].trim() === SMART_RESET) reset = { s: de, e: SET_RE.lastIndex };
  const kind = m[2] != null ? m[2].trim() : 'flow diagram';
  const setText = set ? text.slice(set.is, set.ie) : '';
  const kv = entries(setText).map((x) => x.x);
  const get = (k2) => { const x = kv.filter(keyIs(k2)).pop(); return x ? x.slice(x.indexOf('=') + 1).trim() : null; };
  const list = get('set color list');
  const pal = list == null ? 'colorful' : (SMART_PALETTES.find((p) => p[2] && 'set color list={' + p[2].join(',') + '}' === kv.filter(keyIs('set color list')).pop()) || [null])[0] || 'custom';
  return { kind, items: smartItems(text.slice(is, ie)), set, setText, reset, ds, de, ks: m[1] ? ds + m[0].indexOf('[') : -1, ke: m[1] ? ds + m[0].indexOf(']') + 1 : -1, is, ie, palette: pal, border: get('border color') };
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
  const it = items.map((x) => String(x).replace(/[\\{}%#$&_^~]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).map((x) => (/,/.test(x) ? '{' + x + '}' : x));
  if (!it.length) return null;
  const t = it.join(', ');
  return t === text.slice(I.is, I.ie) ? [] : [{ s: I.is, e: I.ie, t }];
}
// A key of the diagram's \smartdiagramset set (null takes it off): the set made where there is none,
// taken off when nothing is left in it; the line that puts the package's colours back follows a
// set with colours, and goes with them
function smartKey(text, key, put, eol) {
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
  if (want && !I.reset) edits.push({ s: I.de, e: I.de, t: eol + '\\smartdiagramset{' + SMART_RESET + '}' });
  if (!want && I.reset) edits.push({ s: I.reset.s, e: I.reset.e, t: '' });
  return edits;
}
export function smartColors(text, id, eol = '\n') {
  const P = SMART_PALETTES.find((p) => p[0] === id);
  if (!P) return null;
  return smartKey(text, colorKeys, P[2] ? 'set color list={' + P[2].join(',') + '}' : null, eol);
}
const colorKeys = (x) => /^(set|uniform) color list\s*=/.test(x);
// Shape Fill: one colour for every item (smartdiagram's uniform color list, for its ten)
export function smartFill(text, color, eol = '\n') {
  if (!okColor(color)) return null;
  return smartKey(text, colorKeys, 'uniform color list=' + color + ' for 10 items', eol);
}
export function smartBorder(text, color, eol = '\n') {
  if (color != null && !okColor(color)) return null;
  return smartKey(text, 'border color', color ? 'border color=' + color : null, eol);
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
// (a drawing, a chart, a SmartArt or a picture: the block it is in, read with the parser's tree)
const BLOCK_ENVS = new Set(['center', 'flushleft', 'flushright', 'figure', 'figure*', 'table', 'table*', 'wrapfigure']);
// The innermost of those environments round [s, e): { name, node: the parser's env, opt: its [..]
// (s, e of the text inside) or null } or null
export function blockOf(src, s, e) {
  let list = parse(src), best = null;
  for (let depth = 0; depth < 60 && list; depth++) {
    const n = list.find((x) => x.s <= s && x.e >= e && (x.t === 'env' || x.t === 'group' || (x.t === 'cmd' && x.args && x.args.some((a) => a && a.nodes && a.is <= s && a.ie >= e))));
    if (!n) break;
    if (n.t === 'env' && BLOCK_ENVS.has(n.name)) best = n;
    list = n.t === 'cmd' ? (n.args.find((a) => a && a.nodes && a.is <= s && a.ie >= e) || {}).nodes : n.nodes;
  }
  if (!best) return null;
  // (a wrapfigure's head takes its side and width too)
  const head = best.name === 'wrapfigure' ? /^\\begin\{wrapfigure\}(\[[^\]]{0,20}\])?\{[^{}]{0,8}\}\{[^{}]{0,60}\}/.exec(src.slice(best.s, best.s + 120)) : /^\\begin\{[a-z*]+\}(\s*\[([^\]]{0,40})\])?/.exec(src.slice(best.s, best.s + 80));
  if (best.name === 'wrapfigure') return { name: best.name, node: best, opt: null, headEnd: best.s + (head ? head[0].length : 18) };
  return { name: best.name, node: best, opt: head && head[1] ? { s: best.s + head[0].indexOf('[') + 1, e: best.s + head[0].length - 1, t: head[2] } : null, headEnd: best.s + (head ? head[0].length : 0) };
}
const DECL = /\\(centering|raggedleft|raggedright)\b[ \t]*(\r?\n)?/;
// Left, center or right: center, flushleft or flushright; in a float its \centering, \raggedright or
// \raggedleft. Returns { align: 'left'|'center'|'right', block } or null where the object stands in a
// paragraph of its own words
export function alignOf(src, s, e) {
  const B = blockOf(src, s, e);
  if (!B) return null;
  if (B.name === 'center' || B.name === 'flushleft' || B.name === 'flushright') return { align: { center: 'center', flushleft: 'left', flushright: 'right' }[B.name], block: B };
  const body = src.slice(B.headEnd, s);
  const m = /\\(centering|raggedleft|raggedright)\b/g;
  let x, last = null;
  while ((x = m.exec(body))) last = x[1];
  return { align: last === 'centering' ? 'center' : last === 'raggedleft' ? 'right' : last === 'raggedright' ? 'left' : 'left', block: B };
}
export function alignEdits(src, s, e, how) {
  const A = alignOf(src, s, e);
  if (!A || !['left', 'center', 'right'].includes(how)) return null;
  if (A.align === how) return [];
  const B = A.block;
  if (/^(center|flushleft|flushright)$/.test(B.name)) {
    const name = { left: 'flushleft', center: 'center', right: 'flushright' }[how];
    const z = src.lastIndexOf('\\end{' + B.name + '}', B.node.e);
    return [{ s: B.node.s + 7, e: B.node.s + 7 + B.name.length, t: name }, { s: z + 5, e: z + 5 + B.name.length, t: name }];
  }
  // a float: its declaration in place, or one after its \begin line; left is a float's own
  const word = { left: 'raggedright', center: 'centering', right: 'raggedleft' }[how];
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
// packages } or { error }.
export function positionOf(src, s, e) {
  const B = blockOf(src, s, e);
  if (!B) return { mode: 'other' };
  if (B.name === 'wrapfigure') { const m = /^\\begin\{wrapfigure\}(\[[^\]]*\])?\{([lrioLRIO])\}/.exec(src.slice(B.node.s, B.node.s + 60)); return { mode: 'wrap', side: m ? m[2].toLowerCase() : 'r', block: B }; }
  if (/^figure\*?$|^table\*?$/.test(B.name)) return { mode: 'float', place: B.opt ? B.opt.t : '', block: B };
  return { mode: 'inline', block: B };
}
export function positionEdits(src, s, e, to) {
  const P = positionOf(src, s, e);
  if (P.mode === 'other') return { error: 'The object stands in a paragraph of words: put it in a paragraph of its own first.' };
  const B = P.block, nl = /\r\n/.test(src.slice(B.node.s, B.node.e)) ? '\r\n' : '\n';
  const inner = src.slice(B.headEnd, src.lastIndexOf('\\end{' + B.name + '}', B.node.e));
  const hasCap = /\\caption\b/.test(inner);
  const A = alignOf(src, s, e);
  const decl = A && A.align !== 'left' ? '\\' + (A.align === 'center' ? 'centering' : 'raggedleft') + nl : '';
  const z = src.lastIndexOf('\\end{' + B.name + '}', B.node.e), ze = z + 6 + B.name.length;
  const whole = (head, tail, body) => [{ s: B.node.s, e: B.headEnd, t: head }, { s: z, e: ze, t: tail }, ...(body || [])];
  // the body without its \centering or \raggedleft (a float's), when it becomes a center again
  const dropDecl = () => { const m = DECL.exec(inner); return m ? [{ s: B.headEnd + m.index, e: B.headEnd + m.index + m[0].length, t: '' }] : []; };
  const lead = (t) => (/^\r?\n/.test(inner) ? t : t + nl);
  if (to.mode === 'float') {
    const place = String(to.place || 'htbp').replace(/[^htbpH!]/g, '') || 'htbp';
    if (P.mode === 'float') return P.place === place ? { edits: [] } : { edits: B.opt ? [{ s: B.opt.s, e: B.opt.e, t: place }] : [{ s: B.headEnd, e: B.headEnd, t: '[' + place + ']' }], packages: place.includes('H') ? ['float'] : [] };
    const head = '\\begin{figure}[' + place + ']' + (P.mode === 'inline' ? lead(nl + decl).replace(/\r?\n$/, '') : '');
    const edits = P.mode === 'inline' ? whole(head.replace(/(\r?\n)$/, ''), '\\end{figure}') : whole('\\begin{figure}[' + place + ']', '\\end{figure}');
    if (P.mode === 'inline' && decl) edits[0].t = '\\begin{figure}[' + place + ']' + nl + decl.replace(/\r?\n$/, '');
    return { edits, packages: place.includes('H') ? ['float'] : [] };
  }
  if (to.mode === 'wrap') {
    const side = to.side === 'l' ? 'l' : 'r';
    if (P.mode === 'wrap') return P.side === side ? { edits: [] } : { edits: sideEdit(src, B, side), packages: ['wrapfig'] };
    const head = '\\begin{wrapfigure}{' + side + '}{0pt}' + (P.mode === 'inline' ? nl + '\\centering' : '');
    return { edits: whole(head, '\\end{wrapfigure}'), packages: ['wrapfig'] };
  }
  // in line with the text
  if (P.mode === 'inline') return { edits: [] };
  if (hasCap) return { error: 'Its caption needs a figure: take the caption off first, or keep it a figure.' };
  const name = { left: 'flushleft', center: 'center', right: 'flushright' }[A ? A.align : 'center'] || 'center';
  return { edits: whole('\\begin{' + name + '}', '\\end{' + name + '}', dropDecl()) };
}
function sideEdit(src, B, side) {
  const m = /^\\begin\{wrapfigure\}(\[[^\]]*\])?\{([lrioLRIO])\}/.exec(src.slice(B.node.s, B.node.s + 60));
  if (!m) return [];
  const at = B.node.s + m[0].length - 2;
  return [{ s: at, e: at + 1, t: side }];
}
