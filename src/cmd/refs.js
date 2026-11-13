// Batch B9, references: Footnote and Citation (on Home and References), Link (Home and Insert),
// Cross-reference (Insert and References), and the references, labels and addresses of the insert
// list. B9 adds the table of contents, endnotes, sources, citation styles, the bibliography,
// captions, indexes and the link dialog here.

import { register } from '../commands.js';

// where a footnote cannot go: inside a heading, the title, a cell, a caption or another footnote
const tight = (at) => /^(h|ttl|cell|cap|fn)$/.test(at.ctx) || at.cell;
const piece = (open, close) => ({ open, close });

register(
  { id: 'footnote', name: 'Footnote', order: 50, title: 'Footnote (Ctrl+Alt+F)', synonyms: ['Insert footnote', 'Note'], tab: 'home', group: 'insert', el: 'rb-fn', label: 'Footnote',
    icon: '<path d="M4 8l6 7.5M10 8l-6 7.5M14 5.2l1.6-1v5.6"/>', also: [{ tab: 'references', group: 'footnotes', el: 'rr-fn' }], keys: ['Ctrl+Alt+F'],
    when: (app, at) => !!at && !tight(at), run: (app) => app.insertEmpty('\\footnote{', '}'),
    palette: { k: 'footnote', d: 'Footnote', order: 10, t: piece('\\footnote{', '}') } },
  { id: 'citation', name: 'Citation', order: 60, title: 'Citation of a work in the bibliography', synonyms: ['Insert citation', 'Cite', 'Reference a source'], tab: 'home', group: 'insert', el: 'rb-cite', label: 'Citation',
    icon: '<path d="M7 4.5H5v11h2M13 4.5h2v11h-2M9.4 8.2l1.2-.8v5.4"/>', also: [{ tab: 'references', group: 'citations', el: 'rr-cite' }], run: (app) => app.insertCite(),
    palette: { k: 'cite', d: 'Citation', order: 20, act: 'cite' } },
  { id: 'link', name: 'Link', order: 70, title: 'Link: a web address written out', synonyms: ['Hyperlink', 'URL', 'Web address'], tab: 'home', group: 'insert', el: 'rb-link', label: 'Link',
    icon: '<path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.2-2.2a3 3 0 0 0-4.2-4.2l-.9.9M11.4 8.6a3 3 0 0 0-4.2 0L5 10.8A3 3 0 0 0 9.2 15l.9-.9"/>', also: [{ tab: 'insert', group: 'links', el: 'ri-link' }],
    run: (app) => app.insertEmpty('\\url{', '}'), palette: { k: 'url', d: 'URL', order: 210, t: piece('\\url{', '}') } },
  { id: 'cross-reference', name: 'Cross-reference', order: 80, title: 'A reference to a section, figure, table or equation by its label', synonyms: ['Reference', 'Cross reference', 'ref', 'cref'],
    tab: 'insert', group: 'links', el: 'ri-xref', label: 'Cross-reference', icon: '<path d="M6 4.5h8v11l-4-3-4 3zM8.5 8h3"/>', also: [{ tab: 'references', group: 'captions', el: 'rr-xref' }],
    run: (app) => app.insertFromPalette('ref'), palette: { k: 'ref', d: 'Cross reference', order: 30, act: 'ref' } },
  { id: 'equation-reference', name: 'Equation reference', synonyms: ['eqref'], run: (app) => app.insertFromPalette('eqref'), palette: { k: 'eqref', d: 'Equation reference', order: 40, act: 'eqref' } },
  { id: 'label', name: 'Label', title: 'A label to refer to', synonyms: ['Bookmark'], run: (app) => app.insertFromPalette('label'), palette: { k: 'label', d: 'Label', order: 200, t: piece('\\label{', '}') } }
);

export const methods = {};
