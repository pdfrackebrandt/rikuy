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
