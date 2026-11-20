# Word's keyboard shortcuts in Rikuy

Every shortcut on Microsoft's "Keyboard shortcuts in Word" page (support.microsoft.com, the
Windows and macOS tabs, read 2026-11-20), and "Use the keyboard to work with equations", against
Rikuy's command registry (`src/commands.js`, each `src/cmd/*.js`) and chord table (`src/keys.js`).

How to read it:

- **Mac**: Word for Mac's chord where it is not Word's Windows chord with Cmd for Ctrl. Rikuy
  binds Ctrl as Cmd on a Mac; a command's `mac` field gives a Mac its own chord, `keysMac` a chord
  bound on a Mac alone. Tooltips, menus and Help write a Mac's chords with ⌘ ⌥ ⌃ ⇧.
- **Status**: *works* (it did before this pass), *added* (in this pass, branch word-shortcuts),
  *browser* (a browser or the system keeps the key: what Rikuy offers instead), *other* (the key
  means something else in Rikuy, said why), *none* (no equivalent in a LaTeX document, said why).
- Keys are read by the key's place where a layout types a sign on a digit key (Ctrl and the 1 key is
  Ctrl+1 on a French keyboard), and never as Option and a character key on a Mac, where that types
  a character (Option+Shift+O is Ø): `test/keys.test.mjs` checks both.
- Keys act with the caret on the page unless the command's `keyScope` is `app` (anywhere but a
  field; function keys and Ctrl+Alt chords also from the source pane).
- `test/commands.test.mjs` (`WORD`) checks every *works* and *added* row's binding on Windows and
  on a Mac; `test/shortcuts.py` presses each added key on the page.

## Frequently used, files and windows

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Ctrl+O, Ctrl+F12, Ctrl+Alt+F2 | Cmd+O | Open | `open` | Ctrl+O works; Ctrl+F12 and Ctrl+Alt+F2 added (Linux keeps Ctrl+Alt+F2 for its consoles) |
| Ctrl+N | | New document | `new-document` (File › Blank document, New in the status bar) | browser: Chrome and Firefox open a window; Rikuy installed as an app hears it (app.js) |
| Ctrl+S, Shift+F12, Alt+Shift+F2 | Cmd+S | Save | `save` (the bar's Save): Rikuy keeps every edit in this browser as you type; Save writes it now and says "Saved in this browser" (in a git repository: where to commit and push). It downloads nothing | changed: Ctrl+S downloaded a file at every press; Shift+F12, Alt+Shift+F2 added |
| F12 | Cmd+Shift+S | Save As | `save-as`: Download LaTeX (the .tex, or the project as .zip) | added with the caret on the page; on a cross reference F12 is Go to Label (`go-to-label`, VS Code's Go to Definition; Shift+F5 comes back); anywhere else F12 stays the browser's developer tools (Ctrl+Shift+I opens them too). Cmd+Shift+S is Apply Styles here |
| Ctrl+W, Ctrl+F4 | Cmd+W | Close | in Rikuy installed as an app, Ctrl+W closes the source or PDF pane when open | browser: a browser tab never gives Ctrl+W to the page; it closes the tab |
| Alt+F4, Ctrl+F10, Alt+F5 | | Close Word, maximise, restore | | browser/system |
| Ctrl+P, Ctrl+Shift+F12 | Cmd+P | Print | `print` (Print PDF) | Ctrl+P opens Go to File (`go-to-file`, VS Code's quick open) with Print as its first line: Ctrl+P, Enter prints, as Word's Ctrl+P, Enter does; Ctrl+Shift+F12 prints at once |
| Ctrl+F2, Ctrl+Alt+I | | Print Preview | `preview` (the PDF beside the page) | added |
| Ctrl+X, Ctrl+C, Ctrl+V | | Cut, Copy, Paste | `cut`, `copy`, `paste` | works |
| Ctrl+Shift+V | | Paste text only | `paste-text` | works |
| Ctrl+Alt+V | Cmd+Control+V | Paste Special (older Word; Word 365's page: paste formatting) | `paste-special` | works; Mac's chord added |
| Ctrl+Alt+C | | Copy formatting (Word 365); © (older Word) | `insert-copyright`; copy formatting is `format-painter`, Ctrl+Shift+C | other: © as older Word |
| Ctrl+Z, Ctrl+Y | | Undo, Redo | `undo`, `redo` | works |
| F4 | | Repeat | `repeat` | works |
| Esc | | Cancel | closes the open dialog or menu | works |
| Ctrl+A | | Select all | `select-all` | works |
| Ctrl+Plus, Ctrl+Minus, Ctrl+0 | | Zoom in, out, 100% | zoom on the page | works |
| Ctrl+Alt+S, Alt+Shift+C | | Split the window, remove the split | Ctrl+\ shows the source beside the page; Side to Side | none: one document, one view of it |
| Ctrl+F6, Ctrl+Shift+F6 | Cmd+` | Next, previous document window | | none: one document a tab |

## The ribbon and panes

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Alt or F10 | | KeyTips on the tabs | H N G P S R W F, Y then 2 | works (tabs only; a command's own KeyTips are not drawn) |
| Alt+Q | | Search (Tell Me) | `search` (Mac: Control+Option+Q) | works |
| Ctrl+F1 | Cmd+Option+R | Collapse the ribbon | `ribbon-collapse` | works; Mac's chord added |
| Shift+F10, the menu key | | Right click menu | `context-menu` | works |
| Tab, arrows, Space, Enter, Down | | Move in the ribbon, open a menu | the ribbon's keys | works |
| Ctrl+Left/Right in the ribbon | | Group to group | | not yet: the ribbon's own keys (src/ribbon/tabs.js, the ribbon agent's file) |
| Ctrl+Shift+F10 | | Show the tooltip | | none: the browser shows tooltips by hover |
| F6, Shift+F6 | | Next pane (document, task pane, status bar, ribbon) | `next-pane`, `previous-pane` on Ctrl+F6, Ctrl+Shift+F6 | browser keeps F6 (address bar): Ctrl+F6 added, as in Word for the web |
| F1 | | Help | `help-how` | added |
| Alt+F10 | | Selection pane | | none: pictures are selected on the page |
| Alt+Z, A; Alt+B | | AutoSave; rename | | none: Rikuy saves as you type; File › Rename |

## Moving and selecting

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Arrows, Ctrl+Left/Right, Home, End, PgUp, PgDn, Ctrl+Home, Ctrl+End | Option+Left/Right | Move the caret | the browser's caret on the page | works |
| Ctrl+Up/Down | Cmd+Up/Down | Paragraph up, down | the browser's own caret keys | works as the browser does |
| Shift with each of those | | Select | the browser's | works |
| Ctrl+PgUp, Ctrl+PgDn | Cmd+PgUp/PgDn | Previous, next page | Go To (F5) a page; the Navigation pane's Pages | browser: switches tabs |
| Ctrl+Alt+PgUp/PgDn | | Top, bottom of the window | | none worth a key: PgUp and PgDn |
| Shift+F5, Ctrl+Alt+Z | | Go Back: the last four places edited | `go-back` (each edit its own place; a word typed on is one) | added |
| Ctrl+F | Cmd+F | Find (Navigation pane) | `find` | works |
| Ctrl+H | Control+H | Replace | `replace` | works |
| Ctrl+G, F5 | Cmd+Option+G, F5 | Go To | `go-to` | Ctrl+G works; F5 added with the caret on the page (it no longer reloads from there: Ctrl+R does; anywhere else F5 reloads, and Help says so) |
| Shift+F4, Ctrl+Alt+Y (an older Word key, not on today's page) | Shift+F4, Cmd+Shift+F4 | Repeat Find | `find-next` (selects what it finds); Cmd+G too on a Mac, as everywhere there | added |
| F8, Shift+F8 | | Extend mode, then the word, sentence, paragraph, document; one step back | `extend-selection`, `shrink-selection` | added: the first F8 turns extend mode on (the arrow keys extend the selection; Escape or a click ends it), as Word's |
| Ctrl+Shift+F8 | | Column selection | | none: prose has no columns of letters |
| Ctrl+Alt+5, Tab | | Floating shapes in turn | | none: floats are placed by TeX |

## Editing

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Ctrl+Backspace, Ctrl+Delete | Option+Delete | Delete a word | the browser's, as one edit of the source | works |
| F2, then Enter | | Move the selection | `move-text` (Escape, a click, an edit or any key but the caret's own ends the wait) | added (drag also moves) |
| Shift+F2, then Enter | | Copy the selection | `copy-text` | added |
| Ctrl+F3, Ctrl+Shift+F3 | Cmd+F3, Cmd+Shift+F3 | Spike: cut to it, put it all in | `spike`, `spike-insert` (in a heading or a cell its pieces join with spaces) | added |
| Alt+F3 | Option+F3 | New building block | `quick-part-save` | added |
| F3 (after a name) | | Insert a building block | Insert › Quick Parts | none: Chromium's F3 is Find again |
| Ctrl+Shift+C | Cmd+Shift+C | Copy formatting | `format-painter` | works |
| Alt+Shift+R | | Header like the section before | | none: LaTeX's headers are the document's |
| Ctrl+Shift+F7 | | Update linked information | | none |
| Alt+Shift+F10 | | Paste options, AutoCorrect actions | Paste's arrow; AutoCorrect undoes with Ctrl+Z | none as a key |

## Characters

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Ctrl+B, I, U | | Bold, italic, underline | `bold`, `italic`, `underline` | works |
| Ctrl+Shift+D | | Double underline | `double-underline` | works |
| Ctrl+Shift+W | | Underline words only | Underline | browser: closes the window; ulem has no such underline |
| Ctrl+Shift+A, Ctrl+Shift+K | | All caps, small caps | `all-caps`, `small-caps` | works |
| Ctrl+Shift+X (Mac; Word Windows has none) | Cmd+Shift+X | Strikethrough | `strikethrough` | works |
| Ctrl+= / Ctrl+Shift+= (Word's key table; the page now says Ctrl+Shift+Minus and Ctrl+Shift+Plus) | Cmd+=, Cmd+Shift+= | Subscript, superscript | `subscript` Ctrl+, , `superscript` Ctrl+. | other: Ctrl+= and Ctrl+Plus zoom the page, as on every web page |
| Ctrl+Shift+H | | Hidden text | | none: TeX prints every word; hidden text is a LaTeX comment |
| Ctrl+D, Ctrl+Shift+F | Cmd+D, Cmd+Shift+F | Font dialog; the font box | `font-dialog`, `font-name` | works |
| Ctrl+Shift+P (an older Word key, not on today's page) | Cmd+Shift+P | The font size box | `font-size` | added (Firefox keeps it for a private window) |
| Ctrl+Shift+>, Ctrl+Shift+< | | Font size up, down | `grow-font`, `shrink-font` | works |
| Ctrl+], Ctrl+[ | | Font size by a point | `grow-font`, `shrink-font` (LaTeX's next size) | works; not on a Mac (Cmd+[ and ] are back and forward) |
| Shift+F3 | | Change case | `change-case-cycle` | works |
| Ctrl+Space | Control+Space | Clear character formatting | `clear-char-formatting` | works; Mac's chord added (Cmd+Space is Spotlight) |
| Ctrl+Q | | Clear paragraph formatting | `clear-paragraph-formatting` | works (Firefox on Linux keeps it to quit) |
| Ctrl+Shift+Q | | Symbol font | Insert › Symbol | none: a Windows font |
| Alt+X | | A character's code and back | `unicode-toggle` (Mac: Control+Option+X); after a LaTeX accent, caf\'e, the code of é | added |
| Alt and a number on the pad | | A character by its ANSI code | the system types it | works |

## Special characters

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Shift+Enter | Shift+Return | Line break | `insert-newline`, \\\\ | works |
| Ctrl+Enter | Cmd+Return | Page break | `page-break` (in a table cell: a row below) | works |
| Ctrl+Shift+Enter | | Column break | `column-break` | works |
| Ctrl+Shift+Space | Option+Space | Nonbreaking space | `insert-nbsp`, ~ | works |
| Ctrl+Shift+Minus | Cmd+Shift+Minus | Nonbreaking hyphen (the page now lists Alt+Shift+Minus, which is Collapse in Outline) | `insert-nb-hyphen` | works |
| Ctrl+Minus (older), Ctrl+Alt+Minus (page) | | Optional hyphen | `optional-hyphen`, \\- (Layout › Hyphenation) | other: Ctrl+Minus zooms; Ctrl+Alt+Minus is the em dash without a number pad |
| Ctrl+Alt+Num - | Option+Shift+Minus | Em dash | `insert-em-dash` (also Ctrl+Alt+Minus) | added (the pad's key); a Mac types it itself |
| Ctrl+Num - | Option+Minus | En dash | `insert-en-dash` | added; a Mac types it itself |
| Ctrl+Alt+C, Ctrl+Alt+R, Ctrl+Alt+T | Option+G, Option+R, Option+2 | ©, ®, ™ | `insert-copyright`, `insert-registered`, `insert-trademark`; AutoCorrect's (c) | works; on a Mac the keyboard's Option keys (Cmd+Option+R is the ribbon there) |
| Ctrl+Alt+. | Option+; | Ellipsis | `insert-ldots` | works |
| Ctrl+` then a letter, Ctrl+' , Ctrl+Shift+^ , Ctrl+Shift+~ , Ctrl+Shift+: , Ctrl+Shift+@ , Ctrl+Shift+& , Ctrl+/ | Option+`, E, I, N, U | à é ê ñ ü å æ œ ß ø ð | `accent-grave`, `accent-acute`, `accent-circumflex`, `accent-tilde`, `accent-umlaut`, `accent-ring`, `accent-ligature`, `accent-slash` | added; on a Mac the Option keys type accents themselves |
| Ctrl+, then c | | ç | | other: Ctrl+, is Subscript here |
| Ctrl+Alt+Shift+? , Ctrl+Alt+Shift+! | Option+Shift+/ , Option+1 | ¿ ¡ | `insert-iquest`, `insert-iexcl` | added |

## Paragraphs and styles

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Ctrl+E, L, R, J | | Center, left, right, justify | `align-center`, `align-left`, `align-right`, `justify` | works |
| Ctrl+1, Ctrl+2, Ctrl+5 | Cmd+1, 2, 5 | Line spacing 1, 2, 1.5 | `line-spacing-1`, `line-spacing-2`, `line-spacing-15` (setspace) | added (on the page only: elsewhere Ctrl and a digit stays the browser's tab) |
| Ctrl+0 | Cmd+0 | Space before the paragraph (Mac; Windows' page: zoom 100%) | `space-before` | other: Ctrl+0 is zoom 100% |
| Ctrl+M, Ctrl+Shift+M | Control+Shift+M, Cmd+Shift+M | Indent, remove the indent | `paragraph-indent`, `paragraph-outdent`; Tab in a list | other: Ctrl+M is a formula here; Mac's Control+Shift+M added |
| Ctrl+T, Ctrl+Shift+T | Cmd+T | Hanging indent, remove it | `hanging-indent` (search box; on then off gives the bytes back), Paragraph… › Special | browser: new tab, reopen tab |
| Ctrl+Q | | Clear paragraph formatting | `clear-paragraph-formatting` | works |
| Ctrl+Alt+K | Cmd+Option+K | AutoFormat now | `autoformat-headings` is AutoFormat as you type | none as a key |
| Ctrl+Shift+N | Cmd+Shift+N | Normal | `style-normal`, also Ctrl+Alt+0 | works where the browser lets it (Chrome keeps it for a private window) |
| Ctrl+Alt+1, 2, 3 | Cmd+Option+1, 2, 3 | Heading 1 to 3 | `style-heading1` to 3 (and Ctrl+Alt+4) | works |
| Ctrl+Shift+S | | Apply Styles | `apply-styles` | works |
| Ctrl+Alt+Shift+S | | Styles pane | `styles-pane` | works |
| Ctrl+Shift+L | Cmd+Shift+L | Bulleted list | `bullets` | works |
| Ctrl+Shift+8 | Cmd+8 | Show marks | `show-marks` | works; Mac's chord added |

## Outline and headings

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Alt+Shift+Left, Right | Control+Shift+Left, Right | Promote, demote | `promote`, `demote` | works |
| Alt+Shift+Up, Down | Control+Shift+Up, Down | Move up, down (in a table: the row) | `move-up`, `move-down`; `table-row-up`, `table-row-down` | works; the table's rows added |
| Alt+Shift+Plus, Minus | Control+Shift+Plus, Minus | Expand, collapse | `heading-expand`, `heading-collapse` | works |
| Alt+Shift+A | Control+Shift+A | Expand or collapse all | `headings-expand-all`, `headings-collapse-all` | added |
| Alt+Shift+1 to 9 | Control+Shift+1 to 9 | Show headings to that level | `show-level-1` to `show-level-9` | added |
| Alt+Shift+L | Control+Shift+L | First line of the text alone | | none: the page shows a paragraph whole or collapsed |
| Num / | | Show character formatting | | none |
| Ctrl+Tab | Option+Tab | A tab in Outline or a cell | | browser: next tab; LaTeX has no tab character in text |

## Tables

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Tab, Shift+Tab | | Next, previous cell (a row at the end) | the page | works |
| Alt+Home, Alt+End | Control+Home, End | First, last cell of the row | `cell-row-first`, `cell-row-last` | added |
| Alt+PgUp, Alt+PgDn | Control+PgUp, PgDn | Top, bottom cell of the column | `cell-col-first`, `cell-col-last` | added |
| Alt+Shift+Up, Down | Control+Shift+Up, Down | Move the row | `table-row-up`, `table-row-down` | added |
| Alt+Num 5 (Num Lock off) | | Select the table | `select-table` (Alt+Clear) | added |
| Shift+Alt+Home, End | | Select the row from its first or last cell | `select-row` | none as a key |
| Enter in a cell | Return | A paragraph in the cell | the page | works |

## References, review, fields

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Ctrl+K | Cmd+K | Insert a link | `link` | works |
| Ctrl+Alt+F | Cmd+Option+F | Footnote | `footnote` | works |
| Ctrl+Alt+D | Cmd+Option+E | Endnote | `endnote` | works; Mac's chord added (Cmd+Option+D is the Dock) |
| Alt+Shift+>, Alt+Shift+< | Control+Shift+>, < | Next, previous footnote | `next-footnote`, `previous-footnote` | added |
| Alt+Shift+O | | Mark a contents entry | `toc-add-text` (the heading's place in the contents; Mac: Control+Shift+O, Option+Shift+O types Ø) | added |
| Alt+Shift+X | | Mark an index entry | `mark-entry` (Mac: Control+Shift+X) | works; Mac's chord added |
| Alt+Shift+I | | Mark a citation | `mark-citation` (Mac: Control+Shift+I) | works; Mac's chord added |
| Alt+Shift+F12 | | The contents' button | | none |
| Ctrl+Shift+F5 | Cmd+Shift+F5 | Bookmark | `bookmark` | added |
| Ctrl+Alt+M | Cmd+Option+A | New comment | `comment-new` | works; Mac's chord added (Cmd+Option+M minimizes) |
| Ctrl+Shift+E | | Track Changes | `track-changes` | works |
| F7 | Cmd+Option+L | Spelling | `spelling` | works; Mac's chord added (Safari keeps it for Downloads) |
| Alt+F7 | Option+F7 | Next misspelling | `spelling-next` (selected, with its suggestions) | added |
| Shift+F7 | | Thesaurus | `thesaurus` | works |
| Alt+Shift+F7 | | Translator | | none |
| Ctrl+Shift+G | Cmd+Shift+G | Word Count | `word-count` | works |
| Alt+Shift+D, Alt+Shift+T | Control+Shift+D, T | Date, time | `insert-date`, `insert-time` | works |
| Alt+Shift+P | Control+Shift+P | The page's number | `insert-page-field` (\\thepage) | added |
| Ctrl+Alt+L | Cmd+Option+Shift+L | LISTNUM field | | none: LaTeX numbers its lists |
| Ctrl+F9 | Cmd+F9 | A field | `insert-field` (the Field dialog) | added |
| F9 | | Update fields | | none needed: the page and the PDF follow every edit |
| Shift+F9 | | A field's code | `show-latex` (its LaTeX, where it stands) | works |
| Alt+F9 | Option+F9 | Every field's code | `latex-mode` (the document as its LaTeX) | added |
| Ctrl+Shift+F9 | Cmd+Shift+F9 | Unlink a field | | none: a LaTeX command stays a command |
| F11, Shift+F11, Alt+F1, Alt+Shift+F1 | | Next, previous field | | browser keeps F11 (full screen); nothing to step through |
| Ctrl+F11, Ctrl+Shift+F11 | | Lock, unlock a field | | none |
| Alt+Shift+F9 | | GOTOBUTTON, MACROBUTTON | | none |
| Alt+Shift+K, N, M, E, F | | Mail merge | | none: no mail merge |
| Alt+F8, Alt+F11 | | Macros, VBA | | none |

## Views

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Ctrl+Alt+P | Cmd+Option+P | Print Layout | `print-layout` | added |
| Ctrl+Alt+O | Cmd+Option+O | Outline | `outline-view` | works |
| Ctrl+Alt+N | Cmd+Option+N | Draft | `draft` | added |
| Alt, W, F | | Read Mode | `read-mode` (View tab: Alt, W, then Tab to it) | works by the tab's KeyTip |
| Shift+F1 | | Reveal Formatting | `show-in-source` (the place's LaTeX in the source pane) | added |

## Equations

| Word | Mac | What it does | Rikuy | Status |
|---|---|---|---|---|
| Alt+= | Control+= | New equation | `insert-equation` | works |
| Ctrl+Shift+= (in an equation) | Cmd+Shift+= | To linear format | the equation field's LaTeX (Show LaTeX) | works |
| Ctrl+= (in an equation) | Cmd+= | To professional format | the equation drawn again | works in the field |
| Arrows, Ctrl+arrows, Home, End, Shift with them | | Move and select in an equation | MathLive's | works |
| Space after \alpha and the like | | Math AutoCorrect | MathLive's | works |

## Where it lives

- Chords and their matching: `src/keys.js` (`matches`, the number pad's keys, Alt+Shift and a
  digit, AltGr; `keyLabel`, `keyTitle`, `keysInText` for a Mac's ⌘; `KEPT`, the browser's keys
  Help lists).
- Commands added: `src/cmd/typing.js` (Alt+X, the accents, ¿ ¡, the Spike, F2 and Shift+F2),
  `src/cmd/find.js` (Find Next, Go Back, Extend and Shrink Selection, Show Level 1 to 9),
  `src/cmd/para.js` (line spacing 1, 1.5, 2; Hanging Indent), `src/cmd/table.js` and
  `src/table.js` `moveRow` (cells and rows), `src/cmd/frame.js` (Next and Previous pane),
  `src/cmd/review.js` (Next Misspelling), `src/cmd/parts.js` (Page Field); keys on existing
  commands in their own modules.
- None of them has a ribbon place (the ribbon tabs agent owns `src/ribbon/order.js`): the search
  box, the right click menu where they have one, Help and agents reach them by name.
