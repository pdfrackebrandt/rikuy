// Batch B0, the frame's own commands: Undo and Redo in the bar, the search box (Alt+Q), the
// ribbon folded away and back (Ctrl+F1), the right click menu (Shift+F10, the menu key), Show in
// source and Ask Claude.

import { register } from '../commands.js';
import { $ } from '../ui/dom.js';

const always = () => true;
register(
  { id: 'undo', name: 'Undo', el: 'b-undo', static: true, place: 'bar', title: 'Undo (Ctrl+Z): take back the last edit', keysElsewhere: ['Ctrl+Z'], when: () => !$('#b-undo').disabled, run: (app) => app.undo() },
  { id: 'redo', name: 'Redo', el: 'b-redo', static: true, place: 'bar', title: 'Redo (Ctrl+Shift+Z): make again the edit just undone', keysElsewhere: ['Ctrl+Shift+Z', 'Ctrl+Y'], when: () => !$('#b-redo').disabled, run: (app) => app.redo() },
  { id: 'search', name: 'Search', el: 'rk-search', role: 'combobox', static: true, place: 'bar', title: 'Search for a command by its name (Alt+Q)', keys: ['Alt+Q'], keyScope: 'app', mac: { 'Alt+Q': 'Control+Alt+Q' },
    searchable: false, when: always, run: (app) => app.openSearch() },
  { id: 'ribbon-collapse', name: 'Collapse the ribbon', el: 'rb-collapse', role: 'button', static: true, place: 'tabs', only: 'wide', title: 'Collapse the ribbon to its tabs, or show it again (Ctrl+F1)', keys: ['Ctrl+F1'], keyScope: 'app',
    // (Word for Mac's Cmd+Option+R; Cmd+F1 is the Mac's own, for its displays)
    mac: { 'Ctrl+F1': 'Ctrl+Alt+R' },
    synonyms: ['Ribbon', 'Hide the ribbon', 'Show the ribbon'], when: always, run: (app) => app.toggleRibbon() },
  { id: 'ribbon-tab', name: 'Ribbon tab', el: 'rb-tabsel', role: 'combobox', static: true, place: 'tabs', only: 'narrow', title: 'Which of the ribbon\'s tabs shows', searchable: false, when: always, run: () => $('#rb-tabsel').focus() },
  { id: 'context-menu', name: 'Context menu', title: 'The menu of what applies here (Shift+F10)', keys: ['Shift+F10', 'ContextMenu'], searchable: false, run: (app) => app.openContextMenu() },
  // (Word's Shift+F1 reveals the formatting where the caret is: here its LaTeX)
  { id: 'show-in-source', name: 'Show in source', title: 'The LaTeX of this place, in the source pane (Shift+F1)', synonyms: ['Reveal in source', 'Source of this', 'Reveal Formatting'], menu: { text: 90, selection: 90 }, keys: ['Shift+F1'],
    when: (app, at) => !!at && !at.c.ghost, run: (app) => app.revealCaret(true) },
  // Word's F6 goes round the window's parts: here Ctrl+F6, as in Word for the web, since F6 is the
  // browser's way to its address bar
  { id: 'next-pane', name: 'Next pane', title: 'The keyboard to the next part of the window: the page, the side panel, the source, the PDF, the status bar, the ribbon, the bar (Ctrl+F6)', synonyms: ['Next region', 'Next landmark', 'Switch pane', 'F6'],
    keys: ['Ctrl+F6'], keyScope: 'app', when: always, run: (app) => app.paneStep(1) },
  { id: 'previous-pane', name: 'Previous pane', title: 'The keyboard to the part of the window before (Ctrl+Shift+F6)', synonyms: ['Previous region', 'Previous landmark'],
    keys: ['Ctrl+Shift+F6'], keyScope: 'app', when: always, run: (app) => app.paneStep(-1) },
  { id: 'ask-claude', name: 'Ask Claude', el: 'b-ai', static: true, place: 'bar', only: 'claude', title: 'Ask Claude to rewrite the selection', menu: { selection: 95 },
    when: () => document.body.classList.contains('has-ai'), run: (app) => app.openAsk() }
);

// The window's parts in the order Ctrl+F6 visits them, each with where the keyboard goes in it;
// a part not shown is passed over
const visible = (el) => !!el && !!(el.offsetParent || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
const firstIn = (sel) => { const box = $(sel); if (!visible(box)) return null; return [...box.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"]), a[href]')].find((x) => visible(x) && !x.disabled) || null; };
const PANES = [
  ['pages', () => ($('#pages') && visible($('#pages')) ? $('#pages') : null)],
  ['nav', () => firstIn('#nav')],
  ['srcpane', () => firstIn('#srcpane')],
  ['pdfpane', () => firstIn('#pdfpane')],
  ['status', () => firstIn('#status')],
  ['ribbon', () => { const t = $('#rb-tabs [role="tab"][aria-selected="true"]'); return visible(t) ? t : visible($('#rb-tabsel')) ? $('#rb-tabsel') : firstIn('#ribbon'); }],
  ['bar', () => firstIn('#bar')]
];
const BOX = { pages: '#desk', nav: '#nav', srcpane: '#srcpane', pdfpane: '#pdfpane', status: '#status', ribbon: '#rb-top, #ribbon', bar: '#bar' };

export const methods = {
  paneStep(dir) {
    const a = document.activeElement;
    const here = PANES.findIndex(([k]) => !!a && a !== document.body && [...document.querySelectorAll(BOX[k])].some((b) => b.contains(a)));
    for (let i = 1; i <= PANES.length; i++) {
      // (from nowhere in particular, the page is the first part)
      const base = here >= 0 ? here : dir > 0 ? -1 : 0;
      const [k, find] = PANES[(base + dir * i + PANES.length * 2) % PANES.length];
      const el = find();
      if (!el) continue;
      if (k === 'pages') this.ribbonBack();
      else if (k === 'srcpane' && this.cm) this.cm.focus();
      else el.focus();
      return true;
    }
    return false;
  }
};
