# Rikuy outside the ribbon, as a newcomer meets it: the audit of 2026-11-20

Met on the built page (`npm run build` of main 395faad, with `dist/tex`) in Chromium at 1920 and
1366 px, and on phones at 390 and 360 px with touch, light and dark; the hosted app as `pages.py`
serves it for the first visit and offline. The scripts and screenshots of the walk were in
`/tmp/ux-audit` and `/tmp/ux-shots/audit`; `test/ux.py` keeps what was fixed as checks.

Each finding says where, what a Word user expects there, what Rikuy did, and what it costs to fix.
They are ranked by how much they hurt someone using Rikuy for the first time: something that
loses their typing first, then something that looks broken, then what is only unlike Word.
**Status** says what is fixed and by which commit message; whoever carries on takes the first
open one. Findings in another agent's files are at the end, under that agent.

## Where it stands (branch `ux-pass-2`, draft PR 79)

Fixed: findings 1 to 8, the PDF bar on a phone (9), Download PDF's progress, a first comment's
name, phones opening in Mobile View and Help as a pane (10); each a commit with its part of
`test/ux.py`. Open: the rest of 9, and the other agents' findings at the end. Comments opening at the left stays: Word's Reviewing pane, which lists comments and
changes together as Rikuy's Review tab does, docks at the left too.

## Perceived speed (measured, not ranked)

| what | number | how |
|---|---|---|
| first visit on a cable line (20 Mbit/s, 40 ms): first paint, document on the page, a key typed lands | 0.30 s, 1.27 s, 1.42 s | `dev/bench_load.py --profiles cable --scenarios cold,warm --runs 1` |
| the same, the first PDF with Preview pressed at once | 19.6 s (18.1 s after the press; 27 MB of TeX on the wire) | same |
| repeat visit: document on the page, PDF (the pane opens by itself) | 0.78 s, 5.5 s | same |
| a keystroke on `dev/bench_native_page.py`'s long document, desktop speed | 70 ms (the model 55 ms of it) | `dev/bench_native_page.py -n 20` |
| the same at a phone's speed (CPU slowed 6 times, 390 px) | 500 ms (the model 323 ms) | `... --cpu 6 --width 390` |

The first visit is quick to type in. The keystroke on a long document at a phone's speed (half a
second) is the one number a Word user would call slow; it is the model's and the C++ track's
(PLAN.md's later item), not a fix of this pass.

## Findings, ranked

### 1. Closing a dialog loses the caret (HIGH, small) — fixed

- **Where:** every dialog of the dialog shell (`makePop`): Font, Paragraph, Page setup, Insert
  Table, Share and the rest, at every width.
- **Word:** Esc, Cancel or the Close button gives the document back with the caret or the
  selection it had; the next key types there.
- **Rikuy did:** the focus fell to the page's body. The next keys typed nothing until a click on
  the page (checked: type after Esc, the source unchanged for Font, Paragraph, Page setup, Insert
  Table and Share).
- **Status:** fixed ("Give the caret back to the page when a dialog closes"). A press outside a
  dialog still puts the caret where it lands; a dialog that changed the document leaves the caret
  where its change put it; on a touch screen the page is focused again only if it had the focus
  (so the on-screen keyboard does not come up unasked). `test/ux.py dialogs`, `phone_dialogs`.

### 2. The first visit has no caret: keys do nothing until a click (HIGH, small) — fixed

- **Where:** the first visit and every reload; `placeInitialCaret` in `src/app.js` was empty from
  the start (it found the first paragraph and returned).
- **Word:** a document opens with the caret at its start; typing works at once.
- **Rikuy did:** the focus was on the body; a newcomer who types first sees nothing happen.
- **Status:** fixed ("Open with the caret at the start of the first paragraph"): on a desktop the
  first key typed lands there, the page does not scroll, one Undo takes it back; on a touch screen
  the page is left unfocused (the keyboard stays down). `test/ux.py first_visit`.

### 3. The File view does not behave as a view (HIGH, medium) — fixed

- **Where:** File (PR 75's backstage): `body.file-open` in `src/ribbon/tabs.js` and `app.css`.
- **Word:** File is a view over the whole window with a back arrow; Esc or the arrow returns to
  the document; picking an action closes it.
- **Rikuy did:** Esc left it open; it stayed open while Preview, a TeX error and new documents
  came and went; it covered only the ribbon's height, so on a 1366 or 1920 px window the page and
  the PDF pane showed below it, cut off; there was no way back but another tab.
- **Status:** fixed ("Make File a view over the window, with Back, as Word's"): File takes the
  window between the tabs and the status bar (the page keeps its width under it, so nothing is
  laid out again); Back to the document, Esc, or any command run from it close it and bring back
  the tab that was open before; Esc and Back give the caret back. A menu of File (Templates,
  Recent, Export as) keeps it open until an item is chosen; Esc closes the menu first. On a phone
  it is a column under the tab list with every command's name. `src/ui/fileview.js`, two lines in
  `src/ribbon/tabs.js`'s `selectTab` (the ribbon tabs agent's file); `test/ux.py file_view`.
  `test/agent.py` presses Back before it presses a picture on the page (the page is under the view,
  as in Word).

### 4. The status bar cuts off the zoom (MEDIUM-HIGH, small) — fixed

- **Where:** the status bar of the hosted app at 1366 px and narrower desktops.
- **Word:** page, words, proofing and language at the left; views, the zoom slider and the zoom
  percentage always at the right. A click on the word count opens Word Count.
- **Rikuy did:** with Make available offline, "Kept in this browser", New document and Load the
  sample in the middle, the row ran past the window and the zoom percentage was cut off (it
  scrolls sideways, with a fade). "Kept in this browser" says what the title's "Saved" already
  says. The word count was not a button.
- **Status:** fixed ("Keep the status bar's views and zoom in sight; the word count opens Word
  Count"): the storage line shows only when it says something the title does not (not kept,
  figures not kept, Word's progress), and the title's Saved carries "Saved in this browser" as its
  tooltip; between 861 and 1279 px the zoom slider goes first (its number stays) and the language
  is cut short with an ellipsis; the word count is a button that opens Word Count. Checked on the
  hosted app at 1920, 1366, 1280, 1100 and 900 px: `test/ux.py status_bar`.

### 5. Task panes float over the ribbon and the page (MEDIUM, medium) — fixed

- **Where:** the Styles pane (`#stylespane`, at x 1100, y 128 on 1366 px), the Spelling pane
  (`#sp-pane`) and Find and Replace (`#fr`, both at x 896, y 112).
- **Word:** task panes dock at the right below the ribbon; the page moves over and stays whole.
- **Rikuy did:** they sat over the right end of the ribbon (covering Find, Replace and the
  downloads) and over the page's text.
- **Status:** fixed ("Dock the Styles, Spelling and Thesaurus panes at the right, as Word's"): from
  1000 px they are #main's last column, from under the ribbon to the status bar, and the page
  moves over; narrower they stay sheets. Find and Replace stays a floating dialog, as Word's is.
  `test/ux.py panes`. Finding 1's caret is given back by dialogs only: a menu closed with Esc
  gives the focus to its button (`styles.py`'s More check).

### 6. Phones: the title bar shows no document name and no Saved (MEDIUM, small) — fixed

- **Where:** `.title-name` is hidden below 861 px.
- **Word (phone):** the document's name at the top.
- **Rikuy did:** nothing names the document on a phone; Saved or Not saved is not shown.
- **Status:** fixed ("Name the document on narrow windows and phones; Make available offline in
  the phone's menu"): below 861 px the name is beside the search's magnifier wherever the bar's
  middle has 120 px (so from about 520 px; a name cut to its first letters said nothing on a
  390 px phone), and the menu panel (the bar's first button) starts with the name and Saved on
  every window up to 980 px. `test/ux.py doc_name`.

### 7. The sample opens with 16 spelling errors (MEDIUM, small) — fixed

- **Where:** the built in sample (`sample/main.tex`).
- **Rikuy did:** the first page a newcomer sees has red marks under Rikuy (its own name), Ctrl,
  Cmd, TikZ, WebAssembly, recompiles, pdf and the British "emphasise" in a US English document,
  and the status bar's red dot says "16 spelling errors".
- **Status:** fixed ("Open the sample without red marks"): `sample/main.tex` has its own word list
  (`% rikuy: words Rikuy Ctrl Cmd TikZ WebAssembly recompiles pdf`, what Add to Dictionary writes,
  so it also shows the feature) and "emphasize". `test/ux.py sample_spelling`.

### 8. Phones cannot reach Make available offline (MEDIUM, small) — fixed

- **Where:** `#b-offline` is hidden at 520 px and below; it is no command, so search does not find
  it either. The offline message in the PDF pane says to use it "in the status bar".
- **Rikuy did:** on a phone the advice names a control that is not there.
- **Status:** fixed with 6: the menu panel lists Make available offline where the installed app
  shows it (saying what it is doing, as the status line's link does), the offline message says
  "in the status bar, or the menu on a phone", and the panel's actions are 44 px under a finger.
  `test/ux.py status_bar` (on the hosted app at 390 and 360 px).

### 9. Smaller ones (LOW)

- The PDF pane's bar on a phone cuts its words: "pdfLaTe…", "Auto: pdfL", "Shell", and its
  buttons were 20 to 26 px tall. **Fixed** ("Lay the PDF bar out in two rows on a phone"): what
  TeX made and Close, then the engine, shell escape, Recompile and Download, all 44 px under a
  finger; `test/ux.py pdf_bar`.
- Dialogs open beside their ribbon group, not centred as Word's; they are not modal, on purpose
  (the page stays in reach).
- On a phone the Spelling pane stays open when Esc is pressed with the focus on the page.
- The Styles pane draws its names grey (as if disabled) until the caret is on the page.

### 10. A second look (after fixes 1 to 8)

- **Download PDF before a PDF exists** (LOW, small) — fixed ("Say what TeX is doing in the status
  bar while Download PDF compiles"): the ribbon's button said "Making the PDF…" for the whole run
  (9 s on this machine) and nothing else did; the status bar now says TeX's stage ("Making the
  PDF: Fetching packages…"), as Word shows a PDF being published there. `test/ux.py download_pdf`.
- **Comments open on the left** (LOW; kept): Comments opens the side panel's Review tab, at the
  left, with Changes and Versions in the same list. Word's Comments pane is at the right, but its
  Reviewing pane, the one that lists comments and changes together as this tab does, docks at
  the left.
- **A first comment asks for a name** (LOW, small) — fixed ("Ask a first comment's name first,
  and say why when it is missing"): Word takes the account's name; a browser has none, so asking
  once is right, but the box opened at the comment and Comment with no name only changed a
  placeholder, which read as nothing happening. The name box now comes first (Enter goes on to the
  comment), and a missing name is marked and said. `test/ux.py first_comment`.
- **The page on a phone is drawn at 58 to 62 %** (MEDIUM) — fixed ("Open phones in Mobile View,
  Print Layout one tap away"): the text block filled the screen's width, so a line of text was
  about 7 px high. Word's phone app opens a document in Mobile View, reflowed; Rikuy's Web Layout
  is that, and is now the default on a window under 700 px as the page opens: the text at its
  actual size (13 px and up), every line inside the screen, no sideways scroll. "Mobile View" in
  the status bar (44 px) turns it off for Print Layout and on again; the choice is kept on the
  device (prefs.narrowWeb, apart from a wide window's Web Layout). The zoom button there makes the
  text a quarter larger and back. Typing, Enter, selecting, Bold and the style list of the phone's
  ribbon row, and the on-screen keyboard work in it. `test/ux.py mobile_view`. The suites written
  for a phone's Print Layout open in it (`test/browser.py`'s `PRINT_LAYOUT`, as a tap would).
- **Help is a narrow popover** (LOW, medium) — fixed ("Help as a pane at the right on a wide
  window, as Word's"): from 1000 px Help is a pane at the right that stays while the page is
  worked on; Close, Esc in it, or Help again close it. `test/ux.py help_pane`.

### 11. The hostile review of PR 79 (`/tmp/review-ux.md`), answered

H1 and M2 (File's keys in the hidden page; Tab and screen readers there), M1 (Esc with a pane
docked), L4, L5, L8 and M6 in "File view: the keys stay in it…"; H2, M3 and M5 (the caret by its
place in the source; the line kept in view) in "Give the caret back by its place in the source…";
M4 (panes squeezing the page) in "One task pane docked at a time…"; L1, L2, L3, L6, L7 in "The
review's lows…"; the backstage at 1920 px in "File's Home, as Word's backstage…". L9 stays (a
menu opened by mouse and closed with Esc gives the focus to its button, as a menu button does);
the top bar's "Fit" beside the status bar's percentage stays (one names the mode, the other the
size), open for the owner.

### 12. The verification of 933773d (N1 to N6), the zoom, one size per kind

N1 in "Keep the reader's place by its source position…"; N2 and N3 in "File's view by the keys; a
dialog's opener gets the focus back"; N4, N5, N6 and the zoom in "The zoom said as a percentage…":
the top bar's zoom button now shows the percentage the status bar shows (Word shows the
percentage; its name stays Fit width, what a press does). The consistency pass applies
`UI-PRINCIPLES.md` outside the ribbon:

| kind | before | now |
|---|---|---|
| a dialog's buttons (Font, Paragraph, Page setup, Insert Table, Share, Properties), Find and Replace's, the Styles pane's | 26 px, 6 px corners | 32 px, 4 px; 44 px under a finger |
| a dialog's fields | 28 to 36 px | at least 32 px; 44 under a finger |
| a dialog's, a pane's and Find and Replace's name | 12 to 12.5 px, three line heights | 14 px semibold, 20 px line |
| a dialog's, Find and Replace's corners | 10 px | 8 px |
| a dialog's Close on a phone | 20 px | 44 px |
| the comment's Comment button on a phone | 26 px | 44 px |
| a phone's top bar (390, 360 px) | 28 to 34 px; the search a white pill | 44 px each; the search drawn as the bar's other icons until it opens; Open and Source by name in the menu panel |
| the status bar's words | 12 and 12.5 px | 12 px; its views 22 px with 4 px corners, Mobile View as tall as the views' frame |
| File's column, its tiles, its recent rows | 30 px with 6 px corners; tiles of two heights; 8 px corners | 32 px, 4 px; one height; 4 px, rows 32 px; a ring for the keyboard on tiles and rows |
| spacing in the File Home, the Help pane, the views | 22, 14, 10, 9, 6, 5 px | 4 px steps |

Tooltips added where there was none or a stale one: New document, Load the sample, the zoom.
`ux.py consistency` measures all of it at 1366 and 1920 px (light and dark) and at 390 and 360 px
with touch, and fails on the old sizes (20 of its checks did before this pass).

### 13. The verification of 0a6ef7b and UI-PRINCIPLES.md, outside the ribbon (branch `ux-consistency-2`)

Each a commit with its part of `test/ux.py`, which fails on the code before it:

| finding or rule | was | now | part |
|---|---|---|---|
| R2: AutoCorrect's Add at 360 px; Insert Table's Cancel and OK on touch | 44 by 64 px; 32 px wide, "Cancel" spilling | whole, 44 px tall and at least as wide (a phone's bar rule kept out of dialogs) | `dialog_kinds` |
| fields in Properties, the comment, Share's name, AutoCorrect, Symbols' search | 36 px, 6 px corners | 32 px (44 under a finger), 4 px; a number field's box is the field | `dialog_kinds` |
| tabs inside Paragraph, Find and Replace, Symbols; check box and radio rows | 29 to 31 px; 18 to 19 px | 32 px (44); at least 24 px (44) | `dialog_kinds` |
| Symbols' cell focused by Tab | no outline | a 2 px outline | `dialog_kinds` |
| dark mode's primary buttons; the selected search result | white on #6AAEE3, 2.4:1; white on pale blue, 1.25:1 | #0B1621 on the blue (about 7.5:1); the window's ink | `contrast` |
| Check accessibility from the ribbon, AutoCorrect Options from the search box (N7) | the focus stayed in the page | the dialog takes it (its first control; under a finger never a text field) | `focus_rules` |
| Tab from Word Count's Close | walked out of the dialog | goes round inside it, Shift+Tab too | `focus_rules` |
| a dialog opened by the keys from a ribbon button (N7) | the focus went to the page | back to that button; one opened by a press gives the page its caret | `focus_rules` |
| Back's ring after a press on File | shown | only when the keys opened File | `focus_rules` |
| R3: the phone's bar at 320 px (T3) | Search 10 px into Share; gaps of 0 to 2 px | 8 px apart; under 380 px Redo in the menu panel, the zoom 44 px | `bar_room` |
| the ruler's markers (T5) | a drag or the arrow keys only | a double click opens the Paragraph dialog or Page setup, as Word's | `tap_alternatives` |
| motion (M1 to M3) | background fades, a width transition, 120 ms transitions | opacity and transform only, 50 ms steps; reduced motion: nothing moves | `motion` |
| the right click menu (C11, C13, P2) | "Show in source", "Font Settings" with no "…", a box shadow ring | capitalised, four words at most, "…" on the items that open a dialog (the registry's `dialog`), an outline ring | `menus` |
| empty panes (N5) | Navigation: two sentences with \section in them | one sentence and Apply Heading 1; File's Recent: one sentence and Open a file | `empty_panes` |
| the on-screen keyboard (T6) | a dialog's lower field left under it | scrolled into sight inside every box round it | `keyboard_room` |
| targets under a finger (T3) | status bar views, a dialog's tabs and rows 2 to 6 px apart | 8 px | `target_gaps` |
| tooltips of the bar, the status bar, File's Home (C14) | the description alone, some without keys | name, keys, what it does | `tooltips` |
| text spacing (L8) | held | kept by a check | `text_spacing` |

Left as they are: tooltips stay the browser's own (`title`), which WCAG 1.4.13 leaves to it; the
ribbon's tooltips, galleries (C4) and File's column (drawn by the ribbon) are the ribbon agent's;
the status bar shortens its words with "…" where it is short of room, at any spacing.

## Findings for other agents

### Ribbon tabs (`src/ribbon/`, the ribbon's CSS)

- Dark mode: the open tab's name (Home) is drawn in a blue barely lighter than the band behind it
  at 1366 and 1920 px (see `/tmp/ux-shots/audit/first-1366-dark.png`).
- The File view's open and close live in `tabs.js`; finding 3 touches it as little as it can.
- While Download PDF runs, its label grows to "Making the PDF…" and the download group runs over
  Home's Editing group at 1366 px ("Replac", "Selec" cut; `/tmp/ux-audit/dl-pdf-progress.png`):
  the label could stay "PDF" with `aria-busy` and a spinner, now that the status bar says what
  TeX is doing.

### Shortcuts (`src/keys.js`, the keys of commands)

- Ctrl+S downloads the LaTeX source (a new file in Downloads at every press); a Word user presses
  it by habit, and the document is already kept in the browser. Word's Ctrl+S saves where the
  document lives and says Saved; Save As (F12) is where a copy is made.
