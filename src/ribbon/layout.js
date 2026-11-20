// How each tab's groups lay out their controls, as Word's ribbon does on a wide window (900 px and
// wider; narrower, every group is one row of buttons, as before). One line per command, in the
// order Word shows them:
//
//   'id size keytip shown name'
//
// size: L large, the icon over its name (one or two lines, a menu's arrow after it); S small, the
// icon and its name, three to a column; I the icon alone, three to a column; T a gallery's tile.
// keytip: the letters that run it once its tab's KeyTip was pressed (Alt, then the tab's letter,
// then these), '-' for none. The shown name, where given, is the name Word shows when it is shorter
// than the control's own (Word's "Delete" for Delete Comment); the accessible name stays the
// command's (agents find controls by it). '|' starts a new column. A command not listed (a batch's
// new one) comes after the listed ones, small. Home has its own rules in src/app.css; its KeyTips
// are TIPS.home below.
//
// When the window is too narrow for the names, every name goes at once (ribbonFit's step rb-fold):
// a large button becomes a small icon, so the group packs three to a column.

export const LAYOUT = {
  insert: {
    pages: ['cover-page S V', 'blank-page S NP', 'page-break S B'],
    tables: ['insert-table L T', 'insert-table-dialog I AT', 'text-to-table I AC', 'table-from-data I AD'],
    illustrations: ['picture L P', 'insert-shapes L SH', 'insert-icons L Y', 'insert-interactive-graph L G', 'insert-smartart S M', 'insert-chart S C', 'insert-screenshot S SC'],
    links: ['link L I', 'bookmark L K', 'cross-reference L RF'],
    comments: ['comment-new L L'],
    headfoot: ['header L H', 'footer L O', 'page-number L NU'],
    text: ['insert-textbox L X', 'quick-parts S Q', 'insert-dropcap S RC', 'form-fields S FF'],
    symbols: ['equation-insert L E', 'symbol L U']
  },
  design: {
    formatting: ['design-themes L TH', 'design-style-set L S', 'design-colors L TC', 'design-fonts L TF', 'paragraph-spacing S PS'],
    background: ['watermark L PW', 'page-color L PC', 'page-borders L PB']
  },
  layout: {
    setup: ['margins L M', 'orientation L O', 'size L SZ', 'columns L J', 'breaks S B', 'line-numbers S LN', 'hyphenation S H', 'page-setup S -'],
    // (Word's Indent and Spacing: Left over Right, then Before over After)
    paragraph: ['indent-left S IL', 'indent-right S IR', '|', 'spacing-before S SB', 'spacing-after S SA', '|', 'tab-next L TN'],
    arrange: ['picture-position L PO', 'picture-wrap L TW', 'picture-rotate S AY'],
    document: ['doc-class S DC', 'base-size S DS', 'two-sided S DT']
  },
  references: {
    toc: ['table-of-contents L T', 'toc-add-text S A'],
    footnotes: ['footnote L F Insert Footnote', 'endnote S E', 'next-footnote S O', 'show-notes S H', 'footnote-options I -'],
    citations: ['citation L C Insert Citation', 'manage-sources S M', 'citation-style S L', 'bibliography S B', 'add-source S W'],
    captions: ['insert-caption L P', 'table-of-figures S G', 'cross-reference S RF'],
    index: ['mark-entry L N', 'insert-index S X'],
    authorities: ['mark-citation L I', 'insert-toa S S']
  },
  review: {
    proofing: ['spelling L S', 'thesaurus S E', 'word-count S W Word Count'],
    speech: ['read-aloud L RA Read Aloud'],
    accessibility: ['check-accessibility L A1'],
    language: ['language L U Language'],
    comments: ['comment-new L C', 'comment-delete L D Delete', 'comment-prev S V Previous', 'comment-next S N Next', 'comments-show L P Show Comments'],
    tracking: ['track-changes L G', 'display-for-review S TD', 'show-markup S TM Show Markup', 'reviewing-pane S TP Reviewing Pane'],
    changes: ['change-accept L A2', 'change-reject L J', 'change-prev S F Previous', 'change-next S H Next'],
    compare: ['compare L M Compare'],
    versions: ['version-save S K Save Version', 'versions S Y Version History']
  },
  view: {
    views: ['read-mode L F', 'print-layout L P', 'web-layout L L', 'latex-mode L X', 'outline-view S U', 'draft S E'],
    immersive: ['focus L O'],
    movement: ['side-to-side L 7'],
    mode: ['dark-page L D'],
    show: ['ruler S R', 'navigation-pane S K', 'show-latex S SL', 'show-marks S SM Formatting marks'],
    zoom: ['zoom-100 L J', 'one-page S 1', 'multiple-pages S M', 'page-width S I']
  },
  help: {
    help: ['help-how L H', 'help-report L C', 'help-tour L T', 'help-new L W', 'help-keys L K', 'help-graphs L G', 'help-agents L A', 'ask-grok L Q']
  },
  'table-design': {
    options: ['header-row S A', 'total-row S T', 'banded-rows S R', 'first-column S C', 'last-column S L', 'banded-columns S O'],
    styles: ['table-look-plain T S1', 'table-look-grid T S2', 'table-look-booktabs T S3', 'table-look-rows T S4', 'table-look-frame T S5', 'table-shading L H Shading'],
    borders: ['pen-weight S W Pen Weight', 'pen-color S PC Pen Color', 'table-borders L B Borders']
  },
  'table-layout': {
    table: ['table-select S K', 'table-properties S O Properties', 'table-caption S CA Insert Caption'],
    rows: ['table-delete L D', 'table-row-above L A', 'table-row-below S BE', 'table-col-left S L', 'table-col-right S R'],
    merge: ['merge-cells S M', 'split-cells S P', 'split-table S Q Split Table'],
    size: ['autofit L F', 'table-row-height S H', 'table-col-width S W', '|', 'distribute-rows S Y Distribute Rows', 'distribute-columns S U Distribute Columns'],
    // (a column at a time, so the nine stand as Word's three by three: top, centre, bottom rows)
    alignment: ['align-top-left I TL', 'align-center-left I CL', 'align-bottom-left I BL', 'align-top-center I TC', 'align-center-center I CC', 'align-bottom-center I BC',
      'align-top-right I TR', 'align-center-right I CR', 'align-bottom-right I BR', 'text-direction L X Text Direction', 'cell-margins L N Cell Margins'],
    data: ['table-sort L SO', 'repeat-header S G Repeat Header Rows', 'table-to-text S V Convert to Text']
  },
  'picture-format': {
    adjust: ['picture-corrections L R', 'picture-color L I', 'picture-transparency L TR', 'picture-compress S M', 'picture-change S G', 'picture-reset S Q Reset Picture'],
    styles: ['picture-border S SO', 'picture-caption S N'],
    accessibility: ['picture-alt L AT'],
    arrange: ['picture-position L PO', 'picture-wrap L TW', 'picture-rotate S AY'],
    size: ['picture-crop L C', 'picture-height S H', 'picture-width S W', '|', 'picture-lock I L', 'picture-size I SZ']
  },
  equation: {
    tools: ['eq-gallery L E', 'eq-numbered S N', 'eq-display S D'],
    conversions: ['show-latex L L'],
    symbols: ['eq-sym-basic S S1 Basic math', 'eq-sym-greek S S2 Greek letters', 'eq-sym-ops S S3 Operators', 'eq-sym-arrows S S4 Arrows', 'eq-sym-relations S S5 Relations',
      'eq-sym-sets S S6 Sets and logic', 'eq-sym-geometry S S7 Geometry'],
    structures: ['eq-fraction L F Fraction', 'eq-script L SC Script', 'eq-radical L R Radical', 'eq-integral L I Integral', 'eq-largeop L O Large Operator', 'eq-bracket L B Bracket',
      'eq-function L U Function', 'eq-accent L A Accent', 'eq-limit L G Limit and Log', 'eq-operator L P Operator', 'eq-matrix L M Matrix']
  },
  'shape-format': {
    insert: ['shape-insert L SI'],
    styles: ['shape-styles L SS', 'shape-fill S SF', 'shape-outline S SO'],
    text: ['shape-text L X'],
    arrange: ['shape-forward S AF', 'shape-backward S AE'],
    size: ['shape-height S H', 'shape-width S W']
  },
  'chart-design': {
    layouts: ['chart-element L A'],
    styles: ['chart-colors L C'],
    data: ['chart-switch L W', 'chart-edit-data L D'],
    type: ['chart-type L Y']
  },
  'chart-format': {
    size: ['chart-height S H', 'chart-width S W']
  },
  'smart-design': {
    create: ['smart-add S A', 'smart-text-pane S T', 'smart-rtl S R'],
    layouts: ['smart-layout L L'],
    styles: ['smart-colors L C'],
    reset: ['smart-reset L G']
  },
  'smart-format': {
    styles: ['smart-fill S F', 'smart-outline S O']
  },
  headfoot: {
    headfoot: ['header L H', 'footer L O', 'page-number L NU'],
    insert: ['hf-date L D', 'hf-docinfo L I', 'hf-pagenum L NH'],
    options: ['hf-first S A', 'hf-oddeven S V', 'hf-position S P'],
    close: ['hf-close L C Close Header and Footer']
  }
};

// Groups whose toggles Word draws as check boxes (a ticked box beside the name)
export const CHECKS = new Set(['table-design/options', 'view/show', 'headfoot/options']);

// Home's KeyTips, as Word's (its layout is src/app.css's own)
const HOME = {
  paste: 'V', cut: 'X', copy: 'C', 'format-painter': 'FP',
  'font-name': 'FF', 'font-size': 'FS', 'grow-font': 'FG', 'shrink-font': 'FK', 'change-case': '7', 'clear-formatting': 'E',
  bold: '1', italic: '2', underline: '3', strikethrough: '4', subscript: '5', superscript: '6', highlight: 'I', 'font-color': 'FC', 'font-more': 'FT',
  bullets: 'U', numbering: 'N', multilevel: 'M', 'indent-decrease': 'AO', 'indent-increase': 'AI', sort: 'SO', 'show-marks': '8',
  'align-left': 'AL', 'align-center': 'AC', 'align-right': 'AR', justify: 'AJ', 'line-spacing': 'K', shading: 'H', borders: 'B',
  'styles-more': 'L', find: 'FD', replace: 'R', select: 'SL'
};

// Groups whose corner arrow opens a dialog that already exists: [command, its name, KeyTip]. The
// name is not the button's (each is in the tree once: only the open tab's panel is).
export const LAUNCH = {
  'home/font': ['font-dialog', 'Font…', 'FN'],
  'home/paragraph': ['paragraph-settings', 'Paragraph…', 'PG'],
  'home/styles': ['styles-pane', 'Styles pane', 'FY'],
  'layout/setup': ['page-setup', 'Page setup…', 'SP'],
  'layout/paragraph': ['paragraph-settings', 'Paragraph…', 'PG'],
  'references/footnotes': ['footnote-options', 'Footnote and Endnote…', 'Q'],
  'table-layout/size': ['table-properties', 'Table Properties…', 'I'],
  'picture-format/size': ['picture-size', 'Size and Position…', 'SL']
};

// one line of LAYOUT read: { id, size, tip, shown } or { brk: true }
export function readLine(s) {
  if (s === '|') return { brk: true };
  const [id, size, tip, ...rest] = s.split(' ');
  return { id, size, tip: tip && tip !== '-' ? tip : null, shown: rest.length ? rest.join(' ') : null };
}

// a group's lines, or null where the group keeps its own rules (Home's, File's)
export function groupLayout(tab, group) {
  const t = LAYOUT[tab], g = t && t[group];
  return g ? g.map(readLine) : null;
}

// Every KeyTip of a tab by command id (Home's, and every laid out group's)
export const TIPS = { home: HOME };
for (const [tab, groups] of Object.entries(LAYOUT)) {
  const m = TIPS[tab] = TIPS[tab] || {};
  for (const lines of Object.values(groups)) for (const l of lines.map(readLine)) if (l.tip) m[l.id] = l.tip;
}
