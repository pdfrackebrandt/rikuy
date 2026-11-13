// Batch B1, character formatting: Bold, Italic and Underline (on Home, Ctrl+B, I and U, the right
// click menu), and their items of the insert list. Every form a person writes by hand counts
// (\textbf, {\bfseries ...}, \bf: src/wrap.js's GROUPS). B1 adds the font and size boxes, colours,
// highlight, strikethrough, scripts, case, Clear Formatting and the Font dialog here.

import { register } from '../commands.js';
import { groupNames } from '../wrap.js';

// on with the caret in words that have a wrapper of the group (as the page drew them)
const inside = (app, at, names) => !!at && app.insideStyle(at, names);
const can = (app, at) => !!at && !at.c.ghost && at.ctx !== 'tex';
// (the forms of each kind are src/wrap.js's GROUPS: the B button and its pressed state agree)
const STYLES = { textbf: groupNames('bold'), emph: groupNames('italic'), underline: groupNames('underline') };

register(
  { id: 'bold', name: 'Bold', order: 10, title: 'Bold (Ctrl+B)', tab: 'home', group: 'font', el: 'rb-b', kind: 'toggle', glyph: '<b aria-hidden="true">B</b>', keys: ['Ctrl+B'], menu: { selection: 20 },
    synonyms: ['Strong', 'textbf'], when: can, on: (app, at) => can(app, at) && inside(app, at, STYLES.textbf), run: (app) => app.toggleStyle('textbf'),
    palette: { k: 'textbf', d: 'Bold', order: 60, t: { open: '\\textbf{', close: '}' } } },
  { id: 'italic', name: 'Italic', order: 20, title: 'Italic (Ctrl+I)', tab: 'home', group: 'font', el: 'rb-i', kind: 'toggle', glyph: '<i aria-hidden="true">I</i>', keys: ['Ctrl+I'], menu: { selection: 30 },
    synonyms: ['Emphasis', 'emph', 'textit'], when: can, on: (app, at) => can(app, at) && inside(app, at, STYLES.emph), run: (app) => app.toggleStyle('emph'),
    palette: { k: 'emph', d: 'Emphasis', order: 50, t: { open: '\\emph{', close: '}' } } },
  { id: 'underline', name: 'Underline', order: 30, title: 'Underline (Ctrl+U)', tab: 'home', group: 'font', el: 'rb-u', kind: 'toggle', glyph: '<u aria-hidden="true">U</u>', keys: ['Ctrl+U'],
    synonyms: ['underline'], when: can, on: (app, at) => can(app, at) && inside(app, at, STYLES.underline), run: (app) => app.toggleStyle('underline') },
  { id: 'typewriter', name: 'Typewriter', title: 'Typewriter text: \\texttt', synonyms: ['Monospace', 'Code', 'texttt'], when: can, run: (app) => app.toggleStyle('texttt'),
    palette: { k: 'texttt', d: 'Typewriter', order: 70, t: { open: '\\texttt{', close: '}' } } }
);

export const methods = {};
