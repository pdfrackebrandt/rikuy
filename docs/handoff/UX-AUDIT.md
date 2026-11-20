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
- **Comments open on the left** (MEDIUM, medium; open): Comments opens the side panel's Review
  tab, at the left, with Changes and Versions in the same list. Word's Comments pane is at the
  right with the comment cards alone; the docking of finding 5 is where it could go.
- **A first comment asks for a name** (LOW): Word takes the account's name; a browser has none,
  so asking once is right. Ctrl+Enter with no name leaves the comment unsent with the name box
  focused, which reads as nothing happening; it could say why.
- **Help is a narrow popover** (LOW, medium; open): How Rikuy works opens over the ribbon's end
  with a two column table of keys wrapped word by word. Word's Help is a pane at the right.
- **The page on a phone is drawn at 58 to 62 %** (MEDIUM, a decision for Pedro): the text block
  fills the screen's width, so a line of text is about 7 px high. Word's phone app opens a
  document in a reflowed view; Rikuy's Web Layout is that (the text at its actual size, lines as
  wide as the screen), and could be a phone's first view. Its lines break where the browser
  breaks them, not where TeX does, which is why it is not the default now.

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
