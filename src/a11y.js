// What the typeset page says to a screen reader and to an AI agent that reads the page by its
// accessibility tree (Claude in Chrome and its like) rather than by its DOM: every formula a math
// element named by its LaTeX ("Equation (1): V(k) = ..."), a heading named with its number ("2 The
// round trip", where the number and the words were glued: "2The round trip"), a float a figure
// named by its caption, a citation a link that says it is one and its keys, a cross reference a
// link that says its label, a footnote mark a link named "Footnote 1", a live graph a figure named
// by its title, formulas and sliders, the bibliography a heading. The
// renderer (src/render.js) calls these as it draws; nothing here runs on its own.
// test/agent.py (structure) reads the page this way and finds each.

import { readGraph } from './graph.js';

// a model's inline runs as plain text (formulas as $LaTeX$)
export function plainOf(inl, max = 2000) {
  let out = '';
  const walk = (xs) => {
    for (const x of xs || []) {
      if (out.length > max) return;
      if (!x || typeof x !== 'object') continue;
      if (x.k === 'math') out += '$' + String(x.tex || '').trim() + '$';
      else if (typeof x.t === 'string') out += x.t;
      else if (typeof x.text === 'string') out += x.text;
      else if (Array.isArray(x.inl)) walk(x.inl);
      else if (Array.isArray(x.body)) walk(x.body);
    }
  };
  walk(inl);
  return out.replace(/​/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// a formula's LaTeX as a name: its \label and \tag taken out, its white space one space
export function mathText(tex) {
  return String(tex || '').replace(/\\label\s*\{[^{}]*\}/g, '').replace(/\\(?:tag|notag|nonumber)\*?\s*(?:\{[^{}]*\})?/g, '').replace(/\s+/g, ' ').trim();
}
const numbers = (tags) => (tags && tags.length ? (tags.length === 1 ? 'Equation (' + tags[0] + ')' : 'Equations ' + tags.slice(0, -1).map((t) => '(' + t + ')').join(', ') + ' and (' + tags[tags.length - 1] + ')') : '');

// a display formula's block
export function displayMath(el, it) {
  el.setAttribute('role', 'math');
  const n = numbers(it.tags);
  el.setAttribute('aria-label', (n ? n + ': ' : '') + mathText(it.tex).slice(0, 4000));
}

// an object in a line of text, as the renderer draws it (src/render.js atomEl)
export function atom(s, x, files) {
  switch (x.k) {
    case 'math':
      s.setAttribute('role', 'math');
      s.setAttribute('aria-label', mathText(x.tex).slice(0, 2000));
      break;
    // (links, as hyperref makes them in the PDF: DPUB-ARIA's doc-biblioref and doc-noteref say
    // more, but the tools agents read the page with did not know them and showed bare text)
    case 'cite':
      s.setAttribute('role', 'link');
      s.setAttribute('aria-roledescription', 'citation');
      s.setAttribute('aria-description', (x.missing ? 'not in the bibliography: ' : 'cites ') + (x.keys || []).join(', '));
      break;
    case 'ref':
      s.setAttribute('role', 'link');
      s.setAttribute('aria-roledescription', 'cross reference');
      s.setAttribute('aria-description', (x.missing ? 'to a label not defined: ' : 'to ') + (x.key || ''));
      break;
    case 'fn': case 'en':
      s.setAttribute('role', 'link');
      s.setAttribute('aria-roledescription', x.k === 'en' ? 'endnote' : 'footnote');
      s.setAttribute('aria-label', (x.k === 'en' ? 'Endnote ' : 'Footnote ') + (x.num || ''));
      break;
    case 'logo':
      // (its letters are boxes of their own, which a reader read as "LAT E X")
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', String(x.text || '').replace(/^\\/, '') || 'logo');
      break;
    case 'widget': {
      const g = x.wfile && files ? readGraph(files.get(x.wfile)) : null;
      s.setAttribute('role', 'figure');
      s.setAttribute('aria-label', g ? graphName(g) : 'Live figure ' + (x.file || ''));
      break;
    }
    default: break;
  }
}

// an interactive graph said in words: its title, kind, formulas and sliders
export function graphName(g) {
  const what = g.kind === 'function' ? 'y = ' + (g.f || []).join('; y = ')
    : g.kind === 'curve' ? (g.curve.mode === 'polar' ? 'r(θ) = ' + g.curve.r : 'x(t) = ' + g.curve.x + ', y(t) = ' + g.curve.y)
      : g.kind === 'data' ? (g.data.points.length + ' points with a ' + g.data.fit + ' fit')
        : g.dist.family + ' distribution' + (g.dist.mode === 'mean' ? ', the mean of n draws' : '');
  const sl = (g.sliders || []).map((q) => q.name + ' from ' + q.min + ' to ' + q.max + ', now ' + q.value).join('; ');
  return ('Interactive graph' + (g.title ? ': ' + g.title : '') + '. ' + what + (sl ? '. Sliders: ' + sl : '')).slice(0, 1000);
}

// a heading with its number apart from its words
export function heading(el, it) {
  if (!it.num && !it.chapLabel) return;
  const words = plainOf(it.inl, 500);
  el.setAttribute('aria-label', ((it.chapLabel ? it.chapLabel + ' ' : '') + it.num + ' ' + words).trim());
}

// a float: a figure named by its caption (the caption's own words, "Table 1: Shortcuts")
export function float(el, it) {
  if (it.kind === 'inline') return;
  el.setAttribute('role', 'figure');
  const cap = el.querySelector(':scope > .cap');
  const name = cap ? cap.textContent.replace(/\s+/g, ' ').trim() : (it.kind === 'table' ? 'Table' : 'Figure') + (it.num ? ' ' + it.num : '');
  el.setAttribute('aria-label', name.slice(0, 1000));
}

// the title block's authors and date: paragraphs of their own
export function titleParts(el) {
  for (const x of el.querySelectorAll(':scope > .ttl-a, :scope > .ttl-d, :scope > .ttl-s')) x.setAttribute('role', 'paragraph');
}

// a heading drawn by the renderer itself (References, the index, endnotes)
export function sectionHead(el) {
  el.setAttribute('role', 'heading');
  el.setAttribute('aria-level', '2');
}
