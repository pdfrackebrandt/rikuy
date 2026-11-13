// Batch B13, equations: Formula (math in the line) and Equation (numbered, on a line of its own),
// on Home and Insert, with their keys and their items of the insert list. The equation field is
// src/app.js's (openMath, attachField). B13 adds the Equation tab (structures, symbols, numbered
// and inline or display), the gallery and Alt+= here.

import { register } from '../commands.js';

// where a display cannot go: a heading, the title, a cell, a caption, a footnote, styled words, a LaTeX paragraph
const tight = (at) => /^(h|ttl|cell|cap|fn)$/.test(at.ctx) || at.cell;
register(
  { id: 'formula', name: 'Formula', order: 10, title: 'Formula in the line ($ or Ctrl+M)', synonyms: ['Inline math', 'Math'], tab: 'home', group: 'insert', el: 'rb-math', label: 'Formula',
    icon: '<path d="M14.5 6V4.5h-9l5 5.5-5 5.5h9V14"/>', keys: ['Ctrl+M'], run: (app) => app.newMath(), palette: { k: 'math', d: 'Inline math', order: 90, act: 'math' } },
  { id: 'equation', name: 'Equation', order: 20, title: 'Numbered equation on a line of its own (Ctrl+Shift+E)', synonyms: ['Display math', 'Numbered equation'], tab: 'home', group: 'insert', el: 'rb-eq', label: 'Equation',
    icon: '<path d="M3 7.5h8.5M3 12.5h8.5M14.5 5.5q-1.8 4.5 0 9M17 5.5q1.8 4.5 0 9"/>', keys: ['Ctrl+Shift+E'], also: [{ tab: 'insert', group: 'symbols', el: 'ri-eq' }],
    when: (app, at) => !!at && !tight(at) && !at.sty && at.ctx !== 'tex' && !(at.c.ghost && app.ghost.tex), run: (app) => app.newDisplayMath(),
    palette: { k: 'equation', d: 'Numbered equation', order: 80, act: 'equation' } }
);

export const methods = {};
