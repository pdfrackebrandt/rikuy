// The keys (src/keys.js): chords read, matched against keydown events as Chromium, Firefox and
// Safari report them on Windows, Linux and a Mac; AltGr (Ctrl+Alt on Windows) never taken for a
// Ctrl+Alt chord; nothing while an input method composes; a Mac's own chords; the command a chord
// runs where two claim it.
import assert from 'node:assert/strict';
import { parseChord, matches, chordFor, lookup, bindings } from '../src/keys.js';
import { register, unregister } from '../src/commands.js';

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

console.log('keys: ' + n + ' groups of checks passed');
