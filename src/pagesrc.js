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

import { stripComments, preambleEnd, packages, parseKV, kvEdits, docClass, classOptions, lastCall, groupEnd, usePackages, packageOptions } from './preamble.js';

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
// a line of the preamble just before \begin{document}
function lineBefore(src, end, text) {
  const at = src.lastIndexOf('\n', end - 1) + 1;
  if (at < end && /\S/.test(src.slice(at, end))) return { s: end, e: end, t: '\n' + text + '\n' };
  return { s: at, e: at, t: text + '\n' };
}

// ---- the class's options ---------------------------------------------------------------------
const CLASS_PAPER = /^(?:a4|a5|b5|letter|legal|executive)paper$/;
// What the class says of the page: { name, paper, landscape, twoside, twocolumn, pt }
export function classPage(src) {
  const d = docClass(src);
  if (!d) return null;
  const o = d.options, keys = Object.keys(o);
  const paper = keys.map(paperName).filter(Boolean).pop() || null;
  const pt = (keys.find((k) => /^(10|11|12)pt$/.test(k)) || '').slice(0, 2);
  const book = /^(book|scrbook|memoir)$/.test(d.name);
  return { name: d.name, paper, landscape: 'landscape' in o, twoside: 'twoside' in o || (book && !('oneside' in o)), twocolumn: 'twocolumn' in o, pt: pt ? +pt : 10, options: o };
}

// ---- paper, orientation, margins -----------------------------------------------------------------
// The paper as a size by name ('a4') or { w, h } in points: where the paper is written already
// (geometry's keys, else the class's options, edited in place), else in geometry. The PDF takes
// its size from geometry (the class's option alone leaves TeX's default sheet), so a class
// option is changed in place with geometry loaded beside it.
export function paperEdits(src, size, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const g = geometryKeys(src, end), cls = classPage(src);
  const named = typeof size === 'string';
  if (named && !PAPERS[size]) return [];
  const inGeo = Object.keys(g).some(FAMILY.paper);
  if (named && !inGeo && cls && cls.paper && CLASS_PAPER.test(size + 'paper')) {
    const out = cls.paper === size ? [] : classOptions(src, { [size + 'paper']: true }, (k) => CLASS_PAPER.test(k));
    if (!loaded(src, 'geometry', end, o.others) && !loaded(src, 'hyperref', end, o.others)) out.push(...usePackages(src, ['geometry'], { end, others: o.others }));
    return out;
  }
  const changes = named ? { [size + 'paper']: true } : { paperwidth: fmtLen(size.w, size.unit || 'cm'), paperheight: fmtLen(size.h, size.unit || 'cm') };
  return geometryEdits(src, changes, FAMILY.paper, { end, others: o.others });
}

// 'landscape' or 'portrait'
export function orientationEdits(src, way, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const g = geometryKeys(src, end), cls = classPage(src);
  const land = g.landscape === true || (cls && cls.landscape && g.portrait !== true);
  if ((way === 'landscape') === !!land) return [];
  if (way === 'landscape') return geometryEdits(src, { landscape: true, portrait: null }, null, { end, others: o.others });
  // portrait: landscape comes out where it stands
  const out = Object.keys(g).includes('landscape') ? geometryEdits(src, { landscape: null }, null, { end }) : [];
  if (cls && cls.landscape) out.push(...classOptions(src, { landscape: null }));
  return out;
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
  if (fam.length === Object.keys(want).length && fam.every((k) => String(want[k]) === String(have[k]))) return [];
  return geometryEdits(src, want, FAMILY.margins, { end, others: o.others });
}

// ---- breaks ------------------------------------------------------------------------------------
// The text a break of this kind is written as, alone on its line(s)
export const BREAKS = {
  page: '\\newpage', column: '\\columnbreak', blank: '\\newpage\n\\null\n\\newpage', next: '\\clearpage', odd: '\\cleardoublepage', even: '\\cleardoublepage\n\\null\n\\newpage'
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
// Columns for the whole document: n (1, 2, 3, ...): two as the class's twocolumn option, more as
// multicols around the body; a multicols that holds the whole body already changes its number.
export function columnsEdits(src, n, o = {}) {
  const cls = classPage(src);
  if (!cls) return [];
  const body = bodyRange(src);
  if (!body) return [];
  const whole = multicolsAt(src, body.s + 1);
  const wraps = whole && whole.s <= body.s && whole.e >= body.e;
  const out = [];
  if (wraps) {
    if (n === 1) return unwrapMulticols(src, whole);
    if (whole.nAt && +src.slice(whole.nAt[0], whole.nAt[1]) !== n) out.push({ s: whole.nAt[0], e: whole.nAt[1], t: String(n) });
    return out;
  }
  if (n === 2) return cls.twocolumn ? [] : classOptions(src, { twocolumn: true, onecolumn: null });
  if (cls.twocolumn) out.push(...classOptions(src, { twocolumn: null }));
  if (n > 2) {
    out.push(...usePackages(src, ['multicol'], { others: o.others }));
    out.push({ s: body.e, e: body.e, t: '\n\\end{multicols}' }, { s: body.s, e: body.s, t: '\\begin{multicols}{' + n + '}\n' });
  }
  return out;
}
// multicols around the paragraphs [s, e) (each starts a line), or its number changed
export function wrapMulticols(src, s, e, n) {
  return [{ s: e, e, t: '\n\\end{multicols}' }, { s, e: s, t: '\\begin{multicols}{' + n + '}\n' }];
}
export function unwrapMulticols(src, M) {
  // (what wrapMulticols wrote goes exactly; anything else leaves the words where they were)
  const hs = M.head[1], te = M.tail[0];
  const a = src[hs] === '\n' ? hs + 1 : hs, b = src[te - 1] === '\n' ? te - 1 : te;
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

// ---- headers and footers (fancyhdr) -------------------------------------------------------------
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
const OLD = { lhead: ['H', 'L'], chead: ['H', 'C'], rhead: ['H', 'R'], lfoot: ['F', 'L'], cfoot: ['F', 'C'], rfoot: ['F', 'R'] };
// The header and footer commands of a stretch of text [s, e): [{ s, e, cmd, sel: [a, b) or null,
// arg: [a, b), slots: Set, text }]; style: the last \pagestyle's argument; rules: \headrulewidth
// and \footrulewidth as set; plain: the commands inside \fancypagestyle{plain}{…}
export function readHF(src, s0 = 0, e0) {
  if (e0 == null) { e0 = preambleEnd(src); if (e0 < 0) e0 = Math.min(src.length, 200000); }
  const t = stripComments(src.slice(0, e0));
  const re = /\\(fancyhead|fancyfoot|fancyhf|lhead|chead|rhead|lfoot|cfoot|rfoot|pagestyle|fancypagestyle|renewcommand|thispagestyle)(?![A-Za-z@])/g;
  re.lastIndex = s0;
  const out = { cmds: [], plain: [], style: null, styleAt: null, rules: {} };
  const skip = (i) => { let k = 0; while (i < t.length && /\s/.test(t[i]) && k++ < 40) i++; return i; };
  let plainEnd = -1;
  for (let m, n = 0; (m = re.exec(t)) && n < 2000; n++) {
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
      // \fancypagestyle{plain}{ ... }: its commands are the plain style's
      if (t[i] !== '{') continue;
      const z = groupEnd(t, i, 200);
      if (z < 0) continue;
      const which = t.slice(i + 1, z - 1).trim();
      let j = skip(z);
      if (t[j] === '[') { const y = groupEnd(t, j, 200); if (y > 0) j = skip(y); }
      if (t[j] !== '{') continue;
      const w = groupEnd(t, j, 4000);
      if (w < 0) continue;
      if (which === 'plain') { out.plainAt = { s: m.index, e: w, body: [j + 1, w - 1] }; plainEnd = w; out.plain = readHF(src.slice(0, w - 1), j + 1, w - 1).cmds; }
      re.lastIndex = w;
      continue;
    }
    if (m.index < plainEnd) continue;
    let sel = null;
    if (t[i] === '[') { const z = groupEnd(t, i, 200); if (z < 0) continue; sel = [i + 1, z - 1]; i = skip(z); }
    if (t[i] !== '{') continue;
    const z = groupEnd(t, i, 4000);
    if (z < 0) continue;
    let slots;
    if (OLD[name]) {
      // \lhead[even]{odd}, \lhead{both}
      const [h, l] = OLD[name];
      slots = new Set(sel ? [h + 'O' + l] : [h + 'O' + l, h + 'E' + l]);
      if (sel) out.cmds.push({ s: m.index, e: z, cmd: name, sel: null, arg: sel, slots: new Set([h + 'E' + l]), text: src.slice(sel[0], sel[1]), old: true });
      out.cmds.push({ s: m.index, e: z, cmd: name, sel: null, arg: [i + 1, z - 1], slots, text: src.slice(i + 1, z - 1), old: true });
    } else {
      slots = slotsOf(sel ? t.slice(sel[0], sel[1]) : null, name === 'fancyhead' ? 'H' : name === 'fancyfoot' ? 'F' : 'HF');
      out.cmds.push({ s: m.index, e: z, cmd: name, sel, arg: [i + 1, z - 1], slots, text: src.slice(i + 1, z - 1) });
    }
    re.lastIndex = z;
  }
  return out;
}
// The text of each slot as TeX takes it: the last command that names it (fancyhdr's defaults
// where none does: the section's mark in the header, the page number at the foot's centre)
export const FANCY_DEFAULT = { HOL: '\\slshape\\rightmark', HOR: '\\slshape\\leftmark', HEL: '\\slshape\\rightmark', HER: '\\slshape\\leftmark', FOC: '\\thepage', FEC: '\\thepage' };
export function slotTexts(cmds, base = FANCY_DEFAULT) {
  const out = {};
  for (const k of SLOTS) out[k] = base[k] || '';
  for (const c of cmds) for (const k of c.slots) out[k] = c.text;
  return out;
}

// Where the fancyhdr lines go: after the last of them, else just before \begin{document}
function hfLineAt(src, end, H) {
  const last = [...H.cmds, ...(H.styleAt ? [H.styleAt] : []), ...Object.values(H.rules)].filter((c) => c.s < end).sort((a, b) => b.e - a.e)[0];
  if (last && !(H.plainAt && last.s > H.plainAt.s && last.e <= H.plainAt.e)) {
    const nl = src.indexOf('\n', last.e);
    const at = nl < 0 || nl >= end ? end : nl + 1;
    return { at, pre: src[at - 1] === '\n' ? '' : '\n' };
  }
  const at = src.lastIndexOf('\n', end - 1) + 1;
  return at < end && /\S/.test(src.slice(at, end)) ? { at: end, pre: '\n' } : { at, pre: '' };
}
// The lines that turn fancyhdr on with nothing in its slots (and no rule under the header, as
// Word's headers have none), unless \pagestyle{fancy} is there already
export function fancyOn(src, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return { edits: [], H: null };
  const H = readHF(src);
  if (H.style === 'fancy') return { edits: [], H };
  const pk = usePackages(src, ['fancyhdr'], { end, others: o.others });
  // (\fancyhf{} where no slot is set yet: fancyhdr's own defaults are a running head and a rule)
  const lines = [...(H.cmds.length ? [] : ['\\fancyhf{}']), ...(H.rules.head ? [] : ['\\renewcommand{\\headrulewidth}{0pt}'])];
  if (H.styleAt) {
    // a \pagestyle{plain} or {empty} of the preamble becomes fancy where it stands, the lines after it
    const nl = src.indexOf('\n', H.styleAt.e), at = nl < 0 || nl >= end ? H.styleAt.e : nl + 1;
    const ins = at === H.styleAt.e ? { s: at, e: at, t: lines.length ? '\n' + lines.join('\n') : '' } : { s: at, e: at, t: lines.map((x) => x + '\n').join('') };
    return { edits: [...pk, { s: H.styleAt.arg[0], e: H.styleAt.arg[1], t: 'fancy' }, ins], H };
  }
  lines.unshift('\\pagestyle{fancy}');
  const at = src.lastIndexOf('\n', end - 1) + 1;
  const ins = at < end && /\S/.test(src.slice(at, end)) ? { s: end, e: end, t: '\n' + lines.join('\n') + '\n' } : { s: at, e: at, t: lines.join('\n') + '\n' };
  return { edits: [...pk, ins], H };
}
// The edits that put text in slots (a set of SLOTS: one slot, or the odd and even of one place
// in a one sided document): the command that names exactly them has its text changed in place;
// else a command for them goes after the last one. twoside: whether E and O are told apart (else
// the selector names the place alone: [R]). Text '' empties them.
export function slotEdits(src, slots, text, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  slots = new Set(slots);
  const on = fancyOn(src, o);
  const H = on.H || readHF(src);
  const fresh = on.edits.length > 0;
  const cur = slotTexts(fresh ? [] : H.cmds, fresh ? {} : FANCY_DEFAULT);
  if (!fresh && [...slots].every((k) => cur[k] === text)) return [];
  // the last command naming any of these slots
  const last = fresh ? null : [...H.cmds].reverse().find((c) => [...c.slots].some((k) => slots.has(k)));
  if (last && !last.old && last.slots.size === slots.size && [...slots].every((k) => last.slots.has(k))) {
    return [{ s: last.arg[0], e: last.arg[1], t: text }];
  }
  const lineOf = (set, t) => (([...set][0][0] === 'H' ? '\\fancyhead' : '\\fancyfoot') + '[' + selectorOf(set, o.twoside) + ']{' + t + '}');
  const line = lineOf(slots, text);
  if (fresh) {
    // (after the lines that turn it on, in the same place; with them what the page showed before
    // that should stay, o.keep: the plain style's page number at the foot)
    const lines = text ? [line] : [];
    const by = new Map();
    for (const [k, t] of Object.entries(o.keep || {})) if (!slots.has(k) && t) { const g = k[0] + k[2] + '\u0000' + t; if (!by.has(g)) by.set(g, new Set()); by.get(g).add(k); }
    for (const [g, set] of by) lines.push(lineOf(set, g.split('\u0000')[1]));
    const e = on.edits[on.edits.length - 1];
    if (!lines.length) return joinEdits(on.edits.filter((x) => x.t || x.e > x.s));
    const t = e.t ? e.t.replace(/\n$/, '') + '\n' + lines.join('\n') + (e.t.endsWith('\n') ? '\n' : '') : (src[e.s - 1] === '\n' ? '' : '\n') + lines.join('\n') + (src[e.s - 1] === '\n' ? '\n' : '');
    return joinEdits([...on.edits.slice(0, -1), { ...e, t }]);
  }
  const { at, pre } = hfLineAt(src, end, H);
  return [{ s: at, e: at, t: pre + line + '\n' }];
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
  const hfs = [...others.map((t) => readHF(t, 0, Math.min(t.length, 200000))), readHF(src)];
  const cmds = hfs.flatMap((h) => h.cmds), plain = hfs.flatMap((h) => h.plain);
  const style = hfs.map((h) => h.style).filter(Boolean).pop() || null;
  const rules = {};
  for (const h of hfs) for (const [k, v] of Object.entries(h.rules)) rules[k] = v.value;
  const rule = (v, d) => { if (v == null) return d; const x = lenPt(v); return x == null ? d : x; };
  const pre = stripComments(src.slice(0, end));
  // (the last one counts, as TeX sets it last)
  const sep = (name) => { const all = setLengths(pre, name), x = all[all.length - 1]; return x ? lenPt(pre.slice(x.v[0], x.v[1])) : null; };
  const color = pageColor(src);
  return {
    style, fancy: style === 'fancy' || hfs.some((h) => h.plainAt),
    slots: slotTexts(cmds), plainSlots: hfs.some((h) => h.plainAt) ? slotTexts(plain, {}) : null,
    headrule: rule(rules.head, 0.4), footrule: rule(rules.foot, 0),
    lineno: lineNumbers(src, { others }), hyph: hyphenation(src, { others }),
    wm: watermark(src, { others }), color: color ? { color: color.color, model: color.model } : null, border: pageBorder(src),
    colsep: sep('columnsep'), colrule: sep('columnseprule')
  };
}
