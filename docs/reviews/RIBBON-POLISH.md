# Review: ribbon-downloads (PR 86) at 542e5c2, no caret part also at 6fe04ee

Reviewer: hostile reviewer, Word user and designer's eye. Built from a clean worktree (`npm run build`). Scratch output, scripts and screenshots are in /tmp/review-dl-out/ (scripts/, shots/, reg-*.log, consistency.log).

## Verdict

**Changes requested.** The look is mostly sound and every suite passes. The new no caret behaviour, though, acts in the wrong place once the text has changed, and that holds at 542e5c2 and at 6fe04ee. 6fe04ee also adds an endless refresh loop. consistency.py's 0 violations comes partly from rules weaker than the brief, so the result overstates what the ribbon meets.

## High

**H1. With no caret, the "last place" is a stale source offset, so commands land somewhere else (542e5c2 and 6fe04ee).**
- Where: `src/ribbon.js:34` stores `rbLast = { f, p: c.b }`, and `ribbonAtRest` (`ribbon.js:48`) reads it back with `index.find(L.f, L.p)`. Nothing maps it through edits, and nothing resets it when the document changes.
- Repro 1 (user, mouse and keys; `scripts/nocaret3.py`):
  1. Open a document with a table followed by "The last paragraph."
  2. Click after "The " in that paragraph.
  3. Open Source and type 29 characters before the table.
  4. Click the status bar's blank part.
  5. Result: Table Design and Table Layout appear. Table Layout › Insert Below adds a row to the table (`more & last \\ \n &  \\`), and Insert › Page break is disabled. The user's caret was never in the table.
- Repro 2 (agent):
  - After `api.setSource()` adds 46 characters before the caret's old place, `api.run('page-break')` writes `\newpage` between `\section{Opening}` and the first paragraph.
  - After `setSource()` replaces the whole document, `api.run('page-break')` and `api.run('bold')` act at the start of the body and write `\newpage\n\textbf{}`. llms.txt promises "where the caret last was or at the document's end".
- Before this branch, commands with no caret were disabled, so this is new.
- Fix:
  - Map `rbLast` through every `commit()` with `mapPos(edits, p, bias)` from `wrap.js`, as `cmd/page.js:272` does.
  - Clear it on a project load, `setSource` with a new document, and New or Open.
  - Fall back to the end only when the mapped place is gone.
  - Add a test: caret in a paragraph after a table, an edit before it, then a table command must fail and Page break must land in the paragraph.

**H2 (6fe04ee only). A refresh loop that never stops while the selection sits outside the page.**
- Where: `atRestDo` (`ribbon.js:88-89`) changes the selection and then puts it back inside `ribbonSync` (`tabs.js:379`). Each change queues a `selectionchange`, which calls `app.ribbonSoon` (`tabs.js:652`), which calls `ribbonSync` again, and so on.
- Repro (`scripts/loop.py`, `scripts/loop2.py`): click any static text outside the page, for example the status bar's "Kept in this browser".
  - Short document: 44 syncs and 44 `selectionchange` events in 3 s while idle. At 542e5c2: 0.
  - 3000 paragraphs: 64 syncs in 5 s, 1173 ms of script (23% of a core, in `ribbonSync` alone), longest 59 ms. That is a long task every ~80 ms, forever, until the user clicks the page.
  - Every other `selectionchange` listener runs with it: status words, table paint, ruler, handles.
- Fix (either one):
  - Read with no caret without touching the selection: pass `at.c.range` to `when`/`on` instead of setting the selection.
  - Or ignore the `selectionchange` that `atRestDo` itself causes, for example with a flag cleared in a microtask.
- Test: idle 3 s after a press on the status bar; `ribbonSync` count must be 0.

## Medium

**M1. A selection lost by a press outside the page becomes a caret, so Bold writes an empty `\textbf{}`.**
- Repro (`scripts/nocaret.py` S4): select "beta", click the status bar, then press Bold. Result: `Alpha beta\textbf{} gamma.`
- Word keeps the selection when focus leaves the document and would bold "beta".
- Where: `rbLast` keeps only `c.b` (`ribbon.js:34`).
- Fix: keep `a` and `b` and restore the range. Also, with a rest caret at a word boundary, Bold and Italic should write nothing (Word sets the typing format instead).

**M2. consistency.py's rules are weaker than the brief, so "0 violations" overstates the result.**
- C2 "viewBox width = rendered width" is not checked. Every icon is drawn from a 20 viewBox at 16 (234 icons), 12 (63) or 32 (63). The 0.8× and 1.6× scales put the 1 px lines off the pixel grid, and they render as two pale rows. You can see it in `shots/z-para.png` (align icons, Justify). Fix: draw icons on 16 and 32 grids, or snap the coordinates, and test the viewBox.
- C3: the line check looks only at the first stroked shape without a `stroke-width` attribute (`consistency.py:139`) and skips launchers (`:338`). Lines that are not 1 px:
  - search magnifier 1.6 px (`app.css:168`)
  - Collapse button 1.6 (`app.css:218`)
  - launchers 1.3 (`app.css:301`, `:335`, `:2575`)
  - More styles 1.4 (`app.css:276`)
- C1: fields are skipped (`:435`). Field heights in the ribbon and bar are 26 (font name and size), 22 (Layout's indent and spacing), 28 (search) and 16 (zoom). The brief says one height, 32.
- D4: the forced colours rule compares computed strings (`:583`, `:589`), not pixels as the brief asks. It also checks only the View tab's toggles. See M3.
- C14 is reduced to "more than the name". It runs at 1920 light only (`:670`) and skips fields and controls without an id. In controls.json, 181 of 571 titles do not start with the name, and 62 have no description after a colon. Examples: "Styles" → "Styles"; Share → "A link anyone can open…".
- Not checked at all: C11 (Insert mixes "Cover Page" and "Quick Parts" with "Blank page", "Page break" and "Page number"); dialogs, menus and popovers (C1 32 px dialog buttons, C9 8 px radius); touch in dark mode (`:661`, light only).
- Fix: add these checks, or list the exclusions in the file's docstring and in the PR so the claim matches what is measured.

**M3. Under forced colours the selected tab and the bar's and status bar's toggles look almost like the others.**
- Selected tab: its `::after` mark is a background, so it becomes Canvas on Canvas. Only the weight changes (600 against 500; `shots/z-tabs-forced2.png`).
- Preview and Outline pressed (`app.css:143`) and Page/LaTeX/PDF in the status bar (`app.css:1958`): no visible difference at all.
- Fix: draw the mark as a border, or set `forced-color-adjust: none` with `Highlight`, as the ribbon's pressed rule does (`app.css:418`).

**M4. The title bar's pressed toggle is shown by a faint tint only.**
- `--bar-press` against the bar is 1.34:1 in light and 1.67:1 in dark. Against hover it is 1.14:1 and 1.26:1, and the ink does not change.
- That breaks D5 (state never by colour alone) and needs 3:1 for a state cue.
- Fix: a border or underline when pressed, or the ribbon's blue-wash with blue ink.

## Low

- **L1. Focus ring after a mouse press.** Opening Frontier with the mouse focuses Close with the keyboard ring. Closing it with the mouse leaves the ring on Frontier (`:focus-visible` true, 2 px). Share does the same. C13 is violated, and consistency.py's focus rule never opens a popover. Where: closePop (`app.js:2474`) and openFrontier's `b.focus`.
- **L2. Frontier's accessibility.** The button has no `aria-haspopup="dialog"` or `aria-expanded`. The dialog has no `aria-describedby`, so a screen reader hears "Frontier dialog, Close button" and never "Coming soon". Tab from Close drops focus to `<body>` while the popover stays open.
- **L3. The Frontier popover itself is off the brief.** Radius 10 (brief: 8). Close is 26 px tall (brief: 32). The × is 20 px.
- **L4. Downloads' icons.** PDF uses the same icon as Preview, and none of the three shows a download sign anymore. Only the group name says "Download".
- **L5. Word layout differences.**
  - Paste is large with no name from 1140 px down. Word never shows a large button without its name. This was already on main (from 1300 px), so it is not new.
  - The folded Home › Insert group shows Formula's Σ.
  - The Paste button has no Paste options arrow.
  - Split arrows are 24 px wide, so at rest they read as separate buttons (hover groups them correctly).
- **L6. llms-full.txt still says "Formatting marks".** In View's list (`build/app.mjs`, the View tab text; dist line 502).
- **L7. Click outside, then Shift+click (542e5c2 only).** Because the selection was moved, this selects page text up to the press (fixed by 6fe04ee).
- **L8. Installed app colour under forced colours.** `theme-color` follows only `prefers-color-scheme`, so under forced colours the window frame stays #DCEAF7.

## What held up

- **consistency.py:** the full run reproduces 21/21 PASS with 0 violations in 4 min 15 s.
- **Regressions at 542e5c2, all passing with no FAIL:**

| Suite | PASS |
|---|---|
| tabs.py | 145 |
| ribbon.py | 195 |
| agent.py | 142 |
| browser.py | 199 |
| view.py | 154 |
| features.py | 37 |

- **page.py long_document:** 18 ms, bound 40.
- **Speed:**
  - Resize sweeps at 40 to 60 px steps across five tabs: no long tasks (one 59 ms animation frame on Review).
  - `ribbonFit` at most ~10 ms.
  - `selectTab` 4 to 10 ms.
- **Title bar contrast:**
  - Text and icons at rest 10.9:1 (light) and 11.7:1 (dark); hover and press at least 8.9:1.
  - Focus ring 10.9 / 11.7.
  - Tab ring 4.5 / 6.7.
  - File tab 5.0 / 6.2, hover 6.3 / 7.6.
  - Search line and placeholder pass.
  - Phone bar targets 44 px.
- **Frontier:** works by mouse, tap, Enter, KeyTips Alt S R S, and the search box. Esc returns focus to the button. The dialog is named "Frontier". No network request.
- **Rename:** "Show marks" is consistent in controls.json and llms.txt. Search still finds "Formatting marks" (synonym), and agent.py passes.
- **6fe04ee:** a ribbon refresh no longer moves the user's selection (P5 restored). But see H1, which is unchanged, and H2, which is new.
