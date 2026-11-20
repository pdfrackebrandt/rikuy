# Interactive graphs: Rikuy's edge (task 70)

## The edge in one line

**The live paper**: one `.tex` file, typed like Word, printed by real TeX as a journal ready PDF,
whose figures are live in the browser while the PDF carries the same figure. Word has no live
figures and no TeX; Overleaf has TeX but no live figures and no typing on the page; Desmos has
live graphs but no paper; Jupyter and Quarto have live output but no Word style typing, and their
PDF figure is a separate rendering. Rikuy has all four parts, and the figure TeX prints is the live
figure by construction.

## What a graph is

- `graphs/<kind>-<4 letters>.html`: the graph's description as JSON (one key a line, readable and
  editable by hand), and Rikuy's own script that draws it (`graphKit` in `src/graph.js`, its text
  copied in, so the file runs anywhere with nothing from the network). The page runs it in a
  sandboxed frame (`src/widget.js`).
- `graphs/<kind>-<4 letters>.pgf`: the picture TeX prints. Written by the same `paint()` the live
  figure runs, on a recording 2D context (`PGFContext` in `src/graph.js`): each path becomes PGF
  path commands, each text a `\pgftext` set in the document's own fonts (the label's LaTeX given by
  `paint` as `g.rkTex`). Coordinates are fractions of `\rikuywidth`; layout uses one text width
  estimate (`tw`) for both, so lines fall at the same places. Its first line marks it as Rikuy's:
  `% rikuy-graph: <graph file> <hash of the description> <width>`; Rikuy draws it again when the
  description or the box's width changes (`graphRefresh` in `src/cmd/insert.js`), before every
  compile too. Derived data: an asset, not a step of the history (one undo of an insert or an
  Update takes it with the step).
- `\rikuywidget[width=\linewidth,alt={…}]{graphs/x.html}{graphs/x.pgf}` with `rikuy.sty` v1.1,
  which inputs a `.pgf` fallback at the width option's width and loads PGF as the preamble ends
  (`\AddToHook{begindocument/before}`), so a later `\usepackage[...]{xcolor}` keeps its options.
  A `.png` or `.pdf` fallback still goes to `\includegraphics`. No shell escape; arXiv takes the
  files as they are.
- Older projects: a PNG picture of Rikuy's and `rikuy.sty` v1.0 become PGF and v1.1 on the next
  Update, in the same undo step; a `rikuy.sty` of one's own is left alone and its graphs stay PNG.

## What was built

1. **The opening document** (`sample/main.tex`, `sample/graphs/saving.json`, built into
   `src/sample.js` by `build.mjs`): under the title, a live graph of the saving rule
   k′ = αβk^α that solves the sample's Bellman equation (log utility, k^α), with the 45 degree
   line and the steady state marked; α and β on sliders; one sentence says so. Its whole frame,
   sliders included, is in the first screen at 1366 by 768. The TikZ sentence now says what the
   page draws (`src/drawing.js`).
2. **Graph this** (`src/graphthis.js`, `src/cmd/graphs.js`): the right click menu of an equation,
   the Equation tab (Tools) and the search box. The equation's LaTeX is read by the formula
   language (`\frac`, `\dfrac`, `\frac12`, `\sqrt`, `\sqrt[n]`, `^{}`, `_{}`, `\ln`, `\exp`,
   Greek, `\cdot`, `\left`/`\right`, `\lvert`, `\mathrm`, implicit products) and written back as
   readable text (`kit.show`, which reads back to the same values: 2,000 random trees in the unit
   test). It chooses the kind: y = f(x), f(x), a parametric pair, F(x, y) = c, `\dot k = f(k)`
   (the rate with its rest points marked), `k_{t+1} = g(k_t)` (against the 45 degree line), a
   pair of time derivatives (a phase portrait round its rest point), two curves of one left side
   (IS and LM: the variable they share). Every other letter is a slider, its range from its role
   (α a share, δ a depreciation rate, β a discount factor; Latin letters' economic roles only
   when the variables are quantities) and from a value the document gives it ("α = 0.3"). What
   cannot be drawn (a `\max`, a sum, V defined by itself) is said in words.
3. **Kinds economists need** (`src/graph.js`): implicit curves (marching squares, 120 cells
   across, joined into lines), phase portraits (field arrows, nullclines, a Runge–Kutta path from
   a point the reader drags or moves with the arrow keys), shaded areas (under a curve to the
   axis, another curve or the crossing level; from and to a number, a slider's formula or
   "cross"; the area in the legend), crossings marked with dashed lines to the axes and their
   coordinates, and the curves at the starting values faint while a slider moves. Templates:
   supply and demand (surpluses shaded), IS–LM, Solow, Ramsey, budget line and indifference curve,
   normal and t densities, the central limit theorem; and a template per kind (Lotka and Volterra
   for Phase).
4. **The PDF's figure as vector graphics**: PGF as above, compiled on pdfLaTeX, XeLaTeX and
   LuaLaTeX in `test/graphs.py`, and held against the live drawing in pixels (mean difference
   3 to 4 of 255, 96 to 100 % of the curves' pixels within 2 px).
5. **Export as, Web page with live graphs** (`src/webpage.js`): the page's model through the tree
   the Word download builds (`src/wordast.js`) written as HTML, math by KaTeX with its fonts
   inside, the paper's serif inside, graphs live in sandboxed srcdoc frames regenerated from
   their descriptions (never the document's own script; a hand written widget becomes its
   picture), a Content Security Policy that allows exactly Rikuy's scripts by their hashes, and an
   "Open in Rikuy" link (`#share=`, the project's text files). One file, about 1 MB, no request
   out; it works on a phone with no sideways scroll.
6. **Prominence**: Interactive graph is the second large button of Insert's Illustrations;
   Graph this is in the search box, the Equation tab and the equation's menu; Help, Interactive
   graphs and Learn Rikuy name them; `llms.txt` describes all of it; README's first lines lead with
   the live paper.
7. **Power users**: every slider by keyboard (the frame's native range inputs: arrows, Page Up and
   Down, Home, End, Tab between them), a phase portrait's start by the arrow keys; formulas in the
   dialog with their mistakes said in words and underlined where they are (a mirror of the field's
   text behind it); the dialog's own undo (Ctrl+Z, Ctrl+Y, and buttons); the description readable
   in the `.html` file and in the `.pgf` file's comment, a hand edit of it redrawn live and in the
   PDF; while a slider moves the drawing uses half the samples and grids, the full drawing 150 ms
   after it rests, so a frame stays under 16 ms at a phone's speed.

8. **The figure as a paper's** (the polish after the first look): labels, legend, axis titles
   and the sliders' values are typeset math in the paper's faces (KaTeX's Computer Modern,
   which the page sends the frame as font data: `paperFaces` in `src/widget.js`, the web page's
   own script in `src/webpage.js`), k′ with its prime, α a superscript, x₁^α stacked, the same
   LaTeX in the `.pgf` (`seriesRuns` and `put` in the kit, `TEXER` outside it). No label has a box
   behind it: the legend goes to a corner of the plot no curve crosses (the start curves
   counted), else to rows over the plot beside the y label and the sliders' values, and a
   crossing's coordinates to the side of its dot where no curve, guide or label is. The sliders
   line up with the plot, Reset is a quiet word; on a touch screen Edit graph and LaTeX wait for
   a tap in the graph and stand above it; View, Dark page gives the frame the dark paper's ink.
   The opening document has no spelling marks.

## Security

The formula language never evaluates JavaScript: text is read by Rikuy's own parser into
closures over a fixed table of functions. Every size is capped (formula length, nodes, depth,
sliders, curves, equations, shades, crossings, points, grid cells, path steps). A stranger's graph
runs only in its sandboxed frame; the page draws a graph's picture from its description with
Rikuy's code, never the file's script. The PGF picture escapes every label for TeX
(`\input`, `\write18`, `%`, `&`, `#`, braces: test/graphs.test.mjs). The web page allows no
script but Rikuy's by hash, no connection, no form, no plugin.

## What is left

- The description in the `.tex` itself (a `rikuygraph` environment holding the formulas, with the
  HTML file derived): today the `.tex` names the graph's files and the `.pgf` comment summarises
  it; hand edits go in the `.html` file's JSON.
- Graph this on a system of more than two equations, inequalities (shaded regions defined by
  them), and a saddle path drawn for the Ramsey model.
- The web page's dark mode, and its fonts subset to the characters used (about 1 MB now).
