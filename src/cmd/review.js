// Batch B10, Review: Word's Review tab over what Rikuy keeps.
//
// Proofing. Spelling is Hunspell (tex/build_tools.sh hunspell) in a worker (src/spell/), loaded
// the first time the page is checked, with the dictionaries of the languages the document is in.
// The words are the page's prose only (src/spell/words.js): never a command, a key, a label,
// math, code or an address. A word not in the dictionary gets a red wavy line (a CSS highlight,
// nothing in the page's text); the right click menu, a long press on a phone and the Spelling
// pane (F7) offer Hunspell's suggestions, Ignore Once, Ignore All and Add to Dictionary. Add to
// Dictionary writes the word on a `% rikuy: words …` line of the main file: the document's own
// list, so it travels with the .tex to a coauthor, to git and to Overleaf, which Word's
// dictionary on one computer does not (cspell's `% cspell:words` lines are read too). Ignore All
// is for this browser and this project only (Word keeps it with the document until Recheck
// Document); Ignore Once for this session. Without Hunspell (the artifact's copy, a browser
// without WebAssembly) the browser's own spelling stays on, as before.
//
// Tracking. Changes are the difference between the text and a base version (src/review.js).
// Track Changes on: the base stays where it was, so every edit is a change, marked on the page
// (Display for Review: Simple Markup, the bars; All Markup, insertions and deletions too; No
// Markup). Off: an edit moves the base along with it, so it is no change, and the changes already
// there stay to be accepted or rejected, as Word's do. Accept and Reject work on the change at
// the caret, all of them, and all and stop tracking; Previous and Next go from one to the next.
// Comments are the `% comment (Name): …` lines of src/collab.js: Delete, Delete All, Previous,
// Next, Show Comments. Word Count (Ctrl+Shift+G), Read Aloud (Ctrl+Alt+Space, the system's own
// voices) and Compare with a version or a .tex file complete the tab; the status bar says the
// proofing language and whether changes are tracked.

import { register, onInstall, onInsertText, command } from '../commands.js';
import { openMenu } from '../ui/kit.js';
import { $, mk, PREFS, store, setAttr, setProp } from '../ui/dom.js';
import { spellPlan, occSource, addWordEdit, DICT_NAME, mainLanguage, dictOf, proseRuns, asked } from '../spell/words.js';
import { SpellClient } from '../spell/client.js';
import { setMarks } from '../marks.js';
import { openSpellPane, spellPaneRefresh } from '../ui/spellpane.js';
import { openWordCount, setLanguageEdits } from '../ui/wordcount.js';
import { coreCanRun } from '../native.js';
import { findComments, commentOnly, safeCommentLine } from '../share.js';
import { spacingOnly } from '../diff.js';
import { kvGet, kvPut } from '../store.js';
// (places as [block of the page, file, offset], compared in that order)
const keyCmp = (a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || a[2] - b[2];

const SPELL = typeof __RIKUY_SPELL__ === 'undefined' ? null : __RIKUY_SPELL__;
const reviewOpen = () => document.body.classList.contains('nav-on');
const ICON = {
  spell: '<path d="M3.5 13.5 6.5 5l3 8.5M4.6 10.6h3.8M12 9.5l1.8 1.8L17 7.5"/>',
  count: '<path d="M3.5 6h13M3.5 10h13M3.5 14h8"/><path d="M14 13l1.5 1.5L18 12"/>',
  speak: '<path d="M4 8v4h3l4 3V5L7 8zM13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.3 6.3 0 0 1 0 9"/>',
  lang: '<path d="M3.5 10a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0M3.5 10h13M10 3.5c-2.4 2.6-2.4 10.4 0 13M10 3.5c2.4 2.6 2.4 10.4 0 13"/>',
  del: '<path d="M4 4.5h12v8H9.5L6 15.5v-3H4zM8 6.8l4 3.4M12 6.8l-4 3.4"/>',
  prev: '<path d="M12.5 5 7.5 10l5 5"/>',
  next: '<path d="M7.5 5l5 5-5 5"/>',
  show: '<path d="M4 4.5h12v8H9.5L6 15.5v-3H4zM7 8.5h6"/>',
  track: '<path d="M4 15.5 13.5 6l2 2L6 17.5H4zM12 7.5l2 2M10 15.5h6"/>',
  display: '<path d="M3.5 4.5h13v11h-13zM6 8h8M6 11h5"/><path d="M15 10.5v4" stroke-width="2"/>',
  markup: '<path d="M4 6h8M4 10h10M4 14h6"/><path d="M15.5 4v12" stroke-width="2"/>',
  accept: '<path d="M4 6h8M4 10h5M4 14h4"/><path d="M11 13l2 2 4-4.5"/>',
  reject: '<path d="M4 6h8M4 10h5M4 14h4"/><path d="M12 11l4 4M16 11l-4 4"/>',
  compare: '<path d="M4 4h5v12H4zM11 4h5v12h-5M6 7h1M6 10h1M13 7h1M13 13h1"/>',
  save: '<path d="M4.5 4h9l2 2v10h-11zM7 4v4h5V4M7 16v-4h6v4"/>',
  versions: '<path d="M10 4a6 6 0 1 1-5.6 3.9M4 4v3.5h3.5M10 7v3.5l2.5 1.5"/>'
};

// ---- the commands -------------------------------------------------------------------------------

const DISPLAY = [['simple', 'Simple Markup', 'A bar in the margin by each changed line; the text as it is now'], ['all', 'All Markup', 'Insertions underlined, deletions marked where they were, bars in the margin'], ['none', 'No Markup', 'The text as it is now, with no marks'],
  ['original', 'Original', 'The text as it was before the changes (the version compared with); the page takes no edit until another view is chosen']];
const LANGS = ['en_US', 'en_GB', 'de_DE', 'es_ES'];

register(
  // Proofing
  // (Word for Mac's Cmd+Option+L as well as F7, which a Mac's keyboard gives only with fn)
  { id: 'spelling', name: 'Spelling', label: 'Spelling', kind: 'split', tab: 'review', group: 'proofing', el: 'rv-spell', order: 10, icon: ICON.spell, keys: ['F7'], keysMac: ['Ctrl+Alt+L'], keyScope: 'app',
    title: 'Spelling (F7): each word the dictionary does not know, with suggestions, Ignore, Ignore All and Add to Dictionary',
    synonyms: ['Spelling and Grammar', 'Spell check', 'Spellcheck', 'Editor', 'Proofing', 'Check spelling', 'Typos'], when: () => true,
    run: (app) => app.openSpelling(),
    menuItems: (app) => [{ name: 'Spelling', keys: 'F7', command: 'spelling' }, { name: 'Check Spelling as You Type', checked: app.prefs.spell !== false, command: 'spell-as-you-type' },
      ...(app.grammarAvailable() ? [{ name: 'Check Grammar as You Type', checked: app.grammarOn(), command: 'grammar-as-you-type' }] : []), { name: 'Recheck Document', command: 'spell-recheck' },
      ...(app.thesAvailable() ? [null, { name: 'Thesaurus', keys: 'Shift+F7', command: 'thesaurus' }] : [])] },
  // Word's Alt+F7: the next word the dictionary does not know, selected, with its suggestions
  { id: 'spelling-next', name: 'Next Misspelling', title: 'Next Misspelling (Alt+F7): the next word the dictionary does not know, selected, with its suggestions', synonyms: ['Next spelling error', 'Next typo', 'Find next misspelling'],
    keys: ['Alt+F7'], when: (app) => app.spellOn(), whyNot: (app) => app.spellWhyNot(), run: (app) => app.spellNext() },
  { id: 'spell-as-you-type', name: 'Check Spelling as You Type', kind: 'toggle', title: 'Mark the words the dictionary does not know as you type (a red wavy line); off, no line at all',
    synonyms: ['Hide spelling errors', 'Spelling underline', 'Red squiggles', 'Autocorrect spelling'], when: () => true, on: (app) => app.prefs.spell !== false,
    run: (app) => app.spellToggle() },
  { id: 'spell-recheck', name: 'Recheck Document', title: 'Check every word again: the words you ignored in this document are marked again', synonyms: ['Reset ignored words', 'Clear Ignore All'],
    when: (app) => app.spellOn(), whyNot: (app) => app.spellWhyNot(), run: (app) => app.spellRecheck() },
  { id: 'word-count', name: 'Word Count', tab: 'review', group: 'proofing', el: 'rv-count', order: 30, icon: ICON.count, keys: ['Ctrl+Shift+G'], keyScope: 'app',
    title: 'Word Count (Ctrl+Shift+G): pages, words, characters with and without spaces, paragraphs and lines, of the document or the selection',
    synonyms: ['Count words', 'Statistics', 'Character count', 'How many words'], when: (app) => !!app.model, run: (app) => openWordCount(app) },
  // Speech
  { id: 'read-aloud', name: 'Read Aloud', kind: 'toggle', tab: 'review', group: 'speech', el: 'rv-read', order: 10, icon: ICON.speak, keys: ['Ctrl+Alt+Space'], keyScope: 'app',
    title: 'Read Aloud (Ctrl+Alt+Space): the text from the caret on, or the selection, in the document\'s language with your system\'s voices; again to stop',
    synonyms: ['Speak', 'Text to speech', 'Read out loud', 'Listen'], when: (app) => !!app.model && typeof speechSynthesis !== 'undefined',
    whyNot: () => 'This browser has no voices to read with', on: (app) => !!app.speaking, run: (app) => app.readAloud() },
  // Language
  { id: 'language', name: 'Proofing Language', kind: 'menu', tab: 'review', group: 'language', el: 'rv-lang', order: 10, icon: ICON.lang,
    title: 'Language: the proofing language of the selection (\\foreignlanguage) or, with none, of the document (babel)', synonyms: ['Set proofing language', 'Document language', 'Babel language', 'Dictionary language'],
    when: (app) => !!app.model, menuItems: (app, at) => app.languageItems(at), run: (app) => app.rvMenu('language') },
  // Comments
  { id: 'comment-delete', name: 'Delete Comment', kind: 'split', tab: 'review', group: 'comments', el: 'rv-cdel', order: 20, icon: ICON.del,
    title: 'Delete the comment where the cursor is (its replies too); the arrow: Delete All Comments', synonyms: ['Remove comment', 'Resolve comment', 'Delete all comments'],
    when: (app) => !!app.commentHere(), whyNot: () => 'Put the cursor on a line with a comment, or use Next Comment', run: (app) => app.deleteCommentHere(),
    menuItems: (app) => [{ name: 'Delete', command: 'comment-delete', disabled: !app.commentHere() }, { name: 'Delete All Comments', command: 'comment-delete-all', disabled: !app.allComments().length }, null, { name: 'Inspect Document…', command: 'inspect-document' }] },
  { id: 'comment-delete-all', name: 'Delete All Comments', title: 'Delete every comment and reply in the project, in one step (Ctrl+Z puts them back)', synonyms: ['Remove all comments', 'Clear comments'],
    when: (app) => app.allComments().length > 0, whyNot: () => 'The document has no comments', run: (app) => app.deleteAllComments() },
  { id: 'comment-prev', name: 'Previous Comment', tab: 'review', group: 'comments', el: 'rv-cprev', order: 30, icon: ICON.prev, title: 'Go to the comment before the cursor',
    synonyms: ['Previous comment'], when: (app) => app.allComments().length > 0, whyNot: () => 'The document has no comments', run: (app) => app.gotoComment(-1) },
  { id: 'comment-next', name: 'Next Comment', tab: 'review', group: 'comments', el: 'rv-cnext', order: 40, icon: ICON.next, title: 'Go to the comment after the cursor',
    synonyms: ['Next comment'], when: (app) => app.allComments().length > 0, whyNot: () => 'The document has no comments', run: (app) => app.gotoComment(1) },
  { id: 'comment-edit', name: 'Edit Comment', title: 'Change the words of the comment where the cursor is', synonyms: ['Change comment'], menu: { comment: 20 },
    when: (app) => !!app.commentHere(), whyNot: () => 'Put the cursor on a line with a comment', run: (app) => app.editCommentHere() },
  { id: 'comments-show', name: 'Show Comments', kind: 'toggle', tab: 'review', group: 'comments', el: 'rv-cshow', order: 50, icon: ICON.show,
    title: 'Show the comments on the pages: the words they are on and a mark in the margin', synonyms: ['Hide comments'], when: () => true,
    on: (app) => app.prefs.showCmt !== false, run: (app) => app.setMarkupShow('showCmt', app.prefs.showCmt === false) },
  { id: 'inspect-document', name: 'Inspect Document', title: 'What the document carries besides its text: comments with their authors\' names, changes not yet accepted, its own word list; each removed at a click',
    synonyms: ['Document inspector', 'Remove personal information', 'Remove comments'], when: () => true, run: (app) => app.inspectDocument() },
  // Tracking
  { id: 'track-changes', name: 'Track Changes', label: 'Track Changes', kind: 'toggle', tab: 'review', group: 'tracking', el: 'rv-track', order: 10, icon: ICON.track, keys: ['Ctrl+Shift+E'], keyScope: 'app',
    title: 'Track Changes (Ctrl+Shift+E): on, every edit is kept as a change to accept or reject; off, edits are not marked and the changes there stay',
    synonyms: ['Track changes', 'Record changes', 'Suggesting mode', 'Revisions'], when: (app) => !!app.base, on: (app) => app.trackOn(), run: (app) => app.setTracking(!app.trackOn()) },
  { id: 'display-for-review', name: 'Display for Review', label: 'Markup', kind: 'menu', tab: 'review', group: 'tracking', el: 'rv-display', order: 20, icon: ICON.display,
    title: 'Display for Review: how the changes show on the pages', synonyms: ['Simple Markup', 'All Markup', 'No Markup', 'Original', 'Markup view', 'Show original'], when: () => true, run: (app) => app.rvMenu('display-for-review'),
    menuItems: (app) => DISPLAY.map(([v, name, title]) => ({ name, title, radio: true, checked: app.markup() === v, run: () => app.setMarkup(v) })) },
  { id: 'show-markup', name: 'Show Markup', kind: 'menu', tab: 'review', group: 'tracking', el: 'rv-showmk', order: 30, icon: ICON.markup,
    title: 'Show Markup: which marks the pages show', synonyms: ['Markup options', 'Balloons'], when: () => true, run: (app) => app.rvMenu('show-markup'),
    menuItems: (app) => [{ name: 'Insertions and Deletions', checked: app.prefs.showIns !== false, run: () => app.setMarkupShow('showIns', app.prefs.showIns === false) },
      { name: 'Comments', checked: app.prefs.showCmt !== false, run: () => app.setMarkupShow('showCmt', app.prefs.showCmt === false) }, null,
      // (Specific People: whose changes the pages and the pane show, and Accept All Changes Shown acts on)
      ...app.reviewerItems(), null,
      { name: 'Download with Markup (.tex)', title: 'A copy of the main file with the changes as the changes package marks them and the comments as todonotes; the project is not touched', run: () => app.runCommand('markup-copy') }] },
  { id: 'markup-copy', name: 'Download with Markup', title: 'A copy of the main .tex with the changes marked by the changes package (\\added, \\deleted, \\replaced) and the comments as \\todo notes, for a PDF with markup; the project itself is not touched',
    synonyms: ['Print with markup', 'Print markup', 'Changes in the PDF', 'Blackline PDF'], when: (app) => !!app.base, run: (app) => app.markupCopy() },
  // Changes
  { id: 'change-accept', name: 'Accept', label: 'Accept', kind: 'split', tab: 'review', group: 'changes', el: 'rv-accept', order: 10, icon: ICON.accept,
    title: 'Accept this change and go to the next; the arrow: Accept This Change, Accept All Changes, Accept All and Stop Tracking', synonyms: ['Accept change', 'Accept all changes', 'Keep change'],
    when: (app) => app.realChanges().length > 0, whyNot: () => 'There are no changes', run: (app) => app.acceptHere(true),
    menuItems: (app) => [{ name: 'Accept and Move to Next', run: () => app.acceptHere(true) }, { name: 'Accept This Change', run: () => app.acceptHere(false) },
      ...(app.rvHidden && app.rvHidden.size ? [{ name: 'Accept All Changes Shown', run: () => app.acceptShown() }] : []),
      { name: 'Accept All Changes', run: () => app.acceptAllChanges(false) }, { name: 'Accept All Changes and Stop Tracking', run: () => app.acceptAllChanges(true) }, ...app.byAuthorItems('accept')] },
  { id: 'change-reject', name: 'Reject', label: 'Reject', kind: 'split', tab: 'review', group: 'changes', el: 'rv-reject', order: 20, icon: ICON.reject,
    title: 'Reject this change and go to the next; the arrow: Reject Change, Reject All Changes, Reject All and Stop Tracking', synonyms: ['Reject change', 'Reject all changes', 'Undo change'],
    when: (app) => app.realChanges().length > 0, whyNot: () => 'There are no changes', run: (app) => app.rejectHere(true),
    menuItems: (app) => [{ name: 'Reject and Move to Next', run: () => app.rejectHere(true) }, { name: 'Reject Change', run: () => app.rejectHere(false) },
      ...(app.rvHidden && app.rvHidden.size ? [{ name: 'Reject All Changes Shown', run: () => app.rejectShown() }] : []),
      { name: 'Reject All Changes', run: () => app.rejectAllChanges(false) }, { name: 'Reject All Changes and Stop Tracking', run: () => app.rejectAllChanges(true) }, ...app.byAuthorItems('reject')] },
  { id: 'change-prev', name: 'Previous Change', tab: 'review', group: 'changes', el: 'rv-prev', order: 30, icon: ICON.prev, title: 'Go to the change before the cursor and select it',
    synonyms: ['Previous revision'], when: (app) => app.realChanges().length > 0, whyNot: () => 'There are no changes', run: (app) => app.gotoChange(-1) },
  { id: 'change-next', name: 'Next Change', tab: 'review', group: 'changes', el: 'rv-next', order: 40, icon: ICON.next, title: 'Go to the change after the cursor and select it',
    synonyms: ['Next revision'], when: (app) => app.realChanges().length > 0, whyNot: () => 'There are no changes', run: (app) => app.gotoChange(1) },
  // Compare
  { id: 'compare', name: 'Compare Documents', kind: 'menu', tab: 'review', group: 'compare', el: 'rv-compare', order: 10, icon: ICON.compare,
    title: 'Compare: the changes between the text and a version you kept, or a .tex file, marked on the pages', synonyms: ['Compare documents', 'Blackline', 'Diff', 'Compare versions', 'Combine'], when: () => true, run: (app) => app.rvMenu('compare'),
    menuItems: () => [{ name: 'Compare with a Version…', title: 'The versions kept as you work, in the Reviewing pane', command: 'versions' }, { name: 'Compare with a File…', title: 'A .tex file: its differences to the main file, as changes', command: 'compare-file' }] },
  { id: 'compare-file', name: 'Compare with a File', title: 'Pick a .tex file: the main file\'s differences to it are shown as changes to accept or reject', synonyms: ['Compare with file', 'Compare documents'],
    when: () => true, run: (app) => app.compareWithFile() },
  // Versions
  { id: 'version-save', name: 'Save Version', tab: 'review', group: 'versions', el: 'rv-vsave', order: 10, icon: ICON.save, title: 'Keep the text as it is now as a named version',
    synonyms: ['Name this version', 'Checkpoint', 'Snapshot'], when: () => true, run: (app) => app.saveVersionAsk() },
  { id: 'versions', name: 'Version History', tab: 'review', group: 'versions', el: 'rv-versions', order: 20, icon: ICON.versions, title: 'The versions kept as you work: compare with one, or restore it',
    synonyms: ['Version history', 'Restore version'], when: () => true, run: (app) => app.showVersions() },
  // (B0's, kept)
  { id: 'comment-new', name: 'New comment', title: 'A comment on the selected words (Ctrl+Alt+M)', synonyms: ['Comment', 'Add a comment', 'Insert comment'], tab: 'review', group: 'comments', el: 'rv-comment', label: 'New comment', order: 10,
    icon: '<path d="M4 4.5h12v8H9.5L6 15.5v-3H4z"/>', also: [{ tab: 'insert', group: 'comments', el: 'ri-comment', name: 'Comment' }], keysElsewhere: ['Ctrl+Alt+M'], menu: { selection: 60 },
    // (Word for Mac's Cmd+Option+A: Cmd+Option+M is the Mac's own, it minimizes every window)
    keysMac: ['Ctrl+Alt+A'],
    run: (app) => app.commentOnSelection() },
  { id: 'reviewing-pane', name: 'Reviewing pane', title: 'Comments, changes since a version, and versions, in the side panel', synonyms: ['Review panel', 'Changes', 'Versions'],
    tab: 'review', group: 'tracking', el: 'rv-pane', kind: 'toggle', order: 40, icon: '<path d="M3.5 4.5h13v11h-13zM8.5 4.5v11M11 8h3M11 11h3"/>', when: () => true,
    on: (app) => reviewOpen() && app.navTab === 'changes', run: (app) => app.toggleNav(!(reviewOpen() && app.navTab === 'changes'), 'changes') }
);

// the status bar's language and Track Changes (Word's indicators), once the page is there
onInstall((app) => app.reviewStatusInstall());
// (when the person last typed: the word being typed is not marked until the caret leaves it)
onInsertText((app) => { app.lastTypeT = Date.now(); });

// ---- methods ------------------------------------------------------------------------------------

const debounce = (fn, ms) => { let t = null; return () => { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); }; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const LANG_TAG = { en_US: 'en-US', en_GB: 'en-GB', de_DE: 'de-DE', es_ES: 'es-ES' };
const MAX_MARKS = 5000;

export const methods = {
  // a menu button's menu, under its button (or its folded group's, or the ribbon)
  rvMenu(id) {
    const c = command(id);
    const b = document.getElementById(c.el || 'rc-' + id);
    let a = b && b.offsetParent ? b : null;
    if (!a) { const g = b && b.closest('.rb-grp'), gb = g && g.querySelector('.rb-gbtn'); if (gb && gb.offsetParent) a = gb; }
    if (!a) { const r = document.getElementById('ribbon').getBoundingClientRect(); a = new DOMRect(r.left + 40, r.bottom, 0, 0); }
    openMenu(this, a, this.commandMenu(c), { label: c.name });
    return true;
  },
  // a dialog of the Review tab with nothing to hang under: centred below the ribbon, as Word's
  rvPlace() {
    if (!this.pop) return;
    const R = document.getElementById('ribbon'), b = R ? R.getBoundingClientRect().bottom : 100, w = this.pop.el.offsetWidth;
    this.pop.rect = new DOMRect(Math.max(8, (innerWidth - w) / 2), b + 4, 0, 0);
    this.positionPop();
  },
  // ---- spelling ---------------------------------------------------------------------------
  spellAvailable() {
    return !!(SPELL && typeof Worker === 'function' && window.crypto && crypto.subtle && coreCanRun());
  },
  spellOn() { return this.prefs.spell !== false && this.spellAvailable() && !(this.sp && this.sp.dead); },
  spellWhyNot() {
    if (!SPELL) return 'This copy of Rikuy has no dictionaries; the browser\'s own spelling marks the page';
    if (!this.spellAvailable()) return 'This browser cannot run the spell checker here';
    if (this.sp && this.sp.dead) return 'The spell checker stopped: ' + this.sp.dead;
    return this.prefs.spell === false ? 'Check Spelling as You Type is off' : '';
  },
  // Next Misspelling: from the caret on (then from the top), the word selected and its menu open
  spellNext() {
    const rank = (f) => (f === this.main ? '' : f);
    const g = this.gr && this.grammarOn && this.grammarOn() ? this.gr.bad : [];
    const list = [...this.spellState().bad, ...g].sort((a, b) => (rank(a.f) < rank(b.f) ? -1 : rank(a.f) > rank(b.f) ? 1 : a.s - b.s));
    if (!list.length) { this.toast('No misspelled words.'); return false; }
    const c = this.caretNow(), from = c && !c.ghost ? { f: c.f, p: c.collapsed ? c.a : c.b } : null;
    const x = (from && list.find((y) => (y.f === from.f && y.s >= from.p) || rank(y.f) > rank(from.f))) || list[0];
    this.goTo(x.f, x.s);
    this.restoreCaret({ f: x.f, p: x.e, selA: x.s, selB: x.e });
    this.openContextMenu();
    return true;
  },
  spellState() {
    if (!this.sp) this.sp = { known: new Map(), ignore: new Set(), ignoreKey: null, once: new Set(), sugg: new Map(), bad: [], plan: null, client: null, failed: new Map(), seq: 0 };
    return this.sp;
  },
  spellSoon() {
    if (!this.spellSoonD) this.spellSoonD = debounce(() => this.spellRun(), 250);
    this.spellSoonD();
  },
  spellToggle() {
    this.prefs.spell = this.prefs.spell === false;
    store(PREFS, this.prefs);
    this.spellRun();
    this.ribbonSoon();
  },
  // the words this project ignores (Ignore All), kept in this browser for it
  async spellIgnoreLoad() {
    const S = this.spellState(), key = 'spell-ignore:' + this.name + '|' + this.main;
    if (S.ignoreKey === key) return;
    S.ignoreKey = key;
    S.ignore = new Set();
    S.once = new Set();
    try { const v = this.noIdb ? null : await kvGet(key); if (Array.isArray(v)) S.ignore = new Set(v.filter((w) => typeof w === 'string').slice(0, 20000)); } catch (e) { /* none kept */ }
  },
  spellIgnoreSave() {
    const S = this.spellState();
    if (!this.noIdb && S.ignoreKey) kvPut(S.ignoreKey, [...S.ignore]).catch(() => {});
  },
  async spellRun() {
    const S = this.spellState();
    const on = this.spellOn();
    // the browser's own spelling only where Rikuy's cannot run (and the person wants spelling)
    // (set only when it changes: each write is an attribute change the browser acts on)
    const native = !on && this.prefs.spell !== false && !this.spellAvailable();
    if (this.root && this.root.spellcheck !== native) this.root.spellcheck = native;
    if (!on || !this.model) { S.bad = []; S.plan = null; this.spellPaint(); return; }
    await this.spellIgnoreLoad();
    if (!S.client) S.client = new SpellClient(location.href, this.spellSpec());
    const t0 = performance.now();
    const plan = spellPlan(this.model, { files: this.files, main: this.main });
    const seq = ++S.seq;
    S.plan = plan;
    S.planModel = this.model;
    // (a document in a language Rikuy has no dictionary for: the browser's own spelling, in the
    // page's language, for its words; Hunspell for the parts in languages it has)
    const nat = plan.dict === null && this.prefs.spell !== false;
    if (this.root && this.root.spellcheck !== nat) this.root.spellcheck = nat;
    this.spellPaint();
    // (what the page's own thread spent, for the tests and a look in the console)
    S.mainMs = performance.now() - t0;
    let asked = false;
    for (const [dict, set] of plan.words) {
      if (S.failed.has(dict)) continue;
      let K = S.known.get(dict);
      if (!K) S.known.set(dict, (K = new Map()));
      const ask = [];
      for (const w of set) if (!K.has(w)) ask.push(w);
      if (ask.length) asked = true;
      for (let k = 0; k < ask.length; k += 20000) {
        const part = ask.slice(k, k + 20000);
        let r;
        const t0 = performance.now();
        try { r = await S.client.check(dict, part); } catch (e) {
          S.failed.set(dict, String(e.message || e));
          if (S.client.dead) S.dead = S.client.dead;
          break;
        }
        S.lastCheck = { dict, words: part.length, ms: performance.now() - t0 };
        for (let i = 0; i < part.length; i++) K.set(part[i], r[i] !== '0');
      }
    }
    // (painted again only where the dictionaries were asked something: with every word known
    // already, the paint above, a moment ago, drew the same marks, 22 304 words gone over again
    // on dev/bench/long)
    if (seq === S.seq && asked) this.spellPaint();
    // (grammar after spelling: an issue on a misspelt word is spelling's)
    if (this.grammarOn && this.grammarOn()) this.grammarSoon();
  },
  // the files of spelling as addresses this page may fetch (the installed app's own)
  spellSpec() {
    const u = (f) => ({ ...f, name: this.assetUrl(f.name) });
    const dicts = {};
    for (const k in SPELL.dicts) dicts[k] = { aff: u(SPELL.dicts[k].aff), dic: u(SPELL.dicts[k].dic) };
    const thes = {};
    for (const k in SPELL.thes || {}) thes[k] = { idx: u(SPELL.thes[k].idx), dat: SPELL.thes[k].dat.map(u) };
    return { worker: this.assetUrl(SPELL.worker), wasm: u(SPELL.wasm), dicts, thes };
  },
  // the words to mark: the occurrences the dictionary does not know, neither ignored nor the one
  // being typed; red wavy lines under them
  spellPaint() {
    const S = this.spellState();
    const HL = window.CSS && CSS.highlights;
    const bad = [];
    const plan = S.plan;
    if (plan && this.spellOn()) {
      const c = this.caretNow ? this.caretNow() : null;
      const seen = new Map();
      for (const o of plan.occ) {
        const K = S.known.get(o.dict);
        if (!K || K.get(o.q) !== false || S.ignore.has(o.q)) continue;
        const x = occSource(plan, o);
        if (!x) continue;
        const n = (seen.get(x.f + '|' + o.q) || 0) + 1;
        seen.set(x.f + '|' + o.q, n);
        x.key = x.f + '|' + o.q + '|' + n;
        if (S.once.has(x.key)) continue;
        // (the word the caret ends, while it is typed: marked once the caret leaves it)
        if (c && c.collapsed && c.f === x.f && c.p === x.e && this.lastTypeT && Date.now() - this.lastTypeT < 4000) continue;
        x.q = o.q; x.dict = o.dict; x.r = o.r; x.i = o.i; x.j = o.j;
        bad.push(x);
        if (bad.length >= MAX_MARKS) break;
      }
    }
    S.bad = bad;
    if (HL && window.Highlight && this.index) {
      const byF = new Map();
      for (const x of bad) { if (!byF.has(x.f)) byF.set(x.f, []); byF.get(x.f).push(...x.parts); }
      const ranges = [];
      for (const [f, rs] of byF) { rs.sort((a, b) => a[0] - b[0]); ranges.push(...this.index.domRanges(f, rs)); }
      // (on the pages near the view: src/marks.js)
      setMarks(this, 'rk-spell', ranges);
    }
    this.reviewStatus();
    spellPaneRefresh(this);
  },
  // the marked word at the caret (or the selection's start)
  spellAt(c) {
    c = c || this.caretNow();
    const S = this.spellState();
    if (!c || c.f == null || !S.bad.length) return null;
    const p = c.collapsed ? c.p : c.a;
    return S.bad.find((x) => x.f === c.f && x.s <= p && p <= x.e) || null;
  },
  spellSuggest(x) {
    const S = this.spellState();
    const k = x.dict + '|' + x.q;
    if (!S.sugg.has(k)) {
      const pr = S.client ? S.client.suggest(x.dict, x.q).catch(() => []) : Promise.resolve([]);
      S.sugg.set(k, pr);
      pr.then((list) => S.sugg.set(k, list));
      if (S.sugg.size > 500) S.sugg.delete(S.sugg.keys().next().value);
    }
    const v = S.sugg.get(k);
    return Array.isArray(v) ? Promise.resolve(v) : v;
  },
  spellSuggestNow(x) { const v = this.spellState().sugg.get(x.dict + '|' + x.q); return Array.isArray(v) ? v : null; },
  // A word changed to another: only the characters that differ, in the source; where those run
  // across markup (a word half bold) the change goes on the part that holds them, or says why not
  spellChange(x, to, all) {
    // (from the text as it is now: a plan older than the page, as after a first Change pressed
    // twice, is made again, and the word must still be there, letter for letter)
    const S = this.spellState();
    if (S.planModel !== this.model && this.model) { S.plan = spellPlan(this.model, { files: this.files, main: this.main }); S.planModel = this.model; this.spellPaint(); }
    const now = S.bad.find((y) => y.key === x.key && y.w === x.w);
    if (!now) { this.toast('That word is no longer there.'); return false; }
    const list = all ? S.bad.filter((y) => y.q === x.q && y.dict === x.dict) : [now];
    const edits = [];
    for (const y of list) {
      const ed = this.spellEdit(y, to);
      if (ed) edits.push(ed);
    }
    if (!edits.length) { this.toast('That word runs across formatting: change it in the source.'); return false; }
    this.closeGroup();
    // (the caret after the word as it now reads: its end moved by what changed in it and before
    // it. Its start plus the new word's length fell inside the word where formatting runs through
    // it, \textbf{wr}ong, or where Change All changed an earlier one too)
    const end = now.e + edits.filter((d) => d.f === now.f && d.e <= now.e).reduce((n, d) => n + d.t.length - (d.e - d.s), 0);
    this.commit(edits, { f: x.f, p: end }, 'spell');
    this.closeGroup();
    return true;
  },
  spellEdit(y, to) {
    const w = y.w, src = this.src(y.f);
    let p = 0, q = 0;
    while (p < w.length && p < to.length && w[p] === to[p]) p++;
    while (q < w.length - p && q < to.length - p && w[w.length - 1 - q] === to[to.length - 1 - q]) q++;
    // the word's characters by source place: they must be the source's own, one after the other
    const plan = this.spellState().plan;
    if (!plan) return null;
    const occ = plan.occ.find((o) => { const s = occSource(plan, o); return s && s.f === y.f && s.s === y.s && s.e === y.e; });
    if (!occ) return null;
    const run = plan.runs[occ.r], off = run.off || 0;
    const at = (k) => [run.map[2 * (occ.i + k)] + off, run.map[2 * (occ.i + k) + 1] + off];
    let s, e;
    if (p < w.length - q) {
      s = at(p)[0]; e = at(w.length - q - 1)[1];
      for (let k = p; k < w.length - q - 1; k++) if (at(k)[1] !== at(k + 1)[0]) return null;
    } else {
      s = e = p > 0 ? at(p - 1)[1] : at(0)[0];
    }
    if (s < 0 || e < s || e > src.length) return null;
    const mid = to.slice(p, to.length - q);
    return { f: y.f, s, e, t: mid ? this.escapeAt(y.f, s, mid) : '' };
  },
  spellIgnoreAll(q) {
    const S = this.spellState();
    S.ignore.add(q);
    this.spellIgnoreSave();
    this.spellPaint();
  },
  spellIgnoreOnce(x) { this.spellState().once.add(x.key); this.spellPaint(); },
  spellAddWord(w) {
    const word = asked(w);
    const ed = addWordEdit(this.src(this.main), word);
    if (!ed) { this.toast('That word cannot go on the document\'s list.'); return; }
    this.closeGroup();
    this.commit([{ f: this.main, ...ed }], null, 'spell');
    this.closeGroup();
    this.toast('“' + word + '” is on this document\'s word list (a % rikuy: words line in ' + this.main + ').', 4000);
  },
  spellRecheck() {
    const S = this.spellState();
    S.ignore = new Set(); S.once = new Set();
    // (a dictionary that could not be had, offline, is asked for again)
    S.failed.clear();
    this.spellIgnoreSave();
    this.spellRun();
    this.toast('Every word is checked again.');
  },
  // the right click menu's spelling part (and a long press's on a phone): suggestions first
  spellMenuItems(at) {
    if (!this.spellOn()) return null;
    const x = this.spellAt(at && at.c);
    if (!x) { const g = this.grammarMenuItems && this.grammarMenuItems(at); return g ? { items: g, key: null } : null; }
    const list = this.spellSuggestNow(x);
    const items = [];
    if (list == null) {
      items.push({ name: 'Looking for suggestions…', disabled: true });
      // (the menu comes again with them, if it is still open on this word)
      this.spellSuggest(x).then(() => { if (this.pop && this.pop.el.classList.contains('pop-ctx') && this.pop.spellKey === x.key && this.ctxXY) this.openContextMenu(this.ctxXY[0], this.ctxXY[1]); });
    } else if (!list.length) items.push({ name: '(no suggestions)', disabled: true });
    else for (const s of list.slice(0, 5)) items.push({ name: s, cls: 'mi-sugg', title: 'Change “' + x.w + '” to “' + s + '”', run: () => { this.ribbonBack(); this.spellChange(x, s); } });
    items.push(null,
      { name: 'Ignore All', title: 'Do not mark “' + x.w + '” in this document', run: () => this.spellIgnoreAll(x.q) },
      { name: 'Add to Dictionary', title: 'Put “' + x.q + '” on this document\'s word list (a % rikuy: words line)', run: () => { this.ribbonBack(); this.spellAddWord(x.q); } },
      { name: 'Spelling…', keys: 'F7', run: () => this.openSpelling(x) }, null);
    return { items, key: x.key };
  },
  openSpelling(x) { openSpellPane(this, x); },
  // whether a point of the page (a long press) lies on a marked word
  spellAtPoint(p) {
    const H = window.CSS && CSS.highlights && CSS.highlights.get('rk-spell');
    if (this.grammarAtPoint && this.grammarAtPoint(p)) return true;
    if (!H || !p) return false;
    for (const r of H) { try { if (r.isPointInRange(p.startContainer, p.startOffset)) return true; } catch (e) { /* another document */ } }
    return false;
  },

  // ---- language -----------------------------------------------------------------------------
  languageItems(at) {
    const c = at && at.c;
    const sel = c && !c.collapsed && c.f != null;
    const ml = mainLanguage(this.src(this.main));
    const cur = dictOf(ml.name, ml.variant) || 'en_US';
    const items = LANGS.map((d) => ({ name: DICT_NAME[d], radio: !sel, checked: !sel && cur === d,
      title: sel ? 'The selected words are in ' + DICT_NAME[d] + ' (\\foreignlanguage)' : 'The document is in ' + DICT_NAME[d] + ' (babel)',
      run: () => this.setLanguage(d, sel ? c : null) }));
    items.unshift({ name: sel ? 'The selection is in:' : 'The document is in:', disabled: true });
    items.push(null, { name: 'Check Spelling as You Type', checked: this.prefs.spell !== false, command: 'spell-as-you-type' });
    return items;
  },
  setLanguage(d, c) {
    const r = setLanguageEdits(this, d, c);
    if (!r || !r.edits.length) { this.toast(r && r.why ? r.why : 'Nothing to change.'); return; }
    this.closeGroup();
    // (the words selected again where the edits moved them, as Word leaves them: the caret went to
    // their old end, which a babel line put in above moved back into the text before them, inside
    // \begin{document} where they were its first words, and what was typed next went in there)
    const at = (q, inside) => q + r.edits.filter((x) => x.f === c.f && (x.e < q || (x.e === q && (x.s < q || inside)))).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.commit(r.edits, c ? { f: c.f, selA: at(c.a, true), selB: at(c.b, false) } : null, 'language');
    this.closeGroup();
  },

  // ---- comments -----------------------------------------------------------------------------
  commentHere() {
    const c = this.caretNow ? this.caretNow() : null;
    if (!c || c.f == null) return null;
    const p = c.collapsed ? c.p : c.a;
    const list = findComments(this.src(c.f), c.f);
    return list.find((t) => t.as <= p && p <= t.ae) || list.find((t) => t.s <= p && p < t.e) || null;
  },
  deleteCommentHere() { const t = this.commentHere(); if (t) this.resolveComment(t); },
  deleteAllComments() {
    const edits = [];
    for (const [f, t] of this.files) if (/\.tex$/i.test(f)) for (const x of findComments(t, f)) edits.push({ f, s: x.s, e: x.e, t: '' });
    if (!edits.length) return;
    this.closeGroup();
    this.commit(edits, null, 'comment');
    this.closeGroup();
    this.refreshNav();
    this.toast(plural(edits.length, 'comment', 'comments') + ' deleted. Ctrl+Z puts them back.', 5000, { label: 'Undo', fn: () => this.undo() });
  },
  gotoComment(dir) {
    const list = this.allComments().sort((a, b) => (a.f === b.f ? a.as - b.as : a.f === this.main ? -1 : b.f === this.main ? 1 : a.f < b.f ? -1 : 1));
    if (!list.length) return;
    const c = this.caretNow();
    const here = c && c.f != null ? c : { f: this.main, p: dir > 0 ? -1 : Infinity };
    const ord = (t) => [t.f === this.main ? '' : t.f, t.as];
    const cmp = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
    const me = [here.f === this.main ? '' : here.f, here.p];
    let t = dir > 0 ? list.find((x) => cmp(ord(x), me) > 0 && !(x.f === here.f && x.as <= here.p && here.p <= x.ae)) : [...list].reverse().find((x) => cmp(ord(x), me) < 0 && !(x.f === here.f && x.as <= here.p && here.p <= x.ae));
    if (!t) t = dir > 0 ? list[0] : list[list.length - 1];
    this.goTo(t.f, t.as);
    this.restoreCaret({ f: t.f, p: t.as, bias: 1 }, true);
    this.flashComment(t);
  },
  editCommentHere() {
    const t = this.commentHere();
    if (!t) return;
    const p = this.makePop(null, 'pop-comment', 'Edit Comment');
    const c = this.caretNow();
    const r = c && c.range ? c.range.getBoundingClientRect() : null;
    if (r) this.pop.rect = r;
    const ta = mk('textarea', 'cm-body'); ta.rows = 3; ta.value = t.body; ta.setAttribute('aria-label', 'Comment');
    const row = mk('div', 'pop-row');
    const ok = mk('button', 'btn sm', 'Save'); ok.type = 'button';
    const save = () => {
      const now = findComments(this.src(t.f), t.f).find((x) => x.who === t.who && x.body === t.body && x.quote === t.quote);
      const body = ta.value.replace(/\s+/g, ' ').trim();
      if (!now || !body) { this.closePop(true); return; }
      // the comment line's own words after its colon, nothing else of it (a CRLF file's \r stays)
      let line = this.src(t.f).slice(now.s, this.src(t.f).indexOf('\n', now.s) < 0 ? now.e : this.src(t.f).indexOf('\n', now.s));
      if (line.endsWith('\r')) line = line.slice(0, -1);
      // a comment in base32 (a reader's of a comments only link, src/share.js) is written again
      // whole, in that form: its words are not the line's
      if (now.safe) {
        this.closePop(true);
        this.commit([{ f: t.f, s: now.s, e: now.s + line.length, t: safeCommentLine({ kind: 'comment', who: now.who, quote: now.quote, body }) }], null, 'comment');
        this.closeGroup();
        this.refreshNav();
        return;
      }
      const k = line.indexOf(':', line.indexOf(')'));
      if (k < 0) { this.closePop(true); return; }
      const s = now.s + k + 1 + (line[k + 1] === ' ' ? 1 : 0);
      this.closePop(true);
      this.commit([{ f: t.f, s, e: now.s + line.length, t: body }], null, 'comment');
      this.closeGroup();
      this.refreshNav();
    };
    ok.addEventListener('click', save);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } });
    row.append(mk('span', 'grow'), ok);
    p.append(ta, row);
    if (r) this.positionPop(); else this.rvPlace();
    ta.focus();
  },
  inspectDocument() {
    const p = this.makePop(null, 'pop-dlg rv-inspect', 'Inspect Document');
    const body = mk('div', 'rv-ins');
    const cm = this.allComments();
    const who = [...new Set(cm.flatMap((t) => [t.who, ...t.replies.map((r) => r.who)]))];
    const ch = this.realChanges();
    const words = [...this.files].filter(([n]) => /\.tex$/i.test(n)).reduce((k, [, t]) => k + (t.match(/^[ \t]*%[ \t]*rikuy:[ \t]*words\b.*$/gm) || []).length, 0);
    const row = (title, what, label, fn) => {
      const r = mk('div', 'rv-ins-row');
      const t = mk('div', 'rv-ins-t');
      t.append(mk('b', '', title), mk('div', 'rv-ins-d', what));
      r.append(t);
      if (fn) { const b = mk('button', 'btn ghost sm', label); b.type = 'button'; b.addEventListener('click', () => { this.closePop(true); fn(); }); r.append(b); }
      body.append(r);
    };
    row('Comments', cm.length ? plural(cm.length, 'thread', 'threads') + ', by ' + who.join(', ') : 'None', 'Remove All', cm.length ? () => this.deleteAllComments() : null);
    row('Changes not yet accepted', ch.length ? plural(ch.length, 'change', 'changes') + ' since ' + (this.base.label || 'the version compared with') : 'None', 'Accept All', ch.length ? () => this.acceptAllChanges(false) : null);
    row('The document\'s word list', words ? plural(words, '% rikuy: words line', '% rikuy: words lines') + ' (Add to Dictionary): TeX never reads them' : 'None', '', null);
    p.append(body);
    this.rvPlace();
  },

  // ---- tracking -----------------------------------------------------------------------------
  trackOn() { return !!(this.base && this.base.track); },
  markup() { const m = this.prefs.markup; return m === 'simple' || m === 'all' || m === 'none' || m === 'original' ? m : 'none'; },
  markupOn() { const m = this.markup(); return m !== 'none' && m !== 'original'; },
  setMarkup(v) {
    const was = this.markup();
    this.prefs.markup = v;
    store(PREFS, this.prefs);
    // (to or from the Original: the page is drawn from the other text, and takes edits again or not)
    if ((was === 'original') !== (v === 'original')) {
      if (this.disarm) this.disarm();
      this.root.contentEditable = v === 'original' ? 'false' : 'true';
      this.root.classList.toggle('rv-original', v === 'original');
      this.forceRender = true;
      this.rebuild(v === 'original' ? null : this.caretNow());
      this.spellRun();
      if (this.grammarRun) this.grammarRun();
    }
    this.paintChanges();
    const cb = $('#chg-show');
    if (cb) cb.checked = v === 'all';
    this.ribbonSoon();
  },
  setMarkupShow(k, on) {
    this.prefs[k] = !!on;
    store(PREFS, this.prefs);
    this.paintChanges();
    this.paintComments();
    this.ribbonSoon();
  },
  setTracking(on) {
    if (!this.base) return;
    // (the next typing is a step of its own, absorbed or not as the switch now says)
    this.closeGroup();
    if (on) {
      // with no change waiting, tracking starts from the text as it is now
      if (!this.realChanges().length) this.setBase({ t: Date.now(), label: 'Tracking since ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), files: this.files, track: true });
      else { this.base.track = true; this.saveBase(); }
      if (this.markup() === 'none') this.setMarkup('all');
    } else { this.base.track = false; this.saveBase(); }
    this.reviewStatus();
    this.refreshNav();
    this.ribbonSoon();
  },
  realChanges() { return this.base ? this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c)) : []; },
  // changes in reading order: a chapter's file comes where \input reads it, as Word goes through
  // one document (the main file's changes went first, then the other files' by name, and Next
  // Change jumped from the introduction to the conclusion over every chapter); a file the page
  // does not show after them, by name
  rvKey(f, p) { return [this.blockIndexOf(f, p), f === this.main ? '' : f, p]; },
  orderedChanges() {
    return this.realChanges().map((c) => [this.rvKey(c.f, c.bs), c]).sort((a, b) => keyCmp(a[0], b[0])).map((x) => x[1]);
  },
  changeHere() {
    const c = this.caretNow();
    if (!c || c.f == null) return null;
    const a = c.collapsed ? c.p : c.a, b = c.collapsed ? c.p : c.b;
    return this.orderedChanges().find((x) => x.f === c.f && x.bs <= b && a <= x.be) || null;
  },
  gotoChange(dir, from) {
    const list = this.orderedChanges();
    if (!list.length) { this.toast('There are no changes.'); return null; }
    const c = from || this.caretNow();
    const here = c && c.f != null ? this.rvKey(c.f, c.collapsed === false ? (dir > 0 ? c.b : c.a) : c.p) : null;
    const cmp = (x) => keyCmp(this.rvKey(x.f, dir > 0 ? x.bs : x.be), here);
    let x = !here ? (dir > 0 ? list[0] : list[list.length - 1]) : dir > 0 ? list.find((y) => cmp(y) > 0 || (cmp(y) === 0 && y.bs === y.be && c.collapsed)) : [...list].reverse().find((y) => cmp(y) < 0);
    if (!x) x = dir > 0 ? list[0] : list[list.length - 1];
    this.goTo(x.f, x.bs);
    // (the change selected, as Word selects it; a deletion: the caret where it was)
    this.restoreCaret(x.be > x.bs ? { f: x.f, p: x.be, selA: x.bs, selB: x.be } : { f: x.f, p: x.bs }, true);
    return x;
  },
  acceptHere(next) {
    const x = this.changeHere() || this.gotoChange(1);
    if (!x) return;
    const at = { f: x.f, p: x.be, collapsed: true };
    this.acceptChanges([x]);
    if (next && this.realChanges().length) this.gotoChange(1, at);
  },
  rejectHere(next) {
    const x = this.changeHere() || this.gotoChange(1);
    if (!x) return;
    const at = { f: x.f, p: x.bs + x.a.length, collapsed: true };
    this.rejectChanges([x]);
    if (next && this.realChanges().length) this.gotoChange(1, at);
  },
  // Show Markup's Specific People: All Reviewers, and each person whose changes wait
  reviewerItems() {
    const people = this.rvReviewers();
    if (!people.length) return [];
    const hidden = this.rvHidden || new Set();
    const items = [{ name: 'All Reviewers', checked: !people.some((p) => hidden.has(p)), title: 'Show every reviewer\'s changes', run: () => { this.rvHidden = new Set(); this.rvAfterFilter(); } }];
    for (const p of people) items.push({ name: p, title: (hidden.has(p) ? 'Show ' : 'Hide ') + p + '\'s changes', checked: !hidden.has(p), run: () => { const H = new Set(this.rvHidden || []); if (H.has(p)) H.delete(p); else H.add(p); this.rvHidden = H; this.rvAfterFilter(); } });
    return items;
  },
  rvAfterFilter() { this.paintChanges(); this.refreshNav(); this.ribbonSoon(); },
  // Accept and Reject's arrows: all the changes of one person, where more than one made them
  byAuthorItems(what) {
    const people = this.rvReviewers();
    if (people.length < 2) return [];
    return [null, ...people.map((p) => ({ name: (what === 'accept' ? 'Accept' : 'Reject') + ' All by ' + p, title: (what === 'accept' ? 'Keep' : 'Take back') + ' every change ' + p + ' made', run: () => this.rvActByAuthor(what, p) }))];
  },
  rvActByAuthor(what, p) {
    const cs = this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c) && this.rvName(c.who) === p);
    if (!cs.length) return;
    if (what === 'accept') this.acceptChanges(cs); else this.rejectChanges(cs, 'Before rejecting the changes of ' + p);
    this.toast(plural(cs.length, 'change', 'changes') + ' by ' + p + (what === 'accept' ? ' accepted.' : ' rejected (Ctrl+Z undoes).'), 4000);
  },
  acceptShown() { this.acceptChanges(this.currentChanges().filter((c) => this.rvShown(c))); },
  rejectShown() { this.rejectChanges(this.currentChanges().filter((c) => this.rvShown(c)), 'Before rejecting the changes shown'); },
  acceptAllChanges(stop) { this.acceptChanges(this.currentChanges()); if (stop) this.setTracking(false); },
  rejectAllChanges(stop) { this.rejectChanges(this.currentChanges(), 'Before rejecting all changes'); if (stop) this.setTracking(false); },

  // Compare with a .tex file: the main file's differences to it, as changes from it
  compareWithFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.tex,text/x-tex,text/plain';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { this.toast('That file is too large to compare.'); return; }
      const text = await f.text();
      const files = new Map(this.files);
      files.set(this.main, text);
      this.setBase({ t: Date.now(), label: 'Compared with ' + f.name.slice(0, 80), files, track: true });
      if (this.markup() === 'none') this.setMarkup('all');
      this.toggleNav(true, 'changes');
      this.refreshNav();
      this.paintChanges();
      this.toast(plural(this.realChanges().length, 'difference', 'differences') + ' to ' + f.name + ', marked as changes. Track Changes is on: your edits from here are changes too.', 6000);
    });
    inp.click();
  },
  saveVersionAsk() {
    const p = this.makePop(null, 'pop-dlg rv-vsave', 'Save Version');
    const inp = mk('input'); inp.type = 'text'; inp.maxLength = 80; inp.placeholder = 'Name this version'; inp.setAttribute('aria-label', 'Name this version');
    const row = mk('div', 'pop-row');
    const ok = mk('button', 'btn sm', 'Save'); ok.type = 'button';
    const go = () => {
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      this.closePop(true);
      this.snapshot(name, { force: true, named: true }).then(() => this.toast('Saved the version “' + name + '”.'));
    };
    ok.addEventListener('click', go);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    row.append(mk('span', 'grow'), ok);
    p.append(inp, row);
    this.rvPlace();
    inp.focus();
  },
  showVersions() {
    this.toggleNav(true, 'changes');
    setTimeout(() => { const v = document.querySelector('#nav-body .ver-h'); if (v) v.scrollIntoView({ block: 'start' }); }, 50);
  },

  // A copy of the main file with the changes marked as the changes package marks them, and the
  // comments as todonotes' \todo: what Word prints with markup. A change is marked only where
  // its old and new words are plain text (no brace, backslash, dollar, percent, ampersand or
  // paragraph break), so the copy compiles; the others are in it as they are now.
  // The changes waiting whose old and new words are plain text in prose (no brace, backslash,
  // dollar, percent, ampersand or paragraph break; only where the page has prose, the words
  // spelling reads: never the preamble, a label, a citation key, math or a command's argument),
  // in file f or in every file: those a copy with markup (here) or a Word file (src/word.js)
  // can mark as changes; the others are in them as they are now
  plainChanges(f) {
    const PLAIN = /^[^\\{}$%&#^_~\n]*$/;
    const prose = new Map();
    const proseOf = (g) => {
      if (prose.has(g)) return prose.get(g);
      const now = this.src(g), P = new Uint8Array(now.length + 1);
      if (this.model) for (const r of proseRuns(this.model, { code: true })) {
        if (r.f !== g) continue;
        const off = r.off || 0;
        for (let k = 0; k < r.text.length; k++) { const a = r.map[2 * k], b = r.map[2 * k + 1]; if (a >= 0) for (let x = a + off; x < b + off && x < P.length; x++) P[x] = 1; }
      }
      const begin = g === this.main ? now.search(/\\begin\s*\{document\}/) : -1;
      const v = { now, P, begin, ok: g !== this.main || begin >= 0 };
      prose.set(g, v);
      return v;
    };
    const inProse = (c) => {
      const { now, P, begin, ok } = proseOf(c.f);
      if (!ok || c.bs <= begin) return false;
      if (c.be > c.bs) { for (let x = c.bs; x < c.be; x++) if (!P[x] && /\S/.test(now[x])) return false; return true; }
      return !!(P[c.bs - 1] || P[c.bs]);
    };
    return this.realChanges().filter((c) => (f == null ? /\.tex$/i.test(c.f) : c.f === f) && PLAIN.test(c.a) && PLAIN.test(c.b) && inProse(c));
  },
  markupCopy() {
    const f = this.main, now = this.src(f);
    const list = this.plainChanges(f).sort((a, b) => b.bs - a.bs);
    let t = now;
    for (const c of list) {
      const m = !c.a ? '\\added{' + c.b + '}' : !c.b ? '\\deleted{' + c.a + '}' : '\\replaced{' + c.b + '}{' + c.a + '}';
      t = t.slice(0, c.bs) + m + t.slice(c.be);
    }
    const esc = (s) => s.replace(/[\\{}$%&#^_~]/g, (ch) => (ch === '\\' ? '\\textbackslash{}' : ch === '^' ? '\\^{}' : ch === '~' ? '\\~{}' : '\\' + ch));
    let notes = 0;
    const b = /\\begin\s*\{document\}/.exec(t);
    if (!b) { this.toast('The main file has no \\begin{document}.'); return; }
    // (the comments of the text, not of the preamble, where todonotes is not loaded yet)
    const body = t.slice(b.index).replace(/^([ \t]*)%[ \t]*(comment|reply)[ \t]*\(([^)\n]*)\)(?:[ \t]+on[ \t]+"[^"\n]*")?[ \t]*:[ \t]?([^\n]*)$/gim, (m, ind, kind, who, txt) => { notes++; return ind + '\\todo[inline]{' + esc(who.trim()) + ': ' + esc(txt.trim()) + '}%'; });
    t = t.slice(0, b.index) + body;
    t = t.slice(0, b.index) + '\\usepackage{changes}\n' + (notes ? '\\usepackage{todonotes}\n' : '') + t.slice(b.index);
    const name = f.replace(/\.tex$/i, '') + '-markup.tex';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/x-tex' }));
    a.download = name.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    this.toast(name.split('/').pop() + ': ' + plural(list.length, 'change', 'changes') + ' marked' + (notes ? ' and ' + plural(notes, 'comment', 'comments') + ' as notes' : '') + '. Compile it beside the project for a PDF with markup.', 7000);
  },

  // ---- Read Aloud -----------------------------------------------------------------------------
  readAloud() {
    if (typeof speechSynthesis === 'undefined') return;
    if (this.speaking) { speechSynthesis.cancel(); this.speaking = false; this.ribbonSoon(); return; }
    const c = this.caretNow();
    const runs = proseRuns(this.model, { code: true });
    let parts = [];
    const sel = c && !c.collapsed && c.range ? String(getSelection()) : '';
    if (sel.trim()) parts = [sel];
    else {
      let started = !c || c.f == null;
      for (const r of runs) {
        let i = 0;
        if (!started) {
          if (r.f !== c.f) continue;
          const off = r.off || 0;
          let k = -1;
          for (let x = 0; x < r.text.length; x++) if (r.map[2 * x] >= 0 && r.map[2 * x] + off >= c.p) { k = x; break; }
          if (k < 0) continue;
          started = true; i = k;
        }
        parts.push(r.text.slice(i));
      }
    }
    // (in pieces of about a paragraph: a long utterance stops after some seconds in Chrome)
    const pieces = [];
    for (const p of parts) for (const s of p.match(/[^.!?]{1,400}[.!?]*\s*|.{1,400}/gs) || []) if (s.trim()) pieces.push(s);
    if (!pieces.length) { this.toast('Nothing to read here.'); return; }
    const plan = this.spellState().plan;
    const lang = LANG_TAG[(plan && plan.dict) || dictOf(mainLanguage(this.src(this.main)).name) || 'en_US'] || 'en-US';
    speechSynthesis.cancel();
    this.speaking = true;
    let k = 0;
    const next = () => {
      if (!this.speaking || k >= pieces.length) { this.speaking = false; this.ribbonSoon(); return; }
      const u = new SpeechSynthesisUtterance(pieces[k++]);
      u.lang = lang;
      u.onend = next;
      u.onerror = () => { this.speaking = false; this.ribbonSoon(); };
      speechSynthesis.speak(u);
    };
    next();
    this.ribbonSoon();
  },

  // ---- the status bar --------------------------------------------------------------------------
  reviewStatusInstall() {
    // (before Display for Review, prefs.marks meant the changes on the pages too: taken over once)
    if (this.prefs && this.prefs.markup === undefined && this.prefs.marks === true) { this.prefs.markup = 'all'; store(PREFS, this.prefs); }
    // (the Original is a look at the text before the changes, not a way to open documents: a new
    // session starts with the marks)
    if (this.prefs && this.prefs.markup === 'original') { this.prefs.markup = 'simple'; store(PREFS, this.prefs); }
    // (a dictionary that failed offline is asked for again once the network is back)
    window.addEventListener('online', () => { if (this.sp && this.sp.failed.size) { this.sp.failed.clear(); this.spellSoon(); } });
    const after = $('#st-warn') || $('#st-words');
    if (!after || $('#st-lang')) return;
    const lang = mk('button', 'linkish st-rv', '');
    lang.id = 'st-lang'; lang.type = 'button';
    lang.addEventListener('click', () => this.openSpelling());
    const tr = mk('button', 'linkish st-rv', '');
    tr.id = 'st-track'; tr.type = 'button';
    tr.addEventListener('click', () => this.setTracking(!this.trackOn()));
    after.after(lang, tr);
    this.reviewStatus();
  },
  reviewStatus() {
    const lang = $('#st-lang'), tr = $('#st-track');
    if (lang) {
      const S = this.sp;
      const ml = this.files ? mainLanguage(this.src(this.main)) : { name: '' };
      const d = S && S.plan ? S.plan.dict : ml.name ? dictOf(ml.name, ml.variant) : 'en_US';
      const name = d ? DICT_NAME[d] || 'English (United States)' : ml.name.charAt(0).toUpperCase() + ml.name.slice(1);
      let t, title;
      // (each written where it changes: src/ui/dom.js setAttr)
      if (!d) { t = name; title = 'Proofing language: ' + name + '. Rikuy has no dictionary for it: the browser\'s own spelling marks its words.'; setAttr(lang, 'data-st', 'off'); }
      else if (!this.spellOn()) { t = name; title = 'Proofing language: ' + name + '. ' + (this.spellWhyNot() || ''); setAttr(lang, 'data-st', 'off'); }
      else {
        const n = S ? S.bad.length : 0;
        const failed = S && S.failed.size ? ' No dictionary could be loaded for ' + [...S.failed.keys()].map((k) => DICT_NAME[k] || k).join(', ') + '.' : '';
        t = name + (n ? ' · ' + plural(n, 'spelling error', 'spelling errors') : '');
        title = 'Proofing language: ' + name + '. ' + (n ? plural(n, 'word', 'words') + ' the dictionary does not know' : 'No spelling errors') + '. Click for the Spelling pane (F7).' + failed;
        setAttr(lang, 'data-st', n ? 'bad' : 'ok');
      }
      if (lang.textContent !== t) lang.textContent = t;
      setProp(lang, 'title', title);
      setAttr(lang, 'aria-label', 'Proofing: ' + t);
    }
    if (tr) {
      const on = this.trackOn();
      const t = 'Track Changes: ' + (on ? 'On' : 'Off');
      if (tr.textContent !== t) tr.textContent = t;
      setProp(tr, 'title', t + ' (Ctrl+Shift+E). Click to turn it ' + (on ? 'off' : 'on') + '.');
      setAttr(tr, 'aria-pressed', on ? 'true' : 'false');
      setAttr(tr, 'data-on', on ? '1' : '');
    }
  }
};
