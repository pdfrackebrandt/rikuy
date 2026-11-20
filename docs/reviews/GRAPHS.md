# Hostile review: interactive graphs as Rikuy's edge (PR 88, graphs-edge at 0ae9783)

Reviewer: Claude (hostile reviewer, economist's eye), 2026-11-20. Own worktree at 0ae9783, built
with `dist/tex`. Scratch, scripts and screenshots: `/tmp/review-graph-out/` (`gt.mjs`,
`num.mjs`, `root.mjs`, `islm.mjs`, `pv.mjs`, `impl.mjs`, `pgf2.mjs`, `fuzz.mjs`, `a1.py` to
`a9.py`; `shots/`).

## Verdict

**Not ready to merge as "the edge".** The plumbing holds up: one undo is byte for byte, PGF
compiles on all three engines, the web page export makes no request and runs nothing of the
document's, and the formula language holds up against hostile input. But several things an
economist sees in the first minute are wrong. The textbook supply and demand pair draws as a
parametric curve. The printed PDF shows `5.55e−17` at a steady state. `\log` is base 10. Implicit
curves draw false lines along poles. A `$` in a label garbles the PDF. Graph this can put the
graph above the equation and split the paragraph. The exported web page carries every text file
of the project. The fixes are small. Fix every High and Medium finding before this is presented
as the edge.

## High

1. **Supply and demand in its usual form draws as a parametric curve.**
   `Q_d = a - bP, \quad Q_s = c + dP` gives "a parametric curve as P runs from 0 to 2π",
   with Q_d across and Q_s up. That is meaningless (shot `shots/gt-all.png`, third panel).
   Cause: `src/graphthis.js:196-206` takes any pair of different names that share a letter as
   parametric. Fix: use the parametric reading only when the shared letter is t, θ, τ or s, or
   when the two left sides are a coordinate pair (x and y, x_1 and x_2). Otherwise, when the two
   left sides share a stem (Q_d and Q_s, q^d and q^s, L^d and L^s), draw two curves against the
   shared letter with their crossing marked.

2. **Floating point noise in crossing labels, printed in the paper's PDF.**
   Graph this on `\dot k = s k^\alpha - (n+\delta)k` labels the steady state `(4.79, 5.55e−17)`,
   both live and in the pdfLaTeX PDF (`shots/gt-kdot-pdf-crop.png`). `tan x` against 0 gives
   `(−7.4e-18, −7.4e-18)`. Every rest point of a `\dot k` graph sits on the zero line, so every
   such graph shows this. `fmt` (`src/graph.js:852-860`) writes the raw value, and `:859` changes
   only the first `-` to a minus sign, so `−1.22e-16` mixes the two. Fix: snap a value to 0 when it
   is below 1e-9 of the plot's range, give crossings with a constant curve that exact value, and
   change every `-`.

3. **A `$` in any label garbles the PGF picture.**
   In `labelTex` (`src/graph.js:1388`), `out.join('').replace(/\$\$/g, '')` also removes the `$`
   of an escaped `\$`. The axis label `$k$` becomes `\k$\$`, `$k_t$` becomes `\k_{t}$\$`, and
   `x$1$` becomes `$x$\1$\$`, which is an undefined `\1`. Compiled in the page, the label
   `x$1$ and a$b` prints as "x$anda ¯" (`/tmp/review-graph-out/dollar.pdf`, `a7.py`). Users who
   know LaTeX will type `$k$` in the axis field. Fix: keep the pieces as text and math and join
   neighbouring math pieces, instead of a string replace.

4. **`\log` is base 10.**
   `y = \log x` gives log(2) = 0.301 (`src/graph.js:48`). In economics and mathematics papers,
   `\log` means the natural log. Any `\dot k = s\log k - \delta k` gets wrong values, crossings
   and steady states. Fix: read `\log` from LaTeX (Graph this) as ln. Keep `log` typed in the
   dialog as Desmos has it if you like, and say so in the dialog's help.

5. **Graph this can insert the graph above the equation and split its paragraph.**
   The source `Hi.\n\begin{equation} y = a x \end{equation}\n\n` becomes
   `Hi.\n\n\begin{center}\rikuywidget…\end{center}\n\n\begin{equation}…`, so the graph sits above
   the equation and the paragraph is broken (`a5.py`). The cause is that `graphThisRun`
   (`src/cmd/graphs.js:58`) passes `p: T.e` through `restoreCaret`, and `afterBlockPos`
   (`src/app.js:4376`) works from the DOM caret, which lands in the block before. An inline
   equation in a `tabular` cell also gets its graph after the *next* paragraph. Fix: work out the
   place from the source, as the first block end at or after `T.e`, and test that the result is
   never before `T.e`.

6. **The exported web page contains every text file of the project.**
   `src/cmd/graphs.js:82` packs all text files under 2 MB into the "Open in Rikuy" `#share=`
   link: the whole source with its `%` comments, the `.bib`, and any notes. A
   `notes-private.txt` with "SECRET reviewer notes" decodes straight out of the exported
   `sample.html`. The toast says "put it on your website" and says nothing about this. Fix: pack
   only the files the main document reaches (inputs, bib, graphs, rikuy.sty), offer to strip
   comments, and say plainly that the source is inside, with a way to leave the link out.

## Medium

7. **Implicit curves draw false lines along poles.**
   Marching squares (`src/graph.js:710-742`) joins sign changes that pass through infinity.
   `y = tan x` gives 180 false segments, `y = 1/x` draws the line x = 0, and
   `1/(x−0.3)+1/(y−0.3)=1` draws the lines x = 0.3 and y = 0.3 (`impl.mjs`: segments whose
   midpoint has |F| from 50 to 6,700). Fix: drop a cell whose middle value exceeds its corners,
   or check F at each joined point.

8. **"Area" is the signed integral.**
   `src/graph.js:596` labels `|∫(u − l)|` as "area". Shading sin from 0 to 2π reads
   `area = 1.62e−16`; the area is 4. Shading 1/x over [−1, 1] gives `1.34e−15` for an integral
   that does not exist. Shading ln x over [−1, 1] gives 0.945 instead of 1 (trapezoids across the
   singularity). Fix: integrate |u − l| (or call the value "integral"), refuse a pole inside the
   interval, and fall back to adaptive steps where the integrand is unbounded.

9. **Supply and demand defaults put the equilibrium where it is not marked.**
   `q = a − bp, q = c + dp` and `p = a − bq, p = c + dq` start with a = b = c = d = 1, so the lines
   cross at the end of the range. `src/graph.js:556` leaves crossings at the ends unmarked, so the
   toast's "where they cross marked" is false. Fix: for linear pairs, choose starting values with
   the crossing inside, or mark a crossing at an end when it is the only one.

10. **Notation that economics uses all the time is misread or refused.**
    - `q^d`, `q^s`, `\pi^e` are read as powers.
    - `u^*`, `r^*`, `\pi^*` give "* cannot stand here" (the Phillips curve and Taylor rule fail).
    - `\bar u`, `\mathbb E_t` and `\log_{10}` are refused.
    - `\Phi(x)` and `\Gamma(x)` become a slider times x, a straight line drawn without a word.
      Probit `P = \Phi(\beta x)` is wrong.
    - `\max(x, 0)` is refused as "an operator over a set".
    - CRRA `u(c) = (c^{1−σ}−1)/(1−σ)` is refused because σ starts at its singular value 1
      (`src/graphthis.js:23`).
    - With 10 parameters the 8-slider cap (`:157`) shows "No slider is called k: add one", which
      makes no sense from Graph this.

    Fix: treat a superscript of d, s, e, * or a bar as part of the name; map Φ to normcdf and Γ to
    gamma; move a role's start off a value where nothing draws; write a plain message for the
    cap.

11. **The wrong variable and the wrong ranges.**
    - `q_1 = (a − c − q_2)/2` (a Cournot best response) is drawn against c, the cost, not q_2
      (`VAR_RANK`, `src/graphthis.js:29`).
    - `E = ½mv²` is drawn against m.
    - The Laffer curve `R = τ(1−τ)^ε` is drawn on τ ∈ [−5, 5] when only [0, 1] means anything.
    - Lotka and Volterra by Graph this is drawn on [−5, 5]² with its rest point at (40, 0.35),
      outside the plot.
    - Slider values come from the first `n = …` anywhere in the project's prose, so "n = 500
      observations" sets Solow's population growth to 500 (`pv.mjs`; `paramValues`,
      `src/graphthis.js:54`).

    Fix: rank a subscripted rival (q_2 in a q_1 equation) above other letters; give a letter
    whose role is a rate [0, 1]; take document values only from math near the equation, and name
    in the toast the values it used.

12. **The opening document's claim is wrong for its own Bellman equation.**
    `sample/main.tex:39` has `c ∈ [0, k]`. With f(k) = k^α, that limit binds for
    k < (1−αβ)^{1/(1−α)} ≈ 0.57, which is the whole plotted range [0, 0.5], steady state
    included. So k′ = αβk^α does not solve equation (1) as written, though the new sentence says
    it does. Fix: `c ∈ [0, f(k)]`, and say "full depreciation". Also, `aspect: 0.26` with equal
    ranges (`sample/graphs/saving.json:9`) draws "the 45 degree line" at about 15°.

13. **Phones: the graph is hard to read and the Edit graph button covers it.**
    On a touch screen `.w-edit` is always visible and centred over the plot (`src/app.css:2100`).
    At 390 px it covers the steady state mark and its label in the first screen
    (`shots/open-390-crop.png`). The plot itself is about 90 px tall in the editor and about
    45 px in the exported page at 390 px. The legend covers the curves, the tick labels crowd
    together, and the legend runs into the slider values (`shots/web-sample-390.png`,
    `shots/clip-360.png`). Fix: a minimum plot height of about 180 CSS px at narrow widths, the
    legend below the plot when the plot is short, and the Edit graph button in a corner or behind
    a long press. The exported page also scrolls sideways by 8 px at 360 px, from KaTeX's MathML
    of a display equation.

14. **Circles draw as ellipses.**
    Implicit and phase plots never get equal axes (`src/graph.js:874`), so `x² + y² = r²` comes
    out as a flat ellipse (`shots/gt-all.png`, last panel). Desmos and GeoGebra keep a circle
    round. Fix: use equal scaling when both axes are one quantity, or when the user asks for it.

15. **A broken hand edit leaves an old picture in the PDF without a word.**
    The live frame says "This graph cannot be drawn". But `graphRefresh`
    (`src/cmd/insert.js:253-282`) throws on that graph, so the PDF keeps the old figure. The throw
    also stops the loop, so later graphs are not drawn again either. The compile reports success
    and nothing appears in the problems list. Fix: catch errors per graph, skip only the broken
    one, and report it as a problem in its `.html` file.

## Low

- Live legends show the formula language raw: `k′ = α β k^α`, `k_t^α`, `x^2 + y^2 = r^2`, in the
  first screen too. The PDF typesets them. Typeset the live legend: superscripts and subscripts
  with canvas text offsets, or KaTeX inside the frame.
- `\dot k = f(k)` says "its rest points marked", but k = 0 is never marked (it is at the end of
  the range). Phase portraits do not mark their rest point, which is already computed
  (`restPoint`).
- The exported page's `<title>` is escaped twice and holds KaTeX's annotation:
  `Supply &amp;amp; Demand: α\alphaα` (`src/webpage.js:271`). Strip tags from the plain text,
  not from the HTML.
- `\ddot x = −ω²x` gives "\ddot is not a function this graph knows". It could become a phase
  portrait, or at least get a plain message. `M/P = L(Y, i)` gives "A bracket is not closed",
  which is the wrong reason.
- A PGF picture's labels have a fixed font size while its coordinates scale with `\rikuywidth`.
  A journal class with another text width, or a hand set `width=0.4\linewidth`, can make labels
  overlap the plot. Say so in GRAPHS.md, or scale `\footnotesize` with the ratio.
- arXiv's TeX help says "do not include extraneous files". The `graphs/*.html` widgets, about
  64 KB each with the kit's JavaScript, are files TeX never reads. Leave them out of an arXiv
  download, or document it (https://info.arxiv.org/help/submit_tex.html).
- The `#share=` cap is 1.9 MB, which suits Chrome. Firefox and Safari were not tested at that
  length.
- The opening document's status bar shows "17 spelling errors", and the author line "Rikuy" is
  underlined. I did not check whether this predates the PR.

## What held up

- **One undo, byte for byte.** Graph this on k̇, Ramsey, the parametric pair, k_{t+1} and the
  circle: one step each; undo returns every file and picture, and redo works.
- **The numbers are right.** Templates: supply and demand gives equilibrium (4, 6), consumer
  surplus 8 and producer surplus 8. IS–LM crosses at (13.3, 4.67). Solow's k* is 5.15 (exact
  5.1537). Ramsey's k* is about 8.29; its field directions in all four quadrants, its nullclines
  (including ċ = 0 along c = 0) and the divergent path above the saddle path are right.
- **Graph this answers well where it works.** Its Ramsey pair is zoomed to twice the rest point
  (17 by 2.9). `k_{t+1}` gets its steady state 7.92, which is exact. The saving rule's steady
  state is 0.177, which is exact. Odd roots of negative numbers are real.
- **PGF compiles on all three engines.** Graph this outputs, a two column document, a theorem, a
  footnote and a list item compile on pdfLaTeX, XeLaTeX and LuaLaTeX with no errors, as vector
  graphics. The PGF matches the live figure. PGF sizes: Ramsey 72 KB, the others 8 to 18 KB.
- **TeX injection is escaped.** `\input`, `^^5c`, `\\`, `\end{document}`, `&`, `#` and `%` in
  labels all come out escaped. The `$` handling (High 3) is the one gap.
- **The web page export is sealed.** About 1.0 MB. Opened offline with every request refused, it
  makes no request out and its graphs draw. A hostile document's `<script>`, `javascript:` links,
  KaTeX `\href` and `\style`, a graph file with a script of its own, and a crafted JSON title all
  end up as inert text. The export regenerates frames from the description, and the policy
  allows only Rikuy's hashed scripts.
- **The sandbox and messages hold.** The frame menu opens only after a real click in that frame,
  at most once per click. Height messages are clamped.
- **Hostile input is cheap.** Nested braces, `\frac` chains, 4,000 character inputs, 2 MB digit
  runs in `paramValues`, stiff phase systems and dense implicit equations each finish in under
  70 ms. Sizes are capped.
- **Frames fit their sliders.** Ramsey with 4 sliders and a graph with 8, at 1400 and 360 px.

## Response (graphs-edge, after fd9bb57)

Each High and Medium has a check in `test/graphs-review.test.mjs` (in `npm test`) that failed
before its fix, or in `test/graphs.py` for what needs the page (H5, H6):

- H1 `flip`, `lhs` and the pair of one stem (`src/graphthis.js`, `src/graph.js` compute and
  ranges); a parametric curve only for t, θ, τ, s or a coordinate pair.
- H2 `fmt` with the plot's span, every minus a minus sign; a crossing with a constant curve at its
  value exactly.
- H3 `unmath` in normalize (`$k_t$` is k_t); `labelTex` built from pieces of text and math.
- H4 `\log` natural, `\log_{10}` and `\log_2` (`lg`, `lb`), the PDF writes Desmos's typed log as
  `\log_{10}`.
- H5 `afterSourcePos` (`src/cmd/insert.js`): after the TeX paragraph that holds the equation, past
  the table that holds a cell's, never before it.
- H6 `sourceFiles` and `stripComments` (`src/webpage.js`), the export's dialog
  (`webPageDialog`, `src/cmd/graphs.js`; `export-web-page {link, comments}` for agents).
- M7 poles in `contour`: an edge halved twelve times towards its sign change, and its guessed
  point, must come near 0.
- M8 the area of |u − l|, finer steps at a domain's edge, none across a pole.
- M9 `crossInside`: the sliders' usual values tried until a crossing is inside.
- M10 names with a mark (`marks()` in `src/graphthis.js`, the kit's `NAME`, `nameTex`,
  `nameRuns`), π as a name where a graph declares it, `\mathbb E`, `\Phi(`, `\Gamma(`, `\max(`,
  a parameter moved off 0/0, 12 sliders.
- M11 a rival subscript, `v`, a Greek variable's role range, Lotka–Volterra's rest point in larger
  boxes, `paramValues` from math only, the values named in the toast.
- M12 the sample: `c ∈ [0, f(k)]`, full depreciation, the graph above the abstract at half the
  text width, `equal`, the 45 degree line at 45 degrees, in the first screen at 1366 by 768.
- M13 Edit graph and LaTeX above the graph on a touch screen (fd9bb57); the plot about 180 px of
  a phone's screen (the page sends the frame its scale); the legend in rows over the plot.
- M14 `equal` for a coordinate pair's implicit curves and for k_{t+1}; the plot widened from its
  corner where both axes start at 0.
- M15 `graphFault` in `src/problems.js`; `graphRefresh` skips a graph that no longer draws and
  goes on with the others.
- Lows: typeset legends (fd9bb57); the title as plain text (`plainOf`); plain words for `\ddot`
  and an undefined function of several letters; the spelling marks (0bb9b60); the PGF label
  sizes, arXiv's extraneous files and the link's length are said in `docs/handoff/GRAPHS.md`.

## Verification of 8d00a2e

Own worktree at 8d00a2e, built, with `dist/tex` for the compiles. I reran every repro from the
first round, the 50 equations (`gt.mjs`) and 31 trickier forms (`tricky.mjs`), plus three new
scripts: `strip.mjs`, `a10.py` and `a11.py`. Screenshots are in `/tmp/review-graph-out/v2/`.

**Verdict: fix first.** Two small fixes. First, the comment stripper that the export runs by
default produces a source that does not compile. Second, equal axes widen the plot but not the
region the curves are worked out on, so curves stop in the middle of the plot, and that is
printed in the PDF. Everything else from the first round is fixed or acceptable.

### Fixed, each checked with my repro

- **H1 supply and demand.** `Q_d = a - bP, Q_s = c + dP` and `Q^D … Q^S` now draw two curves with
  P up. The meeting point is marked at (5.5, 4.5), which is exact. `L^d, L^s` works too.
- **H2 rounding.** The steady state reads `(4.79, 0)` live and in the PDF; tan's roots read
  (0, 0) and (±3.14, 0).
- **H3 `$` in labels.** `$k$` and `$k_t$` are set as math. `\input` and `\write18` inside `$…$`
  are reduced to plain letters.
- **H4 log.** `\log x` is ln (0.693 at 2), `\log_{10}` is lg.
- **H5 placement.** The graph now goes after the equation's paragraph, and after the table for
  a table cell's equation.
- **H6 export.** The dialog says what the link carries. A `notes-private.txt` stays out, and
  "leave the link out" leaves it out.
- **M7 poles.** No false segments for tan, 1/x or 1/(x−.3)+1/(y−.3)=1.
- **M8 areas.** Areas are now |u − l|: sin over [0, 2π] gives 4, x over [−1, 1] gives 1, ln over
  (0, 1] gives 1, and 1/x across 0 says "no area, a pole".
- **M9 starting values.** Linear supply and demand pairs start with their crossing inside the
  plot.
- **M10 notation.** `\Phi`, `\Gamma`, `\max(x,0)`, `u^*`, `\bar u` and CRRA work. A role is
  moved off 0/0 (σ starts at 2.25).
- **M11 variables, ranges, values.** Cournot is drawn against q_2; ½mv² against v; Laffer on
  [0, 1]; Lotka–Volterra round its rest point. "n = 500 observations" is ignored, because values
  are now read from math only.
- **M12 the sample.** It reads `c ∈ [0, f(k)]` and states full depreciation, the 45° line is at
  45°, and there are no spelling marks.
- **M13 phones.** Edit graph no longer covers the plot. The exported page's plot is 260 px tall
  at 390 and 360 px.
- **M15 broken hand edits.** A graph whose description breaks is skipped and the others are
  still drawn; the problems list has an entry (`src/problems.js:142`).
- **Still good.** One undo is byte for byte on all six Graph this cases, and all of them compile
  on pdfLaTeX, XeLaTeX and LuaLaTeX.

### New or remaining

1. **High (new): the default "comments removed" breaks the source behind "Open in Rikuy".**
   `stripComments` (`src/webpage.js:289`) treats every unescaped `%` as a comment, and the
   export runs it on `.tex` and `.bib` files by default. In the exported sample's link:
   - `See \url{https://example.org/a%20b}` comes out as `See \url{https://example.org/a%`.
   - The `.bib` entry `title = {A 5% rise}` comes out as `title = {A 5%`.
   - `\verb|x % 2|`, verbatim and listings code, and `\href{…%2C…}` are cut the same way
     (`strip.mjs`).

   The opened project then has unbalanced braces and does not compile. URLs with `%20` in
   `\url` and in `.bib` fields are common.

   Fix: never strip `.bib` files, where `%` is not a comment inside an entry. In `.tex`, remove
   only whole-line comments outside verbatim-like environments, and leave the rest of each line
   alone. Add those cases to `graphs-review.test.mjs`.

2. **Medium (new): equal axes widen the plot but not the region the curves are worked out on.**
   `paint` widens `x1`/`y1` (`src/graph.js:1216-1221`) after `compute` has run on
   `s.x`/`s.y`. Graph this on `x_1^\alpha x_2^{1-\alpha} = \bar u` draws axes to 27, while the
   indifference curve stops at x_1 = 10, live and in the pdfLaTeX PDF
   (`v2/gt-all.png`, `v2/pdf2.png`). A phase field and a `k_{t+1}` map with equal axes are cut
   the same way. Fix: widen the ranges before `compute`, through the same frame arithmetic, so
   the computed region always fills the plot.

3. **Medium (remaining): no equilibrium is marked when the pair has different left sides.** The
   usual IS–LM forms (`Y = A − br, r = cY − d`, and the textbook one with M/P) and the pair of
   Cournot best responses become implicit curves. Nothing is marked where they cross, and IS–LM
   gets Y, r ∈ [−5, 5]. Fix: when both curves can be solved for the same letter (each is linear
   in it), mark their crossing. At least mark crossings between the curves of an implicit graph
   (marching squares already finds both), and take a [0, …] range when Y is one of the pair.

4. **Low to medium: the notation reader on tricky forms.**
   - `\pi^e_t` fails ("A subscript needs a name before it"), while `\pi_t^e` works.
   - AR(1) written `y_t = \rho y_{t-1} + \varepsilon_t` fails ("A subscript needs letters or
     digits after _"); `k_{t+1} = g(k_t)` works, and this is the same map.
   - `\max\{x − K, 0\}` is still refused as "an operator over a set".
   - `\mathbb E_t` refuses with a cryptic subscript message.
   - `\hat`, `\tilde` are refused.
   - In a single equation, `y = x^d` and `y = x^{d}` are now read as a variable named x^d, a
     straight line, not a power. Read d/s/e/* as labels only where a pair or a left side needs
     it.
   - The Phillips curve is drawn against π^e rather than u. The Taylor rule is drawn against r^*
     rather than π_t.
   - `\phi(x)` is drawn as φ·x.

5. **Low (remaining): the shared source can miss files, and other small leftovers.**
   - `sourceFiles` misses `\input chap1` written without braces, `\import{parts/}{intro}` (it
     looks for `intro` without the folder), and `\lstinputlisting`. A link from such a project
     opens without those files.
   - The exported page still scrolls sideways at 360 px, now by 20 px. The cause is KaTeX's
     hidden MathML of the display equation, which is absolutely placed and escapes `.eq`'s
     `overflow`. Fix: `.eq{position:relative}`.
   - `\%` in a label prints a backslash.
   - The live legend shows `Q_d` with a raw underscore, while the rest is typeset.
   - Graph this's supply and demand starts with `a` at its slider's maximum (10 of [0, 10]).

### Verdict

Fix items 1 and 2, with tests: each is a few lines. Item 3 is worth doing before this is called
the edge, because the IS–LM equilibrium is in the brief. Items 4 and 5 can follow as an open
task in PLAN.md.

## Response to the verification

Each item has a check that failed before its fix: `test/graphs-review.test.mjs` groups V1 to
V5 (18 groups in all), and `graphs.py`'s web page at 360 px in a desktop browser.

1. **V1 (High).** `stripComments(text, name)` (`src/webpage.js`) removes whole comment lines
   only, never inside verbatim, Verbatim, lstlisting, minted, alltt, comment or filecontents,
   keeps Rikuy's `% rikuy:` lines, and leaves a `.bib` as it is. A `%` after text stays, so
   `\url{…a%20b}`, `\href{…%2C…}`, `\verb|x % 2|` and `50\%` are untouched; the export no
   longer passes `.bib` files to it at all.
2. **V2.** `region(s, geo)` in the kit: where one scale on both axes widened the plot, the
   curves are worked out again on the wider region, live (`mount`), in the PDF's picture
   (`graphPGF`) and in the PNG (`graphCanvas`). The indifference curve of
   `x_1^\alpha x_2^{1-\alpha} = \bar u` now runs to the plot's edge.
3. **V3.** An implicit graph of two equations marks where they meet (`meets()`: the grid's cells
   where both change sign, refined by Newton's method; 200 cells tried, 8 marks at most). Graph
   this sets it for every pair it draws as implicit curves (IS and LM as `Y = …, r = …`, two best
   responses), takes Y and r from 0, and tries the sliders' usual values until the crossing is
   inside the plot.
4. **V4.**
   - `\pi^e_t` reads (the mark before or after the index).
   - An AR(1) `y_t = \rho y_{t-1} + \varepsilon_t` is the map y_{t+1} = ρ y_t + ε_t, against the
     45 degree line at one scale. A Greek name now takes a subscript (`\varepsilon_t`).
   - `\max\{x - K, 0\}` reads (`\{` counts as a bracket when equations are split).
   - A letter mark (d, s, e) names only where it must: the name is a left side, its letter
     stands alone elsewhere (π and π^e), or it carries another mark (q^d and q^s). `y = x^d` is
     a power again. `*` and the bar always name.
   - A marked name is never the variable where another will do: the Phillips curve is drawn
     against u, the Taylor rule against π_t.
   - `\phi(x)` of one letter is the normal density; `\phi(\pi - \pi^*)` stays a coefficient.
5. **V5.**
   - `sourceFiles` reads `\input chap1` without braces, `\import{parts/}{intro}` with its folder,
     and `\lstinputlisting`, `\verbatiminput` and `\inputminted`.
   - The exported page no longer scrolls sideways at 360 px. The cause was a display equation
     inside a paragraph, outside any scrolling box (not the MathML). `.katex-display` now
     scrolls in its own box.
   - `\%` in a label prints %.
   - The live legend sets Q_d's d as a subscript.
   - Supply and demand's slider no longer starts at its end: the usual values try 5 before 10,
     and a value at its slider's end widens the slider.

Left in PLAN.md task 70: `\hat` and `\tilde`, indices with a sign beyond an AR(1)'s y_{t-1}
(`\mathbb E_t[\pi_{t+1}]`), the rest point of a phase portrait marked, PGF label sizes against
the width printed, an arXiv download without the widgets' `.html` files, and the link's length
in Firefox and Safari.
