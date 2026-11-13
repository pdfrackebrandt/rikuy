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

import { GROUPS, defineGroup, groupNames, groupOf, enclosing, wrappersIn, unwrapEdits, wrapEdits, opener, diffEdit, closeOf, splitText, mapPos, LEAD } from './wrap.js';
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
// Every wrapper of these names lying wholly inside [a, b), outermost first. Each look stops at 2000
// (the list's stop says where: every wrapper that starts before it is in the list)
function allInside(src, a, b, names) {
  const plain = names.filter((n) => !isExtra(n)), want = new Set(names.filter(isExtra));
  let stop = b;
  const found = plain.length ? wrappersIn(src, a, b, plain) : [];
  if (found.length >= 2000) stop = found[found.length - 1].s + 1;
  const out = found.filter((W) => !W.decl || (groupOf(W.cmd) && GROUPS[groupOf(W.cmd)].decls.includes(W.cmd)));
  if (want.size) {
    // (a look at most at 4000 places: each may read 20 000 characters for its closing brace)
    let k = a, n = 0, tries = 0;
    for (; k < b && n < 2000 && tries < 4000; k++) {
      const c = src[k];
      if (c === '%' && src[k - 1] !== '\\') { const z = src.indexOf('\n', k); if (z < 0) { k = b; break; } k = z; continue; }
      if ((c !== '{' && c !== '\\') || src[k - 1] === '\\') continue;
      if (!(c === '{' ? src[k + 1] === '\\' : /^\\(?:scalebox|raisebox)(?![A-Za-z])/.test(src.slice(k, k + 10)))) continue;
      tries++;
      const W = parseExtra(src, k, want);
      if (W && W.e <= b) { out.push(W); n++; }
    }
    if (k < b) stop = Math.min(stop, k);
  }
  // (nested ones inside an extra one are found by both scans once each; outermost first)
  out.sort((x, y) => x.s - y.s || y.e - x.e);
  const list = stop < b ? out.filter((W) => W.s < stop) : out;
  list.stop = stop;
  return list;
}

// ---- taking a wrapper off, whole or from part of it ------------------------------------------------
// Whether a declaration's group may lose its braces (src/wrap.js's rule, for every form): it
// stands after a space or a line's start (not as a command's argument, \footnote{\color{red} ..},
// nor after a control word) and holds no other declaration of its own level that would leak out.
function free(src, W) {
  if (!W.decl) return true;
  if (W.ie - W.is > 4000) return false;
  let k = W.s - 1;
  if (k >= 0 && !/\s/.test(src[k])) return false;
  while (k >= 0 && /\s/.test(src[k])) k--;
  if (k >= 0 && /\\(?:[A-Za-z@]+|[^A-Za-z@\s])$/.test(src.slice(Math.max(0, k - 60), k + 1))) return false;
  return !declInside(src.slice(W.is, W.ie));
}
// what goes between words that come together where a wrapper was (\noindent\textbf{Proof}:
// \noindent Proof; \textbf{\LaTeX}ing: \LaTeX{}ing)
function seams(src, s, is, ie, e) {
  const cw = (p) => /\\[A-Za-z@]+$/.test(src.slice(Math.max(0, p - 60), p)) && !/\\\\[A-Za-z@]+$/.test(src.slice(Math.max(0, p - 61), p));
  const first = src[is] || '', next = src[e] || '';
  return { pre: cw(s) ? (/[A-Za-z]/.test(first) ? ' ' : /[[*]/.test(first) ? '{}' : '') : '', post: cw(ie) && /[A-Za-z]/.test(next) ? '{}' : '' };
}
// The edits that take a wrapper off: src/wrap.js's own forms by its unwrapEdits (which keeps a
// declaration's braces where they are an argument); the extra forms by the same rule here
export function unwrapAny(src, W) {
  if (!W.extra) return unwrapEdits(src, W);
  if (W.decl && !free(src, W)) return [{ s: W.s + 1, e: W.is, t: '' }];
  const { pre, post } = seams(src, W.s, W.is, W.ie, W.e);
  return [{ s: W.ie, e: W.e, t: post }, { s: W.s, e: W.is, t: pre }];
}
// whether a text has a declaration at its own level (\bf x, \large x): a control word with no
// argument after it, as a group's braces keep from reaching what follows
function declInside(t) {
  let d = 0;
  for (let i = 0; i < t.length && i < 20000; i++) {
    const c = t[i];
    if (c === '%') return true;
    if (c === '{') { d++; continue; }
    if (c === '}') { d--; continue; }
    if (c !== '\\') continue;
    const m = /^\\([A-Za-z@]+)/.exec(t.slice(i, i + 40));
    if (!m) { i++; continue; }
    i += m[0].length - 1;
    if (d) continue;
    let k = i + 1;
    while (t[k] === ' ' || t[k] === '\t') k++;
    if (t[k] !== '{' && t[k] !== '[') return true;
  }
  return false;
}
// The declarations a group opens with, one after another ({\bfseries\large ..}, {\color{red}
// \itshape ..}): [{ name, text }] and where its words start, or null for no group of declarations
let declSet = null, declOf = 0;
const isDecl = (n) => {
  // (the groups' declarations in one set, made again when a group is added)
  const k = Object.keys(GROUPS).length;
  if (!declSet || declOf !== k) { declSet = new Set(Object.values(GROUPS).flatMap((g) => g.decls)); declOf = k; }
  return !!DECL_LEAD[n] || declSet.has(n);
};
// the brace or bracket matching the one at q, looked for before lim alone; -1 when it is not there
function closeBy(src, q, lim) {
  const o = src[q], c = o === '[' ? ']' : '}';
  for (let k = q + 1, d = 0; k < lim; k++) {
    const x = src[k];
    if (x === '\\') { k++; continue; }
    if (x === o) d++;
    else if (x === c) { if (d === 0) return k + 1; d--; }
  }
  return -1;
}
function declRun(src, W) {
  if (!W.decl) return null;
  const out = [];
  let i = W.s + 1;
  for (let n = 0; n < 8; n++) {
    const m = /^\\([A-Za-z]+)(?![A-Za-z])/.exec(src.slice(i, i + 40));
    if (!m || !isDecl(m[1])) break;
    let k = i + m[0].length;
    if (DECL_LEAD[m[1]]) {
      const X = parseExtra(src, W.s, null);
      // (a declaration with arguments: read as parseExtra reads the group's first)
      if (n === 0 && X) k = X.is;
      else {
        k = sp(src, k);
        if (src[k] === '[') { const z = closeOf(src, k); if (z < 0) return null; k = sp(src, z); }
        for (let a = 0; a < DECL_LEAD[m[1]]; a++) { if (src[k] !== '{') return null; const z = closeOf(src, k); if (z < 0) return null; k = sp(src, z); }
        if (src.startsWith('\\selectfont', k) && !/[A-Za-z]/.test(src[k + 11] || '')) k = sp(src, k + 11);
      }
    }
    out.push({ name: m[1], text: src.slice(i, k).replace(/\s+$/, '') });
    i = k;
    while (src[i] === ' ' || src[i] === '\t' || (src[i] === '\n' && src[i + 1] !== '\n')) i++;
  }
  return out.length ? { decls: out, body: Math.min(i, W.ie) } : null;
}
// The wrapper W taken off the part [a, b) of what it holds, the parts before and after keeping it.
// A group of declarations keeps its other declarations on the part (clear names those taken
// off), and stays one group where its braces are an argument (\footnote{{\color{red} a}b{..}}).
// null where the parts would not be whole groups, or a declaration further in would leak.
function splitAny(src, W, a, b, clear) {
  a = Math.max(a, W.is); b = Math.min(b, W.ie);
  if (!balanced(src.slice(W.is, a)) || !balanced(src.slice(b, W.ie))) return null;
  if (!W.decl) {
    if (!W.extra) return splitText(src, W, a, b);
    if (a === W.is && b === W.ie) { const ed = unwrapAny(src, W); return { text: applyAll(src, ed), a: mapPos(ed, a, 1), b: mapPos(ed, b, -1) }; }
    const open = src.slice(W.s, W.is), close = src.slice(W.ie, W.e);
    const left = src.slice(W.is, a), mid = src.slice(a, b), right = src.slice(b, W.ie);
    const out = (left ? open + left + close : '') + mid + (right ? open + right + close : '');
    const a2 = W.s + (left ? open.length + left.length + close.length : 0);
    return { text: src.slice(0, W.s) + out + src.slice(W.e), a: a2, b: a2 + mid.length };
  }
  const R = declRun(src, W);
  if (!R || W.ie - W.is > 4000 || declInside(src.slice(R.body, W.ie))) return null;
  a = Math.max(a, R.body);
  const keep = !free(src, { ...W, is: R.body });
  const open = src.slice(W.s, R.body), close = '}';
  const stay = R.decls.filter((x) => !clear.includes(x.name));
  const midOpen = stay.length ? '{' + stay.map((x) => x.text).join('') + ' ' : '';
  const left = src.slice(R.body, a), mid = src.slice(a, b), right = src.slice(b, W.ie);
  // (the space the opening ends with, once: {\large abc }def{\large ghi})
  const op = (t) => (/^\s/.test(t) ? open.replace(/\s+$/, '') : open);
  const L = left.trim() ? open + left + close : left, M = midOpen ? midOpen + mid + '}' : mid, Rt = right.trim() ? op(right) + right + close : right;
  const seam = seams(src, W.s, a, b, W.e);
  const pre = keep || L ? '' : midOpen ? '' : seam.pre, post = keep || Rt ? '' : midOpen ? '' : seam.post;
  const out = (keep ? '{' : '') + L + pre + M + post + Rt + (keep ? '}' : '');
  const a2 = W.s + (keep ? 1 : 0) + L.length + pre.length + (midOpen ? midOpen.length : 0);
  return { text: src.slice(0, W.s) + out + src.slice(W.e), a: a2, b: a2 + mid.length };
}
// The selection [a, b) made whole within W: where an end falls in another format inside W's words
// (\textbf{\emph{Sec|ond}}), that format is split at it (\emph{Sec}\emph{ond}), or where the
// selection has all of that format's words, the end moves past it. { text, a, b } or null.
function wholePart(src, W, a, b) {
  const all = CHAR_KINDS.flatMap((g) => groupNames(g));
  let t = src;
  for (let n = 0; n < 8; n++) {
    const p = Math.max(a, W.is), q = Math.min(b, W.ie + (t.length - src.length));
    const ie = W.ie + (t.length - src.length);
    const endOk = balanced(t.slice(q, ie)), startOk = balanced(t.slice(W.is, p));
    if (endOk && startOk) return { text: t, a, b };
    const at = endOk ? p : q;
    const X = around(t, at, at, null, { names: all });
    if (!X || X.s <= W.s || X.e > ie + 1) return null;
    const open = t.slice(X.s, X.is), close = t.slice(X.ie, X.e);
    if (!endOk) {
      if (q >= X.ie && a <= X.is) { b = Math.max(b, X.e); continue; }
      if (q <= X.is) return null;
      t = t.slice(0, q) + close + open + t.slice(q);
      b = q + close.length;
    } else {
      if (p <= X.is && b >= X.ie) { a = Math.min(a, X.s); continue; }
      if (p >= X.ie) return null;
      t = t.slice(0, p) + close + open + t.slice(p);
      if (b >= p) b += close.length + open.length;
      a = p + close.length + open.length;
    }
  }
  return null;
}
// what opens a wrapper to write: src/wrap.js's opener, and the extra forms
export function openerAny(w) {
  const opt = w.opt != null && w.opt !== '' ? '[' + w.opt + ']' : '', args = (w.args || []).map((x) => '{' + x + '}').join('');
  if (w.decl) return '{\\' + w.cmd + opt + args + (w.select ? '\\selectfont' : '') + ' ';
  if (w.opt2 != null && w.opt2 !== '') return '\\' + w.cmd + opt + args + '[' + w.opt2 + ']{';
  return opener(w);
}

// ---- acting on the text -------------------------------------------------------------------
// the text with edits applied in one pass (src/wrap.js's way: a copy of the text for each edit
// froze a large document), and a position mapped through them
function applyAll(t, edits) {
  const xs = edits.map((x, i) => [x, i]).sort(([u, i], [v, j]) => u.s - v.s || j - i);
  let out = '', at = 0;
  for (const [x] of xs) { out += t.slice(at, Math.max(at, x.s)) + x.t; at = Math.max(at, x.e); }
  return out + t.slice(at);
}
export const applyEdits = applyAll;
const shiftBy = (edits, p) => edits.reduce((n, x) => n + (x.e <= p ? x.t.length - (x.e - x.s) : 0), 0);

// Every wrapper of a kind taken off what lies wholly inside [a, b): { text, a, b }
export function clearInside(src, a, b, names) {
  let t = src, p = a, a0 = a;
  // (2000 at a time, from where the last look stopped: Ctrl+A on a thesis has tens of thousands)
  for (let round = 0; round < 200 && p < b; round++) {
    const inside = allInside(t, p, b, names), st = inside.stop, end = b;
    if (inside.length) {
      // (none of them overlaps another but by holding it: their edits are taken off all at once)
      const edits = inside.flatMap((W) => unwrapAny(t, W));
      t = applyAll(t, edits);
      if (round === 0) a0 = a + shiftBy(edits, a);
      p = st + shiftBy(edits, st);
      b += shiftBy(edits, b);
    } else break;
    // (a look that found none in its 4000 tries ends it: a stranger's text of unclosed groups)
    if (st >= end) break;
  }
  return { text: t, a: a0, b };
}

// Formats of these kinds taken off [a, b), as Word takes them off: those inside it go, one around
// it all or around one of its ends is taken off the part the selection has (the parts beyond keep
// it). A caret takes off the wrappers it is in. Returns { text, a, b } (the same text when there was
// none) or { error } when a wrapper cannot be split there.
export function clearKinds(src, a, b, kinds) {
  const runs = a === b ? [[a, b]] : textRuns(src, a, b);
  if (!runs.length) return { text: src, a, b };
  // (the last run first, so the runs before keep their places; the selection's end moves by what
  // the runs before it changed)
  let t = src, first = null, last = null, grown = 0;
  for (let k = runs.length - 1; k >= 0; k--) {
    const r = clearKindsIn(t, runs[k][0], runs[k][1], kinds);
    if (r.error) return r;
    if (k === runs.length - 1) last = r; else grown += r.text.length - t.length;
    if (k === 0) first = r;
    t = r.text;
  }
  return { text: t, a: runs[0][0] === a ? first.a : a, b: runs[runs.length - 1][1] === b ? last.b + grown : b + (t.length - src.length) };
}
function clearKindsIn(src, a, b, kinds) {
  const names = [...new Set(kinds.flatMap((g) => groupNames(g)))];
  let t = src;
  if (a !== b) { const r = clearInside(t, a, b, names); t = r.text; a = r.a; b = r.b; }
  for (let n = 0; n < 60; n++) {
    let hit = aroundAny(t, a, b, kinds), part = false;
    if (!hit && a !== b) {
      // (a wrapper at an end of the selection that holds some of it: the end's caret is in it)
      for (const p of [b, a]) { const h = aroundAny(t, p, p, kinds); if (h && !(h.W.is <= a && h.W.ie >= b) && h.W.is < b && h.W.ie > a) { hit = h; part = true; break; } }
    }
    if (!hit) break;
    const W = hit.W;
    if (a === b) {
      const ed = unwrapAny(t, W);
      t = applyAll(t, ed); a = b = mapPos(ed, a, -1);
      continue;
    }
    const p0 = Math.max(a, W.is), p1 = Math.min(b, W.ie);
    const r = splitAny(t, W, p0, p1, names);
    if (!r) {
      // (an end of the selection inside a format within this one: that format is split there,
      // or taken whole where the selection has all its words, and this one is tried again)
      const w = wholePart(t, W, a, b);
      if (w && (w.text !== t || w.a !== a || w.b !== b)) { t = w.text; a = w.a; b = w.b; continue; }
    }
    if (!r || r.text === t) return n === 0 && t === src ? { error: 'split' } : { text: t, a, b };
    const d = r.text.length - t.length;
    if (part) { a = a < W.is ? a : r.a; b = b > W.ie ? b + d : r.b; } else { a = r.a; b = r.b; }
    t = r.text;
  }
  return { text: t, a, b };
}
export const CHAR_KINDS = ['bold', 'italic', 'underline', 'strike', 'dstrike', 'sub', 'sup', 'smallcaps', 'allcaps', 'border', 'enclose', 'color', 'highlight', 'shading', 'size', 'family', 'mono', 'spacing', 'scale', 'position'];
// Clear All Formatting: every kind; null when nothing changes
export function clearFormats(src, a, b, kinds = CHAR_KINDS) {
  const r = clearKinds(src, a, b, kinds);
  return r.error || r.text === src ? null : r;
}

// Whether the kind is on over all of [a, b) (a caret: in a wrapper of it)
export function isOn(src, a, b, group) {
  const W = around(src, a, b, group);
  return !!W && W.is <= a && W.ie >= b;
}

// A toggle (Bold, Strikethrough, Small Caps, ...), as Word's: where the whole selection has it, it
// is taken off the selection (off the whole wrapper at a caret); else the selection gets the kind's
// own command, its parts that had it first taken off (bold in bold says nothing more, \emph in
// \emph turns upright). o.force 'on' or 'off' decides for a selection over several paragraphs;
// o.other: the kind that excludes this one (Subscript and Superscript), which becomes this one in
// place. Returns { text, a, b, on, w } or { error }.
export function toggle(src, a, b, group, o = {}) {
  const has = o.force ? o.force === 'off' : allOn(src, a, b, group);
  if (has) {
    const r = clearKinds(src, a, b, [group]);
    return r.error ? { error: 'split' } : { ...r, on: false };
  }
  const w = o.w || { cmd: GROUPS[group].write };
  if (o.other) {
    const X = around(src, a, b, o.other);
    if (X && (a === b || (X.is === a && X.ie === b))) {
      const open = openerAny(w), d = open.length - (X.is - X.s);
      return { text: src.slice(0, X.s) + open + src.slice(X.is), a: a + d, b: b + d, on: true, w };
    }
  }
  if (a === b) return wrapIn(src, a, b, group, w);
  // (the parts that had it lose it first, so the selection gets one wrapper: a word of bold in it
  // says nothing more, and \emph in \emph would turn it upright)
  const c = clearKinds(src, a, b, [group]);
  if (c.error) return { error: 'split' };
  return wrapIn(c.text, c.a, c.b, group, w);
}
// whether every part of the selection has the kind (a caret: whether it is in a wrapper of it)
export function allOn(src, a, b, group) {
  if (a === b) return isOn(src, a, b, group);
  // (a footnote's text is no part of what the selection's words have: ulem's lines skip it)
  const segs = segmentsOf(src, a, b).flatMap(([s, e]) => elsewhereParts(src, s, e) || [[s, e]]).filter(([s, e]) => src.slice(s, e).trim());
  return segs.length > 0 && segs.length < 400 && segs.every(([s, e]) => isOn(src, s, e, group) || covered(src, s, e, group));
}
// whether the kind's wrappers inside [s, e) hold all its words (a whole paragraph of \textbf{..})
function covered(src, s, e, group) {
  const inside = allInside(src, s, e, groupNames(group));
  if (!inside.length || inside.stop < e) return false;
  let rest = '', p = s;
  for (const W of inside) { if (W.s < p) continue; rest += src.slice(p, W.s); p = W.e; }
  return !(rest + src.slice(p, e)).trim();
}

// Commands whose text is set somewhere else (a footnote's at the page's foot): a line that ulem
// draws cannot run through them, so a wrapper of ulem closes before each and opens after it
const ELSEWHERE = /\\(?:footnote|footnotetext|marginpar|todo|thanks|endnote|sidenote)\b/;
const ULEM_KINDS = new Set(['underline', 'strike', 'dstrike', 'highlight']);
function elsewhereParts(src, a, b) {
  const parts = [];
  let p = a;
  for (let k = a, n = 0; k < b && n < 200; k++) {
    if (src[k] === '%' && src[k - 1] !== '\\') { const z = src.indexOf('\n', k); k = z < 0 || z > b ? b : z; continue; }
    if (src[k] !== '\\' || src[k - 1] === '\\') continue;
    const m = ELSEWHERE.exec(src.slice(k, k + 14));
    if (!m || m.index !== 0) continue;
    // the command and its arguments ([..] and {..}) stay out of the wrapper
    let e = k + m[0].length;
    for (let g = 0; g < 3; g++) {
      let q = e;
      while (src[q] === ' ' || src[q] === '\t') q++;
      if (src[q] !== '{' && src[q] !== '[') break;
      const z = closeOf(src, q);
      if (z < 0 || z > b) return null;
      e = z;
    }
    if (k > p) parts.push([p, k]);
    p = e; k = e - 1; n++;
  }
  if (p < b) parts.push([p, b]);
  return parts;
}

// The selection in a wrapper w of a kind, the kind's wrappers inside it taken off first. A selection
// that crosses a brace (from a bold word into plain text, over two paragraphs, into a cell) gets a
// wrapper on each whole part (segmentsOf); LaTeX paragraphs in it get none. ulem's kinds close
// before a footnote and open again after it (\uline{words}\footnote{..}\uline{ and}), as the line
// cannot run through text set elsewhere. A wrapper the same as one just before or after it joins it
// (\textbf{a}\textbf{bc} is \textbf{abc}).
export function wrapIn(src, a, b, group, w) {
  const open = openerAny(w);
  if (a === b) {
    const r = wrapEdits(src, a, a, open);
    return { text: applyAll(src, r.edits), a: r.p, b: r.p, on: true, w };
  }
  const c = clearRuns(src, a, b, groupNames(group));
  let segs = segmentsOf(c.text, c.a, c.b);
  if (ULEM_KINDS.has(group)) {
    const out = [];
    for (const [s, e] of segs) { const P = elsewhereParts(c.text, s, e); if (!P) return { error: 'crosses' }; out.push(...P); }
    segs = out;
  }
  segs = segs.filter(([s, e]) => c.text.slice(s, e).trim());
  if (!segs.length) return { error: 'Nothing here takes that format: select text of the page.' };
  if (segs.length > 2000) return { error: 'That selection is too long to format at once.' };
  // (a part that starts or ends at a mark that goes with a letter outside it, a vowel sign or an
  // accent written apart, would part the two: refused, as src/wrap.js refuses a cluster cut)
  if (segs.length > 1 && segs.some(([s, e]) => /^\p{M}/u.test(c.text[s] || '') || /^\p{M}/u.test(c.text[e] || ''))) return { error: 'crosses' };
  const edits = [];
  for (const [s, e] of segs) {
    const r = wrapEdits(c.text, s, e, open);
    if (r.error) return { error: r.error };
    edits.push(...joinLike(c.text, r.edits, open, group));
  }
  const text = applyAll(c.text, edits);
  return { text, a: mapPos(edits, c.a, 1), b: mapPos(edits, c.b, -1), on: true, w };
}
// a wrapper's edits ({ s: e, t: '}' } and { s, t: open }) changed to join a wrapper with the same
// opening that ends just before it or starts just after it
function joinLike(src, edits, open, group) {
  const close = edits.find((x) => x.t === '}' && x.s === x.e), start = edits.find((x) => x.t === open && x.s === x.e);
  if (!close || !start || edits.length !== 2) return edits;
  const out = [];
  const X = start.s > 0 && src[start.s - 1] === '}' ? around(src, start.s - 1, start.s - 1, group) : null;
  if (X && X.ie === start.s - 1 && X.e === start.s && src.slice(X.s, X.is) === open) out.push({ s: X.ie, e: X.e, t: '' });
  else out.push(start);
  const Y = src.startsWith(open, close.s) ? around(src, close.s + open.length, close.s + open.length, group) : null;
  if (Y && Y.s === close.s && Y.is === close.s + open.length && src[Y.ie] === '}' && Y.e === Y.ie + 1) out.push({ s: Y.s, e: Y.is, t: '' });
  else out.push(close);
  return out;
}
// a kind's wrappers taken off what lies inside each run of the selection outside LaTeX paragraphs
function clearRuns(src, a, b, names) {
  const runs = textRuns(src, a, b);
  let t = src, grown = 0, first = null;
  for (let k = runs.length - 1; k >= 0; k--) {
    const r = clearInside(t, runs[k][0], runs[k][1], names);
    if (k < runs.length - 1) grown += r.text.length - t.length;
    if (k === 0) first = r;
    t = r.text;
  }
  if (!runs.length) return { text: src, a, b };
  return { text: t, a: runs[0][0] === a ? first.a : a, b: b + (t.length - src.length) };
}

// The parts of [a, b) a wrapper can go round whole: the selection cut where a brace opened before
// it closes (the end of a bold word it starts in), where a brace it opens closes after it (with the
// command or declarations the brace belongs to), and at each paragraph's end; the paragraphs kept
// as LaTeX source left out. [[s, e]]
export function segmentsOf(src, a, b) {
  const cuts = [];
  const open = [];
  for (let i = a; i < b; i++) {
    const c = src[i];
    if (c === '\\' && !open.length) {
      // (what no wrapper may hold at the selection's own level: a cell's or a row's end, an item,
      // a rule between rows, an environment's begin or end; all of a display or a verbatim)
      const z = breakAt(src, i, b);
      if (z > i) { cuts.push([i, z]); i = z - 1; continue; }
    }
    if (c === '\\') { i++; continue; }
    if (c === '&' && !open.length) { cuts.push([i, i + 1]); continue; }
    if (c === '%') { const z = src.indexOf('\n', i); if (z < 0 || z >= b) break; i = z; continue; }
    if (c === '{') open.push(i);
    else if (c === '}') { if (open.length) open.pop(); else cuts.push([i, i + 1]); }
  }
  // (a stranger's thousands of braces never closed: no parts, the selection is refused)
  if (open.length + cuts.length > 2000) return [];
  for (const p of open) cuts.push([openerStart(src, p, a), bodyStart(src, p, b)]);
  cuts.sort((x, y) => x[0] - y[0]);
  const out = [];
  // (the spaces next to a cut stay outside: \item \textbf{one}, not \item\textbf{ one\n})
  const part = (s, e) => {
    if (s !== a) while (s < e && /\s/.test(src[s])) s++;
    if (e !== b) while (e > s && /\s/.test(src[e - 1])) e--;
    if (e > s) out.push(...paragraphParts(src, s, e));
  };
  let p = a;
  for (const [s, e] of cuts) {
    if (s > p) part(p, s);
    p = Math.max(p, e);
  }
  if (p < b) part(p, b);
  return out;
}
// The end of what at i no wrapper may hold (see segmentsOf), or i
const ROW = /^\\(?:\\\*?|item\b|hline\b|cline\b|toprule\b|midrule\b|bottomrule\b|cmidrule\b|addlinespace\b|rowcolor\b|noalign\b|tabularnewline\b|newline\b|linebreak\b|par\b)/;
const WHOLE = /^(?:equation|align|gather|multline|eqnarray|flalign|alignat|math|displaymath|dmath|verbatim|Verbatim|lstlisting|minted|tikzpicture|comment)\*?$/;
function breakAt(src, i, b) {
  const head = src.slice(i, i + 40);
  if (head.startsWith('\\[') || head.startsWith('$$')) {
    const close = head.startsWith('$$') ? '$$' : '\\]', z = src.indexOf(close, i + 2);
    return z < 0 ? b : Math.min(b, z + 2);
  }
  const env = /^\\(begin|end)\s*\{([^{}]{1,40})\}/.exec(head);
  if (env) {
    if (env[1] === 'begin' && WHOLE.test(env[2])) {
      const z = src.indexOf('\\end{' + env[2] + '}', i);
      return z < 0 ? b : Math.min(b, z + 6 + env[2].length);
    }
    return Math.min(b, args(src, i + env[0].length, b));
  }
  const m = ROW.exec(head);
  if (!m) return i;
  return Math.min(b, m[0] === '\\par' || m[0] === '\\newline' ? i + m[0].length : args(src, i + m[0].length, b));
}
// past the optional and brace arguments right after k (and a cmidrule's (lr))
function args(src, k, b) {
  for (let n = 0; n < 4 && k < b; n++) {
    const q = src[k] === ' ' && src[k + 1] === '[' ? k + 1 : k;
    if (src[q] === '(') { const z = src.indexOf(')', q); if (z < 0 || z > q + 20) break; k = z + 1; continue; }
    if (src[q] !== '[' && src[q] !== '{') break;
    const z = closeBy(src, q, b);
    if (z < 0) break;
    k = z;
  }
  return k;
}
// where the command a brace at p belongs to starts (\textcolor{red}{ for the last brace), not before a
function openerStart(src, p, a) {
  let k = p;
  for (let n = 0; n < 6 && k > a; n++) {
    const prev = src[k - 1];
    if (prev === '}' || prev === ']') {
      const o = openBefore(src, k - 1, prev === '}' ? '{' : '[');
      if (o < a) break;
      k = o;
      continue;
    }
    const m = /\\[A-Za-z@]+\*?$/.exec(src.slice(Math.max(a, k - 40), k));
    if (m) k -= m[0].length;
    break;
  }
  return k;
}
// the brace's matching opening before it, or -1
function openBefore(src, z, want) {
  const close = src[z];
  for (let k = z - 1, d = 0; k >= 0 && z - k < 2000; k--) {
    if (src[k - 1] === '\\') continue;
    if (src[k] === close) d++;
    else if (src[k] === want) { if (d === 0) return k; d--; }
  }
  return -1;
}
// where the words after a brace at p start: past the declarations a group opens with ({\bfseries\large
// abc), not past a command with text of its own
function bodyStart(src, p, b) {
  let i = p + 1;
  for (let n = 0; n < 8 && i < b; n++) {
    const m = /^\s*\\([A-Za-z]+)(?![A-Za-z])/.exec(src.slice(i, i + 60));
    if (!m || !(isDecl(m[1]) || m[1] === 'selectfont')) break;
    let k = i + m[0].length;
    for (let g = 0; g < (DECL_LEAD[m[1]] || 0) + 1; g++) {
      const q = sp(src, k);
      if (src[q] !== '{' && !(src[q] === '[' && g === 0)) break;
      const z = closeBy(src, q, b);
      if (z < 0) break;
      k = z;
      if (src[q] === '[') g--;
    }
    i = k;
  }
  while (i < b && /\s/.test(src[i])) i++;
  return Math.min(i, b);
}
// The runs of [a, b) outside paragraphs kept as LaTeX source: [[s, e]]
export function textRuns(src, a, b) {
  const parts = paragraphParts(src, a, b), out = [];
  if (!parts.length) return out;
  // (paragraphs next to each other with only blank lines between are one run)
  let [s, e] = parts[0];
  if (s - a >= 0 && !src.slice(a, s).trim()) s = a;
  for (let k = 1; k < parts.length; k++) {
    if (!src.slice(e, parts[k][0]).trim()) { e = parts[k][1]; continue; }
    out.push([s, e]);
    [s, e] = parts[k];
  }
  if (!src.slice(e, b).trim()) e = b;
  out.push([s, e]);
  return out;
}

// A value for a kind (a colour, a size, a family, an underline's style), or null to take it off,
// as Word's: on a wrapper of the kind that holds exactly the selection (or the caret) the wrapper
// gets the new command or argument, a group of declarations keeping its braces and its form
// (w.declAlt: {\sffamily ..} for \textsf, {\color{..} ..} for \textcolor); elsewhere the kind is taken
// off the selection and the selection gets a wrapper of its own.
export function setValue(src, a, b, group, w, o = {}) {
  const W = o.W !== undefined ? o.W : around(src, a, b, group);
  const exact = W && (a === b || (a >= W.is && b <= W.ie && src.slice(W.is, a).trim() === '' && src.slice(b, W.ie).trim() === ''));
  if (!w) {
    const r = clearKinds(src, a, b, [group]);
    if (r.error) return { error: 'split' };
    return r.text === src ? null : { ...r, on: false };
  }
  if (exact) {
    const want = W.decl && w.declAlt ? w.declAlt : w;
    const open = openerAny(want);
    if (!W.decl === !want.decl && src.slice(W.s, W.is) === open) return { text: src, a, b, on: true, w: want, same: true };
    // (inside it, the same kind taken off first: a colour in the colour)
    const inner = a === b ? { text: src, a, b } : clearInside(src, W.is, W.ie, groupNames(group));
    const t = inner.text, lost = src.length - t.length;
    if (W.decl && !want.decl && free(t, { ...W, ie: W.ie - lost, e: W.e - lost })) {
      // (a group that stands free becomes the command: {\sffamily x} to \textrm{x})
      const d = open.length - (W.is - W.s);
      return { text: t.slice(0, W.s) + open + t.slice(W.is), a: a + d, b: b + d - lost, on: true, w: want };
    }
    if (W.decl && !want.decl) {
      // (a group of declarations that is an argument, or holds one: its braces stay, the command inside them)
      const body = t.slice(W.is, W.ie - lost);
      const out = '{' + open + body + '}}';
      const d = 1 + open.length - (W.is - W.s);
      return { text: t.slice(0, W.s) + out + t.slice(W.e - lost), a: a + d, b: b + d - lost, on: true, w: want };
    }
    const d = open.length - (W.is - W.s);
    return { text: t.slice(0, W.s) + open + t.slice(W.is), a: a + d, b: b + d - lost, on: true, w: want };
  }
  const c = a === b ? { text: src, a, b } : clearKinds(src, a, b, [group]);
  if (c.error) return { error: 'split' };
  return wrapIn(c.text, c.a, c.b, group, w);
}

function aroundAny(src, a, b, kinds) {
  // (one look for all the kinds' names, not one for each kind)
  const names = [...new Set(kinds.flatMap((g) => groupNames(g)))];
  const W = around(src, a, b, null, { names });
  if (!W) return null;
  const group = kinds.find((g) => groupNames(g).includes(W.cmd));
  return group ? { W, group } : null;
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
  return { text: applyAll(src, edits), a: a + shiftBy(edits, a), b: b + shiftBy(edits, a) };
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

// The paragraphs of [a, b): one part for each paragraph's text (a selection over several), the
// paragraphs kept as LaTeX source (% rikuy: latex) left out: [[s, e]]
export function paragraphParts(src, a, b) {
  const out = [];
  for (let p = a, m, re = /\n[ \t]*\n\s*/g, n = 0; p < b && n < 2000; n++) {
    re.lastIndex = p;
    m = re.exec(src);
    const e = m && m.index < b ? m.index : b;
    if (e > p && src.slice(p, e).trim()) {
      // (a LaTeX paragraph runs from its mark to the blank line: what is before the mark is text)
      const k = markIn(src, paraStart(src, p), e);
      if (k < 0) out.push([p, e]);
      else if (k > p && src.slice(p, k).trim()) out.push([p, p + src.slice(p, k).trimEnd().length]);
    }
    p = m && m.index < b ? m.index + m[0].length : b;
  }
  return out;
}
const MARK = /^[ \t]*%[ \t]*rikuy:[ \t]*latex[ \t]*\r?$/;
// where the paragraph p is in starts: the line after a blank line (400 lines back at most)
function paraStart(src, p) {
  let ls = src.lastIndexOf('\n', p - 1) + 1;
  for (let n = 0; n < 400 && ls > 0; n++) {
    const prev = src.lastIndexOf('\n', ls - 2) + 1;
    if (!src.slice(prev, ls - 1).trim()) break;
    ls = prev;
  }
  return ls;
}
// the start of a mark's line in [s, e), or -1
function markIn(src, s, e) {
  for (let k = s, n = 0; k < e && n < 400; n++) {
    const z = src.indexOf('\n', k), end = z < 0 ? src.length : z;
    if (MARK.test(src.slice(k, end))) return k;
    if (z < 0) break;
    k = z + 1;
  }
  return -1;
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
  return classDefault(d.name);
}
// the size a class takes with none asked for
const classDefault = (cls) => (/^scr/.test(cls) || cls === 'beamer' ? 11 : 10);
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
    if (docSize(src) === pt) return edits;
    const want = pt === 11 && !items.some((x) => x.key === 'fontsize') ? null : { fontsize: pt + 'pt' };
    if (want) edits.push(...optEdits(src, d, items, want, isSize));
    return edits;
  }
  // the size it has already: nothing changes (an explicit [10pt] stays)
  if (docSize(src) === pt) return edits;
  // article <-> extarticle where the size needs it (a document already in ext keeps its class)
  const std = d.name.replace(/^ext/, ''), needExt = d.name !== 'beamer' && ![10, 11, 12].includes(pt);
  if (needExt && STD.test(d.name)) edits.push({ s: d.nameAt[0], e: d.nameAt[1], t: 'ext' + std });
  // (the class's own size with no size option there: nothing to write; anywhere else the option
  // that was there becomes the new one, the rest of the list as it was)
  if (pt === classDefault(d.name) && !items.some((x) => isSize(x.key))) return edits;
  // (one size there: its text alone changes, comments around it kept)
  const one = items.filter((x) => isSize(x.key) && x.value == null);
  if (one.length === 1) { edits.push({ s: one[0].s, e: one[0].e, t: pt + 'pt' }); return edits; }
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
  { id: 'serif', name: 'Serif', cmd: 'textrm', decl: 'rmfamily', look: 'serif' },
  { id: 'sans', name: 'Sans Serif', cmd: 'textsf', decl: 'sffamily', look: 'sans' },
  { id: 'mono', name: 'Monospace', cmd: 'texttt', decl: 'ttfamily', look: 'mono' }
];
// The packages that set a document's text font (with its math, often): the font chosen replaces
// them. Each gives the font's id in FONTS, a name of its own (a font Rikuy does not list, shown in
// the box as it is), or '' (math to go with a text font). helvet and tgheros set the sans serif
// alone, courier and tgcursor the typewriter: they stay, but where the document is in its sans
// serif (Helvetica's \familydefault).
const MAIN_PKGS = { lmodern: 'lm', newtxtext: 'times', newtxmath: '', mathptmx: 'times', times: 'times', txfonts: 'times', tgtermes: 'times', newpxtext: 'palatino', newpxmath: '',
  palatino: 'palatino', mathpazo: 'palatino', pxfonts: 'palatino', tgpagella: 'palatino', XCharter: 'charter', charter: 'charter', tgschola: 'schola', newcent: 'schola', tgbonum: 'bookman',
  bookman: 'bookman', kpfonts: 'kp', libertine: 'Linux Libertine', libertinus: 'Libertinus', 'libertinus-type1': 'Libertinus', libertinust1math: '', fourier: 'Utopia (Fourier)',
  fouriernc: 'New Century (Fourier)', utopia: 'Utopia', stix: 'STIX', stix2: 'STIX Two', mathdesign: 'Mathdesign', ebgaramond: 'EB Garamond', garamondx: 'Garamond', cochineal: 'Cochineal',
  crimson: 'Crimson', crimsonpro: 'Crimson Pro', sourceserifpro: 'Source Serif', baskervillef: 'Baskerville', erewhon: 'Erewhon', heuristica: 'Heuristica', gentium: 'Gentium',
  mlmodern: 'MLModern', cmbright: 'CM Bright', ccfonts: 'Concrete', concrete: 'Concrete', eulervm: '', newtxsf: '', mathastext: '', 'notomath': '', 'Alegreya': 'Alegreya', 'plex-serif': 'Plex Serif' };
const SANS_PKGS = new Set(['helvet', 'tgheros']);
const FONT_PKGS = new Set(Object.keys(MAIN_PKGS));
const BY_PKG = Object.fromEntries(Object.entries(MAIN_PKGS).filter(([, v]) => v && FONTS.some((f) => f.id === v)));

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
  let id = 'cm', other = '';
  for (const p of packages(src, end)) {
    for (const n of p.names) {
      const v = Object.hasOwn(MAIN_PKGS, n.name) ? MAIN_PKGS[n.name] : null;
      if (v == null || v === '') continue;
      if (BY_PKG[n.name]) { id = BY_PKG[n.name]; other = ''; } else { id = ''; other = v; }
    }
  }
  if (familyDefault(pre)) id = 'helvetica';
  if (!id) return { id: '', name: other };
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
  // (the sans serif's own packages go where the document is in its sans serif, or becomes so)
  const pre0 = stripComments(src.slice(0, end)), sansNow = !!familyDefault(pre0);
  for (const p of ps) {
    const mine = p.names.filter((n) => FONT_PKGS.has(n.name) || ((sansNow || F.sans) && SANS_PKGS.has(n.name)));
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
  return eolLike(src, edits);
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
  // (in a group of declarations: {\sffamily ..} for \textsf, so an argument's braces stay one group)
  if (G) return { cmd: G.cmd, declAlt: { cmd: G.decl, decl: true } };
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
  // (the highlighter's packages are its definition's: none where the document has an \hl of its own)
  const hlOwn = needs.some((n) => n && (n.defs || []).includes('hl')) && !src.slice(0, end).includes(OLD_HL) && hlElsewhere(src, end, o.others || []);
  for (const n of needs.filter(Boolean)) {
    if (hlOwn && (n.defs || []).includes('hl')) continue;
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
  // (a package the document loads already gets no option from here: ulem without normalem
  // underlines every \emph, and normalem added would change all of them)
  const others = o.others || [];
  for (const k of Object.keys(pkgs)) if (k !== 'xcolor' && pkgs[k] && loads(src, end, others, k)) pkgs[k] = null;
  if (Object.keys(pkgs).length) edits.push(...usePackages(src, pkgs, { end, others }));
  for (const name of defs) {
    if (name === 'hl') {
      // Word import's highlighter without a colour: the same line with one
      const at = src.indexOf(OLD_HL);
      if (at >= 0 && at < end) { edits.push({ s: at, e: at + OLD_HL.length, t: DEFS.hl }); continue; }
      // (soul's \hl, or one an \input file of the preamble defines, stays the document's)
      if (hlElsewhere(src, end, others)) continue;
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
  return eolLike(src, out);
}
// whether the preamble (or one of the preamble's \input files, others) loads a package
function loads(src, end, others, name) {
  if (packages(src, end).some((p) => p.names.some((n) => n.name === name))) return true;
  return others.some((t) => packages(t, t.length).some((p) => p.names.some((n) => n.name === name)));
}
// soul's \hl, or an \hl of the document's own in an \input file of its preamble
function hlElsewhere(src, end, others) {
  if (['soul', 'soulutf8', 'soulpos'].some((n) => loads(src, end, others, n))) return true;
  return others.some((t) => defines(t, 'hl', 'command', t.length));
}
// Lines written into a file whose lines end in CR LF end so too
export function eolLike(src, edits) {
  const nl = src.indexOf('\n');
  if (nl <= 0 || src[nl - 1] !== '\r') return edits;
  return edits.map((x) => ({ ...x, t: x.t.replace(/\r?\n/g, '\r\n') }));
}
export function hlTakesColor(src, others = []) {
  const end = preambleEnd(src);
  if (end < 0) return true;
  if (src.slice(0, end).includes(DEFS.hl)) return true;
  if (src.indexOf(OLD_HL) >= 0 && src.indexOf(OLD_HL) < end) return true;
  if (hlElsewhere(src, end, others)) return false;
  return !defines(src, 'hl', 'command', end);
}

// ---- change case ------------------------------------------------------------------------------
// Change Case rewrites only letters the page draws: the page gives the characters of the selection
// it shows (drawnChars in src/cmd/font.js: its text runs, each character with its place in the
// source), so math, keys, column specs, labels, a footnote's text behind its mark and LaTeX
// paragraphs never reach here. A letter's source is the letter itself, a letter written as a
// command (\ss, \o, \ae, \i) or an accent on one (\'e, \"{o}, \c{c}); anything else drawn (a macro's
// text) keeps its case.
const LETTER_CMDS = { ss: 'SS', SS: 'ss', o: 'O', O: 'o', ae: 'AE', AE: 'ae', oe: 'OE', OE: 'oe', aa: 'AA', AA: 'aa', l: 'L', L: 'l', dh: 'DH', DH: 'dh', th: 'TH', TH: 'th', ng: 'NG', NG: 'ng', dj: 'DJ', DJ: 'dj' };
const ACCENT = /^\\(?:[^A-Za-z\s]|[A-Za-z]+(?![A-Za-z]))\s*(\{\s*)?(?:([A-Za-z])|\\([ij])(?![A-Za-z])(?:\{\})?)\s*\}?$/;

// The case each drawn character should take: chars [{ s, e, ch, gap }] in reading order (gap: a
// word or a paragraph lies between it and the one before, 'word' or 'par'); mode 'lower', 'upper',
// 'title' (Capitalize Each Word), 'sentence', 'toggle' or 'cycle' (Shift+F3: lower, each word
// capitalised, upper); before: the drawn text before the first in its paragraph. The edits of the
// source, or null when no letter changes: { edits, mode }.
export function caseEdits(src, chars, mode, before = '', ok = null) {
  if (!chars.length) return null;
  // the drawn text, with a space where something undrawn stands between two words
  let D = '';
  const at = [];
  for (const c of chars) {
    if (c.gap === 'par') D += '\n\n'; else if (c.gap === 'word') D += ' ';
    at.push(D.length);
    D += c.ch;
  }
  if (mode === 'cycle') {
    const L = D.replace(/[^\p{L}]/gu, ''), lo = L.toLowerCase(), up = L.toUpperCase();
    mode = L === up && L !== lo ? 'lower' : L === lo ? 'title' : L === titleCase(D, before).replace(/[^\p{L}]/gu, '') ? 'upper' : 'upper';
  }
  const want = targetCase(D, mode, before);
  const edits = [];
  for (let k = 0; k < chars.length; k++) {
    const { s, e, ch } = chars[k], dir = want[at[k]];
    if (!dir || !/\p{L}/u.test(ch) || (ok && !ok.has(s))) continue;
    // (already in that case: nothing to do; ß is a small letter whose capital is \SS)
    const isUp = ch !== ch.toLowerCase() && ch === ch.toUpperCase(), isLo = ch !== ch.toUpperCase() && ch === ch.toLowerCase();
    if ((dir > 0 && !isLo) || (dir < 0 && !isUp)) continue;
    const x = letterEdit(src, s, e, dir > 0);
    if (x) edits.push(x);
  }
  return edits.length ? { edits, mode } : null;
}
// for each character of the drawn text, the case the mode asks of it: 1 capital, -1 small, 0 none
function targetCase(D, mode, before) {
  const out = [];
  let word = !before || /[\s~(\[{"'`‘“-]$/.test(before), sentence = !before.trim() || /[.!?:]\s*$/.test(before);
  for (let i = 0; i < D.length; i++) {
    const ch = D[i];
    let c = 0;
    if (/\p{L}/u.test(ch)) {
      if (mode === 'upper') c = 1;
      else if (mode === 'lower') c = -1;
      else if (mode === 'toggle') c = ch !== ch.toLowerCase() ? -1 : 1;
      else if (mode === 'title') c = word ? 1 : -1;
      else if (mode === 'sentence') c = sentence ? 1 : -1;
      word = false; sentence = false;
    } else {
      if (/[\s~(\[{"'`‘“/-]/.test(ch)) word = true;
      if (/\n/.test(ch)) sentence = true;
      if (/[.!?]/.test(ch)) sentence = 'next';
      else if (/\s/.test(ch) && sentence === 'next') sentence = true;
      else if (sentence === 'next' && !/["'’”)]/.test(ch)) sentence = false;
    }
    out.push(c);
  }
  return out;
}
// the drawn text with each word capitalised
const titleCase = (D, before) => { const t = targetCase(D, 'title', before); return D.split('').map((ch, i) => (t[i] > 0 ? ch.toUpperCase() : t[i] < 0 ? ch.toLowerCase() : ch)).join(''); };
// The edit that gives the letter drawn from [s, e) the other case (up: to capitals), or null
function letterEdit(src, s, e, up) {
  const R = src.slice(s, e);
  const flip = (c) => { const t = up ? c.toUpperCase() : c.toLowerCase(); return t.length === c.length ? t : c; };
  if ([...R].length === 1) { const t = flip(R); return t === R ? null : { s, e, t }; }
  const m = /^\\([A-Za-z]+)(?![A-Za-z])/.exec(R);
  if (m && LETTER_CMDS[m[1]] && /^\s*(?:\{\})?$/.test(R.slice(m[0].length))) {
    const isUp = m[1] === m[1].toUpperCase();
    return isUp === up ? null : { s: s + 1, e: s + 1 + m[1].length, t: LETTER_CMDS[m[1]] };
  }
  if (m && (m[1] === 'i' || m[1] === 'j') && up && /^\s*(?:\{\})?$/.test(R.slice(2))) return { s, e: s + 2, t: m[1].toUpperCase() };
  const A = ACCENT.exec(R);
  if (A) {
    if (A[2]) {
      const k = s + R.lastIndexOf(A[2]), t = flip(A[2]);
      return t === A[2] ? null : { s: k, e: k + 1, t };
    }
    if (up) { const k = s + R.lastIndexOf('\\' + A[3]); return { s: k, e: k + 2 + (src.startsWith('{}', k + 2) ? 2 : 0), t: A[3].toUpperCase() }; }
  }
  return null;
}
// The characters of [a, b) whose letters Change Case may touch, read from the source: plain text
// and the words of commands, as [{ s, e, ch, gap }] (a letter written as a command or an accent on
// one is one character). Passed over: comments, math, environments of math, code and pictures,
// \tikz, \verb, options in brackets, and the keys of commands (labels, references, citations,
// glossary and acronym keys, colours, languages, addresses, files, lengths): what Change Case does
// on the page is also kept to these, as the page draws some keys of commands it does not know.
const KEY_CMD = /ref$|^[cC]?ref|cite|^[gG]ls|^[aA]cr|^[aA]c[slp]?$|label|url|color|language|^input$|^include|graphics|^bibliograph|^new|^renew|^provide|^set|^def|^use|^add|^hyper|^pdf|inline$|^index|^ensuremath$|^font(?:size|family|spec)$|^[vh]space|^rule$|^SI$|^si$|^qty$|^unit$|^num$|^ang$|^printbibliography$|^cline$|^cmidrule$|^documentclass$|^geometry$|^pagestyle$|^thispagestyle$|^numberwithin$|^counterwithin/;
const CASE_LEAD = { href: 1, textcolor: 1, colorbox: 1, fcolorbox: 2, foreignlanguage: 1, multicolumn: 2, multirow: 2, hyperlink: 1, hyperref: 0, culine: 1, textls: 0, scalebox: 1, raisebox: 1,
  rotatebox: 1, hl: 0, makebox: 0, framebox: 0, parbox: 1, foreignquote: 1, textlang: 1, resizebox: 2 };
export function caseChars(src, a, b) {
  b = Math.min(b, a + 200000, src.length);
  const chars = [];
  let last = a, gapNext = false;
  // (the arguments passed over are read in two million characters at most in all: a stranger's
  // thousands of unclosed \cite{ would each be read to the end)
  let budget = 2e6;
  const close = (q) => {
    const o = src[q], c = o === '[' ? ']' : '}';
    for (let k = q + 1, d = 0; k < b && k < q + 20000; k++) {
      if (--budget <= 0) return -1;
      const x = src[k];
      if (x === '\\') { k++; continue; }
      if (x === o) d++; else if (x === c) { if (d === 0) return k + 1; d--; }
    }
    return -1;
  };
  // past every argument right after k ([..] and {..}), or past the options and lead ones alone
  const pass = (k, lead) => {
    for (let g = 0; g < 8 && k < b; g++) {
      const q = sp(src, k);
      if (src[q] === '[') { const z = close(q); if (z < 0) return b; k = z; continue; }
      if (src[q] !== '{' || lead <= 0) break;
      const z = close(q); if (z < 0) return b; k = z; lead--;
    }
    return k;
  };
  const push = (s, e, ch) => {
    chars.push({ s, e, ch, gap: chars.length && (gapNext || (last < s && /\s/.test(src.slice(last, s)))) ? 'word' : undefined });
    last = e; gapNext = false;
  };
  for (let i = a, n = 0; i < b && n < 400000; n++) {
    const c = src[i];
    if (c === '%') { const z = src.indexOf('\n', i); i = z < 0 || z > b ? b : z; continue; }
    if (c === '$' || (c === '\\' && (src[i + 1] === '(' || src[i + 1] === '['))) { i = skipMath(src, i, b); gapNext = true; continue; }
    if (c === '\\') {
      const m = /^\\(?:([A-Za-z]+)\*?|.)/s.exec(src.slice(i, i + 60));
      const name = m[1];
      const acc = /^\\(?:['`^"~=.]|[cvuHkdbrt](?![A-Za-z]))\s*(?:\{\s*)?(?:[A-Za-z]|\\[ij](?![A-Za-z]))\s*\}?/.exec(src.slice(i, i + 20));
      if (acc && (!acc[0].includes('{') || acc[0].endsWith('}'))) {
        const L = acc[0].replace(/^\\./, '').match(/[A-Za-z]/g);
        push(i, i + acc[0].length, L ? L[L.length - 1] : 'a');
        i += acc[0].length; continue;
      }
      if (name && (LETTER_CMDS[name] || name === 'i' || name === 'j') && !/[A-Za-z]/.test(src[i + m[0].length] || '')) {
        // (a stand-in letter of the command's case)
        push(i, i + m[0].length, name === name.toUpperCase() ? 'A' : 'a');
        i += m[0].length; continue;
      }
      let k = i + m[0].length;
      if (!name) { i = m[0] === '\\\\' ? pass(k, 0) : k; continue; }
      if (name === 'begin' || name === 'end') {
        const env = /^\\(?:begin|end)\s*\{([^{}]{1,40})\}/.exec(src.slice(i, i + 60));
        if (!env) { i = k; continue; }
        if (name === 'begin' && WHOLE.test(env[1])) { const z = src.indexOf('\\end{' + env[1] + '}', i); i = z < 0 ? b : z + 6 + env[1].length; gapNext = true; continue; }
        i = name === 'begin' ? args(src, i + env[0].length, b) : i + env[0].length; gapNext = true; continue;
      }
      if (name === 'verb') { const y = src.indexOf(src[k], k + 1); i = y < 0 ? b : y + 1; gapNext = true; continue; }
      if (name === 'tikz') { const y = src.indexOf(';', k), q = sp(src, k); i = src[q] === '{' ? pass(q, 1) : y < 0 ? b : y + 1; gapNext = true; continue; }
      if (name in CASE_LEAD) { i = pass(k, CASE_LEAD[name]); continue; }
      if (KEY_CMD.test(name)) { i = pass(k, 99); gapNext = true; continue; }
      // (any other command: its options passed over, its braces read)
      i = pass(k, 0);
      continue;
    }
    if (c === '{' || c === '}') { i++; continue; }
    push(i, i + 1, c);
    i++;
  }
  return chars;
}
// what comes before a in its paragraph, as words: whether a sentence or a word starts there
function caseBefore(src, a) {
  const raw = src.slice(Math.max(0, a - 200), a).split(/\n[ \t]*\n/).pop().replace(/%[^\n]*/g, '')
    .replace(/\\(?:begin|end)\s*\{[^{}]*\}|\\(?:item|par|noindent|maketitle)\b|\\(?:part|chapter|(?:sub)*section|paragraph)\*?\s*\{[^{}]*\}/g, '\u0001');
  return raw.slice(raw.lastIndexOf('\u0001') + 1).replace(/\\[A-Za-z]+\s*|[{}]/g, '');
}
// Change Case on the source alone, for a selection the page does not draw (and the tests).
// Returns { text, a, b } or null.
export function changeCase(src, a, b, mode) {
  const r = caseEdits(src, caseChars(src, a, b), mode, caseBefore(src, a));
  if (!r) return null;
  const text = applyAll(src, r.edits);
  return { text, a, b: Math.min(b, src.length) + text.length - src.length };
}
// The page's characters of [a, b) (from src/cmd/font.js's drawnChars) as Change Case takes them:
// only those the source also gives as letters of words may change. { text, a, b } or null.
export function changeDrawn(src, a, b, drawn, mode) {
  const ok = new Set(caseChars(src, a, b).map((c) => c.s));
  const r = caseEdits(src, drawn.chars, mode, drawn.before, ok);
  if (!r) return null;
  const text = applyAll(src, r.edits);
  return { text, a, b: b + text.length - src.length };
}
function skipMath(src, i, b) {
  const close = src[i] === '$' ? (src[i + 1] === '$' ? '$$' : '$') : src[i + 1] === '(' ? '\\)' : '\\]';
  let k = i + (close === '$' ? 1 : 2);
  for (; k < b && k < i + 20000; k++) {
    if (src.startsWith(close, k)) return k + close.length;
    if (src[k] === '\\') k++;
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
