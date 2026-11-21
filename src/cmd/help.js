// Batch B12, Help: Help in the bar, and the Help tab: how Rikuy works, Learn Rikuy (a document to
// try things in, src/tour.js), Interactive graphs (how a live figure is made and how it prints),
// the keyboard shortcuts (every key of the registry, as it is bound now), what's new, a problem
// reported, the guide for AI agents.

import { register, commands, command } from '../commands.js';
import { chordsOf, keyLabel, keysInText, macUA, KEPT } from '../keys.js';
import { dialog } from '../ui/kit.js';
import { mk } from '../ui/dom.js';
import { TABS } from '../ribbon/order.js';
import { tourTex, TOUR_STY, TOUR_WIDGET, tourPdf } from '../tour.js';

// Where a dialog opens: under its button when the button is in view, else at the top of the
// window, in the middle (from the search box, a key, a folded group)
export function where(el, w) {
  const b = document.getElementById(el);
  if (b && b.offsetParent && b.getBoundingClientRect().width) return { anchor: b };
  const x = Math.max(8, (window.innerWidth - w) / 2);
  // (below the ribbon, which the dialog's height leaves in view: .pop-guide's max-height)
  const rb = document.getElementById('ribbon'), top = Math.max(56, rb && rb.offsetParent ? rb.getBoundingClientRect().bottom : 56);
  return { rect: new DOMRect(x, top, 0, 0), top };
}
// a guide's dialog under its button or below the ribbon, never taller than the window leaves it
export function guide(app, title, el, w, cls) {
  // (below the ribbon, centred, never under its button: a tall dialog there was pushed up over the ribbon)
  const at = where(null, w), p = dialog(app, { title, rect: at.rect, cls });
  // (positionPop keeps a dialog inside the window; this keeps it below the ribbon too)
  p.style.setProperty('--guide-top', ((at.top || 56) + 8) + 'px');
  // (and above the status bar)
  const st = document.getElementById('status');
  p.style.setProperty('--guide-bottom', (st && st.offsetParent ? Math.max(0, window.innerHeight - st.getBoundingClientRect().top) : 0) + 'px');
  return p;
}

const always = () => true;
register(
  { id: 'help', name: 'Help', el: 'b-help', static: true, place: 'bar', only: 'wide', title: 'Read how Rikuy works, beside the page', when: always, run: (app) => app.openHelp() },
  { id: 'help-how', name: 'How it works', order: 10, title: 'What Rikuy is and how to work in it (F1)', synonyms: ['Help', 'Guide', 'Manual'], tab: 'help', group: 'help', el: 'rh-how', label: 'How it works', keys: ['F1'], keyScope: 'app',
    icon: '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14v.2"/>', when: always, run: (app) => app.openHelp() },
  { id: 'help-tour', name: 'Learn Rikuy', order: 20, title: 'A short document to try things in: typing on the page, Page, LaTeX and PDF, an equation, a live graph', synonyms: ['Tour', 'Tutorial', 'Getting started', 'Show me', 'Training'],
    tab: 'help', group: 'help', el: 'rh-tour', label: 'Learn Rikuy', icon: '<path d="M3 6.5 10 3l7 3.5-7 3.5z"/><path d="M6 8v4c2.5 2 5.5 2 8 0V8M17 6.5V11"/>', when: always, run: (app) => app.openTour() },
  { id: 'help-graphs', name: 'Interactive graphs', order: 30, title: 'Live figures: graphs with sliders on the page, the same graph in the PDF; Graph this, the templates, the web page', synonyms: ['Live figure', 'Widget', 'Interactive figure', 'Slider', 'rikuywidget', 'Chart'],
    tab: 'help', group: 'help', el: 'rh-graphs', label: 'Interactive graphs', icon: '<path d="M3 16.5h14M4 13c2-6 4-8 6-3s4 3 6-5"/><circle cx="10" cy="10" r="1.3"/>', when: always, run: (app) => app.openGraphsHelp() },
  { id: 'ask-grok', name: 'Ask Grok', order: 35, tab: 'help', group: 'help', el: 'rh-grok', label: 'Ask Grok',
    title: 'Open grok.com with the words you selected. Rikuy is not part of xAI.',
    synonyms: ['Grok', 'Grok Bot'],
    icon: '<path d="M10 2.2 11.3 7 16 8.2 11.3 9.5 10 14.2 8.7 9.5 4 8.2 8.7 7z"/>',
    when: always, run: (app) => app.askGrok() },
  { id: 'help-keys', name: 'Keyboard shortcuts', order: 40, title: 'Every key of Rikuy, by tab, as it works on this computer', synonyms: ['Shortcuts', 'Keys', 'Hotkeys', 'Key bindings'],
    tab: 'help', group: 'help', el: 'rh-keys', label: 'Keyboard shortcuts', icon: '<rect x="2.5" y="5.5" width="15" height="9" rx="1.5"/><path d="M5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M6.5 11.5h7"/>', when: always, run: (app) => app.openShortcuts() },
  { id: 'help-new', name: 'What\'s new', order: 50, title: 'What changed in Rikuy lately', synonyms: ['Release notes', 'Changes', 'New features', 'Changelog'],
    tab: 'help', group: 'help', el: 'rh-new', label: 'What\'s new', icon: '<path d="M10 2.5l2 4.6 5 .5-3.8 3.3 1.1 4.9L10 13.3l-4.3 2.5 1.1-4.9L3 7.6l5-.5z"/>', when: always, run: (app) => app.openWhatsNew() },
  { id: 'help-report', name: 'Report a problem', order: 60, title: 'Say what broke, on GitHub', synonyms: ['Feedback', 'Bug', 'Contact'], tab: 'help', group: 'help', el: 'rh-report', label: 'Report a problem',
    icon: '<path d="M10 3.5 17 16H3zM10 8.5v3.5M10 14v.2"/>', when: always, run: (app) => app.openLink('https://github.com/pdfrackebrandt/rikuy/issues/new/choose') },
  { id: 'help-agents', name: 'For AI agents', order: 70, title: 'What an AI agent reads about Rikuy: llms.txt', synonyms: ['llms.txt', 'Agents', 'API'], tab: 'help', group: 'help', el: 'rh-agents', label: 'For AI agents',
    icon: '<rect x="4" y="6" width="12" height="9" rx="2"/><path d="M10 3.5V6M7.5 10h.01M12.5 10h.01"/>', when: always, run: (app) => app.openLink('https://rikuy.rackebrandt.pe/llms.txt') }
);

// a paragraph of plain text with <code> for the words between backquotes (text only: no markup)
function para(text, tag = 'p') {
  const p = mk(tag);
  String(text).split('`').forEach((part, i) => p.append(i % 2 ? mk('code', null, part) : document.createTextNode(part)));
  return p;
}
const WHATS_NEW = [
  ['Page, LaTeX, PDF', 'At the bottom right: the typeset page, the source or TeX\'s PDF across the window, each at the place you were.'],
  ['Show LaTeX', 'Shift+F9, or the right click menu: a paragraph or an equation turns into its LaTeX where it stands, to edit; Esc shows it typeset. In the equation field Ctrl+Shift+= does it, as Word\'s Linear.'],
  ['Learn Rikuy and Interactive graphs', 'Help opens a document to try things in, with a live graph, and says how to make one.'],
  ['The View tab', 'Read Mode, Print Layout, LaTeX Mode, Draft, One page, Multiple pages, Side to Side, Dark page, Focus; a zoom slider in the status bar.'],
  ['The File tab', 'New from a template, Recent documents, Properties, Check accessibility, Export as HTML, Markdown, OpenDocument, RTF, EPUB or plain text, Set as default.'],
  ['Repeat and Undo\'s list', 'F4 (or Ctrl+Y with nothing to redo) does the last command again where the caret is; the arrow beside Undo undoes several steps at once.'],
  ['Word\'s ribbon', 'Home, Insert, Design, Layout, References, Review, View and Help, with Word\'s names, keys and right click menus, every button writing clean LaTeX.']
];

export const methods = {
  // the tour: a new document beside the others (the open one stays under Review, Versions)
  async openTour() {
    await this.snapshot('Before opening Learn Rikuy', { force: !this.lastSig });
    await this.stashBinary();
    const taken = new Set((await this.allSnaps()).map((v) => v.name));
    let name = 'Learn Rikuy';
    for (let k = 2; taken.has(name) || name === this.name; k++) name = 'Learn Rikuy ' + k;
    this.clearLink(name, 'main.tex');
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear(); this.extra.clear(); this.orig.clear();
    this.assetBlobs.set('figures/wave.pdf', new Blob([tourPdf()], { type: 'application/pdf' }));
    this.loadProject(new Map([['main.tex', tourTex(!!command('insert-interactive-graph'))], ['rikuy.sty', TOUR_STY], ['widgets/wave.html', TOUR_WIDGET]]), 'main.tex', name, 'Learn Rikuy', true);
    if (this.view && this.view !== 'page') this.setView('page');
    this.toast('Learn Rikuy: a document of your own to try things in. The one you had is under Review, Versions.', 6000);
    return true;
  },

  openGraphsHelp() {
    const p = guide(this, 'Interactive graphs', 'rh-graphs', 560, 'pop-help pop-guide');
    p.append(
      para('A live figure is a graph you can move on the typeset page: drag a slider and it redraws. In the PDF, and in any TeX anywhere (Overleaf, arXiv, a desktop TeX Live), it is the same graph at the sliders\' starting values, drawn as lines with its labels in the document\'s own fonts. So the paper prints as every journal wants, and your readers can play with it.'),
      mk('h3', null, 'Make one'),
      para('Right click any equation and choose Graph this: y = f(x), f(x) alone, x = g(t) with y = h(t), F(x, y) = c, or a pair of time derivatives becomes a live graph below it, every other letter a slider. Or Insert, Interactive graph: a function, data with a fit, a curve, an implicit curve (an indifference curve, an isoquant), a phase portrait (its field, its nullclines, a path from a point you drag), a distribution; or a template: supply and demand, IS–LM, Solow, Ramsey, a budget line and an indifference curve, densities, the central limit theorem. Where curves cross is marked; areas between them shade (a surplus, an integral); while a slider moves, the curve at its start stays faint.'),
      para('Everything works from the keyboard: Tab to a slider, then the arrows, Page Up and Down, Home and End; Tab to a phase portrait and the arrows move where its path starts. In the dialog, Ctrl+Z and Ctrl+Y undo and redo its own changes.'),
      mk('h3', null, 'On your website'),
      para('File, Export as, Web page with live graphs: one .html file that reads like the paper, its math set, its graphs live, with a link that opens the source in Rikuy. It runs no script from the document, only Rikuy\'s drawing of its graphs.'),
      mk('h3', null, 'How it is written'),
      para('One line where the figure goes, from the package `rikuy.sty` (keep it beside the main file; Learn Rikuy has a copy):'),
      Object.assign(mk('pre', 'code-ex'), { textContent: '\\usepackage{rikuy}\n...\n\\rikuywidget[width=\\textwidth]{widgets/my.html}{figures/my.png}' }),
      para('The first file is the live figure, the second the picture TeX prints. The options in brackets are those of `\\includegraphics`: TeX reads the line as `\\includegraphics[width=\\textwidth]{figures/my.png}`.'),
      mk('h3', null, 'The live figure'),
      para('A self contained HTML file: its script and style inline, its pictures and fonts as data. It runs in a sealed frame as wide as the text, with no network, no access to this page, your storage or the document. It tells the page how tall it is:'),
      Object.assign(mk('pre', 'code-ex'), { textContent: 'parent.postMessage({ rikuy: "height", px: 320 }, "*")' }),
      para(command('insert-interactive-graph') ? 'Insert, Interactive graph makes one from a template, its picture included. By hand: add the .html and the picture with Open (or drop them on the page). A figure in a document from someone else waits for your click before it runs.' : 'Add the .html and the picture with Open (or drop them on the page), then write the line above where the figure goes. A figure in a document from someone else waits for your click before it runs.'),
      mk('h3', null, 'The picture'),
      para('For a graph made by Rikuy, a .pgf file Rikuy draws again whenever the graph changes. For a figure of your own, any picture TeX takes: PNG, JPEG or PDF, made from the figure at the values it opens with, so the PDF shows what the page first shows. Press PDF in the status bar to see it.'),
      mk('h3', null, 'Downloads'),
      para('Download LaTeX keeps the figure live. A PDF or a Word file carries its picture.')
    );
    const row = mk('div', 'pop-row');
    const tour = mk('button', 'btn sm', 'Open Learn Rikuy');
    tour.type = 'button';
    tour.addEventListener('click', () => { this.closePop(true); this.runCommand('help-tour'); });
    row.append(tour);
    // (Insert > Interactive graph, B11's gallery and dialog, where this copy has it: the guide
    // never builds an insert of its own)
    const ins = command('insert-interactive-graph');
    if (ins) {
      const b = mk('button', 'btn ghost sm', 'Insert an interactive graph');
      b.type = 'button';
      b.addEventListener('click', () => { this.closePop(true); this.ribbonBack(); this.runCommand(ins.id); });
      row.append(b);
    }
    p.append(row);
    this.positionPop();
    tour.focus({ preventScroll: true });
    return true;
  },

  // Every key the registry binds, by the tab its command sits on, as this computer has them; then
  // Word's keys the browser keeps, with what to use instead
  openShortcuts() {
    const p = guide(this, 'Keyboard shortcuts', 'rh-keys', 560, 'pop-help pop-guide');
    const mac = macUA(), T = (t) => keysInText(t, mac);
    p.append(para(mac ? 'The keys as a Mac has them: \u2318 is Command, \u2325 Option, \u2303 Control, \u21e7 Shift. They act with the caret on the page unless said.' : 'The keys act with the caret on the page unless said.'));
    p.append(para((mac ? 'F10' : 'Alt alone, or F10,') + ' shows the letters on the tabs (H Home, N Insert, G Design, P Layout, S References, R Review, W View, F File, Y then 2 Help); a tab\'s letter shows its buttons\' letters (' + (mac ? 'F10' : 'Alt') + ', N, T is Table). Esc goes back a step.'));
    const byTab = new Map();
    for (const c of commands()) {
      const keys = chordsOf(c, mac);
      if (!keys.length || c.searchable === false) continue;
      const t = c.tab && TABS.find((x) => x.id === c.tab);
      const tab = t ? t.name : 'More keys';
      if (!byTab.has(tab)) byTab.set(tab, []);
      byTab.get(tab).push({ name: c.name, keys: keys.map((k) => keyLabel(k, mac)).join(', ') });
    }
    const order = [...TABS.map((t) => t.name), 'More keys'];
    for (const tab of order) {
      const list = byTab.get(tab);
      if (!list) continue;
      p.append(mk('h3', null, tab));
      const dl = mk('dl', 'keys');
      for (const x of list) dl.append(mk('dt', null, x.keys), mk('dd', null, x.name));
      p.append(dl);
    }
    p.append(mk('h3', null, 'Word\'s keys the browser keeps'));
    p.append(para('A browser keeps a few of Word\'s keys for itself, and a few mean something else here. What to press instead:'));
    const dl = mk('dl', 'keys kept');
    for (const k of KEPT) if (!k.only || k.only === (mac ? 'mac' : 'win')) dl.append(mk('dt', null, keyLabel(k.keys, mac)), mk('dd', null, k.word + ': ' + T(k.here)));
    p.append(dl);
    this.positionPop();
    return true;
  },

  // The selected words, if any, go in the address of grok.com. Nothing is sent until this is pressed,
  // and only those words (not the document). The title says Rikuy is not part of xAI.
  askGrok() {
    const s = getSelection();
    let t = '';
    if (s && s.rangeCount && this.root && this.root.contains(s.anchorNode)) t = String(s).replace(/\s+/g, ' ').trim().slice(0, 500);
    this.openLink(t ? 'https://grok.com/?q=' + encodeURIComponent(t) : 'https://grok.com/');
    return true;
  },

  openWhatsNew() {
    const p = guide(this, 'What\'s new', 'rh-new', 560, 'pop-help pop-guide');
    const dl = mk('dl', 'news');
    for (const [h, t] of WHATS_NEW) dl.append(mk('dt', null, h), mk('dd', null, t));
    p.append(dl);
    const row = mk('div', 'pop-row');
    const b = mk('button', 'btn sm', 'Open Learn Rikuy');
    b.type = 'button';
    b.addEventListener('click', () => { this.closePop(true); this.runCommand('help-tour'); });
    row.append(b);
    p.append(row);
    this.positionPop();
    return true;
  }
};
