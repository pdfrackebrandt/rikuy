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
