// Batch B0, the frame's own commands: Undo and Redo in the bar, the search box (Alt+Q), the
// ribbon folded away and back (Ctrl+F1), the right click menu (Shift+F10, the menu key), Show in
// source and Ask Claude.

import { register } from '../commands.js';
import { $ } from '../ui/dom.js';

const always = () => true;
register(
  { id: 'undo', name: 'Undo', el: 'b-undo', static: true, place: 'bar', title: 'Undo (Ctrl+Z)', keysElsewhere: ['Ctrl+Z'], when: () => !$('#b-undo').disabled, run: (app) => app.undo() },
  { id: 'redo', name: 'Redo', el: 'b-redo', static: true, place: 'bar', title: 'Redo (Ctrl+Shift+Z)', keysElsewhere: ['Ctrl+Shift+Z', 'Ctrl+Y'], when: () => !$('#b-redo').disabled, run: (app) => app.redo() },
  { id: 'search', name: 'Search', el: 'rk-search', role: 'combobox', static: true, place: 'bar', title: 'Search for a command by its name (Alt+Q)', keys: ['Alt+Q'], keyScope: 'app', mac: { 'Alt+Q': 'Control+Alt+Q' },
    searchable: false, when: always, run: (app) => app.openSearch() },
  { id: 'ribbon-collapse', name: 'Collapse the ribbon', el: 'rb-collapse', role: 'button', static: true, place: 'tabs', only: 'wide', title: 'Collapse the ribbon to its tabs, or show it again (Ctrl+F1)', keys: ['Ctrl+F1'], keyScope: 'app',
    synonyms: ['Ribbon', 'Hide the ribbon', 'Show the ribbon'], when: always, run: (app) => app.toggleRibbon() },
  { id: 'ribbon-tab', name: 'Ribbon tab', el: 'rb-tabsel', role: 'combobox', static: true, place: 'tabs', only: 'narrow', title: 'Which of the ribbon\'s tabs shows', searchable: false, when: always, run: () => $('#rb-tabsel').focus() },
  { id: 'context-menu', name: 'Context menu', title: 'The menu of what applies here (Shift+F10)', keys: ['Shift+F10', 'ContextMenu'], searchable: false, run: (app) => app.openContextMenu() },
  { id: 'show-in-source', name: 'Show in source', title: 'The LaTeX of this place, in the source pane', synonyms: ['Reveal in source', 'Source of this'], menu: { text: 90, selection: 90 },
    when: (app, at) => !!at && !at.c.ghost, run: (app) => app.revealCaret(true) },
  { id: 'ask-claude', name: 'Ask Claude', el: 'b-ai', static: true, place: 'bar', only: 'claude', title: 'Ask Claude to rewrite the selection', menu: { selection: 95 },
    when: () => document.body.classList.contains('has-ai'), run: (app) => app.openAsk() }
);

export const methods = {};
