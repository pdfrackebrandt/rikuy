// Batch B2, paragraphs: Word's Paragraph group (Show marks, Align Left, Center, Align Right,
// Justify, Line and Paragraph Spacing, Shading, Borders, the Paragraph dialog; Decrease and
// Increase Indent are B3's buttons, which run paragraph-outdent and paragraph-indent here outside
// a list), Layout's Paragraph fields (indents, spacing before and after) and Design's Paragraph
// Spacing. Every command writes the LaTeX a person writes for it (src/parasrc.js has the edits:
// center, flushright and flushleft; setspace; changepage's adjustwidth; \vspace; tcolorbox;
// samepage; \nopagebreak; \clearpage; parskip; \widowpenalty), reads the same written by hand,
// and takes exactly that off again; each is one commit, so one undo.
//
// A paragraph is one the page's model gives its source range (item.ps, item.pe in src/model.js):
// paragraphs of the text, of a quote, of a theorem, of a box. Not a heading (its style's), a list
// item (the list's: B3), a table's cell (B7), a footnote, a caption or a LaTeX paragraph (its
// source is what the person types).

import { register, command, onInstall } from '../commands.js';
import { openMenu, colorPicker, colorNeeds } from '../ui/kit.js';
import { $, store, PREFS } from '../ui/dom.js';
import * as P from '../parasrc.js';
import { usePackages, preambleEnd, hasPackage, docClass, packageOptions } from '../preamble.js';
import { envWords, declAtStart, startsLine, eolAt } from '../blockenv.js';
import { mapPos } from '../wrap.js';
import { parsedText } from '../model.js';
import { scriptSetup, rtlDocument, RTL_LANGUAGES } from '../scripts.js';
import { openParagraphDialog, paraField } from '../ui/paradialog.js';

// ---- where the caret is, once for each look at the ribbon ---------------------------------------
// (at.memo is shared by every batch: keys of this one start with b2)
const paraOf = (app, at) => { if (!at) return null; const m = at.memo || (at.memo = {}); if (!('b2para' in m)) m.b2para = app.paraUnits(at); return m.b2para; };
const canAlign = (app, at) => { const p = paraOf(app, at); return !!p && !p.why; };
const can = (app, at) => { const p = paraOf(app, at); return !!p && !p.why && !p.float; };
const why = (app, at) => { const p = paraOf(app, at); return p && p.why ? p.why : 'Click in a paragraph of the page first.'; };
const alignNow = (app, at) => { const p = paraOf(app, at); if (!p || p.why) return undefined; const m = at.memo; if (!('b2align' in m)) m.b2align = app.paraAlignNow(p); return m.b2align; };
const docOK = (app) => !!app.model && preambleEnd(app.src(app.main)) >= 0;

const ICON = {
  left: '<path d="M3 4.5h14M3 8h9M3 11.5h14M3 15h9"/>',
  center: '<path d="M3 4.5h14M5.5 8h9M3 11.5h14M5.5 15h9"/>',
  right: '<path d="M3 4.5h14M8 8h9M3 11.5h14M8 15h9"/>',
  justify: '<path d="M3 4.5h14M3 8h14M3 11.5h14M3 15h14"/>',
  spacing: '<path d="M9 5h8M9 10h8M9 15h8M4.5 4v12M2.5 6l2-2 2 2M2.5 14l2 2 2-2"/>',
  marks: '<path d="M9.5 16V4h6M13 4v12M9.5 4a3.2 3.2 0 0 0 0 6.4"/>',
  shading: '<path d="M4.5 9.5l5-5 5.5 5.5-5 5zM4.5 9.5h10.5M16.5 12.5s-1.5 2-1.5 3a1.5 1.5 0 0 0 3 0c0-1-1.5-3-1.5-3z"/>',
  borders: '<path d="M3.5 16.5h13" stroke-width="2"/><path d="M3.5 3.5h13M3.5 3.5v10M16.5 3.5v10" stroke-dasharray="1 2.2"/>',
  settings: '<path d="M4 4h12v12H4zM11 13h2v-2M13 13l-4-4"/>',
  paraSpacing: '<path d="M4 3.5h12M4 6.5h12M4 13.5h12M4 16.5h12M10 8.5v3M8.5 9.7L10 8.5l1.5 1.2M8.5 10.3L10 11.5l1.5-1.2"/>'
};
// Word's menu of line spacing: what each writes (src/parasrc.js, spacing)
const SPACINGS = [['1.0', { lines: 1 }], ['1.15', { multiple: 1.15 }], ['1.5', { lines: 1.5 }], ['2.0', { lines: 2 }], ['2.5', { multiple: 2.5 }], ['3.0', { multiple: 3 }]];
const spacingArg = (a) => { if (a && typeof a === 'object' && (a.lines || a.multiple)) return a; const x = SPACINGS.find(([k]) => k === String(a) || +k === +a); return x ? x[1] : null; };

const align = (to, name, key, more = {}) => ({
  id: to === 'justify' ? 'justify' : 'align-' + to, name, order: { left: 80, center: 90, right: 100, justify: 110 }[to], tab: 'home', group: 'paragraph', kind: 'toggle', icon: ICON[to], keys: [key],
  when: canAlign, whyNot: why, on: (app, at) => { const v = alignNow(app, at); return v === undefined ? null : (v || 'justify') === to; },
  run: (app, args, at) => app.paraAlign(to, at), ...more
});

register(
  // Home's Decrease Indent and Increase Indent are B3's (src/cmd/lists.js): in a list they move the
  // item a level; outside one they run these, a paragraph's left indent by Word's steps
  { id: 'paragraph-outdent', name: 'Decrease paragraph indent', title: 'Decrease paragraph indent: the left indent to the step of 1.27 cm before (changepage\'s adjustwidth); Home\'s Decrease Indent runs it outside a list',
    synonyms: ['Outdent paragraph', 'Indent less', 'adjustwidth'],
    when: (app, at) => app.paraIndentCan(at, -1), whyNot: (app, at) => app.paraIndentWhy(at, -1), run: (app, args, at) => app.paraIndentStep(-1, at) },
  { id: 'paragraph-indent', name: 'Increase paragraph indent', title: 'Increase paragraph indent: the left indent to the next step of 1.27 cm (changepage\'s adjustwidth); Home\'s Increase Indent runs it outside a list',
    synonyms: ['Indent paragraph', 'Indent more', 'adjustwidth'],
    when: (app, at) => app.paraIndentCan(at, 1), whyNot: (app, at) => app.paraIndentWhy(at, 1), run: (app, args, at) => app.paraIndentStep(1, at) },
  { id: 'show-marks', name: 'Show marks', order: 70, tab: 'home', group: 'paragraph', kind: 'toggle', icon: ICON.marks, keys: ['Ctrl+Shift+8'],
    also: [{ tab: 'view', group: 'show', name: 'Formatting marks', order: 30 }],
    title: 'Show marks (Ctrl+Shift+8): ¶ at the end of each paragraph, ↵ at each line break (\\\\), → at each \\hfill, and the space of \\vspace; nothing is written',
    synonyms: ['Show/Hide', 'Show/Hide ¶', 'Formatting marks', 'Pilcrow', 'Paragraph marks', 'Hidden marks'],
    when: (app) => !!app.model, on: (app) => !!app.marksOn, run: (app) => app.toggleMarks() },
  align('left', 'Align Left', 'Ctrl+L', { title: 'Align Left (Ctrl+L): ragged right, the flushleft environment', synonyms: ['Left', 'Ragged right', 'flushleft', 'raggedright'] }),
  align('center', 'Center', 'Ctrl+E', { title: 'Center (Ctrl+E): the center environment (\\centering in a figure or a table)', synonyms: ['Centre', 'Align center', 'Centered', 'centering'] }),
  align('right', 'Align Right', 'Ctrl+R', { title: 'Align Right (Ctrl+R): ragged left, the flushright environment', synonyms: ['Right', 'Ragged left', 'flushright', 'raggedleft'] }),
  align('justify', 'Justify', 'Ctrl+J', { title: 'Justify (Ctrl+J): both edges straight, as LaTeX sets text: no environment', synonyms: ['Justified', 'Block', 'Full justification'] }),
  { id: 'line-spacing', name: 'Line and Paragraph Spacing', order: 120, tab: 'home', group: 'paragraph', kind: 'menu', icon: ICON.spacing,
    title: 'Line and Paragraph Spacing: 1.0, 1.15, 1.5 or 2.0 for the paragraph (setspace\'s environments) or the whole document, and space before or after it',
    synonyms: ['Line spacing', 'Spacing', 'Double spacing', 'One and a half spacing', 'setspace', 'onehalfspacing', 'doublespacing', 'Space before', 'Space after'],
    when: (app, at) => can(app, at) || docOK(app), whyNot: why, run: (app, args, at) => (args != null ? app.paraSpacing(args, at) : app.paraSpacingMenu(at)) },
  { id: 'shading', name: 'Shading', order: 130, tab: 'home', group: 'paragraph', kind: 'split', icon: ICON.shading,
    title: 'Shading: the paragraph on a colour (tcolorbox), the colour picked last; the arrow for every colour and No Color',
    synonyms: ['Paragraph shading', 'Background colour', 'Shade', 'tcolorbox'],
    when: can, whyNot: why, run: (app, args, at) => app.paraShade(args && 'color' in args ? args.color : undefined, at),
    menuItems: (app, at) => [{ name: 'Shading Colors…', title: 'Every colour: Word\'s, xcolor\'s, dvipsnames, and No Color', run: () => app.paraShadePicker(at) }] },
  { id: 'borders', name: 'Borders', order: 140, tab: 'home', group: 'paragraph', kind: 'split', icon: ICON.borders,
    title: 'Borders: the border picked last (a rule below the paragraph at first); the arrow for top, outside, none and a horizontal line',
    synonyms: ['Border', 'Bottom border', 'Box', 'Frame', 'Paragraph border'],
    when: can, whyNot: why, run: (app, args, at) => app.paraBorder(args && args.kind ? args.kind : app.paraBorderLast || 'bottom', at),
    menuItems: (app, at) => app.paraBorderMenu(at) },
  { id: 'paragraph-settings', name: 'Paragraph Settings', order: 150, tab: 'home', group: 'paragraph', icon: ICON.settings, menu: { text: 92, selection: 92 },
    title: 'Paragraph…: indents, spacing, line spacing, alignment, page breaks and the whole document\'s settings',
    synonyms: ['Paragraph', 'Paragraph…', 'Paragraph dialog', 'Indents and Spacing', 'Line and Page Breaks'],
    when: (app, at) => can(app, at) || docOK(app), whyNot: why, run: (app, args, at) => app.paraDialog(args, at) },
  // the dialog's choices and the menus' items, each a command of its own for the search box and agents
  { id: 'space-before', name: 'Space Before Paragraph', kind: 'toggle', title: 'Add or remove 12 pt of space before the paragraph (\\vspace{12pt} on the line before it)', synonyms: ['Add space before paragraph', 'Remove space before paragraph', 'vspace'],
    when: can, whyNot: why, on: (app, at) => { const p = paraOf(app, at); return p && !p.why ? P.spaceOf(p.units[0].U, 'before').pt > 0 : null; }, run: (app, args, at) => app.paraSpace('before', args, at) },
  { id: 'space-after', name: 'Space After Paragraph', kind: 'toggle', title: 'Add or remove 12 pt of space after the paragraph (\\vspace{12pt} on the line after it)', synonyms: ['Add space after paragraph', 'Remove space after paragraph'],
    when: can, whyNot: why, on: (app, at) => { const p = paraOf(app, at); return p && !p.why ? P.spaceOf(p.units[0].U, 'after').pt > 0 : null; }, run: (app, args, at) => app.paraSpace('after', args, at) },
  { id: 'keep-with-next', name: 'Keep with next', kind: 'toggle', title: 'Keep with next: no page break between this paragraph and the next one (\\nopagebreak after it)', synonyms: ['nopagebreak', 'Keep together with next'],
    when: can, whyNot: why, on: (app, at) => app.paraFlag(at, 'keep'), run: (app, args, at) => app.paraToggle('keep', args, at) },
  { id: 'keep-lines-together', name: 'Keep lines together', kind: 'toggle', title: 'Keep lines together: the paragraph is not broken across pages (the samepage environment)', synonyms: ['samepage', 'No page break inside'],
    when: can, whyNot: why, on: (app, at) => app.paraFlag(at, 'samepage'), run: (app, args, at) => app.paraToggle('samepage', args, at) },
  { id: 'page-break-before', name: 'Page break before', kind: 'toggle', title: 'Page break before: the paragraph starts a new page (\\clearpage on the line before it)', synonyms: ['clearpage', 'New page before'],
    when: can, whyNot: why, on: (app, at) => app.paraFlag(at, 'break'), run: (app, args, at) => app.paraToggle('break', args, at) },
  { id: 'widow-control', name: 'Widow/Orphan control', kind: 'toggle', title: 'Widow/Orphan control: never one line of a paragraph alone at the top or the foot of a page, in the whole document (\\widowpenalty=10000 and \\clubpenalty=10000)', synonyms: ['Widows', 'Orphans', 'Club lines', 'widowpenalty'],
    when: docOK, whyNot: () => 'This file has no preamble.', on: (app) => (app.model ? P.widowControl(app.src(app.main)).on : null), run: (app, args) => app.paraWidows(args) },
  { id: 'suppress-line-numbers', name: 'Suppress line numbers', kind: 'toggle', title: 'Suppress line numbers: no line numbers beside this paragraph (lineno\'s nolinenumbers environment)', synonyms: ['nolinenumbers', 'No line numbers here'],
    when: (app, at) => can(app, at) && app.paraLineno(), whyNot: (app, at) => (can(app, at) ? 'The document numbers no lines (Layout › Line Numbers).' : why(app, at)), on: (app, at) => app.paraFlag(at, 'nolineno'), run: (app, args, at) => app.paraToggle('nolineno', args, at) },
  { id: 'dont-hyphenate', name: 'Don\'t hyphenate', kind: 'toggle', title: 'Don\'t hyphenate: no word of this paragraph broken at a line\'s end (babel\'s hyphenrules with nohyphenation)', synonyms: ['No hyphenation', 'hyphenrules', 'nohyphenation'],
    when: (app, at) => can(app, at) && app.paraBabel(), whyNot: (app, at) => (can(app, at) ? 'Needs babel or polyglossia in the preamble, whose hyphenrules environment sets it.' : why(app, at)), on: (app, at) => app.paraFlag(at, 'nohyph'), run: (app, args, at) => app.paraToggle('nohyph', args, at) },
  { id: 'horizontal-line', name: 'Horizontal Line', title: 'Horizontal Line: a rule across the text after this paragraph, a paragraph of its own (\\noindent\\rule{\\linewidth}{0.4pt})', synonyms: ['Horizontal rule', 'Rule', 'Divider', 'hrule'],
    when: can, whyNot: why, run: (app, args, at) => app.paraHR(at) },
  { id: 'rtl-paragraph', name: 'Right-to-Left Text Direction', title: 'This paragraph runs from the right (otherlanguage with the document\'s right to left language; bidi\'s RTL)', synonyms: ['Right to left', 'RTL', 'Arabic paragraph', 'Hebrew paragraph'],
    when: (app, at) => can(app, at) && !!app.paraDirs().rtl, whyNot: (app, at) => (can(app, at) ? 'The document sets up no right to left language: type Arabic or Hebrew text, and Rikuy offers its set up.' : why(app, at)), kind: 'toggle',
    on: (app, at) => (can(app, at) && app.paraDirs().rtl ? app.paraDirNow(at) === 'rtl' : null), run: (app, args, at) => app.paraDirection('rtl', at) },
  { id: 'ltr-paragraph', name: 'Left-to-Right Text Direction', title: 'This paragraph runs from the left (otherlanguage with the document\'s left to right language; bidi\'s LTR)', synonyms: ['Left to right', 'LTR'],
    when: (app, at) => can(app, at) && !!app.paraDirs().rtl, whyNot: (app, at) => (can(app, at) ? 'The document sets up no right to left language: every paragraph runs from the left.' : why(app, at)), kind: 'toggle',
    on: (app, at) => (can(app, at) && app.paraDirs().rtl ? app.paraDirNow(at) === 'ltr' : null), run: (app, args, at) => app.paraDirection('ltr', at) },
  { id: 'tab-leader', name: 'Tabs', title: 'Tabs…: a stop at the right margin with a leader of dots, a line or none (\\dotfill, \\hrulefill, \\hfill), at the caret', synonyms: ['Tab stops', 'Leader', 'Dot leader', 'dotfill', 'hfill'],
    when: (app, at) => can(app, at) && !!(at && at.c && !at.c.ghost), whyNot: why, run: (app, args, at) => (args ? app.paraLeader(args, at) : app.paraDialog({ tab: 'tabs' }, at)) },
  // Layout › Paragraph: the indents and the spacing as fields (folded, each opens the dialog there)
  ...['indent-left', 'indent-right', 'spacing-before', 'spacing-after'].map((id, k) => ({
    id, name: ['Indent Left', 'Indent Right', 'Spacing Before', 'Spacing After'][k], el: 'rl-' + id, role: 'spinbutton', kind: 'custom', tab: 'layout', group: 'paragraph', order: 10 + k * 10,
    title: ['Indent Left: the paragraph\'s left indent in cm (adjustwidth)', 'Indent Right: the paragraph\'s right indent in cm (adjustwidth)', 'Spacing Before: the space before the paragraph in points (\\vspace)', 'Spacing After: the space after the paragraph in points (\\vspace)'][k],
    synonyms: [['Left indent'], ['Right indent'], ['Space before'], ['Space after']][k],
    render: (app) => paraField(app, id), sync: (app, at) => app.paraFieldSync(id, at), when: can, whyNot: why, run: (app, args, at) => (args != null ? app.paraFieldSet(id, args, at) : app.paraDialog({ focus: id }, at))
  })),
  // Design › Document formatting: Word's paragraph spacing sets for the whole document
  { id: 'paragraph-spacing', name: 'Paragraph Spacing', order: 40, tab: 'design', group: 'formatting', kind: 'menu', icon: ICON.paraSpacing, label: 'Paragraph Spacing',
    title: 'Paragraph Spacing: the whole document\'s space between paragraphs and line spacing, as Word\'s sets (parskip and setspace)',
    synonyms: ['Document paragraph spacing', 'parskip', 'Space between paragraphs', 'No paragraph space', 'Compact', 'Open', 'Relaxed'],
    when: docOK, whyNot: () => 'This file has no preamble.', run: (app, args) => (args != null ? app.paraSet(args) : app.paraSetMenu()) }
);

// Show marks as it was left, as Word keeps it
onInstall((app) => { if (app.prefs && app.prefs.marks) app.toggleMarks(true); });

export const methods = {
  // ---- the paragraphs the caret or the selection is in ----------------------------------------
  // { f, src, units: [{ U, it, B }] } or { why } (null without a caret on the page). Paragraphs
  // side by side with nothing of their own around them are one unit (one environment goes around
  // them all, as Word aligns a selection).
  paraUnits(at) {
    if (!at || !at.c) return null;
    const c = at.c, M = this.model;
    if (!M) return null;
    if (c.ghost) return { why: 'Type the paragraph first: its settings go around its words.' };
    if (at.cell) return { why: 'In a table, a cell\'s alignment is its column\'s (Table Layout).' };
    const ctx = at.ctx || (at.it && at.it.dataset.ctx) || '';
    if (ctx === 'li') return { why: 'Not for one item of a list: LaTeX sets a list as a whole.', list: true };
    if (ctx === 'h') return { why: 'A heading\'s alignment and spacing are its style\'s (Modify Style).' };
    if (ctx === 'tex') return { why: 'A LaTeX paragraph is its source: write the environment in it.' };
    if (ctx === 'fn') return { why: 'Not inside a footnote.' };
    if (ctx === 'cap') return { why: 'A caption is set by its figure or table.' };
    if (ctx === 'ttl') return { why: 'The title is \\maketitle\'s.' };
    const f = c.f, src = this.src(f), a = c.a, b = c.collapsed ? c.a : c.b;
    const found = [], seen = new Set();
    let float = null, thm = false;
    // (the blocks the caret or the selection is in, and a few on either side: a paragraph with
    // display math in it is several blocks of the page and one paragraph to TeX)
    const BS = M.blocks;
    let k0 = -1, k1 = -1;
    for (let k = 0; k < BS.length; k++) { const B = BS[k]; if (B.f !== f || B.e < a || B.s > b) continue; if (k0 < 0) k0 = k; k1 = k; }
    const flat = [];
    if (k0 >= 0) for (let k = Math.max(0, k0 - 20); k <= Math.min(BS.length - 1, k1 + 20); k++) if (BS[k].f === f) for (const it of BS[k].items) flat.push({ it, B: BS[k], k });
    const para = (x) => !!x && x.it.type === 'p' && x.it.ps != null && x.it.ctx === 'p' && !x.it.lead && !x.it.thmFirst && (!x.it.f || x.it.f === f);
    const back = (i) => { let j = i - 1; while (j >= 0 && flat[j].it.type === 'math') j--; return j < i - 1 && para(flat[j]) ? j : -1; };
    const fwd = (i) => { let j = i + 1; while (j < flat.length && flat[j].it.type === 'math') j++; return j > i + 1 && para(flat[j]) && flat[j].it.cont ? j : -1; };
    for (let i = 0; i < flat.length; i++) {
      const { it, B, k } = flat[i];
      if (k < k0 || k > k1 || B.e < a || B.s > b) continue;
      if (it.type === 'float' && B.s <= a && a <= B.e && c.collapsed) float = B;
      if (it.type !== 'p' || it.ps == null || (it.f && it.f !== f)) continue;
      if (it.pe < a || it.ps > b || (!c.collapsed && (it.pe <= a || it.ps >= b))) continue;
      if (it.thmFirst) { thm = true; continue; }
      if (it.ctx !== 'p' || it.lead || seen.has(it)) continue;
      // (a paragraph with display math in it is one paragraph to TeX: the words before the formula,
      // the formula and the words after it go together)
      let i0 = i, i1 = i;
      for (let n = 0; n < 50 && flat[i0].it.cont && back(i0) >= 0; n++) i0 = back(i0);
      for (let n = 0; n < 50 && fwd(i1) >= 0; n++) i1 = fwd(i1);
      const parts = flat.slice(i0, i1 + 1).filter((x) => x.it.type === 'p');
      for (const x of parts) seen.add(x.it);
      const first = parts[0], z = parts[parts.length - 1];
      found.push({ it: first.it, last: z.it, B: first.B, lo: first.B.s, hi: z.B.e });
    }
    if (found.length > 5000) return { why: 'Select fewer paragraphs (at most 5000) for a paragraph setting, or set it for the whole document.' };
    if (!found.length) {
      if (float) return { f, src, units: [], float };
      if (thm) return { why: 'The first paragraph of a theorem starts with its heading (Theorem 1.) and is set as the theorem is; its other paragraphs take paragraph settings.' };
      return { why: at.multi ? 'Select whole paragraphs of the text.' : 'Click in a paragraph of the text.' };
    }
    // (the parse the page's model made of this text: a long text is not parsed again at every move
    // of the caret)
    const whole = parsedText(src);
    const vis = (x, y) => (x.vs != null && y.ve != null ? { vs: x.vs, ve: y.ve } : null);
    const units = [];
    for (const x of found) {
      const U = P.unitOf(src, x.it.ps, x.last.pe, x.lo, x.hi, vis(x.it, x.last), whole);
      if (!U) continue;
      // (a plain paragraph right after a plain one, in the same place: one unit with it)
      const last = units[units.length - 1];
      if (last && last.plain && U.levels.length === 1 && !U.group && !U.inArg && sameScope(last.U, U) && !/\S/.test(src.slice(last.U.te, U.ts).replace(/%[^\n]*/g, ''))) {
        const lo = Math.min(last.lo, x.lo), hi = Math.max(last.hi, x.hi);
        const M2 = P.unitOf(src, last.ps, x.last.pe, lo, hi, last.vs != null && x.last.ve != null ? { vs: last.vs, ve: x.last.ve } : null, whole);
        if (M2 && M2.levels.length === 1 && !M2.inArg) { Object.assign(last, { U: M2, hi, its: [...last.its, x.last] }); continue; }
      }
      units.push({ U, it: x.it, its: [x.last], B: x.B, ps: x.it.ps, vs: x.it.vs, lo: x.lo, hi: x.hi, plain: U.levels.length === 1 && !U.group && !U.inArg });
    }
    if (!units.length) return { why: 'Click in a paragraph of the text.' };
    if (units.some((u) => u.U.inArg)) return { why: 'This paragraph is inside a group or an argument of a command, or a group runs from it into another paragraph: change it in the source.' };
    return { f, src, units };
  },

  // The edits of every unit made one after another on the text, each unit read again in the text
  // the ones before it left (an environment one of them split or joined is the one the next sees),
  // then everything as one step of history, the caret and the selection mapped through each edit.
  // ops: [(text, U, u) => edits | { why } | null], each run on every unit in turn (the dialog's
  // several settings); fileOps: [{ f, op: (text, others) => edits | { text } | { why } }] after
  // them (the document's settings, a figure's alignment). The packages what was written needs go
  // in the main file in the same step. caret0: the caret to keep, where the page no longer has it
  // (the dialog had the focus).
  paraRun(p, ops, fileOps = [], kind = 'para', caret0 = null) {
    const texts = new Map(), get = (f) => (texts.has(f) ? texts.get(f) : this.src(f));
    const c = caret0 || this.caretNow(), car = c && !c.ghost ? { f: c.f, a: c.a, b: c.collapsed ? c.a : c.b, one: !!c.collapsed } : null;
    const wrote = [];
    const pf = p && !p.why && !p.float ? p.f : null;
    const items = pf ? p.units.map((u) => { const z = u.its[u.its.length - 1]; return { u, ps: u.ps, pe: z.pe, vs: u.vs, ve: z.ve, lo: u.lo, hi: u.hi }; }) : [];
    const step = (f, ed) => {
      const o = [...ed].sort((x, y) => x.s - y.s || x.e - y.e);
      for (let i = 1; i < o.length; i++) if (o[i].s < o[i - 1].e) { this.toast('These paragraph settings overlap in the source: change one at a time.'); return false; }
      texts.set(f, applyEdits(get(f), ed));
      for (const x of ed) wrote.push(x.t);
      const m = (x, bias) => (x == null ? x : mapPos(ed, x, bias));
      if (f === pf) for (const it of items) { it.ps = m(it.ps, 1); it.pe = m(it.pe, -1); it.vs = m(it.vs, 1); it.ve = m(it.ve, -1); it.lo = m(it.lo, -1); it.hi = m(it.hi, 1); }
      if (car && car.f === f) { car.a = mapCaret(ed, car.a); car.b = mapCaret(ed, car.b); }
      return true;
    };
    for (const it of items) {
      for (const op of ops) {
        const text = get(pf);
        const U = P.unitOf(text, it.ps, it.pe, it.lo, it.hi, it.vs != null && it.ve != null ? { vs: it.vs, ve: it.ve } : null, texts.has(pf) ? null : parsedText(text));
        if (!U) break;
        const ed = op(text, U, it.u);
        if (!ed) continue;
        if (ed.why) { this.toast(ed.why); return false; }
        if (ed.length && !step(pf, ed)) return false;
      }
    }
    for (const { f, op } of fileOps) {
      const text = get(f), r = op(text, this.preambleOthers());
      if (!r) continue;
      if (r.why) { this.toast(r.why); return false; }
      const ed = typeof r.text === 'string' ? diffEdits(text, r.text) : r;
      if (ed.length && !step(f, ed)) return false;
    }
    // (the packages what was written needs, in the main file's text)
    const need = this.paraNeeds(wrote.join('\n'), get(this.main));
    if (need.length && !step(this.main, need.map(({ s, e, t }) => ({ s, e, t })))) return false;
    const all = [];
    for (const [f, t] of texts) for (const x of diffEdits(this.src(f), t)) all.push({ f, ...x });
    if (!all.length) return false;
    const caret = !car ? null : car.one ? { f: car.f, p: car.a, bias: -1 } : { f: car.f, p: car.a, selA: car.a, selB: car.b };
    this.closeGroup();
    this.commit(all, caret, kind);
    this.closeGroup();
    return true;
  },

  // The packages what is written needs, in the main file, in the same commit: changepage for
  // adjustwidth and setspace for its environments (memoir has both), tcolorbox, and xcolor's
  // dvipsnames for a colour of that list (passed to xcolor where another package loads it)
  paraNeeds(t, main = this.src(this.main)) {
    const d = docClass(main), memoir = !!d && d.name === 'memoir', others = this.preambleOthers();
    // (one call, xcolor first: a line of its own after tcolorbox's would clash with the xcolor
    // tcolorbox loaded without the option)
    const want = {}, out = [];
    const m = /colback=([A-Za-z]+)/.exec(t);
    if (m && colorNeeds(m[1]) === 'dvipsnames') {
      const implicit = ['tcolorbox', 'tikz', 'pgfplots', 'mdframed', 'pgf'].some((x) => hasPackage(main, x, undefined, others));
      const pass = '\\PassOptionsToPackage{dvipsnames}{xcolor}';
      if (!hasPackage(main, 'xcolor', undefined, others) && implicit && d) { if (!main.slice(0, d.e + 200).includes(pass)) out.push({ f: this.main, s: d.e, e: d.e, t: eolAt(main, 0) + pass }); }
      else want.xcolor = 'dvipsnames';
    }
    if (!memoir && /\\begin\{adjustwidth\*?\}/.test(t)) want.changepage = null;
    if (!memoir && /\\begin\{(?:singlespace|onehalfspace|doublespace|spacing)\}/.test(t)) want.setspace = null;
    if (/\\begin\{tcolorbox\}/.test(t)) want.tcolorbox = null;
    if (Object.keys(want).length) out.push(...usePackages(main, want, { others }).map((x) => ({ f: this.main, ...x })));
    return out;
  },

  paraApply(f, edits, kind = 'para', more = []) {
    const all = [...edits.map((x) => ({ f, ...x })), ...more];
    if (!all.length) return false;
    // (two edits over one stretch of text would garble it: none is made then)
    const byF = new Map();
    for (const x of all) { if (!byF.has(x.f)) byF.set(x.f, []); byF.get(x.f).push(x); }
    for (const list of byF.values()) {
      const s = [...list].sort((u, v) => u.s - v.s || u.e - v.e);
      for (let i = 1; i < s.length; i++) if (s[i].s < s[i - 1].e) { this.toast('These paragraph settings overlap in the source: change one at a time.'); return false; }
    }
    const c = this.caretNow();
    const mine = all.filter((x) => c && x.f === c.f);
    const map = (p) => mapCaret(mine, p);
    const caret = !c || c.ghost ? null : c.collapsed ? { f: c.f, p: map(c.a), bias: -1 } : { f: c.f, p: map(c.a), selA: map(c.a), selB: map(c.b) };
    this.closeGroup();
    this.commit(all, caret, kind);
    this.closeGroup();
    return true;
  },

  // ---- alignment ------------------------------------------------------------------------------
  paraAlignNow(p) {
    if (p.float) return this.floatAlign(p.float).v;
    const vs = p.units.map((u) => P.alignOf(p.src, u.U, u.it.align || null).v || null);
    return vs.every((v) => v === vs[0]) ? vs[0] : 'mixed';
  },
  paraAlign(to, at) {
    const p = paraOf(this, at);
    if (!p || p.why) { if (p && p.why) this.toast(p.why); return false; }
    // (pressed again it goes back to LaTeX's own, justified, as Word's Ctrl+E goes back to its own)
    // (in a figure: back to the class's own)
    if (to !== 'justify' && this.paraAlignNow(p) === to) to = 'justify';
    if (p.float) return this.floatAlignSet(p.f, p.float, to);
    return this.paraRun(p, [(text, U, u) => P.alignEdits(text, U, to, { inherit: u.it.align || null })]);
  },
  // A figure's or a table's alignment: \centering (\raggedleft, \raggedright) at the start of its
  // body, \centerline around its one line, or a center (or centering) environment around the whole
  // of it; none: the class's own (src/model.js, opts.floatAlign: centred in beamer, the AMS
  // classes, revtex, acmart and with floatrow; else at the left margin). { v (as the page draws
  // it), own (written in it), dflt, d, inner, W }
  floatAlign(B) {
    const src = this.src(B.f), dflt = (this.model && this.model.opts.floatAlign) || 'left';
    const m = /^\\begin\s*\{([A-Za-z*]+)\}/.exec(src.slice(B.s, B.s + 60));
    const W = m && envWords(src, B.s, B.e, [m[1]], {}, new Set([m[1]]));
    if (!W) return { v: dflt, own: null, dflt, W: null };
    const d = declAtStart(src, W.ws, W.we, ['centering', 'raggedleft', 'raggedright']);
    if (d) return { v: P.DECL_ALIGN[d.name], own: P.DECL_ALIGN[d.name], dflt, d, W };
    // (an environment at the body's start: around all of it, or around its first part, a caption after it)
    const im = /^\\begin\s*\{(center|flushleft|flushright|centering)\}/.exec(src.slice(W.ws, W.ws + 40));
    const iz = im ? src.indexOf('\\end{' + im[1] + '}', W.ws) : -1;
    const inner = iz > 0 && iz < W.we ? envWords(src, W.ws, iz + im[1].length + 6, [im[1]]) : null;
    if (inner) { const v = inner.name === 'centering' ? 'center' : P.ENV_ALIGN[inner.name]; return { v, own: v, dflt, inner, W }; }
    if (/^\\centerline\s*\{/.test(src.slice(W.ws, W.ws + 20))) return { v: 'center', own: 'center', dflt, W, line: true };
    return { v: dflt, own: null, dflt, W };
  },
  // The edits that give the float B (as the model has it in src) the alignment to ('justify': the
  // class's own), or { why }
  floatAlignEdits(src, B, to) {
    const cur = this.floatAlign(B), v = to === 'justify' ? cur.dflt : to;
    if (!cur.W) return { why: 'Rikuy cannot read this figure\'s environment: change it in the source.' };
    if (cur.v === v && (cur.own == null || cur.own === v)) return [];
    if (cur.line) return { why: 'This figure is centred by \\centerline: change it in the source.' };
    // (the class's own: the declaration or the environment goes)
    if (v === cur.dflt && cur.own != null) {
      if (cur.d) return [{ s: cur.d.s, e: cur.d.e, t: '' }];
      return [{ s: cur.inner.we, e: cur.inner.e, t: '' }, { s: cur.inner.s, e: cur.inner.ws, t: '' }];
    }
    if (v === cur.dflt) return [];
    if (cur.d) return [{ s: cur.d.s, e: cur.d.s + cur.d.name.length + 1, t: '\\' + P.ALIGN_DECL[v] }];
    if (cur.inner) return [{ s: cur.inner.head[0], e: cur.inner.head[1], t: '\\begin{' + P.ALIGN_ENV[v] + '}' }, { s: cur.inner.tail[0], e: cur.inner.tail[1], t: '\\end{' + P.ALIGN_ENV[v] + '}' }];
    if (!startsLine(src, cur.W.ws)) return { why: 'The figure\'s first line shares its line with \\begin: change it in the source.' };
    return [{ s: cur.W.ws, e: cur.W.ws, t: '\\' + P.ALIGN_DECL[v] + eolAt(src, cur.W.ws) }];
  },
  floatAlignSet(f, B, to) {
    const r = this.floatAlignEdits(this.src(f), B, to);
    if (r.why) { this.toast(r.why); return false; }
    return r.length ? this.paraApply(f, r) : false;
  },

  // ---- indents ----------------------------------------------------------------------------------
  // (a list's levels are B3's: its buttons run these only outside a list)
  paraIndentCan(at, dir) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    if (dir > 0) return true;
    return p.units.some((u) => { const v = P.indentOf(p.src, u.U); return v.l == null || v.l > 0.05 || v.from === 'env'; });
  },
  paraIndentWhy(at, dir) {
    const p = paraOf(this, at);
    if (p && !p.why && dir < 0) return 'The paragraph has no indent to take away.';
    return why(this, at);
  },
  paraIndentStep(dir, at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    return this.paraRun(p, [(text, U) => {
      const cur = P.indentOf(text, U);
      if (cur.l == null || cur.r == null) return { why: 'This paragraph\'s indent is written as a length Rikuy does not reckon with: change it in the source.' };
      return P.indentEdits(text, U, P.stepIndent(cur.l, dir), cur.r);
    }]);
  },

  // ---- line and paragraph spacing ------------------------------------------------------------------
  paraSpacingNow(p) {
    const pt = this.model.opts.pt;
    const doc = P.docSpacing(this.src(this.main), { others: this.preambleOthers() });
    if (!p || p.why || p.float) return { doc: doc ? doc.v : { lines: 1 }, para: null };
    const K = P.spacingKind(P.spacingDialect(this.src(this.main)) || 'setspace');
    const u = p.units[0];
    const own = u.U.levels.find((L) => L.W && K.names.includes(L.W.name));
    const it = u.it, stretch = it.spread || this.model.opts.spread || 1;
    void pt;
    return { doc: doc ? doc.v : { lines: 1 }, para: own ? K.value(own.W) : null, stretch };
  },
  // args: '1.5' (Word's menu values), { lines } or { multiple } for the caret's paragraphs, with
  // scope: 'document' for the whole document
  paraSpacing(args, at) {
    const scope = args && args.scope === 'document' ? 'document' : 'paragraph';
    const v = spacingArg(args && args.v != null ? args.v : args);
    if (!v) return false;
    if (scope === 'document') return this.docSpacingSet(v);
    const p = paraOf(this, at);
    if (!p || p.why || p.float) { if (p && p.why) this.toast(p.why); return false; }
    const main = this.src(this.main), dialect = P.spacingDialect(main);
    if (!dialect) { this.toast('A beamer presentation spaces its lines itself.'); return false; }
    const K = P.spacingKind(dialect), doc = P.docSpacing(main, { others: this.preambleOthers() });
    const pt = this.model.opts.pt;
    return this.paraRun(p, [(text, U) => P.layerEdits(text, U, { ...K, same: (a, b) => P.sameSpacing(a, b, pt) }, v, { inherit: doc ? doc.v : { lines: 1 }, whyInherit: 'This paragraph\'s spacing comes from further out: choose it for the whole document, or set another for this paragraph.' })]);
  },
  docSpacingSet(v) {
    const src = this.src(this.main);
    const r = P.docSpacingEdits(src, v, { others: this.preambleOthers(), pt: this.model.opts.pt });
    if (r.why) { this.toast(r.why); return false; }
    if (!r.edits.length) return false;
    const pkg = r.needs && !hasPackage(src, r.needs, undefined, this.preambleOthers()) ? usePackages(src, [r.needs], { others: this.preambleOthers() }) : [];
    return this.paraApply(this.main, [...r.edits, ...pkg]);
  },
  paraSpacingMenu(at) {
    const p = paraOf(this, at), ok = !!p && !p.why && !p.float;
    const now = this.paraSpacingNow(p), pt = this.model.opts.pt;
    const docV = now.doc;
    const effective = ok ? (now.para || docV) : null;
    const back = () => this.ribbonBack();
    const items = SPACINGS.map(([k, v]) => ({ name: k, title: ok ? 'This paragraph: ' + P.spacingName(v) : 'Click in a paragraph first', checked: !!effective && P.sameSpacing(effective, v, pt), radio: true, disabled: !ok,
      run: () => { back(); this.runCommand('line-spacing', k); } }));
    items.push(null, { name: 'Line Spacing Options…', title: 'The Paragraph dialog', run: () => { back(); this.paraDialog({ focus: 'line' }, at); } });
    if (ok) {
      const u = p.units[0].U, b = P.spaceOf(u, 'before').pt > 0, a = P.spaceOf(u, 'after').pt > 0;
      items.push(null,
        { name: (b ? 'Remove' : 'Add') + ' Space Before Paragraph', title: '\\vspace{12pt} on the line before the paragraph', run: () => { back(); this.runCommand('space-before'); } },
        { name: (a ? 'Remove' : 'Add') + ' Space After Paragraph', title: '\\vspace{12pt} on the line after the paragraph', run: () => { back(); this.runCommand('space-after'); } });
    }
    items.push(null);
    for (const [k, v] of SPACINGS.slice(0, 4)) items.push({ name: 'Whole document: ' + k, title: 'The whole document\'s line spacing (' + P.spacingName(v) + ')', checked: P.sameSpacing(docV, v, pt), radio: true, disabled: !docOK(this),
      run: () => { back(); this.runCommand('line-spacing', { v: k, scope: 'document' }); } });
    const b = $('#rc-line-spacing');
    openMenu(this, b && b.offsetParent ? b : this.paraAnchor(), items, { label: 'Line and Paragraph Spacing' });
    return true;
  },
  paraAnchor() { const g = $('#rg-home-paragraph'); return g && g.offsetParent ? g : this.root; },

  // ---- space before and after -------------------------------------------------------------------
  paraSpace(side, args, at) {
    const p = paraOf(this, at);
    if (!p || p.why) return false;
    // (toggled as the first paragraph has it: every paragraph of the selection gets the same)
    const cur = P.spaceOf(p.units[0].U, side).pt;
    const pt = typeof args === 'number' ? args : args && args.pt != null ? +args.pt : cur > 0 ? 0 : 12;
    return this.paraRun(p, [(text, U) => P.spaceEdits(text, U, side, pt)]);
  },

  // ---- flags: keep with next, keep lines together, page break before, no hyphenation, no numbers ----
  paraFlagKind(kind) { return { samepage: P.SAMEPAGE, nohyph: P.NOHYPH, nolineno: P.NOLINENO }[kind]; },
  paraFlag(at, kind) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return null;
    const u = p.units[0];
    if (kind === 'keep' || kind === 'break') return !!P.flagOf(u.U, kind);
    return !!P.flagEnvOf(p.src, u.U, this.paraFlagKind(kind));
  },
  paraToggle(kind, args, at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    const on = args != null && typeof args === 'boolean' ? args : !this.paraFlag(at, kind);
    if (kind === 'keep' || kind === 'break') return this.paraRun(p, [(text, U) => P.flagEdits(text, U, kind, on)]);
    const K = this.paraFlagKind(kind);
    return this.paraRun(p, [(text, U) => (P.flagEnvOf(text, U, K) === 'container' && on ? [] : P.layerEdits(text, U, K, on ? true : null))]);
  },
  // whether the document numbers its lines: lineno loaded, and \linenumbers (or an option of
  // lineno's that numbers them) in the main file. (Read once for each text: the ribbon asks at
  // every move of the caret, and a pattern over a stranger's whole text took a second there.)
  paraLineno() {
    const src = this.src(this.main);
    if (this.paraLnMemo && this.paraLnMemo.src === src) return this.paraLnMemo.v;
    const o = this.preambleOthers(), op = packageOptions(src, 'lineno', undefined, o);
    const v = !!op && (!!(op.running || op.pagewise || op.modulo || op.switch || op.left || op.right) || /\\linenumbers(?![A-Za-z])|\\begin\{linenumbers\}/.test(src));
    this.paraLnMemo = { src, v };
    return v;
  },
  paraBabel() { const src = this.src(this.main), o = this.preambleOthers(); return hasPackage(src, 'babel', undefined, o) || hasPackage(src, 'polyglossia', undefined, o); },
  paraWidows(args) {
    const src = this.src(this.main), on = typeof args === 'boolean' ? args : !P.widowControl(src).on;
    const r = P.widowEdits(src, on);
    if (r.why) { this.toast(r.why); return false; }
    return this.paraApply(this.main, r);
  },

  // ---- shading and borders ------------------------------------------------------------------------
  paraShade(color, at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    const pick = color === undefined ? this.paraShadeLast || 'yellow!20' : color;
    if (color) this.paraShadeLast = color;
    return this.paraRun(p, [(text, U) => P.boxEdits(text, U, pick, !!P.boxOf(text, U).border)]);
  },
  paraShadePicker(at) {
    const p = paraOf(this, at);
    const b = p && !p.why ? P.boxOf(p.src, p.units[0].U) : null;
    const anchor = $('#rc-shading') && $('#rc-shading').offsetParent ? $('#rc-shading') : this.paraAnchor();
    const el = colorPicker(this, anchor, { label: 'Shading', auto: 'No Color', current: b && b.shading ? b.shading : null, theme: this.paraDocColors(),
      onPick: (v) => { this.ribbonBack(); this.paraShade(!v ? null : v.html ? P.htmlColor(v.html) : v.name || null, at); } });
    if (el) { el.classList.add('pop-gal'); this.positionPop(); }
    return el;
  },
  paraDocColors() {
    const out = [];
    for (const [name, v] of (this.model && this.model.colors) || []) if (/^#[0-9a-f]{6}$/i.test(v) && out.length < 20) out.push({ name, hex: v.slice(1).toUpperCase() });
    return out;
  },
  paraBorderMenu(at) {
    const p = paraOf(this, at), ok = !!p && !p.why && !p.float;
    const u = ok ? p.units[0].U : null, box = ok ? P.boxOf(p.src, u) : {};
    const has = { bottom: ok && !!P.ruleOf(u, 'after'), top: ok && !!P.ruleOf(u, 'before'), box: ok && !!box.border };
    const item = (kind, name, title) => ({ name, title, checked: kind in has ? has[kind] : undefined, disabled: !ok, run: () => { this.ribbonBack(); this.runCommand('borders', { kind }); } });
    return [item('bottom', 'Bottom Border', 'A rule under the paragraph (\\par\\noindent\\rule{\\linewidth}{0.4pt})'), item('top', 'Top Border', 'A rule over the paragraph'),
      item('box', 'Outside Borders', 'A frame around the paragraph (tcolorbox)'), item('none', 'No Border', 'Every border of the paragraph taken off'), null,
      { name: 'Horizontal Line', title: command('horizontal-line').title, disabled: !ok, run: () => { this.ribbonBack(); this.runCommand('horizontal-line'); } }];
  },
  paraBorder(kind, at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    if (kind !== 'none') this.paraBorderLast = kind;
    // (on or off as the first paragraph has it: every paragraph of the selection gets the same)
    const U0 = p.units[0].U, side = kind === 'bottom' ? 'after' : 'before', on = kind === 'box' ? !P.boxOf(p.src, U0).border : !P.ruleOf(U0, side);
    // none: the rules go, then the frame (the shading stays): each read again after the other
    if (kind === 'none') return this.paraRun(p, [(text, U) => [...P.ruleEdits(text, U, 'after', false), ...P.ruleEdits(text, U, 'before', false)], (text, U) => { const box = P.boxOf(text, U); return box.border ? P.boxEdits(text, U, box.shading || null, false) : []; }]);
    if (kind === 'box') return this.paraRun(p, [(text, U) => P.boxEdits(text, U, P.boxOf(text, U).shading || null, on)]);
    return this.paraRun(p, [(text, U) => P.ruleEdits(text, U, side, on)]);
  },
  paraHR(at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    const u = p.units[p.units.length - 1];
    return this.paraApply(p.f, P.hrEdits(p.src, u.U));
  },

  // ---- direction -----------------------------------------------------------------------------------
  // the document's languages each way, as its set up has them: { rtl: 'arabic', ltr: 'english',
  // bidi: true where bidi's environments are the way }
  paraDirs() {
    const src = this.src(this.main);
    if (this.paraDirMemo && this.paraDirMemo.src === src) return this.paraDirMemo.v;
    const pre = src.slice(0, Math.max(0, preambleEnd(src)));
    const langs = [];
    for (const m of pre.matchAll(/\\usepackage\s*\[([^\]]{0,400})\]\s*\{babel\}/g)) langs.push(...m[1].split(',').map((x) => x.trim().replace(/^main\s*=\s*/, '')));
    for (const m of pre.matchAll(/\\set(?:main|other)languages?\s*(?:\[[^\]]{0,200}\]\s*)?\{([^}]{0,200})\}/g)) langs.push(...m[1].split(',').map((x) => x.trim()));
    for (const m of pre.matchAll(/\\babelprovide\s*(?:\[[^\]]{0,400}\]\s*)?\{([^}]{0,60})\}/g)) langs.push(m[1].trim());
    const rtl = langs.find((l) => RTL_LANGUAGES.test(l)) || null, ltr = langs.find((l) => /^[a-z]+$/.test(l) && !RTL_LANGUAGES.test(l) && !/^(bidi|layout|provide|import|main|shorthands)/.test(l)) || null;
    const bidi = !rtl && hasPackage(src, 'bidi', undefined, this.preambleOthers());
    const v = { rtl: rtl || (bidi ? 'rtl' : null), ltr: bidi ? 'ltr' : ltr, bidi, doc: rtlDocument(src) ? 'rtl' : 'ltr', setup: scriptSetup(src) };
    this.paraDirMemo = { src, v };
    return v;
  },
  paraDirNow(at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return null;
    return p.units[0].it.dir || this.paraDirs().doc;
  },
  paraDirection(to, at) {
    const p = paraOf(this, at), D = this.paraDirs();
    if (!p || p.why || p.float || !D.rtl) return false;
    const lang = to === 'rtl' ? D.rtl : D.ltr;
    if (!lang) { this.toast('The document sets up no left to right language beside its right to left one.'); return false; }
    return this.paraRun(p, [(text, U, u) => {
      const own = U.levels.find((L) => L.W && P.DIRECTION.names.includes(L.W.name));
      const now = u.it.dir || D.doc;
      if (own) return P.layerEdits(text, U, P.DIRECTION, (to === D.doc ? null : lang));
      if (now === to) return [];
      return P.layerEdits(text, U, P.DIRECTION, lang);
    }]);
  },

  // ---- tab stops with a leader: \hfill, \dotfill, \hrulefill at the caret ----------------------------
  paraLeader(kind, at) {
    const c = at && at.c;
    if (!c || c.ghost) return false;
    const t = kind === 'dots' ? '\\dotfill' : kind === 'line' ? '\\hrulefill' : '\\hfill';
    // (at the caret, or at the end of a selection: what is selected stays, as the source has it,
    // where a selection may run over an \end or into a command's braces)
    const at0 = c.collapsed ? c.a : Math.max(c.a, c.b), src = this.src(c.f), next = src[at0] || '';
    const text = t + (/[A-Za-z]/.test(next) ? '{}' : '');
    this.closeGroup();
    this.commit([{ f: c.f, s: at0, e: at0, t: text }], { f: c.f, p: at0 + text.length, bias: -1 }, 'insert');
    this.closeGroup();
    return true;
  },

  // ---- the document's paragraph spacing (Design) ------------------------------------------------------
  paraSetNow() {
    const src = this.src(this.main), others = this.preambleOthers(), pt = this.model.opts.pt;
    const sk = P.docParskip(src, { others }).skip, sp = P.docSpacing(src, { others });
    const v = sp ? sp.v : { lines: 1 };
    const set = P.PARA_SETS.find((x) => (x.skip === sk || (typeof x.skip === 'number' && typeof sk === 'number' && Math.abs(x.skip - sk) < 0.1)) && P.sameSpacing(x.sp || { lines: 1 }, v, pt));
    return set ? set.id : null;
  },
  paraSet(id) {
    const S = P.PARA_SETS.find((x) => x.id === id);
    if (!S) return false;
    const main = this.main, others = this.preambleOthers();
    let text = this.src(main);
    const orig = text;
    const r1 = P.docParskipEdits(text, S.skip, { others });
    if (r1.why) { this.toast(r1.why); return false; }
    text = applyEdits(text, r1.edits);
    if (r1.needs) text = applyEdits(text, usePackages(text, r1.needs.parskip ? { parskip: r1.needs.parskip } : ['parskip'], { others }));
    const r2 = P.docSpacingEdits(text, S.sp || { lines: 1 }, { others, pt: this.model.opts.pt });
    if (r2.why) { this.toast(r2.why); return false; }
    text = applyEdits(text, r2.edits);
    if (r2.needs && !hasPackage(text, r2.needs, undefined, others)) text = applyEdits(text, usePackages(text, [r2.needs], { others }));
    if (text === orig) return false;
    return this.paraApply(main, diffEdits(orig, text));
  },
  paraSetMenu() {
    const now = this.paraSetNow();
    const items = P.PARA_SETS.map((x) => ({ name: x.name, title: setTitle(x), checked: now === x.id, radio: true, run: () => { this.ribbonBack(); this.runCommand('paragraph-spacing', x.id); } }));
    items.push(null, { name: 'Custom Paragraph Spacing…', title: 'The Paragraph dialog, its whole document part', run: () => { this.ribbonBack(); this.paraDialog({ focus: 'document' }); } });
    const b = $('#rc-paragraph-spacing');
    openMenu(this, b && b.offsetParent ? b : ($('#rg-design-formatting') && $('#rg-design-formatting').offsetParent ? $('#rg-design-formatting') : this.root), items, { label: 'Paragraph Spacing' });
    return true;
  },

  // ---- Show marks ---------------------------------------------------------------------------------
  toggleMarks(on) {
    this.marksOn = on ?? !this.marksOn;
    document.body.classList.toggle('marks-on', this.marksOn);
    if (this.prefs) { this.prefs.marks = this.marksOn; store(PREFS, this.prefs); }
    return true;
  },

  // ---- Layout's fields ------------------------------------------------------------------------------
  paraFieldValue(id, at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return null;
    const U = p.units[0].U;
    if (id === 'indent-left' || id === 'indent-right') { const v = P.indentOf(p.src, U); const x = id === 'indent-left' ? v.l : v.r; return x == null ? null : { value: Math.round(x / P.PT.cm * 100) / 100, unit: 'cm' }; }
    const s = P.spaceOf(U, id === 'spacing-before' ? 'before' : 'after');
    return s.pt == null ? null : { value: Math.round(s.pt * 10) / 10, unit: 'pt' };
  },
  paraFieldSync(id, at) {
    const box = $('#rl-' + id);
    // (not while it is typed in: the caret it stands for is the one kept when it took the focus)
    if (!box || document.activeElement === box) return;
    // (the place on the page, in the source, for a field to write to once it has the focus)
    if (id === 'indent-left' && at && at.c && !at.c.ghost && document.activeElement === this.root) this.paraFieldC = at.c;
    const v = this.paraFieldValue(id, at);
    box.disabled = v == null;
    box.setValue(v);
  },
  // a field's value (a length in the field's unit, or { value, unit }) applied to the paragraph
  paraFieldSet(id, len, at) {
    const p = paraOf(this, at);
    if (!p || p.why || p.float) return false;
    const L = typeof len === 'number' ? { value: len, unit: id.startsWith('indent') ? 'cm' : 'pt' } : len;
    const pt = L.value * (P.PT[L.unit] || 1);
    if (id === 'spacing-before' || id === 'spacing-after') return this.paraSpace(id === 'spacing-before' ? 'before' : 'after', Math.max(0, pt), at);
    return this.paraRun(p, [(text, U) => {
      const cur = P.indentOf(text, U);
      if (cur.l == null || cur.r == null) return { why: 'This paragraph\'s indent is written as a length Rikuy does not reckon with: change it in the source.' };
      return P.indentEdits(text, U, id === 'indent-left' ? pt : cur.l, id === 'indent-right' ? pt : cur.r);
    }]);
  },

  // ---- the Paragraph dialog -------------------------------------------------------------------------
  paraDialog(args, at) {
    if (at === undefined) at = this.ribbonAt();
    return openParagraphDialog(this, at, paraOf(this, at), args || {});
  },
  // Everything the dialog changed, one step of history (paraRun): the paragraph's settings applied
  // one after another, each unit read again after the edits before it; the document's in the
  // preamble; a figure's alignment. ops: [(text, U, u) => edits]; docOps: [(text, others) =>
  // edits | { text }]; float: the alignment for the figure the caret is in
  paraDialogApply(p, ops, docOps, float = null, caret = null) {
    const fileOps = [];
    if (float && p && p.float) { const B = p.float, f = p.f; fileOps.push({ f, op: (text) => this.floatAlignEdits(text, B, float) }); }
    for (const op of docOps) fileOps.push({ f: this.main, op });
    return this.paraRun(p, ops, fileOps, 'para', caret);
  }
};

const setTitle = (x) => (x.skip == null ? 'No space between paragraphs, first lines indented (LaTeX\'s own)' : (x.skip === 'open' ? 'Half a line' : x.skip + ' pt') + ' between paragraphs (parskip), no first line indent') + '; line spacing ' + P.spacingName(x.sp || { lines: 1 });
// two units in one place: the same container, or none
const sameScope = (a, b) => (a.container ? a.container.s : -1) === (b.container ? b.container.s : -1);
// The caret's place after edits: text put in at the caret goes after it when it ends a line of its
// own (a \begin{center} line before the words), before it otherwise (\end{center} after them)
export function mapCaret(edits, p) {
  let q = p;
  for (const x of edits) {
    if (x.e < p || (x.e === p && (x.s < p || /\n$/.test(x.t)))) q += x.t.length - (x.e - x.s);
    else if (x.s < p && x.e > p) q += x.s + x.t.length - p;
  }
  return q;
}

// edits applied to a text, from the end backwards (as App.commit applies them)
export function applyEdits(src, edits) {
  for (const x of [...edits].sort((u, v) => v.s - u.s || v.e - u.e)) src = src.slice(0, x.s) + x.t + src.slice(x.e);
  return src;
}
// The edits from text a to text b: one for the preamble and one for the body, so that a setting
// of the document and one of a paragraph are two small edits, not one over all between them
export function diffEdits(a, b) {
  const cut = (t) => { const m = /\\begin\s*\{document\}/.exec(t.slice(0, 400000)); return m ? t.lastIndexOf('\n', m.index) + 1 : -1; };
  const ka = cut(a), kb = cut(b);
  if (ka > 0 && kb > 0 && a.slice(ka, ka + 16) === b.slice(kb, kb + 16)) {
    const one = (x, y, off) => { const d = diff1(x, y); return d ? [{ s: d.s + off, e: d.e + off, t: d.t }] : []; };
    return [...one(a.slice(0, ka), b.slice(0, kb), 0), ...one(a.slice(ka), b.slice(kb), ka)];
  }
  const d = diff1(a, b);
  return d ? [d] : [];
}
function diff1(a, b) {
  if (a === b) return null;
  let s = 0;
  const n = Math.min(a.length, b.length);
  while (s < n && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { s, e: ea, t: b.slice(s, eb) };
}
