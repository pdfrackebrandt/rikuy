// Formatting an object after it is in the document, as Word does: a drawing, a chart or a SmartArt
// pressed on the page is selected (src/ui/shapes.js) and its contextual tabs show: Shape Format;
// Chart Design and Format; SmartArt Design and Format. Every control writes one commit of small
// edits of the object's own LaTeX (src/objfmt.js), read back by the page's drawing
// (src/drawing.js) so the page draws what TeX prints; one undo gives the bytes back. Each object
// has its right click menu, and a long press on a touch screen opens it.
//
// Left out, having no meaning in LaTeX: shape effects (shadow, glow, bevel, 3-D), WordArt styles,
// a SmartArt shape's own colour or size (smartdiagram sets them for the whole diagram), Quick
// Layout and chart styles beyond the colours (pgfplots has no such sets), a chart's 3-D kinds.

import { register, onInstall, command } from '../commands.js';
import * as O from '../objfmt.js';
import * as D from '../drawing.js';
import { atomOfEl } from '../editor.js';
import { openMenu, openGallery } from '../ui/kit.js';
import { menuItems, enabled } from '../commands.js';
import { editChart } from '../ui/shapes.js';
import { smartDialog, wordsDialog, axisTitlesDialog } from '../ui/picturedialogs.js';

const sel = (app, kind) => { const o = app.objHere ? app.objHere() : null; return o && (!kind || o.kind === kind) ? o : null; };
const isK = (kind) => (app) => !!sel(app, kind);
const WHY = { shape: 'Select a drawing first: click it on the page.', chart: 'Select a chart first: click it on the page.', smart: 'Select a SmartArt first: click it on the page.' };
const C = (kind) => (id, name, o) => ({ id, name, when: isK(kind), whyNot: () => WHY[kind], ...o });
const S = C('shape'), CH = C('chart'), SM = C('smart');
const shapeInfo = (app) => { const o = sel(app, 'shape'); return o ? O.shapeInfo(o.text) : null; };
const chartInfo = (app) => { const o = sel(app, 'chart'); return o ? O.chartInfo(o.text) : null; };
const smartInfo = (app) => { const o = sel(app, 'smart'); return o ? O.smartInfo(o.text) : null; };

const ICON = {
  shapes: '<path d="M3 9.5h7v7H3z"/><circle cx="13.5" cy="6.5" r="3.5"/>',
  styles: '<path d="M3.5 4.5h13v11h-13z"/><path d="M6 7.5h8v5H6z" style="fill:currentColor;stroke:none" opacity=".35"/>',
  fill: '<path d="M4 10l5-5 6 6-5 5z"/><path d="M15.5 12.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/><path d="M3 18.5h14" stroke-width="2.5"/>',
  outline: '<path d="M4 4h12v10H4z"/><path d="M3 18.5h14" stroke-width="2.5"/>',
  text: '<path d="M3.5 4.5h13v11h-13zM7 8h6M10 8v5"/>',
  forward: '<path d="M3.5 8.5h8v8h-8z"/><path d="M8.5 3.5h8v8h-8z" style="fill:currentColor" opacity=".35"/>',
  backward: '<path d="M8.5 3.5h8v8h-8z"/><path d="M3.5 8.5h8v8h-8z" style="fill:currentColor" opacity=".35"/>',
  element: '<path d="M3 17h14M5 17v-6M9 17V7M13 17v-4"/><path d="M14 3v6M11 6h6"/>',
  colors: '<circle cx="7" cy="8" r="3.5"/><circle cx="13" cy="8" r="3.5"/><circle cx="10" cy="13" r="3.5"/>',
  switch: '<path d="M4 4h5v5H4zM11 11h5v5h-5z"/><path d="M13 4h3v3M16 4l-4 4M7 16H4v-3M4 16l4-4"/>',
  data: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M3.5 12h13M8 4.5v11M12 4.5v11"/>',
  type: '<path d="M3 17h14M5 17v-6M9 17V5M13 17V9"/><path d="M12 6l2-2 2 2-2 2z"/>',
  addShape: '<path d="M2.5 7.5h5v5h-5zM12.5 7.5h5v5h-5z"/><path d="M10 7.5v5M7.5 10h5"/>',
  pane: '<path d="M3.5 4.5h13v11h-13zM8 4.5v11"/><path d="M10 8h5M10 11h4"/>',
  rtl: '<path d="M16 7H5M8 4L5 7l3 3M4 13h11M12 10l3 3-3 3"/>',
  layout: '<path d="M2.5 8h4v4h-4zM8 8h4v4H8zM13.5 8h4v4h-4z"/><path d="M6.5 10H8M12 10h1.5"/>',
  reset: '<path d="M4.5 8a6 6 0 1 1 .9 5.5"/><path d="M4 4v4h4"/>'
};
const SWATCH = (c) => O.colorHex(c);
const r2 = (v) => Math.round(v * 100) / 100;

// ---- Shape Format ------------------------------------------------------------------------------
register(
  S('shape-insert', 'Insert Shape', { title: 'Insert Shape: another shape in this drawing, beside the others (one TikZ picture: they move together and Bring Forward and Send Backward order them)', tab: 'shape-format', group: 'insert', order: 10, kind: 'menu', icon: ICON.shapes, label: 'Insert Shape',
    synonyms: ['Add shape to drawing', 'Drawing canvas', 'Group shapes'], run: (app, args) => (args && args.shape ? app.shapeAdd(args.shape) : app.shapeAddGallery()) }),
  S('shape-styles', 'Theme Styles', { title: 'Theme Styles: an outline and a fill together, from the theme\'s colours (draw= and fill=)', tab: 'shape-format', group: 'styles', order: 10, kind: 'menu', icon: ICON.styles, label: 'Theme Styles',
    synonyms: ['Shape Styles', 'Quick styles', 'Shape style gallery'], menu: { shape: 30 }, run: (app, args) => (args && args.style ? app.shapeSet('style', args.style) : app.shapeStylesGallery()) }),
  S('shape-fill', 'Shape Fill', { title: 'Shape Fill: the colour inside the shape (fill=…), or No Fill', tab: 'shape-format', group: 'styles', order: 20, kind: 'menu', icon: ICON.fill, label: 'Shape Fill',
    synonyms: ['Fill color', 'Fill colour', 'Background of shape'], when: (app) => { const I = shapeInfo(app); return !!I && I.closed; }, whyNot: (app) => (sel(app, 'shape') ? 'A line has no inside to fill.' : WHY.shape), menu: { shape: 40 },
    run: (app, args) => (args && 'color' in args ? app.shapeSet('fill', args.color || 'none') : app.objColorMenu('fill')) }),
  S('shape-outline', 'Shape Outline', { title: 'Shape Outline: the line\'s colour (draw=…), No Outline, its weight, dashes and arrows', tab: 'shape-format', group: 'styles', order: 30, kind: 'menu', icon: ICON.outline, label: 'Shape Outline',
    synonyms: ['Line color', 'Border color', 'Outline colour', 'Line colour'], menu: { shape: 50 }, run: (app, args) => (args && 'color' in args ? app.shapeSet('outline', args.color || 'none') : app.objColorMenu('outline')) }),
  S('shape-weight', 'Weight', { title: 'Weight: how thick the line is (line width=…pt)', synonyms: ['Line weight', 'Line width', 'Thickness'],
    run: (app, args) => (args && args.pt ? app.shapeSet('weight', args.pt) : app.shapeLineMenu('weight')) }),
  S('shape-dashes', 'Dashes', { title: 'Dashes: a solid, dashed, dotted or dash dot line', synonyms: ['Dash type', 'Dotted line', 'Dashed line'],
    run: (app, args) => (args && args.dash ? app.shapeSet('dash', args.dash) : app.shapeLineMenu('dash')) }),
  S('shape-arrows', 'Arrows', { title: 'Arrows: tips at a line\'s ends (->, <-, <->)', synonyms: ['Arrowheads', 'Arrow tips'], when: (app) => { const I = shapeInfo(app); return !!I && I.lines; }, whyNot: (app) => (sel(app, 'shape') ? 'Arrows go on a line, and this drawing has no open line.' : WHY.shape),
    run: (app, args) => (args && args.arrow ? app.shapeSet('arrow', args.arrow) : app.shapeLineMenu('arrow')) }),
  S('shape-text', 'Edit Text', { title: 'Edit Text: words in the shape, at its middle (\\node at (x,y) {…}); empty takes them off', tab: 'shape-format', group: 'text', order: 10, icon: ICON.text, label: 'Edit Text',
    synonyms: ['Add text', 'Text in shape', 'Label shape'], menu: { shape: 10 }, run: (app, args) => (args && 'text' in args ? app.shapeText(args.text) : app.shapeTextDialog()) }),
  S('shape-forward', 'Bring Forward', { title: 'Bring Forward: the shape selected in the drawing over the one above it (drawn later); the arrow for Bring to Front', tab: 'shape-format', group: 'arrange', order: 30, kind: 'split', icon: ICON.forward, label: 'Bring Forward',
    synonyms: ['Move forward', 'Order', 'Z order'], when: (app) => app.shapeCanOrder('forward'), whyNot: (app) => app.shapeOrderWhy(), menu: { shape: 60 },
    run: (app) => app.shapeOrder('forward'), menuItems: () => [{ name: 'Bring Forward', command: 'shape-forward' }, { name: 'Bring to Front', command: 'shape-front' }] }),
  S('shape-backward', 'Send Backward', { title: 'Send Backward: the shape selected in the drawing under the one below it (drawn earlier); the arrow for Send to Back', tab: 'shape-format', group: 'arrange', order: 40, kind: 'split', icon: ICON.backward, label: 'Send Backward',
    synonyms: ['Move backward', 'Order'], when: (app) => app.shapeCanOrder('backward'), whyNot: (app) => app.shapeOrderWhy(), menu: { shape: 61 },
    run: (app) => app.shapeOrder('backward'), menuItems: () => [{ name: 'Send Backward', command: 'shape-backward' }, { name: 'Send to Back', command: 'shape-back' }] }),
  S('shape-front', 'Bring to Front', { title: 'Bring to Front: the shape selected drawn last, over every other', when: (app) => app.shapeCanOrder('front'), whyNot: (app) => app.shapeOrderWhy(), run: (app) => app.shapeOrder('front') }),
  S('shape-back', 'Send to Back', { title: 'Send to Back: the shape selected drawn first, under every other', when: (app) => app.shapeCanOrder('back'), whyNot: (app) => app.shapeOrderWhy(), run: (app) => app.shapeOrder('back') }),
  S('shape-height', 'Shape Height', { title: 'Shape Height in cm: Enter sets it, the drawing scaled to it (scale=, or xscale= and yscale= when only one changes)', tab: 'shape-format', group: 'size', order: 10, kind: 'custom', role: 'spinbutton', el: 'rc-shape-height',
    synonyms: ['Drawing height'], render: (app) => app.objField('shape', 'height'), sync: (app) => app.objFieldSync('shape', 'height'), run: (app, args) => (args && args.cm ? app.shapeResize('height', args.cm) : app.objFieldFocus('rc-shape-height')) }),
  S('shape-width', 'Shape Width', { title: 'Shape Width in cm: Enter sets it, the drawing scaled to it', tab: 'shape-format', group: 'size', order: 20, kind: 'custom', role: 'spinbutton', el: 'rc-shape-width',
    synonyms: ['Drawing width', 'Size of shape'], render: (app) => app.objField('shape', 'width'), sync: (app) => app.objFieldSync('shape', 'width'), run: (app, args) => (args && args.cm ? app.shapeResize('width', args.cm) : app.objFieldFocus('rc-shape-width')) }),
  S('shape-source', 'Show Drawing Source', { title: 'The drawing\'s TikZ, to edit as LaTeX (Enter on it, or a double click, does the same)', menu: { shape: 90 }, synonyms: ['Edit TikZ', 'Edit source'], run: (app) => app.objSource() })
);

// ---- Chart Design and Format ------------------------------------------------------------------------
const chartToggle = (prop, id, name, title, syn) => CH(id, name, { title, kind: 'toggle', synonyms: syn, on: (app) => { const I = chartInfo(app); return I ? !!I[prop] : null; }, run: (app, args) => { const I = chartInfo(app); return app.chartSet(prop, args && 'on' in args ? !!args.on : !(I && I[prop])); } });
register(
  CH('chart-element', 'Add Chart Element', { title: 'Add Chart Element: a chart title, axis titles, the legend\'s place, gridlines, data labels', tab: 'chart-design', group: 'layouts', order: 10, kind: 'menu', icon: ICON.element, label: 'Add Chart Element',
    synonyms: ['Chart elements', 'Chart layout'], run: (app) => app.chartElementMenu() }),
  CH('chart-title', 'Chart Title', { title: 'Chart Title: words above the chart (title={…}); empty takes it off', synonyms: ['Title of chart'], menu: { chart: 20 }, run: (app, args) => (args && 'text' in args ? app.chartSet('title', args.text) : app.chartTitleDialog()) }),
  CH('chart-axis-titles', 'Axis Titles', { title: 'Axis Titles: words under the horizontal axis and beside the vertical one (xlabel={…}, ylabel={…})', synonyms: ['Axis labels', 'xlabel', 'ylabel'], menu: { chart: 21 },
    run: (app, args) => (args && ('x' in args || 'y' in args) ? app.chartAxisTitles(args.x, args.y) : app.chartAxisDialog()) }),
  CH('chart-legend', 'Legend', { title: 'Legend: where the names of the series stand (legend pos=…); a chart of one series has none', synonyms: ['Legend position', 'Key'], when: (app) => { const I = chartInfo(app); return !!I && I.series.length > 1; }, whyNot: (app) => (sel(app, 'chart') ? 'A chart of one series has no legend.' : WHY.chart),
    run: (app, args) => (args && args.pos ? app.chartSet('legend', args.pos) : app.chartLegendMenu()) }),
  chartToggle('grid', 'chart-gridlines', 'Gridlines', 'Gridlines: light lines across the chart at each value (ymajorgrids, or xmajorgrids in a bar chart)', ['Major gridlines', 'Grid']),
  chartToggle('labels', 'chart-data-labels', 'Data Labels', 'Data Labels: each value written at its bar or point (nodes near coords)', ['Values on bars', 'Show values']),
  CH('chart-colors', 'Change Colors', { title: 'Change Colors: the series\' colours, colourful or shades of one (cycle list={…})', tab: 'chart-design', group: 'styles', order: 10, kind: 'menu', icon: ICON.colors, label: 'Change Colors',
    synonyms: ['Chart colours', 'Chart styles', 'Palette'], menu: { chart: 30 }, run: (app, args) => (args && args.palette ? app.chartSet('palette', args.palette) : app.chartColorsGallery()) }),
  CH('chart-switch', 'Switch Row/Column', { title: 'Switch Row/Column: the series become the categories and the categories the series', tab: 'chart-design', group: 'data', order: 10, icon: ICON.switch, label: 'Switch Row/Column',
    synonyms: ['Transpose', 'Swap rows and columns'], run: (app) => app.objApply(O.chartSwitch(sel(app, 'chart').text)) }),
  CH('chart-type', 'Change Chart Type', { title: 'Change Chart Type: columns, bars or a line, its data and settings kept', tab: 'chart-design', group: 'type', order: 10, kind: 'menu', icon: ICON.type, label: 'Change Chart Type',
    synonyms: ['Chart type', 'Column chart', 'Bar chart', 'Line chart'], menu: { chart: 40 }, run: (app, args) => (args && args.kind ? app.chartRetype(args.kind) : app.chartTypeMenu()) }),
  CH('chart-height', 'Chart Height', { title: 'Chart Height in cm: Enter sets it (height=…cm)', tab: 'chart-format', group: 'size', order: 10, kind: 'custom', role: 'spinbutton', el: 'rc-chart-height',
    synonyms: ['Height of chart'], render: (app) => app.objField('chart', 'height'), sync: (app) => app.objFieldSync('chart', 'height'), run: (app, args) => (args && args.cm ? app.chartSet('height', args.cm) : app.objFieldFocus('rc-chart-height')) }),
  CH('chart-width', 'Chart Width', { title: 'Chart Width as a share of the line (80%): Enter sets it (width=0.8\\linewidth)', tab: 'chart-format', group: 'size', order: 20, kind: 'custom', role: 'spinbutton', el: 'rc-chart-width',
    synonyms: ['Width of chart', 'Size of chart'], render: (app) => app.objField('chart', 'width'), sync: (app) => app.objFieldSync('chart', 'width'), run: (app, args) => (args && args.share ? app.chartSet('width', args.share) : app.objFieldFocus('rc-chart-width')) }),
  CH('chart-source', 'Show Chart Source', { title: 'The chart\'s pgfplots, to edit as LaTeX', menu: { chart: 90 }, synonyms: ['Edit pgfplots'], run: (app) => app.objSource() })
);

// ---- SmartArt Design and Format --------------------------------------------------------------------------
register(
  SM('smart-add', 'Add Shape', { title: 'Add Shape: one more item at the end of the diagram; Text Pane names it', tab: 'smart-design', group: 'create', order: 10, icon: ICON.addShape, label: 'Add Shape',
    synonyms: ['Add item', 'New step'], when: (app) => { const I = smartInfo(app); return !!I && I.items.length < D.smartMax(I.kind); }, whyNot: (app) => (sel(app, 'smart') ? 'smartdiagram holds no more items here: its colours stop there.' : WHY.smart),
    menu: { smart: 20 }, run: (app) => { const I = smartInfo(app); return app.smartItems([...I.items, 'Item ' + (I.items.length + 1)]); } }),
  SM('smart-text-pane', 'Text Pane', { title: 'Text Pane: the diagram\'s items, one per line, to change, add, remove or reorder', tab: 'smart-design', group: 'create', order: 20, icon: ICON.pane, label: 'Text Pane',
    synonyms: ['Edit items', 'Edit text', 'SmartArt items'], menu: { smart: 10 }, run: (app, args) => (args && args.items ? app.smartItems(args.items) : app.smartPane()) }),
  SM('smart-rtl', 'Right to Left', { title: 'Right to Left: a cycle that runs counterclockwise (circular diagram:counterclockwise)', tab: 'smart-design', group: 'create', order: 30, kind: 'toggle', icon: ICON.rtl, label: 'Right to Left',
    synonyms: ['Counterclockwise', 'Reverse direction'], when: (app) => { const I = smartInfo(app); return !!I && O.smartTurns(I.kind); }, whyNot: (app) => (sel(app, 'smart') ? 'Only a cycle runs one way round or the other.' : WHY.smart),
    on: (app) => { const I = smartInfo(app); return I && O.smartTurns(I.kind) ? /counterclockwise/.test(I.kind) : null; }, run: (app) => { const I = smartInfo(app); return app.smartLayout(O.smartFlip(I.kind)); } }),
  SM('smart-layout', 'Change Layout', { title: 'Change Layout: a process, a cycle, bubbles or a priority list from the same items', tab: 'smart-design', group: 'layouts', order: 10, kind: 'menu', icon: ICON.layout, label: 'Change Layout',
    synonyms: ['SmartArt layouts', 'Diagram kind'], menu: { smart: 30 }, run: (app, args) => (args && args.kind ? app.smartLayout(args.kind) : app.smartLayoutGallery()) }),
  SM('smart-colors', 'Change Colors', { title: 'Change Colors: the diagram\'s colours, colourful or shades of one (\\smartdiagramset{set color list={…}})', tab: 'smart-design', group: 'styles', order: 10, kind: 'menu', icon: ICON.colors, label: 'Change Colors',
    synonyms: ['SmartArt colours', 'SmartArt styles'], menu: { smart: 40 }, run: (app, args) => (args && args.palette ? app.smartColors(args.palette) : app.smartColorsGallery()) }),
  SM('smart-reset', 'Reset Graphic', { title: 'Reset Graphic: the diagram\'s own colours and border again (its \\smartdiagramset goes)', tab: 'smart-design', group: 'reset', order: 10, icon: ICON.reset, label: 'Reset Graphic',
    synonyms: ['Reset SmartArt', 'Discard formatting'], when: (app) => { const I = smartInfo(app); return !!I && !!(I.set || I.reset); }, whyNot: (app) => (sel(app, 'smart') ? 'The diagram has nothing of its own to reset.' : WHY.smart),
    run: (app) => app.objApply(O.smartResetEdits(sel(app, 'smart').text)) }),
  SM('smart-fill', 'Shape Fill', { title: 'Shape Fill: one colour for every item (uniform color list)', tab: 'smart-format', group: 'styles', order: 10, kind: 'menu', icon: ICON.fill, label: 'Shape Fill',
    synonyms: ['Fill color', 'Item colour'], run: (app, args) => (args && 'color' in args ? app.smartFill(args.color) : app.objColorMenu('smart-fill')) }),
  SM('smart-outline', 'Shape Outline', { title: 'Shape Outline: the colour of the items\' borders (border color=…)', tab: 'smart-format', group: 'styles', order: 20, kind: 'menu', icon: ICON.outline, label: 'Shape Outline',
    synonyms: ['Border color', 'Outline colour'], run: (app, args) => (args && 'color' in args ? app.objApply(O.smartBorder(sel(app, 'smart').text, args.color || null, app.objEol())) : app.objColorMenu('smart-outline')) }),
  SM('smart-source', 'Show SmartArt Source', { title: 'The diagram\'s smartdiagram, to edit as LaTeX', menu: { smart: 90 }, synonyms: ['Edit smartdiagram'], run: (app) => app.objSource() })
);
// the object goes (Delete or Backspace on it, or this): its center too where it held nothing else
register({ id: 'object-delete', name: 'Delete Object', title: 'Delete Object: the drawing, chart or SmartArt selected, and the center it stood in when nothing else is in it (Delete)', when: (app) => !!sel(app), whyNot: () => 'Select a drawing, chart or SmartArt first.',
  menu: { shape: 95, chart: 95, smart: 95 }, synonyms: ['Remove drawing', 'Remove chart', 'Remove SmartArt'], keysElsewhere: ['Delete'], run: (app) => app.objDelete() });

// Shape Styles: Word's theme styles, as an outline and a fill of one colour
export const STYLES = [['blue', 'Blue'], ['orange', 'Orange'], ['gray', 'Gray'], ['yellow', 'Gold'], ['teal', 'Teal'], ['green', 'Green'], ['red', 'Red'], ['violet', 'Violet']].flatMap(([c, n]) => [
  { id: c + '-subtle', name: 'Subtle Effect, ' + n, outline: c + '!60!black', fill: c + '!20' },
  { id: c + '-moderate', name: 'Moderate Effect, ' + n, outline: c + '!75!black', fill: c + '!50' },
  { id: c + '-intense', name: 'Intense Effect, ' + n, outline: c + '!50!black', fill: c + '!80!black' },
  { id: c + '-outline', name: 'Colored Outline, ' + n, outline: c + '!75!black', fill: 'white' }]);

onInstall((app) => {
  // the object's own right click menu, and a long press on a touch screen (a phone has no right click)
  let lp = null;
  const held = () => !!app.objHeld;
  const objAt = (t) => app.objElAt && app.objElAt(t);
  const endLong = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  document.addEventListener('contextmenu', (e) => {
    const d = objAt(e.target);
    if (held() && d) { e.preventDefault(); return; }
    if (!d || e.shiftKey) return;
    if (app.pop && app.pop.el.classList.contains('pop-ctx')) { app.closePop(true); return; }
    if (!app.objSelect(d)) return;
    e.preventDefault(); e.stopPropagation();
    app.objMenu(e.clientX, e.clientY);
  }, true);
  app.root.addEventListener('pointerdown', (e) => {
    endLong(); app.objHeld = false;
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const d = objAt(e.target);
    if (!d) return;
    const x = e.clientX, y = e.clientY;
    lp = { x, y, t: setTimeout(() => { lp = null; app.objHeld = true; if (app.pop) app.closePop(true); if (app.objSelect(d)) app.objMenu(x, y, true); }, 500) };
  }, true);
  app.root.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) endLong(); }, true);
  for (const k of ['pointerup', 'pointercancel']) app.root.addEventListener(k, endLong, true);
  // (the touch that ended in a long press is no tap: the menu stays, the system's does not come)
  for (const k of ['mousedown', 'mouseup', 'click']) document.addEventListener(k, (e) => { if (held() && objAt(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
});

const kindName = { shape: 'drawing', chart: 'chart', smart: 'SmartArt' };
export const methods = {
  // ---- the object selected on the page --------------------------------------------------------------
  // { kind: 'shape' | 'chart' | 'smart', f, s, e, text, el, k (a shape of a drawing, or null) }
  objHere() {
    const S = this.shapeSel;
    if (!S || !S.el || !S.el.isConnected || !S.info || this.stale) return null;
    if (!this.files.has(S.info.f)) return null;
    return { kind: S.kind, f: S.info.f, s: S.info.s, e: S.info.e, text: this.src(S.info.f).slice(S.info.s, S.info.e), el: S.el, k: S.k ?? null };
  },
  objEol() { const o = this.objHere(); return o && /\r\n/.test(this.src(o.f).slice(0, 4000)) ? '\r\n' : '\n'; },
  // edits on the object's text as one commit (one undo); the object stays selected where it is
  objApply(edits) {
    const o = this.objHere();
    if (!o || !edits || !edits.length) return false;
    this.closeGroup();
    this.commit(edits.map((x) => ({ f: o.f, s: o.s + x.s, e: o.s + x.e, t: x.t })), { f: o.f, p: o.s, bias: 1 }, 'objfmt');
    this.closeGroup();
    const d = edits.reduce((a, x) => a + x.t.length - (x.e - x.s), 0);
    this.shapeSel.info = { ...this.shapeSel.info, e: o.e + d };
    this.ribbonSync();
    return true;
  },
  objSource() { const o = this.objHere(); if (!o) return false; const info = atomOfEl(o.el); this.shapeSel.clear(); if (info) this.openAtom(o.el, info); return true; },
  // The object deleted; its center goes with it when nothing else is in it (Insert wrote both)
  objDelete() {
    const o = this.objHere();
    if (!o) return false;
    const src = this.src(o.f);
    let s = o.s, e = o.e;
    const before = /\\begin\{center\}[ \t]*\r?\n?[ \t]*$/.exec(src.slice(Math.max(0, s - 40), s)), after = /^[ \t]*\r?\n?[ \t]*\\end\{center\}[ \t]*(\r?\n)?/.exec(src.slice(e, e + 40));
    if (before && after) { s -= before[0].length; e += after[0].length; }
    this.shapeSel.clear();
    this.closeGroup();
    this.commit([{ f: o.f, s, e, t: '' }], { f: o.f, p: s, bias: 1 }, 'delete');
    this.closeGroup();
    this.toast('The ' + kindName[o.kind] + ' is deleted: Ctrl+Z gives it back.', 2400);
    return true;
  },
  objMenu(x, y, touch) {
    const o = this.objHere();
    if (!o) return false;
    const items = menuItems([o.kind]).map((c) => c && { name: c.name, title: c.title, disabled: !enabled(this, c, this.ribbonAt()), run: () => this.runCommand(c.id) });
    openMenu(this, new DOMRect(x, y, 0, 0), items, { label: 'Context menu', cls: 'pop-ctx' + (touch ? ' pop-touch' : '') });
    return true;
  },
  // a menu's place: its button on the ribbon, or the object
  objAnchor(id) { const b = document.getElementById('rc-' + id); const o = this.objHere(); return b && b.offsetParent ? b : o ? o.el : this.root; },
  // Word's colour grid: the theme's colours and their tints and shades, as xcolor names
  objColorMenu(what) {
    const o = this.objHere();
    if (!o) return false;
    const id = { fill: 'shape-fill', outline: 'shape-outline', 'smart-fill': 'smart-fill', 'smart-outline': 'smart-outline' }[what];
    const cur = what === 'fill' || what === 'outline' ? (O.shapeInfo(o.text) || { look: {} }).look[what] : what === 'smart-outline' ? (O.smartInfo(o.text) || {}).border : null;
    const pick = (c) => (what === 'fill' || what === 'outline' ? this.shapeSet(what, c || 'none') : what === 'smart-fill' ? this.smartFill(c) : this.objApply(O.smartBorder(o.text, c, this.objEol())));
    const items = [];
    if (what === 'fill') items.push({ name: 'No Fill', title: 'Nothing inside: the page shows through', checked: cur == null || cur === 'none', run: () => pick(null) });
    if (what === 'outline') items.push({ name: 'No Outline', title: 'No line round the shape (draw=none)', checked: cur === 'none', run: () => pick(null) });
    if (what === 'smart-fill' || what === 'smart-outline') items.push({ name: what === 'smart-fill' ? 'Colorful' : 'Automatic', title: 'smartdiagram\'s own', run: () => (what === 'smart-fill' ? this.smartColors('colorful') : pick(null)) });
    items.push(null);
    for (const row of O.COLOR_GRID) for (const c of row) items.push({ name: c, label: '', title: c, swatch: SWATCH(c), checked: cur === c, radio: true, cls: 'gal-tile sw', run: () => pick(c) });
    items.push(null);
    for (const c of ['white', 'black']) items.push({ name: c, label: '', title: c, swatch: SWATCH(c), checked: cur === c, radio: true, cls: 'gal-tile sw', run: () => pick(c) });
    if (what === 'outline') items.push(null, { name: 'Weight', title: 'How thick the line is', run: () => setTimeout(() => this.shapeLineMenu('weight'), 0) }, { name: 'Dashes', title: 'Solid, dashed, dotted', run: () => setTimeout(() => this.shapeLineMenu('dash'), 0) },
      ...(O.shapeInfo(o.text) || {}).lines ? [{ name: 'Arrows', title: 'Tips at the line\'s ends', run: () => setTimeout(() => this.shapeLineMenu('arrow'), 0) }] : []);
    const p = openMenu(this, this.objAnchor(id), items, { label: { fill: 'Shape Fill', outline: 'Shape Outline', 'smart-fill': 'Shape Fill', 'smart-outline': 'Shape Outline' }[what], cls: 'pop-colors' });
    p.style.setProperty('--cols', 10);
    return true;
  },

  // ---- drawings ------------------------------------------------------------------------------------------
  shapeSet(prop, value) {
    const o = this.objHere();
    if (!o || o.kind !== 'shape') return false;
    if ((prop === 'fill' || prop === 'outline') && value !== 'none' && !O.okColor(value)) return false;
    if (prop === 'style' && !(value && O.okColor(value.outline) && O.okColor(value.fill))) { const st = STYLES.find((x) => x.id === value); if (!st) return false; value = st; }
    return this.objApply(O.shapeSet(o.text, prop, value, o.k != null ? [o.k] : null));
  },
  shapeLineMenu(what) {
    const o = this.objHere(), I = o && O.shapeInfo(o.text);
    if (!I) return false;
    const L = o.k != null ? I.lookOf(o.k) : I.look;
    const opts = what === 'weight' ? [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((v) => ({ name: v + ' pt', checked: Math.abs((L.weight || 0) - v) < 1e-6, run: () => this.shapeSet('weight', v) }))
      : what === 'dash' ? [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['dash dot', 'Dash Dot'], ['densely dashed', 'Short Dash']].map(([v, n]) => ({ name: n, title: v, checked: L.dash === v, run: () => this.shapeSet('dash', v) }))
        : [['-', 'No Arrows'], ['->', 'Arrow at the End'], ['<-', 'Arrow at the Start'], ['<->', 'Arrows at Both Ends'], ['-stealth', 'Stealth Arrow']].map(([v, n]) => ({ name: n, title: v, checked: L.arrow === v, run: () => this.shapeSet('arrow', v) }));
    openMenu(this, this.objAnchor('shape-outline'), opts.map((x) => ({ ...x, radio: true })), { label: { weight: 'Weight', dash: 'Dashes', arrow: 'Arrows' }[what] });
    return true;
  },
  shapeStylesGallery() {
    const o = this.objHere(), I = o && O.shapeInfo(o.text);
    if (!I) return false;
    const L = o.k != null ? I.lookOf(o.k) : I.look;
    openGallery(this, this.objAnchor('shape-styles'), STYLES.map((s) => ({ name: s.name, title: 'draw=' + s.outline + ', fill=' + s.fill, checked: L.outline === s.outline && L.fill === s.fill,
      html: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5" style="fill:#' + SWATCH(s.fill) + ';stroke:#' + SWATCH(s.outline) + ';stroke-width:1.6"/></svg>', run: () => this.shapeSet('style', s) })), { label: 'Theme Styles', columns: 4 });
    return true;
  },
  shapeText(words) { const o = this.objHere(); return !!o && o.kind === 'shape' && this.objApply(O.shapeTextSet(o.text, words, this.objEol())); },
  shapeTextDialog() {
    const o = this.objHere(), I = o && O.shapeInfo(o.text);
    if (!I) return false;
    wordsDialog(this, { title: 'Edit Text', anchor: 'rc-shape-text', label: 'Words in the shape, a line each', value: I.text, note: 'Written as \\node[align=center] at (x,y) {…} at the middle of the drawing; empty takes the words off.', done: (t) => this.shapeText(t) });
    return true;
  },
  shapeResize(which, cm) {
    const o = this.objHere(), B = o && O.shapeBox(o.text);
    if (!B) return false;
    const v = parseFloat(String(cm).replace(',', '.'));
    if (!(v > 0 && v < 100)) { this.toast('A size in cm, above 0.'); return false; }
    // (one of them asked: the shape kept, the other scaled with it, as Word's locked aspect ratio)
    const k = which === 'width' ? (B.w > 1e-9 ? v / B.w : 1) : (B.h > 1e-9 ? v / B.h : 1);
    return this.objApply(O.shapeSize(o.text, which === 'width' ? v : B.w * k, which === 'height' ? v : B.h * k));
  },
  shapeAddGallery() {
    openGallery(this, this.objAnchor('shape-insert'), D.SHAPES.map(([id, name, , icon]) => ({ name, html: '<svg viewBox="0 0 20 20" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.4;stroke-linejoin:round">' + icon + '</svg>', run: () => this.shapeAdd(id) })), { label: 'Insert Shape', columns: 4 });
    return true;
  },
  // another shape in the drawing, its own \draw line at the right of what is there (half a cm off)
  shapeAdd(id) {
    const o = this.objHere(), B = o && O.shapeBox(o.text);
    const t = D.shapeTex(id);
    if (!B || !t) return false;
    const T = D.tikzCmds(o.text), R = D.readTikz(o.text);
    let x1 = -Infinity, y0 = Infinity;
    for (const c of R.cmds) for (const s of c.segs || []) {
      for (const p of [s.p, s.a, s.b].filter(Boolean)) { x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); }
      if (s.op === 'circle') { x1 = Math.max(x1, s.c[0] + s.r); y0 = Math.min(y0, s.c[1] - s.r); }
      if (s.op === 'ellipse') { x1 = Math.max(x1, s.c[0] + s.a); y0 = Math.min(y0, s.c[1] - s.b); }
    }
    const dx = x1 + 0.5, dy = Number.isFinite(y0) ? y0 : 0;
    // (the new shape's coordinates moved by dx, dy: its points as Insert writes them, shifted)
    const line = t.split('\n')[1].replace(/\(([-\d.]+),([-\d.]+)\)/g, (m, a, b) => '(' + r2(parseFloat(a) + dx) + ',' + r2(parseFloat(b) + dy) + ')');
    let p = T.end;
    while (p > 0 && (o.text[p - 1] === ' ' || o.text[p - 1] === '\t')) p--;
    const eol = this.objEol(), nl = o.text[p - 1] === '\n';
    const ok = this.objApply([{ s: p, e: p, t: (nl ? '' : eol) + line + eol }]);
    // (the new one selected: Fill and Outline then change it alone)
    if (ok) this.shapeSel.k = T.cmds.length;
    return ok;
  },
  shapeCanOrder(how) { const o = this.objHere(); return !!o && o.kind === 'shape' && o.k != null && !!O.shapeOrder(o.text, o.k, how); },
  shapeOrderWhy() { const o = this.objHere(); if (!o || o.kind !== 'shape') return WHY.shape; if (o.k == null) return 'Click one shape of the drawing (a second click once it is selected): the order is between the shapes of one drawing.'; return 'It is already there.'; },
  shapeOrder(how) {
    const o = this.objHere();
    if (!o || o.k == null) return false;
    const r = O.shapeOrder(o.text, o.k, how);
    if (!r) return false;
    const ok = this.objApply(r.edits);
    if (ok) this.shapeSel.k = r.k;
    return ok;
  },

  // ---- charts ----------------------------------------------------------------------------------------------
  chartSet(prop, value) { const o = this.objHere(); return !!o && o.kind === 'chart' && this.objApply(O.chartSet(o.text, prop, value)); },
  chartRetype(kind) { const o = this.objHere(), I = o && O.chartInfo(o.text); if (!I || !['column', 'bar', 'line'].includes(kind) || kind === I.kind) return false; return this.objApply(O.chartRewrite(o.text, kind, I.cats, I.series)); },
  chartElementMenu() {
    const I = chartInfo(this);
    if (!I) return false;
    openMenu(this, this.objAnchor('chart-element'), [
      { name: 'Chart Title', title: I.title ? 'Now: ' + I.title : 'None yet', run: () => this.chartTitleDialog() },
      { name: 'Axis Titles', title: 'Words under the horizontal axis and beside the vertical one', run: () => this.chartAxisDialog() },
      { name: 'Legend', title: I.series.length > 1 ? 'Where the names of the series stand' : 'A chart of one series has no legend', disabled: I.series.length < 2, run: () => setTimeout(() => this.chartLegendMenu(), 0) },
      { name: 'Gridlines', checked: I.grid, run: () => this.runCommand('chart-gridlines') },
      { name: 'Data Labels', checked: I.labels, run: () => this.runCommand('chart-data-labels') }
    ], { label: 'Add Chart Element' });
    return true;
  },
  chartLegendMenu() {
    const I = chartInfo(this);
    if (!I || I.series.length < 2) return false;
    openMenu(this, this.objAnchor('chart-element'), O.LEGEND_POS.map(([v, n]) => ({ name: n, title: 'legend pos=' + v, radio: true, checked: (I.legend || 'north west') === v, run: () => this.chartSet('legend', v) })), { label: 'Legend' });
    return true;
  },
  chartTitleDialog() {
    const I = chartInfo(this);
    if (!I) return false;
    wordsDialog(this, { title: 'Chart Title', anchor: 'rc-chart-element', label: 'Chart title', value: I.title || '', line: true, note: 'Written as title={…} on the axis; empty takes it off.', done: (t) => this.chartSet('title', t) });
    return true;
  },
  chartAxisDialog() {
    const I = chartInfo(this);
    if (!I) return false;
    axisTitlesDialog(this, { x: I.xlabel || '', y: I.ylabel || '', done: (x, y) => this.chartAxisTitles(x, y) });
    return true;
  },
  chartAxisTitles(x, y) {
    const o = this.objHere();
    if (!o || o.kind !== 'chart') return false;
    let t = o.text;
    if (x != null) t = O.applyEdits(t, O.chartSet(t, 'xlabel', x) || []);
    if (y != null) t = O.applyEdits(t, O.chartSet(t, 'ylabel', y) || []);
    return this.objApply(O.diff(o.text, t));
  },
  chartColorsGallery() {
    const I = chartInfo(this);
    if (!I) return false;
    const tile = (cols) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + cols.map((c, i) => '<rect x="' + (2 + i * 4) + '" y="' + (16 - (i + 2) * 3) + '" width="3.4" height="' + ((i + 2) * 3) + '" style="fill:#' + SWATCH(c[1] || c[0]) + ';stroke:#' + SWATCH(c[0]) + ';stroke-width:.5"/>').join('') + '</svg>';
    const def = [['blue', 'blue!30!white'], ['red', 'red!30!white'], ['brown', 'brown!30!white'], ['black', 'gray']];
    openGallery(this, this.objAnchor('chart-colors'), O.PALETTES.map(([id, name, cols]) => ({ name, checked: I.palette === id, html: tile(cols || def), run: () => this.chartSet('palette', id) })), { label: 'Change Colors', columns: 3 });
    return true;
  },
  chartTypeMenu() {
    const I = chartInfo(this);
    if (!I) return false;
    openMenu(this, this.objAnchor('chart-type'), [['column', 'Column'], ['bar', 'Bar'], ['line', 'Line']].map(([k, n]) => ({ name: n, radio: true, checked: I.kind === k, run: () => this.chartRetype(k) })), { label: 'Change Chart Type' });
    return true;
  },

  // ---- SmartArt ------------------------------------------------------------------------------------------------
  smartItems(items) {
    const o = this.objHere(), I = o && O.smartInfo(o.text);
    if (!I) return false;
    const list = (Array.isArray(items) ? items : String(items || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
    if (!list.length) { this.toast('SmartArt needs at least one item.'); return false; }
    if (list.length > D.smartMax(I.kind)) { this.toast('At most ' + D.smartMax(I.kind) + ' items: smartdiagram\'s colours stop there and TeX stops on more.', 6000); return false; }
    return this.objApply(O.smartItemsSet(o.text, list));
  },
  smartPane() {
    const o = this.objHere(), I = o && O.smartInfo(o.text);
    if (!I) return false;
    smartDialog(this, { kind: I.kind, items: I.items, done: (k, items) => { const ok = this.smartItems(items); if (k !== I.kind) this.smartLayout(k); return ok; } });
    return true;
  },
  smartLayout(kind) {
    const o = this.objHere(), I = o && O.smartInfo(o.text);
    if (!I || !O.SMART_LAYOUTS.some((x) => x[0] === kind)) return false;
    if (I.items.length > D.smartMax(kind)) { this.toast('That layout holds at most ' + D.smartMax(kind) + ' items.'); return false; }
    return this.objApply(O.smartLayout(o.text, kind));
  },
  smartLayoutGallery() {
    const I = smartInfo(this);
    if (!I) return false;
    openMenu(this, this.objAnchor('smart-layout'), O.SMART_LAYOUTS.map(([k, n, t]) => ({ name: n, title: t + ' (' + k + ')', radio: true, checked: I.kind === k, run: () => this.smartLayout(k) })), { label: 'Change Layout' });
    return true;
  },
  smartColors(id) { const o = this.objHere(); return !!o && o.kind === 'smart' && this.objApply(O.smartColors(o.text, id, this.objEol())); },
  smartFill(color) { const o = this.objHere(); if (!o || o.kind !== 'smart') return false; if (!color) return this.smartColors('colorful'); return this.objApply(O.smartFill(o.text, color, this.objEol())); },
  smartColorsGallery() {
    const I = smartInfo(this);
    if (!I) return false;
    const def = ['red!40', 'cyan!40', 'blue!40', 'green!40', 'orange!40'];
    const tile = (cols) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + cols.slice(0, 3).map((c, i) => '<rect x="' + (1.5 + i * 6) + '" y="7" width="5" height="6" rx="1" style="fill:#' + SWATCH(c) + ';stroke:#5a5a5a;stroke-width:.5"/>').join('') + '</svg>';
    openGallery(this, this.objAnchor('smart-colors'), O.SMART_PALETTES.map(([id, name, cols]) => ({ name, checked: I.palette === id, html: tile(cols || def), run: () => this.smartColors(id) })), { label: 'Change Colors', columns: 4 });
    return true;
  },

  // ---- the size fields of Shape Format and Format ---------------------------------------------------------------
  objField(kind, which) {
    const id = 'rc-' + kind + '-' + which;
    const box = document.createElement('label');
    box.className = 'pf-field';
    const lab = document.createElement('span');
    lab.className = 'pf-lab'; lab.textContent = which === 'width' ? 'Width' : 'Height';
    lab.setAttribute('aria-hidden', 'true');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = id; inp.className = 'pf-v'; inp.dataset.cmd = kind + '-' + which;
    inp.setAttribute('role', 'spinbutton'); inp.setAttribute('aria-label', command(kind + '-' + which).name);
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.inputMode = 'decimal';
    inp.title = command(kind + '-' + which).title;
    const pct = kind === 'chart' && which === 'width';
    const set = (v) => {
      const n = parseFloat(String(v).replace(',', '.'));
      if (!(n > 0)) { this.toast(pct ? 'A share of the line, 5% to 100%.' : 'A size in cm, above 0.'); this.objFieldSync(kind, which); return false; }
      if (kind === 'shape') return this.shapeResize(which, n);
      return this.chartSet(which, pct ? n / 100 : n);
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); set(inp.value); }
      else if (e.key === 'Escape') { e.preventDefault(); this.objFieldSync(kind, which, true); this.ribbonBack(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const d = e.key === 'ArrowUp' ? 1 : -1, n = parseFloat(inp.value) || 0;
        inp.value = pct ? String(Math.max(5, Math.min(100, Math.round(n / 5) * 5 + d * 5))) + '%' : String(Math.max(0.1, r2(n + d * 0.1))) + ' cm';
        set(inp.value);
        setTimeout(() => { const x = document.getElementById(id); if (x) x.focus(); }, 0);
      }
    });
    inp.addEventListener('focus', () => inp.select());
    box.append(lab, inp);
    return box;
  },
  objFieldSync(kind, which, force) {
    const inp = document.getElementById('rc-' + kind + '-' + which);
    if (!inp) return;
    const o = sel(this, kind);
    inp.disabled = !o;
    if (!o) { inp.value = ''; inp.removeAttribute('aria-valuetext'); return; }
    if (document.activeElement === inp && !force) return;
    let t = '';
    if (kind === 'shape') { const B = O.shapeBox(o.text); if (B) t = r2(which === 'width' ? B.w : B.h) + ' cm'; }
    else { const I = O.chartInfo(o.text); if (I) t = which === 'width' ? Math.round((I.width ?? 0.8) * 100) + '%' : r2(I.height ?? 6) + ' cm'; }
    inp.value = t;
    inp.setAttribute('aria-valuetext', t);
    inp.setAttribute('aria-valuenow', String(parseFloat(t) || 0));
  },
  objFieldFocus(id) { const x = document.getElementById(id); if (x && x.offsetParent) { x.focus(); return true; } return false; }
};
