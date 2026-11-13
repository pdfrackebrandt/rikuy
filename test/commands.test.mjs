// The command registry as the batches fill it (src/commands.js, src/cmd/*.js) and the ribbon's
// order (src/ribbon/order.js): unique ids; every placed command in a declared tab and group; no
// name twice in one tab's panel; every chord readable and no two commands on one chord where both
// apply at the same rank; the insert list in its old order; the names agents found before kept;
// the search finding Word's names; controls.json's shape.
import assert from 'node:assert/strict';
import { commands, command, places, paletteItems, search, describe, menuItems, register, unregister, run, enabled, joinMethods } from '../src/commands.js';
import '../src/cmd/index.js';
import { TABS, groupOf } from '../src/ribbon/order.js';
import { parseChord, chordFor } from '../src/keys.js';
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
  for (const c of commands()) for (const k of [...(c.keys || []), ...(c.keysQuiet || [])]) {
    for (const mac of [false, true]) {
      const on = chordFor(k, mac, c.mac);
      if (!on) continue;
      const p = parseChord(on), key = mac + JSON.stringify(p);
      if (seen.has(key)) { const o = seen.get(key); assert.ok((o.keyRank || 0) !== (c.keyRank || 0) || o.when || c.when, k + ': ' + o.id + ' and ' + c.id); }
      seen.set(key, c);
    }
  }
  assert.ok(command('style-heading1').keys.includes('Ctrl+Alt+1') && command('style-normal').keys.includes('Ctrl+Alt+0') && command('bullets').keys.includes('Ctrl+Shift+L'));
  assert.ok(command('search').keys.includes('Alt+Q') && command('ribbon-collapse').keys.includes('Ctrl+F1') && command('context-menu').keys.includes('Shift+F10'));
});

ok('the insert list keeps its items and their order', () => {
  assert.deepEqual(paletteItems().map((x) => x.k), ['footnote', 'cite', 'ref', 'eqref', 'emph', 'textbf', 'texttt', 'equation', 'math', 'section', 'subsection', 'itemize', 'enumerate',
    'proposition', 'lemma', 'theorem', 'definition', 'assumption', 'proof', 'label', 'url', 'ldots', 'newline']);
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

ok('the right click menu by context: the particular first, a line between contexts', () => {
  const m = menuItems(['table', 'selection', 'text']);
  assert.equal(m[0].id, 'table-row-below');
  // (the table's items, then a line, then the selection's)
  const line = m.indexOf(null);
  assert.ok(line > 0 && m.slice(0, line).every((c) => c.menu.table != null));
  assert.deepEqual(m.slice(line + 1, line + 5).map((c) => c.id), ['cut', 'copy', 'bold', 'italic']);
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

console.log('commands: ' + n + ' groups of checks passed');
