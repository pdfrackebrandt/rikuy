// Batch B11, inserting and the clipboard: the insert list (\ or Ctrl+K) and the environments,
// marks and breaks it offers; Cut and Copy for the right click menu. B11 adds Paste and its
// options, symbols, special characters, building blocks, the date, AutoCorrect (src/autocorrect.js,
// through onInsertText in src/commands.js) and the Insert tab's LaTeX group here.

import { register } from '../commands.js';

const piece = (open, close) => ({ open, close });
const env = (k, d, order) => ({ id: 'insert-' + k, name: d, synonyms: [k], run: (app) => app.insertFromPalette(k), palette: { k, d, order, t: piece('\n\n\\begin{' + k + '}\n', '\n\\end{' + k + '}\n\n'), block: true } });
const sel = (app, at) => !!at && !at.c.ghost && !at.c.collapsed;

register(
  { id: 'insert-list', name: 'Insert list', title: 'The list of things to insert: footnote, citation, section, environments and more (\\ or Ctrl+K)', synonyms: ['Insert a command', 'Command'], keys: ['Ctrl+K'], run: (app) => app.openPalette() },
  env('proposition', 'Proposition', 140), env('lemma', 'Lemma', 150), env('theorem', 'Theorem', 160), env('definition', 'Definition', 170), env('assumption', 'Assumption', 180), env('proof', 'Proof', 190),
  { id: 'insert-ldots', name: 'Ellipsis', synonyms: ['Dots', 'ldots'], run: (app) => app.insertFromPalette('ldots'), palette: { k: 'ldots', d: 'Ellipsis …', order: 220, t: piece('\\ldots{}', '') } },
  { id: 'insert-newline', name: 'Line break', synonyms: ['New line'], run: (app) => app.insertFromPalette('newline'), palette: { k: 'newline', d: 'Line break', order: 230, t: piece('\\\\\n', '') } },
  // (the page's own copy and cut handlers give the LaTeX: the focus goes back to the page first)
  { id: 'cut', name: 'Cut', title: 'Cut (Ctrl+X)', keysElsewhere: ['Ctrl+X'], menu: { selection: 10 }, when: sel, run: (app) => { app.ribbonBack(); document.execCommand('cut'); } },
  { id: 'copy', name: 'Copy', title: 'Copy, as LaTeX and as text (Ctrl+C)', keysElsewhere: ['Ctrl+C'], menu: { selection: 11 }, when: sel, run: (app) => { app.ribbonBack(); document.execCommand('copy'); } }
);

export const methods = {};
