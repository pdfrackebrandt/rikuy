// Pictures in the source, as Word's Picture Format tab edits them: an \includegraphics found in
// the parser's tree with what stands around it (the boxes that flip, turn or frame it, the block
// it is in: a center, a figure float, a wrapfigure, a paragraph of its own or a sentence), and
// the smallest edits for its size, crop, rotation, flips, border, alt text, position, wrapping and
// caption. Hand written forms are read the same way (\reflectbox, \scalebox{1}[-1], \rotatebox,
// \fbox, \resizebox, trim or viewport, \textwidth or \columnwidth widths) and edited in their own
// form; what Rikuy writes comes off byte for byte. No DOM here: test/picture.test.mjs runs it in
// node. Also the natural size TeX gives a PNG, JPEG or PDF (from the file's own header, the
// resolution TeX reads: a picture's size and crop are in TeX's units, not the screen's), and the
// box graphicx makes of a picture's keys, for the page to draw it as TeX prints it.
//
// Every scan is bounded: a stranger's document is parsed once by the parser (linear) and its
// option lists read by preamble.js's parseKV; nothing here backtracks.

import { parseKV, kvEdits } from './preamble.js';

const WRAPS = new Set(['reflectbox', 'scalebox', 'rotatebox', 'fbox', 'resizebox']);
const FLOATS = /^(figure|table|wrapfigure|wraptable|SCfigure|SCtable|sidewaysfigure|sidewaystable|marginfigure)\*?$/;
const BOXES = /^(minipage|subfigure|subtable|tabular|tabularx|tabular\*|tabulary|longtable|array|adjustbox|tcolorbox|mdframed|parbox|tikzpicture|columns|column)$/;
const LISTS = /^(itemize|enumerate|description|list|compactitem|compactenum)$/;
// what may stand beside the picture in a figure or a center and still leave it the picture's own
const FLOAT_OK = new Set(['centering', 'caption', 'captionof', 'label', 'vspace', 'par', 'small', 'footnotesize', 'noindent', 'medskip', 'smallskip', 'bigskip', 'raggedright', 'raggedleft']);
const BLOCK = /^(section|subsection|subsubsection|chapter|part|paragraph|subparagraph|item|par|newpage|clearpage|maketitle|bigskip|medskip|smallskip|vspace|noindent|centering|caption|label)\*?$/;
export const LW = /\\(linewidth|textwidth|columnwidth|hsize)\b/;

const blank = (src, n) => n.t === 'comment' || n.t === 'par' || (n.t === 'text' && !/\S/.test(src.slice(n.s, n.e)));
const solid = (src, nodes) => (nodes || []).filter((n) => !blank(src, n));
export const eolOf = (src) => (/\r\n/.test(src.slice(0, 20000)) ? '\r\n' : '\n');
const fmt = (v, d = 3) => String(Math.round(v * 10 ** d) / 10 ** d);

// ---- finding it ----------------------------------------------------------------------------------
// The picture whose \includegraphics starts at s in a parsed text, with its surroundings; null
// where there is none. path: the nodes it lies in, outermost first (envs, groups, commands with
// the argument it is in).
export function findPicture(src, nodes, s) {
  const path = [];
  let list = nodes, n = null;
  for (let depth = 0; depth < 300 && list; depth++) {
    let next = null;
    for (const x of list) {
      if (x.s > s) break;
      if (s >= x.e) continue;
      if (x.t === 'cmd' && x.name === 'includegraphics' && x.s === s) { n = x; break; }
      if (x.t === 'cmd') { for (const a of x.args) if (a && !a.raw && s >= a.is && s < a.ie) { path.push({ n: x, a }); next = a.nodes; break; } }
      else if (x.t === 'env' || x.t === 'group') { if (s >= (x.be ?? x.is ?? x.s) && s < (x.es ?? x.ie ?? x.e)) { path.push({ n: x }); next = x.nodes; } }
      break;
    }
    if (n || !next) break;
    list = next;
  }
  if (!n) return null;
  const opt = n.args[0] && n.args[0].o ? n.args[0] : null;
  const fa = n.args.find((a) => a && !a.o);
  if (!fa) return null;
  const P = { s: n.s, e: n.e, ne: n.ne, star: !!n.star, opt, file: { s: fa.s, e: fa.e, is: fa.is, ie: fa.ie, name: src.slice(fa.is, fa.ie).trim() }, eol: eolOf(src) };
  // graphics' own form ([llx,lly][urx,ury], a bounding box) takes no keys
  P.keyval = !opt || /=|^\s*[A-Za-z]+\s*(,|$)/.test(src.slice(opt.is, opt.ie)) || !/\S/.test(src.slice(opt.is, opt.ie));
  if (opt && n.args[1] && n.args[1].o) P.keyval = false;
  P.kv = opt && P.keyval ? parseKV(src, opt.is, opt.ie) : [];
  // the boxes around it, innermost first: each holds nothing but the one inside
  P.wraps = [];
  let inner = n, k = path.length - 1;
  for (; k >= 0; k--) {
    const { n: w, a } = path[k];
    if (w.t === 'cmd' && WRAPS.has(w.name) && a === lastMand(w) && only(src, a.nodes, inner)) {
      const W = { kind: w.name, s: w.s, e: w.e, is: a.is, ie: a.ie, n: w };
      if (w.name === 'reflectbox') W.kind = 'fliph';
      else if (w.name === 'scalebox') {
        const x = num(argText(src, w.args[0])), y = w.args[1] && w.args[1].o ? num(argText(src, w.args[1])) : x;
        if (x === 1 && y === -1) W.kind = 'flipv';
        else if (x === -1 && y === 1) W.kind = 'fliph';
        else W.kind = 'scale';
        W.sx = x; W.sy = y;
      } else if (w.name === 'rotatebox') { W.kind = 'rot'; W.arg = w.args.find((b) => b && !b.o); W.angle = num(argText(src, W.arg)); }
      else if (w.name === 'fbox') W.kind = 'border';
      else if (w.name === 'resizebox') { W.kind = 'resize'; W.w = w.args[0]; W.h = w.args[1]; }
      P.wraps.push(W);
      inner = w;
      continue;
    }
    // {\setlength{\fboxsep}{0pt}\fbox{...}}: the border Rikuy writes, one group
    if (w.t === 'group' && inner.t === 'cmd' && inner.name === 'fbox') {
      const sol = solid(src, w.nodes);
      if (sol.length === 2 && sol[1] === inner && tightSep(src, sol[0])) { const B = P.wraps[P.wraps.length - 1]; B.group = { s: w.s, e: w.e }; B.ours = sol[0].s === w.s + 1 && inner.s === sol[0].e && inner.e === w.e - 1 && src.slice(sol[0].s, sol[0].e) === '\\setlength{\\fboxsep}{0pt}'; inner = w; continue; }
    }
    break;
  }
  P.outer = { s: inner.s, e: inner.e };
  P.parent = k >= 0 ? path[k] : null;
  P.path = path;
  P.anc = { float: false, box: false, multicols: false, list: false, frame: false };
  for (let j = 0; j <= k; j++) {
    const x = path[j].n;
    if (x.t === 'env') {
      if (FLOATS.test(x.name)) P.anc.float = x;
      if (BOXES.test(x.name)) P.anc.box = x;
      if (/^multicols\*?$/.test(x.name)) P.anc.multicols = x;
      if (LISTS.test(x.name)) P.anc.list = x;
      if (x.name === 'frame') P.anc.frame = x;
    } else if (x.t === 'cmd' && j < k) P.anc.box = P.anc.box || x;
  }
  P.block = blockOf(src, P, inner, nodes);
  return P;
}

function lastMand(w) { const m = w.args.filter((a) => a && !a.o); return m[m.length - 1]; }
function only(src, nodes, x) { const s = solid(src, nodes); return s.length === 1 && s[0] === x; }
const argText = (src, a) => (a ? src.slice(a.is, a.ie).trim() : '');
const num = (t) => { const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*$/.exec(t); return m ? parseFloat(m[1]) : NaN; };
function tightSep(src, n) {
  const t = src.slice(n.s, n.e).replace(/\s+/g, '');
  return /^\\setlength\{?\\fboxsep\}?\{0(pt|cm|mm|in|bp)?\}$/.test(t) || /^\\fboxsep=?0(pt)?$/.test(t);
}

// The block the picture (with its boxes) stands in: kind 'inline' (a center, flushleft or
// flushright of its own), 'float' (a figure), 'wrap' (a wrapfigure), 'para' (a paragraph of its
// own), 'sentence' (among words), 'box' (a minipage, a cell, a box command: it cannot float from
// there), 'other'. sole: nothing but the picture, its caption and label in it.
function blockOf(src, P, inner, root) {
  const par = P.parent;
  const out = { kind: 'other', env: null, sole: false, caption: null, label: null, centering: null };
  if (par && par.n.t === 'env') {
    const E = par.n;
    out.env = E;
    const sol = solid(src, E.nodes);
    for (const x of sol) {
      if (x.t !== 'cmd') continue;
      if ((x.name === 'caption' || x.name === 'captionof') && !out.caption) out.caption = x;
      else if (x.name === 'label' && !out.label) out.label = x;
      else if (x.name === 'centering' && !out.centering) out.centering = x;
    }
    out.sole = sol.every((x) => x === inner || (x.t === 'cmd' && FLOAT_OK.has(x.name)));
    if (/^(center|flushleft|flushright)$/.test(E.name)) out.kind = P.anc.box ? 'box' : 'inline';
    else if (/^figure\*?$/.test(E.name)) out.kind = 'float';
    else if (E.name === 'wrapfigure') out.kind = 'wrap';
    else if (BOXES.test(E.name)) out.kind = 'box';
    else out.kind = paraKind(src, E.nodes, inner, P);
  } else if (par && par.n.t === 'cmd') out.kind = 'box';
  else if (par && par.n.t === 'group') out.kind = paraKind(src, par.n.nodes, inner, P);
  else out.kind = paraKind(src, root, inner, P);
  if (out.kind === 'para' || out.kind === 'sentence') { out.env = null; out.sole = out.kind === 'para'; }
  return out;
}
function paraKind(src, nodes, inner, P) {
  if (P.anc.box) return 'box';
  const i = nodes.indexOf(inner);
  if (i < 0) return 'other';
  const stop = (x) => x.t === 'par' || x.t === 'env' || (x.t === 'cmd' && BLOCK.test(x.name)) || (x.t === 'math' && x.display);
  const quiet = (x) => blank(src, x) || (x.t === 'cmd' && /^(noindent|centering)$/.test(x.name));
  for (let j = i - 1; j >= 0; j--) { const x = nodes[j]; if (stop(x)) break; if (!quiet(x)) return 'sentence'; }
  for (let j = i + 1; j < nodes.length; j++) { const x = nodes[j]; if (stop(x)) break; if (!quiet(x)) return 'sentence'; }
  return 'para';
}

// The node that starts at s, and the environments around a place (each walk bounded by the depth)
export function nodeAt(nodes, s) {
  let list = nodes;
  for (let d = 0; d < 300 && list; d++) {
    let next = null;
    for (const x of list) {
      if (x.s > s) break;
      if (s >= x.e) continue;
      if (x.s === s) return x;
      if (x.t === 'cmd') { for (const a of x.args) if (a && !a.raw && s >= a.is && s < a.ie) { next = a.nodes; break; } }
      else if (x.nodes) next = x.nodes;
      break;
    }
    list = next;
  }
  return null;
}
export function envsAt(nodes, p) {
  const out = [];
  let list = nodes;
  for (let d = 0; d < 300 && list; d++) {
    let next = null;
    for (const x of list) {
      if (x.s > p) break;
      if (p >= x.e) continue;
      if (x.t === 'env') { if (p >= (x.be ?? x.s) && p <= (x.es ?? x.e)) { out.push(x.name); next = x.nodes; } }
      else if (x.t === 'cmd') { for (const a of x.args) if (a && !a.raw && p >= a.is && p < a.ie) { next = a.nodes; break; } }
      else if (x.t === 'group') next = x.nodes;
      break;
    }
    list = next;
  }
  return out;
}

// ---- keys ------------------------------------------------------------------------------------------
export const keyOf = (P, k) => { const x = P.kv.find((i) => i.key === k); return x ? (x.value == null ? true : x.value) : undefined; };
const unbrace = (v) => (typeof v === 'string' && /^\{[\s\S]*\}$/.test(v) ? v.slice(1, -1) : v);

// The edits that set keys of the picture's options: { key: value } sets, true a flag, null takes
// it out. Brackets come where there were none and go where none is left.
const SIZE_KEYS = new Set(['width', 'height', 'totalheight', 'scale', 'keepaspectratio']);
export function keyEdits(src, P, changes) {
  if (!P.keyval) return null;
  // A size key added where an angle is: before it. graphicx applies the keys in their order, and
  // one after the angle sizes the turned box: a height after angle=-90 or 180 (a box all depth,
  // height 0) stops TeX with "Division by 0", and a width and height after it cannot distort the
  // picture as Word's fields do
  const ai = P.kv.findIndex((i) => i.key === 'angle');
  const late = ai < 0 ? [] : Object.entries(changes).filter(([k, v]) => v != null && SIZE_KEYS.has(k) && !P.kv.some((i) => i.key === k));
  if (late.length) {
    const rest = Object.fromEntries(Object.entries(changes).filter(([k]) => !late.some(([x]) => x === k)));
    const e1 = kvEdits(src, P.opt.is, P.opt.ie, rest);
    let t = src.slice(P.opt.is, P.opt.ie);
    for (const x of e1) t = t.slice(0, x.s - P.opt.is) + x.t + t.slice(x.e - P.opt.is);
    const A = parseKV(t).find((i) => i.key === 'angle');
    t = t.slice(0, A.s) + late.map(([k, v]) => (v === true ? k : k + '=' + v)).join(',') + ',' + t.slice(A.s);
    const old = src.slice(P.opt.is, P.opt.ie);
    let a = 0; while (a < old.length && a < t.length && old[a] === t[a]) a++;
    let z = 0; while (z < old.length - a && z < t.length - a && old[old.length - 1 - z] === t[t.length - 1 - z]) z++;
    return [{ s: P.opt.is + a, e: P.opt.is + old.length - z, t: t.slice(a, t.length - z) }];
  }
  if (P.opt) {
    const e = kvEdits(src, P.opt.is, P.opt.ie, changes);
    if (e.length) {
      const after = src.slice(P.opt.is, e[0].s) + e[0].t + src.slice(e[0].e, P.opt.ie);
      if (!/\S/.test(after.replace(/%[^\n]*/g, ''))) return [{ s: P.opt.s, e: P.opt.e, t: '' }];
    }
    return e;
  }
  const add = Object.entries(changes).filter(([, v]) => v != null).map(([k, v]) => (v === true ? k : k + '=' + v));
  return add.length ? [{ s: P.ne, e: P.ne, t: '[' + add.join(',') + ']' }] : [];
}

// ---- size ------------------------------------------------------------------------------------------
// A length as a number of points, given the line's width in points (for \linewidth and its like)
export function lengthPt(t, lw) {
  if (t == null || t === true) return null;
  const v = String(unbrace(t)).trim();
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)?)\s*(pt|bp|mm|cm|in|pc|em|ex|dd|cc|sp|\\linewidth|\\textwidth|\\columnwidth|\\hsize)$/.exec(v);
  if (!m) return null;
  const f = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseFloat(m[1]);
  const U = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, em: 10, ex: 4.3, dd: 1238 / 1157, cc: 12 * 1238 / 1157, sp: 1 / 65536 };
  return m[2][0] === '\\' ? f * lw : f * U[m[2]];
}
// a width given as a share of the line (\linewidth, \textwidth, \columnwidth): [share, the command] or null
export function shareOf(t) {
  if (t == null || t === true) return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)?)\s*\\(linewidth|textwidth|columnwidth|hsize)$/.exec(String(unbrace(t)).trim());
  return m ? [m[1] === '' ? 1 : parseFloat(m[1]), m[2]] : null;
}
// What sets the picture's width: a \resizebox, a wrapfigure whose width the picture fills, or its own keys
export function sizeOf(src, P) {
  const R = P.wraps.find((w) => w.kind === 'resize');
  if (R) { const w = argText(src, R.w), h = argText(src, R.h); return { by: 'resize', width: w === '!' ? null : w, height: h === '!' ? null : h, scale: null, keepaspect: w === '!' || h === '!' }; }
  const width = keyOf(P, 'width'), height = keyOf(P, 'height') ?? keyOf(P, 'totalheight'), scale = keyOf(P, 'scale');
  const out = { by: 'keys', width: width === true ? null : width ?? null, height: height === true ? null : height ?? null, scale: scale ?? null, keepaspect: keyOf(P, 'keepaspectratio') != null };
  const wf = P.block.kind === 'wrap' && P.block.env ? P.block.env.args[3] : null;
  if (wf && out.width && /^\\linewidth$/.test(String(out.width).trim())) { out.by = 'wrap'; out.width = argText(src, wf); out.wrapArg = wf; }
  return out;
}
// The share of the line Rikuy writes a width as when it is near one (a twentieth of the line,
// within near), else a length in the unit asked: 0.5\linewidth, \linewidth, 6.4cm
export function widthText(pt, lw, o = {}) {
  const base = o.base || 'linewidth', near = o.near ?? 0.012;
  if (lw > 0) {
    const f = pt / lw, r = Math.round(f * 20) / 20;
    if (r > 0 && Math.abs(f - r) <= near) return (r === 1 ? '' : fmt(r, 2)) + '\\' + base;
  }
  return lengthText(pt, o.unit || 'cm');
}
export function lengthText(pt, unit = 'cm') {
  const U = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27 };
  const d = { cm: 2, mm: 1, in: 2, pt: 1, bp: 1 }[unit] ?? 2;
  return fmt(pt / (U[unit] || U.cm), d) + (U[unit] ? unit : 'cm');
}
// Size: width and height as LaTeX lengths (null: not set). Setting the width drops a scale and,
// with free false, the height (the picture keeps its shape); free sets both.
export function setSize(src, P, width, height, free) {
  const S = sizeOf(src, P);
  if (S.by === 'resize') {
    const R = P.wraps.find((w) => w.kind === 'resize');
    const ed = [];
    const put = (a, v) => { if (src.slice(a.is, a.ie) !== v) ed.push({ s: a.is, e: a.ie, t: v }); };
    put(R.w, width || '!'); put(R.h, free && height ? height : width ? '!' : height || '!');
    return { edits: ed };
  }
  if (S.by === 'wrap' && width != null && !free) {
    // (the wrapfigure's width is the picture's: the picture fills it)
    return { edits: [{ s: S.wrapArg.is, e: S.wrapArg.ie, t: width }].filter((x) => src.slice(x.s, x.e) !== x.t) };
  }
  const ch = { scale: null };
  if (free) { ch.width = width; ch.height = height; if (keyOf(P, 'totalheight') != null) ch.totalheight = null; }
  else if (width != null) { ch.width = width; ch.height = null; ch.totalheight = null; }
  else if (height != null) { ch.height = height; ch.width = null; ch.totalheight = null; }
  if (!free && S.keepaspect && (width == null || height == null)) ch.keepaspectratio = null;
  return { edits: keyEdits(src, P, ch) };
}

// ---- crop --------------------------------------------------------------------------------------------
// trim (left bottom right top, bp when no unit) as { l, b, r, t } in bp; viewport read as a trim of
// the natural size nat ({ w, h } in bp)
export function cropOf(P, nat) {
  const tr = keyOf(P, 'trim');
  if (typeof tr === 'string') {
    const v = String(unbrace(tr)).trim().split(/\s+/).map((x) => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(x) ? parseFloat(x) : lengthPt(x, 0) == null ? NaN : lengthPt(x, 0) * 72 / 72.27));
    if (v.length === 4 && v.every(Number.isFinite)) return { l: v[0], b: v[1], r: v[2], t: v[3], clip: keyOf(P, 'clip') != null && keyOf(P, 'clip') !== 'false', by: 'trim' };
  }
  const vp = keyOf(P, 'viewport');
  if (typeof vp === 'string' && nat) {
    const v = String(unbrace(vp)).trim().split(/\s+/).map((x) => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(x) ? parseFloat(x) : NaN));
    if (v.length === 4 && v.every(Number.isFinite)) return { l: v[0], b: v[1], r: nat.w - v[2], t: nat.h - v[3], clip: keyOf(P, 'clip') != null, by: 'viewport' };
  }
  return null;
}
// Crop: { l, b, r, t } in bp (all 0: the crop goes). Written in cm, as people write it
export function setCrop(src, P, c) {
  const cm = (bp) => { const v = Math.round(bp * 2.54 / 72 * 100) / 100; return v === 0 ? '0' : fmt(v, 2) + 'cm'; };
  const none = !c || [c.l, c.b, c.r, c.t].every((v) => Math.abs(v) < 0.5);
  const ch = none ? { trim: null, clip: null, viewport: null } : { trim: [c.l, c.b, c.r, c.t].map(cm).join(' '), clip: true, viewport: null };
  return { edits: keyEdits(src, P, ch) };
}

// ---- rotate and flip --------------------------------------------------------------------------------
export function angleOf(src, P) {
  const R = P.wraps.find((w) => w.kind === 'rot');
  if (R) return Number.isFinite(R.angle) ? R.angle : 0;
  const a = keyOf(P, 'angle');
  return a == null || a === true ? 0 : num(String(unbrace(a)));
}
// whether the picture's turn is a number Rotate can add to (not \myangle)
export const angleKnown = (src, P) => Number.isFinite(angleOf(src, P));
const norm = (a) => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return Math.round(x * 1000) / 1000; };
// Rotate by delta degrees (Rotate Left 90°: 90, Rotate Right 90°: -90; graphicx turns counterclockwise)
export function rotate(src, P, delta) {
  if (!angleKnown(src, P)) return { error: 'The picture is turned by a macro\'s angle: edit it in the source.' };
  const R = P.wraps.find((w) => w.kind === 'rot');
  const to = norm(angleOf(src, P) + delta);
  if (R) {
    if (to === 0) return { edits: unwrapEdits(src, R) };
    return { edits: [{ s: R.arg.is, e: R.arg.ie, t: fmt(to) }] };
  }
  return { edits: keyEdits(src, P, { angle: to === 0 ? null : fmt(to) }) };
}
export const flipped = (P, how) => P.wraps.some((w) => w.kind === (how === 'v' ? 'flipv' : 'fliph'));
// Flip: \reflectbox{...} (horizontal) or \scalebox{1}[-1]{...} (vertical) right around the
// picture; again on a flipped one, it comes off
export function flip(src, P, how) {
  const W = P.wraps.find((w) => w.kind === (how === 'v' ? 'flipv' : 'fliph'));
  if (W) return { edits: unwrapEdits(src, W) };
  const open = how === 'v' ? '\\scalebox{1}[-1]{' : '\\reflectbox{';
  return { edits: [{ s: P.s, e: P.s, t: open }, { s: P.e, e: P.e, t: '}' }] };
}
// a box's command taken off, its argument left
function unwrapEdits(src, W) { return [{ s: W.s, e: W.is, t: '' }, { s: W.ie, e: W.e, t: '' }]; }

// ---- border ----------------------------------------------------------------------------------------
export const bordered = (P) => P.wraps.some((w) => w.kind === 'border');
export const BORDER_OPEN = '{\\setlength{\\fboxsep}{0pt}\\fbox{', BORDER_CLOSE = '}}';
// A frame tight around the picture (\fbox with no gap, in a group of its own), or off again
export function border(src, P, on) {
  const W = P.wraps.find((w) => w.kind === 'border');
  if (on === undefined) on = !W;
  if (on && !W) return { edits: [{ s: P.outer.s, e: P.outer.s, t: BORDER_OPEN }, { s: P.outer.e, e: P.outer.e, t: BORDER_CLOSE }] };
  if (!on && W) {
    if (W.group) return { edits: [{ s: W.group.s, e: W.is, t: '' }, { s: W.ie, e: W.group.e, t: '' }] };
    return { edits: unwrapEdits(src, W) };
  }
  return { edits: [] };
}

// ---- alt text ---------------------------------------------------------------------------------------
const ALT_ESC = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', $: '\\$', _: '\\_', '^': '\\^{}', '~': '\\~{}' };
export function escapeAlt(t) { return String(t).slice(0, 4000).replace(/[\r\n\t]+/g, ' ').replace(/[\\{}%#&$_^~]/g, (c) => ALT_ESC[c]); }
export function unescapeAlt(t) { return String(t).replace(/\\textbackslash\{\}|\\\^\{\}|\\~\{\}|\\([{}%#&$_])/g, (m, c) => (c || { '\\textbackslash{}': '\\', '\\^{}': '^', '\\~{}': '~' }[m])); }
// { text, decorative } of the alt key, the artifact flag, or a "% alt: " line before it (graphics' own form)
export function altOf(src, P) {
  if (P.keyval) {
    const a = keyOf(P, 'alt'), c = altComment(src, P);
    return { text: a == null || a === true ? '' : unescapeAlt(unbrace(String(a))), decorative: (keyOf(P, 'artifact') != null && keyOf(P, 'artifact') !== 'false') || !!(c && c.decorative), has: a != null };
  }
  const c = altComment(src, P);
  return { text: c ? c.text : '', decorative: false, has: !!c, comment: c };
}
function altComment(src, P) {
  const ls = src.lastIndexOf('\n', P.outer.s - 1) + 1;
  if (!/^\s*$/.test(src.slice(ls, P.outer.s))) return null;
  const ps = src.lastIndexOf('\n', ls - 2) + 1, line = src.slice(ps, ls);
  const m = /^[ \t]*% alt: (.*?)\r?\n$/.exec(line);
  if (m) return { s: ps, e: ls, text: m[1] };
  return /^[ \t]*% alt \(decorative\)\r?\n$/.test(line) ? { s: ps, e: ls, text: '', decorative: true } : null;
}
// Alt text (escaped as TeX reads a key's value), or decorative (graphicx's artifact key, which
// tagged PDF leaves out of what is read aloud); empty text and not decorative: both go
export function setAlt(src, P, text, decorative) {
  text = String(text || '').trim();
  if (!P.keyval) {
    const c = altComment(src, P), nl = P.eol;
    if (!text) return { edits: c ? [{ s: c.s, e: c.e, t: '' }] : [] };
    const line = '% alt: ' + text.replace(/[\r\n]+/g, ' ').slice(0, 4000) + nl;
    if (c) return { edits: [{ s: c.s, e: c.e, t: line }] };
    const ls = src.lastIndexOf('\n', P.outer.s - 1) + 1;
    return { edits: /^\s*$/.test(src.slice(ls, P.outer.s)) ? [{ s: ls, e: ls, t: line }] : [{ s: P.outer.s, e: P.outer.s, t: '%' + nl + line }] };
  }
  // Decorative: a "% alt (decorative)" line above the picture. graphicx's artifact key, which
  // tagged PDF reads, is TeX Live 2024's: a document taken to an older TeX would stop on it
  const c = altComment(src, P);
  if (decorative) {
    const ed = keyEdits(src, P, { alt: null, artifact: null }) || [];
    const nl = P.eol, line = '% alt (decorative)' + nl;
    if (c) ed.push({ s: c.s, e: c.e, t: line });
    else { const ls = src.lastIndexOf('\n', P.outer.s - 1) + 1; ed.push(/^\s*$/.test(src.slice(ls, P.outer.s)) ? { s: ls, e: ls, t: line } : { s: P.outer.s, e: P.outer.s, t: '%' + nl + line }); }
    return { edits: ed };
  }
  const ed = keyEdits(src, P, { alt: text ? '{' + escapeAlt(text) + '}' : null, artifact: null }) || [];
  if (c && c.decorative) ed.push({ s: c.s, e: c.e, t: '' });
  return { edits: ed };
}

// ---- reset and change ---------------------------------------------------------------------------------
// Reset Picture: crop, turn, flips and border go (size and alt text stay); with size, the size too
export function reset(src, P, size) {
  const drop = { trim: null, clip: null, viewport: null, angle: null, origin: null };
  if (size) Object.assign(drop, { width: null, height: null, totalheight: null, scale: null, keepaspectratio: null });
  let edits = keyEdits(src, P, drop) || [];
  for (const W of P.wraps) {
    if (W.kind === 'resize' && !size) continue;
    if (W.kind === 'border' && W.group) edits.push({ s: W.group.s, e: W.is, t: '' }, { s: W.ie, e: W.group.e, t: '' });
    else edits.push(...unwrapEdits(src, W));
  }
  return { edits: disjoint(edits) };
}
// the file of the picture replaced, its options kept
export function changeFile(src, P, name) {
  return { edits: [{ s: P.file.is, e: P.file.ie, t: name }] };
}
// edits that touch: an option edit inside a box's command is kept apart from that command's own
function disjoint(edits) { return edits.sort((a, b) => a.s - b.s || a.e - b.e); }

// ---- position and wrapping -------------------------------------------------------------------------
// Where it stands: { mode: 'inline' | 'float' | 'wrap' | 'sentence' | 'other', place: 'htbp' | 't' | 'H' | ..., side: 'r' | 'l' | ... }
export function positionOf(src, P) {
  const B = P.block;
  if (B.kind === 'float') { const a = B.env.args[0]; return { mode: 'float', place: a && a.o ? argText(src, a) : '' }; }
  if (B.kind === 'wrap') { const a = B.env.args[1]; return { mode: 'wrap', side: a ? argText(src, a) : 'r' }; }
  if (B.kind === 'inline' || B.kind === 'para') return { mode: 'inline' };
  return { mode: B.kind };
}
// Why the picture cannot move from where it is, or null
export function whyFixed(src, P, to, o = {}) {
  const B = P.block;
  if (o.beamer) return 'In beamer a figure stays on its frame where it is written.';
  if (B.kind === 'sentence') return 'This picture is part of a sentence: put it on a line of its own (Enter before and after it) to float or wrap it.';
  if (B.kind === 'box') return 'This picture is inside a box (a minipage, a table cell, a subfigure): a float cannot stand there.';
  if (B.kind === 'other') return 'This picture stands in a construct Rikuy does not move: edit its source.';
  if (B.env && !B.sole) return 'This ' + B.env.name + ' holds more than the picture: edit its source to move it.';
  if ((B.kind === 'inline' || B.kind === 'para') && P.anc.float) return 'This picture is inside a float already.';
  if (to === 'float' || to === 'wrap') {
    if (P.anc.multicols) return 'A float cannot stand in columns (multicols): it would be lost.';
  }
  if (to === 'wrap') {
    if (P.anc.list) return 'wrapfig cannot wrap text in a list.';
    if (o.nextIsList) return 'wrapfig cannot wrap a list: the paragraph after the picture is a list.';
    if (o.nextIsHeading) return 'wrapfig cannot wrap a heading: a heading follows the picture, and the figure would float away.';
    // (in a quote, a theorem, a proof or any other environment built on a list, wrapfig stops:
    // "wrapfigure used inside a conflicting environment")
    const inner = P.path.filter((x) => x.n.t === 'env' && x.n !== B.env && x.n.name !== 'document').map((x) => x.n.name);
    if (inner.length) return 'wrapfig cannot wrap text inside ' + inner[inner.length - 1] + ': move the picture out of it first.';
  }
  if (to !== 'float' && B.kind === 'float' && /\*$/.test(B.env.name)) return 'A figure across the page\'s columns (figure*) has no in-line or wrapped form: it stays a figure*.';
  return null;
}
const nlAround = (src, s) => src[s - 1] === '\n';
// To a float (figure) with this placement, to in line (a center), or to a wrapfigure on a side.
// widthPt: the picture's width in points now, lw the line's (for the wrapfigure's width).
export function setPosition(src, P, to, o = {}) {
  const B = P.block, nl = P.eol, ed = [], packages = [];
  const why = whyFixed(src, P, to.mode, o);
  if (why) return { error: why };
  const S = sizeOf(src, P);
  const pic = P.outer;
  // the begin line of an environment, through \centering after it (written as one line with it)
  const beginOf = (E) => {
    let e = E.be;
    const c = B.centering;
    // (a control word's node runs through the spaces after it: its name ends at ne)
    if (c && /^\s*$/.test(src.slice(E.be, c.s))) { e = c.ne; }
    return { s: E.bs, e };
  };
  const ctr = (E) => (E.name === 'center' || !!B.centering || E.name === 'wrapfigure' ? '' : 'flush');
  const wrapW = () => {
    // the wrapfigure's width: the picture's share of the line (the picture then fills it), or its length
    if (S.by === 'keys' && S.width && shareOf(S.width) && shareOf(S.width)[1] === 'linewidth') return { w: S.width.trim(), pic: '\\linewidth' };
    if (S.by === 'keys' && S.width) return { w: String(unbrace(S.width)).trim(), pic: null };
    if (o.widthPt && o.lw) return { w: widthText(o.widthPt, o.lw), pic: S.width ? null : null, auto: true };
    return { w: '0.4\\linewidth', pic: '\\linewidth', auto: true };
  };
  const capFix = (fromFloat) => {
    // a caption follows: \caption in a float, \captionof{figure} out of one (caption's)
    const C = B.caption;
    if (!C) return;
    const star = C.star ? '*' : '';
    if (fromFloat && C.name === 'caption') { ed.push({ s: C.s, e: C.ne, t: '\\captionof' + star + '{figure}' }); packages.push('caption'); }
    if (!fromFloat && C.name === 'captionof') {
      const a = C.args[0];
      if (a && /^figure$/.test(argText(src, a))) ed.push({ s: C.s, e: a.e, t: '\\caption' + star });
    }
  };
  if (to.mode === 'inline') {
    if (B.kind === 'inline' || B.kind === 'para') return { edits: [] };
    // figure or wrapfigure to center: \begin{figure}[...]\n\centering -> \begin{center}
    const E = B.env, b = beginOf(E);
    ed.push({ s: b.s, e: b.e, t: '\\begin{center}' }, { s: E.es, e: E.e, t: '\\end{center}' });
    if (B.kind === 'wrap') fromWrap(src, P, S, ed);
    capFix(true);
    return { edits: ed, packages };
  }
  if (to.mode === 'float') {
    const place = to.place == null ? 'htbp' : to.place;
    if (/H/.test(place)) { if (o.noH) return { error: o.noH }; packages.push('float'); }
    const head = '\\begin{figure}' + (place ? '[' + place + ']' : '');
    if (B.kind === 'float') {
      const E = B.env, a = E.args[0];
      if (a && a.o) { if (!place) ed.push({ s: a.s, e: a.e, t: '' }); else if (argText(src, a) !== place) ed.push({ s: a.is, e: a.ie, t: place }); }
      else if (place) ed.push({ s: E.nameEnd, e: E.nameEnd, t: '[' + place + ']' });
      return { edits: ed, packages };
    }
    if (B.kind === 'wrap') {
      const E = B.env;
      ed.push({ s: E.bs, e: E.be, t: head }, { s: E.es, e: E.e, t: '\\end{figure}' });
      fromWrap(src, P, S, ed);
      return { edits: ed, packages };
    }
    if (B.kind === 'inline') {
      const E = B.env;
      ed.push({ s: E.bs, e: E.be, t: head + nl + (E.name === 'center' ? '\\centering' : E.name === 'flushright' ? '\\raggedleft' : '\\raggedright') }, { s: E.es, e: E.e, t: '\\end{figure}' });
      capFix(false);
      return { edits: ed, packages };
    }
    // a paragraph of its own: the figure around it
    ed.push({ s: pic.s, e: pic.s, t: head + nl + '\\centering' + nl }, { s: pic.e, e: pic.e, t: nl + '\\end{figure}' });
    return { edits: ed, packages };
  }
  if (to.mode === 'wrap') {
    const side = to.side || 'r';
    packages.push('wrapfig');
    if (B.kind === 'wrap') {
      const a = B.env.args[1];
      if (a && argText(src, a) !== side) ed.push({ s: a.is, e: a.ie, t: side });
      return { edits: ed, packages };
    }
    const W = wrapW();
    const head = '\\begin{wrapfigure}{' + side + '}{' + W.w + '}';
    if (B.kind === 'float' || B.kind === 'inline') {
      const E = B.env;
      if (B.kind === 'inline' && E.name === 'center') ed.push({ s: E.bs, e: E.be, t: head + nl + '\\centering' });
      else ed.push({ s: E.bs, e: E.be, t: head });
      ed.push({ s: E.es, e: E.e, t: '\\end{wrapfigure}' });
      if (B.kind === 'inline') capFix(false);
    } else {
      ed.push({ s: pic.s, e: pic.s, t: head + nl + '\\centering' + nl }, { s: pic.e, e: pic.e, t: nl + '\\end{wrapfigure}' });
    }
    if (W.pic) {
      const k = P.kv.find((i) => i.key === 'width');
      if (k) ed.push({ s: k.s, e: k.e, t: 'width=' + W.pic });
      else ed.push(...(keyEdits(src, P, { width: W.pic }) || []));
    }
    return { edits: ed, packages };
  }
  return { error: 'Rikuy cannot place a picture that way.' };
}
// out of a wrapfigure: a picture that filled it takes its width with it
function fromWrap(src, P, S, ed) {
  if (S.by !== 'wrap') return;
  const k = P.kv.find((i) => i.key === 'width');
  if (k) ed.push({ s: k.s, e: k.e, t: 'width=' + S.width });
}

// ---- caption ----------------------------------------------------------------------------------------
// Insert Caption: the caret to the caption there is, else one made: \caption in a float,
// \captionof{figure} (caption's) in a center, a center around a paragraph of its own
export function captionEdits(src, P) {
  const B = P.block, nl = P.eol;
  if (B.caption) { const a = B.caption.args.find((x) => x && !x.o && (B.caption.name === 'caption' || x !== B.caption.args[0])); return { p: a ? a.is : B.caption.e }; }
  if (B.kind === 'float' || B.kind === 'wrap') { const t = nl + '\\caption{}'; return { edits: [{ s: P.outer.e, e: P.outer.e, t }], p: P.outer.e + t.length - 1 }; }
  if (B.kind === 'inline' && B.sole) { const t = nl + '\\captionof{figure}{}'; return { edits: [{ s: P.outer.e, e: P.outer.e, t }], p: P.outer.e + t.length - 1, packages: ['caption'] }; }
  if (B.kind === 'para' && !P.anc.box) {
    const open = '\\begin{center}' + nl, cap = nl + '\\captionof{figure}{}', close = cap + nl + '\\end{center}';
    return { edits: [{ s: P.outer.s, e: P.outer.s, t: open }, { s: P.outer.e, e: P.outer.e, t: close }], p: P.outer.e + open.length + cap.length - 1, packages: ['caption'] };
  }
  if (P.anc.float) return { error: 'This picture is in a float with more in it: write its caption in the source.' };
  return { error: 'Put the picture on a line of its own first: a caption stands under a picture of its own.' };
}

// ---- the natural size TeX gives a picture -------------------------------------------------------------
// From the first bytes of a PNG, JPEG or PDF: { w, h } in bp (big points), as pdfTeX reads it: a
// PNG's pHYs or a JPEG's JFIF density where they give one (dots per inch rounded, as pdfTeX
// does), else 72 dots per inch; a PDF's first /MediaBox (or /CropBox). null where the bytes say
// nothing. Reads at most the bytes given (the caller passes the file's first 512 KB at most).
export function naturalSize(bytes, name = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const u32 = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const u16 = (i) => (b[i] << 8) + b[i + 1];
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = u32(16), h = u32(20);
    let dx = 0, dy = 0;
    for (let i = 8, n = 0; i + 8 <= b.length && n < 4000; n++) {
      const len = u32(i), type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      if (type === 'pHYs' && i + 17 <= b.length && b[i + 16] === 1) { dx = Math.round(u32(i + 8) * 0.0254); dy = Math.round(u32(i + 12) * 0.0254); break; }
      if (type === 'IDAT' || type === 'IEND') break;
      i += 12 + len;
    }
    return { w: w * 72 / (dx || 72), h: h * 72 / (dy || dx || 72), px: [w, h] };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let dx = 0, dy = 0, w = 0, h = 0, ex = null;
    for (let i = 2, n = 0; i + 4 <= b.length && n < 2000; n++) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = u16(i + 2);
      if (m === 0xe0 && i + 18 <= b.length && b[i + 4] === 0x4a && b[i + 5] === 0x46 && b[i + 6] === 0x49 && b[i + 7] === 0x46) {
        const unit = b[i + 11], x = u16(i + 12), y = u16(i + 14);
        // (dots per centimetre: pdfTeX truncates them to dots per inch, 118 is 299)
        if (unit === 1) { dx = x; dy = y; } else if (unit === 2) { dx = Math.trunc(x * 2.54); dy = Math.trunc(y * 2.54); }
      }
      // Exif's resolution (a camera's JPEG has no JFIF), which the three engines read too
      if (m === 0xe1 && !ex && i + 18 <= b.length && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) ex = exifRes(b, i + 10, Math.min(b.length, i + 2 + len));
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && i + 9 <= b.length) { h = u16(i + 5); w = u16(i + 7); break; }
      i += 2 + len;
    }
    if (!w || !h) return null;
    if (!dx && ex) { dx = ex[0]; dy = ex[1]; }
    return { w: w * 72 / (dx || 72), h: h * 72 / (dy || dx || 72), px: [w, h] };
  }
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    // (the first box in the file's first bytes: a page's, for the one page figures pictures are)
    const t = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 1 << 19)));
    const re = /\/(CropBox|MediaBox)\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g;
    let m, best = null;
    for (let n = 0; (m = re.exec(t)) && n < 50; n++) { if (!best || m[1] === 'CropBox') best = m; if (m[1] === 'CropBox') break; }
    if (!best) return null;
    const v = best.slice(2).map(Number);
    // (a page turned by /Rotate 90 or 270 is set across: pdfTeX swaps its sides)
    const rot = /\/Rotate\s+(-?\d{1,4})\b/.exec(t);
    const q = rot ? ((+rot[1] % 360) + 360) % 360 : 0;
    const W = Math.abs(v[2] - v[0]), H = Math.abs(v[3] - v[1]);
    return q === 90 || q === 270 ? { w: H, h: W } : { w: W, h: H };
  }
  return null;
}
// Exif's XResolution and YResolution in IFD0 as dots per inch ([x, y]), or null; t0 is the TIFF
// header's place, end the segment's end. At most 200 entries are read.
function exifRes(b, t0, end) {
  const le = b[t0] === 0x49 && b[t0 + 1] === 0x49;
  if (!le && !(b[t0] === 0x4d && b[t0 + 1] === 0x4d)) return null;
  const u16 = (i) => (i + 2 <= end ? (le ? b[i] + (b[i + 1] << 8) : (b[i] << 8) + b[i + 1]) : 0);
  const u32 = (i) => (i + 4 <= end ? (le ? b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + ((b[i + 3] << 24) >>> 0) : ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]) : 0);
  const ifd = t0 + u32(t0 + 4);
  const n = Math.min(200, u16(ifd));
  let x = 0, y = 0, unit = 2;
  const rat = (off) => { const a = u32(t0 + off), d = u32(t0 + off + 4); return d ? a / d : 0; };
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) break;
    const tag = u16(e);
    if (tag === 0x011a) x = rat(u32(e + 8));
    else if (tag === 0x011b) y = rat(u32(e + 8));
    else if (tag === 0x0128) unit = u16(e + 8);
  }
  if (!(x > 0)) return null;
  if (unit === 3) { x = Math.trunc(x * 2.54); y = Math.trunc((y || x) * 2.54); }
  else if (unit !== 2) return null;
  return [x, y || x];
}

// ---- the box graphicx makes -------------------------------------------------------------------------
// The keys of a picture applied in graphicx's order to its natural size nat ({ w, h } in bp):
// trim first, then width, height, scale and keepaspectratio, applied where angle comes (an angle
// before them turns first, after them last). Returns, in TeX points: the box it takes (bw, bh),
// the picture's own drawn size before turning (iw, ih), its angle, and the crop as shares of the
// natural size (for the page to show the part kept). lw: the line's width in points.
export function graphicBox(kv, nat, lw) {
  const get = (k) => { const x = kv.find((i) => i.key === k); return x ? (x.value == null ? true : x.value) : undefined; };
  const BP = 72.27 / 72;
  let w = nat.w * BP, h = nat.h * BP;
  const crop = { l: 0, b: 0, r: 0, t: 0 };
  const tr = get('trim'), vp = get('viewport');
  if (typeof tr === 'string' || typeof vp === 'string') {
    const P = { kv };
    const c = cropOf(P, nat);
    if (c) { crop.l = c.l / nat.w; crop.r = c.r / nat.w; crop.b = c.b / nat.h; crop.t = c.t / nat.h; w = Math.max(1, (nat.w - c.l - c.r) * BP); h = Math.max(1, (nat.h - c.b - c.t) * BP); }
  }
  // graphicx's order: the size keys before the first angle size the picture; the angle turns it;
  // the size keys after it size the turned box (one key, or keepaspectratio, keeps its shape)
  let iw = w, ih = h, angle = 0;
  const ai = kv.findIndex((i) => i.key === 'angle');
  const pre = ai < 0 ? kv : kv.slice(0, ai), post = ai < 0 ? [] : kv.slice(ai + 1);
  if (ai >= 0) angle = parseFloat(String(unbrace(kv[ai].value))) || 0;
  const keep = get('keepaspectratio') != null;
  const factors = (keys, bw, bh) => {
    const g = (k) => { const x = keys.find((i) => i.key === k); return x ? (x.value == null ? true : x.value) : undefined; };
    const W = lengthPt(g('width'), lw), H = lengthPt(g('height') ?? g('totalheight'), lw), S = g('scale');
    if (W != null && H != null && !keep) return [W / bw, H / bh];
    if (W != null && H != null) { const f = Math.min(W / bw, H / bh); return [f, f]; }
    if (W != null) return [W / bw, W / bw];
    if (H != null) return [H / bh, H / bh];
    if (S != null && Number.isFinite(parseFloat(S))) return [parseFloat(S), parseFloat(S)];
    return [1, 1];
  };
  const [ax, ay] = factors(pre, iw, ih);
  iw *= ax; ih *= ay;
  if (post.length) {
    const T = turned(iw, ih, angle), [bx, by] = factors(post, T.w || 1, T.h || 1);
    // (a quarter turn: the box's width is the picture's height)
    const q = Math.abs(Math.round(angle / 90)) % 2 === 1 && Math.abs(angle % 90) < 1e-6;
    if (q) { iw *= by; ih *= bx; } else { iw *= bx; ih *= by; }
  }
  const B = turned(iw, ih, angle);
  return { bw: B.w, bh: B.h, iw, ih, angle, crop, clip: get('clip') != null };
}
function turned(w, h, a) {
  const r = a * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
}
