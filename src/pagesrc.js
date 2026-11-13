// The page's set up as source edits, on strings: paper, orientation and margins in geometry,
// written once and where they already are (\usepackage[…]{geometry}, a \geometry{…} line, the
// class's options); breaks; columns; headers and footers in fancyhdr; page numbers; line numbers
// (lineno); hyphenation (hyphenat); the watermark (draftwatermark), the page's colour and its
// border. Every function reads the text it is given and returns edits [{ s, e, t }] on it, or []
// when nothing needs to change, so the same call twice changes nothing the second time. The page
// reads the same constructs in src/model.js (preamble) and draws them in src/layout.js;
// src/cmd/page.js puts these edits behind the ribbon's controls. test/page.test.mjs.
//
// A document may be a stranger's: every scan here is bounded (the preamble's first 200 000
// characters, groups of 4000 at most), and no pattern can backtrack over the whole text.

import { stripComments, preambleEnd, packages, parseKV, kvEdits, docClass, classOptions, lastCall, groupEnd, usePackages, packageOptions, eolOf } from './preamble.js';

// ---- lengths -------------------------------------------------------------------------------
// TeX's units in points (TeX's own pt, 72.27 to the inch)
export const UNIT = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, dd: 1238 / 1157, cc: 12 * 1238 / 1157, sp: 1 / 65536, px: 72.27 / 96 };
// '2.54cm', '1in', ' 25 mm ', '0.5\paperwidth' (with paper) -> points, or null
export function lenPt(s, paper) {
  const m = /^\s*(-?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|px|\\paperwidth|\\paperheight|\\textwidth|\\linewidth)?\s*$/.exec(String(s == null ? '' : s).slice(0, 80));
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const u = m[2] || 'pt';
  if (u[0] === '\\') { if (!paper) return null; return v * (u === '\\paperheight' ? paper.h : u === '\\paperwidth' ? paper.w : paper.tw || paper.w); }
  return v * UNIT[u];
}
// points written in a unit, at most two decimals: 72.27 in cm -> '2.54cm'
export const fmtLen = (pt, unit = 'cm') => (Math.round(pt / UNIT[unit] * 100) / 100) + unit;

// ---- paper -----------------------------------------------------------------------------------
// [width, height, unit]: the sizes geometry and the standard classes know by name
const PAPER_DIMS = {
  a0: [841, 1189, 'mm'], a1: [594, 841, 'mm'], a2: [420, 594, 'mm'], a3: [297, 420, 'mm'], a4: [210, 297, 'mm'], a5: [148, 210, 'mm'], a6: [105, 148, 'mm'],
  b0: [1000, 1414, 'mm'], b1: [707, 1000, 'mm'], b2: [500, 707, 'mm'], b3: [353, 500, 'mm'], b4: [250, 353, 'mm'], b5: [176, 250, 'mm'], b6: [125, 176, 'mm'],
  letter: [8.5, 11, 'in'], legal: [8.5, 14, 'in'], executive: [7.25, 10.5, 'in']
};
export const PAPERS = Object.fromEntries(Object.entries(PAPER_DIMS).map(([k, [w, h, u]]) => [k, { w: w * UNIT[u], h: h * UNIT[u] }]));
// the Size menu, Word's names and sizes
export const SIZES = [['letter', 'Letter', '21.59 cm × 27.94 cm'], ['legal', 'Legal', '21.59 cm × 35.56 cm'], ['a4', 'A4', '21 cm × 29.7 cm'], ['a5', 'A5', '14.8 cm × 21 cm'],
  ['b5', 'B5', '17.6 cm × 25 cm'], ['executive', 'Executive', '18.41 cm × 26.67 cm'], ['a3', 'A3', '29.7 cm × 42 cm']];
// a paper option's name: 'a4paper' -> 'a4'
export const paperName = (k) => { const m = /^([a-c][0-6]|letter|legal|executive)paper$/.exec(k || ''); return m && PAPERS[m[1]] ? m[1] : null; };

// ---- key families of geometry: setting one takes the others of its family out ------------
const PAPER_KEYS = /^(?:(?:[a-c][0-6]|b[0-6]j|ansi[a-e]|letter|legal|executive)paper|paper|papername|paperwidth|paperheight|papersize)$/;
const H_KEYS = /^(?:margin|hmargin|left|right|lmargin|rmargin|inner|outer|textwidth|width|hscale|scale|total|body|text|hmarginratio|marginratio|ratio|centering|hcentering|asymmetric|bindingoffset|twoside|lines|textheight|height|vscale|vmargin|top|bottom|tmargin|bmargin|vmarginratio|vcentering)$/;
export const FAMILY = {
  paper: (k) => PAPER_KEYS.test(k),
  orient: (k) => k === 'landscape' || k === 'portrait',
  margins: (k) => H_KEYS.test(k),
  headfoot: (k) => /^(?:headsep|footskip|headheight|includehead|includefoot|includeheadfoot|nohead|nofoot|noheadfoot)$/.test(k),
  columns: (k) => k === 'columnsep'
};

// Every place the preamble sets geometry's keys: the options of its \usepackage line and each
// \geometry{…} line, in the order TeX reads them: [{ kind: 'pkg'|'call', s, e, at: [ks, ke) or
// null (a \usepackage with no options), keys: [{ key, value, s, e }] }]
export function geometryPlaces(src, end) {
  if (end == null) end = preambleEnd(src);
  if (end < 0) return [];
  const out = [];
  const pk = packages(src, end).find((p) => p.cmd === 'usepackage' && p.names.length === 1 && p.names[0].name === 'geometry');
  if (pk) out.push({ kind: 'pkg', s: pk.s, e: pk.e, at: pk.opts, keys: pk.opts ? parseKV(src, pk.opts[0], pk.opts[1]) : [], line: pk.line });
  const pre = stripComments(src.slice(0, end));
  const re = /\\geometry(?![A-Za-z@])/g;
  for (let m, n = 0; (m = re.exec(pre)) && n < 200; n++) {
    let i = m.index + m[0].length;
    while (i < pre.length && /\s/.test(pre[i]) && i - m.index < 40) i++;
    if (pre[i] !== '{') continue;
    const z = groupEnd(pre, i, 4000);
    if (z < 0) continue;
    out.push({ kind: 'call', s: m.index, e: z, at: [i + 1, z - 1], keys: parseKV(src, i + 1, z - 1) });
    re.lastIndex = z;
  }
  return out.sort((a, b) => a.s - b.s);
}
// geometry's keys as TeX ends up with them (later places win): { key: value or true }
export function geometryKeys(src, end) {
  const out = {};
  for (const p of geometryPlaces(src, end)) for (const k of p.keys) out[k.key] = k.value == null ? true : k.value;
  return out;
}

// Whether a package is loaded in the main preamble or in a file it reads (others: their text)
const loaded = (src, name, end, others) => packageOptions(src, name, end, others) !== null;

// The edits that set geometry's keys: changes { key: value | true | null (out) }; family(key):
// the keys that go when these are set (another paper size when a4paper is set). They go where
// keys of the same family stand already (the last such place), else into the last \geometry
// line, else into the \usepackage line's options; out of every other place. Geometry loaded only
// in a file the preamble reads gets a \geometry line of its own before \begin{document} (its
// options there would lose against that file's). Not loaded: \usepackage[…]{geometry}.
export function geometryEdits(src, changes, family, o = {}) {
  const end = o.end != null ? o.end : preambleEnd(src);
  if (end < 0) return [];
  const places = geometryPlaces(src, end);
  const want = Object.entries(changes), keysOf = (p) => p.keys.map((k) => k.key);
  const hit = (k) => want.some(([w]) => w === k) || (family && family(k));
  const set = want.filter(([, v]) => v !== null);
  if (!places.length) {
    if (!set.length) return [];
    if (loaded(src, 'geometry', end, o.others)) return [lineBefore(src, end, '\\geometry{' + set.map(([k, v]) => kv(k, v)).join(',') + '}')];
    return usePackages(src, { geometry: Object.fromEntries(set) }, { end, others: o.others });
  }
  // the place that gets the keys
  let target = null;
  for (const p of places) if (keysOf(p).some(hit)) target = p;
  if (!target) target = [...places].reverse().find((p) => p.kind === 'call') || places[0];
  const edits = [];
  for (const p of places) {
    const ch = p === target ? Object.fromEntries(want) : Object.fromEntries(want.map(([k]) => [k, null]));
    if (p !== target && !keysOf(p).some(hit)) continue;
    if (p.kind === 'pkg') {
      if (!p.at) { const t = set.map(([k, v]) => kv(k, v)).join(','); if (p === target && t) edits.push({ s: p.s + '\\usepackage'.length, e: p.s + '\\usepackage'.length, t: '[' + t + ']' }); continue; }
      const e = kvEdits(src, p.at[0], p.at[1], ch, family);
      // (options left empty lose their brackets)
      if (e.length && !/\S/.test(stripComments(apply(src.slice(p.at[0], p.at[1]), e[0].s - p.at[0], e[0].e - p.at[0], e[0].t)))) edits.push({ s: p.at[0] - 1, e: p.at[1] + 1, t: '' });
      else edits.push(...e);
    } else {
      const e = kvEdits(src, p.at[0], p.at[1], ch, family);
      // a \geometry line left with nothing goes with its line
      if (e.length && !/\S/.test(stripComments(apply(src.slice(p.at[0], p.at[1]), e[0].s - p.at[0], e[0].e - p.at[0], e[0].t)))) edits.push(wholeLine(src, p.s, p.e));
      else edits.push(...e);
    }
  }
  return edits;
}
const kv = (k, v) => (v === true ? k : k + '=' + v);
const apply = (t, s, e, x) => t.slice(0, s) + x + t.slice(e);
// a command alone on its line goes with the line; else the command alone
function wholeLine(src, s, e) {
  const ls = src.lastIndexOf('\n', s - 1) + 1, nl = src.indexOf('\n', e), le = nl < 0 ? src.length : nl + 1;
  if (!/\S/.test(src.slice(ls, s)) && !/\S/.test(stripComments(src.slice(e, le)))) return { s: ls, e: le, t: '' };
  return { s, e, t: '' };
}
// a line of the preamble just before \begin{document} (in the file's own line ends)
function lineBefore(src, end, text) {
  const at = src.lastIndexOf('\n', end - 1) + 1, nl = eolOf(src);
  text = text.replace(/\r?\n/g, nl);
  if (at < end && /\S/.test(src.slice(at, end))) return { s: end, e: end, t: nl + text + nl };
  return { s: at, e: at, t: text + nl };
}

// ---- the class's options ---------------------------------------------------------------------
const CLASS_PAPER = /^(?:a4|a5|b5|letter|legal|executive)paper$/;
// What the class says of the page: { name, paper, landscape, twoside, twocolumn, pt }
export function classPage(src) {
  const d = docClass(src);
  if (!d) return null;
  const o = d.options, keys = Object.keys(o);
  // (KOMA's paper=a5, paper=landscape)
  const kp = typeof o.paper === 'string' ? o.paper.split(':').map((x) => x.trim()) : [];
  const paper = keys.map(paperName).filter(Boolean).pop() || kp.map((x) => paperName(x + 'paper')).filter(Boolean).pop() || null;
  const pt = (keys.find((k) => /^(10|11|12)pt$/.test(k)) || '').slice(0, 2);
  const book = /^(book|scrbook|memoir)$/.test(d.name);
  return { name: d.name, paper, komaPaper: kp.length > 0, landscape: 'landscape' in o || kp.includes('landscape'), twoside: 'twoside' in o || (book && !('oneside' in o)), twocolumn: 'twocolumn' in o, pt: pt ? +pt : 10, options: o, beamer: d.name === 'beamer' };
}

// ---- paper, orientation, margins -----------------------------------------------------------------
// Who lays the page out: geometry (loaded without pass), or the class (no geometry, or geometry's
// pass, which leaves the class's text block and only sets the PDF's sheet). And whether the PDF's
// sheet follows LaTeX's paper: geometry, hyperref, KOMA's typearea, memoir, beamer, IEEEtran,
// elsarticle and acmart set it; with none of them TeX Live's sheet is A4, whatever the class's
// paper (measured, all three engines). src/model.js reads the same (opts.media).
const MEDIA_CLASSES = /^(?:scrartcl|scrreprt|scrbook|scrlttr2|memoir|beamer|IEEEtran|elsarticle|acmart)$/;
export function pageMode(src, o = {}) {
  const end = preambleEnd(src);
  const cls = classPage(src);
  const geo = loaded(src, 'geometry', end, o.others);
  const keys = geometryKeys(src, end);
  const pass = geo && keys.pass === true;
  const hyper = packageOptions(src, 'hyperref', end, o.others);
  const koma = !!cls && /^scr/.test(cls.name);
  const media = geo || (hyper !== null && String(hyper.setpagesize) !== 'false') || loaded(src, 'typearea', end, o.others) || (!!cls && MEDIA_CLASSES.test(cls.name));
  return { end, cls, geo, keys, pass, byGeometry: geo && !pass, media, koma };
}
// Where nothing sets the PDF's sheet, the page shows A4 upright: whatever comes to set it keeps
// that sheet (the class's paper, Letter by default, would take its place): the keys or class
// options that say A4 upright, or none where the class says so already
function sheetKeep(M) {
  if (M.media || !M.cls) return {};
  return { ...(M.cls.paper === 'a4' ? {} : { a4paper: true }), ...(M.cls.landscape ? { portrait: true } : {}) };
}
// geometry's pass, which sets the PDF's sheet from the class's paper and touches nothing else
// (none where that sheet is A4 upright, TeX Live's own)
function mediaEdits(src, M, o, size, land) {
  if (M.media || (size === 'a4' && !land)) return [];
  return usePackages(src, { geometry: { pass: true } }, { end: M.end, others: o.others });
}
// pin: the page as it is now (points), so that turning to geometry's layout moves nothing but
// what is asked: { l, r, t, b } the margins (a new paper keeps them, as Word does), or { l, tw, t,
// th } the text block itself (the header's distances change and not a line of the text moves)
const PT = (x) => fmtLen(x, 'pt');
function pinKeys(pin) {
  if (!pin) return {};
  if (pin.tw != null) return { left: PT(pin.l), textwidth: PT(pin.tw), top: PT(pin.t), textheight: PT(pin.th) };
  return { left: PT(pin.l), right: PT(pin.r), top: PT(pin.t), bottom: PT(pin.b) };
}
// geometry's keys of a paper ('a4' or { w, h, unit })
const paperKeys = (size) => (typeof size === 'string' ? { [size + 'paper']: true } : { paperwidth: fmtLen(size.w, size.unit || 'cm'), paperheight: fmtLen(size.h, size.unit || 'cm') });

// The paper as a size by name ('a4') or { w, h } in points. Where geometry lays the page out:
// its paper key. Where the class does: the class's option (in place, or added), and geometry's
// pass beside it if nothing else sets the PDF's sheet, so the class's text block stays the
// class's. A size the class does not know (A3, any size) turns the layout to geometry's with the
// margins pinned (o.pin: { l, r, t, b }), so only the paper changes, as Word keeps the margins.
export function paperEdits(src, size, o = {}) {
  const M = pageMode(src, o);
  if (M.end < 0 || !M.cls) return [];
  const named = typeof size === 'string';
  if (named && !PAPERS[size]) return [];
  if (M.byGeometry) return geometryEdits(src, paperKeys(size), FAMILY.paper, { end: M.end, others: o.others });
  if (named && CLASS_PAPER.test(size + 'paper')) {
    const cur = M.cls.paper || 'letter';
    const out = [];
    if (cur !== size) {
      // (KOMA's paper=a4 written as KOMA writes it)
      if (M.cls.komaPaper) out.push(...classOptions(src, { paper: size }, (k) => CLASS_PAPER.test(k)));
      else out.push(...classOptions(src, { [size + 'paper']: true }, (k) => CLASS_PAPER.test(k)));
    }
    out.push(...mediaEdits(src, M, o, size, M.cls.landscape));
    return joinEdits(out);
  }
  // to geometry's layout, the margins kept
  return geometryEdits(src, { pass: null, ...pinKeys(o.pin), ...paperKeys(size) }, FAMILY.paper, { end: M.end, others: o.others });
}

// 'landscape' or 'portrait' as the sheet shows it: geometry's key where geometry lays the page
// out, the class's option where the class does (with pass for the PDF's sheet)
export function sheetLandscape(src, o = {}) {
  const M = pageMode(src, o);
  if (M.end < 0 || !M.cls) return false;
  if (M.byGeometry) return M.keys.landscape === true || (M.cls.landscape && M.keys.portrait !== true);
  return M.media && M.cls.landscape;
}
export function orientationEdits(src, way, o = {}) {
  const M = pageMode(src, o);
  if (M.end < 0 || !M.cls) return [];
  const g = M.keys, cls = M.cls;
  if (way === 'landscape') {
    if (sheetLandscape(src, o)) return [];
    if (M.byGeometry) return geometryEdits(src, { landscape: true, portrait: null }, null, { end: M.end, others: o.others });
    // (the sheet shown, A4, stays A4 turned)
    const keep = M.media || cls.paper === 'a4' ? {} : classPaperOf(cls, 'a4');
    return joinEdits([...classOptions(src, { ...keep, ...(cls.landscape ? {} : { landscape: true }) }, (k) => 'a4paper' in keep && CLASS_PAPER.test(k)), ...mediaEdits(src, M, o, cls.paper, true)]);
  }
  // portrait: landscape comes out where it stands (the class's too where the sheet does not show
  // it: its text block is a landscape page's)
  const out = Object.keys(g).includes('landscape') ? geometryEdits(src, { landscape: null }, null, { end: M.end }) : [];
  if (cls.landscape && !cls.komaPaper) out.push(...classOptions(src, { landscape: null }));
  return out;
}
const classPaperOf = (cls, size) => (cls.komaPaper ? { paper: size } : { [size + 'paper']: true });

// The distances of the header and the footer (headsep, footskip: points): geometry's keys; where
// the class lays the page out, with its text block pinned (o.pin: { l, tw, t, th }), so the text
// stays where it is and only the header or the footer moves
export function headFootEdits(src, hf, o = {}) {
  const M = pageMode(src, o);
  if (M.end < 0) return [];
  const ch = {};
  if (hf.headsep != null) ch.headsep = PT(hf.headsep);
  if (hf.footskip != null) ch.footskip = PT(hf.footskip);
  if (!Object.keys(ch).length) return [];
  if (M.byGeometry) return geometryEdits(src, ch, null, { end: M.end, others: o.others });
  return geometryEdits(src, { pass: null, ...sheetKeep(M), ...pinKeys(o.pin), ...ch }, FAMILY.margins, { end: M.end, others: o.others });
}

// Word's margins, in cm: [id, name, top, bottom, left (inside), right (outside), mirrored]
export const MARGINS = [
  ['normal', 'Normal', 2.54, 2.54, 2.54, 2.54], ['narrow', 'Narrow', 1.27, 1.27, 1.27, 1.27], ['moderate', 'Moderate', 2.54, 2.54, 1.91, 1.91],
  ['wide', 'Wide', 2.54, 2.54, 5.08, 5.08], ['mirrored', 'Mirrored', 2.54, 2.54, 3.18, 2.54, true]
];
// The keys that say margins m: { t, b, l, r (points), gutter, mirrored, unit }, as few as say them
export function marginKeys(m) {
  const u = m.unit || 'cm', L = (x) => fmtLen(x, u), same = (a, b) => Math.abs(a - b) < 0.01;
  const k = {};
  if (m.mirrored) k.twoside = true;
  const side = m.mirrored ? ['inner', 'outer'] : ['left', 'right'];
  if (same(m.t, m.b) && same(m.l, m.r) && same(m.t, m.l) && !m.mirrored) k.margin = L(m.t);
  else {
    if (same(m.t, m.b)) k.vmargin = L(m.t); else { k.top = L(m.t); k.bottom = L(m.b); }
    if (same(m.l, m.r) && !m.mirrored) k.hmargin = L(m.l); else { k[side[0]] = L(m.l); k[side[1]] = L(m.r); }
  }
  if (m.gutter) k.bindingoffset = L(m.gutter);
  return k;
}
export function marginEdits(src, m, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const want = marginKeys(m), have = geometryKeys(src, end);
  // (the same margins said the same way: nothing to do)
  const fam = Object.keys(have).filter(FAMILY.margins);
  if (fam.length === Object.keys(want).length && fam.every((k) => String(want[k]) === String(have[k])) && have.pass !== true) return [];
  // (margins are geometry's layout: pass, which would ignore them, goes; the sheet shown stays)
  const M = pageMode(src, o);
  return geometryEdits(src, { ...sheetKeep(M), ...want, ...(have.pass === true ? { pass: null } : {}) }, FAMILY.margins, { end, others: o.others });
}

// ---- breaks ------------------------------------------------------------------------------------
// The text a break of this kind is written as, alone on its line(s)
// (Even and Odd page: the next page of that parity, the blank page before it only where needed,
// in a one sided document as in a two sided one, as Word's section breaks; \clearpage inside, as
// \cleardoublepage has, so a two column page ends whole)
export const BREAKS = {
  page: '\\newpage', column: '\\columnbreak', blank: '\\newpage\n\\null\n\\newpage', next: '\\clearpage',
  odd: '\\clearpage\n\\ifodd\\value{page}\\else\\hbox{}\\clearpage\\fi', even: '\\clearpage\n\\ifodd\\value{page}\\hbox{}\\clearpage\\fi',
  // in a two column document \newpage ends a column: the page's own break is \clearpage
  page2: '\\clearpage', blank2: '\\clearpage\n\\null\n\\clearpage'
};
// The edits that put text on a line of its own at p of a paragraph: at its start before it (a
// blank line after), at its end after it (a blank line before), within it between its two
// halves, each on its own line; a selection [p, q) goes. caret: where the text after it starts.
export function breakEdits(src, p, q, text) {
  if (q == null) q = p;
  let a = p, b = q;
  // (spaces at the cut go: the line ends and starts clean)
  while (a > 0 && (src[a - 1] === ' ' || src[a - 1] === '\t')) a--;
  while (b < src.length && (src[b] === ' ' || src[b] === '\t')) b++;
  const before = src.slice(Math.max(0, a - 2), a), after = src.slice(b, b + 2);
  const atStart = a === 0 || before.endsWith('\n'), atEnd = b >= src.length || after.startsWith('\n') || after.startsWith('\r\n');
  const nl = /\r\n/.test(src.slice(Math.max(0, a - 200), b + 200)) ? '\r\n' : '\n';
  const t = text.replace(/\n/g, nl);
  let ins;
  if (atStart && atEnd) ins = t;
  else if (atStart) ins = t + nl;
  else if (atEnd) ins = nl + t;
  else ins = nl + t + nl;
  return { edits: [{ s: a, e: b, t: ins }], caret: a + ins.length };
}

// What holds p in a paragraph that starts at s: the groups open there, outermost first, as [{ s
// (the command's start), o (its brace), name (the command, '' for a bare group, the environment
// for a box's), re (what opens it again: \textcolor{red}{, {\bfseries ) }], or null where the
// paragraph is too long to read. Comments, \verb and maths are passed over.
const BOX_CMD = /^(?:footnote|footnotetext|footnotemark|marginpar|marginnote|parbox|mbox|makebox|fbox|framebox|raisebox|colorbox|fcolorbox|hbox|vbox|vtop|vcenter|resizebox|scalebox|rotatebox|caption|thanks|title|author|date|tcbox|adjustbox|savebox|sbox|pbox|shortstack|stackon|underbrace|overbrace|cite|ref|label|url|href|includegraphics|tikz|text)$/;
const BOX_ENV = /^(?:minipage|tabular\*?|tabularx|tabulary|array|tikzpicture|picture|tcolorbox|framed|mdframed|adjustbox|wrapfigure|wraptable|lrbox)$/;
export function groupsAt(src, s, p) {
  if (p - s > 40000) return null;
  const stack = [], envs = [];
  let pending = null, math = false;
  for (let i = s; i < p; i++) {
    const c = src[i];
    if (c === '%') { const j = src.indexOf('\n', i); if (j < 0 || j >= p) break; i = j; continue; }
    if (c === '$') { if (src[i + 1] === '$') i++; math = !math; pending = null; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z@]+)\*?|^\\(.)/.exec(src.slice(i, i + 40));
      if (!m) continue;
      const name = m[1];
      if (name === 'verb') { const d = src[i + 5], j = src.indexOf(d, i + 6); if (j < 0 || j >= p) return stack; i = j; pending = null; continue; }
      if (name === 'begin' || name === 'end') {
        const e = /^\\(?:begin|end)\s*\{([^{}]{1,40})\}/.exec(src.slice(i, i + 60));
        if (e) {
          if (name === 'begin') { envs.push(e[1]); if (BOX_ENV.test(e[1])) stack.push({ s: i, o: i + e[0].length - 1, name: e[1], env: true, box: true, re: '' }); }
          else { const k = envs.lastIndexOf(e[1]); if (k >= 0) envs.length = k; const j = stack.findIndex((g) => g.env && g.name === e[1]); if (j >= 0) stack.length = j; }
          i += e[0].length - 1; pending = null; continue;
        }
      }
      if (name === '(' || name === '[') math = true;
      if (name === ')' || name === ']') math = false;
      pending = name ? { name, s: i } : null;
      i += m[0].length - 1;
      continue;
    }
    // (an optional argument passed over; the caret inside one, or one not closed, ends the scan:
    // each [ is scanned once, so a stranger's paragraph of brackets costs its length)
    if (c === '[' && pending) { const z = groupEnd(src, i, Math.min(4000, p - i + 1)); if (z > 0 && z <= p) { i = z - 1; continue; } stack.push({ s: pending.s, o: i, name: pending.name, box: true, re: '' }); return stack; }
    if (c === '{') {
      const g = pending ? { s: pending.s, o: i, name: pending.name, re: '' } : { s: i, o: i, name: '', re: '' };
      g.box = BOX_CMD.test(g.name) || (math && !g.name);
      // (groups nested deeper than any formatting goes: not read)
      if (stack.length >= 64) return null;
      if (g.name) g.re = src.slice(g.s, i + 1);
      else { const d = /^\{((?:\s*\\[A-Za-z]+(?:\{[^{}]{0,40}\})?)*\s*)/.exec(src.slice(i, i + 200)); g.re = d ? d[0] : '{'; }
      stack.push(g);
      pending = null;
      continue;
    }
    if (c === '}') {
      // (an argument closed: the next may be the same command's)
      const g = stack.pop();
      pending = g && g.name && !g.env ? { name: g.name, s: g.s } : null;
      continue;
    }
    if (!/\s/.test(c)) pending = null;
  }
  return stack;
}
// A break at p (a selection [p, q) goes) in the paragraph that starts at s: on lines of its own
// (breakEdits) where no group is open; at a group's start before the group, at its end after it;
// within a group of the words' style (\textbf{…}, {\itshape …}, \textcolor{red}{…}) the groups
// closed before it and opened again after it, so the words keep their style on both pages.
// { blocked: why } inside a footnote, a box, a caption or a minipage, where TeX makes no page.
export function breakAt(src, s, p, q, text) {
  if (q == null) q = p;
  const G = groupsAt(src, s, p);
  if (!G) return breakEdits(src, p, q, text);
  const box = G.find((g) => g.box);
  if (box) return { blocked: box.name === 'footnote' || box.name === 'footnotetext' ? 'TeX makes no new page inside a footnote: put the caret in the text' : 'TeX makes no new page inside ' + (box.env ? 'a ' + box.name : '\\' + (box.name || 'a box')) + ': put the caret outside it' };
  // (a selection that leaves its group: the caret alone)
  const Gq = q > p ? groupsAt(src, s, q) : G;
  if (!Gq || Gq.length !== G.length || Gq.some((g, k) => g.o !== G[k].o)) q = p;
  let a = p, b = q;
  const stack = G.slice();
  while (stack.length) {
    const g = stack[stack.length - 1];
    // (its words start after the brace, or after a bare group's declarations)
    const cs = g.name ? g.o + 1 : g.o + g.re.length;
    if (!/\S/.test(src.slice(Math.min(cs, a), a))) { a = b = g.s; stack.pop(); continue; }
    // (its end looked for only past the caret: each group's text once)
    const z = groupEnd(src, g.o, Math.min(40000, b - g.o + 8000));
    if (z > 0 && !/\S/.test(src.slice(b, z - 1))) { a = b = z; stack.pop(); continue; }
    break;
  }
  if (!stack.length) return breakEdits(src, a, b, text);
  while (a > 0 && (src[a - 1] === ' ' || src[a - 1] === '\t')) a--;
  while (b < src.length && (src[b] === ' ' || src[b] === '\t')) b++;
  const nl = eolOf(src);
  const close = '}'.repeat(stack.length), reopen = stack.map((g) => g.re).join('');
  const t = close + nl + text.replace(/\n/g, nl) + nl + reopen;
  return { edits: [{ s: a, e: b, t }], caret: a + t.length };
}

// ---- columns -------------------------------------------------------------------------------------
// The multicols environment that holds p, as { s, e, n, star, head: [s, hs), nAt: [ns, ne) }, or null
export function multicolsAt(src, p) {
  const re = /\\(begin|end)\s*\{(multicols\*?)\}/g;
  const stack = [];
  let found = null;
  for (let m, k = 0; (m = re.exec(src)) && k < 2000; k++) {
    if (m.index >= p && !stack.length) break;
    if (m[1] === 'begin') {
      const after = m.index + m[0].length;
      const nm = /^\s*\{\s*(\d+)\s*\}/.exec(src.slice(after, after + 20));
      stack.push({ s: m.index, star: m[2].endsWith('*'), n: nm ? +nm[1] : 2, nAt: nm ? [after + nm[0].indexOf(nm[1]), after + nm[0].indexOf(nm[1]) + nm[1].length] : null, hs: after + (nm ? nm[0].length : 0) });
    } else if (stack.length) {
      const b = stack.pop();
      const e = m.index + m[0].length;
      if (b.s < p && p < e) found = { ...b, e, tail: [m.index, e], head: [b.s, b.hs] };
    }
  }
  return found;
}
// The body's range: [after \begin{document} and \maketitle if it comes first, before \end{document}]
export function bodyRange(src) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const b = /\\begin\s*\{document\}/.exec(src.slice(end, end + 40));
  let s = end + (b ? b[0].length : 0);
  const ee = src.indexOf('\\end{document}', s);
  let e = ee < 0 ? src.length : ee;
  // (\maketitle, and the abstract, stay above the columns as in a two column paper)
  const head = /^\s*\\maketitle\b/.exec(src.slice(s, s + 400));
  if (head) s += head[0].length;
  while (s < e && /\s/.test(src[s])) s++;
  while (e > s && /\s/.test(src[e - 1])) e--;
  return { s, e };
}
// The floats a multicols must not hold (TeX sets them and leaves them out of the PDF: multicol's
// "Floats and marginpars not allowed"), at the top level of [s, e): [{ s, e, name }]. figure* and
// table* are allowed: they go to the top of a page.
const FLOAT_ENV = /^(?:figure|table|wrapfigure|wraptable|SCfigure|SCtable|sidewaysfigure|sidewaystable|algorithm|marginfigure|margintable)$/;
export function floatsIn(src, s, e) {
  const t = stripComments(src.slice(0, e));
  const re = /\\(begin|end)\s*\{([A-Za-z@]+\*?)\}/g;
  re.lastIndex = s;
  const out = [], stack = [];
  for (let m, k = 0; (m = re.exec(t)) && k < 5000; k++) {
    if (m[1] === 'begin') { stack.push({ name: m[2], s: m.index }); continue; }
    let j = stack.length - 1;
    while (j >= 0 && stack[j].name !== m[2]) j--;
    if (j < 0) continue;
    const b = stack[j];
    stack.length = j;
    if (j === 0 && FLOAT_ENV.test(b.name)) out.push({ s: b.s, e: m.index + m[0].length, name: b.name });
    if (out.length >= 500) break;
  }
  return out;
}
// multicols around the paragraphs [s, e), ended before each float there and begun again after it,
// so that no float stands inside it (a part with nothing but spaces gets none)
export function wrapMulticols(src, s, e, n) {
  const nl = eolOf(src);
  const parts = [];
  let a = s;
  for (const f of floatsIn(src, s, e)) { parts.push([a, f.s]); a = f.e; }
  parts.push([a, e]);
  const out = [];
  for (let [x, y] of parts) {
    while (x < y && /\s/.test(src[x])) x++;
    while (y > x && /\s/.test(src[y - 1])) y--;
    if (x >= y) continue;
    const lineStart = x === 0 || src[x - 1] === '\n';
    out.push({ s: y, e: y, t: nl + '\\end{multicols}' }, { s: x, e: x, t: (lineStart ? '' : nl) + '\\begin{multicols}{' + n + '}' + nl });
  }
  // (from the last to the first, as one list)
  return out.sort((u, v) => v.s - u.s);
}
// The body in columns: multicols environments one after another with nothing between them but
// floats and spaces, as columnsEdits and wrapMulticols write them: { n, segs: [multicolsAt's] }
export function bodyColumns(src) {
  const body = bodyRange(src);
  if (!body || body.e <= body.s) return null;
  const t = stripComments(src.slice(0, body.e));
  const segs = [];
  let i = body.s;
  for (let k = 0; k < 500; k++) {
    while (i < body.e && /\s/.test(t[i])) i++;
    if (i >= body.e) break;
    const m = /^\\begin\s*\{([A-Za-z@]+\*?)\}/.exec(t.slice(i, i + 40));
    if (!m) return null;
    if (/^multicols\*?$/.test(m[1])) {
      const M = multicolsAt(src, i + 1);
      if (!M || M.s !== i) return null;
      segs.push(M);
      i = M.e;
    } else if (FLOAT_ENV.test(m[1])) {
      const z = t.indexOf('\\end{' + m[1] + '}', i);
      if (z < 0) return null;
      i = z + m[1].length + 6;
    } else return null;
  }
  if (!segs.length || segs.some((M) => M.n !== segs[0].n || M.star !== segs[0].star)) return null;
  return { n: segs[0].n, segs };
}
// Columns for the whole document: n (1, 2, 3, ...): two as the class's twocolumn option, more as
// multicols around the body (ended and begun again around each float); the body in multicols
// already changes its number.
export function columnsEdits(src, n, o = {}) {
  const cls = classPage(src);
  if (!cls) return [];
  const body = bodyRange(src);
  if (!body) return [];
  const BC = bodyColumns(src);
  const out = [];
  if (BC) {
    if (n === 1) return BC.segs.flatMap((M) => unwrapMulticols(src, M));
    for (const M of BC.segs) if (M.nAt && +src.slice(M.nAt[0], M.nAt[1]) !== n) out.push({ s: M.nAt[0], e: M.nAt[1], t: String(n) });
    return out;
  }
  if (n === 2) return cls.twocolumn ? [] : classOptions(src, { twocolumn: true, onecolumn: null });
  if (cls.twocolumn) out.push(...classOptions(src, { twocolumn: null }));
  if (n > 2) {
    out.push(...usePackages(src, ['multicol'], { others: o.others }));
    out.push(...wrapMulticols(src, body.s, body.e, n));
  }
  return out;
}
export function unwrapMulticols(src, M) {
  // (what wrapMulticols wrote goes exactly; anything else leaves the words where they were)
  const hs = M.head[1], te = M.tail[0];
  const a = src[hs] === '\n' ? hs + 1 : src[hs] === '\r' && src[hs + 1] === '\n' ? hs + 2 : hs;
  const b = src[te - 1] === '\n' ? (src[te - 2] === '\r' ? te - 2 : te - 1) : te;
  return [{ s: b, e: M.e, t: '' }, { s: M.s, e: a, t: '' }];
}
// \setlength{\name}{value} and \setlength\name{value} of a text: [{ s, e, v: [a, b) }], read by
// steps (a pattern with a run of spaces each side of an optional brace backtracked over a
// stranger's spaces: 30 000 of them after \setlength took a second, 200 000 forty)
export function setLengths(pre, name) {
  const out = [];
  const re = /\\setlength(?![A-Za-z@])/g;
  for (let m, k = 0; (m = re.exec(pre)) && k < 2000 && out.length < 200; k++) {
    let i = m.index + m[0].length;
    const ws = () => { for (let n = 0; i < pre.length && n < 40 && /\s/.test(pre[i]); n++) i++; };
    ws();
    const braced = pre[i] === '{';
    if (braced) { i++; ws(); }
    if (pre.slice(i, i + 1 + name.length) !== '\\' + name || /[A-Za-z@]/.test(pre[i + 1 + name.length] || '')) continue;
    i += 1 + name.length;
    ws();
    if (braced) { if (pre[i] !== '}') continue; i++; ws(); }
    if (pre[i] !== '{') continue;
    const z = groupEnd(pre, i, 200);
    if (z < 0) continue;
    out.push({ s: m.index, e: z, v: [i + 1, z - 1] });
    re.lastIndex = z;
  }
  return out;
}
// \setlength{\columnsep}{…} and \setlength{\columnseprule}{…} in the preamble
export function lengthEdits(src, name, value) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const all = setLengths(stripComments(src.slice(0, end)), name);
  const last = all[all.length - 1] || null;
  if (value == null) return last ? [wholeLine(src, last.s, last.e)] : [];
  if (last) return src.slice(last.v[0], last.v[1]).trim() === value ? [] : [{ s: last.v[0], e: last.v[1], t: value }];
  return [lineBefore(src, end, '\\setlength{\\' + name + '}{' + value + '}')];
}

// ---- headers and footers (fancyhdr, KOMA-Script's scrlayer-scrpage) ------------------------------
// A slot: H or F, O or E (odd, even), L, C or R: 'HOL' is the header's left on odd pages.
export const SLOTS = ['HOL', 'HOC', 'HOR', 'HEL', 'HEC', 'HER', 'FOL', 'FOC', 'FOR', 'FEL', 'FEC', 'FER'];
// fancyhdr's [LE,RO] as the slots it names, for \fancyhead (H), \fancyfoot (F), \fancyhf (both)
export function slotsOf(sel, where) {
  const out = new Set();
  const items = sel == null ? [''] : sel.split(',').map((x) => x.trim().toUpperCase()).filter((x, i, a) => x || a.length === 1);
  for (const it of items) {
    if (/[^EOLCRHF]/.test(it)) continue;
    const eo = /[EO]/.test(it) ? [...it].filter((c) => c === 'E' || c === 'O') : ['O', 'E'];
    const lcr = /[LCR]/.test(it) ? [...it].filter((c) => 'LCR'.includes(c)) : ['L', 'C', 'R'];
    const hf = where === 'HF' ? (/[HF]/.test(it) ? [...it].filter((c) => c === 'H' || c === 'F') : ['H', 'F']) : [where];
    for (const h of hf) for (const e of eo) for (const l of lcr) out.add(h + e + l);
  }
  return out;
}
// fancyhdr's older commands: \lhead[even]{odd}
const OLD = { lhead: ['H', 'L'], chead: ['H', 'C'], rhead: ['H', 'R'], lfoot: ['F', 'L'], cfoot: ['F', 'C'], rfoot: ['F', 'R'] };
// scrlayer-scrpage's: \ihead (inner: the left of odd pages, the right of even ones), \chead,
// \ohead, the foot's, and \lohead and its like for one side; [x] before the argument is what the
// plain style (plain.scrheadings) gets, a star gives both the argument
const KOMA = { ihead: ['H', ['OL', 'ER']], chead: ['H', ['OC', 'EC']], ohead: ['H', ['OR', 'EL']], ifoot: ['F', ['OL', 'ER']], cfoot: ['F', ['OC', 'EC']], ofoot: ['F', ['OR', 'EL']] };
for (const w of ['head', 'foot']) for (const l of 'lcr') for (const s of 'eo') KOMA[l + s + w] = [w === 'head' ? 'H' : 'F', [s.toUpperCase() + l.toUpperCase()]];
const KOMA_CLEAR = { clearpairofpagestyles: ['main', 'plain'], clearmainofpairofpagestyles: ['main'], clearplainofpairofpagestyles: ['plain'], clearscrheadings: ['main'], clearscrplain: ['plain'], clearscrheadfoot: ['main', 'plain'] };

// An argument as TeX reads it and as the page and the header's field show it: a comment (% to the
// line's end) goes with that line end and the spaces that start the next line, a line end is a
// space, a run of spaces is one, none at either end. map[i]: where the text's i-th character
// stands in the argument, [s, e) (a space stands for its whole run).
export function cleanArg(raw) {
  raw = String(raw);
  const chars = [], map = [];
  const n = Math.min(raw.length, 4000);
  for (let i = 0; i < n;) {
    const c = raw[i];
    if (c === '\\' && i + 1 < n) {
      // (a control symbol whole: \% is a percent sign, \\ a line break)
      const d = raw[i + 1] === '\n' || raw[i + 1] === '\r' ? ' ' : raw[i + 1];
      chars.push(c, d); map.push([i, i + 1], [i + 1, i + 2]); i += 2; continue;
    }
    if (c === '%') { let j = raw.indexOf('\n', i); j = j < 0 || j >= n ? n : j + 1; while (j < n && (raw[j] === ' ' || raw[j] === '\t')) j++; i = j; continue; }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      let j = i + 1;
      while (j < n && (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\n' || raw[j] === '\r')) j++;
      if (chars.length && chars[chars.length - 1] !== ' ') { chars.push(' '); map.push([i, j]); }
      i = j; continue;
    }
    chars.push(c); map.push([i, i + 1]); i++;
  }
  while (chars.length && chars[chars.length - 1] === ' ') { chars.pop(); map.pop(); }
  return { text: chars.join(''), map };
}
// The edit that makes the argument [a, b) of src read as text (as cleanArg reads it): the smallest
// one, its comments and line ends kept around it; null where the change would take a comment
// with it (the source, not the field, is the place to change that)
export function argEdits(src, a, b, text) {
  const raw = src.slice(a, b);
  const { text: old, map } = cleanArg(raw);
  if (old === text) return [];
  let p = 0;
  while (p < old.length && p < text.length && old[p] === text[p]) p++;
  let z = 0;
  while (z < old.length - p && z < text.length - p && old[old.length - 1 - z] === text[text.length - 1 - z]) z++;
  let rs, re;
  if (!old.length) {
    // (nothing but spaces, which the text takes the place of, or comments, which it goes before)
    rs = 0; re = /^[ \t\r\n]*$/.test(raw) ? raw.length : 0;
  } else {
    rs = p > 0 ? map[p - 1][1] : map[0][0];
    re = z > 0 ? map[old.length - z][0] : map[old.length - 1][1];
  }
  if (re < rs) re = rs;
  if (/(?:^|[^\\])(?:\\\\)*%/.test(raw.slice(rs, re))) return null;
  return [{ s: a + rs, e: a + re, t: text.slice(p, text.length - z) }];
}

// The header and footer commands of a stretch of text [s, e): { cmds: [{ s, e, cmd, sel: [a, b)
// or null, arg: [a, b), slots: Set, text (as TeX reads it), raw }], styles: { name: { at: { s, e,
// body: [a, b) }, base, cmds, rules } } (\fancypagestyle's, and plain.scrheadings's from KOMA's
// optional arguments), style: the last \pagestyle's argument (styleAt: where), rules:
// \headrulewidth and \footrulewidth as set }. o.koma: scrlayer-scrpage is loaded (\chead and
// \cfoot are its own then, not fancyhdr's older ones).
export function readHF(src, s0 = 0, e0, o = {}) {
  if (e0 == null) { e0 = preambleEnd(src); if (e0 < 0) e0 = Math.min(src.length, 200000); }
  // (a style's body is read in the text its preamble's reading made: the comments taken out once,
  // not again for each of a stranger's thousand \fancypagestyle lines)
  const t = o.t || stripComments(src.slice(0, e0));
  const re = /\\(fancyhead|fancyfoot|fancyhf|lhead|chead|rhead|lfoot|cfoot|rfoot|pagestyle|fancypagestyle|renewcommand|thispagestyle|[io]head|[io]foot|[lcr][eo]head|[lcr][eo]foot|clear(?:pairofpagestyles|mainofpairofpagestyles|plainofpairofpagestyles|scrheadings|scrplain|scrheadfoot))(?![A-Za-z@])/g;
  re.lastIndex = s0;
  const out = { cmds: [], styles: {}, style: null, styleAt: null, rules: {} };
  const skip = (i) => { let k = 0; while (i < t.length && /\s/.test(t[i]) && k++ < 40) i++; return i; };
  const arg = (a, b) => ({ arg: [a, b], raw: src.slice(a, b), text: cleanArg(src.slice(a, b)).text });
  const komaPlain = () => out.styles['plain.scrheadings'] || (out.styles['plain.scrheadings'] = { at: null, base: null, cmds: [], rules: {} });
  for (let m, n = 0; (m = re.exec(t)) && n < 2000 && m.index < e0; n++) {
    const name = m[1];
    let i = skip(m.index + m[0].length);
    if (name === 'pagestyle' || name === 'thispagestyle') {
      if (t[i] !== '{') continue;
      const z = groupEnd(t, i, 200);
      if (z < 0) continue;
      if (name === 'pagestyle') { out.style = t.slice(i + 1, z - 1).trim(); out.styleAt = { s: m.index, e: z, arg: [i + 1, z - 1] }; }
      continue;
    }
    if (name === 'renewcommand') {
      // \renewcommand{\headrulewidth}{0pt} and \renewcommand\footrulewidth{…}
      const r = /^\{?\s*\\(head|foot)rulewidth\s*\}?\s*\{([^{}]{0,40})\}/.exec(t.slice(i, i + 80));
      if (r) out.rules[r[1]] = { value: r[2].trim(), s: m.index, e: i + r[0].length, v: [i + r[0].length - 1 - r[2].length, i + r[0].length - 1] };
      continue;
    }
    if (name === 'fancypagestyle') {
      // \fancypagestyle{name}[base]{…}: a style of its own, read on its own
      if (t[i] === '*') i = skip(i + 1);
      if (t[i] !== '{') continue;
      const z = groupEnd(t, i, 200);
      if (z < 0) continue;
      const which = t.slice(i + 1, z - 1).trim();
      let j = skip(z), base = null;
      if (t[j] === '[') { const y = groupEnd(t, j, 200); if (y > 0) { base = t.slice(j + 1, y - 1).trim(); j = skip(y); } }
      if (t[j] !== '{') continue;
      const w = groupEnd(t, j, 4000);
      if (w < 0) continue;
      const inner = readHF(src, j + 1, w - 1, { ...o, t });
      out.styles[which] = { at: { s: m.index, e: w, body: [j + 1, w - 1] }, base, cmds: inner.cmds, rules: inner.rules };
      re.lastIndex = w;
      continue;
    }
    if (KOMA_CLEAR[name]) {
      if (!o.koma) continue;
      const all = { s: m.index, e: m.index + m[0].length, cmd: name, sel: null, arg: null, raw: '', text: '', slots: new Set(SLOTS), koma: true, clear: true };
      if (KOMA_CLEAR[name].includes('main')) out.cmds.push(all);
      if (KOMA_CLEAR[name].includes('plain')) komaPlain().cmds.push(all);
      continue;
    }
    const koma = o.koma && KOMA[name];
    if (KOMA[name] && !koma && !OLD[name]) continue;
    let star = false;
    if (koma && t[i] === '*') { star = true; i = skip(i + 1); }
    let sel = null;
    if (t[i] === '[') { const z = groupEnd(t, i, 4000); if (z < 0) continue; sel = [i + 1, z - 1]; i = skip(z); }
    if (t[i] !== '{') continue;
    const z = groupEnd(t, i, 4000);
    if (z < 0) continue;
    if (koma) {
      // \ihead[plain]{main}, \ihead*{both}, \lohead{one side}
      const [w, places] = KOMA[name];
      const slots = new Set(places.map((x) => w + x));
      out.cmds.push({ s: m.index, e: z, cmd: name, sel: null, ...arg(i + 1, z - 1), slots, koma: true });
      if (sel) komaPlain().cmds.push({ s: m.index, e: z, cmd: name, sel: null, ...arg(sel[0], sel[1]), slots, koma: true });
      else if (star) komaPlain().cmds.push({ s: m.index, e: z, cmd: name, sel: null, ...arg(i + 1, z - 1), slots, koma: true });
    } else if (OLD[name]) {
      // \lhead[even]{odd}, \lhead{both}
      const [h, l] = OLD[name];
      if (sel) out.cmds.push({ s: m.index, e: z, cmd: name, sel: null, ...arg(sel[0], sel[1]), slots: new Set([h + 'E' + l]), old: true });
      out.cmds.push({ s: m.index, e: z, cmd: name, sel: null, ...arg(i + 1, z - 1), slots: new Set(sel ? [h + 'O' + l] : [h + 'O' + l, h + 'E' + l]), old: true });
    } else {
      const slots = slotsOf(sel ? t.slice(sel[0], sel[1]) : null, name === 'fancyhead' ? 'H' : name === 'fancyfoot' ? 'F' : 'HF');
      out.cmds.push({ s: m.index, e: z, cmd: name, sel, ...arg(i + 1, z - 1), slots });
    }
    re.lastIndex = z;
  }
  return out;
}
// The text of each slot as TeX takes it: the last command that names it, over a style's own
export function slotTexts(cmds, base = FANCY_DEFAULT) {
  const out = {};
  for (const k of SLOTS) out[k] = base[k] || '';
  for (const c of cmds) for (const k of c.slots) out[k] = c.text;
  return out;
}
// fancyhdr's own (\f@nch@initialise): the marks in the head, outside them on two sided pages,
// the page number at the foot's centre
export const FANCY_DEFAULT = { HOL: '\\slshape\\rightmark', HOR: '\\slshape\\leftmark', HEL: '\\slshape\\rightmark', HER: '\\slshape\\leftmark', FOC: '\\thepage', FEC: '\\thepage' };
export const fancyDefault = (two) => (two ? { HOL: '\\slshape\\leftmark', HOR: '\\slshape\\rightmark', HEL: '\\slshape\\rightmark', HER: '\\slshape\\leftmark', FOC: '\\thepage', FEC: '\\thepage' } : FANCY_DEFAULT);
// KOMA-Script's scrheadings and plain.scrheadings as scrlayer-scrpage sets them for a KOMA class
const KOMA_DEFAULT = (two) => (two ? { HOR: '\\headmark', HEL: '\\headmark', FOR: '\\pagemark', FEL: '\\pagemark' } : { HOC: '\\headmark', HEC: '\\headmark', FOC: '\\pagemark', FEC: '\\pagemark' });
const KOMA_PLAIN = (two) => (two ? { FOR: '\\pagemark', FEL: '\\pagemark' } : { FOC: '\\pagemark', FEC: '\\pagemark' });
// LaTeX's own styles: plain (the number at the foot), headings (the mark and the number, outside
// on two sided pages), empty
export function builtinSlots(name, two) {
  if (name === 'empty') return {};
  if (name === 'headings' || name === 'myheadings') {
    const mark = '\\slshape\\rightmark', left = two ? '\\slshape\\leftmark' : mark;
    return { HOL: mark, HOR: '\\thepage', HEL: two ? '\\thepage' : mark, HER: two ? left : '\\thepage' };
  }
  return { FOC: '\\thepage', FEC: '\\thepage' };
}
const ruleOf = (v, d) => { if (v == null) return d; const x = lenPt(v); return x == null ? d : x; };

// The headers and footers of a document: its styles as TeX ends up with them (fancyhdr's fancy
// and every \fancypagestyle, each over the fancy one or its base; scrheadings and
// plain.scrheadings with scrlayer-scrpage), the one its pages take (the last \pagestyle, else
// scrheadings where scrlayer-scrpage is loaded, else the class's: headings in a book, plain), and
// what was read where (main: the main file's own commands, the only ones edited in place)
export function hfModel(src, o = {}) {
  const others = o.others || [];
  const end = preambleEnd(src);
  const cls = classPage(src);
  const koma = loaded(src, 'scrlayer-scrpage', end, others) || loaded(src, 'scrpage2', end, others);
  const fancy = loaded(src, 'fancyhdr', end, others);
  const hfs = [...others.map((x) => readHF(x, 0, Math.min(x.length, 200000), { koma })), readHF(src, 0, undefined, { koma })];
  const main = hfs[hfs.length - 1];
  const two = o.twoside != null ? !!o.twoside : !!(cls && cls.twoside) || geometryKeys(src, end).twoside === true;
  const global = hfs.flatMap((h) => h.cmds);
  const named = {};
  for (const h of hfs) for (const [k, v] of Object.entries(h.styles)) named[k] = { ...v, main: h === main, cmds: k === 'plain.scrheadings' ? [...((named[k] || {}).cmds || []), ...v.cmds] : v.cmds };
  const rules = {};
  for (const h of hfs) for (const [k, v] of Object.entries(h.rules)) rules[k] = v.value;
  const explicit = hfs.map((h) => h.style).filter(Boolean).pop() || null;
  const style = explicit || (koma ? 'scrheadings' : cls && /^(book|scrbook|memoir)$/.test(cls.name) ? 'headings' : 'plain');
  const styles = {};
  if (fancy) {
    const base = slotTexts(global.filter((c) => !c.koma), fancyDefault(two));
    styles.fancy = { slots: base, headrule: ruleOf(rules.head, 0.4), footrule: ruleOf(rules.foot, 0) };
    // (a style's base before it, where the base is one of these: its order of definition)
    for (const [name, S] of Object.entries(named)) {
      if (name === 'plain.scrheadings' || !S.at) continue;
      const from = S.base && styles[S.base] ? styles[S.base] : styles.fancy;
      const r = { ...rules, ...Object.fromEntries(Object.entries(S.rules || {}).map(([k, v]) => [k, v.value])) };
      styles[name] = { slots: slotTexts(S.cmds, from.slots), headrule: ruleOf(r.head, from.headrule), footrule: ruleOf(r.foot, from.footrule), at: S.at, main: S.main };
    }
  }
  if (koma) {
    styles.scrheadings = { slots: slotTexts(global.filter((c) => c.koma), KOMA_DEFAULT(two)), headrule: 0, footrule: 0 };
    styles['plain.scrheadings'] = { slots: slotTexts((named['plain.scrheadings'] || { cmds: [] }).cmds, KOMA_PLAIN(two)), headrule: 0, footrule: 0 };
    // (with scrheadings in use, plain is its plain partner)
    if (style === 'scrheadings' && !styles.plain) styles.plain = styles['plain.scrheadings'];
    styles.scrplain = styles['plain.scrheadings'];
  }
  return { koma, fancy, two, style, explicit, styles, global, main, mainCmds: main.cmds, end, cls };
}

// [R] for both sides' right, [LE,RO] for the outside, [RO] for one
export function selectorOf(slots, twoside) {
  const list = [...slots];
  const by = (side) => list.filter((k) => k[1] === side).map((k) => k[2]).sort().join('');
  const o = by('O'), e = by('E');
  if (o === e || !twoside) return [...new Set(list.map((k) => k[2]))].sort((a, b) => 'LCR'.indexOf(a) - 'LCR'.indexOf(b)).join('');
  const parts = [];
  for (const c of 'LCR') { const sides = (o.includes(c) ? 'O' : '') + (e.includes(c) ? 'E' : ''); if (sides === 'OE') parts.push(c); else if (sides) parts.push(c + sides); }
  return parts.join(',');
}
// the same places, as a one sided document has them (odd pages only) or a two sided one
const sameSlots = (a, b, two) => { const f = (s) => [...s].filter((k) => two || k[1] === 'O').sort().join(); return f(a) === f(b); };
const fancyLine = (set, t, two) => ([...set][0][0] === 'H' ? '\\fancyhead' : '\\fancyfoot') + '[' + selectorOf(set, two) + ']{' + t + '}';
// scrlayer-scrpage's commands for slots and their texts ({ slot: text }): \ihead, \chead, \ohead
// where the two sides agree (or the document is one sided), \lohead and its like where not
function komaLines(texts, two) {
  const out = [], done = new Set();
  for (const w of ['H', 'F']) {
    const word = w === 'H' ? 'head' : 'foot';
    for (const [p, pair] of [['i', ['OL', 'ER']], ['c', ['OC', 'EC']], ['o', ['OR', 'EL']]]) {
      const [a, b] = pair.map((x) => w + x);
      const has = (k) => Object.prototype.hasOwnProperty.call(texts, k);
      if (!two) { if (has(a)) { out.push('\\' + p + word + '{' + texts[a] + '}'); done.add(a); } continue; }
      if (has(a) && has(b) && texts[a] === texts[b]) { out.push('\\' + p + word + '{' + texts[a] + '}'); done.add(a); done.add(b); continue; }
      for (const k of [a, b]) if (has(k)) { out.push('\\' + k[2].toLowerCase() + k[1].toLowerCase() + word + '{' + texts[k] + '}'); done.add(k); }
    }
  }
  return out;
}
const samePage = (a, b) => String(a || '').replace(/\\pagemark\b/g, '\\thepage').replace(/\\headmark\b/g, '\\rightmark').replace(/\\slshape\s*/g, '') === String(b || '').replace(/\\pagemark\b/g, '\\thepage').replace(/\\headmark\b/g, '\\rightmark').replace(/\\slshape\s*/g, '');

// Where new header lines go: after the last of the main file's, else just before \begin{document}
function hfLineAt(src, end, cmds, extra = []) {
  const last = [...cmds, ...extra].filter((c) => c.s < end).sort((a, b) => b.e - a.e)[0];
  if (last) {
    const nl = src.indexOf('\n', last.e);
    const at = nl < 0 || nl >= end ? end : nl + 1;
    return { at, pre: src[at - 1] === '\n' ? '' : eolOf(src) };
  }
  const at = src.lastIndexOf('\n', end - 1) + 1;
  return at < end && /\S/.test(src.slice(at, end)) ? { at: end, pre: eolOf(src) } : { at, pre: '' };
}
// The lines that turn fancyhdr on with nothing in its slots (and no rule under the header, as
// Word's headers have none), unless \pagestyle{fancy} is there already
export function fancyOn(src, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return { edits: [], H: null };
  const H = readHF(src);
  if (H.style === 'fancy') return { edits: [], H };
  const nl = eolOf(src);
  const pk = usePackages(src, ['fancyhdr'], { end, others: o.others });
  // (\fancyhf{} where no slot is set yet: fancyhdr's own defaults are a running head and a rule)
  const lines = [...(H.cmds.length ? [] : ['\\fancyhf{}']), ...(H.rules.head ? [] : ['\\renewcommand{\\headrulewidth}{0pt}'])];
  if (H.styleAt) {
    // a \pagestyle{plain} or {empty} of the preamble becomes fancy where it stands, the lines after it
    const ln = src.indexOf('\n', H.styleAt.e), at = ln < 0 || ln >= end ? H.styleAt.e : ln + 1;
    const ins = at === H.styleAt.e ? { s: at, e: at, t: lines.length ? nl + lines.join(nl) : '' } : { s: at, e: at, t: lines.map((x) => x + nl).join('') };
    return { edits: [...pk, { s: H.styleAt.arg[0], e: H.styleAt.arg[1], t: 'fancy' }, ins], H };
  }
  lines.unshift('\\pagestyle{fancy}');
  const at = src.lastIndexOf('\n', end - 1) + 1;
  const ins = at < end && /\S/.test(src.slice(at, end)) ? { s: end, e: end, t: nl + lines.join(nl) + nl } : { s: at, e: at, t: lines.join(nl) + nl };
  return { edits: [...pk, ins], H };
}
// The edits that put text in slots (a set of SLOTS: one slot, or the odd and even of one place
// in a one sided document), in the style the document's pages take: in place where a command of
// the main file names exactly them (its comments and line ends kept), else a command of their own
// after the others; inside the \fancypagestyle the pages take where that is one; in
// scrlayer-scrpage's commands where it is loaded (or a KOMA class's, which gets it); else
// fancyhdr turned on, what the page showed kept (o.keep: { slot: text }). twoside: whether E and O
// are told apart. Text '' empties them. null where the text cannot be written there without
// losing a comment of the source.
export function slotEdits(src, slots, text, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  slots = new Set(slots);
  const M = hfModel(src, o);
  const two = o.twoside != null ? !!o.twoside : M.two;
  if (M.koma || (M.cls && /^scr/.test(M.cls.name) && !M.fancy)) return komaEdits(src, slots, text, M, two, o);
  const S = M.styles[M.style];
  if (M.fancy && S && S.at && M.style !== 'fancy') {
    if (!S.main) return null;
    return styleEdits(src, slots, text, S, M, two);
  }
  const on = M.style === 'fancy' && M.fancy ? { edits: [], H: M.main } : fancyOn(src, o);
  const H = on.H || readHF(src);
  const fresh = on.edits.length > 0;
  const cur = fresh ? slotTexts([], {}) : M.styles.fancy ? M.styles.fancy.slots : slotTexts(H.cmds, fancyDefault(two));
  if (!fresh && [...slots].every((k) => cur[k] === text)) return [];
  // the last command of the main file naming any of these slots
  const last = fresh ? null : [...H.cmds].reverse().find((c) => [...c.slots].some((k) => slots.has(k)));
  if (last && !last.old && last.arg && sameSlots(last.slots, slots, two)) return argEdits(src, last.arg[0], last.arg[1], text);
  const nl = eolOf(src);
  const line = fancyLine(slots, text, two);
  if (fresh) {
    // (after the lines that turn it on, in the same place; with them what the page showed before
    // that should stay, o.keep: the plain style's page number at the foot, a book's running head)
    const lines = text ? [line] : [];
    const by = new Map();
    for (const [k, t] of Object.entries(o.keep || {})) if (!slots.has(k) && t) { const g = k[0] + k[2] + '\u0000' + t; if (!by.has(g)) by.set(g, new Set()); by.get(g).add(k); }
    for (const [g, set] of by) lines.push(fancyLine(set, g.split('\u0000')[1], two));
    const e = on.edits[on.edits.length - 1];
    if (!lines.length) return joinEdits(on.edits.filter((x) => x.t || x.e > x.s));
    const t = e.t ? e.t.replace(/\r?\n$/, '') + nl + lines.join(nl) + (e.t.endsWith('\n') ? nl : '') : (src[e.s - 1] === '\n' ? '' : nl) + lines.join(nl) + (src[e.s - 1] === '\n' ? nl : '');
    return joinEdits([...on.edits.slice(0, -1), { ...e, t }]);
  }
  const { at, pre } = hfLineAt(src, end, H.cmds, [...(H.styleAt ? [H.styleAt] : []), ...Object.values(H.rules)].filter((c) => !Object.values(H.styles).some((x) => x.at && c.s > x.at.s && c.e <= x.at.e)));
  return [{ s: at, e: at, t: pre + line + nl }];
}
// inside \fancypagestyle{name}{…}: its own command for these slots changed in place, or one more
// before its closing brace
function styleEdits(src, slots, text, S, M, two) {
  if ([...slots].every((k) => S.slots[k] === text)) return [];
  const own = (M.main.styles[M.style] || { cmds: [] }).cmds;
  const last = [...own].reverse().find((c) => [...c.slots].some((k) => slots.has(k)));
  if (last && !last.old && last.arg && sameSlots(last.slots, slots, two)) return argEdits(src, last.arg[0], last.arg[1], text);
  const line = fancyLine(slots, text, two);
  const [a, b] = S.at.body;
  const ls = src.lastIndexOf('\n', b - 1) + 1;
  if (ls > a && !/\S/.test(src.slice(ls, b))) {
    // (the closing brace on a line of its own: a line before it, indented as the body's first)
    const first = /\n([ \t]*)\S/.exec(src.slice(a, b));
    return [{ s: ls, e: ls, t: (first ? first[1] : '  ') + line + eolOf(src) }];
  }
  return [{ s: b, e: b, t: line }];
}
// scrlayer-scrpage: its command for these slots in place, or one more; loaded first for a KOMA
// class that has no header package yet, with the lines that keep what the page showed (o.keep)
// where KOMA's own defaults differ
function komaEdits(src, slots, text, M, two, o) {
  const cur = M.koma ? M.styles.scrheadings.slots : null;
  if (cur && [...slots].every((k) => cur[k] === text)) return [];
  const own = M.mainCmds.filter((c) => c.koma && !c.clear);
  const last = [...own].reverse().find((c) => [...c.slots].some((k) => slots.has(k)));
  if (M.koma && last && sameSlots(last.slots, slots, two)) return argEdits(src, last.arg[0], last.arg[1], text);
  const nl = eolOf(src);
  const want = Object.fromEntries([...slots].filter((k) => two || k[1] === 'O').map((k) => [k, text]));
  if (M.koma) {
    const { at, pre } = hfLineAt(src, M.end, own);
    return [{ s: at, e: at, t: pre + komaLines(want, two).join(nl) + nl }];
  }
  const keep = o.keep || {}, def = KOMA_DEFAULT(two);
  const extra = {};
  for (const k of SLOTS) if (!slots.has(k) && (two || k[1] === 'O') && !samePage(keep[k], def[k])) extra[k] = keep[k] || '';
  const out = [...usePackages(src, ['scrlayer-scrpage'], { end: M.end, others: o.others })];
  // (a \pagestyle of the preamble becomes scrheadings where it stands)
  if (M.main.styleAt && M.main.style !== 'scrheadings') out.push({ s: M.main.styleAt.arg[0], e: M.main.styleAt.arg[1], t: 'scrheadings' });
  out.push(lineBefore(src, M.end, komaLines({ ...want, ...extra }, two).join('\n')));
  return joinEdits(out);
}

// \pagestyle{...} in the preamble set (or added): 'plain', 'empty', 'fancy', 'headings'
export function pageStyleEdits(src, style) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const H = readHF(src);
  if (H.styleAt) return H.style === style ? [] : [{ s: H.styleAt.arg[0], e: H.styleAt.arg[1], t: style }];
  if (style === 'plain') return [];
  return [lineBefore(src, end, '\\pagestyle{' + style + '}')];
}

// ---- page numbers ----------------------------------------------------------------------------------
export const NUMBERINGS = [['arabic', '1, 2, 3'], ['roman', 'i, ii, iii'], ['Roman', 'I, II, III'], ['alph', 'a, b, c'], ['Alph', 'A, B, C']];
// The body's first \pagenumbering and \setcounter{page}, as { numbering, start, at } (at: where a
// line of them goes: after \begin{document}, after \maketitle if it comes first)
export function pageNumbers(src) {
  const body = bodyRange(src);
  if (!body) return null;
  const end = preambleEnd(src);
  const top = end + (/\\begin\s*\{document\}/.exec(src.slice(end, end + 40)) || [''])[0].length;
  const head = stripComments(src.slice(top, Math.min(src.length, top + 4000)));
  const out = { numbering: 'arabic', start: 1, at: top, numAt: null, startAt: null };
  const pn = /\\pagenumbering\s*\{\s*([A-Za-z]+)\s*\}/.exec(head);
  if (pn && !/\S/.test(head.slice(0, pn.index).replace(/\\(maketitle|thispagestyle\s*\{[a-z]*\}|pagestyle\s*\{[a-z]*\}|setcounter\s*\{page\}\s*\{\s*-?\d+\s*\})/g, ''))) {
    out.numbering = pn[1]; out.numAt = { s: top + pn.index, e: top + pn.index + pn[0].length, v: [top + pn.index + pn[0].indexOf(pn[1]), top + pn.index + pn[0].indexOf(pn[1]) + pn[1].length] };
  }
  const sc = /\\setcounter\s*\{page\}\s*\{\s*(-?\d+)\s*\}/.exec(head);
  if (sc && !/\S/.test(head.slice(0, sc.index).replace(/\\(maketitle|thispagestyle\s*\{[a-z]*\}|pagestyle\s*\{[a-z]*\}|pagenumbering\s*\{[A-Za-z]*\})/g, ''))) {
    out.start = +sc[1]; out.startAt = { s: top + sc.index, e: top + sc.index + sc[0].length, v: [top + sc.index + sc[0].indexOf(sc[1], 14), top + sc.index + sc[0].indexOf(sc[1], 14) + sc[1].length] };
  }
  return out;
}
export function pageNumberEdits(src, numbering, start) {
  const P = pageNumbers(src);
  if (!P) return [];
  const out = [];
  const lines = [];
  if (numbering !== P.numbering) {
    if (P.numAt) out.push(numbering === 'arabic' ? cutLine(src, P.numAt) : { s: P.numAt.v[0], e: P.numAt.v[1], t: numbering });
    else lines.push('\\pagenumbering{' + numbering + '}');
  }
  if (start !== P.start) {
    if (P.startAt) out.push(start === 1 ? cutLine(src, P.startAt) : { s: P.startAt.v[0], e: P.startAt.v[1], t: String(start) });
    else lines.push('\\setcounter{page}{' + start + '}');
  }
  if (lines.length) out.push({ s: P.at, e: P.at, t: (src[P.at] === '\n' ? '\n' : '') + lines.join('\n') + (src[P.at] === '\n' ? '' : '\n') });
  return out;
}
function cutLine(src, x) { return wholeLine(src, x.s, x.e); }

// ---- the first page's style ---------------------------------------------------------------------------
// \thispagestyle{empty} at the body's start (after \maketitle): { s, e } or null
export function firstPageStyle(src) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const top = end + (/\\begin\s*\{document\}/.exec(src.slice(end, end + 40)) || [''])[0].length;
  const head = src.slice(top, top + 400);
  const m = /^(\s*(?:\\maketitle\b\s*)?)\\thispagestyle\s*\{\s*(empty|plain|fancy)\s*\}/.exec(head);
  return m ? { s: top + m[1].length, e: top + m[0].length, style: m[2] } : null;
}
export function firstPageEdits(src, on) {
  const cur = firstPageStyle(src);
  if (!on) return cur ? [wholeLine(src, cur.s, cur.e)] : [];
  if (cur) return cur.style === 'empty' ? [] : [{ s: cur.s, e: cur.e, t: '\\thispagestyle{empty}' }];
  const end = preambleEnd(src);
  const top = end + (/\\begin\s*\{document\}/.exec(src.slice(end, end + 40)) || [''])[0].length;
  const mt = /^\s*\\maketitle\b/.exec(src.slice(top, top + 400));
  const at = mt ? top + mt[0].length : top;
  return [{ s: at, e: at, t: '\n\\thispagestyle{empty}' }];
}

// ---- line numbers (lineno) ------------------------------------------------------------------------
// { on, mode: 'continuous'|'page'|'section', modulo, at: the \linenumbers command } as the source has them
export function lineNumbers(src, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const opts = packageOptions(src, 'lineno', end, o.others);
  const t = stripComments(src.slice(0, Math.min(src.length, end + 400000)));
  const out = { loaded: opts !== null, on: false, mode: 'continuous', modulo: 1, at: null, modAt: null, hookAt: null };
  if (opts && (opts.pagewise || opts.pagewise === '')) out.mode = 'page';
  if (opts && opts.running) out.mode = 'continuous';
  const m = /\\linenumbers(?![A-Za-z@])(\*)?/.exec(t);
  if (m) { out.on = true; out.at = { s: m.index, e: m.index + m[0].length }; }
  if (opts && opts.left === undefined && opts.mathlines) out.mathlines = true;
  const mod = /\\modulolinenumbers(?![A-Za-z@])\s*(?:\[\s*(\d+)\s*\])?/.exec(t.slice(0, end));
  if (mod) { out.modulo = mod[1] ? +mod[1] : 5; out.modAt = { s: mod.index, e: mod.index + mod[0].length }; }
  const hook = /\\AddToHook\s*\{cmd\/section\/before\}\s*\{\\resetlinenumber\}/.exec(t.slice(0, end));
  if (hook) { out.mode = 'section'; out.hookAt = { s: hook.index, e: hook.index + hook[0].length }; }
  return out;
}
// mode: 'none', 'continuous', 'page', 'section'
export function lineNumberEdits(src, mode, o = {}) {
  const L = lineNumbers(src, o);
  if (!L) return [];
  const end = preambleEnd(src);
  const out = [];
  if (mode === 'none') {
    if (L.at) out.push(wholeLine(src, L.at.s, L.at.e));
    return out;
  }
  if (!L.loaded) out.push(...usePackages(src, { lineno: mode === 'page' ? { pagewise: true } : null }, { end, others: o.others }));
  else if (mode === 'page' && L.mode !== 'page') out.push(...usePackages(src, { lineno: { pagewise: true } }, { end, others: o.others }));
  else if (mode !== 'page' && L.mode === 'page') out.push(...usePackages(src, { lineno: { pagewise: null } }, { end, others: o.others, drop: (k) => k === 'pagewise' }));
  if (mode === 'section' && !L.hookAt) out.push(lineBefore(src, end, '\\AddToHook{cmd/section/before}{\\resetlinenumber}'));
  if (mode !== 'section' && L.hookAt) out.push(wholeLine(src, L.hookAt.s, L.hookAt.e));
  if (!L.at) out.push(lineBefore(src, end, '\\linenumbers'));
  return joinEdits(out);
}
export function moduloEdits(src, n, o = {}) {
  const L = lineNumbers(src, o);
  if (!L) return [];
  const end = preambleEnd(src);
  if (n <= 1) return L.modAt ? [wholeLine(src, L.modAt.s, L.modAt.e)] : [];
  if (L.modAt) return L.modulo === n ? [] : [{ s: L.modAt.s, e: L.modAt.e, t: '\\modulolinenumbers[' + n + ']' }];
  return [lineBefore(src, end, '\\modulolinenumbers[' + n + ']')];
}
// Steps of edits (fns: each a function of the text the one before left, giving edits on it, or
// null for a step that cannot be made) as the edits of one step on src: as many as there are
// places changed, each as small as the difference there (a dialog's margins and its vertical
// alignment are two edits, not one from the preamble to the page). null where a step was null.
export function stepEdits(src, fns) {
  let cur = src, E = [];
  for (const fn of fns) {
    const e = fn(cur);
    if (e === null) return null;
    if (!e || !e.length) continue;
    // (from the last to the first: the earlier ones' places stay where they are)
    for (const x of joinEdits(e).sort((a, b) => b.s - a.s || b.e - a.e)) { E = compose(E, x, cur); cur = cur.slice(0, x.s) + x.t + cur.slice(x.e); }
  }
  // each as small as its difference
  const out = [];
  for (const x of E) {
    const old = src.slice(x.s, x.e);
    let p = 0;
    while (p < old.length && p < x.t.length && old[p] === x.t[p]) p++;
    let z = 0;
    while (z < old.length - p && z < x.t.length - p && old[old.length - 1 - z] === x.t[x.t.length - 1 - z]) z++;
    if (p === old.length && p === x.t.length) continue;
    out.push({ s: x.s + p, e: x.e - z, t: x.t.slice(p, x.t.length - z) });
  }
  return out;
}
// E (edits on the original, in order, apart) and x (an edit on cur, the text E made) as edits on
// the original: x on its own where it meets none of E, else one edit with those it meets
function compose(E, x, cur) {
  const out = [];
  let delta = 0, i = 0;
  for (; i < E.length; i++) { const y = E[i], ye = y.s + delta + y.t.length; if (ye >= x.s) break; out.push(y); delta += y.t.length - (y.e - y.s); }
  const group = [];
  let d = delta;
  for (; i < E.length; i++) { const y = E[i], ys = y.s + d; if (ys > x.e) break; group.push({ y, ys, ye: ys + y.t.length }); d += y.t.length - (y.e - y.s); }
  if (!group.length) out.push({ s: x.s - delta, e: x.e - delta, t: x.t });
  else {
    const g0 = group[0], gN = group[group.length - 1];
    const cs = Math.min(x.s, g0.ys), ce = Math.max(x.e, gN.ye);
    const os = x.s < g0.ys ? x.s - delta : g0.y.s, oe = x.e > gN.ye ? gN.y.e + (x.e - gN.ye) : gN.y.e;
    out.push({ s: os, e: oe, t: cur.slice(cs, x.s) + x.t + cur.slice(x.e, ce) });
  }
  for (; i < E.length; i++) out.push(E[i]);
  return out;
}
// several lines added at one place become one edit, in their order (applied one by one, the
// later would land before the earlier)
export function joinEdits(edits) {
  const out = [];
  for (const e of edits) {
    const same = out.find((x) => x.s === e.s && x.e === e.s && e.e === e.s);
    if (same) same.t = same.t + e.t; else out.push({ ...e });
  }
  return out;
}

// ---- hyphenation ----------------------------------------------------------------------------------------
// 'auto' or 'none' (\usepackage[none]{hyphenat})
export function hyphenation(src, o = {}) {
  const opts = packageOptions(src, 'hyphenat', undefined, o.others);
  return opts && 'none' in opts ? 'none' : 'auto';
}
export function hyphenationEdits(src, mode, o = {}) {
  const end = preambleEnd(src);
  if (end < 0 || hyphenation(src, o) === mode) return [];
  if (mode === 'none') return usePackages(src, { hyphenat: { none: true } }, { end, others: o.others });
  // (the package line Rikuy wrote goes whole; options of one written by hand lose none)
  const p = packages(src, end).find((x) => x.names.length === 1 && x.names[0].name === 'hyphenat');
  if (p && p.opts && parseKV(src, p.opts[0], p.opts[1]).every((k) => k.key === 'none')) return [wholeLine(src, p.s, p.e)];
  return usePackages(src, { hyphenat: { none: null } }, { end, others: o.others });
}
// The words of \hyphenation{…} in the preamble, and the edits that make them these
export function exceptions(src) {
  const end = preambleEnd(src);
  if (end < 0) return { words: [], at: null };
  const c = lastCall(src, 'hyphenation', end);
  return c ? { words: src.slice(c.arg[0], c.arg[1]).split(/\s+/).filter(Boolean).slice(0, 500), at: c } : { words: [], at: null };
}
export function exceptionEdits(src, words) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const X = exceptions(src);
  const t = words.join(' ');
  if (X.at) return t ? (src.slice(X.at.arg[0], X.at.arg[1]) === t ? [] : [{ s: X.at.arg[0], e: X.at.arg[1], t }]) : [wholeLine(src, X.at.s, X.at.e)];
  return t ? [lineBefore(src, end, '\\hyphenation{' + t + '}')] : [];
}

// ---- watermark, page colour, border -----------------------------------------------------------------
// draftwatermark's settings as the preamble gives them: { on, text, scale, angle, color, at }
export function watermark(src, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const opts = packageOptions(src, 'draftwatermark', end, o.others);
  if (opts === null) return { on: false };
  const W = { on: !('nostamp' in opts) && !('final' in opts) && opts.stamp !== 'false', text: 'DRAFT', scale: 1, angle: 45, color: null, firstpage: 'firstpage' in opts || 'firstpageonly' in opts, pkgOpts: opts };
  const take = (k) => { for (const [key, v] of Object.entries(k)) { if (key === 'text') W.text = unbrace(v); if (key === 'scale') W.scale = parseFloat(v) || 1; if (key === 'angle') W.angle = parseFloat(v); if (key === 'color') W.color = unbrace(v); if (key === 'fontsize') W.fontsize = v; } };
  take(opts);
  const c = lastCall(src, 'DraftwatermarkOptions', end);
  if (c) { W.at = c; take(Object.fromEntries(parseKV(src, c.arg[0], c.arg[1]).map((x) => [x.key, x.value == null ? true : x.value]))); }
  // the older commands: \SetWatermarkText{…}, \SetWatermarkScale{…}, \SetWatermarkAngle{…}
  for (const [cmd, key] of [['SetWatermarkText', 'text'], ['SetWatermarkScale', 'scale'], ['SetWatermarkAngle', 'angle'], ['SetWatermarkColor', 'color']]) {
    const x = lastCall(src, cmd, end);
    if (x) take({ [key]: src.slice(x.arg[0], x.arg[1]) });
  }
  return W;
}
const unbrace = (v) => { v = String(v).trim(); return v[0] === '{' && v[v.length - 1] === '}' ? v.slice(1, -1) : v; };
// w: null (off) or { text, scale, angle, color }: \usepackage{draftwatermark} and its options
// line, \DraftwatermarkOptions{…}; off takes the package line (and its options line) out
export function watermarkEdits(src, w, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const W = watermark(src, o);
  const p = packages(src, end).find((x) => x.names.length === 1 && x.names[0].name === 'draftwatermark');
  if (!w) {
    const out = [];
    if (p) out.push(wholeLine(src, p.s, p.e));
    else if (W.on) out.push(...usePackages(src, { draftwatermark: { nostamp: true } }, { end, others: o.others }));
    if (W.at) out.push(wholeLine(src, W.at.s, W.at.e));
    return out;
  }
  const keys = { text: braceIf(w.text) };
  if (w.scale != null && w.scale !== 1) keys.scale = String(w.scale);
  if (w.angle != null && w.angle !== 45) keys.angle = String(w.angle);
  if (w.color) keys.color = w.color;
  const out = [];
  if (W.on && W.at) {
    const have = Object.fromEntries(parseKV(src, W.at.arg[0], W.at.arg[1]).map((x) => [x.key, x.value]));
    const ch = { ...keys };
    for (const k of ['scale', 'angle', 'color']) if (!(k in keys) && k in have) ch[k] = null;
    return kvEdits(src, W.at.arg[0], W.at.arg[1], ch);
  }
  if (!p) out.push(...usePackages(src, ['draftwatermark'], { end, others: o.others }));
  else if (p.opts && parseKV(src, p.opts[0], p.opts[1]).some((k) => k.key === 'nostamp' || k.key === 'final')) out.push(...usePackages(src, { draftwatermark: { nostamp: null, final: null } }, { end, others: o.others }));
  const line = '\\DraftwatermarkOptions{' + Object.entries(keys).map(([k, v]) => k + '=' + v).join(',') + '}';
  if (W.at) out.push({ s: W.at.s, e: W.at.e, t: line });
  else if (out.length && out[out.length - 1].t.includes('{draftwatermark}')) { const e = out[out.length - 1]; out[out.length - 1] = { ...e, t: e.t.replace(/(\\usepackage\{draftwatermark\})\n?/, '$1\n' + line + '\n') }; }
  else out.push(lineBefore(src, end, line));
  return out;
}
const braceIf = (t) => (/[,=]/.test(t) ? '{' + t + '}' : t);

// \pagecolor{…} in the preamble (or at the body's start): { color, at } or null
export function pageColor(src) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const c = lastCall(src, 'pagecolor', end);
  return c ? { color: src.slice(c.arg[0], c.arg[1]).trim(), model: c.opt ? src.slice(c.opt[0], c.opt[1]) : null, at: c } : null;
}
// color: null (none) or { name } or { html }: \pagecolor{name} or \pagecolor[HTML]{C00000}, with xcolor
export function pageColorEdits(src, color, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const P = pageColor(src);
  if (!color) return P ? [wholeLine(src, P.at.s, P.at.e)] : [];
  const cmd = color.html ? '\\pagecolor[HTML]{' + color.html + '}' : '\\pagecolor{' + color.name + '}';
  if (P) return src.slice(P.at.s, P.at.e) === cmd ? [] : [{ s: P.at.s, e: P.at.e, t: cmd }];
  const out = [...usePackages(src, color.needs ? { xcolor: { [color.needs]: true } } : ['xcolor'], { end, others: o.others })];
  out.push(lineBefore(src, end, cmd));
  return out;
}

// The page border Rikuy writes: a TikZ rectangle on every page's background (the shipout hook),
// inset from the paper's edge. Read back from that form alone: { inset, width, color, at }.
const BORDER = /\\AddToHook\{shipout\/background\}\{\\begin\{tikzpicture\}\[remember picture,overlay\]\\draw(?:\[([^\]]{0,80})\])? \(\[shift=\{\(([-\d.]+)(cm|mm|pt|in),-[-\d.]+(?:cm|mm|pt|in)\)\}\]current page\.north west\) rectangle \(\[shift=\{\(-[-\d.]+(?:cm|mm|pt|in),[-\d.]+(?:cm|mm|pt|in)\)\}\]current page\.south east\);\\end\{tikzpicture\}\}/;
export function pageBorder(src) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const pre = src.slice(0, end);
  const k = pre.indexOf('\\AddToHook{shipout/background}');
  if (k < 0) return null;
  const m = BORDER.exec(pre.slice(k, k + 600));
  if (!m) return null;
  const opt = Object.fromEntries((m[1] || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const q = x.indexOf('='); return q < 0 ? [x, true] : [x.slice(0, q).trim(), x.slice(q + 1).trim()]; }));
  const color = Object.keys(opt).find((x) => opt[x] === true && x !== 'thick' && x !== 'thin' && x !== 'very thick' && x !== 'ultra thick' && x !== 'semithick');
  return { inset: parseFloat(m[2]) * UNIT[m[3]], width: opt['line width'] ? lenPt(opt['line width']) : 0.4, color: color || null, at: { s: k, e: k + m[0].length } };
}
export function borderLine(b) {
  const opt = [b.width && Math.abs(b.width - 0.4) > 0.01 ? 'line width=' + fmtLen(b.width, 'pt') : '', b.color || ''].filter(Boolean).join(',');
  const d = fmtLen(b.inset, 'cm');
  return '\\AddToHook{shipout/background}{\\begin{tikzpicture}[remember picture,overlay]\\draw' + (opt ? '[' + opt + ']' : '') + ' ([shift={(' + d + ',-' + d + ')}]current page.north west) rectangle ([shift={(-' + d + ',' + d + ')}]current page.south east);\\end{tikzpicture}}';
}
export function borderEdits(src, b, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const B = pageBorder(src);
  if (!b) return B ? [wholeLine(src, B.at.s, B.at.e)] : [];
  const line = borderLine(b);
  if (B) return src.slice(B.at.s, B.at.e) === line ? [] : [{ s: B.at.s, e: B.at.e, t: line }];
  return [...usePackages(src, ['tikz'], { end, others: o.others }), lineBefore(src, end, line)];
}

// ---- the class, its size and its sides -----------------------------------------------------------------
export const CLASSES = [['article', 'Article'], ['report', 'Report'], ['book', 'Book'], ['scrartcl', 'KOMA article'], ['scrreprt', 'KOMA report'], ['scrbook', 'KOMA book'], ['memoir', 'Memoir'], ['amsart', 'AMS article']];
export function sizeEdits(src, pt) {
  const cls = classPage(src);
  if (!cls) return [];
  const have = Object.keys(cls.options).find((k) => /^\d+pt$/.test(k));
  if ((have ? parseInt(have, 10) : 10) === pt) return [];
  // (back to 10pt, the classes' own size: the option goes)
  if (pt === 10 && have) return classOptions(src, { [have]: null });
  return classOptions(src, { [pt + 'pt']: true }, (k) => /^\d+pt$/.test(k));
}
// two sided or not: the class's twoside (a book is two sided unless oneside)
export function sidesEdits(src, two) {
  const cls = classPage(src);
  if (!cls || cls.twoside === two) return [];
  const book = /^(book|scrbook|memoir)$/.test(cls.name);
  if (two) return classOptions(src, book ? { oneside: null } : { twoside: true, oneside: null });
  return classOptions(src, book ? { oneside: true, twoside: null } : { twoside: null });
}

// ---- all of it, for the page (src/model.js) ------------------------------------------------------
// others: the text of the files the preamble reads, in the order it reads them
export function readPage(src, others = []) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const M = hfModel(src, { others });
  const main = M.styles[M.style] || null;
  const pre = stripComments(src.slice(0, end));
  // (the last one counts, as TeX sets it last)
  const sep = (name) => { const all = setLengths(pre, name), x = all[all.length - 1]; return x ? lenPt(pre.slice(x.v[0], x.v[1])) : null; };
  const color = pageColor(src);
  return {
    // style: the one the pages take; styles: those the source defines (src/layout.js draws a
    // page's style from them, else LaTeX's own: builtinSlots); fancy: the pages' style is one of them
    style: M.style, styles: M.styles, fancy: !!main, kind: M.koma ? 'koma' : M.fancy ? 'fancy' : null, twoside: M.two,
    slots: main ? main.slots : slotTexts([], builtinSlots(M.style, M.two)),
    headrule: main ? main.headrule : 0, footrule: main ? main.footrule : 0,
    lineno: lineNumbers(src, { others }), hyph: hyphenation(src, { others }),
    wm: watermark(src, { others }), color: color ? { color: color.color, model: color.model } : null, border: pageBorder(src),
    colsep: sep('columnsep'), colrule: sep('columnseprule')
  };
}
