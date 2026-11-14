// Batch B13, equations, as Word has them (GAP E1, E2, E4 to E6, I42, C4):
// - Formula (math in the line) and Equation (numbered, on a line of its own) on Home and Insert,
//   Equation a split button whose arrow is Word's equation gallery (Insert, Symbols, Equation▾);
// - Alt+= (a Mac's Control+=): a new equation, numbered on an empty line, in the line in text;
// - the Equation tab while the field is open (src/app.js's openMath and newMath): Tools (the
//   gallery with the equations saved in this browser, Numbered with its kinds, Display), Word's
//   symbol groups and its eleven structures, each written into the field at its caret and so into
//   the source as LaTeX; none of them takes the focus from the field;
// - the menu of a right click on an equation: change to inline or display, numbered or not, copy
//   as LaTeX or for Word, a label and a reference to it, save it to the gallery.
// Every change to an equation is the smallest edit of its source: \begin{equation} and
// \end{equation} renamed, \[ and \] for them, $…$ for the whole; one undo each. The pure edits
// are exported for test/equation.test.mjs.

import { register, menuItems, enabled, onInstall, inGroup, command } from '../commands.js';
import { SYMBOLS, STRUCTURES, GALLERY, SAVED_KEY, readSaved, addSaved, mathNeeds, mathSafe, fillSlots, eqMenu, eqAsk, closeEqMenu, eqMenuOpen } from '../ui/eqtab.js';
import { provides, preambleEnd } from '../preamble.js';
import { atomOfEl } from '../editor.js';
import { openMenu } from '../ui/kit.js';
import { chordText } from '../keys.js';
import { wrapSlot } from '../wordmath.js';
import { eolAt } from '../blockenv.js';

// ---- the source, as pure functions --------------------------------------------------------------
const CAP = 20000; // the most of an equation's text read (it may be a stranger's)

// What stands at the top level of a display's text, outside braces and inner environments
// (matrix, cases, aligned): rows (\\), columns (&), labels, tags, comments. Bounded.
export function topLevel(t) {
  const out = { rows: false, amp: false, label: false, tag: false, nonumber: false, comment: false, big: t.length > CAP };
  if (out.big) return out;
  let depth = 0, env = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '%') { out.comment = true; const j = t.indexOf('\n', i); if (j < 0) break; i = j; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth = Math.max(0, depth - 1); continue; }
    if (c === '&') { if (!depth && !env) out.amp = true; continue; }
    if (c !== '\\') continue;
    const n = t[i + 1];
    if (n === '\\') { if (!depth && !env) out.rows = true; i++; continue; }
    if (!/[A-Za-z]/.test(n || '')) { i++; continue; }
    let j = i + 1;
    while (j < t.length && j - i < 40 && /[A-Za-z]/.test(t[j])) j++;
    const w = t.slice(i + 1, j);
    if (w === 'begin') env++;
    else if (w === 'end') env = Math.max(0, env - 1);
    else if (!depth && !env) {
      if (w === 'label') out.label = true;
      else if (w === 'tag') out.tag = true;
      else if (w === 'nonumber' || w === 'notag') out.nonumber = true;
    }
    i = j - 1;
  }
  return out;
}

// the delimiters of an inline formula a = { s, e, is, ie }: $…$, \(…\) or the math environment
export function inlineDelims(src, a) {
  if (a.is == null || a.ie == null) return null;
  const open = src.slice(a.s, a.is), close = src.slice(a.ie, a.e);
  if ((open === '$' && close === '$') || (open === '\\(' && close === '\\)') || (/^\\begin\s*\{math\}$/.test(open) && /^\\end\s*\{math\}$/.test(close))) return { open, close };
  return null;
}

// a display's delimiters: { kind: 'env', name, ns, ne (its name in \begin{…}), es, ee (in \end{…}),
// bs, be (the whole \begin{…} token), xs (where \end starts) } or { kind: '\\[' | '$$' }
export function displayDelims(src, a) {
  const head = src.slice(a.s, Math.min(a.e, a.s + 80));
  if (head.startsWith('\\[') && src.slice(a.e - 2, a.e) === '\\]') return { kind: '\\[' };
  if (head.startsWith('$$') && src.slice(a.e - 2, a.e) === '$$') return { kind: '$$' };
  const m = /^\\begin(\s*)\{([A-Za-z]+\*?)\}/.exec(head);
  const tail = src.slice(Math.max(a.s, a.e - 80), a.e), z = /\\end(\s*)\{([A-Za-z]+\*?)\}$/.exec(tail);
  if (!m || !z || m[2] !== z[2]) return null;
  const ns = a.s + 7 + m[1].length, xs = a.e - z[0].length, es = xs + 5 + z[1].length;
  return { kind: 'env', name: m[2], ns, ne: ns + m[2].length, es, ee: es + z[2].length, bs: a.s, be: a.s + m[0].length, xs };
}

// the kinds of display the Numbered menu offers, and which take what
export const KINDS = [['equation', 'Numbered equation'], ['unnumbered', 'Unnumbered equation'], ['align', 'Aligned rows, numbered'], ['align*', 'Aligned rows, no numbers'],
  ['gather', 'Gathered rows, numbered'], ['gather*', 'Gathered rows, no numbers'], ['multline', 'One long equation on several lines, numbered'], ['multline*', 'One long equation on several lines, no number']];
const ONE_LINE = /^(equation\*?|\\\[|\$\$|displaymath)$/;
const NO_AMP = /^(equation\*?|\\\[|\$\$|displaymath|gather\*?|multline\*?)$/;
export const isNumbered = (env) => !!env && !/\*$/.test(env) && !/^(\\\[|\$\$|displaymath|math|\$)$/.test(env);
// the same kind with its number put on or taken off (unnumbered: equation* or \[, see unnumbered())
export function flipNumber(env, unnumbered) {
  if (env === 'equation') return unnumbered;
  if (/^(equation\*|\\\[|\$\$|displaymath)$/.test(env)) return 'equation';
  if (/^(align|gather|multline|flalign|alignat|eqnarray)$/.test(env)) return env + '*';
  if (/^(align|gather|multline|flalign|alignat|eqnarray)\*$/.test(env)) return env.slice(0, -1);
  return null;
}
// Why a display's text cannot be of this kind, or '' (rows in an equation, & in a gathered one)
// (labels: how many \label the display holds; a kind without a number would leave them pointing
// at nothing, the references printing ??)
export function kindWhyNot(env, from, top, labels = 0) {
  if (top.big) return 'This equation is too long to change here; edit its source.';
  if (labels && !isNumbered(env) && env !== from) return 'It has a label that references point to: without a number they would print ??. Take the label off first.';
  if (/^(alignat|eqnarray)\*?$/.test(from) && from.replace(/\*$/, '') !== env.replace(/\*$/, '')) return 'This ' + from + ' keeps its kind; only its numbers go on and off here.';
  if (ONE_LINE.test(env) && top.rows) return 'It has rows (\\\\): pick aligned, gathered or multline.';
  if (NO_AMP.test(env) && top.amp) return 'It has alignment marks (&): pick aligned rows.';
  return '';
}
// The edits that make display a (with its delimiters d) of kind env: the names in \begin and \end,
// or \[ \] for them both ways. Nothing inside moves.
export function kindEdits(src, a, d, env) {
  if (!d) return null;
  const toEnv = env !== '\\[';
  if (d.kind === 'env') {
    if (d.name === env) return [];
    if (toEnv) return [{ s: d.ns, e: d.ne, t: env }, { s: d.es, e: d.ee, t: env }];
    return [{ s: d.bs, e: d.be, t: '\\[' }, { s: d.xs, e: a.e, t: '\\]' }];
  }
  if (!toEnv) return d.kind === '\\[' ? [] : [{ s: a.s, e: a.s + 2, t: '\\[' }, { s: a.e - 2, e: a.e, t: '\\]' }];
  return [{ s: a.s, e: a.s + 2, t: '\\begin{' + env + '}' }, { s: a.e - 2, e: a.e, t: '\\end{' + env + '}' }];
}
// How this document writes a display without a number: \[ \] where amsmath is not loaded (it needs
// no package), else the one it uses more (equation* on a tie). Bounded counts.
export function unnumbered(src, ams) {
  if (!ams) return '\\[';
  const t = src.length > 500000 ? src.slice(0, 500000) : src;
  let star = 0, br = 0;
  for (let i = t.indexOf('\\begin{equation*}'); i >= 0 && star < 1000; i = t.indexOf('\\begin{equation*}', i + 1)) star++;
  for (let i = t.indexOf('\\['); i >= 0 && br < 1000; i = t.indexOf('\\[', i + 1)) if (t[i - 1] !== '\\') br++;
  return br > star ? '\\[' : 'equation*';
}

// Inline to display: $x$ becomes \begin{equation}, a line of its own for x, \end{equation}, in the
// place of $x$ alone (the sentence around it keeps its bytes). null where it is no $…$ formula.
export function toDisplayEdits(src, a, env = 'equation') {
  if (!inlineDelims(src, a)) return null;
  const x = src.slice(a.is, a.ie), nl = eolAt(src, a.s);
  const [o, c] = env === '\\[' ? ['\\[', '\\]'] : ['\\begin{' + env + '}', '\\end{' + env + '}'];
  // (a file written with CRLF keeps them)
  return [{ s: a.s, e: a.e, t: o + nl + '  ' + x + nl + c }];
}
// Display to inline: the formula's text between $ and $ (the layout toDisplayEdits writes comes off
// exactly; any other, its spaces at the ends). { edits } or { why }.
export function toInlineEdits(src, a) {
  const d = displayDelims(src, a);
  if (!d) return { why: 'This display cannot be changed here; edit its source.' };
  if (d.kind === 'env' && !/^(equation\*?|displaymath|gather\*?|multline\*?|align\*?|flalign\*?)$/.test(d.name)) return { why: 'A ' + d.name + ' keeps its kind; edit its source.' };
  const inner = src.slice(a.is, a.ie), top = topLevel(inner);
  if (top.big) return { why: 'This equation is too long to change here; edit its source.' };
  if (top.rows) return { why: 'It has rows (\\\\): a formula in the line has one.' };
  if (top.amp) return { why: 'It has alignment marks (&), which a formula in the line cannot take.' };
  // (a label at any depth: one in an aligned block inside the display counts as much)
  if (labelsIn(inner).length) return { why: 'It has a label that references point to: they would lose their number.' };
  if (top.tag || top.nonumber) return { why: 'It has a \\tag or \\nonumber, which a formula in the line cannot take.' };
  if (top.comment) return { why: 'It holds a comment (%), which would hide the closing $.' };
  const lead = inner.startsWith('\r\n  ') ? 4 : inner.startsWith('\n  ') ? 3 : 0, tail = inner.endsWith('\r\n') ? 2 : inner.endsWith('\n') ? 1 : 0;
  const x = lead && tail && inner.length >= lead + tail ? inner.slice(lead, inner.length - tail) : inner.trim();
  if (!x.trim()) return { why: 'The equation is empty.' };
  return { edits: [{ s: a.s, e: a.e, t: '$' + x + '$' }] };
}

// the labels at the top level of a display, in order (bounded)
export function labelsIn(inner) {
  const out = [], t = inner.slice(0, CAP);
  for (let m, re = /\\label\s*\{([^{}\n]{1,200})\}/g; (m = re.exec(t)) && out.length < 50;) out.push(m[1].trim());
  return out;
}
// the first eq:N no label of the document has
export function freeLabel(taken) {
  for (let n = 1; n < 100000; n++) if (!taken.has('eq:' + n)) return 'eq:' + n;
  return 'eq:' + Date.now();
}
// Brace depth at p, read from s (a paragraph's start), skipping escaped braces and comments:
// a display inside an argument (\textbf{… $x$ …}) would break it. -1 where it is too far to read.
export function braceDepth(src, s, p) {
  if (p - s > CAP) return -1;
  let d = 0;
  for (let i = s; i < p; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '%') { const j = src.indexOf('\n', i); if (j < 0 || j >= p) break; i = j; continue; }
    if (c === '{') d++; else if (c === '}') d = Math.max(0, d - 1);
  }
  return d;
}

// The environments open at p, read from s (the body's start, or 20000 characters back): their
// names, the innermost last; comments skipped; bounded. A display cannot stand in some of them
// (tabbing, lrbox, a tabular, a picture), where TeX has no paragraph to break.
export function envsAt(src, s, p) {
  s = Math.max(s, p - CAP);
  const out = [];
  for (let i = s; i < p; i++) {
    const c = src[i];
    if (c === '%') { const j = src.indexOf('\n', i); if (j < 0 || j >= p) break; i = j; continue; }
    if (c !== '\\') continue;
    const m = /^\\(begin|end)\s*\{([A-Za-z]{1,30}\*?)\}/.exec(src.slice(i, i + 50));
    if (!m) { i++; continue; }
    if (m[1] === 'begin') { if (out.length < 200) out.push(m[2]); }
    else { const k = out.lastIndexOf(m[2]); if (k >= 0) out.length = k; }
    i += m[0].length - 1;
  }
  return out;
}
export const NO_DISPLAY = new Set(['tabbing', 'lrbox', 'tabular', 'tabular*', 'tabularx', 'tabulary', 'longtable', 'array', 'picture', 'tikzpicture', 'pspicture', 'minipage*',
  'math', 'displaymath', 'equation', 'equation*', 'verbatim', 'comment']);

// a position after edits (each { s, e, t } on the text before them, in one file)
const shiftPos = (p, edits) => edits.reduce((q, x) => (x.e <= p ? q + x.t.length - (x.e - x.s) : q), p);

// ---- where the commands apply ---------------------------------------------------------------------
// where a display cannot go: a heading, the title, a cell, a caption, a footnote, styled words, a LaTeX paragraph
const tight = (at) => /^(h|ttl|cell|cap|fn)$/.test(at.ctx) || at.cell;
const eqOpen = (app) => !!app.eqPop();
const hasTarget = (app) => !!app.eqTarget();
const NOT_HERE = 'Click an equation to open it, or right click it';
const why = (fn) => (app) => { const T = app.eqTarget(); if (!T) return NOT_HERE; return fn(app, T) || ''; };
// a symbol: its LaTeX, then what it is called ("\pm plus or minus")
const symName = (s) => s.tex + ' ' + s.name;

// ---- the registry ---------------------------------------------------------------------------------
const EQ_ICON = '<path d="M3 7.5h8.5M3 12.5h8.5M14.5 5.5q-1.8 4.5 0 9M17 5.5q1.8 4.5 0 9"/>';
register(
  { id: 'formula', name: 'Formula', order: 10, title: 'Formula in the line ($ or Ctrl+M)', synonyms: ['Inline math', 'Math'], tab: 'home', group: 'insert', el: 'rb-math', label: 'Formula',
    icon: '<path d="M14.5 6V4.5h-9l5 5.5-5 5.5h9V14"/>', keys: ['Ctrl+M'], keysQuiet: ['Ctrl+Shift+M'], run: (app) => app.newMath(), palette: { k: 'math', d: 'Inline math', order: 90, act: 'math' } },
  { id: 'equation', name: 'Equation', order: 20, title: 'Numbered equation on a line of its own (Alt+= on an empty line)', synonyms: ['Display math', 'Numbered equation', 'Insert equation'],
    tab: 'home', group: 'insert', el: 'rb-eq', label: 'Equation', icon: EQ_ICON,
    when: (app, at) => !!at && !tight(at) && !at.sty && at.ctx !== 'tex' && !(at.c.ghost && app.ghost.tex), run: (app) => app.newDisplayMath(),
    palette: { k: 'equation', d: 'Numbered equation', order: 80, act: 'equation' } },
  // Insert's Equation, Word's split button: as Word's Insert Equation and Alt+= (its control, for a
  // phone or a mouse), numbered on an empty line, in the line in text; its arrow ("Equation
  // options") the equation gallery with its formulas drawn (src/ui/eqtab.js; see the ribbon's click
  // below). Home's Equation stays one button that makes a numbered one (the row's room is measured
  // for it, and agents know it so), and the search box lists that one.
  { id: 'equation-insert', name: 'Equation', order: 20, kind: 'split', title: 'Insert new equation (Alt+=): numbered on an empty line, in the line in text; the arrow: the equation gallery',
    tab: 'insert', group: 'symbols', el: 'ri-eq', label: 'Equation', icon: EQ_ICON, searchable: false, keysElsewhere: ['Alt+='],
    when: (app, at) => enabled(app, 'insert-equation', at), run: (app, args, at) => app.eqAltEquals(at), menuItems: (app) => app.eqGalleryItems() },
  // Word's Alt+= (Option+= types ≠ on a Mac: Control+= there). It takes over the numbered
  // equation from Ctrl+Shift+E, which is free until Track Changes (B10) takes it.
  { id: 'insert-equation', name: 'Insert new equation', title: 'Insert new equation (Alt+=): numbered, on a line of its own, on an empty line; in the line in text', synonyms: ['New equation', 'Equation', 'Math', 'Alt+='],
    keys: ['Alt+='], mac: { 'Alt+=': 'Control+=' }, when: (app, at) => !!at && !(at.c.ghost && app.ghost && app.ghost.tex), run: (app, args, at) => app.eqAltEquals(at) },

  // ---- the Equation tab: Tools --------------------------------------------------------------------
  // (on the tab while the field is open; from the search box, with the caret on the page, the gallery
  // of new equations, as Insert's Equation options)
  { id: 'eq-gallery', name: 'Equation gallery', kind: 'menu', tab: 'equation', group: 'tools', order: 10, label: 'Equation', title: 'Equation gallery: Word\'s built in equations and those you saved, put in at the caret',
    synonyms: ['Built in equations', 'Quadratic formula', 'Binomial theorem', 'Pythagorean theorem', 'Fourier series', 'Taylor expansion'], icon: '<path d="M4 6.5h12M7.5 6.5v9M12.5 6.5v7.4c0 1.1.6 1.6 1.6 1.6"/>',
    when: (app, at) => eqOpen(app) || (!!at && !(at.c.ghost && app.ghost && app.ghost.tex)), whyNot: () => 'Click in the text first', run: (app) => app.eqOpenMenu('eq-gallery') },
  { id: 'eq-numbered', name: 'Numbered', kind: 'split', tab: 'equation', group: 'tools', order: 20, label: 'Numbered', title: 'A number for this equation, or none (equation and equation*, align and align*); the arrow: aligned, gathered, multline',
    synonyms: ['Equation number', 'Number equation', 'Unnumbered', 'equation*', 'align', 'gather', 'multline'], icon: '<path d="M6 4q-3 6 0 12M14 4q3 6 0 12M9 7.5l1.5-1.2v7.7"/>',
    when: (app) => eqOpen(app) && !app.eqWhyNumber(), whyNot: (app) => (eqOpen(app) ? app.eqWhyNumber() : 'Open an equation first'),
    on: (app) => { const T = app.eqPop() && app.eqTarget(); return T && T.info ? T.display && isNumbered(T.env) : false; },
    run: (app) => app.eqToggleNumber(), menuItems: (app) => app.eqKindItems() },
  { id: 'eq-display', name: 'Display', kind: 'toggle', tab: 'equation', group: 'tools', order: 30, label: 'Display', title: 'Display: the equation on a line of its own; off, in the line with the text (inline)',
    synonyms: ['Change to display', 'Change to inline', 'Inline', 'Professional'], icon: '<path d="M3 4h14M3 16h14M6.5 10h7"/>',
    when: (app) => eqOpen(app) && !app.eqWhySwitch(), whyNot: (app) => (eqOpen(app) ? app.eqWhySwitch() : 'Open an equation first'),
    on: (app) => { const P = app.eqPop(); if (!P) return false; const T = app.eqTarget(); return T && T.info ? T.display : !!P.display; },
    run: (app) => app.eqSwitch() },

  // ---- Symbols and Structures: each a gallery -----------------------------------------------------
  // (icons, their names in their tooltips, as Word's symbol gallery is: eighteen labels do not fit a row)
  ...SYMBOLS.map((g, k) => ({ id: 'eq-sym-' + g.id, name: g.name, kind: 'menu', tab: 'equation', group: 'symbols', order: 10 + k, title: g.name + ': ' + g.title, icon: g.icon,
    synonyms: ['Symbol', 'Symbols'], when: eqOpen, whyNot: () => 'Open an equation first', run: (app) => app.eqOpenMenu('eq-sym-' + g.id) })),
  ...STRUCTURES.map((g, k) => ({ id: 'eq-' + g.id, name: g.name, kind: 'menu', tab: 'equation', group: 'structures', order: 10 + k, title: g.name + ': ' + g.title.replace(/^[^:]*: /, ''), icon: g.icon,
    synonyms: ['Structure', 'Structures'], when: eqOpen, whyNot: () => 'Open an equation first', run: (app) => app.eqOpenMenu('eq-' + g.id) })),

  // ---- the right click menu of an equation (and the search box while one is open or was right clicked)
  { id: 'eq-to-inline', name: 'Change to inline', eqShow: (T) => T.display, title: 'The equation in the line with the text: $…$', synonyms: ['Inline', 'Change to Inline'], menu: { equation: 10 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info && T.display && !app.eqWhySwitch(); }, whyNot: why((app, T) => (T.display ? app.eqWhySwitch() : 'It is in the line already')), run: (app) => app.eqSwitch(false) },
  { id: 'eq-to-display', name: 'Change to display', eqShow: (T) => !T.display, title: 'The equation on a line of its own: \\begin{equation}', synonyms: ['Display', 'Change to Display'], menu: { equation: 11 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info && !T.display && !app.eqWhySwitch(); }, whyNot: why((app, T) => (!T.display ? app.eqWhySwitch() : 'It is on a line of its own already')), run: (app) => app.eqSwitch(true) },
  { id: 'eq-to-numbered', name: 'Change to numbered', eqShow: (T) => T.display && !isNumbered(T.env), title: 'A number for this equation (equation, align)', synonyms: ['Number', 'Equation number'], menu: { equation: 12 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info && T.display && !isNumbered(T.env) && !app.eqWhyNumber(); }, whyNot: why((app, T) => (!T.display ? 'A formula in the line has no number' : isNumbered(T.env) ? 'It is numbered already' : app.eqWhyNumber())), run: (app) => app.eqToggleNumber() },
  { id: 'eq-to-unnumbered', name: 'Change to unnumbered', eqShow: (T) => T.display && isNumbered(T.env), title: 'No number for this equation (equation*, align*, or \\[ \\])', synonyms: ['Remove number', 'Unnumbered'], menu: { equation: 13 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info && T.display && isNumbered(T.env) && !app.eqWhyNumber(); }, whyNot: why((app, T) => (!T.display || !isNumbered(T.env) ? 'It has no number' : app.eqWhyNumber())), run: (app) => app.eqToggleNumber() },
  { id: 'eq-label', name: 'Add label', eqShow: (T) => T.display && !labelsIn(T.inner).length, title: 'A label (\\label{eq:1}) that references and Equation reference point to', synonyms: ['Label equation', 'Bookmark'], menu: { equation: 20 },
    when: (app) => !app.eqWhyLabel(), whyNot: (app) => app.eqWhyLabel(), run: (app) => app.eqAddLabel() },
  { id: 'eq-copy-ref', name: 'Copy reference', eqShow: (T) => T.display && labelsIn(T.inner).length > 0, title: 'Copies \\eqref{…} to its label, to paste where the text refers to it', synonyms: ['eqref', 'Reference'], menu: { equation: 21 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info && labelsIn(T.inner).length > 0; }, whyNot: why(() => 'It has no label: Add label first'), run: (app) => app.eqCopyRef() },
  { id: 'eq-copy-latex', name: 'Copy as LaTeX', title: 'Copies the equation\'s LaTeX source', synonyms: ['Copy source', 'Copy LaTeX'], menu: { equation: 30 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info; }, whyNot: why(() => ''), run: (app) => app.eqCopyLatex() },
  { id: 'eq-copy-word', name: 'Copy for Word', title: 'Copies the equation as MathML: Word, PowerPoint and OneNote paste it as an editable equation', synonyms: ['Copy MathML'], menu: { equation: 31 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info; }, whyNot: why(() => ''), run: (app) => { const T = app.eqTarget(); return app.copyEquation(T.inner, T.display); } },
  { id: 'eq-save', name: 'Save as new equation', title: 'Keeps this equation (or the part selected in it) in the Equation gallery of this browser', synonyms: ['Save to equation gallery', 'Save selection to equation gallery'], menu: { equation: 32 },
    when: hasTarget, whyNot: () => NOT_HERE, run: (app) => app.eqSave() },
  { id: 'eq-edit', name: 'Edit equation', title: 'Opens the equation in its field', synonyms: ['Open equation'], menu: { equation: 1 },
    when: (app) => { const T = app.eqTarget(); return !!T && !!T.info && !T.pop && !T.ro; }, whyNot: why((app, T) => (T.pop ? 'It is open' : 'It comes from a macro: edit its definition')), run: (app) => { const T = app.eqTarget(); app.eqCtx = null; app.openAtom(T.el, T.info); } }
);

// ---- the methods ------------------------------------------------------------------------------------
export const methods = {
  // the open equation popover (its field), or null
  eqPop() { const P = this.pop; return P && P.el && P.el.classList.contains('pop-math') ? P : null; },

  // The equation the tab and the menu act on: the one open in the field, else the one a right click
  // was on. { pop, el, info, f, s, e, is, ie, inner, display, env, ro } (no info for a formula still
  // being typed, a new one with nothing in the source yet)
  eqTarget() {
    const P = this.eqPop();
    let el = null;
    if (P) {
      if (P.anchorPos) el = P.anchor && P.anchor.isConnected && atomOfEl(P.anchor) ? P.anchor : this.findAtomEl(P.anchorPos);
    } else {
      el = this.eqCtx && this.eqCtx.isConnected ? this.eqCtx : null;
      if (!el) return null;
    }
    const T = el ? this.eqInfo(el) : null;
    if (T) { T.pop = P; return T; }
    return P ? { pop: P, display: !!P.display } : null;
  },
  // an equation's element of the page as a target
  eqInfo(el) {
    const info = atomOfEl(el);
    if (!info || info.a.kind !== 'math' || info.s == null) return null;
    const src = this.src(info.f), display = !!info.a.display;
    let env = null;
    if (display) { const d = displayDelims(src, info); env = d ? (d.kind === 'env' ? d.name : d.kind) : info.a.env; }
    else if (inlineDelims(src, info)) env = '$';
    return { pop: null, el, info, f: info.f, s: info.s, e: info.e, is: info.is, ie: info.ie, inner: info.is == null ? '' : src.slice(info.is, info.ie), display, env, ro: !!info.a.ro };
  },

  // whether a package's commands are there (the preamble, its \input files, the class: src/preamble.js)
  eqHas(pkg) { return provides(this.src(this.main), pkg, this.preambleOthers()); },
  // the \usepackage edits for these packages, those the document lacks (src/preamble.js through packageEdits)
  eqPkgEdits(names) {
    const need = [...names].filter((n) => !this.eqHas(n));
    return need.length ? this.packageEdits(need) : [];
  },

  // ---- why not -----------------------------------------------------------------------------------
  eqWhySwitch() {
    const T = this.eqTarget();
    if (!T) return NOT_HERE;
    if (T.ro) return 'It comes from a macro: edit its definition';
    if (!T.info) return T.display ? '' : this.eqDisplayFits(null) ? '' : 'A display cannot go here (a heading, a caption, a cell, a footnote or styled words)';
    const src = this.src(T.f);
    if (T.display && this.eqBlankNew(T)) return '';
    if (T.display) { const r = toInlineEdits(src, T); return r.why || ''; }
    if (!inlineDelims(src, T)) return 'Only $…$ math changes to a display here';
    return this.eqDisplayFits(T) ? '' : 'A display cannot go here (a heading, a caption, a cell, a footnote, a LaTeX paragraph, inside braces, or in tabbing, a box or a picture)';
  },
  // whether a display can stand where this inline formula is (T), or where a new one is typed (null)
  eqDisplayFits(T) {
    const P = this.eqPop();
    const el = T ? T.el : null;
    if (!el) return !!(P && P.eqWhere && P.eqWhere.display);
    const near = el.closest('[data-ctx]'), ctx = near ? near.dataset.ctx : '';
    if (/^(h|ttl|cell|cap|fn)$/.test(ctx) || el.closest('td, th, [data-y], .it.tex, .fn')) return false;
    // (and the reason said for it covers these: see eqWhySwitch)
    const B = T.info.B;
    if (!B) return false;
    const src = this.src(T.f);
    if (braceDepth(src, B.s, T.s) !== 0) return false;
    // (in tabbing, an lrbox, a tabular, a picture: no paragraph for a display to break; the review's
    // \begin{tabbing} A \= $x$ \\ written as a display gave a TeX error)
    const body = T.f === this.main ? Math.max(0, preambleEnd(src)) : 0;
    return !envsAt(src, body, T.s).some((x) => NO_DISPLAY.has(x));
  },
  eqWhyNumber() {
    const T = this.eqTarget();
    if (!T) return NOT_HERE;
    if (T.ro) return 'It comes from a macro: edit its definition';
    if (!T.info || !T.display) return this.eqWhySwitch();
    const d = displayDelims(this.src(T.f), T);
    if (!d) return 'This display cannot be changed here; edit its source';
    const to = flipNumber(d.kind === 'env' ? d.name : d.kind, this.eqUnnumbered());
    if (!to) return 'A ' + (d.name || d.kind) + ' has no numbered form here';
    return kindWhyNot(to, d.name || d.kind, topLevel(T.inner), labelsIn(T.inner).length) || '';
  },
  eqWhyLabel() {
    const T = this.eqTarget();
    if (!T || !T.info) return NOT_HERE;
    if (T.ro) return 'It comes from a macro: edit its definition';
    if (!T.display) return 'A formula in the line has no number to refer to: change it to display';
    if (!isNumbered(T.env)) return 'It has no number: change it to numbered first';
    if (labelsIn(T.inner).length) return 'It has a label already: Copy reference';
    // (an empty new equation goes when its field closes, and its label with it)
    if (this.eqBlankNew(T)) return 'Type the equation first: an empty new one goes when its field closes';
    const top = topLevel(T.inner);
    if (top.rows) return 'Each row has its own number: put \\label{…} in its row';
    if (!displayDelims(this.src(T.f), T)) return 'This display cannot be changed here; edit its source';
    return '';
  },
  eqUnnumbered() { return unnumbered(this.src(this.main), this.eqHas('amsmath')); },

  // ---- changes to the equation ------------------------------------------------------------------
  // build(src, T) gives the edits of the target's file ({ edits } or { why }), committed with the
  // packages they need as one step. Where the field was open on it, the field closes first (what
  // it holds is written, and any package its symbols need), the edits are made on the source as it
  // is then, and the field opens again on what the equation has become.
  eqApply(build, pkgs, kind) {
    const P = this.eqPop();
    let T = this.eqTarget();
    if (!T || !T.info) return false;
    if (P) {
      const f = T.f, before = this.src(f);
      this.closePop(true, true);
      const after = this.src(f);
      let s = T.s;
      // (a package line the closing field added comes before the equation in the same file)
      if (after !== before) { let k = 0; const n = Math.min(before.length, after.length); while (k < n && before.charCodeAt(k) === after.charCodeAt(k)) k++; if (k <= s) s += after.length - before.length; }
      const el = this.findAtomEl({ f, s, kind: 'math' });
      T = el && this.eqInfo(el);
      if (!T) return false;
    }
    const reopen = (at) => {
      const el = this.findAtomEl({ f: T.f, s: at, kind: 'math' });
      const info = el && atomOfEl(el);
      if (!info) return;
      this.openMath(el, info);
      this.eqTab();
    };
    const r = build(this.src(T.f), T);
    if (!r || !r.edits || !r.edits.length) { if (r && r.why) this.toast(r.why); if (P) reopen(T.s); return false; }
    // (and what the formula itself needs, in the same step: undo never lands on a formula without
    // the package it uses)
    const pk = this.eqPkgEdits(new Set([...(pkgs || []), ...mathNeeds(T.inner)]));
    const all = [...r.edits.map((x) => ({ f: T.f, ...x })), ...pk];
    const mine = all.filter((x) => x.f === T.f);
    const s2 = shiftPos(T.s, mine), e2 = shiftPos(T.e, mine);
    this.closeGroup();
    this.commit(all, P ? null : { f: T.f, p: e2, bias: 1 }, kind);
    this.closeGroup();
    if (pk.length) this.toast('Added ' + pk.map((x) => x.t.trim()).join(', ') + ' for this kind of equation.');
    if (P) reopen(s2);
    return true;
  },

  // a new equation the field was opened for, nothing typed in it yet (it goes when the field closes)
  eqBlankNew(T) { return !!(T && T.pop && T.pop.eqNew && T.display && T.info && !T.inner.trim()); },

  // Inline or display (to: true display, false inline, undefined the other). A new formula with
  // nothing written yet becomes a new display, and back.
  eqSwitch(to) {
    const P = this.eqPop();
    if (P && P.flush) P.flush();
    if (P && P.held && P.held()) { this.toast('Finish the formula first: it cannot be written as it is.'); return false; }
    const T = this.eqTarget();
    if (!T) return false;
    const no = this.eqWhySwitch();
    if (no) { this.toast(no + '.'); return false; }
    if (to === undefined) to = !T.display;
    if (to === !!T.display) return false;
    if (!T.info || this.eqBlankNew(T)) {
      // (the field is open on nothing yet: a new formula of the other kind in its place; a new
      // display given up empty goes as it closes, and the caret is where it was)
      this.closePop();
      if (to) this.newDisplayMath(); else this.newMath();
      return true;
    }
    if (to) return this.eqApply((src, X) => ({ edits: toDisplayEdits(src, X, 'equation') }), [], 'eq-display');
    return this.eqApply((src, X) => toInlineEdits(src, X), [], 'eq-inline');
  },

  // The display's kind (equation, equation*, align…); from a formula in the line, a display of that kind
  eqSetKind(env) {
    const P = this.eqPop();
    if (P && P.flush) P.flush();
    if (P && P.held && P.held()) { this.toast('Finish the formula first: it cannot be written as it is.'); return false; }
    const T = this.eqTarget();
    if (!T) return false;
    if (env === 'unnumbered') env = this.eqUnnumbered();
    if (this.eqBlankNew(T)) {
      // (a new equation still empty: made again of this kind; amsmath's kinds bring it once typed in)
      if (T.env === env) return false;
      this.closePop();
      this.newDisplayMath(env);
      return true;
    }
    if (!T.info || !T.display) {
      const no = this.eqWhySwitch();
      if (no) { this.toast(no + '.'); return false; }
      if (!T.info) return this.eqSwitch(true);
      return this.eqApply((src, X) => ({ edits: toDisplayEdits(src, X, env) }), mathNeeds('', env), 'eq-kind');
    }
    const d0 = displayDelims(this.src(T.f), T);
    if (d0 && (d0.kind === 'env' ? d0.name : d0.kind) === env) return false;
    return this.eqApply((src, X) => {
      const d = displayDelims(src, X);
      const no = d ? kindWhyNot(env, d.kind === 'env' ? d.name : d.kind, topLevel(X.inner), labelsIn(X.inner).length) : 'This display cannot be changed here; edit its source.';
      return no ? { why: no } : { edits: kindEdits(src, X, d, env) };
    }, mathNeeds('', env), 'eq-kind');
  },
  eqToggleNumber() {
    const T = this.eqTarget();
    if (!T) return false;
    if (!T.info || !T.display) return this.eqSetKind('equation');
    const d = displayDelims(this.src(T.f), T);
    const to = d && flipNumber(d.kind === 'env' ? d.name : d.kind, this.eqUnnumbered());
    return to ? this.eqSetKind(to) : false;
  },
  // the Numbered button's menu: the kinds, the current one checked, those its text cannot take off
  eqKindItems() {
    const T = this.eqTarget();
    const src = T && T.info ? this.src(T.f) : '';
    const d = T && T.info && T.display ? displayDelims(src, T) : null;
    const cur = d ? (d.kind === 'env' ? d.name : d.kind) : null, top = topLevel(T && T.info ? T.inner : '');
    const un = this.eqUnnumbered();
    return KINDS.map(([env, name]) => {
      const real = env === 'unnumbered' ? un : env;
      let no;
      if (!T) no = NOT_HERE;
      else if (!T.info || !T.display) no = this.eqWhySwitch() || kindWhyNot(real, '$', top);
      else no = d ? kindWhyNot(real, cur, top, labelsIn(T.inner).length) : 'This display cannot be changed here';
      const on = !!cur && (cur === real || (env === 'unnumbered' && /^(equation\*|\\\[|\$\$|displaymath)$/.test(cur)));
      return { name, title: no || (real === '\\[' ? 'Written \\[ … \\]' : 'Written \\begin{' + real + '}'), checked: on, radio: true, disabled: !!no, run: () => this.eqSetKind(env) };
    });
  },

  // a label for the display, \label{eq:N}, right after \begin{…}
  eqAddLabel() {
    const no = this.eqWhyLabel();
    if (no) { this.toast(no + '.'); return false; }
    const P = this.eqPop();
    if (P && P.flush) P.flush();
    if (P && P.held && P.held()) { this.toast('Finish the formula first: it cannot be written as it is.'); return false; }
    const key = freeLabel(new Set(this.model && this.model.labels ? this.model.labels.keys() : []));
    const ok = this.eqApply((src, X) => { const d = displayDelims(src, X); return d && d.kind === 'env' ? { edits: [{ s: d.be, e: d.be, t: '\\label{' + key + '}' }] } : { why: 'This display cannot be changed here; edit its source.' }; }, [], 'eq-label');
    if (ok) this.toast('Labelled ' + key + '. Copy reference gives \\eqref{' + key + '}.');
    return ok;
  },
  async eqCopyRef() {
    const T = this.eqTarget();
    const key = T && T.info ? labelsIn(T.inner)[0] : null;
    if (!key) return false;
    // (\eqref is amsmath's; without it the number in parentheses)
    const ref = this.eqHas('amsmath') ? '\\eqref{' + key + '}' : '(\\ref{' + key + '})';
    await this.eqClip(ref, ref);
    return true;
  },
  async eqCopyLatex() {
    const T = this.eqTarget();
    if (!T || !T.info) return false;
    await this.eqClip(this.src(T.f).slice(T.s, T.e), 'the equation\'s LaTeX');
    return true;
  },
  async eqClip(text, what) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
    }
    this.eqCopied = text;
    this.toast(ok ? 'Copied ' + what + '.' : 'Copy was blocked here. Open the source pane and select the text.');
    return ok;
  },

  // ---- inserting ---------------------------------------------------------------------------------
  // LaTeX into the open field at its caret (a template's first slot takes the selection); the
  // packages it needs are added when the field closes, if it still holds them
  eqInsert(tex) {
    const P = this.eqPop();
    if (!P || !P.insertTex) return false;
    const bad = this.eqSafe(tex);
    if (bad) { this.toast('This equation cannot be put in as it is. ' + bad); return false; }
    this.eqAddNeeds(P, mathNeeds(tex));
    P.insertTex(tex);
    return true;
  },
  // The packages what the tab puts in needs, added now in the field's undo step, which the text
  // needing them joins a moment later: no undo lands on a formula without the package it uses
  // (an unused line, the formula taken out again, stays: other text may use it). The field's
  // places in the source move with the new line (P.shiftBy).
  eqAddNeeds(P, names) {
    const pk = this.eqPkgEdits(names);
    if (!pk.length) return;
    if (P.flush) P.flush();
    const top = this.hist[this.hist.length - 1];
    if (top && top.open && top.kind === P.session) top.time = Date.now();
    const keep = document.activeElement;
    this.commit(pk, null, P.session);
    if (P.shiftBy) P.shiftBy(pk);
    if (keep && keep.isConnected && keep !== document.activeElement) keep.focus({ preventScroll: true });
    this.positionPop();
    this.toast('Added ' + pk.map((x) => x.t.trim()).join(', ') + ' for this equation.');
  },
  // the \usepackage edits a kind of display needs (equation*, align, gather, multline: amsmath)
  eqKindPkgs(env) { return env === 'equation' || env === '\\[' ? [] : this.eqPkgEdits(mathNeeds('', env)); },
  // Where a new equation from the gallery goes, taken when its menu opens (a font the menu's
  // formulas bring makes the page lay out again, which drops the blank paragraph): the blank
  // paragraph's place, or the caret's or selection's, and whether a display can stand there
  eqPlace() {
    const at = this.ribbonAt(), c = at && this.caretNow();
    if (!c || c.crossFile) return null;
    // (and the file's text as it is then: a share's merge or the source pane may change it while
    // the menu is open, and the place would be stale)
    if (c.ghost) {
      const g = this.ghost;
      return { ghost: { f: g.f, pos: g.pos, style: g.style, raw: this.ghostRaw() }, display: !this.ghostRaw() && !tight(at) && !at.sty && at.ctx !== 'tex', text: this.src(g.f) };
    }
    return { f: c.f, a: c.a, b: c.b, display: false, text: this.src(c.f) };
  },
  // Word's gallery from Insert (no field open): a new equation holding it, opened in its field:
  // numbered on an empty line, in the line in text
  eqInsertNew(tex, place) {
    place = place || this.eqPlace();
    if (!place || this.stale) return false;
    if (place.text != null && this.src(place.ghost ? place.ghost.f : place.f) !== place.text) { this.toast('The document changed while the gallery was open: click where the equation goes and pick it again.'); return false; }
    // (a saved equation is written as it is: it must stay a formula, src/ui/eqtab.js's mathSafe)
    const top = topLevel(String(tex)), bad = (top.rows || top.amp ? 'It has rows or alignment marks (\\\\, &).' : '') || this.eqSafe(tex);
    if (bad) { this.toast('This equation cannot be put in as it is. ' + bad); return false; }
    const g = place.ghost;
    // (a blank line of a LaTeX paragraph: the formula is its source, typed as such)
    if (g && g.raw) { if (this.ghost) this.ghostInsert('$' + tex + '$'); return !!this.ghost; }
    const pk = this.eqPkgEdits(mathNeeds(tex));
    let f, s;
    this.removeGhost();
    this.closeGroup();
    if (g && place.display) {
      f = g.f;
      // (a file written with CRLF keeps them)
      const nl = eolAt(this.src(f), g.pos);
      const t = nl + '\\begin{equation}' + nl + '  ' + tex + nl + '\\end{equation}' + nl;
      this.commit([{ f, s: g.pos, e: g.pos, t }, ...pk], { f, p: shiftPos(g.pos, pk.filter((x) => x.f === f)) + t.length }, 'insert');
      s = g.pos + nl.length;
    } else if (g) {
      const src = this.src(g.f);
      let nlB = 0; for (let k = g.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
      const pre = g.pos === 0 ? '' : '\n'.repeat(Math.max(0, 2 - nlB));
      const [qo, qc] = g.style === 'quote' ? ['\\begin{quote}\n', '\n\\end{quote}'] : ['', ''];
      f = g.f;
      this.commit([{ f, s: g.pos, e: g.pos, t: pre + qo + '$' + tex + '$' + qc + '\n\n' }, ...pk], null, 'insert');
      s = g.pos + pre.length + qo.length;
    } else {
      f = place.f;
      const del = place.a !== place.b ? this.deletionEdits(f, place.a, place.b) : [];
      this.commit([...del.map((x) => ({ f, ...x })), { f, s: place.a, e: place.a, t: '$' + tex + '$' }, ...pk], null, 'insert');
      s = place.a;
    }
    this.closeGroup();
    s = shiftPos(s, pk.filter((x) => x.f === f));
    if (pk.length) this.toast('Added ' + pk.map((x) => x.t.trim()).join(', ') + ' for this equation.');
    const el = this.findAtomEl({ f, s, kind: 'math' });
    const info = el && atomOfEl(el);
    if (info) { this.openMath(el, info); this.eqTab(); }
    return true;
  },
  // Alt+=: numbered on an empty line, in the line in text (Word's)
  eqAltEquals(at) {
    if (!at) return false;
    if (at.c.ghost && !this.ghostRaw() && !tight(at) && !at.sty && at.ctx !== 'tex') this.newDisplayMath();
    else this.newMath();
    return true;
  },
  // the Equation tab in front, as Word brings it with a new equation
  eqTab() {
    if (!this.rbBuilt || !this.eqPop()) return;
    this.ribbonSync();
    if (this.rbTabs.includes('equation')) this.selectTab('equation');
  },
  // the focus back in the open field (or its LaTeX box)
  eqFocus() { const P = this.eqPop(); if (P && P.focusIn) P.focusIn(); },

  // The field closing (its onClose, after its text is written): its menus go, and the ribbon then
  // drops the Equation tab. (Packages came with what needed them: eqAddNeeds.)
  eqClosed() {
    closeEqMenu();
    this.ribbonSoon();
  },

  // ---- saved equations (E5) -------------------------------------------------------------------
  // (only those that stay a formula and that KaTeX draws: one kept by an older version, or written
  // into the store by hand, is left out)
  eqSavedList() { let l = []; try { l = readSaved(localStorage.getItem(SAVED_KEY)); } catch (e) { l = []; } return l.filter((x) => !this.eqSafe(x.tex)); },
  // Why this LaTeX cannot go into a formula as it is (src/ui/eqtab.js's mathSafe), or that KaTeX
  // cannot draw it; '' where it can
  eqSafe(tex) {
    // (a template's slots are empty groups as far as TeX and KaTeX go)
    const t = String(tex).replace(/#[?@]/g, '{}');
    const bad = mathSafe(t);
    if (bad) return bad;
    let r = null;
    try { r = this.renderer.katex(t, false); } catch (e) { r = { err: String(e) }; }
    return r && r.err && !r.loading ? 'The page cannot draw it: ' + String(r.err).slice(0, 120) : '';
  },
  eqSave() {
    const T = this.eqTarget();
    if (!T) return false;
    const P = this.eqPop();
    let tex = P && P.selectedTex ? P.selectedTex() : null;
    if (!tex) tex = P && P.mathText ? P.mathText() : T.inner;
    tex = String(tex || '').replace(/\\label\s*\{[^{}\n]{0,200}\}/g, '').replace(/\\(nonumber|notag)(?![A-Za-z])/g, '').trim();
    if (!tex) { this.toast('The equation is empty.'); return false; }
    const top = topLevel(tex), bad = (top.rows || top.amp ? 'It has rows or alignment marks (\\\\, &): select one row in it and save that.' : '') || this.eqSafe(tex);
    if (bad) { this.toast('This equation cannot be kept as it is. ' + bad); return false; }
    const anchor = this.eqAnchor('eq-gallery');
    eqAsk(this, anchor, {
      title: 'Save as new equation', value: tex.slice(0, 40),
      back: () => (this.eqPop() ? this.eqFocus() : this.ribbonBack()),
      onSave: (name) => {
        const list = addSaved(this.eqSavedList(), name, tex);
        try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { this.toast('This browser keeps nothing for this page.'); return; }
        this.toast('Saved "' + list[0].name + '" to the Equation gallery.');
      }
    });
    return true;
  },
  eqForget(name) {
    const list = this.eqSavedList().filter((x) => x.name !== name);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { /* nothing kept */ }
  },

  // ---- the field's side (src/app.js's openMath, newMath and attachField call these) -------------
  // A popover of an equation gets what the tab needs: the LaTeX box as the place things go in until
  // the field is there (or where the field cannot hold the formula), the focus given back to it,
  // and which of the two had it last; the tab, its row of tabs and its menus as its own (a press
  // there does not close it).
  eqWire(P, ta) {
    P.lastIn = 'tex';
    P.el.addEventListener('focusin', (e) => { P.lastIn = e.target === ta ? 'tex' : 'field'; });
    P.focusIn = () => ta.focus();
    P.insertTex = (tex) => {
      const a = ta.selectionStart, b = ta.selectionEnd;
      const { text, caret } = fillSlots(tex, ta.value.slice(a, b));
      ta.focus();
      ta.setRangeText(text, a, b, 'end');
      ta.setSelectionRange(a + caret, a + caret);
      ta.dispatchEvent(new Event('input'));
    };
    P.inside = (t) => !!(t && t.closest && t.closest('#rp-equation, #rb-tabs, #rb-tabsel, #rb-collapse, .eq-menu') && !t.closest('.rb-dl'));
  },
  // the field arrived: what the tab puts in goes there, at its caret, in the field's own spelling
  // (D, its dialect); a template's first slot takes what is selected, as Word's typing does
  eqWireField(P, mf, D, ta, focus) {
    const box = P.insertTex;
    P.focusIn = () => (P.lastIn === 'tex' && document.activeElement !== mf ? ta.focus() : focus());
    P.insertTex = (tex) => {
      if (document.activeElement === ta || (P.lastIn === 'tex' && document.activeElement !== mf)) { box(tex); return; }
      let t = D.toField(tex);
      if (t.includes('#?') && !mf.selectionIsCollapsed) t = wrapSlot(t);
      try { mf.insert(t, { format: 'latex', insertionMode: 'replaceSelection', selectionMode: t.includes('#?') ? 'placeholder' : 'after', mode: 'math' }); }
      catch (e) { box(tex); return; }
      mf.dispatchEvent(new Event('input'));
      focus();
    };
    P.selectedTex = () => {
      try { if (mf.selectionIsCollapsed) return null; return D.fromField(mf.getValue(mf.selection, 'latex')).trim() || null; } catch (e) { return null; }
    };
  },
  // whether a new display could stand where the caret is (Equation's own rule)
  eqCanDisplayHere(at) { return enabled(this, 'equation', at); },

  // ---- the galleries -------------------------------------------------------------------------------
  // The gallery as the split button's menu of the kit lists it (a folded group, the search box): names only
  eqGalleryItems() {
    const P = this.eqPop(), place = P ? null : this.eqPlace();
    const put = (tex) => () => (P ? this.eqInsert(tex) : this.eqInsertNew(tex, place));
    return [...GALLERY.map((g) => ({ name: g.name, title: g.tex, run: put(g.tex) })), ...this.eqSavedList().map((g) => ({ name: g.name, title: g.tex, run: put(g.tex) })),
      null, { name: 'Insert new equation', keys: 'Alt+=', run: () => this.runCommand('insert-equation') }];
  },
  // where a menu of the tab opens: its button where it shows, else the button its group folded into
  eqAnchor(id) {
    const c = command(id);
    const tab = c && c.tab === 'equation' ? 'equation' : this.rbTab;
    const ids = [c && c.el ? c.el : 'rc-' + id, ...(c && c.also ? c.also.map((a) => a.el) : [])];
    for (const x of ids) { const b = document.getElementById(x); if (b && b.offsetParent) return b; }
    if (c) { const gb = document.getElementById('rg-' + tab + '-' + c.group); if (gb && gb.offsetParent) return gb; }
    return null;
  },
  // A gallery of the tab (or the equation gallery) beside its button. From the keyboard (the focus
  // in the ribbon) its first item takes the focus; a press leaves it in the field.
  eqOpenMenu(id, anchor) {
    anchor = anchor || this.eqAnchor(id);
    const P = this.eqPop();
    // (a press with the focus in the field leaves it there; from the ribbon's keys, the page or the
    // search box the menu takes it, as the kit's menus do)
    const a = document.activeElement;
    const focus = !(P && a && P.el.contains(a));
    const back = () => (this.eqPop() ? this.eqFocus() : this.ribbonBack());
    // (with no field open the menu takes the focus: the place on the page is kept, and given back first)
    const sel = getSelection();
    if (!P && sel.rangeCount && this.root.contains(sel.anchorNode)) this.rbRange = sel.getRangeAt(0).cloneRange();
    const place = P ? null : this.eqPlace();
    const put = (tex) => () => { if (P) this.eqInsert(tex); else { this.ribbonBack(); this.eqInsertNew(tex, place); } };
    let sections, o;
    if (id === 'eq-gallery' || id === 'equation') {
      const saved = this.eqSavedList();
      sections = [{ name: 'Built in', items: GALLERY.map((g) => ({ name: g.name, label: g.name, tex: g.tex, display: true, title: g.tex, run: put(g.tex) })) }];
      if (saved.length) sections.push({ name: 'Saved in this browser', items: saved.map((g) => ({ name: g.name, label: g.name, tex: g.tex, display: true, title: g.tex, run: put(g.tex) })) });
      const more = [];
      if (P) more.push({ name: 'Save as new equation', label: 'Save as new equation…', title: 'Keeps this equation (or the part selected in it) here, for every document', cls: 'eq-act', run: () => this.eqSave() });
      else more.push({ name: 'Insert new equation', label: 'Insert new equation', title: 'Alt+= (Mac: Control+=)', cls: 'eq-act', run: () => { this.ribbonBack(); this.runCommand('insert-equation'); } });
      if (saved.length) more.push({ name: 'Remove a saved equation', label: 'Remove a saved equation…', title: 'Takes one out of this browser\'s gallery', cls: 'eq-act', run: () => this.eqForgetMenu(anchor) });
      sections.push({ name: '', items: more });
      o = { label: 'Equation gallery', list: true, cls: 'eq-gal' };
    } else if (id.startsWith('eq-sym-')) {
      const g = SYMBOLS.find((x) => 'eq-sym-' + x.id === id);
      sections = [{ name: g.name, items: g.items.map((s) => ({ name: symName(s), tex: s.tex, title: s.tex + ': ' + s.name, run: put(s.tex) })) }];
      o = { label: g.name, cols: 10, cls: 'eq-syms' };
    } else {
      const g = STRUCTURES.find((x) => 'eq-' + x.id === id);
      if (!g) return false;
      sections = g.sections.map((sec) => ({ name: sec.name, items: sec.items.map((s) => ({ name: s.name, tex: s.tex, display: true, title: s.name + ': ' + s.tex.replace(/#\?/g, '□'), run: put(s.tex) })) }));
      o = { label: g.name, cols: id === 'eq-matrix' || id === 'eq-bracket' || id === 'eq-largeop' || id === 'eq-integral' || id === 'eq-limit' ? 4 : 5, cls: 'eq-structs' };
    }
    eqMenu(this, anchor, sections, { ...o, focus, back, pop: !P });
    return true;
  },
  eqForgetMenu(anchor) {
    const saved = this.eqSavedList();
    eqMenu(this, anchor, [{ name: 'Remove a saved equation', items: saved.map((g) => ({ name: 'Remove ' + g.name, label: g.name, tex: g.tex, display: true, title: g.tex, run: () => { this.eqForget(g.name); this.toast('Removed "' + g.name + '" from the Equation gallery.'); } })) }],
      { label: 'Remove a saved equation', list: true, cls: 'eq-gal', focus: true, pop: !this.eqPop(), back: () => (this.eqPop() ? this.eqFocus() : this.ribbonBack()) });
  },
  // A folded group of the tab, as one menu of its commands (the kit's would close the field)
  eqGroupMenu(gb) {
    const gid = gb.id.replace(/^rg-equation-/, '');
    const at = this.ribbonAt();
    const items = [];
    for (const { c, p } of inGroup('equation', gid)) {
      const on = c.on ? !!c.on(this) : undefined;
      items.push({ name: p.name, label: p.name + (c.kind === 'menu' ? '…' : ''), checked: c.kind === 'menu' ? undefined : on, disabled: !enabled(this, c, at), title: c.title,
        run: () => { if (c.kind === 'menu') this.eqOpenMenu(c.id, gb); else this.runCommand(c.id); } });
      if (c.kind === 'split') for (const it of c.menuItems(this)) items.push({ ...it, label: it.name });
    }
    eqMenu(this, gb, [{ name: '', items }], { label: gb.getAttribute('aria-label'), list: true, focus: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#ribbon')), back: () => this.eqFocus() });
  },
  // a split button's arrow on the tab (Numbered options), as a menu that keeps the field open
  eqSplitMenu(x) {
    const id = x.id.replace(/-x$/, '');
    const b = document.getElementById(id);
    const c = b && command(b.dataset.cmd);
    if (!c || !c.menuItems) return;
    eqMenu(this, x, [{ name: '', items: c.menuItems(this).filter(Boolean).map((it) => ({ ...it, label: it.name })) }],
      { label: c.name, list: true, focus: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#ribbon')), back: () => this.eqFocus() });
  },

  // The right click menu of an equation on the page: the registry's equation items
  // (only what applies to its kind: an inline formula has no number, a display is no inline formula;
  // a line between edit, kind, label, and copy and save, as the ranks' tens go)
  eqContextMenu(el, x, y, touch = false) {
    this.eqCtx = el;
    const at = this.ribbonAt(), T = this.eqTarget();
    const items = [];
    let last = null;
    for (const c of menuItems(['equation'])) {
      if (!c || (c.eqShow && T && !c.eqShow(T))) continue;
      const band = Math.floor(c.menu.equation / 10);
      if (last !== null && band !== last) items.push(null);
      last = band;
      const off = !enabled(this, c, at);
      let title = c.title;
      if (off && c.whyNot) { try { title = c.whyNot(this, at) || c.title; } catch (e) { title = c.title; } }
      // (the equation is the one right clicked, given to the command as it runs; closed with
      // nothing picked, none is: a command from the search box later must not act on it)
      items.push({ name: c.name, title, keys: chordText((c.keys || [])[0]), disabled: off, run: () => { this.ribbonBack(); this.eqCtx = el; try { this.runCommand(c.id); } finally { if (this.eqCtx === el) this.eqCtx = null; } } });
    }
    // (a finger has no right click to give again: no such line under a long press)
    if (!touch) items.push(null, { name: 'Right click again for the browser\'s menu', title: 'Or hold Shift as you right click', disabled: true, cls: 'mi-hint' });
    openMenu(this, new DOMRect(x, y, 0, 0), items, { label: 'Context menu', cls: 'pop-ctx eq-ctx', onClose: () => { if (this.eqCtx === el) this.eqCtx = null; } });
    return true;
  }
};

// ---- what the page needs once the ribbon is there --------------------------------------------------
onInstall((app) => {
  const rb = document.getElementById('ribbon'), top = document.getElementById('rb-top');
  // The tab's folded groups and split arrows open the tab's own menus: the kit's are popovers,
  // and the app keeps one popover at a time (the field's). The Equation button's arrow opens the
  // gallery with its formulas drawn.
  if (rb) rb.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.matches('#rp-equation .rb-gbtn')) { e.preventDefault(); e.stopImmediatePropagation(); app.eqGroupMenu(t); }
    else if (t.matches('#rp-equation .rb-x')) { e.preventDefault(); e.stopImmediatePropagation(); app.eqSplitMenu(t); }
    else if (t.id === 'ri-eq-x') { e.preventDefault(); e.stopImmediatePropagation(); app.eqOpenMenu('equation', t); }
  }, true);
  // Escape on the tab (or its row of tabs) goes back to the field, not to the page
  const esc = (e) => {
    if (e.key !== 'Escape' || !app.eqPop() || eqMenuOpen()) return;
    if (!e.target.closest('#rp-equation, #rb-tabs, #rb-tabsel')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    app.eqFocus();
  };
  if (rb) rb.addEventListener('keydown', esc, true);
  if (top) top.addEventListener('keydown', esc, true);
  // a right click on an equation: its own menu (Shift, or a second right click, give the browser's;
  // a long press on a touch screen the system's)
  let wasOpen = false, touch = 0;
  document.addEventListener('mousedown', (e) => { if (e.button === 2) wasOpen = !!(app.pop && app.pop.el.classList.contains('pop-ctx')); }, true);
  app.root.addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch' ? Date.now() : 0; }, true);
  app.root.addEventListener('contextmenu', (e) => {
    const el = e.target.closest && e.target.closest('.atom');
    const info = el && atomOfEl(el);
    if (!info || info.a.kind !== 'math') return;
    if (e.shiftKey || wasOpen) return;
    e.preventDefault(); e.stopPropagation();
    // (a long press of a finger opened it already, or will: see below)
    if (touch && Date.now() - touch < 2000) { if (!app.pop || !app.pop.el.classList.contains('eq-ctx')) { app.eqHeld = true; app.eqContextMenu(el, e.clientX, e.clientY, true); } return; }
    if (app.pop) app.closePop(true);
    app.eqContextMenu(el, e.clientX, e.clientY);
  }, true);
  // the keyboard's way: an equation Backspace selected (armed), then Shift+F10 or the menu key
  document.addEventListener('keydown', (e) => {
    if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = app.armed && app.armed.el && app.armed.el.isConnected ? app.armed.el : null;
    const info = el && atomOfEl(el);
    if (!info || info.a.kind !== 'math' || !app.root.contains(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const r = el.getBoundingClientRect();
    app.eqContextMenu(el, r.left, r.bottom);
    const first = app.pop && app.pop.el.querySelector('[role^=menuitem]:not([aria-disabled])');
    if (first) first.focus();
  }, true);
  // A long press on an equation (a phone has no right click): its menu, as Word's on a touch
  // screen; the system's menu and the tap that would open the field are left out. A finger
  // that moves (a scroll) or lifts first is a tap or a scroll as before.
  let lp = null;
  const endLong = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  app.root.addEventListener('pointerdown', (e) => {
    endLong();
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const el = e.target.closest && e.target.closest('.atom');
    const info = el && atomOfEl(el);
    if (!info || info.a.kind !== 'math') return;
    const x = e.clientX, y = e.clientY;
    lp = { x, y, t: setTimeout(() => {
      lp = null; app.eqHeld = true;
      if (app.pop && app.pop.el.classList.contains('eq-ctx')) return;
      if (app.pop) app.closePop(true);
      app.eqContextMenu(el, x, y, true);
    }, 500) };
  }, true);
  app.root.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) endLong(); }, true);
  for (const k of ['pointerup', 'pointercancel']) app.root.addEventListener(k, endLong, true);
  // (the touch that ended in a long press is no tap: it opens no field, and the system's own menu
  // after it does not come; the next touch is one of its own)
  document.addEventListener('pointerdown', () => { app.eqHeld = false; }, true);
  const heldOn = (e) => app.eqHeld && e.target.closest && e.target.closest('#pages .atom');
  for (const k of ['mousedown', 'mouseup', 'click']) document.addEventListener(k, (e) => { if (heldOn(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('contextmenu', (e) => { if (heldOn(e)) e.preventDefault(); }, true);
  // what a right click chose lasts until the page is pressed or typed on again
  app.root.addEventListener('mousedown', (e) => { if (e.button !== 2) app.eqCtx = null; }, true);
  app.root.addEventListener('keydown', () => { app.eqCtx = null; }, true);
  // a menu of the tab goes with the field
});
