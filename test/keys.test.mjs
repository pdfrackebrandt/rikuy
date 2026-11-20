// The keys (src/keys.js): chords read, matched against keydown events as Chromium, Firefox and
// Safari report them on Windows, Linux and a Mac; AltGr (Ctrl+Alt on Windows) never taken for a
// Ctrl+Alt chord; nothing while an input method composes; a Mac's own chords; the command a chord
// runs where two claim it.
import assert from 'node:assert/strict';
import { parseChord, matches, chordFor, lookup, bindings, chordText, keyLabel, keyTitle, keysInText, chordsOf, firstKey, KEPT } from '../src/keys.js';
import { register, unregister } from '../src/commands.js';
import '../src/cmd/index.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
// a keydown as a browser makes it
const ev = (key, o = {}) => ({ key, code: o.code || '', ctrlKey: !!o.ctrl, metaKey: !!o.meta, altKey: !!o.alt, shiftKey: !!o.shift, isComposing: !!o.ime, keyCode: o.keyCode || 0, getModifierState: (m) => m === 'AltGraph' && !!o.altgr });

ok('chords read: modifiers, letters, digits, signs, named keys', () => {
  assert.deepEqual(parseChord('Ctrl+Alt+1'), { mod: true, control: false, alt: true, shift: false, key: '1' });
  assert.equal(parseChord('Shift+F10').named, true);
  assert.equal(parseChord('ContextMenu').named, true);
  assert.equal(parseChord('Ctrl++').key, '+');
  assert.equal(parseChord('Control+=').control, true);
  assert.throws(() => parseChord('Hyper+X'));
  assert.throws(() => parseChord('Ctrl+Bogus'));
});

ok('Ctrl is Ctrl on Windows and Linux, Cmd on a Mac', () => {
  assert.equal(matches('Ctrl+B', ev('b', { ctrl: true }), false), true);
  assert.equal(matches('Ctrl+B', ev('b', { meta: true }), false), false);
  assert.equal(matches('Ctrl+B', ev('b', { meta: true }), true), true);
  assert.equal(matches('Ctrl+B', ev('b', { ctrl: true }), true), false);
  // exact modifiers: Ctrl+Shift+B is not Ctrl+B
  assert.equal(matches('Ctrl+B', ev('B', { ctrl: true, shift: true }), false), false);
  assert.equal(matches('Ctrl+Shift+L', ev('L', { ctrl: true, shift: true }), false), true);
  // a Mac's Control key is a modifier of its own
  assert.equal(matches('Control+=', ev('=', { ctrl: true }), true), true);
  assert.equal(matches('Ctrl+=', ev('=', { ctrl: true }), true), false);
});

ok('AltGr is no Ctrl+Alt chord: German AltGr+2 types ², AltGr+0 types }', () => {
  assert.equal(matches('Ctrl+Alt+1', ev('1', { ctrl: true, alt: true }), false), true);
  assert.equal(matches('Ctrl+Alt+2', ev('²', { ctrl: true, alt: true, altgr: true, code: 'Digit2' }), false), false);
  assert.equal(matches('Ctrl+Alt+0', ev('}', { ctrl: true, alt: true, altgr: true, code: 'Digit0' }), false), false);
  // the AltGraph state alone is enough to refuse, whatever the key
  assert.equal(matches('Ctrl+Alt+1', ev('1', { ctrl: true, alt: true, altgr: true }), false), false);
  // a character Ctrl+Alt typed (no AltGraph state, as some systems report it) is not the digit either
  assert.equal(matches('Ctrl+Alt+2', ev('@', { ctrl: true, alt: true, code: 'Digit2' }), false), false);
});

ok('Shift with a digit: by the key\'s place when the sign is what it typed', () => {
  assert.equal(matches('Ctrl+Shift+8', ev('*', { ctrl: true, shift: true, code: 'Digit8' }), false), true);
  assert.equal(matches('Ctrl+Shift+8', ev('8', { ctrl: true, shift: true, code: 'Digit8' }), false), true);
  assert.equal(matches('Ctrl+8', ev('*', { ctrl: true, shift: true, code: 'Digit8' }), false), false);
});

ok('signs as typed: Ctrl+Shift+> and Ctrl+.', () => {
  assert.equal(matches('Ctrl+Shift+>', ev('>', { ctrl: true, shift: true }), false), true);
  assert.equal(matches('Ctrl+.', ev('.', { ctrl: true }), false), true);
  assert.equal(matches('Ctrl+.', ev('>', { ctrl: true, shift: true }), false), false);
  assert.equal(matches('Alt+=', ev('=', { alt: true }), false), true);
});

ok('named keys: Shift+F10, the menu key (Apps in old browsers), Ctrl+F1, Space', () => {
  assert.equal(matches('Shift+F10', ev('F10', { shift: true }), false), true);
  assert.equal(matches('Shift+F10', ev('F10'), false), false);
  assert.equal(matches('ContextMenu', ev('ContextMenu'), false), true);
  assert.equal(matches('ContextMenu', ev('Apps'), false), true);
  assert.equal(matches('Ctrl+F1', ev('F1', { ctrl: true }), false), true);
  assert.equal(matches('Ctrl+Space', ev(' ', { ctrl: true }), false), true);
});

ok('nothing while an input method composes', () => {
  assert.equal(matches('Ctrl+B', ev('b', { ctrl: true, ime: true }), false), false);
  assert.equal(matches('Ctrl+B', ev('Process', { ctrl: true, keyCode: 229 }), false), false);
});

ok('the Windows key is the system\'s', () => {
  assert.equal(matches('Ctrl+B', ev('b', { ctrl: true, meta: true }), false), false);
});

ok('a Mac\'s Option types a character of its own: the key\'s place says which key', () => {
  assert.equal(matches('Ctrl+Alt+1', ev('\u00a1', { meta: true, alt: true, code: 'Digit1' }), true), true);
  assert.equal(matches('Control+Alt+Q', ev('\u0153', { ctrl: true, alt: true, code: 'KeyQ' }), true), true);
  // not elsewhere: there the character is AltGr's
  assert.equal(matches('Ctrl+Alt+1', ev('\u00a1', { ctrl: true, alt: true, code: 'Digit1' }), false), false);
});

ok('a Mac\'s own chord, or none', () => {
  assert.equal(chordFor('Alt+=', true, { 'Alt+=': 'Control+=' }), 'Control+=');
  assert.equal(chordFor('Ctrl+]', true, { 'Ctrl+]': false }), null);
  assert.equal(chordFor('Ctrl+]', false, { 'Ctrl+]': false }), 'Ctrl+]');
});

ok('two commands on one chord: the one that can run here, the higher rank first; the page\'s keys only on the page', () => {
  register({ id: 't-a', name: 'A', keys: ['Ctrl+Alt+9'], when: () => true },
    { id: 't-b', name: 'B', keys: ['Ctrl+Alt+9'], keyRank: 1, when: () => true },
    { id: 't-c', name: 'C', keys: ['Alt+F12'], keyScope: 'app', mac: { 'Alt+F12': false } });
  try {
    const e = ev('9', { ctrl: true, alt: true });
    assert.deepEqual(lookup(e, { mac: false, scope: 'page', can: () => true }), { hit: true, id: 't-b' });
    assert.deepEqual(lookup(e, { mac: false, scope: 'page', can: (id) => id === 't-a' }), { hit: true, id: 't-a' });
    // a chord that belongs to the page is no chord in a field or the bar
    assert.deepEqual(lookup(e, { mac: false, scope: 'app', can: () => true }), { hit: false, id: null });
    assert.deepEqual(lookup(ev('F12', { alt: true }), { mac: false, scope: 'app', can: () => true }), { hit: true, id: 't-c' });
    // none on a Mac
    assert.equal(bindings(true).some((b) => b.id === 't-c'), false);
    // matched but nothing can run: the chord is held back from the browser all the same
    assert.deepEqual(lookup(e, { mac: false, scope: 'page', can: () => false }), { hit: true, id: null });
  } finally { ['t-a', 't-b', 't-c'].forEach(unregister); }
});

ok('a chord as people read it: arrow keys as arrows, everything else as the registry has it', () => {
  assert.equal(chordText('Alt+Shift+ArrowLeft'), 'Alt+Shift+\u2190');
  assert.equal(chordText('Control+Shift+ArrowDown'), 'Control+Shift+\u2193');
  assert.equal(chordText('Ctrl+B'), 'Ctrl+B');
  assert.equal(chordText('ArrowUp'), '\u2191');
  assert.equal(chordText(undefined), undefined);
  assert.equal(chordText('Ctrl+Alt+O'), 'Ctrl+Alt+O');
});

ok('the number pad\'s minus is a key of its own: Ctrl and it an en dash, Ctrl and the main minus the zoom', () => {
  assert.equal(matches('Ctrl+NumpadSubtract', ev('-', { ctrl: true, code: 'NumpadSubtract' }), false), true);
  assert.equal(matches('Ctrl+NumpadSubtract', ev('-', { ctrl: true, code: 'Minus' }), false), false);
  assert.equal(matches('Ctrl+Alt+NumpadSubtract', ev('-', { ctrl: true, alt: true, code: 'NumpadSubtract' }), false), true);
  // Alt and the pad's 5 with Num Lock off: the Clear key
  assert.equal(matches('Alt+Clear', ev('Clear', { alt: true, code: 'Numpad5' }), false), true);
  assert.equal(chordText('Ctrl+NumpadSubtract'), 'Ctrl+Num -');
});

ok('Alt+Shift and a digit (Word\'s outline levels): by the key\'s place, but never AltGr\'s sign', () => {
  assert.equal(matches('Alt+Shift+1', ev('!', { alt: true, shift: true, code: 'Digit1' }), false), true);
  assert.equal(matches('Alt+Shift+1', ev('1', { alt: true, shift: true, code: 'Digit1' }), false), true);
  assert.equal(matches('Alt+Shift+1', ev('!', { alt: true, shift: true, code: 'Digit1', altgr: true }), false), false);
  assert.equal(matches('Ctrl+Alt+Shift+1', ev('!', { ctrl: true, alt: true, shift: true, code: 'Digit1' }), false), false);
  // a Mac's own: Control+Shift and the digit
  assert.equal(matches('Control+Shift+3', ev('#', { ctrl: true, shift: true, code: 'Digit3' }), true), true);
});

ok('the signs of Word\'s accent keys, as typed', () => {
  assert.equal(matches('Ctrl+\'', ev('\'', { ctrl: true, code: 'Quote' }), false), true);
  assert.equal(matches('Ctrl+Shift+^', ev('^', { ctrl: true, shift: true, code: 'Digit6' }), false), true);
  assert.equal(matches('Ctrl+Shift+:', ev(':', { ctrl: true, shift: true, code: 'Semicolon' }), false), true);
  assert.equal(matches('Ctrl+Alt+Shift+?', ev('?', { ctrl: true, alt: true, shift: true, code: 'Slash' }), false), true);
  // AltGr's ? (Ctrl+Alt with the AltGraph state) is typed
  assert.equal(matches('Ctrl+Alt+Shift+?', ev('?', { ctrl: true, alt: true, shift: true, code: 'Slash', altgr: true }), false), false);
});

ok('a chord as a Mac writes it: the signs in Apple\'s order, then the key', () => {
  assert.equal(keyLabel('Ctrl+B', true), '\u2318B');
  assert.equal(keyLabel('Ctrl+Alt+1', true), '\u2325\u23181');
  assert.equal(keyLabel('Control+Shift+ArrowLeft', true), '\u2303\u21e7\u2190');
  assert.equal(keyLabel('Ctrl+Shift+Enter', true), '\u21e7\u2318\u21a9');
  assert.equal(keyLabel('Ctrl+Control+V', true), '\u2303\u2318V');
  assert.equal(keyLabel('F7', true), 'F7');
  assert.equal(keyLabel('Ctrl+B', false), 'Ctrl+B');
  assert.equal(keyLabel('Alt+Shift+ArrowUp', false), 'Alt+Shift+\u2191');
  assert.equal(keysInText('Ctrl+Alt+0 is Normal; Ctrl+, and Ctrl+. too (Shift+F12).', true), '\u2325\u23180 is Normal; \u2318, and \u2318. too (\u21e7F12).');
  assert.equal(keysInText('Ctrl+Alt+0 is Normal', false), 'Ctrl+Alt+0 is Normal');
});

ok('a tooltip names the command\'s key as this computer has it, once', () => {
  const bold = { title: 'Bold (Ctrl+B)', keys: ['Ctrl+B'] };
  assert.equal(keyTitle(bold, 'Bold', false), 'Bold (Ctrl+B)');
  assert.equal(keyTitle(bold, 'Bold', true), 'Bold (\u2318B)');
  // a Mac's own chord in place of the one the title names
  assert.equal(keyTitle({ title: 'Go To (Ctrl+G)', keys: ['Ctrl+G'], mac: { 'Ctrl+G': 'Ctrl+Alt+G' } }, 'Go To', true), 'Go To (\u2325\u2318G)');
  // a title naming no key gets the first; a chord is never the start of a longer one
  assert.equal(keyTitle({ title: 'Center', keys: ['Ctrl+E'] }, 'Center', false), 'Center (Ctrl+E)');
  assert.equal(keyTitle({ title: 'Ctrl+Enter breaks the page; Ctrl+E centres', keys: ['Ctrl+E'] }, 'x', true), '\u2318\u21a9 breaks the page; \u2318E centres');
  // the keys of a Mac alone: shown there first after the others, bound there only
  const c = { title: 'Spelling (F7)', keys: ['F7'], keysMac: ['Ctrl+Alt+L'] };
  assert.deepEqual(chordsOf(c, true), ['F7', 'Ctrl+Alt+L']);
  assert.deepEqual(chordsOf(c, false), ['F7']);
  assert.equal(firstKey({ keys: ['Ctrl+]', 'Ctrl+Shift+>'], mac: { 'Ctrl+]': false } }, true), '\u21e7\u2318>');
  assert.equal(firstKey({ name: 'x' }, false), undefined);
});

ok('a Mac\'s own keys are bound on a Mac alone', () => {
  register({ id: 't-m', name: 'M', keys: ['Ctrl+Alt+Shift+F9'], keysMac: ['Ctrl+Alt+Shift+J'] });
  try {
    assert.ok(bindings(true).some((b) => b.id === 't-m' && b.chord === 'Ctrl+Alt+Shift+J'));
    assert.ok(!bindings(false).some((b) => b.id === 't-m' && b.chord === 'Ctrl+Alt+Shift+J'));
    assert.deepEqual(lookup(ev('J', { meta: true, alt: true, shift: true, code: 'KeyJ' }), { mac: true, scope: 'page', can: (id) => id === 't-m' }), { hit: true, id: 't-m' });
  } finally { unregister('t-m'); }
});

ok('the keys the browser keeps: each a chord, its Word name and what to use, for one system or both', () => {
  for (const k of KEPT) { parseChord(k.keys); assert.ok(k.word && k.here && (!k.only || ['mac', 'win'].includes(k.only)), k.keys); }
  for (const k of ['Ctrl+N', 'Ctrl+W', 'Ctrl+T', 'F6', 'F12', 'Ctrl+=']) assert.ok(KEPT.some((x) => x.keys === k), k);
});

ok('a French keyboard: Ctrl and the 1 key (&) is Ctrl+1, the 4 key (\') no accent key; Ctrl+Shift and 1 there is no Ctrl+Shift+&', () => {
  assert.equal(matches('Ctrl+1', ev('&', { ctrl: true, code: 'Digit1' }), false), true);
  assert.equal(matches('Ctrl+Shift+&', ev('&', { ctrl: true, code: 'Digit1' }), false), false);
  assert.equal(matches('Ctrl+\'', ev('\'', { ctrl: true, code: 'Digit4' }), false), false);
  assert.equal(matches('Ctrl+5', ev('(', { ctrl: true, code: 'Digit5' }), false), true);
  // a US keyboard as before: Ctrl+Shift+7 is &, Ctrl+' the quote key
  assert.equal(matches('Ctrl+Shift+&', ev('&', { ctrl: true, shift: true, code: 'Digit7' }), false), true);
  assert.equal(matches('Ctrl+\'', ev('\'', { ctrl: true, code: 'Quote' }), false), true);
  // and no layout's Ctrl and a digit key runs two commands, or an accent key (the review's layouts)
  const L = { US: '1234567890', FR: '&\u00e9"\'(-\u00e8_\u00e7\u00e0', DE: '1234567890', ES: '1234567890' };
  for (const [name, keys] of Object.entries(L)) [...keys].forEach((ch, i) => {
    const d = String((i + 1) % 10), e = ev(ch, { ctrl: true, code: 'Digit' + d });
    const hit = [...new Set(bindings(false).filter((b) => matches(b.k, e, false)).map((b) => b.id))];
    assert.ok(hit.length <= 1 && !hit.some((h) => /^accent-/.test(h)), name + ' Ctrl+' + d + ': ' + hit);
    if (['1', '2', '5'].includes(d)) assert.deepEqual(hit, ['line-spacing-' + (d === '5' ? '15' : d)], name + ' Ctrl+' + d);
  });
});

ok('on a Mac no key is Option (with or without Shift) and a character key alone: that types a character there (Ø, ¡, ≈)', () => {
  const bad = bindings(true).filter((b) => b.k.alt && !b.k.mod && !b.k.control && !b.k.named).map((b) => b.id + ' ' + b.chord);
  assert.deepEqual(bad, []);
});

console.log('keys: ' + n + ' groups of checks passed');
