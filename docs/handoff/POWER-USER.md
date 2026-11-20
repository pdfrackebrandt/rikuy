# Rikuy for a power user: the audit of 2026-11-20

The owner writes math heavy papers, problem set solutions and lecture notes every day, knows
Word's keyboard (KeyTips, F4, Ctrl+Shift chords, Alt+=, styles by key), Overleaf and VS Code with
LaTeX Workshop, and has no patience for anything slow, modal or mouse only. This audit did his
work in the two built copies, keys first, then keys and mouse, and timed it.

- **Builds:** `/home/claude/wt-ux/dist` (ux-pass-2, PR 79, with `dist/tex`) and a copy of
  `/home/claude/wt-tabs/dist` taken at 15:00 (ribbon-tabs-word, PR 78). Chromium 1366 x 900 through
  `test/browser.py`'s `open_page`; two cores shared with three other agents, so every time below
  is an upper bound.
- **Scripts:** `/tmp/power-out/scripts/` (`paper.py` the keys only paper, `probe2.py` to
  `probe11.py` one area each, `latency.py` input to paint, `cmdlat.py` per command). Run one with
  `/tmp/rk-heavy python3 scripts/<name>.py ux|tabs`.
- **Area:** every finding says whose files it touches: **78** (`src/ribbon/`, the ribbon's CSS),
  **79** (outside the ribbon: bar, panes, dialogs, File view, status bar), or **core** (the editor
  itself: `app.js`, the math field, `commands.js`; neither PR).

## The work, keys only

A two page paper from Alt+Q › Blank document, measured per step (`paper.py`, `paper-ux.json`).

| step | Rikuy keys only | keys, ms | Word | Overleaf / VS Code |
|---|---|---|---|---|
| new document | Alt+Q, "blank document", Enter (Ctrl+N is the browser's) | 16, 656 | Ctrl+N | menu |
| title | Ctrl+Shift+S, "Title", Enter | 7, 402 | same | `\title{}` |
| heading 1, 2 | Ctrl+Alt+1, Ctrl+Alt+2 | 1 each | same | `\section{` and completion |
| footnote | Ctrl+Alt+F, text, **then no key leaves it** (finding 1) | 19, 146 | Shift+F5 returns | type past `}` |
| theorem | Alt+Q, "theorem", Enter; Enter Enter stays inside (finding 10) | 10 | Ctrl+Shift+S Theorem | snippet |
| numbered aligned equation | Alt+= on an empty line, Ctrl+Enter per row (better than Word); LaTeX typed into it is mangled (finding 3) | 2 + text | Alt+= | type it |
| table 3 x 4 | Alt+Q, "insert table", Enter, 3, Tab, 4, Enter | 18, 970 | Alt N T I 3 Tab 4 Enter: 8 | snippet |
| figure placeholder | `\` "figure" opens the Interactive graph dialog; nothing writes a figure float | none | Insert › Picture, Caption | `\begin{figure}` snippet |
| cross reference | `\` ref Enter, filter, Enter, **Esc** (finding 7) | 9+ | Alt S R F, arrows, Enter, Esc | `\ref{` and completion with preview |
| citation | `\` cite Enter, filter, Enter, **Esc** | 9+ | Alt S C | `\cite{` and completion |
| restyle headings | Alt+Q "modify style": the dialog is complete by keys | 14 | same | edit the preamble |
| replace with wildcards | Ctrl+H, find, Tab, replace, Tab x3 Space, Tab x5 Enter | about 14 | Ctrl+H, Alt+M, Alt+U, Alt+A: about 7 | Ctrl+H, Alt+R |
| move a section | Alt+Shift+Down on its heading moves the whole section | 1 | same | cut and paste |
| second file | `\input` files are drawn and typed in on the page; Ctrl+F finds in them; no way to open one by keys (finding 17) | | n/a | Ctrl+P |
| source and back | Alt+F9 lands at the same character both ways; Ctrl+\ does not (finding 11) | 1 | Alt+F9 | always both |
| undo 200 words in 5 paragraphs | 11 Ctrl+Z, 18 ms each, back byte for byte | 11 | similar | similar |
| download | F12 LaTeX (.zip for a project), Alt+Q "download word" Enter; Ctrl+S saves in the browser | 1, 15 | F12 | menu |

With the mouse the same paper is quicker only where the keys fail: a click leaves the footnote,
closes the reference picker, opens an existing formula and switches source files. Everywhere else
the keys are as fast as Word's or faster.

Already as good as Word or better: Ctrl+Alt+1 to 3, Alt+Shift+arrows on sections, Ctrl+Enter
turning an equation into `align` rows, Alt+F9 with exact sync, Shift+F10 menus fully by arrows,
Modify Style by Tab, Ctrl+F6 through six panes, undo, F4 after a style or Bold.

## Measured

| what | number | how |
|---|---|---|
| a key typed in `dev/bench/long` (144 KB, 41 pages), input to paint | median 56 ms, p90 72, max 88 (ux); 88, 128, 168 (tabs, busier machine) | Event Timing API, 20 keys 120 ms apart (`latency.py`) |
| the same, a 63 character burst | 64 ms a character (4.0 s); 75 on tabs; none lost | `keyboard.type` with no delay |
| Enter, Backspace, Ctrl+B on that document | 64 to 144 ms; Ctrl+B 160 to 216 ms | Event Timing |
| typing with the source pane open | 56 to 128 ms a key | Event Timing |
| on the sample (1 page) | a key 96 ms first, commands 16 to 120 ms (Alt+= 112, Ctrl+Alt+F 120) | `cmdlat.py` |
| opening `long` | 0.7 s (ux), 0.9 s (tabs) | `load_doc` to two frames |
| source pane on `long` | 175 ms (ux), 251 ms (tabs) | Ctrl+\ to text in CodeMirror |
| memory on `long` | 39 MB heap, 12.8k nodes; 68 MB, 18.8k with the source pane | CDP `Performance.getMetrics` |
| Word, Overleaf (CodeMirror 6) | under 16 ms a key | |

Not measured here: offline (`npm run test:offline` covers it) and a phone's speed (the UX audit:
500 ms a key at 6x CPU on `long`).

## Findings, ranked by what they cost a power user

### 1. A footnote is a trap: no key leaves it (HIGH, small, core)

- **Repro:** caret after "gamma.", Ctrl+Alt+F, type "Note.", then any of Esc, Shift+F5, End then
  Right, Right twice, Ctrl+Right, Down, Ctrl+End, `}`; type "XYZ". Every time the source is
  `\footnote{Note.XYZ}` (`}` gives `\}`), also after 1.2 s pauses (`probe11.py`). In the paper the
  theorem, the equation and a heading all went into the footnote before anything looked wrong.
- **Word:** Shift+F5 (Microsoft's own advice) or a click returns to the reference mark.
  **Overleaf, VS Code:** the caret walks past `}`.
- **Fix:** `src/app.js` `onKeyDown` (line 1380): with the caret in a `.fn` at the page's foot,
  Esc, Shift+F5, and Right at its end put the caret after the footnote's `}` in the body (the
  reverse of `gotoFootnote`, line 2387, through the `fn` atom's `e`); `goBack` in
  `src/cmd/find.js` (line 757) does the same from a footnote; Ctrl+End stops at the body's last
  paragraph. Test in `test/shortcuts.py`.

### 2. `$...$` typed as in Overleaf writes the wrong thing (HIGH, small, core)

- **Repro:** in a paragraph type ` so $x^2$ is fine`. `$` opens the field, the closing `$`
  becomes `\$` inside it, and " is fine" goes into the formula without its spaces:
  `$x^2\$isfine$` (`probe3.py math`). Nothing on the page says so until the PDF.
- **Word:** Alt+= then type, Enter or the arrow leaves. **Overleaf:** `$...$` is the formula.
- **Fix:** `attachField` in `src/app.js` (line 2630): in an inline field (`!opts.display`) a `$`
  key commits and closes as Enter does, caret after the formula; `$$` on an empty paragraph opens
  display math (`newDisplayMath`).

### 3. LaTeX typed into the equation field is mangled (HIGH, small, core)

- **Repro:** Alt+= on an empty line and type, then Enter (`probe2.py C2`):
  `\sum_{i=1}^n x_i` gives `\sum_{\{i=1\}^{n}x_{i}}`, `\mathbb{R}` gives `\{R\}`, `\text{if }x`
  gives `\{if\}x`, `\left( x \right)` gives `((x)`, `\begin{aligned}a&=b\end{aligned}` gives
  `(\{aligned\}a\&=b\{aligned\}`. Word's linear forms work (`a/b`, `\alpha` Space, `x_1`). The
  LaTeX box that takes all of it verbatim (`#pop-tex`) is above the field, reached only by
  Shift+Tab and named nowhere; Ctrl+Shift+= (Word's "linear format") does not reach it (finding 13).
- **Word:** linear format by Ctrl+Shift+=; LaTeX input mode. **Overleaf:** source.
- **Fix:** `attachField`: a `{` typed in the field (or `\begin`) moves what the field holds plus
  the brace to `#pop-tex` and focuses it at its end; the hint line says "{ switches to LaTeX". A
  preference "Type equations as LaTeX" opens new formulas in `#pop-tex` first.

### 4. Typing on a long document lags (HIGH, medium, core)

- **Repro:** `latency.py ux long`: 56 ms a key median, 64 ms a character sustained, Enter to
  144 ms, Ctrl+B to 216 ms. At 15 characters a second a fast typist runs ahead of the page.
- **Word, Overleaf:** under 16 ms.
- **Fix now:** `onBeforeInput` (`src/app.js` line 1441): text typed while a rebuild is pending
  joins one commit per animation frame (one model build for a burst; undo already groups typing).
  Then the incremental model build and the C++ track (PLAN.md). Check with `latency.py` and
  `dev/bench_native_page.py`.

### 5. KeyTips stop at the tab; the next letter is typed into the document (HIGH, medium, 78)

- **Repro:** F10 (or Alt), N, T: the Insert tab opens, KeyTips go away, and "t" lands in the text
  ("Altpha", `probe3.py keytips`). Alt, H then 1 does nothing; the focus stays on the page.
- **Word:** every control of the open tab gets a KeyTip (Alt, H, 1 Bold; Alt, N, T, I Insert
  Table; Alt, S, F Footnote); letters with no tip are swallowed.
- **Fix:** `installKeyTips` in `src/ribbon/tabs.js`: after a tab's letter stay in KeyTips mode
  and draw tips on the tab's visible controls (a `keytip` field in `src/commands.js`, Word's
  letters for Home, Insert, References and Review, initials elsewhere, folded groups by their
  button); swallow every letter while the tips show; Esc goes up a level, then back to the caret.

### 6. Tab in a paragraph throws the focus off the page (HIGH, small, core)

- **Repro:** caret in plain text, Tab: the focus goes to the status bar's page count, or with the
  PDF pane open to its TeX engine list, where the next letters pick an engine by type ahead
  ("l" is LuaLaTeX); "zz" typed after it never reaches the source (`probe2.py`, `probe3.py tab`).
- **Word:** Tab indents (a first line indent at a paragraph's start). **VS Code:** inserts.
- **Fix:** `onKeyDown` (`src/app.js` line 1392, which handles cells only): Tab outside a cell,
  list or tab stops is kept on the page (at a paragraph's start: First line indent through
  `src/parasrc.js`); Esc then Tab leaves, the rule the source pane already has.

### 7. The reference and citation pickers stay open after Enter (MEDIUM-HIGH, small, core)

- **Repro:** `\` ref Enter, type "euler", Enter: `\eqref{eq:euler}` is written, but the picker
  stays and "XYZ" typed next goes into its filter; Up and Down do not move in the list; each label
  shows only "Equation 1 eq:euler", not the equation or the heading's words. The citation picker
  the same (it does show author, year and title). One extra Esc per reference, and lost keys.
- **Word:** the Cross-reference dialog lists headings' text and equations; Insert closes it.
  **Overleaf, LaTeX Workshop:** completion with a preview, Enter closes it.
- **Fix:** `openRef` (`src/app.js` line 3270) and `openCite` (line 3190): Enter picks and closes
  with the caret after the reference (`closePop(true)` with `returnCaret`); Up and Down move the
  highlight; each label line shows its text (the section title, the equation drawn small, the
  caption), from the block `model.labels` points to. Ctrl+Enter keeps the citation picker open to
  add another key.

### 8. No way to follow a reference or open a formula by keys (MEDIUM-HIGH, small, core)

- **Repro:** no command goes from `\ref{sec:model}` to its `\label` and back; Shift+F10 on a
  selected reference or formula shows the plain text menu (`probe9.py`); Shift+Left over `$x+y$`
  then Enter deletes the formula; F2 and Alt+Q "Edit equation" do nothing beside it. (Backspace
  then Enter opens it, by `armed`, but nothing says so.)
- **Word:** Ctrl+click a cross reference; arrows into an equation. **VS Code:** F12, Alt+Left.
- **Fix:** Go To (`src/cmd/find.js` line 50) with the caret on a reference opens with that label
  chosen, Enter jumps and Shift+F5 returns (the Go Back ring); Ctrl+click does the same; a `ref`
  kind of right click menu with "Go to Section 2" and "Change reference". In `onKeyDown`, Enter or
  F2 with exactly one formula, citation or reference selected opens it as `armed` does
  (`eq-edit`'s `when` reads the selection too).

### 9. Alt+Q finds only the starts of words, and remembers nothing (MEDIUM, small, core)

- **Repro:** `tbl`, `insrt table`, `hed 2`, `heading2`, `eqn`, `xref` find nothing
  (`probe3.py search`); an empty box lists nothing; Ctrl+Shift+P is the font size box.
- **Word:** Search finds by meaning and lists recent actions. **VS Code:** Ctrl+Shift+P, fuzzy,
  recently used first, keys shown (Rikuy shows keys and tabs already).
- **Fix:** `search` in `src/commands.js` (line 135): below the word start matches, score the
  letters in order (`tbl`, `eqn`), initials (`xr`) and a digit joined to a word (`heading2`);
  `runCommand` keeps the last 20 ids in prefs; `src/ui/search.js` lists them when the box is
  empty and ranks them first among equal scores.

### 10. The insert list writes invalid LaTeX and lacks the environments (MEDIUM, small, core)

- **Repro:** `\` then `alpha`, `frac`, `align` or `begin` and Enter writes `\alpha ` and the like
  into the text (a TeX error); `figure` offers only Interactive graph; nothing writes a figure
  float, `align`, `cases`, `proof` or `lemma`. In a theorem Enter twice adds blank lines inside it
  (`probe2.py B`); Insert Theorem leaves three blank lines after `\end{theorem}`.
- **Word:** a style's Next style leaves the theorem. **Overleaf:** environment snippets.
- **Fix:** `openPalette` and `runPalette` (`src/app.js` lines 3329 and 3348): a typed math
  command (one KaTeX knows) opens a formula holding it; `begin` and an environment's name write
  `\begin{x}...\end{x}`; items for figure (`\includegraphics[width=.8\linewidth]{example-image}`,
  `\caption{}`, `\label{fig:}`), align, align*, gather, cases, proof, lemma, definition. Enter on
  an empty last line of a theorem, proof or quote leaves it as lists do (`src/blockenv.js`).

### 11. The source pane opens at line 1 and drops the focus when closed (MEDIUM, small, 79)

- **Repro:** caret in "Model text", Ctrl+\: CodeMirror's cursor is at line 0, column 0 and the
  focus stays on the page; with the cursor moved in the source, Ctrl+\ closes the pane and the
  focus falls to the body (the next keys type nothing). Ctrl+F in the pane does nothing; no
  completion of commands, labels or keys; no bracket matching (`probe3.py source`). Alt+F9 does
  all the place keeping right.
- **Overleaf, LaTeX Workshop:** the source and the PDF follow each other; Ctrl+F, completion,
  matching brackets.
- **Fix:** `toggleSource` (`src/app.js` line 3480): opening puts CodeMirror's cursor at the
  caret's place and scrolls it to the middle, closing from the pane puts the page's caret at the
  cursor's place (`viewSpotNow`, `viewPlaceInSource`, `viewPlaceOnPage` in `src/cmd/view.js` do
  both for Alt+F9); CodeMirror's `extraKeys` send Ctrl+F and Ctrl+H to Find and Replace with In
  LaTeX source ticked. Later, CodeMirror 5's show-hint (labels, `.bib` keys, commands),
  matchbrackets and closebrackets, pinned by hash in `CDN` and `SRI`.

### 12. Nothing can be customized: no keys, no Quick Access Toolbar (MEDIUM, medium, 79 and 78)

- **Repro:** the bar's Save, Undo, Undo options and Redo are fixed; no "Add to Quick Access
  Toolbar" anywhere; Alt+Q "customize" and "quick access" find nothing; Alt+1 to 9 do nothing; no
  command's keys can be changed.
- **Word:** right click any control › Add to Quick Access Toolbar, Alt+1 to 9 run them; File ›
  Options › Customize Keyboard. **VS Code:** keybindings for every command.
- **Fix:** `prefs.qat` (ids) drawn after Redo in the bar (`src/template.html`, `src/app.js` near
  line 1222), "Add to Quick Access Toolbar" in the ribbon's right click menu (`src/ribbon/tabs.js`)
  and the search list, Alt+1 to 9 on the page. `prefs.keys` overrides read by `matches` in
  `src/keys.js`; a Customize Keyboard dialog (Help or File) with a field that takes a chord and
  says what it replaces; Help's key list and tooltips follow.

### 13. Ctrl+Shift+= in an equation shows the wrong thing (MEDIUM, small, core)

- **Repro:** Alt+= on an empty line, type x, Ctrl+Shift+=: the field closes and the paragraph
  before it turns into "LaTeX view · Esc shows it typeset" (`/tmp/power-out/shots/ux-eq-linear-crop.png`).
- **Word:** the equation itself switches to its linear text; Ctrl+= switches back.
- **Fix:** while the equation popover is open, Ctrl+Shift+= focuses its `#pop-tex` and Ctrl+=
  the field (`show-latex` in `src/cmd/view.js` and `src/cmd/equation.js` take `eqPop()` first).

### 14. F4 repeats commands, not typing (LOW-MEDIUM, small, core)

- **Repro:** type "abc " in one paragraph, click into another, F4: nothing (`probe3.py repeat`).
  After Bold or Heading 2 it works.
- **Word:** F4 types the last typed run again (and repeats deletes, row inserts).
- **Fix:** `repeatLast` (`src/cmd/view.js` line 540) and `App.commit`: the last run of typing
  becomes `lastAct = { text }` while the caret has not moved away, and F4 inserts it.

### 15. Dialogs have no Alt+letter keys (LOW-MEDIUM, small, 79)

- **Repro:** Find and Replace: Use wildcards is Tab x3 then Space, Replace All Tab x5; no
  `accesskey` anywhere (`probe3.py find`). The four option boxes have no names for a screen reader
  ("input." in the Tab order).
- **Word:** Alt+U wildcards, Alt+A Replace All, Alt+R Replace, Alt+F Find Next, Alt+M More, an
  underlined letter in every dialog.
- **Fix:** the dialog shell in `src/ui/kit.js`: a label's letter marked as its Alt key,
  underlined while Alt is down, Alt+letter clicks or toggles it in the open dialog; Word's letters
  in `src/ui/finddialog.js`, then Font, Paragraph and Insert Table.

### 16. Modes and Print move things under the caret (LOW, small, 79)

- Esc leaves neither Focus nor Read Mode; Read Mode drops the focus to the body
  (`probe5.py`). Word: Esc leaves both.
- Ctrl+P opens the PDF pane and the side panel and shrinks the page to about half its size while
  TeX runs; Word's Ctrl+P is a view one Esc closes.
- **Fix:** `src/cmd/view.js`: Esc in Focus and Read Mode returns to Print Layout with the caret
  kept; Ctrl+P's view gives the page back as it was on Esc.

### 17. Files of a project cannot be opened by keys (LOW, small, core)

- **Repro:** the source pane's file tabs (`#ftabs`) take clicks only; Alt+Q "files" finds only
  Recent documents. The page itself is fine: `\input` files are drawn, typed in and found by
  Ctrl+F.
- **VS Code, Overleaf:** Ctrl+P, a file's name.
- **Fix:** the search box lists the project's files under their names ("model.tex: open in the
  source"), and the page scrolls to the file's first block; the file tabs a roving toolbar.

### 18. Smaller ones

- The search box throws `TypeError: Cannot read properties of null (reading 'tex')` in
  `blockStyleOf` on every keystroke when the caret's block is gone (typing "theorem", `probe2.py`
  log): `when` of the style commands (`src/cmd/styles.js`) must guard a missing block.
- Apply Styles › Title leaves the caret in the middle of the title ("A Note on G|rowth").
- Alt, F opens File with the focus on Back; Tab from Back leaves the view for the side panel and
  the bar (`probe6.py`, `probe10.py`); its commands sit in Back's toolbar, so the arrows should
  reach them (not checked), but Word's backstage takes Tab too (79).
- The first heading typed in a blank document took 1.7 s once in `paper.py` (the same keys take
  56 ms on the sample); not reproduced.

## What the next pass should build first

Findings 1, 2, 3, 6 and 7 are each under a day, in `src/app.js`, and remove every place where a
power user's keys went somewhere wrong without a word. Then 5 (78's KeyTips), 4 (latency
batching), 8 to 11, and 12 last (it needs a dialog and preferences that survive versions).
