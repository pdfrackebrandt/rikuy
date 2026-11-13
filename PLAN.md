# Rikuy: state and plan

Rewritten 2026-10-25 after round 2, which finished or measured every task of the round 1 plan.
Read the rules at the end before the first commit.

## Where it stands

| check | v19 (published 2026-10-12) | version 23 (published 2026-10-26) | version 25 (2026-10-28) | version 28 (2026-10-29) | version 29 (2026-11-09) | version 30 (2026-11-10) | version 31 (2026-11-10) | version 32 (2026-11-11, pull request 7) |
|---|---|---|---|---|---|---|---|---|
| corpus compiles (LaTeX-examples, 716 documents present) | 705 | 706 | 706 | as version 25 | as version 25 | as version 25 | as version 25 | as version 25 |
| corpus PDFs equal to a desktop TeX Live 2026's | 615 of 704 (87.4 %) | 700 of 705 (99.3 %) | 703 of 705 (99.7 %) | as version 25 | as version 25 | as version 25 | as version 25 | as version 25 |
| TeX passes over the whole corpus | not counted | 995 (1,471 without latexmk's first-run `.aux`) | 995 | as version 25 | as version 25 | as version 25 | as version 25 | as version 25 |
| `test/engines.py` | 22/22 | 22/22 (its PSTricks check now asks for drawn lines) | 22/22 | 23/23 (a check that pygmentize loads no code a document wrote) | 23/23, now run by CI on a tree built there (`tex.yml`) | 23/23 in CI's TeX job | 23/23 in CI's TeX job | 40/40 (seventeen new: scripts other than Latin) |
| `tex/native/xindy/test.cjs` (against CLISP's xindy) | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | 11/11 | as version 30 | as version 30 |
| TeX Live's 220 Asymptote examples as a desktop's asy draws them | not measured | against a native asy 3.09: 216 (196 equal PDFs, 12 equal failures, 7 random by design, 1 equal alone); 4 open | against the desktop's asy 3.11: 218 (201 equal PDFs, the 3D ones rendered as bitmaps; 10 equal failures; 7 random by design); 2 open: 1 numerical, `slope` out of memory | as version 25 | as version 25 | as version 25 | as version 25 | as version 25 |
| edits on the typeset page landing exactly, undone byte for byte (`test/editor_corpus.py`) | not measured | 780 of 780, in the 222 documents with text, a formula, a cell or a footnote; 211 of 211 edited projects compile | as version 23 (page unchanged) | 781 of 792 land, 11 open as source by design, all 792 undone byte for byte, on the complete corpus; 211 of 211 edited projects compile | as version 28 (model and parser unchanged) | as version 28 (model and parser unchanged) | not run again (the model draws colours and lists in cells now; the 716 document model run passes) | not run again (`test/scripts.py` 133 checks direction and editing in Arabic and Chinese) |
| artifact size (limit 256 MB) | 250.0 MB | 249.7 MB | 252.3 MB | 253.1 MB (with the 0.8 MB license bundle) | 253.6 MB (pdf.js shipped, IBM Plex inlined) | about 253.8 MB (version 29 and 154 kB: the page and `engine.js`) | about 253.8 MB (version 30 and 21 kB of page) | not published; about 253.9 MB when it is (the index and four packs change, 0.1 MB; the 77.6 MB of packs for other scripts stay out) |

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

Version 30 (2026-11-10) is the first with two builds (pull request 2). The hosted one, for
Cloudflare Pages, is an installable app that works offline, opens `.tex`, `.bib`, `.zip` and
`.docx` files and reads and writes Word files (tasks 26 and 27); it is built and tested in CI
and not yet deployed: that waits for the maintainer's Cloudflare account. The claude.ai copy has
no room for pandoc and no service worker, so there it changes the page and `engine.js` only
(a compile that could not load a pack says which folders, in place of half a PDF); its TeX tree
is version 29's but for `engine.js`, and the TeX rows are CI's TeX job on the pull request
(`test/engines.py` 23/23, `test/pdf.py` 20/20, `test/offline.py` 34/34 with a compile offline).

Version 31 (2026-11-10) is the public launch: the hosted build runs at
<https://rikuy-3dl.pages.dev/> (deployed from main by `deploy.yml`), with task 28's fixes for a
newcomer's first minutes and for Word files. The claude.ai copy changes its page only, and now
names the hosted copy as the place for Word. Checked by hand on the hosted site in Chrome: the
update notice brings the new version in, a new document takes typing at once and compiles (1
page, 0.6 s), the sample compiles (3 pages), Make available offline finishes, Help opens with
the plain sentence.

Version 32 (2026-11-11) adds the ribbon, the files for search engines and agents and the new
icon (tasks 29 and 30, deployed), and Chinese, Japanese, Korean, Arabic, Hebrew, nine scripts of India, Thai and Sinhala (tasks 31
to 33): 36 packs of fonts and packages that only the hosted build carries, right to left
documents on the page, a one click set up, and Word files in these scripts. `dist/tex` is
327.1 MB, 250.9 MB of it in the artifact.

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

26. **An installed app that works offline, hosted on Cloudflare Pages.** Done in the code
    (pull request 2); not deployed yet: the owner has no Cloudflare account, and the site stays
    behind a sign-in until the repository is public (docs/HOSTING.md). The build without
    `RIKUY_SHARE` makes `dist/index.html` installable: a service worker (`src/sw.js`) keeps the
    page and every script, one version at a time, checked by hash; "Update ready" in the status
    bar; "Make available offline" keeps the engine, the 75 packs a typical pdfLaTeX paper reads
    (50 MB), whatever else the open document reads (it is compiled once) and Word; a document
    that needs more while offline is told which folders. TeX packs live once, in the worker's IndexedDB, and the service worker
    answers TeX's synchronous reads from there. The installed app opens `.tex`, `.bib`, Overleaf
    `.zip` and `.docx` from the file manager (Chromium on the desktop) and takes shared files.
    `deploy.yml` uploads what `tex.yml` built, with a pinned wrangler, after
    `dev/pages_check.py` (20,000 files, 25 MiB each, 100 header rules); `_headers` carries the
    page's policy without outside sources. IBM Plex's Latin Extended cut is in. The claude.ai copy
    is unchanged in kind: no service worker, no manifest. Evidence: `test/offline.py` 31/31 (33/33 in CI's TeX job, with the compile offline),
    `test/launch.py` 18/18, `test/deploy_check.py` 21/21, browser 93, CI green on the pull request;
    the offline compile runs in CI's TeX job. An independent review found, and this fixes: files
    shared into the user's own project left it unrestricted (a posted `article.cls` would have
    run with full shell escape: the project is now marked as someone else's); a file opened over
    one of the same name left no way back (a version is kept first); the first visit announced
    an update; a run by hand of Deploy took any passing TeX run, a pull request's included; an
    older TeX run could finish last and be deployed (one run per branch now). The first compile
    offline in CI then failed with half a PDF: the sample read packs the list did not name
    (hyperref's own packages, cm-super for the mark of `\thanks`); the list has them, the open
    document is compiled once, and a second review's findings are fixed with tests (a pack that
    loaded on a later pass no longer withholds the PDF, bytes that do not unpack are not kept,
    the button says when the open document did not compile through, and a mirror serving other
    bytes falls back to Ubuntu's archive). Open: Chromium can
    leave a new version waiting for minutes when "Update ready" is clicked within a second of
    opening a second tab (17 of 60 clicks in a loop; 0 of 18 otherwise): the button says what it
    waits for. Offline in Safari and Firefox is untested. Old packs in IndexedDB are never pruned.
    Git push and pull reach only Rikuy's own site under the hosted policy (`connect-src 'self'`).

27. **Word, both ways.** Done in the code (pull request 2), on the hosted build only: pandoc 3.10
    as WebAssembly (GPL-2.0-or-later, npm's `pandoc-wasm` 1.1.0) runs in a worker of its own,
    fetched on first use as two hashed parts (16.3 MB gzipped), kept once in IndexedDB. The
    claude.ai copy has no room and says where Word is. Open a `.docx`: a LaTeX project with its
    equations (OMML to TeX), headings, lists, tables, footnotes, links, pictures and Zotero
    citations, marked as someone else's. Save as `.docx`: native Word equations with the project's
    macros expanded, citations by citeproc, PDF figures as pictures; TikZ, asy and unknown
    environments become a line naming them, EPS its name. A coauthor's edits come back: the file
    carries a bookmark per block and the source of what it shows; edits in text, cells, captions,
    footnotes, the title block and inside equations, tracked or not, and Word comments, become
    minimal patches under Review; what cannot be placed (text the owner changed since, generated
    numbers, new table rows, pictures, moved paragraphs) becomes a comment where it happened;
    formatting changes are dropped. Evidence: `test/word.test.mjs` 16 groups against the real
    pandoc; `test/word.py` 61/61 including a LibreOffice 24.2 save and hostile files (zip bomb,
    DTD, script links). The review found the data a returning file carries could be forged to
    patch the preamble, another file or a command name, and that a file from another project of
    the same name was merged: edits are now merged only from a file whose data hashes to an
    export this browser made (`wordRemember`); any other opens as a document of its own. The file
    no longer carries project files its text does not come from. Open: an export made on one
    computer cannot be merged on another (it opens as a new document); Microsoft Word itself was
    not available to test (LibreOffice keeps the bookmarks and the data through a save);
    equation numbers are text after the formula, not Word's numbering.

28. **Before the public launch: a newcomer's first minutes, and Word files that open right.** Done
    (pull request 3). Two passes on the hosted build as a first time user would meet it, at desktop
    and phone sizes, each fixing what it found, then an independent review of the lot. The editor:
    New document, an emptied page and a title only document take typing; a first visit shows the
    page alone at a size a phone can read, and Help says what Rikuy is; on a phone every action is
    named in the menu; Select all then Delete leaves a blank body; a pasted or dropped picture is
    placed in the text; formula mistakes are said in plain words and never lose what was typed;
    files that cannot be opened are refused in plain words. Word: 33 realistic `.docx` files
    through the real import now give LaTeX that compiles (highlight, merged cells, nested tables,
    symbols typed as text, comments, captions and references, the table of contents, numbered
    and multi line equations) and list for the user what could not be kept; Save as Word keeps
    colour, shading, alignment and list labels; the page draws colours given by number or defined
    in the preamble (validated, set through the style API), also in formulas, and a list or table
    inside a table cell. The review reproduced eight problems, all fixed with tests: Select all
    took any first to last selection for the whole document and could delete pictures, equations
    or the preamble; a second pasted picture could overwrite the first; a formula with an open
    brace lost its text on closing; a `.zip` with no document joined the user's own project
    unmarked (on main before this task); colour marks landed inside code from pandoc made files;
    a colour called `constructor` crashed Save as Word; and three smaller ones. A second agent then
    checked the fixes against the first build side by side: seven held, the formula box did not
    for text ending in a backslash, and the fixes had four side effects (any `.zip`, even one of
    pictures only, marked the project as a stranger's; a picture could no longer be updated by
    dropping it again; an abandoned empty equation left an undo step; one test tested nothing),
    all fixed with tests. Evidence on the merged branch: `npm test` (`word.test.mjs` 27 groups),
    `test/browser.py` 182, `offline.py` 31/31, `launch.py` 18/18, `files.py` 68, `paste.py` 25,
    `share.py` 46, `word.py` 79 with LibreOffice; CI's
    TeX job for the compiles. Open: Microsoft Word itself, real phones and iOS Safari are
    untested; CJK and Arabic text has no font in the tree (the user is told); Word renumbering
    its own references on export (REF and SEQ fields) is not built; editing inside a list or
    table in a table cell is by its source.

29. **A ribbon, as in Word.** Done (pull request 5), after the owner looked at the live page: a
    second row under the bar in both builds (`src/ribbon.js`). Style (Normal text, Heading 1 to
    3, both ways), bold, italic and underline, bulleted and numbered lists on and off, Insert
    (Formula, Equation, Table, Picture, Footnote, Citation, Link) and Download: PDF (compiles if
    needed, then saves), Word, LaTeX (`.tex`, or `.zip` when the project has more files). A
    document with live graphs marks LaTeX as the download that keeps them live and says once
    that a PDF or Word file holds pictures. The downloads stay in sight at the row's right end;
    a phone has one Download button for the three. Save and Copy source left the top bar. Every
    action is one undo step back to the same bytes. An independent agent then drove it on the
    hosted page: Download LaTeX saved twice (the old listener was still attached), the Style
    list kept the focus and swallowed typing, Equation wrote into table cells, a list item made
    a paragraph again merged into its neighbour, a comment after `\\` swallowed a heading's
    brace, and smaller ones; all fixed with checks. Evidence: `test/ribbon.py` 146 (145 on the
    claude.ai build), in CI's editor job and in the TeX job, where Download PDF compiles and
    saves; `test/browser.py` 182, `offline.py` 32/32, `files.py` 68, `word.py` 79. Open: a
    labelled item (`\item[b)]`) cannot be made a paragraph from the ribbon; Style does not act
    on several paragraphs at once; the pinned Download group is untested in Safari and Firefox.

30. **Readable by search engines and AI agents.** Done (pull request 6). The hosted page is an
    app, so its HTML told a machine little. The build now writes `robots.txt`, `sitemap.xml` and
    `llms.txt` (what Rikuy is, what a person can do with it, when to suggest it, and how an agent
    hands a person a document: a file to drop, or a `#share=` link built by a recipe given
    there), and the page's head carries a canonical address and a pasted link's preview (title,
    description, `og.png`). Evidence: `test/share.test.mjs` builds a link by `llms.txt`'s recipe
    and opens it (11/11; the Python lines there checked by hand against `unpackShare`);
    `test/offline.py` 33/33 fetches the four files from the page, finds the head's tags and
    finds none of the files in the service worker's caches. The claude.ai copy is unchanged.

31. **Chinese and Arabic.** Done in the code (pull request 7), asked for by the owner.
    *TeX.* The tree had no font for either script. It now carries the Fandol fonts with ctex's
    and xeCJK's helpers (XeLaTeX), Amiri (LuaLaTeX with babel's `bidi=basic`, the one route on
    which TeX orders mixed text by itself; polyglossia with XeLaTeX too) and the CJK package with
    four Arphic fonts (pdfLaTeX): seven more pinned Ubuntu packages, 6,549 files, 46.7 MB in 24
    packs of their own, marked `x` in the index and written after all others. Against main six
    files of `dist/tex` change (`engine.js`, the index, two core packs, fontconfig's caches,
    luaotfload's names); the caches were made again and every older block came out the same.
    The artifact has no room for these packs: `publish_batches.py` leaves them out and a
    compile that misses only them names the hosted Rikuy. Auto picks LuaLaTeX for `bidi=basic`.
    *Page.* `src/scripts.js` tells which script a document's text is in and whether its preamble
    sets it up; when it does not, a notice offers the lines at one click, as one undo step
    (ctex for Chinese alone; babel with Amiri when there is Arabic, as the main language when
    most letters are Arabic). A document whose main language runs right to left shows so on the
    page: paragraphs, headings, list markers, footnotes, and table columns from the right as
    babel sets them; `otherlanguage`, `\foreignlanguage`, polyglossia's and bidi's commands
    turn their text and are text, not code; CJK wrappers are text. The page's font lists name
    a Song, Kai, Hei, Fang Song and a Naskh after the existing families. A review of the diff
    found the set up patterns quadratic on a crafted preamble (9 s a call); bounded, with a test.
    An independent reviewer then went through the merged branch and found nine things, all fixed
    with tests: the Arabic lines broke documents held to XeLaTeX (ctex, xeCJK, polyglossia: now
    Rikuy's own ctex line makes way for babel's Chinese, and beside another engine's packages
    nothing is offered); in a copy without the packs an English document with an unknown font
    name was told it needed Chinese fonts (XeTeX goes through every font: such a pack is now
    simply absent for a document with no such text); babel loaded over several lines or in a
    shared list; a commented `\begin{document}`; 550 `\selectlanguage` in one paragraph
    overflowed the stack and a crafted 203 kB file cost 1.2 s a rebuild; CRLF files; a stale
    contents direction; an unbounded pattern in `pickEngine`; text only in `\title`. Its other
    checks found nothing: injection, 1,200 random edits in turned text, the 716 corpus models
    against main, the order of Word's XML elements, no script file outside an `x` pack.
    *Word.* Both ways: `w:bidi`, `w:rtl`, `w:bidiVisual`, East Asian and complex script fonts
    and languages on export; right to left paragraphs, `w:dir`/`w:bdo` runs (pandoc dropped
    their text), joiners and Arabic digits on import, with the set up lines in the preamble;
    a coauthor's edits to Chinese come back a character at a time.
    Evidence: CI's TeX job built the tree from the pinned inputs and found `dist/tex` equal to
    the manifest made here, then `test/engines.py` (35/35 here after the review's fixes: ctex on
    XeLaTeX in Fandol Song, bold and Kai; Arabic on LuaLaTeX in Amiri as a phrase and as the
    main language; CJKutf8 on pdfLaTeX; a plain document with Chinese, the notice's click and
    a PDF in Fandol, then Arabic joining it; a copy without the 24 packs gets no PDF for a
    Chinese document and says why, and fontspec's own error for an unknown font), `pdf.py`
    20/20, `offline.py` 36/36 and `ribbon.py` 146 there; the three Word
    fixtures open and compile with no error (XeLaTeX, LuaLaTeX, LuaLaTeX); `test/scripts.py`
    133, `scripts.test.mjs` 34, `scriptplan.test.mjs` 8, `word.test.mjs` 38 groups, `word.py` 90, `browser.py` 182,
    `ribbon.py` 146; LibreOffice 24.2 opens the Arabic and Chinese exports. The manifest is
    that build's (stock zlib 1.3, as CI's Python); its other 263 lines equal main's. Open:
    Japanese and Korean have no fonts; Greek and Cyrillic in a document whose main font is
    Amiri are not drawn; a viewer without Adobe's CMap data shows Fandol text but cannot copy
    it (as with a desktop TeX Live); the page names system fonts and ships none for these
    scripts; babel loaded through `\input` is not seen by the page; generated words (Figure,
    Abstract) stay English on the page; not seen in Microsoft Word, Safari or on a phone.

32. **India's scripts.** Done in the code (pull request 7), asked for by the owner after task 31.
    Devanagari (Hindi, Marathi, Nepali, Sanskrit), Bengali, Gurmukhi, Gujarati, Odia, Tamil,
    Telugu, Kannada and Malayalam. *TeX.* Twenty Noto fonts from Ubuntu's `fonts-noto-core`
    (Serif, regular and bold; Sans for Odia, which has no Serif; Noto Nastaliq Urdu by name) in
    two more `x` packs, 4 MB: 26 such packs and 48.5 MB now, `dist/tex` 299.4 MB. The set up
    is babel's `onchar` with HarfBuzz on LuaLaTeX, a language and font per script, English
    staying the main language; Chinese or Arabic in the same document go the same way. babel
    has no character range for Gurmukhi and Gujarati (their text fell to Latin Modern and was
    gone from the PDF): the set up tells it in a `\directlua` line. *Page.* The notice names
    any mix of scripts; font lists for the nine after the existing families; Backspace takes
    one code point (a vowel sign, a virama) as Indian editors do, Delete and bold a whole
    character, and no page cut or Latin hyphen falls inside one. *Word.* Import keeps
    conjuncts, nukta, joiners, dandas and each script's digits and writes the set up lines;
    export gives each run a complex script font (Nirmala UI) and its language (`hi-IN` and the
    like); a coauthor's edit to one word is one patch.
    A second independent review found seven things, fixed with tests: dandas (they stand in
    Devanagari's block alone) and the joiners fell back to the Latin font, so Bengali's sentence
    ends were missing and conjuncts around a joiner broken (babel's own "as the character
    before" mark now holds for the four); only the roman family had a font, so beamer slides
    and `\texttt` had no Hindi (each script, Arabic and babel's Chinese too, now gets `rm`,
    `sf` and `tt`); a file that names its engine in a `% !TeX program` line keeps it and is
    offered nothing of another engine; Bold moved a selection's edge over a brace; Sanskrit in
    a named script; vowel signs count with the letters; a code span with two scripts came back
    from Word as two. It found nothing in 1,200 random edits beside the earlier build,
    pagination, the order of Word's run properties or 144 hostile strings.
    Evidence: a document with all nine scripts compiles with no missing character, conjuncts
    shaped (seen as a picture); the Hindi and the eight script Word fixtures open and compile
    with no error; a beamer slide in three scripts with dandas, joiners and typewriter text has
    no missing character (seen as a picture); `test/engines.py` 38/38 (Hindi, Gujarati and
    Tamil typed into a plain document, the click, a PDF in the Noto fonts, its dandas and
    `\texttt` there; 37/37 in CI's TeX job before the review, which again found `dist/tex`
    equal to the manifest); `scripts.py` 196, `scripts.test.mjs` 45,
    `word.test.mjs` 45 groups, `word.py` 97, `browser.py` 182, `ribbon.py` 146, `offline.py`
    36/36. Open: Devanagari always gets Hindi's hyphenation and `hi-IN`, for Marathi and Nepali
    too; no font for Sinhala, Thai, Hebrew, Japanese or Korean; Urdu is set in Amiri unless the
    author names Noto Nastaliq Urdu; the page was drawn here with FreeSans (no Noto on this
    machine), so its Indian text was not judged by eye; not seen in Microsoft Word.

33. **Japanese, Korean, Hebrew, Thai and Sinhala.** Done in the code (pull request 7), asked for
    by the owner after task 32. *TeX.* Harano Aji Mincho and Gothic (from
    `texlive-lang-japanese`), NanumMyeongjo and NanumGothic (`fonts-nanum`), Culmus's Hadasim
    for Hebrew (`fonts-culmus`; it has the Latin letters and digits Noto Serif Hebrew lacks,
    and its license lets a document embed it), Noto Serif Thai and Sinhala: 54 pinned packages,
    36 `x` packs, 77.6 MB; `dist/tex` is 327.1 MB. The set up is babel's on LuaLaTeX as for
    India's scripts, Hebrew with `bidi=basic` and as the main language when most letters are
    Hebrew. Three things had to be told to babel, each found by compiling: Chinese characters
    are not Korean's (in a document with Japanese they came out in the Korean font as empty
    boxes; beside hangul they are now a need of their own, set by the Chinese lines); two of
    Chinese, Japanese and Korean in one document keep to one font each (a Mincho, a Gothic, a
    Myeongjo and a Gothic at once ran LuaTeX out of memory in the browser, with no message);
    a Hebrew document's bullet comes from the math font. Japanese is told by its kana and
    Korean by its hangul. *Page.* Font lists for the five, Japanese or Korean families first
    when the document is theirs; the notice for any mix. *Word.* Both ways, with East Asian
    and complex script fonts and languages, ruby keeping its base word, Thai edits by the word.
    Evidence: a document with all five compiles with 0 missing characters, Thai lines broken
    at words, and a Hebrew document with a list, points, digits and English (both seen as
    pictures); `test/engines.py` 40/40 (the five typed into a plain document, one click, a font
    for each in the PDF and the kanji there as text); the Japanese, Korean, Hebrew and five
    script Word fixtures open and compile with no error; `npm test` green (`scripts.test.mjs`
    52, `word.test.mjs` 53 groups); `scripts.py` 302, `browser.py` 182, `word.py` 110,
    `ribbon.py` 146, `share.py` 46, `features.py` 36, `files.py` 68, `offline.py` 36/36. Not
    reviewed by a second agent as tasks 31 and 32 were; not seen in Microsoft Word or on the
    page with real fonts for these scripts (the build machine has none). Open: Khmer, Lao,
    Tibetan, Georgian, Armenian, Ethiopic and others have no fonts; a Japanese document set up
    with luatexja shows kanji in Chinese fonts on the page.

34. **Rikuy as an AI agent meets it.** Done in the code (pull request 8), asked for by the
    owner. An audit by a fresh agent, playing an agent that fetches, one that clicks and one
    that scripts, found: buttons whose names changed with the window's width or were missing,
    dialogs and menus without names, no way to hand over a document without writing DEFLATE,
    no way to read the source or the result of a compile, a first page of markup with no words
    for a fetcher, and guides that said less than the page can do. *What changed.* Every
    control has one name at every width, dialogs and menus are named, TeX's state is a status
    region, the page is a textbox "Document" with headings and paragraphs. `window.rikuy.api`
    (frozen: `version`, `whenReady`, `getSource`, `getFiles`, `setSource`, `compile`, `needs`,
    `setUpScripts`) is the scripting surface that stays the same. `#tex=<base64url>` opens
    plain LaTeX as one's own document, and a `#share=` link that names no sender does too;
    both stay marked as from a link, so shell escape is restricted and the open document is
    kept as a version. The page's first lines say what Rikuy is, with JSON-LD; `llms.txt` and
    `llms-full.txt` (plain text, readable from any origin) say how to hand over a document, how
    to script and click it, where documents live and what it cannot do; `robots.txt` names the
    AI crawlers as welcome. *Review.* A second fresh agent attacked the new ways in and found
    no hole (the Content Security Policy is unchanged, markup in a link stays text, a widget's
    frame cannot reach the api, writers reject in a guest's view) and five faults, fixed here
    with tests: a document from a link without a sender became a guest's after a new start when
    an earlier sender's link had the same name; a guest's second link of the same name was
    dropped as already open; a `#tex=` link cut where its base64 still decodes opened the first
    part of the document (it must now reach `\end{document}`); popovers called themselves
    modal; the menus had no arrow keys. The security audit skill's own workflow was not run
    beside that review. Evidence: `test/agent.py` 116 checks (115 without a TeX tree), run by
    CI in both jobs; `npm test` green (`share.test.mjs` 17); `browser.py` 182, `ribbon.py` 146,
    `scripts.py` 302, `share.py` 46, `features.py` 36, `files.py` 68, `paste.py` 25,
    `history.py` 39, `word.py` 110, `launch.py` 18, `frontier.py` 13, `offline.py` 41/41, `deploy_check.py` 42,
    `engines.py` 40/40. Open: the repository is private, so the source and issues links in
    `llms.txt` and Help are 404 to anyone else until the owner makes it
    public; a dialog opened from the narrow window's menu leaves the focus on the page's start;
    without IndexedDB (some private windows) the document a link replaced is not kept; the
    source pane's text is not reachable by its role (use `getSource()`); Equation pressed with
    the caret inside a macro's argument inserts there; not tried with a real screen reader, nor
    in Safari or Firefox; the link sizes browsers take are from their documentation.

35. **Faster, measured.** Done in the code (pull request 9), asked for by the owner ("make
    everything more efficient", Rust or C where it pays). *What was measured first.* A
    keystroke on a 21 page document takes 20 ms in the page's JavaScript; a PDF takes 1.2 s
    (the sample), 1.7 s (a TikZ, pgfplots and hyperref preamble) and 4.6 s (LuaLaTeX, five
    scripts), in TeX's own C as WebAssembly; a first PDF on a first visit takes 17 s at
    20 Mbit/s, the time of 28 MB. So nothing was rewritten in another language: the time is in
    code that already is C, and in bytes. Two benchmarks now say what a person waits for:
    `dev/bench_compile.py` (from an edit to the drawn page) and `dev/bench_load.py` (a first
    and a later visit over a shaped line). *Compiling.* A preamble's format (`PRE` in
    `tex/engine.js`): after two compiles the worker dumps TeX's state at `\begin{document}`,
    checks one pass from it against the ordinary pass byte for byte, and later pdfLaTeX passes
    read only the body: the heavy preamble 1758 ms, then 493 to 626 ms, in the page; of 63
    documents (`dev/bench/` and 59 of the corpus) 30 get one and compile 2.1 times faster from
    their third compile on, and all 63 give the PDF, pages, text and problems of main's worker
    at every step (`dev/bench_same.py`). The worker starts 0.9 s sooner (the tree's 44,000
    nodes made directly: 2532 to 1629 ms). The PDF shows 0.3 s sooner once TeX is done (one
    PDF.js worker kept, SyncTeX read after the pages in view, pages drawn one at a time).
    *Loading.* The hosted page's fonts are files beside it: `index.html` 1.93 MB to 0.63 MB,
    first paint 500 to 148 ms on the cable line and 2196 to 276 ms on the phone line, the editor
    usable 989 to 721 ms (cable, runs taken in turn). On a first visit to a desktop on an
    unmetered line the page fetches and starts TeX while the visitor reads (`warmTeX`): Preview
    pressed 15 s in shows the PDF after 3.6 s, was 15.4 s. The price is 28 MB instead of 3.5 MB
    for a visit that never asks for a PDF, and about 330 MB of memory for up to three minutes;
    it does not happen with Save-Data, on a cellular or slow line, on a touch device that says
    nothing about its line, or under 4 GB. A project's next first compile gets its packs
    together. A hang is gone: TeX's synchronous read of a pack waited for ever behind the
    worker's own write to the pack store (the heavy document, 4 of 4 runs on an unshaped line).
    `build/app.mjs` writes `data-tree` again, so "Available offline" stays across visits.
    *Review.* A fresh agent attacked the result and found that a format could be wrong or
    stuck in cases one pass's check does not see; fixed with tests: a stranger's document is
    never dumped (its preamble could loop in the dump run alone, and nothing stopped the
    worker), the page lets a worker go that does not come back from a step within 30 s and
    sends the waiting compile to a new one, and a preamble is refused that sets `\everyjob`,
    keeps a file's date or size or an l3fp random number, or looks for its own PDF. A format
    dumped but not yet checked survives a compile that comes in between (before, someone typing
    paid for the dump after every compile and never got a format). Evidence: `npm test` green;
    `test/preamble.py` 31 (new, in the TeX workflow), `pdf.py` 23/23, `engines.py` 40/40,
    `agent.py` 116, `offline.py` 54/54, `browser.py` 182, `ribbon.py` 146, `scripts.py` 302,
    `word.py` 110, `share.py` 46, `files.py` 68, `features.py` 36, `launch.py` 18,
    `deploy_check.py` 43/43; `dist/tex` as the manifest lists it (one line moved: `engine.js`).
    Open: a first PDF asked for at once is as slow as before (the engine is 12.3 MB and a plain
    article reads 16 MB of packs: a smaller start needs a change to the tree); LuaLaTeX and
    XeLaTeX passes are untouched (fonts loaded in a preamble do not survive a dump); common
    preambles get no format (`\makeindex`, beamer, minted, `\hypersetup{pdftitle=}`); a tree
    package that keeps a file's date at load time would not be seen; 2.7 MB of ICU data and
    font caches are read at every start, also for pdfLaTeX; typing on documents of a hundred
    pages and Word export were not profiled; the warm up's conditions were read for Safari and
    Firefox, not run; Cloudflare's own compression and HTTP/2 ordering were not measured (the
    benchmark's server speaks HTTP/1.1 with Brotli); the security audit skill's own workflow
    was not run beside the review.

36. **Its own address: rikuy.rackebrandt.pe.** Done (pull request 10), asked for by the owner. A
    CNAME at Punto.pe (`rikuy` to `rikuy-3dl.pages.dev`) and the Pages project's custom domain;
    `build/app.mjs`'s `SITE` (the canonical address, the preview tags, `robots.txt`,
    `sitemap.xml`, `llms.txt`) and the README, `SECURITY.md` and `docs/HOSTING.md` name it. The
    old address keeps serving the same deployment and is not redirected, because browsers keep
    documents by address: what anyone kept at `rikuy-3dl.pages.dev` stays reachable there.
    Evidence: `deploy_check.py` 43/43, `agent.py` as before; the live check is in the pull request.

37. **Styles as in Word, with LaTeX among them.** Done in the code (pull request 13), asked for by
    the owner ("Word + PDF + LaTeX in one, so one of the styles that appear right off should be
    LaTeX"). A Styles gallery in the ribbon after Word's and WordCraft's (design only, no code
    taken): Normal, Title in the title, Heading 1 to 3, LaTeX and Quote, each name drawn in its
    own look, paging arrows and a More menu, the select below 1024 px. LaTeX marks a paragraph
    with the comment line `% rikuy: latex` (`src/styles.js`): the page shows that paragraph as
    its source and takes typing as LaTeX, TeX ignores the line, so the PDF is unchanged. Quote
    wraps the paragraph in a `quote` environment and takes it off byte for byte. Two fresh
    hostile reviewers (Claude agents, not the free models `docs/REVIEW_PROCESS.md` names): one on
    use, access and agents (13 findings, the worst the toolbar moving under the pointer while
    paging), one on the source (12 findings, two high: the caret after a line to come, and words
    a coauthor added in Word inside a LaTeX paragraph landing in the one before); every finding
    fixed with a regression test but one, decided and written down: the mark counts only at a
    paragraph's start. Evidence: `ribbon.py` 265 (146 before), `agent.py` 118, `browser.py` 189,
    `word.py` 110 with LibreOffice, the corpus's 716 models unchanged. Not done: the right click
    menu on tiles; typing in a box through an input method; Safari and Firefox.

38. **B0, the frame for every Word feature Rikuy lacks.** Done in the code (branch
    `ribbon-tabs`), asked for by the owner ("the whole options that Word or WordCraft has but we
    don't, strictly better"); the plan is the gap list agreed with the owner (`GAP.md`, kept
    outside this repository: 229 features to build in 13 batches, tasks 39 to 51), and this is
    its first step, the frame the batches build on in parallel.
    *The registry.* Every action of the interface is one command (`src/commands.js`: id, name,
    tab, group, keys, when, on, run, menu contexts, synonyms, its insert list item); each batch
    registers its own in `src/cmd/<area>.js` (stubs for B1 to B13, the existing commands already
    moved into the batch that owns them) and calls another's by id. *The ribbon, as Word's.*
    `src/ribbon/tabs.js` draws from the registry and `src/ribbon/order.js` (every tab and group
    of GAP section 2 declared, shown once a command is in it) the tablist "Ribbon": Home, Insert,
    References, Review, View, Help today, Table Layout while the caret is in a table, Picture
    Format, Equation and Header & Footer with their objects; one tab panel and one toolbar named
    after its tab in the accessibility tree at a time; Download at the end of every tab; the
    width rules of Home kept, then groups folding into a button named after the group whose
    menu has the same commands; the tabs as the combobox "Ribbon tab" below 861 px; Ctrl+F1 and
    a button fold it to its tabs. Home's groups are in Word's order now (Font, Paragraph,
    Styles, Insert); every control kept its id and name. *Around it.* The search box "Search"
    (Alt+Q, Word's names and others: "Bullets" finds Bulleted list); the right click menu on the
    page by context (Shift+F10, the menu key; a second right click is the browser's, for its
    spelling); the chord table (`src/keys.js`: Ctrl+Alt+1 to 3 and 0 for the headings and
    Normal, Ctrl+Shift+L, Ctrl+Alt+F, Alt+Q, Ctrl+F1, Shift+F10; AltGr and input methods never
    taken); the kit every batch builds with (`src/ui/kit.js`: split button, menu, gallery, colour
    picker with the document's colours and xcolor's names, number field with units, dialog
    shell). *Edits as pure functions,* each tested on strings: `src/preamble.js` (a package once,
    options merged, class options, key=value lists, a definition once; now behind
    `ensurePackages` and the picture's `graphicx`), `src/wrap.js` (inline wrappers with their
    arguments, hand written forms as one, split, cleared; now behind Bold, Italic and Underline,
    which so recognise and take off `{\bfseries ...}` and `{\bf ...}` too, drawn by the page
    without a range of their own) and `src/blockenv.js` (paragraphs in an environment and out,
    byte for byte; Quote's edits). Typed text passes through `insertTextHooks` (AutoCorrect's
    place). *Moved, unchanged:* the side panel's outline and problems (`src/nav.js`), versions
    and changes (`src/review.js`), the lists (`src/cmd/lists.js`), the gallery
    (`src/ui/gallery.js`), the insert list's items (into the registry). *For agents:*
    `dist/controls.json` and llms.txt's list of tabs are written from the registry;
    `rikuy.api` gains `commands()` and `run(id)` (0.26.0; additions only). The side panel's tab
    "Review" and the ribbon's tab "Review" share a name, so llms.txt and `test/agent.py` find the
    panel's within its tablist "Panel". *Keys that changed:* Ctrl+B, I, U, M, K and Shift+E are
    the commands' keys now and do nothing where their button is off (Ctrl+Shift+E in a cell);
    Ctrl+Shift+B, I, U and M still act as they did (`keysQuiet`: bound, said nowhere), not
    Ctrl+Shift+K, which small capitals take in B1. Ctrl+K,
    Ctrl+Shift+E, Ctrl+Enter and Ctrl+P are as before: their batches move them. *Security:* the
    audit skill's quick profile on the new modules (one agent; notes kept outside the repository)
    found two ways a stranger's document could stall the reader's tab, both fixed with a test:
    `defines()` backtracked cubically on a `\newcommand` followed by spaces (8000 spaces, 76 s;
    now a scan, 90 000 spaces in 18 ms), and the look for a wrapper around the caret ran 0.3 s
    on 4000 unclosed `{\bf` groups and Clear All 4.4 s on a thousand wrappers (now 3 ms and
    57 ms). Evidence: `npm test` green with six new unit files (`preamble` 13 groups, `wrap` 15,
    `blockenv` 9, `keys` 11, `commands` 10, `kit` 3), `tabs.py` 84 (new: tabs by mouse and
    keys, contextual tabs come and go, folding at 1400, 1024, 860 and 390 px, every command by
    role and name, no name twice in the accessibility tree with any tab open, keys, search, the
    menu, the kit, and `roundtrip()` of `test/browser.py`, GAP section 0's rule as one call, on
    Bold, Italic, Underline with their hand written forms, Heading 1 and Numbered list),
    `agent.py` 132 (118 before), `ribbon.py` 265, `browser.py` 189, `scripts.py` 302,
    `word.py` 110, `offline.py` 54/54, `launch.py` 18/18, `files.py` 68, `wordmath.py` 83,
    `widgets.py` 60, `share.py` 46, `git.py` 44/44, `history.py` 39/39, `features.py` 36,
    `paste.py` 25, `mathfield.py` 19, `eqextras.py` 18/18, `frontier.py` 13, `stress.py` 9,
    `deploy_check.py` 43/43, `pages_check.py` fits, actionlint clean; the model and parser are
    untouched. Not done: no command of its own yet on File, Design and Layout, which stay hidden
    until B12, B4 and B6 fill them; Safari and Firefox, by hand.
    *The review.* A hostile reader of 59b0131 found four ways it corrupted a source and more;
    all fixed in the commit after it, each with the reader's own case as a test. Bold, Italic
    and Typewriter taken off a hand written group dropped its braces wherever it stood
    (`\noindent{\bf Proof.}` became `\noindentProof.`, `\textcolor{red}{\bf x}` lost its
    argument's braces, `{\bf\large Title}` let the size leak): a group now loses its braces only
    where it stands free (`standsFree`), and words that would run into a command get a space or
    `{}` (`\noindent\textbf{Proof.}` off is `\noindent Proof.`); braces in comments no longer
    count; a class's or a package's options are rewritten in one edit (all removed left
    `\documentclass[{article}`) and read with their comments as comments; a new `\usepackage`
    line stays out of `\if…\fi` and braces; a package loaded in a file the preamble reads gets
    `\PassOptionsToPackage` (`App.packageEdits` for the batches); the scans of a stranger's
    preamble and of the groups around the caret are bounded by work, not only by length (the
    reader's 450 unclosed `\textbf{` 58 ms a look, now 0.6; Clear All on 20 000 wrappers 0.5 s,
    now 20 ms); AutoCorrect's hooks skip LaTeX paragraphs; on a phone the Table Layout option
    goes with its tab; Shift+F10 or the menu key again gives the browser's menu, a long press the
    system's; two modules adding one method name throw (`joinMethods`). And the lows: Home whole
    at 860 px (the downloads one button there), the search box with no place writes nothing, Ask
    Claude only inside Claude, red and Red told apart, llms.txt in screen order, "bul" no longer
    finds Table, Ctrl+F1 from a field and none kept below 861 px, the folded ribbon kept over a
    reload and shown for a moment by a tab, the groups named, an `[option]` only for environments
    that take one, Page width on a phone, the row of tabs 28 px. Evidence: `npm test` green
    (`wrap` 21 groups, `preamble` 18, `blockenv` 10, `commands` 12), `tabs.py` 104, `ribbon.py`
    267, `browser.py` 189, `agent.py` 132, `word.py` 110, `share.py` 46, `history.py` 39/39,
    `offline.py` 54/54, `launch.py` 18/18, `deploy_check.py` 43/43, `pages_check.py` fits; the
    security audit's quick profile on the changed files (notes outside the repository) found
    three more stalls of the same kind, fixed above with tests.
43. **B5, Find, Replace, Go To and the outline, as in Word.** Done in the code (branch
    `wordgap-b5-find`, on task 38's frame; GAP rows H75 to H81, V4, V10, S1, C5). *Find*
    (Ctrl+F on the page, Home's Find): the side panel's Outline tab is now Word's Navigation
    pane, a box "Search document" over three views, Headings, Pages and Results. What is searched
    is the text the page shows (`src/find.js` reads each drawn block once, every character with
    its source range): 50% finds `\%`, a straight quote the curly quotes written with backquotes, a footnote's words
    are found, a formula, a command or a label never is; every hit is marked on the pages (CSS
    highlights), listed with its context, Enter and Shift+Enter step through them, Escape leaves
    the one shown selected. *Replace* (Ctrl+H) and *Advanced Find* open Word's dialog "Find and
    Replace" (Find, Replace, Go To), open beside the page: Match case, Find whole words only,
    Word's wildcards (? * @ {n,m} [a-z] [!a-z] < > and \1; case always matched, as in Word),
    regular expressions ($1), Format (bold, italic, underline, strikethrough, small caps,
    typewriter, highlight, colour, link, chapter, Heading 1 to 3, footnote text, caption, LaTeX
    paragraph; with nothing typed it finds the runs), Special (Word's ^ codes), In selection, In
    LaTeX source (the files' own text, commands and math included, the replacement as written).
    A replacement goes through the escaping typing uses (`App.escapeAt`, moved out of
    `insertText`), into the first character's place, so `\textbf{bold} text` found as "bold text"
    becomes `\textbf{new}`; each Replace is one undo, Replace All one undo for every hit; in a
    LaTeX paragraph it is written as source. The dialog moves off the hit it shows. *Go To*
    (Ctrl+G, and a click on the status bar's "Page x of y"): page, section (by number or words),
    footnote, equation, figure, table, comment, label (by key, offered in a list); +n and -n;
    Previous and Next. *Select* (Home): Select All, a paragraph, a sentence, text with similar
    formatting (every run with the caret's command marked and listed under Results). The status
    bar says "Page x of y" and, with a selection, "x of y words". *The outline:* Promote and
    Demote (Alt+Shift+Left and Right on a heading; Mac Control+Shift) rename the heading's
    command and every one under it, keeping `\section*` and `\section[short]` as written, never
    above `\section` in an article or `\chapter` in a book; Move up and Move down
    (Alt+Shift+Up and Down) move a heading's whole section past its neighbour of the same level, a
    paragraph past the block beside it, a list item past its neighbour, the space between kept,
    one undo (`src/outline.js`, on strings). A heading's right click menu has Promote, Demote,
    New heading before, New heading after, New subheading, Select heading and content. The
    Navigation pane's Headings is a tree (collapse and expand, Show levels, the toolbar
    "Outlining" acting on the row chosen, the arrows and Alt+Shift in it, a heading dragged onto
    another moving its section in one undo); Pages shows each page small (a copy, inert, made
    only for the thumbnails in sight); Results also lists figures, tables, equations, footnotes
    or comments (Search options). *Outline view* (View ▸ Outline, Ctrl+Alt+O): the panel wide,
    the paragraphs under their headings by their first line, movable as the headings are. *The
    frame:* `ribbonFit` is one rule for every tab and width (below), Home's Editing group folding
    first, into one icon button "Editing" whose menu has Find, Advanced Find, Go To, Replace and
    Select, and Find, Replace and Select are `fit` controls (shown as the row has room, as the
    gallery's tiles). Menus, the search box and tooltips write arrow keys as arrows (`chordText`:
    Alt+Shift+←); controls.json and llms.txt keep the names an agent presses. *For agents:* llms-full.txt says the keys, the
    dialog's and the pane's names; the Help dialog lists Ctrl+F, H, G, Alt+Shift and the arrows,
    Ctrl+Alt+O. *Security:* the audit skill's quick profile on the new files (one agent; notes
    outside the repository) found one way a stranger's document stalled the tab, fixed with a
    test: Go To ▸ Label searched for each `\label{`'s brace and comment again from its line's
    start (20 000 labels on one line, 0.7 s; quadratic) and sorted with a walk over every block;
    now one pass (`labelsIn`) and a binary search (`blockIndexOf`), 60 000 hostile labels in
    under a second. Evidence: `npm test` green with `find.test.mjs` (18 groups: patterns,
    wildcards, codes, groups, no hit across atoms, runs of a format, context, labels, a heading's
    command, promote and demote bounds, section ranges, swaps, moves, new headings, a stranger's
    long source); `find.py` 59 (with `dist/tex`: the replaced document compiles and prints
    "75% & more"); `outline.py` 47 (with `dist/tex`: a promoted heading prints as section 2);
    `agent.py` 138 (132 before: the dialog by its names, Escape, Ctrl+F's box); `tabs.py` 105 (104;
    the early fold); `ribbon.py` 267 (two of its checks now run where their premise holds: the
    Download label at 1600 px, the row's height where the gallery gives way to the list);
    `keys.test.mjs` 12 groups (11; chords as people read them);
    `browser.py` 189; `frontier.py` 13; `scripts.py` 302; `history.py` 39/39; `git.py` 44/44;
    `share.py` 46; `features.py` 36; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py`
    43/43; `pages_check.py` fits; actionlint clean; the model and parser untouched. Not done:
    collapsing a heading's text on the page itself (the page shows what TeX prints; collapse is
    the Navigation pane's), Word's ^p on the page's text (a hit stops at a paragraph's end: ^p
    says to tick In LaTeX source, where it is a blank line), finding by environment beyond footnote, caption and
    LaTeX paragraph, "Select text with similar formatting" as one multiple selection (Chromium
    has one range: the places are marked and listed instead), text a macro draws (shown, not
    found); Safari and Firefox, by hand.
    *Review* (a fresh hostile reader of fa621a4 and 054a1f2; every finding has the reader's case
    as a test). High: a query with a hyphen ("well-known") was an unreadable pattern (`\-` under
    the u flag): fixed; Replace and Replace All wrote at the places of a search the typing since
    had moved (`The cat sat.` became `doge cat sat.`): the search is brought up to date first, the
    shown hit followed through the edit, and a hit whose text changed is shown, not replaced;
    Move up or down of a paragraph past a heading ran it into the next paragraph: the single line
    break just outside becomes a blank line (`swapEdit`). Medium: a replacement across a `%`
    comment ran words together: each hit is edited as typing over it is (`deletionEdits` then
    `escapeAt`); a section or paragraph dropped below the last row went after the bibliography: it
    goes to the end of the last section; In selection kept a frozen range (two elephants of
    four): the selection is followed through each replacement and forgotten when the dialog opens
    with a caret; the fold rule (below); the Outline view drew every row again at each key (2.3 s
    for 18 characters in 250 kB): rows are keyed by block and only those whose text changed are
    written. Low: marks go with the pane; the shown result stays itself when text before it
    changes; Replace All skips a LaTeX paragraph where the replacement's `%`, `$`, `&` or braces
    would be LaTeX and says how many; Windows line breaks kept by moves; a paragraph of a proof of
    two is not moved out of it, one starting with `\noindent` moves with it; the selection's words
    are counted as the total is (no "55,380 of 55,200"); the dialog's Replace is "Replace one" to
    an agent (Replace stays the ribbon's); the Headings view is a tree with levels; the folded
    Editing menu has Advanced Find and Go To; ^p in LaTeX source; Replace steps in the list's
    order (a footnote's hit was skipped); wildcards bounded and a regular expression run per
    paragraph (no hit across a paragraph's end, `a*b` linear). Not done, as meant: a short title
    `\section[Short cat]{Long cat}` keeps its text (Find searches the page's text, which shows the
    long title; In LaTeX source finds and replaces both). *One fold rule*, shared with B1:
    everything open, then one step at a time while the row is too long, the cheapest loss first
    counted in controls (the Download label and the buttons' names, which take none; a gallery
    tile, down to three; the three downloads as one button; the style list for the gallery; then
    groups, rank 1 and then the lowest rank first, of equal ranks the rightmost, each one icon
    button named after it), then each step tried back, the last first, kept undone where the row
    fits. The names go before any group: they take no control away, so a group folded before them
    opened again at a narrower width once they went (the reader's case: with 21 commands on File
    all seven of its groups folded at once at 1366 px and were open at 1180), and below 861 px the
    list is not a step but the style sheet's. Home
    folds nothing at all from 1920 to 861 px (task 38 folded nothing to 1024 with no Editing
    group); the Download label goes below 1810 px and the names below 1750, the three downloads
    are one below 1140 px, the list takes the gallery's place below 1020 px; Editing folds from
    860 px; no group folds below 521 px (a phone's row scrolls). `test/tabs.py` sweeps 390 to 1920 px in 10 px steps on every tab with
    the real commands, the reader's (seven groups of three on File, Speech and Accessibility of
    four) and three more in every group: never fewer controls at a wider width (but 530 against
    520 px, where folding starts), the row fitting from 521 px, no group folded where it would fit
    open, the caret's moves measuring nothing. With three more in every group Home at 580 px shows
    more than at 590: Styles (rank 9, then four controls) folds there and Font (rank 5, six) opens
    again for its room; the rank, not the count, decides which goes first, and the test names
    that case. Also fixed on the way: the tiles measured while the ribbon was folded to its tabs
    (no width; they are measured again), a relayout while a ribbon menu was open (Select sentence
    selected nothing) or with words selected (the selection became a caret), and a line of
    40 000 `\begin{a` beside a move (10 s per check; now read in its last 200 characters).
    Evidence: `npm test` green (`find.test.mjs` 25 groups); `find.py` 76; `outline.py` 59;
    `tabs.py` 116; `ribbon.py` 268; `agent.py` 138; `browser.py` 189; `history.py` 39/39;
    `git.py` 44/44; `share.py` 46; `offline.py` 54/54; `launch.py` 18/18; `deploy_check.py` 43/43;
    `pages_check.py` fits; actionlint clean.

39. **B1, character formatting: Home's Font group as Word's.** Done in the code (branch
    `wordgap-b1-font`, from `ribbon-tabs`), GAP rows H4, H6 to H12, H15 to H19, H21, H22, H24 to
    H31 and A4 (H20 and H23 stay SKIP). *What it writes* (`src/charfmt.js`, pure, over
    `src/wrap.js`, which it does not change): Underline is ulem's `\uline` now, which breaks across
    lines, as Word import writes it (`\underline` by hand is still read and taken off), with its
    styles (`\uuline`, `\uwave`, `\dashuline`, `\dotuline`) and a colour (`\culine{red}`, ulem's
    line coloured, defined once); Strikethrough `\sout`, Double Strikethrough `\dsout` (two of
    `\sout`'s lines, one `\DeclareRobustCommand` line); Subscript and Superscript
    (`\textsubscript`, `\textsuperscript`, each turning the other in place); Small Caps, All Caps,
    Character Border (`\fbox`), Character Shading (`\colorbox{lightgray}`), Enclose Characters
    (`\textcircled`); Font Color `\textcolor{name}` or `[HTML]{..}` (Word's standard colours are
    dvipsnames: the option is merged into xcolor's line, or `\PassOptionsToPackage` goes before a
    tikz that loads xcolor, or beamer's class option; `{\color{red} ..}` by hand keeps its form);
    Text Highlight Color `\hl` and `\hl[green]` with the definition Word import writes, which takes
    a colour now (`\DeclareRobustCommand{\hl}[1][yellow]{...}`; the import's line of before is
    upgraded in place; a document's own `\hl` is never overwritten); the size box and Increase and
    Decrease Font Size: `{\large ..}` at the size's points, `{\fontsize{13}{15.6}\selectfont ..}`
    for any other, the switch gone at `\normalsize`; at a bare caret the document's base size (the
    class's option; extsizes' `extarticle` and its kin for 8, 9, 14, 17, 20pt, back to no option at
    10pt; KOMA's `fontsize=`; a class with sizes of its own is left and says so); the font box: the
    document's font as a package line in the place of the last one's (newtx, newpx, tgheros with
    `\familydefault`, XCharter, tgschola, tgbonum, kpfonts; Computer Modern takes them away) or
    fontspec's `\setmainfont`, and a selection's Serif, Sans Serif, Monospace or
    `{\fontfamily{ppl}\selectfont ..}` (`{\fontspec{..} ..}` under XeLaTeX and LuaLaTeX), only
    fonts the tree has; Change Case on the letters only (commands, keys, math, comments, a colour's
    name, `\href`'s address keep theirs; Shift+F3 in turn); Clear All Formatting (every format in
    and around the selection, those holding an end of it taken off that part, and a center,
    flushleft, flushright or setspace environment holding the paragraph alone; Ctrl+Space the
    characters only); the Font dialog (Ctrl+D: every field, a preview, its Advanced tab with
    `\textls`, `\scalebox{..}[1]`, `\raisebox`, microtype and `\DisableLigatures`; OK writes only
    what changed, as one commit; Set As Default gives the document the font and size); the
    Phonetic Guide (`\ruby{base}{reading}`: luatexja-ruby where luatexja is loaded, else a one line
    `\providecommand`); the Format Painter (the formats around the caret onto the next selection or
    the word clicked, a double click until Escape); `*words*` and `_words_` typed become `\textbf`
    and `\emph` (one undo gives the marks back). Each action is one commit and one undo; the
    preamble's lines are written once (`preambleFor`). *Where.* Home's Font group in Word's two
    rows of small buttons (one row on a phone), the Format Painter in Clipboard, More Font Effects
    for the rest; Font Settings in the right click menu. *Keys:* Ctrl+Shift+X, Ctrl+, and Ctrl+.
    (Google Docs' keys: Ctrl+= stays zoom), Ctrl+Shift+A and K, Ctrl+Alt+H (AltGr left alone),
    Ctrl+D, Ctrl+Shift+F, Ctrl+Shift+> and <, Ctrl+] and [ (not on a Mac), Shift+F3, Ctrl+Space (not
    on a Mac); in llms-full.txt and Help. *The page* draws all of it (`src/model.js`: ulem's lines,
    the double strike, an enclosed character, ruby, a run's size, family, tracking, shift and
    scale, the highlighter's colour exactly, dvipsnames as their values, extsizes' base sizes,
    the document's fonts by their looks; `paint` in `src/render.js` takes numbers and checked
    colours only). *Word:* each format a character style Word fills in (a highlighter's colour,
    double, wave, dashed and dotted underlines, double strike, caps, a border, sizes in half points,
    fonts, spacing, position, scale); Word import's highlighter takes a colour. *Frame changes*
    (`src/ribbon/tabs.js`, small): the boxes join the toolbar's arrow keys and keep the ribbon as
    it was while typed in; groups fold between a phone and 861 px too (the Font group's one row
    there left Home longer than the window); every ribbon button holds its screen reader name
    (`position: relative`: absolute names past a phone's edge widened the page by the row's
    length). The preamble's lines go through `usePackages` with the files the preamble reads
    (`App.preambleOthers`), as B0's review asked. B0's tests changed
    only where B1 changes what they saw: `\uline` for `\underline`, the Format Painter as Home's
    first control, the right click menu's Font Settings, and the widths at which the Styles
    gallery has room (six tiles with the insert buttons' names from 1800 px, the list below
    1280 px; at 1024 px Clipboard and Insert fold, at 860 px four groups). *Security* (the audit skill's quick profile on
    the changed files, notes outside the repository): a stranger's `\setmainfont{constructor}`
    stopped the page from drawing the document, and two patterns backtracked on a stranger's
    preamble (spaces after `\renewcommand`, an option list without its brace); fixed with tests,
    and Clear All over thousands of unclosed declarations bounded. Evidence: `npm test` green
    (new `font` 16 groups; `word` 57, two new), on main with B0's review fixes, `font.py` 175 (with `dist/tex`: a compile in the
    page of every format, extarticle 14pt and Times, no error, every word in the PDF),
    `tabs.py` 104, `ribbon.py` 267, `agent.py` 132, `browser.py` 189 (its math popover check
    failed twice under the machine's load and passed on the next two runs), `word.py` 110,
    `scripts.py` 302, `offline.py` 54/54, `launch.py` 18/18, `deploy_check.py` 43/43,
    `pages_check.py` fits, actionlint clean, the corpus model run 716 of 716 with the same unknown
    commands as before. Not done: Clear All Formatting's paragraph part covers alignment and
    setspace environments, not B2's other paragraph formats (it should call B2's reset once that
    exists); the Format Painter copies character formats, not a paragraph's style; an underline
    colour takes a named colour only; Word import keeps no highlighter colour (pandoc reads none);
    Safari and Firefox, by hand.

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
- Run the corpus before publishing. A merge to `main` deploys the hosted copy to Cloudflare
  Pages (`docs/HOSTING.md`); the copy on claude.ai is an artifact published from a Claude
  session (`tex/publish_batches.py` plans the uploads within its 256 MB); anywhere else, serve
  `dist/`.
