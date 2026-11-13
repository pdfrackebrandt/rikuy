// Batch B4, styles: the style of the paragraph the caret is in, or of every paragraph a selection
// runs over (Normal, Title, Part, Heading 1 to 6, LaTeX, Quote, Quotation, Verse, Abstract, the
// theorem like environments and the document's own) by the Styles gallery (src/ui/gallery.js), the
// style list of a narrow window, the Styles pane (src/ui/stylespane.js), Apply Styles and the keys
// Ctrl+Alt+0 to 4; numbered and unnumbered headings; "# " typed at a paragraph's start. Modify
// Style, Create a Style, Update to Match and the Design tab's looks are src/ui/stylespane.js's and
// src/ui/looks.js's, on the pure edits of src/styles.js and src/looks.js.

import { register, command, onInsertText } from '../commands.js';
import { $ } from '../ui/dom.js';
import { BLOCKS } from '../render.js';
import { NOT_PLAIN, latexSpot, restyle, startsLine, headLevels, isHeading, ENV_STYLES, THM_STYLES, isEnvStyle, envOf, quoteWords, thmLine, starEdits, applyEdits, numberingEdits, charStyleBody, formatOnlyBegin } from '../styles.js';
import { defines, packageLine, preambleEnd, stripComments } from '../preamble.js';
import { wrapBlockEdits } from '../blockenv.js';
import { diffEdit } from '../wrap.js';
import { methods as pane } from '../ui/stylespane.js';
import { methods as design } from '../ui/design.js';
import { THEMES } from '../looks.js';

const HEAD = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(\[[^\]]*\])?\s*\{/;
// Heading 1 to 3 of an article, as the gallery's first tiles have them (src/ui/gallery.js)
export const HEADS = ['section', 'subsection', 'subsubsection'];
// why a tile cannot apply where the caret is (its tooltip says so)
export const WHY = {
  none: 'Click in the text of the page first.',
  multi: 'Not for this selection: its paragraphs cannot all take it (a list, a table, a theorem, or one in another file).',
  title: 'The title is the one \\title sets: edit its words where they stand.',
  part: 'Not for one part of a list, a table or a theorem: LaTeX takes it as a whole.',
  latex: 'Not here: a LaTeX paragraph stands on lines of its own and ends at a blank line, and this one has text right before or after it.',
  head: 'Not here: a heading holds one paragraph of plain text, with no footnote, display, list or environment.',
  quote: 'Not here: an environment around a paragraph needs it on lines of its own.',
  line: 'Not on a line to come in a LaTeX paragraph: type it first.',
  opt: 'Not for a theorem with a title of its own ([…]): only another theorem like environment keeps it.',
  cls: 'This document\'s class has no such level.'
};
// the gallery's tiles: which slot shows which style in this document (Heading 1 is \chapter in a
// report), and the element each is (Heading 1 to 3 keep the ids they had when they were sections)
export const SLOT_EL = { p: 'rb-st-p', title: 'rb-st-title', h1: 'rb-st-section', h2: 'rb-st-subsection', h3: 'rb-st-subsubsection', h4: 'rb-st-h4', h5: 'rb-st-h5', h6: 'rb-st-h6', latex: 'rb-st-latex', quote: 'rb-st-quote' };
// a name for an environment of the document's own that Rikuy writes in a regular expression
const SAFE_NAME = /^[A-Za-z]{1,40}$/;
// classes that have no abstract environment
const NO_ABSTRACT = /^(book|scrbook|beamer|letter|scrlttr2|moderncv|exam)$/;
// classes that come with theorem, lemma, definition and the like
const OWN_THMS = /^(llncs|svjour\d*|svmult|svmono)$/;

// the caret's block's style, once for each look at the ribbon
const styleOf = (app, at) => { if (!at) return null; const m = at.memo || (at.memo = {}); if (!('style' in m)) m.style = app.blockStyle(at); return m.style; };
// the style a command stands for in this document: Heading 2 is \subsection in an article and \section in a report
const target = (app, v) => (typeof v === 'function' ? v(app) : v);
const level = (k) => (app) => app.styleCatalog().levels[k - 1] || null;
const style = (id, v, name, el, more = {}) => ({
  id, name, ...(el ? { el, static: true, fit: true, only: 'wide', tab: 'home', group: 'styles' } : {}), title: more.title || name,
  when: (app, at) => { const st = styleOf(app, at), t = target(app, v); return !!st && !!t && st.to.has(t); },
  on: (app, at) => { const st = styleOf(app, at), t = target(app, v); return !!st && !!t && st.v === t; },
  run: (app) => { app.setBlockStyle(target(app, v)); app.ribbonSync(); },
  whyNot: (app, at) => { const t = target(app, v); return t ? app.whyNot(styleOf(app, at) || { on: false }, t) : WHY.cls; },
  ...more
});
const heading = (k, keys) => style('style-heading' + k, level(k), 'Heading ' + k, SLOT_EL['h' + k], {
  ...(keys ? { keys: [keys] } : {}),
  title: 'Heading ' + k + ': ' + ['a section, or a chapter in a report or a book', 'a subsection, or a section in a report or a book', 'a subsubsection, or a subsection in a report or a book',
    '\\paragraph, a heading that runs into its paragraph (\\subsubsection in a report or a book)', '\\subparagraph (\\paragraph in a report or a book)', '\\subparagraph, in a report or a book'][k - 1] + (keys ? ' (' + keys + ')' : ''),
  synonyms: [['Section', 'Chapter'], ['Subsection'], ['Subsubsection'], ['paragraph heading'], ['subparagraph heading'], []][k - 1],
  ...(k === 1 ? { palette: { k: 'section', d: 'Section heading', order: 100, t: { open: '\n\n\\section{', close: '}\n\n' }, block: true } } : {}),
  ...(k === 2 ? { palette: { k: 'subsection', d: 'Subsection heading', order: 110, t: { open: '\n\n\\subsection{', close: '}\n\n' }, block: true } } : {})
});
const envStyle = (v, name, more = {}) => style('style-' + v, v, name, v === 'quote' ? SLOT_EL.quote : null, { title: name + ': \\begin{' + v + '} around the paragraph' + (THM_STYLES[v] && v !== 'proof' ? ', with its \\newtheorem written once where the preamble has none' : v === 'proof' ? ', with amsthm loaded once' : ''), ...more });

register(
  // the gallery: one control of tiles, and the list in its place on a narrow window (both drawn
  // in src/template.html; src/ui/gallery.js paints them)
  { id: 'styles-gallery', name: 'Styles', el: 'rb-gallery', role: 'group', kind: 'custom', tab: 'home', group: 'styles', only: 'wide', searchable: false, title: 'Styles',
    render: () => $('#rb-gw'), sync: (app, at) => app.styleSync(at) },
  { id: 'style-list', name: 'Style of this paragraph', el: 'rb-style', role: 'combobox', kind: 'custom', tab: 'home', group: 'styles', only: 'narrow', searchable: false, title: 'Style of the paragraph the caret is in',
    render: () => $('#rb-style') },
  style('style-normal', 'p', 'Normal', SLOT_EL.p, { keys: ['Ctrl+Alt+0'], title: 'Normal: a paragraph of text (Ctrl+Alt+0)', synonyms: ['Normal text', 'Paragraph', 'Body text'] }),
  style('style-title', 'title', 'Title', SLOT_EL.title, { title: 'Title: the document\'s title, from \\title' }),
  heading(1, 'Ctrl+Alt+1'), heading(2, 'Ctrl+Alt+2'), heading(3, 'Ctrl+Alt+3'), heading(4, 'Ctrl+Alt+4'), heading(5), heading(6),
  style('style-latex', 'latex', 'LaTeX source', SLOT_EL.latex, { title: 'LaTeX source: shows the paragraph as LaTeX that you type directly', synonyms: ['LaTeX paragraph', 'Raw LaTeX', 'Source'] }),
  envStyle('quote', 'Quote', { synonyms: ['Block quote'] }),
  style('style-part', 'part', 'Part', null, { title: 'Part: \\part, a heading above the chapters or sections, numbered I, II, III', synonyms: ['part'] }),
  envStyle('quotation', 'Quotation', { synonyms: ['Intense Quote', 'quotation'] }),
  envStyle('verse', 'Verse', { synonyms: ['Poem', 'verse'] }),
  envStyle('abstract', 'Abstract', { synonyms: ['Summary', 'abstract'] }),
  // (named apart from the insert list's Theorem, which inserts an empty one)
  ...Object.entries(THM_STYLES).map(([v, t]) => envStyle(v, t.name + ' style', { id: 'style-thm-' + v, title: t.name + ' style: the paragraph in \\begin{' + v + '}' + (v === 'proof' ? ' (amsthm loaded once)' : ', with its \\newtheorem written once where the preamble has none'), synonyms: [v, 'LaTeX environment'] })),
  { id: 'styles-prev', name: 'Previous styles', resync: false, el: 'rb-st-up', static: true, fit: true, only: 'wide', tab: 'home', group: 'styles', searchable: false, when: () => true, run: (app) => app.pageGallery(-1) },
  { id: 'styles-next', name: 'Next styles', resync: false, el: 'rb-st-down', static: true, fit: true, only: 'wide', tab: 'home', group: 'styles', searchable: false, when: () => true, run: (app) => app.pageGallery(1) },
  { id: 'styles-more', name: 'More styles', resync: false, el: 'rb-st-more', static: true, only: 'wide', tab: 'home', group: 'styles', title: 'All the styles', synonyms: ['Styles', 'Style'], when: () => true, run: (app) => app.openStyles() },
  // headings: numbered or not, one at a time or the whole document
  { id: 'heading-unnumbered', name: 'Unnumbered heading', kind: 'toggle', menu: { heading: 70 }, title: 'Unnumbered heading: \\section*{…}, with no number (and left out of the contents); off, \\section{…} again',
    synonyms: ['Numbered heading', 'Heading number', 'section*', 'No number'], when: (app, at) => !!app.headingAt(at), on: (app, at) => { const h = app.headingAt(at); return h ? h.star : null; },
    whyNot: () => 'Put the caret in a heading first.', run: (app, args, at) => app.toggleHeadingStar(at) },
  { id: 'heading-numbers-off', name: 'Heading numbers off', kind: 'toggle', menu: { heading: 71 }, title: 'Heading numbers off: no heading of the document numbered (\\setcounter{secnumdepth}{0} in the preamble); off, numbered again',
    synonyms: ['Heading numbering', 'secnumdepth', 'Number headings', 'Numbering off'], when: (app) => app.stylePreEnd() >= 0, on: (app) => !!app.model && app.model.opts.secnumdepth < (app.model.opts.chapters ? 0 : 1),
    whyNot: () => 'The main file has no preamble to set it in.', run: (app) => app.toggleNumbering() },
  // Word's keys and panes for styles
  { id: 'apply-styles', name: 'Apply Styles', keys: ['Ctrl+Shift+S'], title: 'Apply Styles (Ctrl+Shift+S): type a style\'s name and press Enter', synonyms: ['Style box', 'Apply a style'], when: (app, at) => !!at,
    run: (app) => app.openApplyStyles() },
  // (on a narrow window and a phone the style list's last choices open it and Create a Style: the
  // pane is where Modify and Update to Match are there, with no More menu and no right click)
  { id: 'styles-pane', name: 'Styles pane', keys: ['Ctrl+Alt+Shift+S'], keyScope: 'app', title: 'Styles pane (Ctrl+Alt+Shift+S): every style of this document, the one at the caret marked; Modify, New Style, Update to Match',
    synonyms: ['Styles window', 'Style list', 'Manage styles', 'Style Inspector'], when: () => true, run: (app) => app.toggleStylesPane() },
  { id: 'modify-style', name: 'Modify Style', title: 'Modify Style: a heading level\'s font, size, colour, alignment, rule, spacing and numbering (titlesec\'s \\titleformat and \\titlespacing, once in the preamble), or a style of this document\'s own',
    synonyms: ['Modify', 'Change style', 'titleformat', 'Heading format'], menu: { heading: 72 }, when: (app, at) => { const st = styleOf(app, at); return !!st && app.canModifyStyle(st.v); },
    whyNot: (app, at) => { const st = styleOf(app, at); return st ? app.modifyWhy(st.v) : WHY.none; }, run: (app, args, at) => app.openModifyStyle(args && args.v ? args.v : (styleOf(app, at) || {}).v) },
  { id: 'create-style', name: 'Create a Style', title: 'Create a Style: a character style (\\newcommand{\\name}[1]{…}) or a paragraph style (\\newenvironment), from the formatting at the caret, written once in the preamble',
    synonyms: ['New Style', 'New style', 'newcommand', 'newenvironment'], when: (app) => app.stylePreEnd() >= 0, whyNot: () => 'The main file has no preamble to define it in.', run: (app) => app.openCreateStyle() },
  { id: 'update-style', name: 'Update Style to Match Selection', title: 'Update to Match Selection: the formatting on the caret\'s heading (\\textsf{…}, \\textcolor{…}{…}) becomes its level\'s look, and comes off the heading',
    synonyms: ['Update to Match', 'Match Selection'], menu: { heading: 73 }, when: (app, at) => { const st = styleOf(app, at); return !!st && app.canUpdateStyle(st.v); },
    whyNot: () => 'Put the caret in a heading whose words all have the formatting to take (\\textsf{…}, \\textcolor{…}{…}).', run: (app, args, at) => app.updateStyle(args && args.v ? args.v : (styleOf(app, at) || {}).v) },
  // the Design tab: the document's formatting as a whole
  { id: 'design-themes', name: 'Themes', tab: 'design', group: 'formatting', order: 10, kind: 'menu', label: 'Themes', title: 'Themes: a style set, a colour and a heading font as one',
    icon: '<path d="M4 4.5h12v11H4z"/><path d="M4 8h12M8 8v7.5"/>', synonyms: ['Theme', 'Look', 'Document theme'], when: (app) => !app.designWhy(''), whyNot: (app) => app.designWhy(''),
    run: (app, args) => (args && args.id ? applyTheme(app, args.id) : app.designMenu('themes', $('#rc-design-themes'))) },
  { id: 'design-style-set', name: 'Style Set', tab: 'design', group: 'formatting', order: 20, kind: 'menu', label: 'Style Set', title: 'Style Set: how the headings look (titlesec\'s \\titleformat lines; LaTeX for none)',
    icon: '<path d="M4 5h9M4 8.5h6M4 13h12M4 16h9"/>', synonyms: ['Document Formatting', 'Look gallery', 'Heading look', 'titlesec'], when: (app) => !app.designWhy(''), whyNot: (app) => app.designWhy(''),
    run: (app, args) => (args && args.id ? app.applyDesign({ set: args.id }) : app.designMenu('sets', $('#rc-design-style-set'))) },
  { id: 'design-colors', name: 'Colors', tab: 'design', group: 'formatting', order: 30, kind: 'menu', label: 'Colors', title: 'Colors: the accent the headings take (\\definecolor{accent}, first in every colour picker)',
    icon: '<circle cx="7" cy="8" r="3"/><circle cx="13" cy="8" r="3"/><circle cx="10" cy="13" r="3"/>', synonyms: ['Theme colours', 'Theme colors', 'Accent colour', 'Colours'], when: (app) => !app.designWhy(''), whyNot: (app) => app.designWhy(''),
    run: (app, args) => (args && args.id ? app.applyDesign({ color: args.id }) : app.designMenu('colors', $('#rc-design-colors'))) },
  { id: 'design-fonts', name: 'Fonts', tab: 'design', group: 'formatting', order: 40, kind: 'menu', label: 'Fonts', title: 'Fonts: the headings\' font (the text\'s is the Font box\'s, Home)',
    icon: '<path d="M4 15.5 7.5 5h1l3.5 10.5M5.2 12h5.6"/><path d="M13 9.5h3.5M14.7 7v8.5"/>', synonyms: ['Theme fonts', 'Heading font', 'Font pair'], when: (app) => !app.designWhy('fonts'), whyNot: (app) => app.designWhy('fonts'),
    run: (app, args) => (args && args.id ? app.applyDesign({ font: args.id }) : app.designMenu('fonts', $('#rc-design-fonts'))) },
  { id: 'autoformat-headings', name: 'AutoFormat headings', kind: 'toggle', title: 'AutoFormat headings: "# " typed at a paragraph\'s start makes it Heading 1, "## " Heading 2, up to "#### "',
    synonyms: ['Headings while typing', 'Markdown headings', 'AutoFormat As You Type'], when: () => true, on: () => autoHeads(), run: () => autoHeads(!autoHeads()) }
);

// a theme by its id: its set, colour and heading font in one commit
function applyTheme(app, id) {
  const T = THEMES.find((x) => x.id === id);
  return T ? app.applyDesign({ set: T.set, color: T.color, font: T.font || null }) : false;
}

// AutoFormat's headings, on unless turned off (kept in this browser)
function autoHeads(set) {
  try {
    if (set !== undefined) localStorage.setItem('rikuy.autoformat.headings', set ? '1' : '0');
    return localStorage.getItem('rikuy.autoformat.headings') !== '0';
  } catch (e) { return set !== undefined ? set : true; }
}

// "# " at a paragraph's start: once the space is in, the paragraph becomes the heading of that
// level, as a step of its own (one undo gives back "# " as typed, as Word's AutoFormat does)
onInsertText((app, text, range) => {
  if (text !== ' ' || range || !autoHeads()) return;
  const c = app.caretNow();
  if (!c || c.ghost || !c.collapsed) return;
  // (a look at the characters before the caret first: a space typed in a long paragraph reads no more)
  if (!/(?:^|[^\\])(?:\\#){1,4}$/.test(app.src(c.f).slice(Math.max(0, c.a - 9), c.a))) return;
  const at = app.ribbonAt();
  const r = at && at.B && at.it ? app.plainPara(at.B, at.it) : null;
  if (!r || c.a <= r.s || c.a - r.s > 8) return;
  const hashes = app.src(c.f).slice(r.s, c.a);
  if (!/^(?:\\#){1,4}$/.test(hashes)) return;
  const cmd = app.styleCatalog().levels[hashes.length / 2 - 1], f = c.f, s = r.s;
  if (!cmd) return;
  queueMicrotask(() => {
    const src = app.src(f);
    if (src.slice(s, s + hashes.length + 1) !== hashes + ' ') return;
    const at2 = app.ribbonAt(), r2 = at2 && at2.B && at2.it ? app.plainPara(at2.B, at2.it) : null;
    if (!r2 || r2.s !== s) return;
    const e = Math.max(r2.e, s + hashes.length + 1), rest = src.slice(s + hashes.length + 1, e);
    if (NOT_PLAIN.test(rest) || /%/.test(rest.replace(/\\%/g, ''))) return;
    const c2 = app.caretNow(), open = '\\' + cmd + '{';
    const p = c2 && !c2.ghost && c2.f === f ? Math.max(s, c2.a - hashes.length - 1) + open.length : s + open.length;
    app.closeGroup();
    app.commit([{ f, s: e, e, t: '}' }, { f, s, e: s + hashes.length + 1, t: open }], { f, p, bias: -1 }, 'autoformat');
    app.closeGroup();
    app.ribbonSync();
  });
});

export const methods = {
  ...pane,
  ...design,
  // where the main file's preamble ends (-1: none), read once for each model: the ribbon asks at
  // every move of the caret, and a stranger's preamble may be 200 000 characters
  stylePreEnd() {
    if (!this.model) return -1;
    const src = this.src(this.main);
    if (!this.stPre || this.stPre.M !== this.model || this.stPre.src !== src) this.stPre = { M: this.model, src, end: preambleEnd(src) };
    return this.stPre.end;
  },
  // Every style this document has, in the gallery's and the pane's order: { v, name, group
  // ('para', 'env', 'own'), slot (its tile, if it has one) }; levels: Heading 1, 2, ... as
  // commands; chars: the document's own character styles. Worked out once for each model.
  styleCatalog() {
    const M = this.model;
    if (this.stCat && this.stCat.M === M) return this.stCat;
    const ch = !!(M && M.opts.chapters), cls = M ? M.opts.cls || 'article' : 'article';
    const levels = headLevels(ch), all = [];
    all.push({ v: 'p', name: 'Normal', group: 'para', slot: 'p' }, { v: 'title', name: 'Title', group: 'para', slot: 'title' });
    levels.forEach((c, k) => all.push({ v: c, name: 'Heading ' + (k + 1), group: 'para', slot: 'h' + (k + 1) }));
    all.push({ v: 'part', name: 'Part', group: 'para', slot: null }, { v: 'latex', name: 'LaTeX source', group: 'para', slot: 'latex' });
    for (const [v, name] of Object.entries(ENV_STYLES)) if (v !== 'verbatim' && (v !== 'abstract' || !NO_ABSTRACT.test(cls))) all.push({ v, name, group: 'para', slot: v === 'quote' ? 'quote' : null });
    for (const [v, t] of Object.entries(THM_STYLES)) all.push({ v, name: t.name, group: 'env', slot: null });
    const chars = [];
    if (M) {
      // the document's own: its theorem like environments and its environments of formatting alone
      for (const [name, t] of M.thms) if (all.length < 300 && SAFE_NAME.test(name) && !THM_STYLES[name] && !ENV_STYLES[name]) all.push({ v: 'env:' + name, name: (t.title || name) + ' (' + name + ')', group: 'own', slot: null, env: name });
      for (const [name, d] of M.envDefs) if (all.length < 300 && SAFE_NAME.test(name) && !THM_STYLES[name] && !ENV_STYLES[name] && !M.thms.has(name) && formatOnlyBegin(d.begin) && d.nargs === 0) all.push({ v: 'env:' + name, name, group: 'own', slot: null, env: name });
      // its character styles: \newcommand{\name}[1]{…#1…} of formatting alone
      for (const [name, d] of M.textMacros) if (chars.length < 100 && SAFE_NAME.test(name) && d.nargs === 1 && d.dflt == null && charStyleBody(d.body)) chars.push({ name, body: d.body });
    }
    return (this.stCat = { M, all, byV: new Map(all.map((x) => [x.v, x])), levels, chars, ch, cls });
  },
  // the name of a style value here ("Heading 2" for \section in a report)
  styleName(v) {
    const x = this.styleCatalog().byV.get(v);
    return x ? x.name : v === '' ? '' : isHeading(v) ? '\\' + v : v;
  },
  // the environments the paragraph styles stand for, as a set for quoteWords
  styleEnvNames() {
    const K = this.styleCatalog();
    if (!K.envNames) K.envNames = new Set(K.all.filter((x) => isEnvStyle(x.v)).map((x) => envOf(x.v)));
    return K.envNames;
  },
  envStyleOf(name) {
    const K = this.styleCatalog();
    return K.byV.has(name) ? name : K.byV.has('env:' + name) ? 'env:' + name : null;
  },

  // The style of the caret's block: v is 'p', 'title', a heading's command, 'latex', an
  // environment's style ('quote', 'theorem', 'env:claim') or '' (something else: a list, a table,
  // a figure); to, the styles the ribbon may change it to; b, where its words are for restyle
  // (src/styles.js). A selection over several paragraphs: many, each block's own.
  blockStyle(at) {
    const { c, it, B } = at, none = new Set();
    if (c.ghost) {
      // a line to come in a LaTeX paragraph keeps its paragraph's style
      if (this.ghost.tex) return { v: 'latex', to: none, why: WHY.line };
      const K = this.styleCatalog();
      return { v: this.ghost.style || 'p', to: new Set(['p', ...K.levels, 'part', 'latex', ...K.all.filter((x) => isEnvStyle(x.v)).map((x) => x.v)]) };
    }
    if (!it || !B) return { v: '', to: none };
    if (at.multi) return this.manyStyle(at);
    return this.styleOfBlock(B, it);
  },
  styleOfBlock(B, it) {
    const none = new Set(), ctx = it.dataset.ctx, K = this.styleCatalog();
    if (ctx === 'ttl') return { v: 'title', to: none, why: WHY.title };
    const src = this.src(B.f), envs = K.all.filter((x) => isEnvStyle(x.v)).map((x) => x.v);
    const heads = [...K.levels, 'part'];
    if (ctx === 'tex') {
      // back to what its source makes; a heading or an environment only of what is one paragraph of text
      const T = this.texBox(it);
      if (!T) return { v: 'latex', to: none };
      const words = src.slice(T.is, T.ie), to = new Set(['p']);
      if (T.para) { envs.forEach((v) => to.add(v)); if (!NOT_PLAIN.test(words) && words[0] !== '%') heads.forEach((h) => to.add(h)); }
      return { v: 'latex', to, b: { v: 'latex', s: T.ms, ws: T.is, we: T.ie, e: T.ie } };
    }
    const spot = latexSpot(src, B.s, B.e);
    const latex = (to) => { if (spot >= 0) to.add('latex'); return to; };
    if (ctx === 'h') {
      const m = HEAD.exec(src.slice(B.s, B.e));
      const v = m && isHeading(m[1]) ? m[1] : '';
      if (!v || src[B.e - 1] !== '}') return { v, to: latex(new Set()), b: { spot } };
      // the \label on the heading's next line stays with it: a paragraph made of it ends after the label
      const lab = /^[ \t]*\\label\s*\{[^}]*\}/.exec(src.slice(B.e, B.e + 400));
      const ws = B.s + m[0].length, we = B.e - 1;
      // (a heading with a short title for the contents keeps it only as a heading)
      const to = new Set(m[3] ? heads.filter((h) => h !== v) : ['p', ...envs, ...heads.filter((h) => h !== v)]);
      return { v, star: !!m[2], to: latex(to), b: { v, s: B.s, ws, we, e: B.e, after: lab ? B.e + lab[0].length : null, spot } };
    }
    const q = this.quoteOf(B);
    if (q) {
      const v = this.envStyleOf(q.name);
      if (v) {
        const to = new Set();
        if (q.opt) envs.filter((x) => x !== v && (THM_STYLES[x] && x !== 'proof' || (/^env:/.test(x) && this.model.thms.has(envOf(x))))).forEach((x) => to.add(x));
        else {
          // its paragraphs out of it, or in another environment; one paragraph of plain text may be a heading
          to.add('p'); envs.filter((x) => x !== v).forEach((x) => to.add(x));
          if (q.one && q.plain) heads.forEach((h) => to.add(h));
        }
        return { v, opt: q.opt, to: latex(to), b: { v, s: B.s, ws: q.ws, we: q.we, e: B.e, spot } };
      }
    }
    const r = this.plainPara(B, it);
    // (an environment only for a paragraph that starts its line: after \noindent or the like on the
    // same line, the environment would go in after it, and the way back would not be byte for byte)
    if (r) return { v: 'p', to: latex(new Set([...heads, ...(startsLine(src, r.s) ? envs : [])])), b: { v: 'p', s: r.s, ws: r.s, we: r.e, e: r.e, spot } };
    if (ctx === 'p' && B.items.length === 1 && !/\bthm\b/.test(it.className)) {
      // a paragraph with a footnote or a display in it: no heading can hold it, an environment can
      let s = B.s, e = B.e;
      while (s < e && /\s/.test(src[s])) s++;
      while (e > s && /\s/.test(src[e - 1])) e--;
      const words = src.slice(s, e), wrap = e > s && startsLine(src, s) && !/^\\begin\s*\{/.test(words) && !/\n[ \t]*\n/.test(words);
      return { v: 'p', to: latex(new Set(wrap ? envs : [])), b: { v: 'p', s, ws: s, we: e, e, spot } };
    }
    return { v: '', to: latex(new Set()), b: { spot } };
  },

  // A selection over several paragraphs: each block's style. Normal, a heading or LaTeX goes on
  // each of them (one undo for all); an environment goes once around all of them, where they are
  // paragraphs of one file standing one after the other.
  selBlocks() {
    const s = getSelection();
    if (!s.rangeCount) return [];
    const r = s.getRangeAt(0), el = (n) => (n.nodeType === 1 ? n : n.parentElement);
    const a = el(r.startContainer) && el(r.startContainer).closest('.it'), z = el(r.endContainer) && el(r.endContainer).closest('.it');
    if (!a || !z || !this.root.contains(a) || !this.root.contains(z)) return [];
    const out = [], seen = new Set();
    let on = false;
    for (const it of this.root.querySelectorAll('.it')) {
      if (it === a) on = true;
      if (on && !it.classList.contains('ghostp')) {
        const B = BLOCKS.get(+it.dataset.b);
        if (B && !seen.has(B)) { seen.add(B); out.push({ B, it }); }
        if (out.length > 400) return [];
      }
      if (it === z) break;
    }
    return out;
  },
  manyStyle(at) {
    const none = new Set(), list = this.selBlocks();
    if (!list.length) return { v: '', to: none, why: WHY.multi };
    const sts = list.map((x) => ({ ...x, st: this.styleOfBlock(x.B, x.it) }));
    const vs = new Set(sts.map((x) => x.st.v)), v = vs.size === 1 ? [...vs][0] : '';
    if (list.length === 1) return sts[0].st;
    // each may take it, or has it already
    const to = new Set();
    const K = this.styleCatalog(), f = list[0].B.f;
    const each = ['p', 'latex', ...K.levels, 'part'];
    for (const t of each) if (sts.every((x) => x.st.v === t || x.st.to.has(t)) && !sts.every((x) => x.st.v === t)) to.add(t);
    // one environment around paragraphs of text that follow one another in one file
    const paras = sts.every((x) => x.st.v === 'p' && x.st.b && x.B.f === f && x.st.to.size);
    const src = this.src(f);
    const joined = paras && sts.every((x, k) => k === 0 || !/\S/.test(stripComments(src.slice(sts[k - 1].st.b.e, x.st.b.s)).replace(/\\label\s*\{[^{}]*\}/g, ''))) && startsLine(src, sts[0].st.b.s);
    if (joined) for (const x of K.all) if (isEnvStyle(x.v) && sts.every((y) => y.st.to.has(x.v))) to.add(x.v);
    return { v, to, many: sts, why: to.size ? null : WHY.multi };
  },

  // Normal, a heading, LaTeX or an environment: the caret's block takes the style by the smallest
  // edit (restyle in src/styles.js): the words are not touched, the command, the environment or
  // the mark's line goes around them or away, with the \newtheorem an environment needs. One
  // commit, so one undo restores the source byte for byte. A blank paragraph (after Enter, a new
  // document) set to LaTeX or an environment shows so, and the mark or the environment goes in
  // with its first character.
  setBlockStyle(to) {
    const at = this.ribbonAt();
    if (!at) return;
    const { c } = at, cur = this.blockStyle(at);
    if (cur.v === to || !cur.to.has(to)) return;
    this.closeGroup();
    if (c.ghost) {
      const g = this.ghost, needs = this.styleNeeds(to);
      if (to === 'p' || to === 'latex' || (isEnvStyle(to) && !needs.length)) {
        g.style = to === 'p' ? null : to;
        g.pend = '';
        g.el.classList.toggle('tex', to === 'latex');
        g.el.classList.toggle('quote', isEnvStyle(to));
        this.paintGhost();
        return;
      }
      g.style = null;
      if (isEnvStyle(to)) this.ghostEnv(g, envOf(to), needs);
      else this.insertPiece(null, g, '\\' + to + '{', '}');
      this.closeGroup();
      return;
    }
    if (cur.many) { this.setManyStyle(cur, to, c); this.closeGroup(); return; }
    const f = at.B.f, r = restyle(this.src(f), cur.b, to, c.a);
    if (!r) return;
    const needs = this.styleNeeds(to), grow = needs.filter((x) => x.f === f && x.s <= cur.b.s).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.commit([...needs, ...r.edits.map((x) => ({ f, ...x }))], { f, p: r.p + grow, bias: -1 }, 'block');
    this.closeGroup();
  },
  setManyStyle(cur, to, c) {
    const list = cur.many, f0 = list[0].B.f;
    if (isEnvStyle(to)) {
      const src = this.src(f0), s = list[0].st.b.s, e = list[list.length - 1].st.b.e;
      const w = wrapBlockEdits(src, s, e, envOf(to));
      if (!w) return;
      const needs = this.styleNeeds(to), grow = needs.filter((x) => x.f === f0 && x.s <= s).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
      this.commit([...needs, ...w.map((x) => ({ f: f0, ...x }))], { f: f0, p: s + grow + w[1].t.length, bias: -1 }, 'block');
      return;
    }
    // each block, from the last back, so each sees its neighbours as they will be; one edit per file
    const byFile = new Map();
    for (const x of list) { if (!byFile.has(x.B.f)) byFile.set(x.B.f, []); byFile.get(x.B.f).push(x); }
    const edits = [];
    let caret = null;
    for (const [f, xs] of byFile) {
      const was = this.src(f);
      let t = was, first = null;
      for (const x of [...xs].sort((u, v) => v.st.b.s - u.st.b.s)) {
        if (x.st.v === to || !x.st.b) continue;
        // (positions before this block are those of the source as it was: only later blocks changed)
        const r = restyle(t, x.st.b, to, x.st.b.ws);
        if (!r) continue;
        t = applyEdits(t, r.edits);
        first = r.p;
      }
      const d = diffEdit(was, t);
      if (d) edits.push({ f, ...d });
      if (f === f0 && first != null) caret = { f, p: first, bias: -1 };
    }
    if (edits.length) this.commit(edits, caret || (c && !c.ghost ? { f: c.f, p: c.a, bias: -1 } : null), 'block');
  },
  // a blank paragraph set to an environment that needs a definition: the environment goes in at
  // once, with its definition, the caret inside it
  ghostEnv(g, name, needs) {
    const src = this.src(g.f);
    let nlB = 0; for (let k = g.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
    let nlA = 0; for (let k = g.pos; k < src.length && /\s/.test(src[k]); k++) if (src[k] === '\n') nlA++;
    const pre = g.pos === 0 ? '' : '\n'.repeat(Math.max(0, 2 - nlB)), post = g.pos >= src.length ? '' : '\n'.repeat(Math.max(0, 2 - nlA));
    const open = '\\begin{' + name + '}\n', t = pre + open + '\n\\end{' + name + '}' + post;
    const grow = needs.filter((x) => x.f === g.f && x.s <= g.pos).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.removeGhost();
    this.commit([...needs, { f: g.f, s: g.pos, e: g.pos, t }], { f: g.f, p: g.pos + grow + pre.length + open.length, bias: -1 }, 'block');
  },

  // What the preamble needs for a style, as edits of the main file: a theorem like environment's
  // \newtheorem (with its \theoremstyle and amsthm where it has a style of its own), amsthm for
  // proof. None where the preamble, a file it reads or the class defines the environment.
  styleNeeds(to) {
    const t = THM_STYLES[to];
    if (!t) return [];
    const f = this.main, src = this.src(f), K = this.styleCatalog(), M = this.model;
    const end = preambleEnd(src);
    if (end < 0) return [];
    const others = this.preambleOthers();
    const defined = OWN_THMS.test(K.cls) || (to !== 'proof' && ((M && M.thms.has(to)) || defines(src, to, 'environment', end) || others.some((x) => defines(x, to, 'environment', -1))));
    const ntheorem = !!packageLine(src, 'ntheorem', end) || others.some((x) => !!packageLine(x, 'ntheorem', -1));
    const ams = ['amsthm'];
    if (to === 'proof') return defined || ntheorem ? [] : this.packageEdits(ams);
    if (defined) return [];
    // the style in force at the preamble's end: a \theoremstyle there before would set this one too
    const pre = stripComments(src.slice(0, end));
    const k = pre.lastIndexOf('\\theoremstyle'), last = k < 0 ? null : /^\\theoremstyle\s*\{([^{}]*)\}/.exec(pre.slice(k, k + 200));
    const now = last ? last[1].trim() : 'plain', want = t.style || 'plain';
    let line = thmLine(to, false);
    if (!t.style && now !== 'plain') line = '\\theoremstyle{plain}\n' + line;
    // ntheorem has its own styles: its \newtheorem alone
    if (ntheorem) line = line.replace(/^\\theoremstyle\{[^}]*\}\n/, '');
    const style = /\\theoremstyle/.test(line) && want !== now;
    if (!style) line = line.replace(/^\\theoremstyle\{[^}]*\}\n/, '');
    const at = src.lastIndexOf('\n', end - 1) + 1, lead = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '', s = lead ? end : at;
    const def = { f, s, e: s, t: lead + line + '\n' };
    const pk = /\\theoremstyle/.test(line) && !ntheorem ? this.packageEdits(ams) : [];
    // (a package line at the same place goes first)
    return [def, ...pk];
  },

  // ---- headings: numbered or not -----------------------------------------------------------
  headingAt(at) {
    if (!at || !at.B || !at.it || at.it.dataset.ctx !== 'h' || at.c.ghost) return null;
    const src = this.src(at.B.f), m = HEAD.exec(src.slice(at.B.s, at.B.e));
    return m ? { cmd: m[1], star: !!m[2], s: at.B.s } : null;
  },
  toggleHeadingStar(at) {
    const h = this.headingAt(at);
    if (!h) return false;
    const f = at.B.f, ed = starEdits(this.src(f), { s: h.s });
    if (!ed) return false;
    const c = at.c, d = ed[0].t.length - (ed[0].e - ed[0].s);
    this.closeGroup();
    this.commit(ed.map((x) => ({ f, ...x })), c.collapsed ? { f, p: c.a + (c.a > ed[0].s ? d : 0), bias: -1 } : { f, p: c.b + d, selA: c.a + d, selB: c.b + d }, 'format');
    this.closeGroup();
    return true;
  },
  // the document's headings numbered or not: \setcounter{secnumdepth}{0} in the preamble, and off again
  toggleNumbering() {
    const f = this.main, src = this.src(f), M = this.model;
    const on = M.opts.secnumdepth >= (M.opts.chapters ? 0 : 1);
    const ed = numberingEdits(src, on, M.opts.chapters);
    if (!ed || !ed.length) return false;
    const c = this.caretNow(), grow = ed.reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.closeGroup();
    this.commit(ed.map((x) => ({ f, ...x })), c && !c.ghost ? { f: c.f, p: c.a + (c.f === f && c.a >= ed[0].s ? grow : 0), bias: -1 } : null, 'format');
    this.closeGroup();
    return true;
  }
};
