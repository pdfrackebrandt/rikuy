// The ribbon's tabs and groups, in Word's order (GAP section 2). Every group is declared here,
// empty or not: a group shows once a command is registered in it (src/commands.js, field
// group), and a tab once one of its groups shows, so a batch fills a group without touching the
// layout. rank: which groups fold first into one button named after the group when the row is
// too short (the lowest first; the Styles gallery shrinks on its own before any group folds).
// spare: a group whose commands are on a tab of their own as well (Home's Insert, all of it on
// the Insert tab): it folds first, before any name or tile goes (src/ribbon/tabs.js ribbonFit).
// A contextual tab (ctx) shows while its object has the caret: at() says so from where the caret
// is (app.ribbonAt()) and from the app's state (an open equation, an armed picture).

export const TABS = [
  { id: 'file', name: 'File', groups: [['new', 'New'], ['open', 'Open'], ['info', 'Info'], ['save', 'Save a copy'], ['print', 'Print'], ['share', 'Share'], ['options', 'Options']] },
  { id: 'home', name: 'Home', groups: [['clipboard', 'Clipboard', 2], ['font', 'Font', 5], ['paragraph', 'Paragraph', 4], ['styles', 'Styles', 9], ['insert', 'Insert', 3, { spare: true }], ['editing', 'Editing', 1]] },
  { id: 'insert', name: 'Insert', groups: [['pages', 'Pages', 1], ['tables', 'Tables', 6], ['illustrations', 'Illustrations', 5], ['links', 'Links', 4], ['comments', 'Comments', 3], ['headfoot', 'Header & Footer', 2], ['text', 'Text', 2], ['symbols', 'Symbols', 7], ['latex', 'LaTeX', 8]] },
  { id: 'design', name: 'Design', groups: [['formatting', 'Document formatting', 2], ['background', 'Page background', 1]] },
  { id: 'layout', name: 'Layout', groups: [['setup', 'Page setup', 4], ['paragraph', 'Paragraph', 3], ['arrange', 'Arrange', 1], ['document', 'Document setup', 2]] },
  { id: 'references', name: 'References', groups: [['toc', 'Table of contents', 3], ['footnotes', 'Footnotes', 6], ['citations', 'Citations & bibliography', 5], ['captions', 'Captions', 4], ['index', 'Index', 2], ['authorities', 'Table of authorities', 1]] },
  { id: 'review', name: 'Review', groups: [['proofing', 'Proofing', 5], ['speech', 'Speech', 1], ['accessibility', 'Accessibility', 1], ['language', 'Language', 2], ['comments', 'Comments', 6], ['tracking', 'Tracking', 4], ['changes', 'Changes', 4], ['compare', 'Compare', 2], ['versions', 'Versions', 3]] },
  { id: 'view', name: 'View', groups: [['views', 'Views', 4], ['show', 'Show', 3], ['zoom', 'Zoom', 2], ['page', 'Page', 1]] },
  { id: 'help', name: 'Help', groups: [['help', 'Help and support']] },
  // contextual tabs, after Help, while their object has the caret
  { id: 'table-design', name: 'Table Design', ctx: 'table', groups: [['options', 'Table style options', 2], ['styles', 'Table styles', 3], ['borders', 'Borders', 1]] },
  { id: 'table-layout', name: 'Table Layout', ctx: 'table', groups: [['table', 'Table', 3], ['rows', 'Rows & columns', 6], ['merge', 'Merge', 5], ['size', 'Cell size', 4], ['alignment', 'Alignment', 2], ['data', 'Data', 1]] },
  // (Word's order: Adjust, Picture Styles, Accessibility, Arrange, Size. Size folds first: its two
  // fields are wide and its buttons few, so folding it last showed fewer controls in a wider window)
  { id: 'picture-format', name: 'Picture Format', ctx: 'picture', groups: [['adjust', 'Adjust', 2], ['styles', 'Picture Styles', 3], ['accessibility', 'Accessibility', 4], ['arrange', 'Arrange', 5], ['size', 'Size', 1]] },
  { id: 'equation', name: 'Equation', ctx: 'equation', groups: [['tools', 'Tools', 3], ['symbols', 'Symbols', 1], ['structures', 'Structures', 2]] },
  { id: 'headfoot', name: 'Header & Footer', ctx: 'headfoot', groups: [['headfoot', 'Header & Footer', 3], ['insert', 'Insert', 2], ['options', 'Options', 1], ['close', 'Close', 4]] }
].map((t) => ({ ...t, groups: t.groups.map(([id, name, rank = 1, more = {}]) => ({ id, name, rank, spare: !!more.spare })) }));

export const tabById = (id) => TABS.find((t) => t.id === id) || null;
export const groupOf = (tab, group) => { const t = tabById(tab); return t ? t.groups.find((g) => g.id === group) || null : null; };

// Which object has the caret, for the contextual tabs. Each batch that brings one makes its
// test finer (B7 tables, B8 pictures, B13 equations, B6 headers and footers).
export const CONTEXTS = {
  table: (app, at) => !!(at && at.cell),
  // a picture selected on the page: pressed (B8), or the one Backspace selected
  picture: (app) => !!(app.armed && app.armed.kind === 'img' && app.armed.el && app.armed.el.isConnected),
  // the equation field is open
  equation: (app) => !!(app.pop && app.pop.el && app.pop.el.classList.contains('pop-math')),
  // the header or the footer is open on the page (src/ui/headerfooter.js)
  headfoot: (app) => !!app.hf
};
