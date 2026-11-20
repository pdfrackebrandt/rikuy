# Hostile review: word-gaps-doc (PR 84) at a286911

Scratch and repros: `/tmp/review-g2-out/` (`rv.py` browser repros: sections `eqlin fxrows compiles speed split2 phones_all hfpos hfpdf`, run from `/home/claude/wt-g2/test`; node repros `fx.mjs` formula, `um.mjs` `um2.mjs` UnicodeMath, `tb.mjs` `tb2.mjs` table edits, `wx.mjs` Word export; renders in `shots/`).

## Verdict

**Not ready to merge.** Two HIGH findings silently corrupt the user's document: typing in the Linear equation box rewrites the equation through a lossy converter, and Update Formulas overwrites a data cell after a row is inserted with Rikuy's own command. Fix H1, H2, M2 (one line), M3 and M4 before merging. M1, M5 and M6 can follow if PLAN records them.

## HIGH

**H1. Typing in the Linear box corrupts the equation.** Every keystroke runs the whole equation through `toLinear` and then `fromLinear` and writes the result back (`src/cmd/wordgaps.js:486`).
- Repro (browser): equation `\hat{x} = \frac{a}{b}^2 \leftarrow \mathbf{v}`, then Convert › Linear, End, and one space typed. The box showed `\hatx=a/b^2←\mathbfv`. The source became `\hatx=\frac{a}{b^{2}}arrow\mathbfv`: undefined control sequences, a changed meaning, and a lost arrow. One Undo restores it.
- Causes:
  - `src/unimath.js:247`: `.replace(/\\left|\\right/g,'')` eats `\leftarrow`, which becomes "arrow" (so do `\rightarrow`), and `\leftrightarrow`, which becomes "rightarrow". `\rightleftharpoons` becomes "leftharpoons".
  - `:87`: an unknown command (`\hat`, `\bar`, `\vec`, `\dot`, `\mathbf`, `\overline`, `\binom`, `\mathbb`) is emitted bare and its `{}` group flattened. `\binom{n}{k}` becomes `\binomnk`, and `cases` becomes `\begincases…\endcases`.
  - `:119`: a fraction followed by a script is not parenthesised, so `\frac{a}{b}^2` reads back as `\frac{a}{b^{2}}`.
  - `:61`: `\operatorname{tr}` and `\mathrm{d}` are silently lost.
- Fix:
  - Strip only whole `\left` and `\right` tokens: `/\\(left|right)(?![A-Za-z])/`.
  - Keep unknown commands with their braced arguments verbatim in the linear text.
  - Parenthesise a fraction (or any built-up operand) before `^` and `_`.
  - Guard the write: write back only if `fromLinear(toLinear(tex))` equals `tex` up to braces and spacing. Otherwise show the box read-only with a plain note, or write only on Enter or Professional, never per keystroke.
  - Test: every eqtab and corpus equation round-trips and compiles.

**H2. Formulas go stale after Rikuy's own row edits, and Update Formulas then overwrites data.**
- Repro (browser): table Item / apples 2 / pears 3 / plums 5 / Total. Formula `=SUM(ABOVE)` in Total gives `B5`, value 10. Caret in pears, Insert Above, then Update Formulas.
  - Result: **plums' 5 becomes 3**, Total stays 10, and there is no message.
  - With Delete Rows instead, the toast says "B5: the table has no such cell now" and Total stays stale.
- PLAN lists only "cell names do not follow rows added above". The real consequence is silent data loss.
- Where:
  - `src/cmd/table.js:928-943` trusts `cellAtRC(F.r, F.c)`.
  - Insert and delete of rows or columns, Sort and Merge never rename the `% formula` lines.
  - `tableDelete` (`src/cmd/table.js:486`) leaves orphan `% formula` and `% alt` lines before a bare tabular. A table later placed there adopts them.
- Fix:
  - Row and column operations rename the formula lines and the references inside them, as Word does.
  - At minimum, record the written value (`% formula B5 [10]: …`) and have Update refuse a cell whose text no longer matches.
  - Delete Table takes the formula and alt lines with it.

## MEDIUM

**M1. The UnicodeMath reader does not follow Word's operand rules** (`src/unimath.js:142-147, 201-243`). Word reads a run of letters and digits as one operand; Rikuy reads one letter at a time.

| Typed | Rikuy writes | Problem |
|---|---|---|
| `ab/cd` | `a\frac{b}{c}d` | wrong fraction |
| `2x/3y` | `2\frac{x}{3}y` | wrong fraction |
| `n!/k!` | `n\frac{!}{k}!` | garbage |
| `∂f/∂x` | `\partial\frac{f}{\partial}x` | wrong fraction |
| `1/2/3` | `\frac{1}{2}\frac{}{3}` | empty numerator |
| `x^2^3` | `x^{2}^{3}` | TeX error: Double superscript |
| `a^-1` | `a^{-}1` | minus alone in the script |

- Word's own linear marks `▒` and `〖〗` (and `┬` `┴`) pass into the LaTeX, so pdfLaTeX stops with "Unicode character not set up".
- ℝ ℕ ℤ ℚ ℂ are not mapped: `x∈ℝ` gives `x\inℝ`.
- `fromLinear('('.repeat(19000))` throws `RangeError` inside the input handler: no depth bound.
- Fix: an operand is a maximal alphanumeric run (UTN 28); scripts are right associative; a minus is allowed in a script; convert or strip `▒〖〗┬┴`; map the double-struck letters; cap the depth with a message.

**M2. Formula evaluation has no time bound** (`src/formula.js:159-166`).
- A range is looped over its nominal size, not the grid's: `=SUM(A1:ZZZ99999)` takes **13 s** in node. About 50 such ranges fit in 1000 characters, which is minutes.
- It runs on the main thread from Update Formulas and from the Formula dialog's preview, both on opening and on every keystroke. A shared document with that line freezes its owner's page.
- Silent truncation: the formula is evaluated from its first 1000 characters (`formula.js:86`) but stored from its first 500 (`table.js` `setFormula`). Update then computes a different formula from the first press.
- Fix:
  - Clamp `r1` and `c1` to the grid before the loop (one line).
  - Refuse an over-long formula with a message instead of cutting it.
  - `Math.min(...xs)` overflows the stack past about 125k cells; use reduce.

**M3. Header from Top gives the wrong result on two hand-written forms.** Code: `src/cmd/wordgaps.js:63-73` with `src/pagesrc.js` `headFootEdits` and the layout's reading of `\addtolength{\topmargin}{\headsep}`.
- (a) geometry with `includehead`: `\usepackage[margin=2cm,headsep=10pt,includehead]{geometry}`, Header from Top set to 1 cm, writes `headsep=38.45pt`. In TeX's PDF the header stays at 2 cm (`HEADMARK` glyph top at 2.18 cm), the text moves down, and the field still reads 2 cm.
- (b) `\setlength{\headsep}{40pt}` by hand, Header from Top set to 1 cm. TeX puts the header at 1.0 cm (glyph top 1.18 cm), but the page model reads back **0.47 cm**. The page draws the header 0.5 cm too high, and the field disagrees with what was typed.
- Fix:
  - Under `includehead` or `includeall`, move `top` and `headsep` together.
  - Evaluate `\addtolength{\topmargin}{\headsep}` with the hand-set `\headsep` in force.
  - Add a PDF position test for each hand-written form.

**M4. Preferred width wipes column specifications, and Off does not restore them** (rule 5).
- `{p{3cm}l}` becomes `{XX}`, and Off gives `{ll}`.
- siunitx `{lS[table-format=2.1]}` becomes `{X>{\centering\arraybackslash}X}`, which loses the decimal alignment, and Off gives `{lc}`.
- Cause: `setTableWidth` calls `autofit(…,'window')` in `src/table.js`.
- Fix: turn only `l`, `c` and `r` columns into `X`, keep `p`, `m`, `b`, `S` and explicit-width columns (tabularx accepts them), and have Off restore what it changed.

**M5. Split view clones the whole document after every edit** (`src/cmd/wordgaps.js:278-330`).
- On page.py's long document (17,327 nodes copied), typing 3 letters with Split on gives long tasks of 190, 161, 111, 169 and 85 ms. With Split off there are none.
- The second view cannot be typed in. A press there moves the caret into the top view and scrolls it; Word types in the pane you press.
- After a resize to 390 px the second view kept the 1400 px sheet's layout (`shots/split-390.png`).
- The split bar cannot be dragged: it has `role=separator` and no handler.
- Fix: copy or render only the pages near the second view's scroll position, at idle time; copy again on resize; make the bar draggable.

**M6. The `% formula` lines do not survive a trip through Word** (GAP rule 7).
- Export with `% formula B4: =SUM(ABOVE) \# "0.00"`: `document.xml` has no `fldSimple` or `instrText` and no `=SUM`, only the number 3.00.
- Opening that .docx with `docxToLatex` gives the table without the line.
- Rikuy's own sync data keeps the source line, but a Word user gets a dead number. No approximation is documented in PLAN or docs.
- Fix: write a `w:fldSimple` `= SUM(ABOVE) \# "0.00"` with the cached value in `wordast.js`, next to the alt text mapping at `:467`, and read it back in `wordjobs.js`.

## LOW

- **L1.** The Formula dialog's Number format is a fixed select (`src/ui/tablepicker.js:457`, `select()` at `:359-364`). A hand-written `\# "0.000"` shows as "As the value is", and OK silently drops it from the line. Word's box is editable.
- **L2.** Numbers unlike Word's (`formula.js:190,219,223`):
  - `ROUND(-2.5,0)` gives -2; Word gives -3.
  - `2.675` with `#,##0.00` gives 2.67, and `1.005` with `0.00` gives 1.00 (binary `toFixed`); Word shows 2.68 and 1.01.
  - 1e21 with no format writes `1.00000000000000e+21` into the cell.
- **L3.** `\hhline{|=|=|}` is not read as a border: `bordersOf` reports `top:false`. Borders › top then replaces it with `\hline\hline`, and its crossings are lost (rule 4).
- **L4.** All Borders or Pen Style Double on a booktabs table writes `||` and `\toprule\toprule`. booktabs leaves gaps where every rule meets a bar, so the grid looks broken (`shots/bookdouble-pdflatex-1.png`). It should switch the table to `\hline` or say why not.
- **L5.** Signature Line placement:
  - Caret in a list item: the block lands after the paragraph that follows the list.
  - Caret in a cell: it lands after the table.
  - The rule and the name can split across a page (no minipage and no `\nopagebreak`).
- **L6.** `hf-header-top` and `hf-footer-bottom` cost 3 to 5 ms each per look at the caret. On page.py's long document plus 20 tables they are the 2nd and 3rd slowest commands: 39.4 ms in total against the 40 ms bar. (page.py `long_document` itself passes at 30 ms.) Cause: `sheet` scans the main file with `preambleEnd` on every look (`wordgaps.js:23`). Memoise it per source version.
- **L7.** LaTeX jargon in Word dialogs:
  - "Left and right (\tabcolsep)"
  - "Top (\extrarowheight)"
  - "Row height (\arraystretch)"
  - "Display, no number (\[ \])"

  The Table Properties Cell tab is 43 px wide.

## What held up

- Undo: every edit tried was one step, byte for byte. That covers Linear typing, Formula, and Header from Top and Footer from Bottom on four hand-written forms.
- Compiles: 24 of 24 succeeded (8 documents on pdfLaTeX, XeLaTeX and LuaLaTeX):
  - booktabs with doubled rules
  - wraptable before a short paragraph and a list, in two columns, near a page end, and before a section
  - Signature Line with `&` and `_` escaped, in a cell, in a list, and at a page end

  The wrapfig guard refuses a list, a heading or the end right after the table.
- The formula parser uses no `eval`. It refuses `constructor`, `__proto__` and `toString`. 400 nested parentheses and 990 unary minuses are fine. Division by zero and syntax errors give plain messages. `cellNumber` reads `(12)`, `$-$3`, `\$5`, `5\%`, `\textbf{7}` and `\num{1234.5}`, and rejects "12 apples".
- Phones at 390 and 360 px with touch: Table Properties, Borders and Shading, Formula, Zoom, Equation Options and Signature Setup all sit inside the screen, and every target is at least 44 px except the Cell tab (43 px).
- page.py `long_document` passes: 30 ms in total, no command over 5 ms.
- Header from Top with `\usepackage[…]{geometry}` options and with a `\geometry{…}` line: one edit each, read back exact.

# Verification of 3d3bfc4

Every repro in `/tmp/review-g2-out/` was rerun on the worktree's build of 3d3bfc4: `fx.mjs`, `um.mjs`, `um2.mjs`, `tb.mjs`, `tb2.mjs`, `wx.mjs`, and the `rv.py` sections `eqlin`, `fxrows`, `fxhang`, `hfpos`, `split2`, `speed` and `phones_all`. New attacks are in `um3.mjs`, `tb3.mjs`, `wx2.mjs`, `wx3.mjs` and the `rv.py` sections `fxops`, `eqfast`, `hfpdf2`, `hfdims` and `split_phone`. The only uncommitted change in the worktree was `src/app.css` (the author's phone fix); nothing here depends on it.

## Verdict: fix first

Four defects block the merge. Each is small to fix, and each is either new from the fixes or was missed in round one.

1. **Header from Top pushes the header off the sheet in KOMA documents.** Repro: `scrartcl` with `scrlayer-scrpage` and `\ihead{HEADMARK}`, Header from Top set to 1 cm. The field reads back 1 cm, but TeX's PDF has no header on page 1 at all (`shots/koma-ba.png`, before and after). Cause: the page model does not know typearea. It has top 126.27pt, headsep 25, headheight 12 and footskip 30; TeX has 84.5pt, 20.4, 17 and 47.6 (`rv.py hfdims`). `\headsep` is therefore set to 85.82pt and the header lands above the sheet. The Header & Footer fields on KOMA classes are also wrong before any edit: they read 3.14 cm, while the header's text sits at about 1.8 cm in TeX. Fix: refuse on KOMA classes, `typearea` and `memoir` until the model reads their layout, or read the numbers from the compile.
2. **Footer from Bottom is 1.77 cm off on a default `article`.** This holds whenever no package sets the PDF's sheet (`src/cmd/wordgaps.js:73,77`, `(g.paperH || g.ph)`). `\paperheight` is letter (794.97pt), but the sheet the page and the PDF use is A4: `ph` 845.05pt, MediaBox 841.89bp.
   - The field reads 3.15 cm when TeX's footer is about 4.75 cm from the edge.
   - Set to 1.5 cm, TeX's footer sits at about 3.1 cm (`rv.py hfpdf2`, case `fancy`).
   - Measure to the sheet (`g.ph`), as Word does.
3. **Move Row Up and Move Row Down delete the formulas of the rows they move.** Repro (`fxops`): `table-row-up` on beta or `table-row-down` on alpha. The toast says "The formulas of D2, D3, E2 went with its cell". Those lines are removed although the cells only moved; the values stay, now dead. Cause: those operations pass no `moved` map, so `formulasAfter` treats the swapped cells as gone. Fix: give `moved` for row moves, as Sort does. The toast's "went with its cell" is also wrong for a plural.
4. **Opening a Word file keeps only the last formula of each table.** Repro (`wx3.mjs`): a table with `=B2*2` in B3 and `=SUM(ABOVE)` in B4 gives back only B4's line. In a three-field table only the last came back. Cause: `formulaLines` (`src/wordjobs.js` at 3d3bfc4, about line 1112) inserts a line before the table, then parses the next field at the old offset `tops[k]`, which now points inside the inserted comment, so `parseTable` fails and the field is skipped. Fix: move `tops[k]` by the length inserted, or collect every field's edit and apply them once.

## Each first-round finding, rerun

| Finding | State | Evidence |
|---|---|---|
| H1 Linear box rewrote the equation | **fixed** | The `eqlin` space leaves the source byte for byte (no history entry). `eqfast`: `\alpha_1/(c+d)`, `ab/cd` and `y^2^3` typed at full speed after `\hat{x}…\leftarrow\mathbf{v}`, `\binom` and `cases` change only the end: one step, one undo exact. `um3.mjs`: 60 odd forms, 53 live; the other 7 wait for Enter. |
| H2 Update overwrote data after an inserted row | **fixed** | `fxrows`: the formula renamed to B6, plums kept at 5; Delete Rows renamed it to B4. `fxops`: insert above, below, left and right, delete row and column, and Sort rename the lines and their references and ranges. Every operation's undo and redo were byte for byte. Guard: 99 typed over D4 is left alone, with the toast "D4 holds 99, not 10…"; `\textbf{12}` is kept. |
| M1 UnicodeMath operands | **fixed** | `ab/cd`, `2x/3y`, `n!/k!`, `∂f/∂x`, `1/2/3`, `x^2^3`, `a^-1`, `▒`, `〖〗`, `ℝ`, `\leftarrow` and `\leftrightarrow` are all right. Depth over 100 gives a plain error and the box goes read only. |
| M2 Formula time bound | **fixed** | `A1:ZZZ99999` went from 13 s to 0 ms; formulas over 500 characters are refused. |
| M3 Header from Top on includehead and a hand-set `\headsep` | **fixed for those forms** | Both read back 1 cm; TeX puts the header at about 1.0 cm with the text unmoved (`hfpdf2` cases `geominc` and `fancy`). Blockers 1 and 2 are new forms. |
| M4 Preferred width wiped specs | **fixed** | `p{}`, `S`, `D{}{}{}`, `@{}…@{}`, `!{\vrule}`, `<{\%}` and `>{\raggedright}p` all keep their bytes and Off restores them (`tb2.mjs`, `tb3.mjs`). Only `*{3}{c}` comes back as `ccc`. |
| M5 Split cloned per edit | **partly** | `page.py`'s long document (125 pages, 1 copied and 130 stand-ins): typing 10 letters with Split on gives 15 long tasks of 55 to 387 ms, about 2.2 s in all. With Split off there are none. Bar drag, the read-only note, the resize copy and Web Layout in both views all work. |
| M6 Formulas through Word | **fixed for one formula per table** | Download Word writes `<w:fldSimple w:instr=" =SUM(ABOVE) \# &quot;0.00&quot; ">`. A field reads back from `fldSimple`, from a complex field, from a complex field split over runs, and from lowercase code. A newline or `\input` inside `instrText` stays inside one comment line. Several fields per table: see blocker 4. |
| L1 Number format | **fixed** | Box with a list; a hand-written format is kept. |
| L2 Numbers | **fixed** | `ROUND(-2.5)` gives -3, 2.675 gives 2.68, 1.005 gives 1.01, and 1e21 is written out in full. |
| L3 `\hhline` | **mostly** | Read as a border now. Pen Style Double on a top that is already `\hhline{|=|=|}` still replaces it with `\hline\hline` and loses its crossings. |
| L4 booktabs bars | **fixed** | No bars and no double rules; booktabs rules are kept. |
| L6 Header box cost | **fixed** | All commands' `when` and `on` take 26 ms per caret look on the long document, none over 1 ms except `synonyms`. |
| L7 Jargon and Cell tab | **fixed** | (not rechecked on a phone: the author is changing that CSS now) |

Merge of main: `tabs.py` 137 passed, `agent.py` 143 passed, `csp.py` 22 passed, 0 failed.

## New findings, not blocking (record in PLAN or fix)

- **MEDIUM, phone: tapping the second view leaves nothing focused.** At 390 px with touch, a tap on a word in the second view moves focus to `body`, not the top view. Text typed next goes nowhere (`QQ` never reached the source); the same holds in Web Layout. The split bar is 7 px tall on a phone; a finger drag works, but the target is under 44 px. In landscape at 844×390 the top view, where you type, is 73 px tall after a drag.
- **MEDIUM: Split Table drops the formulas of the rows that move to the new table** ("The formulas of D3, B4, C4, D4 went with its cell"), and E2 becomes `=D2/#REF!*100`. Word keeps a field in its cell.
- **LOW-MEDIUM: Enter in the Linear box turns a LaTeX comment into printed text.** The equation `x % note⏎+ y`, with " + 1" typed and Enter, becomes `x\%note+y+1`. The note warns first, but Enter is also how Word users leave the linear form, so an author's private note gets typeset. Keep `%…` comments as raw LaTeX in the linear text.
- **LOW: computed values are written with up to 10 decimals**: `33.3333333333`, `3.0303030303`. That is what a reader sees in the PDF.
- **LOW: Footer from Bottom ignores a later hand-written `\setlength{\footskip}{1cm}` after `\geometry{…}`.** The field reads 1.5 cm, but TeX's footer did not move (2.57 cm both before and after).
- **LOW: `\addtolength{\headsep}{5pt}` is not read before an edit.** The field shows 3.1 cm, TeX 2.92 cm; once set, it is right.

## Fixes for the review

Each finding, what was done and the commit (branch `word-gaps-doc`, on a286911). Test counts with `dist/tex`.

- **H1** (Linear box rewrote the equation): `807da97`. Only whole `\left` and `\right` are taken as sizes; a command UnicodeMath has no form for (`\hat{x}`, `\mathbf{v}`, `\binom{n}{k}`, `\operatorname{tr}`, `\mathrm{d}`, `\dfrac`, `cases`, `\left( \right)`, `\,`, `\%`) is shown and read back as written; `\frac{a}{b}^2` is `〖a/b〗^2`; a written slash is `∕`. The box writes as it is typed only when the equation reads into it and back unchanged token for token, and then only the tokens that differ (the rest keeps its bytes); otherwise a note says Enter writes it. The review's repro: a space leaves the source byte for byte, `+1` and `y=` are written alone, one undo. 17169 equations of the corpus, sample and dev/bench: all but 334 live and byte for byte after a space (the 334: text between dollars, babel's quotes, `\frac{1}m`, which wait for Enter).
- **H2** (formulas stale after row edits, Update overwrote data): `0cc12c2`. `formulasAfter` renames each line and its references after Insert Above, Below, Left, Right, Delete Rows and Columns, Sort, Merge, Split and Delete Cells (one step with the operation; `#REF!` for a deleted cell, which Update reports); a line whose cell went is taken off with a toast; Delete Table takes the formula and alt lines. A line keeps the value it wrote last (`% formula B5 [10]: …`); Update Formulas leaves a cell that holds something else and says so. The review's repro now keeps plums' 5. Sort also lost a row's `&` when the row ended in an empty cell: fixed in the same commit.
- **M1** (UnicodeMath not read as Word): `807da97`. Runs as one operand (ab/cd, 2x/3y, n!/k!, ∂f/∂x, f(x)/2), 1/2/3 left to right, x^2^3 as x^{2^{3}}, a^-1, ▒ ┬ ┴ 〖〗 converted, ℝ ℕ ℤ ℚ ℂ as `\mathbb`, `%` `#` `$` escaped; brackets deeper than 100 give a plain message, no throw.
- **M2** (no time bound): `0cc12c2`. Ranges clamped to the grid (A1:ZZZ99999 from 13 s to under 1 ms), MIN and MAX by a loop, a formula over 500 characters refused in words, the same length stored and read.
- **M3** (Header from Top under includehead, hand set `\headsep`): `568970c`. Under includehead or includefoot the margin moves with headsep or footskip; the page reads every `\setlength{\headsep}` in order. `docgaps.py headfoot_forms`: both forms set to 1 cm, read back 1 cm, and in TeX's PDF the header 1 cm down and the text where it was.
- **M4** (Preferred width wiped specifications): `811b3f5`. Only l, c and r become X; p, m, b, S and the rest stay; Off gives the bytes back.
- **M5** (Split cloned the document per edit): `842bafb`. Only the pages near the second view's window are copied, at idle time, and only those that changed (3 of 19 pages on the long document, 19 of 19 before); a resize copies the frame again; the bar drags by mouse, finger and keys. The second view does not take typing: it says it is read only, and a key typed there says where to type (a press puts the caret in the top view). Typing in it as Word's pane does is not built.
- **M6** (formula lines lost in Word): `a11bfd9`. Download Word writes Word's own field round the value; opening a .docx brings its `=` fields back as lines where the cell holds the result Word showed. Not kept: formulas in a table that holds a table.
- **L1** (Number format fixed list): `0cc12c2`, a box with Word's list; a hand written format is kept and read back.
- **L2** (numbers unlike Word's): `0cc12c2`. ROUND(-2.5) is -3, 2.675 to 2.68, 1.005 to 1.01, no exponent.
- **L3** (`\hhline` no border): `00ade6c`. Read as the rule over its - and = columns, and kept when Top Border is on already.
- **L4** (booktabs with bars and double rules): `00ade6c`. No bars and no double rules on a booktabs table, a toast says why; Left, Right and Inside Vertical are off there with the reason as their tooltip.
- **L5** (Signature Line placement): `00ade6c`. Lines joined by `\\*` (the line and the name never part); with a real caret in a list item it goes right after the list, in a cell right after the table (the repro's `at_src` put no caret in the list).
- **L6** (Header and Footer box cost): `568970c`, the preamble's end found once per text of the main file.
- **L7** (LaTeX words in dialogs, 43 px Cell tab): `0cc12c2` and `00ade6c`. Left and right, Top, Row height, times the usual, Display, no number; Table Properties' tabs 44 px wide on a touch screen.

Checks after the fixes: `npm test` passed; `test/docgaps.test.mjs` 20 groups; `test/docgaps.py` 166 passed; `table.py` 175; `view.py` 163; `page.py` header_footer, long_document and compile_pdf 44; `word.py` 111; `word.test.mjs` 78 groups; `eqtab.py` 159; `tabs.py` 127; `agent.py` 143.

## Fixes for the verification of 3d3bfc4

- **Blocker 1** (KOMA, typearea, memoir): `4c8b415`. Header from Top and Footer from Bottom are greyed there, unless geometry lays the page out; the tooltip says why and what to do, and a run by name writes nothing. Reading their layout is left (PLAN task 68).
- **Blocker 2** (Footer from Bottom to letter height): `c2445a5`, measured to the sheet (`g.ph`); `docgaps.py footer_sheet` checks A4 and letter in TeX's PDF.
- **Blocker 3** (Move Row Up and Down dropped formulas): `03d1d3b`, `moveRow` gives `moved` as Sort does; the plural toast fixed.
- **Blocker 4** (one formula per table from Word): `7bd537d`, the table's start moves by each line written; the fields come back in order.
- **M5** (2.2 s typing with Split): `3e4712b`. The copy waits for 400 ms of quiet and an idle time, a page at a time, and a class or style change of the first view copies those two attributes instead of rebuilding the frame. On the 125 page document, ten letters: 0.8 s of long tasks, up to 100 ms, against 0.6 s and 70 ms with Split off. The document costs about 60 ms a keystroke by itself (its contents' page numbers, the caret): the verification's baseline typed with no caret in the page, so "no long task over 50 ms" cannot hold for this document with Split on or off. `split_long` checks Split's long tasks against those without it.
- **Phone** (tap, 7 px bar): `62da7dd`, the bar 44 px with touch; on this build a tap in the second view puts the caret in the top view and typing lands there.
- **Split Table**: `dbaaf06`, the moved rows' lines go before the new table, renamed.
- **Enter and a `%` comment**: `2711c73`, a comment stays a comment with its line's end.
- **Ten decimals**: `d7eb98b`, two places at most with no format.
- **`\addtolength{\headsep}`**: `314a2a5`, read in order (also `\addtolength{\footskip}`).
- **Pen Style Double on `\hhline{|=|=|}`**: `7e7777b`, kept.
- **References' Update buttons at 32 px**: `3442fc8`, 44 px with touch (`refs.py phone` 30 passed).
- Left, in PLAN: `\setlength{\footskip}` after `\geometry{…}`; `*{3}{c}` back as `ccc` after Preferred width Off.

