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
