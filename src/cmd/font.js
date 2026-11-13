// Batch B1, character formatting: Home's Font group as Word's. The font and size boxes (the
// document's font and base size at a caret, the selection's with one), Increase and Decrease Font
// Size, Change Case, Clear All Formatting; Bold, Italic, Underline (with its styles and colour),
// Strikethrough, Subscript, Superscript, Text Highlight Color, Font Color; More Font Effects
// (small and all caps, double strikethrough, border, shading, enclosed, ruby) and the Font dialog
// (Ctrl+D, src/ui/fontdialog.js); the Format Painter in the Clipboard group; *bold* and _italic_
// as they are typed. Each writes the standard LaTeX a person writes (\uline, \sout,
// \textsubscript, \textcolor, {\large ...}, \hl[green]{...}), recognises the forms written by hand
// (\textbf, {\bfseries ...}, \bf; \underline; {\color{red} ...}) and takes off exactly what is
// there. The edits themselves are src/charfmt.js's, on strings; here they are committed, one
// commit for each action, the preamble's lines (ulem, xcolor, the highlighter's definition) in it.

import { register, command, onInstall, onInsertText } from '../commands.js';
import { groupNames, mapPos } from '../wrap.js';
import * as F from '../charfmt.js';
import { openMenu, colorPicker, BASE_COLORS, CARET } from '../ui/kit.js';
import { $, mk } from '../ui/dom.js';
import { docClass } from '../preamble.js';
import { segOfSpan } from '../editor.js';
import { BLOCKS } from '../render.js';
import { openFontDialog, openRubyDialog } from '../ui/fontdialog.js';

const SVG = (paths) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + paths + '</svg>';
const can = (app, at) => !!at && !at.c.ghost && at.ctx !== 'tex';
const WHY = 'Click in the text of the page first (a LaTeX paragraph is formatted in its source).';
// the wrappers around the caret or the selection, read from the source once for each look at the
// ribbon (every toggle asks): one walk back for all the kinds, the forms written by hand among them
const chainAt = (app, at) => { const m = at.memo || (at.memo = {}); if (!m.chain) m.chain = F.chainAt(app.src(at.c.f), at.c.a, at.c.b); return m.chain; };
// a block of cells selected (methods.blockCells), read once for each look at the ribbon
const blockOf = (app, at) => { const m = at.memo || (at.memo = {}); if (!('block' in m)) m.block = app.blockCells(at); return m.block; };
// (a block of more cells than this is not read cell by cell for a button's look, which says off
// past them: allOn's own limit of parts for a look; a toggle reads every cell)
const BLOCK_MAX = 400;
// whether a cell's words [a, b) have the kind, read in the cell alone (s, e: between its &), as
// the cell is formatted (fmtCommit): a cell is a group of its own, and a read of the whole text
// went back 20 000 characters from each cell
const cellOn = (t, [a, b, s, e], group, max) => F.allOn(t.slice(s, e), a - s, b - s, group, max);
// (a block of more cells than this is not formatted: each cell is a run of its own, about a
// third of a millisecond, and a stranger's table may hold a hundred thousand)
const BLOCK_CELLS = 5000;
// on with the caret in words that have a wrapper of the group; a block of cells: all its cells
const on = (group) => (app, at) => {
  if (!can(app, at)) return false;
  const cells = blockOf(app, at);
  if (cells && cells.length > 1) { const t = app.src(at.c.f); return cells.length <= BLOCK_MAX && cells.every((x) => cellOn(t, x, group)); }
  const names = groupNames(group);
  return chainAt(app, at).some((x) => names.includes(x.W.cmd));
};
// (the forms of each kind are src/wrap.js's GROUPS, extended in src/charfmt.js: a button and its pressed state agree)
const STYLE_GROUP = { textbf: 'bold', emph: 'italic', underline: 'underline', uline: 'underline', texttt: 'mono' };

// Word's highlighter colours, as xcolor's own names (no option needed), with Word's names
export const HIGHLIGHTS = [['yellow', 'Yellow'], ['green', 'Bright Green'], ['cyan', 'Turquoise'], ['magenta', 'Pink'], ['blue', 'Blue'], ['red', 'Red'],
  ['teal', 'Teal'], ['violet', 'Violet'], ['olive', 'Dark Yellow'], ['gray', 'Gray 50%'], ['lightgray', 'Gray 25%'], ['black', 'Black']];
const HEX = Object.fromEntries(BASE_COLORS);

// the look of a toggle (code's own markup: never a document's)
const G = (inner, cls = '') => '<span class="fg' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + inner + '</span>';
const ICON = {
  grow: G('A<i class="fg-up" aria-hidden="true"></i>', 'fg-grow'),
  shrink: G('A<i class="fg-down" aria-hidden="true"></i>', 'fg-shrink'),
  caseG: G('Aa', 'fg-case'),
  strike: G('ab', 'fg-strike'),
  sub: G('x<sub>2</sub>', 'fg-sub'),
  sup: G('x<sup>2</sup>', 'fg-sup'),
  highlight: G(SVG('<path d="M6.5 11.5l5.4-7.2 3.2 2.4-5.4 7.2-3.6 1z"/><path d="M6.5 11.5l-1.6 2.2 1.3 1 1.2-.4"/>') + '<i class="fg-bar" aria-hidden="true"></i>', 'fg-hl'),
  color: G('A<i class="fg-bar" aria-hidden="true"></i>', 'fg-color')
};

// ---- registry -------------------------------------------------------------------------------
register(
  // the boxes: drawn here (render), kept current by sync
  { id: 'font-name', name: 'Font', el: 'rb-font', role: 'combobox', kind: 'custom', tab: 'home', group: 'font', order: 1, keys: ['Ctrl+Shift+F'],
    title: 'Font (Ctrl+Shift+F): the document\'s font, or with text selected the font of that text',
    synonyms: ['Font family', 'Typeface', 'Document font', 'Serif', 'Sans serif', 'Monospace', 'Times', 'Palatino', 'Helvetica'],
    render: (app) => app.fontBox('font'), sync: (app, at) => app.fontBoxSync('font', at), when: can, whyNot: () => WHY, run: (app) => app.fontBoxOpen('font') },
  { id: 'font-size', name: 'Font Size', el: 'rb-size', role: 'combobox', kind: 'custom', tab: 'home', group: 'font', order: 2,
    title: 'Font Size: the document\'s base size, or with text selected the size of that text (a number of points, or a size of LaTeX)',
    synonyms: ['Size', 'Point size', 'Document size', 'Base size', 'large', 'small'],
    render: (app) => app.fontBox('size'), sync: (app, at) => app.fontBoxSync('size', at), when: can, whyNot: () => WHY, run: (app) => app.fontBoxOpen('size') },
  { id: 'grow-font', name: 'Increase Font Size', order: 3, tab: 'home', group: 'font', glyph: ICON.grow, keys: ['Ctrl+Shift+>', 'Ctrl+]'], mac: { 'Ctrl+]': false },
    title: 'Increase Font Size (Ctrl+Shift+>): the next size of LaTeX, \\small to \\normalsize to \\large', synonyms: ['Grow Font', 'Bigger'], when: can, whyNot: () => WHY, run: (app) => app.growFont(1) },
  { id: 'shrink-font', name: 'Decrease Font Size', order: 4, tab: 'home', group: 'font', glyph: ICON.shrink, keys: ['Ctrl+Shift+<', 'Ctrl+['], mac: { 'Ctrl+[': false },
    title: 'Decrease Font Size (Ctrl+Shift+<): the size before, \\large to \\normalsize to \\small', synonyms: ['Shrink Font', 'Smaller'], when: can, whyNot: () => WHY, run: (app) => app.growFont(-1) },
  { id: 'change-case', name: 'Change Case', order: 5, tab: 'home', group: 'font', kind: 'menu', glyph: ICON.caseG, keysElsewhere: ['Shift+F3'],
    title: 'Change Case (Shift+F3 goes from lowercase to Capitalize Each Word to UPPERCASE): rewrites the letters, not the commands', synonyms: ['UPPERCASE', 'lowercase', 'Sentence case', 'Capitalize', 'Title case', 'Toggle case'],
    when: can, whyNot: () => WHY, run: (app, args) => (args && args.mode ? app.changeCase(args.mode) : app.caseMenu()) },
  // Shift+F3: the case in turn, lowercase, then Capitalize Each Word, then UPPERCASE (the button's menu has each)
  { id: 'change-case-cycle', name: 'Change Case in turn', keys: ['Shift+F3'], searchable: false, title: 'Change Case in turn (Shift+F3)', when: can, run: (app) => app.changeCase('cycle') },
  { id: 'clear-formatting', name: 'Clear All Formatting', order: 6, tab: 'home', group: 'font', icon: '<path d="M5 15.5L8.6 5h1.8l2.3 6.6M6.4 11.6h4.4"/><path d="M12.6 13.2l3.8 3.8M16.4 13.2l-3.8 3.8"/>',
    title: 'Clear All Formatting: takes bold, italic, colours, sizes and fonts off the selection, and an alignment off its paragraph', synonyms: ['Clear Formatting', 'Remove formatting', 'Plain text'],
    when: can, whyNot: () => WHY, run: (app) => app.clearFormatting(true) },
  { id: 'clear-char-formatting', name: 'Clear Character Formatting', keys: ['Ctrl+Space'], mac: { 'Ctrl+Space': false },
    title: 'Clear Character Formatting (Ctrl+Space): bold, italic, colours, sizes and fonts off the selection', synonyms: ['Reset character', 'Plain text'],
    when: can, whyNot: () => WHY, run: (app) => app.clearFormatting(false) },

  { id: 'bold', name: 'Bold', order: 10, title: 'Bold (Ctrl+B)', tab: 'home', group: 'font', el: 'rb-b', kind: 'toggle', glyph: '<b aria-hidden="true">B</b>', keys: ['Ctrl+B'], menu: { selection: 20 },
    keysQuiet: ['Ctrl+Shift+B'], synonyms: ['Strong', 'textbf'], when: can, on: on('bold'), run: (app) => app.fmtToggle('bold'),
    palette: { k: 'textbf', d: 'Bold', order: 60, t: { open: '\\textbf{', close: '}' } } },
  { id: 'italic', name: 'Italic', order: 20, title: 'Italic (Ctrl+I)', tab: 'home', group: 'font', el: 'rb-i', kind: 'toggle', glyph: '<i aria-hidden="true">I</i>', keys: ['Ctrl+I'], menu: { selection: 30 },
    keysQuiet: ['Ctrl+Shift+I'], synonyms: ['Emphasis', 'emph', 'textit'], when: can, on: on('italic'), run: (app) => app.fmtToggle('italic'),
    palette: { k: 'emph', d: 'Emphasis', order: 50, t: { open: '\\emph{', close: '}' } } },
  { id: 'underline', name: 'Underline', order: 30, title: 'Underline (Ctrl+U): \\uline, which breaks across lines; the arrow for double, wave, dashed, dotted and a colour', tab: 'home', group: 'font', el: 'rb-u', kind: 'split', glyph: '<u aria-hidden="true">U</u>', keys: ['Ctrl+U'], keysQuiet: ['Ctrl+Shift+U'],
    synonyms: ['underline', 'uline', 'Double underline', 'Wave underline', 'Underline color'], when: can, on: on('underline'), run: (app, args) => (args && args.cmd ? app.fmtSet('underline', { cmd: args.cmd }) : app.fmtToggle('underline')),
    menuItems: (app, at) => app.underlineMenu(at) },
  { id: 'strikethrough', name: 'Strikethrough', order: 40, title: 'Strikethrough (Ctrl+Shift+X): \\sout', tab: 'home', group: 'font', kind: 'toggle', glyph: ICON.strike, keys: ['Ctrl+Shift+X'],
    synonyms: ['Strike', 'Cross out', 'sout'], when: can, on: on('strike'), run: (app) => app.fmtToggle('strike') },
  { id: 'subscript', name: 'Subscript', order: 50, title: 'Subscript (Ctrl+,): \\textsubscript', tab: 'home', group: 'font', kind: 'toggle', glyph: ICON.sub, keys: ['Ctrl+,'],
    synonyms: ['textsubscript', 'Lower'], when: can, on: on('sub'), run: (app) => app.fmtToggle('sub', { other: 'sup' }) },
  { id: 'superscript', name: 'Superscript', order: 60, title: 'Superscript (Ctrl+.): \\textsuperscript', tab: 'home', group: 'font', kind: 'toggle', glyph: ICON.sup, keys: ['Ctrl+.'],
    synonyms: ['textsuperscript', 'Raise', 'Exponent'], when: can, on: on('sup'), run: (app) => app.fmtToggle('sup', { other: 'sub' }) },
  { id: 'highlight', name: 'Text Highlight Color', order: 70, title: 'Text Highlight Color (Ctrl+Alt+H): \\hl, in yellow or the colour picked last', tab: 'home', group: 'font', kind: 'split', glyph: ICON.highlight, keys: ['Ctrl+Alt+H'],
    synonyms: ['Highlight', 'Highlighter', 'Marker', 'hl'], when: can, whyNot: () => WHY, on: on('highlight'),
    run: (app, args) => app.highlight(args && 'color' in args ? args.color : undefined), menuItems: (app, at) => app.highlightMenu(at) },
  { id: 'font-color', name: 'Font Color', order: 80, title: 'Font Color: \\textcolor, in the colour picked last; the arrow for every colour', tab: 'home', group: 'font', kind: 'split', glyph: ICON.color,
    synonyms: ['Text color', 'Colour', 'textcolor'], when: can, whyNot: () => WHY,
    run: (app, args) => app.fontColor(args && 'pick' in args ? args.pick : undefined), menuItems: (app, at) => [{ name: 'Font Colors…', title: 'Every colour: Word\'s, xcolor\'s, dvipsnames and any other', run: () => app.fontColorPicker(at) }] },
  { id: 'font-more', name: 'More Font Effects', order: 90, tab: 'home', group: 'font', kind: 'menu', icon: '<path d="M5.5 10h.01M10 10h.01M14.5 10h.01"/>',
    title: 'More Font Effects: small caps, all caps, double strikethrough, border, shading, enclosed characters, ruby', synonyms: ['Effects', 'Text effects'],
    when: can, whyNot: () => WHY, run: (app) => app.moreMenu() },
  // (Word's launcher at the group's corner: here More Font Effects' last item, the right click menu and Ctrl+D)
  { id: 'font-dialog', name: 'Font Settings', keys: ['Ctrl+D'],
    title: 'Font… (Ctrl+D): every character format in one dialog, with a preview, and the spacing, scale and position of letters', synonyms: ['Font dialog', 'Font…', 'Character spacing', 'Advanced font'],
    menu: { selection: 80, text: 80 }, when: can, whyNot: () => WHY, run: (app) => openFontDialog(app) },

  // More Font Effects' commands (also in the search box, and some on keys)
  { id: 'small-caps', name: 'Small Caps', title: 'Small Caps (Ctrl+Shift+K): \\textsc', keys: ['Ctrl+Shift+K'], synonyms: ['textsc', 'Small capitals'], when: can, on: on('smallcaps'), run: (app) => app.fmtToggle('smallcaps') },
  { id: 'all-caps', name: 'All Caps', title: 'All Caps (Ctrl+Shift+A): \\MakeUppercase, the letters stay as typed', keys: ['Ctrl+Shift+A'], synonyms: ['MakeUppercase', 'Capitals'], when: can, on: on('allcaps'), run: (app) => app.fmtToggle('allcaps') },
  { id: 'double-strikethrough', name: 'Double Strikethrough', title: 'Double Strikethrough: two lines through (\\dsout, defined once in the preamble with ulem)', synonyms: ['dsout', 'Double strike'], when: can, on: on('dstrike'), run: (app) => app.fmtToggle('dstrike') },
  { id: 'char-border', name: 'Character Border', title: 'Character Border: a frame round the words (\\fbox)', synonyms: ['Border', 'fbox', 'Box'], when: can, on: on('border'), run: (app) => app.fmtToggle('border') },
  { id: 'char-shading', name: 'Character Shading', title: 'Character Shading: grey behind the words (\\colorbox{lightgray} on a word; \\hl[lightgray] on words, which can break across lines)', synonyms: ['Shading', 'colorbox', 'Background'], when: can,
    on: (app, at) => on('shading')(app, at) || (can(app, at) && chainAt(app, at).some((x) => x.W.cmd === 'hl' && x.W.opt === 'lightgray')),
    run: (app, args) => app.charShading(args && args.color) },
  { id: 'enclose-chars', name: 'Enclose Characters', title: 'Enclose Characters: a circle round a character (\\textcircled)', synonyms: ['Circled', 'textcircled', 'Enclosed'], when: can, on: on('enclose'), run: (app) => app.fmtToggle('enclose') },
  { id: 'phonetic-guide', name: 'Phonetic Guide', title: 'Phonetic Guide: a reading over the selected characters (ruby: \\ruby{base}{reading})', synonyms: ['Ruby', 'Furigana', 'Pinyin', 'ruby'],
    when: (app, at) => can(app, at) && !at.c.collapsed, whyNot: () => 'Select the characters the reading goes over.', run: (app) => openRubyDialog(app) },

  { id: 'format-painter', name: 'Format Painter', order: 40, tab: 'home', group: 'clipboard', kind: 'toggle', icon: '<path d="M4.5 3.5h9v3.4h-9z"/><path d="M13.5 5.2h2v3.6H9.6v2.7"/><path d="M8.6 11.5h2v5h-2z"/>',
    title: 'Format Painter: copies the formatting where the caret is to the next text you select (double click: to all until Escape)', synonyms: ['Copy formatting', 'Paste formatting', 'Paint format'],
    when: (app, at) => !!app.fpaint || can(app, at), on: (app) => !!app.fpaint, resync: true, run: (app) => app.formatPainter() },

  { id: 'typewriter', name: 'Typewriter', title: 'Typewriter text: \\texttt', synonyms: ['Monospace', 'Code', 'texttt'], when: can, on: on('mono'), run: (app) => app.fmtToggle('mono'),
    palette: { k: 'texttt', d: 'Typewriter', order: 70, t: { open: '\\texttt{', close: '}' } } }
);

// ---- the edits ----------------------------------------------------------------------------
export const methods = {
  // The caret's file, the selection and the steps (functions of text, a and b, see charfmt.js)
  // done as one commit, the preamble's lines with it. false when nothing could change.
  fmtCommit(steps, o = {}) {
    const at = o.at || this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost || this.texHere()) return false;
    // (Select all: the main file's body, not the page's last drawn character, which may be a
    // footnote's, and the whole of each file it reads in that the page draws (\input, \include);
    // a selection over two files has a caret for its place, so Select all is read off the page)
    const whole = this.wholeDoc ? this.wholeDoc() : null;
    const f = whole ? this.main : c.f, src0 = this.src(f);
    let st = { text: src0, a: c.a, b: c.b, f };
    // (the words of a body or a file, not the blank lines around them)
    const words = (t, a, b) => { while (a < b && /\s/.test(t[a])) a++; while (b > a && /\s/.test(t[b - 1])) b--; return [a, b]; };
    if (whole) { const [a, b] = words(src0, whole.s, whole.e); st = { text: src0, a, b, f }; }
    const more = whole ? [...new Set([...this.root.querySelectorAll('.it[data-b]')].map((el) => (BLOCKS.get(+el.dataset.b) || {}).f))].filter((x) => x && x !== f && this.files.has(x)) : [];
    // (a caret in a word: the word, as Word formats it; o.word 'inside' wants the caret inside it,
    // not at its ends, where what is typed next takes the format)
    if (o.word && c.collapsed && !whole) { const w = F.wordAt(src0, c.a); if (w && (o.word !== 'inside' || (w[0] < c.a && c.a < w[1]))) st = { text: src0, a: w[0], b: w[1], word: c.a - w[0], f }; }
    // (a block of cells: each cell's words; the steps see the block as it was, block.cells in
    // block.text, to choose once for all of them; o.one: one run over the selection that reads it)
    const cells = whole ? null : this.blockCells(at);
    if (cells && cells.length > BLOCK_CELLS) { this.toast('That block has more than ' + BLOCK_CELLS + ' cells: select fewer rows to format them.'); return false; }
    if (cells) st = { ...st, a: cells[0][0], b: cells[cells.length - 1][1], block: { text: src0, cells, memo: {} } };
    const needs = [];
    let r = null;
    const run = (s0) => {
      let x = s0;
      for (const step of steps) {
        r = step(x.text, x.a, x.b, x);
        if (!r) continue;
        if (r.error) { this.toast(r.error === 'crosses' ? 'That selection crosses structure. Select text inside one paragraph or cell.' : r.error); return null; }
        x = { ...x, ...r };
        if (r.need) needs.push(...[].concat(r.need));
      }
      return x;
    };
    if (cells && cells.length > 1 && !o.one) {
      // each cell on its own text, the last first: a cell is a group of its own in TeX (its &
      // closes what it opened), so its words and every wrapper of them are inside it; and a
      // column of 3000 cells read the whole text back from each cell (6 s)
      const T0 = st.text, out = [];
      let x = st, a0 = 0, b0 = 0;
      for (let k = cells.length - 1; k >= 0; k--) {
        const [a, b, s, e] = cells[k];
        const y = run({ ...x, text: T0.slice(s, e), a: a - s, b: b - s });
        if (!y) return false;
        out.push({ s, e, t: y.text });
        // (the last cell's end, then moved by each edit before it)
        b0 = k === cells.length - 1 ? s + y.b : b0 + y.text.length - (e - s);
        if (!k) a0 = s + y.a;
        x = y;
      }
      const parts = [];
      let p = 0;
      for (const z of out.reverse()) { parts.push(T0.slice(p, z.s), z.t); p = z.e; }
      parts.push(T0.slice(p));
      st = { ...x, text: parts.join(''), a: a0, b: b0 };
    } else st = run(st);
    if (!st) return false;
    const main = this.main, edits = [];
    for (const x of more) {
      const t0 = this.src(x), [a0, b0] = words(t0, 0, t0.length), y = run({ text: t0, a: a0, b: b0, f: x });
      if (!y) return false;
      const dx = F.diffEdit(t0, y.text);
      if (dx) edits.push({ f: x, ...dx });
    }
    let text = st.text, shift = 0, mtext = f === main ? null : this.src(main);
    // the preamble's lines for what was written, then what the document itself takes (its font and
    // size, from the Font dialog): each on the text the one before left, all before the selection
    const others = needs.length && this.preambleOthers ? this.preambleOthers() : [];
    const stages = [(t) => (needs.length ? F.preambleFor(t, needs, { others }) : []), ...(o.doc || [])];
    for (const stage of stages) {
      const cur = f === main ? text : mtext;
      const pre = stage(cur) || [];
      let t = cur;
      for (const x of [...pre].sort((p, q) => q.s - p.s || q.e - p.e)) { t = t.slice(0, x.s) + x.t + t.slice(x.e); if (f === main && x.s <= st.a + shift) shift += x.t.length - (x.e - x.s); }
      if (f === main) text = t; else mtext = t;
    }
    if (f !== main) { const dm = F.diffEdit(this.src(main), mtext); if (dm) edits.push({ f: main, ...dm }); }
    if (text === src0 && !edits.length) return false;
    const d = F.diffEdit(src0, text);
    if (d) edits.push({ f, ...d });
    const a = st.a + shift, b = st.b + shift;
    // the selection stays selected; a caret stays a caret (in an empty wrapper: between its braces)
    const caret = a !== b && (!c.collapsed || o.keepWord) ? { f, p: b, selA: a, selB: b }
      : st.word != null ? { f, p: Math.min(a + st.word, b), bias: -1 } : { f, p: a === b ? a : b, bias: a === b && r && r.on ? 1 : -1 };
    this.closeGroup();
    this.commit(edits, caret, 'format');
    this.closeGroup();
    // (all of it stays selected, every file's)
    if (whole && this.selectAllText) this.selectAllText();
    return true;
  },

  // Bold, Italic, Underline and the rest: on or off where the caret is
  fmtToggle(group, o = {}) {
    return this.fmtCommit([(t, a, b, x) => {
      // (a block of cells: on in every cell takes it off all of them, else all of them get it,
      // as Word chooses for the block as a whole)
      const B = x && x.block;
      const r = F.toggle(t, a, b, group, B && !o.force ? { ...o, force: (B.memo[group] ??= B.cells.every((x) => cellOn(B.text, x, group, F.ALL_ON_MAX)) ? 'off' : 'on') } : o);
      return r.error ? r : { ...r, need: r.on ? F.needsOf(group, r.w || { cmd: '' }) : null };
    }]);
  },
  // the buttons the page's own keys and the selection's bubble reach (Ctrl+B in beforeinput, the bubble's B)
  toggleStyle(cmd) { return this.fmtToggle(STYLE_GROUP[cmd] || 'bold'); },

  // A value of a kind (an underline's style, a colour, a size, a family): null takes it off
  fmtSet(group, w, o = {}) {
    return this.fmtCommit([(t, a, b) => {
      const r = F.setValue(t, a, b, group, w);
      if (!r) return null;
      return r.error ? r : { ...r, need: r.on ? F.needsOf(group, r.w || w) : null };
    }], o);
  },
  // the same value again takes it off (Character Shading, the highlighter's colour)
  fmtSetToggle(group, w) {
    const at = this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost) return false;
    const W = F.around(this.src(c.f), c.a, c.b, group);
    if (W && (c.collapsed || (c.a >= W.is && c.b <= W.ie)) && W.cmd === w.cmd && (W.args || []).join() === (w.args || []).join() && (W.opt || '') === (w.opt || '')) return this.fmtSet(group, null);
    return this.fmtSet(group, w);
  },

  // Character Shading: a box behind one word (\colorbox cannot break), the highlighter's grey
  // behind words that may run over a line's end (GAP H27); again takes it off
  charShading(color) {
    const at = this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost) return false;
    const src = this.src(c.f), grey = color || 'lightgray';
    const holds = (W) => W && (c.collapsed || (c.a >= W.is && c.b <= W.ie));
    const S = F.around(src, c.a, c.b, 'shading'), H = F.around(src, c.a, c.b, 'highlight');
    if (holds(S) && S.cmd === 'colorbox' && (S.args || [])[0] === grey) return this.fmtSet('shading', null);
    if (holds(H) && H.opt === grey) return this.fmtSet('highlight', null);
    const words = !c.collapsed && /\s/.test(src.slice(c.a, c.b).trim());
    if (words && F.hlTakesColor(this.src(this.main), this.preambleOthers ? this.preambleOthers() : [])) return this.fmtSet('highlight', { cmd: 'hl', opt: grey });
    return this.fmtSet('shading', { cmd: 'colorbox', args: [grey] });
  },

  // ---- Increase and Decrease Font Size ---------------------------------------------------------
  // (at a caret inside a word: that word, as Word grows it; the step from the size the words have,
  // a size around a part of them included)
  growFont(dir) {
    const at = this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost) return false;
    const src = this.src(c.f), base = this.baseSize();
    let a = c.a, b = c.b;
    if (c.collapsed) { const w = F.wordAt(src, c.a); if (w && w[0] < c.a && c.a < w[1]) [a, b] = w; }
    const W = F.around(src, a, b, 'size');
    const from = W ? (W.cmd === 'fontsize' ? F.nearestSize(base, F.sizeOf(base, W)) : W.cmd) : 'normalsize';
    const to = F.stepSize(from, dir);
    if (!to) { this.toast(dir > 0 ? 'That is LaTeX\'s largest size here (\\Huge): the size box takes any number of points.' : 'That is LaTeX\'s smallest size here (\\tiny): the size box takes any number of points.'); return false; }
    return this.fmtSet('size', to === 'normalsize' ? null : { cmd: to, decl: true }, { word: 'inside' });
  },
  // the document's next base size up or down, of those its class has
  docSizeStep(dir) {
    const src = this.src(this.main), d = docClass(src);
    const list = d ? F.docSizes(d.name) : null, cur = F.docSize(src);
    if (!list) return null;
    const L = list === 'any' ? [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24] : list;
    if (dir > 0) return L.find((x) => x > cur) ?? null;
    return [...L].reverse().find((x) => x < cur) ?? null;
  },
  baseSize() { return (this.model && this.model.opts && this.model.opts.pt) || F.docSize(this.src(this.main)) || 10; },

  // The document's base size, as its class takes it (extarticle for 14pt)
  setDocSize(pt) {
    if (pt == null || !(pt > 0)) return false;
    const main = this.main, src = this.src(main);
    const edits = F.docSizeEdits(src, pt);
    if (!edits) { const d = docClass(src); this.toast(d ? 'The class ' + d.name + ' sets its own sizes: ' + (F.docSizes(d.name) || ['10', '11', '12']).toString().replace(/,/g, ', ') + 'pt' + (F.docSizes(d.name) ? '' : ' or none') + '.' : 'This file has no \\documentclass: its main file sets the size.'); return false; }
    if (!edits.length) return false;
    const c = this.caretNow();
    const shift = c && c.f === main ? edits.reduce((n, x) => n + (x.s <= c.a ? x.t.length - (x.e - x.s) : 0), 0) : 0;
    this.closeGroup();
    this.commit(edits.map((x) => ({ f: main, ...x })), c && !c.ghost ? (c.collapsed ? { f: c.f, p: c.a + shift, bias: -1 } : { f: c.f, p: c.b + shift, selA: c.a + shift, selB: c.b + shift }) : null, 'format');
    this.closeGroup();
    return true;
  },
  // The document's font (an id of charfmt's FONTS)
  setDocFont(id) {
    const main = this.main, src = this.src(main);
    const edits = F.docFontEdits(src, id, this.engineChoice ? this.engineChoice() : 'auto');
    if (!edits) { this.toast(F.usesFontspec(src, this.engineChoice && this.engineChoice()) ? 'That font is for pdfLaTeX; this document is set with fontspec.' : 'This file has no \\documentclass: its main file sets the font.'); return false; }
    if (!edits.length) return false;
    const c = this.caretNow();
    const shift = c && c.f === main ? edits.reduce((n, x) => n + (x.s <= c.a ? x.t.length - (x.e - x.s) : 0), 0) : 0;
    this.closeGroup();
    this.commit(edits.map((x) => ({ f: main, ...x })), c && !c.ghost ? (c.collapsed ? { f: c.f, p: c.a + shift, bias: -1 } : { f: c.f, p: c.b + shift, selA: c.a + shift, selB: c.b + shift }) : null, 'format');
    this.closeGroup();
    return true;
  },
  // A size for the selection (points), or for the word at the caret (or what is typed there next):
  // the document's own size is the Font dialog's Set As Default
  setFontSize(pt, at = this.ribbonAt()) {
    if (!(pt > 0) || pt > 400) return false;
    const st = this.fontState(at);
    if (!st) return false;
    const w = F.sizeWrapper(st.base, pt);
    return this.fmtSet('size', w.cmd === 'normalsize' ? null : w, { word: 'inside', at });
  },
  // A font for the selection or the word at the caret (an id of GENERIC or FONTS); the document's
  // font is the Font dialog's Set As Default
  setFontName(id, at = this.ribbonAt()) {
    const st = this.fontState(at);
    if (!st) return false;
    if (id === st.docFont.id && !F.GENERIC.some((g) => g.id === id)) return this.fmtSet('family', null, { word: 'inside', at });
    const w = F.familyWrapper(id, st.fontspec);
    if (!w) { this.toast('That font has no form for ' + (st.fontspec ? 'fontspec' : 'pdfLaTeX') + ' here.'); return false; }
    return this.fmtSet('family', w, { word: 'inside', at });
  },

  // What the boxes show where the caret is: the base size and the size there, the document's font
  // and the font there, and whether they apply to the selection (or a run the caret is in) or the
  // document. Worked out once for each look at the ribbon.
  fontState(at) {
    if (!at || !at.c || at.c.ghost) return null;
    const m = at.memo || (at.memo = {});
    if (m.font) return m.font;
    const c = at.c, main = this.src(this.main), base = this.baseSize();
    const chain = chainAt(this, at), inner = (g) => { for (let k = chain.length - 1; k >= 0; k--) if (groupNames(g).includes(chain[k].W.cmd)) return chain[k].W; return null; };
    const SW = inner('size'), FW = inner('family');
    const engine = this.engineChoice ? this.engineChoice() : 'auto';
    // (the document's font and the engine read from the preamble once for each build of the page)
    if (!this.fontDoc || this.fontDoc.model !== this.model || this.fontDoc.engine !== engine) this.fontDoc = { model: this.model, engine, font: F.docFont(main, engine), fontspec: F.usesFontspec(main, engine), cls: (docClass(main) || { name: '' }).name };
    const D = this.fontDoc;
    const size = SW ? F.sizeOf(base, SW) : base;
    const fam = FW ? F.familyOf(FW) : null;
    return (m.font = { base, size, sizeW: SW, selMode: true, fontSel: true, family: fam, familyW: FW, docFont: D.font, fontspec: D.fontspec, cls: D.cls, docSizes: F.docSizes(D.cls) });
  },

  // ---- the boxes ----------------------------------------------------------------------------
  // An editable box (Word's font and size boxes): type a name or a number and Enter, or the
  // arrow (or Alt+Down, Down) for the list. The page's selection is kept while it has the focus.
  fontBox(kind) {
    const box = mk('span', 'fbx fbx-' + kind);
    const inp = mk('input', 'fbx-v');
    inp.id = kind === 'font' ? 'rb-font' : 'rb-size';
    inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-label', kind === 'font' ? 'Font' : 'Font Size');
    inp.setAttribute('aria-haspopup', 'menu');
    inp.setAttribute('aria-expanded', 'false');
    inp.setAttribute('aria-autocomplete', 'none');
    inp.dataset.cmd = kind === 'font' ? 'font-name' : 'font-size';
    inp.title = kind === 'font' ? 'Font (Ctrl+Shift+F)' : 'Font Size';
    if (kind === 'size') inp.inputMode = 'decimal';
    const x = mk('span', 'fbx-x');
    x.setAttribute('aria-hidden', 'true');
    x.innerHTML = SVG(CARET);
    // (the page's selection as it was: a focus by Tab finds the document's selection in the box already)
    const keep = () => { const s = getSelection(); if (s.rangeCount && this.root.contains(s.anchorNode)) { this.rbRange = s.getRangeAt(0).cloneRange(); this.fbxAt = this.ribbonAt(); } else if (this.pageRange) this.rbRange = this.pageRange; };
    inp.addEventListener('pointerdown', keep);
    inp.addEventListener('focus', () => { if (!this.fbxAt) keep(); inp.select(); });
    inp.addEventListener('blur', () => {
      setTimeout(() => {
        const to = document.activeElement;
        if (to === inp || (this.pop && this.pop.el.classList.contains('pop-fbx'))) return;
        // (on to another control of the ribbon by the arrows: the page's selection is given back
        // for it to act on; the box had taken the document's)
        const r = this.rbRange || this.pageRange;
        // (a selection put on the page takes the focus there: it goes back to the control after)
        if (to && to.closest && to.closest('#ribbon') && !to.matches('input') && r && r.startContainer.isConnected && this.root.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); to.focus({ preventScroll: true }); }
        this.fbxAt = null;
        this.fontBoxSync(kind, this.ribbonAt(), true);
      }, 0);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.fontBoxCommit(kind, inp.value); }
      else if (e.key === 'Escape') { e.preventDefault(); this.fbxAt = null; this.fbxBack(); }
      else if (e.key === 'ArrowDown' || (e.key === 'ArrowDown' && e.altKey)) { e.preventDefault(); this.fontBoxOpen(kind, true); }
      else if (e.key === 'Tab') {
        // (what was typed is applied, as Word's box does, and the focus goes on to the next control)
        if (inp.value.trim() && inp.value !== inp.dataset.shown) {
          e.preventDefault();
          const all = [...document.querySelectorAll('#ribbon button, #ribbon input')].filter((x) => x.offsetParent && !x.disabled);
          const next = all[all.indexOf(inp) + (e.shiftKey ? -1 : 1)];
          this.fontBoxCommit(kind, inp.value);
          if (next) next.focus();
        }
        this.fbxAt = null;
      }
    });
    x.addEventListener('mousedown', (e) => { e.preventDefault(); keep(); this.fontBoxOpen(kind, true); });
    box.append(inp, x);
    return box;
  },
  // what the box shows where the caret is (not while it is being typed in)
  fontBoxSync(kind, at, force) {
    const inp = $(kind === 'font' ? '#rb-font' : '#rb-size');
    if (!inp || (document.activeElement === inp && !force)) return;
    const st = this.fontState(at), ok = !!st && can(this, at);
    inp.disabled = !ok;
    inp.closest('.fbx').classList.toggle('off', !ok);
    if (!st) { inp.value = ''; return; }
    if (kind === 'font') {
      const id = st.fontSel && st.family ? st.family : st.docFont.id;
      const name = (F.GENERIC.find((g) => g.id === id) || F.FONTS.find((f) => f.id === id) || st.docFont).name;
      inp.value = inp.dataset.shown = name;
      inp.title = 'Font: ' + name + (st.familyW ? '' : ' (the document\'s)') + ' (Ctrl+Shift+F)';
    } else {
      const v = Math.round(st.size * 100) / 100;
      inp.value = inp.dataset.shown = Number.isFinite(v) ? String(v) : '';
      inp.title = 'Font Size: ' + v + 'pt' + (st.sizeW && st.sizeW.cmd !== 'fontsize' ? ' (\\' + st.sizeW.cmd + ')' : st.sizeW ? '' : ' (the document\'s)');
    }
  },
  // back to the page from a box: the selection it had (a box's text took the document's selection)
  fbxBack() {
    const r = this.rbRange, s = getSelection();
    this.root.focus({ preventScroll: true });
    if (r && this.root.contains(r.startContainer) && r.startContainer.isConnected) { s.removeAllRanges(); s.addRange(r); }
  },
  // a name or a number typed in a box
  fontBoxCommit(kind, value) {
    const at = this.fbxAt;
    this.fbxAt = null;
    this.fbxBack();
    const v = String(value || '').trim();
    if (kind === 'size') {
      const st = this.fontState(this.ribbonAt());
      const named = st && F.SIZES.find((n) => n.toLowerCase() === v.replace(/^\\/, '').toLowerCase());
      const pt = named ? F.sizePoints(st.base, named) : parseFloat(v.replace(',', '.'));
      if (!(pt > 0) || pt > 400) { this.toast('A size is a number of points (1 to 400) or a size of LaTeX, as large or footnotesize.'); this.ribbonSync(); return false; }
      const r = this.setFontSize(pt, this.ribbonAt() || at);
      this.ribbonSync();
      return r;
    }
    const want = v.toLowerCase();
    const all = [...F.GENERIC, ...F.FONTS];
    const hit = all.find((x) => x.name.toLowerCase() === want || x.id === want) || all.find((x) => x.name.toLowerCase().startsWith(want) && want);
    if (!hit) { this.toast('Rikuy offers the fonts its TeX has: ' + F.FONTS.map((x) => x.name).join(', ') + '.'); this.ribbonSync(); return false; }
    const r = this.setFontName(hit.id, this.ribbonAt() || at);
    this.ribbonSync();
    return r;
  },
  // the box's list: the fonts (each drawn in its look) or the sizes (each with its LaTeX name)
  fontBoxOpen(kind, fromBox) {
    // (opened from the box by its keys: the page's selection is put back to know what it applies to)
    // (the menu takes the focus; the page keeps its selection meanwhile, so the ribbon stays as it was)
    if (fromBox && this.rbRange && !this.root.contains(getSelection().anchorNode)) { this.fbxBack(); this.fbxAt = this.ribbonAt() || this.fbxAt; }
    const at = this.fbxAt || this.ribbonAt();
    const st = this.fontState(at);
    if (!st) return false;
    const inp = $(kind === 'font' ? '#rb-font' : '#rb-size');
    const visible = inp && inp.offsetParent;
    if (!fromBox && visible) { const s = getSelection(); if (s.rangeCount && this.root.contains(s.anchorNode)) { this.rbRange = s.getRangeAt(0).cloneRange(); this.fbxAt = at; } inp.focus(); return true; }
    const back = (fn) => () => { this.fbxAt = null; if (fromBox) this.fbxBack(); else this.ribbonBack(); fn(); this.ribbonSync(); };
    let items;
    if (kind === 'font') {
      const cur = st.fontSel && st.family ? st.family : st.docFont.id;
      const fonts = F.FONTS.filter((x) => (st.fontSel ? (st.fontspec ? x.spec : x.family) : st.fontspec ? x.spec : x.pkgs));
      items = [];
      // (a document font Rikuy does not list: first, as the font the words have now)
      if (!st.docFont.id) items.push({ name: st.docFont.name, checked: !st.family, radio: true, cls: 'fbx-mi', title: 'The document\'s font', run: back(() => this.setFontName('')) });
      if (st.fontSel) items.push(...F.GENERIC.map((g) => ({ name: g.name, checked: cur === g.id, radio: true, cls: 'fbx-mi y-ff-' + g.look, title: '\\' + g.cmd, run: back(() => this.setFontName(g.id)) })), null);
      items.push(...fonts.map((x) => ({ name: x.name, checked: cur === x.id, radio: true, cls: 'fbx-mi' + (x.look ? ' y-ff-' + x.look : ''),
        title: st.fontSel ? (st.fontspec ? '{\\fontspec{' + x.spec + '} ...}' : '{\\fontfamily{' + x.family + '}\\selectfont ...}') : st.fontspec ? '\\setmainfont{' + x.spec + '}' : (x.pkgs.length ? '\\usepackage{' + x.pkgs.join(',') + '}' : 'no font package: LaTeX\'s own') + (x.sans ? ' with \\familydefault in sans serif' : ''),
        run: back(() => this.setFontName(x.id)) })));
    } else {
      const cur = st.size;
      items = F.sizeList(st.base).filter((x, k, L) => !k || x.pt !== L[k - 1].pt).map((x) => ({ name: String(x.pt) + ' ' + x.name, label: String(x.pt), keys: '\\' + x.name, checked: Math.abs(cur - x.pt) < 0.06, radio: true, title: '{\\' + x.name + ' ...}',
        run: back(() => this.setFontSize(x.pt)) }));
    }
    const anchor = visible ? inp.closest('.fbx') : ($('#rg-home-font') && $('#rg-home-font').offsetParent ? $('#rg-home-font') : this.root);
    if (inp) inp.setAttribute('aria-expanded', 'true');
    const menu = openMenu(this, anchor, items, { label: kind === 'font' ? 'Font' : 'Font Size', cls: 'pop-fbx pop-fbx-' + kind, onClose: () => { if (inp) inp.setAttribute('aria-expanded', 'false'); } });
    // (the list opens on what there is now, as Word's does)
    const on = menu && menu.querySelector && menu.querySelector('[aria-checked="true"]');
    if (on) { on.focus(); on.scrollIntoView({ block: 'nearest' }); }
    return true;
  },

  // ---- Change Case ----------------------------------------------------------------------------
  caseMenu() {
    const b = $('#rc-change-case');
    const items = [['sentence', 'Sentence case.'], ['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['title', 'Capitalize Each Word'], ['toggle', 'tOGGLE cASE']]
      .map(([mode, name]) => ({ name, title: 'Rewrites the letters of the selection (or the word at the caret); commands, keys and math keep theirs', run: () => { this.ribbonBack(); this.changeCase(mode); this.ribbonSync(); } }));
    openMenu(this, b && b.offsetParent ? b : ($('#rg-home-font') && $('#rg-home-font').offsetParent ? $('#rg-home-font') : this.root), items, { label: 'Change Case' });
    return true;
  },
  // (only what the page draws changes: its characters of the selection, with their places in the
  // source; a file the page does not draw is read from its source alone)
  changeCase(mode) {
    const at = this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost) return false;
    return this.fmtCommit([(t, a, b, st) => {
      if (a === b) return null;
      let D = this.drawnChars((st && st.f) || c.f, a, b);
      // (a block of cells: their characters alone, read as one text, so Shift+F3 chooses once)
      const B = st && st.block;
      if (D && B) {
        let gone = false;
        const chars = [];
        // (the cells in source order: the last that starts at or before a character holds it or none)
        const holds = (ch) => { let lo = 0, hi = B.cells.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (B.cells[m][0] <= ch.s) { k = m; lo = m + 1; } else hi = m - 1; } return k >= 0 && ch.e <= B.cells[k][1]; };
        for (const ch of D.chars) {
          if (!holds(ch)) { gone = true; continue; }
          chars.push(gone && chars.length ? { ...ch, gap: 'par' } : ch);
          gone = false;
        }
        D = chars.length ? { chars, before: '' } : null;
        if (!D) return null;
      }
      return D ? F.changeDrawn(t, a, b, D, mode) : F.changeCase(t, a, b, mode);
    }], { word: true, keepWord: false, at, one: true });
  },
  // The cells of a block of cells selected (Table Layout's Select Column, a drag from one cell to
  // another; src/cmd/table.js shows it as a block): [[a, b, s, e]] in source order, a and b its
  // words, s and e the cell between its &; null where the selection is not over two cells or
  // more. The browser's own selection runs through the cells between them row by row, so a format
  // over it reached cells the block leaves out.
  blockCells(at) {
    const c = at && at.c;
    if (!c || c.ghost || c.collapsed || !at.cell || !this.tableHere) return null;
    const h = this.tableHere(at);
    if (!h || !h.multi) return null;
    const { r0, r1, c0, c1 } = h.rect, t = h.src, out = [];
    // (a cell's words: \multicolumn's and \multirow's text, else after the colours before them)
    const words = (x) => { const [s, e] = x.mr ? [x.mr.textS, x.mr.textE] : x.mc ? [x.mc.textS, x.mc.textE] : [x.ks, x.ce]; let a = s, b = e; while (a < b && /\s/.test(t[a])) a++; while (b > a && /\s/.test(t[b - 1])) b--; return [a, b]; };
    for (let r = r0; r <= r1; r++) {
      const row = h.T.rows[r];
      if (!row || row.kind !== 'row') continue;
      for (const x of row.cells) {
        if (x.empty || x.col < c0 || x.col + x.span - 1 > c1) continue;
        const [a, b] = words(x);
        if (b > a) out.push([a, b, x.s, x.e]);
      }
    }
    return out.length ? out : null;
  },
  // The characters the page draws for [a, b) of file f in reading order, each with its place in the
  // source: { chars: [{ s, e, ch, gap }], before }, gap 'par' where a paragraph starts and 'word'
  // where something drawn of its own (a formula, a reference) stands between; before, the drawn
  // text of the first one's paragraph before it. Footnotes' text (not the selection's: Word keeps
  // it apart too) and LaTeX paragraphs are left out. null when the page draws none of [a, b).
  drawnChars(f, a, b) {
    const root = this.root;
    if (!root) return null;
    const chars = [];
    let seen = false, item = null, pend = null, before = '', firstItem = null;
    // (only the page's blocks that hold some of [a, b) are read: Ctrl+A on 300 KB walked every
    // span, inside blocks of other files and far from the selection too)
    const outside = (el) => { const B = BLOCKS.get(+el.dataset.b); return !!B && (B.f !== f || B.e < a || B.s > b); };
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => {
      if (n.matches('.fn, .it.tex, [data-ctx="tex"]')) return NodeFilter.FILTER_REJECT;
      if (n.matches('.it')) return n.dataset.b && outside(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      if (n.matches('span.t, td, th, tr, li, br') || (n.dataset && (n.dataset.a || n.dataset.m))) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_SKIP;
    } });
    for (let n = walk.nextNode(), k = 0; n && k < 400000; n = walk.nextNode(), k++) {
      // (a paragraph, a cell, a row or an item starts a word and a sentence; a line break a word)
      if (n.matches('.it, td, th, tr, li')) { if (n.matches('.it')) item = n; if (chars.length) pend = 'par'; else before = ''; continue; }
      if (!n.matches('span.t')) { if (chars.length && pend !== 'par') pend = 'word'; else if (!chars.length) before += ' '; continue; }
      if (n.classList.contains('ph')) continue;
      const g = segOfSpan(n);
      if (!g || (g.seg.f || g.B.f) !== f) continue;
      const text = n.firstChild ? n.firstChild.data : '';
      // (charRange's sums, in the loop: an array for each character of 300 KB was a third of the time)
      const base = g.B.base, rel = g.seg.rel;
      for (let j = 0; j < text.length; j++) {
        const cs = base + rel[2 * (g.o + j)], ce = base + rel[2 * (g.o + j) + 1];
        if (ce <= a && !chars.length) { before = (before + text[j]).slice(-80); continue; }
        if (cs < a || ce > b || ce <= cs) continue;
        seen = true;
        if (!chars.length) firstItem = item;
        chars.push({ s: cs, e: ce, ch: text[j], gap: chars.length ? pend || undefined : undefined });
        pend = null;
      }
    }
    return seen ? { chars, before: firstItem ? before : '' } : null;
  },


  // ---- Clear All Formatting -------------------------------------------------------------------
  // Character formats in and around the selection; with all, the paragraph's alignment too (an
  // environment that holds this paragraph alone: center, flushleft, flushright)
  clearFormatting(all) {
    const steps = [(t, a, b) => F.clearFormats(t, a, b)];
    if (all) steps.push((t, a, b) => F.clearAlignment(t, a, b));
    const ok = this.fmtCommit(steps);
    if (!ok) this.toast('Nothing to clear here.');
    return ok;
  },

  // ---- Underline's menu ---------------------------------------------------------------------
  underlineMenu(at) {
    const W = at && at.c && !at.c.ghost ? F.around(this.src(at.c.f), at.c.a, at.c.b, 'underline') : null;
    const items = Object.entries(F.UNDERLINES).map(([cmd, name]) => ({ name: name === 'Single' ? 'Underline' : name + ' underline', checked: !!W && (W.cmd === cmd || (cmd === 'uline' && (W.cmd === 'underline' || W.cmd === 'culine'))), radio: true,
      cls: 'ul-mi ul-' + cmd, title: '\\' + cmd, html: '<span class="ul-demo y-' + { uline: 'ul', uuline: 'ul2', uwave: 'ulw', dashuline: 'uld', dotuline: 'ulo' }[cmd] + '">abc</span>',
      run: () => { this.ribbonBack(); this.fmtSet('underline', { cmd }); this.ribbonSync(); } }));
    items.push(null, { name: 'Underline Color…', title: 'An underline in a colour of its own (\\culine, ulem\'s line coloured)', run: () => this.underlineColor(at) });
    return items;
  },
  // (a picker opened from a menu: the page's selection is kept to be given back, not left to the focus)
  keepRange() { const s = getSelection(); if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange(); else if (this.pageRange) this.rbRange = this.pageRange; },
  underlineColor(at) {
    const b = $('#rb-u-x');
    this.keepRange();
    this.asGrid(colorPicker(this, b && b.offsetParent ? b : this.root, { label: 'Underline Color', auto: 'Automatic', theme: this.docColors(), onPick: (v) => {
      this.fbxBack();
      if (!v) this.fmtSet('underline', { cmd: 'uline' });
      else if (v.html) this.toast('An underline takes a named colour; pick one of the list.');
      else this.fmtSet('underline', { cmd: 'culine', args: [v.name] });
      this.ribbonSync();
    } }));
  },
  // a picker's swatches as a grid, ten across, as Word's (the kit's picker lists them in a column)
  asGrid(p) { if (p) { p.classList.add('pop-gal'); this.positionPop(); } return p; },
  // the document's own colours, first in every picker
  docColors() {
    const out = [];
    for (const [name, v] of (this.model && this.model.colors) || []) if (/^#[0-9a-f]{6}$/i.test(v) && out.length < 20) out.push({ name, hex: v.slice(1).toUpperCase() });
    return out;
  },

  // ---- Text Highlight Color -------------------------------------------------------------------
  // The highlighter in a colour (the last one picked, yellow at first): on words highlighted in
  // that colour it comes off. null takes it off.
  highlight(color) {
    const pick = color === undefined ? this.hlLast || 'yellow' : color;
    if (color !== undefined && color) this.hlLast = color;
    const src = this.src(this.main);
    if (pick && pick !== 'yellow' && !F.hlTakesColor(src, this.preambleOthers ? this.preambleOthers() : [])) { this.toast('This document defines \\hl itself; Rikuy\'s highlighter takes a colour only where it defines \\hl.'); return false; }
    const w = { cmd: 'hl', opt: pick === 'yellow' ? null : pick };
    if (!pick) return this.fmtSet('highlight', null);
    if (color === undefined) return this.fmtSetToggle('highlight', w);
    return this.fmtSet('highlight', w);
  },
  highlightMenu(at) {
    const W = at && at.c && !at.c.ghost ? F.around(this.src(at.c.f), at.c.a, at.c.b, 'highlight') : null;
    const cur = W ? W.opt || 'yellow' : null;
    const items = HIGHLIGHTS.map(([name, word]) => ({ name: word, label: '', title: word + ': \\hl' + (name === 'yellow' ? '' : '[' + name + ']'), swatch: HEX[name], checked: cur === name, radio: true, cls: 'gal-tile sw',
      run: () => { this.ribbonBack(); this.highlight(name); this.ribbonSync(); } }));
    items.push(null, { name: 'No Color', title: 'Takes the highlighter off', run: () => { this.ribbonBack(); this.highlight(null); this.ribbonSync(); } });
    // (the split button's menu, drawn as Word's grid of swatches once it is open)
    setTimeout(() => { const p = this.pop && this.pop.el; if (p && p.getAttribute('aria-label') === 'Text Highlight Color') { p.classList.add('pop-gal', 'pop-colors', 'pop-hl'); p.style.setProperty('--cols', 6); this.positionPop(); } }, 0);
    return items;
  },

  // ---- Font Color ------------------------------------------------------------------------------
  // a colour as the picker gives it ({ name } or { html }), null for Automatic (no colour); none
  // given: the last one picked (red at first)
  fontColor(pick) {
    if (pick === undefined) pick = this.colorLast || { name: 'red' };
    else if (pick) this.colorLast = pick;
    if (!pick) return this.fmtSet('color', null);
    const w = pick.html ? { cmd: 'textcolor', opt: 'HTML', args: [String(pick.html).replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase()] } : { cmd: 'textcolor', args: [pick.name] };
    w.declAlt = { cmd: 'color', opt: w.opt, args: w.args, decl: true };
    return this.fmtSet('color', w);
  },
  fontColorPicker(at) {
    const W = at && at.c && !at.c.ghost ? F.around(this.src(at.c.f), at.c.a, at.c.b, 'color') : null;
    const b = $('#rc-font-color-x');
    this.keepRange();
    this.asGrid(colorPicker(this, b && b.offsetParent ? b : this.root, { label: 'Font Color', auto: 'Automatic', theme: this.docColors(), current: W && !W.opt ? W.args[0] : null,
      onPick: (v) => { this.fbxBack(); this.fontColor(v); this.ribbonSync(); } }));
  },

  // ---- More Font Effects ----------------------------------------------------------------------
  moreMenu() {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    // (Clear Character Formatting here too: Ctrl+Space's control on a touch screen, which has no keys)
    const ids = ['small-caps', 'all-caps', 'double-strikethrough', 'char-border', 'char-shading', 'enclose-chars', null, 'clear-char-formatting', null, 'phonetic-guide', 'font-dialog'];
    const items = ids.map((id) => {
      if (!id) return null;
      const c = this.cmdById(id);
      const pressed = c.on ? !!c.on(this, at) : undefined;
      return { name: c.name + (id === 'phonetic-guide' || id === 'font-dialog' ? '…' : ''), title: c.title, keys: (c.keys || [])[0], checked: pressed, disabled: !(c.when ? c.when(this, at) : true),
        run: () => { this.ribbonBack(); this.runCommand(id); } };
    });
    const b = $('#rc-font-more');
    openMenu(this, b && b.offsetParent ? b : ($('#rg-home-font') && $('#rg-home-font').offsetParent ? $('#rg-home-font') : this.root), items, { label: 'More Font Effects' });
    return true;
  },

  // ---- Format Painter ---------------------------------------------------------------------------
  // Armed: the character formats around the caret are kept; the next selection on the page (or
  // the word clicked) gets them, its own taken off first. A double click keeps it armed until
  // Escape or another press of the button.
  formatPainter(sticky) {
    if (this.fpaint) { this.fpaint = null; document.body.classList.remove('fpainting'); return true; }
    const at = this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost) return false;
    const fmts = F.formatsAt(this.src(c.f), c.a, c.b);
    const sel = getSelection();
    // (where it was armed: the selection there is no place to paint, see the touch screen's rest below)
    this.fpaint = { fmts, sticky: !!sticky, from: sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
    document.body.classList.add('fpainting');
    if (!fmts.length) this.toast('The caret is in plain text: the next selection is made plain.', 2400);
    return true;
  },
  paintFormat() {
    const P = this.fpaint;
    if (!P) return false;
    const ok = this.fmtCommit([(t, a, b) => F.clearFormats(t, a, b) || { text: t, a, b }, ...P.fmts.map((x) => (t, a, b) => {
      const r = F.wrapIn(t, a, b, x.group, x.w);
      return r.error ? r : { ...r, need: F.needsOf(x.group, x.w) };
    })], { word: true, keepWord: true });
    if (!P.sticky) { this.fpaint = null; document.body.classList.remove('fpainting'); }
    this.ribbonSync();
    return ok;
  },

  // a command of the registry by its id (for the menus that list others')
  cmdById(id) { return command(id); }
};

// ---- installed with the ribbon -------------------------------------------------------------------

onInstall((app) => {
  // the page's selection, kept for the boxes (focused by Tab, the document's selection is in them)
  document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.pageRange = s.getRangeAt(0).cloneRange(); });
  // the Format Painter paints where the next press lets go; a double click on its button keeps it
  const fp = $('#rc-format-painter');
  if (fp) fp.addEventListener('dblclick', () => { if (app.fpaint) app.fpaint.sticky = true; else app.formatPainter(true); app.ribbonSync(); });
  app.root.addEventListener('mouseup', () => { if (app.fpaint) setTimeout(() => { if (app.fpaint) app.paintFormat(); }, 0); });
  // (on a touch screen a tap ends with a mouseup as a click does; a long press that selects words,
  // and the handles moved after it, send none: the selection paints once it has rested a moment)
  let touched = 0, rest = null;
  document.addEventListener('pointerdown', (e) => { touched = e.pointerType === 'touch' ? Date.now() : 0; }, true);
  document.addEventListener('selectionchange', () => {
    if (!app.fpaint || !touched) return;
    clearTimeout(rest);
    rest = setTimeout(() => {
      const s = getSelection(), P = app.fpaint;
      if (!P || !s.rangeCount || s.isCollapsed || !app.root.contains(s.anchorNode)) return;
      const r = s.getRangeAt(0), w = P.from;
      try { if (w && r.compareBoundaryPoints(Range.START_TO_START, w) === 0 && r.compareBoundaryPoints(Range.END_TO_END, w) === 0) return; } catch (e) { /* the page drawn again since */ }
      app.paintFormat();
    }, 900);
  });
  // the on-screen keyboard: what it covers of the window, for a menu or a list to open above it
  // (.pop.sheet-mode in app.css). The visual viewport shrinks by it; a pinch zoom shrinks it too,
  // by its scale, which is taken out.
  const vv = window.visualViewport;
  if (vv) {
    const kb = () => {
      const h = Math.max(0, Math.round(window.innerHeight - vv.height * (vv.scale || 1)));
      document.documentElement.style.setProperty('--vk-h', (h > 80 ? h : 0) + 'px');
      if (app.pop && app.positionPop) app.positionPop();
    };
    vv.addEventListener('resize', kb);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.fpaint) { app.fpaint = null; document.body.classList.remove('fpainting'); app.ribbonSync(); } });
  // the bars under the colour buttons show the colour the button writes
  const paint = () => {
    const hl = document.querySelector('#rc-highlight .fg-bar'), fc = document.querySelector('#rc-font-color .fg-bar');
    if (hl) hl.style.background = '#' + (HEX[app.hlLast || 'yellow'] || 'FFFF00');
    if (fc) { const p = app.colorLast || { name: 'red' }; fc.style.background = p.html ? '#' + p.html : colorHex(p.name); }
  };
  app.fontBars = paint;
  paint();
});
const colorHex = (name) => {
  const b = BASE_COLORS.find(([n]) => n === name);
  if (b) return '#' + b[1];
  return '#C00000';
};

// ---- *bold* and _italic_ as they are typed (AutoCorrect, Word's "*Bold* and _italic_ with real formatting")
onInsertText((app, data, range) => {
  if ((data !== '*' && data !== '_') || (range && range.a !== range.b)) return;
  if (app.prefs && app.prefs.autocorrect && app.prefs.autocorrect.boldItalic === false) return;
  const c = app.caretNow();
  if (!c || c.ghost || !c.collapsed || app.texHere()) return;
  const src = app.src(c.f), p = c.a;
  const r = F.autoFormat(src, p, data);
  if (!r) return;
  // the mark typed first, as typing writes it (one undo gives it back as typed), then the format
  const mark = data === '*' ? '*' : '\\_';
  app.commit([{ f: c.f, s: p, e: p, t: mark }], { f: c.f, p: p + mark.length, bias: -1 }, 'type');
  app.closeGroup();
  app.commit([{ f: c.f, s: r.s, e: r.e + mark.length, t: r.t }], { f: c.f, p: r.p, bias: -1 }, 'autoformat');
  app.closeGroup();
  return true;
});
