// The keys: chords of the command registry (src/commands.js, each command's keys) matched against
// keydown events. Ctrl means Cmd on a Mac unless said; Control is the Control key itself (for a
// Mac's own chord). A chord is caught only where it belongs: a command's keys act with the caret
// on the page (keyScope 'page', the default), or anywhere but a field, the source pane or the
// PDF ('app'). Ctrl+Alt chords give way to AltGr: on a German keyboard AltGr+2 types ² and
// AltGr+0 types }, and Windows reports AltGr as Ctrl+Alt. Nothing is caught while an input
// method composes. The pure part (parse, match) is tested in test/keys.test.mjs.

import { commands, enabled } from './commands.js';

const NAMED = new Set(['Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ContextMenu', 'Insert']);

// 'Ctrl+Alt+1' -> { mod, control, alt, shift, key }
export function parseChord(s) {
  const parts = String(s).split('+');
  // a chord on the plus key itself: 'Ctrl++'
  if (parts.length > 1 && parts[parts.length - 1] === '' && parts[parts.length - 2] === '') { parts.splice(-2, 2, '+'); }
  const k = { mod: false, control: false, alt: false, shift: false, key: '' };
  for (const [i, p] of parts.entries()) {
    if (i < parts.length - 1) {
      if (p === 'Ctrl' || p === 'Cmd') k.mod = true;
      else if (p === 'Control') k.control = true;
      else if (p === 'Alt' || p === 'Option') k.alt = true;
      else if (p === 'Shift') k.shift = true;
      else throw new Error('Unknown modifier ' + p + ' in ' + s);
    } else k.key = p;
  }
  if (!k.key) throw new Error('No key in ' + s);
  if (/^F([1-9]|1[0-2])$/.test(k.key) || NAMED.has(k.key)) k.named = true;
  else if (k.key.length !== 1) throw new Error('Unknown key ' + k.key + ' in ' + s);
  return k;
}

// the chord a binding has on this system: a Mac may have its own or none (null)
export function chordFor(chord, mac, rules) {
  if (!mac || !rules || !(chord in rules)) return chord;
  return rules[chord] === false ? null : rules[chord];
}

// the key an event names, as a chord writes it
function eventKey(e) {
  if (e.key === ' ' || e.key === 'Spacebar') return 'Space';
  if (e.key === 'Apps') return 'ContextMenu';
  return e.key;
}

// Whether a keydown event is this chord. mac: the primary modifier is Cmd (metaKey).
export function matches(k, e, mac) {
  if (typeof k === 'string') k = parseChord(k);
  if (!e || e.isComposing || e.keyCode === 229) return false;
  const primary = mac ? !!e.metaKey : !!e.ctrlKey;
  // on a Mac the Control key is its own modifier; elsewhere Ctrl is the primary one and Meta (the
  // Windows key) belongs to the system
  const control = mac ? !!e.ctrlKey : false;
  const meta = mac ? false : !!e.metaKey;
  if (primary !== k.mod || control !== k.control || !!e.altKey !== k.alt || meta) return false;
  // AltGr: Windows reports it as Ctrl+Alt, and the character it typed is no chord
  if (k.mod && k.alt && e.getModifierState && e.getModifierState('AltGraph')) return false;
  const key = eventKey(e);
  if (k.named) return key === k.key && !!e.shiftKey === k.shift;
  const want = k.key.toLowerCase();
  // (a Mac's Option types a character of its own, œ for Option+Q, ¡ for Option+1: there the
  // key's place says which key it was; a Mac has no AltGr to tell apart)
  const macAlt = mac && k.alt;
  if (/^[a-z]$/.test(want)) return (key.toLowerCase() === want || (macAlt && e.code === 'Key' + want.toUpperCase())) && !!e.shiftKey === k.shift;
  if (/^[0-9]$/.test(want)) {
    if (key === want || (macAlt && e.code === 'Digit' + want)) return !!e.shiftKey === k.shift;
    // Shift with a digit types a sign on most keyboards: the key's place says which digit (not
    // with Alt, where the sign may be AltGr's)
    return k.shift && !!e.shiftKey && !k.alt && e.code === 'Digit' + want;
  }
  // a sign: as typed, Shift or not (Ctrl+Shift+> is Shift and . on a US keyboard, a key of its own elsewhere)
  return key === k.key && (k.shift || !e.shiftKey || !/^[a-z0-9]$/i.test(key));
}

// How a chord is written in a tooltip, a menu or the search box: as the registry has it, its
// arrow keys as arrows, as Word writes them (Alt+Shift+←). Ctrl is Cmd on a Mac, which Help says
// once. (controls.json and llms.txt keep the registry's own names: an agent presses them.)
const SHOWN = { ArrowLeft: '\u2190', ArrowRight: '\u2192', ArrowUp: '\u2191', ArrowDown: '\u2193' };
export const chordText = (s) => s == null ? s : String(s).replace(/(^|\+)(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/, (m, a, k) => a + SHOWN[k]);

// The bindings of every registered command: [{ chord, k, id, scope, rank }]
export function bindings(mac) {
  const out = [];
  for (const c of commands()) {
    for (const chord of [...(c.keys || []), ...(c.keysQuiet || [])]) {
      const on = chordFor(chord, mac, c.mac);
      if (!on) continue;
      out.push({ chord: on, k: parseChord(on), id: c.id, scope: c.keyScope || 'page', rank: c.keyRank || 0 });
    }
  }
  return out;
}

// The command a keydown event asks for here: of the bindings that match, those of this scope
// whose command can run, the highest rank first. hit says whether any binding matched at all
// (the browser's own use of the chord is then held back too).
export function lookup(e, o) {
  const { mac, scope, can } = o;
  const hit = bindings(mac).filter((b) => (scope === 'page' || b.scope === 'app') && matches(b.k, e, mac));
  if (!hit.length) return { hit: false, id: null };
  const ok = hit.filter((b) => can(b.id)).sort((a, b) => b.rank - a.rank);
  return { hit: true, id: ok.length ? ok[0].id : null };
}

// where a key is someone's own typing: a field, the source pane, the PDF, a math field
const OWN = 'input, textarea, select, math-field, [contenteditable="true"]:not(#pages), .CodeMirror, #pdfpane';

// The keys on the page, and the app's keys everywhere else (not in a field). Runs before the
// page's own handlers (App.onKeyDown): a chord taken here goes no further.
export function installKeys(app, mac, runCmd) {
  const go = (e, scope) => {
    if (e.defaultPrevented || app.composing) return;
    // (a quick filter: no modifier and no function or menu key is never a chord here)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !/^F\d|^ContextMenu$|^Apps$/.test(e.key) && !(e.shiftKey && e.key === 'F10')) return;
    const at = scope === 'page' ? app.ribbonAt() : null;
    const r = lookup(e, { mac, scope, can: (id) => enabled(app, id, at) || (scope !== 'page' && enabled(app, id, app.ribbonAt())) });
    if (!r.hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (r.id) runCmd(r.id, at);
  };
  app.root.addEventListener('keydown', (e) => go(e, 'page'), true);
  document.addEventListener('keydown', (e) => {
    if (e.target === app.root || (app.root.contains && app.root.contains(e.target))) return;
    // (a field types nothing on Ctrl and a function key: Ctrl+F1 folds the ribbon from it too)
    if (e.target && e.target.closest && e.target.closest(OWN) && !((e.ctrlKey || e.metaKey) && /^F\d+$/.test(e.key))) return;
    go(e, 'app');
  }, true);
}
