# Hostile review: ux-pass-2 (PR 79) at 2ecdb95

Built `dist/` in /home/claude/wt-ux-rev, no TeX tree (Download PDF's progress not run). Baseline for
"regression or not": main 4063ad1 built to /tmp/review-ux-out/main-src/dist (`RIKUY_NO_WORD=1`).
Scripts: /tmp/review-ux-out/probe1.py to probe6.py; logs p1.log, p2.log, p3.log, p4.log, p4b.log;
screenshots /tmp/review-ux-out/shots/.

## Verdict

**Changes requested.** The suites are green, but two HIGH problems ship with this branch: the File
view leaves the keyboard in the hidden document (keys typed in File edit it unseen, and Word's own
habit of Alt, F, a letter does exactly that), and docking the Spelling pane re-lays out the page so
F7 then Esc puts the caret at the document's start at 1000 to about 1700 px (main keeps it on the
misspelling).

## HIGH

**H1. File view: the keys go to the hidden page.** `src/ui/fileview.js:15` (fileViewChanged),
`src/app.css:310`. File opened by a click on its tab, or by Alt then F, leaves `document.activeElement`
on `#pages` under the view. Typing "xyz" changes the source; Alt, F, N (Word's New) types "n" into
the document (p1.log: "typing in File view changed hidden doc => true", "after Alt,F typing n changed
hidden doc => true"). No KeyTips are shown on File's commands.
Repro: click in a paragraph, click File, type, press Back: the letters are in the text.
Fix: when the view opens, set `#main` (and the status bar) `inert`, focus `#rf-back` or the first
command; clear `inert` on close before `restoreCaret`. Give File's commands KeyTips as Word does
(N, O, I, E, P, T), or at least swallow printable keys while the view is open. Test in
`ux.py file_view`: type after opening by click and by Alt, F; source unchanged.

**H2. Regression: a docked pane re-lays out the page and the caret is lost.** Docking narrows
`#desk`; the ResizeObserver (`src/app.js:481`) finds a new fit zoom and calls `relayout(true)`; the
pane's close uses `ribbonBack` (`src/ui/spellpane.js:46`, `src/ribbon.js:104`), whose kept DOM Range
was drawn again and collapsed, so the caret goes to the page's start.
- F7 then Esc or the pane's Close, caret in "Sec|ond": branch at 1366 and 1100 px types at
  `\section{XOpening}`; main 4063ad1 types over the selected misspelling, as Word does (probe6).
  At 1920 px (no zoom change) the branch is right, which isolates the cause.
- Styles pane opened at 1100 px on a long document: the caret goes from y 387 (in view) to y -2520;
  at 1024 the first line in view jumps from Part 61 to Part 88 (p3.log, p2.log).
Fix: panes keep the caret as source offsets (`caretNow()` then `restoreCaret()`, as `closePop`'s
`back` now does), not a Range; and the relayout from the ResizeObserver keeps the caret's (or the
first visible line's) source position where it was. Test: `ux.py panes` at 1366 and 1100: F7, Esc,
type lands on the misspelling; caret in view after a pane opens and closes on a long document.

## MEDIUM

**M1. Esc does not close File while the Styles or Spelling pane is docked.** `src/ui/fileview.js:60`
treats any `[role=listbox]` with an `offsetParent` as an open menu; the docked panes' lists sit in
`#main`, which is 0 px tall but still has an offsetParent. Esc then does nothing visible and the next
key edits the hidden page ("SecEond", p4.log; esc-file-styles-pane-1366.png). Thesaurus is not
affected. Fix: `!m.closest('#main, #nav')` (or `!m.closest('[inert]')` after H1).

**M2. Screen readers read the document under File.** `#main` is neither `inert` nor `aria-hidden`
(p1.log), the aria snapshot holds the document's text, and the first Tab from Back goes into the
hidden `#pages`. Same fix as H1.

**M3. Word Count from the new status bar button loses the caret.** `src/app.js:2394`: `pageHad`
counts only `#ribbon, #rb-top`; a click on `#st-words` focuses that button, so Esc or Close leaves
focus on BODY and keys type nothing (p4.log). Fix: add `#status` to the list, or keep the page's
focus on mousedown for the status bar's buttons as the ribbon does. `#st-pages` (Go To) likewise.

**M4. Docked panes squeeze the page past reading.** 1024 px touch (iPad landscape): Styles plus the
PDF pane leaves `#desk` 210 px and draws the page at 0.40 px/pt, 30 % (styles-pdf-1024t.png); Styles
plus Spelling 383 px; three panes plus Navigation overflow `#main` by 218 px, the Thesaurus pane runs
off screen and the mobile viewport widens to 1242 px. 1366 px: Styles plus PDF pane leaves 388 px.
`src/app.css:1609`. Fix: dock only while `#desk` keeps about 560 px (else the sheet), one docked
column for task panes (a second one replaces or stacks in it), or narrow the PDF and source panes
while a task pane is docked.

**M5. Find and Replace, Go To, the Navigation search and the Thesaurus closed with Esc put the caret
at the start of the first paragraph** (Ctrl+H, Ctrl+G, Ctrl+F, Shift+F7, real mouse caret; probe5).
Same on main, so not this branch's regression, but the PR's "dialogs return the caret on Esc" leaves
out the most used ones. Fix: the same source offset save and restore.

**M6. A template chosen from File, Templates leaves focus on BODY**: the new document has no caret
and keys type nothing (p1.log, template-article-1366.png); Blank document does put the caret in.
Fix: place the caret in the new document after a template loads.

## LOW

- **L1. Regression: the phone menu's "Zoom: 83%" has the offline cloud icon.** `src/app.js:1250`:
  the `else` gives every bar button without an svg the offline icon, and `#zoomv` has none.
  menupanel-390t.png. Fix: `else if (id === 'b-offline')`.
- **L2. The status bar's views scroll out of sight on touch from 521 to 860 px** (iPad portrait 768,
  820, 834: the line scrolls 86, 34, 20 px; at 700 px Page, LaTeX and PDF are cut, status-700t.png).
  Fix: the 520 px rule's `order: -1` for `.st-views` up to 860 px on touch, or drop New document and
  Load the sample there (File has them).
- **L3.** 1024 px touch: `#st-zoomv` is 38 px wide.
- **L4. Browser or Android Back in File leaves Rikuy** (no history entry; probe3). Word's phone app
  closes the view. Fix: `pushState` on open when not framed, `popstate` closes.
- **L5. File leaves the status bar live**: zoom in while File is open keeps the view and zooms the
  hidden page; Find and Replace (`#fr`) stays floating over the view. Word hides both.
- **L6. Download PDF's progress** (not run, no TeX): `#st-save` is `display: none` at 520 px and
  below (`src/app.css:918`), so phones see nothing; `src/cmd/file.js:199` restores `was` and can wipe
  a "Not kept in this browser" written by `persist()` during the run; `#st-save` has no
  `role="status"`, so the progress is not announced.
- **L7.** The first comment's name and comment boxes are 36 px tall on touch at 390 and 360 px.
- **L8.** Check accessibility and AutoCorrect Options opened from File leave the focus on the page,
  not in the dialog.
- **L9.** A ribbon menu opened by mouse and closed with Esc keeps the focus on its button: a second
  Esc before typing (deliberate per the audit; Word gives the document back after a mouse-opened menu).

## Unlike Word in the first five minutes

- File at 1920 px is an 860 px column of small buttons beside 1000 px of blank; Templates and Recent
  are menus; the Download row floats at the bottom left; no Share group. Word's backstage opens on
  Home with template thumbnails and the Recent list in the main area.
- The top bar says "Fit" while the status bar says "122%" for the same zoom.
- Dark mode: the open tab's name (Home) is barely visible (already in the audit, ribbon agent).

## What held up

- Suites on 2ecdb95: `test:browser` 199/0, `ux.py` 166/0 (168 with TeX; download_pdf skipped),
  `test:agent` 142/0, `test:tabs` 115/0, `ribbon.py` 194/0, `page.py long_document` 6/0.
- The dialog shell's caret return: Font, Paragraph, Page setup, Insert Table, Share, and Properties
  opened from File all give the caret back; the right click menu's Esc keeps it.
- First visit: the caret lands at the start without scrolling; it does not take the focus from the
  search box; a `#tex=` link opens and the first key lands in the link's document; nothing focused on
  touch.
- File's geometry: tabs to status bar at every width; Back 44 px on touch; a named column on phones;
  every command closes it or opens its menu; the ribbon's height comes back after Back; no sideways
  scroll.
- Status bar on a desktop from 1920 to 861 px: nothing clipped or overlapping; every control 44 px
  tall on touch at 1024, 390 and 360 px.
- Docked panes sit from under the ribbon to the status bar at 1024, 1366 and 1920, light and dark;
  the ribbon's fold is unchanged with a pane open; PDF and LaTeX views with a pane are fine.
- A first comment asks for the name first and stays inside the screen on phones.

# Verification of 933773d

Built `dist/` in /home/claude/wt-ux-ver (`RIKUY_NO_WORD=1`, no TeX tree). Probes /tmp/ux-ver-out/probeA.py to
probeG.py, logs A.log to G.log, screenshots /tmp/ux-ver-out/shots/. Every repro below uses a real mouse caret
(or a tap) unless it says otherwise.

## Verdict

**Fix first, two small items.** Every finding of the review is fixed (L9 kept on purpose, as agreed); the
suites are green. Two MEDIUM problems sit in the new work: Mobile View switched off on a long document
throws the reader up to 30 sections away, and File's Home cannot be reached by Tab or by Up and Down. Both are
small changes. Nothing is HIGH.

## The review's findings

| | verdict | evidence |
|---|---|---|
| H1 | fixed | click File or Alt, F: focus on Back; "xyz" and Alt, F, N change nothing (A.log). No KeyTips on File's commands (Word has N, O, I...): the keys are swallowed instead, which the review accepted |
| H2 | fixed | F7 or Shift+F7, Esc or Close, at 1920, 1366, 1100 (px 1.66 to 1.212): X lands on the misspelling or at "Sec\|ond" (A.log). Styles pane on a 120 section document: caret y 516, 517, 516 at 1366 and 1100, first line Part 59 stays (B.log, B-h2-styles-long-*.png) |
| M1 | fixed | Styles or Spelling docked, File, Esc: File closes, the key lands at the caret (A.log) |
| M2 | fixed | `#main` and `#status` inert; Chromium's own accessibility tree exposes no document text under File (0 nodes; Playwright's aria_snapshot still shows it, it ignores inert); Tab from Back never enters `#main` or `#status` |
| M3 | fixed | `#st-words` and `#st-pages` by mouse, Esc or Close, the key lands at the caret |
| M4 | fixed | one pane at a time; Styles beside the PDF pane floats over it at 1024 touch, 1100, 1366 (page keeps 531, 571, 709 px; B-m4-styles-pdf-1024t.png); docks at 1920 (page 918 px); with the side panel and the Thesaurus nothing passes the window |
| M5 | fixed | Ctrl+H, Ctrl+G, Ctrl+F, Shift+F7, Esc: the key lands at the caret at 1366, 1100, 1920 |
| M6 | fixed | Article, Report, Book tiles and the Templates menu: caret in the new document, the first key lands |
| L1 | fixed | `ux.py lows` (the zoom item has no svg) |
| L2 | fixed | 700, 768, 820, 834 px touch: Page, LaTeX, PDF at 14 to 211 px, in sight |
| L3 | fixed | `#st-zoomv` 44 px at 1024 touch |
| L4 | fixed | browser Back closes File and stays in Rikuy; history length unchanged after three opens and Esc; after a reload with File open too |
| L5 | fixed | status bar inert, Find and Replace hidden under File |
| L6 | fixed in code | `#st-save` has `role=status`, shows while not quiet at 520 px and below, restores only its own words (not run: no TeX) |
| L7 | fixed | name 44 px, comment box 75 px at 390 and 360 |
| L8 | fixed | Check accessibility and AutoCorrect Options from File take the focus into the dialog |
| L9 | kept on purpose | |
| Unlike Word: File | fixed | at 1366 and 1920 File opens on a Home with nine template pages and Recent (C-file-home-recent-1366.png, C-file-1920d.png) |
| Unlike Word: Fit vs 122 % | not fixed | top bar "Fit", status bar "125%" for one zoom, at every width (B.log) |
| Unlike Word: dark tab name | not this PR | selected tab rgb(20,62,102) on rgb(31,39,48), about 1.3:1 (ribbon agent) |

## New findings

MEDIUM
- **N1. Mobile View off loses the reader's place on a long document.** 390 px, 120 sections, caret in
  paragraph 40: tap Mobile View, the screen shows Part 32 and the caret is at y 1092 under a desk ending at
  775; reading with no caret, Part 81 becomes Part 51 (G.log, G-mv-off-long-390.png). Desktop's Web Layout from
  the View tab does the same (Part 40 to paragraph 79, caret at y -3235). `setWeb` (src/cmd/view.js:464) puts the
  caret back only when the page does not have the focus. Fix: keep the caret's source position (or the first
  visible line's) across the relayout, as the ResizeObserver now does for docking.
- **N2. File's Home is out of reach of Tab and of Up and Down.** The view is one tab stop (Back); Tab from Back
  leaves the view; Up and Down do nothing in the vertical column; the tiles and Recent come only by
  ArrowRight through every command: 14 presses to Article, 23 to a recent document (C.log). Word moves with
  Up and Down in the column and Tab into the main area. Fix: Up and Down as Left and Right in `#rp-file`
  while the view is open, and Home's tiles and rows their own tab stop (roving inside it).

LOW
- N3. A dialog opened from File (Properties, Check accessibility, AutoCorrect Options) closed with Esc leaves
  the focus on BODY with File still open; Word gives it back to the command. A second Esc closes File correctly.
- N4. Help docked, the window narrowed under 1000 px: the pane stays docked and the page keeps 519 px at 900
  (C-help-900-1366.png); the 560 px room rule applies only from 1000.
- N5. A desktop window reloaded under 700 px opens in Mobile View and keeps Web Layout when widened, with no
  Mobile View button there (View, Print Layout gets out). A phone turned to 844 px landscape keeps Web Layout
  at Fit the same way.
- N6. File's Download row: "LaTeX" runs over the left column's border at 1366 and 1920.

Before this branch, outside the review (not blocking it)
- The top bar on phones: Outline, Undo, Redo, Share, Open, Preview, Source are 28 to 32 px with no 44 px hit
  area at 390 and 360 (D.log). Popovers' Close is 20 px and the comment's Comment button 26 px tall on touch.
- F7 leaves the focus on the page with the misspelling selected: F7 then Enter replaces it with a paragraph
  break (E.log). Word's Editor pane takes the focus, where Enter is Change.
- Find and Replace has no Alt+A (Replace All) or Alt+R as Word's has (shortcuts agent).

## What held up

- Suites on 933773d: `ux.py` 266/0, `browser.py` 202/0, `tabs.py` 115/0, `agent.py` 142/0, `file.py` 85/0,
  `view.py` 154/0, `page.py long_document` 6/0 (regress-summary.txt).
- File by keys: Alt, F focuses Back; Enter on a tile or a Recent row opens it with the caret in the document;
  Download LaTeX reached by keys downloads and gives the caret back. Names: every button named ("Back to the
  document", "Article template", "Open <name>"), headings New and Recent, Recent a list.
- Help: one pane with the others (Help then F7 or Styles replaces it, and back); floats beside the PDF pane at
  1366; F1 or a press keeps the caret and typing; File over Help and Esc keeps Help.
- Long document (page.py long_document's 1500 commands and 3000 paragraphs): File opens in 35 ms and closes in
  44 ms with the caret kept; Help docked keeps the caret; keystrokes 14 to 17 ms median with or without Help;
  on phones in Mobile View 17 ms median, no line past the screen.
- Phones at 390 and 360 (light and dark): Mobile View by default, 13.3 px text, no sideways scroll, its toggle
  44 px and named "Mobile View" with aria-pressed; File's view, Templates menu and Help sheet inside the screen
  with 44 px items; the phone's Back closes File; zoom 125 % and the view choice survive a reload.
- Power user, keys only: Ctrl+O, the first key lands, Ctrl+End, Shift+Home, Ctrl+B, Ctrl+H, F7, Esc, Ctrl+S,
  F12 downloads paper.tex, Alt, F, Download LaTeX, typing lands after.
- Dark mode: File's Home, tiles and Help pane readable (12:1 text).

# Verification of 0a6ef7b

Built `dist/` in /home/claude/wt-ux-ver (`RIKUY_NO_WORD=1`). For telling a regression from an older problem,
933773d was built in /home/claude/wt-ux-base and the same probes run on both. Probes
/tmp/ux-ver-out/probeH.py to probeL.py; logs H.log, I.log, J-new.log, J-base.log, ux-consistency.log;
screenshots /tmp/ux-ver-out/shots2/.

## Verdict

**Fix first, one line of CSS.** N1 to N6 and the zoom label are fixed, and the dialogs still work. But the
consistency commit 3f3fc0e broke the phone's command search: when it is open, the box stays 44 px wide, so
nobody can see what they are typing. Fix that, then merge. Everything else below is LOW or was already there
before this branch.

## N1 to N6

| | verdict | evidence |
|---|---|---|
| N1 | fixed | 390 and 360 px, 120 sections, caret in paragraph 40: caret y 409 with Mobile View on, off and on again, and X lands there; reading with no caret, paragraph 80 stays in view; 1366 Web Layout on and off: caret y 508 each time (H.log, N1-mv-off-390.png) |
| N2 | fixed | Alt, F, then Down, Down, Down, Up, End, Home walk the column; Tab goes into Home; the arrows move along a row and Down to the next row (Report to CV); Tab and Shift+Tab move between Back and Home; Enter on a tile opens it |
| N3 | fixed | Properties, Check accessibility, AutoCorrect Options from File, then Esc: the focus is back on the command, File stays open; Esc again, then typing lands at the caret |
| N4 | fixed | Help docked, window narrowed to 900: a fixed sheet in the corner (510 to 892 px), the page 900 px wide, typing lands; at 1366 again it docks |
| N5 | fixed | Narrowed to 600 px: Mobile View; widened to 1366: Print Layout; a choice made at either width is kept at that width, also after a reload; a phone turned to 844 px: Print Layout, turned back: Mobile View |
| N6 | fixed | File's column 328 px, Download row ends at 244 px, nothing cut, at 1000, 1366 and 1920 |
| zoom | fixed | the top bar says "125%" (its name "Fit width"), as the status bar does, at 1366, 1920 and 1000 |

## The consistency pass against UI-PRINCIPLES.md

Holds:
- **Sizes (C1):** Font, Paragraph, Page setup, Insert Table, Find and Replace, Share, Properties, Word Count,
  Go To, AutoCorrect Options, Check accessibility, comment, Bookmark and Symbols use 32 px buttons and 32 px
  fields at 1366 px, light and dark.
- **Corners (C9):** 8 px on dialogs, 4 px on buttons and fields.
- **Titles (C5):** every title is 14 px semibold on a 20 px line.
- **Focus (C13):** Tab gives a 2 px solid outline. Close is 28 px.
- **Touch:** buttons, fields and Close are 44 px on phones.
- **Status bar:** all its text is 12 px, with no text under 4.5:1 in light or dark.
- **Author's checks:** `ux.py consistency` passes 32 of 32.
- **Esc gives the caret back:** true for every dialog above when opened from the page (1366).
- **Dialogs still work at 390 px by touch and at 1366 by mouse, the same as on 933773d:** Insert Table OK
  inserts a table, Replace All replaces both words, Paragraph alignment with OK centres the paragraph,
  Properties Apply writes the title, and Page setup OK closes.
- **Phones:** the top bar is 44 by 44 px at 520, 390 and 360 px. Of the two buttons it dropped, Open opens a
  file chooser from the menu panel and Source shows the source pane. Save, Comments and Ask Claude were hidden
  on 933773d already.

Regressions caused by 3f3fc0e:
- **R1, MEDIUM (blocks): the phone's search box does not open wide.** At 520, 390, 360 and 320 px with touch,
  a tap and "bold" leave the box 44 px wide: only "d" shows, over the menu button. On 933773d it was 378 px
  wide at 390 and 348 px at 360 (J-new.log, J-base.log, I-search-390t.png). The cause is
  `#bar .srch { width: 44px; min-width: 44px; }` under `(max-width: 520px) and (pointer: coarse)`, which
  applies even while the box has the focus. Fix: `#bar .srch:not(:focus-within)`.
- **R2, LOW:** AutoCorrect Options' Add button is 44 by 64 px at 360 px with touch. The 12 px padding inside a
  44 px width wraps "Add". It was 44 by 44.
- **R3, LOW:** at 320 px with touch, the bar's Search (144 to 188 px) overlaps Share (178 to 222 px) by 10 px.
  At 360 the gap is 10 px.

Not fixed by the pass, the same on 933773d (not blocking):
- **Under a finger (T1):**
  - Insert Table's Cancel and OK are 32 px wide, and "Cancel" spills out of its border (J-table-new-390.png).
  - The tabs inside Paragraph and inside Find and Replace are 29 px tall.
  - The rows of checkboxes and radio buttons are 19 px tall, and the boxes 13 px.
- **Contrast (D1):**
  - In dark mode, a primary button (OK, Apply, Comment, Find Next, Copy link) is white on rgb(106,174,227),
    2.4:1.
  - On a phone in light mode, the selected search result's name is white on rgb(215,232,245), 1.3:1.
- **Focus (N7):**
  - Check accessibility and AutoCorrect Options opened from the ribbon leave the focus on the page, and Tab
    goes to the status bar.
  - Tab from Word Count's Close leaves the dialog.
  - A cell of the Symbols grid has no outline when focused.
- **C1, C9 nits:**
  - Fields are 36 px with 6 px corners in Properties, the comment, Share's name, AutoCorrect and the Symbols
    search, against 32 px and 4 px elsewhere.
  - The Mobile View button's corners are 6 px against the views' 4.
