// Character formatting as edits of the source, the pure part of the Font group (src/cmd/font.js
// draws the controls and commits what these return; test/font.test.mjs tests them on strings).
//
// Every format is a wrapper of src/wrap.js: a kind (GROUPS: bold, strike, size, colour, ...) and the
// command a control writes. A command acts on the text and the selection [a, b) and returns the
// text after it and the selection after it, so several act in one commit (the Font dialog's OK)
// and one undo gives the source back. What the preamble needs for what was written (ulem for
// \uline, xcolor for a colour, the highlighter's definition) is said in needs and written by
// preambleFor, once, as src/preamble.js writes every package.
//
// Text from a stranger's document passes through here: every scan is bounded (src/wrap.js's own
// limits, and the ones below), and no pattern can backtrack over unbounded text.

import { GROUPS, defineGroup, groupNames, groupOf, enclosing, wrappersIn, unwrapEdits, wrapEdits, opener, diffEdit, closeOf, splitText, LEAD } from './wrap.js';
import { usePackages, packages, preambleEnd, defines, defineOnce, docClass, kvEdits, parseKV, stripComments, lastCall } from './preamble.js';
import { envWords, unwrapBlockEdits } from './blockenv.js';

// ---- the kinds ------------------------------------------------------------------------------
export const SIZES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'];
export const UNDERLINES = { uline: 'Single', uuline: 'Double', uwave: 'Wave', dashuline: 'Dashed', dotuline: 'Dotted' };
const ULEM = { ulem: { normalem: true } };

// (underline: every line ulem draws, and LaTeX's own \underline, which a page written by hand has)
defineGroup('underline', { write: 'uline', cmds: ['uline', 'underline', 'uuline', 'uwave', 'dashuline', 'dotuline', 'culine'] });
defineGroup('strike', { write: 'sout', cmds: ['sout', 'xout'] });
defineGroup('dstrike', { write: 'dsout', cmds: ['dsout'] });
defineGroup('sub', { write: 'textsubscript', cmds: ['textsubscript'] });
defineGroup('sup', { write: 'textsuperscript', cmds: ['textsuperscript'] });
defineGroup('smallcaps', { write: 'textsc', cmds: ['textsc'], decls: ['scshape', 'sc'] });
defineGroup('allcaps', { write: 'MakeUppercase', cmds: ['MakeUppercase', 'uppercase'] });
defineGroup('border', { write: 'fbox', cmds: ['fbox'] });
defineGroup('enclose', { write: 'textcircled', cmds: ['textcircled'] });
defineGroup('color', { write: 'textcolor', cmds: ['textcolor'], decls: ['color'] });
defineGroup('highlight', { write: 'hl', cmds: ['hl'] });
defineGroup('shading', { write: 'colorbox', cmds: ['colorbox'] });
defineGroup('size', { write: 'large', cmds: [], decls: [...SIZES, 'fontsize'] });
defineGroup('family', { write: 'textsf', cmds: ['textrm', 'textsf', 'texttt'], decls: ['rmfamily', 'sffamily', 'ttfamily', 'rm', 'sf', 'tt', 'fontfamily', 'fontspec'] });
defineGroup('spacing', { write: 'textls', cmds: ['textls'] });
defineGroup('scale', { write: 'scalebox', cmds: ['scalebox'] });
defineGroup('position', { write: 'raisebox', cmds: ['raisebox'] });
defineGroup('ruby', { write: 'ruby', cmds: ['ruby'] });
// (the underline in a colour takes its colour first, as \textcolor does)
LEAD.culine = 1;

// what each kind writes needs in the preamble
const NEEDS = {
  underline: (w) => (w.cmd === 'underline' ? null : w.cmd === 'culine' ? { pkgs: { ...ULEM, xcolor: null }, defs: ['culine'] } : { pkgs: ULEM }),
  strike: () => ({ pkgs: ULEM }),
  dstrike: () => ({ pkgs: ULEM, defs: ['dsout'] }),
  color: () => ({ pkgs: { xcolor: null } }),
  highlight: () => ({ pkgs: { ...ULEM, xcolor: null }, defs: ['hl'] }),
  shading: () => ({ pkgs: { xcolor: null } }),
  spacing: () => ({ pkgs: { microtype: null } }),
  scale: () => ({ pkgs: { graphicx: null } }),
  ruby: () => ({ defs: ['ruby'] })
};
export function needsOf(group, w) {
  const n = NEEDS[group] ? NEEDS[group](w) : null;
  if (!n) return null;
  // a colour of dvipsnames needs xcolor's option
  const col = w && (group === 'color' || group === 'shading' || group === 'highlight' || group === 'underline') ? (group === 'highlight' ? w.opt : (w.args || [])[0]) : null;
  if (col && !w.opt2 && DVIPS_NAMES.has(col) && n.pkgs && 'xcolor' in n.pkgs) n.dvips = true;
  return n;
}
export const DVIPS_NAMES = new Set(['Apricot', 'Aquamarine', 'Bittersweet', 'Black', 'Blue', 'BlueGreen', 'BlueViolet', 'BrickRed', 'Brown', 'BurntOrange', 'CadetBlue', 'CarnationPink',
  'Cerulean', 'CornflowerBlue', 'Cyan', 'Dandelion', 'DarkOrchid', 'Emerald', 'ForestGreen', 'Fuchsia', 'Goldenrod', 'Gray', 'Green', 'GreenYellow', 'JungleGreen', 'Lavender',
  'LimeGreen', 'Magenta', 'Mahogany', 'Maroon', 'Melon', 'MidnightBlue', 'Mulberry', 'NavyBlue', 'OliveGreen', 'Orange', 'OrangeRed', 'Orchid', 'Peach', 'Periwinkle', 'PineGreen',
  'Plum', 'ProcessBlue', 'Purple', 'RawSienna', 'Red', 'RedOrange', 'RedViolet', 'Rhodamine', 'RoyalBlue', 'RoyalPurple', 'RubineRed', 'Salmon', 'SeaGreen', 'Sepia', 'SkyBlue',
  'SpringGreen', 'Tan', 'TealBlue', 'Thistle', 'Turquoise', 'Violet', 'VioletRed', 'White', 'WildStrawberry', 'Yellow', 'YellowGreen', 'YellowOrange']);

// The definitions Rikuy writes once, each the form Word import writes too (src/wordjobs.js)
export const DEFS = {
  // Word's highlighter: ulem's line as tall as the letters, in a colour ([yellow] unless named);
  // it takes a formula and an accented letter inside it and breaks across lines, as soul's \hl
  // did not
  hl: '\\DeclareRobustCommand{\\hl}[1][yellow]{\\bgroup\\markoverwith{\\textcolor{#1}{\\rule[-.5ex]{2pt}{2.5ex}}}\\ULon}',
  // a double strikethrough: two of \sout's rules, as ulem draws its own lines
  dsout: '\\DeclareRobustCommand{\\dsout}{\\bgroup\\markoverwith{\\raise.35ex\\hbox{\\vbox{\\hrule width.2em height.4pt\\kern.25ex\\hrule width.2em height.4pt}}}\\ULon}',
  // an underline in a colour of its own (ulem's line, coloured)
  culine: '\\DeclareRobustCommand{\\culine}[1]{\\bgroup\\markoverwith{\\textcolor{#1}{\\rule[-.55ex]{2pt}{.4pt}}}\\ULon}',
  // ruby where luatexja-ruby is not: the reading in small type centred over its base
  ruby: '\\providecommand{\\ruby}[2]{\\leavevmode\\begin{tabular}[b]{@{}c@{}}\\tiny #2\\\\[-.3ex]#1\\end{tabular}}'
};
// the highlighter as Word import wrote it before it took a colour: upgraded in place
const OLD_HL = '\\DeclareRobustCommand{\\hl}{\\bgroup\\markoverwith{\\textcolor{yellow}{\\rule[-.5ex]{2pt}{2.5ex}}}\\ULon}';

// ---- the forms src/wrap.js does not read --------------------------------------------------------
// A declaration with arguments before its text, {\color{red} ...}, {\fontsize{14}{17}\selectfont
// ...}, {\fontfamily{ppl}\selectfont ...}, {\fontspec{TeX Gyre Pagella} ...}, and a command with an
// option after its arguments, \scalebox{1.2}[1]{...}, \raisebox{2pt}[0pt]{...}: read here, the
// rest by src/wrap.js. A wrapper read here has extra: true and comes off by unwrapAny, the rest
// by src/wrap.js's unwrapEdits.
export const DECL_LEAD = { color: 1, fontsize: 2, fontfamily: 1, fontspec: 1 };
const OPT2 = new Set(['scalebox', 'raisebox']);
const isExtra = (n) => !!DECL_LEAD[n] || OPT2.has(n);
const sp = (t, i) => { for (let n = 0; n < 200 && i < t.length && (t[i] === ' ' || t[i] === '\t' || (t[i] === '\n' && t[i + 1] !== '\n')); n++) i++; return i; };

// The wrapper of the extra forms that starts at s, or null
export function parseExtra(src, s, want) {
  if (src[s] === '{') {
    const m = /^\{\\([A-Za-z]+)(?![A-Za-z])/.exec(src.slice(s, s + 60));
    if (!m || !DECL_LEAD[m[1]] || (want && !want.has(m[1]))) return null;
    const e = closeOf(src, s);
    if (e < 0) return null;
    let i = sp(src, s + m[0].length), opt = null, select = false;
    const args = [];
    if (src[i] === '[') { const z = closeOf(src, i); if (z < 0 || z > e) return null; opt = src.slice(i + 1, z - 1); i = sp(src, z); }
    for (let k = 0; k < DECL_LEAD[m[1]]; k++) {
      if (src[i] !== '{') return null;
      const z = closeOf(src, i);
      if (z < 0 || z > e) return null;
      args.push(src.slice(i + 1, z - 1));
      i = sp(src, z);
    }
    if (src.startsWith('\\selectfont', i) && !/[A-Za-z]/.test(src[i + 11] || '')) { select = true; i = sp(src, i + 11); }
    return { s, e, is: Math.min(i, e - 1), ie: e - 1, cmd: m[1], opt, args, decl: true, select, extra: true };
  }
  const m = /^\\([A-Za-z]+)(?![A-Za-z])/.exec(src.slice(s, s + 40));
  if (!m || !OPT2.has(m[1]) || (want && !want.has(m[1]))) return null;
  let i = sp(src, s + m[0].length), opt2 = null;
  const args = [];
  if (src[i] !== '{') return null;
  let z = closeOf(src, i);
  if (z < 0) return null;
  args.push(src.slice(i + 1, z - 1));
  i = sp(src, z);
  for (let k = 0; k < 2 && src[i] === '['; k++) { z = closeOf(src, i); if (z < 0) return null; opt2 = (opt2 == null ? '' : opt2 + '][') + src.slice(i + 1, z - 1); i = sp(src, z); }
  if (src[i] !== '{') return null;
  const e = closeOf(src, i);
  if (e < 0) return null;
  return { s, e, is: i + 1, ie: e - 1, cmd: m[1], opt: null, args, opt2, decl: false, extra: true };
}

// The text with each comment made spaces (offsets kept), from the line's start before i
function uncommented(src, from, to) {
  const ls = src.lastIndexOf('\n', from - 1) + 1;
  let out = '';
  for (let k = ls; k < to; k++) {
    const c = src[k];
    if (c === '\\') { out += c + (src[k + 1] || ''); k++; continue; }
    if (c === '%') { const n = src.indexOf('\n', k); const z = n < 0 || n > to ? to : n; out += ' '.repeat(z - k); k = z - 1; continue; }
    out += c;
  }
  return { t: out, base: ls };
}
// The innermost wrapper of the extra forms holding [a, b): walked back from a over balanced
// groups (comments left out), at most 20 000 characters and 400 open braces back
function extraAround(src, a, b, names) {
  if (!names.length) return null;
  const want = new Set(names), from = Math.max(0, a - 20000);
  const U = uncommented(src, from, a), t = U.t, base = U.base;
  let d = 0, tried = 0;
  for (let k = t.length - 1; k >= from - base && k >= 0; k--) {
    const c = t[k];
    if ((c !== '{' && c !== '}') || (k > 0 && t[k - 1] === '\\' && !(k > 1 && t[k - 2] === '\\'))) continue;
    if (c === '}') { d++; continue; }
    if (d > 0) { d--; continue; }
    if (++tried > 400) return null;
    const at = base + k;
    let W = parseExtra(src, at, want);
    if (W && W.ie >= b && W.is <= a) return W;
    // the body of \scalebox{..}[..]{: back over the arguments to the command
    let j = k - 1;
    for (let n = 0; n < 4 && j >= 0; n++) {
      while (j >= 0 && /\s/.test(t[j])) j--;
      if (t[j] !== '}' && t[j] !== ']') break;
      const open = t[j] === '}' ? '{' : '[';
      let dd = 0, o = -1;
      for (let q = j; q >= 0 && q > j - 2000; q--) { if (t[q] === '}' || t[q] === ']') dd++; else if ((t[q] === '{' || t[q] === '[') && --dd === 0) { o = q; break; } }
      if (o < 0 || t[o] !== open) break;
      j = o - 1;
    }
    const m = /\\([A-Za-z]+)$/.exec(t.slice(Math.max(0, j - 30), j + 1));
    if (m && want.has(m[1])) {
      W = parseExtra(src, base + j + 1 - m[0].length, want);
      if (W && W.is === at + 1 && W.ie >= b) return W;
    }
  }
  return null;
}

// The wrapper of a kind that holds [a, b) (a caret: the one it is in), or null; o.names: these
// commands only
export function around(src, a, b, group, o = {}) {
  const names = o.names || groupNames(group);
  const plain = names.filter((n) => !isExtra(n)), extra = names.filter(isExtra);
  let W = null;
  // (src/wrap.js may read {\textbf{x}} as a declaration: the group around a command is no wrapper of its own)
  for (let p = a, q = b, n = 0; plain.length && n < 6; n++) {
    W = enclosing(src, p, q, plain);
    if (!W || !W.decl) break;
    const g = groupOf(W.cmd);
    if (!g || GROUPS[g].decls.includes(W.cmd)) break;
    const inner = parseAt1(src, W.s + 1, plain);
    if (inner && inner.is <= a && inner.ie >= b) { W = inner; break; }
    // (the group may be a command's own text, \textcolor{red}{\textbf{x}}: that command, without the name read wrongly)
    const alt = enclosing(src, p, q, plain.filter((x) => x !== W.cmd));
    if (alt && (!alt.decl || (groupOf(alt.cmd) && GROUPS[groupOf(alt.cmd)].decls.includes(alt.cmd)))) { W = alt; break; }
    p = W.s; q = W.e; W = null;
  }
  const X = extraAround(src, a, b, extra);
  // the innermost of the two
  return !W ? X : !X ? W : X.s > W.s ? X : W;
}
// \cmd{...} at s, as src/wrap.js reads it, through enclosing on its body
function parseAt1(src, s, names) {
  const m = /^\\([A-Za-z]+)(?![A-Za-z])/.exec(src.slice(s, s + 60));
  if (!m || !names.includes(m[1])) return null;
  const k = src.indexOf('{', s + m[0].length);
  if (k < 0 || k > s + 400) return null;
  const W = enclosing(src, k + 1, k + 1, [m[1]]);
  return W && W.s === s ? W : null;
}
// Every wrapper of these names lying wholly inside [a, b), outermost first
function allInside(src, a, b, names) {
  const plain = names.filter((n) => !isExtra(n)), want = new Set(names.filter(isExtra));
  const out = plain.length ? wrappersIn(src, a, b, plain).filter((W) => !W.decl || (groupOf(W.cmd) && GROUPS[groupOf(W.cmd)].decls.includes(W.cmd))) : [];
  if (want.size) {
    // (a look at most at 4000 places: each may read 20 000 characters for its closing brace)
    for (let k = a, n = 0, tries = 0; k < b && n < 2000 && tries < 4000; k++) {
      const c = src[k];
      if (c === '%' && src[k - 1] !== '\\') { const z = src.indexOf('\n', k); if (z < 0) break; k = z; continue; }
      if ((c !== '{' && c !== '\\') || src[k - 1] === '\\') continue;
      if (!(c === '{' ? src[k + 1] === '\\' : /^\\(?:scalebox|raisebox)(?![A-Za-z])/.test(src.slice(k, k + 10)))) continue;
      tries++;
      const W = parseExtra(src, k, want);
      if (W && W.e <= b) { out.push(W); n++; }
    }
  }
  // (nested ones inside an extra one are found by both scans once each; outermost first)
  return out.sort((x, y) => x.s - y.s || y.e - x.e);
}

// The edits that take a wrapper off. src/wrap.js's own forms by its unwrapEdits; the extra
// forms here: a declaration's command and arguments go, and its braces too where they hold
// nothing else and stand where no argument of a command does (after a space or a line's start;
// {\color{red} \bf x} keeps them, as \textcolor{red}{\color{blue} x} does); a command's opener
// and closing brace go (with a space for the word after a control word: \noindent\scalebox{2}{Proof})
export function unwrapAny(src, W) {
  if (!W.extra) return unwrapEdits(src, W);
  if (W.decl) {
    const prev = W.s > 0 ? src[W.s - 1] : '\n', body = src.slice(W.is, W.ie);
    const free = /[\s(]/.test(prev) || W.s === 0;
    const inner = declInside(body);
    if (free && !inner) return [{ s: W.ie, e: W.e, t: '' }, { s: W.s, e: W.is, t: '' }];
    return [{ s: W.s + 1, e: W.is, t: '' }];
  }
  const glue = /\\[A-Za-z]+$/.test(src.slice(Math.max(0, W.s - 40), W.s)) && /^[A-Za-z]/.test(src.slice(W.is, W.ie));
  return [{ s: W.ie, e: W.e, t: '' }, { s: W.s, e: W.is, t: glue ? ' ' : '' }];
}
// whether a text has a declaration at its own level (\bf x, \large x): a control word with no
// argument after it, as a group's braces keep from reaching what follows
function declInside(t) {
  let d = 0;
  for (let i = 0; i < t.length && i < 20000; i++) {
    const c = t[i];
    if (c === '{') { d++; continue; }
    if (c === '}') { d--; continue; }
    if (c !== '\\') continue;
    const m = /^\\([A-Za-z]+)/.exec(t.slice(i, i + 40));
    if (!m) { i++; continue; }
    i += m[0].length - 1;
    if (d) continue;
    let k = i + 1;
    while (t[k] === ' ' || t[k] === '\t') k++;
    if (t[k] !== '{' && t[k] !== '[') return true;
  }
  return false;
}
// what opens a wrapper to write: src/wrap.js's opener, and the extra forms
export function openerAny(w) {
  const opt = w.opt != null && w.opt !== '' ? '[' + w.opt + ']' : '', args = (w.args || []).map((x) => '{' + x + '}').join('');
  if (w.decl) return '{\\' + w.cmd + opt + args + (w.select ? '\\selectfont' : '') + ' ';
  if (w.opt2 != null && w.opt2 !== '') return '\\' + w.cmd + opt + args + '[' + w.opt2 + ']{';
  return opener(w);
}

// ---- acting on the text -------------------------------------------------------------------
// the text with edits applied, and a position mapped through them
function apply(src, edits) {
  let t = src;
  for (const x of [...edits].sort((p, q) => q.s - p.s || q.e - p.e)) t = t.slice(0, x.s) + x.t + t.slice(x.e);
  return t;
}
const shiftBy = (edits, p) => edits.reduce((n, x) => n + (x.e <= p ? x.t.length - (x.e - x.s) : 0), 0);

// Every wrapper of a kind taken off what lies wholly inside [a, b): { text, a, b }
export function clearInside(src, a, b, names) {
  const inside = allInside(src, a, b, names);
  if (!inside.length) return { text: src, a, b };
  // (none of them overlaps another but by holding it: their edits are taken off all at once)
  const edits = inside.flatMap((W) => unwrapAny(src, W));
  return { text: apply(src, edits), a: a + shiftBy(edits, a), b: b + shiftBy(edits, b) };
}

// A toggle (Bold, Strikethrough, Small Caps, ...): in or on a wrapper of its kind, that wrapper
// comes off whole; else what is selected gets the kind's own command (the same kind inside it
// taken off first: bold in bold says nothing more, and \emph in \emph turns upright). other: the
// kind that excludes this one (Subscript and Superscript), which becomes this one in place.
// Returns { text, a, b, on (whether it is on now), w (what was written) } or { error }.
export function toggle(src, a, b, group, o = {}) {
  const W = o.W !== undefined ? o.W : around(src, a, b, group);
  if (W && (a === b || (a >= W.is && b <= W.ie))) {
    const edits = unwrapAny(src, W);
    return { text: apply(src, edits), a: a + shiftBy(edits, a), b: b + shiftBy(edits, b), on: false };
  }
  const w = o.w || { cmd: GROUPS[group].write };
  if (o.other) {
    const X = around(src, a, b, o.other);
    if (X && (a === b || (X.is === a && X.ie === b))) {
      const open = openerAny(w), d = open.length - (X.is - X.s);
      return { text: src.slice(0, X.s) + open + src.slice(X.is), a: a + d, b: b + d, on: true, w };
    }
  }
  return wrapIn(src, a, b, group, w);
}

// The selection in a wrapper w of a kind, the kind's wrappers inside it taken off first
export function wrapIn(src, a, b, group, w) {
  const c = a === b ? { text: src, a, b } : clearInside(src, a, b, groupNames(group));
  const r = wrapEdits(c.text, c.a, c.b, openerAny(w));
  if (r.error) return { error: r.error };
  const text = apply(c.text, r.edits);
  if (!r.sel) return { text, a: r.p, b: r.p, on: true, w };
  return { text, a: r.sel.a, b: r.sel.b, on: true, w };
}

// A value for a kind (a colour, a size, a family, an underline's style), or null to take it off:
// on a wrapper of the kind that holds exactly the selection (or the caret) the wrapper gets the
// new command or argument; elsewhere the selection gets a wrapper of its own.
export function setValue(src, a, b, group, w, o = {}) {
  const W = o.W !== undefined ? o.W : around(src, a, b, group);
  const exact = W && (a === b || (W.is === a && W.ie === b) || (a >= W.is && b <= W.ie && src.slice(W.is, a).trim() === '' && src.slice(b, W.ie).trim() === ''));
  if (!w) {
    // off: those inside the selection, and the one around it
    let r = { text: src, a, b };
    if (a !== b) r = clearInside(src, a, b, groupNames(group));
    const X = around(r.text, r.a, r.b, group);
    if (X && (r.a === r.b || (r.a >= X.is && r.b <= X.ie))) {
      const edits = unwrapAny(r.text, X);
      return { text: apply(r.text, edits), a: r.a + shiftBy(edits, r.a), b: r.b + shiftBy(edits, r.b), on: false };
    }
    return r.text === src ? null : { ...r, on: false };
  }
  if (exact) {
    // (a declaration stays one: {\large x} becomes {\Large x}, {\color{red} x} {\color{blue} x})
    const want = W.decl && w.declAlt ? w.declAlt : w;
    const open = openerAny(want);
    if (!W.decl === !want.decl && src.slice(W.s, W.is) === open) return { text: src, a, b, on: true, w: want, same: true };
    // (the form may change, \textcolor to {\color} or back: the closing brace stays where it is;
    // inside it, the same kind taken off first, a colour in the colour)
    const inner = a === b ? { text: src, a, b } : clearInside(src, W.is, W.ie, groupNames(group));
    const t = inner.text, d = open.length - (W.is - W.s), lost = src.length - t.length;
    return { text: t.slice(0, W.s) + open + t.slice(W.is), a: a + d, b: b + d - lost, on: true, w: want };
  }
  return wrapIn(src, a, b, group, w);
}

// Character formatting taken off [a, b) and around it: the kinds given (all of them for Clear
// All Formatting). A caret clears the wrappers it is in.
export const CHAR_KINDS = ['bold', 'italic', 'underline', 'strike', 'dstrike', 'sub', 'sup', 'smallcaps', 'allcaps', 'border', 'enclose', 'color', 'highlight', 'shading', 'size', 'family', 'mono', 'spacing', 'scale', 'position'];
// the innermost wrapper of any of these kinds holding [a, b), with its kind
function aroundAny(src, a, b, kinds) {
  // (one look for all the kinds' names, not one for each kind)
  const names = [...new Set(kinds.flatMap((g) => groupNames(g)))];
  const W = around(src, a, b, null, { names });
  if (!W) return null;
  const group = kinds.find((g) => groupNames(g).includes(W.cmd));
  return group ? { W, group } : null;
}
export function clearFormats(src, a, b, kinds = CHAR_KINDS) {
  const names = [...new Set(kinds.flatMap((g) => groupNames(g)))];
  let t = src;
  if (a !== b) { const r = clearInside(t, a, b, names); t = r.text; a = r.a; b = r.b; }
  // those around it, innermost first: a caret's go whole; a selection's are taken off it alone
  // (the parts before and after keep them); one around an end of the selection only, off the
  // part of it the selection has
  for (let n = 0; n < 60; n++) {
    let hit = aroundAny(t, a, b, kinds), part = false;
    if (!hit && a !== b) {
      for (const p of [b, a]) { const h = aroundAny(t, p, p, kinds); if (h && !(h.W.is <= a && h.W.ie >= b)) { hit = h; part = true; break; } }
    }
    if (!hit) break;
    const W = hit.W;
    if (a === b || (a <= W.is && b >= W.ie)) {
      const edits = unwrapAny(t, W);
      const was = a === b;
      t = apply(t, edits); a += shiftBy(edits, a); b = was ? a : b + shiftBy(edits, b);
      continue;
    }
    const p0 = Math.max(a, W.is), p1 = Math.min(b, W.ie);
    const r = W.extra ? splitExtra(t, W, p0, p1) : splitText(t, W, p0, p1);
    if (!r || r.text === t) break;
    // (the selection's ends move with what came out before them)
    const d0 = r.a - p0, d1 = r.b - p1;
    if (part) { a = a < W.is ? a : a + d0; b = b > W.ie ? b + (r.text.length - t.length) : b + d1; }
    else { a = r.a; b = r.b; }
    t = r.text;
  }
  return t === src ? null : { text: t, a, b };
}
function splitExtra(src, W, a, b) {
  a = Math.max(a, W.is); b = Math.min(b, W.ie);
  const open = src.slice(W.s, W.is), close = src.slice(W.ie, W.e);
  const left = src.slice(W.is, a), mid = src.slice(a, b), right = src.slice(b, W.ie);
  if (!balanced(left) || !balanced(right)) return null;
  const out = (left ? open + left + close : '') + mid + (right ? open + right + close : '');
  const a2 = W.s + (left ? open.length + left.length + close.length : 0);
  return { text: src.slice(0, W.s) + out + src.slice(W.e), a: a2, b: a2 + mid.length };
}
function balanced(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '\\') { i++; continue; } if (c === '{') d++; else if (c === '}' && --d < 0) return false; }
  return d === 0;
}

// The paragraph's alignment or spacing taken off (Clear All Formatting): an environment that holds
// the selection's paragraph alone (center, flushleft, flushright, setspace's), its words kept
const PARA_ENVS = ['center', 'flushleft', 'flushright', 'spacing', 'singlespace', 'onehalfspace', 'doublespace'];
export function clearAlignment(src, a, b) {
  const from = Math.max(0, a - 4000), before = src.slice(from, a);
  let last = null;
  for (let m, re = /\\begin\s*\{(center|flushleft|flushright|spacing|singlespace|onehalfspace|doublespace)\}/g, n = 0; (m = re.exec(before)) && n < 500; n++) last = m;
  if (!last) return null;
  const s = from + last.index, name = last[1], close = '\\end{' + name + '}';
  if (before.slice(last.index).includes(close)) return null;
  const z = src.indexOf(close, b);
  if (z < 0 || z - b > 4000) return null;
  if (/\\begin\s*\{/.test(src.slice(s + last[0].length, z))) return null;
  const W = envWords(src, s, z + close.length, PARA_ENVS, { spacing: 1 });
  if (!W || a < W.ws || b > W.we || /\n[ \t]*\n/.test(src.slice(W.ws, W.we))) return null;
  const edits = unwrapBlockEdits(src, W);
  return { text: apply(src, edits), a: a + shiftBy(edits, a), b: b + shiftBy(edits, a) };
}

// The wrappers the selection (or caret) lies in, outermost first, of these kinds: what the Format
// Painter copies. Each as { group, w } with w the wrapper to write.
export function formatsAt(src, a, b, kinds = CHAR_KINDS) {
  return chainAt(src, a, b, kinds).map(({ group, W }) => ({ group, w: { cmd: W.cmd, opt: W.opt, args: W.args, opt2: W.opt2, decl: W.decl, select: W.select } }));
}
// The wrappers around [a, b), outermost first, each { group, W }: what the ribbon shows pressed,
// worked out once for each look at it
export function chainAt(src, a, b, kinds = CHAR_KINDS) {
  const out = [];
  let p = a, q = b;
  for (let n = 0; n < 40; n++) {
    const hit = aroundAny(src, p, q, kinds);
    if (!hit) break;
    out.unshift(hit);
    p = hit.W.s; q = hit.W.e;
  }
  return out;
}

// ---- sizes --------------------------------------------------------------------------------
// The points each size gives at a base size, as the classes set them (size10.clo to size12.clo,
// extsizes' size8.clo to size20.clo)
const POINTS = {
  8: [5, 5, 6, 7, 8, 10, 10.95, 12, 14.4, 17.28], 9: [5, 6, 7, 8, 9, 10, 10.95, 12, 14.4, 17.28],
  10: [5, 7, 8, 9, 10, 12, 14.4, 17.28, 20.74, 24.88], 11: [6, 8, 9, 10, 10.95, 12, 14.4, 17.28, 20.74, 24.88],
  12: [6, 8, 10, 10.95, 12, 14.4, 17.28, 20.74, 24.88, 24.88], 14: [6, 8, 10, 12, 14.4, 17.28, 20.74, 24.88, 29.86, 35.83],
  17: [8, 10, 12, 14.4, 17.28, 20.74, 24.88, 29.86, 35.83, 42.99], 20: [10, 12, 14.4, 17.28, 20.74, 24.88, 29.86, 35.83, 42.99, 51.59]
};
export function sizePoints(base, name) {
  const k = SIZES.indexOf(name);
  if (k < 0) return null;
  const row = POINTS[base] || POINTS[base > 12 ? 14 : 10].map((v) => Math.round(v * base / (base > 12 ? 14.4 : 10) * 100) / 100);
  return row[k];
}
// [{ name, pt }] at a base size, smallest first
export const sizeList = (base) => SIZES.map((name) => ({ name, pt: sizePoints(base, name) }));
// the size a number of points names at a base size (a size LaTeX has a name for), or null
export function sizeNamed(base, pt) {
  const hit = sizeList(base).filter((x) => Math.abs(x.pt - pt) < 0.06);
  // (two names for one size, as 12pt's huge and Huge: the smaller name)
  return hit.length ? hit[0].name : null;
}
// The wrapper for a size: a name at its size, else \fontsize with a baselineskip of 1.2 times
export function sizeWrapper(base, pt) {
  const name = sizeNamed(base, pt);
  if (name) return { cmd: name, decl: true };
  const n = Math.round(pt * 100) / 100;
  return { cmd: 'fontsize', args: [String(n), String(Math.round(n * 1.2 * 10) / 10)], decl: true, select: true };
}
// The size where a wrapper of the size kind is: its points, or null
export function sizeOf(base, W) {
  if (!W) return null;
  if (W.cmd === 'fontsize') { const v = parseFloat((W.args || [])[0]); return Number.isFinite(v) ? v : null; }
  return sizePoints(base, W.cmd);
}
// The next size up (dir 1) or down from a name: null past Huge or tiny; at normalsize the
// switch goes (normalsize: written as no switch at all)
export function stepSize(name, dir) {
  const k = SIZES.indexOf(name || 'normalsize');
  if (k < 0) return null;
  const j = k + dir;
  return j < 0 || j >= SIZES.length ? null : SIZES[j];
}
// the name nearest a number of points, for growing a \fontsize
export function nearestSize(base, pt) {
  let best = 'normalsize', d = Infinity;
  for (const x of sizeList(base)) if (Math.abs(x.pt - pt) < d) { d = Math.abs(x.pt - pt); best = x.name; }
  return best;
}

// ---- the document's size ---------------------------------------------------------------------
const STD = /^(article|report|book|letter|proc)$/, EXT = /^ext(article|report|book|letter|proc)$/;
// The base sizes a class can be set in: a list, 'any' (KOMA), or null (the class decides)
export function docSizes(cls) {
  if (STD.test(cls) || EXT.test(cls)) return [8, 9, 10, 11, 12, 14, 17, 20];
  if (/^scr(artcl|reprt|book|lttr2)$/.test(cls)) return 'any';
  if (cls === 'memoir') return [9, 10, 11, 12, 14, 17, 20, 25, 30, 36, 48, 60];
  if (cls === 'beamer') return [8, 9, 10, 11, 12, 14, 17, 20];
  return null;
}
// the class's base size as its options say (10 where they say none)
export function docSize(src) {
  const d = docClass(src);
  if (!d) return null;
  for (const [k, v] of Object.entries(d.options)) {
    const m = /^(\d+(?:\.\d+)?)pt$/.exec(k);
    if (m && v === true) return parseFloat(m[1]);
    if (k === 'fontsize' && typeof v === 'string' && /^\d+(\.\d+)?pt$/.test(v)) return parseFloat(v);
  }
  return /^scr/.test(d.name) ? 11 : 10;
}
// The edits that set the class's base size: the option (KOMA's fontsize=), and article's ext
// class for sizes the standard ones lack (8, 9, 14, 17, 20pt). null: the class cannot.
export function docSizeEdits(src, pt) {
  const d = docClass(src);
  if (!d) return null;
  const sizes = docSizes(d.name);
  if (!sizes || (sizes !== 'any' && !sizes.includes(pt))) return null;
  const edits = [];
  const isSize = (k) => /^\d+(\.\d+)?pt$/.test(k);
  const items = d.opts ? parseKV(src, d.opts[0], d.opts[1]) : [];
  if (sizes === 'any') {
    const want = pt === 11 && !items.some((x) => x.key === 'fontsize') ? null : { fontsize: pt + 'pt' };
    if (want) edits.push(...optEdits(src, d, items, want, isSize));
    return edits;
  }
  // article <-> extarticle where the size needs it (a document already in ext keeps its class)
  const std = d.name.replace(/^ext/, ''), needExt = ![10, 11, 12].includes(pt);
  if (needExt && STD.test(d.name)) edits.push({ s: d.nameAt[0], e: d.nameAt[1], t: 'ext' + std });
  // 10pt is the default: the option goes (and its brackets, when it was the only one)
  if (pt === 10 && !EXT.test(d.name) && d.name !== 'memoir') {
    const sz = items.filter((x) => isSize(x.key));
    if (!sz.length) return edits;
    if (items.length === sz.length) { edits.push({ s: d.opts[0] - 1, e: d.opts[1] + 1, t: '' }); return edits; }
    edits.push(...kvEdits(src, d.opts[0], d.opts[1], {}, isSize));
    return edits;
  }
  edits.push(...optEdits(src, d, items, { [pt + 'pt']: true }, isSize));
  return edits;
}
function optEdits(src, d, items, want, drop) {
  if (d.opts) return kvEdits(src, d.opts[0], d.opts[1], want, (k) => !(k in want) && drop(k));
  const t = Object.entries(want).map(([k, v]) => (v === true ? k : k + '=' + v)).join(',');
  return [{ s: d.nameAt[0] - 1, e: d.nameAt[0] - 1, t: '[' + t + ']' }];
}

// ---- fonts ----------------------------------------------------------------------------------
// The fonts the font box offers for the document and for a selection, all in Rikuy's TeX tree:
// the packages pdfLaTeX loads, the name fontspec (XeLaTeX, LuaLaTeX) sets, NFSS's family for a
// selection in pdfLaTeX, and the look the page draws it in (app.css, .sheet[data-font] and .y-ff-*)
export const FONTS = [
  { id: 'cm', name: 'Computer Modern', pkgs: [], spec: 'Latin Modern Roman', family: 'cmr', look: '', note: 'LaTeX\'s own' },
  { id: 'lm', name: 'Latin Modern', pkgs: ['lmodern'], spec: 'Latin Modern Roman', family: 'lmr', look: '' },
  { id: 'times', name: 'Times', pkgs: ['newtxtext', 'newtxmath'], spec: 'TeX Gyre Termes', family: 'ptm', look: 'times' },
  { id: 'palatino', name: 'Palatino', pkgs: ['newpxtext', 'newpxmath'], spec: 'TeX Gyre Pagella', family: 'ppl', look: 'palatino' },
  { id: 'helvetica', name: 'Helvetica', pkgs: ['tgheros'], sans: true, spec: 'TeX Gyre Heros', family: 'phv', look: 'sans' },
  { id: 'charter', name: 'Charter', pkgs: ['XCharter'], spec: 'XCharter', family: 'bch', look: 'charter' },
  { id: 'schola', name: 'Century Schoolbook', pkgs: ['tgschola'], spec: 'TeX Gyre Schola', family: 'pnc', look: 'schola' },
  { id: 'bookman', name: 'Bookman', pkgs: ['tgbonum'], spec: 'TeX Gyre Bonum', family: 'pbk', look: 'bookman' },
  { id: 'kp', name: 'Kepler', pkgs: ['kpfonts'], spec: null, family: null, look: 'kp' },
  { id: 'courier', name: 'Courier', pkgs: null, spec: 'TeX Gyre Cursor', family: 'pcr', look: 'mono' }
];
// the generic families a selection can take, before the fonts by name
export const GENERIC = [
  { id: 'serif', name: 'Serif', cmd: 'textrm', look: 'serif' },
  { id: 'sans', name: 'Sans Serif', cmd: 'textsf', look: 'sans' },
  { id: 'mono', name: 'Monospace', cmd: 'texttt', look: 'mono' }
];
// every package a document's font comes from, to know which lines are the font's
const FONT_PKGS = new Set(['lmodern', 'newtxtext', 'newtxmath', 'newpxtext', 'newpxmath', 'mathptmx', 'times', 'txfonts', 'palatino', 'mathpazo', 'pxfonts', 'tgtermes', 'tgpagella',
  'tgheros', 'helvet', 'XCharter', 'charter', 'tgschola', 'newcent', 'tgbonum', 'bookman', 'kpfonts', 'libertine', 'tgcursor', 'courier']);
const BY_PKG = { lmodern: 'lm', newtxtext: 'times', mathptmx: 'times', times: 'times', txfonts: 'times', tgtermes: 'times', newpxtext: 'palatino', palatino: 'palatino', mathpazo: 'palatino',
  pxfonts: 'palatino', tgpagella: 'palatino', XCharter: 'charter', charter: 'charter', tgschola: 'schola', newcent: 'schola', tgbonum: 'bookman', bookman: 'bookman', kpfonts: 'kp' };

// Whether the document is set with fontspec (XeLaTeX or LuaLaTeX): engine is the PDF pane's
// choice ('auto', 'xelatex', ...)
export function usesFontspec(src, engine) {
  if (/^(xelatex|lualatex)$/.test(engine || '')) return true;
  if (engine === 'pdflatex') return false;
  const magic = /^[ \t]*%+[ \t]*!\s*TEX\s+(?:TS-)?program\s*=\s*([\w-]+)/im.exec(src.slice(0, 4000));
  if (magic) return /^(xe|lua)/i.test(magic[1]);
  const end = preambleEnd(src);
  return packages(src, end).some((p) => p.names.some((n) => /^(fontspec|unicode-math|polyglossia|xeCJK|ctex|luatexja-fontspec|luatexja-preset|fontsetup)$/.test(n.name)));
}

// The document's font: { id, name } of FONTS, or { id: '', name } for a font named otherwise
export function docFont(src, engine) {
  const end = preambleEnd(src);
  if (end < 0) return { id: 'cm', name: 'Computer Modern' };
  if (usesFontspec(src, engine)) {
    const c = lastCall(src, 'setmainfont', end);
    if (!c) return { id: 'lm', name: 'Latin Modern' };
    const name = src.slice(c.arg[0], c.arg[1]).trim();
    const f = FONTS.find((x) => x.spec === name);
    return f ? { id: f.id, name: f.name } : { id: '', name: name.slice(0, 60) };
  }
  const pre = stripComments(src.slice(0, end));
  let id = 'cm';
  for (const p of packages(src, end)) for (const n of p.names) if (BY_PKG[n.name]) id = BY_PKG[n.name];
  if (familyDefault(pre)) id = 'helvetica';
  const f = FONTS.find((x) => x.id === id);
  return { id, name: f.name };
}

// The edits that set the document's font (an id of FONTS). The font's lines take the place of the
// lines of the font before it; a line that loads a font among other packages loses that name only.
export function docFontEdits(src, id, engine) {
  const F = FONTS.find((x) => x.id === id);
  const end = preambleEnd(src);
  if (!F || end < 0) return null;
  if (usesFontspec(src, engine)) {
    if (!F.spec) return null;
    const c = lastCall(src, 'setmainfont', end);
    if (c) return src.slice(c.arg[0], c.arg[1]) === F.spec ? [] : [{ s: c.arg[0], e: c.arg[1], t: F.spec }];
    if (F.id === 'cm' || F.id === 'lm') return [];
    const add = usePackages(src, ['fontspec'], { end });
    const t = src.slice(0, end), at = add.length ? add[0].s : lineAfterPackages(src, end);
    // (\setmainfont after the line that loads fontspec)
    if (add.length) return [{ s: add[0].s, e: add[0].e, t: add[0].t + '\\setmainfont{' + F.spec + '}\n' }];
    return [{ s: at, e: at, t: (at > 0 && t[at - 1] !== '\n' ? '\n' : '') + '\\setmainfont{' + F.spec + '}\n' }];
  }
  if (!F.pkgs) return null;
  const edits = [], ps = packages(src, end);
  let place = -1;
  for (const p of ps) {
    const mine = p.names.filter((n) => FONT_PKGS.has(n.name));
    if (!mine.length) continue;
    if (mine.length === p.names.length) {
      // the whole line is the font's: it goes, and the new one comes where the first was
      if (place < 0) place = p.line[0];
      edits.push({ s: p.line[0], e: p.line[1], t: '' });
    } else {
      // only those names, each with the comma before it (or after it, for the first)
      const L = p.names;
      for (const n of mine) {
        const k = L.indexOf(n);
        if (k > 0) edits.push({ s: L[k - 1].e, e: n.e, t: '' });
        else edits.push({ s: n.s, e: L[k + 1].s, t: '' });
      }
    }
  }
  // \renewcommand{\familydefault}{\sfdefault} goes with Helvetica, and comes with it
  const pre = stripComments(src.slice(0, end));
  const fd = familyDefault(pre);
  if (fd && !F.sans) {
    const ls = src.lastIndexOf('\n', fd.index - 1) + 1;
    const whole = src.slice(ls, fd.index).trim() === '' && src.slice(fd.index + fd[0].length - (fd[0].endsWith('\n') ? 1 : 0), src.indexOf('\n', fd.index) < 0 ? end : src.indexOf('\n', fd.index)).trim() === '';
    edits.push(whole ? { s: ls, e: fd.index + fd[0].length, t: '' } : { s: fd.index, e: fd.index + fd[0].length, t: '' });
  }
  const lines = [];
  if (F.pkgs.length) lines.push('\\usepackage{' + F.pkgs.join(',') + '}');
  if (F.sans && !fd) lines.push('\\renewcommand{\\familydefault}{\\sfdefault}');
  if (lines.length) {
    if (place < 0) place = lineAfterPackages(src, end);
    const pre2 = place > 0 && src[place - 1] !== '\n' ? '\n' : '';
    const same = edits.find((x) => x.s === place);
    if (same) same.t = pre2 + lines.join('\n') + '\n';
    else edits.push({ s: place, e: place, t: pre2 + lines.join('\n') + '\n' });
  }
  return edits;
}
// \renewcommand{\familydefault}{\sfdefault} (or \renewcommand*\familydefault{\sfdefault}) in a preamble
// whose comments are spaces: { index, 0: its text with the spaces and line break after it }, or
// null. A scan, not one pattern: two runs of spaces with an optional brace between them made a
// stranger's \renewcommand followed by thousands of spaces cost seconds.
function familyDefault(pre) {
  const t = pre.slice(0, 200000), sp = (i) => { while (i < t.length && /\s/.test(t[i])) i++; return i; };
  for (let k = t.indexOf('\\renewcommand'), n = 0; k >= 0 && n < 500; k = t.indexOf('\\renewcommand', k + 1), n++) {
    let i = k + 13;
    if (t[i] === '*') i++;
    i = sp(i);
    const br = t[i] === '{';
    if (br) i = sp(i + 1);
    if (!t.startsWith('\\familydefault', i) || /[A-Za-z]/.test(t[i + 14] || '')) continue;
    i = sp(i + 14);
    if (br) { if (t[i] !== '}') continue; i = sp(i + 1); }
    if (t[i] !== '{') continue;
    i = sp(i + 1);
    if (!t.startsWith('\\sfdefault', i)) continue;
    i = sp(i + 10);
    if (t[i] !== '}') continue;
    let z = i + 1;
    while (z < t.length && (t[z] === ' ' || t[z] === '\t')) z++;
    if (t[z] === '\n') z++;
    return { index: k, 0: t.slice(k, z) };
  }
  return null;
}

// where a new line goes: after the last \usepackage line (as src/preamble.js puts one)
function lineAfterPackages(src, end) {
  const add = usePackages(src, ['rikuy-probe-package'], { end });
  return add.length ? add[0].s : end;
}

// The wrapper that sets a selection in a font: a generic family's command, or the font's family
// ({\fontfamily{ppl}\selectfont ...} for pdfLaTeX, {\fontspec{TeX Gyre Pagella} ...} for fontspec)
export function familyWrapper(id, fontspec) {
  const G = GENERIC.find((x) => x.id === id);
  if (G) return { cmd: G.cmd };
  const F = FONTS.find((x) => x.id === id);
  if (!F) return null;
  if (fontspec) return F.spec ? { cmd: 'fontspec', args: [F.spec], decl: true } : null;
  return F.family ? { cmd: 'fontfamily', args: [F.family], decl: true, select: true } : null;
}
// what a family wrapper is, as an id of GENERIC or FONTS
export function familyOf(W) {
  if (!W) return null;
  const G = { textrm: 'serif', rmfamily: 'serif', rm: 'serif', textsf: 'sans', sffamily: 'sans', sf: 'sans', texttt: 'mono', ttfamily: 'mono', tt: 'mono' }[W.cmd];
  if (G) return G;
  const v = (W.args || [])[0];
  const F = FONTS.find((x) => (W.cmd === 'fontspec' ? x.spec === v : x.family === v));
  return F ? F.id : null;
}

// ---- the preamble ---------------------------------------------------------------------------
// packages that load xcolor themselves: dvipsnames must reach xcolor before them
const XCOLOR_LOADERS = new Set(['tikz', 'pgf', 'pgfplots', 'tcolorbox', 'todonotes', 'circuitikz', 'chemfig', 'tikz-cd', 'forest', 'mdframed', 'minted', 'changes', 'pgfornament', 'bclogo', 'colortbl', 'xcolor-material', 'tikzpagenodes', 'smartdiagram']);

// The edits of the main file's preamble for what was written: needs [{ pkgs, defs, dvips }]
// joined. Each package once, options merged (src/preamble.js); each definition once. A document
// without a preamble (a part of a project) gets none: [].
// o.others: the text of the files the preamble reads (App.preambleOthers): a package loaded there
// gets its options by \PassOptionsToPackage (src/preamble.js)
export function preambleFor(src, needs, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const pkgs = {}, defs = [];
  let dvips = false;
  for (const n of needs.filter(Boolean)) {
    for (const [k, v] of Object.entries(n.pkgs || {})) pkgs[k] = v && pkgs[k] ? { ...pkgs[k], ...v } : v || pkgs[k] || null;
    for (const d of n.defs || []) if (!defs.includes(d)) defs.push(d);
    if (n.dvips) dvips = true;
  }
  const edits = [];
  const d = docClass(src);
  if (dvips) {
    const ps = packages(src, end);
    const xc = ps.find((p) => p.names.some((n) => n.name === 'xcolor'));
    const first = ps.find((p) => p.names.some((n) => XCOLOR_LOADERS.has(n.name)));
    if (d && d.name === 'beamer') {
      // beamer loads xcolor itself: the option goes to the class
      if (!/(^|,)\s*xcolor\s*=/.test(d.opts ? src.slice(d.opts[0], d.opts[1]) : '')) edits.push(...optEdits(src, d, d.opts ? parseKV(src, d.opts[0], d.opts[1]) : [], { xcolor: 'dvipsnames' }, () => false));
      delete pkgs.xcolor;
    } else if (first && (!xc || first.s < xc.s)) {
      // a package before xcolor's line loads it without the option: it reaches xcolor first
      const pass = stripComments(src.slice(0, end));
      // (one star in the pattern and the option looked for in what it caught: no backtracking)
      let passed = false;
      for (let m, re = /\\PassOptionsToPackage\s*\{([^{}]*)\}\s*\{\s*xcolor\s*\}/g, n = 0, t = pass.slice(0, 200000); !passed && (m = re.exec(t)) && n < 500; n++) passed = m[1].split(',').some((x) => x.trim() === 'dvipsnames');
      if (!passed) edits.push({ s: first.line[0], e: first.line[0], t: '\\PassOptionsToPackage{dvipsnames}{xcolor}\n' });
      if (!xc) delete pkgs.xcolor;
    } else pkgs.xcolor = { ...(pkgs.xcolor || {}), dvipsnames: true };
  }
  if (Object.keys(pkgs).length) edits.push(...usePackages(src, pkgs, { end, others: o.others }));
  for (const name of defs) {
    if (name === 'hl') {
      // Word import's highlighter without a colour: the same line with one
      const at = src.indexOf(OLD_HL);
      if (at >= 0 && at < end) { edits.push({ s: at, e: at + OLD_HL.length, t: DEFS.hl }); continue; }
    }
    if (name === 'ruby' && /luatexja-ruby|\bruby\b/.test(packages(src, end).map((p) => p.names.map((n) => n.name).join(',')).join(','))) continue;
    edits.push(...defineOnce(src, name, DEFS[name], { end }));
  }
  // (two lines that go in at one place go in the order they were asked for, as one edit)
  const out = [];
  for (const x of edits) {
    const same = x.s === x.e && out.find((y) => y.s === x.s && y.e === x.s);
    if (same) same.t += x.t; else out.push({ ...x });
  }
  return out;
}
// Whether the document's \hl takes a colour: Rikuy's, or none yet (Rikuy writes its own)
export function hlTakesColor(src) {
  const end = preambleEnd(src);
  if (end < 0) return true;
  if (src.slice(0, end).includes(DEFS.hl)) return true;
  if (src.indexOf(OLD_HL) >= 0 && src.indexOf(OLD_HL) < end) return true;
  return !defines(src, 'hl', 'command', end);
}

// ---- change case ------------------------------------------------------------------------------
// Commands whose arguments are no words (keys, names, colours, sizes, addresses): their letters
// keep their case
const NOT_WORDS = new Set(['label', 'ref', 'eqref', 'pageref', 'cref', 'Cref', 'autoref', 'nameref', 'vref', 'Vref', 'labelcref', 'cite', 'citep', 'citet', 'citealt', 'citealp',
  'citeauthor', 'citeyear', 'citeyearpar', 'Citet', 'Citep', 'Citealt', 'Citealp', 'Citeauthor', 'textcite', 'parencite', 'autocite', 'Textcite', 'Parencite', 'Autocite', 'footcite',
  'smartcite', 'citenum', 'nocite', 'url', 'href', 'hyperref', 'hyperlink', 'hypertarget', 'includegraphics', 'input', 'include', 'begin', 'end', 'textcolor', 'color', 'colorbox',
  'fcolorbox', 'hl', 'fontsize', 'fontfamily', 'fontspec', 'usepackage', 'documentclass', 'bibliography', 'bibliographystyle', 'index', 'gls', 'Gls', 'glspl', 'acrshort', 'acrlong',
  'ac', 'acp', 'textls', 'scalebox', 'raisebox', 'culine', 'vspace', 'hspace', 'rule', 'setlength', 'num', 'SI', 'si', 'qty', 'unit', 'ang', 'newcommand', 'renewcommand']);
// how many arguments of each come before the words (\href{url}{words}: one; \textcolor{red}{words}: one)
const NOT_WORDS_LEAD = { href: 1, hyperref: 0, textcolor: 1, colorbox: 1, fcolorbox: 2, hl: 0, culine: 1, textls: 0, scalebox: 1, raisebox: 1, hyperlink: 1 };
const LETTER_CMDS = { ss: 'SS', SS: 'ss', o: 'O', O: 'o', ae: 'AE', AE: 'ae', oe: 'OE', OE: 'oe', aa: 'AA', AA: 'aa', l: 'L', L: 'l' };

// The words of [a, b) in another case: 'lower', 'upper', 'title' (Capitalize Each Word),
// 'sentence' (Sentence case.), 'toggle' (tOGGLE cASE), or 'cycle' (Shift+F3: lower, then each word
// capitalised, then upper). Commands, their keys, math and comments keep their letters.
// Returns { text, a, b } or null when nothing changes.
export function changeCase(src, a, b, mode) {
  b = Math.min(b, a + 200000);
  const spans = letterSpans(src, a, b);
  if (mode === 'cycle') {
    const letters = spans.map(([s, e]) => src.slice(s, e)).join('');
    const lo = letters.toLowerCase(), up = letters.toUpperCase();
    const title = titleOf(spans, src);
    mode = letters === up && letters !== lo ? 'lower' : letters === lo ? 'title' : letters === title ? 'upper' : 'upper';
  }
  let out = '', last = a, startWord = true, startSentence = true;
  // (whether the selection starts a sentence: what comes before it on its paragraph ends one, or nothing does)
  // (what stands before it in its paragraph, after the last \begin, \item or heading there)
  const raw = src.slice(Math.max(0, a - 200), a).split(/\n[ \t]*\n/).pop();
  const seg = raw.replace(/%[^\n]*/g, '').replace(/\\(?:begin|end)\s*\{[^{}]*\}|\\(?:item|par|noindent|maketitle)\b|\\(?:part|chapter|(?:sub)*section|paragraph)\*?\s*\{[^{}]*\}/g, '\u0001');
  const before = seg.slice(seg.lastIndexOf('\u0001') + 1).replace(/\\[A-Za-z]+\s*|[{}]/g, '');
  const tail = before.trimEnd();
  startSentence = !tail || /[.!?:]$/.test(tail);
  startWord = !before || /[\s~(\[{"'`-]$/.test(before);
  for (const [s, e, kind] of spans) {
    out += src.slice(last, s);
    // what lies between the letters says whether a word or a sentence starts
    const gap = src.slice(last, s).replace(/\\[A-Za-z]+\s*|[{}]/g, '');
    if (last !== a || s !== a) {
      if (/[.!?]\s*$/.test(gap) && /\s/.test(gap)) startSentence = true;
      if (/[\s~(\[-]/.test(gap) || /[.!?,;:]/.test(gap)) startWord = true;
    }
    let t = src.slice(s, e);
    if (kind === 'cmd') {
      const name = t.slice(1);
      const up = mode === 'upper' || (mode === 'title' && startWord) || (mode === 'sentence' && startSentence);
      const lo = mode === 'lower' || (mode === 'title' && !startWord) || (mode === 'sentence' && !startSentence);
      const isUp = name === name.toUpperCase();
      if (mode === 'toggle') t = '\\' + LETTER_CMDS[name];
      else if (up && !isUp) t = '\\' + LETTER_CMDS[name];
      else if (lo && isUp) t = '\\' + LETTER_CMDS[name];
      startWord = false; startSentence = false;
      out += t; last = e; continue;
    }
    let r = '';
    for (const ch of t) {
      let c = ch;
      if (mode === 'upper') c = one(ch.toUpperCase(), ch);
      else if (mode === 'lower') c = one(ch.toLowerCase(), ch);
      else if (mode === 'toggle') c = ch === ch.toUpperCase() ? one(ch.toLowerCase(), ch) : one(ch.toUpperCase(), ch);
      else if (mode === 'title') c = startWord ? one(ch.toUpperCase(), ch) : one(ch.toLowerCase(), ch);
      else if (mode === 'sentence') c = startSentence ? one(ch.toUpperCase(), ch) : one(ch.toLowerCase(), ch);
      r += c;
      startWord = false; startSentence = false;
    }
    out += r; last = e;
  }
  out += src.slice(last, b);
  const text = src.slice(0, a) + out + src.slice(b);
  return text === src ? null : { text, a, b: a + out.length };
}
// (a letter whose other case is two letters, ß to SS, keeps its case: the source stays as long)
const one = (c, ch) => (c.length === ch.length ? c : ch);
function titleOf(spans, src) {
  let s = '', prevEnd = -1;
  for (const [a, b] of spans) {
    const t = src.slice(a, b);
    const gap = prevEnd < 0 || /[\s~(]/.test(src.slice(prevEnd, a));
    s += gap ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t.toLowerCase();
    prevEnd = b;
  }
  return s;
}
// The runs of letters of [a, b) a case change may touch: [s, e, kind] with kind 'text' or 'cmd'
// (a letter written as a command: \ss, \o, \ae)
export function letterSpans(src, a, b) {
  const out = [];
  let i = a, run = -1;
  // (the arguments skipped are looked for in two million characters at most in all: a stranger's
  // thousands of unclosed \cite{ would each scan to the end)
  const budget = { n: 2e6 };
  const groupClose = (t, k, z) => groupCloseB(t, k, z, budget);
  const end = () => { if (run >= 0) { out.push([run, i, 'text']); run = -1; } };
  for (let n = 0; i < b && n < 400000; n++) {
    const c = src[i];
    if (c === '%') { end(); const z = src.indexOf('\n', i); i = z < 0 || z > b ? b : z; continue; }
    if (c === '$' || (c === '\\' && (src[i + 1] === '(' || src[i + 1] === '['))) { end(); i = skipMath(src, i, b); continue; }
    if (c === '\\') {
      end();
      const m = /^\\([A-Za-z]+)\*?/.exec(src.slice(i, i + 60));
      if (!m) { i += 2; continue; }
      if (LETTER_CMDS[m[1]] && !/[A-Za-z]/.test(src[i + m[0].length] || '')) { out.push([i, i + m[0].length, 'cmd']); i += m[0].length; continue; }
      i += m[0].length;
      if (m[1] === 'begin' || m[1] === 'end' || NOT_WORDS.has(m[1])) {
        // its keys: every argument but the words after the lead ones (\href's text, \textcolor's)
        let lead = m[1] in NOT_WORDS_LEAD ? NOT_WORDS_LEAD[m[1]] : 99;
        for (let k = 0; k < 6 && i < b; k++) {
          let j = i;
          while (j < b && (src[j] === ' ' || src[j] === '\t')) j++;
          if (src[j] === '[') { const z = groupClose(src, j, b); if (z < 0) break; i = z; continue; }
          if (src[j] !== '{' || lead <= 0) break;
          const z = groupClose(src, j, b);
          if (z < 0) break;
          i = z; lead--;
        }
      }
      continue;
    }
    if (/\p{L}/u.test(c)) { if (run < 0) run = i; i++; continue; }
    end(); i++;
  }
  end();
  return out;
}
function groupCloseB(t, i, b, budget) {
  const open = t[i], close = open === '[' ? ']' : '}';
  let d = 0;
  if (budget.n <= 0) return -1;
  for (let k = i; k < b && k < i + 20000; k++) {
    if (--budget.n <= 0) return -1;
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return k + 1;
  }
  return -1;
}
function skipMath(src, i, b) {
  const close = src[i] === '$' ? (src[i + 1] === '$' ? '$$' : '$') : src[i + 1] === '(' ? '\\)' : '\\]';
  let k = i + (close === '$' ? 1 : 2);
  for (; k < b && k < i + 20000; k++) {
    if (src[k] === '\\' && src.startsWith(close, k)) return k + close.length;
    if (src[k] === '\\') { k++; continue; }
    if (src.startsWith(close, k)) return k + close.length;
  }
  return b;
}
// the word around a caret (its letters, with the commands inside it), for Change Case and the
// Format Painter on a caret: [s, e] or null
export function wordAt(src, p) {
  let s = p, e = p;
  const isL = (c) => !!c && /[\p{L}\p{M}\p{N}'’-]/u.test(c);
  for (let n = 0; s > 0 && isL(src[s - 1]) && n < 200; n++) s--;
  for (let n = 0; e < src.length && isL(src[e]) && n < 200; n++) e++;
  // (not the name of a command)
  if (src[s - 1] === '\\') return null;
  return e > s ? [s, e] : null;
}

// ---- *bold* and _italic_ as they are typed ---------------------------------------------------
// The edit that makes *words* bold and _words_ italic once the closing mark is typed: { s, e, t,
// p } (p the caret after it), or null. src is the text with the closing mark not yet in it; p
// where it is about to go; mark '*' or '_' (in the source an underscore is \_).
export function autoFormat(src, p, mark) {
  const open = mark === '*' ? '*' : '\\_';
  // the words: back from the caret on this line to the opening mark, at most 200 characters
  const from = Math.max(0, p - 200);
  const line = src.slice(from, p);
  const nl = line.lastIndexOf('\n');
  const seg = nl >= 0 ? line.slice(nl + 1) : line, base = p - seg.length;
  // (a mark that is the last character typed, with no space before the closing one)
  if (!seg.length || /\s/.test(seg[seg.length - 1])) return null;
  let k = seg.lastIndexOf(open, seg.length - 2);
  if (k < 0) return null;
  // an escaped backslash before \_ is the text \\ and an underscore after it
  if (mark === '_' && k > 0 && seg[k - 1] === '\\') return null;
  const words = seg.slice(k + open.length);
  if (!words || /^\s/.test(words) || words.includes(open)) return null;
  // the opening mark starts a word: the line's start, a space or an opening bracket before it
  if (k > 0 && !/[\s([{"'`~]/.test(seg[k - 1])) return null;
  if (mark === '*' && words.includes('*')) return null;
  if (!balanced(words) || /\$/.test(words)) return null;
  const cmd = mark === '*' ? '\\textbf{' : '\\emph{';
  const s = base + k;
  return { s, e: p, t: cmd + words + '}', p: s + cmd.length + words.length + 1 };
}

export { diffEdit, opener };
