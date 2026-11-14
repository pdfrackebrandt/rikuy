// Batch B8, pictures and objects, as Word has them. Picture (a PNG, JPEG or PDF placed after the
// caret's block) on Home and Insert. A picture pressed on the page is selected, as in Word: a
// frame with eight handles (src/ui/handles.js) that size it, and the Picture Format tab: Change
// and Reset Picture, Picture Border, Insert Caption, Alt Text, Position, Wrap Text, Rotate, Crop,
// Height and Width, Lock Aspect Ratio and Size and Position; its own right click menu; the same
// Position, Wrap Text and Rotate on Layout's Arrange. Insert's Illustrations and Text get Shapes,
// Icons, SmartArt, Chart, Screenshot, Text Box and Drop Cap (src/drawing.js draws what they write).
//
// Every operation reads the picture once (src/picture.js, on the parser's tree of its file) and
// writes one commit of small edits, the packages it needs in the same step (one undo gives the
// bytes back), then selects the picture again where it now is. Hand written forms (\textwidth,
// trim or viewport, \rotatebox, \fbox, \resizebox, a figure written by hand) are read the same way
// and edited in their own form.

import { register, onInstall, command, enabled } from '../commands.js';
import { parse } from '../parser.js';
import * as X from '../picture.js';
import { mapPos } from '../wrap.js';
import { atomOfEl } from '../editor.js';
import { hasPackage, docClass, preambleEnd } from '../preamble.js';
import { $ } from '../ui/dom.js';
import { openMenu } from '../ui/kit.js';
import { installHandles } from '../ui/handles.js';
import { altDialog, sizeDialog, smartDialog, chartDialog, dropCapDialog } from '../ui/picturedialogs.js';
import * as D from '../drawing.js';
import { openGallery } from '../ui/kit.js';
import { BLOCKS } from '../render.js';

const WHY = 'Select a picture first: click it on the page.';
// the picture selected on the page, read once for each look at the ribbon (every button asks)
const pic = (app, at) => {
  const m = at ? (at.memo || (at.memo = {})) : {};
  if (!('pic' in m)) { try { m.pic = app.picHere(); } catch (e) { console.error(e); m.pic = null; } }
  return m.pic;
};
const has = (app, at) => !!pic(app, at);
const keyed = (app, at) => { const h = pic(app, at); return !!h && h.P.keyval; };
// (a picture turned by a macro's angle: Rotate cannot add to it)
const turnable = (app, at) => { const h = pic(app, at); return !!h && h.P.keyval && X.angleKnown(h.src, h.P); };
const turnWhy = (app, at) => (keyed(app, at) ? 'The picture is turned by a macro\'s angle: edit it in the source.' : WHY);
const placeWhy = (app, at, mode) => { const h = pic(app, at); if (!h) return WHY; return X.whyFixed(h.src, h.P, mode, app.picContext(h)); };
const ICON = {
  change: '<path d="M3.5 4.5h10v8h-10zM3.5 10.5l3-3 3 3 2-1.5 2 2"/><path d="M12 15.5h4.5M14.5 13.5l2 2-2 2"/>',
  reset: '<path d="M4.5 8a6 6 0 1 1 .9 5.5"/><path d="M4 4v4h4"/>',
  border: '<path d="M3.5 4.5h13v11h-13z" stroke-width="2"/><path d="M6.5 12l2.5-2.5 2 2 1.5-1 1.5 1.5"/>',
  caption: '<path d="M3.5 3.5h13v8h-13zM3.5 9.5l3-2.5 3 2.5 2-1.5 3 2"/><path d="M4 14.5h12M4 17h8"/>',
  alt: '<path d="M3.5 4.5h13v9h-13zM3.5 11l3-3 3 3 2-1.5 3 2.5"/><path d="M6 17h8"/><path d="M15.5 15.5l2 2" stroke-width="1"/>',
  position: '<path d="M3.5 3.5h13v13h-13z"/><path d="M6 6h4v4H6z" style="fill:currentColor;stroke:none" opacity=".45"/><path d="M12 7h2.5M12 9.5h2.5M6 13h8.5"/>',
  wrap: '<path d="M3 4h14M3 16h14M11 7.5h6M11 10h6M11 12.5h6"/><path d="M3 7h6v6H3z" style="fill:currentColor;stroke:none" opacity=".45"/>',
  rotate: '<path d="M15.5 9a5.5 5.5 0 1 0-1.6 4.3"/><path d="M16 4v5h-5"/>',
  crop: '<path d="M6 2.5v11.5h11.5M2.5 6H14v11.5"/>',
  lock: '<path d="M6 9.5V7a4 4 0 0 1 8 0v2.5"/><path d="M4.5 9.5h11v7h-11z"/>',
  size: '<path d="M3.5 3.5h13v13h-13z" stroke-dasharray="2 1.5"/><path d="M7 13l6-6M9.5 7H13v3.5"/>',
  rotR: '<path d="M14.5 9.5a5 5 0 1 0-1.5 3.6"/><path d="M15 5v4.5h-4.5"/>',
  rotL: '<path d="M5.5 9.5a5 5 0 1 1 1.5 3.6"/><path d="M5 5v4.5h4.5"/>',
  flipH: '<path d="M10 3v14" stroke-dasharray="1.5 1.5"/><path d="M8 5L3.5 15H8zM12 5l4.5 10H12z"/>',
  flipV: '<path d="M3 10h14" stroke-dasharray="1.5 1.5"/><path d="M5 8L15 3.5V8zM5 12l10 4.5V12z"/>'
};
const P = (id, name, o) => ({ id, name, when: has, whyNot: () => WHY, ...o });
// where a picture can stand: [command id, name, title, target]
const PLACES = [
  ['picture-inline', 'In Line with Text', 'In Line with Text: the picture where it is written, in a center of its own (no float)', { mode: 'inline' }],
  ['picture-place-best', 'Best Place', 'A figure LaTeX places where it fits best: here, at the top or bottom of a page, or on a page of floats ([htbp])', { mode: 'float', place: 'htbp' }],
  ['picture-place-top', 'Top of Page', 'A figure at the top of a page ([t])', { mode: 'float', place: 't' }],
  ['picture-place-bottom', 'Bottom of Page', 'A figure at the bottom of a page ([b])', { mode: 'float', place: 'b' }],
  ['picture-place-page', 'Page of Floats', 'A figure on a page of floats of its own ([p])', { mode: 'float', place: 'p' }],
  ['picture-place-here', 'Here If It Fits', 'A figure here if it fits, else where LaTeX puts it ([h])', { mode: 'float', place: 'h' }],
  ['picture-place-exact', 'Exactly Here', 'A figure exactly where it is written, never moved ([H], the float package)', { mode: 'float', place: 'H' }],
  ['picture-wrap-left', 'Left with Text Wrapping', 'At the left of the text, the text wrapping round it (wrapfig, {l})', { mode: 'wrap', side: 'l' }],
  ['picture-wrap-right', 'Right with Text Wrapping', 'At the right of the text, the text wrapping round it (wrapfig, {r})', { mode: 'wrap', side: 'r' }]
];
const isPlace = (h, to) => {
  const p = X.positionOf(h.src, h.P);
  if (to.mode === 'inline') return p.mode === 'inline';
  if (to.mode === 'float') return p.mode === 'float' && (p.place || 'tbp').replace(/!/g, '') === to.place;
  return p.mode === 'wrap' && (p.side || 'r').toLowerCase() === to.side;
};

register(
  { id: 'picture', name: 'Picture', order: 40, title: 'Picture from a file (PNG, JPEG or PDF)', synonyms: ['Image', 'Insert picture', 'Figure', 'includegraphics'], tab: 'home', group: 'insert', el: 'rb-pic', label: 'Picture',
    icon: '<path d="M3.5 4.5h13v11h-13zM3.5 13.5l3.5-3.5 3 3 2.5-2 4 3.5M13 7.8h.01"/>', also: [{ tab: 'insert', group: 'illustrations', el: 'ri-pic', order: 10 }],
    run: (app) => { const s = getSelection(); app.rbRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; $('#picinput').click(); } },

  // ---- Picture Format: Adjust ---------------------------------------------------------------------
  P('picture-change', 'Change Picture', { title: 'Change Picture: another file in its place, its size, crop, turn and alt text kept', tab: 'picture-format', group: 'adjust', order: 10, icon: ICON.change, label: 'Change Picture',
    synonyms: ['Replace picture', 'Replace image', 'Swap picture'], menu: { picture: 10 }, run: (app, args) => (args && args.file ? app.picChange(args.file, args.blob) : app.picChoose()) }),
  P('picture-reset', 'Reset Picture', { title: 'Reset Picture: its crop, turn, flips and border go (size and alt text stay); the arrow for Reset Picture & Size', tab: 'picture-format', group: 'adjust', order: 20, icon: ICON.reset, kind: 'split',
    synonyms: ['Discard formatting'], when: keyed, run: (app) => app.picOp((src, Q) => X.reset(src, Q, false)), menuItems: () => [{ name: 'Reset Picture', command: 'picture-reset' }, { name: 'Reset Picture & Size', command: 'picture-reset-size' }] }),
  P('picture-reset-size', 'Reset Picture & Size', { title: 'Reset Picture & Size: the picture as its file is, at its natural size', when: keyed, run: (app) => app.picOp((src, Q) => X.reset(src, Q, true)) }),

  // ---- Picture Styles ---------------------------------------------------------------------------
  P('picture-border', 'Picture Border', { title: 'Picture Border: a frame tight round the picture ({\\setlength{\\fboxsep}{0pt}\\fbox{…}}); again takes it off', tab: 'picture-format', group: 'styles', order: 10, kind: 'toggle', icon: ICON.border, label: 'Picture Border',
    synonyms: ['Frame', 'Outline', 'fbox', 'Border'], on: (app, at) => { const h = pic(app, at); return h ? X.bordered(h.P) : null; }, run: (app) => app.picOp((src, Q) => X.border(src, Q)) }),
  P('picture-caption', 'Insert Caption', { title: 'Insert Caption: a numbered caption under the picture ("Figure 1"): \\caption in a figure, \\captionof{figure} in line with text', tab: 'picture-format', group: 'styles', order: 20, icon: ICON.caption, label: 'Caption',
    synonyms: ['Caption', 'Figure caption', 'Title of figure'], menu: { picture: 50 }, run: (app) => app.picCaption() }),

  // ---- Accessibility -------------------------------------------------------------------------------
  P('picture-alt', 'Alt Text', { title: 'Alt Text: what the picture shows, for people who cannot see it (\\includegraphics[alt={…}], read by tagged PDF and Word), or Mark as decorative', tab: 'picture-format', group: 'accessibility', order: 10, icon: ICON.alt, label: 'Alt Text',
    synonyms: ['Alternative text', 'Edit Alt Text', 'Description', 'Accessibility', 'Decorative'], menu: { picture: 60 }, run: (app, args) => (args ? app.picSetAlt(args.text, args.decorative) : altDialog(app)) }),

  // ---- Arrange (also on Layout) -----------------------------------------------------------------
  P('picture-position', 'Position', { title: 'Position: in line with the text, a figure at the top or bottom of a page, here, or at a side with the text wrapping round it', tab: 'picture-format', group: 'arrange', order: 10, kind: 'menu', icon: ICON.position, label: 'Position',
    synonyms: ['Float', 'Placement', 'figure'], also: [{ tab: 'layout', group: 'arrange', el: 'rc-picture-position-layout', order: 10 }], run: (app) => app.picMenu('position') }),
  P('picture-wrap', 'Wrap Text', { title: 'Wrap Text: in line with the text, square (the text round it: wrapfig), or top and bottom (a figure)', tab: 'picture-format', group: 'arrange', order: 20, kind: 'menu', icon: ICON.wrap, label: 'Wrap Text',
    synonyms: ['Text wrapping', 'wrapfigure', 'Square', 'Tight', 'Layout options'], menu: { picture: 40 }, also: [{ tab: 'layout', group: 'arrange', el: 'rc-picture-wrap-layout', order: 20 }], run: (app) => app.picMenu('wrap') }),
  P('picture-rotate', 'Rotate', { title: 'Rotate: right or left by 90°, flip vertical or horizontal', tab: 'picture-format', group: 'arrange', order: 30, kind: 'menu', icon: ICON.rotate, label: 'Rotate',
    synonyms: ['Turn', 'Flip', 'angle'], when: keyed, also: [{ tab: 'layout', group: 'arrange', el: 'rc-picture-rotate-layout', order: 30 }], run: (app) => app.picMenu('rotate') }),
  ...PLACES.map(([id, name, title, to]) => P(id, name, { title, when: (app, at) => has(app, at) && !placeWhy(app, at, to.mode), whyNot: (app, at) => placeWhy(app, at, to.mode) || WHY,
    on: (app, at) => { const h = pic(app, at); return h ? isPlace(h, to) : null; }, run: (app) => app.picPlace(to) })),
  P('picture-wrap-square', 'Square', { title: 'Square: the text wraps round the picture\'s box (wrapfig\'s wrapfigure, on the side it is on)', synonyms: ['Wrap square', 'Tight', 'Through'],
    when: (app, at) => has(app, at) && !placeWhy(app, at, 'wrap'), whyNot: (app, at) => placeWhy(app, at, 'wrap') || WHY, on: (app, at) => { const h = pic(app, at); return h ? X.positionOf(h.src, h.P).mode === 'wrap' : null; },
    run: (app) => { const h = app.picHere(); const p = h && X.positionOf(h.src, h.P); return app.picPlace({ mode: 'wrap', side: p && p.mode === 'wrap' ? p.side : 'r' }); } }),
  P('picture-wrap-topbottom', 'Top and Bottom', { title: 'Top and Bottom: the text above and below the picture, none beside it (a figure, placed where it fits best)', synonyms: ['Wrap top and bottom'],
    when: (app, at) => has(app, at) && !placeWhy(app, at, 'float'), whyNot: (app, at) => placeWhy(app, at, 'float') || WHY, on: (app, at) => { const h = pic(app, at); return h ? X.positionOf(h.src, h.P).mode === 'float' : null; },
    run: (app) => { const h = app.picHere(); const p = h && X.positionOf(h.src, h.P); return app.picPlace({ mode: 'float', place: p && p.mode === 'float' ? p.place : 'htbp' }); } }),
  P('picture-rotate-right', 'Rotate Right 90°', { title: 'Rotate Right 90°: a quarter turn clockwise (angle=-90)', when: turnable, whyNot: turnWhy, synonyms: ['Rotate clockwise'], run: (app) => app.picOp((src, Q) => X.rotate(src, Q, -90)) }),
  P('picture-rotate-left', 'Rotate Left 90°', { title: 'Rotate Left 90°: a quarter turn counterclockwise (angle=90)', when: turnable, whyNot: turnWhy, synonyms: ['Rotate counterclockwise', 'Rotate anticlockwise'], run: (app) => app.picOp((src, Q) => X.rotate(src, Q, 90)) }),
  P('picture-flip-vertical', 'Flip Vertical', { title: 'Flip Vertical: upside down as in a mirror (\\scalebox{1}[-1]{…}); again flips it back', kind: 'toggle', synonyms: ['Mirror vertically'],
    on: (app, at) => { const h = pic(app, at); return h ? X.flipped(h.P, 'v') : null; }, run: (app) => app.picOp((src, Q) => X.flip(src, Q, 'v')) }),
  P('picture-flip-horizontal', 'Flip Horizontal', { title: 'Flip Horizontal: left to right as in a mirror (\\reflectbox{…}); again flips it back', kind: 'toggle', synonyms: ['Mirror', 'reflectbox'],
    on: (app, at) => { const h = pic(app, at); return h ? X.flipped(h.P, 'h') : null; }, run: (app) => app.picOp((src, Q) => X.flip(src, Q, 'h')) }),

  // ---- Size -------------------------------------------------------------------------------------
  P('picture-crop', 'Crop', { title: 'Crop: drag the black bars at the picture\'s edges, then Enter (trim=…, clip); the arrow for Crop by numbers and Remove Crop', tab: 'picture-format', group: 'size', order: 10, kind: 'split', icon: ICON.crop, label: 'Crop',
    synonyms: ['Trim', 'Cut edges', 'trim', 'clip'], when: keyed, menu: { picture: 30 }, on: (app) => (app.picCropping ? true : null),
    run: (app, args) => (args ? app.picCrop(args) : app.picCropMode()), menuItems: (app) => [{ name: 'Crop', command: 'picture-crop' }, { name: 'Crop by Numbers…', title: 'Left, right, top and bottom in cm', run: () => sizeDialog(app, 'crop') }, { name: 'Remove Crop', command: 'picture-crop-remove' }] }),
  P('picture-crop-remove', 'Remove Crop', { title: 'Remove Crop: the whole picture again (trim and clip go)', when: (app, at) => { const h = pic(app, at); return !!h && !!X.cropOf(h.P, app.picNaturalNow(h)); }, run: (app) => app.picCrop({ l: 0, b: 0, r: 0, t: 0 }) }),
  P('picture-height', 'Height', { title: 'Height of the picture: a length (5cm, 2in) or a share of the line (40%); Enter sets it, its shape kept (height=…)', tab: 'picture-format', group: 'size', order: 20, kind: 'custom', role: 'spinbutton', el: 'rc-picture-height',
    synonyms: ['Picture height', 'Shape height'], when: keyed, render: (app) => app.picField('height'), sync: (app, at) => app.picFieldSync('height', at), run: (app, args) => (args ? app.picResize(args) : sizeDialog(app, 'height')) }),
  P('picture-width', 'Width', { title: 'Width of the picture: a length (8cm, 3in) or a share of the line (50% is 0.5\\linewidth); Enter sets it, its shape kept (width=…)', tab: 'picture-format', group: 'size', order: 30, kind: 'custom', role: 'spinbutton', el: 'rc-picture-width',
    synonyms: ['Picture width', 'Shape width', 'Size'], when: keyed, render: (app) => app.picField('width'), sync: (app, at) => app.picFieldSync('width', at), run: (app, args) => (args ? app.picResize(args) : sizeDialog(app, 'width')) }),
  P('picture-lock', 'Lock Aspect Ratio', { title: 'Lock Aspect Ratio: the picture keeps its shape (one of width and height); off, both are written and each can change alone', tab: 'picture-format', group: 'size', order: 40, kind: 'toggle', icon: ICON.lock,
    synonyms: ['Keep aspect ratio', 'keepaspectratio', 'Proportions'], when: keyed, on: (app, at) => { const h = pic(app, at); return h ? app.picLocked(h) : null; }, run: (app) => app.picToggleLock() }),
  P('picture-size', 'Size and Position', { title: 'Size and Position…: width, height, scale, rotation, crop and where the picture stands, in one dialog', tab: 'picture-format', group: 'size', order: 50, icon: ICON.size,
    synonyms: ['Layout', 'More layout options', 'More rotation options', 'Format picture', 'Picture size'], when: keyed, menu: { picture: 20 }, run: (app, args) => (args ? app.picSizeApply(args) : sizeDialog(app)) }),
  P('picture-source', 'Show Picture Source', { title: 'The \\includegraphics line, to edit as LaTeX (Enter on the picture does the same)', menu: { picture: 90 }, synonyms: ['Edit source'],
    run: (app) => { const h = app.picHere(); if (!h) return false; const info = atomOfEl(h.el); app.disarm(); app.openAtom(h.el, info); return true; } })
);

// ---- Insert: Illustrations and Text ----------------------------------------------------------------
const IC = {
  shapes: '<path d="M3 9.5h7v7H3z"/><circle cx="13.5" cy="6.5" r="3.5"/>',
  icons: '<path d="M10 3l2 4.5 5 .5-3.8 3.3 1.1 4.9L10 13.6l-4.3 2.6 1.1-4.9L3 8l5-.5z"/>',
  smart: '<path d="M2.5 7.5h4v5h-4zM8 7.5h4v5H8zM13.5 7.5h4v5h-4zM6.5 10H8M12 10h1.5"/>',
  chart: '<path d="M3 17h14M5 17v-6M9 17V5M13 17V9M17 17v-3"/>',
  shot: '<path d="M3.5 5.5h13v9h-13zM7 17h6M10 14.5V17"/><path d="M6 8h2M6 8v2M14 12h-2M14 12v-2"/>',
  textbox: '<path d="M3.5 4.5h13v11h-13zM7 8h6M10 8v5"/>',
  dropcap: '<path d="M3 4h6v7H3zM11 5h6M11 8h6M3 14h14M3 17h10"/>'
};
const atAny = (app, at) => !!at;
register(
  { id: 'insert-shapes', name: 'Shapes', title: 'Shapes: a line, an arrow, a rectangle, an oval, a star… as a TikZ picture the page draws (click it to edit its coordinates)', tab: 'insert', group: 'illustrations', order: 20, kind: 'menu', icon: IC.shapes, label: 'Shapes',
    synonyms: ['Draw shape', 'TikZ', 'Rectangle', 'Arrow', 'Line', 'Circle', 'Star'], when: atAny, run: (app, args) => (args && args.shape ? app.insertShape(args.shape) : app.shapesGallery()) },
  { id: 'insert-icons', name: 'Icons', title: 'Icons: a symbol at the text\'s size, from fontawesome5 (\\faIcon{check})', tab: 'insert', group: 'illustrations', order: 30, kind: 'menu', icon: IC.icons, label: 'Icons',
    synonyms: ['Icon', 'Symbol icon', 'fontawesome', 'faIcon'], when: atAny, run: (app, args) => (args && args.icon ? app.insertIcon(args.icon) : app.iconsGallery()) },
  { id: 'insert-smartart', name: 'SmartArt', title: 'SmartArt: a process, a cycle, bubbles or a priority list from a few items (smartdiagram)', tab: 'insert', group: 'illustrations', order: 40, icon: IC.smart, label: 'SmartArt',
    synonyms: ['Diagram', 'Process diagram', 'Cycle', 'smartdiagram', 'Flow chart'], when: atAny, run: (app, args) => (args && args.items ? app.insertSmart(args.kind, args.items) : smartDialog(app)) },
  { id: 'insert-chart', name: 'Chart', title: 'Chart: columns, bars or a line from a small table of numbers (pgfplots), drawn on the page from its coordinates', tab: 'insert', group: 'illustrations', order: 50, icon: IC.chart, label: 'Chart',
    synonyms: ['Graph', 'Plot', 'Bar chart', 'Column chart', 'Line chart', 'pgfplots'], when: atAny, run: (app, args) => (args && args.cats ? app.insertChart(args.kind, args.cats, args.series) : chartDialog(app)) },
  { id: 'insert-screenshot', name: 'Screenshot', title: 'Screenshot: a window or the screen, captured as you choose, placed as a picture (PNG)', tab: 'insert', group: 'illustrations', order: 60, icon: IC.shot, label: 'Screenshot',
    synonyms: ['Screen capture', 'Screen clipping', 'Capture'], when: (app, at) => !!at && typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    whyNot: () => 'This browser lets no page capture the screen.', run: (app) => app.insertScreenshot() },
  { id: 'insert-textbox', name: 'Text Box', title: 'Text Box: a framed box of text (\\fbox around a minipage), a shaded one (tcolorbox), or one beside the text (wrapfig)', tab: 'insert', group: 'text', order: 10, kind: 'menu', icon: IC.textbox, label: 'Text Box',
    synonyms: ['Textbox', 'Box', 'Framed text', 'tcolorbox', 'minipage'], when: atAny, run: (app, args) => (args && args.kind ? app.insertTextBox(args.kind) : app.textBoxMenu()) },
  { id: 'textbox-simple', name: 'Simple Text Box', title: 'A framed box of text, half the line wide (\\fbox{\\begin{minipage}{0.5\\linewidth}…})', when: atAny, run: (app) => app.insertTextBox('simple') },
  { id: 'textbox-shaded', name: 'Shaded Text Box', title: 'A shaded, rounded box of text (tcolorbox)', when: atAny, run: (app) => app.insertTextBox('shaded') },
  { id: 'textbox-beside', name: 'Text Box Beside the Text', title: 'A framed box at the right, the next paragraph wrapping round it (wrapfigure)', when: atAny, run: (app) => app.insertTextBox('beside') },
  { id: 'insert-dropcap', name: 'Drop Cap', title: 'Drop Cap: the paragraph\'s first letter large, dropped over three lines or in the margin (lettrine)', tab: 'insert', group: 'text', order: 20, kind: 'menu', icon: IC.dropcap, label: 'Drop Cap',
    synonyms: ['Initial', 'Big first letter', 'lettrine'], when: (app, at) => !!app.dropCapAt(at), whyNot: (app, at) => app.dropCapWhy(at), run: (app, args) => (args ? app.dropCap(args) : app.dropCapMenu()) },
  { id: 'dropcap-dropped', name: 'Dropped', title: 'Drop Cap: the first letter dropped over three lines (\\lettrine[lines=3]{T}{his})', kind: 'toggle', when: (app, at) => !!app.dropCapAt(at), whyNot: (app, at) => app.dropCapWhy(at),
    on: (app, at) => { const d = app.dropCapAt(at); return d ? d.mode === 'dropped' : null; }, run: (app) => app.dropCap({ mode: 'dropped' }) },
  { id: 'dropcap-margin', name: 'In Margin', title: 'Drop Cap: the first letter in the margin over three lines (\\lettrine[lines=3,lhang=1]…)', kind: 'toggle', when: (app, at) => !!app.dropCapAt(at), whyNot: (app, at) => app.dropCapWhy(at),
    on: (app, at) => { const d = app.dropCapAt(at); return d ? d.mode === 'margin' : null; }, run: (app) => app.dropCap({ mode: 'margin' }) },
  { id: 'dropcap-none', name: 'No Drop Cap', title: 'The first letter as the paragraph\'s other letters again (\\lettrine taken off)', when: (app, at) => { const d = app.dropCapAt(at); return !!d && d.mode !== 'none'; }, whyNot: () => 'The paragraph has no drop cap.', run: (app) => app.dropCap({ mode: 'none' }) },
  { id: 'dropcap-options', name: 'Drop Cap Options', title: 'Drop Cap Options…: dropped or in the margin, lines to drop, distance from the text', when: (app, at) => !!app.dropCapAt(at), whyNot: (app, at) => app.dropCapWhy(at), run: (app) => dropCapDialog(app) }
);

// Picture places pictures. Anything else picked there (a .tex would open as a new project in
// place of this one) is left out and named.
onInstall((app) => {
  $('#picinput').addEventListener('change', (e) => {
    const all = [...e.target.files], fs = all.filter((x) => /\.(png|jpe?g|pdf)$/i.test(x.name)), no = all.filter((x) => !fs.includes(x)).map((x) => x.name);
    e.target.value = '';
    app.ribbonBack();
    const said = no.length ? no.slice(0, 3).join(', ') + (no.length > 3 ? ' and ' + (no.length - 3) + ' more' : '') + (no.length === 1 ? ' is' : ' are') + ' no picture and ' + (no.length === 1 ? 'was' : 'were') + ' left out: Picture takes PNG, JPEG and PDF files. Open takes the rest.' : '';
    if (!fs.length) { if (said) app.toast(said, 9000); return; }
    app.openFiles(fs).then(() => { if (said) app.toast($('#toast span').textContent + ' ' + said, 10000); });
  });
  installHandles(app);
  // A relayout (the window's size, a picture loaded, fonts) puts the caret back as text positions,
  // which would let the selected picture go: it is selected again where it is
  const rl = app.relayout;
  app.relayout = function (...a) {
    const A = this.armed;
    const r = rl.apply(this, a);
    if (A && A.kind === 'img' && this.armed === A && A.el && A.el.isConnected) {
      const s = getSelection(), g = document.createRange();
      g.selectNode(A.el); this.ourSel = true; s.removeAllRanges(); s.addRange(g);
    }
    return r;
  };
  // A press on a picture selects it, as in Word (its frame and handles, the Picture Format tab);
  // a second press, a double click or Enter edits its source. Taken before the page's own press,
  // which opened the source at once. A right press selects it for the right click menu.
  const onPic = (e) => { const t = e.target; return t && t.closest ? t.closest('#pages .atom.a-img') : null; };
  let touch = false;
  document.addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch'; }, true);
  document.addEventListener('mousedown', (e) => {
    const el = onPic(e);
    if (!el || e.altKey || e.ctrlKey || e.metaKey) return;
    const info = atomOfEl(el);
    if (!info || info.a.kind !== 'img' || info.a.ro) return;
    if (e.button === 2) { app.picSelect(el, { tab: true, touch }); return; }
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (app.pop) app.closePop();
    const was = app.armed && app.armed.el === el;
    if (was && e.detail >= 2) { app.disarm(); app.openAtom(el, info); return; }
    app.picSelect(el, { tab: true, touch });
  }, true);
  // (a tap: the touch screen puts its caret where the finger was after the press came, so the
  // click that ends the tap selects the picture again)
  document.addEventListener('click', (e) => {
    const el = onPic(e);
    if (!el || e.altKey || e.ctrlKey || e.metaKey || e.detail >= 2) return;
    const info = atomOfEl(el);
    if (!info || info.a.kind !== 'img' || info.a.ro) return;
    e.preventDefault();
    const s = getSelection();
    if (app.armed && app.armed.el === el && s.rangeCount && s.getRangeAt(0).intersectsNode(el) && !s.isCollapsed) return;
    app.picSelect(el, { tab: true, touch });
  }, true);
  document.addEventListener('contextmenu', (e) => {
    const el = onPic(e);
    if (!el || e.shiftKey) return;
    // (a second right press gives the browser's menu, as on text)
    if (app.pop && app.pop.el.classList.contains('pop-ctx')) { app.closePop(true); return; }
    app.picSelect(el, { tab: true, touch });
    if (app.openContextMenu(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
});

export const methods = {
  // ---- the selected picture ---------------------------------------------------------------------
  // The picture selected on the page, read from its file: { f, s, src, P (src/picture.js), el }
  picHere() {
    const A = this.armed;
    if (!A || A.kind !== 'img' || !A.el || !A.el.isConnected || this.stale) return null;
    const src = this.src(A.f);
    if (this.texAt && this.texAt(A.f, A.s)) return null;
    const P = X.findPicture(src, this.picTree(A.f, src), A.s);
    return P ? { f: A.f, s: A.s, src, P, el: A.el } : null;
  },
  // the parser's tree of a file, kept while its text is the same
  picTree(f, src) {
    const c = this.picTreeCache || (this.picTreeCache = new Map());
    const hit = c.get(f);
    if (hit && hit.src === src) return hit.nodes;
    const nodes = parse(src);
    c.set(f, { src, nodes });
    if (c.size > 8) c.delete(c.keys().next().value);
    return nodes;
  },
  // Select a picture on the page (its element, or where its \includegraphics starts): its frame,
  // its handles, the Picture Format tab. No toast: Word says nothing either.
  picSelect(at, o = {}) {
    const el = at instanceof Element ? at : this.findAtomEl({ f: at.f, s: at.s, kind: 'img' });
    if (!el) return false;
    const info = atomOfEl(el);
    if (!info || info.a.kind !== 'img') return false;
    this.disarm();
    if (this.picCropping) this.picCropEnd(false);
    this.armed = { f: info.f, s: info.s, e: info.e, el, kind: 'img' };
    if (info.a.file) this.picNatural(info.a.file, false);
    // (a tap: the touch screen's own caret comes a moment later, and is not a move elsewhere)
    this.picSelT = o.touch ? Date.now() : 0;
    el.classList.add('sel');
    const r = document.createRange();
    r.selectNode(el);
    this.root.focus({ preventScroll: true });
    this.ourSel = true;
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    this.ribbonSync();
    // (a press or a tap on it opens its tab: on a phone the contextual tab is otherwise one entry
    // of a list; selected again after an edit of its own, it stays where the ribbon is)
    if (o.tab && this.rbTab !== 'picture-format') this.selectTab('picture-format');
    if (this.picHandles) this.picHandles.show();
    return true;
  },
  // what bears on where a float may go: the class (beamer), whether the float package can give [H]
  picContext(h) {
    const main = this.src(this.main), cls = docClass(main);
    const name = cls && cls.name;
    const o = { beamer: name === 'beamer' };
    // the paragraph after the picture: a list there, and wrapfig cannot wrap it
    const B = h.P.block;
    if (B.env || B.kind === 'para') {
      const after = h.src.slice(B.env ? B.env.e : h.P.outer.e, Math.min(h.src.length, (B.env ? B.env.e : h.P.outer.e) + 400));
      o.nextIsList = /^\s*\\begin\s*\{(itemize|enumerate|description)\}/.test(after);
      o.nextIsHeading = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/.test(after);
    }
    return o;
  },

  // ---- writing ---------------------------------------------------------------------------------
  // One operation on the selected picture: fn(src, P, h) gives { edits, packages, error, p }
  picOp(fn) {
    const h = this.picHere();
    if (!h) { this.toast(WHY); return false; }
    const r = fn(h.src, h.P, h);
    return this.picApply(h, r);
  },
  picApply(h, r) {
    if (!r) return false;
    if (r.error) { this.toast(r.error, 6000); return false; }
    const f = h.f;
    const edits = (r.edits || []).map((x) => ({ f, s: x.s, e: x.e, t: x.t }));
    // (keys need graphicx: graphics alone reads a bounding box there)
    const keys = edits.some((x) => x.s >= h.P.s && x.e <= h.P.e) && h.P.keyval;
    const pk = this.picPackages([...(r.packages || []), ...(keys ? ['graphicx'] : [])]);
    if (!edits.length) return false;
    const mine = [...edits, ...pk.filter((x) => x.f === f)];
    const ns = mapPos(mine, h.P.s, 1);
    let caret;
    if (r.p != null) { let p = r.p; for (const x of pk) if (x.f === f && x.s <= p) p += x.t.length - (x.e - x.s); caret = { f, p, bias: 1 }; }
    else caret = { f, p: ns, bias: 1 };
    this.closeGroup();
    this.removeGhost();
    this.commit([...edits, ...pk], caret, 'picture');
    this.closeGroup();
    if (r.p == null) this.picSelect({ f, s: ns });
    else this.ribbonSync();
    return true;
  },
  // the \usepackage lines an operation needs, once (graphicx where graphics alone is loaded;
  // caption's \captionof unless capt-of or caption gives it)
  picPackages(names) {
    const want = {}, src = this.src(this.main), end = preambleEnd(src), others = this.preambleOthers();
    for (const n of new Set(names)) {
      if (n === 'caption' && (hasPackage(src, 'capt-of', end, others) || hasPackage(src, 'caption', end, others))) continue;
      want[n] = null;
    }
    return Object.keys(want).length ? this.packageEdits(want) : [];
  },

  // ---- size --------------------------------------------------------------------------------------
  // The width of the line the picture is set in, in TeX points (a wrapfigure's is its own width)
  picLine(h) {
    const g = this.layout && this.layout.g;
    let lw = g && g.tw ? g.tw : 345;
    const S = h && X.sizeOf(h.src, h.P);
    if (S && S.by === 'wrap') { const w = X.lengthPt(S.width, lw); if (w) return w; }
    return lw;
  },
  // its size on the page now, in TeX points: { w, h }
  picDrawn(h) {
    const img = h.el.querySelector('img') || h.el, r = img.getBoundingClientRect();
    const px = this.layout && this.layout.px ? this.layout.px : 1.33;
    return { w: r.width / px, h: r.height / px };
  },
  picLocked(h) {
    const S = X.sizeOf(h.src, h.P);
    // (a size key after the angle sizes the turned box with its shape kept: locked, whatever else)
    const ai = h.P.kv.findIndex((i) => i.key === 'angle');
    if (ai >= 0 && h.P.kv.slice(ai + 1).some((i) => /^(width|height|totalheight|scale)$/.test(i.key))) return true;
    return !(S.width && S.height && !S.keepaspect);
  },
  // Width and height: { width, height } as LaTeX lengths or numbers of points, free (both kept
  // as given) or one with its shape kept
  picResize(o) {
    // (an argument from an agent or a field: a number of points, a length or a share of the line)
    const okLen = (v) => v == null || (typeof v === 'number' && v > 0 && v < 1e5) || (typeof v === 'string' && X.lengthPt(v.trim(), 345) != null && X.lengthPt(v.trim(), 345) > 0);
    if (!o || !okLen(o.width) || !okLen(o.height) || (o.width == null && o.height == null)) { this.toast('A length (6.5cm, 2in, 120pt) or a share of the line (0.5\\linewidth).'); return false; }
    return this.picOp((src, Q, h) => {
      const lw = this.picLine(h), S = X.sizeOf(src, Q);
      const base = (S.width && X.shareOf(S.width)) ? X.shareOf(S.width)[1] : 'linewidth';
      const txt = (v) => (v == null ? null : typeof v === 'number' ? X.widthText(v, lw, { base, near: 0.001 }) : String(v).trim());
      const free = o.free != null ? o.free : !this.picLocked(h);
      if (free) {
        const d = this.picDrawn(h);
        const w = o.width != null ? txt(o.width) : S.width || X.lengthText(d.w);
        const hh = o.height != null ? txt(o.height) : S.height || X.lengthText(d.h);
        return X.setSize(src, Q, w, hh, true);
      }
      return X.setSize(src, Q, o.width != null ? txt(o.width) : null, o.width == null ? txt(o.height) : null, false);
    });
  },
  // Lock Aspect Ratio: on, the height goes (the width keeps the shape); off, the height is written too
  picToggleLock() {
    return this.picOp((src, Q, h) => {
      const S = X.sizeOf(src, Q);
      if (!this.picLocked(h)) return X.setSize(src, Q, S.width, null, false);
      let d = this.picDrawn(h);
      const a = X.angleOf(src, Q);
      if (Number.isFinite(a) && Math.abs(Math.round(a / 90)) % 2 === 1) d = { w: d.h, h: d.w };
      if (S.keepaspect && S.width && S.height) return { edits: X.keyEdits(src, Q, { keepaspectratio: null }) };
      return X.setSize(src, Q, S.width || X.lengthText(d.w), S.height || X.lengthText(d.h), true);
    });
  },
  // a size field of the ribbon: what it shows, and Enter or the arrows set it
  picField(which) {
    const box = document.createElement('label');
    box.className = 'pf-field';
    const lab = document.createElement('span');
    lab.className = 'pf-lab'; lab.textContent = which === 'width' ? 'Width' : 'Height';
    lab.setAttribute('aria-hidden', 'true');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'rc-picture-' + which; inp.className = 'pf-v'; inp.dataset.cmd = 'picture-' + which;
    inp.setAttribute('role', 'spinbutton'); inp.setAttribute('aria-label', which === 'width' ? 'Width' : 'Height');
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.inputMode = 'decimal';
    inp.title = command('picture-' + which).title;
    const set = (v) => {
      const lw = this.picLine(this.picHere());
      const t = String(v).trim();
      const pct = /^([\d.,]+)\s*%$/.exec(t);
      if (pct) return this.picResize({ [which]: (parseFloat(pct[1].replace(',', '.')) / 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '\\linewidth' });
      const len = /^([\d.,]+)\s*(cm|mm|in|pt|bp)?$/.exec(t);
      if (len) return this.picResize({ [which]: parseFloat(len[1].replace(',', '.')) + (len[2] || inp.dataset.unit || 'cm') });
      if (X.lengthPt(t, lw) != null) return this.picResize({ [which]: t });
      this.toast('A length (6.5cm, 2in, 120pt) or a share of the line (50%).');
      this.picFieldSync(which);
      return false;
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); set(inp.value); this.ribbonBack(); if (this.armed) this.picSelect(this.armed.el); }
      else if (e.key === 'Escape') { e.preventDefault(); this.picFieldSync(which); this.ribbonBack(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const t = inp.value.trim(), d = e.key === 'ArrowUp' ? 1 : -1;
        const pct = /^([\d.,]+)\s*%$/.exec(t), len = /^([\d.,]+)\s*(cm|mm|in|pt|bp)?$/.exec(t);
        if (pct) inp.value = Math.max(5, Math.min(100, Math.round(parseFloat(pct[1]) / 5) * 5 + d * 5)) + '%';
        else if (len) { const u = len[2] || 'cm', st = { cm: 0.1, mm: 1, in: 0.1, pt: 2, bp: 2 }[u]; inp.value = Math.max(st, Math.round((parseFloat(len[1]) + d * st) * 100) / 100) + ' ' + u; }
        set(inp.value);
        setTimeout(() => { const x = document.getElementById(inp.id); if (x) x.focus(); }, 0);
      }
    });
    inp.addEventListener('focus', () => { const s = getSelection(); if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange(); inp.select(); });
    box.append(lab, inp);
    return box;
  },
  picFieldSync(which, at) {
    const inp = document.getElementById('rc-picture-' + which);
    if (!inp) return;
    const h = at === undefined ? this.picHere() : pic(this, at);
    inp.disabled = !h || !h.P.keyval;
    if (!h) { inp.value = ''; inp.removeAttribute('aria-valuetext'); return; }
    if (document.activeElement === inp) return;
    const S = X.sizeOf(h.src, h.P), lw = this.picLine(h), d = this.picDrawn(h);
    const v = which === 'width' ? S.width : S.height;
    const share = X.shareOf(v);
    let text;
    if (share) text = fmtNum(share[0] * 100, 1) + '%';
    else if (v && /^\s*[\d.]+\s*(cm|mm|in|pt|bp)\s*$/.test(v)) { const m = /([\d.]+)\s*(\w+)/.exec(v); text = m[1] + ' ' + m[2]; inp.dataset.unit = m[2]; }
    else text = fmtNum((which === 'width' ? d.w : d.h) * 2.54 / 72.27, 2) + ' cm';
    inp.value = text;
    inp.setAttribute('aria-valuetext', text);
    inp.setAttribute('aria-valuenow', String(Math.round((which === 'width' ? d.w : d.h) * 100) / 100));
    void lw;
  },
  // the dialog's values at once: { width, height, free, angle, crop: { l, b, r, t }, place }
  picSizeApply(o) {
    return this.picOp((src, Q, h) => {
      // each change on the text as the one before left it: worked out in turn, one commit
      let s = src, R = Q;
      const all = [];
      const step = (fn) => {
        const r = fn(s, R);
        if (!r || r.error) return r;
        const ed = r.edits || [];
        for (const x of [...ed].sort((a, b) => b.s - a.s || b.e - a.e)) s = s.slice(0, x.s) + x.t + s.slice(x.e);
        all.push(...(r.packages || []));
        R = X.findPicture(s, parse(s), mapPos(ed, R.s, 1));
        return R ? null : { error: 'The picture was lost on the way: nothing was written.' };
      };
      const lw = this.picLine(h);
      const S0 = X.sizeOf(src, Q);
      const base = (S0.width && X.shareOf(S0.width)) ? X.shareOf(S0.width)[1] : 'linewidth';
      const txt = (v) => (v == null ? null : typeof v === 'number' ? X.widthText(v, lw, { base, near: 0.001 }) : String(v).trim());
      const errs = [];
      if (o.width != null || o.height != null) { const e = step((t, p) => X.setSize(t, p, txt(o.width), o.free ? txt(o.height) : o.width == null ? txt(o.height) : null, !!o.free)); if (e) errs.push(e); }
      if (o.angle != null) { const e = step((t, p) => X.rotate(t, p, o.angle - X.angleOf(t, p))); if (e) errs.push(e); }
      if (o.crop) { const e = step((t, p) => X.setCrop(t, p, o.crop)); if (e) errs.push(e); }
      if (o.place) { const e = step((t, p) => X.setPosition(t, p, o.place, { ...this.picContext({ src: t, P: p }), lw })); if (e) errs.push(e); }
      if (errs.length) return errs[0];
      if (s === src) return { edits: [] };
      // (the whole change as one edit between the first and the last character that differ)
      let a = 0; while (a < src.length && a < s.length && src[a] === s[a]) a++;
      let z = 0; while (z < src.length - a && z < s.length - a && src[src.length - 1 - z] === s[s.length - 1 - z]) z++;
      return { edits: [{ s: a, e: src.length - z, t: s.slice(a, s.length - z) }], packages: all };
    });
  },

  // ---- crop ---------------------------------------------------------------------------------------
  picCrop(c) {
    if (!c || !['l', 'b', 'r', 't'].every((k) => Number.isFinite(+c[k]) && +c[k] >= 0 && +c[k] < 1e5)) { this.toast('Crop: four lengths from the edges, 0 or more.'); return false; }
    return this.picOp((src, Q) => X.setCrop(src, Q, { l: +c.l, b: +c.b, r: +c.r, t: +c.t }));
  },
  picCropMode() {
    if (this.picCropping) return this.picCropEnd(true);
    const h = this.picHere();
    if (!h) { this.toast(WHY); return false; }
    if (!h.el.querySelector('img')) { sizeDialog(this, 'crop'); return true; }
    // (the bars are in TeX's units of the file: its size first, as TeX reads it)
    if (this.picNaturalNow(h)) return this.picHandles.crop(h);
    const keep = { f: h.f, s: h.s };
    this.picNaturalWait(h.P.file.name).then(() => requestAnimationFrame(() => { const g = this.picHere(); if (g && g.f === keep.f && g.s === keep.s) this.picHandles.crop(g); }));
    return true;
  },
  picCropEnd(apply) { return this.picHandles ? this.picHandles.cropEnd(apply) : false; },

  // ---- the picture's natural size -----------------------------------------------------------------
  // { w, h } in bp, as TeX reads the file; null until its first bytes are read (then the page is
  // drawn again with it)
  picNaturalNow(h) { return this.picNatural(h.P.file.name); },
  picNatural(name, need = true) {
    const c = this.picNat || (this.picNat = new Map());
    const key = this.picAssetName(name);
    if (!key) return null;
    const blob = this.assetBlobs.get(key);
    const hit = c.get(key);
    if (hit && hit.blob === blob && hit.wait) { if (need) hit.need = true; return null; }
    if (hit && hit.blob === blob) return hit.size;
    c.set(key, { blob, wait: true, size: null, need });
    const done = blob.slice(0, 1 << 19).arrayBuffer().then((buf) => {
      const size = X.naturalSize(new Uint8Array(buf), key), was = c.get(key);
      c.set(key, { blob, size });
      if (size && was && was.need) this.picNatSoon();
      return size;
    }).catch(() => { c.set(key, { blob, size: null }); return null; });
    c.get(key).done = done;
    return null;
  },
  // the size of a picture's file when it is known: a promise
  picNaturalWait(name) {
    const now = this.picNatural(name);
    if (now) return Promise.resolve(now);
    const key = this.picAssetName(name), hit = key && this.picNat && this.picNat.get(key);
    return hit && hit.done ? hit.done : Promise.resolve(null);
  },
  // Sizes that came in: one rebuild for all of them (a document of 120 pictures read their headers
  // one by one, and each rebuilt every page), the picture selected kept selected, Crop going on
  picNatSoon() {
    if (this.picNatT) return;
    this.picNatT = requestAnimationFrame(() => {
      this.picNatT = 0;
      const A = this.armed && this.armed.kind === 'img' ? this.armed : null;
      this.forceRender = true;
      this.rebuild(A ? null : this.caretNow());
      if (A) {
        const el = this.findAtomEl({ f: A.f, s: A.s, kind: 'img' });
        if (el) {
          A.el = el; el.classList.add('sel');
          const r = document.createRange(); r.selectNode(el); this.ourSel = true;
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          this.ribbonSync();
          if (this.picHandles) this.picHandles.show();
        } else this.disarm();
      }
    });
  },
  // the name a picture's file has in the project (\includegraphics{plot} names plot.png)
  picAssetName(name) {
    if (!name || !this.assetBlobs) return null;
    const base = name.replace(/^\.\//, '');
    for (const c of [base, ...['.png', '.jpg', '.jpeg', '.pdf'].map((x) => base + x)]) if (this.assetBlobs.has(c)) return c;
    const short = base.split('/').pop();
    for (const k of this.assetBlobs.keys()) { const kb = k.split('/').pop(); if (kb === short || kb.replace(/\.[^.]+$/, '') === short) return k; }
    return null;
  },

  // ---- position, wrapping, caption ---------------------------------------------------------------
  picPlace(to) {
    return this.picOp((src, Q, h) => {
      const d = this.picDrawn(h);
      return X.setPosition(src, Q, to, { ...this.picContext(h), widthPt: d.w, lw: this.layout && this.layout.g ? this.layout.g.tw : null });
    });
  },
  picCaption() {
    // (References' Insert Caption, where a batch brings one, does it for every kind of object)
    const other = command('caption');
    if (other && other.run && other !== command('picture-caption') && enabled(this, other, this.ribbonAt())) return this.runCommand('caption');
    const h = this.picHere();
    if (!h) { this.toast(WHY); return false; }
    return this.picApply(h, X.captionEdits(h.src, h.P));
  },
  picMenu(which) {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    const h = this.picHere();
    const ids = {
      position: [['picture-inline'], null, ['picture-place-best', 'picture-place-top', 'picture-place-bottom', 'picture-place-here', 'picture-place-exact', 'picture-place-page'], null, ['picture-wrap-left', 'picture-wrap-right']],
      wrap: [['picture-inline', 'picture-wrap-square'], ['tight'], ['through'], ['picture-wrap-topbottom'], ['behind'], ['front'], null, ['picture-size', 'More Layout Options…']],
      rotate: [['picture-rotate-right', 'picture-rotate-left'], null, ['picture-flip-vertical', 'picture-flip-horizontal'], null, ['picture-size', 'More Rotation Options…']]
    }[which] || [];
    const items = [];
    for (const row of ids) {
      if (!row) { items.push(null); continue; }
      if (row[0] === 'tight' || row[0] === 'through') {
        const sq = command('picture-wrap-square');
        items.push({ name: row[0] === 'tight' ? 'Tight' : 'Through', title: 'LaTeX wraps the text round the picture\'s box: Tight and Through write the same wrapfigure as Square', checked: !!(sq.on && sq.on(this, at)), disabled: !(sq.when(this, at)), run: () => { this.ribbonBack(); this.runCommand('picture-wrap-square'); } });
        continue;
      }
      if (row[0] === 'behind' || row[0] === 'front') { items.push({ name: row[0] === 'behind' ? 'Behind Text' : 'In Front of Text', title: 'LaTeX has no picture over or under the text\'s lines: TikZ\'s overlay does it by hand', disabled: true }); continue; }
      if (row[1] && !row[1].startsWith('picture-')) { const c = command(row[0]); items.push({ name: row[1], title: c.title, disabled: !c.when(this, at), run: () => { this.ribbonBack(); sizeDialog(this, which === 'rotate' ? 'angle' : 'place'); } }); continue; }
      for (const id of row) {
        const c = command(id);
        const on = c.on ? c.on(this, at) : null;
        items.push({ name: c.name, title: c.title, checked: on == null ? undefined : !!on, radio: which !== 'rotate' && on != null, disabled: !c.when(this, at), run: () => { this.ribbonBack(); this.runCommand(id); } });
      }
    }
    void h;
    const b = document.getElementById({ position: 'rc-picture-position', wrap: 'rc-picture-wrap', rotate: 'rc-picture-rotate' }[which]);
    const lay = document.getElementById({ position: 'rc-picture-position-layout', wrap: 'rc-picture-wrap-layout', rotate: 'rc-picture-rotate-layout' }[which]);
    const anchor = [b, lay].find((x) => x && x.offsetParent) || (this.armed && this.armed.el) || this.root;
    openMenu(this, anchor, items, { label: { position: 'Position', wrap: 'Wrap Text', rotate: 'Rotate' }[which] });
    return true;
  },

  // ---- alt text ---------------------------------------------------------------------------------
  picSetAlt(text, decorative) { return this.picOp((src, Q) => X.setAlt(src, Q, text, !!decorative)); },

  // ---- change ------------------------------------------------------------------------------------
  picChoose() {
    const h = this.picHere();
    if (!h) { this.toast(WHY); return false; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf';
    const keep = { f: h.f, s: h.s };
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      if (!/\.(png|jpe?g|pdf)$/i.test(file.name)) { this.toast(file.name + ' is no picture: Change Picture takes PNG, JPEG and PDF files.'); return; }
      this.picSelect(keep);
      this.picChange(file.name, file);
    });
    inp.click();
    return true;
  },
  // the file in the picture's place: added to the project under a safe name (another where the
  // name is taken by a different file), the \includegraphics kept but for its file
  picChange(name, blob) {
    const h = this.picHere();
    if (!h) { this.toast(WHY); return false; }
    const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    if (!m || !/^(png|jpe?g|pdf)$/i.test(m[1])) { this.toast('Change Picture takes PNG, JPEG and PDF files.'); return false; }
    const ext = '.' + m[1].toLowerCase();
    const base = (String(name).split('/').pop().slice(0, -ext.length).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'figure').slice(0, 60);
    const taken = (n) => this.files.has(n) || this.extra.has(n) || (this.assetBlobs.has(n) && this.assetBlobs.get(n) !== blob);
    let nm = base + ext;
    for (let k = 2; taken(nm); k++) nm = base + '-' + k + ext;
    if (blob && !this.assetBlobs.has(nm)) { this.addAsset(nm, blob); this.binaryDirty = true; this.zipDirty = true; this.forceRender = true; }
    return this.picApply(h, X.changeFile(h.src, h.P, nm));
  }
};

// ---- Insert's objects --------------------------------------------------------------------------
Object.assign(methods, {
  // A block of its own (a drawing, a chart, a diagram, a text box) after the block the caret is
  // in, in a center: no float, so none lands in columns or in another float; its packages in the
  // same step, the caret where o.caret (an offset in text) says, or after it
  insertObject(text, packages, o = {}) {
    const { f, p, pre, post } = this.afterBlockPos();
    const nl = /\r\n/.test(this.src(f).slice(0, 4000)) ? '\r\n' : '\n';
    const body = (o.bare ? text : '\\begin{center}' + nl + text + nl + '\\end{center}').replace(/\n/g, nl).replace(/\r\r\n/g, '\r\n');
    const pk = this.picPackages(packages);
    // (pgfplots' compat level with its \usepackage, once: else it warns at every compile)
    if (packages.includes('pgfplots') && !/\\pgfplotsset\s*\{[^{}]{0,200}compat/.test(this.src(this.main).slice(0, 200000))) for (const x of pk) x.t = x.t.replace(/(\\usepackage(\[[^\]]{0,200}\])?\{pgfplots\})/, '$1' + nl + '\\pgfplotsset{compat=1.18}');
    let at = p + pre.length + (o.caret != null ? body.indexOf(o.mark) + o.caret : body.length);
    let selB = o.select ? at + o.select : null;
    for (const x of pk) if (x.f === f && x.s <= p) { const d = x.t.length - (x.e - x.s); at += d; if (selB != null) selB += d; }
    this.closeGroup();
    this.removeGhost();
    this.commit([{ f, s: p, e: p, t: pre + body + post }, ...pk], selB != null ? { f, p: at, selA: at, selB } : { f, p: at, bias: 1 }, 'insert');
    this.closeGroup();
    return true;
  },
  shapesGallery() {
    const b = document.getElementById('rc-insert-shapes');
    openGallery(this, b && b.offsetParent ? b : this.root, D.SHAPES.map(([id, name, , icon]) => ({ name, html: '<svg viewBox="0 0 20 20" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.4;stroke-linejoin:round">' + icon + '</svg>', run: () => { this.ribbonBack(); this.runCommand('insert-shapes', { shape: id }); } })), { label: 'Shapes', columns: 4 });
    return true;
  },
  insertShape(id) {
    const t = D.shapeTex(id);
    if (!t) return false;
    return this.insertObject(t, ['tikz']);
  },
  iconsGallery() {
    const b = document.getElementById('rc-insert-icons');
    openGallery(this, b && b.offsetParent ? b : this.root, D.ICONS.map(([id, name, icon]) => ({ name, title: '\\faIcon{' + id + '}', html: '<svg viewBox="0 0 20 20" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round">' + icon + '</svg>', run: () => { this.ribbonBack(); this.runCommand('insert-icons', { icon: id }); } })), { label: 'Icons', columns: 6 });
    return true;
  },
  // an icon at the caret, in the sentence (over a selection: after it)
  insertIcon(id) {
    if (!D.ICONS.some((x) => x[0] === id) && !/^[a-z0-9-]{1,40}$/.test(String(id))) return false;
    const c = this.caretNow();
    if (!c) return false;
    const f = c.ghost ? this.ghost.f : c.f, p = c.ghost ? this.ghost.pos : c.b;
    if (this.texAt(f, p)) { this.toast('The caret is in a LaTeX paragraph: write \\faIcon{' + id + '} there yourself.'); return false; }
    const t = '\\faIcon{' + id + '}';
    const main = this.src(this.main), end = preambleEnd(main), others = this.preambleOthers();
    if (hasPackage(main, 'fontawesome', end, others)) {
      const v4 = { 'map-marker-alt': 'faMapMarker', clock: 'faClockO', lightbulb: 'faLightbulbO', 'chart-bar': 'faBarChart' }[id] || 'fa' + id.replace(/(^|-)(\w)/g, (m, a, b) => b.toUpperCase());
      this.toast('This document loads Font Awesome 4 (fontawesome), which clashes with fontawesome5: write its own command, \\' + v4 + ', where the icon goes.', 8000);
      return false;
    }
    const fa = ['fontawesome6', 'fontawesome7', 'fontawesome5'].some((n) => hasPackage(main, n, end, others));
    const pk = fa ? [] : this.picPackages(['fontawesome5']);
    let at = p + t.length;
    for (const x of pk) if (x.f === f && x.s <= p) at += x.t.length - (x.e - x.s);
    this.closeGroup();
    if (c.ghost) { this.insertPiece(null, this.ghost, t, ''); if (pk.length) this.commit(pk, null, 'insert-pk'); }
    else this.commit([{ f, s: p, e: p, t }, ...pk], { f, p: at, bias: 1 }, 'insert');
    this.closeGroup();
    return true;
  },
  insertSmart(kind, items) {
    if (!D.SMART.some((x) => x[0] === kind)) kind = D.SMART[0][0];
    const list = (Array.isArray(items) ? items : String(items || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
    if (!list.length) { this.toast('SmartArt needs at least one item.'); return false; }
    if (list.length > D.smartMax(kind)) { this.toast('SmartArt (smartdiagram) holds at most ' + D.smartMax(kind) + ' items here: its colours stop there and TeX stops on more. Split the list into two diagrams.', 8000); return false; }
    return this.insertObject(D.smartTex(kind, list), ['smartdiagram']);
  },
  insertChart(kind, cats, series) {
    const k = kind === 'bar' || kind === 'line' ? kind : 'column';
    const C = (cats || []).map((x) => String(x)).slice(0, 30);
    const S = (series || []).filter((x) => x && Array.isArray(x.values)).slice(0, 6);
    if (!C.length || !S.length) { this.toast('A chart needs at least one category and one series of numbers.'); return false; }
    return this.insertObject(D.chartTex(k, C, S), ['pgfplots']);
  },
  async insertScreenshot() {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const v = document.createElement('video');
      v.muted = true; v.srcObject = stream;
      await v.play();
      await new Promise((r) => (v.videoWidth ? r() : v.addEventListener('loadeddata', r, { once: true })));
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('no picture came');
      this.ribbonBack();
      await this.openFiles([new File([blob], 'screenshot.png', { type: 'image/png' })]);
      return true;
    } catch (e) {
      this.toast(e && e.name === 'NotAllowedError' ? 'No screenshot: the capture was cancelled or this page may not capture the screen here (in a frame, open Rikuy in its own window).' : 'No screenshot: ' + (e && e.message ? e.message : e) + '.', 7000);
      return false;
    } finally { if (stream) for (const t of stream.getTracks()) t.stop(); }
  },
  textBoxMenu() {
    const b = document.getElementById('rc-insert-textbox');
    openMenu(this, b && b.offsetParent ? b : this.root, ['textbox-simple', 'textbox-shaded', 'textbox-beside'].map((id) => { const c = command(id); return { name: c.name, title: c.title, run: () => { this.ribbonBack(); this.runCommand(id); } }; }), { label: 'Text Box' });
    return true;
  },
  // A text box after the caret's block, "Type here." selected in it to type over
  insertTextBox(kind) {
    const T = 'Type here.';
    if (kind === 'shaded') return this.insertObject('\\begin{tcolorbox}[width=0.6\\linewidth, center, colback=gray!10]\n' + T + '\n\\end{tcolorbox}', ['tcolorbox'], { bare: true, mark: T, caret: 0, select: T.length });
    if (kind === 'beside') {
      const { f, p } = this.afterBlockPos();
      const src = this.src(f), envs = X.envsAt(this.picTree(f, src), p);
      const why = envs.some((n) => /^(itemize|enumerate|description)$/.test(n)) ? 'wrapfig cannot wrap text in a list: the box goes in a list here.' : envs.some((n) => /^multicols\*?$/.test(n)) ? 'A box beside the text cannot stand in columns (multicols).' : envs.some((n) => /^(minipage|figure|table|wrapfigure|tabular)/.test(n)) ? 'A box beside the text cannot stand in another box or float.' : null;
      if (why) { this.toast(why, 6000); return false; }
      return this.insertObject('\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\fbox{\\begin{minipage}{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule\\relax}\n' + T + '\n\\end{minipage}}\n\\end{wrapfigure}', ['wrapfig'], { bare: true, mark: T, caret: 0, select: T.length });
    }
    return this.insertObject('\\fbox{\\begin{minipage}{0.5\\linewidth}\n' + T + '\n\\end{minipage}}', [], { mark: T, caret: 0, select: T.length });
  },

  // ---- drop cap ---------------------------------------------------------------------------------
  // The paragraph the caret is in, for Drop Cap: { f, s (its first character), mode: 'none' |
  // 'dropped' | 'margin', L (its \lettrine: node, options), word: [letter, rest] } or null
  dropCapAt(at) {
    if (!at || !at.c || at.c.ghost || !at.B || !at.it) return null;
    const m = at.memo || (at.memo = {});
    if ('dropcap' in m) return m.dropcap;
    m.dropcap = null;
    const B = at.B;
    if (at.it.dataset.ctx !== 'p' || B.items.length !== 1 || /\b(thm|tex|bibitem)\b/.test(at.it.className) || at.cell) return null;
    const src = this.src(B.f);
    let s = B.s;
    while (s < B.e && /\s/.test(src[s])) s++;
    if (this.texAt(B.f, s)) return null;
    const head = src.slice(s, Math.min(B.e, s + 400));
    if (/^\\lettrine\b/.test(head)) {
      const n = X.nodeAt(this.picTree(B.f, src), s);
      if (!n || n.t !== 'cmd' || n.name !== 'lettrine') return null;
      const o = n.args.find((x) => x && x.o), ms = n.args.filter((x) => x && !x.o);
      if (ms.length < 2) return null;
      const ot = o ? src.slice(o.is, o.ie) : '';
      m.dropcap = { f: B.f, s, mode: /(^|,)\s*lhang\s*=\s*(1|0?\.[5-9]\d*)\s*(,|$)/.test(ot) ? 'margin' : 'dropped', L: { n, o, ms, ot } };
      return m.dropcap;
    }
    const w = /^(\p{L})(\p{L}*)/u.exec(head);
    if (!w) return null;
    m.dropcap = { f: B.f, s, mode: 'none', word: [w[1], w[2]] };
    return m.dropcap;
  },
  dropCapWhy(at) {
    if (!at) return 'Put the caret in a paragraph first.';
    return 'A drop cap starts a paragraph of text that begins with a letter: put the caret in one.';
  },
  dropCapMenu() {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    const d = this.dropCapAt(at);
    const b = document.getElementById('rc-insert-dropcap');
    const items = [['dropcap-none', 'None'], ['dropcap-dropped', 'Dropped'], ['dropcap-margin', 'In Margin']].map(([id, name]) => ({ name: name === 'None' ? 'No Drop Cap' : name, radio: true, checked: !!d && d.mode === { 'dropcap-none': 'none', 'dropcap-dropped': 'dropped', 'dropcap-margin': 'margin' }[id], title: command(id).title, run: () => { this.ribbonBack(); this.runCommand(id === 'dropcap-none' && (!d || d.mode === 'none') ? 'insert-dropcap' : id, id === 'dropcap-none' && (!d || d.mode === 'none') ? { mode: 'none' } : undefined); } }));
    items.push(null, { name: 'Drop Cap Options…', title: command('dropcap-options').title, run: () => { this.ribbonBack(); this.runCommand('dropcap-options'); } });
    openMenu(this, b && b.offsetParent ? b : this.root, items, { label: 'Drop Cap' });
    return true;
  },
  // Drop Cap: { mode: 'dropped' | 'margin' | 'none', lines, distance (a length) }. Again on the
  // mode it has: nothing changes (None takes it off)
  dropCap(o) {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    const d = this.dropCapAt(at);
    if (!d) { this.toast(this.dropCapWhy(at)); return false; }
    const src = this.src(d.f), c = at.c;
    if (o.lines != null && !(Number.isInteger(+o.lines) && +o.lines >= 2 && +o.lines <= 10)) { this.toast('Lines to drop: 2 to 10.'); return false; }
    if (o.distance != null && !/^\d+(\.\d+)?(pt|mm|cm|em|ex|in)$/.test(String(o.distance))) { this.toast('Distance from text: a length such as 2pt.'); return false; }
    const opt = (lines, margin, dist) => '[' + ['lines=' + (+lines || 3), margin ? 'lhang=1' : null, dist ? 'findent=' + dist : null].filter(Boolean).join(',') + ']';
    let edits;
    if (o.mode === 'none') {
      if (d.mode === 'none') return false;
      const { n, ms } = d.L;
      edits = [{ s: n.s, e: ms[1].e, t: src.slice(ms[0].is, ms[0].ie) + src.slice(ms[1].is, ms[1].ie) }];
    } else if (d.mode === 'none') {
      const [L, rest] = d.word;
      edits = [{ s: d.s, e: d.s + L.length + rest.length, t: '\\lettrine' + opt(o.lines, o.mode === 'margin', o.distance) + '{' + L + '}{' + rest + '}' }];
    } else {
      // (its options as the dialog or the menu says, the letter and the rest as they are)
      const { n, o: oa } = d.L;
      const lines = o.lines || +((/(?:^|,)\s*lines\s*=\s*(\d+)/.exec(d.L.ot) || [])[1] || 3);
      const dist = o.distance !== undefined ? o.distance : ((/(?:^|,)\s*findent\s*=\s*([^,]+)/.exec(d.L.ot) || [])[1] || null);
      const t = opt(lines, o.mode === 'margin', dist && String(dist).trim());
      if (oa) edits = src.slice(oa.s, oa.e) === t ? [] : [{ s: oa.s, e: oa.e, t }];
      else edits = [{ s: n.ne, e: n.ne, t }];
    }
    if (!edits.length) return false;
    const f = d.f, pk = o.mode === 'none' ? [] : this.picPackages(['lettrine']);
    const map = (p) => mapPos([...edits.map((x) => ({ f, ...x })), ...pk.filter((x) => x.f === f)], p);
    this.closeGroup();
    this.commit([...edits.map((x) => ({ f, ...x })), ...pk], { f, p: c.f === f ? map(c.a) : c.a, bias: 1 }, 'dropcap');
    this.closeGroup();
    return true;
  }
});

const fmtNum = (v, d) => String(Math.round(v * 10 ** d) / 10 ** d);
