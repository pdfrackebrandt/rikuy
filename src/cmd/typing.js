// Word's keys that type or move text and have no button of their own: Alt+X (a character's code
// and back), the accent keys (Ctrl+' then e types é, as Word's international characters do), the
// Spike (Ctrl+F3 gathers cut pieces, Ctrl+Shift+F3 puts them all in), and F2 and Shift+F2 (move
// or copy the selection to where the caret is put next, then Enter). Each edit is one commit, so
// one undo. The rest of Word's keys live with the commands they run (docs/handoff/SHORTCUTS.md).

import { register, onInsertText, onInstall } from '../commands.js';

const WHY = 'Put the caret in the text first.';
const textAt = (app, at) => !!at && !at.c.ghost && !app.armed;
const selAt = (app, at) => textAt(app, at) && !at.c.collapsed;

// ---- Alt+X ----------------------------------------------------------------------------------------
// a code point Alt+X may write: a character Unicode has given, not a control character, half of a
// pair or one for private use (so "caf00e9" reads 00e9, not the private F00E9)
const okCode = (n) => Number.isInteger(n) && n >= 0x20 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) && !/^[\p{Cc}\p{Cn}\p{Co}]$/u.test(String.fromCodePoint(n));
// the characters the source writes with a backslash, read back as the one they stand for
const ESCAPED = /\\([%&#$_{}])$/;
const MARKUP = /[\\{}$&#^_%~]/;

// What Alt+X does at the source's place p (the caret) or over [a, b) (a selection), on src:
// { s, e, ch } to write the character ch over [s, e), { s, e, code } to write its code, or null.
// The hex digits before the caret become their character (00e9 → é, U+00E9 too, up to six
// digits, the longest that is a character); without them, the character before the caret its
// code (é → 00E9), as Word's ToggleCharacterCode.
export function unicodeToggle(src, a, b) {
  if (b > a) {
    const t = src.slice(a, b);
    const m = /^(?:[Uu]\+)?([0-9A-Fa-f]{1,6})$/.exec(t);
    if (m && okCode(parseInt(m[1], 16))) return { s: a, e: b, ch: String.fromCodePoint(parseInt(m[1], 16)) };
    const cp = [...t];
    if (cp.length === 1 && !MARKUP.test(t)) return { s: a, e: b, code: hex(t.codePointAt(0)) };
    return null;
  }
  const p = a;
  const run = /([0-9A-Fa-f]{1,6})$/.exec(src.slice(Math.max(0, p - 6), p));
  if (run) {
    const digits = run[1];
    for (let n = digits.length; n >= 1; n--) {
      const s = p - n, code = parseInt(digits.slice(-n), 16);
      // (not the end of a command's name: \bf, \ae)
      if (/\\[A-Za-z]*$/.test(src.slice(Math.max(0, s - 40), s))) continue;
      if (!okCode(code)) continue;
      const u = /[Uu]\+$/.test(src.slice(Math.max(0, s - 2), s)) ? 2 : 0;
      return { s: s - u, e: p, ch: String.fromCodePoint(code) };
    }
  }
  const esc = ESCAPED.exec(src.slice(Math.max(0, p - 2), p));
  if (esc) return { s: p - 2, e: p, code: hex(esc[1].codePointAt(0)) };
  if (src[p - 1] === '~') return { s: p - 1, e: p, code: '00A0' };
  const before = src.slice(Math.max(0, p - 2), p);
  const ch = [...before].pop();
  if (!ch || MARKUP.test(ch) || /\s/.test(ch) || /\\[A-Za-z]*$/.test(src.slice(Math.max(0, p - 40), p))) return null;
  return { s: p - ch.length, e: p, code: hex(ch.codePointAt(0)) };
}
const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');

// how many { are open at p, from the start of its paragraph (escaped braces and comments aside)
export function openBraces(src, p) {
  const s0 = src.lastIndexOf('\n\n', p - 1);
  let d = 0;
  for (let i = s0 < 0 ? 0 : s0; i < p; i++) {
    const ch = src[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '%') { while (i < p && src[i] !== '\n') i++; continue; }
    if (ch === '{') d++;
    else if (ch === '}') d = Math.max(0, d - 1);
  }
  return d;
}

// what F2 and Shift+F2 say while they wait
const MOVE_ASK = ['Move to where? Put the caret there with the arrow keys and press Enter; Escape cancels.', 'Copy to where? Put the caret there with the arrow keys and press Enter; Escape cancels.'];

// ---- the accent keys ------------------------------------------------------------------------------
// Word's international characters: a key, then the letter. Each: the combining mark, and the
// letters Word makes otherwise (Ctrl+' then d is ð; Ctrl+Shift+& then a is æ, o œ, s ß).
const ACCENTS = {
  grave: { mark: '̀' },
  acute: { mark: '́', more: { d: 'ð', D: 'Ð' } },
  circumflex: { mark: '̂' },
  tilde: { mark: '̃' },
  umlaut: { mark: '̈' },
  ring: { mark: '̊' },
  ligature: { more: { a: 'æ', A: 'Æ', o: 'œ', O: 'Œ', s: 'ß' } },
  slash: { more: { o: 'ø', O: 'Ø' } }
};
// the letter as the accent key makes it, or null where Word makes none (the letter is typed as it is)
export function accented(kind, ch) {
  const A = ACCENTS[kind];
  if (!A || typeof ch !== 'string' || [...ch].length !== 1) return null;
  if (A.more && A.more[ch]) return A.more[ch];
  if (!A.mark || !/\p{L}/u.test(ch)) return null;
  const t = (ch + A.mark).normalize('NFC');
  return [...t].length === 1 ? t : null;
}
const accent = (kind, name, key, what) => ({
  id: 'accent-' + kind, name, keys: [key], mac: { [key]: false },
  title: name + ' (' + key + ', then the letter): ' + what, synonyms: ['Accent', 'International characters', 'Dead key'],
  when: textAt, whyNot: () => WHY, run: (app) => { app.accentNext = kind; return true; }
});

register(
  { id: 'unicode-toggle', name: 'Character Code', title: 'Character Code (Alt+X): the hex code before the caret as its character (00e9 or U+00E9 becomes é), or the character before the caret as its code',
    keys: ['Alt+X'], mac: { 'Alt+X': 'Control+Alt+X' }, synonyms: ['Unicode', 'Toggle character code', 'Hex code', 'Code point', 'Alt+X'],
    when: textAt, whyNot: () => WHY, run: (app, args, at) => app.unicodeToggleAt(at) },
  // (on a Mac the Option keys type accents themselves: Option+E then e is é)
  accent('grave', 'Grave Accent', 'Ctrl+`', 'à è ì ò ù'),
  accent('acute', 'Acute Accent', 'Ctrl+\'', 'á é í ó ú ý, and ð'),
  accent('circumflex', 'Circumflex', 'Ctrl+Shift+^', 'â ê î ô û'),
  accent('tilde', 'Tilde Accent', 'Ctrl+Shift+~', 'ã ñ õ'),
  accent('umlaut', 'Umlaut', 'Ctrl+Shift+:', 'ä ë ï ö ü ÿ'),
  accent('ring', 'Ring Accent', 'Ctrl+Shift+@', 'å'),
  accent('ligature', 'Ligature', 'Ctrl+Shift+&', 'æ œ ß'),
  accent('slash', 'Slashed Letter', 'Ctrl+/', 'ø'),
  { id: 'insert-iquest', name: 'Inverted Question Mark', title: 'Inverted Question Mark: ¿ (Ctrl+Alt+Shift+?)', keys: ['Ctrl+Alt+Shift+?'], mac: { 'Ctrl+Alt+Shift+?': false }, synonyms: ['¿', 'Spanish question mark'],
    when: textAt, whyNot: () => WHY, run: (app) => app.insertText('¿') },
  { id: 'insert-iexcl', name: 'Inverted Exclamation Mark', title: 'Inverted Exclamation Mark: ¡ (Ctrl+Alt+Shift+!)', keys: ['Ctrl+Alt+Shift+!'], mac: { 'Ctrl+Alt+Shift+!': false }, synonyms: ['¡', 'Spanish exclamation mark'],
    when: textAt, whyNot: () => WHY, run: (app) => app.insertText('¡') },

  // the Spike: cut pieces gathered, then put in together (and the Spike emptied), as Word's
  { id: 'spike', name: 'Spike', title: 'Spike (Ctrl+F3): cut the selection and add it to the Spike; Ctrl+Shift+F3 puts in all it holds, in order', synonyms: ['Cut to Spike', 'Collect', 'Gather'],
    keys: ['Ctrl+F3'], when: selAt, whyNot: () => 'Select the text to add to the Spike first.', run: (app) => app.spikeCut() },
  { id: 'spike-insert', name: 'Insert Spike', title: 'Insert Spike (Ctrl+Shift+F3): everything cut to the Spike, each piece a paragraph, and the Spike empty again', synonyms: ['Paste Spike', 'Spike contents'],
    keys: ['Ctrl+Shift+F3'], when: (app, at) => textAt(app, at) && !!(app.spikeItems && app.spikeItems.length), whyNot: (app) => (app.spikeItems && app.spikeItems.length ? WHY : 'The Spike is empty: Ctrl+F3 cuts the selection to it.'), run: (app) => app.spikeInsert() },

  // F2 and Shift+F2: the selection moved (copied) to the place the caret is put next, with Enter
  { id: 'move-text', name: 'Move Text', title: 'Move Text (F2): put the caret where the selected text goes, then press Enter; Escape leaves it', synonyms: ['Move selection', 'Move to'],
    keys: ['F2'], when: selAt, whyNot: () => 'Select the text to move first.', run: (app) => app.moveTextArm(false) },
  { id: 'copy-text', name: 'Copy Text', title: 'Copy Text (Shift+F2): put the caret where a copy of the selected text goes, then press Enter; Escape leaves it', synonyms: ['Copy selection', 'Copy to'],
    keys: ['Shift+F2'], when: selAt, whyNot: () => 'Select the text to copy first.', run: (app) => app.moveTextArm(true) }
);

export const methods = {
  unicodeToggleAt(at) {
    const c = at && at.c;
    if (!c || c.ghost) return false;
    const r = unicodeToggle(this.src(c.f), c.a, c.collapsed ? c.a : c.b);
    if (!r) { this.toast('Put the caret after a character, or after its code (00e9).'); return false; }
    const t = r.ch != null ? this.escapeAt(c.f, r.s, r.ch) : r.code;
    this.commit([{ f: c.f, s: r.s, e: r.e, t }], { f: c.f, p: r.s + t.length, bias: -1 }, 'replace');
    this.closeGroup();
    return true;
  },

  spikeCut() {
    const kept = this.lastCopy;
    this.lastCopy = null;
    // (the page's own cut: the LaTeX of the selection, then the same deletion as Ctrl+X)
    try { this.onCopy({ preventDefault() {}, clipboardData: { setData() {} } }, true); } finally { const got = this.lastCopy; this.lastCopy = kept; if (got) (this.spikeItems || (this.spikeItems = [])).push(got); }
    return true;
  },
  spikeInsert() {
    const items = this.spikeItems || [];
    if (!items.length) return false;
    this.spikeItems = [];
    // (each piece a paragraph, as Word's; inside a command's argument, a heading's or a cell's, a
    // paragraph break would end it: there the pieces join with a space)
    const c = this.caretNow(), inArg = !!c && !c.ghost && openBraces(this.src(c.f), c.a) > 0;
    this.pasteData({ plain: items.map((x) => x.plain).join(inArg ? ' ' : '\n'), latex: items.map((x) => x.latex).join(inArg ? ' ' : '\n\n'), html: '' }, 'keep');
    return true;
  },

  moveTextArm(copy) {
    // (what a drag of the selection would carry: its LaTeX and the formatting around it)
    const was = this.dragMove;
    const ok = this.dragMoveStart({ dataTransfer: { setData() {} } });
    const M = this.dragMove;
    this.dragMove = was;
    if (!ok || !M) return false;
    this.moveText = { M, copy };
    // (said for as long as it waits: a toast that went away left Enter taken with nothing on screen)
    this.toast(MOVE_ASK[copy ? 1 : 0], 3600000, { label: 'Cancel', fn: () => this.moveTextEnd() });
    return true;
  },
  // F2's waiting ends: Escape, a click, any key but the caret's own, an edit
  moveTextEnd() {
    if (!this.moveText) return;
    this.moveText = null;
    const t = document.getElementById('toast');
    if (t && MOVE_ASK.some((x) => t.textContent.startsWith(x))) t.hidden = true;
  },
  // Enter after F2: the text moved (copied) to the caret; false where it could not be (the text
  // changed meanwhile, another file, the caret inside it), and Enter is then Enter
  moveTextDrop() {
    const A = this.moveText;
    this.moveTextEnd();
    const c = this.caretNow();
    if (!A || !c || c.ghost || this.src(A.M.f) !== A.M.src) return false;
    return !!this.moveSource(A.M, { f: c.f, p: c.a }, A.copy);
  }
};

// the letter after an accent key, made accented (Word types the letter as it is where it makes none)
onInsertText((app, data) => {
  const kind = app.accentNext;
  if (!kind) return;
  app.accentNext = null;
  return accented(kind, data) || undefined;
});

const NAV = /^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/;
onInstall((app) => {
  // Enter ends F2's move; Escape, any key but the caret's own, a click or an edit ends it. An
  // accent key waits for the next letter: any other key or a click ends that.
  app.root.addEventListener('keydown', (e) => {
    if (/^(Shift|Control|Alt|Meta|AltGraph|CapsLock)$/.test(e.key) || e.isComposing) return;
    if (app.accentNext && (e.key.length !== 1 || e.ctrlKey || e.metaKey)) app.accentNext = null;
    if (!app.moveText) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (app.moveTextDrop()) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (!NAV.test(e.key)) app.moveTextEnd();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    app.accentNext = null;
    // (the toast's own Cancel ends it too, by its click)
    if (app.moveText && !(e.target.closest && e.target.closest('#toast'))) app.moveTextEnd();
  }, true);
  // (an edit from anywhere, the ribbon's or an agent's: what F2 took is no longer the text)
  const commit = app.commit;
  app.commit = function (...a) { if (this.moveText) this.moveTextEnd(); return commit.apply(this, a); };
});
