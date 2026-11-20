// The command registry as the batches fill it (src/commands.js, src/cmd/*.js) and the ribbon's
// order (src/ribbon/order.js): unique ids; every placed command in a declared tab and group; no
// name twice in one tab's panel; every chord readable and no two commands on one chord where both
// apply at the same rank; the insert list in its old order; the names agents found before kept;
// the search finding Word's names; controls.json's shape.
import assert from 'node:assert/strict';
import { commands, command, places, paletteItems, search, describe, menuItems, register, unregister, run, enabled, joinMethods } from '../src/commands.js';
import '../src/cmd/index.js';
import { TABS, groupOf, KEYTIPS } from '../src/ribbon/order.js';
import { LAYOUT, TIPS, LAUNCH, CHECKS, readLine } from '../src/ribbon/layout.js';
import { parseChord, chordFor, bindings } from '../src/keys.js';
import { controls } from '../build/app.mjs';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

ok('every command has an id and a name; ids are unique', () => {
  const ids = commands().map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(commands().every((c) => c.name && typeof c.name === 'string'));
  assert.throws(() => register({ id: 'bold', name: 'Again' }), /Two commands/);
});

ok('every place is a declared tab and group; element ids are unique', () => {
  const els = [];
  for (const c of commands()) {
    for (const p of places(c)) {
      assert.ok(groupOf(p.tab, p.group), c.id + ' in ' + p.tab + '/' + p.group);
      els.push(p.el);
    }
    if (c.static && c.el && !c.tab) els.push(c.el);
  }
  assert.equal(new Set(els).size, els.length, els.filter((e, i) => els.indexOf(e) !== i).join());
});

ok('no name twice in one tab\'s panel (the downloads and the bar are in view with every tab)', () => {
  const always = describe().filter((x) => ['bar', 'status', 'download', 'tabs'].includes(x.place)).map((x) => x.role + ':' + x.name);
  for (const t of TABS) {
    const here = describe().filter((x) => x.tab === t.id).map((x) => x.role + ':' + x.name);
    const all = [...always, ...here];
    const twice = all.filter((x, i) => all.indexOf(x) !== i);
    assert.deepEqual(twice, [], t.name);
    // a group folds into a button of its name: no command of the tab may have it (a group with
    // no command has no such button: File's Open while Print alone is there)
    for (const g of t.groups) if (here.length && describe().some((x) => x.tab === t.id && x.group === g.id)) assert.ok(!all.includes('button:' + g.name), t.name + ': group ' + g.name);
  }
});

ok('every chord reads; two commands on one chord differ in rank, or one says where it applies', () => {
  const seen = new Map();
  for (const c of commands()) for (const k of [...(c.keys || []), ...(c.keysQuiet || []), ...(c.keysMac || []).map((x) => ({ mac: x }))]) {
    for (const mac of [false, true]) {
      // (a Mac's own keys are bound there alone)
      const on = typeof k === 'object' ? (mac ? k.mac : null) : chordFor(k, mac, c.mac);
      if (!on) continue;
      const p = parseChord(on), key = mac + JSON.stringify(p);
      if (seen.has(key)) { const o = seen.get(key); assert.ok((o.keyRank || 0) !== (c.keyRank || 0) || o.when || c.when, k + ': ' + o.id + ' and ' + c.id); }
      seen.set(key, c);
    }
  }
  assert.ok(command('style-heading1').keys.includes('Ctrl+Alt+1') && command('style-normal').keys.includes('Ctrl+Alt+0') && command('style-normal').keys.includes('Ctrl+Shift+N') && command('bullets').keys.includes('Ctrl+Shift+L'));
  assert.ok(command('double-underline').keys.includes('Ctrl+Shift+D') && command('clear-paragraph-formatting').keys.includes('Ctrl+Q'));
  assert.ok(command('format-painter').keys.includes('Ctrl+Shift+C') && command('paste-special').keys.includes('Ctrl+Alt+V'));
  assert.deepEqual(KEYTIPS, { file: 'F', home: 'H', insert: 'N', design: 'G', layout: 'P', references: 'S', review: 'R', view: 'W', help: 'Y2',
    'table-design': 'JT', 'table-layout': 'JL', 'picture-format': 'JP', equation: 'JE', headfoot: 'JH' });
  // (no tab's letters the start of another's: Word waits for the second letter only after J and Y)
  for (const a of Object.values(KEYTIPS)) for (const b of Object.values(KEYTIPS)) assert.ok(a === b || !b.startsWith(a), a + ' starts ' + b);
  assert.ok(command('search').keys.includes('Alt+Q') && command('ribbon-collapse').keys.includes('Ctrl+F1') && command('context-menu').keys.includes('Shift+F10'));
});

// Word's keys (docs/handoff/SHORTCUTS.md, the rows that work): the chord on Windows and Linux, the
// command it runs, and the chord on a Mac where Word for Mac's differs
const WORD = [
  ['Ctrl+B', 'bold'], ['Ctrl+I', 'italic'], ['Ctrl+U', 'underline'], ['Ctrl+Shift+D', 'double-underline'], ['Ctrl+Shift+A', 'all-caps'], ['Ctrl+Shift+K', 'small-caps'],
  ['Ctrl+Shift+X', 'strikethrough'], ['Ctrl+D', 'font-dialog'], ['Ctrl+Shift+F', 'font-name'], ['Ctrl+Shift+P', 'font-size'], ['Ctrl+Shift+>', 'grow-font'], ['Ctrl+Shift+<', 'shrink-font'],
  ['Ctrl+]', 'grow-font', null], ['Ctrl+[', 'shrink-font', null], ['Shift+F3', 'change-case-cycle'], ['Ctrl+Space', 'clear-char-formatting', 'Control+Space'], ['Ctrl+Shift+C', 'format-painter'],
  ['Ctrl+E', 'align-center'], ['Ctrl+L', 'align-left'], ['Ctrl+R', 'align-right'], ['Ctrl+J', 'justify'], ['Ctrl+Q', 'clear-paragraph-formatting'],
  ['Ctrl+1', 'line-spacing-1'], ['Ctrl+2', 'line-spacing-2'], ['Ctrl+5', 'line-spacing-15'], ['Ctrl+Shift+8', 'show-marks'], ['Ctrl+Shift+L', 'bullets'],
  ['Ctrl+Shift+N', 'style-normal'], ['Ctrl+Alt+1', 'style-heading1'], ['Ctrl+Alt+2', 'style-heading2'], ['Ctrl+Alt+3', 'style-heading3'], ['Ctrl+Shift+S', 'apply-styles'], ['Ctrl+Alt+Shift+S', 'styles-pane'],
  ['Ctrl+F', 'find'], ['Ctrl+H', 'replace', 'Control+H'], ['Ctrl+G', 'go-to', 'Ctrl+Alt+G'], ['F5', 'go-to'], ['Shift+F4', 'find-next'], ['Ctrl+Alt+Y', 'find-next'], ['Shift+F5', 'go-back'], ['Ctrl+Alt+Z', 'go-back'],
  ['F8', 'extend-selection'], ['Shift+F8', 'shrink-selection'],
  ['Alt+Shift+ArrowLeft', 'promote', 'Control+Shift+ArrowLeft'], ['Alt+Shift+ArrowRight', 'demote', 'Control+Shift+ArrowRight'], ['Alt+Shift+ArrowUp', 'move-up', 'Control+Shift+ArrowUp'],
  ['Alt+Shift+A', 'headings-collapse-all', 'Control+Shift+A'], ['Alt+Shift+1', 'show-level-1', 'Control+Shift+1'], ['Alt+Shift+9', 'show-level-9', 'Control+Shift+9'],
  ['Ctrl+Enter', 'page-break'], ['Ctrl+Shift+Enter', 'column-break'], ['Ctrl+Shift+Space', 'insert-nbsp'], ['Ctrl+Shift+_', 'insert-nb-hyphen'], ['Ctrl+Alt+NumpadSubtract', 'insert-em-dash'], ['Ctrl+NumpadSubtract', 'insert-en-dash'],
  ['Ctrl+Alt+C', 'insert-copyright', null], ['Ctrl+Alt+R', 'insert-registered', null], ['Ctrl+Alt+T', 'insert-trademark', null], ['Ctrl+Alt+.', 'insert-ldots'], ['Alt+X', 'unicode-toggle', 'Control+Alt+X'],
  ['Ctrl+\'', 'accent-acute', null], ['Ctrl+`', 'accent-grave', null], ['Ctrl+Shift+^', 'accent-circumflex', null], ['Ctrl+Shift+~', 'accent-tilde', null], ['Ctrl+Shift+:', 'accent-umlaut', null],
  ['Ctrl+Shift+@', 'accent-ring', null], ['Ctrl+Shift+&', 'accent-ligature', null], ['Ctrl+/', 'accent-slash', null], ['Ctrl+Alt+Shift+?', 'insert-iquest', null], ['Ctrl+Alt+Shift+!', 'insert-iexcl', null],
  ['Ctrl+Alt+V', 'paste-special', 'Ctrl+Control+V'], ['Ctrl+F3', 'spike'], ['Ctrl+Shift+F3', 'spike-insert'], ['F2', 'move-text'], ['Shift+F2', 'copy-text'], ['Alt+F3', 'quick-part-save'],
  ['Alt+Shift+D', 'insert-date', 'Control+Shift+D'], ['Alt+Shift+T', 'insert-time', 'Control+Shift+T'], ['Alt+Shift+P', 'insert-page-field', 'Control+Shift+P'], ['Ctrl+F9', 'insert-field'],
  ['Ctrl+K', 'link'], ['Ctrl+Alt+F', 'footnote'], ['Ctrl+Alt+D', 'endnote', 'Ctrl+Alt+E'], ['Alt+Shift+>', 'next-footnote', 'Control+Shift+>'], ['Alt+Shift+<', 'previous-footnote', 'Control+Shift+<'],
  ['Alt+Shift+O', 'toc-add-text', 'Control+Shift+O'], ['Alt+Shift+X', 'mark-entry', 'Control+Shift+X'], ['Alt+Shift+I', 'mark-citation', 'Control+Shift+I'], ['Ctrl+Shift+F5', 'bookmark'],
  ['Ctrl+Shift+E', 'track-changes'], ['F7', 'spelling'], ['Alt+F7', 'spelling-next'], ['Shift+F7', 'thesaurus'], ['Ctrl+Shift+G', 'word-count'],
  ['Ctrl+Alt+P', 'print-layout'], ['Ctrl+Alt+O', 'outline-view'], ['Ctrl+Alt+N', 'draft'], ['Alt+F9', 'latex-mode'], ['Shift+F9', 'show-latex'], ['Ctrl+F2', 'preview'],
  ['Ctrl+P', 'print'], ['Ctrl+Shift+F12', 'print'], ['Ctrl+F12', 'open'], ['Shift+F12', 'save'], ['Alt+Shift+F2', 'save'], ['F12', 'save-as'],
  ['F1', 'help-how'], ['Shift+F1', 'show-in-source'], ['Ctrl+F1', 'ribbon-collapse', 'Ctrl+Alt+R'], ['Shift+F10', 'context-menu'], ['Alt+Q', 'search', 'Control+Alt+Q'], ['F4', 'repeat'],
  ['Ctrl+F6', 'next-pane'], ['Ctrl+Shift+F6', 'previous-pane'], ['Alt+=', 'insert-equation', 'Control+='],
  ['Alt+Home', 'cell-row-first', 'Control+Home'], ['Alt+End', 'cell-row-last', 'Control+End'], ['Alt+PageUp', 'cell-col-first', 'Control+PageUp'], ['Alt+PageDown', 'cell-col-last', 'Control+PageDown'],
  ['Alt+Shift+ArrowDown', 'table-row-down', 'Control+Shift+ArrowDown'], ['Alt+Clear', 'select-table', null]
];
ok('Word\'s keys: each bound to its command, on Windows and Linux and on a Mac (Word for Mac\'s chord where it has its own)', () => {
  for (const mac of [false, true]) {
    const B = bindings(mac);
    for (const [k, id, onMac] of WORD) {
      const want = mac ? (onMac === undefined ? k : onMac) : k;
      assert.ok(command(id), id);
      if (want === null) { assert.ok(!B.some((b) => b.id === id && b.chord === k), 'not on a Mac: ' + k + ' ' + id); continue; }
      assert.ok(B.some((b) => b.id === id && b.chord === want), (mac ? 'Mac ' : '') + want + ' runs ' + id);
    }
  }
  // Word for Mac's own: Cmd+Option+L spelling, Cmd+Option+A a comment, Control+Shift+M indents, Cmd+G finds again
  const M = bindings(true);
  for (const [k, id] of [['Ctrl+Alt+L', 'spelling'], ['Ctrl+Alt+A', 'comment-new'], ['Control+Shift+M', 'paragraph-indent'], ['Ctrl+G', 'find-next'], ['Ctrl+8', 'show-marks']]) assert.ok(M.some((b) => b.id === id && b.chord === k), k);
  // Save (Ctrl+S) says the document is kept; Save As (F12) and Download LaTeX download
  assert.ok(command('save').keysElsewhere.includes('Ctrl+S') && !command('download-latex').keysElsewhere && command('save-as').keys.includes('F12'));
  // Word's keys a browser keeps are bound to nothing here
  for (const k of ['Ctrl+N', 'Ctrl+W', 'Ctrl+T', 'Ctrl+Tab', 'F6', 'F11', 'Ctrl+F4']) assert.ok(!bindings(false).some((b) => b.chord === k), k);
});

ok('the insert list keeps its items and their order', () => {
  assert.deepEqual(paletteItems().map((x) => x.k), ['footnote', 'cite', 'ref', 'eqref', 'emph', 'textbf', 'texttt', 'equation', 'math', 'section', 'subsection', 'itemize', 'enumerate',
    'description', 'proposition', 'lemma', 'theorem', 'definition', 'assumption', 'proof', 'label', 'url', 'ldots', 'newline',
    // (B11: the interactive graph and Insert › LaTeX's environments, after the items there were)
    'graph', 'center', 'flushleft', 'flushright', 'quote', 'quotation', 'verse', 'verbatim', 'minipage', 'abstract']);
  const it = paletteItems().find((x) => x.k === 'itemize');
  assert.deepEqual(it.t, { open: '\n\n\\begin{itemize}\n  \\item ', close: '\n\\end{itemize}\n\n' });
  assert.equal(it.block, true);
});

ok('the names agents found before stay on the same elements, on Home', () => {
  const KEPT = { 'rb-b': 'Bold', 'rb-i': 'Italic', 'rb-u': 'Underline', 'rb-ul': 'Bulleted list', 'rb-ol': 'Numbered list', 'rb-math': 'Formula', 'rb-eq': 'Equation', 'rb-table': 'Table',
    'rb-pic': 'Picture', 'rb-fn': 'Footnote', 'rb-cite': 'Citation', 'rb-link': 'Link', 'rb-style': 'Style of this paragraph', 'rb-st-p': 'Normal', 'rb-st-latex': 'LaTeX source', 'rb-st-more': 'More styles' };
  const d = describe();
  for (const [id, name] of Object.entries(KEPT)) { const x = d.find((y) => y.id === id); assert.ok(x && x.name === name && x.tab === 'home', id); }
  for (const [id, name] of Object.entries({ 'rb-pdf': 'Download PDF', 'rb-word': 'Download Word', 'b-save': 'Download LaTeX', 'rb-dl-menu': 'Download' })) assert.equal(d.find((y) => y.id === id).name, name);
});

ok('the search box finds commands by Word\'s names, other names, starts of words', () => {
  assert.equal(search('Bullets')[0].id, 'bullets');
  assert.equal(search('numbering')[0].id, 'numbering');
  assert.equal(search('bul')[0].id, 'bullets');
  // (the start of a word only: "bul" is in "tabular", a synonym of Table)
  assert.ok(!search('bul').some((c) => c.id === 'insert-table' || /table/i.test(c.name)), search('bul').map((c) => c.id).join());
  assert.equal(search('heading 2')[0].id, 'style-heading2');
  assert.equal(search('theorem')[0].id, 'insert-theorem');
  assert.ok(search('pdf').some((c) => c.id === 'download-pdf'));
  assert.deepEqual(search(''), []);
  assert.deepEqual(search('zzzz qqqq'), []);
  assert.ok(!search('next styles').some((c) => c.id === 'styles-next'));
});
// as a command palette takes them (POWER-USER.md 9): letters in order from a word's first, the
// initials of the name's words, a digit joined to a word; the commands run last first among
// matches about as good, never before a whole match
ok('the search box: letters in order, initials, recent commands first', () => {
  assert.equal(search('tbl')[0].id, 'table');
  assert.equal(search('hed 2')[0].id, 'style-heading2');
  assert.equal(search('heading2')[0].id, 'style-heading2');
  assert.equal(search('eqn')[0].id, 'equation');
  assert.equal(search('toc')[0].id, 'table-of-contents');
  assert.ok(search('xref').some((c) => c.id === 'cross-reference'));
  // a word's own start still goes first: "bul" is Bulleted list, nothing in "tabular"
  assert.equal(search('bul')[0].id, 'bullets');
  assert.equal(search('b')[0].id, 'bold');
  assert.equal(search('b', { recent: ['borders'] })[0].id, 'borders');
  assert.equal(search('bold', { recent: ['borders'] })[0].id, 'bold');
});

ok('the right click menu by context: the particular first, a line between contexts', () => {
  const m = menuItems(['table', 'selection', 'text']);
  assert.equal(m[0].id, 'table-row-below');
  // (the table's items, then a line, then the selection's)
  const line = m.indexOf(null);
  assert.ok(line > 0 && m.slice(0, line).every((c) => c.menu.table != null));
  // (Word's order: Cut, Copy, Paste, then the font's)
  assert.deepEqual(m.slice(line + 1, line + 5).map((c) => c.id), ['cut', 'copy', 'paste', 'bold']);
  assert.ok(m.filter(Boolean).some((c) => c.id === 'show-in-source'));
});

ok('run by id: where it can run, and not where it cannot', () => {
  const did = [];
  register({ id: 't-run', name: 'T', when: (app, at) => !!at, run: (app, args) => { did.push(args); } });
  try {
    assert.equal(run({ ribbonAt: () => null }, 't-run', 1), false);
    assert.equal(run({ ribbonAt: () => ({}) }, 't-run', 2), true);
    assert.deepEqual(did, [2]);
    assert.equal(run({}, 'no-such', 1), false);
    assert.equal(enabled({}, 'no-such', {}), false);
  } finally { unregister('t-run'); }
});

ok('controls.json: every control with its role, name and place', () => {
  const c = controls();
  assert.ok(c.length > 60);
  for (const x of c) assert.ok(['bar', 'status', 'download', 'tabs', 'ribbon', 'menu', 'search'].includes(x.place) && x.name && x.role && Array.isArray(x.keys), JSON.stringify(x));
  assert.ok(c.some((x) => x.id === 'ri-pic' && x.name === 'Picture' && x.tabName === 'Insert'));
  assert.ok(c.some((x) => x.id === 'rv-comment' && x.name === 'New comment') && c.some((x) => x.id === 'ri-comment' && x.name === 'Comment'));
  assert.ok(c.find((x) => x.command === 'table-row-below').contextual);
});

ok('the quiet chords: Ctrl+Shift+B, I, U and M act as before the registry, listed nowhere', () => {
  for (const [id, k] of [['bold', 'Ctrl+Shift+B'], ['italic', 'Ctrl+Shift+I'], ['underline', 'Ctrl+Shift+U'], ['formula', 'Ctrl+Shift+M']]) {
    assert.ok((command(id).keysQuiet || []).includes(k), id);
    assert.ok(!describe().some((x) => x.command === id && x.keys.includes(k)), id);
  }
  // (Ctrl+Shift+K is small capitals, B1's)
  assert.ok(!commands().some((c) => (c.keysQuiet || []).includes('Ctrl+Shift+K')));
});

ok('the methods of the modules joined into the app: a name in two of them throws', () => {
  const t = {};
  joinMethods(t, { 'a.js': { f() { return 1; } }, 'b.js': { g() { return 2; } } });
  assert.equal(t.f() + t.g(), 3);
  assert.throws(() => joinMethods({}, { 'a.js': { f() {} }, 'b.js': { f() {} } }), /f.*a\.js.*b\.js|f.*b\.js.*a\.js/);
  class A { h() {} }
  assert.throws(() => joinMethods(A.prototype, { 'c.js': { h() {} } }), /h/);
  assert.doesNotThrow(() => joinMethods({}, { 'a.js': { toString() { return ''; } } }));
});

ok('Word\'s layout of the tabs (src/ribbon/layout.js): every line a command placed in that tab and group, once, with a size Word has', () => {
  for (const [tab, groups] of Object.entries(LAYOUT)) for (const [group, lines] of Object.entries(groups)) {
    assert.ok(groupOf(tab, group), tab + '/' + group + ' is a group of src/ribbon/order.js');
    const ids = lines.map(readLine).filter((l) => !l.brk).map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, tab + '/' + group + ': an id twice');
    for (const l of lines.map(readLine)) {
      if (l.brk) continue;
      const c = command(l.id);
      assert.ok(c && places(c).some((p) => p.tab === tab && p.group === group), l.id + ' is placed in ' + tab + '/' + group);
      assert.ok(['L', 'S', 'I', 'T'].includes(l.size), l.id + ': size ' + l.size);
      // the name a button shows is in its accessible name (WCAG 2.5.3: one says what one sees)
      const p = places(c).find((x) => x.tab === tab && x.group === group);
      const shown = l.shown || (c.label ? (p.main ? c.label : p.name) : p.name);
      assert.ok(p.name.toLowerCase().includes(shown.toLowerCase()), tab + ': ' + l.id + ' shows ' + shown + ', named ' + p.name);
    }
  }
  for (const k of CHECKS) assert.ok(groupOf(...k.split('/')), k);
  for (const [k, [id]] of Object.entries(LAUNCH)) { assert.ok(groupOf(...k.split('/')), k); assert.ok(command(id) && command(id).run, k + ': ' + id); }
});

ok('KeyTips: in each tab every one is unique and none is the start of another (Word waits for no second letter), Z is left for folded groups', () => {
  for (const tab of Object.keys(TIPS)) {
    const tips = [...Object.values(TIPS[tab]), ...Object.entries(LAUNCH).filter(([k]) => k.startsWith(tab + '/')).map(([, v]) => v[2]).filter(Boolean)];
    assert.equal(new Set(tips).size, tips.length, tab + ': ' + tips.filter((t, i) => tips.indexOf(t) !== i).join());
    for (const a of tips) {
      assert.match(a, /^[A-Y0-9][A-Z0-9]?$/, tab + ': ' + a);
      for (const b of tips) assert.ok(a === b || !b.startsWith(a), tab + ': ' + a + ' starts ' + b);
    }
    for (const id of Object.keys(TIPS[tab])) assert.ok(command(id) && places(command(id)).some((p) => p.tab === tab), tab + ': ' + id + ' is on the tab');
  }
});

console.log('commands: ' + n + ' groups of checks passed');
