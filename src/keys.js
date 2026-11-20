// The keys: chords of the command registry (src/commands.js, each command's keys) matched against
// keydown events. Ctrl means Cmd on a Mac unless said; Control is the Control key itself (for a
// Mac's own chord). A chord is caught only where it belongs: a command's keys act with the caret
// on the page (keyScope 'page', the default), or anywhere but a field, the source pane or the
// PDF ('app'). Ctrl+Alt chords give way to AltGr: on a German keyboard AltGr+2 types ² and
// AltGr+0 types }, and Windows reports AltGr as Ctrl+Alt. Nothing is caught while an input
// method composes. The pure part (parse, match) is tested in test/keys.test.mjs.

import { commands, enabled } from './commands.js';

const NAMED = new Set(['Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ContextMenu', 'Insert', 'Clear']);
// keys of the number pad, told from the main keyboard's by their place (Word's Ctrl and the pad's
// minus is an en dash, Ctrl and the main minus zooms here)
const PAD = new Set(['NumpadSubtract', 'NumpadAdd']);

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
  if (PAD.has(k.key)) { k.named = true; k.pad = true; }
  else if (/^F([1-9]|1[0-2])$/.test(k.key) || NAMED.has(k.key)) k.named = true;
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
  if (k.pad) return e.code === k.key && !!e.shiftKey === k.shift;
  if (k.named) return key === k.key && !!e.shiftKey === k.shift;
  const want = k.key.toLowerCase();
  // (a Mac's Option types a character of its own, œ for Option+Q, ¡ for Option+1: there the
  // key's place says which key it was; a Mac has no AltGr to tell apart)
  const macAlt = mac && k.alt;
  if (/^[a-z]$/.test(want)) return (key.toLowerCase() === want || (macAlt && e.code === 'Key' + want.toUpperCase())) && !!e.shiftKey === k.shift;
  if (/^[0-9]$/.test(want)) {
    if (key === want || (macAlt && e.code === 'Digit' + want)) return !!e.shiftKey === k.shift;
    // the digit key itself where it types a sign without Shift, as on a French keyboard (Ctrl and
    // the 1 key, & there, is Ctrl+1: Word reads the key, not its character)
    if (!k.shift && !e.shiftKey && !k.alt && e.code === 'Digit' + want) return true;
    // Shift with a digit types a sign on most keyboards: the key's place says which digit (not
    // with Ctrl+Alt or AltGr, where the sign may be AltGr's; Alt+Shift+1, Word's outline level,
    // is Alt alone)
    const altgr = k.alt && (k.mod || (e.getModifierState && e.getModifierState('AltGraph')));
    return k.shift && !!e.shiftKey && !altgr && e.code === 'Digit' + want;
  }
  // a sign: as typed, Shift or not (Ctrl+Shift+> is Shift and . on a US keyboard, a key of its own
  // elsewhere); never a digit key without Shift, which is that digit's chord (& and ' are the 1 and
  // 4 keys on a French keyboard: Ctrl and them is Ctrl+1 and Ctrl+4, no accent key)
  if (/^Digit/.test(e.code || '') && !e.shiftKey) return false;
  return key === k.key && (k.shift || !e.shiftKey || !/^[a-z0-9]$/i.test(key));
}

// How a chord is written in a tooltip, a menu or the search box: as the registry has it, its
// arrow keys as arrows, as Word writes them (Alt+Shift+←). (controls.json and llms.txt keep the
// registry's own names: an agent presses them.)
const SHOWN = { ArrowLeft: '\u2190', ArrowRight: '\u2192', ArrowUp: '\u2191', ArrowDown: '\u2193', NumpadSubtract: 'Num -', NumpadAdd: 'Num +', Clear: 'Num 5' };
export const chordText = (s) => s == null ? s : String(s).replace(/(^|\+)(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|NumpadSubtract|NumpadAdd|Clear)$/, (m, a, k) => a + SHOWN[k]);

// On a Mac a chord is written as Word for Mac and every Mac menu writes it: the modifiers' signs
// in Apple's order (Control, Option, Shift, Command), then the key: ⌥⌘1, ⌃⇧←, ⌘↩.
const MAC_KEY = { ...SHOWN, Enter: '\u21a9', Backspace: '\u232b', Delete: '\u2326', Escape: '\u238b', Tab: '\u21e5', PageUp: 'Page Up', PageDown: 'Page Down', ContextMenu: 'Menu' };
export function keyLabel(chord, mac) {
  if (chord == null || !mac) return chordText(chord);
  const k = parseChord(chord);
  const key = MAC_KEY[k.key] || (k.key.length === 1 ? k.key.toUpperCase() : k.key);
  return (k.control ? '\u2303' : '') + (k.alt ? '\u2325' : '') + (k.shift ? '\u21e7' : '') + (k.mod ? '\u2318' : '') + key;
}

// whether this browser runs on a Mac (or an iPad with a keyboard): there Ctrl is Cmd
export const macUA = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

// A command's chords as this computer has them, the first one the one to show: its keys with a
// Mac's own rules, a Mac's own keys (keysMac), then those caught elsewhere (keysElsewhere)
export function chordsOf(c, mac) {
  const out = [];
  for (const k of c.keys || []) { const on = chordFor(k, mac, c.mac); if (on) out.push(on); }
  if (mac) out.push(...(c.keysMac || []));
  for (const k of c.keysElsewhere || []) { const on = chordFor(k, mac, c.mac); if (on) out.push(on); }
  return out;
}
// the first of them as people read it, or undefined
export const firstKey = (c, mac) => { const k = chordsOf(c, mac)[0]; return k == null ? undefined : keyLabel(k, mac); };

// A control's tooltip: the command's title with its keys as this computer has them (a title
// names its first chord, "Bold (Ctrl+B)": on a Mac that reads "Bold (⌘B)"), or the first key
// added where the title does not name one, as Word's tooltips do.
export function keyTitle(c, name, mac) {
  let t = c.title || name || c.name;
  const all = [...(c.keys || []), ...(c.keysElsewhere || [])];
  let named = false;
  // (the longest chord first, "Ctrl+Shift+F5" before "Shift+F5"; a chord as a whole, so Ctrl+E
  // is never the start of Ctrl+Enter)
  for (const k of [...all].sort((a, b) => b.length - a.length)) {
    for (const form of new Set([chordText(k), k])) {
      const re = new RegExp(form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9])', 'g');
      if (!re.test(t)) continue;
      named = true;
      if (!mac) continue;
      const on = chordFor(k, mac, c.mac);
      if (on) t = t.replace(re, keyLabel(on, mac));
    }
  }
  // (on a Mac, the other keys the title names too, Ctrl as ⌘)
  if (!named) { const k = firstKey(c, mac); if (k) t += ' (' + k + ')'; }
  return keysInText(t, mac);
}

// The chords a sentence names ("Ctrl+Alt+0 is Normal"), written as this computer writes them: on a
// Mac with its signs (⌥⌘0), elsewhere as they are
const CHORD_IN_TEXT = /(?:(?:Ctrl|Cmd|Control|Alt|Option|Shift)\+)+(?:F1[0-2]|F[1-9]|Space|Enter|Tab|Home|End|PageUp|PageDown|Arrow(?:Left|Right|Up|Down)|[A-Za-z0-9](?![A-Za-z0-9])|[^\sA-Za-z0-9])/g;
export function keysInText(text, mac) {
  if (!mac) return text;
  return String(text).replace(CHORD_IN_TEXT, (m) => { try { return keyLabel(m, true); } catch (e) { return m; } });
}

// The bindings of every registered command: [{ chord, k, id, scope, rank }]
export function bindings(mac) {
  const out = [];
  for (const c of commands()) {
    const list = [...(c.keys || []), ...(c.keysQuiet || [])].map((chord) => chordFor(chord, mac, c.mac));
    if (mac) list.push(...(c.keysMac || []));
    for (const on of list) {
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
    // (a field types nothing with a function key: Ctrl+F1 folds the ribbon from it too, Alt+F9
    // leaves LaTeX Mode from the source; and the source types nothing with Ctrl+Alt but AltGr's
    // characters, which matches() leaves to it: Ctrl+Alt+P is Print Layout from it)
    const own = e.target && e.target.closest && e.target.closest(OWN);
    if (own && !/^F\d+$/.test(e.key) && !(own.matches('.CodeMirror, .CodeMirror *') && (e.ctrlKey || e.metaKey) && e.altKey)) return;
    go(e, 'app');
  }, true);
}

// Word's keys a browser or the system keeps for itself, or that mean something else here, with
// what to use instead: Help lists them (src/cmd/help.js), docs/handoff/SHORTCUTS.md has the whole
// table. keys as the registry writes them (Ctrl is Cmd on a Mac); only: 'mac' or 'win' for one
// system alone.
export const KEPT = [
  { keys: 'Ctrl+N', word: 'New document', here: 'The browser opens a window: File › Blank document, or New in the status bar. Rikuy installed as an app hears Ctrl+N itself.' },
  { keys: 'Ctrl+W', word: 'Close', here: 'The browser closes the tab. Rikuy installed as an app hears it: there Ctrl+W closes the source or the PDF pane when one is open.' },
  { keys: 'Ctrl+T', word: 'Hanging indent', here: 'A new browser tab: Hanging Indent in the search box, or Paragraph… › Special.' },
  { keys: 'Ctrl+Shift+N', word: 'Normal style', here: 'A private window in Chrome: Ctrl+Alt+0 is Normal.' },
  { keys: 'Ctrl+Shift+W', word: 'Underline words only', here: 'The browser closes the window; LaTeX has no such underline: Underline (Ctrl+U).' },
  { keys: 'Ctrl+Tab', word: 'A tab in a table cell', here: 'The browser\'s next tab; a LaTeX cell holds no tab character.', only: 'win' },
  { keys: 'Ctrl+PageDown', word: 'Next page', here: 'The browser\'s next tab: Go To (F5) a page, or the Navigation pane\'s Pages.', only: 'win' },
  { keys: 'Ctrl+F4', word: 'Close the document', here: 'The browser closes the tab.', only: 'win' },
  { keys: 'F5', word: 'Go To (Shift+F5 Go Back)', here: 'With the caret on the page, Go To and Go Back as in Word; anywhere else the browser reloads. Ctrl+R reloads from the page too, and Rikuy keeps the document either way.' },
  { keys: 'F6', word: 'Next pane', here: 'The browser\'s address bar: Ctrl+F6, as in Word for the web.' },
  { keys: 'F11', word: 'Next field', here: 'Full screen. The page keeps every field up to date: nothing to step through.' },
  { keys: 'F12', word: 'Save As', here: 'The browser\'s developer tools: Shift+F12 or Ctrl+S downloads the LaTeX.' },
  { keys: 'Ctrl+=', word: 'Subscript (Ctrl+Shift+= superscript)', here: 'Zoom, as on every page: subscript is Ctrl+, and superscript Ctrl+.' },
  { keys: 'Ctrl+M', word: 'Indent', here: 'A formula here: Increase Indent, or Tab in a list.', only: 'win' },
  { keys: 'Ctrl+M', word: 'Indent', here: 'The Mac\'s Minimize: Control+Shift+M indents, Control+= puts in an equation.', only: 'mac' },
  { keys: 'Ctrl+Alt+C', word: 'Copy formatting', here: '© here, as in older Word: Ctrl+Shift+C, the Format Painter, copies formatting.', only: 'win' },
  { keys: 'Ctrl+Space', word: 'Clear character formatting', here: 'Spotlight: Control+Space here.', only: 'mac' },
  { keys: 'Ctrl+[', word: 'Font size down', here: 'Back in the browser: Cmd+Shift+< (and Cmd+Shift+> up).', only: 'mac' },
  { keys: 'Ctrl+Alt+D', word: 'Endnote', here: 'The Dock: Cmd+Option+E, as Word for Mac.', only: 'mac' }
];
