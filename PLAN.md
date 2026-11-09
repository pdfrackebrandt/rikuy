# Rikuy: state and plan

Rewritten 2026-10-25 after round 2, which finished or measured every task of the round 1 plan.
Read the rules at the end before the first commit.

## Where it stands

| check | v19 (published 2026-10-12) | version 23 (published 2026-10-26) | version 25 (2026-10-28) | version 28 (2026-10-29) | version 29 (2026-11-09) |
|---|---|---|---|---|---|
| corpus compiles (LaTeX-examples, 716 documents present) | 705 | 706 | 706 | as version 25 | as version 25 |
| corpus PDFs equal to a desktop TeX Live 2026's | 615 of 704 (87.4 %) | 700 of 705 (99.3 %) | 703 of 705 (99.7 %) | as version 25 | as version 25 |
| TeX passes over the whole corpus | not counted | 995 (1,471 without latexmk's first-run `.aux`) | 995 | as version 25 | as version 25 |
| `test/engines.py` | 22/22 | 22/22 (its PSTricks check now asks for drawn lines) | 22/22 | 23/23 (a check that pygmentize loads no code a document wrote) | 23/23, now run by CI on a tree built there (`tex.yml`) |
| `tex/native/xindy/test.cjs` (against CLISP's xindy) | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 |
| TeX Live's 220 Asymptote examples as a desktop's asy draws them | not measured | against a native asy 3.09: 216 (196 equal PDFs, 12 equal failures, 7 random by design, 1 equal alone); 4 open | against the desktop's asy 3.11: 218 (201 equal PDFs, the 3D ones rendered as bitmaps; 10 equal failures; 7 random by design); 2 open: 1 numerical, `slope` out of memory | as version 25 | as version 25 |
| edits on the typeset page landing exactly, undone byte for byte (`test/editor_corpus.py`) | not measured | 780 of 780, in the 222 documents with text, a formula, a cell or a footnote; 211 of 211 edited projects compile | as version 23 (page unchanged) | 781 of 792 land, 11 open as source by design, all 792 undone byte for byte, on the complete corpus; 211 of 211 edited projects compile | as version 28 (model and parser unchanged) |
| artifact size (limit 256 MB) | 250.0 MB | 249.7 MB | 252.3 MB | 253.1 MB (with the 0.8 MB license bundle) | 253.6 MB (pdf.js shipped, IBM Plex inlined) |

Version 23 changed only the page (task 13): its `dist/tex` is version 22's byte for byte, so the
TeX rows are version 22's runs. Version 24 changed Asymptote (tasks 17 and 18: `asy.wasm`, the
shaders in the tree, the worker's pipe to TeX), version 25 again (task 19: GSL, FFTW and Eigen,
and the worker letting a program go after a run that leaves it above 1 GiB), and the desktop
reference was repaired (task 2); version 25's corpus rows are version 22's runs, with the three
corpus documents that run asy compiled again and compared with the repaired desktop.

Version 26 (2026-10-28) adds sharing and comments (task 20) and programs rebuilt so that the
build no longer depends on the machine (task 21); its TeX rows are version 25's, with
`test/engines.py` 22/22 and xindy 11/11 again on the rebuilt programs; artifact 252.3 MB.

Version 28 (2026-10-29) is the one attacked before going public (task 22). Its TeX tree is
version 25's but for gnuplot, which only says 2-rikuy in its version now, so the corpus and
Asymptote rows are version 25's runs; the page, the worker's scripts and the license bundle
changed.

Version 29 (2026-11-09) closes the security audit of 2026-11-06 and what an independent review of
its fixes found (task 24), and has CI rebuild what was only rebuilt by hand (task 25). Its TeX
tree is version 28's: of `dist/tex`, only `engine.js` changed and `pdf.min.mjs` was added, so the
corpus, Asymptote and editor rows are earlier runs; `test/engines.py` and `test/pdf.py` ran on a
tree CI built from the pinned inputs, equal to `dev/dist-manifest.txt` byte for byte.

Equal means: the same number of pages, the same text on each page (`pdftotext -layout`,
whitespace collapsed), and no page with more than 0.1 % of its pixels differing by more than
64 of 255 at 72 dpi in grey. Both sides run with `SOURCE_DATE_EPOCH=1700000000` and
`FORCE_SOURCE_DATE=1`. The desktop is Ubuntu 26.10's TeX Live 2026.20260711 with the fonts its
packages recommend (`dev/fetch_tl26.sh`, `dev/tl26.sh`), run through latexmk with rules for what
Rikuy's worker runs between passes (`dev/pdfcompare.py`). Results: `dev/corpus-results.jsonl`
and `dev/pdfcompare-results.jsonl`.

### What round 2 changed

- **The tree is TeX Live 2026.20260711.** Ubuntu 26.10's TeX Live packages (pinned by
  sha512 in `tex/fetch_inputs.sh`) are laid over the tree in BusyTeX's release (TeX Live 2026 of
  March) and win for every file they share; BusyTeX keeps its engine's configuration. The three
  formats are made by Rikuy's own engines from that tree (`tex/build_formats.py`). The LaTeX
  kernel is 2026-06-01 (v19: 2025-11-01). `RIKUY_TL_FIRST=0` lets BusyTeX's files win again,
  v19's order (v19's packages were Ubuntu 24.04's TeX Live 2023).
- **Bugs the comparison found, fixed:**
  - Another pass when a pass read a file it then wrote with other content (latexmk's rule, from
    TeX's `-recorder` file). Tables of contents had kept the page numbers of the pass before.
  - `texmf-dist/makeindex` was left out of the tree, so `nomencl.ist` and every other
    makeindex style were missing: nomenclatures never printed.
  - Files of one name in several TeX Live folders were dropped: XeTeX's own `pstricks.con`
    was missing from the tree.
  - And even with it there, TeX never read it: run as applets of BusyTeX's one binary, the
    engines had the program name "busytex", and kpathsea's default search path for that name
    puts `tex/generic` first. XeLaTeX read PSTricks' generic `pstricks.con`, wrote `ps:` specials
    xdvipdfmx cannot draw, and every PSTricks figure under XeLaTeX came out blank (five corpus
    documents). `test/engines.py` passed because it only asked for no errors. The engines now run
    with TeX Live's `-progname` (pdflatex, xelatex, lualatex, latex), and the test asks for
    drawing operators on the page: 0 on the old worker, now there.
  - pgfplots' gnuplot plots all write `<job>.pgf-plot.table`; a second table of the same size
    written within the millisecond the folder was copied in looked untouched and never reached
    TeX, which drew the first curve again. Copies now carry the time 0.
  - sansmathaccent was not in the tree; beamer loads it whenever it is installed, so math in
    sans slides used another italic than on a desktop.
  - A first compile ran two passes where latexmk runs one: latexmk starts from the `.aux` a
    one page document writes. Rikuy does too now; the corpus needs 995 TeX passes, not 1,471.
  - minted: a file latexminted deleted stayed on TeX's side, and its stale message turned off
    highlighting for the rest of the document. Deletions now pass between the programs' file
    systems. Its Python wheels are the ones TeX Live's minted 3.8 bundles (latexminted 0.7).
  - gnuplot (npm's gnuplot-wasm 0.1.0) failed every `igamma()` ("Igamma: errno = 0").
    gnuplot 6.0.2, the desktop's version, is now built here with that check fixed.
  - TeX Live ships EC and Cyrillic (LH) metrics for some sizes only; a desktop makes the others
    with mktextfm. `tex/build_pk.py` now makes them (T1, TS1, T2A: 566 files, byte for byte
    what mktextfm makes). Russian headings had vanished.
  - bold-extra's fonts (bold typewriter for listings' keywords) were missing.
  - A run with "No pages of output" left an empty PDF that counted as success.
  - Found by the Asymptote comparison (task 9): each program's and each TeX instance's stack
    pointer, a WebAssembly global the memory restore does not cover, sank a little every run
    (callMain leaves argv on the stack). Ghostscript's 64 KB stack ran into its heap after about
    25 of asy's runs in one session: the page hung or crashed, and every example after it failed.
    Every run now starts from the first run's stack pointer. Files a program left open when it
    exited (dvips its `.dvi`, every run) are closed after it.
  - asy's pipe cache handed texpath an earlier label's outlines (Ghostscript runs on one file
    name for every label), and kept the empty answer of a Ghostscript not loaded yet. 3D labels
    swapped places, lost lines or failed ("reading array of length 0"). Ghostscript now also
    gets its standard input (texpath answers its page prompts).
  - media9 (for PRC figures; its Flash players stay out) and eulervm were not in the tree.
  - Found by the editor run (task 13), on the page:
    - siunitx knew six units, so `\celsius`, `\hertz`, `\bit`, units from `\DeclareSIUnit` and
      siunitx inside formulas showed as red source. Now the units and prefixes siunitx defines,
      powers, `\per` in its three modes, digit grouping, the decimal marker, rounding, ranges,
      lists and `\ang`, with `\sisetup` and the package options (`src/siunitx.js`). Formula
      errors on the 35 corpus documents that use siunitx: 402 → 97, the rest the documents'
      computed macros and typos.
    - The equation field hands back the text it was given until the first keystroke (MathLive
      0.110), so a formula it could not read (an `array` with `*4{c}` columns, `\tikzmark`)
      passed the round trip check and was then rewritten from what the field kept: the Jordan
      matrices lost their entries, and undo did not bring them back. The check now reads the
      field's own serialization; such a formula opens as source, with a note.
    - For the same reason the smallest patch compared the source with the field's normalized
      spelling (`x_n` with `x_{n}`) and rewrote whole rows; it lines them up ignoring braces now.
    - Plain brackets around a fraction became `\left( \right)` whenever their row was edited,
      which changes the PDF. They stay as written; brackets typed in the field still get them.
    - An environment made with `\newenvironment` that opens a `tikzpicture` (the Karnaugh maps)
      had its body read as text, and a formula edit there landed in `\usepackage{tikz}`. Such
      environments are source blocks now, drawn in the PDF.
    - `\tikzstyle`, `\pgfmathdeclarefunction`, `\newglossaryentry`, `\DTLloaddb`, `\psset` and
      other setup commands in the document body showed their arguments as text; making "sqrt"
      in a pgfmath formula bold broke the compile. They are hidden now. Commands that set a
      file, a database or a drawing (`\lstinputlisting`, `\includepdf`, `\DTLdisplaydb`,
      `\DTLpiechart`, `\pgfplotstabletypeset`, chemfig's `\chemfig` and `\arrow`) are one block,
      so their file names, keys and code are not typed into; chemformula's `\ch` is set like
      mhchem's `\ce`.
- **Programs built here from source** (`tex/build_tools.sh`): dvips, Asymptote 3.09 now with
  GLM and XDR (WebGL, V3D and PRC output), and since version 24 OpenGL through Mesa's OSMesa
  (task 17), xindy, and gnuplot 6.0.2. A clean `RIKUY_SRC` rebuilds all four.
- **Size:** the niche packages TeX Live 2026 added (one school's beamer theme, thesis classes,
  icon and card sets) go to the mirror only (`DROP` in `tex/build_tree.py`), as do the Aurical
  fonts.
- **Reproducible:** `tex/fetch_inputs.sh` into an empty folder, then
  `build_tree.py tree && build_tree.py packs && node build.mjs`, gives `dist/tex` byte for
  byte as `dev/dist-manifest.txt` lists it (checked again on 2026-10-28 for version 26: all 268
  files equal, from a work folder `fetch_inputs.sh` laid out from the committed `inputs/` and
  hash checked downloads; a work folder made otherwise can differ, as one here without
  minted's wheels did).
- **Desktop reference fixed:** the fonts TeX Live's packages recommend (Debian moves Linux
  Libertine, Gentium, Noto and others out of the tree), the font databases, and CLISP for xindy;
  on 2026-10-28 asy's own libraries and an X display for it (task 2).

## Building

1. `npm ci` (node 22); `pip install lz4 playwright numpy pypdf`; Chromium for Playwright through
   `PLAYWRIGHT_BROWSERS_PATH`; `poppler-utils` for the comparisons.
2. `tex/fetch_inputs.sh` lays out `$RIKUY_WORK` (default `/tmp/eng`): about 3 GB, rerunnable,
   every download checked against its hash.
3. `python3 tex/build_tree.py tree && python3 tex/build_tree.py packs && node build.mjs` gives
   `dist/`. Use this, not `build_all.sh`: the formats, PK fonts, metrics and font caches in
   `inputs/generated*.tar.gz` were made for exactly this tree. When the tree changes,
   `tex/build_all.sh` remakes them all, then pack them again (`fetch_inputs.sh` says how).
4. Programs built for Rikuy are committed in `tex/vendor/`; `tex/build_tools.sh` rebuilds them
   (`RIKUY_VENDOR` to build elsewhere and compare).
5. The desktop TeX Live 2026 for comparisons: `dev/fetch_tl26.sh` (into `/opt/tl26`, about
   6 GB), then `dev/tl26.sh <program>`; its asy needs an X display for 3D (`xvfb` on the build
   machine: `dev/pdfcompare.py` starts one, for `dev/asycompare.py` use `xvfb-run -a`).

Tests:
- `npm test`, then `npm run test:engines` and the other `test/*.py` (they serve `dist/`; AGENTS.md says which covers what)
- `node --no-experimental-fetch tex/native/xindy/test.cjs`
- `node test/model.test.mjs` and the other `*.test.mjs` (CI runs them)
- one document: `RIKUY_DIST=dist python3 dev/texrun.py DIR main.tex auto 300`; where its time goes:
  `dev/profile.py le/<path>`
- the corpus: clone MartinThoma/LaTeX-examples at `8bfd313b8d98`,
  `CORPUS_REPO=... SDE=1700000000 PDF_DIR=pdf python3 dev/corpus_full.py OUT.jsonl`. About
  100 minutes on 2 cores. Run nothing else meanwhile: the harness limit is 240 s.
- the comparison: `DESKTOP_CACHE=desk python3 dev/pdfcompare.py OUT.jsonl pdf CMP.jsonl`, then
  `dev/pdfcompare_report.py CMP.jsonl dev/pdfcompare-classes.json`
- Asymptote: the 220 examples are TeX Live's `utils/asymptote/examples`, in the checkout
  `tex/build_tools.sh` makes (`$RIKUY_SRC/tl`); `dev/asycompare.py` says how to run it against
  the desktop's asy (`dev/tl26.sh asy`) or a native build of Rikuy's (`dev/build_asy_native.sh`).
- the editor: `test/editor_corpus.py OUT.jsonl` (about 40 minutes of edits, then 20 of compiles)

## Tasks of round 1: status

0. **Parity with v19.** Done in round 2's first commit: manifest equal, 22/22, 11/11, every
   document ok in the baseline ok again.
1. **No hard coded work folder.** Done.
2. **PDFs against a desktop TeX Live 2026.** Done. 703 of the 705 documents both sides
   compiled are equal (99.7 %). The other two have their cause in `dev/pdfcompare-classes.json`,
   and neither is Rikuy's: one Metropolis deck whose Fira Sans the desktop's fontconfig lists
   but XeTeX cannot load (it falls back to Computer Modern serif; Rikuy has no Fira, says so and
   keeps Latin Modern Sans), and one document whose pixels are equal but whose opening quote has
   no Unicode mapping in Debian's own build of Linux Libertine. Until 2026-10-28 the corpus's
   three Asymptote figures differed too, blank or of height 0 on the desktop, which round 2 put
   down to the desktop having no display. Wrong: the desktop's asy never started. Its libraries
   (readline, GLEW, freeglut, libsigsegv, GL) were missing from the reference
   (`dev/tl26-packages.txt`), and Debian's asy looks for its base modules in
   `/usr/share/asymptote`. With them and an X display (`dev/pdfcompare.py` starts Xvfb; the
   desktop's asy renders 3D through a window, with Mesa 26's llvmpipe) all three are equal. One
   document compiles in Rikuy only: `class-diagram` needs an `mpost` step from its Makefile
   that neither side runs, and latexmk calls the missing figure a failure.
3. **A larger corpus (arXiv).** Blocked: the machine Rikuy is developed on cannot reach
   arxiv.org (nor CTAN). Ready to run: `dev/arxiv_corpus.py` (seeded sample of
   1,000 papers, 84 per year 2015 to 2026, a PDF-only paper replaced by the next of its year,
   one request per 3 s) and `.github/workflows/arxiv.yml` (sample, fetch, build, 8 shards
   compiling with Rikuy and with the desktop TeX Live, results committed to the branch
   `arxiv-results`). Either run `dev/arxiv_corpus.py` and `dev/corpus_full.py` on a machine that
   reaches arxiv.org, or start the workflow (Actions, "arXiv corpus": about 20 runner hours).
   See task 16.
4. **One TeX Live, 2026.** Done, with one deviation: the TeX Live 2026 files come from Ubuntu
   26.10's packages, not from CTAN's `texlive2026.iso`: the development machine cannot reach
   CTAN, and Ubuntu's archive keeps every package at a fixed address (snapshot.ubuntu.com), so
   the tree is TeX Live 2026.20260711 pinned by hash. Compile rate 705 →
   706, match rate 87.4 % → 99.3 %, artifact 249.7 MB, new manifest.
5. **Native programs from source.** Done. The vendored dvips, asy, xindy and gnuplot are this
   round's builds by `build_tools.sh` from an empty `RIKUY_SRC`; tests and corpus as above.
   xindy differs from v19's only in build paths embedded by ECL (`/tmp/src/eclwasm` then).
6. **Corpus timeouts.** Done. No document of the corpus needs the 240 s limit now:
   `3d-gaussian-distribution` takes 63 s in one pass measured alone (two passes before
   latexmk's first-run `.aux`), 81 s in the full run, where the desktop's latexmk took 69 s;
   `exponential-functions-gif` (100 pgfplots frames) 158 s alone in two passes, as latexmk runs
   it, 205 s in the full run (desktop: 197 s). `facharbeit-rsa` takes 11 s (minted). With another
   job on the two cores both had passed 240 s. `write-math-ba-paper` hangs on the desktop TeX
   Live 2026 too, at `\num{\totalCollectedRecordings{}}` (siunitx 3): the document's own.
7. **`Programmierparadigmen.tex`.** Done: the document's own (`\usetkzobj{all}`, gone in
   tkz-euclide 5), shown with the desktop log.
8. **gnuplot** `draw-csv`, `high-order-knot`: done: the documents' own (a Makefile step;
   gnuplot 6 has no `latex` terminal).
9. **Asymptote coverage.** Done. `dev/asycompare.py` draws each of the 220 examples in TeX Live's
   `utils/asymptote/examples` with Rikuy and with another asy: the desktop's own (Ubuntu's asy
   3.11, with its libraries since task 2, under Xvfb), and a native asy 3.09 built from the
   same source with the same features (`dev/build_asy_native.sh`: GLM, OSMesa, GSL, FFTW,
   Eigen, no GC); labels by the desktop TeX Live. Version 25 against the desktop's: 201 PDFs
   equal, the 3D ones rendered as bitmaps (`BezierSurface` and `triads` compared by the PDFs
   they write under other names); 10 examples fail on both sides the same way (missing `.obj`
   data, ConTeXt, image based lighting files from the network, ones that write no PDF); 7 draw
   random data, so the desktop's asy differs from itself between runs; `SierpinskiSponge`
   differs in 0.11 % of the pixels at 72 dpi (the limit is 0.1 %) along edges where coplanar
   faces meet and the depth test comes out the other way: floating point in WebAssembly against
   x86-64; `slope` runs out of memory in Rikuy only (task 19). Against the native asy: the
   same, but `slope` fails there too (without the GC). Results with their causes:
   `dev/asycompare-desktop-results.jsonl`, `dev/asycompare-results.jsonl`. The first run found
   three bugs, fixed above: the stack pointer, the pipe cache, Ghostscript's standard input.
10. **Asymptote 3D like the desktop.** WebGL (`-f html`), V3D and PRC output work (GLM, and XDR
    through `tex/native/rpc`); rendered bitmaps since version 24 (task 17).
11. **The programs reported as missing.** No corpus document calls R, bib2gls or inkscape.
    R: webR 0.6.0 is 48.6 MB (R.wasm alone 18.1 MB) and the artifact has 3.7 MB left; a page on
    claude.ai may not fetch it at run time either (its `connect-src` is `'self'` only). A
    self-hosted Rikuy could load it from the mirror. bib2gls (Java): TeaVM's compiler comes
    only from Maven Central, which the development machine cannot reach; CheerpJ's runtime is served only from its
    vendor's CDN (and not licensed for bundling); Doppio (npm `doppiojvm` 0.5.0) is
    unmaintained since 2017 and needs a JDK 8 class library. inkscape has no browser build.
12. **xindy start.** Measured, not adopted: loading xindy's kernel as ECL bytecode starts in
    293 to 350 ms against 321 to 418 ms from source (fresh processes), of which ECL's own start
    is about 200 ms. Not worth a second link and 130 KB (`tex/build_tools.sh` has the numbers).
13. **The editor itself.** Done for the scripted part. `test/editor_corpus.py` makes six edits
    on the typeset page of every corpus document, where the page offers a place for them (type
    a word, delete one, bold one, extend a formula, type in a table cell, in a footnote), checks
    that each lands in the source where it was made and as itself, that Ctrl+Z gives the source
    back byte for byte, then compiles the edited project. On version 23: 222 of the 716 documents
    offer a place for at least one edit (the others are TikZ and other figures with no running
    text); of 792 edits tried, 780 land exactly (191 typed, 203 deleted, 202 bold, 111 formulas,
    56 table cells, 17 footnotes) and 12 formulas open as source by design (9 siunitx commands,
    3 formulas the equation field cannot hold); all 792 undo byte for byte; the 211 edited
    projects whose original compiles all compile. Version 28's run, on the complete corpus with
    each project's own .sty files (task 22): 781 land, 11 open as source, all 792 undo, 211 of
    211 compile. Results: `dev/editor-results.jsonl`, `dev/editor-compile.jsonl`. The runs found
    the six bugs above.
    The user test (`dev/usertest.md`: one hour, five people) is the maintainer's to run.
14. Left alone: the documents' own faults.
15. **License.** Done: the AGPL-3.0 text in `LICENSE`, the components in `NOTICE`.

## Tasks after round 2: status

17. **3D bitmaps from Asymptote.** Done in version 24. Mesa 24.0.5 (Ubuntu 24.04's source
    package, pinned by hash) is built with Emscripten 3.1.6 by `tex/build_tools.sh mesa`:
    meson with `tex/native/mesa-cross.ini`, OSMesa on softpipe, no LLVM, threads or window system, static
    libraries; `tex/native/patch_mesa.py` lets Mesa take Emscripten for Linux (it is musl with a
    Linux system call layer), drops thread names and the CPU number, and makes OSMesa static.
    asy is configured with OpenGL and `--enable-offscreen` but no GLUT (two GLUT calls guarded),
    and links Mesa's GL instead of Emscripten's WebGL. asy forks a child to render each
    picture; WebAssembly has no fork, so asy renders in place and then copies back its memory
    below the heap's top, as it was before the render: the child's exit, in effect. Without
    that a run's later pictures inherited the first one's GL objects, and a picture with a
    transparent surface came out in an earlier picture's colours: asy's fragment counting pass
    copies each buffer's vertices but not its materials, and the drawing pass after it copies
    nothing; only a buffer's first use, in a fresh process always, forces the copy (a bug of
    asy's that a forked child never meets). The shaders are in the tree at TeX Live's place
    (`texmf-dist/asymptote/shaders`); `blend.glsl` compares an unsigned `n` with `1` and `0`,
    which GLSL 3.30 (softpipe's) rejects, so it gets `1u` and `0u`. Against a native asy built
    with the same Mesa (`dev/build_asy_native.sh`, `MESA=1`): 97 of the 220 examples render a
    bitmap there, and 94 of those are equal in Rikuy (two draw random data, one is
    `SierpinskiSponge`, task 9); runs of three pictures of different sizes, with transparency,
    are equal too, as are the corpus's three asy figures against the desktop (task 2). A clean
    `RIKUY_SRC` gives `asy.wasm` byte for byte. Cost: `asy.wasm` 3.7 → 13.3 MB (0.9 → 3.0 MB
    gzipped as shipped), artifact 251.8 MB. Time in Chromium against native: torus 2.1 s (0.7),
    teapot 16.9 s (6.5), genustwo 49.1 s (16.2); all 220 examples 857 s against 357.
18. **The four Asymptote examples Rikuy failed** (task 9). Done in version 24: all four equal
    the native asy's PDFs. `functionshading`, `layers` and `spectrum` did not hang in TeX's pipe
    but in asy: in the rehearsal (the first run, which only notes labels and where `System`
    fails) converting a layer with epstopdf failed, and `shipout`'s loop over the layers never
    moved past it. It stops now, as a failed shipout (`tex/native/patch_asy.py`). `slidedemo` makes its
    figures with `asy()` between its TeX runs; the worker removed every new file of the folder
    before the next run of the same pipe session, so the slides lost `Pythagoras.pdf` and the
    others. Only the files TeX's own runs made are removed now (`tex/engine.js`).
19. **Asymptote as the desktop's.** Done in version 25. Once the desktop reference ran its asy
    (task 2), Rikuy's could be held against Ubuntu's asy 3.11, the one a desktop TeX Live user
    has, and two examples failed in Rikuy only: `AiryDisk` (the gsl module) and `slope`. asy is
    now built with GSL 2.8, FFTW 3.3.11 and Eigen 3.4.0, the desktop's versions from Ubuntu
    26.10's source packages (`tex/build_tools.sh`, and `dev/build_asy_native.sh` likewise): the gsl
    module, `fft()` and `schur()`. `slope` stays a failure, measured: asy built without its
    garbage collector frees nothing until a run ends, and `slope` fills WebAssembly's 2 GB. Its
    Boehm GC was built and tried (static data registered as roots, binaryen's spill-pointers
    pass for the pointers in WebAssembly locals): 3D rendering two to three times slower, and
    `slope` still out of memory, with 1.5 GB in use after each collection where the desktop's
    64 bit asy peaks at 270 MB (likely false pointers: in 32 bits the heap spans most
    addresses). The worker now lets a program go when a run leaves its memory above 1 GiB and
    loads it again on the next call (`tex/tools.js`): once, in task 9's run, the page had crashed
    after `slope`; now `slope` and three figures after it in one page give the three equal,
    asy loaded again in 6 s. Against the desktop's asy 3.11 now: 218 of 220 as task 9 counts
    them, `AiryDisk` equal; against the native asy built as Rikuy's, 219 (`slope` fails there
    too). A clean `RIKUY_SRC` gives `asy.wasm` byte for byte. Cost: `asy.wasm` 13.3 → 14.8 MB
    (3.0 → 3.5 MB gzipped), artifact 252.3 MB. All 220 examples take 1,410 s in Chromium against
    the desktop's 475 s (on a machine slower than task 17's).

20. **Coauthors without accounts, and one click to leave.** Done in version 26 (`src/share.js`,
    `src/collab.js`). Share copies a link with the document deflated into its fragment (the
    sample's link: 3.8 thousand characters), which opens it in any browser ready to type in (on
    claude.ai, where the page runs in a frame that never sees the link, the recipient pastes it
    onto the page once); the coauthor's view keeps the source closed and marks their own edits. Comments are `% comment (Name) on
    "words": text` lines under the line they are about, with replies; compiled with TeX Live
    2026 the sample with four of them gives the same text and pixels on all three pages as
    without. Send back returns a link carrying the shared version's signature: the author's
    browser merges line by line with what the author wrote since (`merge3`) and marks exactly the
    coauthor's edits in Review (comments listed above the changes). Save writes a one file
    project as its `.tex`, optionally without comments; Open in Overleaf posts the project's
    `.zip` as a data URL to overleaf.com/docs; an Overleaf project's address clones through its
    Git integration (user `git`, the account's token). Evidence: `test/share.test.mjs` 8/8,
    `test/share.py` 26/26 (two browsers), every other browser test as before.

21. **Builds that do not depend on the machine.** Done. `asy.wasm` held 21 paths of the build
    folder and `xindy.wasm` 3, so a rebuild matched only in that folder. `tex/build_tools.sh`
    now maps the source folder to `/src` and the repository to `/repo/tex` for every compile
    (`EMCC_CFLAGS`); for xindy, ECL also named each Lisp file's init function from its full path
    and the clock in milliseconds, compiled the source folder in as a constant and the install
    folder as `SYS:`, so the committed `xindy.wasm` could never be rebuilt exactly: the patch makes
    the names from the file alone and the folders fixed. Two builds from empty folders, one with
    the repository copied elsewhere, give all 532 files of asy, dvips, gnuplot and xindy the same
    SHA-256 (dvips and gnuplot unchanged; in asy only data addresses moved, 253 bytes smaller). xindy
    against CLISP 11/11, `test/engines.py` 22/22.

22. **Attacked before going public.** Done in version 28. Six reviews, each in a copy of its
    own, tried to break Rikuy: its security, the editor, coauthoring with hostile TeX documents,
    the repository as a stranger meets it, then a second security review and a first-time user
    on the merged result. The corpus checks, run again on the complete corpus (the copy used
    before held only the .tex files), found three more. What changed, by what it protects:
    - **The user's browser.** A document could run Python of its choosing in the TeX worker,
      beside this browser's storage: `pygmentize -x` with a `.py` file the document wrote
      (`RIKUY-PWNED` on version 27). Refused for every document. A document from a link, a
      `.zip` or a git clone compiles with TeX Live's restricted shell escape until its owner
      allows more, keeps no LuaTeX font cache, and the worker is let go after it. A 518 KB link
      inflated to 400 MB (now capped at 32 MB); link fields and file names are checked;
      Ctrl+click opens only web and mail links; colours cannot fetch; KaTeX, mhchem, JSZip,
      MathLive and CodeMirror carry integrity hashes; `?texlive=` names only a mirror on the
      page's own site; the arXiv workflow can no longer push from a job that compiles papers.
    - **The user's work.** Opening one's own link replaced the project and lost its figures;
      two tabs overwrote each other; pruning could delete a project's last version; an edit
      just before leaving the page was lost in 3 of 4 runs; Ctrl+Z after typing in the source
      pane dropped that typing; a copy back with one clashing line dropped all the author's
      other edits; reopening a link reset a coauthor's typing; a storage failure said "Saved".
    - **The source.** Joins deleted comment lines; deletions across a theorem's title,
      `\verb|%|` or a character command broke markup; Enter inside `\textbf` broke the build;
      typing after a formula's popover landed inside it; a new numbered equation did not
      compile; Insert, Citation wrote `\citep` for biblatex; Backspace at a theorem's start
      deleted its first paragraph, in a letter it deleted the hidden `\date` and `\subject`,
      after two display formulas it deleted both; a formula made by a macro's own text wrote
      its edit into `\documentclass`.
    - **Licenses.** The page offers its source and the license texts (AGPL section 13);
      `dist/LICENSES.txt` holds every shipped part's license and the notices of every library
      compiled into the programs (`LICENSES/third-party/`); gnuplot says 2-rikuy and NOTICE
      carries its patch, as gnuplot's license asks; the release mirrors the BusyTeX build's and
      ghostpdl-wasm's sources, Expat's and fontconfig's; SOURCES.md names
      TeXlyre/texlyre-busytex-build, whose release is byte for byte our `busytex.wasm` and
      `biber.wasm`.
    - **First contact.** A New document button; a coauthor's copy shows gray boxes for the
      sender's figures and says whose they are, where it showed errors; a thesis template's own
      `.cls` and `.sty` macros are known on the page; Open in Overleaf on the hosted page says
      it cannot and how to upload instead; `dist/index.html` serves from any static server;
      SECURITY.md; the README says what is tested and what the page loads from the network.
    Evidence: `npm test`; the model on the 716 documents, 716 ok; `test/browser.py` 84/84,
    stress 9, features 36, files 30, paste 22, history 39, share 46, mathfield 19, eqextras 18,
    wordmath 83, frontier 13, git 25, pdf 18, `test/engines.py` 23/23; `test/corpus_browser.py`
    on 78 documents, no failure; `test/editor_corpus.py` on the complete corpus as in task 13.
    Every check added for a bug fails on the build before its fix.

23. **Live figures.** Done (`src/widget.js`, `sample/widget/`). `rikuy.sty`, which a document
    carries beside its main file, makes `\rikuywidget[<options>]{<widget .html>}{<fallback
    image>}` plain `\includegraphics[#1]{#3}` in every TeX, and the page runs the widget: a self
    contained HTML file of the project, in a frame sandboxed to scripts (no `allow-same-origin`),
    behind a policy of its own that refuses every request, laid over a box the text keeps for it,
    so it keeps its state while the pages around it are typed in, redrawn, zoomed and paginated.
    Its height comes from `{rikuy: "height", px}` messages, taken only from its own frame.
    `.html` is a text file now, so widgets travel in share links, git, versions and every export.
    Chromium ignores CSP's `webrtc` directive, so a widget could open a WebRTC connection that
    tells its author who reads the document: in a project from a link, a `.zip` or git, widgets
    wait for one click (docs/ARCHITECTURE.md, Live figures). Found on the way: a picture was
    measured before it loaded, at no height (a figure's paragraph measured at 15 px and drawn at
    192), so the pages under-counted every figure; such an item is measured again when its picture
    loads. Evidence: `test/widgets.py` 55/55 under the artifact host's policy (sandbox, a slider
    moved in the frame, typing in the caption and beside the figure patches only the typed text,
    undo byte for byte, the widget's state through edits, undo, zoom and a page move, the fallback
    and the placeholder, the gate and its permission through a reload, five widgets of 65 KB in
    a 174 thousand character link, requests and foreign messages refused; its two height checks
    fail on a build without the fix); `npm test`, the model on the 716 documents, 716 ok;
    `test/browser.py` 84/84, files 30, share 46, git 25, features 36, history 39, paste 22, stress
    9, mathfield 19, wordmath 83, eqextras 18, frontier 13. The sample, and `\rikuywidget` in a
    heading, a caption's short form and the list of figures, compile without error under pdfLaTeX,
    XeLaTeX and LuaLaTeX of TeX Live 2023 (Debian); this machine has no TeX Live 2026 tree, so
    Rikuy's PDF pane did not compile them.

24. **The security audit of 2026-11-06, closed.** Done in version 29 (pull request 1). The audit's
    findings: pdf.js was imported from jsDelivr with no integrity hash, now shipped beside its
    worker (`dist/tex/pdf.min.mjs`); one git token went to whatever remote a project named, now one
    per host, sent only there, with push, pull and clone naming their address and proxy so an
    opened `.git/config`'s `pushurl` or `http.corsProxy` cannot redirect them; mirror packs are
    checked against their index hash before they are cached and when read back; file names with
    `..` or NUL are refused in the worker. An independent review of those fixes then found:
    - **The host check was bypassable.** isomorphic-git requested a remote as written, through the
      CORS proxy as proxy/<host>/<path>, and the browser resolves dot segments in that path:
      `https://github.com/alice/%2e%2e/%2e%2e/evil.example/paper.git` got github.com's token and
      was forwarded to evil.example. Remotes are now used in their parsed form, and one with a
      user name, query or fragment is refused (`canonicalRemote`, `src/gitauth.js`).
    - **The old single token was still filled in for any address typed**, and a stranger's server
      "accepts" it by answering 401 then 200. It is filled in only for the host its prefix names
      (`ghp_`, `github_pat_`: GitHub; `glpat-`: GitLab; `olp_`: Overleaf); otherwise a button
      offers it, naming the host.
    - Push and pull followed an opened config's `branch.<name>.merge`; they name the branch now.
    A second review, of everything after the first, found:
    - **A stranger's remote quoted with a space in front was taken for the user's own.** The URL
      field drops spaces, tabs and line breaks a quoted `.git/config` value keeps, so the panel
      saw an address the user had changed, filled in the host's token and recorded the remote as
      the user's after one pull. Remotes are compared in their canonical form now.
    - Encoded slashes, backslashes, dots and percent signs in a remote's path are refused (a proxy
      that decodes before it reads the host could make another host of them); the old token's
      button holds its choice only for the host it named.
    - `arxiv.yml`: the desktop's step could rewrite Rikuy's results and PDFs it is compared with,
      and one paper could leave a `.sty`, a format or a `~/.latexmkrc` for the next; `collect`
      took rows on trust and stopped on one without `doc`. Rikuy's results now move out of the
      papers' reach before the desktop's step; each paper compiles with its own copy of a TeX home
      warmed by three trusted documents (`TL26_HOME_TEMPLATE`, `dev/pdfcompare.py`); `collect`
      keeps only rows that name a paper of the sample, once each (`dev/arxiv_collect.py`).
    The audit's hardening items, done too: a widget's window loses WebRTC before its scripts run,
    and frames it adds are removed, with the page refusing data: and blob: frames (`frame-src
    'self'`), since Chromium ignores CSP's `webrtc` directive; IBM Plex, the interface font, is
    inlined from npm (`@fontsource`, OFL) instead of loaded from Google Fonts on every visit;
    the git test server answers only the test page's origin; binaryen is fetched by hash;
    `arxiv.yml` installs pip packages by hash, unpacks sources safely and compiles papers as an
    unprivileged user with no network, no sudo and the runner's processes hidden
    (`dev/sandbox.sh`, checked by `dev/sandbox_check.py` before any paper runs).
    Evidence: `npm test` (with `test/gitauth.test.mjs` 8/8, `test/engine.test.mjs` 5/5,
    `test/arxiv_unpack.py` 10/10, `test/arxiv_collect.py` 5/5); `test/browser.py` 92/92, git 44/44, widgets 60/60, share 46,
    files 30, features 36, history 39, paste 22, wordmath 83, mathfield 19, eqextras 18, frontier
    13; `test/engines.py` 23/23 and `test/pdf.py` 20/20 in CI's TeX job. Every check added for a
    finding fails on the build before its fix; the dot segment one sees the token reach the
    other host through a logging proxy. Still open: a widget can reach WebRTC through a srcdoc
    frame inside a shadow root the HTML parser makes (`<template shadowrootmode>`,
    `document.write`, `setHTMLUnsafe`), so the one click gate for widgets from someone else stays
    the control (docs/ARCHITECTURE.md, Live figures); a symlink made by LuaTeX's `lfs.link` during
    a compile is not checked by the path guard (not shown to be reachable); the mirror's pack
    hashes are 64 bits, which a second preimage needs about 2^64 / packs trials to beat, and the
    mirror's index comes from the page's own site; Latin Extended letters in the interface fall
    back to a system font (the inlined Plex is cut to Latin and Latin-1). In the arXiv workflow the
    papers of one shard run as the same user as the harness that compares them, so a paper could
    still alter its shard's comparison rows (they are checked for form, not truth); the workflow's
    changes have not run, since the workflow has not.

25. **CI rebuilds what was rebuilt only by hand.** Done. `.github/workflows/tex.yml` lays out the
    inputs from the pinned downloads, builds the tree and packs, diffs `dist/tex` against
    `dev/dist-manifest.txt`, then runs `test/engines.py` and `test/pdf.py`, whenever the TeX side
    or its tests change; `dist/` is kept a week as a workflow artifact. Its first run gave the
    manifest byte for byte, on a machine other than the one the tree was first built on.
    `.github/workflows/vendor.yml` rebuilds dvips, gnuplot, xindy and asy (with Mesa, GSL, FFTW,
    Eigen) from an empty `RIKUY_SRC` and compares every file of `tex/vendor/` by SHA-256. Its
    first run found two ways the build still depended on the machine (asy's configure called
    `kpsewhich`; xindy's embedded files went in in file system order) and `tex/build_tools.sh`
    fixes both; then all 532 files equal the committed ones (dvips 2, gnuplot 2, xindy 431, asy
    97). The asy job takes about 42 minutes. `test/wordmath.py` no longer waits with
    `wait_for_function`, which the host's policy failed one run in three.

## Open tasks

16. **The arXiv corpus** (task 3's finish line): compile rate and match rate on the 1,000
    papers, every failure classified as in task 2. Needs arxiv.org (see task 3). The owner runs
    it once the repository is public, where Actions minutes are free; `arxiv.yml` is ready
    (task 24 hardened it) but has never run.

## Rules

- No status commits ("Note ...", "Record ...") and no log in this file. One commit per
  finished task, its message saying what changed and the evidence (test counts, corpus count).
  If a task is blocked, say why under the task, once, and move on.
- Corpus results: one file, `dev/corpus-results.jsonl`, replaced by each full run; the
  comparison likewise in `dev/pdfcompare-results.jsonl`. `dev/corpus-docs.jsonl` lists the
  documents: the 716 of LaTeX-examples and three files that are not in it (`pandoc-reader.tex`,
  `sample2e.tex`, `small2e.tex`, from an early test), which a run reports as gone.
- Never put files into the tree by hand: kpathsea finds files through `ls-R`, which
  `build_tree.py tree` writes. Files reach the tree through a package in `CORE_SETS`,
  `DEB_SETS` or `FONT_PICKS`, or the `extra/` overlay, before `tree` runs.
- The maintainer's commits use the author email `pedro.fernandezrackebrandt@merton.ox.ac.uk`;
  contributors use their own.
- Compare against the real program, byte for byte, whenever one exists (xindy against CLISP's,
  PDFs against a desktop TeX Live). A plausible output is not the target.
- Patch original sources with small scripts that assert their anchor text exists, so a version
  bump fails loudly. Comments say why, in plain sentences.
- Run the corpus before publishing. Rikuy's hosted copy is a claude.ai artifact, published
  from a Claude session (`tex/publish_batches.py` plans the uploads within its 256 MB);
  anywhere else, serve `dist/`.
